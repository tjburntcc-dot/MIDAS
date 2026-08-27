/**
 * Estimated live-model spend at ONE FLAT RATE for every model.
 *
 * This is a token-weighted proxy, not a per-model cost. A comparison between two
 * models using this function tracks token count and not dollars, and a mission
 * once nearly claimed a cost advantage on exactly that basis.
 *
 * For anything that compares models or routes work on price, use `model-cost.ts`,
 * which requires a configured rate with provenance and returns COST_NOT_COMPUTED
 * rather than guessing. This function stays for aggregate run budgeting, where a
 * rough single-model total is what is wanted.
 *
 * No secrets stored.
 */

export const DEFAULT_USD_PER_1M_INPUT = 2;
export const DEFAULT_USD_PER_1M_OUTPUT = 8;

export function pricingRates() {
  return {
    inputUsdPer1M: Number(process.env.MIDAS_USD_PER_1M_INPUT ?? DEFAULT_USD_PER_1M_INPUT),
    outputUsdPer1M: Number(process.env.MIDAS_USD_PER_1M_OUTPUT ?? DEFAULT_USD_PER_1M_OUTPUT),
    note: "FLAT RATE across all models. A token-weighted proxy for budgeting a single-model run, not a per-model cost. Cross-model comparison must use model-cost.ts.",
    flatRateAcrossModels: true,
  };
}

export function spendLimits() {
  return {
    maxUsdPerRun: Number(process.env.MIDAS_MAX_USD_PER_RUN ?? 25),
    maxUsdPerDay: Number(process.env.MIDAS_MAX_USD_PER_DAY ?? 100),
  };
}

export function utcDay(iso) {
  return String(iso || new Date().toISOString()).slice(0, 10);
}

export function estimateUsd(inputTokens, outputTokens) {
  const rates = pricingRates();
  const usd =
    (Number(inputTokens || 0) / 1e6) * rates.inputUsdPer1M +
    (Number(outputTokens || 0) / 1e6) * rates.outputUsdPer1M;
  return Math.round(usd * 1e6) / 1e6;
}

export function emptyCost() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usdEstimate: 0,
    aborted: false,
    abortReason: null,
    pricingNote: pricingRates().note,
  };
}

export function addUsage(cost, usage) {
  const inputTokens = Number((usage && usage.inputTokens) || 0);
  const outputTokens = Number((usage && usage.outputTokens) || 0);
  cost.inputTokens += inputTokens;
  cost.outputTokens += outputTokens;
  cost.totalTokens = cost.inputTokens + cost.outputTokens;
  cost.usdEstimate = estimateUsd(cost.inputTokens, cost.outputTokens);
  return cost;
}

export function dayUsd(store, day) {
  if (!store.daySpend) return 0;
  return Number(store.daySpend(day).usd || 0);
}

export function assertWithinBudget(args) {
  const limits = spendLimits();
  const runUsd = Number(args.runUsd || 0);
  const day = dayUsd(args.store, utcDay());
  if (runUsd >= limits.maxUsdPerRun) {
    const err = new Error(
      `BUDGET_ABORT: run estimate $${runUsd.toFixed(4)} reached MIDAS_MAX_USD_PER_RUN=${limits.maxUsdPerRun}`,
    );
    err.code = "BUDGET_ABORT";
    throw err;
  }
  if (day >= limits.maxUsdPerDay) {
    const err = new Error(
      `BUDGET_ABORT: day estimate $${day.toFixed(4)} reached MIDAS_MAX_USD_PER_DAY=${limits.maxUsdPerDay}`,
    );
    err.code = "BUDGET_ABORT";
    throw err;
  }
}
