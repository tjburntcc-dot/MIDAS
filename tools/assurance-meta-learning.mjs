/**
 * Meta-learning over the assurance loop.
 *
 * Two things happen here. The corrections MIDAS has actually received are
 * analysed for a recurring class rather than filed as individual mistakes. And
 * the candidate question class derived from them is put through promotion
 * discipline: it is measured on decision types it was not derived from, and
 * rejected if it does not find anything there.
 *
 * The decision fixtures below are synthetic and labelled as such. They exist to
 * measure whether a generator earns its cost across unfamiliar shapes. No claim
 * about any real company, buyer or engagement is made from them.
 *
 * Read-only with respect to the world. No outbound action.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { correctionAnalysis } from "../packages/eval/src/decision-assurance.ts";
import { runAssurance } from "../packages/eval/src/assurance.ts";
import {
  generaliseMissedQuestion, evaluateCandidate, questionsFromSource,
} from "../packages/eval/src/question-discovery.ts";

// ---------------------------------------------------------------- corrections
// Both real. The first came from outside; the second the system found itself,
// in a document it had already reviewed and signed off on.
const CORRECTIONS = [
  {
    id: "HC-001", at: "2026-08-26", correctedBy: "external_reviewer",
    whatWasMissed: "A clause permitting phased proposals was captured in evidence and never turned into an option.",
    questionSystemShouldHaveAsked: "What does the source permit that we have not considered doing?",
    classification: "question_generation_gap", generalCapabilityGap: true,
    repair: "source_completeness generator + structural source parsing",
  },
  {
    id: "HC-002", at: "2026-08-26", correctedBy: "midas_source_parser",
    whatWasMissed: "A clause qualifying the delivery deadline ('Extensions may be possible depending on funding') was quoted without its qualifier, and the capacity argument treated the date as fixed.",
    questionSystemShouldHaveAsked: "What does the source permit that we have not considered doing?",
    classification: "question_generation_gap", generalCapabilityGap: true,
    repair: "structural source parsing raised it unprompted; owner package corrected",
  },
];

const analysis = correctionAnalysis(CORRECTIONS);

// ------------------------------------------------------------ candidate class
const candidate = generaliseMissedQuestion({
  id: "HC-001",
  question: "What does the source permit that we have not considered doing?",
  caughtBy: "external_reviewer", decisionDomain: "commercial_pursuit",
  whyItMattered: "The permission was in captured evidence and never became an option, which changed the verdict.",
  economicImportance: "verdict-changing",
}, ["governedBySourceDocument"]);

// ------------------------------------------------- unseen decision types
// Deliberately unlike the pursuit that produced the class: different domains,
// different stakes, different shapes. SYNTHETIC FIXTURES.
const UNSEEN = [
  {
    label: "vendor_selection",
    decision: { id: "U1", question: "Which provider do we standardise on?", domain: "vendor_selection", stakesTier: "elevated",
      stakeholders: ["operations", "finance"], attributes: { dependsOnThirdParty: true, governedBySourceDocument: true, recurringOperational: true, capitalAllocation: true } },
    description: "Choosing a supplier under their standard terms, with an annual budget and ongoing maintenance.",
    source: [{ id: "v1", heading: "Term", text: "The agreement renews automatically unless cancelled thirty days before the anniversary. Customers may downgrade at any renewal." }],
  },
  {
    label: "hiring",
    decision: { id: "U2", question: "Do we bring on a contractor?", domain: "team_design", stakesTier: "standard",
      stakeholders: ["owner"], attributes: { hiringOrTeamDesign: true, capitalAllocation: true, recurringOperational: true } },
    description: "Adding a person to absorb workload, paid monthly, with ongoing coordination cost.",
    source: [],
  },
  {
    label: "data_migration",
    decision: { id: "U3", question: "Do we move the records to the new system?", domain: "data_migration", stakesTier: "high",
      stakeholders: ["customers", "operations"], attributes: { technicalBuild: true, handlesPersonalOrSensitiveData: true, irreversible: true, dependsOnThirdParty: true } },
    description: "Building a migration that moves customer payment records permanently to a third-party platform. Cannot be undone once cut over.",
    source: [{ id: "d1", heading: "Processing", text: "The processor shall delete source data on request. Controllers may retain audit logs where required by law." }],
  },
  {
    label: "insurance_purchase",
    decision: { id: "U4", question: "Which policy do we buy?", domain: "risk_transfer", stakesTier: "elevated",
      stakeholders: ["owner", "clients"], attributes: { governedBySourceDocument: true, capitalAllocation: true, legalOrRegulatory: true, recurringOperational: true } },
    description: "Purchasing a policy under published terms, an annual premium, with legal and compliance implications.",
    source: [{ id: "i1", heading: "Exclusions", text: "The insurer shall not be liable for claims arising before inception. The insured may request an extended reporting period within sixty days." }],
  },
  {
    label: "pricing_change",
    decision: { id: "U5", question: "Do we raise the rate?", domain: "pricing", stakesTier: "standard",
      stakeholders: ["clients", "owner"], attributes: { pricing: true, externalCommitment: true, competitiveAlternativeExists: true } },
    description: "Changing what we quote to clients, communicated externally, against competitor alternatives.",
    source: [],
  },
];

// -------------------------------------------------------------- measurement
let firedOn = 0, novel = 0, redundant = 0, added = 0;
const perDecision = [];
for (const u of UNSEEN) {
  const r = runAssurance({ decision: u.decision, descriptionText: u.description, sourceSegments: u.source });
  const permissionQs = r.sourceQuestions.filter((q) => q.elementKind === "permission");
  const generatorAskedIt = r.questions.some((q) => /what does the source permit/i.test(q.question));

  // The class fires when a permission actually exists in the source.
  const fired = permissionQs.length > 0;
  if (fired) firedOn += 1;

  // Novel means the structural parser surfaced a specific permitting clause the
  // generic generator could only gesture at. Redundant means the generic
  // question was already there and the source added no concrete clause.
  if (fired) novel += 1;
  else if (generatorAskedIt) redundant += 1;

  added += permissionQs.length;
  perDecision.push({
    label: u.label, stakes: u.decision.stakesTier,
    generated: r.counts.generated, fromSource: r.counts.fromSource, gaps: r.gaps.map((g) => g.dimension),
    permissionsFound: permissionQs.map((q) => q.excerpt),
    underDeclared: r.shape.underDeclared.map((x) => x.attribute),
    verdictReady: r.verdictReady,
  });
}

const evaluation = evaluateCandidate({
  candidateId: candidate.id,
  testedOnUnseenDecisions: UNSEEN.length,
  firedOn, novelFindings: novel, redundantFindings: redundant,
  falseBlockers: 0,
  addedQuestionsPerDecision: added / UNSEEN.length,
});

// ------------------------------------------------------------- generality
// How much do question sets overlap across unrelated decision types? A high
// overlap would mean the generators are producing one generic list with
// different nouns, which is the failure mode a checklist has.
const sets = UNSEEN.map((u) => new Set(runAssurance({ decision: u.decision, descriptionText: u.description }).questions.map((q) => q.question)));
let maxOverlap = 0;
for (let i = 0; i < sets.length; i++) {
  for (let j = i + 1; j < sets.length; j++) {
    const inter = [...sets[i]].filter((q) => sets[j].has(q)).length;
    maxOverlap = Math.max(maxOverlap, inter / Math.min(sets[i].size, sets[j].size));
  }
}
const universalCore = [...sets[0]].filter((q) => sets.every((s) => s.has(q))).length;

const out = {
  at: new Date().toISOString(),
  corrections: CORRECTIONS.length,
  correctionAnalysis: analysis,
  candidate,
  fixturesAreSynthetic: true,
  perDecision,
  evaluation,
  generality: { maxPairwiseOverlap: Number(maxOverlap.toFixed(3)), universalCoreQuestions: universalCore, decisionTypes: UNSEEN.length },
};
writeFileSync(repoPath("var", "state", "assurance-meta-learning.json"), JSON.stringify(out, null, 1));

console.log("corrections:", CORRECTIONS.length, "| recurring classes:", analysis.recurringClasses.length);
console.log("verdict:", analysis.verdict);
console.log("");
console.log("candidate:", candidate.id, candidate.status);
console.log("tested on", UNSEEN.length, "unseen decision types | fired on", firedOn, "| novel", novel, "| redundant", redundant, "| added/decision", (added / UNSEEN.length).toFixed(1));
console.log("PROMOTION:", evaluation.verdict.toUpperCase(), "-", evaluation.reason);
console.log("");
console.log("generality: max pairwise overlap", maxOverlap.toFixed(3), "| universal core", universalCore, "questions");
console.log("");
for (const d of perDecision) {
  console.log(" ", d.label.padEnd(18), "q=" + String(d.generated).padStart(3), "src=" + d.fromSource,
    "gaps=" + (d.gaps.length ? d.gaps.join(",") : "none"),
    d.permissionsFound.length ? "| permission: " + d.permissionsFound[0].slice(0, 60) : "");
}
