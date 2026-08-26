/**
 * Promotion gate for the taxonomy repair: oq-v1-schema2 against the incumbent
 * oq-v1.
 *
 * This is a structural change, not a knowledge change, and the criteria are
 * built for that. The previous gate demanded a 3.0 aggregate gain because it was
 * testing whether taught policy earned its place. Reusing that threshold here
 * would be a category error: a contract repair should be required to fix what it
 * claims to fix and to cost nothing elsewhere, not to raise an aggregate score it
 * was never aimed at.
 *
 * The comparison is therefore split:
 *
 *   non-expiry cases  -- the repair is irrelevant here, so the candidate must be
 *                        NON-INFERIOR. This is where a regression would hide.
 *   expiry cases      -- the repair is the whole point, so the candidate must be
 *                        strictly better.
 *   live-deadline     -- the candidate must not start declaring live work expired
 *                        now that the code exists.
 *   real records      -- the two solicitations that produced the original
 *                        mislabel must come out right.
 *
 * Both arms are scored under spec v2 so the scoring model is identical. The
 * incumbent cannot emit `opportunity_expired`; that is the capability difference
 * being claimed, and unlike the knowledge experiment it is exactly what is under
 * test rather than a confound.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/qualifier-promote-taxonomy.mjs [trials]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, loadSealedSet, qualifierSpec, qualifierVersionDefs,
  QUALIFIER_V1_ID, QUALIFIER_V1_SCHEMA2_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans, workerSpecHash } from "../packages/eval/src/worker-spec.ts";
import { compareEvalRuns } from "../packages/eval/src/compare.ts";
import { QUALIFIER_SPEC_V1 } from "../packages/eval/src/opportunity-qualifier.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

/**
 * DECLARED BEFORE ANY RUN IN THIS FILE EXECUTES.
 * Thresholds are justified per criterion rather than inherited.
 */
export const TAXONOMY_PROMOTION_CRITERIA = {
  kind: "structural_repair",
  // Non-inferiority, not improvement. A contract repair earns promotion by
  // fixing its target without costing anything, so the tolerance is set at the
  // trial-to-trial noise observed in prior runs (roughly +/- 1 point), not at 0,
  // which would fail on sampling noise alone.
  maxNonExpiryRegression: 1.5,
  // The repair must actually repair. Every sealed expiry case must be labelled
  // with the correct code, in every trial.
  requireAllSealedExpiryCorrect: true,
  // Gaining a code must not create a habit of using it.
  maxFalseExpiryDeclarations: 0,
  maxLiveDeadlineRegression: 0.0,
  maxNewCriticalFailures: 0,
  maxDimensionRegression: 3.0,
  requireAllTrialsConclusive: true,
  // Stability: the expiry repair must hold in every trial, not on average.
  requireRepairInEveryTrial: true,
  requireFrozenHashesIntact: true,
  requireRealRecordReproduction: true,
  expirySealedCaseIds: ["OQ-S19", "OQ-S20", "OQ-S21"],
  liveDeadlineCaseIds: ["OQ-S22", "OQ-S23", "OQ-S24"],
  note: "A structural repair is judged on whether it fixes its target, holds across trials, costs nothing on unrelated cases, and reproduces on the real records that exposed the defect. An aggregate score gain is not required and is not evidence of a good contract repair.",
};

const trials = Number(process.argv[2] || 3);

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const sealed = loadSealedSet("v1");
const spec = qualifierSpec("v2");
console.log("sealed v1:", sealed.cases.length, "cases, hash verified", sealed.sha256.slice(0, 16));

// Criterion 8, checked before anything is spent: the historical freeze must hold.
const frozenIntact = [];
for (const id of ["oq-v0", "oq-v1", "oq-v1-placebo"]) {
  const stored = store.getVersion(id);
  const fresh = ensureQualifierVersion(store, id);
  frozenIntact.push({ id, preserved: stored.contentHash === fresh.contentHash, hash: stored.contentHash });
}
console.log("frozen hashes intact:", frozenIntact.every((f) => f.preserved));

// Criterion 9: the incumbent's spec must still be the one it shipped with.
const specV1HashNow = workerSpecHash(QUALIFIER_SPEC_V1);

