import { randomUUID } from "node:crypto";
import { retrieveForCase } from "./retrieve-v2.ts";
import { enforceCase } from "./policy-enforce.ts";
import { addOwnerAuthoredRule, trainAtlas, studioOverview } from "./knowledge-studio.ts";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import { SCOUT_ROLE_ID, SCOUT_ROLE_NAME, RESEARCH_LABEL, scoutSlice, scoutAgentId } from "./scout.ts";
import { WATCHER_ROLE_ID, WATCHER_ROLE_NAME, WATCHER_JUDGE_NOTE, watcherSlice, watcherAgentId } from "./watcher.ts";
import { HANDOFF_FICTIONAL_PROSPECTS, HANDOFF_OWNER_PASTE, HANDOFF_SCOUT_QUESTION, HANDOFF_SOURCE_LABEL, handoffQualificationPolicy } from "./handoff-scenario.ts";
export { HANDOFF_FICTIONAL_PROSPECTS, HANDOFF_OWNER_PASTE, HANDOFF_SCOUT_QUESTION, HANDOFF_SOURCE_LABEL, handoffQualificationPolicy };

export const RESERVED_ROLE_IDS = [
  "atlas",
  "opportunity_research",
  "marketing",
  "sales",
  "ops",
  "finance",
  "executive",
  "watcher",
];
export const IMPLEMENTED_ROLE_IDS = ["atlas", "business_research", "independent_audit", "workflow_manager"];
export const EPISTEMIC_CLASSES = [
  "business_description",
  "owner_policy",
  "sourced_fact",
  "agent_instruction",
  "unverified_suggestion",
  "private_note",
];
export const TRAINING_REVIEW_STATUSES = [
  "created",
  "tested",
  "improved_on_dev_scenario",
  "officially_approved",
  "promoted",
];
export const WORKBENCH_BANNER =
  "Fictional / test data. Not real prospects. No outreach. Not a sealed eval. Owner-review labels are stored separately and are never runtime input.";

export const RIDGELINE_PRODUCT = {
  id: "ws-ridgeline",
  name: "RidgeLine Estimator",
  description:
    "Roofing-focused takeoff and estimating software sold to US residential and commercial roofing contractors. This is a business description of the product, not an owner policy.",
  industry: "construction_software",
  type: "b2b_saas",
  offer: {
    name: "RidgeLine Estimator",
    summary: "Roofing takeoff, material lists, and proposal software for US contractors.",
  },
  idealCustomer: "US roofing contractors with roughly 5 to 80 employees who still estimate by hand or outdated tools.",
  geography: "US",
  goal: "Qualify US roofing contractors who can buy RidgeLine Estimator. Do not contact protected accounts. Research when budget is missing.",
  constraints: [
    "US-only eligibility",
    "No outreach from this workbench",
    "Fictional prospects only",
    "Exact protected account lockout",
  ],
  ownerStatus: "active",
};

const PROTECTED_ACCOUNT_NAME = "Apex Roofing Partners";
const BUDGET_THRESHOLD_USD = 2500;

export const RIDGELINE_OWNER_RULES = [
  {
    key: "us_only",
    statement: "Only United States accounts are eligible. Non-US geography is a hard disqualifier.",
    category: "territory",
    competency: "territory",
    applicability: {
      scope: "RidgeLine US-only motion",
      subjectType: "account",
      requiredConditions: [{
        id: "c-us",
        field: "country",
        op: "neq",
        value: "US",
        description: "Account country is not the United States",
        evidenceRequired: true,
      }],
      effect: "exclude",
      unknownBehavior: "research_first",
      exceptions: [],
      priority: 95,
    },
  },
  {
    key: "missing_budget",
    statement: "When verified monthly budget is missing or unknown, research is required. Do not invent a budget number.",
    category: "qualification_thresholds",
    competency: "qualification_thresholds",
    applicability: {
      scope: "RidgeLine budget screen",
      subjectType: "account",
      requiredConditions: [{
        id: "c-budget-unknown",
        field: "monthly_budget_usd",
        op: "lt",
        value: 0,
        description: "Verified monthly budget is unknown or missing",
        evidenceRequired: true,
      }],
      effect: "research_first",
      unknownBehavior: "research_first",
      exceptions: [],
      priority: 80,
    },
  },
  {
    key: "protected_exact",
    statement: "The exact protected account Apex Roofing Partners cannot be contacted. Similar names are not protected.",
    category: "protected_accounts",
    competency: "protected_accounts",
    applicability: {
      scope: "RidgeLine exact protected account",
      subjectType: "account",
      requiredConditions: [{
        id: "c-prot",
        field: "company",
        op: "eq",
        value: PROTECTED_ACCOUNT_NAME,
        description: "Exact protected account name match",
        evidenceRequired: true,
      }],
      effect: "exclude",
      unknownBehavior: "ignore",
      exceptions: [],
      priority: 99,
    },
  },
  {
    key: "budget_threshold",
    statement: "A verified monthly budget at or above 2500 USD satisfies the budget requirement. Do not infer budget from employee count.",
    category: "qualification_thresholds",
    competency: "qualification_thresholds",
    applicability: {
      scope: "RidgeLine budget threshold",
      subjectType: "account",
      requiredConditions: [{
        id: "c-budget-low",
        field: "monthly_budget_usd",
        op: "lt",
        value: BUDGET_THRESHOLD_USD,
        description: "Verified monthly budget below 2500 USD",
        evidenceRequired: true,
      }],
      effect: "exclude",
      unknownBehavior: "research_first",
      exceptions: [],
      priority: 85,
    },
  },
  {
    key: "outdated_website",
    statement: "An outdated contractor website may be a positive buying signal when the owner has approved that interpretation. It is not a disqualifier.",
    category: "owner_policy",
    competency: "qualification_thresholds",
    applicability: {
      scope: "RidgeLine owner-approved website signal",
      subjectType: "account",
      requiredConditions: [{
        id: "c-web",
        field: "website_outdated",
        op: "is_true",
        value: true,
        description: "Owner-approved outdated website signal",
        evidenceRequired: false,
      }],
      effect: "prefer",
      unknownBehavior: "ignore",
      exceptions: [],
      priority: 20,
    },
  },
];

