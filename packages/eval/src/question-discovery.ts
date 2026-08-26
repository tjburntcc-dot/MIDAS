/**
 * Question-class discovery.
 *
 * The previous loop asks good questions inside classes someone authored for it.
 * A human still had to notice a missing class. Adding classes one at a time by
 * hand is the thing this is supposed to remove.
 *
 * A system cannot conjure a question class from nothing, and pretending
 * otherwise would be theatre. What it can do is detect the structural traces a
 * missing class leaves behind. Four mechanisms here, each with a real signal:
 *
 *   1. Source-derived questions. A governing document contains obligations,
 *      permissions, exceptions, conditions and definitions. Each is a question
 *      whether or not any generator knows the domain. This is the mechanism that
 *      would have caught the live failure directly: the missed sentence was a
 *      permission, and permissions are now enumerated from the text itself.
 *
 *   2. Coverage-gap detection. Compare the dimensions a decision actually
 *      touches against the dimensions the generated questions address. An
 *      untouched dimension is a candidate missing class, found without anyone
 *      knowing in advance which class was missing.
 *
 *   3. Correction generalisation. When a reviewer or human supplies a missed
 *      question, abstract it away from its instance and test whether the
 *      abstraction fires on unrelated decisions.
 *
 *   4. Cross-domain transfer. A class that earns its place in one domain is
 *      offered to others and kept only where it finds something.
 *
 * Discovery is cheap and promotion is not. A candidate must demonstrate marginal
 * value on decisions it was not derived from, because more questions is not more
 * intelligence: every question spends attention that the important ones need.
 */
import { createHash } from "node:crypto";

// ---------------------------------------------- 1. source-derived questions

/**
 * Structural elements a governing document can contain, independent of domain.
 * A contract, a specification, a regulation and a support ticket all carry
 * some of these, which is why parsing for them generalises where a
 * domain-specific checklist does not.
 */
export const SOURCE_ELEMENTS = ["obligation", "permission", "prohibition", "exception", "condition", "definition", "deadline", "reference"] as const;

const PATTERNS: Array<{ kind: string; re: RegExp; why: string }> = [
  { kind: "obligation", re: /\b(must|shall|is required to|are required to|required|responsible for)\b/i, why: "An obligation is something we may be unable to satisfy, and an unmet one is usually decisive." },
  { kind: "permission", re: /\b(may|permitted|allowed|optional|at (?:their|its|your) discretion|if helpful|if desired|can propose)\b/i, why: "A permission is an option the source is offering. Failing to notice one is how an available path goes unconsidered." },
  { kind: "prohibition", re: /\b(must not|shall not|may not|prohibited|not permitted|will not be considered|ineligible)\b/i, why: "A prohibition can invalidate an approach outright." },
  { kind: "exception", re: /\b(unless|except|notwithstanding|other than|save (?:for|where)|provided that)\b/i, why: "An exception changes the meaning of the rule it attaches to, and is easy to read past." },
  { kind: "condition", re: /\b(if|when|subject to|contingent|conditional|in the event)\b/i, why: "A condition determines whether an obligation or permission actually applies to us." },
  { kind: "definition", re: /\b(means|defined as|refers to|for the purposes of|shall mean)\b/i, why: "A definition can silently change how every later clause reads." },
  { kind: "deadline", re: /\b(by \d|due (?:by|on)|deadline|no later than|within \d+ (?:days|weeks|hours)|closes on)\b/i, why: "A deadline governs feasibility and is often stated once." },
  { kind: "reference", re: /\b(attached|attachment|appendix|exhibit|addendum|amendment|incorporated by reference|see (?:section|schedule))\b/i, why: "Referenced material carries binding terms that are not on the page advertising them." },
];

export interface SourceSegment {
  id: string;
  heading?: string;
  text: string;
}

export interface SourceDerivedQuestion {
  id: string;
  question: string;
  elementKind: string;
  segmentId: string;
  heading?: string;
  excerpt: string;
  whyItMatters: string;
}

/**
 * Read a source's structure and emit a question per structural element found.
 *
 * Deliberately mechanical. It does not try to understand the domain, only to
 * notice that a sentence carries an obligation or a permission, and to insist
 * that someone say what was done about it.
 */
