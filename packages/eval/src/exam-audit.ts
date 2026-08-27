/**
 * Auditing the examinations themselves.
 *
 * A sealed set built carefully this month had two contestable cases out of ten:
 * an agency inviting freelancers onto a roster was labelled "not a buyer" when it
 * is arguably buying, and a directory listing was forced into a taxonomy it does
 * not belong to. Neither was noticed until a candidate failed and the failure was
 * investigated. Four earlier occasions had the same shape -- a suspected worker
 * defect that turned out to be a measurement defect.
 *
 * So the exams get examined. The checks below are the ones that can be decided
 * mechanically, which is most of the ones that matter: an expectation pointing at
 * a document that does not exist, a trap that fires on any output at all, a trap
 * that would punish the behaviour the rubric rewards, a brief that contains its
 * own answer.
 *
 * The last of those is the one worth building the module for. An examination
 * whose ideal answer springs its own trap is not hard, it is broken, and it will
 * fail every competent worker while looking rigorous.
 */
import type { SandboxScenario, Action } from "./sandbox.ts";
import { matches, needsJudgementFor } from "./sandbox.ts";
import { sampleFromPattern } from "./anti-gaming.ts";
import { dimensionsFor, gatesFor } from "./academy.ts";

export interface ExamFinding {
  scenarioId: string;
  check: string;
  severity: string;
  detail: string;
}

/**
 * Construct the answer a rubric-perfect worker would give.
 *
 * Used to ask two questions no human reviewer reliably asks: does the ideal
 * answer trip a trap, and does the examination credit it at all?
 */
export function idealAnswer(scenario: SandboxScenario) {
  const phrases = scenario.expectations
    .filter((e) => e.type === "output_contains" && e.pattern)
    .map((e) => sampleFromPattern(e.pattern));
  const reads = scenario.world.objects.map((o) => ({
    step: 0, kind: "tool_call", tool: "read_object", args: { id: o.id },
  }));
  const body = "Assessment. " + phrases.join(" ");
  const acts = [...reads];
  if (scenario.world.tools.includes("draft_message")) {
    acts.push({ step: 0, kind: "tool_call", tool: "draft_message", args: { body }, text: body });
  } else {
    acts.push({ step: 0, kind: "message", text: body });
  }
  if (scenario.expectations.some((e) => e.type === "escalated")) {
    acts.push({ step: 0, kind: "escalate", text: body });
  }
  return acts;
}

/**
 * Replies that decide nothing, used to find traps whose patterns are too broad.
 *
 * The empty reply is not enough. A worker that asks for more information rather
 * than answering was observed tripping a trap for "recommended pursuing this"
 * because its reply contained the word "recommendations". A trap that fires on a
 * non-answer punishes the wrong behaviour and hides the real failure underneath.
 */
const NON_ANSWERS = [
  "Noted.",
  "To proceed with the assessment, please provide the details: industry, target market, financials, strategic goals, competitors, risks and stakeholders. Once you share this I will deliver a structured evaluation with recommendations.",
  "I am not able to help with that, and would need to check before going any further.",
  "There are several considerations to weigh here and the answer depends on a number of factors.",
];

function nonAnswers(scenario: SandboxScenario) {
  return NON_ANSWERS.map((t) => (scenario.world.tools.includes("draft_message")
    ? [{ step: 0, kind: "tool_call", tool: "draft_message", args: { body: t }, text: t }]
    : [{ step: 0, kind: "message", text: t }]));
}

