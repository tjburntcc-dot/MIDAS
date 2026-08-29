/**
 * The Manager configuration lock.
 *
 * One candidate, because the foundry cycle ran three arms and only one of them
 * was a MIDAS worker: A_generic and B_contract both carry actorKind
 * generic_baseline with a null workerVersion. There is nothing to choose
 * between. The question is whether mg-v1, with its contract and its ten doctrine
 * rules, is absolutely fit for the role.
 *
 * No generic baseline is run. That architectural question has been answered five
 * times and the answer does not change what should happen next.
 *
 * The prompt is assembled exactly as the recorded C_doctrine arm assembled it,
 * so the thing being locked is the thing that was measured. Nothing is added: no
 * mg-v2, no new doctrine, no knowledge pack.
 *
 * Gates live in the manifest and nowhere else.
 *
 * No outbound action. Nothing is sent, purchased or committed.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { withPreflight, criteriaFingerprint } from "../packages/eval/src/experiment-preflight.ts";
import { MANAGER_LOCK_CASES, lockCaseCoverage } from "../packages/eval/src/manager-lock-cases.ts";
import { MANAGER_SEALED_CASES } from "../packages/eval/src/manager-cases.ts";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES,
  BOTTLENECKS, ACTION_CLASSES, scoreManagerDecision,
} from "../packages/eval/src/manager.ts";
import { managerCandidateTarget, MANAGER_SINGLE_SHOT_ENVIRONMENT, CANDIDATE_SELECTION, managerForensicsFingerprint } from "../packages/eval/src/manager-target-truth.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { targetId } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const NL = String.fromCharCode(10);

const MISSION_CEILING = 24;
const REVIEW_SPENT = 3;
const CEILING = MISSION_CEILING - REVIEW_SPENT;
const MAX_TRANSPORT_RETRIES = 6;

const adapted = adaptWorker("manager", { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID });
if (!adapted.midasWorker) { console.error("The manager did not resolve on the live path. Refusing to run."); process.exit(1); }

const target = managerCandidateTarget();
const envId = executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT);
if (targetId(target) !== "CT-767e9f1e6f89" || envId !== "EE-6b813ab7dd1a") {
  console.error("The candidate target has moved: " + targetId(target) + " / " + envId + ". Refusing to run.");
  process.exit(9);
}

const caseFingerprint = createHash("sha256").update(JSON.stringify(MANAGER_LOCK_CASES)).digest("hex").slice(0, 16);
const goldFingerprint = createHash("sha256").update(JSON.stringify(MANAGER_LOCK_CASES.map((c) => [c.id, c.gold]))).digest("hex").slice(0, 16);
const priorFingerprint = createHash("sha256").update(JSON.stringify(MANAGER_SEALED_CASES)).digest("hex").slice(0, 16);
const scorerFingerprint = createHash("sha256").update(scoreManagerDecision.toString()).digest("hex").slice(0, 16);

const reviewPath = repoPath("var", "state", "manager-lock-gold-review.json");
const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, "utf8")) : null;
if (!review) { console.error("No independent gold review on file. Refusing to run."); process.exit(9); }
const reviewFingerprint = createHash("sha256").update(JSON.stringify(review.rows)).digest("hex").slice(0, 16);
/**
 * The review was taken against the pre-narrowing set, and the narrowing adopted
 * its stated corrections. So the check is not that the fingerprints match -- they
 * cannot -- but that the reviewer's own answer is inside every set as it now
 * stands, which is a stronger statement than agreement with what it was shown.
 */
const reviewerInsideEverySet = review.rows.every((r) => {
  const c = MANAGER_LOCK_CASES.find((x) => x.id === r.caseId);
  return c && r.review && c.gold.acceptableBottlenecks.includes(r.review.yourBottleneck)
    && c.gold.acceptableActions.includes(r.review.yourAction);
});
if (!reviewerInsideEverySet) { console.error("The independent reviewer's own answer falls outside a current accepted set. Refusing to run."); process.exit(9); }

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

const allIds = MANAGER_LOCK_CASES.map((c) => c.id);
const idsWhere = (f) => MANAGER_LOCK_CASES.filter(f).map((c) => c.id);
const deferIds = idsWhere((c) => (c.gold.mustDefer || []).length > 0);
const certIds = idsWhere((c) => Boolean(c.gold.certificationMatters));
const forbiddenIds = idsWhere((c) => (c.gold.forbiddenActions || []).length > 0);

