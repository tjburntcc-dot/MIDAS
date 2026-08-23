/** Checkpoint 23 generalized Conductor. Workspace-scoped supervised work. Deterministic orchestration. */
import { SEARCH_INTEGRATION_EXISTS } from "./source-acquisition.ts";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import { isIsolatedOwnerWorkspace } from "./company-intake.ts";
import {
  ROLE_HANDLERS,
  ROLE_CATALOG,
  runEmployeeTask,
  roleIsImplemented,
  collectWorkspaceSignals,
  TEAM_EMPLOYEE_STATUS,
} from "./team-generator.ts";
import { runEmployeeTaskLive, isLiveReasoningRole } from "./live-specialists.ts";
import { evaluateInternalAutonomy, activeInternalAutonomyPolicy } from "./autonomy-policy.ts";
import {
  CONDUCTOR_DISCLOSURE,
  CONDUCTOR_ORCHESTRATION,
  CONDUCTOR_MAY,
  CONDUCTOR_MAY_NOT,
  CONDUCTOR_ROLE_ID,
  CONDUCTOR_ROLE_NAME,
  assertConductorMayNot,
} from "./conductor.ts";
import {
  assembleDeliverables,
  listWorkspaceDeliverables,
  publicDeliverable,
  DELIVERABLE_HONESTY,
  NO_ARTIFACT_MESSAGE,
} from "./deliverables.ts";

export const WORK_SURFACE = "work";
export const WORK_CATEGORY = "generalized_supervised";
export const WORK_ORCHESTRATION = "deterministic";
export const WORK_PLAN_SOURCE = "deterministic_generalized_supervised";

export const TASK_STATES = [
  "queued",
  "running",
  "awaiting_owner_approval",
  "completed",
  "failed",
  "blocked",
  "skipped",
  "canceled",
];

export const WORK_HONESTY = {
  persistence: "FILE_STORE",
  thisSlice: "deterministic",
  orchestration: WORK_ORCHESTRATION,
  liveProviderCall: false,
  fixtureLabeledAsLive: false,
  searchIntegrationExists: SEARCH_INTEGRATION_EXISTS === true,
  embeddings: false,
  outreach: false,
  autonomous: false,
  autoPromoted: false,
  artifactGenerated: false,
  note: "Orchestration is deterministic. Specialists write labeled deterministic handler output. Deliverables are assembled from persisted specialist results and labeled deterministic. Not a live model call. Search integration does not exist. A local artifact is written only when authorized and a product specialist exists. Not deployed.",
};

export const EXAMPLE_OBJECTIVES = [
  "Find three promising business ideas within a $2,000 budget.",
  "Build an initial offer and positioning strategy for this company.",
  "Analyze this existing business and identify its biggest growth opportunities.",
  "Create a landing-page draft and explain the customer problem.",
  "Research competitors and summarize their actual product features.",
  "Estimate the basic unit-economics assumptions we need to validate.",
  "Evaluate whether the selected opportunity fits the owner facts.",
  "Create a team for this company.",
  "Train marketing then draft positioning from the owner-pasted lesson.",
];

export const AUTHORIZED_EMPLOYEE_STATUSES = [
  TEAM_EMPLOYEE_STATUS,
  "development_verified",
  "evaluation_required",
  "active_development",
];

const NOT_IMPLEMENTED_ROLES = new Set([]);

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

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, "").trim();
}