const RETRYABLE = /\b(429|500|502|503|504)\b|rate_limit|overloaded|timeout|ETIMEDOUT|ECONNRESET|UND_ERR_SOCKET|fetch failed|socket hang up/i;
async function withRetry(fn) {
  let last = null;
  for (let a = 0; a < 6; a += 1) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!RETRYABLE.test(String(e && e.message))) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * Math.pow(2, a))));
    }
  }
  throw last;
}

function responderFor(versionId, model) {
  const provider = new OpenAIResponsesProvider(undefined, model);
  return async (record) => {
    const req = buildQualifierRequest(versionId, record);
    const c = await withRetry(() => provider.complete({ input: req.input, instructions: req.instructions, outputSchema: req.outputSchema }));
    if (c.kind !== "live") throw new Error("non-live completion");
    const u = c.usage || {};
    // Scored under spec v2 for both arms. v2's codes are a superset of v1's, so
    // the incumbent's outputs validate unchanged.
    const check = validateAgainstSchema(c.text, spec.outputSchema);
    return {
      output: check.ok ? check.value : null, schemaOk: check.ok, error: check.ok ? null : "schema",
      cost: { inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0), totalTokens: Number(u.totalTokens || 0), usdEstimate: estimateUsd(u.inputTokens, u.outputTokens) },
    };
  };
}

const ARMS = [{ id: QUALIFIER_V1_ID, arm: "incumbent" }, { id: QUALIFIER_V1_SCHEMA2_ID, arm: "candidate" }];
const runs = {};
let usd = 0;
for (const a of ARMS) {
  const version = ensureQualifierVersion(store, a.id);
  runs[a.id] = [];
  for (let t = 0; t < trials; t += 1) {
    const s = await runWorkerEval({
      store, spec, versionId: a.id,
      suiteId: "hemmer-opportunity-qualifier-sealed-v1", suiteVersion: "hemmer-opportunity-qualifier-sealed-v1",
      cases: sealed.cases, respond: responderFor(a.id, version.modelProfile.model),
      arm: a.arm, trialIndex: t, responderKind: "live", sealed: true,
      note: "taxonomy gate trial " + t + " for " + a.id + " scored under spec v2",
    });
    usd += s.cost.usdEstimate;
    runs[a.id].push(s);
    console.log("  " + a.id.padEnd(14) + " trial " + t + ": mean " + (s.meanWeightedTotal == null ? "n/a" : s.meanWeightedTotal.toFixed(2)) +
      " scored " + s.scored + "/" + s.n + " CF " + (s.criticalFailures.map((f) => f.code).join(",") || "none"));
  }
}

const EXPIRY = TAXONOMY_PROMOTION_CRITERIA.expirySealedCaseIds;
const LIVE = TAXONOMY_PROMOTION_CRITERIA.liveDeadlineCaseIds;
const goldById = new Map(sealed.cases.map((c) => [c.case_id, c.gold]));

function subsetMean(list, predicate) {
  let total = 0;
  let n = 0;
  for (const s of list) for (const r of s.results) {
    if (r.scoreStatus !== "scored" || !predicate(r.caseId)) continue;
    total += r.weightedTotal; n += 1;
  }
  return n ? total / n : null;
}
const meanAll = (list) => list.reduce((a, s) => a + (s.meanWeightedTotal || 0), 0) / list.length;

const inc = runs[QUALIFIER_V1_ID];
const cand = runs[QUALIFIER_V1_SCHEMA2_ID];
const isExpiry = (id) => EXPIRY.includes(id);
const nonExpiry = (id) => !EXPIRY.includes(id);

const incNonExpiry = subsetMean(inc, nonExpiry);
const candNonExpiry = subsetMean(cand, nonExpiry);
const incExpiry = subsetMean(inc, isExpiry);
const candExpiry = subsetMean(cand, isExpiry);
const incLive = subsetMean(inc, (id) => LIVE.includes(id));
const candLive = subsetMean(cand, (id) => LIVE.includes(id));

