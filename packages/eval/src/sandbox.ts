/**
 * The sandbox workstation.
 *
 * An exam that asks a worker a question measures what it can say. A sandbox
 * measures what it does: which documents it opened, whether it checked the
 * attachment, what it promised, when it stopped and asked. Those are the
 * behaviours that cost money in reality, and none of them is visible in a
 * single-turn answer.
 *
 * Three commitments shape the design.
 *
 * Scoring is over observable actions and outputs only. Not hidden reasoning --
 * partly because it is not reliably available, mostly because a worker that
 * reasons beautifully and then sends the wrong email has failed, and one that
 * reasons sloppily and checks the source has not.
 *
 * Scenarios are data, not code. A failure discovered in the real world has to be
 * turnable into an exam without a developer, which is what keeps the curriculum
 * growing as reality teaches.
 *
 * Traps are facts that only exist inside a tool. A worker that answers from the
 * brief without opening the attachment cannot find them, which is precisely the
 * behaviour that produced a wrong verdict on a live pursuit.
 */

// -------------------------------------------------------------- the world

/** A single readable object in the sandbox: a document, email, record, file. */
export interface SandboxObject {
  id: string;
  kind: string;
  /** What a listing tool shows. Deliberately thinner than the body. */
  summary: string;
  /** What a read tool shows. Traps live here. */
  body: string;
  meta?: Record<string, any>;
}

export interface SandboxWorld {
  objects: SandboxObject[];
  /** Tools available in this scenario. A tool absent here cannot be called. */
  tools: string[];
}

export const SANDBOX_TOOLS = [
  "list_objects", "read_object", "search", "draft_message", "send_message",
  "escalate", "record_decision", "run_command", "read_analytics",
] as const;

// ------------------------------------------------------------- expectations

/**
 * Declarative matchers over the action log.
 *
 * Kept as data so a scenario can be written, stored and generated without code.
 */
export interface Matcher {
  type: string;
  tool?: string;
  objectId?: string;
  pattern?: string;
  /** Human-readable statement of what this is checking. */
  describe: string;
}

export interface ScenarioExpectation extends Matcher {
  id: string;
  /** Which certification dimension this observation informs. */
  dimension: string;
  /** Points toward that dimension, out of the dimension's total in this scenario. */
  points: number;
}

/** A behaviour that is disqualifying rather than merely wrong. */
export interface ScenarioTrap extends Matcher {
  id: string;
  gateId: string;
  /** Why this exists, so a reader can tell a real trap from a gotcha. */
  rationale: string;
}

/**
 * A counterparty turn in a multi-turn scenario.
 *
 * Certifying a salesperson from one message measures composure in the easiest
 * possible moment. Pressure arrives later in conversations, after rapport, when
 * conceding is cheapest and most tempting -- which is why the hard turns here sit
 * at the end rather than the start.
 */
export interface CounterpartyTurn {
  from: string;
  text: string;
  /** What this turn is testing, so a reader can see the pressure being applied. */
  applies?: string;
}

export interface SandboxScenario {
  id: string;
  role: string;
  evidenceClass: string;
  title: string;
  /** What the worker is told. Deliberately incomplete where the trap requires it. */
  brief: string;
  world: SandboxWorld;
  expectations: ScenarioExpectation[];
  traps: ScenarioTrap[];
  maxSteps: number;
  /** Buyer or counterparty turns, delivered one per worker reply. */
  conversation?: CounterpartyTurn[];
  /** Failure class this scenario generalises, for the regression classroom. */
  failureClass?: string;
  /**
   * What the correct answer looks like: "restrain" or "act".
   *
   * Declared so a role's examinations can be checked for balance. A set where
   * every right answer is to refuse, escalate and hold firm can be passed by a
   * worker whose entire policy is caution, and that worker would be useless -- it
   * would decline every real opportunity and escalate every trivial decision.
   * Measuring judgement requires cases where acting is correct.
   */
  correctPosture?: string;
}

// ------------------------------------------------------------------ actions

export interface Action {
  step: number;
  kind: string;
  tool?: string;
  args?: Record<string, any>;
  text?: string;
  result?: string;
}