function parseBudgetUsd(text, explicit) {
  if (explicit != null && explicit !== "") {
    const n = Number(String(explicit).replace(/[$,\s]/g, ""));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const m = String(text || "").match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function interpretObjective(ownerText, extras) {
  const text = asText(ownerText);
  const t = text.toLowerCase();
  const budgetUsd = parseBudgetUsd(text, extras && extras.maxSpendUsd);
  let kind = "generic_supervised";
  let label = "Supervised internal work from the owner objective.";
  let wantedRoles = ["business_research", "offer_strategist", "independent_audit", "workflow_manager"];
  if (/(landing[- ]page|customer problem)/i.test(t)) {
    kind = "landing_outline";
    label = "Landing-page outline and customer-problem restatement. A local artifact is written only when a product specialist exists on this company.";
    wantedRoles = ["marketing", "offer_strategist", "product", "independent_audit", "workflow_manager"];
  } else if (/(unit[- ]econ|assumptions we need to validate|unit economics)/i.test(t)) {
    kind = "unit_economics";
    label = "List basic unit-economics assumptions that still need validation. Not a forecast.";
    wantedRoles = ["finance", "offer_strategist", "independent_audit", "workflow_manager"];
  } else if (/(competitor|product features)/i.test(t)) {
    kind = "competitor_research";
    label = "Summarize competitor features from approved workspace knowledge only. Search does not exist.";
    wantedRoles = ["business_research", "independent_audit", "workflow_manager"];
  } else if (/(evaluate (fit|whether)|does this (opportunity|idea) fit)/i.test(t)) {
    kind = "evaluate_fit";
    label = "Evaluate fit of the selected or stated opportunity against owner facts. Not a market score.";
    wantedRoles = ["offer_strategist", "business_research", "independent_audit", "workflow_manager"];
  } else if (/(create (a |the )?team|hire the team|generate a team)/i.test(t)) {
    kind = "create_team";
    label = "Create-team is an owner action on Teams. Conductor will not self-hire.";
    wantedRoles = ["workflow_manager"];
  } else if (/(train marketing|teach marketing|then draft positioning|train .{0,20}then .{0,20}position)/i.test(t)) {
    kind = "train_then_position";
    label = "Use owner-pasted or approved workspace lessons, then draft positioning. Search does not exist.";
    wantedRoles = ["marketing", "offer_strategist", "independent_audit", "workflow_manager"];
  } else if (/(growth opportunit|analyze this (existing )?business|biggest growth)/i.test(t)) {
    kind = "growth_analysis";
    label = "Growth questions from owner facts. Demand and TAM stay unknown unless already stored.";
    wantedRoles = ["business_research", "offer_strategist", "ops", "independent_audit", "workflow_manager"];
  } else if (/(offer|positioning)/i.test(t) && !/(three|promising business ideas)/i.test(t)) {
    kind = "offer_positioning";
    label = "Initial offer and positioning hypothesis from owner facts.";
    wantedRoles = ["offer_strategist", "marketing", "independent_audit", "workflow_manager"];
  } else if (/(local prototype|product spec|internal tool|working prototype)/i.test(t)) {
    kind = "product_build";
    label = "Local product spec or internal-tool slice. A file is written only when a product specialist exists on this company.";
    wantedRoles = ["product", "ops", "independent_audit", "workflow_manager"];
  } else if (/(three|promising|business ideas|find .{0,40}ideas|opportunit)/i.test(t)) {
    kind = "business_ideas";
    label = "Three labeled idea hypotheses from owner facts. Not researched demand.";
    wantedRoles = ["business_research", "offer_strategist", "finance", "independent_audit", "workflow_manager"];
  }
  const restricted = restrictedActions(text, extras || {});
  const wantsLocalArtifact = kind === "landing_outline" || kind === "product_build" || /(landing[- ]page|local prototype|product spec|internal tool)/i.test(t);
  return {
    kind: kind,
    label: label,
    ownerText: text,
    wantedRoles: wantedRoles,
    budgetUsd: budgetUsd,
    restrictedActions: restricted,
    needsResearch: kind === "competitor_research" || /research|competitor|features/i.test(t),
    wantsLocalArtifact: wantsLocalArtifact,
    orchestration: WORK_ORCHESTRATION,
    liveProviderCall: false,
    artifactGenerated: false,
  };
}

export function restrictedActions(text, payload) {
  const t = String(text || "").toLowerCase();
  const out = [];
  if (
    (payload && (payload.outreach === true || payload.requestOutreach === true || payload.action === "outreach" || payload.taskKind === "outreach"))
    || /outreach|email (these |the |our )?prospects|contact (these |the )?customers|cold[- ]call|send outbound/.test(t)
  ) {
    out.push("outreach");
  }
  if (
    (payload && (payload.policyRewrite === true || payload.rewritePolicy === true || payload.action === "policy_rewrite" || payload.taskKind === "policy_rewrite" || payload.taskKind === "create_owner_policy"))
    || /rewrite (the )?owner policy|create owner policy|change owner policy|policy rewrite/.test(t)
  ) {
    out.push("policy_rewrite");
  }
  if (payload && payload.targetWorkspaceId && payload.workspaceId && payload.targetWorkspaceId !== payload.workspaceId) {
    out.push("cross_workspace");
  }
  if (
    (payload && (payload.publish === true || payload.action === "publish" || payload.taskKind === "publish"))
    || /publish (this |the )?(page|site|landing)|go live|deploy publicly/.test(t)
  ) {
    out.push("publish");
  }
  if (
    (payload && (payload.purchase === true || payload.action === "purchase" || payload.taskKind === "purchase"))
    || /buy |purchase |place an order|spend on ads/.test(t)
  ) {
    out.push("purchase");
  }
  if (
    (payload && (payload.realProspects === true || payload.action === "prospects" || payload.taskKind === "prospects"))
    || /real prospects|contact (real )?leads|use our prospect list/.test(t)
  ) {
    out.push("prospects");
  }
  if (
    (payload && (payload.outOfScopeResearch === true || payload.action === "out_of_scope_research"))
    || /search the (open )?web|crawl the internet|google competitors|internet-wide/.test(t)
  ) {
    out.push("out_of_scope_research");
  }
  return out;
}

function catalogById(roleId) {
  return ROLE_CATALOG.find((r) => r.roleId === roleId) || null;
}

export function listAssignableEmployees(store, workspaceId) {
  const roles = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter((r) => {
    if (!r || r.workspaceId !== workspaceId) return false;
    if (NOT_IMPLEMENTED_ROLES.has(r.roleId)) return false;
    if (r.implementationStatus === "not_implemented") return false;
    if (!roleIsImplemented(r.roleId) && !ROLE_HANDLERS[r.roleId]) return false;
    if (!AUTHORIZED_EMPLOYEE_STATUSES.includes(r.status)) return false;
    return true;
  });
  return roles;
}

export function workspaceHasTeam(store, workspaceId) {
  return listAssignableEmployees(store, workspaceId).length > 0;
}

export function canAssignWorkspaceEmployee(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const roleId = payload && payload.roleId;
  const employeeId = payload && payload.employeeId;
  const taskKind = (payload && payload.taskKind) || "supervised_internal";
  if (!workspaceId) return { ok: false, code: "workspace_required", detail: "workspaceId is required." };
  if (payload && payload.targetWorkspaceId && payload.targetWorkspaceId !== workspaceId) {
    return { ok: false, code: "other_workspace", detail: "Objective stays inside its workspace." };
  }
  if (NOT_IMPLEMENTED_ROLES.has(roleId) || (payload && NOT_IMPLEMENTED_ROLES.has(payload.roleId))) {
    return { ok: false, code: "not_implemented", detail: "Role " + roleId + " is not_implemented." };
  }
  let emp = null;
  if (employeeId) emp = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  if (!emp && roleId) {
    emp = listAssignableEmployees(store, workspaceId).find((r) => r.roleId === roleId) || null;
    if (!emp) {
      const any = ((store.listEmployeeRoles && store.listEmployeeRoles()) || []).find((r) => r.roleId === roleId);
      if (any && any.workspaceId !== workspaceId) {
        return { ok: false, code: "other_workspace", detail: "Cannot assign an employee from another workspace." };
      }
    }
  }
  if (!emp) {
    return { ok: false, code: "unauthorized_employee", detail: "No authorized implemented employee for that assignment in this workspace." };
  }
  if (emp.workspaceId !== workspaceId) {
    return { ok: false, code: "other_workspace", detail: "Cannot assign an employee from another workspace." };
  }
  if (NOT_IMPLEMENTED_ROLES.has(emp.roleId) || emp.implementationStatus === "not_implemented" || !ROLE_HANDLERS[emp.roleId]) {
    return { ok: false, code: "not_implemented", detail: "Role " + emp.roleId + " is not_implemented." };
  }
  if (!AUTHORIZED_EMPLOYEE_STATUSES.includes(emp.status)) {
    return { ok: false, code: "unauthorized_employee", detail: "Employee " + emp.id + " is not authorized for assignment." };
  }
  if (taskKind === "outreach" || taskKind === "policy_rewrite" || taskKind === "create_owner_policy" || taskKind === "cross_workspace") {
    return { ok: false, code: "approval_required", detail: "Action " + taskKind + " requires owner approval. Not fabricated." };
  }
  if (taskKind !== "supervised_internal" && taskKind !== "manager_summary" && taskKind !== "specialist_task" && taskKind !== "research_request" && taskKind !== "audit") {
    return { ok: false, code: "supervised_internal_only", detail: "Product work is supervised internal only." };
  }
  return {
    ok: true,
    employeeId: emp.id,
    roleId: emp.roleId,
    status: emp.status,
    workspaceId: emp.workspaceId,
    supervisedInternalOnly: true,
    promoted: false,
    autonomous: false,
  };
}

export function assertCanAssignWorkspaceEmployee(store, payload) {
  const r = canAssignWorkspaceEmployee(store, payload);
  if (!r.ok) {
    const err = new Error("Conductor cannot assign that employee: " + r.code + ". " + (r.detail || ""));
    err.code = r.code === "other_workspace" ? "OTHER_WORKSPACE" : "CONDUCTOR_FORBIDDEN";
    err.assign = r;
    throw err;
  }
  return r;
}

function noTeamResult(workspaceId, extras) {
  const company = extras && extras.company;
  return {
    ok: false,
    built: true,
    code: "NO_TEAM",
    errorStatus: 409,
    persistence: "FILE_STORE",
    honesty: WORK_HONESTY,
    workspaceId: workspaceId,
    company: company ? { id: company.id, name: company.name } : { id: workspaceId },
    team: { present: false, employeeCount: 0, employees: [], invented: false },
    inventedEmployees: false,
    teamsHref: "#/teams?workspace=" + encodeURIComponent(workspaceId),
    teamsPath: "/app/teams?workspaceId=" + encodeURIComponent(workspaceId),
    message: "This company has no team yet. Generate and authorize a team on Teams before submitting work. Conductor will not invent employees.",
    note: "Honest block. No silent hire.",
    liveProviderCall: false,
  };
}

function publicEmployee(emp) {
  return {
    id: emp.id,
    name: emp.name || emp.roleTitle,
    roleId: emp.roleId,
    roleTitle: emp.roleTitle || emp.name,
    status: emp.status,
    workspaceId: emp.workspaceId,
    implementationStatus: emp.implementationStatus || "implemented_basic",
  };
}

function approvedKnowledge(store, workspaceId) {
  return (listApprovedWorkspaceKnowledge(store, workspaceId) || []).filter((k) => !k.workspaceId || k.workspaceId === workspaceId);
}

function knowledgeLooksUseful(items, kind) {
  if (!items || !items.length) return false;
  if (kind !== "competitor_research") return items.length > 0;
  const blob = items.map((k) => String(k.statement || k.excerpt || "")).join(" ").toLowerCase();
  return /competitor|feature|product|pricing|roofr|jobnimbus|acculynx|alternative/.test(blob);
}

function putActivity(store, rec) {
  if (store.putManagerActivity) store.putManagerActivity(rec);
}

function createApproval(store, payload) {
  const id = nextId(((store.listApprovalRequests && store.listApprovalRequests()) || []).map((r) => r.id), "APR-");
  const rec = {
    id: id,
    workspaceId: payload.workspaceId,
    objectiveId: payload.objectiveId || null,
    kind: payload.kind,
    objectType: "product_work_action",
    objectId: payload.objectiveId || id,
    status: "pending",
    requireLocalOwner: true,
    actorRequired: ["local_owner"],
    content: {
      action: payload.kind,
      ownerText: payload.ownerText || null,
      note: "Owner approval required. Conductor did not fabricate a decision.",
    },
    createdAt: nowIso(),
    decided: false,
    fabricated: false,
    note: payload.note || ("Blocked " + payload.kind + " until local_owner approves. Not decided here."),
  };
  store.putApprovalRequest(rec);
  return rec;
}

function createResearchRequest(store, payload) {
  const id = nextId(((store.listResearchRequests && store.listResearchRequests()) || []).map((r) => r.id), "RR-");
  const rec = {
    id: id,
    workspaceId: payload.workspaceId,
    objectiveId: payload.objectiveId,
    question: payload.question,
    status: "requested_not_fetched",
    fetched: false,
    autoFetch: false,
    searchEngine: false,
    searchIntegrationExists: false,
    live: false,
    fixture: false,
    label: "Additional research requested. Search integration does not exist. Not auto-fetched.",
    createdAt: nowIso(),
    note: "Conductor requested more research because approved workspace knowledge is insufficient. No internet fetch ran.",
  };
  store.putResearchRequest(rec);
  return rec;
}

function taskSpecForRole(roleId, kind, interpretation) {
  const spec = catalogById(roleId) || { roleId: roleId, roleTitle: roleId };
  const map = {
    business_research: {
      key: kind === "business_ideas" ? "idea_hypotheses" : (kind === "competitor_research" ? "competitor_summary" : "research_questions"),
      type: "specialist_task",
      expectedOutput: kind === "business_ideas" ? "three_labeled_idea_hypotheses" : (kind === "competitor_research" ? "knowledge_only_feature_summary" : "research_questions"),
    },
    offer_strategist: {
      key: kind === "offer_positioning" ? "offer_positioning" : "offer_hypothesis",
      type: "specialist_task",
      expectedOutput: "labeled_offer_hypothesis",
    },
    marketing: {
      key: kind === "landing_outline" ? "landing_outline" : "content_outline",
      type: "specialist_task",
      expectedOutput: kind === "landing_outline" ? "landing_outline_no_file" : "content_outline",
    },
    finance: {
      key: kind === "unit_economics" ? "unit_economics" : "budget_restatement",
      type: "specialist_task",
      expectedOutput: "assumptions_to_validate",
    },
    product: {
      key: "build_slice",
      type: "specialist_task",
      expectedOutput: "first_build_slice_note",
    },
    ops: {
      key: "ops_checklist",
      type: "specialist_task",
      expectedOutput: "ops_checklist",
    },
    independent_audit: {
      key: "audit",
      type: "audit",
      expectedOutput: "advisory_audit_notes",
    },
    workflow_manager: {
      key: "manager_summary",
      type: "manager_summary",
      expectedOutput: "owner_facing_summary",
    },
    atlas: {
      key: "fictional_qualification",
      type: "specialist_task",
      expectedOutput: "fictional_qualification_note",
    },
  };
  return {
    roleId: roleId,
    roleTitle: spec.roleTitle || roleId,
    ...(map[roleId] || { key: roleId, type: "specialist_task", expectedOutput: "labeled_deterministic_output" }),
    input: interpretation.ownerText,
    taskKind: kind,
  };
}

function buildTaskGraph(store, workspaceId, interpretation, employees) {
  const byRole = new Map();
  for (const emp of employees) {
    if (!byRole.has(emp.roleId)) byRole.set(emp.roleId, emp);
  }
  const wanted = interpretation.wantedRoles.filter((id) => byRole.has(id));
  const missing = interpretation.wantedRoles.filter((id) => !byRole.has(id) && roleIsImplemented(id));
  const skippedUnimplemented = interpretation.wantedRoles.filter((id) => NOT_IMPLEMENTED_ROLES.has(id) || !roleIsImplemented(id));
  const specs = wanted.map((id) => ({ ...taskSpecForRole(id, interpretation.kind, interpretation), employee: byRole.get(id) }));
  const researchFirst = specs.filter((s) => s.roleId === "business_research");
  const specialists = specs.filter((s) => s.roleId !== "business_research" && s.roleId !== "independent_audit" && s.roleId !== "workflow_manager");
  const audit = specs.filter((s) => s.roleId === "independent_audit");
  const summary = specs.filter((s) => s.roleId === "workflow_manager");
  const ordered = researchFirst.concat(specialists).concat(audit).concat(summary);
  return {
    ordered: ordered,
    missingImplementedRoles: missing,
    skippedUnimplemented: skippedUnimplemented,
  };
}

function persistTaskResult(store, task, patch) {
  const next = { ...task, ...patch, updatedAt: nowIso() };
  store.putTask(next);
  return next;
}

function retrievalTraceFor(store, workspaceId, emp, output) {
  const items = approvedKnowledge(store, workspaceId);
  const usedIds = (output && (output.usedLessons || output.retrievedIds)) || [];
  const retrieved = items.slice(0, 12).map((k) => ({
    id: k.id,
    statement: clip(k.statement || k.excerpt || "", 180),
    classification: k.classification || k.kind || k.claimKind || null,
    ownerPasted: k.sourceType === "owner_paste" || k.classification === "procedure" || k.classification === "company_fact" || k.classification === "owner_policy",
  }));
  return {
    retrieved: retrieved,
    used: retrieved.filter((k) => usedIds.includes(k.id) || retrieved.length > 0),
    ownerPastedUsed: retrieved.filter((k) => k.ownerPasted),
    searchUsed: false,
    embeddings: false,
    method: "lexical_deterministic",
    employeeId: emp && emp.id || null,
    note: "Owner-visible retrieval trace. Search integration does not exist. Stored ≠ retrieved ≠ used.",
  };
}

function maybePersistKnowledgeGap(store, task, output) {
  if (!store.putKnowledgeGap) return null;
  const unknown = (output && (output.unknown || output.validationGaps)) || [];
  const weak = !output || !output.summary || /unknown|insufficient|not stored|search integration does not exist/i.test(String(output.summary || ""));
  if (!unknown.length && !weak) return null;
  const statement = unknown.length
    ? String(unknown[0])
    : "Weak output: " + clip((output && output.summary) || task.resultSummary || "specialist result was thin", 180);
  const id = nextId(((store.listKnowledgeGaps && store.listKnowledgeGaps()) || []).map((g) => g.id), "GAP-");
  const rec = {
    id: id,
    workspaceId: task.workspaceId,
    employeeId: task.assignedEmployeeId,
    roleId: task.assignedRoleId,
    objectiveId: task.objectiveId,
    taskId: task.id,
    statement: statement,
    status: "open",
    source: "employee_weak_output",
    createdAt: nowIso(),
    persistence: "FILE_STORE",
    inspectable: true,
    note: "Persisted from a weak specialist output. Conductor may request bounded research or ask the owner for docs. Search integration does not exist.",
  };
  store.putKnowledgeGap(rec);
  return rec;
}

function executeSpecialist(store, task, interpretation, workspace, extras) {
  if (task.status === "completed" || task.status === "skipped" || task.status === "canceled") {
    return task;
  }
  const emp = store.getEmployeeRole(task.assignedEmployeeId);
  if (!emp) {
    return persistTaskResult(store, task, { status: "failed", error: "assigned employee missing" });
  }
  const assign = canAssignWorkspaceEmployee(store, {
    workspaceId: task.workspaceId,
    employeeId: emp.id,
    roleId: emp.roleId,
    taskKind: "supervised_internal",
  });
  if (!assign.ok) {
    return persistTaskResult(store, task, { status: "blocked", error: assign.detail || assign.code, blockCode: assign.code });
  }
  persistTaskResult(store, task, { status: "running", startedAt: nowIso() });
  const teammateOutputs = extras && extras.teammateOutputs || [];
  const ran = runEmployeeTask(store, emp.id, {
    input: task.input || interpretation.ownerText,
    taskKind: task.key,
    type: task.type,
    ownerText: interpretation.ownerText,
    teammateOutputs: teammateOutputs,
  });
  const output = ran && ran.task && ran.task.output;
  const trace = retrievalTraceFor(store, task.workspaceId, emp, output);
  if (ran && ran.task && store.putEmployeeTask) {
    store.putEmployeeTask({ ...ran.task, retrievalTrace: trace });
  }
  const gap = maybePersistKnowledgeGap(store, task, output);
  return persistTaskResult(store, task, {
    status: "completed",
    employeeTaskId: ran && ran.task && ran.task.id,
    result: output,
    resultSummary: output && output.summary,
    retrievalTrace: trace,
    knowledgeGapId: gap && gap.id || null,
    liveProviderCall: false,
    liveModelWork: false,
    orchestration: WORK_ORCHESTRATION,
    error: null,
  });
}

function ownerSummaryFromRecords(store, objective, plan, tasks) {
  const completed = tasks.filter((t) => t.status === "completed" && t.result);
  const blocked = tasks.filter((t) => t.status === "blocked" || t.status === "awaiting_owner_approval");
  const lines = completed.map((t) => ({
    taskId: t.id,
    employeeId: t.assignedEmployeeId,
    roleId: t.assignedRoleId,
    summary: (t.result && t.result.summary) || t.resultSummary || null,
    kind: t.result && t.result.kind,
    label: t.result && t.result.label,
    liveProviderCall: t.liveProviderCall === true,
  }));
  const spend = {
    maxSpendUsd: Number(objective.maxSpendUsd || 0),
    spentUsd: Number(objective.spentUsd || 0),
    remainingUsd: Math.round((Number(objective.maxSpendUsd || 0) - Number(objective.spentUsd || 0)) * 1e6) / 1e6,
    liveProviderCalls: tasks.filter((t) => t.liveProviderCall === true).length,
    kind: tasks.some((t) => t.liveProviderCall === true) ? "mixed_live_and_deterministic" : "deterministic_zero_live",
  };
  return {
    objectiveId: objective.id,
    workspaceId: objective.workspaceId,
    ownerText: objective.ownerText,
    interpretation: objective.interpretation,
    status: objective.status,
    planId: plan && plan.id,
    taskIds: tasks.map((t) => t.id),
    assignedEmployees: tasks
      .filter((t) => t.assignedEmployeeId)
      .map((t) => ({ id: t.assignedEmployeeId, roleId: t.assignedRoleId, name: t.assignedRoleName }))
      .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i),
    results: lines,
    blocked: blocked.map((t) => ({ taskId: t.id, status: t.status, reason: t.error || t.blockCode || t.type })),
    spend: spend,
    researchRequestIds: objective.researchRequestIds || [],
    approvalIds: objective.approvalIds || [],
    orchestration: WORK_ORCHESTRATION,
    liveProviderCall: tasks.some((t) => t.liveProviderCall === true),
    fixtureLabeledAsLive: false,
    artifactGenerated: false,
    note: "Summary is assembled from persisted task records only. Orchestration is deterministic. Specialist tasks may be live when a verified provider call actually ran.",
  };
}

export function requestWorkSpend(store, payload) {
  const objective = store.getObjective && store.getObjective(payload && payload.objectiveId);
  if (!objective) {
    const err = new Error("objective not found");
    err.code = "OBJECTIVE_NOT_FOUND";
    throw err;
  }
  if (payload && payload.raiseBudget === true) {
    assertConductorMayNot("raise_own_budget");
  }
  const requested = Number(payload && (payload.usd != null ? payload.usd : payload.requestedSpendUsd));
  const max = Number(objective.maxSpendUsd || 0);
  const spent = Number(objective.spentUsd || 0);
  if (!Number.isFinite(requested) || requested < 0) {
    const err = new Error("requested spend must be a non-negative number.");
    err.code = "INVALID_SPEND";
    throw err;
  }
  if (requested > max - spent) {
    const approval = createApproval(store, {
      workspaceId: objective.workspaceId,
      objectiveId: objective.id,
      kind: "spend_over_cap",
      ownerText: objective.ownerText,
      note: "Requested $" + requested + " exceeds remaining budget $" + (max - spent) + ". Approval required. Not fabricated.",
    });
    const next = {
      ...objective,
      status: "blocked",
      updatedAt: nowIso(),
      approvalIds: (objective.approvalIds || []).concat([approval.id]),
      lastBlock: { code: "BUDGET_EXCEEDED", requestedUsd: requested, remainingUsd: max - spent },
    };
    store.putObjective(next);
    putActivity(store, {
      id: "MACT-" + objective.id + "-budget",
      workspaceId: objective.workspaceId,
      at: nowIso(),
      kind: "budget_blocked",
      objectiveId: objective.id,
      detail: "Spend $" + requested + " exceeds cap $" + max,
    });
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      blocked: true,
      requestedUsd: requested,
      maxSpendUsd: max,
      spentUsd: spent,
      remainingUsd: max - spent,
      approval: approval,
      liveProviderCall: false,
      note: "Budget enforced. Conductor did not raise its own budget.",
    };
  }
  const nextSpent = spent + requested;
  store.putObjective({ ...objective, spentUsd: nextSpent, updatedAt: nowIso() });
  recordUsage(store, {
    workspaceId: objective.workspaceId,
    objectiveId: objective.id,
    role: CONDUCTOR_ROLE_ID,
    operation: "manager_plan",
    kind: "fixture",
    resultStatus: "ok",
    note: "Recorded requested deterministic/fixture spend. Not a live provider call.",
    costStatus: "unknown",
  });
  return { ok: true, spentUsd: nextSpent, remainingUsd: max - nextSpent, liveProviderCall: false };
}

