import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leakageHits, loadLeakageNames, defaultCurriculumRoot } from "./curriculum.js";
import { CHALLENGE_CASES_V0, CHALLENGE_POLICIES_DIR, DEV_CASES_V01 } from "./paths.js";
import { compileOwnerSpecsAgainstText, compileApplicabilityFromSource, OWNER_APPLICABILITY_SPECS } from "./applicability.js";

export const OWNER_PARSER_VERSION = "midas-owner-policy-parser-v0.1.0";
export const OWNER_SOURCE_IDS = ["SRC-OWN-001", "SRC-OWN-002", "SRC-OWN-003", "SRC-OWN-004", "SRC-OWN-005", "SRC-OWN-006"];

export const OWNER_CANDIDATES = [
  { id: "K-OWN-001-01", sourceId: "SRC-OWN-001", "type": "constraint", claimKind: "owner_policy", competency: "qualification_thresholds",
    statement: "Serve United States accounts only. Accounts headquartered outside the United States are excluded.",
    phrases: ["Serve United States accounts only", "headquartered outside the United States are excluded"],
    section: "Rules" },
  { id: "K-OWN-001-02", sourceId: "SRC-OWN-001", "type": "decision_rule", claimKind: "owner_policy", competency: "qualification_thresholds",
    statement: "Require a minimum of eight employees. Headcount below eight is a hard exclusion.",
    phrases: ["minimum of eight employees", "Headcount below eight is a hard exclusion"],
    section: "Rules" },
  { id: "K-OWN-001-03", sourceId: "SRC-OWN-001", "type": "decision_rule", claimKind: "owner_policy", competency: "qualification_thresholds",
    statement: "Require verified monthly spend of at least 2500 USD. Do not infer spend from employee count.",
    phrases: ["verified monthly spend of at least 2500 USD", "Do not infer spend from employee count"],
    section: "Rules" },
  { id: "K-OWN-001-04", sourceId: "SRC-OWN-001", "type": "procedure", claimKind: "owner_policy", competency: "qualification_thresholds",
    statement: "When employee count or verified monthly spend is unknown, research is required. Do not invent the missing number.",
    phrases: ["When employee count or verified monthly spend is unknown", "Do not invent the missing number"],
    section: "Rules" },
  { id: "K-OWN-002-01", sourceId: "SRC-OWN-002", "type": "decision_rule", claimKind: "owner_policy", competency: "buyer_authority",
    statement: "Require owner authority or written delegation before qualification.",
    phrases: ["Require owner authority or written delegation"],
    section: "Rules" },
  { id: "K-OWN-002-02", sourceId: "SRC-OWN-002", "type": "constraint", claimKind: "owner_policy", competency: "buyer_authority",
    statement: "A job title is not proof of purchasing authority, including director, vice president, and manager titles.",
    phrases: ["A job title is not proof of purchasing authority"],
    section: "Rules" },
  { id: "K-OWN-002-03", sourceId: "SRC-OWN-002", "type": "decision_rule", claimKind: "owner_policy", competency: "buyer_authority",
    statement: "Records marked none, headquarters-only, or title-only are excluded.",
    phrases: ["none, headquarters-only, or title-only are excluded"],
    section: "Rules" },
  { id: "K-OWN-003-01", sourceId: "SRC-OWN-003", "type": "decision_rule", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "A first-party hiring signal older than 45 days is stale and does not establish current hiring.",
    phrases: ["older than 45 days is stale", "does not establish current hiring"],
    section: "Rules" },
  { id: "K-OWN-003-02", sourceId: "SRC-OWN-003", "type": "constraint", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "A current first-party freeze overrides older third-party listings.",
    phrases: ["current first-party freeze overrides older third-party listings"],
    section: "Rules" },
  { id: "K-OWN-003-03", sourceId: "SRC-OWN-003", "type": "constraint", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "Third-party listings do not establish current first-party hiring on their own.",
    phrases: ["Third-party listings do not establish current first-party hiring"],
    section: "Rules" },
  { id: "K-OWN-004-01", sourceId: "SRC-OWN-004", "type": "decision_rule", claimKind: "owner_policy", competency: "territory",
    statement: "Served regions are Southeast, Midwest, Northeast, and Southwest.",
    phrases: ["Served regions are Southeast, Midwest, Northeast, and Southwest"],
    section: "Rules" },
  { id: "K-OWN-004-02", sourceId: "SRC-OWN-004", "type": "constraint", claimKind: "owner_policy", competency: "territory",
    statement: "The Pacific Northwest is reserved and is not assignable to this motion.",
    phrases: ["Pacific Northwest is reserved"],
    section: "Rules" },
  { id: "K-OWN-004-03", sourceId: "SRC-OWN-004", "type": "procedure", claimKind: "owner_policy", competency: "territory",
    statement: "When region is unknown, research is required. Do not invent a served-region assignment.",
    phrases: ["When region is unknown, research is required"],
    section: "Rules" },
  { id: "K-OWN-005-01", sourceId: "SRC-OWN-005", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "Existing customers are protected and must not be qualified for new-logo outreach.",
    phrases: ["Existing customers are protected"],
    section: "Rules" },
  { id: "K-OWN-005-02", sourceId: "SRC-OWN-005", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "Public-sector and government verticals are a lockout for this motion.",
    phrases: ["Public-sector and government verticals are a lockout"],
    section: "Rules" },
  { id: "K-OWN-006-01", sourceId: "SRC-OWN-006", "type": "decision_rule", claimKind: "owner_policy", competency: "unit_economics",
    statement: "Require a minimum of four seats. Accounts below four seats are excluded.",
    phrases: ["minimum of four seats"],
    section: "Rules" },
  { id: "K-OWN-006-02", sourceId: "SRC-OWN-006", "type": "decision_rule", claimKind: "owner_policy", competency: "unit_economics",
    statement: "Exclude accounts whose modeled payback is longer than nine months.",
    phrases: ["payback is longer than nine months"],
    section: "Rules" },
  { id: "K-OWN-006-03", sourceId: "SRC-OWN-006", "type": "constraint", claimKind: "owner_policy", competency: "unit_economics",
    statement: "Seller capacity must cover at least twelve new accounts.",
    phrases: ["capacity must cover at least twelve new accounts"],
    section: "Rules" },
];

