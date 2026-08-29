/**
 * Can the objective still be reached?
 *
 * The campaign runs the six tool-use cases before the twelve sealed ones,
 * because tool-use behaviour is the larger unknown and there is no point paying
 * for the sealed half if the first half has already made certification
 * impossible. That ordering is only legitimate with a stop rule that fires on
 * impossibility and on nothing else.
 *
 * So this computes, for each gate, the best value that gate could still take if
 * every case not yet run went perfectly. A gate that cannot reach its threshold
 * even then is unreachable, and a critical gate that is unreachable ends the
 * campaign. Anything short of that -- a weak number, a surprising answer, a
 * metric below target but still recoverable -- is not a stop condition. There is
 * no success-based stop: a campaign going well runs to the end.
 *
 * The rule is here, in source, committed before any worker call, so that the
 * question "was this declared beforehand" has a mechanical answer.
 */

export interface CaseOutcome {
  caseId: string;
  /** Null when the run produced no verdict at all. */
  verdictCorrect: boolean | null;
  detected: boolean | null;
  correctPass: boolean | null;
  ambiguousHandled: boolean | null;
  materialComplete: boolean | null;
  falseAccusation: boolean | null;
  findingsWithoutAnchor: number;
  hasVerdict: boolean;
}

export interface MetricSpec {
  id: string;
  direction: string;
  /** Case ids that contribute to this metric. */
  exercisedBy: string[];
}

export interface GateSpec {
  metricId: string;
  threshold: number;
  critical: boolean;
}

/**
 * How one case contributes to one metric.
 *
 * Rate metrics return true or false. Count metrics return a number. A case that
 * does not exercise the metric returns null and is excluded from both.
 */
export function contribution(metricId: string, o: CaseOutcome) {
  switch (metricId) {
    case "verdictAccuracy": return o.verdictCorrect === null ? false : o.verdictCorrect;
    case "criticalDetectionRecall": return o.detected === null ? null : o.detected;
    case "correctOutputPassRate": return o.correctPass === null ? null : o.correctPass;
    case "underdeterminedHandling": return o.ambiguousHandled === null ? null : o.ambiguousHandled;
    case "materialReadRate": return o.materialComplete === null ? null : o.materialComplete;
    case "falseAccusationCount": return o.falseAccusation === null ? null : (o.falseAccusation ? 1 : 0);
    case "unanchoredFindings": return o.findingsWithoutAnchor;
    case "runsWithoutVerdict": return o.hasVerdict ? 0 : 1;
    default: return null;
  }
}

/**
 * The best value a metric could still take.
 *
 * For a rate, every case not yet run is assumed to succeed. For a count, every
 * case not yet run is assumed to add nothing. Both are the most generous
 * assumption available, which is what makes a failure here a proof of
 * impossibility rather than a pessimistic guess.
 */
export function bestAchievable(metric: MetricSpec, outcomes: CaseOutcome[]) {
  const byId = new Map(outcomes.map((o) => [o.caseId, o]));
  const run = metric.exercisedBy.filter((id) => byId.has(id));
  const unrun = metric.exercisedBy.length - run.length;

  if (metric.direction === "lower") {
    let count = 0;
    for (const id of run) {
      const c = contribution(metric.id, byId.get(id)!);
      if (typeof c === "number") count += c;
      else if (c === true) count += 1;
    }
    return { value: count, run: run.length, unrun, total: metric.exercisedBy.length, kind: "count" };
  }

  let successes = 0;
  let counted = 0;
  for (const id of run) {
    const c = contribution(metric.id, byId.get(id)!);
    if (c === null) continue;
    counted += 1;
    if (c === true) successes += 1;
  }
  const total = metric.exercisedBy.length;
  const value = total === 0 ? null : Number(((successes + unrun) / total).toFixed(4));
  return { value, run: counted, unrun, total, kind: "rate" };
}

/**
 * Whether every critical gate can still be satisfied.
 *
 * Non-critical gates are reported and never stop anything: the campaign's own
 * decision rule says only critical gates decide, and a stop rule that was
 * stricter than the decision rule would be inventing a criterion.
 */
export function reachability(metrics: MetricSpec[], gates: GateSpec[], outcomes: CaseOutcome[]) {
  const rows = gates.map((g) => {
    const m = metrics.find((x) => x.id === g.metricId);
    if (!m) return { metricId: g.metricId, critical: g.critical, threshold: g.threshold, error: "no such metric", reachable: false };
    const best = bestAchievable(m, outcomes);
    const reachable = best.value === null
      ? false
      : m.direction === "lower" ? best.value <= g.threshold : best.value >= g.threshold;
    return {
      metricId: g.metricId, critical: g.critical, threshold: g.threshold, direction: m.direction,
      bestAchievable: best.value, casesRun: best.run, casesUnrun: best.unrun, casesTotal: best.total,
      reachable,
    };
  });
  const lost = rows.filter((r) => r.critical && !r.reachable);
  return {
    rows,
    objectiveReachable: lost.length === 0,
    lostGates: lost.map((r) => r.metricId),
    reason: lost.length
      ? "Unreachable even if every remaining case is perfect: " + lost.map((r) => r.metricId + " best " + r.bestAchievable + " against " + r.threshold).join("; ")
      : "Every critical gate can still be satisfied.",
  };
}

/** The condition string, fixed here so the stop cannot be reworded after the fact. */
export const STOP_CONDITION =
  "After stage A, at least one critical gate cannot reach its threshold even if every case in stage B is answered perfectly.";
