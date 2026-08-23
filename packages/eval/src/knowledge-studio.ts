import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { contentHash, freezeAtlasFromApproved, nextAtlasVersionId, latestFrozenAtlasId, refuseAtlasRewrite, FROZEN_ATLAS_IDS } from "@midas/db";
import { defaultCurriculumRoot } from "./curriculum.js";
import { extractSubstantiveHtml, EXTRACTOR_VERSION } from "./html-extract.ts";

export const STUDIO_CAPABILITY = "Owner-provided URLs and bounded permitted public-source crawling.";
export const STUDIO_PARSER_VERSION = "midas-knowledge-studio-v0.1.0";
export const REVIEW_STATES = ["proposed", "approved", "rejected", "needs_review", "superseded"];
export const ITEM_KINDS = ["owner_policy", "sourced_fact", "inference", "unverified_suggestion", "agent_instruction", "business_description", "private_note"];
export const EPISTEMIC_CLASSES = ["business_description", "owner_policy", "sourced_fact", "agent_instruction", "unverified_suggestion", "private_note"];
export const TRAINING_REVIEW_STATUSES = ["created", "tested", "improved_on_dev_scenario", "officially_approved", "promoted"];
export const IMPLEMENTED_SPECIALIST = "atlas";
export const MAX_FETCH_BYTES = 1_000_000;
export const FETCH_TIMEOUT_MS = 8000;
export const CRAWL_MAX_PAGES = 4;
export const CRAWL_MAX_DEPTH = 1;
export const HOST_RATE_MS = 1500;

const ALLOWED_TYPES = [
  "text/html",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/pdf",
  "application/xhtml+xml",
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.internal",
]);

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function nextNumericId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id).match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function isBlockedIpv4(ip) {
  const parts = String(ip).split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isBlockedIp(ip) {
  const s = String(ip || "").toLowerCase();
  if (!s) return true;
  if (s === "::1" || s === "0:0:0:0:0:0:0:1") return true;
  if (s === "169.254.169.254") return true;
  if (s.includes(":")) {
    if (s.startsWith("fe80:") || s.startsWith("fc") || s.startsWith("fd")) return true;
    if (s.startsWith("::ffff:")) return isBlockedIpv4(s.slice(7));
  }
  return isBlockedIpv4(s);
}

export function assertPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    throw new Error("Invalid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http/https URLs are permitted.");
  if (u.username || u.password) throw new Error("URLs with credentials are not permitted.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) throw new Error("Host is blocked.");
  if (host === "169.254.169.254") throw new Error("Link-local / cloud metadata hosts are blocked.");
  if (isBlockedIp(host)) throw new Error("Private, loopback, or link-local addresses are blocked.");
  return u;
}

async function resolvePublicHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isBlockedIp(host)) throw new Error("Host is blocked.");
  const answers = await lookup(host, { all: true, verbatim: true });
  if (!answers.length) throw new Error("Host did not resolve.");
  for (const a of answers) {
    if (isBlockedIp(a.address)) throw new Error("Resolved address is private or otherwise blocked: not fetched.");
  }
  return answers;
}

const hostLastFetch = new Map();

function respectHostRate(host) {
  const last = hostLastFetch.get(host) || 0;
  const wait = HOST_RATE_MS - (Date.now() - last);
  if (wait > 0) {
    const until = Date.now() + wait;
    while (Date.now() < until) {
      // bounded busy wait; crawl is small
    }
  }
  hostLastFetch.set(host, Date.now());
}

function robotsAllows(robotsText, pathName) {
  if (!robotsText) return { allowed: true, note: "no robots.txt body" };
  const lines = String(robotsText).split(/\r?\n/);
  let inStar = false;
  const disallows = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const lower = t.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      const ag = t.slice(t.indexOf(":") + 1).trim();
      inStar = ag === "*";
      continue;
    }
    if (inStar && lower.startsWith("disallow:")) {
      const rule = t.slice(t.indexOf(":") + 1).trim();
      // Empty Disallow means allow all (robots.txt spec). Do not treat as "/".
      if (rule === "") continue;
      disallows.push(rule);
    }
  }
  for (const d of disallows) {
    if (d === "/") return { allowed: false, note: "robots.txt Disallow: /" };
    if (d && pathName.startsWith(d)) return { allowed: false, note: "robots.txt Disallow: " + d };
  }
  return { allowed: true, note: "robots allow" };
}

function contentTypeAllowed(ct) {
  const base = String(ct || "").split(";")[0].trim().toLowerCase();
  if (!base) return { ok: true, base: "text/plain", note: "missing content-type treated as text/plain" };
  if (ALLOWED_TYPES.includes(base)) return { ok: true, base: base };
  if (base.endsWith("+json")) return { ok: true, base: "application/json" };
  return { ok: false, base: base, note: "content-type not on allowlist: " + base };
}

function stripHtml(html) {
  const titleM = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? titleM[1].replace(/\s+/g, " ").trim() : "";
  const noScript = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const headings = [];
  const hre = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = hre.exec(html))) headings.push(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const lis = [];
  const lre = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = lre.exec(html))) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t && t.length < 400) lis.push(t);
  }
  return { title: title, text: text, headings: headings, listItems: lis };
}

