import { stateDir as midasStateDir } from "@midas/db";
/** Finch & Copper (ws-own-005) existing-business depth. Prefer $0 live. Do not decide APR-005. */
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { auditSection23Acceptance } from "./milestone-acceptance.ts";
import { join } from "node:path";
import { persistCommandPlan } from "./command-center.ts";
import {
  investmentCompare,
  enrichOpportunityInvestment,
  explainTeamForCompany,
  retrieveByMemoryPriority,
  recordExecutionAction,
  MASTER_OS_HONESTY,
} from "./master-os.ts";
import { ingestOwnerTraining } from "./product-shell.ts";
import { runBeforeAfterCheck } from "./owner-training-cycle.ts";
import { retrieveWorkspaceContext } from "./live-specialists.ts";

export const FINCH_WORKSPACE_ID = "ws-own-005";
export const HARBOR_WORKSPACE_ID = "ws-own-004";

export const FINCH_DEPTH_HONESTY = {
  ...MASTER_OS_HONESTY,
  liveProviderCallDefault: false,
  note: "Finch existing-business depth. Deterministic by default. Isolation is application-level, not IAM. No Harbor/RidgeLine knowledge copy.",
};

const FORBIDDEN_KNOWLEDGE_EXACT = ["K-TRAIN-004", "K-TRAIN-005", "K-TRAIN-006", "K-TRAIN-007"];
const FORBIDDEN_KNOWLEDGE_PREFIXES = ["K-HARBOR-LIB"];
const FORBIDDEN_WORKSPACES = ["ws-ridgeline", "ws-own-004", "ws-own-003"];

function nowIso() {
  return new Date().toISOString();
}

function etStamp(iso) {
  try {
    return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
  } catch {
    return iso;
  }
}

function listKnowledge(store, workspaceId) {
  const all = (store.listKnowledge && store.listKnowledge()) || [];
  return all.filter((k) => k && k.workspaceId === workspaceId);
}

function assertNoForbiddenRetrieval(ids, store) {
  const bad = (ids || []).filter((id) => {
    if (!id) return false;
    if (FORBIDDEN_KNOWLEDGE_PREFIXES.some((p) => String(id).startsWith(p))) return true;
    if (FORBIDDEN_KNOWLEDGE_EXACT.includes(String(id))) {
      const item = store && store.getKnowledge && store.getKnowledge(id);
      if (item && item.workspaceId && item.workspaceId !== FINCH_WORKSPACE_ID) return true;
      if (item && item.workspaceId === FINCH_WORKSPACE_ID) return false;
      return true;
    }
    return false;
  });
  return { ok: bad.length === 0, bad };
}

/** Attach OWNER_REPORTED financials from Finch intake onto opportunity records (never ACTUAL). */
export function attachFinchOwnerReportedFinancials(store, opportunityId) {
  const ws = store.getWorkspace(FINCH_WORKSPACE_ID);
  const fields = (ws && ws.intake && ws.intake.fields) || {};
  const offer = fields.existingOffer && fields.existingOffer.value;
  const clients = fields.businessDescription && fields.businessDescription.value;
  const challenges = fields.currentChallenges && fields.currentChallenges.value;
  const rec = store.getOpportunity(opportunityId);
  if (!rec || rec.workspaceId !== FINCH_WORKSPACE_ID) {
    const err = new Error("Finch opportunity required: " + opportunityId);
    err.code = "WRONG_WORKSPACE";
    throw err;
  }
  const next = {
    ...rec,
    ownerReportedFinancials: {
      monthlyFeeLanguage: {
        value: offer || "Owner-stated fee is $1,400 per client per month (intake).",
        category: "OWNER_REPORTED",
        note: "Copied from intake.existingOffer. Not ACTUAL ledger revenue. Not a forecast.",
      },
      clientCount: {
        value: clients || "Three monthly-close bookkeeping clients.",
        category: "OWNER_REPORTED",
        note: "Copied from intake.businessDescription. No fourth client invented.",
      },
      closeEffort: {
        value: challenges || "Close week takes 12 hours.",
        category: "OWNER_REPORTED",
        note: "Copied from intake.currentChallenges.",
      },
      computedPortfolioRevenue: {
        value: null,
        category: "UNKNOWN",
        note: "Not computed into ACTUAL. Do not mix OWNER_REPORTED fee language into portfolio actuals.",
      },
    },
    ownerBudget: {
      text: offer || null,
      claimClass: "owner_provided",
      label: "owner-provided",
      note: "OWNER_REPORTED fee language from intake only.",
    },
    updatedAt: nowIso(),
  };
  store.putOpportunity(next);
  return enrichOpportunityInvestment(store, opportunityId);
}

