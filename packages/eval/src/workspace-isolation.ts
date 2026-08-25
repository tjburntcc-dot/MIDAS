/** Structural workspace isolation. Application-level, not IAM. Queries require workspaceId. */

import { artifactsDir } from "@midas/db";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ISOLATION_KIND = "application-level";
export const ISOLATION_NOT_IAM = true;
export const ISOLATION_LABEL =
  "Application-level isolation by workspaceId. Not IAM. Not enterprise tenancy.";

export const HISTORICAL_CONTAMINATION_EXECUTION_IDS = ["LSE-001", "LSE-002", "LSE-003", "LSE-004"];
export const HISTORICAL_CONTAMINATION_NOTE =
  "Historical cross-workspace leak on Cedar Path live calls LSE-001–004. Records left intact. Later calls are workspace-scoped. Do not erase.";

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function requireWorkspaceId(workspaceId) {
  const id = asText(workspaceId);
  if (!id) {
    const err = new Error("workspaceId is required. Isolation is structural, not an optional post-filter.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  return id;
}

export function recordWorkspaceId(record) {
  if (!record || typeof record !== "object") return null;
  return record.workspaceId || record.workspace || null;
}

export function belongsToWorkspace(record, workspaceId) {
  const recWs = recordWorkspaceId(record);
  if (!recWs) return false;
  return recWs === workspaceId;
}

export function belongsToWorkspaceAllowRidgelineLegacy(record, workspaceId) {
  const recWs = recordWorkspaceId(record);
  if (recWs) return recWs === workspaceId;
  return workspaceId === "ws-ridgeline";
}

export function filterWorkspaceRecords(records, workspaceId, extras) {
  const ws = requireWorkspaceId(workspaceId);
  const allowLegacy = extras && extras.allowRidgelineLegacy === true;
  return (records || []).filter((r) => {
    if (!r) return false;
    if (allowLegacy) return belongsToWorkspaceAllowRidgelineLegacy(r, ws);
    return belongsToWorkspace(r, ws);
  });
}

export function denyCrossWorkspace(record, workspaceId, label) {
  const ws = requireWorkspaceId(workspaceId);
  if (!record) return null;
  const recWs = recordWorkspaceId(record);
  if (recWs && recWs !== ws) {
    const err = new Error((label || "Record") + " is not visible in workspace " + ws + ".");
    err.code = "CROSS_WORKSPACE_DENIED";
    err.errorStatus = 404;
    throw err;
  }
  if (!recWs && ws !== "ws-ridgeline") {
    const err = new Error((label || "Unscoped record") + " is not visible on isolated owner workspaces.");
    err.code = "CROSS_WORKSPACE_DENIED";
    err.errorStatus = 404;
    throw err;
  }
  return record;
}

export function listKnowledgeInWorkspace(store, workspaceId, extras) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listKnowledge && store.listKnowledge()) || []);
  return filterWorkspaceRecords(all, ws, extras || { allowRidgelineLegacy: ws === "ws-ridgeline" });
}

export function listApprovedKnowledgeInWorkspace(store, workspaceId, extras) {
  const items = listKnowledgeInWorkspace(store, workspaceId, extras);
  return items.filter((k) => k && (k.reviewStatus === "approved" || k.accepted === true));
}

export function listSourcesInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listSources && store.listSources()) || []);
  return filterWorkspaceRecords(all, ws, { allowRidgelineLegacy: ws === "ws-ridgeline" });
}

export function listOpportunitiesInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listOpportunities && store.listOpportunities()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listTeachingPacketsInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listTeachingPackets && store.listTeachingPackets()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listTeachingFindingsInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listTeachingFindings && store.listTeachingFindings()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listSpendInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listSpendLedger && store.listSpendLedger()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listAuditsInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listWatcherAudits && store.listWatcherAudits()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listEmployeesInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listEmployeeRoles && store.listEmployeeRoles()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listPlansInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listPlans && store.listPlans()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listTasksInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listTasks && store.listTasks()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listDeliverablesInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listDeliverables && store.listDeliverables()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function listObjectivesInWorkspace(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const all = ((store && store.listObjectives && store.listObjectives()) || []);
  return filterWorkspaceRecords(all, ws, {});
}