function parsePdfWithPoppler(bytes) {
  const tmp = join(tmpdir(), "midas-pdf-" + randomUUID() + ".pdf");
  try {
    writeFileSync(tmp, bytes);
    const r = spawnSync("pdftotext", ["-layout", "-nopgbrk", tmp, "-"], {
      encoding: "buffer",
      timeout: 8000,
      maxBuffer: MAX_FETCH_BYTES,
    });
    if (r.status !== 0) {
      return { ok: false, text: "", note: "PDF could not be parsed by poppler/pdftotext." };
    }
    const text = Buffer.from(r.stdout || []).toString("utf8");
    return { ok: true, text: text, note: "Parsed with poppler pdftotext." };
  } catch (err) {
    return { ok: false, text: "", note: "PDF parse boundary: " + (err instanceof Error ? err.message : String(err)) };
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function extractClaims(args) {
  const text = String(args.text || "");
  const contentType = String(args.contentType || "text/plain");
  const claims = [];
  const push = (statement, excerpt, extra) => {
    const s = String(statement || "").replace(/\s+/g, " ").trim();
    if (s.length < 12 || s.length > 800) return;
    if (/ignore (all )?(previous|prior) (instructions|rules)/i.test(s)) {
      claims.push({
        statement: s.slice(0, 240),
        excerpt: excerpt || s.slice(0, 240),
        kind: "unverified_suggestion",
        untrustedInstructionAttempt: true,
        ...extra,
      });
      return;
    }
    claims.push({ statement: s, excerpt: excerpt || s.slice(0, 240), kind: extra && extra.kind ? extra.kind : "sourced_fact", ...extra });
  };

  if (contentType.includes("json")) {
    try {
      const obj = JSON.parse(text);
      const rows = Array.isArray(obj) ? obj : (obj && (obj.rules || obj.claims || obj.items)) || [obj];
      for (const row of rows) {
        if (!row) continue;
        if (typeof row === "string") push(row, row);
        else push(row.statement || row.rule || row.claim || row.text, row.excerpt || row.statement || row.rule);
      }
      return claims.slice(0, 12);
    } catch {
      // fall through
    }
  }
  if (contentType.includes("csv")) {
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 20);
    const header = lines[0] || "";
    for (const line of lines.slice(1)) push(line, line);
    if (!claims.length && header) push(header, header);
    return claims.slice(0, 12);
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*+]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) push(t.replace(/^[-*+\d.)\s]+/, ""), t);
  }
  if (!claims.length) {
    const paras = text.split(/\n{2,}/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 24);
    for (const para of paras.slice(0, 8)) push(para, para.slice(0, 240));
  }
  if (!claims.length && text.trim().length >= 12) push(text.trim().slice(0, 400), text.trim().slice(0, 240));
  return claims.slice(0, 12);
}

function persistSourceBytes(sourceId, bytes) {
  const root = defaultCurriculumRoot();
  const dir = join(root, "sources", sourceId);
  mkdirSync(dir, { recursive: true });
  const sha = sha256Bytes(bytes);
  const bytesPath = join(dir, sha);
  if (!existsSync(bytesPath)) writeFileSync(bytesPath, bytes);
  return { sha: sha, bytesPath: bytesPath, byteLength: bytes.length };
}

function existingIds(store, field) {
  const fromK = (store.listKnowledge() || []).map((k) => k.id);
  const fromS = (store.listSources() || []).map((s) => s.id);
  const fromO = (store.listOwnerRules ? store.listOwnerRules() : []).map((s) => s.id);
  const fromF = (store.listFetches ? store.listFetches() : []).map((s) => s.id);
  return [...fromK, ...fromS, ...fromO, ...fromF];
}

function leakScan(text) {
  const hits = [];
  if (/ATLAS-DEV-\d{3}/i.test(text)) hits.push("case-id");
  if (/ATLAS-SEALED-/i.test(text)) hits.push("sealed");
  if (/ranked_tiers|required_unknowns/.test(text)) hits.push("gold-field");
  return hits;
}

function untrustedNote() {
  return "Page and pasted bytes are untrusted data. They cannot become system instructions, change tools, override owner policy, or request actions.";
}

export function studioOverview(store, opts) {
  const workspaceId = opts && (opts.workspaceId || opts.workspace);
  const sources = store.listSources() || [];
  const items = (store.listKnowledge() || []).filter((k) => {
    if (!workspaceId) return true;
    const kid = itemWorkspaceId(k);
    return kid === workspaceId;
  });
  const fetches = store.listFetches ? store.listFetches() : [];
  const reviews = store.listReviews ? store.listReviews() : [];
  const ownerRules = store.listOwnerRules ? store.listOwnerRules() : [];
  const versions = (store.listVersions && store.listVersions("atlas")) || [];
  const snapshots = store.listCurriculumSnapshots() || [];
  const studioItems = items.filter((k) => k.studio || String(k.id || "").startsWith("K-STUDIO-"));
  const byStatus = {};
  for (const s of REVIEW_STATES) byStatus[s] = studioItems.filter((k) => (k.reviewStatus || (k.accepted ? "approved" : "proposed")) === s).length;
  const liveFetches = fetches.filter((f) => f.live === true && f.status === "ok");
  const failedFetches = fetches.filter((f) => f.status && f.status !== "ok");
  const fixtureFetches = fetches.filter((f) => f.live === false || f.category === "fixture" || f.captureStatus === "FIXTURE");
  const writtenByMe = studioItems.filter((k) => k.writtenByOwner === true || k.kind === "owner_policy" && k.sourceMode === "owner_authored");
  const approved = studioItems.filter((k) => k.reviewStatus === "approved");
  const onAtlas = [];
  for (const v of versions) {
    const ids = (v.approvedItemIds || (v.retrievalPolicy && v.retrievalPolicy.approvedItemIds) || []);
    for (const id of ids) if (!onAtlas.includes(id)) onAtlas.push(id);
  }
  const latest = versions.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).slice(-1)[0];
  const parent = latest && latest.parentVersionId ? store.getVersion(latest.parentVersionId) : null;
  const versionDiff = latest && parent
    ? {
        child: latest.id,
        parent: parent.id,
        declaredChange: latest.declaredChange,
        childSnapshot: latest.curriculumSnapshotId,
        parentSnapshot: parent.curriculumSnapshotId,
        addedItems: (latest.approvedItemIds || []).filter((id) => !(parent.approvedItemIds || []).includes(id)),
      }
    : null;
  const evals = (store.listEvalRuns && store.listEvalRuns()) || [];
  const latestRun = evals.slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).slice(-1)[0];
  let lastDecision = null;
  if (latestRun && store.listCaseResults) {
    const rows = store.listCaseResults(latestRun.id) || [];
    const row = rows[0];
    if (row) {
      lastDecision = {
        caseId: row.caseId,
        retrievedItemIds: (row.retrievalTrace && row.retrievalTrace.retrievedItemIds) || latestRun.retrievedItemIds || [],
        rawVsServed: (row.assessments || []).map((a) => {
          const raw = (row.rawAssessments || row.modelProposal || []).find((x) => x.prospect_id === a.prospect_id) || {};
          return {
            prospect_id: a.prospect_id,
            model: raw.classification || null,
            served: a.classification,
            rule: ((row.policyEvaluation || []).find((p) => p.prospect_id === a.prospect_id) || {}).authoritative_effects || [],
          };
        }),
        enforcementIntervened: row.enforcementIntervened || false,
      };
    }
  }
  return {
    capability: STUDIO_CAPABILITY,
    persistence: "FILE_STORE",
    semanticJudge: "advisory",
    sourcesAdded: sources.length,
    studioSources: sources.filter((s) => s.studio || String(s.id || "").startsWith("SRC-STUDIO-")).length,
    liveFetches: liveFetches.length,
    failedFetches: failedFetches.length,
    fixtureFetches: fixtureFetches.length,
    extractedClaims: studioItems.length,
    approved: approved.length,
    writtenByMe: writtenByMe.length,
    rejected: studioItems.filter((k) => k.reviewStatus === "rejected").length,
    proposed: studioItems.filter((k) => k.reviewStatus === "proposed" || k.reviewStatus === "needs_review").length,
    itemsOnAtlas: onAtlas,
    byStatus: byStatus,
    ownerRules: ownerRules.length,
    reviews: reviews.length,
    versions: versions.map((v) => ({ id: v.id, parent: v.parentVersionId, snapshot: v.curriculumSnapshotId, declaredChange: v.declaredChange })),
    snapshots: snapshots.map((s) => ({ id: s.id, knowledgeItemIds: s.knowledgeItemIds, sourceIds: s.sourceIds })),
    versionDiff: versionDiff,
    lastDecision: lastDecision,
    fetches: fetches.map((f) => ({
      id: f.id,
      url: f.url,
      status: f.status,
      live: f.live,
      fixture: f.live === false || f.category === "fixture",
      contentType: f.contentType,
      title: f.title,
      sha256: f.sha256,
    })),
    items: studioItems.map(publicItem),
    untrustedNote: untrustedNote(),
  };
}

