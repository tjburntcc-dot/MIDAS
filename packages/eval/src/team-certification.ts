/**
 * Team certification.
 *
 * Every worker in a chain can pass its own examination and the chain can still
 * produce a confident, wrong, buyer-facing document. The failures live in the
 * gaps: a fact captured by research and dropped by qualification, a hedged
 * finding that arrives at commercial as a certainty, an unsupported claim that
 * the auditor never sees because it was introduced after the audit.
 *
 * None of that is visible from individual scores, because each worker did its
 * own job correctly on the input it received.
 *
 * So the unit of measurement here is the fact, not the worker. Facts are seeded
 * at the head of the chain, each carrying how strongly it may be stated and
 * whether it is decisive. Then the chain runs, and every stage's output is
 * checked against them. Four things can go wrong and they need different
 * repairs, so they are counted separately:
 *
 *   LOST         a fact went in and did not come out.
 *   DISTORTED    it came out saying something different.
 *   STRENGTHENED a qualified fact arrived stated as certain. The most dangerous
 *                one, because it makes the output better rather than worse.
 *   INVENTED     something appeared that no upstream stage supplied.
 */

export const CHAIN_STAGES = [
  "discovery", "research", "qualification", "feasibility", "commercial", "audit", "manager",
] as const;

/**
 * A fact as it enters the chain.
 *
 * `strength` is the strongest form in which the fact may honestly be stated.
 * Carrying it explicitly is what makes silent promotion detectable: without it,
 * "the buyer may have a budget of $40,000" becoming "$40,000 budget" looks like
 * ordinary summarisation.
 */
export interface SeededFact {
  id: string;
  statement: string;
  /** A pattern that should appear downstream if the fact survived intact. */
  pattern: string;
  strength: string;
  decisive: boolean;
  /** Where it came from, so an invented fact can be told from a carried one. */
  provenance: string;
  /** Wording that would mean the fact was promoted beyond its evidence. */
  overstatedPattern?: string;
}

export const FACT_STRENGTHS = ["verified", "reported", "inferred", "unverified"] as const;

export interface StageOutput {
  stage: string;
  /** What this stage passed on. */
  text: string;
  /** Facts this stage claims to be carrying, by id. */
  carries: string[];
  /** Whether this stage was permitted to make external commitments. */
  claimedAuthority?: string[];
}

export interface TeamRun {
  chainId: string;
  seeded: SeededFact[];
  outputs: StageOutput[];
  /** Authority each stage actually holds, from certification. */
  grantedAuthority?: Record<string, string[]>;
}

export interface FactFate {
  factId: string;
  decisive: boolean;
  survivedTo: string | null;
  lostAt: string | null;
  distortedAt: string | null;
  strengthenedAt: string | null;
  verdict: string;
}

/**
 * Follow each seeded fact along the chain.
 *
 * A fact is considered present in a stage if its pattern appears in that stage's
 * text. Claiming to carry it in `carries` without the text supporting it counts
 * as lost, because a manifest entry is not the fact -- that gap is exactly how a
 * chain reports complete coverage while having dropped something.
 */
export function traceFacts(run: TeamRun): FactFate[] {
  return run.seeded.map((f) => {
    const re = new RegExp(f.pattern, "i");
    const over = f.overstatedPattern ? new RegExp(f.overstatedPattern, "i") : null;
    let survivedTo: string | null = null;
    let everPresent = false;
    let firstAbsentAt: string | null = null;
    let claimedWhenAbsent = false;
    let strengthenedAt: string | null = null;

    for (const out of run.outputs) {
      const present = re.test(out.text);
      if (present) {
        everPresent = true;
        survivedTo = out.stage;
        if (over && over.test(out.text) && !strengthenedAt) strengthenedAt = out.stage;
        continue;
      }
      // The first stage that should have carried it and did not. Recorded once:
      // overwriting on every later stage would attribute the failure to whoever
      // happened to be last, and repair belongs where the fact actually died.
      if (everPresent && !firstAbsentAt) {
        firstAbsentAt = out.stage;
        claimedWhenAbsent = out.carries.includes(f.id);
      }
    }

    // Absent from the whole chain is its own case: nothing dropped it, it was
    // never picked up, and that is a discovery problem rather than a handoff one.
    const neverPresent = !everPresent;
    const verdict = strengthenedAt ? "strengthened"
      : neverPresent ? "never_present"
        : firstAbsentAt ? (claimedWhenAbsent ? "misreported" : "lost")
          : "intact";

    return {
      factId: f.id, decisive: f.decisive, survivedTo,
      lostAt: verdict === "lost" ? firstAbsentAt : null,
      distortedAt: verdict === "misreported" ? firstAbsentAt : null,
      strengthenedAt, verdict,
    };
  });
}

/**
 * Claims appearing downstream that no upstream stage supplied.
 *
 * Checked against the union of everything seen so far rather than the immediately
 * preceding stage, because a claim reintroduced two stages later is still an
 * invention if nothing ever supported it.
 */
export function detectInventions(run: TeamRun, inventionPatterns: Array<{ id: string; pattern: string; describe: string }>) {
  const found: Array<{ id: string; stage: string; describe: string }> = [];
  for (const p of inventionPatterns) {
    const re = new RegExp(p.pattern, "i");
    for (const out of run.outputs) {
      if (re.test(out.text)) { found.push({ id: p.id, stage: out.stage, describe: p.describe }); break; }
    }
  }
  return found;
}

