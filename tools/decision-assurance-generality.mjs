/**
 * Generality test for the decision assurance loop.
 *
 * Six unrelated decisions across six domains. If they produce broadly the same
 * questions, the loop is a checklist with a new name and the test fails.
 *
 * Usage: node --import ./tools/register-ts.mjs tools/decision-assurance-generality.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "@midas/db";
import { generateQuestions, requiredStages, processCoverageAudit } from "../packages/eval/src/decision-assurance.ts";

const DECISIONS = [
  {
    id: "DEC-SAAS-PRICE", domain: "saas_pricing", stakesTier: "elevated",
    question: "Should we move from a flat $29 plan to usage-based pricing?",
    stakeholders: ["existing customers", "finance", "support"],
    attributes: { pricing: true, capitalAllocation: true, recurringOperational: true, competitiveAlternativeExists: true, irreversible: false },
  },
  {
    id: "DEC-LOCAL-BOTTLENECK", domain: "local_service_operations", stakesTier: "standard",
    question: "Why is the van schedule only 60 percent utilised, and what should change?",
    stakeholders: ["technicians", "customers"],
    attributes: { recurringOperational: true, dependsOnThirdParty: false, hiringOrTeamDesign: true },
  },
  {
    id: "DEC-ARCH", domain: "software_architecture", stakesTier: "high",
    question: "Should the ingestion pipeline move from a monolith to an event-driven design?",
    stakeholders: ["engineering", "on-call", "downstream consumers"],
    attributes: { technicalBuild: true, irreversible: true, recurringOperational: true, requiresSpecialistExpertise: true },
  },
  {
    id: "DEC-MARKETING-EXP", domain: "marketing_experiment", stakesTier: "routine",
    question: "Should we run a paid trial on a second channel for four weeks?",
    stakeholders: ["marketing"],
    attributes: { capitalAllocation: true, timeBounded: true, competitiveAlternativeExists: true },
  },
  {
    id: "DEC-HIRE", domain: "team_design", stakesTier: "elevated",
    question: "Should we hire a first customer-support person or automate deflection?",
    stakeholders: ["customers", "founder"],
    attributes: { hiringOrTeamDesign: true, recurringOperational: true, capitalAllocation: true, irreversible: false },
  },
  {
    id: "DEC-PURSUIT", domain: "commercial_pursuit", stakesTier: "critical",
    question: "Should we respond to this solicitation, and if so in what form?",
    stakeholders: ["buyer", "owner", "any adult signer"],
    attributes: { externalCommitment: true, governedBySourceDocument: true, technicalBuild: true, handlesPersonalOrSensitiveData: true, pricing: true, competitiveAlternativeExists: true, dependsOnThirdParty: true, legalOrRegulatory: true, timeBounded: true, irreversible: true },
  },
];

const results = DECISIONS.map((d) => {
  const qs = generateQuestions(d);
  return {
    id: d.id, domain: d.domain, stakesTier: d.stakesTier,
    questionCount: qs.length,
    generators: [...new Set(qs.map((q) => q.generator))],
    categories: [...new Set(qs.map((q) => q.category))],
    requiredStages: requiredStages(d.stakesTier),
    sample: qs.slice(0, 3).map((q) => q.question),
    all: qs.map((q) => q.question),
  };
});

/** Overlap of question text across domains. High overlap means a template. */
function jaccard(a, b) {
  const A = new Set(a); const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}
const pairs = [];
for (let i = 0; i < results.length; i += 1) {
  for (let j = i + 1; j < results.length; j += 1) {
    pairs.push({ a: results[i].id, b: results[j].id, overlap: Number(jaccard(results[i].all, results[j].all).toFixed(3)) });
  }
}
const maxOverlap = Math.max(...pairs.map((p) => p.overlap));
const meanOverlap = pairs.reduce((s, p) => s + p.overlap, 0) / pairs.length;

/** A universal core is expected and healthy; what must differ is the specialised part. */
const universal = results.map((r) => new Set(r.all)).reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
const specialised = results.map((r) => ({ id: r.id, unique: r.all.filter((q) => !universal.has(q)).length }));

/** The gate must actually refuse an under-run process. */
const refusalDemo = processCoverageAudit({
  stakesTier: "critical",
  completedStages: ["questions_generated", "options_enumerated", "assumptions_registered"],
  questionsGenerated: 40, questionsUnresolvedMaterial: 2, verdictProposed: true,
});

const out = {
  at: new Date().toISOString(),
  decisions: results,
  overlap: { pairs, maxOverlap, meanOverlap: Number(meanOverlap.toFixed(3)) },
  universalCoreQuestions: [...universal],
  specialisedQuestionCounts: specialised,
  refusalDemonstration: refusalDemo,
  passes: maxOverlap < 0.6 && specialised.every((s) => s.unique >= 3) && refusalDemo.verdictReady === false,
};
writeFileSync(join(stateDir(), "decision-assurance-generality.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("=== DECISION ASSURANCE GENERALITY ===");
for (const r of results) {
  console.log("\n  " + r.id + "  [" + r.domain + ", " + r.stakesTier + "]");
  console.log("    questions " + r.questionCount + " | generators: " + r.generators.join(", "));
  console.log("    required stages (" + r.requiredStages.length + "): " + r.requiredStages.join(", "));
  console.log("    e.g. " + r.sample[r.sample.length - 1]);
}
console.log("\n  universal core questions: " + universal.size);
console.log("  domain-specialised questions per decision: " + specialised.map((s) => s.id.replace("DEC-", "") + "=" + s.unique).join(", "));
console.log("  pairwise question overlap: max " + maxOverlap + ", mean " + out.overlap.meanOverlap);
console.log("\n  refusal gate on an under-run critical decision:");
console.log("    " + refusalDemo.ruling);
console.log("\n  GENERALITY: " + (out.passes ? "PASS" : "FAIL"));
