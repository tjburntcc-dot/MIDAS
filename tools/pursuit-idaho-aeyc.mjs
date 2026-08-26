/**
 * Pursuit underwriting for the Idaho AEYC website redevelopment RFP.
 *
 * This file is a DEAL INSTANCE. Every buyer fact, amount, date and requirement
 * lives here; the reasoning lives in packages/eval/src/high-stakes.ts and is
 * reusable unchanged for any other opportunity.
 *
 * Phase A only: internal underwriting. No buyer contact of any kind occurs here
 * and there is no transport in this file.
 *
 * Every fact below is tagged with how it is known. Facts read from the
 * authoritative PDF are primary-source verified; facts reported by the owner are
 * labelled as reported and unverified, because MIDAS has not seen the registry,
 * the operating agreement, or the Stripe account.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { stateDir } from "@midas/db";
import { classifyStakes, evidenceClosure, assessEntityAuthority, evaluateStageGate, detectContradictions } from "../packages/eval/src/high-stakes.ts";

const DIR = join(stateDir(), "pursuit", "idaho-aeyc");
const pdf = readFileSync(join(DIR, "RFP_primary.pdf"));
const pdfSha = createHash("sha256").update(pdf).digest("hex");

const TODAY = "2026-08-26";

// ------------------------------------------------- verified source facts
const SOURCE = {
  buyer: "Idaho Association for the Education of Young Children (Idaho AEYC)",
  buyerAddress: "1199 W Shoreline Ln, Suite 303, Boise, Idaho 83702",
  buyerPhone: "208.345.1090",
  buyerType: "nonprofit",
  primarySourceUrl: "https://idahoaeyc.org/careers/rfp-idaho-aeyc-website-redevelopment",
  authoritativeDocument: "Idaho_AEYC_Website_Redevelopment_RFP Final (1).pdf",
  documentSha256: pdfSha,
  aggregatorUrl: "https://usesettle.com/rfp-hunter/website-redevelopment-and-content-strategy-partnership-service-2306116",
  budgetUsd: 50000,
  submissionDeadline: "2026-08-28",
  deadlineTimeStated: false,
  deadlineTimezoneStated: false,
  deliveryDeadline: "2026-12-31",
  geographicRestriction: "United States only",
  submissionMechanism: "Web form linked from the RFP page (PROPOSAL SUBMISSION FORM); questions accepted through the same form",
  buyerProjectTeamSize: 4,
  currentPlatformObserved: "Drupal (site serves /sites/default/files/ paths)",
};

/** Section 12 of the RFP. All seven are required proposal contents. */
const MANDATORY_SUBMISSION_ITEMS = [
  { id: "M1", item: "Overview of your firm", canSatisfy: true, note: "A truthful overview of a new sole-operator business is possible." },
  { id: "M2", item: "Description of your approach to advisory-driven website projects", canSatisfy: true, note: "Can be written from genuine methodology." },
  { id: "M3", item: "Proposed process and timeline", canSatisfy: true, note: "Can be produced." },
  { id: "M4", item: "Team bios", canSatisfy: true, note: "Satisfiable only by a truthful bio of a single 16-year-old operator working with AI tooling. Truthful, and weak against the stated decision criteria." },
  { id: "M5", item: "Examples of similar work", canSatisfy: false, note: "Company 0 has no completed client work of any kind. Fabricating or implying examples is prohibited. This is a factual gap, not a wording problem, and it cannot be closed in the time remaining." },
  { id: "M6", item: "Proposed CMS and technical approach", canSatisfy: true, note: "Can be produced to a genuinely high standard." },
  { id: "M7", item: "Budget breakdown", canSatisfy: true, note: "Can be produced." },
];

/** Section 10. Scored criteria, distinct from the mandatory contents. */
const DECISION_CRITERIA = [
  { id: "D1", criterion: "Ability to advise and direct the process", position: "Contestable on the strength of the submitted thinking." },
  { id: "D2", criterion: "Strength of writing and content strategy", position: "Contestable; this is a genuine Company 0 capability." },
  { id: "D3", criterion: "Quality of design and user experience", position: "Contestable but unevidenced by prior delivered work." },
  { id: "D4", criterion: "Timeline feasibility", position: "Weak. A four-month full redevelopment delivered by one part-time minor plus AI tooling, with no delivered project of comparable scope, is not a credible schedule commitment." },
  { id: "D5", criterion: "Experience working with nonprofits or multi-audience organizations", position: "Zero. Company 0 has no nonprofit engagement and no multi-audience delivery history." },
  { id: "D6", criterion: "Clarity and completeness of proposal", position: "Contestable and probably a relative strength." },
];

