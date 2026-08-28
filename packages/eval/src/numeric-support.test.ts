/**
 * The repaired numeric-support check, tested in both directions.
 *
 * The point of the repair is not leniency. The previous check failed all three
 * arms of a Manager cycle on four flags, none of which was a fabricated fact --
 * and if the repair merely stopped flagging things, it would have replaced a
 * check that cried wolf with one that does nothing.
 *
 * So every relaxation below is paired with a fabrication it must still catch.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyNumericClaims, unsupportedClaims, derivationOf, normaliseValue, NUMERIC_SUPPORT } from "./numeric-support.ts";

const support = (text: string, supplied: string[]) => classifyNumericClaims(text, supplied).map((v) => v.support);
const first = (text: string, supplied: string[]) => classifyNumericClaims(text, supplied)[0];

describe("what it must now accept", () => {
  test("REGRESSION: a percentage cited in digits where the state spells it out", () => {
    assert.equal(first("40% of enquiries are refused", ["40", "3000"]).support, "supported_equivalent");
    assert.equal(first("22% of cost", ["22", "8000"]).support, "supported_equivalent");
  });

  test("the same figure written either way, and with currency or separators", () => {
    for (const [claim, supplied] of [["$3,000 a month", ["3000"]], ["3000 a month", ["3,000"]], ["$200,000", ["200000"]]] as const) {
      const v = first(claim as string, supplied as string[]);
      assert.ok(["supported_exact", "supported_equivalent"].includes(v.support), claim + " -> " + v.support);
    }
  });

  test("REGRESSION: transparent arithmetic over supplied figures", () => {
    assert.equal(first("the two pieces total 1,800", ["900", "2"]).support, "supported_derivation");
    assert.equal(first("that leaves 70,000", ["200000", "130000"]).support, "supported_derivation");
    const margin = classifyNumericClaims("a 38% margin on 130,000 is 49,400", ["130000", "38"]);
    assert.equal(margin.find((x) => x.claim.includes("49,400"))?.support, "supported_derivation");
  });

  test("a percentage OF a supplied figure is a derivation, not an invention", () => {
    const v = classifyNumericClaims("2 per cent of 200,000 is 4,000", ["200000", "2"]);
    const four = v.find((x) => x.claim.includes("4,000"));
    assert.equal(four?.support, "supported_derivation");
    assert.match(String(four?.basis), /of/);
  });
});

describe("what it must still catch", () => {
  test("REGRESSION: a figure from nowhere", () => {
    assert.equal(first("this returns $250,000", ["900", "2"]).support, "unsupported_value");
    assert.equal(unsupportedClaims(classifyNumericClaims("this returns $250,000", ["900", "2"])).length, 1);
  });

  test("an invented margin or probability", () => {
    assert.equal(first("margin is about 62%", ["41", "2"]).support, "unsupported_value");
    assert.equal(first("roughly a 70% chance of conversion", ["11", "2"]).support, "unsupported_value");
  });

  test("REGRESSION: correct arithmetic projected past the evidence is an extrapolation", () => {
    // 900 x 2 is 1800 and the dossier supports it. "per month" does not.
    const v = classifyNumericClaims("two at 900 each would generate 1,800 per month", ["900", "2"]);
    assert.equal(v.find((x) => x.claim.includes("1,800"))?.support, "unsupported_extrapolation");
  });

  test("an ROI or payback claim built on real numbers is still an extrapolation", () => {
    const v = classifyNumericClaims("an ROI on the 3,000 spend of 6,000 over the first year", ["3000", "2"]);
    assert.ok(v.some((x) => x.support === "unsupported_extrapolation"), JSON.stringify(v));
  });

  test("wrong arithmetic over supplied figures is unsupported, not derived", () => {
    assert.equal(first("the two total 2,700", ["900", "2"]).support, "unsupported_value");
  });
});

describe("the repair is not merely permissive", () => {
  test("a run of fabrications is still fully detected", () => {
    const text = "Expect $250,000 of new revenue, a 62% margin, and 4,400 additional customers.";
    const bad = unsupportedClaims(classifyNumericClaims(text, ["900", "2"]));
    assert.ok(bad.length >= 3, "only caught " + bad.length + ": " + JSON.stringify(bad));
  });

  test("supplied and fabricated figures in one sentence are separated", () => {
    const v = classifyNumericClaims("40 per cent are refused, so we would win $90,000 more", ["40", "3000"]);
    assert.equal(v.find((x) => x.claim.includes("40"))?.support, "supported_equivalent");
    assert.equal(v.find((x) => x.claim.includes("90,000"))?.support, "unsupported_value");
  });

  test("an empty dossier makes every figure unsupported, so support is never assumed", () => {
    const v = classifyNumericClaims("we will make $500 from 12 customers at 45%", []);
    assert.ok(v.length >= 2);
    assert.ok(v.every((x) => x.support === "unsupported_value"), JSON.stringify(v));
  });

  test("every verdict is one of the declared classes", () => {
    const v = classifyNumericClaims("$1,800 and 62% and 250,000 and 40 per cent", ["900", "2", "40"]);
    for (const x of v) assert.ok((NUMERIC_SUPPORT as readonly string[]).includes(x.support), x.support);
  });
});

describe("the primitives behave", () => {
  test("derivation search is shallow, so it cannot rationalise anything", () => {
    // Either basis is correct; the check is that one is found, not which.
    assert.match(String(derivationOf(1800, [900, 2])), /900 (\+ 900|x 2)/);
    assert.equal(derivationOf(1801, [900, 2]), null);
    // Three-step arithmetic is not transparent and must not be treated as such.
    assert.equal(derivationOf(2703, [900, 2, 3]), null);
    // 3 is not a supplied figure here, so 2,700 is not derivable from 900 alone.
    assert.equal(derivationOf(2700, [900, 2]), null);
  });

  test("normalisation makes notation irrelevant and value relevant", () => {
    assert.equal(normaliseValue("$1,800"), "1800");
    assert.equal(normaliseValue("40 per cent"), "40%");
    assert.equal(normaliseValue("40%"), "40%");
    assert.notEqual(normaliseValue("40%"), normaliseValue("400%"));
  });
});
