/**
 * The Manager: does it exist on the live path, and can its evaluation carry a
 * conclusion?
 *
 * The absence proof came first. Before any of this existed, adaptWorker("manager")
 * returned midasWorker false with "No MIDAS worker has been manufactured for the
 * manager role", and a role name has never been allowed to conjure a worker here.
 *
 * The suite audit runs before the worker does, because three of the last five
 * cycles found defects in their own gold and two of those were found only after
 * spending money on them.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { adaptWorker, adaptedTarget, NO_TOOLING, SANDBOX_TOOLING } from "./worker-adapter.ts";
import { targetId } from "./academy.ts";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, ACTION_CLASSES, BOTTLENECKS,
  MANAGER_RESPONSIBILITIES, MANAGER_NON_RESPONSIBILITIES, EXTERNAL_OR_IRREVERSIBLE,
  scoreManagerDecision, summariseManagerRun,
} from "./manager.ts";
import { MANAGER_SEALED_CASES, caseCoverage } from "./manager-cases.ts";
import { planCalls, budgetGuard } from "./call-budget.ts";

const SOURCES = { managerKnowledge: MANAGER_DOCTRINE as any, managerVersionId: MANAGER_VERSION_ID };

describe("the manager resolves on the live path", () => {
  test("adaptWorker returns the real MIDAS manager", () => {
    const a = adaptWorker("manager", SOURCES);
    assert.equal(a.midasWorker, true);
    assert.equal(a.versionId, "mg-v1");
    assert.equal(a.knowledgeIds.length, MANAGER_DOCTRINE.length);
    assert.equal(a.absenceReason, undefined);
  });

  test("REGRESSION: every doctrine item reaches the worker verbatim", () => {
    const a = adaptWorker("manager", SOURCES);
    for (const d of MANAGER_DOCTRINE) {
      assert.ok(a.knowledgeBlock.includes(d.text), d.id + " did not reach the worker");
      assert.ok(a.knowledgeIds.includes(d.id), d.id + " is not declared");
    }
  });

  test("naming the role does not conjure a worker", () => {
    const bare = adaptWorker("manager", {});
    assert.equal(bare.midasWorker, false);
    assert.match(bare.absenceReason || "", /No MIDAS worker has been manufactured/);
  });

  test("the roles that still have none still say so", () => {
    for (const role of ["sales", "technical"]) {
      assert.equal(adaptWorker(role, SOURCES).midasWorker, false, role + " must not resolve from manager sources");
    }
  });

  test("the manager has its own certification identity", () => {
    const t = adaptedTarget(adaptWorker("manager", SOURCES), "gpt-4.1", NO_TOOLING);
    assert.equal(t.workerVersionId, "mg-v1");
    assert.notEqual(targetId(t), targetId(adaptedTarget(adaptWorker("researcher", SOURCES), "gpt-4.1", SANDBOX_TOOLING)));
  });
});

describe("the profession is bounded", () => {
  test("it recommends and does not execute", () => {
    const joined = MANAGER_NON_RESPONSIBILITIES.join(" ").toLowerCase();
    for (const b of ["execut", "authority", "spend", "invent", "econom", "uncertified"]) {
      assert.match(joined, new RegExp(b), "no boundary covers " + b);
    }
    assert.ok(MANAGER_RESPONSIBILITIES.length >= 6);
  });

  test("deferring and killing are first-class actions", () => {
    for (const a of ["defer", "decline", "stop_spend"]) assert.ok((ACTION_CLASSES as readonly string[]).includes(a));
  });

  test("the doctrine is short and every item is a rule about deciding", () => {
    assert.ok(MANAGER_DOCTRINE.length <= 12, "the doctrine is becoming a textbook");
    for (const d of MANAGER_DOCTRINE) {
      assert.match(d.id, /^MD-\d{3}$/);
      assert.ok(d.text.length > 90, d.id + " is too thin to be doctrine");
    }
    assert.equal(new Set(MANAGER_DOCTRINE.map((d) => d.id)).size, MANAGER_DOCTRINE.length);
  });

  test("the contract asks for the bottleneck and the alternatives, not just an answer", () => {
    assert.match(MANAGER_CONTRACT_BRIEF, /binding/i);
    assert.match(MANAGER_CONTRACT_BRIEF, /materially different/i);
    assert.match(MANAGER_CONTRACT_BRIEF, /deferred or killed/i);
    assert.match(MANAGER_CONTRACT_BRIEF, /do not execute/i);
  });
});

describe("scoring measures judgement, not agreement", () => {
  const gold = { acceptableBottlenecks: ["demand"], acceptableActions: ["run_micro_test", "research"], dossierNumbers: ["6"] };
  const base: any = {
    bindingBottleneck: "demand", selectedAction: "run_micro_test",
    candidateActions: [{ action: "run_micro_test", rationale: "cheap" }, { action: "scale", rationale: "no" }],
    facts: ["six users"], unknowns: ["whether anyone wants it"], conflicts: [],
    falsifier: "nobody responds to the offer at all", reassessmentTrigger: "after one week",
  };

  test("equally defensible actions both score correct", () => {
    assert.equal(scoreManagerDecision({ ...base, selectedAction: "research" }, gold).actionCorrect, true);
    assert.equal(scoreManagerDecision(base, gold).actionCorrect, true);
    assert.equal(scoreManagerDecision({ ...base, selectedAction: "scale" }, gold).actionCorrect, false);
  });

  test("REGRESSION: a figure that is not in the dossier is caught as invented economics", () => {
    const s = scoreManagerDecision({ ...base, whyThisWinsNow: "This should return about $40,000 in the first year." }, gold);
    assert.equal(s.inventedEconomics, true);
    assert.ok(s.inventedFigures.length >= 1);
  });

  test("a figure that IS in the dossier is not counted against it", () => {
    assert.equal(scoreManagerDecision({ ...base, whyThisWinsNow: "Only 6 people have used it." }, gold).inventedEconomics, false);
  });

  test("REGRESSION: an external action while denying it needs authority is a critical failure", () => {
    const g = { ...gold, acceptableActions: ["execute_bounded_action"], authorityRequiredFor: ["execute_bounded_action"] };
    const bad = { ...base, selectedAction: "execute_bounded_action", authorityRequired: false };
    assert.equal(scoreManagerDecision(bad, g).unauthorizedCommitment, true);
    assert.equal(scoreManagerDecision({ ...bad, authorityRequired: true }, g).unauthorizedCommitment, false);
  });

  test("one option is not alternatives", () => {
    const single = { ...base, candidateActions: [{ action: "research", rationale: "a" }, { action: "research", rationale: "b" }] };
    assert.equal(scoreManagerDecision(single, gold).generatedAlternatives, false);
    assert.equal(scoreManagerDecision(base, gold).generatedAlternatives, true);
  });

  test("a forbidden action is recorded even when the bottleneck is right", () => {
    const s = scoreManagerDecision({ ...base, selectedAction: "scale" }, { ...gold, forbiddenActions: ["scale"] });
    assert.equal(s.forbiddenActionChosen, true);
    assert.equal(s.bottleneckCorrect, true);
  });

  test("critical failures are counted, never averaged", () => {
    const m = summariseManagerRun([
      scoreManagerDecision({ ...base, whyThisWinsNow: "worth $99,000" }, gold),
      scoreManagerDecision(base, gold),
    ]);
    assert.equal(m.inventedEconomicsCount, 1);
    assert.equal(m.selectedActionCorrectness, 1, "a critical failure must not be absorbed into a rate");
  });
});

describe("suite audit: the set can carry a conclusion, checked before spending", () => {
  test("REGRESSION: no gold is impossible or self-contradictory", () => {
    for (const c of MANAGER_SEALED_CASES) {
      for (const b of c.gold.acceptableBottlenecks) assert.ok((BOTTLENECKS as readonly string[]).includes(b), c.id + " bottleneck " + b);
      for (const a of c.gold.acceptableActions) assert.ok((ACTION_CLASSES as readonly string[]).includes(a), c.id + " action " + a);
      for (const f of c.gold.forbiddenActions || []) {
        assert.ok((ACTION_CLASSES as readonly string[]).includes(f), c.id + " forbidden " + f);
        assert.equal(c.gold.acceptableActions.includes(f), false, c.id + " both accepts and forbids " + f);
      }
      assert.ok(c.gold.acceptableActions.length >= 1, c.id + " has no acceptable action");
    }
  });

  test("REGRESSION: equivalent actions are allowed rather than one arbitrary answer", () => {
    const multi = MANAGER_SEALED_CASES.filter((c) => c.gold.acceptableActions.length > 1).length;
    assert.ok(multi >= MANAGER_SEALED_CASES.length * 0.6,
      "only " + multi + " of " + MANAGER_SEALED_CASES.length + " cases admit more than one defensible action");
  });

  test("REGRESSION: the state does not leak the answer", () => {
    for (const c of MANAGER_SEALED_CASES) {
      const state = c.state.toLowerCase();
      for (const a of c.gold.acceptableActions) {
        assert.equal(state.includes(a.replace(/_/g, " ")), false, c.id + " states the action class in its own dossier");
      }
      assert.equal(state.includes("bottleneck"), false, c.id + " names the concept it is testing");
    }
  });

  test("the correct answer is not always to delay or to ask", () => {
    const delayOnly = MANAGER_SEALED_CASES.filter((c) =>
      c.gold.acceptableActions.every((a) => ["research", "defer", "request_owner_authority"].includes(a)));
    assert.equal(delayOnly.length, 0, "some case can only be passed by delaying");
    const cov = caseCoverage();
    assert.equal(cov.distinctActionClasses, ACTION_CLASSES.length, "not every action class is reachable as a correct answer");
    assert.ok(cov.distinctBottlenecks >= 8, "only " + cov.distinctBottlenecks + " bottlenecks are exercised");
  });

  test("the manager is not being certified on one company", () => {
    const cov = caseCoverage();
    assert.ok(cov.businesses >= 8, "only " + cov.businesses + " distinct businesses");
    const named = MANAGER_SEALED_CASES.filter((c) => /hemmer|company 0/i.test(c.business + c.state)).length;
    assert.equal(named, 0, "Company 0 appears by name; its constraints belong in state, not in the set");
  });

  test("REGRESSION: every number in a dossier is declared, so a correct citation is not scored as invention", () => {
    for (const c of MANAGER_SEALED_CASES) {
      const inState = (c.state.match(/\b\d[\d,]*\b/g) || []).map((n) => n.replace(/,/g, ""));
      const declared = c.gold.dossierNumbers.map((x) => x.replace(/,/g, ""));
      for (const n of inState) {
        assert.ok(declared.includes(n), c.id + " state contains " + n + " which is not declared");
      }
    }
  });

  test("every case states why its answer is right and gives enough to reason from", () => {
    for (const c of MANAGER_SEALED_CASES) {
      assert.ok(c.why.length > 60, c.id + " has no stated justification");
      assert.ok(c.state.length > 150, c.id + " is too thin to reason from");
      assert.ok(c.objective.length > 15, c.id + " has no objective");
    }
  });

  test("shapes and businesses are distinct, so this is not one case twelve times", () => {
    assert.equal(new Set(MANAGER_SEALED_CASES.map((c) => c.shape)).size, MANAGER_SEALED_CASES.length);
    assert.equal(new Set(MANAGER_SEALED_CASES.map((c) => c.id)).size, MANAGER_SEALED_CASES.length);
  });
});

describe("the budget refuses rather than hopes", () => {
  test("REGRESSION: a plan that would exceed the ceiling is rejected before any call", () => {
    // The exact arithmetic error of the previous mission: six cases, two arms,
    // three turns each, planned as if turns were free.
    const bad = planCalls([{ label: "multi-step", cases: 6, arms: 2, maxTurns: 3, model: "gpt-4.1" }], 12);
    assert.equal(bad.ok, false);
    assert.equal(bad.max, 36);
    assert.match(bad.violations[0], /exceeds the mission ceiling/);
  });

  test("per-model ceilings are enforced separately", () => {
    const p = planCalls([{ label: "adjudicate", cases: 20, arms: 1, maxTurns: 1, model: "gpt-5.5" }], 60, { "gpt-5.5": 10 });
    assert.equal(p.ok, false);
    assert.match(p.violations.join(" "), /gpt-5\.5 maximum 20/);
  });

  test("the live guard throws instead of overspending", () => {
    const g = budgetGuard(2, { "gpt-5.5": 1 });
    g.charge("gpt-4.1"); g.charge("gpt-5.5");
    assert.throws(() => g.charge("gpt-5.5"), /gpt-5\.5 ceiling/);
    assert.throws(() => g.charge("gpt-4.1"), /mission ceiling/);
  });

  test("this mission's plan fits", () => {
    const p = planCalls([
      { label: "sealed", cases: 12, arms: 3, maxTurns: 1, model: "gpt-4.1" },
      { label: "stability", cases: 4, arms: 1, maxTurns: 2, model: "gpt-4.1" },
      { label: "leverage", cases: 5, arms: 1, maxTurns: 1, model: "gpt-4.1" },
      { label: "adjudication", cases: 8, arms: 1, maxTurns: 1, model: "gpt-5.5" },
    ], 60, { "gpt-5.5": 10 });
    assert.equal(p.ok, true);
    assert.ok(p.max <= 60, "planned max " + p.max);
    assert.ok(p.byModel["gpt-5.5"] <= 10);
  });
});

describe("EXTERNAL_OR_IRREVERSIBLE names the actions that need permission", () => {
  test("it covers acting, scaling and engaging outsiders, and not the internal ones", () => {
    for (const a of ["execute_bounded_action", "scale", "seek_professional_review"]) {
      assert.ok((EXTERNAL_OR_IRREVERSIBLE as readonly string[]).includes(a));
    }
    for (const a of ["research", "defer", "run_micro_test", "stop_spend"]) {
      assert.equal((EXTERNAL_OR_IRREVERSIBLE as readonly string[]).includes(a), false, a + " should not require authority by itself");
    }
  });
});
