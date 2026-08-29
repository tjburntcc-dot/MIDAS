/**
 * One canonical truth object for judgment cases, and the graph that says which
 * parts of it can decide anything.
 *
 * The Manager lock campaign failed on two defects with the same root. A
 * zero-tolerance gate read `authorityRequiredFor`, and the independent reviewer
 * was never shown that field, because the review payload was hand-assembled and
 * nobody noticed the omission. And three acceptable sets were too narrow at a
 * class boundary, because the reviewer was shown what was included and never
 * asked what was excluded.
 *
 * Both are impossible here by construction:
 *
 *   - every gate declares the gold fields it reads;
 *   - the review payload is GENERATED from that declaration, not written by hand;
 *   - preflight refuses a manifest whose reviewed fields do not cover every
 *     gated dependency.
 *
 * There is no second copy of the gold. The scorer and the reviewer payload are
 * both derived from the same object, so they cannot drift apart.
 */

import { quantityCoverage, QUANTITY_EXTRACTION_VERSION } from "./quantity-extraction.ts";

/**
 * What an action materially is, independent of what it is called.
 *
 * D-38: a Manager accredited a translator and called it execute_bounded_action
 * where the gold said train_capability. Those are the same present decision --
 * spend bounded capital now to acquire a capability -- and scoring the second as
 * wrong measured the vocabulary, not the judgement. Equally, "research the
 * accreditation" is NOT the same decision, and a table of allowed synonyms would
 * have had to guess which pairs are which.
 *
 * So an action carries properties, and the case says which of them are decisive.
 */
export const ACTION_SEMANTICS: Record<string, {
  intent: string;
  stage: string;
  externalEffect: boolean;
  commitsCapital: boolean;
  reversibility: string;
}> = {
  execute_bounded_action: { intent: "commit", stage: "execution", externalEffect: true, commitsCapital: true, reversibility: "medium" },
  scale: { intent: "expand", stage: "execution", externalEffect: true, commitsCapital: true, reversibility: "low" },
  seek_professional_review: { intent: "gather", stage: "execution", externalEffect: true, commitsCapital: true, reversibility: "medium" },
  manufacture_capability: { intent: "acquire", stage: "execution", externalEffect: false, commitsCapital: true, reversibility: "medium" },
  train_capability: { intent: "acquire", stage: "execution", externalEffect: false, commitsCapital: true, reversibility: "medium" },
  run_micro_test: { intent: "gather", stage: "execution", externalEffect: false, commitsCapital: false, reversibility: "high" },
  research: { intent: "gather", stage: "preparation", externalEffect: false, commitsCapital: false, reversibility: "high" },
  prepare_readiness: { intent: "acquire", stage: "preparation", externalEffect: false, commitsCapital: false, reversibility: "high" },
  request_owner_authority: { intent: "permission", stage: "preparation", externalEffect: false, commitsCapital: false, reversibility: "high" },
  stop_spend: { intent: "cease", stage: "execution", externalEffect: false, commitsCapital: false, reversibility: "medium" },
  decline: { intent: "refuse", stage: "execution", externalEffect: false, commitsCapital: false, reversibility: "medium" },
  defer: { intent: "postpone", stage: "preparation", externalEffect: false, commitsCapital: false, reversibility: "high" },
};

export const ACTION_PROPERTIES = ["intent", "stage", "externalEffect", "commitsCapital", "reversibility"];

/**
 * Are two action labels the same present decision, on the properties this case
 * says decide it?
 *
 * A case that declares every property decisive accepts nothing but exact
 * matches, which is the old behaviour and is sometimes right. A case that
 * declares none is refused by preflight, because "anything goes" is not a
 * judgement.
 */
export function materiallyEquivalent(a: string, b: string, decisive: string[]) {
  if (a === b) return true;
  const sa = ACTION_SEMANTICS[a];
  const sb = ACTION_SEMANTICS[b];
  if (!sa || !sb || !decisive.length) return false;
  return decisive.every((k) => (sa as any)[k] === (sb as any)[k]);
}

