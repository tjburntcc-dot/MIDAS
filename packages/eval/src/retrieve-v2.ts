import { enrichKnowledgeItem } from "./applicability.js";
const CORE_RUNTIME_SOURCE_IDS = ["SRC-001", "SRC-002", "SRC-003", "SRC-004", "SRC-005", "SRC-006"];
const EXCLUDED_RUNTIME_SOURCE_IDS = ["SRC-009"];

export const RETRIEVAL_POLICY_VERSION = "hybrid-v0.2";
export const SAFETY_MAX_ITEMS = 12;
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 4000;
export const DEFAULT_MANDATORY_POLICY_MAX_ITEMS = 8;
export const DEFAULT_HELPFUL_CONTEXT_MAX_ITEMS = 4;

const HELPFUL_SIGNAL_FACT_KEYS = {
  estimates_by_hand: "manual_estimating",
  estimating_method: "estimating_method",
  uses_estimating_software: "software_estimating",
  spreadsheet_estimating: "manual_estimating",
  website_outdated: "outdated_website",
};

const SIGNAL_FROM_VALUE = [
  { re: /hand|spreadsheet|manual|paper/, signal: "manual_estimating", topic: "estimating_workflow" },
  { re: /software|dedicated|takeoff_tool|estimating_tool/, signal: "software_estimating", topic: "estimating_workflow" },
];

const ITEM_SIGNAL_PATTERNS = [
  { re: /estimate by hand|hand or with (generic )?spreadsheet|manual (takeoff|estimat)|still estimate/, signal: "manual_estimating", topic: "estimating_workflow" },
  { re: /already uses .{0,40}estimat|dedicated (takeoff|estimating) software/, signal: "software_estimating", topic: "estimating_workflow" },
  { re: /outdated (contractor )?website/, signal: "outdated_website", topic: "buying_signal" },
];

const TYPE_RANK = {
  constraint: 0,
  decision_rule: 1,
  failure_pattern: 2,
  procedure: 3,
  principle: 4,
  example: 5,
};

const POLICY_FAMILY_PATTERNS = [
  { re: /qualification threshold/, family: "qualification_thresholds", sources: ["SRC-OWN-001"] },
  { re: /buyer authority/, family: "buyer_authority", sources: ["SRC-OWN-002"] },
  { re: /signal freshness/, family: "signal_freshness", sources: ["SRC-OWN-003", "SRC-OWN-007"] },
  { re: /\bterritory\b/, family: "territory", sources: ["SRC-OWN-004"] },
  { re: new RegExp("protected account"), family: "protected_accounts", sources: ["SRC-OWN-005", "SRC-OWN-008"] },
  { re: /unit economic/, family: "unit_economics", sources: ["SRC-OWN-006"] },
];

const DOMAIN_SYNONYMS = {
  geography: ["us", "united", "states", "domestic", "geography", "territory", "country", "region", "headquartered", "headquarters", "served", "reserved", "pacific", "northwest", "southeast", "midwest", "northeast", "southwest", "international"],
  unit_economics: ["payback", "cac", "recovery", "unit", "economics", "seat", "seats", "capacity", "acquisition"],
  authority: ["buyer", "authority", "delegation", "title", "purchasing", "owner"],
  opt_out: ["suppression", "opt-out", "optout", "opted", "consent", "can-spam", "email"],
  freshness: ["freshness", "recency", "stale", "precedence", "freeze", "hiring", "current", "older", "age", "insufficient", "disqualif"],
  budget: ["spend", "budget", "monthly", "usd", "verified"],
  size: ["employee", "headcount", "employees", "size"],
  "protected": ["protected", "existing", "customer", "public", "sector", "government", "vertical", "lockout"],
};

