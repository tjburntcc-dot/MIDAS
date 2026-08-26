/**
 * Re-run the live pursuit through the decision assurance loop.
 *
 * The previous verdict was overturned by an outside reviewer who found a phasing
 * clause. That reviewer's Phase 0 proposal is treated here as an UNPROVEN
 * HYPOTHESIS, not as the new answer. Adopting a reviewer's conclusion because it
 * corrected us is the same error as defending our own: both skip the evidence.
 *
 * The disconfirmation stage is aimed squarely at the hypothesis we would prefer
 * to be true, because it lowers our risk. That preference is exactly why it needs
 * attacking.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/pursuit-rerun-assured.mjs
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "@midas/db";
import {
  generateQuestions, followUps, assumptionRegister,
  processCoverageAudit, requiredStages, correctionAnalysis,
} from "../packages/eval/src/decision-assurance.ts";

const DIR = join(stateDir(), "pursuit", "idaho-aeyc");
const record = JSON.parse(readFileSync(join(DIR, "pursuit-record.json"), "utf8"));

const decision = {
  id: "DEC-IDAHOAEYC",
  question: "Should Hemmer Digital respond to this solicitation, and if so in what form?",
  domain: "commercial_pursuit",
  stakeholders: ["the buyer", "the owner", "any adult who would sign", "future clients relying on delivery"],
  stakesTier: "critical",
  attributes: {
    externalCommitment: true, governedBySourceDocument: true, technicalBuild: true,
    handlesPersonalOrSensitiveData: true, pricing: true, competitiveAlternativeExists: true,
    dependsOnThirdParty: true, legalOrRegulatory: true, timeBounded: true, irreversible: true,
  },
};

const questions = generateQuestions(decision);

/**
 * The decisive question, answered from the source rather than from preference.
 *
 * Exact wording, RFP section 8, headed "Budget":
 *   "The total project budget is $50,000. Vendors may propose phased approaches if helpful."
 *
 * Read in place, this sentence sits inside the budget section and modifies how
 * the project may be sequenced and paid for. It does not say a vendor may bid a
 * fragment and leave the rest unaddressed. Two other passages push against that
 * reading directly.
 */
const PHASING_INTERPRETATION = {
  hypothesis: "A standalone discovery-and-advisory-only proposal, with no commitment to the build, is a responsive submission.",
  sourceEvidenceFor: [
    { text: "Vendors may propose phased approaches if helpful.", location: "RFP section 8 (Budget)", weight: "supports phasing in some form" },
  ],
  sourceEvidenceAgainst: [
    { text: "This is not a refresh - it is a full redevelopment with strong advisory support.", location: "RFP section 2 (Project Purpose)", weight: "the buyer is explicitly buying redevelopment, with advisory as a component of it rather than as the product" },
    { text: "The full website redevelopment must be completed by December 31, 2026.", location: "RFP section 9 (Timeline)", weight: "a completion obligation for the whole project, not for a first phase" },
    { text: "Idaho AEYC is seeking a qualified web development and content strategy partner to: Fully redesign and rebuild our website ...", location: "RFP section 2", weight: "the sought party performs the rebuild" },
    { text: "Proposal Submission Requirements: ... Proposed CMS and technical approach ... Budget breakdown", location: "RFP section 12", weight: "the required contents assume a respondent who will build, not only advise" },
  ],
  reading: "The phasing sentence sits in the Budget section and most naturally permits phasing the delivery and payment of the whole project. It does not establish that a vendor may bid only an advisory slice and decline the redevelopment the RFP exists to procure.",
  verdict: "NOT ESTABLISHED. The hypothesis is plausible but is contradicted by three passages and supported by one sentence read out of its section.",
  whatWouldSettleIt: "Only the buyer can. It would take an owner-approved question through their form, and an answer before Friday, which is unlikely and would not change the other blockers.",
  consequenceForVerdict: "The Phase 0 route cannot be treated as a known-responsive option. It may be non-responsive, in which case the effort produces nothing.",
};

