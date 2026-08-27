/**
 * Foundry cycle for commercial record identity and cardinality.
 *
 * Three arms, because "the worker got better" has two explanations that must be
 * separated: it might have learned to classify records, or it might simply have
 * been handed fields it did not previously have. The previous attempt at this
 * concept failed precisely there -- the candidate matched the control exactly,
 * meaning the schema was doing all the work and the knowledge none of it.
 *
 *   A  baseline   the promoted contract: no identity fields at all
 *   B  control    identity fields available, no identity knowledge
 *   C  candidate  identity fields plus the classification procedure
 *
 * Criteria are declared before any result is seen, and the zero-tolerance one is
 * the production failure itself: an aggregate must never be qualified as a single
 * opportunity.
 *
 * No outbound action.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { DEV_CASES, SEALED_CASES } from "../packages/eval/src/record-identity-cases.ts";
import { RECORD_KINDS, ORG_ROLES, ROUTING, scoreIdentity, summariseIdentityRun } from "../packages/eval/src/record-identity.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE } from "../packages/eval/src/qualifier-foundry.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_IDENTITY_MODEL || "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
let inTok = 0, outTok = 0;

/**
 * Declared before running. Not negotiable afterwards.
 *
 * The cardinality rule has zero tolerance because it is the failure that
 * actually happened: a category page assessed as one opportunity, stably, five
 * times. The false-decline ceiling exists so the repair cannot be achieved by
 * building a refusal machine, and the margin-over-control rule exists because
 * that is exactly how the previous attempt on this concept failed.
 */
const CRITERIA = {
  minKindAccuracySealed: 0.7,
  minRoutingAccuracySealed: 0.7,
  minCardinalityAccuracySealed: 0.8,
  maxCardinalityBlind: 0,
  maxFalseAcceptRate: 0.1,
  maxFalseDeclineRate: 0.2,
  maxDiscoveryValueLost: 1,
  minRoutingMarginOverControl: 0.15,
  note: "Zero tolerance on qualifying an aggregate as one opportunity. A false-decline ceiling so this cannot be met by refusing everything. A margin over control because the last attempt on this concept was defeated by the schema doing all the work.",
};

const IDENTITY_KNOWLEDGE = [
  { id: "K-RI-001", text: "Before assessing whether an opportunity is worth pursuing, establish what kind of record you are looking at. A category page, a search-results page, a directory, a marketplace's own description of itself, and a single posting are different objects, and only the last is one opportunity." },
  { id: "K-RI-002", text: "Count the opportunities and count the buyers separately. A page can hold three briefs from one buyer, or forty postings from forty buyers. If a record represents more than one piece of work, it cannot be scoped, priced or decided as one." },
  { id: "K-RI-003", text: "Signals that a record is an aggregate rather than a single posting: a URL that names a category or a search rather than an item; an organisation field that is plural or names the venue rather than a company; wording such as various, multiple, browse, results, or a stated count; compensation given as a range across unrelated work rather than a figure for this work." },
  { id: "K-RI-004", text: "An aggregate is not worthless. It is usually a good place to find real work. Route it to be broken into its child postings, or keep it as a source to return to. Declining it deletes every real posting behind it; qualifying it invents a single opportunity that does not exist." },
  { id: "K-RI-005", text: "Determine what the named organisation is to the transaction: the buyer who would pay, an intermediary who would contract with us and serve someone else, the platform that merely hosts the posting, or an aggregator that collected it from elsewhere. The platform that hosts a posting is not the buyer." },
  { id: "K-RI-006", text: "An intermediary is frequently a perfectly good customer. An agency, reseller or staffing firm that would sign the contract and pay the invoice is the counterparty, whether or not the end client is named. Do not decline a record for being an intermediary." },
  { id: "K-RI-007", text: "Anonymity is not by itself disqualifying. Distinguish a buyer who is unnamed but reachable, where the identity is worth establishing before deciding, from one who cannot be reached at all, where nothing else can proceed until that changes." },
  { id: "K-RI-008", text: "A company describing its own services, or a directory of firms, is not seeking work today. Neither is worth qualifying and neither is worth deleting: both name real organisations and are worth keeping as places to look." },
];

