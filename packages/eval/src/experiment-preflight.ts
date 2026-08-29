/**
 * The check that runs before money does.
 *
 * Twenty-five experiment defects are recorded in this repository. Seventeen were
 * found only after spending, nine changed a verdict, and three missions in five
 * report that a defect in the harness nearly became a finding about a worker or
 * an architecture. That is no longer a run of bad luck; it is the dominant
 * failure mode, and it is the one thing here that compounds against every future
 * experiment.
 *
 * So this is not a platform. Every check below is derived from a defect that
 * actually happened, and each one names it. A check nobody was ever burned by
 * would be exactly the ceremony this repository keeps refusing to build.
 *
 * The contract is simple: a manifest describes the experiment, preflight either
 * clears it or refuses, and a refusal means no model call happens at all.
 */
import { createHash } from "node:crypto";

export interface ManifestArm {
  id: string;
  /** The one thing that differs from the control. Everything else must match. */
  changedVariable: string;
  /** Every fact this arm can see, as content strings, for parity comparison. */
  informationAccess?: string[];
  tools?: string[];
  /** Prompt, contract and policy identity. Two arms sharing an id share a text. */
  promptId?: string;
  contractId?: string;
  policyId?: string;
  /** True only for a deliberately labelled generic baseline. */
  genericBaseline?: boolean;
}

export interface ManifestMetric {
  id: string;
  /**
   * True when the metric is reported and never gated.
   *
   * Without this, a metric can be defined in the manifest, gated in the runner,
   * and never seen by preflight -- which is exactly what happened on the first
   * preflight-native experiment. Every metric must now be either gated in the
   * manifest or declared reported-only, so an applied gate cannot hide.
   */
  reportedOnly?: boolean;
  /** Where the number comes from. A metric read from prose is not observable. */
  observableSource: string;
  /** Case ids that actually exercise it. A gate on an unexercised metric is theater. */
  exercisedBy: string[];
  direction: string;
}

export interface ManifestGate {
  metricId: string;
  threshold: number;
  critical: boolean;
  preregistered: boolean;
  /** Smallest change one case can make to the metric. Used for decision resolution. */
  metricIncrement?: number;
}

export interface ManifestBudget {
  model: string;
  cases: number;
  arms: number;
  maxTurnsPerCase: number;
  judgeCalls?: number;
  judgeModel?: string;
  repeats?: number;
  hardCeiling: number;
  perModelCeilings?: Record<string, number>;
  /** Reserve per arm so one cannot starve another. */
  perArmReserve?: Record<string, number>;
  /**
   * Per-case turn caps, where one number for the whole set would be a lie.
   *
   * A campaign whose cases differ in shape has cases that differ in cost. The
   * Auditor desk is the first: a two-record packet is gathered in one call and
   * concluded in the next, and a four-record packet was measured going back for
   * a second read before finishing. Declaring the larger cap for every case
   * inflates the worst case, and declaring the smaller one truncates the bigger
   * cases -- which is how the previous campaign lost its tool-use gate.
   *
   * When present, the worst case is the sum of these rather than cases x cap,
   * and maxTurnsPerCase must be the largest of them so no case is budgeted above
   * the declared cap.
   */
  turnsByCase?: Record<string, number>;
}

export interface ManifestSubject {
  role: string;
  workerVersion: string | null;
  model: string;
  /** True when the adapter resolved a real MIDAS worker rather than a bare model. */
  midasWorker: boolean;
  configurationTarget: string;
  executionEnvironmentId: string;
}

export interface ManifestCases {
  kind: string;
  fingerprint: string;
  count: number;
  /** Ids of sets that already informed a diagnosis. A sealed set must not reuse them. */
  priorSetFingerprints?: string[];
  /** Text a worker must not be able to read the answer from. */
  answerPhrases?: Record<string, string[]>;
  caseTexts?: Record<string, string>;
}

export interface ManifestRuntime {
  expectedTools: string[];
  /** The shape of a complete run, e.g. ["list","read","decide"]. */
  workflowShape: string[];
  rawTraceCaptured: string[];
  completionCondition: string;
}

export interface ExperimentManifest {
  experimentId: string;
  causalQuestion: string;
  subject: ManifestSubject;
  arms: ManifestArm[];
  cases: ManifestCases;
  metrics: ManifestMetric[];
  gates: ManifestGate[];
  budget: ManifestBudget;
  runtime: ManifestRuntime;
  decisionRule: string;
  /** Set once, before execution. Compared afterwards. */
  criteriaBeforeRun?: string;
  criteriaAfterRun?: string;
  postHocDiagnosticOnly?: boolean;
}

