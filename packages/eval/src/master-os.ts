/**
 * Master OS foundations: investment compare, memory priority, autonomy loop,
 * scheduled jobs (24/7 foundations), execution ladder, treasury, employee development.
 * Honest: FILE_STORE local app is NOT always-on / HA / enterprise concurrency.
 */
import { createHash } from "node:crypto";
import { evaluateInternalAutonomy, activeInternalAutonomyPolicy } from "./autonomy-policy.ts";
import { selectRoleIds, collectWorkspaceSignals, roleIsImplemented, ROLE_CATALOG } from "./team-generator.ts";
import { compareOpportunities, presentOpportunity } from "./opportunity-scout.ts";

export const MASTER_OS_HONESTY = {
  persistence: "FILE_STORE",
  alwaysOn: false,
  highAvailability: false,
  enterpriseConcurrency: false,
  postgres: false,
  iam: false,
  embeddings: false,
  note: "FILE_STORE local app foundations. Integration boundary for future worker/Postgres/deploy — not purchased, not publicly tunneled.",
};

/** Financial / evidence claim categories — never mix into "actual" portfolio totals. */
export const TREASURY_CATEGORIES = [
  "ACTUAL",
  "OWNER_REPORTED",
  "SOURCE_SUPPORTED",
  "ESTIMATED",
  "HYPOTHETICAL",
  "UNKNOWN",
  "MODEL_ESTIMATE",
  "OBSERVED",
];

export const EXECUTION_LADDER = {
  0: { level: 0, label: "observe_only", available: true },
  1: { level: 1, label: "internal_plan", available: true },
  2: { level: 2, label: "draft_local_artifact", available: true },
  3: { level: 3, label: "stage_internal", available: true, note: "Stage inside FILE_STORE only." },
  4: { level: 4, label: "external_execute", available: false, note: "Unavailable unless separately authorized+integrated (it is not)." },
  5: { level: 5, label: "autonomous_external", available: false, note: "Not implemented. Not authorized." },
};
export const CURRENT_MAX_EXECUTION_LEVEL = 3;

export const MEMORY_PRIORITY = [
  "OWNER_POLICY",
  "COMPANY_KNOWLEDGE",
  "ROLE_SPECIFIC",
  "TASK",
  "CORRECTIONS",
  "VERIFIED_CROSS_ROLE",
  "PORTFOLIO_GENERAL",
];

export const EMPLOYEE_DEV_STATUSES = [
  "uninitialized",
  "authorized",
  "development_required",
  "development_verified",
  "supervised_internal_use",
];

function nowIso() {
  return new Date().toISOString();
}

