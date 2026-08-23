/**
 * Founder Command Center — deterministic NL → bounded plan.
 * Default $0 planning. Live model optional later.
 * Persistence: FILE_STORE. Not always-on. Not IAM.
 */
import { createHash } from "node:crypto";
import { evaluateInternalAutonomy, activeInternalAutonomyPolicy } from "./autonomy-policy.ts";
import { selectRoleIds, collectWorkspaceSignals, roleIsImplemented, ROLE_CATALOG } from "./team-generator.ts";

export const COMMAND_PLANNER = "deterministic_pattern_match_v0";
export const COMMAND_HONESTY = {
  persistence: "FILE_STORE",
  planner: COMMAND_PLANNER,
  liveProviderCall: false,
  embeddings: false,
  searchIntegrationExists: false,
  alwaysOn: false,
  note: "Deterministic planner. Pattern-match + structured extraction from owner text. Not a live model call by default.",
};

export const OBJECTIVE_TYPES = [
  "new_business",
  "grow_existing",
  "train",
  "deliverable",
  "research",
  "execution_plan",
];

const TYPE_PATTERNS = [
  { objectiveType: "new_business", re: /find (three |3 |some )?(business |startup )?(opportunit|ideas)|start (a |an )?(new )?(business|company)|with \$?[\d,]+/i },
  { objectiveType: "grow_existing", re: /analy[sz]e (this |the )?(existing )?(company|business)|grow (this |the |our )|biggest growth|existing company/i },
  { objectiveType: "train", re: /train |teach |using these notes|ingest (these )?notes|marketing using/i },
  { objectiveType: "deliverable", re: /landing page|create (a |an )?(prd|ops checklist|artifact|page)|draft (a |an )?(landing|checklist|prd)/i },
  { objectiveType: "execution_plan", re: /execution plan|next (seven|7) days|seven[- ]day|week(ly)? plan|what (should|to) do (next|this week)/i },
  { objectiveType: "research", re: /research |investigate |look up |what do we know|find evidence/i },
];

function nowIso() {
  return new Date().toISOString();
}

function asText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
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
  return null;
}

function parseTimelineDays(text) {
  const t = String(text || "").toLowerCase();
  const m7 = t.match(/\b(seven|7)\s*days?\b/);
  if (m7) return 7;
  const m = t.match(/\b(\d+)\s*days?\b/);
  if (m) return Number(m[1]);
  if (/next week|one week|1 week/.test(t)) return 7;
  if (/two weeks|2 weeks/.test(t)) return 14;
  return null;
}

export function classifyObjectiveType(ownerText) {
  const text = asText(ownerText);
  for (const row of TYPE_PATTERNS) {
    if (row.re.test(text)) return row.objectiveType;
  }
  return "research";
}

function extractKnownUnknown(text, type, workspace) {
  const known = [];
  const unknown = [];
  const t = asText(text);
  const budget = parseBudgetUsd(t);
  if (budget != null) known.push({ key: "budget_usd", value: budget, claimClass: "OWNER_REPORTED" });
  else unknown.push({ key: "budget_usd", reason: "No dollar ceiling stated in the objective." });
  const days = parseTimelineDays(t);
  if (days != null) known.push({ key: "timeline_days", value: days, claimClass: "OWNER_REPORTED" });
  else unknown.push({ key: "timeline_days", reason: "No explicit timeline." });
  if (workspace) {
    known.push({ key: "workspace", value: workspace.id, claimClass: "OBSERVED" });
    known.push({ key: "company_name", value: workspace.name, claimClass: "OBSERVED" });
    const intake = workspace.intake && workspace.intake.fields;
    if (intake) {
      for (const [k, f] of Object.entries(intake)) {
        const v = f && (f.value != null ? f.value : f);
        if (v != null && String(v).trim() && String(v) !== "unknown") {
          known.push({ key: "intake." + k, value: Array.isArray(v) ? v.join(", ") : String(v).slice(0, 160), claimClass: "OWNER_REPORTED" });
        }
      }
    }
  } else if (type === "grow_existing" || type === "train" || type === "deliverable" || type === "execution_plan") {
    unknown.push({ key: "workspaceId", reason: "No company selected. Propose an existing workspace or create one." });
  }
  if (type === "new_business") {
    unknown.push({ key: "validated_demand", reason: "Demand is unknown until researched or owner-stated." });
    unknown.push({ key: "competition", reason: "Competitive intensity unknown without approved research." });
  }
  if (type === "train" && !/notes|paste|document|these/.test(t.toLowerCase())) {
    unknown.push({ key: "training_materials", reason: "Training notes or paste not attached yet." });
  }
  return { known, unknown };
}

