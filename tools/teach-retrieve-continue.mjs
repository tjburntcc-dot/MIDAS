/** Continue MIDAS: teach-retrieve from LIVE SBR-002. $0 model. Do not decide APR-005. */
import { FileStore, repoPath, stateDir } from "@midas/db";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runTeachRetrieveHarbor,
  writeTeachRetrieveReports,
  updateCapabilityMatrixForTeachRetrieve,
  HARBOR_WORKSPACE_ID,
} from "../packages/eval/src/teach-retrieve.ts";

const STATE = stateDir();
const store = new FileStore(STATE);

function apr005Status() {
  const rows = store.listApprovalRequests ? store.listApprovalRequests() : [];
  const apr = rows.find((r) => r.id === "APR-005") || (store.getApprovalRequest && store.getApprovalRequest("APR-005"));
  return apr && apr.status;
}

function hclIntact() {
  try {
    const raw = JSON.parse(readFileSync(join(STATE, "historical_contamination.json"), "utf8"));
    const rows = Array.isArray(raw) ? raw : [raw];
    const h = rows.find((r) => r && r.id === "HCL-001");
    return Boolean(h && h.rewritten === false && h.erased === false);
  } catch {
    return false;
  }
}

const beforeApr = apr005Status();
const beforeHcl = hclIntact();
if (beforeApr !== "pending") console.error("WARN: APR-005 was not pending before run:", beforeApr);
if (!beforeHcl) console.error("WARN: HCL-001 not intact before run");

const ws = store.getWorkspace(HARBOR_WORKSPACE_ID);
if (!ws || !/Harbor Oak/i.test(ws.name || "")) {
  throw new Error("Expected Harbor Oak at " + HARBOR_WORKSPACE_ID + ", got " + (ws && ws.name));
}
const sbr = (store.listScoutFindings && store.listScoutFindings()) || [];
const harborFindings = sbr.filter((f) => f.workspaceId === HARBOR_WORKSPACE_ID);
if (!harborFindings.length) {
  console.error("WARN: No Harbor scout findings found; continuing with curated SBR-002-backed lessons anyway.");
}

const result = runTeachRetrieveHarbor(store, { stateDir: STATE });

const reports = writeTeachRetrieveReports(result, {
  stateDir: STATE,
  tests: "pending_runner_will_fill",
});

updateCapabilityMatrixForTeachRetrieve({
  note: "teaching_chain + before/after retrieval proof from SBR-002 ($0)",
  summary: {
    marketingPacketId: result.packets.marketingPacketId,
    productPacketId: result.packets.productPacketId,
    improved: result.beforeAfter.difference.improved,
    costUsd: 0,
    tests: "pending_runner_will_fill",
  },
});

const summary = {
  marketingPacketId: result.packets.marketingPacketId,
  productPacketId: result.packets.productPacketId,
  findingIds: result.packets.findingIds,
  knowledgeIds: result.packets.knowledgeIds,
  beforeTaskId: result.beforeAfter.before.taskId,
  afterTaskId: result.beforeAfter.after.taskId,
  retrievedIds: result.beforeAfter.after.retrievedIds,
  difference: result.beforeAfter.difference,
  costUsd: 0,
  modelCalls: 0,
  apr005: result.apr005,
  apr005Untouched: result.apr005Untouched,
  tpk001: result.tpk001,
  tpk001Untouched: result.tpk001Untouched,
  hcl001Intact: result.hcl001Intact && beforeHcl,
  progressionId: result.employeeProgress.progressionId,
  watcherAuditId: result.stages.watcher_audits && result.stages.watcher_audits.auditId,
  reportMd: reports.mdPath,
  reportJson: reports.livePath,
  tests: "pending_runner_will_fill",
};

writeFileSync(join(STATE, "teach-retrieve-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
