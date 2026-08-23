/** Explicit local-owner workspace export. No keys. Isolated import dry-run. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import { resolveActorType, rejectMasonClaim } from "./approval-actors.ts";

export const EXPORT_SCHEMA_VERSION = "midas-workspace-export-v0.1.0";
export const EXPORT_SENSITIVITY =
  "Contains workspace knowledge, source excerpts, and operational records. Excludes API keys, env, credentials, evaluator secrets, sealed packs, AutoShop, and unrelated workspaces.";

const EXCLUDE_FILES = [
  ".env", "credentials", "sealed", "AutoShop", "evaluator", "openai", "api_key", "secret",
];

function nowIso() {
  return new Date().toISOString();
}

function sha(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function assertLocalOwnerExport(payload, session) {
  rejectMasonClaim(payload && payload.actor, payload && payload.actorType);
  const resolved = resolveActorType(payload || { actor: "demo_operator" }, session);
  if (resolved.actorType !== "local_owner") {
    const err = new Error("Workspace export requires an explicit local_owner action with a real local session. demo_operator cannot export as local_owner.");
    err.code = "EXPORT_FORBIDDEN";
    throw err;
  }
  return resolved;
}

function pick(arr, pred) {
  return (arr || []).filter(pred);
}

export function buildWorkspaceExport(store, workspaceId, extras) {
  if (!workspaceId) throw new Error("workspaceId is required");
  const ws = store.getWorkspace(workspaceId);
  if (!ws) throw new Error("workspace not found: " + workspaceId);
  const inWs = (row) => row && (row.workspaceId === workspaceId || row.workspace === workspaceId || !row.workspaceId);
  const sources = pick(store.listSources(), inWs).map((s) => ({
    id: s.id,
    url: s.url,
    title: s.title,
    classification: s.classification || s.sourceClassification,
    sha256: s.sha256,
    excerpt: String(s.excerpt || "").slice(0, 500),
    retrievedAt: s.retrievedAt,
    captureStatus: s.captureStatus,
    live: s.live,
  }));
  const knowledge = pick(store.listKnowledge(), (k) => inWs(k) && (k.reviewStatus === "approved" || k.accepted === true || k.kind === "owner_policy"));
  const agents = (store.listAgents() || []).filter((a) => a.workspaceId === workspaceId || a.id === "atlas");
  const versions = (store.listVersions() || []).filter((v) => v.workspaceId === workspaceId || /^atlas-v\d+$/.test(v.id) || /-(ws-|scout-|watcher-|conductor-)/.test(v.id))
    .map((v) => ({ id: v.id, agentId: v.agentId, parentVersionId: v.parentVersionId, contentHash: v.contentHash, declaredChange: v.declaredChange, versionRole: v.versionRole || null }));
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    timestamp: nowIso(),
    workspaceId: workspaceId,
    sensitivityWarning: EXPORT_SENSITIVITY,
    persistence: "FILE_STORE",
    notEnterpriseIam: true,
    notPostgres: true,
    workspace: { id: ws.id, name: ws.name, description: ws.description, goal: ws.goal, servingAtlasVersionId: ws.servingAtlasVersionId || null },
    agentIdentities: agents.map((a) => ({ id: a.id, roleId: a.roleId, roleName: a.roleName, versionHistory: a.versionHistory || [] })),
    versionRefs: versions,
    ownerPolicies: knowledge.filter((k) => k.kind === "owner_policy" || k.claimKind === "owner_policy"),
    approvedKnowledge: knowledge.filter((k) => k.kind !== "owner_policy" && k.claimKind !== "owner_policy"),
    sourceMetadata: sources,
    objectives: pick(store.listObjectives ? store.listObjectives() : [], inWs).map((o) => ({ id: o.id, status: o.status, ownerText: o.ownerText, fictionalScenarioHash: o.fictionalScenarioHash || null })),
    tasks: pick(store.listTasks ? store.listTasks() : [], (t) => t.workspaceId === workspaceId || (t.objectiveId && true)),
    approvals: pick(store.listApprovalRequests ? store.listApprovalRequests() : [], inWs),
    approvalDecisions: pick(store.listApprovalDecisions ? store.listApprovalDecisions() : [], inWs),
    training: pick(store.listTrainingEvents ? store.listTrainingEvents() : [], inWs),
    workbench: pick(store.listWorkbenchRuns ? store.listWorkbenchRuns() : [], inWs).map((r) => ({ id: r.id, versionId: r.versionId, kind: r.kind, retrievedItemIds: r.retrievedItemIds })),
    watcher: pick(store.listWatcherAudits ? store.listWatcherAudits() : [], inWs).map((a) => ({ id: a.id, status: a.status, scopes: a.scopes || null })),
    contributions: pick(store.listContributionEvents ? store.listContributionEvents() : [], inWs),
    ledger: pick(store.listSpendLedger ? store.listSpendLedger() : [], inWs).map((e) => ({ id: e.id, operation: e.operation, kind: e.kind, costUsd: e.costUsd, timestamp: e.timestamp || e.at })),
    usefulness: pick(store.listUsefulnessReviews ? store.listUsefulnessReviews() : [], inWs),
    dispositions: pick(store.listFindingDispositions ? store.listFindingDispositions() : [], (d) => true),
    versionReviews: pick(store.listVersionReviews ? store.listVersionReviews() : [], (d) => true),
    excluded: ["keys", "env", "credentials", "evaluator_secrets", "sealed", "unrelated_workspaces", "AutoShop"],
  };
  payload.checksums = {
    workspace: sha(payload.workspace),
    knowledge: sha(payload.approvedKnowledge.map((k) => k.id)),
    sources: sha(payload.sourceMetadata.map((s) => s.id + ":" + s.sha256)),
    payload: sha({ ...payload, checksums: undefined }),
  };
  if (JSON.stringify(payload).match(/sk-[a-zA-Z0-9]{10,}/)) {
    throw new Error("Export refused: looks like a secret leaked into the payload.");
  }
  return payload;
}

export function exportWorkspace(store, payload, session) {
  const actor = assertLocalOwnerExport(payload, session);
  const workspaceId = payload.workspaceId;
  const body = buildWorkspaceExport(store, workspaceId, payload);
  const rec = {
    id: "WEXP-" + body.timestamp.replace(/[:.]/g, ""),
    workspaceId: workspaceId,
    createdAt: body.timestamp,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    checksum: body.checksums.payload,
    actorType: actor.actorType,
    sessionId: actor.sessionId || (session && session.id) || null,
    explicitAction: true,
    sensitivityWarning: EXPORT_SENSITIVITY,
  };
  if (store.putWorkspaceExport) store.putWorkspaceExport(rec);
  return { export: body, record: rec, actorType: actor.actorType };
}

export function importWorkspaceDryRun(exportPayload, destDir) {
  if (!exportPayload || exportPayload.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error("Invalid or unsupported export schema.");
  }
  if (!exportPayload.checksums || !exportPayload.checksums.payload) throw new Error("Export checksum missing.");
  const dir = destDir;
  mkdirSync(dir, { recursive: true });
  const isolated = new FileStore(dir);
  const ws = exportPayload.workspace;
  isolated.putWorkspace({
    id: ws.id,
    name: (ws.name || "imported") + " (import dry-run)",
    description: ws.description,
    goal: ws.goal,
    servingAtlasVersionId: ws.servingAtlasVersionId || null,
    importDryRun: true,
    overwritten: false,
  });
  return {
    dryRun: true,
    silentOverwrite: false,
    destDir: dir,
    workspaceId: ws.id,
    parsed: true,
    isolatedFileStore: true,
    counts: {
      knowledge: (exportPayload.approvedKnowledge || []).length,
      sources: (exportPayload.sourceMetadata || []).length,
      objectives: (exportPayload.objectives || []).length,
    },
    note: "Dry-run parsed into a temporary isolated FILE_STORE. Nothing in the source store was overwritten. Explicit confirm would be required for a real import.",
  };
}

export function writeExportFile(exportPayload, path) {
  writeFileSync(path, JSON.stringify(exportPayload, null, 2) + "\n", "utf8");
  return { path: path, bytes: Buffer.byteLength(JSON.stringify(exportPayload)) };
}

export function readExportFile(path) {
  if (!existsSync(path)) throw new Error("export file not found");
  return JSON.parse(readFileSync(path, "utf8"));
}

export { join };
