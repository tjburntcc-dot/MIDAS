/** Apply Mission 16 evaluator correction to a FILE_STORE. Zero provider calls. */

import { recordContribution } from "./contribution.ts";
import { freezeAndMaybeActivateEvaluator, PARENT_EVALUATOR_ID } from "./evaluator-revision.ts";
import { rescorePreservedBakeoff, rescorePreservedRun } from "./offer-strategist-rescore.ts";
import { reviewAndSupersedeOfferStrategistAudit } from "./watcher.ts";
import { evaluateStrategistGates, applyDevelopmentVerification } from "./offer-strategist-progression.ts";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";

function nowIso() {
  return new Date().toISOString();
}

export function attributeOsrSchemaFailures(store, extras) {
  const events = [];
  for (const id of ["OSR-001", "OSR-002"]) {
    const run = store.getOfferStrategistRun && store.getOfferStrategistRun(id);
    if (!run && !(extras && extras.allowMissing)) continue;
    const rec = {
      id: id === "OSR-001" ? "SDEV-001" : "SDEV-002",
      kind: "system_development",
      cause: "output-contract construction / provider-schema validation",
      attribution: "system-development",
      notEmployee: true,
      notModel: true,
      employeeCredit: false,
      employeeBlame: false,
      runId: id,
      error: (run && run.error) || "HTTP 400 invalid_json_schema",
      detail: "labels.status (and possibly other object properties) were optional. OpenAI strict schema rejected the request. The model was never allowed to execute successfully. No employee credit. No employee blame.",
      createdAt: nowIso(),
      workspaceId: (run && run.workspaceId) || "ws-ridgeline",
    };
    if (store.putSystemDevelopmentEvent) {
      try { store.putSystemDevelopmentEvent(rec); } catch { /* already present */ }
    }
    events.push(rec);
    try {
      recordContribution(store, {
        id: id === "OSR-001" ? "CE-035" : "CE-036",
        kind: "system_development_schema_failure",
        role: "system",
        agentId: "system-development",
        workspaceId: rec.workspaceId,
        evidence: { runId: id, systemEventId: rec.id },
        note: rec.detail,
        state: "verified",
        selfAwarded: false,
        effective: false,
      });
    } catch { /* already present or id taken */ }
  }
  return events;
}

export function recordEvaluatorCorrectionEvents(store, extras) {
  const events = [];
  try {
    const ev = recordContribution(store, {
      id: extras && extras.correctionEventId || "CE-037",
      kind: "evaluator_correction",
      role: "evaluator",
      agentId: "evaluator",
      workspaceId: extras && extras.workspaceId || "ws-ridgeline",
      evidence: {
        runId: extras && extras.runId || "OSR-003",
        auditId: extras && extras.originalAuditId || "AUD-watcher-ws-ridgeline-os-2026-08-21191640",
        evaluatorRevisionId: extras && extras.evaluatorRevisionId || "EVL-M16-001",
      },
      note: "Verified evaluator correction. Original Watcher VIOLATION on $2,500 was a false positive from literal-token formatting. No negative employee performance event.",
      state: "verified",
      selfAwarded: false,
    });
    events.push(ev);
  } catch { /* already present */ }
  try {
    const ev = recordContribution(store, {
      id: extras && extras.falseAlarmEventId || "CE-038",
      kind: "false_alarm_detected",
      role: "independent_audit",
      agentId: extras && extras.watcherAgentId || "watcher-ws-ridgeline",
      workspaceId: extras && extras.workspaceId || "ws-ridgeline",
      evidence: {
        runId: extras && extras.runId || "OSR-003",
        auditId: extras && extras.supersedingAuditId,
        evaluatorRevisionId: extras && extras.evaluatorRevisionId || "EVL-M16-001",
      },
      note: "Watcher false alarm on approved monthly spend formatting. Attributed to evaluator, not employee.",
      state: "verified",
      selfAwarded: false,
    });
    events.push(ev);
  } catch { /* already present */ }
  return events;
}

export function frozenHashAudit(store) {
  const out = {};
  for (const id of Object.keys(FROZEN_HASHES)) {
    const v = store.getVersion && store.getVersion(id);
    out[id] = {
      expected: FROZEN_HASHES[id],
      actual: v && v.contentHash,
      match: !v || v.contentHash === FROZEN_HASHES[id],
      mutated: Boolean(v && v.contentHash && v.contentHash !== FROZEN_HASHES[id]),
    };
  }
  return out;
}

