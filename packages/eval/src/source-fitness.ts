/** Source fitness BEFORE model extraction. Legitimate ≠ relevant. .gov ≠ useful. */

import { looksLikeBoilerplate, looksLikeVideoPlaceholder } from "./html-extract.ts";
import {
  claimSupportsBrief,
  isCompensationText,
  isBuyingSignalOperationalText,
  isCommunityLocalText,
  isVideoPlaceholderText,
} from "./research-brief.ts";

export const FITNESS_DISPOSITIONS = [
  "strong_fit",
  "partial_fit",
  "weak_fit",
  "irrelevant",
  "inaccessible",
  "insufficient_substantive_content",
];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listSourceFitness ? store.listSourceFitness() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function sourceTextOf(source, extraction) {
  return String(
    (extraction && extraction.substantiveText)
    || (source && (source.substantiveText || source.sanitizedText || source.excerpt || source.captureNote))
    || ""
  );
}

export function evaluateSourceFitness(store, payload) {
  const source = (payload && payload.source) || {};
  const brief = payload && payload.brief;
  const extraction = (payload && payload.extraction) || source.extraction || null;
  const title = String((extraction && extraction.title) || source.title || "");
  const blocks = (extraction && extraction.blocks) || [];
  const headings = blocks.filter((b) => b && b.kind === "heading").map((b) => b.text);
  const paragraphs = blocks.filter((b) => b && (b.kind === "paragraph" || b.kind === "list")).map((b) => b.text);
  const tables = blocks.filter((b) => b && b.kind === "table").map((b) => b.text);
  const text = sourceTextOf(source, extraction);
  const url = String(source.url || source.originalUrl || "");
  const gov = /\.gov\b/i.test(url) || /official website/i.test(title + " " + text.slice(0, 200));
  const family = brief && brief.questionFamily;
  const classification = source.classification || source.sourceClassification || null;
  const inaccessible = classification === "unavailable_source"
    || (source.fetchStatus && source.fetchStatus !== "ok" && !text.trim());
  let disposition = "weak_fit";
  let reason = "Source inspected against the current research brief.";
  const inspection = {
    title: title || null,
    headings: headings.slice(0, 12),
    paragraphCount: paragraphs.length,
    tableCount: tables.length,
    sourceType: classification,
    govHost: gov,
    objectiveTermsPresent: Boolean(brief && claimSupportsBrief(text + " " + title, brief)),
    compensationPresent: isCompensationText(text + " " + title),
    operationalPresent: isBuyingSignalOperationalText(text + " " + title),
    communityLocalPresent: isCommunityLocalText(text + " " + title),
    videoPlaceholder: isVideoPlaceholderText(text) || looksLikeVideoPlaceholder(text),
    boilerplate: looksLikeBoilerplate(text.slice(0, 280)),
  };

  if (inaccessible) {
    disposition = "inaccessible";
    reason = "Source could not be fetched or has no usable body.";
  } else if (!text.trim() || (looksLikeBoilerplate(text) && text.length < 80) || (inspection.videoPlaceholder && !inspection.operationalPresent && !inspection.compensationPresent && !inspection.communityLocalPresent)) {
    disposition = "insufficient_substantive_content";
    reason = "Extract is chrome, video-placeholder, or otherwise non-substantive.";
  } else if (family === "buying_signal" && inspection.compensationPresent && !inspection.operationalPresent) {
    disposition = "irrelevant";
    reason = "Legitimate occupational or compensation information, but it does not address the current buying-signal / operations question. A .gov host is not usefulness.";
  } else if (family === "labor_cost" && inspection.compensationPresent) {
    disposition = inspection.boilerplate ? "partial_fit" : "strong_fit";
    reason = "Compensation evidence matches the current labor-cost question.";
  } else if (family === "buying_signal" && inspection.operationalPresent && !inspection.compensationPresent) {
    disposition = "strong_fit";
    reason = "Operational estimating / software / workflow evidence matches the current buying-signal question.";
  } else if (family === "buying_signal" && inspection.operationalPresent && inspection.compensationPresent) {
    disposition = "partial_fit";
    reason = "Mixed page: some operational evidence and some off-question compensation text. Fitness is not all-or-nothing.";
  } else if (family === "community_local" && inspection.communityLocalPresent) {
    disposition = inspection.boilerplate ? "partial_fit" : "strong_fit";
    reason = "Library / community / bulletin / program evidence matches the current local outreach question.";
  } else if (inspection.objectiveTermsPresent) {
    disposition = "partial_fit";
    reason = "Some objective-relevant language is present.";
  } else {
    disposition = "irrelevant";
    reason = "No objective-relevant evidence for the current question. Legitimate publication is not relevance.";
  }

  const record = {
    id: (payload && payload.id) || nextId(store, "FIT-"),
    workspaceId: (source && source.workspaceId) || (brief && brief.workspaceId) || null,
    sourceId: source.id || null,
    requestId: (payload && payload.requestId) || (brief && brief.requestId) || null,
    objectiveId: (payload && payload.objectiveId) || (brief && brief.objectiveId) || null,
    briefId: brief && brief.id || null,
    disposition: disposition,
    reason: reason,
    inspection: inspection,
    govIsNotUsefulness: true,
    legitimateIsNotRelevant: true,
    createdAt: nowIso(),
  };
  if (store && store.putSourceFitness) store.putSourceFitness(record);
  return record;
}

export function sourceHasObjectiveRelevantEvidence(fitness) {
  return fitness && (fitness.disposition === "strong_fit" || fitness.disposition === "partial_fit");
}
