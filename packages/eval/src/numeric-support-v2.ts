/**
 * Numeric support, decided by dimensions rather than by arithmetic search.
 *
 * The first version combined supplied figures pairwise and asked whether any
 * combination hit the claimed number. That fails in both directions. It rejected
 * 25 bookings x $22 each x 3 months = $1,650 a quarter, because the 3 was not in
 * the dossier -- and a Manager was scored as inventing economics for doing the
 * arithmetic its job requires. And it would accept a number reached by
 * multiplying a budget by a headcount, because nothing stopped two figures being
 * combined that have no business being combined.
 *
 * The fix is not a wider search. A wider search finds a path to almost any
 * number, which is how the post-run audit of the Manager campaign first
 * "confirmed" a derivation of 80% from 4/60 x 12, a coincidence.
 *
 * So the evidence supplies QUANTITIES, not numbers: a value with a dimension.
 * $22 per booking is currency per booking; 25 bookings a month is bookings per
 * month; their product is currency per month, and only a month-to-quarter factor
 * can carry it to currency per quarter. A budget divided by a headcount is
 * currency per sitter, and nothing composes that into currency per quarter, so
 * the coincidence is rejected because it is dimensionally meaningless rather
 * than because it fell outside a tolerance.
 *
 * The claim is read the same way. "$1,650 a quarter" is currency per quarter, and
 * a derivation is only support if it produces that dimension.
 */

export const NUMERIC_SUPPORT_V2 = [
  "supported_exact",
  "supported_equivalent",
  "supported_derivation",
  "supported_rounded",
  "unsupported_value",
  "unsupported_dimension",
  "unsupported_extrapolation",
] as const;

/** A dimension is a signed multiset of unit names. currency/month is {currency:1, month:-1}. */
export type Dimension = Record<string, number>;

export interface Quantity {
  /** Stable handle, so a derivation can be reported in words. */
  id: string;
  value: number;
  /** e.g. { currency: 1, booking: -1 } for "$22 per booking". */
  dim: Dimension;
  label: string;
}

export function dim(numerator: string[] = [], denominator: string[] = []): Dimension {
  const d: Dimension = {};
  for (const u of numerator) d[u] = (d[u] || 0) + 1;
  for (const u of denominator) d[u] = (d[u] || 0) - 1;
  for (const k of Object.keys(d)) if (d[k] === 0) delete d[k];
  return d;
}

export function dimEqual(a: Dimension, b: Dimension) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}

export function dimMul(a: Dimension, b: Dimension): Dimension {
  const d: Dimension = { ...a };
  for (const [k, v] of Object.entries(b)) {
    d[k] = (d[k] || 0) + v;
    if (d[k] === 0) delete d[k];
  }
  return d;
}

export function dimDiv(a: Dimension, b: Dimension): Dimension {
  const inv: Dimension = {};
  for (const [k, v] of Object.entries(b)) inv[k] = -v;
  return dimMul(a, inv);
}

export function dimToString(d: Dimension) {
  const num = Object.entries(d).filter(([, v]) => v > 0).map(([k, v]) => (v > 1 ? k + "^" + v : k));
  const den = Object.entries(d).filter(([, v]) => v < 0).map(([k, v]) => (v < -1 ? k + "^" + -v : k));
  if (!num.length && !den.length) return "ratio";
  return (num.join(".") || "1") + (den.length ? "/" + den.join(".") : "");
}

/**
 * Period conversions, as quantities.
 *
 * These are the only multipliers a derivation may introduce that the dossier did
 * not supply, and they carry a dimension, so a 3 can only ever act as months per
 * quarter. A worker that multiplies by 3 where no month-to-quarter relationship
 * exists produces a dimension the claim does not have, and is unsupported.
 */