export interface Finding {
  check: string;
  category: string;
  severity: string;
  detail: string;
  derivedFrom: string;
}

const fail = (check: string, category: string, detail: string, derivedFrom: string): Finding =>
  ({ check, category, severity: "blocking", detail, derivedFrom });
const warn = (check: string, category: string, detail: string, derivedFrom: string): Finding =>
  ({ check, category, severity: "advisory", detail, derivedFrom });

/** A stable hash over the parts of the manifest that decide the outcome. */
export function criteriaFingerprint(m: ExperimentManifest) {
  return createHash("sha256").update(JSON.stringify({
    gates: m.gates, decisionRule: m.decisionRule, metrics: m.metrics.map((x) => x.id).sort(),
    cases: m.cases.fingerprint, budget: m.budget,
  })).digest("hex").slice(0, 16);
}

/**
 * Refuse or clear.
 *
 * Blocking findings mean no model call. Advisory findings are printed and do not
 * stop the run, because a preflight that blocks everything gets bypassed and
 * then guards nothing.
 */
export function preflight(m: ExperimentManifest): { ok: boolean; findings: Finding[]; blocking: Finding[]; criteria: string } {
  const f: Finding[] = [];

  // A. Actor
  if (!m.postHocDiagnosticOnly) {
    const certifying = /certif|academy|promot/i.test(m.causalQuestion);
    if (certifying && !m.subject.midasWorker) {
      f.push(fail("actor_is_a_midas_worker", "ACTOR_IDENTITY",
        "The subject resolved as a bare model on a certification path.", "D-01"));
    }
    if (m.subject.midasWorker && !m.subject.workerVersion) {
      f.push(fail("worker_version_declared", "ACTOR_IDENTITY", "A MIDAS worker with no version cannot be bound.", "D-01"));
    }
  }
  if (!m.subject.executionEnvironmentId) {
    f.push(fail("environment_declared", "CONFIGURATION_IDENTITY",
      "No execution environment on the subject, so a runtime change would move no fingerprint.", "D-19"));
  }
  const baselines = m.arms.filter((a) => a.genericBaseline);
  for (const b of baselines) {
    if (!/baseline|generic/i.test(b.id)) {
      f.push(warn("baseline_is_named_as_one", "ACTOR_IDENTITY",
        "Arm " + b.id + " is a generic baseline whose id does not say so.", "D-01"));
    }
  }

  // B. Arm isolation
  if (m.arms.length >= 2) {
    const control = m.arms[0];
    for (const arm of m.arms.slice(1)) {
      const differences: string[] = [];
      for (const k of ["promptId", "contractId", "policyId"] as const) {
        if ((arm as any)[k] !== (control as any)[k]) differences.push(k);
      }
      const toolsDiffer = JSON.stringify([...(arm.tools || [])].sort()) !== JSON.stringify([...(control.tools || [])].sort());
      if (toolsDiffer) differences.push("tools");
      if (differences.length > 1 && !/and|plus|\+/i.test(arm.changedVariable)) {
        f.push(fail("one_variable_per_arm", "INFORMATION_PARITY",
          "Arm " + arm.id + " differs from the control in " + differences.join(", ")
          + " but declares one changed variable: " + arm.changedVariable, "D-22"));
      }
      if (arm.informationAccess && control.informationAccess) {
        const missing = control.informationAccess.filter((x) => !arm.informationAccess!.includes(x));
        const extra = arm.informationAccess.filter((x) => !control.informationAccess!.includes(x));
        if (missing.length || extra.length) {
          f.push(fail("information_parity", "INFORMATION_PARITY",
            "Arm " + arm.id + " sees " + extra.length + " facts the control does not and lacks " + missing.length
            + " it has. The experiment would measure information rather than the declared variable.", "D-22"));
        }
      }
    }
  }

  // C. Case and gold
  if (m.cases.kind === "sealed" && (m.cases.priorSetFingerprints || []).includes(m.cases.fingerprint)) {
    f.push(fail("sealed_set_is_fresh", "SEALED_CONTAMINATION",
      "This sealed set has already informed a diagnosis and is no longer a clean holdout.", "D-23"));
  }
  for (const [caseId, phrases] of Object.entries(m.cases.answerPhrases || {})) {
    const text = (m.cases.caseTexts || {})[caseId];
    if (!text) continue;
    for (const p of phrases) {
      if (p && text.toLowerCase().includes(p.toLowerCase())) {
        f.push(fail("no_answer_leakage", "CASE_DESIGN",
          caseId + " contains its own answer phrase: " + JSON.stringify(p), "D-05"));
      }
    }
  }

  // D. Metric exercise
  for (const g of m.gates) {
    const metric = m.metrics.find((x) => x.id === g.metricId);
    if (!metric) {
      f.push(fail("gate_has_a_metric", "METRIC_NOT_EXERCISED",
        "Gate on " + g.metricId + " has no metric definition.", "D-20"));
      continue;
    }
    if (!metric.exercisedBy.length) {
      f.push(fail("gated_metric_is_exercised", "METRIC_NOT_EXERCISED",
        "Gate on " + g.metricId + " but no case exercises it, so it can neither pass nor fail as evidence.", "D-20"));
    }
    if (!g.preregistered) {
      f.push(fail("gates_are_preregistered", "POST_HOC_CRITERION_CHANGE",
        "Gate on " + g.metricId + " is not marked preregistered.", "D-18"));
    }
  }

  // D2. Every metric is either gated here or declared reported-only.
  for (const metric of m.metrics) {
    const gated = m.gates.some((g) => g.metricId === metric.id);
    if (!gated && !metric.reportedOnly) {
      f.push(fail("every_metric_is_gated_or_reported_only", "POST_HOC_CRITERION_CHANGE",
        metric.id + " is defined but neither gated in the manifest nor marked reportedOnly. A gate applied outside the manifest is never checked for resolution.", "D-26"));
    }
  }

  // E. Scorer contract
  for (const metric of m.metrics) {
    if (/free.?string|prose|narrative/i.test(metric.observableSource) && /rate|accuracy|correct/i.test(metric.id)) {
      f.push(fail("scorer_reads_a_categorical_field", "SCORER_DEFECT",
        metric.id + " is computed from " + metric.observableSource
        + ". A free string scored as a categorical value reads any text as the positive class.", "D-12"));
    }
    if (/per.?case/i.test(metric.observableSource) && /action|selected/i.test(metric.id)) {
      f.push(warn("per_action_property_from_per_case_gold", "SCORER_DEFECT",
        metric.id + " is action-dependent and its source is declared per case.", "D-11"));
    }
  }

  // F. Tool and runtime
  const declaredTools = new Set(m.arms.flatMap((a) => a.tools || []));
  for (const t of m.runtime.expectedTools) {
    if (!declaredTools.has(t)) {
      f.push(fail("expected_tool_is_offered", "TOOL_AFFORDANCE",
        "The workflow needs " + t + " and no arm offers it.", "D-13"));
    }
  }

  /**
   * F2. Who wrote the reference answers, and did anyone else check them.
   *
   * GOLD_DEFECT is now the most common recorded category, and two of them
   * changed a verdict. Preflight cannot tell whether a reference answer is
   * right -- that is a judgement, not a property of the manifest -- but it can
   * refuse to let the question go unasked. An author who has to write down that
   * nobody else looked at the gold usually goes and gets someone to look.
   */
  if (m.cases.kind === "sealed") {
    const g = (m.cases as any).goldAdjudication;
    if (!g || typeof g.author !== "string") {
      f.push(warn("gold_provenance_declared", "GOLD_DEFECT",
        "A sealed set is being used as evidence and the manifest does not say who wrote its reference answers.", "D-29"));
    } else if (!g.independentlyAdjudicated) {
      f.push(warn("gold_independently_adjudicated", "GOLD_DEFECT",
        "The reference answers were written by " + g.author + " and nobody independent has checked them. Two of the recorded gold defects changed a verdict, and both were found only after the run was paid for.", "D-29"));
    }
  }

  /**
   * F3. Every gold field that can decide a gate was in front of the reviewer.
   *
   * D-36. A zero-tolerance gate read the per-action authority expectation and the
   * review payload was hand-assembled without it, so the gate rested on gold
   * nobody had checked. A manifest that declares gated gold dependencies must
   * also declare which fields the reviewer saw, and the second must cover the
   * first.
   */
  const adj: any = (m.cases as any).goldAdjudication;
  if (adj && Array.isArray(adj.gatedGoldFields)) {
    const shown = new Set<string>(Array.isArray(adj.fieldsReviewed) ? adj.fieldsReviewed : []);
    const gap = adj.gatedGoldFields.filter((x: string) => !shown.has(x));
    if (gap.length) {
      f.push(fail("gated_gold_fields_are_reviewed", "GOLD_DEFECT",
        "These gold fields can decide a gate and were never shown to the independent reviewer: " + gap.join(", ")
        + ". A gate resting on an unreviewed field is an unreviewed gate.", "D-36"));
    }
    if (adj.semanticsShown !== true) {
      f.push(fail("reviewer_saw_action_equivalence_semantics", "GOLD_DEFECT",
        "The independent reviewer judged acceptable actions without being shown how equivalence is computed. Round one of the Manager review did exactly that, asked for a widening, and retracted it once told.", "D-42"));
    }
    if (adj.quantityCompletenessEnforcedBy === undefined) {
      f.push(warn("quantity_completeness_is_machine_checked", "GOLD_DEFECT",
        "The manifest does not say what enforces the completeness of the supplied quantities. A human-enumerated list does not converge.", "D-41"));
    }
    if (Array.isArray(adj.unresolvedFieldVerdicts) && adj.unresolvedFieldVerdicts.length) {
      f.push(fail("gold_fields_all_confirmed", "GOLD_DEFECT",
        "The reviewer did not confirm: " + adj.unresolvedFieldVerdicts.map((u: any) => u.caseId + "." + u.field + "=" + u.verdict).join(", ")
        + ". A gold set may not freeze while a gated field is too broad, too narrow, wrong or ambiguous.", "D-38"));
    }
  }

  // G. Turn budget, computed from turns and not from cases
  const b = m.budget;
  /**
   * The required turns are derived, not accepted.
   *
   * workflowShape is written by the author, and on AUDITOR-READONLY-1 the author
   * was me: the advisory below fired on a three-step shape, and I stopped it by
   * relabelling the shape as two steps rather than raising the budget. The run
   * then spent one turn listing, one turn on a single read, and reached the
   * forced-finish turn without opening what the case needed. The check was
   * satisfied and the concern was not.
   *
   * So the floor is now the larger of the declared shape and what the declared
   * tools imply: every tool the runtime expects, plus one turn to conclude. A
   * relabel cannot lower it, because it is computed from the environment.
   */
  const impliedTurns = (m.runtime.expectedTools || []).length ? (m.runtime.expectedTools || []).length + 1 : 1;
  const workflowTurns = Math.max(1, m.runtime.workflowShape.length, impliedTurns);
  if (b.maxTurnsPerCase < workflowTurns) {
    f.push(fail("turns_fit_the_workflow", "RUNTIME_TRUNCATION",
      "The workflow is " + m.runtime.workflowShape.join(" then ") + " and the tools are "
      + ((m.runtime.expectedTools || []).join(", ") || "none") + ", which together need " + workflowTurns
      + " turns, and the budget allows " + b.maxTurnsPerCase + ".", "D-15"));
  } else if (b.maxTurnsPerCase === workflowTurns && workflowTurns > 1) {
    f.push(warn("turns_survive_one_wasted_call", "RUNTIME_TRUNCATION",
      "The budget is exactly the workflow length, so one wasted turn consumes the result.", "D-15"));
  }
  let worst = b.cases * b.arms * b.maxTurnsPerCase * (b.repeats || 1) + (b.judgeCalls || 0);
  if (b.turnsByCase) {
    const entries = Object.entries(b.turnsByCase);
    if (entries.length !== b.cases) {
      f.push(fail("per_case_turns_cover_every_case", "BUDGET_PLANNING",
        "turnsByCase names " + entries.length + " cases and the budget declares " + b.cases + ".", "D-16"));
    }
    const largest = entries.reduce((n, [, v]) => Math.max(n, v), 0);
    if (largest > b.maxTurnsPerCase) {
      f.push(fail("per_case_turns_within_cap", "BUDGET_PLANNING",
        "A case is budgeted " + largest + " turns against a declared cap of " + b.maxTurnsPerCase + ".", "D-16"));
    }
    for (const [id, v] of entries) {
      if (v < workflowTurns) {
        f.push(fail("per_case_turns_fit_the_workflow", "RUNTIME_TRUNCATION",
          id + " is budgeted " + v + " turns and the workflow needs " + workflowTurns + ".", "D-15"));
      }
    }
    worst = entries.reduce((n, [, v]) => n + v, 0) * b.arms * (b.repeats || 1) + (b.judgeCalls || 0);
  }
  if (worst > b.hardCeiling) {
    f.push(fail("budget_fits_the_ceiling", "BUDGET_PLANNING",
      "Worst case " + worst + " exceeds the declared ceiling of " + b.hardCeiling
      + ". Cases are not calls: this is cases x arms x turns.", "D-16"));
  }
  for (const [model, cap] of Object.entries(b.perModelCeilings || {})) {
    if (model === b.judgeModel && (b.judgeCalls || 0) > cap) {
      f.push(fail("per_model_ceiling", "BUDGET_PLANNING",
        model + " is capped at " + cap + " and " + b.judgeCalls + " are planned.", "D-16"));
    }
  }

  // H. Per-arm reservation
  if (m.arms.length > 1 && b.maxTurnsPerCase > 1) {
    const reserve = b.perArmReserve || {};
    const covered = m.arms.every((a) => typeof reserve[a.id] === "number");
    if (!covered) {
      f.push(fail("per_arm_reservation", "BUDGET_PLANNING",
        "A multi-turn experiment with several arms has no per-arm reserve, so one arm can consume another's capacity.", "D-17"));
    } else {
      const sum = Object.values(reserve).reduce((x, y) => x + y, 0);
      if (sum > b.hardCeiling) {
        f.push(fail("reserves_fit_the_ceiling", "BUDGET_PLANNING",
          "Reserves total " + sum + " against a ceiling of " + b.hardCeiling + ".", "D-17"));
      }
    }
  }

  // I. Decision resolution
  for (const g of m.gates) {
    const metric = m.metrics.find((x) => x.id === g.metricId);
    if (!metric) continue;
    const n = metric.exercisedBy.length;
    const increment = g.metricIncrement ?? (n ? 1 / n : 1);
    if (n && increment >= g.threshold && g.threshold > 0) {
      f.push(fail("decision_resolution", "STATISTICAL_RESOLUTION",
        g.metricId + " is exercised by " + n + " cases so one case moves it by " + increment.toFixed(3)
        + ", which alone satisfies a threshold of " + g.threshold + ".", "D-08"));
    }
  }

  // J. Raw trace
  if (m.runtime.expectedTools.length) {
    const need = ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"];
    const missing = need.filter((x) => !m.runtime.rawTraceCaptured.includes(x));
    if (missing.length) {
      f.push(fail("raw_trace_is_sufficient", "RAW_TRACE_INSUFFICIENCY",
        "A tool experiment that does not capture " + missing.join(", ")
        + " will need fresh model spend to explain a surprising failure.", "D-21"));
    }
  }

  // K. Post-hoc integrity
  if (m.criteriaBeforeRun && m.criteriaAfterRun && m.criteriaBeforeRun !== m.criteriaAfterRun && !m.postHocDiagnosticOnly) {
    f.push(fail("criteria_unchanged", "POST_HOC_CRITERION_CHANGE",
      "The criteria fingerprint changed between declaration and reporting. A changed criterion may only be reported as POST_HOC_DIAGNOSTIC_ONLY.", "D-18"));
  }

  const blocking = f.filter((x) => x.severity === "blocking");
  return { ok: blocking.length === 0, findings: f, blocking, criteria: criteriaFingerprint(m) };
}

