/**
 * Where the promoted worker and the queue rules disagree.
 *
 * Two independent assessments ran over the same ten candidates: the promoted
 * Opportunity Qualifier, and the hand-written gates in the approval queue. They
 * disagree, and the disagreements are the interesting part -- each caught
 * something the other could not see, which means neither is sufficient alone.
 *
 * A disagreement where the rules are right is a candidate addition to the
 * worker's taxonomy. It is recorded as a candidate here and nothing more:
 * changing a promoted worker's taxonomy without going through the foundry is the
 * exact discipline failure the foundry exists to prevent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";

const queue = JSON.parse(readFileSync(repoPath("var", "state", "company0-approval-queue.json"), "utf8"));
const verdicts = JSON.parse(readFileSync(repoPath("var", "state", "company0-qualifier-verdicts.json"), "utf8"));

const rows = queue.queue.map((q, i) => {
  const v = verdicts.results[i];
  const workerDeclines = v?.verdict?.decision === "decline";
  const rulesBlock = q.status === "BLOCKED";
  const ruleKinds = q.blockers.map((b) => b.kind);
  const workerCodes = (v?.verdict?.disqualifiers || []).map((d) => (typeof d === "string" ? d : d.code));
  return {
    case_id: v?.case_id, title: q.title,
    rulesBlock, ruleKinds, workerDecision: v?.verdict?.decision, workerCodes,
    agree: workerDeclines === rulesBlock,
    rulesOnlyReason: rulesBlock && !workerDeclines
      ? ruleKinds.filter((k) => !["below_minimum_engagement", "rate_below_viability", "posting_gone"].includes(k))
      : [],
  };
});

const disagreements = rows.filter((r) => !r.agree);

/**
 * Gaps in the worker's taxonomy, evidenced by real candidates it could not
 * classify. Candidates only. Each needs dev cases, a sealed set, a declared
 * gate and a measured comparison before any of it reaches a promoted version.
 */
const CANDIDATE_CODES = [
  {
    code: "channel_ineligible",
    evidence: rows.filter((r) => r.ruleKinds.includes("channel_eligibility_unverified")).map((r) => r.case_id),
    rationale: "The venue's own terms can exclude the company regardless of fit for the work. The worker has no code for this and marked one such candidate 'pursue'.",
    note: "Distinct from below_minimum_value: the work may be well priced, well suited, and still unreachable.",
  },
  {
    code: "not_a_buyer",
    evidence: rows.filter((r) => r.ruleKinds.includes("not_a_buyer")).map((r) => r.case_id),
    rationale: "Supplier-side postings and firms' own services pages are not opportunities. The worker returned hold_for_info on both, which spends attention on something that can never convert.",
    note: "Cheap to detect and currently costs a full assessment each time.",
  },
];

const out = {
  at: new Date().toISOString(),
  compared: rows.length,
  agreements: rows.length - disagreements.length,
  disagreements: disagreements.length,
  whatEachCaughtAlone: {
    workerOnly: ["opportunity_expired, raised from the liveness evidence and cited to K-HD-011"],
    rulesOnly: ["channel eligibility", "supplier-side postings mistaken for opportunities"],
  },
  candidateTaxonomyAdditions: CANDIDATE_CODES,
  discipline: "Candidates only. No promoted worker is modified here. Each code requires dev cases, a sealed set, an independently declared gate, and a measured comparison against the current version before promotion.",
  rows,
};
writeFileSync(repoPath("var", "state", "company0-worker-vs-rules.json"), JSON.stringify(out, null, 1));

console.log("compared:", rows.length, "| agree:", out.agreements, "| disagree:", disagreements.length);
console.log("");
for (const r of disagreements) {
  console.log(" ", r.case_id, "|", r.title.slice(0, 46));
  console.log("      rules: ", r.rulesBlock ? "BLOCK (" + r.ruleKinds.join(",") + ")" : "allow");
  console.log("      worker:", r.workerDecision, r.workerCodes.length ? "(" + r.workerCodes.join(",") + ")" : "");
}
console.log("");
console.log("candidate taxonomy additions for a future qualifier version:");
for (const c of CANDIDATE_CODES) console.log("  " + c.code + " <- evidenced by " + c.evidence.length + " real candidates");
console.log("");
console.log("none of these is applied. Promotion requires the foundry.");
