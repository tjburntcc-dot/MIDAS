/** Continue MIDAS: jobs-stage from LIVE teach-retrieve. $0 model. Do not decide APR-005. */
import { FileStore } from "@midas/db";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runJobsStageHarbor,
  writeJobsStageReports,
  updateCapabilityMatrixForJobsStage,
  HARBOR_WORKSPACE_ID,
} from "/workspace/midas/packages/eval/src/jobs-stage.ts";

const STATE = "/workspace/midas/var/state";
const store = new FileStore(STATE);

function apr005Status() {
  const rows = store.listApprovalRequests ? store.listApprovalRequests() : [];
  const apr = rows.find((r) => r.id === "APR-005");
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

const result = runJobsStageHarbor(store, { stateDir: STATE });

const reports = writeJobsStageReports(result, {
  stateDir: STATE,
  tests: "pending_runner_will_fill",
});

updateCapabilityMatrixForJobsStage({
  note: "worker tick + LEVEL 3 staged flyer + NOT_INTEGRATED catalog ($0)",
  jobId: "JOB-001",
  firstOutcome: result.tickProof.first.outcome,
  secondNoop: result.tickProof.second.noop,
  recoveryOutcome: result.tickProof.recovery.outcome,
  flyerPath: result.flyer.relativeArtifactPath,
  ladder4Refused: result.refusals.level4.refused,
  ladder5Refused: result.refusals.level5.refused,
  catalogNotIntegrated: result.catalog.allNotIntegrated,
  costUsd: 0,
  tests: "pending_runner_will_fill",
});

const afterApr = apr005Status();
const summary = {
  jobTick: {
    first: result.tickProof.first,
    second: result.tickProof.second,
    recovery: result.tickProof.recovery,
    lastHeartbeatAt: result.tickProof.finalJob.lastHeartbeatAt,
    nextRunAt: result.tickProof.finalJob.nextRunAt,
  },
  stagedFlyerPath: result.flyer.relativeArtifactPath,
  absoluteFlyerPath: result.flyer.artifactPath,
  ladderRefusal: result.refusals,
  catalogNotIntegrated: result.catalog.allNotIntegrated,
  costUsd: 0,
  modelCalls: 0,
  apr005: afterApr,
  apr005Untouched: beforeApr === "pending" && afterApr === "pending",
  tpk001: result.tpk001,
  tpk001Untouched: result.tpk001Untouched,
  hcl001Intact: result.hcl001Intact && beforeHcl,
  reports,
};
writeFileSync(join(STATE, "jobs-stage-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
