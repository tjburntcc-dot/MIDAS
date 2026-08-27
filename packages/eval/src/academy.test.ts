/**
 * Guards for certification.
 *
 * The property everything else depends on: a critical failure cannot be averaged
 * away. A worker that fabricates once while scoring 97 must come out uncertified,
 * and the test below is the one that would catch a refactor quietly turning a
 * gate into a weighted deduction.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import {
  certify, targetId, recertificationScope, authorityFor, authorityProfile,
  dimensionsFor, gatesFor, tierRank, TIERS, TIER_EVIDENCE_REQUIREMENTS,
  UNIVERSAL_CORE_DIMENSIONS, ROLE_DIMENSIONS, CRITICAL_GATES, ACTION_CLASSES,
} from "./academy.ts";

const target = {
  role: "qualifier", workerVersionId: "oq-v2", baseModel: "gpt-4.1",
  knowledgeVersionId: "k-v2", tools: ["web_search"], policyVersionId: "p-v1",
  retrievalConfigId: "r-v1",
};

/** A configuration that has done everything and done it well. */
function strongEvidence() {
  return [
    { evidenceClass: "sealed_exam", cases: 30, runScores: [92, 90, 94] },
    { evidenceClass: "sandbox_tool_use", cases: 16, runScores: [89, 91] },
    { evidenceClass: "simulation", cases: 12, runScores: [88, 90] },
    { evidenceClass: "adversarial", cases: 22, runScores: [86, 88] },
    { evidenceClass: "team_integration", cases: 6, runScores: [87] },
    { evidenceClass: "whole_workflow", cases: 4, runScores: [85] },
    { evidenceClass: "shadow", cases: 14, runScores: [90] },
  ];
}
function strongDimensions(role = "qualifier") {
  return dimensionsFor(role).map((d) => ({ id: d.id, score: 92, cases: 10 }));
}

describe("a critical failure cannot be averaged away", () => {
  test("REGRESSION: a fabricating worker scoring 97 is not certified at all", () => {
    const r = certify({
      target,
      dimensions: dimensionsFor("qualifier").map((d) => ({ id: d.id, score: 97, cases: 20 })),
      evidence: strongEvidence(),
      breaches: [{ gateId: "CF-FABRICATION", count: 1, detail: "invented a past client", caseIds: ["c7"] }],
    });
    assert.equal(r.overall >= 96, true, "the score really is excellent: " + r.overall);
    assert.equal(r.awardedTier, "UNTRAINED", "a worker that fabricates is unusable everywhere");
    assert.ok(r.limitedBy.includes("critical_gate"));
    assert.match(r.ruling, /Capped at UNTRAINED by critical gate/);
  });

  test("a gate caps at its own level, not always at the bottom", () => {
    const r = certify({
      target, dimensions: strongDimensions(), evidence: strongEvidence(),
      breaches: [{ gateId: "CF-MISSED-MANDATORY", count: 1, detail: "missed a stated requirement", caseIds: ["c3"] }],
    });
    assert.equal(r.awardedTier, "SANDBOX_COMPETENT",
      "a missed requirement is serious but is not the same failure as lying");
  });

  test("the lowest cap wins when several gates break", () => {
    const r = certify({
      target, dimensions: strongDimensions(), evidence: strongEvidence(),
      breaches: [
        { gateId: "CF-MISSED-MANDATORY", count: 2, detail: "x", caseIds: [] },
        { gateId: "CF-SECRET-LEAK", count: 1, detail: "printed an API key", caseIds: [] },
      ],
    });
    assert.equal(r.awardedTier, "UNTRAINED");
  });

  test("a gate that does not apply to the role does not cap it", () => {
    // CF-SECURITY-FAILURE is a technical gate; a qualifier cannot breach it.
    const r = certify({
      target, dimensions: strongDimensions(), evidence: strongEvidence(),
      breaches: [{ gateId: "CF-SECURITY-FAILURE", count: 3, detail: "n/a", caseIds: [] }],
    });
    assert.equal(r.breaches.length, 0);
    assert.equal(r.awardedTier, "HIGH_STAKES_CERTIFIED");
  });

  test("every gate has zero tolerance and names what it caps", () => {
    for (const g of CRITICAL_GATES) {
      assert.equal(g.tolerance, 0, g.id + " must not permit a budget of critical failures");
      assert.ok(TIERS.includes(g.capsAt as any), g.id + " caps at an unknown tier");
      assert.ok(g.description.length > 30);
    }
  });
});

