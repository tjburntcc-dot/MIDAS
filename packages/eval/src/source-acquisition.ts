/** Bounded owner-permitted public-domain research. Not internet-wide search. Not a search integration. */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { extractSubstantiveHtml, EXTRACTOR_VERSION } from "./html-extract.ts";

export const RESEARCH_CAPABILITY_LABEL = "Bounded owner-permitted public-domain research.";
export const SEARCH_INTEGRATION_EXISTS = false;
export const INTERNET_WIDE_SEARCH = false;
export const SOURCE_ACQUISITION_VERSION = "midas-source-acquisition-v0.1.0";

export const MISSION18_RESEARCH_OBJECTIVE =
  "Review permitted public roofing-software information to identify source-backed observations that could improve RidgeLine's offer positioning without inventing demand, pricing, market size, or customer outcomes.";

export const MISSION18_PERMITTED_DOMAINS = ["roofr.com", "jobnimbus.com", "acculynx.com"];
export const MISSION18_MAX_PAGES = 6;
export const MISSION18_MAX_DOMAINS = 3;
export const MISSION18_MAX_PAGES_PER_DOMAIN = 2;
export const MISSION18_MAX_DEPTH = 1;
export const MAX_REDIRECTS = 3;
export const MAX_FETCH_BYTES = 1_000_000;
export const FETCH_TIMEOUT_MS = 8000;
export const HOST_RATE_MS = 1500;

export const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/xhtml+xml",
];

export const DISALLOWED_PORTS = new Set([
  80, 22, 23, 25, 53, 110, 143, 445, 3306, 3389, 5432, 6379, 8080, 8443, 8888, 9000, 9200, 27017,
]);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.internal",
  "metadata.google.internal.",
]);

function nowIso() {
  return new Date().toISOString();
}

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function nextId(store, prefix) {
  const existing = store && store.listSourceAcquisitions ? store.listSourceAcquisitions() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r && r.id || "").match(re);
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