/** Section 6D and 7. What would actually have to be built and operated. */
const SCOPE_ELEMENTS = [
  "Full redesign and rebuild, not a refresh",
  "Content strategy advisory across five distinct audiences",
  "New content written and existing content rewritten",
  "About Us, Family Resources, Events, Child Care Provider Resources, Blogs/News",
  "Early Learning Collaborative interactive map",
  "Donor portal",
  "Fundraising information",
  "Embedded video",
  "Sync with external payment portals",
  "Analytics implementation and behaviour tracking",
  "SEO preservation and improvement",
  "Accessible, mobile-responsive design",
  "CMS selection, hosting environment, security posture",
  "Optional CRM and email marketing integration",
  "Staff training on managing the site",
  "Flexible framework able to absorb a pending brand affiliation audit",
];

// --------------------------------------- Company 0 facts, honestly tagged
const COMPANY0 = {
  principal: "Mason, age 16, sole operator",
  principalIsMinor: true,
  entityReported: "An LLC reportedly exists; operational and legal readiness reported as incomplete or unclear",
  entityVerifiedByMidas: false,
  stripeReported: "Stripe business account reported operational, set up with the father's assistance",
  priorClosedDeals: 0,
  priorClientReferences: 0,
  pastPerformanceRecord: "none",
  linkedInPresence: false,
  websiteProvenance: "Built quickly with AI; not yet audited as enterprise credibility evidence",
  insuranceHeld: [],
  deliveryHistory: "No delivered client project of any scope",
  availability: "School term constrains weekday availability",
};

const stakes = classifyStakes({
  potentialContractValueUsd: SOURCE.budgetUsd,
  expectedContributionUsd: 30000,
  irreversibility: 0.7,      // a signed fixed-price build to a fixed date
  legalExposure: 0.8,        // minor principal, unverified entity, contract with a nonprofit
  reputationalImpact: 0.6,   // a visible statewide nonprofit
  customerImpact: 0.7,       // their primary public channel for families and donors
  technicalComplexity: 0.6,  // donor portal, payment sync, maps, integrations
  uncertainty: 0.75,         // entity, signer, delivery capacity all unresolved
  scopeBreadth: 0.8,
  securityPrivacyExposure: 0.7, // donor data and payment portal adjacency
  deliveryDurationDays: 127,
  dependencyCount: 6,
  correctionDifficulty: 0.7,
});

const entity = assessEntityAuthority({
  legalEntityName: null,               // not verified by MIDAS against any registry
  registryVerified: false,
  principalIsMinor: true,
  authorizedSignerIdentified: false,
  authorizedSignerIsAdult: null,
  authorizedSignerConsented: false,
  bankOrPayoutReady: null,
  w9Ready: null,
  insuranceHeld: [],
  insuranceRequiredBySource: [],       // the RFP states no insurance requirement
  vendorRegistrationRequired: false,   // none stated
  submissionCreatesBindingCertification: false, // the RFP contains no certification language
  personalGuaranteeRequested: false,
});

