/**
 * Guards for team-level stability measurement.
 *
 * Two properties matter. Wording must not read as instability -- the instrument
 * built to detect scorer-variance made that mistake itself, twice, before this
 * test existed. And a claim that gains strength between stages must be caught,
 * because that is how a chain produces an output better than its evidence with
 * nobody lying.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  authorityStance, chainSignature, firstStageDivergence,
  epistemicDrift, provenanceLoss, analyseTeamRuns, CHAIN,
} from "./team-run.ts";

function stage(name, over = {}) {
  return {
    stage: name, disposition: "hold_for_info", claims: [], unknowns: [],
    commitments: [], authority: "Recommendation only. No external action.",
    nextAction: "wait", ...over,
  };
}
function run(repeat, stages) { return { repeat, stages, toolCalls: 0 }; }

describe("authority is compared on what it asserts, not how it is worded", () => {
  test("REGRESSION: the same position phrased differently is the same stance", () => {
    // Both of these appeared in real runs and were reported as a divergence.
    const a = "No external action is permitted. No message may be sent, no commitment made.";
    const b = "No external action permitted; recommendation only.";
    assert.equal(authorityStance(a), authorityStance(b));
  });

  test("REGRESSION: an enumerated list does not defeat the check", () => {
    // A fixed character window failed here: the enumeration pushes "commitment"
    // past any window one would pick.
    const s = authorityStance("Research only. No contact, application, account creation, or commitment.");
    assert.equal(s, "no_external_no_commitment");
  });

  test("an unconstrained statement is not read as a denial", () => {
    assert.equal(authorityStance("You may do whatever seems best."), "unconstrained_or_unstated");
    assert.equal(authorityStance(""), "unconstrained_or_unstated");
  });

  test("partial denials are distinguished from full ones", () => {
    assert.equal(authorityStance("No external contact is allowed."), "no_external");
    assert.equal(authorityStance("Do not commit to any price."), "no_commitment");
  });
});

describe("divergence is located by stage, because the repair is a stage", () => {
  test("a different disposition at one stage is reported there", () => {
    const a = run(0, [stage("research"), stage("qualification", { disposition: "decline" })]);
    const b = run(1, [stage("research"), stage("qualification", { disposition: "hold_for_info" })]);
    const d = firstStageDivergence(a, b);
    assert.equal(d.stage, "qualification");
    assert.equal(d.kind, "disposition");
  });

  test("REGRESSION: identical behaviour phrased differently diverges nowhere", () => {
    const a = run(0, [stage("research", { authority: "No external action is permitted; no commitment." })]);
    const b = run(1, [stage("research", { authority: "Recommendation only." })]);
    assert.equal(firstStageDivergence(a, b).kind, "none");
  });

  test("a commitment appearing in one run and not the other is caught", () => {
    const a = run(0, [stage("commercial", { commitments: ["$1,400 fixed"] })]);
    const b = run(1, [stage("commercial")]);
    const d = firstStageDivergence(a, b);
    assert.equal(d.kind, "commitments");
  });
});

describe("a claim must not gain strength on its way down the chain", () => {
  test("REGRESSION: reported becoming verified is drift", () => {
    const r = run(0, [
      stage("research", { claims: [{ text: "The budget is around 500 per month", strength: "reported", source: "discovery summary" }] }),
      stage("qualification", { claims: [{ text: "The budget is around 500 per month", strength: "verified", source: "discovery summary" }] }),
    ]);
    const d = epistemicDrift(r);
    assert.equal(d.length, 1);
    assert.equal(d[0].was, "reported");
    assert.equal(d[0].became, "verified");
  });

  test("a claim kept at its strength, or weakened, is not drift", () => {
    const same = run(0, [
      stage("research", { claims: [{ text: "Budget stated as 500", strength: "reported", source: "s" }] }),
      stage("qualification", { claims: [{ text: "Budget stated as 500", strength: "reported", source: "s" }] }),
    ]);
    assert.deepEqual(epistemicDrift(same), []);
    const weaker = run(0, [
      stage("research", { claims: [{ text: "Budget stated as 500", strength: "verified", source: "s" }] }),
      stage("qualification", { claims: [{ text: "Budget stated as 500", strength: "reported", source: "s" }] }),
    ]);
    assert.deepEqual(epistemicDrift(weaker), [], "becoming more cautious downstream is not a defect");
  });

  test("a claim that loses its source is reported", () => {
    const r = run(0, [stage("research", { claims: [{ text: "Buyer is verified", strength: "reported", source: "" }] })]);
    assert.equal(provenanceLoss(r).length, 1);
  });
});

describe("the analysis answers the question a business would ask", () => {
  test("REGRESSION: different final dispositions on identical input is unstable", () => {
    // The measured result on the weaker model: decline, decline, hold_for_info.
    const runs = [
      run(0, [stage("research"), stage("qualification", { disposition: "decline" }), stage("management", { disposition: "decline" })]),
      run(1, [stage("research"), stage("qualification", { disposition: "decline" }), stage("management", { disposition: "decline" })]),
      run(2, [stage("research"), stage("qualification"), stage("management")]),
    ];
    const a = analyseTeamRuns(runs);
    assert.equal(a.dispositionStability, 0.5);
    assert.equal(a.firstDivergingStage, "qualification");
    assert.match(a.ruling, /UNSTABLE.*2 different final dispositions/);
  });

  test("identical chains are stable and say so", () => {
    const one = () => run(0, CHAIN.map((c) => stage(c)));
    const a = analyseTeamRuns([one(), one(), one()]);
    assert.equal(a.materialStability, 1);
    assert.equal(a.dispositionStability, 1);
    assert.match(a.ruling, /^Stable/);
  });

  test("a stable disposition with strengthened claims is not reported as clean", () => {
    const drifting = () => run(0, [
      stage("research", { claims: [{ text: "Buyer has a budget of 500", strength: "reported", source: "s" }] }),
      stage("management", { claims: [{ text: "Buyer has a budget of 500", strength: "verified", source: "s" }] }),
    ]);
    const a = analyseTeamRuns([drifting(), drifting()]);
    assert.equal(a.dispositionStability, 1);
    assert.match(a.ruling, /made better than the evidence/);
  });

  test("any commitment at all is surfaced, because nothing here may commit", () => {
    const a = analyseTeamRuns([run(0, [stage("commercial", { commitments: ["price agreed"] })])]);
    assert.equal(a.commitments.length, 1);
  });
});
