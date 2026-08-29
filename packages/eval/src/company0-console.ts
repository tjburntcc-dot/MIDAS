/**
 * The Company 0 decision console: the data behind the owner's screen.
 *
 * Everything here is a projection of something already in the repository. It
 * computes two things and reads the rest: a submission date parsed out of the
 * evidence that states it, and how that date sits against the objective's own
 * date. Both carry the raw wording they came from, because a parsed date the
 * owner cannot check is worse than no date.
 *
 * What it deliberately does not do is score, rank, estimate or predict. There
 * is no readiness number, no fit percentage, no expected revenue and no
 * probability, because MIDAS does not know any of those and a console that
 * displays them teaches the owner to trust a decoration. Where a field is not
 * known it says UNKNOWN and says why.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import {
  COMPANY0_OBJECTIVE, COMPANY0_CLAIMS, COMPANY0_UNKNOWNS, SHADOW_TODAY,
  OPPORTUNITY_EVIDENCE, houstonPacket, workerPacketFingerprint,
} from "./company0-shadow.ts";
import type { OpportunityPacket, EvidenceItem } from "./company0-shadow.ts";

export const CONSOLE_VERSION = "company0-console-v0";
/** The objective's own date, taken from the objective rather than restated. */
export const OBJECTIVE_DATE = "2026-10-01";

// ------------------------------------------------------------- Company 0

/**
 * The company screen. One row per thing the owner would ask about, each
 * carrying how it is known rather than presenting everything as equally solid.
 */
export function companyView() {
  const byId = (id: string) => COMPANY0_CLAIMS.find((c) => c.id === id);
  const row = (label: string, id: string) => {
    const c = byId(id);
    return c
      ? { label, value: c.statement, knownAs: c.claimClass, source: c.source, note: c.note || null, claimId: c.id }
      : { label, value: "UNKNOWN", knownAs: "unknown", source: "not recorded", note: null, claimId: null };
  };
  return {
    objective: COMPANY0_OBJECTIVE,
    objectiveDate: OBJECTIVE_DATE,
    asOf: SHADOW_TODAY,
    rows: [
      row("Capital at risk", "C0-02"),
      row("Owner time", "C0-03"),
      row("Customers", "C0-04"),
      row("Verified revenue", "C0-05"),
      row("Offer", "C0-06"),
      row("Niche", "C0-07"),
      row("Outreach so far", "C0-08"),
      row("Payment readiness", "C0-09"),
      row("Legal entity", "C0-10"),
      row("Authorised signer", "C0-16"),
      row("Capability", "C0-11"),
      row("Delivery record", "C0-20"),
      row("Distribution", "C0-12"),
      row("Logistics", "C0-13"),
      row("Authority", "C0-14"),
      row("Adult involvement", "C0-15"),
      row("Open channel", "C0-17"),
      row("Closed channels", "C0-18"),
    ],
    unknowns: COMPANY0_UNKNOWNS,
    unknownCount: COMPANY0_CLAIMS.filter((c) => c.claimClass === "unknown").length + COMPANY0_UNKNOWNS.length,
  };
}

// ---------------------------------------------------------- opportunities

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => (n < 10 ? "0" + n : String(n));

/** Every ISO date a fragment states, in whatever way it states it. */
function datesIn(fragment: string) {
  const out: string[] = [];
  const s = String(fragment || "");
  for (const m of s.matchAll(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/g)) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) out.push(m[3] + "-" + pad(mo) + "-" + pad(Number(m[2])));
  }
  for (const m of s.matchAll(/(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/g)) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) out.push(m[3] + "-" + pad(mo) + "-" + pad(Number(m[1])));
  }
  for (const m of s.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)) {
    out.push(m[3] + "-" + pad(Number(m[1])) + "-" + pad(Number(m[2])));
  }
  return [...new Set(out)];
}

const CLOSING_CUE = /(due|deadline|closes|close date|submitted by|submission)/i;