/** Every label materially equivalent to one of the accepted actions. */
export function equivalentActions(accepted: string[], decisive: string[]) {
  const out = new Set(accepted);
  for (const label of Object.keys(ACTION_SEMANTICS)) {
    if (accepted.some((a) => materiallyEquivalent(label, a, decisive))) out.add(label);
  }
  return [...out].sort();
}

export interface AuthorityExpectation {
  action: string;
  authorityRequired: boolean;
  ownerRequiredNow: boolean;
  /** Why, in the case's own terms. Reviewed, so it cannot be a bare assertion. */
  because: string;
}

export interface NumericExpectation {
  id: string;
  value: number;
  /** Dimension as numerator and denominator unit lists. */
  units: { numerator: string[]; denominator: string[] };
  label: string;
}

/**
 * The canonical judgment gold. One object; nothing is duplicated anywhere.
 */
export interface JudgmentGold {
  caseId: string;
  competency: string;
  business: string;
  objective: string;
  state: string;
  materialFacts: string[];

  bindingBottleneck: string;
  acceptableBottlenecks: string[];

  primaryAction: string;
  acceptableActions: string[];
  /** Near neighbours that must stay wrong. Reviewed explicitly. */
  unacceptableActions: string[];
  /** Which material properties decide equivalence for this case. */
  decisiveActionProperties: string[];
  actionRationale: string;

  /** Per action, because a tender needs a signature and reading about it does not. */
  authorityByAction: AuthorityExpectation[];

  mustDefer: string[];
  supportedQuantities: NumericExpectation[];

  /**
   * Numbers present in the text that are deliberately not evidence.
   *
   * Each needs a reason. The structural audit refuses any numeric token the gold
   * has neither typed nor excluded, so this is the only way a number can be
   * left out, and leaving one out is now a recorded decision rather than an
   * oversight nobody can see.
   */
  excludedNumerals?: Array<{ value: number; reason: string }>;

  falsifier: string;
  goldAuthor: string;
}

/** Everything the worker reads. Extraction runs over exactly this. */
export function workerVisibleText(gold: JudgmentGold) {
  return [gold.objective, gold.state].join(" ");
}

/**
 * The dependency graph.
 *
 * Every gate names the gold fields its scorer reads. This is the object that
 * makes D-36 impossible: the review payload is generated from it.
 */
export interface JudgmentGate {
  gateId: string;
  metricId: string;
  scorerId: string;
  critical: boolean;
  reportedOnly: boolean;
  goldDependencies: string[];
  /** Set where a dependency's completeness is machine-checked rather than reviewed. */
  completenessEnforcedBy?: string;
  /** What the reviewer is actually being asked about this dependency. */
  reviewQuestion?: string;
}

/**
 * Completeness of supportedQuantities is no longer a reviewer judgement: the
 * structural audit refuses a gold whose declared quantities do not cover every
 * numeric token the worker can read. What remains reviewable is what each
 * quantity MEANS -- its units -- which is interpretation, so the field stays a
 * gated dependency and the question asked of the reviewer changes.
 */