const IDENTITY_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "opportunityCount", "buyerCount", "orgRole", "buyerIdentity", "routing", "reasoning"],
  properties: {
    kind: { type: "string", description: RECORD_KINDS.join(" | ") },
    opportunityCount: { type: ["integer", "null"], description: "Distinct pieces of work this record represents. null if genuinely unknowable." },
    buyerCount: { type: ["integer", "null"], description: "Distinct buyers this record represents." },
    orgRole: { type: "string", description: ORG_ROLES.join(" | ") },
    buyerIdentity: { type: "string", description: "established | resolvable | unavailable" },
    routing: { type: "string", description: ROUTING.join(" | ") },
    reasoning: { type: "string" },
  },
};

/** The promoted contract, which has no way to express record identity. */
const BASELINE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["decision", "rationale"],
  properties: {
    decision: { type: "string", description: "pursue | hold_for_info | decline" },
    rationale: { type: "string" },
  },
};

const OPERATING = "Operating knowledge available to you:\n"
  + HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE).map((k) => "- [" + k.id + "] " + k.text).join("\n");

const ARMS = {
  A_baseline: {
    label: "baseline (promoted contract, no identity fields)",
    schema: BASELINE_SCHEMA,
    instructions: OPERATING + "\n\nYou assess a single inbound work opportunity for a small digital services business. "
      + "Decide whether to pursue it. Return JSON matching the schema.",
  },
  B_control: {
    label: "control (identity fields, no identity knowledge)",
    schema: IDENTITY_SCHEMA,
    instructions: OPERATING + "\n\nYou assess an inbound commercial record for a small digital services business. "
      + "Classify the record and decide where it should go. Return JSON matching the schema.",
  },
  C_candidate: {
    label: "candidate (identity fields plus classification procedure)",
    schema: IDENTITY_SCHEMA,
    instructions: OPERATING + "\n\n" + "Record identity knowledge:\n"
      + IDENTITY_KNOWLEDGE.map((k) => "- [" + k.id + "] " + k.text).join("\n")
      + "\n\nYou assess an inbound commercial record for a small digital services business. "
      + "Classify the record and decide where it should go. Return JSON matching the schema.",
  },
};

async function runArm(armKey, cases) {
  const arm = ARMS[armKey];
  const rows = [];
  for (const c of cases) {
    try {
      const out = await provider.complete({
        instructions: arm.instructions,
        input: "RECORD:\n" + c.record,
        outputSchema: { name: "record_assessment", strict: false, schema: arm.schema },
      });
      const u = out.usage || {};
      inTok += Number(u.inputTokens || 0); outTok += Number(u.outputTokens || 0);
      const text = String(out.text || "");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      const parsed = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : {};

      // The baseline has no identity vocabulary. Its decision is mapped to the
      // nearest routing so it can be scored at all, which is the fairest reading
      // available and still cannot express "this is forty postings".
      const predicted = armKey === "A_baseline"
        ? {
          kind: undefined, opportunityCount: undefined, buyerCount: undefined, orgRole: undefined,
          routing: parsed.decision === "pursue" ? "qualify" : parsed.decision === "decline" ? "decline" : "research_identity",
        }
        : parsed;

      rows.push({ caseId: c.id, predicted, gold: c.gold, score: scoreIdentity(predicted, c.gold) });
    } catch (e) {
      rows.push({ caseId: c.id, error: String(e.message).slice(0, 100), predicted: {}, gold: c.gold, score: scoreIdentity({}, c.gold) });
    }
  }
  return rows;
}

const sealedDir = repoPath("var", "state", "sealed");
if (!existsSync(sealedDir)) mkdirSync(sealedDir, { recursive: true });
writeFileSync(sealedDir + "/record-identity-sealed-v1.json", JSON.stringify(SEALED_CASES, null, 1));
const sealedHash = createHash("sha256").update(JSON.stringify(SEALED_CASES)).digest("hex");

console.log("model:", model, "| dev cases:", DEV_CASES.length, "| sealed cases:", SEALED_CASES.length);
console.log("sealed hash:", sealedHash.slice(0, 16));
console.log("criteria declared before running:", JSON.stringify(CRITERIA).slice(0, 200) + "...");
console.log("");

