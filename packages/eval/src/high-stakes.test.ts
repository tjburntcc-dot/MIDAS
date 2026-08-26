/**
 * Guards for the high-stakes pursuit primitives.
 *
 * The properties pinned here are the ones whose failure would be expensive in
 * the real world: stakes driven by consequence rather than headline value,
 * evidence closure that cannot be talked past with confidence, an authority
 * model that refuses to assume a parent is a signer, gates that a deadline
 * cannot open, and a core with no deal-specific contamination in it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import {
  classifyStakes, evidenceClosure, assessEntityAuthority, evaluateStageGate,
  detectContradictions, enumerateResponseStructures, CLOSED_STATUSES, PURSUIT_STAGES,
} from "./high-stakes.ts";

const cleanAuthority = () => assessEntityAuthority({
  legalEntityName: "Example LLC", registryVerified: true, principalIsMinor: false,
  authorizedSignerIdentified: true, authorizedSignerIsAdult: true, authorizedSignerConsented: true,
  bankOrPayoutReady: true, w9Ready: true, insuranceHeld: [], insuranceRequiredBySource: [],
  vendorRegistrationRequired: false, submissionCreatesBindingCertification: false, personalGuaranteeRequested: false,
});

describe("stakes come from consequence, not from the headline number", () => {
  test("a small irreversible high-liability job outranks a large reversible one", () => {
    const smallDangerous = classifyStakes({
      potentialContractValueUsd: 3000, irreversibility: 0.95, legalExposure: 0.9,
      securityPrivacyExposure: 0.9, uncertainty: 0.8, correctionDifficulty: 0.9,
    });
    const largeSafe = classifyStakes({
      potentialContractValueUsd: 250000, irreversibility: 0.05, legalExposure: 0.05,
      securityPrivacyExposure: 0.05, uncertainty: 0.05, correctionDifficulty: 0.05,
    });
    assert.ok(smallDangerous.score > largeSafe.score,
      "a $3k job that cannot be undone must outrank a $250k job that can");
  });

  test("no dollar threshold appears in the tier logic", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "high-stakes.ts"), "utf8");
    assert.equal(/50000|50,000|\$50k/i.test(src), false, "a specific deal amount leaked into general logic");
  });

  test("higher tiers demand more assurance", () => {
    const critical = classifyStakes({ potentialContractValueUsd: 100000, irreversibility: 0.9, legalExposure: 0.9, securityPrivacyExposure: 0.9, uncertainty: 0.9, scopeBreadth: 0.9, technicalComplexity: 0.9 });
    const routine = classifyStakes({ potentialContractValueUsd: 300 });
    assert.equal(critical.requires.adversarialRedTeam, true);
    assert.equal(critical.requires.entityAuthorityVerification, true);
    assert.equal(routine.requires.adversarialRedTeam, false);
    // Owner approval before external action is never relaxed by low stakes.
    assert.equal(routine.requires.ownerApprovalBeforeExternalAction, true);
  });
});

describe("evidence closure cannot be talked past", () => {
  const items = [
    { id: "a", category: "source", statement: "s", status: "verified_primary_source", materiality: "m" },
    { id: "b", category: "entity", statement: "s", status: "unknown", materiality: "m", blocking: true },
    { id: "c", category: "delivery", statement: "s", status: "assumed", materiality: "m", blocking: false },
  ];

  test("a blocking unknown fails the gate regardless of how much else is closed", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: "v" + i, category: "x", statement: "s", status: "verified", materiality: "m" }));
    const closure = evidenceClosure(many.concat(items as any));
    assert.ok(closure.coverage > 0.9, "coverage is high");
    assert.equal(closure.gatePassable, false, "one blocking unknown must still fail the gate");
    assert.equal(closure.blocking, 1);
  });

  test("no confidence score is produced anywhere", () => {
    const closure = evidenceClosure(items as any);
    assert.equal("confidence" in closure, false);
    const src = readFileSync(repoPath("packages", "eval", "src", "high-stakes.ts"), "utf8");
    assert.equal(/confidenceScore|overallConfidence/.test(src), false,
      "a confidence score would let an unresolved fact pass as resolved");
  });

  test("owner acceptance can unblock, but only explicitly", () => {
    const accepted = items.map((i) => (i.id === "b" ? { ...i, ownerAccepted: true } : i));
    assert.equal(evidenceClosure(accepted as any).gatePassable, true);
    assert.equal(evidenceClosure(items as any).gatePassable, false);
  });

  test("a conflict blocks even when nothing is marked blocking", () => {
    const conflicted = [{ id: "x", category: "c", statement: "s", status: "conflicted", materiality: "m" }];
    assert.equal(evidenceClosure(conflicted as any).gatePassable, false);
  });

  test("inferred and assumed never count as closed", () => {
    for (const s of ["inferred", "assumed", "unknown", "conflicted"]) {
      assert.equal(CLOSED_STATUSES.includes(s), false, s + " must not count as established");
    }
  });
});

describe("authority is never assumed", () => {
  test("a minor principal is a blocker on its own", () => {
    const a = assessEntityAuthority({ legalEntityName: "X LLC", registryVerified: true, principalIsMinor: true, authorizedSignerIdentified: true, authorizedSignerIsAdult: true, authorizedSignerConsented: true });
    assert.equal(a.canBindNow, false);
    assert.ok(a.blockers.some((b) => b.id === "authority.minor"));
  });

  test("an identified adult signer who has not consented is still a blocker", () => {
    const a = assessEntityAuthority({ legalEntityName: "X LLC", registryVerified: true, principalIsMinor: false, authorizedSignerIdentified: true, authorizedSignerIsAdult: true, authorizedSignerConsented: false });
    assert.equal(a.canBindNow, false);
    assert.ok(a.blockers.some((b) => b.id === "authority.signer_consent"),
      "the existence of an adult is not consent from that adult");
  });

  test("a clean authority chain permits binding", () => {
    assert.equal(cleanAuthority().canBindNow, true);
  });

  test("internal preparation is always permitted even when binding is not", () => {
    const blocked = assessEntityAuthority({ principalIsMinor: true });
    assert.equal(blocked.canBindNow, false);
    assert.equal(blocked.canPrepareInternally, true);
  });

  test("a requested personal guarantee is surfaced, never normalised", () => {
    const a = assessEntityAuthority({ legalEntityName: "X LLC", registryVerified: true, principalIsMinor: false, authorizedSignerIdentified: true, authorizedSignerIsAdult: true, authorizedSignerConsented: true, personalGuaranteeRequested: true });
    const pg = a.findings.find((f) => f.id === "authority.personal_guarantee");
    assert.ok(pg);
    assert.match(pg.consequence, /personal assets/i);
  });
});

describe("stage gates separate readiness from approval from binding", () => {
  const base = {
    stage: "internal_underwriting", sourceVerified: true, requirementsCaptured: true,
    entityAuthority: cleanAuthority(),
    closure: evidenceClosure([{ id: "a", category: "x", statement: "s", status: "verified", materiality: "m" }] as any),
    mandatoryRequirementsUnmet: [], deliveryFeasibilityEstablished: true,
    ownerApproved: true, requiredAdultApproved: true, adultParticipationRequired: false,
    professionalReviewRequired: false, professionalReviewComplete: false,
  };

  test("all five stages exist and are ordered", () => {
    assert.equal(PURSUIT_STAGES.length, 5);
    assert.equal(PURSUIT_STAGES[0], "internal_underwriting");
    assert.equal(PURSUIT_STAGES[4], "binding_commitment_ready");
  });

  test("without owner approval there is no external contact", () => {
    const g = evaluateStageGate({ ...base, ownerApproved: false });
    assert.equal(g.externalContactPermitted, false);
    assert.equal(g.permittedStage, "owner_family_review");
  });

  test("an unresolved authority chain blocks binding but not preparation", () => {
    const g = evaluateStageGate({ ...base, entityAuthority: assessEntityAuthority({ principalIsMinor: true }) });
    assert.equal(g.bindingPermitted, false);
    assert.ok((g.refusals.binding_commitment_ready || []).length > 0);
  });

  test("a deadline is not an input and cannot open a gate", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "high-stakes.ts"), "utf8");
    const fn = src.slice(src.indexOf("export function evaluateStageGate"));
    assert.equal(/deadline|daysRemaining|urgen/i.test(fn.slice(0, 2000)), false,
      "time pressure must never be able to lower a gate");
  });

  test("an unmet mandatory requirement blocks proposal readiness", () => {
    const g = evaluateStageGate({ ...base, mandatoryRequirementsUnmet: ["M5: Examples of similar work"] });
    assert.ok((g.refusals.proposal_readiness || []).some((r) => /Mandatory/.test(r)));
  });
});

describe("response structures are enumerated from the source", () => {
  const items = [{ id: "M1", item: "a", satisfiable: true }, { id: "M5", item: "examples", satisfiable: false }];

  test("silence in the source is not permission to phase", () => {
    const s = enumerateResponseStructures({
      phasedPermittedBySource: null, mandatoryContentItems: items,
      bidderCanDeliverFullScope: false, bidderCanDeliverAdvisoryScope: true, entityAuthorityResolved: true,
    });
    const phased = s.available.find((x) => x.id === "phased");
    assert.equal(phased.verdict, "not_permitted_by_source");
  });

  test("an unsatisfiable mandatory item does not by itself eliminate every structure", () => {
    // This is the exact error that produced a wrong verdict on a live pursuit.
    const s = enumerateResponseStructures({
      phasedPermittedBySource: true, mandatoryContentItems: items,
      bidderCanDeliverFullScope: false, bidderCanDeliverAdvisoryScope: true, entityAuthorityResolved: true,
    });
    assert.equal(s.anyLegitimateResponseExists, true);
    assert.equal(s.unsatisfiableMandatoryItems.length, 1);
  });

  test("full scope is refused when it cannot be delivered", () => {
    const s = enumerateResponseStructures({
      phasedPermittedBySource: true, mandatoryContentItems: items,
      bidderCanDeliverFullScope: false, bidderCanDeliverAdvisoryScope: true, entityAuthorityResolved: true,
    });
    assert.equal(s.available.find((x) => x.id === "full_scope_prime").verdict, "refused");
  });

  test("partnering is unavailable until a relationship actually exists", () => {
    const s = enumerateResponseStructures({
      phasedPermittedBySource: true, mandatoryContentItems: items,
      bidderCanDeliverFullScope: false, bidderCanDeliverAdvisoryScope: true, entityAuthorityResolved: true,
    });
    assert.equal(s.available.find((x) => x.id === "partnered_or_subcontracted").verdict, "unavailable_now");
  });

  test("unresolved authority blocks every structure including advisory", () => {
    const s = enumerateResponseStructures({
      phasedPermittedBySource: true, mandatoryContentItems: items,
      bidderCanDeliverFullScope: false, bidderCanDeliverAdvisoryScope: true, entityAuthorityResolved: false,
    });
    assert.equal(s.blockedByAuthority, true);
    assert.match(s.note, /blocked until entity and signer authority/i);
  });
});

describe("contradictions are caught structurally", () => {
  test("two different prices across artifacts is a contradiction", () => {
    const r = detectContradictions([
      { id: "1", kind: "price_usd", value: 9000, artifact: "proposal" },
      { id: "2", kind: "price_usd", value: 12000, artifact: "pricing sheet" },
      { id: "3", kind: "timeline_weeks", value: 6, artifact: "proposal" },
    ]);
    assert.equal(r.clean, false);
    assert.equal(r.contradictions.length, 1);
    assert.equal(r.contradictions[0].kind, "price_usd");
  });

  test("consistent commitments are clean", () => {
    const r = detectContradictions([
      { id: "1", kind: "price_usd", value: 9000, artifact: "proposal" },
      { id: "2", kind: "price_usd", value: 9000, artifact: "pricing sheet" },
    ]);
    assert.equal(r.clean, true);
  });
});

describe("the core stays general and the live pursuit stays instance data", () => {
  test("no buyer, date or technology from the live pursuit appears in the core", () => {
    const src = readFileSync(repoPath("packages", "eval", "src", "high-stakes.ts"), "utf8");
    for (const leak of ["Idaho", "AEYC", "Boise", "2026-08-28", "Drupal", "WordPress", "CMS", "donor portal", "Hemmer", "Mason"]) {
      assert.equal(src.includes(leak), false, "deal-specific term leaked into general logic: " + leak);
    }
  });

  test("the deal instance carries the specifics and the audit trail", () => {
    const inst = repoPath("tools", "pursuit-idaho-aeyc.mjs");
    const src = readFileSync(inst, "utf8");
    assert.ok(src.includes("Idaho"), "the instance file is where buyer facts belong");
    assert.match(src, /outboundActionsTaken: 0/);
    assert.equal(/nodemailer|smtp|sendMail|twilio|sendgrid/i.test(src), false, "no transport may exist in a pursuit file");
  });

  test("the adversarial reviewer is asked to overturn, not to agree", () => {
    const src = readFileSync(repoPath("tools", "pursuit-redteam.mjs"), "utf8");
    assert.match(src, /overturn/i);
    assert.match(src, /paid only if you find a legitimate path/i);
    // The constraints that keep an overturn honest rather than convenient.
    assert.match(src, /may not fabricate or imply experience/i);
    assert.match(src, /Winning work the bidder cannot safely deliver is a failure/i);
  });
});