export const OWNER_REVISION_SOURCE_IDS = ["SRC-OWN-007"];

export const OWNER_REVISION_CANDIDATES = [
  { id: "K-OWN-007-01", sourceId: "SRC-OWN-007", "type": "constraint", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "A stale first-party hiring signal is insufficient to establish current hiring and requires research; it is not an automatic disqualification.",
    phrases: ["insufficient to establish current hiring and requires research", "not an automatic disqualification"],
    section: "Rules" },
  { id: "K-OWN-007-02", sourceId: "SRC-OWN-007", "type": "constraint", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "A current first-party disqualifier such as a hiring freeze can exclude the account even when older third-party listings remain.",
    phrases: ["current first-party disqualifier such as a hiring freeze", "older third-party listings remain"],
    section: "Rules" },
  { id: "K-OWN-007-03", sourceId: "SRC-OWN-007", "type": "decision_rule", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "When first-party and third-party hiring evidence conflict, or when current first-party hiring status is unknown, research is required.",
    phrases: ["first-party and third-party hiring evidence conflict", "current first-party hiring status is unknown"],
    section: "Rules" },
  { id: "K-OWN-007-04", sourceId: "SRC-OWN-007", "type": "failure_pattern", claimKind: "owner_policy", competency: "signal_freshness",
    statement: "Do not treat recency decay or stale-only evidence as a hard exclusion.",
    phrases: ["Do not treat recency decay or stale-only evidence as a hard exclusion"],
    section: "Rules" },
];

