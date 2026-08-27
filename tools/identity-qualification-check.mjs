/**
 * Does the identity-aware contract get the production record right, repeatedly?
 *
 * The Freelancer record is development evidence -- it is what exposed the gap --
 * so this is a development check, not a certification. What it answers is whether
 * the repair actually reaches the failure it was built for, and whether it does so
 * every time rather than once.
 *
 * The interesting comparison is against the adjudicator, which was limited to
 * pursue, decline and hold_for_info and correctly chose decline. With a richer
 * vocabulary the right answer is better than any of those three: the record is an
 * aggregate, and the correct handling keeps its children rather than discarding
 * them.
 *
 * No outbound action.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { RECORD_KINDS, ORG_ROLES, ROUTING, scoreIdentity } from "../packages/eval/src/record-identity.ts";
import { DEV_CASES } from "../packages/eval/src/record-identity-cases.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE } from "../packages/eval/src/qualifier-foundry.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_IDENTITY_MODEL || "gpt-4.1";
const REPEATS = Number(process.env.MIDAS_IDENTITY_REPEATS || 5);
const provider = new OpenAIResponsesProvider(undefined, model);
let inTok = 0, outTok = 0;

const IDENTITY_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "opportunityCount", "buyerCount", "orgRole", "buyerIdentity", "routing", "reasoning"],
  properties: {
    kind: { type: "string", description: RECORD_KINDS.join(" | ") },
    // The one contract clarification the cycle showed was needed: the control arm
    // returned null for records representing no work, where zero is the honest
    // answer and null means "cannot tell".
    opportunityCount: { type: ["integer", "null"], description: "Distinct pieces of work. Use 0 when the record represents no work at all; null only when the number is genuinely unknowable." },
    buyerCount: { type: ["integer", "null"], description: "Distinct buyers. Same convention as opportunityCount." },
    orgRole: { type: "string", description: ORG_ROLES.join(" | ") },
    buyerIdentity: { type: "string", description: "established | resolvable | unavailable" },
    routing: { type: "string", description: ROUTING.join(" | ") },
    reasoning: { type: "string" },
  },
};

const OPERATING = "Operating knowledge available to you:\n"
  + HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE).map((k) => "- [" + k.id + "] " + k.text).join("\n");

const INSTRUCTIONS = OPERATING + "\n\nYou assess an inbound commercial record for a small digital services business. "
  + "Classify the record and decide where it should go. Return JSON matching the schema.";

const target = DEV_CASES.find((c) => c.id === "DEV-01");

console.log("model:", model, "| repeats:", REPEATS);
console.log("record:", target.title);
console.log("gold: kind=" + target.gold.kind + " count=" + target.gold.opportunityCount + " routing=" + target.gold.routing);
console.log("");

const rows = [];
for (let i = 0; i < REPEATS; i++) {
  try {
    const out = await provider.complete({
      instructions: INSTRUCTIONS,
      input: "RECORD:\n" + target.record,
      outputSchema: { name: "record_assessment", strict: false, schema: IDENTITY_SCHEMA },
    });
    const u = out.usage || {};
    inTok += Number(u.inputTokens || 0); outTok += Number(u.outputTokens || 0);
    const text = String(out.text || "");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    const p = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : {};
    rows.push({ repeat: i, predicted: p, score: scoreIdentity(p, target.gold) });
    console.log(" run " + i + ": kind=" + String(p.kind).padEnd(20) + " count=" + String(p.opportunityCount).padEnd(5)
      + " orgRole=" + String(p.orgRole).padEnd(12) + " routing=" + p.routing);
  } catch (e) {
    rows.push({ repeat: i, error: String(e.message).slice(0, 100), predicted: {}, score: scoreIdentity({}, target.gold) });
    console.log(" run " + i + ": ERROR");
  }
}

const kinds = [...new Set(rows.map((r) => r.predicted.kind))];
const routings = [...new Set(rows.map((r) => r.predicted.routing))];
const correctRouting = rows.filter((r) => r.score.routingCorrect).length;
const cardinalityBlind = rows.filter((r) => r.score.cardinalityBlind).length;
const notOneOpportunity = rows.filter((r) => r.predicted.opportunityCount != null && r.predicted.opportunityCount > 1).length;

console.log("");
console.log("kind stability:    ", kinds.length === 1 ? "STABLE (" + kinds[0] + ")" : "UNSTABLE " + kinds.join(", "));
console.log("routing stability: ", routings.length === 1 ? "STABLE (" + routings[0] + ")" : "UNSTABLE " + routings.join(", "));
console.log("routing correct:    " + correctRouting + "/" + rows.length);
console.log("recognised as multiple opportunities: " + notOneOpportunity + "/" + rows.length);
console.log("qualified an aggregate as one opportunity: " + cardinalityBlind + " (production failure was this, every time)");

const cost = costFor({ model, inputTokens: inTok, outputTokens: outTok }, loadPrices());
console.log("tokens:", inTok + " in / " + outTok + " out | cost:", cost.status === "computed" ? "$" + cost.usd : cost.status);

writeFileSync(repoPath("var", "state", "identity-qualification-check.json"), JSON.stringify({
  at: new Date().toISOString(), model, repeats: REPEATS,
  status: "development check, not certification -- this record is the evidence the repair was built from",
  record: { id: target.id, title: target.title }, gold: target.gold,
  rows,
  kindStable: kinds.length === 1, routingStable: routings.length === 1,
  routingCorrect: correctRouting, cardinalityBlind, notOneOpportunity,
  priorBehaviour: "hold_for_info x5 under the promoted contract, which had no field for record kind or cardinality",
  tokens: { input: inTok, output: outTok }, cost, outboundActionsTaken: 0,
}, null, 1));
