/** Write Mission 16 FILE_STORE records. Zero provider calls. */
import { writeFileSync } from "node:fs";
import { FileStore } from "@midas/db";
import { applyMission16 } from "./mission16-apply.ts";
import { mission16Review } from "./mission16-review.ts";
import { calibrationCasesHash, runEvaluatorCalibration } from "./evaluator-revision.ts";

const store = new FileStore(process.env.MIDAS_STATE_DIR || "/workspace/midas/var/state");
const applied = applyMission16(store, { workspaceId: "ws-ridgeline" });
const review = mission16Review(store, { workspaceId: "ws-ridgeline" });
const cal = runEvaluatorCalibration();

const payload = {
  writtenAt: new Date().toISOString(),
  writtenAtET: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET",
  persistence: "FILE_STORE",
  notIAM: true,
  notPostgres: true,
  providerCalls: 0,
  liveApiUsd: 0,
  applied: {
    ok: applied.ok,
    providerCalls: applied.providerCalls,
    preserved: applied.preserved,
    parentEvaluatorId: applied.parentEvaluatorId,
    watcher: applied.watcher,
    progression: applied.progression && {
      status: applied.progression.status,
      previousStatus: applied.progression.previousStatus,
      promoted: applied.progression.promoted,
      applied: applied.progression.applied,
    },
    evaluationFailedIds: applied.evaluation && applied.evaluation.failedIds,
    revisionId: applied.activation && applied.activation.revision && applied.activation.revision.id,
    revisionHash: applied.activation && applied.activation.revision && applied.activation.revision.contentHash,
    calibrationHash: applied.activation && applied.activation.calibration && applied.activation.calibration.fixtureHash,
    calibrationCount: applied.activation && applied.activation.calibration && applied.activation.calibration.caseCount,
    byClass: applied.activation && applied.activation.calibration && applied.activation.calibration.byClass,
    bakeoff: applied.bakeoffRescore && {
      id: applied.bakeoffRescore.id,
      parent: applied.bakeoffRescore.parentBakeoffId,
      original: applied.bakeoffRescore.byArmOriginal,
      corrected: applied.bakeoffRescore.byArmCorrected,
      changed: applied.bakeoffRescore.changedJudgments,
      remaining: applied.bakeoffRescore.remainingGenuineCriticalFailures,
    },
  },
  review: review,
  calibration: {
    caseCount: cal.caseCount,
    fixtureHash: cal.fixtureHash,
    qualified: cal.qualified,
    gates: cal.gates,
    byClass: cal.byClass,
    hashFn: calibrationCasesHash(),
  },
};

writeFileSync("/workspace/midas/var/state/mission16-live.json", JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  ok: applied.ok,
  providerCalls: applied.providerCalls,
  revision: payload.applied.revisionId,
  hash: payload.applied.revisionHash,
  progression: payload.applied.progression,
  watcher: applied.watcher,
  preserved: applied.preserved,
  failedIds: payload.applied.evaluationFailedIds,
}, null, 2));
