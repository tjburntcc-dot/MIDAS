/** Owner-configurable internal autonomy policy. Not teaching-engine interface-only. Not delegated learning. */
import { resolveActorType } from "./approval-actors.ts";

export const INTERNAL_AUTONOMY_KIND = "internal_supervised_policy";

export const INTERNAL_ALLOWED_DEFAULT = [
  "run_specialist_task",
  "retrieve_workspace_knowledge",
  "assemble_deliverables",
  "write_local_artifact",
  "plan_supervised_work",
];

export const INTERNAL_FORBIDDEN_DEFAULT = [
  "outreach",
  "publish",
  "purchase",
  "policy_rewrite",
  "create_owner_policy",
  "cross_workspace",
  "prospects",
  "out_of_scope_research",
  "unlimited_spend",
];

function nowIso() {
  return new Date().toISOString();
}

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
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

function assertOwnerActor(payload) {
  const actor = asText(payload && payload.actor);
  if (actor === "demo_operator") {
    const err = new Error("demo_operator cannot persist an internal autonomy policy.");
    err.code = "DEMO_OPERATOR_FORBIDDEN";
    throw err;
  }
  if (actor === "conductor" || actor === "workflow_manager" || /^conductor-/.test(actor)) {
    const err = new Error("Conductor cannot author an autonomy policy.");
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
  if (actor !== "owner" && actor !== "local_owner") {
    const err = new Error("Owner authorization is required. Use owner or local_owner. Do not invent a new approval identity.");
    err.code = "OWNER_AUTHORIZATION_REQUIRED";
    throw err;
  }
  const explicit = Boolean(
    (payload && payload.authorized === true)
    || (payload && payload.confirmInternalAutonomy === true)
    || /save autonomy policy|create autonomy policy/i.test(asText(payload && (payload.confirm || payload.action))),
  );
  if (!explicit) {
    const err = new Error("A single explicit owner action is required to persist an autonomy policy.");
    err.code = "OWNER_AUTHORIZATION_REQUIRED";
    throw err;
  }
  return actor;
}

export function persistInternalAutonomyPolicy(store, payload) {
  const actor = assertOwnerActor(payload || {});
  const workspaceId = payload && (payload.workspaceId || payload.workspace);
  if (!workspaceId) {
    const err = new Error("workspaceId is required.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  const workspace = store.getWorkspace && store.getWorkspace(workspaceId);
  if (!workspace) {
    const err = new Error("company not found");
    err.code = "WORKSPACE_NOT_FOUND";
    err.errorStatus = 404;
    throw err;
  }
  const now = nowIso();
  const authorizedActions = Array.isArray(payload.authorizedActions) && payload.authorizedActions.length
    ? payload.authorizedActions.map((x) => String(x))
    : INTERNAL_ALLOWED_DEFAULT.slice();
  const forbiddenActions = Array.isArray(payload.forbiddenActions) && payload.forbiddenActions.length
    ? payload.forbiddenActions.map((x) => String(x))
    : INTERNAL_FORBIDDEN_DEFAULT.slice();
  for (const f of INTERNAL_FORBIDDEN_DEFAULT) {
    if (!forbiddenActions.includes(f)) forbiddenActions.push(f);
  }
  const rec = {
    id: (payload && payload.id) || nextId(((store.listOwnerAutonomyPolicies && store.listOwnerAutonomyPolicies()) || []).map((r) => r.id), "IAP-"),
    kind: INTERNAL_AUTONOMY_KIND,
    workspaceId: workspaceId,
    authorizedActions: authorizedActions,
    forbiddenActions: forbiddenActions,
    approvedDomains: Array.isArray(payload.approvedDomains) ? payload.approvedDomains.map((x) => String(x)) : [],
    budgetUsd: payload.budgetUsd != null ? Number(payload.budgetUsd) : 0,
    expiration: payload.expiration || null,
    coveredEmployeeIds: Array.isArray(payload.coveredEmployeeIds) ? payload.coveredEmployeeIds.map((x) => String(x)) : [],
    coveredRoleIds: Array.isArray(payload.coveredRoleIds) ? payload.coveredRoleIds.map((x) => String(x)) : [],
    createdAt: now,
    updatedAt: now,
    authorized: true,
    authorizedBy: actor,
    actorLabel: actor === "local_owner" ? "local_owner" : "owner",
    testOrLocalOwner: actor === "local_owner",
    createdVia: "owner_action",
    interfaceOnly: false,
    delegatedAutonomyActivated: false,
    autonomousLearningImplemented: false,
    active: payload.active !== false,
    note: "Internal supervised autonomy policy. Conductor may skip repeated prompts only for authorized internal steps. Prohibited actions stay blocked. Not teaching-engine delegated autonomy.",
  };
  store.putOwnerAutonomyPolicy(rec);
  return {
    ok: true,
    persistence: "FILE_STORE",
    policy: rec,
    authorizedBy: actor,
    liveProviderCall: false,
  };
}

export function listInternalAutonomyPolicies(store, workspaceId) {
  const all = ((store.listOwnerAutonomyPolicies && store.listOwnerAutonomyPolicies()) || []).filter((p) => p && p.kind === INTERNAL_AUTONOMY_KIND);
  return workspaceId ? all.filter((p) => p.workspaceId === workspaceId) : all;
}

export function activeInternalAutonomyPolicy(store, workspaceId) {
  const list = listInternalAutonomyPolicies(store, workspaceId).filter((p) => p.active !== false && p.authorized === true);
  if (!list.length) return null;
  return list.slice().sort((a, b) => String(a.updatedAt || a.createdAt || "").localeCompare(String(b.updatedAt || b.createdAt || ""))).slice(-1)[0];
}

export function evaluateInternalAutonomy(store, workspaceId, action, extras) {
  const act = asText(action);
  const policy = activeInternalAutonomyPolicy(store, workspaceId);
  if (!policy) {
    return {
      decision: "require_prompt",
      skipPrompt: false,
      blocked: false,
      reason: "No owner-persisted internal autonomy policy.",
      policyId: null,
    };
  }
  if (policy.expiration && Date.parse(policy.expiration) && Date.parse(policy.expiration) < Date.now()) {
    return {
      decision: "require_prompt",
      skipPrompt: false,
      blocked: false,
      reason: "Autonomy policy expired.",
      policyId: policy.id,
    };
  }
  if ((policy.forbiddenActions || []).includes(act) || INTERNAL_FORBIDDEN_DEFAULT.includes(act)) {
    return {
      decision: "blocked",
      skipPrompt: false,
      blocked: true,
      reason: "Action is prohibited. Policy cannot authorize it.",
      policyId: policy.id,
    };
  }
  const employeeId = extras && extras.employeeId;
  if (employeeId && (policy.coveredEmployeeIds || []).length && !(policy.coveredEmployeeIds || []).includes(employeeId)) {
    return {
      decision: "require_prompt",
      skipPrompt: false,
      blocked: false,
      reason: "Employee is not covered by the policy.",
      policyId: policy.id,
    };
  }
  if ((policy.authorizedActions || []).includes(act)) {
    return {
      decision: "skip_prompt",
      skipPrompt: true,
      blocked: false,
      reason: "Owner-persisted policy authorizes this internal step.",
      policyId: policy.id,
      authorizedBy: policy.authorizedBy,
    };
  }
  return {
    decision: "require_prompt",
    skipPrompt: false,
    blocked: false,
    reason: "Action is not on the authorized list.",
    policyId: policy.id,
  };
}

export function autonomyPolicyView(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const policies = listInternalAutonomyPolicies(store, workspaceId);
  const active = workspaceId ? activeInternalAutonomyPolicy(store, workspaceId) : (policies.filter((p) => p.active !== false).slice(-1)[0] || null);
  return {
    built: true,
    persistence: "FILE_STORE",
    kind: INTERNAL_AUTONOMY_KIND,
    workspaceId: workspaceId || null,
    policies: policies,
    active: active,
    defaultAuthorized: INTERNAL_ALLOWED_DEFAULT.slice(),
    defaultForbidden: INTERNAL_FORBIDDEN_DEFAULT.slice(),
    note: "Owner-configurable internal autonomy. Conductor may skip repeated prompts only when a real owner action persisted this record. Prohibited actions stay blocked.",
    liveProviderCall: false,
  };
}

export function revokeInternalAutonomyPolicy(store, payload) {
  const actor = assertOwnerActor(payload || {});
  const rec = store.getOwnerAutonomyPolicy && store.getOwnerAutonomyPolicy(payload && payload.id);
  if (!rec || rec.kind !== INTERNAL_AUTONOMY_KIND) {
    const err = new Error("autonomy policy not found");
    err.code = "NOT_FOUND";
    err.errorStatus = 404;
    throw err;
  }
  const next = { ...rec, active: false, revokedAt: nowIso(), revokedBy: actor, updatedAt: nowIso() };
  store.putOwnerAutonomyPolicy(next);
  return { ok: true, policy: next, authorizedBy: actor };
}

export { resolveActorType };
