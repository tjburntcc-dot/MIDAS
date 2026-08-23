/** Apply Mission 17 founder brief to FILE_STORE. Zero provider calls. Reuse OSR-003. */
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { FOUNDER_BRIEF_OWNER_OBJECTIVE, FOUNDER_BRIEF_CATEGORY, frozenHashCheck } from "./founder-opportunity-brief.ts";
import { runFounderBriefWorkflow } from "./conductor.ts";
import { mission17Review } from "./mission17-review.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";

function snapshot(store) {
  const osr = store.getOfferStrategistRun && store.getOfferStrategistRun("OSR-003");
  const emp = ((store.listEmployeeRoles && store.listEmployeeRoles("ws-ridgeline")) || []).find((r) => r.id === "EMP-001");
  const orig = store.getWatcherAudit && store.getWatcherAudit("AUD-watcher-ws-ridgeline-os-2026-08-21191640");
  const sup = store.getWatcherAudit && store.getWatcherAudit("AUD-watcher-ws-ridgeline-os-m16-20260821161600");
  const bake = store.getBakeoffRun && store.getBakeoffRun("BO-M15-001");
  const hashes = {};
  for (const id of Object.keys(FROZEN_HASHES)) {
    const v = store.getVersion && store.getVersion(id);
    hashes[id] = v && v.contentHash;
  }
  const ws = store.getWorkspace && store.getWorkspace("ws-ridgeline");
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles()) || [];
  return {
    osr003: osr && { id: osr.id, contentHash: osr.contentHash, spendUsd: osr.spendUsd, live: osr.live, parseStatus: osr.parseStatus, structured: osr.structured },
    emp: emp && { id: emp.id, status: emp.status, versionId: emp.versionId, promoted: emp.promoted, authorizedAt: emp.authorizedAt, authorizedBy: emp.authorizedBy },
    originalAuditStatus: orig && orig.status,
    originalAuditId: orig && orig.id,
    supersedingAuditStatus: sup && sup.status,
    bakeoffId: bake && bake.id,
    hashes: hashes,
    serving: ws && ws.servingAtlasVersionId,
    employeeCount: roles.length,
  };
}

function unchanged(before, after) {
  return {
    osr003Unchanged: Boolean(before.osr003 && after.osr003 && before.osr003.contentHash === after.osr003.contentHash && JSON.stringify(before.osr003.structured) === JSON.stringify(after.osr003.structured)),
    empUnchanged: Boolean(before.emp && after.emp && before.emp.status === after.emp.status && before.emp.versionId === after.emp.versionId && before.emp.promoted === after.emp.promoted),
    originalAuditUnchanged: before.originalAuditId === after.originalAuditId && before.originalAuditStatus === after.originalAuditStatus,
    supersedingAuditUnchanged: before.supersedingAuditStatus === after.supersedingAuditStatus,
    bakeoffUnchanged: before.bakeoffId === after.bakeoffId,
    frozenHashesUnchanged: JSON.stringify(before.hashes) === JSON.stringify(after.hashes),
    servingUnchanged: before.serving === after.serving,
    noNewEmployee: after.employeeCount === before.employeeCount,
  };
}

export async function applyMission17(store, extras) {
  const before = snapshot(store);
  const ran = await runFounderBriefWorkflow(store, {
    workspaceId: (extras && extras.workspaceId) || "ws-ridgeline",
    ownerText: FOUNDER_BRIEF_OWNER_OBJECTIVE,
    maxSpendUsd: 0,
  });
  const after = snapshot(store);
  const preserved = unchanged(before, after);
  const review = mission17Review(store, { workspaceId: (extras && extras.workspaceId) || "ws-ridgeline" });
  return {
    ok: Boolean(review.briefId) && review.watcher && review.watcher.status !== undefined,
    persistence: "FILE_STORE",
    providerCalls: 0,
    liveApiUsd: 0,
    sourcesFetched: 0,
    ownerApprovalRequired: false,
    reusedOsr003: review.assembly && review.assembly.sourceRunId === "OSR-003",
    freshLiveSpecialistTask: false,
    briefAssembly: "deterministic",
    category: FOUNDER_BRIEF_CATEGORY,
    objectiveId: review.objectiveId,
    briefId: review.briefId,
    watcherStatus: review.watcher && review.watcher.status,
    watcherId: review.watcher && review.watcher.id,
    employeeStatus: review.employeeStatus && review.employeeStatus.status,
    promotion: false,
    autonomous: false,
    preserved: preserved,
    review: review,
    ran: {
      objectiveId: ran.objective && ran.objective.id,
      reused: ran.reused || false,
    },
  };
}
