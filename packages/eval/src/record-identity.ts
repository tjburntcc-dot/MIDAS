/**
 * Commercial record identity and cardinality.
 *
 * A qualifier was asked whether to pursue an opportunity, and the thing it was
 * shown was a jobs category page listing many unrelated clients. It answered
 * "hold for more information", stably, five times out of five. An independent
 * adjudicator said decline, three times out of three, and it was right.
 *
 * The interesting part is why the worker could not be right. Its output contract
 * had no field for what kind of record it was looking at and no field for how
 * many opportunities the record contained. Asked a question with a false
 * presupposition -- *this* opportunity -- every answer available to it was wrong,
 * and hold-for-information was the least wrong. That is a contract defect wearing
 * the costume of a reasoning defect.
 *
 * A previous attempt added a `not_a_buyer` disqualifier and the foundry rejected
 * it: 0.2 recall on sealed cases, no better than having the code without the
 * knowledge. That rejection stands and is not being relitigated. It was also
 * aimed at the wrong thing. A binary "is this a buyer" collapses several
 * different situations that need different handling, and it treats an aggregate
 * page as worthless when an aggregate page is often the most valuable record in
 * a discovery run -- it just is not one opportunity.
 *
 * So the competency here is classification and routing, not rejection:
 *
 *   WHAT is this record, HOW MANY opportunities does it represent, HOW MANY
 *   buyers, WHO is the named organisation to the transaction, and therefore
 *   WHERE should this record go.
 *
 * The routing matters as much as the classification. Declining an aggregate
 * throws away real discovery value; qualifying it as one opportunity produces a
 * confident answer about a thing that does not exist.
 */

/** What kind of object the record actually is. */
export const RECORD_KINDS = [
  "single_opportunity",      // one buyer, one piece of work
  "aggregate_listing",       // category, search results, or feed of many postings
  "directory",               // a list of organisations, not of work
  "marketplace_source",      // a venue that hosts postings, described as itself
  "intermediary_record",     // agency, staffing firm, or reseller between us and the end client
  "company_page",            // an organisation describing itself, not seeking anything
  "non_commercial",          // no transaction contemplated at all
  "unresolved",              // genuinely cannot be determined from what is available
] as const;

/** What the named organisation is to the transaction. */
export const ORG_ROLES = [
  "buyer",                   // it would pay and receive the work
  "intermediary",            // it would contract with us and serve an end client
  "platform",                // it hosts the posting and is not party to the work
  "aggregator",              // it collected the posting from elsewhere
  "not_applicable",
  "unresolved",
] as const;

/** Where a record should go once its identity is known. */
export const ROUTING = [
  "qualify",                 // a single opportunity: continue
  "research_identity",       // one opportunity, identity gap that is worth closing
  "decompose",               // many opportunities inside: extract children
  "keep_as_discovery_source", // valuable as a place to look, not as a thing to pursue
  "decline",                 // no commercial value in any form
] as const;

export interface RecordIdentity {
  kind: string;
  /** How many distinct pieces of work. null when genuinely unknown. */
  opportunityCount: number | null;
  /** How many distinct buyers. */
  buyerCount: number | null;
  orgRole: string;
  buyerIdentity: string;     // established | resolvable | unavailable
  routing: string;
  reasoning: string;
}

/**
 * The routing a given identity implies.
 *
 * Separated from the classification deliberately. A worker can misjudge what a
 * record is, or judge it correctly and then do the wrong thing with it, and
 * those need different repairs. Keeping the rule here also means the rule is
 * inspectable rather than living inside a prompt.
 */
