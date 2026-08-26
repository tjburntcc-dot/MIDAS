/**
 * High-stakes pursuit primitives.
 *
 * General MIDAS capability. No buyer, amount, date, technology, industry or
 * solicitation format appears here: those are instance data on a pursuit record.
 * The test for whether this file has been contaminated is simple -- it must be
 * usable unchanged for a software deal, a physical-services deal, or a
 * procurement response in an industry MIDAS has never seen.
 *
 * Four primitives:
 *   stakes classification      how much scrutiny does this work deserve
 *   evidence closure           what is actually established versus believed
 *   entity / signer authority  can this company legitimately commit at all
 *   pursuit stage gates        readiness separated from approval separated from binding
 */

// ---------------------------------------------------------------- stakes

/**
 * Stakes are assessed from consequence, not from a dollar threshold. A small
 * contract that is irreversible, touches personal data and carries personal
 * liability deserves more scrutiny than a larger one that is a reversible
 * content refresh.
 */
export interface StakesFactors {
  potentialContractValueUsd?: number | null;
  expectedContributionUsd?: number | null;
  /** 0-1: how hard is a mistake to undo once made. */
  irreversibility?: number;
  /** 0-1: exposure created by signing, certifying or promising. */
  legalExposure?: number;
  reputationalImpact?: number;
  customerImpact?: number;
  technicalComplexity?: number;
  /** 0-1: how much of the material picture is currently unknown. */
  uncertainty?: number;
  scopeBreadth?: number;
  securityPrivacyExposure?: number;
  /** Delivery duration in days. Longer commitments carry more drift risk. */
  deliveryDurationDays?: number | null;
  dependencyCount?: number | null;
  /** 0-1: cost of correcting an error after it reaches the buyer. */
  correctionDifficulty?: number;
}

export const STAKES_TIERS = ["routine", "standard", "elevated", "high", "critical"] as const;

/**
 * Value contributes on a log scale so a ten-times larger deal is meaningfully
 * but not overwhelmingly more serious, and never dominates the qualitative
 * factors that actually decide whether a commitment is safe.
 */
function valueSignal(usd: number | null | undefined) {
  const v = Number(usd || 0);
  if (!(v > 0)) return 0;
  return Math.min(1, Math.log10(v) / 5);
}

export function classifyStakes(f: StakesFactors) {
  const contributions: Record<string, number> = {
    value: 0.20 * valueSignal(f.potentialContractValueUsd),
    irreversibility: 0.14 * (f.irreversibility ?? 0),
    legal: 0.16 * (f.legalExposure ?? 0),
    security: 0.12 * (f.securityPrivacyExposure ?? 0),
    uncertainty: 0.10 * (f.uncertainty ?? 0),
    complexity: 0.08 * (f.technicalComplexity ?? 0),
    scope: 0.06 * (f.scopeBreadth ?? 0),
    reputation: 0.06 * (f.reputationalImpact ?? 0),
    customer: 0.04 * (f.customerImpact ?? 0),
    correction: 0.04 * (f.correctionDifficulty ?? 0),
  };
  let score = Object.values(contributions).reduce((a, b) => a + b, 0);
  const duration = Number(f.deliveryDurationDays || 0);
  if (duration > 60) score += Math.min(0.06, (duration - 60) / 1000);
  const deps = Number(f.dependencyCount || 0);
  if (deps > 3) score += Math.min(0.04, (deps - 3) * 0.01);
  score = Math.min(1, score);

  const tier = score >= 0.72 ? "critical" : score >= 0.55 ? "high" : score >= 0.38 ? "elevated" : score >= 0.20 ? "standard" : "routine";
  return {
    tier,
    score: Number(score.toFixed(4)),
    contributions,
    // What the tier actually buys. Depth is a consequence of stakes, not a mood.
    requires: {
      independentAudit: ["elevated", "high", "critical"].includes(tier),
      adversarialRedTeam: ["high", "critical"].includes(tier),
      strongerModelEscalation: ["high", "critical"].includes(tier),
      professionalReviewAssessment: ["high", "critical"].includes(tier),
      ownerApprovalBeforeExternalAction: true,
      evidenceClosureRequired: ["elevated", "high", "critical"].includes(tier),
      entityAuthorityVerification: ["high", "critical"].includes(tier),
    },
  };
}

