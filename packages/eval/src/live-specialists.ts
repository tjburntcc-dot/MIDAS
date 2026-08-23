/** Live specialist execution through the verified provider gateway. No fixture-as-live. */
import { contentHash } from "@midas/db";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import { collectWorkspaceSignals, runEmployeeTask } from "./team-generator.ts";
import { classifyRole, isLiveReasoningRole, isDeterministicAppropriateRole } from "./role-classification.ts";
import { searchProviderStatus } from "./search-provider.ts";
import { spendLimits } from "./spend.ts";
import { requireWorkspaceId } from "./workspace-isolation.ts";

export const LIVE_SPECIALIST_SPEND_CAP_USD = 0.35;
export const LIVE_SPECIALIST_VERSION = "live-specialist-v0";

export const LIVE_TASK_TYPES = [
  "scout_synthesis",
  "offer_strategist",
  "marketing_copy",
  "opportunity_generation",
  "product_planning",
  "ops_analysis",
  "finance_interpretation",
  "knowledge_extraction",
  "sales_planning",
  "executive_planning",
];

const ROLE_TO_TASK = {
  business_research: "scout_synthesis",
  offer_strategist: "offer_strategist",
  marketing: "marketing_copy",
  product: "product_planning",
  ops: "ops_analysis",
  finance: "finance_interpretation",
  knowledge_extraction: "knowledge_extraction",
  opportunity_generation: "opportunity_generation",
  sales: "sales_planning",
  executive: "executive_planning",
};

const TASK_KIND_TO_TYPE = {
  scout_synthesis: "scout_synthesis",
  research_questions: "scout_synthesis",
  idea_hypotheses: "scout_synthesis",
  competitor_summary: "scout_synthesis",
  offer_hypothesis: "offer_strategist",
  offer_positioning: "offer_strategist",
  strategist: "offer_strategist",
  marketing_copy: "marketing_copy",
  content_outline: "marketing_copy",
  landing_outline: "marketing_copy",
  product_planning: "product_planning",
  build_slice: "product_planning",
  ops_analysis: "ops_analysis",
  ops_checklist: "ops_analysis",
  finance_interpretation: "finance_interpretation",
  assumptions_worksheet: "finance_interpretation",
  unit_economics: "finance_interpretation",
  knowledge_extraction: "knowledge_extraction",
  opportunity_generation: "opportunity_generation",
  sales_planning: "sales_planning",
  pipeline_hypothesis: "sales_planning",
  discovery_questions: "sales_planning",
  executive_planning: "executive_planning",
  priority_memo: "executive_planning",
  tradeoff_brief: "executive_planning",
};

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

const COMMON_LABELS = {
  "type": "object",
  additionalProperties: false,
  required: ["hypothesisVersusFact", "status"],
  properties: {
    hypothesisVersusFact: { "type": "boolean" },
    status: { "type": "string" },
  },
};

function stringArray() {
  return { "type": "array", items: { "type": "string" } };
}