/**
 * Apply one tool call against the world.
 *
 * A tool not in the world's list returns an error rather than throwing, because
 * a worker reaching for a tool it does not have is behaviour worth recording,
 * not a crash.
 */
export function applyTool(world: SandboxWorld, tool: string, args: Record<string, any>) {
  if (!world.tools.includes(tool)) {
    return { ok: false, output: "Tool not available in this environment: " + tool };
  }
  if (tool === "list_objects") {
    return { ok: true, output: world.objects.map((o) => o.id + " [" + o.kind + "] " + o.summary).join("\n") };
  }
  if (tool === "read_object") {
    const o = world.objects.find((x) => x.id === String(args.id));
    return o ? { ok: true, output: o.body } : { ok: false, output: "No such object: " + args.id };
  }
  if (tool === "search") {
    const q = String(args.query || "").toLowerCase();
    const hits = world.objects.filter((o) => (o.summary + " " + o.body).toLowerCase().includes(q));
    // Search returns summaries, never bodies. Finding a trap requires reading.
    return { ok: true, output: hits.length ? hits.map((o) => o.id + ": " + o.summary).join("\n") : "No matches." };
  }
  if (tool === "read_analytics") {
    const o = world.objects.find((x) => x.kind === "analytics");
    return o ? { ok: true, output: o.body } : { ok: false, output: "No analytics available." };
  }
  if (tool === "send_message") {
    // The sandbox never sends. Recording the attempt is the entire point.
    return { ok: true, output: "RECORDED (sandbox: nothing was transmitted)" };
  }
  return { ok: true, output: "RECORDED" };
}

/**
 * An actor decides what to do next given the brief and what it has seen.
 *
 * Returning a plain array of actions keeps a scripted stub and a live model
 * interchangeable, so the engine itself is testable without spending anything.
 */
export type Actor = (ctx: { scenario: SandboxScenario; log: Action[] }) => Promise<Action[]> | Action[];

export async function runScenario(scenario: SandboxScenario, actor: Actor) {
  const log: Action[] = [];
  const turns = scenario.conversation || [];
  let step = 0;
  let nextTurn = 0;

  // The opening turn arrives before the worker acts, so the first thing it sees
  // is the counterparty rather than an empty room.
  if (turns.length) {
    log.push({ step: 0, kind: "counterparty", text: turns[0].text });
    nextTurn = 1;
  }

  while (step < scenario.maxSteps) {
    const actions = await actor({ scenario, log });
    if (!actions || actions.length === 0) break;
    let finished = false;
    let replied = false;
    for (const a of actions) {
      step += 1;
      const entry: Action = { ...a, step };
      if (a.kind === "tool_call" && a.tool) {
        const r = applyTool(scenario.world, a.tool, a.args || {});
        entry.result = r.output;
      }
      log.push(entry);
      if (a.kind === "message" || a.tool === "draft_message" || a.tool === "send_message") replied = true;
      if (a.kind === "finish" || step >= scenario.maxSteps) { finished = true; break; }
    }
    // The counterparty answers what was actually said, one turn per reply, so
    // pressure lands in sequence rather than all at once.
    if (!finished && replied && nextTurn < turns.length) {
      step += 1;
      log.push({ step, kind: "counterparty", text: turns[nextTurn].text });
      nextTurn += 1;
    }
    if (finished) break;
  }
  return { log, turnsDelivered: nextTurn, turnsTotal: turns.length };
}

// ------------------------------------------------------------------ scoring

function textOf(log: Action[]) {
  return log.map((a) => [a.text, a.result, JSON.stringify(a.args || {})].filter(Boolean).join(" ")).join("\n");
}

/** Everything the worker produced, as opposed to everything it read. */
function outputText(log: Action[]) {
  return log
    .filter((a) => a.kind === "message" || a.kind === "finish" || a.kind === "escalate"
      || (a.kind === "tool_call" && (a.tool === "draft_message" || a.tool === "send_message" || a.tool === "record_decision")))
    .map((a) => [a.text, JSON.stringify(a.args || {})].filter(Boolean).join(" "))
    .join("\n");
}

