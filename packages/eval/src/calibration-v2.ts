/**
 * Calibration v2 — graded numeric scoring with subskill separation.
 *
 * The v1 calibration dimension collapsed several distinct abilities into one
 * opaque number and, worse, encoded "declined therefore unknowable", which made
 * a correct restatement of a stated budget score zero. See
 * docs/opportunity-qualifier/CALIBRATION_INSTRUMENT.md.
 *
 * Three changes here:
 *
 *   1. Estimability is a property of the record, never of the decision. A gold
 *      band exists whenever the record supports one, whatever the worker is
 *      supposed to do with the opportunity.
 *   2. Subskills are scored separately. Recovering a figure that is printed in
 *      the record is a different ability from estimating one from scope, and
 *      both differ from knowing when to abstain.
 *   3. Distance is graded rather than thresholded. Binary containment throws
 *      away most of the signal and is brittle exactly at the band edges.
 *
 * Gold shape, per numeric field:
 *   { band: { low, high }, source: "stated_budget" | "stated_range" | "scope_inferred" }
 *   { unknowable: true, why: "..." }
 */

export const NUMERIC_FIELDS = ["estimated_value_usd", "ai_fulfillment_pct", "human_minutes"];

/** Sources where the figure is present in the record and should be recovered, not guessed. */
export const STATED_SOURCES = ["stated_budget", "stated_range"];

