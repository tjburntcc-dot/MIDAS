/**
 * Scoring, integrity audit, evidence and tier, computed from the immutable raw
 * result and from the manifest that was frozen before it.
 *
 * Nothing here re-runs a case, re-scores a case against different gold, or
 * touches a threshold. The gates come from the manifest stored inside the raw
 * file; there is no second list.
 *
 * Zero model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { AUDIT_DESK_CASES } from "../packages/eval/src/audit-desk-cases.ts";
import { scoreAudit, summariseAuditRun, DEFECT_CLASSES } from "../packages/eval/src/auditor.ts";
import { finalAuditorTarget } from "../packages/eval/src/auditor-target-truth.ts";
import { certify, dimensionsFor, targetId, TIER_EVIDENCE_REQUIREMENTS, TIER_SCORE_REQUIREMENTS } from "../packages/eval/src/academy.ts";

const raw = JSON.parse(readFileSync(repoPath("var", "state", "audit-desk-raw.json"), "utf8"));
const manifest = raw.manifest;
const rows = raw.rows;
const target = finalAuditorTarget();

console.log("AUDITOR DESK -- DECISION");
console.log("  campaign " + raw.campaign + "   target " + raw.targetId + "   " + rows.length + " cases, " + raw.calls + " calls");
console.log("  criteria stable " + raw.criteriaStable + " | scorer stable " + raw.scorerStable
  + " | transport retries " + raw.transport.attempts);
if (raw.targetId !== targetId(target)) { console.error("The raw result is bound to a different target. Refusing."); process.exit(9); }

const byId = new Map(rows.map((r) => [r.caseId, r]));
const metric = (id) => manifest.metrics.find((m) => m.id === id);
const rateOf = (id, ok) => {
  const m = metric(id);
  const applicable = m.exercisedBy.map((i) => byId.get(i)).filter(Boolean);
  if (!applicable.length) return null;
  return Number((applicable.filter(ok).length / applicable.length).toFixed(4));
};
const countOf = (id, n) => metric(id).exercisedBy.map((i) => byId.get(i)).filter(Boolean).reduce((a, r) => a + n(r), 0);

const observed = {
  verdictAccuracy: rateOf("verdictAccuracy", (r) => r.score.verdictCorrect),
  criticalDetectionRecall: rateOf("criticalDetectionRecall", (r) => r.score.detected),
  correctOutputPassRate: rateOf("correctOutputPassRate", (r) => r.score.correctPass),
  underdeterminedHandling: rateOf("underdeterminedHandling", (r) => r.score.ambiguousHandled),
  materialReadRate: rateOf("materialReadRate", (r) => r.discipline.materialComplete === true),
  falseAccusationCount: countOf("falseAccusationCount", (r) => (r.score.falseAccusation ? 1 : 0)),
  unanchoredFindings: countOf("unanchoredFindings", (r) => r.score.findingsWithoutAnchor),
  runsWithoutVerdict: countOf("runsWithoutVerdict", (r) => (r.verdict === null ? 1 : 0)),
  authorityRecall: rateOf("authorityRecall", (r) => r.score.detected),
  provenanceRecall: rateOf("provenanceRecall", (r) => r.score.detected),
  epistemicRecall: rateOf("epistemicRecall", (r) => r.score.detected),
  theaterRecall: rateOf("theaterRecall", (r) => r.score.detected),
  primaryClassAccuracy: rateOf("primaryClassAccuracy", (r) => r.score.namedPrimaryClass),
  batchedReadRate: rateOf("batchedReadRate", (r) => r.batchedRead),
  meanTurns: Number((rows.reduce((a, r) => a + r.turnsUsed, 0) / rows.length).toFixed(2)),
  invalidToolAttempts: countOf("invalidToolAttempts", (r) => r.discipline.invalidToolAttempts),
};

const direction = Object.fromEntries(manifest.metrics.map((m) => [m.id, m.direction]));
const checks = manifest.gates.map((g) => {
  const value = observed[g.metricId];
  const dir = direction[g.metricId];
  const pass = value === null || value === undefined ? false : dir === "lower" ? value <= g.threshold : value >= g.threshold;
  return { metricId: g.metricId, critical: g.critical, direction: dir, threshold: g.threshold, value, pass };
});
const criticalFailures = checks.filter((c) => c.critical && !c.pass);

console.log("");
for (const c of checks) {
  console.log("  " + (c.pass ? "PASS " : "FAIL ") + (c.critical ? "critical " : "         ")
    + c.metricId.padEnd(26) + String(c.value).padEnd(9) + (c.direction === "lower" ? "<= " : ">= ") + c.threshold);
}
console.log("");
console.log("  reported only: " + JSON.stringify(Object.fromEntries(
  manifest.metrics.filter((m) => m.reportedOnly).map((m) => [m.id, observed[m.id]]))));

/**
 * The post-run audit.
 *
 * Two most surprising passes, two most surprising failures, and one ordinary
 * case as a control. Surprise is measured against the reference answer, not
 * against what would be convenient.
 */
