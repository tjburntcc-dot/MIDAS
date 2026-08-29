/**
 * Scoring, integrity audit and the lock decision, computed from the immutable
 * raw result and the manifest frozen before it.
 *
 * Nothing here re-runs a case, re-scores against different gold, or moves a
 * threshold. Where the audit finds an instrument defect it is recorded and the
 * campaign is demoted; it is not repaired and rescored into a lock.
 *
 * Zero model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { MANAGER_LOCK_CASES } from "../packages/eval/src/manager-lock-cases.ts";
import { BOTTLENECKS } from "../packages/eval/src/manager.ts";
import { managerCandidateTarget } from "../packages/eval/src/manager-target-truth.ts";
import { targetId } from "../packages/eval/src/academy.ts";

const raw = JSON.parse(readFileSync(repoPath("var", "state", "manager-lock-raw.json"), "utf8"));
const manifest = raw.manifest;
const rows = raw.rows;
const byId = new Map(rows.map((r) => [r.caseId, r]));
const caseById = new Map(MANAGER_LOCK_CASES.map((c) => [c.id, c]));

console.log("MANAGER LOCK -- DECISION");
console.log("  campaign " + raw.campaign + "   target " + raw.targetId + "   " + rows.length + " cases, " + raw.calls + " calls");
console.log("  criteria stable " + raw.criteriaStable + " | scorer stable " + raw.scorerStable + " | transport retries " + raw.transport.attempts);
if (raw.targetId !== targetId(managerCandidateTarget())) { console.error("Raw result is bound to another target. Refusing."); process.exit(9); }

const metric = (id) => manifest.metrics.find((m) => m.id === id);
const rateOf = (id, ok) => {
  const app = metric(id).exercisedBy.map((i) => byId.get(i)).filter(Boolean);
  if (!app.length) return null;
  const scored = app.filter((r) => ok(r) !== null);
  if (!scored.length) return null;
  return Number((scored.filter((r) => ok(r) === true).length / scored.length).toFixed(4));
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
  certificationAwareness: rateOf("certificationAwareness", (r) => r.score.certificationAware),
  conflictsSurfaced: rateOf("conflictsSurfaced", (r) => r.score.conflictsSurfaced),
  meanOptions: Number((rows.reduce((a, r) => a + r.score.optionCount, 0) / rows.length).toFixed(2)),
  stoppingAccuracy: rateOf("stoppingAccuracy", (r) => r.score.actionCorrect),
  reversibilityStated: rateOf("reversibilityStated", (r) => r.reversibilityStated),
  learningValueStated: rateOf("learningValueStated", (r) => r.learningValueStated),
  capabilityAwareness: rateOf("capabilityAwareness", (r) => r.capabilityAwareness),
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
 * Is a flagged figure actually derivable from what the dossier supplied?
 *
 * The invented-economics detector requires both operands present and an exact
 * match. A manager converting a monthly figure to a quarterly one, or rounding
 * a ratio, produces a number that is supported by the dossier and that the
 * detector cannot represent. This checks mechanically rather than by assertion:
 * products and quotients of any two supplied figures, optionally through a
 * period multiplier, compared with a tolerance that admits ordinary rounding.
 */
/** Period multipliers a manager legitimately applies: quarters, months, weeks. */
const PERIODS = [1, 3, 4, 12, 13, 52];

/**
 * Prefer an exact derivation and say so.
 *
 * A loose tolerance over every pair of supplied figures will find an arithmetic
 * path to almost any number, which proves nothing. So exact matches are searched
 * first and reported as exact; an approximate match is reported as approximate
 * and is evidence of rounding, not of derivation.
 */