export const RIDGELINE_FICTIONAL_PROSPECTS = [
  {
    id: "P-QUAL",
    company: "Harbor Peak Roofing",
    facts: {
      company: "Harbor Peak Roofing",
      country: "US",
      monthly_budget_usd: 4200,
      account_status: "new_logo",
      protected_account_name: null,
      website_outdated: true,
      employee_count: 18,
    },
    evidence: [
      { id: "E-QUAL-1", claim: "Harbor Peak Roofing is a US contractor with verified monthly budget of 4200 USD.", source: "first_party", age_days: 4 },
      { id: "E-QUAL-2", claim: "The company website is outdated; owner approved this as a positive buying signal.", source: "first_party", age_days: 10 },
    ],
  },
  {
    id: "P-BUDGET",
    company: "Midwest Slate Crew",
    facts: {
      company: "Midwest Slate Crew",
      country: "US",
      monthly_budget_usd: null,
      account_status: "new_logo",
      protected_account_name: null,
      website_outdated: false,
      employee_count: 12,
    },
    evidence: [
      { id: "E-BUD-1", claim: "Midwest Slate Crew is a US contractor. Monthly budget is not on the record.", source: "first_party", age_days: 3 },
    ],
  },
  {
    id: "P-INTL",
    company: "Toronto Ridge Works",
    facts: {
      company: "Toronto Ridge Works",
      country: "CA",
      monthly_budget_usd: 5000,
      account_status: "new_logo",
      protected_account_name: null,
      website_outdated: false,
      employee_count: 22,
    },
    evidence: [
      { id: "E-INTL-1", claim: "Toronto Ridge Works is headquartered in Canada.", source: "first_party", age_days: 5 },
    ],
  },
  {
    id: "P-PROT",
    company: PROTECTED_ACCOUNT_NAME,
    facts: {
      company: PROTECTED_ACCOUNT_NAME,
      country: "US",
      monthly_budget_usd: 8000,
      account_status: "protected",
      protected_account_name: PROTECTED_ACCOUNT_NAME,
      website_outdated: false,
      employee_count: 40,
    },
    evidence: [
      { id: "E-PROT-1", claim: "Official registry lists Apex Roofing Partners as an exact protected account.", source: "official", age_days: 2 },
    ],
  },
  {
    id: "P-SIM",
    company: "Apex Roofing Partners LLC",
    facts: {
      company: "Apex Roofing Partners LLC",
      country: "US",
      monthly_budget_usd: 3600,
      account_status: "new_logo",
      protected_account_name: "Apex Roofing Partners LLC",
      website_outdated: true,
      employee_count: 15,
    },
    evidence: [
      { id: "E-SIM-1", claim: "Apex Roofing Partners LLC is a similar name, not the exact protected account Apex Roofing Partners.", source: "first_party", age_days: 6 },
    ],
  },
];

export const RIDGELINE_OWNER_LABELS = [
  { prospectId: "P-QUAL", expectedClassification: "qualified", note: "US, verified budget above threshold, not protected." },
  { prospectId: "P-BUDGET", expectedClassification: "needs_research", note: "Missing budget requires research." },
  { prospectId: "P-INTL", expectedClassification: "disqualified", note: "Non-US." },
  { prospectId: "P-PROT", expectedClassification: "disqualified", note: "Exact protected account." },
  { prospectId: "P-SIM", expectedClassification: "qualified", note: "Similar name is not the protected account." },
];

function nowIso() {
  return new Date().toISOString();
}

function slugId(prefix, raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return prefix + (s || randomUUID().slice(0, 8));
}

