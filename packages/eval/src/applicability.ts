import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.js";

export const APPLICABILITY_VALUES = ["satisfied", "not_satisfied", "unknown"];
export const APPLICABILITY_PARSER_VERSION = "midas-applicability-compiler-v0.1.0";

export const APPLICABILITY_MICRO_PATH = join(
  REPO_ROOT,
  "evals/atlas/v0/applicability/atlas_applicability_v0.jsonl",
);
export const APPLICABILITY_MICRO_MANIFEST = join(
  REPO_ROOT,
  "evals/atlas/v0/applicability/atlas_applicability_v0.manifest.json",
);
export const APPLICABILITY_MICRO_LOCK = join(
  REPO_ROOT,
  "evals/atlas/v0/applicability/mission05-applicability.lock.json",
);

export const ATTRIBUTION_SUBREASONS = [
  "condition_incorrectly_satisfied",
  "condition_incorrectly_rejected",
  "unknown_treated_as_false",
  "unknown_treated_as_true",
  "exception_missed",
  "priority_error",
  "account_identity_inferred",
  "scope_overextended",
];

function asList(v) {
  return Array.isArray(v) ? v : [];
}

function factMissing(v) {
  return v === null || v === undefined || v === "";
}

function evalOp(actual, op, expected) {
  if (factMissing(actual)) return "unknown";
  if (op === "eq") return actual === expected ? "satisfied" : "not_satisfied";
  if (op === "neq") return actual !== expected ? "satisfied" : "not_satisfied";
  if (op === "in") {
    const set = asList(expected);
    return set.includes(actual) ? "satisfied" : "not_satisfied";
  }
  if (op === "exists") return factMissing(actual) ? "not_satisfied" : "satisfied";
  if (op === "not_exists") return factMissing(actual) ? "satisfied" : "not_satisfied";
  if (op === "is_true") return actual === true ? "satisfied" : "not_satisfied";
  if (op === "is_false") return actual === false ? "satisfied" : "not_satisfied";
  const n = Number(actual);
  const m = Number(expected);
  if (!Number.isFinite(n) || !Number.isFinite(m)) return "unknown";
  if (op === "gt") return n > m ? "satisfied" : "not_satisfied";
  if (op === "gte") return n >= m ? "satisfied" : "not_satisfied";
  if (op === "lt") return n < m ? "satisfied" : "not_satisfied";
  if (op === "lte") return n <= m ? "satisfied" : "not_satisfied";
  return "unknown";
}

function evidenceFresh(e, filter) {
  if (!e) return false;
  const maxAge = filter && filter.maxAgeDays != null ? Number(filter.maxAgeDays) : null;
  if (maxAge != null && Number(e.age_days) > maxAge) return false;
  const sources = filter && filter.sources ? filter.sources : null;
  if (sources && sources.length && !sources.includes(e.source)) return false;
  if (e.source === "prospect_supplied") return false;
  return true;
}

function textMentions(text, needles) {
  const t = String(text || "").toLowerCase();
  return needles.some((n) => t.includes(String(n).toLowerCase()));
}

function conditionNeedles(cond) {
  const field = String(cond.field || "");
  const value = cond.value;
  const desc = String(cond.description || "").toLowerCase();
  const out = [];
  if (field === "account_status" && value === "existing_customer") {
    out.push("existing customer", "active customer contract", "existing-customer");
  } else if (field === "account_status" && value === "new_logo") {
    out.push("new-logo", "new logo");
  } else if (field === "vertical") {
    out.push("public-sector", "public sector", "government");
  } else if (field === "hiring_freeze" && (value === true || cond.op === "is_true")) {
    out.push("hiring freeze");
  } else if (field === "reopen_authorization") {
    out.push("re-open authorization", "reopen authorization", "written exception");
  } else if (field === "region") {
    out.push(String(value || "").replace(/_/g, " "));
  } else if (field === "country") {
    out.push("headquartered", "headquarters", "country", "us-based", "united states");
  } else if (field === "employee_count") {
    out.push("employee", "employees", "headcount");
  } else if (field === "monthly_spend_usd") {
    out.push("spend", "monthly spend");
  } else if (field === "open_roles") {
    out.push("open role", "open roles", "hiring");
  } else if (field === "first_party_signal_age_days") {
    out.push("first-party", "hiring signal");
  } else if (field === "modeled_payback_months") {
    out.push("payback");
  } else if (field === "seat_count") {
    out.push("seat");
  } else if (desc) {
    out.push(desc.slice(0, 40));
  }
  return out.filter(Boolean);
}

