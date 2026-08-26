/**
 * Company readiness.
 *
 * A company is not uniformly "ready" or "not ready". It holds a set of specific
 * capabilities, each unlocked by specific facts, and each fact is either
 * verified, reported but unverified, absent, or simply never checked. Collapsing
 * that into a readiness score would hide the only thing worth knowing: which
 * work is currently impossible, and what exactly would make it possible.
 *
 * Two rules drive the design.
 *
 * Absence is not the same as unverified. "We have no evidence of an entity" and
 * "no entity exists" are different claims, and treating the first as the second
 * has already cost a real pursuit. Every item carries the distinction.
 *
 * A task is routed by who must act, not by who noticed it. Most readiness work
 * is preparable: drafts, packets, comparisons, filled forms awaiting a signature.
 * Handing an owner a to-do list they could have been handed as a finished
 * document is a failure of the system, not a division of labour.
 */

export const READINESS_DIMENSIONS = [
  "entity", "financial", "commercial", "credibility", "insurance", "security", "procurement", "operations",
] as const;

/** What a fact, once verified, lets the company actually do. */
export const CAPABILITIES = [
  "sign_binding_contract", "invoice_and_collect", "bid_public_sector", "bid_enterprise",
  "handle_personal_data", "carry_client_risk", "be_found_by_buyers", "evidence_past_work",
  "quote_confidently", "onboard_client",
] as const;

export const FACT_STATUS = ["verified", "reported_unverified", "absent", "unknown"] as const;

/** Who is able to complete the action. Not who noticed it needed doing. */
export const ACTORS = ["midas", "owner", "adult_signer", "third_party"] as const;

export interface ReadinessItem {
  id: string;
  dimension: string;
  requirement: string;
  status: string;
  /** What the status rests on. A status with no evidence is an assertion. */
  evidence: string;
  /** Capabilities this fact unlocks. Empty means it improves odds but gates nothing. */
  gates: string[];
  actor: string;
  /** Whether MIDAS can take it to the point where one human action finishes it. */
  preparable: boolean;
  /** What MIDAS has actually produced so far, if anything. */
  prepared?: string;
  /** Why it matters, in terms of work rather than tidiness. */
  whyItGates: string;
}

function isSatisfied(item: ReadinessItem) {
  return item.status === "verified";
}

/**
 * Which capabilities the company actually has, and which are blocked by what.
 *
 * A capability is available only when every item gating it is verified. Reported
 * but unverified does not count, because a fact that has never been checked is
 * exactly the kind that fails at the moment it is relied on.
 */
export function readinessProfile(items: ReadinessItem[]) {
  const blockedBy: Record<string, ReadinessItem[]> = {};
  for (const cap of CAPABILITIES) {
    const blockers = items.filter((i) => i.gates.includes(cap) && !isSatisfied(i));
    if (blockers.length) blockedBy[cap] = blockers;
  }
  const available = CAPABILITIES.filter((c) => !blockedBy[c] && items.some((i) => i.gates.includes(c)));

  // A capability held back only by facts nobody has checked is one lookup from
  // being available. One held back by a fact that is genuinely missing needs real
  // work. Reporting both as "blocked" throws away the distinction this model
  // exists to preserve, and would read as a far worse company than the evidence
  // supports.
  const unconfirmedOnly = Object.keys(blockedBy).filter((c) =>
    blockedBy[c].every((i) => i.status === "reported_unverified" || i.status === "unknown"));
  const blockedByAbsence = Object.keys(blockedBy).filter((c) => !unconfirmedOnly.includes(c));
  const ungoverned = CAPABILITIES.filter((c) => !items.some((i) => i.gates.includes(c)));

  const byDimension: Record<string, { verified: number; reported: number; absent: number; unknown: number }> = {};
  for (const d of READINESS_DIMENSIONS) {
    const inDim = items.filter((i) => i.dimension === d);
    byDimension[d] = {
      verified: inDim.filter((i) => i.status === "verified").length,
      reported: inDim.filter((i) => i.status === "reported_unverified").length,
      absent: inDim.filter((i) => i.status === "absent").length,
      unknown: inDim.filter((i) => i.status === "unknown").length,
    };
  }

  // Facts asserted but never checked, ordered by how much rests on them. These
  // are the ones that fail at the worst possible moment.
  const unverifiedLoadBearing = items
    .filter((i) => i.status === "reported_unverified" && i.gates.length > 0)
    .sort((a, b) => b.gates.length - a.gates.length);

  // Never checked at all, which is a different and more embarrassing problem.
  const neverChecked = items.filter((i) => i.status === "unknown");

  return {
    availableCapabilities: available,
    blockedCapabilities: Object.keys(blockedBy),
    unconfirmedOnly, blockedByAbsence,
    blockedBy,
    ungovernedCapabilities: ungoverned,
    byDimension,
    unverifiedLoadBearing,
    neverChecked,
    summary: available.length + " of " + CAPABILITIES.length + " capabilities confirmed; "
      + unconfirmedOnly.length + " held back only by unchecked facts; "
      + blockedByAbsence.length + " genuinely blocked by something missing.",
  };
}

