/**
 * Is this number supported by what the worker was given?
 *
 * The first version of this check compared the digits in a recommendation
 * against a list of figures from the dossier and called anything unmatched a
 * fabrication. It then failed all three arms of a Manager cycle on four flags,
 * none of which was a fabricated fact:
 *
 *   "40%"    where the state said "40 per cent"
 *   "22%"    the same
 *   "$1,800" where the state gave two pieces of work at 900 each
 *
 * Citing a supplied figure in digits, and adding two supplied figures together,
 * are both things a competent manager does constantly. A check that calls them
 * lies is worse than no check, because it fails honest work and trains everyone
 * to ignore the gate.
 *
 * The repair is not leniency. An unsupported number is still a fabrication, an
 * extrapolation beyond the evidence is still an extrapolation, and both remain
 * detected. What changes is that support now includes equivalent notation and
 * arithmetic that a reader could redo from the dossier in their head.
 */

export const NUMERIC_SUPPORT = [
  "supported_exact",             // the figure appears as given
  "supported_equivalent",        // same value, different notation: 40% for "40 per cent"
  "supported_derivation",        // 2 x 900 = 1800, from figures that were supplied
  "unsupported_value",           // a number that is in no supplied figure and no combination of them
  "unsupported_extrapolation",   // arithmetic over supplied figures projected somewhere the evidence does not reach
] as const;

/** Everything that looks like money, a rate, or a quantity worth checking. */
const CLAIM = /(\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|per cent|percent)|\b\d[\d,]{2,}(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s?(?:x|times)\b)/gi;

/** Words that turn arithmetic into a projection: the same sum, reaching further than the evidence. */
const PROJECTION = /(per (year|month|annum)|annual|annually|over (the )?(next|coming|first)|within (a|the) year|projected|forecast|would (generate|return|yield|produce)|expect(ed)? (to )?(generate|return|yield|earn)|roi|payback|lifetime value|ltv|run.?rate)/i;

export function normaliseValue(raw: string) {
  return String(raw).replace(/\s|,|\$/g, "").replace(/(per cent|percent)/i, "%").toLowerCase();
}

/** Bare digits, so "$1,800" and "1800" and "1,800" all compare equal. */
function digitsOf(raw: string) {
  const m = String(raw).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? m[0] : null;
}

function numberOf(raw: string) {
  const d = digitsOf(raw);
  return d === null ? null : Number(d);
}

/**
 * Can this value be built from the supplied figures by arithmetic a reader could
 * redo without a calculator?
 *
 * Deliberately shallow: pairwise sums, differences and products, a figure times
 * a small whole number, and percentages of a supplied figure. Anything needing
 * more steps than that is not transparent, and calling it transparent would put
 * the check back where it started.
 */
export function derivationOf(target: number, supplied: number[]) {
  // Tight on purpose. A relative tolerance of a tenth of a percent accepted 1,801
  // as a derivation of 900 + 900, and on a figure like 200,000 it would have
  // accepted anything within 200. Business figures are discrete; a number that is
  // nearly right is a different number. Only float artefacts are forgiven.
  const eq = (a: number) => Math.abs(a - target) < 1e-6 || Math.abs(a - target) / Math.max(1, Math.abs(target)) < 1e-9;
  // Both operands must be figures the worker was actually given. An earlier
  // version allowed a supplied figure to be multiplied by any small integer,
  // which made 2,700 a "derivation" of 900 and would have rationalised most
  // numbers. It also allowed a percentage rule with either operand, which turned
  // 90,000 into "3000% of 3000". The adversarial audit caught both.
  for (const a of supplied) {
    if (eq(a)) return "exact";
    for (const b of supplied) {
      if (eq(a + b)) return a + " + " + b;
      if (eq(a - b)) return a + " - " + b;
      if (eq(a * b)) return a + " x " + b;
      if (b !== 0 && eq(a / b)) return a + " / " + b;
      // A percentage only reads as one when the operand could be a percentage.
      if (b <= 100 && eq((a * b) / 100)) return b + "% of " + a;
    }
  }
  return null;
}

export interface ClaimVerdict {
  claim: string;
  support: string;
  basis: string | null;
}

/**
 * Classify every numeric claim in a piece of reasoning.
 *
 * `supplied` is every figure the worker was actually given. A claim is
 * unsupported only when no supplied figure and no shallow combination of them
 * produces it -- and a supported combination becomes an extrapolation when the
 * sentence around it projects the number somewhere the evidence does not go.
 */
export function classifyNumericClaims(text: string, supplied: string[]) {
  const suppliedNums = supplied.map((s) => numberOf(s)).filter((n) => n !== null);
  const suppliedNorm = new Set(supplied.map(normaliseValue));
  const out = [];
  const seen = new Set<string>();
  const source = String(text || "");

  for (const m of source.matchAll(CLAIM)) {
    const claim = m[0].trim();
    const norm = normaliseValue(claim);
    if (seen.has(norm)) continue;
    seen.add(norm);

    if (suppliedNorm.has(norm)) { out.push({ claim, support: "supported_exact", basis: claim }); continue; }

    const n = numberOf(claim);
    if (n === null) continue;

    // Same value, different notation. "40%" for "40 per cent"; "1800" for "1,800".
    if (suppliedNums.some((s) => Math.abs(s - n) < 0.005)) {
      out.push({ claim, support: "supported_equivalent", basis: String(n) });
      continue;
    }

    const basis = derivationOf(n, suppliedNums);
    if (basis) {
      // The window around the claim decides whether the arithmetic stays inside
      // the evidence or is projected past it.
      const at = m.index ?? 0;
      const window = source.slice(Math.max(0, at - 90), Math.min(source.length, at + 90));
      out.push({ claim, support: PROJECTION.test(window) ? "unsupported_extrapolation" : "supported_derivation", basis });
      continue;
    }

    out.push({ claim, support: "unsupported_value", basis: null });
  }
  return out;
}

export function unsupportedClaims(verdicts: ClaimVerdict[]) {
  return verdicts.filter((v) => v.support === "unsupported_value" || v.support === "unsupported_extrapolation");
}