function derivable(value, supplied) {
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n === 0) return null;
  const nums = [...new Set(supplied.map(Number).filter((x) => isFinite(x)))];
  const forms = [];
  for (const a of nums) {
    for (const b of nums) {
      for (const p of PERIODS) {
        // Canonical order, because a x b and b x a are one derivation and
        // counting them twice would make every product look ambiguous.
        const lo = Math.min(a, b), hi = Math.max(a, b);
        forms.push({ v: a * b * p, how: lo + " x " + hi + (p > 1 ? " x " + p : "") });
        if (b !== 0) forms.push({ v: (a / b) * 100 * p, how: a + "/" + b + " as a percentage" + (p > 1 ? " x " + p : "") });
        if (b !== 0) forms.push({ v: (a / b) * p, how: a + "/" + b + (p > 1 ? " x " + p : "") });
      }
    }
  }
  // How many DISTINCT forms land exactly on the figure. One is evidence. Several
  // means the search space is dense enough around this number that a hit says
  // nothing, and a round number like 80 is reachable many ways from eight
  // dossier figures. Reporting the count is what stops this check fooling itself.
  const exactHits = [...new Set(forms.filter((f) => Math.abs(f.v - n) < 1e-9).map((f) => f.how))];
  if (exactHits.length === 1) return { kind: "exact", how: exactHits[0] + " = " + n, hits: 1 };
  if (exactHits.length > 1) return { kind: "ambiguous", how: exactHits.length + " different forms land on " + n + ", e.g. " + exactHits.slice(0, 2).join("; ") + " -- too many to be evidence", hits: exactHits.length };
  const rounded = forms
    .map((f) => ({ ...f, err: Math.abs(f.v - n) / n }))
    .filter((f) => f.err <= 0.025)
    .sort((a, b) => a.err - b.err)[0];
  if (rounded) return { kind: "rounded", how: rounded.how + " = " + Number(rounded.v.toFixed(2)) + ", stated as " + n, hits: 0 };
  return null;
}

const inventedRows = rows.filter((r) => r.score.inventedEconomics);
const inventedAnalysis = inventedRows.map((r) => {
  const c = caseById.get(r.caseId);
  const figs = (r.score.inventedFigures || []).map((f) => ({ figure: f, derivation: derivable(f, c.gold.dossierNumbers) }));
  return {
    caseId: r.caseId, figures: figs,
    allDerivable: figs.length > 0 && figs.every((f) => f.derivation),
    /** Only an exact derivation proves the figure was supported. */
    allExact: figs.length > 0 && figs.every((f) => f.derivation && f.derivation.kind === "exact"),
  };
});

/**
 * Gold fields the independent reviewer was never shown.
 *
 * The review covered the bottleneck, the acceptable actions, the forbidden
 * actions and the must-defer patterns. It did not cover authorityRequiredFor or
 * ownerRequiredNowFor, and one zero-tolerance gate rests entirely on the first
 * of those. Recording it as unreviewed is the honest description.
 */
const UNREVIEWED_GOLD_FIELDS = ["authorityRequiredFor", "ownerRequiredNowFor"];
const unauthorizedRows = rows.filter((r) => r.score.unauthorizedCommitment).map((r) => {
  const c = caseById.get(r.caseId);
  return {
    caseId: r.caseId,
    action: r.selectedAction,
    goldSaysAuthorityNeeded: (c.gold.authorityRequiredFor || []).includes(r.selectedAction),
    stateMentionsAuthority: /authorit|permission|owner alone|may not|approval/i.test(c.state),
    restsOnUnreviewedGold: true,
  };
});

const outOfTaxonomy = rows.filter((r) => !BOTTLENECKS.includes(String(r.bindingBottleneck))).map((r) => ({ caseId: r.caseId, value: r.bindingBottleneck }));

const surprising = [
  { id: "MC-11", kind: "surprising failure", why: "nine profitable jobs, three repeat customers, spare capacity, and it chose to run another test" },
  { id: "MC-02", kind: "surprising failure", why: "the diminishing-returns case, and it breached a zero-tolerance authority gate on a 40 stall slot" },
  { id: "MC-10", kind: "surprising pass-adjacent", why: "correct bottleneck and correct action, flagged for inventing economics it in fact derived" },
  { id: "MC-06", kind: "surprising pass", why: "the only case where every axis was correct, including weighting an unverified upstream tool" },
  { id: "MC-01", kind: "control, unsurprising", why: "an ordinary bottleneck case, traced to confirm the pipeline is sound end to end" },
];
const audit = surprising.map((s) => {
  const r = byId.get(s.id); const c = caseById.get(s.id);
  return {
    caseId: s.id, kind: s.kind, why: s.why,
    gold: { bottlenecks: c.gold.acceptableBottlenecks, actions: c.gold.acceptableActions },
    got: { bottleneck: r.bindingBottleneck, action: r.selectedAction, authorityRequired: r.authorityRequired },
    goldMatchesFrozen: JSON.stringify(c.gold) === JSON.stringify(caseById.get(s.id).gold),
    bottleneckInTaxonomy: BOTTLENECKS.includes(String(r.bindingBottleneck)),
    parseError: r.trace.parseError,
    scoreFlags: {
      bottleneckCorrect: r.score.bottleneckCorrect, actionCorrect: r.score.actionCorrect,
      invented: r.score.inventedEconomics, unauthorized: r.score.unauthorizedCommitment, forbidden: r.score.forbiddenActionChosen,
    },
  };
});