// -------------------------------------------------------- evidence closure

export const EVIDENCE_STATUSES = [
  "verified_primary_source", "verified_by_test", "verified", "corroborated",
  "inferred", "assumed", "unknown", "conflicted", "not_applicable",
] as const;

/** Statuses that count as established for gate purposes. */
export const CLOSED_STATUSES = ["verified_primary_source", "verified_by_test", "verified", "corroborated", "not_applicable"];

export interface MaterialItem {
  id: string;
  category: string;
  statement: string;
  status: string;
  /** Why this item matters to the decision. An item with no consequence is not material. */
  materiality: string;
  evidence?: string;
  source?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  /** If unresolved, does it stop the commitment or merely get disclosed? */
  blocking?: boolean;
  ownerAccepted?: boolean;
  note?: string;
}

/**
 * Coverage over an enumerated set of material items.
 *
 * Deliberately not a confidence score. The question is never "how sure are we"
 * but "which enumerated items are established, which are open, and does any open
 * one stop the commitment". A high confidence number cannot convert an
 * unresolved fact into a resolved one, so no confidence number is produced.
 */
export function evidenceClosure(items: MaterialItem[]) {
  const byStatus: Record<string, number> = {};
  for (const i of items) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  const closed = items.filter((i) => CLOSED_STATUSES.includes(i.status));
  const open = items.filter((i) => !CLOSED_STATUSES.includes(i.status));
  const blocking = open.filter((i) => i.blocking === true && i.ownerAccepted !== true);
  const acceptedOpen = open.filter((i) => i.ownerAccepted === true);
  const conflicts = items.filter((i) => i.status === "conflicted");
  return {
    total: items.length,
    closed: closed.length,
    open: open.length,
    blocking: blocking.length,
    ownerAcceptedOpen: acceptedOpen.length,
    conflicts: conflicts.length,
    byStatus,
    coverage: items.length ? Number((closed.length / items.length).toFixed(4)) : 0,
    blockingItems: blocking.map((i) => ({ id: i.id, category: i.category, statement: i.statement, materiality: i.materiality })),
    conflictItems: conflicts.map((i) => ({ id: i.id, statement: i.statement, note: i.note })),
    // A package is ready when nothing material is open and unaccepted, not when
    // the author feels confident.
    gatePassable: blocking.length === 0 && conflicts.length === 0,
  };
}

// ---------------------------------------------------- entity and authority

/**
 * Can this company legitimately enter the commitment at all?
 *
 * Separated from credibility and from commercial attractiveness because they
 * fail differently: a company can be highly credible and still lack a person
 * able to sign, and a signature path can be perfect while the offer is
 * commercially worthless.
 */
export interface EntityAuthorityFacts {
  legalEntityName?: string | null;
  jurisdiction?: string | null;
  registryStatus?: string | null;
  registryVerified?: boolean;
  einPresent?: boolean | null;
  operatingAgreementExists?: boolean | null;
  membersKnown?: boolean | null;
  /** Someone legally capable of binding the entity, who has agreed to do so. */
  authorizedSignerIdentified?: boolean | null;
  authorizedSignerIsAdult?: boolean | null;
  authorizedSignerConsented?: boolean | null;
  principalIsMinor?: boolean | null;
  bankOrPayoutReady?: boolean | null;
  w9Ready?: boolean | null;
  insuranceHeld?: string[] | null;
  insuranceRequiredBySource?: string[] | null;
  vendorRegistrationRequired?: boolean | null;
  vendorRegistrationComplete?: boolean | null;
  submissionCreatesBindingCertification?: boolean | null;
  personalGuaranteeRequested?: boolean | null;
}