export function applyMission16(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  const providerCalls = 0;
  const osr001 = store.getOfferStrategistRun && store.getOfferStrategistRun("OSR-001");
  const osr002 = store.getOfferStrategistRun && store.getOfferStrategistRun("OSR-002");
  const osr003 = store.getOfferStrategistRun && store.getOfferStrategistRun("OSR-003");
  const originalAudit = store.getWatcherAudit && store.getWatcherAudit("AUD-watcher-ws-ridgeline-os-2026-08-21191640");
  const originalBakeoff = store.getBakeoffRun && store.getBakeoffRun("BO-M15-001");
  const hashBefore = frozenHashAudit(store);

  const schemaEvents = attributeOsrSchemaFailures(store, extras);
  const activation = freezeAndMaybeActivateEvaluator(store, extras);
  if (!activation.activated) {
    return {
      ok: false,
      providerCalls: 0,
      activation: activation,
      schemaEvents: schemaEvents,
      note: "Calibration gates failed. Official evaluator not replaced. Employee progression unchanged.",
    };
  }

  const knowledge = listApprovedWorkspaceKnowledge(store, workspaceId);
  const runRescore = osr003 ? rescorePreservedRun(store, osr003, { approvedKnowledge: knowledge }) : null;
  const bakeoffRescore = originalBakeoff
    ? rescorePreservedBakeoff(store, {
      parent: originalBakeoff,
      parentBakeoffId: "BO-M15-001",
      approvedKnowledge: knowledge,
      evaluatorRevisionId: activation.revision.id,
      id: extras && extras.rescoreId || "BO-M15-001-rescore",
    })
    : null;

  const watcher = (originalAudit && osr003)
    ? reviewAndSupersedeOfferStrategistAudit(store, {
      workspaceId: workspaceId,
      original: originalAudit,
      originalAuditId: originalAudit.id,
      run: osr003,
      approvedKnowledge: knowledge,
      evaluatorRevisionId: activation.revision.id,
      reviewId: extras && extras.reviewId || "WAR-M16-001",
      reportId: extras && extras.supersedingAuditId || "AUD-watcher-ws-ridgeline-os-m16-20260821161600",
    })
    : null;

  const correctionEvents = recordEvaluatorCorrectionEvents(store, {
    workspaceId: workspaceId,
    runId: osr003 && osr003.id,
    originalAuditId: originalAudit && originalAudit.id,
    supersedingAuditId: watcher && watcher.report && watcher.report.id,
    evaluatorRevisionId: activation.revision.id,
  });

  const contract = ((store.listRoleContracts && store.listRoleContracts()) || []).slice(-1)[0] || null;
  const evaluation = evaluateStrategistGates(store, {
    workspaceId: workspaceId,
    run: osr003,
    audit: watcher && watcher.report,
    contract: contract,
    bakeoff: originalBakeoff || bakeoffRescore,
  });
  const progression = applyDevelopmentVerification(store, {
    workspaceId: workspaceId,
    evaluation: evaluation,
    progressionId: extras && extras.progressionId || "PRG-EMP-001-m16-001",
  });

  const hashAfter = frozenHashAudit(store);
  const osr003After = store.getOfferStrategistRun && store.getOfferStrategistRun("OSR-003");
  const originalAuditAfter = store.getWatcherAudit && store.getWatcherAudit("AUD-watcher-ws-ridgeline-os-2026-08-21191640");
  const bakeoffAfter = store.getBakeoffRun && store.getBakeoffRun("BO-M15-001");

  return {
    ok: true,
    providerCalls: providerCalls,
    liveApiUsd: 0,
    schemaEvents: schemaEvents,
    activation: activation,
    runRescore: runRescore,
    bakeoffRescore: bakeoffRescore,
    watcher: watcher && {
      originalId: originalAudit && originalAudit.id,
      originalStatus: originalAudit && originalAudit.status,
      supersedingId: watcher.report.id,
      supersedingStatus: watcher.report.status,
      falsePositive: watcher.falsePositive,
      structuralMatch: watcher.structuralMatch,
      reviewId: watcher.review.id,
    },
    correctionEvents: correctionEvents.map((e) => e && e.id),
    evaluation: evaluation,
    progression: progression,
    preserved: {
      osr003Unchanged: Boolean(osr003 && osr003After && osr003.contentHash === osr003After.contentHash && osr003.rawText === osr003After.rawText),
      originalAuditUnchanged: Boolean(originalAudit && originalAuditAfter && originalAuditAfter.status === "VIOLATION"),
      bakeoffUnchanged: Boolean(originalBakeoff && bakeoffAfter && bakeoffAfter.byArm && bakeoffAfter.byArm.offer_strategist && bakeoffAfter.byArm.offer_strategist.mean === originalBakeoff.byArm.offer_strategist.mean),
      frozenHashesUnchanged: Object.values(hashAfter).every((h) => h.match || h.actual == null),
    },
    hashBefore: hashBefore,
    hashAfter: hashAfter,
    osr001: osr001 && { id: osr001.id, live: osr001.live, error: osr001.error, structured: osr001.structured },
    osr002: osr002 && { id: osr002.id, live: osr002.live, error: osr002.error, structured: osr002.structured },
    parentEvaluatorId: PARENT_EVALUATOR_ID,
  };
}