/**
 * The submission date, parsed only from the clause that states a closing.
 *
 * A posting date and a closing date sit in the same sentence, so the parse is
 * restricted to the clause carrying a closing cue and takes the latest date in
 * it. The wording it read is always returned with it: a date the owner cannot
 * check against the source is not evidence, it is a claim by the console.
 */
export function submissionDate(evidence: EvidenceItem[]) {
  for (const e of evidence) {
    const text = String(e.text || "");
    const clauses = text.split(/[;.]\s+/).filter((c) => CLOSING_CUE.test(c));
    const dates = clauses.flatMap((c) => datesIn(c)).sort();
    if (dates.length) {
      return { date: dates[dates.length - 1], statedAs: text.trim(), evidenceId: e.id, parsed: true };
    }
  }
  return { date: null as string | null, statedAs: null as string | null, evidenceId: null as string | null, parsed: false };
}

export const OBJECTIVE_FIT = [
  "CLOSED_BEFORE_TODAY",
  "SUBMISSION_CLOSES_AFTER_OBJECTIVE_DATE",
  "SUBMISSION_OPEN_BEFORE_OBJECTIVE_DATE",
  "UNKNOWN",
] as const;

/**
 * How the stated closing date sits against the objective's own date.
 *
 * Arithmetic on two dates, not a judgement. It never says an opportunity is
 * good or bad, and the open case is careful: a submission window that closes in
 * time says nothing about when an award or a payment would arrive, and the note
 * says so rather than letting the owner read it as revenue.
 */
export function objectiveFit(evidence: EvidenceItem[], today = SHADOW_TODAY, objectiveDate = OBJECTIVE_DATE) {
  const sub = submissionDate(evidence);
  if (!sub.date) {
    return { fit: "UNKNOWN", why: "No closing date is stated in the evidence held.", submission: sub };
  }
  if (sub.date < today) {
    return { fit: "CLOSED_BEFORE_TODAY", why: "Submissions closed " + sub.date + ", before today (" + today + ").", submission: sub };
  }
  if (sub.date > objectiveDate) {
    return {
      fit: "SUBMISSION_CLOSES_AFTER_OBJECTIVE_DATE",
      why: "Submissions close " + sub.date + ", after the objective's date of " + objectiveDate + ". Nothing submitted here can be awarded or paid before the objective's date.",
      submission: sub,
    };
  }
  return {
    fit: "SUBMISSION_OPEN_BEFORE_OBJECTIVE_DATE",
    why: "Submissions close " + sub.date + ", on or before the objective's date of " + objectiveDate + ". When an award would be made, and when it would pay, is UNKNOWN.",
    submission: sub,
  };
}

/**
 * The budget, as the evidence states it. Verbatim; no figure is parsed out.
 *
 * A line that says the budget is not stated is not a budget. It comes back as
 * unknown with the wording attached, because "budget: not stated in the source"
 * displayed under a heading called Known economics reads, at a glance, as though
 * something were known.
 */
export function statedBudget(evidence: EvidenceItem[]) {
  for (const e of evidence) {
    const text = String(e.text || "");
    if (!/budget/i.test(text)) continue;
    const absent = /not stated|no budget|unstated|not specified|not disclosed/i.test(text);
    return {
      statedAs: absent ? null : text.trim(),
      absenceStatedAs: absent ? text.trim() : null,
      evidenceId: e.id,
    };
  }
  return { statedAs: null as string | null, absenceStatedAs: null as string | null, evidenceId: null as string | null };
}

