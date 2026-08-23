/** Rescore preserved bakeoff/OSR outputs. Zero provider calls. */

import { scoreOfferStrategistDeterministic, scoreOfferStrategistDeterministicV2, loadOfferStrategistGold } from "./offer-strategist-bakeoff.ts";
import { judgeInventedNumbersV2 } from "./evaluator-revision.ts";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";

function codes(score) {
  return (score && score.criticalFailures || []).map((c) => c.code + ":" + String(c.detail || "")).sort();
}

function sameJudgment(a, b) {
  return JSON.stringify(codes(a)) === JSON.stringify(codes(b)) && (a && a.score) === (b && b.score);
}

export function rescorePreservedBakeoff(store, extras) {
  const parentId = (extras && extras.parentBakeoffId) || "BO-M15-001";
  const parent = (extras && extras.parent) || (store.getBakeoffRun && store.getBakeoffRun(parentId));
  if (!parent) throw new Error("preserved bakeoff not found: " + parentId);
  const goldDoc = loadOfferStrategistGold();
  const goldById = Object.fromEntries((goldDoc.cases || []).map((g) => [g.id, g]));
  const knowledge = (extras && extras.approvedKnowledge) || listApprovedWorkspaceKnowledge(store, parent.workspaceId);
  const rows = [];
  const changed = [];
  for (const row of parent.rows || []) {
    const gold = goldById[row.caseId];
    const output = { structured: row.structured, rawText: row.rawText, status: row.structured && row.structured.labels && row.structured.labels.status, refusals: row.refusals };
    const original = row.deterministic;
    const corrected = gold ? scoreOfferStrategistDeterministicV2(output, gold, { approvedKnowledge: knowledge }) : null;
    const originalReplay = gold ? scoreOfferStrategistDeterministic(output, gold, { approvedKnowledge: knowledge }) : null;
    const rowOut = {
      caseId: row.caseId,
      arm: row.arm,
      live: row.live,
      fixture: row.fixture,
      parseStatus: row.parseStatus,
      structured: row.structured,
      rawText: row.rawText,
      originalDeterministic: original,
      correctedDeterministic: corrected,
      originalReplay: originalReplay,
      changed: !sameJudgment(original, corrected),
      providerCalled: false,
    };
    rows.push(rowOut);
    if (rowOut.changed) {
      const oldCodes = (original && original.criticalFailures || []).map((c) => c.code);
      const newCodes = (corrected && corrected.criticalFailures || []).map((c) => c.code);
      const removed = oldCodes.filter((c) => !newCodes.includes(c));
      const added = newCodes.filter((c) => !oldCodes.includes(c));
      changed.push({
        caseId: row.caseId,
        arm: row.arm,
        originalScore: original && original.score,
        correctedScore: corrected && corrected.score,
        originalCritical: (original && original.criticalFailures) || [],
        correctedCritical: (corrected && corrected.criticalFailures) || [],
        removed: removed,
        added: added,
        reason: removed.includes("invented_market_stats")
          ? "Evaluator false positive: literal-token / unscoped dangerous-word match."
          : removed.includes("outreach")
            ? "Evaluator false positive: outreach word in risk/missing/refusal, not an unauthorized action proposal."
            : added.length
              ? "New genuine critical under revised evaluator."
              : "Score changed under structured numeric / claim-scope revision.",
        attribution: removed.length && !added.length ? "evaluator-error" : (added.length ? "agent-behavior" : "evaluator-error"),
      });
    }
  }
  const arms = parent.arms || [];
  const byArmOriginal = parent.byArm;
  const byArmCorrected = {};
  for (const arm of arms) {
    const armRows = rows.filter((r) => r.arm === arm && r.correctedDeterministic);
    const mean = armRows.length ? armRows.reduce((s, r) => s + r.correctedDeterministic.score, 0) / armRows.length : 0;
    byArmCorrected[arm] = {
      mean: Math.round(mean * 1000) / 1000,
      n: armRows.length,
      criticalFailures: armRows.flatMap((r) => (r.correctedDeterministic.criticalFailures || []).map((c) => ({ caseId: r.caseId, ...c }))),
    };
  }
  const remainingGenuine = rows.flatMap((r) => (r.correctedDeterministic && r.correctedDeterministic.criticalFailures || []).map((c) => ({
    caseId: r.caseId,
    arm: r.arm,
    ...c,
    attribution: "agent-behavior",
  })));
  const record = {
    id: (extras && extras.id) || "BO-M15-001-rescore",
    parentBakeoffId: parent.id,
    workspaceId: parent.workspaceId,
    createdAt: new Date().toISOString(),
    evaluatorRevisionId: (extras && extras.evaluatorRevisionId) || "EVL-M16-001",
    sameArms: true,
    samePresentations: true,
    sameResponses: true,
    sameGold: true,
    providerCalls: 0,
    live: false,
    rows: rows,
    byArmOriginal: byArmOriginal,
    byArmCorrected: byArmCorrected,
    changedJudgments: changed,
    remainingGenuineCriticalFailures: remainingGenuine,
    sealedEval: false,
    disclosure: "Rescore of preserved Mission 15 bakeoff outputs. Zero provider calls. Original scores kept. Not sealed.",
  };
  if (store && store.putBakeoffRescore) store.putBakeoffRescore(record);
  if (store && store.putBakeoffRun && extras && extras.alsoPutBakeoffRun) {
    store.putBakeoffRun({
      id: record.id,
      parentBakeoffId: parent.id,
      workspaceId: parent.workspaceId,
      createdAt: record.createdAt,
      arms: arms,
      rows: rows.map((r) => ({ ...r, deterministic: r.correctedDeterministic })),
      byArm: byArmCorrected,
      sealedEval: false,
      rescoreOf: parent.id,
      providerCalls: 0,
    });
  }
  return record;
}

export function rescorePreservedRun(store, run, extras) {
  const knowledge = (extras && extras.approvedKnowledge) || listApprovedWorkspaceKnowledge(store, run.workspaceId);
  const judged = judgeInventedNumbersV2(run, knowledge, { status: run.status, structured: run.structured });
  return {
    runId: run.id,
    providerCalls: 0,
    invented: judged.invented,
    supported: judged.numeric.supported,
    classification: judged.classification,
    unauthorized: judged.unauthorized,
  };
}
