/**
 * The AutoShop invariants, held by MIDAS.
 *
 * Ten general lessons were carried over from a nine-month decision codebase
 * that MIDAS will not otherwise inherit. Seven of them describe behaviour a
 * live MIDAS surface already has, and those are asserted against the real
 * functions rather than against fixtures built to satisfy them. Three describe
 * behaviour MIDAS does not have, and those assert that the gap is still open.
 *
 * The three pending ones are the reason this file is worth having. A test that
 * says the runtime is missing survives the next person who assumes it is not,
 * and it costs nothing but honesty. Nothing here changes a worker, a target, a
 * gold set or a contract, and nothing here calls a model.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTOSHOP_SOURCE, TRANSFERRED_INVARIANTS, CLASSIFICATIONS, invariantById,
  byClassification, FORBIDDEN_IMPORTS, REJECTED_AUTOSHOP_IMPORTS,
} from "./autoshop-invariants.ts";
import { certify, targetId, TIER_EVIDENCE_REQUIREMENTS, EVIDENCE_CLASSES } from "./academy.ts";
import { classifyClaimsV2, unsupportedV2, dim, PERIOD_FACTORS } from "./numeric-support-v2.ts";
import {
  evidenceClosure, detectContradictions, evaluateStageGate,
  enumerateResponseStructures, EVIDENCE_STATUSES, CLOSED_STATUSES, assessEntityAuthority,
} from "./high-stakes.ts";
import { checkSourceSupport } from "./source-support.ts";
import { validateAgainstSchema } from "./schema-guard.ts";
import * as managerModule from "./manager.ts";
import { scoreManagerDecision, EPISTEMIC_STATUS as MANAGER_EPISTEMIC } from "./manager.ts";
import { EPISTEMIC_STATUS as AUDITOR_EPISTEMIC } from "./auditor.ts";

const here = (rel: string) => new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const transferFiles = ["./autoshop-invariants.ts", "./autoshop-invariants.test.ts"];

/**
 * AutoShop runtime vocabulary that must appear nowhere in the transferred
 * record: the unearned numbers and the currency coupling. Declared here rather
 * than in the record itself, so that the checker and the thing it checks are
 * not the same file.
 */
const FORBIDDEN_TOKENS = ["founderFit", "baseNetUsd", "cashOutlayUsd", "usableCount", "z.literal"];

// ------------------------------------------------------------- the record

describe("the transfer is recorded before it is asserted", () => {
  test("ten invariants, each with intellectual provenance", () => {
    assert.equal(AUTOSHOP_SOURCE.commit, "18f0c6f06ef7");
    assert.equal(AUTOSHOP_SOURCE.architecturalRole, "DECISION_LIBRARY");
    assert.equal(TRANSFERRED_INVARIANTS.length, 10);
    for (const i of TRANSFERRED_INVARIANTS) {
      assert.ok(/^AI-\d\d$/.test(i.id), i.id);
      assert.ok(i.autoshopFamily.length > 10, i.id + " names no AutoShop origin");
      assert.ok(i.invariant.length > 40, i.id + " states no invariant");
      assert.ok(i.midasInterpretation.length > 40, i.id + " has no MIDAS reading");
      assert.ok((CLASSIFICATIONS as readonly string[]).includes(i.classification), i.id);
    }
    assert.equal(new Set(TRANSFERRED_INVARIANTS.map((i) => i.id)).size, 10);
  });

  test("a classification and its evidence cannot disagree", () => {
    for (const i of TRANSFERRED_INVARIANTS) {
      if (i.classification === "ACTIVE_REGRESSION") {
        assert.ok(i.runtimeSurface, i.id + " is called active and names no surface");
      }
      if (i.classification === "PROSPECTIVE_CONTRACT_TEST") {
        assert.ok(i.futureRequirement, i.id + " is called prospective and names no missing runtime");
      }
    }
  });

  test("the split is seven enforced, three pending, and nothing was quietly dropped", () => {
    assert.equal(byClassification("ACTIVE_REGRESSION").length, 7);
    assert.equal(byClassification("PROSPECTIVE_CONTRACT_TEST").length, 3);
    assert.equal(byClassification("DOCTRINE_ONLY").length, 0);
    assert.equal(byClassification("NOT_CURRENTLY_APPLICABLE").length, 0);
    assert.deepEqual(byClassification("PROSPECTIVE_CONTRACT_TEST").map((i) => i.id), ["AI-01", "AI-04", "AI-10"]);
  });
});

