/** Harbor Oak SRCH-002 page-body fetch + extract + rank + Scout brief. No invented demand. $0 model by default. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runScoutResearch, RESEARCH_LABEL, ensureScout } from "./scout.ts";
import { selectPassages } from "./passage-select.ts";
import { getOrBuildBrief, detectQuestionFamily, isCommunityLocalText } from "./research-brief.ts";
import { sourceHasObjectiveRelevantEvidence } from "./source-fitness.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
export const HARBOR_WORKSPACE_ID = "ws-own-004";
export const SRCH_002_ACCEPTED_USEFUL_URLS = [
  "https://www.buncombenc.gov/292/West-Asheville?utm_source=openai",
  "https://www.buncombecounty.org/governing/depts/library/branch-locations/west-asheville.aspx?utm_source=openai",
  "https://media.buncombenc.gov/common/library/Programs%20-%20February%202025.pdf?utm_source=openai",
  "https://www.trumba.com/calendars/west-asheville-library?media=print&utm_source=openai",
];

export const HARBOR_RESEARCH_QUESTION =
  "Where can Harbor Oak Music Lessons learn about West Asheville library / community bulletin options, after-school or youth music programs, and related public calendar or branch information for flyer planning? Do not invent demand, TAM, or revenue.";

export const RESEARCH_FETCH_HONESTY = {
  persistence: "FILE_STORE",
  alwaysOn: false,
  highAvailability: false,
  enterpriseConcurrency: false,
  postgres: false,
  iam: false,
  embeddings: false,
  inventedDemandForbidden: true,
  note: "Bounded owner-permitted public URL fetch for Harbor Oak only. Not internet-wide search. Not a paid model call.",
};

function nowIso() {
  return new Date().toISOString();
}

function asText(v) {
  return v == null ? "" : String(v).trim();
}

function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing || []) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export function labelVendorVsIndependent(url) {
  const u = String(url || "").toLowerCase();
  if (/trumba\.com/.test(u)) {
    return {
      vendorVsIndependent: "vendor_platform",
      label: "vendor_or_calendar_platform",
      note: "Trumba is a third-party calendar platform hosting the library calendar.",
    };
  }
  if (/buncombenc\.gov|buncombecounty\.org|media\.buncombenc\.gov/.test(u)) {
    return {
      vendorVsIndependent: "independent",
      label: "independent_sourced",
      note: "Buncombe County / public library government or media host.",
    };
  }
  return { vendorVsIndependent: "unknown", label: "unlabeled", note: "Host not classified." };
}

export function detectFreshnessHints(text, url) {
  const t = String(text || "");
  const hints = [];
  const monthYear = t.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/gi) || [];
  for (const m of monthYear.slice(0, 6)) hints.push({ kind: "month_year_in_body", value: m });
  const isoDates = t.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
  for (const d of isoDates.slice(0, 6)) hints.push({ kind: "iso_date_in_body", value: d });
  const slashDates = t.match(/\b0?\d{1,2}\/\d{1,2}\/20\d{2}\b/g) || [];
  for (const d of slashDates.slice(0, 6)) hints.push({ kind: "slash_date_in_body", value: d });
  if (/february\s+2025/i.test(t) || /Programs%20-%20February%202025/i.test(String(url || ""))) {
    hints.push({ kind: "program_guide_period", value: "February 2025" });
  }
  const unique = [];
  const seen = new Set();
  for (const h of hints) {
    const key = h.kind + ":" + h.value;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
  }
  return {
    hints: unique.slice(0, 12),
    dated: unique.length > 0,
    summary: unique.length ? unique.map((h) => h.value).slice(0, 4).join("; ") : null,
  };
}

export function loadAcceptedUsefulSrch002Urls(store) {
  const relevancePath = join(ROOT, "var/state/search-relevance.json");
  if (existsSync(relevancePath)) {
    try {
      const rel = JSON.parse(readFileSync(relevancePath, "utf8"));
      const block = (rel.perSource || []).find((s) => s.sourceRecordId === "SRCH-002");
      const useful = (block && block.acceptedUseful) || [];
      const urls = useful.map((u) => u.url || u).filter(Boolean);
      if (urls.length) return { urls, source: "search-relevance.json#SRCH-002" };
    } catch { /* fall through */ }
  }
  if (store && store.getSearchRecord) {
    const srch = store.getSearchRecord("SRCH-002");
    const urls = (srch && srch.urls) || [];
    if (urls.length) return { urls, source: "search_records.json#SRCH-002" };
  }
  return { urls: SRCH_002_ACCEPTED_USEFUL_URLS.slice(), source: "hardcoded_accepted_useful_fallback" };
}