export function requestRestrictedAction(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const kind = payload && payload.kind;
  const objective = payload && payload.objectiveId ? store.getObjective(payload.objectiveId) : null;
  if (kind === "raise_budget" || kind === "raise_own_budget") {
    assertConductorMayNot("raise_own_budget");
  }
  if (kind === "outreach" || kind === "policy_rewrite" || kind === "create_owner_policy" || kind === "cross_workspace" || kind === "spend_over_cap" || kind === "publish" || kind === "purchase" || kind === "prospects" || kind === "out_of_scope_research") {
    const autonomy = evaluateInternalAutonomy(store, workspaceId || (objective && objective.workspaceId), kind);
    if (autonomy.blocked) {
      return {
        ok: false,
        blocked: true,
        code: "AUTONOMY_FORBIDDEN",
        kind: kind,
        fabricated: false,
        decided: false,
        liveProviderCall: false,
        autonomy: autonomy,
        note: "Prohibited action stayed blocked. Autonomy policy cannot authorize it.",
      };
    }
    const approval = createApproval(store, {
      workspaceId: workspaceId || (objective && objective.workspaceId),
      objectiveId: objective && objective.id,
      kind: kind,
      ownerText: (payload && payload.ownerText) || (objective && objective.ownerText),
    });
    if (objective) {
      store.putObjective({
        ...objective,
        status: "awaiting_owner_approval",
        updatedAt: nowIso(),
        approvalIds: (objective.approvalIds || []).concat([approval.id]),
      });
    }
    return {
      ok: false,
      blocked: true,
      code: "APPROVAL_REQUIRED",
      kind: kind,
      approval: approval,
      fabricated: false,
      decided: false,
      liveProviderCall: false,
      note: "Action blocked without owner approval. Conductor did not approve, reject, or apply it.",
    };
  }
  const err = new Error("Unknown restricted action.");
  err.code = "UNKNOWN_ACTION";
  throw err;
}