export function extendAtlasAgent(store, extra) {
  const existing = store.getAgent("atlas") || {
    id: "atlas",
    name: "Atlas",
    createdAt: nowIso(),
  };
  const versions = (store.listVersions && store.listVersions("atlas")) || [];
  const agent = {
    ...existing,
    roleId: "atlas",
    roleName: "Atlas",
    objective: (extra && extra.objective) || existing.objective || "Qualify owner-supplied prospects. Rank only viable. No outreach.",
    boundaries: (extra && extra.boundaries) || existing.boundaries || [
      "No production outreach",
      "No real prospect ingestion",
      "No sealed holdout access",
    ],
    versionHistory: versions.map((v) => v.id),
    approvedKnowledgeAccess: existing.approvedKnowledgeAccess || "owner_approved_only",
    toolPermissions: existing.toolPermissions || ["classify", "retrieve", "enforce"],
    status: (extra && extra.status) || existing.status || "active",
    reservedRoles: RESERVED_ROLE_IDS,
    implementedRoles: IMPLEMENTED_ROLE_IDS,
    note: "Atlas and Scout (business_research) are implemented specialists. Reserved role ids are not employees and not simulated conversations.",
  };
  store.putAgent(agent);
  return agent;
}

export function createWorkspace(store, payload) {
  const now = nowIso();
  const id = String((payload && payload.id) || slugId("ws-", payload && payload.name));
  if (store.getWorkspace(id)) throw new Error("Workspace already exists: " + id);
  const description = String((payload && payload.description) || "").trim();
  const workspace = {
    id: id,
    name: String((payload && payload.name) || "Untitled workspace"),
    description: description,
    industry: (payload && payload.industry) || "",
    type: (payload && (payload.type || payload.industryType)) || "",
    offer: (payload && payload.offer) || {},
    idealCustomer: (payload && payload.idealCustomer) || "",
    geography: (payload && payload.geography) || "",
    goal: (payload && payload.goal) || "",
    constraints: Array.isArray(payload && payload.constraints) ? payload.constraints : [],
    createdAt: now,
    updatedAt: now,
    ownerStatus: (payload && payload.ownerStatus) || "draft",
    assignedAgentId: "atlas",
    assignedRoleId: "atlas",
    epistemicClass: "business_description",
    persistence: "FILE_STORE",
  };
  store.putWorkspace(workspace);
  extendAtlasAgent(store, { objective: workspace.goal });
  const descriptionBecamePolicy = false;
  return {
    workspace: workspace,
    assignedAgent: store.getAgent("atlas"),
    descriptionBecamePolicy: descriptionBecamePolicy,
    epistemicClass: "business_description",
    note: "Workspace description is a business description. It does not auto-become owner policy.",
    reservedRoleIds: RESERVED_ROLE_IDS,
    implementedRoleIds: IMPLEMENTED_ROLE_IDS,
  };
}

export function inspectWorkspace(store, id) {
  const workspace = store.getWorkspace(id);
  if (!workspace) throw new Error("workspace not found: " + id);
  const items = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === id);
  const notes = store.listWorkspaceNotes ? store.listWorkspaceNotes(id) : [];
  return {
    workspace: workspace,
    assignedAgent: store.getAgent(workspace.assignedAgentId || "atlas"),
    knowledge: items.map((k) => ({
      id: k.id,
      kind: k.kind || k.claimKind,
      epistemicClass: k.epistemicClass || k.kind,
      reviewStatus: k.reviewStatus,
      workspaceId: k.workspaceId || k.workspace,
      applicableRole: k.applicableRole || k.agentRole,
      statement: k.statement,
    })),
    privateNotes: notes.length,
    approvedRules: items.filter((k) => (k.kind === "owner_policy" || k.claimKind === "owner_policy") && k.reviewStatus === "approved").length,
    approvedSourced: items.filter((k) => (k.kind === "sourced_fact") && k.reviewStatus === "approved").length,
    persistence: "FILE_STORE",
    isolation: "application-level workspaceId allowlist; not an enterprise IAM claim",
  };
}

export function setupWorkspace(store, id, payload) {
  const existing = store.getWorkspace(id);
  if (!existing) throw new Error("workspace not found: " + id);
  const now = nowIso();
  const next = {
    ...existing,
    name: (payload && payload.name) || existing.name,
    description: payload && payload.description != null ? String(payload.description) : existing.description,
    industry: (payload && payload.industry) || existing.industry,
    type: (payload && (payload.type || payload.industryType)) || existing.type,
    offer: (payload && payload.offer) || existing.offer,
    idealCustomer: (payload && payload.idealCustomer) || existing.idealCustomer,
    geography: (payload && payload.geography) || existing.geography,
    goal: (payload && payload.goal) || existing.goal,
    constraints: Array.isArray(payload && payload.constraints) ? payload.constraints : existing.constraints,
    ownerStatus: (payload && payload.ownerStatus) || existing.ownerStatus || "active",
    updatedAt: now,
    epistemicClass: "business_description",
  };
  store.putWorkspace(next);
  extendAtlasAgent(store, { objective: next.goal, boundaries: next.constraints });

  const createdRules = [];
  for (const rule of (payload && payload.ownerRules) || []) {
    const out = addOwnerAuthoredRule(store, {
      statement: rule.statement,
      category: rule.category || rule.competency,
      competency: rule.competency || rule.category,
      applicability: rule.applicability,
      workspaceId: id,
      workspace: id,
      applicableRole: "atlas",
      tags: ["owner-authored", "workspace:" + id],
    });
    const item = store.getKnowledge(out.item.id);
    if (item) {
      store.putKnowledge({
        ...item,
        workspaceId: id,
        workspace: id,
        applicableRole: "atlas",
        competency: rule.competency || rule.category,
        applicability: rule.applicability || item.applicability,
        epistemicClass: "owner_policy",
      });
    }
    createdRules.push(out.item.id);
  }

  const notes = [];
  for (const note of (payload && payload.privateNotes) || []) {
    const rec = {
      id: "NOTE-" + id + "-" + randomUUID().slice(0, 8),
      workspaceId: id,
      text: String(note.text || note),
      epistemicClass: "private_note",
      createdAt: now,
      runtimeEligible: false,
      "private": true,
    };
    if (store.putWorkspaceNote) store.putWorkspaceNote(rec);
    notes.push(rec);
  }

  return {
    workspace: next,
    createdRules: createdRules,
    privateNotes: notes.map((n) => n.id),
    descriptionBecamePolicy: false,
    note: "Setup stored business description on the workspace. Owner rules were created only from explicit ownerRules. Private notes are not retrieved.",
  };
}

