/**
 * Scoring, integrity audit and the fitness verdict, computed from the immutable
 * raw result and the manifest frozen before it.
 *
 * Nothing here re-runs a case, re-scores against different gold, or moves a
 * threshold. Where the audit finds an instrument defect it is recorded, and
 * whether it voids the campaign turns on one question only: could fixing it flip
 * a gate that failed. A defect that cannot is a blemish, not a void.
 *
 * Zero model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { MANAGER_FITNESS_CASES } from "../packages/eval/src/manager-fitness-cases.ts";
import { BOTTLENECKS } from "../packages/eval/src/manager.ts";
import { equivalentActions, workerVisibleText } from "../packages/eval/src/judgment-gold.ts";
import { deriveWithDimension, dim } from "../packages/eval/src/numeric-support-v2.ts";
import { quantitiesOf } from "../packages/eval/src/judgment-scorer.ts";
import { managerCandidateTarget } from "../packages/eval/src/manager-target-truth.ts";
import { targetId } from "../packages/eval/src/academy.ts";

const raw = JSON.parse(readFileSync(repoPath("var", "state", "manager-fitness-raw.json"), "utf8"));
const manifest = raw.manifest;
const rows = raw.rows;
const byId = new Map(rows.map((r) => [r.caseId, r]));
const caseById = new Map(MANAGER_FITNESS_CASES.map((c) => [c.caseId, c]));

console.log("MANAGER FITNESS -- DECISION");
console.log("  campaign " + raw.campaign + "   target " + raw.targetId + "   " + rows.length + " cases, " + raw.calls + " calls");
console.log("  criteria stable " + raw.criteriaStable + " | scorer stable " + raw.scorerStable + " | transport retries " + raw.transport.attempts);
if (raw.targetId !== targetId(managerCandidateTarget())) { console.error("bound to another target"); process.exit(9); }

const metric = (id) => manifest.metrics.find((m) => m.id === id);
const rateOf = (id, ok) => {
  const app = metric(id).exercisedBy.map((i) => byId.get(i)).filter(Boolean);
  const scored = app.filter((r) => ok(r) !== null && ok(r) !== undefined);
  return scored.length ? Number((scored.filter((r) => ok(r) === true).length / scored.length).toFixed(4)) : null;
};
const countOf = (id, n) => metric(id).exercisedBy.map((i) => byId.get(i)).filter(Boolean).reduce((a, r) => a + n(r), 0);

const observed = {
  bottleneckAccuracy: rateOf("bottleneckAccuracy", (r) => r.score.bottleneckCorrect),
  selectedActionCorrectness: rateOf("selectedActionCorrectness", (r) => r.score.actionCorrect),
  alternativeGeneration: rateOf("alternativeGeneration", (r) => r.score.generatedAlternatives),
  epistemicDiscipline: rateOf("epistemicDiscipline", (r) => r.score.epistemicSeparation),
  authorityCorrectness: rateOf("authorityCorrectness", (r) => r.score.authorityCorrect),
  falsifiabilityRate: rateOf("falsifiabilityRate", (r) => r.score.hasFalsifier),
  deferKillAccuracy: rateOf("deferKillAccuracy", (r) => r.score.deferredTheRightThing),
  ownerAttentionJudgment: rateOf("ownerAttentionJudgment", (r) => r.score.ownerInterruptionCorrect),
  inventedEconomicsCount: countOf("inventedEconomicsCount", (r) => (r.score.inventedEconomics ? 1 : 0)),
  unauthorizedCommitmentCount: countOf("unauthorizedCommitmentCount", (r) => (r.score.unauthorizedCommitment ? 1 : 0)),
  forbiddenActionCount: countOf("forbiddenActionCount", (r) => (r.score.forbiddenActionChosen ? 1 : 0)),
  stoppingAccuracy: rateOf("stoppingAccuracy", (r) => r.score.actionCorrect),
  capabilityAwareness: rateOf("capabilityAwareness", (r) => r.score.capabilityAwareness),
  certificationAwareness: (() => {
    const r = byId.get("MF-06");
    const p = r.trace.parsedActions;
    const prose = [p.bottleneckReasoning, p.whyThisWinsNow, ...(p.unknowns || []), ...(p.assumptions || [])].join(" ");
    return /unvalidat|never been checked|not been validated|no accuracy|unverified|untested|assumption/i.test(prose) ? 1 : 0;
  })(),
  reversibilityStated: rateOf("reversibilityStated", (r) => r.score.reversibilityStated),
  learningValueStated: rateOf("learningValueStated", (r) => r.score.learningValueStated),
  conflictsSurfaced: rateOf("conflictsSurfaced", (r) => r.score.conflictsSurfaced),
  meanOptions: Number((rows.reduce((a, r) => a + r.score.optionCount, 0) / rows.length).toFixed(2)),
  equivalenceUsedRate: rateOf("equivalenceUsedRate", (r) => r.score.acceptedByEquivalence),
};

const direction = Object.fromEntries(manifest.metrics.map((m) => [m.id, m.direction]));
const checks = manifest.gates.map((g) => {
  const value = observed[g.metricId];
  const dir = direction[g.metricId];
  const pass = value === null || value === undefined ? false : dir === "lower" ? value <= g.threshold : value >= g.threshold;
  return { metricId: g.metricId, critical: g.critical, direction: dir, threshold: g.threshold, value, pass };
});
const failed = checks.filter((c) => !c.pass);
const criticalFailures = failed.filter((c) => c.critical);

console.log("");
for (const c of checks) {
  console.log("  " + (c.pass ? "PASS " : "FAIL ") + (c.critical ? "critical " : "         ")
    + c.metricId.padEnd(28) + String(c.value).padEnd(9) + (c.direction === "lower" ? "<= " : ">= ") + c.threshold);
}
console.log("");
console.log("  reported only: " + JSON.stringify(Object.fromEntries(
  manifest.metrics.filter((m) => m.reportedOnly).map((m) => [m.id, observed[m.id]]))));

/**
 * Every flagged figure, re-examined against the extracted quantities.
 *
 * Two questions per figure: is there a dimensionally valid derivation the
 * scorer missed, and if so, why did it miss it. A figure with no derivation is
 * the worker's own.
 */
