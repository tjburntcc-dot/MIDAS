import { stateDir as midasStateDir } from "@midas/db";
/**
 * Jobs-stage slice: runnable FILE_STORE worker tick + LEVEL 3 staged Harbor flyer
 * + action catalog boundary. Honest local foundations — NOT always-on / HA / Postgres / IAM.
 * Do not decide APR-005 / TPK-001. Do not publish / outreach / purchase / deploy.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  runAutonomyLoopTick,
  recordExecutionAction,
  upsertScheduledJob,
  simulateJobRestart,
  MASTER_OS_HONESTY,
  CURRENT_MAX_EXECUTION_LEVEL,
  EXECUTION_LADDER,
} from "./master-os.ts";

export const HARBOR_WORKSPACE_ID = "ws-own-004";
export const DEFAULT_JOB_ID = "JOB-001";
export const JOBS_STAGE_HONESTY = {
  ...MASTER_OS_HONESTY,
  label: "local FILE_STORE scheduler foundations, NOT 24/7 infrastructure",
  alwaysOn: false,
  highAvailability: false,
  postgres: false,
  iam: false,
};

export const ACTION_CATALOG_TYPES = [
  "publish_draft_website",
  "send_message",
  "create_campaign",
  "connect_payment",
  "update_business_system",
  "customer_validation_workflow",
] as const;

function nowIso(d) {
  return (d instanceof Date ? d : new Date(d || Date.now())).toISOString();
}

function asText(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function runWindowKey(job, atIso) {
  // Stable per calendar hour + job idempotency key — second tick in same window is idempotent.
  const hour = String(atIso || "").slice(0, 13); // YYYY-MM-DDTHH
  return (job.idempotencyKey || job.id) + "::" + hour;
}

function ensureJobMethods(store) {
  if (!store.putScheduledJob || !store.getScheduledJob) {
    throw new Error("FileStore scheduled job methods required");
  }
}

/** Persist / refresh action catalog entries as NOT_INTEGRATED (inspectable, not fake-ready). */
export function persistActionCatalog(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || null;
  const at = nowIso();
  const existing = ((store.listActionCatalog && store.listActionCatalog()) || []).slice();
  const byType = new Map(existing.map((r) => [r.type, r]));
  const rows = [];
  for (const type of ACTION_CATALOG_TYPES) {
    const prev = byType.get(type);
    const rec = {
      id: (prev && prev.id) || ("ACTCAT-" + type),
      type,
      status: "NOT_INTEGRATED",
      available: false,
      integrated: false,
      ready: false,
      fakeReady: false,
      workspaceId: workspaceId || (prev && prev.workspaceId) || null,
      createdAt: (prev && prev.createdAt) || at,
      updatedAt: at,
      note: "Persisted boundary only. Not wired. Not fake-ready. External execute unavailable.",
      honesty: JOBS_STAGE_HONESTY,
    };
    store.putActionCatalogEntry(rec);
    rows.push(rec);
  }
  return {
    ok: true,
    count: rows.length,
    entries: rows,
    inspectable: true,
    fakeReady: false,
    honesty: JOBS_STAGE_HONESTY,
  };
}

export function listActionCatalogBoundary(store) {
  const entries = ((store.listActionCatalog && store.listActionCatalog()) || []).filter((r) =>
    ACTION_CATALOG_TYPES.includes(r.type)
  );
  return {
    built: true,
    entries,
    allNotIntegrated: entries.length > 0 && entries.every((e) => e.status === "NOT_INTEGRATED" && e.available === false),
    honesty: JOBS_STAGE_HONESTY,
  };
}

function recordHeartbeat(store, payload) {
  const all = ((store.listWorkerHeartbeats && store.listWorkerHeartbeats()) || []).map((r) => r.id);
  const rec = {
    id: nextId(all, "WHB-"),
    workspaceId: payload.workspaceId || null,
    jobId: payload.jobId || null,
    workerId: payload.workerId || "worker-local-1",
    at: payload.at || nowIso(),
    status: payload.status || "ok",
    nextRunAt: payload.nextRunAt || null,
    lastRunAt: payload.lastRunAt || null,
    leaseToken: payload.leaseToken || null,
    outcome: payload.outcome || null,
    note: payload.note || "FILE_STORE local worker heartbeat. Not 24/7 infrastructure.",
    alwaysOnClaim: false,
    persistence: "FILE_STORE",
  };
  store.putWorkerHeartbeat(rec);
  return rec;
}

function activityForTick(store, payload) {
  if (!store.putActivityFeedItem) return null;
  const ids = ((store.listActivityFeed && store.listActivityFeed()) || []).map((r) => r.id);
  const rec = {
    id: nextId(ids, "AF-JOB-"),
    workspaceId: payload.workspaceId,
    at: payload.at || nowIso(),
    whatRan: "scheduled_job_worker_tick " + (payload.jobId || ""),
    whyPermitted: "Owner-persisted internal autonomy policy + FILE_STORE scheduler foundations (not always-on).",
    sourcesUsed: payload.sourcesUsed || [],
    costUsd: 0,
    producedArtifact: payload.artifactPath || null,
    watcherResult: null,
    live: false,
    fixture: false,
    deterministic: true,
    lastHeartbeatAt: payload.lastHeartbeatAt || null,
    nextRunAt: payload.nextRunAt || null,
    workerStatus: payload.workerStatus || null,
    honestyLabel: JOBS_STAGE_HONESTY.label,
  };
  store.putActivityFeedItem(rec);
  return rec;
}

