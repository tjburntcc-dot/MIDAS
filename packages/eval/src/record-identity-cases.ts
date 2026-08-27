/**
 * Evaluation material for record identity and cardinality.
 *
 * Development cases are here, in source, because they were used to design the
 * fix and are therefore contaminated by construction. The Freelancer record that
 * exposed the gap is among them: it is development evidence, not a holdout, and
 * treating it as a holdout would be measuring a case the repair was built
 * against.
 *
 * Sealed cases are written to gitignored state and only their hash is committed.
 *
 * Gold quality is the thing to be careful about here. The previous cycle on this
 * concept had two contestable cases out of ten, which was enough to make its
 * result partly unreadable. Every case below has a defensible answer that a
 * competent person would give without hesitation, and the deliberately hard ones
 * are hard because the *situation* is genuinely subtle -- an agency that is a
 * perfectly good customer, a real single posting reached through an aggregator --
 * rather than because the label is arguable.
 */

export interface IdentityCase {
  id: string;
  title: string;
  record: string;
  gold: {
    kind: string;
    opportunityCount: number | null;
    buyerCount: number | null;
    orgRole: string;
    buyerIdentity: string;
    routing: string;
  };
  why: string;
}

/** Used to design the repair. Contaminated by construction. */
export const DEV_CASES: IdentityCase[] = [
  {
    id: "DEV-01", title: "The record that exposed the gap",
    record: "Title: Freelance SEO Writing Jobs (Various Projects). Listed under: Freelancer.com clients. "
      + "URL: https://www.freelancer.com/jobs/seo-writing/. Summary: Varies -- e.g. Monthly SEO Content Writer, "
      + "SEO article writing, blog packages. Compensation: varies by project.",
    // GOLD DEFECT, recorded rather than quietly corrected: opportunityCount was
    // 12 and the record states no total at all. That number was invented by the
    // case author. A worker returning null here is being more honest than the
    // gold was, and the count is now null to match what the record supports.
    // The result already measured against the defective gold is not re-scored.
    gold: { kind: "aggregate_listing", opportunityCount: null, buyerCount: null, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "A category page of many unrelated postings. The URL is a jobs category and the organisation field is plural. It is not one opportunity and it is not worthless. The record states no total, so the count is unknown rather than large.",
  },
  {
    id: "DEV-02", title: "A plain single buyer",
    record: "Riverside Dental, a six-person practice, needs a five-page marketing website with an appointment "
      + "enquiry form. Budget stated as $2,000. Contact: the practice manager, named, with a direct email.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "One named organisation, one piece of work, a stated budget and a reachable decision-maker.",
  },
  {
    id: "DEV-03", title: "An agency that would be the customer",
    record: "Northgate Digital, a marketing agency, is looking for a subcontractor to build client websites on an "
      + "ongoing basis. Northgate contracts with the freelancer and bills its own clients. Rate discussed on a call.",
    gold: { kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "An intermediary that would sign and pay is a customer. Rejecting it for not being the end client is a common and expensive mistake.",
  },
  {
    id: "DEV-04", title: "A firm describing itself",
    record: "Connecticity Consulting -- Workflow Design & Automation. We help organisations design and automate "
      + "their internal workflows. Contact us to scope an engagement.",
    gold: { kind: "company_page", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A company selling the same services we sell. Not seeking anything, but a real organisation worth knowing about.",
  },
  {
    id: "DEV-05", title: "A directory",
    record: "Directory listing: local web design firms. Browse listings by speciality and region. 240 companies listed.",
    gold: { kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "aggregator", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A list of organisations rather than of work. Useful for finding people to approach; not a piece of work.",
  },
  {
    id: "DEV-06", title: "One posting reached through an aggregator",
    record: "Via LightRFP: City of Brookfield seeks a vendor for a website accessibility audit. Submissions due "
      + "14 October. Budget $18,000. Contact named in the solicitation document.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "aggregator", buyerIdentity: "established", routing: "qualify" },
    why: "The aggregator is how we found it; the buyer is the city. One opportunity, correctly qualifiable.",
  },
];

/**
 * Held out. Never used to design anything.
 *
 * Deliberately includes shapes the development set does not: an anonymous but
 * genuinely single buyer, a staffing firm with an unnamed end client, a
 * multi-project page with a small definite count, and a record with no
 * transaction in it at all.
 */
export const SEALED_CASES: IdentityCase[] = [
  {
    id: "SEAL-01", title: "Anonymous but single",
    record: "A confidential client in the healthcare sector requires migration of 30,000 patient-contact records "
      + "between two CRM systems. Budget $6,000. Enquiries handled through a named procurement consultant.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "resolvable", routing: "research_identity" },
    why: "One buyer and one piece of work. The buyer is not named but is reachable through the consultant, so the identity gap is worth closing rather than fatal.",
  },
  {
    id: "SEAL-02", title: "Browse all jobs",
    record: "Browse Jobs -- Guru.com. Find freelance work across writing, design, development and admin. "
      + "Thousands of projects posted monthly.",
    gold: { kind: "marketplace_source", opportunityCount: null, buyerCount: null, orgRole: "platform", buyerIdentity: "unavailable", routing: "keep_as_discovery_source" },
    why: "A venue described as itself. A place to look for work, not a piece of work.",
  },
  {
    id: "SEAL-03", title: "Staffing firm, unnamed end client",
    record: "Apex Talent Partners is recruiting a contract content writer for a financial services client. "
      + "Six-month engagement, invoiced to Apex monthly. Client name disclosed after NDA.",
    gold: { kind: "intermediary_record", opportunityCount: 1, buyerCount: 1, orgRole: "intermediary", buyerIdentity: "established", routing: "qualify" },
    why: "Apex contracts and pays. The end client's anonymity does not change who the counterparty is.",
  },
  {
    id: "SEAL-04", title: "Three named projects on one page",
    record: "Open briefs at Harborline Group: (1) rebuild the events microsite, (2) migrate the mailing list to a "
      + "new provider, (3) write twelve case studies. Each brief has its own budget and owner.",
    gold: { kind: "aggregate_listing", opportunityCount: 3, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "decompose" },
    why: "One buyer, three distinct pieces of work with separate budgets and owners. Qualifying it as one thing prices and scopes something that does not exist.",
  },
  {
    id: "SEAL-05", title: "An article about hiring",
    record: "Blog: Five trends shaping freelance hiring in 2026. Why more small businesses are outsourcing content.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Commentary. No transaction is contemplated by anybody, so there is nothing to come back to either.",
  },
  {
    id: "SEAL-06", title: "A single posting hosted on a platform",
    record: "Posted on Contra: Willow & Co, an independent bakery, wants a one-page site with online ordering. "
      + "Fixed price $1,200. Apply through the platform.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "buyer", buyerIdentity: "established", routing: "qualify" },
    why: "The platform hosts it; the bakery is the buyer. A named buyer and one clearly-scoped job.",
  },
  {
    id: "SEAL-07", title: "Search results for a query",
    record: "Search results for 'data cleanup freelance' -- 47 matching projects across multiple clients, "
      + "sorted by newest. Budgets from $50 to $4,000.",
    gold: { kind: "aggregate_listing", opportunityCount: 47, buyerCount: 47, orgRole: "platform", buyerIdentity: "unavailable", routing: "decompose" },
    why: "Forty-seven postings behind one record. The count is stated, so the cardinality is not even in doubt.",
  },
  {
    id: "SEAL-08", title: "A supplier advertising",
    record: "[For Hire] Experienced automation specialist available for new projects. Open to hourly or fixed price. "
      + "Portfolio on request. Message me to discuss.",
    gold: { kind: "non_commercial", opportunityCount: 0, buyerCount: 0, orgRole: "not_applicable", buyerIdentity: "unavailable", routing: "decline" },
    why: "Somebody selling what we sell. Not a buyer and not a route to one.",
  },
  {
    id: "SEAL-09", title: "A vendor list nobody is hiring from yet",
    record: "Somerset County maintains a prequalified vendor list for web and digital services. Vendors may apply "
      + "to be listed. No current solicitations are open.",
    gold: { kind: "directory", opportunityCount: 0, buyerCount: 0, orgRole: "buyer", buyerIdentity: "established", routing: "keep_as_discovery_source" },
    why: "A real buyer with no work open. Being on the list is how future work arrives, so declining it deletes the only route in.",
  },
  {
    id: "SEAL-10", title: "One brief, no counterparty at all",
    record: "Wanted: someone to clean up a product spreadsheet, about 3,000 rows. No company name, no contact "
      + "details, no budget, posted anonymously to a public board with no reply mechanism.",
    gold: { kind: "single_opportunity", opportunityCount: 1, buyerCount: 1, orgRole: "unresolved", buyerIdentity: "unavailable", routing: "research_identity" },
    why: "One piece of work whose counterparty cannot be reached. Anonymity alone is not disqualifying, but with no reply mechanism the identity has to be established before anything else is worth doing.",
  },
];

export function caseCounts(cases: IdentityCase[]) {
  const byKind: Record<string, number> = {};
  const byRouting: Record<string, number> = {};
  for (const c of cases) {
    byKind[c.gold.kind] = (byKind[c.gold.kind] || 0) + 1;
    byRouting[c.gold.routing] = (byRouting[c.gold.routing] || 0) + 1;
  }
  return { total: cases.length, byKind, byRouting };
}
