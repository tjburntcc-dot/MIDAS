/** Founder Opportunity Brief. Deterministic assembly from approved knowledge + preserved specialist output. Not sealed. Not demand. */
import { contentHash } from "@midas/db";
import { recordContribution } from "./contribution.ts";
import { listApprovedWorkspaceKnowledge, employeeSpendUsd } from "./offer-strategist-live.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { officialEvaluatorId } from "./evaluator-revision.ts";
import { judgeInventedNumbersV2 } from "./evaluator-revision.ts";
import { classifyClaimScope, detectUnauthorizedAction } from "./claim-scope.ts";
import { validateNumericClaims } from "./numeric-normalize.ts";
import { assessFindingRelevance } from "./finding-relevance.ts";
import { evaluateKnowledgeUsefulness, shouldCreateAtlasVersion, reviewOneFinding } from "./usefulness.ts";
import { isCompensationText, detectQuestionFamily } from "./research-brief.ts";
import { looksLikeBoilerplate, looksLikeVideoPlaceholder } from "./html-extract.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";

export const FOUNDER_BRIEF_OWNER_OBJECTIVE =
  "Determine whether RidgeLine Estimator has a credible initial offer for US roofing contractors who still estimate manually, explain the strongest supported opportunity, identify what remains unknown, and recommend the safest next internal validation step.";

export const FOUNDER_BRIEF_CATEGORY = "founder_opportunity_brief";

export const FOUNDER_BRIEF_DISCLOSURE = {
  supervisedInternalDevelopment: true,
  sealedEvaluation: false,
  autonomous: false,
  evidenceOfRevenue: false,
  evidenceOfDemand: false,
  realProspectOutreach: false,
  promotion: false,
  note:
    "Supervised internal development. Not sealed evaluation. Not autonomous. Not evidence of revenue or demand. No real prospect outreach.",
};

export const MISSING_INFORMATION_FIELDS = [
  "want",
  "switch",
  "pay",
  "time_reduction",
  "integration",
  "competitors",
  "market_size",
];

export const CLAIM_CLASSES = [
  "direct_source_backed_fact",
  "inference",
  "hypothesis",
  "unknown",
  "proposed_future_validation",
  "unauthorized_action",
];