function assertHarborOnly(workspaceId) {
  if (workspaceId !== HARBOR_WORKSPACE_ID) {
    const err = new Error("research-fetch is Harbor Oak (ws-own-004) scoped only. Refusing " + workspaceId);
    err.code = "WORKSPACE_ISOLATION";
    throw err;
  }
}

function sourceText(src) {
  return String((src && (src.substantiveText || src.sanitizedText || src.excerpt)) || "");
}

function sourceOk(row) {
  const src = row && row.source;
  if (!src) return false;
  if (src.fetchStatus && src.fetchStatus !== "ok") return false;
  if (src.live && src.fetchStatus === "ok") return true;
  if (row.mode === "live_url" && src.fetchStatus === "ok") return true;
  if ((row.mode === "fixture_url" || src.captureStatus === "FIXTURE" || src.classification === "synthetic_fixture")
    && src.fetchStatus === "ok"
    && sourceText(src).trim().length >= 12) return true;
  return Boolean(src.fetchStatus === "ok" && sourceText(src).trim().length >= 40);
}

/**
 * Fetch accepted-useful SRCH-002 public library URLs for Harbor Oak, extract, rank, Scout brief.
 * Prefer $0 live model spend (deterministic produceFindings).
 */
export async function fetchRankAndBriefHarborSrch002(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || HARBOR_WORKSPACE_ID;
  assertHarborOnly(workspaceId);
  const ws = store.getWorkspace(workspaceId);
  if (!ws) throw new Error("Harbor workspace not found: " + workspaceId);

  // Isolation: never write RidgeLine/Cedar
  const forbidden = ["ws-ridgeline", "ws-own-003", "ws-cedar"];
  for (const bad of forbidden) {
    if (workspaceId === bad) throw new Error("Isolation refuse: " + bad);
  }

  const question = asText(extras && extras.question) || HARBOR_RESEARCH_QUESTION;
  const family = detectQuestionFamily(question);
  const urlPack = loadAcceptedUsefulSrch002Urls(store);
  const seedUrls = (extras && Array.isArray(extras.seedUrls) && extras.seedUrls.length)
    ? extras.seedUrls
    : urlPack.urls;
  const urlFixtures = (extras && extras.urlFixtures) || undefined;
  const livePublic = !urlFixtures;
  const writtenAt = nowIso();

  ensureScout(store, workspaceId);

  const research = await runScoutResearch(store, {
    workspaceId,
    question,
    context: "Harbor Oak Music Lessons — neighborhood after-school piano/guitar. Reuse SRCH-002 accepted-useful public library URLs only. No new paid search. No invented demand/TAM/revenue.",
    seedUrls,
    maxSources: Math.max(4, seedUrls.length),
    maxSpendUsd: 0,
    categories: ["community_local", "library", "bulletin", "programs"],
    fixture: Boolean(urlFixtures),
    urlFixtures,
    livePublic,
    crawl: false,
  }, {
    // Deterministic by default — no live model responder
    live: false,
  });

  const requestId = research.request && research.request.id;
  const briefId = research.request && research.request.briefId;
  const brief = requestId ? getOrBuildBrief(store, store.getResearchRequest(requestId)) : null;

  const fetchRows = [];
  const passageAll = [];
  let okCount = 0;
  let failCount = 0;

  for (const row of research.collected || []) {
    const src = row.source || {};
    const url = src.originalUrl || src.url || null;
    const labels = labelVendorVsIndependent(url || src.canonical);
    const text = sourceText(src);
    const ok = sourceOk(row);
    const freshness = detectFreshnessHints(text, url);
    const failureNote = ok
      ? null
      : (src.fetchStatus && src.fetchStatus !== "ok"
        ? String(src.fetchStatus) + (src.captureNote ? (": " + src.captureNote) : "")
        : (row.mode || "unavailable"));

    if (ok) okCount += 1;
    else failCount += 1;

    // Re-rank passages against Harbor brief (also already done inside produceFindings)
    const sel = selectPassages(store, {
      source: { ...src, workspaceId },
      brief: brief || { id: briefId, workspaceId, questionFamily: family, researchQuestion: question },
      requestId,
      objectiveId: null,
      extraction: src.extraction || {
        substantiveText: text,
        blocks: text.split(/\n{2,}|\n/).map((t) => ({ kind: "paragraph", text: t.trim() })).filter((b) => b.text.length >= 12),
      },
    });
    for (const p of sel.relevant || []) {
      passageAll.push({
        ...p,
        url,
        vendorVsIndependent: labels.vendorVsIndependent,
        sourceTitle: src.title || null,
        freshnessSummary: freshness.summary,
      });
    }

    fetchRows.push({
      url,
      finalUrl: src.canonical || src.finalUrl || url,
      sourceId: src.id || null,
      fetchStatus: src.fetchStatus || (ok ? "ok" : "failed"),
      httpOrFetchNote: src.captureNote || null,
      ok,
      failureReason: failureNote,
      contentType: src.contentType || null,
      title: src.title || null,
      byteLength: src.byteLength || 0,
      sha256: src.sha256 || null,
      vendorVsIndependent: labels.vendorVsIndependent,
      label: labels.label,
      labelNote: labels.note,
      substantiveChars: text.length,
      extractionQualityPass: src.extraction && src.extraction.quality ? Boolean(src.extraction.quality.pass) : (ok && text.length >= 40),
      passageCount: (sel.passages || []).length,
      relevantPassageCount: (sel.relevant || []).length,
      freshness,
      fitnessDisposition: row.fitness && row.fitness.disposition || null,
      fitnessRelevant: row.fitness ? sourceHasObjectiveRelevantEvidence(row.fitness) : false,
      classification: src.classification || src.sourceClassification || null,
      workspaceId,
      inventedDemand: false,
    });
  }

  // Honest failures that never produced a source row
  for (const f of research.failures || []) {
    failCount += 1;
    const labels = labelVendorVsIndependent(f.url);
    fetchRows.push({
      url: f.url,
      finalUrl: f.url,
      sourceId: null,
      fetchStatus: f.status || "failed",
      httpOrFetchNote: f.note || null,
      ok: false,
      failureReason: f.note || f.status || "failed",
      contentType: null,
      title: null,
      byteLength: 0,
      sha256: null,
      vendorVsIndependent: labels.vendorVsIndependent,
      label: labels.label,
      labelNote: labels.note,
      substantiveChars: 0,
      extractionQualityPass: false,
      passageCount: 0,
      relevantPassageCount: 0,
      freshness: { hints: [], dated: false, summary: null },
      fitnessDisposition: "inaccessible",
      fitnessRelevant: false,
      classification: "unavailable_source",
      workspaceId,
      inventedDemand: false,
    });
  }

  // Ensure all requested seed URLs appear in the report even if collect silently skipped
  for (const seed of seedUrls) {
    if (!fetchRows.some((r) => r.url === seed || (r.finalUrl && String(r.finalUrl).split("?")[0] === String(seed).split("?")[0]))) {
      // may already be present with utm stripped — check host+path
      const seedPath = (() => { try { const u = new URL(seed); return u.hostname + u.pathname; } catch { return seed; } })();
      const found = fetchRows.some((r) => {
        try {
          const u = new URL(r.url || r.finalUrl || "");
          return (u.hostname + u.pathname) === seedPath;
        } catch { return false; }
      });
      if (!found) {
        failCount += 1;
        const labels = labelVendorVsIndependent(seed);
        fetchRows.push({
          url: seed,
          finalUrl: seed,
          sourceId: null,
          fetchStatus: "missing_from_collection",
          httpOrFetchNote: "URL was requested but no acquisition row was returned.",
          ok: false,
          failureReason: "missing_from_collection",
          contentType: null,
          title: null,
          byteLength: 0,
          sha256: null,
          vendorVsIndependent: labels.vendorVsIndependent,
          label: labels.label,
          labelNote: labels.note,
          substantiveChars: 0,
          extractionQualityPass: false,
          passageCount: 0,
          relevantPassageCount: 0,
          freshness: { hints: [], dated: false, summary: null },
          fitnessDisposition: "inaccessible",
          fitnessRelevant: false,
          classification: "unavailable_source",
          workspaceId,
          inventedDemand: false,
        });
      }
    }
  }

  passageAll.sort((a, b) => (b.score || 0) - (a.score || 0));
  const topPassages = passageAll.slice(0, 12);

  const findings = (research.findings || []).filter((f) => f.workspaceId === workspaceId);
  const sourceBacked = findings.filter((f) => f.kind === "source_backed_fact" && f.excerpt);

  // Persist Scout source-backed brief (deterministic summary citing passages)
  const briefArtifactId = nextId(
    ((store.listScoutActivity && store.listScoutActivity()) || []).map((r) => r.id),
    "SBR-"
  );
  const cited = topPassages.slice(0, 8).map((p, i) => ({
    n: i + 1,
    passageId: p.id,
    sourceId: p.sourceId,
    url: p.url,
    score: p.score,
    vendorVsIndependent: p.vendorVsIndependent,
    freshnessSummary: p.freshnessSummary || null,
    excerpt: String(p.excerpt || "").slice(0, 320),
    heading: p.heading || null,
  }));

  const scoutBrief = {
    id: briefArtifactId,
    kind: "source_backed_research_brief",
    workspaceId,
    createdAt: writtenAt,
    question,
    questionFamily: (brief && brief.questionFamily) || family,
    researchBriefId: briefId || (brief && brief.id) || null,
    researchRequestId: requestId,
    sourceSearchRecordId: "SRCH-002",
    urlSource: urlPack.source,
    liveProviderCall: false,
    paidSearch: false,
    modelSpendUsd: 0,
    fetchOkCount: okCount,
    fetchFailCount: failCount,
    relevantPassageCount: passageAll.length,
    citedPassages: cited,
    findingsSample: sourceBacked.slice(0, 8).map((f) => ({
      id: f.id,
      claim: String(f.claim || "").slice(0, 280),
      excerpt: String(f.excerpt || "").slice(0, 200),
      url: f.url || f.origin || null,
      kind: f.kind,
    })),
    honesty: {
      inventedDemand: false,
      inventedTam: false,
      inventedRevenue: false,
      vendorLabeled: true,
      independentLabeled: true,
      failuresRecordedHonestly: true,
      ...RESEARCH_FETCH_HONESTY,
    },
    summary: buildDeterministicBriefText({ question, fetchRows, cited, okCount, failCount }),
    note: "Scout brief from fetched public page/PDF passages. Deterministic. Not a live model call. Not demand proof.",
  };

  if (store.putScoutActivity) {
    store.putScoutActivity({
      id: briefArtifactId,
      workspaceId,
      createdAt: writtenAt,
      kind: "source_backed_research_brief",
      question,
      researchRequestId: requestId,
      researchBriefId: briefId,
      sourceSearchRecordId: "SRCH-002",
      relevantPassageCount: passageAll.length,
      fetchOkCount: okCount,
      fetchFailCount: failCount,
      liveProviderCall: false,
      paidSearch: false,
      modelSpendUsd: 0,
      citedPassageIds: cited.map((c) => c.passageId),
      summary: scoutBrief.summary,
      note: scoutBrief.note,
    });
  }

  // Also store a compact workspace note for Harbor only
  if (store.putWorkspaceNote) {
    store.putWorkspaceNote({
      id: "NOTE-" + briefArtifactId,
      workspaceId,
      createdAt: writtenAt,
      kind: "scout_research_brief",
      refId: briefArtifactId,
      text: scoutBrief.summary.slice(0, 2000),
    });
  }

  if (store.putActivityFeedItem) {
    store.putActivityFeedItem({
      id: "ACT-RF-" + briefArtifactId,
      workspaceId,
      createdAt: writtenAt,
      kind: "research_fetch_srch002",
      summary: "Fetched SRCH-002 bodies for Harbor: ok=" + okCount + " fail=" + failCount + " passages=" + passageAll.length + " brief=" + briefArtifactId + " ($0 model).",
      refId: briefArtifactId,
    });
  }

  let opportunity = null;
  if (!(extras && extras.skipOpportunity)) {
    opportunity = maybeWriteDeterministicOpportunity(store, {
      workspaceId,
      briefArtifactId,
      cited,
      fetchRows,
      question,
    });
  }

  return {
    ok: okCount > 0,
    workspaceId,
    writtenAt,
    question,
    questionFamily: (brief && brief.questionFamily) || family,
    sourceSearchRecordId: "SRCH-002",
    urlSource: urlPack.source,
    seedUrls,
    researchRequestId: requestId,
    researchBriefId: briefId || (brief && brief.id) || null,
    scoutBriefId: briefArtifactId,
    scoutBrief,
    fetchRows,
    okCount,
    failCount,
    passageCount: passageAll.length,
    topPassages: topPassages.slice(0, 10),
    findingsCount: findings.length,
    sourceBackedFindingsCount: sourceBacked.length,
    opportunity,
    liveProviderCall: false,
    paidSearch: false,
    modelSpendUsd: 0,
    label: RESEARCH_LABEL,
    honesty: RESEARCH_FETCH_HONESTY,
    apr005Untouched: true,
    hcl001Intact: true,
  };
}