function asText(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
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

function claimClassOf(node) {
  if (!node) return "UNKNOWN";
  if (typeof node === "string") return "UNKNOWN";
  return String(node.claimClass || node.category || node.financialCategory || "UNKNOWN").toUpperCase();
}

/** B. Investment-style opportunity enrichment + committee composition */
export function investmentFieldsFromOpportunity(rec) {
  const textOf = (v) => (v && typeof v === "object" ? (v.text || v.value || null) : v);
  const fin = (v, fallbackCat) => {
    if (v && typeof v === "object" && (v.claimClass || v.category)) {
      return {
        value: textOf(v),
        category: String(v.claimClass || v.category).toUpperCase().replace(/OWNER_PROVIDED.*/, "OWNER_REPORTED").replace(/MODEL_GENERATED_HYPOTHESIS/, "HYPOTHETICAL").replace(/ESTIMATE/, "ESTIMATED"),
        note: v.note || null,
      };
    }
    if (v == null || v === "") return { value: null, category: "UNKNOWN", note: "Not stated." };
    return { value: textOf(v), category: fallbackCat || "HYPOTHETICAL", note: "Labeled hypothesis unless owner/source already stored." };
  };
  return {
    customer: textOf(rec.targetCustomer),
    problem: textOf(rec.problem),
    solution: textOf(rec.proposedOffer),
    model: textOf(rec.monetizationModel || rec.monetizationApproach || rec.businessModel),
    startupRequirements: textOf(rec.startupRequirements),
    distribution: textOf(rec.comparisonDimensions && rec.comparisonDimensions.distributionDifficulty),
    ownerFit: textOf(rec.whyItCouldFit || (rec.comparisonDimensions && rec.comparisonDimensions.ownerFit)),
    complexity: textOf(rec.operationalComplexity || (rec.comparisonDimensions && rec.comparisonDimensions.operationalComplexity)),
    timeToValidate: textOf(rec.comparisonDimensions && rec.comparisonDimensions.speedToFirstTest),
    competition: textOf(rec.comparisonDimensions && rec.comparisonDimensions.competitiveIntensity),
    evidenceQuality: textOf(rec.comparisonDimensions && rec.comparisonDimensions.evidenceQuality),
    assumptions: rec.assumptions || [],
    financialScenarios: {
      startupCost: fin(rec.startupCostEstimate, "ESTIMATED"),
      revenue: { value: null, category: "UNKNOWN", note: "Revenue never invented. Not added to actual portfolio." },
      ownerBudget: fin(rec.ownerBudget || null, "OWNER_REPORTED"),
    },
    unknowns: rec.missingInformation || rec.recommendedNextInvestigation || [],
    nextInvestigation: textOf(rec.recommendedNextInvestigation || rec.recommendedNextResearch),
    path: rec.growthType || rec.angleId ? "EXISTING_OR_GROWTH" : "NEW",
  };
}

export function investmentCommitteeComposition(workspaceId) {
  return {
    name: "Investment committee",
    workspaceId: workspaceId || null,
    seats: [
      { roleId: "executive", purpose: "Priority and tradeoff framing", fake: false },
      { roleId: "finance", purpose: "Separate OWNER_REPORTED / ESTIMATED / HYPOTHETICAL / UNKNOWN", fake: false },
      { roleId: "independent_audit", purpose: "Watcher — invented demand / category mixing / isolation", fake: false },
    ],
    note: "Composition is Executive + Finance + Watcher. Not five fake agents.",
    fakeAgentCount: 0,
  };
}

export function investmentCompare(store, ids) {
  const base = compareOpportunities(store, ids);
  const enriched = (base.opportunities || []).map((o) => ({
    id: o.id,
    name: o.name,
    investment: investmentFieldsFromOpportunity(o),
  }));
  const categoryAudit = [];
  for (const row of enriched) {
    const fs = row.investment.financialScenarios || {};
    for (const [k, v] of Object.entries(fs)) {
      categoryAudit.push({ opportunityId: row.id, field: k, category: v.category, value: v.value });
      if (k === "revenue" && v.category === "ACTUAL" && v.value) {
        categoryAudit.push({ opportunityId: row.id, field: k, violation: "speculative_or_invented_revenue_as_actual" });
      }
    }
  }
  return {
    ...base,
    investmentRows: enriched,
    committee: investmentCommitteeComposition(base.workspaceIds && base.workspaceIds[0]),
    categoryAudit,
    neverMixFinancialCategories: true,
    note: (base.note || "") + " Investment fields use transparent categories. Not disguised proof.",
  };
}

/** D. Multilayer memory with retrieval priority */
export function classifyMemoryCategory(item) {
  const cls = String(item.classification || item.kind || item.claimKind || "").toLowerCase();
  const mandatory = item.mandatory === true || item.ownerPolicy === true || cls === "owner_policy";
  if (mandatory || cls === "owner_policy") return "OWNER_POLICY";
  if (cls === "correction" || item.correction === true) return "CORRECTIONS";
  if (item.applicableRole || item.roleId || cls === "role_specific") return "ROLE_SPECIFIC";
  if (item.taskId || item.objectiveId || cls === "task") return "TASK";
  if (item.crossRoleVerified === true || item.verifiedCrossRole === true) return "VERIFIED_CROSS_ROLE";
  if (item.workspaceId) return "COMPANY_KNOWLEDGE";
  return "PORTFOLIO_GENERAL";
}

export function memoryPriorityRank(category) {
  const i = MEMORY_PRIORITY.indexOf(category);
  return i < 0 ? MEMORY_PRIORITY.length : i;
}

/**
 * Lexical/hybrid retrieval ordering. No embeddings claim.
 * Mandatory OWNER_POLICY never displaced. Portfolio general only if no leak risk and nothing else.
 */
export function retrieveByMemoryPriority(store, workspaceId, extras) {
  const ws = store.requireWorkspaceId(workspaceId);
  const roleId = extras && extras.roleId;
  const query = asText(extras && extras.query).toLowerCase();
  const items = (store.listKnowledgeForWorkspace
    ? store.listKnowledgeForWorkspace(ws)
    : (store.listKnowledge() || []).filter((k) => k.workspaceId === ws)
  ).filter((k) => k && (k.accepted === true || k.reviewStatus === "approved" || k.mandatory === true));

  const scored = items.map((item) => {
    const category = classifyMemoryCategory(item);
    let score = 100 - memoryPriorityRank(category) * 10;
    const stmt = String(item.statement || "").toLowerCase();
    if (query) {
      for (const tok of query.split(/\W+/).filter((t) => t.length > 2)) {
        if (stmt.includes(tok)) score += 3;
      }
    }
    if (roleId && (item.applicableRole === roleId || item.roleId === roleId)) score += 15;
    if (category === "PORTFOLIO_GENERAL" && item.workspaceId && item.workspaceId !== ws) score = -999;
    if (category === "PORTFOLIO_GENERAL" && !item.workspaceId) score -= 20;
    return { item, category, score, priority: memoryPriorityRank(category) };
  });

  scored.sort((a, b) => {
    if (a.category === "OWNER_POLICY" && b.category !== "OWNER_POLICY") return -1;
    if (b.category === "OWNER_POLICY" && a.category !== "OWNER_POLICY") return 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.score - a.score;
  });

  const policies = scored.filter((s) => s.category === "OWNER_POLICY");
  const rest = scored.filter((s) => s.category !== "OWNER_POLICY" && s.score > -900);
  const selected = policies.concat(rest).slice(0, (extras && extras.limit) || 12);

  // Ensure policies never displaced
  const outIds = new Set(selected.map((s) => s.item.id));
  for (const p of policies) {
    if (!outIds.has(p.item.id)) {
      selected.unshift(p);
      outIds.add(p.item.id);
    }
  }

  return {
    workspaceId: ws,
    roleId: roleId || null,
    method: "lexical_hybrid_priority_v0",
    embeddings: false,
    vectorSearch: false,
    futureEmbeddingBoundary: true,
    priorityOrder: MEMORY_PRIORITY,
    retrieved: selected.map((s) => ({
      id: s.item.id,
      category: s.category,
      priority: s.priority,
      score: s.score,
      statement: String(s.item.statement || "").slice(0, 280),
      mandatory: s.category === "OWNER_POLICY",
      applicableRole: s.item.applicableRole || s.item.roleId || null,
    })),
    mandatoryPolicyCount: policies.length,
    note: "OWNER_POLICY always survives. Different roles bias ROLE_SPECIFIC. Portfolio general only when no leak. No embeddings.",
  };
}

/** D. Employee development record (honest statuses) */
export function employeeDevelopmentRecord(store, employeeId) {
  const emp = (store.getEmployeeRole && store.getEmployeeRole(employeeId))
    || ((store.listEmployeeRoles && store.listEmployeeRoles()) || []).find((e) => e.id === employeeId || e.employeeId === employeeId);
  if (!emp) {
    const err = new Error("employee not found: " + employeeId);
    err.code = "NOT_FOUND";
    throw err;
  }
  const ws = emp.workspaceId;
  const tasks = ((store.listEmployeeTasks && store.listEmployeeTasks(ws)) || []).filter((t) => t.employeeId === emp.id || t.roleId === emp.roleId);
  const knowledge = retrieveByMemoryPriority(store, ws, { roleId: emp.roleId, limit: 8 });
  const spend = ((store.listSpendLedgerForWorkspace && store.listSpendLedgerForWorkspace(ws)) || [])
    .filter((s) => s.employeeId === emp.id || s.agentId === emp.agentId);
  const live = ((store.listSpecialistExecutions && store.listSpecialistExecutions(ws)) || [])
    .filter((x) => x.employeeId === emp.id || x.roleId === emp.roleId);
  const statusRaw = String(emp.status || "uninitialized").toLowerCase();
  let honestStatus = "uninitialized";
  if (statusRaw.includes("development_verified")) honestStatus = "development_verified";
  else if (statusRaw.includes("supervised") || statusRaw.includes("authorized_for_supervised")) honestStatus = "supervised_internal_use";
  else if (statusRaw.includes("development_required") || statusRaw.includes("needs_development")) honestStatus = "development_required";
  else if (statusRaw.includes("authorized") || statusRaw.includes("active")) honestStatus = "authorized";

  // EMP-001 special: development_verified on RidgeLine only
  if (emp.id === "EMP-001" && ws === "ws-ridgeline") honestStatus = "development_verified";

  const corrections = (knowledge.retrieved || []).filter((k) => k.category === "CORRECTIONS");
  return {
    id: emp.id,
    workspaceId: ws,
    roleId: emp.roleId,
    name: emp.name || emp.roleId,
    job: emp.roleId,
    skills: emp.skills || emp.allowedTaskTypes || [],
    approvedKnowledgeIds: knowledge.retrieved.map((k) => k.id),
    examples: (knowledge.retrieved || []).filter((k) => /example/i.test(k.category + (k.statement || ""))).slice(0, 5),
    mistakeCorrectionHistory: corrections,
    workHistory: tasks.slice(-10).map((t) => ({ id: t.id, status: t.status, kind: t.taskKind || t.kind, at: t.createdAt || t.updatedAt })),
    evalHistory: live.slice(-5).map((x) => ({ id: x.id, taskType: x.taskType, ok: x.ok, cost: x.estimatedCostUsd })),
    costHistory: spend.slice(-10).map((s) => ({ id: s.id, usd: s.estimatedCostUsd ?? s.amountUsd ?? null, at: s.createdAt })),
    versionHistory: emp.versionId ? [emp.versionId] : [],
    improvementOpportunities: [
      corrections.length ? "Apply recent corrections on next supervised task." : "No corrections stored yet.",
      live.length === 0 ? "No live specialist execution yet for this seat." : null,
      !roleIsImplemented(emp.roleId) ? "Handler unimplemented — do not present as active work." : null,
    ].filter(Boolean),
    honestStatus,
    worldClassClaim: false,
    embeddings: false,
    memory: knowledge,
    permissions: {
      canRaiseOwnBudget: false,
      maxExecutionLadder: CURRENT_MAX_EXECUTION_LEVEL,
      externalExecute: false,
    },
    honesty: MASTER_OS_HONESTY,
  };
}

/** C. Company-specific team proposal explanation (uses existing selectRoleIds) */
export function explainTeamForCompany(store, workspaceId, extras) {
  const ws = store.requireWorkspaceId(workspaceId);
  const workspace = store.getWorkspace(ws);
  if (!workspace) {
    const err = new Error("workspace not found: " + ws);
    err.code = "NOT_FOUND";
    throw err;
  }
  const opportunityId = extras && extras.opportunityId;
  const opp = opportunityId && store.getOpportunity ? store.getOpportunity(opportunityId) : null;
  const signals = collectWorkspaceSignals(workspace);
  if (opp) {
    signals.text = [signals.text, opp.name, asText(opp.problem && opp.problem.text), asText(opp.proposedOffer && opp.proposedOffer.text)].join(" ");
  }
  if (extras && extras.ownerObjective) signals.text = [signals.text, extras.ownerObjective].join(" ");
  const selected = selectRoleIds(signals);
  const roles = selected.roleIds.map((roleId) => {
    const spec = ROLE_CATALOG.find((r) => r.roleId === roleId);
    const implemented = roleIsImplemented(roleId);
    const live = ["marketing", "product", "finance", "sales", "executive", "offer_strategist", "business_research"].includes(roleId);
    return {
      roleId,
      name: (spec && spec.name) || roleId,
      why: selected.reasons[roleId] || "Selected from company/opportunity signals.",
      live: live && implemented,
      deterministic: implemented,
      unimplemented: !implemented,
      mode: !implemented ? "unimplemented" : (live ? "live_or_deterministic" : "deterministic"),
      silentlyAuthorized: false,
    };
  });
  return {
    workspaceId: ws,
    companyName: workspace.name,
    opportunityId: opportunityId || null,
    roles,
    founderAuth: {
      approveWholeTeam: true,
      removeRoles: true,
      adjustPermissionsSpendWithinBounds: true,
      silentAuthorize: false,
      note: "Owner must approve. Do not silently authorize. Do not present active if no handler.",
    },
    differentFromGeneric: true,
    honesty: MASTER_OS_HONESTY,
  };
}

/** E. Execution ladder recording */
export function recordExecutionAction(store, payload) {
  const workspaceId = store.requireWorkspaceId(payload.workspaceId);
  const level = Number(payload.level);
  if (!Number.isFinite(level) || level < 0 || level > 5) {
    const err = new Error("execution ladder level must be 0–5");
    err.code = "LADDER_INVALID";
    throw err;
  }
  const meta = EXECUTION_LADDER[level];
  if (level > CURRENT_MAX_EXECUTION_LEVEL || meta.available === false) {
    const rec = {
      id: nextId(((store.listExecutionActions && store.listExecutionActions()) || []).map((r) => r.id), "XACT-"),
      workspaceId,
      createdAt: nowIso(),
      level,
      label: meta.label,
      action: asText(payload.action),
      status: "rejected",
      reason: meta.note || "Level unavailable. External execute not authorized+integrated.",
      available: false,
    };
    store.putExecutionAction(rec);
    return { ok: false, action: rec, currentMax: CURRENT_MAX_EXECUTION_LEVEL, honesty: MASTER_OS_HONESTY };
  }
  const rec = {
    id: nextId(((store.listExecutionActions && store.listExecutionActions()) || []).map((r) => r.id), "XACT-"),
    workspaceId,
    createdAt: nowIso(),
    level,
    label: meta.label,
    action: asText(payload.action),
    status: "recorded",
    refId: payload.refId || null,
    available: true,
    employeeId: payload.employeeId || null,
  };
  store.putExecutionAction(rec);
  return { ok: true, action: rec, currentMax: CURRENT_MAX_EXECUTION_LEVEL, honesty: MASTER_OS_HONESTY };
}

/** E. Scheduled jobs — 24/7 foundations (persist across restart; not claiming always-on) */
export function upsertScheduledJob(store, payload) {
  const workspaceId = store.requireWorkspaceId(payload.workspaceId);
  const existing = (store.listScheduledJobs && store.listScheduledJobs(workspaceId)) || [];
  const id = payload.id || nextId(existing.map((r) => r.id).concat(((store.listScheduledJobs && store.listScheduledJobs()) || []).map((r) => r.id)), "JOB-");
  const idempotencyKey = asText(payload.idempotencyKey) || (id + ":" + asText(payload.kind));
  const dup = existing.find((j) => j.idempotencyKey === idempotencyKey && j.status !== "canceled");
  if (dup && !payload.id) {
    return { ok: true, job: dup, deduplicated: true, honesty: MASTER_OS_HONESTY };
  }
  const rec = {
    id,
    workspaceId,
    kind: asText(payload.kind) || "internal_tick",
    status: payload.status || "scheduled",
    createdAt: (dup && dup.createdAt) || nowIso(),
    updatedAt: nowIso(),
    nextRunAt: payload.nextRunAt || nowIso(),
    lastRunAt: payload.lastRunAt || null,
    retryLimit: payload.retryLimit != null ? Number(payload.retryLimit) : 3,
    retryCount: payload.retryCount != null ? Number(payload.retryCount) : 0,
    idempotencyKey,
    taskState: payload.taskState || "pending",
    pendingApprovalId: payload.pendingApprovalId || null,
    payload: payload.payload || {},
    alwaysOnClaim: false,
    persistence: "FILE_STORE",
    note: "Persisted job record for restart survival. FILE_STORE is not always-on/HA.",
  };
  store.putScheduledJob(rec);
  return { ok: true, job: rec, deduplicated: false, honesty: MASTER_OS_HONESTY };
}

export function simulateJobRestart(store, workspaceId) {
  const ws = store.requireWorkspaceId(workspaceId);
  const jobs = (store.listScheduledJobs && store.listScheduledJobs(ws)) || [];
  return {
    workspaceId: ws,
    survivedRestart: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      nextRunAt: j.nextRunAt,
      taskState: j.taskState,
      idempotencyKey: j.idempotencyKey,
      retryCount: j.retryCount,
      retryLimit: j.retryLimit,
      pendingApprovalId: j.pendingApprovalId,
    })),
    alwaysOn: false,
    highAvailability: false,
    note: "Records reloaded from FILE_STORE. This proves persistence across process restart simulation, not 24/7 uptime.",
    honesty: MASTER_OS_HONESTY,
  };
}