function itemWorkspaceId(k) {
  return (k && (k.workspaceId || k.workspace)) || null;
}

function publicItem(k) {
  const kind = k.kind || (k.claimKind === "owner_policy" ? "owner_policy" : "sourced_fact");
  return {
    id: k.id,
    sourceId: k.sourceId,
    claim: k.statement,
    rule: k.statement,
    excerpt: (k.locator && k.locator.text) || k.excerpt || null,
    locator: k.locator || null,
    url: k.url || k.origin || null,
    origin: k.origin || k.url || null,
    createdAt: k.createdAt,
    verifiedAt: k.verifiedAt || null,
    category: k.category || k.competency || null,
    workspace: itemWorkspaceId(k) || "default",
    workspaceId: itemWorkspaceId(k),
    applicableRole: k.applicableRole || k.agentRole || "atlas",
    agentRole: k.agentRole || k.applicableRole || "atlas",
    reviewStatus: k.reviewStatus || (k.accepted ? "approved" : "proposed"),
    trust: k.trust || (k.writtenByOwner ? "owner" : "unverified"),
    tags: k.tags || [],
    freshness: k.freshness || k.createdAt,
    priorRevisionId: k.priorRevisionId || null,
    kind: kind,
    epistemicClass: k.epistemicClass || kind,
    writtenByOwner: Boolean(k.writtenByOwner),
    accepted: Boolean(k.accepted),
    runtimeEligible: k.runtimeEligible === true,
    sourceMode: k.sourceMode || null,
    untrustedInstructionAttempt: Boolean(k.untrustedInstructionAttempt),
    privateNote: k["private"] === true,
  };
}

export function addOwnerAuthoredRule(store, payload) {
  const statement = String((payload && payload.statement) || "").trim();
  if (statement.length < 12) throw new Error("Owner rule statement is required.");
  const leaks = leakScan(statement);
  if (leaks.length) throw new Error("Owner rule rejected by leak scan: " + leaks.join(","));
  const ids = existingIds(store);
  const sourceId = nextNumericId(ids, "SRC-STUDIO-OWN-");
  const itemId = nextNumericId(ids.concat([sourceId]), "K-STUDIO-OWN-");
  const now = nowIso();
  const bytes = Buffer.from(statement, "utf8");
  const saved = persistSourceBytes(sourceId, bytes);
  const source = {
    id: sourceId,
    url: "midas://owner-rule/" + itemId,
    title: (payload && payload.title) || "Owner-authored rule",
    publisher: "MIDAS owner",
    retrievedAt: now,
    contentType: "text/plain; charset=utf-8",
    sha256: saved.sha,
    byteLength: saved.byteLength,
    parserVersion: STUDIO_PARSER_VERSION,
    captureStatus: "OWNER_AUTHORED",
    captureNote: "Explicit owner action. Authoritative owner policy. Not a live web page.",
    bytesPath: saved.bytesPath,
    runtimeEligible: true,
    studio: true,
    category: (payload && payload.category) || "owner_policy",
    trust: "owner",
    live: false,
  };
  store.putSource(source);
  const item = {
    id: itemId,
    "type": (payload && payload.type) || "decision_rule",
    statement: statement,
    sourceId: sourceId,
    sourceSha256: saved.sha,
    locator: { section: "Owner", charStart: 0, charEnd: statement.length, text: statement.slice(0, 240) },
    claimKind: "owner_policy",
    kind: "owner_policy",
    accepted: true,
    createdAt: now,
    verifiedAt: now,
    runtimeEligible: true,
    studio: true,
    reviewStatus: "approved",
    writtenByOwner: true,
    sourceMode: "owner_authored",
    category: (payload && payload.category) || "owner_policy",
    workspace: (payload && (payload.workspaceId || payload.workspace)) || "default",
    workspaceId: (payload && (payload.workspaceId || payload.workspace)) || "default",
    applicableRole: (payload && (payload.applicableRole || payload.agentRole)) || "atlas",
    agentRole: (payload && (payload.agentRole || payload.applicableRole)) || "atlas",
    epistemicClass: "owner_policy",
    trust: "owner",
    tags: (payload && payload.tags) || ["owner-authored"],
    freshness: now,
    url: source.url,
    origin: "owner",
    excerpt: statement.slice(0, 240),
    applicability: payload && payload.applicability,
    competency: payload && payload.competency,
  };
  store.putKnowledge(item);
  const rule = {
    id: itemId,
    sourceId: sourceId,
    statement: statement,
    createdAt: now,
    authoritative: true,
    reviewStatus: "approved",
  };
  if (store.putOwnerRule) store.putOwnerRule(rule);
  if (store.putReview) {
    store.putReview({
      id: "REV-" + itemId + "-author",
      knowledgeItemId: itemId,
      action: "approve",
      actor: "owner",
      at: now,
      note: "Explicit owner-authored rule. Authoritative.",
    });
  }
  return { source: source, item: publicItem(item), rule: rule, note: "Explicit owner action created authoritative owner policy." };
}