export const PERIOD_FACTORS: Quantity[] = [
  { id: "monthsPerQuarter", value: 3, dim: dim(["month"], ["quarter"]), label: "3 months in a quarter" },
  { id: "weeksPerQuarter", value: 13, dim: dim(["week"], ["quarter"]), label: "13 weeks in a quarter" },
  { id: "monthsPerYear", value: 12, dim: dim(["month"], ["year"]), label: "12 months in a year" },
  { id: "weeksPerYear", value: 52, dim: dim(["week"], ["year"]), label: "52 weeks in a year" },
  { id: "quartersPerYear", value: 4, dim: dim(["quarter"], ["year"]), label: "4 quarters in a year" },
  { id: "daysPerWeek", value: 7, dim: dim(["day"], ["week"]), label: "7 days in a week" },
  { id: "weeksPerMonth", value: 4.345, dim: dim(["week"], ["month"]), label: "about 4.3 weeks in a month" },
];

/**
 * Marks that a figure is deliberately approximate.
 *
 * Two alternations rather than one. A tilde is not a word character, so inside
 * a \b group it could never match and "~2000/month" was read as an exact claim
 * -- which is how a Manager that wrote its arithmetic out in full was scored as
 * having invented the rounded figure it declared (D-43).
 */
const HEDGE = /(\b(about|approximately|around|roughly|circa|almost|nearly|order of)\b|~)/i;
/** Words that project a figure past what the evidence reaches. */
const PROJECTION = /\b(lifetime value|ltv|payback|roi|run.?rate|forecast|projected)\b/i;

const ROUNDING_TOLERANCE = 0.03;
const EXACT_TOLERANCE = 1e-9;

/**
 * Half a unit in the last decimal place the claim actually states.
 *
 * A figure written as 78.33 is exact at the precision it was written to, and
 * 47/60 is 78.3333. Demanding more precision than the claim asserts would flag
 * ordinary two-decimal reporting as invented, which is the defect this module
 * exists to remove. A figure written as 80 states one significant place and
 * therefore admits half a unit, which is not enough to reach 78.33 -- so an
 * undeclared rounding to a round number is still caught.
 */
export function displayTolerance(claim: string) {
  const m = String(claim).match(/\.(\d+)/);
  return m ? 0.5 * Math.pow(10, -m[1].length) : 0.5;
}

export interface Derivation {
  how: string;
  value: number;
  dim: Dimension;
  usedPeriodFactor: boolean;
  steps: number;
}

/**
 * Find a derivation of `target` with `wanted` dimension.
 *
 * Guided, not exhaustive: quantities may only be combined when the combination
 * moves toward the wanted dimension, at most three factors deep, and every
 * operand is a quantity the evidence supplied or a declared period factor. The
 * search returns the shallowest derivation, and reports how many distinct ones
 * exist so a caller can tell a unique explanation from a coincidence.
 */