const COVER_PATTERNS = {
  geography: /united states|domestic|headquarter|territory|geography|served region|reserved|pacific northwest|country|region/,
  unit_economics: /payback|cac|seat|capacity|unit economic/,
  authority: /authorit|delegat|title|purchasing/,
  opt_out: /opt-out|opt out|suppression|can-spam|stop emailing|consent/,
  freshness: /stale|freeze|hiring|third-party|first-party|recency|freshness|insufficient|disqualif|current hiring/,
  budget: /spend|budget|2500|infer spend/,
  size: /employee|headcount|eight/,
  "protected": new RegExp("existing customer|protected|public-sector|government|lockout|new-logo"),
  unknowns: /unknown|research is required|do not invent/,
};

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function runtimeFieldsOnly(runtimeInput) {
  return {
    title: runtimeInput && runtimeInput.title,
    offer: runtimeInput && runtimeInput.offer,
    qualification_policy: runtimeInput && runtimeInput.qualification_policy,
    constraints: runtimeInput && runtimeInput.constraints,
    prospects: (runtimeInput && runtimeInput.prospects ? runtimeInput.prospects : []).map((p) => ({
      id: p.id,
      company: p.company,
      facts: p.facts,
      evidence: p.evidence,
    })),
  };
}

function collectFactKeys(runtimeInput) {
  const keys = new Set();
  for (const p of runtimeInput.prospects || []) {
    for (const k of Object.keys(p.facts || {})) keys.add(k);
  }
  return [...keys];
}

function collectUnknownFactKeys(runtimeInput) {
  const keys = new Set();
  for (const p of runtimeInput.prospects || []) {
    for (const [k, v] of Object.entries(p.facts || {})) {
      if (v === null || v === undefined) keys.add(k);
    }
  }
  return [...keys];
}

function hasOptOutSignal(runtimeInput) {
  const blob = JSON.stringify(runtimeFieldsOnly(runtimeInput)).toLowerCase();
  if (/\bopted_out\b/.test(blob) && /true/.test(blob)) return true;
  if (/opt-out|opt out|opted out|email consent|can-spam|suppression/.test(blob)) return true;
  for (const p of runtimeInput.prospects || []) {
    if (p.facts && p.facts.opted_out === true) return true;
  }
  return false;
}

function namedPolicyFamilies(runtimeInput) {
  const pol = runtimeInput.qualification_policy || {};
  const texts = [];
  for (const list of [pol.required || [], pol.preferred || [], pol.disqualifiers || []]) {
    for (const item of list) texts.push(String(item));
  }
  for (const c of runtimeInput.constraints || []) texts.push(String(c));
  if (runtimeInput.offer) {
    texts.push(String(runtimeInput.offer.name || ""));
    texts.push(String(runtimeInput.offer.summary || ""));
  }
  const blob = texts.join(" ").toLowerCase();
  const families = [];
  for (const row of POLICY_FAMILY_PATTERNS) {
    if (row.re.test(blob)) families.push(row);
  }
  return families;
}

