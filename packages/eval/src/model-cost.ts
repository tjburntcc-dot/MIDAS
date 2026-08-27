/**
 * Model-specific cost, or an honest refusal to state one.
 *
 * The previous mission compared two models, found the stronger one used about a
 * third of the tokens, and correctly withheld the dollar claim: `estimateUsd`
 * applies one flat rate to every model, so the figure tracked token count and
 * not cost. Withholding was right. Leaving the estimator unable to do better is
 * not, because the next comparison will face the same question.
 *
 * The design principle is that a wrong price is worse than no price. A wrong
 * price routes work to the wrong model and looks authoritative doing it, whereas
 * a missing price is visibly missing and forces someone to go and look.
 *
 * So the table starts EMPTY. Nothing here encodes a rate from memory, because a
 * remembered price has no effective date and no source, and provider pricing
 * changes. A model with no entry returns COST_NOT_COMPUTED with its token counts
 * intact, which is the true state of knowledge rather than a placeholder.
 */

export interface ModelPrice {
  model: string;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  /** Optional, where the provider distinguishes them. */
  cachedInputUsdPer1M?: number;
  reasoningUsdPer1M?: number;
  /** Where this came from. A price with no source is a rumour. */
  source: string;
  /** When it was in force. A price with no date cannot be known to be current. */
  effectiveDate: string;
}

export const COST_STATUS = ["computed", "COST_NOT_COMPUTED"] as const;

/**
 * Prices in force, from configuration only.
 *
 * Deliberately empty in code. Populating it is an act of looking something up,
 * which is exactly the act that must not be skipped.
 */
export function loadPrices(raw?: string): Record<string, ModelPrice> {
  const text = raw ?? process.env.MIDAS_MODEL_PRICES ?? "";
  if (!text.trim()) return {};
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return {}; }
  const out: Record<string, ModelPrice> = {};
  for (const p of parsed.prices || []) {
    // A price missing its provenance or date is not loaded. An undated price is
    // indistinguishable from a stale one.
    if (!p || !p.model || !p.source || !p.effectiveDate) continue;
    if (typeof p.inputUsdPer1M !== "number" || typeof p.outputUsdPer1M !== "number") continue;
    out[p.model] = p;
  }
  return out;
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

/**
 * Cost for one model's usage, or a refusal.
 *
 * Token counts are always returned, because they are known and useful on their
 * own. The refusal is about dollars, not about measurement.
 */
export function costFor(u: Usage, prices: Record<string, ModelPrice>) {
  const tokens = {
    input: Number(u.inputTokens || 0),
    output: Number(u.outputTokens || 0),
    cachedInput: Number(u.cachedInputTokens || 0),
    reasoning: Number(u.reasoningTokens || 0),
  };
  const total = tokens.input + tokens.output;
  const price = prices[u.model];
  if (!price) {
    return {
      model: u.model, status: "COST_NOT_COMPUTED", usd: null, tokens, totalTokens: total,
      reason: "No price on record for " + u.model + ". A remembered rate would have no source and no effective date, and a wrong price routes work to the wrong model while looking authoritative.",
      provenance: null,
    };
  }
  const billableInput = Math.max(0, tokens.input - tokens.cachedInput);
  let usd = (billableInput / 1e6) * price.inputUsdPer1M + (tokens.output / 1e6) * price.outputUsdPer1M;
  if (tokens.cachedInput && price.cachedInputUsdPer1M != null) {
    usd += (tokens.cachedInput / 1e6) * price.cachedInputUsdPer1M;
  } else if (tokens.cachedInput) {
    usd += (tokens.cachedInput / 1e6) * price.inputUsdPer1M;
  }
  if (tokens.reasoning && price.reasoningUsdPer1M != null) {
    usd += (tokens.reasoning / 1e6) * price.reasoningUsdPer1M;
  }
  return {
    model: u.model, status: "computed", usd: Number(usd.toFixed(6)), tokens, totalTokens: total,
    reason: "Priced from configured rates.",
    provenance: { source: price.source, effectiveDate: price.effectiveDate },
  };
}

/**
 * Compare two configurations economically.
 *
 * Refuses to produce a cost comparison unless BOTH sides are priced. A
 * comparison where one side is unknown is not a cheaper-or-dearer statement, and
 * presenting it as one is how the last mission would have gone wrong had it not
 * withheld.
 */
export function compareCost(a: ReturnType<typeof costFor>, b: ReturnType<typeof costFor>) {
  const tokenRatio = b.totalTokens > 0 ? Number((a.totalTokens / b.totalTokens).toFixed(3)) : null;
  if (a.status !== "computed" || b.status !== "computed") {
    const missing = [a.status !== "computed" ? a.model : null, b.status !== "computed" ? b.model : null].filter(Boolean);
    return {
      status: "COST_NOT_COMPUTED",
      costRatio: null, tokenRatio,
      cheaper: null,
      reason: "No price on record for " + missing.join(" and ") + ". Token counts are comparable and dollars are not; token count is not dollar cost.",
    };
  }
  return {
    status: "computed",
    costRatio: b.usd > 0 ? Number((a.usd / b.usd).toFixed(3)) : null,
    tokenRatio,
    cheaper: a.usd === b.usd ? null : (a.usd < b.usd ? a.model : b.model),
    reason: "Both sides priced from configured rates with provenance.",
  };
}

/**
 * The economic question, which is not which model is cheapest.
 *
 * A stronger model costing more can dominate easily if it removes a
 * commercially dangerous failure, and this returns the comparison in those terms
 * rather than in dollars alone. Where cost is unknown it says which way the
 * decision would have to go for the unknown to matter, which is usually more
 * useful than the price would have been.
 */
export function economicComparison(args: {
  a: { label: string; cost: ReturnType<typeof costFor>; criticalFailures: number; qualityScore: number };
  b: { label: string; cost: ReturnType<typeof costFor>; criticalFailures: number; qualityScore: number };
  costOfOneCriticalFailureUsd?: number | null;
}) {
  const cmp = compareCost(args.a.cost, args.b.cost);
  const failureDelta = args.a.criticalFailures - args.b.criticalFailures;
  const qualityDelta = Number((args.a.qualityScore - args.b.qualityScore).toFixed(2));

  const notes: string[] = [];
  if (failureDelta !== 0) {
    const better = failureDelta < 0 ? args.a.label : args.b.label;
    notes.push(better + " produced " + Math.abs(failureDelta) + " fewer critical failure(s), which is the dimension that decides commercial trust.");
  }
  if (cmp.status !== "computed" && failureDelta !== 0 && args.costOfOneCriticalFailureUsd == null) {
    notes.push("Cost is unknown, but a critical failure difference usually dominates a per-call price difference at this volume. Establishing the price would change the decision only if the dearer option were dramatically dearer.");
  }
  return {
    cost: cmp, failureDelta, qualityDelta, notes,
    recommendation: failureDelta !== 0
      ? (failureDelta < 0 ? args.a.label : args.b.label)
      : qualityDelta !== 0 ? (qualityDelta > 0 ? args.a.label : args.b.label)
        : cmp.cheaper,
    basis: failureDelta !== 0 ? "critical_failures"
      : qualityDelta !== 0 ? "quality"
        : cmp.status === "computed" ? "cost" : "undetermined",
  };
}