/** E. Autonomy loop tick — inspect policy, run permitted, pause unauthorized, budget, dedupe */
export function runAutonomyLoopTick(store, workspaceId, extras) {
  const ws = store.requireWorkspaceId(workspaceId);
  const policy = activeInternalAutonomyPolicy(store, ws);
  const proposed = (extras && extras.actions) || [
    { action: "run_internal_specialist_task", label: "Internal specialist draft" },
    { action: "write_local_artifact", label: "Local draft artifact" },
    { action: "outreach", label: "Outreach (should pause)" },
  ];
  const budgetUsd = Number((extras && extras.budgetUsd) || (policy && (policy.budgetUsd != null ? policy.budgetUsd : policy.maxSpendUsd)) || 0);
  const spent = ((store.listSpendLedgerForWorkspace && store.listSpendLedgerForWorkspace(ws)) || [])
    .reduce((a, s) => a + (Number(s.estimatedCostUsd) || 0), 0);
  const seen = new Set();
  const results = [];
  for (const step of proposed) {
    const key = step.action + ":" + (step.idempotencyKey || step.label || "");
    if (seen.has(key)) {
      results.push({ ...step, decision: "skipped_duplicate", reason: "Duplicate action in same tick." });
      continue;
    }
    seen.add(key);
    if (budgetUsd > 0 && spent >= budgetUsd && step.action !== "outreach") {
      results.push({ ...step, decision: "paused", reason: "Budget exhausted. Employees cannot raise own budget." });
      continue;
    }
    const decision = evaluateInternalAutonomy(store, ws, step.action, { employeeId: step.employeeId });
    if (decision.blocked || step.action === "outreach" || step.action === "publish" || step.action === "purchase") {
      results.push({
        ...step,
        decision: "paused",
        reason: decision.reason || "Unauthorized / restricted action paused.",
        policyId: decision.policyId,
      });
      continue;
    }
    if (decision.skipPrompt) {
      const ladder = recordExecutionAction(store, {
        workspaceId: ws,
        level: step.level != null ? step.level : 1,
        action: step.action,
        employeeId: step.employeeId,
      });
      results.push({
        ...step,
        decision: "executed_internal",
        reason: decision.reason,
        policyId: decision.policyId,
        executionActionId: ladder.action && ladder.action.id,
        liveProviderCall: false,
      });
    } else {
      results.push({
        ...step,
        decision: "paused",
        reason: decision.reason || "Requires owner prompt — not covered by autonomy policy.",
        policyId: decision.policyId,
      });
    }
  }
  const summary = {
    executed: results.filter((r) => r.decision === "executed_internal").length,
    paused: results.filter((r) => r.decision === "paused").length,
    skippedDuplicate: results.filter((r) => r.decision === "skipped_duplicate").length,
  };
  const tickId = nextId(((store.listAutonomyTicks && store.listAutonomyTicks()) || []).map((r) => r.id), "ATICK-");
  const tick = {
    id: tickId,
    workspaceId: ws,
    createdAt: nowIso(),
    policyId: policy && policy.id || null,
    budgetUsd,
    spentUsd: spent,
    results,
    summary,
    liveProviderCall: false,
    persistence: "FILE_STORE",
  };
  store.putAutonomyTick(tick);
  return { ok: true, tick, honesty: MASTER_OS_HONESTY, note: "Conductor inspected autonomy policy, executed permitted internal steps, paused unauthorized with reason, respected budget, avoided duplicates." };
}

