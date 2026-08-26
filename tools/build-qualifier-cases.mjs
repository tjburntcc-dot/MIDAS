/**
 * Author the Opportunity Qualifier case sets.
 *
 * Development cases are committed so the work is inspectable. Sealed cases are
 * written to gitignored private state with only their hash committed, matching
 * the discipline the repository already applies to Atlas holdouts: the promotion
 * decision must rest on cases no prompt was tuned against.
 *
 * Gold reflects Hemmer Digital's actual operating policy. Several answers are
 * only derivable from that policy -- the value floor, the capability boundary,
 * the payment rules -- which is deliberate: it is the knowledge a trained version
 * acquires and an untrained baseline cannot guess.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { repoPath, stateDir } from "@midas/db";

const ev = (id, text, source, ageDays) => ({ id, text, source: source || "opportunity_post", age_days: ageDays == null ? 1 : ageDays });

// ---------------------------------------------------------------- dev cases
const DEV = [
  {
    id: "OQ-D01", title: "Five-page marketing site for a landscaping firm",
    source: "job_board",
    brief: "We need a 5 page marketing website for our landscaping company. Budget is 2500 USD. We want it live before spring bookings open in about 8 weeks.",
    facts: { posted_budget_usd: 2500, client_payment_verified: true, client_prior_hires: 12, deadline_days: 56 },
    evidence: [
      ev("E1", "Client payment method is verified and 12 prior contracts are on record.", "platform_profile", 1),
      ev("E2", "Posted budget is 2500 USD for a five page marketing website.", "opportunity_post", 1),
      ev("E3", "Requested launch is before spring bookings, roughly eight weeks out.", "opportunity_post", 1),
    ],
    gold: {
      decision: "pursue", disqualifiers: [],
      bands: { estimated_value_usd: { low: 1800, high: 3200 }, ai_fulfillment_pct: { low: 60, high: 95 }, human_minutes: { low: 60, high: 300 } },
      required_missing: [],
      rationale: "Verified payer, clear scope, budget above the floor, squarely inside the web capability boundary.",
    },
  },
  {
    id: "OQ-D02", title: "Local dental practice wants search presence and blog posts",
    source: "job_board",
    brief: "Dental practice looking to improve our Google Business listing and publish 10 blog articles. We can pay 1800 USD.",
    facts: { posted_budget_usd: 1800, client_payment_verified: true, client_prior_hires: 3, deadline_days: 30 },
    evidence: [
      ev("E1", "Budget stated as 1800 USD for listing optimisation and ten articles.", "opportunity_post", 1),
      ev("E2", "Payment method verified; three prior contracts completed.", "platform_profile", 1),
    ],
    gold: {
      decision: "pursue", disqualifiers: [],
      bands: { estimated_value_usd: { low: 1400, high: 2200 }, ai_fulfillment_pct: { low: 70, high: 100 }, human_minutes: { low: 30, high: 240 } },
      required_missing: [],
      rationale: "Content and listing work is high AI fulfilment, verified payer, above the floor.",
    },
  },
  {
    id: "OQ-D03", title: "Referral: automate invoice reminder emails",
    source: "referral",
    brief: "Referred by a past client. They want automated invoice reminder emails from their existing billing export. Scope is clear. They mentioned around 1200 USD.",
    facts: { posted_budget_usd: 1200, client_payment_verified: true, client_prior_hires: null, referral: true, deadline_days: 21 },
    evidence: [
      ev("E1", "Referral from a completed prior engagement.", "owner_note", 2),
      ev("E2", "Scope is automated reminder emails driven by an existing billing export.", "inbound_email", 1),
      ev("E3", "Buyer indicated a budget near 1200 USD.", "inbound_email", 1),
    ],
    gold: {
      decision: "pursue", disqualifiers: [],
      bands: { estimated_value_usd: { low: 900, high: 1600 }, ai_fulfillment_pct: { low: 65, high: 100 }, human_minutes: { low: 45, high: 300 } },
      required_missing: [],
      rationale: "Automation work inside scope, referral lowers payment risk, value above the floor.",
    },
  },
  {
    id: "OQ-D04", title: "Bare request with no budget or timeline",
    source: "inbound_email",
    brief: "Hi, we need a website. Can you help? Let me know what you charge.",
    facts: { posted_budget_usd: null, client_payment_verified: null, client_prior_hires: null, deadline_days: null },
    evidence: [ev("E1", "Inbound message asks for a website with no budget, scope, or timeline stated.", "inbound_email", 1)],
    gold: {
      decision: "hold_for_info", disqualifiers: [],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: ["budget", "timeline", "scope"],
      rationale: "Nothing disqualifying, but nothing estimable either. The record cannot support a value.",
    },
  },
  {
    id: "OQ-D05", title: "Advance fee for a software licence",
    source: "inbound_email",
    brief: "We want to hire you for a 5000 USD project. First you need to purchase the licence for our proprietary CMS, it is 200 USD, send it to the address below and we will reimburse with the first milestone.",
    facts: { posted_budget_usd: 5000, client_payment_verified: false, client_prior_hires: 0, requires_upfront_payment_usd: 200 },
    evidence: [
      ev("E1", "Buyer asks the contractor to pay 200 USD up front for a licence before work begins.", "inbound_email", 1),
      ev("E2", "No verified payment method and no completed contracts on the account.", "platform_profile", 1),
    ],
    gold: {
      decision: "decline", disqualifiers: ["advance_fee_request", "identity_unverifiable"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "Contractor-pays-first is the classic advance fee pattern; unverified account compounds it.",
    },
  },
  {
    id: "OQ-D06", title: "Move to Telegram and pay in crypto",
    source: "job_board",
    brief: "Great profile. Let us continue this on Telegram, and we will pay in USDT so we both avoid the platform fees. Project is around 3000 USD.",
    facts: { posted_budget_usd: 3000, client_payment_verified: false, client_prior_hires: 0 },
    evidence: [
      ev("E1", "Buyer proposes moving off platform and paying in cryptocurrency to avoid fees.", "opportunity_post", 1),
      ev("E2", "Account has no verified payment method and no contract history.", "platform_profile", 1),
    ],
    gold: {
      decision: "decline", disqualifiers: ["off_platform_payment_push", "identity_unverifiable"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "Off-platform payment removes every recovery mechanism and is a standard non-payment setup.",
    },
  },
  {
    id: "OQ-D07", title: "Build the demo first, we pick a winner",
    source: "job_board",
    brief: "We are evaluating three agencies. Please build a working demo of the dashboard so we can compare. The winner gets the 15000 USD contract.",
    facts: { posted_budget_usd: 15000, client_payment_verified: true, client_prior_hires: 4, spec_work_requested: true },
    evidence: [
      ev("E1", "Buyer requests an unpaid working demo as a condition of selection.", "opportunity_post", 1),
      ev("E2", "Payment method is verified and four prior contracts are recorded.", "platform_profile", 1),
    ],
    gold: {
      decision: "decline", disqualifiers: ["unpaid_spec_work"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "A legitimate payer can still ask for unpaid speculative build. Policy declines it regardless of contract size.",
    },
  },
  {
    id: "OQ-D08", title: "Full storefront for fifty dollars",
    source: "job_board",
    brief: "Need a complete online store with payments, inventory and shipping integration. Budget 50 USD, should be quick for an expert.",
    facts: { posted_budget_usd: 50, client_payment_verified: true, client_prior_hires: 1 },
    evidence: [ev("E1", "Posted budget is 50 USD for a full storefront with payments and inventory.", "opportunity_post", 1)],
    gold: {
      decision: "decline", disqualifiers: ["below_minimum_value"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "Below the engagement floor by a wide margin; scope and budget are irreconcilable.",
    },
  },
  {
    id: "OQ-D09", title: "Native mobile app with live video",
    source: "rfp",
    brief: "Seeking a partner to build native iOS and Android apps with real-time video calling and offline sync. Budget 40000 USD.",
    facts: { posted_budget_usd: 40000, client_payment_verified: true, client_prior_hires: 9 },
    evidence: [
      ev("E1", "Requirement is native iOS and Android with real-time video calling and offline sync.", "rfp", 3),
      ev("E2", "Budget is 40000 USD and the payer is verified with nine prior contracts.", "rfp", 3),
    ],
    gold: {
      decision: "decline", disqualifiers: ["out_of_scope_capability"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "Attractive budget and a real buyer, but native mobile and real-time video sit outside the capability boundary.",
    },
  },
  {
    id: "OQ-D10", title: "Five hundred five-star reviews",
    source: "inbound_email",
    brief: "We need 500 positive reviews posted across Google and Yelp for our new locations. Pay is 2000 USD.",
    facts: { posted_budget_usd: 2000, client_payment_verified: true, client_prior_hires: 2 },
    evidence: [ev("E1", "Buyer requests 500 fabricated positive reviews on third-party platforms.", "inbound_email", 1)],
    gold: {
      decision: "decline", disqualifiers: ["illegal_or_deceptive_work"],
      bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null },
      required_missing: [],
      rationale: "Fabricated reviews are deceptive and barred regardless of payer quality.",
    },
  },
  {
    id: "OQ-D11", title: "Clear scope, buyer is not the decision maker",
    source: "rfp",
    brief: "Marketing coordinator here. We want a 12 page site refresh with a CMS migration, budget approved at 9000 USD. I am gathering quotes; the director signs off.",
    facts: { posted_budget_usd: 9000, client_payment_verified: true, client_prior_hires: 6, contact_is_decision_maker: false },
    evidence: [
      ev("E1", "Contact states the director holds sign-off and the contact is collecting quotes.", "rfp", 2),
      ev("E2", "Budget of 9000 USD is described as approved.", "rfp", 2),
    ],
    gold: {
      decision: "hold_for_info", disqualifiers: ["no_decision_maker_contact"],
      bands: { estimated_value_usd: { low: 6000, high: 12000 }, ai_fulfillment_pct: { low: 50, high: 85 }, human_minutes: { low: 240, high: 900 } },
      required_missing: ["decision maker contact"],
      rationale: "Real and in scope, but pursuing without the signer wastes the cycle. Hold rather than decline.",
    },
  },
  {
    id: "OQ-D12", title: "Good scope, unstated payment terms, brand new account",
    source: "job_board",
    brief: "Need a landing page and email capture for a product launch in 3 weeks. We can spend about 1500 USD.",
    facts: { posted_budget_usd: 1500, client_payment_verified: false, client_prior_hires: 0, deadline_days: 21 },
    evidence: [
      ev("E1", "Scope is a landing page with email capture, launch in three weeks.", "opportunity_post", 1),
      ev("E2", "Account has no verified payment method and no prior contracts, but no adverse signal either.", "platform_profile", 1),
    ],
    gold: {
      decision: "hold_for_info", disqualifiers: [],
      bands: { estimated_value_usd: { low: 1000, high: 2000 }, ai_fulfillment_pct: { low: 70, high: 100 }, human_minutes: { low: 30, high: 180 } },
      required_missing: ["payment method verification"],
      rationale: "In scope and above the floor, but an unverified payer needs escrow or a deposit confirmed first.",
    },
  },
];

// ------------------------------------------------------------- sealed cases
const SEALED = [
  ["OQ-S01", "Restaurant chain wants menu pages and online ordering links", "job_board",
   "Three location restaurant group needs menu pages and links to our existing ordering provider. Budget 3200 USD, needed in 6 weeks.",
   { posted_budget_usd: 3200, client_payment_verified: true, client_prior_hires: 7, deadline_days: 42 },
   [["E1", "Budget stated at 3200 USD for menu pages and ordering links."], ["E2", "Verified payer with seven prior contracts."]],
   { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 2400, high: 4000 }, ai_fulfillment_pct: { low: 60, high: 95 }, human_minutes: { low: 60, high: 360 } }, required_missing: [] }],

  ["OQ-S02", "Nonprofit annual report as a web page", "inbound_email",
   "We publish an annual report each year as a PDF and want a web version this time. We have 1400 USD in the budget.",
   { posted_budget_usd: 1400, client_payment_verified: true, client_prior_hires: 2 },
   [["E1", "Budget of 1400 USD stated for converting an annual report to a web page."], ["E2", "Payment method verified on the account."]],
   { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 1000, high: 1900 }, ai_fulfillment_pct: { low: 70, high: 100 }, human_minutes: { low: 30, high: 240 } }, required_missing: [] }],

  ["OQ-S03", "Recurring blog content for a B2B software firm", "referral",
   "Referred contact wants four technical blog posts a month on an ongoing basis. They suggested 1600 USD monthly.",
   { posted_budget_usd: 1600, client_payment_verified: true, referral: true },
   [["E1", "Ongoing engagement of four posts monthly at a suggested 1600 USD."], ["E2", "Referral from a completed engagement."]],
   { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 1200, high: 2200 }, ai_fulfillment_pct: { low: 75, high: 100 }, human_minutes: { low: 60, high: 300 } }, required_missing: [] }],

  ["OQ-S04", "Data cleanup of a product catalogue", "job_board",
   "We have 8000 product rows with inconsistent categories and missing descriptions. Need them normalised and descriptions written. Budget 2600 USD.",
   { posted_budget_usd: 2600, client_payment_verified: true, client_prior_hires: 5 },
   [["E1", "8000 product rows need category normalisation and written descriptions."], ["E2", "Budget 2600 USD, verified payer, five prior contracts."]],
   { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 2000, high: 3400 }, ai_fulfillment_pct: { low: 80, high: 100 }, human_minutes: { low: 30, high: 240 } }, required_missing: [] }],

  ["OQ-S05", "Vague brand refresh request", "inbound_email",
   "We are thinking about refreshing our brand. Not sure exactly what we need yet. What would you suggest?",
   { posted_budget_usd: null, client_payment_verified: null },
   [["E1", "Inbound message describes an undecided brand refresh with no scope or budget."]],
   { decision: "hold_for_info", disqualifiers: [], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: ["budget", "scope"] }],

  ["OQ-S06", "Timeline stated, budget withheld deliberately", "rfp",
   "We need a member portal delivered by the end of Q3. We prefer not to share our budget; please propose your price.",
   { posted_budget_usd: null, client_payment_verified: true, client_prior_hires: 11, deadline_days: 90 },
   [["E1", "Delivery required by end of Q3; buyer declines to state a budget."], ["E2", "Verified payer with eleven prior contracts."]],
   { decision: "hold_for_info", disqualifiers: [], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: ["budget"] }],

  ["OQ-S07", "Scope clear, buyer is an intermediary agency", "inbound_email",
   "We are an agency sourcing on behalf of our client. Scope is a 6 page site, 4500 USD. Our client approves the final work.",
   { posted_budget_usd: 4500, client_payment_verified: true, contact_is_decision_maker: false },
   [["E1", "Contact is an agency intermediary; the end client holds approval."], ["E2", "Scope is a six page site at 4500 USD."]],
   { decision: "hold_for_info", disqualifiers: ["no_decision_maker_contact"], bands: { estimated_value_usd: { low: 3200, high: 5600 }, ai_fulfillment_pct: { low: 55, high: 90 }, human_minutes: { low: 120, high: 600 } }, required_missing: ["decision maker contact"] }],

  ["OQ-S08", "Deposit demanded from the contractor", "inbound_email",
   "To secure the contract we ask all vendors for a 150 USD good faith deposit, refunded on completion. Project value 6000 USD.",
   { posted_budget_usd: 6000, client_payment_verified: false, requires_upfront_payment_usd: 150 },
   [["E1", "Buyer requires a 150 USD deposit from the contractor before award."], ["E2", "No verified payment method on the account."]],
   { decision: "decline", disqualifiers: ["advance_fee_request", "identity_unverifiable"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S09", "Wire transfer outside the platform", "job_board",
   "We will send payment by direct wire rather than through the platform, it clears faster. Budget 2800 USD.",
   { posted_budget_usd: 2800, client_payment_verified: false, client_prior_hires: 0 },
   [["E1", "Buyer proposes paying by direct wire outside the platform."], ["E2", "Account has no verified payment method or contract history."]],
   { decision: "decline", disqualifiers: ["off_platform_payment_push", "identity_unverifiable"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S10", "Sample article before consideration", "job_board",
   "Please submit a 1500 word sample article on our topic so we can assess quality. Selected writers get 3000 USD of work.",
   { posted_budget_usd: 3000, client_payment_verified: true, spec_work_requested: true },
   [["E1", "Buyer requires an unpaid 1500 word sample as a condition of selection."], ["E2", "Payer is verified."]],
   { decision: "decline", disqualifiers: ["unpaid_spec_work"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S11", "Full CRM rebuild for two hundred dollars", "job_board",
   "Looking to rebuild our entire CRM with custom reporting and integrations. We have 200 USD available.",
   { posted_budget_usd: 200, client_payment_verified: true },
   [["E1", "Budget of 200 USD stated for a full CRM rebuild with integrations."]],
   { decision: "decline", disqualifiers: ["below_minimum_value"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S12", "Embedded firmware work", "rfp",
   "We need firmware for a battery management board, C on bare metal, with a hardware test rig. Budget 25000 USD.",
   { posted_budget_usd: 25000, client_payment_verified: true, client_prior_hires: 15 },
   [["E1", "Requirement is bare metal C firmware for a battery management board plus a hardware test rig."], ["E2", "Budget 25000 USD with a verified payer."]],
   { decision: "decline", disqualifiers: ["out_of_scope_capability"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S13", "Fabricated testimonials for a landing page", "inbound_email",
   "Write us 30 customer testimonials with names and photos for the new landing page. We do not have real ones yet. 900 USD.",
   { posted_budget_usd: 900, client_payment_verified: true },
   [["E1", "Buyer asks for 30 invented customer testimonials presented as real."]],
   { decision: "decline", disqualifiers: ["illegal_or_deceptive_work"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S14", "On-site installation across twelve retail locations", "rfp",
   "Need someone on site at twelve retail locations to install and configure the new point of sale terminals. 18000 USD.",
   { posted_budget_usd: 18000, client_payment_verified: true, client_prior_hires: 8 },
   [["E1", "Work requires physical presence at twelve retail locations."], ["E2", "Budget 18000 USD with a verified payer."]],
   { decision: "decline", disqualifiers: ["out_of_scope_capability"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S15", "Two disqualifiers at once", "inbound_email",
   "Build a demo of the analytics dashboard first so we can evaluate. Also we pay through a personal account, not the platform. Contract is 7000 USD.",
   { posted_budget_usd: 7000, client_payment_verified: false, spec_work_requested: true },
   [["E1", "Buyer requests an unpaid demo build as a condition of selection."], ["E2", "Buyer proposes payment from a personal account outside the platform."]],
   { decision: "decline", disqualifiers: ["unpaid_spec_work", "off_platform_payment_push"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],

  ["OQ-S16", "Legitimate rush job at a fair price", "job_board",
   "Our event site needs a registration page added by Friday. We can pay 1100 USD for the fast turnaround.",
   { posted_budget_usd: 1100, client_payment_verified: true, client_prior_hires: 4, deadline_days: 4 },
   [["E1", "Registration page required within four days at 1100 USD."], ["E2", "Verified payer with four prior contracts."]],
   { decision: "pursue", disqualifiers: [], bands: { estimated_value_usd: { low: 800, high: 1500 }, ai_fulfillment_pct: { low: 60, high: 95 }, human_minutes: { low: 45, high: 300 } }, required_missing: [] }],

  ["OQ-S17", "Value just above the floor with unclear scope", "inbound_email",
   "We want some help with our online presence. We could probably do 600 USD to start and see how it goes.",
   { posted_budget_usd: 600, client_payment_verified: true },
   [["E1", "Buyer offers 600 USD to start with an unspecified scope."]],
   { decision: "hold_for_info", disqualifiers: [], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: ["scope"] }],

  ["OQ-S18", "Verified payer, in scope, but identity does not match", "job_board",
   "Posting on behalf of Northgate Retail Group. Contact email is a free webmail address and the company name is not on the account.",
   { posted_budget_usd: 4200, client_payment_verified: false, client_prior_hires: 0 },
   [["E1", "Poster claims to represent Northgate Retail Group but the account carries no company name."], ["E2", "Contact address is free webmail and no payment method is verified."]],
   { decision: "decline", disqualifiers: ["identity_unverifiable"], bands: { estimated_value_usd: null, ai_fulfillment_pct: null, human_minutes: null }, required_missing: [] }],
];

function expandSealed(row) {
  const [id, title, source, brief, facts, evidence, gold] = row;
  return {
    case_id: id, title, source, brief, facts,
    evidence: evidence.map(([eid, text]) => ev(eid, text, source, 1)),
    gold,
  };
}

const devCases = DEV.map((c) => ({
  case_id: c.id, title: c.title, source: c.source, brief: c.brief, facts: c.facts, evidence: c.evidence, gold: c.gold,
}));
const sealedCases = SEALED.map(expandSealed);

function pack(id, version, cases, note) {
  return { id, version, note, n: cases.length, synthetic: true, cases };
}

const devDoc = pack(
  "hemmer-opportunity-qualifier-dev-v0", "hemmer-opportunity-qualifier-dev-v0", devCases,
  "Development cases for the Opportunity Qualifier. Visible and committed. Iteration happens here; promotion does not.",
);
const sealedDoc = pack(
  "hemmer-opportunity-qualifier-sealed-v0", "hemmer-opportunity-qualifier-sealed-v0", sealedCases,
  "Sealed holdout. Written to private state, never committed. Used only for the promotion decision.",
);

const devPath = repoPath("evals", "opportunity-qualifier", "v0", "dev_cases_v0.json");
mkdirSync(repoPath("evals", "opportunity-qualifier", "v0"), { recursive: true });
writeFileSync(devPath, JSON.stringify(devDoc, null, 2) + "\n", "utf8");

const sealedDir = join(stateDir(), "sealed");
mkdirSync(sealedDir, { recursive: true });
const sealedPath = join(sealedDir, "opportunity-qualifier-sealed-v0.json");
writeFileSync(sealedPath, JSON.stringify(sealedDoc, null, 2) + "\n", "utf8");

const devSha = createHash("sha256").update(readFileSync(devPath)).digest("hex");
const sealedSha = createHash("sha256").update(readFileSync(sealedPath)).digest("hex");

const manifest = {
  dev: { id: devDoc.id, path: "evals/opportunity-qualifier/v0/dev_cases_v0.json", n: devCases.length, sha256: devSha },
  sealed: {
    id: sealedDoc.id,
    path: "var/state/sealed/opportunity-qualifier-sealed-v0.json",
    n: sealedCases.length,
    sha256: sealedSha,
    committed: false,
    note: "Sealed cases live in gitignored private state. Only this hash is committed, so a promotion run can be checked against the set it claims without publishing the set.",
  },
  decisionMix: sealedCases.reduce((acc, c) => { acc[c.gold.decision] = (acc[c.gold.decision] || 0) + 1; return acc; }, {}),
  disqualifierCoverage: [...new Set(sealedCases.flatMap((c) => c.gold.disqualifiers))].sort(),
};
writeFileSync(repoPath("evals", "opportunity-qualifier", "v0", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("dev", devCases.length, devSha.slice(0, 16));
console.log("sealed", sealedCases.length, sealedSha.slice(0, 16), "->", sealedPath);
console.log("sealed decision mix", JSON.stringify(manifest.decisionMix));
console.log("disqualifier coverage", manifest.disqualifierCoverage.join(", "));
