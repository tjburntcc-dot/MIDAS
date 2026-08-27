/**
 * Foundry cycle for routing from resolved commercial record identity.
 *
 * The previous cycle established that the identity contract is what repaired
 * Qualification, and that broad identity knowledge on top of it made things
 * slightly worse. It also left a specific unfixed defect: on the production
 * record the worker classified correctly five times out of five and routed
 * correctly once. It knows what the record is and then does the wrong thing
 * with it.
 *
 * Two questions are asked here, and they are gated separately so that a good
 * answer to one cannot carry the other:
 *
 *   A  incumbent   the promoted contract, which has no identity fields at all
 *   B  CANDIDATE   the schema-only identity contract, declared for promotion
 *                  BEFORE running, because last cycle it won on numbers seen
 *                  after the fact and promoting it then would have been
 *                  inventing the decision after seeing the result
 *   C  increment   B plus a concise generalized routing policy -- the thing
 *                  actually under test, gated against B, not against A
 *
 * The policy is deliberately a statement of the rule, not a set of patterns. No
 * case in either set is described in it, and the production record that started
 * all of this is not mentioned.
 *
 * No outbound action.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { ROUTING_DEV_CASES, ROUTING_SEALED_CASES } from "../packages/eval/src/routing-cases.ts";
import { RECORD_KINDS, ORG_ROLES, ROUTING, scoreIdentity, summariseIdentityRun } from "../packages/eval/src/record-identity.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE } from "../packages/eval/src/qualifier-foundry.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_IDENTITY_MODEL || "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
const STABILITY_REPEATS = Number(process.env.MIDAS_ROUTING_REPEATS || 3);
let inTok = 0, outTok = 0;

/**
 * Frozen before any result is seen.
 *
 * Two gates, because the candidate and the increment are different claims. The
 * candidate is gated against the incumbent it would replace. The increment is
 * gated against the candidate, which is how the last two attempts at adding
 * knowledge to this worker were correctly rejected.
 *
 * The refusal guard and the unknown-count guard are here because both are ways
 * the headline number could improve while the worker got worse: a machine that
 * declines everything scores well on false accepts, and a worker that guesses a
 * count to avoid saying "unknown" can look decisive while inventing facts.
 */
const CRITERIA = {
  candidate: {
    minRoutingAccuracySealed: 0.75,
    minRoutingMarginOverIncumbent: 0.30,
    maxCardinalityBlind: 0,
    maxFalseAcceptRate: 0.15,
    maxFalseDeclineRate: 0.20,
    maxFalseHoldRate: 0.25,
    maxDiscoveryValueLost: 1,
    minUnknownCountRoutingAccuracy: 0.66,
    minQualifyRecall: 0.75,
    minStableCases: 4,
  },
  increment: {
    minRoutingMarginOverCandidate: 0.10,
    mustNotRegressFalseAccept: true,
    mustNotRegressQualifyRecall: true,
    maxCardinalityBlind: 0,
    maxFalseDeclineRate: 0.20,
  },
  note: "The candidate is declared before running because promoting it on last cycle's post-hoc numbers would have been inventing the decision after seeing the result. The increment is gated against the candidate, not the incumbent, because the schema is already known to do most of the work.",
};

/**
 * The increment under test. A statement of the rule, not a list of patterns.
 *
 * The two sentences that carry the actual defect are the unknown-count line and
 * the last one. An unknown count previously pushed the worker away from
 * decomposing, and "many items" was being read as "aggregate" regardless of
 * whether any of the items were work.
 */
const ROUTING_POLICY = [
  "Routing policy. Once you have established what the record is and how many opportunities it holds, route it by that identity rather than by how promising it feels.",
  "- One piece of work whose counterparty you can already assess: qualify it.",
  "- One piece of work whose counterparty is not yet established: research the identity first.",
  "- More than one piece of work in a single record, or a number of pieces you cannot determine: decompose it into its parts. An unknown count is not a reason to treat the record as one thing, and never a reason to discard it.",
  "- A record holding no work but naming real organisations or a real venue: keep it as a place to look.",
  "- A record in which no party is buying anything: decline it.",
  "Route on what the record is, not on how many items it shows. A page of many items with no work in it is declined; a page of many items with work in it is decomposed.",
].join("\n");

