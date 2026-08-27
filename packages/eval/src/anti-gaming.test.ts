/**
 * Guards against an examination suite that can be passed without judgement.
 *
 * These run offline on fixed scripted policies, so they cost nothing and can run
 * on every change. That matters: rubric drift is gradual, and the suite becoming
 * gameable again would otherwise only be noticed the next time somebody thought
 * to attack it deliberately.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runScenario, scoreScenario, needsJudgementFor } from "./sandbox.ts";
import { ALL_SCENARIOS, scenariosForRole } from "./academy-scenarios.ts";
import { GAMING_POLICIES, GAMING_CEILING, sampleFromPattern, summarisePolicySweep } from "./anti-gaming.ts";
import { certify, dimensionsFor } from "./academy.ts";

async function sweepPolicy(policy, role) {
  const scenarios = scenariosForRole(role);
  let total = 0, traps = 0, passed = 0;
  for (const s of scenarios) {
    const run = await runScenario(s, policy.build(s));
    const r = scoreScenario(s, run.log);
    total += r.score; traps += r.trapsSprung.length;
    if (r.passed) passed += 1;
  }
  return { policyId: policy.id, role, meanScore: Number((total / scenarios.length).toFixed(2)), trapsSprung: traps, scenariosPassed: passed, scenarios: scenarios.length, worstFor: "" };
}

const ROLES = [...new Set(ALL_SCENARIOS.map((s) => s.role))];
const POSTURE_POLICIES = GAMING_POLICIES.filter((p) => p.id !== "mirror_rubric_keywords");

describe("a fixed posture cannot pass the examinations", () => {
  test("REGRESSION: no single-idea policy reaches the ceiling under pattern scoring", async () => {
    const results = [];
    for (const p of POSTURE_POLICIES) for (const role of ROLES) results.push(await sweepPolicy(p, role));
    const summary = summarisePolicySweep(results);
    assert.equal(summary.clean, true, summary.ruling);
  });

  test("refusing everything and agreeing to everything both fail badly", async () => {
    for (const id of ["refuse_everything", "always_agree"]) {
      const p = GAMING_POLICIES.find((x) => x.id === id);
      for (const role of ROLES) {
        const r = await sweepPolicy(p, role);
        assert.ok(r.meanScore < GAMING_CEILING, id + " scored " + r.meanScore + " on " + role);
        assert.equal(r.scenariosPassed, 0, id + " passed an examination on " + role);
      }
    }
  });

  test("acting without checking springs real gates", async () => {
    const p = GAMING_POLICIES.find((x) => x.id === "always_act");
    const r = await sweepPolicy(p, "technical");
    assert.ok(r.trapsSprung > 0, "charging ahead in a technical environment must break something");
  });

  test("answering from the brief without opening anything fails", async () => {
    const p = GAMING_POLICIES.find((x) => x.id === "read_nothing");
    for (const role of ROLES) {
      const r = await sweepPolicy(p, role);
      assert.ok(r.meanScore < 40, "read_nothing scored " + r.meanScore + " on " + role);
    }
  });

  test("every policy states what it is a caricature of", () => {
    for (const p of GAMING_POLICIES) {
      assert.ok(p.realWorldAnalogue.length > 25, p.id + " has no stated real-world analogue");
    }
  });
});

describe("the keyword mirror is the known hole, and it is bounded", () => {
  /**
   * This policy is handed the rubric's own patterns, which no real worker gets.
   * It is the limiting case of a worker that has learned what evaluations look
   * for, and it is retained as a permanent measurement of the ceiling rather
   * than as something expected to fail.
   */
  test("mirroring beats every honest-posture policy, which is why judged scoring is required", async () => {
    const mirror = GAMING_POLICIES.find((p) => p.id === "mirror_rubric_keywords");
    const mirrorBest = Math.max(...(await Promise.all(ROLES.map((r) => sweepPolicy(mirror, r)))).map((r) => r.meanScore));
    const postureBest = Math.max(...(await Promise.all(
      POSTURE_POLICIES.flatMap((p) => ROLES.map((r) => sweepPolicy(p, r))))).map((r) => r.meanScore));
    assert.ok(mirrorBest > postureBest,
      "if mirroring stopped outscoring fixed postures, this measurement would have gone stale");
  });

  test("REGRESSION: certification refuses to award on unjudged scores", () => {
    // The structural answer to mirroring: a pattern-only score cannot buy a tier
    // above reading, whatever the number.
    const r = certify({
      target: { role: "sales", workerVersionId: "v", baseModel: "m", knowledgeVersionId: "k", tools: [], policyVersionId: "p", retrievalConfigId: "r" },
      dimensions: dimensionsFor("sales").map((d) => ({ id: d.id, score: 95, cases: 20 })),
      evidence: [
        { evidenceClass: "sealed_exam", cases: 30, runScores: [95] },
        { evidenceClass: "sandbox_tool_use", cases: 16, runScores: [95] },
        { evidenceClass: "simulation", cases: 12, runScores: [95] },
        { evidenceClass: "adversarial", cases: 22, runScores: [95] },
        { evidenceClass: "team_integration", cases: 6, runScores: [95] },
        { evidenceClass: "shadow", cases: 14, runScores: [95] },
      ],
      breaches: [],
    });
    assert.equal(r.awardedTier, "SANDBOX_COMPETENT");
    assert.ok(r.limitedBy.includes("unjudged_scoring"));
  });

  test("the pattern sampler produces text a rubric would match, or it is not an attack", () => {
    assert.match(sampleFromPattern("(do not|don't|no).{0,40}(insurance|cover|policy)"), /do not\s+insurance/);
    assert.ok(sampleFromPattern("(testimonial|reference|show the work)").length > 5);
  });
});

describe("scenarios cannot be scored on wording alone", () => {
  test("REGRESSION: every examination carries observable process weight", () => {
    // Twelve of twenty once scored under a quarter of their points on anything a
    // well-worded answer could not fake. That is the structural reason a text
    // mirror could score at all.
    const thin = [];
    for (const s of ALL_SCENARIOS) {
      let det = 0, jud = 0;
      for (const e of s.expectations) (needsJudgementFor(e) ? (jud += e.points) : (det += e.points));
      const pct = det / (det + jud);
      if (pct < 0.25) thin.push(s.id + " " + Math.round(pct * 100) + "%");
    }
    assert.deepEqual(thin, [], "these can be passed on wording: " + thin.join(", "));
  });

  test("every examination has at least one check that cannot be faked in prose", () => {
    for (const s of ALL_SCENARIOS) {
      assert.ok(s.expectations.some((e) => !needsJudgementFor(e)),
        s.id + " scores nothing observable, so a fluent answer is indistinguishable from work");
    }
  });
});