export const LIVE_SPECIALIST_CONTRACTS = {
  scout_synthesis: {
    roleId: "business_research",
    taskType: "scout_synthesis",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Scout synthesis for one workspace. Turn owner intake and approved same-workspace knowledge into labeled research findings. Cite only supplied evidence ids. Label hypotheses versus facts. Do not invent TAM, demand, conversion, quotes, or revenue. Search does not exist. Do not claim a web crawl. Do not outreach.",
    developer:
      "Return one JSON object. If information is missing, put it in missing_information. Use supplied evidence ids only.",
    outputSchema: {
      name: "scout_synthesis_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["findings", "questions", "already_known", "missing_information", "assumptions", "labels"],
        properties: {
          findings: {
            "type": "array",
            items: {
              "type": "object",
              additionalProperties: false,
              required: ["statement", "claim_class", "evidence_ids"],
              properties: {
                statement: { "type": "string" },
                claim_class: { "type": "string" },
                evidence_ids: stringArray(),
              },
            },
          },
          questions: stringArray(),
          already_known: stringArray(),
          missing_information: stringArray(),
          assumptions: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
  offer_strategist: {
    roleId: "offer_strategist",
    taskType: "offer_strategist",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Offer Strategist for one workspace. Propose one inspectable offer hypothesis from owner facts and approved same-workspace knowledge. Cite only supplied evidence. Label hypotheses versus facts. Do not invent TAM, demand, quotes, or revenue. Do not outreach. Do not rewrite owner policy.",
    developer:
      "Return one JSON object matching the schema. If the request asks for market size, outreach, or policy rewrite, refuse inside the schema and set labels.status to refused.",
    outputSchema: {
      name: "offer_strategist_foundry_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["target_customer", "customer_problem", "proposed_offer", "approved_evidence", "assumptions", "missing_information", "risks", "recommended_validation_step", "labels"],
        properties: {
          target_customer: { "type": "string" },
          customer_problem: { "type": "string" },
          proposed_offer: { "type": "string" },
          approved_evidence: {
            "type": "array",
            items: {
              "type": "object",
              additionalProperties: false,
              required: ["id", "excerpt"],
              properties: { id: { "type": "string" }, excerpt: { "type": "string" } },
            },
          },
          assumptions: stringArray(),
          missing_information: stringArray(),
          risks: stringArray(),
          recommended_validation_step: { "type": "string" },
          labels: COMMON_LABELS,
        },
      },
    },
  },
  marketing_copy: {
    roleId: "marketing",
    taskType: "marketing_copy",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Marketing copy for one workspace. Draft internal copy or a landing outline from owner facts and approved same-workspace knowledge. No outbound send. No email. No social post. Cite only supplied evidence. Label hypotheses versus facts. Do not invent testimonials, demand, or conversion.",
    developer: "Return one JSON object. Outreach is forbidden.",
    outputSchema: {
      name: "marketing_copy_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["audience", "customer_problem", "headline", "body_outline", "cta_internal_only", "assumptions", "missing_information", "labels"],
        properties: {
          audience: { "type": "string" },
          customer_problem: { "type": "string" },
          headline: { "type": "string" },
          body_outline: stringArray(),
          cta_internal_only: { "type": "string" },
          assumptions: stringArray(),
          missing_information: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
  opportunity_generation: {
    roleId: "opportunity_generation",
    taskType: "opportunity_generation",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You generate AI-generated business hypotheses for one owner profile. Tailor every hypothesis to the supplied owner inputs. Existing-company analysis is not new-business ideation. Search does not exist. Cite only supplied evidence ids. Do not invent TAM, demand, conversion, or revenue. Label every card as a hypothesis.",
    developer:
      "Return 3 distinct hypotheses that would change if the owner profile changed. Do not copy a generic list.",
    outputSchema: {
      name: "opportunity_generation_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["profile_kind", "hypotheses", "missing_information", "labels"],
        properties: {
          profile_kind: { "type": "string" },
          hypotheses: {
            "type": "array",
            items: {
              "type": "object",
              additionalProperties: false,
              required: ["name", "target_customer", "problem", "proposed_offer", "why_it_could_fit", "assumptions", "evidence_ids"],
              properties: {
                name: { "type": "string" },
                target_customer: { "type": "string" },
                problem: { "type": "string" },
                proposed_offer: { "type": "string" },
                why_it_could_fit: { "type": "string" },
                assumptions: stringArray(),
                evidence_ids: stringArray(),
              },
            },
          },
          missing_information: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
  product_planning: {
    roleId: "product",
    taskType: "product_planning",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Product planning for one workspace. Interpret the owner objective into a first supervised build slice. Not a shipped product. Not deployed. Cite only supplied evidence. Do not invent users or demand.",
    developer: "Return one JSON object. Artifact storage is handled outside this call.",
    outputSchema: {
      name: "product_planning_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["slice", "acceptance_checks", "assumptions", "missing_information", "not_shipped", "labels"],
        properties: {
          slice: { "type": "string" },
          acceptance_checks: stringArray(),
          assumptions: stringArray(),
          missing_information: stringArray(),
          not_shipped: { "type": "boolean" },
          labels: COMMON_LABELS,
        },
      },
    },
  },
  ops_analysis: {
    roleId: "ops",
    taskType: "ops_analysis",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Operations analysis for one workspace. Turn owner procedures and constraints into an inspectable checklist. Do not invent staffing, demand, or delivery promises. Cite only supplied evidence.",
    developer: "Return one JSON object.",
    outputSchema: {
      name: "ops_analysis_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["checklist", "constraints_honored", "assumptions", "missing_information", "labels"],
        properties: {
          checklist: stringArray(),
          constraints_honored: stringArray(),
          assumptions: stringArray(),
          missing_information: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
  finance_interpretation: {
    roleId: "finance",
    taskType: "finance_interpretation",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Finance interpretation for one workspace. Interpret owner-stated budget numbers only. Arithmetic and profitability refusal stay with the deterministic worksheet. Do not invent TAM, conversion, revenue, or profitability. Unknown stays unknown.",
    developer: "Return interpretation only. Do not compute a profit figure.",
    outputSchema: {
      name: "finance_interpretation_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["known_costs_restated", "unknowns", "assumptions", "invented_profitability", "labels"],
        properties: {
          known_costs_restated: stringArray(),
          unknowns: stringArray(),
          assumptions: stringArray(),
          invented_profitability: { "type": "boolean" },
          labels: COMMON_LABELS,
        },
      },
    },
  },
  knowledge_extraction: {
    roleId: "knowledge_extraction",
    taskType: "knowledge_extraction",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You extract inspectable knowledge claims from owner-supplied text in one workspace. Classify each claim. Do not invent facts that are not in the text. Do not turn a webpage into owner policy.",
    developer: "Return claims that are actually present in the supplied text.",
    outputSchema: {
      name: "knowledge_extraction_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["claims", "missing_information", "labels"],
        properties: {
          claims: {
            "type": "array",
            items: {
              "type": "object",
              additionalProperties: false,
              required: ["statement", "classification", "excerpt"],
              properties: {
                statement: { "type": "string" },
                classification: { "type": "string" },
                excerpt: { "type": "string" },
              },
            },
          },
          missing_information: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
  sales_planning: {
    roleId: "sales",
    taskType: "sales_planning",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Sales strategist for one workspace. INTERNAL PLANNING ONLY. Draft discovery questions and a pipeline hypothesis from owner facts. No outreach, email, purchase, publish, hire, policy, or cross-workspace. Do not invent demand, quotes, or a prospect list.",
    developer: "Return one JSON object. Outreach is forbidden.",
    outputSchema: {
      name: "sales_planning_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["discovery_questions", "pipeline_hypothesis", "already_known", "missing_information", "forbidden", "labels"],
        properties: {
          discovery_questions: stringArray(),
          pipeline_hypothesis: { "type": "string" },
          already_known: stringArray(),
          missing_information: stringArray(),
          forbidden: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
  executive_planning: {
    roleId: "executive",
    taskType: "executive_planning",
    spendCapUsd: LIVE_SPECIALIST_SPEND_CAP_USD,
    system:
      "You are MIDAS Executive strategist for one workspace. INTERNAL PLANNING ONLY. Write a priority and tradeoff memo from owner constraints. No outreach, hire, policy rewrite, purchase, publish, or cross-workspace. Do not invent demand or revenue.",
    developer: "Return one JSON object. Hiring and policy rewrite are forbidden.",
    outputSchema: {
      name: "executive_planning_output",
      strict: true,
      schema: {
        "type": "object",
        additionalProperties: false,
        required: ["priorities", "tradeoffs", "recommended_next_internal_step", "missing_information", "forbidden", "labels"],
        properties: {
          priorities: stringArray(),
          tradeoffs: stringArray(),
          recommended_next_internal_step: { "type": "string" },
          missing_information: stringArray(),
          forbidden: stringArray(),
          labels: COMMON_LABELS,
        },
      },
    },
  },
};

export function resolveLiveTaskType(roleId, taskKind) {
  const fromKind = TASK_KIND_TO_TYPE[asText(taskKind)];
  if (fromKind) return fromKind;
  return ROLE_TO_TASK[roleId] || null;
}

export function liveSpecialistContract(taskType) {
  return LIVE_SPECIALIST_CONTRACTS[taskType] || null;
}

export function retrieveWorkspaceContext(store, workspaceId, extras) {
  const ws = requireWorkspaceId(workspaceId);
  const workspace = store && store.getWorkspace && store.getWorkspace(ws);
  const signals = collectWorkspaceSignals(workspace || { id: ws });
  const roleId = extras && (extras.roleId || extras.recipientRoleId) || null;
  let approved = listApprovedWorkspaceKnowledge(store, ws);
  const mandatory = approved.filter((k) => k.mandatory === true);
  const roleMatched = roleId
    ? approved.filter((k) => !k.applicableRole || k.applicableRole === roleId || k.mandatory === true)
    : approved;
  const merged = [];
  const seen = new Set();
  for (const k of mandatory.concat(roleMatched)) {
    if (seen.has(k.id)) continue;
    seen.add(k.id);
    merged.push(k);
  }
  const knowledge = merged.map((k) => ({
    id: k.id,
    excerpt: k.excerpt,
    statement: k.statement,
    kind: k.kind,
    classification: k.kind,
    sourceClass: k.kind || "owner_approved_same_workspace",
    workspaceId: k.workspaceId || workspaceId,
  }));
  const search = searchProviderStatus();
  return {
    workspaceId: workspaceId,
    workspaceName: workspace && workspace.name || null,
    intakeKind: signals.intakeKind,
    ownerObjective: signals.ownerObjective,
    description: signals.description,
    offer: signals.offer,
    customer: signals.customer,
    budget: signals.budget,
    constraints: signals.constraints,
    procedures: signals.procedures,
    industries: signals.industries,
    skills: signals.skills,
    challenges: signals.challenges,
    knowledge: knowledge,
    retrievedIds: knowledge.map((k) => k.id),
    sourceClassification: knowledge.map((k) => ({ id: k.id, classification: k.classification, sourceClass: k.sourceClass })),
    searchProvider: search,
    method: "lexical_workspace_scoped",
    embeddings: false,
    searchUsed: false,
    extraText: extras && extras.ownerText || null,
  };
}

export function specialistSpendUsd(store, workspaceId, roleId) {
  const view = ownerSpendView(store, workspaceId);
  const entries = (view.entries || []).filter((e) => {
    if (e.kind !== "live") return false;
    if (roleId && e.role && e.role !== roleId) return false;
    return e.costUsd != null;
  });
  const usd = entries.reduce((s, e) => s + Number(e.costUsd || 0), 0);
  return Math.round(usd * 1e6) / 1e6;
}

export function parseStructuredJson(rawText, requiredFields) {
  const raw = String(rawText || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, parseStatus: "failed", structured: null, raw: raw, missing: (requiredFields || []).slice() };
  }
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, parseStatus: "failed", structured: null, raw: raw, missing: (requiredFields || []).slice() };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, parseStatus: "failed", structured: null, raw: raw, missing: (requiredFields || []).slice() };
  }
  const missing = (requiredFields || []).filter((f) => obj[f] == null);
  if (missing.length) {
    return { ok: false, parseStatus: "uncertain", structured: obj, raw: raw, missing: missing };
  }
  return { ok: true, parseStatus: "ok", structured: obj, raw: raw, missing: [] };
}

function requiredFieldsFor(contract) {
  return ((contract && contract.outputSchema && contract.outputSchema.schema && contract.outputSchema.schema.required) || []).filter((f) => f !== "labels");
}

function persistExecution(store, input, result) {
  const now = nowIso();
  const id = (input && input.executionId) || nextId(((store.listSpecialistExecutions && store.listSpecialistExecutions()) || []).map((r) => r.id), "LSE-");
  const rec = {
    id: id,
    workspaceId: input && input.workspaceId || null,
    employeeId: input && input.employeeId || null,
    agentId: input && input.agentId || null,
    roleId: input && input.roleId || null,
    taskType: input && input.taskType || null,
    taskId: input && input.taskId || null,
    objectiveId: input && input.objectiveId || null,
    createdAt: now,
    version: LIVE_SPECIALIST_VERSION,
    model: result.model || null,
    providerRequestId: result.providerRequestId || null,
    inputTokens: result.usage && result.usage.inputTokens != null ? result.usage.inputTokens : null,
    outputTokens: result.usage && result.usage.outputTokens != null ? result.usage.outputTokens : null,
    estimatedCostUsd: result.spendUsd || 0,
    live: Boolean(result.live),
    fixture: Boolean(result.fixture),
    fixtureFallback: false,
    executionKind: result.live ? "live" : "not_live",
    honestLabel: result.live ? "live" : "deterministic_or_failed_closed",
    parseStatus: result.parseStatus || null,
    status: result.status || null,
    ok: Boolean(result.ok),
    rawText: result.rawText || null,
    structured: result.structured || null,
    retrievedIds: result.retrievedIds || [],
    sourceClassification: result.sourceClassification || [],
    error: result.error || null,
    refusals: result.refusals || [],
    ledgerId: result.ledgerId || null,
    contentHash: contentHash({ rawText: result.rawText, structured: result.structured, createdAt: now }),
    appendOnly: true,
    note: "Persisted specialist execution. live=true only when a provider call actually ran. Fixture cannot masquerade.",
  };
  if (store && store.putSpecialistExecution) store.putSpecialistExecution(rec);
  return rec;
}

function failClosed(store, input, extra) {
  const result = {
    ok: false,
    live: false,
    fixture: Boolean(extra && extra.fixture),
    fixtureFallback: false,
    parseStatus: (extra && extra.parseStatus) || "failed",
    status: (extra && extra.status) || "failed",
    structured: null,
    rawText: extra && extra.rawText || null,
    error: extra && extra.error || "Live path fail-closed. Not labeled live.",
    refusals: extra && extra.refusals || [{ code: extra && extra.code || "not_live", reason: extra && extra.error || "Live path fail-closed." }],
    spendUsd: 0,
    usage: null,
    model: null,
    providerRequestId: null,
    retrievedIds: extra && extra.retrievedIds || [],
    sourceClassification: extra && extra.sourceClassification || [],
  };
  const execution = persistExecution(store, input, result);
  return { ...result, execution: execution, fixtureFallback: false };
}

export function assertNotFixtureMasquerade(completion) {
  const kind = completion && completion.kind;
  if (kind && kind !== "live") {
    const err = new Error("Responder kind was " + kind + ". Not falling back to fixture. Not labeled live.");
    err.code = "NOT_LIVE";
    err.fixture = kind === "fixture";
    throw err;
  }
  if (completion && completion.fixture === true && completion.kind !== "live") {
    const err = new Error("Fixture completion cannot masquerade as live.");
    err.code = "FIXTURE_MASQUERADE";
    err.fixture = true;
    throw err;
  }
}

export async function runLiveSpecialist(store, input, deps) {
  const workspaceId = input && input.workspaceId;
  const roleId = (input && input.roleId) || null;
  const taskType = resolveLiveTaskType(roleId, (input && (input.taskType || input.taskKind)) || "");
  const contract = liveSpecialistContract(taskType);
  const ctx = retrieveWorkspaceContext(store, workspaceId, input);
  const classification = classifyRole(roleId || (contract && contract.roleId));

  if (!taskType || !contract) {
    return failClosed(store, { ...input, taskType: taskType }, {
      code: "TASK_NOT_LIVE",
      error: "Task type is not a live reasoning specialist task. Deterministic roles stay deterministic.",
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }
  if (isDeterministicAppropriateRole(roleId)) {
    return failClosed(store, { ...input, taskType: taskType, roleId: roleId }, {
      code: "DETERMINISTIC_ROLE",
      error: "Role " + roleId + " is deterministic_appropriate. Live model is not used.",
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }

  const cap = (input && input.spendLimitUsd != null) ? Number(input.spendLimitUsd) : contract.spendCapUsd;
  const used = specialistSpendUsd(store, workspaceId, contract.roleId);
  const remaining = Math.round((cap - used) * 1e6) / 1e6;
  if (remaining <= 0) {
    return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
      code: "overspend",
      status: "refused",
      parseStatus: "refused",
      error: "Employee spend cap reached. Remaining $" + remaining,
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }
  const limits = spendLimits();
  if (limits && Number(limits.maxUsdPerRun) <= 0) {
    return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
      code: "overspend",
      status: "refused",
      error: "Global run spend cap forbids a live call.",
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }

  const providerOk = Boolean(deps && (deps.live === true || typeof deps.responder === "function" || typeof deps.specialistResponder === "function"));
  if (!providerOk) {
    return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
      code: "not_live",
      error: "Verified live provider was not supplied. Fail-closed. Fixture fallback is false.",
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }
  if (deps && deps.provider && deps.provider.ok === false) {
    return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
      code: "provider_" + (deps.provider.status || "unavailable"),
      error: deps.provider.error || ("Provider status " + (deps.provider.status || "unavailable") + ". Live calls stopped."),
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }

  const user = {
    task: asText(input && (input.task || input.ownerText || input.input)),
    taskType: taskType,
    workspaceId: workspaceId,
    owner_intake: {
      kind: ctx.intakeKind,
      objective: ctx.ownerObjective,
      description: ctx.description,
      offer: ctx.offer,
      customer: ctx.customer,
      budget: ctx.budget,
      constraints: ctx.constraints,
      procedures: ctx.procedures,
      industries: ctx.industries,
      skills: ctx.skills,
      challenges: ctx.challenges,
    },
    approved_knowledge: ctx.knowledge,
    search_provider: { status: "not-connected", searchIntegrationExists: false },
    constraints: {
      spendCapUsd: cap,
      knowledgeScope: "owner_approved_same_workspace",
      noGold: true,
      noFixture: true,
    },
  };

  let completion;
  try {
    const responder = (deps && deps.specialistResponder) || (deps && deps.responder);
    if (typeof responder !== "function") {
      throw new Error("No live responder provided. fixtureFallback is false.");
    }
    completion = await responder({
      role: contract.roleId,
      taskType: taskType,
      instructions: contract.system + "\n" + contract.developer,
      input: user,
      outputSchema: contract.outputSchema,
    });
    assertNotFixtureMasquerade(completion);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
      code: err && err.code || "live_call_failed",
      fixture: Boolean(err && err.fixture),
      error: msg,
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }

  const kind = completion && completion.kind;
  if (kind !== "live") {
    return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
      code: "not_live",
      fixture: kind === "fixture",
      error: "Responder kind was " + String(kind) + ". Not falling back to fixture. Not labeled live.",
      rawText: completion && completion.text || null,
      retrievedIds: ctx.retrievedIds,
      sourceClassification: ctx.sourceClassification,
    });
  }

  const rawText = typeof completion === "string" ? completion : (completion && (completion.text || completion.rawText) || "");
  const parsed = parseStructuredJson(rawText, requiredFieldsFor(contract));
  const usage = (completion && (completion.usage || completion._usage)) || {};
  const model = (completion && (completion.model || completion._model)) || (deps && deps.model) || null;
  const providerRequestId = (completion && (completion.providerRequestId || completion._providerRequestId || (completion.raw && completion.raw.id))) || null;

  let spendEntry = null;
  try {
    spendEntry = recordUsage(store, {
      workspaceId: workspaceId,
      agentId: (input && input.agentId) || (contract.roleId + "-" + workspaceId),
      role: contract.roleId,
      version: LIVE_SPECIALIST_VERSION,
      operation: "live_specialist",
      kind: "live",
      model: model,
      providerRequestId: providerRequestId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      resultStatus: parsed.ok ? "ok" : "error",
      objectiveId: input && input.objectiveId,
      note: "Live specialist " + taskType + ". fixtureFallback=false.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err && err.code === "BUDGET_ABORT") {
      return failClosed(store, { ...input, taskType: taskType, roleId: contract.roleId }, {
        code: "overspend",
        status: "refused",
        error: msg,
        rawText: rawText,
        retrievedIds: ctx.retrievedIds,
        sourceClassification: ctx.sourceClassification,
      });
    }
  }

  const spendUsd = spendEntry && spendEntry.costUsd != null ? Number(spendEntry.costUsd) : 0;
  const result = {
    ok: parsed.ok,
    live: true,
    fixture: false,
    fixtureFallback: false,
    parseStatus: parsed.parseStatus,
    status: parsed.ok ? ((parsed.structured && parsed.structured.labels && parsed.structured.labels.status) || "hypothesis") : parsed.parseStatus,
    structured: parsed.structured,
    rawText: rawText,
    missing: parsed.missing,
    refusals: parsed.ok ? [] : [{ code: "parse_" + parsed.parseStatus, reason: "Structured parse " + parsed.parseStatus + ". Fields not invented." }],
    spendUsd: spendUsd,
    usage: usage,
    model: model,
    providerRequestId: providerRequestId,
    ledgerId: spendEntry && spendEntry.id,
    retrievedIds: ctx.retrievedIds,
    sourceClassification: ctx.sourceClassification,
    contractRoleId: contract.roleId,
    taskType: taskType,
    intelligenceClass: classification.intelligenceClass,
    searchProvider: ctx.searchProvider,
  };
  const execution = persistExecution(store, { ...input, taskType: taskType, roleId: contract.roleId }, result);
  return { ...result, execution: execution, fixtureFallback: false };
}

export function liveOutputToHandlerShape(result, roleId, taskKind) {
  const structured = result && result.structured || {};
  const live = Boolean(result && result.live === true && result.fixture !== true && result.fixtureFallback !== true);
  const label = live ? "live" : "deterministic";
  const base = {
    kind: taskKind || (result && result.taskType) || roleId,
    label: label,
    claimClass: "model_generated_hypothesis",
    liveProviderCall: live,
    liveModelWork: live,
    fixture: Boolean(result && result.fixture),
    fixtureFallback: false,
    executionId: result && result.execution && result.execution.id || null,
    model: result && result.model || null,
    retrievedIds: result && result.retrievedIds || [],
    usedLessons: result && result.retrievedIds || [],
    note: live
      ? "Live model specialist output. Not a fixture labeled as live."
      : "Not labeled live. A provider call did not run or fail-closed.",
  };
  if (roleId === "business_research") {
    return {
      ...base,
      kind: "scout_synthesis",
      summary: live
        ? clip((structured.findings && structured.findings[0] && structured.findings[0].statement) || "Live scout synthesis.", 220)
        : clip((result && result.error) || "Scout synthesis did not run live.", 220),
      findings: structured.findings || [],
      questions: structured.questions || [],
      alreadyKnown: structured.already_known || [],
      unknown: structured.missing_information || [],
    };
  }
  if (roleId === "offer_strategist") {
    return {
      ...base,
      kind: /position/i.test(String(taskKind || "")) ? "offer_positioning" : "offer_hypothesis",
      summary: live ? clip(structured.proposed_offer || "Live offer hypothesis.", 220) : clip((result && result.error) || "Offer strategist did not run live.", 220),
      positioning: structured.proposed_offer || null,
      invented: { tam: false, demand: false, conversion: false, expectedRevenue: false },
      validationGaps: structured.missing_information || [],
    };
  }
  if (roleId === "marketing") {
    return {
      ...base,
      kind: /landing/i.test(String(taskKind || "")) ? "landing_outline" : "marketing_copy",
      summary: live ? clip(structured.headline || "Live marketing copy.", 220) : clip((result && result.error) || "Marketing did not run live.", 220),
      customerProblem: structured.customer_problem || null,
      outline: structured.body_outline || [],
      headline: structured.headline || null,
      outreach: false,
      artifactGenerated: false,
    };
  }
  if (roleId === "product") {
    return {
      ...base,
      kind: "build_slice",
      summary: live ? clip(structured.slice || "Live product plan.", 220) : clip((result && result.error) || "Product planning did not run live.", 220),
      slice: structured.slice || null,
      notShipped: structured.not_shipped !== false,
      artifactGenerated: false,
    };
  }
  if (roleId === "executive") {
    return {
      ...base,
      kind: "priority_memo",
      summary: live
        ? clip((structured.recommended_next_internal_step) || ((structured.priorities || [])[0]) || "Live executive priority memo.", 220)
        : clip((result && result.error) || "Executive planning did not run live.", 220),
      priorities: structured.priorities || [],
      tradeoffs: structured.tradeoffs || [],
      recommendedNextInternalStep: structured.recommended_next_internal_step || null,
      missingInformation: structured.missing_information || [],
      forbidden: structured.forbidden || [],
      outreach: false,
      hire: false,
      policyCreation: false,
      spendAuthorization: false,
    };
  }
  if (roleId === "ops") {
    return {
      ...base,
      kind: "ops_checklist",
      summary: live ? "Live operations analysis from owner facts." : clip((result && result.error) || "Ops analysis did not run live.", 220),
      checklist: structured.checklist || [],
    };
  }
  if (roleId === "finance") {
    return {
      ...base,
      kind: "assumptions_worksheet",
      summary: live ? clip((structured.known_costs_restated || []).join(" ") || "Live finance interpretation. Profitability not invented.", 220) : clip((result && result.error) || "Finance interpretation did not run live.", 220),
      inventedProfitability: structured.invented_profitability === true ? true : false,
      unknown: structured.unknowns || [],
      assumptions: structured.assumptions || [],
    };
  }
  return {
    ...base,
    summary: live ? clip(JSON.stringify(structured).slice(0, 180), 180) : clip((result && result.error) || "Live specialist did not run.", 220),
    structured: structured,
  };
}

export function listSpecialistExecutions(store, workspaceId) {
  const all = (store && store.listSpecialistExecutions && store.listSpecialistExecutions(workspaceId)) || [];
  return all.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

export function liveExecutionView(store, workspaceId) {
  const rows = listSpecialistExecutions(store, workspaceId);
  const live = rows.filter((r) => r.live === true && r.fixture !== true);
  return {
    workspaceId: workspaceId || null,
    executions: rows.map((r) => ({
      id: r.id,
      roleId: r.roleId,
      taskType: r.taskType,
      live: r.live === true,
      fixture: r.fixture === true,
      fixtureFallback: false,
      model: r.model,
      tokens: { input: r.inputTokens, output: r.outputTokens },
      estimatedCostUsd: r.estimatedCostUsd,
      retrievedIds: r.retrievedIds || [],
      status: r.status,
    })),
    liveCount: live.length,
    liveUsd: live.reduce((s, r) => s + Number(r.estimatedCostUsd || 0), 0),
    fixtureMasquerade: rows.some((r) => r.live === true && r.fixture === true),
  };
}

export { isLiveReasoningRole };

export async function runEmployeeTaskLive(store, employeeId, payload, deps) {
  const role = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  if (!role) {
    const err = new Error("employee not found");
    err.code = "EMPLOYEE_NOT_FOUND";
    err.errorStatus = 404;
    throw err;
  }
  const preferLive = Boolean(payload && (payload.preferLive === true || payload.live === true));
  const liveCapable = isLiveReasoningRole(role.roleId);
  if (!preferLive || !liveCapable) {
    const det = runEmployeeTask(store, employeeId, payload || {});
    return { ...det, liveProviderCall: false, liveModelWork: false, fixtureFallback: false, usedLivePath: false };
  }
  const result = await runLiveSpecialist(store, {
    workspaceId: role.workspaceId,
    employeeId: role.id,
    agentId: role.agentId,
    roleId: role.roleId,
    taskType: payload && (payload.taskType || payload.taskKind || payload.type || payload.key),
    taskKind: payload && (payload.taskKind || payload.type || payload.key),
    task: payload && (payload.task || payload.input || payload.ownerText || payload.text),
    ownerText: payload && (payload.ownerText || payload.input || payload.task),
    input: payload && (payload.input || payload.task || payload.ownerText),
    objectiveId: payload && payload.objectiveId,
    taskId: payload && payload.taskId,
    spendLimitUsd: payload && payload.spendLimitUsd,
  }, deps || {});
  const output = liveOutputToHandlerShape(result, role.roleId, payload && (payload.taskKind || payload.type || payload.key));
  const now = new Date().toISOString();
  const existing = ((store.listEmployeeTasks && store.listEmployeeTasks()) || []).map((r) => r.id);
  let n = 1;
  const re = /^ETASK-(\d+)$/;
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  const task = {
    id: "ETASK-" + String(n).padStart(3, "0"),
    workspaceId: role.workspaceId,
    employeeId: role.id,
    agentId: role.agentId,
    roleId: role.roleId,
    createdAt: now,
    input: (payload && (payload.input || payload.task || payload.ownerText)) || role.objective,
    status: result.live ? (result.ok ? "completed_live" : "failed_live") : "failed_closed",
    liveProviderCall: result.live === true,
    liveModelWork: result.live === true,
    fixture: Boolean(result.fixture),
    fixtureFallback: false,
    executionId: result.execution && result.execution.id || null,
    output: output,
    model: result.model || null,
    spendUsd: result.spendUsd || 0,
    retrievedIds: result.retrievedIds || [],
  };
  store.putEmployeeTask(task);
  const history = (role.taskHistory || []).concat([{
    id: task.id,
    at: now,
    status: task.status,
    kind: output.kind,
    summary: output.summary,
    liveProviderCall: task.liveProviderCall,
    executionId: task.executionId,
  }]);
  const next = { ...role, taskHistory: history };
  store.putEmployeeRole(next);
  return {
    ok: result.ok,
    task: task,
    employee: next,
    liveProviderCall: result.live === true,
    liveModelWork: result.live === true,
    fixtureFallback: false,
    usedLivePath: true,
    execution: result.execution,
    specialist: result,
  };
}
