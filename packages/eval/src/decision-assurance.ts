/**
 * Decision assurance loop.
 *
 * Built in response to a specific failure whose shape matters more than the
 * instance. On a live pursuit the system captured a sentence in a solicitation
 * permitting phased proposals, never used it, and produced a verdict that an
 * outside reviewer overturned. The evidence was present. The question was not
 * asked.
 *
 * The first repair was to add option enumeration. That was too narrow: it fixed
 * the one question that happened to be missed rather than the absence of a
 * mechanism that generates questions. A system patched one question at a time
 * needs a human to supply each new question, which is the thing this is supposed
 * to remove.
 *
 * So the loop inverts the order. Questions are generated from the shape of the
 * decision before any answer is formed, and a verdict is refused unless the
 * stages the stakes demand have actually run. Refusing the verdict is the point:
 * an analysis that skipped disconfirmation can still be fluent and confident, and
 * fluency is exactly what made the original miss hard to notice.
 *
 * General. No industry, buyer, amount, document format or company appears here.
 */

// ------------------------------------------------------------ decision

/**
 * Attributes of a decision. Question generation keys off these rather than off
 * a domain name, so an unfamiliar domain still produces relevant questions as
 * long as its shape is described honestly.
 */
export interface DecisionDescriptor {
  id: string;
  question: string;
  domain: string;
  /** Who lives with the consequence. Absence of a named party is itself a finding. */
  stakeholders?: string[];
  attributes: {
    externalCommitment?: boolean;
    governedBySourceDocument?: boolean;
    technicalBuild?: boolean;
    handlesPersonalOrSensitiveData?: boolean;
    capitalAllocation?: boolean;
    hiringOrTeamDesign?: boolean;
    irreversible?: boolean;
    competitiveAlternativeExists?: boolean;
    dependsOnThirdParty?: boolean;
    recurringOperational?: boolean;
    legalOrRegulatory?: boolean;
    pricing?: boolean;
    timeBounded?: boolean;
    requiresSpecialistExpertise?: boolean;
  };
  stakesTier: string;
}

export interface GeneratedQuestion {
  id: string;
  question: string;
  category: string;
  /** Why the answer changes what we do. A question that changes nothing is noise. */
  whyItMatters: string;
  generator: string;
  /** Questions that only exist because a parent question was answered a certain way. */
  parentId?: string;
  depth: number;
}

type Generator = {
  id: string;
  /** Cheapest stakes tier at which this generator earns its cost. */
  minStakes?: string;
  applies: (d: DecisionDescriptor) => boolean;
  emit: (d: DecisionDescriptor) => Array<{ q: string; category: string; why: string }>;
};

const TIER_ORDER = ["routine", "standard", "elevated", "high", "critical"];
function meetsStakes(min: string | undefined, tier: string) {
  if (!min) return true;
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min);
}

/**
 * The subject of the decision, used to phrase questions about the actual thing
 * rather than about decisions in general. A question that names what is being
 * decided is answerable; the same question in the abstract invites a restatement
 * of the decision back at the reader.
 */
function subject(d: DecisionDescriptor) {
  return d.domain.replace(/_/g, " ");
}

/**
 * Generators, not a checklist.
 *
 * Each fires only when the decision has the shape it addresses, so a pricing
 * decision and a hiring decision produce genuinely different question sets
 * rather than the same list with different nouns.
 */
