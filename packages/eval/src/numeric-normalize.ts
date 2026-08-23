/** Structured context-preserving numeric validation. Evaluator-only. */

export const NUMERIC_NORMALIZATION_VERSION = "num-norm-v1";

export const NUMERIC_OPERATORS = ["gt", "gte", "lt", "lte", "exact", "approx", "range"];

export const FIELD_ALIASES = {
  verified_monthly_spend: "monthly_spend",
  monthly_spend: "monthly_spend",
  verified_monthly_budget: "monthly_spend",
  monthly_budget: "monthly_spend",
  budget: "monthly_spend",
  spend: "monthly_spend",
  software_budget: "monthly_spend",
  revenue: "revenue",
  annual_revenue: "revenue",
  tam: "tam",
  market_size: "tam",
  total_addressable_market: "tam",
  price: "price",
  product_price: "price",
  wages: "wages",
  wage: "wages",
  salary: "wages",
  pay: "wages",
  median_pay: "wages",
  headcount: "headcount",
  employees: "headcount",
  employee_count: "headcount",
  version: "version",
  date: "date",
  year: "date",
};

const FIELD_PATTERNS = [
  { field: "verified_monthly_spend", re: /verified\s+monthly\s+spend|monthly\s+spend/i },
  { field: "verified_monthly_budget", re: /verified\s+monthly\s+budget|monthly\s+budget/i },
  { field: "software_budget", re: /software\s+budget/i },
  { field: "annual_revenue", re: /annual\s+revenue/i },
  { field: "revenue", re: /\brevenue\b/i },
  { field: "tam", re: /\bTAM\b|total addressable market|market size/i },
  { field: "product_price", re: /product\s+price|\bprice\b/i },
  { field: "wages", re: /\bwages?\b|\bsalary\b|\bmedian pay\b|\bhourly\b/i },
  { field: "headcount", re: /\bemployees?\b|\bheadcount\b|\bseats?\b/i },
  { field: "version", re: /\bversion\b|\bbuild\b/i },
  { field: "date", re: /\byear\b|\bdated?\b/i },
];

function canonField(field) {
  if (!field) return null;
  const key = String(field).toLowerCase().replace(/[-\s]+/g, "_");
  return FIELD_ALIASES[key] || key;
}

