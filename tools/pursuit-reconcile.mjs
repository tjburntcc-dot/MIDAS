/**
 * Reconcile the underwriting verdict with the independent adversarial review.
 *
 * The rule is not to average two answers. It is to find where they diverge,
 * trace each side to evidence, determine which is right, and record the root
 * cause so the same error is not repeated.
 *
 * Here the reviewer won on a specific, checkable point and the underwriter's
 * verdict changes as a result.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "@midas/db";
import { RESPONSE_STRUCTURES, enumerateResponseStructures } from "../packages/eval/src/high-stakes.ts";

const DIR = join(stateDir(), "pursuit", "idaho-aeyc");
const record = JSON.parse(readFileSync(join(DIR, "pursuit-record.json"), "utf8"));
const redteam = JSON.parse(readFileSync(join(DIR, "redteam-review.json"), "utf8"));

/**
 * The permitted response structures for this solicitation, enumerated from the
 * source rather than assumed. This step did not exist when the first verdict was
 * produced, which is precisely why that verdict was wrong.
 */
const structures = enumerateResponseStructures({
  phasedPermittedBySource: true,          // RFP section 8, verbatim: "Vendors may propose phased approaches if helpful."
  subcontractingAddressedBySource: null,  // the RFP is silent
  alternateResponsePermitted: null,       // silent; not prohibited
  questionsChannelOpen: true,             // same form accepts questions
  mandatoryContentItems: record.mandatorySubmissionItems.map((m) => ({ id: m.id, item: m.item, satisfiable: m.canSatisfy })),
  bidderCanDeliverFullScope: false,
  bidderCanDeliverAdvisoryScope: true,
  entityAuthorityResolved: false,
});

const DISAGREEMENT = {
  point: "Whether any legitimate proposal can be submitted at all.",
  underwriterPosition: "NO-BID outright. A mandatory content item cannot be satisfied and delivery capability is unproven.",
  reviewerPosition: "Full-scope NO-BID is correct, but an alternate Phase 0 advisory/discovery proposal is legitimate and feasible.",
  traced: [
    "RFP section 8 states verbatim: 'The total project budget is $50,000. Vendors may propose phased approaches if helpful.' Phasing is expressly permitted by the source. VERIFIED against the authoritative PDF.",
    "The RFP states no minimum years of experience, no reference requirement, no past-performance threshold, no insurance, no bonding, no vendor registration and no certification. VERIFIED by full review of the document.",
    "'Examples of similar work' is a required proposal content item, not a stated eligibility threshold. A truthful buyer-specific demonstration artifact is a weak answer to it, but it is an answer, and submitting one is not circumvention so long as it is never described as delivered client work.",
    "Advisory and discovery work sits inside Company 0's demonstrated capability in a way that a full build with donor portal and payment synchronisation does not.",
  ],
  resolution: "The reviewer is right and the underwriting verdict changes. The underwriter treated an unsatisfiable content item and an unwinnable full-scope bid as equivalent to no legitimate response existing. Those are different things.",
  rootCause: {
    what: "The pursuit system produced a verdict without first enumerating which response structures the source actually permits.",
    why: "There was no step between requirement capture and recommendation that asked: what shapes of response are available here -- full, phased, discovery, alternate, partnered, or none?",
    classification: "general capability gap, not a deal-specific mistake",
    fix: "enumerateResponseStructures added to high-stakes.ts and now runs before any verdict. A verdict produced without it is refused.",
    generality: "Applies to every future solicitation. Any opportunity whose source permits a narrower response would have hit the same failure.",
  },
};

/**
 * Both analyses agree on this, and it is the binding constraint. It is also the
 * one thing MIDAS cannot resolve: it requires a real conversation with an adult
 * and, on the minor-principal question, a lawyer.
 */
