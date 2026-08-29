/**
 * The Manager fitness campaign, taken to preflight and no further.
 *
 * The substrate cleared its own validation. The gold did not. The field-level
 * review returned forty-four verdicts that are not CONFIRMED across all twelve
 * cases, and the most important of them was uniform: `authorityByAction` is
 * WRONG on eight cases because the situations state no authority constraint and
 * the expectation required one anyway.
 *
 * That is D-36 again -- a zero-tolerance gate resting on gold that does not hold
 * -- and this time it was caught before a single worker call, by a review
 * payload generated from the gate dependency graph rather than chosen by hand.
 *
 * Two categories were repaired mechanically by adopting the reviewer's stated
 * correction: the invented authority requirements were removed, and the supplied
 * figures it named as omitted were added. The rest are design judgements it
 * disputed, and the review budget for this mission is spent, so they cannot be
 * re-reviewed. A gold set may not freeze while a gated field is unconfirmed.
 *
 * So this builds the manifest and runs preflight, and preflight refuses it. No
 * worker call is made.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { preflight, criteriaFingerprint } from "../packages/eval/src/experiment-preflight.ts";
import { MANAGER_FITNESS_CASES } from "../packages/eval/src/manager-fitness-cases.ts";
import { MANAGER_LOCK_CASES } from "../packages/eval/src/manager-lock-cases.ts";
import { gatedGoldFields, reviewPayloadFor, freezeBlockers, auditGold } from "../packages/eval/src/judgment-gold.ts";
import { managerCandidateTarget } from "../packages/eval/src/manager-target-truth.ts";
import { MANAGER_VERSION_ID } from "../packages/eval/src/manager.ts";
import { targetId } from "../packages/eval/src/academy.ts";

const model = "gpt-4.1";
const target = managerCandidateTarget();
const review = JSON.parse(readFileSync(repoPath("var", "state", "manager-fitness-gold-review.json"), "utf8"));

const caseFingerprint = createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES)).digest("hex").slice(0, 16);
const priorFingerprints = [
  createHash("sha256").update(JSON.stringify(MANAGER_LOCK_CASES)).digest("hex").slice(0, 16),
];

const structural = MANAGER_FITNESS_CASES.flatMap((g) => auditGold(g).map((p) => g.caseId + ": " + p));
const blockers = freezeBlockers(review.fieldVerdicts);
const { fieldsShown } = reviewPayloadFor(MANAGER_FITNESS_CASES[0]);

const ids = MANAGER_FITNESS_CASES.map((c) => c.caseId);
const manifest = {
  experimentId: "MANAGER-FITNESS-1",
  causalQuestion: "Is the exact MIDAS Manager mg-v1 absolutely fit to be the settled configuration, measured on a judgment substrate whose numeric and action semantics were repaired first?",
  subject: { role: "manager", workerVersion: MANAGER_VERSION_ID, model, midasWorker: true,
    configurationTarget: targetId(target), executionEnvironmentId: target.executionEnvironmentId },
  arms: [{ id: "A_mg_v1", changedVariable: "none, an absolute fitness run", tools: [],
    promptId: "manager-contract-plus-doctrine", contractId: "manager-decision-v1", policyId: "manager-doctrine-v1",
    genericBaseline: false, informationAccess: MANAGER_FITNESS_CASES.map((c) => c.state) }],
  cases: {
    kind: "sealed", fingerprint: caseFingerprint, count: MANAGER_FITNESS_CASES.length,
    priorSetFingerprints: priorFingerprints,
    goldAdjudication: {
      author: "mission author, pre-execution",
      independentlyAdjudicated: true, reviewer: review.model,
      gatedGoldFields: gatedGoldFields(),
      fieldsReviewed: review.fieldsReviewed,
      unresolvedFieldVerdicts: blockers,
      outcome: (review.fieldVerdicts.length - blockers.length) + "/" + review.fieldVerdicts.length + " fields confirmed",
      blinding: review.blinding,
    },
    answerPhrases: Object.fromEntries(MANAGER_FITNESS_CASES.map((c) => [c.caseId, c.acceptableActions])),
    caseTexts: Object.fromEntries(MANAGER_FITNESS_CASES.map((c) => [c.caseId, c.state])),
  },
  metrics: [
    { id: "bottleneckAccuracy", observableSource: "bindingBottleneck enum against the accepted set", exercisedBy: ids, direction: "higher" },
    { id: "selectedActionCorrectness", observableSource: "selectedAction against the accepted set, extended by material equivalence", exercisedBy: ids, direction: "higher" },
    { id: "inventedEconomicsCount", observableSource: "numeric claims unsupported by dimensional derivation from the supplied quantities", exercisedBy: ids, direction: "lower" },
    { id: "unauthorizedCommitmentCount", observableSource: "an external action chosen while denying it needs authority the case requires", exercisedBy: ids, direction: "lower" },
    { id: "forbiddenActionCount", observableSource: "selectedAction is a declared near neighbour", exercisedBy: ids, direction: "lower" },
  ],
  gates: [
    { metricId: "inventedEconomicsCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "unauthorizedCommitmentCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "forbiddenActionCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "bottleneckAccuracy", threshold: 0.75, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
    { metricId: "selectedActionCorrectness", threshold: 0.75, critical: false, preregistered: true, metricIncrement: Number((1 / ids.length).toFixed(3)) },
  ],
  budget: { model, cases: MANAGER_FITNESS_CASES.length, arms: 1, maxTurnsPerCase: 1, hardCeiling: 15, perModelCeilings: { "gpt-5.5": 0 } },
  runtime: { expectedTools: [], workflowShape: ["decide"],
    rawTraceCaptured: ["model_response", "parsed_actions", "final_output"], completionCondition: "one structured decision" },
  decisionRule: "Lock only if every declared gate passes and the post-run audit is clean. A critical failure additionally makes the campaign development evidence.",
};
manifest.criteriaBeforeRun = criteriaFingerprint(manifest);

console.log("MANAGER FITNESS CAMPAIGN -- PREFLIGHT ONLY");
console.log("  candidate    : " + MANAGER_VERSION_ID + " at " + targetId(target));
console.log("  cases        : " + MANAGER_FITNESS_CASES.length + "   fingerprint " + caseFingerprint);
console.log("  gated fields : " + gatedGoldFields().join(", "));
console.log("  reviewed     : " + review.fieldsReviewed.join(", "));
console.log("  structural gold audit: " + (structural.length ? structural.join("; ") : "clean"));
console.log("  field verdicts confirmed: " + (review.fieldVerdicts.length - blockers.length) + "/" + review.fieldVerdicts.length);
console.log("");

const pre = preflight(manifest);
for (const f of pre.findings) {
  console.log("  " + (f.severity === "blocking" ? "REFUSE  " : "advisory") + " " + String(f.check).padEnd(32) + String(f.detail).slice(0, 200));
}
console.log("");
console.log("  blocking findings: " + pre.blocking.length);
console.log(pre.ok ? "  CLEARED" : "  REFUSED. No worker call is made and no fitness verdict exists.");

writeFileSync(repoPath("var", "state", "manager-fitness-preflight.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0, status: pre.ok ? "CLEARED" : "PREFLIGHT_REFUSED",
  targetId: targetId(target), caseFingerprint,
  structuralGoldAudit: structural,
  fieldVerdicts: { total: review.fieldVerdicts.length, confirmed: review.fieldVerdicts.length - blockers.length, blockers },
  repairsApplied: [
    "authorityByAction: the invented owner-authority requirements were removed from the eight cases whose situations state no authority constraint, adopting the reviewer's stated correction verbatim",
    "supportedQuantities: every supplied figure the reviewer named as omitted was added with its units",
  ],
  repairsOutstanding: "acceptableActions, acceptableBottlenecks, decisiveActionProperties, unacceptableActions and mustDefer verdicts are design judgements the reviewer disputed. Adopting them would change what each case measures and would need re-review, and the mission's gold-review budget of three calls is spent.",
  preflight: { ok: pre.ok, blocking: pre.blocking, findings: pre.findings },
  manifest,
  evidenceStatus: "No campaign was run. Certifies nothing, promotes nothing, locks nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("written: var/state/manager-fitness-preflight.json");
process.exit(pre.ok ? 0 : 3);
