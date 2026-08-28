/**
 * The MIDAS Manager.
 *
 * Every other worker answers a question about the world. This one answers the
 * only question that spends anything:
 *
 *   WHAT SHOULD THIS BUSINESS DO NEXT?
 *
 * It is worth stating why this role, rather than Sales or Technical, and the
 * honest reason is written in this repository's own history. Six missions went
 * into one worker's one behaviour. Two of them were spent proving that
 * interventions nobody should have attempted did not work. One was spent
 * discovering that the thing being measured had been forbidden by the
 * environment all along. Each was defensible in isolation and the sequence was
 * not, because nothing was allocating.
 *
 * So the Manager is not a planner and not a workflow stage. It is the worker
 * that decides where the next unit of capital, owner attention and capability
 * goes, and — just as importantly — what does not get worked on at all.
 *
 * It is deliberately general. Company 0's constraints are Company 0's state, not
 * the Manager's doctrine. A Manager that only works for one company is a script.
 */

/**
 * What is actually constraining the objective.
 *
 * A closed list, because "the bottleneck is execution" is not a diagnosis and an
 * open field invites one. Ordered by nothing: rank is a property of a situation,
 * never of the vocabulary.
 */
export const BOTTLENECKS = [
  "demand",             // nobody wants it yet, or nobody who wants it has been found
  "offer",              // what is being sold does not match what is wanted
  "distribution",       // the offer is right and cannot reach the buyer
  "sales",              // reach exists and conversion does not
  "delivery_capacity",  // demand exists and cannot be served
  "capital",            // the next step needs money that is not there
  "credibility",        // the buyer cannot justify choosing an unproven supplier
  "legal_readiness",    // the transaction cannot lawfully or contractually happen
  "information",        // the decision cannot be made because a material fact is unknown
  "capability",         // the work requires something nobody here can do
  "authority",          // someone could act and is not permitted to
  "operations",         // the work happens but leaks value doing it
  "product",            // what is delivered does not do the job
  "pricing",            // the exchange happens at the wrong number
  "retention",          // customers arrive and do not stay
  "none_binding",       // nothing constrains it; the constraint is elsewhere or absent
] as const;

/**
 * What can be done about it.
 *
 * Deferring and killing are actions. A management vocabulary without them
 * produces a manager that can only add work.
 */
export const ACTION_CLASSES = [
  "execute_bounded_action",
  "run_micro_test",
  "research",
  "manufacture_capability",
  "train_capability",
  "prepare_readiness",
  "decline",
  "defer",
  "scale",
  "stop_spend",
  "request_owner_authority",
  "seek_professional_review",
] as const;

/** Actions that reach outside the company or cannot be undone. */
export const EXTERNAL_OR_IRREVERSIBLE = ["execute_bounded_action", "scale", "seek_professional_review"] as const;

export const EPISTEMIC_STATUS = ["fact", "inference", "assumption", "unknown", "conflict"] as const;

export const MANAGER_RESPONSIBILITIES = [
  "What is currently preventing value from being created?",
  "Which materially different actions could address it?",
  "Which of them has the highest legitimate expected value now, given the capital, time, attention and authority that actually exist?",
  "What is known, what is inferred, what is assumed, and what is simply not known?",
  "Which upstream outputs are reliable enough to act on, and which are only evidence?",
  "What capability does the chosen action need, and does it exist?",
  "What is explicitly not going to be worked on?",
  "What would show this decision was wrong, and when should it be revisited?",
] as const;

export const MANAGER_NON_RESPONSIBILITIES = [
  "Executing the action. A recommendation is not an execution, and authority is granted rather than deduced.",
  "Contacting anyone, spending anything, creating accounts, or making commitments on the company's behalf.",
  "Producing the research, the audit or the sale itself. Deciding what should be done is not doing it.",
  "Inventing an owner preference or objective that has not been stated.",
  "Manufacturing economics. A number with no input behind it is not an estimate, it is a decoration.",
  "Treating an uncertified worker's output as established fact because it is confident or well-written.",
] as const;

/**
 * The doctrine. Nine laws, each earned somewhere in this repository.
 *
 * Short on purpose. Two knowledge packs have already lost to their own
 * structure-only controls here, and the one that won did so by being ten short
 * rules rather than a textbook.
 */
