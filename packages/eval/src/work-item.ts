/**
 * The general work nervous system.
 *
 * MIDAS needs one representation of economically relevant company work that is
 * not shaped like a lead. A company may need sales work, engineering work,
 * research, fulfilment, finance, support, experiments and management work, and
 * the same machinery has to carry all of them or the core becomes a CRM.
 *
 * Why this is not `workflow_tasks`, which already exists: that record is a step
 * inside a plan (planId, stepIndex, prerequisites) and carries no economics. It
 * answers "what is the next step of this plan". A WorkItem answers "what work is
 * worth doing for this company, what is it worth, what state is it in, who
 * touched it and what did it cost". Those are different questions and the second
 * one is the one an operating company needs. Plan steps can point at a WorkItem;
 * a WorkItem does not need a plan to exist.
 *
 * Scale is a storage and scheduling concern, never a semantic one. Nothing here
 * caps a population, ranks by a fixed list size, or deletes an item for being
 * unimportant today. Priority decides when work receives compute, not whether it
 * continues to exist.
 */
import { createHash, randomUUID } from "node:crypto";

/** Work classes. A company needs more than one, or the abstraction is a lead list. */
export const WORK_TYPES = [
  "commercial_opportunity",
  "sales_action",
  "research",
  "engineering",
  "fulfilment",
  "marketing",
  "product",
  "support",
  "finance",
  "operations",
  "experiment",
  "management",
  "external_human",
] as const;

export const WORK_STATES = [
  "discovered", "under_research", "qualifying", "qualified", "declined",
  "ready_for_work", "working", "audit_failed", "awaiting_approval", "approved",
  "executed", "waiting_external", "replied", "scoping", "quoted",
  "payment_ready", "paid", "fulfilling", "delivered",
  "won", "lost", "expired", "blocked",
] as const;

/**
 * Transitions are per work type. Forcing sales states onto engineering tasks is
 * how a general system quietly becomes a sales tool, so each type declares only
 * the states it can genuinely occupy.
 */
const COMMERCIAL_FLOW: Record<string, string[]> = {
  discovered: ["under_research", "qualifying", "declined", "expired", "blocked"],
  under_research: ["qualifying", "declined", "expired", "blocked"],
  qualifying: ["qualified", "declined", "expired", "blocked"],
  qualified: ["ready_for_work", "declined", "expired", "blocked"],
  ready_for_work: ["working", "blocked", "expired"],
  working: ["awaiting_approval", "audit_failed", "blocked"],
  audit_failed: ["working", "declined", "blocked"],
  awaiting_approval: ["approved", "declined", "blocked"],
  approved: ["executed", "blocked"],
  executed: ["waiting_external", "blocked"],
  waiting_external: ["replied", "lost", "expired"],
  replied: ["scoping", "lost"],
  scoping: ["quoted", "lost", "blocked"],
  quoted: ["payment_ready", "lost"],
  payment_ready: ["paid", "lost"],
  paid: ["fulfilling"],
  fulfilling: ["delivered", "blocked"],
  delivered: ["won", "lost"],
  won: [], lost: [], declined: [], expired: [], blocked: ["discovered", "qualifying", "ready_for_work"],
};

const DELIVERY_FLOW: Record<string, string[]> = {
  discovered: ["ready_for_work", "blocked", "declined"],
  ready_for_work: ["working", "blocked"],
  working: ["awaiting_approval", "audit_failed", "delivered", "blocked"],
  audit_failed: ["working", "blocked"],
  awaiting_approval: ["approved", "declined", "blocked"],
  approved: ["executed", "delivered"],
  executed: ["delivered"],
  delivered: ["won", "lost"],
  won: [], lost: [], declined: [], blocked: ["ready_for_work", "working"], expired: [],
};

const ANALYSIS_FLOW: Record<string, string[]> = {
  discovered: ["under_research", "ready_for_work", "blocked", "declined"],
  under_research: ["ready_for_work", "delivered", "blocked"],
  ready_for_work: ["working", "blocked"],
  working: ["delivered", "blocked"],
  delivered: [], declined: [], blocked: ["under_research", "ready_for_work", "working"], expired: [],
};

