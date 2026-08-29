/**
 * What survived AutoShop.
 *
 * Nine months of decision work were audited read-only and classified
 * DECISION_LIBRARY: no runtime cleared direct reuse, the tests were valuable as
 * invariants rather than as files, and the doctrine was worth more than either.
 * This module is the cheapest possible preservation of that intellectual
 * capital -- a record of ten general invariants, each pinned to the MIDAS
 * surface that already enforces it or to the honest statement that no such
 * surface exists yet.
 *
 * Nothing here is ported. No AutoShop type, schema, dependency, case shape or
 * selection rule is present, and the companion test file asserts that
 * mechanically rather than trusting this sentence.
 *
 * The classification matters more than the count. An invariant recorded as
 * ACTIVE_REGRESSION is one a live MIDAS surface enforces today, and the test
 * proves it. One recorded as PROSPECTIVE_CONTRACT_TEST is one MIDAS cannot
 * enforce, and its test asserts the gap is still open rather than manufacturing
 * machinery to turn green. A pending regression that says the runtime is
 * missing is worth more than a passing test against a placeholder.
 */

export const AUTOSHOP_SOURCE = {
  repository: "AutoShop",
  commit: "18f0c6f06ef7",
  architecturalRole: "DECISION_LIBRARY",
  handling: "Read-only evidence. No runtime, schema, dependency or case shape was imported.",
  salvageValue: { runtimeCode: "LOW", tests: "HIGH", doctrine: "VERY_HIGH", failureHistory: "HIGH" },
} as const;

export const CLASSIFICATIONS = [
  "ACTIVE_REGRESSION",
  "PROSPECTIVE_CONTRACT_TEST",
  "DOCTRINE_ONLY",
  "NOT_CURRENTLY_APPLICABLE",
] as const;

export interface TransferredInvariant {
  id: string;
  name: string;
  /** The AutoShop test family or contract the lesson came from. */
  autoshopFamily: string;
  /** The general statement, with no AutoShop, currency or product vocabulary in it. */
  invariant: string;
  /** How that statement reads against MIDAS as it actually is. */
  midasInterpretation: string;
  classification: string;
  /** The live MIDAS surface that enforces it, or null where none exists. */
  runtimeSurface: string | null;
  /** What would have to exist before the invariant could be enforced. */
  futureRequirement: string | null;
}