function specialistsForType(type, text, workspace) {
  const signals = workspace
    ? collectWorkspaceSignals(workspace)
    : { text: text, ownerObjective: text, hasBudget: /\$\s*[\d,]/.test(text) };
  if (!workspace) signals.text = [text, type].join(" ");
  const selected = selectRoleIds(signals);
  // ensure type-specific roles
  const reasons = { ...(selected.reasons || {}) };
  const ids = new Set(selected.roleIds || []);
  const add = (id, reason) => {
    ids.add(id);
    if (!reasons[id]) reasons[id] = reason;
  };
  if (type === "new_business" || type === "research") add("business_research", "Objective asks to find or research opportunities.");
  if (type === "new_business") add("finance", "Budget or startup affordability is part of the ask.");
  if (type === "grow_existing") add("ops", "Existing-company growth needs operations lens.");
  if (type === "train") add("marketing", "Training marketing or role-specific lessons.");
  if (type === "deliverable") {
    add("marketing", "Deliverable likely needs marketing copy.");
    add("product", "Deliverable assembly needs product outline.");
  }
  if (type === "execution_plan") {
    add("executive", "Seven-day / priority plan uses executive planning seat.");
    add("ops", "Execution plan needs operations checklist.");
  }
  add("workflow_manager", "Every plan needs a supervised coordinator.");
  add("independent_audit", "Watcher reviews for outreach, invented demand, isolation leaks.");
  const roleIds = ROLE_CATALOG.map((r) => r.roleId).filter((id) => ids.has(id));
  return roleIds.map((roleId) => {
    const spec = ROLE_CATALOG.find((r) => r.roleId === roleId);
    const implemented = roleIsImplemented(roleId);
    return {
      roleId,
      roleName: (spec && spec.name) || roleId,
      reason: reasons[roleId] || "Selected from objective signals.",
      implementationStatus: implemented ? "implemented_basic" : (spec && spec.implementationStatus) || "not_implemented",
      handlerExists: Boolean(spec && spec.handlerExists),
      liveCapable: roleId === "offer_strategist" || roleId === "marketing" || roleId === "product" || roleId === "finance" || roleId === "sales" || roleId === "executive" || roleId === "business_research",
      modeLabel: implemented ? "deterministic_handler_available" : "unimplemented_or_planning_only",
    };
  });
}

function taskPlanFor(type, text, specialists) {
  const tasks = [];
  const push = (key, label, roleId, needsApproval) => {
    tasks.push({
      key,
      label,
      roleId: roleId || null,
      status: "proposed",
      needsOwnerApproval: needsApproval === true,
      executionLadderMax: type === "deliverable" ? 2 : 1,
    });
  };
  push("interpret", "Confirm what MIDAS understood from the owner text", "workflow_manager", false);
  if (type === "new_business") {
    push("generate_opportunities", "Generate labeled opportunity hypotheses within stated constraints", "business_research", false);
    push("compare", "Compare opportunities with transparent claim classes", "offer_strategist", false);
    push("finance_lens", "Restate startup affordability from owner-stated budget only", "finance", false);
    push("select", "Owner selects or rejects an opportunity", null, true);
  } else if (type === "grow_existing") {
    push("intake_gap", "List known owner facts vs missing fields for this company", "business_research", false);
    push("growth_hypotheses", "Emit growth hypotheses from owner facts only", "offer_strategist", false);
    push("ops_review", "Flag operational constraints already stated", "ops", false);
  } else if (type === "train") {
    push("ingest", "Ingest owner notes into Training Studio (owner paste)", "workflow_manager", false);
    push("classify", "Classify lessons (policy / fact / correction / example)", "marketing", false);
    push("verify_retrieval", "Verify role-specific retrieval after ingest", "independent_audit", false);
  } else if (type === "deliverable") {
    push("assemble_draft", "Assemble local draft artifact from persisted specialist results", "product", false);
    push("watcher_pass", "Watcher checks draft for invented customers/revenue/deploy claims", "independent_audit", false);
    push("owner_review", "Owner reviews draft artifact (not deployed)", null, true);
  } else if (type === "execution_plan") {
    push("priority_memo", "Internal priority / tradeoff memo", "executive", false);
    push("seven_day", "Draft seven-day internal checklist", "ops", false);
    push("budget_gate", "Confirm spend stays within remaining autonomy/budget bounds", "finance", false);
  } else {
    push("research_brief", "Research brief from approved workspace knowledge only", "business_research", false);
    push("gaps", "List unknowns requiring owner materials or approved research", "independent_audit", false);
  }
  // attach available specialists note
  const available = specialists.filter((s) => s.handlerExists).map((s) => s.roleId);
  return { tasks, availableRoleIds: available };
}

