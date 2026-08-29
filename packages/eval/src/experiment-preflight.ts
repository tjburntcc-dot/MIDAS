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

  // G. Turn budget, computed from turns and not from cases
  const b = m.budget;
  const workflowTurns = Math.max(1, m.runtime.workflowShape.length);
  if (b.maxTurnsPerCase < workflowTurns) {
    f.push(fail("turns_fit_the_workflow", "RUNTIME_TRUNCATION",
      "The workflow is " + m.runtime.workflowShape.join(" then ") + " which needs " + workflowTurns
      + " turns, and the budget allows " + b.maxTurnsPerCase + ".", "D-15"));
  } else if (b.maxTurnsPerCase === workflowTurns && workflowTurns > 1) {
    f.push(warn("turns_survive_one_wasted_call", "RUNTIME_TRUNCATION",
      "The budget is exactly the workflow length, so one wasted turn consumes the result.", "D-15"));
  }
  const worst = b.cases * b.arms * b.maxTurnsPerCase * (b.repeats || 1) + (b.judgeCalls || 0);
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