function publicWorkView(store, objective) {
  if (!objective) return null;
  const plan = objective.planId && store.getPlan ? store.getPlan(objective.planId) : null;
  const tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const employees = (objective.assignedEmployeeIds || []).map((id) => store.getEmployeeRole && store.getEmployeeRole(id)).filter(Boolean).map(publicEmployee);
  const activity = ((store.listManagerActivity && store.listManagerActivity(objective.workspaceId)) || [])
    .filter((a) => a.objectiveId === objective.id)
    .slice(-30);
  const approvals = (objective.approvalIds || []).map((id) => store.getApprovalRequest && store.getApprovalRequest(id)).filter(Boolean);
  const research = (objective.researchRequestIds || []).map((id) => store.getResearchRequest && store.getResearchRequest(id)).filter(Boolean);
  const summary = ownerSummaryFromRecords(store, objective, plan, tasks);
  const spendView = ownerSpendView(store, objective.workspaceId);
  const deliverableRows = ((store.listDeliverables && store.listDeliverables(objective.workspaceId)) || [])
    .filter((d) => d.objectiveId === objective.id)
    .map(publicDeliverable);
  const artifact = objective.artifact || (deliverableRows.map((d) => d.artifact).find(Boolean) || null);
  return {
    ok: true,
    built: true,
    persistence: "FILE_STORE",
    honesty: { ...WORK_HONESTY, artifactGenerated: Boolean(artifact) },
    orchestration: WORK_ORCHESTRATION,
    disclosure: CONDUCTOR_DISCLOSURE,
    liveProviderCall: tasks.some((t) => t.liveProviderCall === true),
    fixtureLabeledAsLive: false,
    artifactGenerated: Boolean(artifact),
    workspaceId: objective.workspaceId,
    objective: {
      id: objective.id,
      workspaceId: objective.workspaceId,
      ownerText: objective.ownerText,
      status: objective.status,
      category: objective.category,
      surface: objective.surface,
      interpretation: objective.interpretation,
      maxSpendUsd: objective.maxSpendUsd,
      spentUsd: objective.spentUsd,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
      planId: objective.planId,
      authorizations: objective.authorizations || {
        outreach: false,
        newOwnerPolicy: false,
        otherWorkspace: false,
        unlimitedSpend: false,
      },
    },
    plan: plan && {
      id: plan.id,
      objectiveId: plan.objectiveId,
      workspaceId: plan.workspaceId,
      taskIds: plan.taskIds,
      stepTypes: plan.stepTypes,
      source: plan.source,
      bounded: true,
      disclosure: plan.disclosure,
      liveDraft: false,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      key: t.key,
      type: t.type,
      status: t.status,
      assignedEmployeeId: t.assignedEmployeeId,
      assignedRoleId: t.assignedRoleId,
      assignedRoleName: t.assignedRoleName,
      dependencies: t.prerequisites || t.dependencies || [],
      prerequisites: t.prerequisites || [],
      result: t.result || null,
      resultSummary: t.resultSummary || (t.result && t.result.summary) || null,
      employeeTaskId: t.employeeTaskId || null,
      error: t.error || null,
      liveProviderCall: t.liveProviderCall === true,
      liveModelWork: t.liveModelWork === true,
      executionId: t.executionId || null,
      budgetUsd: t.budgetUsd,
      retrievalTrace: t.retrievalTrace || null,
      knowledgeGapId: t.knowledgeGapId || null,
    })),
    taskStates: TASK_STATES.slice(),
    assignedEmployees: employees,
    spend: summary.spend,
    spendView: {
      estimatedUsd: spendView.totals && spendView.totals.estimatedUsd,
      entryCount: spendView.totals && spendView.totals.entryCount,
    },
    activity: activity.map((a) => ({
      id: a.id,
      at: a.at || a.createdAt,
      kind: a.kind,
      text: a.detail || a.kind,
      workspaceId: a.workspaceId,
      objectiveId: a.objectiveId,
    })),
    approvals: approvals.map((r) => ({
      id: r.id,
      status: r.status,
      kind: r.kind,
      decided: r.status !== "pending",
      fabricated: false,
    })),
    researchRequests: research.map((r) => ({
      id: r.id,
      status: r.status,
      fetched: r.fetched === true,
      autoFetch: false,
      searchIntegrationExists: false,
      question: r.question,
    })),
    summary: summary,
    deliverables: deliverableRows,
    artifact: artifact,
    artifactGenerated: Boolean(artifact),
    artifactNote: objective.artifactNote || (artifact ? "Local inspectable artifact only. Not deployed." : NO_ARTIFACT_MESSAGE),
    deployed: false,
    conductor: {
      may: CONDUCTOR_MAY.slice(),
      mayNot: CONDUCTOR_MAY_NOT.slice(),
      roleId: CONDUCTOR_ROLE_ID,
      roleName: CONDUCTOR_ROLE_NAME,
    },
    note: objective.note || WORK_HONESTY.note,
  };
}

