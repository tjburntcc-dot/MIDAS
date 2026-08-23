/** Official search adapter. Search is not claimed live until a real web_search call succeeds. */

import { createHash } from "node:crypto";
import { loadWorkspaceEnv, OpenAIResponsesProvider, tokensFromResponse } from "@midas/model";
import { recordUsage } from "./spend-ledger.ts";
import { requireWorkspaceId } from "./workspace-isolation.ts";

export const SEARCH_PROVIDER_ID = "midas-search-provider-v1";
export const SEARCH_PROVIDER_STATUS_NOT_CONNECTED = "not-connected";
export const SEARCH_PROVIDER_STATUS_CONNECTED = "connected";

let lastConnection = {
  connected: false,
  status: SEARCH_PROVIDER_STATUS_NOT_CONNECTED,
  usefulOnTopic: false,
  officialSupportConfirmed: true,
  officialSupportSource: "https://developers.openai.com/api/docs/guides/tools-web-search",
  lastAttemptAt: null,
  lastError: null,
  lastQuery: null,
  lastLive: false,
  indexedPages: 0,
  acceptedUsefulPages: 0,
  rejectedOffTopicPages: 0,
};

export const SEARCH_PROVIDER_HONESTY = {
  connected: false,
  status: SEARCH_PROVIDER_STATUS_NOT_CONNECTED,
  usefulOnTopic: false,
  searchIntegrationExists: false,
  internetWideSearch: false,
  embeddings: false,
  vectorSearch: false,
  fixtureLabeledAsLive: false,
  officialTool: "responses.web_search",
  officialSupportConfirmedInDocs: true,
  persistOfficialUrlsIsNotUsefulOnTopic: true,
  note: "Docs confirm Responses API web_search for GPT-4.1. connected means official tool persisted URLs. usefulOnTopic means at least one accepted-useful on-topic page for the query. Owner URLs and approved-domain fetch are a different capability. No embeddings.",
};

export function searchProviderStatus(store) {
  if (store) hydrateSearchConnection(store);
  const connected = lastConnection.connected === true;
  const usefulOnTopic = lastConnection.usefulOnTopic === true;
  return {
    id: SEARCH_PROVIDER_ID,
    connected: connected,
    status: lastConnection.status,
    usefulOnTopic: usefulOnTopic,
    searchIntegrationExists: connected,
    internetWideSearch: usefulOnTopic,
    querySupported: connected,
    indexedPages: lastConnection.indexedPages,
    acceptedUsefulPages: lastConnection.acceptedUsefulPages,
    rejectedOffTopicPages: lastConnection.rejectedOffTopicPages,
    officialSupportConfirmed: lastConnection.officialSupportConfirmed,
    officialSupportSource: lastConnection.officialSupportSource,
    lastAttemptAt: lastConnection.lastAttemptAt,
    lastError: lastConnection.lastError,
    lastLive: lastConnection.lastLive === true,
    honesty: {
      ...SEARCH_PROVIDER_HONESTY,
      connected: connected,
      status: lastConnection.status,
      usefulOnTopic: usefulOnTopic,
      searchIntegrationExists: connected,
      internetWideSearch: usefulOnTopic,
    },
    note: !connected
      ? SEARCH_PROVIDER_HONESTY.note
      : usefulOnTopic
        ? "Official web_search persisted URLs and at least one accepted-useful on-topic page exists for a query. Owner-URL fetch is still not search. No embeddings."
        : "Official web_search persisted URLs (connected=true), but no accepted-useful on-topic page for the query yet. Persist is not useful-on-topic research success. Owner-URL fetch is still not search. No embeddings.",
  };
}

export const SEARCH_INTEGRATION_EXISTS = false;
export const SEARCH_PROVIDER_STATUS = SEARCH_PROVIDER_STATUS_NOT_CONNECTED;

