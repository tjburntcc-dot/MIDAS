/**
 * The reasoning procedure the Qualifier follows before it routes anything.
 *
 * Three cycles narrowed the Qualification defect from "unstable" to three
 * specific ordering errors, and none of them is a knowledge gap. The worker
 * knows what the records are. It answers the right questions in the wrong order,
 * and it has no way to resolve two rules that both apply.
 *
 *   Counterparty. A staffing firm that signs and pays was read as a job for its
 *   unnamed end client, so the worker held for an identity that was never the
 *   counterparty. The routing rule it applied was correct and it applied it to
 *   the wrong entity.
 *
 *   Counting before commerciality. Twelve freelancer profiles decomposed as
 *   twelve opportunities. Forty-one articles routed three different ways in
 *   three repeats. A marketplace's own front page decomposed. The plurality
 *   signal is louder than the commerciality signal, and stating the rule in
 *   prose did not reverse the ordering.
 *
 *   No precedence. A peer agency's services page satisfies "names a real
 *   organisation, keep it" and "nobody here is buying, decline it" equally, and
 *   the previous policy gave no way to choose. That was my defect, not the
 *   worker's.
 *
 * So this module is an order, not an ontology. Two small vocabularies and a
 * precedence ladder, added because the evidence demanded each one. It does not
 * name a website, a platform, or any record in any evaluation set.
 */

/**
 * Who would actually be on the other side of the transaction.
 *
 * The distinction that matters is contracting, not benefiting. An agency that
 * signs and pays is a counterparty whether or not we ever learn who the work is
 * ultimately for; an end client who never contracts with us is not one however
 * clearly it is named.
 */
export const COUNTERPARTY_ROLES = [
  "direct_buyer",              // requests the work, contracts, and pays
  "contracting_intermediary",  // contracts and pays, serves an end client
  "referring_intermediary",    // passes work along, would not itself contract
  "beneficiary_only",          // receives the work, does not contract or pay
  "platform_host",             // hosts the record, not party to the transaction
  "aggregator_source",         // collected the record from somewhere else
  "no_counterparty",           // nobody in the record would transact at all
  "unresolved",                // a counterparty exists and cannot yet be named
] as const;

/**
 * What the record is commercially, decided before anything is counted.
 *
 * The three middle values carry the whole defect. A record can hold work, hold
 * routes to work, or hold neither, and the number of visible objects is
 * evidence for none of those.
 */
export const COMMERCIALITY = [
  "direct_work",           // a concrete request for a piece of work
  "contains_child_work",   // enumerates or represents specific pieces of work
  "enables_discovery",     // holds no specific work, is a real route to work
  "supplier_marketing",    // someone selling what we sell
  "editorial",             // informational or opinion content
  "profile_content",       // people or organisations described, none requesting work
  "no_commercial_content",
  "unresolved",
] as const;

export interface ProcedureAssessment {
  counterpartyRole: string;
  /** True when the contracting party is identified well enough to transact. */
  counterpartyEstablished: boolean;
  commerciality: string;
  kind: string;
  opportunityCount: number | null;
  buyerCount: number | null;
  orgRole: string;
  buyerIdentity: string;
  routing: string;
  reasoning: string;
}

/**
 * The precedence ladder, in order. The first rule that fires decides.
 *
 * Ordering is the product here, so it is stated as data rather than buried in
 * branches: a reader can check that commerciality is asked before cardinality by
 * reading the list, and a test can assert it.
 */
export const PRECEDENCE = [
  {
    id: "P1_unresolved_commerciality",
    rule: "If it cannot yet be established whether the record involves any commercial work, establish that first. Nothing below can be decided without it.",
  },
  {
    id: "P2_no_work_no_route",
    rule: "A record holding no work and offering no route to work is declined, however many objects it displays. Object count is not evidence of commercial content.",
  },
  {
    id: "P3_route_beats_absence_of_a_buyer",
    rule: "A record holding no work today but offering a real route to work is kept as a discovery source. Having no buyer today does not make a record worthless; declining requires both no work and no route.",
  },
  {
    id: "P4_child_work_decomposes",
    rule: "A record that enumerates or represents specific pieces of work is decomposed into them. How many is a separate question, and an unknown total is neither a reason to treat the record as one thing nor a reason to discard it.",
  },
  {
    id: "P5_contracting_party_decides",
    rule: "For a record that is itself one piece of work, the established contracting party decides. An unnamed beneficiary behind an established counterparty is not a reason to hold.",
  },
  {
    id: "P6_material_identity_gap",
    rule: "Hold only when the missing party is the one we would contract with, and only when finding out would change the decision.",
  },
] as const;

/**
 * Route a completed assessment.
 *
 * Deliberately keyed on commerciality and counterparty rather than on record
 * kind. The kind vocabulary still describes the record and is still scored, but
 * it is no longer what decides, because "what shape is this page" was exactly
 * the question the worker could answer correctly while routing wrongly.
 */