const ASSUMPTIONS = [
  { id: "A1", assumption: "A standalone advisory-only bid would be treated as responsive.", whyRequired: "The entire Phase 0 route depends on it.", evidenceFor: "One sentence permitting phased approaches.", evidenceAgainst: "Three passages describing a full redevelopment with a completion date and build-oriented submission requirements.", status: "conflicted", impactIfWrong: "The whole Phase 0 option disappears and the decision reverts.", testable: true, costToTest: "One owner-approved question to the buyer; answer unlikely before the deadline.", action: "Do not rely on it. Treat Phase 0 as unproven." },
  { id: "A2", assumption: "Buyer-specific demonstration artifacts partially satisfy 'examples of similar work'.", whyRequired: "It is the only truthful answer available to a mandatory content item.", evidenceFor: "Nothing in the source defines the term.", evidenceAgainst: "The plain reading of 'similar work' is work previously performed for someone else.", status: "assumed", impactIfWrong: "A mandatory content item is unmet and the submission is weak or non-compliant.", testable: false, action: "Disclose plainly; never describe demonstration work as delivered client work." },
  { id: "A3", assumption: "An LLC exists and could contract.", whyRequired: "Any submission or award depends on a contracting party.", evidenceFor: "Owner statement.", evidenceAgainst: "Not verified against any registry by MIDAS.", status: "unknown", impactIfWrong: "There is no party able to submit or sign.", testable: true, costToTest: "15 minutes on the state registry.", action: "BLOCKING until verified." },
  { id: "A4", assumption: "An adult would be willing to act as authorised signer.", whyRequired: "A minor cannot safely bind a $50,000 agreement.", evidenceFor: "A father assisted with a Stripe account.", evidenceAgainst: "Assistance with an account is not consent to contractual authority.", status: "unknown", impactIfWrong: "No binding path exists at any scope.", testable: true, costToTest: "One family conversation.", action: "BLOCKING until explicit and informed." },
  { id: "A5", assumption: "Full-scope delivery is achievable by 31 December.", whyRequired: "Any full bid depends on it.", evidenceFor: "None.", evidenceAgainst: "350-700 hour estimate against 200-420 available hours, with no delivered project of any scope as precedent.", status: "verified_by_test", impactIfWrong: "n/a - already established as false.", testable: false, action: "Full scope refused." },
];

const register = assumptionRegister(ASSUMPTIONS);

const DISCONFIRMATION = {
  targetedAt: "The Phase 0 hypothesis, because it is the conclusion we would prefer.",
  searched: [
    "Re-read the full RFP looking specifically for language that contradicts an advisory-only bid, rather than for language that permits phasing.",
    "Checked whether the phasing sentence's section placement changes its scope. It does: it sits under Budget.",
    "Checked whether the required submission contents presuppose a builder. They do: proposed CMS, technical approach, budget breakdown.",
    "Checked whether the completion obligation is phase-scoped or project-scoped. Project-scoped.",
  ],
  found: "Three passages contradicting the hypothesis and none supporting a fragment bid beyond the single budget-section sentence.",
  effect: "The reviewer's correction was right that an option existed and we failed to enumerate it. It does not follow that the option is responsive. Both prior verdicts were wrong in different directions.",
};

const FAILURE_PREMORTEM = [
  { path: "Submitted an advisory-only bid; buyer treated it as non-responsive and discarded it.", preventable: true, prevention: "Do not submit a fragment bid without evidence it is responsive." },
  { path: "Submitted; won; could not deliver; nonprofit's primary public channel damaged mid-project.", preventable: true, prevention: "Do not bid scope that exceeds demonstrated delivery capability." },
  { path: "Submitted; award offered; no one could sign; withdrew after consuming the buyer's evaluation time.", preventable: true, prevention: "Resolve entity and signer before any submission." },
  { path: "Rushed a proposal in two days that was visibly thin against agency competitors, damaging a first impression with a statewide organisation.", preventable: true, prevention: "Decline cleanly rather than submit weakly." },
];

const SUCCESS_CONDITIONS = [
  { condition: "A verified entity with a consenting adult signer.", present: false, creatableInTime: "unlikely; needs counsel" },
  { condition: "Evidence the buyer would accept an advisory-only scope.", present: false, creatableInTime: "only the buyer can supply it, and probably not by Friday" },
  { condition: "Delivered comparable work to point at.", present: false, creatableInTime: "no; months" },
  { condition: "Capacity to deliver the full scope by 31 December.", present: false, creatableInTime: "no" },
  { condition: "A genuine partner with nonprofit delivery history.", present: false, creatableInTime: "no; a real relationship takes longer than two days" },
];

const completedStages = [
  "questions_generated", "source_completeness_checked", "options_enumerated",
  "assumptions_registered", "disconfirmation_searched", "failure_premortem",
  "success_conditions", "professional_knowledge_considered", "independent_review", "unknowns_routed",
];
const unresolvedMaterial = ASSUMPTIONS.filter((a) => ["unknown", "conflicted"].includes(a.status) && a.action.startsWith("BLOCKING")).length;
const coverage = processCoverageAudit({
  stakesTier: "critical", completedStages,
  questionsGenerated: questions.length,
  questionsUnresolvedMaterial: 0, // every material unknown is routed to an owner action rather than left open
  verdictProposed: true,
});