export function addPastedText(store, payload) {
  const raw = String((payload && (payload.text || payload.body)) || "");
  if (!raw.trim()) throw new Error("Pasted text is empty.");
  const leaks = leakScan(raw);
  if (leaks.length) throw new Error("Paste rejected by leak scan: " + leaks.join(","));
  const ids = existingIds(store);
  const sourceId = nextNumericId(ids, "SRC-STUDIO-PASTE-");
  const now = nowIso();
  const bytes = Buffer.from(raw, "utf8");
  const saved = persistSourceBytes(sourceId, bytes);
  const contentType = (payload && payload.contentType) || "text/plain";
  const source = {
    id: sourceId,
    url: "midas://paste/" + sourceId,
    title: (payload && payload.title) || "Owner-pasted text",
    publisher: "MIDAS owner paste",
    retrievedAt: now,
    contentType: contentType,
    sha256: saved.sha,
    byteLength: saved.byteLength,
    parserVersion: STUDIO_PARSER_VERSION,
    captureStatus: "OWNER_PASTE",
    captureNote: "Pasted text. Untrusted. Proposed facts only until owner review.",
    bytesPath: saved.bytesPath,
    runtimeEligible: false,
    studio: true,
    live: false,
    category: (payload && payload.category) || "paste",
    trust: "unverified",
    excerpt: raw.slice(0, 240),
    substantiveText: raw,
  };
  store.putSource(source);
  const claims = extractClaims({ text: raw, contentType: contentType });
  const items = [];
  let n = 1;
  for (const c of claims) {
    const itemId = nextNumericId(ids.concat(items.map((i) => i.id)), "K-STUDIO-PASTE-");
    ids.push(itemId);
    const item = {
      id: itemId,
      "type": "principle",
      statement: c.statement,
      sourceId: sourceId,
      sourceSha256: saved.sha,
      locator: { section: "Paste", charStart: raw.indexOf(c.excerpt) >= 0 ? raw.indexOf(c.excerpt) : 0, charEnd: 0, text: c.excerpt },
      claimKind: "vendor_opinion",
      kind: c.kind || "sourced_fact",
      accepted: false,
      createdAt: now,
      runtimeEligible: false,
      studio: true,
      reviewStatus: "proposed",
      writtenByOwner: false,
      sourceMode: "paste",
      category: (payload && payload.category) || "paste",
      workspace: (payload && (payload.workspaceId || payload.workspace)) || "default",
      workspaceId: (payload && (payload.workspaceId || payload.workspace)) || "default",
      applicableRole: (payload && payload.applicableRole) || "atlas",
      agentRole: "atlas",
      epistemicClass: "unverified_suggestion",
      trust: "unverified",
      tags: ["paste", "proposed"],
      freshness: now,
      url: source.url,
      origin: "paste",
      excerpt: c.excerpt,
      untrustedInstructionAttempt: Boolean(c.untrustedInstructionAttempt),
    };
    item.locator.charEnd = item.locator.charStart + String(c.excerpt || "").length;
    store.putKnowledge(item);
    items.push(item);
    n += 1;
  }
  return {
    source: source,
    items: items.map(publicItem),
    note: "Pasted text proposed " + items.length + " claim(s). Not authoritative until owner approval.",
    untrustedNote: untrustedNote(),
  };
}

async function fetchOnce(url, opts) {
  const u = assertPublicHttpUrl(url);
  await resolvePublicHost(u.hostname);
  respectHostRate(u.hostname);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "MIDAS-KnowledgeStudio/0.1 (owner-bounded; no-auth)" },
      signal: ctrl.signal,
    });
    return { url: u, res: res };
  } finally {
    clearTimeout(t);
  }
}

async function followRedirects(startUrl, opts) {
  let current = String(startUrl);
  const hops = [];
  for (let i = 0; i < 3; i += 1) {
    const { url, res } = await fetchOnce(current, opts);
    hops.push({ url: url.toString(), status: res.status, location: res.headers.get("location") });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without Location.");
      const next = new URL(loc, url);
      assertPublicHttpUrl(next.toString());
      await resolvePublicHost(next.hostname);
      current = next.toString();
      continue;
    }
    return { url: url, res: res, hops: hops };
  }
  throw new Error("Too many redirects.");
}