export function assessEntityAuthority(f: EntityAuthorityFacts) {
  const findings: Array<{ id: string; severity: string; finding: string; consequence: string }> = [];
  const add = (id: string, severity: string, finding: string, consequence: string) => findings.push({ id, severity, finding, consequence });

  if (!f.legalEntityName) add("entity.name", "blocker", "No verified legal entity name.", "There is no party able to sign a contract.");
  else if (!f.registryVerified) add("entity.registry", "serious", "Entity name is stated but not verified against a public registry.", "The buyer may verify it and find a mismatch, or the entity may not be in good standing.");

  if (f.principalIsMinor === true) {
    add("authority.minor", "blocker",
      "The principal operator is a minor.",
      "In most US jurisdictions a contract entered by a minor is voidable by the minor. That is a risk the buyer bears and a fact material to them, and it is not cured by an entity wrapper alone. A legally capable signer with genuine authority is required, and whether a member-managed LLC whose only member is a minor can bind itself is a question for counsel, not for this system.");
  }
  if (f.authorizedSignerIdentified !== true) {
    add("authority.signer", "blocker", "No identified person with authority to bind the entity.", "No binding commitment can be made, and a proposal that certifies anything cannot be signed.");
  } else {
    if (f.authorizedSignerIsAdult !== true) add("authority.signer_adult", "blocker", "The identified signer is not confirmed to be a legally capable adult.", "Signature may be voidable.");
    if (f.authorizedSignerConsented !== true) add("authority.signer_consent", "blocker", "The identified signer has not knowingly consented to this specific role and exposure.", "Assuming consent is not consent. The person must understand what they sign and what liability attaches.");
  }

  if (f.submissionCreatesBindingCertification === true && f.authorizedSignerConsented !== true) {
    add("authority.submission", "blocker", "Submission itself carries binding certifications and no consenting authorized signer exists.", "Submitting would itself be the binding act, not a later contract signature.");
  }
  if (f.personalGuaranteeRequested === true) {
    add("authority.personal_guarantee", "serious", "A personal guarantee is requested.", "Personal assets are exposed behind the entity. Requires informed consent and professional review; must never be recommended casually.");
  }

  const required = f.insuranceRequiredBySource || [];
  const held = f.insuranceHeld || [];
  const missingInsurance = required.filter((r) => !held.includes(r));
  if (missingInsurance.length) {
    add("insurance.gap", "serious", "Required coverage not held: " + missingInsurance.join(", "), "Cannot satisfy a stated insurance condition; may be curable before award if timing permits.");
  }
  if (f.vendorRegistrationRequired === true && f.vendorRegistrationComplete !== true) {
    add("procurement.registration", "serious", "Vendor registration required and not complete.", "May be a submission or award precondition.");
  }
  if (f.w9Ready !== true) add("tax.w9", "moderate", "Vendor tax form readiness unconfirmed.", "Commonly required before payment; usually curable quickly.");
  if (f.bankOrPayoutReady !== true) add("payment.payout", "moderate", "Payout destination in the entity's name unconfirmed.", "Payment may be delayed or misdirected.");

  const blockers = findings.filter((x) => x.severity === "blocker");
  return {
    findings,
    blockers,
    serious: findings.filter((x) => x.severity === "serious"),
    /** Can the company legitimately make a binding commitment right now? */
    canBindNow: blockers.length === 0,
    /** Can it do non-binding work such as internal analysis? Always yes. */
    canPrepareInternally: true,
    summary: blockers.length
      ? "Cannot enter a binding commitment. " + blockers.length + " blocker(s): " + blockers.map((b) => b.id).join(", ")
      : "No entity or authority blocker identified.",
  };
}

// ------------------------------------------------------- pursuit stages

/**
 * Stages separate readiness from approval from binding, because collapsing them
 * into one `approved` state is how a company ends up committed by accident.
 */
export const PURSUIT_STAGES = [
  "internal_underwriting",      // A: no buyer contact
  "owner_family_review",        // B: decision-complete packet to owner, and adult where required
  "non_binding_interaction",    // C: owner-approved, narrowly scoped, creates no commitment
  "proposal_readiness",         // D: commercial gates closed
  "binding_commitment_ready",   // E: authority, scope, security, insurance, review all closed
] as const;