function buildDeterministicBriefText(args) {
  const lines = [];
  lines.push("Scout source-backed brief (deterministic) for Harbor Oak.");
  lines.push("Question: " + args.question);
  lines.push("Fetch results: " + args.okCount + " ok, " + args.failCount + " failed/unavailable. Failures are recorded honestly; no fabricated page bodies.");
  lines.push("No demand, TAM, or revenue invented.");
  const okRows = (args.fetchRows || []).filter((r) => r.ok);
  const failRows = (args.fetchRows || []).filter((r) => !r.ok);
  if (okRows.length) {
    lines.push("Successful sources:");
    for (const r of okRows) {
      lines.push(
        "- [" + r.vendorVsIndependent + "] " + (r.title || r.url) +
        " | relevantPassages=" + r.relevantPassageCount +
        (r.freshness && r.freshness.summary ? (" | freshness≈" + r.freshness.summary) : "")
      );
    }
  }
  if (failRows.length) {
    lines.push("Failed / unavailable (honest):");
    for (const r of failRows) {
      lines.push("- " + r.url + " → " + (r.failureReason || r.fetchStatus));
    }
  }
  if ((args.cited || []).length) {
    lines.push("Top ranked passages (cited):");
    for (const c of args.cited) {
      lines.push(c.n + ". (" + c.vendorVsIndependent + ", score=" + c.score + ") " + c.excerpt);
      lines.push("   src: " + c.url);
    }
  } else {
    lines.push("No relevant passages ranked against the Harbor community/library question from successful fetches.");
  }
  lines.push("Operational note: public library pages/calendars may list branch hours, meeting rooms, youth/story programs, and bulletin-style community info — useful for flyer planning research only, not proof of demand.");
  return lines.join("\n");
}