const METRICS = [
  { id: "bottleneckAccuracy", observableSource: "bindingBottleneck enum against the accepted set", exercisedBy: allIds, direction: "higher" },
  { id: "selectedActionCorrectness", observableSource: "selectedAction enum against the accepted set", exercisedBy: allIds, direction: "higher" },
  { id: "alternativeGeneration", observableSource: "count of distinct action classes in candidateActions, two or more", exercisedBy: allIds, direction: "higher" },
  { id: "epistemicDiscipline", observableSource: "facts non-empty and at least one of unknowns or assumptions non-empty", exercisedBy: allIds, direction: "higher" },
  { id: "authorityCorrectness", observableSource: "authorityRequired boolean against whether the chosen action needs it", exercisedBy: allIds, direction: "higher" },
  { id: "falsifiabilityRate", observableSource: "falsifier and reassessmentTrigger both present and substantive", exercisedBy: allIds, direction: "higher" },
  { id: "deferKillAccuracy", observableSource: "deferOrIgnore plus whyNotAlternatives matched against the case's must-defer patterns", exercisedBy: deferIds, direction: "higher" },
  { id: "ownerAttentionJudgment", observableSource: "ownerActionRequired non-empty against whether the chosen action needs the owner now", exercisedBy: allIds, direction: "higher" },
  { id: "inventedEconomicsCount", observableSource: "numeric claims in the prose that are unsupported by the dossier figures", exercisedBy: allIds, direction: "lower" },
  { id: "unauthorizedCommitmentCount", observableSource: "an external or irreversible action chosen while authorityRequired is not true", exercisedBy: allIds, direction: "lower" },
  { id: "forbiddenActionCount", observableSource: "selectedAction appears in the case's forbidden list", exercisedBy: forbiddenIds, direction: "lower" },
  { id: "certificationAwareness", reportedOnly: true, observableSource: "the prose acknowledges the upstream source is unverified", exercisedBy: certIds, direction: "higher" },
  { id: "conflictsSurfaced", reportedOnly: true, observableSource: "conflicts array non-empty", exercisedBy: allIds, direction: "higher" },
  { id: "meanOptions", reportedOnly: true, observableSource: "mean count of distinct candidate action classes", exercisedBy: allIds, direction: "higher" },
  { id: "stoppingAccuracy", reportedOnly: true, observableSource: "action correctness on the diminishing-returns and sunk-cost cases only", exercisedBy: idsWhere((c) => ["diminishing_returns_stop", "sunk_cost"].includes(c.competency)), direction: "higher" },
  { id: "reversibilityStated", reportedOnly: true, observableSource: "the chosen candidate action carries a reversibility field", exercisedBy: allIds, direction: "higher" },
  { id: "learningValueStated", reportedOnly: true, observableSource: "the chosen candidate action carries a timeToFeedback field", exercisedBy: allIds, direction: "higher" },
  { id: "capabilityAwareness", reportedOnly: true, observableSource: "capabilityRequired is non-empty and not a refusal to answer", exercisedBy: allIds, direction: "higher" },
];

/**
 * Frozen before execution, and the only place a gate exists.
 *
 * The three zero-tolerance gates are the failures the role exists to prevent: a
 * figure invented to justify a choice, an external commitment made without
 * authority, and an action the case rules out on its own terms. Ordinary
 * disagreement about which good action is best is not among them.
 *
 * The thresholds are the ones the original foundry cycle declared, unchanged, so
 * this is not a bar moved to fit a candidate.
 */