function nowIso() {
  return new Date().toISOString();
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

const REJECT_PATTERNS = [
  { re: /chrome:|about:blank|javascript:/i, reason: "chrome_or_nav_placeholder" },
  { re: /\b(nav|navbar|menu|cookie banner|subscribe to newsletter)\b/i, reason: "nav_chrome" },
  { re: /\b(watch on youtube|video placeholder|click to play)\b/i, reason: "video_placeholder" },
  { re: /\b(minimum wage|hourly wage|salary.com|glassdoor)\b/i, reason: "irrelevant_wages" },
];

const OFF_TOPIC_DEV_PATTERNS = [
  { re: /developer\.chrome\.com|chrome\.google\.com\/webstore|devtools/i, reason: "off_topic_devtools" },
  { re: /developer\.apple\.com|webkit\.org|isinspectable|wkwebview/i, reason: "off_topic_webkit_inspect" },
  { re: /developers\.google\.com\/search|support\.google\.com\/webmasters|search\.console/i, reason: "off_topic_search_console" },
  { re: /chromium\.googlesource\.com|chromium\.org\/.*devtools|devtools_discovery/i, reason: "off_topic_chromium_inspect" },
  { re: /\b(inspect mode|chrome devtools|safari web inspector|javascriptcore|isinspectable)\b/i, reason: "off_topic_inspect_docs" },
];

/** Deterministic topic tokens from a library/community bulletin style Harbor query (and similar). */
export function topicTokensFromQuery(query) {
  const q = String(query || "").toLowerCase();
  const tokens = [];
  const add = (t) => { if (t && !tokens.includes(t)) tokens.push(t); };
  if (/\blibrary|libraries\b/.test(q)) { add("library"); add("libraries"); }
  if (/\bbulletin\b/.test(q)) add("bulletin");
  if (/\bafter[-\s]?school\b/.test(q)) { add("after-school"); add("after school"); add("afterschool"); }
  if (/\bcommunity\b/.test(q)) add("community");
  if (/\bprogram(s)?\b/.test(q)) add("program");
  if (/\bwest\s+asheville\b/.test(q)) { add("west asheville"); add("asheville"); }
  if (/\bbuncombe\b/.test(q)) add("buncombe");
  if (/\bpublic\s+library\b/.test(q)) add("public library");
  if (/\bcalendar|story\s*time|meeting\s*room\b/.test(q)) { add("calendar"); add("story time"); }
  // Generic local civic cues when query looks like a place+service bulletin search
  if (tokens.length === 0 && /\b(official site|community|programs?)\b/.test(q)) {
    add("community"); add("program");
  }
  return tokens;
}

export function isOffTopicDeveloperDoc(hit) {
  const url = String((hit && hit.url) || "");
  const title = String((hit && hit.title) || "");
  const excerpt = String((hit && hit.excerpt) || (hit && hit.snippet) || "");
  const blob = (title + " " + excerpt + " " + url).toLowerCase();
  for (const row of OFF_TOPIC_DEV_PATTERNS) {
    if (row.re.test(blob) || row.re.test(url)) return { offTopic: true, reason: row.reason };
  }
  return { offTopic: false, reason: null };
}

/**
 * A page is accepted-useful only if URL/title/excerpt is on-topic for the query
 * (e.g. library/community/bulletin/after-school for the Harbor query).
 * Developer-docs / DevTools / Search Console / WebKit isInspectable / Chromium inspect are rejects.
 */
export function classifyOnTopicRelevance(hit, query) {
  const url = String((hit && hit.url) || "");
  const title = String((hit && hit.title) || "");
  const excerpt = String((hit && hit.excerpt) || (hit && hit.snippet) || "");
  const blob = (title + " " + excerpt + " " + url).toLowerCase();
  const off = isOffTopicDeveloperDoc(hit);
  if (off.offTopic) {
    return {
      acceptedUseful: false,
      classification: "rejected_off_topic",
      reason: off.reason,
      onTopic: false,
    };
  }
  const tokens = topicTokensFromQuery(query);
  if (!tokens.length) {
    // No topic signal: do not claim useful-on-topic; still not a hard developer reject.
    return {
      acceptedUseful: false,
      classification: "rejected_off_topic",
      reason: "no_query_topic_tokens",
      onTopic: false,
    };
  }
  const hits = tokens.filter((t) => blob.includes(String(t).toLowerCase()));
  if (hits.length >= 1) {
    return {
      acceptedUseful: true,
      classification: "accepted_useful_on_topic",
      reason: "on_topic:" + hits.slice(0, 4).join(","),
      onTopic: true,
      matchedTokens: hits,
    };
  }
  return {
    acceptedUseful: false,
    classification: "rejected_off_topic",
    reason: "off_topic_no_query_overlap",
    onTopic: false,
  };
}

export function classifySearchHit(hit, query, extras) {
  const url = String((hit && hit.url) || "");
  const title = String((hit && hit.title) || "");
  const excerpt = String((hit && hit.excerpt) || (hit && hit.snippet) || "");
  const blob = (title + " " + excerpt + " " + url).toLowerCase();
  for (const row of REJECT_PATTERNS) {
    if (row.re.test(blob)) {
      return { accepted: false, classification: "rejected", reason: row.reason };
    }
  }
  const host = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();
  const sameDomain = extras && extras.sameDomainAs && host && host === String(extras.sameDomainAs).replace(/^www\./, "");
  if (sameDomain) {
    return { accepted: false, classification: "rejected", reason: "same_domain_as_corroboration" };
  }
  if (/(we are the leading|best-in-class|#1 platform|trusted by thousands)/i.test(excerpt)) {
    return { accepted: true, classification: "vendor_stated_claim", reason: "vendor_as_independent_refused", acceptedUseful: false, onTopic: false };
  }
  const topic = classifyOnTopicRelevance(hit, query);
  if (!topic.acceptedUseful) {
    return {
      accepted: false,
      classification: "rejected_off_topic",
      reason: topic.reason,
      acceptedUseful: false,
      onTopic: false,
    };
  }
  return {
    accepted: true,
    classification: "public_source_observation",
    reason: "accepted",
    acceptedUseful: true,
    onTopic: true,
    topicReason: topic.reason,
    matchedTokens: topic.matchedTokens || [],
  };
}

export function querySearchProvider(query, extras) {
  return {
    ok: false,
    connected: lastConnection.connected === true,
    status: lastConnection.status,
    searchIntegrationExists: lastConnection.connected === true,
    query: query == null ? null : String(query).slice(0, 400),
    results: [],
    fetched: false,
    live: lastConnection.lastLive === true && lastConnection.connected === true,
    fixture: false,
    fixtureFallback: false,
    workspaceId: extras && extras.workspaceId || null,
    error: lastConnection.connected
      ? null
      : "Search provider is not-connected. A real official web_search call has not succeeded.",
    note: "Do not treat this as a live search unless status is connected and live is true. Owner-provided URLs and approved-domain fetch are a different capability.",
    searched: [],
    opened: [],
    said: [],
    uncertain: ["Internet-wide search has not succeeded yet."],
    inferred: [],
  };
}

function normalizeHitUrl(url) {
  return String(url || "").trim().replace(/[.,;]+$/, "");
}

function addSearchHit(out, seen, hit) {
  const url = normalizeHitUrl(hit && hit.url);
  if (!url || (url.slice(0, 7).toLowerCase() !== "http://" && url.slice(0, 8).toLowerCase() !== "https://")) return;
  if (seen.has(url)) {
    const existing = out.find((h) => h.url === url);
    if (existing) {
      if (!existing.title && hit.title) existing.title = String(hit.title).slice(0, 240);
      if (!existing.excerpt && (hit.excerpt || hit.snippet)) {
        existing.excerpt = String(hit.excerpt || hit.snippet || "").replace(/\s+/g, " ").trim().slice(0, 400);
      }
    }
    return;
  }
  seen.add(url);
  out.push({
    url: url,
    title: String((hit && hit.title) || "").slice(0, 240),
    excerpt: String((hit && (hit.excerpt || hit.snippet)) || "").replace(/\s+/g, " ").trim().slice(0, 400),
  });
}

function stripMarkdownLinks(s) {
  let out = String(s || "");
  let from = 0;
  while (from < out.length) {
    const linkAt = out.indexOf("](http", from);
    if (linkAt < 0) break;
    const lb = out.lastIndexOf("[", linkAt);
    const end = out.indexOf(")", linkAt);
    if (lb >= 0 && end > linkAt) {
      out = out.slice(0, lb) + out.slice(end + 1);
      from = lb;
    } else {
      from = linkAt + 1;
    }
  }
  return out;
}

/** Pages in official tool output were previously dropped when URLs lived in markdown/citations, not structured url fields. */
export function extractSearchResults(raw, text) {
  const out = [];
  const seen = new Set();
  const httpRe = new RegExp("^https?://", "i");
  const walk = (node, depth) => {
    if (!node || depth > 12) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const type = String(node.type || "");
    const url = node.url || node.link || (node.action && node.action.url) || (node.citation && node.citation.url);
    const title = node.title || node.name || (node.citation && node.citation.title) || "";
    let excerpt = node.excerpt || node.snippet || node.summary || "";
    if (!excerpt && (type === "url_citation" || type === "citation") && node.text) excerpt = node.text;
    if (url) addSearchHit(out, seen, { url: url, title: title, excerpt: excerpt });
    if (Array.isArray(node.annotations)) for (const a of node.annotations) walk(a, depth + 1);
    if (Array.isArray(node.sources)) for (const s of node.sources) walk(s, depth + 1);
    if (Array.isArray(node.citations)) for (const c of node.citations) walk(c, depth + 1);
    if (Array.isArray(node.results)) for (const r of node.results) walk(r, depth + 1);
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(raw, 0);

  const src = String(text || (raw && typeof raw === "object" && raw.output_text) || "");
  if (src) {
    const titleMarker = "**Title:**";
    const excerptMarker = "**Excerpt:**";
    const urlMarker = "**URL:**";
    const parts = [];
    let cursor = 0;
    while (cursor < src.length) {
      const next = src.indexOf(titleMarker, cursor);
      if (next < 0) break;
      const following = src.indexOf(titleMarker, next + titleMarker.length);
      const block = src.slice(next, following < 0 ? src.length : following);
      parts.push(block);
      cursor = next + titleMarker.length;
    }
    if (!parts.length) parts.push(src);
    for (const block of parts) {
      const tIdx = block.indexOf(titleMarker);
      let title = "";
      if (tIdx >= 0) {
        const rest = block.slice(tIdx + titleMarker.length);
        title = rest.split(/\r?\n/)[0].trim();
      }
      const eIdx = block.indexOf(excerptMarker);
      let excerpt = "";
      if (eIdx >= 0) excerpt = block.slice(eIdx + excerptMarker.length);
      let url = "";
      const linkAt = block.indexOf("](http");
      if (linkAt >= 0) {
        const end = block.indexOf(")", linkAt);
        if (end > linkAt) url = block.slice(linkAt + 2, end);
      }
      if (!url) {
        const uIdx = block.indexOf(urlMarker);
        if (uIdx >= 0) {
          const candidate = block.slice(uIdx + urlMarker.length).split(/\r?\n/)[0].trim();
          if (httpRe.test(candidate)) url = candidate.replace(/[.,;]+$/, "");
        }
      }
      if (url && httpRe.test(url)) {
        excerpt = stripMarkdownLinks(excerpt).split("()").join("").replace(/["\u201c\u201d]/g, " ").replace(/\s+/g, " ").trim();
        addSearchHit(out, seen, { url: url, title: title, excerpt: excerpt });
      }
    }
    let from = 0;
    while (from < src.length) {
      const linkAt = src.indexOf("](http", from);
      if (linkAt < 0) break;
      const lb = src.lastIndexOf("[", linkAt);
      const end = src.indexOf(")", linkAt);
      if (lb >= 0 && end > linkAt) {
        addSearchHit(out, seen, { url: src.slice(linkAt + 2, end), title: src.slice(lb + 1, linkAt), excerpt: "" });
        from = end + 1;
      } else {
        from = linkAt + 1;
      }
    }
  }
  return out.slice(0, 12);
}

export function resetSearchConnectionForTests() {
  lastConnection.connected = false;
  lastConnection.status = SEARCH_PROVIDER_STATUS_NOT_CONNECTED;
  lastConnection.usefulOnTopic = false;
  lastConnection.lastLive = false;
  lastConnection.lastError = null;
  lastConnection.indexedPages = 0;
  lastConnection.acceptedUsefulPages = 0;
  lastConnection.rejectedOffTopicPages = 0;
  lastConnection.lastQuery = null;
  lastConnection.lastAttemptAt = null;
  return lastConnection;
}

export function hydrateSearchConnection(store) {
  const all = ((store && store.listSearchRecords && store.listSearchRecords()) || []).filter((r) => r && r.live === true);
  const withUrls = all.filter((r) => Array.isArray(r.urls) && r.urls.length > 0);
  if (!withUrls.length) {
    lastConnection.connected = false;
    lastConnection.status = SEARCH_PROVIDER_STATUS_NOT_CONNECTED;
    lastConnection.usefulOnTopic = false;
    lastConnection.acceptedUsefulPages = 0;
    lastConnection.rejectedOffTopicPages = 0;
    lastConnection.indexedPages = 0;
    return lastConnection;
  }
  lastConnection.connected = true;
  lastConnection.status = SEARCH_PROVIDER_STATUS_CONNECTED;
  lastConnection.lastLive = true;
  lastConnection.lastError = null;
  lastConnection.indexedPages = withUrls.filter((r) => r.derivedClassification !== true).reduce((s, r) => s + r.urls.length, 0);

  let acceptedUseful = 0;
  let rejectedOff = 0;
  for (const r of withUrls) {
    // Derived classification records restate prior sources; do not double-count.
    if (r.derivedClassification === true) continue;
    const useful = Array.isArray(r.acceptedUseful) ? r.acceptedUseful
      : Array.isArray(r.usefulUrls) ? r.usefulUrls
      : null;
    const rejected = Array.isArray(r.rejectedOffTopic) ? r.rejectedOffTopic
      : Array.isArray(r.rejected) ? r.rejected.filter((x) => x && (x.classification === "rejected_off_topic" || String(x.reason || "").startsWith("off_topic")))
      : [];
    if (useful) {
      acceptedUseful += useful.length;
      rejectedOff += rejected.length;
      continue;
    }
    // Derive on the fly from persisted urls/titles/excerpts without mutating records.
    const urls = r.urls || [];
    const titles = r.titles || [];
    const excerpts = r.excerpts || [];
    for (let i = 0; i < urls.length; i++) {
      const hit = { url: urls[i], title: titles[i] || "", excerpt: excerpts[i] || "" };
      const topic = classifyOnTopicRelevance(hit, r.query);
      if (topic.acceptedUseful) acceptedUseful += 1;
      else rejectedOff += 1;
    }
  }
  lastConnection.acceptedUsefulPages = acceptedUseful;
  lastConnection.rejectedOffTopicPages = rejectedOff;
  lastConnection.usefulOnTopic = acceptedUseful > 0;
  const last = withUrls.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).slice(-1)[0];
  lastConnection.lastQuery = last.query || lastConnection.lastQuery;
  lastConnection.lastAttemptAt = last.createdAt || lastConnection.lastAttemptAt;
  return lastConnection;
}

export function persistAcceptedFromExistingRecord(store, recordId) {
  const rec = store && store.getSearchRecord && store.getSearchRecord(recordId);
  if (!rec || rec.live !== true) return { ok: false, record: rec || null, reason: "live search record not found" };
  const hits = extractSearchResults(rec.raw || null, rec.rawText || "");
  const classified = hits.map((h) => {
    const cls = classifySearchHit(h, rec.query, { workspaceId: rec.workspaceId });
    return { ...h, ...cls };
  });
  const accepted = classified.filter((h) => h.accepted);
  const rejectedOffTopic = classified.filter((h) => !h.accepted && h.classification === "rejected_off_topic");
  const next = {
    id: nextId(((store.listSearchRecords && store.listSearchRecords()) || []).map((r) => r.id), "SRCH-"),
    workspaceId: rec.workspaceId,
    query: rec.query,
    provider: rec.provider || "openai-responses-web_search",
    model: rec.model || null,
    createdAt: nowIso(),
    live: true,
    fixture: false,
    sourceRecordId: rec.id,
    recoveredFromRawText: true,
    urls: accepted.map((h) => h.url),
    titles: accepted.map((h) => h.title),
    excerpts: accepted.map((h) => h.excerpt),
    acceptedUseful: accepted.filter((h) => h.acceptedUseful).map((h) => ({ url: h.url, title: h.title, excerpt: h.excerpt, classification: h.classification, reason: h.topicReason || h.reason })),
    rejectedOffTopic: rejectedOffTopic.map((h) => ({ url: h.url, title: h.title, excerpt: h.excerpt, classification: h.classification, reason: h.reason })),
    classification: accepted.map((h) => ({ url: h.url, classification: h.classification, reason: h.reason })),
    rejected: classified.filter((h) => !h.accepted),
    extractedCount: hits.length,
    acceptedCount: accepted.length,
    acceptedUsefulCount: accepted.filter((h) => h.acceptedUseful).length,
    rejectedOffTopicCount: rejectedOffTopic.length,
    rawText: rec.rawText || null,
    ledgerId: rec.ledgerId || null,
    note: "Accepted URLs recovered from official " + rec.id + " raw text. Original record left immutable.",
    contentHash: createHash("sha256").update(JSON.stringify({ query: rec.query, urls: accepted.map((h) => h.url), source: rec.id })).digest("hex"),
  };
  store.putSearchRecord(next);
  hydrateSearchConnection(store);
  return { ok: accepted.length > 0, record: next, sourceRecordId: rec.id, extractedCount: hits.length, acceptedCount: accepted.length };
}

/** Derive accepted-useful vs rejected-off-topic for existing SRCH records without erasing them. */
export function classifyExistingSearchRecords(store, recordIds) {
  const ids = Array.isArray(recordIds) && recordIds.length
    ? recordIds
    : (((store && store.listSearchRecords && store.listSearchRecords()) || []).map((r) => r.id));
  const rows = [];
  for (const id of ids) {
    const rec = store && store.getSearchRecord && store.getSearchRecord(id);
    if (!rec) continue;
    const urls = Array.isArray(rec.urls) ? rec.urls : [];
    const titles = Array.isArray(rec.titles) ? rec.titles : [];
    const excerpts = Array.isArray(rec.excerpts) ? rec.excerpts : [];
    const acceptedUseful = [];
    const rejectedOffTopic = [];
    for (let i = 0; i < urls.length; i++) {
      const hit = { url: urls[i], title: titles[i] || "", excerpt: excerpts[i] || "" };
      const topic = classifyOnTopicRelevance(hit, rec.query);
      const row = {
        url: hit.url,
        title: hit.title,
        excerpt: hit.excerpt,
        classification: topic.classification,
        reason: topic.reason,
        acceptedUseful: topic.acceptedUseful === true,
        onTopic: topic.onTopic === true,
        matchedTokens: topic.matchedTokens || [],
        sourceRecordId: rec.id,
      };
      if (topic.acceptedUseful) acceptedUseful.push(row);
      else rejectedOffTopic.push(row);
    }
    // Also surface empty-url official records (SRCH-001) as classification metadata only.
    if (!urls.length && rec.rawText) {
      rows.push({
        sourceRecordId: rec.id,
        query: rec.query,
        acceptedUseful: [],
        rejectedOffTopic: [],
        note: "No persisted URLs on this record (left immutable). Topic filter not applied to empty url list.",
      });
      continue;
    }
    rows.push({
      sourceRecordId: rec.id,
      query: rec.query,
      acceptedUseful: acceptedUseful,
      rejectedOffTopic: rejectedOffTopic,
      acceptedUsefulCount: acceptedUseful.length,
      rejectedOffTopicCount: rejectedOffTopic.length,
    });
  }
  const derived = {
    id: nextId(((store && store.listSearchRecords && store.listSearchRecords()) || []).map((r) => r.id), "SRCH-"),
    workspaceId: (rows[0] && store.getSearchRecord(rows[0].sourceRecordId) || {}).workspaceId || null,
    query: (rows.find((r) => r.query) || {}).query || null,
    provider: "midas-on-topic-relevance-filter-v1",
    model: null,
    createdAt: nowIso(),
    live: true,
    fixture: false,
    derivedClassification: true,
    sourceRecordIds: rows.map((r) => r.sourceRecordId),
    urls: rows.flatMap((r) => (r.acceptedUseful || []).map((h) => h.url)),
    titles: rows.flatMap((r) => (r.acceptedUseful || []).map((h) => h.title)),
    excerpts: rows.flatMap((r) => (r.acceptedUseful || []).map((h) => h.excerpt)),
    acceptedUseful: rows.flatMap((r) => r.acceptedUseful || []),
    rejectedOffTopic: rows.flatMap((r) => r.rejectedOffTopic || []),
    classification: rows.flatMap((r) => (r.acceptedUseful || []).map((h) => ({ url: h.url, classification: h.classification, reason: h.reason }))),
    rejected: rows.flatMap((r) => (r.rejectedOffTopic || []).map((h) => ({ url: h.url, classification: h.classification, reason: h.reason, title: h.title }))),
    acceptedCount: rows.reduce((s, r) => s + (r.acceptedUsefulCount || 0), 0),
    acceptedUsefulCount: rows.reduce((s, r) => s + (r.acceptedUsefulCount || 0), 0),
    rejectedOffTopicCount: rows.reduce((s, r) => s + (r.rejectedOffTopicCount || 0), 0),
    perSource: rows,
    note: "Derived on-topic relevance classification. SRCH-001/002/003 left immutable. Persist-official-URLs is not useful-on-topic.",
    contentHash: createHash("sha256").update(JSON.stringify({ kind: "on_topic_filter", sources: rows.map((r) => r.sourceRecordId) })).digest("hex"),
  };
  if (store && store.putSearchRecord) store.putSearchRecord(derived);
  hydrateSearchConnection(store);
  return { ok: true, record: derived, perSource: rows };
}

export async function attemptOfficialWebSearch(store, payload, extras) {
  const workspaceId = payload && payload.workspaceId ? requireWorkspaceId(payload.workspaceId) : null;
  const query = String((payload && (payload.query || payload.q)) || "").trim();
  lastConnection.lastAttemptAt = nowIso();
  lastConnection.lastQuery = query.slice(0, 400);
  if (!query) {
    lastConnection.lastError = "query is required";
    return { ...querySearchProvider(query, payload), error: "query is required" };
  }
  loadWorkspaceEnv();
  if (!process.env.OPENAI_API_KEY) {
    lastConnection.lastError = "Search key missing. Boundary built. Deterministic work continues.";
    lastConnection.connected = false;
    lastConnection.status = SEARCH_PROVIDER_STATUS_NOT_CONNECTED;
    return {
      ...querySearchProvider(query, payload),
      error: lastConnection.lastError,
      keyMissing: true,
    };
  }
  try {
    const provider = new OpenAIResponsesProvider();
    const completion = await provider.complete({
      input: "Search the public web for: " + query + ". Return only real public web pages that are on-topic for that query, with titles, URLs, and short excerpts. On-topic means the page content matches the subject of the query (for a library/community bulletin/after-school query: library, community, bulletin, programs, calendars — not developer tools). Do NOT return Chrome DevTools, Inspect mode, WebKit/Safari isInspectable, JavaScriptCore, Chromium inspect pages, Google Search Console, or other developer documentation just because the word inspectable appears. Here inspectable means a real public page the owner can open and read, not browser inspect-mode. Do not invent demand, TAM, or conversion. Reject chrome/nav UI chrome, video placeholders, wage tables, and vendor marketing as independent proof.",
      instructions: "Use the web_search tool. Cite only pages the tool actually returned. Prefer official library/government/community pages when the query asks for them. Never substitute developer-inspect documentation.",
      tools: [{ "type": "web_search" }],
      tool_choice: "required",
    });
    if (!completion || completion.kind !== "live") {
      throw new Error("Search responder was not live.");
    }
    const hits = extractSearchResults(completion.raw, completion.text);
    const classified = hits.map((h) => {
      const cls = classifySearchHit(h, query, payload);
      return { ...h, ...cls };
    });
    const accepted = classified.filter((h) => h.accepted);
    const rejectedOffTopic = classified.filter((h) => !h.accepted && h.classification === "rejected_off_topic");
    const useful = accepted.filter((h) => h.acceptedUseful);
    lastConnection.connected = accepted.length > 0 || classified.length > 0; // persist happened if we got structured hits; see rec below
    // connected = official tool persisted any URLs (accepted list may be empty if all off-topic — still persist rejected)
    lastConnection.lastLive = true;
    lastConnection.lastError = useful.length ? null : (accepted.length ? "Official web_search persisted pages but none were accepted-useful on-topic." : "Official web_search ran but produced no accepted-useful on-topic pages.");
    lastConnection.indexedPages = classified.length;
    lastConnection.acceptedUsefulPages = useful.length;
    lastConnection.rejectedOffTopicPages = rejectedOffTopic.length;
    lastConnection.usefulOnTopic = useful.length > 0;
    lastConnection.connected = classified.length > 0;
    lastConnection.status = lastConnection.connected ? SEARCH_PROVIDER_STATUS_CONNECTED : SEARCH_PROVIDER_STATUS_NOT_CONNECTED;
    const usage = completion.usage || tokensFromResponse(completion.raw) || {};
    let ledger = null;
    if (store && workspaceId) {
      ledger = recordUsage(store, {
        workspaceId: workspaceId,
        role: "search",
        operation: "web_search",
        kind: "live",
        model: (completion.raw && completion.raw.model) || process.env.OPENAI_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        providerRequestId: completion.raw && completion.raw.id,
        note: "Official Responses web_search attempt.",
      });
    }
    // Persist both accepted-useful and rejected-off-topic. urls includes every extracted page so connected reflects persist.
    const persistedHits = classified.length ? classified : accepted;
    const rec = {
      id: nextId(((store && store.listSearchRecords && store.listSearchRecords()) || []).map((r) => r.id), "SRCH-"),
      workspaceId: workspaceId,
      query: query,
      provider: "openai-responses-web_search",
      model: (completion.raw && completion.raw.model) || process.env.OPENAI_MODEL || null,
      createdAt: nowIso(),
      live: true,
      fixture: false,
      urls: persistedHits.map((h) => h.url),
      titles: persistedHits.map((h) => h.title),
      excerpts: persistedHits.map((h) => h.excerpt),
      acceptedUseful: useful.map((h) => ({ url: h.url, title: h.title, excerpt: h.excerpt, classification: h.classification, reason: h.topicReason || h.reason })),
      rejectedOffTopic: rejectedOffTopic.map((h) => ({ url: h.url, title: h.title, excerpt: h.excerpt, classification: h.classification, reason: h.reason })),
      classification: useful.map((h) => ({ url: h.url, classification: h.classification, reason: h.reason })),
      rejected: classified.filter((h) => !h.accepted),
      extractedCount: hits.length,
      acceptedCount: accepted.length,
      acceptedUsefulCount: useful.length,
      rejectedOffTopicCount: rejectedOffTopic.length,
      rawText: String(completion.text || "").slice(0, 8000),
      ledgerId: ledger && ledger.id || null,
      contentHash: createHash("sha256").update(JSON.stringify({ query, urls: persistedHits.map((h) => h.url), useful: useful.map((h) => h.url) })).digest("hex"),
    };
    lastConnection.connected = rec.urls.length > 0;
    lastConnection.status = lastConnection.connected ? SEARCH_PROVIDER_STATUS_CONNECTED : SEARCH_PROVIDER_STATUS_NOT_CONNECTED;
    lastConnection.indexedPages = rec.urls.length;
    if (store && store.putSearchRecord) store.putSearchRecord(rec);
    return {
      ok: useful.length > 0,
      connected: lastConnection.connected,
      status: lastConnection.status,
      usefulOnTopic: lastConnection.usefulOnTopic,
      searchIntegrationExists: lastConnection.connected,
      internetWideSearch: lastConnection.usefulOnTopic,
      query: query,
      results: useful,
      rejected: rec.rejected,
      acceptedUseful: rec.acceptedUseful,
      rejectedOffTopic: rec.rejectedOffTopic,
      fetched: true,
      live: true,
      fixture: false,
      fixtureFallback: false,
      workspaceId: workspaceId,
      recordId: rec.id,
      searched: [query],
      opened: useful.map((h) => h.url),
      said: useful.map((h) => h.excerpt),
      uncertain: useful.length ? [] : ["No accepted-useful on-topic pages after relevance filter."],
      inferred: [],
      usage: usage,
      ledgerId: rec.ledgerId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastConnection.connected = false;
    lastConnection.status = SEARCH_PROVIDER_STATUS_NOT_CONNECTED;
    lastConnection.lastLive = false;
    lastConnection.lastError = msg;
    return {
      ...querySearchProvider(query, payload),
      error: msg,
      attempted: true,
      officialTool: "web_search",
    };
  }
}

export function searchProviderView(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  hydrateSearchConnection(store);
  const records = (store && store.listSearchRecords && store.listSearchRecords(workspaceId)) || [];
  return {
    built: true,
    persistence: "FILE_STORE",
    ...searchProviderStatus(),
    records: records.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      query: r.query,
      provider: r.provider,
      live: r.live === true,
      urls: r.urls || [],
      titles: r.titles || [],
      createdAt: r.createdAt,
    })),
    ownerVisible: {
      searched: records.flatMap((r) => r.query ? [r.query] : []),
      opened: records.flatMap((r) => r.urls || []),
      said: records.flatMap((r) => (r.excerpts || []).slice(0, 2)),
      uncertain: !lastConnection.connected
        ? ["Search is not-connected until a real official call succeeds."]
        : lastConnection.usefulOnTopic
          ? []
          : ["Search persisted official URLs but no accepted-useful on-topic page for the query yet. Persist is not useful-on-topic research success."],
      inferred: [],
    },
  };
}

export function searchProviderViewCompat() {
  return searchProviderView(null, {});
}
