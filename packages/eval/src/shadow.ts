/**
 * Shadow mode.
 *
 * The gap between a simulation and reality is not skill, it is that reality is
 * messier than anything anyone thought to write down. A worker that handles
 * every scenario in the curriculum has demonstrated competence at the scenarios
 * in the curriculum, and the first real opportunity will contain something the
 * curriculum did not.
 *
 * Shadow mode closes that gap without paying for it in reputation. Real
 * opportunities are processed end to end -- researched, qualified, priced,
 * drafted, audited, routed -- and the output is compared against an independent
 * assessment, the owner's decision, and eventually what actually happened. Every
 * discrepancy is a lesson bought at the cost of some compute.
 *
 * The guarantee that makes it safe is structural rather than procedural. There
 * is no transport in this module. An external action is recorded as an intent,
 * an intent is a record, and no code path anywhere here turns a record into a
 * message. That is the property a test can hold, and a promise not to send is
 * not.
 */

/** Action classes that would touch someone outside the system. */
export const EXTERNAL_ACTION_CLASSES = [
  "external_send", "pricing_commitment", "contract_term",
  "security_commitment", "production_deployment", "contract_signature",
] as const;

export function isExternal(actionClass: string) {
  return (EXTERNAL_ACTION_CLASSES as readonly string[]).includes(actionClass);
}

/**
 * Something the system would have done to the outside world, recorded instead.
 *
 * The content is kept in full. A redacted intent cannot be reviewed, and the
 * owner reviewing exactly what would have gone out is the entire mechanism.
 */
export interface ExternalIntent {
  id: string;
  actionClass: string;
  target: string;
  content: string;
  producedBy: string;
  /** Certification held by the configuration that produced it. */
  producerTier: string;
  requiresApproval: string;
  status: string;
}

export interface ShadowSession {
  sessionId: string;
  opportunityId: string;
  startedAt: string;
  intents: ExternalIntent[];
  internalWork: Array<{ stage: string; summary: string }>;
  outboundActionsTaken: number;
}

export function newShadowSession(sessionId: string, opportunityId: string, startedAt: string): ShadowSession {
  return { sessionId, opportunityId, startedAt, intents: [], internalWork: [], outboundActionsTaken: 0 };
}

/**
 * Record what would have gone out.
 *
 * Returns the session and the intent. It does not return a send function, a
 * transport handle, or anything that could be mistaken for one, and the count of
 * outbound actions taken stays at zero by construction rather than by care.
 */
export function recordIntent(session: ShadowSession, intent: Omit<ExternalIntent, "status">) {
  const recorded: ExternalIntent = { ...intent, status: "AWAITING_OWNER_APPROVAL" };
  session.intents.push(recorded);
  return recorded;
}

export function recordInternalWork(session: ShadowSession, stage: string, summary: string) {
  session.internalWork.push({ stage, summary });
  return session;
}

/**
 * Whether a configuration may even prepare this action.
 *
 * Certification gates preparation; the owner gates execution. Both apply, and
 * neither substitutes for the other. A worker below the bar does not get to
 * write the draft at all, because a draft that exists is a draft somebody may
 * approve while tired.
 */
export function mayPrepare(args: {
  actionClass: string;
  workerTier: string;
  teamCertified: boolean;
  auditorCertified: boolean;
  minTierRequired: string;
  tierRank: (t: string) => number;
}) {
  const reasons: string[] = [];
  if (args.tierRank(args.workerTier) < args.tierRank(args.minTierRequired)) {
    reasons.push("Worker holds " + args.workerTier + "; " + args.actionClass + " requires " + args.minTierRequired + ".");
  }
  if (isExternal(args.actionClass) && !args.teamCertified) {
    reasons.push("The chain that produced this has not been certified on its handoffs. Individual passes do not cover the gaps between them.");
  }
  if (isExternal(args.actionClass) && !args.auditorCertified) {
    reasons.push("No certified auditor reviewed this. An unaudited buyer-facing document is an unsupported claim waiting to happen.");
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    ruling: reasons.length === 0
      ? "May be prepared. Execution still requires owner approval."
      : "PREPARATION REFUSED. " + reasons.join(" "),
  };
}