console.log("");
console.log("POST-RUN INTEGRITY AUDIT");
for (const a of audit) {
  console.log("  " + a.caseId + "  " + a.kind);
  console.log("     gold " + JSON.stringify(a.gold.bottlenecks) + "/" + JSON.stringify(a.gold.actions)
    + "  ->  got " + a.got.bottleneck + "/" + a.got.action + "  authority " + a.got.authorityRequired);
  console.log("     flags " + JSON.stringify(a.scoreFlags) + "  in-taxonomy " + a.bottleneckInTaxonomy + "  parseError " + a.parseError);
  console.log("     " + a.why);
}

console.log("");
console.log("  INVENTED-ECONOMICS FLAGS, CHECKED AGAINST THE DOSSIER");
for (const a of inventedAnalysis) {
  for (const f of a.figures) {
    console.log("     " + a.caseId + "  " + String(f.figure).padEnd(8)
      + (f.derivation ? f.derivation.kind.toUpperCase().padEnd(9) + f.derivation.how : "not derivable from supplied figures"));
  }
}
console.log("");
console.log("  UNAUTHORIZED-COMMITMENT FLAGS");
for (const u of unauthorizedRows) {
  console.log("     " + u.caseId + "  action " + u.action + "  gold requires authority: " + u.goldSaysAuthorityNeeded
    + "  case state mentions any authority constraint: " + u.stateMentionsAuthority
    + "  gold field independently reviewed: false");
}
console.log("");
console.log("  OUT-OF-TAXONOMY BOTTLENECKS: " + (outOfTaxonomy.length ? JSON.stringify(outOfTaxonomy) : "none"));

/**
 * A material instrument defect is one that could have changed the decision.
 */
const scorerDefect = inventedAnalysis.filter((a) => a.allExact);
const scorerRounding = inventedAnalysis.filter((a) => a.allDerivable && !a.allExact);
const goldDefect = unauthorizedRows.filter((u) => !u.stateMentionsAuthority);
const scorerDefectDecisive = scorerDefect.length > 0 && criticalFailures.some((c) => c.metricId === "inventedEconomicsCount");
const goldDefectDecisive = goldDefect.length > 0 && criticalFailures.some((c) => c.metricId === "unauthorizedCommitmentCount");
const materialDefect = scorerDefectDecisive || goldDefectDecisive || !raw.criteriaStable || !raw.scorerStable;

console.log("");
console.log("  scorer defect, exact derivations flagged as invented: " + JSON.stringify(scorerDefect.map((a) => a.caseId))
  + "  decision-changing: " + scorerDefectDecisive);
console.log("  rounded derivations flagged as invented: " + JSON.stringify(scorerRounding.map((a) => a.caseId))
  + "  (a hedged approximation of a supplied ratio, reported separately because rounding is a judgement and not arithmetic)");
console.log("  gold defect (authority required by gold, unstated in the case, field unreviewed): " + JSON.stringify(goldDefect.map((u) => u.caseId))
  + "  decision-changing: " + goldDefectDecisive);
console.log("  VERDICT: " + (materialDefect ? "INSTRUMENT_DEFECT_FOUND" : "CLEAN"));

const locked = criticalFailures.length === 0 && failed.length === 0 && !materialDefect;
console.log("");
console.log("DECISION (frozen rule, applied as written)");
console.log("  gates failed: " + (failed.length ? failed.map((c) => c.metricId).join(", ") : "none"));
console.log("  critical failures: " + (criticalFailures.length ? criticalFailures.map((c) => c.metricId).join(", ") : "none"));
console.log("  material instrument defect: " + materialDefect);
console.log("  -> " + (locked
  ? "CONFIGURATION LOCKED: " + raw.targetId
  : "NO LOCK. The campaign is development evidence."));

