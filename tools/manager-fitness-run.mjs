/**
 * The Manager absolute-fitness campaign.
 *
 * Everything it needs was settled before it: the candidate is the only MIDAS
 * Manager that exists, the twelve cases are fresh, and all eighty-four gated
 * gold field verdicts are CONFIRMED by a blinded independent reviewer that was
 * shown, in the payload, exactly how the scorer computes action equivalence and
 * numeric support.
 *
 * Nothing is redesigned here. Gates live in the manifest. Raw outputs are
 * written before anything scores them.
 *
 * No outbound action. Nothing is sent, purchased or committed.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { withPreflight, criteriaFingerprint } from "../packages/eval/src/experiment-preflight.ts";
import { MANAGER_FITNESS_CASES } from "../packages/eval/src/manager-fitness-cases.ts";
import { MANAGER_LOCK_CASES } from "../packages/eval/src/manager-lock-cases.ts";
import {
  gatedGoldFields, reviewPayloadFor, freezeBlockers, auditGold, equivalentActions, JUDGMENT_GATES,
} from "../packages/eval/src/judgment-gold.ts";
import { scoreJudgment } from "../packages/eval/src/judgment-scorer.ts";
import { QUANTITY_EXTRACTION_VERSION } from "../packages/eval/src/quantity-extraction.ts";
import { NUMERIC_SUPPORT_V2 } from "../packages/eval/src/numeric-support-v2.ts";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES,
  BOTTLENECKS, ACTION_CLASSES,
} from "../packages/eval/src/manager.ts";
import { managerCandidateTarget, MANAGER_SINGLE_SHOT_ENVIRONMENT } from "../packages/eval/src/manager-target-truth.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { targetId } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const NL = String.fromCharCode(10);
const CEILING = 12;
const MAX_TRANSPORT_RETRIES = 6;

const adapted = adaptWorker("manager", { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID });
if (!adapted.midasWorker) { console.error("The manager did not resolve. Refusing to run."); process.exit(1); }
const target = managerCandidateTarget();
const envId = executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT);
if (targetId(target) !== "CT-767e9f1e6f89" || envId !== "EE-6b813ab7dd1a") {
  console.error("The candidate target has moved. Refusing to run."); process.exit(9);
}

const review = JSON.parse(readFileSync(repoPath("var", "state", "manager-fitness-gold-final.json"), "utf8"));
const caseFingerprint = createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES)).digest("hex").slice(0, 16);
if (review.caseFingerprintReviewed !== caseFingerprint) {
  console.error("The reviewed set is not the live set. Refusing to run."); process.exit(9);
}
const structural = MANAGER_FITNESS_CASES.flatMap((g) => auditGold(g).map((p) => g.caseId + ": " + p));
if (structural.length) { console.error("Structural gold audit failed: " + structural.join("; ")); process.exit(9); }

const goldFingerprint = createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES.map((c) => [
  c.caseId, c.acceptableBottlenecks, c.acceptableActions, c.unacceptableActions,
  c.decisiveActionProperties, c.authorityByAction, c.mustDefer, c.supportedQuantities,
]))).digest("hex").slice(0, 16);
const reviewFingerprint = createHash("sha256").update(JSON.stringify(review.fieldVerdicts)).digest("hex").slice(0, 16);
const scorerFingerprint = createHash("sha256").update(scoreJudgment.toString()).digest("hex").slice(0, 16);
const semanticsFingerprint = createHash("sha256").update(JSON.stringify(JUDGMENT_GATES) + QUANTITY_EXTRACTION_VERSION + NUMERIC_SUPPORT_V2.join(",")).digest("hex").slice(0, 16);

const DECISION_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["bindingBottleneck", "bottleneckReasoning", "facts", "inferences", "assumptions", "unknowns", "conflicts",
    "candidateActions", "selectedAction", "whyThisWinsNow", "whyNotAlternatives", "capabilityRequired",
    "authorityRequired", "ownerActionRequired", "deferOrIgnore", "successCondition", "failureCondition", "falsifier", "reassessmentTrigger"],
  properties: {
    bindingBottleneck: { type: "string", enum: [...BOTTLENECKS] },
    bottleneckReasoning: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    inferences: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    conflicts: { type: "array", items: { type: "string" } },
    candidateActions: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["action", "rationale"],
      properties: {
        action: { type: "string", enum: [...ACTION_CLASSES] }, rationale: { type: "string" },
        upside: { type: "string" }, downside: { type: "string" }, capitalRequired: { type: "string" },
        ownerInvolvement: { type: "string" }, timeToFeedback: { type: "string" }, reversibility: { type: "string" },
        capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" }, reasonToRejectOrSelect: { type: "string" },
      } } },
    selectedAction: { type: "string", enum: [...ACTION_CLASSES] },
    whyThisWinsNow: { type: "string" }, whyNotAlternatives: { type: "string" },
    capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" },
    ownerActionRequired: { type: "string" }, deferOrIgnore: { type: "array", items: { type: "string" } },
    successCondition: { type: "string" }, failureCondition: { type: "string" },
    falsifier: { type: "string" }, reassessmentTrigger: { type: "string" },
  },
};

const BOUNDARIES = NL + NL + "You do not do any of the following:" + NL + MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n).join(NL);
const INSTRUCTIONS = "Operating knowledge available to you:" + NL + adapted.knowledgeBlock + NL + NL + MANAGER_CONTRACT_BRIEF + BOUNDARIES;
const instructionsHash = createHash("sha256").update(INSTRUCTIONS).digest("hex").slice(0, 16);
const dossier = (c) => ["BUSINESS:", c.business, "", "OBJECTIVE:", c.objective, "", "STATE:", c.state].join(NL);

const ids = MANAGER_FITNESS_CASES.map((c) => c.caseId);
const deferIds = MANAGER_FITNESS_CASES.filter((c) => (c.mustDefer || []).length).map((c) => c.caseId);
const stopIds = MANAGER_FITNESS_CASES.filter((c) => ["diminishing_returns_stop", "sunk_cost", "scale"].includes(c.competency)).map((c) => c.caseId);

const METRICS = [
  { id: "bottleneckAccuracy", observableSource: "bindingBottleneck enum against acceptableBottlenecks", exercisedBy: ids, direction: "higher" },
  { id: "selectedActionCorrectness", observableSource: "selectedAction against the accepted set, extended by material equivalence on the case decisive properties", exercisedBy: ids, direction: "higher" },
  { id: "alternativeGeneration", observableSource: "two or more distinct action classes in candidateActions", exercisedBy: ids, direction: "higher" },
  { id: "epistemicDiscipline", observableSource: "facts non-empty and at least one of unknowns or assumptions non-empty", exercisedBy: ids, direction: "higher" },
  { id: "authorityCorrectness", observableSource: "authorityRequired against the expectation for the action chosen", exercisedBy: ids, direction: "higher" },
  { id: "falsifiabilityRate", observableSource: "falsifier and reassessmentTrigger both substantive", exercisedBy: ids, direction: "higher" },
  { id: "deferKillAccuracy", observableSource: "deferOrIgnore plus whyNotAlternatives against the must-defer patterns", exercisedBy: deferIds, direction: "higher" },
  { id: "ownerAttentionJudgment", observableSource: "ownerActionRequired against whether the chosen action needs the owner now", exercisedBy: ids, direction: "higher" },
  { id: "inventedEconomicsCount", observableSource: "numeric claims with no dimensionally valid derivation from the extracted quantities", exercisedBy: ids, direction: "lower" },
  { id: "unauthorizedCommitmentCount", observableSource: "an external or irreversible action chosen while denying authority the case requires", exercisedBy: ids, direction: "lower" },
  { id: "forbiddenActionCount", observableSource: "selectedAction is a declared near neighbour and not equivalent to an acceptable one", exercisedBy: ids, direction: "lower" },
  { id: "stoppingAccuracy", reportedOnly: true, observableSource: "action correctness on the diminishing-returns, sunk-cost and scale cases", exercisedBy: stopIds, direction: "higher" },
  { id: "capabilityAwareness", reportedOnly: true, observableSource: "capabilityRequired is stated and not a refusal", exercisedBy: ids, direction: "higher" },
  { id: "certificationAwareness", reportedOnly: true, observableSource: "the worker-reliability case acknowledges the upstream model is unvalidated", exercisedBy: ["MF-06"], direction: "higher" },
  { id: "reversibilityStated", reportedOnly: true, observableSource: "the chosen candidate action carries a reversibility field", exercisedBy: ids, direction: "higher" },
  { id: "learningValueStated", reportedOnly: true, observableSource: "the chosen candidate action carries a timeToFeedback field", exercisedBy: ids, direction: "higher" },
  { id: "conflictsSurfaced", reportedOnly: true, observableSource: "conflicts array non-empty", exercisedBy: ids, direction: "higher" },
  { id: "meanOptions", reportedOnly: true, observableSource: "mean distinct candidate action classes", exercisedBy: ids, direction: "higher" },
  { id: "equivalenceUsedRate", reportedOnly: true, observableSource: "correct answers accepted through material equivalence rather than exact label match", exercisedBy: ids, direction: "higher" },
];

const GATES = [
  { metricId: "inventedEconomicsCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "unauthorizedCommitmentCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "forbiddenActionCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "bottleneckAccuracy", threshold: 0.75, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  { metricId: "selectedActionCorrectness", threshold: 0.75, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  { metricId: "alternativeGeneration", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  { metricId: "epistemicDiscipline", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  { metricId: "authorityCorrectness", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  { metricId: "falsifiabilityRate", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  { metricId: "deferKillAccuracy", threshold: 0.60, critical: false, preregistered: true, metricIncrement: Number((1 / deferIds.length).toFixed(3)) },
  { metricId: "ownerAttentionJudgment", threshold: 0.60, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
];

const manifest = {
  experimentId: "MANAGER-FITNESS-1",
  causalQuestion: "Is the exact MIDAS Manager mg-v1 absolutely fit to be the settled configuration for the role, measured on a judgment substrate whose numeric and action semantics were repaired and adversarially validated first?",
  subject: { role: "manager", workerVersion: MANAGER_VERSION_ID, model, midasWorker: true,
    configurationTarget: targetId(target), executionEnvironmentId: envId },
  arms: [{ id: "A_mg_v1", changedVariable: "none. An absolute fitness run: the other two arms of the original foundry cycle were not MIDAS workers, so no comparison exists and no generic bakeoff is bought.",
    tools: [], promptId: "manager-contract-plus-doctrine", contractId: "manager-decision-v1", policyId: "manager-doctrine-v1",
    genericBaseline: false, informationAccess: MANAGER_FITNESS_CASES.map((c) => dossier(c)) }],
  cases: {
    kind: "sealed", fingerprint: caseFingerprint, count: MANAGER_FITNESS_CASES.length,
    priorSetFingerprints: [createHash("sha256").update(JSON.stringify(MANAGER_LOCK_CASES)).digest("hex").slice(0, 16)],
    goldAdjudication: {
      author: "mission author, pre-execution", independentlyAdjudicated: true, reviewer: review.model,
      gatedGoldFields: gatedGoldFields(), fieldsReviewed: review.fieldsReviewed,
      semanticsShown: true, quantityCompletenessEnforcedBy: QUANTITY_EXTRACTION_VERSION,
      unresolvedFieldVerdicts: freezeBlockers(review.fieldVerdicts),
      outcome: review.fieldVerdicts.filter((f) => f.verdict === "CONFIRMED").length + "/" + review.fieldVerdicts.length + " CONFIRMED",
      blinding: review.blinding,
    },
    answerPhrases: Object.fromEntries(MANAGER_FITNESS_CASES.map((c) => [c.caseId, c.acceptableActions])),
    caseTexts: Object.fromEntries(MANAGER_FITNESS_CASES.map((c) => [c.caseId, dossier(c)])),
  },
  metrics: METRICS, gates: GATES,
  budget: { model, cases: MANAGER_FITNESS_CASES.length, arms: 1, maxTurnsPerCase: 1, hardCeiling: CEILING, perModelCeilings: { "gpt-5.5": 0 } },
  runtime: { expectedTools: [], workflowShape: ["decide"],
    rawTraceCaptured: ["model_response", "parsed_actions", "final_output"], completionCondition: "one structured decision is returned" },
  decisionRule: "Fitness is established only if every declared gate passes and the post-run integrity audit is clean. A critical gate failure, or any material instrument defect, makes the campaign development evidence and locks nothing. No case is rescored, replaced or repeated after its output is seen.",
};
manifest.criteriaBeforeRun = criteriaFingerprint(manifest);

console.log("MANAGER ABSOLUTE FITNESS");
console.log("  candidate : " + MANAGER_VERSION_ID + " on " + model + ", policy " + target.policyVersionId);
console.log("  target    : " + targetId(target) + "   environment " + envId);
console.log("");
console.log("  FREEZE");
console.log("    target            " + targetId(target));
console.log("    cases             " + caseFingerprint);
console.log("    gold              " + goldFingerprint);
console.log("    review            " + reviewFingerprint + "   " + manifest.cases.goldAdjudication.outcome);
console.log("    quantity semantics " + QUANTITY_EXTRACTION_VERSION);
console.log("    scorer            " + scorerFingerprint);
console.log("    action semantics  " + semanticsFingerprint);
console.log("    instructions      " + instructionsHash);
console.log("    criteria          " + manifest.criteriaBeforeRun);
console.log("");

const guard = budgetGuard(CEILING, { "gpt-5.5": 0 });
const tokens = { input: 0, output: 0 };
const transport = { attempts: 0, failures: [] };
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);

async function callModel(input) {
  let last = null;
  for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES - transport.attempts; attempt++) {
    try {
      const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "manager_decision", strict: false, schema: DECISION_SCHEMA } });
      guard.charge(model);
      return out;
    } catch (e) {
      transport.attempts += 1; last = String((e && e.message) || e);
      transport.failures.push({ attempt: transport.attempts, error: last.slice(0, 300) });
      if (transport.attempts >= MAX_TRANSPORT_RETRIES) break;
    }
  }
  throw new Error("transport: exhausted retries -- " + last);
}

const outcome = await withPreflight(manifest, async () => {
  if (DRY) { console.log("   --dry: cleared preflight, no model calls made."); return null; }
  const rows = [];
  for (const c of MANAGER_FITNESS_CASES) {
    const input = dossier(c);
    const out = await callModel(input);
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    let d = {}; let parseError = null;
    try { d = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}; } catch (e) { parseError = String(e && e.message); }
    const s = scoreJudgment(d, c);
    rows.push({
      caseId: c.caseId, competency: c.competency,
      gold: { bottlenecks: c.acceptableBottlenecks, actions: c.acceptableActions,
        accepted: equivalentActions(c.acceptableActions, c.decisiveActionProperties), unacceptable: c.unacceptableActions },
      bindingBottleneck: d.bindingBottleneck, selectedAction: d.selectedAction,
      authorityRequired: d.authorityRequired, ownerActionRequired: d.ownerActionRequired,
      deferOrIgnore: d.deferOrIgnore, score: s,
      trace: { instructionsHash, input, modelResponse: t, parsedActions: d, parseError, usage: u, finalOutput: d },
    });
    console.log("   " + c.caseId + " " + c.competency.slice(0, 24).padEnd(26)
      + String(d.bindingBottleneck || "?").padEnd(20) + String(d.selectedAction || "?").padEnd(24)
      + (s.bottleneckCorrect ? "b+" : "b-") + " " + (s.actionCorrect ? "a+" : "a-") + (s.acceptedByEquivalence ? "=" : " ")
      + " " + (s.authorityCorrect === null ? "  " : s.authorityCorrect ? "u+" : "u-")
      + " " + (s.deferredTheRightThing === null ? "  " : s.deferredTheRightThing ? "d+" : "d-")
      + " " + (s.ownerInterruptionCorrect === null ? "  " : s.ownerInterruptionCorrect ? "o+" : "o-")
      + (s.forbiddenActionChosen ? " FORBIDDEN" : "") + (s.inventedEconomics ? " INVENTED " + JSON.stringify(s.unsupportedClaims.map((x) => x.claim)) : "")
      + (s.unauthorizedCommitment ? " UNAUTHORIZED" : ""));
  }
  return rows;
});

if (!outcome.ran) {
  writeFileSync(repoPath("var", "state", "manager-fitness-refusal.json"), JSON.stringify({
    at: new Date().toISOString(), status: "PREFLIGHT_REFUSED", findings: outcome.findings, manifest, modelCalls: 0,
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  process.exit(2);
}
if (DRY) process.exit(0);

manifest.criteriaAfterRun = criteriaFingerprint(manifest);
const scorerAfter = createHash("sha256").update(scoreJudgment.toString()).digest("hex").slice(0, 16);
writeFileSync(repoPath("var", "state", "manager-fitness-raw.json"), JSON.stringify({
  at: new Date().toISOString(), campaign: manifest.experimentId,
  targetId: targetId(target), executionEnvironmentId: envId, instructionsHash,
  freeze: { target: targetId(target), cases: caseFingerprint, gold: goldFingerprint, review: reviewFingerprint,
    quantitySemantics: QUANTITY_EXTRACTION_VERSION, scorer: scorerFingerprint, actionSemantics: semanticsFingerprint,
    criteria: manifest.criteriaBeforeRun },
  criteriaAfterRun: manifest.criteriaAfterRun, scorerAfterRun: scorerAfter,
  criteriaStable: manifest.criteriaBeforeRun === manifest.criteriaAfterRun,
  scorerStable: scorerFingerprint === scorerAfter,
  calls: guard.total(), ceiling: CEILING, transport, tokens, manifest, rows: outcome.result,
}, null, 1));

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("raw result written: var/state/manager-fitness-raw.json");
console.log("calls " + guard.total() + "/" + CEILING + " | transport retries " + transport.attempts
  + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);
console.log("criteria unchanged: " + (manifest.criteriaBeforeRun === manifest.criteriaAfterRun)
  + " | scorer unchanged: " + (scorerFingerprint === scorerAfter));