export function storeOwnerReviewLabels(store, workspaceId, labels, extra) {
  const saved = [];
  for (const row of labels || []) {
    const rec = {
      id: "ORL-" + workspaceId + "-" + row.prospectId + "-" + randomUUID().slice(0, 6),
      workspaceId: workspaceId,
      prospectId: row.prospectId,
      expectedClassification: row.expectedClassification,
      note: row.note || "",
      createdAt: nowIso(),
      workbenchRunId: extra && extra.workbenchRunId || null,
      neverRuntimeInput: true,
    };
    store.putOwnerReviewLabel(rec);
    saved.push(rec);
  }
  return saved;
}

function workbenchQualificationPolicy(workspace) {
  return {
    required: [
      "Apply Atlas Owner Policy: Territory",
      "Apply Atlas Owner Policy: Qualification Thresholds",
      "Apply Atlas Owner Policy: Protected Accounts",
    ],
    preferred: [
      "Outdated contractor website may be a positive signal when owner-approved",
    ],
    disqualifiers: [],
    unknown_policy: "mandatory_unknown_requires_research",
  };
}

function stripOwnerLabels(prospects) {
  return (prospects || []).map((p) => {
    const facts = { ...(p.facts || {}) };
    if (p.company && (facts.company === undefined || facts.company === null)) facts.company = p.company;
    const copy = { ...p, facts: facts, evidence: Array.isArray(p.evidence) ? p.evidence.slice() : [] };
    delete copy.expectedClassification;
    delete copy.gold;
    delete copy.ownerLabel;
    delete copy.ranked_tiers;
    delete copy.required_unknowns;
    return copy;
  });
}

function fixtureWorkbenchOutput(runtimeInput) {
  const assessments = (runtimeInput.prospects || []).map((p) => ({
    prospect_id: p.id,
    classification: "qualified",
    fit_score: 70,
    cited_evidence_ids: (p.evidence || []).map((e) => e.id).slice(0, 2),
    rationale: "Fixture proposal qualifies until owner policy is enforced.",
    missing_information: [],
    next_action: "prioritize_outreach",
    disqualification_reason: null,
  }));
  return {
    case_id: runtimeInput.case_id,
    assessments: assessments,
    ranked_qualified_ids: assessments.map((a) => a.prospect_id),
    research_queue_ids: [],
    excluded_ids: [],
    case_uncertainties: ["fixture-naive-qualify-then-enforce"],
  };
}

function whyFor(evalRow, assessment) {
  const effects = (evalRow && evalRow.authoritative_effects) || [];
  if (evalRow && evalRow.confirmed_hard_dq) {
    return {
      decision: "exclude",
      why: "Confirmed hard disqualifier. " + effects.map((e) => e.knowledge_item_id + ":" + e.reason).join("; "),
    };
  }
  if (evalRow && evalRow.mandatory_unknown) {
    return {
      decision: "research",
      why: "Mandatory information is unknown. " + effects.map((e) => e.knowledge_item_id + ":" + e.reason).join("; "),
    };
  }
  return {
    decision: assessment.classification === "qualified" ? "qualify" : assessment.classification,
    why: assessment.rationale || "Served classification after owner-policy enforcement.",
  };
}

