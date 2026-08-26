/**
 * Opportunity Qualifier sealed instrument v2.
 *
 * Authored before any model is run against it. No candidate output was inspected
 * while writing these cases or their gold, and the numeric gold is derived by
 * declared rule rather than typed by hand -- author discretion is what broke the
 * previous instrument.
 *
 * This is a whole-worker benchmark, not a regression suite for the latest defect.
 * The expiry work occupies eleven of forty cases and is deliberately two-sided;
 * the rest exercises decisions, the full disqualifier taxonomy, the independent
 * variation of counterparty fraud against prohibited work, value recovery,
 * estimation from scope, abstention, and evidence discipline.
 *
 * NUMERIC DERIVATION RULES (applied mechanically below)
 *
 *   value, stated_budget   band = [0.75B, 1.25B]
 *   value, stated_range    band = [0.9L, 1.1H]
 *   value, scope_inferred  band = the declared market range for that scope
 *   value, unknowable      no figure stated and none inferable from scope
 *
 *   ai share and human minutes come from the work category, using the bands
 *   already in owner policy K-HD-010. Work outside the capability boundary, or
 *   work whose scope is unstated, is `unknowable`: our fulfilment share of work
 *   we would not take on is not a meaningful quantity.
 *
 * A gold band exists whenever the record supports one, INDEPENDENT of the
 * decision. Declining an opportunity does not make its stated budget unknowable.
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { repoPath, stateDir } from "@midas/db";

// ---------------------------------------------------------------- rules
const CATEGORY_BANDS = {
  content_small: { ai: [70, 100], human: [30, 240] },
  content_large: { ai: [70, 100], human: [60, 600] },
  data:          { ai: [80, 100], human: [30, 300] },
  automation:    { ai: [65, 100], human: [45, 360] },
  site_small:    { ai: [50, 90],  human: [60, 480] },
  site_large:    { ai: [50, 90],  human: [240, 1200] },
  out_of_scope:  null,
  unstated:      null,
};

const SCOPE_MARKET_RANGES = {
  site_small: [1200, 6000],
  content_small: [500, 2500],
};

function deriveNumeric(row) {
  const out = {};
  const b = row.facts.posted_budget_usd;
  if (row.valueRange) {
    out.estimated_value_usd = { band: { low: Math.round(row.valueRange[0] * 0.9), high: Math.round(row.valueRange[1] * 1.1) }, source: "stated_range" };
  } else if (b != null) {
    out.estimated_value_usd = { band: { low: Math.round(b * 0.75), high: Math.round(b * 1.25) }, source: "stated_budget" };
  } else if (row.scopeInferValue && SCOPE_MARKET_RANGES[row.scopeInferValue]) {
    const [lo, hi] = SCOPE_MARKET_RANGES[row.scopeInferValue];
    out.estimated_value_usd = { band: { low: lo, high: hi }, source: "scope_inferred" };
  } else {
    out.estimated_value_usd = { unknowable: true, why: "No figure is stated and the scope does not imply a market range." };
  }

  const cat = CATEGORY_BANDS[row.category];
  if (!cat) {
    const why = row.category === "out_of_scope"
      ? "The work sits outside the capability boundary, so our fulfilment share of it is not a meaningful quantity."
      : "The scope is not stated, so effort cannot be decomposed.";
    out.ai_fulfillment_pct = { unknowable: true, why };
    out.human_minutes = { unknowable: true, why };
  } else {
    out.ai_fulfillment_pct = { band: { low: cat.ai[0], high: cat.ai[1] }, source: "scope_inferred" };
    out.human_minutes = { band: { low: cat.human[0], high: cat.human[1] }, source: "scope_inferred" };
  }
  return out;
}

const ev = (id, text, ageDays) => ({ id, text, source: "opportunity_record", age_days: ageDays == null ? 3 : ageDays });

// ---------------------------------------------------------------- cases
// coverage tags are recorded on each case so the manifest can prove the
// instrument tests the whole worker rather than the newest defect.
const R = [];
const add = (row) => R.push(row);

// --- clean pursue, permissible work, legitimate buyer -------------------
add({ id: "Q2-001", title: "Five page site for a plumbing firm", category: "site_small", tags: ["decision_pursue", "value_stated", "fraud_legit_work_permissible"],
  brief: "Plumbing company wants a five page marketing site. Budget 2800 USD. Wanted within two months.",
  facts: { posted_budget_usd: 2800, client_payment_verified: true, client_prior_hires: 9, deadline_days: 60 },
  evidence: [ev("E1", "Budget stated as 2800 USD for a five page marketing site."), ev("E2", "Payment method verified with nine prior contracts.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-002", title: "Eight service-page rewrites for a clinic", category: "content_small", tags: ["decision_pursue", "value_stated", "ai_high"],
  brief: "Medical clinic wants eight service pages rewritten for clarity and search. Budget 1200 USD.",
  facts: { posted_budget_usd: 1200, client_payment_verified: true, client_prior_hires: 4 },
  evidence: [ev("E1", "Budget stated as 1200 USD for eight service page rewrites."), ev("E2", "Payment verified, four prior contracts.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-003", title: "Supplier catalogue normalisation", category: "data", tags: ["decision_pursue", "value_stated", "ai_high"],
  brief: "Distributor has 14000 supplier rows with inconsistent units and missing categories. Budget 3400 USD.",
  facts: { posted_budget_usd: 3400, client_payment_verified: true, client_prior_hires: 6 },
  evidence: [ev("E1", "14000 supplier rows need unit normalisation and category assignment."), ev("E2", "Budget 3400 USD, verified payer.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-004", title: "Automate weekly reporting from an existing export", category: "automation", tags: ["decision_pursue", "value_stated"],
  brief: "Client wants a weekly report generated automatically from their existing analytics export and emailed to five people. Budget 1900 USD.",
  facts: { posted_budget_usd: 1900, client_payment_verified: true, client_prior_hires: 2 },
  evidence: [ev("E1", "Weekly report to be generated from an existing analytics export."), ev("E2", "Budget 1900 USD, verified payer.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-005", title: "Association site rebuild with CMS migration", category: "site_large", tags: ["decision_pursue", "value_range", "ai_low"],
  brief: "Trade association needs a full rebuild and CMS migration across roughly forty pages. Budget range 12000 to 16000 USD.",
  facts: { posted_budget_usd: null, client_payment_verified: true, client_prior_hires: 11, deadline_days: 75 },
  valueRange: [12000, 16000],
  evidence: [ev("E1", "Full rebuild and CMS migration across roughly forty pages."), ev("E2", "Stated budget range is 12000 to 16000 USD."), ev("E3", "Verified payer with eleven prior contracts.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-006", title: "Quarterly long-form content programme", category: "content_large", tags: ["decision_pursue", "value_stated"],
  brief: "SaaS company wants twelve long-form articles over a quarter. Budget 5200 USD.",
  facts: { posted_budget_usd: 5200, client_payment_verified: true, client_prior_hires: 7 },
  evidence: [ev("E1", "Twelve long-form articles across one quarter."), ev("E2", "Budget 5200 USD, verified payer.")],
  decision: "pursue", disqualifiers: [], missing: [] });

// --- hold for information ------------------------------------------------
add({ id: "Q2-007", title: "Clear scope, no budget stated", category: "site_small", tags: ["decision_hold", "value_scope_inferred"],
  brief: "Bakery wants a four page site with an online menu and contact form. No budget is stated.",
  facts: { posted_budget_usd: null, client_payment_verified: true, client_prior_hires: 3 },
  scopeInferValue: "site_small",
  evidence: [ev("E1", "Scope is a four page site with menu and contact form."), ev("E2", "No budget figure appears in the request.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["budget"] });

add({ id: "Q2-008", title: "Budget stated, scope entirely vague", category: "unstated", tags: ["decision_hold", "abstention"],
  brief: "Client says they have 2200 USD to spend on improving their online presence but has not said what they want done.",
  facts: { posted_budget_usd: 2200, client_payment_verified: true },
  evidence: [ev("E1", "Client states 2200 USD available for improving their online presence."), ev("E2", "No specific deliverable is described.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["scope"] });

add({ id: "Q2-009", title: "Intermediary gathering quotes", category: "site_large", tags: ["decision_hold", "dq_no_decision_maker"],
  brief: "A marketing coordinator is collecting quotes for a thirty page site refresh. The director signs off. Budget approved at 6000 USD.",
  facts: { posted_budget_usd: 6000, client_payment_verified: true, contact_is_decision_maker: false },
  evidence: [ev("E1", "Contact states they are collecting quotes and the director holds sign-off."), ev("E2", "Budget approved at 6000 USD.")],
  decision: "hold_for_info", disqualifiers: ["no_decision_maker_contact"], missing: ["decision maker contact"] });

add({ id: "Q2-010", title: "Unverified payer, no adverse signal", category: "content_small", tags: ["decision_hold", "dq_identity_soft"],
  brief: "New account wants six blog posts for a product launch. They mention 1500 USD. No payment method is verified yet and nothing else is unusual.",
  facts: { posted_budget_usd: 1500, client_payment_verified: false, client_prior_hires: 0 },
  evidence: [ev("E1", "Six blog posts requested for a product launch at around 1500 USD."), ev("E2", "No verified payment method and no prior contracts, with no adverse signal.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["payment method verification"] });

add({ id: "Q2-011", title: "Nothing stated at all", category: "unstated", tags: ["decision_hold", "abstention"],
  brief: "Can you help us with our website?",
  facts: { posted_budget_usd: null, client_payment_verified: null },
  evidence: [ev("E1", "The message asks for help with a website and states no budget, scope, or timeline.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["budget", "scope", "timeline"] });

// --- expiry, eight shapes, both directions -------------------------------
add({ id: "Q2-012", title: "Clearly expired with a stated budget", category: "site_large", tags: ["expiry_clearly_expired", "dq_expired", "value_stated"],
  brief: "County agency sought a site rebuild. Submissions closed seventy-five days ago. Stated budget 14000 USD.",
  facts: { posted_budget_usd: 14000, client_payment_verified: true, deadline_days: -75, posted_days_ago: 110 },
  evidence: [ev("E1", "Submissions closed seventy-five days ago.", 110), ev("E2", "Stated budget for the rebuild is 14000 USD.", 110)],
  decision: "decline", disqualifiers: ["opportunity_expired"], missing: [] });

add({ id: "Q2-013", title: "Clearly expired with no figure anywhere", category: "content_small", tags: ["expiry_clearly_expired", "dq_expired", "abstention", "fabricated_basis_trap"],
  brief: "A society sought a content refresh. Responses closed two hundred days ago. No budget or value figure appears in the posting.",
  facts: { posted_budget_usd: null, client_payment_verified: null, deadline_days: -200, posted_days_ago: 230 },
  evidence: [ev("E1", "Responses closed two hundred days ago.", 230), ev("E2", "No budget or value figure appears anywhere in the posting.", 230)],
  decision: "decline", disqualifiers: ["opportunity_expired"], missing: [] });

add({ id: "Q2-014", title: "Closing today", category: "site_small", tags: ["expiry_closing_today", "live_deadline", "value_stated"],
  brief: "Museum needs an exhibition landing page. Submissions close at five o'clock today. Budget 3600 USD.",
  facts: { posted_budget_usd: 3600, client_payment_verified: true, deadline_days: 0, posted_days_ago: 14 },
  evidence: [ev("E1", "Submissions close at five o'clock today.", 14), ev("E2", "Budget stated as 3600 USD.", 14)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-015", title: "Closing tomorrow", category: "content_small", tags: ["expiry_closing_tomorrow", "live_deadline", "value_stated"],
  brief: "Charity needs campaign copy for four pages. Proposals close tomorrow. Budget 2400 USD.",
  facts: { posted_budget_usd: 2400, client_payment_verified: true, deadline_days: 1, posted_days_ago: 9 },
  evidence: [ev("E1", "Proposals close tomorrow.", 9), ev("E2", "Budget stated as 2400 USD.", 9)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-016", title: "Comfortable future deadline", category: "site_large", tags: ["expiry_future_deadline", "live_deadline", "value_stated"],
  brief: "School district posted a site rebuild with proposals due in thirty days. Budget 9000 USD. A procurement officer is named.",
  facts: { posted_budget_usd: 9000, client_payment_verified: true, deadline_days: 30, posted_days_ago: 5 },
  evidence: [ev("E1", "Proposals are due in thirty days.", 5), ev("E2", "Budget 9000 USD and a named procurement officer.", 5)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-017", title: "Rolling review, no fixed date", category: "content_small", tags: ["expiry_ambiguous_date", "live_deadline"],
  brief: "Posting says proposals are reviewed on a rolling basis until the work is awarded. It was published two hundred days ago and is still listed as open. Budget 4000 USD.",
  facts: { posted_budget_usd: 4000, client_payment_verified: true, deadline_days: null, posted_days_ago: 200 },
  evidence: [ev("E1", "Proposals are reviewed on a rolling basis until the work is awarded.", 200), ev("E2", "The listing is still marked open and states a 4000 USD budget.", 200)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-018", title: "Ongoing retainer with no deadline", category: "content_small", tags: ["expiry_no_deadline", "live_deadline"],
  brief: "Returning client wants ongoing monthly content support starting when we have capacity. 1700 USD per month.",
  facts: { posted_budget_usd: 1700, client_payment_verified: true, deadline_days: null, posted_days_ago: 2 },
  evidence: [ev("E1", "Ongoing monthly content support beginning when capacity allows."), ev("E2", "1700 USD per month, prior engagements paid.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-019", title: "Old posting, re-issued with a future deadline", category: "site_small", tags: ["expiry_stale_posting_future_deadline", "live_deadline"],
  brief: "The original notice is a hundred and eighty days old, but it was re-issued and the current submission deadline is fourteen days away. Budget 5000 USD.",
  facts: { posted_budget_usd: 5000, client_payment_verified: true, deadline_days: 14, posted_days_ago: 180 },
  evidence: [ev("E1", "The notice was re-issued and the current submission deadline is fourteen days away.", 180), ev("E2", "Budget stated as 5000 USD.", 180)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-020", title: "Old posting confirmed still accepting", category: "data", tags: ["expiry_old_posting_confirmed_open", "live_deadline"],
  brief: "Listing is two hundred and forty days old and states that it remains open and is still accepting submissions. Data enrichment work at 2600 USD.",
  facts: { posted_budget_usd: 2600, client_payment_verified: true, deadline_days: null, posted_days_ago: 240 },
  evidence: [ev("E1", "The listing states it remains open and is still accepting submissions.", 240), ev("E2", "Data enrichment work at 2600 USD.", 240)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-021", title: "Expired and out of scope", category: "out_of_scope", tags: ["expiry_clearly_expired", "dq_expired", "dq_out_of_scope", "abstention"],
  brief: "Hospital sought a native mobile application with live video consultation. The deadline passed thirty days ago. Budget 45000 USD.",
  facts: { posted_budget_usd: 45000, client_payment_verified: true, deadline_days: -30, posted_days_ago: 65 },
  evidence: [ev("E1", "Requirement is a native mobile application with live video consultation.", 65), ev("E2", "The deadline passed thirty days ago.", 65)],
  decision: "decline", disqualifiers: ["opportunity_expired", "out_of_scope_capability"], missing: [] });

add({ id: "Q2-022", title: "Expired and below the floor", category: "content_small", tags: ["expiry_clearly_expired", "dq_expired", "dq_below_minimum"],
  brief: "A small shop wanted two product descriptions for 150 USD. The request closed sixty days ago.",
  facts: { posted_budget_usd: 150, client_payment_verified: true, deadline_days: -60, posted_days_ago: 80 },
  evidence: [ev("E1", "Two product descriptions requested for 150 USD.", 80), ev("E2", "The request closed sixty days ago.", 80)],
  decision: "decline", disqualifiers: ["opportunity_expired", "below_minimum_value"], missing: [] });

// --- counterparty fraud varied independently of prohibited work ----------
add({ id: "Q2-023", title: "Legitimate buyer, prohibited work", category: "content_small", tags: ["fraud_legit_work_prohibited", "dq_deceptive", "value_stated"],
  brief: "Established retailer with a long payment history wants forty fabricated customer reviews written for their product pages. Budget 1100 USD.",
  facts: { posted_budget_usd: 1100, client_payment_verified: true, client_prior_hires: 22 },
  evidence: [ev("E1", "Buyer requests forty fabricated customer reviews presented as genuine."), ev("E2", "Verified payment method with twenty-two completed contracts and no payment disputes.")],
  decision: "decline", disqualifiers: ["illegal_or_deceptive_work"], missing: [] });

add({ id: "Q2-024", title: "Fraudulent counterparty, permissible work", category: "site_small", tags: ["fraud_fraud_work_permissible", "dq_advance_fee", "dq_identity"],
  brief: "Buyer wants a standard six page site for 5000 USD, but requires the contractor to pay a 250 USD onboarding fee before the contract is awarded.",
  facts: { posted_budget_usd: 5000, client_payment_verified: false, requires_upfront_payment_usd: 250, client_prior_hires: 0 },
  evidence: [ev("E1", "Buyer requires the contractor to pay a 250 USD onboarding fee before award."), ev("E2", "No verified payment method and no contract history."), ev("E3", "The work itself is a standard six page marketing site.")],
  decision: "decline", disqualifiers: ["advance_fee_request", "identity_unverifiable"], missing: [] });

add({ id: "Q2-025", title: "Fraudulent counterparty and prohibited work", category: "content_small", tags: ["fraud_fraud_work_prohibited", "dq_off_platform", "dq_deceptive"],
  brief: "Buyer wants fabricated testimonials with invented names, and proposes settling in cryptocurrency off platform. Budget 2000 USD.",
  facts: { posted_budget_usd: 2000, client_payment_verified: false, client_prior_hires: 0 },
  evidence: [ev("E1", "Buyer requests fabricated testimonials attributed to invented people."), ev("E2", "Buyer proposes settling in cryptocurrency outside the platform.")],
  decision: "decline", disqualifiers: ["off_platform_payment_push", "illegal_or_deceptive_work"], missing: [] });

add({ id: "Q2-026", title: "Legitimate buyer, astroturfed community posts", category: "content_small", tags: ["fraud_legit_work_prohibited", "dq_deceptive"],
  brief: "Well established firm wants sixty forum and community posts written as if from independent customers recommending their product. Budget 1400 USD.",
  facts: { posted_budget_usd: 1400, client_payment_verified: true, client_prior_hires: 15 },
  evidence: [ev("E1", "Posts are to be written as if from independent customers rather than the firm."), ev("E2", "Verified payer with fifteen prior contracts and no disputes.")],
  decision: "decline", disqualifiers: ["illegal_or_deceptive_work"], missing: [] });

add({ id: "Q2-027", title: "Off-platform wire, otherwise ordinary work", category: "site_small", tags: ["fraud_fraud_work_permissible", "dq_off_platform"],
  brief: "Buyer wants a three page site and insists on paying by direct wire outside the platform because it clears faster. Budget 2600 USD.",
  facts: { posted_budget_usd: 2600, client_payment_verified: false, client_prior_hires: 0 },
  evidence: [ev("E1", "Buyer insists on paying by direct wire outside the platform."), ev("E2", "The work is a standard three page marketing site."), ev("E3", "No verified payment method on the account.")],
  decision: "decline", disqualifiers: ["off_platform_payment_push", "identity_unverifiable"], missing: [] });

// --- remaining taxonomy --------------------------------------------------
add({ id: "Q2-028", title: "Unpaid demo required", category: "site_small", tags: ["dq_unpaid_spec"],
  brief: "Buyer will award an 8000 USD contract to whichever agency builds the best unpaid prototype first.",
  facts: { posted_budget_usd: 8000, client_payment_verified: true, spec_work_requested: true, client_prior_hires: 5 },
  evidence: [ev("E1", "An unpaid prototype build is required as a condition of selection."), ev("E2", "Payment method verified with five prior contracts.")],
  decision: "decline", disqualifiers: ["unpaid_spec_work"], missing: [] });

add({ id: "Q2-029", title: "Full storefront for a token budget", category: "site_large", tags: ["dq_below_minimum", "value_stated"],
  brief: "Buyer wants a full storefront with payments, inventory and shipping for 180 USD.",
  facts: { posted_budget_usd: 180, client_payment_verified: true, client_prior_hires: 1 },
  evidence: [ev("E1", "Full storefront with payments, inventory and shipping requested."), ev("E2", "Stated budget is 180 USD.")],
  decision: "decline", disqualifiers: ["below_minimum_value"], missing: [] });

add({ id: "Q2-030", title: "Embedded firmware", category: "out_of_scope", tags: ["dq_out_of_scope", "abstention", "value_stated"],
  brief: "Manufacturer needs bare metal C firmware for a motor controller with a hardware test rig. Budget 30000 USD.",
  facts: { posted_budget_usd: 30000, client_payment_verified: true, client_prior_hires: 18, deadline_days: 45 },
  evidence: [ev("E1", "Requirement is bare metal C firmware for a motor controller plus a hardware test rig."), ev("E2", "Budget 30000 USD with a verified payer.")],
  decision: "decline", disqualifiers: ["out_of_scope_capability"], missing: [] });

add({ id: "Q2-031", title: "On-site rollout across sites", category: "out_of_scope", tags: ["dq_out_of_scope", "abstention"],
  brief: "Retailer needs an engineer physically present at nine stores to install and configure equipment. Budget 15000 USD.",
  facts: { posted_budget_usd: 15000, client_payment_verified: true, client_prior_hires: 6 },
  evidence: [ev("E1", "Work requires physical presence at nine store locations."), ev("E2", "Budget 15000 USD, verified payer.")],
  decision: "decline", disqualifiers: ["out_of_scope_capability"], missing: [] });

add({ id: "Q2-032", title: "Claimed company does not match the account", category: "site_small", tags: ["dq_identity", "value_stated"],
  brief: "Poster claims to represent a national chain, but the account carries no company name, the contact address is free webmail, and no payment method is verified. Budget 3800 USD.",
  facts: { posted_budget_usd: 3800, client_payment_verified: false, client_prior_hires: 0 },
  evidence: [ev("E1", "Poster claims to represent a national chain but the account carries no company name."), ev("E2", "Contact address is free webmail and no payment method is verified.")],
  decision: "decline", disqualifiers: ["identity_unverifiable"], missing: [] });

// --- evidence discipline and fabricated basis ----------------------------
add({ id: "Q2-033", title: "A number in the record that is not a budget", category: "content_small", tags: ["fabricated_basis_trap", "abstention", "evidence_discipline"],
  brief: "Site owner wants six landing pages rewritten. The brief mentions the site receives 8400 monthly visitors. No budget is stated.",
  facts: { posted_budget_usd: null, client_payment_verified: true, monthly_visitors: 8400 },
  evidence: [ev("E1", "Six landing pages are to be rewritten."), ev("E2", "The site receives 8400 monthly visitors."), ev("E3", "No budget figure is stated.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["budget"] });

add({ id: "Q2-034", title: "No budget, scope too thin to price", category: "unstated", tags: ["abstention", "fabricated_basis_trap"],
  brief: "We would like to do something about our search rankings. No further detail is given and no budget is stated.",
  facts: { posted_budget_usd: null, client_payment_verified: true },
  evidence: [ev("E1", "The request refers to improving search rankings with no further detail."), ev("E2", "No budget figure is stated.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["budget", "scope"] });

// --- technical feasibility and uncertainty -------------------------------
add({ id: "Q2-035", title: "Integration against an undocumented proprietary system", category: "unstated", tags: ["technical_feasibility", "decision_hold", "abstention"],
  brief: "Client wants their booking system synchronised with an in-house platform. No documentation or API details are available, and they cannot say whether an interface exists. Budget 7000 USD.",
  facts: { posted_budget_usd: 7000, client_payment_verified: true, client_prior_hires: 3 },
  evidence: [ev("E1", "Synchronisation is requested with an in-house platform."), ev("E2", "No documentation or interface details are available and the client cannot confirm whether an interface exists."), ev("E3", "Budget stated as 7000 USD.")],
  decision: "hold_for_info", disqualifiers: [], missing: ["technical interface details"] });

add({ id: "Q2-036", title: "Straightforward document formatting", category: "content_small", tags: ["decision_pursue", "ai_high", "value_stated"],
  brief: "Consultancy wants twenty reports reformatted to a house template. Budget 700 USD.",
  facts: { posted_budget_usd: 700, client_payment_verified: true, client_prior_hires: 5 },
  evidence: [ev("E1", "Twenty reports to be reformatted to a house template."), ev("E2", "Budget 700 USD, verified payer.")],
  decision: "pursue", disqualifiers: [], missing: [] });

// --- AI share extremes ---------------------------------------------------
add({ id: "Q2-037", title: "Stakeholder-heavy rebuild", category: "site_large", tags: ["ai_low", "decision_pursue", "value_stated"],
  brief: "University department needs a rebuild involving six stakeholder workshops, accessibility review and content migration. Budget 20000 USD.",
  facts: { posted_budget_usd: 20000, client_payment_verified: true, client_prior_hires: 12, deadline_days: 90 },
  evidence: [ev("E1", "Rebuild involves six stakeholder workshops, accessibility review and content migration."), ev("E2", "Budget 20000 USD with a verified payer.")],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-038", title: "Bulk metadata enrichment", category: "data", tags: ["ai_high", "decision_pursue", "value_stated"],
  brief: "Publisher needs metadata enrichment across 12000 catalogue records. Budget 2900 USD.",
  facts: { posted_budget_usd: 2900, client_payment_verified: true, client_prior_hires: 8 },
  evidence: [ev("E1", "Metadata enrichment across 12000 catalogue records."), ev("E2", "Budget 2900 USD, verified payer.")],
  decision: "pursue", disqualifiers: [], missing: [] });

// --- two more live-deadline guards, different shapes ---------------------
add({ id: "Q2-039", title: "Deadline in three days, tight but live", category: "content_small", tags: ["expiry_closing_soon", "live_deadline"],
  brief: "Event organiser needs speaker biographies written. Submissions close in three days. Budget 900 USD.",
  facts: { posted_budget_usd: 900, client_payment_verified: true, deadline_days: 3, posted_days_ago: 6 },
  evidence: [ev("E1", "Submissions close in three days.", 6), ev("E2", "Budget 900 USD, verified payer.", 6)],
  decision: "pursue", disqualifiers: [], missing: [] });

add({ id: "Q2-040", title: "Expired by a single day", category: "site_small", tags: ["expiry_just_expired", "dq_expired", "value_stated"],
  brief: "Proposals for a small site refresh were due yesterday. Budget 3200 USD.",
  facts: { posted_budget_usd: 3200, client_payment_verified: true, deadline_days: -1, posted_days_ago: 21 },
  evidence: [ev("E1", "Proposals were due yesterday.", 21), ev("E2", "Budget 3200 USD, verified payer.", 21)],
  decision: "decline", disqualifiers: ["opportunity_expired"], missing: [] });

// ---------------------------------------------------------------- assemble
const cases = R.map((row) => ({
  case_id: row.id,
  title: row.title,
  source: "opportunity_record",
  brief: row.brief,
  facts: row.facts,
  evidence: row.evidence,
  category: row.category,
  tags: row.tags,
  gold: {
    decision: row.decision,
    disqualifiers: row.disqualifiers,
    required_missing: row.missing,
    numeric: deriveNumeric(row),
    // Legacy shape kept so anything still reading `bands` fails loudly rather
    // than silently reading the old defective encoding.
    bands: undefined,
  },
}));

const ids = new Set();
for (const c of cases) {
  if (ids.has(c.case_id)) throw new Error("duplicate " + c.case_id);
  ids.add(c.case_id);
}

const tagCounts = {};
for (const c of cases) for (const t of c.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
const decisionMix = cases.reduce((a, c) => { a[c.gold.decision] = (a[c.gold.decision] || 0) + 1; return a; }, {});
const codeCoverage = {};
for (const c of cases) for (const d of c.gold.disqualifiers) codeCoverage[d] = (codeCoverage[d] || 0) + 1;

const numericMix = { stated_budget: 0, stated_range: 0, scope_inferred: 0, unknowable: 0 };
for (const c of cases) {
  for (const g of Object.values(c.gold.numeric)) {
    if (g.unknowable) numericMix.unknowable += 1;
    else numericMix[g.source] += 1;
  }
}

const doc = {
  id: "hemmer-opportunity-qualifier-sealed-v2",
  version: "hemmer-opportunity-qualifier-sealed-v2",
  specVersion: "v4",
  synthetic: true,
  n: cases.length,
  authoredBeforeAnyModelRun: true,
  note: "Whole-worker sealed instrument. Gold authored without inspecting any candidate output; numeric gold derived by declared rule. A gold band exists whenever the record supports one, independent of the decision.",
  derivationRules: {
    stated_budget: "band = [0.75B, 1.25B]",
    stated_range: "band = [0.9L, 1.1H]",
    scope_inferred_value: SCOPE_MARKET_RANGES,
    category_bands: CATEGORY_BANDS,
    unknowable: "no figure stated and none inferable from scope; or work outside the capability boundary; or scope unstated",
  },
  cases,
};

const sealedDir = join(stateDir(), "sealed");
mkdirSync(sealedDir, { recursive: true });
const sealedPath = join(sealedDir, "opportunity-qualifier-sealed-v2.json");
writeFileSync(sealedPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
const sha = createHash("sha256").update(readFileSync(sealedPath)).digest("hex");

const manifest = {
  id: doc.id,
  specVersion: "v4",
  // Nested under `sealed` to match the v0 and v1 manifests, so the hash
  // verification in loadSealedSet reads one shape for every version.
  sealed: {
    id: doc.id,
    path: "var/state/sealed/opportunity-qualifier-sealed-v2.json",
    n: cases.length,
    sha256: sha,
    committed: false,
  },
  authoredBeforeAnyModelRun: true,
  frozenAt: new Date().toISOString(),
  decisionMix,
  disqualifierCoverage: codeCoverage,
  numericGoldMix: numericMix,
  tagCoverage: tagCounts,
  expiry: {
    expired: cases.filter((c) => c.gold.disqualifiers.includes("opportunity_expired")).map((c) => c.case_id),
    liveDeadline: cases.filter((c) => c.tags.includes("live_deadline")).map((c) => c.case_id),
  },
  fraudMatrix: {
    legit_work_permissible: cases.filter((c) => c.tags.includes("fraud_legit_work_permissible")).map((c) => c.case_id),
    legit_work_prohibited: cases.filter((c) => c.tags.includes("fraud_legit_work_prohibited")).map((c) => c.case_id),
    fraud_work_permissible: cases.filter((c) => c.tags.includes("fraud_fraud_work_permissible")).map((c) => c.case_id),
    fraud_work_prohibited: cases.filter((c) => c.tags.includes("fraud_fraud_work_prohibited")).map((c) => c.case_id),
  },
  note: "Sealed cases live in gitignored private state. Only this hash is committed.",
};
writeFileSync(repoPath("evals", "opportunity-qualifier", "v2", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("sealed v2:", cases.length, "cases  sha", sha.slice(0, 16));
console.log("decisions:", JSON.stringify(decisionMix));
console.log("codes:", JSON.stringify(codeCoverage));
console.log("numeric gold:", JSON.stringify(numericMix));
console.log("expired:", manifest.expiry.expired.length, " liveDeadline:", manifest.expiry.liveDeadline.length);
console.log("fraud matrix:", Object.entries(manifest.fraudMatrix).map(([k, v]) => k + "=" + v.length).join(" "));