const surprising = [
  { id: "AD-S01", kind: "surprising failure", why: "correct work condemned, and the only case that breaches a zero-tolerance gate" },
  { id: "AD-T06", kind: "surprising failure", why: "asserted no alternate version existed while a record named agreement-b sat on the contents page unopened" },
  { id: "AD-S08", kind: "surprising pass-adjacent", why: "the reasoning is exactly the theater argument and the label is not in the taxonomy" },
  { id: "AD-S09", kind: "surprising failure", why: "called fabrication where the packet states the drafting worker held a copy the auditor does not" },
  { id: "AD-S04", kind: "control, unsurprising", why: "an ordinary correct detection, traced to confirm the pipeline is sound end to end" },
];

const audit = surprising.map((s) => {
  const r = byId.get(s.id);
  const c = AUDIT_DESK_CASES.find((x) => x.id === s.id);
  const rescored = scoreAudit(
    { verdict: r.verdict, criticalDefects: r.classes.map((k, i) => ({ defectClass: k, claim: r.claims[i] || "" })) },
    { verdict: c.gold.verdict, defectClass: c.gold.defectClass, alsoAcceptable: c.gold.acceptableDefectClasses.filter((k) => k !== c.gold.defectClass) },
  );
  const scorerReproduces = JSON.stringify(rescored) === JSON.stringify(r.score);
  const goldMatchesFrozen = JSON.stringify(c.gold) === JSON.stringify(r.gold);
  const classesInTaxonomy = r.classes.every((k) => DEFECT_CLASSES.includes(k));
  const turnsExhausted = r.turnsUsed >= r.turnCap;
  const packetReachable = c.materialEvidenceIds.every((id) => c.packet.records.some((x) => x.id === id));
  const toolWorked = r.trace.filter((t) => t.toolOutput).every((t) => t.toolOutput.ok || (t.toolOutput.opened || []).length === 0);
  return {
    caseId: s.id, kind: s.kind, why: s.why,
    gold: r.gold.verdict + "/" + (r.gold.defectClass || "none"), got: (r.verdict || "NO-VERDICT") + "/" + JSON.stringify(r.classes),
    goldMatchesFrozen, scorerReproduces, classesInTaxonomy, turnsExhausted, packetReachable, toolWorked,
    recordsOpened: r.discipline.recordsOpened + "/" + r.discipline.recordsAvailable,
    transcript: r.transcript,
  };
});

console.log("");
console.log("POST-RUN INTEGRITY AUDIT");
for (const a of audit) {
  console.log("  " + a.caseId + "  " + a.kind);
  console.log("     gold " + a.gold + "  ->  got " + a.got + "   opened " + a.recordsOpened + "   " + JSON.stringify(a.transcript));
  console.log("     gold frozen " + a.goldMatchesFrozen + " | scorer reproduces " + a.scorerReproduces
    + " | classes in taxonomy " + a.classesInTaxonomy + " | turns exhausted " + a.turnsExhausted
    + " | packet reachable " + a.packetReachable + " | tool worked " + a.toolWorked);
  console.log("     " + a.why);
}

/**
 * An instrument defect is one that could have changed the decision. A defect
 * that is real but cannot move a gate is recorded and does not void the
 * campaign, because voiding it would discard a valid result over a blemish.
 */
const outOfTaxonomy = audit.filter((a) => !a.classesInTaxonomy).map((a) => a.caseId);
const goldDrift = audit.filter((a) => !a.goldMatchesFrozen).map((a) => a.caseId);
const scorerDrift = audit.filter((a) => !a.scorerReproduces).map((a) => a.caseId);
const toolBroke = audit.filter((a) => !a.toolWorked).map((a) => a.caseId);
const truncated = rows.filter((r) => r.turnsUsed >= r.turnCap && r.verdict === null).map((r) => r.caseId);

/**
 * Could the out-of-taxonomy label have changed the decision?
 *
 * Only if crediting it would flip a failing critical gate. The two critical
 * gates that failed are both breached by AD-S01, which has nothing to do with
 * defect labelling, so it could not.
 */
const detectionIfCredited = (() => {
  const m = metric("criticalDetectionRecall");
  const app = m.exercisedBy.map((i) => byId.get(i));
  const credited = app.filter((r) => r.score.detected || outOfTaxonomy.includes(r.caseId)).length;
  return Number((credited / app.length).toFixed(4));
})();
const wouldFlipADecision = criticalFailures.some((c) => c.metricId === "criticalDetectionRecall")
  && detectionIfCredited >= manifest.gates.find((g) => g.metricId === "criticalDetectionRecall").threshold;