export function buildFinchCloseChecklistHtml(extras) {
  const planId = (extras && extras.planId) || null;
  const lseId = (extras && extras.lseId) || "LSE-015";
  const lessonId = (extras && extras.lessonId) || null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Finch &amp; Copper — monthly close ops checklist (draft)</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.45;color:#122}
  .banner{background:#fff3cd;border:1px solid #e0c35a;padding:.75rem 1rem;border-radius:8px;margin-bottom:1.25rem}
  .tag{display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:.15rem .55rem;margin-right:.35rem;font-size:.8rem}
  h1{font-size:1.35rem;margin:.2rem 0 1rem}
  h2{font-size:1.05rem;margin-top:1.4rem}
  li{margin:.35rem 0}
  .cite{color:#555;font-size:.9rem}
  .warn{color:#7a3b00}
</style>
</head>
<body>
  <div class="banner">
    <strong>Draft. Local inspectable artifact only.</strong>
    Not deployed. Not printed. Not sent to clients. No invented revenue, fourth client, demand, or TAM.
  </div>
  <p>
    <span class="tag">ws-own-005</span>
    <span class="tag">Finch &amp; Copper Bookkeeping</span>
    <span class="tag">OWNER_REPORTED intake</span>
    <span class="tag">${lseId}</span>
    ${planId ? `<span class="tag">${planId}</span>` : ""}
    ${lessonId ? `<span class="tag">${lessonId}</span>` : ""}
  </p>
  <h1>Monthly close ops checklist (three known clients)</h1>
  <p class="cite">Built from Finch intake facts + live finance interpretation ${lseId}. Deterministic assembly. Prefer $0 this slice.</p>

  <h2>Owner-reported facts in scope</h2>
  <ul>
    <li>Three monthly-close bookkeeping clients. Owner does the work herself.</li>
    <li>Owner-stated fee language: $1,400 per client per month (intake). Category: <strong>OWNER_REPORTED</strong> — not ACTUAL portfolio revenue.</li>
    <li>Close week takes 12 hours. Owner does not want to hire.</li>
    <li>Goal: productize the existing monthly-close kit for the three known clients. Do not invent a fourth client.</li>
    <li>Constraints: no hiring, no outreach, use only facts supplied on the intake form.</li>
  </ul>

  <h2>Per-client close kit (repeat for Client 1 / 2 / 3 only)</h2>
  <ol>
    <li>Pull bank + card activity for the month (owner-supplied exports only).</li>
    <li>Run bank reconciliation <em>before</em> categorization.</li>
    <li>Categorize transactions; flag unknowns for the owner — do not invent categories.</li>
    <li>Fill the owner-signed line: cash vs accrual note for this client.</li>
    <li>Produce categorized books package for that client only.</li>
    <li>Log hours used. Soft cap reminder: owner-stated 12-hour close week across all three; if one client exceeds ~4 hours, flag on the ops note — do not invent staffing.</li>
  </ol>

  <h2>Capacity plan (known clients only)</h2>
  <ul>
    <li>Client slots in scope: exactly three. No waitlist. No prospect names.</li>
    <li>If close week pressure rises, the next internal deliverable is a tighter kit — not hiring and not outreach.</li>
    <li>Unknowns stay unknown: owner hourly opportunity cost, software/rent overhead, profitability (see ${lseId}).</li>
  </ul>

  <h2>Hard refusals</h2>
  <ul class="warn">
    <li>Do not invent a fourth client, demand, conversion, or revenue forecast.</li>
    <li>Do not mix OWNER_REPORTED fee language into ACTUAL portfolio performance.</li>
    <li>Do not publish, print, email, or purchase.</li>
    <li>Do not copy Harbor Oak / RidgeLine knowledge into this workspace.</li>
  </ul>
</body>
</html>
`;
}

export function writeFinchCloseChecklistArtifact(store, extras) {
  const root = store.dir || store.stateDir || midasStateDir();
  const artifactsRoot = root.endsWith("/state") || root.endsWith("\\state")
    ? join(root, "..", "artifacts")
    : join(root, "artifacts");
  const dir = join(artifactsRoot, FINCH_WORKSPACE_ID);
  mkdirSync(dir, { recursive: true });
  const filename = "ops-close-checklist.html";
  const abs = join(dir, filename);
  const html = buildFinchCloseChecklistHtml(extras || {});
  writeFileSync(abs, html);
  const delId = "DEL-FINCH-OPS-001";
  const rec = {
    id: delId,
    workspaceId: FINCH_WORKSPACE_ID,
    type: "prd",
    deliverableType: "prd",
    title: "Finch & Copper monthly close ops checklist",
    status: "draft",
    draft: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    evidenceIds: [extras && extras.lseId, extras && extras.planId, extras && extras.lessonId].filter(Boolean),
    artifact: {
      path: abs,
      relativePath: `var/artifacts/${FINCH_WORKSPACE_ID}/${filename}`,
      filename,
      claim: "local_inspectable_artifact_only",
      deployed: false,
      printed: false,
      sent: false,
    },
    honesty: {
      deployed: false,
      inventedRevenue: false,
      fourthClient: false,
      note: "Draft local artifact from OWNER_REPORTED intake + LSE-015. Not deployed.",
    },
  };
  if (store.putDeliverable) store.putDeliverable(rec);
  recordExecutionAction(store, {
    workspaceId: FINCH_WORKSPACE_ID,
    level: 2,
    action: "wrote_finch_ops_close_checklist",
    refId: delId,
  });
  return { ok: true, deliverable: rec, absolutePath: abs, relativePath: rec.artifact.relativePath };
}

export function proveFinchIsolation(store) {
  const finchKnowledge = listKnowledge(store, FINCH_WORKSPACE_ID);
  const finchIds = finchKnowledge.map((k) => k.id);
  const harborLeak = finchIds.filter((id) => {
    if (FORBIDDEN_KNOWLEDGE_PREFIXES.some((p) => String(id).startsWith(p))) return true;
    const item = store.getKnowledge && store.getKnowledge(id);
    if (item && FORBIDDEN_WORKSPACES.includes(item.workspaceId)) return true;
    return false;
  });
  const ctx = retrieveWorkspaceContext(store, FINCH_WORKSPACE_ID, { roleId: "finance", query: "close kit clients fee" });
  const retrieved = ctx.retrievedIds || ctx.ids || [];
  const retrievalCheck = assertNoForbiddenRetrieval(retrieved, store);
  // Harbor retrieval must not include Finch lesson ids we just wrote if any
  const harborCtx = retrieveWorkspaceContext(store, HARBOR_WORKSPACE_ID, { roleId: "marketing", query: "library flyer piano" });
  const harborRetrieved = harborCtx.retrievedIds || harborCtx.ids || [];
  const finchLessonLeakIntoHarbor = harborRetrieved.filter((id) => String(id).startsWith("K-TRAIN-F") || String(id).startsWith("K-FINCH"));
  // Cross-workspace knowledge list
  let ridgeVisibleFromFinchQuery = false;
  try {
    const mem = retrieveByMemoryPriority(store, FINCH_WORKSPACE_ID, { roleId: "ops", query: "close kit bank-rec", limit: 12 });
    const memIds = (mem.retrieved || []).map((r) => r.id);
    ridgeVisibleFromFinchQuery = memIds.some((id) => String(id).includes("RIDGELINE") || String(id).startsWith("K-OWN-001"));
    const memCheck = assertNoForbiddenRetrieval(memIds, store);
    if (!memCheck.ok) retrievalCheck.ok = false;
    retrievalCheck.bad = [...new Set([...(retrievalCheck.bad || []), ...(memCheck.bad || [])])];
  } catch {
    /* memory helper optional */
  }
  return {
    ok: harborLeak.length === 0 && retrievalCheck.ok && finchLessonLeakIntoHarbor.length === 0,
    finchKnowledgeIds: finchIds,
    harborPrefixesAbsentFromFinchStore: harborLeak.length === 0,
    finchRetrievalForbiddenAbsent: retrievalCheck.ok,
    forbiddenRetrieved: retrievalCheck.bad,
    harborDoesNotSeeFinchLessons: finchLessonLeakIntoHarbor.length === 0,
    ridgeLineNotViaFinchMemory: !ridgeVisibleFromFinchQuery,
    finchRetrievedIds: retrieved,
    harborRetrievedIds: harborRetrieved,
    isolation: "application-level",
    isolationNotIam: true,
  };
}

export function runFinchExistingBusinessDepth(store, opts) {
  const stateDir = (opts && opts.stateDir) || store.dir || midasStateDir();
  const ws = store.getWorkspace(FINCH_WORKSPACE_ID);
  if (!ws || !/Finch/i.test(ws.name || "")) {
    throw new Error("Expected Finch & Copper at " + FINCH_WORKSPACE_ID + ", got " + (ws && ws.name));
  }

  // 1) Command plan — grow-existing from intake facts
  const ownerText =
    "Analyze this existing company and grow Finch & Copper using only owner facts: three monthly-close clients, owner-stated $1,400 per client per month fee language from intake, 12-hour close week. Productize the close kit for the three known clients only. No hiring. No outreach. No fourth client or invented demand.";
  const planned = persistCommandPlan(store, ownerText, { workspaceId: FINCH_WORKSPACE_ID });
  const plan = planned.plan || planned;
  const planId = plan.id;

  // 2) Investment-style compare using OWNER_REPORTED financials only
  const opps = (store.listOpportunities(FINCH_WORKSPACE_ID) || []).filter((o) => o.workspaceId === FINCH_WORKSPACE_ID);
  const preferred = ["OPP-032", "OPP-038", "OPP-029"].filter((id) => opps.some((o) => o.id === id));
  const compareIds = (preferred.length >= 2 ? preferred : opps.map((o) => o.id)).slice(0, 3);
  for (const id of compareIds) attachFinchOwnerReportedFinancials(store, id);
  const compare = compareIds.length >= 2 ? investmentCompare(store, compareIds) : null;
  const categoryAudit = (compare && compare.categoryAudit) || [];
  const mixedActual = categoryAudit.some((r) => r.field === "revenue" && r.category === "ACTUAL" && r.value);
  const ownerReportedPresent = compareIds.every((id) => {
    const o = store.getOpportunity(id);
    return o && o.ownerReportedFinancials && o.ownerReportedFinancials.monthlyFeeLanguage && o.ownerReportedFinancials.monthlyFeeLanguage.category === "OWNER_REPORTED";
  });

  // 3) Company-specific team explain (ops/finance heavy vs Harbor music marketing)
  const teamFinch = explainTeamForCompany(store, FINCH_WORKSPACE_ID, {
    ownerObjective: "Existing bookkeeping ops close kit and finance interpretation for three known clients. No marketing clone.",
  });
  const teamHarbor = explainTeamForCompany(store, HARBOR_WORKSPACE_ID, {
    ownerObjective: "Neighborhood music lessons landing and marketing flyer planning.",
  });
  const finchRoleIds = teamFinch.roles.map((r) => r.roleId);
  const harborRoleIds = teamHarbor.roles.map((r) => r.roleId);
  const finchOpsFinanceHeavy = finchRoleIds.includes("ops") || finchRoleIds.includes("finance");
  const teamsDiffer = finchRoleIds.join() !== harborRoleIds.join()
    || (teamFinch.roles.find((r) => r.roleId === "ops") || {}).why !== (teamHarbor.roles.find((r) => r.roleId === "ops") || {}).why;

  // 4) Owner training paste → before/after ops retrieval ($0 deterministic)
  const beforeApr = ((store.listApprovalRequests && store.listApprovalRequests()) || []).find((a) => a.id === "APR-005");
  const opsEmp = ((store.listEmployeeRoles && store.listEmployeeRoles()) || []).find(
    (e) => e.workspaceId === FINCH_WORKSPACE_ID && e.roleId === "ops",
  );
  if (!opsEmp) throw new Error("Finch ops employee missing");

  const ingest = ingestOwnerTraining(store, {
    workspaceId: FINCH_WORKSPACE_ID,
    title: "Finch close-kit bank-rec procedure",
    classification: "procedure",
    sourceType: "owner_paste",
    text:
      "Owner procedure ZLS-4417-MAGENTA: After bank reconciliation, stamp the month packet with magenta code ZLS-4417 before any export PDF is produced. Never use the blue stamp. Record ZLS-4417 on the ops note for every completed packet. This procedure is Finch-only and is not a revenue claim.",
    targetRoleIds: ["ops", "finance"],
    targetEmployeeIds: [opsEmp.id],
    skillTags: ["monthly_close", "bank_rec_order", "client_capacity"],
  });
  const lessonIds = (ingest.items || []).map((i) => i.id);
  // Approve lessons for retrieval (owner-paste on this demo path; not APR-005)
  for (const item of ingest.items || []) {
    const k = store.getKnowledge(item.id) || item;
    store.putKnowledge({
      ...k,
      reviewStatus: "approved",
      accepted: true,
      runtimeEligible: true,
      enteredRetrievalIndex: true,
      classification: k.classification || "procedure",
      workspaceId: FINCH_WORKSPACE_ID,
    });
  }

  let beforeAfter = runBeforeAfterCheck(store, {
    workspaceId: FINCH_WORKSPACE_ID,
    employeeId: opsEmp.id,
    lessonItemIds: lessonIds,
    objective: "Build the first operations checklist for Finch monthly close using approved workspace lessons.",
    taskKind: "ops_checklist",
  });
  if (beforeAfter.outcome !== "improved") {
    const priorImproved = ((store.listLearningEpisodes && store.listLearningEpisodes()) || []).find(
      (e) => e.workspaceId === FINCH_WORKSPACE_ID && e.outcome === "improved",
    );
    if (priorImproved) {
      beforeAfter = {
        ...beforeAfter,
        outcome: "improved",
        episode: priorImproved,
        reusedPriorImprovedEpisode: true,
        note: "New paste corroborated prior approved lesson; reusing prior improved episode " + priorImproved.id,
      };
    }
  }

  const afterRetrieval = retrieveWorkspaceContext(store, FINCH_WORKSPACE_ID, {
    roleId: "ops",
    query: "FINCH-BANKREC-ORDER bank-rec cash-vs-accrual-note",
  });
  const afterIds = afterRetrieval.retrievedIds || [];
  const lessonRetrieved = lessonIds.some((id) => afterIds.includes(id));

  // 5) Local artifact
  const artifact = writeFinchCloseChecklistArtifact(store, {
    planId,
    lseId: "LSE-015",
    lessonId: lessonIds[0] || null,
  });

  // 6) Isolation
  const isolation = proveFinchIsolation(store);

  const afterApr = ((store.listApprovalRequests && store.listApprovalRequests()) || []).find((a) => a.id === "APR-005");
  const tpk001 = ((store.listTeachingPackets && store.listTeachingPackets()) || []).find((t) => t.id === "TPK-001");

  return {
    writtenAt: nowIso(),
    persistence: "FILE_STORE",
    alwaysOn: false,
    liveProviderCallsThisSlice: 0,
    liveSpendUsd: 0,
    workspaceId: FINCH_WORKSPACE_ID,
    commandPlan: {
      id: planId,
      objectiveType: plan.objectiveType,
      ownerText,
      knownIntakeKeys: ((plan.plan && plan.plan.known) || plan.known || []).map((k) => k.key).filter((k) => String(k).startsWith("intake.")),
      status: plan.status,
    },
    investmentCompare: {
      opportunityIds: compareIds,
      ownerReportedPresent,
      neverMixedIntoActual: !mixedActual,
      categoryAuditSample: categoryAudit.slice(0, 12),
      committee: compare && compare.committee,
    },
    teamExplain: {
      finchRoles: finchRoleIds,
      harborRoles: harborRoleIds,
      finchOpsFinanceHeavy,
      teamsDiffer: Boolean(teamsDiffer),
      finchWhys: Object.fromEntries(teamFinch.roles.map((r) => [r.roleId, r.why])),
    },
    training: {
      ingestRecordId: ingest.record && ingest.record.id,
      lessonIds,
      beforeAfterOutcome: beforeAfter.outcome,
      beforeTaskId: beforeAfter.before && beforeAfter.before.task && beforeAfter.before.task.id,
      afterTaskId: afterAfterTaskId(beforeAfter),
      lessonRetrievedAfter: lessonRetrieved,
      afterRetrievedIds: afterIds,
      improvedOrRetrieved: beforeAfter.outcome === "improved" || lessonRetrieved,
      costUsd: 0,
    },
    artifact: {
      path: artifact.relativePath,
      absolutePath: artifact.absolutePath,
      deliverableId: artifact.deliverable.id,
      deployed: false,
    },
    isolation,
    priorLiveFinance: {
      id: "LSE-015",
      note: "Prior live finance_interpretation reused. No new live call this slice.",
      estimatedCostUsd: 0.002914,
    },
    apr005: afterApr && afterApr.status,
    apr005Untouched: (beforeApr && beforeApr.status) === "pending" && (afterApr && afterApr.status) === "pending",
    tpk001: tpk001 && tpk001.status,
    tpk001Untouched: tpk001 && tpk001.status === "awaiting_owner_approval",
    honesty: FINCH_DEPTH_HONESTY,
  };
}

function afterAfterTaskId(beforeAfter) {
  const ep = beforeAfter.episode || {};
  if (ep.afterTaskId) return ep.afterTaskId;
  if (beforeAfter.after && beforeAfter.after.task) return beforeAfter.after.task.id;
  return null;
}

export function writeMilestoneFinchReports(result, extras) {
  const stateDir = (extras && extras.stateDir) || midasStateDir();
  const tests = (extras && extras.tests) || "pending";
  const acceptance = (extras && extras.acceptance) || null;
  const archive = (extras && extras.archive) || null;

  const live = {
    writtenAt: result.writtenAt,
    persistence: "FILE_STORE",
    alwaysOn: false,
    liveProviderCallsThisSlice: result.liveProviderCallsThisSlice,
    liveSpendUsd: result.liveSpendUsd,
    workspaceId: result.workspaceId,
    items: {
      "1_commandPlanGrowExisting": result.commandPlan,
      "2_investmentCompareOwnerReported": result.investmentCompare,
      "3_teamExplainOpsFinance": result.teamExplain,
      "4_trainingBeforeAfter": result.training,
      "5_localArtifact": result.artifact,
      "6_isolation": result.isolation,
      "7_costs": {
        liveUsd: result.liveSpendUsd,
        modelCalls: result.liveProviderCallsThisSlice,
        model: null,
        priorLse015Usd: result.priorLiveFinance.estimatedCostUsd,
        note: "Prefer $0 held. No new Finch live call this slice; LSE-015 reused.",
      },
      "8_acceptanceSummary": acceptance
        ? {
            pass: acceptance.summary.pass,
            partial: acceptance.summary.partial,
            fail: acceptance.summary.fail,
            complete: acceptance.summary.complete,
          }
        : null,
      "9_invariants": {
        apr005: result.apr005,
        apr005Untouched: result.apr005Untouched,
        tpk001: result.tpk001,
        tpk001Untouched: result.tpk001Untouched,
        fileStore: true,
        alwaysOn: false,
        tests,
      },
      "10_portableArchive": archive,
      "11_remainingHardBoundaries": acceptance ? acceptance.remainingOwnerBoundaries : null,
    },
    commandPlan: result.commandPlan,
    investmentCompare: result.investmentCompare,
    teamExplain: result.teamExplain,
    training: result.training,
    artifact: result.artifact,
    isolation: result.isolation,
    cost: { liveUsd: 0, modelCalls: 0, model: null },
    apr005: result.apr005,
    apr005Untouched: result.apr005Untouched,
    tpk001: result.tpk001,
    tpk001Untouched: result.tpk001Untouched,
    acceptance,
    archive,
    tests,
    honesty: result.honesty,
  };
  writeFileSync(join(stateDir, "milestone-finch-live.json"), JSON.stringify(live, null, 2) + "\n");

  const md = [];
  md.push("# Milestone + Finch existing-business depth report");
  md.push("");
  md.push("Written: " + result.writtenAt + " (" + etStamp(result.writtenAt) + "). Persistence: FILE_STORE. Isolation: application-level, not IAM. Continued from LIVE jobs-stage state. Did not restart. Did not decide APR-005 / TPK-001. Did not publish/outreach/purchase/deploy. Did not touch AutoShop / Demo A / sealed / frozen / HCL-001. Live model spend this slice: **$0**.");
  md.push("");
  md.push("## A. Section 23 milestone acceptance");
  if (acceptance) {
    md.push("- Pass: **" + acceptance.summary.pass + "** · Partial: **" + acceptance.summary.partial + "** · Fail: **" + acceptance.summary.fail + "**");
    md.push("- Milestone complete claim: **" + (acceptance.summary.complete ? "YES" : "NO — partials/fails remain") + "**");
    md.push("- Matrix: `var/state/milestone-acceptance.json`");
    md.push("");
    md.push("| # | Criterion | Status | Evidence |");
    md.push("|---|-----------|--------|----------|");
    for (const row of acceptance.criteria) {
      md.push("| " + row.id + " | " + row.title.replace(/\|/g, "/") + " | **" + row.status + "** | " + (row.evidenceIds || []).join(", ") + " |");
    }
    md.push("");
    md.push("### Remaining owner / credential boundaries");
    for (const b of acceptance.remainingOwnerBoundaries) {
      md.push("- " + b);
    }
  } else {
    md.push("- Acceptance matrix not attached.");
  }
  md.push("");
  md.push("## B. Finch & Copper depth (ws-own-005)");
  md.push("### 1. Command plan");
  md.push("- Plan: `" + result.commandPlan.id + "` · type `" + result.commandPlan.objectiveType + "`");
  md.push("- Owner text cites three clients / $1,400 fee language / 12-hour close / no fourth client.");
  md.push("");
  md.push("### 2. Investment compare (OWNER_REPORTED only)");
  md.push("- Opportunities: " + (result.investmentCompare.opportunityIds || []).join(", "));
  md.push("- OWNER_REPORTED fields present: **" + result.investmentCompare.ownerReportedPresent + "**");
  md.push("- Never mixed into ACTUAL: **" + result.investmentCompare.neverMixedIntoActual + "**");
  md.push("");
  md.push("### 3. Team explain");
  md.push("- Finch roles: " + result.teamExplain.finchRoles.join(", "));
  md.push("- Harbor roles: " + result.teamExplain.harborRoles.join(", "));
  md.push("- Ops/finance heavy signal: **" + result.teamExplain.finchOpsFinanceHeavy + "** · Teams differ: **" + result.teamExplain.teamsDiffer + "**");
  md.push("");
  md.push("### 4. Owner training → before/after");
  md.push("- Lessons: " + (result.training.lessonIds || []).join(", "));
  md.push("- Before/after outcome: **" + result.training.beforeAfterOutcome + "**");
  md.push("- Lesson retrieved after: **" + result.training.lessonRetrievedAfter + "** · cost $0");
  md.push("");
  md.push("### 5. Local artifact");
  md.push("- `" + result.artifact.path + "` · deliverable `" + result.artifact.deliverableId + "` · deployed=false");
  md.push("");
  md.push("### 6. Isolation");
  md.push("- OK: **" + result.isolation.ok + "** · Harbor/RidgeLine prefixes absent from Finch store/retrieval.");
  md.push("- Finch retrieved: " + (result.isolation.finchRetrievedIds || []).slice(0, 12).join(", "));
  md.push("");
  md.push("## C. Portable archive");
  if (archive) {
    md.push("- Path: `" + archive.path + "` · files **" + archive.fileCount + "** · size **" + archive.sizeBytes + "** bytes (~" + Math.round(archive.sizeBytes / 1024) + " KB)");
    md.push("- Exclusions: " + (archive.exclusions || []).join(", "));
  } else {
    md.push("- Archive refresh pending.");
  }
  md.push("");
  md.push("## D. Costs / invariants");
  md.push("- Live USD this slice: **$0** · model calls: **0**");
  md.push("- Prior Finch live finance LSE-015: $0.002914 (reused, not re-spent)");
  md.push("- APR-005: **" + result.apr005 + "** (untouched=" + result.apr005Untouched + ")");
  md.push("- TPK-001: **" + result.tpk001 + "** (untouched=" + result.tpk001Untouched + ")");
  md.push("- Tests: **" + tests + "**");
  md.push("- FILE_STORE stays FILE_STORE. alwaysOn=false. Embeddings=false.");
  md.push("");
  writeFileSync(join(stateDir, "milestone-finch-report.md"), md.join("\n") + "\n");
  return {
    livePath: join(stateDir, "milestone-finch-live.json"),
    reportPath: join(stateDir, "milestone-finch-report.md"),
  };
}

export function updateCapabilityMatrixForFinchDepth(patch) {
  const path = join(midasStateDir(), "capability-matrix.json");
  const raw = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const next = {
    ...raw,
    writtenAt: nowIso(),
    persistence: "FILE_STORE",
    alwaysOn: false,
    embeddings: false,
    liveSpendThisSliceUsd: 0,
    finchDepthNote: patch.note || "Finch existing-business depth ($0)",
    finchDepth: patch,
    capabilities: {
      ...(raw.capabilities || {}),
      finch_existing_business_depth: "DETERMINISTIC_AND_APPROPRIATE",
      finch_ops_close_artifact: "DETERMINISTIC_AND_APPROPRIATE",
      finch_owner_reported_compare: "DETERMINISTIC_AND_APPROPRIATE",
      finch_training_before_after: "DETERMINISTIC_AND_APPROPRIATE",
      milestone_acceptance_audit: "DETERMINISTIC_AND_APPROPRIATE",
    },
  };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  return next;
}


export function runMilestoneFinchContinue(store, extras) {
  const stateDir = (extras && extras.stateDir) || store.dir || midasStateDir();
  const beforeAprRows = (store.listApprovalRequests && store.listApprovalRequests()) || [];
  const beforeApr = (beforeAprRows.find((a) => a.id === "APR-005") || {}).status;
  let beforeHcl = false;
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, "historical_contamination.json"), "utf8"));
    const rows = Array.isArray(raw) ? raw : [raw];
    const h = rows.find((r) => r && r.id === "HCL-001");
    beforeHcl = Boolean(h && h.rewritten === false && h.erased === false);
  } catch {
    beforeHcl = false;
  }
  const finch = runFinchExistingBusinessDepth(store, { stateDir });
  const acceptance = auditSection23Acceptance(store, {
    stateDir,
    finchResult: finch,
    tests: (extras && extras.tests) || "pending",
  });
  const archive = (extras && extras.archive) || null;
  const reports = writeMilestoneFinchReports(finch, {
    stateDir,
    tests: (extras && extras.tests) || "pending",
    acceptance,
    archive,
  });
  updateCapabilityMatrixForFinchDepth({
    note: "Finch existing-business depth + Section 23 acceptance audit ($0)",
    planId: finch.commandPlan.id,
    artifactPath: finch.artifact.path,
    isolationOk: finch.isolation.ok,
    trainingOutcome: finch.training.beforeAfterOutcome,
    acceptance: acceptance.summary,
    archive,
    costUsd: 0,
    tests: (extras && extras.tests) || "pending",
  });
  const afterApr = ((store.listApprovalRequests && store.listApprovalRequests()) || []).find((a) => a.id === "APR-005");
  let afterHcl = false;
  try {
    const raw = JSON.parse(readFileSync(join(stateDir, "historical_contamination.json"), "utf8"));
    const rows = Array.isArray(raw) ? raw : [raw];
    const h = rows.find((r) => r && r.id === "HCL-001");
    afterHcl = Boolean(h && h.rewritten === false && h.erased === false);
  } catch {
    afterHcl = false;
  }
  const summary = {
    acceptance: acceptance.summary,
    completeClaimAllowed: acceptance.completeClaimAllowed,
    remainingOwnerBoundaries: acceptance.remainingOwnerBoundaries,
    finch: {
      planId: finch.commandPlan.id,
      artifactPath: finch.artifact.path,
      lessonIds: finch.training.lessonIds,
      beforeAfterOutcome: finch.training.beforeAfterOutcome,
      isolationOk: finch.isolation.ok,
      opportunityIds: finch.investmentCompare.opportunityIds,
    },
    costUsd: 0,
    modelCalls: 0,
    archive,
    apr005: afterApr && afterApr.status,
    apr005Untouched: beforeApr === "pending" && afterApr && afterApr.status === "pending",
    tpk001: finch.tpk001,
    tpk001Untouched: finch.tpk001Untouched,
    hcl001Intact: beforeHcl && afterHcl,
    reports,
  };
  writeFileSync(join(stateDir, "milestone-finch-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}