export function analyzeRuntimeCase(runtimeInput) {
  const safe = runtimeFieldsOnly(runtimeInput);
  const blob = JSON.stringify(safe).toLowerCase();
  const factKeys = collectFactKeys(runtimeInput);
  const unknownKeys = collectUnknownFactKeys(runtimeInput);
  const families = namedPolicyFamilies(runtimeInput);
  const dimensions = {
    geography: factKeys.some((k) => /country|region|territory|geo/.test(k))
      || /country|region|territory|geography|headquarter|united states|\bus\b|domestic|international/.test(blob),
    authority: factKeys.some((k) => /authorit|job_title|delegat/.test(k))
      || /authorit|delegat|title-only|title_only|purchasing|hq_only/.test(blob),
    budget: factKeys.some((k) => /spend|budget/.test(k)) || /monthly spend|verified spend|budget/.test(blob),
    size: factKeys.some((k) => /employee|headcount/.test(k)),
    freshness: factKeys.some((k) => /signal_age|hiring_freeze|open_roles|age_days/.test(k))
      || /stale|freeze|hiring|recency|first-party|third-party|freshness/.test(blob),
    "protected": factKeys.some((k) => /account_status|vertical/.test(k))
      || new RegExp("existing customer|public-sector|protected|new-logo").test(blob),
    unit_economics: factKeys.some((k) => /payback|seat|capacity|cac/.test(k))
      || /payback|unit economic|cac|seat/.test(blob),
    opt_out: hasOptOutSignal(runtimeInput),
    unknowns: unknownKeys.length > 0,
    named_policy: families.length > 0,
  };
  const parts = [];
  if (safe.offer) parts.push(safe.offer.name || "", safe.offer.summary || "");
  const pol = safe.qualification_policy || {};
  for (const list of [pol.required || [], pol.preferred || [], pol.disqualifiers || []]) {
    for (const item of list) parts.push(item);
  }
  for (const c of safe.constraints || []) parts.push(c);
  for (const p of safe.prospects || []) {
    for (const [k, v] of Object.entries(p.facts || {})) {
      parts.push(k);
      if (v !== null && v !== undefined) parts.push(String(v));
    }
    for (const e of p.evidence || []) {
      if (e && e.claim) parts.push(e.claim);
    }
  }
  const query = parts.filter(Boolean).join(" ");
  const intentBits = Object.entries(dimensions).filter(([, v]) => v === true).map(([k]) => k);
  for (const f of families) intentBits.push("policy:" + f.family);
  const topics = new Set();
  const signals = new Set();
  for (const p of runtimeInput.prospects || []) {
    const facts = p.facts || {};
    for (const [k, v] of Object.entries(facts)) {
      const mapped = HELPFUL_SIGNAL_FACT_KEYS[k];
      if (mapped === "estimating_method") {
        const val = String(v == null ? "" : v).toLowerCase();
        for (const row of SIGNAL_FROM_VALUE) {
          if (row.re.test(val)) {
            signals.add(row.signal);
            topics.add(row.topic);
          }
        }
      } else if (mapped && (v === true || v === "true" || (typeof v === "string" && v && v !== "false"))) {
        signals.add(mapped);
        if (mapped === "manual_estimating" || mapped === "software_estimating") topics.add("estimating_workflow");
        if (mapped === "outdated_website") topics.add("buying_signal");
      }
    }
    for (const e of p.evidence || []) {
      const claim = String(e && e.claim || "").toLowerCase();
      for (const row of ITEM_SIGNAL_PATTERNS) {
        if (row.re.test(claim)) {
          signals.add(row.signal);
          topics.add(row.topic);
        }
      }
    }
  }
  return {
    dimensions: dimensions,
    families: families,
    factKeys: factKeys,
    unknownKeys: unknownKeys,
    query: query,
    intent: intentBits.join(" | ") || "runtime-input",
    blob: blob,
    topics: [...topics],
    signals: [...signals],
  };
}

export function itemTopicSignalMeta(item) {
  const topics = new Set();
  const signals = new Set();
  if (item && item.topic) topics.add(String(item.topic));
  if (item && item.signal) signals.add(String(item.signal));
  for (const t of (item && item.topics) || []) if (t) topics.add(String(t));
  for (const s of (item && item.signals) || []) if (s) signals.add(String(s));
  const ws = knowledgeWorkspaceId(item);
  if (ws) {
    const text = itemText(item).toLowerCase();
    for (const row of ITEM_SIGNAL_PATTERNS) {
      if (row.re.test(text)) {
        topics.add(row.topic);
        signals.add(row.signal);
      }
    }
  }
  return { topics: [...topics], signals: [...signals] };
}

export function isMandatoryPolicyItem(item) {
  if (!item) return false;
  const kind = item.kind || item.claimKind || item.epistemicClass;
  const owner = kind === "owner_policy" || item.writtenByOwner === true;
  const hardType = item.type === "constraint" || item.type === "decision_rule" || item.type === "failure_pattern";
  const effect = item.applicability && item.applicability.effect;
  if (owner && (effect === "exclude" || effect === "research_first")) return true;
  if (owner && hardType) {
    if (effect === "prefer") return false;
    return true;
  }
  if (hardType && item.competency && ["territory", "qualification_thresholds", "protected_accounts", "signal_freshness", "buyer_authority"].includes(item.competency)) {
    return true;
  }
  return false;
}

export function isHelpfulContextItem(item) {
  if (!item) return false;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.includes("scout") || item.sourceMode === "scout_approved" || item.scoutFindingId) return true;
  const kind = item.kind || item.epistemicClass;
  if (kind === "sourced_fact" || kind === "inference" || kind === "approved_inference") return true;
  const effect = item.applicability && item.applicability.effect;
  if ((item.kind === "owner_policy" || item.claimKind === "owner_policy") && effect === "prefer") return true;
  const meta = itemTopicSignalMeta(item);
  if (meta.signals.length || meta.topics.length) {
    if (!isMandatoryPolicyItem(item)) return true;
  }
  return false;
}