export async function runWorkbench(store, payload, deps) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const workspace = store.getWorkspace(workspaceId);
  if (!workspace) throw new Error("workspace not found: " + workspaceId);
  const labels = Array.isArray(payload.ownerReviewLabels) ? payload.ownerReviewLabels : [];
  if (labels.length) storeOwnerReviewLabels(store, workspaceId, labels);

  const prospects = stripOwnerLabels(payload.prospects || []);
  const caseId = "WB-" + workspaceId + "-" + randomUUID().slice(0, 8);
  const runtimeInput = {
    case_id: caseId,
    title: (payload.title || workspace.name) + " fictional workbench",
    offer: payload.offer || workspace.offer,
    business_context: payload.businessContext || workspace.description,
    qualification_policy: payload.qualification_policy || workbenchQualificationPolicy(workspace),
    constraints: payload.constraints || workspace.constraints,
    prospects: prospects,
    fictional: true,
  };

  const versionId = payload.versionId || (store.listVersions && latestWorkspaceVersionId(store, workspaceId));
  const version = versionId ? store.getVersion(versionId) : null;
  const sourceAllowlist = (version && version.retrievalPolicy && version.retrievalPolicy.sourceAllowlist) || undefined;
  const retrieval = retrieveForCase(store, runtimeInput, {
    workspaceId: workspaceId,
    workspaceAllowlist: [workspaceId],
    sourceAllowlist: sourceAllowlist,
    applicableRole: "atlas",
    maxItems: 12,
    contextBudgetTokens: 4000,
  });

  const leakedLabel = JSON.stringify(runtimeInput).includes("expectedClassification")
    || JSON.stringify(runtimeInput).includes("ranked_tiers");
  if (leakedLabel) throw new Error("Owner-review labels leaked into runtime input.");

  let raw;
  let kind = "fixture";
  const responder = deps && deps.responder;
  const wantLive = Boolean(deps && deps.live) && typeof responder === "function" && payload.fixture !== true;
  if (wantLive) {
    raw = await responder(runtimeInput, { knowledgeBundle: retrieval.items || [] });
    kind = "live";
  } else {
    raw = fixtureWorkbenchOutput(runtimeInput);
    kind = "fixture";
  }

  const enforced = enforceCase({
    runtimeInput: runtimeInput,
    modelOutput: raw,
    knowledgeItems: retrieval.items || [],
    arm: "relevant",
  });

  const served = enforced.served_decision || enforced.servedOutput && enforced.servedOutput.assessments || [];
  const helpfulSelected = (retrieval.selected || []).filter((s) => s.bucket === "helpful_context");
  const helpfulManual = helpfulSelected.filter((s) => (s.signalHits || []).includes("manual_estimating") || (s.signals || []).includes("manual_estimating"));
  const rankedBefore = served.filter((a) => a.classification === "qualified").map((a) => a.prospect_id);
  function prospectSignal(pid) {
    const pr = prospects.find((x) => x.id === pid);
    const f = (pr && pr.facts) || {};
    if (f.estimates_by_hand === true) return "manual_estimating";
    if (/hand|spreadsheet|manual/.test(String(f.estimating_method || ""))) return "manual_estimating";
    if (f.uses_estimating_software === true) return "software_estimating";
    return null;
  }
  let ranked = rankedBefore.slice();
  let rankingAffected = false;
  let citedHelpful = [];
  if (helpfulManual.length && ranked.length >= 2) {
    const scored = ranked.map((id) => ({ id: id, boost: prospectSignal(id) === "manual_estimating" ? 1 : 0 }));
    scored.sort((a, b) => b.boost - a.boost || String(a.id).localeCompare(String(b.id)));
    const next = scored.map((s) => s.id);
    rankingAffected = next.join(",") !== rankedBefore.join(",");
    ranked = next;
    citedHelpful = helpfulManual.map((s) => s.id);
    for (const a of served) {
      if (a.classification !== "qualified") continue;
      if (prospectSignal(a.prospect_id) === "manual_estimating" && citedHelpful.length) {
        a.cited_knowledge_ids = Array.from(new Set([...(a.cited_knowledge_ids || []), ...citedHelpful]));
        a.rationale = (a.rationale || "") + " Approved Scout buying-signal context " + citedHelpful.join(",") + " helps explain the stronger candidate (inference, not a verified conversion fact; cannot hard-DQ by itself).";
      }
    }
  }
  const research = served.filter((a) => a.classification === "needs_research").map((a) => a.prospect_id);
  const excluded = served.filter((a) => a.classification === "disqualified").map((a) => a.prospect_id);
  const why = served.map((a) => {
    const ev = (enforced.policy_evaluation || []).find((p) => p.prospect_id === a.prospect_id);
    return { prospect_id: a.prospect_id, ...whyFor(ev, a), retrieved: retrieval.retrievedItemIds };
  });

  const run = {
    id: "WBRUN-" + randomUUID(),
    workspaceId: workspaceId,
    agentVersionId: versionId || null,
    createdAt: nowIso(),
    kind: kind,
    label: "owner-workbench",
    generalizationProof: false,
    fictional: true,
    banner: WORKBENCH_BANNER,
    outreach: false,
    sealedEval: false,
    offer: runtimeInput.offer,
    businessContext: runtimeInput.business_context,
    constraints: runtimeInput.constraints,
    prospects: prospects,
    runtimeInput: runtimeInput,
    retrievedItemIds: retrieval.retrievedItemIds,
    retrieval: {
      retrievedItemIds: retrieval.retrievedItemIds,
      selected: retrieval.selected,
      omitted: retrieval.omitted || [],
      topics: retrieval.topics || [],
      signals: retrieval.signals || [],
      budgets: retrieval.budgets || null,
      note: retrieval.note,
      workspaceId: workspaceId,
      retrievalPolicyVersion: retrieval.retrievalPolicyVersion,
    },
    citedKnowledgeIds: citedHelpful,
    ranking: {
      before: rankedBefore,
      after: ranked,
      affected: rankingAffected,
      citedHelpful: citedHelpful,
      changedClassification: false,
    },
    handoff: {
      inSnapshot: (version && version.retrievalPolicy && version.retrievalPolicy.approvedItemIds) || [],
      retrieved: retrieval.retrievedItemIds,
      cited: citedHelpful,
      affectedRankingOrExplanation: rankingAffected || citedHelpful.length > 0,
      changedClassification: false,
    },
    rawAssessments: (raw && raw.assessments) || [],
    servedAssessments: served,
    rankedQualifiedIds: ranked,
    researchQueueIds: research,
    excludedIds: excluded,
    why: why,
    enforcementIntervened: Boolean(enforced.enforcement_intervened),
    judgeAdvisory: true,
    official: false,
  };
  const usage = raw && raw._usage ? raw._usage : null;
  if (raw && raw._usage) delete raw._usage;
  run.usage = usage
    ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
    : { inputTokens: null, outputTokens: null };
  store.putWorkbenchRun(run);
  recordUsage(store, {
    timestamp: run.createdAt,
    workspaceId: workspaceId,
    agentId: "atlas",
    role: "atlas",
    version: versionId,
    operation: "workbench",
    model: kind === "live" ? ((raw && raw._model) || process.env.OPENAI_MODEL || "gpt-4.1") : null,
    providerRequestId: (raw && (raw._providerRequestId || raw.id)) || run.id,
    inputTokens: usage && usage.inputTokens,
    outputTokens: usage && usage.outputTokens,
    resultStatus: "ok",
    kind: kind,
    note: kind === "live" ? "Owner-workbench live usage." : "Owner-workbench fixture. Tokens unknown; cost unknown.",
  });
  return {
    banner: WORKBENCH_BANNER,
    run: run,
    workspace: { id: workspace.id, name: workspace.name, goal: workspace.goal },
    live: kind === "live",
    fixture: kind === "fixture",
    judgeAdvisory: true,
    official: false,
    generalizationProof: false,
    note: kind === "live"
      ? "Owner-workbench live result. One run. Not a generalization proof."
      : "Owner-workbench fixture result. Labeled fixture. Not live research.",
  };
}