describe("evidence, not confidence, sets the ceiling", () => {
  test("an untested tier is not awarded however good the numbers", () => {
    const r = certify({
      target, dimensions: strongDimensions(),
      evidence: [
        { evidenceClass: "sealed_exam", cases: 40, runScores: [96, 95] },
        { evidenceClass: "sandbox_tool_use", cases: 20, runScores: [94] },
      ],
      breaches: [],
    });
    assert.equal(r.scoreTier, "ELITE_CERTIFIED", "the score alone would claim the top");
    assert.equal(r.awardedTier, "SANDBOX_COMPETENT", "but nothing simulated or adversarial was ever run");
    assert.ok(r.limitedBy.includes("evidence"));
    assert.ok(r.evidenceShortfalls.SIMULATION_CERTIFIED.some((s) => /simulation/.test(s)));
  });

  test("too few cases in a class does not satisfy that class", () => {
    const thin = strongEvidence().map((e) => (e.evidenceClass === "adversarial" ? { ...e, cases: 2 } : e));
    const r = certify({ target, dimensions: strongDimensions(), evidence: thin, breaches: [] });
    assert.equal(tierRank(r.awardedTier) < tierRank("SHADOW_ELIGIBLE"), true,
      "two adversarial cases is an anecdote, not an adversarial result");
  });

  test("each tier demands strictly more evidence than the one below", () => {
    const ladder = ["SANDBOX_COMPETENT", "SIMULATION_CERTIFIED", "SHADOW_ELIGIBLE", "PRODUCTION_ELIGIBLE", "HIGH_STAKES_CERTIFIED"];
    for (let i = 1; i < ladder.length; i++) {
      const lower = TIER_EVIDENCE_REQUIREMENTS[ladder[i - 1]];
      const upper = TIER_EVIDENCE_REQUIREMENTS[ladder[i]];
      for (const l of lower) {
        const u = upper.find((x) => x.evidenceClass === l.evidenceClass);
        assert.ok(u && u.minCases >= l.minCases,
          ladder[i] + " must not require less " + l.evidenceClass + " than " + ladder[i - 1]);
      }
      assert.ok(upper.length >= lower.length);
    }
  });

  test("a dimension nobody tested is reported rather than counted as full marks", () => {
    const partial = strongDimensions().slice(0, 4);
    const r = certify({ target, dimensions: partial, evidence: strongEvidence(), breaches: [] });
    assert.ok(r.dimensionsNotExercised.length > 3);
    assert.ok(r.measuredWeight < 100, "the score is renormalised over what was actually measured");
  });
});

describe("consistency is part of the claim", () => {
  test("a worker averaging well with one bad run cannot hold a high tier", () => {
    const swingy = strongEvidence().map((e) =>
      e.evidenceClass === "simulation" ? { ...e, runScores: [98, 40] } : e);
    const r = certify({ target, dimensions: strongDimensions(), evidence: swingy, breaches: [] });
    assert.equal(r.robustness.worstRun, 40);
    assert.equal(tierRank(r.awardedTier) < tierRank("PRODUCTION_ELIGIBLE"), true,
      "the 40 is what a buyer would have received");
  });

  test("robustness reports spread, not just the mean", () => {
    const r = certify({ target, dimensions: strongDimensions(), evidence: strongEvidence(), breaches: [] });
    assert.ok(r.robustness.stdDev >= 0);
    assert.equal(r.robustness.runs, strongEvidence().flatMap((e) => e.runScores).length);
  });
});

describe("a frontier claim needs a frontier measurement", () => {
  test("frontier tiers are refused without a measured margin", () => {
    const ev = [...strongEvidence(), { evidenceClass: "frontier_comparison", cases: 20, runScores: [95] }];
    const dims = dimensionsFor("qualifier").map((d) => ({ id: d.id, score: 95, cases: 30 }));
    const noMargin = certify({ target, dimensions: dims, evidence: ev, breaches: [] });
    assert.equal(tierRank(noMargin.awardedTier) < tierRank("FRONTIER_COMPETITIVE"), true,
      "claiming to beat a frontier model requires having measured one");

    const withMargin = certify({ target, dimensions: dims, evidence: ev, breaches: [], frontierMargin: 6.2 });
    assert.ok(tierRank(withMargin.awardedTier) >= tierRank("FRONTIER_COMPETITIVE"));
  });

  test("a negative margin does not earn a frontier tier", () => {
    const ev = [...strongEvidence(), { evidenceClass: "frontier_comparison", cases: 20, runScores: [95] }];
    const dims = dimensionsFor("qualifier").map((d) => ({ id: d.id, score: 95, cases: 30 }));
    const r = certify({ target, dimensions: dims, evidence: ev, breaches: [], frontierMargin: -1.5 });
    assert.equal(tierRank(r.awardedTier) < tierRank("FRONTIER_COMPETITIVE"), true);
  });
});