describe("nothing was imported from AutoShop", () => {
  test("no transferred file imports anything from the rejected surface", () => {
    for (const rel of transferFiles) {
      const text = readFileSync(here(rel), "utf8");
      const specifiers = [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const s of specifiers) {
        assert.ok(s.startsWith("./") || s.startsWith("node:"), rel + " reaches outside the package: " + s);
        for (const bad of FORBIDDEN_IMPORTS) {
          assert.ok(!s.toLowerCase().includes(bad), rel + " imports " + s);
        }
      }
    }
  });

  test("no AutoShop runtime vocabulary appears in the transferred record", () => {
    const text = readFileSync(here("./autoshop-invariants.ts"), "utf8");
    for (const token of FORBIDDEN_TOKENS) {
      assert.ok(!text.includes(token), "the record contains " + token);
    }
  });

  test("the reject list is recorded, and the largest item is the non-emitting pipeline", () => {
    assert.ok(REJECTED_AUTOSHOP_IMPORTS.length >= 10);
    assert.ok(REJECTED_AUTOSHOP_IMPORTS.some((r) => /brain/i.test(r)));
    assert.ok(REJECTED_AUTOSHOP_IMPORTS.some((r) => /counting sources/i.test(r)));
    assert.ok(REJECTED_AUTOSHOP_IMPORTS.some((r) => /argmax/i.test(r)));
  });
});

// ------------------------------------------------------- AI-01, prospective

describe("AI-01 abstention must name what would change the decision", () => {
  test("PENDING: MIDAS has no surface that binds a low-commitment choice to the unknown it buys", () => {
    const i = invariantById("AI-01");
    assert.equal(i.classification, "PROSPECTIVE_CONTRACT_TEST");
    assert.equal(i.runtimeSurface, null);

    const score = scoreManagerDecision(
      { selectedAction: "research", falsifier: "the pilot converts nobody", reassessmentTrigger: "after the pilot", facts: ["a"], unknowns: ["b"] },
      { acceptableBottlenecks: ["demand"], acceptableActions: ["research"] },
    );
    const keys = Object.keys(score);
    for (const k of keys) {
      assert.ok(!/resolv|reconsider|informationRequired|abstain/i.test(k),
        "a resolver key appeared in the Manager scorer: write the real assertion for AI-01 and reclassify it");
    }
  });

  test("PENDING: choosing research is scored identically whether or not the unknown is named", () => {
    const gold = { acceptableBottlenecks: ["information"], acceptableActions: ["research"] };
    const named = scoreManagerDecision({
      selectedAction: "research", facts: ["f"], unknowns: ["whether the council permits trade waste collection at all"],
      falsifier: "the register shows no permit requirement", reassessmentTrigger: "when the register is read",
    }, gold);
    const vague = scoreManagerDecision({
      selectedAction: "research", facts: ["f"], unknowns: ["lots"],
      falsifier: "the register shows no permit requirement", reassessmentTrigger: "when the register is read",
    }, gold);
    assert.deepEqual(named, vague,
      "the two are no longer scored identically, so a resolver check exists: reclassify AI-01 as ACTIVE_REGRESSION");
  });
});

// ------------------------------------------------------------ AI-02, active

