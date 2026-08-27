/**
 * Release control for consequential actions.
 *
 * The measured defect this exists for: the same configuration, given the same
 * migration case three times, escalated correctly once and proceeded with an
 * irreversible operation against a 41-day-stale backup on the other two. The
 * mean of those three runs describes nobody. A worker that is right two-thirds
 * of the time about whether to destroy forty thousand customer records is not
 * two-thirds safe; it is unsafe, and the score conceals it.
 *
 * The repair is not to make the model more reliable. Models are stochastic and
 * will stay stochastic. The repair is to stop a single stochastic completion
 * being the thing that authorises an irreversible act.
 *
 * So the decision is split into parts that fail differently:
 *
 *   RECOMMENDATION   what the worker thinks. Probabilistic. Useful.
 *   CONSEQUENCE      what the action actually does. Computed from declared
 *                    properties, with no model involved, because "is this
 *                    reversible" is a fact about the operation rather than an
 *                    opinion about it.
 *   RELEASE GATE     whether it may proceed. Deterministic, and able only to
 *                    restrict.
 *   APPROVAL         who must say yes, if anyone.
 *
 * The one invariant that makes this worth having: **the gate can never turn a
 * refusal into a proceed.** It is a veto layered over the worker, not a second
 * opinion that might overrule it. A safety mechanism that can also authorise is
 * not a safety mechanism.
 */

/** What an action does, as facts rather than as a judgement about them. */
export interface ActionFacts {
  id: string;
  description: string;
  /** Can the effect be undone by an action available to us, without the counterparty? */
  reversible: boolean;
  /** Has a restore actually been performed and checked, not merely taken? */
  rollbackVerified: boolean;
  destroysData: boolean;
  touchesProduction: boolean;
  affectsThirdParty: boolean;
  /** Grants or widens access rights. */
  changesPrivilege: boolean;
  /** Reaches someone outside the system. */
  external: boolean;
  /** Records that cannot be recreated if lost. */
  irreplaceableRecords: number;
}

export const CONSEQUENCE_CLASSES = ["trivial", "recoverable", "costly", "irreversible", "catastrophic"] as const;

/**
 * Classify what an action does. No model call.
 *
 * Deliberately blunt and pessimistic. An action whose reversibility nobody has
 * established is treated as irreversible, because the cost of being wrong in
 * that direction is bounded and the cost of being wrong the other way is not.
 */
export function classifyConsequence(f: ActionFacts) {
  const reasons: string[] = [];
  let level = "trivial";
  const raise = (to: string, why: string) => {
    if (CONSEQUENCE_CLASSES.indexOf(to as any) > CONSEQUENCE_CLASSES.indexOf(level as any)) level = to;
    reasons.push(why);
  };

  if (!f.reversible) raise("irreversible", "The effect cannot be undone by us.");
  if (f.destroysData && !f.rollbackVerified) raise("catastrophic", "Destroys data with no verified restore.");
  // Only irreplaceable while there is no verified restore. A restore that has
  // actually been performed and checked is exactly what makes records
  // replaceable, so treating both as true at once described an impossible world.
  if (f.destroysData && f.irreplaceableRecords > 0 && !f.rollbackVerified) {
    raise("catastrophic", f.irreplaceableRecords + " records would be unrecoverable, because no restore has been verified.");
  }
  if (f.touchesProduction && !f.reversible) raise("irreversible", "Irreversible change to a production system.");
  if (f.changesPrivilege) raise("costly", "Widens access, and the blast radius of a later mistake with it.");
  if (f.affectsThirdParty) raise("costly", "A party outside this system bears part of the consequence.");
  if (f.external) raise("costly", "Reaches someone outside the system and cannot be recalled.");
  if (f.reversible && !f.destroysData && !f.external && !f.changesPrivilege) {
    reasons.push("Reversible, contained, and touches nobody outside.");
    level = f.touchesProduction ? "recoverable" : "trivial";
  }
  return { level, reasons };
}

export const RELEASE_DECISIONS = ["proceed", "proceed_with_record", "requires_owner", "requires_professional", "blocked"] as const;

/**
 * What the consequence class permits, before anyone's opinion is consulted.
 *
 * These are declared here rather than decided per case, so that a worker's
 * confidence, urgency, or a counterparty's pressure cannot move them.
 */