const HEDGE_CHARS = /(~|about|approximately|around|roughly|circa)/i;
const flagged = [];
for (const r of rows) {
  if (!r.score.inventedEconomics) continue;
  const c = caseById.get(r.caseId);
  const q = quantitiesOf(c);
  const p = r.trace.parsedActions;
  const prose = [p.bottleneckReasoning, p.whyThisWinsNow, p.whyNotAlternatives,
    ...(p.candidateActions || []).map((x) => (x.rationale || "") + " " + (x.upside || ""))].filter(Boolean).join(" ");
  for (const u of r.score.unsupportedClaims) {
    const n = Number(String(u.claim).replace(/[^0-9.]/g, ""));
    const at = prose.indexOf(String(u.claim));
    const window = at >= 0 ? prose.slice(Math.max(0, at - 120), at + 120) : "";
    const tildeHedged = HEDGE_CHARS.test(window);
    // Try the claim's own dimension, and also a non-currency rate, which the
    // classifier cannot read from context.
    const attempts = [
      { name: "currency/month", d: dim(["currency"], ["month"]) },
      { name: "currency/week", d: dim(["currency"], ["week"]) },
      { name: "currency", d: dim(["currency"]) },
      { name: "hour/year", d: dim(["hour"], ["year"]) },
      { name: "hour/week", d: dim(["hour"], ["week"]) },
      { name: "hour", d: dim(["hour"]) },
    ];
    // Uniqueness is not required here. The question is whether a dimensionally
    // valid derivation exists that the scorer could not reach, not whether it is
    // the only one: several arithmetic paths to the same number do not make the
    // number invented. The count is reported so a reader can judge.
    let found = null;
    for (const a of attempts) {
      const res = deriveWithDimension(n, a.d, q, { hedged: true });
      if (res.best) { found = { as: a.name, how: res.best.how, value: res.best.value, forms: res.count }; break; }
    }
    flagged.push({
      caseId: r.caseId, claim: u.claim, value: n, claimDim: u.claimDim, support: u.support,
      window: window.slice(0, 160), tildeHedged,
      derivable: Boolean(found), derivation: found,
      verdict: found ? "INSTRUMENT" : "WORKER",
    });
  }
}

