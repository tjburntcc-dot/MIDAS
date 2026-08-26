/**
 * Manufacture and evaluate the Opportunity Researcher through the foundry.
 *
 * Frozen v0 baseline, v1 with method knowledge, a length-matched placebo, all on
 * the sealed set of real captured pages. Promotion criteria are declared before
 * any run in this file executes.
 *
 * The gate is production eligibility, not frontier superiority. Those are
 * different claims and the second one is deferred on cost.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/researcher-foundry.mjs [trials]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { FileStore, stateDir, repoPath, contentHash } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import { runWorkerEval, dimensionMeans, dimensionCounts, workerSpecHash } from "../packages/eval/src/worker-spec.ts";
import {
  OPPORTUNITY_RESEARCHER_SPEC, RESEARCHER_V0_PROMPT, RESEARCHER_METHOD_KNOWLEDGE,
  RESEARCHER_ROLE_ID,
} from "../packages/eval/src/opportunity-researcher.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

/** DECLARED BEFORE ANY RUN. Production eligibility, not frontier superiority. */
export const RESEARCHER_PROMOTION_CRITERIA = {
  goal: "production_eligible",
  minMeanGainOverBaseline: 4.0,
  minGainBeyondPlacebo: 2.0,
  // Fabrication is the error that propagates, so it carries an absolute floor
  // rather than being allowed to average out against recall.
  minFabricationResistance: 90.0,
  maxFabricatedFactEvents: 1,
  maxQuoteNotInSourceEvents: 1,
  requireAllTrialsConclusive: true,
  requireGainInEveryTrial: true,
  note: "A researcher that invents a budget is worse than one that finds nothing, because the invented figure is acted on. Fabrication resistance therefore has a floor that a strong recall score cannot compensate for.",
};

const trials = Number(process.argv[2] || 2);
loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const spec = OPPORTUNITY_RESEARCHER_SPEC;
const manifest = JSON.parse(readFileSync(repoPath("evals", "opportunity-researcher", "v0", "manifest.json"), "utf8"));
const sealedPath = join(stateDir(), "sealed", "opportunity-researcher-sealed-v0.json");
const raw = readFileSync(sealedPath);
const sha = createHash("sha256").update(raw).digest("hex");
if (sha !== manifest.sealed.sha256) { console.error("sealed set hash mismatch; refusing to score against a modified holdout"); process.exit(2); }
const cases = JSON.parse(raw.toString("utf8")).cases;
console.log("sealed researcher set:", cases.length, "real pages, hash verified", sha.slice(0, 16));

function knowledgeBlock(items) {
  return "Operating method:\n" + items.map((k) => "- [" + k.id + "] " + k.statement).join("\n");
}

/** Irrelevant text matched to the length of the method knowledge. */
const PLACEBO_KNOWLEDGE = [
  { id: "K-PR-001", statement: "A document that will be revisited benefits from a short change log at its foot rather than its head, because a reader arriving for the current state should not scroll past states that no longer apply." },
  { id: "K-PR-002", statement: "Lists that mix items of different granularity are harder to act on than two separate lists, because each reader silently reclassifies every entry before deciding what to do with it." },
  { id: "K-PR-003", statement: "Naming a file after the decision it records rather than the meeting that produced it makes the decision findable by people who did not attend, which is most of them." },
  { id: "K-PR-004", statement: "Recurring reminders attached to an event that already happens are more reliable than ones scheduled at an arbitrary clock time competing with whatever else is running." },
  { id: "K-PR-005", statement: "Templates reduce effort when the varying parts are marked explicitly, and increase it when the reader must compare the template against the intended message to find them." },
  { id: "K-PR-006", statement: "Archiving completed material on a fixed cadence keeps active folders small enough to scan, which matters more for retrieval speed than the particular hierarchy chosen." },
];

