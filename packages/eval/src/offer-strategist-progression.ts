/** Offer Strategist contributions and development-verification gates. Not promotion. */

import { recordContribution } from "./contribution.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { employeeSpendUsd } from "./offer-strategist-live.ts";

export const STRATEGIST_CONTRIBUTION_KINDS = [
  "live_task_completed",
  "approved_evidence_cited",
  "hypothesis_labeled",
  "watcher_chain_verified",
];

export const DEVELOPMENT_VERIFIED = "development_verified";

function nowIso() {
  return new Date().toISOString();
}

export function evaluateStrategistGates(store, extras) {
  const workspaceId = extras && extras.workspaceId || "ws-ridgeline";
  const run = extras && extras.run || ((store.listOfferStrategistRuns && store.listOfferStrategistRuns(workspaceId)) || []).filter((r) => r.live && r.parseStatus === "ok").slice(-1)[0]
    || ((store.listOfferStrategistRuns && store.listOfferStrategistRuns(workspaceId)) || []).slice(-1)[0];
  let audit = extras && extras.audit || null;
  if (!audit && store.listWatcherAudits) {
    const audits = (store.listWatcherAudits(workspaceId) || []).filter((a) => !run || a.offerStrategistRunId === run.id);
    const superseding = audits.filter((a) => a.supersedes);
    audit = superseding.slice(-1)[0] || audits.slice(-1)[0] || null;
  }
  const contract = extras && extras.contract || ((store.listRoleContracts && store.listRoleContracts()) || []).slice(-1)[0];
  const bakeoff = extras && extras.bakeoff || ((store.listBakeoffRuns && store.listBakeoffRuns()) || []).slice(-1)[0];
  const spend = employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID);
  const structured = run && run.structured;
  const evidence = (structured && structured.approved_evidence) || [];
  const approvedIds = new Set((run && run.approvedKnowledgeIds) || []);
  const citedExisting = evidence.filter((e) => e && e.id && approvedIds.has(e.id));
  const labeled = Boolean(structured && structured.labels && structured.labels.hypothesisVersusFact === true);
  const originalPreserved = Boolean(audit && (audit.originalPreserved === true || audit.mutatedInspectedRecords === false));
  const liveOk = Boolean(run && run.live === true && run.fixture !== true && run.fixtureFallback === false);
  const parsed = Boolean(run && run.parseStatus === "ok" && structured);
  const noCritical = !(audit && audit.status === "VIOLATION" && (audit.blocking || []).length);
  const underCap = spend <= 0.5 + 1e-9;
  const contractFrozen = Boolean(contract && contract.contentHash);
  const bakeoffRecorded = Boolean(bakeoff && bakeoff.id);

  const gates = [
    { id: "G1", title: "Live task completed", pass: liveOk, detail: liveOk ? "Live model invoked. fixtureFallback=false." : "No live Offer Strategist run." },
    { id: "G2", title: "Structured output parsed", pass: parsed, detail: parsed ? "Required fields present." : "Parse failed or uncertain; fields not invented." },
    { id: "G3", title: "Approved evidence cited", pass: citedExisting.length > 0, detail: citedExisting.length ? citedExisting.map((e) => e.id).join(", ") : "No cited id exists in approved knowledge." },
    { id: "G4", title: "Hypothesis labeled", pass: labeled, detail: labeled ? "labels.hypothesisVersusFact=true" : "Hypothesis versus fact not labeled." },
    { id: "G5", title: "Watcher original preserved", pass: Boolean(audit) && originalPreserved, detail: audit ? (originalPreserved ? "Append-only. Original output unchanged." : "Original output not verified preserved.") : "No Watcher audit." },
    { id: "G6", title: "Spend under employee cap", pass: underCap, detail: "used=$" + spend + " cap=$0.50" },
    { id: "G7", title: "No blocking integrity violation", pass: noCritical, detail: noCritical ? "No blocking Watcher violation." : "Watcher reported blocking violations." },
    { id: "G8", title: "Contract frozen", pass: contractFrozen, detail: contractFrozen ? contract.contentHash : "No frozen contract hash." },
    { id: "G9", title: "Bakeoff recorded", pass: bakeoffRecorded, detail: bakeoffRecorded ? bakeoff.id : "No bakeoff record. Not a sealed win requirement." },
  ];
  const failed = gates.filter((g) => !g.pass);
  return {
    workspaceId: workspaceId,
    pass: failed.length === 0,
    gates: gates,
    failedIds: failed.map((g) => g.id),
    spendUsd: spend,
    runId: run && run.id || null,
    auditId: audit && audit.id || null,
    notPromoted: true,
    notAutonomous: true,
    notWorldClass: true,
    disclosure: "Development-verified is not promoted, not autonomous, not production-ready, not world-class.",
  };
}