function estimateInternalCost(type, specialists) {
  // Honest estimate band — not a guarantee. Deterministic planning itself is $0.
  const liveSeats = specialists.filter((s) => s.liveCapable && s.handlerExists).length;
  const planningUsd = 0;
  let typicalLiveUsd = 0;
  if (type === "new_business") typicalLiveUsd = 0.02;
  else if (type === "deliverable") typicalLiveUsd = 0.01;
  else if (type === "execution_plan") typicalLiveUsd = 0.008;
  else if (type === "train") typicalLiveUsd = 0;
  else typicalLiveUsd = 0.01;
  return {
    planningUsd,
    estimatedLiveSpecialistUsd: Number((typicalLiveUsd * Math.min(1, liveSeats / 3)).toFixed(4)),
    claimClass: "MODEL_ESTIMATE",
    note: "Planning is $0 deterministic. Live specialist spend only if owner later authorizes a live call. Not a guarantee.",
    notAGuarantee: true,
  };
}

function approvalRequirements(type, text, workspaceId, store) {
  const required = [];
  const covered = [];
  const policy = store && workspaceId ? activeInternalAutonomyPolicy(store, workspaceId) : null;
  const check = (action, why) => {
    if (!store || !workspaceId) {
      required.push({ action, reason: why + " (no workspace policy to evaluate yet)" });
      return;
    }
    const d = evaluateInternalAutonomy(store, workspaceId, action, {});
    if (d.blocked) required.push({ action, reason: d.reason, decision: d.decision });
    else if (d.skipPrompt) covered.push({ action, reason: d.reason, policyId: d.policyId });
    else required.push({ action, reason: d.reason || why, decision: d.decision });
  };
  check("run_internal_specialist_task", "Internal specialist work beyond planning");
  if (type === "deliverable") check("write_local_artifact", "Local draft artifact write");
  if (/outreach|email|publish|deploy|purchase|buy ads/i.test(text)) {
    required.push({ action: "restricted_external", reason: "Objective mentions restricted external action. Never auto-authorized." });
  }
  if (type === "new_business" || type === "grow_existing") {
    required.push({ action: "select_opportunity", reason: "Owner must select/save an opportunity before company creation from it." });
  }
  return {
    required,
    alreadyCoveredByAutonomy: covered,
    policyId: policy && policy.id || null,
    note: "Autonomy can cover only explicitly authorized internal actions. External execute is unavailable.",
  };
}

function expectedDeliverables(type) {
  const map = {
    new_business: ["opportunity_set", "comparison_table", "selection_prompt"],
    grow_existing: ["growth_opportunity_set", "gap_list"],
    train: ["training_episode", "classified_knowledge_items", "retrieval_check"],
    deliverable: ["local_draft_artifact", "watcher_audit"],
    execution_plan: ["seven_day_checklist", "priority_memo"],
    research: ["research_brief", "unknowns_list"],
  };
  return (map[type] || map.research).map((id) => ({ id, status: "expected", draft: true, deployed: false }));
}