async function readRobots(origin) {
  try {
    const { res } = await fetchOnce(origin + "/robots.txt", { timeoutMs: 4000 });
    if (!res.ok) return { text: "", note: "robots status " + res.status };
    const ct = contentTypeAllowed(res.headers.get("content-type") || "text/plain");
    if (!ct.ok && ct.base !== "text/plain") return { text: "", note: "robots content-type skipped" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 64_000) return { text: "", note: "robots too large" };
    return { text: buf.toString("utf8"), note: "robots fetched" };
  } catch (err) {
    return { text: "", note: "robots fetch failed: " + (err instanceof Error ? err.message : String(err)) };
  }
}

function htmlLinks(html, baseUrl, sameHost) {
  const out = [];
  const re = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], baseUrl);
      if (abs.hostname === sameHost && (abs.protocol === "http:" || abs.protocol === "https:")) out.push(abs.toString());
    } catch { /* skip */ }
  }
  return [...new Set(out)];
}

export async function addUrlSource(store, payload) {
  const requested = String((payload && payload.url) || "");
  const fixture = payload && payload.fixture;
  const crawl = Boolean(payload && payload.crawl);
  const now = nowIso();
  const ids = existingIds(store);
  const results = [];

  async function ingestOne(url, depth, liveBody) {
    const sourceId = nextNumericId(existingIds(store).concat(results.map((r) => r.source && r.source.id)), "SRC-STUDIO-URL-");
    let live = false;
    let status = "ok";
    let note = "";
    let contentType = "text/plain";
    let title = "";
    let canonical = url;
    let bytes = Buffer.from("");
    let sha = "";
    let bytesPath = "";
    let category = fixture ? "fixture" : "live";
    let captureStatus = fixture ? "FIXTURE" : "LIVE_WEB";
    let pdfBoundary = null;
    let extractionRecord = null;

    if (fixture) {
      bytes = Buffer.from(String(fixture.body || fixture.text || ""), fixture.body instanceof Buffer ? undefined : "utf8");
      if (Buffer.isBuffer(fixture.body)) bytes = fixture.body;
      contentType = fixture.contentType || "text/plain";
      title = fixture.title || url;
      live = false;
      category = "fixture";
      captureStatus = "FIXTURE";
      note = "Fixture-labeled ingest. Not live research.";
      if (String(contentType).includes("pdf")) {
        const parsed = parsePdfWithPoppler(bytes);
        if (!parsed.ok) {
          pdfBoundary = parsed.note || "PDF could not be parsed.";
          note = "Fixture-labeled. " + pdfBoundary;
        } else {
          bytes = Buffer.from(parsed.text, "utf8");
          contentType = "text/plain";
          note = "Fixture-labeled. " + parsed.note;
        }
      }
      const saved = persistSourceBytes(sourceId, bytes);
      sha = saved.sha;
      bytesPath = saved.bytesPath;
      if (String(contentType).includes("html")) {
        extractionRecord = extractSubstantiveHtml(bytes.toString("utf8"), {
          objectiveText: payload && payload.objectiveText,
          workspaceText: payload && payload.workspaceText,
        });
        bytes = Buffer.from(extractionRecord.substantiveText || extractionRecord.sanitizedText || "", "utf8");
      }
    } else {
      try {
        assertPublicHttpUrl(url);
        const u = new URL(url);
        const robots = await readRobots(u.origin);
        const allow = robotsAllows(robots.text, u.pathname || "/");
        if (!allow.allowed) {
          status = "robots_blocked";
          note = allow.note;
          live = true;
        } else {
          const got = await followRedirects(url, {});
          canonical = got.url.toString();
          const ct = contentTypeAllowed(got.res.headers.get("content-type"));
          if (!got.res.ok) {
            status = "http_" + got.res.status;
            note = "HTTP " + got.res.status;
            live = true;
          } else if (!ct.ok) {
            status = "content_type_blocked";
            note = ct.note;
            live = true;
            contentType = ct.base;
          } else {
            const raw = Buffer.from(await got.res.arrayBuffer());
            if (raw.length > MAX_FETCH_BYTES) {
              status = "size_limit";
              note = "Response exceeded " + MAX_FETCH_BYTES + " bytes.";
              live = true;
            } else {
              bytes = raw;
              contentType = ct.base;
              live = true;
              captureStatus = "LIVE_WEB";
              category = "live";
              if (ct.base === "application/pdf") {
                const parsed = parsePdfWithPoppler(bytes);
                if (!parsed.ok) {
                  pdfBoundary = parsed.note;
                  note = parsed.note;
                } else {
                  title = "PDF";
                  bytes = Buffer.from(parsed.text, "utf8");
                  contentType = "text/plain";
                  note = parsed.note;
                }
              } else if (ct.base.includes("html")) {
                const html = bytes.toString("utf8");
                const extracted = extractSubstantiveHtml(html, {
                  objectiveText: payload && payload.objectiveText,
                  workspaceText: payload && payload.workspaceText,
                });
                title = extracted.title || got.url.hostname;
                bytes = Buffer.from(extracted.substantiveText || extracted.sanitizedText || "", "utf8");
                extractionRecord = extracted;
              } else {
                title = got.url.hostname;
              }
              const saved = persistSourceBytes(sourceId, bytes);
              sha = saved.sha;
              bytesPath = saved.bytesPath;
            }
          }
        }
      } catch (err) {
        status = "failed";
        note = err instanceof Error ? err.message : String(err);
        live = !fixture;
      }
    }

    const source = {
      id: sourceId,
      url: url,
      canonical: canonical,
      title: title || url,
      publisher: (() => { try { return new URL(canonical).hostname; } catch { return "unknown"; } })(),
      retrievedAt: now,
      contentType: contentType,
      sha256: sha || sha256Bytes(bytes.length ? bytes : Buffer.from(url)),
      byteLength: bytes.length,
      parserVersion: STUDIO_PARSER_VERSION,
      captureStatus: captureStatus,
      captureNote: note || (live ? "Live public fetch." : "Fixture-labeled."),
      bytesPath: bytesPath || null,
      runtimeEligible: false,
      studio: true,
      live: live && status === "ok",
      category: category,
      trust: "unverified",
      excerpt: bytes.toString("utf8").slice(0, 240),
      fetchStatus: status,
      pdfBoundary: pdfBoundary,
      substantiveText: extractionRecord ? extractionRecord.substantiveText : bytes.toString("utf8"),
      sanitizedText: extractionRecord ? extractionRecord.sanitizedText : null,
      extraction: extractionRecord ? {
        extractorVersion: EXTRACTOR_VERSION,
        quality: extractionRecord.quality,
        usedRegion: extractionRecord.usedRegion,
        title: extractionRecord.title,
        notUniversalParser: true,
      } : null,
      rawHtmlPersisted: false,
    };
    store.putSource(source);
    const fetchRec = {
      id: "FETCH-" + sourceId,
      sourceId: sourceId,
      url: url,
      canonical: canonical,
      timestamp: now,
      contentType: contentType,
      title: source.title,
      sha256: source.sha256,
      status: status,
      live: live && status === "ok",
      category: category,
      trust: "unverified",
      excerpt: source.excerpt,
      captureStatus: captureStatus,
      note: note,
      depth: depth,
    };
    if (store.putFetch) store.putFetch(fetchRec);

    const items = [];
    if (status === "ok" && !pdfBoundary) {
      const text = bytes.toString("utf8");
      const claims = extractClaims({ text: text, contentType: contentType });
      for (const c of claims) {
        const itemId = nextNumericId(existingIds(store).concat(items.map((i) => i.id)), "K-STUDIO-URL-");
        const item = {
          id: itemId,
          "type": "principle",
          statement: c.statement,
          sourceId: sourceId,
          sourceSha256: source.sha256,
          locator: { section: "Page", charStart: Math.max(0, text.indexOf(c.excerpt)), charEnd: 0, text: c.excerpt },
          claimKind: "vendor_opinion",
          kind: c.kind || "sourced_fact",
          accepted: false,
          createdAt: now,
          runtimeEligible: false,
          studio: true,
          reviewStatus: "proposed",
          writtenByOwner: false,
          sourceMode: fixture ? "fixture_url" : "public_url",
          category: category,
          workspace: (payload && (payload.workspaceId || payload.workspace)) || "default",
          workspaceId: (payload && (payload.workspaceId || payload.workspace)) || "default",
          applicableRole: (payload && payload.applicableRole) || "atlas",
          agentRole: "atlas",
          epistemicClass: "sourced_fact",
          trust: "unverified",
          tags: [fixture ? "fixture" : "live", "proposed"],
          freshness: now,
          url: canonical,
          origin: canonical,
          excerpt: c.excerpt,
          verifiedAt: now,
          untrustedInstructionAttempt: Boolean(c.untrustedInstructionAttempt),
        };
        item.locator.charEnd = item.locator.charStart + String(c.excerpt || "").length;
        store.putKnowledge(item);
        items.push(item);
      }
    }
    const row = { source: source, fetch: fetchRec, items: items.map(publicItem), pdfBoundary: pdfBoundary };
    results.push(row);
    return { ...row, html: (!fixture && contentType.includes("html")) ? (liveBody || "") : "" };
  }

  if (fixture) {
    await ingestOne(requested || "midas://fixture", 0);
  } else {
    const first = await ingestOne(requested, 0);
    if (crawl && first.source.fetchStatus === "ok") {
      const u = new URL(first.source.canonical || requested);
      const rawHtml = first.source.excerpt;
      // bounded same-host crawl from recorded links if we still have html-ish title
      const more = [];
      try {
        const got = await followRedirects(requested, {});
        if ((got.res.headers.get("content-type") || "").includes("html")) {
          const html = Buffer.from(await got.res.clone().arrayBuffer()).toString("utf8").slice(0, MAX_FETCH_BYTES);
          const links = htmlLinks(html, u.toString(), u.hostname).slice(0, CRAWL_MAX_PAGES - 1);
          for (const link of links) {
            if (results.length >= CRAWL_MAX_PAGES) break;
            if (results.some((r) => r.source.canonical === link || r.source.url === link)) continue;
            await ingestOne(link, 1);
          }
        }
      } catch {
        more.push("crawl follow failed");
      }
    }
  }

  return {
    capability: STUDIO_CAPABILITY,
    live: results.some((r) => r.source.live),
    fixture: Boolean(fixture) || results.every((r) => r.source.category === "fixture"),
    results: results,
    sources: results.map((r) => r.source),
    items: results.flatMap((r) => r.items),
    note: fixture
      ? "Fixture-labeled ingest. Not live research."
      : (results.some((r) => r.source.live) ? "Live public fetch recorded." : "Public URL fetch did not succeed; failure recorded honestly."),
    untrustedNote: untrustedNote(),
  };
}

