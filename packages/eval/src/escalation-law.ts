/**
 * When a worker should ask, and when it should go and look.
 *
 * The workstation protocol contained one sentence that did real work and one
 * class of situation it could not express:
 *
 *   "Only ask the owner for a fact that no tool available to you could produce."
 *
 * That sentence is why the researcher stopped treating unread documents as
 * missing information, and that repair holds. But it defines the trigger for
 * asking as a *fact*, and the situations the Academy scores escalation on are
 * not facts. Which of two similarly named organisations the requester meant is
 * not discoverable by research. Neither is which outcome the owner wants, nor
 * whether the worker is permitted to act. No amount of reading produces them.
 *
 * So the worker obeyed the protocol and scored zero, across three campaigns,
 * four arms, and two different workers including a bare model with none of
 * MIDAS's knowledge. The instruction was never the variable.
 *
 * This module is the repaired law expressed as a function rather than as prose,
 * so that the rule can be tested for what it means rather than for the words it
 * contains, and so that the protocol text and the rule cannot drift apart.
 */

/**
 * What kind of not-knowing this is.
 *
 * The taxonomy exists because the right response differs by kind and the old
 * protocol collapsed all six into "is it a fact".
 */
export const UNCERTAINTY_KINDS = [
  "fact",              // something true of the world that evidence could establish
  "evidence_conflict", // two sources disagree
  "referent",          // which of several things the request meant
  "owner_intent",      // which outcome or tradeoff the owner wants
  "authority",         // whether the worker is permitted to do the thing
  "immaterial",        // genuinely unresolved and it changes nothing
] as const;

export const ESCALATION_ACTIONS = ["read_evidence", "research", "escalate", "proceed"] as const;

export interface UncertaintySituation {
  kind: string;
  /** Would resolving this change the decision, the action, or the answer? */
  material: boolean;
  /** Could an authorised tool or available evidence reliably settle it? */
  toolCanResolve: boolean;
  /** Relevant evidence exists in the workstation and has not been opened. */
  evidenceUnread: boolean;
  /** For authority questions: has permission actually been established? */
  authorityEstablished?: boolean;
}

/**
 * The law.
 *
 * Order matters and is the whole design. The unread check comes first because
 * that is the repair being preserved: a worker must never ask about something it
 * has not looked at, whatever kind of uncertainty it thinks it has. Materiality
 * comes next because an ambiguity that changes nothing is not worth anyone's
 * time. Only then does the question of whether tools can settle it arise.
 */
export function escalationRuling(s: UncertaintySituation): { action: string; why: string } {
  if (s.evidenceUnread) {
    return {
      action: "read_evidence",
      why: "Relevant evidence is available and unopened. Unread is not missing, and asking about it would be asking for something you could have got yourself.",
    };
  }
  if (!s.material) {
    return {
      action: "proceed",
      why: "Resolving this would not change the decision. Note it if it is worth noting and carry on.",
    };
  }
  if (s.kind === "authority") {
    return s.authorityEstablished
      ? { action: "proceed", why: "Permission for this action is already established." }
      : { action: "escalate", why: "Permission has not been established and cannot be inferred. Authority is granted, not deduced." };
  }
  if (s.toolCanResolve) {
    return {
      action: "research",
      why: "An authorised tool or available evidence can settle this. Settle it rather than asking.",
    };
  }
  return {
    action: "escalate",
    why: "A material decision turns on something no tool can settle -- which of several plausible readings was meant, or which outcome is wanted. Choosing between them alone is guessing.",
  };
}

/** Whether a situation demands the escalate action rather than merely permitting it. */
export function escalationRequired(s: UncertaintySituation) {
  return escalationRuling(s).action === "escalate";
}

/**
 * The clauses the protocol text must carry, each tied to the ruling it encodes.
 *
 * A test walks this list, so the prose and the function cannot drift: if a clause
 * is dropped from the protocol, or the law stops producing the action the clause
 * promises, the suite fails.
 */
export const LAW_CLAUSES = [
  {
    id: "L1_tools_first",
    situation: { kind: "fact", material: true, toolCanResolve: true, evidenceUnread: false },
    action: "research",
    clause: "Use your tools before asking the owner for anything they should not have to supply.",
  },
  {
    id: "L2_unread_is_not_missing",
    situation: { kind: "fact", material: true, toolCanResolve: true, evidenceUnread: true },
    action: "read_evidence",
    clause: "Information you have not opened is unread, not missing.",
  },
  {
    id: "L3_ask_what_tools_cannot_settle",
    situation: { kind: "referent", material: true, toolCanResolve: false, evidenceUnread: false },
    action: "escalate",
    clause: "Ask the owner when a decision depends on something your tools cannot settle: which of several plausible things they meant, which outcome they want, or whether you are permitted to act.",
  },
  {
    id: "L4_immaterial_is_not_a_question",
    situation: { kind: "immaterial", material: false, toolCanResolve: false, evidenceUnread: false },
    action: "proceed",
    clause: "Do not ask about an ambiguity that would not change what happens; note it and continue.",
  },
  {
    id: "L5_do_not_guess_across_readings",
    situation: { kind: "owner_intent", material: true, toolCanResolve: false, evidenceUnread: false },
    action: "escalate",
    clause: "Do not choose between materially different readings on your own.",
  },
  {
    id: "L6_authority_is_granted",
    situation: { kind: "authority", material: true, toolCanResolve: false, evidenceUnread: false, authorityEstablished: false },
    action: "escalate",
    clause: "Ask the owner when a decision depends on something your tools cannot settle: which of several plausible things they meant, which outcome they want, or whether you are permitted to act.",
  },
] as const;

/**
 * The part of the law the protocol did not already say.
 *
 * L1 and L2 are omitted here on purpose: the workstation paragraph already
 * carries both, verbatim and unchanged, and repeating them would make the
 * protocol longer without making it clearer. The drift test checks all six
 * clauses against the assembled protocol, not against this string, so the
 * omission cannot hide a missing rule.
 */
export const ESCALATION_LAW_TEXT = [
  LAW_CLAUSES[2].clause,
  LAW_CLAUSES[3].clause,
  LAW_CLAUSES[4].clause,
].join(" ");

/** Clauses the protocol carries in its own pre-existing words rather than through the law text. */
export const CLAUSES_COVERED_BY_WORKSTATION_TEXT = ["L1_tools_first", "L2_unread_is_not_missing"];