const MATERIAL_ITEMS = [
  { id: "S1", category: "source", statement: "Authoritative RFP document retrieved and hashed from the buyer's own domain.", status: "verified_primary_source", materiality: "Everything downstream depends on the real requirements rather than an aggregator summary.", evidence: "sha256 " + pdfSha.slice(0, 16), source: SOURCE.primarySourceUrl, verifiedBy: "midas.pursuit", verifiedAt: TODAY },
  { id: "S2", category: "source", statement: "Buyer identity, address and phone confirmed on the buyer's own site.", status: "verified_primary_source", materiality: "Confirms this is a real organisation and not an aggregator artifact.", source: "https://idahoaeyc.org/" },
  { id: "S3", category: "source", statement: "Submission deadline is August 28, 2026.", status: "verified_primary_source", materiality: "Two days from today; governs whether any path is feasible.", source: "RFP PDF page 1" },
  { id: "S4", category: "source", statement: "Deadline clock time and timezone are not stated anywhere in the RFP.", status: "unknown", materiality: "A submission timed against an assumed hour could miss.", blocking: false, note: "Would need to be asked; non-blocking only because no submission is recommended." },
  { id: "S5", category: "source", statement: "Total project budget is $50,000; phased approaches permitted.", status: "verified_primary_source", materiality: "Sets the economic ceiling.", source: "RFP PDF page 4" },
  { id: "S6", category: "source", statement: "Delivery must complete by December 31, 2026.", status: "verified_primary_source", materiality: "Roughly four months for a full rebuild with integrations.", source: "RFP PDF page 5" },
  { id: "S7", category: "source", statement: "The aggregator listing omitted the decision criteria, required features, the payment-portal requirement and the delivery deadline.", status: "verified", materiality: "Confirms that discovery summaries are not a safe basis for a high-stakes decision.", verifiedBy: "midas.pursuit" },

  { id: "R1", category: "requirement", statement: "Examples of similar work are a required proposal component.", status: "verified_primary_source", materiality: "Company 0 cannot supply any. This is a mandatory content item, not a scored preference.", blocking: true, source: "RFP PDF page 6" },
  { id: "R2", category: "requirement", statement: "Team bios are a required proposal component.", status: "verified_primary_source", materiality: "Satisfiable only by disclosing a single minor operator.", source: "RFP PDF page 6" },
  { id: "R3", category: "requirement", statement: "Experience with nonprofits or multi-audience organisations is a scored decision criterion.", status: "verified_primary_source", materiality: "Company 0 scores zero on a stated criterion.", source: "RFP PDF page 5" },
  { id: "R4", category: "requirement", statement: "The RFP states no insurance, bonding, vendor-registration or certification requirement.", status: "verified_primary_source", materiality: "Materially lowers the procurement barrier relative to a government solicitation.", source: "Full RFP text reviewed" },
  { id: "R5", category: "requirement", statement: "Required features include a donor portal and synchronisation with external payment portals.", status: "verified_primary_source", materiality: "Brings donor personal data and payment-adjacent flows into scope, which raises the security and privacy obligation well above a brochure site.", source: "RFP PDF pages 4-4" },

  { id: "E1", category: "entity", statement: "Company 0's legal entity has not been verified by MIDAS against any public registry.", status: "unknown", materiality: "No verified contracting party has been established.", blocking: true },
  { id: "E2", category: "entity", statement: "The principal operator is 16 years old.", status: "verified", materiality: "A minor's contract is generally voidable by the minor, which is a risk borne by the buyer and material to them.", evidence: "Owner-reported and not in dispute" },
  { id: "E3", category: "entity", statement: "No adult with authority to bind the entity has been identified and has consented to this specific engagement.", status: "unknown", materiality: "Without one there is no party that can safely sign a $50,000 agreement.", blocking: true },
  { id: "E4", category: "entity", statement: "Parent or guardian willingness to take a legally meaningful role is uncertain.", status: "unknown", materiality: "Cannot be assumed, and must never be assumed merely because a parent exists.", blocking: true },

  { id: "D1", category: "delivery", statement: "Company 0 has never delivered a client project of any scope.", status: "verified", materiality: "There is no demonstrated delivery capability under representative conditions, which the mission requires before promising enterprise work.", blocking: true, evidence: "Owner-reported; no contrary evidence found" },
  { id: "D2", category: "delivery", statement: "Scope includes a donor portal, payment-portal synchronisation, interactive mapping, embedded video and analytics, delivered in about four months alongside school.", status: "verified_primary_source", materiality: "This is a multi-workstream build, not a brochure site.", source: "RFP PDF pages 3-4" },
  { id: "D3", category: "delivery", statement: "No human specialist, contractor or partner is currently engaged or identified.", status: "verified", materiality: "There is no route to cover capability Company 0 lacks.", blocking: false },

  { id: "C1", category: "credibility", statement: "Company 0 has no portfolio, references, past performance, or professional public presence.", status: "verified", materiality: "Directly attacks three of the six stated decision criteria.", evidence: "Owner-reported; no LinkedIn; website AI-built and unaudited" },
  { id: "C2", category: "commercial", statement: "Competing bidders for a $50,000 nonprofit web contract will typically submit real portfolios and nonprofit references.", status: "inferred", materiality: "Sets a realistic ceiling on win probability.", note: "Inference from the nature of the solicitation, not from observed competitor bids." },
];

const closure = evidenceClosure(MATERIAL_ITEMS);