export function planFromNaturalLanguage(ownerText, extras) {
  const text = asText(ownerText);
  if (!text) {
    const err = new Error("Owner objective text is required.");
    err.code = "OBJECTIVE_REQUIRED";
    throw err;
  }
  const store = extras && extras.store;
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const workspace = store && workspaceId && store.getWorkspace ? store.getWorkspace(workspaceId) : null;
  const proposeNew = !workspace && /start (a |an )?(new )?(business|company)|new business/i.test(text);
  const type = (extras && extras.objectiveType) || classifyObjectiveType(text);
  const constraints = {
    budgetUsd: parseBudgetUsd(text, extras && extras.budgetUsd),
    timelineDays: parseTimelineDays(text),
    skills: asText(extras && extras.skills) || null,
    geography: asText(extras && extras.geography) || null,
  };
  const { known, unknown } = extractKnownUnknown(text, type, workspace);
  const specialists = specialistsForType(type, text, workspace);
  const { tasks, availableRoleIds } = taskPlanFor(type, text, specialists);
  const cost = estimateInternalCost(type, specialists);
  const approvals = approvalRequirements(type, text, workspaceId, store);
  const deliverables = expectedDeliverables(type);
  return {
    planner: COMMAND_PLANNER,
    honesty: COMMAND_HONESTY,
    understood: {
      ownerText: text,
      objectiveType: type,
      workspaceId: workspace ? workspace.id : null,
      workspaceName: workspace ? workspace.name : null,
      proposeNewWorkspace: proposeNew,
      constraints,
    },
    known,
    unknown,
    remainingUncertainty: unknown.map((u) => u.reason || u.key),
    neededSpecialists: specialists,
    proposedTaskPlan: tasks,
    availableRoleIds,
    estimatedInternalCost: cost,
    approvalRequirements: approvals,
    expectedDeliverables: deliverables,
    permissions: {
      liveModelDefault: false,
      externalExecute: false,
      maxExecutionLadder: type === "deliverable" ? 2 : 1,
      employeesCannotRaiseOwnBudget: true,
    },
    ownerVisible: {
      whatMidasUnderstands: "Objective type " + type + (workspace ? (" for " + workspace.name) : (proposeNew ? " (proposes new workspace)" : " (no company selected yet)")),
      whatItPlans: tasks.map((t) => t.label),
      whichEmployees: specialists.map((s) => s.roleId + " — " + s.reason),
      permissions: "Draft/local only unless owner later authorizes. External execute unavailable.",
      remainingUncertainty: unknown.map((u) => u.key + ": " + u.reason),
    },
  };
}

export function persistCommandPlan(store, ownerText, extras) {
  const planned = planFromNaturalLanguage(ownerText, { ...(extras || {}), store });
  const existing = (store.listCommandPlans && store.listCommandPlans()) || [];
  const id = nextId(existing.map((r) => r.id), "CPL-");
  const workspaceId = planned.understood.workspaceId || (extras && (extras.workspaceId || extras.workspace)) || null;
  if (workspaceId) store.requireWorkspaceId(workspaceId);
  const rec = {
    id,
    workspaceId,
    createdAt: new Date().toISOString(),
    status: "planned",
    ownerText: asText(ownerText),
    objectiveType: planned.understood.objectiveType,
    plan: planned,
    contentHash: createHash("sha256").update(JSON.stringify(planned), "utf8").digest("hex"),
    liveProviderCall: false,
    persistence: "FILE_STORE",
    appendOnly: false,
  };
  store.putCommandPlan(rec);
  if (store.putActivityFeedItem) {
    store.putActivityFeedItem({
      id: "ACT-CPL-" + id,
      workspaceId,
      createdAt: rec.createdAt,
      kind: "command_plan",
      summary: "Command plan " + id + " · " + planned.understood.objectiveType,
      refId: id,
    });
  }
  return {
    ok: true,
    persistence: "FILE_STORE",
    honesty: COMMAND_HONESTY,
    plan: store.getCommandPlan(id),
    ownerVisible: planned.ownerVisible,
  };
}

export function listCommandPlans(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const all = (store.listCommandPlans && store.listCommandPlans(workspaceId)) || [];
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: COMMAND_HONESTY,
    plans: all.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      status: p.status,
      objectiveType: p.objectiveType,
      ownerText: p.ownerText,
      createdAt: p.createdAt,
      estimatedInternalCost: p.plan && p.plan.estimatedInternalCost,
    })),
    note: "Persisted bounded command plans. Deterministic planner. Not live by default.",
  };
}

export function inspectCommandPlan(store, id) {
  const rec = store.getCommandPlan && store.getCommandPlan(id);
  if (!rec) {
    const err = new Error("command plan not found: " + id);
    err.code = "NOT_FOUND";
    throw err;
  }
  return { built: true, persistence: "FILE_STORE", honesty: COMMAND_HONESTY, plan: rec };
}

export function commandCenterView(store, extras) {
  const plans = listCommandPlans(store, extras);
  return {
    built: true,
    title: "Founder Command Center",
    prompt: "What do you want MIDAS to accomplish?",
    examples: [
      "Find three business opportunities I can start with $1,500.",
      "Analyze this existing company and list growth hypotheses.",
      "Train marketing using these notes.",
      "Create a landing page for our current offer.",
      "Build an execution plan for the next seven days.",
    ],
    honesty: COMMAND_HONESTY,
    recentPlans: plans.plans.slice(-8).reverse(),
    note: "Deterministic planner first. Live model optional later. Default $0 for planning.",
  };
}