export const TRANSITIONS: Record<string, Record<string, string[]>> = {
  commercial_opportunity: COMMERCIAL_FLOW,
  sales_action: COMMERCIAL_FLOW,
  engineering: DELIVERY_FLOW,
  fulfilment: DELIVERY_FLOW,
  marketing: DELIVERY_FLOW,
  product: DELIVERY_FLOW,
  support: DELIVERY_FLOW,
  operations: DELIVERY_FLOW,
  external_human: DELIVERY_FLOW,
  research: ANALYSIS_FLOW,
  finance: ANALYSIS_FLOW,
  experiment: ANALYSIS_FLOW,
  management: ANALYSIS_FLOW,
};

export const TERMINAL_STATES = ["won", "lost", "declined", "expired"];
/** External-facing states. Reaching these requires owner approval, never a worker's own say-so. */
export const EXTERNAL_ACTION_STATES = ["approved", "executed", "waiting_external"];

export function newWorkItem(args: {
  workspaceId: string;
  type: string;
  title: string;
  objective?: string;
  source?: { kind: string; url?: string; discoveredAt?: string; note?: string };
  evidence?: any[];
  inputs?: any;
  priority?: number;
  economics?: any;
  id?: string;
  createdAt?: string;
}) {
  if (!WORK_TYPES.includes(args.type as any)) throw new Error("unknown work type " + args.type);
  const now = args.createdAt || new Date().toISOString();
  return {
    id: args.id || "WI-" + randomUUID().slice(0, 8),
    workspaceId: args.workspaceId,
    type: args.type,
    title: args.title,
    objective: args.objective || null,
    source: args.source || { kind: "internal" },
    evidence: args.evidence || [],
    inputs: args.inputs || {},
    state: "discovered",
    priority: args.priority == null ? null : args.priority,
    economics: args.economics || {},
    assignedRoleId: null,
    assignedVersionId: null,
    dependsOn: [],
    outputs: {},
    auditStatus: null,
    externalActionStatus: "none",
    cost: { usd: 0, humanMinutes: 0, modelCalls: 0 },
    outcome: null,
    history: [{ at: now, to: "discovered", by: "system", reason: "created", evidenceRefs: [] }],
    createdAt: now,
    updatedAt: now,
  };
}

export function allowedNext(item: any): string[] {
  const flow = TRANSITIONS[item.type];
  if (!flow) throw new Error("no transition table for type " + item.type);
  return flow[item.state] || [];
}

/**
 * Move a work item, recording who moved it and why.
 *
 * Provenance is mandatory rather than optional: `qualified` must never be able to
 * mean "some agent once said yes". A transition without an actor and a reason is
 * rejected, so the record cannot decay into a bare status field.
 */
export function transition(item: any, args: {
  to: string;
  by: string;
  reason: string;
  workerRoleId?: string;
  workerVersionId?: string;
  evidenceRefs?: string[];
  output?: any;
  costUsd?: number;
  humanMinutes?: number;
  modelCalls?: number;
  model?: string;
  auditStatus?: string;
  externalActionStatus?: string;
  at?: string;
}) {
  if (!WORK_STATES.includes(args.to as any)) throw new Error("unknown state " + args.to);
  if (!args.by || !String(args.reason || "").trim()) {
    throw new Error("a transition needs an actor and a reason; a bare status change is not provenance");
  }
  const next = allowedNext(item);
  if (!next.includes(args.to)) {
    throw new Error("illegal transition for " + item.type + ": " + item.state + " -> " + args.to +
      " (allowed: " + (next.join(", ") || "none, terminal") + ")");
  }
  const at = args.at || new Date().toISOString();
  const entry = {
    at, from: item.state, to: args.to, by: args.by, reason: args.reason,
    workerRoleId: args.workerRoleId || null,
    workerVersionId: args.workerVersionId || null,
    evidenceRefs: args.evidenceRefs || [],
    costUsd: Number(args.costUsd || 0),
    humanMinutes: Number(args.humanMinutes || 0),
    modelCalls: Number(args.modelCalls || 0),
    model: args.model || null,
  };
  const moved = {
    ...item,
    state: args.to,
    assignedRoleId: args.workerRoleId || item.assignedRoleId,
    assignedVersionId: args.workerVersionId || item.assignedVersionId,
    outputs: args.output === undefined ? item.outputs : { ...item.outputs, [args.to]: args.output },
    auditStatus: args.auditStatus === undefined ? item.auditStatus : args.auditStatus,
    externalActionStatus: args.externalActionStatus === undefined ? item.externalActionStatus : args.externalActionStatus,
    cost: {
      usd: Number(item.cost.usd) + entry.costUsd,
      humanMinutes: Number(item.cost.humanMinutes) + entry.humanMinutes,
      modelCalls: Number(item.cost.modelCalls) + entry.modelCalls,
    },
    history: item.history.concat([entry]),
    updatedAt: at,
  };
  return moved;
}

