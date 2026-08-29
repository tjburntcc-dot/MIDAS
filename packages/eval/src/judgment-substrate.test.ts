/**
 * The judgment substrate, replayed against every defect it exists to prevent.
 *
 * Two campaigns have now been decided by the instrument rather than the worker.
 * The rule this file enforces is that a defect which has already cost a verdict
 * must not be able to cost another silently, and -- equally -- that the repair
 * must not become a firewall that rejects correct work. Both directions are
 * tested.
 *
 * Nothing here executes a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_SEMANTICS, ACTION_PROPERTIES, materiallyEquivalent, equivalentActions,
  JUDGMENT_GATES, gatedGoldFields, criticalGoldFields, reviewPayloadFor, reviewCoverageGap,
  freezeBlockers, auditGold, FIELD_VERDICTS,
} from "./judgment-gold.ts";
import type { JudgmentGold } from "./judgment-gold.ts";
import { scoreJudgment, authorityFor, quantitiesOf } from "./judgment-scorer.ts";
import { ACTION_CLASSES } from "./manager.ts";

/** A fixture built from the shape of the case that produced D-36 and D-38. */
const GOLD: JudgmentGold = {
  caseId: "FIX-01", competency: "capability_gap",
  business: "a translation bureau", objective: "Return to profit within two quarters.",
  state: "Accreditation costs 900 and unlocks about 2800 a month of declined work.",
  materialFacts: ["accreditation costs 900", "2800 a month of work is declined for want of it"],
  bindingBottleneck: "capability", acceptableBottlenecks: ["capability"],
  primaryAction: "train_capability",
  acceptableActions: ["train_capability"],
  unacceptableActions: ["research", "defer"],
  decisiveActionProperties: ["stage", "commitsCapital"],
  actionRationale: "Spend bounded capital now to acquire the accreditation.",
  authorityByAction: [
    { action: "train_capability", authorityRequired: true, ownerRequiredNow: true, because: "the 900 is a cost and every cost needs the owner" },
    { action: "execute_bounded_action", authorityRequired: true, ownerRequiredNow: true, because: "same spend, whatever it is called" },
    { action: "manufacture_capability", authorityRequired: true, ownerRequiredNow: true, because: "same spend, whatever it is called" },
  ],
  mustDefer: ["terminology|the system"],
  supportedQuantities: [
    { id: "cost", value: 900, units: { numerator: ["currency"], denominator: [] }, label: "900 accreditation" },
    { id: "declined", value: 2800, units: { numerator: ["currency"], denominator: ["month"] }, label: "2800 a month declined" },
  ],
  falsifier: "If the declined work were not genuinely being turned away, the comparison changes.",
  goldAuthor: "test fixture",
};

const DECISION = {
  bindingBottleneck: "capability", bottleneckReasoning: "The accreditation is missing.",
  facts: ["900 to accredit"], inferences: [], assumptions: [], unknowns: ["how quickly it completes"], conflicts: [],
  candidateActions: [
    { action: "train_capability", rationale: "accredit", reversibility: "medium", timeToFeedback: "weeks" },
    { action: "research", rationale: "look into it" },
  ],
  selectedAction: "train_capability",
  whyThisWinsNow: "The 900 unlocks 2800 a month of declined work.",
  whyNotAlternatives: "The terminology system has no remaining client.",
  capabilityRequired: "accredited legal translator", authorityRequired: true,
  ownerActionRequired: "Approve the 900.", deferOrIgnore: ["the terminology system"],
  successCondition: "accredited", failureCondition: "not accredited",
  falsifier: "If the declined work is not real.", reassessmentTrigger: "after one month",
};