const gate = evaluateStageGate({
  stage: "internal_underwriting",
  sourceVerified: true,
  requirementsCaptured: true,
  entityAuthority: entity,
  closure,
  mandatoryRequirementsUnmet: MANDATORY_SUBMISSION_ITEMS.filter((m) => !m.canSatisfy).map((m) => m.id + ": " + m.item),
  deliveryFeasibilityEstablished: false,
  ownerApproved: false,
  requiredAdultApproved: null,
  adultParticipationRequired: true,
  professionalReviewRequired: true,
  professionalReviewComplete: false,
});

const contradictions = detectContradictions([
  { id: "c1", kind: "submission_deadline", value: "2026-08-28", artifact: "RFP PDF page 1" },
  { id: "c2", kind: "submission_deadline", value: "2026-08-28", artifact: "aggregator listing" },
  { id: "c3", kind: "budget_usd", value: 50000, artifact: "RFP PDF page 4" },
  { id: "c4", kind: "budget_usd", value: 50000, artifact: "aggregator listing" },
  { id: "c5", kind: "delivery_deadline", value: "2026-12-31", artifact: "RFP PDF page 5" },
]);

// ------------------------------------------------------------- economics
const economics = {
  publishedContractValueUsd: 50000,
  proposedPriceUsd: null,
  note: "No price is proposed. Pricing a commitment that cannot be signed or safely delivered would be the wrong artifact.",
  estimatedDeliveryEffortHours: { low: 350, high: 700 },
  effortBasis: "Full rebuild with content rewriting across five audiences, donor portal, payment-portal sync, interactive map, analytics, training and a brand-flexible framework. Range reflects genuine uncertainty about the existing content inventory, which has not been measured.",
  founderAvailableHoursToDec31: { low: 200, high: 420 },
  availabilityBasis: "School term. 12-25 hours per week over roughly 17.5 weeks.",
  capacityVerdict: "Even at the optimistic end of availability and the optimistic end of effort, delivery consumes essentially all available founder time with no reserve for defects, revisions, stakeholder delay, or the brand audit landing mid-project.",
  winProbability: { range: "low", basis: "Zero on one of six stated decision criteria, unable to supply a mandatory proposal component, and no portfolio against bidders who will have one. Expressed as a category because there is no calibration data to justify a number." },
  pursuitCostEstimate: "Roughly 20-40 founder hours to produce a competitive-looking proposal in two days, plus model cost.",
  riskAdjustedVerdict: "Expected contribution does not justify the pursuit cost given a low win probability and, more decisively, the commitment cannot be legally entered or safely delivered if won.",
};

const REJECTION_REGISTER = [
  { id: "RJ1", mode: "Missing mandatory proposal component (examples of similar work)", controllable: false, likelihood: "certain", impact: "Non-compliant or heavily discounted submission", mitigation: "None available truthfully within two days." },
  { id: "RJ2", mode: "Zero score on stated nonprofit/multi-audience experience criterion", controllable: false, likelihood: "certain", impact: "Direct scoring loss", mitigation: "None; cannot be manufactured." },
  { id: "RJ3", mode: "Team bio discloses a single 16-year-old operator", controllable: false, likelihood: "certain", impact: "Evaluator concern about capacity and continuity", mitigation: "Truthful disclosure is mandatory; concealment is prohibited." },
  { id: "RJ4", mode: "Timeline feasibility challenged", controllable: "partly", likelihood: "high", impact: "Scoring loss on a stated criterion", mitigation: "A phased proposal is permitted and would help, but does not fix capacity." },
  { id: "RJ5", mode: "Buyer discovers no contracting authority", controllable: true, likelihood: "high", impact: "Award withdrawn or contract unsignable", mitigation: "Resolve entity and signer first. Not achievable in two days." },
  { id: "RJ6", mode: "Donor data and payment-portal handling raises security questions", controllable: true, likelihood: "moderate", impact: "Disqualifying concern for a donor-facing nonprofit", mitigation: "Requires a real security posture, not a paragraph." },
  { id: "RJ7", mode: "Competitors submit portfolios and nonprofit references", controllable: false, likelihood: "high", impact: "Relative loss", mitigation: "None in the timeframe." },
];

