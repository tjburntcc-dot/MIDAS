/**
 * Guards for model cost accounting.
 *
 * The failure this prevents: claiming one model is cheaper than another on the
 * strength of a flat rate applied to both. A wrong price is worse than no price,
 * because it routes work to the wrong model and looks authoritative doing it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadPrices, costFor, compareCost, economicComparison } from "./model-cost.ts";

const PRICED = JSON.stringify({
  prices: [
    { model: "model-a", inputUsdPer1M: 2, outputUsdPer1M: 8, source: "provider pricing page", effectiveDate: "2026-08-01" },
    { model: "model-b", inputUsdPer1M: 10, outputUsdPer1M: 30, source: "provider pricing page", effectiveDate: "2026-08-01" },
  ],
});

describe("no price is invented", () => {
  test("REGRESSION: the table is empty unless configured", () => {
    assert.deepEqual(loadPrices(""), {}, "a default price is a remembered price, and a remembered price has no source");
  });

  test("an unpriced model returns COST_NOT_COMPUTED with its tokens intact", () => {
    const c = costFor({ model: "unknown-model", inputTokens: 10000, outputTokens: 2000 }, {});
    assert.equal(c.status, "COST_NOT_COMPUTED");
    assert.equal(c.usd, null);
    assert.equal(c.totalTokens, 12000, "measurement is still known; only the dollars are not");
    assert.match(c.reason, /routes work to the wrong model while looking authoritative/);
  });

  test("a price without provenance or a date is refused", () => {
    const noSource = JSON.stringify({ prices: [{ model: "m", inputUsdPer1M: 1, outputUsdPer1M: 2, effectiveDate: "2026-01-01" }] });
    const noDate = JSON.stringify({ prices: [{ model: "m", inputUsdPer1M: 1, outputUsdPer1M: 2, source: "somewhere" }] });
    assert.deepEqual(loadPrices(noSource), {}, "a price with no source is a rumour");
    assert.deepEqual(loadPrices(noDate), {}, "an undated price cannot be known to be current");
  });

  test("malformed configuration yields no prices rather than partial ones", () => {
    assert.deepEqual(loadPrices("{not json"), {});
  });

  test("a configured price computes, and carries where it came from", () => {
    const c = costFor({ model: "model-a", inputTokens: 1e6, outputTokens: 1e6 }, loadPrices(PRICED));
    assert.equal(c.status, "computed");
    assert.equal(c.usd, 10);
    assert.equal(c.provenance.source, "provider pricing page");
    assert.equal(c.provenance.effectiveDate, "2026-08-01");
  });

  test("cached input is billed at the cached rate where one is given", () => {
    const prices = loadPrices(JSON.stringify({
      prices: [{ model: "m", inputUsdPer1M: 10, outputUsdPer1M: 10, cachedInputUsdPer1M: 1, source: "s", effectiveDate: "2026-08-01" }],
    }));
    const c = costFor({ model: "m", inputTokens: 1e6, outputTokens: 0, cachedInputTokens: 1e6 }, prices);
    assert.equal(c.usd, 1, "all input was cached, so none should be billed at the full rate");
  });
});

describe("a comparison needs both sides priced", () => {
  test("REGRESSION: one unpriced side refuses the comparison", () => {
    const prices = loadPrices(PRICED);
    const a = costFor({ model: "model-a", inputTokens: 1000, outputTokens: 500 }, prices);
    const b = costFor({ model: "unpriced", inputTokens: 3000, outputTokens: 1500 }, prices);
    const cmp = compareCost(a, b);
    assert.equal(cmp.status, "COST_NOT_COMPUTED");
    assert.equal(cmp.cheaper, null);
    assert.match(cmp.reason, /token count is not dollar cost/);
    assert.ok(cmp.tokenRatio != null, "tokens are still comparable and still reported");
  });

  test("both priced gives a real ratio", () => {
    const prices = loadPrices(PRICED);
    const a = costFor({ model: "model-a", inputTokens: 1e6, outputTokens: 1e6 }, prices);
    const b = costFor({ model: "model-b", inputTokens: 1e6, outputTokens: 1e6 }, prices);
    const cmp = compareCost(a, b);
    assert.equal(cmp.status, "computed");
    assert.equal(cmp.cheaper, "model-a");
  });
});

describe("the economic question is not which model is cheapest", () => {
  test("REGRESSION: fewer critical failures wins even when the cost is unknown", () => {
    // This is the actual decision from the last mission: the stronger model
    // removed a fabrication and its price was not on record.
    const r = economicComparison({
      a: { label: "stronger", cost: costFor({ model: "unpriced-strong", inputTokens: 3000, outputTokens: 800 }, {}), criticalFailures: 0, qualityScore: 70 },
      b: { label: "current", cost: costFor({ model: "unpriced-current", inputTokens: 9000, outputTokens: 2400 }, {}), criticalFailures: 1, qualityScore: 62 },
    });
    assert.equal(r.recommendation, "stronger");
    assert.equal(r.basis, "critical_failures");
    assert.equal(r.cost.status, "COST_NOT_COMPUTED");
    assert.match(r.notes.join(" "), /decides commercial trust/);
    assert.match(r.notes.join(" "), /would change the decision only if/);
  });

  test("with failures equal, quality decides before cost", () => {
    const prices = loadPrices(PRICED);
    const r = economicComparison({
      a: { label: "a", cost: costFor({ model: "model-a", inputTokens: 100, outputTokens: 100 }, prices), criticalFailures: 0, qualityScore: 80 },
      b: { label: "b", cost: costFor({ model: "model-b", inputTokens: 100, outputTokens: 100 }, prices), criticalFailures: 0, qualityScore: 60 },
    });
    assert.equal(r.recommendation, "a");
    assert.equal(r.basis, "quality");
  });

  test("with failures and quality equal, cost decides if it is known", () => {
    const prices = loadPrices(PRICED);
    const r = economicComparison({
      a: { label: "a", cost: costFor({ model: "model-a", inputTokens: 100, outputTokens: 100 }, prices), criticalFailures: 0, qualityScore: 70 },
      b: { label: "b", cost: costFor({ model: "model-b", inputTokens: 100, outputTokens: 100 }, prices), criticalFailures: 0, qualityScore: 70 },
    });
    assert.equal(r.basis, "cost");
    assert.equal(r.recommendation, "model-a");
  });
});

describe("the module encodes no prices of its own", () => {
  test("REGRESSION: no numeric rate appears in the source", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "model-cost.ts"), "utf8");
    // Any per-million figure written into the module would be a remembered price.
    const suspicious = src.match(/UsdPer1M\s*[:=]\s*[0-9]/g) || [];
    assert.deepEqual(suspicious, [], "a rate literal in the module is a price with no source: " + suspicious.join(", "));
  });
});
