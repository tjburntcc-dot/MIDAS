import { randomUUID } from "node:crypto";
import { loadDevelopmentCases } from "./load.js";
import { presentCase } from "./present.js";
import { translateResponse } from "./translate.js";
import { validateOutput } from "./validate.js";
import { scoreCase } from "./score.js";
import { addUsage, assertWithinBudget, emptyCost } from "./spend.js";
import { recordUsage } from "./spend-ledger.ts";
import {
  retrieveForCase,
  buildPlaceboBundle,
  emptyKnowledgeBundle,
} from "./curriculum.js";
import { retrieveOracleForCase, hydrateOwnerApplicabilityFromDisk } from "./owner-policy.js";
import { defaultDevCasesPath, resolveSuite, SUITE_V01_VERSION } from "./paths.js";
import { attributeAndExplain, attributeAndExplainNew } from "./attribution.js";
import { enforceCase, buildPolicyRepairPayload, mergeRepairPreservingCompliant } from "./policy-enforce.js";
import { buildApplicabilityTraces, enrichKnowledgeItem } from "./applicability.js";
import { loadRetrievalRelevance, relevanceForCase } from "./relevance-labels.js";
import {
  extractMaterialClaims,
  liveJudgeClaims,
  scoreSemanticFromJudgments,
  semanticJudgeStatus,
} from "./evidence-judge.js";

export const SUITE_VERSION = SUITE_V01_VERSION;
export const ATTAINABLE_MAX = 92.5;
export const SEMANTIC_JUDGE = "not_implemented";

function emptyOutput(caseId) {
  return {
    case_id: caseId,
    assessments: [],
    ranked_qualified_ids: [],
    research_queue_ids: [],
    excluded_ids: [],
    case_uncertainties: [],
  };
}

export function sanitizeValidationErrors(errors) {
  const rows = (Array.isArray(errors) ? errors : [errors]).map((e) => String(e || ""));
  const cleaned = [];
  for (const row of rows) {
    const stripped = row
      .replace(/ranked_tiers|required_unknowns|required_evidence|critical_failures|\bgold\b|baseline|relevant|placebo|oracle|desired winner|promotion/gi, "[redacted]")
      .slice(0, 240);
    if (stripped.trim()) cleaned.push(stripped);
  }
  return cleaned.slice(0, 12);
}

export function isInfraError(err) {
  const s = String(err || "");
  return /BUDGET_ABORT|401|unauthorized|invalid.?api.?key|HTTP 401|HTTP 403|HTTP 429|HTTP 5\d\d|network fetch failed|MISSING_CONFIG|Live session not verified|fingerprint|OPENAI_API_KEY missing/i.test(s);
}

function retrieveForArm(args, runtimeInput, record) {
  const arm = args.arm || "baseline";
  const opts = {
    contextBudgetTokens: args.contextBudgetTokens ?? args.retrievalOpts?.contextBudgetTokens ?? 4000,
    maxItems: args.maxItems ?? args.retrievalOpts?.maxItems ?? 12,
    sourceAllowlist: args.sourceAllowlist || args.retrievalOpts?.sourceAllowlist,
    workspaceId: args.workspaceId || args.retrievalOpts?.workspaceId || null,
    workspaceAllowlist: args.workspaceAllowlist || args.retrievalOpts?.workspaceAllowlist,
  };
  if (arm === "oracle") {
    return retrieveOracleForCase(args.store, record.case_id, opts);
  }
  if (arm === "baseline" || args.retrievalDisabled === true) {
    return emptyKnowledgeBundle();
  }
  if (!args.store || typeof args.store.listKnowledge !== "function") {
    return emptyKnowledgeBundle();
  }
  const relevant = retrieveForCase(args.store, runtimeInput, opts);
  if (arm === "placebo") return buildPlaceboBundle(relevant);
  return relevant;
}