export function helpfulContextMatch(item, analysis) {
  const meta = itemTopicSignalMeta(item);
  const rtTopics = new Set(analysis.topics || []);
  const rtSignals = new Set(analysis.signals || []);
  const topicHits = meta.topics.filter((t) => rtTopics.has(t));
  const signalHits = meta.signals.filter((s) => rtSignals.has(s));
  return {
    matched: topicHits.length > 0 || signalHits.length > 0,
    topicHits: topicHits,
    signalHits: signalHits,
    itemTopics: meta.topics,
    itemSignals: meta.signals,
  };
}

export function inferFindingTopicSignal(text) {
  const t = String(text || "").toLowerCase();
  for (const row of ITEM_SIGNAL_PATTERNS) {
    if (row.re.test(t)) return { topic: row.topic, signal: row.signal };
  }
  return { topic: null, signal: null };
}

function itemText(item) {
  return String(item.statement || "") + " " + String(item.competency || "") + " " + String(item.type || "");
}

function itemCoversDimension(item, dim) {
  const text = itemText(item).toLowerCase();
  const competency = String(item.competency || "");
  if (dim === "geography") {
    return competency === "territory"
      || (competency === "qualification_thresholds" && /united states|domestic|headquarter/.test(text))
      || COVER_PATTERNS.geography.test(text);
  }
  if (dim === "unit_economics") {
    return competency === "unit_economics" || COVER_PATTERNS.unit_economics.test(text);
  }
  if (dim === "authority") {
    return competency === "buyer_authority" || COVER_PATTERNS.authority.test(text);
  }
  if (dim === "opt_out") {
    return COVER_PATTERNS.opt_out.test(text);
  }
  if (dim === "freshness") {
    return competency === "signal_freshness" || COVER_PATTERNS.freshness.test(text);
  }
  if (dim === "budget") {
    return (competency === "qualification_thresholds" && COVER_PATTERNS.budget.test(text)) || COVER_PATTERNS.budget.test(text);
  }
  if (dim === "size") {
    return (competency === "qualification_thresholds" && COVER_PATTERNS.size.test(text)) || COVER_PATTERNS.size.test(text);
  }
  if (dim === "protected") {
    return competency === "protected_accounts" || COVER_PATTERNS["protected"].test(text);
  }
  if (dim === "unknowns") {
    return COVER_PATTERNS.unknowns.test(text);
  }
  if (dim === "named_policy") {
    return Boolean(competency);
  }
  return false;
}

function synonymHits(statement, dim) {
  const lower = String(statement || "").toLowerCase();
  const syns = DOMAIN_SYNONYMS[dim] || [];
  let n = 0;
  for (const s of syns) {
    if (s.length >= 2 && lower.includes(s)) n += 1;
  }
  return n;
}

function knowledgeWorkspaceId(k) {
  return (k && (k.workspaceId || k.workspace)) || null;
}

function isPrivateOrUntrustedNote(k) {
  if (!k) return true;
  if (k["private"] === true) return true;
  if (k.epistemicClass === "private_note" || k.kind === "private_note") return true;
  const tags = Array.isArray(k.tags) ? k.tags : [];
  if (tags.includes("private_note") || tags.includes("private")) return true;
  return false;
}

function workspaceAllowlist(opts) {
  if (!opts) return null;
  if (Array.isArray(opts.workspaceAllowlist) && opts.workspaceAllowlist.length) {
    return new Set(opts.workspaceAllowlist);
  }
  if (opts.workspaceId) return new Set([opts.workspaceId]);
  return null;
}

