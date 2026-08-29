/**
 * The stop rule, before it is used.
 *
 * A stop rule that has not been tested is a stop rule that will be argued about
 * the first time it fires. These fix what it does on the cases that matter:
 * a zero-tolerance gate breached, a rate that has run out of room, a rate that
 * still has room, and a campaign that is merely going badly.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { reachability, bestAchievable, contribution, STOP_CONDITION } from "./audit-desk-reachability.ts";
import { informationValueStop } from "./experiment-preflight.ts";

const blank = (caseId: string) => ({
  caseId, verdictCorrect: true, detected: null, correctPass: null, ambiguousHandled: null,
  materialComplete: null, falseAccusation: null, findingsWithoutAnchor: 0, hasVerdict: true,
});

const METRICS = [
  { id: "verdictAccuracy", direction: "higher", exercisedBy: Array.from({ length: 18 }, (_, i) => "c" + i) },
  { id: "criticalDetectionRecall", direction: "higher", exercisedBy: Array.from({ length: 12 }, (_, i) => "f" + i) },
  { id: "materialReadRate", direction: "higher", exercisedBy: Array.from({ length: 6 }, (_, i) => "t" + i) },
  { id: "falseAccusationCount", direction: "lower", exercisedBy: ["p0", "p1", "p2", "p3"] },
  { id: "runsWithoutVerdict", direction: "lower", exercisedBy: Array.from({ length: 18 }, (_, i) => "c" + i) },
];
const GATES = [
  { metricId: "verdictAccuracy", threshold: 0.80, critical: true },
  { metricId: "criticalDetectionRecall", threshold: 0.80, critical: true },
  { metricId: "materialReadRate", threshold: 0.80, critical: true },
  { metricId: "falseAccusationCount", threshold: 0, critical: true },
  { metricId: "runsWithoutVerdict", threshold: 0, critical: true },
];

describe("what one case contributes", () => {
  test("a case that does not exercise a metric contributes nothing to it", () => {
    assert.equal(contribution("criticalDetectionRecall", blank("x")), null);
    assert.equal(contribution("materialReadRate", blank("x")), null);
  });

  test("a run with no verdict is a miss on accuracy and a count against runsWithoutVerdict", () => {
    const o = { ...blank("x"), verdictCorrect: null, hasVerdict: false };
    assert.equal(contribution("verdictAccuracy", o), false);
    assert.equal(contribution("runsWithoutVerdict", o), 1);
  });

  test("unanchored findings contribute their number, not a flag", () => {
    assert.equal(contribution("unanchoredFindings", { ...blank("x"), findingsWithoutAnchor: 3 }), 3);
  });
});

describe("the best a metric could still become", () => {
  test("nothing run yet: a rate can still be perfect", () => {
    const b = bestAchievable(METRICS[1], []);
    assert.equal(b.value, 1);
    assert.equal(b.unrun, 12);
  });

  test("cases not yet run are assumed to succeed, which is what makes a failure a proof", () => {
    // Two misses out of four run, eight unrun: best is 10/12.
    const outcomes = [
      { ...blank("f0"), detected: false }, { ...blank("f1"), detected: false },
      { ...blank("f2"), detected: true }, { ...blank("f3"), detected: true },
    ];
    const b = bestAchievable(METRICS[1], outcomes);
    assert.equal(b.value, Number((10 / 12).toFixed(4)));
    assert.equal(b.run, 4);
    assert.equal(b.unrun, 8);
  });

  test("a count can only grow, so what has happened is already the best case", () => {
    const b = bestAchievable(METRICS[3], [{ ...blank("p0"), falseAccusation: true }]);
    assert.equal(b.value, 1);
    assert.equal(b.kind, "count");
  });
});

describe("the stop fires on impossibility and on nothing else", () => {
  test("a clean stage A leaves everything reachable", () => {
    const outcomes = ["t0", "t1", "t2", "t3", "t4", "t5"].map((id) => ({ ...blank(id), materialComplete: true }));
    const r = reachability(METRICS, GATES, outcomes);
    assert.equal(r.objectiveReachable, true);
    assert.deepEqual(r.lostGates, []);
  });

  test("REGRESSION: one false accusation ends it, because the gate tolerates zero", () => {
    const r = reachability(METRICS, GATES, [{ ...blank("p0"), falseAccusation: true }]);
    assert.equal(r.objectiveReachable, false);
    assert.deepEqual(r.lostGates, ["falseAccusationCount"]);
    assert.match(r.reason, /Unreachable even if every remaining case is perfect/);
  });

  test("REGRESSION: one run without a verdict ends it for the same reason", () => {
    const r = reachability(METRICS, GATES, [{ ...blank("c0"), hasVerdict: false, verdictCorrect: null }]);
    assert.equal(r.objectiveReachable, false);
    assert.ok(r.lostGates.includes("runsWithoutVerdict"));
  });

  test("a rate gate that has run out of room ends it", () => {
    // materialReadRate is exercised only by the six tool cases, so after stage A
    // it is final. Two failures of six is 0.667 against 0.80.
    const outcomes = ["t0", "t1"].map((id) => ({ ...blank(id), materialComplete: false }))
      .concat(["t2", "t3", "t4", "t5"].map((id) => ({ ...blank(id), materialComplete: true })));
    const r = reachability(METRICS, GATES, outcomes);
    assert.equal(r.objectiveReachable, false);
    assert.deepEqual(r.lostGates, ["materialReadRate"]);
  });

  test("one failure of six leaves it exactly reachable, so the rule does not overreach", () => {
    const outcomes = [{ ...blank("t0"), materialComplete: false }]
      .concat(["t1", "t2", "t3", "t4", "t5"].map((id) => ({ ...blank(id), materialComplete: true })));
    const r = reachability(METRICS, GATES, outcomes);
    assert.equal(r.rows.find((x) => x.metricId === "materialReadRate")!.bestAchievable, Number((5 / 6).toFixed(4)));
    assert.equal(r.objectiveReachable, true);
  });

  test("REGRESSION: a campaign merely going badly is NOT a stop", () => {
    // Three detection misses and two verdict misses in stage A. Ugly, and
    // recoverable: detection best is 9/12 = 0.75... which is below 0.80, so this
    // IS unreachable. Two misses is the recoverable case, and it must not stop.
    const two = [
      { ...blank("f0"), detected: false, verdictCorrect: false },
      { ...blank("f1"), detected: false, verdictCorrect: false },
      { ...blank("f2"), detected: true }, { ...blank("f3"), detected: true },
    ];
    const r = reachability(METRICS, GATES, two);
    assert.equal(r.rows.find((x) => x.metricId === "criticalDetectionRecall")!.bestAchievable, Number((10 / 12).toFixed(4)));
    assert.equal(r.objectiveReachable, true, "a bad but recoverable stage A must not stop the campaign");
  });

  test("a non-critical gate never stops anything", () => {
    const metrics = [...METRICS, { id: "underdeterminedHandling", direction: "higher", exercisedBy: ["u0", "u1"] }];
    const gates = [...GATES, { metricId: "underdeterminedHandling", threshold: 1.0, critical: false }];
    const r = reachability(metrics, gates, [{ ...blank("u0"), ambiguousHandled: false }]);
    assert.equal(r.rows.find((x) => x.metricId === "underdeterminedHandling")!.reachable, false);
    assert.equal(r.objectiveReachable, true, "a non-critical gate ended the campaign");
  });

  test("there is no success-based stop: a perfect stage A still proceeds", () => {
    const outcomes = ["t0", "t1", "t2", "t3", "t4", "t5"].map((id) => ({ ...blank(id), materialComplete: true, detected: true }));
    assert.equal(reachability(METRICS, GATES, outcomes).objectiveReachable, true);
  });
});

describe("the stop is wired to the preregistration mechanism", () => {
  test("an undeclared stop is refused however true its condition", () => {
    assert.equal(informationValueStop(false, STOP_CONDITION, true).stop, false);
  });

  test("a declared stop fires only when the condition is met", () => {
    assert.equal(informationValueStop(true, STOP_CONDITION, false).stop, false);
    assert.equal(informationValueStop(true, STOP_CONDITION, true).stop, true);
  });

  test("the condition is fixed in source and cannot be reworded after a result", () => {
    assert.match(STOP_CONDITION, /^After stage A, at least one critical gate cannot reach its threshold/);
    assert.match(STOP_CONDITION, /even if every case in stage B is answered perfectly\.$/);
  });
});