export function questionsFromSource(segments: SourceSegment[]): SourceDerivedQuestion[] {
  const out: SourceDerivedQuestion[] = [];
  for (const seg of segments) {
    const sentences = String(seg.text).split(/(?<=[.;:])\s+/).filter((s) => s.trim().length > 12);
    for (const sentence of sentences) {
      for (const p of PATTERNS) {
        if (!p.re.test(sentence)) continue;
        const excerpt = sentence.trim().slice(0, 220);
        // Keyed on the clause, not on where it was found. Captured documents
        // repeat content across pages and text layers, and raising the same
        // clause five times buries the four clauses raised once.
        const key = p.kind + "|" + excerpt.replace(/\s+/g, "").toLowerCase();
        const id = "SQ-" + createHash("sha256").update(key).digest("hex").slice(0, 8);
        if (out.some((o) => o.id === id)) continue;
        out.push({
          id, elementKind: p.kind, segmentId: seg.id, heading: seg.heading, excerpt,
          question: questionFor(p.kind, seg.heading),
          whyItMatters: p.why,
        });
        break; // one element kind per sentence keeps the output readable
      }
    }
  }
  return out;
}

const QUESTION_BY_KIND = {
  obligation: (w) => "This clause" + w + " imposes an obligation. Can we satisfy it, and what is our evidence?",
  permission: (w) => "This clause" + w + " grants a permission. What exactly does it allow, and have we considered using it?",
  prohibition: (w) => "This clause" + w + " forbids something. Does our intended approach fall within it?",
  exception: (w) => "This clause" + w + " carries an exception. Does it apply to us, and does it change the rule?",
  condition: (w) => "This clause" + w + " is conditional. Is the condition satisfied in our case?",
  definition: (w) => "This clause" + w + " defines a term. Does that definition change how we read the rest?",
  deadline: (w) => "This clause" + w + " states a timing constraint. Is it exact, and can we meet it?",
  reference: (w) => "This clause" + w + " points at other material. Have we retrieved and read it?",
};

function questionFor(kind: string, heading?: string) {
  const where = heading ? " in \"" + heading + "\"" : "";
  const f = (QUESTION_BY_KIND as Record<string, any>)[kind];
  return f ? f(where) : "What does this clause" + where + " require of us?";
}

// ------------------------------------------------ 2. coverage-gap detection

/**
 * Dimensions a decision can touch. Kept coarse on purpose: the point is to
 * notice that a whole area is unaddressed, not to score how well it was covered.
 */
export const DECISION_DIMENSIONS = [
  "objective", "stakeholders", "options", "assumptions", "evidence", "requirements",
  "authority", "claims", "capability", "security", "economics", "competition",
  "dependencies", "professional", "failure", "success", "measurement",
  "disconfirmation", "reversibility", "timing", "data_governance", "downstream_effects",
] as const;

/**
 * Which dimensions a decision actually touches, inferred from its attributes
 * rather than declared. A decision that commits externally touches authority
 * whether or not the caller thought to say so.
 */
export function expectedDimensions(attributes: Record<string, any>): string[] {
  const dims = new Set<string>(["objective", "stakeholders", "options", "assumptions", "failure", "measurement"]);
  if (attributes.governedBySourceDocument) { dims.add("evidence"); dims.add("requirements"); }
  if (attributes.externalCommitment) { dims.add("authority"); dims.add("claims"); }
  if (attributes.technicalBuild) { dims.add("capability"); dims.add("downstream_effects"); }
  if (attributes.handlesPersonalOrSensitiveData) { dims.add("security"); dims.add("data_governance"); }
  if (attributes.capitalAllocation || attributes.pricing) dims.add("economics");
  if (attributes.competitiveAlternativeExists) dims.add("competition");
  if (attributes.dependsOnThirdParty) dims.add("dependencies");
  if (attributes.legalOrRegulatory) dims.add("professional");
  if (attributes.irreversible) dims.add("reversibility");
  if (attributes.timeBounded) dims.add("timing");
  if (attributes.requiresSpecialistExpertise) dims.add("professional");
  if (attributes.recurringOperational) dims.add("downstream_effects");
  return [...dims];
}

export interface CoverageGap {
  dimension: string;
  reason: string;
  candidateClassName: string;
}

/**
 * Compare what the decision touches with what the questions addressed.
 *
 * This finds a missing class without anyone knowing in advance which class was
 * missing, which is the property that matters.
 */
export function detectCoverageGaps(args: { attributes: Record<string, any>; questionCategories: string[]; stakesTier: string }): CoverageGap[] {
  const expected = expectedDimensions(args.attributes);
  const covered = new Set(args.questionCategories);
  return expected
    .filter((d) => !covered.has(d))
    .map((d) => ({
      dimension: d,
      reason: "The decision touches " + d + " but no generated question addressed it.",
      candidateClassName: d + "_questions",
    }));
}

// ------------------------------------------- 3. correction generalisation

