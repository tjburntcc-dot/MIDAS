/**
 * Write the judge qualification decision from the measured evidence.
 *
 * This does not run the judge. It reads var/state/judge-v03-runs.json, the
 * ledger every live run appended to, and records the decision that evidence
 * supports. The decision here is "not qualified": no configuration held every
 * gate on more than one run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import {
  persistJudgeQualification,
  JUDGE_PROMPT_VERSION_V03,
  JUDGE_CALIBRATION_OVERALL_GATE,
  JUDGE_CALIBRATION_CLASS_GATE,
} from "../packages/eval/src/evidence-judge.ts";

const LEDGER = join(stateDir(), "judge-v03-runs.json");
const runs = JSON.parse(readFileSync(LEDGER, "utf8"));
const calibration = runs.filter((r) => r.set === "calibration");

const worstPerClass = {};
const bestPerClass = {};
for (const r of calibration) {
  for (const [cls, st] of Object.entries(r.perClass || {})) {
    if (worstPerClass[cls] == null || st.agreement < worstPerClass[cls]) worstPerClass[cls] = st.agreement;
    if (bestPerClass[cls] == null || st.agreement > bestPerClass[cls]) bestPerClass[cls] = st.agreement;
  }
}

const passing = calibration.filter((r) => r.official);
const criticalFA = calibration.reduce((a, r) => a + Number(r.criticalFalseAccept || 0), 0);
const usd = calibration.reduce((a, r) => a + Number(r.usdEstimate || 0), 0);

// Binary supports vs not-supports agreement, recomputed from the recorded misses.
const binary = calibration.map((r) => {
  const crossings = (r.misses || []).filter((m) => (m.expected === "supports") !== (m.predicted === "supports")).length;
  return (r.n - crossings) / r.n;
});

const qualification = {
  qualified: false,
  judgePromptVersion: JUDGE_PROMPT_VERSION_V03,
  model: "gpt-4.1-2025-04-14 and gpt-5.4",
  runsPerSuite: null,
  totalRuns: calibration.length,
  worstOverall: Math.min(...calibration.map((r) => r.agreement)),
  worstPerClass: worstPerClass,
  criticalFalseAccepts: criticalFA,
  gates: {
    overall: JUDGE_CALIBRATION_OVERALL_GATE,
    perClass: JUDGE_CALIBRATION_CLASS_GATE,
    criticalFalseAccept: 0,
    everyRunMustPass: true,
  },
  heldOutSuites: ["adversarial", "overrides"],
  usdEstimate: Number(usd.toFixed(4)),
  runs: calibration.map((r) => ({
    at: r.at,
    judgeModel: r.judgeModel,
    judgePromptVersion: r.judgePromptVersion,
    batchSize: r.batchSize,
    orderSeed: r.orderSeed,
    agreement: r.agreement,
    perClass: r.perClass,
    criticalFalseAccept: r.criticalFalseAccept,
    falseAcceptRate: r.falseAcceptRate,
    official: r.official,
  })),
  reason:
    "No configuration held every gate on more than one run. " +
    calibration.length + " live calibration runs across two judge models, four prompt revisions and three batch sizes; " +
    passing.length + " met all gates. The class that fails moves with the configuration rather than staying fixed, " +
    "which indicates the four-way verdict split is at the edge of what these models decide reliably, not a missing prompt rule.",
};

const store = new FileStore(stateDir());
const record = persistJudgeQualification(store, qualification);

const summary = {
  writtenAt: new Date().toISOString(),
  decision: "not_activated",
  gatesWeakened: false,
  calibrationRuns: calibration.length,
  runsMeetingEveryGate: passing.length,
  worstPerClass: worstPerClass,
  bestPerClass: bestPerClass,
  criticalFalseAcceptsTotal: criticalFA,
  binarySupportsVsNotSupports: {
    min: Number(Math.min(...binary).toFixed(4)),
    mean: Number((binary.reduce((a, b) => a + b, 0) / binary.length).toFixed(4)),
    max: Number(Math.max(...binary).toFixed(4)),
    note: "scoreSemanticFromJudgments consumes only the supports verdict, so this is the distinction the evidence dimension actually depends on.",
  },
  usdSpent: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "judge-v03-decision.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");

console.log(JSON.stringify(summary, null, 2));
console.log("activation record activated =", record.activated);