export function deriveWithDimension(target: number, wanted: Dimension, supplied: Quantity[], opts: { hedged?: boolean; display?: number } = {}) {
  // Three tolerances, in order of strength: the precision the claim states, a
  // floating-point epsilon, and -- only where the claim declares itself
  // approximate -- a relative rounding band.
  const display = opts.display ?? 0.5;
  const floor = Math.max(display, EXACT_TOLERANCE);
  const tolAbs = opts.hedged ? Math.max(floor, Math.abs(target) * ROUNDING_TOLERANCE) : floor;
  const near = (v: number) => Math.abs(v - target) <= tolAbs;
  const pool = [...supplied, ...PERIOD_FACTORS];
  const found: Derivation[] = [];

  const consider = (value: number, d: Dimension, how: string, steps: number, usedPeriod: boolean) => {
    if (!dimEqual(d, wanted)) return;
    if (!near(value)) return;
    if (found.some((f) => f.how === how)) return;
    found.push({ how, value, dim: d, usedPeriodFactor: usedPeriod, steps });
  };

  for (const a of supplied) {
    consider(a.value, a.dim, a.label, 1, false);
    for (const b of pool) {
      if (b === a) continue;
      const isP = PERIOD_FACTORS.includes(b);
      consider(a.value * b.value, dimMul(a.dim, b.dim), a.label + " x " + b.label, 2, isP);
      if (b.value !== 0) consider(a.value / b.value, dimDiv(a.dim, b.dim), a.label + " / " + b.label, 2, isP);
      for (const c of pool) {
        if (c === a || c === b) continue;
        const isP3 = isP || PERIOD_FACTORS.includes(c);
        consider(a.value * b.value * c.value, dimMul(dimMul(a.dim, b.dim), c.dim), a.label + " x " + b.label + " x " + c.label, 3, isP3);
        if (c.value !== 0) consider((a.value * b.value) / c.value, dimDiv(dimMul(a.dim, b.dim), c.dim), a.label + " x " + b.label + " / " + c.label, 3, isP3);
      }
    }
  }
  // Ratios: two quantities of the same dimension, expressed as a percentage.
  if (dimEqual(wanted, dim(["percent"]))) {
    for (const a of supplied) {
      for (const b of supplied) {
        if (a === b || b.value === 0) continue;
        if (!dimEqual(a.dim, b.dim)) continue;
        consider2(found, (a.value / b.value) * 100, dim(["percent"]), a.label + " / " + b.label + " as a percentage", 2, near);
      }
    }
  }
  found.sort((x, y) => x.steps - y.steps);
  // Distinct derivations that differ by more than operand order.
  const canonical = new Set(found.map((f) => f.how.split(" x ").sort().join(" x ")));
  return { best: found[0] || null, count: canonical.size, all: found };
}

function consider2(found: Derivation[], value: number, d: Dimension, how: string, steps: number, near: (v: number) => boolean) {
  if (!near(value)) return;
  if (found.some((f) => f.how === how)) return;
  found.push({ how, value, dim: d, usedPeriodFactor: false, steps });
}

const PERIOD_WORDS = "quarter|month|week|year|day";
/**
 * A rate the text states in its own units: "260 hours a year", "23 jobs/month".
 *
 * Only a rate. A bare count keeps no dimension, because "1200 episodes in the
 * catalogue" names no denominator and guessing one would invent the claim's
 * meaning rather than read it. Without this, any claim in hours, jobs, units or
 * headcount per period had no dimensional path at all and was reported
 * unsupported however cleanly it derived (D-44).
 */
const STATED_RATE = new RegExp(
  "(\\d[\\d,]*(?:\\.\\d+)?)\\s*([a-z]{3,20})\\s*(?:/|per\\s+|a\\s+|each\\s+)(" + PERIOD_WORDS + ")", "gi",
);

/** The rate the window states for this figure, or null. Matched on the figure itself. */
function statedRateFor(claim: string, w: string) {
  const n = Number(String(claim).replace(/[^\d.]/g, ""));
  if (!isFinite(n)) return null;
  for (const m of w.matchAll(STATED_RATE)) {
    if (Math.abs(Number(m[1].replace(/,/g, "")) - n) < 1e-9) return dim([m[2].replace(/s$/, "")], [m[3]]);
  }
  return null;
}

/** What dimension does the text around a claim say the claim has? */
export function claimDimension(claim: string, window: string) {
  const w = window.toLowerCase();
  if (/%|per cent|percent/i.test(claim)) return dim(["percent"]);
  const isMoney = /\$|\bcost|\bspend|\bprofit|\brevenue|\bmargin|\bwage|\bsaving|\bcontribution|\bvalue|\bprice|\bfee/i.test(claim + " " + w);
  const base = isMoney ? ["currency"] : [];
  if (!base.length) {
    const rate = statedRateFor(claim, w);
    if (rate) return rate;
  }
  if (!base.length) return null;
  if (/\ba? ?quarter|quarterly|\/quarter|per quarter/.test(w)) return dim(base, ["quarter"]);
  if (/\ba? ?month|monthly|\/month|per month|a month/.test(w)) return dim(base, ["month"]);
  if (/\ba? ?week|weekly|\/week|per week|a week/.test(w)) return dim(base, ["week"]);
  if (/\ba? ?year|annual|annually|\/year|per year|per annum/.test(w)) return dim(base, ["year"]);
  return dim(base);
}