export function inspectProductWork(store, id) {
  const objective = store.getObjective && store.getObjective(id);
  if (!objective || (objective.surface !== WORK_SURFACE && objective.category !== WORK_CATEGORY)) {
    return { errorStatus: 404, error: "work objective not found", built: true };
  }
  return publicWorkView(store, objective);
}

export function listProductWork(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const workspaces = ((store.listWorkspaces && store.listWorkspaces()) || []).map((w) => ({
    id: w.id,
    name: w.name,
    intakeKind: w.intakeKind || null,
    teamGenerated: w.teamGenerated === true,
  }));
  const all = ((store.listObjectives && store.listObjectives(workspaceId)) || []).filter((o) => o.surface === WORK_SURFACE || o.category === WORK_CATEGORY);
  const latest = all.length ? all[all.length - 1] : null;
  const employees = workspaceId ? listAssignableEmployees(store, workspaceId).map(publicEmployee) : [];
  const teamPresent = workspaceId ? workspaceHasTeam(store, workspaceId) : null;
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: WORK_HONESTY,
    orchestration: WORK_ORCHESTRATION,
    liveProviderCall: false,
    workspaceId: workspaceId || null,
    companies: workspaces,
    records: all.map((o) => ({
      id: o.id,
      workspaceId: o.workspaceId,
      status: o.status,
      ownerText: o.ownerText,
      interpretationKind: o.interpretation && o.interpretation.kind,
      createdAt: o.createdAt,
      planId: o.planId,
      spentUsd: o.spentUsd,
      maxSpendUsd: o.maxSpendUsd,
    })),
    latest: latest ? publicWorkView(store, latest) : null,
    team: workspaceId
      ? {
        present: teamPresent,
        employeeCount: employees.length,
        employees: employees,
        invented: false,
        teamsHref: "#/teams?workspace=" + encodeURIComponent(workspaceId),
      }
      : { present: null, employees: [], invented: false },
    examples: EXAMPLE_OBJECTIVES.slice(),
    note: workspaceId
      ? (teamPresent
        ? "Submit an objective. Conductor plans specialist work for this company only."
        : "This company has no team yet. Open Teams to generate and authorize one. Conductor will not invent employees.")
      : "Pick a company, then submit an objective. Work stays in that workspace.",
  };
}

