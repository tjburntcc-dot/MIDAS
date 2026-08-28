/**
 * Foundry cycle for the qualification reasoning procedure.
 *
 * Three prior cycles narrowed the defect to an ordering problem, and this tests
 * the smallest thing that could fix an ordering problem: an order.
 *
 *   A  incumbent     the promoted contract, disposition only
 *   B  prior schema  the identity contract, strongest prior configuration
 *   D  fields only   the procedure's fields with no ordering or precedence
 *   C  CANDIDATE     the same fields plus the order and the precedence ladder
 *
 * D exists because the last two cycles were both decided by it. Twice the
 * structure did the work and the prose did none, and twice the prose was
 * correctly rejected for it. If the order is doing nothing here, D will say so.
 *
 * Every arm runs through the worker adapter, so the subject of each result is
 * the promoted MIDAS qualifier rather than a bare model wearing its job title.
 * The previous two cycles in this line called the provider directly, which made
 * them contract experiments on an undeclared actor -- fine for diagnosis, not
 * fine for a promotion decision.
 *
 * No outbound action.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { QUAL_DEV_CASES, QUAL_SEALED_CASES, routingBalance } from "../packages/eval/src/qualification-cases.ts";
import { COUNTERPARTY_ROLES, COMMERCIALITY, PROCEDURE_TEXT, scoreProcedure, summariseProcedureRun, meetsMargin } from "../packages/eval/src/qualification-procedure.ts";
import { RECORD_KINDS, ORG_ROLES, ROUTING, scoreIdentity, summariseIdentityRun } from "../packages/eval/src/record-identity.ts";
import { adaptWorker, SANDBOX_PROTOCOL } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { certificationEligible, subjectLabel } from "../packages/eval/src/subject-identity.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_QUAL_MODEL || "gpt-4.1";
const adjudicatorModel = process.env.MIDAS_ADJUDICATOR_MODEL || "gpt-5.5";
const REPEATS = Number(process.env.MIDAS_QUAL_REPEATS || 3);
const provider = new OpenAIResponsesProvider(undefined, model);
const adjudicator = new OpenAIResponsesProvider(undefined, adjudicatorModel);
let inTok = 0, outTok = 0, adjIn = 0, adjOut = 0;

/**
 * Frozen before any case is executed. Nothing below moves afterwards.
 *
 * Qualify recall is 0.90 because the sealed set has ten positive cases, chosen
 * before running for exactly this reason: at 0.25 resolution the previous gate
 * could not separate one cautious miss from a broken worker, and it failed a
 * configuration that was better on every other measure. Ten positives make the
 * threshold mean "at most one miss", which is a claim about the worker rather
 * than an artefact of the sample.
 *
 * Two margins, not one. Beating the strongest prior configuration shows the
 * procedure is worth having; beating the same fields without the order shows
 * that the order is what is doing it. The second is the one that killed the last
 * two candidates and it is the honest test.
 */
const CRITERIA = {
  critical: {
    aggregateAsSingleError: 0,
    inventedOpportunityCount: 0,
    inventedBuyerIdentity: 0,
    note: "Non-compensatory. Each of these is a confident answer about something that does not exist, and no other number redeems one.",
  },
  primary: {
    minRoutingAccuracy: 0.85,
    minMarginOverPriorSchema: 0.15,
    minMarginOverFieldsOnly: 0.10,
  },
  balance: {
    minQualifyRecall: 0.90,
    maxFalseAccept: 0.10,
    maxFalseDecline: 0.10,
    maxFalseHold: 0.15,
    minDiscoverySourcePreservation: 0.80,
  },
  competency: {
    minCounterpartyAccuracy: 0.85,
    minCommercialityAccuracy: 0.85,
    minUnknownCardinalityHonesty: 1.0,
    minDecompositionAccuracy: 0.80,
  },
  stability: {
    repeats: REPEATS,
    minStableCases: 5,
    minStableAndCorrect: 5,
    ofCases: 6,
  },
  adjudication: "Every sealed failure of the candidate is classified by a different model into worker / contract / policy / gold / evaluator / ambiguous, given the record and the gold but not told which arm produced the answer. A gold or evaluator defect found this way is recorded and the original scoring stands; the instrument is repaired for future runs, not this one.",
  ambiguousGold: "A case the adjudicator calls underdetermined is still scored as it was written. Promotion is computed on the original scoring in every case.",
};

