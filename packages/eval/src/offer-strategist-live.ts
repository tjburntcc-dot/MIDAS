/** Live Offer Strategist runner. No fixture fallback. Gold is not imported. */

import { contentHash } from "@midas/db";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import { runOfferStrategist, OFFER_STRATEGIST_ROLE_ID, OFFER_STRATEGIST_SPEC } from "./offer-strategist.ts";
import {
  OFFER_STRATEGIST_FROZEN_CONTRACT,
  OFFER_STRATEGIST_LIVE_SCHEMA,
  OFFER_STRATEGIST_REQUIRED_FIELDS,
} from "./offer-strategist-contract.ts";
import { requireWorkspaceId, listApprovedKnowledgeInWorkspace } from "./workspace-isolation.ts";

export const OFFER_STRATEGIST_LIVE_TASK =
  "Using RidgeLine's approved customer information, operating rules, and existing evidence about manual estimating workflows, propose one credible offer for roofing contractors and explain what would need to be validated.";

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

export function listApprovedWorkspaceKnowledge(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const items = listApprovedKnowledgeInWorkspace(store, ws, { allowRidgelineLegacy: ws === "ws-ridgeline" });
  return items.map((k) => ({
    id: k.id,
    excerpt: k.excerpt || (k.locator && k.locator.text) || String(k.statement || "").slice(0, 280),
    statement: String(k.statement || "").slice(0, 400),
    kind: k.kind || k.claimKind || k.classification || null,
    classification: k.classification || k.kind || k.claimKind || null,
    findingId: k.scoutFindingId || null,
    workspaceId: k.workspaceId || null,
    applicableRole: k.applicableRole || k.agentRole || null,
    mandatory: k.classification === "owner_policy" || k.kind === "owner_policy" || k.claimKind === "owner_policy" || k.mandatory === true,
  }));
}

export function employeeSpendUsd(store, workspaceId, roleId) {
  const view = ownerSpendView(store, workspaceId);
  const entries = (view.entries || []).filter((e) => e.role === (roleId || OFFER_STRATEGIST_ROLE_ID) && e.kind === "live" && e.costUsd != null);
  const usd = entries.reduce((s, e) => s + Number(e.costUsd || 0), 0);
  return Math.round(usd * 1e6) / 1e6;
}

export function employeeRemainingUsd(store, workspaceId, capUsd) {
  const cap = capUsd != null ? Number(capUsd) : OFFER_STRATEGIST_SPEC.spendLimitUsd;
  const used = employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID);
  return Math.round((cap - used) * 1e6) / 1e6;
}

export function parseOfferStrategistOutput(rawText) {
  const raw = String(rawText || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, parseStatus: "failed", structured: null, raw: raw, missing: OFFER_STRATEGIST_REQUIRED_FIELDS.slice() };
  }
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, parseStatus: "failed", structured: null, raw: raw, missing: OFFER_STRATEGIST_REQUIRED_FIELDS.slice() };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, parseStatus: "failed", structured: null, raw: raw, missing: OFFER_STRATEGIST_REQUIRED_FIELDS.slice() };
  }
  const missing = OFFER_STRATEGIST_REQUIRED_FIELDS.filter((f) => obj[f] == null);
  if (missing.length) {
    return { ok: false, parseStatus: "uncertain", structured: obj, raw: raw, missing: missing };
  }
  return { ok: true, parseStatus: "ok", structured: obj, raw: raw, missing: [] };
}