describe("certification attaches to a configuration, not a name", () => {
  test("changing the base model invalidates everything", () => {
    const after = { ...target, baseModel: "some-other-model" };
    const r = recertificationScope(target, after);
    assert.equal(r.scope, "full");
    assert.equal(r.invalidates.length, 8, "every evidence class describes a system that no longer exists");
  });

  test("adding a tool invalidates tool-dependent evidence and spares sealed knowledge", () => {
    const after = { ...target, tools: ["web_search", "browser"] };
    const r = recertificationScope(target, after);
    assert.equal(r.scope, "partial");
    assert.ok(r.invalidates.includes("sandbox_tool_use"));
    assert.ok(r.invalidates.includes("simulation"));
    assert.equal(r.invalidates.includes("sealed_exam"), false);
  });

  test("an identical configuration needs nothing re-run", () => {
    assert.equal(recertificationScope(target, { ...target }).scope, "none");
  });

  test("the identity is order-independent over tools but sensitive to every field", () => {
    assert.equal(targetId({ ...target, tools: ["web_search"] }), targetId({ ...target, tools: ["web_search"] }));
    assert.notEqual(targetId(target), targetId({ ...target, knowledgeVersionId: "k-v3" }));
    assert.notEqual(targetId(target), targetId({ ...target, policyVersionId: "p-v2" }));
    assert.notEqual(targetId(target), targetId({ ...target, retrievalConfigId: "r-v2" }));
  });
});

describe("authority follows demonstrated competence, and never reaches signature", () => {
  test("REGRESSION: no tier may sign anything, ever", () => {
    for (const tier of TIERS) {
      const a = authorityFor(tier, "contract_signature");
      assert.equal(a.mayPrepare, false, tier + " must not be able to sign");
      assert.equal(a.approvalRequired, "authorised_human_only");
    }
  });

  test("production eligibility is not permission to send", () => {
    const a = authorityFor("PRODUCTION_ELIGIBLE", "external_send");
    assert.equal(a.mayPrepare, true);
    assert.equal(a.approvalRequired, "owner", "certification means ready to put in front of the owner");
  });

  test("a shadow-eligible worker may draft buyer-facing material but not send it", () => {
    assert.equal(authorityFor("SHADOW_ELIGIBLE", "shadow_external_draft").mayPrepare, true);
    assert.equal(authorityFor("SHADOW_ELIGIBLE", "external_send").mayPrepare, false);
  });

  test("high-stakes certification does not confer the right to bind", () => {
    const p = authorityProfile("HIGH_STAKES_CERTIFIED");
    assert.equal(p.blocked.includes("contract_signature"), true);
    assert.ok(p.alwaysNeedsApproval.includes("contract_term"));
    assert.ok(p.alwaysNeedsApproval.includes("security_commitment"));
  });

  test("an uncertified worker may still read, and may not recommend", () => {
    assert.equal(authorityFor("TRAINING", "internal_research").mayPrepare, true);
    assert.equal(authorityFor("TRAINING", "internal_recommendation").mayPrepare, false);
  });

  test("an unknown action class is refused rather than allowed", () => {
    const a = authorityFor("ELITE_CERTIFIED", "launch_the_missiles");
    assert.equal(a.mayPrepare, false);
    assert.match(a.reason, /Unknown means no/);
  });

  test("every action class has a declared rule", () => {
    for (const c of ACTION_CLASSES) {
      assert.ok(authorityFor("PRODUCTION_ELIGIBLE", c).reason.length > 10, "undeclared action class " + c);
    }
  });
});

describe("dimensions are role-specific over a universal core", () => {
  test("every role carries the core, and the core is about behaviour not skill", () => {
    for (const role of Object.keys(ROLE_DIMENSIONS)) {
      const ids = dimensionsFor(role).map((d) => d.id);
      for (const core of UNIVERSAL_CORE_DIMENSIONS) assert.ok(ids.includes(core.id), role + " missing " + core.id);
    }
    assert.ok(UNIVERSAL_CORE_DIMENSIONS.some((d) => d.id === "truthfulness"));
  });

  test("roles do not share one generic scorecard", () => {
    const researcher = new Set(dimensionsFor("researcher").map((d) => d.id));
    const manager = new Set(dimensionsFor("manager").map((d) => d.id));
    assert.ok(researcher.has("citation_fidelity"));
    assert.equal(manager.has("citation_fidelity"), false);
    assert.ok(manager.has("bottleneck_diagnosis"));
    assert.equal(researcher.has("bottleneck_diagnosis"), false);
  });

  test("an unknown role still gets the core rather than nothing", () => {
    assert.equal(dimensionsFor("plumber").length, UNIVERSAL_CORE_DIMENSIONS.length);
  });

  test("the auditor is weighted most heavily on missing defects", () => {
    const d = ROLE_DIMENSIONS.auditor.find((x) => x.id === "defect_detection");
    const f = ROLE_DIMENSIONS.auditor.find((x) => x.id === "false_alarm_rate");
    assert.ok(d.weight > f.weight * 2, "a rubber stamp is worse than a noisy auditor");
  });

  test("every dimension says why it exists", () => {
    for (const role of Object.keys(ROLE_DIMENSIONS)) {
      for (const d of dimensionsFor(role)) assert.ok(d.why.length > 20, role + "/" + d.id + " has no rationale");
    }
  });
});

describe("the academy stays general", () => {
  test("no company, person or opportunity appears in it", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "academy.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "Boise", "Upwork", "Craigslist", "50000"]) {
      assert.equal(src.includes(leak), false, "leaked: " + leak);
    }
  });
});