export function routeByProcedure(a: Pick<ProcedureAssessment, "counterpartyRole" | "counterpartyEstablished" | "commerciality" | "opportunityCount">) {
  if (a.commerciality === "unresolved") {
    return { routing: "research_identity", rule: "P1_unresolved_commerciality" };
  }
  const holdsWork = a.commerciality === "direct_work" || a.commerciality === "contains_child_work";
  if (!holdsWork) {
    const route = a.commerciality === "enables_discovery";
    return route
      ? { routing: "keep_as_discovery_source", rule: "P3_route_beats_absence_of_a_buyer" }
      : { routing: "decline", rule: "P2_no_work_no_route" };
  }
  if (a.commerciality === "contains_child_work") {
    // Cardinality is asked here and only here, and it cannot change the answer.
    // An unknown total previously demoted a correctly-identified aggregate.
    return { routing: "decompose", rule: "P4_child_work_decomposes" };
  }
  if (a.counterpartyEstablished) {
    return { routing: "qualify", rule: "P5_contracting_party_decides" };
  }
  return { routing: "research_identity", rule: "P6_material_identity_gap" };
}

/**
 * Whether a counterparty role can be treated as established.
 *
 * A beneficiary or a referrer is never the counterparty, so naming one of those
 * clearly does not establish anything. This is the rule that the staffing-firm
 * case needed and did not have.
 */
export function counterpartyIsTransactable(role: string) {
  return role === "direct_buyer" || role === "contracting_intermediary";
}

/** The procedure as the worker receives it. An order of questions, not facts about the world. */
export const PROCEDURE_TEXT = [
  "Assess the record in this order. Each step is answered before the next is asked.",
  "",
  "1. COUNTERPARTY. Who would sign and who would pay? That party is the counterparty. Someone who merely receives the work, refers it onward, or hosts the record is not. An end client whose name is withheld behind a counterparty that would itself contract and pay does not make the counterparty unknown.",
  "2. COMMERCIALITY. Before counting anything, decide what the record is commercially: a concrete request for work; a record that enumerates specific pieces of work; a record holding no specific work but offering a real route to it; marketing by someone selling what we sell; editorial content; profiles of people or organisations; or nothing commercial at all.",
  "3. IDENTITY. Say what kind of object the record is and what the named organisation is to the transaction.",
  "4. CARDINALITY. Only now, count opportunities and buyers separately. Count only things established in step 2 to be work. Visible objects are not opportunities: profiles, articles and search hits are objects. If a total is not stated, report it as unknown; never supply a number the record does not support.",
  "5. ROUTING. Route on the answers above.",
  "",
  "PRECEDENCE, where more than one rule applies:",
  ...PRECEDENCE.map((p) => "- " + p.rule),
].join("\n");

/**
 * Scoring for the competencies the procedure adds.
 *
 * Kept separate from the routing score because a worker can route correctly for
 * the wrong reason, and a procedure that produces right answers from wrong
 * intermediate judgements has not been repaired.
 */
export function scoreProcedure(
  predicted: Partial<ProcedureAssessment>,
  gold: ProcedureAssessment,
  record: string,
) {
  const unknownCount = gold.opportunityCount == null;
  const inventedCount = unknownCount && predicted.opportunityCount != null && predicted.opportunityCount > 1;
  // A buyer identity is invented when the worker calls it established on a
  // record whose gold says it is not available at all.
  const inventedIdentity = gold.buyerIdentity === "unavailable" && predicted.buyerIdentity === "established";
  return {
    counterpartyCorrect: predicted.counterpartyRole === gold.counterpartyRole,
    commercialityCorrect: predicted.commerciality === gold.commerciality,
    inventedCount,
    inventedIdentity,
    unknownCase: unknownCount,
    /** Honest when the record states no total and the worker says so. */
    unknownHonest: unknownCount ? predicted.opportunityCount == null || predicted.opportunityCount === 0 : null,
    decomposeCase: gold.routing === "decompose",
    decomposeCorrect: gold.routing === "decompose" ? predicted.routing === "decompose" : null,
    discoveryCase: gold.routing === "keep_as_discovery_source",
    discoveryPreserved: gold.routing === "keep_as_discovery_source" ? predicted.routing !== "decline" : null,
  };
}

export function summariseProcedureRun(rows: Array<ReturnType<typeof scoreProcedure>>) {
  const n = rows.length || 1;
  const rate = (pred: (r: any) => boolean) => Number((rows.filter(pred).length / n).toFixed(3));
  const subsetRate = (flag: string, ok: string) => {
    const sub = rows.filter((r: any) => r[flag]);
    return sub.length ? Number((sub.filter((r: any) => r[ok]).length / sub.length).toFixed(3)) : null;
  };
  return {
    counterpartyAccuracy: rate((r) => r.counterpartyCorrect),
    commercialityAccuracy: rate((r) => r.commercialityCorrect),
    inventedCountCount: rows.filter((r) => r.inventedCount).length,
    inventedIdentityCount: rows.filter((r) => r.inventedIdentity).length,
    unknownCardinalityHonesty: subsetRate("unknownCase", "unknownHonest"),
    decompositionAccuracy: subsetRate("decomposeCase", "decomposeCorrect"),
    discoverySourcePreservation: subsetRate("discoveryCase", "discoveryPreserved"),
  };
}

/**
 * Compare two accuracies against a declared margin.
 *
 * Written after a gate failed on floating point rather than on evidence. The
 * candidate beat its control by exactly three cases in thirty; the criterion
 * required 0.10; and `0.867 - 0.767` is `0.09999999999999998`, so the check
 * reported FAIL at a detail line reading "0.100". The threshold was never the
 * problem and is unchanged.
 *
 * Both inputs are already rounded to three places when they reach here, so the
 * difference is rounded to the same precision before comparison rather than
 * compared with a tolerance invented for the occasion.
 */
export function meetsMargin(candidate: number, control: number, required: number) {
  const margin = Number((candidate - control).toFixed(3));
  return { margin, meets: margin >= required };
}