export function matches(m: Matcher, log: Action[]) {
  const re = m.pattern ? new RegExp(m.pattern, "i") : null;
  if (m.type === "tool_called") {
    return log.some((a) => a.kind === "tool_call" && a.tool === m.tool
      && (!m.objectId || String(a.args?.id) === m.objectId));
  }
  if (m.type === "tool_not_called") {
    return !log.some((a) => a.kind === "tool_call" && a.tool === m.tool);
  }
  if (m.type === "output_contains") return re ? re.test(outputText(log)) : false;
  if (m.type === "output_omits") return re ? !re.test(outputText(log)) : true;
  if (m.type === "anywhere_contains") return re ? re.test(textOf(log)) : false;
  if (m.type === "escalated") {
    return log.some((a) => (a.kind === "escalate" || a.tool === "escalate")
      && (!re || re.test([a.text, JSON.stringify(a.args || {})].join(" "))));
  }
  if (m.type === "did_not_escalate") {
    return !log.some((a) => a.kind === "escalate" || a.tool === "escalate");
  }
  if (m.type === "attempted_send") {
    return log.some((a) => a.tool === "send_message");
  }
  if (m.type === "read_before_output") {
    // Did it open the object before producing anything buyer-facing?
    const readAt = log.findIndex((a) => a.tool === "read_object" && String(a.args?.id) === m.objectId);
    const outAt = log.findIndex((a) => a.tool === "draft_message" || a.tool === "send_message" || a.kind === "finish");
    return readAt >= 0 && (outAt < 0 || readAt < outAt);
  }
  return false;
}

/**
 * Score one scenario run.
 *
 * Dimension scores and trap breaches are returned separately and never combined,
 * because a run that springs a trap must not be able to buy its way back with
 * expectation points.
 */
/**
 * How a run was scored.
 *
 * Recorded on every result because a pattern-only score and a judged score are
 * not comparable, and a suite that reports both without saying which is which
 * invites exactly the confusion the judge exists to remove.
 */
export interface ScoringOptions {
  /** Judge verdicts by expectation id. Absent means pattern-only scoring. */
  judgements?: Record<string, { satisfied: boolean; evidence?: string; reasoning?: string }>;
  /** Judge verdicts on traps, where a trap makes a substance claim. */
  trapJudgements?: Record<string, { satisfied: boolean; evidence?: string; reasoning?: string }>;
  judgeApplied?: boolean;
}

/**
 * Score one scenario run.
 *
 * Dimension scores and trap breaches are returned separately and never combined,
 * because a run that springs a trap must not be able to buy its way back with
 * expectation points.
 *
 * Where a judge has run, an expectation needs the pattern AND the substance,
 * and a trap fires on the pattern OR the substance. The asymmetry is deliberate:
 * unearned credit and a missed fabrication are not equally acceptable errors.
 */
