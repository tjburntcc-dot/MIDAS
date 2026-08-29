/**
 * The numeric ruler, adversarially.
 *
 * D-35 is replayed exactly: the two figures a Manager was scored as inventing
 * must now be supported, and the coincidence the post-run audit briefly accepted
 * must be rejected. Around them sit the near misses that decide whether this is
 * a ruler or a rubber stamp -- the right arithmetic with the wrong period, the
 * right period with the wrong arithmetic, rounding that is honest and rounding
 * that is not.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  dim, dimEqual, dimToString, deriveWithDimension, classifyClaimsV2, claimDimension,
  PERIOD_FACTORS,
} from "./numeric-support-v2.ts";
import type { Quantity } from "./numeric-support-v2.ts";

/** The pet-sitting case from the Manager lock campaign, as quantities. */
const SITTERS: Quantity[] = [
  { id: "budget", value: 5000, dim: dim(["currency"]), label: "5000 available" },
  { id: "systemCost", value: 4800, dim: dim(["currency"]), label: "4800 booking system" },
  { id: "hoursSaved", value: 5, dim: dim(["hour"], ["week"]), label: "5 hours a week saved" },
  { id: "wage", value: 14, dim: dim(["currency"], ["hour"]), label: "14 an hour" },
  { id: "sitters", value: 12, dim: dim(["sitter"]), label: "12 sitters" },
  { id: "vetting", value: 380, dim: dim(["currency"], ["sitter"]), label: "380 per sitter" },
  { id: "declined", value: 25, dim: dim(["booking"], ["month"]), label: "25 bookings a month declined" },
  { id: "contribution", value: 22, dim: dim(["currency"], ["booking"]), label: "22 net per booking" },
];

/** The framing case: 47 of 60 jobs use the five most-used colours. */
const FRAMING: Quantity[] = [
  { id: "jobs", value: 60, dim: dim(["job"]), label: "60 jobs measured" },
  { id: "delayed", value: 54, dim: dim(["job"]), label: "54 delayed by board ordering" },
  { id: "covered", value: 47, dim: dim(["job"]), label: "47 covered by five colours" },
  { id: "stockCost", value: 380, dim: dim(["currency"]), label: "380 to stock them" },
  { id: "cash", value: 2100, dim: dim(["currency"]), label: "2100 in the account" },
];

describe("dimensions compose the way units do", () => {
  test("a rate times a quantity cancels the shared unit", () => {
    const d = deriveWithDimension(550, dim(["currency"], ["month"]), SITTERS);
    assert.ok(d.best, "25 bookings a month at 22 each is not currency per month");
    assert.match(d.best!.how, /25 bookings a month declined x 22 net per booking/);
  });

  test("period factors are the only multiplier a derivation may introduce", () => {
    for (const p of PERIOD_FACTORS) {
      assert.ok(Object.keys(p.dim).length === 2, p.id + " is not a conversion between two periods");
    }
  });

  test("dimToString reads back", () => {
    assert.equal(dimToString(dim(["currency"], ["quarter"])), "currency/quarter");
    assert.equal(dimToString(dim(["percent"])), "percent");
    assert.equal(dimToString(dim([], [])), "ratio");
  });
});

describe("D-35 replay: the figures a Manager was scored as inventing", () => {
  test("REGRESSION: 25 x 22 x 3 months is 1650 a quarter, and it is supported", () => {
    const d = deriveWithDimension(1650, dim(["currency"], ["quarter"]), SITTERS);
    assert.ok(d.best, "the quarterly contribution is still unsupported");
    assert.ok(d.best!.usedPeriodFactor);
    assert.equal(d.count, 1, "more than one derivation reaches it, so the explanation is not unique");
    assert.match(d.best!.how, /3 months in a quarter/);
  });

  test("REGRESSION: 5 x 14 x 13 weeks is 910 a quarter, and it is supported", () => {
    const d = deriveWithDimension(910, dim(["currency"], ["quarter"]), SITTERS);
    assert.ok(d.best, "the quarterly wage saving is still unsupported");
    assert.equal(d.count, 1);
    assert.match(d.best!.how, /13 weeks in a quarter/);
  });

  test("both read as supported through the full classifier", () => {
    const prose = "Possible net contribution gain of up to 1650/quarter. Saves 910/quarter in wage.";
    const v = classifyClaimsV2(prose, SITTERS);
    const c1 = v.find((x) => x.claim.includes("1650"))!;
    const c2 = v.find((x) => x.claim.includes("910"))!;
    assert.equal(c1.support, "supported_derivation", JSON.stringify(c1));
    assert.equal(c2.support, "supported_derivation", JSON.stringify(c2));
  });
});