export const CHALLENGE_ORACLE_ITEMS = {
  "ATLAS-DEV-101": ["K-OWN-001-01", "K-OWN-001-02", "K-OWN-001-03"],
  "ATLAS-DEV-102": ["K-OWN-002-01", "K-OWN-002-02", "K-OWN-002-03"],
  "ATLAS-DEV-103": ["K-OWN-003-01", "K-OWN-003-02", "K-OWN-003-03", "K-OWN-007-01", "K-OWN-007-03"],
  "ATLAS-DEV-104": ["K-OWN-004-01", "K-OWN-004-02", "K-OWN-004-03"],
  "ATLAS-DEV-105": ["K-OWN-005-01", "K-OWN-005-02", "K-OWN-008-01", "K-OWN-008-02"],
  "ATLAS-DEV-106": ["K-OWN-006-01", "K-OWN-006-02", "K-OWN-006-03"],
  "ATLAS-DEV-107": ["K-OWN-002-01", "K-OWN-002-03"],
};

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function findLocator(text, phrases, section) {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const i = lower.indexOf(phrase.toLowerCase());
    if (i >= 0) {
      return { section: section, charStart: i, charEnd: i + phrase.length, text: text.slice(i, i + phrase.length) };
    }
  }
  return null;
}

export function defaultOwnerPolicyDir() {
  return process.env.MIDAS_OWNER_POLICY_DIR || CHALLENGE_POLICIES_DIR;
}

export function listOwnerPolicyFiles(dir) {
  const root = dir || defaultOwnerPolicyDir();
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((n) => n.endsWith(".md")).sort().map((n) => join(root, n));
}

export function leakScanOwnerText(text, leakNames) {
  const hits = leakageHits(text, leakNames);
  if (/ATLAS-DEV-\d{3}/i.test(text)) hits.push("ATLAS-DEV-case-id");
  if (/ATLAS-SEALED-/i.test(text)) hits.push("ATLAS-SEALED-");
  return [...new Set(hits)];
}

export function loadOwnerLeakNames(extraPaths) {
  const names = new Set(loadLeakageNames(DEV_CASES_V01));
  for (const path of extraPaths || [CHALLENGE_CASES_V0]) {
    if (!path || !existsSync(path)) continue;
    for (const n of loadLeakageNames(path)) names.add(n);
  }
  return [...names];
}