export function recordStrategistContributions(store, extras) {
  const workspaceId = extras && extras.workspaceId || "ws-ridgeline";
  const run = extras && extras.run;
  const audit = extras && extras.audit;
  const events = [];
  if (!run) return events;
  const agentId = "offer_strategist-" + workspaceId;
  function add(kind, evidence, note, verified) {
    try {
      const ev = recordContribution(store, {
        kind: kind,
        role: OFFER_STRATEGIST_ROLE_ID,
        agentId: agentId,
        workspaceId: workspaceId,
        evidence: evidence,
        note: note,
        state: verified ? "verified" : "provisional",
        selfAwarded: false,
      });
      events.push(ev);
    } catch (err) {
      events.push({ error: err instanceof Error ? err.message : String(err), kind: kind });
    }
  }
  if (run.live === true && run.fixture !== true) {
    add("live_task_completed", { taskId: run.taskId, runId: run.id, objectiveId: run.objectiveId }, "Live Offer Strategist task completed.", true);
  }
  const cited = ((run.structured && run.structured.approved_evidence) || []).filter((e) => e && e.id && (run.approvedKnowledgeIds || []).includes(e.id));
  if (cited.length) {
    add("approved_evidence_cited", { runId: run.id, findingId: cited[0].id, taskId: run.taskId }, "Cited approved knowledge " + cited.map((e) => e.id).join(","), true);
  }
  if (run.structured && run.structured.labels && run.structured.labels.hypothesisVersusFact === true) {
    add("hypothesis_labeled", { runId: run.id, taskId: run.taskId }, "Hypothesis versus fact labeled.", true);
  }
  if (audit && audit.id && (audit.originalPreserved === true || audit.mutatedInspectedRecords === false)) {
    add("watcher_chain_verified", { auditId: audit.id, runId: run.id, taskId: run.taskId }, "Watcher audited the Strategist chain. Original preserved.", true);
  }
  return events;
}

export function applyDevelopmentVerification(store, extras) {
  const workspaceId = extras && extras.workspaceId || "ws-ridgeline";
  const evaln = extras && extras.evaluation || evaluateStrategistGates(store, extras);
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const role = roles.find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);
  if (!role) return { applied: false, status: null, evaluation: evaln, promoted: false };
  const current = role.status;
  let next = current;
  if (evaln.pass && ["evaluation_required", "active_development", "trainee"].includes(current)) {
    next = DEVELOPMENT_VERIFIED;
  }
  if (next !== current) {
    store.putEmployeeRole({
      ...role,
      status: next,
      promoted: false,
      worldClass: false,
      trusted: false,
      autonomous: false,
      developmentVerifiedAt: nowIso(),
      developmentVerification: evaln,
      note: "development_verified is not promoted / autonomous / production-ready / world-class.",
    });
    const agent = store.getAgent(role.agentId);
    if (agent) store.putAgent({ ...agent, status: next });
  }
  if (store.putEmployeeProgression) {
    let progressionId = (extras && extras.progressionId) || ("PRG-" + (role.id || "EMP-001") + "-m15");
    const existingProg = (store.listEmployeeProgressions && store.listEmployeeProgressions()) || [];
    if (!(extras && extras.progressionId) && existingProg.some((r) => r.id === progressionId)) {
      progressionId = progressionId + "-" + String(existingProg.length + 1).padStart(3, "0");
    }
    store.putEmployeeProgression({
      id: progressionId,
      workspaceId: workspaceId,
      employeeId: role.id,
      roleId: role.roleId,
      previousStatus: current,
      status: next,
      promoted: false,
      evaluation: evaln,
      createdAt: nowIso(),
      disclosure: "Not promoted. Not autonomous. Not world-class.",
    });
  }
  return { applied: next !== current, status: next, previousStatus: current, evaluation: evaln, promoted: false };
}