async function applyUsage(cost, runtimeOutput, args, runId) {
  const usage = runtimeOutput && runtimeOutput._usage;
  const parseNote = runtimeOutput && runtimeOutput._parseNote ? String(runtimeOutput._parseNote) : null;
  if (usage) {
    const before = cost.usdEstimate;
    addUsage(cost, usage);
    delete runtimeOutput._usage;
    if (args.store.addSpend) {
      args.store.addSpend({
        at: new Date().toISOString(),
        runId: runId,
        kind: args.responderKind,
        usd: Math.max(0, cost.usdEstimate - before),
        inputTokens: Number(usage.inputTokens || 0),
        outputTokens: Number(usage.outputTokens || 0),
      });
    }
    recordUsage(args.store, {
      timestamp: new Date().toISOString(),
      workspaceId: args.workspaceId || null,
      agentId: "atlas",
      role: "atlas",
      version: args.agentVersionId || null,
      operation: "eval",
      model: args.model || process.env.OPENAI_MODEL || null,
      providerRequestId: runId || null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      resultStatus: "ok",
      kind: args.responderKind === "live" ? "live" : "fixture",
      note: "Eval case usage. Day totals also recorded via addSpend.",
      skipDaySpend: true,
    });
  }
  if (runtimeOutput && runtimeOutput._parseNote) delete runtimeOutput._parseNote;
  return parseNote;
}


function attachAttribution(savedFields, args, record, retrievalTrace, validationOk) {
  let labels = null;
  try {
    labels = loadRetrievalRelevance();
  } catch {
    labels = null;
  }
  const caseLabels = labels ? relevanceForCase(record.case_id, labels) : { critical: [], supporting: [] };
  const traces = savedFields.applicabilityTraces || buildApplicabilityTraces(
    (retrievalTrace && retrievalTrace.items) || [],
    (record && record.prospects) || [],
  );
  savedFields.applicabilityTraces = traces;
  const useNew = args.agentVersionId === "atlas-v9" || args.agentVersionId === "atlas-v10";
  const attr = (useNew ? attributeAndExplainNew : attributeAndExplain)({
    record: record,
    result: { ...savedFields, validationOk: validationOk, retrievalTrace: retrievalTrace, assessments: savedFields.assessments, applicabilityTraces: traces },
    retrievalTrace: retrievalTrace,
    caseLabels: caseLabels,
    traces: traces,
  });
  savedFields.failureAttribution = attr.failureAttribution;
  savedFields.failureAttributionReason = attr.failureAttributionReason;
  savedFields.failureAttributionSubreasons = attr.failureAttributionSubreasons || [];
  const retrieved = retrievalTrace && retrievalTrace.retrievedItemIds ? retrievalTrace.retrievedItemIds : [];
  const critical = (caseLabels.critical || []).map((r) => r.id);
  const hit = critical.filter((id) => retrieved.includes(id));
  savedFields.criticalCoverage = critical.length ? hit.length / critical.length : null;
  savedFields.retrievalPolicyVersion = (retrievalTrace && retrievalTrace.retrievalPolicyVersion) || null;
  return savedFields;
}


async function enforceAndMaybeRepair(args) {
  const runtimeInput = args.runtimeInput;
  const original = args.runtimeOutput;
  const knowledgeBundle = args.knowledgeBundle || [];
  const traces = args.traces || [];
  const arm = args.arm || "baseline";
  let first = enforceCase({
    runtimeInput: runtimeInput,
    modelOutput: original,
    knowledgeItems: knowledgeBundle,
    traces: traces,
    arm: arm,
  });
  let servedRuntime = first.servedOutput;
  let enforcement = first;
  let policyRepairAttempts = 0;
  let policyRepairPayload = null;
  if (first.policy_conflicts.length && args.liveRepair === true && typeof args.responder === "function") {
    policyRepairPayload = buildPolicyRepairPayload({
      runtimeInput: runtimeInput,
      originalProposal: original,
      policyEvaluations: first.policy_evaluation,
      conflicts: first.policy_conflicts,
    });
    policyRepairAttempts = 1;
    try {
      const repaired = await args.responder(runtimeInput, {
        knowledgeBundle: knowledgeBundle,
        retrievedItemIds: args.retrievedItemIds,
        repair: { policy: policyRepairPayload },
      });
      if (args.applyUsage) await args.applyUsage(repaired);
      const validation = validateOutput(repaired);
      if (validation.ok) {
        const second = enforceCase({
          runtimeInput: runtimeInput,
          modelOutput: repaired,
          knowledgeItems: knowledgeBundle,
          traces: traces,
          arm: arm,
          repairAlreadyAttempted: true,
        });
        if (second.policy_conflicts.length) {
          enforcement = enforceCase({
            runtimeInput: runtimeInput,
            modelOutput: original,
            knowledgeItems: knowledgeBundle,
            traces: traces,
            arm: arm,
            repairAlreadyAttempted: true,
          });
          servedRuntime = enforcement.servedOutput;
        } else {
          enforcement = mergeRepairPreservingCompliant(first, {
            ...second,
            model_proposal: first.model_proposal,
            policy_conflicts: first.policy_conflicts,
            original_conflicts: first.policy_conflicts,
            enforcement_intervened: true,
            intervention_reason: first.intervention_reason || "Bounded policy repair replaced the original proposal. Original remains visible and is not authoritative.",
          }, runtimeInput);
          servedRuntime = enforcement.servedOutput;
        }
      } else {
        enforcement = enforceCase({
          runtimeInput: runtimeInput,
          modelOutput: original,
          knowledgeItems: knowledgeBundle,
          traces: traces,
          arm: arm,
          repairAlreadyAttempted: true,
        });
        servedRuntime = enforcement.servedOutput;
      }
    } catch {
      enforcement = enforceCase({
        runtimeInput: runtimeInput,
        modelOutput: original,
        knowledgeItems: knowledgeBundle,
        traces: traces,
        arm: arm,
        repairAlreadyAttempted: true,
      });
      servedRuntime = enforcement.servedOutput;
    }
  }
  enforcement.repair_attempts = policyRepairAttempts;
  return {
    original: original,
    servedRuntime: servedRuntime,
    enforcement: enforcement,
    policyRepairAttempts: policyRepairAttempts,
    policyRepairPayload: policyRepairPayload,
  };
}

