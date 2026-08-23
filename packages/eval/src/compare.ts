export function compareEvalRuns(store, v0RunId, v1RunId) {
  const v0 = store.getEvalRun(v0RunId);
  const v1 = store.getEvalRun(v1RunId);
  if (!v0) throw new Error("v0 run not found");
  if (!v1) throw new Error("v1 run not found");
  const r0 = store.listCaseResults(v0.id);
  const r1 = store.listCaseResults(v1.id);
  const by0 = new Map(r0.map((r) => [r.caseId, r]));
  const by1 = new Map(r1.map((r) => [r.caseId, r]));
  const caseIds = [...new Set([...by0.keys(), ...by1.keys()])].sort();
  const cases = [];
  const introduced = [];
  let sum0 = 0;
  let sum1 = 0;
  for (const caseId of caseIds) {
    const a = by0.get(caseId);
    const b = by1.get(caseId);
    const score0 = a && a.weightedTotal != null && a.scoreStatus !== "inconclusive" && !a.blocked ? Number(a.weightedTotal) : null;
    const score1 = b && b.weightedTotal != null && b.scoreStatus !== "inconclusive" && !b.blocked ? Number(b.weightedTotal) : null;
    const delta = score0 != null && score1 != null ? score1 - score0 : null;
    const fails0 = new Set((a?.criticalFailures || []).map((f) => f.code));
    const fails1 = b?.criticalFailures || [];
    const newFails = fails1.filter((f) => !fails0.has(f.code));
    if (newFails.length) {
      introduced.push({ caseId, failures: newFails });
    }
    if (score0 != null) sum0 += score0;
    if (score1 != null) sum1 += score1;
    cases.push({
      caseId,
      title: (b || a)?.title || "",
      v0Score: score0,
      v1Score: score1,
      v0ScoreStatus: a?.scoreStatus || (a?.blocked ? "inconclusive" : null),
      v1ScoreStatus: b?.scoreStatus || (b?.blocked ? "inconclusive" : null),
      delta,
      v0Dimensions: a?.dimensions || null,
      v1Dimensions: b?.dimensions || null,
      v0Classifications: (a?.assessments || []).map((x) => ({ prospect_id: x.prospect_id, classification: x.classification, next_action: x.next_action })),
      v1Classifications: (b?.assessments || []).map((x) => ({ prospect_id: x.prospect_id, classification: x.classification, next_action: x.next_action })),
      v0Citations: a?.citations || [],
      v1Citations: b?.citations || [],
      v0Missing: a?.missingInformation || [],
      v1Missing: b?.missingInformation || [],
      v0CriticalFailures: a?.criticalFailures || [],
      v1CriticalFailures: b?.criticalFailures || [],
      criticalFailuresIntroduced: newFails,
    });
  }
  const v0Blocked = v0.status === "blocked" || v0.status === "failed" || v0.inconclusive === true;
  const v1Blocked = v1.status === "blocked" || v1.status === "failed" || v1.inconclusive === true;
  return {
    v0RunId: v0.id,
    v1RunId: v1.id,
    v0Status: v0.status,
    v1Status: v1.status,
    inconclusive: v0Blocked || v1Blocked,
    v0VersionId: v0.agentVersionId,
    v1VersionId: v1.agentVersionId,
    trialIndexV0: v0.trialIndex,
    trialIndexV1: v1.trialIndex,
    sameTrial: v0.trialIndex === v1.trialIndex,
    sameSecretNote:
      "Both runs must use the same evaluator secret, suite version, case set, and trialIndex so presentCase HMAC presentation matches.",
    responderKindV0: v0.responderKind,
    responderKindV1: v1.responderKind,
    semanticJudge: "not_implemented",
    retrievedItemIdsV0: v0.retrievedItemIds || [],
    retrievedItemIdsV1: v1.retrievedItemIds || [],
    meanV0: caseIds.length ? sum0 / r0.length : 0,
    meanV1: caseIds.length ? sum1 / r1.length : 0,
    meanDelta: r0.length && r1.length ? sum1 / r1.length - sum0 / r0.length : null,
    criticalFailuresIntroducedByChallenger: introduced,
    v0Cost: v0.cost || null,
    v1Cost: v1.cost || null,
    cases,
    honesty: [
      "Scores are from the labeled responder (fixture unless OPENAI_API_KEY is set).",
      "Semantic evidence judge is not_implemented; evidence cannot exceed the deterministic half.",
      "This comparison is not a statistical proof of improvement.",
    ],
  };
}

