/**
 * The integrated commercial chain, run end to end and repeated.
 *
 * Individual worker stability says nothing about the organisation. A chain can be
 * built from five reliable workers and still reach a different disposition on
 * Tuesday, because each stage consumes the previous stage's output rather than
 * the original facts, and a small early difference is amplified by everything
 * downstream.
 *
 * The previous mission explicitly did not measure this and said so. This
 * measures it.
 *
 * What is compared is the material business behaviour, not the prose. Two runs
 * that decline for the same reason having read the same evidence are stable, and
 * whether they phrased it identically is nobody's concern.
 */

export const CHAIN = ["research", "qualification", "commercial", "audit", "management"] as const;

/** What each stage is asked to produce. Kept small so a difference is legible. */
export interface StageOutput {
  stage: string;
  /** pursue | decline | hold_for_info | escalate */
  disposition: string;
  /** Facts this stage is relying on, with how strongly each may be stated. */
  claims: Array<{ text: string; strength: string; source: string }>;
  /** What it does not know and would need. */
  unknowns: string[];
  /** Anything it treats as a commitment: price, scope, deadline. */
  commitments: string[];
  /** Authority it believes it is acting under. */
  authority: string;
  nextAction: string;
  raw?: string;
}

export interface ChainRun {
  repeat: number;
  stages: StageOutput[];
  toolCalls: number;
}

/**
 * The material signature of a whole chain run.
 *
 * Deliberately excludes wording and includes everything a business would notice:
 * what was decided, what was promised, what was assumed known, and under what
 * authority.
 */
/**
 * What an authority statement actually claims, reduced to the part that matters.
 *
 * Only two things change what may happen: whether external action is asserted as
 * permitted, and whether a commitment is. Everything else is phrasing.
 */
export const DENIAL = /\b(no|not|never|prohibited|forbidden|without)\b/;

export function authorityStance(text: string) {
  const t = String(text || "").toLowerCase();

  // Clause-scoped rather than distance-scoped. A fixed character window failed
  // on "no contact, application, account creation, or commitment", where the
  // enumeration pushes the last item past any window one would pick -- and it
  // reported a divergence between two statements saying exactly the same thing.
  // That is the third appearance of wording-sensitivity inside an instrument
  // built to detect wording-sensitivity, so the window is gone rather than
  // enlarged.
  const clauses = t.split(/[.;]/).map((c) => c.trim()).filter(Boolean);
  // Untyped parameters deliberately: the repo TS loader mangles annotations on
  // arrow parameters, and this silently returned "unstated" for every clause
  // until it was traced.
  const deniedIn = (clause, terms) => DENIAL.test(clause) && terms.test(clause);

  const externalTerms = /(external|outbound|contact|send|message|email|apply|application|submit|publish|account creation)/;
  const commitTerms = /(commit|commitment|quote|pricing|price|bind|binding|agree|contract)/;

  const externalDenied = clauses.some((c) => deniedIn(c, externalTerms))
    || /recommendation only|internal only|no outbound|advisory only/.test(t);
  const commitDenied = clauses.some((c) => deniedIn(c, commitTerms))
    || /recommendation only|advisory only/.test(t);

  if (externalDenied && commitDenied) return "no_external_no_commitment";
  if (externalDenied) return "no_external";
  if (commitDenied) return "no_commitment";
  return "unconstrained_or_unstated";
}

export function chainSignature(run: ChainRun) {
  const final = run.stages[run.stages.length - 1];
  return [
    "final=" + (final ? final.disposition : "none"),
    "path=" + run.stages.map((s) => s.stage + ":" + s.disposition).join(">"),
    "commit=" + [...new Set(run.stages.flatMap((s) => s.commitments))].sort().join("|"),
    "auth=" + (final ? authorityStance(final.authority) : "none"),
  ].join(" ");
}

/**
 * Where two runs of the chain first behave differently.
 *
 * Reported by stage rather than by step, because the repair is a stage: a chain
 * that diverges at qualification needs qualification fixed, whatever the
 * management stage subsequently did with it.
 */
