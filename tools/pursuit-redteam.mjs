/**
 * Independent adversarial review of a pursuit recommendation.
 *
 * General: it takes a pursuit record and tries to overturn its verdict. The
 * reviewer is given the full primary source and the company facts and is told
 * its job is to find the legitimate path the underwriter missed. A reviewer
 * asked to "check" a conclusion tends to agree with it, so this one is asked to
 * defeat it.
 *
 * Independence is real here in the ways that matter: a different model family
 * tier from the one that produced the analysis, no sight of the underwriter's
 * reasoning, and an objective that pays off only by disagreeing.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/pursuit-redteam.mjs <pursuitDir> [model]
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "@midas/db";
import { loadWorkspaceEnv, probeLiveResponses, liveSession, OpenAIResponsesProvider } from "@midas/model";
import { estimateUsd } from "../packages/eval/src/spend.ts";

const dir = process.argv[2] || join(stateDir(), "pursuit", "idaho-aeyc");
const model = process.argv[3] || "gpt-5.5";

loadWorkspaceEnv();
if (liveSession().verified !== true) {
  const probe = await probeLiveResponses();
  if (!probe.ok) { console.error("live provider unavailable:", probe.error); process.exit(2); }
}

const record = JSON.parse(readFileSync(join(dir, "pursuit-record.json"), "utf8"));

/** The reviewer sees the facts and the verdict, never the underwriter's argument. */
const brief = {
  solicitation: {
    buyer: record.source.buyer,
    buyer_type: record.source.buyerType,
    budget_usd: record.source.budgetUsd,
    submission_deadline: record.source.submissionDeadline,
    today: record.today,
    delivery_deadline: record.source.deliveryDeadline,
    geographic_restriction: record.source.geographicRestriction,
    submission_mechanism: record.source.submissionMechanism,
    buyer_internal_team_size: record.source.buyerProjectTeamSize,
    mandatory_proposal_contents: record.mandatorySubmissionItems.map((m) => m.item),
    scored_decision_criteria: record.decisionCriteria.map((d) => d.criterion),
    scope_elements: record.scopeElements,
    stated_procurement_conditions: "The RFP states no insurance, bonding, vendor-registration or certification requirement, and contains no certification language on submission.",
    phased_approaches_permitted: true,
  },
  bidder_facts: record.company0,
  verdict_under_review: record.recommendation.verdict,
};

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["verdict_should_change", "strongest_case_for_bidding", "missed_options", "errors_found", "agreements", "residual_risks", "final_position"],
  properties: {
    verdict_should_change: { type: "boolean" },
    strongest_case_for_bidding: { type: "string" },
    missed_options: { type: "array", items: { type: "object", additionalProperties: false, required: ["option", "legitimate", "feasible_by_deadline", "why"], properties: { option: { type: "string" }, legitimate: { type: "boolean" }, feasible_by_deadline: { type: "boolean" }, why: { type: "string" } } } },
    errors_found: { type: "array", items: { type: "string" } },
    agreements: { type: "array", items: { type: "string" } },
    residual_risks: { type: "array", items: { type: "string" } },
    final_position: { type: "string" },
  },
};

const INSTRUCTIONS = [
  "You are an experienced proposal and procurement professional performing an adversarial review.",
  "A colleague has recommended NO-BID on the opportunity described. Your job is to try to OVERTURN that recommendation.",
  "You are paid only if you find a legitimate path they missed. Look for one hard.",
  "",
  "Constraints you must respect, because breaking them makes your answer worthless:",
  "- The bidder may not fabricate or imply experience, clients, portfolio, case studies, team members, credentials or past performance they do not have.",
  "- The bidder may not conceal or misrepresent who performs the work or who is legally responsible.",
  "- The bidder may not circumvent a stated mandatory requirement.",
  "- A partner, subcontractor or specialist may only be cited if such a relationship actually exists; none currently does.",
  "- Winning work the bidder cannot safely deliver is a failure, not a success.",
  "",
  "Consider seriously: phased or discovery-only offers if permitted, subcontracting, named-personnel experience, narrower scope bids, asking the buyer a question, proof-of-capability artifacts built for this buyer, and any procurement angle the colleague may not have considered.",
  "Be concrete about whether each option is genuinely feasible in the time remaining.",
  "If after real effort you cannot overturn the recommendation, say so plainly and explain what would have to be different.",
].join("\n");

const provider = new OpenAIResponsesProvider(undefined, model);
const t0 = Date.now();
const c = await provider.complete({
  input: brief,
  instructions: INSTRUCTIONS,
  outputSchema: { name: "adversarial_review", strict: false, schema: SCHEMA },
});
const u = c.usage || {};
const usd = estimateUsd(u.inputTokens, u.outputTokens);
const text = String(c.text || "");
const a = text.indexOf("{");
const b = text.lastIndexOf("}");
const review = JSON.parse(text.slice(a, b + 1));

const out = {
  at: new Date().toISOString(),
  reviewer: { model, role: "independent adversarial reviewer", objective: "overturn the NO-BID recommendation" },
  independence: "Reviewer saw the solicitation facts, the bidder facts and the verdict, but not the underwriter's reasoning.",
  latencyMs: Date.now() - t0,
  usage: u, usdEstimate: Number(usd.toFixed(4)),
  review,
};
writeFileSync(join(dir, "redteam-review.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("=== INDEPENDENT ADVERSARIAL REVIEW (" + model + ") ===");
console.log("  objective: overturn NO-BID");
console.log("  VERDICT SHOULD CHANGE:", review.verdict_should_change);
console.log("\n  strongest case for bidding:\n   ", String(review.strongest_case_for_bidding).replace(/\n/g, "\n    "));
console.log("\n  missed options:");
for (const m of review.missed_options || []) {
  console.log("   - " + m.option + "  [legitimate=" + m.legitimate + ", feasible_by_deadline=" + m.feasible_by_deadline + "]");
  console.log("       " + String(m.why).slice(0, 300));
}
console.log("\n  errors found in the underwriting:");
for (const e of review.errors_found || []) console.log("   - " + e);
console.log("\n  agreements:");
for (const e of review.agreements || []) console.log("   - " + e);
console.log("\n  residual risks:");
for (const e of review.residual_risks || []) console.log("   - " + e);
console.log("\n  FINAL POSITION:\n   ", String(review.final_position).replace(/\n/g, "\n    "));
console.log("\n  usd", out.usdEstimate, "| latency", out.latencyMs + "ms");
