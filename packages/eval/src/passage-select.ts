/** Split substantive content into bounded passages and rank against the current brief. */

import { createHash } from "node:crypto";
import { looksLikeBoilerplate, looksLikeVideoPlaceholder } from "./html-extract.ts";
import {
  claimSupportsBrief,
  isCompensationText,
  isBuyingSignalOperationalText,
  isCommunityLocalText,
  isVideoPlaceholderText,
} from "./research-brief.ts";

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listPassages ? store.listPassages() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function checksumOf(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex").slice(0, 16);
}

function blocksOf(source, extraction) {
  if (extraction && Array.isArray(extraction.blocks) && extraction.blocks.length) return extraction.blocks;
  const text = String((extraction && extraction.substantiveText) || (source && (source.substantiveText || source.excerpt)) || "");
  if (!text.trim()) return [];
  return text.split(/\n{2,}|\n/).map((t) => ({ kind: "paragraph", text: t.replace(/\s+/g, " ").trim() })).filter((b) => b.text.length >= 12);
}

function scorePassage(excerpt, heading, brief) {
  const blob = String(heading || "") + " " + String(excerpt || "");
  const deprioritizedReasons = [];
  let score = 0;
  if (isVideoPlaceholderText(blob) || looksLikeVideoPlaceholder(blob)) {
    deprioritizedReasons.push("video_placeholder");
    score -= 8;
  }
  if (looksLikeBoilerplate(blob)) {
    deprioritizedReasons.push("site_chrome");
    score -= 6;
  }
  if (/^menu$|^home$|^search$|^skip /i.test(String(excerpt || "").trim())) {
    deprioritizedReasons.push("navigation");
    score -= 6;
  }
  const family = brief && brief.questionFamily;
  if (family === "buying_signal") {
    if (isCompensationText(blob) && !isBuyingSignalOperationalText(blob)) {
      deprioritizedReasons.push("unrelated_occupational_compensation");
      score -= 5;
    }
    if (isBuyingSignalOperationalText(blob)) score += 6;
    if (claimSupportsBrief(blob, brief)) score += 4;
  } else if (family === "labor_cost") {
    if (isCompensationText(blob)) score += 6;
    if (claimSupportsBrief(blob, brief)) score += 4;
  } else if (family === "community_local") {
    // Prefer cues in the excerpt body; heading alone should not rescue off-topic wages/chrome.
    const bodyHits = isCommunityLocalText(excerpt);
    const strongBody = /west asheville|bulletin|flyer|after[- ]?school|music|meeting room|library hours|story time|calendar|program/i.test(String(excerpt || ""));
    if (bodyHits) score += 6;
    if (strongBody) score += 3;
    if (claimSupportsBrief(excerpt, brief)) score += 4;
    if (isCompensationText(excerpt) && !bodyHits) {
      deprioritizedReasons.push("unrelated_occupational_compensation");
      score -= 5;
    }
  } else if (claimSupportsBrief(blob, brief)) {
    score += 4;
  }
  return { score: score, deprioritizedReasons: deprioritizedReasons };
}

export function selectPassages(store, payload) {
  const source = (payload && payload.source) || {};
  const brief = payload && payload.brief;
  const extraction = (payload && payload.extraction) || source.extraction || null;
  const blocks = blocksOf(source, extraction);
  const passages = [];
  let heading = "";
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    if (!b || !b.text) continue;
    if (b.kind === "heading") {
      heading = b.text;
      continue;
    }
    const excerpt = String(b.text).replace(/\s+/g, " ").trim();
    if (excerpt.length < 12) continue;
    const nearby = [
      i > 0 ? blocks[i - 1] && blocks[i - 1].text : null,
      i + 1 < blocks.length ? blocks[i + 1] && blocks[i + 1].text : null,
    ].filter(Boolean).map((t) => String(t).slice(0, 120));
    const ranked = scorePassage(excerpt, heading, brief);
    const omit = ranked.score < 1 || ranked.deprioritizedReasons.includes("video_placeholder")
      || (brief && brief.questionFamily === "buying_signal" && ranked.deprioritizedReasons.includes("unrelated_occupational_compensation"))
      || (brief && brief.questionFamily === "community_local" && ranked.deprioritizedReasons.includes("unrelated_occupational_compensation"));
    passages.push({
      id: nextId(store, "PAS-") + "-" + String(i).padStart(2, "0"),
      workspaceId: source.workspaceId || (brief && brief.workspaceId) || null,
      sourceId: source.id || null,
      requestId: (payload && payload.requestId) || (brief && brief.requestId) || null,
      objectiveId: (payload && payload.objectiveId) || (brief && brief.objectiveId) || null,
      briefId: brief && brief.id || null,
      heading: heading || null,
      position: i,
      excerpt: excerpt.slice(0, 600),
      checksum: checksumOf(excerpt),
      nearbyContext: nearby,
      score: ranked.score,
      deprioritizedReasons: ranked.deprioritizedReasons,
      relevant: !omit && ranked.score >= 2,
      createdAt: nowIso(),
    });
  }
  passages.sort((a, b) => b.score - a.score);
  const relevant = passages.filter((p) => p.relevant);
  const omitted = passages.filter((p) => !p.relevant);
  const result = {
    sourceId: source.id || null,
    requestId: (payload && payload.requestId) || null,
    passages: passages,
    relevant: relevant,
    omitted: omitted,
    noActionableEvidence: relevant.length === 0,
    terminalStatus: relevant.length === 0 ? "completed_no_actionable_evidence" : null,
  };
  if (store && store.putPassage) {
    for (const p of passages) store.putPassage(p);
  }
  return result;
}