const V0 = { id: "or-v0", knowledge: [], prompt: RESEARCHER_V0_PROMPT };
// or-v1 is frozen with the six rules it was evaluated on. K-OR-007 was written
// after a real failure on a real page and belongs to a new version, not to a
// retroactive edit of one already measured.
const V1_KNOWLEDGE = RESEARCHER_METHOD_KNOWLEDGE.filter((k) => !["K-OR-007", "K-OR-008"].includes(k.id));
const V2_KNOWLEDGE = RESEARCHER_METHOD_KNOWLEDGE.filter((k) => k.id !== "K-OR-008");
const V1 = {
  id: "or-v1", knowledge: V1_KNOWLEDGE,
  prompt: { system: RESEARCHER_V0_PROMPT.system + "\n\n" + knowledgeBlock(V1_KNOWLEDGE), developer: RESEARCHER_V0_PROMPT.developer },
};
const V2 = {
  id: "or-v2", knowledge: V2_KNOWLEDGE,
  prompt: { system: RESEARCHER_V0_PROMPT.system + "\n\n" + knowledgeBlock(V2_KNOWLEDGE), developer: RESEARCHER_V0_PROMPT.developer },
};
const V3 = {
  id: "or-v3", knowledge: RESEARCHER_METHOD_KNOWLEDGE,
  prompt: { system: RESEARCHER_V0_PROMPT.system + "\n\n" + knowledgeBlock(RESEARCHER_METHOD_KNOWLEDGE), developer: RESEARCHER_V0_PROMPT.developer },
};
const PL = {
  id: "or-v1-placebo", knowledge: PLACEBO_KNOWLEDGE,
  prompt: { system: RESEARCHER_V0_PROMPT.system + "\n\n" + knowledgeBlock(PLACEBO_KNOWLEDGE), developer: RESEARCHER_V0_PROMPT.developer },
};
const lenRatio = PL.prompt.system.length / V1.prompt.system.length;
console.log("placebo/method length ratio", lenRatio.toFixed(3));

const model = process.env.MIDAS_RESEARCHER_MODEL || "gpt-4.1";
function freeze(def) {
  const existing = store.getVersion(def.id);
  const hash = contentHash({ prompt: def.prompt, knowledgeIds: def.knowledge.map((k) => k.id), specHash: workerSpecHash(spec), model });
  if (existing) {
    if (existing.contentHash !== hash) throw new Error("refusing to rewrite frozen version " + def.id);
    return existing;
  }
  return store.putVersion({
    id: def.id, agentId: RESEARCHER_ROLE_ID, roleId: RESEARCHER_ROLE_ID,
    parentVersionId: def.id === "or-v0" ? null : def.id === "or-v3" ? "or-v2" : def.id === "or-v2" ? "or-v1" : "or-v0",
    modelProfile: { provider: "openai", model },
    promptBundle: def.prompt, knowledgeIds: def.knowledge.map((k) => k.id),
    outputSchema: { $id: "https://midas.local/schemas/opportunity-researcher-v0.json" },
    workerSpecHash: workerSpecHash(spec), allowedTools: [],
    contentHash: hash, createdAt: new Date().toISOString(),
    declaredChange: def.id === "or-v0" ? "Frozen baseline: role statement and output contract only."
      : def.id === "or-v1" ? "Adds extraction method knowledge written from observed failure modes on real pages."
      : def.id === "or-v2" ? "Adds K-OR-007: a redacted address is not a contact, written after a real failure on a real posting."
      : def.id === "or-v3" ? "Adds K-OR-008 scoping the redaction rule to the contact field, after K-OR-007 alone cut recall from 92.7 to 79.2."
      : "Placebo: matched added length, none of it about reading a posting.",
  });
}
for (const d of [V0, V1, V2, V3, PL]) freeze(d);

const RETRYABLE = /\b(429|500|502|503|504)\b|rate_limit|overloaded|timeout|ETIMEDOUT|ECONNRESET|UND_ERR_SOCKET|fetch failed|socket hang up/i;
async function withRetry(fn) {
  let last = null;
  for (let a = 0; a < 5; a += 1) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!RETRYABLE.test(String(e && e.message))) throw e;
      await new Promise((r) => setTimeout(r, Math.min(20000, 2000 * Math.pow(2, a))));
    }
  }
  throw last;
}

/** Gold never reaches the worker: only the page text and the title are presented. */
function present(record) {
  return { case_id: record.case_id, title: record.title, source_url: record.url, page_text: record.page_text };
}