export function reviewKnowledgeItem(store, id, payload) {
  const item = store.getKnowledge(id);
  if (!item) throw new Error("knowledge item not found: " + id);
  const action = String((payload && payload.action) || "").toLowerCase();
  const now = nowIso();
  if (action === "edit") {
    const statement = String((payload && payload.statement) || item.statement).trim();
    if (statement.length < 12) throw new Error("Edited statement is required.");
    const leaks = leakScan(statement);
    if (leaks.length) throw new Error("Edit rejected by leak scan: " + leaks.join(","));
    const newId = nextNumericId(existingIds(store), "K-STUDIO-REV-");
    const superseded = { ...item, reviewStatus: "superseded", accepted: false, runtimeEligible: false };
    store.putKnowledge(superseded);
    const revised = {
      ...item,
      id: newId,
      statement: statement,
      priorRevisionId: item.id,
      createdAt: now,
      verifiedAt: now,
      reviewStatus: item.kind === "owner_policy" || item.writtenByOwner ? "approved" : "needs_review",
      accepted: item.kind === "owner_policy" || item.writtenByOwner,
      runtimeEligible: item.kind === "owner_policy" || item.writtenByOwner,
      excerpt: statement.slice(0, 240),
      locator: { section: "Revision", charStart: 0, charEnd: statement.length, text: statement.slice(0, 240) },
    };
    store.putKnowledge(revised);
    if (store.putReview) store.putReview({ id: "REV-" + newId, knowledgeItemId: newId, priorRevisionId: item.id, action: "edit", actor: "owner", at: now, note: payload.note || "Owner edit created a new revision. Source history not overwritten." });
    return { item: publicItem(revised), superseded: publicItem(superseded), note: "New revision created. Prior item superseded. Source history retained." };
  }
  if (action === "reject") {
    const next = { ...item, reviewStatus: "rejected", accepted: false, runtimeEligible: false };
    store.putKnowledge(next);
    if (store.putReview) store.putReview({ id: "REV-" + id + "-" + Date.now(), knowledgeItemId: id, action: "reject", actor: "owner", at: now, note: payload.note || "Owner rejected." });
    return { item: publicItem(next), note: "Rejected. Will not be used for training or runtime." };
  }
  if (action === "needs_review") {
    const next = { ...item, reviewStatus: "needs_review", accepted: false, runtimeEligible: false };
    store.putKnowledge(next);
    if (store.putReview) store.putReview({ id: "REV-" + id + "-" + Date.now(), knowledgeItemId: id, action: "needs_review", actor: "owner", at: now, note: payload.note || "" });
    return { item: publicItem(next) };
  }
  if (action === "approve" || action === "authorize_as_policy") {
    const asPolicy = action === "authorize_as_policy" || item.kind === "owner_policy" || item.writtenByOwner;
    const next = {
      ...item,
      reviewStatus: "approved",
      accepted: true,
      runtimeEligible: true,
      verifiedAt: now,
      kind: asPolicy ? "owner_policy" : (item.kind || "sourced_fact"),
      claimKind: asPolicy ? "owner_policy" : item.claimKind,
      trust: asPolicy ? "owner" : (item.trust || "reviewed"),
    };
    store.putKnowledge(next);
    if (asPolicy && store.putOwnerRule) {
      store.putOwnerRule({ id: next.id, sourceId: next.sourceId, statement: next.statement, createdAt: now, authoritative: true, reviewStatus: "approved" });
    }
    if (store.putReview) store.putReview({ id: "REV-" + id + "-" + Date.now(), knowledgeItemId: id, action: action, actor: "owner", at: now, note: payload.note || (asPolicy ? "Owner authorized as policy." : "Owner approved sourced fact.") });
    return { item: publicItem(next), note: asPolicy ? "Authoritative owner policy after explicit owner authorization." : "Approved sourced fact. Not converted to owner policy." };
  }
  throw new Error("Unknown review action. Use approve, reject, edit, needs_review, or authorize_as_policy.");
}