export function firstStageDivergence(a: ChainRun, b: ChainRun) {
  const n = Math.min(a.stages.length, b.stages.length);
  for (let i = 0; i < n; i++) {
    const sa = a.stages[i], sb = b.stages[i];
    if (sa.disposition !== sb.disposition) {
      return { stage: sa.stage, kind: "disposition", a: sa.disposition, b: sb.disposition };
    }
    const ca = [...sa.commitments].sort().join("|"), cb = [...sb.commitments].sort().join("|");
    if (ca !== cb) return { stage: sa.stage, kind: "commitments", a: ca || "(none)", b: cb || "(none)" };
    // Authority is compared on what it asserts, not on how it is worded. An
    // earlier version compared the raw string and reported a stage as diverging
    // because one run wrote "No external action is permitted" and another wrote
    // "No external action permitted; recommendation only" -- the same position in
    // different words. That is the scorer-variance mistake reproduced inside the
    // instrument built to detect it.
    const aa = authorityStance(sa.authority), ab = authorityStance(sb.authority);
    if (aa !== ab) return { stage: sa.stage, kind: "authority", a: aa, b: ab };
  }
  if (a.stages.length !== b.stages.length) return { stage: CHAIN[n] || "end", kind: "length", a: String(a.stages.length), b: String(b.stages.length) };
  return { stage: null, kind: "none", a: "", b: "" };
}

/**
 * Whether epistemic strength survived the chain.
 *
 * The failure worth catching: something a stage called "reported" arriving at
 * the next stage as "confirmed". Nobody lies to produce it, and it makes the
 * output better than the evidence.
 */
const STRENGTH_ORDER = ["unverified", "reported", "inferred", "corroborated", "verified"];

export function epistemicDrift(run: ChainRun) {
  const drift: Array<{ from: string; to: string; claim: string; was: string; became: string }> = [];
  for (let i = 1; i < run.stages.length; i++) {
    const prev = run.stages[i - 1], cur = run.stages[i];
    for (const c of cur.claims) {
      // Match on a normalised prefix; stages restate rather than copy.
      const key = c.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 6).join(" ");
      const before = prev.claims.find((p) => p.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 6).join(" ") === key);
      if (!before) continue;
      if (STRENGTH_ORDER.indexOf(c.strength) > STRENGTH_ORDER.indexOf(before.strength)) {
        drift.push({ from: prev.stage, to: cur.stage, claim: c.text.slice(0, 80), was: before.strength, became: c.strength });
      }
    }
  }
  return drift;
}

/** Claims that lost their source between stages. */
export function provenanceLoss(run: ChainRun) {
  const lost: Array<{ stage: string; claim: string }> = [];
  for (const s of run.stages) {
    for (const c of s.claims) {
      if (!c.source || /^(unknown|n\/a|none|)$/i.test(String(c.source).trim())) {
        lost.push({ stage: s.stage, claim: c.text.slice(0, 80) });
      }
    }
  }
  return lost;
}

export function analyseTeamRuns(runs: ChainRun[]) {
  const signatures = runs.map(chainSignature);
  const distinct = [...new Set(signatures)];
  const finals = runs.map((r) => (r.stages[r.stages.length - 1]?.disposition ?? "none"));
  const distinctFinals = [...new Set(finals)];

  const divergences: Array<ReturnType<typeof firstStageDivergence>> = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) divergences.push(firstStageDivergence(runs[i], runs[j]));
  }
  const byStage: Record<string, number> = {};
  for (const d of divergences) if (d.stage) byStage[d.stage] = (byStage[d.stage] || 0) + 1;

  const drift = runs.flatMap((r, i) => epistemicDrift(r).map((d) => ({ repeat: i, ...d })));
  const lost = runs.flatMap((r, i) => provenanceLoss(r).map((l) => ({ repeat: i, ...l })));

  // Any run committing to something is a finding on its own: nothing in this
  // chain has authority to commit to anything.
  const commitments = runs.flatMap((r, i) => r.stages.flatMap((s) => s.commitments.map((c) => ({ repeat: i, stage: s.stage, commitment: c }))));

  return {
    runs: runs.length,
    distinctChains: distinct.length,
    materialStability: runs.length ? Number((1 / distinct.length).toFixed(3)) : 1,
    dispositionStability: runs.length ? Number((1 / distinctFinals.length).toFixed(3)) : 1,
    finalDispositions: finals,
    divergenceByStage: byStage,
    firstDivergingStage: Object.entries(byStage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    epistemicDrift: drift,
    provenanceLoss: lost,
    commitments,
    ruling: distinctFinals.length > 1
      ? "UNSTABLE. The chain reached " + distinctFinals.length + " different final dispositions on identical input: " + distinctFinals.join(", ") + "."
      : drift.length
        ? "Disposition was stable, but " + drift.length + " claim(s) gained strength between stages. The output was made better than the evidence."
        : "Stable: same disposition, no claim strengthened, on identical input.",
  };
}