export function submitProductObjective(store, payload) {
  const workspaceId = payload && (payload.workspaceId || payload.workspace || payload.companyId);
  if (!workspaceId) {
    const err = new Error("A company workspace is required to submit work.");
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
  if (payload && payload.raiseBudget === true) {
    assertConductorMayNot("raise_own_budget");
  }
  if (payload && payload.actor === "conductor") {
    assertConductorMayNot(payload.action || "perform this owner action");
  }
  const ownerText = asText(payload && (payload.ownerText || payload.text || payload.objective));
  if (ownerText.length < 12) {
    const err = new Error("Owner objective text is required.");
    err.code = "OBJECTIVE_REQUIRED";
    throw err;
  }
  if (payload && payload.targetWorkspaceId && payload.targetWorkspaceId !== workspaceId) {
    return requestRestrictedAction(store, {
      workspaceId: workspaceId,
      kind: "cross_workspace",
      ownerText: ownerText,
    });
  }

  const employees = listAssignableEmployees(store, workspaceId);
  if (!employees.length) {
    return noTeamResult(workspaceId, { company: workspace });
  }

  const interpretation = interpretObjective(ownerText, payload);
  if (interpretation.kind === "create_team") {
    return {
      ok: false,
      built: true,
      code: "USE_TEAMS",
      errorStatus: 409,
      honesty: WORK_HONESTY,
      workspaceId: workspaceId,
      interpretation: interpretation,
      teamsHref: "#/teams?workspace=" + encodeURIComponent(workspaceId),
      message: "Create a team is an owner action on Teams. Conductor will not self-hire or invent employees. Open Teams, generate a proposal, then click Create this team.",
      liveProviderCall: false,
    };
  }
  if (interpretation.kind === "train_then_position" && !employees.some((e) => e.roleId === "marketing")) {
    return {
      ok: false,
      built: true,
      code: "NO_MARKETING",
      errorStatus: 409,
      honesty: WORK_HONESTY,
      workspaceId: workspaceId,
      interpretation: interpretation,
      message: "Train marketing then draft positioning needs a Marketing specialist on this company. That role is not on the authorized team. Honest block. No invented employee.",
      liveProviderCall: false,
    };
  }
  const maxSpendUsd = parseBudgetUsd(ownerText, payload && payload.maxSpendUsd);
  interpretation.budgetUsd = maxSpendUsd;
  const requestedSpend = payload && payload.requestedSpendUsd != null ? Number(payload.requestedSpendUsd) : 0;

  if (payload && payload.assignEmployeeId) {
    const forced = canAssignWorkspaceEmployee(store, {
      workspaceId: workspaceId,
      employeeId: payload.assignEmployeeId,
      roleId: payload.assignRoleId,
      targetWorkspaceId: payload.targetWorkspaceId,
      taskKind: payload.taskKind || "supervised_internal",
    });
    if (!forced.ok) {
      const err = new Error("Conductor cannot assign that employee: " + forced.code);
      err.code = "CONDUCTOR_FORBIDDEN";
      err.assign = forced;
      throw err;
    }
  }

  const now = nowIso();
  const objectiveId = nextId(((store.listObjectives && store.listObjectives()) || []).map((o) => o.id), "OBJ-");
  const isolated = isIsolatedOwnerWorkspace(workspace);
  const knowledge = approvedKnowledge(store, workspaceId);
  const restricted = interpretation.restrictedActions.slice();

  const objective = {
    id: objectiveId,
    workspaceId: workspaceId,
    ownerText: ownerText,
    category: WORK_CATEGORY,
    surface: WORK_SURFACE,
    interpretation: interpretation,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
    maxSpendUsd: maxSpendUsd,
    spentUsd: 0,
    planId: null,
    assignedEmployeeIds: [],
    approvalIds: [],
    researchRequestIds: [],
    orchestration: WORK_ORCHESTRATION,
    liveProviderCall: false,
    fixtureLabeledAsLive: false,
    artifactGenerated: false,
    isolated: isolated,
    authorizations: {
      outreach: false,
      realProspects: false,
      purchases: false,
      newOwnerPolicy: false,
      promotion: false,
      otherWorkspace: false,
      unlimitedSpend: false,
    },
    note: "Submitting an objective does not authorize outreach, policy rewrite, promotion, or spend over the stated cap.",
  };
  store.putObjective(objective);

  if (requestedSpend > maxSpendUsd) {
    const blocked = requestWorkSpend(store, { objectiveId: objectiveId, usd: requestedSpend });
    return {
      ...blocked,
      built: true,
      honesty: WORK_HONESTY,
      objective: store.getObjective(objectiveId),
      workspaceId: workspaceId,
    };
  }

  const graph = buildTaskGraph(store, workspaceId, interpretation, employees);
  const planId = nextId(((store.listPlans && store.listPlans()) || []).map((p) => p.id), "PLAN-");
  const existingTaskIds = ((store.listTasks && store.listTasks()) || []).map((t) => t.id);
  const scratch = [];
  const tasks = [];
  let step = 0;
  const keyToId = {};
  for (const spec of graph.ordered) {
    const id = nextId(existingTaskIds.concat(scratch), "TSK-");
    scratch.push(id);
    const deps = [];
    if (spec.roleId !== "business_research") {
      if (keyToId.idea_hypotheses) deps.push(keyToId.idea_hypotheses);
      if (keyToId.competitor_summary) deps.push(keyToId.competitor_summary);
      if (keyToId.research_questions) deps.push(keyToId.research_questions);
    }
    if (spec.roleId === "independent_audit") {
      for (const [k, tid] of Object.entries(keyToId)) {
        if (k !== "audit" && k !== "manager_summary") deps.push(tid);
      }
    }
    if (spec.roleId === "workflow_manager") {
      for (const [k, tid] of Object.entries(keyToId)) {
        if (k !== "manager_summary") deps.push(tid);
      }
    }
    const uniqueDeps = Array.from(new Set(deps));
    const task = {
      id: id,
      objectiveId: objectiveId,
      workspaceId: workspaceId,
      planId: planId,
      stepIndex: step,
      key: spec.key,
      type: spec.type,
      assignedRoleId: spec.roleId,
      assignedRoleName: spec.roleTitle,
      assignedEmployeeId: spec.employee.id,
      assignedAgentId: spec.employee.agentId,
      assignedVersionId: spec.employee.versionId,
      allowedInputs: ["owner_text", "approved_workspace_knowledge", "workspace_intake"],
      expectedOutput: spec.expectedOutput,
      prerequisites: uniqueDeps,
      dependencies: uniqueDeps,
      approvalRequirements: [],
      budgetUsd: 0,
      optional: false,
      status: "queued",
      attemptCount: 0,
      error: null,
      result: null,
      resultRefs: {},
      input: ownerText,
      createdAt: now,
      updatedAt: now,
      liveProviderCall: false,
    };
    keyToId[spec.key] = id;
    tasks.push(task);
    step += 1;
  }

  if (restricted.length) {
    const kind = restricted[0];
    const approval = createApproval(store, {
      workspaceId: workspaceId,
      objectiveId: objectiveId,
      kind: kind,
      ownerText: ownerText,
    });
    objective.approvalIds.push(approval.id);
    const blockId = nextId(existingTaskIds.concat(scratch), "TSK-");
    scratch.push(blockId);
    tasks.push({
      id: blockId,
      objectiveId: objectiveId,
      workspaceId: workspaceId,
      planId: planId,
      stepIndex: step,
      key: kind,
      type: kind,
      assignedRoleId: null,
      assignedRoleName: null,
      assignedEmployeeId: null,
      allowedInputs: [],
      expectedOutput: "owner_approval",
      prerequisites: [],
      dependencies: [],
      approvalRequirements: [kind],
      budgetUsd: 0,
      status: "awaiting_owner_approval",
      error: "Requires local_owner approval. Not fabricated.",
      blockCode: "APPROVAL_REQUIRED",
      result: null,
      createdAt: now,
      updatedAt: now,
      liveProviderCall: false,
    });
    step += 1;
  }

  const plan = {
    id: planId,
    objectiveId: objectiveId,
    workspaceId: workspaceId,
    createdAt: now,
    updatedAt: now,
    source: WORK_PLAN_SOURCE,
    liveDraft: false,
    liveProposalId: null,
    taskIds: tasks.map((t) => t.id),
    stepTypes: tasks.map((t) => t.type),
    disclosure: CONDUCTOR_DISCLOSURE,
    bounded: true,
    maxSteps: 8,
    missingImplementedRoles: graph.missingImplementedRoles,
    skippedUnimplemented: graph.skippedUnimplemented,
    orchestration: WORK_ORCHESTRATION,
  };
  for (const t of tasks) store.putTask(t);
  store.putPlan(plan);

  const assignedIds = Array.from(new Set(tasks.map((t) => t.assignedEmployeeId).filter(Boolean)));
  store.putObjective({
    ...store.getObjective(objectiveId),
    planId: planId,
    status: "planned",
    assignedEmployeeIds: assignedIds,
    approvalIds: objective.approvalIds,
    updatedAt: nowIso(),
  });

  putActivity(store, {
    id: "MACT-" + objectiveId + "-submit",
    workspaceId: workspaceId,
    at: now,
    kind: "objective_submitted",
    objectiveId: objectiveId,
    detail: clip(ownerText, 180),
  });
  putActivity(store, {
    id: "MACT-" + planId + "-plan",
    workspaceId: workspaceId,
    at: nowIso(),
    kind: "plan_persisted",
    objectiveId: objectiveId,
    detail: WORK_PLAN_SOURCE + " steps=" + tasks.length,
  });

  recordUsage(store, {
    workspaceId: workspaceId,
    objectiveId: objectiveId,
    role: CONDUCTOR_ROLE_ID,
    operation: "manager_plan",
    kind: "fixture",
    resultStatus: "ok",
    note: "Deterministic product work plan. No live provider call.",
    costStatus: "unknown",
  });

  const defer = Boolean(payload && (payload.deferRun === true || payload.preferLive === true || payload.live === true));
  if (!defer) runProductWork(store, objectiveId);
  return publicWorkView(store, store.getObjective(objectiveId));
}

export function runProductWork(store, objectiveId) {
  const objective = store.getObjective(objectiveId);
  if (!objective) {
    const err = new Error("objective not found");
    err.code = "OBJECTIVE_NOT_FOUND";
    throw err;
  }
  const workspace = store.getWorkspace(objective.workspaceId);
  const plan = store.getPlan(objective.planId);
  let tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const knowledge = approvedKnowledge(store, objective.workspaceId);
  const interpretation = objective.interpretation || interpretObjective(objective.ownerText, objective);

  if (interpretation.needsResearch && !knowledgeLooksUseful(knowledge, interpretation.kind)) {
    const already = (objective.researchRequestIds || []).length;
    if (!already) {
      const rr = createResearchRequest(store, {
        workspaceId: objective.workspaceId,
        objectiveId: objective.id,
        question: "Approved workspace knowledge is insufficient for: " + clip(objective.ownerText, 160),
      });
      store.putObjective({
        ...store.getObjective(objective.id),
        researchRequestIds: [rr.id],
        updatedAt: nowIso(),
      });
      putActivity(store, {
        id: "MACT-" + objective.id + "-research",
        workspaceId: objective.workspaceId,
        at: nowIso(),
        kind: "research_requested",
        objectiveId: objective.id,
        detail: rr.id + " requested_not_fetched. Search integration does not exist.",
      });
    }
  }

  const done = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  const teammateOutputs = [];
  let progressed = true;
  let guard = 0;
  while (progressed && guard < 12) {
    progressed = false;
    guard += 1;
    tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
    for (const task of tasks) {
      if (task.status === "completed" || task.status === "failed" || task.status === "skipped" || task.status === "canceled") continue;
      if (task.status === "awaiting_owner_approval" || task.status === "blocked") continue;
      const deps = task.prerequisites || task.dependencies || [];
      const ready = deps.every((d) => done.has(d));
      if (!ready) continue;
      if (task.type === "outreach" || task.type === "policy_rewrite" || task.type === "create_owner_policy" || task.type === "publish" || task.type === "purchase" || task.type === "prospects" || task.type === "out_of_scope_research") {
        persistTaskResult(store, task, {
          status: "awaiting_owner_approval",
          error: "Requires local_owner approval. Not fabricated.",
          blockCode: "APPROVAL_REQUIRED",
        });
        progressed = true;
        continue;
      }
      if (task.assignedEmployeeId) {
        const policyDecision = evaluateInternalAutonomy(store, objective.workspaceId, "run_specialist_task", { employeeId: task.assignedEmployeeId });
        putActivity(store, {
          id: "MACT-" + task.id + "-autonomy",
          workspaceId: objective.workspaceId,
          at: nowIso(),
          kind: "autonomy_inspect",
          objectiveId: objective.id,
          detail: "what=" + (task.type || task.key) + " why=" + (policyDecision.reason || "") + " permitted=" + String(!policyDecision.blocked) + " policy=" + (policyDecision.policyId || "none") + " watcher=independent_audit",
          what: task.type || task.key,
          whyPermitted: policyDecision.reason,
          used: ["owner_autonomy_policy", "approved_workspace_knowledge"],
          cost: 0,
          produced: null,
          watcher: "independent_audit",
          authorityExpanded: false,
        });
        if (policyDecision.blocked) {
          persistTaskResult(store, task, {
            status: "awaiting_owner_approval",
            error: "Autonomy policy paused this step: " + policyDecision.reason,
            blockCode: "AUTONOMY_PAUSE",
          });
          progressed = true;
          continue;
        }
        const updated = executeSpecialist(store, task, interpretation, workspace, { teammateOutputs: teammateOutputs });
        if (updated.status === "completed") {
          done.add(updated.id);
          if (updated.result) teammateOutputs.push(updated.result);
          putActivity(store, {
            id: "MACT-" + updated.id + "-done",
            workspaceId: objective.workspaceId,
            at: nowIso(),
            kind: "task_completed",
            objectiveId: objective.id,
            detail: updated.id + " " + (updated.assignedRoleId || "") + " " + clip(updated.resultSummary, 120),
          });
        }
        progressed = true;
      }
    }
  }

  tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const waiting = tasks.some((t) => t.status === "awaiting_owner_approval");
  const blocked = tasks.some((t) => t.status === "blocked");
  const failed = tasks.some((t) => t.status === "failed");
  const runnable = tasks.filter((t) => t.type !== "outreach" && t.type !== "policy_rewrite" && t.type !== "create_owner_policy");
  const allDone = runnable.length > 0 && runnable.every((t) => t.status === "completed" || t.status === "blocked" || t.optional);
  let status = "running";
  if (waiting) status = "awaiting_owner_approval";
  else if (blocked && !allDone) status = "blocked";
  else if (failed) status = "failed";
  else if (allDone) status = "completed";
  const current = store.getObjective(objective.id);
  const summary = ownerSummaryFromRecords(store, { ...current, status: status }, plan, tasks);
  store.putObjective({
    ...current,
    status: status,
    completionSummaryId: current.id + "-summary",
    summary: summary,
    updatedAt: nowIso(),
  });
  putActivity(store, {
    id: "MACT-" + objective.id + "-status",
    workspaceId: objective.workspaceId,
    at: nowIso(),
    kind: "work_status",
    objectiveId: objective.id,
    detail: status + " tasks=" + tasks.length,
  });
  if (status === "completed" || status === "awaiting_owner_approval" || status === "blocked") {
    const assembled = assembleDeliverables(store, objective.id);
    putActivity(store, {
      id: "MACT-" + objective.id + "-deliverables",
      workspaceId: objective.workspaceId,
      at: nowIso(),
      kind: "deliverables_assembled",
      objectiveId: objective.id,
      detail: "deliverables=" + assembled.deliverableIds.join(",") + (assembled.artifactGenerated ? (" artifact=" + assembled.artifact.path) : " artifact=none"),
    });
  }
  return publicWorkView(store, store.getObjective(objective.id));
}

export {
  CONDUCTOR_DISCLOSURE,
  CONDUCTOR_ORCHESTRATION,
  CONDUCTOR_MAY,
  CONDUCTOR_MAY_NOT,
  assembleDeliverables,
  listWorkspaceDeliverables,
  DELIVERABLE_HONESTY,
};


async function executeSpecialistLive(store, task, interpretation, workspace, extras) {
  if (task.status === "completed" || task.status === "skipped" || task.status === "canceled") {
    return task;
  }
  const emp = store.getEmployeeRole(task.assignedEmployeeId);
  if (!emp) {
    return persistTaskResult(store, task, { status: "failed", error: "assigned employee missing" });
  }
  const assign = canAssignWorkspaceEmployee(store, {
    workspaceId: task.workspaceId,
    employeeId: emp.id,
    roleId: emp.roleId,
    taskKind: "supervised_internal",
  });
  if (!assign.ok) {
    return persistTaskResult(store, task, { status: "blocked", error: assign.detail || assign.code, blockCode: assign.code });
  }
  persistTaskResult(store, task, { status: "running", startedAt: nowIso() });
  const teammateOutputs = extras && extras.teammateOutputs || [];
  const deps = extras && extras.deps || {};
  const preferLive = isLiveReasoningRole(emp.roleId) && Boolean(deps && deps.live === true);
  const ran = preferLive
    ? await runEmployeeTaskLive(store, emp.id, {
      input: task.input || interpretation.ownerText,
      taskKind: task.key,
      type: task.type,
      ownerText: interpretation.ownerText,
      teammateOutputs: teammateOutputs,
      preferLive: true,
      objectiveId: task.objectiveId,
      taskId: task.id,
    }, deps)
    : runEmployeeTask(store, emp.id, {
      input: task.input || interpretation.ownerText,
      taskKind: task.key,
      type: task.type,
      ownerText: interpretation.ownerText,
      teammateOutputs: teammateOutputs,
    });
  const output = ran && ran.task && ran.task.output;
  const trace = retrievalTraceFor(store, task.workspaceId, emp, output);
  if (output && ran && ran.specialist && ran.specialist.retrievedIds) {
    trace.retrieved = (trace.retrieved || []).map((k) => k);
    trace.used = (trace.retrieved || []).filter((k) => (ran.specialist.retrievedIds || []).includes(k.id));
    trace.liveProviderCall = ran.liveProviderCall === true;
  }
  if (ran && ran.task && store.putEmployeeTask) {
    store.putEmployeeTask({ ...ran.task, retrievalTrace: trace });
  }
  const gap = maybePersistKnowledgeGap(store, task, output);
  return persistTaskResult(store, task, {
    status: ran && ran.ok === false && ran.usedLivePath ? "failed" : "completed",
    employeeTaskId: ran && ran.task && ran.task.id,
    result: output,
    resultSummary: output && output.summary,
    retrievalTrace: trace,
    knowledgeGapId: gap && gap.id || null,
    liveProviderCall: Boolean(ran && ran.liveProviderCall),
    liveModelWork: Boolean(ran && ran.liveModelWork),
    executionId: ran && ran.execution && ran.execution.id || null,
    orchestration: WORK_ORCHESTRATION,
    error: ran && ran.ok === false && ran.usedLivePath ? ((ran.specialist && ran.specialist.error) || "live specialist fail-closed") : null,
  });
}

export async function runProductWorkLive(store, objectiveId, deps) {
  const objective = store.getObjective(objectiveId);
  if (!objective) {
    const err = new Error("objective not found");
    err.code = "OBJECTIVE_NOT_FOUND";
    throw err;
  }
  const workspace = store.getWorkspace(objective.workspaceId);
  const plan = store.getPlan(objective.planId);
  let tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const knowledge = approvedKnowledge(store, objective.workspaceId);
  const interpretation = objective.interpretation || interpretObjective(objective.ownerText, objective);
  const autonomy = activeInternalAutonomyPolicy(store, objective.workspaceId);
  const skipInternalPrompt = Boolean(autonomy && evaluateInternalAutonomy(store, objective.workspaceId, "run_specialist_task").skipPrompt);

  if (interpretation.needsResearch && !knowledgeLooksUseful(knowledge, interpretation.kind)) {
    const already = (objective.researchRequestIds || []).length;
    if (!already) {
      const rr = createResearchRequest(store, {
        workspaceId: objective.workspaceId,
        objectiveId: objective.id,
        question: "Approved workspace knowledge is insufficient for: " + clip(objective.ownerText, 160),
      });
      store.putObjective({
        ...store.getObjective(objective.id),
        researchRequestIds: [rr.id],
        updatedAt: nowIso(),
      });
      putActivity(store, {
        id: "MACT-" + objective.id + "-research",
        workspaceId: objective.workspaceId,
        at: nowIso(),
        kind: "research_requested",
        objectiveId: objective.id,
        detail: rr.id + " requested_not_fetched. Search integration does not exist.",
      });
    }
  }

  const done = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  const teammateOutputs = [];
  let progressed = true;
  let guard = 0;
  while (progressed && guard < 12) {
    progressed = false;
    guard += 1;
    tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
    for (const task of tasks) {
      if (task.status === "completed" || task.status === "failed" || task.status === "skipped" || task.status === "canceled") continue;
      if (task.status === "awaiting_owner_approval" || task.status === "blocked") continue;
      const depsReady = (task.prerequisites || task.dependencies || []).every((d) => done.has(d));
      if (!depsReady) continue;
      if (task.type === "outreach" || task.type === "policy_rewrite" || task.type === "create_owner_policy" || task.type === "publish" || task.type === "purchase" || task.type === "prospects" || task.type === "out_of_scope_research") {
        persistTaskResult(store, task, {
          status: "awaiting_owner_approval",
          error: "Requires local_owner approval. Not fabricated.",
          blockCode: "APPROVAL_REQUIRED",
        });
        progressed = true;
        continue;
      }
      if (task.assignedEmployeeId) {
        const updated = await executeSpecialistLive(store, task, interpretation, workspace, { teammateOutputs: teammateOutputs, deps: deps || {} });
        if (updated.status === "completed") {
          done.add(updated.id);
          if (updated.result) teammateOutputs.push(updated.result);
          putActivity(store, {
            id: "MACT-" + updated.id + "-done",
            workspaceId: objective.workspaceId,
            at: nowIso(),
            kind: "task_completed",
            objectiveId: objective.id,
            detail: updated.id + " " + (updated.assignedRoleId || "") + " " + clip(updated.resultSummary, 120) + (updated.liveProviderCall ? " live" : " deterministic"),
          });
        }
        progressed = true;
      }
    }
  }

  tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const waiting = tasks.some((t) => t.status === "awaiting_owner_approval");
  const blocked = tasks.some((t) => t.status === "blocked");
  const failed = tasks.some((t) => t.status === "failed");
  const runnable = tasks.filter((t) => t.type !== "outreach" && t.type !== "policy_rewrite" && t.type !== "create_owner_policy");
  const allDone = runnable.length > 0 && runnable.every((t) => t.status === "completed" || t.status === "blocked" || t.optional);
  let status = "running";
  if (waiting) status = "awaiting_owner_approval";
  else if (blocked && !allDone) status = "blocked";
  else if (failed) status = "failed";
  else if (allDone) status = "completed";
  const current = store.getObjective(objective.id);
  const summary = ownerSummaryFromRecords(store, { ...current, status: status }, plan, tasks);
  store.putObjective({
    ...current,
    status: status,
    completionSummaryId: current.id + "-summary",
    summary: summary,
    liveProviderCall: tasks.some((t) => t.liveProviderCall === true),
    autonomyPolicyId: autonomy && autonomy.id || null,
    skippedInternalPrompts: skipInternalPrompt,
    updatedAt: nowIso(),
  });
  putActivity(store, {
    id: "MACT-" + objective.id + "-status-live",
    workspaceId: objective.workspaceId,
    at: nowIso(),
    kind: "work_status",
    objectiveId: objective.id,
    detail: status + " tasks=" + tasks.length + " live=" + tasks.filter((t) => t.liveProviderCall).length,
  });
  if (status === "completed" || status === "awaiting_owner_approval" || status === "blocked") {
    const assembled = assembleDeliverables(store, objective.id);
    putActivity(store, {
      id: "MACT-" + objective.id + "-deliverables-live",
      workspaceId: objective.workspaceId,
      at: nowIso(),
      kind: "deliverables_assembled",
      objectiveId: objective.id,
      detail: "deliverables=" + assembled.deliverableIds.join(",") + (assembled.artifactGenerated ? (" artifact=" + assembled.artifact.path) : " artifact=none"),
    });
  }
  const view = publicWorkView(store, store.getObjective(objective.id));
  return { ...view, autonomy: autonomy ? { id: autonomy.id, skippedInternalPrompts: skipInternalPrompt } : null };
}

export async function submitProductObjectiveLive(store, payload, deps) {
  const submitted = submitProductObjective(store, { ...(payload || {}), preferLive: true, deferRun: true });
  if (!submitted || submitted.ok === false || submitted.code) return submitted;
  const objectiveId = submitted.objective && submitted.objective.id;
  if (!objectiveId) return submitted;
  return runProductWorkLive(store, objectiveId, deps || {});
}
