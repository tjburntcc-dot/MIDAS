#!/usr/bin/env node
/**
 * Head-to-head on ONE frozen, non-sensitive task.
 *
 *   node --import ./tools/register-ts.mjs tools/compare-models.mjs
 *
 * Same prompt, same schema, same evidence, both providers. Measures response
 * quality, grounding, hallucination, latency, schema behaviour, and real cost.
 * Reports what it measured and nothing more.
 */
import { loadWorkspaceEnv, OpenAIResponsesProvider, OpenRouterProvider, openRouterConfigured, openRouterGenerationCost, OX_ALPHA_MODEL } from "@midas/model";

/* The project .env is authoritative. Without this a stale machine-wide
   OPENAI_API_KEY silently wins and the run fails against the wrong account. */
loadWorkspaceEnv();
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";

/* ---- FROZEN before either model runs. Deliberately non-sensitive: invented
   figures, no real customer, no company records, nothing private. ---- */
const EVIDENCE = [
  { id: "E-1", text: "A neighbourhood bike shop charges $25 for a basic tune-up." },
  { id: "E-2", text: "The shop owner says a tune-up takes about 45 minutes of labour." },
  { id: "E-3", text: "Shop rent and tools cost the owner about $900 a month." },
  { id: "E-4", text: "The owner has not recorded how many tune-ups are sold per month." },
];
const TASK =
  "Using only the evidence supplied, work out whether the $25 tune-up price covers costs. " +
  "State which numbers came from the evidence and which you had to assume. " +
  "Say plainly what you cannot determine.";

const SCHEMA = {
  name: "pricing_check",
  strict: true,
  schema: {
    "type": "object",
    additionalProperties: false,
    required: ["answer", "citations", "assumptions", "cannot_determine"],
    properties: {
      answer: { "type": "string" },
      citations: { "type": "array", items: { "type": "string" } },
      assumptions: { "type": "array", items: { "type": "string" } },
      cannot_determine: { "type": "array", items: { "type": "string" } },
    },
  },
};
const INSTRUCTIONS =
  "You are a finance analyst for a very small business. Use ONLY the supplied evidence. " +
  "Cite the evidence id beside anything you assert. Never invent demand, sales volume, or revenue. " +
  "Anything you cannot work out from the evidence goes in cannot_determine.";

const VALID_IDS = EVIDENCE.map((e) => e.id);

function grade(text) {
  const v = validateAgainstSchema(text, SCHEMA);
  if (!v.ok) {
    return { schemaOk: false, schemaErrors: v.errors, recovered: v.recovered, repaired: v.repaired };
  }
  const val = v.value;
  const cites = (val.citations || []).map(String);
  const real = cites.filter((c) => VALID_IDS.indexOf(c) >= 0);
  const invented = cites.filter((c) => VALID_IDS.indexOf(c) < 0);

  const blob = JSON.stringify(val).toLowerCase();
  /* the evidence has no sales volume at all, so any volume claim is fabricated */
  const fabricatedVolume = /\b\d+\s*(tune-?ups?|customers?|sales?)\s*(per|a)\s*(month|week|day)\b/.test(blob);
  const assertedDemand = /\b(demand is|customers want|will sell|guaranteed)\b/.test(blob);

  return {
    schemaOk: true,
    recovered: Boolean(v.recovered),
    repaired: Boolean(v.repaired),
    schemaErrors: v.errors,
    citations: cites.length,
    validCitations: real.length,
    inventedCitations: invented,
    namedAssumptions: (val.assumptions || []).length,
    namedUnknowns: (val.cannot_determine || []).length,
    /* E-4 explicitly says volume is unrecorded; a good answer surfaces that */
    caughtTheMissingVolume: /volume|how many|per month|units|quantity|unrecorded|not recorded/.test(blob),
    fabricatedVolume,
    assertedDemand,
    answerChars: String(val.answer || "").length,
  };
}

