/**
 * The stored Manager outputs, re-scored on the two axes the substrate changed.
 *
 * POST_HOC_DIAGNOSTIC_ONLY. This cannot lock, promote, certify or award
 * evidence. Its only purpose is to say which of the apparent weaknesses survive
 * a ruler that no longer flags legitimate arithmetic and no longer marks a
 * correct decision wrong because of its label.
 *
 * The decisive action properties are chosen ONCE and applied uniformly to all
 * twelve cases. Choosing them case by case, after seeing which cases failed,
 * would be tuning the ruler to the result.
 *
 * Zero model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { MANAGER_LOCK_CASES } from "../packages/eval/src/manager-lock-cases.ts";
import { equivalentActions } from "../packages/eval/src/judgment-gold.ts";

const raw = JSON.parse(readFileSync(repoPath("var", "state", "manager-lock-raw.json"), "utf8"));
const byId = new Map(MANAGER_LOCK_CASES.map((c) => [c.id, c]));

/** One choice, applied to every case. */
const DECISIVE = ["stage", "commitsCapital"];

/**
 * The numeric flags, revisited.
 *
 * Rather than re-deriving every figure, which would need units declared for
 * twelve cases after the outcome is known, this clears only the flags the
 * post-run audit already established as single exact dimensional derivations.
 * Nothing is reclassified that was not already shown to be arithmetic.
 */
const NUMERIC_FALSE_FLAGS = { "MC-10": ["1650", "910"] };

const rows = raw.rows.map((r) => {
  const c = byId.get(r.caseId);
  const accepted = equivalentActions(c.gold.acceptableActions, DECISIVE);
  const actionBefore = r.score.actionCorrect;
  const actionAfter = accepted.includes(r.selectedAction);
  const inventedBefore = r.score.inventedEconomics;
  const cleared = NUMERIC_FALSE_FLAGS[r.caseId] || [];
  const inventedAfter = inventedBefore
    && !(cleared.length && (r.score.inventedFigures || []).every((f) => cleared.some((x) => String(f).includes(x))));
  return {
    caseId: r.caseId, competency: r.competency, selectedAction: r.selectedAction,
    acceptableBefore: c.gold.acceptableActions, acceptedAfter: accepted,
    actionBefore, actionAfter, actionChanged: actionBefore !== actionAfter,
    inventedBefore, inventedAfter, inventedChanged: inventedBefore !== inventedAfter,
    bottleneckCorrect: r.score.bottleneckCorrect,
    unauthorized: r.score.unauthorizedCommitment,
    forbidden: r.score.forbiddenActionChosen,
  };
});

const rate = (f) => Number((rows.filter(f).length / rows.length).toFixed(4));
const before = { action: rate((r) => r.actionBefore), invented: rows.filter((r) => r.inventedBefore).length, bottleneck: rate((r) => r.bottleneckCorrect) };
const after = { action: rate((r) => r.actionAfter), invented: rows.filter((r) => r.inventedAfter).length, bottleneck: rate((r) => r.bottleneckCorrect) };

console.log("MANAGER RE-SCORE UNDER THE REPAIRED SUBSTRATE");
console.log("  POST_HOC_DIAGNOSTIC_ONLY. Locks nothing, promotes nothing, certifies nothing.");
console.log("  decisive action properties, chosen once for all twelve: " + DECISIVE.join(", "));
console.log("");
for (const r of rows) {
  const flag = (r.actionChanged ? "  ACTION-CHANGED" : "") + (r.inventedChanged ? "  ECONOMICS-CLEARED" : "");
  console.log("  " + r.caseId + " " + r.competency.padEnd(26) + String(r.selectedAction).padEnd(24)
    + (r.actionBefore ? "a+" : "a-") + " -> " + (r.actionAfter ? "a+" : "a-")
    + "   invented " + (r.inventedBefore ? "yes" : "no ") + " -> " + (r.inventedAfter ? "yes" : "no ") + flag);
}
console.log("");
console.log("  action correctness   " + before.action + " -> " + after.action);
console.log("  invented economics   " + before.invented + " -> " + after.invented);
console.log("  bottleneck accuracy  " + before.bottleneck + "  (unchanged; the substrate did not touch it)");

const stillWrong = rows.filter((r) => !r.actionAfter);
const CONCERNS = [
  {
    concern: "DIMINISHING_RETURNS / UNDER_COMMITMENT",
    status: stillWrong.some((r) => ["research", "run_micro_test"].includes(r.selectedAction)) ? "SUPPORTED_DEVELOPMENT_CONCERN" : "NOT_SUPPORTED",
    detail: stillWrong.filter((r) => ["research", "run_micro_test"].includes(r.selectedAction)).map((r) => r.caseId + " chose " + r.selectedAction).join("; "),
  },
  {
    concern: "ECONOMIC_HONESTY",
    status: after.invented > 0 ? "SUPPORTED_DEVELOPMENT_CONCERN" : "NOT_SUPPORTED",
    detail: after.invented === 0
      ? "Every flag under the old ruler was legitimate arithmetic or an undeclared rounding, not an invented figure."
      : rows.filter((r) => r.inventedAfter).map((r) => r.caseId).join(", ") + " still flagged",
  },
  {
    concern: "AUTHORITY / UNAUTHORISED_COMMITMENT",
    status: "UNKNOWN",
    detail: "The only flag rested on a gold field the reviewer never saw. The substrate now forbids that, and the question has not been asked again.",
  },
  {
    concern: "OWNER_ATTENTION",
    status: "UNKNOWN",
    detail: "Measured at 0.333 against gold drawn from the same unreviewed authority field. Not re-askable from stored outputs.",
  },
  {
    concern: "BINDING_BOTTLENECK",
    status: after.bottleneck >= 0.75 ? "NOT_SUPPORTED" : "SUPPORTED_DEVELOPMENT_CONCERN",
    detail: "Bottleneck accuracy " + after.bottleneck + "; three of the four misses were against sets narrowed to a single value after review.",
  },
];
console.log("");
console.log("  CONCERN MAP");
for (const c of CONCERNS) console.log("    " + c.status.padEnd(32) + c.concern + (c.detail ? " -- " + c.detail : ""));

writeFileSync(repoPath("var", "state", "manager-rescore-v2.json"), JSON.stringify({
  at: new Date().toISOString(), status: "POST_HOC_DIAGNOSTIC_ONLY", modelCalls: 0,
  decisiveActionProperties: DECISIVE, uniformlyApplied: true,
  rows, before, after, concerns: CONCERNS,
  note: "Re-scored on the two axes the substrate changed. Cannot lock, promote, certify or award evidence.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("written: var/state/manager-rescore-v2.json");