function workItems() {
  const p = repoPath("var", "state", "work_items.json");
  if (!existsSync(p)) return [] as any[];
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function evidenceOf(item: any): EvidenceItem[] {
  return (item.evidence || []).map((e: any) => ({
    id: String(e.id), text: String(e.text || ""), source: String(e.source || "posting"),
    url: e.url, capturedAt: String((item.source && item.source.discoveredAt) || item.createdAt || "unknown").slice(0, 10),
  }));
}

/** A work item, as something the chain can be pointed at. */
export function opportunityPacketFor(id: string): OpportunityPacket | null {
  if (id === houstonPacket().workItemId) return houstonPacket();
  const item = workItems().find((w: any) => w.id === id);
  if (!item) return null;
  const src = item.source || {};
  const ver = item.sourceVerification || {};
  return {
    workItemId: item.id,
    title: String(item.title || "untitled"),
    buyer: String(src.note || "UNKNOWN"),
    channel: String(item.type || "commercial_opportunity"),
    sourceUrl: String(src.url || "UNKNOWN"),
    sourceKind: String(src.kind || "unknown") + ". The buyer's own posting has not necessarily been retrieved.",
    livenessCheck: ver.status
      ? "HTTP " + ver.status + " at " + String(ver.at || "unknown") + (ver.relevant ? "; the page contained solicitation language." : ".")
      : "Not checked.",
    evidence: evidenceOf(item),
  };
}

/**
 * The list. Only fields that are actually known, plus the two derived date
 * facts. No score, no rank, no estimated value.
 */
export function listOpportunities() {
  const rows = workItems().map((item: any) => {
    const packet = opportunityPacketFor(item.id)!;
    const fit = objectiveFit(packet.evidence);
    const q = (item.outputs && (item.outputs.requalify || item.outputs.qualifying)) || null;
    const blockers = q ? [...(q.disqualifiers || []), ...(q.missing_information || [])] : [];
    return {
      id: item.id,
      title: packet.title,
      buyer: packet.buyer,
      type: String(item.type || "UNKNOWN"),
      sourceUrl: packet.sourceUrl,
      sourceVerified: Boolean(item.sourceVerification && item.sourceVerification.status === 200),
      state: String(item.state || "UNKNOWN"),
      evidenceCount: packet.evidence.length,
      submission: fit.submission,
      objectiveFit: fit.fit,
      objectiveFitWhy: fit.why,
      statedBudget: statedBudget(packet.evidence).statedAs,
      majorBlocker: blockers.length ? blockers.join(", ") : "UNKNOWN",
      blockerSource: q ? "recorded by the qualifier on " + String(item.updatedAt || "").slice(0, 10) : "no qualification recorded",
      runs: runsFor(item.id).length,
    };
  });
  // Anything with a closing date first, soonest first; unknown dates last.
  return rows.sort((a, b) => {
    const ad = a.submission.date || "9999";
    const bd = b.submission.date || "9999";
    return ad < bd ? -1 : ad > bd ? 1 : a.id < b.id ? -1 : 1;
  });
}

export function opportunityDetail(id: string) {
  const packet = opportunityPacketFor(id);
  if (!packet) return null;
  const item = workItems().find((w: any) => w.id === id) || null;
  const fit = objectiveFit(packet.evidence);
  const q = item && item.outputs ? (item.outputs.requalify || item.outputs.qualifying) : null;
  const prior = item && item.outputs ? item.outputs.research : null;
  const contradictions: string[] = [];
  if (item && item.outputs && item.outputs.qualifying && item.outputs.requalify) {
    const a = item.outputs.qualifying, b = item.outputs.requalify;
    if (a.close_probability_pct !== b.close_probability_pct || a.payment_probability_pct !== b.payment_probability_pct) {
      contradictions.push(
        "Two qualification passes on the same evidence produced different probability figures ("
        + a.close_probability_pct + "/" + a.payment_probability_pct + " then "
        + b.close_probability_pct + "/" + b.payment_probability_pct
        + "). Both are model estimates with nothing observed behind them and neither is shown as a probability anywhere in this console.");
    }
  }
  return {
    packet,
    objectiveFit: fit,
    statedBudget: statedBudget(packet.evidence),
    state: item ? String(item.state || "UNKNOWN") : "UNKNOWN",
    priorQualification: q
      ? { decision: q.decision, missing: q.missing_information || [], disqualifiers: q.disqualifiers || [], rationale: q.rationale || "" }
      : null,
    priorResearch: prior || null,
    contradictions,
    unknowns: [
      ...(q && q.missing_information ? q.missing_information.map((m: string) => "Not stated anywhere in the evidence: " + m) : []),
      ...(fit.fit === "UNKNOWN" ? ["No closing date is stated in the evidence held."] : []),
      "When an award would be made, and when it would pay.",
    ],
    history: runsFor(id).map(runSummary),
    isFrozenCase: id === houstonPacket().workItemId,
  };
}

// -------------------------------------------------------------- run store

const RUNS_PATH = () => repoPath("var", "state", "company0-console-runs.json");

export const OWNER_DISPOSITIONS = ["NONE", "ACKNOWLEDGED", "MARKED_FOR_ACTION", "APPROVED_FOR_PREPARATION"] as const;
export const OUTCOME_STATES = [
  "NOT_STARTED", "STARTED", "COMPLETED", "NO_RESPONSE", "RESPONSE",
  "REJECTED", "MEETING", "SALE", "OTHER",
] as const;

export function loadRuns(): any[] {
  const p = RUNS_PATH();
  if (!existsSync(p)) return [];
  try { const d = JSON.parse(readFileSync(p, "utf8")); return Array.isArray(d) ? d : []; } catch { return []; }
}

function writeRuns(runs: any[]) {
  const p = RUNS_PATH();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(runs, null, 1));
}