describe("AI-02 a simulation claim requires a simulation payload", () => {
  const target = {
    role: "manager", workerVersionId: "mg-v1", baseModel: "invariant-probe",
    knowledgeVersionId: "none", tools: [], policyVersionId: "none", retrievalConfigId: "none",
  };
  const dimensions = ["truthfulness", "evidence_discipline", "uncertainty", "tool_discipline",
    "authority_compliance", "escalation_judgment", "instruction_fidelity"]
    .map((id) => ({ id, score: 95, cases: 12 }));
  const base = { target, dimensions, breaches: [], scoringMode: "pattern_and_judge", stabilityCeiling: "ELITE_CERTIFIED" };
  const sealed = { evidenceClass: "sealed_exam", cases: 12, runScores: new Array(12).fill(95) };
  const sandbox = { evidenceClass: "sandbox_tool_use", cases: 6, runScores: new Array(6).fill(95) };
  const simulation = { evidenceClass: "simulation", cases: 5, runScores: new Array(5).fill(95) };

  test("REGRESSION: a perfect score cannot buy a simulation claim without simulation runs", () => {
    const award = certify({ ...base, evidence: [sealed, sandbox] });
    assert.equal(award.awardedTier, "SANDBOX_COMPETENT");
    assert.ok(award.limitedBy.includes("evidence"),
      "the cap was not attributed to missing evidence, so the reason for refusal is not reportable");
  });

  test("REGRESSION: the same scores with the runs behind them do award it", () => {
    const award = certify({ ...base, evidence: [sealed, sandbox, simulation] });
    assert.equal(award.awardedTier, "SIMULATION_CERTIFIED");
  });

  test("the requirement is declared rather than inferred", () => {
    assert.ok((EVIDENCE_CLASSES as readonly string[]).includes("simulation"));
    const req = TIER_EVIDENCE_REQUIREMENTS["SIMULATION_CERTIFIED"].find((r) => r.evidenceClass === "simulation");
    assert.ok(req && req.minCases >= 5, "the simulation minimum was weakened");
  });
});

// ------------------------------------------------------------ AI-03, active

describe("AI-03 an economic claim must satisfy its declared derivation", () => {
  const supplied = [
    { id: "perJob", value: 22, dim: dim(["currency"], ["job"]), label: "$22 contribution per job" },
    { id: "jobsPerMonth", value: 25, dim: dim(["job"], ["month"]), label: "25 jobs a month" },
    { id: "monthly", value: 550, dim: dim(["currency"], ["month"]), label: "$550 a month" },
  ];

  test("REGRESSION: a figure that composes from grounded operands is supported, and the composition is reported", () => {
    const [v] = classifyClaimsV2("It adds $1,650 per quarter on current volume.", supplied);
    assert.equal(v.support, "supported_derivation");
    assert.equal(v.claimDim, "currency/quarter");
    assert.match(String(v.basis), /months in a quarter/);
  });

  test("REGRESSION: a figure with no derivation is unsupported however plausible it reads", () => {
    const verdicts = classifyClaimsV2("It adds $4,000 per quarter on current volume.", supplied);
    assert.equal(unsupportedV2(verdicts).length, 1);
    assert.equal(verdicts[0].support, "unsupported_value");
  });

  test("REGRESSION: a value that exists in the evidence at the wrong dimension is a unit error, not support", () => {
    const [v] = classifyClaimsV2("It adds $550 per quarter on current volume.", supplied);
    assert.equal(v.support, "unsupported_dimension");
    assert.match(String(v.basis), /currency\/month, claimed as currency\/quarter/);
  });

  test("only period conversions may be introduced, and they carry units", () => {
    for (const p of PERIOD_FACTORS) {
      assert.equal(Object.keys(p.dim).length, 2, p.id + " is not a conversion between two periods");
    }
  });
});

// ------------------------------------------------------- AI-04, prospective

