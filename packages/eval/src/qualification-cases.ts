/**
 * Evaluation material for the full qualification procedure.
 *
 * A third set, and a third seal. The routing set has now told me where the
 * worker fails, which makes it development evidence and not a holdout for
 * whether the repair worked.
 *
 * Sizing was chosen before anything ran, and the reason is the previous cycle's
 * mistake. Four positive cases gave qualify recall a resolution of 0.25, so the
 * gate could not tell a slightly more cautious worker from a broken one, and a
 * single miss failed a configuration that was better on every other measure.
 * Ten positives give resolution 0.10, which is enough to write a threshold that
 * tolerates one miss and refuses three. Thirty sealed cases in total, split
 * qualify 10, research 5, decompose 6, keep 5, decline 4 -- weighted toward the
 * positive class precisely because over-refusal is the failure mode a refusal
 * machine hides behind.
 *
 * Surface form varies on purpose: field dumps, prose, raw posting text, a
 * forwarded email, a newsletter. A worker that wins by recognising the shape of
 * a category page rather than by reasoning about it should not be able to.
 *
 * The adversarial near-neighbours are the point of the set:
 *
 *   A directory of accountants and a directory of freelance developers look
 *   identical and route oppositely. One lists organisations that could buy from
 *   us; the other lists people who sell what we sell. Object count is the same,
 *   commercial meaning is not.
 *
 *   A newsletter that enumerates four real open calls is editorial in surface
 *   form and contains child work in substance.
 *
 *   A search page reporting one result is a single opportunity wearing an
 *   aggregate's clothes.
 *
 *   A staffing firm that invoices us and a school that will merely receive the
 *   work are both records with an unnamed party behind them, and only one of
 *   them is a reason to hold.
 */

export interface QualificationCase {
  id: string;
  title: string;
  record: string;
  gold: {
    counterpartyRole: string;
    counterpartyEstablished: boolean;
    commerciality: string;
    kind: string;
    opportunityCount: number | null;
    buyerCount: number | null;
    orgRole: string;
    buyerIdentity: string;
    routing: string;
  };
  why: string;
}