const IDENTITY_FIELDS = {
  kind: { type: "string", description: RECORD_KINDS.join(" | ") },
  opportunityCount: { type: ["integer", "null"], description: "Distinct pieces of work. 0 when the record represents no work at all; null only when the number is genuinely unknowable." },
  buyerCount: { type: ["integer", "null"], description: "Distinct buyers. Same convention as opportunityCount." },
  orgRole: { type: "string", description: ORG_ROLES.join(" | ") },
  buyerIdentity: { type: "string", description: "established | resolvable | unavailable" },
  routing: { type: "string", description: ROUTING.join(" | ") },
  reasoning: { type: "string" },
};

const PROCEDURE_FIELDS = {
  counterpartyRole: { type: "string", description: COUNTERPARTY_ROLES.join(" | ") },
  counterpartyEstablished: { type: "boolean", description: "Whether the party that would sign and pay is identified well enough to transact with." },
  commerciality: { type: "string", description: COMMERCIALITY.join(" | ") },
  ...IDENTITY_FIELDS,
};

const schemaOf = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

const BASELINE_SCHEMA = schemaOf({
  decision: { type: "string", description: "pursue | hold_for_info | decline" },
  rationale: { type: "string" },
});

const adapted = adaptWorker("qualifier", {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
});
if (!adapted.midasWorker) {
  console.error("No MIDAS qualifier resolved. Refusing to run: the result would describe a base model.");
  process.exit(1);
}
const OPERATING = "Operating knowledge available to you:\n" + adapted.knowledgeBlock;
const TASK = "\n\nYou assess an inbound commercial record for a small digital services business. "
  + "Classify the record and decide where it should go. Return JSON matching the schema.";

const ARMS = {
  A_incumbent: {
    label: "incumbent: promoted contract, disposition only",
    schema: BASELINE_SCHEMA,
    instructions: OPERATING + "\n\nYou assess a single inbound work opportunity for a small digital services business. "
      + "Decide whether to pursue it. Return JSON matching the schema.",
    policyVersion: "promoted-disposition-v1",
  },
  B_prior_schema: {
    label: "prior: identity contract, strongest previous configuration",
    schema: schemaOf(IDENTITY_FIELDS),
    instructions: OPERATING + TASK,
    policyVersion: "record-identity-schema-v1",
  },
  D_fields_only: {
    label: "control: procedure fields, no order and no precedence",
    schema: schemaOf(PROCEDURE_FIELDS),
    instructions: OPERATING + TASK,
    policyVersion: "procedure-fields-v1",
  },
  C_candidate: {
    label: "CANDIDATE: procedure fields plus the order and the precedence ladder",
    schema: schemaOf(PROCEDURE_FIELDS),
    instructions: OPERATING + "\n\n" + PROCEDURE_TEXT + TASK,
    policyVersion: "qualification-procedure-v1",
  },
};

const knowledgeHash = createHash("sha256").update(adapted.knowledgeBlock).digest("hex").slice(0, 16);
function subjectFor(armKey) {
  const arm = ARMS[armKey];
  return {
    actorKind: "foundry_worker",
    workerId: adapted.role, workerVersion: adapted.versionId, model,
    knowledgeVersion: adapted.knowledgeIds.join(",") + "#" + knowledgeHash,
    policyVersion: arm.policyVersion,
    tools: [], retrievalConfig: "none: the record is supplied in full",
    protocolVersion: "single-shot-json (not " + SANDBOX_PROTOCOL.slice(0, 0) + "sandbox)",
    evaluationVersion: "qualification-procedure-sealed-v1",
    configurationFingerprint: createHash("sha256")
      .update([armKey, adapted.versionId, model, knowledgeHash, arm.policyVersion, JSON.stringify(arm.schema), arm.instructions].join("|"))
      .digest("hex").slice(0, 16),
  };
}

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
  return {
    routing: parsed.decision === "pursue" ? "qualify" : parsed.decision === "decline" ? "decline" : "research_identity",
    reasoning: String(parsed.rationale || ""),
  };
}

async function runArm(armKey, cases) {
  const rows = [];
  for (const c of cases) {
    try {
      const predicted = await assess(armKey, c.record);
      rows.push({ caseId: c.id, predicted, gold: c.gold, record: c.record, why: c.why, identity: scoreIdentity(predicted, c.gold), procedure: scoreProcedure(predicted, c.gold, c.record) });
    } catch (e) {
      rows.push({ caseId: c.id, error: String(e.message).slice(0, 120), predicted: {}, gold: c.gold, record: c.record, why: c.why, identity: scoreIdentity({}, c.gold), procedure: scoreProcedure({}, c.gold, c.record) });
    }
  }
  return rows;
}

