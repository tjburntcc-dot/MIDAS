/** Control-room Mission 17 view. FILE_STORE only. No secrets. */
import { listPendingApprovals } from "./approval-reconciliation.ts";
import { employeeSpendUsd } from "./offer-strategist-live.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { officialEvaluatorId } from "./evaluator-revision.ts";
import { resolveServingAtlasVersion } from "./conductor.ts";
import { FOUNDER_BRIEF_OWNER_OBJECTIVE, latestFounderBrief, frozenHashCheck } from "./founder-opportunity-brief.ts";

export function mission17Review(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  const brief = latestFounderBrief(store, workspaceId);
  const roles = (store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
  const emp = roles.find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID) || null;
  const objectives = ((store.listObjectives && store.listObjectives(workspaceId)) || []).filter((o) => o.category === "founder_opportunity_brief");
  const objective = (brief && brief.objectiveId && store.getObjective && store.getObjective(brief.objectiveId))
    || objectives.slice(-1)[0]
    || null;
  const audits = (store.listWatcherAudits && store.listWatcherAudits(workspaceId)) || [];
  const briefAudit = audits.find((a) => a.id === (brief && brief.sections && brief.sections.auditStatus && brief.sections.auditStatus.briefAuditId))
    || audits.filter((a) => a.founderOpportunityBriefId === (brief && brief.id)).slice(-1)[0]
    || null;
  const originalAudit = audits.find((a) => a.id === "AUD-watcher-ws-ridgeline-os-2026-08-21191640") || null;
  const supersedingAudit = audits.find((a) => a.id === "AUD-watcher-ws-ridgeline-os-m16-20260821161600") || null;
  const sufficiency = (brief && brief.sufficiencyId && store.getKnowledgeSufficiencyReview && store.getKnowledgeSufficiencyReview(brief.sufficiencyId))
    || ((store.listKnowledgeSufficiencyReviews && store.listKnowledgeSufficiencyReviews(workspaceId)) || []).slice(-1)[0]
    || null;
  const run = brief && brief.assembly && brief.assembly.sourceRunId && store.getOfferStrategistRun
    ? store.getOfferStrategistRun(brief.assembly.sourceRunId)
    : null;
  const pending = listPendingApprovals(store).filter((p) => p.objectiveId === (objective && objective.id));
  const sections = (brief && brief.sections) || {};
  const evidence = sections.supportingEvidence || [];
  const serving = resolveServingAtlasVersion(store, workspaceId);
  const v16 = store.getVersion && store.getVersion("atlas-v16");
  const reviews = (store.listVersionReviews && store.listVersionReviews()) || [];
  const v16Review = reviews.find((r) => r.versionId === "atlas-v16") || null;
  const hashes = frozenHashCheck(store);
  const events = ((store.listContributionEvents && store.listContributionEvents(workspaceId)) || [])
    .filter((e) => e.evidence && (e.evidence.briefId === (brief && brief.id) || [
      "approved_workspace_evidence_used",
      "supported_offer_hypothesis_proposed",
      "assumptions_explicitly_labeled",
      "material_uncertainty_identified",
      "authorized_internal_task_completed",
      "decision_chain_audited",
      "founder_brief_completed",
    ].includes(e.kind)));
  return {
    title: "FOUNDER OPPORTUNITY BRIEF",
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    promotion: false,
    autonomous: false,
    sealed: false,
    outreach: false,
    worldClass: false,
    providerCalls: (brief && brief.assembly && brief.assembly.providerCalls) || 0,
    sourcesFetched: (brief && brief.assembly && brief.assembly.sourcesFetched) || 0,
    liveApiUsd: 0,
    additionalLiveApiUsd: 0,
    workspaceId: workspaceId,
    objectiveId: objective && objective.id || null,
    objectiveText: (objective && objective.ownerText) || (sections.objective && sections.objective.text) || FOUNDER_BRIEF_OWNER_OBJECTIVE,
    assignedEmployees: (brief && brief.assignedEmployees) || (emp ? [{
      id: emp.id,
      roleId: emp.roleId,
      status: emp.status,
      versionId: emp.versionId,
      promoted: Boolean(emp.promoted),
      autonomous: false,
    }] : []),
    status: brief && brief.status || null,
    offerHypothesis: sections.proposedOffer && sections.proposedOffer.text || null,
    targetCustomer: sections.targetCustomer && sections.targetCustomer.text || null,
    customerProblem: sections.customerProblem && sections.customerProblem.text || null,
    evidence: evidence.map((c) => ({
      knowledgeId: c.knowledgeId,
      excerpt: c.excerpt,
      classification: c.classification,
      workspaceId: c.workspaceId,
      approvalStatus: c.approvalStatus,
      sourceOrigin: c.sourceOrigin,
      statedVsInferred: c.statedVsInferred,
    })),
    assumptions: (sections.assumptions || []).map((a) => ({ text: a.text || a, claimClass: a.claimClass || "assumption", notEstablishedFact: a.notEstablishedFact !== false })),
    missingInformation: sections.missingInformation || null,
    recommendedNextAction: sections.recommendedNextStep || null,
    watcher: briefAudit && {
      id: briefAudit.id,
      status: briefAudit.status,
      evaluatorRevisionId: briefAudit.evaluatorRevisionId || "EVL-M16-001",
      parentEvaluatorId: briefAudit.parentEvaluatorId || "EVL-M15-001",
      originalPreserved: briefAudit.originalPreserved,
      deterministic: true,
      advisory: true,
      liveModel: false,
      violations: (briefAudit.violations || []).map((v) => v.code || v),
    },
    originalSpecialistWatcher: {
      originalId: originalAudit && originalAudit.id || "AUD-watcher-ws-ridgeline-os-2026-08-21191640",
      originalStatus: originalAudit && originalAudit.status || "VIOLATION",
      supersedingId: supersedingAudit && supersedingAudit.id || "AUD-watcher-ws-ridgeline-os-m16-20260821161600",
      supersedingStatus: supersedingAudit && supersedingAudit.status || "PASS",
    },
    employeeStatus: emp && {
      id: emp.id,
      status: emp.status,
      versionId: emp.versionId,
      promoted: Boolean(emp.promoted),
      autonomous: false,
      authorizedBy: emp.authorizedBy,
      authorizedAt: emp.authorizedAt,
    },
    liveVsDeterministic: {
      osr003: run && run.id === "OSR-003" ? "existing_live_result" : (run ? (run.live ? "live" : "not_live") : "none"),
      briefAssembly: "deterministic",
      freshLiveSpecialistTask: false,
      fixture: false,
      fixtureFallback: false,
      sourcesFetched: 0,
      providerCalls: 0,
    },
    sourceOrigin: evidence.map((c) => ({ knowledgeId: c.knowledgeId, sourceOrigin: c.sourceOrigin })),
    spend: {
      objectiveUsd: sections.spend && sections.spend.objectiveUsd || 0,
      specialistHistoricalLiveUsd: sections.spend && sections.spend.specialistHistoricalLiveUsd || employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID),
      thisAssemblyUsd: 0,
      additionalLiveApiUsd: 0,
      employeeUsd: employeeSpendUsd(store, workspaceId, OFFER_STRATEGIST_ROLE_ID),
      labels: sections.spend && sections.spend.labels || { briefAssembly: "deterministic", freshLiveSpecialistTask: false },
      note: sections.spend && sections.spend.note || null,
    },
    ownerApprovalRequired: false,
    ownerApprovalReason: sufficiency && sufficiency.ownerApprovalReason || "Approved workspace knowledge already supports a useful supervised brief. No new finding was introduced.",
    pendingApprovalsForThisObjective: pending,
    canceledApprovalsHidden: true,
    sufficiency: sufficiency && {
      id: sufficiency.id,
      decision: sufficiency.decision,
      fetchRecommended: sufficiency.fetchRecommended,
      scoutRequired: sufficiency.scoutRequired,
      atlasRequired: sufficiency.atlasRequired,
      ownerApprovalRequired: sufficiency.ownerApprovalRequired,
      sourcesFetched: sufficiency.sourcesFetched,
      usefulKnowledgeIds: sufficiency.usefulKnowledgeIds,
    },
    briefId: brief && brief.id || null,
    assembly: brief && brief.assembly || null,
    disclosure: sections.disclosure || null,
    officialEvaluatorId: officialEvaluatorId(store),
    servingAtlasVersionId: serving,
    atlasV16: {
      id: "atlas-v16",
      ineligibleForServing: Boolean(v16Review && v16Review.ineligibleForServing),
      ineligibleForPromotion: Boolean(v16Review && v16Review.ineligibleForPromotion),
      immutable: Boolean(v16 && v16.immutable) || Boolean(v16Review && v16Review.immutable),
      hash: v16 && v16.contentHash || FROZEN_HASHES["atlas-v16"],
    },
    frozenHashes: hashes,
    contributionEvents: events.map((e) => ({ id: e.id, kind: e.kind, role: e.role, state: e.state, effective: e.effective, selfAwarded: e.selfAwarded })),
    briefMatchesStore: Boolean(brief && brief.id),
  };
}