describe("coincidence is rejected because it is meaningless, not because it is far away", () => {
  test("REGRESSION: budget divided by headcount does not reach currency per quarter", () => {
    // 5000 / 12 x 4 = 1666.67, which the old brute-force audit accepted as a
    // derivation of 1650. Currency per sitter times a quarters-per-year factor
    // is not currency per quarter, so no tolerance question ever arises.
    const d = deriveWithDimension(1666.67, dim(["currency"], ["quarter"]), SITTERS);
    assert.equal(d.best, null, "a dimensionally meaningless combination was accepted");
  });

  test("REGRESSION: 4/60 as a percentage times 12 does not explain 80 per cent", () => {
    // The other coincidence the audit surfaced. 4 is not a quantity in this case
    // at all, and a percentage cannot absorb a period factor.
    const d = deriveWithDimension(80, dim(["percent"]), FRAMING);
    if (d.best) assert.match(d.best.how, /47 covered by five colours \/ 60 jobs measured/, "an unrelated ratio was accepted");
  });

  test("an arbitrary number reaches nothing", () => {
    assert.equal(deriveWithDimension(7331, dim(["currency"]), SITTERS).best, null);
    assert.equal(deriveWithDimension(31, dim(["percent"]), SITTERS).best, null);
  });
});

describe("periods must be the right periods", () => {
  test("25 x 22 x 4 is not a quarter", () => {
    // 2200. Four of something per quarter is not a period this vocabulary has.
    const d = deriveWithDimension(2200, dim(["currency"], ["quarter"]), SITTERS);
    assert.equal(d.best, null, "a four-month quarter was accepted");
  });

  test("5 x 14 x 12 is not a thirteen-week quarter", () => {
    // 840, claimed as quarterly. Twelve is months per year, and weeks do not
    // convert to quarters through it.
    const d = deriveWithDimension(840, dim(["currency"], ["quarter"]), SITTERS);
    assert.equal(d.best, null, "a twelve-week quarter was accepted");
  });

  test("a monthly figure presented as quarterly is a dimension error, not an invention", () => {
    const v = classifyClaimsV2("Contribution is 550/quarter from the declined bookings.", SITTERS);
    const c = v.find((x) => x.claim.includes("550"));
    assert.ok(c);
    assert.equal(c!.support, "unsupported_value", JSON.stringify(c));
  });

  test("the same figure with the right period is supported", () => {
    const v = classifyClaimsV2("Contribution is 550 per month from the declined bookings.", SITTERS);
    const c = v.find((x) => x.claim.includes("550"))!;
    assert.equal(c.support, "supported_derivation");
  });
});

describe("rounding is allowed when it is declared and not otherwise", () => {
  test("47 of 60 reported as approximately 80 per cent is supported", () => {
    const v = classifyClaimsV2("Removes delay for about 80% of jobs.", FRAMING);
    const c = v.find((x) => x.claim.includes("80"))!;
    assert.equal(c.hedged, true);
    assert.equal(c.support, "supported_rounded", JSON.stringify(c));
  });

  test("REGRESSION: the same figure stated flatly is not supported", () => {
    const v = classifyClaimsV2("Removes delay for 80% of jobs.", FRAMING);
    const c = v.find((x) => x.claim.includes("80"))!;
    assert.equal(c.hedged, false);
    assert.equal(c.support, "unsupported_value", "an undeclared rounding passed as exact");
  });

  test("a hedge does not license an arbitrary number", () => {
    const v = classifyClaimsV2("Removes delay for about 95% of jobs.", FRAMING);
    const c = v.find((x) => x.claim.includes("95"))!;
    assert.equal(c.support, "unsupported_value", "hedging turned 78 per cent into 95 per cent");
  });

  test("and the exact ratio is supported without any hedge", () => {
    const v = classifyClaimsV2("The five colours cover 78.33% of jobs.", FRAMING);
    const c = v.find((x) => x.claim.includes("78"))!;
    assert.ok(c.support.startsWith("supported"), JSON.stringify(c));
  });
});

describe("what the classifier reads from context", () => {
  test("a currency claim with a period takes that period", () => {
    assert.ok(dimEqual(claimDimension("1650", "gain of up to 1650/quarter in contribution")!, dim(["currency"], ["quarter"])));
    assert.ok(dimEqual(claimDimension("$550", "roughly $550 per month of margin")!, dim(["currency"], ["month"])));
  });

  test("a percentage is a percentage whatever surrounds it", () => {
    assert.ok(dimEqual(claimDimension("80%", "about 80% of jobs")!, dim(["percent"])));
  });

  test("a bare count has no dimension the classifier will guess at", () => {
    assert.equal(claimDimension("1200", "1200 episodes in the catalogue"), null);
  });
});

describe("the classifier does not reject everything", () => {
  test("a figure quoted exactly from the evidence passes", () => {
    const v = classifyClaimsV2("The system costs 4800 and there is 5000 available.", SITTERS);
    for (const c of v) assert.ok(c.support.startsWith("supported"), JSON.stringify(c));
  });

  test("REGRESSION: an invented conversion rate is still caught", () => {
    const v = classifyClaimsV2("Assuming a 30% conversion rate, this yields 1500 per month.", SITTERS);
    const c = v.find((x) => x.claim.includes("30"))!;
    assert.equal(c.support, "unsupported_value");
  });

  test("REGRESSION: an unsupported annualisation is caught as extrapolation or invention", () => {
    const v = classifyClaimsV2("Lifetime value of the cohort is 19800 per year.", SITTERS);
    const c = v.find((x) => x.claim.includes("19800"))!;
    assert.ok(c.support.startsWith("unsupported"), JSON.stringify(c));
  });

  test("every verdict reports how many derivations reached it", () => {
    const v = classifyClaimsV2("Contribution of 1650/quarter.", SITTERS);
    for (const c of v) assert.equal(typeof c.derivationCount, "number");
  });
});