const CLAIM = /(\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|per cent|percent)|\b\d[\d,]{2,}(?:\.\d+)?\b)/gi;

function numberOf(raw: string) {
  const m = String(raw).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export interface ClaimVerdictV2 {
  claim: string;
  support: string;
  basis: string | null;
  claimDim: string | null;
  hedged: boolean;
  derivationCount: number;
}

/**
 * Classify every numeric claim in a piece of reasoning.
 *
 * A claim is supported when a dimensionally valid derivation from the supplied
 * quantities produces it. It is `unsupported_dimension` when a number of that
 * value exists among the evidence but nothing composes to the dimension the
 * claim asserts -- a monthly figure presented as a quarterly one, or a currency
 * figure presented as a rate. That distinction is the point: the old classifier
 * could only say "not found", which is the same answer for an invented number
 * and for a unit error, and they are different mistakes.
 */
export function classifyClaimsV2(text: string, supplied: Quantity[]): ClaimVerdictV2[] {
  const source = String(text || "");
  const out: ClaimVerdictV2[] = [];
  const seen = new Set<string>();

  for (const m of source.matchAll(CLAIM)) {
    const claim = m[0].trim();
    const n = numberOf(claim);
    if (n === null) continue;
    const key = claim.replace(/[\s,$]/g, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const at = m.index ?? 0;
    const window = source.slice(Math.max(0, at - 110), Math.min(source.length, at + 110));
    const hedged = HEDGE.test(window);
    const wanted = claimDimension(claim, window);

    const exact = supplied.find((q) => Math.abs(q.value - n) < 1e-9);
    if (exact && (!wanted || dimEqual(exact.dim, wanted))) {
      out.push({ claim, support: "supported_exact", basis: exact.label, claimDim: wanted ? dimToString(wanted) : null, hedged, derivationCount: 1 });
      continue;
    }
    if (exact && wanted && !dimEqual(exact.dim, wanted)) {
      // The value exists and the dimension does not match: a unit or period error.
      const d = deriveWithDimension(n, wanted, supplied, { hedged, display: displayTolerance(claim) });
      if (d.best) {
        out.push({ claim, support: "supported_derivation", basis: d.best.how, claimDim: dimToString(wanted), hedged, derivationCount: d.count });
        continue;
      }
      out.push({ claim, support: "unsupported_dimension", basis: exact.label + " is " + dimToString(exact.dim) + ", claimed as " + dimToString(wanted), claimDim: dimToString(wanted), hedged, derivationCount: 0 });
      continue;
    }
    if (!wanted) {
      // No dimension could be read from the context. Fall back to value identity
      // only, which is the weakest claim this module makes.
      const anyValue = supplied.find((q) => Math.abs(q.value - n) < 0.005);
      out.push(anyValue
        ? { claim, support: "supported_equivalent", basis: anyValue.label, claimDim: null, hedged, derivationCount: 1 }
        : { claim, support: "unsupported_value", basis: null, claimDim: null, hedged, derivationCount: 0 });
      continue;
    }

    const disp = displayTolerance(claim);
    const d = deriveWithDimension(n, wanted, supplied, { hedged, display: disp });
    if (d.best) {
      const projected = PROJECTION.test(window);
      const withinStatedPrecision = Math.abs(d.best.value - n) <= disp;
      out.push({
        claim,
        support: projected ? "unsupported_extrapolation" : (withinStatedPrecision ? "supported_derivation" : "supported_rounded"),
        basis: d.best.how + " = " + Number(d.best.value.toFixed(2)),
        claimDim: dimToString(wanted), hedged, derivationCount: d.count,
      });
      continue;
    }
    out.push({ claim, support: "unsupported_value", basis: null, claimDim: dimToString(wanted), hedged, derivationCount: 0 });
  }
  return out;
}

export function unsupportedV2(verdicts: ClaimVerdictV2[]) {
  return verdicts.filter((v) => v.support.startsWith("unsupported"));
}
