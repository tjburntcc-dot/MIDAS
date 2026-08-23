/** Convert an owner objective into a structured research brief. Relevance is question-dependent. */

export const BRIEF_VERSION = "midas-research-brief-v0";

export const COMPENSATION_CUES = [
  "wage", "wages", "salary", "salaries", "pay", "compensation",
  "labor cost", "labour cost", "earnings", "hourly rate", "median pay",
  "median wage", "annual pay", "hourly pay",
];

export const BUYING_SIGNAL_CUES = [
  "buying signal", "buying signals", "estimating software", "takeoff",
  "proposal", "proposals", "candidate", "candidacy", "workflow",
  "operations", "operational", "measure", "measurement", "materials",
  "spreadsheet", "by hand", "estimating", "software",
];

export const OPERATIONAL_CUES = [
  "takeoff", "estimate", "estimating", "measurement", "measure roofs",
  "measure a roof", "material list", "materials", "proposal", "proposals",
  "spreadsheet", "by hand", "software", "workflow", "operations",
  "operational", "buying signal", "candidate",
];

export const VIDEO_PLACEHOLDER_CUES = [
  "please enable javascript to play this video",
  "enable javascript to play this video",
  "javascript to play this video",
];

export const COMMUNITY_LOCAL_CUES = [
  "library", "libraries", "bulletin", "bulletin board", "community board",
  "after-school", "after school", "afterschool", "program", "programs",
  "calendar", "flyer", "flyers", "meeting room", "community", "west asheville",
  "music", "story time", "storytime", "branch hours", "library hours",
  "public libraries", "children", "youth", "event", "events",
];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listResearchBriefs ? store.listResearchBriefs() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function cueHits(text, cues) {
  const t = String(text || "").toLowerCase();
  let n = 0;
  for (const c of cues) if (t.includes(c)) n += 1;
  return n;
}

export function detectQuestionFamily(question) {
  const q = String(question || "");
  const compensationHits = cueHits(q, COMPENSATION_CUES);
  const buyingHits = cueHits(q, BUYING_SIGNAL_CUES);
  const communityHits = cueHits(q, COMMUNITY_LOCAL_CUES);
  if (compensationHits > 0 && buyingHits === 0 && communityHits === 0) return "labor_cost";
  if (buyingHits > 0 && compensationHits === 0 && communityHits === 0) return "buying_signal";
  if (communityHits > 0 && communityHits >= buyingHits && communityHits >= compensationHits) return "community_local";
  if (buyingHits > compensationHits) return "buying_signal";
  if (compensationHits > buyingHits) return "labor_cost";
  return "general";
}

export function usefulCategoriesForFamily(family) {
  if (family === "labor_cost") {
    return ["occupational_wages", "compensation", "labor_cost", "hourly_or_annual_pay"];
  }
  if (family === "buying_signal") {
    return ["estimating_operations", "takeoff_and_measurement", "proposal_workflow", "hand_vs_dedicated_tools", "software_candidacy"];
  }
  if (family === "community_local") {
    return ["library_branch_info", "community_bulletin_or_flyer", "after_school_or_youth_programs", "events_calendar", "meeting_room_or_hours"];
  }
  return ["objective_relevant_operations", "requested_decision_evidence"];
}

export function nonRelevantCategoriesForFamily(family) {
  const chrome = ["video_placeholder", "site_chrome", "navigation", "cookie_or_a11y", "unrelated_occupational_info"];
  if (family === "buying_signal") {
    return ["occupational_wages", "compensation_statistics", "median_pay"].concat(chrome);
  }
  if (family === "labor_cost") {
    return ["unrelated_product_marketing"].concat(chrome);
  }
  if (family === "community_local") {
    return ["occupational_wages", "compensation_statistics", "software_buying_signals", "invented_demand_or_tam"].concat(chrome);
  }
  return chrome;
}

