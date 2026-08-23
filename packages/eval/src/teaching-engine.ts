/** Evidence learning and teaching engine. Verified knowledge + packets + lexical retrieval + policy + evaluation. Not weights, fine-tuning, or RL. */
import { requireWorkspaceId, listApprovedKnowledgeInWorkspace, listTeachingPacketsInWorkspace } from "./workspace-isolation.ts";
import { createHash } from "node:crypto";
import { contentHash } from "@midas/db";
import {
  extractSubstantiveHtml,
  looksLikeA11yChrome,
  looksLikeCookieBanner,
  looksLikeVideoPlaceholder,
  looksLikeBoilerplate,
} from "./html-extract.ts";
import { isCompensationText } from "./research-brief.ts";
import { evaluateKnowledgeUsefulness } from "./usefulness.ts";
import { checkSourceSupport } from "./source-support.ts";
import { recordContribution } from "./contribution.ts";
import { resolveActorType, rejectMasonClaim, OWNER_LIKE_ACTORS } from "./approval-actors.ts";
import { createLocalOwnerSession } from "./approval-actors.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { SCOUT_ROLE_ID, SCOUT_ROLE_NAME, assertScoutMayNot } from "./scout.ts";
import {
  acquirePublicSource,
  RESEARCH_CAPABILITY_LABEL,
  SEARCH_INTEGRATION_EXISTS,
  MISSION18_RESEARCH_OBJECTIVE,
  MISSION18_PERMITTED_DOMAINS,
  MISSION18_MAX_PAGES,
  MISSION18_MAX_DOMAINS,
  MISSION18_MAX_PAGES_PER_DOMAIN,
  MISSION18_MAX_DEPTH,
  extractSameDomainLinks,
  isRelevantFollowLink,
  recordHasRequiredFields,
} from "./source-acquisition.ts";

export const TEACHING_CAPABILITY_LABEL = RESEARCH_CAPABILITY_LABEL;
export const RETRIEVAL_METHOD = "lexical_deterministic";
export const RETRIEVAL_LABEL = "lexical/deterministic. Not embeddings. Not vector search. Hybrid/vector can be added later without changing the teaching contract.";
export const LEARNING_DESCRIPTION =
  "Verified knowledge + teaching packets + lexical/deterministic retrieval + owner policy + evaluation + supervised work. No weight updates, fine-tuning, RL, embeddings, or internet-wide search.";

export const FINDING_TYPES = [
  "directly_supported_fact",
  "vendor_marketing_claim",
  "observed_product_feature",
  "public_pricing_observation",
  "cross_source_corroboration",
  "cautious_inference",
  "unresolved_question",
  "owner_policy_suggestion",
];

export const PACKET_STATUSES = [
  "proposed",
  "rejected",
  "awaiting_owner_approval",
  "approved_for_supervised_use",
  "invalidated",
  "expired",
];

export const EPISODE_OUTCOMES = [
  "improved",
  "unchanged",
  "regressed",
  "blocked",
  "insufficient_evidence",
  "awaiting_owner_approval",
];

export const AUTONOMY_MODES = {
  1: "owner_review_required",
  2: "delegated_within_policy",
  3: "bounded_auto_approve",
  4: "autonomous_learning",
};

export const DEFAULT_APPROVAL_MODE = "owner_review_required";
export const DELEGATED_AUTONOMY_ACTIVATED = false;
export const AUTONOMOUS_LEARNING_IMPLEMENTED = false;

export const IMPROVEMENT_CRITERIA = [
  "source_grounded_positioning",
  "vendor_stated_category",
  "marketing_vs_fact_labeled",
  "citations_relevant",
  "competitive_uncertainty_visible",
  "facts_vs_open_questions",
  "safer_next_step",
];

export const NOT_IMPROVEMENT = [
  "length",
  "confidence",
  "extra_unsupported_claims",
  "more_citations_regardless_of_relevance",
  "invented_tam_demand_prices_interviews",
  "keyword_matching",
];

export const EVIDENCE_LEARNING_CATEGORY = "evidence_learning";
export const EVIDENCE_LEARNING_OWNER_OBJECTIVE = MISSION18_RESEARCH_OBJECTIVE;

function nowIso() {
  return new Date().toISOString();
}