function eligibleKnowledge(store, opts) {
  const allow = new Set(opts.sourceAllowlist || CORE_RUNTIME_SOURCE_IDS);
  for (const banned of EXCLUDED_RUNTIME_SOURCE_IDS) allow.delete(banned);
  const wsAllow = workspaceAllowlist(opts);
  return (store.listKnowledge() || []).filter((k) => {
    if (!k || !k.locator) return false;
    if (k.accepted !== true || k.runtimeEligible === false) return false;
    if (isPrivateOrUntrustedNote(k)) return false;
    if (k.reviewStatus === "rejected" || k.reviewStatus === "superseded") return false;
    const kid = knowledgeWorkspaceId(k);
    if (wsAllow) {
      if (kid && wsAllow.has(kid)) {
        if (k.reviewStatus && k.reviewStatus !== "approved") return false;
        if (opts.applicableRole) {
          const role = k.applicableRole || k.agentRole || null;
          if (role && role !== opts.applicableRole) return false;
        }
        return true;
      }
      return false;
    }
    if (kid && kid !== "default") {
      // Historical evals do not pass workspaceId. Workspace-scoped studio
      // items must not leak into unscoped retrieval.
      return false;
    }
    return allow.has(k.sourceId);
  });
}

function scoreItem(item, analysis) {
  const statement = String(item.statement || "");
  const text = (statement + " " + (item.type || "") + " " + (item.competency || "")).toLowerCase();
  const querySet = tokenSet(analysis.query);
  let score = 0;
  const hits = [];
  for (const t of tokenize(statement)) {
    if (querySet.has(t)) {
      score += 1;
      hits.push(t);
    }
  }
  for (const key of analysis.factKeys) {
    const pieces = String(key).toLowerCase().split(/[_-]/);
    if (pieces.some((p) => p.length >= 4 && text.includes(p))) {
      score += 1.5;
      hits.push("fact:" + key);
    }
  }
  for (const family of analysis.families) {
    if (item.competency && item.competency === family.family) {
      score += 10;
      hits.push("policy-family:" + family.family);
    }
    if (family.sources.includes(item.sourceId)) {
      score += 6;
      hits.push("policy-source");
    }
  }
  for (const [dim, on] of Object.entries(analysis.dimensions)) {
    if (!on || dim === "named_policy") continue;
    const syn = synonymHits(statement, dim);
    if (syn) {
      score += Math.min(6, syn * 1.4);
      hits.push("syn:" + dim);
    }
    if (itemCoversDimension(item, dim) && (item.type === "constraint" || item.type === "decision_rule" || item.type === "failure_pattern")) {
      score += 5;
      hits.push("covers:" + dim);
    }
  }
  if (hits.length) {
    if (item.type === "constraint") score += 3;
    else if (item.type === "decision_rule") score += 2;
    else if (item.type === "failure_pattern") score += 2;
  }
  if (analysis.dimensions.opt_out && COVER_PATTERNS.opt_out.test(statement)) {
    score += 12;
    hits.push("opt-out-language");
  }
  if (item.sourceId === "SRC-OWN-008") {
    const namedProt = analysis.families.some((f) => f.family === "protected_accounts");
    if (!namedProt) {
      score = Math.min(score, 0.25);
      hits.push("revision-out-of-scope");
    }
  }
  return { score: score, hits: hits };
}

function emptyTrace(args) {
  const budget = Number(args?.contextBudgetTokens ?? DEFAULT_CONTEXT_BUDGET_TOKENS);
  const maxItems = Number(args?.maxItems ?? SAFETY_MAX_ITEMS);
  return {
    items: [],
    retrievedItemIds: [],
    tokensUsed: 0,
    budgetTokens: budget,
    maxItems: maxItems,
    query: "",
    intent: "baseline-empty",
    candidateCount: 0,
    selected: [],
    rejectedNearDuplicates: [],
    retrievalPolicyVersion: RETRIEVAL_POLICY_VERSION,
    dimensions: {},
    topics: [],
    signals: [],
    omitted: [],
    budgets: {
      mandatoryPolicyMaxItems: DEFAULT_MANDATORY_POLICY_MAX_ITEMS,
      helpfulContextMaxItems: DEFAULT_HELPFUL_CONTEXT_MAX_ITEMS,
      mandatorySelected: 0,
      helpfulSelected: 0,
    },
    note: "Empty retrieval.",
  };
}

/**
 * Hybrid retrieveForCase v2.
 * Query and routing use RUNTIME INPUT ONLY.
 * Never reads gold, relevance labels, competencies on the case record, or sealed data.
 */