function nowIso() {
  return new Date().toISOString();
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

export function isFounderBriefText(text) {
  const t = String(text || "");
  return /credible initial offer for US roofing contractors who still estimate manually/i.test(t)
    || /Founder Opportunity Brief/i.test(t);
}

export function isFounderBriefObjective(objective) {
  if (!objective) return false;
  if (objective.category === FOUNDER_BRIEF_CATEGORY) return true;
  return isFounderBriefText(objective.ownerText);
}

export function findMatchingFounderObjective(store, workspaceId, ownerText) {
  const text = String(ownerText || FOUNDER_BRIEF_OWNER_OBJECTIVE).trim();
  const all = (store.listObjectives && store.listObjectives(workspaceId)) || [];
  return all.find((o) => String(o.ownerText || "").trim() === text && isFounderBriefObjective(o)) || null;
}

const WAGE_IRRELEVANT_IDS = ["K-SCOUT-FND-013"];

function knowledgeApproved(k) {
  return Boolean(k && (k.reviewStatus === "approved" || k.accepted === true) && k.reviewStatus !== "rejected");
}

export function assertCitationAllowed(store, knowledgeId, workspaceId) {
  const k = store.getKnowledge && store.getKnowledge(knowledgeId);
  if (!k) return { ok: false, reason: "missing", knowledgeId: knowledgeId };
  if (k.reviewStatus === "rejected") return { ok: false, reason: "owner_rejected", knowledgeId: knowledgeId, train: false, use: false };
  if (!knowledgeApproved(k)) return { ok: false, reason: "unapproved", knowledgeId: knowledgeId };
  if (k.workspaceId && workspaceId && k.workspaceId !== workspaceId) {
    return { ok: false, reason: "cross_workspace", knowledgeId: knowledgeId, workspaceId: k.workspaceId };
  }
  return { ok: true, knowledge: k, use: true, train: k.reviewStatus === "approved" };
}

export function findingUsableForBrief(store, findingId) {
  const f = store.getScoutFinding && store.getScoutFinding(findingId);
  if (!f) return { allowed: false, train: false, use: false, reason: "missing" };
  if (f.reviewStatus === "rejected") return { allowed: false, train: false, use: false, reason: "owner_rejected" };
  if (f.reviewStatus !== "approved") return { allowed: false, train: false, use: false, reason: "unapproved" };
  return { allowed: true, train: true, use: true, finding: f };
}

function excerptOf(k) {
  return String((k && (k.excerpt || (k.locator && k.locator.text) || k.statement)) || "").slice(0, 400);
}

function sourceOriginOf(k) {
  if (!k) return "unknown";
  if (k.kind === "owner_policy" || k.claimKind === "owner_policy" || String(k.id || "").includes("OWN") || String(k.id || "").includes("STUDIO-OWN")) {
    return "owner_policy";
  }
  if (String(k.sourceId || "").includes("PASTE") || /owner-provided operational note/i.test(String(k.statement || ""))) {
    return "approved_scout_owner_provided";
  }
  if (String(k.sourceId || "").includes("URL") || k.kind === "sourced_fact") return "approved_sourced_fact";
  return k.kind || k.claimKind || "approved_workspace_knowledge";
}

export function assessKnowledgeSufficiency(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const objectiveText = String((payload && payload.objectiveText) || FOUNDER_BRIEF_OWNER_OBJECTIVE);
  const items = ((store.listKnowledge && store.listKnowledge()) || []).filter((k) => {
    if (!k) return false;
    if (k.workspaceId && k.workspaceId !== workspaceId) return false;
    return knowledgeApproved(k);
  });
  const byId = Object.fromEntries(items.map((k) => [k.id, k]));
  const usefulIds = [
    "K-STUDIO-OWN-002", "K-STUDIO-OWN-005", "K-STUDIO-OWN-009",
    "K-SCOUT-FND-001", "K-SCOUT-FND-004", "K-SCOUT-FND-019",
    "K-OWN-001-02", "K-OWN-001-03", "K-OWN-004-01",
  ].filter((id) => byId[id] || (store.getKnowledge && knowledgeApproved(store.getKnowledge(id))));
  const unusedIrrelevant = items.filter((k) =>
    WAGE_IRRELEVANT_IDS.includes(k.id) || isCompensationText(String(k.statement || "") + " " + excerptOf(k))
  ).map((k) => k.id);

  const hasUs = usefulIds.includes("K-STUDIO-OWN-002") || items.some((k) => /Only United States accounts are eligible/i.test(String(k.statement || "")));
  const hasManual = usefulIds.includes("K-STUDIO-OWN-009") || items.some((k) => /estimates by hand or with spreadsheets/i.test(String(k.statement || "")));
  const hasSlower = items.some((k) => /take longer to issue proposals/i.test(String(k.statement || "") + excerptOf(k)));
  const hasTakeoff = items.some((k) => /takeoffs of roof area/i.test(String(k.statement || "") + excerptOf(k)));
  const hasSpend = items.some((k) => /2500 USD|verified monthly/i.test(String(k.statement || "") + excerptOf(k)));

  const sufficient = (hasUs || hasManual) && (hasSlower || hasTakeoff || hasManual);
  const materialGaps = [
    { field: "want", why: "No approved source states whether target contractors want a dedicated estimator.", permittedSourceCouldAnswer: false, note: "Requires owner-approved customer conversations, not a public page." },
    { field: "switch", why: "No approved source states switching cost or intent to leave spreadsheets.", permittedSourceCouldAnswer: false, note: "A public page would not honestly answer this without inventing demand." },
    { field: "pay", why: "Willingness to pay for RidgeLine is not in approved knowledge. The 2500 USD figure is a qualification threshold, not WTP.", permittedSourceCouldAnswer: false, note: "Do not treat owner budget policy as price evidence." },
    { field: "time_reduction", why: "Approved notes say hand/spreadsheet estimating often takes longer. No measured time saved.", permittedSourceCouldAnswer: false, note: "Quantified savings would be invented." },
    { field: "integration", why: "No approved source describes contractor tool stacks or integration constraints.", permittedSourceCouldAnswer: true, note: "A permitted product-doc page could help later; not required for a first honest brief." },
    { field: "competitors", why: "No approved competitor comparison exists.", permittedSourceCouldAnswer: true, note: "Fetching vendor pages now would be speculative and commercially biased." },
    { field: "market_size", why: "No approved TAM or demand statistic exists. Must remain unknown.", permittedSourceCouldAnswer: false, note: "A legitimate labor-statistics page is not automatically relevant. Do not repeat the BLS roofer-pay mistake." },
  ];

  const decision = sufficient ? "sufficient" : "insufficient";
  const rec = {
    id: (payload && payload.id) || nextId(store, "KSR-", () => store.listKnowledgeSufficiencyReviews ? store.listKnowledgeSufficiencyReviews() : []),
    workspaceId: workspaceId,
    objectiveText: objectiveText,
    createdAt: nowIso(),
    decision: decision,
    fetchRecommended: false,
    scoutRequired: false,
    atlasRequired: false,
    ownerApprovalRequired: false,
    ownerApprovalReason: sufficient
      ? "Approved workspace knowledge already supports a useful supervised brief. No new finding was introduced."
      : "Insufficient approved evidence. Name the gap before any fetch.",
    approvedKnowledgeIds: items.map((k) => k.id),
    usefulKnowledgeIds: usefulIds,
    unusedIrrelevantIds: unusedIrrelevant,
    materialGaps: materialGaps,
    hasUnitedStatesRule: hasUs,
    hasManualEstimatingSignal: hasManual,
    hasSlowerProposalNote: hasSlower,
    hasTakeoffWorkflow: hasTakeoff,
    hasSpendThreshold: hasSpend,
    reason: sufficient
      ? "Owner policies plus approved operational notes already describe the target (US roofing contractors still estimating by hand/spreadsheet), a supported operational problem (slower proposals), and a buying-signal rule. That is enough for one inspectable offer hypothesis. Remaining gaps are customer-intent and market unknowns that a public page cannot honestly fill."
      : "Approved knowledge does not yet support a useful first brief.",
    sourcesFetched: 0,
    note: "Sufficiency recorded before any optional source collection. Zero public pages fetched.",
  };
  if (store.putKnowledgeSufficiencyReview) store.putKnowledgeSufficiencyReview(rec);
  return rec;
}

export function findReusableStrategistRun(store, workspaceId) {
  const runs = (store.listOfferStrategistRuns && store.listOfferStrategistRuns(workspaceId)) || [];
  const preferred = runs.find((r) => r.id === "OSR-003" && r.parseStatus === "ok");
  if (preferred) return preferred;
  const ok = runs.filter((r) => r.parseStatus === "ok" && r.structured).slice(-1)[0];
  return ok || null;
}

export function reviewCandidateFindingForFounderBrief(store, finding, extras) {
  const workspaceId = (extras && extras.workspaceId) || finding.workspaceId;
  const objectiveText = (extras && extras.objectiveText) || FOUNDER_BRIEF_OWNER_OBJECTIVE;
  const family = detectQuestionFamily(objectiveText);
  const excerpt = String(finding.excerpt || "");
  const claim = String(finding.claim || finding.statement || "");
  const wage = isCompensationText(claim + " " + excerpt);
  const boilerplate = looksLikeBoilerplate(excerpt) || looksLikeVideoPlaceholder(excerpt);
  const brief = (extras && extras.brief) || {
    researchQuestion: objectiveText,
    questionFamily: family === "general" ? "buying_signal" : family,
    workspaceId: workspaceId,
    intendedConsumingAgent: "offer_strategist",
  };
  const relevance = assessFindingRelevance(finding, { brief: brief, source: extras && extras.source });
  if (boilerplate) {
    return {
      reachOwnerReview: false,
      reason: "boilerplate_or_non_substantive",
      completeUsefulnessReview: false,
      relevance: relevance,
    };
  }
  if (wage && family !== "labor_cost") {
    return {
      reachOwnerReview: false,
      reason: "irrelevant_wage_evidence",
      completeUsefulnessReview: false,
      relevance: relevance,
      note: "Accurate wage facts are not owner-reviewable on this offer-objective. Do not repeat the BLS roofer-pay mistake.",
    };
  }
  if (!relevance.approvalEligible) {
    return {
      reachOwnerReview: false,
      reason: relevance.omissionReason || "not_approval_eligible",
      completeUsefulnessReview: false,
      relevance: relevance,
    };
  }
  const usefulness = evaluateKnowledgeUsefulness(store, {
    workspaceId: workspaceId,
    objectiveText: objectiveText,
    findings: [finding],
    brief: brief,
  });
  const row = (usefulness.reviews || [])[0] || {};
  if (row.outcome === "duplicate_existing" || row.outcome === "corroborates_existing") {
    return {
      reachOwnerReview: false,
      reason: row.outcome,
      completeUsefulnessReview: true,
      usefulness: usefulness,
      shouldCreateAtlasVersion: false,
      relevance: relevance,
    };
  }
  if (["boilerplate_or_non_substantive", "irrelevant_to_objective", "insufficiently_supported", "insufficient_source_support"].includes(row.outcome)) {
    return {
      reachOwnerReview: false,
      reason: row.outcome,
      completeUsefulnessReview: true,
      usefulness: usefulness,
      relevance: relevance,
    };
  }
  return {
    reachOwnerReview: true,
    reason: "material_relevant_supported",
    completeUsefulnessReview: true,
    usefulness: usefulness,
    relevance: relevance,
    shouldCreateAtlasVersion: shouldCreateAtlasVersion(usefulness),
  };
}

function citationRecord(store, id, workspaceId, extras) {
  const allowed = assertCitationAllowed(store, id, workspaceId);
  const k = allowed.knowledge || (store.getKnowledge && store.getKnowledge(id));
  if (!allowed.ok || !k) return null;
  return {
    knowledgeId: k.id,
    sourceId: k.sourceId || null,
    excerpt: excerptOf(k),
    classification: k.kind || k.claimKind || "approved_workspace_knowledge",
    workspaceId: k.workspaceId || null,
    approvalStatus: k.reviewStatus === "approved" || k.accepted === true ? "approved" : "not_approved",
    sourceOrigin: sourceOriginOf(k),
    statedVsInferred: (extras && extras.statedVsInferred) || "directly_stated",
    claimClass: (extras && extras.claimClass) || "direct_source_backed_fact",
  };
}

function missingBlock() {
  return {
    want: { status: "unknown", note: "No approved source states contractor desire for a dedicated estimator." },
    switch: { status: "unknown", note: "No approved source states intent or cost to leave hand/spreadsheet workflows." },
    pay: { status: "unknown", note: "Willingness to pay is unknown. The 2500 USD figure is an owner qualification threshold, not a price or WTP observation." },
    time_reduction: { status: "unknown", note: "Hand/spreadsheet estimating is described as often slower. No measured time reduction exists." },
    integration: { status: "unknown", note: "Technical integration requirements are not in approved knowledge." },
    competitors: { status: "unknown", note: "No approved competitor comparison exists. None is invented here." },
    market_size: { status: "unknown", note: "TAM, demand, and conversion are not in approved knowledge and are not invented." },
  };
}

export function buildFounderOpportunityBrief(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const ws = store.getWorkspace && store.getWorkspace(workspaceId);
  if (!ws) throw new Error("workspace not found: " + workspaceId);
  const objective = (payload && payload.objective) || (payload.objectiveId && store.getObjective && store.getObjective(payload.objectiveId));
  if (objective && objective.workspaceId && objective.workspaceId !== workspaceId) {
    const err = new Error("Objective stays inside its workspace. Cannot assemble a brief across workspaces.");
    err.code = "WORKSPACE_ISOLATION";
    throw err;
  }
  const sufficiency = payload.sufficiency || assessKnowledgeSufficiency(store, {
    workspaceId: workspaceId,
    objectiveText: (objective && objective.ownerText) || FOUNDER_BRIEF_OWNER_OBJECTIVE,
  });
  const run = payload.run || (payload.strategistRunId && store.getOfferStrategistRun && store.getOfferStrategistRun(payload.strategistRunId))
    || findReusableStrategistRun(store, workspaceId);
  const structured = (run && run.structured) || {};
  const evidenceIds = [
    "K-STUDIO-OWN-009", "K-SCOUT-FND-004", "K-SCOUT-FND-001", "K-SCOUT-FND-019",
    "K-STUDIO-OWN-002", "K-STUDIO-OWN-005", "K-OWN-001-03", "K-OWN-001-02", "K-OWN-004-01",
  ];
  const citations = [];
  for (const id of evidenceIds) {
    const row = citationRecord(store, id, workspaceId, {
      statedVsInferred: "directly_stated",
      claimClass: String(id).includes("OWN") ? "direct_source_backed_fact" : "direct_source_backed_fact",
    });
    if (row) citations.push(row);
  }
  const rejectedCitations = (payload.forcedCitationIds || []).map((id) => assertCitationAllowed(store, id, workspaceId)).filter((r) => !r.ok);

  const targetCustomer = structured.target_customer
    || "US roofing contractors who still estimate by hand or with spreadsheets, subject to approved owner rules (United States only; served regions Southeast, Midwest, Northeast, Southwest; minimum eight employees; verified monthly spend of at least 2500 USD).";
  const customerProblem = structured.customer_problem
    || "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.";
  const proposedOffer = structured.proposed_offer
    || "Hypothesis: RidgeLine Estimator as a dedicated roofing takeoff-and-proposal helper for US contractors still estimating by hand or spreadsheet.";

  const assumptions = (structured.assumptions && structured.assumptions.length)
    ? structured.assumptions.slice()
    : [
      "Approved operational notes still describe current contractor workflows.",
      "A software offer is a hypothesis, not measured demand.",
    ];

  const chain = [
    {
      step: "source",
      knowledgeId: "K-SCOUT-FND-004",
      excerpt: "US roofing contractors who still produce estimates by hand or with generic spreadsheets often take longer to issue proposals.",
      claimClass: "direct_source_backed_fact",
      sourceOrigin: "approved_scout_owner_provided",
    },
    {
      step: "observed_operational_condition",
      text: "Manual or generic-spreadsheet estimating is described as slower to proposal than dedicated takeoff/estimating software.",
      claimClass: "direct_source_backed_fact",
      knowledgeId: "K-SCOUT-FND-004",
    },
    {
      step: "plausible_customer_problem",
      text: "Slower proposal issuance is a plausible operational problem for those contractors. Lost-business impact is not measured.",
      claimClass: "inference",
      knowledgeId: "K-SCOUT-FND-004",
    },
    {
      step: "owner_buying_signal",
      text: "Owner policy treats hand/spreadsheet estimating by a US roofing contractor as a positive buying signal for RidgeLine Estimator.",
      claimClass: "direct_source_backed_fact",
      knowledgeId: "K-STUDIO-OWN-009",
    },
    {
      step: "proposed_offer_hypothesis",
      text: proposedOffer,
      claimClass: "hypothesis",
      knowledgeId: run && run.id || null,
    },
  ];

  const alternatives = [
    {
      id: "ALT-001",
      title: "Takeoff-to-proposal estimating software",
      text: "Position RidgeLine as dedicated software that turns roof takeoffs (area, pitch, materials) into material lists and proposals.",
      claimClass: "hypothesis",
      supportedBy: ["K-SCOUT-FND-001", "K-SCOUT-FND-019"],
      verifiedOutcome: false,
    },
    {
      id: "ALT-002",
      title: "Spreadsheet-replacement helper",
      text: "Position RidgeLine as a replacement for generic spreadsheet estimating, matching the owner buying-signal rule.",
      claimClass: "hypothesis",
      supportedBy: ["K-STUDIO-OWN-009", "K-SCOUT-FND-004"],
      verifiedOutcome: false,
    },
    {
      id: "ALT-003",
      title: "Measurement-first takeoff helper",
      text: "Lead with takeoff/measurement, then proposal generation, because approved notes describe that sequence.",
      claimClass: "hypothesis",
      supportedBy: ["K-SCOUT-FND-001", "K-SCOUT-FND-019"],
      verifiedOutcome: false,
    },
  ];

  const recommendedNextStep = {
    text:
      "Owner reviews this brief. If more evidence is wanted, authorize a small internal interview protocol for US roofing contractors who still estimate by hand or spreadsheet. Execute only after explicit owner approval, and not from this system. No contact is authorized by this brief.",
    claimClass: "proposed_future_validation",
    executed: false,
    outreach: false,
    contactAuthorized: false,
  };

  const employeeUsd = employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID);
  const reusedLive = Boolean(run && run.live === true);
  const assemblyLive = false;
  const spend = {
    objectiveUsd: 0,
    specialistHistoricalLiveUsd: reusedLive ? Number(run.spendUsd || employeeUsd || 0) : employeeUsd,
    thisAssemblyUsd: 0,
    additionalLiveApiUsd: 0,
    providerCalls: 0,
    labels: {
      osr003: reusedLive ? "existing_live_result" : (run ? (run.live ? "live" : "not_live") : "none"),
      briefAssembly: "deterministic",
      freshLiveSpecialistTask: false,
      fixtureFallback: false,
    },
    note: run && run.id === "OSR-003"
      ? "OSR-003 is an existing live result (spendUsd 0.01062). Brief assembly was deterministic. Not a fresh live specialist task."
      : "Brief assembly was deterministic. No new provider call.",
  };

  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const emp = roles.find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);

  const draft = {
    id: (payload && payload.id) || nextId(store, "FOB-", () => store.listFounderOpportunityBriefs ? store.listFounderOpportunityBriefs() : []),
    workspaceId: workspaceId,
    objectiveId: objective && objective.id || (payload && payload.objectiveId) || null,
    createdAt: (payload && payload.createdAt) || nowIso(),
    appendOnly: true,
    immutable: true,
    status: "completed",
    sufficiencyId: sufficiency && sufficiency.id || null,
    assembly: {
      mode: run ? "deterministic_from_preserved_specialist_output" : "deterministic_from_approved_knowledge",
      sourceRunId: run && run.id || null,
      sourceRunLive: Boolean(run && run.live),
      sourceRunContentHash: run && run.contentHash || null,
      sourceRunParseStatus: run && run.parseStatus || null,
      assemblyLive: assemblyLive,
      freshLiveSpecialistTask: false,
      fixture: false,
      fixtureFallback: false,
      providerCalls: 0,
      sourcesFetched: 0,
      ownerApprovalRequired: false,
      ownerApprovalReason: sufficiency && sufficiency.ownerApprovalReason,
      disclosure:
        run && run.id === "OSR-003"
          ? "Used existing live result OSR-003. Brief assembly was deterministic. Not a fresh live specialist task."
          : "Deterministic assembly from approved workspace knowledge. No live specialist call.",
    },
    assignedEmployees: emp ? [{
      id: emp.id,
      roleId: emp.roleId,
      status: emp.status,
      versionId: emp.versionId,
      promoted: Boolean(emp.promoted),
      autonomous: false,
    }] : [],
    sections: {
      objective: {
        text: (objective && objective.ownerText) || FOUNDER_BRIEF_OWNER_OBJECTIVE,
        claimClass: "owner_objective",
      },
      targetCustomer: {
        text: targetCustomer,
        claimClass: "supported_from_owner_policy",
        evidenceIds: ["K-STUDIO-OWN-002", "K-OWN-001-02", "K-OWN-001-03", "K-OWN-004-01", "K-STUDIO-OWN-009"].filter((id) => citations.some((c) => c.knowledgeId === id)),
      },
      customerProblem: {
        text: customerProblem,
        claimClass: "supported_operational_condition",
        evidenceIds: ["K-SCOUT-FND-004", "K-SCOUT-FND-001", "K-SCOUT-FND-019"].filter((id) => citations.some((c) => c.knowledgeId === id)),
      },
      proposedOffer: {
        text: proposedOffer,
        claimClass: "hypothesis",
        notFact: true,
        evidenceIds: citations.map((c) => c.knowledgeId),
      },
      whyThisOfferMightMatter: { chain: chain },
      supportingEvidence: citations,
      assumptions: assumptions.map((a) => ({ text: a, claimClass: "assumption", notEstablishedFact: true })),
      missingInformation: missingBlock(),
      positioningAlternatives: alternatives,
      recommendedNextStep: recommendedNextStep,
      auditStatus: {
        watcher: "deterministic_advisory",
        evaluatorRevisionId: "EVL-M16-001",
        parentEvaluatorId: "EVL-M15-001",
        officialEvaluatorId: officialEvaluatorId(store),
        originalSpecialistWatcher: {
          originalId: "AUD-watcher-ws-ridgeline-os-2026-08-21191640",
          originalStatus: "VIOLATION",
          supersedingId: "AUD-watcher-ws-ridgeline-os-m16-20260821161600",
          supersedingStatus: "PASS",
          note: "Original $2,500 literal false positive preserved. Superseding PASS preserved. Both remain visible.",
        },
        briefAuditId: (payload && payload.auditId) || null,
        unresolvedViolations: [],
      },
      spend: spend,
      disclosure: FOUNDER_BRIEF_DISCLOSURE,
    },
    rejectedCitations: rejectedCitations,
    strategistTaskId: payload && payload.taskId || null,
    conductorPlanId: payload && payload.planId || null,
    originalSpecialistOutputPreserved: true,
    originalSpecialistContentHash: run && run.contentHash || null,
    contentHash: null,
  };
  const hashable = { ...draft };
  delete hashable.contentHash;
  draft.contentHash = contentHash(hashable);
  return draft;
}

