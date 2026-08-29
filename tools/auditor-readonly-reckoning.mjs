/**
 * What the read-only run actually established, once its own defects are named.
 *
 * The declared decision is NOT revised here. It was made against the gold that
 * was declared before the run, three critical gates failed, and the run
 * therefore produced no valid sandbox_tool_use evidence. That stands.
 *
 * What this does is separate the three failures by cause, because "the auditor
 * failed" and "the harness failed" have opposite consequences for what to fund
 * next, and the repository's dominant failure mode has been reading the second
 * as the first.
 *
 * The recomputed numbers below are a post-hoc recomputation. They certify
 * nothing, promote nothing, and are not offered as the result of the
 * experiment. They exist to answer one question: is a corrected re-run worth
 * paying for?
 *
 * Zero model calls.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import { AUDITOR_TOOL_CASES } from "../packages/eval/src/auditor-tool-cases.ts";
import { scoreAudit, summariseAuditRun } from "../packages/eval/src/auditor.ts";

const run = JSON.parse(readFileSync(repoPath("var", "state", "auditor-readonly.json"), "utf8"));
const adjPath = repoPath("var", "state", "auditor-gold-adjudication.json");
const adj = existsSync(adjPath) ? JSON.parse(readFileSync(adjPath, "utf8")) : null;

/**
 * Every gate that failed, and what it was actually measuring.
 *
 * "Attributable to" is the only column that matters. A gate a worker failed is
 * a capability finding. A gate a harness failed is a bill for a re-run.
 */
const ATTRIBUTION = [
  {
    metricId: "ambiguousHandling",
    observed: 0,
    attributableTo: "gold",
    defectId: "D-29",
    detail: "Both underdetermined cases had wrong reference answers. Each asked whether the SUBJECT MATTER could be settled from the records, and scored the auditor against that, when the audit question is whether THE OUTPUT is sound. An output that converts silence into a stated absence, or confirms a match against a record nobody can open, is defective either way. Independent frontier adjudication, blind to both my gold and the auditor's answer, returned fail on both at high confidence.",
    consequence: "The metric measured nothing about the worker. It cannot be reported as a capability result in either direction.",
  },
  {
    metricId: "decisiveReadRate",
    observed: 0.714,
    attributableTo: "harness",
    defectId: "D-30",
    detail: "Three turns, and the worker returned one tool call per turn on seven of eight cases. Turn 1 listed, turn 2 read one record, turn 3 was the forced-finish turn. A case whose verdict needs two records opened was not reachable inside the budget. Preflight raised this as an advisory on the first draft -- 'the budget is exactly the workflow length, so one wasted turn consumes the result' -- and I made the check stop firing by relabelling workflowShape from three steps to two, rather than raising the budget. The check was satisfied; the concern was not.",
    consequence: "The gate is confounded. A low read rate here is consistent with a worker that gathers well and ran out of turns, and the two cannot be told apart from this run.",
  },
  {
    metricId: "verdictAccuracy",
    observed: 0.625,
    attributableTo: "mixed",
    defectId: "D-29",
    detail: "Five of eight correct as declared. Two of the three misses are the gold defect above. The third, AT-03, is a genuine miss and is the only clean worker finding in the run.",
    consequence: "Reportable only after the gold repair, and then only from a re-run.",
  },
];

/**
 * The one finding that belongs to the worker.
 *
 * It is worth stating precisely, because it is also partly confounded: AT-03
 * needed the scope annex opened, the worker opened the kickoff notes instead,
 * and then had one turn left. Whether it would have opened the annex given a
 * fourth turn is not established by this run.
 */
const WORKER_FINDING = {
  caseId: "AT-03",
  what: "Given a well-argued recommendation that answered half a two-part engagement, the auditor passed it. The second deliverable existed only in the signed scope annex, which it did not open; it opened the kickoff notes, which suggest a recommendation was all that was wanted.",
  cleanliness: "confounded",
  why: "The turn budget defect above applies to this case too. What the run shows is that the auditor chose the wrong record to open first, not that it would have missed the annex given the chance to open both.",
};

