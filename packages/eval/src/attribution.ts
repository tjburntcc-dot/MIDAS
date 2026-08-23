import { attributionSubreasons } from "./applicability.js";

export const ATTRIBUTION_STAGES = [
  "not_retrieved",
  "retrieved_ignored",
  "retrieved_misapplied",
  "evidence_misread",
  "schema_or_repair",
  "deterministic_scorer",
  "semantic_judge",
  "benchmark_defect",
  "model_reasoning",
];

function labelsWrong(record, assessments) {
  if (!record || !record.gold || !record.gold.labels) return false;
  const gold = record.gold.labels;
  const seen = new Set();
  let wrong = 0;
  for (const a of assessments || []) {
    if (!a || !a.prospect_id) continue;
    seen.add(a.prospect_id);
    if (gold[a.prospect_id] && a.classification !== gold[a.prospect_id]) wrong += 1;
  }
  for (const id of Object.keys(gold)) {
    if (!seen.has(id)) wrong += 1;
  }
  return wrong > 0;
}

function freshnessMisapplied(record, assessments) {
  if (!record || !record.gold) return false;
  for (const a of assessments || []) {
    const gold = record.gold.labels[a.prospect_id];
    if (gold === "needs_research" && a.classification === "disqualified") {
      const facts = (record.prospects.find((p) => p.id === a.prospect_id) || {}).facts || {};
      if (facts.hiring_freeze !== true && (facts.first_party_signal_age_days != null || facts.current_first_party_hiring_signal === null)) {
        return true;
      }
    }
  }
  return false;
}

function citedWrongProspect(record, assessments) {
  for (const a of assessments || []) {
    const prospect = (record.prospects || []).find((p) => p.id === a.prospect_id);
    if (!prospect) continue;
    const ok = new Set((prospect.evidence || []).map((e) => e.id));
    for (const id of a.cited_evidence_ids || []) {
      if (!ok.has(id)) return true;
    }
  }
  return false;
}

/**
 * Assign exactly one primary failure stage. Evaluator-only.
 * Never send labels or this stage to the model.
 */
export function attributeCaseResult(args) {
  const record = args.record;
  const result = args.result || {};
  const retrieval = args.retrievalTrace || result.retrievalTrace || {};
  const caseLabels = args.caseLabels || { critical: [], supporting: [] };
  const assessments = result.assessments || [];
  const dims = result.dimensions || {};

  if (result.scoreStatus === "invalid" || result.validationOk === false) {
    return { stage: "schema_or_repair", reason: "invalid or unrepaired schema output" };
  }
  if (result.scoreStatus === "inconclusive" || result.blocked) {
    return { stage: "schema_or_repair", reason: "blocked or inconclusive case" };
  }

  const retrieved = new Set(retrieval.retrievedItemIds || []);
  const critical = (caseLabels.critical || []).map((r) => r.id).filter(Boolean);
  const missingCritical = critical.filter((id) => !retrieved.has(id));
  const wrong = labelsWrong(record, assessments);
  const incomplete = result.weightedTotal != null && Number(result.weightedTotal) < 99;
  const cfs = result.criticalFailures || [];

  if (!wrong && !incomplete && !cfs.length) {
    return { stage: null, reason: "complete" };
  }

  if (missingCritical.length && (wrong || incomplete)) {
    return {
      stage: "not_retrieved",
      reason: "critical items missing from retrieval: " + missingCritical.join(","),
    };
  }

  if (citedWrongProspect(record, assessments)) {
    return { stage: "evidence_misread", reason: "cited evidence id is not on that prospect" };
  }

  if (critical.length && missingCritical.length === 0 && freshnessMisapplied(record, assessments)) {
    return { stage: "retrieved_misapplied", reason: "freshness rule retrieved but stale treated as disqualify" };
  }

  if (critical.length && missingCritical.length === 0 && wrong) {
    const mentioned = assessments.some((a) => {
      const r = String(a.rationale || "").toLowerCase();
      return /united states|payback|stale|freeze|authority|opt-out/.test(r);
    });
    if (!mentioned) {
      return { stage: "retrieved_ignored", reason: "critical rules retrieved but output does not reflect them" };
    }
    return { stage: "retrieved_misapplied", reason: "critical rules retrieved and mentioned but applied incorrectly" };
  }

  if (dims.qualification === 100 && dims.ranking != null && Number(dims.ranking) < 100 && !wrong) {
    return { stage: "deterministic_scorer", reason: "labels match; ranking/score remainder" };
  }

  const ev = result.scores && result.scores.evidenceDetail;
  if (ev && ev.deterministic >= 80 && ev.semantic != null && ev.semantic < 40 && Number(dims.evidence || 0) < 70) {
    return { stage: "semantic_judge", reason: "deterministic evidence high; semantic pulled the dimension down" };
  }

  if (record && record.gold && wrong) {
    const goldActions = record.gold.actions || {};
    const goldLabels = record.gold.labels || {};
    for (const [id, label] of Object.entries(goldLabels)) {
      const action = goldActions[id];
      if (label === "qualified" && action === "exclude") {
        return { stage: "benchmark_defect", reason: "gold action/label inconsistency" };
      }
    }
  }

  return { stage: "model_reasoning", reason: "residual error after retrieval and schema checks" };
}