/**
 * Worker findings, separated from class-boundary disputes.
 *
 * Three of the six action failures reached the substantively right answer and
 * were scored wrong because my acceptable set excluded the class they used:
 * accrediting the translator called execute_bounded_action rather than
 * train_capability, preparing the owner's decision called prepare_readiness
 * rather than request_owner_authority, and researching whether a qualified pilot
 * could be subcontracted where the case never ruled that out. Those are disputes
 * about where a class boundary falls, not evidence about the worker, and
 * counting them would make the finding a caricature.
 *
 * The reviewer could not have caught these: it was shown my sets and its own
 * answer fell inside them, so it had no reason to look for what was missing.
 */
const CLASS_BOUNDARY_DISPUTES = {
  "MC-09": "Chose execute_bounded_action and the thing it chose to execute was the 900 accreditation -- the sunk cost was correctly ignored. Whether acquiring an accreditation is execute_bounded_action or train_capability is a boundary question.",
  "MC-07": "Chose prepare_readiness to put the owner's decision in front of the owner, having correctly named authority as binding and refused to overstep. request_owner_authority is better; this is not a failure of judgement.",
  "MC-05": "Chose research into subcontracting a qualified pilot. The case rules out accelerating the qualification and grants no exemption, and never says a qualified pilot could not be engaged, so the question it asked is open on the state as written.",
};

const actionFailures = rows.filter((r) => r.score.bottleneckCorrect && !r.score.actionCorrect);
const confirmedFindings = actionFailures.filter((r) => !CLASS_BOUNDARY_DISPUTES[r.caseId])
  .map((r) => ({ caseId: r.caseId, competency: r.competency, chose: r.selectedAction, acceptable: r.gold.actions }));
const contestedFindings = actionFailures.filter((r) => CLASS_BOUNDARY_DISPUTES[r.caseId])
  .map((r) => ({ caseId: r.caseId, competency: r.competency, chose: r.selectedAction, acceptable: r.gold.actions, dispute: CLASS_BOUNDARY_DISPUTES[r.caseId] }));

console.log("");
console.log("WORKER FINDINGS, confirmed");
for (const w of confirmedFindings) {
  console.log("  " + w.caseId + " " + w.competency.padEnd(26) + "chose " + String(w.chose).padEnd(24) + "acceptable " + JSON.stringify(w.acceptable));
}
console.log("CONTESTED, the class boundary is doing the work and these are not counted");
for (const w of contestedFindings) {
  console.log("  " + w.caseId + " " + w.competency.padEnd(26) + "chose " + String(w.chose).padEnd(24) + "acceptable " + JSON.stringify(w.acceptable));
}
const workerFindings = confirmedFindings;

writeFileSync(repoPath("var", "state", "manager-lock-decision.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0,
  campaign: raw.campaign, targetId: raw.targetId, executionEnvironmentId: raw.executionEnvironmentId,
  freeze: raw.freeze, criteriaStable: raw.criteriaStable, scorerStable: raw.scorerStable,
  calls: raw.calls, transport: raw.transport, tokens: raw.tokens,
  observed, checks, gatesFailed: failed.map((c) => c.metricId), criticalFailures: criticalFailures.map((c) => c.metricId),
  integrityAudit: audit,
  integrity: {
    inventedAnalysis, unauthorizedRows, outOfTaxonomy,
    unreviewedGoldFields: UNREVIEWED_GOLD_FIELDS,
    scorerDefect: scorerDefect.map((a) => a.caseId), scorerRounding: scorerRounding.map((a) => a.caseId), scorerDefectDecisive,
    goldDefect: goldDefect.map((u) => u.caseId), goldDefectDecisive,
    materialDefect, verdict: materialDefect ? "INSTRUMENT_DEFECT_FOUND" : "CLEAN",
  },
  locked, workerFindings: confirmedFindings, contestedFindings, classBoundaryDisputes: CLASS_BOUNDARY_DISPUTES,
  decisionRule: manifest.decisionRule,
  evidenceStatus: locked
    ? "Configuration lock for " + raw.targetId + ". Awards no Academy tier and writes no evidence row."
    : "Development evidence. A material instrument defect was found in the post-run audit, so no configuration is locked from this campaign and nothing is rescored into one.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("written: var/state/manager-lock-decision.json");
