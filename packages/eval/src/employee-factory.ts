/** Owner-authorized employee factory v0. Do not create specialists unless Stage I passed. */

import { contentHash } from "@midas/db";
import { evaluateStageIGate } from "./stage-i-gate.ts";
import { OFFER_STRATEGIST_SPEC, OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";

export const EMPLOYEE_STATUSES = [
  "draft",
  "awaiting_owner_authorization",
  "evaluation_required",
  "active_development",
  "development_verified",
  "restricted",
  "rejected",
];

export const FACTORY_DISCLOSURE =
  "Employee factory v0. Owner requests a specialist. Not auto-promoted, not world-class, not trusted, not autonomous, not outreach, not unlimited spend. Conductor cannot invent unimplemented roles or hire without owner authorization.";

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix, lister) {
  const existing = lister ? lister() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export function factoryAvailability(store, extras) {
  const gate = (store.listStageIGates && (store.listStageIGates() || []).slice(-1)[0])
    || evaluateStageIGate(store, extras || {});
  return {
    available: Boolean(gate && gate.pass),
    gateId: gate && gate.id,
    failedIds: (gate && gate.failedIds) || [],
    note: gate && gate.note,
    disclosure: FACTORY_DISCLOSURE,
  };
}

export function requestSpecialist(store, payload) {
  const actor = (payload && payload.actor) || "owner";
  if (actor === "conductor" || actor === "workflow_manager" || /^conductor-/.test(String(actor))) {
    const err = new Error("Conductor cannot hire or invent employees without owner authorization.");
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
  const avail = factoryAvailability(store, { workspaceId: payload && payload.workspaceId });
  if (!avail.available) {
    const err = new Error("Employee factory is blocked. Stage I hard gate has not passed. Failed: " + (avail.failedIds || []).join(", "));
    err.code = "STAGE_I_BLOCKED";
    throw err;
  }
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId || !store.getWorkspace(workspaceId)) throw new Error("workspace is required");
  const req = {
    id: nextId(store, "ERQ-", () => store.listEmployeeRequests()),
    workspaceId: workspaceId,
    name: String((payload && payload.name) || "").trim(),
    roleTitle: String((payload && payload.roleTitle) || "").trim(),
    roleId: String((payload && payload.roleId) || "").trim(),
    objective: String((payload && payload.objective) || "").trim(),
    responsibilities: (payload && payload.responsibilities) || [],
    prohibitedActions: (payload && payload.prohibitedActions) || [],
    knowledgeAccess: (payload && payload.knowledgeAccess) || "owner_approved_same_workspace",
    tools: (payload && payload.tools) || [],
    spendLimitUsd: payload && payload.spendLimitUsd != null ? Number(payload.spendLimitUsd) : 0.5,
    outputContract: (payload && payload.outputContract) || null,
    evalRequirements: (payload && payload.evalRequirements) || [],
    actor: actor,
    createdAt: nowIso(),
    status: "submitted",
  };
  if (!req.name || !req.roleTitle || !req.objective) throw new Error("name, roleTitle, and objective are required");
  store.putEmployeeRequest(req);
  return req;
}

export function createSpecialistFromRequest(store, request, spec) {
  const now = nowIso();
  const roleId = spec.roleId;
  const agentId = roleId + "-" + request.workspaceId;
  const versionId = roleId + "-" + request.workspaceId + "-v0";
  const promptBundle = spec.promptBundle || { system: spec.objective, developer: "Return structured output. Gold is not available at runtime." };
  const payload = {
    agentId: agentId,
    parentVersionId: null,
    modelProfile: { provider: "none", model: "deterministic-offer-strategist" },
    promptBundle: promptBundle,
    outputSchemaId: spec.outputSchemaId || "offer-strategist-v0",
    retrievalPolicy: { enabled: false },
    allowedTools: spec.tools || ["read_approved_workspace_knowledge"],
    declaredChange: "Initial immutable freeze. Not promotion. Not autonomous.",
    workspaceId: request.workspaceId,
  };
  if (!store.getVersion(versionId)) {
    store.putVersion({
      id: versionId,
      agentId: agentId,
      parentVersionId: null,
      modelProfile: payload.modelProfile,
      promptBundle: promptBundle,
      outputSchema: { "$id": "https://midas.local/schemas/offer-strategist-v0.json", "type": "object" },
      retrievalPolicy: payload.retrievalPolicy,
      curriculumSnapshotId: null,
      allowedTools: payload.allowedTools,
      createdAt: now,
      contentHash: contentHash(payload),
      declaredChange: payload.declaredChange,
      workspaceId: request.workspaceId,
      roleId: roleId,
      immutable: true,
    });
  }
  const role = {
    id: nextId(store, "EMP-", () => store.listEmployeeRoles()),
    workspaceId: request.workspaceId,
    requestId: request.id,
    agentId: agentId,
    roleId: roleId,
    name: spec.name,
    roleTitle: spec.roleTitle,
    objective: spec.objective,
    responsibilities: spec.responsibilities,
    prohibitedActions: spec.prohibitedActions,
    knowledgeAccess: spec.knowledgeAccess,
    tools: spec.tools,
    spendLimitUsd: spec.spendLimitUsd,
    outputContract: spec.outputContract,
    evalRequirements: spec.evalRequirements,
    versionId: versionId,
    status: "awaiting_owner_authorization",
    promoted: false,
    worldClass: false,
    trusted: false,
    autonomous: false,
    outreach: false,
    unlimitedSpend: false,
    createdAt: now,
    disclosure: FACTORY_DISCLOSURE,
  };
  store.putEmployeeRole(role);
  if (!store.getAgent(agentId)) {
    store.putAgent({
      id: agentId,
      name: spec.name,
      createdAt: now,
      roleId: roleId,
      roleName: spec.roleTitle,
      workspaceId: request.workspaceId,
      objective: spec.objective,
      boundaries: spec.prohibitedActions,
      permissions: { may: spec.responsibilities, mayNot: spec.prohibitedActions },
      versionHistory: [versionId],
      status: "awaiting_owner_authorization",
      note: FACTORY_DISCLOSURE,
    });
  }
  return { role: role, version: store.getVersion(versionId), agent: store.getAgent(agentId) };
}

export function authorizeSpecialist(store, roleIdOrEmpId, payload) {
  const actor = (payload && payload.actor) || "owner";
  if (actor !== "owner" && actor !== "local_owner" && actor !== "demo_operator") {
    const err = new Error("Only local_owner, owner, or labeled demo_operator may authorize a specialist.");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
  const roles = store.listEmployeeRoles() || [];
  const role = roles.find((r) => r.id === roleIdOrEmpId || r.roleId === roleIdOrEmpId || r.agentId === roleIdOrEmpId);
  if (!role) throw new Error("employee role not found");
  const next = {
    ...role,
    status: "evaluation_required",
    authorizedAt: nowIso(),
    authorizedBy: actor === "local_owner" ? "local_owner" : actor,
    securityClaim: actor === "local_owner" ? "local session, not enterprise IAM" : "scripted or in-process actor; not enterprise IAM",
  };
  store.putEmployeeRole(next);
  const agent = store.getAgent(role.agentId);
  if (agent) store.putAgent({ ...agent, status: "evaluation_required" });
  return next;
}


export function implementOfferStrategistIfGatePasses(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const existingGate = (store.listStageIGates && (store.listStageIGates() || []).slice(-1)[0]) || null;
  const gate = existingGate && existingGate.pass ? existingGate : evaluateStageIGate(store, extras || {});
  if (!gate.pass) {
    return { implemented: false, blocked: true, gate: gate, note: "Offer Strategist is correctly blocked." };
  }
  const existing = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);
  if (existing) return { implemented: true, role: existing, gate: gate, note: "Offer Strategist already exists. Not auto-promoted." };
  const req = requestSpecialist(store, { ...OFFER_STRATEGIST_SPEC, workspaceId: workspaceId, actor: (extras && extras.actor) || "owner" });
  const created = createSpecialistFromRequest(store, req, { ...OFFER_STRATEGIST_SPEC, roleId: OFFER_STRATEGIST_ROLE_ID });
  return { implemented: true, request: req, role: created.role, version: created.version, agent: created.agent, gate: gate, note: "Offer Strategist created as awaiting_owner_authorization. Not promoted." };
}