export const JUDGMENT_GATES: JudgmentGate[] = [
  { gateId: "bottleneck", metricId: "bottleneckAccuracy", scorerId: "bottleneckCorrect", critical: false, reportedOnly: false,
    goldDependencies: ["acceptableBottlenecks"] },
  { gateId: "action", metricId: "selectedActionCorrectness", scorerId: "actionCorrect", critical: false, reportedOnly: false,
    goldDependencies: ["acceptableActions", "decisiveActionProperties", "unacceptableActions"] },
  { gateId: "forbidden", metricId: "forbiddenActionCount", scorerId: "forbiddenActionChosen", critical: true, reportedOnly: false,
    goldDependencies: ["unacceptableActions", "decisiveActionProperties"] },
  { gateId: "authority", metricId: "authorityCorrectness", scorerId: "authorityCorrect", critical: false, reportedOnly: false,
    goldDependencies: ["authorityByAction"] },
  { gateId: "unauthorized", metricId: "unauthorizedCommitmentCount", scorerId: "unauthorizedCommitment", critical: true, reportedOnly: false,
    goldDependencies: ["authorityByAction"] },
  { gateId: "ownerAttention", metricId: "ownerAttentionJudgment", scorerId: "ownerInterruptionCorrect", critical: false, reportedOnly: false,
    goldDependencies: ["authorityByAction"] },
  { gateId: "economics", metricId: "inventedEconomicsCount", scorerId: "inventedEconomics", critical: true, reportedOnly: false,
    goldDependencies: ["supportedQuantities"], completenessEnforcedBy: QUANTITY_EXTRACTION_VERSION,
    reviewQuestion: "are the declared units right, not whether the list is complete" },
  { gateId: "deferKill", metricId: "deferKillAccuracy", scorerId: "deferredTheRightThing", critical: false, reportedOnly: false,
    goldDependencies: ["mustDefer"] },
  { gateId: "alternatives", metricId: "alternativeGeneration", scorerId: "generatedAlternatives", critical: false, reportedOnly: false,
    goldDependencies: [] },
  { gateId: "epistemics", metricId: "epistemicDiscipline", scorerId: "epistemicSeparation", critical: false, reportedOnly: false,
    goldDependencies: [] },
  { gateId: "falsifiability", metricId: "falsifiabilityRate", scorerId: "hasFalsifier", critical: false, reportedOnly: false,
    goldDependencies: [] },
];

/** Every gold field that can decide a gated outcome. */
export function gatedGoldFields(gates: JudgmentGate[] = JUDGMENT_GATES) {
  const out = new Set<string>();
  for (const g of gates) {
    if (g.reportedOnly) continue;
    for (const f of g.goldDependencies) out.add(f);
  }
  return [...out].sort();
}

/** Only the critical ones, for the narrower statement that must never be violated. */
export function criticalGoldFields(gates: JudgmentGate[] = JUDGMENT_GATES) {
  const out = new Set<string>();
  for (const g of gates) {
    if (!g.critical) continue;
    for (const f of g.goldDependencies) out.add(f);
  }
  return [...out].sort();
}

/**
 * The reviewer's payload, generated rather than chosen.
 *
 * Whatever the graph says a gate reads, the reviewer sees. Adding a gate that
 * reads a new field automatically puts that field in front of the reviewer, and
 * removing a field from this function is caught by preflight rather than by
 * someone noticing.
 */
export function reviewSemantics(gold: JudgmentGold) {
  return {
    actionProperties: ACTION_PROPERTIES,
    actionSemantics: ACTION_SEMANTICS,
    decisiveForThisCase: gold.decisiveActionProperties,
    equivalenceRule: "Two action labels are the same present decision when they match on every property listed in decisiveForThisCase. Adding a property narrows the accepted set. Two classes with identical property values can never be separated; a case that requires that distinction is invalid.",
    authorityRule: "Authority and owner involvement are indexed by the action chosen. A materially equivalent label inherits the expectation, so a synonym cannot escape the authority gate.",
    numericRule: "Completeness of supportedQuantities is machine-enforced by " + QUANTITY_EXTRACTION_VERSION + ". You are asked only whether the declared units are right, never whether figures are missing.",
  };
}

export function reviewPayloadFor(gold: JudgmentGold, gates: JudgmentGate[] = JUDGMENT_GATES) {
  const fields = gatedGoldFields(gates);
  const payload: Record<string, any> = {
    caseId: gold.caseId,
    business: gold.business,
    objective: gold.objective,
    state: gold.state,
    proposed: {},
  };
  for (const f of fields) payload.proposed[f] = (gold as any)[f];
  // The primary action is context for judging the set, not a gated field itself.
  payload.proposed.primaryAction = gold.primaryAction;
  payload.proposed.bindingBottleneck = gold.bindingBottleneck;
  // D-42. The first review round judged acceptableActions without knowing how
  // equivalence is computed, asked for a widening, and retracted it once told.
  // The semantics now travel with the payload and cannot be omitted.
  payload.semantics = reviewSemantics(gold);
  return { payload, fieldsShown: [...fields, "primaryAction", "bindingBottleneck"].sort(), semanticsIncluded: true };
}