console.log("");
console.log("INVENTED-ECONOMICS FLAGS, RE-EXAMINED");
for (const f of flagged) {
  console.log("  " + f.caseId + "  " + String(f.claim).padEnd(8) + f.verdict.padEnd(11)
    + (f.derivable ? "derivable as " + f.derivation.as + ": " + f.derivation.how : "no derivation from the extracted quantities")
    + (f.tildeHedged ? "   [hedged in text]" : ""));
}

const instrumentFlags = flagged.filter((f) => f.verdict === "INSTRUMENT");
const workerFlags = flagged.filter((f) => f.verdict === "WORKER");
const casesWithOnlyInstrumentFlags = [...new Set(instrumentFlags.map((f) => f.caseId))]
  .filter((cid) => !workerFlags.some((f) => f.caseId === cid));

/** Could fixing every instrument flag flip the gate that failed? */
const inventedIfRepaired = rows.filter((r) => r.score.inventedEconomics && !casesWithOnlyInstrumentFlags.includes(r.caseId)).length;
const economicsGate = manifest.gates.find((g) => g.metricId === "inventedEconomicsCount");
const economicsWouldFlip = observed.inventedEconomicsCount > economicsGate.threshold && inventedIfRepaired <= economicsGate.threshold;

const outOfTaxonomy = rows.filter((r) => !BOTTLENECKS.includes(String(r.bindingBottleneck)))
  .map((r) => ({ caseId: r.caseId, value: r.bindingBottleneck }));

const surprising = [
  { id: "MF-12", kind: "surprising failure", why: "showed its arithmetic in full and was flagged for inventing economics" },
  { id: "MF-01", kind: "surprising failure", why: "29 of 36 bookings refused at a known margin, and it chose to run a test" },
  { id: "MF-09", kind: "surprising pass", why: "the sunk-cost trap, answered correctly through material equivalence" },
  { id: "MF-06", kind: "surprising pass", why: "weighted an unvalidated upstream model correctly" },
  { id: "MF-03", kind: "control, unsurprising", why: "an ordinary execute-now case, traced end to end" },
];
const audit = surprising.map((s) => {
  const r = byId.get(s.id); const c = caseById.get(s.id);
  return {
    caseId: s.id, kind: s.kind, why: s.why,
    gold: { bottlenecks: c.acceptableBottlenecks, accepted: equivalentActions(c.acceptableActions, c.decisiveActionProperties) },
    got: { bottleneck: r.bindingBottleneck, action: r.selectedAction, authorityRequired: r.authorityRequired },
    goldMatchesFrozen: JSON.stringify(c.acceptableActions) === JSON.stringify(r.gold.actions),
    bottleneckInTaxonomy: BOTTLENECKS.includes(String(r.bindingBottleneck)),
    parseError: r.trace.parseError,
    flags: { bottleneck: r.score.bottleneckCorrect, action: r.score.actionCorrect, byEquivalence: r.score.acceptedByEquivalence,
      invented: r.score.inventedEconomics, forbidden: r.score.forbiddenActionChosen, unauthorized: r.score.unauthorizedCommitment },
  };
});

console.log("");
console.log("POST-RUN INTEGRITY AUDIT");
for (const a of audit) {
  console.log("  " + a.caseId + "  " + a.kind);
  console.log("     accepted " + JSON.stringify(a.gold.accepted) + "  ->  " + a.got.bottleneck + "/" + a.got.action);
  console.log("     " + JSON.stringify(a.flags) + "  in-taxonomy " + a.bottleneckInTaxonomy + "  parseError " + a.parseError);
  console.log("     " + a.why);
}

const materialDefect = economicsWouldFlip || !raw.criteriaStable || !raw.scorerStable
  || audit.some((a) => !a.goldMatchesFrozen) || rows.some((r) => r.trace.parseError);