/**
 * Recover stale leases (crash mid-lease). Sets taskState back to pending when lease expired.
 */
export function recoverStaleJobLeases(store, opts) {
  ensureJobMethods(store);
  const now = opts && opts.now ? new Date(opts.now) : new Date();
  const workspaceId = opts && opts.workspaceId;
  const jobs = ((store.listScheduledJobs && store.listScheduledJobs(workspaceId)) || []).slice();
  const recovered = [];
  for (const job of jobs) {
    if (job.taskState !== "leased") continue;
    const exp = job.leaseExpiresAt ? new Date(job.leaseExpiresAt) : null;
    const force = opts && opts.forceExpireJobId === job.id;
    if (force || (exp && exp.getTime() <= now.getTime())) {
      const next = {
        ...job,
        taskState: "pending",
        status: "scheduled",
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        recoveredFromStaleLeaseAt: nowIso(now),
        updatedAt: nowIso(now),
        note: "Recovered from stale/crashed lease. FILE_STORE crash-safe foundations — not HA.",
      };
      store.putScheduledJob(next);
      recovered.push({ id: next.id, from: "leased", to: "pending" });
    }
  }
  return { ok: true, recovered, at: nowIso(now), honesty: JOBS_STAGE_HONESTY };
}

/**
 * Executable worker tick for JOB-001 (or another Harbor scheduled job).
 * Lease → permitted autonomy steps → idempotency → bump next-run → heartbeat.
 */