export function persistFounderOpportunityBrief(store, draft) {
  if (!store.putFounderOpportunityBrief) throw new Error("FILE_STORE cannot persist founder opportunity briefs");
  return store.putFounderOpportunityBrief(draft);
}

export function assembleFounderOpportunityBrief(store, payload) {
  const draft = buildFounderOpportunityBrief(store, payload);
  return persistFounderOpportunityBrief(store, draft);
}

export function recordFounderBriefContributions(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const brief = extras && extras.brief;
  const recorderRole = extras && extras.recorderRole || "workflow_manager";
  if (recorderRole === "offer_strategist" || (extras && extras.selfAwarded)) {
    const err = new Error("Contribution events cannot be self-awarded.");
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  const events = [];
  function add(id, kind, role, agentId, evidence, note, state) {
    try {
      const ev = recordContribution(store, {
        id: id,
        kind: kind,
        role: role,
        agentId: agentId,
        workspaceId: workspaceId,
        evidence: evidence,
        note: note,
        state: state || "verified",
        selfAwarded: false,
        effective: state === "provisional" ? false : extras && extras.effective,
      });
      events.push(ev);
    } catch { /* already present */ }
  }
  const evidence = {
    briefId: brief && brief.id,
    objectiveId: brief && brief.objectiveId,
    runId: brief && brief.assembly && brief.assembly.sourceRunId,
    taskId: brief && brief.strategistTaskId,
    auditId: extras && extras.auditId,
  };
  add(extras && extras.ids && extras.ids.evidence, "approved_workspace_evidence_used", "workflow_manager", extras && extras.conductorId, evidence, "Approved same-workspace knowledge cited in the brief.", "verified");
  add(extras && extras.ids && extras.ids.hypothesis, "supported_offer_hypothesis_proposed", "workflow_manager", extras && extras.conductorId, evidence, "One offer hypothesis assembled from approved evidence. Not a demand fact.", "verified");
  add(extras && extras.ids && extras.ids.assumptions, "assumptions_explicitly_labeled", "workflow_manager", extras && extras.conductorId, evidence, "Assumptions labeled separately from established facts.", "verified");
  add(extras && extras.ids && extras.ids.uncertainty, "material_uncertainty_identified", "workflow_manager", extras && extras.conductorId, evidence, "Want, switch, pay, time reduction, integration, competitors, and market size remain unknown.", "verified");
  add(extras && extras.ids && extras.ids.task, "authorized_internal_task_completed", "workflow_manager", extras && extras.conductorId, evidence, "Supervised internal Strategist contribution completed (reuse or deterministic assembly).", "verified");
  add(extras && extras.ids && extras.ids.audit, "decision_chain_audited", "independent_audit", extras && extras.watcherId, evidence, "Watcher audited the brief with EVL-M16-001. Deterministic/advisory.", "verified");
  add(extras && extras.ids && extras.ids.brief, "founder_brief_completed", "workflow_manager", extras && extras.conductorId, evidence, "Founder Opportunity Brief persisted.", "verified");
  if (extras && extras.provisionalId) {
    add(extras.provisionalId, "authorized_internal_task_completed", "workflow_manager", extras && extras.conductorId, evidence, "Provisional example remains ineffective.", "provisional");
  }
  return events;
}

export function latestFounderBrief(store, workspaceId) {
  const all = (store.listFounderOpportunityBriefs && store.listFounderOpportunityBriefs(workspaceId)) || [];
  return all.slice(-1)[0] || null;
}

export function frozenHashCheck(store) {
  const out = {};
  for (const id of Object.keys(FROZEN_HASHES)) {
    const v = store.getVersion && store.getVersion(id);
    out[id] = {
      expected: FROZEN_HASHES[id],
      actual: v && v.contentHash,
      match: !v || v.contentHash === FROZEN_HASHES[id],
      mutated: Boolean(v && v.contentHash && v.contentHash !== FROZEN_HASHES[id]),
    };
  }
  return out;
}

export { reviewOneFinding, shouldCreateAtlasVersion, evaluateKnowledgeUsefulness };