function metrics(rows, armKey) {
  const id = summariseIdentityRun(rows.map((r) => r.identity));
  const proc = summariseProcedureRun(rows.map((r) => r.procedure));
  const positives = rows.filter((r) => r.gold.routing === "qualify");
  const hasProcedureFields = armKey === "C_candidate" || armKey === "D_fields_only";
  return {
    ...id,
    qualifyRecall: positives.length ? Number((positives.filter((r) => r.identity.routingCorrect).length / positives.length).toFixed(3)) : null,
    aggregateAsSingleError: id.cardinalityBlindCount,
    ...proc,
    counterpartyAccuracy: hasProcedureFields ? proc.counterpartyAccuracy : null,
    commercialityAccuracy: hasProcedureFields ? proc.commercialityAccuracy : null,
  };
}

const STABILITY_CASE_IDS = ["QS-04", "QS-13", "QS-17", "QS-21", "QS-25", "QS-29"];

async function runStability(armKey) {
  const cases = [];
  for (const id of STABILITY_CASE_IDS) {
    const c = QUAL_SEALED_CASES.find((x) => x.id === id);
    const seen = [];
    for (let i = 0; i < REPEATS; i++) {
      try { seen.push((await assess(armKey, c.record)).routing); } catch { seen.push("ERROR"); }
    }
    const distinct = [...new Set(seen)];
    cases.push({ caseId: id, gold: c.gold.routing, seen, stable: distinct.length === 1, correctAndStable: distinct.length === 1 && distinct[0] === c.gold.routing });
  }
  return { cases, stableCases: cases.filter((c) => c.stable).length, stableAndCorrect: cases.filter((c) => c.correctAndStable).length };
}

const sealedDir = repoPath("var", "state", "sealed");
if (!existsSync(sealedDir)) mkdirSync(sealedDir, { recursive: true });
writeFileSync(sealedDir + "/qualification-procedure-sealed-v1.json", JSON.stringify(QUAL_SEALED_CASES, null, 1));
const sealedHash = createHash("sha256").update(JSON.stringify(QUAL_SEALED_CASES)).digest("hex");

console.log("model:", model, "| adjudicator:", adjudicatorModel, "| repeats:", REPEATS);
console.log("subject:", subjectLabel(subjectFor("C_candidate")), "| eligible:", certificationEligible(subjectFor("C_candidate")).eligible);
console.log("sealed:", QUAL_SEALED_CASES.length, JSON.stringify(routingBalance(QUAL_SEALED_CASES)));
console.log("sealed hash:", sealedHash.slice(0, 16));
console.log("candidate declared before running: C_candidate | criteria frozen");
console.log("");

const results = {};
for (const armKey of Object.keys(ARMS)) {
  const sealed = await runArm(armKey, QUAL_SEALED_CASES);
  results[armKey] = {
    label: ARMS[armKey].label,
    subject: subjectFor(armKey),
    sealed: metrics(sealed, armKey),
    sealedRows: sealed.map((r) => ({
      caseId: r.caseId, predRouting: r.predicted.routing, goldRouting: r.gold.routing,
      predKind: r.predicted.kind, goldKind: r.gold.kind, predCount: r.predicted.opportunityCount, goldCount: r.gold.opportunityCount,
      predCounterparty: r.predicted.counterpartyRole, goldCounterparty: r.gold.counterpartyRole,
      predCommerciality: r.predicted.commerciality, goldCommerciality: r.gold.commerciality,
      correct: r.identity.routingCorrect, reasoning: String(r.predicted.reasoning || "").slice(0, 300),
    })),
  };
  const m = results[armKey].sealed;
  console.log(armKey.padEnd(16), ARMS[armKey].label);
  console.log("   routing " + m.routingAccuracy + " | qualifyRecall " + m.qualifyRecall + " | fAcc " + m.falseAcceptRate
    + " | fDec " + m.falseDeclineRate + " | fHold " + m.falseHoldRate + " | aggAsSingle " + m.aggregateAsSingleError);
  console.log("   counterparty " + m.counterpartyAccuracy + " | commerciality " + m.commercialityAccuracy
    + " | unknownHonesty " + m.unknownCardinalityHonesty + " | decompose " + m.decompositionAccuracy
    + " | discoveryKept " + m.discoverySourcePreservation + " | inventedCount " + m.inventedCountCount + " | inventedIdentity " + m.inventedIdentityCount);
}