/** A worker figure reduced to a single comparable number. */
export function pointOf(field: string, value: any): number | null {
  if (value == null) return null;
  if (field === "estimated_value_usd") {
    if (typeof value !== "object") return null;
    const lo = Number(value.low);
    const hi = Number(value.high);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return (lo + hi) / 2;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Graded score for one numeric estimate against a gold band.
 *
 * Abstaining where an estimate is supported is wrong but not equally wrong as a
 * confident miss: it withholds information rather than asserting a false one, so
 * it earns partial credit rather than zero.
 */
export function scoreAgainstBand(field: string, value: any, band: { low: number; high: number }) {
  const point = pointOf(field, value);
  if (point == null) {
    return { score: 25, contained: false, abstained: true, relativeError: null, direction: null, catastrophic: false };
  }
  const low = Number(band.low);
  const high = Number(band.high);
  const mid = (low + high) / 2;
  if (point >= low && point <= high) {
    return { score: 100, contained: true, abstained: false, relativeError: 0, direction: null, catastrophic: false };
  }
  const distance = point < low ? low - point : point - high;
  const relativeError = mid === 0 ? (distance > 0 ? Infinity : 0) : distance / Math.abs(mid);
  const direction = point < low ? "under" : "over";
  const catastrophic = relativeError >= 1;
  const score = Math.max(0, 100 - 100 * relativeError);
  return { score, contained: false, abstained: false, relativeError, direction, catastrophic };
}

/**
 * Range-width honesty, for the one field the worker reports as a range.
 *
 * A band an order of magnitude narrower than the defensible one is fake
 * precision even when it happens to land inside. Reported as a diagnostic rather
 * than scored, because a narrow correct answer is not itself a failure — it is a
 * signal that the confidence is not earned.
 */
export function rangeWidthRatio(value: any, band: { low: number; high: number }) {
  if (!value || typeof value !== "object") return null;
  const lo = Number(value.low);
  const hi = Number(value.high);
  const goldWidth = Number(band.high) - Number(band.low);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(goldWidth > 0)) return null;
  return (hi - lo) / goldWidth;
}

function numericGold(record: any, field: string) {
  const n = record && record.gold && record.gold.numeric;
  return n ? n[field] : undefined;
}

/** Fields whose gold says the record cannot support an estimate. */
export function unknowableFields(record: any): string[] {
  return NUMERIC_FIELDS.filter((f) => {
    const g = numericGold(record, f);
    return g && g.unknowable === true;
  });
}

/** Fields whose gold supplies a band, restricted to the given sources. */
export function bandedFields(record: any, sources?: string[]): string[] {
  return NUMERIC_FIELDS.filter((f) => {
    const g = numericGold(record, f);
    if (!g || !g.band) return false;
    return sources ? sources.includes(g.source) : true;
  });
}

/**
 * Score one subskill over the banded fields matching a source filter.
 * Returns null when the case exercises no field of that kind, so the case is
 * skipped rather than scored as a zero it never had a chance to earn.
 */
export function scoreBandedSubskill(record: any, output: any, opts: { fields?: string[]; sources?: string[] }) {
  const fields = (opts.fields || NUMERIC_FIELDS).filter((f) => bandedFields(record, opts.sources).includes(f));
  if (!fields.length) return null;
  let total = 0;
  const detail: any[] = [];
  for (const f of fields) {
    const g = numericGold(record, f);
    const r = scoreAgainstBand(f, output[f], g.band);
    total += r.score;
    detail.push({ field: f, source: g.source, ...r, widthRatio: f === "estimated_value_usd" ? rangeWidthRatio(output[f], g.band) : null });
  }
  return { value: total / fields.length, detail };
}

/**
 * Abstention: does the worker decline to estimate where the record genuinely
 * cannot support one? Returns null when the case has no unknowable field.
 */
export function scoreAbstention(record: any, output: any) {
  const fields = unknowableFields(record);
  if (!fields.length) return null;
  let correct = 0;
  const detail: any[] = [];
  for (const f of fields) {
    const abstained = pointOf(f, output[f]) == null;
    if (abstained) correct += 1;
    detail.push({ field: f, abstained, why: numericGold(record, f).why || null });
  }
  return { value: (100 * correct) / fields.length, detail };
}

/**
 * Diagnostics across a whole run. Not scored — these are what a human reads to
 * decide whether an aggregate is trustworthy and where to train next.
 */
export function calibrationDiagnostics(results: any[]) {
  const acc = {
    n: 0,
    contained: 0,
    abstainedWhenBanded: 0,
    over: 0,
    under: 0,
    catastrophicOver: 0,
    catastrophicUnder: 0,
    relativeErrors: [] as number[],
    fakePrecision: 0,
    unknowableSeen: 0,
    unknowableRespected: 0,
    byField: {} as Record<string, { n: number; contained: number; over: number; under: number }>,
  };
  for (const r of results) {
    const d = r && r.scoreDetails;
    if (!d) continue;
    for (const key of Object.keys(d)) {
      const entry = d[key];
      if (!entry || !Array.isArray(entry.detail)) continue;
      for (const item of entry.detail) {
        if (item.abstained !== undefined && item.relativeError === undefined) {
          // abstention detail
          acc.unknowableSeen += 1;
          if (item.abstained) acc.unknowableRespected += 1;
          continue;
        }
        if (item.relativeError === undefined) continue;
        acc.n += 1;
        const f = acc.byField[item.field] || (acc.byField[item.field] = { n: 0, contained: 0, over: 0, under: 0 });
        f.n += 1;
        if (item.contained) { acc.contained += 1; f.contained += 1; }
        if (item.abstained) acc.abstainedWhenBanded += 1;
        if (item.direction === "over") { acc.over += 1; f.over += 1; if (item.catastrophic) acc.catastrophicOver += 1; }
        if (item.direction === "under") { acc.under += 1; f.under += 1; if (item.catastrophic) acc.catastrophicUnder += 1; }
        if (Number.isFinite(item.relativeError)) acc.relativeErrors.push(item.relativeError);
        if (item.widthRatio != null && item.widthRatio < 0.2) acc.fakePrecision += 1;
      }
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sorted = acc.relativeErrors.slice().sort((a, b) => a - b);
  return {
    estimatesScored: acc.n,
    containmentRate: acc.n ? acc.contained / acc.n : null,
    abstainedWhenAnEstimateWasSupported: acc.abstainedWhenBanded,
    // A large imbalance here is systematic bias, which matters more for economic
    // decisions than the raw error: consistent overestimation of value or AI
    // share makes every opportunity look better than it is.
    overestimates: acc.over,
    underestimates: acc.under,
    directionalBias: acc.over + acc.under ? (acc.over - acc.under) / (acc.over + acc.under) : null,
    catastrophicOverestimates: acc.catastrophicOver,
    catastrophicUnderestimates: acc.catastrophicUnder,
    meanRelativeError: mean(acc.relativeErrors),
    medianRelativeError: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    fakePrecisionBands: acc.fakePrecision,
    unknowableFieldsSeen: acc.unknowableSeen,
    unknowableFieldsRespected: acc.unknowableRespected,
    byField: acc.byField,
  };
}