function parseNumberToken(raw, scaleWord) {
  const cleaned = String(raw || "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const scale = String(scaleWord || "").toLowerCase();
  if (scale === "k" || scale === "thousand") return n * 1e3;
  if (scale === "m" || scale === "million") return n * 1e6;
  if (scale === "b" || scale === "billion") return n * 1e9;
  return n;
}

function detectPeriod(window) {
  const t = String(window || "");
  if (/annual|per\s+year|\/\s*year|yearly|\byear\b/i.test(t) && !/monthly|per\s+month/i.test(t)) return "year";
  if (/month(?:ly)?|per\s+month|\/\s*month/i.test(t)) return "month";
  if (/hour(?:ly)?|per\s+hour/i.test(t)) return "hour";
  return null;
}

function detectOperator(window) {
  const t = String(window || "");
  if (/between\s+.+\s+and\s+/i.test(t)) return "range";
  if (/at least|minimum|min(?:imum)?\s+of|or higher|or more|>=|gte/i.test(t)) return "gte";
  if (/more than|greater than|above|over\b|gt\b/i.test(t)) return "gt";
  if (/at most|maximum|up to|no more than|<=|lte/i.test(t)) return "lte";
  if (/less than|below|under\b|lt\b/i.test(t)) return "lt";
  if (/approx(?:imately)?|about\s|~\s*|roughly/i.test(t)) return "approx";
  if (/exactly|exact(?:ly)?/i.test(t)) return "exact";
  return "exact";
}

function detectField(window) {
  const t = String(window || "");
  for (const p of FIELD_PATTERNS) {
    if (p.re.test(t)) return p.field;
  }
  return null;
}

function detectCurrency(window, explicit) {
  if (explicit) return String(explicit).toUpperCase() === "DOLLARS" || String(explicit).toUpperCase() === "DOLLAR" ? "USD" : String(explicit).toUpperCase();
  const t = String(window || "");
  if (/\$|usd|dollars?/i.test(t)) return "USD";
  return null;
}

const MONEY_SOURCE = String.raw`\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|thousand|[MBk])?|\b(USD)\s*([\d,]+(?:\.\d+)?)\b|\b([\d,]+(?:\.\d+)?)\s*(USD|dollars?)\b|\b([\d,]+(?:\.\d+)?)\s*(million|billion)\s*(?:dollars|USD)?`;

export function extractNumericMentions(text) {
  const blob = String(text || "");
  const re = new RegExp(MONEY_SOURCE, "gi");
  const hits = [];
  const occupied = [];
  let m;
  while ((m = re.exec(blob))) {
    let value = null;
    let scale = null;
    let currency = null;
    if (m[1] != null) {
      scale = m[2];
      value = parseNumberToken(m[1], scale);
      currency = "USD";
    } else if (m[3] != null) {
      value = parseNumberToken(m[4], null);
      currency = "USD";
    } else if (m[5] != null) {
      value = parseNumberToken(m[5], null);
      currency = detectCurrency(m[6], m[6]);
    } else if (m[7] != null) {
      value = parseNumberToken(m[7], m[8]);
      currency = /dollars|USD/i.test(m[0]) ? "USD" : null;
    }
    if (value == null) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    const window = blob.slice(Math.max(0, start - 80), Math.min(blob.length, end + 80));
    const field = detectField(window);
    hits.push({
      raw: m[0].trim(),
      value: value,
      currency: currency || detectCurrency(window, null),
      unit: currency || detectCurrency(window, null) ? "money" : null,
      period: detectPeriod(window) || (field && /monthly/.test(field) ? "month" : field && /annual/.test(field) ? "year" : null),
      comparison: detectOperator(window),
      field: field,
      fieldCanon: canonField(field),
      start: start,
      end: end,
      window: window,
      calculated: /times\s+12|\*\s*12|x\s*12|annualized/i.test(window),
    });
    occupied.push([start, end]);
  }
  const bare = new RegExp(String.raw`\b(version|build|year|dated?)\s+(\d{2,4})\b`, "gi");
  let b;
  while ((b = bare.exec(blob))) {
    const start = b.index;
    const end = b.index + b[0].length;
    if (occupied.some((r) => start < r[1] && end > r[0])) continue;
    const window = blob.slice(Math.max(0, start - 40), Math.min(blob.length, end + 40));
    hits.push({
      raw: b[0],
      value: Number(b[2]),
      currency: null,
      unit: "identifier",
      period: null,
      comparison: "exact",
      field: /year|date/i.test(b[1]) ? "date" : "version",
      fieldCanon: /year|date/i.test(b[1]) ? "date" : "version",
      start: start,
      end: end,
      window: window,
      calculated: false,
    });
  }
  return hits;
}

export function knowledgeToClaims(items) {
  const out = [];
  for (const k of items || []) {
    const text = [k.excerpt, k.statement, k.locator && k.locator.text, k.claim].filter(Boolean).join("\n");
    for (const m of extractNumericMentions(text)) {
      out.push({
        ...m,
        evidenceKnowledgeId: k.id || null,
        evidenceValue: m.value,
        evidenceCurrency: m.currency,
        evidenceUnit: m.unit,
        evidencePeriod: m.period,
        source: "knowledge",
      });
    }
  }
  return out;
}

function fieldsCompatible(a, b) {
  const ca = canonField(a);
  const cb = canonField(b);
  if (!ca || !cb) return false;
  return ca === cb;
}

function periodsCompatible(a, b) {
  if (!a || !b) return false;
  return a === b;
}

function currenciesCompatible(a, b) {
  if (!a || !b) return false;
  return String(a).toUpperCase() === String(b).toUpperCase();
}

function operatorsCompatible(outOp, evOp) {
  const a = outOp || "exact";
  const b = evOp || "exact";
  if (a === b) return true;
  if ((a === "gte" || a === "gt") && (b === "gte" || b === "gt")) return true;
  if ((a === "lte" || a === "lt") && (b === "lte" || b === "lt")) return true;
  return false;
}

function minVsActualMismatch(outClaim, evClaim) {
  const evThresh = evClaim.comparison === "gte" || evClaim.comparison === "gt";
  const outActual = !outClaim.comparison || outClaim.comparison === "exact";
  if (evThresh && outActual) return true;
  return false;
}

export function claimsStructurallyMatch(outputClaim, evidenceClaim, extras) {
  const reasons = [];
  if (outputClaim.value !== evidenceClaim.value) {
    reasons.push("value_mismatch");
  }
  if (!currenciesCompatible(outputClaim.currency, evidenceClaim.currency)) {
    reasons.push("currency_mismatch");
  }
  if (!periodsCompatible(outputClaim.period, evidenceClaim.period)) {
    reasons.push("period_mismatch");
  }
  if (!fieldsCompatible(outputClaim.field, evidenceClaim.field)) {
    reasons.push("field_mismatch");
  }
  if (!operatorsCompatible(outputClaim.comparison, evidenceClaim.comparison)) {
    reasons.push("operator_mismatch");
  }
  if (minVsActualMismatch(outputClaim, evidenceClaim)) {
    reasons.push("min_vs_actual");
  }
  if (outputClaim.calculated && !(extras && extras.approvedRule)) {
    reasons.push("calculated_without_approved_rule");
  }
  return {
    match: reasons.length === 0,
    reasons: reasons,
    output: outputClaim,
    evidence: evidenceClaim,
  };
}

export function formatEquivalents(value, currency) {
  if (currency === "USD" && value === 2500) {
    return ["2500 USD", "USD 2500", "$2500", "$2,500", "2,500 dollars"];
  }
  const raw = String(value);
  const withComma = value >= 1000 ? value.toLocaleString("en-US") : raw;
  const list = [raw + " " + currency, currency + " " + raw];
  if (currency === "USD") {
    list.push("$" + raw, "$" + withComma, withComma + " dollars");
  }
  return list;
}

export function validateNumericClaims(outputText, approvedKnowledge, extras) {
  const mentions = extractNumericMentions(outputText);
  const evidence = (extras && extras.evidenceClaims) || knowledgeToClaims(approvedKnowledge);
  const supported = [];
  const unmatched = [];
  const comparisons = [];
  for (const mention of mentions) {
    let best = null;
    for (const ev of evidence) {
      const cmp = claimsStructurallyMatch(mention, ev, extras);
      if (cmp.match) {
        best = { ...cmp, evidenceKnowledgeId: ev.evidenceKnowledgeId || ev.id };
        break;
      }
    }
    comparisons.push(best || { match: false, reasons: ["no_structural_evidence"], output: mention, evidence: null });
    if (best) supported.push({ ...mention, evidenceKnowledgeId: best.evidenceKnowledgeId });
    else unmatched.push(mention);
  }
  return {
    version: NUMERIC_NORMALIZATION_VERSION,
    mentions: mentions,
    evidence: evidence,
    supported: supported,
    unmatched: unmatched,
    comparisons: comparisons,
  };
}

export function explainNumericNormalization() {
  return {
    version: NUMERIC_NORMALIZATION_VERSION,
    safeFormatting: "2500 USD = USD 2500 = $2500 = $2,500 = 2,500 dollars when field, currency, period, and operator match.",
    notEquated: [
      "monthly vs annual",
      "$2500 vs $2.5M",
      "2500 vs 2501",
      "revenue vs budget",
      "customer spend vs product price",
      "wages vs software budget",
      "min threshold vs observed actual",
      "date/version vs financial",
      "calculated output without an approved rule",
    ],
    operatorsPreserved: NUMERIC_OPERATORS,
    requiredMatch: ["value", "currency", "unit/period", "comparison operator", "field/policy concept", "evidence knowledge id"],
  };
}
