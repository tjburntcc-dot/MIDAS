/**
 * Guards for team certification and shadow mode.
 *
 * Two properties carry the weight here. A chain of individually-passing workers
 * must be able to fail, or team certification is decoration. And shadow mode's
 * zero-outbound guarantee has to be structural -- checkable by reading the
 * module -- because a promise not to send is not a guarantee.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { certifyTeam, traceFacts, attributeFailures, CHAIN_STAGES } from "./team-certification.ts";
import {
  newShadowSession, recordIntent, recordInternalWork, mayPrepare, sessionGuarantee,
  compareShadow, discrepancyToCandidateExam, isExternal, EXTERNAL_ACTION_CLASSES,
} from "./shadow.ts";
import { tierRank } from "./academy.ts";

/** Facts seeded at the head of a chain, as research would produce them. */
const SEEDED = [
  { id: "F1", statement: "Insurance of $1,000,000 is required", pattern: "1,000,000|insurance requirement",
    strength: "verified", decisive: true, provenance: "buyer document section 4" },
  { id: "F2", statement: "Budget reported as $40,000 by an aggregator, unconfirmed", pattern: "40,000",
    strength: "unverified", decisive: true, provenance: "aggregator listing",
    overstatedPattern: "budget (is|of) \\$?40,000|confirmed budget|\\$40,000 budget" },
  { id: "F3", statement: "Delivery required by year end", pattern: "year end|december",
    strength: "verified", decisive: false, provenance: "buyer document section 9" },
];

function chain(texts: Record<string, string>, carries: Record<string, string[]> = {}) {
  return {
    chainId: "CH-1",
    seeded: SEEDED,
    outputs: CHAIN_STAGES.map((stage) => ({
      stage, text: texts[stage] ?? "", carries: carries[stage] ?? SEEDED.map((f) => f.id),
    })),
  };
}