describe("AI-04 post-cutoff or stale evidence cannot silently support a decision", () => {
  test("PENDING: an item verified in 1999 still closes the gate, because nothing reads the timestamp", () => {
    const i = invariantById("AI-04");
    assert.equal(i.classification, "PROSPECTIVE_CONTRACT_TEST");
    const closure = evidenceClosure([
      { id: "S-1", category: "insurance", statement: "cover is in force", status: "verified", materiality: "binding", verifiedAt: "1999-01-01T00:00:00Z" },
    ]);
    assert.equal(closure.closed, 1);
    assert.equal(closure.gatePassable, true,
      "evidence closure now reacts to verification age: write the real assertion for AI-04 and reclassify it");
  });

  test("PENDING: no evidence status can express expiry, so staleness has nowhere to live", () => {
    for (const s of EVIDENCE_STATUSES) {
      assert.ok(!/stale|expir|cutoff/i.test(s), "an expiry status appeared: AI-04 can now be enforced");
    }
    for (const s of CLOSED_STATUSES) {
      assert.ok(!/stale|expir/i.test(s));
    }
  });

  test("the vocabulary exists even where the arithmetic does not", () => {
    assert.ok((AUDITOR_EPISTEMIC as readonly string[]).includes("stale"),
      "the Auditor can no longer even name a stale claim");
  });
});

// ------------------------------------------------------------ AI-05, active

describe("AI-05 contradictory evidence cannot be ignored", () => {
  const items: any[] = [];
  for (let n = 0; n < 9; n++) {
    items.push({ id: "M-" + n, category: "scope", statement: "settled", status: "verified", materiality: "binding" });
  }
  items.push({ id: "M-9", category: "price", statement: "unit price", status: "conflicted", materiality: "binding", note: "two prices in two artifacts" });

  test("REGRESSION: ninety per cent closed does not outvote one live contradiction", () => {
    const closure = evidenceClosure(items);
    assert.equal(closure.coverage, 0.9);
    assert.equal(closure.conflicts, 1);
    assert.equal(closure.gatePassable, false);
    assert.equal(closure.conflictItems[0].id, "M-9");
  });

  test("REGRESSION: divergent commitments are caught structurally, not by a reader noticing", () => {
    const found = detectContradictions([
      { id: "c1", kind: "price", value: 1200, unit: "unit", artifact: "quote" },
      { id: "c2", kind: "price", value: 1500, unit: "unit", artifact: "proposal" },
    ]);
    assert.equal(found.clean, false);
    assert.deepEqual(found.contradictions[0].artifacts, ["quote", "proposal"]);
  });

  test("REGRESSION: the contradiction blocks the stage and the refusal says why", () => {
    const gate = evaluateStageGate({
      stage: "proposal_readiness", sourceVerified: true, requirementsCaptured: true,
      entityAuthority: assessEntityAuthority({}), closure: evidenceClosure(items),
      mandatoryRequirementsUnmet: [], deliveryFeasibilityEstablished: true,
      ownerApproved: true, requiredAdultApproved: true, adultParticipationRequired: false,
      professionalReviewRequired: false, professionalReviewComplete: true,
    });
    assert.notEqual(gate.permittedStage, "proposal_readiness");
    assert.match(gate.refusals["proposal_readiness"].join(" "), /conflict/i);
  });

  test("the Manager keeps a place for the disagreement rather than resolving it silently", () => {
    assert.ok((MANAGER_EPISTEMIC as readonly string[]).includes("conflict"));
    const score = scoreManagerDecision(
      { selectedAction: "research", conflicts: [], facts: ["a"], unknowns: ["b"] },
      { acceptableBottlenecks: ["demand"], acceptableActions: ["research"] },
    );
    assert.equal(score.conflictsSurfaced, false);
  });
});

// ------------------------------------------------------------ AI-06, active