const IDENTITY_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "opportunityCount", "buyerCount", "orgRole", "buyerIdentity", "routing", "reasoning"],
  properties: {
    kind: { type: "string", description: RECORD_KINDS.join(" | ") },
    opportunityCount: { type: ["integer", "null"], description: "Distinct pieces of work. Use 0 when the record represents no work at all; null only when the number is genuinely unknowable." },
    buyerCount: { type: ["integer", "null"], description: "Distinct buyers. Same convention as opportunityCount." },
    orgRole: { type: "string", description: ORG_ROLES.join(" | ") },
    buyerIdentity: { type: "string", description: "established | resolvable | unavailable" },
    routing: { type: "string", description: ROUTING.join(" | ") },
    reasoning: { type: "string" },
  },
};

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

const TASK = "\n\nYou assess an inbound commercial record for a small digital services business. "
  + "Classify the record and decide where it should go. Return JSON matching the schema.";

const ARMS = {
  A_incumbent: {
    label: "incumbent (promoted contract, no identity fields)",
    schema: BASELINE_SCHEMA,
    instructions: OPERATING + "\n\nYou assess a single inbound work opportunity for a small digital services business. "
      + "Decide whether to pursue it. Return JSON matching the schema.",
  },
  B_candidate: {
    label: "CANDIDATE: schema-only identity contract",
    schema: IDENTITY_SCHEMA,
    instructions: OPERATING + TASK,
  },
  C_increment: {
    label: "increment: identity contract plus concise routing policy",
    schema: IDENTITY_SCHEMA,
    instructions: OPERATING + "\n\n" + ROUTING_POLICY + TASK,
  },
};

async function assess(armKey, record) {
  const arm = ARMS[armKey];
  const out = await provider.complete({
    instructions: arm.instructions,
    input: "RECORD:\n" + record,
    outputSchema: { name: "record_assessment", strict: false, schema: arm.schema },
  });
  const u = out.usage || {};
  inTok += Number(u.inputTokens || 0); outTok += Number(u.outputTokens || 0);
  const text = String(out.text || "");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  const parsed = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : {};
  if (armKey !== "A_incumbent") return parsed;
  // The incumbent has no identity vocabulary. Its decision is mapped to the
  // nearest routing so it can be scored at all. This is the fairest reading
  // available to it and still cannot express "this is thirty-eight postings".
  return {
    routing: parsed.decision === "pursue" ? "qualify" : parsed.decision === "decline" ? "decline" : "research_identity",
  };
}

async function runArm(armKey, cases) {
  const rows = [];
  for (const c of cases) {
    try {
      const predicted = await assess(armKey, c.record);
      rows.push({ caseId: c.id, predicted, gold: c.gold, score: scoreIdentity(predicted, c.gold) });
    } catch (e) {
      rows.push({ caseId: c.id, error: String(e.message).slice(0, 120), predicted: {}, gold: c.gold, score: scoreIdentity({}, c.gold) });
    }
  }
  return rows;
}

/** Subset metrics that exist to catch a headline number improving dishonestly. */
function guards(rows) {
  const unknown = rows.filter((r) => r.gold.opportunityCount == null);
  const qualifiable = rows.filter((r) => r.gold.routing === "qualify");
  const rate = (subset) => (subset.length ? Number((subset.filter((r) => r.score.routingCorrect).length / subset.length).toFixed(3)) : null);
  return {
    unknownCountCases: unknown.length,
    unknownCountRoutingAccuracy: rate(unknown),
    qualifiableCases: qualifiable.length,
    qualifyRecall: rate(qualifiable),
    // How often a worker invented a total where the record states none.
    inventedCountOnUnknown: unknown.filter((r) => r.predicted.opportunityCount != null && r.predicted.opportunityCount > 1).length,
  };
}

/** One sealed case per routing outcome, repeated. Same routing every time or not. */
const STABILITY_CASE_IDS = ["RSEAL-04", "RSEAL-07", "RSEAL-10", "RSEAL-15", "RSEAL-19"];

