/**
 * Frontier arena on the sealed v2 instrument.
 *
 * Five arms, identical cases, identical output schema, identical evidence, no
 * gold, no tools for anyone:
 *
 *   frontier_basic            selected frontier model, basic role instruction
 *   frontier_strong           selected frontier model, expertly engineered prompt
 *                             carrying the same company policy MIDAS holds
 *   midas_prompt_on_frontier  MIDAS's own prompt on the frontier model
 *   midas_champion            promoted oq-v2 on its own model
 *   midas_previous            oq-v1 on its own model
 *
 * The third arm is the one that makes the result interpretable. Without it, a
 * MIDAS win could be the specialisation or the model, and a MIDAS loss could be
 * either too.
 *
 * The frontier model was selected on development cases, never on this instrument.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/frontier-arena.mjs [trials]
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion, buildQualifierRequest, loadSealedSet, qualifierSpec, qualifierVersionDefs,
  HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, knowledgeBlock,
  presentQualifierCase, assertNoGoldLeak, QUALIFIER_V1_ID, QUALIFIER_V2_ID,
} from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans, dimensionCounts } from "../packages/eval/src/worker-spec.ts";
import { calibrationDiagnostics } from "../packages/eval/src/calibration-v2.ts";
import { FRONTIER_BASIC_PROMPT, frontierStrongPrompt, awardTier, ARENA_ARM_KINDS } from "../packages/eval/src/frontier-arena.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const trials = Number(process.argv[2] || 2);
loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const selPath = join(stateDir(), "frontier-selection.json");
if (!existsSync(selPath)) { console.error("run tools/frontier-select.mjs first"); process.exit(2); }
const selection = JSON.parse(readFileSync(selPath, "utf8"));
const FRONTIER_MODEL = selection.selected;
if (!FRONTIER_MODEL) { console.error("no frontier model selected"); process.exit(2); }

const store = new FileStore(stateDir());
const sealed = loadSealedSet("v2");
const spec = qualifierSpec("v4");
const defs = qualifierVersionDefs();
const policyBlock = knowledgeBlock(HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE));
const strong = frontierStrongPrompt(policyBlock);

console.log("instrument:", sealed.cases.length, "cases, hash", sealed.sha256.slice(0, 16));
console.log("frontier model selected on development cases:", FRONTIER_MODEL);
console.log("midas champion model:", defs[QUALIFIER_V2_ID].modelProfile.model);

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

/** Every arm goes through the same presentation and the same schema check. */
function makeResponder(model, instructions, versionIdForPrompt) {
  const provider = new OpenAIResponsesProvider(undefined, model);
  return async (record) => {
    let input;
    let instr;
    if (versionIdForPrompt) {
      const req = buildQualifierRequest(versionIdForPrompt, record);
      input = req.input;
      instr = req.instructions;
    } else {
      const presented = presentQualifierCase(record);
      assertNoGoldLeak(presented);
      input = { opportunity: presented };
      instr = instructions;
    }
    const t0 = Date.now();
    const c = await withRetry(() => provider.complete({
      input, instructions: instr,
      outputSchema: { name: "opportunity_qualification", strict: false, schema: spec.outputSchema },
    }));
    if (c.kind !== "live") throw new Error("non-live");
    const u = c.usage || {};
    const check = validateAgainstSchema(c.text, spec.outputSchema);
    return {
      output: check.ok ? check.value : null, schemaOk: check.ok, error: check.ok ? null : "schema",
      cost: {
        inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0),
        totalTokens: Number(u.totalTokens || 0), usdEstimate: estimateUsd(u.inputTokens, u.outputTokens),
        latencyMs: Date.now() - t0,
      },
    };
  };
}

const midasModel = defs[QUALIFIER_V2_ID].modelProfile.model;
const ARMS = [
  { id: "arena:frontier_basic", label: "frontier_basic", model: FRONTIER_MODEL, responder: () => makeResponder(FRONTIER_MODEL, FRONTIER_BASIC_PROMPT.system + "\n\n" + FRONTIER_BASIC_PROMPT.developer, null) },
  { id: "arena:frontier_strong", label: "frontier_strong", model: FRONTIER_MODEL, responder: () => makeResponder(FRONTIER_MODEL, strong.system + "\n\n" + strong.developer, null) },
  { id: "arena:midas_prompt_on_frontier", label: "midas_prompt_on_frontier", model: FRONTIER_MODEL, responder: () => makeResponder(FRONTIER_MODEL, defs[QUALIFIER_V2_ID].promptBundle.system + "\n\n" + defs[QUALIFIER_V2_ID].promptBundle.developer, null) },
  { id: QUALIFIER_V2_ID, label: "midas_champion", model: midasModel, responder: () => makeResponder(midasModel, null, QUALIFIER_V2_ID) },
  { id: QUALIFIER_V1_ID, label: "midas_previous", model: midasModel, responder: () => makeResponder(midasModel, null, QUALIFIER_V1_ID) },
];

const runs = {};
let usd = 0;
for (const a of ARMS) {
  if (a.id === QUALIFIER_V2_ID || a.id === QUALIFIER_V1_ID) ensureQualifierVersion(store, a.id);
  runs[a.label] = [];
  for (let t = 0; t < trials; t += 1) {
    const t0 = Date.now();
    const s = await runWorkerEval({
      store, spec, versionId: a.id,
      suiteId: "hemmer-opportunity-qualifier-sealed-v2", suiteVersion: "hemmer-opportunity-qualifier-sealed-v2",
      cases: sealed.cases, respond: a.responder(), arm: a.label, trialIndex: t,
      responderKind: "live", sealed: true, note: "frontier arena " + a.label + " on " + a.model,
    });
    usd += s.cost.usdEstimate;
    runs[a.label].push({ ...s, wallMs: Date.now() - t0 });
    console.log("  " + a.label.padEnd(26) + " trial " + t + ": mean " + (s.meanWeightedTotal == null ? "n/a" : s.meanWeightedTotal.toFixed(2)) +
      "  scored " + s.scored + "/" + s.n + "  CF " + (s.criticalFailures.length || 0) + "  " + Math.round((Date.now() - t0) / 1000) + "s  $" + s.cost.usdEstimate.toFixed(3));
  }
}