describe("a chain of passing workers can still fail", () => {
  test("REGRESSION: a decisive fact dropped mid-chain fails the whole chain", () => {
    const full = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Delivery by year end.";
    // Qualification onward forgets the insurance requirement.
    const r = certifyTeam(chain({
      discovery: full, research: full, qualification: "Budget around 40,000, unconfirmed. Delivery by year end.",
      feasibility: "Budget around 40,000. Delivery by year end.",
      commercial: "Budget around 40,000. Delivery by year end.",
      audit: "Reviewed. Budget around 40,000.", manager: "Proceed. Budget around 40,000.",
    }));
    assert.equal(r.passed, false);
    assert.deepEqual(r.decisiveLost, ["F1"], "a decisive fact that did not survive must fail the chain however it was lost");
    assert.ok(r.breaches.some((b) => b.gateId === "CF-MISSED-MANDATORY"));
    assert.match(r.ruling, /CHAIN FAILED/);
  });

  test("REGRESSION: an unverified fact arriving as certain is treated as fabrication", () => {
    // The dangerous direction: the chain makes the output better than the evidence.
    const r = certifyTeam(chain({
      discovery: "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Year end.",
      research: "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Year end.",
      qualification: "Insurance of $1,000,000 required. Budget of $40,000. Year end.",
      feasibility: "Insurance requirement noted. Confirmed budget $40,000. Year end.",
      commercial: "Insurance requirement. The $40,000 budget covers our price. Year end.",
      audit: "Reviewed. insurance requirement, $40,000 budget, year end.",
      manager: "Proceed. insurance requirement, $40,000 budget, year end.",
    }));
    assert.equal(r.passed, false);
    assert.deepEqual(r.decisiveStrengthened, ["F2"]);
    assert.ok(r.breaches.some((b) => b.gateId === "CF-FABRICATION"),
      "promoting a hedge to a certainty is how a chain invents a fact without any worker lying");
  });


  test("REGRESSION: an intermediate summary that omits a fact has not lost it", () => {
    // Found by running the chain on real pipeline artifacts. A feasibility stage
    // that discusses readiness without restating the budget, followed by stages
    // that restate it, delivered the fact. Treating any gap as a loss produced a
    // failed chain that had actually preserved everything.
    const full = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Delivery by year end.";
    const r = certifyTeam(chain({
      discovery: full, research: full, qualification: full,
      feasibility: "Capacity assessment only; nothing new on requirements.",
      commercial: full, audit: full, manager: full,
    }, { feasibility: [] }));
    assert.equal(r.passed, true, "the facts reached the manager: " + JSON.stringify(r.decisiveLost));
    assert.equal(r.fidelity, 100);
    const f1 = r.factFates.find((f) => f.factId === "F1");
    assert.equal(f1.verdict, "dropped_and_recovered");
    assert.equal(f1.droppedAt, "feasibility");
    assert.equal(f1.presentAtEnd, true);
  });

  test("a fact absent from the final stage is lost however often it appeared earlier", () => {
    const full = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Delivery by year end.";
    const r = certifyTeam(chain({
      discovery: full, research: full, qualification: full, feasibility: full, commercial: full,
      audit: full, manager: "Proceed. Budget around 40,000, unconfirmed. Year end.",
    }));
    assert.equal(r.passed, false, "what the owner sees is what survived");
    assert.deepEqual(r.decisiveLost, ["F1"]);
  });

  test("a chain that carries everything at its stated strength passes", () => {
    const honest = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Delivery by year end.";
    const r = certifyTeam(chain({
      discovery: honest, research: honest, qualification: honest, feasibility: honest,
      commercial: honest, audit: honest, manager: honest,
    }));
    assert.equal(r.passed, true);
    assert.equal(r.fidelity, 100);
    assert.match(r.ruling, /preserved every decisive fact/);
  });

  test("claiming to carry a fact the text does not contain counts against the chain", () => {
    const honest = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Year end.";
    const r = certifyTeam(chain({
      discovery: honest, research: honest,
      qualification: "Assessed and passed on.", feasibility: honest, commercial: honest, audit: honest, manager: honest,
    }));
    // The manifest says F1 is carried; the text does not contain it.
    const f1 = r.factFates.find((f) => f.factId === "F1");
    assert.equal(f1.verdict, "misreported", "claiming coverage while dropping the fact is worse than dropping it openly");
    assert.equal(f1.distortedAt, "qualification");
    assert.equal(r.passed, false);
  });

  test("an incidental fact lost does not fail the chain", () => {
    const withoutIncidental = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed.";
    const full = withoutIncidental + " Delivery by year end.";
    const r = certifyTeam(chain({
      discovery: full, research: full, qualification: withoutIncidental, feasibility: withoutIncidental,
      commercial: withoutIncidental, audit: withoutIncidental, manager: withoutIncidental,
    }, { qualification: ["F1", "F2"], feasibility: ["F1", "F2"], commercial: ["F1", "F2"], audit: ["F1", "F2"], manager: ["F1", "F2"] }));
    assert.equal(r.passed, true, "summaries are allowed to be shorter than their inputs");
    assert.ok(r.fidelity < 100);
  });

  test("a claim nobody supplied is caught wherever it enters", () => {
    const honest = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Year end.";
    const r = certifyTeam(chain({
      discovery: honest, research: honest, qualification: honest, feasibility: honest,
      commercial: honest + " We have delivered twelve comparable projects.",
      audit: honest, manager: honest,
    }), [{ id: "INV-1", pattern: "delivered (twelve|a dozen|\\d+) comparable", describe: "Track record that no stage supplied" }]);
    assert.equal(r.passed, false);
    assert.equal(r.inventions[0].stage, "commercial");
    assert.ok(r.breaches.some((b) => b.gateId === "CF-FABRICATION"));
  });

  test("authority is checked per stage, not assumed to survive the handoff", () => {
    const honest = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Year end.";
    const run = {
      ...chain({ discovery: honest, research: honest, qualification: honest, feasibility: honest, commercial: honest, audit: honest, manager: honest }),
      grantedAuthority: { commercial: ["draft_creation"], research: ["internal_research"] },
    };
    run.outputs.find((o) => o.stage === "commercial").claimedAuthority = ["pricing_commitment"];
    const r = certifyTeam(run);
    assert.equal(r.passed, false);
    assert.equal(r.authorityViolations[0].claimed, "pricing_commitment");
    assert.ok(r.breaches.some((b) => b.gateId === "CF-UNAUTHORIZED-COMMITMENT"));
  });

  test("repair is attributed to where the loss happened, not where it showed", () => {
    const full = "Requires insurance of $1,000,000. Budget reported around 40,000, unconfirmed. Year end.";
    // Only the insurance requirement is dropped, and only at qualification.
    // Everything downstream carries what it received, so the attribution has
    // exactly one candidate and the test is measuring what it claims to.
    const without = "Budget around 40,000, unconfirmed. Year end.";
    const r = certifyTeam(chain({
      discovery: full, research: full, qualification: without,
      feasibility: without, commercial: without,
      audit: "Reviewed. " + without, manager: "Proceed. " + without,
    }));
    const a = attributeFailures(r);
    assert.equal(a.worstStage, "qualification", "the consequence surfaced at commercial; the fact died at qualification");
    assert.match(a.recommendation, /Repair qualification first/);
  });

  test("the chain covers the stages a real pursuit passes through", () => {
    for (const s of ["discovery", "research", "qualification", "feasibility", "commercial", "audit", "manager"]) {
      assert.ok((CHAIN_STAGES as readonly string[]).includes(s));
    }
  });
});

