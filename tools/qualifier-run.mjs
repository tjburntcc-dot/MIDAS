/**
 * Run an Opportunity Qualifier version over a case set.
 *
 * Usage:
 *   node --import ./tools/register-ts.mjs tools/qualifier-run.mjs <versionId> <dev|sealed>
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import {
  ensureQualifierVersion,
  buildQualifierRequest,
  loadDevCases,
  loadSealedCases,
  OPPORTUNITY_QUALIFIER_SPEC,
} from "../packages/eval/src/qualifier-foundry.ts";
import { runWorkerEval, dimensionMeans } from "../packages/eval/src/worker-spec.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const versionId = process.argv[2];
const which = process.argv[3] || "dev";
if (!versionId) {
  console.error("usage: qualifier-run.mjs <versionId> <dev|sealed>");
  process.exit(2);
}

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) {
    console.error("live provider unavailable:", probe.error);
    process.exit(2);
  }
}

const store = new FileStore(stateDir());
const version = ensureQualifierVersion(store, versionId);

let cases;
let suiteId;
let suiteVersion;
let sealed = false;
if (which === "sealed") {
  const loaded = loadSealedCases();
  cases = loaded.cases;
  suiteId = "hemmer-opportunity-qualifier-sealed-v0";
  suiteVersion = "hemmer-opportunity-qualifier-sealed-v0";
  sealed = true;
  console.log("sealed set verified against committed hash:", loaded.sha256.slice(0, 16));
} else {
  cases = loadDevCases();
  suiteId = "hemmer-opportunity-qualifier-dev-v0";
  suiteVersion = "hemmer-opportunity-qualifier-dev-v0";
}

const provider = new OpenAIResponsesProvider(undefined, version.modelProfile.model);

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

async function respond(record) {
  const req = buildQualifierRequest(versionId, record);
  const completion = await withRetry(() => provider.complete({
    input: req.input,
    instructions: req.instructions,
    outputSchema: req.outputSchema,
  }));
  if (completion.kind !== "live") throw new Error("provider returned a non-live kind");
  const usage = completion.usage || {};
  const cost = {
    inputTokens: Number(usage.inputTokens || 0),
    outputTokens: Number(usage.outputTokens || 0),
    totalTokens: Number(usage.totalTokens || 0),
    usdEstimate: estimateUsd(usage.inputTokens, usage.outputTokens),
  };
  // The schema guard parses and validates in one step and returns a coerced
  // value; a dropped extra field is tolerated, a missing required field is not.
  const check = validateAgainstSchema(completion.text, OPPORTUNITY_QUALIFIER_SPEC.outputSchema);
  return {
    output: check.ok ? check.value : null,
    schemaOk: check.ok,
    cost,
    error: check.ok ? null : "schema: " + (check.errors || []).slice(0, 3).join("; "),
  };
}

const summary = await runWorkerEval({
  store,
  spec: OPPORTUNITY_QUALIFIER_SPEC,
  versionId,
  suiteId,
  suiteVersion,
  cases,
  respond,
  responderKind: "live",
  sealed,
  note: which + " run of " + versionId,
});

const means = dimensionMeans(summary.results);
console.log("--- " + versionId + " on " + which + " (" + summary.n + " cases) ---");
console.log("  model        ", version.modelProfile.model);
console.log("  scored       ", summary.scored + "/" + summary.n, summary.inconclusive ? "INCONCLUSIVE" : "");
console.log("  mean total   ", summary.meanWeightedTotal == null ? "n/a" : summary.meanWeightedTotal.toFixed(2));
console.log("  dimensions   ", JSON.stringify(Object.fromEntries(Object.entries(means).map(([k, v]) => [k, Number(v.toFixed(1))]))));
console.log("  criticalFail ", summary.criticalFailures.length ? summary.criticalFailures.map((f) => f.caseId + ":" + f.code).join(", ") : "none");
console.log("  usd          ", summary.cost.usdEstimate.toFixed(4));
console.log("  runId        ", summary.runId);

const ledgerPath = join(stateDir(), "qualifier-runs.json");
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : [];
ledger.push({
  at: new Date().toISOString(),
  runId: summary.runId,
  versionId,
  set: which,
  sealed,
  model: version.modelProfile.model,
  n: summary.n,
  scored: summary.scored,
  meanWeightedTotal: summary.meanWeightedTotal,
  dimensionMeans: means,
  criticalFailures: summary.criticalFailures,
  usd: summary.cost.usdEstimate,
});
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
