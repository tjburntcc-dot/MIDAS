/**
 * Promotion gate for Opportunity Qualifier v2, the fix for the expiry defect
 * found in live use.
 *
 * The comparison is built to avoid the obvious rig. Extending the taxonomy gives
 * v2 an output code the promoted v1 cannot emit at all, so beating v1 on expiry
 * cases would measure "has the field", not "learned the policy". Three arms
 * separate those:
 *
 *   oq-v1-schema2  control  -- v1 knowledge, v2 output contract. The code is
 *                              available; the policy was never taught.
 *   oq-v2-placebo  control  -- control plus irrelevant text of the same length
 *                              as the expiry policy.
 *   oq-v2          candidate-- control plus the expiry policy.
 *
 * oq-v1 is also run for reference to quantify what the taxonomy gap cost, but it
 * is explicitly excluded from the gate: a different output contract is not a
 * like-for-like comparison.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/qualifier-promote-v2.mjs [trials]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, loadSealedSet, qualifierSpec, qualifierVersionDefs,
  QUALIFIER_V1_ID, QUALIFIER_V1_SCHEMA2_ID, QUALIFIER_V2_PLACEBO_ID, QUALIFIER_V2_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans } from "../packages/eval/src/worker-spec.ts";
import { compareEvalRuns } from "../packages/eval/src/compare.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

/** Declared before any run in this file executes. */
export const PROMOTION_CRITERIA_V2 = {
  minGainOverControl: 3.0,
  minGainBeyondPlacebo: 2.0,
  maxDimensionRegression: 5.0,
  maxNewCriticalFailures: 0,
  requireZeroUnsupportedBelowMinimum: true,
  requireNoRegressionOnLiveDeadlineCases: true,
  requireAllTrialsConclusive: true,
  requireGainInEveryTrial: true,
  liveDeadlineCaseIds: ["OQ-S22", "OQ-S23", "OQ-S24"],
  note: "The candidate must beat a control that already has the new output code, beat a length-matched placebo, eliminate the specific live failure, and not start declaring live opportunities expired now that the code exists.",
};

const trials = Number(process.argv[2] || 3);

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const sealed = loadSealedSet("v1");
console.log("sealed v1:", sealed.cases.length, "cases, hash verified", sealed.sha256.slice(0, 16));

const defs = qualifierVersionDefs();
const lenOf = (id) => defs[id].promptBundle.system.length;
const base = lenOf(QUALIFIER_V1_SCHEMA2_ID);
console.log("added text -- expiry policy", lenOf(QUALIFIER_V2_ID) - base, "chars | placebo", lenOf(QUALIFIER_V2_PLACEBO_ID) - base, "chars");

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

function responderFor(versionId, model, spec) {
  const provider = new OpenAIResponsesProvider(undefined, model);
  return async (record) => {
    const req = buildQualifierRequest(versionId, record);
    const completion = await withRetry(() => provider.complete({
      input: req.input, instructions: req.instructions, outputSchema: req.outputSchema,
    }));
    if (completion.kind !== "live") throw new Error("non-live completion");
    const u = completion.usage || {};
    const check = validateAgainstSchema(completion.text, spec.outputSchema);
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

// Every gated arm is scored under spec v2 so the scoring model is identical.
// The reference arm is scored under its own spec and kept out of the gate.
const ARMS = [
  { id: QUALIFIER_V1_SCHEMA2_ID, arm: "control", specForScoring: "v2", gated: true },
  { id: QUALIFIER_V2_PLACEBO_ID, arm: "placebo", specForScoring: "v2", gated: true },
  { id: QUALIFIER_V2_ID, arm: "candidate", specForScoring: "v2", gated: true },
  { id: QUALIFIER_V1_ID, arm: "reference_v1", specForScoring: "v1", gated: false },
];

const runs = {};
let usd = 0;
for (const a of ARMS) {
  const version = ensureQualifierVersion(store, a.id);
  const spec = qualifierSpec(a.specForScoring);
  runs[a.id] = [];
  for (let t = 0; t < trials; t += 1) {
    const summary = await runWorkerEval({
      store, spec, versionId: a.id,
      suiteId: "hemmer-opportunity-qualifier-sealed-v1",
      suiteVersion: "hemmer-opportunity-qualifier-sealed-v1",
      cases: sealed.cases, respond: responderFor(a.id, version.modelProfile.model, spec),
      arm: a.arm, trialIndex: t, responderKind: "live", sealed: a.gated,
      note: "sealed v1 trial " + t + " for " + a.id + " scored under spec " + a.specForScoring,
    });
    usd += summary.cost.usdEstimate;
    runs[a.id].push(summary);
    const cfs = summary.criticalFailures.map((f) => f.code);
    console.log("  " + a.id.padEnd(14) + " trial " + t + ": mean " +
      (summary.meanWeightedTotal == null ? "n/a" : summary.meanWeightedTotal.toFixed(2)) +
      " scored " + summary.scored + "/" + summary.n +
      " CF " + (cfs.length ? cfs.join(",") : "none") + (summary.inconclusive ? " INCONCLUSIVE" : ""));
  }
}

const meanOf = (list) => list.reduce((a, s) => a + (s.meanWeightedTotal || 0), 0) / list.length;
const controlMean = meanOf(runs[QUALIFIER_V1_SCHEMA2_ID]);
const placeboMean = meanOf(runs[QUALIFIER_V2_PLACEBO_ID]);
const candidateMean = meanOf(runs[QUALIFIER_V2_ID]);
const referenceMean = meanOf(runs[QUALIFIER_V1_ID]);

const dimsFor = (list) => {
  const acc = {};
  for (const s of list) {
    const m = dimensionMeans(s.results);
    for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] || 0) + v / list.length;
  }
  return acc;
};
const controlDims = dimsFor(runs[QUALIFIER_V1_SCHEMA2_ID]);
const candidateDims = dimsFor(runs[QUALIFIER_V2_ID]);
const regressions = Object.keys(controlDims)
  .map((k) => ({ dimension: k, control: controlDims[k], candidate: candidateDims[k] || 0, delta: (candidateDims[k] || 0) - controlDims[k] }))
  .filter((d) => d.delta < -PROMOTION_CRITERIA_V2.maxDimensionRegression);