function responderFor(def) {
  const provider = new OpenAIResponsesProvider(undefined, model);
  return async (record) => {
    const presented = present(record);
    if (JSON.stringify(presented).includes('"gold"')) throw new Error("gold leaked into presentation");
    const c = await withRetry(() => provider.complete({
      input: { posting: presented },
      instructions: def.prompt.system + "\n\n" + def.prompt.developer,
      outputSchema: { name: "opportunity_research", strict: false, schema: spec.outputSchema },
    }));
    if (c.kind !== "live") throw new Error("non-live");
    const u = c.usage || {};
    const check = validateAgainstSchema(c.text, spec.outputSchema);
    return {
      output: check.ok ? check.value : null, schemaOk: check.ok, error: check.ok ? null : "schema",
      cost: { inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0), totalTokens: Number(u.totalTokens || 0), usdEstimate: estimateUsd(u.inputTokens, u.outputTokens) },
    };
  };
}

const runs = {};
let usd = 0;
const ARM_SET = process.env.MIDAS_RESEARCHER_ARMS === "v3only" ? [V3] : [V0, PL, V1, V2, V3];
for (const def of ARM_SET) {
  runs[def.id] = [];
  for (let t = 0; t < trials; t += 1) {
    const s = await runWorkerEval({
      store, spec, versionId: def.id,
      suiteId: "hemmer-opportunity-researcher-sealed-v0", suiteVersion: "hemmer-opportunity-researcher-sealed-v0",
      cases, respond: responderFor(def), arm: def.id === "or-v3" ? "candidate" : def.id === "or-v2" ? "prior_candidate" : def.id === "or-v1" ? "prior_candidate" : def.id === "or-v0" ? "baseline" : "placebo",
      trialIndex: t, responderKind: "live", sealed: true, note: "researcher sealed trial " + t,
    });
    usd += s.cost.usdEstimate;
    runs[def.id].push(s);
    console.log("  " + def.id.padEnd(15) + " trial " + t + ": mean " + (s.meanWeightedTotal == null ? "n/a" : s.meanWeightedTotal.toFixed(2)) +
      " scored " + s.scored + "/" + s.n + " CF " + (s.criticalFailures.map((f) => f.code).join(",") || "none"));
  }
}

const meanOf = (l) => l.reduce((a, s) => a + (s.meanWeightedTotal || 0), 0) / l.length;
const dimsFor = (l) => { const all = l.flatMap((s) => s.results); return { means: dimensionMeans(all), counts: dimensionCounts(all) }; };
const v0Mean = meanOf(runs["or-v0"]);
const v1Mean = meanOf(runs["or-v1"]);
const v2Mean = runs["or-v2"] ? meanOf(runs["or-v2"]) : null;
const plMean = meanOf(runs["or-v1-placebo"]);
const v1Dims = dimsFor(runs["or-v1"]);
const v2Dims = runs["or-v2"] ? dimsFor(runs["or-v2"]) : null;
const v0Dims = dimsFor(runs["or-v0"]);
const cfCount = (l, code) => l.flatMap((s) => s.criticalFailures).filter((f) => f.code === code).length;
const CAND = runs["or-v3"] ? "or-v3" : runs["or-v2"] ? "or-v2" : "or-v1";
const v3Mean = runs["or-v3"] ? meanOf(runs["or-v3"]) : null;
const v3Dims = runs["or-v3"] ? dimsFor(runs["or-v3"]) : null;
const candMean = CAND === "or-v3" ? v3Mean : CAND === "or-v2" ? v2Mean : v1Mean;
const candDims = CAND === "or-v3" ? v3Dims : CAND === "or-v2" ? v2Dims : v1Dims;
const fabEvents = cfCount(runs[CAND], "CF-FABRICATED-FACT");
const quoteEvents = cfCount(runs[CAND], "CF-QUOTE-NOT-IN-SOURCE");
const anyInconclusive = Object.keys(runs).some((k) => runs[k].some((s) => s.inconclusive));
const gainEvery = runs[CAND].every((s, i) => (s.meanWeightedTotal || 0) > (runs["or-v0"][i].meanWeightedTotal || 0));