describe("shadow mode cannot send, structurally", () => {
  test("REGRESSION: the module contains no transport of any kind", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "shadow.ts"), "utf8");
    for (const forbidden of ["fetch(", "http://", "https://", "nodemailer", "axios", "XMLHttpRequest", "net.connect", "child_process"]) {
      assert.equal(src.includes(forbidden), false, "shadow mode must not be able to reach anything: " + forbidden);
    }
  });

  test("an external action becomes a record awaiting approval, never a send", () => {
    const s = newShadowSession("S1", "OPP-1", "2026-01-01T00:00:00Z");
    const intent = recordIntent(s, {
      id: "I1", actionClass: "external_send", target: "buyer contact",
      content: "Full text of what would have been sent.", producedBy: "sales@v1",
      producerTier: "SHADOW_ELIGIBLE", requiresApproval: "owner",
    });
    assert.equal(intent.status, "AWAITING_OWNER_APPROVAL");
    assert.equal(s.outboundActionsTaken, 0);
    const g = sessionGuarantee(s);
    assert.equal(g.outboundActionsTaken, 0);
    assert.equal(g.allAwaitingApproval, true);
  });

  test("the recorded intent keeps the full content, because a redacted one cannot be reviewed", () => {
    const s = newShadowSession("S2", "OPP-2", "2026-01-01T00:00:00Z");
    const body = "Dear buyer, here is the complete proposal text with the price in it.";
    const i = recordIntent(s, { id: "I1", actionClass: "pricing_commitment", target: "buyer", content: body, producedBy: "w", producerTier: "PRODUCTION_ELIGIBLE", requiresApproval: "owner" });
    assert.equal(i.content, body);
  });

  test("internal work is recorded separately from external intent", () => {
    const s = newShadowSession("S3", "OPP-3", "2026-01-01T00:00:00Z");
    recordInternalWork(s, "research", "Read the primary source.");
    assert.equal(s.internalWork.length, 1);
    assert.equal(s.intents.length, 0);
  });

  test("every external action class is recognised as external", () => {
    for (const c of EXTERNAL_ACTION_CLASSES) assert.equal(isExternal(c), true);
    assert.equal(isExternal("internal_research"), false);
    assert.equal(isExternal("draft_creation"), false);
  });
});