export function registrableDomain(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

export function stripCredentials(raw) {
  try {
    const u = new URL(String(raw || ""));
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return String(raw || "").replace(/\/\/[^/?#]*@/, "//");
  }
}

export function assertHttpsPublicUrl(raw, policy) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    const err = new Error("Invalid URL.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "invalid_url";
    throw err;
  }
  if (u.username || u.password) {
    const err = new Error("URLs with credentials are not permitted. Credentials were not persisted.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "credentials_forbidden";
    throw err;
  }
  if (u.protocol !== "https:") {
    const err = new Error("Only HTTPS URLs are permitted. Non-HTTPS rejected.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "non_https";
    throw err;
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host === "localhost" || host.endsWith(".localhost")) {
    const err = new Error("Host is blocked: localhost.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "localhost";
    throw err;
  }
  if (host === "169.254.169.254" || host.includes("metadata")) {
    const err = new Error("Cloud metadata hosts are blocked.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "cloud_metadata";
    throw err;
  }
  if (isBlockedIp(host)) {
    const reason = host === "127.0.0.1" || host === "::1" ? "loopback" : "private_range";
    const err = new Error("Private, loopback, or link-local addresses are blocked.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = reason;
    throw err;
  }
  const port = u.port ? Number(u.port) : 443;
  if (port !== 443 || DISALLOWED_PORTS.has(port)) {
    const err = new Error("Disallowed port: " + port + ". HTTPS port 443 only.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "disallowed_port";
    throw err;
  }
  const allowed = (policy && policy.allowedDomains) || null;
  if (allowed && allowed.length) {
    const reg = registrableDomain(host);
    const ok = allowed.some((d) => registrableDomain(d) === reg || host === String(d).toLowerCase());
    if (!ok) {
      const err = new Error("Domain not on the permitted list: " + host);
      err.code = "SOURCE_REJECTED";
      err.failureReason = "domain_not_permitted";
      throw err;
    }
  }
  return u;
}

async function resolvePublicHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isBlockedIp(host)) {
    const err = new Error("Host is blocked.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = isBlockedIp(host) ? "private_range" : "blocked_host";
    throw err;
  }
  const answers = await lookup(host, { all: true, verbatim: true });
  if (!answers.length) {
    const err = new Error("Host did not resolve.");
    err.code = "SOURCE_REJECTED";
    err.failureReason = "dns_failed";
    throw err;
  }
  for (const a of answers) {
    if (isBlockedIp(a.address)) {
      const err = new Error("Resolved address is private or otherwise blocked: not fetched.");
      err.code = "SOURCE_REJECTED";
      err.failureReason = "resolved_private";
      throw err;
    }
  }
  return answers;
}

const hostLastFetch = new Map();

function respectHostRate(host) {
  const last = hostLastFetch.get(host) || 0;
  const wait = HOST_RATE_MS - (Date.now() - last);
  if (wait > 0) {
    const until = Date.now() + wait;
    while (Date.now() < until) { /* bounded wait */ }
  }
  hostLastFetch.set(host, Date.now());
}

function contentTypeAllowed(ct) {
  const base = String(ct || "").split(";")[0].trim().toLowerCase();
  if (!base) return { ok: true, base: "text/html", note: "missing content-type treated as text/html" };
  if (ALLOWED_CONTENT_TYPES.includes(base)) return { ok: true, base: base };
  if (base.endsWith("+json")) return { ok: true, base: "application/json" };
  return { ok: false, base: base, note: "unsupported content-type: " + base };
}

export function detectLoginWall(html, status, url) {
  const t = String(html || "").toLowerCase();
  const path = (() => { try { return new URL(String(url || "")).pathname.toLowerCase(); } catch { return ""; } })();
  if (status === 401 || status === 403) return { loginWall: true, reason: "http_" + status };
  if (/\/(login|signin|sign-in|account\/login|auth\/)/.test(path)) return { loginWall: true, reason: "login_path" };
  if (/<input[^>]*type=["']password["']/i.test(String(html || ""))) return { loginWall: true, reason: "password_field" };
  if (/(sign in to continue|please log in|please sign in|create an account to continue|login required)/i.test(t)
    && /password|email|username/.test(t)
    && !/<main\b/i.test(String(html || ""))) {
    return { loginWall: true, reason: "login_prompt" };
  }
  return { loginWall: false };
}

export function detectAntiBot(html, status, headers) {
  const t = String(html || "").toLowerCase();
  const server = String((headers && (headers.get && headers.get("server") || headers.server)) || "").toLowerCase();
  if (status === 403 && (/cloudflare|attention required|captcha|cf-challenge/.test(t) || /cloudflare/.test(server))) {
    return { blocked: true, reason: "antibot_challenge" };
  }
  if (/checking your browser before accessing|enable javascript and cookies to continue|cf-browser-verification/.test(t)) {
    return { blocked: true, reason: "antibot_challenge" };
  }
  return { blocked: false };
}

function titleOf(html, fallback) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return fallback || "";
}

export function extractSameDomainLinks(html, baseUrl, permittedDomain) {
  const out = [];
  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  const base = new URL(baseUrl);
  while ((m = re.exec(String(html || "")))) {
    try {
      const abs = new URL(m[1], base);
      if (abs.protocol !== "https:") continue;
      if (registrableDomain(abs.hostname) !== registrableDomain(permittedDomain || base.hostname)) continue;
      if (abs.username || abs.password) continue;
      const port = abs.port ? Number(abs.port) : 443;
      if (port !== 443) continue;
      out.push(abs.toString());
    } catch { /* skip */ }
  }
  return [...new Set(out)];
}

export function isRelevantFollowLink(url, anchorText) {
  const u = String(url || "").toLowerCase();
  const t = String(anchorText || "").toLowerCase();
  const blob = u + " " + t;
  return /estimat|proposal|pricing|price|product|feature|takeoff|measure/.test(blob);
}

function emptyRecord(partial) {
  return {
    sourceId: partial.sourceId || null,
    workspaceId: partial.workspaceId || null,
    objectiveId: partial.objectiveId || null,
    originalUrl: stripCredentials(partial.originalUrl || ""),
    finalUrl: stripCredentials(partial.finalUrl || partial.originalUrl || ""),
    domain: partial.domain || null,
    fetchStatus: partial.fetchStatus || "failed",
    httpStatus: partial.httpStatus == null ? null : partial.httpStatus,
    contentType: partial.contentType || null,
    fetchedAt: partial.fetchedAt || nowIso(),
    checksum: partial.checksum || null,
    title: partial.title || null,
    sourceClassification: partial.sourceClassification || "unavailable_source",
    extractionMethod: partial.extractionMethod || null,
    failureReason: partial.failureReason || null,
    allowedByPolicy: partial.allowedByPolicy !== false,
    byteCount: partial.byteCount || 0,
    live: Boolean(partial.live),
    fixture: Boolean(partial.fixture),
    depth: partial.depth || 0,
    hops: partial.hops || [],
    credentialsExposed: false,
    capabilityLabel: RESEARCH_CAPABILITY_LABEL,
    searchIntegrationExists: false,
    internetWideSearch: false,
    note: partial.note || null,
  };
}

function persistAcquisition(store, rec) {
  const id = rec.id || rec.sourceId;
  const row = { ...rec, id: id, sourceId: rec.sourceId || id };
  if (store && store.putSourceAcquisition) {
    const persisted = { ...row };
    delete persisted.rawHtml;
    delete persisted.body;
    if (persisted.extraction) {
      persisted.extraction = {
        title: persisted.extraction.title || null,
        substantiveText: persisted.extraction.substantiveText || persisted.substantiveText || null,
        quality: persisted.extraction.quality || null,
        usedRegion: persisted.extraction.usedRegion || null,
        extractorVersion: persisted.extraction.extractorVersion || null,
      };
    }
    store.putSourceAcquisition(persisted);
  }
  return row;
}

async function performFetch(url, opts) {
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  if (!fetchImpl) throw new Error("fetch is not available");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts && opts.timeoutMs) || FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "MIDAS-SourceAcquisition/0.1 (owner-bounded; no-auth; no-bot-bypass)" },
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function acquirePublicSource(store, payload) {
  const originalUrl = String((payload && payload.url) || "");
  const workspaceId = payload && payload.workspaceId;
  const objectiveId = payload && payload.objectiveId;
  const policy = payload && payload.policy;
  const fixture = payload && payload.fixture;
  const depth = (payload && payload.depth) || 0;
  const live = !fixture;
  const id = (payload && payload.sourceId) || nextId(store, "SAC-");
  const fetchedAt = nowIso();

  let parsed;
  try {
    parsed = assertHttpsPublicUrl(originalUrl, policy);
  } catch (err) {
    const rec = persistAcquisition(store, emptyRecord({
      id: id,
      sourceId: id,
      workspaceId: workspaceId,
      objectiveId: objectiveId,
      originalUrl: stripCredentials(originalUrl),
      finalUrl: stripCredentials(originalUrl),
      domain: (() => { try { return registrableDomain(new URL(stripCredentials(originalUrl)).hostname); } catch { return null; } })(),
      fetchStatus: "rejected",
      failureReason: err.failureReason || "rejected",
      allowedByPolicy: false,
      live: live,
      fixture: Boolean(fixture),
      depth: depth,
      note: err instanceof Error ? err.message : String(err),
    }));
    rec.ok = false;
    rec.error = err instanceof Error ? err.message : String(err);
    rec.credentialsExposed = false;
    if (/user:|password|pass@/i.test(JSON.stringify(rec))) {
      throw new Error("Credentials leaked into persisted record.");
    }
    return rec;
  }

  if (depth > ((policy && policy.maxDepth) != null ? policy.maxDepth : MISSION18_MAX_DEPTH)) {
    const rec = persistAcquisition(store, emptyRecord({
      id: id, sourceId: id, workspaceId: workspaceId, objectiveId: objectiveId,
      originalUrl: originalUrl, finalUrl: originalUrl, domain: registrableDomain(parsed.hostname),
      fetchStatus: "rejected", failureReason: "depth_exceeded", allowedByPolicy: false, live: live, fixture: Boolean(fixture), depth: depth,
      note: "Depth exceeds bound.",
    }));
    rec.ok = false;
    return rec;
  }

  const hops = [];
  let current = parsed.toString();
  let html = "";
  let status = null;
  let contentType = null;
  let bytes = Buffer.from("");
  let finalUrl = current;
  let failureReason = null;
  let fetchStatus = "ok";
  let title = "";
  let extraction = null;

  if (fixture) {
    const hopsIn = Array.isArray(fixture.hops) ? fixture.hops : null;
    if (hopsIn) {
      const startHost = registrableDomain(parsed.hostname);
      for (let i = 0; i < hopsIn.length; i += 1) {
        const hop = hopsIn[i];
        hops.push({ url: hop.url || current, status: hop.status, location: hop.location || null });
        if (hop.status >= 300 && hop.status < 400) {
          if (i + 1 >= hopsIn.length && !hop.location) {
            fetchStatus = "failed";
            failureReason = "redirect_without_location";
            break;
          }
          if (hops.filter((h) => h.status >= 300 && h.status < 400).length > MAX_REDIRECTS) {
            fetchStatus = "rejected";
            failureReason = "excessive_redirects";
            break;
          }
          try {
            const next = new URL(hop.location, hop.url || current);
            if (next.protocol !== "https:") {
              fetchStatus = "rejected";
              failureReason = "non_https";
              break;
            }
            if (registrableDomain(next.hostname) !== startHost) {
              fetchStatus = "rejected";
              failureReason = "cross_domain_redirect";
              break;
            }
            current = next.toString();
            finalUrl = current;
          } catch {
            fetchStatus = "failed";
            failureReason = "invalid_redirect";
            break;
          }
        } else {
          status = hop.status;
          contentType = hop.contentType || fixture.contentType || "text/html";
          html = hop.body != null ? String(hop.body) : String(fixture.body || "");
          bytes = Buffer.from(html, "utf8");
          finalUrl = hop.url || current;
          break;
        }
      }
      if (hops.filter((h) => h.status >= 300 && h.status < 400).length > MAX_REDIRECTS && !failureReason) {
        fetchStatus = "rejected";
        failureReason = "excessive_redirects";
      }
    } else if (fixture.redirectTo) {
      hops.push({ url: current, status: fixture.status || 302, location: fixture.redirectTo });
      try {
        const next = new URL(fixture.redirectTo, current);
        if (next.protocol !== "https:") {
          fetchStatus = "rejected";
          failureReason = "non_https";
        } else if (registrableDomain(next.hostname) !== registrableDomain(parsed.hostname)) {
          fetchStatus = "rejected";
          failureReason = "cross_domain_redirect";
        } else {
          current = next.toString();
          finalUrl = current;
          status = fixture.finalStatus || 200;
          contentType = fixture.contentType || "text/html";
          html = String(fixture.body || "");
          bytes = Buffer.from(html, "utf8");
        }
      } catch {
        fetchStatus = "failed";
        failureReason = "invalid_redirect";
      }
    } else {
      status = fixture.status == null ? 200 : fixture.status;
      contentType = fixture.contentType || "text/html";
      html = String(fixture.body || fixture.text || "");
      bytes = Buffer.isBuffer(fixture.body) ? fixture.body : Buffer.from(html, "utf8");
      hops.push({ url: current, status: status, location: null });
    }
  } else {
    try {
      await resolvePublicHost(parsed.hostname);
      respectHostRate(parsed.hostname);
      const startHost = registrableDomain(parsed.hostname);
      for (let i = 0; i < MAX_REDIRECTS + 1; i += 1) {
        const res = await performFetch(current, payload);
        const loc = res.headers && res.headers.get ? res.headers.get("location") : null;
        hops.push({ url: current, status: res.status, location: loc });
        if (res.status >= 300 && res.status < 400) {
          if (i >= MAX_REDIRECTS) {
            fetchStatus = "rejected";
            failureReason = "excessive_redirects";
            status = res.status;
            break;
          }
          if (!loc) {
            fetchStatus = "failed";
            failureReason = "redirect_without_location";
            status = res.status;
            break;
          }
          const next = new URL(loc, current);
          assertHttpsPublicUrl(next.toString(), policy);
          if (registrableDomain(next.hostname) !== startHost) {
            fetchStatus = "rejected";
            failureReason = "cross_domain_redirect";
            status = res.status;
            break;
          }
          await resolvePublicHost(next.hostname);
          current = next.toString();
          finalUrl = current;
          continue;
        }
        status = res.status;
        const ct = contentTypeAllowed(res.headers && res.headers.get ? res.headers.get("content-type") : null);
        contentType = ct.base;
        if (!res.ok && res.status !== 200) {
          if (res.status === 401 || res.status === 403) {
            const rawHead = Buffer.from(await res.arrayBuffer()).toString("utf8").slice(0, 8000);
            const anti = detectAntiBot(rawHead, res.status, res.headers);
            const wall = detectLoginWall(rawHead, res.status, current);
            fetchStatus = "blocked";
            failureReason = anti.blocked ? anti.reason : (wall.loginWall ? wall.reason : "http_" + res.status);
          } else {
            fetchStatus = "failed";
            failureReason = "http_" + res.status;
          }
          break;
        }
        if (!ct.ok) {
          fetchStatus = "rejected";
          failureReason = "unsupported_type";
          break;
        }
        const raw = Buffer.from(await res.arrayBuffer());
        if (raw.length > MAX_FETCH_BYTES) {
          fetchStatus = "rejected";
          failureReason = "oversized";
          bytes = Buffer.from("");
          break;
        }
        bytes = raw;
        html = raw.toString("utf8");
        finalUrl = current;
        const anti = detectAntiBot(html, res.status, res.headers);
        if (anti.blocked) {
          fetchStatus = "blocked";
          failureReason = anti.reason;
          break;
        }
        const wall = detectLoginWall(html, res.status, current);
        if (wall.loginWall) {
          fetchStatus = "blocked";
          failureReason = wall.reason;
          break;
        }
        break;
      }
    } catch (err) {
      fetchStatus = "failed";
      failureReason = err.failureReason || "fetch_failed";
      const rec = persistAcquisition(store, emptyRecord({
        id: id, sourceId: id, workspaceId: workspaceId, objectiveId: objectiveId,
        originalUrl: originalUrl, finalUrl: finalUrl, domain: registrableDomain(parsed.hostname),
        fetchStatus: fetchStatus, httpStatus: status, contentType: contentType, fetchedAt: fetchedAt,
        failureReason: failureReason, allowedByPolicy: true, live: true, fixture: false, depth: depth,
        hops: hops, note: err instanceof Error ? err.message : String(err),
      }));
      rec.ok = false;
      rec.error = err instanceof Error ? err.message : String(err);
      rec.body = null;
      rec.extraction = null;
      rec.invented = false;
      return rec;
    }
  }

  if (fetchStatus === "ok" && (status === 401 || status === 403)) {
    fetchStatus = "blocked";
    failureReason = failureReason || "http_" + status;
  }
  if (fetchStatus === "ok" && html) {
    const wall = detectLoginWall(html, status, finalUrl);
    if (wall.loginWall) {
      fetchStatus = "blocked";
      failureReason = wall.reason;
    }
    const anti = detectAntiBot(html, status, null);
    if (anti.blocked) {
      fetchStatus = "blocked";
      failureReason = anti.reason;
    }
  }
  if (fetchStatus === "ok" && bytes.length > MAX_FETCH_BYTES) {
    fetchStatus = "rejected";
    failureReason = "oversized";
  }
  if (fetchStatus === "ok" && contentType) {
    const ct = contentTypeAllowed(contentType);
    if (!ct.ok) {
      fetchStatus = "rejected";
      failureReason = "unsupported_type";
    }
  }

  if (fetchStatus === "ok" && html && String(contentType || "").includes("html")) {
    extraction = extractSubstantiveHtml(html, {
      objectiveText: (payload && payload.objectiveText) || MISSION18_RESEARCH_OBJECTIVE,
      workspaceText: (payload && payload.workspaceText) || "RidgeLine Estimator roofing contractors estimating software",
    });
    title = extraction.title || titleOf(html, parsed.hostname);
  } else {
    title = titleOf(html, parsed.hostname);
  }

  const checksum = bytes.length ? sha256Bytes(bytes) : null;
  const ok = fetchStatus === "ok";
  const rec = persistAcquisition(store, {
    id: id,
    sourceId: id,
    workspaceId: workspaceId,
    objectiveId: objectiveId,
    originalUrl: stripCredentials(originalUrl),
    finalUrl: stripCredentials(finalUrl),
    domain: registrableDomain(new URL(finalUrl || originalUrl).hostname),
    fetchStatus: ok ? "ok" : fetchStatus,
    httpStatus: status,
    contentType: contentType,
    fetchedAt: fetchedAt,
    checksum: checksum,
    title: title || null,
    sourceClassification: ok ? (fixture ? "synthetic_fixture" : "live_public_source") : "unavailable_source",
    extractionMethod: extraction ? EXTRACTOR_VERSION : null,
    failureReason: ok ? null : failureReason,
    allowedByPolicy: true,
    byteCount: bytes.length,
    live: live && ok,
    fixture: Boolean(fixture),
    depth: depth,
    hops: hops,
    credentialsExposed: false,
    capabilityLabel: RESEARCH_CAPABILITY_LABEL,
    searchIntegrationExists: false,
    internetWideSearch: false,
    invented: false,
    note: ok ? (fixture ? "Fixture-labeled ingest. Not live research." : "Live public HTTPS fetch.") : (failureReason || "failed"),
    url: stripCredentials(originalUrl),
    canonical: stripCredentials(finalUrl),
    sha256: checksum,
    substantiveText: extraction ? extraction.substantiveText : (ok ? bytes.toString("utf8").slice(0, 12000) : null),
    extraction: extraction,
    rawHtml: ok ? html : null,
  });
  rec.ok = ok;
  rec.body = ok ? html : null;
  rec.error = ok ? null : (failureReason || "failed");
  rec.links = ok && html ? extractSameDomainLinks(html, finalUrl, rec.domain) : [];
  if (store && store.putSource && ok) {
    store.putSource({
      id: id,
      url: rec.originalUrl,
      canonical: rec.finalUrl,
      title: rec.title,
      publisher: rec.domain,
      retrievedAt: fetchedAt,
      contentType: contentType,
      sha256: checksum,
      byteLength: bytes.length,
      captureStatus: fixture ? "FIXTURE" : "LIVE_WEB",
      captureNote: rec.note,
      runtimeEligible: false,
      workspaceId: workspaceId,
      classification: rec.sourceClassification,
      originalUrl: rec.originalUrl,
      finalUrl: rec.finalUrl,
      fetchStatus: rec.fetchStatus,
      neverBecamePolicy: true,
      live: rec.live,
      fixture: Boolean(fixture),
      substantiveText: rec.substantiveText,
      extraction: extraction ? { extractorVersion: EXTRACTOR_VERSION, quality: extraction.quality, usedRegion: extraction.usedRegion } : null,
    });
  }
  if (store && store.putFetch) {
    store.putFetch({
      id: "FETCH-" + id,
      sourceId: id,
      url: rec.originalUrl,
      canonical: rec.finalUrl,
      timestamp: fetchedAt,
      contentType: contentType,
      title: rec.title,
      sha256: checksum,
      status: rec.fetchStatus,
      live: rec.live,
      category: fixture ? "fixture" : "live",
      note: rec.note,
      depth: depth,
    });
  }
  return rec;
}

export function sourceAcquisitionRequiredFields() {
  return [
    "sourceId", "workspaceId", "objectiveId", "originalUrl", "finalUrl", "domain",
    "fetchStatus", "httpStatus", "contentType", "fetchedAt", "checksum", "title",
    "sourceClassification", "extractionMethod", "failureReason", "allowedByPolicy", "byteCount",
  ];
}

export function recordHasRequiredFields(rec) {
  return sourceAcquisitionRequiredFields().every((k) => Object.prototype.hasOwnProperty.call(rec, k));
}