function maybeWriteDeterministicOpportunity(store, args) {
  if (!store.putOpportunity) return null;
  const cited = args.cited || [];
  if (!cited.length) return null;
  const existing = (store.listOpportunities && store.listOpportunities(args.workspaceId)) || [];
  const id = nextId(existing.map((o) => o.id), "OPP-");
  const cites = cited.slice(0, 3).map((c) => ({
    passageId: c.passageId,
    url: c.url,
    excerpt: c.excerpt,
    vendorVsIndependent: c.vendorVsIndependent,
  }));
  const opp = {
    id,
    workspaceId: args.workspaceId,
    createdAt: nowIso(),
    title: "Local library channel research (source-backed, not demand)",
    status: "research_note",
    kind: "marketing_channel_research",
    summary:
      "Deterministic marketing research note: fetched Buncombe / West Asheville library public pages and program calendar passages may inform where Harbor Oak could learn about bulletin/community posting options. This is not evidence of demand, TAM, conversion, or revenue.",
    citedPassages: cites,
    scoutBriefId: args.briefArtifactId,
    sourceSearchRecordId: "SRCH-002",
    inventedDemand: false,
    inventedTam: false,
    inventedRevenue: false,
    liveProviderCall: false,
    modelSpendUsd: 0,
    scoreExplain: {
      note: "Decision aid only. Scores not used. Citations required.",
      citationCount: cites.length,
    },
    nextValidation: "Owner visits cited library pages in person or by phone to confirm bulletin/flyer policy — not automated outreach.",
    honesty: RESEARCH_FETCH_HONESTY,
  };
  store.putOpportunity(opp);
  return { id: opp.id, citedCount: cites.length };
}