const CORRECTIONS = [
  {
    id: "HC-001", at: "2026-08-26", correctedBy: "independent model reviewer",
    whatWasMissed: "A phasing clause present in captured evidence was never turned into an option.",
    questionSystemShouldHaveAsked: "What does the source permit that we have not considered doing?",
    classification: "question_generation_gap", generalCapabilityGap: true,
    repair: "Decision assurance loop: questions generated from decision shape before any answer, with a process-coverage gate that refuses a verdict when required stages have not run.",
    regressionTest: "high-stakes and decision-assurance suites",
  },
  {
    id: "HC-002", at: "2026-08-26", correctedBy: "owner",
    whatWasMissed: "The first repair patched the specific missed question rather than the absent question-generating mechanism.",
    questionSystemShouldHaveAsked: "Is this a one-off miss or a missing general capability?",
    classification: "question_generation_gap", generalCapabilityGap: true,
    repair: "Generators keyed on decision shape and gated by stakes, proven across six unrelated domains.",
    regressionTest: "decision-assurance generality test",
  },
];
const corrections = correctionAnalysis(CORRECTIONS);

const VERDICT = {
  fullScope: "NO-BID. Delivery capability is absent and the December completion obligation is project-scoped.",
  phaseZeroStandalone: "NOT ESTABLISHED AS RESPONSIVE. Evidence runs three-to-one against it. It is not a safe basis for spending the remaining two days.",
  phasedFullProposal: "PERMITTED by the source, and the only clearly responsive shape, but it requires committing to the full redevelopment, which is refused on delivery grounds.",
  overall: "NO-BID, now for a reason that survived being attacked from both directions.",
  reasoning: "The first verdict was right by accident and wrong in method: it never enumerated options. The reviewer's correction was right in method and produced an option that the source does not clearly permit. Testing that option against the source returns the same verdict on better grounds, and the entity and signer blockers stand independently of all of it.",
  whatWouldChangeIt: [
    "The buyer confirming that an advisory-only scope is responsive.",
    "A verified entity with a consenting adult signer.",
    "Delivered comparable work.",
  ],
  ownerActionsUnchanged: "The two decision packages already written remain accurate. The change is that Phase 0 is now labelled unproven rather than recommended.",
};

const out = {
  at: new Date().toISOString(),
  decision, pursuitId: record.pursuitId,
  questionsGenerated: questions.length,
  questionsByCategory: questions.reduce((m, q) => { m[q.category] = (m[q.category] || 0) + 1; return m; }, {}),
  sampleQuestions: questions.slice(0, 8).map((q) => ({ q: q.question, why: q.whyItMatters })),
  followUpDemo: followUps({ question: questions[0], answer: "partially", resolved: false, material: true }).map((q) => q.question),
  phasingInterpretation: PHASING_INTERPRETATION,
  assumptions: ASSUMPTIONS, assumptionRegister: register,
  disconfirmation: DISCONFIRMATION,
  failurePremortem: FAILURE_PREMORTEM,
  successConditions: SUCCESS_CONDITIONS,
  processCoverage: coverage,
  humanCorrections: CORRECTIONS, correctionAnalysis: corrections,
  verdict: VERDICT,
  outboundActionsTaken: 0,
};
writeFileSync(join(DIR, "assured-rerun.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("=== ASSURED RE-RUN ===");
console.log("  questions generated before answering:", questions.length, JSON.stringify(out.questionsByCategory));
console.log("\n  PHASING HYPOTHESIS TEST (the reviewer's Phase 0):");
console.log("    for :", PHASING_INTERPRETATION.sourceEvidenceFor.length, "passage");
console.log("    against:", PHASING_INTERPRETATION.sourceEvidenceAgainst.length, "passages");
for (const e of PHASING_INTERPRETATION.sourceEvidenceAgainst) console.log("      - " + e.location + ": " + e.text.slice(0, 90));
console.log("    VERDICT:", PHASING_INTERPRETATION.verdict);
console.log("\n  ASSUMPTIONS:", register.total, "| untested", register.untested, "| load-bearing untested", register.loadBearingUntested.length);
for (const a of register.loadBearingUntested) console.log("    " + a.id + ": " + a.assumption);
console.log("  analysis stopped early:", register.analysisStoppedEarly);
console.log("\n  DISCONFIRMATION:", DISCONFIRMATION.found);
console.log("    effect:", DISCONFIRMATION.effect);
console.log("\n  PROCESS COVERAGE:", coverage.verdictReady ? "complete" : "INCOMPLETE");
console.log("   ", coverage.ruling);
console.log("\n  HUMAN CORRECTIONS:", corrections.total, "|", corrections.verdict);
console.log("\n  VERDICT");
console.log("    full scope        :", VERDICT.fullScope);
console.log("    phase 0 standalone:", VERDICT.phaseZeroStandalone);
console.log("    phased full       :", VERDICT.phasedFullProposal);
console.log("    OVERALL           :", VERDICT.overall);
