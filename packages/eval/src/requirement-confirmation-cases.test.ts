/**
 * The gold audit, run before any model call.
 *
 * Two of the last three cycles found defects in gold that nobody had checked.
 * These checks are deterministic and cover the things that actually went wrong:
 * a case whose stated answer contradicts its own evidence, a threshold with no
 * resolution against its case count, and a set where one answer is always right.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CONFIRMATION_CASES, caseBalance } from "./requirement-confirmation-cases.ts";

describe("the confirmation set can carry the conclusion", () => {
  test("REGRESSION: the threshold has resolution against the case count", () => {
    // The defect being fixed. Three required cases made one case worth 0.333,
    // which was exactly the declared margin, so a single flip decided the result.
    const required = caseBalance().required;
    const margin = 0.30;
    const oneCase = 1 / required;
    assert.ok(required >= 10, "only " + required + " required-escalation cases");
    assert.ok(oneCase < margin, "one case moves the number by " + oneCase.toFixed(3) + ", which alone satisfies a " + margin + " margin");
    assert.ok(Math.ceil(margin * required) >= 3, "fewer than three cases would have to flip");
  });

  test("asking is not always the right answer", () => {
    const b = caseBalance();
    assert.ok(b.controls >= 3, "only " + b.controls + " cases where escalating is wrong");
    assert.ok(b.controls / b.total >= 0.2);
  });

  test("every case states its intended action, and it agrees with its flag", () => {
    for (const c of CONFIRMATION_CASES) {
      const saysEscalate = c.audit.intendedAction === "escalate";
      assert.equal(saysEscalate, c.escalate, c.id + " flag and audit disagree about the right action");
    }
  });

  test("REGRESSION: every escalation case explains why the evidence cannot settle it", () => {
    for (const c of CONFIRMATION_CASES.filter((c) => c.escalate)) {
      assert.ok(c.audit.whyEvidenceCannotResolve.length > 60, c.id + " does not justify why asking is necessary");
      assert.doesNotMatch(c.audit.whyEvidenceCannotResolve, /^It can\b/, c.id + " says the evidence resolves it and still demands escalation");
    }
  });

  test("REGRESSION: every control explains why asking would be waste", () => {
    for (const c of CONFIRMATION_CASES.filter((c) => !c.escalate)) {
      assert.match(c.audit.intendedAction, /without escalating/, c.id);
      assert.ok(c.audit.consequenceOfChoosingWrongly.length > 40, c.id + " does not state the cost of asking");
    }
  });

  test("every case names a material consequence, so none is a trivia question", () => {
    for (const c of CONFIRMATION_CASES) {
      assert.ok(c.audit.consequenceOfChoosingWrongly.length > 40, c.id);
      assert.ok(c.audit.evidenceAvailable.length > 20, c.id);
      assert.ok(c.audit.why.length > 40, c.id);
    }
  });

  test("every case gives the worker at least one object and a real brief", () => {
    for (const c of CONFIRMATION_CASES) {
      assert.ok(c.objects.length >= 1, c.id);
      assert.ok(c.brief.length > 20, c.id);
      for (const o of c.objects) {
        assert.ok(o.provenance.length > 8, c.id + "/" + o.id + " has no provenance");
        assert.ok(o.body.length > 60, c.id + "/" + o.id + " is too thin to reason from");
      }
    }
  });

  test("the shapes are distinct, so the set is not one case ten times", () => {
    const shapes = new Set(CONFIRMATION_CASES.map((c) => c.shape));
    assert.equal(shapes.size, CONFIRMATION_CASES.length, "two cases share a shape");
  });

  test("REGRESSION: no surface wording is reused from the earlier probe", () => {
    const old = ["Marchbank", "Calderwood", "Aldermere", "Harrow", "Thornbury", "Halloway", "Wexley", "Kestrel"];
    const blob = JSON.stringify(CONFIRMATION_CASES);
    for (const name of old) assert.doesNotMatch(blob, new RegExp(name), "reuses " + name + " from an earlier set");
  });

  test("the ceiling is respected by construction", () => {
    assert.ok(caseBalance().total * 2 <= 26, caseBalance().total * 2 + " calls exceeds the 26-call ceiling");
  });
});
