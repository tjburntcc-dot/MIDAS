/**
 * Promotion decision for the Opportunity Qualifier.
 *
 * The criteria below are declared in source before the sealed runs execute, so
 * the threshold cannot be chosen after seeing the numbers. Comparison and
 * regression detection use `compareEvalRuns`, written for Atlas and reused here
 * without modification.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/qualifier-promote.mjs [trials]
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, loadSealedCases,
  OPPORTUNITY_QUALIFIER_SPEC, QUALIFIER_V0_ID, QUALIFIER_V1_ID, QUALIFIER_PLACEBO_ID,
  placeboLengthDelta,
} from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans } from "../packages/eval/src/worker-spec.ts";
import { compareEvalRuns } from "../packages/eval/src/compare.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

/** Declared before any sealed run. Changing these after seeing results invalidates the decision. */
export const PROMOTION_CRITERIA = {
  minMeanGainOverBaseline: 5.0,
  minGainBeyondPlacebo: 3.0,
  maxDimensionRegression: 5.0,
  maxNewCriticalFailures: 0,
  requireAllTrialsConclusive: true,
  requireGainInEveryTrial: true,
  note: "A candidate must beat the frozen baseline on sealed cases, beat it by more than a length-matched placebo does, introduce no critical failure, regress no dimension materially, and do so in every trial rather than on average.",
};

const trials = Number(process.argv[2] || 3);

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const { cases, sha256 } = loadSealedCases();
console.log("sealed set", cases.length, "cases, hash verified", sha256.slice(0, 16));
console.log("placebo length match", JSON.stringify(placeboLengthDelta()));

const RETRYABLE = /\b(429|500|502|503|504)\b|rate_limit|overloaded|timeout|ETIMEDOUT|ECONNRESET|UND_ERR_SOCKET|fetch failed|socket hang up/i;
async function withRetry(fn) {
  let last = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try { return await fn(); } catch (err) {
      last = err;
      if (!RETRYABLE.test(String(err && err.message))) throw err;
      await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * Math.pow(2, attempt))));
    }
  }
  throw last;
}

function responderFor(versionId, model) {
  const provider = new OpenAIResponsesProvider(undefined, model);
  return async (record) => {
    const req = buildQualifierRequest(versionId, record);
    const completion = await withRetry(() => provider.complete({
      input: req.input, instructions: req.instructions, outputSchema: req.outputSchema,
    }));
    if (completion.kind !== "live") throw new Error("non-live completion");
    const u = completion.usage || {};
    const check = validateAgainstSchema(completion.text, OPPORTUNITY_QUALIFIER_SPEC.outputSchema);
    return {
      output: check.ok ? check.value : null,
      schemaOk: check.ok,
      error: check.ok ? null : "schema",
      cost: {
        inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0),
        totalTokens: Number(u.totalTokens || 0), usdEstimate: estimateUsd(u.inputTokens, u.outputTokens),
      },
    };
  };
}

const ARMS = [
  { id: QUALIFIER_V0_ID, arm: "baseline" },
  { id: QUALIFIER_V1_ID, arm: "relevant" },
  { id: QUALIFIER_PLACEBO_ID, arm: "placebo" },
];

const runs = {};
let usd = 0;
for (const a of ARMS) {
  const version = ensureQualifierVersion(store, a.id);
  runs[a.id] = [];
  for (let t = 0; t < trials; t += 1) {
    const summary = await runWorkerEval({
      store, spec: OPPORTUNITY_QUALIFIER_SPEC, versionId: a.id,
      suiteId: "hemmer-opportunity-qualifier-sealed-v0",
      suiteVersion: "hemmer-opportunity-qualifier-sealed-v0",
      cases, respond: responderFor(a.id, version.modelProfile.model),
      arm: a.arm, trialIndex: t, responderKind: "live", sealed: true,
      note: "sealed promotion trial " + t + " for " + a.id,
    });
    usd += summary.cost.usdEstimate;
    runs[a.id].push(summary);
    console.log("  " + a.id + " trial " + t + ": mean " +
      (summary.meanWeightedTotal == null ? "n/a" : summary.meanWeightedTotal.toFixed(2)) +
      " scored " + summary.scored + "/" + summary.n +
      " criticalFailures " + summary.criticalFailures.length +
      (summary.inconclusive ? " INCONCLUSIVE" : ""));
  }
}

const meanOf = (list) => list.reduce((a, s) => a + (s.meanWeightedTotal || 0), 0) / list.length;
const v0Mean = meanOf(runs[QUALIFIER_V0_ID]);
const v1Mean = meanOf(runs[QUALIFIER_V1_ID]);
const plMean = meanOf(runs[QUALIFIER_PLACEBO_ID]);

const dimsFor = (list) => {
  const acc = {};
  for (const s of list) {
    const m = dimensionMeans(s.results);
    for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] || 0) + v / list.length;
  }
  return acc;
};
const v0Dims = dimsFor(runs[QUALIFIER_V0_ID]);
const v1Dims = dimsFor(runs[QUALIFIER_V1_ID]);

const regressions = Object.keys(v0Dims)
  .map((k) => ({ dimension: k, v0: v0Dims[k], v1: v1Dims[k] || 0, delta: (v1Dims[k] || 0) - v0Dims[k] }))
  .filter((d) => d.delta < -PROMOTION_CRITERIA.maxDimensionRegression);