export function routingFor(id: Pick<RecordIdentity, "kind" | "opportunityCount" | "buyerCount" | "orgRole" | "buyerIdentity">) {
  if (id.kind === "non_commercial") {
    return { routing: "decline", why: "No transaction is contemplated, so there is nothing to qualify or to come back to." };
  }
  if (id.kind === "company_page") {
    return { routing: "keep_as_discovery_source", why: "An organisation describing itself is not seeking work, but it may be worth approaching later. Declining deletes that." };
  }
  if (id.kind === "directory" || id.kind === "marketplace_source") {
    return { routing: "keep_as_discovery_source", why: "A place to find opportunities is not an opportunity. It keeps its discovery value and must not be qualified as one piece of work." };
  }
  if (id.kind === "aggregate_listing") {
    // The distinction that the rejected binary code could not make.
    //
    // An aggregate whose count is unknown is still an aggregate and still worth
    // decomposing. An earlier version required a numeric count above one, which
    // routed a correctly-identified category page to "keep as a source" purely
    // because the worker had honestly declined to invent a total. That punished
    // the worker for being more careful than the rule.
    const knownSingle = id.opportunityCount != null && id.opportunityCount <= 1;
    return {
      routing: knownSingle ? "keep_as_discovery_source" : "decompose",
      why: "Many postings behind one record. Qualifying it as a single opportunity produces a confident answer about a thing that does not exist; declining it throws away every real posting inside.",
    };
  }
  if (id.kind === "intermediary_record") {
    // An intermediary is frequently a perfectly good customer. It is the party
    // that would sign and pay, and rejecting it for not being the end client is
    // a common and expensive mistake.
    return {
      routing: id.orgRole === "intermediary" ? "qualify" : "research_identity",
      why: "An agency or reseller that would contract and pay is a buyer for our purposes. Being an intermediary is not itself a disqualifier.",
    };
  }
  if (id.kind === "unresolved") {
    return { routing: "research_identity", why: "The record could be one opportunity; what it is has not been established, and that is usually cheap to establish." };
  }
  // single_opportunity
  if (id.buyerIdentity === "resolvable") {
    return { routing: "research_identity", why: "One opportunity with an identity gap worth closing before deciding." };
  }
  if (id.buyerIdentity === "unavailable" && id.orgRole === "unresolved") {
    return { routing: "research_identity", why: "One opportunity whose counterparty cannot be named yet. Anonymity is not disqualifying on its own, but it is not ignorable either." };
  }
  return { routing: "qualify", why: "One buyer, one piece of work, identity sufficiently established to assess." };
}

/**
 * Score a proposed identity against a known one.
 *
 * The error classes are kept apart because they are not equally costly and they
 * imply different repairs. A false accept sends a non-opportunity down the whole
 * chain and produces a confident answer about nothing. A false decline deletes
 * real work. A false hold is the cheap failure -- it wastes a research step --
 * and a system tuned to avoid the first two will drift into producing it, which
 * is why it is counted rather than ignored.
 */
export function scoreIdentity(predicted: Partial<RecordIdentity>, gold: RecordIdentity) {
  const kindCorrect = predicted.kind === gold.kind;
  const orgRoleCorrect = predicted.orgRole === gold.orgRole;
  const routingCorrect = predicted.routing === gold.routing;

  const cardinalityCorrect = (() => {
    // Exact counts are not the point; the band is. One versus several is the
    // distinction that changes what happens to the record.
    const band = (n: number | null | undefined) => (n == null ? "unknown" : n <= 1 ? "one" : "many");
    return band(predicted.opportunityCount) === band(gold.opportunityCount);
  })();

  const goldQualifies = gold.routing === "qualify";
  const predQualifies = predicted.routing === "qualify";
  const goldDeclines = gold.routing === "decline";
  const predDeclines = predicted.routing === "decline";
  const predHolds = predicted.routing === "research_identity";
  const goldHolds = gold.routing === "research_identity";

  return {
    kindCorrect, orgRoleCorrect, routingCorrect, cardinalityCorrect,
    falseAccept: predQualifies && !goldQualifies,
    falseDecline: predDeclines && !goldDeclines,
    falseHold: predHolds && !goldHolds,
    /** Sent an aggregate down the chain as though it were one piece of work. */
    cardinalityBlind: gold.kind === "aggregate_listing" && predQualifies,
    /** Threw away a record that had real discovery value. */
    discoveryValueLost: predDeclines && (gold.routing === "decompose" || gold.routing === "keep_as_discovery_source"),
  };
}

export function summariseIdentityRun(rows: Array<ReturnType<typeof scoreIdentity>>) {
  const n = rows.length || 1;
  const rate = (k: keyof ReturnType<typeof scoreIdentity>) => Number((rows.filter((r) => r[k]).length / n).toFixed(3));
  return {
    cases: rows.length,
    kindAccuracy: rate("kindCorrect"),
    orgRoleAccuracy: rate("orgRoleCorrect"),
    cardinalityAccuracy: rate("cardinalityCorrect"),
    routingAccuracy: rate("routingCorrect"),
    falseAcceptRate: rate("falseAccept"),
    falseDeclineRate: rate("falseDecline"),
    falseHoldRate: rate("falseHold"),
    cardinalityBlindCount: rows.filter((r) => r.cardinalityBlind).length,
    discoveryValueLostCount: rows.filter((r) => r.discoveryValueLost).length,
  };
}