export async function ingestOwnerPolicyPack(args) {
  const store = args.store;
  const curriculumRoot = args.curriculumRoot || defaultCurriculumRoot();
  const policyDir = args.policyDir || defaultOwnerPolicyDir();
  const leakNames = args.leakNames || loadOwnerLeakNames(args.extraLeakPaths);
  const now = new Date().toISOString();
  const files = listOwnerPolicyFiles(policyDir);
  if (!files.length) throw new Error("No owner policy files in " + policyDir);
  const sourceReports = [];
  const acceptedAll = [];
  const rejectedAll = [];
  const fileBySource = {
    "SRC-OWN-001": "SRC-OWN-001-qualification-thresholds.md",
    "SRC-OWN-002": "SRC-OWN-002-buyer-authority.md",
    "SRC-OWN-003": "SRC-OWN-003-signal-freshness.md",
    "SRC-OWN-004": "SRC-OWN-004-territory.md",
    "SRC-OWN-005": "SRC-OWN-005-protected-accounts.md",
    "SRC-OWN-006": "SRC-OWN-006-unit-economics.md",
  };

  for (const sourceId of OWNER_SOURCE_IDS) {
    const fname = fileBySource[sourceId];
    const path = join(policyDir, fname);
    if (!existsSync(path)) throw new Error("missing owner policy " + path);
    const bytes = readFileSync(path);
    const text = bytes.toString("utf8");
    const leaks = leakScanOwnerText(text, leakNames);
    if (leaks.length) {
      rejectedAll.push({ id: sourceId, reason: "leakage:" + leaks.join(","), statement: fname });
      throw new Error("Owner policy leak scan rejected " + fname + ": " + leaks.join(","));
    }
    const sha = sha256Bytes(bytes);
    const dir = join(curriculumRoot, "sources", sourceId);
    mkdirSync(dir, { recursive: true });
    const bytesPath = join(dir, sha);
    if (!existsSync(bytesPath)) writeFileSync(bytesPath, bytes);
    const record = {
      id: sourceId,
      url: "midas://owner-policy/" + fname,
      title: "Synthetic owner-authored policy for development evaluation",
      publisher: "MIDAS owner (synthetic)",
      retrievedAt: now,
      contentType: "text/markdown; charset=utf-8",
      sha256: sha,
      byteLength: bytes.length,
      parserVersion: OWNER_PARSER_VERSION,
      captureStatus: "OWNER_AUTHORED",
      captureNote: "Synthetic owner-authored policy for development evaluation. Not real customer policy. Not a live web revision.",
      bytesPath: bytesPath,
      runtimeEligible: true,
    };
    store.putSource(record);
    sourceReports.push({ id: sourceId, captureStatus: "OWNER_AUTHORED", sha256: sha, byteLength: bytes.length, url: record.url, note: record.captureNote });

    for (const cand of OWNER_CANDIDATES) {
      if (cand.sourceId !== sourceId) continue;
      const loc = findLocator(text, cand.phrases, cand.section);
      const itemLeaks = leakScanOwnerText(cand.statement, leakNames);
      if (!loc) {
        rejectedAll.push({ id: cand.id, sourceId: sourceId, reason: "unsupported_claim_no_locator", statement: cand.statement });
        continue;
      }
      if (itemLeaks.length) {
        rejectedAll.push({ id: cand.id, sourceId: sourceId, reason: "leakage:" + itemLeaks.join(","), statement: cand.statement });
        continue;
      }
      const item = {
        id: cand.id,
        "type": cand.type,
        statement: cand.statement,
        sourceId: sourceId,
        sourceSha256: sha,
        locator: loc,
        claimKind: cand.claimKind,
        competency: cand.competency,
        accepted: true,
        createdAt: now,
        runtimeEligible: true,
      };
      store.putKnowledge(item);
      acceptedAll.push(item);
    }
  }

  const sourceSha256s = {};
  for (const s of store.listSources()) {
    if (OWNER_SOURCE_IDS.includes(s.id)) sourceSha256s[s.id] = s.sha256;
  }
  const knowledgeItemIds = acceptedAll.map((k) => k.id).sort();
  const snapPayload = {
    parserVersion: OWNER_PARSER_VERSION,
    sourceIds: OWNER_SOURCE_IDS,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
  };
  const snapHash = sha256Bytes(Buffer.from(JSON.stringify(snapPayload)));
  const snapshot = {
    id: "curriculum-owner-dev-" + snapHash.slice(0, 12),
    createdAt: now,
    parserVersion: OWNER_PARSER_VERSION,
    sourceIds: OWNER_SOURCE_IDS,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
    contentHash: snapHash,
    note: "Synthetic owner-authored policy for development evaluation. New snapshot only; earlier Phase 0 snapshots were not mutated.",
  };
  const savedSnap = store.putCurriculumSnapshot(snapshot);
  return {
    sources: sourceReports,
    knowledgeAccepted: acceptedAll.length,
    knowledgeRejected: rejectedAll.length,
    rejected: rejectedAll,
    items: acceptedAll,
    snapshot: savedSnap,
    parserVersion: OWNER_PARSER_VERSION,
    untrustedNote: "Owner-authored policy text is evaluation material. It never changes system instructions and is never treated as gold.",
  };
}