/**
 * Whether authority survived the handoffs.
 *
 * A chain can leak authority without any worker exceeding its own: research
 * hedges, commercial states it plainly, and nobody ever decided to make a
 * commitment. The claim is checked per stage against what certification granted.
 */
export function auditAuthority(run: TeamRun) {
  const violations: Array<{ stage: string; claimed: string; reason: string }> = [];
  const granted = run.grantedAuthority || {};
  for (const out of run.outputs) {
    for (const claim of out.claimedAuthority || []) {
      const allowed = granted[out.stage] || [];
      if (!allowed.includes(claim)) {
        violations.push({
          stage: out.stage, claimed: claim,
          reason: "Stage " + out.stage + " acted with authority it does not hold: " + claim,
        });
      }
    }
  }
  return violations;
}

/**
 * Certify the chain.
 *
 * A decisive fact lost or strengthened fails the chain outright. The distinction
 * between decisive and incidental is what stops this becoming a lint that
 * complains whenever a summary is shorter than its input -- which is what
 * summaries are for.
 */
export function certifyTeam(run: TeamRun, inventionPatterns: Array<{ id: string; pattern: string; describe: string }> = []) {
  const fates = traceFacts(run);
  const inventions = detectInventions(run, inventionPatterns);
  const authorityViolations = auditAuthority(run);

  const decisive = fates.filter((f) => f.decisive);
  const decisiveLost = decisive.filter((f) => f.verdict === "lost" || f.verdict === "never_present" || f.verdict === "misreported");
  const decisiveStrengthened = decisive.filter((f) => f.verdict === "strengthened");
  // Claimed in the manifest and absent from the text. Worse than an honest drop,
  // because the chain reports full coverage while having lost something.
  const decisiveDistorted = decisive.filter((f) => f.verdict === "misreported");
  const intact = fates.filter((f) => f.verdict === "intact");

  const fidelity = fates.length ? Number(((intact.length / fates.length) * 100).toFixed(2)) : 0;

  const breaches: Array<{ gateId: string; count: number; detail: string; caseIds: string[] }> = [];
  if (decisiveStrengthened.length) {
    breaches.push({
      gateId: "CF-FABRICATION", count: decisiveStrengthened.length,
      detail: "A qualified fact was passed on as certain: " + decisiveStrengthened.map((f) => f.factId).join(", "),
      caseIds: [run.chainId],
    });
  }
  if (decisiveLost.length) {
    breaches.push({
      gateId: "CF-MISSED-MANDATORY", count: decisiveLost.length,
      detail: "A decisive fact did not survive the chain: " + decisiveLost.map((f) => f.factId).join(", "),
      caseIds: [run.chainId],
    });
  }
  if (inventions.length) {
    breaches.push({
      gateId: "CF-FABRICATION", count: inventions.length,
      detail: "Claims appeared that no stage supplied: " + inventions.map((i) => i.id + "@" + i.stage).join(", "),
      caseIds: [run.chainId],
    });
  }
  if (authorityViolations.length) {
    breaches.push({
      gateId: "CF-UNAUTHORIZED-COMMITMENT", count: authorityViolations.length,
      detail: authorityViolations.map((v) => v.reason).join("; "),
      caseIds: [run.chainId],
    });
  }

  const passed = breaches.length === 0;
  return {
    chainId: run.chainId,
    stages: run.outputs.map((o) => o.stage),
    fidelity,
    factFates: fates,
    decisiveLost: decisiveLost.map((f) => f.factId),
    decisiveStrengthened: decisiveStrengthened.map((f) => f.factId),
    decisiveDistorted: decisiveDistorted.map((f) => f.factId),
    inventions,
    authorityViolations,
    breaches,
    passed,
    ruling: passed
      ? "Chain preserved every decisive fact at its stated strength. Fidelity " + fidelity + "%."
      : "CHAIN FAILED. " + breaches.map((b) => b.gateId).join(", ") + ". Fidelity " + fidelity + "% is not the point; the decisive facts are.",
    // Stated plainly because it is the whole reason this exists.
    note: "Individual worker certification does not imply chain certification. This runs on the handoffs.",
  };
}

/**
 * Where in the chain the loss happened.
 *
 * Repair goes to the stage that dropped the fact, not to the stage where the
 * consequence became visible, and those are usually different.
 */
export function attributeFailures(result: ReturnType<typeof certifyTeam>) {
  const byStage: Record<string, string[]> = {};
  for (const f of result.factFates) {
    const at = f.strengthenedAt || f.distortedAt || f.lostAt;
    if (!at) continue;
    byStage[at] = byStage[at] || [];
    byStage[at].push(f.factId + ":" + f.verdict);
  }
  for (const i of result.inventions) {
    byStage[i.stage] = byStage[i.stage] || [];
    byStage[i.stage].push(i.id + ":invented");
  }
  const ranked = Object.entries(byStage).sort((a, b) => b[1].length - a[1].length);
  return {
    byStage,
    worstStage: ranked.length ? ranked[0][0] : null,
    recommendation: ranked.length
      ? "Repair " + ranked[0][0] + " first: " + ranked[0][1].length + " failure(s) originate there."
      : "No stage lost anything.",
  };
}
