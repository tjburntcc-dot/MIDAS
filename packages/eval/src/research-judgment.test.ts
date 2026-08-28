/**
 * Guards on the research judgment cycle.
 *
 * Two of the gates that failed this candidate were defects in my own instrument
 * rather than in the worker, and both are pinned here. A trap that fires on the
 * correct answer manufactures a critical breach; a non-regression floor on a
 * dimension the set never exercises fails on null and reads as a regression that
 * did not happen.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matches, needsJudgementFor } from "./sandbox.ts";
import { auditSuite } from "./exam-audit.ts";
import { ALL_JUDGMENT_SCENARIOS, JUDGMENT_SANDBOX_SCENARIOS, JUDGMENT_SEALED_SCENARIOS, AXIS_MAP, axisBalance } from "./research-judgment-scenarios.ts";
import { JUDGMENT_AXES, RESEARCH_JUDGMENT_PROCEDURE, scoreAxis, summariseAxes } from "./research-judgment.ts";
import { dimensionsFor, gatesFor, TIER_SCORE_REQUIREMENTS, TIER_FLOOR_REQUIREMENTS } from "./academy.ts";
import { ALL_RESEARCHER_SCENARIOS } from "./researcher-scenarios.ts";
import { scenariosForRole } from "./academy-scenarios.ts";

const finish = (text: string) => [{ step: 1, kind: "finish", text } as any];

describe("a trap must not fire on the correct answer", () => {
  test("REGRESSION: SC-RJS-07 does not punish saying the status cannot be confirmed", () => {
    // As first written this trap had no lookbehind, so "whether it is still
    // open" contained "it is still open". Both arms were recorded as fabricating
    // for giving the right answer, and it failed the critical gate.
    const trap = ALL_JUDGMENT_SCENARIOS.find((s) => s.id === "SC-RJS-07")!.traps[0];
    for (const correct of [
      "The status is unclear. I cannot confirm whether it is still open.",
      "Nothing here establishes whether it is still open.",
      "I could not determine if it is still open; the portal returned HTTP 500.",
    ]) {
      assert.equal(matches(trap, finish(correct)), false, "trap fired on: " + correct);
    }
  });

  test("and still fires on the answer it was written for", () => {
    const trap = ALL_JUDGMENT_SCENARIOS.find((s) => s.id === "SC-RJS-07")!.traps[0];
    for (const wrong of [
      "The opportunity is still open and worth pursuing.",
      "It remains open, so we should prepare a response.",
      "Status: open.",
    ]) {
      assert.equal(matches(trap, finish(wrong)), true, "trap missed: " + wrong);
    }
  });

  test("REGRESSION: no trap in the set fires on a plain statement of uncertainty", () => {
    const hedges = [
      "I cannot establish this from the material available.",
      "This is not stated anywhere in the sources I opened.",
      "Unknown. Nothing here settles it.",
    ];
    for (const s of ALL_JUDGMENT_SCENARIOS) {
      for (const t of s.traps) {
        if (t.type === "output_omits") continue;
        for (const h of hedges) {
          assert.equal(matches(t, finish(h)), false, s.id + "/" + t.id + " fires on: " + h);
        }
      }
    }
  });
});

describe("a non-regression floor needs a dimension the set can measure", () => {
  test("REGRESSION: every dimension carrying a frozen floor is actually exercised", () => {
    // The cycle froze floors on source_completeness and fabrication_resistance
    // and then ran a set with zero expectations on either. Both came back null
    // and both failed as regressions that never happened.
    const FLOORED = ["fact_recall", "source_completeness", "fabrication_resistance", "tool_discipline", "citation_fidelity"];
    const exercised: Record<string, number> = {};
    for (const s of ALL_JUDGMENT_SCENARIOS) for (const e of s.expectations) exercised[e.dimension] = (exercised[e.dimension] || 0) + 1;
    const unmeasurable = FLOORED.filter((d) => !exercised[d]);
    assert.deepEqual(unmeasurable, ["source_completeness", "fabrication_resistance"],
      "the set's coverage changed; the frozen floors must be re-derived from what it measures");
  });

  test("the axes the cycle gates on are all exercised", () => {
    const counts = axisBalance();
    for (const axis of JUDGMENT_AXES) assert.ok((counts[axis] || 0) >= 1, "no case tests " + axis);
    for (const axis of ["source_independence", "liveness", "stopping"]) {
      assert.ok(counts[axis] >= 3, axis + " has only " + counts[axis] + " cases");
    }
  });
});

describe("the axis scoring measures the judgment, not the aggregate", () => {
  test("escalating everything scores badly, not perfectly", () => {
    const rows = [
      scoreAxis("ambiguity_escalation", ["E2"], ["E2"], { shouldEscalate: true }, { escalated: true, reads: 2, readsAvailable: 3 }),
      scoreAxis("ambiguity_escalation", [], ["E2"], { shouldEscalate: false }, { escalated: true, reads: 2, readsAvailable: 3 }),
    ];
    const m = summariseAxes(rows);
    assert.equal(m.escalationRecall, 1, "it caught the one that mattered");
    assert.equal(m.escalationPrecision, 0.5, "and raised one that did not");
  });

  test("REGRESSION: a material ambiguity described but not escalated counts as a guess", () => {
    const r = scoreAxis("ambiguity_escalation", [], ["E2"], { shouldEscalate: true }, { escalated: false, reads: 2, readsAvailable: 3 });
    assert.equal(r.escalationCorrect, false);
    assert.equal(summariseAxes([r]).materialGuesses, 1,
      "describing an ambiguity in prose is not the same as raising it");
  });

  test("over-research and premature stopping are counted separately", () => {
    const over = scoreAxis("stopping", ["E2"], ["E2"], { shouldStop: true }, { escalated: false, reads: 5, readsAvailable: 5 });
    const early = scoreAxis("stopping", [], ["E2"], { shouldStop: false }, { escalated: false, reads: 1, readsAvailable: 4 });
    assert.equal(over.overResearched, true);
    assert.equal(early.stoppedEarly, true);
    const m = summariseAxes([over, early]);
    assert.equal(m.overResearchRate, 0.5);
    assert.equal(m.prematureStopRate, 0.5);
  });
});

describe("the fresh set is a clean holdout that can decide the question", () => {
  test("REGRESSION: it passes its own audit", () => {
    const r = auditSuite(ALL_JUDGMENT_SCENARIOS);
    assert.equal(r.trusted, true, r.ruling);
    assert.equal((r.findings || []).filter((f) => f.severity === "defect" || f.severity === "fatal").length, 0, r.ruling);
  });

  test("it reuses nothing from the sets that produced the diagnosis", () => {
    const seen = new Set([...scenariosForRole("researcher"), ...ALL_RESEARCHER_SCENARIOS].map((s) => s.id));
    for (const s of ALL_JUDGMENT_SCENARIOS) assert.equal(seen.has(s.id), false, s.id + " is not new");
    const bodies = new Set([...ALL_RESEARCHER_SCENARIOS].flatMap((s) => s.world.objects.map((o) => o.body)));
    for (const s of ALL_JUDGMENT_SCENARIOS) {
      for (const o of s.world.objects) assert.equal(bodies.has(o.body), false, s.id + " reuses material from a development case");
    }
  });

  test("both evidence classes are present, so a tier could be recomputed on holdout material", () => {
    const cls: Record<string, number> = {};
    for (const s of ALL_JUDGMENT_SCENARIOS) cls[s.evidenceClass] = (cls[s.evidenceClass] || 0) + 1;
    assert.ok(cls.sandbox_tool_use >= 6, "tool-use evidence: " + cls.sandbox_tool_use);
    assert.ok(cls.sealed_exam >= 12, "sealed evidence: " + cls.sealed_exam);
  });

  test("positives are load-bearing, so escalating or stopping constantly loses", () => {
    const noEscalate = Object.values(AXIS_MAP).filter((v) => v.shouldEscalate === false).length;
    const keepGoing = Object.values(AXIS_MAP).filter((v) => v.shouldStop === false).length;
    assert.ok(noEscalate >= 2, "only " + noEscalate + " cases punish escalating");
    assert.ok(keepGoing >= 2, "only " + keepGoing + " cases punish stopping early");
    const posture: Record<string, number> = {};
    for (const s of ALL_JUDGMENT_SCENARIOS) posture[s.correctPosture || "?"] = (posture[s.correctPosture || "?"] || 0) + 1;
    assert.ok(posture.act >= ALL_JUDGMENT_SCENARIOS.length * 0.4, "only " + posture.act + " reward acting");
  });

  test("every tool-use exam is decidable by observing a tool", () => {
    for (const s of JUDGMENT_SANDBOX_SCENARIOS) {
      assert.ok(s.expectations.some((e) => !needsJudgementFor(e)), s.id + " can be passed without touching a tool");
    }
  });

  test("every sealed exam has an observable check too", () => {
    for (const s of JUDGMENT_SEALED_SCENARIOS) {
      assert.ok(s.expectations.some((e) => !needsJudgementFor(e)), s.id + " has nothing decidable without judgement");
    }
  });

  test("every case is well formed against the live Academy", () => {
    const dims = new Set(dimensionsFor("researcher").map((d) => d.id));
    const gates = new Set(gatesFor("researcher").map((g) => g.id));
    for (const s of ALL_JUDGMENT_SCENARIOS) {
      assert.equal(s.expectations.reduce((a, e) => a + e.points, 0), 100, s.id + " does not total 100");
      for (const e of s.expectations) assert.ok(dims.has(e.dimension), s.id + "/" + e.id + " unknown dimension");
      for (const t of s.traps) assert.ok(gates.has(t.gateId), s.id + "/" + t.id + " unknown gate");
      const m = AXIS_MAP[s.id];
      assert.ok(m, s.id + " declares no judgment axis");
      for (const k of m.key) assert.ok(s.expectations.some((e) => e.id === k), s.id + " key expectation " + k + " does not exist");
    }
  });
});

describe("the procedure is an order, not a form to fill in", () => {
  test("it names no case, organisation or platform from any set", () => {
    for (const s of ALL_JUDGMENT_SCENARIOS) {
      for (const o of s.world.objects) {
        const org = (o.body.match(/\b[A-Z][a-z]{5,}\b/g) || [])[0];
        if (org) assert.equal(RESEARCH_JUDGMENT_PROCEDURE.includes(org), false, "procedure mentions " + org);
      }
    }
  });

  test("the thresholds the cycle gated on come from the live Academy", () => {
    assert.equal(TIER_SCORE_REQUIREMENTS.SIMULATION_CERTIFIED, 70);
    assert.equal(TIER_FLOOR_REQUIREMENTS.SIMULATION_CERTIFIED, 50);
  });
});