const GENERATORS: Generator[] = [
  {
    id: "objective",
    applies: () => true,
    emit: (d) => [
      { q: "What outcome should this " + subject(d) + " decision produce, stated so it can be verified later?", category: "objective", why: "A decision optimised against a vague objective optimises against nothing." },
      { q: "What would make this " + subject(d) + " decision clearly wrong in hindsight?", category: "objective", why: "Failure conditions defined afterwards are rationalisations." },
      { q: "Which of these parties bears the cost if this is wrong: " + ((d.stakeholders || ["unnamed"]).join(", ")) + "? Have they been consulted?", category: "stakeholders", why: "A decision whose cost lands on someone absent from it is a governance failure." },
    ],
  },
  {
    id: "source_completeness",
    applies: (d) => d.attributes.governedBySourceDocument === true,
    emit: () => [
      { q: "Have we read the authoritative source in full, rather than a summary, listing, or excerpt?", category: "evidence", why: "Summaries omit the constraints that decide the answer." },
      { q: "What does the source permit that we have not considered doing?", category: "options", why: "This is the question whose absence produced a wrong verdict on a live pursuit: the permission was in the captured text and was never turned into an option." },
      { q: "What does the source require that we have not confirmed we can satisfy?", category: "requirements", why: "An unmet mandatory requirement is decisive and cheap to check." },
      { q: "Which requirements are thresholds and which are scored preferences? What is the exact wording?", category: "requirements", why: "Treating a scored preference as a threshold rejects viable options; the reverse submits ineligible ones." },
      { q: "Are there attachments, amendments, addenda or linked documents we have not retrieved?", category: "evidence", why: "The governing terms are often not on the page that advertises them." },
      { q: "What does the source leave silent, and are we treating that silence as permission?", category: "evidence", why: "Silence is not permission, and assuming otherwise invents a path that does not exist." },
    ],
  },
  {
    id: "options",
    applies: () => true,
    emit: (d) => [
      { q: "What are the materially distinct legitimate ways to approach this " + subject(d) + " decision, including narrower and staged ones?", category: "options", why: "Rejecting the obvious option is not the same as there being no option." },
      { q: "For each option, is it permitted, feasible, and economically worthwhile, separately?", category: "options", why: "These fail independently and collapsing them hides which one actually binds." },
      ...(d.attributes.irreversible ? [{ q: "What is the reversible version of this " + subject(d) + " decision, and is it available?", category: "reversibility", why: "A reversible option with slightly lower expected value is usually better under uncertainty, and this decision is marked irreversible." }] : []),
      { q: "What does not acting on " + subject(d) + " cost, and is that the best option?", category: "options", why: "Declining is a legitimate outcome and must be compared, not assumed away." },
    ],
  },
  {
    id: "assumptions",
    applies: () => true,
    emit: (d) => [
      { q: "What must be true for our preferred " + subject(d) + " option to work, that we have not verified?", category: "assumptions", why: "Unstated load-bearing assumptions are where decisions fail silently." },
      { q: "Which assumption, if reversed, would change the decision entirely?", category: "assumptions", why: "That assumption deserves the testing budget." },
      { q: "Which of these can be tested cheaply before committing?", category: "assumptions", why: "A cheap test that moves a decision is the highest-return work available." },
    ],
  },
  {
    id: "disconfirmation",
    minStakes: "standard",
    applies: () => true,
    emit: (d) => [
      { q: "What evidence would show our preferred answer on " + subject(d) + " is wrong, and have we gone looking for it?", category: "disconfirmation", why: "Gathering support for a conclusion is not analysis." },
      { q: "What is the strongest case against our current answer?", category: "disconfirmation", why: "If nobody has argued the other side, the answer is untested." },
      { q: "Does any source, requirement or fact we hold conflict with our conclusion?", category: "disconfirmation", why: "Conflicting evidence already in hand is the cheapest disconfirmation there is." },
    ],
  },
  {
    id: "failure_premortem",
    minStakes: "standard",
    applies: () => true,
    emit: (d) => [
      { q: "Assume this " + subject(d) + " decision failed badly. What is the most likely story of how?", category: "failure", why: "Prospective hindsight surfaces failure modes that forward reasoning misses." },
      { q: "Which of those failure paths are preventable, and which are merely survivable?", category: "failure", why: "Effort belongs on the controllable ones." },
      { q: "What is the worst realistic outcome, and can we survive it?", category: "failure", why: "Expected value is the wrong frame when the downside is ruinous." },
    ],
  },
  {
    id: "success_conditions",
    minStakes: "elevated",
    applies: () => true,
    emit: (d) => [
      { q: "Assume this " + subject(d) + " decision succeeded. What had to be true for that?", category: "success", why: "Avoiding failure is not the same as causing success, and a system tuned only to risk never wins anything." },
      { q: "Which success conditions are currently absent, and can any be created in time?", category: "success", why: "This converts a verdict into an action list." },
    ],
  },
  {
    id: "external_commitment",
    applies: (d) => d.attributes.externalCommitment === true,
    emit: () => [
      { q: "Who is legally able to make this commitment, and have they knowingly agreed?", category: "authority", why: "A commitment nobody can validly make is not a commitment." },
      { q: "Does the act of submitting or sending itself create a binding representation?", category: "authority", why: "The binding moment is often earlier than people assume." },
      { q: "What exactly are we promising, and can each promise be evidenced?", category: "claims", why: "An unsupported claim made externally is the expensive kind." },
      { q: "What happens if the counterparty accepts and we cannot perform?", category: "failure", why: "Winning work that cannot be delivered is worse than not winning it." },
    ],
  },
  {
    id: "technical_build",
    applies: (d) => d.attributes.technicalBuild === true,
    emit: () => [
      { q: "Has a comparable build been completed before, by whoever will do this one?", category: "capability", why: "Capability is demonstrated, not asserted from tooling access." },
      { q: "What are the workstreams, and which has the least certain estimate?", category: "capability", why: "The uncertain workstream sets the real schedule." },
      { q: "What does the estimate assume about availability, and is that realistic?", category: "capability", why: "Capacity, not competence, is the usual cause of missed delivery." },
      { q: "What is the rollback path if this fails partway?", category: "failure", why: "A build with no rollback is an irreversible decision wearing a technical costume." },
    ],
  },
  {
    id: "data_sensitivity",
    applies: (d) => d.attributes.handlesPersonalOrSensitiveData === true,
    emit: () => [
      { q: "What personal or sensitive data enters scope, and whose is it?", category: "data_governance", why: "Obligations attach to the data, not to the size of the contract." },
      { q: "What are we responsible for securing, and what remains the other party's responsibility?", category: "security", why: "Silent assumption of another party's controls is how liability appears unannounced." },
      { q: "Would a specialist review be warranted before promising anything about security or privacy?", category: "security", why: "A security claim beyond evidence is the most expensive kind of unsupported claim." },
    ],
  },
  {
    id: "economics",
    applies: (d) => d.attributes.capitalAllocation === true || d.attributes.pricing === true,
    emit: () => [
      { q: "What is the expected value, and what is the variance around it?", category: "economics", why: "A good average outcome with an unsurvivable tail is not a good decision." },
      { q: "What is the opportunity cost, measured against the next best use of the same time or capital?", category: "economics", why: "The relevant comparison is never against doing nothing." },
      { q: "Is the price built from cost and value, or anchored to a number someone else published?", category: "economics", why: "Anchoring to a published figure imports someone else's assumptions." },
    ],
  },
  {
    id: "competition",
    applies: (d) => d.attributes.competitiveAlternativeExists === true,
    emit: () => [
      { q: "What would a highly competent alternative do here, and how would we compare?", category: "competition", why: "Comparison exposes blind spots that introspection does not." },
      { q: "Why would the decision-maker choose us over the alternative, in their terms?", category: "competition", why: "A reason that only persuades us is not a reason." },
    ],
  },
  {
    id: "third_party",
    applies: (d) => d.attributes.dependsOnThirdParty === true,
    emit: () => [
      { q: "Which dependencies are outside our control, and what happens when one is late?", category: "dependencies", why: "A plan assuming timely third parties is a plan with an unpriced option written against it." },
      { q: "Does the relationship we are relying on actually exist yet?", category: "dependencies", why: "Citing a partner before the relationship is real is misrepresentation." },
    ],
  },
  {
    id: "legal",
    applies: (d) => d.attributes.legalOrRegulatory === true,
    emit: () => [
      { q: "Which questions here require qualified professional judgement rather than analysis?", category: "professional", why: "Confident reasoning about law is not legal advice and must not substitute for it." },
      { q: "What exposure would attach personally to any individual, as distinct from an entity?", category: "authority", why: "Personal exposure must be surfaced explicitly and never normalised." },
    ],
  },
  {
    id: "hiring",
    applies: (d) => d.attributes.hiringOrTeamDesign === true,
    emit: () => [
      { q: "What outcome would this role own that nobody currently owns?", category: "capability", why: "A role justified by workload rather than by an owned outcome tends to add coordination, not capacity." },
      { q: "Could tooling, process removal, or an existing person absorb this instead?", category: "options", why: "Adding a person is the least reversible way to add capability." },
    ],
  },
  {
    id: "operational",
    applies: (d) => d.attributes.recurringOperational === true,
    emit: () => [
      { q: "What is the ongoing cost of this decision after the initial change, and who carries it?", category: "economics", why: "Recurring decisions are usually judged on setup cost and paid for in maintenance." },
      { q: "How will we detect that this has stopped working?", category: "measurement", why: "An operational change with no detection path fails silently." },
      { q: "Who operates and maintains this once the change is made, and have they agreed?", category: "downstream_effects", why: "Work that lands on an unconsulted operator is a commitment made on someone else's behalf." },
    ],
  },
  {
    // Surfaced by coverage analysis: builds were interrogated for capability and
    // never for what they leave behind.
    id: "build_aftermath",
    applies: (d) => d.attributes.technicalBuild === true,
    emit: (d) => [
      { q: "After this " + subject(d) + " is built, who keeps it running, and for how long are we on the hook?", category: "downstream_effects", why: "Build effort is estimated; the maintenance tail is usually assumed away." },
      { q: "What does the other party have to keep doing for this to keep working?", category: "downstream_effects", why: "A handover that depends on unstated effort from the recipient fails after we leave." },
    ],
  },
  {
    // Surfaced by dogfooding, not by analysis. Readiness-aligned discovery
    // returned work of exactly the right size on platforms the company may not
    // be permitted to join at all. Eligibility to participate in a channel is
    // separate from fitness for the work in it, and nothing was asking it.
    id: "channel_eligibility",
    applies: (d) => d.attributes.externalCommitment === true || d.attributes.governedBySourceDocument === true,
    emit: () => [
      { q: "What are the eligibility requirements of the venue itself -- platform terms, membership, registration, minimum age, jurisdiction -- as distinct from the requirements of the work?", category: "requirements", why: "A channel can exclude us regardless of how well suited we are to the work, and finding out after applying wastes the effort and the credibility." },
      { q: "Have we read the venue's own terms, or only the posting?", category: "evidence", why: "The posting advertises the work; the terms decide whether we may participate at all." },
      { q: "If we do not meet a venue requirement, is there a legitimate route in, or does this channel close?", category: "options", why: "The honest answers are a different channel or a different arrangement, never a misrepresentation to satisfy the requirement." },
    ],
  },
  {
    // Surfaced by coverage analysis: a stated deadline was accepted as given.
    id: "timing",
    applies: (d) => d.attributes.timeBounded === true,
    emit: () => [
      { q: "Is the stated timing constraint exact, and where does it come from?", category: "timing", why: "A deadline inherited from a summary rather than the source has been wrong before." },
      { q: "What has to be true for us to meet it, and what happens if we miss by a week?", category: "timing", why: "The consequence of lateness is what determines whether the date is a constraint or a preference." },
    ],
  },
  {
    id: "professional_knowledge",
    applies: (d) => ["elevated", "high", "critical"].includes(d.stakesTier),
    emit: () => [
      { q: "Would a strong practitioner in this domain know something material we have not verified?", category: "professional", why: "The gap between plausible reasoning and professional knowledge is invisible from inside the reasoning." },
      { q: "What is the standard approach here, and are we deviating knowingly or accidentally?", category: "professional", why: "Accidental deviation from a professional norm is a common and avoidable failure." },
    ],
  },
  {
    id: "measurement",
    applies: () => true,
    emit: (d) => [
      { q: "How will we know whether this " + subject(d) + " decision was right, and by when?", category: "measurement", why: "A decision with no feedback path teaches nothing and repeats." },
    ],
  },
];