function contradictNeedles(cond) {
  const field = String(cond.field || "");
  const value = cond.value;
  if (field === "account_status" && value === "existing_customer") {
    return ["new-logo", "new logo", "protection expired", "lapsed", "not an existing"];
  }
  if (field === "hiring_freeze" && value === true) {
    return ["currently hiring", "no freeze"];
  }
  return [];
}

function classifyEvidenceForCondition(cond, evidence) {
  const filter = cond.evidenceFilter || {};
  const supportN = conditionNeedles(cond);
  const contraN = contradictNeedles(cond);
  let support = [];
  let contradict = [];
  let staleSupport = [];
  for (const e of asList(evidence)) {
    const claim = e && e.claim;
    const mentionsSupport = textMentions(claim, supportN);
    const mentionsContra = textMentions(claim, contraN);
    if (e && e.source === "prospect_supplied") continue;
    if (mentionsSupport && !evidenceFresh(e, filter)) {
      staleSupport.push(e.id);
      continue;
    }
    if (mentionsSupport && evidenceFresh(e, filter)) support.push(e.id);
    if (mentionsContra && evidenceFresh(e, { ...filter, maxAgeDays: filter.maxAgeDays != null ? filter.maxAgeDays : 45 })) {
      contradict.push(e.id);
    }
  }
  return { support: support, contradict: contradict, staleSupport: staleSupport };
}

const FACT_ALIASES = {
  modeled_payback_months: ["payback_months"],
  seller_capacity_accounts: ["capacity_slots"],
};

function factValue(facts, field) {
  if (!field) return undefined;
  if (!factMissing(facts[field])) return facts[field];
  for (const alt of FACT_ALIASES[field] || []) {
    if (!factMissing(facts[alt])) return facts[alt];
  }
  return facts[field];
}

export function evaluateCondition(cond, prospect) {
  const facts = (prospect && prospect.facts) || {};
  const evidence = asList(prospect && prospect.evidence);
  const field = cond.field;
  const actual = factValue(facts, field);
  const fromFact = evalOp(actual, cond.op, cond.value);
  const ev = classifyEvidenceForCondition(cond, evidence);
  const unmet = [];
  let state = fromFact;
  if (fromFact === "not_satisfied") {
    state = "not_satisfied";
    unmet.push(cond.id);
  } else if (fromFact === "satisfied") {
    if (cond.evidenceRequired) {
      if (ev.support.length && ev.contradict.length) state = "unknown";
      else if (ev.contradict.length && !ev.support.length) state = "unknown";
      else if (ev.support.length) state = "satisfied";
      else if (!factMissing(actual)) state = "satisfied";
      else if (ev.staleSupport.length && !ev.support.length) state = "unknown";
      else state = "unknown";
      if (state !== "satisfied") unmet.push(cond.id);
    } else {
      state = "satisfied";
    }
  } else {
    // fact missing
    if (ev.support.length && ev.contradict.length) state = "unknown";
    else if (ev.support.length && !ev.contradict.length && cond.kind === "semantic") state = "satisfied";
    else state = "unknown";
    if (state !== "satisfied") unmet.push(cond.id);
  }
  return {
    id: cond.id,
    state: state,
    supportingEvidenceIds: ev.support,
    unmet: unmet,
  };
}

function combineStates(states) {
  if (!states.length) return "unknown";
  if (states.some((s) => s === "not_satisfied")) return "not_satisfied";
  if (states.some((s) => s === "unknown")) return "unknown";
  return "satisfied";
}