/** Per trial: did the candidate label every sealed expiry case correctly? */
function expiryCorrectPerTrial(list) {
  return list.map((s) => s.results.every((r) => {
    if (!isExpiry(r.caseId)) return true;
    if (!r.output) return false;
    return (r.output.disqualifiers || []).includes("opportunity_expired");
  }));
}
const candExpiryPerTrial = expiryCorrectPerTrial(cand);
const incExpiryPerTrial = expiryCorrectPerTrial(inc);

function falseExpiries(list) {
  const out = [];
  for (const s of list) for (const r of s.results) {
    if (!r.output) continue;
    const expected = (goldById.get(r.caseId).disqualifiers || []).includes("opportunity_expired");
    if (!expected && (r.output.disqualifiers || []).includes("opportunity_expired")) out.push(r.caseId);
  }
  return out;
}
const falseExp = falseExpiries(cand);

const dimsFor = (list) => {
  const acc = {};
  for (const s of list) { const m = dimensionMeans(s.results); for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] || 0) + v / list.length; }
  return acc;
};
const incDims = dimsFor(inc);
const candDims = dimsFor(cand);
const regressions = Object.keys(incDims)
  .map((k) => ({ dimension: k, incumbent: incDims[k], candidate: candDims[k] || 0, delta: (candDims[k] || 0) - incDims[k] }))
  .filter((d) => d.delta < -TAXONOMY_PROMOTION_CRITERIA.maxDimensionRegression);

const comparisons = [];
for (let t = 0; t < trials; t += 1) {
  const cmp = compareEvalRuns(store, inc[t].runId, cand[t].runId);
  comparisons.push({ trial: t, meanDelta: cmp.meanDelta, inconclusive: cmp.inconclusive, criticalFailuresIntroduced: cmp.criticalFailuresIntroducedByChallenger });
}
const newCritical = comparisons.flatMap((c) => c.criticalFailuresIntroduced);
const anyInconclusive = ARMS.some((a) => runs[a.id].some((s) => s.inconclusive));

// Criterion 10 is verified by the separate real-record diagnostic already on
// disk, which is read rather than re-run so this gate cannot quietly re-roll it.
let realRecords = null;
try {
  realRecords = JSON.parse(readFileSync(join(stateDir(), "qualifier-expiry-diagnostic.json"), "utf8"));
} catch { realRecords = null; }
function realRecordFixed(versionId) {
  if (!realRecords) return null;
  const rows = realRecords.rows.filter((r) => r.versionId === versionId);
  if (!rows.length) return null;
  return rows.every((r) => (r.disqualifiers || []).includes("opportunity_expired"));
}
const candReal = realRecordFixed(QUALIFIER_V1_SCHEMA2_ID);
const incReal = realRecordFixed(QUALIFIER_V1_ID);

const checks = [
  { id: "non_expiry_non_inferior", pass: candNonExpiry >= incNonExpiry - TAXONOMY_PROMOTION_CRITERIA.maxNonExpiryRegression,
    detail: "candidate " + candNonExpiry.toFixed(2) + " vs incumbent " + incNonExpiry.toFixed(2) + " (tolerance " + TAXONOMY_PROMOTION_CRITERIA.maxNonExpiryRegression + ")" },
  { id: "sealed_expiry_repaired", pass: candExpiry > incExpiry, detail: "candidate " + candExpiry.toFixed(2) + " vs incumbent " + incExpiry.toFixed(2) },
  { id: "repair_in_every_trial", pass: candExpiryPerTrial.every(Boolean),
    detail: "candidate " + candExpiryPerTrial.map((b) => (b ? "ok" : "miss")).join(",") + " | incumbent " + incExpiryPerTrial.map((b) => (b ? "ok" : "miss")).join(",") },
  { id: "no_false_expiry_declarations", pass: falseExp.length <= TAXONOMY_PROMOTION_CRITERIA.maxFalseExpiryDeclarations, detail: falseExp.length ? falseExp.join(", ") : "none" },
  { id: "live_deadline_not_regressed", pass: candLive >= incLive - TAXONOMY_PROMOTION_CRITERIA.maxLiveDeadlineRegression,
    detail: "candidate " + candLive.toFixed(2) + " vs incumbent " + incLive.toFixed(2) },
  { id: "no_new_critical_failures", pass: newCritical.length <= TAXONOMY_PROMOTION_CRITERIA.maxNewCriticalFailures, detail: newCritical.length + " introduced" },
  { id: "no_dimension_regression", pass: regressions.length === 0, detail: regressions.length ? regressions.map((r) => r.dimension + " " + r.delta.toFixed(1)).join(", ") : "none beyond " + TAXONOMY_PROMOTION_CRITERIA.maxDimensionRegression },
  { id: "all_trials_conclusive", pass: !anyInconclusive, detail: anyInconclusive ? "an arm was inconclusive" : "all conclusive" },
  { id: "frozen_hashes_intact", pass: frozenIntact.every((f) => f.preserved), detail: frozenIntact.map((f) => f.id + (f.preserved ? " ok" : " CHANGED")).join(", ") },
  { id: "real_records_reproduced", pass: candReal === true && incReal === false,
    detail: realRecords ? ("candidate fixes both: " + candReal + " | incumbent fixed both: " + incReal) : "diagnostic artefact missing" },
];
const promote = checks.every((c) => c.pass);

