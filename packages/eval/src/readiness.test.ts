/**
 * Guards for company readiness.
 *
 * Two properties carry the weight. Unverified must never count as verified,
 * because the whole point is to stop a reported fact from being relied on at the
 * moment it matters. And nothing preparable may sit in a human's queue
 * unprepared, because that is the failure mode where the system does the noticing
 * and leaves the work.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import {
  readinessProfile, routeReadinessWork, assessOpportunityFit, rankByReadiness,
  CAPABILITIES, READINESS_DIMENSIONS,
} from "./readiness.ts";

const items = [
  { id: "R1", dimension: "entity", requirement: "Registered legal entity in good standing", status: "reported_unverified",
    evidence: "Reported by the owner; never checked against a registry.", gates: ["sign_binding_contract", "invoice_and_collect", "bid_public_sector"],
    actor: "midas", preparable: true, whyItGates: "Every commercial commitment rests on it." },
  { id: "R2", dimension: "entity", requirement: "An adult who can bind the company and has agreed to", status: "absent",
    evidence: "No adult has been identified or asked.", gates: ["sign_binding_contract"],
    actor: "adult_signer", preparable: true, whyItGates: "A signature nobody can give blocks every binding commitment." },
  { id: "R3", dimension: "financial", requirement: "Payment collection", status: "verified",
    evidence: "Operational account confirmed.", gates: ["invoice_and_collect"], actor: "owner", preparable: false, whyItGates: "Without it, delivered work cannot be paid for." },
  { id: "R4", dimension: "insurance", requirement: "Liability cover", status: "absent",
    evidence: "None held.", gates: ["bid_enterprise", "carry_client_risk"], actor: "owner", preparable: true,
    whyItGates: "Larger buyers require it before contracting." },
  { id: "R5", dimension: "credibility", requirement: "Evidence of delivered work", status: "absent",
    evidence: "No delivered project.", gates: ["evidence_past_work"], actor: "midas", preparable: true, whyItGates: "Scored explicitly by most buyers." },
  { id: "R6", dimension: "security", requirement: "Stated data handling practice", status: "unknown",
    evidence: "Never assessed.", gates: ["handle_personal_data"], actor: "midas", preparable: true, whyItGates: "Required before touching anyone's records." },
];

describe("unverified is not verified, and absent is not unverified", () => {
  test("a reported-but-unchecked fact does not unlock its capabilities", () => {
    const p = readinessProfile(items);
    assert.equal(p.availableCapabilities.includes("sign_binding_contract"), false);
    assert.equal(p.availableCapabilities.includes("bid_public_sector"), false,
      "a fact nobody checked is exactly the kind that fails when relied on");
  });

  test("load-bearing unverified facts are surfaced, most load-bearing first", () => {
    const p = readinessProfile(items);
    assert.equal(p.unverifiedLoadBearing[0].id, "R1");
    assert.equal(p.unverifiedLoadBearing[0].gates.length, 3);
  });

  test("never-checked is tracked separately from known-absent", () => {
    const p = readinessProfile(items);
    assert.deepEqual(p.neverChecked.map((i) => i.id), ["R6"]);
    assert.equal(p.byDimension.entity.absent, 1);
    assert.equal(p.byDimension.entity.reported, 1);
  });

  test("unchecked is separated from missing, because they need different work", () => {
    const p = readinessProfile(items);
    // Gated only by a reported-but-unchecked entity fact: one lookup away.
    assert.ok(p.unconfirmedOnly.includes("bid_public_sector"));
    // Gated by an adult signer who does not exist: real work, not a lookup.
    assert.ok(p.blockedByAbsence.includes("sign_binding_contract"));
    assert.equal(p.unconfirmedOnly.some((c) => p.blockedByAbsence.includes(c)), false);
    assert.match(p.summary, /held back only by unchecked facts/);
  });

  test("a capability with every gate verified is available", () => {
    const p = readinessProfile([{ ...items[2], gates: ["invoice_and_collect"] }]);
    assert.deepEqual(p.availableCapabilities, ["invoice_and_collect"]);
  });

  test("a capability nothing gates is reported as ungoverned, not as available", () => {
    const p = readinessProfile(items);
    assert.ok(p.ungovernedCapabilities.length > 0);
    for (const c of p.ungovernedCapabilities) {
      assert.equal(p.availableCapabilities.includes(c), false,
        "claiming a capability because nothing was written down about it would be the worst kind of pass");
    }
  });
});

describe("nothing preparable waits on a human unprepared", () => {
  test("preparable items route to MIDAS before the owner sees them", () => {
    const r = routeReadinessWork(items);
    assert.ok(r.midasCanPrepare.some((i) => i.id === "R2"),
      "the signer conversation can be prepared even though only an adult can have it");
    assert.ok(r.midasCanPrepare.some((i) => i.id === "R4"));
    assert.deepEqual(r.handedOverPrematurely, []);
    assert.match(r.ruling, /Nothing is waiting on a human/);
  });

  test("an already-prepared item moves to the human queue", () => {
    const prepared = items.map((i) => (i.id === "R2" ? { ...i, prepared: "packet written" } : i));
    const r = routeReadinessWork(prepared);
    assert.ok(r.awaitingHuman.some((i) => i.id === "R2"));
    assert.equal(r.midasCanPrepare.some((i) => i.id === "R2"), false);
  });

  test("REGRESSION: a preparable item sitting in a human queue is called out", () => {
    // The failure this exists to prevent: the system notices the work and hands
    // over a to-do list instead of a finished document.
    const bad = [{ ...items[3], actor: "owner", preparable: true, prepared: undefined }];
    const r = routeReadinessWork(bad);
    // It must be routed to preparation, never left in the human queue unprepared.
    assert.deepEqual(r.handedOverPrematurely, []);
    assert.equal(r.midasCanPrepare.length, 1);
  });

  test("work is ordered by how many capabilities it unblocks", () => {
    const r = routeReadinessWork(items);
    const all = [...r.midasCanDoNow, ...r.midasCanPrepare, ...r.awaitingHuman];
    assert.equal(all.find((i) => i.gates.length === 3).id, "R1");
    assert.equal(r.midasCanDoNow[0].id, "R1", "the highest-leverage item MIDAS can do alone comes first");
  });

  test("verified items are not routed at all", () => {
    const r = routeReadinessWork(items);
    const all = [...r.midasCanDoNow, ...r.midasCanPrepare, ...r.awaitingHuman];
    assert.equal(all.some((i) => i.id === "R3"), false);
  });
});

describe("readiness annotates opportunities, it never deletes them", () => {
  test("a blocked opportunity keeps its unlock path", () => {
    const fit = assessOpportunityFit({ opportunityId: "O1", requiredCapabilities: ["sign_binding_contract", "invoice_and_collect"], items });
    assert.equal(fit.eligibleNow, false);
    assert.ok(fit.unlockPath.length >= 2);
    assert.match(fit.ruling, /Not discarded/);
    assert.equal(fit.unlockPath[0].requirement, items[0].requirement, "most load-bearing blocker first");
  });

  test("an opportunity needing only satisfied capabilities is pursuable", () => {
    const fit = assessOpportunityFit({ opportunityId: "O2", requiredCapabilities: ["invoice_and_collect"], items: [items[2]] });
    assert.equal(fit.eligibleNow, true);
    assert.deepEqual(fit.missing, []);
  });

  test("ranking puts reachable work first and shallow blocks above deep ones", () => {
    const fits = [
      { opportunityId: "deep", requiredCapabilities: [], missing: ["a"], eligibleNow: false, unlockPath: [{ requirement: "x", actor: "owner", preparable: true }, { requirement: "y", actor: "owner", preparable: true }], ruling: "" },
      { opportunityId: "now", requiredCapabilities: [], missing: [], eligibleNow: true, unlockPath: [], ruling: "" },
      { opportunityId: "shallow", requiredCapabilities: [], missing: ["a"], eligibleNow: false, unlockPath: [{ requirement: "x", actor: "owner", preparable: true }], ruling: "" },
    ];
    assert.deepEqual(rankByReadiness(fits).map((f) => f.opportunityId), ["now", "shallow", "deep"]);
    assert.equal(rankByReadiness(fits).length, fits.length, "ranking is presentation, never deletion");
  });
});

describe("readiness stays general", () => {
  test("no company, person, industry or amount appears in it", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "readiness.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "Boise", "Stripe", "LinkedIn", "nonprofit", "50000"]) {
      assert.equal(src.includes(leak), false, "leaked: " + leak);
    }
  });

  test("dimensions and capabilities are declared, not inferred from a caller's strings", () => {
    assert.ok(READINESS_DIMENSIONS.length >= 8);
    assert.ok(CAPABILITIES.includes("sign_binding_contract"));
  });
});