/** Used to design and inspect. Contaminated by construction. */
export const QUAL_DEV_CASES: QualificationCase[] = [
  {
    id: "QDEV-01", title: "A named buyer with one job",
    record: "Northvale Montessori wants an enrolment microsite with a tour-booking form, replacing a page on its "
      + "current site. Budget $4,200. The head of school is named, with a direct email.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "One named buyer who would sign and pay, one scoped piece of work.",
  },
  {
    id: "QDEV-02", title: "An agency that would sign and pay",
    record: "Kestrelworks, a six-person branding studio, needs an ongoing build partner for client sites. Kestrelworks "
      + "holds the client contracts and pays the partner on its own thirty-day terms. Studio director named.",
    gold: { counterpartyRole: "contracting_intermediary", counterpartyEstablished: true, commerciality: "direct_work", kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "The party that signs and pays is the counterparty. Its clients are irrelevant to whether we can transact with it.",
  },
  {
    id: "QDEV-03", title: "The named organisation only receives the work",
    record: "Request for a new website for Meridian Academy. The academy will use the site, but the record states "
      + "that all purchasing for its schools is handled centrally by a district office, which is not named.",
    gold: { counterpartyRole: "beneficiary_only", counterpartyEstablished: false, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "The only named organisation is the beneficiary. Nobody who would contract has been identified, and that gap is material and closeable.",
  },
  {
    id: "QDEV-04", title: "Nothing to say what it is",
    record: "Forwarded: 'Spoke to someone at the trade show, they need help with their systems, budget is flexible, "
      + "I will send details.' No organisation, no scope, no source.",
    gold: { counterpartyRole: "unresolved", counterpartyEstablished: false, commerciality: "unresolved", kind: "unresolved", opportunityCount: null, buyerCount: null, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "Whether there is any commercial work here has not been established, so nothing below it can be decided.",
  },
  {
    id: "QDEV-05", title: "A stated count of real postings",
    record: "Search results: 'wordpress maintenance' -- 44 open projects from 41 clients, newest first. "
      + "Budgets $80 to $3,000.",
    gold: { counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: 44, buyerCount: 41, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Forty-four real postings behind one record, and the total is stated.",
  },
  {
    id: "QDEV-06", title: "A category of postings with no total",
    record: "Title: Content Writing Projects (Various Clients). Listed under: platform categories. "
      + "Summary: varies -- blog packages, product descriptions, email sequences. Compensation: varies by project.",
    gold: { counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: null, buyerCount: null, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Real postings behind one record with no total stated. Unknown is the honest count and it changes nothing about the handling.",
  },
  {
    id: "QDEV-07", title: "A venue describing itself",
    record: "Twine -- find freelance creative and technical talent. Post a brief or browse specialists in design, "
      + "development, video and voice.",
    gold: { counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "marketplace_source", opportunityCount: 0, buyerCount: 0, orgRole: "platform", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "The venue's own front page enumerates no work but is a real route to it.",
  },
  {
    id: "QDEV-08", title: "A firm selling what we sell",
    record: "Calder & Vance -- web design and marketing automation for professional services firms. "
      + "Twelve years in business. Book a discovery call.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "company_page", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "Nobody here is buying today, and it is still a real organisation and a possible future route. Declining requires no work and no route.",
  },
  {
    id: "QDEV-09", title: "Content about the market",
    record: "Longread: what small businesses get wrong when they commission their first website, and the five "
      + "questions they should ask instead.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "editorial", kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "No work and no route to work. Nobody in it transacts and there is no organisation behind it worth returning to.",
  },
  {
    id: "QDEV-10", title: "Many objects, none of them work",
    record: "Featured this month: nine freelancer spotlights. Each profile lists skills, day rate and current "
      + "availability. Message any of them directly.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "profile_content", kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Nine sellers is not nine opportunities. Counting the objects before asking whether any is work is the error this case exists to catch.",
  },
  {
    id: "QDEV-11", title: "Several items, one piece of work",
    record: "Ferngate Clinic: we need our site rebuilt -- new design, move the content across, and train two staff to "
      + "update it. One budget of $6,000, one timeline, signed off by the practice partner who is named.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "Three visible tasks, one engagement, one budget, one decision. Item count is not opportunity count in either direction.",
  },
  {
    id: "QDEV-12", title: "A directory of possible buyers",
    record: "Directory: independent veterinary practices in the state, 310 listings with contact details, "
      + "searchable by county.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "aggregator", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "No work in it, and every organisation listed is the kind that buys what we sell. That is a route, not an opportunity.",
  },
];

/**
 * Held out. Never used to design anything, and answers never shown to a worker.
 * qualify 10, research_identity 5, decompose 6, keep_as_discovery_source 5, decline 4.
 */
export const QUAL_SEALED_CASES: QualificationCase[] = [
  {
    id: "QS-01", title: "Field-style single buyer",
    record: "Organisation: Bell Harbour Optometry. Need: replace the current site with a five-page build including "
      + "an appointment request form. Budget: $3,100. Contact: practice manager, named, direct line given.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "One named buyer who would sign and pay, one scoped piece of work, stated budget.",
  },
  {
    id: "QS-02", title: "A posting hosted on a platform",
    record: "Posted on Polywork Jobs: Saltmarsh Cider, an independent producer, wants a single-page site with a "
      + "wholesale enquiry form. Fixed price $1,600. Apply through the platform.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "The platform hosts it and is not party to the work. The producer is named and would contract.",
  },
  {
    id: "QS-03", title: "A studio subcontracting",
    record: "Marrow Creative is looking for a regular development partner. Marrow holds all client contracts, sets "
      + "its own scopes and pays partners monthly against invoice. Named producer is the point of contact.",
    gold: { counterpartyRole: "contracting_intermediary", counterpartyEstablished: true, commerciality: "direct_work", kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "An intermediary that signs and pays is the counterparty. Its clients do not need to be named.",
  },
  {
    id: "QS-04", title: "A staffing firm with an unnamed end client",
    record: "Ashgrove Resourcing is engaging a contract front-end developer for a client in the utilities sector. "
      + "Five-month engagement, timesheets invoiced to Ashgrove monthly. The client is named after contract signature.",
    gold: { counterpartyRole: "contracting_intermediary", counterpartyEstablished: true, commerciality: "direct_work", kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "Ashgrove contracts and pays. The end client's anonymity has no bearing on whether the counterparty is known.",
  },
  {
    id: "QS-05", title: "A solicitation reached through an aggregator",
    record: "Via TenderWatch: Borough of Ashfield invites quotes to rebuild its licensing portal. Closing 12 "
      + "December. Estimated $19,500. Named procurement officer in the notice.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "aggregator", buyerIdentity: "established", routing: "qualify" },
    why: "The aggregator is how it was found; the borough is the buyer and is named.",
  },
  {
    id: "QS-06", title: "A search page reporting one result",
    record: "1 result for 'invoice automation, remote'. Rowan Timber Co needs its supplier invoices routed "
      + "automatically into its accounting system. Budget $2,400. Operations lead named.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "platform", buyerIdentity: "established", routing: "qualify" },
    why: "Search-result framing around exactly one real posting. The wrapper is not the record.",
  },
  {
    id: "QS-07", title: "A reseller",
    record: "Pinnacle IT resells web and automation services to its managed-services customers under its own name. "
      + "It is seeking a delivery partner, contracts directly with the partner and bills its customers itself.",
    gold: { counterpartyRole: "contracting_intermediary", counterpartyEstablished: true, commerciality: "direct_work", kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "A reseller that contracts and pays is a customer. White-labelling changes nothing about the counterparty.",
  },
  {
    id: "QS-08", title: "A forwarded email from the owner",
    record: "From: Dana Okoro, owner, Okoro Family Dentistry. 'Our site is eight years old and we cannot update it. "
      + "We would like a rebuild plus a way to post news ourselves. We have set aside about $5,000. Can you quote?'",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "The owner writes in their own name with a budget. Nothing is missing that would change the decision.",
  },
  {
    id: "QS-09", title: "Three tasks, one engagement",
    record: "Halloway Legal: refresh the site design, migrate 60 articles from the old blog, and set up a contact "
      + "workflow. One project, one budget of $7,500, one go-live date. Managing partner named as approver.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "Three visible tasks inside one engagement with one budget and one approver. Not a record to break apart.",
  },
  {
    id: "QS-10", title: "A named buyer reachable only through a form",
    record: "Sandbourne Brewing Co is requesting proposals for an online shop to replace phone ordering. Budget band "
      + "$8,000 to $11,000 stated. Responses through the enquiry form on their own website.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "The buyer is named and reachable on its own site. An indirect contact route is not an identity gap.",
  },

  {
    id: "QS-11", title: "Confidential client behind a consultant who does not contract",
    record: "A confidential client in the utilities sector requires migration of a field-service scheduling system. "
      + "Budget $14,000. Enquiries are screened by Rothwell Advisory, which introduces suppliers but takes no part in "
      + "the contract or payment.",
    gold: { counterpartyRole: "unresolved", counterpartyEstablished: false, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "The named firm introduces but does not contract, so the counterparty is still unknown. It is reachable, and knowing it would change the decision.",
  },
  {
    id: "QS-12", title: "A brief nobody is attached to",
    record: "Wanted: someone to reconcile two years of transaction exports and produce a clean ledger. Roughly 9,000 "
      + "rows. No organisation, no contact, no budget. Posted to an open board with replies disabled.",
    gold: { counterpartyRole: "unresolved", counterpartyEstablished: false, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "Real work whose counterparty cannot be reached at all. Anonymity alone is not disqualifying and it is not ignorable either.",
  },
  {
    id: "QS-13", title: "A body collecting quotes for someone else",
    record: "Fenwick Association is gathering quotes for a website refresh on behalf of one of its member "
      + "organisations. The association passes quotes to the member, which decides and contracts directly.",
    gold: { counterpartyRole: "referring_intermediary", counterpartyEstablished: false, commerciality: "direct_work", kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "A referrer is not a counterparty. The party that would sign has not been named, and naming it is the next step.",
  },
  {
    id: "QS-14", title: "The named party only receives the work",
    record: "New intranet required for Calverton Community Hospital. The hospital will use the system. The notice "
      + "states that IT purchasing for all sites in the group is handled by a central office, which is not named.",
    gold: { counterpartyRole: "beneficiary_only", counterpartyEstablished: false, commerciality: "direct_work", kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "The only named organisation is the beneficiary. Who signs is unknown and material.",
  },
  {
    id: "QS-15", title: "Not enough to say whether there is work",
    record: "Note passed on: 'They mentioned wanting to modernise things, might have budget next quarter, worth a "
      + "conversation.' No organisation, no scope, no source given.",
    gold: { counterpartyRole: "unresolved", counterpartyEstablished: false, commerciality: "unresolved", kind: "unresolved", opportunityCount: null, buyerCount: null, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "Whether any commercial work exists has not been established. That question comes before every other one.",
  },

  {
    id: "QS-16", title: "Search results with a stated count",
    record: "Results for 'crm data cleanup' -- 29 open projects from 27 clients, sorted by newest. Budgets $120 to "
      + "$5,500.",
    gold: { counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: 29, buyerCount: 27, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Twenty-nine real postings behind one record with the total stated.",
  },
  {
    id: "QS-17", title: "A category page with no total",
    record: "Title: Automation and Integration Projects (Multiple Clients). Listed under: category browse. Summary: "
      + "varies -- Zapier builds, API integrations, reporting pipelines. Compensation: varies by project.",
    gold: { counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: null, buyerCount: null, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Real postings behind one record, no total stated. Unknown is the honest count and it does not change the handling.",
  },
  {
    id: "QS-18", title: "One buyer, separate briefs",
    record: "Open at Wrenfield Trust: (1) rebuild the grant application form, (2) migrate the archive to a new host, "
      + "(3) produce eight case studies. Separate budgets, separate owners, separate timelines.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: 3, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "decompose" },
    why: "One buyer and three genuinely separate pieces of work. Scoping them as one engagement prices something that does not exist.",
  },
  {
    id: "QS-19", title: "Separately awarded lots, no total",
    record: "County digital services framework. Suppliers may bid for individual lots covering web development, "
      + "content design, accessibility testing and analytics. Each lot is evaluated and awarded on its own.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: null, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "decompose" },
    why: "Separately awarded lots are separate opportunities. No total is summarised and the handling is still to break it apart.",
  },
  {
    id: "QS-20", title: "A weekly digest of real briefs",
    record: "This week's roundup: 9 new briefs from 9 organisations, including a museum ticketing rebuild, a "
      + "membership renewal flow and two content projects. Each links to the organisation's own notice.",
    gold: { counterpartyRole: "aggregator_source", counterpartyEstablished: false, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: 9, buyerCount: 9, orgRole: "aggregator", buyerIdentity: "unavailable", routing: "decompose" },
    why: "A digest in surface form and nine real opportunities in substance, each traceable to its own buyer.",
  },
  {
    id: "QS-21", title: "A newsletter that is actually a list of open calls",
    record: "Sector newsletter, issue 44. Editorial on procurement reform, then: four open calls closing this month "
      + "-- a heritage site rebuild, a volunteer portal, a data migration and an accessibility audit, each with its "
      + "own named commissioning body and deadline.",
    gold: { counterpartyRole: "aggregator_source", counterpartyEstablished: false, commerciality: "contains_child_work", kind: "aggregate_listing", opportunityCount: 4, buyerCount: 4, orgRole: "aggregator", buyerIdentity: "established", routing: "decompose" },
    why: "Editorial wrapper, four named commissioning bodies and four deadlines inside. Commerciality is decided by content, not by the format it arrives in.",
  },

  {
    id: "QS-22", title: "A marketplace front page",
    record: "Freelancermap -- find IT projects and freelancers. Browse by skill, region and availability. Post a "
      + "project or search the talent pool.",
    gold: { counterpartyRole: "platform_host", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "marketplace_source", opportunityCount: 0, buyerCount: 0, orgRole: "platform", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "The venue's own front page enumerates no specific work and is a real route to it. Not a thing to decompose and not a thing to discard.",
  },
  {
    id: "QS-23", title: "A directory of organisations that buy",
    record: "Directory: independent pharmacies in the region. 240 listings with owner names, addresses and "
      + "telephone numbers, filterable by town.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "aggregator", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "No work in it. Every organisation listed is the kind that buys what we sell, so it is a route worth keeping.",
  },
  {
    id: "QS-24", title: "A register with nothing open",
    record: "Marchfield County operates a prequalified supplier register for digital services. Suppliers may apply to "
      + "join at any time. No solicitations are currently open.",
    gold: { counterpartyRole: "direct_buyer", counterpartyEstablished: true, commerciality: "enables_discovery", kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "buyer", buyerIdentity: "established", routing: "keep_as_discovery_source" },
    why: "A real, named buyer with no work open today. The register is how future work arrives, so discarding it removes the only route in.",
  },
  {
    id: "QS-25", title: "A peer firm's own page",
    record: "Thornhill Digital -- websites, automation and analytics for independent retailers. Meet the team, read "
      + "our case studies, start a project with us.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "company_page", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "Nobody is buying here today and it is still a real organisation and a possible future route. Declining needs no work AND no route.",
  },
  {
    id: "QS-26", title: "A conference exhibitor list",
    record: "Exhibitors at this year's regional dental trade show: 74 practices, suppliers and clinic groups, each "
      + "with a stand number and a contact name.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "enables_discovery", kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "aggregator", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "Seventy-four organisations and no work. They are the kind of organisation that buys, which makes this a route rather than an opportunity.",
  },

  {
    id: "QS-27", title: "An article",
    record: "Explainer: how much should a small business expect to pay for a website in 2026? We break down typical "
      + "ranges, what drives cost, and where owners overspend.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "editorial", kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "No work and no route to work. Nobody in it is transacting and there is no organisation behind it to return to.",
  },
  {
    id: "QS-28", title: "A supplier advertising",
    record: "[Available now] Senior automation engineer, ten years' experience, open to contract or retainer. "
      + "Python, Airflow, dbt. Rates on request, references available.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "supplier_marketing", kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Someone selling what we sell. Not a buyer and not a route to one.",
  },
  {
    id: "QS-29", title: "A directory of organisations that sell",
    record: "Directory: freelance web developers and designers available for hire. 260 profiles with skills, day "
      + "rates and availability, filterable by stack.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "profile_content", kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Structurally identical to a directory of buyers and commercially its opposite: 260 objects, all of them competitors, no work and no route to any.",
  },
  {
    id: "QS-30", title: "Many results, none of them work",
    record: "Search returned 53 items for 'website redesign cost': guides, comparison posts, two podcast "
      + "transcripts and a webinar recording.",
    gold: { counterpartyRole: "no_counterparty", counterpartyEstablished: false, commerciality: "editorial", kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Fifty-three of nothing is still nothing. A large visible count is the strongest wrong signal in the set.",
  },
];

export function routingBalance(cases: QualificationCase[]) {
  const out: Record<string, number> = {};
  for (const c of cases) out[c.gold.routing] = (out[c.gold.routing] || 0) + 1;
  return out;
}
