
import { FileStore, repoPath, stateDir } from "@midas/db";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  approveCommandPlan, runCommandPlan, founderSpendingView, scoutFromAcceptedUsefulSearch,
  proveRestartSurvival, listFounderEmployees, founderOpportunityCompare,
} from "../packages/eval/src/founder-depth.ts";
import { enrichOpportunityInvestment } from "../packages/eval/src/master-os.ts";
const store = new FileStore(stateDir());
const harbor = "ws-own-004";
const writtenAt = new Date().toISOString();
const plans = (store.listCommandPlans && store.listCommandPlans(harbor)) || [];
let plan = plans.find((p) => p.id === "CPL-003") || plans.find((p) => p.objectiveType === "deliverable") || plans[0];
if (!plan) throw new Error("No Harbor CPL plan");
if (!["owner_approved","partially_executed","executed_internal","running"].includes(plan.status)) {
  approveCommandPlan(store, plan.id, { actor: "local_owner" });
  plan = store.getCommandPlan(plan.id);
}
const run = runCommandPlan(store, plan.id, { dryRun: true });
const scout = scoutFromAcceptedUsefulSearch(store, { workspaceId: harbor, question: "West Asheville library bulletin flyer options Harbor Oak" });
const spending = founderSpendingView(store, {});
const employees = listFounderEmployees(store, { workspaceId: harbor });
const opps = (store.listOpportunities(harbor) || []).slice(0, 2);
let compare = null;
if (opps.length >= 2) {
  for (const o of opps) { try { enrichOpportunityInvestment(store, o.id); } catch {} }
  compare = founderOpportunityCompare(store, opps.map((o) => o.id));
}
const restart = proveRestartSurvival(new FileStore(stateDir()));
const snap = {
  writtenAt, planId: plan.id, planStatus: store.getCommandPlan(plan.id).status,
  executed: run.executedCount, paused: run.pausedCount,
  tick: run.autonomyTick && run.autonomyTick.id,
  artifact: run.artifact,
  watcher: run.watcherAudit && { id: run.watcherAudit.id, status: run.watcherAudit.status },
  stepResults: run.stepResults,
  whyPermitted: (run.stepResults || []).filter((s) => s.decision === "executed_internal").map((s) => s.whyPermitted),
  scout: { activityId: scout.activityId, ranked: scout.ranked, usefulOnTopic: scout.usefulOnTopic, sourceSearchRecordId: scout.sourceSearchRecordId },
  spending: { harbor: spending.harbor, finch: spending.finch, categoriesNeverMixed: spending.categoriesNeverMixed },
  employees: (employees.employees || []).slice(0, 8).map((e) => ({ id: e.id, roleId: e.roleId, honestStatus: e.honestStatus, worldClassClaim: e.worldClassClaim })),
  compare: compare ? { ids: compare.opportunityIds, scoreExplainCount: (compare.scoreExplain || []).length } : null,
  restart,
};
writeFileSync("/tmp/fd-snap.json", JSON.stringify(snap, null, 2));
console.log("CORE_OK", plan.id, run.executedCount, run.pausedCount);