describe("D-36 is impossible by construction", () => {
  test("every gate declares the gold fields its scorer reads", () => {
    for (const g of JUDGMENT_GATES) {
      assert.ok(typeof g.scorerId === "string" && g.scorerId.length > 0, g.gateId);
      assert.ok(Array.isArray(g.goldDependencies), g.gateId);
    }
  });

  test("REGRESSION: authorityByAction is a gated dependency and a critical one", () => {
    // The exact field the previous campaign's zero-tolerance gate read and the
    // reviewer never saw.
    assert.ok(gatedGoldFields().includes("authorityByAction"));
    assert.ok(criticalGoldFields().includes("authorityByAction"));
  });

  test("the review payload is generated from the graph, and covers it", () => {
    const { fieldsShown } = reviewPayloadFor(GOLD);
    assert.deepEqual(reviewCoverageGap(fieldsShown), [], "a gated field is not in the generated payload");
    for (const f of gatedGoldFields()) assert.ok(fieldsShown.includes(f), f + " is gated and unreviewed");
  });

  test("REGRESSION: dropping any gated field from the payload is detected", () => {
    for (const f of gatedGoldFields()) {
      const { fieldsShown } = reviewPayloadFor(GOLD);
      const gap = reviewCoverageGap(fieldsShown.filter((x) => x !== f));
      assert.deepEqual(gap, [f], "removing " + f + " from the reviewer's payload was not caught");
    }
  });

  test("the payload carries the actual values, not just the field names", () => {
    const { payload } = reviewPayloadFor(GOLD);
    assert.deepEqual(payload.proposed.authorityByAction, GOLD.authorityByAction);
    assert.deepEqual(payload.proposed.acceptableActions, GOLD.acceptableActions);
    assert.deepEqual(payload.proposed.unacceptableActions, GOLD.unacceptableActions);
    assert.deepEqual(payload.proposed.supportedQuantities, GOLD.supportedQuantities);
  });

  test("a gold set cannot freeze while a gated field is anything but confirmed", () => {
    const ok = gatedGoldFields().map((f) => ({ caseId: "FIX-01", field: f, verdict: "CONFIRMED" }));
    assert.deepEqual(freezeBlockers(ok), []);
    for (const bad of FIELD_VERDICTS.filter((v) => v !== "CONFIRMED")) {
      const one = ok.map((r) => (r.field === "authorityByAction" ? { ...r, verdict: bad } : r));
      assert.equal(freezeBlockers(one).length, 1, bad + " did not block the freeze");
    }
  });
});

describe("D-38 replay: materially equivalent actions are not marked wrong", () => {
  test("REGRESSION: accrediting called execute_bounded_action is the same decision", () => {
    const s = scoreJudgment({ ...DECISION, selectedAction: "execute_bounded_action" }, GOLD);
    assert.equal(s.actionCorrect, true, "the class boundary is still deciding the score");
    assert.equal(s.acceptedByEquivalence, true);
    assert.match(s.equivalenceUsed!, /stage, commitsCapital/);
  });

  test("REGRESSION: researching the accreditation is NOT the same decision", () => {
    const s = scoreJudgment({ ...DECISION, selectedAction: "research" }, GOLD);
    assert.equal(s.actionCorrect, false, "equivalence has become a rubber stamp");
    assert.equal(s.forbiddenActionChosen, true);
  });

  test("near neighbours that differ on a decisive property stay wrong", () => {
    for (const near of ["defer", "prepare_readiness", "request_owner_authority"]) {
      const s = scoreJudgment({ ...DECISION, selectedAction: near }, GOLD);
      assert.equal(s.actionCorrect, false, near + " was accepted as equivalent to acquiring a capability now");
    }
  });

  test("equivalence is driven by declared properties, not by a synonym table", () => {
    assert.equal(materiallyEquivalent("execute_bounded_action", "train_capability", ["stage", "commitsCapital"]), true);
    assert.equal(materiallyEquivalent("execute_bounded_action", "train_capability", ["intent"]), false);
    assert.equal(materiallyEquivalent("execute_bounded_action", "train_capability", []), false,
      "an empty decisive set must not make everything equivalent");
  });

  test("every action class has complete material properties", () => {
    for (const a of ACTION_CLASSES) {
      const s = ACTION_SEMANTICS[a];
      assert.ok(s, a + " has no semantics");
      for (const p of ACTION_PROPERTIES) assert.notEqual((s as any)[p], undefined, a + " is missing " + p);
    }
  });

  test("an authority difference is never absorbed by equivalence", () => {
    // scale and execute_bounded_action share stage and capital, and the gate that
    // matters reads the authority expectation for the action actually chosen.
    const eq = equivalentActions(["execute_bounded_action"], ["stage", "commitsCapital"]);
    assert.ok(eq.includes("scale"));
    const s = scoreJudgment({ ...DECISION, selectedAction: "scale", authorityRequired: false }, GOLD);
    assert.equal(s.unauthorizedCommitment, true, "a synonym escaped the authority gate");
  });
});