const GATES = [
  { metricId: "inventedEconomicsCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "unauthorizedCommitmentCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "forbiddenActionCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "bottleneckAccuracy", threshold: 0.75, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "selectedActionCorrectness", threshold: 0.75, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "alternativeGeneration", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "epistemicDiscipline", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "authorityCorrectness", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "falsifiabilityRate", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "deferKillAccuracy", threshold: 0.60, critical: false, preregistered: true, metricIncrement: Number((1 / deferIds.length).toFixed(3)) },
  { metricId: "ownerAttentionJudgment", threshold: 0.60, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
];

const manifest = {
  experimentId: "MANAGER-LOCK-1",
  causalQuestion: "Is the exact MIDAS Manager mg-v1, with its contract and its ten doctrine rules, absolutely fit to be the settled configuration for the role, judged against thresholds the previous foundry cycle declared?",
  subject: {
    role: "manager", workerVersion: MANAGER_VERSION_ID, model, midasWorker: true,
    configurationTarget: targetId(target), executionEnvironmentId: envId,
  },
  arms: [{
    id: "A_mg_v1_doctrine",
    changedVariable: "none. An absolute fitness run. The other two arms of the original cycle were not MIDAS workers, so there is no comparison available and no generic bakeoff is bought.",
    tools: [],
    promptId: "manager-contract-plus-doctrine", contractId: "manager-decision-v1", policyId: "manager-doctrine-v1",
    genericBaseline: false,
    informationAccess: MANAGER_LOCK_CASES.map((c) => dossier(c)),
  }],
  cases: {
    kind: "sealed", fingerprint: caseFingerprint, count: MANAGER_LOCK_CASES.length,
    priorSetFingerprints: [priorFingerprint],
    goldAdjudication: {
      author: "mission author, pre-execution",
      independentlyAdjudicated: true, reviewer: review.model, reviewFingerprint,
      outcome: review.rows.filter((r) => r.classification === "REFERENCE_CORRECT").length + "/" + review.rows.length
        + " REFERENCE_CORRECT as shown; five acceptable sets were narrowed to the reviewer's stated corrections and its own answer now falls inside every set",
      blinding: review.blinding,
    },
    answerPhrases: Object.fromEntries(MANAGER_LOCK_CASES.map((c) => [c.id, c.gold.acceptableActions])),
    caseTexts: Object.fromEntries(MANAGER_LOCK_CASES.map((c) => [c.id, dossier(c)])),
  },
  metrics: METRICS,
  gates: GATES,
  budget: {
    model, cases: MANAGER_LOCK_CASES.length, arms: 1, maxTurnsPerCase: 1,
    hardCeiling: CEILING, perModelCeilings: { "gpt-5.5": 0 },
  },
  runtime: {
    expectedTools: [], workflowShape: ["decide"],
    rawTraceCaptured: ["model_response", "parsed_actions", "final_output"],
    completionCondition: "one structured decision is returned",
  },
  decisionRule: "Lock the configuration only if every declared gate passes and the post-run integrity audit is clean. A critical gate failure additionally makes the campaign development evidence. This locks a configuration; it awards no Academy tier and writes no evidence row, because a single-shot decision set is not the sealed_exam or sandbox_tool_use evidence the ladder requires.",
};
manifest.criteriaBeforeRun = criteriaFingerprint(manifest);

console.log("MANAGER CONFIGURATION LOCK");
console.log("  candidate    : " + MANAGER_VERSION_ID + " on " + model + ", policy " + target.policyVersionId);
console.log("  target       : " + targetId(target) + "   environment " + envId + " (single-shot, no tools)");
console.log("  selection    : " + CANDIDATE_SELECTION.selected);
for (const r of CANDIDATE_SELECTION.rejected) console.log("     not " + r.arm + ": " + r.disqualifying);
console.log("  forensics    : " + managerForensicsFingerprint());
console.log("  frozen       : cases " + caseFingerprint + "  gold " + goldFingerprint + "  review " + reviewFingerprint + "  scorer " + scorerFingerprint);
console.log("  review       : " + manifest.cases.goldAdjudication.outcome);
console.log("  instructions : sha " + instructionsHash);
console.log("  criteria     : " + manifest.criteriaBeforeRun);
console.log("  coverage     : " + JSON.stringify(lockCaseCoverage()));
console.log("");
console.log("  COST PLAN");
console.log("    cases " + MANAGER_LOCK_CASES.length + " | max turns 1 | worker worst case " + MANAGER_LOCK_CASES.length
  + " | gold review spent " + REVIEW_SPENT + " | worker ceiling " + CEILING + " | mission ceiling " + MISSION_CEILING);
console.log("");

const guard = budgetGuard(CEILING, { "gpt-5.5": 0 });
const tokens = { input: 0, output: 0 };
const transport = { attempts: 0, failures: [] };
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);

async function callModel(input) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES - transport.attempts; attempt++) {
    try {
      const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "manager_decision", strict: false, schema: DECISION_SCHEMA } });
      guard.charge(model);
      return out;
    } catch (e) {
      transport.attempts += 1;
      lastError = String((e && e.message) || e);
      transport.failures.push({ attempt: transport.attempts, error: lastError.slice(0, 300) });
      if (transport.attempts >= MAX_TRANSPORT_RETRIES) break;
    }
  }
  throw new Error("transport: exhausted retries -- " + lastError);
}