const checks = [
  { id: "gain_over_baseline", pass: candMean - v0Mean >= RESEARCHER_PROMOTION_CRITERIA.minMeanGainOverBaseline, detail: (candMean - v0Mean).toFixed(2) + " >= " + RESEARCHER_PROMOTION_CRITERIA.minMeanGainOverBaseline },
  { id: "gain_beyond_placebo", pass: candMean - plMean >= RESEARCHER_PROMOTION_CRITERIA.minGainBeyondPlacebo, detail: (candMean - plMean).toFixed(2) + " >= " + RESEARCHER_PROMOTION_CRITERIA.minGainBeyondPlacebo },
  { id: "fabrication_resistance_floor", pass: (candDims.means.fabrication_resistance ?? 0) >= RESEARCHER_PROMOTION_CRITERIA.minFabricationResistance, detail: (candDims.means.fabrication_resistance ?? 0).toFixed(1) + " >= " + RESEARCHER_PROMOTION_CRITERIA.minFabricationResistance },
  { id: "few_fabricated_facts", pass: fabEvents <= RESEARCHER_PROMOTION_CRITERIA.maxFabricatedFactEvents, detail: fabEvents + " events" },
  { id: "few_bad_quotes", pass: quoteEvents <= RESEARCHER_PROMOTION_CRITERIA.maxQuoteNotInSourceEvents, detail: quoteEvents + " events" },
  { id: "all_trials_conclusive", pass: !anyInconclusive, detail: anyInconclusive ? "an arm was inconclusive" : "all conclusive" },
  { id: "gain_in_every_trial", pass: gainEvery, detail: gainEvery ? "yes" : "no" },
];
const promote = checks.every((c) => c.pass);

const decision = {
  at: new Date().toISOString(), worker: RESEARCHER_ROLE_ID, goal: "production_eligible",
  candidate: CAND, priorCandidate: CAND === "or-v2" ? "or-v1" : null, baseline: "or-v0", placebo: "or-v1-placebo",
  sealedSet: manifest.sealed.id, sealedSetHash: sha, sealedCaseCount: cases.length, realPages: true,
  trials, criteria: RESEARCHER_PROMOTION_CRITERIA, model,
  means: { baseline: v0Mean, placebo: plMean, priorCandidate: v1Mean, candidate: candMean },
  dimensions: { baseline: v0Dims.means, priorCandidate: v1Dims.means, candidate: candDims.means, counts: candDims.counts },
  criticalFailures: { fabricatedFact: fabEvents, quoteNotInSource: quoteEvents },
  checks, promote,
  productionStatus: promote ? "production_eligible" : "development",
  frontierStatus: "not_assessed_deferred_on_cost",
  usdEstimate: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "researcher-promotion.json"), JSON.stringify(decision, null, 2) + "\n", "utf8");

if (promote) {
  store.putDecision({
    id: "PROMO-OR-" + CAND.toUpperCase(), evalRunId: runs[CAND][0].runId, agentId: RESEARCHER_ROLE_ID,
    fromVersionId: CAND === "or-v2" ? "or-v1" : "or-v0", toVersionId: CAND, kind: "promotion", decidedAt: decision.at,
    sealedSetHash: sha, trials, criteria: RESEARCHER_PROMOTION_CRITERIA, checks,
    note: "Production eligible on real captured pages with a length-matched placebo control. Frontier comparison deferred on cost and not claimed.",
  });
}

console.log("\n=== RESEARCHER PROMOTION (production eligibility) ===");
console.log("  baseline  or-v0        ", v0Mean.toFixed(2));
console.log("  placebo   or-v1-placebo", plMean.toFixed(2));
console.log("  prior     or-v1        ", v1Mean.toFixed(2));
console.log("  candidate " + CAND.padEnd(14), candMean.toFixed(2));
console.log("  candidate dimensions:");
for (const [k, v] of Object.entries(candDims.means)) console.log("    " + k.padEnd(26) + v.toFixed(1).padStart(6) + "   (v0 " + (v0Dims.means[k] ?? 0).toFixed(1) + ", n=" + candDims.counts[k] + ")");
for (const c of checks) console.log("  [" + (c.pass ? "PASS" : "FAIL") + "] " + c.id + " -- " + c.detail);
console.log("  DECISION:", promote ? "PRODUCTION_ELIGIBLE, promote " + CAND : "NOT PROMOTED");
console.log("  usd", decision.usdEstimate);