export interface MissedQuestion {
  id: string;
  question: string;
  caughtBy: string;
  decisionDomain: string;
  whyItMattered: string;
  economicImportance: string;
}

export interface CandidateClass {
  id: string;
  name: string;
  abstractedQuestion: string;
  derivedFrom: string[];
  triggerAttributes: string[];
  rationale: string;
  origin: string;
  status: string;
}

/**
 * Abstract a missed question away from the instance that produced it.
 *
 * The abstraction is what gets tested, not the original sentence. "Does this solicitation
 * permit phased bids" is worthless as a class; "does the source grant a
 * permission we have not used" fires everywhere.
 */
export function generaliseMissedQuestion(m: MissedQuestion, triggerAttributes: string[]): CandidateClass {
  return {
    id: "CC-" + createHash("sha256").update(m.question).digest("hex").slice(0, 8),
    name: m.question.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 48),
    abstractedQuestion: m.question,
    derivedFrom: [m.id],
    triggerAttributes,
    rationale: m.whyItMattered,
    origin: "correction:" + m.caughtBy,
    status: "candidate",
  };
}

// -------------------------------------------------- 4. promotion discipline

export interface CandidateEvaluation {
  candidateId: string;
  /** Decisions the candidate was NOT derived from. Held-out by construction. */
  testedOnUnseenDecisions: number;
  firedOn: number;
  /** Times it surfaced something no existing question surfaced. */
  novelFindings: number;
  /** Times it duplicated an existing question's territory. */
  redundantFindings: number;
  /** Times it raised a blocker that turned out not to be one. */
  falseBlockers: number;
  addedQuestionsPerDecision: number;
}

/**
 * Promote a candidate question class only on evidence.
 *
 * The failure mode being guarded is a system that grows a question for every
 * mistake ever made and eventually asks two hundred questions about a decision
 * worth four hundred dollars. A class earns its place by finding things nothing
 * else finds, on decisions it was not built from.
 */
export const CLASS_PROMOTION_CRITERIA = {
  minUnseenDecisions: 3,
  minNovelFindings: 2,
  maxRedundancyRatio: 0.5,
  maxFalseBlockers: 1,
  maxAddedQuestionsPerDecision: 4,
  note: "A class must find something new on decisions it was not derived from, without flooding every decision or raising blockers that are not blockers.",
};

export function evaluateCandidate(e: CandidateEvaluation) {
  const redundancyRatio = e.novelFindings + e.redundantFindings > 0
    ? e.redundantFindings / (e.novelFindings + e.redundantFindings)
    : 1;
  const checks = [
    { id: "tested_on_unseen", pass: e.testedOnUnseenDecisions >= CLASS_PROMOTION_CRITERIA.minUnseenDecisions, detail: e.testedOnUnseenDecisions + " unseen decisions" },
    { id: "found_something_new", pass: e.novelFindings >= CLASS_PROMOTION_CRITERIA.minNovelFindings, detail: e.novelFindings + " novel findings" },
    { id: "not_mostly_redundant", pass: redundancyRatio <= CLASS_PROMOTION_CRITERIA.maxRedundancyRatio, detail: "redundancy " + redundancyRatio.toFixed(2) },
    { id: "few_false_blockers", pass: e.falseBlockers <= CLASS_PROMOTION_CRITERIA.maxFalseBlockers, detail: e.falseBlockers + " false blockers" },
    { id: "does_not_flood", pass: e.addedQuestionsPerDecision <= CLASS_PROMOTION_CRITERIA.maxAddedQuestionsPerDecision, detail: e.addedQuestionsPerDecision.toFixed(1) + " questions added per decision" },
  ];
  const promote = checks.every((c) => c.pass);
  return {
    candidateId: e.candidateId, checks, promote,
    verdict: promote ? "promote" : "reject",
    reason: promote
      ? "Earned its place: found things nothing else found, on decisions it was not derived from."
      : "Rejected: " + checks.filter((c) => !c.pass).map((c) => c.id).join(", "),
  };
}

// ------------------------------------------------- value-of-information

/**
 * Whether chasing an unknown is worth it.
 *
 * Stops recursion on economics rather than on a depth counter, so a cheap
 * decision-flipping fact is always pursued and an expensive one that changes
 * nothing never is. Irreversibility raises the bar for proceeding without the
 * answer, because being wrong cannot be undone later.
 */