export const TRANSFERRED_INVARIANTS: TransferredInvariant[] = [
  {
    id: "AI-01",
    name: "Abstention must name what would change the decision",
    autoshopFamily: "offline-decision-packet ABSTAIN, informationRequiredBeforeReconsideration minimum one",
    invariant: "A decision system may not answer with more information, more research or another test without naming specific information whose resolution could materially change the recommendation.",
    midasInterpretation: "The Manager may select research, run_micro_test or defer, and nothing requires it to name the information that would resolve the question. Refusal is exactly as cheap to write as commitment, which is the mechanism behind the cleanly confirmed under-commitment finding.",
    classification: "PROSPECTIVE_CONTRACT_TEST",
    runtimeSurface: null,
    futureRequirement: "A Manager output field, or a scorer key, that binds a low-commitment selection to the specific unknown it is buying. Not built in this mission: it would change the worker contract.",
  },
  {
    id: "AI-02",
    name: "A simulation claim requires a simulation payload",
    autoshopFamily: "simulation-claim-boundary, requireSimulationPayloadForClaim",
    invariant: "A claim that something was validated in simulation is only admissible if an actual simulation run exists behind it.",
    midasInterpretation: "MIDAS states this as tier evidence rather than as prose detection. SIMULATION_CERTIFIED requires simulation evidence records; without them the award is capped whatever the scores say, and the cap is reported as an evidence limit.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "academy.ts: TIER_EVIDENCE_REQUIREMENTS and certify()",
    futureRequirement: null,
  },
  {
    id: "AI-03",
    name: "An economic claim must satisfy its declared derivation",
    autoshopFamily: "offline-decision-packet economic formulas pinned as literals",
    invariant: "A consequential figure must be derivable from grounded operands with compatible units and valid period semantics. A number that merely appears somewhere in the evidence is not support for a differently dimensioned claim.",
    midasInterpretation: "MIDAS enforces this with unit algebra rather than with pinned formula strings, which is the stronger mechanism: a coincidental value match with the wrong dimension is reported as a unit error rather than passed.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "numeric-support-v2.ts: classifyClaimsV2, deriveWithDimension, PERIOD_FACTORS",
    futureRequirement: null,
  },
  {
    id: "AI-04",
    name: "Post-cutoff or stale evidence cannot silently support a decision",
    autoshopFamily: "offline-decision-packet evidence classification, excluded_post_cutoff and stale_context",
    invariant: "Evidence that falls outside the decision cutoff, or whose verification has expired, cannot count as support without that being visible.",
    midasInterpretation: "MIDAS has the vocabulary and none of the arithmetic. The Auditor can name a claim stale, and no support-computing surface consumes a timestamp: evidence closure treats a verified item as closed no matter how old the verification is.",
    classification: "PROSPECTIVE_CONTRACT_TEST",
    runtimeSurface: null,
    futureRequirement: "A cutoff or expiry input consumed by evidence closure, so an item can go from closed to open by the passage of time alone. Not built in this mission.",
  },
  {
    id: "AI-05",
    name: "Contradictory evidence cannot be ignored",
    autoshopFamily: "CONTRADICTORY_EVIDENCE abstain code, evidence classification contradictory",
    invariant: "Where material evidence conflicts with the premise of a recommendation, the conflict stays explicit. It may be resolved, it may force abstention, it may be shown immaterial. It may not be settled by quietly preferring one side.",
    midasInterpretation: "A conflicted material item blocks the gate on its own, independent of coverage, so a high proportion of closed items cannot outvote one live contradiction. Divergent commitments across artifacts are detected structurally rather than by a reader noticing.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "high-stakes.ts: evidenceClosure, detectContradictions, evaluateStageGate",
    futureRequirement: null,
  },
  {
    id: "AI-06",
    name: "An ineligible option must not suppress a legal cheaper one",
    autoshopFamily: "orchestrator step 7a, hard-constraint filtering before ranking",
    invariant: "Options ruled out by a hard constraint are removed before comparison. Refusing the highest-value option is never the same finding as no legitimate option existing.",
    midasInterpretation: "MIDAS learned the identical lesson on a live pursuit, where a verdict of no bid was reached because the full scope could not be delivered while a phased response the source permitted was available and unused. The response-structure enumeration exists because of that failure: one structure refused does not collapse the set.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "high-stakes.ts: enumerateResponseStructures, anyLegitimateResponseExists",
    futureRequirement: "A general candidate ranker with an eligibility pass does not exist in MIDAS; the invariant is enforced where selection actually happens today.",
  },
  {
    id: "AI-07",
    name: "A material recommendation requires provenance",
    autoshopFamily: "assertExternalEvidenceSetProvenanceComplete, provenanceLinks minimum one",
    invariant: "A consequential fact supporting an action traces to the evidence it came from. Structural or self-evident statements do not need ceremony; load-bearing ones do.",
    midasInterpretation: "MIDAS checks the excerpt against the fetched source rather than checking that a link field is populated, which is the stricter reading: a citation that does not appear in what was actually retrieved is not provenance. An inference presented as a source fact is a distinct and named failure.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "source-support.ts: checkSourceSupport, SUPPORT_STATUSES",
    futureRequirement: null,
  },
  {
    id: "AI-08",
    name: "A fingerprint proves identity, never authority",
    autoshopFamily: "offline-decision-renewal sourceFingerprint, recompute on import",
    invariant: "An artifact whose material contents do not reproduce its stored fingerprint is not the same frozen artifact. A matching fingerprint establishes that and nothing else: identity is not permission.",
    midasInterpretation: "MIDAS fingerprints the subject of a certification rather than the decision document, and the second half of the invariant is the one that earned its place here. Two runs against an identical target id can award different tiers, because the identity says who was measured and the evidence says what they are allowed to do.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "academy.ts: targetId, certify",
    futureRequirement: null,
  },
  {
    id: "AI-09",
    name: "Untrusted structure must not silently change decision semantics",
    autoshopFamily: "source-bundle strict schema, prototype confusion rejection at any depth",
    invariant: "Structure arriving from outside the system cannot introduce fields the schema never declared, and cannot alter the shape of the object a decision is read from.",
    midasInterpretation: "Every model reply enters MIDAS through one validator. Under a strict schema the invariant holds and the injected key is reported and dropped. Under a permissive schema it does not: an injected prototype key silently changes the prototype of the validated object and produces a field that reads as present while appearing in no key listing. The exposure is real, it is asserted rather than described, and the repair is a schema discipline rather than new machinery.",
    classification: "ACTIVE_REGRESSION",
    runtimeSurface: "schema-guard.ts: validateAgainstSchema",
    futureRequirement: "Either a prototype-key guard in the validator, or a rule that every decision-bearing outputSchema declares additionalProperties false. Deliberately not implemented in this mission, which changes no runtime.",
  },
  {
    id: "AI-10",
    name: "Reassessment must have a reason",
    autoshopFamily: "offline-decision-renewal, RenewalDisposition and requirementResolutions",
    invariant: "A decision already made does not reopen arbitrarily. Reopening is triggered by something: new evidence, a material change of state, expiry, or previously named information becoming available.",
    midasInterpretation: "The Manager must state a reassessment trigger and is scored on stating one, which is the front half. Nothing in MIDAS consumes that trigger, so nothing can test whether a reopening was warranted by it. There is no reassessment runtime to hold to account.",
    classification: "PROSPECTIVE_CONTRACT_TEST",
    runtimeSurface: "manager.ts: scoreManagerDecision hasFalsifier requires a stated trigger, and no surface consumes it",
    futureRequirement: "A reassessment path that takes a prior decision and a stated trigger and refuses to reopen without one. Not built in this mission.",
  },
];