export interface StageGateInput {
  stage: string;
  sourceVerified: boolean;
  requirementsCaptured: boolean;
  entityAuthority: ReturnType<typeof assessEntityAuthority>;
  closure: ReturnType<typeof evidenceClosure>;
  mandatoryRequirementsUnmet: string[];
  deliveryFeasibilityEstablished: boolean;
  ownerApproved: boolean;
  requiredAdultApproved?: boolean | null;
  adultParticipationRequired: boolean;
  professionalReviewRequired: boolean;
  professionalReviewComplete: boolean;
}

/**
 * What is permitted right now.
 *
 * Returns the highest stage whose conditions are met, plus the exact reasons a
 * higher stage is refused. Deadline pressure is deliberately not an input: a
 * closing date can change what is worth doing, never what is safe to promise.
 */
export function evaluateStageGate(input: StageGateInput) {
  const reasons: Record<string, string[]> = {};
  const fail = (stage: string, why: string) => { (reasons[stage] = reasons[stage] || []).push(why); };

  if (!input.sourceVerified) fail("owner_family_review", "Source not verified against the primary document.");
  if (!input.requirementsCaptured) fail("owner_family_review", "Requirements not fully captured.");

  if (!input.ownerApproved) fail("non_binding_interaction", "Owner has not approved buyer contact.");
  if (input.adultParticipationRequired && input.requiredAdultApproved !== true) {
    fail("non_binding_interaction", "A required adult has not reviewed and approved participation.");
  }

  if (input.mandatoryRequirementsUnmet.length) {
    fail("proposal_readiness", "Mandatory requirements unmet: " + input.mandatoryRequirementsUnmet.join("; "));
  }
  if (!input.deliveryFeasibilityEstablished) fail("proposal_readiness", "Delivery feasibility not established under representative conditions.");
  if (!input.closure.gatePassable) {
    fail("proposal_readiness", "Evidence closure not achieved: " + input.closure.blocking + " blocking item(s), " + input.closure.conflicts + " conflict(s).");
  }

  if (!input.entityAuthority.canBindNow) {
    fail("binding_commitment_ready", "Entity/authority blockers: " + input.entityAuthority.blockers.map((b) => b.id).join(", "));
  }
  if (input.professionalReviewRequired && !input.professionalReviewComplete) {
    fail("binding_commitment_ready", "Required professional review not complete.");
  }

  const order = PURSUIT_STAGES as unknown as string[];
  let highest = "internal_underwriting";
  for (const stage of order.slice(1)) {
    const blockedHere = reasons[stage] || [];
    const blockedEarlier = order.slice(1, order.indexOf(stage)).some((s) => (reasons[s] || []).length > 0);
    if (blockedHere.length || blockedEarlier) break;
    highest = stage;
  }
  return {
    permittedStage: highest,
    refusals: reasons,
    externalContactPermitted: order.indexOf(highest) >= order.indexOf("non_binding_interaction"),
    bindingPermitted: highest === "binding_commitment_ready",
  };
}

// -------------------------------------------------- contradiction detection

/**
 * Detects material contradictions across a pursuit's commitments.
 *
 * Operates on typed commitment records rather than prose, so a price stated in
 * one artifact and a different price in another is caught structurally instead
 * of relying on a reader noticing.
 */
export interface Commitment {
  id: string;
  kind: string;
  value: string | number;
  unit?: string;
  artifact: string;
  statedAt?: string;
}

export function detectContradictions(commitments: Commitment[]) {
  const byKind: Record<string, Commitment[]> = {};
  for (const c of commitments) (byKind[c.kind] = byKind[c.kind] || []).push(c);
  const contradictions: Array<{ kind: string; values: any[]; artifacts: string[] }> = [];
  for (const [kind, list] of Object.entries(byKind)) {
    const distinct = [...new Set(list.map((c) => String(c.value) + (c.unit ? " " + c.unit : "")))];
    if (distinct.length > 1) {
      contradictions.push({ kind, values: distinct, artifacts: list.map((c) => c.artifact) });
    }
  }
  return { contradictions, clean: contradictions.length === 0, kindsChecked: Object.keys(byKind).length };
}

