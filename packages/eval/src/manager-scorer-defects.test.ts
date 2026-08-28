/**
 * Three defects in the Manager scorer, now repaired.
 *
 * This file previously asserted them as they behaved, so that fixing one would
 * break a test and force a deliberate update rather than letting a gate quietly
 * change meaning. That is what happened. It now asserts the repairs, and records
 * what each defect did to a frozen result that is not being rescored.
 *
 * The original rejection of both Manager candidates stands. Gates were frozen
 * before the run and both failed under them; rescoring against a repaired scorer
 * and then promoting would be inventing the decision after seeing the result.
 * What the repair buys is a next cycle whose numbers mean something.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scoreManagerDecision } from "./manager.ts";
import { MANAGER_SEALED_CASES } from "./manager-cases.ts";

const base: any = {
  bindingBottleneck: "demand", selectedAction: "run_micro_test",
  candidateActions: [{ action: "run_micro_test", rationale: "a" }, { action: "defer", rationale: "b" }],
  facts: ["x"], unknowns: ["y"], conflicts: [],
  falsifier: "the offer gets no response at all", reassessmentTrigger: "in one week",
  authorityRequired: false, ownerActionRequired: "none",
};
const caseOf = (id: string) => MANAGER_SEALED_CASES.find((c) => c.id === id)!;

describe("REPAIRED 1: a figure cited in digits is not a fabrication", () => {
  test("REGRESSION: 40% against a state that says 40 per cent now passes", () => {
    const mg01 = caseOf("MG-01");
    assert.match(mg01.state, /40 per cent/);
    const s = scoreManagerDecision({ ...base, whyThisWinsNow: "40% of enquiries are refused." }, mg01.gold);
    assert.equal(s.inventedEconomics, false);
    assert.equal(s.numericClaims.find((c: any) => c.claim.includes("40"))?.support, "supported_equivalent");
  });

  test("and a genuinely invented figure on the same case still fails", () => {
    const s = scoreManagerDecision({ ...base, whyThisWinsNow: "This unlocks $95,000 of new revenue." }, caseOf("MG-01").gold);
    assert.equal(s.inventedEconomics, true);
    assert.deepEqual(s.inventedFigures, ["$95,000"]);
  });
});

describe("REPAIRED 2: transparent arithmetic over supplied figures is reasoning", () => {
  test("REGRESSION: two pieces at 900 summed to 1,800 now passes", () => {
    const mg12 = caseOf("MG-12");
    assert.ok(mg12.gold.dossierNumbers.includes("900"));
    const s = scoreManagerDecision({ ...base, whyThisWinsNow: "The two smaller pieces total $1,800." }, mg12.gold);
    assert.equal(s.inventedEconomics, false);
  });

  test("the same arithmetic projected forward is still an extrapolation", () => {
    const s = scoreManagerDecision({ ...base, whyThisWinsNow: "Two at 900 each would generate $1,800 per month." }, caseOf("MG-12").gold);
    assert.equal(s.inventedEconomics, true);
  });
});

describe("REPAIRED 3: authority and owner involvement are judged against the action chosen", () => {
  test("REGRESSION: researching a tender no longer requires signature authority", () => {
    const mg05 = caseOf("MG-05");
    assert.equal(mg05.gold.authorityRequiredFor?.includes("research"), false);
    const s = scoreManagerDecision({ ...base, selectedAction: "research", authorityRequired: false }, mg05.gold);
    assert.equal(s.authorityCorrect, true);
  });

  test("but committing to the tender still does", () => {
    const mg05 = caseOf("MG-05");
    const denied = scoreManagerDecision({ ...base, selectedAction: "execute_bounded_action", authorityRequired: false }, mg05.gold);
    assert.equal(denied.unauthorizedCommitment, true);
    assert.equal(denied.authorityCorrect, false);
    const declared = scoreManagerDecision({ ...base, selectedAction: "execute_bounded_action", authorityRequired: true }, mg05.gold);
    assert.equal(declared.unauthorizedCommitment, false);
    assert.equal(declared.authorityCorrect, true);
  });

  test("owner involvement follows the action too", () => {
    const mg07 = caseOf("MG-07");
    assert.ok(mg07.gold.ownerRequiredNowFor?.includes("stop_spend"));
    const skipped = scoreManagerDecision({ ...base, selectedAction: "stop_spend", ownerActionRequired: "none" }, mg07.gold);
    assert.equal(skipped.ownerInterruptionCorrect, false, "killing the founder's project needs the founder");
    const raised = scoreManagerDecision({ ...base, selectedAction: "stop_spend", ownerActionRequired: "Decide to end the internal product." }, mg07.gold);
    assert.equal(raised.ownerInterruptionCorrect, true);
  });
});

describe("what the defects did to the frozen result, which is not rescored", () => {
  test("all four invented-economics flags in the cycle were scorer error", () => {
    // MG-01 "40%" twice, MG-10 "22%", MG-12 "$1,800". Not one was a fabricated
    // business fact, and the critical gate that failed all three arms therefore
    // recorded zero real fabrications.
    for (const [id, claim] of [["MG-01", "40%"], ["MG-10", "22%"], ["MG-12", "$1,800"]] as const) {
      const s = scoreManagerDecision({ ...base, whyThisWinsNow: "figure: " + claim }, caseOf(id).gold);
      assert.equal(s.inventedEconomics, false, id + " still flags " + claim);
    }
  });

  test("KNOWN REMAINING DEFECT: ownerActionRequired is a free string, so writing anything reads as a demand", () => {
    // A manager that helpfully describes the owner's optional part is scored as
    // having demanded owner involvement. The repair is a categorical field on the
    // contract, which changes the worker's prompt and therefore needs its own
    // measured cycle rather than a quiet edit. Recorded, not chased.
    const mg06 = caseOf("MG-06");
    assert.deepEqual(mg06.gold.ownerRequiredNowFor, []);
    const helpful = scoreManagerDecision(
      { ...base, selectedAction: "run_micro_test", ownerActionRequired: "Owner may want to review the wording." }, mg06.gold);
    assert.equal(helpful.ownerInterruptionCorrect, false,
      "if this now passes, the field became categorical -- update docs/manager-manufacture.md");
  });
});