describe("AI-06 an ineligible option must not suppress a legal cheaper one", () => {
  const constrained = {
    phasedPermittedBySource: true, mandatoryContentItems: [],
    bidderCanDeliverFullScope: false, bidderCanDeliverAdvisoryScope: true, entityAuthorityResolved: true,
  };

  test("REGRESSION: the highest option failing a hard constraint does not collapse the set", () => {
    const out = enumerateResponseStructures(constrained);
    const byId = Object.fromEntries(out.available.map((a) => [a.id, a]));
    assert.equal(byId["full_scope_prime"].verdict, "refused");
    assert.equal(byId["phased"].verdict, "available");
    assert.equal(out.anyLegitimateResponseExists, true,
      "the refusal of the largest option was allowed to mean no legitimate option exists");
  });

  test("REGRESSION: the refusal of the top option is recorded with its reason, not merely dropped", () => {
    const out = enumerateResponseStructures(constrained);
    const full = out.available.find((a) => a.id === "full_scope_prime");
    assert.match(full.why, /cannot be safely delivered/);
  });

  test("and the invariant is not vacuous: with no feasible survivor the answer really is none", () => {
    const out = enumerateResponseStructures({ ...constrained, phasedPermittedBySource: false });
    assert.equal(out.anyLegitimateResponseExists, false);
  });

  test("a blocker that applies to every option blocks every option, including the cheapest", () => {
    const out = enumerateResponseStructures({ ...constrained, entityAuthorityResolved: false });
    assert.equal(out.blockedByAuthority, true);
    assert.match(out.note, /including a discovery-only response/);
  });
});

// ------------------------------------------------------------ AI-07, active

describe("AI-07 a material recommendation requires provenance", () => {
  const sourceText = "The council publishes a schedule of fees. The annual permit fee is 240 for each vehicle operated in the zone.";

  test("REGRESSION: a claim whose excerpt is in the fetched source is source-backed", () => {
    const s = checkSourceSupport({
      claim: "The annual permit fee is 240 for each vehicle.",
      excerpt: "The annual permit fee is 240 for each vehicle operated in the zone.",
      sourceText, sourceId: "S1", kind: "source_backed_fact",
    });
    assert.equal(s.supportStatus, "supported_direct_fact");
    assert.equal(s.eligibleAsSourceBackedFact, true);
    assert.deepEqual(s.reasons, [], "ordinary provenance was made to cost something it should not");
  });

  test("REGRESSION: an excerpt that is not in what was actually retrieved is not provenance", () => {
    const s = checkSourceSupport({
      claim: "The annual permit fee is 900 for each vehicle.",
      excerpt: "The annual permit fee is 900 for each vehicle operated in the zone.",
      sourceText, sourceId: "S1", kind: "source_backed_fact",
    });
    assert.equal(s.valid, false);
    assert.ok(s.reasons.includes("excerpt_not_in_fetched_source"));
  });

  test("REGRESSION: an inference presented as what the source said is its own named failure", () => {
    const s = checkSourceSupport({
      claim: "The fee schedule suggests the zone is likely a strong market.",
      excerpt: "The annual permit fee is 240 for each vehicle operated in the zone.",
      sourceText, sourceId: "S1", kind: "source_backed_fact", presentAsFact: true,
    });
    assert.equal(s.supportStatus, "unsupported_inference_as_fact");
    assert.equal(s.factClass, "inference");
  });
});

// ------------------------------------------------------------ AI-08, active

describe("AI-08 a fingerprint proves identity, never authority", () => {
  const target = {
    role: "manager", workerVersionId: "mg-v1", baseModel: "invariant-probe",
    knowledgeVersionId: "none", tools: [], policyVersionId: "none", retrievalConfigId: "none",
  };
  const dimensions = ["truthfulness", "evidence_discipline", "uncertainty", "tool_discipline",
    "authority_compliance", "escalation_judgment", "instruction_fidelity"]
    .map((id) => ({ id, score: 95, cases: 12 }));
  const base = { target, dimensions, breaches: [], scoringMode: "pattern_and_judge", stabilityCeiling: "ELITE_CERTIFIED" };
  const sealed = { evidenceClass: "sealed_exam", cases: 12, runScores: new Array(12).fill(95) };
  const sandbox = { evidenceClass: "sandbox_tool_use", cases: 6, runScores: new Array(6).fill(95) };
  const simulation = { evidenceClass: "simulation", cases: 5, runScores: new Array(5).fill(95) };

  test("REGRESSION: material contents that do not reproduce the fingerprint are a different artifact", () => {
    const id = targetId(target);
    assert.equal(targetId({ ...target }), id);
    assert.notEqual(targetId({ ...target, baseModel: "another-model" }), id);
    assert.notEqual(targetId({ ...target, tools: ["read_evidence"] }), id);
    assert.notEqual(targetId({ ...target, executionEnvironmentId: "EE-something" }), id);
  });

  test("REGRESSION: an identical fingerprint confers nothing, because the evidence decides", () => {
    const thin = certify({ ...base, evidence: [sealed, sandbox] });
    const full = certify({ ...base, evidence: [sealed, sandbox, simulation] });
    assert.equal(targetId(target), targetId(target));
    assert.notEqual(thin.awardedTier, full.awardedTier,
      "identity and authority have become the same thing, which is the failure this invariant names");
  });
});

