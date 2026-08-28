/**
 * Re-score the stored Manager outputs against the repaired scorer.
 *
 * No model is called. The decisions are exactly the ones the three arms produced;
 * only the ruler changed.
 *
 * POST_HOC_DIAGNOSTIC_ONLY. This cannot promote anything. The gates were frozen
 * before the original run and both candidates failed under them; rescoring
 * against a repaired scorer and then promoting would be inventing the decision
 * after seeing the result, which this repository has refused five times. What
 * this can do is say how much of that rejection sheet was the worker and how much
 * was me.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { scoreManagerDecision, summariseManagerRun } from "../packages/eval/src/manager.ts";
import { MANAGER_SEALED_CASES } from "../packages/eval/src/manager-cases.ts";

const cycle = JSON.parse(readFileSync(repoPath("var", "state", "manager-foundry-cycle.json"), "utf8"));
const byId = new Map(MANAGER_SEALED_CASES.map((c) => [c.id, c]));

const out = {};
for (const [armKey, arm] of Object.entries(cycle.arms)) {
  const rows = arm.rows.map((r) => {
    const c = byId.get(r.caseId);
    return { caseId: r.caseId, action: r.action, bottleneck: r.bottleneck, before: r.score, after: scoreManagerDecision(r.decision, c.gold) };
  });
  out[armKey] = {
    before: arm.sealed,
    after: summariseManagerRun(rows.map((r) => r.after)),
    rows: rows.map((r) => ({
      caseId: r.caseId, action: r.action,
      inventedBefore: r.before.inventedEconomics, inventedAfter: r.after.inventedEconomics,
      figuresBefore: r.before.inventedFigures, figuresAfter: r.after.inventedFigures,
      authorityBefore: r.before.authorityCorrect, authorityAfter: r.after.authorityCorrect,
      ownerBefore: r.before.ownerInterruptionCorrect, ownerAfter: r.after.ownerInterruptionCorrect,
    })),
  };
}

console.log("POST_HOC_DIAGNOSTIC_ONLY -- zero model calls, decisions unchanged, ruler repaired.");
console.log("");
const F = (v) => (v === null || v === undefined ? " n/a " : String(v).padStart(5));
console.log("arm           metric                       before   after");
for (const [armKey, a] of Object.entries(out)) {
  for (const k of ["bottleneckAccuracy", "selectedActionCorrectness", "authorityCorrectness", "ownerAttentionJudgment", "deferKillAccuracy", "epistemicDiscipline"]) {
    console.log("  " + armKey.padEnd(12) + k.padEnd(28) + F(a.before[k]) + "   " + F(a.after[k]));
  }
  console.log("  " + armKey.padEnd(12) + "inventedEconomicsCount".padEnd(28) + F(a.before.inventedEconomicsCount) + "   " + F(a.after.inventedEconomicsCount));
  console.log("  " + armKey.padEnd(12) + "unauthorizedCommitments".padEnd(28) + F(a.before.unauthorizedCommitmentCount) + "   " + F(a.after.unauthorizedCommitmentCount));
  console.log("");
}

console.log("what the repaired scorer no longer flags:");
for (const [armKey, a] of Object.entries(out)) {
  for (const r of a.rows) {
    if (r.inventedBefore && !r.inventedAfter) console.log("  " + armKey + " " + r.caseId + " cleared: " + JSON.stringify(r.figuresBefore));
    if (!r.inventedBefore && r.inventedAfter) console.log("  " + armKey + " " + r.caseId + " NEWLY FLAGGED: " + JSON.stringify(r.figuresAfter));
  }
}
console.log("");
console.log("authority and owner judgements that changed because the gold is now action-indexed:");
for (const [armKey, a] of Object.entries(out)) {
  const auth = a.rows.filter((r) => r.authorityBefore !== r.authorityAfter).length;
  const own = a.rows.filter((r) => r.ownerBefore !== r.ownerAfter).length;
  console.log("  " + armKey.padEnd(12) + "authority changed on " + auth + " cases, owner on " + own);
}

writeFileSync(repoPath("var", "state", "manager-rescore.json"), JSON.stringify({
  at: new Date().toISOString(), status: "POST_HOC_DIAGNOSTIC_ONLY", modelCalls: 0,
  note: "Stored decisions, repaired scorer. Cannot promote: the gates were frozen before the original run.",
  arms: out,
}, null, 1));
console.log("");
console.log("written: var/state/manager-rescore.json");