export function generateQuestions(d: DecisionDescriptor): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  let n = 0;
  for (const g of GENERATORS) {
    if (!g.applies(d)) continue;
    // Depth is bought with stakes. Interrogating a routine decision as though it
    // were critical wastes the attention the critical one needs.
    if (!meetsStakes(g.minStakes, d.stakesTier)) continue;
    for (const item of g.emit(d)) {
      n += 1;
      out.push({ id: d.id + "-Q" + String(n).padStart(3, "0"), question: item.q, category: item.category, whyItMatters: item.why, generator: g.id, depth: 0 });
    }
  }
  return out;
}

/**
 * Recursive follow-ups.
 *
 * A question whose answer is unresolved and material spawns the next question
 * rather than being recorded as a gap and abandoned. Depth is bounded because
 * information value falls off, not because depth is inherently bad.
 */
export function followUps(answered: { question: GeneratedQuestion; answer: string; resolved: boolean; material: boolean }, maxDepth = 3): GeneratedQuestion[] {
  const q = answered.question;
  if (answered.resolved || !answered.material || q.depth >= maxDepth) return [];
  const base = { category: q.category, generator: q.generator + ":followup", parentId: q.id, depth: q.depth + 1 };
  return [
    { id: q.id + "-a", question: "What specific evidence would resolve: " + q.question, whyItMatters: "An unresolved material question needs a route to closure, not a note that it is open.", ...base },
    { id: q.id + "-b", question: "Who or what can obtain that evidence, and at what cost?", whyItMatters: "Routing the work is what turns a gap into progress.", ...base },
    { id: q.id + "-c", question: "If it cannot be resolved, does it block the decision or get disclosed?", whyItMatters: "Unresolvable is not the same as ignorable.", ...base },
  ];
}