const results = {};
for (const armKey of Object.keys(ARMS)) {
  const dev = await runArm(armKey, DEV_CASES);
  const sealed = await runArm(armKey, SEALED_CASES);
  results[armKey] = {
    label: ARMS[armKey].label,
    dev: summariseIdentityRun(dev.map((r) => r.score)),
    sealed: summariseIdentityRun(sealed.map((r) => r.score)),
    sealedRows: sealed.map((r) => ({ caseId: r.caseId, predictedKind: r.predicted.kind, predictedRouting: r.predicted.routing, predictedCount: r.predicted.opportunityCount, goldKind: r.gold.kind, goldRouting: r.gold.routing, goldCount: r.gold.opportunityCount, score: r.score })),
  };
  const s = results[armKey].sealed;
  console.log(armKey.padEnd(12), ARMS[armKey].label);
  console.log("   sealed: kind " + s.kindAccuracy + " | cardinality " + s.cardinalityAccuracy
    + " | routing " + s.routingAccuracy + " | falseAccept " + s.falseAcceptRate
    + " | falseDecline " + s.falseDeclineRate + " | falseHold " + s.falseHoldRate);
  console.log("           cardinality-blind " + s.cardinalityBlindCount + " | discovery value lost " + s.discoveryValueLostCount);
}

const cand = results.C_candidate.sealed;
const ctrl = results.B_control.sealed;
const checks = [
  { id: "kind_accuracy", pass: cand.kindAccuracy >= CRITERIA.minKindAccuracySealed, detail: String(cand.kindAccuracy) },
  { id: "routing_accuracy", pass: cand.routingAccuracy >= CRITERIA.minRoutingAccuracySealed, detail: String(cand.routingAccuracy) },
  { id: "cardinality_accuracy", pass: cand.cardinalityAccuracy >= CRITERIA.minCardinalityAccuracySealed, detail: String(cand.cardinalityAccuracy) },
  { id: "never_qualifies_an_aggregate", pass: cand.cardinalityBlindCount <= CRITERIA.maxCardinalityBlind, detail: String(cand.cardinalityBlindCount) },
  { id: "not_a_refusal_machine", pass: cand.falseDeclineRate <= CRITERIA.maxFalseDeclineRate, detail: String(cand.falseDeclineRate) },
  { id: "few_false_accepts", pass: cand.falseAcceptRate <= CRITERIA.maxFalseAcceptRate, detail: String(cand.falseAcceptRate) },
  { id: "keeps_discovery_value", pass: cand.discoveryValueLostCount <= CRITERIA.maxDiscoveryValueLost, detail: String(cand.discoveryValueLostCount) },
  { id: "knowledge_beats_schema_alone", pass: (cand.routingAccuracy - ctrl.routingAccuracy) >= CRITERIA.minRoutingMarginOverControl, detail: (cand.routingAccuracy - ctrl.routingAccuracy).toFixed(3) + " margin" },
];
const promote = checks.every((c) => c.pass);

console.log("");
for (const c of checks) console.log((c.pass ? "  PASS " : "  FAIL ") + c.id.padEnd(32) + c.detail);
console.log("");
console.log(promote ? "PROMOTE the identity competency" : "REJECT: " + checks.filter((c) => !c.pass).map((c) => c.id).join(", "));

const cost = costFor({ model, inputTokens: inTok, outputTokens: outTok }, loadPrices());
console.log("tokens:", inTok + " in / " + outTok + " out | cost:", cost.status === "computed" ? "$" + cost.usd : cost.status);

writeFileSync(repoPath("var", "state", "identity-foundry-cycle.json"), JSON.stringify({
  at: new Date().toISOString(), model, sealedHash, criteria: CRITERIA,
  historicalContext: "The earlier not_a_buyer taxonomy candidate was REJECTED (0.2 recall on sealed, no margin over control). That rejection stands. This is a different competency: typed classification with cardinality and routing, not a binary disqualifier.",
  knowledge: IDENTITY_KNOWLEDGE,
  arms: results, checks, promote,
  tokens: { input: inTok, output: outTok }, cost,
  outboundActionsTaken: 0,
}, null, 1));