export const CLASS_POLICY: Record<string, { decision: string; why: string }> = {
  trivial: { decision: "proceed", why: "Reversible and contained. Requiring approval here would make approval meaningless everywhere." },
  recoverable: { decision: "proceed_with_record", why: "Reversible, but touching a live system. Record what was done so it can be undone by someone who was not there." },
  costly: { decision: "requires_owner", why: "Someone outside this system bears part of the cost, and that is the owner's to accept." },
  irreversible: { decision: "requires_owner", why: "There is no way back, so the decision cannot be delegated to a process that is sometimes wrong." },
  catastrophic: { decision: "blocked", why: "Destroys data with no verified restore. No approval makes this safe; the missing restore does." },
};

export interface ReleaseInput {
  facts: ActionFacts;
  /** What the worker recommended. May be probabilistic and may be wrong. */
  workerRecommendation: string;
  /** Independent samples, where a model judgement genuinely is required. */
  samples?: string[];
  ownerApproved?: boolean;
  professionalApproved?: boolean;
}

const RESTRICTIVENESS = ["proceed", "proceed_with_record", "requires_owner", "requires_professional", "blocked"];
function moreRestrictive(a: string, b: string) {
  return RESTRICTIVENESS.indexOf(a) >= RESTRICTIVENESS.indexOf(b) ? a : b;
}

/**
 * Decide whether an action may be released.
 *
 * The worker's recommendation is an input, never the authority. Where it is more
 * cautious than policy, its caution is honoured -- a worker that wants to stop is
 * always allowed to stop. Where it is less cautious, policy wins.
 */
export function releaseDecision(input: ReleaseInput) {
  const consequence = classifyConsequence(input.facts);
  const policy = CLASS_POLICY[consequence.level];

  // A worker recommending a halt is respected in that direction only.
  const workerWantsToStop = ["escalate", "block", "refuse", "stop", "requires_owner"].includes(input.workerRecommendation);
  let decision = workerWantsToStop ? moreRestrictive(policy.decision, "requires_owner") : policy.decision;

  const notes: string[] = [];

  // Where a model judgement is genuinely needed, one sample is not a judgement.
  let agreement: number | null = null;
  if (input.samples && input.samples.length > 1) {
    const counts: Record<string, number> = {};
    for (const s of input.samples) counts[s] = (counts[s] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    agreement = top[1] / input.samples.length;
    if (agreement < 1) {
      // Disagreement among samples of the same configuration is itself evidence
      // that the question is beyond what one completion should settle.
      decision = moreRestrictive(decision, "requires_owner");
      notes.push("Independent samples of the same configuration disagreed (" + Math.round(agreement * 100)
        + "% agreement). The configuration is not reliable on this decision, whichever answer is more common.");
    }
  }

  const approvalSatisfied =
    decision === "proceed" || decision === "proceed_with_record"
      ? true
      : decision === "requires_owner" ? input.ownerApproved === true
        : decision === "requires_professional" ? input.professionalApproved === true
          : false;

  return {
    actionId: input.facts.id,
    consequence: consequence.level,
    consequenceReasons: consequence.reasons,
    policyDecision: policy.decision,
    decision,
    sampleAgreement: agreement,
    mayProceed: approvalSatisfied && decision !== "blocked",
    approvalRequired: decision === "requires_owner" ? "owner"
      : decision === "requires_professional" ? "professional" : "none",
    notes,
    /** The property that makes this a safety mechanism rather than a second opinion. */
    invariant: "The gate can only restrict. It never converts a refusal into a proceed.",
    ruling: decision === "blocked"
      ? "BLOCKED. " + policy.why
      : approvalSatisfied
        ? (decision === "proceed" ? "May proceed. " : "May proceed, recorded. ") + policy.why
        : "HELD for " + (decision === "requires_owner" ? "owner" : "professional") + " approval. " + policy.why,
  };
}

/**
 * Whether a configuration is stable enough to be trusted with a class of action.
 *
 * Used to answer the question the migration case raised: not "was it right this
 * time" but "how often is it right, and is that often enough for what this
 * action does".
 */
export function trustworthyFor(consequenceLevel: string, observedAgreement: number) {
  const required: Record<string, number> = {
    trivial: 0, recoverable: 0.6, costly: 0.9, irreversible: 1, catastrophic: 1,
  };
  const need = required[consequenceLevel] ?? 1;
  return {
    consequenceLevel, observedAgreement, required: need,
    trusted: observedAgreement >= need,
    reason: observedAgreement >= need
      ? "Agreement meets the bar for this consequence class."
      : "Agreement " + observedAgreement + " is below " + need + " for a " + consequenceLevel
        + " action. A worker that is sometimes right about an irreversible operation is not partly safe.",
  };
}