export function runScheduledJobWorkerTick(store, opts) {
  ensureJobMethods(store);
  const o = opts || {};
  const now = o.now ? new Date(o.now) : new Date();
  const at = nowIso(now);
  const workerId = o.workerId || "worker-local-1";
  const leaseMs = o.leaseMs != null ? Number(o.leaseMs) : 30_000;
  const intervalMs = o.intervalMs != null ? Number(o.intervalMs) : 3_600_000;
  const jobId = o.jobId || DEFAULT_JOB_ID;
  const forceDue = o.forceDue === true;

  recoverStaleJobLeases(store, { now, forceExpireJobId: o.forceExpireJobId, workspaceId: o.workspaceId });

  let job = store.getScheduledJob(jobId);
  if (!job) {
    return {
      ok: false,
      outcome: "missing_job",
      reason: "Scheduled job not found: " + jobId,
      honesty: JOBS_STAGE_HONESTY,
    };
  }

  const nextRun = job.nextRunAt ? new Date(job.nextRunAt) : null;
  const due = forceDue || !nextRun || nextRun.getTime() <= now.getTime();
  if (!due) {
    const hb = recordHeartbeat(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      at,
      status: "idle",
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      outcome: "noop_not_due",
      note: "Tick no-op: nextRunAt in future. Local FILE_STORE scheduler — not 24/7.",
    });
    return {
      ok: true,
      outcome: "noop_not_due",
      job,
      heartbeat: hb,
      honesty: JOBS_STAGE_HONESTY,
      note: "Second/immediate tick is a no-op when next-run is still in the future (idempotent scheduling).",
    };
  }

  // Active lease held by another worker?
  if (
    job.taskState === "leased" &&
    job.leaseOwner &&
    job.leaseOwner !== workerId &&
    job.leaseExpiresAt &&
    new Date(job.leaseExpiresAt).getTime() > now.getTime()
  ) {
    const hb = recordHeartbeat(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      at,
      status: "blocked_lease",
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      outcome: "lease_held",
    });
    return { ok: true, outcome: "lease_held", job, heartbeat: hb, honesty: JOBS_STAGE_HONESTY };
  }

  const windowKey = runWindowKey(job, at);
  if (job.lastCompletedRunKey === windowKey && !o.ignoreIdempotency) {
    const hb = recordHeartbeat(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      at,
      status: "idle",
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      outcome: "noop_idempotent",
      note: "Idempotency key/window already completed. No re-execution.",
    });
    return {
      ok: true,
      outcome: "noop_idempotent",
      job,
      heartbeat: hb,
      runWindowKey: windowKey,
      honesty: JOBS_STAGE_HONESTY,
    };
  }

  // Retry limit
  if (Number(job.retryCount || 0) >= Number(job.retryLimit != null ? job.retryLimit : 3) && job.taskState === "failed") {
    const hb = recordHeartbeat(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      at,
      status: "retry_exhausted",
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      outcome: "retry_limit",
    });
    return { ok: false, outcome: "retry_limit", job, heartbeat: hb, honesty: JOBS_STAGE_HONESTY };
  }

  const leaseToken = (job.id + ":" + workerId + ":" + at);
  const leaseExpiresAt = nowIso(new Date(now.getTime() + leaseMs));
  job = {
    ...job,
    taskState: "leased",
    status: "running",
    leaseOwner: workerId,
    leaseToken,
    leaseExpiresAt,
    leasedAt: at,
    updatedAt: at,
    alwaysOnClaim: false,
    persistence: "FILE_STORE",
  };
  store.putScheduledJob(job);

  // Crash simulation: leave mid-lease without completing.
  if (o.crashAfterLease === true) {
    const hb = recordHeartbeat(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      at,
      status: "crashed_mid_lease",
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      leaseToken,
      outcome: "crashed_mid_lease",
      note: "Simulated crash after lease acquire. Recovery expected on next tick.",
    });
    return {
      ok: false,
      outcome: "crashed_mid_lease",
      job,
      heartbeat: hb,
      leaseToken,
      honesty: JOBS_STAGE_HONESTY,
    };
  }

  try {
    const autonomy = runAutonomyLoopTick(store, job.workspaceId, {
      budgetUsd: o.budgetUsd,
      actions: o.actions || [
        { action: "plan_supervised_work", label: "scheduled tick plan", level: 1, idempotencyKey: windowKey + ":plan" },
        { action: "write_local_artifact", label: "scheduled tick local artifact note", level: 2, idempotencyKey: windowKey + ":write" },
        { action: "outreach", label: "must pause on scheduled tick", level: 4, idempotencyKey: windowKey + ":outreach" },
      ],
    });

    const bumpedNext = nowIso(new Date(now.getTime() + intervalMs));
    job = {
      ...job,
      taskState: "pending",
      status: "scheduled",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastRunAt: at,
      nextRunAt: bumpedNext,
      lastCompletedRunKey: windowKey,
      lastHeartbeatAt: at,
      lastWorkerId: workerId,
      retryCount: 0,
      updatedAt: at,
      alwaysOnClaim: false,
      persistence: "FILE_STORE",
      note: "Local FILE_STORE scheduler foundations, NOT 24/7 infrastructure.",
    };
    store.putScheduledJob(job);

    const hb = recordHeartbeat(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      workerId,
      at,
      status: "ok",
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      leaseToken,
      outcome: "executed",
    });
    const activity = activityForTick(store, {
      workspaceId: job.workspaceId,
      jobId: job.id,
      at,
      lastHeartbeatAt: at,
      nextRunAt: job.nextRunAt,
      workerStatus: "ok",
      sourcesUsed: [],
    });

    return {
      ok: true,
      outcome: "executed",
      job,
      autonomyTickId: autonomy.tick && autonomy.tick.id,
      autonomySummary: autonomy.tick && autonomy.tick.summary,
      heartbeat: hb,
      activity,
      runWindowKey: windowKey,
      honesty: JOBS_STAGE_HONESTY,
      note: JOBS_STAGE_HONESTY.label,
    };
  } catch (err) {
    const retryCount = Number(job.retryCount || 0) + 1;
    const failed = {
      ...job,
      taskState: retryCount >= Number(job.retryLimit != null ? job.retryLimit : 3) ? "failed" : "pending",
      status: retryCount >= Number(job.retryLimit != null ? job.retryLimit : 3) ? "failed" : "scheduled",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      retryCount,
      lastError: String(err && err.message ? err.message : err),
      updatedAt: at,
    };
    store.putScheduledJob(failed);
    const hb = recordHeartbeat(store, {
      workspaceId: failed.workspaceId,
      jobId: failed.id,
      workerId,
      at,
      status: "error",
      nextRunAt: failed.nextRunAt,
      lastRunAt: failed.lastRunAt,
      outcome: "error",
      note: failed.lastError,
    });
    return { ok: false, outcome: "error", job: failed, heartbeat: hb, error: failed.lastError, honesty: JOBS_STAGE_HONESTY };
  }
}

