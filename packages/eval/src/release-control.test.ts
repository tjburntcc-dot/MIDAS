/**
 * Guards for release control.
 *
 * The invariant that makes this a safety mechanism rather than a second opinion:
 * the gate can only restrict. If a refactor ever lets it convert a refusal into
 * a proceed, the test below is what catches it.
 *
 * The scenario throughout is the one that produced the defect: the same
 * configuration, given the same migration three times, escalated once and
 * proceeded twice.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { classifyConsequence, releaseDecision, trustworthyFor, CLASS_POLICY, CONSEQUENCE_CLASSES } from "./release-control.ts";

/** The real case: migrate 40,000 records, backup 41 days stale and never restored. */
const MIGRATION = {
  id: "A1", description: "Migrate customer records and decommission the source",
  reversible: false, rollbackVerified: false, destroysData: true,
  touchesProduction: true, affectsThirdParty: true, changesPrivilege: false,
  external: false, irreplaceableRecords: 40000,
};

/** A copy fix on a static site, revertible in one command. */
const TYPO = {
  id: "A2", description: "Correct a typo in a thank-you message",
  reversible: true, rollbackVerified: true, destroysData: false,
  touchesProduction: true, affectsThirdParty: false, changesPrivilege: false,
  external: false, irreplaceableRecords: 0,
};

describe("consequence is computed, not judged", () => {
  test("destroying data with no verified restore is catastrophic", () => {
    const c = classifyConsequence(MIGRATION);
    assert.equal(c.level, "catastrophic");
    assert.ok(c.reasons.some((r) => /no verified restore/i.test(r)));
    assert.ok(c.reasons.some((r) => /40000 records would be unrecoverable/i.test(r)));
  });

  test("a reversible contained change is not dressed up as dangerous", () => {
    assert.equal(classifyConsequence(TYPO).level, "recoverable");
    assert.equal(classifyConsequence({ ...TYPO, touchesProduction: false }).level, "trivial");
  });

  test("unestablished reversibility is treated as irreversible", () => {
    const c = classifyConsequence({ ...TYPO, reversible: false });
    assert.equal(c.level, "irreversible");
  });

  test("widening privilege and reaching outside both raise the class", () => {
    assert.equal(classifyConsequence({ ...TYPO, changesPrivilege: true }).level, "costly");
    assert.equal(classifyConsequence({ ...TYPO, external: true }).level, "costly");
  });

  test("every class has a declared policy and a stated reason", () => {
    for (const c of CONSEQUENCE_CLASSES) {
      assert.ok(CLASS_POLICY[c], "no policy for " + c);
      assert.ok(CLASS_POLICY[c].why.length > 30, c + " has no rationale");
    }
  });
});

describe("one stochastic sample cannot authorise an irreversible act", () => {
  test("REGRESSION: the worker recommends proceeding and the gate blocks it anyway", () => {
    // This is the run that happened twice out of three.
    const r = releaseDecision({ facts: MIGRATION, workerRecommendation: "proceed" });
    assert.equal(r.mayProceed, false);
    assert.equal(r.decision, "blocked");
    assert.match(r.ruling, /BLOCKED/);
    assert.match(CLASS_POLICY.catastrophic.why, /No approval makes this safe/);
  });

  test("owner approval does not unblock a catastrophic action", () => {
    const r = releaseDecision({ facts: MIGRATION, workerRecommendation: "proceed", ownerApproved: true, professionalApproved: true });
    assert.equal(r.mayProceed, false, "the missing restore is what makes it safe, not a signature");
  });

  test("a verified restore turns a block into an owner decision, because the records are then recoverable", () => {
    const r = releaseDecision({ facts: { ...MIGRATION, rollbackVerified: true }, workerRecommendation: "proceed" });
    assert.equal(r.decision, "requires_owner");
    assert.equal(r.mayProceed, false);
    assert.equal(releaseDecision({ facts: { ...MIGRATION, rollbackVerified: true }, workerRecommendation: "proceed", ownerApproved: true }).mayProceed, true);
  });

  test("REGRESSION: the gate can only restrict, never authorise", () => {
    // Across every consequence class and both recommendations, a worker that
    // wants to stop is never overruled into proceeding.
    for (const facts of [MIGRATION, TYPO, { ...TYPO, reversible: false }, { ...TYPO, external: true }]) {
      const stop = releaseDecision({ facts, workerRecommendation: "escalate", ownerApproved: false });
      assert.equal(stop.mayProceed, false, facts.id + ": a refusal was converted into a proceed");
    }
  });

  test("a worker that wants to stop on a trivial action is still respected", () => {
    const r = releaseDecision({ facts: TYPO, workerRecommendation: "escalate" });
    assert.equal(r.decision, "requires_owner");
    assert.equal(r.mayProceed, false);
  });

  test("a worker that wants to proceed on a trivial action is not obstructed", () => {
    const r = releaseDecision({ facts: { ...TYPO, touchesProduction: false }, workerRecommendation: "proceed" });
    assert.equal(r.mayProceed, true);
    assert.match(CLASS_POLICY.trivial.why, /approval meaningless everywhere/);
  });
});

describe("disagreement between samples is itself a finding", () => {
  test("REGRESSION: the observed two-of-three split holds the decision", () => {
    // The exact pattern measured: proceed, escalate, proceed.
    const r = releaseDecision({
      facts: { ...MIGRATION, rollbackVerified: true, destroysData: false },
      workerRecommendation: "proceed",
      samples: ["proceed", "escalate", "proceed"],
    });
    assert.ok(r.sampleAgreement < 1);
    assert.equal(r.decision, "requires_owner");
    assert.match(r.notes.join(" "), /disagreed/);
    assert.match(r.notes.join(" "), /whichever answer is more common/);
  });

  test("unanimous samples add no restriction of their own", () => {
    const r = releaseDecision({
      facts: { ...TYPO, touchesProduction: false },
      workerRecommendation: "proceed",
      samples: ["proceed", "proceed", "proceed"],
    });
    assert.equal(r.sampleAgreement, 1);
    assert.equal(r.mayProceed, true);
  });

  test("a single sample is not treated as agreement", () => {
    const r = releaseDecision({ facts: TYPO, workerRecommendation: "proceed", samples: ["proceed"] });
    assert.equal(r.sampleAgreement, null, "one completion is not a vote");
  });
});

describe("how often right is not the same as safe", () => {
  test("two-thirds agreement is not enough for an irreversible action", () => {
    const t = trustworthyFor("irreversible", 0.67);
    assert.equal(t.trusted, false);
    assert.match(t.reason, /not partly safe/);
  });

  test("the same agreement is fine for a recoverable one", () => {
    assert.equal(trustworthyFor("recoverable", 0.67).trusted, true);
  });

  test("catastrophic and irreversible both demand unanimity", () => {
    assert.equal(trustworthyFor("catastrophic", 0.99).trusted, false);
    assert.equal(trustworthyFor("irreversible", 0.99).trusted, false);
    assert.equal(trustworthyFor("irreversible", 1).trusted, true);
  });
});

describe("release control stays general and has no reach", () => {
  test("no company, person or opportunity appears in it", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "release-control.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "Boise", "Upwork", "Craigslist"]) {
      assert.equal(src.includes(leak), false, "leaked: " + leak);
    }
  });

  test("it decides and does not act", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "release-control.ts"), "utf8");
    for (const t of ["fetch(", "child_process", "node:http", "exec"]) {
      assert.equal(src.includes(t), false, "a gate that can act is not a gate: " + t);
    }
  });
});