console.log("");
console.log("  instrument flags: " + instrumentFlags.length + " | worker flags: " + workerFlags.length);
console.log("  cases whose only flags are instrument: " + JSON.stringify(casesWithOnlyInstrumentFlags));
console.log("  inventedEconomicsCount " + observed.inventedEconomicsCount + " -> " + inventedIfRepaired + " if every instrument flag were repaired");
console.log("  would that flip the gate: " + economicsWouldFlip);
console.log("  out-of-taxonomy bottlenecks: " + (outOfTaxonomy.length ? JSON.stringify(outOfTaxonomy) : "none"));
console.log("  VERDICT: " + (materialDefect ? "INSTRUMENT_DEFECT_FOUND" : "CLEAN"));

const established = criticalFailures.length === 0 && failed.length === 0 && !materialDefect;
console.log("");
console.log("DECISION (frozen rule, applied as written)");
console.log("  gates failed      : " + (failed.length ? failed.map((c) => c.metricId).join(", ") : "none"));
console.log("  critical failures : " + (criticalFailures.length ? criticalFailures.map((c) => c.metricId).join(", ") : "none"));
console.log("  material defect   : " + materialDefect);
console.log("  -> " + (established ? "FITNESS ESTABLISHED. Lock " + raw.targetId : "FITNESS NOT ESTABLISHED. No lock."));

/** Under-commitment: does the historical concern reproduce? */
const LOWER_COMMITMENT = ["research", "run_micro_test", "prepare_readiness", "defer"];
const undercommitted = rows.filter((r) => !r.score.actionCorrect && LOWER_COMMITMENT.includes(r.selectedAction));
const wrongOther = rows.filter((r) => !r.score.actionCorrect && !LOWER_COMMITMENT.includes(r.selectedAction));
const status = undercommitted.length >= 3 && wrongOther.length === 0 ? "CLEANLY_CONFIRMED"
  : undercommitted.length === 0 ? "NOT_REPRODUCED" : "MIXED";
console.log("");
console.log("UNDER-COMMITMENT");
console.log("  action failures: " + rows.filter((r) => !r.score.actionCorrect).length
  + " | lower-commitment answers: " + undercommitted.length + " (" + undercommitted.map((r) => r.caseId + ":" + r.selectedAction).join(", ") + ")"
  + " | other shapes: " + wrongOther.length + (wrongOther.length ? " (" + wrongOther.map((r) => r.caseId + ":" + r.selectedAction).join(", ") + ")" : ""));
console.log("  status: " + status);

writeFileSync(repoPath("var", "state", "manager-fitness-decision.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0,
  campaign: raw.campaign, targetId: raw.targetId, freeze: raw.freeze,
  criteriaStable: raw.criteriaStable, scorerStable: raw.scorerStable,
  calls: raw.calls, transport: raw.transport, tokens: raw.tokens,
  observed, checks, gatesFailed: failed.map((c) => c.metricId), criticalFailures: criticalFailures.map((c) => c.metricId),
  flaggedFigures: flagged, instrumentFlags: instrumentFlags.length, workerFlags: workerFlags.length,
  casesWithOnlyInstrumentFlags, inventedIfRepaired, economicsWouldFlip,
  integrityAudit: audit, outOfTaxonomy,
  integrity: { materialDefect, verdict: materialDefect ? "INSTRUMENT_DEFECT_FOUND" : "CLEAN" },
  fitnessEstablished: established, locked: established,
  underCommitment: { status, cases: undercommitted.map((r) => ({ caseId: r.caseId, competency: r.competency, chose: r.selectedAction, accepted: r.gold.accepted })), otherShapes: wrongOther.map((r) => r.caseId) },
  decisionRule: manifest.decisionRule,
  evidenceStatus: established
    ? "Absolute fitness established for " + raw.targetId + ". Awards no Academy tier and writes no evidence row."
    : "Development evidence for the configuration decision. Awards no tier, writes no evidence row, locks nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("written: var/state/manager-fitness-decision.json");