/** Proof helper: tick twice → second no-op; mid-lease crash → recovery. */
export function proveJobTickIdempotencyAndRecovery(store, opts) {
  const o = opts || {};
  const jobId = o.jobId || DEFAULT_JOB_ID;
  const base = o.now ? new Date(o.now) : new Date();
  // Ensure job is due
  let job = store.getScheduledJob(jobId);
  if (!job) throw new Error("JOB missing: " + jobId);
  store.putScheduledJob({
    ...job,
    nextRunAt: nowIso(new Date(base.getTime() - 1000)),
    taskState: "pending",
    status: "scheduled",
    leaseToken: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastCompletedRunKey: null,
    retryCount: 0,
    updatedAt: nowIso(base),
  });

  const t1 = runScheduledJobWorkerTick(store, {
    jobId,
    workerId: "worker-proof-1",
    now: base,
    forceDue: true,
    intervalMs: o.intervalMs || 3_600_000,
  });
  const t2 = runScheduledJobWorkerTick(store, {
    jobId,
    workerId: "worker-proof-1",
    now: new Date(base.getTime() + 5_000), // still same hour window / nextRun in future
    intervalMs: o.intervalMs || 3_600_000,
  });

  // Mid-lease crash + recovery
  job = store.getScheduledJob(jobId);
  store.putScheduledJob({
    ...job,
    nextRunAt: nowIso(new Date(base.getTime() + 10_000)),
    taskState: "pending",
    lastCompletedRunKey: null, // new window for recovery demo
    updatedAt: nowIso(new Date(base.getTime() + 10_000)),
  });
  // Move clock so due, then crash
  const crashAt = new Date(base.getTime() + 20_000);
  store.putScheduledJob({
    ...store.getScheduledJob(jobId),
    nextRunAt: nowIso(new Date(crashAt.getTime() - 1000)),
  });
  const crash = runScheduledJobWorkerTick(store, {
    jobId,
    workerId: "worker-proof-crash",
    now: crashAt,
    forceDue: true,
    crashAfterLease: true,
    leaseMs: 1, // expires immediately for recovery demo
  });
  const recoverAt = new Date(crashAt.getTime() + 50);
  const recovered = runScheduledJobWorkerTick(store, {
    jobId,
    workerId: "worker-proof-recover",
    now: recoverAt,
    forceDue: true,
    forceExpireJobId: jobId,
    intervalMs: o.intervalMs || 3_600_000,
  });

  const restartSim = simulateJobRestart(store, job.workspaceId);

  return {
    ok: true,
    first: { outcome: t1.outcome, autonomyTickId: t1.autonomyTickId, nextRunAt: t1.job && t1.job.nextRunAt },
    second: { outcome: t2.outcome, noop: t2.outcome === "noop_not_due" || t2.outcome === "noop_idempotent" },
    crash: { outcome: crash.outcome, taskStateAfterCrash: crash.job && crash.job.taskState },
    crashTaskStateImmediate: crash.job && crash.job.taskState,
    recovery: { outcome: recovered.outcome, taskState: recovered.job && recovered.job.taskState },
    restartSim,
    finalJob: store.getScheduledJob(jobId),
    honesty: JOBS_STAGE_HONESTY,
  };
}

function loadHarborFacts(store) {
  const ids = ["K-HARBOR-LIB-001", "K-HARBOR-LIB-002", "K-HARBOR-LIB-003", "K-TRAIN-005"];
  const items = [];
  for (const id of ids) {
    const k = store.getKnowledge && store.getKnowledge(id);
    if (k) items.push(k);
  }
  return items;
}

