/**
 * Frontier model selection, run on DEVELOPMENT cases.
 *
 * Choosing the baseline model by its sealed score would be selection on the test
 * set: it would hand the arena the model that happens to suit the holdout. The
 * strongest accessible model is picked here, on development cases, and only then
 * carried into the sealed arena.
 *
 * Candidates are discovered from the provider at run time rather than hardcoded.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir, repoPath } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import { qualifierSpec, HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, knowledgeBlock, presentQualifierCase, assertNoGoldLeak } from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans } from "../packages/eval/src/worker-spec.ts";
import { frontierStrongPrompt } from "../packages/eval/src/frontier-arena.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const trials = Number(process.argv[2] || 1);
loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

/** Discover what is actually callable, then keep the plausible frontier tier. */
async function discoverCandidates() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: "Bearer " + key } });
  const body = await res.json();
  const ids = (body.data || []).map((d) => d.id);
  const excluded = /mini|nano|codex|chat-latest|audio|realtime|transcribe|tts|image|search|preview/;
  const frontier = ids.filter((id) => /^(gpt-5|o[34])/.test(id) && !excluded.test(id) && !/\d{4}-\d{2}-\d{2}$/.test(id));

  // Restrict to the newest generation plus a reasoning specialist. Superseded
  // generations are dropped because a strictly newer sibling is callable, not to
  // weaken the baseline: note the bias direction, since the MIDAS worker runs on
  // an older model, excluding strong frontier models would flatter MIDAS. The
  // newest pro variant is deliberately kept in despite its latency.
  const generation = (id) => {
    const m = id.match(/^gpt-(\d+)\.(\d+)/);
    return m ? Number(m[1]) * 100 + Number(m[2]) : -1;
  };
  const newest = Math.max(...frontier.map(generation));
  const keep = frontier.filter((id) => generation(id) >= newest - 1 || /^o[34]$/.test(id));
  return keep.sort();
}

const candidates = await discoverCandidates();
console.log("discovered frontier candidates:", candidates.join(", "));

const spec = qualifierSpec("v4");
const cases = JSON.parse(readFileSync(repoPath("evals", "opportunity-qualifier", "v2", "dev_cases_v2.json"), "utf8")).cases;
const policyBlock = knowledgeBlock(HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE));
const strong = frontierStrongPrompt(policyBlock);

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

function responderFor(model) {
  const provider = new OpenAIResponsesProvider(undefined, model);
  return async (record) => {
    const presented = presentQualifierCase(record);
    assertNoGoldLeak(presented);
    const c = await withRetry(() => provider.complete({
      input: { opportunity: presented },
      instructions: strong.system + "\n\n" + strong.developer,
      outputSchema: { name: "opportunity_qualification", strict: false, schema: spec.outputSchema },
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

const store = new FileStore(stateDir());
const rows = [];
let usd = 0;
for (const model of candidates) {
  const means = [];
  let failed = null;
  let modelUsd = 0;
  let latency = 0;
  for (let t = 0; t < trials; t += 1) {
    const t0 = Date.now();
    try {
      const s = await runWorkerEval({
        store, spec, versionId: "frontier-select:" + model,
        suiteId: "hemmer-opportunity-qualifier-dev-v2", suiteVersion: "hemmer-opportunity-qualifier-dev-v2",
        cases, respond: responderFor(model), arm: "frontier_strong", trialIndex: t,
        responderKind: "live", sealed: false, note: "frontier selection on development cases",
      });
      // An inconclusive run's mean is computed over whatever survived and is not
      // comparable. gpt-5.5-pro scored 3 of 16 and would otherwise have won
      // selection on three cases, handing the arena a baseline chosen by its
      // failures.
      if (s.inconclusive) {
        failed = "inconclusive: only " + s.scored + "/" + s.n + " cases scored";
        latency += Date.now() - t0;
        break;
      }
      means.push(s.meanWeightedTotal || 0);
      modelUsd += s.cost.usdEstimate;
      latency += Date.now() - t0;
    } catch (e) {
      failed = String(e && e.message).slice(0, 90);
      break;
    }
  }
  usd += modelUsd;
  const mean = means.length ? means.reduce((a, b) => a + b, 0) / means.length : null;
  rows.push({ model, mean, trials: means.length, usd: Number(modelUsd.toFixed(4)), msPerTrial: latency ? Math.round(latency / Math.max(1, means.length)) : null, failed });
  console.log("  " + model.padEnd(14) + (failed ? "FAILED " + failed : "mean " + mean.toFixed(2) + "  usd " + modelUsd.toFixed(4) + "  " + Math.round(latency / (means.length || 1)) + "ms/trial"));
}

const usable = rows.filter((r) => r.mean != null);
usable.sort((a, b) => b.mean - a.mean);
const winner = usable[0];

const report = {
  at: new Date().toISOString(),
  purpose: "Select the frontier baseline model on development cases, so the sealed arena is not handed a model chosen for the holdout.",
  set: "hemmer-opportunity-qualifier-dev-v2",
  scoredUnderSpec: "v4", trials, candidates, rows,
  selected: winner ? winner.model : null,
  selectionNote: "Chosen on development-set mean under an identical strong prompt carrying the same company policy the MIDAS worker holds.",
  usdEstimate: Number(usd.toFixed(4)),
};
writeFileSync(join(stateDir(), "frontier-selection.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("\nselected frontier baseline:", report.selected, "| usd", report.usdEstimate);
