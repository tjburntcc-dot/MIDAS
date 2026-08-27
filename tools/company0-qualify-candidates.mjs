/**
 * Close the integration gap: run discovered candidates through the promoted
 * Opportunity Qualifier.
 *
 * The foundry trained a worker, measured it on sealed evidence, and promoted
 * oq-v2. The new discovery path then assessed candidates with hand-written
 * regular expressions and never called it. A worker that the business does not
 * use is a lab result, and the whole point of the foundry is that it is not one.
 *
 * The qualifier carries an opportunity_expired disqualifier earned through the
 * foundry, which is precisely the failure that reached the queue unnoticed.
 *
 * Recommendation mode. Nothing is sent, no buyer contacted, no commitment made.
 * There is no outbound code path in this file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FileStore, stateDir, repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { validateAgainstSchema } from "../packages/eval/src/schema-guard.ts";
import { ensureQualifierVersion, buildQualifierRequest, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const store = new FileStore(stateDir());
ensureQualifierVersion(store, QUALIFIER_V2_ID);

const disc = JSON.parse(readFileSync(repoPath("var", "state", "company0-discovery-aligned.json"), "utf8"));
const liveness = JSON.parse(readFileSync(repoPath("var", "state", "company0-liveness.json"), "utf8")).checks;

/**
 * Build a case from what discovery actually captured. Fields the source does not
 * state stay null: the worker is supposed to hold for missing information rather
 * than invent it, and supplying a guess here would be testing the guess.
 */
function toCase(entry, i) {
  const live = liveness[entry.url];
  const gone = live && live.result !== "live";
  const evidence = [
    { id: "E1", text: entry.title + ". " + (entry.statedBudget ? "Stated compensation: " + entry.statedBudget + "." : "No compensation stated."), source: "posting", age_days: null },
    { id: "E2", text: "Application route as stated: " + (entry.how_to_apply || "not stated") + ".", source: "posting", age_days: null },
  ];
  if (gone) {
    evidence.push({
      id: "E-LIVENESS",
      text: "The posting URL was fetched directly. " + live.detail,
      source: "midas_verification", age_days: 0,
    });
  }
  return {
    case_id: "C0-CAND-" + String(i + 1).padStart(2, "0"),
    title: entry.title,
    source: /craigslist/i.test(entry.url) ? "marketplace" : "job_board",
    url: entry.url,
    brief: entry.title + " -- " + (entry.organisation || "organisation not stated")
      + ". " + (entry.stated_budget_text ? "Compensation stated as " + entry.stated_budget_text + "." : "No compensation stated.")
      + (gone ? " " + live.detail : ""),
    facts: {
      posted_budget_usd: null,
      client_payment_verified: null,
      client_prior_hires: null,
      deadline_days: null,
      posted_days_ago: null,
      contact_is_decision_maker: null,
      buyer_type: "private_business",
    },
    evidence,
  };
}

const provider = new OpenAIResponsesProvider(undefined, process.env.MIDAS_QUALIFIER_MODEL || "gpt-4.1");
const cases = disc.candidates.map(toCase);

console.log("running promoted qualifier", QUALIFIER_V2_ID, "over", cases.length, "candidates");
let usd = 0;
const results = [];
for (const c of cases) {
  const req = buildQualifierRequest(QUALIFIER_V2_ID, c);
  try {
    const out = await provider.complete({
      instructions: req.instructions,
      input: JSON.stringify(req.input),
      outputSchema: req.outputSchema,
    });
    const u = out.usage || {};
    usd += estimateUsd(u.inputTokens, u.outputTokens);
    const text = String(out.text || "");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    const parsed = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : null;
    // The validator takes the raw text, not a parsed object -- it does its own
    // extraction so that a malformed response is a schema failure rather than a
    // parse exception swallowed upstream.
    const valid = validateAgainstSchema(text, req.outputSchema);
    results.push({ case_id: c.case_id, title: c.title, url: c.url, schemaValid: valid.ok === true, schemaErrors: valid.errors || [], verdict: parsed });
    const d = parsed?.disqualifiers || [];
    console.log(" ", c.case_id, "|", String(parsed?.decision || "?").padEnd(8), "|", String(parsed?.fraud_risk || "?").padEnd(6),
      "| disqualifiers:", d.length ? d.map((x) => (typeof x === "string" ? x : x.code)).join(",") : "none");
  } catch (e) {
    results.push({ case_id: c.case_id, title: c.title, url: c.url, error: String(e.message).slice(0, 160) });
    console.log(" ", c.case_id, "| FAILED:", String(e.message).slice(0, 90));
  }
}

const expiredCaught = results.filter((r) => JSON.stringify(r.verdict?.disqualifiers || []).includes("opportunity_expired"));
const declined = results.filter((r) => r.verdict?.decision === "decline");
const pursue = results.filter((r) => r.verdict?.decision && r.verdict.decision !== "decline");

const out = {
  at: new Date().toISOString(),
  version: QUALIFIER_V2_ID,
  mode: "recommendation_only",
  outboundActionsTaken: 0,
  estimatedUsd: Number(usd.toFixed(4)),
  integrationGapClosed: "Discovered candidates now pass through the promoted worker instead of hand-written checks.",
  expiredCaughtByWorker: expiredCaught.map((r) => r.case_id),
  declined: declined.length,
  notDeclined: pursue.map((r) => ({ case_id: r.case_id, decision: r.verdict.decision, title: r.title })),
  livenessVerified: Object.keys(liveness).length,
  results,
};
writeFileSync(repoPath("var", "state", "company0-qualifier-verdicts.json"), JSON.stringify(out, null, 1));

console.log("");
console.log("estimated $" + usd.toFixed(4), "| schema-valid:", results.filter((r) => r.schemaValid).length + "/" + results.length);
console.log("opportunity_expired raised by the worker on:", expiredCaught.length ? expiredCaught.map((r) => r.case_id).join(", ") : "(none)");
console.log("declined:", declined.length, "| not declined:", pursue.length);
for (const r of pursue) console.log("   ->", r.verdict.decision, "|", r.title.slice(0, 60));
console.log("outbound actions taken: 0");