export function getKnowledgeInWorkspace(store, id, workspaceId) {
  const rec = store && store.getKnowledge && store.getKnowledge(id);
  return denyCrossWorkspace(rec, workspaceId, "Knowledge " + id);
}

export function getOpportunityInWorkspace(store, id, workspaceId) {
  const rec = store && store.getOpportunity && store.getOpportunity(id);
  return denyCrossWorkspace(rec, workspaceId, "Opportunity " + id);
}

export function getTeachingPacketInWorkspace(store, id, workspaceId) {
  const rec = store && store.getTeachingPacket && store.getTeachingPacket(id);
  return denyCrossWorkspace(rec, workspaceId, "Teaching packet " + id);
}

export function getEmployeeInWorkspace(store, id, workspaceId) {
  const rec = store && store.getEmployeeRole && store.getEmployeeRole(id);
  return denyCrossWorkspace(rec, workspaceId, "Employee " + id);
}

export function artifactDirForWorkspace(workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  if (ws.includes("..") || ws.includes("/") || ws.includes("\\")) {
    const err = new Error("Invalid workspaceId for artifact path.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  return join(artifactsDir(), ws);
}

export function listArtifactsInWorkspace(workspaceId) {
  const dir = artifactDirForWorkspace(workspaceId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => ({
    name: name,
    workspaceId: workspaceId,
    path: join(dir, name),
  }));
}

export function assertNoCrossCite(retrievedIds, allowedIds, extras) {
  const allowed = new Set(allowedIds || []);
  const leaked = (retrievedIds || []).filter((id) => id && !allowed.has(id));
  if (leaked.length) {
    const err = new Error("Cross-workspace cite refused: " + leaked.join(", "));
    err.code = "CROSS_CITE_DENIED";
    err.leakedIds = leaked;
    throw err;
  }
  return true;
}

export function historicalContaminationView(store) {
  const rows = [];
  for (const id of HISTORICAL_CONTAMINATION_EXECUTION_IDS) {
    const rec = store && store.getSpecialistExecution && store.getSpecialistExecution(id);
    if (!rec) {
      rows.push({ id: id, present: false, label: "historical_contamination", intact: false });
      continue;
    }
    rows.push({
      id: rec.id,
      present: true,
      intact: true,
      workspaceId: rec.workspaceId || null,
      retrievedIds: rec.retrievedIds || [],
      retrievedIdCount: (rec.retrievedIds || []).length,
      label: "historical_contamination",
      rewritten: false,
      note: HISTORICAL_CONTAMINATION_NOTE,
    });
  }
  return {
    isolation: ISOLATION_KIND,
    isolationNotIam: ISOLATION_NOT_IAM,
    records: rows,
    allIntact: rows.every((r) => r.intact !== false),
    note: HISTORICAL_CONTAMINATION_NOTE,
  };
}

export function persistHistoricalContaminationLabels(store) {
  const view = historicalContaminationView(store);
  const rec = {
    id: "HCL-001",
    kind: "historical_cross_workspace_contamination",
    executionIds: HISTORICAL_CONTAMINATION_EXECUTION_IDS.slice(),
    workspaceId: "ws-own-003",
    label: "historical_contamination",
    rewritten: false,
    erased: false,
    createdAt: new Date().toISOString(),
    note: HISTORICAL_CONTAMINATION_NOTE,
    records: view.records,
  };
  if (store && store.putHistoricalContamination) store.putHistoricalContamination(rec);
  return rec;
}

export function isolationHonesty() {
  return {
    isolation: ISOLATION_KIND,
    isolationNotIam: ISOLATION_NOT_IAM,
    structural: true,
    optionalPostFilter: false,
    note: ISOLATION_LABEL,
  };
}