export function latestComparablePair(store) {
  const runs = store.listEvalRuns().filter((r) => r.status === "completed");
  const v0s = runs.filter((r) => r.agentVersionId === "atlas-v0").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const v1s = runs.filter((r) => r.agentVersionId === "atlas-v1").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!v0s.length || !v1s.length) return null;
  const v1 = v1s[v1s.length - 1];
  const sameTrial = [...v0s].reverse().find((r) => r.trialIndex === v1.trialIndex);
  const v0 = sameTrial || v0s[v0s.length - 1];
  return { v0RunId: v0.id, v1RunId: v1.id };
}


function scoredTotal(row) {
  if (!row) return null;
  if (row.weightedTotal == null || row.scoreStatus === "inconclusive" || row.blocked) return null;
  return Number(row.weightedTotal);
}

function meanScored(rows) {
  const vals = rows.map(scoredTotal).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function meanRaw(rows) {
  const vals = (rows || []).map((row) => (row && row.rawWeightedTotal != null ? Number(row.rawWeightedTotal) : null)).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pickLatest(arr, preferredIds) {
  if (!arr || !arr.length) return null;
  const pref = preferredIds && preferredIds.length ? arr.filter((r) => preferredIds.includes(r.agentVersionId)) : [];
  const pool = pref.length ? pref : arr;
  return pool.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[pool.length - 1];
}

function verdictOf(baseMean, relMean, pboMean, blocked) {
  if (blocked) return "blocked";
  if (baseMean == null || relMean == null || pboMean == null) return "inconclusive";
  const eps = 0.05;
  const beatBase = relMean > baseMean + eps;
  const beatPbo = relMean > pboMean + eps;
  const loseBase = relMean < baseMean - eps;
  const losePbo = relMean < pboMean - eps;
  if (beatBase && beatPbo) return "improved";
  if (loseBase && losePbo) return "regressed";
  if (!beatBase && !loseBase && !beatPbo && !losePbo) return "tied";
  if ((beatBase && losePbo) || (loseBase && beatPbo)) return "inconclusive";
  return "tied";
}

export function compareExperimentArms(store, baselineRunId, relevantRunId, placeboRunId) {
  const baseline = store.getEvalRun(baselineRunId);
  const relevant = store.getEvalRun(relevantRunId);
  const placebo = store.getEvalRun(placeboRunId);
  if (!baseline) throw new Error("baseline run not found");
  if (!relevant) throw new Error("relevant run not found");
  if (!placebo) throw new Error("placebo run not found");
  const rB = store.listCaseResults(baseline.id);
  const rR = store.listCaseResults(relevant.id);
  const rP = store.listCaseResults(placebo.id);
  const byB = new Map(rB.map((r) => [r.caseId, r]));
  const byR = new Map(rR.map((r) => [r.caseId, r]));
  const byP = new Map(rP.map((r) => [r.caseId, r]));
  const caseIds = [...new Set([...byB.keys(), ...byR.keys(), ...byP.keys()])].sort();
  const cases = [];
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (const caseId of caseIds) {
    const b = byB.get(caseId);
    const r = byR.get(caseId);
    const p = byP.get(caseId);
    const sb = scoredTotal(b);
    const sr = scoredTotal(r);
    const sp = scoredTotal(p);
    let caseResult = "inconclusive";
    if (sb == null || sr == null || sp == null) {
      caseResult = b?.blocked || r?.blocked || p?.blocked ? "blocked" : "inconclusive";
    } else if (sr > sb && sr > sp) {
      caseResult = "win";
      wins += 1;
    } else if (sr < sb || sr < sp) {
      caseResult = "loss";
      losses += 1;
    } else {
      caseResult = "tie";
      ties += 1;
    }
    cases.push({
      caseId: caseId,
      title: (r || b || p)?.title || "",
      baselineScore: sb,
      relevantScore: sr,
      placeboScore: sp,
      deltaRelevantMinusBaseline: sb != null && sr != null ? sr - sb : null,
      deltaRelevantMinusPlacebo: sp != null && sr != null ? sr - sp : null,
      result: caseResult,
      baselineDimensions: b?.dimensions || null,
      relevantDimensions: r?.dimensions || null,
      placeboDimensions: p?.dimensions || null,
      baselineClassifications: (b?.assessments || []).map((x) => ({ prospect_id: x.prospect_id, classification: x.classification, next_action: x.next_action })),
      relevantClassifications: (r?.assessments || []).map((x) => ({ prospect_id: x.prospect_id, classification: x.classification, next_action: x.next_action })),
      placeboClassifications: (p?.assessments || []).map((x) => ({ prospect_id: x.prospect_id, classification: x.classification, next_action: x.next_action })),
      baselineMissing: b?.missingInformation || [],
      relevantMissing: r?.missingInformation || [],
      placeboMissing: p?.missingInformation || [],
      baselineCitations: b?.citations || [],
      relevantCitations: r?.citations || [],
      placeboCitations: p?.citations || [],
      baselineCriticalFailures: b?.criticalFailures || [],
      relevantCriticalFailures: r?.criticalFailures || [],
      placeboCriticalFailures: p?.criticalFailures || [],
      baselineRetrieval: b?.retrievalTrace || null,
      relevantRetrieval: r?.retrievalTrace || null,
      placeboRetrieval: p?.retrievalTrace || null,
      baselineAttribution: b?.failureAttribution || null,
      relevantAttribution: r?.failureAttribution || null,
      relevantAttributionSubreasons: r?.failureAttributionSubreasons || [],
      placeboAttribution: p?.failureAttribution || null,
      relevantCriticalCoverage: r?.criticalCoverage != null ? r.criticalCoverage : null,
      relevantRetrievalPolicy: (r?.retrievalTrace && r.retrievalTrace.retrievalPolicyVersion) || null,
    });
  }
  const infraBlocked =
    [baseline, relevant, placebo].some((r) => r.status === "blocked" || r.status === "failed" || r.inconclusive === true);
  const anyInvalid = [baseline, relevant, placebo].some((r) => r.status === "completed_with_invalids" || Number(r.nInvalid || 0) > 0);
  const eligible = !infraBlocked && !anyInvalid && [baseline, relevant, placebo].every((r) => r.status === "completed" && r.eligibleForInterpretation !== false);
  const meanB = infraBlocked ? null : meanScored(rB);
  const meanR = infraBlocked ? null : meanScored(rR);
  const meanP = infraBlocked ? null : meanScored(rP);
  const countsOf = (run, rows) => ({
    nAttempted: run.nAttempted != null ? run.nAttempted : rows.length,
    nCompleted: run.nCompleted != null ? run.nCompleted : rows.filter((x) => x.scoreStatus === "scored" || x.scoreStatus === "invalid").length,
    nScored: run.nScored != null ? run.nScored : rows.filter((x) => x.scoreStatus === "scored" && x.weightedTotal != null).length,
    nInvalid: run.nInvalid != null ? run.nInvalid : rows.filter((x) => x.scoreStatus === "invalid").length,
    nRetries: run.nRetries != null ? run.nRetries : rows.filter((x) => x.retried).length,
  });
  return {
    baselineRunId: baseline.id,
    relevantRunId: relevant.id,
    placeboRunId: placebo.id,
    baselineVersionId: baseline.agentVersionId,
    relevantVersionId: relevant.agentVersionId,
    placeboVersionId: placebo.agentVersionId,
    trialIndex: relevant.trialIndex,
    sameTrial: baseline.trialIndex === relevant.trialIndex && relevant.trialIndex === placebo.trialIndex,
    baselineStatus: baseline.status,
    relevantStatus: relevant.status,
    placeboStatus: placebo.status,
    semanticJudge: baseline.semanticJudge || relevant.semanticJudge || "not_implemented",
    attainableMax: relevant.attainableMax != null ? relevant.attainableMax : 92.5,
    meanBaseline: meanB,
    meanRelevant: meanR,
    meanPlacebo: meanP,
    nBaseline: countsOf(baseline, rB),
    nRelevant: countsOf(relevant, rR),
    nPlacebo: countsOf(placebo, rP),
    eligibleForInterpretation: eligible,
    eligibleForPromotion: eligible,
    result: verdictOf(meanB, meanR, meanP, infraBlocked),
    wins: wins,
    ties: ties,
    losses: losses,
    baselineCost: baseline.cost || null,
    relevantCost: relevant.cost || null,
    placeboCost: placebo.cost || null,
    totalUsd:
      Number((baseline.cost && baseline.cost.usdEstimate) || 0) +
      Number((relevant.cost && relevant.cost.usdEstimate) || 0) +
      Number((placebo.cost && placebo.cost.usdEstimate) || 0),
    meanBaselineRaw: meanRaw(rB),
    meanRelevantRaw: meanRaw(rR),
    meanPlaceboRaw: meanRaw(rP),
    meanBaselineEnforced: meanB,
    meanRelevantEnforced: meanR,
    meanPlaceboEnforced: meanP,
    cases: cases.map((c, i) => {
      const b = byB.get(c.caseId);
      const r = byR.get(c.caseId);
      const p = byP.get(c.caseId);
      return {
        ...c,
        baselineRawScore: b && b.rawWeightedTotal != null ? Number(b.rawWeightedTotal) : null,
        relevantRawScore: r && r.rawWeightedTotal != null ? Number(r.rawWeightedTotal) : null,
        placeboRawScore: p && p.rawWeightedTotal != null ? Number(p.rawWeightedTotal) : null,
        baselineEnforcedScore: c.baselineScore,
        relevantEnforcedScore: c.relevantScore,
        placeboEnforcedScore: c.placeboScore,
        relevantEnforcementIntervened: r && r.enforcementIntervened === true,
        relevantPolicyConflicts: (r && r.policyConflicts) || [],
      };
    }),
    honesty: [
      "One or two trials of eight development cases is not statistical proof.",
      "Semantic evidence judge is not_implemented; attainable max is 92.5.",
      "Placebo is a length-matched irrelevant-knowledge arm, not a hidden gold condition.",
      "Blocked or inconclusive scores are not quality evidence.",
      "Arms with invalids or infra failure are ineligible for promotion. Means report n_scored / n_attempted.",
    ],
  };
}

function collectTrios(store, statusFilter) {
  const runs = store.listEvalRuns().filter((r) => statusFilter.includes(r.status));
  const groups = new Map();
  for (const r of runs) {
    const key = String(r.trialIndex) + "::" + String(r.suiteId || r.suiteVersion || "");
    if (!groups.has(key)) groups.set(key, { baseline: [], relevant: [], placebo: [], oracle: [] });
    const g = groups.get(key);
    if (r.arm === "baseline") g.baseline.push(r);
    if (r.arm === "relevant") g.relevant.push(r);
    if (r.arm === "placebo") g.placebo.push(r);
    if (r.arm === "oracle") g.oracle.push(r);
  }
  const trios = [];
  for (const [key, g] of groups) {
    if (!g.baseline.length || !g.relevant.length || !g.placebo.length) continue;
    const trio = {
      baseline: pickLatest(g.baseline, ["atlas-v9", "atlas-v7", "atlas-v4", "atlas-v2"]),
      relevant: pickLatest(g.relevant, ["atlas-v10", "atlas-v8", "atlas-v6", "atlas-v5", "atlas-v3"]),
      placebo: pickLatest(g.placebo, ["atlas-v10", "atlas-v8", "atlas-v6", "atlas-v5", "atlas-v4", "atlas-v3", "atlas-v2"]),
      oracle: pickLatest(g.oracle, ["atlas-v10", "atlas-v8", "atlas-v6", "atlas-v5", "atlas-v4"]),
      trialIndex: Number(String(key).split("::")[0]),
      suiteId: String(key).split("::")[1] || null,
    };
    if (!trio.baseline || !trio.relevant || !trio.placebo) continue;
    trios.push(trio);
  }
  trios.sort((a, b) => {
    const ta = a.relevant.createdAt || "";
    const tb = b.relevant.createdAt || "";
    return ta.localeCompare(tb);
  });
  return trios;
}

export function latestExperimentTrio(store) {
  const all = collectTrios(store, ["completed", "completed_with_invalids", "blocked", "failed"]);
  return all.length ? all[all.length - 1] : null;
}

export function latestCompletedExperimentTrio(store) {
  const completed = collectTrios(store, ["completed"]);
  return completed.length ? completed[completed.length - 1] : null;
}

export function latestBlockedExperimentTrio(store) {
  const blocked = collectTrios(store, ["blocked", "failed"]);
  return blocked.length ? blocked[blocked.length - 1] : null;
}

export function latestInconclusiveExperimentTrio(store) {
  const rows = collectTrios(store, ["completed_with_invalids", "blocked", "failed"]);
  return rows.length ? rows[rows.length - 1] : null;
}

export function experimentPointers(store) {
  const latestAttempted = latestExperimentTrio(store);
  const latestCompleted = latestCompletedExperimentTrio(store);
  const latestBlocked = latestBlockedExperimentTrio(store);
  const latestInconclusive = latestInconclusiveExperimentTrio(store);
  return {
    latestAttempted: latestAttempted,
    latestCompleted: latestCompleted,
    latestBlocked: latestBlocked,
    latestInconclusive: latestInconclusive,
    note: "A newer blocked or incomplete trio does not replace the latest completed trio.",
  };
}