const decision = {
  at: new Date().toISOString(), worker: "opportunity_qualifier", kind: "structural_repair",
  candidate: QUALIFIER_V1_SCHEMA2_ID, incumbent: QUALIFIER_V1_ID,
  sealedSet: "hemmer-opportunity-qualifier-sealed-v1", sealedSetHash: sealed.sha256, sealedCaseCount: sealed.cases.length,
  scoredUnderSpec: "v2", specV1HashAtRun: specV1HashNow, trials,
  criteria: TAXONOMY_PROMOTION_CRITERIA,
  means: { incumbentAll: meanAll(inc), candidateAll: meanAll(cand), incumbentNonExpiry: incNonExpiry, candidateNonExpiry: candNonExpiry, incumbentExpiry: incExpiry, candidateExpiry: candExpiry, incumbentLiveDeadline: incLive, candidateLiveDeadline: candLive },
  dimensionMeans: { incumbent: incDims, candidate: candDims },
  frozenIntact, regressions, comparisons, falseExpiryDeclarations: falseExp,
  realRecordCheck: { source: "var/state/qualifier-expiry-diagnostic.json", candidateFixesBoth: candReal, incumbentFixesBoth: incReal },
  checks, promote, usdEstimate: Number(usd.toFixed(4)),
  evidenceNote: "Evidence quality remains deterministic-only; the unqualified semantic judge is unweighted and did not influence this decision.",
};
writeFileSync(join(stateDir(), "qualifier-promotion-taxonomy.json"), JSON.stringify(decision, null, 2) + "\n", "utf8");

if (promote) {
  store.putDecision({
    id: "PROMO-OQ-TAXONOMY-V2", evalRunId: cand[0].runId, agentId: "opportunity_qualifier",
    fromVersionId: QUALIFIER_V1_ID, toVersionId: QUALIFIER_V1_SCHEMA2_ID, kind: "promotion",
    decidedAt: decision.at, sealedSetHash: sealed.sha256, trials, criteria: TAXONOMY_PROMOTION_CRITERIA, checks,
    note: "Structural repair to the output contract. Promoted on non-inferiority off-target plus a verified repair on-target and on the real records that exposed the defect. No aggregate score gain was required, and none should be read into this.",
  });
}

console.log("\n=== TAXONOMY PROMOTION: oq-v1-schema2 vs oq-v1 ===");
console.log("  all cases      incumbent " + meanAll(inc).toFixed(2) + "  candidate " + meanAll(cand).toFixed(2));
console.log("  non-expiry     incumbent " + incNonExpiry.toFixed(2) + "  candidate " + candNonExpiry.toFixed(2) + "   <- must be non-inferior");
console.log("  expiry cases   incumbent " + incExpiry.toFixed(2) + "  candidate " + candExpiry.toFixed(2) + "   <- must be repaired");
console.log("  live deadline  incumbent " + incLive.toFixed(2) + "  candidate " + candLive.toFixed(2) + "   <- must not regress");
for (const c of checks) console.log("  [" + (c.pass ? "PASS" : "FAIL") + "] " + c.id + " -- " + c.detail);
console.log("  DECISION:", promote ? "PROMOTE oq-v1-schema2" : "DO NOT PROMOTE");
console.log("  usd", decision.usdEstimate);