console.log("");
for (const armKey of ["D_fields_only", "C_candidate"]) {
  results[armKey].stability = await runStability(armKey);
  const s = results[armKey].stability;
  console.log(armKey.padEnd(16) + "stability " + s.stableCases + "/" + STABILITY_CASE_IDS.length + " stable, " + s.stableAndCorrect + "/" + STABILITY_CASE_IDS.length + " stable and correct");
}

const C = results.C_candidate.sealed, B = results.B_prior_schema.sealed, D = results.D_fields_only.sealed;
const S = results.C_candidate.stability;
const K = CRITERIA;

const checks = [
  { tier: "critical", id: "no_aggregate_as_single_opportunity", pass: C.aggregateAsSingleError === K.critical.aggregateAsSingleError, detail: String(C.aggregateAsSingleError) },
  { tier: "critical", id: "no_invented_opportunity_count", pass: C.inventedCountCount === K.critical.inventedOpportunityCount, detail: String(C.inventedCountCount) },
  { tier: "critical", id: "no_invented_buyer_identity", pass: C.inventedIdentityCount === K.critical.inventedBuyerIdentity, detail: String(C.inventedIdentityCount) },
  { tier: "primary", id: "routing_accuracy", pass: C.routingAccuracy >= K.primary.minRoutingAccuracy, detail: String(C.routingAccuracy) },
  { tier: "primary", id: "margin_over_prior_schema", pass: meetsMargin(C.routingAccuracy, B.routingAccuracy, K.primary.minMarginOverPriorSchema).meets, detail: String(meetsMargin(C.routingAccuracy, B.routingAccuracy, K.primary.minMarginOverPriorSchema).margin) },
  { tier: "primary", id: "order_beats_fields_alone", pass: meetsMargin(C.routingAccuracy, D.routingAccuracy, K.primary.minMarginOverFieldsOnly).meets, detail: String(meetsMargin(C.routingAccuracy, D.routingAccuracy, K.primary.minMarginOverFieldsOnly).margin) },
  { tier: "balance", id: "qualify_recall", pass: (C.qualifyRecall ?? 0) >= K.balance.minQualifyRecall, detail: String(C.qualifyRecall) },
  { tier: "balance", id: "few_false_accepts", pass: C.falseAcceptRate <= K.balance.maxFalseAccept, detail: String(C.falseAcceptRate) },
  { tier: "balance", id: "not_a_refusal_machine", pass: C.falseDeclineRate <= K.balance.maxFalseDecline, detail: String(C.falseDeclineRate) },
  { tier: "balance", id: "not_a_holding_machine", pass: C.falseHoldRate <= K.balance.maxFalseHold, detail: String(C.falseHoldRate) },
  { tier: "balance", id: "discovery_sources_preserved", pass: (C.discoverySourcePreservation ?? 0) >= K.balance.minDiscoverySourcePreservation, detail: String(C.discoverySourcePreservation) },
  { tier: "competency", id: "counterparty_selection", pass: (C.counterpartyAccuracy ?? 0) >= K.competency.minCounterpartyAccuracy, detail: String(C.counterpartyAccuracy) },
  { tier: "competency", id: "commerciality_before_cardinality", pass: (C.commercialityAccuracy ?? 0) >= K.competency.minCommercialityAccuracy, detail: String(C.commercialityAccuracy) },
  { tier: "competency", id: "unknown_cardinality_honesty", pass: (C.unknownCardinalityHonesty ?? 0) >= K.competency.minUnknownCardinalityHonesty, detail: String(C.unknownCardinalityHonesty) },
  { tier: "competency", id: "decomposition_accuracy", pass: (C.decompositionAccuracy ?? 0) >= K.competency.minDecompositionAccuracy, detail: String(C.decompositionAccuracy) },
  { tier: "stability", id: "repeat_stability", pass: S.stableCases >= K.stability.minStableCases, detail: S.stableCases + "/" + K.stability.ofCases },
  { tier: "stability", id: "stable_and_correct", pass: S.stableAndCorrect >= K.stability.minStableAndCorrect, detail: S.stableAndCorrect + "/" + K.stability.ofCases },
];
const promote = checks.every((c) => c.pass);

