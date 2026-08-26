/**
 * Clean confirmation of oq-v2 on the sealed v2 instrument.
 *
 * The instrument was authored and frozen before any model was run against it,
 * and its gold was written without inspecting candidate output. The interaction
 * hypothesis -- that the new code fixes the mislabel while the policy suppresses
 * over-application -- was DISCOVERED in the previous environment, so this run is
 * the first independent test of it. Discovery and confirmation are separate
 * events and this file only performs the second.
 *
 * Three arms:
 *   oq-v1          previous production version, no expiry code in its contract
 *   oq-v1-schema2  the code without the policy -- the arm that over-applied
 *   oq-v2          promoted: code plus policy
 *
 * Expectations below are declared before execution. They are predictions, and a
 * failed prediction is reported as a failed prediction rather than reinterpreted.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/qualifier-confirm-v2.mjs [trials]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, loadSealedSet, qualifierSpec,
  QUALIFIER_V1_ID, QUALIFIER_V1_SCHEMA2_ID, QUALIFIER_V2_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans } from "../packages/eval/src/worker-spec.ts";
import { calibrationDiagnostics } from "../packages/eval/src/calibration-v2.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

/** DECLARED BEFORE EXECUTION. Predictions, not thresholds to be tuned. */
export const CONFIRMATION_EXPECTATIONS = {
  instrument: "hemmer-opportunity-qualifier-sealed-v2",
  scoredUnderSpec: "v4",
  predictions: [
    { id: "expiry_generalises", statement: "oq-v2 labels every sealed expiry case with opportunity_expired, on cases it has never seen." },
    { id: "false_expiry_protection_generalises", statement: "oq-v2 declares no live-deadline case expired, including the ones closing today and tomorrow." },
    { id: "code_alone_over_applies", statement: "oq-v1-schema2, holding the code without the policy, scores lower than oq-v2 on the live-deadline cases. This is the discovered interaction; here it is being tested rather than assumed." },
    { id: "fraud_prohibited_separation", statement: "On legitimate-buyer prohibited-work cases, oq-v2 declines with illegal_or_deceptive_work and is not penalised for rating counterparty fraud risk low." },
    { id: "fabricated_basis_reduced", statement: "oq-v2 produces fewer CF-UNSUPPORTED-BELOW-MINIMUM and CF-FABRICATED-ESTIMATE events than oq-v1." },
    { id: "estimation_remains_strong", statement: "With gold no longer encoding declined-means-unknowable, stated-value extraction is high: a figure printed in the record is recovered." },
    { id: "no_hidden_regression", statement: "oq-v2 does not regress against oq-v1 on any dimension by more than 5 points." },
  ],
};

const trials = Number(process.argv[2] || 3);

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const sealed = loadSealedSet("v2");
const spec = qualifierSpec("v4");
const manifest = JSON.parse(readFileSync(join(process.cwd(), "evals", "opportunity-qualifier", "v2", "manifest.json"), "utf8"));
console.log("instrument:", sealed.cases.length, "cases, hash verified", sealed.sha256.slice(0, 16));
console.log("authored before any model run:", manifest.authoredBeforeAnyModelRun === true);

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
    const check = validateAgainstSchema(c.text, spec.outputSchema);
    return {
      output: check.ok ? check.value : null, schemaOk: check.ok, error: check.ok ? null : "schema",
      cost: { inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0), totalTokens: Number(u.totalTokens || 0), usdEstimate: estimateUsd(u.inputTokens, u.outputTokens) },
    };
  };
}