const recommendation = {
  verdict: "NO-BID",
  confidenceBasis: "Two independent hard gates fail, either of which is sufficient on its own.",
  reasons: [
    "A mandatory proposal component -- examples of similar work -- cannot be supplied truthfully. The mission forbids rationalising around a mandatory requirement, and fabricating or implying examples is prohibited outright.",
    "No verified legal entity and no identified, consenting, legally capable signer exists. A $50,000 agreement cannot be entered. A minor's contract is generally voidable by the minor, which is a real risk to the buyer, and it is not cured by an entity wrapper whose status MIDAS has not verified.",
    "Delivery capability has never been demonstrated under representative conditions. The scope includes a donor portal and payment-portal synchronisation for a statewide nonprofit, and winning work that cannot be safely delivered is a failure, not a success.",
    "Even at optimistic assumptions, the delivery estimate consumes essentially all available founder time to December 31 with no reserve.",
  ],
  whatWouldChangeIt: [
    "A real portfolio of comparable delivered work. This is the binding constraint and takes months, not days.",
    "A verified entity in good standing with an identified adult signer who has knowingly consented, and counsel's view on a minor-principal LLC binding itself.",
    "A demonstrated delivery record on smaller paid engagements first.",
    "An experienced partner or subcontractor with genuine nonprofit web delivery history, engaged properly rather than named aspirationally.",
  ],
  notRecommendedAndWhy: {
    narrowFactualInquiry: "Permitted by the mission only with explicit owner approval of an exact message. Not recommended here: the blocking gaps are Company 0's, not the buyer's, so no answer the buyer could give would change the verdict. Asking would consume the buyer's time to no purpose.",
  },
  redirect: "The same capability that produced this verdict in an afternoon should be pointed at opportunities sized to Company 0's actual position: engagements small enough to be delivered and paid, which build the portfolio that makes an RFP like this winnable later.",
};

const report = {
  at: new Date().toISOString(),
  pursuitId: "PURSUIT-IDAHO-AEYC-2026-08",
  workItemId: "WI-39f6b3ce",
  today: TODAY,
  phase: "A_internal_underwriting",
  outboundActionsTaken: 0,
  source: SOURCE,
  mandatorySubmissionItems: MANDATORY_SUBMISSION_ITEMS,
  decisionCriteria: DECISION_CRITERIA,
  scopeElements: SCOPE_ELEMENTS,
  company0: COMPANY0,
  stakes,
  entityAuthority: entity,
  evidenceClosure: closure,
  materialItems: MATERIAL_ITEMS,
  stageGate: gate,
  contradictions,
  economics,
  rejectionRegister: REJECTION_REGISTER,
  recommendation,
};

writeFileSync(join(DIR, "pursuit-record.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("=== IDAHO AEYC PURSUIT UNDERWRITING (Phase A, no buyer contact) ===");
console.log("  authoritative document sha256:", pdfSha.slice(0, 24));
console.log("  buyer:", SOURCE.buyer);
console.log("  budget: $" + SOURCE.budgetUsd + " | submission " + SOURCE.submissionDeadline + " | delivery by " + SOURCE.deliveryDeadline);
console.log("\n  STAKES:", stakes.tier, "(" + stakes.score + ")");
console.log("    requires:", Object.entries(stakes.requires).filter(([, v]) => v).map(([k]) => k).join(", "));
console.log("\n  MANDATORY SUBMISSION ITEMS: " + MANDATORY_SUBMISSION_ITEMS.filter((m) => m.canSatisfy).length + "/" + MANDATORY_SUBMISSION_ITEMS.length + " satisfiable");
for (const m of MANDATORY_SUBMISSION_ITEMS.filter((x) => !x.canSatisfy)) console.log("    UNSATISFIABLE " + m.id + ": " + m.item);
console.log("\n  ENTITY / AUTHORITY:", entity.summary);
for (const b of entity.blockers) console.log("    BLOCKER " + b.id + ": " + b.finding);
console.log("\n  EVIDENCE CLOSURE: " + closure.closed + "/" + closure.total + " closed (" + (100 * closure.coverage).toFixed(1) + "%), " +
  closure.blocking + " blocking, " + closure.conflicts + " conflicts");
for (const b of closure.blockingItems) console.log("    BLOCKING " + b.id + ": " + b.statement);
console.log("\n  CONTRADICTIONS:", contradictions.clean ? "none across " + contradictions.kindsChecked + " commitment kinds" : JSON.stringify(contradictions.contradictions));
console.log("\n  PERMITTED STAGE:", gate.permittedStage);
console.log("  external contact permitted:", gate.externalContactPermitted, "| binding permitted:", gate.bindingPermitted);
for (const [stage, why] of Object.entries(gate.refusals)) console.log("    refused " + stage + ": " + why.join(" | "));
console.log("\n  RECOMMENDATION:", recommendation.verdict);
for (const r of recommendation.reasons) console.log("    - " + r);