async function runStability(armKey) {
  const out = [];
  for (const id of STABILITY_CASE_IDS) {
    const c = ROUTING_SEALED_CASES.find((x) => x.id === id);
    const seen = [];
    for (let i = 0; i < STABILITY_REPEATS; i++) {
      try {
        const p = await assess(armKey, c.record);
        seen.push(p.routing);
      } catch (e) { seen.push("ERROR"); }
    }
    const distinct = [...new Set(seen)];
    out.push({ caseId: id, gold: c.gold.routing, seen, stable: distinct.length === 1, correctAndStable: distinct.length === 1 && distinct[0] === c.gold.routing });
  }
  return {
    cases: out,
    stableCases: out.filter((r) => r.stable).length,
    correctAndStableCases: out.filter((r) => r.correctAndStable).length,
  };
}

const sealedDir = repoPath("var", "state", "sealed");
if (!existsSync(sealedDir)) mkdirSync(sealedDir, { recursive: true });
writeFileSync(sealedDir + "/routing-sealed-v1.json", JSON.stringify(ROUTING_SEALED_CASES, null, 1));
const sealedHash = createHash("sha256").update(JSON.stringify(ROUTING_SEALED_CASES)).digest("hex");

console.log("model:", model, "| dev:", ROUTING_DEV_CASES.length, "| sealed:", ROUTING_SEALED_CASES.length, "| repeats:", STABILITY_REPEATS);
console.log("sealed hash:", sealedHash.slice(0, 16));
console.log("candidate declared before running: B_candidate (schema-only identity contract)");
console.log("");

const results = {};
for (const armKey of Object.keys(ARMS)) {
  const dev = await runArm(armKey, ROUTING_DEV_CASES);
  const sealed = await runArm(armKey, ROUTING_SEALED_CASES);
  results[armKey] = {
    label: ARMS[armKey].label,
    dev: summariseIdentityRun(dev.map((r) => r.score)),
    devGuards: guards(dev),
    sealed: summariseIdentityRun(sealed.map((r) => r.score)),
    sealedGuards: guards(sealed),
    sealedRows: sealed.map((r) => ({ caseId: r.caseId, predRouting: r.predicted.routing, goldRouting: r.gold.routing, predKind: r.predicted.kind, goldKind: r.gold.kind, predCount: r.predicted.opportunityCount, goldCount: r.gold.opportunityCount, correct: r.score.routingCorrect })),
  };
  const s = results[armKey].sealed, g = results[armKey].sealedGuards;
  console.log(armKey.padEnd(14), ARMS[armKey].label);
  console.log("   routing " + s.routingAccuracy + " | falseAccept " + s.falseAcceptRate + " | falseDecline " + s.falseDeclineRate
    + " | falseHold " + s.falseHoldRate + " | blind " + s.cardinalityBlindCount + " | lost " + s.discoveryValueLostCount);
  console.log("   guards: unknown-count routing " + g.unknownCountRoutingAccuracy + " | qualify recall " + g.qualifyRecall
    + " | invented a count " + g.inventedCountOnUnknown);
}

console.log("");
for (const armKey of ["B_candidate", "C_increment"]) {
  results[armKey].stability = await runStability(armKey);
  const st = results[armKey].stability;
  console.log(armKey.padEnd(14) + "stability: " + st.stableCases + "/" + STABILITY_CASE_IDS.length + " stable, "
    + st.correctAndStableCases + "/" + STABILITY_CASE_IDS.length + " stable and correct");
}

const inc = results.A_incumbent.sealed;
const cand = results.B_candidate.sealed, candG = results.B_candidate.sealedGuards, candS = results.B_candidate.stability;
const incr = results.C_increment.sealed, incrG = results.C_increment.sealedGuards, incrS = results.C_increment.stability;
const K = CRITERIA.candidate, I = CRITERIA.increment;