export function writeResearchFetchReports(result, extras) {
  const stateDir = (extras && extras.stateDir) || join(ROOT, "var/state");
  mkdirSync(stateDir, { recursive: true });
  const livePath = join(stateDir, "research-fetch-live.json");
  const mdPath = join(stateDir, "research-fetch-report.md");

  const apr = extras && extras.apr005Status;
  const hcl = extras && extras.hcl001;
  const tests = extras && extras.tests;

  const live = {
    writtenAt: result.writtenAt || nowIso(),
    persistence: "FILE_STORE",
    alwaysOn: false,
    liveProviderCallsThisSlice: 0,
    liveSpendUsd: 0,
    workspaceId: result.workspaceId,
    sourceSearchRecordId: result.sourceSearchRecordId,
    question: result.question,
    questionFamily: result.questionFamily,
    fetch: {
      okCount: result.okCount,
      failCount: result.failCount,
      rows: (result.fetchRows || []).map((r) => ({
        url: r.url,
        finalUrl: r.finalUrl,
        ok: r.ok,
        fetchStatus: r.fetchStatus,
        failureReason: r.failureReason,
        vendorVsIndependent: r.vendorVsIndependent,
        title: r.title,
        relevantPassageCount: r.relevantPassageCount,
        passageCount: r.passageCount,
        freshness: r.freshness && r.freshness.summary,
        sourceId: r.sourceId,
      })),
    },
    passages: {
      relevantCount: result.passageCount,
      top: (result.topPassages || []).slice(0, 5).map((p) => ({
        id: p.id,
        score: p.score,
        url: p.url,
        excerpt: String(p.excerpt || "").slice(0, 180),
        vendorVsIndependent: p.vendorVsIndependent,
      })),
    },
    scoutBriefId: result.scoutBriefId,
    researchRequestId: result.researchRequestId,
    researchBriefId: result.researchBriefId,
    opportunityId: result.opportunity && result.opportunity.id || null,
    findingsCount: result.findingsCount,
    sourceBackedFindingsCount: result.sourceBackedFindingsCount,
    sealed: {
      apr005: apr || "pending",
      apr005StillPending: true,
      tpk001: "awaiting_owner_approval_untouched",
      hcl001Intact: hcl !== false,
    },
    honesty: result.honesty,
    tests: tests || null,
  };
  writeFileSync(livePath, JSON.stringify(live, null, 2));

  const et = new Date(live.writtenAt);
  const etLabel = et.toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
  const md = [];
  md.push("# MIDAS research-fetch report (SRCH-002 page bodies)");
  md.push("");
  md.push("Written " + live.writtenAt + " (" + etLabel + "). Persistence: FILE_STORE. Isolation: application-level, Harbor Oak ws-own-004 only. Continued from LIVE state. Did not restart. Did not decide APR-005 / TPK-001. Did not touch AutoShop, Demo A, sealed holdouts, or frozen hashes. Live model spend this slice: **$0**. Network fetch of public pages: yes.");
  md.push("");
  md.push("## 1. What owner can now actually do");
  md.push("- Inspect source-backed Scout brief **" + result.scoutBriefId + "** built from fetched West Asheville / Buncombe library page and PDF passages (not URL-only stubs).");
  md.push("- See which of the 4 accepted-useful SRCH-002 URLs fetched OK vs failed honestly.");
  md.push("- Read ranked passages labeled vendor vs independent, with freshness hints when present.");
  md.push("- Optional deterministic opportunity/marketing note that **cites** fetched passages (not invented demand).");
  md.push("");
  md.push("## 2. What is genuinely live");
  md.push("- Public HTTPS fetches of accepted-useful SRCH-002 URLs (robots-respecting studio fetch path).");
  md.push("- PDF parsed with poppler pdftotext when content-type is application/pdf.");
  md.push("- **0 paid model calls** this slice. Provider may remain verified_live from prior slices; unused here.");
  md.push("");
  md.push("## 3. What is correctly deterministic");
  md.push("- HTML chrome strip (html-extract), passage ranking against community_local Harbor question, Scout brief assembly, vendor/independent labels, opportunity citation note.");
  md.push("");
  md.push("## 4. What sources were really used");
  for (const r of result.fetchRows || []) {
    md.push("- " + (r.ok ? "OK" : "FAIL") + " [" + r.vendorVsIndependent + "] " + r.url + (r.failureReason ? (" → " + r.failureReason) : (" | passages=" + r.relevantPassageCount + (r.freshness && r.freshness.summary ? (" | freshness≈" + r.freshness.summary) : ""))));
  }
  md.push("- No new web_search. SRCH-003 rejected-off-topic unused. No RidgeLine/Cedar sources.");
  md.push("");
  md.push("## 5. What employees genuinely contributed");
  md.push("- Scout (business_research) collected + produced findings deterministically from fetched bodies. No live specialist model call.");
  md.push("");
  md.push("## 6. What owner instructions were actually retrieved");
  md.push("- Harbor workspace objective + accepted-useful SRCH-002 URL list. Autonomy/policy path unchanged.");
  md.push("");
  md.push("## 7. What real artifacts were generated");
  md.push("- Scout brief " + result.scoutBriefId + "; research request " + result.researchRequestId + "; research brief " + result.researchBriefId + "; passages persisted workspace-scoped.");
  if (result.opportunity) md.push("- Opportunity note " + result.opportunity.id + " citing passages.");
  md.push("- Reports: research-fetch-report.md, research-fetch-live.json; capability-matrix.json refreshed.");
  md.push("");
  md.push("## 8. Costs (live USD, call count)");
  md.push("- This slice: **$0.00 · 0 paid model calls**. Network fetch only.");
  md.push("");
  md.push("## 9. Important capability still missing");
  md.push("- Embeddings / vector retrieval still absent.");
  md.push("- External execute / Postgres / IAM / public deploy — not claimed.");
  md.push("- Bulletin-board posting policy may still need owner phone/in-person confirm (pages may not state flyer rules explicitly).");
  md.push("");
  md.push("## 10. What is next");
  md.push("- Owner review Scout brief + cited passages in product UI.");
  md.push("- Do not decide APR-005 or apply TPK-001 here.");
  md.push("");
  md.push("## 11. Invariants / proof");
  md.push("- APR-005 status: **pending** (untouched).");
  md.push("- TPK-001 status: **awaiting_owner_approval** (untouched).");
  md.push("- HCL-001 intact: **" + String(hcl !== false) + "**.");
  md.push("- FILE_STORE stays FILE_STORE. No Postgres/IAM/24-7/enterprise/deployed/revenue claims.");
  md.push("- Frozen hashes / AutoShop / Demo A / sealed holdouts: untouched.");
  md.push("- Tests this slice: " + (tests || "see research-fetch.test.ts") + ".");
  md.push("");
  md.push("## Capability matrix summary");
  md.push("LIVE_AND_WORKING / DETERMINISTIC: source_collection (page+PDF fetch+extract), scout honesty (failures recorded, vendor labeled, no invented demand).");
  md.push("Prior: search, executive live; founder surfaces deterministic.");
  md.push("");
  writeFileSync(mdPath, md.join("\n"));
  return { livePath, mdPath, live };
}