const MARKET_STAT_RE = /\$[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s*%|\b(?:TAM|CAGR|billion|million)\b|\b\d{2,}\s*(?:percent|contractors|companies)\b/i;
const OUTREACH_RE = /email the prospect|call the contractor|outreach to|cold call|send this email/i;
const POLICY_RE = /rewrite .{0,40}polic|change owner polic|author a new polic/i;

export function detectInventedNumbers(text, approvedExcerpts) {
  const blob = String(text || "");
  const allowed = String((approvedExcerpts || []).join("\n") || "");
  const hits = [];
  const re = new RegExp(MARKET_STAT_RE.source, "gi");
  let m;
  while ((m = re.exec(blob))) {
    const token = m[0];
    if (allowed.includes(token)) continue;
    hits.push(token);
  }
  return hits;
}

export function emptyStructured() {
  return {
    target_customer: null,
    customer_problem: null,
    proposed_offer: null,
    approved_evidence: [],
    assumptions: [],
    missing_information: [],
    risks: [],
    recommended_validation_step: null,
    labels: { hypothesisVersusFact: false, status: "failed" },
  };
}

export async function runOfferStrategistLive(store, input, deps) {
  const workspaceId = input && input.workspaceId;
  const task = String((input && (input.task || input.ownerText)) || "");
  const cap = (input && input.spendLimitUsd != null) ? Number(input.spendLimitUsd) : OFFER_STRATEGIST_SPEC.spendLimitUsd;
  const used = employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID);
  const remaining = Math.round((cap - used) * 1e6) / 1e6;
  const fixtureFallback = false;

  const gate = runOfferStrategist(store, {
    workspaceId: workspaceId,
    task: task,
    approvedFindingIds: (input && input.approvedFindingIds) || [],
    approvedStatements: (input && input.approvedStatements) || [],
    spendUsd: 0,
    spendLimitUsd: cap,
    development: Boolean(input && input.development),
  });

  const knowledge = (input && input.approvedKnowledge) || listApprovedWorkspaceKnowledge(store, workspaceId);
  const sameWorkspace = knowledge.filter((k) => !k.workspaceId || k.workspaceId === workspaceId);

  if (remaining <= 0) {
    return persistRun(store, input, {
      ok: false,
      live: false,
      fixture: false,
      fixtureFallback: false,
      parseStatus: "refused",
      status: "refused",
      structured: null,
      rawText: null,
      refusals: [{ code: "overspend", reason: "Employee spend cap reached. Remaining $" + remaining }],
      spendUsd: 0,
      remainingUsd: remaining,
      approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
    });
  }

  if (gate && gate.status === "refused" && gate.refusals && gate.refusals.length && (input && input.skipLocalRefuse) !== true) {
    const code = gate.refusals[0].code;
    if (["overspend", "other_workspace", "unauthorized_role", "role_not_implemented"].includes(code)) {
      return persistRun(store, input, {
        ok: false,
        live: false,
        fixture: false,
        fixtureFallback: false,
        parseStatus: "refused",
        status: "refused",
        structured: null,
        rawText: null,
        refusals: gate.refusals,
        spendUsd: 0,
        remainingUsd: remaining,
        approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
      });
    }
  }

  const live = Boolean(deps && (deps.live === true || typeof deps.offerStrategistResponder === "function" || typeof deps.responder === "function"));
  if (!live) {
    return persistRun(store, input, {
      ok: false,
      live: false,
      fixture: false,
      fixtureFallback: false,
      parseStatus: "failed",
      status: "failed",
      structured: null,
      rawText: null,
      error: "Live model required. fixtureFallback is false. Not inventing fields.",
      refusals: [{ code: "not_live", reason: "Shared provider gateway was not live." }],
      spendUsd: 0,
      remainingUsd: remaining,
      approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
    });
  }

  const prompt = OFFER_STRATEGIST_FROZEN_CONTRACT.promptBundle;
  const user = {
    task: task,
    workspaceId: workspaceId,
    approved_knowledge: sameWorkspace.map((k) => ({ id: k.id, excerpt: k.excerpt, kind: k.kind })),
    constraints: {
      spendCapUsd: cap,
      knowledgeScope: "owner_approved_same_workspace",
      noGold: true,
    },
  };

  let completion;
  try {
    const responder = (deps && deps.offerStrategistResponder) || (deps && deps.responder);
    if (typeof responder === "function") {
      completion = await responder({
        role: "offer_strategist",
        instructions: prompt.system + "\n" + prompt.developer,
        input: user,
        outputSchema: { name: "offer_strategist_output", strict: true, schema: OFFER_STRATEGIST_LIVE_SCHEMA },
      });
    } else {
      throw new Error("No live responder provided. fixtureFallback is false.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return persistRun(store, input, {
      ok: false,
      live: false,
      fixture: false,
      fixtureFallback: false,
      parseStatus: "failed",
      status: "failed",
      structured: null,
      rawText: null,
      error: msg,
      refusals: [{ code: "live_call_failed", reason: msg }],
      spendUsd: 0,
      remainingUsd: remaining,
      approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
    });
  }

  const kind = completion && completion.kind;
  if (kind && kind !== "live") {
    return persistRun(store, input, {
      ok: false,
      live: false,
      fixture: kind === "fixture",
      fixtureFallback: false,
      parseStatus: "failed",
      status: "failed",
      structured: null,
      rawText: completion && completion.text || null,
      error: "Responder kind was " + kind + ". Not falling back to fixture.",
      refusals: [{ code: "not_live", reason: "Responder kind was " + kind }],
      spendUsd: 0,
      remainingUsd: remaining,
      approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
    });
  }

  const rawText = typeof completion === "string" ? completion : (completion && (completion.text || completion.rawText) || "");
  const parsed = parseOfferStrategistOutput(rawText);
  const usage = (completion && (completion.usage || completion._usage)) || {};
  const model = (completion && (completion.model || completion._model)) || (deps && deps.model) || null;
  const providerRequestId = (completion && (completion.providerRequestId || completion._providerRequestId || (completion.raw && completion.raw.id))) || null;

  let spendEntry = null;
  try {
    spendEntry = recordUsage(store, {
      workspaceId: workspaceId,
      agentId: (input && input.agentId) || "offer_strategist-" + workspaceId,
      role: OFFER_STRATEGIST_ROLE_ID,
      version: (input && input.versionId) || "offer_strategist-ws-ridgeline-v0",
      operation: "offer_strategist",
      kind: "live",
      model: model,
      providerRequestId: providerRequestId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      resultStatus: parsed.ok ? "ok" : "error",
      objectiveId: input && input.objectiveId,
      note: "Offer Strategist live assignment. fixtureFallback=false.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err && err.code === "BUDGET_ABORT") {
      return persistRun(store, input, {
        ok: false,
        live: true,
        fixture: false,
        fixtureFallback: false,
        parseStatus: parsed.parseStatus,
        status: "refused",
        structured: parsed.structured,
        rawText: rawText,
        error: msg,
        refusals: [{ code: "overspend", reason: msg }],
        spendUsd: 0,
        remainingUsd: remaining,
        approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
      });
    }
  }

  const spendUsd = spendEntry && spendEntry.costUsd != null ? Number(spendEntry.costUsd) : 0;
  const remainingAfter = Math.round((remaining - spendUsd) * 1e6) / 1e6;

  return persistRun(store, input, {
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
    remainingUsd: remainingAfter,
    usage: usage,
    model: model,
    providerRequestId: providerRequestId,
    ledgerId: spendEntry && spendEntry.id,
    approvedKnowledgeIds: sameWorkspace.map((k) => k.id),
    rawPreserved: true,
  });
}

function persistRun(store, input, result) {
  const now = nowIso();
  const structured = result.structured;
  const run = {
    id: (input && input.runId) || nextId(store, "OSR-", () => (store.listOfferStrategistRuns && store.listOfferStrategistRuns()) || []),
    workspaceId: input && input.workspaceId,
    objectiveId: input && input.objectiveId || null,
    taskId: input && input.taskId || null,
    employeeId: input && input.employeeId || "EMP-001",
    roleId: OFFER_STRATEGIST_ROLE_ID,
    versionId: input && input.versionId || "offer_strategist-ws-ridgeline-v0",
    createdAt: now,
    task: input && (input.task || input.ownerText) || null,
    rawText: result.rawText,
    structured: structured,
    parseStatus: result.parseStatus,
    status: result.status,
    live: Boolean(result.live),
    fixture: Boolean(result.fixture),
    fixtureFallback: false,
    ok: Boolean(result.ok),
    refusals: result.refusals || [],
    error: result.error || null,
    missing: result.missing || [],
    spendUsd: result.spendUsd || 0,
    remainingUsd: result.remainingUsd,
    usage: result.usage || null,
    model: result.model || null,
    providerRequestId: result.providerRequestId || null,
    ledgerId: result.ledgerId || null,
    approvedKnowledgeIds: result.approvedKnowledgeIds || [],
    contentHash: contentHash({ rawText: result.rawText, structured: structured, createdAt: now }),
    appendOnly: true,
    disclosure: "Raw model response preserved. Structured fields invented only when parsed. Not promotion.",
  };
  if (store && store.putOfferStrategistRun) store.putOfferStrategistRun(run);
  return { ...result, run: run, fixtureFallback: false };
}
