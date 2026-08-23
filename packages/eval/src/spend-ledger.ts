/** One usage boundary for probes, workbench, evals, Scout research, extraction, judging. */
import { randomUUID } from "node:crypto";
import { estimateUsd, pricingRates, spendLimits, utcDay, assertWithinBudget } from "./spend.ts";

export const LEDGER_OPERATIONS = [
  "probe",
  "workbench",
  "eval",
  "scout_research",
  "extraction",
  "judging",
  "train",
  "watcher_audit",
  "manager_plan",
  "offer_strategist",
  "live_specialist",
];

export const COST_STATUSES = ["estimated", "unknown"];

function nowIso() {
  return new Date().toISOString();
}

function hasFiniteTokens(n) {
  return n != null && Number.isFinite(Number(n));
}

export function pricingSourceStatus() {
  const fromEnv = process.env.MIDAS_USD_PER_1M_INPUT != null || process.env.MIDAS_USD_PER_1M_OUTPUT != null;
  return {
    status: fromEnv ? "env_override" : "gpt-4.1-class-default",
    note: pricingRates().note,
  };
}

/**
 * Record one provider/fixture usage row.
 * Never fabricates token counts. Cost is estimated only when tokens were provided
 * and a pricing source exists; otherwise costStatus=unknown and usd=null.
 */
export function recordUsage(store, raw) {
  const timestamp = raw && raw.timestamp ? String(raw.timestamp) : nowIso();
  const inputGiven = hasFiniteTokens(raw && raw.inputTokens);
  const outputGiven = hasFiniteTokens(raw && raw.outputTokens);
  const tokensKnown = inputGiven || outputGiven;
  const inputTokens = inputGiven ? Number(raw.inputTokens) : null;
  const outputTokens = outputGiven ? Number(raw.outputTokens) : null;
  const kind = raw && raw.kind === "live" ? "live" : "fixture";
  const pricing = pricingSourceStatus();
  let costStatus = "unknown";
  let costUsd = null;
  if (kind === "live" && tokensKnown) {
    costStatus = "estimated";
    costUsd = estimateUsd(inputTokens || 0, outputTokens || 0);
  } else if (kind === "fixture") {
    costStatus = "unknown";
    costUsd = null;
  } else if (!tokensKnown) {
    costStatus = "unknown";
    costUsd = null;
  }
  if (raw && raw.costStatus === "unknown") {
    costStatus = "unknown";
    costUsd = null;
  }
  if (raw && raw.forceUnknownCost === true) {
    costStatus = "unknown";
    costUsd = null;
  }

  if (costStatus === "estimated" && costUsd != null && store) {
    assertWithinBudget({ store: store, runUsd: costUsd });
  }

  const entry = {
    id: (raw && raw.id) || ("LED-" + randomUUID()),
    timestamp: timestamp,
    workspaceId: (raw && raw.workspaceId) || null,
    agentId: (raw && raw.agentId) || null,
    role: (raw && raw.role) || null,
    version: (raw && (raw.version || raw.versionId)) || null,
    operation: (raw && raw.operation) || "unknown",
    model: (raw && raw.model) || null,
    providerRequestId: (raw && (raw.providerRequestId || raw.requestId)) || null,
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    costStatus: costStatus,
    costUsd: costUsd,
    pricingSource: costStatus === "estimated" ? pricing.status : (kind === "fixture" ? "fixture" : "unavailable"),
    pricingSourceNote: pricing.note,
    resultStatus: (raw && raw.resultStatus) || "ok",
    kind: kind,
    note: (raw && raw.note) || null,
    objectiveId: (raw && raw.objectiveId) || null,
  };

  if (store && store.putSpendLedgerEntry) store.putSpendLedgerEntry(entry);
  if (store && store.addSpend && costStatus === "estimated" && costUsd != null && raw && raw.skipDaySpend !== true) {
    store.addSpend({
      at: timestamp,
      runId: entry.id,
      kind: kind,
      usd: costUsd,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
    });
  }
  return entry;
}

export function ownerSpendView(store, workspaceId) {
  const limits = spendLimits();
  const entries = (store && store.listSpendLedger ? store.listSpendLedger(workspaceId) : []).slice()
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const estimated = entries.filter((e) => e.costStatus === "estimated" && e.costUsd != null);
  const unknown = entries.filter((e) => e.costStatus === "unknown");
  const live = entries.filter((e) => e.kind === "live");
  const fixture = entries.filter((e) => e.kind === "fixture");
  const estimatedUsd = estimated.reduce((s, e) => s + Number(e.costUsd || 0), 0);
  const day = utcDay();
  const dayUsd = store && store.daySpend ? Number(store.daySpend(day).usd || 0) : 0;
  return {
    persistence: "FILE_STORE",
    workspaceId: workspaceId || null,
    limits: limits,
    preservedCaps: { maxUsdPerRun: limits.maxUsdPerRun, maxUsdPerDay: limits.maxUsdPerDay },
    day: day,
    dayUsd: dayUsd,
    entries: entries,
    totals: {
      estimatedUsd: Math.round(estimatedUsd * 1e6) / 1e6,
      unknownCostCount: unknown.length,
      liveCount: live.length,
      fixtureCount: fixture.length,
      entryCount: entries.length,
    },
    pricingSource: pricingSourceStatus(),
    note: "Estimated USD only when the provider sent tokens and a pricing source is known. Never fabricated exact dollars. Fixture rows are cost-unknown.",
  };
}

export function assertResearchSpendCap(store, request) {
  const max = Number(request && request.maxSpendUsd);
  if (!Number.isFinite(max) || max < 0) return;
  const view = ownerSpendView(store, request.workspaceId);
  if (view.dayUsd >= max && max === 0 && request.kind === "live") {
    const err = new Error("BUDGET_ABORT: research maxSpendUsd is 0; live research refused.");
    err.code = "BUDGET_ABORT";
    throw err;
  }
  const limits = spendLimits();
  if (view.dayUsd >= limits.maxUsdPerDay) {
    const err = new Error("BUDGET_ABORT: day spend reached cap.");
    err.code = "BUDGET_ABORT";
    throw err;
  }
}