const ARMS = [
  { id: QUALIFIER_V1_ID, arm: "previous_production" },
  { id: QUALIFIER_V1_SCHEMA2_ID, arm: "code_without_policy" },
  { id: QUALIFIER_V2_ID, arm: "promoted" },
];
const runs = {};
let usd = 0;
for (const a of ARMS) {
  const version = ensureQualifierVersion(store, a.id);
  runs[a.id] = [];
  for (let t = 0; t < trials; t += 1) {
    const s = await runWorkerEval({
      store, spec, versionId: a.id,
      suiteId: "hemmer-opportunity-qualifier-sealed-v2", suiteVersion: "hemmer-opportunity-qualifier-sealed-v2",
      cases: sealed.cases, respond: responderFor(a.id, version.modelProfile.model),
      arm: a.arm, trialIndex: t, responderKind: "live", sealed: true,
      note: "sealed v2 confirmation trial " + t + " for " + a.id,
    });
    usd += s.cost.usdEstimate;
    runs[a.id].push(s);
    console.log("  " + a.id.padEnd(14) + " trial " + t + ": mean " + (s.meanWeightedTotal == null ? "n/a" : s.meanWeightedTotal.toFixed(2)) +
      " scored " + s.scored + "/" + s.n + " CF " + (s.criticalFailures.map((f) => f.code).join(",") || "none"));
  }
}

const byId = new Map(sealed.cases.map((c) => [c.case_id, c]));
const EXPIRED = manifest.expiry.expired;
const LIVE = manifest.expiry.liveDeadline;
const LEGIT_PROHIBITED = manifest.fraudMatrix.legit_work_prohibited;

const meanAll = (list) => list.reduce((a, s) => a + (s.meanWeightedTotal || 0), 0) / list.length;
function subsetMean(list, ids) {
  let t = 0; let n = 0;
  for (const s of list) for (const r of s.results) {
    if (!ids.includes(r.caseId) || r.scoreStatus !== "scored") continue;
    t += r.weightedTotal; n += 1;
  }
  return n ? t / n : null;
}
const dimsFor = (list) => {
  const acc = {};
  for (const s of list) { const m = dimensionMeans(s.results); for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] || 0) + v / list.length; }
  return acc;
};
function codeStats(list) {
  let expiredHit = 0; let expiredTotal = 0; const falseExpiry = [];
  let prohibitedHit = 0; let prohibitedTotal = 0;
  for (const s of list) for (const r of s.results) {
    if (!r.output) continue;
    const g = byId.get(r.caseId).gold;
    const codes = r.output.disqualifiers || [];
    if ((g.disqualifiers || []).includes("opportunity_expired")) { expiredTotal += 1; if (codes.includes("opportunity_expired")) expiredHit += 1; }
    else if (codes.includes("opportunity_expired")) falseExpiry.push(r.caseId);
    if (LEGIT_PROHIBITED.includes(r.caseId)) { prohibitedTotal += 1; if (codes.includes("illegal_or_deceptive_work")) prohibitedHit += 1; }
  }
  return { expiredHit, expiredTotal, falseExpiry, prohibitedHit, prohibitedTotal };
}
function cfCounts(list) {
  const out = {};
  for (const s of list) for (const f of s.criticalFailures) out[f.code] = (out[f.code] || 0) + 1;
  return out;
}
const allResults = (list) => list.flatMap((s) => s.results);

const summary = {};
for (const a of ARMS) {
  const list = runs[a.id];
  summary[a.id] = {
    arm: a.arm,
    mean: meanAll(list),
    dimensions: dimsFor(list),
    expiry: subsetMean(list, EXPIRED),
    liveDeadline: subsetMean(list, LIVE),
    codes: codeStats(list),
    criticalFailures: cfCounts(list),
    calibration: calibrationDiagnostics(allResults(list)),
  };
}

const v1 = summary[QUALIFIER_V1_ID];
const codeOnly = summary[QUALIFIER_V1_SCHEMA2_ID];
const v2 = summary[QUALIFIER_V2_ID];

const fabricatedCodes = ["CF-UNSUPPORTED-BELOW-MINIMUM", "CF-FABRICATED-ESTIMATE"];
const fabCount = (s) => fabricatedCodes.reduce((a, c) => a + (s.criticalFailures[c] || 0), 0);
const regressions = Object.keys(v1.dimensions)
  .map((k) => ({ dimension: k, v1: v1.dimensions[k], v2: v2.dimensions[k] ?? 0, delta: (v2.dimensions[k] ?? 0) - v1.dimensions[k] }))
  .filter((d) => d.delta < -5);