console.log("");
for (const c of checks) console.log((c.pass ? "  PASS " : "  FAIL ") + c.tier.padEnd(11) + c.id.padEnd(36) + c.detail);
console.log("");
console.log(promote ? "PROMOTE the qualification procedure" : "REJECT: " + checks.filter((c) => !c.pass).map((c) => c.id).join(", "));

const DEFECT_CLASSES = "worker_defect | contract_defect | policy_defect | gold_defect | evaluator_defect | underdetermined_case";
const failures = results.C_candidate.sealedRows.filter((r) => !r.correct);
const adjudications = [];
for (const f of failures) {
  const c = QUAL_SEALED_CASES.find((x) => x.id === f.caseId);
  try {
    const out = await adjudicator.complete({
      instructions: "You are auditing an evaluation instrument, not grading a worker. You are shown a commercial record, "
        + "the answer an assessment system gave, and the answer the evaluation set treats as correct. Decide honestly "
        + "whether the disagreement is the system's fault or the evaluation's. Classify as exactly one of: " + DEFECT_CLASSES + ". "
        + "Choose gold_defect if the set's answer is wrong, evaluator_defect if the scoring could not have recognised a correct answer, "
        + "and underdetermined_case if a competent person could defensibly give either answer. Do not default to blaming the system. "
        + "Return JSON.",
      input: ["RECORD:", c.record, "", "SET'S ANSWER: route as " + c.gold.routing, "SET'S STATED REASON: " + c.why,
        "", "SYSTEM'S ANSWER: route as " + f.predRouting, "SYSTEM'S REASON: " + (f.reasoning || "not given")].join("\n"),
      outputSchema: { name: "adjudication", strict: false, schema: schemaOf({
        classification: { type: "string", description: DEFECT_CLASSES },
        confidence: { type: "string", description: "high | medium | low" },
        explanation: { type: "string" },
      }) },
    });
    const u = out.usage || {};
    adjIn += Number(u.inputTokens || 0); adjOut += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    const j = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {};
    adjudications.push({ caseId: f.caseId, gold: f.goldRouting, predicted: f.predRouting, ...j });
  } catch (e) {
    adjudications.push({ caseId: f.caseId, gold: f.goldRouting, predicted: f.predRouting, classification: "ADJUDICATION_FAILED", explanation: String(e.message).slice(0, 120) });
  }
}

if (adjudications.length) {
  console.log("");
  console.log("independent adjudication of candidate failures (" + adjudicatorModel + "):");
  for (const a of adjudications) console.log("  " + a.caseId + " gold=" + a.gold + " pred=" + a.predicted + " -> " + a.classification + " (" + (a.confidence || "?") + ")");
  const instrument = adjudications.filter((a) => /gold_defect|evaluator_defect|underdetermined/.test(String(a.classification)));
  if (instrument.length) {
    console.log("  " + instrument.length + " failure(s) attributed to the instrument. Recorded; the original scoring stands and promotion is unchanged.");
  }
}

const prices = loadPrices();
const cost = costFor({ model, inputTokens: inTok, outputTokens: outTok }, prices);
const adjCost = costFor({ model: adjudicatorModel, inputTokens: adjIn, outputTokens: adjOut }, prices);
console.log("");
console.log("tokens:", inTok + " in / " + outTok + " out (" + model + "), " + adjIn + " in / " + adjOut + " out (" + adjudicatorModel + ")");
console.log("cost:", cost.status, "|", adjudicatorModel + ":", adjCost.status);

writeFileSync(repoPath("var", "state", "qualification-procedure-cycle.json"), JSON.stringify({
  at: new Date().toISOString(), model, adjudicatorModel, sealedHash,
  candidateDeclaredBeforeRunning: "C_candidate", criteria: CRITERIA,
  sealedBalance: routingBalance(QUAL_SEALED_CASES),
  procedureText: PROCEDURE_TEXT,
  stabilityCaseIds: STABILITY_CASE_IDS,
  arms: results, checks, promote, adjudications,
  tokens: { candidate: { input: inTok, output: outTok }, adjudicator: { input: adjIn, output: adjOut } },
  cost, adjudicatorCost: adjCost, outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log(promote ? "PROMOTED CONFIG FINGERPRINT: " + results.C_candidate.subject.configurationFingerprint : "not promoted");