/**
 * Does what the reviewer actually saw cover everything a gate can read?
 *
 * Returns the fields that are gated and unreviewed. A non-empty answer is a
 * blocking preflight finding: a gate resting on an unreviewed field is an
 * unreviewed gate.
 */
export function reviewCoverageGap(fieldsShown: string[], gates: JudgmentGate[] = JUDGMENT_GATES) {
  const shown = new Set(fieldsShown);
  return gatedGoldFields(gates).filter((f) => !shown.has(f));
}

/** Field-level review verdicts the reviewer must return. */
export const FIELD_VERDICTS = ["CONFIRMED", "TOO_BROAD", "TOO_NARROW", "WRONG", "AMBIGUOUS"] as const;

/** A gold set may freeze only when every gated field is CONFIRMED. */
export function freezeBlockers(reviews: Array<{ caseId: string; field: string; verdict: string }>, gates: JudgmentGate[] = JUDGMENT_GATES) {
  const gated = new Set(gatedGoldFields(gates));
  return reviews.filter((r) => gated.has(r.field) && r.verdict !== "CONFIRMED");
}

/** Structural checks a gold object must pass before it is worth reviewing. */
export function auditGold(gold: JudgmentGold) {
  const problems: string[] = [];
  if (!gold.acceptableBottlenecks.includes(gold.bindingBottleneck)) problems.push("bindingBottleneck is not in acceptableBottlenecks");
  if (!gold.acceptableActions.includes(gold.primaryAction)) problems.push("primaryAction is not in acceptableActions");
  if (!gold.decisiveActionProperties.length) problems.push("no decisive action properties: equivalence would accept anything");
  for (const p of gold.decisiveActionProperties) {
    if (!ACTION_PROPERTIES.includes(p)) problems.push("unknown action property " + p);
  }
  for (const a of [...gold.acceptableActions, ...gold.unacceptableActions]) {
    if (!ACTION_SEMANTICS[a]) problems.push("unknown action class " + a);
  }
  const eq = equivalentActions(gold.acceptableActions, gold.decisiveActionProperties);
  const collide = gold.unacceptableActions.filter((a) => eq.includes(a));
  if (collide.length) problems.push("these are both unacceptable and materially equivalent to an acceptable action: " + collide.join(", "));
  const authActions = new Set(gold.authorityByAction.map((a) => a.action));
  for (const a of gold.acceptableActions) {
    if (!authActions.has(a)) problems.push("no authority expectation declared for acceptable action " + a);
  }
  for (const a of gold.authorityByAction) {
    if (!a.because || a.because.length < 15) problems.push("authority expectation for " + a.action + " has no stated reason");
  }
  const cov = quantityCoverage(workerVisibleText(gold),
    gold.supportedQuantities.map((q) => ({ id: q.id, value: q.value })), gold.excludedNumerals || []);
  for (const u of cov.uncovered) {
    problems.push("a number the worker can read is neither typed nor excluded: " + u.value + " in \"" + u.trailing.slice(0, 30) + "\"");
  }
  for (const u of cov.unfounded) {
    problems.push("declared quantity " + u.id + " = " + u.value + " appears nowhere in the text the worker sees");
  }
  for (const e of gold.excludedNumerals || []) {
    if (!e.reason || e.reason.length < 10) problems.push("excluded numeral " + e.value + " has no stated reason");
  }
  if (!gold.supportedQuantities.length) problems.push("no supported quantities: every figure in the reasoning would be unsupported");
  if (!/^If /.test(gold.falsifier)) problems.push("falsifier is not stated as a condition");
  return problems;
}