// ------------------------------------------------------ assumption register

export interface Assumption {
  id: string;
  assumption: string;
  whyRequired: string;
  evidenceFor?: string;
  evidenceAgainst?: string;
  status: string;
  impactIfWrong: string;
  testable: boolean;
  costToTest?: string;
  action: string;
}

export function assumptionRegister(assumptions: Assumption[]) {
  const untested = assumptions.filter((a) => !["verified", "corroborated", "verified_by_test"].includes(a.status));
  const loadBearing = untested.filter((a) => /decision|entire|whole|block|fatal|unsafe/i.test(a.impactIfWrong));
  const cheapTests = untested.filter((a) => a.testable);
  return {
    total: assumptions.length,
    untested: untested.length,
    loadBearingUntested: loadBearing.map((a) => ({ id: a.id, assumption: a.assumption, impactIfWrong: a.impactIfWrong })),
    testableNow: cheapTests.map((a) => ({ id: a.id, assumption: a.assumption, costToTest: a.costToTest || "unknown" })),
    // A load-bearing assumption that is testable and untested is the clearest
    // signal that the analysis stopped too early.
    analysisStoppedEarly: loadBearing.some((a) => a.testable),
  };
}

// ------------------------------------------------------ process coverage

export const REASONING_STAGES = [
  "questions_generated", "source_completeness_checked", "options_enumerated",
  "assumptions_registered", "disconfirmation_searched", "failure_premortem",
  "success_conditions", "professional_knowledge_considered", "independent_review",
  "unknowns_routed",
] as const;