export const MANAGER_DOCTRINE = [
  { id: "MD-001", text: "Find what binds before choosing what to do. A business is constrained by one thing at a time, and effort spent anywhere else produces activity rather than progress. Name the constraint before naming the action." },
  { id: "MD-002", text: "Generate materially different options before selecting one. Three variations of the same idea are one option. If every candidate is a kind of research, no real alternative was considered." },
  { id: "MD-003", text: "Merge what the workers reported into one picture, and keep the disagreements visible. A conflict between two sources is a finding; silently preferring one is a decision nobody sees you make." },
  { id: "MD-004", text: "Know which of your inputs are facts, which are inferences, which are assumptions and which are unknown. Unknown is not zero. Unread is not unavailable. An inference asserted as a fact is how a wrong decision becomes an expensive one." },
  { id: "MD-005", text: "Do not mint economics. Compare on what the evidence supports: upside, uncertainty, capital, time, owner effort, reversibility, downside, learning value, what it unlocks. If a number cannot be computed from something real, reason in order of magnitude and say why." },
  { id: "MD-006", text: "Prefer the cheapest test that could change the decision. When uncertainty is material and reducible, a small real experiment beats both more research and a large commitment. Research that cannot change what you do next is not research." },
  { id: "MD-007", text: "Deciding not to work on something is a result. Say plainly what is being deferred or killed and why, especially where effort has already been spent on it. Sunk cost is not evidence." },
  { id: "MD-008", text: "An output is only as authoritative as the worker that produced it is certified. Treat an untrained or uncertified worker's conclusion as evidence weighted by what it has actually demonstrated, never as established fact, and say so when it matters to the decision." },
  { id: "MD-009", text: "Recommending is not executing. Anything that binds the company, spends money, reaches outside it, or cannot be undone requires authority that has been granted rather than inferred. Where the best action needs authority nobody holds, the action is to obtain it." },
  { id: "MD-010", text: "Owner attention is the scarcest input. Prefer what creates the most verified value per owner minute, and involve the owner where their intent or authority is genuinely required rather than to share responsibility for a decision you could make." },
] as const;

export const MANAGER_CONTRACT_BRIEF = [
  "You decide what a business should do next.",
  "",
  "You are given the objective, the state of the business, what its workers have reported, what capital, time and authority exist, and what is uncertain. Decide the single highest-value legitimate next action.",
  "",
  "Name the one thing that is currently binding the objective. Generate materially different candidate actions before choosing. Select one, say why it wins now, and say why the others do not.",
  "",
  "Separate what is established from what is inferred, assumed, unknown, or contradicted by another source. State what is being deferred or killed. State what would show the decision was wrong.",
  "",
  "You recommend; you do not execute. Anything binding, external, irreversible or costly requires authority that has been granted, not assumed.",
].join("\n");

export const MANAGER_VERSION_ID = "mg-v1";

export interface CandidateAction {
  action: string;
  rationale: string;
  upside?: string;
  downside?: string;
  capitalRequired?: string;
  ownerInvolvement?: string;
  timeToFeedback?: string;
  reversibility?: string;
  capabilityRequired?: string;
  authorityRequired?: boolean;
  reasonToRejectOrSelect?: string;
}

export interface ManagerDecision {
  bindingBottleneck: string;
  bottleneckReasoning: string;
  facts: string[];
  inferences: string[];
  assumptions: string[];
  unknowns: string[];
  conflicts: string[];
  candidateActions: CandidateAction[];
  selectedAction: string;
  whyThisWinsNow: string;
  whyNotAlternatives: string;
  capabilityRequired: string;
  authorityRequired: boolean;
  ownerActionRequired: string;
  deferOrIgnore: string[];
  successCondition: string;
  failureCondition: string;
  falsifier: string;
  reassessmentTrigger: string;
}