const manifest = JSON.parse(readFileSync(join(process.cwd(), "evals", "opportunity-qualifier", "v2", "manifest.json"), "utf8"));
const EXPIRED = manifest.expiry.expired;
const LIVE = manifest.expiry.liveDeadline;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs) => (xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0);
function subsetMean(list, ids) {
  let t = 0; let n = 0;
  for (const s of list) for (const r of s.results) {
    if (!ids.includes(r.caseId) || r.scoreStatus !== "scored") continue;
    t += r.weightedTotal; n += 1;
  }
  return n ? t / n : null;
}

const summary = {};
for (const a of ARMS) {
  const list = runs[a.label];
  const means = list.map((s) => s.meanWeightedTotal || 0);
  const all = list.flatMap((s) => s.results);
  summary[a.label] = {
    kind: ARENA_ARM_KINDS[a.label] || null,
    model: a.model,
    mean: mean(means), spread: spread(means), trialMeans: means,
    dimensions: dimensionMeans(all), dimensionCounts: dimensionCounts(all),
    expiry: subsetMean(list, EXPIRED), liveDeadline: subsetMean(list, LIVE),
    criticalFailures: list.flatMap((s) => s.criticalFailures).reduce((acc, f) => { acc[f.code] = (acc[f.code] || 0) + 1; return acc; }, {}),
    calibration: calibrationDiagnostics(all),
    usd: Number(list.reduce((a2, s) => a2 + s.cost.usdEstimate, 0).toFixed(4)),
    msPerCase: Math.round(mean(list.map((s) => s.wallMs)) / sealed.cases.length),
  };
}

const midas = summary.midas_champion;
const frontierArms = ["frontier_basic", "frontier_strong", "midas_prompt_on_frontier"];
const bestFrontierLabel = frontierArms.slice().sort((a, b) => summary[b].mean - summary[a].mean)[0];
const bestFrontier = summary[bestFrontierLabel];

const midasCF = Object.values(midas.criticalFailures).reduce((a, b) => a + b, 0);
const verdict = awardTier({
  midasMean: midas.mean, bestFrontierMean: bestFrontier.mean,
  midasSpread: midas.spread, frontierSpread: bestFrontier.spread,
  midasCriticalFailures: midasCF,
  productionSafe: midas.mean >= 85 && midasCF <= 3,
});

const perDimension = {};
for (const d of Object.keys(midas.dimensions)) {
  perDimension[d] = { midas: midas.dimensions[d], bestFrontier: bestFrontier.dimensions[d] ?? null, delta: (midas.dimensions[d] ?? 0) - (bestFrontier.dimensions[d] ?? 0) };
}
const midasWins = Object.entries(perDimension).filter(([, v]) => v.delta > 1).map(([k]) => k);
const frontierWins = Object.entries(perDimension).filter(([, v]) => v.delta < -1).map(([k]) => k);

const report = {
  at: new Date().toISOString(),
  instrument: "hemmer-opportunity-qualifier-sealed-v2", instrumentHash: sealed.sha256,
  scoredUnderSpec: "v4", trials,
  frontierModel: FRONTIER_MODEL, frontierSelection: { on: "development cases", report: "var/state/frontier-selection.json" },
  midasModel: midasModel,
  fairness: [
    "Frontier arms received the same company policy the MIDAS worker holds.",
    "The strong-prompt arm states the procedure, taxonomy, estimation method and failure modes, and is longer than the MIDAS prompt.",
    "Identical cases, identical output schema, identical evidence, no gold, no tools for any arm.",
    "The frontier model was chosen on development cases, never on this instrument.",
    "midas_prompt_on_frontier separates the specialisation from the base model.",
  ],
  summary, bestFrontierArm: bestFrontierLabel, perDimension, midasWins, frontierWins,
  verdict, usdEstimate: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "frontier-arena.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("\n=== FRONTIER ARENA ===");
for (const a of ARMS) {
  const s = summary[a.label];
  console.log("  " + a.label.padEnd(26) + s.mean.toFixed(2).padStart(6) + "  spread " + s.spread.toFixed(2).padStart(5) +
    "  expiry " + (s.expiry == null ? " n/a" : s.expiry.toFixed(1).padStart(5)) +
    "  live " + (s.liveDeadline == null ? " n/a" : s.liveDeadline.toFixed(1).padStart(5)) +
    "  CF " + String(Object.values(s.criticalFailures).reduce((x, y) => x + y, 0)).padStart(2) +
    "  $" + s.usd.toFixed(3) + "  " + s.msPerCase + "ms/case  [" + s.model + "]");
}
console.log("\n  best frontier arm:", bestFrontierLabel, bestFrontier.mean.toFixed(2));
console.log("  midas champion   :", midas.mean.toFixed(2));
console.log("  delta            :", verdict.delta.toFixed(2), " (noise floor " + verdict.noise.toFixed(2) + ")");
console.log("  midas wins on    :", midasWins.join(", ") || "nothing by more than 1 point");
console.log("  frontier wins on :", frontierWins.join(", ") || "nothing by more than 1 point");
console.log("\n  VERDICT:", verdict.tier);
console.log("  usd", report.usdEstimate);