export function saveRun(run: any) {
  const runs = loadRuns();
  const i = runs.findIndex((r) => r.runId === run.runId);
  if (i >= 0) runs[i] = run; else runs.push(run);
  writeRuns(runs);
  return run;
}

export function getRun(runId: string) {
  return loadRuns().find((r) => r.runId === runId) || null;
}

export function runsFor(opportunityId: string) {
  return loadRuns().filter((r) => r.opportunityId === opportunityId)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

export function inputFingerprint(packet: OpportunityPacket) {
  return createHash("sha256")
    .update(JSON.stringify({ company: workerPacketFingerprint(), opportunity: packet }))
    .digest("hex").slice(0, 12);
}

/**
 * Owner disposition. An internal decision and nothing else.
 *
 * APPROVED_FOR_PREPARATION is the strongest state that exists, and it
 * authorises preparing work inside the building. There is deliberately no
 * state that means send, submit, apply or pay, and no code path that could act
 * on one if it existed.
 */
export function setDisposition(runId: string, disposition: string, note?: string) {
  if (!(OWNER_DISPOSITIONS as readonly string[]).includes(disposition)) {
    throw new Error("not an owner disposition: " + disposition);
  }
  const run = getRun(runId);
  if (!run) throw new Error("no such run: " + runId);
  run.owner = {
    disposition,
    note: note ? String(note).slice(0, 2000) : null,
    at: new Date().toISOString(),
    externalActionAuthorised: false,
  };
  return saveRun(run);
}

/**
 * What actually happened, recorded by the owner.
 *
 * The beginning of the outcome loop and no more than that: nothing here learns
 * from it, adjusts anything, or feeds back into a worker. It exists so that
 * when a prediction is eventually worth comparing against reality, the reality
 * is already written down.
 */
export function recordOutcome(runId: string, outcome: { state: string; verifiedRevenueUsd?: number | null; observed?: string; notes?: string }) {
  if (!(OUTCOME_STATES as readonly string[]).includes(outcome.state)) {
    throw new Error("not an outcome state: " + outcome.state);
  }
  const run = getRun(runId);
  if (!run) throw new Error("no such run: " + runId);
  const revenue = outcome.verifiedRevenueUsd === undefined || outcome.verifiedRevenueUsd === null
    ? null : Number(outcome.verifiedRevenueUsd);
  if (revenue !== null && (!isFinite(revenue) || revenue < 0)) throw new Error("verified revenue must be a real non-negative number");
  run.outcome = {
    state: outcome.state,
    verifiedRevenueUsd: revenue,
    observed: outcome.observed ? String(outcome.observed).slice(0, 4000) : null,
    notes: outcome.notes ? String(outcome.notes).slice(0, 4000) : null,
    recordedAt: new Date().toISOString(),
    recordedBy: "owner",
  };
  return saveRun(run);
}

// ------------------------------------------------------------ result view

/** The decision, arranged the way the owner needs to read it. */
export function resultView(run: any) {
  const d = (run && run.stages && run.stages.manager && run.stages.manager.parsed) || {};
  const audit = (run && run.stages && run.stages.auditor && run.stages.auditor.report) || null;
  const research = (run && run.stages && run.stages.researcher && run.stages.researcher.parsed) || {};
  const chosen = (d.candidateActions || []).find((c: any) => c.action === d.selectedAction) || {};
  const verdict = audit ? String(audit.verdict || "") : null;
  const defects = audit ? (audit.criticalDefects || []) : [];
  return {
    recommendedAction: d.selectedAction || "UNKNOWN",
    whyThisAction: d.whyThisWinsNow || "UNKNOWN",
    whyNotAlternatives: d.whyNotAlternatives || "UNKNOWN",
    bindingBottleneck: d.bindingBottleneck || "UNKNOWN",
    bottleneckReasoning: d.bottleneckReasoning || "UNKNOWN",
    keyEvidence: d.facts || [],
    counterEvidence: [...(d.conflicts || []), ...(research.facts_not_stated || [])],
    materialUnknowns: d.unknowns || [],
    assumptions: d.assumptions || [],
    capitalAtRisk: chosen.capitalRequired || "UNKNOWN",
    ownerTime: chosen.timeToFeedback || "UNKNOWN",
    ownerActionRequired: d.ownerActionRequired || "UNKNOWN",
    authorityRequired: typeof d.authorityRequired === "boolean" ? d.authorityRequired : "UNKNOWN",
    reversibility: chosen.reversibility || "UNKNOWN",
    falsifier: d.falsifier || "UNKNOWN",
    reassessmentTrigger: d.reassessmentTrigger || "UNKNOWN",
    deferOrIgnore: d.deferOrIgnore || [],
    options: (d.candidateActions || []).map((c: any) => ({
      action: c.action, rationale: c.rationale, chosen: c.action === d.selectedAction,
      reason: c.reasonToRejectOrSelect || null,
    })),
    audit: {
      verdict: verdict || "UNKNOWN",
      defects,
      reasoning: audit ? audit.reasoning || "" : "",
      recordsOpened: (run && run.stages && run.stages.auditor && run.stages.auditor.opened) || [],
      cleared: verdict === "pass",
      objected: verdict === "fail",
      undetermined: verdict === "insufficient_evidence" || !verdict,
    },
    finalStatus: verdict === "pass" ? "CLEARED_BY_AUDIT"
      : verdict === "fail" ? "NOT_CLEARED"
        : "AUDIT_UNDETERMINED",
  };
}

export function runSummary(run: any) {
  const v = resultView(run);
  return {
    runId: run.runId,
    opportunityId: run.opportunityId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    stage: run.stage,
    inputFingerprint: run.inputFingerprint,
    recommendedAction: run.stage === "COMPLETE" ? v.recommendedAction : null,
    auditDisposition: run.stage === "COMPLETE" ? v.audit.verdict : null,
    finalStatus: run.stage === "COMPLETE" ? v.finalStatus : null,
    ownerDisposition: (run.owner && run.owner.disposition) || "NONE",
    outcome: (run.outcome && run.outcome.state) || null,
    verifiedRevenueUsd: (run.outcome && run.outcome.verifiedRevenueUsd) ?? null,
    historical: Boolean(run.historical),
    note: run.note || null,
  };
}

/** Fields the console must never invent. Asserted by test, not by intention. */
export const FORBIDDEN_CONSOLE_FIELDS = [
  "roi", "expectedRevenue", "confidenceScore", "readinessScore", "fitScore",
  "winProbability", "closeProbability", "progressPercent", "healthScore",
];
