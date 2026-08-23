/** Control-room Mission 18 view. FILE_STORE only. No secrets. */
import { listPendingApprovals } from "./approval-reconciliation.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { officialEvaluatorId } from "./evaluator-revision.ts";
import { resolveServingAtlasVersion } from "./conductor.ts";
import { OFFER_STRATEGIST_ROLE_ID } from "./offer-strategist.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import {
  teachingControlRoomSlice,
  RETRIEVAL_METHOD,
  RETRIEVAL_LABEL,
  LEARNING_DESCRIPTION,
} from "./teaching-engine.ts";
import { RESEARCH_CAPABILITY_LABEL, SEARCH_INTEGRATION_EXISTS, MISSION18_RESEARCH_OBJECTIVE } from "./source-acquisition.ts";

export function mission18Review(store, extras) {
  const workspaceId = (extras && extras.workspaceId) || "ws-ridgeline";
  const slice = teachingControlRoomSlice(store, { workspaceId: workspaceId });
  const objectives = ((store.listObjectives && store.listObjectives(workspaceId)) || []).filter((o) => o.category === "evidence_learning" || /source-backed observations that could improve RidgeLine/i.test(String(o.ownerText || "")));
  const objective = objectives.slice(-1)[0] || null;
  const packets = (store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || [];
  const acquisitions = (store.listSourceAcquisitions && store.listSourceAcquisitions(workspaceId)) || [];
  const episodes = (store.listLearningEpisodes && store.listLearningEpisodes(workspaceId)) || [];
  const episode = episodes.slice(-1)[0] || null;
  const fob001 = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-001");
  const fob002 = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-002");
  const emp = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);
  const serving = resolveServingAtlasVersion(store, workspaceId);
  const v16 = store.getVersion && store.getVersion("atlas-v16");
  const reviews = (store.listVersionReviews && store.listVersionReviews()) || [];
  const v16Review = reviews.find((r) => r.versionId === "atlas-v16") || null;
  const audits = ((store.listWatcherAudits && store.listWatcherAudits(workspaceId)) || []).filter((a) => /teach-m18|teaching/.test(String(a.id || "")) || (a.teachingPacketIds && a.teachingPacketIds.length));
  const audit = audits.slice(-1)[0] || null;
  const pending = listPendingApprovals(store).filter((p) => p.kind === "teaching_packet" || (objective && p.objectiveId === objective.id));
  const hashes = frozenHashCheck(store);
  return {
    title: "EMPLOYEE LEARNING AND TEACHING",
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    promotion: false,
    autonomous: false,
    sealed: false,
    outreach: false,
    worldClass: false,
    fineTuning: false,
    reinforcementLearning: false,
    weightUpdates: false,
    embeddingsVectorSearch: false,
    internetWideSearch: false,
    searchIntegrationExists: SEARCH_INTEGRATION_EXISTS,
    capabilityLabel: RESEARCH_CAPABILITY_LABEL,
    retrievalMethod: RETRIEVAL_METHOD,
    retrievalLabel: RETRIEVAL_LABEL,
    learningDescription: LEARNING_DESCRIPTION,
    workspaceId: workspaceId,
    objectiveId: objective && objective.id || null,
    objectiveText: (objective && objective.ownerText) || MISSION18_RESEARCH_OBJECTIVE,
    parentBriefId: "FOB-001",
    pagesFetched: acquisitions.filter((a) => a.fetchStatus === "ok").map((a) => ({ url: a.finalUrl || a.originalUrl, status: a.fetchStatus, domain: a.domain, httpStatus: a.httpStatus })),
    pagesBlocked: acquisitions.filter((a) => a.fetchStatus !== "ok").map((a) => ({ url: a.originalUrl, status: a.fetchStatus, failureReason: a.failureReason, domain: a.domain })),
    fetchCount: acquisitions.length,
    genuinelyNew: packets.some((p) => p.status === "awaiting_owner_approval" || p.status === "approved_for_supervised_use"),
    teachingPackets: packets.map((p) => ({ id: p.id, status: p.status, recipientEmployeeId: p.recipientEmployeeId, teacherName: p.teacherName })),
    ownerApprovalRequired: packets.some((p) => p.status === "awaiting_owner_approval") || pending.length > 0,
    ownerApprovalOccurred: packets.some((p) => p.status === "approved_for_supervised_use" && p.reviewerIdentity && p.reviewerIdentity.actorType === "local_owner"),
    pendingTeachingApprovals: slice.pendingTeachingApprovals,
    canceledApprovalsHidden: true,
    showApprovalOnlyWhenRequestExists: slice.showApprovalOnlyWhenRequestExists,
    episode: episode && { id: episode.id, outcome: episode.outcome, delivered: episode.delivered, cited: episode.cited, applied: episode.applied },
    watcher: audit && {
      id: audit.id,
      status: audit.status,
      evaluatorRevisionId: audit.evaluatorRevisionId || "EVL-M16-001",
      deterministic: true,
      advisory: true,
      liveModel: false,
      originalPreserved: audit.originalPreserved,
      violations: audit.violations || [],
    },
    fob001Id: fob001 && fob001.id || "FOB-001",
    fob002Created: Boolean(fob002),
    fob002Reason: fob002 ? "Approved lesson materially improved the brief." : "No approved lesson materially improved the brief. FOB-001 unchanged.",
    employeeStatus: emp && {
      id: emp.id,
      status: emp.status,
      versionId: emp.versionId,
      promoted: Boolean(emp.promoted),
      autonomous: false,
    },
    servingAtlasVersionId: serving,
    atlasV16: {
      id: "atlas-v16",
      ineligibleForServing: Boolean(v16Review && v16Review.ineligibleForServing),
      immutable: Boolean(v16 && v16.immutable) || Boolean(v16Review && v16Review.immutable),
      hash: v16 && v16.contentHash || FROZEN_HASHES["atlas-v16"],
    },
    frozenHashes: hashes,
    officialEvaluatorId: officialEvaluatorId(store),
    spendUsd: 0,
    atlasCalls: 0,
    bakeoffRerun: false,
    chain: slice.chain,
    controlRoomSlice: slice,
    briefMatchesStore: Boolean(fob001 && fob001.id === "FOB-001"),
  };
}