async function run(label, provider, tag) {
  const t0 = Date.now();
  try {
    const out = await provider.complete({ instructions: INSTRUCTIONS, input: { task: TASK, evidence: EVIDENCE }, outputSchema: SCHEMA });
    const latency = out.latencyMs != null ? out.latencyMs : Date.now() - t0;
    const g = grade(out.text);
    let cost = null;
    if (tag === "openrouter" && out.generationId) {
      await new Promise((r) => setTimeout(r, 1500)); /* the generation record lags slightly */
      const c = await openRouterGenerationCost(out.generationId);
      if (c) cost = c.totalCost;
    }
    const shown = out.model || (out.raw && out.raw.model) || "(not reported)";
    return { label, ok: true, latency, usage: out.usage, model: shown, cost, grade: g, text: out.text };
  } catch (err) {
    return { label, ok: false, error: String((err && err.message) || err).slice(0, 220), latency: Date.now() - t0 };
  }
}

const results = [];
console.log("FROZEN TASK: " + TASK.slice(0, 80) + "...");
console.log("evidence: " + VALID_IDS.join(", ") + "   (invented figures, nothing private)\n");

results.push(await run("OpenAI gpt-4.1", new OpenAIResponsesProvider(undefined, "gpt-4.1"), "openai"));

if (openRouterConfigured()) {
  results.push(await run("Ox Alpha (" + OX_ALPHA_MODEL + ")", new OpenRouterProvider(undefined, OX_ALPHA_MODEL), "openrouter"));
} else {
  console.log("SKIPPED Ox Alpha: OPENROUTER_API_KEY is not configured.\n");
}

for (const r of results) {
  console.log("--- " + r.label + " ---");
  if (!r.ok) { console.log("  FAILED: " + r.error + "  (" + r.latency + " ms)"); continue; }
  const g = r.grade;
  console.log("  model returned      " + r.model);
  console.log("  latency             " + r.latency + " ms");
  console.log("  tokens              in " + (r.usage.inputTokens || 0) + " / out " + (r.usage.outputTokens || 0));
  console.log("  cost                " + (r.cost != null ? "$" + r.cost : "not reported by provider"));
  console.log("  schema valid        " + g.schemaOk + (g.recovered ? " (recovered from prose/fence)" : "") + (g.repaired ? " (repaired)" : ""));
  if (!g.schemaOk) { console.log("  schema errors       " + JSON.stringify(g.schemaErrors)); continue; }
  console.log("  citations           " + g.validCitations + " valid of " + g.citations);
  console.log("  invented citations  " + (g.inventedCitations.length ? g.inventedCitations.join(", ") : "none"));
  console.log("  named assumptions   " + g.namedAssumptions);
  console.log("  named unknowns      " + g.namedUnknowns);
  console.log("  caught missing vol. " + g.caughtTheMissingVolume);
  console.log("  fabricated volume   " + g.fabricatedVolume + (g.fabricatedVolume ? "   <-- HALLUCINATION" : ""));
  console.log("  asserted demand     " + g.assertedDemand + (g.assertedDemand ? "   <-- UNSUPPORTED CLAIM" : ""));
  console.log("");
}

if (results.length < 2) {
  console.log("Only one provider ran, so no comparison is claimed.");
} else {
  const [a, b] = results;
  if (a.ok && b.ok) {
    console.log("=== side by side (measured, not opinion) ===");
    console.log("  latency:   " + a.label + " " + a.latency + " ms   vs   " + b.label + " " + b.latency + " ms");
    console.log("  schema:    " + a.grade.schemaOk + " vs " + b.grade.schemaOk);
    console.log("  grounding: " + a.grade.validCitations + "/" + a.grade.citations + " vs " + b.grade.validCitations + "/" + b.grade.citations);
    console.log("  hallucination: " + (a.grade.fabricatedVolume || a.grade.assertedDemand) + " vs " + (b.grade.fabricatedVolume || b.grade.assertedDemand));
    console.log("\nOne task is one data point. It does not establish that either model is better overall.");
  }
}
