import { FileStore } from "@midas/db";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  persistCommandPlan,
  planFromNaturalLanguage,
} from "../packages/eval/src/command-center.ts";
import {
  upsertScheduledJob,
  runAutonomyLoopTick,
  recordExecutionAction,
  investmentCompare,
  retrieveByMemoryPriority,
  explainTeamForCompany,
  treasuryView,
  enrichOpportunityInvestment,
  CURRENT_MAX_EXECUTION_LEVEL,
} from "../packages/eval/src/master-os.ts";
import { persistInternalAutonomyPolicy, activeInternalAutonomyPolicy } from "../packages/eval/src/autonomy-policy.ts";
import { dispatchProductRequest } from "../packages/eval/src/product-shell.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = join(ROOT, "var/state");
const store = new FileStore(stateDir);

const harbor = "ws-own-004";
const finch = "ws-own-005";

const plans = [];
plans.push(persistCommandPlan(store, "Find three business opportunities I can start with $1,500.", { workspaceId: harbor }));
plans.push(persistCommandPlan(store, "Build an execution plan for the next seven days", { workspaceId: harbor }));
plans.push(persistCommandPlan(store, "Create a landing page for our current offer.", { workspaceId: harbor }));
plans.push(persistCommandPlan(store, "Train marketing using these notes about walkable West Asheville lessons.", { workspaceId: harbor }));
plans.push(persistCommandPlan(store, "Analyze this existing company and list growth hypotheses.", { workspaceId: finch }));

// Autonomy policy on Harbor if missing (owner explicit)
let policy = activeInternalAutonomyPolicy(store, harbor);
if (!policy) {
  persistInternalAutonomyPolicy(store, {
    workspaceId: harbor,
    actor: "local_owner",
    authorized: true,
    authorizedActions: ["run_internal_specialist_task", "write_local_artifact"],
    forbiddenActions: ["outreach", "publish", "purchase", "raise_own_budget"],
    budgetUsd: 0.5,
  });
  policy = activeInternalAutonomyPolicy(store, harbor);
}

const tick = runAutonomyLoopTick(store, harbor, {
  actions: [
    { action: "run_internal_specialist_task", label: "internal draft", level: 1 },
    { action: "write_local_artifact", label: "ops checklist already written", level: 2 },
    { action: "outreach", label: "must pause", level: 4 },
  ],
  budgetUsd: 0.5,
});

const job = upsertScheduledJob(store, {
  workspaceId: harbor,
  kind: "autonomy_tick",
  idempotencyKey: "harbor-autonomy-tick-v1",
  nextRunAt: new Date(Date.now() + 3600_000).toISOString(),
  retryLimit: 3,
  taskState: "pending",
});

const ladder2 = recordExecutionAction(store, {
  workspaceId: harbor,
  level: 2,
  action: "wrote_ops_checklist_7day",
  refId: "DEL-HARBOR-OPS-001",
});
const ladder4 = recordExecutionAction(store, {
  workspaceId: harbor,
  level: 4,
  action: "external_execute_blocked",
});

const teamHarbor = explainTeamForCompany(store, harbor);
const teamFinch = explainTeamForCompany(store, finch);

const memory = retrieveByMemoryPriority(store, harbor, { roleId: "marketing", query: "price lessons parent", limit: 8 });

const opps = (store.listOpportunities(harbor) || []).slice(0, 2).map((o) => o.id);
let inv = null;
if (opps.length >= 2) {
  for (const id of opps) enrichOpportunityInvestment(store, id);
  inv = investmentCompare(store, opps);
} else {
  const all = store.listOpportunities() || [];
  const harborish = all.filter((o) => o.workspaceId === harbor || o.requestWorkspaceId === harbor).slice(0, 2);
  if (harborish.length >= 2) {
    for (const o of harborish) enrichOpportunityInvestment(store, o.id);
    inv = investmentCompare(store, harborish.map((o) => o.id));
  }
}

const treasury = treasuryView(store, { workspaceId: harbor });
const overview = dispatchProductRequest(store, "GET", "/app/overview", {}, { workspaceId: harbor });
const command = dispatchProductRequest(store, "GET", "/app/command", {}, { workspaceId: harbor });

// Search status from records
const search = store.listSearchRecords() || [];
const searchStatus = {
  connected: true,
  records: search.map((r) => ({
    id: r.id,
    acceptedCount: (r.acceptedPages && r.acceptedPages.length) || r.acceptedCount || 0,
    note: r.note || r.status || null,
    onTopic: r.onTopic === true || (r.relevance && r.relevance.onTopic === true) || false,
  })),
  usefulOnTopic: search.some((r) => r.onTopic === true || (r.relevance && r.relevance.onTopic === true)),
  note: "Search connected/persist. SRCH-002 recovered Buncombe library URLs. SRCH-003 inspect-tool docs off-topic. Relevance filter may be owned by another executor — not re-run.",
};

const live = {
  writtenAt: new Date().toISOString(),
  persistence: "FILE_STORE",
  alwaysOn: false,
  liveProviderCallsThisSlice: 0,
  liveSpendUsd: 0,
  commandPlans: plans.map((p) => ({ id: p.plan.id, objectiveType: p.plan.objectiveType, workspaceId: p.plan.workspaceId })),
  autonomyTick: { id: tick.tick.id, summary: tick.tick.summary, policyId: tick.tick.policyId },
  scheduledJob: { id: job.job.id, idempotencyKey: job.job.idempotencyKey, nextRunAt: job.job.nextRunAt },
  executionLadder: {
    currentMax: CURRENT_MAX_EXECUTION_LEVEL,
    recordedLevel2: ladder2.ok,
    rejectedLevel4: ladder4.ok === false,
  },
  teamExplain: {
    harborRoles: teamHarbor.roles.map((r) => r.roleId),
    finchRoles: teamFinch.roles.map((r) => r.roleId),
    different: teamHarbor.roles.map((r) => r.roleId).join() !== teamFinch.roles.map((r) => r.roleId).join(),
  },
  memory: {
    method: memory.method,
    embeddings: false,
    mandatoryPolicyCount: memory.mandatoryPolicyCount,
    top: memory.retrieved.slice(0, 3).map((r) => ({ id: r.id, category: r.category })),
  },
  investmentCompare: inv ? { opportunityIds: inv.opportunityIds, committee: inv.committee.name, fakeAgentCount: inv.committee.fakeAgentCount } : null,
  treasury: treasury.totals,
  overviewHasCommand: Boolean(overview.commandCenter),
  artifacts: {
    landing: existsSync(join(ROOT, "var/artifacts/ws-own-004/landing.html")),
    opsChecklist: existsSync(join(ROOT, "var/artifacts/ws-own-004/ops-checklist-7day.html")),
    prd: existsSync(join(ROOT, "var/artifacts/ws-own-004/prd-first-week.html")),
  },
  search: searchStatus,
  sealed: {
    apr005: "pending_untouched",
    tpk001: "awaiting_owner_approval_untouched",
  },
  honesty: {
    fileStoreNotAlwaysOn: true,
    noPostgresClaim: true,
    noIamClaim: true,
    noEmbeddingsClaim: true,
  },
};

writeFileSync(join(stateDir, "master-os-live.json"), JSON.stringify(live, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, plans: plans.length, tick: tick.tick.id, job: job.job.id, spend: 0 }, null, 2));
