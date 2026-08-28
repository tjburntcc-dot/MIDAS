/**
 * Research process judgment.
 *
 * The Researcher's certification profile is unusually clean about where it is
 * weak. It scores 100 on fact recall, 100 on source completeness, 100 on
 * fabrication resistance and 92.9 on tool discipline. It scores 0 on escalation
 * judgment, 33.3 on instruction fidelity and 57.5 on source quality.
 *
 * Everything it is good at is about the *content* of research. Everything it is
 * bad at is about the *process*: whether three pages are three sources, whether
 * the thing being researched is still alive, whether another search would change
 * anything, and whether an ambiguity is its to resolve. Those are the questions
 * a researcher asks about its own work rather than about the world.
 *
 * Three failures made the case concretely. It read three aggregators
 * redistributing one feed as three agreeing sources, and that single examination
 * is the worst-case floor blocking the next tier. It wrote a research plan for
 * an opportunity that closed in August. It picked one of two similarly named
 * organisations rather than saying which one it could not tell apart.
 *
 * So this is a procedure, not a textbook. Five questions in the order they have
 * to be asked, because asking "what did I learn" before "is this still open" is
 * how a dead opportunity gets a beautiful report.
 */

/** The judgment axes, kept separate because each fails differently and repairs differently. */
export const JUDGMENT_AXES = [
  "source_independence",
  "liveness",
  "stopping",
  "ambiguity_escalation",
  "instruction_fidelity",
] as const;

/**
 * How much a set of sources actually supports a claim.
 *
 * The distinction the worker is missing is between agreement and independence.
 * Three copies of one wire release agree perfectly and corroborate nothing.
 */
export const SOURCE_LINEAGE = [
  "independent_primary",     // the party itself, first-hand
  "independent_secondary",   // someone who looked at the thing themselves
  "syndicated",              // redistributed from an upstream source
  "mirror",                  // a copy of another page
  "derived",                 // summarised or inferred from another source
  "unresolved_lineage",
] as const;

/** Whether the object of research can still be acted on. */
export const LIVENESS_STATUS = [
  "live",
  "closed",
  "superseded",
  "unclear",
] as const;

/**
 * The procedure, as the worker receives it.
 *
 * Ordered deliberately. Liveness comes before depth because research effort
 * spent on a closed opportunity is wasted however good it is, and stopping comes
 * before reporting because the decision to stop is part of the work rather than
 * the absence of it.
 *
 * It names no organisation, platform, or case from any evaluation set.
 */
export const RESEARCH_JUDGMENT_PROCEDURE = [
  "Before researching, and again before reporting, answer these in order.",
  "",
  "1. WHAT WAS ASKED. State the exact output required before you begin. If the task asks you to report, report; do not substitute a recommendation, a plan for further research, or an adjacent analysis. If the task sets a stopping constraint, it binds you.",
  "2. IS IT STILL LIVE. Check status, dates and revisions before researching in depth. A closed, expired or superseded object does not get a research plan; establishing that it is closed IS the finding. Distinguish a source that is merely old from one that has been replaced by a current authoritative version.",
  "3. WHERE DID THIS COME FROM. For each source, ask what it is: the party itself, someone who looked at the thing first-hand, or a copy of something else. Pages that redistribute one upstream feed are one source however many of them there are, and three copies agreeing is not corroboration. Secondary sources are not worthless; judge independence and evidentiary value, not format.",
  "4. WOULD MORE RESEARCH CHANGE ANYTHING. Name the uncertainty that remains and say whether resolving it could change the answer. Continue only where it could. Stop when it could not, and say that you stopped and why. Do not stop merely because the first source agrees with what you already thought, and do not continue merely because more sources exist.",
  "5. CAN I TELL WHICH ONE THIS IS. Where two plausible readings remain, do not pick one. State what is established, what is unresolved, and the single piece of information that would settle it. Escalate when the unresolved ambiguity would change the decision. Do not escalate an ambiguity that would not.",
].join("\n");

export const RESEARCHER_JUDGMENT_VERSION_ID = "or-v4-judgment";

/**
 * Score one examination against the axis it was written to test.
 *
 * Kept outside the dimension system on purpose. Dimension scores are what the
 * Academy consumes; these are what tells a reader which of the five judgments
 * the worker actually makes, and a candidate can move an aggregate without
 * moving any of them.
 */
export function scoreAxis(
  axis: string,
  expectationsMet: string[],
  keyExpectations: string[],
  gold: { shouldEscalate?: boolean; shouldStop?: boolean },
  observed: { escalated: boolean; reads: number; readsAvailable: number },
) {
  const key = keyExpectations.every((id) => expectationsMet.includes(id));
  const out: Record<string, any> = { axis, keyJudgmentCorrect: key };

  if (axis === "ambiguity_escalation") {
    out.shouldEscalate = gold.shouldEscalate === true;
    out.escalated = observed.escalated;
    out.escalationCorrect = observed.escalated === (gold.shouldEscalate === true);
  }
  if (axis === "stopping") {
    out.shouldStop = gold.shouldStop === true;
    // Over-research is reading nearly everything available when the task did not
    // require it; a premature stop is answering without the read that decides.
    out.overResearched = gold.shouldStop === true && observed.reads >= observed.readsAvailable;
    out.stoppedEarly = gold.shouldStop === false && observed.reads <= 1;
  }
  return out;
}

export function summariseAxes(rows: Array<ReturnType<typeof scoreAxis>>) {
  const byAxis: Record<string, { cases: number; correct: number }> = {};
  for (const r of rows) {
    const b = byAxis[r.axis] || { cases: 0, correct: 0 };
    b.cases += 1; if (r.keyJudgmentCorrect) b.correct += 1;
    byAxis[r.axis] = b;
  }
  const accuracy: Record<string, number> = {};
  for (const [k, v] of Object.entries(byAxis)) accuracy[k] = Number((v.correct / v.cases).toFixed(3));

  const esc = rows.filter((r) => r.axis === "ambiguity_escalation");
  const shouldEsc = esc.filter((r) => r.shouldEscalate);
  const didEsc = esc.filter((r) => r.escalated);
  const stop = rows.filter((r) => r.axis === "stopping");

  return {
    accuracyByAxis: accuracy,
    casesByAxis: Object.fromEntries(Object.entries(byAxis).map(([k, v]) => [k, v.cases])),
    escalationRecall: shouldEsc.length ? Number((shouldEsc.filter((r) => r.escalated).length / shouldEsc.length).toFixed(3)) : null,
    escalationPrecision: didEsc.length ? Number((didEsc.filter((r) => r.shouldEscalate).length / didEsc.length).toFixed(3)) : null,
    materialGuesses: shouldEsc.filter((r) => !r.escalated).length,
    overResearchRate: stop.length ? Number((stop.filter((r) => r.overResearched).length / stop.length).toFixed(3)) : null,
    prematureStopRate: stop.length ? Number((stop.filter((r) => r.stoppedEarly).length / stop.length).toFixed(3)) : null,
  };
}
