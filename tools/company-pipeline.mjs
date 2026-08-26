/**
 * The Company 0 work pipeline: verify, then qualify.
 *
 * Cheap checks run across the whole population; expensive reasoning is allocated
 * afterwards. Nothing is deleted for being unpromising -- an item that cannot be
 * verified is flagged and retained, because a bot-blocked page is not evidence
 * that an opportunity is fake, and today's low priority is not tomorrow's.
 *
 * Every state change carries the worker, its version, the reason and the cost.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/company-pipeline.mjs <workspaceId> [limit]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import { listWorkItems, putWorkItem, transition, expectedValueScore } from "../packages/eval/src/work-item.ts";
import { buildQualifierRequest, ensureQualifierVersion, qualifierSpec } from "../packages/eval/src/qualifier-foundry.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const workspaceId = process.argv[2] || "ws-hemmer";
const limit = Number(process.argv[3] || 500);
const QUALIFIER_VERSION = process.env.MIDAS_QUALIFIER_VERSION || "oq-v2";

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const store = new FileStore(stateDir());
const version = ensureQualifierVersion(store, QUALIFIER_VERSION);
const spec = qualifierSpec(version.specVersion || "v4");
const provider = new OpenAIResponsesProvider(undefined, version.modelProfile.model);

// ---------------------------------------------------------------- verify
// A cheap check applied to the whole population before any model spend.
const all = listWorkItems(store, workspaceId);
const toVerify = all.filter((w) => w.state === "discovered" && w.source && w.source.url);
let verifiedOk = 0;
let flagged = 0;
for (const w of toVerify) {
  let reachable = false;
  let relevant = false;
  let status = 0;
  try {
    const r = await fetch(w.source.url, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    status = r.status;
    reachable = r.ok;
    if (r.ok) {
      const t = (await r.text()).toLowerCase();
      relevant = /rfp|request for proposal|proposal|bid|solicitation|scope of work|contract/.test(t);
    }
  } catch { status = 0; }
  const evidence = w.evidence.concat([{
    id: "E-VERIFY", source: "midas_verification",
    text: "Source URL fetched: HTTP " + status + (reachable ? (relevant ? ", page contains solicitation language." : ", page reachable but solicitation language not found.") : ", not reachable."),
    url: w.source.url,
  }]);
  const updated = { ...w, evidence, sourceVerification: { status, reachable, relevant, at: new Date().toISOString() } };
  putWorkItem(store, updated);
  if (reachable && relevant) verifiedOk += 1; else flagged += 1;
}
console.log("verification: " + verifiedOk + " confirmed, " + flagged + " flagged and retained (not deleted)");

// -------------------------------------------------------------- qualify
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

/** Present a work item to the qualifier in the shape its contract expects. */
function asQualifierRecord(w) {
  return {
    case_id: w.id,
    title: w.title,
    source: "rfp",
    brief: (w.evidence.find((e) => e.id === "E1") || {}).text || w.title,
    facts: {
      posted_budget_usd: null,
      client_payment_verified: null,
      source_verified: Boolean(w.sourceVerification && w.sourceVerification.relevant),
    },
    evidence: w.evidence.map((e) => ({ id: e.id, text: e.text, source: e.source || "posting", age_days: 1 })),
  };
}

const queue = listWorkItems(store, workspaceId).filter((w) => w.state === "discovered").slice(0, limit);
let usd = 0;
let calls = 0;
const decided = { qualified: 0, declined: 0, held: 0, failed: 0 };

for (const w of queue) {
  const record = asQualifierRecord(w);
  let out = null;
  try {
    const req = buildQualifierRequest(QUALIFIER_VERSION, record);
    const c = await withRetry(() => provider.complete({ input: req.input, instructions: req.instructions, outputSchema: req.outputSchema }));
    const u = c.usage || {};
    calls += 1;
    const cost = estimateUsd(u.inputTokens, u.outputTokens);
    usd += cost;
    const check = validateAgainstSchema(c.text, spec.outputSchema);
    if (!check.ok) { decided.failed += 1; continue; }
    out = check.value;

    const economics = {
      expectedValueUsd: out.estimated_value_usd ? (Number(out.estimated_value_usd.low) + Number(out.estimated_value_usd.high)) / 2 : null,
      closeProbabilityPct: out.close_probability_pct, paymentProbabilityPct: out.payment_probability_pct,
      aiFulfilmentPct: out.ai_fulfillment_pct, humanMinutes: out.human_minutes,
      riskPct: out.fraud_risk === "high" ? 70 : out.fraud_risk === "medium" ? 30 : 10,
      daysToCash: 30,
    };
    let moved = transition({ ...w, economics }, {
      to: "qualifying", by: "worker", reason: "Qualification started.",
      workerRoleId: "opportunity_qualifier", workerVersionId: QUALIFIER_VERSION,
      costUsd: cost, modelCalls: 1, model: version.modelProfile.model,
    });
    const to = out.decision === "pursue" ? "qualified" : out.decision === "decline" ? "declined" : null;
    if (to) {
      moved = transition(moved, {
        to, by: "worker", reason: String(out.rationale || "").slice(0, 400),
        workerRoleId: "opportunity_qualifier", workerVersionId: QUALIFIER_VERSION,
        evidenceRefs: out.cited_evidence_ids || [], output: out,
      });
      decided[to] += 1;
    } else {
      moved = { ...moved, outputs: { ...moved.outputs, qualifying: out } };
      decided.held += 1;
    }
    const ev = expectedValueScore(moved);
    putWorkItem(store, { ...moved, priority: Number(ev.score.toFixed(4)) });
  } catch (e) {
    decided.failed += 1;
    console.log("  qualification failed for " + w.id + ": " + String(e.message).slice(0, 80));
  }
}

const population = listWorkItems(store, workspaceId);
const byState = population.reduce((a, w) => { a[w.state] = (a[w.state] || 0) + 1; return a; }, {});
const report = {
  at: new Date().toISOString(), workspaceId, qualifierVersion: QUALIFIER_VERSION,
  model: version.modelProfile.model,
  verified: { confirmed: verifiedOk, flaggedRetained: flagged },
  qualified: decided.qualified, declined: decided.declined, heldForInfo: decided.held, failed: decided.failed,
  population: population.length, byState, modelCalls: calls, usdEstimate: Number(usd.toFixed(4)),
  note: "Nothing was contacted. Flagged items are retained; ranking decides when work gets attention, not whether it survives.",
};
writeFileSync(join(stateDir(), "company-pipeline.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("qualified " + decided.qualified + " | declined " + decided.declined + " | held " + decided.held + " | failed " + decided.failed);
console.log("population " + population.length + " " + JSON.stringify(byState) + " | usd " + report.usdEstimate);
