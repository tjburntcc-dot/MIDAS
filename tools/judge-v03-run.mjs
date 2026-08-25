/**
 * Run the v0.3 judge against a labelled set N times and report stability.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/judge-v03-run.mjs <calibration|adversarial> <runs>
 *
 * Writes every run to var/state/judge-v03-runs.json so results accumulate across
 * invocations instead of being overwritten.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession } from "@midas/model";
import {
  runV03LiveCalibration,
  runAdversarialV03Live,
  runOverridesV03Live,
  JUDGE_CALIBRATION_OVERALL_GATE,
  JUDGE_CALIBRATION_CLASS_GATE,
} from "../packages/eval/src/evidence-judge.ts";

const which = process.argv[2] || "calibration";
const runs = Number(process.argv[3] || 1);
const batchSize = Number(process.env.JUDGE_BATCH || 8);
const seedBase = process.env.JUDGE_SEED == null ? null : Number(process.env.JUDGE_SEED);
const LEDGER = join(stateDir(), "judge-v03-runs.json");

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) {
    console.error("live provider unavailable:", probe.error);
    process.exit(2);
  }
}

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : [];
let totalUsd = 0;

for (let i = 0; i < runs; i += 1) {
  const runner = which === "adversarial" ? runAdversarialV03Live
    : which === "overrides" ? runOverridesV03Live
    : runV03LiveCalibration;
  const report = await runner({ workerModelFamily: "gpt-4.1", batchSize: batchSize, shuffleSeed: seedBase == null ? null : seedBase + i, judgeModel: process.env.MIDAS_JUDGE_MODEL || undefined });

  if (report.kind !== "live") {
    console.error("run failed:", report.reason);
    process.exit(2);
  }
  totalUsd += Number(report.usdEstimate || 0);

  const perClass = Object.fromEntries(
    Object.entries(report.perClass).map(([k, v]) => [k, Number(v.agreement.toFixed(4))]),
  );
  const misses = report.rows.filter((r) => !r.agree).map((r) => r.id + ":" + r.expected + "->" + r.predicted);

  console.log("--- " + which + " run " + (i + 1) + "/" + runs + " ---");
  console.log("  set        ", report.setVersion, "n=" + report.n, "judge=" + report.judgeModel, "batch=" + report.batchSize, "orderSeed=" + report.orderSeed);
  console.log("  overall    ", report.agreementPct + "%", "gate " + JUDGE_CALIBRATION_OVERALL_GATE * 100 + "%", report.overallGate ? "PASS" : "FAIL");
  console.log("  perClass   ", JSON.stringify(perClass), "gate " + JUDGE_CALIBRATION_CLASS_GATE, report.classGate ? "PASS" : "FAIL");
  console.log("  criticalFA ", report.criticalFalseAccept, "of", report.criticalFabricated, "critical items");
  console.log("  falseAccept", Number(report.falseAcceptRate.toFixed(4)), " falseReject", Number(report.falseRejectRate.toFixed(4)));
  console.log("  official   ", report.official);
  console.log("  usd        ", report.usdEstimate);
  if (misses.length) console.log("  misses     ", misses.join(", "));

  ledger.push({
    at: new Date().toISOString(),
    set: which,
    batchSize: report.batchSize,
    orderSeed: report.orderSeed,
    setVersion: report.setVersion,
    judgePromptVersion: report.judgePromptVersion,
    judgeModel: report.judgeModel,
    workerModel: report.workerModel,
    n: report.n,
    agreement: report.agreement,
    perClass: report.perClass,
    confusion: report.confusion,
    overallGate: report.overallGate,
    classGate: report.classGate,
    criticalFabricated: report.criticalFabricated,
    criticalFalseAccept: report.criticalFalseAccept,
    falseAcceptRate: report.falseAcceptRate,
    falseRejectRate: report.falseRejectRate,
    official: report.official,
    usdEstimate: report.usdEstimate,
    misses: report.rows.filter((r) => !r.agree).map((r) => ({ id: r.id, class: r.class, expected: r.expected, predicted: r.predicted })),
    rationales: report.judgments ? report.rows.filter((r) => !r.agree).map((r, idx) => {
      const j = report.judgments[report.rows.findIndex((x) => x.id === r.id)];
      return { id: r.id, rationale: j ? j.rationale : null };
    }) : [],
  });
}

writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n", "utf8");
console.log("total usd this invocation:", Number(totalUsd.toFixed(4)), "| ledger entries:", ledger.length);