export function valueOfInformation(args: {
  probabilityItChangesDecision: number;
  economicImpactIfItChanges: number;
  costToObtain: number;
  daysToObtain: number;
  daysAvailable: number | null;
  decisionIsReversible: boolean;
}) {
  const expectedGain = args.probabilityItChangesDecision * args.economicImpactIfItChanges;
  const obtainable = args.daysAvailable == null || args.daysToObtain <= args.daysAvailable;
  const worthIt = expectedGain > args.costToObtain * 3; // a clear margin, not a coin flip
  let ruling: string;
  if (!obtainable) ruling = "cannot_obtain_in_time";
  else if (worthIt) ruling = "pursue";
  else if (!args.decisionIsReversible && args.probabilityItChangesDecision > 0.2) ruling = "pursue_despite_cost_because_irreversible";
  else ruling = "proceed_without";
  return {
    expectedGain: Number(expectedGain.toFixed(2)),
    costToObtain: args.costToObtain,
    obtainable, ruling,
    explanation: ruling === "pursue" ? "Expected gain clears the cost with margin."
      : ruling === "pursue_despite_cost_because_irreversible" ? "The decision cannot be undone, so a material chance of being wrong justifies the cost."
      : ruling === "cannot_obtain_in_time" ? "The answer cannot arrive before the decision must be made; treat as an explicit unknown."
      : "The answer is unlikely to change the decision enough to justify obtaining it.",
  };
}

// -------------------------------------------------- 5. decision-shape validation

/**
 * Every generator keys off declared attributes, which makes the declaration
 * load-bearing in a way that is easy to miss. Under-declare a decision and the
 * relevant generators never fire, and nothing anywhere reports that they did
 * not. The system looks like it asked its questions. It asked the wrong set.
 *
 * So the shape is inferred independently from how the decision is described,
 * and the two are compared. Disagreement is not resolved silently in either
 * direction: it is surfaced, and the union is what gets interrogated.
 */
const SHAPE_SIGNALS: Array<{ attribute: string; re: RegExp; asymmetry: string }> = [
  { attribute: "externalCommitment", re: /\b(propos|bid|quote|submit|contract|agree(?:ment)?|commit|sign|send to|offer|deliver(?:able)? to)\b/i, asymmetry: "A commitment treated as internal skips the authority questions entirely." },
  { attribute: "governedBySourceDocument", re: /\b(solicitation|spec(?:ification)?|terms|policy|statute|regulation|contract|brief|requirements? document|guidelines|tender)\b/i, asymmetry: "Missing this drops every requirement and permission question." },
  { attribute: "technicalBuild", re: /\b(build|implement|develop|migrat|deploy|integrat|architect|code|system|platform)\b/i, asymmetry: "Missing this drops capability and downstream-effect questions." },
  { attribute: "handlesPersonalOrSensitiveData", re: /\b(personal data|pii|customer data|payment|health|financial record|credential|password|member(?:ship)? list)\b/i, asymmetry: "Missing this drops security and data-governance questions on exactly the decisions that need them." },
  { attribute: "capitalAllocation", re: /\b(budget|spend|invest|fund|cost of|allocat|pay for)\b/i, asymmetry: "Missing this drops the economics questions." },
  { attribute: "irreversible", re: /\b(irreversible|permanent|cannot be undone|one-?way|binding|final|delete|destroy|public(?:ly)? (?:post|releas|announc))\b/i, asymmetry: "Missing this drops the reversibility question, which is the cheapest guard that exists." },
  { attribute: "legalOrRegulatory", re: /\b(legal|law|liab|complian|regulat|licens|attorney|counsel|statut|jurisdiction|minor|consent)\b/i, asymmetry: "Missing this drops the question of whether specialist advice is required." },
  { attribute: "dependsOnThirdParty", re: /\b(vendor|third[- ]party|partner|subcontract|supplier|api|provider|depends on|relies on)\b/i, asymmetry: "Missing this drops dependency questions and hides single points of failure." },
  { attribute: "timeBounded", re: /\b(deadline|due|closes|expires|within \d+|no later than|urgent)\b/i, asymmetry: "Missing this drops feasibility questions about the clock." },
  { attribute: "pricing", re: /\b(pric|rate|fee|quote|discount|margin|hourly|retainer)\b/i, asymmetry: "Missing this drops the economics of the offer itself." },
  { attribute: "competitiveAlternativeExists", re: /\b(competitor|other vendors?|alternative|rival|incumbent|competitive|bidders?)\b/i, asymmetry: "Missing this drops the question of why we would be chosen." },
  { attribute: "requiresSpecialistExpertise", re: /\b(specialist|expert|licens|certif|accredit|professional advice|counsel|audit)\b/i, asymmetry: "Missing this drops the question of whether we are qualified at all." },
];