/** Which stages the stakes actually demand. Low stakes should not pay for a red team. */
export function requiredStages(stakesTier: string): string[] {
  const base = ["questions_generated", "options_enumerated", "assumptions_registered"];
  if (["standard", "elevated", "high", "critical"].includes(stakesTier)) base.push("source_completeness_checked", "failure_premortem");
  if (["elevated", "high", "critical"].includes(stakesTier)) base.push("disconfirmation_searched", "success_conditions", "unknowns_routed");
  if (["high", "critical"].includes(stakesTier)) base.push("professional_knowledge_considered", "independent_review");
  return base;
}

/**
 * Audit the process, not the output.
 *
 * This is the gate that would have caught the original failure. The verdict then
 * was well written and wrong, and no output-level audit flagged it, because the
 * defect was a stage that never ran rather than a sentence that read badly.
 */
export function processCoverageAudit(args: { stakesTier: string; completedStages: string[]; questionsGenerated: number; questionsUnresolvedMaterial: number; verdictProposed: boolean }) {
  const required = requiredStages(args.stakesTier);
  const missing = required.filter((s) => !args.completedStages.includes(s));
  const problems: string[] = [];
  if (missing.length) problems.push("Reasoning stages not run: " + missing.join(", "));
  if (args.questionsGenerated === 0) problems.push("No questions were generated before answering.");
  if (args.questionsUnresolvedMaterial > 0) problems.push(args.questionsUnresolvedMaterial + " material question(s) remain unresolved and unrouted.");
  return {
    required,
    completed: args.completedStages,
    missing,
    problems,
    verdictReady: problems.length === 0,
    // Refusing is the whole mechanism. A confident verdict produced without the
    // required stages is exactly the failure this exists to prevent.
    ruling: problems.length === 0
      ? "Process coverage complete. A verdict may be issued."
      : "VERDICT REFUSED until the process gaps are closed: " + problems.join(" | "),
  };
}

// ------------------------------------------- human correction tracking

export interface HumanCorrection {
  id: string;
  at: string;
  correctedBy: string;
  whatWasMissed: string;
  /** The question the system should have asked itself and did not. */
  questionSystemShouldHaveAsked: string;
  classification: string;
  generalCapabilityGap: boolean;
  repair?: string;
  regressionTest?: string;
}

/**
 * Repeated human correction is a metric, not an anecdote.
 *
 * If a person keeps supplying questions the system should generate, the gap is
 * in question generation, however good each individual answer was.
 */
export function correctionAnalysis(corrections: HumanCorrection[]) {
  const byCategory: Record<string, number> = {};
  for (const c of corrections) byCategory[c.classification] = (byCategory[c.classification] || 0) + 1;
  const general = corrections.filter((c) => c.generalCapabilityGap);
  const unrepaired = corrections.filter((c) => c.generalCapabilityGap && !c.repair);
  const recurring = Object.entries(byCategory).filter(([, n]) => n > 1).map(([k, n]) => ({ classification: k, count: n }));
  return {
    total: corrections.length,
    byCategory,
    generalGaps: general.length,
    unrepairedGeneralGaps: unrepaired.map((c) => c.id),
    recurringClasses: recurring,
    verdict: recurring.length
      ? "A correction class has recurred. Treat as a question-generation gap rather than a series of individual mistakes."
      : general.length
        ? "General gaps identified and repaired. Watch for recurrence."
        : "No general capability gap recorded.",
  };
}