// ------------------------------------------------ permitted response shapes

/**
 * Which shapes of response the source actually permits.
 *
 * Added after a real failure. On a live pursuit the underwriter produced an
 * outright NO-BID because one mandatory content item could not be satisfied and
 * the full scope could not be safely delivered. An independent reviewer
 * overturned it by pointing at a sentence in the solicitation permitting phased
 * approaches. The underwriter had captured that sentence and never used it.
 *
 * The defect was structural: there was no step between capturing requirements
 * and reaching a verdict that asked what shapes of response are available. A
 * verdict reached without this step conflates "we cannot win the whole thing"
 * with "no legitimate response exists", which are different claims with
 * different answers.
 */
export const RESPONSE_STRUCTURES = [
  "full_scope_prime", "phased", "discovery_or_advisory_only",
  "alternate_response", "partnered_or_subcontracted", "no_bid",
] as const;

export interface ResponseStructureInput {
  /** True only where the source says so. Silence is not permission. */
  phasedPermittedBySource?: boolean | null;
  subcontractingAddressedBySource?: boolean | null;
  alternateResponsePermitted?: boolean | null;
  questionsChannelOpen?: boolean | null;
  mandatoryContentItems: Array<{ id: string; item: string; satisfiable: boolean }>;
  bidderCanDeliverFullScope: boolean;
  bidderCanDeliverAdvisoryScope: boolean;
  entityAuthorityResolved: boolean;
}

export function enumerateResponseStructures(input: ResponseStructureInput) {
  const unsatisfiable = input.mandatoryContentItems.filter((m) => !m.satisfiable);
  const available: Array<{ id: string; verdict: string; why: string }> = [];

  available.push({
    id: "full_scope_prime",
    verdict: input.bidderCanDeliverFullScope ? "available" : "refused",
    why: input.bidderCanDeliverFullScope
      ? "Delivery capability for the whole scope is established."
      : "Full scope cannot be safely delivered, so bidding it would risk winning work that cannot be performed.",
  });

  available.push({
    id: "phased",
    verdict: input.phasedPermittedBySource === true
      ? (input.bidderCanDeliverAdvisoryScope ? "available" : "refused")
      : "not_permitted_by_source",
    why: input.phasedPermittedBySource === true
      ? (input.bidderCanDeliverAdvisoryScope
        ? "The source permits phasing and the first phase sits inside demonstrated capability."
        : "Phasing is permitted but even the first phase exceeds capability.")
      : "The source does not state that phasing is permitted; assuming it would be inventing a commercial path.",
  });

  available.push({
    id: "discovery_or_advisory_only",
    verdict: input.phasedPermittedBySource === true && input.bidderCanDeliverAdvisoryScope ? "available" : "conditional",
    why: "Advisory scope promises analysis rather than a production system, which removes most delivery risk. Carries a real chance of being judged non-responsive where the buyer wants a single vendor for the whole build.",
  });

  available.push({
    id: "partnered_or_subcontracted",
    verdict: "unavailable_now",
    why: "No teaming or subcontract relationship exists. One may only be cited once it is real and documented, and a credible one cannot be created in the time remaining.",
  });

  available.push({ id: "no_bid", verdict: "always_available", why: "Declining is a legitimate and sometimes optimal outcome." });

  const anyBiddable = available.some((a) => a.verdict === "available");
  return {
    available,
    unsatisfiableMandatoryItems: unsatisfiable,
    /**
     * An unsatisfiable mandatory content item weakens every structure but does
     * not by itself eliminate them, unless the source frames it as an
     * eligibility threshold rather than required content.
     */
    anyLegitimateResponseExists: anyBiddable,
    blockedByAuthority: !input.entityAuthorityResolved,
    note: input.entityAuthorityResolved
      ? "Authority resolved; structure choice is a commercial decision."
      : "Every structure remains blocked until entity and signer authority are resolved, including a discovery-only response.",
  };
}
