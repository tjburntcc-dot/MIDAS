/**
 * The owner approval queue.
 *
 * External action is the boundary MIDAS does not cross on its own. Everything
 * upstream of this is autonomous; everything at it waits for a person.
 *
 * The queue is built so a decision can be made quickly and safely: what the
 * opportunity is, where it came from, what the workers concluded and on what
 * evidence, what the audit tried to falsify, what is still unknown, and what
 * exactly would be sent. A queue that only showed the message would be asking
 * for approval of a conclusion whose basis is hidden.
 */
import { listWorkItems, expectedValueScore } from "./work-item.ts";

export interface ApprovalEntry {
  workItemId: string;
  title: string;
  sourceUrl: string | null;
  discoveredAt: string | null;
  whatTheyNeed: string;
  factsFound: Record<string, { stated: boolean; value: string | null }>;
  factsMissing: string[];
  qualification: { decision: string | null; rationale: string | null; disqualifiers: string[] };
  economics: any;
  expectedCashUsd: number;
  founderHours: number;
  proposedAction: { channel: string; subject: string; message: string; scopeOffered: string; priceBasis: string; nextAction: string };
  claimsMade: string[];
  audit: { verdict: string; unsupportedClaims: string[]; fabrications: string[]; complianceIssues: string[]; reasons: string };
  risks: string[];
  uncertainty: string[];
  provenance: Array<{ at: string; from: string; to: string; by: string; worker: string | null; version: string | null; reason: string }>;
  costToDateUsd: number;
  modelCalls: number;
}

/** Nothing here mutates anything. Reading the queue must never advance work. */
export function buildApprovalQueue(store: any, workspaceId: string): ApprovalEntry[] {
  const items = listWorkItems(store, workspaceId).filter((w) => w.state === "awaiting_approval");
  const entries = items.map((w) => {
    const research = w.outputs?.research || {};
    const qual = w.outputs?.qualified || w.outputs?.requalify || w.outputs?.qualifying || {};
    const draft = w.outputs?.working || {};
    const audit = w.outputs?.awaiting_approval || {};
    const ev = expectedValueScore(w);
    const facts = research.facts || {};
    const factsFound: Record<string, any> = {};
    for (const k of Object.keys(facts)) {
      factsFound[k] = { stated: Boolean(facts[k]?.stated), value: facts[k]?.stated ? facts[k].value : null };
    }
    return {
      workItemId: w.id,
      title: w.title,
      sourceUrl: w.source?.url || null,
      discoveredAt: w.source?.discoveredAt || w.createdAt,
      whatTheyNeed: research.scope_summary || (w.evidence.find((e: any) => e.id === "E1") || {}).text || w.title,
      factsFound,
      factsMissing: research.facts_not_stated || [],
      qualification: {
        decision: qual.decision || null,
        rationale: qual.rationale ? String(qual.rationale).slice(0, 500) : null,
        disqualifiers: qual.disqualifiers || [],
      },
      economics: w.economics || {},
      expectedCashUsd: Number(ev.expectedCash.toFixed(2)),
      founderHours: Number(ev.founderHours.toFixed(2)),
      proposedAction: {
        channel: draft.channel || "unknown",
        subject: draft.subject || "",
        message: draft.message || "",
        scopeOffered: draft.scope_offered || "",
        priceBasis: draft.price_basis || "",
        nextAction: draft.next_action || "",
      },
      claimsMade: draft.claims_made || [],
      audit: {
        verdict: audit.verdict || "unknown",
        unsupportedClaims: audit.unsupported_claims || [],
        fabrications: audit.fabrications || [],
        complianceIssues: audit.compliance_issues || [],
        reasons: audit.reasons || "",
      },
      risks: (qual.disqualifiers || []).concat(audit.compliance_issues || []),
      uncertainty: (research.unresolved_questions || []).concat(draft.assumptions || []),
      provenance: (w.history || []).map((h: any) => ({
        at: h.at, from: h.from || "", to: h.to, by: h.by,
        worker: h.workerRoleId || null, version: h.workerVersionId || null,
        reason: String(h.reason || "").slice(0, 200),
      })),
      costToDateUsd: Number((w.cost?.usd || 0).toFixed(4)),
      modelCalls: w.cost?.modelCalls || 0,
    };
  });
  // Highest expected cash per founder hour first: the queue is a spending
  // decision about the owner's attention, not a list of everything pending.
  return entries.sort((a, b) => b.expectedCashUsd / Math.max(0.25, b.founderHours) - a.expectedCashUsd / Math.max(0.25, a.founderHours));
}

/**
 * Company operating summary. Deliberately small: what is the objective, what is
 * stuck, what needs a decision, and what has it cost.
 */
export function companySummary(store: any, workspaceId: string) {
  const ws = store.getWorkspace(workspaceId);
  const items = listWorkItems(store, workspaceId);
  const byState: Record<string, number> = {};
  let usd = 0;
  let calls = 0;
  let minutes = 0;
  for (const w of items) {
    byState[w.state] = (byState[w.state] || 0) + 1;
    usd += Number(w.cost?.usd || 0);
    calls += Number(w.cost?.modelCalls || 0);
    minutes += Number(w.cost?.humanMinutes || 0);
  }
  const awaiting = items.filter((w) => w.state === "awaiting_approval");
  const pipelineCash = items
    .filter((w) => ["qualified", "ready_for_work", "working", "awaiting_approval"].includes(w.state))
    .reduce((a, w) => a + expectedValueScore(w).expectedCash, 0);
  return {
    company: ws ? ws.name : workspaceId,
    objective: ws ? ws.goal : null,
    workItems: items.length,
    byState,
    awaitingApproval: awaiting.length,
    expectedCashInPipelineUsd: Number(pipelineCash.toFixed(2)),
    // Verified revenue is cash actually received. Nothing has been sent, so this
    // is zero and must be reported as zero.
    verifiedRevenueUsd: items.filter((w) => w.state === "paid" || w.state === "won").reduce((a, w) => a + Number(w.outcome?.cashCollectedUsd || 0), 0),
    modelCostUsd: Number(usd.toFixed(4)),
    modelCalls: calls,
    humanMinutes: minutes,
    outboundActionsTaken: items.filter((w) => ["executed", "waiting_external"].includes(w.state)).length,
  };
}