describe("D-35 replay: arithmetic a manager must do is supported", () => {
  test("REGRESSION: a quarterly conversion is not invented economics", () => {
    const gold: JudgmentGold = {
      ...GOLD,
      supportedQuantities: [
        { id: "declined", value: 25, units: { numerator: ["booking"], denominator: ["month"] }, label: "25 bookings a month declined" },
        { id: "net", value: 22, units: { numerator: ["currency"], denominator: ["booking"] }, label: "22 net per booking" },
      ],
    };
    const s = scoreJudgment({ ...DECISION, whyThisWinsNow: "Contribution of 1650/quarter." }, gold);
    assert.equal(s.inventedEconomics, false, JSON.stringify(s.unsupportedClaims));
  });

  test("REGRESSION: an invented rate is still caught", () => {
    const s = scoreJudgment({ ...DECISION, whyThisWinsNow: "Assuming a 30% conversion this returns 4200 a month." }, GOLD);
    assert.equal(s.inventedEconomics, true);
  });

  test("a figure quoted straight from the evidence passes", () => {
    const s = scoreJudgment({ ...DECISION, whyThisWinsNow: "The 900 unlocks 2800 a month." }, GOLD);
    assert.equal(s.inventedEconomics, false, JSON.stringify(s.unsupportedClaims));
  });

  test("quantities carry their dimensions into the scorer", () => {
    const q = quantitiesOf(GOLD);
    assert.deepEqual(q.find((x) => x.id === "declined")!.dim, { currency: 1, month: -1 });
  });
});

describe("per-action authority, which is what these properties are", () => {
  test("the expectation is indexed by the action actually chosen", () => {
    assert.equal(authorityFor(GOLD, "train_capability")!.authorityRequired, true);
    assert.equal(authorityFor(GOLD, "execute_bounded_action")!.authorityRequired, true);
  });

  test("an undeclared action falls back to a materially equivalent one", () => {
    const a = authorityFor(GOLD, "scale");
    assert.ok(a, "a synonym had no authority expectation at all");
  });

  test("an action with no expectation and no equivalent scores null rather than false", () => {
    const s = scoreJudgment({ ...DECISION, selectedAction: "decline" }, GOLD);
    assert.equal(s.authorityCorrect, null);
    assert.equal(s.ownerInterruptionCorrect, null);
  });
});

describe("the gold audit catches what review should never have to", () => {
  test("a clean fixture has no structural problems", () => {
    assert.deepEqual(auditGold(GOLD), []);
  });

  test("REGRESSION: an acceptable action with no authority expectation is caught", () => {
    const g = { ...GOLD, acceptableActions: ["train_capability", "stop_spend"] };
    assert.ok(auditGold(g).some((p) => /no authority expectation declared for acceptable action stop_spend/.test(p)));
  });

  test("REGRESSION: an unacceptable action equivalent to an acceptable one is caught", () => {
    const g = { ...GOLD, unacceptableActions: ["execute_bounded_action"] };
    assert.ok(auditGold(g).some((p) => /both unacceptable and materially equivalent/.test(p)));
  });

  test("an empty decisive set is caught", () => {
    assert.ok(auditGold({ ...GOLD, decisiveActionProperties: [] }).some((p) => /equivalence would accept anything/.test(p)));
  });

  test("a bare authority assertion with no reason is caught", () => {
    const g = { ...GOLD, authorityByAction: GOLD.authorityByAction.map((a) => ({ ...a, because: "yes" })) };
    assert.ok(auditGold(g).some((p) => /has no stated reason/.test(p)));
  });

  test("a gold with no supported quantities is caught", () => {
    assert.ok(auditGold({ ...GOLD, supportedQuantities: [] }).some((p) => /every figure in the reasoning would be unsupported/.test(p)));
  });
});

describe("the substrate is not a firewall", () => {
  test("a correct decision scores correct on every axis", () => {
    const s = scoreJudgment(DECISION, GOLD);
    assert.equal(s.bottleneckCorrect, true);
    assert.equal(s.actionCorrect, true);
    assert.equal(s.forbiddenActionChosen, false);
    assert.equal(s.inventedEconomics, false);
    assert.equal(s.authorityCorrect, true);
    assert.equal(s.ownerInterruptionCorrect, true);
    assert.equal(s.deferredTheRightThing, true);
    assert.equal(s.hasFalsifier, true);
    assert.equal(s.generatedAlternatives, true);
    assert.equal(s.epistemicSeparation, true);
  });

  test("and a wrong one scores wrong, so the test above is not vacuous", () => {
    // whyNotAlternatives is cleared too: the scorer reads the deferral from
    // there as well as from deferOrIgnore, which is right -- a manager that
    // explains why it set something aside has deferred it.
    const s = scoreJudgment({ ...DECISION, bindingBottleneck: "pricing", selectedAction: "research", authorityRequired: false, deferOrIgnore: [], whyNotAlternatives: "" }, GOLD);
    assert.equal(s.bottleneckCorrect, false);
    assert.equal(s.actionCorrect, false);
    assert.equal(s.deferredTheRightThing, false);
  });
});
