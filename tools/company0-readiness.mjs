/**
 * Company 0 readiness assessment.
 *
 * Dogfood, not core. Every company-specific fact lives here and in var/, never
 * in the general readiness model.
 *
 * The discipline this run is under: absence of evidence is recorded as absence
 * of evidence, never as absence of the thing. Where MIDAS cannot verify a fact
 * itself, it records exactly which input would let it, and prepares everything
 * that does not depend on that input.
 *
 * No outbound action. Nothing here contacts anyone.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { readinessProfile, routeReadinessWork } from "../packages/eval/src/readiness.ts";

const ITEMS = [
  // ---------------------------------------------------------------- entity
  {
    id: "C0-ENT-1", dimension: "entity",
    requirement: "Exact registered entity name and state, confirmed active on the registry",
    status: "unknown",
    evidence: "CORRECTED 2026-08-27. Previously recorded as reported-but-unverified, which implied an entity exists. The owner now reports it may never have been formed. Status is unknown in both directions, and the readiness question is no longer 'what is it called' but 'is one needed yet' -- answered in ENTITY_DECISION.md as: probably not, and the lawyer question dominates formation.",
    gates: ["sign_binding_contract", "invoice_and_collect", "bid_public_sector", "bid_enterprise", "onboard_client"],
    actor: "midas", preparable: true,
    prepared: "packets/ENTITY_AND_VERIFICATION.md section 1 -- the registry checks are written out. Blocked only on the registered name and state.",
    whyItGates: "Every commercial commitment the company makes rests on the entity being real, correctly named, and in good standing.",
  },
  {
    id: "C0-ENT-2", dimension: "entity",
    requirement: "An adult with authority to bind the company who has knowingly agreed to do so",
    status: "absent",
    evidence: "No adult has been identified and asked. A parent assisting with a payment account is not the same as an adult who has agreed to be an authorised signer, and must not be recorded as if it were.",
    gates: ["sign_binding_contract", "bid_enterprise", "carry_client_risk"],
    actor: "adult_signer", preparable: true,
    prepared: "ADULT_DECISION_PACKAGE.md exists and explains what is being asked and what it would mean. It has not been delivered.",
    whyItGates: "The principal is 16. In most US states a contract signed by a minor is voidable by the minor, which is a real risk the buyer carries.",
  },
  {
    id: "C0-ENT-3", dimension: "entity",
    requirement: "Legal position on whether an LLC whose only member is a minor can bind itself",
    status: "unknown",
    evidence: "UNRESOLVED and must stay that way until a professional answers it. MIDAS has repeatedly reached this question and must not resolve it by inference. No dollar threshold below which work is acceptable has any authoritative basis yet.",
    gates: ["sign_binding_contract"],
    actor: "third_party", preparable: true,
    prepared: "LEGAL_REVIEW_PACKET.md -- seventeen questions for a Pennsylvania small-business attorney, covering capacity, structure, invoice identity, liability, insurance timing, platform terms and the forward question of what would make adult participation reasonable. One consultation, no preparation needed.",
    whyItGates: "It determines whether the signer problem is solved by an entity wrapper or only by an adult signer.",
  },

  // ------------------------------------------------------------- financial
  {
    id: "C0-FIN-1", dimension: "financial", requirement: "Ability to receive client payment",
    status: "reported_unverified",
    evidence: "A Stripe account is reported to be configured as a business. That is a Stripe account type, not evidence of a legal entity, a business bank account, or contracting authority. The name the account is actually under is the one genuinely blocking fact, because it decides what an invoice may truthfully say.",
    gates: ["invoice_and_collect"], actor: "owner", preparable: true,
    prepared: "packets/ENTITY_AND_VERIFICATION.md section 2 -- what must match between the account and the entity.",
    whyItGates: "Delivered work that cannot be invoiced and collected is a hobby.",
  },
  {
    id: "C0-FIN-2", dimension: "financial", requirement: "An invoice template carrying correct legal identity and terms",
    status: "verified", evidence: "Template written in packets/ENTITY_AND_VERIFICATION.md section 2. The legal identity it needs is C0-ENT-1, which gates the same capability separately.",
    gates: ["invoice_and_collect"], actor: "midas", preparable: true,
    prepared: "packets/ENTITY_AND_VERIFICATION.md section 2 -- template written; blocked only on the registered name and which account holds the money.",
    whyItGates: "An invoice with the wrong legal name is not enforceable and looks amateur at the worst moment.",
  },

  // ------------------------------------------------------------ commercial
  {
    id: "C0-COM-1", dimension: "commercial", requirement: "A written scope-and-terms document for small engagements",
    status: "verified", evidence: "packets/ENGAGEMENT_TERMS.md exists and is complete. It cannot be executed until a signer exists, but that is C0-ENT-2's problem, not this one.",
    gates: ["onboard_client", "quote_confidently"], actor: "midas", preparable: true,
    prepared: "packets/ENGAGEMENT_TERMS.md -- complete and usable once a signer exists.",
    whyItGates: "Without written scope, every small job is an unbounded one, and the first dispute is unwinnable.",
  },
  {
    id: "C0-COM-2", dimension: "commercial", requirement: "A defensible price list for the services actually offered",
    status: "verified", evidence: "packets/RATE_CARD.md exists, with ranges tied to the honest position of a company with no delivered work.",
    gates: ["quote_confidently"], actor: "midas", preparable: true,
    prepared: "packets/RATE_CARD.md -- ranges, adjustment rules, walk-away points, and the one discount worth giving.",
    whyItGates: "Ad hoc pricing under time pressure is how a first engagement gets underpriced and resented.",
  },

  // ----------------------------------------------------------- credibility
  {
    id: "C0-CRE-1", dimension: "credibility", requirement: "Evidence of delivered work that a buyer can inspect",
    status: "absent",
    evidence: "No delivered client project of any scope. This is a fact, not a presentation problem, and must not be dressed up.",
    gates: ["evidence_past_work", "bid_enterprise"], actor: "midas", preparable: true,
    whyItGates: "Most buyers score prior work explicitly. Zero is a real disadvantage that only delivery removes.",
  },
  {
    id: "C0-CRE-2", dimension: "credibility", requirement: "A website that survives buyer inspection and claims nothing untrue",
    status: "unknown",
    evidence: "A site was built quickly with AI and has never been audited. MIDAS holds no URL for it, so it has not been read. An unaudited site making unverifiable claims is a liability, not an asset.",
    gates: ["be_found_by_buyers"], actor: "midas", preparable: true,
    prepared: "packets/WEBSITE_AUDIT.md -- a claim-by-claim truth audit aimed at the fabricated credibility AI copy inserts by default. Runs on supply of the URL.",
    whyItGates: "It is the first thing a buyer checks, and any fabricated claim on it is worse than having no site.",
  },
  {
    id: "C0-CRE-3", dimension: "credibility", requirement: "A professional contact address on the company domain",
    status: "unknown", evidence: "Not assessed. No domain confirmed to MIDAS.",
    gates: ["be_found_by_buyers", "onboard_client"], actor: "owner", preparable: true,
    prepared: "packets/CREDIBILITY_AND_COVER.md section 1 -- provider, address form, signature and test procedure. Blocked on domain confirmation.",
    whyItGates: "A free-mail address on a proposal costs credibility for no reason and is cheap to fix.",
  },
  {
    id: "C0-CRE-4", dimension: "credibility", requirement: "A truthful professional profile",
    status: "absent",
    evidence: "No professional profile presence. Must state what is true: a new company, a sole operator, real skills, no delivered client work yet.",
    gates: ["be_found_by_buyers"], actor: "owner", preparable: true,
    prepared: "packets/CREDIBILITY_AND_COVER.md section 2 -- full profile text drafted, every line true, awaiting owner review.",
    whyItGates: "Buyers look for a person behind a new company. Finding nobody is worse than finding someone new.",
  },

  // ------------------------------------------------------------- insurance
  {
    id: "C0-INS-1", dimension: "insurance", requirement: "General and professional liability cover",
    status: "absent", evidence: "No cover held.",
    gates: ["bid_enterprise", "carry_client_risk"], actor: "adult_signer", preparable: true,
    prepared: "packets/CREDIBILITY_AND_COVER.md section 3 -- cover types, indicative ranges, and the full information set a broker will ask for.",
    whyItGates: "Larger buyers require a certificate before contracting, and a minor cannot ordinarily hold the policy.",
  },

  // -------------------------------------------------------------- security
  {
    id: "C0-SEC-1", dimension: "security", requirement: "A written statement of how client data is handled",
    status: "verified", evidence: "packets/DATA_HANDLING.md exists, including an explicit statement of what is not held.",
    gates: ["handle_personal_data", "bid_enterprise"], actor: "midas", preparable: true,
    prepared: "packets/DATA_HANDLING.md -- including an explicit statement of what is NOT held: no certification, no cyber insurance, no incident response plan.",
    whyItGates: "Any engagement touching customer records will ask, and inventing an answer under pressure is how untrue claims get made.",
  },
  {
    id: "C0-SEC-2", dimension: "security", requirement: "Credential hygiene for client systems",
    status: "unknown", evidence: "Never assessed.",
    gates: ["handle_personal_data"], actor: "owner", preparable: true,
    whyItGates: "Holding a client's production credentials badly is the fastest way to turn a small engagement into a large liability.",
  },

  // ----------------------------------------------------------- procurement
  {
    id: "C0-PRO-1", dimension: "procurement", requirement: "Registration on the vendor systems buyers actually use",
    status: "absent", evidence: "No vendor registrations held.",
    gates: ["bid_public_sector"], actor: "owner", preparable: true,
    prepared: "packets/CREDIBILITY_AND_COVER.md section 4 -- which registrations are worth it at this size and what each requires. Not submitted: registering asserts a legal identity MIDAS has not verified.",
    whyItGates: "Public buyers cannot pay an unregistered vendor regardless of how good the proposal is.",
  },

  // ------------------------------------------------------------ operations
  {
    id: "C0-OPS-1", dimension: "operations", requirement: "An honest statement of available delivery hours",
    status: "reported_unverified",
    evidence: "School term constrains weekday availability. Roughly 200-420 hours to year end was estimated, never tracked against actuals.",
    gates: ["quote_confidently", "onboard_client"], actor: "owner", preparable: true,
    whyItGates: "Every deadline promised to a client is a claim about this number.",
  },
  {
    id: "C0-OPS-2", dimension: "operations", requirement: "A repeatable delivery process for the offered services",
    status: "verified", evidence: "packets/DELIVERY_PROCESS.md exists: six stages with exit conditions. Unproven in practice, which delivery fixes and documentation cannot.",
    gates: ["onboard_client"], actor: "midas", preparable: true,
    prepared: "packets/DELIVERY_PROCESS.md -- six stages with exit conditions, including the close stage that produces the first testimonial.",
    whyItGates: "The first engagement is where a missing process costs the most, because it is also the reference.",
  },
];

const profile = readinessProfile(ITEMS);
const routing = routeReadinessWork(ITEMS);

// Facts only the owner holds. Not tasks -- inputs. Each unblocks work MIDAS can
// then do without further help.
const inputsNeeded = [
  { input: "Whether any business registration was ever actually filed, and if so under what name and state", unblocks: ["C0-ENT-1"], why: "Converts unknown into a fact in either direction. If nothing was filed, that is fine and cheaper than assuming otherwise." },
  { input: "The URL of the website", unblocks: ["C0-CRE-2", "C0-CRE-3"], why: "The audit is written and cannot run without it." },
  { input: "What name the Stripe account is actually held under -- a person or a business name", unblocks: ["C0-FIN-1", "C0-FIN-2"], why: "The only one of the three that genuinely blocks work today: it decides what an invoice may truthfully say." },
];

const out = {
  at: new Date().toISOString(),
  company: "Company 0",
  discipline: "Absence of evidence recorded as absence of evidence. No fact upgraded to verified without a check.",
  outboundActionsTaken: 0,
  items: ITEMS,
  profile: {
    summary: profile.summary,
    availableCapabilities: profile.availableCapabilities,
    blockedCapabilities: profile.blockedCapabilities,
    ungovernedCapabilities: profile.ungovernedCapabilities,
    byDimension: profile.byDimension,
    unverifiedLoadBearing: profile.unverifiedLoadBearing.map((i) => ({ id: i.id, requirement: i.requirement, gates: i.gates })),
    neverChecked: profile.neverChecked.map((i) => i.id),
  },
  routing: {
    midasCanDoNow: routing.midasCanDoNow.map((i) => i.id),
    midasCanPrepare: routing.midasCanPrepare.map((i) => i.id),
    awaitingHuman: routing.awaitingHuman.map((i) => i.id),
    ruling: routing.ruling,
  },
  inputsNeeded,
};
writeFileSync(repoPath("var", "state", "company0-readiness.json"), JSON.stringify(out, null, 1));

console.log(profile.summary);
console.log("");
console.log("AVAILABLE NOW:", profile.availableCapabilities.length ? profile.availableCapabilities.join(", ") : "(none)");
console.log("BLOCKED:", profile.blockedCapabilities.join(", "));
console.log("UNGOVERNED (no item written for these):", profile.ungovernedCapabilities.join(", ") || "(none)");
console.log("");
console.log("Highest-leverage blockers:");
for (const i of profile.unverifiedLoadBearing.slice(0, 3)) console.log("  " + i.id, "->", i.gates.length, "capabilities |", i.requirement);
console.log("");
console.log("ROUTING:", routing.ruling);
console.log("  MIDAS can do alone:  ", routing.midasCanDoNow.length);
console.log("  MIDAS can prepare:   ", routing.midasCanPrepare.length);
console.log("  genuinely needs human:", routing.awaitingHuman.length);
console.log("");
console.log("Facts only the owner holds (" + inputsNeeded.length + "):");
for (const n of inputsNeeded) console.log("  - " + n.input);