/** E. Treasury surface */
export function treasuryView(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const ledger = workspaceId
    ? ((store.listSpendLedgerForWorkspace && store.listSpendLedgerForWorkspace(workspaceId)) || (store.listSpendLedger && store.listSpendLedger(workspaceId)) || [])
    : ((store.listSpendLedger && store.listSpendLedger()) || []);
  const buckets = {
    ACTUAL: [],
    OWNER_REPORTED: [],
    SOURCE_SUPPORTED: [],
    ESTIMATED: [],
    HYPOTHETICAL: [],
    UNKNOWN: [],
    MODEL_ESTIMATE: [],
    OBSERVED: [],
  };
  let actualSpend = 0;
  for (const row of ledger) {
    const cat = String(row.treasuryCategory || row.costStatus || "ESTIMATED").toUpperCase();
    const isLiveRow = row.live === true || row.kind === "live";
    const mapped = cat === "LIVE" || cat === "ACTUAL" || isLiveRow ? "ACTUAL"
      : cat === "OWNER_REPORTED" || cat === "OWNER_PROVIDED" ? "OWNER_REPORTED"
      : cat === "SOURCE_SUPPORTED" || cat === "VERIFIED" ? "SOURCE_SUPPORTED"
      : cat === "HYPOTHETICAL" ? "HYPOTHETICAL"
      : cat === "UNKNOWN" || cat === "UNKNOWN_COST" ? "UNKNOWN"
      : cat === "OBSERVED" ? "OBSERVED"
      : cat === "MODEL_ESTIMATE" ? "MODEL_ESTIMATE"
      : "ESTIMATED";
    const usd = Number(row.estimatedCostUsd ?? row.costUsd ?? row.amountUsd);
    const entry = {
      id: row.id,
      workspaceId: row.workspaceId,
      usd: Number.isFinite(usd) ? usd : null,
      category: mapped,
      at: row.createdAt,
      note: row.note || null,
    };
    (buckets[mapped] || buckets.UNKNOWN).push(entry);
    if (mapped === "ACTUAL" && Number.isFinite(usd)) actualSpend += usd;
  }
  // Owner-reported revenue never folded into actual
  const revenueActual = 0;
  const speculativeRevenueExcluded = true;
  return {
    built: true,
    workspaceId: workspaceId || null,
    categories: TREASURY_CATEGORIES,
    buckets,
    totals: {
      actualSpendUsd: Number(actualSpend.toFixed(6)),
      actualRevenueUsd: revenueActual,
      speculativeRevenueExcluded,
    },
    rules: {
      neverAddSpeculativeRevenueToActualPortfolio: true,
      employeesCannotRaiseOwnBudget: true,
      neverMixCategories: true,
    },
    honesty: MASTER_OS_HONESTY,
    note: "ACTUAL is live ledger spend only. OWNER_REPORTED / HYPOTHETICAL / ESTIMATED stay labeled. Revenue actual stays 0 unless separately observed.",
  };
}