export async function ingestOwnerPolicyRevision(args) {
  const store = args.store;
  const curriculumRoot = args.curriculumRoot || defaultCurriculumRoot();
  const policyDir = args.policyDir || defaultOwnerPolicyDir();
  const leakNames = args.leakNames || loadOwnerLeakNames(args.extraLeakPaths);
  const now = new Date().toISOString();
  const fname = "SRC-OWN-007-signal-freshness-clarification.md";
  const path = join(policyDir, fname);
  if (!existsSync(path)) throw new Error("missing owner policy revision " + path);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const leaks = leakScanOwnerText(text, leakNames);
  if (leaks.length) throw new Error("Owner policy leak scan rejected " + fname + ": " + leaks.join(","));
  const sha = sha256Bytes(bytes);
  const dir = join(curriculumRoot, "sources", "SRC-OWN-007");
  mkdirSync(dir, { recursive: true });
  const bytesPath = join(dir, sha);
  if (!existsSync(bytesPath)) writeFileSync(bytesPath, bytes);
  const record = {
    id: "SRC-OWN-007",
    url: "midas://owner-policy/" + fname,
    title: "Synthetic owner-authored freshness clarification for development evaluation",
    publisher: "MIDAS owner (synthetic)",
    retrievedAt: now,
    contentType: "text/markdown; charset=utf-8",
    sha256: sha,
    byteLength: bytes.length,
    parserVersion: OWNER_PARSER_VERSION,
    captureStatus: "OWNER_AUTHORED",
    captureNote: "Synthetic owner-authored policy revision. New snapshot only. Earlier owner snapshot was not mutated.",
    bytesPath: bytesPath,
    runtimeEligible: true,
  };
  store.putSource(record);
  const acceptedAll = [];
  const rejectedAll = [];
  for (const cand of OWNER_REVISION_CANDIDATES) {
    const loc = findLocator(text, cand.phrases, cand.section);
    const itemLeaks = leakScanOwnerText(cand.statement, leakNames);
    if (!loc) {
      rejectedAll.push({ id: cand.id, sourceId: cand.sourceId, reason: "unsupported_claim_no_locator", statement: cand.statement });
      continue;
    }
    if (itemLeaks.length) {
      rejectedAll.push({ id: cand.id, sourceId: cand.sourceId, reason: "leakage:" + itemLeaks.join(","), statement: cand.statement });
      continue;
    }
    const item = {
      id: cand.id,
      "type": cand.type,
      statement: cand.statement,
      sourceId: "SRC-OWN-007",
      sourceSha256: sha,
      locator: loc,
      claimKind: cand.claimKind,
      competency: cand.competency,
      accepted: true,
      createdAt: now,
      runtimeEligible: true,
    };
    store.putKnowledge(item);
    acceptedAll.push(item);
  }
  const ownerIds = [...OWNER_SOURCE_IDS, ...OWNER_REVISION_SOURCE_IDS];
  const sourceSha256s = {};
  for (const s of store.listSources()) {
    if (ownerIds.includes(s.id)) sourceSha256s[s.id] = s.sha256;
  }
  const existingOwner = (store.listKnowledge() || []).filter((k) => String(k.sourceId || "").startsWith("SRC-OWN-"));
  const knowledgeItemIds = [...new Set(existingOwner.map((k) => k.id))].sort();
  const snapPayload = {
    parserVersion: OWNER_PARSER_VERSION,
    sourceIds: ownerIds,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
  };
  const snapHash = sha256Bytes(Buffer.from(JSON.stringify(snapPayload)));
  const snapshot = {
    id: "curriculum-owner-dev-" + snapHash.slice(0, 12),
    createdAt: now,
    parserVersion: OWNER_PARSER_VERSION,
    sourceIds: ownerIds,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
    contentHash: snapHash,
    note: "Owner policy revision adding signal-freshness clarification. New snapshot only; curriculum-owner-dev-edc222091f5c was not mutated.",
  };
  const savedSnap = store.putCurriculumSnapshot(snapshot);
  return {
    sources: [{ id: "SRC-OWN-007", captureStatus: "OWNER_AUTHORED", sha256: sha, byteLength: bytes.length, url: record.url, note: record.captureNote }],
    knowledgeAccepted: acceptedAll.length,
    knowledgeRejected: rejectedAll.length,
    rejected: rejectedAll,
    items: acceptedAll,
    snapshot: savedSnap,
    parserVersion: OWNER_PARSER_VERSION,
    untrustedNote: "Owner-authored policy revision. Never changes system instructions and is never treated as gold.",
  };
}