export function invariantById(id: string) {
  const found = TRANSFERRED_INVARIANTS.find((i) => i.id === id);
  if (!found) throw new Error("no transferred invariant " + id);
  return found;
}

export function byClassification(c: string) {
  return TRANSFERRED_INVARIANTS.filter((i) => i.classification === c);
}

/**
 * What was deliberately left behind.
 *
 * Recorded as text so the companion test can assert mechanically that no file
 * in this transfer imports any of it. The largest item is the first: sixty-nine
 * contracts and roughly fifty-five tests around a pipeline built not to emit,
 * whose suite certifies the absence of capability. Importing it would look like
 * maturity and would be the opposite of what MIDAS needs.
 */
export const REJECTED_AUTOSHOP_IMPORTS = [
  "brain contract family and brain runtime",
  "confidence derived from counting sources",
  "founder-fit probability passed through without derivation",
  "Shopify and store state",
  "billing and referrals",
  "Supabase product persistence",
  "AutoShop user interface",
  "AutoShop Zod schemas",
  "AutoShop argmax selection with lexicographic tiebreak",
  "AutoShop orchestration",
];

/**
 * Module specifiers no file in this transfer may import.
 *
 * Naming an AutoShop contract in a provenance record is the point of the
 * record. Importing one would be the thing this mission forbids, so the two are
 * checked separately: this list is matched against import specifiers only.
 */
export const FORBIDDEN_IMPORTS = [
  "zod",
  "brain-",
  "offline-decision",
  "shopify",
  "supabase",
];
