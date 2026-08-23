/** Conductor: real workflow manager. Deterministic orchestration. Optional live plan draft is validated before dispatch. */
import { contentHash } from "@midas/db";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import {
  ensureScout,
  runScoutResearch,
  reviewFinding,
  trainAtlasFromScout,
  scoutAgentId,
  scoutVersionId,
  SCOUT_ROLE_ID,
  SCOUT_ROLE_NAME,
  RESEARCH_LABEL,
} from "./scout.ts";
import { runWorkbench, HANDOFF_FICTIONAL_PROSPECTS, HANDOFF_OWNER_PASTE, HANDOFF_SCOUT_QUESTION, handoffQualificationPolicy } from "./workspace.ts";
import { ensureWatcher, auditCompletedWork, auditOfferStrategistResult, auditFounderOpportunityBrief, auditTeachingChain, watcherAgentId, watcherVersionId, WATCHER_ROLE_ID, WATCHER_ROLE_NAME } from "./watcher.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import {
  FOUNDER_BRIEF_OWNER_OBJECTIVE,
  FOUNDER_BRIEF_CATEGORY,
  isFounderBriefObjective,
  isFounderBriefText,
  findMatchingFounderObjective,
  assessKnowledgeSufficiency,
  findReusableStrategistRun,
  assembleFounderOpportunityBrief,
  buildFounderOpportunityBrief,
  persistFounderOpportunityBrief,
  recordFounderBriefContributions,
  latestFounderBrief,
} from "./founder-opportunity-brief.ts";
import { runOfferStrategistLive, OFFER_STRATEGIST_LIVE_TASK } from "./offer-strategist-live.ts";
import { reconcileStaleApprovals, listPendingApprovals } from "./approval-reconciliation.ts";
import { recordStrategistContributions, applyDevelopmentVerification } from "./offer-strategist-progression.ts";
import { evaluateKnowledgeUsefulness } from "./usefulness.ts";
import { recordContribution } from "./contribution.ts";
import { resolveActorType, rejectMasonClaim, ACTOR_TYPES } from "./approval-actors.ts";
import { freezeFictionalScenario, recordExpectedUtility } from "./expected-utility.ts";
import { ownerCannotOverrideEvidence } from "./usefulness.ts";
import { checkSourceSupport } from "./source-support.ts";
import { runEvidenceLearning, isEvidenceLearningObjective, isEvidenceLearningText, EVIDENCE_LEARNING_CATEGORY, EVIDENCE_LEARNING_WORKFLOW_TYPES, verifyTeachingPacket } from "./teaching-engine.ts";

export const CONDUCTOR_ROLE_ID = "workflow_manager";
export const CONDUCTOR_ROLE_NAME = "Conductor";
export const CONDUCTOR_ORCHESTRATION = "deterministic";
export const CONDUCTOR_PLAN_MODE = "deterministic_with_optional_live_draft";
export const CONDUCTOR_DISCLOSURE =
  "Orchestration is deterministic. Optional live plan draft is validated before dispatch; invalid live plans are kept as proposals if safe, then rejected or repaired deterministically. Unauthorized steps are not executed. Watcher audits are deterministic/advisory.";

export const TASK_STATES = [
  "queued", "running", "awaiting_owner_approval", "approved", "rejected", "blocked", "completed", "failed", "canceled",
];
export const OBJECTIVE_STATUSES = [
  "submitted", "planned", "running", "awaiting_owner_approval", "paused", "blocked", "completed", "failed", "canceled", "rejected",
];
export const OBJECTIVE_TERMINAL_STATUSES = [
  "completed_with_actionable_finding",
  "completed_no_actionable_evidence",
  "blocked_missing_source",
  "blocked_owner_decision_required",
  "rejected_by_owner",
  "failed_source_fetch",
  "failed_quality_gate",
];
export const FIRST_WORKFLOW_TYPES = [
  "scout_research", "owner_review", "atlas_train", "atlas_eval", "watcher_audit", "manager_summary",
];
export const OFFER_STRATEGIST_WORKFLOW_TYPES = [
  "offer_strategist", "watcher_audit", "manager_summary",
];
export const FOUNDER_BRIEF_WORKFLOW_TYPES = [
  "knowledge_sufficiency", "offer_strategist", "founder_brief_assembly", "watcher_audit", "manager_summary",
];
export const CONDUCTOR_MAY = [
  "draft_bounded_plan", "assign_existing_specialists", "wait_for_required_approvals", "track_execution", "report_verified_outcomes", "pause_resume_cancel",
];
export const CONDUCTOR_MAY_NOT = [
  "approve_findings", "create_owner_policy", "promote", "bypass_watcher", "raise_own_budget", "invent_employee_completions",
  "outreach", "ingest_real_prospects", "access_gold", "access_secrets", "access_other_workspace", "hide_specialist_calls",
  "retry_expensive_failures", "continue_after_exhausted_budget",
];
export const MAX_PLAN_STEPS = 8;
export const MAX_RETRIES = 2;

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix, lister) {
  const existing = lister ? lister().map((x) => x.id) : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id).match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export function conductorPrompt() {
  return {
    system:
      "You are Conductor, the workflow manager for a single workspace. " +
      "Translate an owner-approved business objective into a bounded plan. " +
      "Assign existing specialists only. Wait for required owner approvals. Track execution. Report verified outcomes. " +
      "You cannot approve findings, create owner policy, promote, bypass Watcher, raise your own budget, or invent employee completions. " +
      "You cannot contact prospects, ingest real prospects, access gold, secrets, or other workspaces. " +
      "Submitting an objective does not authorize outreach, purchases, new owner policies, or promotion. " +
      "If a capability is missing, request it or block. Do not invent specialists. " +
      "This is not the Atlas qualification prompt, not the Scout research prompt, and not the Watcher audit prompt.",
    developer:
      "Return a bounded plan of existing specialist steps. First workflow: Scout research, owner review, optional owner-authorized Atlas train, Atlas fictional eval, Watcher audit, manager summary. " +
      "Orchestration is deterministic. A live plan draft is a proposal only until validated.",
  };
}

export function conductorAgentId(workspaceId) {
  return "conductor-" + workspaceId;
}

export function conductorVersionId(workspaceId, n) {
  return "conductor-" + workspaceId + "-v" + (n == null ? 0 : n);
}

