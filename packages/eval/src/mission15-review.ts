/** Control-room Mission 15 view. FILE_STORE only. No secrets. */

import { listPendingApprovals } from "./approval-reconciliation.ts";
import { ownerSpendView } from "./spend-ledger.ts";
import { employeeSpendUsd } from "./offer-strategist-live.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { evaluateStrategistGates } from "./offer-strategist-progression.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";

export function mission15Review(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const role = roles.find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);
  const runs = (store.listOfferStrategistRuns && store.listOfferStrategistRuns(workspaceId)) || [];
  const run = runs.slice(-1)[0] || null;
  const audits = (store.listWatcherAudits && store.listWatcherAudits(workspaceId)) || [];
  const audit = audits.find((a) => a.id === "AUD-watcher-ws-ridgeline-os-2026-08-21191640")
    || audits.filter((a) => a.offerStrategistRunId && !a.supersedes).slice(-1)[0]
    || audits.filter((a) => a.offerStrategistRunId).slice(-1)[0]
    || null;
  const bakeoff = (store.getBakeoffRun && store.getBakeoffRun("BO-M15-001"))
    || ((store.listBakeoffRuns && store.listBakeoffRuns()) || []).find((b) => b.id === "BO-M15-001")
    || ((store.listBakeoffRuns && store.listBakeoffRuns()) || []).slice(-1)[0]
    || null;
  const contract = ((store.listRoleContracts && store.listRoleContracts()) || []).slice(-1)[0] || null;
  const pending = listPendingApprovals(store);
  const spend = ownerSpendView(store, workspaceId);
  const employeeUsd = employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID);
  const progression = ((store.listEmployeeProgressions && store.listEmployeeProgressions()) || []).slice(-1)[0] || null;
  const gates = evaluateStrategistGates(store, { workspaceId: workspaceId, run: run, audit: audit, contract: contract, bakeoff: bakeoff });
  const objs = (store.listObjectives && store.listObjectives(workspaceId)) || [];
  const assignment = objs.filter((o) => o.category === "offer_strategist" || o.assignedRoleId === "offer_strategist").slice(-1)[0] || null;
  const hashes = {};
  for (const id of Object.keys(FROZEN_HASHES)) {
    const v = store.getVersion(id);
    hashes[id] = { expected: FROZEN_HASHES[id], actual: v && v.contentHash, match: !v || v.contentHash === FROZEN_HASHES[id] };
  }
  return {
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    promotion: false,
    workspaceId: workspaceId,
    pendingApprovals: pending,
    staleObj002Listed: pending.some((p) => p.objectiveId === "OBJ-002"),
    authorizeBannerHidden: !(role && role.status === "awaiting_owner_authorization"),
    role: role && {
      id: role.id,
      status: role.status,
      authorizedAt: role.authorizedAt,
      authorizedBy: role.authorizedBy,
      spendLimitUsd: role.spendLimitUsd,
      promoted: Boolean(role.promoted),
      versionId: role.versionId,
    },
    assignment: assignment && { id: assignment.id, status: assignment.status, ownerText: assignment.ownerText, maxSpendUsd: assignment.maxSpendUsd },
    run: run && {
      id: run.id,
      live: run.live,
      fixture: run.fixture,
      fixtureFallback: run.fixtureFallback,
      parseStatus: run.parseStatus,
      status: run.status,
      proposed_offer: run.structured && run.structured.proposed_offer,
      target_customer: run.structured && run.structured.target_customer,
      customer_problem: run.structured && run.structured.customer_problem,
      approved_evidence: run.structured && run.structured.approved_evidence,
      assumptions: run.structured && run.structured.assumptions,
      missing_information: run.structured && run.structured.missing_information,
      risks: run.structured && run.structured.risks,
      recommended_validation_step: run.structured && run.structured.recommended_validation_step,
      labels: run.structured && run.structured.labels,
      rawPreserved: Boolean(run.rawText),
      model: run.model,
      spendUsd: run.spendUsd,
      remainingUsd: run.remainingUsd,
    },
    watcher: audit && {
      id: audit.id,
      status: audit.status,
      originalPreserved: audit.originalPreserved,
      checks: (audit.checks || []).map((c) => ({ id: c.id, code: c.code, status: c.status, detail: c.detail })),
      violations: (audit.violations || []).map((v) => v.code),
    },
    bakeoff: bakeoff && {
      id: bakeoff.id,
      caseIds: bakeoff.caseIds,
      byArm: bakeoff.byArm,
      missionSpendUsd: bakeoff.missionSpendUsd,
      sealedEval: false,
    },
    spend: {
      employeeUsd: employeeUsd,
      employeeCapUsd: 0.5,
      employeeRemainingUsd: Math.round((0.5 - employeeUsd) * 1e6) / 1e6,
      workspaceEstimatedUsd: spend.totals && spend.totals.estimatedUsd,
    },
    progression: {
      status: role && role.status,
      promoted: false,
      gates: gates,
      record: progression && { id: progression.id, status: progression.status, previousStatus: progression.previousStatus },
    },
    contract: contract && { id: contract.id, contentHash: contract.contentHash },
    frozenHashes: hashes,
    disclosure: "Development interview. Not promoted. Not world-class. Not sealed.",
  };
}