/**
 * Route the work.
 *
 * Ordering is by how many capabilities an item unblocks, then by whether MIDAS
 * can move it without anyone. The point of the split is that the owner's queue
 * should contain only things that genuinely require the owner, each arriving
 * with whatever could be prepared already attached.
 */
export function routeReadinessWork(items: ReadinessItem[]) {
  const outstanding = items.filter((i) => !isSatisfied(i));
  const weight = (i: ReadinessItem) => i.gates.length * 10 + (i.status === "unknown" ? 5 : 0);
  const sorted = [...outstanding].sort((a, b) => weight(b) - weight(a));

  const midasCanDoNow = sorted.filter((i) => i.actor === "midas");
  const midasCanPrepare = sorted.filter((i) => i.actor !== "midas" && i.preparable && !i.prepared);
  const awaitingHuman = sorted.filter((i) => i.actor !== "midas" && (!i.preparable || i.prepared));

  // The check that keeps the split honest: nothing preparable should be sitting
  // in a human's queue unprepared.
  const handedOverPrematurely = awaitingHuman.filter((i) => i.preparable && !i.prepared);

  return {
    midasCanDoNow, midasCanPrepare, awaitingHuman, handedOverPrematurely,
    ruling: handedOverPrematurely.length === 0
      ? "Nothing is waiting on a human that MIDAS could have advanced first."
      : handedOverPrematurely.length + " item(s) were handed to a human unprepared. Prepare them first.",
  };
}

// ------------------------------------------------------- readiness and work

export interface OpportunityFit {
  opportunityId: string;
  requiredCapabilities: string[];
  missing: string[];
  eligibleNow: boolean;
  /** What would have to become true, in order of how much it unblocks. */
  unlockPath: Array<{ requirement: string; actor: string; preparable: boolean }>;
  ruling: string;
}

/**
 * Whether the company can actually pursue something today.
 *
 * This annotates; it never deletes. An opportunity blocked by a missing fact is
 * still an opportunity, and the fact that a single unresolved item blocks a
 * whole class of work is usually the most useful thing on the page.
 */
export function assessOpportunityFit(args: {
  opportunityId: string;
  requiredCapabilities: string[];
  items: ReadinessItem[];
}): OpportunityFit {
  const profile = readinessProfile(args.items);
  const missing = args.requiredCapabilities.filter((c) => !profile.availableCapabilities.includes(c as any));
  const unlockPath = missing
    .flatMap((c) => profile.blockedBy[c] || [])
    .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)
    .sort((a, b) => b.gates.length - a.gates.length)
    .map((i) => ({ requirement: i.requirement, actor: i.actor, preparable: i.preparable }));

  return {
    opportunityId: args.opportunityId,
    requiredCapabilities: args.requiredCapabilities,
    missing,
    eligibleNow: missing.length === 0,
    unlockPath,
    ruling: missing.length === 0
      ? "Pursuable with what the company can currently evidence."
      : "Blocked on " + missing.join(", ") + ". Not discarded: " + unlockPath.length + " item(s) would unlock it.",
  };
}

/**
 * Rank by what readiness makes reachable, without removing anything.
 *
 * Work the company can do today sorts above work gated behind one unresolved
 * fact, which sorts above work gated behind several. Nothing is dropped, because
 * the blocked list is what tells the owner which single conversation would open
 * the most doors.
 */
export function rankByReadiness(fits: OpportunityFit[]) {
  return [...fits].sort((a, b) => {
    if (a.eligibleNow !== b.eligibleNow) return a.eligibleNow ? -1 : 1;
    return a.unlockPath.length - b.unlockPath.length;
  });
}