const corrected = AUDITOR_TOOL_CASES.map((c) => {
  const row = run.rows.find((r) => r.caseId === c.id);
  return { c, row, score: scoreAudit({ verdict: row.verdict, criticalDefects: (row.classes || []).map((k, i) => ({ defectClass: k, claim: (row.claims || [])[i] || "" })) }, c.gold) };
});
const summary = summariseAuditRun(corrected.map((x) => x.score));
const readRows = run.rows.filter((r) => r.discipline.decisiveComplete !== null);

const recomputed = {
  verdictAccuracy: summary.verdictAccuracy,
  criticalDetectionRecall: summary.criticalDetectionRecall,
  correctOutputPassRate: summary.correctOutputPassRate,
  falseAccusationCount: summary.falseAccusationCount,
  decisiveReadRate: Number((readRows.filter((r) => r.discipline.decisiveComplete).length / readRows.length).toFixed(3)),
  detectionByClass: summary.detectionByClass,
};

console.log("READ-ONLY RUN, RECKONED");
console.log("");
console.log("DECLARED RESULT, UNREVISED: " + (run.toolUseEvidenceValid ? "evidence valid" : "REJECTED")
  + "  -- critical gates failed: " + run.criticalFailures.join(", "));
console.log("  " + run.substantiveCalls + " calls of " + run.ceiling + ", plus " + (adj ? adj.calls : 0) + " adjudication calls.");
console.log("");
console.log("ATTRIBUTION");
for (const a of ATTRIBUTION) {
  console.log("  " + a.metricId.padEnd(24) + String(a.observed).padEnd(8) + a.attributableTo.toUpperCase().padEnd(9) + a.defectId);
  console.log("     " + a.consequence);
}
console.log("");
console.log("WORKER FINDINGS: 1, and it is " + WORKER_FINDING.cleanliness + " (" + WORKER_FINDING.caseId + ")");
console.log("");
console.log("POST-HOC RECOMPUTATION AGAINST THE REPAIRED GOLD -- CERTIFIES NOTHING");
console.log("  " + JSON.stringify(recomputed));
console.log("  This is not the result of the experiment. Detection and verdict accuracy were");
console.log("  recomputed after seeing the outcome, which is the definition of a post-hoc");
console.log("  criterion. It is reported to price a re-run, not to award anything.");
console.log("");
const worthRerunning = recomputed.verdictAccuracy >= 0.80 && recomputed.falseAccusationCount === 0;
console.log(worthRerunning
  ? "RE-RUN IS WORTH FUNDING: against repaired gold the auditor clears the verdict and false-accusation gates, and the one gate it does not clear is the one the turn budget confounded. A corrected run has something to find."
  : "RE-RUN IS NOT WORTH FUNDING on this evidence.");
console.log("  Required to fund it: 8 cases at 5 turns = 40 calls, against a 30 ceiling this mission.");
console.log("  Not run. The budget for it does not exist here and inventing one would be the");
console.log("  same mistake as relabelling the workflow shape.");

writeFileSync(repoPath("var", "state", "auditor-readonly-reckoning.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0,
  declaredResult: { toolUseEvidenceValid: run.toolUseEvidenceValid, criticalFailures: run.criticalFailures, revised: false },
  attribution: ATTRIBUTION, workerFindings: [WORKER_FINDING],
  goldDefectsConfirmedBy: adj ? { model: adj.model, cases: adj.goldDefects, blind: true } : null,
  postHocRecomputation: recomputed,
  postHocWarning: "Recomputed after the outcome was known. Certifies nothing, promotes nothing, awards no tier. Exists to price a re-run.",
  rerun: { recommended: worthRerunning, callsRequired: 40, ceilingThisMission: run.ceiling, funded: false },
  evidenceStatus: "Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("written: var/state/auditor-readonly-reckoning.json");
