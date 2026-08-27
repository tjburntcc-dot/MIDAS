/**
 * Evaluation material for routing from resolved commercial record identity.
 *
 * A separate set from the identity cases, and a separate seal. The identity
 * sealed set has now informed a diagnosis -- it told me the worker classifies
 * correctly and routes wrongly -- so it is no longer a clean holdout for the
 * question that diagnosis raised. Reusing it would be measuring the repair
 * against the evidence that motivated the repair.
 *
 * Balance is deliberate and declared. Four sealed cases per routing outcome, so
 * a worker cannot reach a good number by favouring one answer, and four of them
 * are plain qualifiable opportunities so that a refusal machine scores badly
 * rather than well.
 *
 * Two shapes are here on purpose because they are where the rule is load-bearing:
 *
 *   Unknown counts. An aggregate whose total is not stated is still an aggregate.
 *   A worker that declines to invent a number must not be routed differently
 *   from one that guesses; the previous cycle found my own rule doing exactly
 *   that.
 *
 *   Aggregate-shaped records with nothing commercial in them. A page of twelve
 *   freelancers advertising themselves has many entities and no transaction. The
 *   discrimination that matters is not "how many" but "any work here at all",
 *   and it is the only way a decline can be correct for a many-item record --
 *   a genuine aggregate of postings is never declined, by construction.
 */

import type { IdentityCase } from "./record-identity-cases.ts";