export async function persistDevelopmentEval(args) {
  const trialIndex = args.trialIndex ?? 0;
  const arm = args.arm ?? "baseline";
  const suite = resolveSuite(args.suiteId || args.suite || (args.casesPath ? null : "v0.1"));
  const casesPath = args.casesPath || suite.casesPath || defaultDevCasesPath();
  const suiteVersion = args.suiteVersion || suite.suiteVersion || SUITE_VERSION;
  const suiteId = args.suiteId || suite.suiteId || "atlas-dev-v0.1";
  const loaded = loadDevelopmentCases(casesPath);
  let cases = loaded;
  if (args.caseId) {
    cases = loaded.filter((c) => c.case_id === args.caseId);
    if (!cases.length) throw new Error("case not found: " + args.caseId);
  }
  if (args.maxCases) cases = cases.slice(0, Number(args.maxCases));
  const now = new Date().toISOString();
  const runId = randomUUID();
  const cost = emptyCost();
  const unionRetrieved = new Set();
  const judgeInfo = semanticJudgeStatus(args.store);
  const judgeActivated = args.activateSemantic !== false && judgeInfo.activated === true;
  const semanticJudge = judgeActivated ? judgeInfo.status : SEMANTIC_JUDGE;
  const attainableMax = judgeActivated ? 100 : ATTAINABLE_MAX;

  let nAttempted = 0;
  let nCompleted = 0;
  let nInvalid = 0;
  let nRetries = 0;
  let nScored = 0;
  let infraFailure = null;

  const runFields = () => ({
    id: runId,
    agentVersionId: args.agentVersionId,
    versionId: args.agentVersionId,
    suiteVersion: suiteVersion,
    suiteId: suiteId,
    arm: arm,
    trialIndex: trialIndex,
    responderKind: args.responderKind,
    persistence: "FILE_STORE",
    semanticJudge: semanticJudge,
    attainableMax: attainableMax,
    retrievedItemIds: [...unionRetrieved],
    curriculumSnapshotId: args.curriculumSnapshotId ?? null,
    cost: { ...cost },
    nAttempted: nAttempted,
    nCompleted: nCompleted,
    nInvalid: nInvalid,
    nRetries: nRetries,
    nScored: nScored,
    completionRate: nAttempted ? nCompleted / nAttempted : 0,
  });

  args.store.putEvalRun({
    ...runFields(),
    status: "running",
    createdAt: now,
    completedAt: null,
    error: null,
    eligibleForPromotion: false,
    eligibleForInterpretation: false,
  });

  try { hydrateOwnerApplicabilityFromDisk(); } catch { /* optional */ }
  const results = [];
  for (const record of cases) {
    const started = Date.now();
    nAttempted += 1;
    let error = null;
    let authoringOutput = emptyOutput(record.case_id);
    let validationOk = false;
    let runtimeInputUsed = undefined;
    let parseNote = null;
    let retrievalTrace = emptyKnowledgeBundle();
    let retried = false;
    let retryErrors = null;
    let infra = false;
    let runtimeOutputKept = null;
    let knowledgeBundleKept = [];
    let presentedMapping = null;
    try {
      if (args.responderKind === "live") {
        assertWithinBudget({ store: args.store, runUsd: cost.usdEstimate });
      }
      const presented = presentCase({
        record: record,
        evaluatorSecret: args.evaluatorSecret,
        suiteVersion: suiteVersion,
        trialIndex: trialIndex,
      });
      runtimeInputUsed = presented.runtimeInput;
      presentedMapping = presented.mapping;
      retrievalTrace = retrieveForArm(args, presented.runtimeInput, record);
      for (const id of retrievalTrace.retrievedItemIds || []) unionRetrieved.add(id);
      const knowledgeBundle = (retrievalTrace.items || []).map((item) => enrichKnowledgeItem(item));
      retrievalTrace.items = knowledgeBundle;
      retrievalTrace.applicabilityTraces = buildApplicabilityTraces(knowledgeBundle, presented.runtimeInput.prospects || []);
      let runtimeOutput = await args.responder(presented.runtimeInput, {
        knowledgeBundle: knowledgeBundle,
        retrievedItemIds: retrievalTrace.retrievedItemIds,
      });
      runtimeOutputKept = runtimeOutput;
      knowledgeBundleKept = knowledgeBundle;
      parseNote = (await applyUsage(cost, runtimeOutput, args, runId)) || parseNote;
      let validation = validateOutput(runtimeOutput);
      validationOk = validation.ok;
      if (!validation.ok) {
        const sanitized = sanitizeValidationErrors(validation.errors);
        retryErrors = sanitized;
        retried = true;
        nRetries += 1;
        const repairOutput = await args.responder(presented.runtimeInput, {
          knowledgeBundle: knowledgeBundle,
          retrievedItemIds: retrievalTrace.retrievedItemIds,
          repair: { validationErrors: sanitized },
        });
        parseNote = (await applyUsage(cost, repairOutput, args, runId)) || parseNote;
        runtimeOutput = repairOutput;
        runtimeOutputKept = runtimeOutput;
        validation = validateOutput(runtimeOutput);
        validationOk = validation.ok;
        if (!validation.ok) {
          error = (parseNote ? parseNote + "; " : "") + validation.errors.join("; ");
        }
      }
      authoringOutput = validation.ok
        ? translateResponse(runtimeOutput, presented.mapping)
        : emptyOutput(record.case_id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (isInfraError(error)) {
        infra = true;
        infraFailure = error;
        if (String(error).startsWith("BUDGET_ABORT")) {
          cost.aborted = true;
          cost.abortReason = error;
        }
      } else if (!error) {
        error = "responder error";
      }
    }

    if (infra) {
      const saved = args.store.putCaseResult({
        id: runId + ":" + record.case_id,
        evalRunId: runId,
        caseId: record.case_id,
        title: record.title,
        scoreStatus: "inconclusive",
        weightedTotal: null,
        dimensions: null,
        criticalFailures: [],
        assessments: [],
        rankedQualifiedIds: [],
        researchQueueIds: [],
        excludedIds: [],
        caseUncertainties: [],
        citations: [],
        missingInformation: [],
        scores: { weightedTotal: null, dimensions: null, evidenceDetail: null },
        attainableMax: attainableMax,
        semanticJudge: semanticJudge,
        retrievalTrace: retrievalTrace,
        latencyMs: Date.now() - started,
        error: error,
        blocked: true,
        retried: retried,
        retryErrors: retryErrors,
        responderKind: args.responderKind,
        complianceViolations: [],
        validationOk: validationOk,
        parseNote: parseNote || null,
      });
      results.push(saved);
      break;
    }

    if (!validationOk || !authoringOutput.assessments.length) {
      nInvalid += 1;
      const saved = args.store.putCaseResult({
        id: runId + ":" + record.case_id,
        evalRunId: runId,
        caseId: record.case_id,
        title: record.title,
        scoreStatus: "invalid",
        weightedTotal: null,
        dimensions: null,
        criticalFailures: [],
        assessments: [],
        rankedQualifiedIds: [],
        researchQueueIds: [],
        excludedIds: [],
        caseUncertainties: [],
        citations: [],
        missingInformation: [],
        scores: { weightedTotal: null, dimensions: null, evidenceDetail: null },
        attainableMax: attainableMax,
        semanticJudge: semanticJudge,
        retrievalTrace: retrievalTrace,
        latencyMs: Date.now() - started,
        error: error || "invalid or empty output after bounded repair",
        blocked: false,
        retried: retried,
        retryErrors: retryErrors,
        responderKind: args.responderKind,
        complianceViolations: [],
        validationOk: validationOk,
        parseNote: parseNote || null,
      });
      const attributedInvalid = attachAttribution({ ...saved }, args, record, retrievalTrace, validationOk);
      results.push(args.store.putCaseResult({ ...saved, ...attributedInvalid }));
      nCompleted += 1;
      continue;
    }

    let rawAuthoring = authoringOutput;
    let servedAuthoring = authoringOutput;
    let enforcementPack = null;
    if (runtimeOutputKept && runtimeInputUsed && presentedMapping) {
      const enforced = await enforceAndMaybeRepair({
        runtimeInput: runtimeInputUsed,
        runtimeOutput: runtimeOutputKept,
        knowledgeBundle: knowledgeBundleKept,
        traces: retrievalTrace.applicabilityTraces || [],
        arm: arm,
        liveRepair: args.responderKind === "live",
        responder: args.responder,
        retrievedItemIds: retrievalTrace.retrievedItemIds,
        applyUsage: async (out) => {
          parseNote = (await applyUsage(cost, out, args, runId)) || parseNote;
        },
      });
      enforcementPack = enforced;
      rawAuthoring = translateResponse(enforced.original, presentedMapping);
      servedAuthoring = translateResponse(enforced.servedRuntime, presentedMapping);
      authoringOutput = servedAuthoring;
      // policy repairs are recorded separately; schema nRetries stays schema-only
    }

    function claimsKey(output) {
      try {
        return JSON.stringify(extractMaterialClaims(output, record));
      } catch {
        return "";
      }
    }
    let semanticDetail = { semantic: 0, judgments: [], status: semanticJudge };
    let rawSemanticDetail = null;
    if (judgeActivated) {
      try {
        const servedClaims = extractMaterialClaims(authoringOutput, record);
        const judged = await liveJudgeClaims({ items: servedClaims });
        if (judged.ok) {
          const scored = scoreSemanticFromJudgments(judged.judgments);
          semanticDetail = { semantic: scored.semantic, judgments: judged.judgments, status: semanticJudge };
          if (judged.usage) addUsage(cost, judged.usage);
        }
        if (claimsKey(rawAuthoring) === claimsKey(authoringOutput)) {
          rawSemanticDetail = semanticDetail;
        } else {
          const rawJudged = await liveJudgeClaims({ items: extractMaterialClaims(rawAuthoring, record) });
          if (rawJudged.ok) {
            const rawScored = scoreSemanticFromJudgments(rawJudged.judgments);
            rawSemanticDetail = { semantic: rawScored.semantic, judgments: rawJudged.judgments, status: semanticJudge };
            if (rawJudged.usage) addUsage(cost, rawJudged.usage);
          }
        }
      } catch (err) {
        semanticDetail = { semantic: 0, judgments: [], status: "unavailable", error: err instanceof Error ? err.message : String(err) };
      }
    }

    const rawScore = scoreCase({
      record: record,
      authoringOutput: rawAuthoring,
      runtimeInputUsed: runtimeInputUsed,
      semanticJudgeResult: judgeActivated ? rawSemanticDetail : null,
    });
    const score = scoreCase({
      record: record,
      authoringOutput: authoringOutput,
      runtimeInputUsed: runtimeInputUsed,
      semanticJudgeResult: judgeActivated ? semanticDetail : null,
    });
    const rawDims = {
      qualification: rawScore.dimensions.qualification,
      ranking: rawScore.dimensions.ranking,
      evidence: rawScore.dimensions.evidence,
      uncertainty: rawScore.dimensions.uncertainty,
      nextAction: rawScore.dimensions.next_action,
      compliance: rawScore.dimensions.compliance,
    };
    const assessments = authoringOutput.assessments.map((a) => ({
      prospect_id: a.prospect_id,
      classification: a.classification,
      cited_evidence_ids: [...a.cited_evidence_ids],
      missing_information: [...a.missing_information],
      next_action: a.next_action,
      rationale: a.rationale,
      disqualification_reason: a.disqualification_reason,
      fit_score: a.fit_score,
    }));
    const dims = {
      qualification: score.dimensions.qualification,
      ranking: score.dimensions.ranking,
      evidence: score.dimensions.evidence,
      uncertainty: score.dimensions.uncertainty,
      nextAction: score.dimensions.next_action,
      compliance: score.dimensions.compliance,
    };
    const saved = args.store.putCaseResult({
      id: runId + ":" + record.case_id,
      evalRunId: runId,
      caseId: record.case_id,
      title: record.title,
      scoreStatus: "scored",
      weightedTotal: score.weighted_total,
      dimensions: dims,
      criticalFailures: score.critical_failures,
      assessments: assessments,
      rankedQualifiedIds: authoringOutput.ranked_qualified_ids,
      researchQueueIds: authoringOutput.research_queue_ids,
      excludedIds: authoringOutput.excluded_ids,
      caseUncertainties: authoringOutput.case_uncertainties,
      citations: assessments.map((a) => ({ prospect_id: a.prospect_id, evidence_ids: a.cited_evidence_ids })),
      missingInformation: assessments.map((a) => ({ prospect_id: a.prospect_id, fields: a.missing_information })),
      scores: {
        weightedTotal: score.weighted_total,
        dimensions: dims,
        evidenceDetail: score.evidence_detail,
      },
      attainableMax: attainableMax,
      semanticJudge: semanticJudge,
      claimJudgments: semanticDetail.judgments || [],
      retrievalTrace: retrievalTrace,
      latencyMs: Date.now() - started,
      error: error,
      blocked: false,
      retried: retried,
      retryErrors: retryErrors,
      responderKind: args.responderKind,
      complianceViolations: score.compliance_violations,
      validationOk: validationOk,
      parseNote: parseNote || null,
      modelProposal: enforcementPack ? enforcementPack.enforcement.model_proposal : rawAuthoring.assessments,
      policyEvaluation: enforcementPack ? enforcementPack.enforcement.policy_evaluation : [],
      policyConflicts: enforcementPack ? enforcementPack.enforcement.policy_conflicts : [],
      servedDecision: enforcementPack ? enforcementPack.enforcement.served_decision : null,
      enforcementIntervened: enforcementPack ? enforcementPack.enforcement.enforcement_intervened : false,
      interventionReason: enforcementPack ? enforcementPack.enforcement.intervention_reason : null,
      policyRepairAttempts: enforcementPack ? enforcementPack.policyRepairAttempts : 0,
      rawAssessments: (rawAuthoring.assessments || []).map((a) => ({
        prospect_id: a.prospect_id,
        classification: a.classification,
        next_action: a.next_action,
        cited_evidence_ids: [...a.cited_evidence_ids],
        missing_information: [...a.missing_information],
        rationale: a.rationale,
        disqualification_reason: a.disqualification_reason,
        fit_score: a.fit_score,
      })),
      rawWeightedTotal: rawScore.weighted_total,
      rawDimensions: rawDims,
      rawCriticalFailures: rawScore.critical_failures,
      servedWeightedTotal: score.weighted_total,
      policyEnforcement: enforcementPack ? {
        enforcement_intervened: enforcementPack.enforcement.enforcement_intervened,
        intervention_reason: enforcementPack.enforcement.intervention_reason,
        repair_attempts: enforcementPack.policyRepairAttempts,
        conflicts: enforcementPack.enforcement.policy_conflicts,
        per_prospect: enforcementPack.enforcement.per_prospect,
      } : null,
    });
    const attributed = attachAttribution({ ...saved, policyEnforcement: saved.policyEnforcement, enforcementIntervened: saved.enforcementIntervened }, args, record, retrievalTrace, validationOk);
    const rewritten = args.store.putCaseResult({ ...saved, ...attributed });
    results.push(rewritten);
    nCompleted += 1;
    nScored += 1;
  }

  let status = "completed";
  if (infraFailure) status = "blocked";
  else if (nInvalid > 0) status = "completed_with_invalids";
  const eligible = status === "completed" && nInvalid === 0 && !infraFailure;
  const completed = args.store.putEvalRun({
    ...runFields(),
    status: status,
    createdAt: now,
    completedAt: new Date().toISOString(),
    error: infraFailure,
    inconclusive: status === "blocked",
    eligibleForPromotion: eligible,
    eligibleForInterpretation: eligible,
    note:
      status === "blocked"
        ? "Infra/auth failure — scores are not evidence"
        : status === "completed_with_invalids"
          ? "Completed with invalid cases. Means use n_scored/n_attempted. Not eligible for promotion."
          : null,
  });
  return { run: completed, results: results };
}
