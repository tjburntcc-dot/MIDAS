/** Teaching pipeline: Finding → Watcher scope/claim → Conductor role routing → role-appropriate lessons. Independent of TPK-001. */

import { requireWorkspaceId, listTeachingFindingsInWorkspace, listTeachingPacketsInWorkspace } from "./workspace-isolation.ts";
import { evaluateInternalAutonomy } from "./autonomy-policy.ts";

export const TEACHING_STAGES = ["exists", "approved", "retrieved", "improved"];
export const TEACHING_PIPELINE_INDEPENDENT_OF_TPK001 = true;

function nowIso() {
  return new Date().toISOString();
}

function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, "").trim();
}

export function routeFindingToRole(finding) {
  const blob = String((finding && (finding.claim || finding.statement || finding.title || finding.text)) || "").toLowerCase();
  if (/price|budget|cost|margin|unit econ/.test(blob)) return "finance";
  if (/copy|headline|audience|landing|position/.test(blob)) return "marketing";
  if (/offer|package|positioning|customer problem/.test(blob)) return "offer_strategist";
  if (/pickup|procedure|ops|pail|stoop|route/.test(blob)) return "ops";
  if (/build|slice|landing file|artifact/.test(blob)) return "product";
  if (/pipeline|discovery|who to talk/.test(blob)) return "sales";
  if (/priority|tradeoff|sequence/.test(blob)) return "executive";
  return "business_research";
}

export function watcherScopeFinding(store, payload) {
  const workspaceId = requireWorkspaceId(payload && payload.workspaceId);
  const findingId = payload && (payload.findingId || payload.id);
  const finding = (store.getTeachingFinding && store.getTeachingFinding(findingId))
    || listTeachingFindingsInWorkspace(store, workspaceId).find((f) => f.id === findingId);
  if (!finding || finding.workspaceId !== workspaceId) {
    const err = new Error("Finding is not in this workspace.");
    err.code = "CROSS_WORKSPACE_DENIED";
    throw err;
  }
  const rec = {
    id: nextId(((store.listWatcherAudits && store.listWatcherAudits()) || []).map((r) => r.id), "AUD-SCOPE-"),
    workspaceId: workspaceId,
    findingId: finding.id,
    kind: "teaching_scope_claim",
    claimed: true,
    scoped: true,
    sameWorkspace: true,
    tpk001Used: false,
    independentOfTpk001: true,
    createdAt: nowIso(),
    note: "Watcher scoped this finding to this workspace only. TPK-001 was not applied.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(rec);
  return rec;
}

export function conductorRouteTeaching(store, payload) {
  const workspaceId = requireWorkspaceId(payload && payload.workspaceId);
  const findingId = payload && payload.findingId;
  const finding = store.getTeachingFinding && store.getTeachingFinding(findingId);
  if (!finding || finding.workspaceId !== workspaceId) {
    const err = new Error("Finding is not in this workspace.");
    err.code = "CROSS_WORKSPACE_DENIED";
    throw err;
  }
  const roleId = payload.roleId || routeFindingToRole(finding);
  const employees = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter((e) => e.workspaceId === workspaceId && e.roleId === roleId);
  if (!employees.length) {
    return {
      ok: false,
      workspaceId: workspaceId,
      roleId: roleId,
      blocked: true,
      reason: "No authorized employee for that role on this workspace. Conductor will not invent a hire.",
      independentOfTpk001: true,
    };
  }
  return {
    ok: true,
    workspaceId: workspaceId,
    findingId: finding.id,
    roleId: roleId,
    employeeId: employees[0].id,
    independentOfTpk001: true,
    stages: { exists: true, approved: finding.status === "approved" || finding.accepted === true, retrieved: false, improved: false },
  };
}

export function flagInsufficientKnowledge(store, payload) {
  const workspaceId = requireWorkspaceId(payload && payload.workspaceId);
  const employeeId = payload && payload.employeeId;
  const emp = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  if (!emp || emp.workspaceId !== workspaceId) {
    const err = new Error("Employee is not in this workspace.");
    err.code = "CROSS_WORKSPACE_DENIED";
    throw err;
  }
  const gap = {
    id: nextId(((store.listKnowledgeGaps && store.listKnowledgeGaps()) || []).map((g) => g.id), "GAP-"),
    workspaceId: workspaceId,
    employeeId: emp.id,
    roleId: emp.roleId,
    kind: "i_do_not_know_enough",
    statement: clip(payload && payload.statement || "I do not know enough to complete this task from approved same-workspace knowledge.", 400),
    createdAt: nowIso(),
    conductorMayRequestOwnerInfo: true,
    conductorMayRequestBoundedScout: true,
    inventedCrawl: false,
    independentOfTpk001: true,
  };
  if (store.putKnowledgeGap) store.putKnowledgeGap(gap);
  const autonomy = evaluateInternalAutonomy(store, workspaceId, "retrieve_workspace_knowledge");
  return {
    ok: true,
    gap: gap,
    next: autonomy.blocked
      ? { askOwner: true, boundedScout: false, reason: "Autonomy forbids extra research." }
      : { askOwner: true, boundedScout: true, reason: "Conductor may ask the owner or request bounded Scout. No invented crawl." },
  };
}

export function teachingPipelineView(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  if (!workspaceId) {
    return { workspaceRequired: true, stages: TEACHING_STAGES, independentOfTpk001: true, findings: [], packets: [] };
  }
  requireWorkspaceId(workspaceId);
  const findings = listTeachingFindingsInWorkspace(store, workspaceId);
  const packets = listTeachingPacketsInWorkspace(store, workspaceId);
  return {
    built: true,
    persistence: "FILE_STORE",
    workspaceId: workspaceId,
    independentOfTpk001: true,
    tpk001Untouched: true,
    stages: TEACHING_STAGES,
    findings: findings.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      exists: true,
      approved: f.status === "approved" || f.accepted === true,
      retrieved: f.retrieved === true,
      improved: f.improved === true,
      roleHint: routeFindingToRole(f),
    })),
    packets: packets.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      status: p.status,
      exists: true,
      approved: p.status === "approved_for_supervised_use",
      retrieved: p.retrieved === true,
      improved: p.improved === true,
    })),
    note: "Stages stay separate: exists / approved / retrieved / improved. Independent of TPK-001.",
  };
}