export interface ShapeValidation {
  inferred: Record<string, boolean>;
  agreements: string[];
  /** Inferred true, declared false or absent. The dangerous direction. */
  underDeclared: Array<{ attribute: string; evidence: string; consequence: string }>;
  /** Declared true, no textual support. Wasteful, not dangerous. */
  overDeclared: string[];
  /** What should actually be interrogated: the union. */
  reconciled: Record<string, boolean>;
  ruling: string;
}

/**
 * Infer a decision's shape from its own description and compare with what was
 * declared.
 *
 * The two error directions are not symmetric, and the output says so.
 * Over-declaring buys questions that were not needed. Under-declaring removes
 * questions nobody will notice are gone, so it is reported as a finding with the
 * consequence attached rather than as a mismatch count.
 */
export function validateDecisionShape(args: { declared: Record<string, any>; descriptionText: string }): ShapeValidation {
  const text = String(args.descriptionText);
  const inferred: Record<string, boolean> = {};
  const evidence: Record<string, string> = {};
  for (const s of SHAPE_SIGNALS) {
    const m = text.match(s.re);
    if (m) {
      inferred[s.attribute] = true;
      const at = Math.max(0, (m.index ?? 0) - 40);
      evidence[s.attribute] = "..." + text.slice(at, (m.index ?? 0) + m[0].length + 40).trim() + "...";
    }
  }
  const agreements: string[] = [];
  const underDeclared: ShapeValidation["underDeclared"] = [];
  for (const s of SHAPE_SIGNALS) {
    const d = args.declared[s.attribute] === true;
    const i = inferred[s.attribute] === true;
    if (d && i) agreements.push(s.attribute);
    else if (i && !d) underDeclared.push({ attribute: s.attribute, evidence: evidence[s.attribute], consequence: s.asymmetry });
  }
  const overDeclared = SHAPE_SIGNALS
    .filter((s) => args.declared[s.attribute] === true && inferred[s.attribute] !== true)
    .map((s) => s.attribute);

  const reconciled: Record<string, boolean> = { ...args.declared };
  for (const u of underDeclared) reconciled[u.attribute] = true;

  return {
    inferred, agreements, underDeclared, overDeclared, reconciled,
    ruling: underDeclared.length === 0
      ? "Declared shape is consistent with the description; interrogating as declared."
      : "Declared shape omits " + underDeclared.length + " attribute(s) the description supports. Interrogating the union, not the declaration.",
  };
}

// ---------------------------------------------------- 6. unknown-unknown probes

/**
 * Probes aimed at the space outside the question set.
 *
 * These do not ask about the decision. They ask about the analysis, which is the
 * only angle from which an unasked question is visible from the inside. They are
 * expensive to answer honestly and are therefore gated to decisions where being
 * wrong is costly.
 */
export const UNKNOWN_UNKNOWN_PROBES = [
  { id: "UU-1", probe: "If someone who has done this fifty times read our analysis, what would they be surprised we did not ask?", why: "Experience is largely a library of question classes. Borrowing it is cheaper than acquiring it." },
  { id: "UU-2", probe: "Which parts of the source did we read once and never return to, and why did we not return?", why: "Attention, not evidence, is usually what was missing. The failure that produced this loop was of exactly this kind." },
  { id: "UU-3", probe: "What is the strongest version of the opposite conclusion, and what question would someone holding it ask first?", why: "An opposing position generates questions our own framing structurally cannot." },
  { id: "UU-4", probe: "Which of our answers came from the decision's own framing rather than from evidence?", why: "A framing inherited from the counterparty carries their assumptions unexamined." },
  { id: "UU-5", probe: "What did we decide was out of scope, and who decided that?", why: "Scope decisions are made early, quietly, and are rarely revisited." },
  { id: "UU-6", probe: "If this goes badly, what will the post-mortem say was obvious?", why: "Hindsight questions are available in advance; they are just not prompted for." },
  { id: "UU-7", probe: "What would we need to be true about ourselves for this to work, and have we checked it rather than assumed it?", why: "Self-assessment is the evidence class least likely to have been gathered." },
];

export function probesFor(stakesTier: string) {
  const order = ["routine", "standard", "elevated", "high", "critical"];
  const idx = order.indexOf(stakesTier);
  if (idx <= 0) return [];
  if (idx === 1) return UNKNOWN_UNKNOWN_PROBES.slice(0, 2);
  if (idx === 2) return UNKNOWN_UNKNOWN_PROBES.slice(0, 4);
  return UNKNOWN_UNKNOWN_PROBES;
}