/** Used to design and inspect. Contaminated by construction. */
export const ROUTING_DEV_CASES: IdentityCase[] = [
  {
    id: "RDEV-01", title: "qualify: a named buyer with one job",
    record: "Fairview Veterinary Clinic needs a booking system added to its existing website so clients can request "
      + "appointments online. Budget $3,500. Practice owner named, direct phone and email given.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "One named buyer, one scoped job, reachable. Nothing to establish before assessing it.",
  },
  {
    id: "RDEV-02", title: "qualify: a reseller that would contract",
    record: "Brightpath Media, a small agency, wants a regular subcontractor for WordPress builds. Brightpath signs "
      + "the contract, pays monthly on invoice, and handles its own clients directly. Named producer as contact.",
    gold: { kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "The party that signs and pays is the counterparty. Being an agency is not a disqualifier.",
  },
  {
    id: "RDEV-03", title: "research_identity: reachable but unnamed",
    record: "An undisclosed logistics company requires a rebuild of its internal dispatch dashboard. Budget band "
      + "$8,000 to $12,000. All enquiries via Sinclair Advisory, whose partner is named with a direct line.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "One buyer, one job, name withheld but obtainable through a named intermediary. The gap is worth closing before deciding.",
  },
  {
    id: "RDEV-04", title: "research_identity: no counterparty at all",
    record: "Need someone to convert about 200 scanned invoices into a spreadsheet. Posted anonymously to a public "
      + "board. No company, no contact details, no budget, no way to reply.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "One real piece of work whose counterparty cannot be reached. Anonymity alone is not disqualifying, but nothing else can proceed until identity exists.",
  },
  {
    id: "RDEV-05", title: "decompose: a stated count",
    record: "Search results for shopify migration -- 62 matching projects from 58 different clients, sorted by "
      + "newest. Budgets from $200 to $9,000.",
    gold: { kind: "aggregate_listing", opportunityCount: 62, buyerCount: 58, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Sixty-two postings behind one record. The count is stated, so cardinality is not even in doubt.",
  },
  {
    id: "RDEV-06", title: "decompose: several briefs, one buyer",
    record: "Currently open at Ellery Foods: (1) redesign the trade ordering portal, (2) migrate the recipe archive, "
      + "(3) set up automated stock alerts. Separate budget holders for each.",
    gold: { kind: "aggregate_listing", opportunityCount: 3, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "decompose" },
    why: "One buyer, three distinct pieces of work with separate owners. Scoping it as one thing prices something that does not exist.",
  },
  {
    id: "RDEV-07", title: "keep_as_discovery_source: a venue describing itself",
    record: "PeoplePerHour -- hire freelancers for any project. Browse thousands of skilled professionals across "
      + "design, development, writing and marketing.",
    gold: { kind: "marketplace_source", opportunityCount: 0, buyerCount: 0, orgRole: "platform", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A place to look for work, not a piece of work. Real ongoing value, no opportunity in the record itself.",
  },
  {
    id: "RDEV-08", title: "keep_as_discovery_source: a peer firm",
    record: "Latchford Systems -- integration and data migration consultancy for mid-sized manufacturers. "
      + "See our case studies. Enquire about an engagement.",
    gold: { kind: "company_page", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "An organisation describing itself, not seeking anything today. A real organisation worth knowing about; declining it deletes that.",
  },
  {
    id: "RDEV-09", title: "decline: commentary",
    record: "Opinion: why small businesses keep hiring the wrong web developers. Three mistakes owners make when "
      + "scoping their first site.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Commentary. No transaction is contemplated by anybody, so there is nothing to pursue and nothing to return to.",
  },
  {
    id: "RDEV-10", title: "decline: many items, none of them work",
    record: "Thread: introduce yourself and post your portfolio. Eight replies, each from a freelance designer or "
      + "developer advertising availability and rates.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Many entities and no work. Everyone in it sells what we sell. Aggregate shape is not the same as aggregate content.",
  },
];

/**
 * Held out. Never used to design anything. Four cases per routing outcome.
 */
export const ROUTING_SEALED_CASES: IdentityCase[] = [
  {
    id: "RSEAL-01", title: "A plain single buyer",
    record: "Kestrel Physiotherapy, an eight-person practice, wants a four-page site with an online enquiry form and "
      + "a clinician directory. Budget stated as $2,800. Clinic manager named with direct email.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "One named buyer, one scoped job, stated budget, reachable decision-maker.",
  },
  {
    id: "RSEAL-02", title: "A municipal solicitation found through an aggregator",
    record: "Via BidNexus: Township of Wexley invites proposals to rebuild its permits portal. Closing 3 November. "
      + "Estimated value $22,000. Procurement officer named in the solicitation.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "aggregator", buyerIdentity: "established", routing: "qualify" },
    why: "The aggregator is how we found it; the township is the buyer. One opportunity, fully assessable.",
  },
  {
    id: "RSEAL-03", title: "A staffing firm with an unnamed end client",
    record: "Cardell Resourcing seeks a contract data analyst for an insurance client. Four-month engagement, "
      + "invoiced to Cardell fortnightly. Client identity disclosed after signature.",
    gold: { kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "Cardell contracts and pays. The end client's anonymity does not change who the counterparty is.",
  },
  {
    id: "RSEAL-04", title: "A single posting hosted on a platform",
    record: "Posted on Contra: Ninebark Roasters, an independent coffee roaster, wants a one-page site with a "
      + "wholesale order form. Fixed price $1,400. Apply through the platform.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "The platform hosts it; the roaster is the buyer. One clearly-scoped job with a named organisation.",
  },

  {
    id: "RSEAL-05", title: "Confidential but reachable",
    record: "A confidential client in the education sector requires consolidation of three student-record systems. "
      + "Budget $15,000. Enquiries handled through Marrow Procurement Partners, contact named.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "One buyer and one piece of work, unnamed but obtainable. Worth closing the gap rather than deciding blind.",
  },
  {
    id: "RSEAL-06", title: "A brief with nobody attached",
    record: "Wanted: tidy up a product catalogue of roughly 4,000 rows and standardise the category names. No "
      + "company named, no contact, no budget, posted to an open board with no reply mechanism.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "One piece of work whose counterparty cannot be reached. Identity has to exist before anything else is worth doing.",
  },
  {
    id: "RSEAL-07", title: "An intermediary whose role is not established",
    record: "Halgren Group is collecting quotes for a website refresh on behalf of a member organisation. It is not "
      + "stated whether Halgren contracts and pays or merely passes quotes along.",
    gold: { kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "Whether the named party is the counterparty or a messenger changes everything downstream, and it is cheap to establish.",
  },
  {
    id: "RSEAL-08", title: "Not enough to say what it is",
    record: "Forwarded note: they need help with their systems, said budget is flexible, will send details. No "
      + "organisation, no scope, no source given.",
    gold: { kind: "unresolved", opportunityCount: null, buyerCount: null, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "Could be one opportunity. What it is has not been established at all, and establishing it is the cheap next step.",
  },

  {
    id: "RSEAL-09", title: "A stated count",
    record: "Search results for bookkeeping automation -- 38 matching projects from 35 clients, newest first. "
      + "Budgets from $150 to $6,000.",
    gold: { kind: "aggregate_listing", opportunityCount: 38, buyerCount: 35, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Thirty-eight postings behind one record, and the total is stated.",
  },
  {
    id: "RSEAL-10", title: "A category page with no total given",
    record: "Title: Data Entry and Admin Projects (Various Clients). Listed under: Upwork categories. "
      + "URL: https://www.upwork.com/cat/admin-support/. Summary: varies -- data entry, list building, CRM cleanup. "
      + "Compensation: varies by project.",
    gold: { kind: "aggregate_listing", opportunityCount: null, buyerCount: null, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "A category of many unrelated postings. The record states no total, so the count is unknown -- which changes nothing about what the record is or what to do with it.",
  },
  {
    id: "RSEAL-11", title: "Several briefs from one buyer",
    record: "Open work at Thornbury Trust: refresh the donations page, build a volunteer sign-up flow, and migrate "
      + "the newsletter to a new provider. Each has its own budget holder and timeline.",
    gold: { kind: "aggregate_listing", opportunityCount: 3, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "decompose" },
    why: "One buyer, three separate pieces of work with separate owners. Treating it as one engagement scopes something that does not exist.",
  },
  {
    id: "RSEAL-12", title: "A tender split into lots, count not summarised",
    record: "Regional Health Board digital services framework. Suppliers may bid for individual lots covering web "
      + "development, content design, accessibility testing and user research. Each lot is awarded separately.",
    gold: { kind: "aggregate_listing", opportunityCount: null, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "decompose" },
    why: "Separately awarded lots are separate opportunities. No total is stated, and the correct handling is still to break it apart rather than bid it as one thing.",
  },

  {
    id: "RSEAL-13", title: "A venue describing itself",
    record: "Workana -- the freelance marketplace for Latin America. Post a project or find work across development, "
      + "design, marketing and translation.",
    gold: { kind: "marketplace_source", opportunityCount: 0, buyerCount: 0, orgRole: "platform", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A place to look, not a thing to pursue. It keeps its value as a source and must not be qualified as work.",
  },
  {
    id: "RSEAL-14", title: "A list of firms",
    record: "Directory: accounting practices in the Lehigh Valley. Browse 180 listings by size and speciality. "
      + "Contact details for each firm.",
    gold: { kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "aggregator", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A list of organisations rather than of work. Useful for finding people to approach; no opportunity in it.",
  },
  {
    id: "RSEAL-15", title: "A buyer with nothing open",
    record: "Delaware County maintains a prequalified supplier register for digital and creative services. Suppliers "
      + "may apply to join. No solicitations are currently open.",
    gold: { kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "buyer", buyerIdentity: "established", routing: "keep_as_discovery_source" },
    why: "A real buyer with no work open. Being on the register is how future work arrives, so declining it deletes the only route in.",
  },
  {
    id: "RSEAL-16", title: "A firm selling what we sell",
    record: "Ardenway Studio -- websites and automation for independent retailers. Fifteen years in business. "
      + "Get in touch to discuss your project.",
    gold: { kind: "company_page", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A peer, not a buyer today. Still a real organisation and a possible future route; deleting it costs more than keeping it.",
  },

  {
    id: "RSEAL-17", title: "An article",
    record: "Guide: how to choose a web developer in 2026. What to ask, what to pay, and the warning signs to watch "
      + "for when reviewing proposals.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Content about the market. Nobody in it is transacting, and there is no organisation behind it worth returning to.",
  },
  {
    id: "RSEAL-18", title: "A supplier advertising",
    record: "[Available] Full-stack developer open to contract work. React, Node, Postgres. Hourly or fixed price. "
      + "Portfolio and references on request.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Somebody selling what we sell. Not a buyer and not a route to one.",
  },
  {
    id: "RSEAL-19", title: "Many results, none of them work",
    record: "Search results: 41 articles matching freelance rates 2026, including salary surveys, opinion pieces "
      + "and podcast transcripts.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Aggregate shape, no commercial content. Forty-one of nothing is still nothing. This is the only way a many-item record is correctly declined.",
  },
  {
    id: "RSEAL-20", title: "A page full of suppliers",
    record: "Showcase: this month's featured freelancers. Twelve profiles, each listing skills, day rate and "
      + "availability. Message any of them directly.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Twelve entities, all of them sellers. Counting is not the discrimination that matters here; whether any work exists is.",
  },
];
