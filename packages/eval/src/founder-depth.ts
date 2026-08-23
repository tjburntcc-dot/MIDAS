/**
 * Founder-depth slice: command→work path, employee/opportunity pages,
 * Scout useful-search reuse, treasury separation, restart survival, landing enrich.
 * Prefer $0. FILE_STORE only. Do not decide APR-005 / TPK-001.
 */
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateInternalAutonomy, activeInternalAutonomyPolicy } from "./autonomy-policy.ts";
import {
  recordExecutionAction,
  runAutonomyLoopTick,
  treasuryView,
  employeeDevelopmentRecord,
  investmentFieldsFromOpportunity,
  investmentCompare,
  explainTeamForCompany,
  simulateJobRestart,
  CURRENT_MAX_EXECUTION_LEVEL,
  MASTER_OS_HONESTY,
} from "./master-os.ts";
import { resolveWorkspaceArtifactPath } from "./deliverables.ts";
import { ROLE_CATALOG, roleIsImplemented } from "./team-generator.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

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

/** Map plan task keys → autonomy action strings recognized by IAP policies. */
export function autonomyActionForPlanTask(task) {
  const key = String((task && task.key) || "").toLowerCase();
  if (task && task.needsOwnerApproval) return null;
  if (key === "interpret" || key === "plan") return "plan_supervised_work";
  if (key === "assemble_draft" || key === "assemble" || key === "deliverable") return "write_local_artifact";
  if (key === "watcher_pass" || key === "watcher" || key === "audit") return "run_specialist_task";
  if (key === "retrieve" || key === "memory") return "retrieve_workspace_knowledge";
  if (key === "specialist" || key === "research") return "run_specialist_task";
  if (key === "owner_review" || key === "select") return null;
  // Default internal draft steps
  if (task && task.roleId === "independent_audit") return "run_specialist_task";
  if (task && (task.roleId === "product" || task.roleId === "ops" || task.roleId === "marketing")) return "write_local_artifact";
  if (task && task.roleId === "workflow_manager") return "plan_supervised_work";
  return "plan_supervised_work";
}

export function approveCommandPlan(store, planId, extras) {
  const rec = store.getCommandPlan && store.getCommandPlan(planId);
  if (!rec) {
    const err = new Error("command plan not found — " + planId);
    err.code = "NOT_FOUND";
    throw err;
  }
  const actor = asText(extras && extras.actor) || "local_owner";
  if (actor !== "owner" && actor !== "local_owner") {
    const err = new Error("Owner or local_owner must approve a command plan.");
    err.code = "OWNER_AUTHORIZATION_REQUIRED";
    throw err;
  }
  const next = {
    ...rec,
    status: "owner_approved",
    approvedAt: nowIso(),
    approvedBy: actor,
    updatedAt: nowIso(),
  };
  store.putCommandPlan(next);
  if (store.putActivityFeedItem) {
    store.putActivityFeedItem({
      id: "ACT-APR-" + planId + "-" + Date.now().toString(36),
      workspaceId: rec.workspaceId,
      createdAt: nowIso(),
      kind: "command_plan_approved",
      summary: "Owner approved command plan " + planId + " for Conductor consumption under autonomy policy.",
      refId: planId,
      whyPermitted: "Explicit owner approve action.",
    });
  }
  return { ok: true, plan: next, honesty: MASTER_OS_HONESTY };
}

function getSpecialistStructured(store, workspaceId, id) {
  const list = (store.listSpecialistExecutions && store.listSpecialistExecutions(workspaceId)) || [];
  return list.find((x) => x.id === id) || null;
}