function withSubreasons(out, args) {
  const traces = (args && args.traces) || (args && args.result && args.result.applicabilityTraces) || [];
  const assessments = (args && args.result && args.result.assessments) || [];
  const sub = attributionSubreasons({ assessments: assessments, traces: traces, record: args && args.record });
  return { stage: out.stage, reason: out.reason, subreasons: sub };
}

export function attributeAndExplain(args) {
  const raw = attributeCaseResult(args);
  const out = withSubreasons(raw, args);
  return {
    failureAttribution: out.stage,
    failureAttributionReason: out.reason,
    failureAttributionSubreasons: out.subreasons || [],
  };
}


export const ATTRIBUTION_TAXONOMY = [
  "retrieval_failure",
  "policy_application_failure",
  "model_classification_failure",
  "model_ranking_failure",
  "response_schema_failure",
  "deterministic_scorer_failure",
  "semantic_judge_failure",
  "benchmark_defect",
  "policy_override",
];

/**
 * New-run attribution only. Historical records keep ATTRIBUTION_STAGES.
 * Successful rows get no subreasons.
 */
export function attributeNewRun(args) {
  const record = args.record;
  const result = args.result || {};
  const retrieval = args.retrievalTrace || result.retrievalTrace || {};
  const caseLabels = args.caseLabels || { critical: [], supporting: [] };
  const assessments = result.assessments || [];
  const dims = result.dimensions || {};
  const enforcement = result.policyEnforcement || args.enforcement || {};
  const intervened = enforcement.enforcement_intervened === true || result.enforcementIntervened === true;

  if (result.scoreStatus === "invalid" || result.validationOk === false) {
    return pack("response_schema_failure", "invalid or unrepaired schema output", false);
  }
  if (result.scoreStatus === "inconclusive" || result.blocked) {
    return pack("response_schema_failure", "blocked or inconclusive case", false);
  }

  const retrieved = new Set(retrieval.retrievedItemIds || []);
  const critical = (caseLabels.critical || []).map((r) => r.id).filter(Boolean);
  const missingCritical = critical.filter((id) => !retrieved.has(id));
  const wrong = labelsWrong(record, assessments);
  const incomplete = result.weightedTotal != null && Number(result.weightedTotal) < 99;
  const cfs = result.criticalFailures || [];
  const success = !wrong && !incomplete && !cfs.length;

  if (success) {
    if (intervened) return pack("policy_override", "policy enforcement overrode the model proposal; served decision is complete", true);
    return pack(null, "complete", true);
  }

  if (missingCritical.length && (wrong || incomplete)) {
    return pack("retrieval_failure", "critical items missing from retrieval: " + missingCritical.join(","), false);
  }

  if (citedWrongProspect(record, assessments)) {
    return pack("model_classification_failure", "cited evidence id is not on that prospect", false);
  }

  if (intervened && (wrong || incomplete)) {
    return pack("policy_application_failure", "enforcement applied but served decision still incomplete", false);
  }

  if (critical.length && missingCritical.length === 0 && freshnessMisapplied(record, assessments)) {
    return pack("policy_application_failure", "freshness rule retrieved but stale treated as disqualify", false);
  }

  if (critical.length && missingCritical.length === 0 && wrong) {
    return pack("model_classification_failure", "critical rules retrieved but classification is wrong", false);
  }

  if (dims.qualification === 100 && dims.ranking != null && Number(dims.ranking) < 100 && !wrong) {
    return pack("model_ranking_failure", "labels match; ranking remainder", false);
  }

  const ev = result.scores && result.scores.evidenceDetail;
  if (ev && ev.deterministic >= 80 && ev.semantic != null && ev.semantic < 40 && Number(dims.evidence || 0) < 70) {
    return pack("semantic_judge_failure", "deterministic evidence high; semantic pulled the dimension down", false);
  }

  if (record && record.gold && wrong) {
    const goldActions = record.gold.actions || {};
    const goldLabels = record.gold.labels || {};
    for (const [id, label] of Object.entries(goldLabels)) {
      const action = goldActions[id];
      if (label === "qualified" && action === "exclude") {
        return pack("benchmark_defect", "gold action/label inconsistency", false);
      }
    }
  }

  if (dims.qualification === 100 && incomplete) {
    return pack("deterministic_scorer_failure", "labels match; remaining deterministic score gap", false);
  }

  return pack("model_classification_failure", "residual classification or action error", false);
}

function pack(stage, reason, success) {
  return {
    failureAttribution: stage,
    failureAttributionReason: reason,
    failureAttributionSubreasons: [],
    taxonomy: ATTRIBUTION_TAXONOMY,
    success: success === true,
  };
}

export function attributeAndExplainNew(args) {
  const out = attributeNewRun(args);
  return {
    failureAttribution: out.failureAttribution,
    failureAttributionReason: out.failureAttributionReason,
    failureAttributionSubreasons: out.success ? [] : out.failureAttributionSubreasons,
  };
}