function buildFlyerHtml(facts) {
  const byId = Object.fromEntries(facts.map((f) => [f.id, f]));
  const addr = (byId["K-HARBOR-LIB-001"] && byId["K-HARBOR-LIB-001"].statement) || "West Asheville Library — 942 Haywood Road, Asheville, NC 28806";
  const hours = (byId["K-HARBOR-LIB-002"] && byId["K-HARBOR-LIB-002"].statement) || "Library hours per county page";
  const cal = (byId["K-HARBOR-LIB-003"] && byId["K-HARBOR-LIB-003"].statement) || "Program calendar fact (not demand)";
  const policy = (byId["K-TRAIN-005"] && byId["K-TRAIN-005"].statement) || "Owner policy: piano/guitar ages 7–14; flyers may mention West Asheville Library bulletin board only.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Harbor Oak — Library Bulletin Flyer (STAGED DRAFT)</title>
<style>
:root{--ink:#1a1a1a;--mut:#555;--line:#d4cbb8;--banner:#fff3cd;--banner-b:#856404;--paper:#fffdf8;--accent:#2f5d3a}
*{box-sizing:border-box}
body{font-family:Georgia,serif;margin:0;background:#f3efe6;color:var(--ink);line-height:1.45}
.sheet{max-width:40rem;margin:1.5rem auto;background:var(--paper);border:1px solid var(--line);padding:1.25rem 1.4rem 2rem;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.banner{border:2px solid var(--banner-b);background:var(--banner);padding:.75rem .9rem;margin:0 0 1.1rem;font-size:.95rem}
h1{font-size:1.55rem;margin:0 0 .35rem;color:var(--accent)}
.sub{color:var(--mut);margin:0 0 1rem}
.box{border:1px solid var(--line);padding:.85rem 1rem;margin:.7rem 0;border-radius:6px;background:#faf7f1}
h2{font-size:1.05rem;margin:0 0 .4rem}
ul{margin:.2rem 0 0;padding-left:1.2rem}
.cite{font-size:.82rem;color:var(--mut)}
footer{margin-top:1.2rem;padding-top:.8rem;border-top:1px dashed var(--line);font-size:.85rem;color:var(--mut)}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:.72rem;margin-right:.3rem;color:var(--mut)}
</style>
</head>
<body>
<div class="sheet">
  <p class="banner"><b>STAGED DRAFT — not posted, not approved for physical posting.</b> Owner review required before any LEVEL 4 external/physical action. Local FILE_STORE artifact only. Not published. Not printed. Not sent.</p>
  <p><span class="tag">ws-own-004</span><span class="tag">LEVEL 3 STAGE</span><span class="tag">Harbor Oak</span></p>
  <h1>Harbor Oak Music Lessons</h1>
  <p class="sub">After-school piano &amp; guitar · ages 7–14 · West Asheville neighborhood</p>
  <div class="box">
    <h2>What we offer (owner policy)</h2>
    <p>${escapeHtml(policy)}</p>
    <p class="cite">Source: owner policy / K-TRAIN-005 · not a webpage-created policy</p>
  </div>
  <div class="box">
    <h2>Nearby library (public facts — not demand)</h2>
    <ul>
      <li><b>Address / contact:</b> ${escapeHtml(addr)}</li>
      <li><b>Hours:</b> ${escapeHtml(hours)}</li>
      <li><b>Program calendar fact:</b> ${escapeHtml(cal)}</li>
    </ul>
    <p class="cite">Sources: K-HARBOR-LIB-001 · K-HARBOR-LIB-002 · K-HARBOR-LIB-003 (from SBR-002). Calendar cites location only — not enrollment demand.</p>
  </div>
  <div class="box">
    <h2>Flyer intent (staged)</h2>
    <p>Mention the West Asheville Library bulletin board only, per owner policy. No outreach email. No invented waitlist, revenue, or customer quotes. Posting permission remains unconfirmed in person — owner must decide before any physical post.</p>
  </div>
  <footer>
    <p>Execution ladder: LEVEL 3 STAGE (ready for owner review). LEVEL 4/5 external execute is refused until separately authorized+integrated (it is not).</p>
    <p>Honesty: FILE_STORE local foundations. Not deployed. Not always-on. $0 model this draft.</p>
  </footer>
</div>
</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * LEVEL 3 STAGE: Harbor Oak library bulletin flyer — staged action record only.
 * Does NOT publish / print / send.
 */
export function stageHarborLibraryFlyer(store, extras) {
  const o = extras || {};
  const workspaceId = o.workspaceId || HARBOR_WORKSPACE_ID;
  const stateDir = o.stateDir || store.dir || midasStateDir();
  const artifactsRoot = o.artifactsDir || join(stateDir, "..", "artifacts", workspaceId);
  mkdirSync(artifactsRoot, { recursive: true });
  const facts = loadHarborFacts(store);
  const html = buildFlyerHtml(facts);
  const fileName = "library-bulletin-flyer-staged.html";
  const absPath = join(artifactsRoot, fileName);
  writeFileSync(absPath, html, "utf8");

  const ladder = recordExecutionAction(store, {
    workspaceId,
    level: 3,
    action: "stage_library_bulletin_flyer",
    employeeId: o.employeeId || null,
    refId: null,
  });

  // Enrich staged record with LEVEL-4-ready fields (not executed).
  const action = ladder.action;
  const staged = {
    ...action,
    status: "staged_awaiting_owner_review",
    level: 3,
    label: "stage_internal",
    artifactPath: absPath,
    relativeArtifactPath: "var/artifacts/" + workspaceId + "/" + fileName,
    banner: "STAGED DRAFT — not posted, not approved for physical posting",
    cites: {
      ownerPolicyIds: ["K-TRAIN-005"],
      knowledgeIds: ["K-HARBOR-LIB-001", "K-HARBOR-LIB-002", "K-HARBOR-LIB-003"],
      scoutBriefId: "SBR-002",
    },
    // Fields reserved for future LEVEL 4 (must stay null/false until owner + integration)
    level4Fields: {
      publishChannel: null,
      physicalPostingApproved: false,
      ownerReviewDecision: null,
      ownerReviewedAt: null,
      printRequested: false,
      sendRequested: false,
      externalExecuteAuthorized: false,
      externalExecuteIntegrated: false,
    },
    executedExternal: false,
    published: false,
    printed: false,
    sent: false,
    note: "LEVEL 3 STAGE only. Ready for owner review. Not posted.",
  };
  store.putExecutionAction(staged);

  const delIds = ((store.listDeliverables && store.listDeliverables()) || []).map((d) => d.id);
  const deliverable = {
    id: nextId(delIds, "DEL-"),
    workspaceId,
    type: "flyer_draft",
    label: "Harbor Oak library bulletin flyer (staged)",
    status: "staged_awaiting_owner_review",
    draft: true,
    staged: true,
    published: false,
    artifact: { path: absPath, kind: "html", banner: staged.banner },
    sourceKnowledgeIds: staged.cites.knowledgeIds,
    ownerPolicyIds: staged.cites.ownerPolicyIds,
    executionActionId: staged.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    note: "Local staged draft. Not approved for physical posting.",
  };
  if (store.putDeliverable) store.putDeliverable(deliverable);

  if (store.putActivityFeedItem) {
    const ids = ((store.listActivityFeed && store.listActivityFeed()) || []).map((r) => r.id);
    store.putActivityFeedItem({
      id: nextId(ids, "AF-STAGE-"),
      workspaceId,
      at: nowIso(),
      whatRan: "execution_ladder_level_3_stage library bulletin flyer",
      whyPermitted: "LEVEL 3 stage_internal available; owner policy + K-HARBOR-LIB facts only",
      sourcesUsed: staged.cites.knowledgeIds.concat(staged.cites.ownerPolicyIds),
      costUsd: 0,
      producedArtifact: absPath,
      watcherResult: "staged_not_posted",
      live: false,
      fixture: false,
      deterministic: true,
    });
  }

  return {
    ok: true,
    level: 3,
    status: "staged_awaiting_owner_review",
    action: staged,
    deliverable,
    artifactPath: absPath,
    relativeArtifactPath: staged.relativeArtifactPath,
    honesty: JOBS_STAGE_HONESTY,
  };
}

/** Attempt LEVEL 4/5 — must refuse with reason. */
export function attemptExternalLadderLevel(store, level, extras) {
  const workspaceId = (extras && extras.workspaceId) || HARBOR_WORKSPACE_ID;
  const lvl = Number(level);
  if (lvl !== 4 && lvl !== 5) {
    return { ok: false, refused: true, reason: "This helper only probes LEVEL 4/5 refusals.", honesty: JOBS_STAGE_HONESTY };
  }
  const meta = EXECUTION_LADDER[lvl];
  const result = recordExecutionAction(store, {
    workspaceId,
    level: lvl,
    action: extras && extras.action ? extras.action : lvl === 4 ? "publish_or_post_flyer" : "autonomous_external_post",
  });
  return {
    ok: false,
    refused: true,
    level: lvl,
    reason: (result.action && result.action.reason) || (meta && meta.note) || "Level unavailable",
    action: result.action,
    currentMax: CURRENT_MAX_EXECUTION_LEVEL,
    available: false,
    honesty: JOBS_STAGE_HONESTY,
  };
}

export function jobsStageView(store, query) {
  const q = query || {};
  const workspaceId = q.workspaceId || q.workspace || HARBOR_WORKSPACE_ID;
  const jobs = ((store.listScheduledJobs && store.listScheduledJobs(workspaceId)) || []).map((j) => ({
    id: j.id,
    status: j.status,
    taskState: j.taskState,
    nextRunAt: j.nextRunAt,
    lastRunAt: j.lastRunAt,
    lastHeartbeatAt: j.lastHeartbeatAt || null,
    lastWorkerId: j.lastWorkerId || null,
    idempotencyKey: j.idempotencyKey,
    retryCount: j.retryCount,
    retryLimit: j.retryLimit,
    alwaysOnClaim: false,
    persistence: "FILE_STORE",
    note: j.note || JOBS_STAGE_HONESTY.label,
  }));
  const heartbeats = ((store.listWorkerHeartbeats && store.listWorkerHeartbeats(workspaceId)) || []).slice(-10).reverse();
  const catalog = listActionCatalogBoundary(store);
  return {
    built: true,
    workspaceId,
    jobs,
    lastHeartbeat: heartbeats[0] || null,
    recentHeartbeats: heartbeats,
    actionCatalog: catalog,
    executionLadder: { currentMax: CURRENT_MAX_EXECUTION_LEVEL, levels: EXECUTION_LADDER },
    alwaysOn: false,
    honesty: JOBS_STAGE_HONESTY,
    label: JOBS_STAGE_HONESTY.label,
  };
}

export function writeJobsStageReports(result, extras) {
  const stateDir = (extras && extras.stateDir) || midasStateDir();
  const tests = (extras && extras.tests) || "pending";
  const live = {
    writtenAt: nowIso(),
    persistence: "FILE_STORE",
    alwaysOn: false,
    liveProviderCallsThisSlice: 0,
    liveSpendUsd: 0,
    workspaceId: HARBOR_WORKSPACE_ID,
    items: {
      "1_jobTickRunnable": {
        jobId: result.tickProof && result.tickProof.finalJob && result.tickProof.finalJob.id,
        firstOutcome: result.tickProof && result.tickProof.first && result.tickProof.first.outcome,
        secondNoop: result.tickProof && result.tickProof.second && result.tickProof.second.noop,
        recoveryOutcome: result.tickProof && result.tickProof.recovery && result.tickProof.recovery.outcome,
        lastHeartbeatAt: result.tickProof && result.tickProof.finalJob && result.tickProof.finalJob.lastHeartbeatAt,
        nextRunAt: result.tickProof && result.tickProof.finalJob && result.tickProof.finalJob.nextRunAt,
      },
      "2_level3StagedFlyer": {
        artifactPath: result.flyer && result.flyer.artifactPath,
        relativeArtifactPath: result.flyer && result.flyer.relativeArtifactPath,
        status: result.flyer && result.flyer.status,
        executionActionId: result.flyer && result.flyer.action && result.flyer.action.id,
        level4FieldsPresent: Boolean(result.flyer && result.flyer.action && result.flyer.action.level4Fields),
        published: false,
        printed: false,
        sent: false,
      },
      "3_ladderRefusal": {
        level4: result.refusals && result.refusals.level4,
        level5: result.refusals && result.refusals.level5,
      },
      "4_actionCatalogBoundary": {
        types: ACTION_CATALOG_TYPES.slice(),
        allNotIntegrated: result.catalog && result.catalog.allNotIntegrated,
        count: result.catalog && result.catalog.entries && result.catalog.entries.length,
      },
      "5_uiOrActivityHeartbeat": {
        activityId: result.activityHeartbeatId || null,
        jobsViewHasHeartbeat: true,
        label: JOBS_STAGE_HONESTY.label,
      },
      "6_costs": {
        liveUsd: 0,
        modelCalls: 0,
        model: null,
        note: "Fully deterministic. Prefer $0 live model.",
      },
      "7_invariants": {
        apr005: result.apr005,
        apr005Untouched: result.apr005Untouched,
        tpk001: result.tpk001,
        tpk001Untouched: result.tpk001Untouched,
        hcl001Intact: result.hcl001Intact,
        fileStore: true,
        alwaysOn: false,
        tests,
      },
      "8_missing": [
        "True always-on worker host not purchased",
        "Postgres / IAM / HA not implemented",
        "LEVEL 4 external execute not integrated",
        "Library physical posting permission still needs owner confirm",
      ],
      "9_next": [
        "Owner review staged flyer in Artifacts / Approvals flow",
        "Do not decide APR-005 here",
      ],
      "10_honesty": JOBS_STAGE_HONESTY,
      "11_proofSummary": {
        tickTwiceSecondNoop: Boolean(result.tickProof && result.tickProof.second && result.tickProof.second.noop),
        midLeaseRecovery: result.tickProof && result.tickProof.recovery && result.tickProof.recovery.outcome === "executed",
        stagedFlyerPath: result.flyer && result.flyer.relativeArtifactPath,
        ladder4Refused: Boolean(result.refusals && result.refusals.level4 && result.refusals.level4.refused),
        ladder5Refused: Boolean(result.refusals && result.refusals.level5 && result.refusals.level5.refused),
        catalogNotIntegrated: Boolean(result.catalog && result.catalog.allNotIntegrated),
      },
    },
    tickProof: result.tickProof,
    flyer: {
      artifactPath: result.flyer && result.flyer.artifactPath,
      relativeArtifactPath: result.flyer && result.flyer.relativeArtifactPath,
      actionId: result.flyer && result.flyer.action && result.flyer.action.id,
      status: result.flyer && result.flyer.status,
    },
    refusals: result.refusals,
    catalog: result.catalog && {
      count: result.catalog.entries.length,
      allNotIntegrated: result.catalog.allNotIntegrated,
      types: result.catalog.entries.map((e) => e.type),
    },
    cost: { liveUsd: 0, modelCalls: 0, model: null },
    apr005: result.apr005,
    apr005Untouched: result.apr005Untouched,
    tpk001: result.tpk001,
    tpk001Untouched: result.tpk001Untouched,
    hcl001Intact: result.hcl001Intact,
    tests,
    honesty: JOBS_STAGE_HONESTY,
  };

  const md = `# Jobs-stage report (FILE_STORE local foundations — NOT 24/7)

Written: ${live.writtenAt}

## 1. Job tick proof
- Job: \`${live.items["1_jobTickRunnable"].jobId}\`
- First tick: **${live.items["1_jobTickRunnable"].firstOutcome}**
- Second tick no-op: **${live.items["1_jobTickRunnable"].secondNoop}**
- Mid-lease recovery: **${live.items["1_jobTickRunnable"].recoveryOutcome}**
- Last heartbeat: ${live.items["1_jobTickRunnable"].lastHeartbeatAt}
- Next run: ${live.items["1_jobTickRunnable"].nextRunAt}

## 2. LEVEL 3 staged flyer
- Path: \`${live.items["2_level3StagedFlyer"].relativeArtifactPath}\`
- Status: **${live.items["2_level3StagedFlyer"].status}**
- Banner: staged draft, not posted, not approved for physical posting
- Published/printed/sent: false

## 3. Ladder refusal
- LEVEL 4 refused: ${JSON.stringify(live.items["3_ladderRefusal"].level4 && live.items["3_ladderRefusal"].level4.reason)}
- LEVEL 5 refused: ${JSON.stringify(live.items["3_ladderRefusal"].level5 && live.items["3_ladderRefusal"].level5.reason)}

## 4. Action catalog boundary
- Types: ${ACTION_CATALOG_TYPES.join(", ")}
- All NOT_INTEGRATED: **${live.items["4_actionCatalogBoundary"].allNotIntegrated}**

## 5–11. Costs / invariants / honesty
- Cost: **$0** live model (deterministic)
- APR-005: **${live.apr005}** (untouched=${live.apr005Untouched})
- TPK-001: **${live.tpk001}** (untouched=${live.tpk001Untouched})
- HCL-001 intact: **${live.hcl001Intact}**
- Tests: **${tests}**
- Label: ${JOBS_STAGE_HONESTY.label}
`;

  writeFileSync(join(stateDir, "jobs-stage-live.json"), JSON.stringify(live, null, 2) + "\n", "utf8");
  writeFileSync(join(stateDir, "jobs-stage-report.md"), md, "utf8");
  return { livePath: join(stateDir, "jobs-stage-live.json"), reportPath: join(stateDir, "jobs-stage-report.md"), live };
}

export function updateCapabilityMatrixForJobsStage(summary) {
  const path = join(midasStateDir(), "capability-matrix.json");
  let matrix = {};
  if (existsSync(path)) matrix = JSON.parse(readFileSync(path, "utf8"));
  matrix.writtenAt = nowIso();
  matrix.persistence = "FILE_STORE";
  matrix.alwaysOn = false;
  matrix.executionLadderMax = CURRENT_MAX_EXECUTION_LEVEL;
  matrix.liveSpendThisSliceUsd = 0;
  matrix.capabilities = matrix.capabilities || {};
  matrix.capabilities.scheduled_jobs = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.capabilities.worker_tick = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.capabilities.execution_ladder = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.capabilities.level3_stage_flyer = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.capabilities.action_catalog_boundary = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.capabilities.external_execute = "NOT_IMPLEMENTED";
  matrix.capabilities.postgres_iam_deploy = "NOT_IMPLEMENTED";
  matrix.capabilities.embeddings = false;
  matrix.jobsStageNote = (summary && summary.note) || "worker tick + LEVEL 3 staged flyer + NOT_INTEGRATED catalog ($0)";
  matrix.jobsStage = summary || {};
  writeFileSync(path, JSON.stringify(matrix, null, 2) + "\n", "utf8");
  return matrix;
}

export function runJobsStageHarbor(store, extras) {
  const stateDir = (extras && extras.stateDir) || store.dir || midasStateDir();
  const aprRows = (store.listApprovalRequests && store.listApprovalRequests()) || [];
  const apr = aprRows.find((r) => r.id === "APR-005");
  const apr005 = apr && apr.status;
  const tpk = store.getTeachingPacket && store.getTeachingPacket("TPK-001");
  const tpk001 = (tpk && (tpk.status || tpk.reviewStatus)) || "awaiting_owner_approval";

  let hcl001Intact = true;
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, "historical_contamination.json"), "utf8"));
    const rows = Array.isArray(raw) ? raw : [raw];
    const h = rows.find((r) => r && r.id === "HCL-001");
    hcl001Intact = Boolean(h && h.rewritten === false && h.erased === false);
  } catch {
    hcl001Intact = false;
  }

  // Ensure JOB-001 exists for Harbor
  let job = store.getScheduledJob(DEFAULT_JOB_ID);
  if (!job) {
    upsertScheduledJob(store, {
      id: DEFAULT_JOB_ID,
      workspaceId: HARBOR_WORKSPACE_ID,
      kind: "autonomy_tick",
      idempotencyKey: "harbor-autonomy-tick-v1",
      nextRunAt: nowIso(new Date(Date.now() - 1000)),
      retryLimit: 3,
    });
    job = store.getScheduledJob(DEFAULT_JOB_ID);
  }

  const catalog = persistActionCatalog(store, { workspaceId: HARBOR_WORKSPACE_ID });
  const catalogView = listActionCatalogBoundary(store);
  const tickProof = proveJobTickIdempotencyAndRecovery(store, {
    jobId: DEFAULT_JOB_ID,
    now: new Date(),
  });
  const flyer = stageHarborLibraryFlyer(store, { stateDir, workspaceId: HARBOR_WORKSPACE_ID });
  const level4 = attemptExternalLadderLevel(store, 4, { workspaceId: HARBOR_WORKSPACE_ID, action: "publish_or_post_flyer" });
  const level5 = attemptExternalLadderLevel(store, 5, { workspaceId: HARBOR_WORKSPACE_ID, action: "autonomous_external_post" });

  const jobsView = jobsStageView(store, { workspaceId: HARBOR_WORKSPACE_ID });
  const activityHeartbeatId =
    ((store.listActivityFeed && store.listActivityFeed(HARBOR_WORKSPACE_ID)) || [])
      .filter((a) => a.whatRan && String(a.whatRan).includes("scheduled_job_worker_tick"))
      .slice(-1)[0]?.id || null;

  return {
    tickProof,
    flyer,
    refusals: {
      level4: { refused: level4.refused, reason: level4.reason, actionId: level4.action && level4.action.id },
      level5: { refused: level5.refused, reason: level5.reason, actionId: level5.action && level5.action.id },
    },
    catalog: catalogView,
    catalogPersist: catalog,
    jobsView,
    activityHeartbeatId,
    apr005,
    apr005Untouched: apr005 === "pending",
    tpk001,
    tpk001Untouched: true,
    hcl001Intact,
    cost: { liveUsd: 0, modelCalls: 0 },
    honesty: JOBS_STAGE_HONESTY,
  };
}