export function inspectKnowledge(store, id) {
  const item = store.getKnowledge(id);
  if (!item) throw new Error("knowledge item not found: " + id);
  const source = store.getSource(item.sourceId);
  const fetches = (store.listFetches ? store.listFetches() : []).filter((f) => f.sourceId === item.sourceId);
  const reviews = (store.listReviews ? store.listReviews() : []).filter((r) => r.knowledgeItemId === id || r.priorRevisionId === id);
  const versions = ((store.listVersions && store.listVersions("atlas")) || []).filter((v) => {
    const ids = v.approvedItemIds || (v.retrievalPolicy && v.retrievalPolicy.approvedItemIds) || [];
    return ids.includes(id);
  });
  return {
    item: publicItem(item),
    source: source
      ? {
          id: source.id,
          url: source.url,
          canonical: source.canonical || source.url,
          title: source.title,
          retrievedAt: source.retrievedAt,
          contentType: source.contentType,
          sha256: source.sha256,
          captureStatus: source.captureStatus,
          live: source.live,
          category: source.category,
          excerpt: source.excerpt,
          fetchStatus: source.fetchStatus,
        }
      : null,
    excerpt: item.excerpt || (item.locator && item.locator.text),
    locator: item.locator,
    verifiedAt: item.verifiedAt || source && source.retrievedAt,
    fetches: fetches,
    reviews: reviews,
    assignedVersions: versions.map((v) => v.id),
    untrustedNote: untrustedNote(),
  };
}

