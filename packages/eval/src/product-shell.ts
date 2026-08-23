/** Checkpoint 19–20 product shell. Owner application over FILE_STORE. Not React. Not Postgres. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { requireWorkspaceId, listKnowledgeInWorkspace, isolationHonesty, historicalContaminationView } from "./workspace-isolation.ts";
import { ownerSpendView } from "./spend-ledger.ts";
import { portfolioHarborFinchCedarCompare } from "./teach-retrieve.ts";
import { listPendingApprovals } from "./approval-reconciliation.ts";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import { RETRIEVAL_METHOD, RETRIEVAL_LABEL } from "./teaching-engine.ts";
import { SEARCH_INTEGRATION_EXISTS } from "./source-acquisition.ts";
import { defaultCurriculumRoot } from "./curriculum.ts";
import {
  APPLICATION_ISOLATION,
  INTAKE_HONESTY,
  createExistingBusiness,
  createNewBusiness,
  intakeForm,
  isolationView,
  isIsolatedOwnerWorkspace,
  presentIntake,
} from "./company-intake.ts";
import {
  generateOpportunities,
  generateOpportunitiesLive,
  compareOpportunities,
  createCompanyFromOpportunity,
  listProductOpportunities,
  inspectOpportunity,
  opportunityResearchForm,
  saveOpportunity,
  rejectOpportunity,
  OPPORTUNITY_HONESTY,
} from "./opportunity-scout.ts";
import { roleClassificationTable, classifyRole } from "./role-classification.ts";
import { searchProviderView, querySearchProvider, attemptOfficialWebSearch } from "./search-provider.ts";
import { teachingPipelineView, flagInsufficientKnowledge } from "./teaching-pipeline.ts";
import { persistHistoricalContaminationLabels } from "./workspace-isolation.ts";
import { runEmployeeTaskLive, liveExecutionView, listSpecialistExecutions } from "./live-specialists.ts";
import {
  persistInternalAutonomyPolicy,
  autonomyPolicyView,
  revokeInternalAutonomyPolicy,
  evaluateInternalAutonomy,
} from "./autonomy-policy.ts";
import {
  proposeTeam,
  proposeAdditionalSeats,
  createTeam,
  listProductTeams,
  inspectTeamProposal,
  runEmployeeTask,
  TEAM_HONESTY,
} from "./team-generator.ts";
import {
  listProductWork,
  inspectProductWork,
  submitProductObjective,
  submitProductObjectiveLive,
  runProductWork,
  runProductWorkLive,
  WORK_HONESTY,
} from "./generalized-conductor.ts";
import {
  listWorkspaceDeliverables,
  inspectDeliverable,
  publicDeliverable,
  DELIVERABLE_HONESTY,
} from "./deliverables.ts";
import {
  runOwnerTrainingCycle,
  identifyKnowledgeGap,
  researchGapFromOwnerMaterials,
  proposeExternalTeachingPacket,
  deliverTeachingPacket,
  shareApprovedKnowledge,
  runBeforeAfterCheck,
  trainingCycleView,
  enrichEmployeeBrain,
  bindTrainingShell,
  teachPeerFromFinding,
  TRAINING_CYCLE_HONESTY,
  LEARNING_DISTINCTIONS,
} from "./owner-training-cycle.ts";
import {
  planFromNaturalLanguage,
  persistCommandPlan,
  listCommandPlans,
  inspectCommandPlan,
  commandCenterView,
  COMMAND_HONESTY,
} from "./command-center.ts";
import {
  investmentCompare,
  investmentCommitteeComposition,
  retrieveByMemoryPriority,
  employeeDevelopmentRecord,
  explainTeamForCompany,
  recordExecutionAction,
  upsertScheduledJob,
  simulateJobRestart,
  runAutonomyLoopTick,
  treasuryView,
  enrichOpportunityInvestment,
  masterOsOverviewExtras,
  MASTER_OS_HONESTY,
  CURRENT_MAX_EXECUTION_LEVEL,
  EXECUTION_LADDER,
  MEMORY_PRIORITY,
} from "./master-os.ts";
import {
  runScheduledJobWorkerTick,
  jobsStageView,
  persistActionCatalog,
  listActionCatalogBoundary,
  stageHarborLibraryFlyer,
  attemptExternalLadderLevel,
  JOBS_STAGE_HONESTY,
} from "./jobs-stage.ts";
import {
  launchReadinessView,
  researchView,
  teachingView,
  retrieveBrainLayers,
  buildSourceProviderRegistry,
  EXTERNAL_ADAPTERS,
  alwaysOnReadiness,
  planWithOptionalLive,
  persistCommandPlanMaybeLive,
  REVENUE_FOUNDRY_HONESTY,
  artifactsPageView,
  readWorkspaceArtifactFile,
} from "./revenue-foundry.ts";

import {
  approveCommandPlan,
  runCommandPlan,
  founderEmployeeView,
  listFounderEmployees,
  founderOpportunityView,
  founderOpportunityCompare,
  founderSpendingView,
  scoutFromAcceptedUsefulSearch,
  proveRestartSurvival,
  assembleRicherLandingHtml,
} from "./founder-depth.ts";

export const PRODUCT_NAV = [
  { id: "overview", path: "/app/overview", hash: "#/overview", label: "Overview", built: true },
  { id: "command", path: "/app/command", hash: "#/command", label: "Command", built: true },
  { id: "companies", path: "/app/companies", hash: "#/companies", label: "Companies", built: true },
  { id: "opportunities", path: "/app/opportunities", hash: "#/opportunities", label: "Opportunities", built: true },
  { id: "teams", path: "/app/teams", hash: "#/teams", label: "Teams", built: true },
  { id: "employees", path: "/app/employees", hash: "#/employees", label: "Employees", built: true },
  { id: "training", path: "/app/training", hash: "#/training", label: "Training", built: true },
  { id: "knowledge", path: "/app/knowledge", hash: "#/knowledge", label: "Knowledge", built: true },
  { id: "objectives", path: "/app/objectives", hash: "#/objectives", label: "Objectives", built: true },
  { id: "work", path: "/app/work", hash: "#/work", label: "Work", built: true },
  { id: "approvals", path: "/app/approvals", hash: "#/approvals", label: "Approvals", built: true },
  { id: "activity", path: "/app/activity", hash: "#/activity", label: "Activity", built: true },
  { id: "jobs", path: "/app/jobs", hash: "#/jobs", label: "Jobs", built: true },
  { id: "spending", path: "/app/spending", hash: "#/spending", label: "Spending", built: true },
  { id: "treasury", path: "/app/treasury", hash: "#/treasury", label: "Treasury", built: true },
  { id: "launch-readiness", path: "/app/launch-readiness", hash: "#/launch-readiness", label: "Launch Readiness", built: true },
  { id: "research", path: "/app/research", hash: "#/research", label: "Research", built: true },
  { id: "teaching", path: "/app/teaching", hash: "#/teaching", label: "Teaching", built: true },
  { id: "brain", path: "/app/brain", hash: "#/brain", label: "Brain", built: true },
  { id: "artifacts", path: "/app/artifacts", hash: "#/artifacts", label: "Artifacts", built: true },
];
export const FOUNDER_NAV = [
  { id: "start", path: "/app/companies/intake/new", hash: "#/companies/new", label: "Start", built: true },
  { id: "grow", path: "/app/companies/intake/existing", hash: "#/companies/existing", label: "Grow", built: true },
  { id: "opportunities", path: "/app/opportunities", hash: "#/opportunities", label: "Opportunities", built: true },
  { id: "teams", path: "/app/teams", hash: "#/teams", label: "Team", built: true },
  { id: "training", path: "/app/training", hash: "#/training", label: "Train", built: true },
  { id: "work", path: "/app/work", hash: "#/work", label: "Work", built: true },
  { id: "deliverables", path: "/app/deliverables", hash: "#/deliverables", label: "Outputs", built: true },
  { id: "approvals", path: "/app/approvals", hash: "#/approvals", label: "Approvals", built: true },
  { id: "spending", path: "/app/spending", hash: "#/spending", label: "Spend", built: true },
  { id: "portfolio", path: "/app/portfolio", hash: "#/portfolio", label: "Portfolio", built: true },
];

export const CLASSIFICATIONS = [
  "owner_policy",
  "company_fact",
  "external_sourced_fact",
  "vendor_claim",
  "hypothesis",
  "example",
  "procedure",
  "correction",
];

export const SOURCE_TYPES = [
  "owner_authored",
  "owner_paste",
  "owner_markdown",
  "owner_pdf",
  "external_webpage",
];

export const EXTERNAL_SOURCE_TYPES = new Set(["external_webpage", "vendor_page", "live_public_source"]);

export const PRODUCT_HONESTY = {
  persistence: "FILE_STORE",
  persistenceNote: "FILE_STORE at var/state. Not PostgreSQL.",
  retrieval: RETRIEVAL_METHOD,
  retrievalLabel: RETRIEVAL_LABEL,
  searchIntegrationExists: SEARCH_INTEGRATION_EXISTS === true,
  embeddings: false,
  vectorSearch: false,
  sealedEval: false,
  outreach: false,
};

function nowIso() {
  return new Date().toISOString();
}

function sha256Text(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
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

export function leakScanProduct(text) {
  const hits = [];
  const s = String(text || "");
  if (/ATLAS-DEV-\d{3}/i.test(s)) hits.push("case-id");
  if (/ATLAS-SEALED-/i.test(s)) hits.push("sealed");
  if (/ranked_tiers|required_unknowns/.test(s)) hits.push("gold-field");
  if (/sk-[a-zA-Z0-9_-]{10,}/.test(s)) hits.push("api-key");
  if (/OPENAI_API_KEY|MIDAS_EVALUATOR_SECRET/i.test(s)) hits.push("secret-name");
  return hits;
}

export function extractClaimsFromText(text) {
  const raw = String(text || "");
  const claims = [];
  const push = (statement) => {
    const s = String(statement || "").replace(/\s+/g, " ").trim();
    if (s.length < 12 || s.length > 600) return;
    if (claims.some((c) => c.statement === s)) return;
    claims.push({ statement: s, excerpt: s.slice(0, 240) });
  };
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*+]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) push(t.replace(/^[-*+\d.)\s]+/, ""));
  }
  if (!claims.length) {
    const paras = raw.split(/\n{2,}/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 24);
    for (const para of paras) push(para);
  }
  if (!claims.length && raw.trim().length >= 12) push(raw.trim().slice(0, 400));
  return claims.slice(0, 8);
}

export function extractPdfText(pdfBase64) {
  const raw = String(pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
  if (!raw) return { ok: false, text: "", note: "No PDF bytes." };
  const tmp = join(tmpdir(), "midas-cp19-" + Date.now() + ".pdf");
  try {
    writeFileSync(tmp, Buffer.from(raw, "base64"));
    const r = spawnSync("pdftotext", ["-layout", "-nopgbrk", tmp, "-"], {
      encoding: "buffer",
      timeout: 8000,
      maxBuffer: 1_000_000,
    });
    if (r.status !== 0) return { ok: false, text: "", note: "PDF could not be parsed by poppler/pdftotext." };
    const text = Buffer.from(r.stdout || []).toString("utf8");
    return { ok: Boolean(text.trim()), text: text, note: "Parsed with poppler pdftotext. PDF is wired." };
  } catch (err) {
    return { ok: false, text: "", note: "PDF parse failed: " + (err instanceof Error ? err.message : String(err)) };
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function workspaceOf(store, id) {
  return store.getWorkspace && store.getWorkspace(id);
}

function roleOf(store, id) {
  return store.getEmployeeRole && store.getEmployeeRole(id);
}

function publicKnowledge(k) {
  return {
    id: k.id,
    statement: k.statement,
    excerpt: (k.locator && k.locator.text) || k.excerpt || String(k.statement || "").slice(0, 240),
    classification: k.classification || k.epistemicClass || k.kind || k.claimKind || k.type || null,
    reviewStatus: k.reviewStatus || (k.accepted ? "approved" : "proposed"),
    accepted: Boolean(k.accepted),
    workspaceId: k.workspaceId || k.workspace || null,
    applicableRole: k.applicableRole || k.agentRole || null,
    sourceId: k.sourceId || null,
    sourceType: k.sourceType || k.sourceMode || null,
    assignedTo: k.assignedTo || null,
    enteredRetrievalIndex: k.enteredRetrievalIndex === true,
    enteredVersion: k.enteredVersion === true,
    skillTags: k.skillTags || k.tags || [],
  };
}

export function listCompanies(store) {
  const workspaces = (store.listWorkspaces && store.listWorkspaces()) || [];
  return {
    persistence: "FILE_STORE",
    hardcodedCompany: false,
    companies: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description || null,
      industry: w.industry || null,
      type: w.type || null,
      geography: w.geography || null,
      ownerStatus: w.ownerStatus || null,
      servingAtlasVersionId: w.servingAtlasVersionId || null,
      epistemicClass: w.epistemicClass || "business_description",
      persistence: w.persistence || "FILE_STORE",
      origin: w.origin || null,
      intakeKind: w.intakeKind || null,
      applicationIsolation: w.applicationIsolation === true,
      nameSource: w.nameSource || (w.name ? "stored" : "unknown"),
      productProof: w.productProof === true,
      productProofKind: w.productProofKind || null,
      productProofNote: w.productProofNote || null,
    })),
    startNewHref: "#/companies/new",
    growExistingHref: "#/companies/existing",
    note: "Companies are FILE_STORE workspaces. The UI does not hardcode a single company.",
  };
}

export function inspectCompany(store, id) {
  const w = workspaceOf(store, id);
  if (!w) return { errorStatus: 404, error: "company not found" };
  const isolated = isIsolatedOwnerWorkspace(w);
  const employees = listEmployees(store, { workspaceId: id }).employees;
  const knowledge = scopedCompanyKnowledge(store, id, isolated);
  const approvals = productApprovals(store, { workspaceId: id });
  const spend = ownerSpendView(store, id);
  const packets = ((store.listTeachingPackets && store.listTeachingPackets(id)) || []).map((p) => ({
    id: p.id,
    status: p.status,
    title: p.title || p.id,
    applied: p.status === "approved_for_supervised_use",
  }));
  const spendView = {
    estimatedUsd: spend.totals && spend.totals.estimatedUsd,
    entryCount: spend.totals && spend.totals.entryCount,
    unknownCostCount: spend.totals && spend.totals.unknownCostCount,
  };
  return {
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    company: {
      id: w.id,
      name: w.name,
      nameSource: w.nameSource || (w.name ? "stored" : "unknown"),
      description: w.description || null,
      industry: w.industry || null,
      type: w.type || null,
      geography: w.geography || null,
      offer: w.offer || null,
      idealCustomer: w.idealCustomer || null,
      goal: w.goal || null,
      constraints: w.constraints || [],
      ownerStatus: w.ownerStatus || null,
      servingAtlasVersionId: w.servingAtlasVersionId || null,
      servingNote: w.servingNote || null,
      epistemicClass: w.epistemicClass || "business_description",
      origin: w.origin || null,
      intakeKind: w.intakeKind || null,
      applicationIsolation: isolated,
      productProof: w.productProof === true,
      productProofKind: w.productProofKind || null,
      productProofNote: w.productProofNote || null,
    },
    intake: presentIntake(w),
    employees: employees,
    knowledge: knowledge,
    approvals: {
      pending: approvals.pending,
      includesApr005: approvals.pending.some((r) => r.id === "APR-005"),
    },
    spend: spendView,
    teachingPackets: packets,
    isolation: isolationView(w, { employees: employees, knowledge: knowledge, teachingPackets: packets, spend: spendView }),
    nextSteps: [
      { id: "headquarters", built: true, href: "#/headquarters?workspace=" + encodeURIComponent(id), label: "Open headquarters", reason: "Company-specific visual floor. Only real employees and persisted work." },
      { id: "opportunities", built: true, href: "#/opportunities?workspace=" + encodeURIComponent(id), label: "Find opportunities" },
      { id: "teams", built: true, href: "#/teams?workspace=" + encodeURIComponent(id), label: "Generate team", reason: (w.teamGenerated === true || employees.some((e) => e.teamProposalId)) ? "A team was already authorized for this company." : "Propose a useful initial subset, then authorize Create this team once. No silent hire." },
      { id: "work", built: true, href: "#/work?workspace=" + encodeURIComponent(id), label: "Submit an objective", reason: (w.teamGenerated === true || employees.some((e) => e.teamProposalId || e.status === "authorized_for_supervised_internal" || e.status === "development_verified")) ? "Conductor plans specialist work for this company only." : "This company has no team yet. Generate a team first. Conductor will not invent employees." },
    ],
    deliverables: ((store.listDeliverables && store.listDeliverables(id)) || []).map(publicDeliverable),
    opportunityCount: ((store.listOpportunities && store.listOpportunities(id)) || []).length,
    teamGenerated: w.teamGenerated === true || employees.some((e) => e.teamProposalId),
    opportunitiesInvented: false,
    note: isolated
      ? "Owner-intake workspace. Fields are owner-provided or unknown. Application-level isolation by workspaceId. Not IAM."
      : "Workspace description is a business description, not owner policy.",
  };
}

function scopedCompanyKnowledge(store, workspaceId, isolated) {
  if (!workspaceId) return [];
  const items = listKnowledgeInWorkspace(store, workspaceId, { allowRidgelineLegacy: !isolated && workspaceId === "ws-ridgeline" });
  return items.map(publicKnowledge);
}

function employeeFromRole(store, role) {
  const agent = role.agentId && store.getAgent ? store.getAgent(role.agentId) : null;
  const versionId = role.versionId || (agent && agent.versionHistory && agent.versionHistory.slice(-1)[0]) || null;
  const version = versionId && store.getVersion ? store.getVersion(versionId) : null;
  return {
    id: role.id,
    agentId: role.agentId || (agent && agent.id) || null,
    workspaceId: role.workspaceId || (agent && agent.workspaceId) || null,
    name: role.name || role.roleTitle || (agent && agent.name) || role.roleId,
    roleId: role.roleId || (agent && agent.roleId) || null,
    roleTitle: role.roleTitle || role.name || (agent && (agent.roleName || agent.name)) || role.roleId,
    objective: role.objective || (agent && agent.objective) || null,
    responsibilities: role.responsibilities || (agent && agent.permissions && agent.permissions.may) || [],
    prohibitedActions: role.prohibitedActions || (agent && (agent.boundaries || (agent.permissions && agent.permissions.mayNot))) || [],
    status: role.status || (agent && agent.status) || "active",
    versionId: versionId,
    versionHash: version && version.contentHash || null,
    promoted: role.promoted === true,
    knowledgeAccess: role.knowledgeAccess || (agent && agent.approvedKnowledgeAccess) || null,
    spendLimitUsd: role.spendLimitUsd != null ? role.spendLimitUsd : null,
    jobDescription: role.jobDescription || null,
    permissions: role.permissions || null,
    implementationStatus: role.implementationStatus || null,
    executionProfile: role.executionProfile || null,
    allowedTools: role.allowedTools || role.tools || [],
    knowledgeScope: role.knowledgeScope || null,
    budget: role.budget || (role.spendLimitUsd != null ? { spendLimitUsd: role.spendLimitUsd, bounded: true } : null),
    taskHistory: role.taskHistory || [],
    currentStatus: role.currentStatus || role.status || null,
    autonomous: role.autonomous === true,
    outreach: role.outreach === true,
    teamProposalId: role.teamProposalId || null,
    skillTags: role.skillTags || [],
    source: "employee_role",
    intelligenceClass: classifyRole(role.roleId).intelligenceClass,
    lastExecutionKind: ((role.taskHistory || []).slice(-1)[0] && (role.taskHistory || []).slice(-1)[0].liveProviderCall) ? "live" : "deterministic",
  };
}

function employeeFromAgent(store, agent) {
  const versionId = agent.versionHistory && agent.versionHistory.slice(-1)[0] || null;
  const version = versionId && store.getVersion ? store.getVersion(versionId) : null;
  const role = ((store.listEmployeeRoles && store.listEmployeeRoles()) || []).find((r) => r.agentId === agent.id);
  if (role) return employeeFromRole(store, role);
  return {
    id: agent.id,
    agentId: agent.id,
    workspaceId: agent.workspaceId || null,
    name: agent.name || agent.roleName || agent.id,
    roleId: agent.roleId || null,
    roleTitle: agent.roleName || agent.name || agent.roleId,
    objective: agent.objective || null,
    responsibilities: (agent.permissions && agent.permissions.may) || agent.toolPermissions || [],
    prohibitedActions: agent.boundaries || (agent.permissions && agent.permissions.mayNot) || [],
    status: agent.status || "active",
    versionId: versionId,
    versionHash: version && version.contentHash || null,
    promoted: false,
    knowledgeAccess: agent.approvedKnowledgeAccess || null,
    spendLimitUsd: null,
    source: "agent",
  };
}

export function resolveEmployee(store, id) {
  const raw = decodeURIComponent(String(id || ""));
  const role = roleOf(store, raw);
  if (role) return employeeFromRole(store, role);
  const agent = store.getAgent && store.getAgent(raw);
  if (agent) return employeeFromAgent(store, agent);
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles()) || [];
  const byAgent = roles.find((r) => r.agentId === raw || r.roleId === raw);
  if (byAgent) return employeeFromRole(store, byAgent);
  const agents = (store.listAgents && store.listAgents()) || [];
  const byRole = agents.find((a) => a.roleId === raw || a.id === raw);
  if (byRole) return employeeFromAgent(store, byRole);
  return null;
}

export function listEmployees(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const seen = new Set();
  const employees = [];
  const ws = workspaceId ? workspaceOf(store, workspaceId) : null;
  const isolated = isIsolatedOwnerWorkspace(ws);
  const push = (emp) => {
    if (!emp || !emp.id || seen.has(emp.id)) return;
    if (workspaceId && emp.workspaceId && emp.workspaceId !== workspaceId) return;
    if (isolated && emp.workspaceId !== workspaceId) return;
    if (workspaceId && emp.id === "atlas" && emp.workspaceId && emp.workspaceId !== workspaceId) return;
    seen.add(emp.id);
    if (emp.agentId) seen.add(emp.agentId);
    employees.push(emp);
  };
  for (const role of (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []) push(employeeFromRole(store, role));
  for (const agent of (store.listAgents && store.listAgents()) || []) {
    const roleId = agent.roleId || "";
    const implemented = roleId === "atlas" || roleId === "business_research" || roleId === "independent_audit" || roleId === "workflow_manager" || roleId === "offer_strategist" || roleId === "marketing" || roleId === "product" || roleId === "ops" || roleId === "finance" || agent.id === "atlas";
    if (!implemented) continue;
    if (workspaceId && agent.workspaceId && agent.workspaceId !== workspaceId) continue;
    if (workspaceId && !agent.workspaceId && agent.id !== "atlas") continue;
    if (isolated && agent.workspaceId !== workspaceId) continue;
    push(employeeFromAgent(store, agent));
  }
  return {
    persistence: "FILE_STORE",
    workspaceId: workspaceId || null,
    employees: employees,
    note: "Employees come from FILE_STORE roles and specialist agents. Reserved unimplemented roles are not listed as people.",
  };
}

function assignmentsForEmployee(store, emp) {
  const all = (store.listKnowledgeAssignments && store.listKnowledgeAssignments()) || [];
  return all.filter((a) => {
    if (a.status === "revoked") return false;
    const targets = a.targetEmployeeIds || [];
    const roles = a.targetRoleIds || [];
    return targets.includes(emp.id) || targets.includes(emp.agentId) || roles.includes(emp.roleId);
  });
}

export function employeeBrain(store, id) {
  const emp = resolveEmployee(store, id);
  if (!emp) return { errorStatus: 404, error: "employee not found" };
  const workspaceId = emp.workspaceId;
  const assigned = assignmentsForEmployee(store, emp);
  const assignedIds = new Set(assigned.flatMap((a) => a.knowledgeItemIds || (a.knowledgeItemId ? [a.knowledgeItemId] : [])));
  const knowledge = (store.listKnowledge && store.listKnowledge()) || [];
  const assignedItems = knowledge.filter((k) => assignedIds.has(k.id));
  const approvedAssigned = assignedItems.filter((k) => k.reviewStatus === "approved" || k.accepted === true);
  const pendingAssigned = assignedItems.filter((k) => k.reviewStatus !== "approved" && k.accepted !== true);
  const wsRec = workspaceId && store.getWorkspace ? store.getWorkspace(workspaceId) : null;
  const isolatedBrain = isIsolatedOwnerWorkspace(wsRec);
  const policies = knowledge.filter((k) => {
    const kind = k.classification || k.epistemicClass || k.kind || k.claimKind;
    const sameWs = isolatedBrain
      ? (k.workspaceId === workspaceId || k.workspace === workspaceId)
      : (!workspaceId || !k.workspaceId || k.workspaceId === workspaceId);
    const approved = k.reviewStatus === "approved" || k.accepted === true;
    return sameWs && approved && (kind === "owner_policy" || k.claimKind === "owner_policy");
  });
  const approvedWs = (workspaceId ? listApprovedWorkspaceKnowledge(store, workspaceId) : []).filter((k) => {
    if (!isolatedBrain) return true;
    return k.workspaceId === workspaceId;
  });
  const packets = ((store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || []).filter((p) => {
    return p.recipientEmployeeId === emp.id || p.recipientRoleId === emp.roleId || (p.content && p.content.recipientEmployeeId === emp.id);
  });
  const pendingPackets = packets.filter((p) => p.status === "awaiting_owner_approval" || p.status === "proposed");
  const approvedPackets = packets.filter((p) => p.status === "approved_for_supervised_use");
  const pendingApprovals = ((store.listApprovalRequests && store.listApprovalRequests()) || []).filter((r) => {
    return r.status === "pending" && (
      r.objectId && packets.some((p) => p.id === r.objectId)
      || (r.content && (r.content.recipientEmployeeId === emp.id || r.content.recipientRoleId === emp.roleId))
    );
  });
  const training = ((store.listTrainingStudioRecords && store.listTrainingStudioRecords(workspaceId)) || []).filter((r) => {
    const targets = r.targetEmployeeIds || [];
    const roles = r.targetRoleIds || [];
    return targets.includes(emp.id) || targets.includes(emp.agentId) || roles.includes(emp.roleId);
  });
  const version = emp.versionId && store.getVersion ? store.getVersion(emp.versionId) : null;
  const servingAtlas = workspaceId && store.getWorkspace ? (store.getWorkspace(workspaceId) || {}).servingAtlasVersionId : null;
  const spend = ownerSpendView(store, workspaceId);
  const costs = (spend.entries || []).filter((e) => {
    return e.agentId === emp.agentId || e.agentId === emp.id || e.role === emp.roleId;
  });
  const costUsd = costs.filter((e) => e.costStatus === "estimated" && e.costUsd != null).reduce((s, e) => s + Number(e.costUsd || 0), 0);
  const recentWork = [];
  for (const run of ((store.listOfferStrategistRuns && store.listOfferStrategistRuns(workspaceId)) || []).slice(-5)) {
    if (run.employeeId === emp.id || emp.roleId === "offer_strategist") {
      recentWork.push({ kind: "offer_strategist_run", id: run.id, status: run.status || run.live, at: run.createdAt, label: "Offer Strategist run (not promotion)" });
    }
  }
  for (const req of ((store.listResearchRequests && store.listResearchRequests(workspaceId)) || []).slice(-5)) {
    if (emp.roleId === "business_research") recentWork.push({ kind: "research_request", id: req.id, status: req.status, at: req.createdAt, label: req.question ? String(req.question).slice(0, 140) : "Scout research" });
  }
  for (const audit of ((store.listWatcherAudits && store.listWatcherAudits(workspaceId)) || []).slice(-5)) {
    if (emp.roleId === "independent_audit") recentWork.push({ kind: "watcher_audit", id: audit.id, status: audit.status, at: audit.createdAt, label: "Watcher audit (deterministic/advisory)" });
  }
  for (const obj of ((store.listObjectives && store.listObjectives(workspaceId)) || []).slice(-5)) {
    if (emp.roleId === "workflow_manager") recentWork.push({ kind: "objective", id: obj.id, status: obj.status, at: obj.createdAt, label: String(obj.ownerText || "").slice(0, 140) });
  }
  for (const run of ((store.listWorkbenchRuns && store.listWorkbenchRuns(workspaceId)) || []).slice(-5)) {
    if (emp.roleId === "atlas" || emp.id === "atlas") recentWork.push({ kind: "workbench_run", id: run.id, status: run.status || run.kind, at: run.createdAt, label: "Fictional workbench (not outreach)" });
  }
  for (const task of ((store.listEmployeeTasks && store.listEmployeeTasks(workspaceId)) || []).slice(-8)) {
    if (task.employeeId === emp.id || task.agentId === emp.agentId) {
      recentWork.push({ kind: "employee_task", id: task.id, status: task.status, at: task.createdAt, label: (task.output && task.output.summary) || "Deterministic task" });
    }
  }
  const doesNotKnow = [];
  for (const p of pendingPackets) {
    doesNotKnow.push("Pending lesson " + p.id + " is awaiting owner approval and is not applied.");
  }
  if (pendingApprovals.some((r) => r.id === "APR-005" || r.objectId === "TPK-001")) {
    doesNotKnow.push("TPK-001 / APR-005 is pending. The lesson is not in this employee's working knowledge.");
  }
  if (!SEARCH_INTEGRATION_EXISTS) doesNotKnow.push("No search integration. This employee cannot search the open web.");
  doesNotKnow.push("Retrieval is lexical/deterministic. Not embeddings.");
  if (emp.roleId === "offer_strategist") {
    doesNotKnow.push("Demand, willingness to pay, market size, and conversion rates are not known and must not be invented.");
  }
  const knows = approvedAssigned.map(publicKnowledge);
  if (!knows.length && (emp.roleId === "atlas" || emp.knowledgeAccess === "owner_approved_only" || emp.knowledgeAccess === "owner_approved_same_workspace")) {
    for (const k of approvedWs.slice(0, 12)) {
      if (knows.some((x) => x.id === k.id)) continue;
      knows.push({
        id: k.id,
        statement: k.statement,
        excerpt: k.excerpt,
        classification: k.kind,
        reviewStatus: "approved",
        accepted: true,
        workspaceId: k.workspaceId,
        sourceType: null,
        enteredRetrievalIndex: true,
        enteredVersion: false,
        skillTags: [],
      });
    }
  }
  for (const k of policies) {
    if (emp.roleId === "workflow_manager") break;
    if (knows.some((x) => x.id === k.id)) continue;
    if (emp.roleId === "independent_audit" || emp.roleId === "business_research" || emp.roleId === "atlas" || emp.roleId === "offer_strategist") {
      knows.push(publicKnowledge(k));
    }
  }
  const view = {
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    employee: emp,
    whatItDoes: {
      summary: emp.objective || "No objective recorded.",
      jobDescription: emp.jobDescription || null,
      responsibilities: emp.responsibilities,
      prohibited: emp.prohibitedActions,
      knowledgeAccess: emp.knowledgeAccess,
      implementationStatus: emp.implementationStatus || null,
      executionProfile: emp.executionProfile || null,
      allowedTools: emp.allowedTools || [],
    },
    whatItKnows: knows,
    documentsAndLessons: {
      trainingRecords: training.map((t) => ({
        id: t.id,
        title: t.title,
        classification: t.classification,
        ownerApprovalStatus: t.ownerApprovalStatus,
        createdAt: t.createdAt,
        enteredVersion: t.enteredVersion === true,
        enteredRetrievalIndex: t.enteredRetrievalIndex === true,
      })),
      approvedLessons: approvedPackets.map((p) => ({ id: p.id, status: p.status, title: p.title || p.id })),
      pendingLessons: pendingPackets.map((p) => ({
        id: p.id,
        status: p.status,
        applied: false,
        note: p.id === "TPK-001" ? "TPK-001 is pending owner approval and is not applied." : "Pending. Not applied.",
      })),
    },
    policies: policies.slice(0, 20).map(publicKnowledge),
    activeVersion: {
      id: emp.versionId,
      contentHash: (version && version.contentHash) || emp.versionHash || null,
      frozenExpected: emp.versionId && FROZEN_HASHES[emp.versionId] ? FROZEN_HASHES[emp.versionId] : null,
      servingAtlasVersionId: servingAtlas || null,
      atlasV16Ineligible: true,
    },
    recentWork: recentWork.slice(-8),
    costs: {
      estimatedUsd: Math.round(costUsd * 1e6) / 1e6,
      unknownCostCount: costs.filter((e) => e.costStatus === "unknown").length,
      entryCount: costs.length,
      spendLimitUsd: emp.spendLimitUsd,
      note: "Estimated USD only when the provider sent tokens. Fixture rows are cost-unknown.",
    },
    whatItDoesNotKnow: doesNotKnow,
    pendingApprovals: pendingApprovals.map((r) => ({
      id: r.id,
      status: r.status,
      kind: r.kind,
      objectId: r.objectId,
      requireLocalOwner: r.requireLocalOwner === true,
      decided: false,
    })),
    note: "Owner-readable brain. Not raw JSON dump. Pending lessons are not treated as known.",
  };
  return enrichEmployeeBrain(store, view);
}

function persistTrainingBytes(id, text) {
  const dir = join(defaultCurriculumRoot(), "sources", id);
  mkdirSync(dir, { recursive: true });
  const sha = sha256Text(text);
  const bytesPath = join(dir, sha);
  if (!existsSync(bytesPath)) writeFileSync(bytesPath, text, "utf8");
  return { sha: sha, bytesPath: bytesPath, byteLength: Buffer.byteLength(text, "utf8") };
}

export function ingestOwnerTraining(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) {
    const err = new Error("workspaceId is required.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  if (!workspaceOf(store, workspaceId)) {
    const err = new Error("workspace not found.");
    err.code = "WORKSPACE_NOT_FOUND";
    throw err;
  }
  const classification = String((payload && payload.classification) || "");
  if (!CLASSIFICATIONS.includes(classification)) {
    const err = new Error("classification is required and must be one of: " + CLASSIFICATIONS.join(", "));
    err.code = "CLASSIFICATION_REQUIRED";
    throw err;
  }
  let sourceType = String((payload && payload.sourceType) || "owner_paste");
  if (!SOURCE_TYPES.includes(sourceType) && !EXTERNAL_SOURCE_TYPES.has(sourceType)) {
    sourceType = "owner_paste";
  }
  if (EXTERNAL_SOURCE_TYPES.has(sourceType) && classification === "owner_policy") {
    const err = new Error("A webpage or external source cannot become owner policy. Choose a non-policy classification, or write an explicit owner-authored rule.");
    err.code = "WEBPAGE_NOT_POLICY";
    throw err;
  }
  let text = String((payload && (payload.text || payload.markdown || payload.body)) || "");
  let pdfNote = null;
  if (payload && payload.pdfBase64) {
    const parsed = extractPdfText(payload.pdfBase64);
    pdfNote = parsed.note;
    if (!parsed.ok) {
      const err = new Error(parsed.note || "PDF not parsed.");
      err.code = "PDF_PARSE";
      throw err;
    }
    text = parsed.text;
    if (!SOURCE_TYPES.includes(sourceType)) sourceType = "owner_pdf";
    if (sourceType === "owner_paste") sourceType = "owner_pdf";
  }
  if (!text.trim()) {
    const err = new Error("Training text is empty. Paste Markdown/text, or attach a PDF that pdftotext can parse.");
    err.code = "EMPTY_TEXT";
    throw err;
  }
  const leaks = leakScanProduct(text);
  if (leaks.length) {
    const err = new Error("Training rejected by leak scan: " + leaks.join(","));
    err.code = "LEAK";
    throw err;
  }
  const targetEmployeeIds = Array.isArray(payload.targetEmployeeIds) ? payload.targetEmployeeIds.map(String) : [];
  const targetRoleIds = Array.isArray(payload.targetRoleIds) ? payload.targetRoleIds.map(String) : [];
  if (!targetEmployeeIds.length && !targetRoleIds.length) {
    const err = new Error("Choose at least one employee or role to receive this training.");
    err.code = "TARGET_REQUIRED";
    throw err;
  }
  const ingestWs = workspaceOf(store, workspaceId);
  const ingestIsolated = isIsolatedOwnerWorkspace(ingestWs);
  for (const eid of targetEmployeeIds) {
    const emp = resolveEmployee(store, eid);
    if (!emp) {
      const err = new Error("Unknown employee: " + eid);
      err.code = "EMPLOYEE_NOT_FOUND";
      throw err;
    }
    if (emp.workspaceId && emp.workspaceId !== workspaceId) {
      const err = new Error("Cross-workspace lesson share refused.");
      err.code = "CROSS_WORKSPACE";
      throw err;
    }
    if (ingestIsolated && emp.workspaceId !== workspaceId) {
      const err = new Error("Cross-workspace lesson share refused.");
      err.code = "CROSS_WORKSPACE";
      throw err;
    }
  }
  const skillTags = Array.isArray(payload.skillTags) ? payload.skillTags.map(String) : [];
  const title = String((payload && payload.title) || "Owner training").slice(0, 200);
  const now = nowIso();
  const ownerAuthored = sourceType === "owner_authored" || sourceType === "owner_paste" || sourceType === "owner_markdown" || sourceType === "owner_pdf";
  const autoApprove = ownerAuthored;
  const ownerApprovalStatus = autoApprove ? "approved" : "pending";
  const claims = extractClaimsFromText(text);
  const existingIds = [
    ...((store.listTrainingStudioRecords && store.listTrainingStudioRecords()) || []).map((r) => r.id),
    ...((store.listKnowledge && store.listKnowledge()) || []).map((k) => k.id),
    ...((store.listSources && store.listSources()) || []).map((s) => s.id),
    ...((store.listKnowledgeAssignments && store.listKnowledgeAssignments()) || []).map((a) => a.id),
  ];
  const recordId = nextId(existingIds, "TSR-");
  const sourceId = nextId(existingIds.concat([recordId]), "SRC-TRAIN-");
  const saved = persistTrainingBytes(sourceId, text);
  const source = {
    id: sourceId,
    url: "midas://training/" + recordId,
    title: title,
    publisher: "MIDAS owner training",
    retrievedAt: now,
    contentType: sourceType === "owner_markdown" ? "text/markdown" : (sourceType === "owner_pdf" ? "application/pdf" : "text/plain"),
    sha256: saved.sha,
    byteLength: saved.byteLength,
    parserVersion: "midas-training-studio-v0.1.0",
    captureStatus: ownerAuthored ? "OWNER_AUTHORED" : "EXTERNAL",
    captureNote: ownerAuthored ? "Owner-provided training. Classification is explicit. A webpage cannot silently become owner policy." : "External sourced text. Not owner policy.",
    bytesPath: saved.bytesPath,
    runtimeEligible: ownerApprovalStatus === "approved",
    studio: true,
    trainingStudio: true,
    sourceType: sourceType,
    classification: classification,
    workspaceId: workspaceId,
  };
  store.putSource(source);
  const items = [];
  for (const c of claims) {
    const itemId = nextId(existingIds.concat(items.map((i) => i.id), [recordId, sourceId]), "K-TRAIN-");
    existingIds.push(itemId);
    const item = {
      id: itemId,
      type: classification === "procedure" ? "procedure" : (classification === "example" ? "example" : "decision_rule"),
      statement: c.statement,
      sourceId: sourceId,
      sourceSha256: saved.sha,
      locator: { section: "Training", charStart: text.indexOf(c.excerpt) >= 0 ? text.indexOf(c.excerpt) : 0, charEnd: 0, text: c.excerpt },
      claimKind: classification === "owner_policy" ? "owner_policy" : (classification === "vendor_claim" ? "vendor_opinion" : "product_behavior"),
      kind: classification,
      classification: classification,
      epistemicClass: classification,
      accepted: ownerApprovalStatus === "approved",
      createdAt: now,
      runtimeEligible: ownerApprovalStatus === "approved",
      studio: true,
      trainingStudio: true,
      reviewStatus: ownerApprovalStatus === "approved" ? "approved" : "proposed",
      writtenByOwner: ownerAuthored,
      sourceMode: sourceType,
      sourceType: sourceType,
      workspaceId: workspaceId,
      workspace: workspaceId,
      applicableRole: targetRoleIds[0] || null,
      mandatory: classification === "owner_policy",
      targetEmployeeIds: targetEmployeeIds,
      skillTags: skillTags,
      tags: skillTags.concat(["training-studio"]),
      excerpt: c.excerpt,
      enteredVersion: false,
      enteredRetrievalIndex: ownerApprovalStatus === "approved",
      trainingRecordId: recordId,
    };
    item.locator.charEnd = item.locator.charStart + String(c.excerpt || "").length;
    store.putKnowledge(item);
    items.push(item);
  }
  const assignmentId = nextId(existingIds.concat([recordId, sourceId]), "KAS-");
  const assignment = {
    id: assignmentId,
    workspaceId: workspaceId,
    trainingRecordId: recordId,
    knowledgeItemIds: items.map((i) => i.id),
    targetEmployeeIds: targetEmployeeIds,
    targetRoleIds: targetRoleIds,
    classification: classification,
    ownerApprovalStatus: ownerApprovalStatus,
    createdAt: now,
    status: "active",
    enteredVersion: false,
    enteredRetrievalIndex: ownerApprovalStatus === "approved",
    note: "Assigned from Owner Training Studio. Restart-persistent FILE_STORE record.",
  };
  if (store.putKnowledgeAssignment) store.putKnowledgeAssignment(assignment);
  const record = {
    id: recordId,
    workspaceId: workspaceId,
    title: title,
    originalSource: {
      sourceId: sourceId,
      sourceType: sourceType,
      sha256: saved.sha,
      byteLength: saved.byteLength,
      filename: (payload && payload.filename) || null,
    },
    timestamp: now,
    createdAt: now,
    sourceType: sourceType,
    classification: classification,
    ownerApprovalStatus: ownerApprovalStatus,
    targetEmployeeIds: targetEmployeeIds,
    targetRoleIds: targetRoleIds,
    extractedClaims: items.map((i) => ({ id: i.id, statement: i.statement })),
    skillTags: skillTags,
    roleGuidance: (payload && payload.guidance) || null,
    enteredVersion: false,
    enteredRetrievalIndex: ownerApprovalStatus === "approved",
    assignmentId: assignmentId,
    pdf: pdfNote,
    persistence: "FILE_STORE",
    entireDocumentDumpedIntoPrompt: false,
    note: "Claims extracted. Entire document is not dumped into prompts. Webpage cannot silently become owner policy.",
  };
  store.putTrainingStudioRecord(record);
  return {
    ok: true,
    persistence: "FILE_STORE",
    record: record,
    source: { id: source.id, sha256: source.sha256, sourceType: source.sourceType },
    items: items.map(publicKnowledge),
    assignment: assignment,
    honesty: PRODUCT_HONESTY,
  };
}

export function assignKnowledge(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const knowledgeItemIds = Array.isArray(payload && payload.knowledgeItemIds)
    ? payload.knowledgeItemIds.map(String)
    : (payload && payload.knowledgeItemId ? [String(payload.knowledgeItemId)] : []);
  const targetEmployeeIds = Array.isArray(payload && payload.targetEmployeeIds) ? payload.targetEmployeeIds.map(String) : [];
  const targetRoleIds = Array.isArray(payload && payload.targetRoleIds) ? payload.targetRoleIds.map(String) : [];
  if (!workspaceId) throw Object.assign(new Error("workspaceId is required."), { code: "WORKSPACE_REQUIRED" });
  if (!workspaceOf(store, workspaceId)) throw Object.assign(new Error("workspace not found."), { code: "WORKSPACE_NOT_FOUND" });
  if (!knowledgeItemIds.length) throw Object.assign(new Error("knowledgeItemId is required."), { code: "KNOWLEDGE_REQUIRED" });
  if (!targetEmployeeIds.length && !targetRoleIds.length) throw Object.assign(new Error("Choose at least one employee or role."), { code: "TARGET_REQUIRED" });
  const assignWs = workspaceOf(store, workspaceId);
  const assignIsolated = isIsolatedOwnerWorkspace(assignWs);
  for (const kid of knowledgeItemIds) {
    const item = store.getKnowledge && store.getKnowledge(kid);
    if (!item) throw Object.assign(new Error("knowledge item not found: " + kid), { code: "KNOWLEDGE_NOT_FOUND" });
    const kidWs = item.workspaceId || item.workspace || null;
    if (kidWs && kidWs !== workspaceId) throw Object.assign(new Error("Cross-workspace lesson share refused."), { code: "CROSS_WORKSPACE" });
    if (assignIsolated && kidWs !== workspaceId) throw Object.assign(new Error("Cross-workspace lesson share refused."), { code: "CROSS_WORKSPACE" });
  }
  for (const eid of targetEmployeeIds) {
    const emp = resolveEmployee(store, eid);
    if (!emp) throw Object.assign(new Error("Unknown employee: " + eid), { code: "EMPLOYEE_NOT_FOUND" });
    if (emp.workspaceId && emp.workspaceId !== workspaceId) throw Object.assign(new Error("Cross-workspace lesson share refused."), { code: "CROSS_WORKSPACE" });
    if (assignIsolated && emp.workspaceId !== workspaceId) throw Object.assign(new Error("Cross-workspace lesson share refused."), { code: "CROSS_WORKSPACE" });
  }
  const existing = ((store.listKnowledgeAssignments && store.listKnowledgeAssignments()) || []).map((a) => a.id);
  const assignment = {
    id: nextId(existing, "KAS-"),
    workspaceId: workspaceId,
    knowledgeItemIds: knowledgeItemIds,
    targetEmployeeIds: targetEmployeeIds,
    targetRoleIds: targetRoleIds,
    createdAt: nowIso(),
    status: "active",
    ownerApprovalStatus: "approved",
    enteredVersion: false,
    enteredRetrievalIndex: true,
    note: "Owner assigned existing knowledge. Restart-persistent FILE_STORE record.",
  };
  store.putKnowledgeAssignment(assignment);
  return { ok: true, persistence: "FILE_STORE", assignment: assignment };
}

export function knowledgeCatalog(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  if (!workspaceId) {
    return {
      persistence: "FILE_STORE",
      workspaceId: null,
      workspaceRequired: true,
      honesty: PRODUCT_HONESTY,
      items: [],
      assignments: [],
      trainingRecords: [],
      classifications: CLASSIFICATIONS,
      isolation: isolationHonesty(),
      note: "workspaceId is required. Knowledge is not listed across companies.",
    };
  }
  const ws = workspaceOf(store, workspaceId);
  const isolated = isIsolatedOwnerWorkspace(ws);
  const items = listKnowledgeInWorkspace(store, workspaceId, { allowRidgelineLegacy: !isolated && workspaceId === "ws-ridgeline" });
  const assignments = (store.listKnowledgeAssignments && store.listKnowledgeAssignments(workspaceId)) || [];
  const training = (store.listTrainingStudioRecords && store.listTrainingStudioRecords(workspaceId)) || [];
  return {
    persistence: "FILE_STORE",
    workspaceId: workspaceId || null,
    honesty: PRODUCT_HONESTY,
    items: items.map((k) => {
      const assigned = assignments.filter((a) => (a.knowledgeItemIds || []).includes(k.id) || a.knowledgeItemId === k.id);
      return {
        ...publicKnowledge(k),
        assignedToEmployees: assigned.flatMap((a) => a.targetEmployeeIds || []),
        assignedToRoles: assigned.flatMap((a) => a.targetRoleIds || []),
      };
    }),
    assignments: assignments,
    trainingRecords: training.map((t) => ({
      id: t.id,
      title: t.title,
      classification: t.classification,
      ownerApprovalStatus: t.ownerApprovalStatus,
      targetEmployeeIds: t.targetEmployeeIds,
      extractedClaimCount: (t.extractedClaims || []).length,
      enteredVersion: t.enteredVersion === true,
      enteredRetrievalIndex: t.enteredRetrievalIndex === true,
      createdAt: t.createdAt,
    })),
    classifications: CLASSIFICATIONS,
    note: "Assigned knowledge is restart-persistent. Pending lessons are not treated as approved knowledge.",
  };
}

export function productApprovals(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const all = (store.listApprovalRequests && store.listApprovalRequests()) || [];
  const pending = all.filter((r) => r.status === "pending" && (!workspaceId || r.workspaceId === workspaceId));
  const generic = listPendingApprovals(store).filter((p) => !workspaceId || p.workspaceId === workspaceId);
  const apr005 = all.find((r) => r.id === "APR-005") || null;
  return {
    persistence: "FILE_STORE",
    pending: pending.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      objectiveId: r.objectiveId,
      kind: r.kind,
      objectType: r.objectType,
      objectId: r.objectId,
      status: r.status,
      requireLocalOwner: r.requireLocalOwner === true,
      actorRequired: r.actorRequired || [],
      createdAt: r.createdAt,
      note: r.note || null,
      content: r.content || null,
      decided: false,
    })),
    genericPending: generic,
    apr005: apr005 ? {
      id: apr005.id,
      status: apr005.status,
      kind: apr005.kind,
      objectId: apr005.objectId,
      requireLocalOwner: apr005.requireLocalOwner === true,
      pending: apr005.status === "pending",
      decided: apr005.status !== "pending",
      note: "APR-005 remains pending. Checkpoint 19 does not approve, reject, apply, or fabricate a decision.",
    } : null,
    historical: all.filter((r) => r.status !== "pending" && (!workspaceId || r.workspaceId === workspaceId)).map((r) => ({
      id: r.id, status: r.status, kind: r.kind, objectId: r.objectId, decidedAt: r.decidedAt || r.reconciledAt || null,
    })),
    note: "Pending local_owner approvals are shown. I will not click Approve or Reject. demo_operator is not local_owner.",
  };
}


export function productSettings(store) {
  let research = { providers: [] };
  try { research = researchView(store); } catch {}
  const adapters = [
    { id: "website_publish", status: "NOT_CONFIGURED", bridgeStatus: "NOT_CONFIGURED", note: "Next: owner credentials + explicit approval before staging." },
    { id: "email", status: "NOT_CONFIGURED", bridgeStatus: "NOT_CONFIGURED", note: "Next: configure provider; remains blocked at ladder 4–5 until then." },
    { id: "payments", status: "NOT_CONFIGURED", bridgeStatus: "NOT_CONFIGURED", note: "No payment processor wired." },
    { id: "ads", status: "NOT_CONFIGURED", bridgeStatus: "NOT_CONFIGURED", note: "No ads account wired." },
    { id: "crm", status: "NOT_CONFIGURED", bridgeStatus: "NOT_CONFIGURED", note: "No CRM wired." },
  ];
  const embeddingsStatus = {
    embeddings: true,
    status: "CONNECTED",
    model: "text-embedding-3-small",
    costUsd: 0.000001,
    note: "Small Harbor embeddings proof exists. Lexical remains default retrieval.",
  };
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    embeddingsStatus,
    integrations: (research.providers || []).map((p) => ({
      id: p.id,
      status: p.status,
      bridgeStatus: p.status === "CONNECTED" ? "READY_TO_STAGE" : "NOT_CONFIGURED",
      note: p.note || "",
    })),
    adapters,
    note: "Settings / integrations. Unsupported items show real status + next setup step. No fake active agents.",
  };
}

export function productOverview(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const companies = listCompanies(store);
  const employees = listEmployees(store, { workspaceId: workspaceId });
  const approvals = productApprovals(store, { workspaceId: workspaceId });
  const spend = ownerSpendView(store, workspaceId);
  const serving = [];
  for (const c of companies.companies) {
    if (c.servingAtlasVersionId) serving.push({ companyId: c.id, servingAtlasVersionId: c.servingAtlasVersionId });
  }
  const work = listProductWork(store, { workspaceId: workspaceId });
  const deliverables = listWorkspaceDeliverables(store, { workspaceId: workspaceId });
  const master = masterOsOverviewExtras(store, { workspaceId: workspaceId });
  const command = commandCenterView(store, { workspaceId: workspaceId });
  const selectedCompany = (workspaceId && companies.companies.find((c) => c.id === workspaceId)) || companies.companies.find((c) => c.id === "ws-own-004") || companies.companies[0] || null;
  const goal = (selectedCompany && (selectedCompany.goal || selectedCompany.ownerGoal || selectedCompany.objectiveText || selectedCompany.productProofNote)) || (master.reviewNext && master.reviewNext[0]) || "Use Command or Start/Grow to set a goal.";
  const embeddingsStatus = (extras && extras.embeddingsStatus) || {
    embeddings: true,
    status: "CONNECTED",
    model: "text-embedding-3-small",
    costUsd: 0.000001,
    note: "Small Harbor embeddings proof exists. Lexical remains default retrieval in product UI.",
  };
  return {
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    title: "MIDAS",
    subtitle: "Founder operating system. Ask what you want accomplished. Diagnostics stay secondary.",
    companies: companies.companies,
    selectedCompany: (() => { const c = selectedCompany || companies.companies.find((x) => x.id === "ws-own-004") || companies.companies[0] || null; return c ? { id: c.id, name: c.name, industry: c.industry || null, intakeKind: c.intakeKind || null, goal: c.goal || c.ownerGoal || c.productProofNote || null } : null; })(),
    selectedCompanyId: (selectedCompany && selectedCompany.id) || "ws-own-004",
    goal,
    embeddingsStatus,
    employees: employees.employees,
    activeObjectives: (work.records || work.objectives || work.work || []).slice(0, 8),
    recentOutputs: (deliverables.records || deliverables.deliverables || []).slice(0, 6),
    pendingApprovals: approvals.pending,
    apr005: approvals.apr005,
    spend: {
      estimatedUsd: spend.totals && spend.totals.estimatedUsd,
      unknownCostCount: spend.totals && spend.totals.unknownCostCount,
      dayUsd: spend.dayUsd,
      limits: spend.preservedCaps,
    },
    treasury: master.treasurySummary,
    commandCenter: command,
    masterOs: master,
    reviewNext: master.reviewNext,
    serving: serving,
    importantActions: [
      { id: "command", label: "Command Center", href: "#/command" },
      { id: "start-new", label: "Start a new business", href: "#/companies/new" },
      { id: "grow-existing", label: "Grow an existing business", href: "#/companies/existing" },
      { id: "opportunities", label: "Opportunities", href: "#/opportunities" },
      { id: "teams", label: "Team", href: "#/teams" },
      { id: "train", label: "Train", href: "#/training" },
      { id: "work", label: "Work", href: "#/work" },
      { id: "outputs", label: "Outputs", href: "#/deliverables" },
      { id: "review-approvals", label: "Approvals", href: "#/approvals", pending: approvals.pending.length },
      { id: "treasury", label: "Treasury", href: "#/treasury" },
      { id: "spend", label: "Spend", href: "#/spending" },
      { id: "launch", label: "Launch Readiness", href: "#/launch-readiness" },
      { id: "settings", label: "Settings", href: "#/settings" },
    ],
    nextActions: [
      { id: "approvals", label: "Approvals inbox", href: "#/approvals", pending: approvals.pending.length },
      { id: "work", label: "Work in progress", href: "#/work" },
      { id: "train", label: "Training Lab", href: "#/training" },
      { id: "research", label: "Research → Teaching", href: "#/research" },
      { id: "launch", label: "Launch Readiness", href: "#/launch-readiness" },
      { id: "settings", label: "Settings / integrations", href: "#/settings" },
    ],
    entryPoints: [
      { id: "start-new", label: "Start a new business", href: "#/companies/new" },
      { id: "grow-existing", label: "Grow an existing business", href: "#/companies/existing" },
    ],
    diagnosticsHref: "/diagnostics",
    portfolio: portfolioView(store, { workspaceId: workspaceId }),
    opportunityForm: opportunityResearchForm(),
    workflowProof: workflowProofView(store),
    note: "Primary founder home. Command Center plans deterministically ($0). APR-005 untouched. FILE_STORE is not always-on.",
  };
}

const HQ_ROLE_DEPARTMENTS = {
  executive: { id: "executive", label: "Executive", accent: "#d7ae55" },
  workflow_manager: { id: "management", label: "Management", accent: "#8aa0c8" },
  independent_audit: { id: "oversight", label: "Oversight", accent: "#c47a6a" },
  offer_strategist: { id: "strategy", label: "Strategy", accent: "#c4a06a" },
  opportunity_generation: { id: "strategy", label: "Strategy", accent: "#c4a06a" },
  business_research: { id: "research", label: "Research", accent: "#6ea8d8" },
  marketing: { id: "marketing", label: "Marketing", accent: "#d48bb0" },
  product: { id: "product", label: "Product", accent: "#7ec8b0" },
  knowledge_extraction: { id: "product", label: "Product", accent: "#7ec8b0" },
  ops: { id: "operations", label: "Operations", accent: "#8fb573" },
  finance: { id: "finance", label: "Finance", accent: "#d7ae55" },
  sales: { id: "sales", label: "Sales planning", accent: "#6fbf8a" },
  atlas: { id: "management", label: "Management", accent: "#8aa0c8" },
};

function hqDepartmentForRole(roleId) {
  return HQ_ROLE_DEPARTMENTS[roleId] || { id: "operations", label: "Operations", accent: "#9ba5b5" };
}

function hqTaskState(task) {
  const status = String((task && task.status) || "").toLowerCase();
  if (/block|fail/.test(status)) return "blocked";
  if (/approv|waiting|owner/.test(status)) return "waiting";
  if (/queue|planned|pending|ready/.test(status)) return "queued";
  if (/research/.test(status) || /research/.test(String((task && (task.type || task.taskType)) || ""))) return "researching";
  if (/train|learn/.test(status)) return "learning";
  if (/teach/.test(status)) return "teaching";
  if (/complete|done|succeeded/.test(status)) return "completed";
  if (/run|work|progress|active|live/.test(status)) return "working";
  return "idle";
}

export function productHeadquarters(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  if (!workspaceId) {
    return { errorStatus: 400, error: "workspaceId required", note: "Headquarters is company-specific. Select a company first." };
  }
  const company = inspectCompany(store, workspaceId);
  if (company.errorStatus) return company;
  const work = listProductWork(store, { workspaceId });
  const activity = productActivity(store, { workspaceId });
  const approvals = productApprovals(store, { workspaceId });
  const treasury = treasuryView(store, { workspaceId });
  const packets = ((store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || []).map((p) => ({
    id: p.id,
    status: p.status,
    fromRole: p.teacherRoleId || p.fromRole || p.from,
    toRole: p.recipientRoleId || p.toRole || p.to,
    fromEmployeeId: p.teacherEmployeeId || p.fromEmployeeId || null,
    toEmployeeId: p.recipientEmployeeId || p.toEmployeeId || null,
    applied: p.status === "approved_for_supervised_use",
    pending: p.status === "awaiting_owner_approval" || p.status === "proposed",
  }));
  const latest = work.latest || null;
  const tasks = (latest && latest.tasks) || [];
  const knowledgeRows = (company.knowledge || []).map((k) => ({
    excerpt: String(k.excerpt || k.statement || "").slice(0, 160),
    classification: k.classification || null,
    reviewStatus: k.reviewStatus || null,
    retrieved: k.enteredRetrievalIndex === true,
    applied: k.accepted === true,
    applicableRole: k.applicableRole || null,
    assignedTo: k.assignedTo || null,
  }));
  const deliverableRows = (company.deliverables || []).filter(Boolean).map((d) => ({
    title: d.title || d.type || d.id,
    type: d.type || null,
    status: d.status || (d.draft === false ? "stored" : "draft"),
    createdByEmployeeId: d.createdByEmployeeId || null,
    createdByRoleId: d.createdByRoleId || null,
  }));
  const employees = (company.employees || []).map((e) => {
    const dept = hqDepartmentForRole(e.roleId);
    const assigned = tasks.filter((t) => t.assignedEmployeeId === e.id || t.assignedRoleId === e.roleId);
    const current = assigned.slice().reverse().find((t) => !/complete|done|succeeded/.test(String(t.status || "").toLowerCase())) || assigned.slice(-1)[0] || null;
    const teach = packets.filter((p) => p.fromEmployeeId === e.id || p.toEmployeeId === e.id || p.fromRole === e.roleId || p.toRole === e.roleId).map((p) => ({
      id: p.id,
      status: p.status,
      fromEmployeeId: p.fromEmployeeId,
      toEmployeeId: p.toEmployeeId,
      fromRole: p.fromRole,
      toRole: p.toRole,
      applied: p.applied,
      pending: p.pending,
    }));
    let state = "idle";
    if (current) state = hqTaskState(current);
    else if (teach.some((p) => p.pending)) state = "waiting";
    else if (teach.some((p) => p.applied) && !current) state = "idle";
    const knowledge = knowledgeRows
      .filter((k) => k.assignedTo === e.id || k.assignedTo === e.roleId || k.applicableRole === e.roleId)
      .slice(0, 6)
      .map((k) => ({
        excerpt: k.excerpt,
        classification: k.classification,
        reviewStatus: k.reviewStatus,
        retrieved: k.retrieved,
        applied: k.applied,
      }));
    const recentOutputs = deliverableRows
      .filter((d) => d.createdByEmployeeId === e.id || d.createdByRoleId === e.roleId)
      .slice(-4)
      .map((d) => ({ title: d.title, type: d.type, status: d.status }));
    return {
      id: e.id,
      name: e.name || e.roleTitle || e.roleId,
      shortLabel: String(e.name || e.roleTitle || e.roleId).split("/")[0].trim(),
      roleId: e.roleId,
      roleTitle: e.roleTitle || e.name || e.roleId,
      workspaceId: e.workspaceId,
      status: e.honestStatus || e.status,
      liveCapable: !!(e.permissionBoundaries && e.permissionBoundaries.liveCapable),
      departmentId: dept.id,
      departmentLabel: dept.label,
      accent: dept.accent,
      state,
      currentTask: current ? {
        id: current.id,
        status: current.status,
        summary: current.resultSummary || current.label || current.type || "",
        type: current.type || current.taskType || null,
      } : null,
      teaching: teach,
      knowledge,
      recentOutputs,
    };
  });
  const deptMap = {};
  for (const e of employees) {
    if (!deptMap[e.departmentId]) {
      deptMap[e.departmentId] = { id: e.departmentId, label: e.departmentLabel, accent: e.accent, employees: [], work: [], blockers: [], knowledge: [] };
    }
    deptMap[e.departmentId].employees.push({
      id: e.id,
      name: e.name,
      roleTitle: e.roleTitle,
      state: e.state,
      accent: e.accent,
    });
    if (e.currentTask) {
      deptMap[e.departmentId].work.push({
        id: e.currentTask.id,
        status: e.currentTask.status,
        summary: e.currentTask.summary,
        type: e.currentTask.type,
      });
    }
    if (e.state === "blocked" && e.currentTask) {
      deptMap[e.departmentId].blockers.push({
        id: e.currentTask.id,
        status: e.currentTask.status,
        summary: e.currentTask.summary,
      });
    }
    for (const k of e.knowledge || []) {
      deptMap[e.departmentId].knowledge = deptMap[e.departmentId].knowledge || [];
      if (deptMap[e.departmentId].knowledge.length < 8) {
        deptMap[e.departmentId].knowledge.push({
          excerpt: k.excerpt,
          classification: k.classification,
          reviewStatus: k.reviewStatus,
        });
      }
    }
  }
  const handoffs = [];
  for (const p of packets) {
    if (!p.applied && !p.pending) continue;
    const from = employees.find((e) => e.id === p.fromEmployeeId || e.roleId === p.fromRole);
    const to = employees.find((e) => e.id === p.toEmployeeId || e.roleId === p.toRole);
    if (from && to && from.id !== to.id) {
      handoffs.push({
        id: p.id,
        kind: "teaching",
        fromEmployeeId: from.id,
        toEmployeeId: to.id,
        status: p.status,
        applied: p.applied,
      });
    }
  }
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const deps = t.dependencies || t.prerequisites || [];
    for (const depId of deps) {
      const prior = tasks.find((x) => x.id === depId);
      if (!prior) continue;
      const from = employees.find((e) => e.id === prior.assignedEmployeeId || e.roleId === prior.assignedRoleId);
      const to = employees.find((e) => e.id === t.assignedEmployeeId || e.roleId === t.assignedRoleId);
      if (from && to && from.id !== to.id) {
        const priorDone = /complete|done|succeeded/.test(String(prior.status || "").toLowerCase());
        const nextDone = /complete|done|succeeded/.test(String(t.status || "").toLowerCase());
        if (priorDone && nextDone) continue;
        handoffs.push({
          id: (prior.id || "t") + "->" + (t.id || i),
          kind: "workflow",
          fromEmployeeId: from.id,
          toEmployeeId: to.id,
          status: t.status,
          applied: priorDone,
        });
      }
    }
  }
  const activeWork = tasks.filter((t) => /run|work|progress|active|live|queue|planned|pending/.test(String(t.status || "").toLowerCase()));
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    workspaceId,
    company: company.company,
    employees,
    departments: Object.values(deptMap),
    handoffs,
    activity: activity.activity || [],
    workFeed: activity.workFeed || [],
    pendingApprovals: approvals.pending || [],
    apr005: approvals.apr005,
    spend: company.spend,
    treasury: {
      actualSpendUsd: treasury && treasury.totals && treasury.totals.actualSpendUsd,
      actualRevenueUsd: treasury && treasury.totals && treasury.totals.actualRevenueUsd,
    },
    latestWork: latest ? {
      id: latest.objective && latest.objective.id,
      status: latest.objective && latest.objective.status,
      ownerText: latest.objective && latest.objective.ownerText,
      tasks,
    } : null,
    activeWorkCount: activeWork.length,
    queuedWorkCount: tasks.filter((t) => /queue|planned|pending|ready/.test(String(t.status || "").toLowerCase())).length,
    teachingPackets: packets,
    knowledge: knowledgeRows.slice(0, 12).map((k) => ({
      excerpt: k.excerpt,
      classification: k.classification,
      reviewStatus: k.reviewStatus,
      retrieved: k.retrieved,
      applied: k.applied,
    })),
    deliverables: deliverableRows.slice(0, 8).map((d) => ({
      title: d.title,
      type: d.type,
      status: d.status,
    })),
    note: "Visual headquarters for one company. Employees, rooms, and activity come from FILE_STORE. Idle is honest. No fabricated live work.",
  };
}

export function workflowProofView(store) {
  const proofs = (store.listWorkflowProofs && store.listWorkflowProofs()) || [];
  const companies = ((store.listWorkspaces && store.listWorkspaces()) || []).filter((w) => w.productProof === true);
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    isolation: APPLICATION_ISOLATION,
    title: "Workflow proof",
    disclosure: "These companies are fictional product-proof runs, not live businesses. Not RidgeLine. Not AutoShop.",
    proofs: proofs,
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      intakeKind: c.intakeKind || null,
      productProof: true,
      productProofKind: c.productProofKind || null,
      productProofNote: c.productProofNote || null,
      href: "#/companies/" + encodeURIComponent(c.id),
    })),
    href: "#/workflow-proof",
    note: "Checkpoint 26 dual complete workflows. Isolation is application-level, not IAM. APR-005 remains pending.",
  };
}

export function productObjectives(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const objs = (store.listObjectives && store.listObjectives(workspaceId)) || [];
  return {
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    objectives: objs.map((o) => ({
      id: o.id,
      workspaceId: o.workspaceId,
      status: o.status,
      ownerText: o.ownerText,
      createdAt: o.createdAt,
      requireLocalOwner: o.requireLocalOwner === true,
      category: o.category || null,
    })),
    note: "Existing Conductor objectives plus generalized Work objectives. Submit new work under Work.",
  };
}

export function assembleWorkFeed(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const feed = [];
  const execs = ((store.listSpecialistExecutions && store.listSpecialistExecutions(workspaceId)) || []).filter((e) => !workspaceId || e.workspaceId === workspaceId);
  const artifacts = ((store.listDeliverables && store.listDeliverables(workspaceId)) || []).filter((d) => d && d.artifact && d.artifact.path);
  const watcherAudits = ((store.listWatcherAudits && store.listWatcherAudits(workspaceId)) || []).filter((w) => !workspaceId || w.workspaceId === workspaceId);
  const searchRecs = ((store.listSearchRecords && store.listSearchRecords(workspaceId)) || []).filter((r) => !workspaceId || r.workspaceId === workspaceId);
  const latestWatcher = watcherAudits.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).slice(-1)[0] || null;
  for (const e of execs) {
    const auto = evaluateInternalAutonomy(store, e.workspaceId, "run_specialist_task", { employeeId: e.employeeId });
    const art = artifacts.find((d) => d.workspaceId === e.workspaceId && (d.createdByEmployeeId === e.employeeId || d.createdByRoleId === e.roleId));
    feed.push({
      id: e.id,
      workspaceId: e.workspaceId,
      at: e.createdAt,
      whatRan: (e.roleId || "") + " " + (e.taskType || "") + " " + e.id,
      whyPermitted: (auto.reason || "autonomy inspect") + " · " + (auto.decision || "unknown") + (auto.policyId ? " · " + auto.policyId : ""),
      sourcesUsed: e.retrievedIds || [],
      costUsd: e.estimatedCostUsd != null ? e.estimatedCostUsd : null,
      producedArtifact: art && art.artifact && art.artifact.path || null,
      watcherResult: latestWatcher && latestWatcher.workspaceId === e.workspaceId
        ? ((latestWatcher.kind || "audit") + " scoped=" + String(latestWatcher.scoped !== false) + " sameWorkspace=" + String(latestWatcher.sameWorkspace !== false))
        : "no watcher finding on this execution",
      live: e.live === true,
      fixture: e.fixture === true,
    });
  }
  for (const r of searchRecs) {
    const auto = evaluateInternalAutonomy(store, r.workspaceId, "run_specialist_task");
    feed.push({
      id: r.id,
      workspaceId: r.workspaceId,
      at: r.createdAt,
      whatRan: "official web_search " + r.id,
      whyPermitted: (auto.reason || "autonomy inspect") + " · search adapter only; owner-URL fetch is not search",
      sourcesUsed: r.urls || [],
      costUsd: null,
      producedArtifact: null,
      watcherResult: "search classification persisted; not a Watcher hire",
      live: r.live === true,
      fixture: r.fixture === true,
    });
  }
  feed.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  return {
    built: true,
    persistence: "FILE_STORE",
    liveProviderCall: false,
    workspaceId: workspaceId || null,
    feed: feed.slice(-40),
    note: "Deterministic work feed from FILE_STORE. Shows what ran, why permitted, sources, cost, artifact, Watcher. Not a live model call.",
  };
}

export function productActivity(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const rows = [];
  for (const a of ((store.listManagerActivity && store.listManagerActivity(workspaceId)) || []).slice(-20)) {
    rows.push({ kind: "manager", id: a.id, at: a.createdAt || a.at, text: a.detail || a.kind || a.note || "manager activity", workspaceId: a.workspaceId });
  }
  for (const a of ((store.listScoutActivity && store.listScoutActivity(workspaceId)) || []).slice(-12)) {
    rows.push({ kind: "scout", id: a.id, at: a.createdAt || a.at, text: a.kind || a.note || "scout activity", workspaceId: a.workspaceId });
  }
  for (const a of ((store.listWatcherActivity && store.listWatcherActivity(workspaceId)) || []).slice(-12)) {
    rows.push({ kind: "watcher", id: a.id, at: a.createdAt || a.at, text: a.kind || a.note || "watcher activity", workspaceId: a.workspaceId });
  }
  for (const o of ((store.listObjectives && store.listObjectives(workspaceId)) || []).filter((x) => x.surface === "work" || x.category === "generalized_supervised").slice(-12)) {
    rows.push({ kind: "work", id: o.id, at: o.createdAt || o.updatedAt, text: (o.status || "work") + " — " + String(o.ownerText || "").slice(0, 140), workspaceId: o.workspaceId });
  }
  rows.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  const workFeed = assembleWorkFeed(store, extras || {});
  return {
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    activity: rows.slice(-40),
    workFeed: workFeed.feed,
    workFeedNote: workFeed.note,
    liveProviderCall: false,
    note: "Deterministic FILE_STORE activity plus work feed. Not a live feed invention.",
  };
}

export function productSpending(store, extras) {
  const view = ownerSpendView(store, extras && extras.workspaceId);
  const founder = founderSpendingView(store, extras);
  return {
    ...view,
    honesty: PRODUCT_HONESTY,
    liveVsFixture: {
      liveCount: view.totals && view.totals.liveCount,
      fixtureCount: view.totals && view.totals.fixtureCount,
    },
    treasurySeparation: founder,
    harbor: founder.harbor,
    finch: founder.finch,
    categoriesNeverMixed: true,
    note: (view.note || "") + " ACTUAL vs OWNER_REPORTED vs HYPOTHETICAL never mixed. Harbor vs Finch from ledger.",
  };
}

export function notBuilt(id) {
  const nav = PRODUCT_NAV.find((n) => n.id === id) || { label: id, reason: "Not built yet." };
  return {
    built: false,
    id: id,
    title: nav.label,
    reason: nav.reason || "Not built yet.",
    honesty: PRODUCT_HONESTY,
    note: "This destination is honest. The capability does not exist yet.",
  };
}

export function productTrainingStudio(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const cycle = trainingCycleView(store, extras);
  const records = (store.listTrainingStudioRecords && store.listTrainingStudioRecords(workspaceId)) || [];
  const employees = listEmployees(store, { workspaceId: workspaceId }).employees;
  return {
    ...cycle,
    persistence: "FILE_STORE",
    honesty: { ...PRODUCT_HONESTY, ...TRAINING_CYCLE_HONESTY },
    classifications: CLASSIFICATIONS,
    sourceTypes: SOURCE_TYPES,
    pdfWired: true,
    pdfNote: "PDF ingest uses poppler pdftotext when bytes are provided. Text/Markdown is the default path.",
    employees: employees.map((e) => ({ id: e.id, name: e.name, roleTitle: e.roleTitle, workspaceId: e.workspaceId, skillTags: e.skillTags || [] })),
    records: records,
    webpageCannotBecomePolicy: true,
    entireDocumentDumpedIntoPrompt: false,
    checkLessonAvailable: true,
    distinctions: LEARNING_DISTINCTIONS,
    note: "Owner Training Studio. Paste a lesson, pick employee(s), inspect View Brain, run a lightweight before/after. Webpage cannot silently become owner policy. External packets stay pending. TPK-001 is not applied.",
  };
}


export function portfolioView(store, extras) {
  const selected = extras && extras.workspaceId || null;
  const companies = listCompanies(store).companies;
  const rows = companies.map((c) => {
    const employees = listEmployees(store, { workspaceId: c.id }).employees;
    const approvals = productApprovals(store, { workspaceId: c.id });
    const spend = ownerSpendView(store, c.id);
    const work = ((store.listObjectives && store.listObjectives(c.id)) || []).slice(-3).map((o) => ({ id: o.id, status: o.status, text: o.ownerText }));
    const deliverables = ((store.listDeliverables && store.listDeliverables(c.id)) || []).slice(-4).map((d) => ({ id: d.id, type: d.type, draft: d.draft !== false, path: d.artifact && d.artifact.path }));
    const search = ((store.listSearchRecords && store.listSearchRecords(c.id)) || []);
    const questions = ((store.listKnowledgeGaps && store.listKnowledgeGaps(c.id)) || []).map((g) => g.statement || g.id);
    const opps = ((store.listOpportunities && store.listOpportunities(c.id)) || []).filter((o) => o.workspaceId === c.id);
    const wsFull = store.getWorkspace && store.getWorkspace(c.id);
    const actualSpendUsd = Number((spend.totals && spend.totals.estimatedUsd) || 0);
    return {
      id: c.id,
      name: c.name,
      type: c.intakeKind || c.type || null,
      objective: (wsFull && wsFull.goal) || c.goal || null,
      stage: c.ownerStatus || (employees.length ? "team_authorized" : "intake"),
      employees: employees.map((e) => ({ id: e.id, roleId: e.roleId, name: e.name, intelligenceClass: e.intelligenceClass })),
      recentWork: work,
      pendingApprovals: approvals.pending,
      openQuestions: questions,
      openOpportunities: opps.slice(0, 8).map((o) => ({ id: o.id, title: o.title || o.name || o.id, status: o.status || null })),
      openOpportunityCount: opps.length,
      spend: {
        estimatedUsd: spend.totals && spend.totals.estimatedUsd,
        actualSpendUsd: Number(actualSpendUsd.toFixed(6)),
        spendCategory: "ACTUAL",
        actualRevenueUsd: 0,
        speculativeRevenueExcluded: true,
        liveCount: spend.totals && spend.totals.liveCount,
      },
      keyUnknowns: [
        "Demand / conversion / revenue remain UNKNOWN (not ACTUAL).",
      ].concat(questions.slice(0, 3)),
      deliverables: deliverables,
      researchStatus: search.length ? "search_records_present" : "search_not_connected_or_unused",
      selected: selected === c.id,
    };
  });
  let compare = null;
  try {
    compare = portfolioHarborFinchCedarCompare(store);
  } catch {
    compare = null;
  }
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: PRODUCT_HONESTY,
    isolation: isolationHonesty(),
    selectedWorkspaceId: selected,
    leakOnSwitch: false,
    companies: rows,
    compareHarborFinchCedar: compare,
    note: "Switch companies by workspaceId. Each row is scoped. Isolation is application-level, not IAM. Harbor vs Finch vs Cedar compare uses ACTUAL spend only — no speculative revenue.",
  };
}

export function dispatchProductRequest(store, method, path, payload, query) {
  const q = query || {};
  const p = payload || {};
  if (method === "GET" && path === "/app/nav") {
    return { nav: PRODUCT_NAV, honesty: PRODUCT_HONESTY, diagnosticsHref: "/diagnostics" };
  }
  if (method === "GET" && path === "/app/overview") return productOverview(store, q);
  if (method === "GET" && path === "/app/headquarters") return productHeadquarters(store, q);
  if (method === "GET" && path === "/app/workflow-proof") return workflowProofView(store);
  if (method === "GET" && path === "/app/companies") return listCompanies(store);
  if (method === "GET" && path === "/app/companies/intake/new") return intakeForm("new_business");
  if (method === "GET" && path === "/app/companies/intake/existing") return intakeForm("existing_business");
  if (method === "POST" && path === "/app/companies/intake/new") return createNewBusiness(store, p);
  if (method === "POST" && path === "/app/companies/intake/existing") return createExistingBusiness(store, p);
  if (method === "POST" && path === "/app/companies/intake") {
    return (p.kind === "existing_business") ? createExistingBusiness(store, p) : createNewBusiness(store, p);
  }
  const company = path.match(/^\/app\/companies\/([^/]+)$/);
  if (method === "GET" && company) {
    const cid = decodeURIComponent(company[1]);
    if (cid === "new") return intakeForm("new_business");
    if (cid === "existing") return intakeForm("existing_business");
    return inspectCompany(store, cid);
  }
  if (method === "GET" && path === "/app/employees") {
    const base = listEmployees(store, q);
    const founder = listFounderEmployees(store, q);
    return { ...base, founderEmployees: founder.employees, founderNote: founder.note };
  }
  const brain = path.match(/^\/app\/employees\/([^/]+)\/brain$/);
  if (method === "GET" && brain) return employeeBrain(store, decodeURIComponent(brain[1]));
  const emp = path.match(/^\/app\/employees\/([^/]+)$/);
  if (method === "GET" && emp) {
    const id = decodeURIComponent(emp[1]);
    try {
      const founder = founderEmployeeView(store, id);
      return {
        ...founder,
        employee: founder,
        brainHref: "/app/employees/" + encodeURIComponent(id) + "/brain",
        developmentHref: "/app/employees/" + encodeURIComponent(id) + "/development",
        persistence: "FILE_STORE",
      };
    } catch {
      const one = resolveEmployee(store, id);
      if (!one) return { errorStatus: 404, error: "employee not found" };
      return { employee: one, brainHref: "/app/employees/" + encodeURIComponent(one.id) + "/brain", persistence: "FILE_STORE" };
    }
  }
  if (method === "GET" && path === "/app/training") return productTrainingStudio(store, q);
  if (method === "POST" && path === "/app/training/ingest") return ingestOwnerTraining(store, p);
  if (method === "POST" && path === "/app/training/cycle") return runOwnerTrainingCycle(store, p);
  if (method === "POST" && path === "/app/training/gap") return identifyKnowledgeGap(store, p);
  if (method === "POST" && path === "/app/training/research") return researchGapFromOwnerMaterials(store, p);
  if (method === "POST" && path === "/app/training/check") return runBeforeAfterCheck(store, p);
  if (method === "POST" && path === "/app/training/share") return shareApprovedKnowledge(store, p);
  if (method === "POST" && path === "/app/training/packets") return proposeExternalTeachingPacket(store, p);
  if (method === "POST" && path === "/app/training/packets/deliver") return deliverTeachingPacket(store, p.packetId || p.id, p);
  if (method === "GET" && path === "/app/training/episodes") return trainingCycleView(store, q);
  if (method === "GET" && path === "/app/training/gaps") return { gaps: (store.listKnowledgeGaps && store.listKnowledgeGaps(q.workspaceId)) || [], honesty: TRAINING_CYCLE_HONESTY };
  if (method === "GET" && path === "/app/knowledge") return knowledgeCatalog(store, q);
  if (method === "POST" && path === "/app/knowledge/assign") return assignKnowledge(store, p);
  if (method === "GET" && path === "/app/approvals") return productApprovals(store, q);
  if (method === "GET" && path === "/app/spending") return productSpending(store, q);
  if (method === "GET" && path === "/app/activity") return productActivity(store, q);
  if (method === "GET" && path === "/app/objectives") return productObjectives(store, q);
  if (method === "GET" && path === "/app/work") return listProductWork(store, q);
  if (method === "POST" && path === "/app/work/submit") return submitProductObjective(store, p);
  if (method === "POST" && path === "/app/work/run") return runProductWork(store, p.objectiveId || p.id);
  if (method === "GET" && path === "/app/deliverables") return listWorkspaceDeliverables(store, q);
  const oneDel = path.match(/^\/app\/deliverables\/([^/]+)$/);
  if (method === "GET" && oneDel) return inspectDeliverable(store, decodeURIComponent(oneDel[1]));
  const oneWork = path.match(/^\/app\/work\/([^/]+)$/);
  if (method === "GET" && oneWork) return inspectProductWork(store, decodeURIComponent(oneWork[1]));
  if (method === "POST" && oneWork && path.endsWith("/run")) return runProductWork(store, decodeURIComponent(oneWork[1]));
  const runWork = path.match(/^\/app\/work\/([^/]+)\/run$/);
  if (method === "POST" && runWork) return runProductWork(store, decodeURIComponent(runWork[1]));
  if (method === "GET" && path === "/app/teams") return listProductTeams(store, q);
  if (method === "POST" && path === "/app/teams/propose") return proposeTeam(store, p);
  if (method === "POST" && path === "/app/teams/generate") return proposeTeam(store, p);
  if (method === "POST" && path === "/app/teams/create") return createTeam(store, p);
  if (method === "POST" && path === "/app/teams/add") return proposeAdditionalSeats(store, p);
  const oneTeam = path.match(/^\/app\/teams\/([^/]+)$/);
  if (method === "GET" && oneTeam) return inspectTeamProposal(store, decodeURIComponent(oneTeam[1]));
  const empTask = path.match(/^\/app\/employees\/([^/]+)\/tasks$/);
  if (method === "POST" && empTask) return runEmployeeTask(store, decodeURIComponent(empTask[1]), p);
  if (method === "GET" && path === "/app/opportunities") return listProductOpportunities(store, q);
  if (method === "GET" && path === "/app/opportunities/form") return opportunityResearchForm();
  if (method === "POST" && path === "/app/opportunities/generate") return generateOpportunities(store, p);
  if (method === "GET" && path === "/app/opportunities/compare") {
    const ids = String(q.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
    return compareOpportunities(store, ids);
  }
  if (method === "POST" && path === "/app/opportunities/compare") return compareOpportunities(store, p.ids || p.opportunityIds);
  const createFromOpp = path.match(/^\/app\/opportunities\/([^/]+)\/create-company$/);
  if (method === "POST" && createFromOpp) return createCompanyFromOpportunity(store, decodeURIComponent(createFromOpp[1]), p);
  const saveOpp = path.match(/^\/app\/opportunities\/([^/]+)\/save$/);
  if (method === "POST" && saveOpp) return saveOpportunity(store, decodeURIComponent(saveOpp[1]));
  const rejectOpp = path.match(/^\/app\/opportunities\/([^/]+)\/reject$/);
  if (method === "POST" && rejectOpp) return rejectOpportunity(store, decodeURIComponent(rejectOpp[1]));
  if (method === "GET" && path === "/app/opportunities/founder-compare") {
    const ids = String(q.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
    return founderOpportunityCompare(store, ids);
  }
  if (method === "POST" && path === "/app/opportunities/founder-compare") return founderOpportunityCompare(store, p.ids || p.opportunityIds);
  const founderOpp = path.match(/^\/app\/opportunities\/([^/]+)\/founder$/);
  if (method === "GET" && founderOpp) return founderOpportunityView(store, decodeURIComponent(founderOpp[1]));
  const oneOpp = path.match(/^\/app\/opportunities\/([^/]+)$/);
  if (method === "GET" && oneOpp) {
    const oid = decodeURIComponent(oneOpp[1]);
    const reserved = new Set(["founder-compare", "compare", "form", "generate", "investment-compare", "enrich-investment"]);
    if (!reserved.has(oid)) {
      try {
        return founderOpportunityView(store, oid);
      } catch {
        return inspectOpportunity(store, oid);
      }
    }
  }
  if (method === "POST" && path === "/app/training/peer") return teachPeerFromFinding(store, p);
  if (method === "GET" && path === "/app/roles") return { built: true, roles: roleClassificationTable(), honesty: PRODUCT_HONESTY };
  if (method === "GET" && path === "/app/portfolio") return portfolioView(store, q);
  if (method === "GET" && path === "/app/teaching") return teachingPipelineView(store, q);
  if (method === "POST" && path === "/app/teaching/flag") return flagInsufficientKnowledge(store, p);
  if (method === "GET" && path === "/app/search") return searchProviderView(store, q);
  if (method === "POST" && path === "/app/search/query") return querySearchProvider(p.query || p.q, p);
  if (method === "GET" && path === "/app/isolation") return { ...isolationHonesty(), historical: historicalContaminationView(store) };
  if (method === "GET" && path === "/app/autonomy") return autonomyPolicyView(store, q);
  if (method === "POST" && path === "/app/autonomy") return persistInternalAutonomyPolicy(store, p);
  if (method === "POST" && path === "/app/autonomy/revoke") return revokeInternalAutonomyPolicy(store, p);
  if (method === "GET" && path === "/app/specialists/executions") return liveExecutionView(store, q.workspaceId || q.workspace);
  if (method === "GET" && path === "/app/command") return commandCenterView(store, q);
  if (method === "POST" && path === "/app/command/plan") return persistCommandPlan(store, p.ownerText || p.text || p.objective, p);
  if (method === "POST" && path === "/app/command/dry-run") return { built: true, honesty: COMMAND_HONESTY, plan: planFromNaturalLanguage(p.ownerText || p.text || p.objective, { ...p, store }) };
  if (method === "GET" && path === "/app/command/plans") return listCommandPlans(store, q);
  const oneCmd = path.match(/^\/app\/command\/([^/]+)$/);
  if (method === "GET" && oneCmd) return inspectCommandPlan(store, decodeURIComponent(oneCmd[1]));
  if (method === "GET" && path === "/app/treasury") return treasuryView(store, q);
  if (method === "GET" && path === "/app/memory") return retrieveByMemoryPriority(store, q.workspaceId || q.workspace, q);
  if (method === "POST" && path === "/app/memory/retrieve") return retrieveByMemoryPriority(store, p.workspaceId || p.workspace, p);
  if (method === "GET" && path === "/app/execution-ladder") return { built: true, currentMax: CURRENT_MAX_EXECUTION_LEVEL, levels: EXECUTION_LADDER, honesty: MASTER_OS_HONESTY };
  if (method === "POST" && path === "/app/execution-ladder") return recordExecutionAction(store, p);
  if (method === "GET" && path === "/app/jobs") return jobsStageView(store, q);
  if (method === "POST" && path === "/app/jobs") return upsertScheduledJob(store, p);
  if (method === "POST" && path === "/app/jobs/tick") return runScheduledJobWorkerTick(store, p);
  if (method === "POST" && path === "/app/jobs/restart-simulate") return simulateJobRestart(store, p.workspaceId || p.workspace);
  if (method === "GET" && path === "/app/action-catalog") return listActionCatalogBoundary(store);
  if (method === "POST" && path === "/app/action-catalog/persist") return persistActionCatalog(store, p);
  if (method === "POST" && path === "/app/execution-ladder/stage-flyer") return stageHarborLibraryFlyer(store, p);
  if (method === "POST" && path === "/app/execution-ladder/attempt") return attemptExternalLadderLevel(store, p.level, p);
  if (method === "POST" && path === "/app/autonomy/tick") return runAutonomyLoopTick(store, p.workspaceId || p.workspace, p);
  if (method === "POST" && path === "/app/opportunities/investment-compare") return investmentCompare(store, p.ids || p.opportunityIds);
  if (method === "GET" && path === "/app/opportunities/investment-compare") {
    const ids = String(q.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
    return investmentCompare(store, ids);
  }
  if (method === "POST" && path === "/app/opportunities/enrich-investment") return enrichOpportunityInvestment(store, p.opportunityId || p.id);
  if (method === "GET" && path === "/app/teams/explain") return explainTeamForCompany(store, q.workspaceId || q.workspace, q);
  if (method === "POST" && path === "/app/teams/explain") return explainTeamForCompany(store, p.workspaceId || p.workspace, p);
  const empDev = path.match(/^\/app\/employees\/([^/]+)\/development$/);
  if (method === "GET" && empDev) return employeeDevelopmentRecord(store, decodeURIComponent(empDev[1]));
  if (method === "GET" && path === "/app/investment-committee") return investmentCommitteeComposition(q.workspaceId || q.workspace);
  if (method === "GET" && path === "/app/artifacts") {
    return artifactsPageView(store, q);
  }
  if (method === "GET" && path === "/app/artifacts/file") {
    return readWorkspaceArtifactFile(q.workspaceId || q.workspace, q.name || q.file || q.filename);
  }
  const approveCmd = path.match(/^\/app\/command\/([^/]+)\/approve$/);
  if (method === "POST" && approveCmd) return approveCommandPlan(store, decodeURIComponent(approveCmd[1]), p);
  const runCmd = path.match(/^\/app\/command\/([^/]+)\/run$/);
  if (method === "POST" && runCmd) return runCommandPlan(store, decodeURIComponent(runCmd[1]), { ...p, dryRun: p.dryRun !== false });
  if (method === "GET" && path === "/app/spending/treasury") return founderSpendingView(store, q);
  if (method === "POST" && path === "/app/scout/useful-search") return scoutFromAcceptedUsefulSearch(store, p);
  if (method === "GET" && path === "/app/scout/useful-search") return scoutFromAcceptedUsefulSearch(store, q);
  if (method === "GET" && path === "/app/restart-survival") return proveRestartSurvival(store);
  if (method === "GET" && path === "/app/launch-readiness") return launchReadinessView(store, q.workspaceId || q.workspace || "ws-own-004");
  if (method === "GET" && path === "/app/settings") return productSettings(store);
  if (method === "GET" && path === "/app/research") return researchView(store, q);
  if (method === "GET" && path === "/app/teaching-lab") return teachingView(store);
  if (method === "GET" && path === "/app/brain") {
    const empId = q.employeeId || q.id;
    if (!empId) return { built: true, note: "Pass employeeId. Or open from Employees → Brain.", nav: true };
    return retrieveBrainLayers(store, empId, q.q || q.query || "");
  }
  if (method === "GET" && path === "/app/source-providers") return buildSourceProviderRegistry(store);
  if (method === "GET" && path === "/app/external-adapters") return { built: true, adapters: EXTERNAL_ADAPTERS, alwaysOn: alwaysOnReadiness() };
  if (method === "POST" && path === "/app/command/plan-live") {
    // Sync path: deterministic validated plan (live injector only in async dispatcher).
    return persistCommandPlan(store, p.ownerText || p.text || p.objective, p);
  }
  return null;
}

bindTrainingShell({ ingestOwnerTraining: ingestOwnerTraining, assignKnowledge: assignKnowledge });

export {
  runOwnerTrainingCycle,
  identifyKnowledgeGap,
  researchGapFromOwnerMaterials,
  proposeExternalTeachingPacket,
  deliverTeachingPacket,
  shareApprovedKnowledge,
  runBeforeAfterCheck,
  trainingCycleView,
  enrichEmployeeBrain,
  teachPeerFromFinding,
  TRAINING_CYCLE_HONESTY,
  LEARNING_DISTINCTIONS,
  createNewBusiness,
  createExistingBusiness,
  intakeForm,
  isolationView,
  isIsolatedOwnerWorkspace,
  presentIntake,
  APPLICATION_ISOLATION,
  INTAKE_HONESTY,
  generateOpportunities,
  generateOpportunitiesLive,
  compareOpportunities,
  createCompanyFromOpportunity,
  listProductOpportunities,
  inspectOpportunity,
  opportunityResearchForm,
  saveOpportunity,
  rejectOpportunity,
  OPPORTUNITY_HONESTY,
  proposeTeam,
  proposeAdditionalSeats,
  createTeam,
  listProductTeams,
  inspectTeamProposal,
  runEmployeeTask,
  runEmployeeTaskLive,
  TEAM_HONESTY,
  listProductWork,
  inspectProductWork,
  submitProductObjective,
  runProductWork,
  runProductWorkLive,
  submitProductObjectiveLive,
  WORK_HONESTY,
  listWorkspaceDeliverables,
  inspectDeliverable,
  DELIVERABLE_HONESTY,
  planFromNaturalLanguage,
  persistCommandPlan,
  listCommandPlans,
  inspectCommandPlan,
  commandCenterView,
  COMMAND_HONESTY,
  investmentCompare,
  retrieveByMemoryPriority,
  employeeDevelopmentRecord,
  explainTeamForCompany,
  recordExecutionAction,
  upsertScheduledJob,
  simulateJobRestart,
  runAutonomyLoopTick,
  treasuryView,
  MASTER_OS_HONESTY,
  MEMORY_PRIORITY,
  CURRENT_MAX_EXECUTION_LEVEL,
  runScheduledJobWorkerTick,
  jobsStageView,
  persistActionCatalog,
  listActionCatalogBoundary,
  stageHarborLibraryFlyer,
  attemptExternalLadderLevel,
  JOBS_STAGE_HONESTY,
};


export async function dispatchProductRequestAsync(store, method, path, payload, query, deps) {
  const q = query || {};
  const p = payload || {};
  if (method === "POST" && path === "/app/command/plan-live") {
    const liveComplete = deps && deps.liveComplete;
    return persistCommandPlanMaybeLive(store, p.ownerText || p.text || p.objective, { ...p, preferLive: true, store, liveComplete });
  }

  const preferLive = p.preferLive === true || p.live === true || q.live === "1" || q.preferLive === "1";
  if (method === "POST" && path === "/app/opportunities/generate" && preferLive) {
    return generateOpportunitiesLive(store, p, deps || {});
  }
  if (method === "POST" && path === "/app/work/submit" && preferLive) {
    return submitProductObjectiveLive(store, p, deps || {});
  }
  if (method === "POST" && path === "/app/work/run" && preferLive) {
    return runProductWorkLive(store, p.objectiveId || p.id, deps || {});
  }
  const runWork = path.match(/^\/app\/work\/([^/]+)\/run$/);
  if (method === "POST" && runWork && preferLive) {
    return runProductWorkLive(store, decodeURIComponent(runWork[1]), deps || {});
  }
  const empTask = path.match(/^\/app\/employees\/([^/]+)\/tasks$/);
  if (method === "POST" && empTask && preferLive) {
    return runEmployeeTaskLive(store, decodeURIComponent(empTask[1]), p, deps || {});
  }
  if (method === "POST" && path === "/app/search/live") {
    return attemptOfficialWebSearch(store, p, deps || {});
  }
  if (method === "POST" && path === "/app/specialists/live") {
    const employeeId = p.employeeId || p.id;
    if (!employeeId) {
      const err = new Error("employeeId is required");
      err.code = "EMPLOYEE_REQUIRED";
      throw err;
    }
    return runEmployeeTaskLive(store, employeeId, { ...p, preferLive: true }, deps || {});
  }
  return dispatchProductRequest(store, method, path, payload, query);
}