const comparisons = [];
for (let t = 0; t < trials; t += 1) {
  const cmp = compareEvalRuns(store, runs[QUALIFIER_V1_SCHEMA2_ID][t].runId, runs[QUALIFIER_V2_ID][t].runId);
  comparisons.push({
    trial: t, meanDelta: cmp.meanDelta, inconclusive: cmp.inconclusive,
    criticalFailuresIntroduced: cmp.criticalFailuresIntroducedByChallenger,
    regressedCases: cmp.cases.filter((c) => c.delta != null && c.delta < 0).map((c) => ({ caseId: c.caseId, delta: c.delta })),
  });
}

// Did adding the code make the worker start declaring live opportunities expired?
function liveDeadlineScore(list) {
  let total = 0;
  let n = 0;
  for (const s of list) {
    for (const r of s.results) {
      if (!PROMOTION_CRITERIA_V2.liveDeadlineCaseIds.includes(r.caseId)) continue;
      if (r.scoreStatus !== "scored") continue;
      total += r.weightedTotal;
      n += 1;
    }
  }
  return n ? total / n : null;
}
const liveControl = liveDeadlineScore(runs[QUALIFIER_V1_SCHEMA2_ID]);
const liveCandidate = liveDeadlineScore(runs[QUALIFIER_V2_ID]);

function falseExpiries(list) {
  const out = [];
  for (const s of list) {
    for (const r of s.results) {
      if (!r.output) continue;
      const gold = sealed.cases.find((c) => c.case_id === r.caseId);
      const expectedExpired = (gold.gold.disqualifiers || []).includes("opportunity_expired");
      if (!expectedExpired && (r.output.disqualifiers || []).includes("opportunity_expired")) out.push(r.caseId);
    }
  }
  return out;
}

const candidateCFs = runs[QUALIFIER_V2_ID].flatMap((s) => s.criticalFailures);
const controlCFs = runs[QUALIFIER_V1_SCHEMA2_ID].flatMap((s) => s.criticalFailures);
const unsupportedBelowMin = candidateCFs.filter((f) => f.code === "CF-UNSUPPORTED-BELOW-MINIMUM");
const newCritical = comparisons.flatMap((c) => c.criticalFailuresIntroduced);
const anyInconclusive = ARMS.filter((a) => a.gated).some((a) => runs[a.id].some((s) => s.inconclusive));
const gainEveryTrial = runs[QUALIFIER_V2_ID].every((s, i) => (s.meanWeightedTotal || 0) > (runs[QUALIFIER_V1_SCHEMA2_ID][i].meanWeightedTotal || 0));
const falseExp = falseExpiries(runs[QUALIFIER_V2_ID]);