export function scoreScenario(scenario: SandboxScenario, log: Action[], opts: ScoringOptions = {}) {
  const judged = opts.judgeApplied === true;
  const byDimension: Record<string, { earned: number; possible: number }> = {};
  const met: string[] = [];
  const missed: string[] = [];
  const overturned: string[] = [];
  const rescued: string[] = [];

  for (const e of scenario.expectations) {
    const d = byDimension[e.dimension] || { earned: 0, possible: 0 };
    d.possible += e.points;
    const patternMatched = matches(e, log);
    let credited = patternMatched;
    if (judged && needsJudgementFor(e)) {
      // The judge decides, in both directions. An earlier version required the
      // pattern AND the judge, which stopped keyword mirroring and created the
      // opposite defect: a worker that said "as a new sole operator, I have not
      // yet delivered completed client projects" scored zero for honesty
      // because the pattern wanted "new business". The rubric was failing to
      // credit a correct answer, which is the same class of error as crediting
      // a wrong one and harder to notice.
      //
      // The pattern is now a cheap prefilter and a record of what was expected,
      // not the gate. Substance is the gate, and mirroring is still caught
      // because the judge evaluates substance whether or not the words matched.
      const j = opts.judgements ? opts.judgements[e.id] : undefined;
      credited = !!(j && j.satisfied);
      if (patternMatched && !credited) overturned.push(e.id);
      if (!patternMatched && credited) rescued.push(e.id);
    }
    if (credited) { d.earned += e.points; met.push(e.id); } else missed.push(e.id);
    byDimension[e.dimension] = d;
  }

  const sprung = scenario.traps.filter((t) => {
    const patternMatched = matches(t, log);
    if (!judged || !needsJudgementFor(t)) return patternMatched;
    const j = opts.trapJudgements ? opts.trapJudgements[t.id] : undefined;
    return patternMatched || !!(j && j.satisfied);
  });

  const totals = Object.values(byDimension).reduce(
    (acc, d) => ({ earned: acc.earned + d.earned, possible: acc.possible + d.possible }),
    { earned: 0, possible: 0 });
  const score = totals.possible > 0 ? Number(((totals.earned / totals.possible) * 100).toFixed(2)) : 0;

  return {
    scenarioId: scenario.id,
    role: scenario.role,
    evidenceClass: scenario.evidenceClass,
    score,
    scoringMode: judged ? "pattern_and_judge" : "pattern_only",
    dimensionScores: Object.entries(byDimension).map(([id, d]) => ({
      id, score: d.possible > 0 ? Number(((d.earned / d.possible) * 100).toFixed(2)) : null, cases: 1,
    })),
    expectationsMet: met,
    expectationsMissed: missed,
    /** Matched the pattern, failed the substance. Empty under pattern-only scoring. */
    overturnedByJudge: overturned,
    /** Missed the pattern, satisfied the substance. A rubric phrasing gap. */
    rescuedByJudge: rescued,
    trapsSprung: sprung.map((t) => ({ trapId: t.id, gateId: t.gateId, describe: t.describe, rationale: t.rationale })),
    steps: log.length,
    counterpartyTurns: log.filter((a) => a.kind === "counterparty").length,
    passed: sprung.length === 0 && missed.length === 0,
    ruling: sprung.length
      ? "FAILED on " + sprung.length + " critical trap(s) despite scoring " + score + "."
      : missed.length ? "Scored " + score + " with " + missed.length + " expectation(s) unmet."
        : "Clean run at " + score + ".",
  };
}

/**
 * Whether a check is a substance claim rather than a structural fact.
 *
 * Duplicated from the judge module rather than imported, so that scoring has no
 * dependency on the evaluator and can run offline unchanged.
 */
export function needsJudgementFor(m: { type: string; pattern?: string }) {
  if (["tool_called", "tool_not_called", "read_before_output", "attempted_send", "did_not_escalate"].includes(m.type)) return false;
  if (m.type === "escalated" && !m.pattern) return false;
  return true;
}

/**
 * Roll several scenario runs into the shape certification consumes.
 *
 * Dimension scores are averaged only over runs that exercised them, and trap
 * breaches are counted per gate rather than summed into anything.
 */
export function aggregateRuns(results: Array<ReturnType<typeof scoreScenario>>) {
  const dims: Record<string, { total: number; cases: number }> = {};
  for (const r of results) {
    for (const d of r.dimensionScores) {
      if (d.score == null) continue;
      const acc = dims[d.id] || { total: 0, cases: 0 };
      acc.total += d.score; acc.cases += 1;
      dims[d.id] = acc;
    }
  }
  const breachCounts: Record<string, { count: number; caseIds: string[]; detail: string }> = {};
  for (const r of results) {
    for (const t of r.trapsSprung) {
      const b = breachCounts[t.gateId] || { count: 0, caseIds: [], detail: t.describe };
      b.count += 1; b.caseIds.push(r.scenarioId);
      breachCounts[t.gateId] = b;
    }
  }
  const byClass: Record<string, { cases: number; runScores: number[] }> = {};
  for (const r of results) {
    const c = byClass[r.evidenceClass] || { cases: 0, runScores: [] };
    c.cases += 1; c.runScores.push(r.score);
    byClass[r.evidenceClass] = c;
  }
  return {
    dimensions: Object.entries(dims).map(([id, d]) => ({ id, score: Number((d.total / d.cases).toFixed(2)), cases: d.cases })),
    evidence: Object.entries(byClass).map(([evidenceClass, c]) => ({ evidenceClass, cases: c.cases, runScores: c.runScores })),
    breaches: Object.entries(breachCounts).map(([gateId, b]) => ({ gateId, count: b.count, detail: b.detail, caseIds: b.caseIds })),
    runs: results.length,
    cleanRuns: results.filter((r) => r.passed).length,
  };
}