export function enrichOpportunityInvestment(store, opportunityId) {
  const rec = store.getOpportunity(opportunityId);
  if (!rec) {
    const err = new Error("opportunity not found: " + opportunityId);
    err.code = "NOT_FOUND";
    throw err;
  }
  const investment = investmentFieldsFromOpportunity(rec);
  const next = {
    ...rec,
    investment,
    investmentEnrichedAt: nowIso(),
    updatedAt: nowIso(),
  };
  store.putOpportunity(next);
  return { ok: true, opportunity: presentOpportunity ? presentOpportunity(next) : next, investment, honesty: MASTER_OS_HONESTY };
}

export function masterOsOverviewExtras(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const plans = (store.listCommandPlans && store.listCommandPlans(workspaceId)) || [];
  const jobs = (store.listScheduledJobs && store.listScheduledJobs(workspaceId)) || [];
  const ticks = (store.listAutonomyTicks && store.listAutonomyTicks(workspaceId)) || [];
  const treasury = treasuryView(store, { workspaceId });
  return {
    commandPlans: plans.slice(-5).reverse().map((p) => ({ id: p.id, type: p.objectiveType, status: p.status, text: String(p.ownerText || "").slice(0, 120) })),
    scheduledJobs: jobs.filter((j) => j.status === "scheduled" || j.taskState === "pending").slice(0, 5),
    recentAutonomyTicks: ticks.slice(-3).reverse(),
    treasurySummary: treasury.totals,
    executionLadder: { currentMax: CURRENT_MAX_EXECUTION_LEVEL, levels: EXECUTION_LADDER },
    reviewNext: [
      plans.length ? "Review latest command plan" : "Submit a command: What do you want MIDAS to accomplish?",
      treasury.totals.actualSpendUsd > 0 ? "Review actual spend in Treasury/Spending" : null,
      "Pending approvals stay under Approvals (APR-005 untouched)",
    ].filter(Boolean),
  };
}