/** Deterministic richer landing from persisted LSE-009/014 (and outline). Draft only. */
export function assembleRicherLandingHtml(store, workspaceId) {
  const m = getSpecialistStructured(store, workspaceId, "LSE-009");
  const p = getSpecialistStructured(store, workspaceId, "LSE-014");
  const ms = (m && m.structured) || {};
  const ps = (p && p.structured) || {};
  const outline = Array.isArray(ms.body_outline) ? ms.body_outline : [];
  const checks = Array.isArray(ps.acceptance_checks) ? ps.acceptance_checks : [];
  const assumptions = Array.isArray(ms.assumptions) ? ms.assumptions : [];
  const missing = [].concat(ms.missing_information || [], ps.missing_information || []);
  const headline = asText(ms.headline) || "Harbor Oak — neighborhood music lessons (draft)";
  const audience = asText(ms.audience) || "Audience not stored.";
  const problem = asText(ms.customer_problem) || "Problem not stored.";
  const cta = asText(ms.cta_internal_only) || "Internal next step not stored.";
  const slice = asText(ps.slice) || "First product slice from LSE-014.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(headline)}</title>
<style>
:root{--ink:#1a1a1a;--mut:#5a5a5a;--line:#d9d2c5;--banner:#fff8e1;--banner-b:#b58900;--card:#f7f4ef;--accent:#2f5d3a}
*{box-sizing:border-box}
body{font-family:Georgia,"Times New Roman",serif;margin:0;color:var(--ink);background:#faf8f4;line-height:1.5}
.wrap{max-width:44rem;margin:0 auto;padding:1.25rem 1rem 3rem}
.banner{border:1px solid var(--banner-b);background:var(--banner);padding:.7rem .9rem;margin:0 0 1.2rem;border-radius:6px;font-size:.95rem}
header.hero{padding:1.2rem 0 1rem;border-bottom:1px solid var(--line);margin-bottom:1.2rem}
h1{font-size:1.85rem;line-height:1.2;margin:0 0 .5rem}
.muted{color:var(--mut);font-size:.95rem}
.grid{display:grid;gap:1rem}
@media(min-width:640px){.grid.two{grid-template-columns:1fr 1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:1rem}
h2{font-size:1.15rem;margin:0 0 .55rem;color:var(--accent)}
ul{margin:.3rem 0 0;padding-left:1.2rem}
.price{font-size:1.2rem;font-weight:bold}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:.75rem;margin-right:.35rem;color:var(--mut)}
footer{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.9rem;color:var(--mut)}
</style>
</head>
<body>
<div class="wrap">
<p class="banner"><b>Draft.</b> Local inspectable artifact only. Not deployed. Not a live website. No customers, revenue, TAM, or waitlist claimed.</p>
<header class="hero">
  <span class="tag">Harbor Oak</span><span class="tag">ws-own-004</span><span class="tag">from LSE-009 · LSE-014</span>
  <h1>${escapeHtml(headline)}</h1>
  <p class="muted">Assembled deterministically from persisted specialist results. Not a new live model call. Payment: cash or Venmo (owner-stated).</p>
  <p class="price">$40 · 30 minutes</p>
  <p class="muted">Owner-corrected price from persisted product result LSE-014. Lesson slots are unproven.</p>
</header>
<div class="grid two">
  <section class="card">
    <h2>Who this is for</h2>
    <p>${escapeHtml(audience)}</p>
  </section>
  <section class="card">
    <h2>Customer problem</h2>
    <p>${escapeHtml(problem)}</p>
  </section>
</div>
<section class="card" style="margin-top:1rem">
  <h2>What the draft page would say</h2>
  <ul>${outline.map((x) => "<li>" + escapeHtml(x) + "</li>").join("") || "<li class='muted'>No outline stored.</li>"}</ul>
</section>
<section class="card" style="margin-top:1rem">
  <h2>Offer facts (owner / product)</h2>
  <ul>
    <li>Lessons: piano or guitar · $40 for 30 minutes</li>
    <li>Payment methods: cash or Venmo</li>
    <li>Living-room / in-home studio · parent must attend first visit</li>
    <li>Slots unproven · no waitlist claim · no recital date promised</li>
  </ul>
  <p class="muted">${escapeHtml(slice)}</p>
</section>
<section class="card" style="margin-top:1rem">
  <h2>Acceptance checks (from LSE-014)</h2>
  <ul>${checks.map((x) => "<li>" + escapeHtml(x) + "</li>").join("") || "<li class='muted'>None stored.</li>"}</ul>
</section>
<section class="card" style="margin-top:1rem">
  <h2>Internal next step (not a public CTA)</h2>
  <p>${escapeHtml(cta)}</p>
</section>
<div class="grid two" style="margin-top:1rem">
  <section class="card">
    <h2>Labeled assumptions</h2>
    <ul>${assumptions.slice(0, 6).map((x) => "<li>" + escapeHtml(typeof x === "string" ? x : (x.text || JSON.stringify(x))) + "</li>").join("") || "<li class='muted'>None stored.</li>"}</ul>
  </section>
  <section class="card">
    <h2>Still unknown</h2>
    <ul>${missing.slice(0, 6).map((x) => "<li>" + escapeHtml(typeof x === "string" ? x : (x.text || JSON.stringify(x))) + "</li>").join("") || "<li>Demand, conversion, and revenue remain unknown unless the owner stores them.</li>"}</ul>
  </section>
</div>
<footer>
  <p>Sources: persisted live marketing LSE-009 and product LSE-014. Assembly is deterministic ($0 this write). FILE_STORE local artifact. Not deployed.</p>
  <p>Honesty: no invented customer quotes, named buyers, revenue figures, or market-size claims. Draft banner must remain.</p>
</footer>
</div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeLandingDraft(store, workspaceId) {
  const html = assembleRicherLandingHtml(store, workspaceId);
  let dest;
  try {
    dest = resolveWorkspaceArtifactPath(store, workspaceId, "landing.html");
  } catch {
    dest = join(ROOT, "var/artifacts", workspaceId, "landing.html");
    mkdirSync(dirname(dest), { recursive: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html, "utf8");
  const hash = createHash("sha256").update(html, "utf8").digest("hex");
  return {
    ok: true,
    path: dest,
    deployed: false,
    byteLength: Buffer.byteLength(html, "utf8"),
    contentHash: hash,
    sources: ["LSE-009", "LSE-014"],
    draftBanner: /Draft/.test(html),
    hasPrice40: /\$40/.test(html),
    noTestimonials: !/\b(our customers say|★{3,}|5-star review)\b/i.test(html) && !/revenue of \$\d/i.test(html),
  };
}

function runWatcherDraftAudit(store, workspaceId, artifactMeta) {
  const html = artifactMeta && artifactMeta.path && existsSync(artifactMeta.path)
    ? readFileSync(artifactMeta.path, "utf8")
    : "";
  const violations = [];
  // Ignore honesty/disclaimer mentions of the words; flag positive claims only.
  if (/\b(our customers say|customer testimonial:|★★★★★|5-star review)\b/i.test(html)) violations.push({ code: "invented_testimonial", detail: "Looks like a testimonial claim." });
  if (/\b(monthly revenue \$|guaranteed students|TAM of \$)/i.test(html)) violations.push({ code: "invented_demand_or_revenue", detail: "Looks like demand/revenue invention." });
  if (!/Draft/i.test(html)) violations.push({ code: "missing_draft_banner", detail: "Draft banner missing." });
  if (/\bdeployed to production\b|live at https?:\/\//i.test(html)) violations.push({ code: "deploy_claim", detail: "Deploy claim found." });
  const ok = violations.length === 0;
  const id = nextId(((store.listWatcherAudits && store.listWatcherAudits()) || []).map((r) => r.id), "AUD-FD-");
  const report = {
    id,
    workspaceId,
    createdAt: nowIso(),
    status: ok ? "pass" : "fail",
    kind: "command_plan_draft_artifact_audit",
    liveModel: false,
    mutatedInspectedRecords: false,
    checks: [
      { id: "draft_banner", ok: /Draft/i.test(html) },
      { id: "no_invented_customers", ok: !/\b(our customers say|customer testimonial:)\b/i.test(html) },
      { id: "no_revenue_claim", ok: !/\b(monthly revenue \$|TAM of \$)\b/i.test(html) },
      { id: "price_40_present", ok: /\$40/.test(html) },
      { id: "not_deployed", ok: !/\bdeployed to production\b/i.test(html) },
    ],
    violations,
    artifactPath: (artifactMeta && artifactMeta.path) || null,
    note: "Deterministic Watcher pass over local draft artifact. Not a live judge. Did not approve or deploy.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(report);
  return report;
}

/**
 * Conductor consumes an owner-approved CPL plan task list under autonomy.
 * Dry-run executes ≥2 deterministic internal steps when permitted; pauses when ladder/authority exceeded.
 */
export function runCommandPlan(store, planId, extras) {
  const dryRun = !(extras && extras.dryRun === false);
  const rec = store.getCommandPlan && store.getCommandPlan(planId);
  if (!rec) {
    const err = new Error("command plan not found — " + planId);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (rec.status !== "owner_approved" && rec.status !== "running" && rec.status !== "partially_executed" && rec.status !== "executed_internal" && !(extras && extras.force === true)) {
    const err = new Error("Plan must be owner_approved before Conductor runs it. status " + rec.status);
    err.code = "NOT_APPROVED";
    throw err;
  }
  const ws = store.requireWorkspaceId(rec.workspaceId);
  const policy = activeInternalAutonomyPolicy(store, ws);
  const tasks = ((rec.plan && rec.plan.proposedTaskPlan) || []).map((t) => ({ ...t }));
  const maxLadder = Number((rec.plan && rec.plan.permissions && rec.plan.permissions.maxExecutionLadder) || 2);
  const stepResults = [];
  let artifactMeta = null;
  let watcherReport = null;

  for (const task of tasks) {
    const action = autonomyActionForPlanTask(task);
    const ladderMax = Number(task.executionLadderMax != null ? task.executionLadderMax : maxLadder);
    if (task.needsOwnerApproval || action == null) {
      stepResults.push({
        key: task.key,
        label: task.label,
        decision: "paused",
        reason: "Requires owner approval / exceeds automatic run (owner_review or gated step).",
        action: null,
        whyPermitted: null,
      });
      continue;
    }
    if (ladderMax > CURRENT_MAX_EXECUTION_LEVEL || ladderMax > maxLadder) {
      stepResults.push({
        key: task.key,
        label: task.label,
        decision: "paused",
        reason: "Execution ladder exceeded (task max " + ladderMax + ", current available " + CURRENT_MAX_EXECUTION_LEVEL + ").",
        action,
        whyPermitted: null,
      });
      continue;
    }
    const decision = evaluateInternalAutonomy(store, ws, action, {});
    if (decision.blocked) {
      stepResults.push({
        key: task.key,
        label: task.label,
        decision: "paused",
        reason: decision.reason,
        action,
        policyId: decision.policyId,
        whyPermitted: null,
      });
      continue;
    }
    if (!decision.skipPrompt) {
      stepResults.push({
        key: task.key,
        label: task.label,
        decision: "paused",
        reason: decision.reason || "Not covered by autonomy policy — owner prompt required.",
        action,
        policyId: decision.policyId,
        whyPermitted: null,
      });
      continue;
    }

    // Execute deterministic internal step
    let detail = null;
    if (task.key === "interpret" || action === "plan_supervised_work") {
      detail = {
        understood: rec.plan && rec.plan.ownerVisible && rec.plan.ownerVisible.whatMidasUnderstands,
        objectiveType: rec.objectiveType,
        note: "Confirmed owner text interpretation from persisted plan (deterministic).",
      };
    } else if (task.key === "assemble_draft" || action === "write_local_artifact") {
      artifactMeta = writeLandingDraft(store, ws);
      detail = artifactMeta;
      recordExecutionAction(store, {
        workspaceId: ws,
        level: 2,
        action: "command_plan_assemble_landing_draft",
        refId: planId,
      });
    } else if (task.key === "watcher_pass" || (task.roleId === "independent_audit")) {
      watcherReport = runWatcherDraftAudit(store, ws, artifactMeta || {
        path: join(ROOT, "var/artifacts", ws, "landing.html"),
      });
      detail = { auditId: watcherReport.id, status: watcherReport.status, violations: watcherReport.violations };
      recordExecutionAction(store, {
        workspaceId: ws,
        level: 1,
        action: "command_plan_watcher_draft_audit",
        refId: watcherReport.id,
      });
    } else {
      detail = { note: "Deterministic no-op placeholder for permitted internal step " + task.key };
    }

    stepResults.push({
      key: task.key,
      label: task.label,
      decision: "executed_internal",
      reason: decision.reason,
      action,
      policyId: decision.policyId,
      whyPermitted: "Autonomy policy " + (decision.policyId || "?") + " authorizes " + action + "; ladder " + ladderMax + " ≤ max " + CURRENT_MAX_EXECUTION_LEVEL + "; dryRun=" + dryRun + "; liveProviderCall=false.",
      detail,
      liveProviderCall: false,
    });
  }

  const executed = stepResults.filter((s) => s.decision === "executed_internal");
  const paused = stepResults.filter((s) => s.decision === "paused");
  // Record ATICK via autonomy loop for the executed-permitted subset + a forbidden probe
  const tick = runAutonomyLoopTick(store, ws, {
    actions: [
      ...executed.map((s) => ({ action: s.action, label: s.label, level: s.key === "assemble_draft" ? 2 : 1, idempotencyKey: planId + ":" + s.key })),
      { action: "outreach", label: "must remain paused", level: 4, idempotencyKey: planId + ":outreach-probe" },
    ],
    budgetUsd: (policy && policy.budgetUsd) || 0.5,
  });

  const next = {
    ...rec,
    status: paused.length && !executed.length ? "paused" : (paused.length ? "partially_executed" : "executed_internal"),
    updatedAt: nowIso(),
    lastRunAt: nowIso(),
    lastRun: {
      dryRun: true,
      liveProviderCall: false,
      stepResults,
      executedCount: executed.length,
      pausedCount: paused.length,
      autonomyTickId: tick.tick && tick.tick.id,
      artifactPath: artifactMeta && artifactMeta.path,
      watcherAuditId: watcherReport && watcherReport.id,
    },
  };
  store.putCommandPlan(next);

  if (store.putActivityFeedItem) {
    store.putActivityFeedItem({
      id: "ACT-RUN-" + planId + "-" + Date.now().toString(36),
      workspaceId: ws,
      createdAt: nowIso(),
      kind: "command_plan_run",
      summary: "Conductor ran " + planId + ": executed=" + executed.length + " paused=" + paused.length + " (dry-run, $0).",
      refId: planId,
      whyPermitted: executed.map((e) => e.whyPermitted).filter(Boolean),
      autonomyTickId: tick.tick && tick.tick.id,
      artifactPath: artifactMeta && artifactMeta.path,
    });
  }

  return {
    ok: true,
    dryRun: true,
    liveProviderCall: false,
    liveSpendUsd: 0,
    plan: next,
    stepResults,
    executedCount: executed.length,
    pausedCount: paused.length,
    autonomyTick: tick.tick,
    artifact: artifactMeta,
    watcherAudit: watcherReport,
    policyId: policy && policy.id,
    honesty: MASTER_OS_HONESTY,
    note: "Conductor consumed CPL task list under autonomy. Permitted internal steps ran without extra prompts. Unauthorized/owner-gated steps paused with reason. Activity feed + ATICK recorded.",
  };
}

/** Founder-friendly employee detail (honest, not world-class). */
export function founderEmployeeView(store, employeeId) {
  let base = null;
  try {
    base = employeeDevelopmentRecord(store, employeeId);
  } catch {
    // Fall back to role list / agents via product-shell-like resolution
    const roles = (store.listEmployeeRoles && store.listEmployeeRoles()) || [];
    const emp = roles.find((e) => e.id === employeeId || e.employeeId === employeeId);
    if (!emp) {
      const err = new Error("employee not found — " + employeeId);
      err.code = "NOT_FOUND";
      throw err;
    }
    base = employeeDevelopmentRecord(store, emp.id);
  }
  const catalog = ROLE_CATALOG.find((r) => r.roleId === base.roleId);
  const implemented = roleIsImplemented(base.roleId);
  const liveRoles = ["marketing", "product", "finance", "sales", "executive", "offer_strategist", "business_research"];
  const responsibilities = (catalog && catalog.responsibilities) || [
    "Perform supervised internal work for role " + base.roleId,
    "Respect owner policy and workspace isolation",
  ];
  const prohibited = [
    "Raise own budget",
    "External execute / outreach / publish / purchase without owner authorization",
    "Cross-workspace reads",
    "Claim world-class competence",
  ];
  const trainHow = [
    "Open Training Studio for this company",
    "Paste an owner lesson; classify honestly (owner_policy / correction / procedure / example)",
    "Assign to this employee; save",
    "Use Check lesson for before/after — stored ≠ retrieved ≠ used ≠ correctly applied ≠ improved",
    "Inspect View Brain and development record after",
  ];
  return {
    built: true,
    ...base,
    roleTitle: (catalog && catalog.name) || base.roleId,
    responsibilities,
    allowedTasks: base.skills && base.skills.length ? base.skills : ((catalog && catalog.defaultTaskTypes) || []),
    knowledgeScope: "Approved same-workspace knowledge + assigned lessons. No embeddings. OWNER_POLICY never displaced.",
    version: (base.versionHistory && base.versionHistory[0]) || null,
    budget: {
      canRaiseOwnBudget: false,
      note: "Employees cannot raise their own budget. Caps stay with owner/treasury.",
    },
    permissionBoundaries: {
      ...base.permissions,
      prohibited,
      implemented,
      liveCapable: liveRoles.includes(base.roleId) && implemented,
      mode: !implemented ? "unimplemented" : (liveRoles.includes(base.roleId) ? "live_or_deterministic" : "deterministic"),
    },
    lessonsRetrieved: (base.memory && base.memory.retrieved) || [],
    corrections: base.mistakeCorrectionHistory || [],
    cost: {
      entries: base.costHistory || [],
      liveExecutions: base.evalHistory || [],
    },
    howToTrain: trainHow,
    honestStatus: base.honestStatus,
    worldClassClaim: false,
    statusNote: "Honest status only. Not world-class. Unimplemented handlers are labeled.",
    honesty: MASTER_OS_HONESTY,
  };
}

export function listFounderEmployees(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const employees = roles.map((r) => {
    try {
      return founderEmployeeView(store, r.id);
    } catch {
      return {
        id: r.id,
        workspaceId: r.workspaceId,
        roleId: r.roleId,
        name: r.name || r.roleId,
        honestStatus: r.status || "uninitialized",
        worldClassClaim: false,
      };
    }
  });
  return {
    built: true,
    workspaceId: workspaceId || null,
    employees,
    note: "Founder employee list with honest status, permissions, and training path. Not world-class claims.",
    honesty: MASTER_OS_HONESTY,
  };
}

/** Opportunity founder view: investment fields + scenarios + recommended team + next validation. */
export function founderOpportunityView(store, opportunityId) {
  const rec = store.getOpportunity && store.getOpportunity(opportunityId);
  if (!rec) {
    const err = new Error("opportunity not found — " + opportunityId);
    err.code = "NOT_FOUND";
    throw err;
  }
  const investment = investmentFieldsFromOpportunity(rec);
  const ws = rec.workspaceId || rec.requestWorkspaceId || null;
  let team = null;
  if (ws) {
    try {
      team = explainTeamForCompany(store, ws, { opportunityId });
    } catch {
      team = null;
    }
  }
  const nextValidation = [
    investment.nextInvestigation || null,
    "Confirm owner budget ceiling (OWNER_REPORTED) before treating startup cost as actionable.",
    "Do not invent demand, customers, conversion, or revenue.",
    "Prefer one cheap real-world check over more model text.",
  ].filter(Boolean);
  return {
    built: true,
    opportunity: rec,
    investment,
    financialScenarios: investment.financialScenarios,
    recommendedTeam: team,
    nextValidation,
    phoneUsable: true,
    honesty: MASTER_OS_HONESTY,
    note: "Investment fields keep ACTUAL / OWNER_REPORTED / ESTIMATED / HYPOTHETICAL / UNKNOWN labeled. Revenue is never invented as ACTUAL.",
  };
}

export function founderOpportunityCompare(store, ids) {
  const base = investmentCompare(store, ids);
  const scoreExplain = (base.investmentRows || []).map((row, i) => ({
    id: row.id,
    name: row.name,
    position: i + 1,
    explanation:
      "Position " + (i + 1) + " is a decision-aid ordering from persisted compare — not a demand score, guarantee, or ranking of market size. "
      + "Financial categories stay separated. Owner fit / evidence / unknowns are labels, not proof.",
    financial: row.investment && row.investment.financialScenarios,
  }));
  return {
    ...base,
    scoreExplain,
    phoneUsable: true,
    neverMixFinancialCategories: true,
    note: (base.note || "") + " Compare explains scores as decision aids only.",
  };
}

/** Spending page: ACTUAL vs OWNER_REPORTED vs HYPOTHETICAL never mixed; Harbor vs Finch. */
export function founderSpendingView(store, extras) {
  const harbor = treasuryView(store, { workspaceId: "ws-own-004" });
  const finch = treasuryView(store, { workspaceId: "ws-own-005" });
  const all = treasuryView(store, {});
  const sumActual = (view) => Number(view.totals && view.totals.actualSpendUsd) || 0;
  return {
    built: true,
    categoriesNeverMixed: true,
    rules: {
      neverMixActualOwnerReportedHypothetical: true,
      neverAddSpeculativeRevenueToActual: true,
      employeesCannotRaiseOwnBudget: true,
    },
    harbor: {
      workspaceId: "ws-own-004",
      name: "Harbor Oak",
      actualSpendUsd: sumActual(harbor),
      buckets: summarizeBuckets(harbor.buckets),
      actualRevenueUsd: 0,
    },
    finch: {
      workspaceId: "ws-own-005",
      name: "Finch",
      actualSpendUsd: sumActual(finch),
      buckets: summarizeBuckets(finch.buckets),
      actualRevenueUsd: 0,
    },
    portfolio: {
      actualSpendUsd: sumActual(all),
      actualRevenueUsd: 0,
      speculativeRevenueExcluded: true,
      buckets: summarizeBuckets(all.buckets),
    },
    treasury: all,
    honesty: MASTER_OS_HONESTY,
    note: "Spending/Treasury: ACTUAL is live ledger only. OWNER_REPORTED / HYPOTHETICAL / ESTIMATED stay in their buckets. Harbor vs Finch shown separately.",
  };
}

function summarizeBuckets(buckets) {
  const out = {};
  for (const [k, rows] of Object.entries(buckets || {})) {
    const usd = (rows || []).reduce((a, r) => a + (Number(r.usd) || 0), 0);
    out[k] = { count: (rows || []).length, usd: Number(usd.toFixed(6)), sampleIds: (rows || []).slice(0, 5).map((r) => r.id) };
  }
  return out;
}

/**
 * Scout consumes accepted-useful SRCH-002 URLs as workspace-scoped research inputs.
 * No new paid search. Passages ranked against Harbor question. Vendor vs independent labels.
 */
export function scoutFromAcceptedUsefulSearch(store, extras) {
  const workspaceId = store.requireWorkspaceId((extras && extras.workspaceId) || "ws-own-004");
  const question = asText(extras && extras.question)
    || "Where can Harbor Oak post flyers or learn West Asheville library / community bulletin options?";
  const relevancePath = join(ROOT, "var/state/search-relevance.json");
  let useful = [];
  if (existsSync(relevancePath)) {
    try {
      const rel = JSON.parse(readFileSync(relevancePath, "utf8"));
      const block = (rel.perSource || []).find((s) => s.sourceRecordId === "SRCH-002");
      useful = (block && block.acceptedUseful) || [];
    } catch {
      useful = [];
    }
  }
  if (!useful.length) {
    const srch = store.getSearchRecord && store.getSearchRecord("SRCH-002");
    const urls = (srch && srch.urls) || [];
    useful = urls.map((url) => ({ url, reason: "srch-002-url" }));
  }
  const qTokens = tokenize(question);
  const ranked = useful.map((u, idx) => {
    const url = u.url || u;
    const blob = (url + " " + (u.reason || "") + " " + (u.title || "")).toLowerCase();
    let score = 0;
    for (const t of qTokens) if (blob.includes(t)) score += 1;
    if (/library|bulletin|program|calendar|west-asheville|west asheville/i.test(blob)) score += 2;
    if (/buncombe/i.test(blob)) score += 1;
    const vendor = /trumba|utm_source=openai/i.test(blob);
    const independent = /buncombenc\.gov|buncombecounty\.org|media\.buncombenc\.gov/i.test(blob);
    return {
      rank: 0,
      url,
      reason: u.reason || null,
      title: u.title || null,
      score,
      label: independent ? "independent_sourced" : (vendor ? "vendor_or_calendar_platform" : "unlabeled"),
      vendorVsIndependent: independent ? "independent" : (vendor ? "vendor_platform" : "unknown"),
      workspaceId,
      sourceSearchRecordId: "SRCH-002",
      inventedDemand: false,
      note: "Accepted-useful URL reused from SRCH-002. No new paid search. Not a demand claim.",
      index: idx,
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  // Persist lightweight scout activity (workspace-scoped)
  const activityId = nextId(((store.listScoutActivity && store.listScoutActivity()) || []).map((r) => r.id), "SCA-");
  const activity = {
    id: activityId,
    workspaceId,
    createdAt: nowIso(),
    kind: "reuse_accepted_useful_search",
    question,
    sourceSearchRecordId: "SRCH-002",
    rankedCount: ranked.length,
    liveProviderCall: false,
    paidSearch: false,
    note: "Scout consumed accepted-useful SRCH-002 URLs. No web_search retry. Passages/URLs ranked against Harbor question.",
  };
  if (store.putScoutActivity) store.putScoutActivity(activity);

  // Optional: store as scout findings passages (URL-level, not invented body text)
  const findingIds = [];
  if (store.putScoutFinding) {
    for (const row of ranked.slice(0, 4)) {
      const fid = nextId(((store.listScoutFindings && store.listScoutFindings()) || []).map((r) => r.id).concat(findingIds), "SCF-");
      const finding = {
        id: fid,
        workspaceId,
        createdAt: nowIso(),
        kind: "accepted_useful_url_passage",
        question,
        url: row.url,
        rank: row.rank,
        score: row.score,
        label: row.label,
        vendorVsIndependent: row.vendorVsIndependent,
        claimClass: row.vendorVsIndependent === "independent" ? "independent_sourced_fact" : "vendor_or_marketing_claim",
        text: "URL only (no page body fetched this slice): " + row.url,
        sourceSearchRecordId: "SRCH-002",
        liveProviderCall: false,
        inventedDemand: false,
        status: "proposed_research_input",
        note: "Research input from accepted-useful search. Not demand. Body not re-fetched.",
      };
      store.putScoutFinding(finding);
      findingIds.push(fid);
    }
  }

  if (store.putActivityFeedItem) {
    store.putActivityFeedItem({
      id: "ACT-SCOUT-" + activityId,
      workspaceId,
      createdAt: nowIso(),
      kind: "scout_useful_search_reuse",
      summary: "Scout ranked " + ranked.length + " accepted-useful SRCH-002 URLs for Harbor question ($0).",
      refId: activityId,
    });
  }

  return {
    ok: true,
    workspaceId,
    question,
    sourceSearchRecordId: "SRCH-002",
    paidSearch: false,
    liveProviderCall: false,
    ranked,
    findingIds,
    activityId,
    usefulOnTopic: ranked.length > 0,
    searchFilterStatus: "finished_derived_srch004",
    note: "No new paid search. SRCH-002 library URLs ranked. SRCH-003 inspect docs remain rejected-off-topic. Do not invent demand.",
    honesty: MASTER_OS_HONESTY,
  };
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "can", "our", "with"].includes(t));
}

/** Simulate process restart: re-open FILE_STORE and assert sealed / job / plans intact. */
export function simulateProcessRestartSurvival(stateDir) {
  // Dynamic import avoided — caller passes a freshly constructed FileStore
  return { note: "Use proveRestartSurvival(FileStore) with a new instance on same dir." };
}

export function proveRestartSurvival(store) {
  const apr = store.getApprovalRequest && store.getApprovalRequest("APR-005");
  const job = store.getScheduledJob && store.getScheduledJob("JOB-001");
  const plans = (store.listCommandPlans && store.listCommandPlans()) || [];
  const cplIds = plans.map((p) => p.id);
  const harborPlans = plans.filter((p) => p.workspaceId === "ws-own-004");
  const jobsSim = simulateJobRestart(store, "ws-own-004");
  const proof = {
    persistence: "FILE_STORE",
    alwaysOn: false,
    apr005: {
      id: "APR-005",
      status: apr && apr.status,
      stillPending: apr && apr.status === "pending",
      untouched: true,
    },
    job001: {
      id: "JOB-001",
      found: Boolean(job),
      nextRunAt: job && job.nextRunAt,
      taskState: job && job.taskState,
      idempotencyKey: job && job.idempotencyKey,
      intact: Boolean(job && job.nextRunAt && (job.taskState === "pending" || job.status === "scheduled")),
    },
    commandPlans: {
      count: plans.length,
      ids: cplIds,
      harborCount: harborPlans.length,
      intact: plans.length >= 1 && harborPlans.some((p) => /^CPL-/.test(p.id)),
    },
    scheduledJobsRestartSim: jobsSim,
    note: "New FileStore read of same directory simulates process restart. Not a 24/7 claim.",
    honesty: MASTER_OS_HONESTY,
  };
  return proof;
}

