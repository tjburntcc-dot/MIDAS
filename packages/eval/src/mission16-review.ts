/** Control-room Mission 16 view. FILE_STORE only. No secrets. Do not hide the correction. */

import { listPendingApprovals } from "./approval-reconciliation.ts";
import { employeeSpendUsd } from "./offer-strategist-live.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { evaluateStrategistGates } from "./offer-strategist-progression.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { explainNumericNormalization } from "./numeric-normalize.ts";
import { explainClaimScope } from "./claim-scope.ts";
import { officialEvaluatorId } from "./evaluator-revision.ts";

export function mission16Review(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const role = roles.find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);
  const runs = (store.listOfferStrategistRuns && store.listOfferStrategistRuns(workspaceId)) || [];
  const osr003 = runs.find((r) => r.id === "OSR-003") || runs.filter((r) => r.live).slice(-1)[0] || null;
  const audits = (store.listWatcherAudits && store.listWatcherAudits(workspaceId)) || [];
  const originalAudit = audits.find((a) => a.id === "AUD-watcher-ws-ridgeline-os-2026-08-21191640")
    || audits.find((a) => a.offerStrategistRunId && !a.supersedes);
  const supersedingAudit = audits.find((a) => a.supersedes === (originalAudit && originalAudit.id))
    || audits.filter((a) => a.supersedes).slice(-1)[0] || null;
  const reviews = (store.listWatcherAuditReviews && store.listWatcherAuditReviews()) || [];
  const review = reviews.slice(-1)[0] || null;
  const originalBakeoff = store.getBakeoffRun && store.getBakeoffRun("BO-M15-001");
  const rescore = (store.getBakeoffRescore && store.getBakeoffRescore("BO-M15-001-rescore"))
    || ((store.listBakeoffRescores && store.listBakeoffRescores()) || []).slice(-1)[0]
    || null;
  const revision = (store.getEvaluatorRevision && store.getEvaluatorRevision("EVL-M16-001"))
    || ((store.listEvaluatorRevisions && store.listEvaluatorRevisions()) || []).slice(-1)[0]
    || null;
  const calibration = ((store.listEvaluatorCalibrations && store.listEvaluatorCalibrations()) || []).slice(-1)[0] || null;
  const sdevs = (store.listSystemDevelopmentEvents && store.listSystemDevelopmentEvents()) || [];
  const progressions = (store.listEmployeeProgressions && store.listEmployeeProgressions()) || [];
  const latestProg = progressions.filter((p) => p.employeeId === (role && role.id) || p.id && String(p.id).includes("m16")).slice(-1)[0]
    || progressions.slice(-1)[0] || null;
  const contract = ((store.listRoleContracts && store.listRoleContracts()) || []).slice(-1)[0] || null;
  const gates = evaluateStrategistGates(store, {
    workspaceId: workspaceId,
    run: osr003,
    audit: supersedingAudit || originalAudit,
    contract: contract,
    bakeoff: originalBakeoff,
  });
  const hashes = {};
  for (const id of Object.keys(FROZEN_HASHES)) {
    const v = store.getVersion(id);
    hashes[id] = { expected: FROZEN_HASHES[id], actual: v && v.contentHash, match: !v || v.contentHash === FROZEN_HASHES[id] };
  }
  const events = (store.listContributionEvents && store.listContributionEvents(workspaceId)) || [];
  const correctionEvents = events.filter((e) => e.kind === "evaluator_correction" || e.kind === "system_development_schema_failure" || e.kind === "false_alarm_detected");
  const negativeEmployee = events.filter((e) => e.role === OFFER_STRATEGIST_ROLE_ID && e.kind && /fail|violation|negative/.test(e.kind));
  return {
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    promotion: false,
    autonomous: false,
    worldClass: false,
    outreach: false,
    sealed: false,
    providerCalls: 0,
    liveApiUsd: 0,
    workspaceId: workspaceId,
    pendingApprovals: listPendingApprovals(store),
    officialEvaluatorId: officialEvaluatorId(store),
    osr001002: {
      cause: "output-contract construction / provider-schema validation",
      attribution: "system-development",
      employeeCredit: false,
      employeeBlame: false,
      modelExecuted: false,
      events: sdevs.map((e) => ({ id: e.id, runId: e.runId, cause: e.cause })),
    },
    originalWatcher: originalAudit && {
      id: originalAudit.id,
      status: originalAudit.status,
      violations: (originalAudit.violations || []).map((v) => v.code),
      checks: (originalAudit.checks || []).map((c) => ({ id: c.id, code: c.code, status: c.status, detail: c.detail })),
      originalPreserved: originalAudit.originalPreserved,
    },
    supersedingWatcher: supersedingAudit && {
      id: supersedingAudit.id,
      status: supersedingAudit.status,
      supersedes: supersedingAudit.supersedes,
      evaluatorRevisionId: supersedingAudit.evaluatorRevisionId,
      violations: (supersedingAudit.violations || []).map((v) => v.code),
      checks: (supersedingAudit.checks || []).map((c) => ({ id: c.id, code: c.code, status: c.status, detail: c.detail })),
    },
    watcherReview: review && {
      id: review.id,
      falsePositive: review.falsePositive,
      structuralMatch: review.structuralMatch,
      reason: review.reason,
    },
    bakeoffOriginal: originalBakeoff && {
      id: originalBakeoff.id,
      byArm: originalBakeoff.byArm,
      sealedEval: false,
    },
    bakeoffCorrected: rescore && {
      id: rescore.id,
      parentBakeoffId: rescore.parentBakeoffId,
      byArm: rescore.byArmCorrected,
      changedJudgments: rescore.changedJudgments,
      remainingGenuineCriticalFailures: rescore.remainingGenuineCriticalFailures,
      providerCalls: rescore.providerCalls,
    },
    evaluatorRevision: revision && {
      id: revision.id,
      parent: revision.parent,
      declaredChange: revision.declaredChange,
      contentHash: revision.contentHash,
      calibrationFixtureHash: revision.calibrationFixtureHash,
      resultsByClass: revision.resultsByClass,
      numericNormalizationVersion: revision.numericNormalizationVersion,
      claimScopeClassifierVersion: revision.claimScopeClassifierVersion,
      scoringContractHash: revision.scoringContractHash,
      createdAt: revision.createdAt,
    },
    calibration: calibration && {
      id: calibration.id,
      caseCount: calibration.caseCount,
      fixtureHash: calibration.fixtureHash,
      byClass: calibration.byClass,
      gates: calibration.gates,
      qualified: calibration.qualified,
    },
    numericNormalization: explainNumericNormalization(),
    claimScope: explainClaimScope(),
    changedJudgments: ((rescore && rescore.changedJudgments) || []).slice(),
    remainingGenuineFailures: ((rescore && rescore.remainingGenuineCriticalFailures) || []).slice(),
    progression: {
      status: role && role.status,
      previous: latestProg && latestProg.previousStatus,
      recordId: latestProg && latestProg.id,
      promoted: false,
      autonomous: false,
      worldClass: false,
      meaning: role && role.status === "development_verified"
        ? "Passed current role-specific development process. May receive supervised internal development tasks. Not promoted, not autonomous, not outreach, not world-class, not sealed."
        : "Still " + (role && role.status) + " under the frozen Mission 15 gate policy.",
      reason: gates.pass
        ? "Existing frozen gates G1–G9 all pass after qualified evaluator + corrected Watcher + preserved live task."
        : "Frozen gates still failing: " + (gates.failedIds || []).join(", "),
      gates: gates,
    },
    events: {
      correction: correctionEvents.map((e) => ({ id: e.id, kind: e.kind, role: e.role, note: e.note })),
      negativeEmployeePerformance: negativeEmployee.map((e) => e.id),
      ce029to032Preserved: ["CE-029", "CE-030", "CE-031", "CE-032"].every((id) => events.some((e) => e.id === id)),
    },
    role: role && {
      id: role.id,
      status: role.status,
      authorizedAt: role.authorizedAt,
      authorizedBy: role.authorizedBy,
      promoted: Boolean(role.promoted),
      versionId: role.versionId,
      spendLimitUsd: role.spendLimitUsd,
    },
    run: osr003 && {
      id: osr003.id,
      live: osr003.live,
      parseStatus: osr003.parseStatus,
      target_customer: osr003.structured && osr003.structured.target_customer,
      proposed_offer: osr003.structured && osr003.structured.proposed_offer,
      contentHash: osr003.contentHash,
    },
    spend: {
      employeeUsd: employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID),
      additionalLiveApiUsd: 0,
    },
    frozenHashes: hashes,
    disclosure: "Evaluator was revised. Original scores and the original Watcher VIOLATION remain visible. The correction is not hidden. Not promoted. Not sealed.",
  };
}