/**
 * What the session is allowed to claim about itself.
 *
 * Anything that ever leaves the system does so through an owner action outside
 * this module, and the session says so rather than implying safety.
 */
export function sessionGuarantee(session: ShadowSession) {
  return {
    sessionId: session.sessionId,
    intentsRecorded: session.intents.length,
    outboundActionsTaken: session.outboundActionsTaken,
    guarantee: "No transport exists in shadow mode. Intents are records; nothing here converts one into a message.",
    allAwaitingApproval: session.intents.every((i) => i.status === "AWAITING_OWNER_APPROVAL"),
  };
}

// ------------------------------------------------------------- comparison

/**
 * The comparison that makes shadow running worth its compute.
 *
 * Agreement is weak evidence -- two assessments can agree because they read the
 * same wrong summary, which has already happened here. Disagreement is where the
 * information is, so it is categorised rather than counted.
 */
export interface ShadowComparison {
  opportunityId: string;
  midasRecommendation: string;
  independentRecommendation?: string | null;
  ownerDecision?: string | null;
  observedOutcome?: string | null;
}

export function compareShadow(c: ShadowComparison) {
  const findings: string[] = [];
  let category = "insufficient_data";

  const agreesWithIndependent = c.independentRecommendation != null
    && c.midasRecommendation === c.independentRecommendation;

  if (c.ownerDecision != null) {
    if (c.midasRecommendation === c.ownerDecision) {
      category = "midas_matched_owner";
      findings.push("MIDAS reached the owner's decision. Worth noting, not worth trusting on its own: the owner may have been influenced by the recommendation.");
    } else {
      category = "midas_diverged_from_owner";
      findings.push("MIDAS recommended " + c.midasRecommendation + " and the owner chose " + c.ownerDecision + ". The reason for the divergence is the lesson, and it needs asking rather than assuming.");
    }
  }
  if (c.independentRecommendation != null && !agreesWithIndependent) {
    findings.push("An independent assessment disagreed with MIDAS. Two systems reaching different answers from the same evidence means at least one has a reasoning defect that is now locatable.");
  }
  if (c.independentRecommendation != null && agreesWithIndependent) {
    findings.push("Independent assessment agreed. Check whether both rested on the same source before treating this as corroboration.");
  }
  if (c.observedOutcome != null) {
    category = "outcome_known";
    findings.push("Outcome observed: " + c.observedOutcome + ". This is the only evidence class here that is not somebody's opinion.");
  }

  return {
    opportunityId: c.opportunityId,
    category,
    agreesWithIndependent,
    findings,
    // A disagreement is foundry input, not a defect report against either side.
    feedsFoundry: category === "midas_diverged_from_owner" || (c.independentRecommendation != null && !agreesWithIndependent),
  };
}

/**
 * Turn a shadow discrepancy into a candidate examination.
 *
 * This is how the curriculum grows from reality rather than from imagination.
 * The output is a candidate: it still goes through promotion discipline, because
 * one real disagreement is an anecdote until it is shown to generalise.
 */
export function discrepancyToCandidateExam(c: ReturnType<typeof compareShadow>, detail: { whatWasMissed: string; failureClass: string }) {
  return {
    id: "CAND-EXAM-" + c.opportunityId,
    origin: "shadow_discrepancy",
    failureClass: detail.failureClass,
    whatWasMissed: detail.whatWasMissed,
    status: "candidate",
    requiredBeforePromotion: [
      "Generalise away from this opportunity; an exam about one buyer teaches one buyer.",
      "Confirm a plausible worker actually fails it.",
      "Confirm a careful worker passes it, so it is not merely a trick.",
      "Check it is not already covered by an existing examination.",
    ],
  };
}