export function evaluateApplicability(contract, prospect) {
  const conds = asList(contract && contract.requiredConditions);
  const condResults = conds.map((c) => evaluateCondition(c, prospect));
  const applicability = combineStates(condResults.map((c) => c.state));
  const supporting = [...new Set(condResults.flatMap((c) => c.supportingEvidenceIds))];
  const unmet = condResults.filter((c) => c.state !== "satisfied").map((c) => c.id);
  let exception = null;
  for (const ex of asList(contract && contract.exceptions)) {
    const exStates = asList(ex.conditions).map((c) => evaluateCondition(c, prospect));
    if (combineStates(exStates.map((c) => c.state)) === "satisfied") {
      exception = ex.id || "exception";
      break;
    }
  }
  const effect = (contract && contract.effect) || "none";
  const unknownBehavior = (contract && contract.unknownBehavior) || "research_first";
  const hardExclude = applicability === "satisfied" && effect === "exclude" && !exception;
  let suggested = "ignore";
  if (exception) suggested = "ignore";
  else if (applicability === "not_satisfied") suggested = "ignore";
  else if (applicability === "unknown") suggested = unknownBehavior || "research_first";
  else if (applicability === "satisfied") suggested = effect === "exclude" ? "exclude" : effect;
  return {
    knowledge_item_id: (contract && contract.knowledgeItemId) || null,
    applicability: applicability,
    supporting_evidence_ids: supporting,
    unmet_conditions: unmet,
    exception: exception,
    effect: effect,
    unknown_behavior: unknownBehavior,
    hard_exclude: hardExclude,
    suggested_next_action: suggested,
    priority: contract && contract.priority != null ? contract.priority : 0,
    scope: contract && contract.scope,
    subject_type: contract && contract.subjectType,
  };
}

export function contractFromItem(item) {
  if (!item) return null;
  if (item.applicability && item.applicability.requiredConditions) {
    return { ...item.applicability, knowledgeItemId: item.id };
  }
  const compiled = compiledContractForId(item.id);
  if (compiled) return { ...compiled, knowledgeItemId: item.id };
  return null;
}

export function traceProspectRule(item, prospect) {
  const contract = contractFromItem(item);
  if (!contract) {
    return {
      knowledge_item_id: item && item.id,
      applicability: "unknown",
      supporting_evidence_ids: [],
      unmet_conditions: [],
      exception: null,
      effect: null,
      note: "no_applicability_contract",
    };
  }
  const out = evaluateApplicability(contract, prospect);
  out.knowledge_item_id = item.id;
  return out;
}

export function buildApplicabilityTraces(items, prospects) {
  const traces = [];
  for (const prospect of asList(prospects)) {
    for (const item of asList(items)) {
      const contract = contractFromItem(item);
      if (!contract) continue;
      traces.push({
        prospect_id: prospect.id,
        ...traceProspectRule(item, prospect),
      });
    }
  }
  return traces;
}

export function suggestedActionFromTraces(tracesForProspect) {
  const rows = asList(tracesForProspect);
  const excludes = rows.filter((t) => t.hard_exclude);
  if (excludes.length) {
    excludes.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    return { next_action: "exclude", by: excludes[0].knowledge_item_id };
  }
  const research = rows.filter((t) => t.suggested_next_action === "research_first");
  if (research.length) {
    research.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    return { next_action: "research_first", by: research[0].knowledge_item_id };
  }
  return { next_action: null, by: null };
}

/**
 * Diagnostic only. Never rewrite an agent classification to gold.
 */
export function attributionSubreasons(args) {
  const assessments = asList(args && args.assessments);
  const traces = asList(args && args.traces);
  const record = args && args.record;
  const sub = [];
  for (const a of assessments) {
    const mine = traces.filter((t) => t.prospect_id === a.prospect_id);
    const rationale = String(a.rationale || "").toLowerCase();
    const excluded = a.classification === "disqualified" || a.next_action === "exclude";
    const researched = a.classification === "needs_research" || a.next_action === "research_first";
    const qualified = a.classification === "qualified";
    const hard = mine.filter((t) => t.hard_exclude);
    const unknownExclude = mine.filter((t) => t.effect === "exclude" && t.applicability === "unknown");
    const notSatExclude = mine.filter((t) => t.effect === "exclude" && t.applicability === "not_satisfied");
    const exceptionHits = mine.filter((t) => t.exception);
    if (excluded && !hard.length && unknownExclude.length) sub.push("unknown_treated_as_true");
    if (excluded && !hard.length && notSatExclude.length) sub.push("condition_incorrectly_satisfied");
    if (excluded && unknownExclude.length && !hard.length && researched === false) {
      // already covered
    }
    if (qualified && hard.length) sub.push("condition_incorrectly_rejected");
    if (excluded && exceptionHits.length) sub.push("exception_missed");
    if ((excluded || researched === false) && unknownExclude.length && a.classification === "disqualified") {
      sub.push("unknown_treated_as_false");
    }
    if (/similar name|looks like|same company|name match|resembl/.test(rationale)) {
      sub.push("account_identity_inferred");
    }
    if (excluded && notSatExclude.some((t) => /territor|region|payback|seat|united states/.test(String(t.scope || "") + String(t.knowledge_item_id || "")))) {
      if (record && new RegExp("protected", "i").test(JSON.stringify(record.qualification_policy || {}))) {
        sub.push("scope_overextended");
      }
    }
    const applied = mine.filter((t) => t.hard_exclude);
    const higherException = mine.filter((t) => t.exception && Number(t.priority || 0) >= Math.max(0, ...applied.map((x) => Number(x.priority || 0))));
    if (applied.length && higherException.length) sub.push("priority_error");
  }
  return [...new Set(sub.filter((s) => ATTRIBUTION_SUBREASONS.includes(s)))];
}