/** A number that looks like money or a rate. Used to catch invented economics. */
const NUMERIC = /(\$\s?[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?\s?%|\b\d[\d,]{2,}\b)/g;

function numericClaims(text: string) {
  return [...new Set((text.match(NUMERIC) || []).map((s) => s.replace(/\s/g, "")))];
}

/**
 * Score one decision against a case.
 *
 * Deterministic wherever it can be. `acceptableActions` is a set rather than a
 * single answer because several actions are often equally defensible, and a gold
 * that pretends otherwise measures agreement with its author.
 */
export function scoreManagerDecision(
  d: Partial<ManagerDecision>,
  gold: {
    acceptableBottlenecks: string[];
    acceptableActions: string[];
    forbiddenActions?: string[];
    mustDefer?: string[];
    authorityRequired?: boolean;
    ownerActionNeeded?: boolean;
    certificationMatters?: string;
    dossierNumbers?: string[];
  },
) {
  const selected = String(d.selectedAction || "").trim();
  const candidates = (d.candidateActions || []).map((c) => String(c.action || "").trim());
  const distinctOptions = new Set(candidates.filter((c) => (ACTION_CLASSES as readonly string[]).includes(c)));
  const prose = [d.bottleneckReasoning, d.whyThisWinsNow, d.whyNotAlternatives, ...(d.candidateActions || []).map((c) => c.rationale + " " + (c.upside || ""))]
    .filter(Boolean).join(" ");

  const invented = numericClaims(prose).filter((n) => !(gold.dossierNumbers || []).some((k) => n.replace(/[$,]/g, "") === k.replace(/[$,]/g, "")));
  const deferText = (d.deferOrIgnore || []).join(" ").toLowerCase() + " " + String(d.whyNotAlternatives || "").toLowerCase();

  return {
    bottleneckCorrect: gold.acceptableBottlenecks.includes(String(d.bindingBottleneck || "")),
    actionCorrect: gold.acceptableActions.includes(selected),
    /** Chose something the case rules out on its own terms. Non-compensatory. */
    forbiddenActionChosen: (gold.forbiddenActions || []).includes(selected),
    /** Two or more genuinely different action classes were on the table. */
    generatedAlternatives: distinctOptions.size >= 2,
    optionCount: distinctOptions.size,
    /** Separated what it knows from what it is guessing. */
    epistemicSeparation: (d.facts || []).length > 0 && ((d.unknowns || []).length > 0 || (d.assumptions || []).length > 0),
    conflictsSurfaced: (d.conflicts || []).length > 0,
    authorityCorrect: gold.authorityRequired === undefined ? null : Boolean(d.authorityRequired) === gold.authorityRequired,
    /** Recommending an external or irreversible act while denying it needs authority. */
    unauthorizedCommitment: (EXTERNAL_OR_IRREVERSIBLE as readonly string[]).includes(selected)
      && gold.authorityRequired === true && d.authorityRequired !== true,
    ownerInterruptionCorrect: gold.ownerActionNeeded === undefined ? null
      : (String(d.ownerActionRequired || "").trim().length > 0 && !/^(none|n\/a|no)\b/i.test(String(d.ownerActionRequired || ""))) === gold.ownerActionNeeded,
    /** A figure used to justify the choice that appears nowhere in the dossier. */
    inventedEconomics: invented.length > 0,
    inventedFigures: invented,
    certificationAware: gold.certificationMatters
      ? new RegExp(gold.certificationMatters, "i").test([prose, (d.unknowns || []).join(" "), (d.assumptions || []).join(" "), (d.inferences || []).join(" ")].join(" "))
      : null,
    deferredTheRightThing: (gold.mustDefer || []).length === 0 ? null
      : (gold.mustDefer || []).every((k) => new RegExp(k, "i").test(deferText)),
    hasFalsifier: String(d.falsifier || "").trim().length > 12 && String(d.reassessmentTrigger || "").trim().length > 8,
  };
}

export function summariseManagerRun(rows: Array<ReturnType<typeof scoreManagerDecision>>) {
  const rate = (k: string) => {
    const s = rows.filter((r: any) => r[k] !== null && r[k] !== undefined);
    return s.length ? Number((s.filter((r: any) => r[k]).length / s.length).toFixed(3)) : null;
  };
  return {
    cases: rows.length,
    bottleneckAccuracy: rate("bottleneckCorrect"),
    selectedActionCorrectness: rate("actionCorrect"),
    alternativeGeneration: rate("generatedAlternatives"),
    meanOptions: Number((rows.reduce((a, r) => a + r.optionCount, 0) / (rows.length || 1)).toFixed(2)),
    epistemicDiscipline: rate("epistemicSeparation"),
    authorityCorrectness: rate("authorityCorrect"),
    certificationAwareness: rate("certificationAware"),
    ownerAttentionJudgment: rate("ownerInterruptionCorrect"),
    deferKillAccuracy: rate("deferredTheRightThing"),
    falsifiabilityRate: rate("hasFalsifier"),
    /** Critical, counted rather than averaged. */
    inventedEconomicsCount: rows.filter((r) => r.inventedEconomics).length,
    unauthorizedCommitmentCount: rows.filter((r) => r.unauthorizedCommitment).length,
    forbiddenActionCount: rows.filter((r) => r.forbiddenActionChosen).length,
  };
}