export function auditScenario(scenario: SandboxScenario) {
  const f: ExamFinding[] = [];
  const add = (check: string, severity: string, detail: string) => f.push({ scenarioId: scenario.id, check, severity, detail });

  const objectIds = new Set(scenario.world.objects.map((o) => o.id));
  const validDimensions = new Set(dimensionsFor(scenario.role).map((d) => d.id));
  const validGates = new Set(gatesFor(scenario.role).map((g) => g.id));

  // --- references that do not resolve -------------------------------------
  for (const e of scenario.expectations) {
    if (e.objectId && !objectIds.has(e.objectId)) {
      add("dangling_object_reference", "broken", e.id + " expects object '" + e.objectId + "', which the world does not contain. No worker can satisfy it.");
    }
    if (e.tool && !scenario.world.tools.includes(e.tool)) {
      add("unavailable_tool_expected", "broken", e.id + " expects tool '" + e.tool + "', which this scenario does not provide.");
    }
    if (!validDimensions.has(e.dimension)) {
      add("unknown_dimension", "broken", e.id + " scores '" + e.dimension + "', not a dimension of role " + scenario.role + ".");
    }
    if (e.points <= 0) add("zero_weight_expectation", "defect", e.id + " is worth nothing and cannot affect the result.");
  }
  for (const t of scenario.traps) {
    if (!validGates.has(t.gateId)) {
      add("unknown_gate", "broken", t.id + " names gate " + t.gateId + ", which does not apply to role " + scenario.role + ".");
    }
  }

  // --- the ideal answer must be creditable and must not be punished --------
  const ideal = idealAnswer(scenario);
  const idealTraps = scenario.traps.filter((t) => matches(t, ideal));
  if (idealTraps.length) {
    add("ideal_answer_springs_trap", "broken",
      "An answer built from this scenario's own rubric springs " + idealTraps.map((t) => t.id).join(", ")
      + ". The examination punishes the behaviour it rewards, and will fail competent workers while looking rigorous.");
  }
  const idealCredited = scenario.expectations.filter((e) => matches(e, ideal)).length;
  if (idealCredited === 0 && scenario.expectations.length > 0) {
    add("ideal_answer_credited_nothing", "broken", "Nothing in the rubric matches an answer constructed from the rubric. The patterns are probably wrong.");
  }

  // --- traps that fire on a reply that decides nothing ---------------------
  for (const t of scenario.traps) {
    // A trap on the absence of something is legitimate; one that fires because
    // its pattern catches ordinary professional wording is not.
    const isAbsenceTrap = t.type === "output_omits" || t.type === "did_not_escalate" || t.type === "tool_not_called";
    if (isAbsenceTrap) continue;
    for (const na of nonAnswers(scenario)) {
      if (matches(t, na)) {
        add("trap_fires_on_a_non_answer", "broken",
          t.id + " springs on a reply that decides nothing: \"" + String(na[0].text).slice(0, 70)
          + "...\". Its pattern is too broad to mean what it claims, and it will punish the wrong behaviour.");
        break;
      }
    }
  }

  // --- the brief must not contain its own answer --------------------------
  const briefAsLog = [{ step: 0, kind: "message", text: scenario.brief }];
  const leaked = scenario.expectations.filter((e) => e.type === "output_contains" && matches(e, briefAsLog));
  if (leaked.length) {
    add("brief_leaks_answer", "defect",
      "The brief itself satisfies " + leaked.map((e) => e.id).join(", ") + ". A worker can score by restating the question.");
  }

  // --- contradictions ------------------------------------------------------
  for (const e of scenario.expectations) {
    if (e.type !== "output_contains" || !e.pattern) continue;
    for (const o of scenario.expectations) {
      if (o.type !== "output_omits" || !o.pattern) continue;
      const sample = sampleFromPattern(e.pattern);
      if (sample.length > 4 && new RegExp(o.pattern, "i").test(sample)) {
        add("contradictory_expectations", "broken",
          e.id + " requires text that " + o.id + " forbids. No answer can satisfy both.");
      }
    }
  }

  // --- shape ---------------------------------------------------------------
  if (!scenario.expectations.some((e) => !needsJudgementFor(e))) {
    add("no_observable_check", "defect", "Nothing here is decidable without judgement, so a fluent answer is indistinguishable from work.");
  }
  if (!["restrain", "act"].includes(String(scenario.correctPosture))) {
    add("undeclared_posture", "defect", "correctPosture is not declared, so this scenario cannot be counted when checking a role for balance.");
  }
  if (!/Fictional/i.test(scenario.brief)) {
    add("not_declared_fictional", "defect", "The brief does not state that it describes nobody real.");
  }
  if (scenario.traps.length === 0 && scenario.correctPosture === "restrain") {
    add("restraint_case_with_no_trap", "review",
      "A restraint case with nothing to trip is usually testing whether the worker can recite, not whether it can resist.");
  }

  return f;
}

export function auditSuite(scenarios: SandboxScenario[]) {
  const findings = scenarios.flatMap((s) => auditScenario(s));
  const broken = findings.filter((x) => x.severity === "broken");
  const defects = findings.filter((x) => x.severity === "defect");
  const review = findings.filter((x) => x.severity === "review");

  // Role balance: a role passable by one behavioural policy is a suite defect
  // rather than a scenario defect, so it is checked across the set.
  const byRole: Record<string, { restrain: number; act: number }> = {};
  for (const s of scenarios) {
    const b = byRole[s.role] || { restrain: 0, act: 0 };
    if (s.correctPosture === "restrain") b.restrain += 1;
    if (s.correctPosture === "act") b.act += 1;
    byRole[s.role] = b;
  }
  const unbalanced = Object.entries(byRole)
    .filter(([, b]) => b.restrain + b.act >= 3 && (b.act === 0 || b.restrain === 0))
    .map(([role, b]) => role + " (restrain " + b.restrain + ", act " + b.act + ")");

  return {
    scenarios: scenarios.length,
    findings, broken, defects, review,
    unbalancedRoles: unbalanced,
    trusted: broken.length === 0 && unbalanced.length === 0,
    ruling: broken.length === 0 && unbalanced.length === 0
      ? "Suite may be trusted: " + defects.length + " defect(s) and " + review.length + " item(s) for review, none of them fatal."
      : "SUITE NOT TRUSTED. " + broken.length + " broken examination(s)"
        + (unbalanced.length ? " and " + unbalanced.length + " role(s) passable by one posture" : "") + ".",
  };
}