export function loadApplicabilityMicrobenchmark(path) {
  const p = path || APPLICABILITY_MICRO_PATH;
  const text = readFileSync(p, "utf8");
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function applicabilityMicroSha256(path) {
  const p = path || APPLICABILITY_MICRO_PATH;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

export function scoreApplicabilityMicrobenchmark(path) {
  const items = loadApplicabilityMicrobenchmark(path);
  let correct = 0;
  const rows = [];
  let newCfs = 0;
  for (const item of items) {
    const got = evaluateApplicability(item.knowledge_item.applicability, item.prospect);
    const exp = item.expected || {};
    const okApp = got.applicability === exp.applicability;
    const okHard = got.hard_exclude === Boolean(exp.hard_exclude);
    const okEx = (got.exception || null) === (exp.exception || null);
    const okAction = got.suggested_next_action === exp.suggested_next_action;
    const ok = okApp && okHard && okEx && okAction;
    if (ok) correct += 1;
    if (exp.hard_exclude === false && got.hard_exclude === true && exp.suggested_next_action !== "exclude") {
      newCfs += 1;
    }
    rows.push({
      id: item.id,
      situation: item.situation,
      expected: exp,
      got: {
        applicability: got.applicability,
        hard_exclude: got.hard_exclude,
        exception: got.exception,
        suggested_next_action: got.suggested_next_action,
        unmet_conditions: got.unmet_conditions,
      },
      ok: ok,
    });
  }
  const accuracy = items.length ? correct / items.length : 0;
  return {
    n: items.length,
    correct: correct,
    accuracy: accuracy,
    accuracyPct: Math.round(accuracy * 1000) / 10,
    newCriticalFailures: newCfs,
    passed: accuracy >= 0.95 && newCfs === 0,
    rows: rows,
  };
}

export function findLocator(text, phrases, section) {
  const lower = String(text || "").toLowerCase();
  for (const phrase of asList(phrases)) {
    const i = lower.indexOf(String(phrase).toLowerCase());
    if (i >= 0) {
      return { section: section || "Rules", charStart: i, charEnd: i + phrase.length, text: text.slice(i, i + phrase.length) };
    }
  }
  return null;
}

/**
 * Extract only conditions whose phrases are present in source. Keep lineage via sourceSpan.
 */
export function compileApplicabilityFromSource(args) {
  const text = args.text || "";
  const spec = args.spec || {};
  const rejected = [];
  const conditions = [];
  for (const cond of asList(spec.requiredConditions)) {
    const loc = findLocator(text, cond.phrases || [cond.description], spec.section || "Rules");
    if (!loc) {
      rejected.push({ id: cond.id, reason: "condition_not_in_source" });
      continue;
    }
    conditions.push({
      id: cond.id,
      kind: cond.kind || "structured",
      field: cond.field,
      op: cond.op,
      value: cond.value,
      description: cond.description,
      evidenceRequired: Boolean(cond.evidenceRequired),
      evidenceFilter: cond.evidenceFilter || undefined,
      sourceSpan: loc,
    });
  }
  const exceptions = [];
  for (const ex of asList(spec.exceptions)) {
    const loc = findLocator(text, ex.phrases || [ex.description], spec.section || "Rules");
    if (!loc) {
      rejected.push({ id: ex.id, reason: "exception_not_in_source" });
      continue;
    }
    const exConds = [];
    for (const cond of asList(ex.conditions)) {
      const cloc = findLocator(text, cond.phrases || [cond.description], spec.section || "Rules") || loc;
      exConds.push({ ...cond, sourceSpan: cloc, kind: cond.kind || "structured" });
    }
    exceptions.push({ id: ex.id, description: ex.description, conditions: exConds, sourceSpan: loc });
  }
  const span = findLocator(text, spec.spanPhrases || spec.phrases || [], spec.section || "Rules");
  if (!conditions.length) {
    return { ok: false, rejected: rejected, contract: null };
  }
  const contract = {
    scope: spec.scope,
    subjectType: spec.subjectType || "account",
    requiredConditions: conditions,
    requiredEvidence: spec.requiredEvidence || ["first_party_or_official"],
    effect: spec.effect || "exclude",
    unknownBehavior: spec.unknownBehavior || "research_first",
    exceptions: exceptions,
    priority: spec.priority != null ? spec.priority : 50,
    sourceSpan: span || conditions[0].sourceSpan,
    compilerVersion: APPLICABILITY_PARSER_VERSION,
  };
  return { ok: true, rejected: rejected, contract: contract };
}

export const OWNER_APPLICABILITY_SPECS = [
  {
    knowledgeItemId: "K-OWN-001-01",
    sourceId: "SRC-OWN-001",
    scope: "founder-led commercial motion geography",
    subjectType: "account",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 80,
    phrases: ["Serve United States accounts only"],
    requiredConditions: [
      {
        id: "c-us-only",
        field: "country",
        op: "neq",
        value: "US",
        description: "Account is headquartered outside the United States",
        phrases: ["headquartered outside the United States are excluded"],
        evidenceRequired: true,
        evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 365 },
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-001-02",
    sourceId: "SRC-OWN-001",
    scope: "founder-led commercial motion size",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 80,
    phrases: ["minimum of eight employees"],
    requiredConditions: [
      {
        id: "c-headcount",
        field: "employee_count",
        op: "lt",
        value: 8,
        description: "Headcount below eight",
        phrases: ["Headcount below eight is a hard exclusion"],
        evidenceRequired: true,
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-001-03",
    sourceId: "SRC-OWN-001",
    scope: "founder-led commercial motion spend",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 80,
    phrases: ["verified monthly spend of at least 2500 USD"],
    requiredConditions: [
      {
        id: "c-spend",
        field: "monthly_spend_usd",
        op: "lt",
        value: 2500,
        description: "Verified monthly spend below 2500 USD",
        phrases: ["verified monthly spend of at least 2500 USD"],
        evidenceRequired: true,
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-001-04",
    sourceId: "SRC-OWN-001",
    scope: "founder-led commercial motion unknowns",
    effect: "research_first",
    unknownBehavior: "research_first",
    priority: 70,
    phrases: ["When employee count or verified monthly spend is unknown"],
    requiredConditions: [
      {
        id: "c-size-or-spend-unknown",
        field: "employee_count",
        op: "not_exists",
        value: true,
        description: "Employee count or verified monthly spend is unknown",
        phrases: ["When employee count or verified monthly spend is unknown"],
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-002-03",
    sourceId: "SRC-OWN-002",
    scope: "buyer authority",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 80,
    phrases: ["none, headquarters-only, or title-only are excluded"],
    requiredConditions: [
      {
        id: "c-auth-exclude",
        field: "buyer_authority",
        op: "in",
        value: ["none", "headquarters-only", "title-only", "hq_only", "title_only"],
        description: "Authority record is none, headquarters-only, or title-only",
        phrases: ["none, headquarters-only, or title-only are excluded"],
        evidenceRequired: true,
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-003-01",
    sourceId: "SRC-OWN-003",
    scope: "hiring signal freshness",
    effect: "research_first",
    unknownBehavior: "research_first",
    priority: 60,
    phrases: ["older than 45 days is stale"],
    requiredConditions: [
      {
        id: "c-stale-signal",
        field: "first_party_signal_age_days",
        op: "gt",
        value: 45,
        description: "First-party hiring signal older than 45 days",
        phrases: ["older than 45 days is stale"],
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-003-02",
    sourceId: "SRC-OWN-003",
    scope: "hiring signal freshness",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 85,
    phrases: ["current first-party freeze overrides older third-party listings"],
    requiredConditions: [
      {
        id: "c-freeze",
        field: "hiring_freeze",
        op: "eq",
        value: true,
        description: "Current first-party freeze is present",
        phrases: ["current first-party freeze overrides"],
        evidenceRequired: true,
        evidenceFilter: { sources: ["first_party"], maxAgeDays: 45 },
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-004-02",
    sourceId: "SRC-OWN-004",
    scope: "served-region assignment",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 75,
    phrases: ["Pacific Northwest is reserved"],
    requiredConditions: [
      {
        id: "c-pnw",
        field: "region",
        op: "in",
        value: ["pacific_northwest", "Pacific Northwest"],
        description: "Region is the reserved Pacific Northwest",
        phrases: ["Pacific Northwest is reserved"],
        evidenceRequired: true,
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-005-01",
    sourceId: "SRC-OWN-005",
    scope: "new-logo commercial motion",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 90,
    phrases: ["Existing customers are protected"],
    requiredConditions: [
      {
        id: "c-existing",
        field: "account_status",
        op: "eq",
        value: "existing_customer",
        description: "Account is an existing customer",
        phrases: ["Existing customers are protected"],
        evidenceRequired: true,
        evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 45 },
      },
    ],
    note: "SRC-OWN-005 does not state how identity is established. See SRC-OWN-008.",
  },
  {
    knowledgeItemId: "K-OWN-005-02",
    sourceId: "SRC-OWN-005",
    scope: "new-logo commercial motion",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 90,
    phrases: ["Public-sector and government verticals are a lockout"],
    requiredConditions: [
      {
        id: "c-gov",
        field: "vertical",
        op: "in",
        value: ["public_sector", "government"],
        description: "Vertical is public-sector or government",
        phrases: ["Public-sector and government verticals are a lockout"],
        evidenceRequired: true,
        evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 90 },
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-006-01",
    sourceId: "SRC-OWN-006",
    scope: "seat-based offer unit economics",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 70,
    phrases: ["minimum of four seats"],
    requiredConditions: [
      {
        id: "c-seats",
        field: "seat_count",
        op: "lt",
        value: 4,
        description: "Seat count below four",
        phrases: ["Accounts below four seats are excluded"],
        evidenceRequired: true,
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-006-02",
    sourceId: "SRC-OWN-006",
    scope: "seat-based offer unit economics",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 70,
    phrases: ["payback is longer than nine months"],
    requiredConditions: [
      {
        id: "c-payback",
        field: "modeled_payback_months",
        op: "gt",
        value: 9,
        description: "Modeled payback longer than nine months",
        phrases: ["payback is longer than nine months"],
        evidenceRequired: true,
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-007-01",
    sourceId: "SRC-OWN-007",
    scope: "hiring signal freshness",
    effect: "research_first",
    unknownBehavior: "research_first",
    priority: 65,
    phrases: ["not an automatic disqualification"],
    requiredConditions: [
      {
        id: "c-stale-insufficient",
        field: "first_party_signal_age_days",
        op: "gt",
        value: 45,
        description: "Stale first-party hiring signal is insufficient",
        phrases: ["insufficient to establish current hiring and requires research"],
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-008-01",
    sourceId: "SRC-OWN-008",
    scope: "new-logo commercial motion",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 95,
    phrases: ["applies only when current first-party or official evidence supports"],
    requiredConditions: [
      {
        id: "c-existing-supported",
        field: "account_status",
        op: "eq",
        value: "existing_customer",
        description: "Same account is an existing customer supported by current first-party or official evidence",
        phrases: ["same account is an existing customer"],
        evidenceRequired: true,
        evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 45 },
      },
    ],
    exceptions: [
      {
        id: "ex-reopen",
        description: "Documented written exception or re-open authorization overrides a protection lockout",
        phrases: ["re-open authorization overrides"],
        conditions: [
          {
            id: "c-reopen",
            field: "reopen_authorization",
            op: "eq",
            value: true,
            description: "Written re-open authorization is on file",
            phrases: ["re-open authorization overrides"],
          },
        ],
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-008-02",
    sourceId: "SRC-OWN-008",
    scope: "new-logo commercial motion",
    effect: "exclude",
    unknownBehavior: "research_first",
    priority: 95,
    phrases: ["public-sector or government vertical"],
    requiredConditions: [
      {
        id: "c-gov-supported",
        field: "vertical",
        op: "in",
        value: ["public_sector", "government"],
        description: "Vertical is public-sector or government with current supporting evidence",
        phrases: ["public-sector or government vertical"],
        evidenceRequired: true,
        evidenceFilter: { sources: ["first_party", "official"], maxAgeDays: 90 },
      },
    ],
  },
  {
    knowledgeItemId: "K-OWN-008-03",
    sourceId: "SRC-OWN-008",
    scope: "new-logo commercial motion",
    effect: "research_first",
    unknownBehavior: "research_first",
    priority: 92,
    phrases: ["When current account status is missing, research is required"],
    requiredConditions: [
      {
        id: "c-status-missing",
        field: "account_status",
        op: "not_exists",
        value: true,
        description: "Current account status is missing",
        phrases: ["When current account status is missing, research is required"],
      },
    ],
  },
];

const COMPILED_CACHE = new Map();

export function compiledContractForId(id) {
  if (COMPILED_CACHE.has(id)) return COMPILED_CACHE.get(id);
  return null;
}

export function registerCompiledContract(id, contract) {
  COMPILED_CACHE.set(id, contract);
  return contract;
}

export function compileOwnerSpecsAgainstText(sourceId, text) {
  const out = [];
  for (const spec of OWNER_APPLICABILITY_SPECS) {
    if (spec.sourceId !== sourceId) continue;
    const compiled = compileApplicabilityFromSource({ text: text, spec: spec });
    if (compiled.ok) {
      registerCompiledContract(spec.knowledgeItemId, compiled.contract);
      out.push({ id: spec.knowledgeItemId, contract: compiled.contract, rejected: compiled.rejected });
    } else {
      out.push({ id: spec.knowledgeItemId, contract: null, rejected: compiled.rejected });
    }
  }
  return out;
}

export function enrichKnowledgeItem(item) {
  if (!item) return item;
  if (item.applicability) return item;
  const c = compiledContractForId(item.id);
  if (!c) return item;
  return { ...item, applicability: c };
}

export function knowledgePromptApplicability(item) {
  const c = item && (item.applicability || compiledContractForId(item.id));
  if (!c) return "";
  const conds = asList(c.requiredConditions)
    .map((x) => x.id + ":" + x.description)
    .join("; ");
  const ex = asList(c.exceptions)
    .map((x) => x.id + ":" + x.description)
    .join("; ");
  return (
    " applicability{scope=" +
    String(c.scope || "") +
    "; subject=" +
    String(c.subjectType || "account") +
    "; conditions=[" +
    conds +
    "]; effect=" +
    String(c.effect) +
    "; unknown=" +
    String(c.unknownBehavior) +
    "; exceptions=[" +
    ex +
    "]; priority=" +
    String(c.priority) +
    "}"
  );
}

export function inspectableApplicability(item) {
  const c = item && (item.applicability || compiledContractForId(item.id));
  if (!c) {
    return {
      knowledgeItemId: item && item.id,
      statement: item && item.statement,
      applicability: null,
      ownerReason: item && item.sourceId === "SRC-OWN-005"
        ? "Protected-account source is ambiguous on identity, expiry, stale registry, and prospect-supplied claims. See SRC-OWN-008 (new source revision; earlier source was not edited)."
        : null,
    };
  }
  return {
    knowledgeItemId: item && item.id,
    statement: item && item.statement,
    sourceId: item && item.sourceId,
    scope: c.scope,
    subjectType: c.subjectType,
    requiredConditions: c.requiredConditions,
    requiredEvidence: c.requiredEvidence,
    effect: c.effect,
    unknownBehavior: c.unknownBehavior,
    exceptions: c.exceptions,
    priority: c.priority,
    sourceSpan: c.sourceSpan,
    ownerReason:
      item && item.sourceId === "SRC-OWN-005"
        ? "SRC-OWN-005 states lockouts but not identity tests. SRC-OWN-008 is the new inspectable revision."
        : item && item.sourceId === "SRC-OWN-008"
          ? "New source revision. Earlier SRC-OWN-005 was not edited."
          : null,
  };
}

export function microbenchmarkLockOk() {
  if (!existsSync(APPLICABILITY_MICRO_LOCK) || !existsSync(APPLICABILITY_MICRO_PATH)) return false;
  const lock = JSON.parse(readFileSync(APPLICABILITY_MICRO_LOCK, "utf8"));
  const sha = applicabilityMicroSha256();
  return Boolean(lock.frozenBeforePrompt) && lock.microbenchmark && lock.microbenchmark.sha256 === sha;
}