const outcomes = [
  { id: "expiry_generalises", held: v2.codes.expiredHit === v2.codes.expiredTotal, detail: v2.codes.expiredHit + "/" + v2.codes.expiredTotal + " expiry cases labelled" },
  { id: "false_expiry_protection_generalises", held: v2.codes.falseExpiry.length === 0, detail: v2.codes.falseExpiry.length ? "declared expired: " + [...new Set(v2.codes.falseExpiry)].join(", ") : "none" },
  { id: "code_alone_over_applies", held: v2.liveDeadline > codeOnly.liveDeadline, detail: "code-only " + codeOnly.liveDeadline.toFixed(2) + " vs promoted " + v2.liveDeadline.toFixed(2) + " | code-only false expiries " + [...new Set(codeOnly.codes.falseExpiry)].join(", ") },
  { id: "fraud_prohibited_separation", held: v2.codes.prohibitedHit === v2.codes.prohibitedTotal && !(v2.criticalFailures["CF-FRAUD-MISSED"] > 0), detail: v2.codes.prohibitedHit + "/" + v2.codes.prohibitedTotal + " prohibited-work cases coded, CF-FRAUD-MISSED " + (v2.criticalFailures["CF-FRAUD-MISSED"] || 0) },
  { id: "fabricated_basis_reduced", held: fabCount(v2) < fabCount(v1), detail: "oq-v1 " + fabCount(v1) + " -> oq-v2 " + fabCount(v2) },
  { id: "estimation_remains_strong", held: (v2.dimensions.stated_value_extraction ?? 0) >= 80, detail: "stated_value_extraction " + (v2.dimensions.stated_value_extraction ?? 0).toFixed(1) },
  { id: "no_hidden_regression", held: regressions.length === 0, detail: regressions.length ? regressions.map((r) => r.dimension + " " + r.delta.toFixed(1)).join(", ") : "none beyond 5" },
];

const report = {
  at: new Date().toISOString(),
  instrument: sealed.version || "hemmer-opportunity-qualifier-sealed-v2",
  instrumentHash: sealed.sha256,
  authoredBeforeAnyModelRun: manifest.authoredBeforeAnyModelRun === true,
  scoredUnderSpec: "v4", trials, expectations: CONFIRMATION_EXPECTATIONS,
  summary, regressions, outcomes,
  allPredictionsHeld: outcomes.every((o) => o.held),
  usdEstimate: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "qualifier-confirmation-v2.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("\n=== SEALED v2 CONFIRMATION ===");
for (const a of ARMS) {
  const s = summary[a.id];
  console.log("  " + a.id.padEnd(14) + " mean " + s.mean.toFixed(2) + " | expiry " + (s.expiry == null ? "n/a" : s.expiry.toFixed(2)) +
    " | liveDeadline " + (s.liveDeadline == null ? "n/a" : s.liveDeadline.toFixed(2)) +
    " | CF " + (Object.entries(s.criticalFailures).map(([k, v]) => k + "x" + v).join(",") || "none"));
}
console.log("\n  promoted oq-v2 dimensions:");
for (const [k, v] of Object.entries(v2.dimensions)) console.log("    " + k.padEnd(26) + v.toFixed(1).padStart(6) + "   (oq-v1 " + (v1.dimensions[k] ?? 0).toFixed(1) + ")");
console.log("\n  calibration diagnostics (oq-v2):");
const c = v2.calibration;
console.log("    containment " + (100 * c.containmentRate).toFixed(1) + "%  medianRelErr " + (c.medianRelativeError == null ? "n/a" : c.medianRelativeError.toFixed(3)) +
  "  over " + c.overestimates + " under " + c.underestimates + "  bias " + (c.directionalBias == null ? "n/a" : c.directionalBias.toFixed(2)));
console.log("    catastrophic over " + c.catastrophicOverestimates + " under " + c.catastrophicUnderestimates +
  "  fakePrecision " + c.fakePrecisionBands + "  abstention respected " + c.unknowableFieldsRespected + "/" + c.unknowableFieldsSeen);
console.log("\n  declared predictions:");
for (const o of outcomes) console.log("    [" + (o.held ? "HELD" : "FAILED") + "] " + o.id + " -- " + o.detail);
console.log("\n  usd", report.usdEstimate);