describe("preparation is gated by certification, execution by the owner", () => {
  const base = { minTierRequired: "PRODUCTION_ELIGIBLE", tierRank };

  test("an under-certified worker may not even draft the external message", () => {
    const r = mayPrepare({ ...base, actionClass: "external_send", workerTier: "SIMULATION_CERTIFIED", teamCertified: true, auditorCertified: true });
    assert.equal(r.allowed, false);
    assert.match(r.ruling, /PREPARATION REFUSED/);
  });

  test("REGRESSION: an uncertified chain blocks external preparation even with a strong worker", () => {
    const r = mayPrepare({ ...base, actionClass: "external_send", workerTier: "HIGH_STAKES_CERTIFIED", teamCertified: false, auditorCertified: true });
    assert.equal(r.allowed, false);
    assert.match(r.reasons.join(" "), /handoffs/);
  });

  test("an unaudited buyer-facing document is refused", () => {
    const r = mayPrepare({ ...base, actionClass: "external_send", workerTier: "HIGH_STAKES_CERTIFIED", teamCertified: true, auditorCertified: false });
    assert.equal(r.allowed, false);
    assert.match(r.reasons.join(" "), /certified auditor/);
  });

  test("all three satisfied permits preparation and still requires the owner", () => {
    const r = mayPrepare({ ...base, actionClass: "external_send", workerTier: "PRODUCTION_ELIGIBLE", teamCertified: true, auditorCertified: true });
    assert.equal(r.allowed, true);
    assert.match(r.ruling, /Execution still requires owner approval/);
  });

  test("internal work does not need a certified chain or auditor", () => {
    const r = mayPrepare({ actionClass: "internal_research", workerTier: "TRAINING", teamCertified: false, auditorCertified: false, minTierRequired: "TRAINING", tierRank });
    assert.equal(r.allowed, true, "gating trivial internal work would make the whole system unusable");
  });
});

describe("discrepancies are the product of shadow running", () => {
  test("divergence from the owner feeds the foundry; agreement is noted, not celebrated", () => {
    const diverged = compareShadow({ opportunityId: "O1", midasRecommendation: "pursue", ownerDecision: "decline" });
    assert.equal(diverged.category, "midas_diverged_from_owner");
    assert.equal(diverged.feedsFoundry, true);

    const matched = compareShadow({ opportunityId: "O2", midasRecommendation: "decline", ownerDecision: "decline" });
    assert.equal(matched.feedsFoundry, false);
    assert.match(matched.findings.join(" "), /may have been influenced by the recommendation/);
  });

  test("agreement with an independent assessment carries a warning about shared sources", () => {
    const agreed = compareShadow({ opportunityId: "O3", midasRecommendation: "pursue", independentRecommendation: "pursue" });
    assert.equal(agreed.agreesWithIndependent, true);
    assert.match(agreed.findings.join(" "), /same source/);
  });

  test("an observed outcome is marked as the only non-opinion evidence", () => {
    const r = compareShadow({ opportunityId: "O4", midasRecommendation: "pursue", observedOutcome: "won at $1,400" });
    assert.equal(r.category, "outcome_known");
    assert.match(r.findings.join(" "), /not somebody's opinion/);
  });

  test("a discrepancy becomes a candidate exam, not a promoted one", () => {
    const c = compareShadow({ opportunityId: "O5", midasRecommendation: "pursue", ownerDecision: "decline" });
    const exam = discrepancyToCandidateExam(c, { whatWasMissed: "the venue's own terms", failureClass: "channel_ineligibility" });
    assert.equal(exam.status, "candidate");
    assert.ok(exam.requiredBeforePromotion.length >= 4);
    assert.ok(exam.requiredBeforePromotion.some((s) => /careful worker passes it/.test(s)),
      "an exam only a trick can fail teaches tricks");
  });
});

describe("these layers stay general", () => {
  test("no company, person or opportunity appears in them", () => {
    for (const f of ["team-certification.ts", "shadow.ts"]) {
      const src = readFileSync(repoPath("packages", "eval", "src", f), "utf8");
      for (const leak of ["Idaho", "AEYC", "Hemmer", "Mason", "Boise", "Upwork", "Craigslist"]) {
        assert.equal(src.includes(leak), false, f + " leaked: " + leak);
      }
    }
  });
});