export function trainAtlas(store, payload) {
  const actor = String((payload && payload.actor) || "owner");
  if (actor === "watcher" || actor === "independent_audit" || /^watcher-/.test(actor)) {
    const err = new Error("Watcher cannot create or modify Atlas versions.");
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
  if (actor === "conductor" || actor === "workflow_manager" || /^conductor-/.test(actor)) {
    const err = new Error("Conductor cannot create or modify Atlas versions. Train requires a recorded owner or demo_operator authorization.");
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
  const agentId = (payload && payload.agentId) || "atlas";
  if (agentId !== "atlas") throw new Error("Only the Atlas agent is trainable in this studio.");
  const workspaceId = payload && (payload.workspaceId || payload.workspace) || null;
  const items = store.listKnowledge() || [];
  const requested = new Set(asList(payload && payload.itemIds));
  const approved = items.filter((k) => {
    if (k.reviewStatus === "rejected" || k.reviewStatus === "superseded") return false;
    if (k.reviewStatus !== "approved" && !k.accepted) return false;
    if (requested.size && !requested.has(k.id)) return false;
    if (workspaceId) {
      const kid = itemWorkspaceId(k);
      if (kid && kid !== workspaceId) return false;
    }
    return true;
  });
  if (!approved.length) throw new Error("No approved knowledge items selected. Unapproved, rejected, and superseded items are excluded.");
  const excluded = items.filter((k) => requested.size && requested.has(k.id) && !approved.some((a) => a.id === k.id)).map((k) => ({ id: k.id, reason: k.reviewStatus || "unapproved" }));
  const parentId = (payload && payload.parentVersionId) || latestFrozenAtlasId(store);
  const parent = store.getVersion(parentId);
  const parentSnap = parent && parent.curriculumSnapshotId ? store.getCurriculumSnapshot(parent.curriculumSnapshotId) : null;
  const parentItemIds = (parentSnap && parentSnap.knowledgeItemIds) || [];
  const parentStill = items.filter((k) => {
    if (!parentItemIds.includes(k.id) || !k.accepted) return false;
    if (k.reviewStatus === "rejected" || k.reviewStatus === "superseded") return false;
    if (workspaceId) {
      const kid = itemWorkspaceId(k);
      if (kid && kid !== workspaceId && kid !== "default") return false;
    }
    return true;
  });
  const combined = [];
  const seen = new Set();
  for (const k of [...parentStill, ...approved]) {
    if (seen.has(k.id)) continue;
    seen.add(k.id);
    combined.push(k);
  }
  const sourceIds = [...new Set([
    ...((parent && parent.retrievalPolicy && parent.retrievalPolicy.sourceAllowlist) || []),
    ...((parentSnap && parentSnap.sourceIds) || []),
    ...combined.map((k) => k.sourceId).filter(Boolean),
  ])];
  const sourceSha256s = {};
  for (const sid of sourceIds) {
    const s = store.getSource(sid);
    if (s) sourceSha256s[sid] = s.sha256;
  }
  const knowledgeItemIds = combined.map((k) => k.id).sort();
  const snapPayload = {
    parserVersion: STUDIO_PARSER_VERSION,
    sourceIds: sourceIds,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
    declaredChange: (payload && payload.declaredChange) || "Owner-approved knowledge freeze",
  };
  const snapHash = sha256Bytes(Buffer.from(JSON.stringify(snapPayload)));
  const snapshot = {
    id: "curriculum-studio-" + snapHash.slice(0, 12),
    createdAt: nowIso(),
    parserVersion: STUDIO_PARSER_VERSION,
    sourceIds: sourceIds,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
    contentHash: snapHash,
    note: "Owner-approved studio snapshot. Unapproved/rejected/superseded excluded. Full documents, gold, reviewer notes, and evaluator secrets are not included.",
  };
  const savedSnap = store.putCurriculumSnapshot(snapshot);
  if (payload && payload.versionId) refuseAtlasRewrite(store, payload.versionId);
  const workspace = workspaceId && store.getWorkspace ? store.getWorkspace(workspaceId) : null;
  const frozen = freezeAtlasFromApproved(store, {
    versionId: payload && payload.versionId,
    parentVersionId: parentId,
    snapshot: savedSnap,
    declaredChange: (payload && payload.declaredChange) || ("Freeze approved studio knowledge. Parent " + parentId + " unchanged."),
    sourceAllowlist: sourceIds,
    approvedItemIds: knowledgeItemIds,
    contextBudgetTokens: payload && payload.contextBudgetTokens,
    maxItems: payload && payload.maxItems,
    workspaceId: workspaceId,
    workspaceIdentity: workspace ? { id: workspace.id, name: workspace.name, geography: workspace.geography, goal: workspace.goal } : (workspaceId ? { id: workspaceId } : null),
    roleObjective: (payload && payload.roleObjective) || (workspace && workspace.goal) || null,
    policies: (payload && payload.policies) || (workspace && workspace.constraints) || [],
  });
  const parentIds = new Set(parentItemIds);
  const addedKnowledge = knowledgeItemIds.filter((id) => !parentIds.has(id));
  const removedKnowledge = parentItemIds.filter((id) => !knowledgeItemIds.includes(id));
  const supersededKnowledge = items.filter((k) => k.reviewStatus === "superseded").map((k) => k.id);
  const ownerRules = approved.filter((k) => k.kind === "owner_policy" || k.claimKind === "owner_policy").map((k) => k.id);
  const trainingEvent = {
    id: "TE-" + frozen.version.id + "-" + (workspaceId || "default"),
    workspaceId: workspaceId || "default",
    agentId: agentId,
    prevVersionId: parentId,
    newVersionId: frozen.version.id,
    addedKnowledge: addedKnowledge,
    removedKnowledge: removedKnowledge,
    supersededKnowledge: supersededKnowledge,
    ownerRules: ownerRules,
    timestamp: frozen.version.createdAt,
    reason: frozen.version.declaredChange,
    relatedTestResult: { kind: (payload && payload.testKind) || "fixture", runId: (payload && payload.testRunId) || null },
    reviewStatus: "created",
    versionRole: "candidate_version",
    serving: false,
    promoted: false,
    note: "Creating a candidate version is not promotion and does not change serving_version.",
  };
  if (store.putTrainingEvent) store.putTrainingEvent(trainingEvent);
  if (frozen.version && !frozen.version.reviewStatus) {
    frozen.version = { ...frozen.version, reviewStatus: "created", promotion: false, versionRole: "candidate_version", serving: false };
  }
  const agent = store.getAgent(agentId);
  if (agent) {
    const hist = Array.isArray(agent.versionHistory) ? agent.versionHistory.slice() : [];
    if (!hist.includes(frozen.version.id)) hist.push(frozen.version.id);
    store.putAgent({ ...agent, versionHistory: hist, status: agent.status || "active" });
  }
  return {
    snapshot: savedSnap,
    version: frozen.version,
    parent: frozen.parent,
    approvedItemIds: knowledgeItemIds,
    excluded: excluded,
    trainingEvent: trainingEvent,
    promotion: false,
    versionRole: "candidate_version",
    serving: false,
    note: "New immutable Atlas candidate version. Creating a candidate is not serving and not promotion. atlas-v0..v15 were not rewritten.",
  };
}

function asList(v) {
  return Array.isArray(v) ? v : [];
}

export function pdfParseAvailable() {
  const r = spawnSync("pdftotext", ["-v"], { encoding: "utf8" });
  return r.status === 0 || /pdftotext/.test(String(r.stderr || r.stdout || ""));
}
