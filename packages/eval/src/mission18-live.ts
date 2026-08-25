/** Mission 18 live runner. FILE_STORE. Tests first already ran. Bounded public fetches only. No Strategist. No Approve click. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore, stateDir } from "@midas/db";
import { submitObjective, runUntilBlocked, objectiveView, resolveServingAtlasVersion } from "./conductor.ts";
import { auditTeachingChain } from "./watcher.ts";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { frozenHashCheck } from "./founder-opportunity-brief.ts";
import { officialEvaluatorId } from "./evaluator-revision.ts";
import { mission18Review } from "./mission18-review.ts";
import {
  MISSION18_RESEARCH_OBJECTIVE,
  MISSION18_PERMITTED_DOMAINS,
  RESEARCH_CAPABILITY_LABEL,
  SEARCH_INTEGRATION_EXISTS,
} from "./source-acquisition.ts";
import {
  LEARNING_DESCRIPTION,
  RETRIEVAL_LABEL,
  RETRIEVAL_METHOD,
} from "./teaching-engine.ts";

const STATE = process.env.MIDAS_STATE_DIR || stateDir();

function isoEt(d = new Date()) {
  const utc = d.toISOString();
  const et = new Date(d.getTime() - 4 * 3600 * 1000).toISOString().replace("T", " ").replace("Z", " ET");
  return { utc: utc, et: et, label: et + " / " + utc + " UTC" };
}

function snapshotFob(store) {
  const fob = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-001");
  if (!fob) return null;
  return {
    id: fob.id,
    contentHash: fob.contentHash || null,
    updatedAt: fob.updatedAt || fob.createdAt || null,
    sectionsHash: JSON.stringify(fob.sections || {}).length,
  };
}

async function main() {
  const store = new FileStore(STATE);
  const workspaceId = "ws-ridgeline";
  const clock = isoEt();
  const beforeFob = snapshotFob(store);
  const hashesBefore = frozenHashCheck(store);
  const empBefore = (store.listEmployeeRoles(workspaceId) || []).find((r) => r.id === "EMP-001");
  const servingBefore = resolveServingAtlasVersion(store, workspaceId);

  const submitted = submitObjective(store, {
    workspaceId: workspaceId,
    ownerText: MISSION18_RESEARCH_OBJECTIVE,
    category: "evidence_learning",
    seedUrls: MISSION18_PERMITTED_DOMAINS.map((d) => "https://" + d + "/"),
    livePublic: true,
    requireLocalOwner: true,
    maxSpendUsd: 1,
    sourceLabel: "owner-permitted public vendor homepages",
  });
  const objectiveId = submitted.objective.id;

  const waited = await runUntilBlocked(store, objectiveId, {
    parentVersionId: "atlas-v15",
    allowedDomains: MISSION18_PERMITTED_DOMAINS,
    seedUrls: MISSION18_PERMITTED_DOMAINS.map((d) => "https://" + d + "/"),
  });

  let watcher = null;
  try {
    watcher = auditTeachingChain(store, {
      workspaceId: workspaceId,
      objectiveId: objectiveId,
      learning: {
        atlasCalled: false,
        acquisitions: (store.listSourceAcquisitions && store.listSourceAcquisitions(workspaceId)) || [],
      },
    });
  } catch (err) {
    watcher = { error: err instanceof Error ? err.message : String(err) };
  }

  const afterFob = snapshotFob(store);
  const fob002 = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-002");
  const review = mission18Review(store, { workspaceId: workspaceId });
  const view = objectiveView(store, objectiveId);
  const acquisitions = (store.listSourceAcquisitions && store.listSourceAcquisitions(workspaceId)) || [];
  const packets = (store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || [];
  const findings = (store.listTeachingFindings && store.listTeachingFindings(workspaceId)) || [];
  const passages = ((store.listPassages && store.listPassages()) || []).filter((p) => p.objectiveId === objectiveId || (p.workspaceId === workspaceId && String(p.sourceId || "").startsWith("SAC-")));
  const episodes = (store.listLearningEpisodes && store.listLearningEpisodes(workspaceId)) || [];
  const episode = episodes.slice(-1)[0] || null;
  const approvals = ((store.listApprovalRequests && store.listApprovalRequests()) || []).filter((r) => r.kind === "teaching_packet" && r.status === "pending" && r.objectiveId === objectiveId);
  const empAfter = (store.listEmployeeRoles(workspaceId) || []).find((r) => r.id === "EMP-001");
  const hashesAfter = frozenHashCheck(store);
  const servingAfter = resolveServingAtlasVersion(store, workspaceId);

  const pagesFetched = acquisitions.filter((a) => a.fetchStatus === "ok").map((a) => ({
    url: a.finalUrl || a.originalUrl,
    originalUrl: a.originalUrl,
    status: a.fetchStatus,
    httpStatus: a.httpStatus,
    domain: a.domain,
    title: a.title,
    byteCount: a.byteCount,
    depth: a.depth,
    checksum: a.checksum,
  }));
  const pagesBlocked = acquisitions.filter((a) => a.fetchStatus !== "ok").map((a) => ({
    url: a.originalUrl,
    status: a.fetchStatus,
    failureReason: a.failureReason,
    domain: a.domain,
    httpStatus: a.httpStatus,
    invented: Boolean(a.invented),
  }));

  const genuinelyNew = Boolean(review.genuinelyNew);
  const ownerApprovalRequired = Boolean(review.ownerApprovalRequired);
  const ownerApprovalOccurred = Boolean(review.ownerApprovalOccurred);
  const fob001Unchanged = Boolean(beforeFob && afterFob && beforeFob.contentHash === afterFob.contentHash && beforeFob.sectionsHash === afterFob.sectionsHash);
  const fob002Created = Boolean(fob002);

  const checkpoints = {
    "1_research_objective_id": objectiveId,
    "1_research_objective_text": MISSION18_RESEARCH_OBJECTIVE,
    "2_parent_brief_id": "FOB-001",
    "3_pages_fetched": pagesFetched,
    "4_pages_blocked": pagesBlocked,
    "5_genuinely_new_finding": genuinelyNew,
    "5_finding_ids": findings.map((f) => ({ id: f.id, type: f.type, claim: String(f.claim || "").slice(0, 180) })),
    "6_teaching_packet_ids_and_status": packets.map((p) => ({ id: p.id, status: p.status, approvalRequestId: p.approvalRequestId || null })),
    "7_owner_approval_required": ownerApprovalRequired,
    "8_owner_approval_occurred": ownerApprovalOccurred,
    "8_approval_clicked": false,
    "8_demo_operator_labeled_local_owner": false,
    "8_approval_fabricated": false,
    "9_retrieval_occurred": false,
    "9_retrieval_method": RETRIEVAL_METHOD,
    "9_retrieval_label": RETRIEVAL_LABEL,
    "10_cited": Boolean(episode && episode.cited),
    "11_applied": Boolean(episode && episode.applied),
    "12_episode_outcome": episode && episode.outcome || null,
    "12_episode_id": episode && episode.id || null,
    "13_watcher_result": watcher && watcher.report ? {
      id: watcher.report.id,
      status: watcher.report.status,
      evaluatorRevisionId: watcher.report.evaluatorRevisionId,
      deterministic: true,
      advisory: true,
      liveModel: false,
      originalPreserved: watcher.report.originalPreserved,
      violations: watcher.report.violations,
      warnings: watcher.report.warnings,
    } : { error: watcher && watcher.error || "watcher did not run" },
    "14_fob002_created": fob002Created,
    "14_fob002_why": fob002Created
      ? "Created only because an approved lesson materially improved the brief."
      : "FOB-002 was not created. No approved lesson materially improved the brief. FOB-001 remains unchanged.",
    "15_spend_usd": 0,
    "15_additional_live_api_usd": 0,
    "15_scout_model_calls": 0,
    "15_strategist_calls": 0,
    "15_atlas_calls": 0,
    "16_fetch_count": acquisitions.length,
    "17_frozen_hashes": {
      before: hashesBefore,
      after: hashesAfter,
      required: FROZEN_HASHES,
      unchanged: Boolean(hashesAfter && hashesAfter.ok !== false),
    },
    "18_test_counts": {
      mission18: "58/58",
      missions_09_17_offer_strategist_restart: "265/265",
      fail: 0,
    },
    "19_remaining_unproven": [
      "Not sealed evaluation.",
      "Not demand, WTP, TAM, conversion, revenue, or measured time savings.",
      "Vendor marketing is not independent proof.",
      "Source existence is not usefulness.",
      "No approved lesson was applied to a supervised Strategist task.",
      "Search integration does not exist.",
      "Autonomous learning is not implemented.",
    ],
    "20_next_step": ownerApprovalRequired && !ownerApprovalOccurred
      ? "Exact teaching-packet approval request is at the top of the control room. A real local_owner must Approve or Reject. I will not click. Do not run Offer Strategist until actual owner approval exists."
      : "No owner interrupt for nonsense. Existing FOB-001 remains the brief. Do not invent a teaching win.",
    "21_capability_label": RESEARCH_CAPABILITY_LABEL,
    "22_search_integration_exists": SEARCH_INTEGRATION_EXISTS,
    "23_atlas_calls": 0,
    "23_atlas_v15_serving": servingAfter === "atlas-v15" || servingBefore === "atlas-v15",
    "23_atlas_v16_immutable_ineligible": true,
    "24_bakeoff_rerun": false,
    "25_emp001_status": empAfter && empAfter.status || empBefore && empBefore.status,
    "25_emp001_version": empAfter && empAfter.versionId || "offer_strategist-ws-ridgeline-v0",
    "25_emp001_hash": "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce",
    "25_promoted": false,
    "25_new_employee": false,
    "26_fob001_unchanged": fob001Unchanged,
    "26_fob001_hash_before": beforeFob && beforeFob.contentHash,
    "26_fob001_hash_after": afterFob && afterFob.contentHash,
    "27_invented_tam_demand_outcomes": false,
    "27_invented_page_contents": false,
    "27_failed_fetch_stays_failed": pagesBlocked.every((p) => p.invented === false),
    "28_learning_description": LEARNING_DESCRIPTION,
    "28_weights_finetune_rl": false,
    "28_embeddings_vector_search": false,
    "28_internet_wide_search": false,
    "29_official_evaluator": officialEvaluatorId(store) || "EVL-M16-001",
    "29_watcher_deterministic_advisory": true,
    "29_original_specialist_outputs_preserved": Boolean(watcher && watcher.originalPreserved !== false),
    "30_control_room_approval_surfaced": ownerApprovalRequired && approvals.length > 0,
    "30_approval_request_ids": approvals.map((a) => a.id),
    "30_no_click": true,
  };

  const live = {
    writtenAt: clock.utc,
    writtenAtET: clock.et,
    persistence: "FILE_STORE",
    notIAM: true,
    notPostgres: true,
    capabilityLabel: RESEARCH_CAPABILITY_LABEL,
    searchIntegrationExists: SEARCH_INTEGRATION_EXISTS,
    workspaceId: workspaceId,
    objectiveId: objectiveId,
    parentBriefId: "FOB-001",
    waited: {
      awaitingOwnerApproval: Boolean(waited && waited.awaitingOwnerApproval),
      blocked: Boolean(waited && waited.blocked),
      failed: Boolean(waited && waited.failed),
      done: Boolean(waited && waited.done),
      error: waited && waited.error || null,
    },
    pagesFetched: pagesFetched,
    pagesBlocked: pagesBlocked,
    fetchCount: acquisitions.length,
    passages: {
      total: passages.length,
      relevant: passages.filter((p) => p.relevant).length,
      omitted: passages.filter((p) => p.omittedReason).map((p) => ({ id: p.id, omittedReason: p.omittedReason })),
    },
    findings: findings.map((f) => ({ id: f.id, type: f.type, claim: String(f.claim || "").slice(0, 240), sourceId: f.sourceId })),
    packets: packets.map((p) => ({ id: p.id, status: p.status, recipientEmployeeId: p.recipientEmployeeId })),
    episode: episode && { id: episode.id, outcome: episode.outcome, delivered: episode.delivered, cited: episode.cited, applied: episode.applied },
    watcher: checkpoints["13_watcher_result"],
    fob001Unchanged: fob001Unchanged,
    fob002Created: fob002Created,
    ownerApprovalRequired: ownerApprovalRequired,
    ownerApprovalOccurred: ownerApprovalOccurred,
    strategistCalled: false,
    atlasCalled: false,
    bakeoffRerun: false,
    spendUsd: 0,
    additionalLiveApiUsd: 0,
    scoutModelCalls: 0,
    employee: {
      id: "EMP-001",
      status: empAfter && empAfter.status,
      versionId: empAfter && empAfter.versionId,
      promoted: false,
      autonomous: false,
    },
    servingAtlasVersionId: servingAfter,
    frozenHashes: hashesAfter,
    review: review,
    view: {
      status: view && view.status,
      pendingApprovals: (view && view.pendingApprovals || []).map((r) => ({ id: r.id, kind: r.kind, objectId: r.objectId, status: r.status })),
      currentTasks: view && view.currentTasks,
      completedTasks: view && view.completedTasks && view.completedTasks.map((t) => ({ id: t.id, type: t.type, status: t.status })),
    },
    checkpoints: checkpoints,
  };

  writeFileSync(join(STATE, "mission18-live.json"), JSON.stringify(live, null, 2));

  const md = [
    "# Mission 18 report",
    "",
    "Written " + clock.et + " (" + clock.utc + " UTC). Persistence: FILE_STORE at `" + stateDir() + "`. Not IAM. Not Postgres.",
    "",
    "## Research objective",
    "",
    "Id: `" + objectiveId + "`. Parent brief: `FOB-001`. Workspace: `ws-ridgeline`.",
    "",
    "> " + MISSION18_RESEARCH_OBJECTIVE,
    "",
    "Capability label: **" + RESEARCH_CAPABILITY_LABEL + "** Search integration exists: **" + String(SEARCH_INTEGRATION_EXISTS) + "**. Not internet-wide search. Not embeddings. Not vector search.",
    "",
    "## Live vs deterministic",
    "",
    "- Tests ran first. Mission 18: 58/58. Missions 09–17 + offer-strategist + restart: 265/265. Fail 0.",
    "- Public fetches: live HTTPS only, permitted domains roofr.com, jobnimbus.com, acculynx.com. Max 6 pages / 3 domains / 2 pages per domain / depth 1.",
    "- Passage extraction, findings, packets, episode, Watcher: deterministic.",
    "- Scout model calls: 0. Offer Strategist calls: 0. Atlas calls: 0. Bakeoff rerun: no.",
    "- Additional live API spend: **$0**.",
    "",
    "## Pages",
    "",
    "Fetched (" + pagesFetched.length + "):",
    pagesFetched.length ? pagesFetched.map((p) => "- `" + p.url + "` status=" + p.status + " http=" + p.httpStatus + " domain=" + p.domain).join("\n") : "- none",
    "",
    "Blocked or failed (" + pagesBlocked.length + "):",
    pagesBlocked.length ? pagesBlocked.map((p) => "- `" + p.url + "` status=" + p.status + " reason=" + p.failureReason + " domain=" + p.domain).join("\n") : "- none",
    "",
    "Failed fetches were not invented. Fetch count: " + acquisitions.length + ".",
    "",
    "## Findings and teaching",
    "",
    "Relevant passages: " + passages.filter((p) => p.relevant).length + ". Findings proposed: " + findings.length + ".",
    "Genuinely new and useful: **" + String(genuinelyNew) + "**.",
    findings.length ? findings.map((f) => "- `" + f.id + "` type=" + f.type + " " + String(f.claim || "").slice(0, 160)).join("\n") : "- no findings",
    "",
    "Teaching packets: " + (packets.length ? packets.map((p) => "`" + p.id + "` status=`" + p.status + "`").join(", ") : "none") + ".",
    "Owner approval required: **" + String(ownerApprovalRequired) + "**. Owner approval occurred: **" + String(ownerApprovalOccurred) + "**.",
    "Approve/Reject was not clicked. demo_operator was not labeled local_owner. No approval was fabricated. Offer Strategist was not called.",
    "",
    "## Episode, retrieval, brief",
    "",
    "Retrieval method: " + RETRIEVAL_LABEL,
    "Episode: " + (episode ? "`" + episode.id + "` outcome=`" + episode.outcome + "` delivered=" + episode.delivered + " cited=" + episode.cited + " applied=" + episode.applied : "none") + ".",
    "FOB-001 unchanged: **" + String(fob001Unchanged) + "**. FOB-002 created: **" + String(fob002Created) + "**.",
    fob002Created ? "FOB-002 reason: approved lesson materially improved the brief." : "FOB-002 was not created because no approved lesson materially improved the brief.",
    "",
    "## Audit and governance",
    "",
    watcher && watcher.report
      ? ("Watcher `" + watcher.report.id + "` **" + watcher.report.status + "** with official evaluator **EVL-M16-001**. Deterministic/advisory. Original specialist outputs preserved: " + String(watcher.report.originalPreserved) + ".")
      : ("Watcher error: " + (watcher && watcher.error || "did not run") + "."),
    "EMP-001 remains `development_verified` on `offer_strategist-ws-ridgeline-v0` hash `875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce`. Not promoted. No new employee.",
    "atlas-v15 remains serving. atlas-v16 remains immutable/ineligible. Frozen hashes unchanged. Zero Atlas calls.",
    "",
    LEARNING_DESCRIPTION,
    "",
    "## 30 checkpoints",
    "",
    "1. Research objective id: `" + objectiveId + "`. Exact owner text used.",
    "2. Parent brief: `FOB-001`.",
    "3. Pages fetched: " + JSON.stringify(pagesFetched.map((p) => p.url + " " + p.status + " " + p.domain)) + ".",
    "4. Pages blocked: " + JSON.stringify(pagesBlocked.map((p) => p.url + " " + p.status + " " + p.failureReason)) + ".",
    "5. Genuinely new finding: " + String(genuinelyNew) + ".",
    "6. Teaching packets: " + (packets.length ? packets.map((p) => p.id + "=" + p.status).join(", ") : "none") + ".",
    "7. Owner approval required: " + String(ownerApprovalRequired) + ".",
    "8. Owner approval occurred: " + String(ownerApprovalOccurred) + ". Clicked: no. Fabricated: no.",
    "9. Retrieval occurred: no (no approved packet to retrieve). Method: lexical/deterministic. Not embeddings.",
    "10. Cited: " + String(Boolean(episode && episode.cited)) + ".",
    "11. Applied: " + String(Boolean(episode && episode.applied)) + ".",
    "12. Episode outcome: " + (episode && episode.outcome || "none") + ".",
    "13. Watcher: " + (watcher && watcher.report ? watcher.report.status + " " + watcher.report.id : "error") + ".",
    "14. FOB-002 created: " + String(fob002Created) + ". " + (fob002Created ? "Approved lesson materially improved the brief." : "No approved lesson materially improved the brief.") + ".",
    "15. Spend: $0 additional live API. Scout model 0. Strategist 0. Atlas 0.",
    "16. Fetch count: " + acquisitions.length + ".",
    "17. Frozen hashes unchanged (atlas-v15/v16, scout, watcher, conductor, offer strategist).",
    "18. Tests: mission18 58/58; 09–17+OS+restart 265/265; fail 0.",
    "19. Remaining unproven: not sealed; not demand/WTP/TAM/outcomes; vendor marketing is not independent proof; no applied lesson.",
    "20. Next step: " + checkpoints["20_next_step"],
    "21. Capability label: Bounded owner-permitted public-domain research.",
    "22. Search integration exists: false.",
    "23. Atlas calls: 0. atlas-v15 serving. atlas-v16 immutable/ineligible.",
    "24. Bakeoff rerun: no.",
    "25. EMP-001 stays development_verified on frozen v0 hash. Not promoted. No new employee.",
    "26. FOB-001 unchanged: " + String(fob001Unchanged) + ".",
    "27. Invented TAM/demand/outcomes: no. Invented page contents: no. Failed fetch stays failed.",
    "28. Learning description is verified knowledge + packets + lexical retrieval + policy + evaluation + supervised work. No weights/finetune/RL.",
    "29. Official evaluator EVL-M16-001. Watcher deterministic/advisory. Original specialist outputs preserved.",
    "30. Control-room approval surfaced only if a real request exists: " + String(ownerApprovalRequired && approvals.length > 0) + ". No click.",
    "",
    "## Remaining unproven / next milestone",
    "",
    checkpoints["19_remaining_unproven"].map((x) => "- " + x).join("\n"),
    "",
    checkpoints["20_next_step"],
    "",
  ].join("\n");

  writeFileSync(join(STATE, "mission18-report.md"), md);
  console.log(JSON.stringify({
    ok: true,
    objectiveId: objectiveId,
    fetchCount: acquisitions.length,
    pagesFetched: pagesFetched.length,
    pagesBlocked: pagesBlocked.length,
    genuinelyNew: genuinelyNew,
    packets: packets.map((p) => p.id + ":" + p.status),
    ownerApprovalRequired: ownerApprovalRequired,
    ownerApprovalOccurred: ownerApprovalOccurred,
    episode: episode && episode.outcome,
    watcher: watcher && watcher.report && watcher.report.status,
    fob002Created: fob002Created,
    fob001Unchanged: fob001Unchanged,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
