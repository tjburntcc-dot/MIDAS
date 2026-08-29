/**
 * The fitness set, and why it did not run.
 *
 * The substrate cleared its validation and the gold did not clear its review.
 * That is the first time in this repository a defect of this class has been
 * caught before the money was spent rather than after, and it is worth pinning
 * both halves: the set is repaired where the correction was mechanical, and it
 * is blocked where it is not.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { MANAGER_FITNESS_CASES, fitnessCoverage, REQUIRED_FITNESS_COMPETENCIES } from "./manager-fitness-cases.ts";
import { MANAGER_LOCK_CASES } from "./manager-lock-cases.ts";
import { MANAGER_SEALED_CASES } from "./manager-cases.ts";
import { auditGold, reviewPayloadFor, reviewCoverageGap, gatedGoldFields, freezeBlockers } from "./judgment-gold.ts";
import { RECORDED_DEFECTS } from "./experiment-defects.ts";

const repoFile = (rel: string) => new URL("../../../" + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const load = (f: string) => (existsSync(repoFile("var/state/" + f)) ? JSON.parse(readFileSync(repoFile("var/state/" + f), "utf8")) : null);
const review = load("manager-fitness-gold-review.json");
const pre = load("manager-fitness-preflight.json");

describe("the set is fresh and structurally sound", () => {
  test("twelve shapes, twelve trades, nothing reused", () => {
    const c = fitnessCoverage();
    assert.equal(c.cases, 12);
    assert.deepEqual(REQUIRED_FITNESS_COMPETENCIES.filter((k) => !c.competencies.includes(k)), []);
    const priorBiz = new Set([...MANAGER_LOCK_CASES, ...MANAGER_SEALED_CASES].map((x) => x.business));
    const priorIds = new Set([...MANAGER_LOCK_CASES, ...MANAGER_SEALED_CASES].map((x) => x.id));
    for (const g of MANAGER_FITNESS_CASES) {
      assert.ok(!priorBiz.has(g.business), g.caseId + " reuses a business");
      assert.ok(!priorIds.has(g.caseId), g.caseId + " collides with an earlier set");
    }
  });

  test("most cases have more than one defensible action", () => {
    assert.ok(fitnessCoverage().casesWithMultipleAcceptable >= 8);
    assert.equal(fitnessCoverage().researchOnlyCases, 0);
  });

  test("BLOCKING: every case passes the structural gold audit", () => {
    for (const g of MANAGER_FITNESS_CASES) {
      assert.deepEqual(auditGold(g), [], g.caseId + " has structural problems");
    }
  });

  test("BLOCKING: the generated review payload covers every gated field", () => {
    for (const g of MANAGER_FITNESS_CASES) {
      assert.deepEqual(reviewCoverageGap(reviewPayloadFor(g).fieldsShown), [], g.caseId);
    }
  });
});

describe("the review caught before spend what the last campaign caught after", () => {
  test("every gated field on every case received a verdict", { skip: !review }, () => {
    assert.equal(review.fieldVerdicts.length, gatedGoldFields().length * MANAGER_FITNESS_CASES.length);
    assert.equal(review.unjudgedFields.length, 0);
  });

  test("REGRESSION: authorityByAction was returned WRONG on nine of twelve cases", { skip: !review }, () => {
    // D-39, and the same shape as D-36. The previous review never saw this field.
    const wrong = review.fieldVerdicts.filter((f: any) => f.field === "authorityByAction" && f.verdict === "WRONG");
    assert.equal(wrong.length, 9);
    assert.ok(wrong.some((f: any) => /no.*authority|not stated|invented/i.test(f.comment)));
  });

  test("the invented authority requirements were removed, adopting the correction verbatim", { skip: !review }, () => {
    const wrongCases = new Set(review.fieldVerdicts
      .filter((f: any) => f.field === "authorityByAction" && f.verdict === "WRONG").map((f: any) => f.caseId));
    for (const g of MANAGER_FITNESS_CASES) {
      if (!wrongCases.has(g.caseId)) continue;
      for (const a of g.authorityByAction) {
        assert.equal(a.authorityRequired, false, g.caseId + " still requires authority the case does not state");
        assert.match(a.because, /states no authority or approval constraint/);
      }
    }
  });

  test("the one case that does state an authority constraint still requires it", () => {
    const mf07 = MANAGER_FITNESS_CASES.find((g) => g.caseId === "MF-07")!;
    assert.match(mf07.state, /authority to sign any agreement or lodge any bond with the owner alone/);
    assert.equal(mf07.authorityByAction.find((a) => a.action === "request_owner_authority")!.authorityRequired, true);
  });

  test("the omitted quantities were added", { skip: !review }, () => {
    assert.ok(fitnessCoverage().quantities >= 78);
    for (const g of MANAGER_FITNESS_CASES) assert.ok(g.supportedQuantities.length >= 4, g.caseId);
  });

  test("D-39 and D-40 are recorded, and both were caught before spending", () => {
    for (const id of ["D-39", "D-40"]) {
      const d = RECORDED_DEFECTS.find((x) => x.id === id)!;
      assert.ok(d, id);
      assert.equal(d.caughtBeforeSpend, true);
      assert.equal(d.guardReusable, true);
    }
    assert.equal(RECORDED_DEFECTS.find((x) => x.id === "D-39")!.changedTheDecision, true);
  });
});

describe("the campaign did not run, and the record says why", () => {
  test("REGRESSION: preflight refused it, and the reviewed fields covered the gated ones", { skip: !pre }, () => {
    assert.equal(pre.status, "PREFLIGHT_REFUSED");
    assert.equal(pre.modelCalls, 0);
    const checks = pre.preflight.blocking.map((f: any) => f.check);
    assert.deepEqual(checks, ["gold_fields_all_confirmed"],
      "the refusal is on a different ground than the unconfirmed gold");
    assert.ok(!checks.includes("gated_gold_fields_are_reviewed"),
      "a gated field was still unreviewed, which the generated payload was supposed to make impossible");
  });

  test("the outstanding verdicts are the ones that need judgement, not the mechanical ones", { skip: !(pre && review) }, () => {
    const blockers = freezeBlockers(review.fieldVerdicts);
    const fields = new Set(blockers.map((b: any) => b.field));
    // The two categories repaired verbatim should no longer dominate what blocks.
    assert.ok(blockers.length > 0, "the set froze after all; update this test and the record");
    assert.ok(fields.size >= 3);
    assert.match(pre.repairsOutstanding, /would need re-review/);
    assert.match(pre.repairsOutstanding, /budget of three calls is spent/);
  });

  test("nothing was certified, locked or promoted", { skip: !pre }, () => {
    assert.match(pre.evidenceStatus, /Certifies nothing, promotes nothing, locks nothing/);
    assert.equal(pre.outboundActionsTaken, 0);
  });
});