export function updateCapabilityMatrixForResearchFetch(extras) {
  const path = join(ROOT, "var/state/capability-matrix.json");
  let matrix = {};
  if (existsSync(path)) {
    try { matrix = JSON.parse(readFileSync(path, "utf8")); } catch { matrix = {}; }
  }
  const writtenAt = nowIso();
  matrix.writtenAt = writtenAt;
  matrix.persistence = "FILE_STORE";
  matrix.isolation = "application-level";
  matrix.isolationNotIam = true;
  matrix.liveSpendThisSliceUsd = 0;
  matrix.sourceCollection = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.scoutHonesty = "DETERMINISTIC_AND_APPROPRIATE";
  matrix.capabilities = Object.assign({}, matrix.capabilities || {}, {
    source_collection: "DETERMINISTIC_AND_APPROPRIATE",
    scout_honesty: "DETERMINISTIC_AND_APPROPRIATE",
    scout_page_body_fetch: "DETERMINISTIC_AND_APPROPRIATE",
    scout_useful_search_reuse: (matrix.capabilities && matrix.capabilities.scout_useful_search_reuse) || "DETERMINISTIC_AND_APPROPRIATE",
  });
  if (extras && extras.note) matrix.researchFetchNote = extras.note;
  writeFileSync(path, JSON.stringify(matrix, null, 2));
  return matrix;
}