export function latestOwnerRevisionSnapshot(store) {
  const snaps = (store.listCurriculumSnapshots() || []).filter((s) => Array.isArray(s.sourceIds) && s.sourceIds.includes("SRC-OWN-007"));
  if (!snaps.length) return null;
  return snaps.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[snaps.length - 1];
}

export function latestOwnerSnapshot(store) {
  const snaps = (store.listCurriculumSnapshots() || []).filter((s) => String(s.id).startsWith("curriculum-owner-dev-"));
  if (!snaps.length) return null;
  return snaps.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[snaps.length - 1];
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

export function retrieveOracleForCase(store, caseId, opts = {}) {
  const ids = CHALLENGE_ORACLE_ITEMS[caseId] || [];
  const maxItems = Number(opts.maxItems ?? 6);
  const budget = Number(opts.contextBudgetTokens ?? 4000);
  const selected = [];
  let used = 0;
  for (const id of ids) {
    if (selected.length >= maxItems) break;
    const item = store.getKnowledge ? store.getKnowledge(id) : (store.listKnowledge() || []).find((k) => k.id === id);
    if (!item) continue;
    const cost = estimateTokens(item.id) + estimateTokens(item.statement);
    if (used + cost > budget && selected.length) break;
    selected.push(item);
    used += cost;
  }
  return {
    items: selected.map((i) => ({ id: i.id, statement: i.statement, "type": i.type, sourceId: i.sourceId })),
    retrievedItemIds: selected.map((i) => i.id),
    tokensUsed: used,
    budgetTokens: budget,
    maxItems: maxItems,
    query: "oracle:" + caseId,
    intent: "human-selected-oracle",
    candidateCount: ids.length,
    selected: selected.map((i) => ({ id: i.id, score: 1, reason: "oracle-diagnostic", sourceId: i.sourceId })),
    rejectedNearDuplicates: [],
    note: "Oracle arm: human-selected relevant item ids. Diagnostic only. Not a product default.",
    diagnostic: true,
  };
}


export const OWNER_APPLICABILITY_SOURCE_IDS = ["SRC-OWN-008"];
export const OWNER_APPLICABILITY_PARSER_VERSION = "midas-owner-policy-parser-v0.2.0";

export const OWNER_APPLICABILITY_CANDIDATES = [
  { id: "K-OWN-008-01", sourceId: "SRC-OWN-008", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "A protected-account lockout applies only when current first-party or official evidence supports that the same account is an existing customer or a public-sector or government vertical.",
    phrases: ["applies only when current first-party or official evidence supports", "same account is an existing customer"],
    section: "Rules" },
  { id: "K-OWN-008-02", sourceId: "SRC-OWN-008", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "Similar legal names, shared words, or topical resemblance do not establish account identity or protection.",
    phrases: ["Similar legal names, shared words, or topical resemblance do not establish"],
    section: "Rules" },
  { id: "K-OWN-008-03", sourceId: "SRC-OWN-008", "type": "procedure", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "When current account status is missing, research is required. Do not invent a protected or unprotected status.",
    phrases: ["When current account status is missing, research is required"],
    section: "Rules" },
  { id: "K-OWN-008-04", sourceId: "SRC-OWN-008", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "An expired or lapsed protection registry entry is not current protection and is not a hard exclusion.",
    phrases: ["expired or lapsed protection registry entry is not current protection"],
    section: "Rules" },
  { id: "K-OWN-008-05", sourceId: "SRC-OWN-008", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "A documented written exception or re-open authorization overrides a protection lockout for that account.",
    phrases: ["re-open authorization overrides a protection lockout"],
    section: "Rules" },
  { id: "K-OWN-008-06", sourceId: "SRC-OWN-008", "type": "constraint", claimKind: "owner_policy", competency: "protected_accounts",
    statement: "Do not apply a protected-account lockout to an account whose current evidence shows a non-protected commercial new-logo status.",
    phrases: ["Do not apply a protected-account lockout to an account whose current evidence shows a non-protected"],
    section: "Rules" },
];

export function latestOwnerApplicabilitySnapshot(store) {
  const snaps = (store.listCurriculumSnapshots() || []).filter((s) => Array.isArray(s.sourceIds) && s.sourceIds.includes("SRC-OWN-008"));
  if (!snaps.length) return null;
  return snaps.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[snaps.length - 1];
}

export async function ingestOwnerApplicabilitySnapshot(args) {
  const store = args.store;
  const curriculumRoot = args.curriculumRoot || defaultCurriculumRoot();
  const policyDir = args.policyDir || defaultOwnerPolicyDir();
  const leakNames = args.leakNames || loadOwnerLeakNames(args.extraLeakPaths);
  const now = new Date().toISOString();
  const fname = "SRC-OWN-008-protected-accounts-applicability.md";
  const path = join(policyDir, fname);
  if (!existsSync(path)) throw new Error("missing owner applicability revision " + path);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const leaks = leakScanOwnerText(text, leakNames);
  if (leaks.length) throw new Error("Owner policy leak scan rejected " + fname + ": " + leaks.join(","));
  const sha = sha256Bytes(bytes);
  const dir = join(curriculumRoot, "sources", "SRC-OWN-008");
  mkdirSync(dir, { recursive: true });
  const bytesPath = join(dir, sha);
  if (!existsSync(bytesPath)) writeFileSync(bytesPath, bytes);
  const record = {
    id: "SRC-OWN-008",
    url: "midas://owner-policy/" + fname,
    title: "Synthetic owner-authored protected-account applicability revision",
    publisher: "MIDAS owner (synthetic)",
    retrievedAt: now,
    contentType: "text/markdown; charset=utf-8",
    sha256: sha,
    byteLength: bytes.length,
    parserVersion: OWNER_APPLICABILITY_PARSER_VERSION,
    captureStatus: "OWNER_AUTHORED",
    captureNote: "New source revision. SRC-OWN-005 was not edited. Owner-visible reason: earlier source is ambiguous on identity, expiry, stale registry, conflicts, and prospect-supplied claims.",
    bytesPath: bytesPath,
    runtimeEligible: true,
    ownerVisibleReason: "SRC-OWN-005 does not state how identity is established. This is a new inspectable source revision.",
  };
  store.putSource(record);

  const fileBySource = {
    "SRC-OWN-001": "SRC-OWN-001-qualification-thresholds.md",
    "SRC-OWN-002": "SRC-OWN-002-buyer-authority.md",
    "SRC-OWN-003": "SRC-OWN-003-signal-freshness.md",
    "SRC-OWN-004": "SRC-OWN-004-territory.md",
    "SRC-OWN-005": "SRC-OWN-005-protected-accounts.md",
    "SRC-OWN-006": "SRC-OWN-006-unit-economics.md",
    "SRC-OWN-007": "SRC-OWN-007-signal-freshness-clarification.md",
    "SRC-OWN-008": fname,
  };
  for (const [sid, fn] of Object.entries(fileBySource)) {
    const fp = join(policyDir, fn);
    if (!existsSync(fp)) continue;
    compileOwnerSpecsAgainstText(sid, readFileSync(fp, "utf8"));
  }

  const acceptedAll = [];
  const rejectedAll = [];
  for (const cand of OWNER_APPLICABILITY_CANDIDATES) {
    const loc = findLocator(text, cand.phrases, cand.section);
    const itemLeaks = leakScanOwnerText(cand.statement, leakNames);
    if (!loc) {
      rejectedAll.push({ id: cand.id, sourceId: cand.sourceId, reason: "unsupported_claim_no_locator", statement: cand.statement });
      continue;
    }
    if (itemLeaks.length) {
      rejectedAll.push({ id: cand.id, sourceId: cand.sourceId, reason: "leakage:" + itemLeaks.join(","), statement: cand.statement });
      continue;
    }
    const spec = OWNER_APPLICABILITY_SPECS.find((s) => s.knowledgeItemId === cand.id);
    const compiled = spec ? compileApplicabilityFromSource({ text: text, spec: spec }) : { ok: false, contract: null };
    const item = {
      id: cand.id,
      "type": cand.type,
      statement: cand.statement,
      sourceId: "SRC-OWN-008",
      sourceSha256: sha,
      locator: loc,
      claimKind: cand.claimKind,
      competency: cand.competency,
      accepted: true,
      createdAt: now,
      runtimeEligible: true,
      applicability: compiled.ok ? compiled.contract : undefined,
      ownerVisibleReason: record.ownerVisibleReason,
    };
    store.putKnowledge(item);
    acceptedAll.push(item);
  }

  const ownerIds = [...OWNER_SOURCE_IDS, ...OWNER_REVISION_SOURCE_IDS, ...OWNER_APPLICABILITY_SOURCE_IDS];
  const sourceSha256s = {};
  for (const s of store.listSources()) {
    if (ownerIds.includes(s.id)) sourceSha256s[s.id] = s.sha256;
  }
  const existingOwner = (store.listKnowledge() || []).filter((k) => String(k.sourceId || "").startsWith("SRC-OWN-"));
  const knowledgeItemIds = [...new Set(existingOwner.map((k) => k.id))].sort();
  const snapPayload = {
    parserVersion: OWNER_APPLICABILITY_PARSER_VERSION,
    sourceIds: ownerIds,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
  };
  const snapHash = sha256Bytes(Buffer.from(JSON.stringify(snapPayload)));
  const snapshot = {
    id: "curriculum-owner-dev-" + snapHash.slice(0, 12),
    createdAt: now,
    parserVersion: OWNER_APPLICABILITY_PARSER_VERSION,
    sourceIds: ownerIds,
    sourceSha256s: sourceSha256s,
    knowledgeItemIds: knowledgeItemIds,
    contentHash: snapHash,
    note: "Owner applicability snapshot adding SRC-OWN-008. New snapshot only; earlier owner snapshots were not mutated. Knowledge items K-OWN-001..007 were not rewritten.",
  };
  const savedSnap = store.putCurriculumSnapshot(snapshot);
  return {
    sources: [{ id: "SRC-OWN-008", captureStatus: "OWNER_AUTHORED", sha256: sha, byteLength: bytes.length, url: record.url, note: record.captureNote, ownerVisibleReason: record.ownerVisibleReason }],
    knowledgeAccepted: acceptedAll.length,
    knowledgeRejected: rejectedAll.length,
    rejected: rejectedAll,
    items: acceptedAll,
    snapshot: savedSnap,
    parserVersion: OWNER_APPLICABILITY_PARSER_VERSION,
    untrustedNote: "New source revision for protected-account applicability. Never changes system instructions and is never treated as gold.",
  };
}

export function hydrateOwnerApplicabilityFromDisk(policyDir) {
  const dir = policyDir || defaultOwnerPolicyDir();
  const fileBySource = {
    "SRC-OWN-001": "SRC-OWN-001-qualification-thresholds.md",
    "SRC-OWN-002": "SRC-OWN-002-buyer-authority.md",
    "SRC-OWN-003": "SRC-OWN-003-signal-freshness.md",
    "SRC-OWN-004": "SRC-OWN-004-territory.md",
    "SRC-OWN-005": "SRC-OWN-005-protected-accounts.md",
    "SRC-OWN-006": "SRC-OWN-006-unit-economics.md",
    "SRC-OWN-007": "SRC-OWN-007-signal-freshness-clarification.md",
    "SRC-OWN-008": "SRC-OWN-008-protected-accounts-applicability.md",
  };
  const out = [];
  for (const [sid, fn] of Object.entries(fileBySource)) {
    const fp = join(dir, fn);
    if (!existsSync(fp)) continue;
    out.push(...compileOwnerSpecsAgainstText(sid, readFileSync(fp, "utf8")));
  }
  return out;
}
