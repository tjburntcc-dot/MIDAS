/** Exact source support for source-backed findings. Deterministic. Semantic interpretation is advisory. */
import { createHash } from "node:crypto";
import { looksLikeA11yChrome, looksLikeBoilerplate, looksLikeCookieBanner } from "./html-extract.ts";

export const SUPPORT_CHECK_VERSION = "midas-source-support-v0.1.0";
export const SUPPORT_STATUSES = [
  "supported_direct_fact",
  "supported_as_inference_only",
  "excerpt_missing",
  "excerpt_boilerplate",
  "claim_introduces_unsupported_detail",
  "unsupported_inference_as_fact",
  "source_integrity_failed",
];

function normalizeExcerpt(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function excerptHash(text) {
  return createHash("sha256").update(normalizeExcerpt(text)).digest("hex");
}

function extractNumbers(text) {
  const s = String(text || "");
  const out = [];
  const re = /(?:\$\s*)?(\d+(?:\.\d+)?)(\s*%|\s*percent|\s*usd)?/gi;
  let m;
  while ((m = re.exec(s))) out.push((m[1] + (m[2] || "")).replace(/\s+/g, "").toLowerCase());
  return out;
}

function numbersSupported(claim, excerpt, sourceText) {
  const nums = extractNumbers(claim);
  if (!nums.length) return true;
  const hay = normalizeExcerpt(String(excerpt || "") + " " + String(sourceText || ""));
  return nums.every((n) => hay.includes(n.replace("usd", "")) || hay.includes(n));
}

function excerptInSource(excerpt, sourceText) {
  const ex = normalizeExcerpt(excerpt);
  const src = normalizeExcerpt(sourceText);
  if (!ex || ex.length < 8) return false;
  if (src.includes(ex)) return true;
  const head = ex.slice(0, Math.min(48, ex.length));
  return Boolean(head.length >= 12 && src.includes(head));
}

function locatorMatches(locator, sourceText, excerpt) {
  if (!locator) return { ok: true, note: "no locator" };
  const src = String(sourceText || "");
  const text = String((locator && locator.text) || excerpt || "");
  if (!text) return { ok: false, note: "locator text empty" };
  const idx = src.indexOf(text.slice(0, Math.min(40, text.length)));
  if (idx < 0) return { ok: excerptInSource(excerpt, sourceText), note: "locator text not aligned; excerpt fallback used" };
  return { ok: true, note: "locator text present", charStart: idx };
}

function inferenceCue(claim) {
  return /\b(may be|typically|suggests|likely|probably|appears|candidate for|implies|therefore|should treat|buying signal)\b/i.test(String(claim || ""));
}

function causalityOrBusiness(claim) {
  return /\b(because|therefore|causes|will increase|conversion rate|win[- ]rate|average revenue|market size|tam\b|closes more)\b/i.test(String(claim || ""));
}

export function checkSourceSupport(payload) {
  const claim = String((payload && payload.claim) || "");
  const excerpt = String((payload && payload.excerpt) || "");
  const sourceText = String((payload && (payload.sourceText || payload.substantiveText || payload.fetchedText)) || "");
  const sourceId = (payload && payload.sourceId) || null;
  const checksum = (payload && (payload.contentChecksum || payload.sourceSha256)) || null;
  const locator = (payload && payload.locator) || null;
  const requestedKind = (payload && payload.kind) || null;
  const reasons = [];
  let status = "supported_direct_fact";
  let relationship = "direct_quote_or_paraphrase";
  let factClass = "direct_source_fact";

  if (!sourceId) reasons.push("missing_source_id");
  if (!sourceText || sourceText.length < 8) {
    reasons.push("missing_source_text");
    if (payload && payload.requireSourceText) status = "source_integrity_failed";
  }
  if (!excerpt || excerpt.length < 8) {
    reasons.push("excerpt_missing");
    status = status === "source_integrity_failed" ? status : "excerpt_missing";
  } else if (!excerptInSource(excerpt, sourceText)) {
    reasons.push("excerpt_not_in_fetched_source");
    status = "excerpt_missing";
  }
  if (excerpt && (looksLikeBoilerplate(excerpt) || looksLikeA11yChrome(excerpt) || looksLikeCookieBanner(excerpt))) {
    reasons.push("excerpt_is_nav_or_boilerplate");
    status = "excerpt_boilerplate";
  }
  const loc = locatorMatches(locator, sourceText, excerpt);
  if (!loc.ok) reasons.push("locator_mismatch");
  if (!numbersSupported(claim, excerpt, sourceText)) {
    reasons.push("unsupported_numbers");
    status = "claim_introduces_unsupported_detail";
  }
  if (causalityOrBusiness(claim) && !excerptInSource(claim.slice(0, 40), excerpt + " " + sourceText)) {
    const claimNums = extractNumbers(claim);
    const hayHas = claimNums.every((n) => normalizeExcerpt(excerpt + " " + sourceText).includes(n.replace("usd", "")));
    if (!hayHas || /\b(conversion rate|win[- ]rate|average revenue|market size)\b/i.test(claim) && !/\b(conversion rate|win[- ]rate|average revenue|market size)\b/i.test(excerpt + " " + sourceText)) {
      reasons.push("unsupported_business_conclusion");
      status = "claim_introduces_unsupported_detail";
    }
  }
  if (inferenceCue(claim) || requestedKind === "inference") {
    factClass = "inference";
    relationship = "inference_from_excerpt";
    if (requestedKind === "source_backed_fact" || (payload && payload.presentAsFact === true)) {
      reasons.push("inference_presented_as_direct_fact");
      status = "unsupported_inference_as_fact";
    } else if (status === "supported_direct_fact") {
      status = "supported_as_inference_only";
    }
  }
  const valid = status === "supported_direct_fact" || status === "supported_as_inference_only";
  return {
    sourceId: sourceId,
    contentChecksum: checksum,
    excerpt: excerpt,
    normalizedExcerptHash: excerpt ? excerptHash(excerpt) : null,
    locator: locator,
    claim: claim,
    claimExcerptRelationship: relationship,
    supportStatus: status,
    supportCheckVersion: SUPPORT_CHECK_VERSION,
    factClass: factClass,
    valid: valid,
    eligibleAsSourceBackedFact: status === "supported_direct_fact",
    reasons: reasons,
    semanticInterpretation: "advisory",
    note: valid
      ? (factClass === "inference"
        ? "Supported as inference only. Do not present as what the source stated."
        : "Excerpt exists in the fetched source and is not chrome.")
      : "Not eligible as a source-backed fact: " + (reasons.join(", ") || status),
  };
}

export function attachSupportToFinding(finding, extras) {
  const support = checkSourceSupport({
    claim: finding && finding.claim,
    excerpt: finding && finding.excerpt,
    sourceText: extras && extras.sourceText,
    sourceId: finding && finding.sourceId,
    contentChecksum: extras && extras.contentChecksum,
    locator: finding && finding.locator,
    kind: finding && finding.kind,
    presentAsFact: finding && finding.kind === "source_backed_fact",
  });
  return { ...finding, support: support, supportStatus: support.supportStatus };
}