// Regression detection per matched trial, using the Atlas comparison unchanged.
const comparisons = [];
for (let t = 0; t < trials; t += 1) {
  const cmp = compareEvalRuns(store, runs[QUALIFIER_V0_ID][t].runId, runs[QUALIFIER_V1_ID][t].runId);
  comparisons.push({
    trial: t,
    meanDelta: cmp.meanDelta,
    inconclusive: cmp.inconclusive,
    criticalFailuresIntroduced: cmp.criticalFailuresIntroducedByChallenger,
    regressedCases: cmp.cases.filter((c) => c.delta != null && c.delta < 0).map((c) => ({ caseId: c.caseId, delta: c.delta })),
  });
}

const newCritical = comparisons.flatMap((c) => c.criticalFailuresIntroduced);
const anyInconclusive = ARMS.some((a) => runs[a.id].some((s) => s.inconclusive));
const gainEveryTrial = runs[QUALIFIER_V1_ID].every((s, i) => (s.meanWeightedTotal || 0) > (runs[QUALIFIER_V0_ID][i].meanWeightedTotal || 0));

const checks = [
  { id: "gain_over_baseline", pass: v1Mean - v0Mean >= PROMOTION_CRITERIA.minMeanGainOverBaseline, detail: (v1Mean - v0Mean).toFixed(2) + " >= " + PROMOTION_CRITERIA.minMeanGainOverBaseline },
  { id: "gain_beyond_placebo", pass: v1Mean - plMean >= PROMOTION_CRITERIA.minGainBeyondPlacebo, detail: (v1Mean - plMean).toFixed(2) + " >= " + PROMOTION_CRITERIA.minGainBeyondPlacebo },
  { id: "no_new_critical_failures", pass: newCritical.length <= PROMOTION_CRITERIA.maxNewCriticalFailures, detail: newCritical.length + " introduced" },
  { id: "no_dimension_regression", pass: regressions.length === 0, detail: regressions.length ? regressions.map((r) => r.dimension + " " + r.delta.toFixed(1)).join(", ") : "none beyond " + PROMOTION_CRITERIA.maxDimensionRegression },
  { id: "all_trials_conclusive", pass: !anyInconclusive, detail: anyInconclusive ? "at least one arm inconclusive" : "all conclusive" },
  { id: "gain_in_every_trial", pass: gainEveryTrial, detail: gainEveryTrial ? "yes" : "no" },
];
const promote = checks.every((c) => c.pass);

const decision = {
  at: new Date().toISOString(),
  worker: "opportunity_qualifier",
  candidate: QUALIFIER_V1_ID,
  baseline: QUALIFIER_V0_ID,
  placebo: QUALIFIER_PLACEBO_ID,
  sealedSetHash: sha256,
  sealedCaseCount: cases.length,
  trials,
  criteria: PROMOTION_CRITERIA,
  means: { baseline: v0Mean, candidate: v1Mean, placebo: plMean },
  dimensionMeans: { baseline: v0Dims, candidate: v1Dims },
  regressions,
  comparisons,
  checks,
  promote,
  criticalFailuresBaseline: runs[QUALIFIER_V0_ID].flatMap((s) => s.criticalFailures),
  criticalFailuresCandidate: runs[QUALIFIER_V1_ID].flatMap((s) => s.criticalFailures),
  usdEstimate: Number(usd.toFixed(4)),
  evidenceNote: "Evidence quality is scored deterministically only. The semantic evidence judge is unqualified and its reading is carried as an unweighted advisory dimension, so it cannot have moved this decision.",
};

writeFileSync(join(stateDir(), "qualifier-promotion.json"), JSON.stringify(decision, null, 2) + "\n", "utf8");

if (promote) {
  store.putDecision({
    id: "PROMO-OQ-V1",
    evalRunId: runs[QUALIFIER_V1_ID][0].runId,
    agentId: "opportunity_qualifier",
    fromVersionId: QUALIFIER_V0_ID,
    toVersionId: QUALIFIER_V1_ID,
    kind: "promotion",
    decidedAt: decision.at,
    sealedSetHash: sha256,
    trials,
    meanBaseline: v0Mean,
    meanCandidate: v1Mean,
    meanPlacebo: plMean,
    criteria: PROMOTION_CRITERIA,
    checks,
    note: "Promoted on sealed evidence with a length-matched placebo control. Evidence dimension deterministic only.",
  });
}

console.log("\n=== PROMOTION DECISION ===");
console.log("  baseline mean ", v0Mean.toFixed(2));
console.log("  placebo mean  ", plMean.toFixed(2));
console.log("  candidate mean", v1Mean.toFixed(2));
console.log("  gain vs base  ", (v1Mean - v0Mean).toFixed(2));
console.log("  gain vs placebo", (v1Mean - plMean).toFixed(2));
for (const c of checks) console.log("  [" + (c.pass ? "PASS" : "FAIL") + "] " + c.id + " -- " + c.detail);
console.log("  DECISION:", promote ? "PROMOTE " + QUALIFIER_V1_ID : "DO NOT PROMOTE");
console.log("  usd", decision.usdEstimate);