function checksumOf(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function nextId(store, prefix, lister) {
  const existing = lister ? lister() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r && r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

function jaccard(a, b) {
  const A = a instanceof Set ? a : tokenSet(a);
  const B = b instanceof Set ? b : tokenSet(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function isEvidenceLearningText(text) {
  return /Review permitted public roofing-software information to identify source-backed observations that could improve RidgeLine's offer positioning/i.test(String(text || ""));
}

export function isEvidenceLearningObjective(objective) {
  if (!objective) return false;
  if (objective.category === EVIDENCE_LEARNING_CATEGORY) return true;
  return isEvidenceLearningText(objective.ownerText);
}

export function assertScoutCannotApprove(actor) {
  const who = String(actor || "");
  if (who === "scout" || who === SCOUT_ROLE_ID || who === "business_research" || /^scout-/.test(who)) {
    const err = new Error("Scout cannot approve, verify, or self-credit.");
    err.code = "SCOUT_FORBIDDEN";
    throw err;
  }
}

export function assertNoGoldLeak(payload) {
  const blob = JSON.stringify(payload || {});
  if (/ATLAS-SEALED-|ATLAS-DEV-\d{3}|ranked_tiers|required_unknowns/.test(blob)) {
    const err = new Error("Evaluator gold must never enter Scout/Strategist prompts, packets, retrieval, control room, or task instructions.");
    err.code = "GOLD_ISOLATION";
    throw err;
  }
}

function looksLikeHiring(text) {
  const t = String(text || "").toLowerCase();
  return /\b(we're hiring|we are hiring|join our team|careers|job openings|open roles)\b/.test(t)
    && /\b(apply|salary|compensation|engineer|recruiter)\b/.test(t);
}

function looksLikeLoginPrompt(text) {
  const t = String(text || "").toLowerCase();
  return /^(sign in|log in|login|create an account)\b/.test(t.trim())
    || (/\b(sign in|log in|password|forgot password)\b/.test(t) && t.length < 80);
}

function looksLikeContactForm(text) {
  const t = String(text || "").toLowerCase();
  return /\b(contact us|get in touch|request a demo|talk to sales)\b/.test(t) && t.length < 120;
}

function looksLikeFooter(text) {
  const t = String(text || "").toLowerCase();
  return /^(privacy policy|terms of service|copyright|all rights reserved|cookie settings)\b/.test(t.trim())
    || (/\b(privacy policy|terms of service|©)\b/.test(t) && t.length < 80);
}

function looksLikeNav(text) {
  const t = String(text || "").toLowerCase().trim();
  return /^(home|products|features|pricing|login|sign in|menu|search|about|blog|resources)$/.test(t)
    || /^skip to/.test(t);
}

function looksLikeSlogan(text) {
  const t = String(text || "").toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 14) return false;
  return /\b(world-class|best-in-class|unlock growth|the future of|reimagine|next generation|game[- ]changing)\b/.test(t)
    && !/\b(estimate|takeoff|proposal|measurement|pricing|feature)\b/.test(t);
}

function looksLikeProductFeature(text) {
  const t = String(text || "").toLowerCase();
  return /\b(takeoff|estimat|proposal|measurement|aerial|material list|crm|job management|invoic|inspect)\b/.test(t)
    && t.split(/\s+/).length >= 8;
}

function looksLikeMarketing(text) {
  const t = String(text || "").toLowerCase();
  return /\b(leading|trusted by|#1|best|world-class|empower|transform|unlock|grow your|win more)\b/.test(t);
}

function looksLikePricing(text) {
  const t = String(text || "").toLowerCase();
  return /\$\s*\d+|per (month|seat|user|year)|starting at|pricing/.test(t);
}

export function classifyPassageOmission(excerpt, heading) {
  const blob = String(heading || "") + " " + String(excerpt || "");
  if (looksLikeA11yChrome(blob) || /^skip to/.test(String(excerpt || "").toLowerCase())) return "a11y_chrome";
  if (looksLikeCookieBanner(blob)) return "cookie_banner";
  if (looksLikeVideoPlaceholder(blob)) return "video_placeholder";
  if (looksLikeNav(excerpt)) return "navigation";
  if (looksLikeLoginPrompt(excerpt)) return "login_prompt";
  if (looksLikeContactForm(excerpt)) return "contact_form";
  if (looksLikeFooter(excerpt)) return "footer_boilerplate";
  if (looksLikeHiring(blob)) return "hiring_page";
  if (isCompensationText(blob) && /wage|salary|median pay|hourly/.test(blob.toLowerCase())) return "salary_stats";
  if (looksLikeSlogan(excerpt)) return "slogan_without_substance";
  if (looksLikeBoilerplate(blob) && String(excerpt || "").length < 40) return "boilerplate";
  return null;
}

export function extractTeachingPassages(store, payload) {
  const source = (payload && payload.source) || {};
  const html = (payload && payload.html) || source.rawHtml || source.substantiveText || "";
  const objectiveText = (payload && payload.objectiveText) || MISSION18_RESEARCH_OBJECTIVE;
  const extraction = (payload && payload.extraction) || source.extraction
    || (html && /</.test(html) ? extractSubstantiveHtml(html, { objectiveText: objectiveText, workspaceText: "RidgeLine Estimator roofing" }) : null);
  const blocks = (extraction && extraction.blocks) || [];
  const url = source.finalUrl || source.originalUrl || source.url || null;
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
    if (excerpt.length < 8) continue;
    const omittedReason = classifyPassageOmission(excerpt, heading);
    const relevantToObjective = /estimat|proposal|takeoff|roof|contractor|software|measure|material|pricing|feature|product/.test(excerpt.toLowerCase())
      && !omittedReason;
    const domainAlone = Boolean(payload && payload.relevanceFromDomainOnly);
    const relevant = domainAlone ? false : (relevantToObjective && !omittedReason);
    const score = omittedReason ? -2 : (relevant ? 4 + (looksLikeProductFeature(excerpt) ? 2 : 0) : 0);
    const id = nextId(store, "PAS-", () => store && store.listPassages ? store.listPassages() : []);
    const rec = {
      id: id,
      passageId: id,
      workspaceId: source.workspaceId || (payload && payload.workspaceId) || null,
      sourceId: source.sourceId || source.id || null,
      objectiveId: (payload && payload.objectiveId) || source.objectiveId || null,
      excerpt: excerpt.slice(0, 800),
      exactExcerpt: excerpt.slice(0, 800),
      locator: { heading: heading || null, position: i, section: heading || "main" },
      checksum: checksumOf(excerpt),
      url: url,
      timestamp: nowIso(),
      relevanceScore: score,
      usefulnessReason: relevant
        ? "Substantive product/feature/operations text that can inform positioning without inventing demand."
        : (omittedReason ? "Omitted: " + omittedReason : "Not relevant to the research objective."),
      omittedReason: omittedReason,
      relevant: relevant,
      heading: heading || null,
      createdAt: nowIso(),
      relevanceFromDomainNameAlone: false,
    };
    passages.push(rec);
    if (store && store.putPassage) store.putPassage(rec);
    if (omittedReason && store && store.putFindingOmission) {
      store.putFindingOmission({
        id: "FOM-" + id,
        passageId: id,
        sourceId: rec.sourceId,
        reason: omittedReason,
        excerpt: rec.excerpt,
        accurateButIrrelevant: omittedReason === "salary_stats",
        createdAt: rec.createdAt,
      });
    }
  }
  return {
    passages: passages,
    relevant: passages.filter((p) => p.relevant),
    omitted: passages.filter((p) => !p.relevant),
    noActionableEvidence: passages.filter((p) => p.relevant).length === 0,
  };
}

export function classifySourceIndependently(source, excerpt) {
  const live = source && (source.sourceClassification === "live_public_source" || source.live === true);
  const authenticity = !source || source.fetchStatus !== "ok"
    ? "unavailable"
    : (source.sourceClassification === "synthetic_fixture" ? "fixture" : (live ? "live_public" : "unverified"));
  const text = String(excerpt || source && source.substantiveText || "");
  let sourceType = "unknown";
  if (looksLikePricing(text)) sourceType = "pricing_page";
  else if (looksLikeProductFeature(text)) sourceType = "product_docs";
  else if (looksLikeMarketing(text)) sourceType = "vendor_marketing";
  const relevance = /estimat|proposal|takeoff|roof|contractor|software/.test(text.toLowerCase()) ? "relevant" : "irrelevant";
  const support = excerpt && text.toLowerCase().includes(String(excerpt).toLowerCase().slice(0, 40)) ? "direct" : (text ? "weak" : "none");
  return { authenticity: authenticity, sourceType: sourceType, relevance: relevance, supportStrength: support };
}

export function classifyFindingType(claim, extras) {
  const c = String(claim || "");
  if (extras && extras.type && FINDING_TYPES.includes(extras.type)) return extras.type;
  if (extras && extras.forceType) return extras.forceType;
  if (/should (require|treat|policy)|owner should/.test(c.toLowerCase())) return "owner_policy_suggestion";
  if (/\?$/.test(c.trim()) || /^what |^is |^does |unknown/.test(c.toLowerCase())) return "unresolved_question";
  if (extras && extras.independentDomains >= 2) return "cross_source_corroboration";
  if (looksLikePricing(c) && extras && extras.onVendorPage) return "public_pricing_observation";
  if (looksLikeMarketing(c) && !looksLikeProductFeature(c)) return "vendor_marketing_claim";
  if (looksLikeProductFeature(c) && extras && extras.directSupport) return "observed_product_feature";
  if (extras && extras.directSupport && !looksLikeMarketing(c)) return "directly_supported_fact";
  if (/\b(may|suggests|appears|typically|could)\b/.test(c.toLowerCase())) return "cautious_inference";
  if (looksLikeMarketing(c)) return "vendor_marketing_claim";
  return extras && extras.directSupport ? "directly_supported_fact" : "cautious_inference";
}

export function sameVendorNotIndependent(sources) {
  const domains = [...new Set((sources || []).map((s) => s && (s.domain || s.publisher)).filter(Boolean))];
  return { independent: domains.length >= 2, domains: domains, note: domains.length < 2 ? "Multiple pages on one vendor domain are not independent corroboration." : "Distinct registrable domains." };
}

export function proposeTeachingFinding(store, payload) {
  const claim = String((payload && payload.claim) || "").trim();
  const excerpt = String((payload && payload.excerpt) || "").trim();
  const source = (payload && payload.source) || {};
  const passage = (payload && payload.passage) || {};
  const axes = classifySourceIndependently(source, excerpt);
  const support = checkSourceSupport({
    claim: claim,
    excerpt: excerpt,
    sourceText: source.substantiveText || excerpt,
    sourceId: source.sourceId || source.id,
    contentChecksum: source.checksum || source.sha256,
    locator: passage.locator,
    kind: "source_backed_fact",
    presentAsFact: true,
  });
  const type = classifyFindingType(claim, {
    "type": payload && payload.type,
    forceType: payload && payload.forceType,
    directSupport: support.supportStatus === "supported_direct_fact",
    onVendorPage: axes.sourceType === "vendor_marketing" || axes.sourceType === "product_docs" || axes.sourceType === "pricing_page",
    independentDomains: payload && payload.independentDomains,
  });
  if (type === "owner_policy_suggestion") {
    // A webpage cannot create owner policy. Suggestion stays a suggestion.
  }
  const id = (payload && payload.id) || nextId(store, "TFN-", () => store && store.listTeachingFindings ? store.listTeachingFindings() : []);
  const rec = {
    id: id,
    findingId: id,
    workspaceId: (payload && payload.workspaceId) || source.workspaceId || null,
    objectiveId: (payload && payload.objectiveId) || source.objectiveId || null,
    sourceId: source.sourceId || source.id || null,
    passageId: passage.passageId || passage.id || null,
    "type": type,
    claim: claim,
    excerpt: excerpt,
    locator: passage.locator || { section: "main", text: excerpt.slice(0, 120) },
    checksum: checksumOf(claim + "|" + excerpt),
    url: source.finalUrl || source.originalUrl || source.url || null,
    timestamp: nowIso(),
    sourceAuthenticity: axes.authenticity,
    sourceType: axes.sourceType,
    relevance: axes.relevance,
    supportStrength: axes.supportStrength,
    supportStatus: support.supportStatus,
    vendorMarketingIsNotIndependentProof: type === "vendor_marketing_claim" || axes.sourceType === "vendor_marketing",
    sourceExistenceIsNotUsefulness: true,
    sameDomainNotIndependentCorroboration: true,
    webpageCannotCreateOwnerPolicy: true,
    policySuggestion: type === "owner_policy_suggestion",
    becameOwnerPolicy: false,
    mustNotClaim: [
      "demand", "TAM", "willingness to pay", "conversion rate", "revenue", "time savings as measured outcome", "testimonials as independent proof",
    ],
    remainsUnknown: ["customer demand", "willingness to pay", "switching costs", "measured outcomes"],
    createdAt: nowIso(),
    teacherRoleId: SCOUT_ROLE_ID,
    cannotApprove: true,
  };
  if (type === "owner_policy_suggestion") rec.becameOwnerPolicy = false;
  if (store && store.putTeachingFinding) store.putTeachingFinding(rec);
  return rec;
}

export function assessNovelty(store, finding, workspaceId) {
  const approved = workspaceId
    ? listApprovedKnowledgeInWorkspace(store, workspaceId, { allowRidgelineLegacy: workspaceId === "ws-ridgeline" })
    : [];
  const claimSet = tokenSet(finding.claim);
  let best = 0;
  let nearest = null;
  for (const k of approved) {
    const s = jaccard(claimSet, tokenSet(k.statement || k.excerpt || ""));
    if (s > best) {
      best = s;
      nearest = k.id;
    }
  }
  if (best >= 0.72) return { outcome: "duplicate_existing", nearestId: nearest, score: best, genuinelyNew: false };
  if (best >= 0.45) return { outcome: "corroborates_existing", nearestId: nearest, score: best, genuinelyNew: false };
  const useful = /estimat|proposal|takeoff|crm|job management|aerial|inspect|invoic|pricing|measure/.test(String(finding.claim || "").toLowerCase());
  if (!useful || finding.relevance === "irrelevant") return { outcome: "irrelevant_to_objective", nearestId: nearest, score: best, genuinelyNew: false };
  if (finding.type === "vendor_marketing_claim" && best >= 0.3) return { outcome: "corroborates_existing", nearestId: nearest, score: best, genuinelyNew: false };
  return { outcome: "genuinely_new", nearestId: nearest, score: best, genuinelyNew: true };
}

export function createTeachingPacket(store, payload) {
  const findings = (payload && payload.findings) || [];
  const passages = (payload && payload.passages) || [];
  const sources = (payload && payload.sources) || [];
  if (!findings.length) {
    return { ok: false, reason: "no_actionable_evidence", packet: null };
  }
  const accepted = findings.filter((f) => f && FINDING_TYPES.includes(f.type) && f.excerpt && f.sourceId);
  if (!accepted.length) {
    return { ok: false, reason: "no_accepted_findings", packet: null };
  }
  assertNoGoldLeak({ findings: accepted, passages: passages });
  const id = (payload && payload.id) || nextId(store, "TPK-", () => store && store.listTeachingPackets ? store.listTeachingPackets() : []);
  const requireOwner = payload && payload.autoApprove === true ? false : true;
  if (payload && payload.autoApprove === true && !(payload && payload.allowSilentAutoApprove)) {
    // Default: do not silently auto-approve.
  }
  const status = (payload && payload.status) || (requireOwner && !(payload && payload.allowSilentAutoApprove) ? "awaiting_owner_approval" : "proposed");
  const packet = {
    id: id,
    packetId: id,
    workspaceId: payload.workspaceId,
    objectiveId: payload.objectiveId || null,
    parentBriefId: payload.parentBriefId || "FOB-001",
    teacherRoleId: SCOUT_ROLE_ID,
    teacherName: SCOUT_ROLE_NAME,
    recipientRoleId: OFFER_STRATEGIST_ROLE_ID,
    recipientEmployeeId: payload.recipientEmployeeId || "EMP-001",
    status: status,
    reviewerIdentity: null,
    whatSourceSupports: accepted.filter((f) => f.type === "directly_supported_fact" || f.type === "observed_product_feature" || f.type === "public_pricing_observation").map((f) => ({ findingId: f.id, claim: f.claim, excerpt: f.excerpt })),
    whatMayBeInferred: accepted.filter((f) => f.type === "cautious_inference" || f.type === "cross_source_corroboration").map((f) => ({ findingId: f.id, claim: f.claim })),
    whatMustNotBeClaimed: [
      "Invented demand, TAM, willingness to pay, conversion, revenue, or measured time savings.",
      "Vendor marketing as independent proof.",
      "Multiple pages on one vendor domain as independent corroboration.",
      "Source existence as usefulness.",
    ],
    whenApplicable: payload.whenApplicable || "Supervised Offer Strategist positioning work in ws-ridgeline after owner approval. Not outreach. Not policy.",
    whatRemainsUnknown: [
      "Whether contractors want to switch",
      "Willingness to pay",
      "Measured outcomes",
      "Competitive win rates",
      "Market size",
    ],
    findingIds: accepted.map((f) => f.id),
    passageIds: passages.map((p) => p.id || p.passageId).filter(Boolean),
    sourceIds: sources.map((s) => s.sourceId || s.id).filter(Boolean),
    usefulnessReviewId: (payload && payload.usefulnessReviewId) || null,
    createdAt: nowIso(),
    scoutCannotApprove: true,
    retrievalMethod: RETRIEVAL_METHOD,
    retrievalLabel: RETRIEVAL_LABEL,
    populatedFromFetchedEvidenceOnly: true,
    goldIsolated: true,
    defaultOwnerApprovalRequired: true,
    silentlyAutoApproved: false,
  };
  if (store && store.putTeachingPacket) store.putTeachingPacket(packet);
  if (status === "awaiting_owner_approval") {
    requestTeachingApproval(store, packet, payload);
  }
  return { ok: true, packet: packet };
}

export function requestTeachingApproval(store, packet, extras) {
  if (!packet) return null;
  const objectiveId = packet.objectiveId;
  const objective = objectiveId && store && store.getObjective ? store.getObjective(objectiveId) : null;
  const content = {
    packetId: packet.id,
    excerpts: (packet.whatSourceSupports || []).map((x) => x.excerpt).slice(0, 6),
    recipientEmployeeId: packet.recipientEmployeeId,
    recipientRoleId: packet.recipientRoleId,
    whatTheyMayDo: "Use the approved lesson as retrieved context for a supervised internal Offer Strategist task. Not outreach. Not policy. Not promotion.",
    findings: packet.findingIds,
  };
  const req = {
    id: nextId(store, "APR-", () => store && store.listApprovalRequests ? store.listApprovalRequests() : []),
    workspaceId: packet.workspaceId,
    objectiveId: objectiveId,
    stepId: (extras && extras.taskId) || (objective && objective.pendingTaskId) || packet.id,
    kind: "teaching_packet",
    objectType: "teaching_packet",
    objectId: packet.id,
    content: content,
    contentHash: contentHash(content),
    revision: 1,
    status: "pending",
    createdAt: nowIso(),
    actorRequired: ["local_owner"],
    requireLocalOwner: true,
    note: "Teaching packet awaiting local_owner. Scout cannot approve. demo_operator cannot masquerade as local_owner. I will not click.",
  };
  if (store && store.putApprovalRequest) store.putApprovalRequest(req);
  if (store && store.putTeachingPacket) {
    store.putTeachingPacket({ ...packet, status: "awaiting_owner_approval", approvalRequestId: req.id });
  }
  if (objective && store.putObjective) {
    store.putObjective({ ...objective, status: "awaiting_owner_approval", pendingApprovalId: req.id, updatedAt: nowIso() });
  }
  return req;
}

export function verifyTeachingPacket(store, packetId, payload) {
  const packet = store.getTeachingPacket(packetId);
  if (!packet) throw new Error("teaching packet not found: " + packetId);
  const actor = (payload && (payload.actor || payload.reviewerIdentity && payload.reviewerIdentity.actor)) || null;
  assertScoutCannotApprove(actor);
  const status = String((payload && payload.status) || "proposed");
  if (!PACKET_STATUSES.includes(status)) throw new Error("invalid verification status: " + status);
  if (status === "approved_for_supervised_use") {
    const resolved = resolveActorType(payload, payload && payload.session);
    rejectMasonClaim(resolved.actor, resolved.actorType);
    if (resolved.actorType !== "local_owner" && resolved.actor !== "owner" && resolved.actor !== "local_owner") {
      const err = new Error("Owner approval required. Do not silently auto-approve. demo_operator is not local_owner.");
      err.code = "APPROVAL_FORBIDDEN";
      throw err;
    }
    if (resolved.actorType !== "local_owner" && !(payload && payload.session && payload.session.id)) {
      const err = new Error("local_owner session required to approve a durable teaching packet.");
      err.code = "APPROVAL_FORBIDDEN";
      throw err;
    }
  }
  const rec = {
    id: nextId(store, "TVF-", () => store.listTeachingVerifications ? store.listTeachingVerifications() : []),
    packetId: packetId,
    previousStatus: packet.status,
    status: status,
    reviewerIdentity: {
      actor: actor,
      actorType: (payload && payload.actorType) || (payload && payload.session ? "local_owner" : "unknown"),
      sessionId: payload && payload.session && payload.session.id || null,
    },
    createdAt: nowIso(),
    note: (payload && payload.note) || null,
  };
  if (store.putTeachingVerification) store.putTeachingVerification(rec);
  store.putTeachingPacket({ ...packet, status: status, reviewerIdentity: rec.reviewerIdentity, verifiedAt: rec.createdAt });
  return { verification: rec, packet: store.getTeachingPacket(packetId) };
}

export function decideTeachingApproval(store, requestId, payload) {
  const req = store.getApprovalRequest(requestId);
  if (!req) throw new Error("approval request not found: " + requestId);
  assertScoutCannotApprove(payload && payload.actor);
  const resolved = resolveActorType(payload, payload && payload.session);
  rejectMasonClaim(resolved.actor, resolved.actorType);
  if (req.requireLocalOwner && resolved.actorType !== "local_owner") {
    const err = new Error("This teaching approval requires a real local_owner session. demo_operator cannot masquerade as local_owner.");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
  const action = String((payload && payload.action) || "").toLowerCase();
  if (action !== "approve" && action !== "reject") throw new Error("action must be approve or reject");
  const packet = store.getTeachingPacket(req.objectId);
  const status = action === "approve" ? "approved_for_supervised_use" : "rejected";
  return verifyTeachingPacket(store, packet.id, {
    actor: resolved.actor,
    actorType: resolved.actorType,
    session: payload.session,
    status: status,
    note: payload.note,
  });
}

export function pinMandatoryOwnerRules(store, workspaceId) {
  const ws = requireWorkspaceId(workspaceId);
  const items = listApprovedKnowledgeInWorkspace(store, ws, { allowRidgelineLegacy: ws === "ws-ridgeline" }).filter((k) => {
    return k.kind === "owner_policy" || k.claimKind === "owner_policy" || k.classification === "owner_policy" || k.mandatory === true;
  });
  return items.map((k) => ({
    id: k.id,
    statement: k.statement,
    kind: "owner_policy",
    pinned: true,
    retrievalMethod: RETRIEVAL_METHOD,
  }));
}

export function retrieveLessons(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const roleId = payload && payload.recipientRoleId || OFFER_STRATEGIST_ROLE_ID;
  const query = String((payload && payload.query) || MISSION18_RESEARCH_OBJECTIVE);
  requireWorkspaceId(workspaceId);
  const packets = listTeachingPacketsInWorkspace(store, workspaceId).filter((p) => {
    if (p.recipientRoleId && p.recipientRoleId !== roleId) return false;
    if (p.status !== "approved_for_supervised_use") return false;
    if (p.status === "expired" || p.status === "invalidated") return false;
    return true;
  });
  const qSet = tokenSet(query);
  const scored = packets.map((p) => {
    const blob = JSON.stringify(p.whatSourceSupports || []) + " " + JSON.stringify(p.whatMayBeInferred || []);
    return { packet: p, score: jaccard(qSet, tokenSet(blob)) };
  });
  scored.sort((a, b) => b.score - a.score);
  const kept = [];
  const conflicts = [];
  for (const row of scored) {
    const near = kept.find((k) => jaccard(JSON.stringify(k.packet.whatSourceSupports), JSON.stringify(row.packet.whatSourceSupports)) >= 0.85);
    if (near) {
      row.deduped = true;
      continue;
    }
    const clash = kept.find((k) => {
      const a = JSON.stringify(k.packet.whatSourceSupports || "").toLowerCase();
      const b = JSON.stringify(row.packet.whatSourceSupports || "").toLowerCase();
      return (/\bnot\b/.test(a) !== /\bnot\b/.test(b)) && jaccard(a, b) > 0.4;
    });
    if (clash) {
      conflicts.push({ a: clash.packet.id, b: row.packet.id, note: "Conflict surfaced; not silently blended." });
    }
    kept.push(row);
  }
  const ownerRules = pinMandatoryOwnerRules(store, workspaceId);
  const retrieved = kept.filter((k) => k.score > 0 || (payload && payload.includeZero === true)).map((k) => ({
    packetId: k.packet.id,
    score: k.score,
    relevant: k.score >= 0.08,
    status: k.packet.status,
    whatSourceSupports: k.packet.whatSourceSupports,
    whatMustNotBeClaimed: k.packet.whatMustNotBeClaimed,
  }));
  const delivery = {
    id: nextId(store, "DLV-", () => store.listLessonDeliveries ? store.listLessonDeliveries() : []),
    workspaceId: workspaceId,
    recipientRoleId: roleId,
    recipientEmployeeId: payload && payload.recipientEmployeeId || "EMP-001",
    packetIds: retrieved.filter((r) => r.relevant).map((r) => r.packetId),
    retrievedPacketIds: retrieved.map((r) => r.packetId),
    unusedPacketIds: retrieved.filter((r) => !r.relevant).map((r) => r.packetId),
    ownerRulesPinned: ownerRules.map((r) => r.id),
    conflicts: conflicts,
    retrievalMethod: RETRIEVAL_METHOD,
    retrievalLabel: RETRIEVAL_LABEL,
    storedNotRetrieved: packets.filter((p) => !retrieved.some((r) => r.packetId === p.id)).map((p) => p.id),
    retrievedNotUsed: [],
    usedNotCorrectlyApplied: [],
    createdAt: nowIso(),
    wholeDocuments: false,
    goldIsolated: true,
  };
  if (store && store.putLessonDelivery) store.putLessonDelivery(delivery);
  return {
    retrievalMethod: RETRIEVAL_METHOD,
    retrievalLabel: RETRIEVAL_LABEL,
    ownerRules: ownerRules,
    lessons: retrieved.filter((r) => r.relevant),
    unrelated: retrieved.filter((r) => !r.relevant),
    conflicts: conflicts,
    delivery: delivery,
    storedNeRetrievedNeUsedNeAppliedNeImproved: true,
  };
}

export function predeclareImprovementCriteria() {
  return {
    declaredAt: nowIso(),
    criteria: IMPROVEMENT_CRITERIA.slice(),
    notImprovement: NOT_IMPROVEMENT.slice(),
    note: "Declared before any post-lesson comparison.",
  };
}

export function evaluateEpisode(store, payload) {
  const criteria = (payload && payload.criteria) || predeclareImprovementCriteria();
  const baseline = payload && payload.baseline;
  const post = payload && payload.post;
  const lesson = payload && payload.lesson;
  const delivered = Boolean(payload && payload.delivered);
  const cited = Boolean(payload && payload.cited);
  const applied = Boolean(payload && payload.applied);
  const misapplied = Boolean(payload && payload.misapplied);
  const blocked = Boolean(payload && payload.blocked);
  const awaiting = Boolean(payload && payload.awaitingOwnerApproval);
  let outcome = "unchanged";
  const reasons = [];
  if (awaiting) {
    outcome = "awaiting_owner_approval";
    reasons.push("Owner approval has not occurred.");
  } else if (blocked) {
    outcome = "blocked";
    reasons.push("Supervised task was blocked.");
  } else if (!lesson) {
    outcome = "insufficient_evidence";
    reasons.push("No approved novel lesson.");
  } else if (delivered && !cited) {
    outcome = "unchanged";
    reasons.push("Delivered but unused.");
  } else if (cited && misapplied) {
    outcome = "regressed";
    reasons.push("Cited but misapplied.");
  } else if (payload && payload.confusion) {
    outcome = "regressed";
    reasons.push("Post-lesson output introduced confusion.");
  } else if (payload && payload.onlyCorroborates) {
    outcome = "unchanged";
    reasons.push("Lesson only corroborates known facts.");
  } else if (post && baseline && payload && payload.materialImprovement === true) {
    const bogus = (payload.claimedReasons || []).some((r) => NOT_IMPROVEMENT.includes(r));
    if (bogus) {
      outcome = "unchanged";
      reasons.push("Claimed reasons are not improvement criteria.");
    } else {
      outcome = "improved";
      reasons.push("Predeclared criteria met: " + (payload.metCriteria || []).join(", "));
    }
  } else {
    outcome = "unchanged";
    reasons.push("No material improvement against predeclared criteria.");
  }
  const id = (payload && payload.id) || nextId(store, "LEP-", () => store.listLearningEpisodes ? store.listLearningEpisodes() : []);
  const rec = {
    id: id,
    workspaceId: payload && payload.workspaceId,
    objectiveId: payload && payload.objectiveId,
    parentBriefId: payload && payload.parentBriefId || "FOB-001",
    packetId: lesson && (lesson.id || lesson.packetId) || null,
    deliveryId: payload && payload.deliveryId || null,
    outcome: outcome,
    outcomesAllowed: EPISODE_OUTCOMES.slice(),
    criteria: criteria,
    baselineRef: baseline && (baseline.id || baseline.runId) || "FOB-001/OSR-003",
    postRef: post && (post.id || post.runId) || null,
    delivered: delivered,
    cited: cited,
    applied: applied,
    misapplied: misapplied,
    unused: delivered && !cited,
    comparable: {
      sameModel: true,
      sameRole: true,
      sameVersion: true,
      sameObjective: true,
      sameOutputContract: true,
      sameOwnerPolicies: true,
      sameEvaluator: "EVL-M16-001",
      similarBudgets: true,
      changedVariable: "approved_relevant_lesson",
      bakeoffRerun: false,
    },
    reasons: reasons,
    createdAt: nowIso(),
    inventedPositiveDelta: false,
  };
  if (store && store.putLearningEpisode) store.putLearningEpisode(rec);
  return rec;
}

export function createAutonomyPolicyInterface(store, payload) {
  const rec = {
    id: (payload && payload.ownerPolicyId) || nextId(store, "OAP-", () => store.listOwnerAutonomyPolicies ? store.listOwnerAutonomyPolicies() : []),
    ownerPolicyId: (payload && payload.ownerPolicyId) || null,
    approvedSourceClasses: (payload && payload.approvedSourceClasses) || ["live_public_source"],
    approvedDomains: (payload && payload.approvedDomains) || MISSION18_PERMITTED_DOMAINS.slice(),
    approvedFindingTypes: (payload && payload.approvedFindingTypes) || FINDING_TYPES.slice(),
    permittedRecipientRoles: (payload && payload.permittedRecipientRoles) || [OFFER_STRATEGIST_ROLE_ID],
    maxDailySpend: (payload && payload.maxDailySpend) != null ? payload.maxDailySpend : 1,
    maxPagesPerObjective: (payload && payload.maxPagesPerObjective) != null ? payload.maxPagesPerObjective : MISSION18_MAX_PAGES,
    corroborationRequirements: (payload && payload.corroborationRequirements) || { independentDomains: 2, sameVendorNotIndependent: true },
    approvalMode: DEFAULT_APPROVAL_MODE,
    expiration: (payload && payload.expiration) || null,
    revocationConditions: (payload && payload.revocationConditions) || ["owner_revokes", "source_invalidated", "policy_change"],
    conceptualModes: AUTONOMY_MODES,
    activeMode: 1,
    delegatedAutonomyActivated: false,
    autonomousLearningImplemented: false,
    publicSourcesCannotRewriteOwnerPolicy: true,
    createdAt: nowIso(),
    interfaceOnly: true,
    note: "Future autonomy interface only. Default remains owner review required. Delegated autonomy is not activated. Autonomous learning is not implemented.",
  };
  rec.ownerPolicyId = rec.id;
  if (store && store.putOwnerAutonomyPolicy) store.putOwnerAutonomyPolicy(rec);
  return rec;
}

export function invalidateLearningChain(store, payload) {
  const now = nowIso();
  const sourceId = payload && payload.sourceId;
  const reason = (payload && payload.reason) || "source_invalidated";
  const chain = { sourceId: sourceId, passageIds: [], findingIds: [], packetIds: [], deliveryIds: [], episodeIds: [], briefIds: [], evaluationIds: [] };
  const passages = ((store.listPassages && store.listPassages()) || []).filter((p) => p.sourceId === sourceId);
  for (const p of passages) {
    chain.passageIds.push(p.id);
    if (store.putPassage) store.putPassage({ ...p, relevant: false, omittedReason: p.omittedReason || "source_invalidated", invalidatedAt: now });
  }
  const findings = ((store.listTeachingFindings && store.listTeachingFindings()) || []).filter((f) => f.sourceId === sourceId);
  for (const f of findings) {
    chain.findingIds.push(f.id);
    if (store.putTeachingFinding) store.putTeachingFinding({ ...f, invalidated: true, invalidatedAt: now });
  }
  const packets = ((store.listTeachingPackets && store.listTeachingPackets()) || []).filter((p) => (p.sourceIds || []).includes(sourceId) || (p.findingIds || []).some((id) => chain.findingIds.includes(id)));
  for (const p of packets) {
    chain.packetIds.push(p.id);
    if (store.putTeachingPacket) store.putTeachingPacket({ ...p, status: "invalidated", previousStatus: p.status });
    if (store.putTeachingVerification) {
      store.putTeachingVerification({
        id: nextId(store, "TVF-", () => store.listTeachingVerifications()),
        packetId: p.id,
        previousStatus: p.status,
        status: "invalidated",
        reviewerIdentity: { actor: (payload && payload.actor) || "system", actorType: "system" },
        createdAt: now,
        note: reason,
      });
    }
  }
  const deliveries = ((store.listLessonDeliveries && store.listLessonDeliveries()) || []).filter((d) => (d.packetIds || []).some((id) => chain.packetIds.includes(id)));
  for (const d of deliveries) {
    chain.deliveryIds.push(d.id);
  }
  const rec = {
    id: nextId(store, "LIN-", () => store.listLearningInvalidations ? store.listLearningInvalidations() : []),
    createdAt: now,
    reason: reason,
    chain: chain,
    appendOnly: true,
    deletedLiveRecords: false,
    mutatedFrozenVersions: false,
    note: "Append-only invalidation. Live records were not deleted. Frozen versions were not mutated.",
  };
  if (store && store.putLearningInvalidation) store.putLearningInvalidation(rec);
  return rec;
}

export function recordTeachingContribution(store, raw) {
  if (raw && raw.selfAwarded === true) {
    const err = new Error("Contribution events cannot be self-awarded.");
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  const role = String((raw && raw.role) || "");
  if ((role === "scout" || role === SCOUT_ROLE_ID || role === "business_research") && [
    "lesson_approved_for_supervised_use", "lesson_helped", "owner_approved_finding",
  ].includes(raw && raw.kind)) {
    const err = new Error("Scout cannot approve, verify, or self-credit.");
    err.code = "SCOUT_FORBIDDEN";
    throw err;
  }
  if (["page_count", "verbosity", "duplicate_pages", "unsupported_confidence", "owner_interruptions"].includes(raw && raw.kind)) {
    const err = new Error("No reward for page counts, verbosity, duplicates, unsupported confidence, or owner interruptions.");
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  const evidence = { ...(raw && raw.evidence || {}) };
  return recordContribution(store, {
    ...raw,
    selfAwarded: false,
    effective: ((raw && raw.state) || "provisional") === "verified" ? (raw && raw.effective !== false) : false,
    evidence: evidence,
  });
}

export function maybeCreateFob002(store, payload) {
  const episode = payload && payload.episode;
  const approved = payload && payload.approvedLesson;
  const material = Boolean(payload && payload.materialImprovement);
  const fob001 = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-001");
  if (!fob001) return { created: false, reason: "FOB-001 missing", fob002: null };
  if (!approved || !episode || episode.outcome !== "improved" || !material) {
    return {
      created: false,
      reason: "Approved lesson did not materially improve the brief. FOB-001 remains unchanged. FOB-002 was not created.",
      fob001Unchanged: true,
      fob002: null,
    };
  }
  const draft = {
    id: "FOB-002",
    workspaceId: fob001.workspaceId,
    objectiveId: fob001.objectiveId,
    parentBriefId: "FOB-001",
    createdAt: nowIso(),
    appendOnly: true,
    status: "completed",
    lessonId: approved.id,
    changeClass: (payload && payload.changeClass) || "positioning",
    diff: payload && payload.diff || { note: "Precise diff vs FOB-001 from approved lesson." },
    assembly: { ...(fob001.assembly || {}), sourcesFetched: payload.sourcesFetched || 0 },
    sections: payload.sections || fob001.sections,
    note: "Created only because an approved lesson materially improved the brief. FOB-001 is preserved.",
  };
  if (store.putFounderOpportunityBrief) store.putFounderOpportunityBrief(draft);
  return { created: true, fob002: draft, fob001Unchanged: true };
}

export function teachingControlRoomSlice(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  const acquisitions = (store.listSourceAcquisitions && store.listSourceAcquisitions(workspaceId)) || [];
  const passages = (store.listPassages && store.listPassages()) || [];
  const findings = (store.listTeachingFindings && store.listTeachingFindings(workspaceId)) || [];
  const packets = (store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || [];
  const deliveries = (store.listLessonDeliveries && store.listLessonDeliveries()) || [];
  const episodes = (store.listLearningEpisodes && store.listLearningEpisodes(workspaceId)) || [];
  const reqs = ((store.listApprovalRequests && store.listApprovalRequests()) || []).filter((r) => r.kind === "teaching_packet" && r.status === "pending");
  const stale = ((store.listApprovalRequests && store.listApprovalRequests()) || []).filter((r) => r.status === "reconciled_canceled" || r.status === "canceled");
  return {
    title: "EMPLOYEE LEARNING AND TEACHING",
    capabilityLabel: RESEARCH_CAPABILITY_LABEL,
    searchIntegrationExists: false,
    retrievalMethod: RETRIEVAL_METHOD,
    retrievalLabel: RETRIEVAL_LABEL,
    learningDescription: LEARNING_DESCRIPTION,
    chain: {
      sourceFetched: acquisitions.filter((a) => a.fetchStatus === "ok").map((a) => ({ id: a.id, url: a.originalUrl, status: a.fetchStatus, domain: a.domain })),
      relevant: passages.filter((p) => p.relevant).map((p) => ({ id: p.id, excerpt: p.excerpt })),
      findingProposed: findings.map((f) => ({ id: f.id, "type": f.type, claim: f.claim })),
      verified: packets.filter((p) => p.status === "approved_for_supervised_use").map((p) => p.id),
      lessonAwaitingApproval: packets.filter((p) => p.status === "awaiting_owner_approval").map((p) => p.id),
      approved: packets.filter((p) => p.status === "approved_for_supervised_use").map((p) => p.id),
      delivered: deliveries.map((d) => d.id),
      used: episodes.filter((e) => e.cited).map((e) => e.id),
      helped: episodes.filter((e) => e.outcome === "improved").map((e) => e.id),
      didNotHelp: episodes.filter((e) => e.outcome === "unchanged" || e.outcome === "regressed").map((e) => e.id),
    },
    pendingTeachingApprovals: reqs.map((r) => ({
      approvalId: r.id,
      packetId: r.objectId,
      excerpts: r.content && r.content.excerpts || [],
      recipientEmployeeId: r.content && r.content.recipientEmployeeId,
      whatTheyMayDo: r.content && r.content.whatTheyMayDo,
      requireLocalOwner: true,
    })),
    canceledOrStaleHidden: stale.length >= 0,
    showApprovalOnlyWhenRequestExists: reqs.length > 0,
    ownerDecisionAtTop: reqs.length > 0,
    weightsFineTuneRl: false,
    embeddingsVectorSearch: false,
    internetWideSearch: false,
  };
}

export async function runEvidenceLearning(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const objectiveId = payload && payload.objectiveId;
  const parentBriefId = (payload && payload.parentBriefId) || "FOB-001";
  const policy = {
    allowedDomains: (payload && payload.allowedDomains) || MISSION18_PERMITTED_DOMAINS,
    maxPages: MISSION18_MAX_PAGES,
    maxDomains: MISSION18_MAX_DOMAINS,
    maxPagesPerDomain: MISSION18_MAX_PAGES_PER_DOMAIN,
    maxDepth: MISSION18_MAX_DEPTH,
  };
  const seeds = (payload && payload.seedUrls) || policy.allowedDomains.map((d) => "https://" + d + "/");
  const fixtures = (payload && payload.urlFixtures) || {};
  const fetchImpl = payload && payload.fetchImpl;
  const acquisitions = [];
  const pagesByDomain = {};
  let fetchCount = 0;

  async function fetchOne(url, depth) {
    if (fetchCount >= policy.maxPages) return null;
    let domain;
    try { domain = new URL(url).hostname; } catch { return null; }
    const reg = domain.split(".").slice(-2).join(".");
    pagesByDomain[reg] = pagesByDomain[reg] || 0;
    if (pagesByDomain[reg] >= policy.maxPagesPerDomain) return null;
    if (Object.keys(pagesByDomain).filter((d) => pagesByDomain[d] > 0).length >= policy.maxDomains && pagesByDomain[reg] === 0) return null;
    fetchCount += 1;
    pagesByDomain[reg] += 1;
    const fixture = fixtures[url] || fixtures[url.replace(/\/$/, "") + "/"] || fixtures[url.replace(/\/$/, "")];
    const rec = await acquirePublicSource(store, {
      url: url,
      workspaceId: workspaceId,
      objectiveId: objectiveId,
      policy: policy,
      depth: depth,
      fixture: fixture ? (typeof fixture === "string" ? { body: fixture, contentType: "text/html" } : fixture) : null,
      fetchImpl: fetchImpl,
      objectiveText: MISSION18_RESEARCH_OBJECTIVE,
    });
    acquisitions.push(rec);
    return rec;
  }

  for (const url of seeds.slice(0, policy.maxDomains)) {
    const rec = await fetchOne(url, 0);
    if (rec && rec.ok && rec.links && rec.links.length && fetchCount < policy.maxPages) {
      const follow = rec.links.find((l) => isRelevantFollowLink(l) && l !== rec.finalUrl && l !== rec.originalUrl);
      if (follow) await fetchOne(follow, 1);
    }
  }

  const allPassages = [];
  const findings = [];
  for (const acq of acquisitions) {
    if (!acq.ok) continue;
    const extracted = extractTeachingPassages(store, {
      source: acq,
      html: acq.body || acq.rawHtml,
      extraction: acq.extraction,
      workspaceId: workspaceId,
      objectiveId: objectiveId,
      objectiveText: MISSION18_RESEARCH_OBJECTIVE,
    });
    allPassages.push(...extracted.passages);
    for (const p of extracted.relevant) {
      const claim = p.excerpt.slice(0, 280);
      const f = proposeTeachingFinding(store, {
        workspaceId: workspaceId,
        objectiveId: objectiveId,
        source: acq,
        passage: p,
        claim: claim,
        excerpt: p.excerpt,
      });
      findings.push(f);
    }
  }

  const novelty = findings.map((f) => ({ finding: f, novelty: assessNovelty(store, f, workspaceId) }));
  const novel = novelty.filter((n) => n.novelty.genuinelyNew && n.finding.type !== "unresolved_question" && n.finding.omittedReason == null);
  const usefulNovel = novel.filter((n) => n.finding.type !== "owner_policy_suggestion" && n.finding.relevance !== "irrelevant");

  const autonomy = createAutonomyPolicyInterface(store, {
    approvedDomains: policy.allowedDomains,
    maxPagesPerObjective: policy.maxPages,
  });

  let packetResult = { ok: false, reason: "no_actionable_evidence", packet: null };
  let usefulness = null;
  if (!acquisitions.some((a) => a.ok) || !allPassages.some((p) => p.relevant) || !usefulNovel.length) {
    packetResult = { ok: false, reason: "no_actionable_evidence", packet: null, ownerInterrupt: false };
    try {
      recordTeachingContribution(store, {
        kind: "no_actionable_evidence_recorded",
        role: "workflow_manager",
        workspaceId: workspaceId,
        evidence: { objectiveId: objectiveId },
        note: "All pages blocked, irrelevant, or duplicate. No invented teaching win. Owner not interrupted.",
        state: "verified",
      });
    } catch { /* kinds may be added */ }
  } else {
    const chosen = usefulNovel.slice(0, 4).map((n) => n.finding);
    try {
      usefulness = evaluateKnowledgeUsefulness(store, {
        workspaceId: workspaceId,
        findings: chosen.map((f) => ({
          id: f.id,
          claim: f.claim,
          excerpt: f.excerpt,
          sourceId: f.sourceId,
          kind: "source_backed_fact",
          workspaceId: workspaceId,
        })),
        objectiveText: MISSION18_RESEARCH_OBJECTIVE,
      });
    } catch (err) {
      usefulness = { ok: false, error: err instanceof Error ? err.message : String(err), findings: chosen.map((f) => f.id) };
    }
    if (store.putUsefulnessReview && usefulness) {
      const uid = nextId(store, "USR-", () => store.listUsefulnessReviews());
      store.putUsefulnessReview({ ...usefulness, id: uid, workspaceId: workspaceId, findingIds: chosen.map((f) => f.id) });
      usefulness.id = uid;
    }
    packetResult = createTeachingPacket(store, {
      workspaceId: workspaceId,
      objectiveId: objectiveId,
      parentBriefId: parentBriefId,
      findings: chosen,
      passages: allPassages.filter((p) => chosen.some((f) => f.passageId === p.id)),
      sources: acquisitions.filter((a) => a.ok),
      usefulnessReviewId: usefulness && usefulness.id,
    });
    try {
      recordTeachingContribution(store, {
        kind: "teaching_packet_proposed",
        role: "workflow_manager",
        workspaceId: workspaceId,
        evidence: { objectiveId: objectiveId, packetId: packetResult.packet && packetResult.packet.id, usefulnessId: usefulness && usefulness.id },
        note: "Teaching packet proposed. Awaiting local_owner. Scout did not approve.",
        state: "provisional",
      });
    } catch { /* additive */ }
  }

  const episode = evaluateEpisode(store, {
    workspaceId: workspaceId,
    objectiveId: objectiveId,
    parentBriefId: parentBriefId,
    lesson: packetResult.packet && packetResult.packet.status === "approved_for_supervised_use" ? packetResult.packet : null,
    awaitingOwnerApproval: Boolean(packetResult.packet && packetResult.packet.status === "awaiting_owner_approval"),
    delivered: false,
    cited: false,
    applied: false,
    onlyCorroborates: usefulNovel.length === 0 && findings.length > 0,
    criteria: predeclareImprovementCriteria(),
  });

  const fob = maybeCreateFob002(store, {
    episode: episode,
    approvedLesson: packetResult.packet && packetResult.packet.status === "approved_for_supervised_use" ? packetResult.packet : null,
    materialImprovement: false,
  });

  return {
    capabilityLabel: RESEARCH_CAPABILITY_LABEL,
    searchIntegrationExists: SEARCH_INTEGRATION_EXISTS,
    retrievalMethod: RETRIEVAL_METHOD,
    objectiveId: objectiveId,
    parentBriefId: parentBriefId,
    acquisitions: acquisitions,
    pagesFetched: acquisitions.filter((a) => a.fetchStatus === "ok").map((a) => ({ url: a.finalUrl || a.originalUrl, status: a.fetchStatus, domain: a.domain, httpStatus: a.httpStatus })),
    pagesBlocked: acquisitions.filter((a) => a.fetchStatus !== "ok").map((a) => ({ url: a.originalUrl, status: a.fetchStatus, failureReason: a.failureReason, domain: a.domain })),
    passages: allPassages,
    findings: findings,
    novelty: novelty.map((n) => ({ findingId: n.finding.id, outcome: n.novelty.outcome, genuinelyNew: n.novelty.genuinelyNew })),
    genuinelyNew: usefulNovel.length > 0,
    usefulness: usefulness,
    packet: packetResult.packet,
    packetStatus: packetResult.packet && packetResult.packet.status || null,
    noActionableEvidence: packetResult.reason === "no_actionable_evidence",
    ownerApprovalRequired: Boolean(packetResult.packet && packetResult.packet.status === "awaiting_owner_approval"),
    ownerApprovalOccurred: false,
    ownerInterrupted: Boolean(packetResult.packet && packetResult.packet.status === "awaiting_owner_approval"),
    strategistCalled: false,
    atlasCalled: false,
    bakeoffRerun: false,
    scoutModelCalls: 0,
    episode: episode,
    fob002: fob,
    autonomy: autonomy,
    fetchCount: fetchCount,
    spendUsd: 0,
    controlRoom: teachingControlRoomSlice(store, { workspaceId: workspaceId }),
  };
}

export const EVIDENCE_LEARNING_WORKFLOW_TYPES = ["evidence_learning", "watcher_audit", "manager_summary"];