const candidateChecks = [
  { id: "routing_accuracy", pass: cand.routingAccuracy >= K.minRoutingAccuracySealed, detail: String(cand.routingAccuracy) },
  { id: "margin_over_incumbent", pass: (cand.routingAccuracy - inc.routingAccuracy) >= K.minRoutingMarginOverIncumbent, detail: (cand.routingAccuracy - inc.routingAccuracy).toFixed(3) },
  { id: "never_qualifies_an_aggregate", pass: cand.cardinalityBlindCount <= K.maxCardinalityBlind, detail: String(cand.cardinalityBlindCount) },
  { id: "few_false_accepts", pass: cand.falseAcceptRate <= K.maxFalseAcceptRate, detail: String(cand.falseAcceptRate) },
  { id: "not_a_refusal_machine", pass: cand.falseDeclineRate <= K.maxFalseDeclineRate, detail: String(cand.falseDeclineRate) },
  { id: "not_a_holding_machine", pass: cand.falseHoldRate <= K.maxFalseHoldRate, detail: String(cand.falseHoldRate) },
  { id: "keeps_discovery_value", pass: cand.discoveryValueLostCount <= K.maxDiscoveryValueLost, detail: String(cand.discoveryValueLostCount) },
  { id: "unknown_count_routes_correctly", pass: (candG.unknownCountRoutingAccuracy ?? 0) >= K.minUnknownCountRoutingAccuracy, detail: String(candG.unknownCountRoutingAccuracy) },
  { id: "still_qualifies_real_work", pass: (candG.qualifyRecall ?? 0) >= K.minQualifyRecall, detail: String(candG.qualifyRecall) },
  { id: "routing_repeat_stability", pass: candS.stableCases >= K.minStableCases, detail: candS.stableCases + "/" + STABILITY_CASE_IDS.length },
];
const promoteCandidate = candidateChecks.every((c) => c.pass);

const incrementChecks = [
  { id: "beats_candidate_on_routing", pass: (incr.routingAccuracy - cand.routingAccuracy) >= I.minRoutingMarginOverCandidate, detail: (incr.routingAccuracy - cand.routingAccuracy).toFixed(3) + " margin" },
  { id: "no_false_accept_regression", pass: incr.falseAcceptRate <= cand.falseAcceptRate, detail: incr.falseAcceptRate + " vs " + cand.falseAcceptRate },
  { id: "no_qualify_recall_regression", pass: (incrG.qualifyRecall ?? 0) >= (candG.qualifyRecall ?? 0), detail: incrG.qualifyRecall + " vs " + candG.qualifyRecall },
  { id: "never_qualifies_an_aggregate", pass: incr.cardinalityBlindCount <= I.maxCardinalityBlind, detail: String(incr.cardinalityBlindCount) },
  { id: "not_a_refusal_machine", pass: incr.falseDeclineRate <= I.maxFalseDeclineRate, detail: String(incr.falseDeclineRate) },
  { id: "routing_repeat_stability", pass: incrS.stableCases >= K.minStableCases, detail: incrS.stableCases + "/" + STABILITY_CASE_IDS.length },
];
const promoteIncrement = incrementChecks.every((c) => c.pass);

console.log("");
console.log("CANDIDATE (schema-only identity contract) vs incumbent:");
for (const c of candidateChecks) console.log((c.pass ? "  PASS " : "  FAIL ") + c.id.padEnd(32) + c.detail);
console.log(promoteCandidate ? "  => PROMOTE the identity contract" : "  => REJECT: " + candidateChecks.filter((c) => !c.pass).map((c) => c.id).join(", "));
console.log("");
console.log("INCREMENT (routing policy) vs candidate:");
for (const c of incrementChecks) console.log((c.pass ? "  PASS " : "  FAIL ") + c.id.padEnd(32) + c.detail);
console.log(promoteIncrement ? "  => PROMOTE the routing policy" : "  => REJECT: " + incrementChecks.filter((c) => !c.pass).map((c) => c.id).join(", "));

const cost = costFor({ model, inputTokens: inTok, outputTokens: outTok }, loadPrices());
console.log("");
console.log("tokens:", inTok + " in / " + outTok + " out | cost:", cost.status === "computed" ? "$" + cost.usd : cost.status);

writeFileSync(repoPath("var", "state", "routing-foundry-cycle.json"), JSON.stringify({
  at: new Date().toISOString(), model, sealedHash, criteria: CRITERIA,
  candidateDeclaredBeforeRunning: "B_candidate",
  routingPolicy: ROUTING_POLICY,
  stabilityCaseIds: STABILITY_CASE_IDS, stabilityRepeats: STABILITY_REPEATS,
  arms: results, candidateChecks, incrementChecks, promoteCandidate, promoteIncrement,
  tokens: { input: inTok, output: outTok }, cost, outboundActionsTaken: 0,
}, null, 1));