/** Deterministic identity for deduplication across discovery runs. */
export function workItemFingerprint(args: { workspaceId: string; type: string; url?: string; title: string; brief?: string }) {
  const key = [
    args.workspaceId, args.type,
    String(args.url || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, ""),
    String(args.title || "").trim().toLowerCase().replace(/\s+/g, " "),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

// --------------------------------------------------------------- persistence
const FILE = "work_items.json";

export function putWorkItem(store: any, item: any) {
  return store._putJsonById(FILE, item, false);
}
export function listWorkItems(store: any, workspaceId?: string) {
  const all = store._listJson(FILE);
  return workspaceId ? all.filter((w: any) => w.workspaceId === workspaceId) : all;
}
export function getWorkItem(store: any, id: string) {
  return store._listJson(FILE).find((w: any) => w.id === id);
}

/**
 * Insert only items whose fingerprint is new. Discovery reruns constantly and
 * must not multiply the population; equally it must not silently drop a genuinely
 * new opportunity, so the report distinguishes the two.
 */
export function upsertDiscovered(store: any, items: any[]) {
  const existing = listWorkItems(store);
  const seen = new Map(existing.map((w: any) => [w.fingerprint, w]));
  const inserted: any[] = [];
  const duplicates: any[] = [];
  for (const item of items) {
    if (seen.has(item.fingerprint)) { duplicates.push(item.fingerprint); continue; }
    seen.set(item.fingerprint, item);
    putWorkItem(store, item);
    inserted.push(item);
  }
  return { inserted, duplicates, total: existing.length + inserted.length };
}

/**
 * Expected value of acting on a commercial item now.
 *
 * Deliberately not nominal price. A fast small job that converts and pays can
 * outrank a large speculative tender, because what is scarce is founder hours and
 * what matters is cash that actually arrives. Missing inputs make the estimate
 * uncertain rather than optimistic: an absent probability is treated as poor, so
 * an unknown opportunity cannot outrank a verified one by default.
 */
export function expectedValueScore(item: any) {
  const e = item.economics || {};
  const value = Number(e.expectedValueUsd ?? 0);
  const close = Number(e.closeProbabilityPct ?? 20) / 100;
  const pay = Number(e.paymentProbabilityPct ?? 60) / 100;
  const aiShare = Number(e.aiFulfilmentPct ?? 50) / 100;
  const humanMinutes = Math.max(15, Number(e.humanMinutes ?? 240));
  const speedDays = Math.max(1, Number(e.daysToCash ?? 30));
  const risk = Math.min(0.95, Math.max(0, Number(e.riskPct ?? 20) / 100));

  const expectedCash = value * close * pay * (1 - risk);
  const founderHours = (humanMinutes * (1 - aiShare * 0.5)) / 60;
  const perHour = expectedCash / Math.max(0.25, founderHours);
  // Speed matters because cash now funds the next cycle; the discount is gentle
  // so a genuinely large opportunity is not buried by a trivial fast one.
  const speedFactor = 1 / Math.pow(speedDays, 0.35);
  return {
    score: perHour * speedFactor,
    expectedCash,
    founderHours,
    perHour,
    speedFactor,
    inputsMissing: ["expectedValueUsd", "closeProbabilityPct", "paymentProbabilityPct", "aiFulfilmentPct", "humanMinutes"]
      .filter((k) => e[k] == null),
  };
}

/** Rank without deleting. Everything viable stays; order decides who gets compute first. */
export function rankWorkItems(items: any[]) {
  return items
    .map((item) => ({ item, ev: expectedValueScore(item) }))
    .sort((a, b) => b.ev.score - a.ev.score);
}

export function workItemSummary(items: any[]) {
  const byState: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let usd = 0;
  let minutes = 0;
  for (const w of items) {
    byState[w.state] = (byState[w.state] || 0) + 1;
    byType[w.type] = (byType[w.type] || 0) + 1;
    usd += Number(w.cost?.usd || 0);
    minutes += Number(w.cost?.humanMinutes || 0);
  }
  return { total: items.length, byState, byType, costUsd: Number(usd.toFixed(4)), humanMinutes: minutes };
}
