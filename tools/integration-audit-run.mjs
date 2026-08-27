/**
 * Run the integration audit over the real production paths.
 *
 * The question is not whether MIDAS's capabilities work. It is whether the code
 * that actually runs reaches them. One bypass has already cost a dead listing
 * reaching an approval queue; this looks for the others.
 *
 * Read-only. No outbound action.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import { wiringReport } from "../packages/eval/src/integration-audit.ts";

const CAPABILITIES = [
  {
    id: "opportunity_qualifier", module: "qualifier-foundry", exports: ["buildQualifierRequest", "QUALIFIER_V2_ID"],
    promoted: true,
    artifact: { file: "company0-qualifier-verdicts.json", provenanceCheck: "verdictByUrl|provenance" },
    whyItMatters: "It carries disqualifiers earned through the foundry, including expiry and fraud codes that hand-written checks do not have.",
  },
  {
    id: "decision_assurance", module: "decision-assurance", exports: ["generateQuestions", "processCoverageAudit"],
    promoted: true,
    whyItMatters: "It generates the questions before a verdict exists, which is the mechanism that catches an option nobody considered.",
  },
  {
    id: "question_discovery", module: "question-discovery", exports: ["questionsFromSource", "detectCoverageGaps", "validateDecisionShape"],
    promoted: true,
    whyItMatters: "It raises questions from a source's own structure, which is how a permitting clause gets noticed without anyone knowing to look for one.",
  },
  {
    id: "readiness", module: "readiness", exports: ["readinessProfile", "assessOpportunityFit"],
    promoted: false,
    whyItMatters: "Without it a path can recommend work the company is not able to take on.",
  },
  {
    id: "high_stakes", module: "high-stakes", exports: ["classifyStakes", "evidenceClosure", "assessEntityAuthority"],
    promoted: false,
    whyItMatters: "It is what stops a large decision being made on confidence rather than evidence closure.",
  },
  {
    id: "certification", module: "academy", exports: ["certify", "authorityFor", "tierRank"],
    promoted: false,
    whyItMatters: "It decides whether a configuration may prepare an action class at all.",
  },
  {
    id: "worker_adapter", module: "worker-adapter", exports: ["adaptWorker", "actorInstructions"],
    promoted: false,
    whyItMatters: "Without it an Academy run executes a bare base model wearing the worker's job title, and the certification describes something that is not MIDAS. That happened for three sessions and every guard passed.",
  },
  {
    id: "shadow_mode", module: "shadow", exports: ["recordIntent", "mayPrepare"],
    promoted: false,
    whyItMatters: "It is the guarantee that buyer-facing material does not leave the system.",
  },
];

/** Paths that actually run, and what each is required to reach. */
const PATHS = [
  { id: "discovery_aligned", file: "tools/company0-discover-aligned.mjs", requires: ["readiness"],
    purpose: "Derives search queries from what the company can evidence." },
  { id: "approval_queue", file: "tools/company0-approval-queue.mjs", requires: ["opportunity_qualifier", "readiness", "certification", "shadow_mode"],
    purpose: "Decides what reaches the owner." },
  { id: "qualify_candidates", file: "tools/company0-qualify-candidates.mjs", requires: ["opportunity_qualifier"],
    purpose: "Runs candidates through the promoted worker." },
  { id: "pipeline_fit", file: "tools/company0-pipeline-fit.mjs", requires: ["readiness"],
    purpose: "Scores the open pipeline against readiness." },
  { id: "readiness_profile", file: "tools/company0-readiness.mjs", requires: ["readiness"],
    purpose: "Builds the company readiness profile." },
  { id: "source_questions", file: "tools/pursuit-source-questions.mjs", requires: ["question_discovery"],
    purpose: "Raises questions from a captured primary source." },
  { id: "meta_learning", file: "tools/assurance-meta-learning.mjs", requires: ["decision_assurance", "question_discovery"],
    purpose: "Analyses corrections and promotes candidate question classes." },
  { id: "academy_certify", file: "tools/academy-certify.mjs", requires: ["worker_adapter", "certification"],
    purpose: "Issues certifications." },
  { id: "academy_certify_midas", file: "tools/academy-certify-midas.mjs", requires: ["worker_adapter", "certification"],
    purpose: "Compares the promoted worker against the bare model." },
  { id: "academy_stability", file: "tools/academy-stability.mjs", requires: ["worker_adapter"],
    purpose: "Measures run-to-run stability, which caps every certification." },
  { id: "academy_run", file: "tools/academy-run.mjs", requires: ["worker_adapter", "certification"],
    purpose: "Runs the examinations." },
  { id: "academy_diagnose", file: "tools/academy-diagnose.mjs", requires: ["worker_adapter"],
    purpose: "Diagnoses a failure before anything is trained." },
  { id: "pursuit_assured", file: "tools/pursuit-rerun-assured.mjs", requires: ["decision_assurance", "high_stakes"],
    purpose: "Re-runs a live pursuit through the assurance loop." },
  // Requires nothing: its whole value is that an independent model attacks the
  // reasoning without sharing the machinery that produced it. Declaring a shared
  // dependency here would defeat the point of the review.
  { id: "pursuit_redteam", file: "tools/pursuit-redteam.mjs", requires: [],
    purpose: "Independent adversarial review of a live pursuit." },
];

const paths = PATHS.filter((p) => existsSync(repoPath(p.file)))
  .map((p) => ({ ...p, source: readFileSync(repoPath(p.file), "utf8") }));

// Wrapper modules a path may reach a capability through.
const WRAPPERS = ["worker-adapter", "assurance", "decision-assurance", "question-discovery", "readiness", "qualifier-foundry", "academy", "shadow", "high-stakes"];
const modules = WRAPPERS
  .filter((m) => existsSync(repoPath("packages", "eval", "src", m + ".ts")))
  .map((m) => ({ module: m, source: readFileSync(repoPath("packages", "eval", "src", m + ".ts"), "utf8") }));

const report = wiringReport(paths, CAPABILITIES, modules);

writeFileSync(repoPath("var", "state", "integration-audit.json"), JSON.stringify({
  at: new Date().toISOString(),
  note: "A capability not reached by the path that needs it is not an operational capability.",
  ...report,
  paths: paths.map((p) => ({ id: p.id, file: p.file, requires: p.requires, purpose: p.purpose })),
}, null, 1));

console.log("paths audited:", report.pathsAudited, "| capabilities declared:", report.capabilitiesDeclared);
console.log(report.ruling);
console.log("");
for (const f of report.findings) {
  console.log(" ", f.severity === "promoted_capability_bypassed" ? "!!" : "  ",
    f.pathId.padEnd(20), "->", f.capabilityId.padEnd(22), f.status);
  console.log("      ", f.detail.slice(0, 150));
}
if (report.indirect.length) {
  console.log("");
  console.log("reached indirectly (works, but through a wrapper):");
  for (const f of report.indirect) console.log("  ", f.pathId, "->", f.capabilityId, "|", f.detail);
}
console.log("");
console.log("orphaned capabilities (nothing requires them):");
for (const o of report.orphans) console.log("  ", o.capabilityId, "|", o.note.slice(0, 100));