export function assertConductorMayNot(action) {
  const a = String(action || "");
  if (
    CONDUCTOR_MAY_NOT.includes(a)
    || /approve.find|create.owner.policy|promote|bypass.watcher|raise.own.budget|invent.employee|outreach|real.prospect|gold|secret|other.workspace/i.test(a)
  ) {
    const err = new Error("Conductor may not: " + a);
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
}

export function assertNotConductorActor(actor, action) {
  const who = String(actor || "");
  if (who === "conductor" || who === CONDUCTOR_ROLE_ID || /^conductor-/.test(who)) {
    const err = new Error("Conductor cannot " + (action || "perform this owner action") + ".");
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
}

const RESERVED_UNIMPLEMENTED = ["marketing", "sales", "ops", "finance", "executive", "watcher", "opportunity_research"];

export function canAssignEmployee(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const roleId = payload && payload.roleId;
  const taskKind = (payload && payload.taskKind) || "supervised_internal";
  if (payload && payload.targetWorkspaceId && workspaceId && payload.targetWorkspaceId !== workspaceId) {
    return { ok: false, code: "other_workspace", detail: "Objective stays inside its workspace." };
  }
  if (RESERVED_UNIMPLEMENTED.includes(roleId)) {
    return { ok: false, code: "unauthorized_employee", detail: "Role " + roleId + " is not an authorized implemented employee." };
  }
  if (roleId === "offer_strategist" || roleId === OFFER_STRATEGIST_ROLE_ID) {
    const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
    const role = roles.find((r) => r.roleId === "offer_strategist" || r.id === (payload && payload.employeeId));
    if (!role) return { ok: false, code: "unauthorized_employee", detail: "Offer Strategist is not implemented in this workspace." };
    if (!["evaluation_required", "active_development", "development_verified"].includes(role.status)) {
      return { ok: false, code: "unauthorized_employee", detail: "EMP-001 is not authorized for assignment." };
    }
    if (taskKind !== "supervised_internal") {
      return { ok: false, code: "supervised_internal_only", detail: "EMP-001 may receive supervised internal tasks only." };
    }
    return { ok: true, employeeId: role.id, status: role.status, supervisedInternalOnly: true, promoted: false, autonomous: false };
  }
  if (!implementedRole(store, workspaceId, roleId)) {
    return { ok: false, code: "unauthorized_employee", detail: "Role is not implemented." };
  }
  return { ok: true, roleId: roleId };
}

export function assertCanAssignEmployee(store, payload) {
  const r = canAssignEmployee(store, payload);
  if (!r.ok) {
    const err = new Error("Conductor cannot assign an unauthorized employee: " + r.code);
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
  return r;
}

export function ensureConductor(store, workspaceId) {
  if (!workspaceId) throw new Error("workspaceId is required to create Conductor.");
  const ws = store.getWorkspace(workspaceId);
  if (!ws) throw new Error("workspace not found: " + workspaceId);
  const id = conductorAgentId(workspaceId);
  const existing = store.getAgent(id);
  const promptBundle = conductorPrompt();
  const now = nowIso();
  const versionId = conductorVersionId(workspaceId, 0);
  if (!store.getVersion(versionId)) {
    const payload = {
      agentId: id,
      parentVersionId: null,
      modelProfile: { provider: "none", model: "deterministic-orchestrator" },
      promptBundle: promptBundle,
      outputSchemaId: "conductor-plan-v0",
      retrievalPolicy: { enabled: false },
      curriculumSnapshotId: null,
      allowedTools: ["assign_existing_specialists", "track_execution"],
      declaredChange: "Initial Conductor freeze for this workspace. Not an Atlas, Scout, or Watcher prompt.",
      workspaceId: workspaceId,
    };
    store.putVersion({
      id: versionId,
      agentId: id,
      parentVersionId: null,
      modelProfile: payload.modelProfile,
      promptBundle: promptBundle,
      outputSchema: { "$id": "https://midas.local/schemas/conductor-plan-v0.json", "type": "object" },
      retrievalPolicy: payload.retrievalPolicy,
      curriculumSnapshotId: null,
      allowedTools: payload.allowedTools,
      createdAt: now,
      contentHash: contentHash(payload),
      declaredChange: payload.declaredChange,
      workspaceId: workspaceId,
      roleId: CONDUCTOR_ROLE_ID,
      immutable: true,
      orchestration: CONDUCTOR_ORCHESTRATION,
    });
  }
  const agent = {
    ...(existing || {}),
    id: id,
    name: CONDUCTOR_ROLE_NAME,
    createdAt: (existing && existing.createdAt) || now,
    roleId: CONDUCTOR_ROLE_ID,
    roleName: CONDUCTOR_ROLE_NAME,
    workspaceId: workspaceId,
    objective:
      "Translate an owner-approved business objective into a bounded plan, assign existing specialists, wait for required approvals, track execution, report verified outcomes.",
    boundaries: CONDUCTOR_MAY_NOT.slice(),
    permissions: { may: CONDUCTOR_MAY.slice(), mayNot: CONDUCTOR_MAY_NOT.slice() },
    versionHistory: [versionId],
    approvedKnowledgeAccess: "none",
    toolPermissions: ["assign_existing_specialists", "track_execution", "report_verified_outcomes"],
    status: "active",
    promptBundle: promptBundle,
    orchestration: CONDUCTOR_ORCHESTRATION,
    planMode: CONDUCTOR_PLAN_MODE,
    disclosure: CONDUCTOR_DISCLOSURE,
    note: "Conductor is a real workflow manager. Orchestration is deterministic. This is not Atlas, Scout, or Watcher renamed.",
  };
  store.putAgent(agent);
  if (store.putManagerActivity) {
    store.putManagerActivity({
      id: "MACT-" + id + "-ensure",
      workspaceId: workspaceId,
      agentId: id,
      at: now,
      kind: "agent_ensured",
      detail: "Conductor active for workspace " + workspaceId,
    });
  }
  return { agent: store.getAgent(id), version: store.getVersion(versionId) };
}

function hashObject(obj) {
  return contentHash(obj);
}

function publicSources(src) {
  const s = src || {};
  return {
    paste: s.paste ? "[owner-provided paste]" : null,
    hasPaste: Boolean(s.paste),
    urls: Array.isArray(s.urls) ? s.urls.slice() : [],
    existingSourceIds: Array.isArray(s.existingSourceIds) ? s.existingSourceIds.slice() : [],
    label: s.label || (s.paste ? "owner-provided operational knowledge" : ((s.urls && s.urls.length) ? "owner-provided public URLs" : "none")),
    searchEngine: false,
    livePublic: Boolean(s.livePublic) && !s.paste,
    neverRelabelOwnerPasteAsLivePublic: true,
  };
}

function publicObjective(store, o) {
  if (!o) return null;
  const copy = { ...o };
  if (copy.permittedSources) {
    copy.permittedSources = { ...copy.permittedSources };
    if (copy.permittedSources.paste) copy.permittedSources.paste = "[owner-provided paste]";
  }
  return copy;
}

export function submitObjective(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const ws = store.getWorkspace(workspaceId);
  if (!ws) throw new Error("workspace not found: " + workspaceId);
  const conductor = ensureConductor(store, workspaceId);
  const ownerText = String((payload && (payload.ownerText || payload.text || payload.objective)) || "").trim();
  if (ownerText.length < 12) throw new Error("Owner objective text is required.");
  const categoryHint = (payload && payload.category)
    || (isFounderBriefText(ownerText) ? FOUNDER_BRIEF_CATEGORY : null)
    || (isEvidenceLearningText(ownerText) ? EVIDENCE_LEARNING_CATEGORY : null);
  if (categoryHint === FOUNDER_BRIEF_CATEGORY || isFounderBriefText(ownerText)) {
    const existing = findMatchingFounderObjective(store, workspaceId, ownerText);
    if (existing) {
      return {
        objective: publicObjective(store, existing),
        reused: true,
        conductor: { id: conductor.agent.id, roleId: CONDUCTOR_ROLE_ID, versionId: conductor.version.id },
        authorized: existing.authorizations,
        disclosure: CONDUCTOR_DISCLOSURE,
      };
    }
  }
  const maxSpendUsd = payload && payload.maxSpendUsd != null ? Number(payload.maxSpendUsd) : 2;
  if (!Number.isFinite(maxSpendUsd) || maxSpendUsd < 0) throw new Error("maxSpendUsd must be a non-negative number.");
  if (payload && payload.raiseBudget === true) assertConductorMayNot("raise_own_budget");
  const permittedSources = {
    paste: (payload && (payload.paste || (payload.permittedSources && payload.permittedSources.paste))) || null,
    urls: (payload && payload.seedUrls) || (payload && payload.permittedSources && payload.permittedSources.urls) || [],
    existingSourceIds: (payload && payload.existingSourceIds) || (payload && payload.permittedSources && payload.permittedSources.existingSourceIds) || [],
    label: (payload && payload.sourceLabel) || (payload && payload.permittedSources && payload.permittedSources.label) || null,
    livePublic: Boolean(payload && payload.livePublic),
  };
  if (permittedSources.paste) {
    permittedSources.label = permittedSources.label || "owner-provided operational knowledge";
    permittedSources.livePublic = false;
  } else if (permittedSources.urls && permittedSources.urls.length) {
    permittedSources.label = permittedSources.label || "owner-provided public URLs";
    permittedSources.livePublic = payload && payload.livePublic === false ? false : true;
  }
  const scenario = (payload && (payload.permittedFictionalScenario || payload.fictionalScenario)) || null;
  const scenarioFreeze = scenario ? freezeFictionalScenario(scenario) : null;
  const founderBrief = categoryHint === FOUNDER_BRIEF_CATEGORY || isFounderBriefText(ownerText);
  const evidenceLearning = categoryHint === EVIDENCE_LEARNING_CATEGORY || isEvidenceLearningText(ownerText);
  const allowedRoles = Array.isArray(payload && payload.allowedRoles)
    ? payload.allowedRoles.slice()
    : (founderBrief ? ["offer_strategist", WATCHER_ROLE_ID, CONDUCTOR_ROLE_ID] : (evidenceLearning ? [SCOUT_ROLE_ID, "offer_strategist", WATCHER_ROLE_ID, CONDUCTOR_ROLE_ID] : ["atlas", SCOUT_ROLE_ID, WATCHER_ROLE_ID, CONDUCTOR_ROLE_ID]));
  const now = nowIso();
  const objective = {
    id: nextId(store, "OBJ-", () => store.listObjectives()),
    workspaceId: workspaceId,
    ownerText: ownerText,
    category: (payload && payload.category) || (founderBrief ? FOUNDER_BRIEF_CATEGORY : (evidenceLearning ? EVIDENCE_LEARNING_CATEGORY : "research_and_fictional_eval")),
    assignedRoleId: (payload && payload.assignedRoleId) || (founderBrief ? "offer_strategist" : (evidenceLearning ? SCOUT_ROLE_ID : null)),
    permittedSources: permittedSources,
    permittedSourcesPublic: publicSources(permittedSources),
    permittedFictionalScenario: scenario,
    fictionalScenarioHash: scenarioFreeze && scenarioFreeze.hash,
    fictionalScenarioFrozenAt: scenarioFreeze && scenarioFreeze.frozenAt,
    fictionalScenarioDisclosure: scenarioFreeze && scenarioFreeze.disclosure,
    requireLocalOwner: Boolean(payload && payload.requireLocalOwner) || evidenceLearning,
    maxSpendUsd: maxSpendUsd,
    allowedRoles: allowedRoles,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
    managerVersionId: conductor.version.id,
    managerAgentId: conductor.agent.id,
    planId: null,
    requiredApprovals: founderBrief ? [] : (evidenceLearning ? ["teaching_packet"] : ["scout_findings"]),
    completionSummaryId: null,
    paused: false,
    authorizations: {
      outreach: false,
      realProspects: false,
      purchases: false,
      newOwnerPolicy: false,
      promotion: false,
      otherWorkspace: false,
      unlimitedSpend: false,
    },
    note: "Submitting an objective does not authorize outreach, real prospects, purchases, new owner policies, promotion, other workspace, or unlimited spend.",
    orchestration: CONDUCTOR_ORCHESTRATION,
    correlationId: null,
  };
  objective.correlationId = objective.id;
  store.putObjective(objective);
  if (scenarioFreeze) {
    const util = recordExpectedUtility(store, {
      workspaceId: workspaceId,
      objectiveId: objective.id,
      consumingRole: "atlas",
      workspaceObjective: ownerText,
      expectedTaskType: "fictional_qualification",
      signalFamily: "estimating_workflow",
      affects: ["classification", "ranking", "explanation"],
      mandatory: false,
      whyExistingInsufficient: "Existing Atlas knowledge does not include this permitted public-source extract for the frozen fictional qualification task.",
      scenarioHash: scenarioFreeze.hash,
      disclosure: "Fictional RidgeLine qualification scenario frozen before Scout. Hypothesis, not proof. Reused existing fictional prospects; not tailored after seeing a finding.",
    });
    store.putObjective({ ...store.getObjective(objective.id), expectedUtilityId: util.id });
  }
  store.putManagerActivity({
    id: "MACT-" + objective.id + "-submit",
    workspaceId: workspaceId,
    agentId: conductor.agent.id,
    at: now,
    kind: "objective_submitted",
    objectiveId: objective.id,
    detail: ownerText.slice(0, 180),
  });
  return {
    objective: publicObjective(store, objective),
    conductor: { id: conductor.agent.id, roleId: CONDUCTOR_ROLE_ID, versionId: conductor.version.id },
    authorized: objective.authorizations,
    disclosure: CONDUCTOR_DISCLOSURE,
  };
}

function implementedRole(store, workspaceId, roleId) {
  if (roleId === "atlas") return Boolean(store.getAgent("atlas"));
  if (roleId === SCOUT_ROLE_ID || roleId === "scout") return Boolean(store.getAgent(scoutAgentId(workspaceId)));
  if (roleId === WATCHER_ROLE_ID) return Boolean(store.getAgent(watcherAgentId(workspaceId)));
  if (roleId === CONDUCTOR_ROLE_ID) return Boolean(store.getAgent(conductorAgentId(workspaceId)));
  if (roleId === "offer_strategist" && store.listEmployeeRoles) {
    return (store.listEmployeeRoles(workspaceId) || []).some((r) => r.roleId === "offer_strategist" && ["active_development", "evaluation_required", "development_verified"].includes(r.status));
  }
  return false;
}

export function resolveServingAtlasVersion(store, workspaceId) {
  const ws = workspaceId && store.getWorkspace ? store.getWorkspace(workspaceId) : null;
  if (ws && ws.servingAtlasVersionId && store.getVersion(ws.servingAtlasVersionId)) {
    return ws.servingAtlasVersionId;
  }
  const reviews = store.listVersionReviews ? store.listVersionReviews() : [];
  const ineligible = new Set(reviews.filter((r) => r.ineligibleForServing || r.ineligibleForPromotion).map((r) => r.versionId));
  const versions = ((store.listVersions && store.listVersions("atlas")) || []).filter((v) => /^atlas-v\d+$/.test(v.id));
  versions.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const eligible = versions.filter((v) => !ineligible.has(v.id) && v.versionRole !== "candidate_version");
  if (eligible.length) return eligible[eligible.length - 1].id;
  const frozen = versions.filter((v) => {
    const n = Number(String(v.id).replace("atlas-v", ""));
    return Number.isFinite(n) && n <= 15;
  });
  return frozen.length ? frozen[frozen.length - 1].id : (versions.length ? versions[versions.length - 1].id : null);
}

function roleVersionId(store, workspaceId, roleId) {
  if (roleId === "atlas") {
    return resolveServingAtlasVersion(store, workspaceId);
  }
  if (roleId === SCOUT_ROLE_ID) return scoutVersionId(workspaceId, 0);
  if (roleId === WATCHER_ROLE_ID) return watcherVersionId(workspaceId, 0);
  if (roleId === CONDUCTOR_ROLE_ID) return conductorVersionId(workspaceId, 0);
  if (roleId === "offer_strategist" || roleId === OFFER_STRATEGIST_ROLE_ID) {
    const roles = store.listEmployeeRoles ? (store.listEmployeeRoles(workspaceId) || []) : [];
    const role = roles.find((r) => r.roleId === "offer_strategist");
    return (role && role.versionId) || ("offer_strategist-" + workspaceId + "-v0");
  }
  return null;
}

export function isOfferStrategistObjective(objective) {
  if (!objective) return false;
  if (isFounderBriefObjective(objective)) return false;
  if (isEvidenceLearningObjective(objective)) return false;
  if (objective.category === "offer_strategist") return true;
  if (objective.assignedRoleId === "offer_strategist") return true;
  const allowed = objective.allowedRoles || [];
  if (allowed.includes("offer_strategist") && /propose one credible offer/i.test(String(objective.ownerText || ""))) return true;
  return false;
}

let tasksSoFar = [];
function resetTaskScratch() { tasksSoFar = []; }

export function buildFirstWorkflowPlan(store, objective) {
  const workspaceId = objective.workspaceId;
  ensureScout(store, workspaceId);
  ensureWatcher(store, workspaceId);
  ensureConductor(store, workspaceId);
  resetTaskScratch();
  const planId = nextId(store, "PLAN-", () => store.listPlans());
  const now = nowIso();
  const steps = [
    { key: "scout_research", type: "scout_research", assignedRoleId: SCOUT_ROLE_ID, assignedRoleName: SCOUT_ROLE_NAME, assignedAgentId: scoutAgentId(workspaceId), assignedVersionId: scoutVersionId(workspaceId, 0), allowedInputs: ["permitted_sources", "owner_text", "workspace_description"], expectedOutput: "proposed_findings_with_provenance", prerequisites: [], approvalRequirements: [], budgetUsd: Math.min(0.5, Number(objective.maxSpendUsd || 0)) },
    { key: "owner_review", type: "owner_review", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["scout_findings"], expectedOutput: "recorded_owner_or_demo_operator_approval", prerequisites: ["scout_research"], approvalRequirements: ["scout_findings"], budgetUsd: 0 },
    { key: "atlas_train", type: "atlas_train", assignedRoleId: "atlas", assignedRoleName: "Atlas", assignedAgentId: "atlas", assignedVersionId: roleVersionId(store, workspaceId, "atlas"), allowedInputs: ["approved_knowledge", "owner_train_authorization"], expectedOutput: "new_immutable_atlas_version_or_skip", prerequisites: ["owner_review"], approvalRequirements: ["atlas_train_authorization"], optional: true, budgetUsd: 0 },
    { key: "atlas_eval", type: "atlas_eval", assignedRoleId: "atlas", assignedRoleName: "Atlas", assignedAgentId: "atlas", assignedVersionId: roleVersionId(store, workspaceId, "atlas"), allowedInputs: ["permitted_fictional_scenario", "approved_workspace_knowledge"], expectedOutput: "workbench_run_raw_and_served", prerequisites: ["owner_review"], approvalRequirements: [], budgetUsd: Math.min(1.0, Number(objective.maxSpendUsd || 0)) },
    { key: "watcher_audit", type: "watcher_audit", assignedRoleId: WATCHER_ROLE_ID, assignedRoleName: WATCHER_ROLE_NAME, assignedAgentId: watcherAgentId(workspaceId), assignedVersionId: watcherVersionId(workspaceId, 0), allowedInputs: ["atlas_result", "approvals", "ledger", "provenance"], expectedOutput: "append_only_audit_report", prerequisites: ["atlas_eval"], approvalRequirements: [], budgetUsd: 0 },
    { key: "manager_summary", type: "manager_summary", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["task_records", "results", "approvals", "spend", "watcher"], expectedOutput: "verified_outcome_summary", prerequisites: ["watcher_audit"], approvalRequirements: [], budgetUsd: 0 },
  ];
  const tasks = steps.map((s, i) => {
    const id = nextId(store, "TSK-", () => store.listTasks().concat(tasksSoFar));
    const task = {
      id: id, objectiveId: objective.id, workspaceId: workspaceId, planId: planId, stepIndex: i, key: s.key,
      assignedRoleId: s.assignedRoleId, assignedRoleName: s.assignedRoleName, assignedAgentId: s.assignedAgentId,
      assignedVersionId: s.assignedVersionId, type: s.type, allowedInputs: s.allowedInputs, expectedOutput: s.expectedOutput,
      prerequisites: s.prerequisites, approvalRequirements: s.approvalRequirements, budgetUsd: s.budgetUsd,
      optional: Boolean(s.optional), status: "queued", attemptCount: 0, error: null, resultRefs: {}, dispatchId: null,
      lastDispatchId: null, createdAt: now, updatedAt: now,
    };
    tasksSoFar.push(task);
    return task;
  });
  const plan = {
    id: planId, objectiveId: objective.id, workspaceId: workspaceId, managerVersionId: objective.managerVersionId,
    createdAt: now, updatedAt: now, source: "deterministic_first_workflow", liveDraft: false, liveProposalId: null,
    taskIds: tasks.map((t) => t.id), stepTypes: tasks.map((t) => t.type), disclosure: CONDUCTOR_DISCLOSURE,
    bounded: true, maxSteps: MAX_PLAN_STEPS, maxRetries: MAX_RETRIES,
  };
  return { plan: plan, tasks: tasks };
}

export function buildOfferStrategistWorkflowPlan(store, objective) {
  const workspaceId = objective.workspaceId;
  ensureWatcher(store, workspaceId);
  ensureConductor(store, workspaceId);
  resetTaskScratch();
  const planId = nextId(store, "PLAN-", () => store.listPlans());
  const now = nowIso();
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const role = roles.find((r) => r.roleId === "offer_strategist");
  const versionId = (role && role.versionId) || ("offer_strategist-" + workspaceId + "-v0");
  const agentId = (role && role.agentId) || ("offer_strategist-" + workspaceId);
  const employeeCap = role && role.spendLimitUsd != null ? Number(role.spendLimitUsd) : 0.5;
  const budgetUsd = Math.min(employeeCap, Number(objective.maxSpendUsd || employeeCap));
  const steps = [
    { key: "offer_strategist", type: "offer_strategist", assignedRoleId: "offer_strategist", assignedRoleName: "Offer Strategist", assignedAgentId: agentId, assignedVersionId: versionId, allowedInputs: ["approved_workspace_knowledge", "owner_text"], expectedOutput: "structured_offer_or_refusal", prerequisites: [], approvalRequirements: [], budgetUsd: budgetUsd },
    { key: "watcher_audit", type: "watcher_audit", assignedRoleId: WATCHER_ROLE_ID, assignedRoleName: WATCHER_ROLE_NAME, assignedAgentId: watcherAgentId(workspaceId), assignedVersionId: watcherVersionId(workspaceId, 0), allowedInputs: ["offer_strategist_result", "ledger", "approved_knowledge"], expectedOutput: "append_only_audit_report", prerequisites: ["offer_strategist"], approvalRequirements: [], budgetUsd: 0 },
    { key: "manager_summary", type: "manager_summary", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["task_records", "results", "spend", "watcher"], expectedOutput: "verified_outcome_summary", prerequisites: ["watcher_audit"], approvalRequirements: [], budgetUsd: 0 },
  ];
  const tasks = steps.map((s, i) => {
    const id = nextId(store, "TSK-", () => store.listTasks().concat(tasksSoFar));
    const task = {
      id: id, objectiveId: objective.id, workspaceId: workspaceId, planId: planId, stepIndex: i, key: s.key,
      assignedRoleId: s.assignedRoleId, assignedRoleName: s.assignedRoleName, assignedAgentId: s.assignedAgentId,
      assignedVersionId: s.assignedVersionId, type: s.type, allowedInputs: s.allowedInputs, expectedOutput: s.expectedOutput,
      prerequisites: s.prerequisites, approvalRequirements: s.approvalRequirements, budgetUsd: s.budgetUsd,
      optional: false, status: "queued", attemptCount: 0, error: null, resultRefs: {}, dispatchId: null,
      lastDispatchId: null, createdAt: now, updatedAt: now,
    };
    tasksSoFar.push(task);
    return task;
  });
  const plan = {
    id: planId, objectiveId: objective.id, workspaceId: workspaceId, managerVersionId: objective.managerVersionId,
    createdAt: now, updatedAt: now, source: "deterministic_offer_strategist", liveDraft: false, liveProposalId: null,
    taskIds: tasks.map((t) => t.id), stepTypes: tasks.map((t) => t.type), disclosure: CONDUCTOR_DISCLOSURE,
    bounded: true, maxSteps: MAX_PLAN_STEPS, maxRetries: MAX_RETRIES,
  };
  return { plan: plan, tasks: tasks };
}


export function buildFounderBriefWorkflowPlan(store, objective) {
  const workspaceId = objective.workspaceId;
  ensureWatcher(store, workspaceId);
  ensureConductor(store, workspaceId);
  resetTaskScratch();
  const planId = nextId(store, "PLAN-", () => store.listPlans());
  const now = nowIso();
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const role = roles.find((r) => r.roleId === "offer_strategist");
  const versionId = (role && role.versionId) || ("offer_strategist-" + workspaceId + "-v0");
  const agentId = (role && role.agentId) || ("offer_strategist-" + workspaceId);
  const steps = [
    { key: "knowledge_sufficiency", type: "knowledge_sufficiency", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["approved_workspace_knowledge", "owner_text"], expectedOutput: "sufficiency_decision", prerequisites: [], approvalRequirements: [], budgetUsd: 0 },
    { key: "offer_strategist", type: "offer_strategist", assignedRoleId: "offer_strategist", assignedRoleName: "Offer Strategist", assignedAgentId: agentId, assignedVersionId: versionId, allowedInputs: ["approved_workspace_knowledge", "preserved_specialist_output"], expectedOutput: "reused_or_deterministic_offer", prerequisites: ["knowledge_sufficiency"], approvalRequirements: [], budgetUsd: 0 },
    { key: "founder_brief_assembly", type: "founder_brief_assembly", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["approved_workspace_knowledge", "offer_strategist_result", "sufficiency"], expectedOutput: "founder_opportunity_brief", prerequisites: ["offer_strategist"], approvalRequirements: [], budgetUsd: 0 },
    { key: "watcher_audit", type: "watcher_audit", assignedRoleId: WATCHER_ROLE_ID, assignedRoleName: WATCHER_ROLE_NAME, assignedAgentId: watcherAgentId(workspaceId), assignedVersionId: watcherVersionId(workspaceId, 0), allowedInputs: ["founder_brief", "offer_strategist_result", "approved_knowledge"], expectedOutput: "append_only_audit_report", prerequisites: ["founder_brief_assembly"], approvalRequirements: [], budgetUsd: 0 },
    { key: "manager_summary", type: "manager_summary", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["task_records", "brief", "spend", "watcher"], expectedOutput: "verified_outcome_summary", prerequisites: ["watcher_audit"], approvalRequirements: [], budgetUsd: 0 },
  ];
  const tasks = steps.map((s, i) => {
    const id = nextId(store, "TSK-", () => store.listTasks().concat(tasksSoFar));
    const task = {
      id: id, objectiveId: objective.id, workspaceId: workspaceId, planId: planId, stepIndex: i, key: s.key,
      assignedRoleId: s.assignedRoleId, assignedRoleName: s.assignedRoleName, assignedAgentId: s.assignedAgentId,
      assignedVersionId: s.assignedVersionId, type: s.type, allowedInputs: s.allowedInputs, expectedOutput: s.expectedOutput,
      prerequisites: s.prerequisites, approvalRequirements: s.approvalRequirements, budgetUsd: s.budgetUsd,
      optional: false, status: "queued", attemptCount: 0, error: null, resultRefs: {}, dispatchId: null,
      lastDispatchId: null, createdAt: now, updatedAt: now,
    };
    tasksSoFar.push(task);
    return task;
  });
  const plan = {
    id: planId, objectiveId: objective.id, workspaceId: workspaceId, managerVersionId: objective.managerVersionId,
    createdAt: now, updatedAt: now, source: "deterministic_founder_brief", liveDraft: false, liveProposalId: null,
    taskIds: tasks.map((t) => t.id), stepTypes: tasks.map((t) => t.type), disclosure: CONDUCTOR_DISCLOSURE,
    bounded: true, maxSteps: MAX_PLAN_STEPS, maxRetries: MAX_RETRIES, noScout: true, noAtlas: true, noOwnerInterrupt: true,
  };
  return { plan: plan, tasks: tasks };
}

export function validatePlan(store, plan, tasks, objective) {
  const issues = [];
  const unauthorized = [];
  const workspaceId = objective.workspaceId;
  if (!store.getWorkspace(workspaceId)) issues.push({ code: "missing_workspace", blocking: true, detail: "workspace not found" });
  if ((tasks || []).length > MAX_PLAN_STEPS) {
    issues.push({ code: "too_many_steps", blocking: true, detail: "Plan exceeds bounded step count " + MAX_PLAN_STEPS });
    unauthorized.push("too_many_steps");
  }
  const allowed = new Set(objective.allowedRoles || []);
  const reservedUnimplemented = ["marketing", "sales", "ops", "finance", "executive", "watcher", "opportunity_research"];
  for (const t of tasks || []) {
    const allowedTypes = isEvidenceLearningObjective(objective)
      ? EVIDENCE_LEARNING_WORKFLOW_TYPES
      : (isFounderBriefObjective(objective)
      ? FOUNDER_BRIEF_WORKFLOW_TYPES
      : (isOfferStrategistObjective(objective) ? OFFER_STRATEGIST_WORKFLOW_TYPES : FIRST_WORKFLOW_TYPES));
    if (!allowedTypes.includes(t.type)) {
      issues.push({ code: "unknown_task_type", blocking: true, stepId: t.id, detail: t.type });
      unauthorized.push(t.type);
    }
    if (!allowed.has(t.assignedRoleId) && t.assignedRoleId !== CONDUCTOR_ROLE_ID) {
      issues.push({ code: "role_not_allowed", blocking: true, stepId: t.id, detail: t.assignedRoleId });
      unauthorized.push(t.assignedRoleId);
    }
    if (reservedUnimplemented.includes(t.assignedRoleId)) {
      issues.push({ code: "missing_capability", blocking: true, stepId: t.id, detail: "Role " + t.assignedRoleId + " is not implemented. Conductor cannot invent employees." });
      unauthorized.push(t.assignedRoleId);
    }
    if (t.assignedRoleId === "offer_strategist") {
      const assign = canAssignEmployee(store, { workspaceId: workspaceId, roleId: "offer_strategist", taskKind: "supervised_internal" });
      if (!assign.ok) {
        issues.push({ code: "unauthorized_employee", blocking: true, stepId: t.id, detail: assign.detail });
        unauthorized.push("offer_strategist");
      }
    }
    if (t.type === "outreach" || /outreach/.test(String(t.type))) {
      issues.push({ code: "outreach_forbidden", blocking: true, stepId: t.id, detail: "Outreach is not authorized by submitting an objective." });
      unauthorized.push("outreach");
    }
    if (t.type === "create_owner_policy") {
      issues.push({ code: "policy_without_owner", blocking: true, stepId: t.id });
      unauthorized.push("create_owner_policy");
    }
    if (t.type === "promote") {
      issues.push({ code: "promotion_forbidden", blocking: true, stepId: t.id });
      unauthorized.push("promote");
    }
    if (t.workspaceId && t.workspaceId !== workspaceId) {
      issues.push({ code: "other_workspace", blocking: true, stepId: t.id });
      unauthorized.push("other_workspace");
    }
    if (t.budgetUsd != null && Number(t.budgetUsd) > Number(objective.maxSpendUsd || 0)) {
      issues.push({ code: "budget_over_ceiling", blocking: true, stepId: t.id, detail: String(t.budgetUsd) });
    }
    for (const pre of t.prerequisites || []) {
      const found = (tasks || []).some((x) => x.key === pre || x.type === pre || x.id === pre);
      if (!found) issues.push({ code: "missing_prerequisite", blocking: true, stepId: t.id, detail: pre });
    }
  }
  const hasOwnerReview = (tasks || []).some((t) => t.type === "owner_review" || (t.approvalRequirements || []).includes("scout_findings"));
  const hasScout = (tasks || []).some((t) => t.type === "scout_research");
  if (hasScout && !hasOwnerReview && !isOfferStrategistObjective(objective) && !isFounderBriefObjective(objective)) {
    issues.push({ code: "bypass_owner_review", blocking: true, detail: "Scout findings require owner review. Conductor cannot skip approval." });
    unauthorized.push("bypass_owner_review");
  }
  const hasAtlas = (tasks || []).some((t) => t.type === "atlas_eval");
  const hasWatcher = (tasks || []).some((t) => t.type === "watcher_audit");
  if (hasAtlas && !hasWatcher) {
    issues.push({ code: "bypass_watcher", blocking: true, detail: "Atlas result requires Watcher audit. Conductor cannot bypass Watcher." });
    unauthorized.push("bypass_watcher");
  }
  const src = objective.permittedSources || {};
  const hasSource = Boolean(src.paste) || (src.urls && src.urls.length) || (src.existingSourceIds && src.existingSourceIds.length);
  if (hasScout && !hasSource && !isOfferStrategistObjective(objective) && !isFounderBriefObjective(objective)) issues.push({ code: "no_source", blocking: true, detail: "No permitted source. " + RESEARCH_LABEL });
  if (hasAtlas && !objective.permittedFictionalScenario && !isOfferStrategistObjective(objective) && !isFounderBriefObjective(objective)) issues.push({ code: "no_fictional_case", blocking: true, detail: "No fictional scenario. Atlas cannot pretend it ran." });
  if (src.paste && src.livePublic === true) issues.push({ code: "source_relabel", blocking: true, detail: "Owner-provided paste cannot be relabeled live public." });
  if (src.searchEngine === true) issues.push({ code: "search_claim", blocking: true, detail: "No search-engine claim is allowed." });
  return { ok: issues.filter((i) => i.blocking).length === 0, issues: issues, unauthorized: unauthorized };
}

export function repairPlan(store, plan, tasks, objective, validation) {
  const drop = new Set();
  for (const code of validation.unauthorized || []) {
    for (const t of tasks) {
      if (t.type === code || t.assignedRoleId === code || code === "outreach" || code === "promote" || code === "create_owner_policy") {
        if (!FIRST_WORKFLOW_TYPES.includes(t.type) || code === "outreach" || code === "promote" || code === "create_owner_policy") drop.add(t.id);
      }
    }
  }
  const nextTasks = tasks.filter((t) => !drop.has(t.id));
  const hasScout = nextTasks.some((t) => t.type === "scout_research");
  const hasReview = nextTasks.some((t) => t.type === "owner_review");
  const hasAtlas = nextTasks.some((t) => t.type === "atlas_eval");
  const hasWatcher = nextTasks.some((t) => t.type === "watcher_audit");
  if ((hasScout && !hasReview) || (hasAtlas && !hasWatcher) || !nextTasks.length) {
    const built = buildFirstWorkflowPlan(store, objective);
    return { plan: built.plan, tasks: built.tasks, repaired: true, dropped: [...drop], note: "Invalid live plan repaired to deterministic first workflow. Unauthorized steps not executed." };
  }
  return { plan: { ...plan, source: "repaired_deterministic", liveDraft: false }, tasks: nextTasks, repaired: true, dropped: [...drop], note: "Unauthorized live-plan steps dropped." };
}

export function persistPlan(store, objective, plan, tasks) {
  resetTaskScratch();
  for (const t of tasks) store.putTask(t);
  store.putPlan(plan);
  const now = nowIso();
  store.putObjective({ ...objective, planId: plan.id, status: "planned", updatedAt: now, plan: { id: plan.id, source: plan.source, stepTypes: plan.stepTypes, disclosure: plan.disclosure } });
  store.putManagerActivity({
    id: "MACT-" + plan.id + "-plan", workspaceId: objective.workspaceId, agentId: objective.managerAgentId, at: now,
    kind: "plan_persisted", objectiveId: objective.id, detail: plan.source + " steps=" + tasks.length,
  });
  return { plan: plan, tasks: tasks, objective: store.getObjective(objective.id) };
}

export async function planObjective(store, objectiveId, opts) {
  resetTaskScratch();
  const objective = store.getObjective(objectiveId);
  if (!objective) throw new Error("objective not found: " + objectiveId);
  ensureConductor(store, objective.workspaceId);
  const built = isEvidenceLearningObjective(objective)
    ? buildEvidenceLearningWorkflowPlan(store, objective)
    : (isFounderBriefObjective(objective)
    ? buildFounderBriefWorkflowPlan(store, objective)
    : (isOfferStrategistObjective(objective)
      ? buildOfferStrategistWorkflowPlan(store, objective)
      : buildFirstWorkflowPlan(store, objective)));
  let plan = built.plan;
  let tasks = built.tasks;
  let liveProposal = null;
  if (opts && opts.livePlan && typeof opts.responder === "function") {
    try {
      const raw = await opts.responder({ role: "conductor", objective: objective.ownerText, instruction: "Propose a bounded JSON plan using only existing specialists." });
      liveProposal = typeof raw === "string" ? JSON.parse(raw) : raw;
      const usage = raw && raw._usage;
      recordUsage(store, {
        workspaceId: objective.workspaceId, agentId: objective.managerAgentId, role: CONDUCTOR_ROLE_ID, version: objective.managerVersionId,
        operation: "manager_plan", kind: "live", model: (opts && opts.model) || null,
        inputTokens: usage && usage.inputTokens, outputTokens: usage && usage.outputTokens, resultStatus: "ok",
        note: "Live plan draft only. Not executed until validated.",
      });
    } catch (err) {
      liveProposal = { error: err instanceof Error ? err.message : String(err), executed: false };
    }
  } else if (opts && opts.injectedLivePlan) {
    liveProposal = opts.injectedLivePlan;
  }
  if (liveProposal && liveProposal.tasks) {
    const candidateTasks = (liveProposal.tasks || []).map((t, i) => ({
      ...t, id: t.id || ("TSK-LIVE-" + String(i + 1).padStart(3, "0")),
      objectiveId: objective.id, workspaceId: objective.workspaceId, status: "queued", attemptCount: 0, error: null, resultRefs: {},
    }));
    const candidatePlan = { ...plan, source: "live_draft", liveDraft: true, liveProposal: liveProposal };
    const v = validatePlan(store, candidatePlan, candidateTasks, objective);
    if (!v.ok) {
      const repaired = repairPlan(store, candidatePlan, candidateTasks, objective, v);
      plan = { ...repaired.plan, liveProposal: liveProposal, liveProposalRejected: true, repairNote: repaired.note };
      tasks = repaired.tasks;
      store.putManagerActivity({
        id: "MACT-" + objective.id + "-repair", workspaceId: objective.workspaceId, agentId: objective.managerAgentId,
        at: nowIso(), kind: "live_plan_repaired", objectiveId: objective.id, detail: repaired.note,
      });
    } else {
      plan = candidatePlan;
      tasks = candidateTasks;
    }
  }
  const v2 = validatePlan(store, plan, tasks, objective);
  if (!v2.ok) {
    const blocking = v2.issues.filter((i) => i.blocking);
    store.putObjective({ ...objective, status: "blocked", updatedAt: nowIso(), blockedIssues: blocking, liveProposal: liveProposal });
    return { objective: store.getObjective(objective.id), plan: plan, tasks: tasks, validation: v2, blocked: true, disclosure: CONDUCTOR_DISCLOSURE };
  }
  const persisted = persistPlan(store, store.getObjective(objective.id), plan, tasks);
  recordUsage(store, {
    workspaceId: objective.workspaceId, agentId: objective.managerAgentId, role: CONDUCTOR_ROLE_ID, version: objective.managerVersionId,
    operation: "manager_plan", kind: "fixture", resultStatus: "ok", note: "Deterministic plan persist. Cost unknown.",
    objectiveId: objective.id,
  });
  return { ...persisted, validation: v2, liveProposal: liveProposal, disclosure: CONDUCTOR_DISCLOSURE };
}

function objectiveSpend(store, objective) {
  const view = ownerSpendView(store, objective.workspaceId);
  const entries = (view.entries || []).filter((e) => e.objectiveId === objective.id);
  const estimatedUsd = entries.filter((e) => e.costStatus === "estimated" && e.costUsd != null).reduce((s, e) => s + Number(e.costUsd || 0), 0);
  const byRole = {};
  const byOp = {};
  for (const e of entries) {
    const r = e.role || "unknown";
    const op = e.operation || "unknown";
    byRole[r] = (byRole[r] || 0) + (e.costUsd || 0);
    byOp[op] = (byOp[op] || 0) + (e.costUsd || 0);
  }
  return {
    maxSpendUsd: Number(objective.maxSpendUsd || 0),
    estimatedUsd: Math.round(estimatedUsd * 1e6) / 1e6,
    remainingUsd: Math.round((Number(objective.maxSpendUsd || 0) - estimatedUsd) * 1e6) / 1e6,
    byRole: byRole, byOp: byOp, entryCount: entries.length,
    unknownCostCount: entries.filter((e) => e.costStatus === "unknown").length,
  };
}

function tagLedger(store, workspaceId, objectiveId, sinceIso) {
  if (!store.listSpendLedger || !store.putSpendLedgerEntry) return;
  for (const e of store.listSpendLedger(workspaceId) || []) {
    if (e.objectiveId) continue;
    if (String(e.timestamp || "") >= sinceIso) store.putSpendLedgerEntry({ ...e, objectiveId: objectiveId });
  }
}

function setTask(store, task, patch) {
  const next = { ...task, ...patch, updatedAt: nowIso() };
  store.putTask(next);
  return store.getTask(next.id);
}

function depsSatisfied(store, task, tasks) {
  const byKey = Object.fromEntries(tasks.map((t) => [t.key, t]));
  for (const pre of task.prerequisites || []) {
    const p = byKey[pre] || tasks.find((t) => t.id === pre || t.type === pre);
    if (!p) return false;
    if (p.optional && (p.status === "canceled" || p.status === "blocked")) continue;
    if (p.status !== "completed" && p.status !== "approved") return false;
  }
  return true;
}

function supportableFindings(findings) {
  return (findings || []).filter((f) => {
    if (!f) return false;
    if (f.kind === "unresolved_question") return false;
    if (f.reviewStatus === "omitted") return false;
    if (f.approvalEligible === false) return false;
    const flags = f.flags || [];
    if (flags.includes("missing_support") && f.kind !== "inference") return false;
    if (flags.includes("off_objective")) return false;
    if (flags.includes("boilerplate")) return false;
    return Boolean(f.claim);
  });
}

function latestFindings(store, refs) {
  const ids = (refs && refs.findingIds) || ((refs && refs.findings) || []).map((f) => f && f.id).filter(Boolean);
  return ids.map((id) => store.getScoutFinding(id)).filter(Boolean);
}

function cleanupNoActionDownstream(store, objective, tasks, reason) {
  const now = nowIso();
  for (const t of tasks || []) {
    if ((t.type === "atlas_train" || t.type === "atlas_eval") && ["queued", "running"].includes(t.status)) {
      setTask(store, t, {
        status: "completed",
        resultRefs: { skipped: true, reason: reason || "no_actionable_evidence", ownerPrompt: false, train: false },
      });
    }
  }
  const obj = store.getObjective(objective.id);
  store.putObjective({
    ...obj,
    terminalStatus: "completed_no_actionable_evidence",
    updatedAt: now,
    pendingApprovalId: null,
    authorizeAtlasTrain: false,
  });
}

export function createApprovalRequest(store, objective, task, kind, objectRef) {
  const content = objectRef && objectRef.content != null ? objectRef.content : objectRef;
  const digest = hashObject(content);
  const now = nowIso();
  const req = {
    id: nextId(store, "APR-", () => store.listApprovalRequests()),
    workspaceId: objective.workspaceId, objectiveId: objective.id, stepId: task.id, kind: kind,
    objectType: (objectRef && objectRef.objectType) || kind, objectId: (objectRef && objectRef.objectId) || null,
    content: content, contentHash: digest, revision: (objectRef && objectRef.revision) || 1, status: "pending",
    createdAt: now,
    actorRequired: (objective.requireLocalOwner ? ["local_owner"] : ["local_owner", "owner", "demo_operator"]),
    requireLocalOwner: Boolean(objective.requireLocalOwner),
    note: objective.requireLocalOwner
      ? "Waiting for local_owner in the control room. demo_operator cannot decide this live Mission approval."
      : "Conductor cannot approve this. Scripted demo actions must be labeled demo_operator, never Mason.",
  };
  store.putApprovalRequest(req);
  setTask(store, task, { status: "awaiting_owner_approval", resultRefs: { ...(task.resultRefs || {}), approvalRequestId: req.id, contentHash: digest } });
  store.putObjective({ ...store.getObjective(objective.id), status: "awaiting_owner_approval", updatedAt: now, pendingApprovalId: req.id });
  store.putManagerActivity({
    id: "MACT-" + req.id, workspaceId: objective.workspaceId, agentId: objective.managerAgentId, at: now,
    kind: "approval_requested", objectiveId: objective.id, detail: kind + " hash=" + digest.slice(0, 12),
  });
  return req;
}

export function decideApproval(store, requestId, payload) {
  const req = store.getApprovalRequest(requestId);
  if (!req) throw new Error("approval request not found: " + requestId);
  const resolved = resolveActorType(payload, payload && payload.session);
  const actor = resolved.actor;
  const actorType = resolved.actorType;
  assertNotConductorActor(actor, "approve or reject findings");
  rejectMasonClaim(actor, actorType);
  if (actor !== "owner" && actor !== "demo_operator" && actor !== "local_owner") {
    const err = new Error("Only local_owner, owner, or labeled demo_operator may decide this approval. Never claim Mason personally approved a scripted action.");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
  if (req.requireLocalOwner && actorType !== "local_owner") {
    const err = new Error("This approval requires a real local_owner session. demo_operator cannot masquerade as local_owner.");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
  const currentHash = hashObject(req.content);
  if (payload && payload.expectedHash && payload.expectedHash !== currentHash) {
    throw new Error("Approval hash mismatch. Revised content after approval is a new hash; old approval does not cover it.");
  }
  if (currentHash !== req.contentHash) {
    throw new Error("Request content changed since it was issued. Old approval does not cover the new hash.");
  }
  const action = String((payload && payload.action) || "").toLowerCase();
  if (action !== "approve" && action !== "reject") throw new Error("action must be approve or reject");
  const now = nowIso();
  const decision = {
    id: nextId(store, "APD-", () => store.listApprovalDecisions()),
    workspaceId: req.workspaceId, objectiveId: req.objectiveId, stepId: req.stepId, requestId: req.id,
    action: action, actorId: actor, actorType: actorType,
    actorIdentity: actorType === "local_owner" ? "local_owner" : (actorType === "demo_operator" ? "demo_operator" : actor),
    securityClaim: actorType === "local_owner" ? "local session, not enterprise IAM" : "scripted or in-process actor; not enterprise IAM",
    exactObject: { objectType: req.objectType, objectId: req.objectId, kind: req.kind },
    contentHash: currentHash, revision: req.revision, timestamp: now, note: (payload && payload.note) || null,
    authorizeAtlasTrain: Boolean(payload && payload.authorizeAtlasTrain),
    assignToAtlas: payload && payload.assignToAtlas !== false,
  };
  store.putApprovalDecision(decision);
  store.putApprovalRequest({ ...req, status: action === "approve" ? "approved" : "rejected", decidedAt: now, decisionId: decision.id });
  const task = store.getTask(req.stepId);
  const objective = store.getObjective(req.objectiveId);
  if (req.kind === "teaching_packet" || req.objectType === "teaching_packet") {
    const packet = store.getTeachingPacket && store.getTeachingPacket(req.objectId);
    if (packet) {
      if (action === "reject") {
        store.putTeachingPacket({ ...packet, status: "rejected", reviewerIdentity: { actor: actor, actorType: actorType } });
      } else {
        verifyTeachingPacket(store, packet.id, { actor: actor, actorType: actorType, session: payload && payload.session, status: "approved_for_supervised_use" });
      }
    }
    if (action === "reject") {
      if (task) setTask(store, task, { status: "rejected", error: "Owner rejected teaching packet.", resultRefs: { ...(task.resultRefs || {}), decisionId: decision.id } });
      store.putObjective({ ...objective, status: "rejected", terminalStatus: "rejected_by_owner", updatedAt: now, pendingApprovalId: null });
      return { decision: decision, request: store.getApprovalRequest(req.id), task: task && store.getTask(task.id), note: "Teaching packet rejected. Not secretly approved." };
    }
    if (task) setTask(store, task, { status: "completed", resultRefs: { ...(task.resultRefs || {}), decisionId: decision.id, packetId: req.objectId } });
    store.putObjective({ ...objective, status: "running", updatedAt: now, pendingApprovalId: null });
    return { decision: decision, request: store.getApprovalRequest(req.id), task: task && store.getTask(task.id), packetId: req.objectId };
  }
  if (action === "reject") {
    setTask(store, task, { status: "rejected", error: "Owner or demo_operator rejected.", resultRefs: { ...(task.resultRefs || {}), decisionId: decision.id } });
    store.putObjective({ ...objective, status: "rejected", terminalStatus: "rejected_by_owner", updatedAt: now, pendingApprovalId: null, completionSummary: "Rejected. Conductor did not secretly approve. Atlas does not receive rejected knowledge." });
    return { decision: decision, request: store.getApprovalRequest(req.id), task: store.getTask(task.id), note: "Rejected. Manager does not secretly approve." };
  }
  const findings = (req.content && req.content.findings) || [];
  const material = findings.filter((f) => f.kind !== "unresolved_question" && f.kind !== "owner_policy_suggestion");
  const applied = [];
  const blockedEvidence = [];
  for (const f of material) {
    const latest = store.getScoutFinding(f.id);
    if (!latest) continue;
    const src = latest.sourceId && store.getSource ? store.getSource(latest.sourceId) : null;
    const support = latest.support || checkSourceSupport({
      claim: latest.claim,
      excerpt: latest.excerpt,
      sourceText: src && (src.substantiveText || src.excerpt),
      sourceId: latest.sourceId,
      contentChecksum: src && src.sha256,
      locator: latest.locator,
      kind: latest.kind,
      presentAsFact: latest.kind === "source_backed_fact",
    });
    const evidenceGate = ownerCannotOverrideEvidence(support);
    if (action === "approve" && latest.kind === "source_backed_fact" && !evidenceGate.allowed) {
      blockedEvidence.push({ id: latest.id, reason: evidenceGate.reason, note: evidenceGate.note });
      continue;
    }
    if (latest.reviewStatus === "approved") { applied.push({ id: latest.id, already: true }); continue; }
    const out = reviewFinding(store, f.id, { actor: actor, action: "approve", assignToAtlas: decision.assignToAtlas && evidenceGate.allowed !== false, note: "Recorded via Conductor approval gate. Actor=" + actorType });
    applied.push({ id: f.id, knowledgeItemId: out.finding && out.finding.knowledgeItemId, supportStatus: support.supportStatus });
  }
  if (action === "approve" && !applied.length && blockedEvidence.length) {
    setTask(store, task, { status: "completed", resultRefs: { ...(task.resultRefs || {}), decisionId: decision.id, applied: [], blockedEvidence: blockedEvidence, authorizeAtlasTrain: false, outcome: "source_insufficient" } });
    store.putObjective({ ...store.getObjective(req.objectiveId), status: "running", updatedAt: now, pendingApprovalId: null, authorizeAtlasTrain: false, completionHint: "source_insufficient" });
    return { decision: decision, request: store.getApprovalRequest(req.id), task: store.getTask(task.id), applied: [], blockedEvidence: blockedEvidence, note: "Approval recorded. Hard evidence failures remain ineligible as source-backed facts." };
  }
  setTask(store, task, { status: "completed", resultRefs: { ...(task.resultRefs || {}), decisionId: decision.id, applied: applied, authorizeAtlasTrain: decision.authorizeAtlasTrain } });
  store.putObjective({ ...store.getObjective(req.objectiveId), status: "running", updatedAt: now, pendingApprovalId: null, authorizeAtlasTrain: decision.authorizeAtlasTrain });
  store.putManagerActivity({
    id: "MACT-" + decision.id, workspaceId: req.workspaceId, agentId: objective.managerAgentId, at: now,
    kind: "approval_recorded", objectiveId: req.objectiveId, detail: actorType + " approved " + req.kind + " hash=" + currentHash.slice(0, 12),
  });
  try {
    recordContribution(store, {
      kind: "approval_gate_respected",
      role: CONDUCTOR_ROLE_ID,
      agentId: objective.managerAgentId,
      workspaceId: req.workspaceId,
      evidence: { approvalId: decision.id, objectiveId: req.objectiveId, taskId: task.id },
      note: actorType + " approved " + req.kind,
    });
  } catch { /* additive */ }
  return { decision: decision, request: store.getApprovalRequest(req.id), task: store.getTask(task.id), applied: applied };
}

function stopReasons(store, objective, tasks) {
  const reasons = [];
  const src = objective.permittedSources || {};
  const hasSource = Boolean(src.paste) || (src.urls && src.urls.length) || (src.existingSourceIds && src.existingSourceIds.length);
  const scoutTask = tasks.find((t) => t.type === "scout_research");
  if (scoutTask && scoutTask.status === "queued" && !hasSource) reasons.push({ code: "no_source", blocking: true, detail: RESEARCH_LABEL });
  if (scoutTask && scoutTask.status === "completed") {
    const findings = (scoutTask.resultRefs && scoutTask.resultRefs.findings) || [];
    if (!supportableFindings(findings).length) reasons.push({ code: "no_supportable_findings", blocking: true });
  }
  if (tasks.some((t) => t.status === "awaiting_owner_approval")) reasons.push({ code: "approval_pending", blocking: true });
  if (tasks.some((t) => t.status === "rejected") || objective.status === "rejected") reasons.push({ code: "reject", blocking: true });
  const spend = objectiveSpend(store, objective);
  if (spend.estimatedUsd - spend.maxSpendUsd > 1e-9) reasons.push({ code: "budget_out", blocking: true });
  const atlasTask = tasks.find((t) => t.type === "atlas_eval");
  if (atlasTask && atlasTask.status === "queued" && !objective.permittedFictionalScenario) {
    reasons.push({ code: "atlas_cannot_run", blocking: true, detail: "No fictional scenario." });
  }
  const watch = tasks.find((t) => t.type === "watcher_audit");
  if (watch && watch.status === "completed") {
    const status = watch.resultRefs && watch.resultRefs.status;
    const blocking = watch.resultRefs && watch.resultRefs.blocking;
    if (status === "VIOLATION" || (Array.isArray(blocking) && blocking.length)) {
      reasons.push({ code: "watcher_material_violation", blocking: true, detail: status });
    }
  }
  if (tasks.some((t) => t.workspaceId && t.workspaceId !== objective.workspaceId)) reasons.push({ code: "cross_workspace", blocking: true });
  return reasons;
}

async function dispatchScout(store, objective, task, deps) {
  const src = objective.permittedSources || {};
  if (!src.paste && !(src.urls && src.urls.length) && !(src.existingSourceIds && src.existingSourceIds.length)) {
    return setTask(store, task, { status: "blocked", error: "No permitted source. " + RESEARCH_LABEL });
  }
  const since = nowIso();
  const hasUrls = Boolean(src.urls && src.urls.length);
  const liveExtract = Boolean(deps && deps.live && typeof deps.responder === "function" && deps.scoutLive);
  const forceFixture = Boolean(deps && (deps.forceFixture || deps.fixture)) && !hasUrls;
  const out = await runScoutResearch(store, {
    workspaceId: objective.workspaceId, question: objective.ownerText, paste: src.paste || undefined,
    seedUrls: src.urls || [], existingSourceIds: src.existingSourceIds || [],
    fixture: forceFixture,
    fixtureBody: deps && deps.fixtureBody,
    urlFixtures: deps && deps.urlFixtures,
    livePublic: Boolean(src.livePublic) && hasUrls && !src.paste,
    maxSpendUsd: Math.min(task.budgetUsd || 0.5, Math.max(0, objectiveSpend(store, objective).remainingUsd)),
    categories: ["buying_signal", "estimating"],
    context: "Conductor-assigned Scout research. Permitted sources only. No search engine.",
  }, liveExtract ? { live: true, responder: deps.responder, model: deps.model } : {});
  tagLedger(store, objective.workspaceId, objective.id, since);
  const req = store.getResearchRequest(out.request.id);
  if (req) {
    store.putResearchRequest({
      ...req,
      originLabel: src.paste ? (src.label || "owner-provided operational knowledge") : (hasUrls ? "owner-provided public URLs" : (src.label || "permitted sources")),
      sourceKind: src.paste ? "owner-provided operational knowledge" : (hasUrls ? "owner-provided public URLs" : "permitted sources"),
      searchEngine: false,
      neverUpgradedFromFixture: true,
      livePublic: Boolean(src.livePublic) && hasUrls && !src.paste,
      objectiveId: objective.id,
    });
  }
  const findings = out.findings || [];
  const supportable = supportableFindings(findings);
  const eligible = findings.filter((f) => f.approvalEligible === true);
  const refs = {
    requestId: out.request.id, findingIds: findings.map((f) => f.id),
    findings: findings.map((f) => ({
      id: f.id, kind: f.kind, claim: f.claim, excerpt: f.excerpt, reviewStatus: f.reviewStatus,
      sourceClassification: f.sourceClassification || null, approvalEligible: f.approvalEligible === true,
      omissionReason: f.omissionReason || null,
    })),
    live: Boolean(out.live), fixture: !out.live, searchEngine: false,
    originLabel: src.paste ? (src.label || "owner-provided operational knowledge") : (hasUrls ? "owner-provided public URLs" : (src.label || "permitted sources")),
    seedUrls: src.urls || [],
    livePublic: Boolean(src.livePublic) && hasUrls && !src.paste,
    approvalEligibleCount: eligible.length,
    usefulnessReviewId: out.usefulness && out.usefulness.id || (out.request && out.request.usefulnessReviewId) || null,
    briefId: out.brief && out.brief.id || (out.request && out.request.briefId) || null,
    terminalReason: eligible.length ? null : "no_actionable_evidence",
    noActionableEvidence: eligible.length === 0,
  };
  try {
    recordContribution(store, {
      kind: "specialist_task_completed",
      role: CONDUCTOR_ROLE_ID,
      agentId: objective.managerAgentId,
      workspaceId: objective.workspaceId,
      evidence: { taskId: task.id, objectiveId: objective.id },
      note: "scout_research",
    });
  } catch { /* additive */ }
  return setTask(store, task, { status: "completed", resultRefs: { ...refs, supportableCount: supportable.length, extractionInsufficient: !supportable.length } });
}

async function dispatchOwnerReview(store, objective, task, tasks) {
  const scout = tasks.find((t) => t.type === "scout_research");
  const stored = latestFindings(store, scout && scout.resultRefs);
  const listed = (scout && scout.resultRefs && scout.resultRefs.findings) || [];
  const findings = stored.length ? stored : listed;
  if (task.status === "awaiting_owner_approval" || task.status === "completed" || task.status === "approved") return task;
  const eligible = findings.filter((f) => f.approvalEligible === true && f.reviewStatus === "proposed");
  if (!eligible.length) {
    const reason = (scout && scout.resultRefs && scout.resultRefs.terminalReason) || "no_actionable_evidence";
    cleanupNoActionDownstream(store, objective, tasks, reason);
    try {
      recordContribution(store, {
        kind: "research_stopped_irrelevant",
        role: CONDUCTOR_ROLE_ID,
        agentId: objective.managerAgentId,
        workspaceId: objective.workspaceId,
        evidence: { objectiveId: objective.id, taskId: task.id },
        note: "Conductor correctly stopped: no approval-eligible finding for the current question. No owner prompt. No train.",
      });
    } catch { /* additive */ }
    return setTask(store, task, {
      status: "completed",
      resultRefs: {
        skipped: true,
        reason: reason,
        approvalEligibleCount: 0,
        ownerPrompt: false,
        usefulnessReviewId: scout && scout.resultRefs && scout.resultRefs.usefulnessReviewId || null,
      },
    });
  }
  createApprovalRequest(store, objective, task, "scout_findings", {
    objectType: "scout_findings", objectId: scout && scout.resultRefs && scout.resultRefs.requestId,
    content: { findings: eligible, requestId: scout && scout.resultRefs && scout.resultRefs.requestId },
  });
  return store.getTask(task.id);
}

async function dispatchTrain(store, objective, task, tasks, deps) {
  const review = tasks.find((t) => t.type === "owner_review");
  if (review && review.resultRefs && review.resultRefs.skipped && review.resultRefs.reason === "no_actionable_evidence") {
    return setTask(store, task, { status: "completed", resultRefs: { skipped: true, reason: "no_actionable_evidence", train: false } });
  }
  const authorized = Boolean((review && review.resultRefs && review.resultRefs.authorizeAtlasTrain) || objective.authorizeAtlasTrain || (deps && deps.authorizeAtlasTrain));
  if (!authorized) {
    return setTask(store, task, { status: "canceled", error: null, resultRefs: { skipped: true, reason: "optional_not_authorized" } });
  }
  const parent = (deps && deps.parentVersionId)
    || (store.getVersion("atlas-v14") ? "atlas-v14" : (store.getVersion("atlas-v13") ? "atlas-v13" : roleVersionId(store, objective.workspaceId, "atlas")));
  const since = nowIso();
  const actor = (deps && deps.trainActor) || "demo_operator";
  assertNotConductorActor(actor, "freeze an Atlas version");
  const trained = trainAtlasFromScout(store, {
    actor: actor, workspaceId: objective.workspaceId, parentVersionId: parent,
    objectiveId: objective.id,
    objectiveText: objective.ownerText,
    skipUsefulness: Boolean(deps && deps.skipUsefulness),
    forceTrain: Boolean(deps && deps.forceTrain),
    declaredChange: "Owner/demo_operator authorized Scout-approved knowledge freeze. Parent unchanged. Not a promotion.",
    testKind: (deps && deps.live) ? "live" : "fixture",
  });
  tagLedger(store, objective.workspaceId, objective.id, since);
  if (trained && trained.skipped) {
    try {
      recordContribution(store, {
        kind: "duplicate_retraining_avoided",
        role: CONDUCTOR_ROLE_ID,
        agentId: objective.managerAgentId,
        workspaceId: objective.workspaceId,
        evidence: { objectiveId: objective.id, taskId: task.id, versionId: trained.version && trained.version.id, usefulnessId: trained.usefulness && trained.usefulness.id },
        note: trained.reason || "no_meaningful_change",
      });
    } catch { /* additive */ }
    return setTask(store, task, {
      status: "completed",
      resultRefs: {
        skipped: true,
        reason: trained.reason || "no_meaningful_change",
        usefulness: trained.usefulness,
        versionId: trained.version && trained.version.id,
        parentVersionId: parent,
        promotion: false,
        note: "Usefulness check skipped a new Atlas version. Existing version kept.",
      },
    });
  }
  return setTask(store, task, {
    status: "completed",
    resultRefs: {
      versionId: trained.version.id, parentVersionId: trained.version.parentVersionId, contentHash: trained.version.contentHash,
      trainingEventId: trained.trainingEvent && trained.trainingEvent.id, promotion: false,
      usefulness: trained.usefulness || null, skipped: false,
    },
  });
}

async function dispatchAtlas(store, objective, task, tasks, deps) {
  const review = tasks.find((t) => t.type === "owner_review");
  if (review && review.resultRefs && review.resultRefs.skipped && review.resultRefs.reason === "no_actionable_evidence") {
    return setTask(store, task, { status: "completed", resultRefs: { skipped: true, reason: "no_actionable_evidence", fictional: false } });
  }
  const scenario = objective.permittedFictionalScenario;
  if (!scenario || !scenario.prospects || !scenario.prospects.length) {
    return setTask(store, task, { status: "blocked", error: "No fictional scenario. Atlas cannot pretend it ran." });
  }
  if (review && (review.status === "rejected" || objective.status === "rejected")) {
    return setTask(store, task, { status: "blocked", error: "Rejected knowledge is not sent to Atlas." });
  }
  const train = tasks.find((t) => t.type === "atlas_train");
  const versionId = (train && train.resultRefs && train.resultRefs.versionId) || (deps && deps.versionId) || roleVersionId(store, objective.workspaceId, "atlas");
  const since = nowIso();
  const live = Boolean(deps && deps.live && typeof deps.atlasResponder === "function");
  const out = await runWorkbench(store, {
    workspaceId: objective.workspaceId, prospects: scenario.prospects,
    qualification_policy: scenario.qualification_policy || handoffQualificationPolicy(),
    title: scenario.title || "Conductor fictional eval", fixture: !live, versionId: versionId,
  }, live ? { live: true, responder: deps.atlasResponder } : { live: false });
  tagLedger(store, objective.workspaceId, objective.id, since);
  const run = out.run;
  try {
    recordContribution(store, {
      kind: "fictional_case_completed",
      role: "atlas",
      agentId: "atlas",
      workspaceId: objective.workspaceId,
      evidence: { runId: run.id, versionId: versionId, objectiveId: objective.id, taskId: task.id },
      note: "Fictional workbench. Not real prospects.",
    });
    recordContribution(store, {
      kind: "specialist_task_completed",
      role: CONDUCTOR_ROLE_ID,
      agentId: objective.managerAgentId,
      workspaceId: objective.workspaceId,
      evidence: { taskId: task.id, runId: run.id, objectiveId: objective.id },
      note: "atlas_eval",
    });
  } catch { /* additive */ }
  return setTask(store, task, {
    status: "completed", assignedVersionId: versionId,
    resultRefs: {
      workbenchRunId: run.id, kind: run.kind, retrievedItemIds: run.retrievedItemIds,
      served: (run.servedAssessments || []).map((a) => ({ prospect_id: a.prospect_id, classification: a.classification })),
      ranked: run.rankedQualifiedIds, rawVsServed: { raw: (run.rawAssessments || []).length, served: (run.servedAssessments || []).length },
      fictional: true, outreach: false,
    },
  });
}

async function dispatchOfferStrategist(store, objective, task, deps) {
  const workspaceId = objective.workspaceId;
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const role = roles.find((r) => r.roleId === "offer_strategist");
  if (!role || !["evaluation_required", "active_development", "development_verified"].includes(role.status)) {
    return setTask(store, task, { status: "blocked", error: "Offer Strategist is not authorized for assignment." });
  }
  const assign = canAssignEmployee(store, { workspaceId: workspaceId, roleId: "offer_strategist", taskKind: "supervised_internal" });
  if (!assign.ok) {
    return setTask(store, task, { status: "blocked", error: assign.detail || "unauthorized_employee" });
  }
  if (isFounderBriefObjective(objective) && !(deps && deps.forceLiveStrategist)) {
    const reused = findReusableStrategistRun(store, workspaceId);
    if (reused) {
      return setTask(store, task, {
        status: "completed",
        assignedRoleId: "offer_strategist",
        assignedVersionId: role.versionId,
        resultRefs: {
          runId: reused.id,
          live: false,
          reusedExistingLiveRun: reused.live === true,
          reusedRunId: reused.id,
          deterministic: true,
          freshLiveSpecialistTask: false,
          fixture: Boolean(reused.fixture),
          fixtureFallback: false,
          parseStatus: reused.parseStatus,
          status: reused.status,
          structured: reused.structured,
          rawPreserved: true,
          spendUsd: 0,
          historicalSpendUsd: reused.spendUsd,
          approvedKnowledgeIds: reused.approvedKnowledgeIds,
          disclosure: reused.id === "OSR-003"
            ? "Reused existing live result OSR-003. This task was deterministic. Not a fresh live specialist call."
            : "Reused preserved specialist output. Deterministic. Not a fresh live specialist call.",
        },
      });
    }
    return setTask(store, task, {
      status: "completed",
      assignedRoleId: "offer_strategist",
      assignedVersionId: role.versionId,
      resultRefs: {
        runId: null,
        live: false,
        deterministic: true,
        freshLiveSpecialistTask: false,
        fixtureFallback: false,
        assembledFromApprovedKnowledge: true,
        spendUsd: 0,
        disclosure: "No preserved run reused. Founder brief will assemble from approved knowledge. Not a live specialist call.",
      },
    });
  }
  const out = await runOfferStrategistLive(store, {
    workspaceId: workspaceId,
    task: objective.ownerText || OFFER_STRATEGIST_LIVE_TASK,
    ownerText: objective.ownerText,
    objectiveId: objective.id,
    taskId: task.id,
    employeeId: role.id,
    agentId: role.agentId,
    versionId: role.versionId,
    spendLimitUsd: role.spendLimitUsd != null ? Number(role.spendLimitUsd) : 0.5,
  }, deps || {});
  const run = out && out.run;
  tagLedger(store, workspaceId, objective.id, run && run.createdAt || nowIso());
  try {
    recordContribution(store, {
      kind: "specialist_task_completed",
      role: CONDUCTOR_ROLE_ID,
      agentId: objective.managerAgentId,
      workspaceId: workspaceId,
      evidence: { taskId: task.id, objectiveId: objective.id, runId: run && run.id },
      note: "offer_strategist",
    });
  } catch { /* additive */ }
  const failed = !out || out.ok === false && (out.parseStatus === "failed" || out.status === "failed");
  return setTask(store, task, {
    status: failed && out && out.status === "failed" ? "failed" : "completed",
    assignedRoleId: "offer_strategist",
    assignedVersionId: role.versionId,
    error: out && out.error || null,
    resultRefs: {
      runId: run && run.id,
      live: Boolean(out && out.live),
      fixture: Boolean(out && out.fixture),
      fixtureFallback: false,
      parseStatus: out && out.parseStatus,
      status: out && out.status,
      structured: out && out.structured,
      rawPreserved: true,
      spendUsd: out && out.spendUsd,
      remainingUsd: out && out.remainingUsd,
      model: out && out.model,
      providerRequestId: out && out.providerRequestId,
      approvedKnowledgeIds: out && out.approvedKnowledgeIds,
      refusals: out && out.refusals,
    },
  });
}

function dispatchKnowledgeSufficiency(store, objective, task) {
  const sufficiency = assessKnowledgeSufficiency(store, {
    workspaceId: objective.workspaceId,
    objectiveText: objective.ownerText,
  });
  return setTask(store, task, {
    status: "completed",
    resultRefs: {
      sufficiencyId: sufficiency.id,
      decision: sufficiency.decision,
      fetchRecommended: sufficiency.fetchRecommended,
      scoutRequired: sufficiency.scoutRequired,
      atlasRequired: sufficiency.atlasRequired,
      ownerApprovalRequired: sufficiency.ownerApprovalRequired,
      sourcesFetched: 0,
      usefulKnowledgeIds: sufficiency.usefulKnowledgeIds,
    },
  });
}

function dispatchFounderBriefAssembly(store, objective, task, tasks) {
  const sufficiencyTask = tasks.find((t) => t.type === "knowledge_sufficiency");
  const strategist = tasks.find((t) => t.type === "offer_strategist");
  const sufficiencyId = sufficiencyTask && sufficiencyTask.resultRefs && sufficiencyTask.resultRefs.sufficiencyId;
  const sufficiency = sufficiencyId && store.getKnowledgeSufficiencyReview ? store.getKnowledgeSufficiencyReview(sufficiencyId) : null;
  const runId = strategist && strategist.resultRefs && strategist.resultRefs.runId;
  const auditId = "AUD-watcher-" + objective.workspaceId + "-fob-m17-" + nowIso().slice(0, 19).replace(/[:T]/g, "");
  const draft = buildFounderOpportunityBrief(store, {
    workspaceId: objective.workspaceId,
    objectiveId: objective.id,
    objective: objective,
    sufficiency: sufficiency,
    strategistRunId: runId,
    taskId: task.id,
    planId: objective.planId,
    auditId: auditId,
  });
  const brief = persistFounderOpportunityBrief(store, draft);
  return setTask(store, task, {
    status: "completed",
    resultRefs: {
      briefId: brief.id,
      live: false,
      deterministic: true,
      freshLiveSpecialistTask: false,
      sourceRunId: brief.assembly && brief.assembly.sourceRunId,
      sourcesFetched: 0,
      ownerApprovalRequired: false,
      proposedOffer: brief.sections && brief.sections.proposedOffer && brief.sections.proposedOffer.text,
    },
  });
}

export function buildEvidenceLearningWorkflowPlan(store, objective) {
  const workspaceId = objective.workspaceId;
  ensureScout(store, workspaceId);
  ensureWatcher(store, workspaceId);
  ensureConductor(store, workspaceId);
  resetTaskScratch();
  const planId = nextId(store, "PLAN-", () => store.listPlans());
  const now = nowIso();
  const steps = [
    { key: "evidence_learning", type: "evidence_learning", assignedRoleId: SCOUT_ROLE_ID, assignedRoleName: SCOUT_ROLE_NAME, assignedAgentId: scoutAgentId(workspaceId), assignedVersionId: scoutVersionId(workspaceId, 0), allowedInputs: ["permitted_public_homepages", "owner_text"], expectedOutput: "teaching_packet_or_no_actionable_evidence", prerequisites: [], approvalRequirements: ["teaching_packet"], budgetUsd: 0 },
    { key: "watcher_audit", type: "watcher_audit", assignedRoleId: WATCHER_ROLE_ID, assignedRoleName: WATCHER_ROLE_NAME, assignedAgentId: watcherAgentId(workspaceId), assignedVersionId: watcherVersionId(workspaceId, 0), allowedInputs: ["teaching_chain"], expectedOutput: "append_only_audit_report", prerequisites: ["evidence_learning"], approvalRequirements: [], budgetUsd: 0 },
    { key: "manager_summary", type: "manager_summary", assignedRoleId: CONDUCTOR_ROLE_ID, assignedRoleName: CONDUCTOR_ROLE_NAME, assignedAgentId: conductorAgentId(workspaceId), assignedVersionId: conductorVersionId(workspaceId, 0), allowedInputs: ["task_records", "teaching", "watcher"], expectedOutput: "verified_outcome_summary", prerequisites: ["watcher_audit"], approvalRequirements: [], budgetUsd: 0 },
  ];
  const tasks = steps.map((s, i) => {
    const id = nextId(store, "TSK-", () => store.listTasks().concat(tasksSoFar));
    const task = {
      id: id, objectiveId: objective.id, workspaceId: workspaceId, planId: planId, stepIndex: i, key: s.key,
      assignedRoleId: s.assignedRoleId, assignedRoleName: s.assignedRoleName, assignedAgentId: s.assignedAgentId,
      assignedVersionId: s.assignedVersionId, type: s.type, allowedInputs: s.allowedInputs, expectedOutput: s.expectedOutput,
      prerequisites: s.prerequisites, approvalRequirements: s.approvalRequirements, budgetUsd: s.budgetUsd,
      optional: false, status: "queued", attemptCount: 0, error: null, resultRefs: {}, dispatchId: null,
      lastDispatchId: null, createdAt: now, updatedAt: now,
    };
    tasksSoFar.push(task);
    return task;
  });
  const plan = {
    id: planId, objectiveId: objective.id, workspaceId: workspaceId, managerVersionId: objective.managerVersionId,
    createdAt: now, updatedAt: now, source: "deterministic_evidence_learning", liveDraft: false, liveProposalId: null,
    taskIds: tasks.map((t) => t.id), stepTypes: tasks.map((t) => t.type), disclosure: CONDUCTOR_DISCLOSURE,
    bounded: true, maxSteps: MAX_PLAN_STEPS, maxRetries: MAX_RETRIES, noAtlas: true,
  };
  return { plan: plan, tasks: tasks };
}

async function dispatchEvidenceLearning(store, objective, task, deps) {
  const out = await runEvidenceLearning(store, {
    workspaceId: objective.workspaceId,
    objectiveId: objective.id,
    parentBriefId: "FOB-001",
    seedUrls: (objective.permittedSources && objective.permittedSources.urls) || (deps && deps.seedUrls) || undefined,
    urlFixtures: deps && deps.urlFixtures,
    fetchImpl: deps && deps.fetchImpl,
    allowedDomains: deps && deps.allowedDomains,
  });
  if (out.ownerApprovalRequired) {
    store.putObjective({ ...store.getObjective(objective.id), status: "awaiting_owner_approval", pendingApprovalId: (out.packet && out.packet.approvalRequestId) || store.getObjective(objective.id).pendingApprovalId, updatedAt: nowIso() });
    return setTask(store, task, {
      status: "awaiting_owner_approval",
      resultRefs: {
        packetId: out.packet && out.packet.id,
        ownerApprovalRequired: true,
        fetchCount: out.fetchCount,
        genuinelyNew: out.genuinelyNew,
        atlasCalled: false,
      },
    });
  }
  return setTask(store, task, {
    status: "completed",
    resultRefs: {
      packetId: out.packet && out.packet.id || null,
      noActionableEvidence: out.noActionableEvidence,
      fetchCount: out.fetchCount,
      genuinelyNew: out.genuinelyNew,
      episodeId: out.episode && out.episode.id,
      atlasCalled: false,
      pagesFetched: out.pagesFetched,
      pagesBlocked: out.pagesBlocked,
    },
  });
}

async function dispatchWatcher(store, objective, task, tasks) {
  const learnTask = tasks.find((t) => t.type === "evidence_learning");
  if (learnTask && (learnTask.status === "completed" || learnTask.status === "awaiting_owner_approval")) {
    const out = auditTeachingChain(store, {
      workspaceId: objective.workspaceId,
      objectiveId: objective.id,
      learning: learnTask.resultRefs || {},
    });
    const report = out.report;
    return setTask(store, task, {
      status: "completed",
      resultRefs: {
        auditId: report.id, status: report.status, blocking: report.blocking, warnings: report.warnings,
        violations: report.violations, liveModel: false, deterministic: true,
        originalPreserved: report.originalPreserved, evaluatorRevisionId: "EVL-M16-001",
      },
    });
  }
  const briefTask = tasks.find((t) => t.type === "founder_brief_assembly");
  if (briefTask && briefTask.status === "completed" && briefTask.resultRefs && briefTask.resultRefs.briefId) {
    const brief = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief(briefTask.resultRefs.briefId);
    const strategist = tasks.find((t) => t.type === "offer_strategist");
    const out = auditFounderOpportunityBrief(store, {
      workspaceId: objective.workspaceId,
      brief: brief,
      runId: strategist && strategist.resultRefs && strategist.resultRefs.runId,
      reportId: (brief && brief.sections && brief.sections.auditStatus && brief.sections.auditStatus.briefAuditId) || undefined,
    });
    const report = out.report;
    return setTask(store, task, {
      status: "completed",
      resultRefs: {
        auditId: report.id, status: report.status, blocking: report.blocking, warnings: report.warnings,
        violations: report.violations, liveModel: false, deterministic: true,
        originalPreserved: report.originalPreserved, founderOpportunityBriefId: brief && brief.id,
        evaluatorRevisionId: "EVL-M16-001",
      },
    });
  }
  const strategist = tasks.find((t) => t.type === "offer_strategist");
  if (strategist && strategist.status === "completed" && strategist.resultRefs && strategist.resultRefs.runId) {
    const since = nowIso();
    const out = auditOfferStrategistResult(store, {
      workspaceId: objective.workspaceId,
      runId: strategist.resultRefs.runId,
      objectiveId: objective.id,
    });
    tagLedger(store, objective.workspaceId, objective.id, since);
    const report = out.report;
    return setTask(store, task, {
      status: "completed",
      resultRefs: {
        auditId: report.id, status: report.status, blocking: report.blocking, warnings: report.warnings,
        violations: report.violations, liveModel: false, deterministic: true,
        originalPreserved: report.originalPreserved, offerStrategistRunId: strategist.resultRefs.runId,
      },
    });
  }
  const atlas = tasks.find((t) => t.type === "atlas_eval");
  const runId = atlas && atlas.resultRefs && atlas.resultRefs.workbenchRunId;
  const noAction = Boolean(atlas && atlas.resultRefs && atlas.resultRefs.skipped);
  if (!runId && !noAction) return setTask(store, task, { status: "blocked", error: "No Atlas result to audit. Conductor cannot invent a Watcher outcome." });
  const since = nowIso();
  const out = auditCompletedWork(store, {
    workspaceId: objective.workspaceId,
    workbenchRunId: runId || null,
    omitted: noAction,
    scopeNote: noAction ? "no_action_current_scope" : "current_decision_chain",
  });
  tagLedger(store, objective.workspaceId, objective.id, since);
  const report = out.report;
  const material = report.status === "VIOLATION" || ((report.blocking || []).length > 0);
  return setTask(store, task, {
    status: "completed",
    resultRefs: {
      auditId: report.id, status: report.status, blocking: report.blocking, warnings: report.warnings,
      violations: report.violations, liveModel: false, deterministic: true, materialViolation: material,
    },
  });
}

function dispatchSummary(store, objective, task, tasks) {
  const failed = tasks.filter((t) => t.status === "failed" || t.status === "blocked");
  const watcher = tasks.find((t) => t.type === "watcher_audit");
  const material = watcher && watcher.resultRefs && watcher.resultRefs.materialViolation;
  const spend = objectiveSpend(store, objective);
  const approvals = store.listApprovalDecisions(objective.id) || [];
  const atlas = tasks.find((t) => t.type === "atlas_eval");
  const scout = tasks.find((t) => t.type === "scout_research");
  const train = tasks.find((t) => t.type === "atlas_train");
  const summary = {
    id: nextId(store, "SUM-", () => store.listManagerSummaries()),
    workspaceId: objective.workspaceId, objectiveId: objective.id, managerVersionId: objective.managerVersionId,
    createdAt: nowIso(), taskIds: tasks.map((t) => t.id),
    taskStatuses: Object.fromEntries(tasks.map((t) => [t.key, t.status])),
    scout: scout && scout.resultRefs, approvals: approvals.map((d) => ({ id: d.id, actorType: d.actorType, action: d.action, contentHash: d.contentHash, stepId: d.stepId })),
    atlasVersion: train && train.resultRefs, atlasRun: atlas && atlas.resultRefs, watcher: watcher && watcher.resultRefs,
    spend: spend, warnings: (watcher && watcher.resultRefs && watcher.resultRefs.warnings) || [],
    blockedIssues: stopReasons(store, objective, tasks).filter((r) => r.blocking), inventedCompletions: false,
    disclosure: CONDUCTOR_DISCLOSURE,
    note: failed.length
      ? "One or more tasks failed or blocked. Conductor did not synthesize a fake employee reply."
      : "Verified outcomes from stored task records, approvals, spend, and Watcher.",
  };
  const reviewTask = tasks.find((t) => t.type === "owner_review");
  const noAction = Boolean(reviewTask && reviewTask.resultRefs && reviewTask.resultRefs.reason === "no_actionable_evidence");
  if (material) { summary.objectiveSucceeded = false; summary.note = "Watcher reported a material violation. Objective cannot auto-succeed."; }
  else if (noAction) {
    summary.objectiveSucceeded = false;
    summary.researchSuccess = false;
    summary.productOutcome = "completed_no_actionable_evidence";
    summary.note = "Insufficient relevant evidence for the current question. Accurate off-objective facts were omitted. No owner prompt. No Atlas train. No new version. Not a research success.";
  }
  else if (failed.length) summary.objectiveSucceeded = false;
  else summary.objectiveSucceeded = true;
  store.putManagerSummary(summary);
  const strategistTask = tasks.find((t) => t.type === "offer_strategist");
  const briefTask = tasks.find((t) => t.type === "founder_brief_assembly");
  if (briefTask && briefTask.resultRefs && briefTask.resultRefs.briefId) {
    const brief = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief(briefTask.resultRefs.briefId);
    const watcherTask = tasks.find((t) => t.type === "watcher_audit");
    const auditId = watcherTask && watcherTask.resultRefs && watcherTask.resultRefs.auditId;
    const audit = auditId && store.getWatcherAudit ? store.getWatcherAudit(auditId) : null;
    try {
      recordFounderBriefContributions(store, {
        workspaceId: objective.workspaceId,
        objectiveId: objective.id,
        brief: brief,
        audit: audit,
        taskId: briefTask.id,
      });
    } catch { /* additive */ }
    // Do not apply development verification or promotion during founder-brief assembly.
  } else if (strategistTask && strategistTask.resultRefs && strategistTask.resultRefs.runId) {
    const run = store.getOfferStrategistRun && store.getOfferStrategistRun(strategistTask.resultRefs.runId);
    const watcherTask = tasks.find((t) => t.type === "watcher_audit");
    const auditId = watcherTask && watcherTask.resultRefs && watcherTask.resultRefs.auditId;
    const audit = auditId && store.getWatcherAudit ? store.getWatcherAudit(auditId) : null;
    try { recordStrategistContributions(store, { workspaceId: objective.workspaceId, run: run, audit: audit }); } catch { /* additive */ }
    try { applyDevelopmentVerification(store, { workspaceId: objective.workspaceId, run: run, audit: audit }); } catch { /* additive */ }
  }
  try {
    recordContribution(store, {
      kind: summary.objectiveSucceeded ? "objective_completed" : "blocked_issue_escalated",
      role: CONDUCTOR_ROLE_ID,
      agentId: objective.managerAgentId,
      workspaceId: objective.workspaceId,
      evidence: { objectiveId: objective.id, taskId: task.id, auditId: watcher && watcher.resultRefs && watcher.resultRefs.auditId },
      note: summary.note,
    });
    recordContribution(store, {
      kind: "budget_respected",
      role: CONDUCTOR_ROLE_ID,
      agentId: objective.managerAgentId,
      workspaceId: objective.workspaceId,
      evidence: { objectiveId: objective.id, taskId: task.id },
      note: "used=" + spend.estimatedUsd + " ceiling=" + spend.maxSpendUsd,
    });
  } catch { /* additive */ }
  setTask(store, task, { status: "completed", resultRefs: { summaryId: summary.id, succeeded: summary.objectiveSucceeded } });
  const obj = store.getObjective(objective.id);
  let status = "completed";
  let terminalStatus = obj.terminalStatus || null;
  if (material) { status = "blocked"; terminalStatus = "failed_quality_gate"; }
  else if (noAction) { status = "completed"; terminalStatus = "completed_no_actionable_evidence"; }
  else if (failed.length) { status = obj.status === "rejected" ? "rejected" : "blocked"; terminalStatus = obj.status === "rejected" ? "rejected_by_owner" : "blocked_missing_source"; }
  else { terminalStatus = "completed_with_actionable_finding"; }
  store.putObjective({ ...obj, status: status, terminalStatus: terminalStatus, updatedAt: nowIso(), completionSummaryId: summary.id, completionSummary: summary.note });
  return store.getTask(task.id);
}

export async function tickObjective(store, objectiveId, deps) {
  const objective = store.getObjective(objectiveId);
  if (!objective) throw new Error("objective not found: " + objectiveId);
  if (objective.paused || objective.status === "paused") {
    return { objective: publicObjective(store, objective), paused: true, note: "Paused. Resume to continue from the correct step." };
  }
  if (["completed", "canceled", "rejected"].includes(objective.status)) {
    return { objective: publicObjective(store, objective), done: true };
  }
  let tasks = store.listTasks(objectiveId) || [];
  if (!tasks.length) {
    const planned = await planObjective(store, objectiveId, deps);
    if (planned.blocked) return planned;
    tasks = store.listTasks(objectiveId) || [];
  }
  tasks = tasks.slice().sort((a, b) => a.stepIndex - b.stepIndex);
  if (tasks.some((t) => t.status === "awaiting_owner_approval")) {
    const pending = tasks.find((t) => t.status === "awaiting_owner_approval");
    store.putObjective({ ...store.getObjective(objectiveId), status: "awaiting_owner_approval", updatedAt: nowIso() });
    return {
      objective: publicObjective(store, store.getObjective(objectiveId)),
      awaitingOwnerApproval: true, pendingTaskId: pending && pending.id,
      pendingApprovalId: store.getObjective(objectiveId).pendingApprovalId,
      note: "Waiting for owner or demo_operator. Conductor cannot skip or secretly approve.",
    };
  }
  const spend = objectiveSpend(store, store.getObjective(objectiveId));
  if (spend.estimatedUsd - spend.maxSpendUsd > 1e-9) {
    store.putObjective({ ...store.getObjective(objectiveId), status: "blocked", updatedAt: nowIso(), blockedIssues: [{ code: "budget_out" }] });
    return { objective: publicObjective(store, store.getObjective(objectiveId)), blocked: true, reason: "budget_out" };
  }
  for (const task of tasks) {
    if (["completed", "approved", "canceled"].includes(task.status)) continue;
    if (task.status === "rejected") {
      store.putObjective({ ...store.getObjective(objectiveId), status: "rejected", updatedAt: nowIso() });
      return { objective: publicObjective(store, store.getObjective(objectiveId)), rejected: true };
    }
    if (task.status === "awaiting_owner_approval") {
      return { objective: publicObjective(store, store.getObjective(objectiveId)), awaitingOwnerApproval: true, pendingTaskId: task.id };
    }
    if (task.status === "failed" && task.attemptCount >= MAX_RETRIES) {
      setTask(store, task, { status: "blocked", error: task.error || "Retry bound reached. Conductor will not retry expensive failures." });
      store.putObjective({ ...store.getObjective(objectiveId), status: "blocked", updatedAt: nowIso() });
      return { objective: publicObjective(store, store.getObjective(objectiveId)), blocked: true, task: store.getTask(task.id) };
    }
    if (!depsSatisfied(store, task, tasks)) continue;
    if (task.dispatchId && task.status === "running") {
      return { objective: publicObjective(store, store.getObjective(objectiveId)), running: true, note: "Duplicate dispatch protection: step already running." };
    }
    const dispatchId = objective.id + ":" + task.id + ":" + (task.attemptCount + 1);
    let current = setTask(store, task, { status: "running", dispatchId: dispatchId, lastDispatchId: dispatchId, attemptCount: task.attemptCount + 1 });
    store.putObjective({ ...store.getObjective(objectiveId), status: "running", updatedAt: nowIso() });
    try {
      if (task.type === "scout_research") current = await dispatchScout(store, store.getObjective(objectiveId), current, deps);
      else if (task.type === "owner_review") current = await dispatchOwnerReview(store, store.getObjective(objectiveId), current, store.listTasks(objectiveId));
      else if (task.type === "atlas_train") current = await dispatchTrain(store, store.getObjective(objectiveId), current, store.listTasks(objectiveId), deps);
      else if (task.type === "atlas_eval") current = await dispatchAtlas(store, store.getObjective(objectiveId), current, store.listTasks(objectiveId), deps);
      else if (task.type === "knowledge_sufficiency") current = dispatchKnowledgeSufficiency(store, store.getObjective(objectiveId), current);
      else if (task.type === "offer_strategist") current = await dispatchOfferStrategist(store, store.getObjective(objectiveId), current, deps);
      else if (task.type === "founder_brief_assembly") current = dispatchFounderBriefAssembly(store, store.getObjective(objectiveId), current, store.listTasks(objectiveId));
      else if (task.type === "evidence_learning") current = await dispatchEvidenceLearning(store, store.getObjective(objectiveId), current, deps);
      else if (task.type === "watcher_audit") current = await dispatchWatcher(store, store.getObjective(objectiveId), current, store.listTasks(objectiveId));
      else if (task.type === "manager_summary") current = dispatchSummary(store, store.getObjective(objectiveId), current, store.listTasks(objectiveId));
      else current = setTask(store, current, { status: "blocked", error: "Unknown task type " + task.type + ". Conductor cannot invent capabilities." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      current = setTask(store, current, { status: "failed", error: msg, dispatchId: null });
      store.putObjective({ ...store.getObjective(objectiveId), status: "failed", updatedAt: nowIso(), lastError: msg });
      return { objective: publicObjective(store, store.getObjective(objectiveId)), failed: true, error: msg, task: current };
    }
    if (current.status === "awaiting_owner_approval") {
      return {
        objective: publicObjective(store, store.getObjective(objectiveId)),
        awaitingOwnerApproval: true, pendingTaskId: current.id,
        pendingApprovalId: store.getObjective(objectiveId).pendingApprovalId,
      };
    }
    if (current.status === "blocked") {
      store.putObjective({ ...store.getObjective(objectiveId), status: "blocked", updatedAt: nowIso(), blockedIssues: [{ code: "task_blocked", detail: current.error }] });
      return { objective: publicObjective(store, store.getObjective(objectiveId)), blocked: true, task: current };
    }
    return { objective: publicObjective(store, store.getObjective(objectiveId)), task: current, advanced: true };
  }
  return { objective: publicObjective(store, store.getObjective(objectiveId)), idle: true };
}

export async function runUntilBlocked(store, objectiveId, deps) {
  const max = MAX_PLAN_STEPS * (MAX_RETRIES + 2);
  let last = null;
  for (let i = 0; i < max; i += 1) {
    last = await tickObjective(store, objectiveId, deps);
    if (!last || last.paused || last.awaitingOwnerApproval || last.blocked || last.failed || last.rejected || last.done || last.idle) return last;
  }
  return last;
}

export function pauseObjective(store, objectiveId) {
  const o = store.getObjective(objectiveId);
  if (!o) throw new Error("objective not found: " + objectiveId);
  store.putObjective({ ...o, paused: true, status: o.status === "awaiting_owner_approval" ? "awaiting_owner_approval" : "paused", updatedAt: nowIso(), statusBeforePause: o.status });
  return publicObjective(store, store.getObjective(objectiveId));
}

export function resumeObjective(store, objectiveId) {
  const o = store.getObjective(objectiveId);
  if (!o) throw new Error("objective not found: " + objectiveId);
  const tasks = store.listTasks(objectiveId) || [];
  const awaiting = tasks.some((t) => t.status === "awaiting_owner_approval") || o.status === "awaiting_owner_approval" || o.statusBeforePause === "awaiting_owner_approval";
  const nextStatus = awaiting ? "awaiting_owner_approval" : "running";
  store.putObjective({ ...o, paused: false, status: nextStatus, updatedAt: nowIso() });
  return publicObjective(store, store.getObjective(objectiveId));
}

export function cancelObjective(store, objectiveId) {
  const o = store.getObjective(objectiveId);
  if (!o) throw new Error("objective not found: " + objectiveId);
  const now = nowIso();
  for (const t of store.listTasks(objectiveId) || []) {
    if (!["completed", "approved", "rejected", "canceled"].includes(t.status)) setTask(store, t, { status: "canceled" });
  }
  store.putObjective({ ...o, status: "canceled", paused: false, updatedAt: now });
  try { reconcileStaleApprovals(store, { objectiveId: objectiveId }); } catch { /* additive */ }
  return publicObjective(store, store.getObjective(objectiveId));
}

export function objectiveView(store, objectiveId) {
  const objective = store.getObjective(objectiveId);
  if (!objective) throw new Error("objective not found: " + objectiveId);
  const ws = store.getWorkspace(objective.workspaceId);
  const tasks = (store.listTasks(objectiveId) || []).slice().sort((a, b) => a.stepIndex - b.stepIndex);
  const plan = objective.planId ? store.getPlan(objective.planId) : null;
  const approvalsPending = (store.listApprovalRequests(objectiveId) || []).filter((r) => r.status === "pending");
  const approvalsDecided = store.listApprovalDecisions(objectiveId) || [];
  const scoutTask = tasks.find((t) => t.type === "scout_research");
  const findings = (scoutTask && scoutTask.status === "completed" && scoutTask.resultRefs && scoutTask.resultRefs.findingIds)
    ? scoutTask.resultRefs.findingIds.map((id) => store.getScoutFinding(id)).filter(Boolean) : [];
  const train = tasks.find((t) => t.type === "atlas_train");
  const atlas = tasks.find((t) => t.type === "atlas_eval");
  const watcher = tasks.find((t) => t.type === "watcher_audit");
  const summary = objective.completionSummaryId ? store.getManagerSummary(objective.completionSummaryId) : null;
  const spend = objectiveSpend(store, objective);
  const employees = [
    store.getAgent(conductorAgentId(objective.workspaceId)),
    store.getAgent(scoutAgentId(objective.workspaceId)),
    store.getAgent("atlas"),
    store.getAgent(watcherAgentId(objective.workspaceId)),
  ].filter(Boolean).map((a) => ({ id: a.id, roleId: a.roleId, roleName: a.roleName, status: a.status }));
  const statements = [];
  if (scoutTask && scoutTask.status === "completed") statements.push({ kind: "scout_completed", taskId: scoutTask.id });
  if (findings.length) statements.push({ kind: "findings_stored", ids: findings.map((f) => f.id) });
  if (approvalsDecided.length) statements.push({ kind: "approvals_stored", ids: approvalsDecided.map((d) => d.id) });
  if (train && train.resultRefs && train.resultRefs.versionId) statements.push({ kind: "atlas_version", id: train.resultRefs.versionId });
  if (atlas && atlas.resultRefs && atlas.resultRefs.workbenchRunId) statements.push({ kind: "atlas_run", id: atlas.resultRefs.workbenchRunId });
  if (watcher && watcher.resultRefs && watcher.resultRefs.auditId) statements.push({ kind: "watcher_audit", id: watcher.resultRefs.auditId });
  if (summary) statements.push({ kind: "summary", id: summary.id });
  return {
    persistence: "FILE_STORE", notEnterpriseQueue: true,
    business: ws ? { id: ws.id, name: ws.name, description: ws.description, goal: ws.goal } : null,
    objective: publicObjective(store, objective),
    manager: { id: objective.managerAgentId, roleId: CONDUCTOR_ROLE_ID, roleName: CONDUCTOR_ROLE_NAME, versionId: objective.managerVersionId, orchestration: CONDUCTOR_ORCHESTRATION, disclosure: CONDUCTOR_DISCLOSURE },
    status: objective.status, assignedEmployees: employees,
    currentTasks: tasks.filter((t) => ["running", "queued", "awaiting_owner_approval"].includes(t.status)),
    completedTasks: tasks.filter((t) => t.status === "completed" || t.status === "approved"),
    pendingApprovals: approvalsPending, decisions: approvalsDecided, findings: findings,
    newAtlasVersion: train && train.resultRefs && train.resultRefs.versionId && train.status === "completed" ? train.resultRefs : null,
    fictionalResults: atlas && atlas.status === "completed" ? atlas.resultRefs : null,
    watcher: watcher && watcher.status === "completed" ? watcher.resultRefs : null,
    budget: { used: spend.estimatedUsd, remaining: spend.remainingUsd, ceiling: spend.maxSpendUsd, byRole: spend.byRole, byOp: spend.byOp },
    blockedIssues: (objective.blockedIssues || []).concat(stopReasons(store, objective, tasks)),
    summary: summary,
    plan: plan && { id: plan.id, source: plan.source, liveDraft: plan.liveDraft, disclosure: plan.disclosure, stepTypes: plan.stepTypes },
    statements: statements, statementsOnlyAfterStoredEvents: true, disclosure: CONDUCTOR_DISCLOSURE,
    usefulness: (store.listUsefulnessReviews ? store.listUsefulnessReviews(objective.workspaceId) : []).filter((u) => u.objectiveId === objective.id).slice(-1)[0] || null,
    contributions: store.listContributionEvents ? store.listContributionEvents(objective.workspaceId).filter((e) => e.evidence && e.evidence.objectiveId === objective.id) : [],
    actorTypes: ["local_owner", "demo_operator", "system", "delegated_policy"],
    capability: RESEARCH_LABEL,
    extraction: (findings[0] && findings[0].sourceId && store.getSource(findings[0].sourceId) || {}).extraction || null,
    sourceSupport: findings.map((f) => ({ id: f.id, support: f.support || f.supportStatus || null, kind: f.kind, excerpt: f.excerpt })),
    expectedUtility: store.listUtilityRecords ? (store.listUtilityRecords(objective.workspaceId) || []).filter((u) => u.objectiveId === objective.id).slice(-1)[0] : null,
    shadow: store.listShadowCompiles ? (store.listShadowCompiles(objective.workspaceId) || []).filter((s) => s.objectiveId === objective.id).slice(-1)[0] : null,
    servingVersionId: resolveServingAtlasVersion(store, objective.workspaceId),
    candidateVersionId: train && train.resultRefs && train.resultRefs.versionId && train.resultRefs.skipped !== true ? train.resultRefs.versionId : null,
    versionRoles: {
      candidate_version: train && train.resultRefs && train.resultRefs.versionId && train.resultRefs.skipped !== true ? train.resultRefs.versionId : null,
      serving_version: resolveServingAtlasVersion(store, objective.workspaceId),
      promoted_version: null,
      selected_workbench_version: atlas && atlas.assignedVersionId || null,
    },
    requireLocalOwner: Boolean(objective.requireLocalOwner),
    fictionalScenarioHash: objective.fictionalScenarioHash || null,
    researchBrief: (store.listResearchBriefs ? (store.listResearchBriefs() || []).filter((b) => b.objectiveId === objective.id || b.requestId === (scoutTask && scoutTask.resultRefs && scoutTask.resultRefs.requestId)).slice(-1)[0] : null),
    sourceFitness: store.listSourceFitness ? (store.listSourceFitness() || []).filter((f) => f.objectiveId === objective.id || f.requestId === (scoutTask && scoutTask.resultRefs && scoutTask.resultRefs.requestId)) : [],
    passages: store.listPassages ? (store.listPassages() || []).filter((p) => p.objectiveId === objective.id || p.requestId === (scoutTask && scoutTask.resultRefs && scoutTask.resultRefs.requestId)) : [],
    omittedFindings: findings.filter((f) => f.reviewStatus === "omitted" || f.approvalEligible === false),
    whyReachedOwnerReview: eligibleReason(findings),
    trainingWarranted: (store.listUsefulnessReviews ? store.listUsefulnessReviews(objective.workspaceId) : []).filter((u) => u.objectiveId === objective.id).slice(-1)[0]
      ? Boolean(((store.listUsefulnessReviews(objective.workspaceId) || []).filter((u) => u.objectiveId === objective.id).slice(-1)[0] || {}).shouldTrain)
      : false,
    contributionSplit: contributionSplit(store, objective),
    employeeCreation: store.listStageIGates ? (store.listStageIGates() || []).slice(-1)[0] : null,
    employeeRoles: store.listEmployeeRoles ? store.listEmployeeRoles(objective.workspaceId) : [],
    terminalStatus: objective.terminalStatus || null,
    founderOpportunityBrief: latestFounderBrief(store, objective.workspaceId),
  };
}

function eligibleReason(findings) {
  const eligible = (findings || []).filter((f) => f.approvalEligible === true);
  if (eligible.length) {
    return { reachedOwnerReview: true, findingIds: eligible.map((f) => f.id), reason: "approval_eligible_relevant_supported" };
  }
  const omitted = (findings || []).filter((f) => f.reviewStatus === "omitted" || f.approvalEligible === false);
  return {
    reachedOwnerReview: false,
    reason: omitted.some((f) => f.omissionReason === "accurate_but_irrelevant")
      ? "accurate_but_irrelevant_omitted"
      : "no_actionable_evidence",
    omittedIds: omitted.map((f) => f.id),
  };
}

function contributionSplit(store, objective) {
  const events = store.listContributionEvents
    ? (store.listContributionEvents(objective.workspaceId) || []).filter((e) => e.evidence && e.evidence.objectiveId === objective.id)
    : [];
  return {
    provisional: events.filter((e) => e.state === "provisional"),
    verifiedEffective: events.filter((e) => e.state === "verified" && e.effective !== false),
    ineffective: events.filter((e) => e.effective === false),
  };
}

export function conductorSlice(store, workspaceId) {
  const c = store.getAgent(conductorAgentId(workspaceId));
  const objs = store.listObjectives ? store.listObjectives(workspaceId) : [];
  return {
    implemented: Boolean(c),
    agent: c ? { id: c.id, roleId: c.roleId, roleName: c.roleName, status: c.status, workspaceId: c.workspaceId, versionHistory: c.versionHistory, orchestration: c.orchestration } : null,
    objectives: objs.map((o) => ({ id: o.id, status: o.status, ownerText: o.ownerText })),
    disclosure: CONDUCTOR_DISCLOSURE, orchestration: CONDUCTOR_ORCHESTRATION,
  };
}

export async function seedRidgelineConductorDemo(store, opts) {
  const workspaceId = "ws-ridgeline";
  const ws = store.getWorkspace(workspaceId);
  if (!ws) throw new Error("ws-ridgeline is required for the Conductor demo.");
  ensureConductor(store, workspaceId);
  ensureScout(store, workspaceId);
  ensureWatcher(store, workspaceId);
  const submitted = submitObjective(store, {
    workspaceId: workspaceId,
    ownerText: (opts && opts.ownerText) || (HANDOFF_SCOUT_QUESTION + " Then evaluate fictional roofing prospects using approved company rules."),
    paste: (opts && opts.paste) || HANDOFF_OWNER_PASTE,
    sourceLabel: "owner-provided operational knowledge",
    permittedFictionalScenario: {
      title: "RidgeLine Conductor fictional eval", fictional: true,
      prospects: HANDOFF_FICTIONAL_PROSPECTS, qualification_policy: handoffQualificationPolicy(),
    },
    maxSpendUsd: (opts && opts.maxSpendUsd) != null ? opts.maxSpendUsd : 2,
    category: "research_and_fictional_eval",
  });
  const planned = await planObjective(store, submitted.objective.id, opts);
  return { ...submitted, ...planned, workspace: ws };
}

export { HANDOFF_FICTIONAL_PROSPECTS, HANDOFF_OWNER_PASTE, HANDOFF_SCOUT_QUESTION, handoffQualificationPolicy };

export { listPendingApprovals, reconcileStaleApprovals, OFFER_STRATEGIST_LIVE_TASK };
export { isFounderBriefObjective, FOUNDER_BRIEF_OWNER_OBJECTIVE, FOUNDER_BRIEF_CATEGORY };

export async function runFounderBriefWorkflow(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  ensureConductor(store, workspaceId);
  ensureWatcher(store, workspaceId);
  const submitted = submitObjective(store, {
    workspaceId: workspaceId,
    ownerText: (extras && extras.ownerText) || FOUNDER_BRIEF_OWNER_OBJECTIVE,
    category: FOUNDER_BRIEF_CATEGORY,
    maxSpendUsd: (extras && extras.maxSpendUsd) != null ? extras.maxSpendUsd : 0,
  });
  const planned = await planObjective(store, submitted.objective.id, extras);
  const ran = await runUntilBlocked(store, submitted.objective.id, { live: false, forceLiveStrategist: false, ...(extras || {}) });
  return {
    ...submitted,
    ...planned,
    ...ran,
    live: false,
    deterministic: true,
    freshLiveSpecialistTask: false,
    providerCalls: 0,
    sourcesFetched: 0,
    ownerApprovalRequired: false,
  };
}