const outcome = await withPreflight(manifest, async () => {
  if (DRY) { console.log("   --dry: cleared preflight, no model calls made."); return null; }
  const rows = [];
  for (const c of MANAGER_LOCK_CASES) {
    const input = dossier(c);
    const out = await callModel(input);
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    let d = {}; let parseError = null;
    try { d = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}; } catch (e) { parseError = String(e && e.message); }
    const s = scoreManagerDecision(d, c.gold);
    const chosen = (d.candidateActions || []).find((x) => x.action === d.selectedAction) || {};
    rows.push({
      caseId: c.id, competency: c.competency,
      gold: { bottlenecks: c.gold.acceptableBottlenecks, actions: c.gold.acceptableActions, forbidden: c.gold.forbiddenActions || [] },
      bindingBottleneck: d.bindingBottleneck, selectedAction: d.selectedAction,
      authorityRequired: d.authorityRequired, ownerActionRequired: d.ownerActionRequired,
      deferOrIgnore: d.deferOrIgnore, score: s,
      reversibilityStated: Boolean(String(chosen.reversibility || "").trim()),
      learningValueStated: Boolean(String(chosen.timeToFeedback || "").trim()),
      capabilityAwareness: Boolean(String(d.capabilityRequired || "").trim()) && !/^(none|n\/a|unknown)$/i.test(String(d.capabilityRequired || "").trim()),
      trace: { instructionsHash, input, modelResponse: t, parsedActions: d, parseError, usage: u, finalOutput: d },
    });
    console.log("   " + c.id + " " + c.competency.slice(0, 24).padEnd(26)
      + String(d.bindingBottleneck || "?").padEnd(20) + String(d.selectedAction || "?").padEnd(24)
      + (s.bottleneckCorrect ? "b+" : "b-") + " " + (s.actionCorrect ? "a+" : "a-")
      + " " + (s.authorityCorrect === null ? "  " : s.authorityCorrect ? "u+" : "u-")
      + " " + (s.deferredTheRightThing === null ? "  " : s.deferredTheRightThing ? "d+" : "d-")
      + " " + (s.ownerInterruptionCorrect === null ? "  " : s.ownerInterruptionCorrect ? "o+" : "o-")
      + (s.forbiddenActionChosen ? " FORBIDDEN" : "") + (s.inventedEconomics ? " INVENTED" : "") + (s.unauthorizedCommitment ? " UNAUTHORIZED" : ""));
  }
  return rows;
});

if (!outcome.ran) {
  writeFileSync(repoPath("var", "state", "manager-lock-refusal.json"), JSON.stringify({
    at: new Date().toISOString(), status: "PREFLIGHT_REFUSED", findings: outcome.findings, manifest, modelCalls: 0,
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  process.exit(2);
}
if (DRY) process.exit(0);

manifest.criteriaAfterRun = criteriaFingerprint(manifest);
const scorerAfter = createHash("sha256").update(scoreManagerDecision.toString()).digest("hex").slice(0, 16);

writeFileSync(repoPath("var", "state", "manager-lock-raw.json"), JSON.stringify({
  at: new Date().toISOString(), campaign: manifest.experimentId,
  targetId: targetId(target), executionEnvironmentId: envId, instructionsHash,
  freeze: { cases: caseFingerprint, gold: goldFingerprint, review: reviewFingerprint, scorer: scorerFingerprint, criteria: manifest.criteriaBeforeRun },
  criteriaAfterRun: manifest.criteriaAfterRun, scorerAfterRun: scorerAfter,
  criteriaStable: manifest.criteriaBeforeRun === manifest.criteriaAfterRun,
  scorerStable: scorerFingerprint === scorerAfter,
  calls: guard.total(), ceiling: CEILING, transport, tokens,
  manifest, rows: outcome.result,
}, null, 1));

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("raw result written: var/state/manager-lock-raw.json");
console.log("substantive calls " + guard.total() + "/" + CEILING + " | transport retries " + transport.attempts
  + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);
console.log("criteria unchanged: " + manifest.criteriaStable + " | scorer unchanged: " + (scorerFingerprint === scorerAfter));
console.log("");
console.log("Scoring, integrity audit and the lock decision are computed from that file by manager-lock-decide.mjs.");