/**
 * A preregistered early stop.
 *
 * Permitted only where the condition was declared before running, so that
 * stopping is a saving rather than a way to avoid a result already visible.
 */
export function informationValueStop(declaredBefore: boolean, condition: string, met: boolean) {
  if (!declaredBefore) {
    return { stop: false, reason: "An early stop that was not declared before running would be cherry-picking, and is refused." };
  }
  return met
    ? { stop: true, reason: "Preregistered stop condition met: " + condition }
    : { stop: false, reason: "Preregistered stop condition not met." };
}

/**
 * The integration point.
 *
 * A future experiment calls this instead of calling a provider directly. If
 * preflight refuses, no model call happens and the reason is returned. There is
 * deliberately nothing else here: an execution framework would be a platform,
 * and the thing that was missing was never orchestration.
 */
export async function withPreflight<T>(
  manifest: ExperimentManifest,
  run: (ctx: { manifest: ExperimentManifest; criteria: string }) => Promise<T>,
  log: (line: string) => void = console.log,
): Promise<{ ran: boolean; result?: T; findings: Finding[]; criteria: string }> {
  const pre = preflight(manifest);
  log("PREFLIGHT " + manifest.experimentId + " -- " + manifest.causalQuestion);
  for (const x of pre.findings) {
    log("   " + (x.severity === "blocking" ? "REFUSE  " : "advisory") + " " + x.check.padEnd(34) + x.detail + "  [" + x.derivedFrom + "]");
  }
  if (!pre.ok) {
    log("   REFUSED: " + pre.blocking.length + " blocking finding(s). No model call made.");
    return { ran: false, findings: pre.findings, criteria: pre.criteria };
  }
  log("   cleared. criteria fingerprint " + pre.criteria);
  const result = await run({ manifest, criteria: pre.criteria });
  return { ran: true, result, findings: pre.findings, criteria: pre.criteria };
}