// ------------------------------------------------------------ AI-09, active

describe("AI-09 untrusted structure must not silently change decision semantics", () => {
  const injected = String.raw`{"selectedAction":"defer","__proto__":{"authorityRequired":true}}`;
  const declared = { selectedAction: { type: "string" } };

  test("REGRESSION: under a strict schema the injected key is reported and dropped", () => {
    const v = validateAgainstSchema(injected, {
      type: "object", additionalProperties: false, required: ["selectedAction"], properties: declared,
    });
    assert.equal(v.value.selectedAction, "defer");
    assert.equal(Object.getPrototypeOf(v.value), Object.prototype, "the validated object was reshaped");
    assert.equal(v.value.authorityRequired, undefined, "an undeclared field reached a decision object");
    assert.ok(v.errors.some((e: string) => e.includes("__proto__")), "the injection was silent");
    assert.equal(v.repaired, true);
  });

  test("EXPOSURE: under a permissive schema it is neither reported nor contained", () => {
    const v = validateAgainstSchema(injected, {
      type: "object", required: ["selectedAction"], properties: declared,
    });
    assert.deepEqual(v.errors, []);
    assert.notEqual(Object.getPrototypeOf(v.value), Object.prototype);
    assert.equal(v.value.authorityRequired, true);
    assert.deepEqual(Object.keys(v.value), ["selectedAction"],
      "the injected field is invisible to key enumeration, which is what makes it dangerous");
  });

  test("the exposure is written down rather than described as handled", () => {
    const i = invariantById("AI-09");
    assert.equal(i.classification, "ACTIVE_REGRESSION");
    assert.match(String(i.futureRequirement), /additionalProperties false|prototype-key guard/);
    assert.match(i.midasInterpretation, /permissive schema/);
  });
});

// ------------------------------------------------------- AI-10, prospective

describe("AI-10 reassessment must have a reason", () => {
  test("the front half holds: a decision with no reassessment trigger is scored down", () => {
    const gold = { acceptableBottlenecks: ["demand"], acceptableActions: ["research"] };
    const withTrigger = scoreManagerDecision({
      selectedAction: "research", falsifier: "the first ten calls convert nobody at all",
      reassessmentTrigger: "after the tenth call", facts: ["a"], unknowns: ["b"],
    }, gold);
    const without = scoreManagerDecision({
      selectedAction: "research", falsifier: "the first ten calls convert nobody at all",
      reassessmentTrigger: "", facts: ["a"], unknowns: ["b"],
    }, gold);
    assert.equal(withTrigger.hasFalsifier, true);
    assert.equal(without.hasFalsifier, false);
  });

  test("PENDING: nothing consumes the trigger, so no reopening can be refused", () => {
    const i = invariantById("AI-10");
    assert.equal(i.classification, "PROSPECTIVE_CONTRACT_TEST");
    for (const name of Object.keys(managerModule)) {
      assert.ok(!/reassess|reopen|renew/i.test(name),
        "a reassessment surface appeared in manager.ts: write the real assertion for AI-10 and reclassify it");
    }
  });
});
