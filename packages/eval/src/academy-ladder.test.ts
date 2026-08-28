/**
 * Can MIDAS certify workers repeatably, or only once by hand?
 *
 * This mission ran the Academy as a process for the first time: enumerate a
 * deficit, write the missing examinations, run them against the real worker,
 * recompute. Everything below asserts a property that process depends on, and
 * every one of them is a way the ladder could quietly award a tier nobody
 * earned.
 *
 * The property that matters most is the last section. Evidence volume must never
 * substitute for a failed critical gate, because a worker that lies is exactly
 * the worker most able to generate a large number of confident rows.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  certify, targetId, TIERS, TIER_EVIDENCE_REQUIREMENTS, tierRank,
  dimensionsFor, gatesFor, UNJUDGED_TIER_CEILING,
} from "./academy.ts";
import { adaptWorker, adaptedTarget } from "./worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "./opportunity-researcher.ts";
import { ALL_RESEARCHER_SCENARIOS, RESEARCHER_SANDBOX_SCENARIOS, RESEARCHER_SEALED_SCENARIOS, postureBalance } from "./researcher-scenarios.ts";
import { scenariosForRole } from "./academy-scenarios.ts";
import { auditSuite } from "./exam-audit.ts";
import { needsJudgementFor } from "./sandbox.ts";

const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
const target = adaptedTarget(adapted, "gpt-4.1");

const strongDimensions = () => dimensionsFor("researcher").map((d) => ({ id: d.id, score: 95, cases: 6 }));
const fullEvidence = () => [
  { evidenceClass: "sealed_exam", cases: 12, runScores: Array(24).fill(95) },
  { evidenceClass: "sandbox_tool_use", cases: 6, runScores: Array(12).fill(95) },
];

describe("evidence volume cannot buy a tier", () => {
  test("REGRESSION: a fabrication breach caps the award however much evidence exists", () => {
    const clean = certify({ target, dimensions: strongDimensions(), evidence: fullEvidence(), breaches: [], scoringMode: "pattern_and_judge" });
    const lying = certify({
      target, dimensions: strongDimensions(),
      evidence: [
        { evidenceClass: "sealed_exam", cases: 40, runScores: Array(80).fill(98) },
        { evidenceClass: "sandbox_tool_use", cases: 30, runScores: Array(60).fill(98) },
        { evidenceClass: "simulation", cases: 20, runScores: Array(40).fill(98) },
        { evidenceClass: "adversarial", cases: 20, runScores: Array(40).fill(98) },
      ],
      breaches: [{ gateId: "CF-FABRICATION", count: 1 }], scoringMode: "pattern_and_judge",
    });
    assert.equal(lying.awardedTier, "UNTRAINED", "more rows than the clean run and it must still be UNTRAINED");
    assert.ok(tierRank(lying.awardedTier) < tierRank(clean.awardedTier));
    assert.ok(lying.limitedBy.includes("critical_gate"));
  });

  test("adding evidence classes never lowers a clean award, and never raises a breached one", () => {
    const gates = gatesFor("researcher");
    for (const g of gates) {
      const breached = certify({
        target, dimensions: strongDimensions(),
        evidence: [
          { evidenceClass: "sealed_exam", cases: 100, runScores: Array(100).fill(100) },
          { evidenceClass: "sandbox_tool_use", cases: 100, runScores: Array(100).fill(100) },
          { evidenceClass: "simulation", cases: 100, runScores: Array(100).fill(100) },
          { evidenceClass: "adversarial", cases: 100, runScores: Array(100).fill(100) },
        ],
        breaches: [{ gateId: g.id, count: g.tolerance + 1 }], scoringMode: "pattern_and_judge",
      });
      assert.ok(tierRank(breached.awardedTier) <= tierRank(g.capsAt),
        g.id + " breached and awarded " + breached.awardedTier + ", above its cap of " + g.capsAt);
    }
  });

  test("a breach within tolerance does not cap", () => {
    const tolerant = gatesFor("researcher").find((g) => g.tolerance > 0);
    if (!tolerant) return;
    const r = certify({
      target, dimensions: strongDimensions(), evidence: fullEvidence(),
      breaches: [{ gateId: tolerant.id, count: tolerant.tolerance }], scoringMode: "pattern_and_judge",
    });
    assert.ok(!r.limitedBy.includes("critical_gate"));
  });
});

describe("the ladder does not advance itself", () => {
  test("evidence short of a tier's requirement holds the award below it", () => {
    const r = certify({
      target, dimensions: strongDimensions(),
      evidence: [{ evidenceClass: "sealed_exam", cases: 11, runScores: Array(22).fill(99) }],
      breaches: [], scoringMode: "pattern_and_judge",
    });
    assert.equal(r.awardedTier, "TRAINING", "eleven of twelve sealed cases is not twelve");
    assert.ok(r.limitedBy.includes("evidence"));
  });

  test("one more case is exactly what the requirement says it is", () => {
    const short = certify({ target, dimensions: strongDimensions(), evidence: [
      { evidenceClass: "sealed_exam", cases: 12, runScores: Array(24).fill(95) },
      { evidenceClass: "sandbox_tool_use", cases: 5, runScores: Array(10).fill(95) },
    ], breaches: [], scoringMode: "pattern_and_judge" });
    const met = certify({ target, dimensions: strongDimensions(), evidence: fullEvidence(), breaches: [], scoringMode: "pattern_and_judge" });
    assert.equal(short.awardedTier, "TRAINING");
    assert.equal(tierRank(met.awardedTier) > tierRank(short.awardedTier), true, "the sixth tool-use case must be what moves it");
  });

  test("a high score with no evidence buys nothing", () => {
    const r = certify({ target, dimensions: strongDimensions(), evidence: [], breaches: [], scoringMode: "pattern_and_judge" });
    assert.equal(r.awardedTier, "TRAINING");
  });

  test("unjudged scoring cannot buy a tier above the ceiling", () => {
    const r = certify({
      target, dimensions: strongDimensions(),
      evidence: [
        { evidenceClass: "sealed_exam", cases: 24, runScores: Array(48).fill(99) },
        { evidenceClass: "sandbox_tool_use", cases: 12, runScores: Array(24).fill(99) },
        { evidenceClass: "simulation", cases: 10, runScores: Array(20).fill(99) },
        { evidenceClass: "adversarial", cases: 20, runScores: Array(40).fill(99) },
      ],
      breaches: [], scoringMode: "pattern_only",
    });
    assert.ok(tierRank(r.awardedTier) <= tierRank(UNJUDGED_TIER_CEILING));
  });
});

describe("certification binds a subject, not a job title", () => {
  test("the researcher target resolves through the adapter and carries its version", () => {
    assert.equal(adapted.midasWorker, true);
    assert.equal(adapted.versionId, "or-v3");
    assert.equal(target.workerVersionId, "or-v3");
    assert.notEqual(target.knowledgeVersionId, "none");
  });

  test("REGRESSION: changing any part of the configuration changes the target id", () => {
    const base = targetId(target);
    const variants = [
      { ...target, baseModel: "gpt-5.5" },
      { ...target, workerVersionId: "or-v2" },
      { ...target, knowledgeVersionId: "none" },
      { ...target, tools: [] },
      { ...target, policyVersionId: "none" },
      { ...target, retrievalConfigId: "web" },
    ];
    for (const v of variants) {
      assert.notEqual(targetId(v), base, "a different configuration produced the same fingerprint");
    }
  });

  test("a role with no MIDAS worker cannot silently become one", () => {
    const none = adaptWorker("researcher", {});
    assert.equal(none.midasWorker, false);
    assert.equal(adaptedTarget(none, "gpt-4.1").workerVersionId, "no-midas-worker");
  });
});

describe("the examinations that produce evidence are sound", () => {
  test("REGRESSION: the researcher suite passes its own audit", () => {
    const suite = auditSuite([...scenariosForRole("researcher"), ...ALL_RESEARCHER_SCENARIOS]);
    assert.equal(suite.trusted, true, suite.ruling);
    const fatal = (suite.findings || []).filter((f) => f.severity === "fatal");
    assert.equal(fatal.length, 0);
  });

  test("the new evidence closes exactly the deficit that was measured", () => {
    const held = {};
    for (const s of [...scenariosForRole("researcher"), ...ALL_RESEARCHER_SCENARIOS]) {
      held[s.evidenceClass] = (held[s.evidenceClass] || 0) + 1;
    }
    for (const r of TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT) {
      assert.ok((held[r.evidenceClass] || 0) >= r.minCases,
        r.evidenceClass + " has " + (held[r.evidenceClass] || 0) + ", needs " + r.minCases);
    }
  });

  test("REGRESSION: every sandbox tool-use exam is decidable by observing a tool, not by fluency", () => {
    for (const s of RESEARCHER_SANDBOX_SCENARIOS) {
      const observable = s.expectations.filter((e) => !needsJudgementFor(e));
      assert.ok(observable.length >= 1,
        s.id + " claims tool-use evidence and can be passed without touching a tool");
    }
  });

  test("REGRESSION: every sealed exam also has one observable check", () => {
    // The exam auditor caught this: eight of ten were pure text matching, so a
    // fluent answer was indistinguishable from work.
    for (const s of RESEARCHER_SEALED_SCENARIOS) {
      const observable = s.expectations.filter((e) => !needsJudgementFor(e));
      assert.ok(observable.length >= 1, s.id + " has nothing decidable without judgement");
    }
  });

  test("the six tool-use exams test six different decisions", () => {
    const classes = new Set(RESEARCHER_SANDBOX_SCENARIOS.map((s) => s.failureClass));
    assert.equal(classes.size, RESEARCHER_SANDBOX_SCENARIOS.length, "tool-use evidence is repeating a shape");
  });

  test("acting is the right answer often enough that caution alone cannot pass", () => {
    const all = [...scenariosForRole("researcher"), ...ALL_RESEARCHER_SCENARIOS];
    const b = postureBalance(all);
    assert.ok(b.act >= all.length * 0.4, "only " + (b.act || 0) + " of " + all.length + " reward acting");
    assert.ok(b.restrain >= 4, "and restraint must still be tested");
  });

  test("every expectation names a dimension the role actually has", () => {
    const valid = new Set(dimensionsFor("researcher").map((d) => d.id));
    for (const s of ALL_RESEARCHER_SCENARIOS) {
      for (const e of s.expectations) {
        assert.ok(valid.has(e.dimension), s.id + "/" + e.id + " scores an unknown dimension " + e.dimension);
      }
      assert.equal(s.expectations.reduce((a, e) => a + e.points, 0), 100, s.id + " does not total 100 points");
    }
  });

  test("every trap names a gate the role actually has", () => {
    const valid = new Set(gatesFor("researcher").map((g) => g.id));
    for (const s of ALL_RESEARCHER_SCENARIOS) {
      for (const t of s.traps) assert.ok(valid.has(t.gateId), s.id + "/" + t.id + " trips an unknown gate " + t.gateId);
    }
  });
});