function latestWorkspaceVersionId(store, workspaceId) {
  const versions = (store.listVersions && store.listVersions("atlas")) || [];
  const scoped = versions.filter((v) => v.workspaceId === workspaceId);
  const pool = scoped.length ? scoped : versions.filter((v) => /^atlas-v\d+$/.test(v.id));
  pool.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return pool.length ? pool[pool.length - 1].id : null;
}

export function ownerDashboard(store, workspaceId) {
  const workspace = workspaceId ? store.getWorkspace(workspaceId) : (store.listWorkspaces()[0] || null);
  if (!workspace) {
    return {
      persistence: "FILE_STORE",
      empty: true,
      reservedRoleIds: RESERVED_ROLE_IDS,
      implementedRoleIds: IMPLEMENTED_ROLE_IDS,
      judgeAdvisory: true,
    };
  }
  const items = (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === workspace.id);
  const approvedRules = items.filter((k) => (k.kind === "owner_policy" || k.claimKind === "owner_policy") && k.reviewStatus === "approved");
  const approvedSourced = items.filter((k) => k.kind === "sourced_fact" && k.reviewStatus === "approved");
  const events = (store.listTrainingEvents ? store.listTrainingEvents(workspace.id) : []).slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const latestEvent = events[events.length - 1] || null;
  const runs = (store.listWorkbenchRuns ? store.listWorkbenchRuns(workspace.id) : []).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const latestRun = runs[runs.length - 1] || null;
  const versionId = latestWorkspaceVersionId(store, workspace.id);
  const version = versionId ? store.getVersion(versionId) : null;
  const agent = store.getAgent(workspace.assignedAgentId || "atlas");
  return {
    persistence: "FILE_STORE",
    semanticJudge: "advisory",
    judgeAdvisory: true,
    official: false,
    isolation: "application-level workspaceId allowlist; not an enterprise IAM claim",
    currentWorkspace: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      epistemicClass: workspace.epistemicClass || "business_description",
      geography: workspace.geography,
      goal: workspace.goal,
      offer: workspace.offer,
      ownerStatus: workspace.ownerStatus,
    },
    objective: workspace.goal,
    assignedAgent: agent ? {
      id: agent.id,
      roleId: agent.roleId || "atlas",
      roleName: agent.roleName || "Atlas",
      status: agent.status,
      implemented: true,
    } : null,
    assignedScout: (function () {
      const s = store.getAgent(scoutAgentId(workspace.id));
      return s ? { id: s.id, roleId: s.roleId, roleName: s.roleName, status: s.status, implemented: true, workspaceId: s.workspaceId } : null;
    })(),
    scoutStatus: scoutSlice(store, workspace.id),
    assignedWatcher: (function () {
      const w = store.getAgent(watcherAgentId(workspace.id));
      return w ? { id: w.id, roleId: w.roleId, roleName: w.roleName, status: w.status, implemented: true, workspaceId: w.workspaceId } : null;
    })(),
    watcherStatus: watcherSlice(store, workspace.id),
    assignedConductor: (function () {
      const c = store.getAgent("conductor-" + workspace.id);
      return c ? { id: c.id, roleId: c.roleId, roleName: c.roleName, status: c.status, implemented: true, workspaceId: c.workspaceId } : null;
    })(),
    conductorStatus: (function () {
      const c = store.getAgent("conductor-" + workspace.id);
      const objs = store.listObjectives ? store.listObjectives(workspace.id) : [];
      return {
        implemented: Boolean(c),
        agent: c ? { id: c.id, roleId: c.roleId, roleName: c.roleName, status: c.status, workspaceId: c.workspaceId, versionHistory: c.versionHistory } : null,
        objectives: objs.map((o) => ({ id: o.id, status: o.status, ownerText: o.ownerText })),
        orchestration: "deterministic",
      };
    })(),
    roleResponsibilities: [
      { roleId: "atlas", roleName: "Atlas", implemented: true, responsibility: "Qualify owner-supplied prospects. Rank only viable. Cite evidence. No outreach." },
      { roleId: SCOUT_ROLE_ID, roleName: SCOUT_ROLE_NAME, implemented: true, responsibility: "Gather source-backed information for an explicit research objective. No invented facts. No self-approve. No other workspace." },
      { roleId: WATCHER_ROLE_ID, roleName: WATCHER_ROLE_NAME, implemented: true, responsibility: "Inspect completed work, verify provenance and policy compliance, report to the owner. Cannot modify agents, approvals, or policies. Deterministic/advisory checks; not an independent semantic evidence judge." },
      { roleId: "workflow_manager", roleName: "Conductor", implemented: true, responsibility: "Translate an owner-approved business objective into a bounded plan, assign existing specialists, wait for required approvals, track execution, report verified outcomes. Orchestration is deterministic. Cannot approve findings, create owner policy, promote, bypass Watcher, or raise its own budget." },
      ...RESERVED_ROLE_IDS.filter((r) => r !== "atlas" && r !== SCOUT_ROLE_ID && r !== WATCHER_ROLE_ID).map((r) => ({
        roleId: r,
        roleName: r,
        implemented: false,
        label: "unimplemented",
        responsibility: "Reserved slot. Not an employee. No simulated conversation.",
      })),
    ],
    researchRequests: (store.listResearchRequests ? store.listResearchRequests(workspace.id) : []).map((r) => ({
      id: r.id, question: r.question, status: r.status, label: r.label, live: r.live, fixture: r.fixture,
    })),
    proposedFindings: (store.listScoutFindings ? store.listScoutFindings(workspace.id) : []).filter((f) => f.reviewStatus === "proposed"),
    approvedFindings: (store.listScoutFindings ? store.listScoutFindings(workspace.id) : []).filter((f) => f.reviewStatus === "approved"),
    ownerPolicies: approvedRules.map((k) => ({ id: k.id, statement: k.statement, workspaceId: k.workspaceId || k.workspace })),
    provenance: {
      scoutLabel: RESEARCH_LABEL,
      atlasUsesApprovedOnly: true,
      isolation: "application-level workspaceId allowlist; not an enterprise IAM claim",
    },
    spend: ownerSpendView(store, workspace.id),
    liveVsFixture: latestRun ? latestRun.kind : null,
    currentAtlasVersion: version ? { id: version.id, parent: version.parentVersionId, contentHash: version.contentHash, workspaceId: version.workspaceId || null } : null,
    approvedRuleCount: approvedRules.length,
    approvedSourcedItemCount: approvedSourced.length,
    latestTrainingEvent: latestEvent,
    latestFictionalRun: latestRun && {
      id: latestRun.id,
      kind: latestRun.kind,
      label: latestRun.label,
      createdAt: latestRun.createdAt,
      servedClassifications: (latestRun.servedAssessments || []).map((a) => ({ prospect_id: a.prospect_id, classification: a.classification })),
      retrievedRules: latestRun.retrievedItemIds,
      retrieved: latestRun.retrieval,
      cited: latestRun.citedKnowledgeIds || [],
      ranking: latestRun.ranking || null,
      handoff: latestRun.handoff || null,
      why: latestRun.why,
      liveVsFixture: latestRun.kind,
      judgeAdvisory: true,
    },
    chain: (function () {
      const approvedF = (store.listScoutFindings ? store.listScoutFindings(workspace.id) : []).filter((f) => f.reviewStatus === "approved");
      const lastF = approvedF[approvedF.length - 1] || null;
      const lastAudit = (store.listWatcherAudits ? store.listWatcherAudits(workspace.id) : []).slice(-1)[0] || null;
      return {
        objective: workspace.goal,
        source: (store.listResearchRequests ? store.listResearchRequests(workspace.id) : []).slice(-1)[0] || null,
        finding: lastF,
        excerpt: lastF && lastF.excerpt || null,
        approval: (store.listScoutReviews ? store.listScoutReviews(workspace.id) : []).slice(-1)[0] || null,
        atlasVersion: version ? { id: version.id, parent: version.parentVersionId } : null,
        scenario: latestRun && { id: latestRun.id, prospects: (latestRun.prospects || []).map((pr) => pr.id) },
        retrievedItems: latestRun && latestRun.retrievedItemIds,
        decision: latestRun && { served: latestRun.servedAssessments, ranked: latestRun.rankedQualifiedIds },
        watcherResult: lastAudit,
        warningsViolations: lastAudit && { status: lastAudit.status, warnings: lastAudit.warnings, violations: lastAudit.violations },
        spend: ownerSpendView(store, workspace.id),
        noFakeManager: true,
        realConductor: Boolean(store.getAgent("conductor-" + workspace.id)),
      };
    })(),
    watcherJudgeNote: WATCHER_JUDGE_NOTE,
    reservedRoleIds: RESERVED_ROLE_IDS,
    implementedRoleIds: IMPLEMENTED_ROLE_IDS,
    studio: studioOverview(store, { workspaceId: workspace.id }),
  };
}