const checks = [
  { id: "gain_over_control", pass: candidateMean - controlMean >= PROMOTION_CRITERIA_V2.minGainOverControl, detail: (candidateMean - controlMean).toFixed(2) + " >= " + PROMOTION_CRITERIA_V2.minGainOverControl },
  { id: "gain_beyond_placebo", pass: candidateMean - placeboMean >= PROMOTION_CRITERIA_V2.minGainBeyondPlacebo, detail: (candidateMean - placeboMean).toFixed(2) + " >= " + PROMOTION_CRITERIA_V2.minGainBeyondPlacebo },
  { id: "no_new_critical_failures", pass: newCritical.length <= PROMOTION_CRITERIA_V2.maxNewCriticalFailures, detail: newCritical.length + " introduced" },
  { id: "live_failure_eliminated", pass: unsupportedBelowMin.length === 0, detail: unsupportedBelowMin.length + " CF-UNSUPPORTED-BELOW-MINIMUM in candidate (control had " + controlCFs.filter((f) => f.code === "CF-UNSUPPORTED-BELOW-MINIMUM").length + ")" },
  { id: "no_over_application_of_expiry", pass: falseExp.length === 0, detail: falseExp.length ? "declared expired on live cases: " + falseExp.join(", ") : "none" },
  { id: "live_deadline_cases_not_regressed", pass: liveCandidate != null && liveControl != null && liveCandidate >= liveControl - 1e-9, detail: "candidate " + (liveCandidate == null ? "n/a" : liveCandidate.toFixed(2)) + " vs control " + (liveControl == null ? "n/a" : liveControl.toFixed(2)) },
  { id: "no_dimension_regression", pass: regressions.length === 0, detail: regressions.length ? regressions.map((r) => r.dimension + " " + r.delta.toFixed(1)).join(", ") : "none beyond " + PROMOTION_CRITERIA_V2.maxDimensionRegression },
  { id: "all_trials_conclusive", pass: !anyInconclusive, detail: anyInconclusive ? "at least one gated arm inconclusive" : "all conclusive" },
  { id: "gain_in_every_trial", pass: gainEveryTrial, detail: gainEveryTrial ? "yes" : "no" },
];
const promote = checks.every((c) => c.pass);

const decision = {
  at: new Date().toISOString(),
  worker: "opportunity_qualifier",
  candidate: QUALIFIER_V2_ID, control: QUALIFIER_V1_SCHEMA2_ID, placebo: QUALIFIER_V2_PLACEBO_ID,
  referenceOnly: { id: QUALIFIER_V1_ID, mean: referenceMean, note: "Scored under spec v1, which has no expiry code. Excluded from the gate: a different output contract is not a like-for-like comparison. Reported to quantify what the taxonomy gap cost." },
  sealedSet: "hemmer-opportunity-qualifier-sealed-v1", sealedSetHash: sealed.sha256, sealedCaseCount: sealed.cases.length,
  trials, criteria: PROMOTION_CRITERIA_V2,
  means: { control: controlMean, placebo: placeboMean, candidate: candidateMean, reference_v1: referenceMean },
  dimensionMeans: { control: controlDims, candidate: candidateDims },
  liveDeadlineCases: { control: liveControl, candidate: liveCandidate, caseIds: PROMOTION_CRITERIA_V2.liveDeadlineCaseIds },
  falseExpiryDeclarations: falseExp,
  criticalFailures: { control: controlCFs, candidate: candidateCFs },
  regressions, comparisons, checks, promote,
  usdEstimate: Number(usd.toFixed(4)),
  evidenceNote: "Evidence quality remains deterministic-only; the unqualified semantic judge is unweighted and did not influence this decision.",
};
writeFileSync(join(stateDir(), "qualifier-promotion-v2.json"), JSON.stringify(decision, null, 2) + "\n", "utf8");

if (promote) {
  store.putDecision({
    id: "PROMO-OQ-V2", evalRunId: runs[QUALIFIER_V2_ID][0].runId, agentId: "opportunity_qualifier",
    fromVersionId: QUALIFIER_V1_ID, toVersionId: QUALIFIER_V2_ID, kind: "promotion", decidedAt: decision.at,
    sealedSetHash: sealed.sha256, trials, controlVersionId: QUALIFIER_V1_SCHEMA2_ID,
    meanControl: controlMean, meanCandidate: candidateMean, meanPlacebo: placeboMean, criteria: PROMOTION_CRITERIA_V2, checks,
    note: "Promoted against a control holding the same output contract, so the gain is attributable to the taught policy rather than to the added output code.",
  });
}

console.log("\n=== PROMOTION DECISION: oq-v2 ===");
console.log("  reference oq-v1 (spec v1, not gated)", referenceMean.toFixed(2));
console.log("  control   oq-v1-schema2             ", controlMean.toFixed(2));
console.log("  placebo   oq-v2-placebo             ", placeboMean.toFixed(2));
console.log("  candidate oq-v2                     ", candidateMean.toFixed(2));
console.log("  gain vs control " + (candidateMean - controlMean).toFixed(2) + " | gain vs placebo " + (candidateMean - placeboMean).toFixed(2));
for (const c of checks) console.log("  [" + (c.pass ? "PASS" : "FAIL") + "] " + c.id + " -- " + c.detail);
console.log("  DECISION:", promote ? "PROMOTE oq-v2" : "DO NOT PROMOTE");
console.log("  usd", decision.usdEstimate);