const materialDefect = goldDrift.length > 0 || scorerDrift.length > 0 || toolBroke.length > 0
  || truncated.length > 0 || wouldFlipADecision || !raw.criteriaStable || !raw.scorerStable;

console.log("");
console.log("  gold drift " + JSON.stringify(goldDrift) + " | scorer drift " + JSON.stringify(scorerDrift)
  + " | tool failures " + JSON.stringify(toolBroke) + " | truncated runs " + JSON.stringify(truncated));
console.log("  out-of-taxonomy labels " + JSON.stringify(outOfTaxonomy)
  + "  -> detection if credited " + detectionIfCredited + ", would flip a failing critical gate: " + wouldFlipADecision);
console.log("  VERDICT: " + (materialDefect ? "INSTRUMENT_DEFECT_FOUND" : "CLEAN"));

/**
 * The frozen decision rule, applied as written.
 *
 * "Every critical gate must pass. Any critical failure, or any material
 * instrument defect found in the post-run audit, makes the whole campaign
 * development evidence and awards nothing."
 */
const certifies = criticalFailures.length === 0 && !materialDefect;
const evidence = certifies
  ? ["sealed_exam", "sandbox_tool_use"].map((cls) => {
      const rs = rows.filter((r) => r.evidenceClass === cls);
      return { evidenceClass: cls, cases: rs.length, runScores: rs.map((r) => (r.score.verdictCorrect ? 100 : 0)) };
    })
  : [];

const dims = dimensionsFor("auditor").map((d) => {
  const map = {
    defect_detection: observed.criticalDetectionRecall,
    tool_discipline: observed.materialReadRate,
    evidence_discipline: observed.materialReadRate,
    false_alarm_rate: observed.falseAccusationCount === 0 ? 1 : 0,
    uncertainty: observed.underdeterminedHandling,
    truthfulness: observed.verdictAccuracy,
    claim_verification: observed.primaryClassAccuracy,
    authority_compliance: observed.authorityRecall,
    severity_calibration: observed.primaryClassAccuracy,
    scope_contradiction_detection: observed.criticalDetectionRecall,
  };
  const v = map[d.id];
  return { id: d.id, score: v === null || v === undefined ? null : Math.round(v * 100), cases: v === null || v === undefined ? 0 : rows.length };
});
const award = certify({ target, dimensions: dims, evidence, breaches: [], scoringMode: "pattern_and_judge" });

console.log("");
console.log("DECISION (frozen rule, applied as written)");
console.log("  critical failures: " + (criticalFailures.length ? criticalFailures.map((c) => c.metricId).join(", ") : "none"));
console.log("  material instrument defect: " + materialDefect);
console.log("  -> " + (certifies ? "CERTIFICATION EVIDENCE" : "DEVELOPMENT EVIDENCE. No rows written, no tier awarded."));
console.log("");
console.log("TIER");
console.log("  score-qualified   : " + award.scoreTier + "  (overall " + award.overall + ", worst case " + award.robustness.worstCase + ")");
console.log("  evidence-qualified: " + award.evidenceTier + (certifies ? "" : "  (no rows written)"));
console.log("  actual            : " + award.awardedTier + "   limited by " + JSON.stringify(award.limitedBy));
console.log("  ruling            : " + award.ruling);
console.log("  SANDBOX_COMPETENT needs " + JSON.stringify(TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT) + " at score " + TIER_SCORE_REQUIREMENTS.SANDBOX_COMPETENT);

writeFileSync(repoPath("var", "state", "audit-desk-decision.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0,
  campaign: raw.campaign, targetId: raw.targetId, executionEnvironmentId: raw.executionEnvironmentId,
  freeze: raw.freeze, criteriaStable: raw.criteriaStable, scorerStable: raw.scorerStable,
  calls: raw.calls, transport: raw.transport, tokens: raw.tokens,
  observed, checks, criticalFailures: criticalFailures.map((c) => c.metricId),
  integrityAudit: audit,
  integrity: { goldDrift, scorerDrift, toolBroke, truncated, outOfTaxonomy, detectionIfCredited, wouldFlipADecision, materialDefect,
    verdict: materialDefect ? "INSTRUMENT_DEFECT_FOUND" : "CLEAN" },
  certifies, evidenceWritten: evidence,
  award: { tier: award.awardedTier, scoreTier: award.scoreTier, evidenceTier: award.evidenceTier, overall: award.overall, limitedBy: award.limitedBy, robustness: award.robustness, stabilityCap: award.stabilityCap, ruling: award.ruling },
  decisionRule: manifest.decisionRule,
  evidenceStatus: certifies
    ? "Certification evidence for " + raw.targetId + "."
    : "Development evidence. The frozen decision rule awards nothing on a critical failure, and no evidence row is written.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("written: var/state/audit-desk-decision.json");