const REVISED = {
  fullScopeBid: {
    verdict: "NO-BID",
    agreement: "Underwriter and independent reviewer agree without reservation.",
    reasons: [
      "Scope includes a donor portal, external payment-portal synchronisation, interactive mapping, analytics and staff training, delivered to a fixed date by an operator with no delivered client project of any scope.",
      "Even at optimistic availability and optimistic effort, delivery consumes essentially all founder hours to December 31 with no reserve for defects, revision cycles, stakeholder delay, or the pending brand audit.",
      "Winning work that cannot be safely delivered is a failure, not a success.",
    ],
  },
  phaseZeroAlternateBid: {
    verdict: "LEGITIMATE OPTION, BLOCKED",
    blockedOn: "entity and signer authority",
    whyLegitimate: [
      "Phased approaches are expressly permitted by RFP section 8.",
      "Discovery and advisory work is inside Company 0's real capability; it promises thinking, not a production system with donor data.",
      "The mandatory content items can all be answered truthfully at this scope, with 'examples of similar work' answered by buyer-specific demonstration artifacts explicitly labelled as such and never as delivered client work.",
      "It creates no obligation to perform the full build, and caps downside at a small engagement.",
    ],
    indicativeValueUsd: { low: 7500, high: 12000 },
    valueBasis: "Reviewer's independent estimate for discovery, content inventory, information architecture, CMS and hosting recommendation, accessibility and SEO baseline, sample rewrites and a map proof-of-concept. Not a quote; no price may be offered until the entity gate clears.",
    honestWinProbability: "Low. Company 0 still scores zero on the stated nonprofit-experience criterion, and the buyer may treat a discovery-only response as non-responsive if it wants one vendor for the whole rebuild. Expressed as a category because there is no calibration data to support a number.",
    conditionsToProceed: [
      "The legal entity is verified in good standing, with its exact registered name.",
      "A legally capable adult with authority to bind the entity is identified and has knowingly consented to this specific engagement and its exposure.",
      "Counsel's view is obtained on whether an entity whose principal is a minor can bind itself, and on who signs.",
      "Mason decides he wants to pursue it, without being pushed by the size of the headline number.",
    ],
  },
  overallRecommendation: "Prepare the Phase 0 package so it is ready, and do not submit unless the entity and signer gate clears before the deadline. If it does not clear, the outcome is NO-BID and that is a correct result rather than a missed opportunity.",
  whatMidasCannotDecide: "Whether an adult in Mason's family is willing to take a legally meaningful role. That is a family decision, and using a $50,000 headline to pressure it would be exactly the behaviour this mission prohibits.",
};

const out = {
  at: new Date().toISOString(),
  pursuitId: record.pursuitId,
  responseStructures: structures,
  disagreement: DISAGREEMENT,
  revisedRecommendation: REVISED,
  reviewerUsd: redteam.usdEstimate,
  outboundActionsTaken: 0,
  note: "Phase A only. No buyer contact has occurred and none is authorised.",
};
writeFileSync(join(DIR, "reconciliation.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("=== RECONCILIATION ===");
console.log("  disagreement:", DISAGREEMENT.point);
console.log("  resolution :", DISAGREEMENT.resolution);
console.log("\n  ROOT CAUSE (" + DISAGREEMENT.rootCause.classification + "):");
console.log("   ", DISAGREEMENT.rootCause.what);
console.log("    fix:", DISAGREEMENT.rootCause.fix);
console.log("\n  PERMITTED RESPONSE STRUCTURES:");
for (const s of structures.available) console.log("   - " + s.id + ": " + s.verdict + "  -- " + s.why.slice(0, 150));
console.log("\n  REVISED VERDICT");
console.log("    full scope      :", REVISED.fullScopeBid.verdict, "(" + REVISED.fullScopeBid.agreement + ")");
console.log("    phase 0 alternate:", REVISED.phaseZeroAlternateBid.verdict, "-> blocked on", REVISED.phaseZeroAlternateBid.blockedOn);
console.log("    overall         :", REVISED.overallRecommendation);