export function stripNegatedMentions(text) {
  return String(text || "").replace(
    /\b(does not|do not|did not|n'?t|not)\s+(describe|state|include|mention|contain|provide|list|report)[^.?!\n]*/gi,
    " "
  );
}

export function isCompensationText(text) {
  return cueHits(text, COMPENSATION_CUES) > 0;
}

export function isBuyingSignalOperationalText(text) {
  return cueHits(stripNegatedMentions(text), OPERATIONAL_CUES) > 0;
}

export function isVideoPlaceholderText(text) {
  return cueHits(text, VIDEO_PLACEHOLDER_CUES) > 0;
}

export function isCommunityLocalText(text) {
  return cueHits(stripNegatedMentions(text), COMMUNITY_LOCAL_CUES) > 0;
}

export function claimSupportsBrief(claim, brief) {
  const family = (brief && brief.questionFamily) || "general";
  const text = stripNegatedMentions(String(claim || ""));
  if (family === "buying_signal") {
    if (isCompensationText(String(claim || "")) && !isBuyingSignalOperationalText(text)) return false;
    if (isBuyingSignalOperationalText(text)) return true;
    return false;
  }
  if (family === "labor_cost") {
    return isCompensationText(text);
  }
  if (family === "community_local") {
    return isCommunityLocalText(text);
  }
  return isBuyingSignalOperationalText(text) || isCompensationText(text) || isCommunityLocalText(text);
}

function inferDecision(question, family) {
  if (family === "buying_signal") {
    return "Decide whether a contractor's estimating workflow is a buying signal for dedicated takeoff or estimating software.";
  }
  if (family === "labor_cost") {
    return "Estimate or compare labor cost / occupational compensation relevant to the stated question.";
  }
  if (family === "community_local") {
    return "Identify West Asheville / library / community bulletin and after-school program options that could support local flyer or outreach planning without inventing demand.";
  }
  return "Answer the stated research question with source-backed evidence.";
}

function inferConcepts(question, family) {
  const q = String(question || "").toLowerCase();
  const concepts = [];
  if (family === "buying_signal") {
    concepts.push("estimating workflow", "takeoff", "proposal production", "hand vs dedicated tools");
  }
  if (family === "labor_cost") {
    concepts.push("compensation", "wages", "labor cost");
  }
  if (family === "community_local") {
    concepts.push("library branch", "community bulletin", "after-school programs", "events calendar", "flyer posting");
  }
  if (/\bus\b|united states|u\.s\./i.test(q)) concepts.push("United States geography");
  return concepts;
}

export function buildResearchBrief(store, payload) {
  const workspace = (payload && payload.workspace)
    || ((payload && payload.workspaceId && store && store.getWorkspace) ? store.getWorkspace(payload.workspaceId) : null);
  const question = String((payload && (payload.question || payload.ownerText)) || "").trim();
  const family = detectQuestionFamily(question);
  const offer = (workspace && workspace.offer && workspace.offer.summary)
    || (workspace && workspace.description)
    || (payload && payload.businessOffer)
    || null;
  const customer = (workspace && workspace.idealCustomer)
    || (payload && payload.intendedCustomer)
    || null;
  const brief = {
    id: (payload && payload.id) || nextId(store, "BRF-"),
    version: BRIEF_VERSION,
    workspaceId: (workspace && workspace.id) || (payload && payload.workspaceId) || null,
    businessOffer: offer,
    intendedCustomer: customer,
    researchQuestion: question,
    questionFamily: family,
    relevantDecisionOrTask: inferDecision(question, family),
    importantConcepts: inferConcepts(question, family),
    usefulEvidenceCategories: usefulCategoriesForFamily(family),
    nonRelevantEvidenceCategories: nonRelevantCategoriesForFamily(family),
    intendedConsumingAgent: (payload && payload.intendedConsumingAgent) || "atlas",
    allowedSourceTypes: (payload && payload.allowedSourceTypes) || [
      "owner_provided_paste", "owner_provided_document", "live_public_source", "synthetic_fixture",
    ],
    sourceBudgetUsd: payload && payload.maxSpendUsd != null ? Number(payload.maxSpendUsd) : 0.5,
    maxSourceCount: payload && payload.maxSources != null ? Number(payload.maxSources) : 4,
    expectedOutputType: "source_backed_findings_with_excerpts",
    salaryGloballyForbidden: false,
    salaryRelevant: family === "labor_cost",
    requestId: (payload && payload.requestId) || null,
    objectiveId: (payload && payload.objectiveId) || null,
    createdAt: nowIso(),
    note: "Relevance depends on the current question. Salary is relevant for a labor-cost objective and irrelevant for an estimating-software buying-signal objective.",
  };
  if (store && store.putResearchBrief) store.putResearchBrief(brief);
  return brief;
}

export function getOrBuildBrief(store, request, extras) {
  if (request && request.briefId && store && store.getResearchBrief) {
    const existing = store.getResearchBrief(request.briefId);
    if (existing) return existing;
  }
  if (store && store.listResearchBriefs && request && request.id) {
    const found = (store.listResearchBriefs() || []).find((b) => b.requestId === request.id);
    if (found) return found;
  }
  const ws = request && request.workspaceId && store && store.getWorkspace
    ? store.getWorkspace(request.workspaceId)
    : null;
  return buildResearchBrief(store, {
    workspace: ws,
    workspaceId: request && request.workspaceId,
    question: request && request.question,
    requestId: request && request.id,
    objectiveId: request && request.objectiveId,
    maxSpendUsd: request && request.maxSpendUsd,
    maxSources: request && request.maxSources,
    intendedConsumingAgent: extras && extras.intendedConsumingAgent,
  });
}

export const RESEARCH_BRIEF_FIELDS = [
  "workspaceId",
  "businessOffer",
  "intendedCustomer",
  "researchQuestion",
  "relevantDecisionOrTask",
  "importantConcepts",
  "usefulEvidenceCategories",
  "nonRelevantEvidenceCategories",
  "intendedConsumingAgent",
  "allowedSourceTypes",
  "sourceBudgetUsd",
  "maxSourceCount",
  "expectedOutputType",
];