export function seedRidgelineDemo(store, opts) {
  const existing = store.getWorkspace(RIDGELINE_PRODUCT.id);
  const created = existing || createWorkspace(store, RIDGELINE_PRODUCT).workspace;
  if (!existing) {
    setupWorkspace(store, created.id, {
      ownerStatus: "active",
      ownerRules: RIDGELINE_OWNER_RULES,
      privateNotes: [{ text: "Internal RidgeLine note: do not share this pipeline commentary with any other workspace." }],
    });
  }
  storeOwnerReviewLabels(store, created.id, RIDGELINE_OWNER_LABELS);
  const train = (opts && opts.train === false)
    ? null
    : trainAtlas(store, {
        workspaceId: created.id,
        parentVersionId: (opts && opts.parentVersionId) || undefined,
        declaredChange: "RidgeLine owner-approved US contractor rules. Parent unchanged. Not a promotion.",
        testKind: "fixture",
      });
  return {
    workspace: store.getWorkspace(created.id),
    rules: (store.listKnowledge() || []).filter((k) => (k.workspaceId || k.workspace) === created.id && k.reviewStatus === "approved"),
    training: train,
    ownerLabelsSeparate: true,
    product: RIDGELINE_PRODUCT,
  };
}

export function seedIsolationWorkspaces(store) {
  const a = store.getWorkspace("ws-iso-us") || createWorkspace(store, {
    id: "ws-iso-us",
    name: "US-only isolation A",
    description: "Workspace A sells only in the United States. Description is not policy.",
    industry: "software",
    type: "b2b_saas",
    offer: { name: "US isolator", summary: "US-only fictional offer" },
    idealCustomer: "US accounts",
    geography: "US",
    goal: "Only US accounts are eligible",
    constraints: ["US-only"],
    ownerStatus: "active",
  }).workspace;
  const b = store.getWorkspace("ws-iso-ca") || createWorkspace(store, {
    id: "ws-iso-ca",
    name: "Canada-only isolation B",
    description: "Workspace B sells only in Canada. Description is not policy.",
    industry: "software",
    type: "b2b_saas",
    offer: { name: "CA isolator", summary: "Canada-only fictional offer" },
    idealCustomer: "Canada accounts",
    geography: "CA",
    goal: "Only Canada accounts are eligible",
    constraints: ["Canada-only"],
    ownerStatus: "active",
  }).workspace;
  const hasA = (store.listKnowledge() || []).some((k) => (k.workspaceId || k.workspace) === a.id && /United States/.test(k.statement || ""));
  if (!hasA) {
    setupWorkspace(store, a.id, {
      ownerRules: [{
        statement: "Only United States accounts are eligible in workspace A. Canada is out of territory.",
        category: "territory",
        competency: "territory",
        applicability: {
          scope: "Workspace A US-only",
          requiredConditions: [{ id: "a-us", field: "country", op: "neq", value: "US", description: "Not US", evidenceRequired: true }],
          effect: "exclude",
          unknownBehavior: "research_first",
          exceptions: [],
          priority: 90,
        },
      }],
      privateNotes: [{ text: "Workspace A private note: Seattle pipeline, never share with Canada workspace." }],
    });
  }
  const hasB = (store.listKnowledge() || []).some((k) => (k.workspaceId || k.workspace) === b.id && /Canada/.test(k.statement || ""));
  if (!hasB) {
    setupWorkspace(store, b.id, {
      ownerRules: [{
        statement: "Only Canada accounts are eligible in workspace B. United States is out of territory.",
        category: "territory",
        competency: "territory",
        applicability: {
          scope: "Workspace B Canada-only",
          requiredConditions: [{ id: "b-ca", field: "country", op: "neq", value: "CA", description: "Not Canada", evidenceRequired: true }],
          effect: "exclude",
          unknownBehavior: "research_first",
          exceptions: [],
          priority: 90,
        },
      }],
      privateNotes: [{ text: "Workspace B private note: Toronto pipeline, never share with US workspace." }],
    });
  }
  return { workspaceA: store.getWorkspace(a.id), workspaceB: store.getWorkspace(b.id) };
}

export function listWorkspaces(store) {
  return {
    persistence: "FILE_STORE",
    workspaces: store.listWorkspaces(),
    reservedRoleIds: RESERVED_ROLE_IDS,
    implementedRoleIds: IMPLEMENTED_ROLE_IDS,
    note: "Atlas, Scout, and Watcher are implemented specialists. Reserved roles are not implemented and are not simulated employees. No fake manager.",
  };
}