export function retrieveForCase(store, runtimeInput, opts = {}) {
  const budget = Number(opts.contextBudgetTokens ?? process.env.MIDAS_CONTEXT_BUDGET_TOKENS ?? DEFAULT_CONTEXT_BUDGET_TOKENS);
  const maxItems = Number(opts.maxItems ?? SAFETY_MAX_ITEMS);
  if (!runtimeInput) {
    const empty = emptyTrace({ contextBudgetTokens: budget, maxItems: maxItems });
    empty.note = "No runtime input; empty retrieval.";
    empty.intent = "missing-runtime-input";
    return empty;
  }
  const analysis = analyzeRuntimeCase(runtimeInput);
  const namedProtFamily = analysis.families.some((f) => f.family === "protected_accounts");
  const candidates = eligibleKnowledge(store, opts).filter((k) => k.sourceId !== "SRC-OWN-008" || namedProtFamily);
  const scored = candidates.map((item) => {
    const s = scoreItem(item, analysis);
    return { item: item, score: s.score, hits: s.hits };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = TYPE_RANK[a.item.type] ?? 9;
    const rb = TYPE_RANK[b.item.type] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.item.id.localeCompare(b.item.id);
  });

  const rejectedNearDuplicates = [];
  const kept = [];
  for (const row of scored) {
    const isConstraint = row.item.type === "constraint" || row.item.type === "decision_rule";
    const tokens = tokenSet(row.item.statement);
    let dupOf = null;
    for (const prev of kept) {
      const prevConstraint = prev.item.type === "constraint" || prev.item.type === "decision_rule";
      if (isConstraint && prevConstraint) continue;
      if (isConstraint || prevConstraint) continue;
      const sim = jaccard(tokens, tokenSet(prev.item.statement));
      if (sim >= 0.42) {
        const rankNew = TYPE_RANK[row.item.type] ?? 9;
        const rankOld = TYPE_RANK[prev.item.type] ?? 9;
        if (rankNew < rankOld || (rankNew === rankOld && row.score > prev.score)) {
          rejectedNearDuplicates.push({
            id: prev.item.id,
            reason: "near-duplicate-of-" + row.item.id + " (kept-higher-type-rank)",
          });
          const idx = kept.indexOf(prev);
          kept.splice(idx, 1, row);
        } else {
          rejectedNearDuplicates.push({
            id: row.item.id,
            reason: "near-duplicate-of-" + prev.item.id + " (kept-higher-type-rank)",
          });
        }
        dupOf = prev;
        break;
      }
    }
    if (!dupOf) kept.push(row);
  }

  const activeDims = Object.entries(analysis.dimensions)
    .filter(([k, v]) => v === true && k !== "named_policy")
    .map(([k]) => k);

  const selected = [];
  const selectedIds = new Set();

  function tryAdd(row) {
    if (!row || selectedIds.has(row.item.id)) return false;
    if (selected.length >= maxItems) return false;
    const cost = estimateTokens(row.item.id) + estimateTokens(row.item.statement);
    const used = selected.reduce((n, r) => n + estimateTokens(r.item.id) + estimateTokens(r.item.statement), 0);
    if (used + cost > budget && selected.length) return false;
    selected.push(row);
    selectedIds.add(row.item.id);
    return true;
  }

  const familyTypes = new Set(["constraint", "decision_rule", "failure_pattern", "procedure"]);
  for (const family of analysis.families) {
    const familyRows = kept
      .filter((r) => family.sources.includes(r.item.sourceId) && familyTypes.has(r.item.type))
      .sort((a, b) => {
        const ta = TYPE_RANK[a.item.type] ?? 9;
        const tb = TYPE_RANK[b.item.type] ?? 9;
        if (ta !== tb) return ta - tb;
        return b.score - a.score;
      });
    for (const row of familyRows) tryAdd(row);
  }

  for (const dim of activeDims) {
    const already = selected.some((r) => itemCoversDimension(r.item, dim));
    if (already) continue;
    const cover = kept
      .filter((r) => itemCoversDimension(r.item, dim))
      .sort((a, b) => {
        const ta = TYPE_RANK[a.item.type] ?? 9;
        const tb = TYPE_RANK[b.item.type] ?? 9;
        if (ta !== tb) return ta - tb;
        return b.score - a.score;
      })[0];
    if (cover) {
      if (selected.length >= maxItems) {
        const evictAt = selected.findLastIndex((r) => r.item.type === "principle" || r.item.type === "example");
        if (evictAt >= 0) {
          const evicted = selected.splice(evictAt, 1)[0];
          selectedIds.delete(evicted.item.id);
          rejectedNearDuplicates.push({ id: evicted.item.id, reason: "evicted-for-constraint-coverage:" + dim });
        }
      }
      tryAdd(cover);
    }
  }

  function dimsCoveredNow() {
    return activeDims.every((d) => selected.some((r) => itemCoversDimension(r.item, d)));
  }
  if (!dimsCoveredNow() || selected.length < 2) {
    for (const row of kept) {
      if (selected.length >= maxItems) break;
      if (dimsCoveredNow() && selected.length >= Math.max(2, Math.min(4, activeDims.length || 1))) break;
      if (isHelpfulContextItem(row.item) && !helpfulContextMatch(row.item, analysis).matched) continue;
      tryAdd(row);
    }
  }

  // Supporting constraints that cover an active dimension still need a slot after the
  // smallest covering set is built. No case-id routing: score + coverage only.
  const SUPPORTING_FILL_MIN_SCORE = 8;
  for (const row of kept) {
    if (selected.length >= maxItems) break;
    if (row.score < SUPPORTING_FILL_MIN_SCORE) continue;
    const usefulType = row.item.type === "constraint" || row.item.type === "decision_rule"
      || row.item.type === "procedure" || row.item.type === "failure_pattern";
    if (!usefulType) continue;
    if (!activeDims.some((d) => itemCoversDimension(row.item, d))) continue;
    tryAdd(row);
  }

  const mandatoryPolicyMax = Number(opts.mandatoryPolicyMaxItems ?? DEFAULT_MANDATORY_POLICY_MAX_ITEMS);
  const helpfulContextMax = Number(opts.helpfulContextMaxItems ?? DEFAULT_HELPFUL_CONTEXT_MAX_ITEMS);
  const selectedBuckets = new Map();
  for (const row of selected) {
    selectedBuckets.set(row.item.id, isMandatoryPolicyItem(row.item) ? "mandatory_policy" : "coverage");
  }

  const helpfulEligible = kept.filter((row) => isHelpfulContextItem(row.item));
  let helpfulSelected = 0;
  const runtimeHasSignals = (analysis.signals && analysis.signals.length) || (analysis.topics && analysis.topics.length);
  if (runtimeHasSignals) {
    const helpfulRanked = helpfulEligible
      .map((row) => ({ row: row, match: helpfulContextMatch(row.item, analysis) }))
      .filter((x) => x.match.matched)
      .sort((a, b) => {
        const na = a.match.signalHits.length + a.match.topicHits.length;
        const nb = b.match.signalHits.length + b.match.topicHits.length;
        if (nb !== na) return nb - na;
        return b.row.score - a.row.score;
      });
    for (const x of helpfulRanked) {
      if (helpfulSelected >= helpfulContextMax) break;
      if (selected.length >= maxItems && !selectedIds.has(x.row.item.id)) break;
      const already = selectedIds.has(x.row.item.id);
      const added = already ? true : tryAdd(x.row);
      if (added) {
        if (!already) helpfulSelected += 1;
        else if (selectedBuckets.get(x.row.item.id) !== "helpful_context") helpfulSelected += 1;
        selectedBuckets.set(x.row.item.id, "helpful_context");
        const prev = selected.find((r) => r.item.id === x.row.item.id);
        if (prev) {
          prev.hits = (prev.hits || []).concat(
            x.match.signalHits.map((s) => "signal:" + s),
            x.match.topicHits.map((t) => "topic:" + t),
            ["helpful-context"],
          );
        }
      }
    }
  }

  const used = selected.reduce((n, r) => n + estimateTokens(r.item.id) + estimateTokens(r.item.statement), 0);
  const selectedIdSet = new Set(selected.map((r) => r.item.id));
  const omitted = [];
  for (const row of scored) {
    if (selectedIdSet.has(row.item.id)) continue;
    const match = helpfulContextMatch(row.item, analysis);
    const helpful = isHelpfulContextItem(row.item);
    const mandatory = isMandatoryPolicyItem(row.item);
    let reason = "not-needed-for-coverage";
    if (rejectedNearDuplicates.some((d) => d.id === row.item.id)) {
      reason = "near-duplicate";
    } else if (helpful && !runtimeHasSignals) {
      reason = "helpful-context-no-runtime-signal";
    } else if (helpful && !match.matched) {
      reason = "helpful-context-no-topic-or-signal-match";
    } else if (helpful && match.matched && helpfulSelected >= helpfulContextMax) {
      reason = "helpful-context-budget-full";
    } else if (mandatory && selected.filter((r) => selectedBuckets.get(r.item.id) === "mandatory_policy").length >= mandatoryPolicyMax) {
      reason = "mandatory-policy-budget-full";
    } else if (row.item.type === "principle" && !match.matched) {
      reason = "principle-without-matching-signal";
    } else if (row.score < 8 && !mandatory) {
      reason = "below-supporting-score";
    }
    omitted.push({
      id: row.item.id,
      score: row.score,
      reason: reason,
      bucket: helpful ? "helpful_context" : mandatory ? "mandatory_policy" : "other",
      topics: match.itemTopics,
      signals: match.itemSignals,
      topicHits: match.topicHits,
      signalHits: match.signalHits,
    });
  }

  const mandatorySelected = selected.filter((r) => selectedBuckets.get(r.item.id) === "mandatory_policy" || selectedBuckets.get(r.item.id) === "coverage").length;
  const allSelected = selected.length === candidates.length && candidates.length > 0;
  const note = allSelected
    ? "All " + candidates.length + " candidates selected because safety cap (" + maxItems + ") and token budget (" + budget + ") allowed the full set after scoring and coverage."
    : "Hybrid " + RETRIEVAL_POLICY_VERSION + ": " + selected.length + " of " + candidates.length + " candidates; safetyCap=" + maxItems + "; tokens " + used + "/" + budget + "; mandatory=" + mandatorySelected + "; helpful=" + helpfulSelected + ". Mandatory owner policies covered first. Helpful Scout/context only when topic/signal matches. Full source documents are never injected.";

  return {
    items: selected.map((row) => {
      const enriched = enrichKnowledgeItem(row.item);
      return {
        id: enriched.id,
        statement: enriched.statement,
        "type": enriched.type,
        sourceId: enriched.sourceId,
        applicability: enriched.applicability || null,
      };
    }),
    retrievedItemIds: selected.map((row) => row.item.id),
    tokensUsed: used,
    budgetTokens: budget,
    maxItems: maxItems,
    query: analysis.query,
    intent: analysis.intent,
    candidateCount: candidates.length,
    selected: selected.map((row) => {
      const match = helpfulContextMatch(row.item, analysis);
      const bucket = selectedBuckets.get(row.item.id) || (isMandatoryPolicyItem(row.item) ? "mandatory_policy" : "coverage");
      return {
        id: row.item.id,
        score: row.score,
        reason: (row.hits || []).slice(0, 10).join(",") || "coverage-or-type-rank",
        sourceId: row.item.sourceId,
        bucket: bucket,
        topics: match.itemTopics,
        signals: match.itemSignals,
        topicHits: match.topicHits,
        signalHits: match.signalHits,
        "type": row.item.type,
        applicableRole: row.item.applicableRole || row.item.agentRole || null,
      };
    }),
    omitted: omitted,
    rejectedNearDuplicates: rejectedNearDuplicates,
    retrievalPolicyVersion: RETRIEVAL_POLICY_VERSION,
    dimensions: analysis.dimensions,
    topics: analysis.topics || [],
    signals: analysis.signals || [],
    budgets: {
      mandatoryPolicyMaxItems: mandatoryPolicyMax,
      helpfulContextMaxItems: helpfulContextMax,
      mandatorySelected: mandatorySelected,
      helpfulSelected: helpfulSelected,
    },
    note: note,
  };
}

export { runtimeFieldsOnly };
