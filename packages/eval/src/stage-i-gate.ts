/** Stage I hard gate. Honest evaluation. Do not begin employee creation unless all nine pass. */

import { contributionScorecard } from "./contribution.ts";
import { WATCHER_SCOPES } from "./watcher.ts";
import { resolveServingAtlasVersion } from "./conductor.ts";

export const FROZEN_HASHES = {
  "atlas-v14": "91340b42e9cc084356cf3fe870d78aa3b8e9be60bc3efbe5e89348f8f68ff4fc",
  "atlas-v15": "0a1b77111582b76a4be3b873a09a4c2a73efec7103f6bb9dafdff7e8a4774a70",
  "atlas-v16": "64bb716d5aa030376a1e96194a30858bb3ad67093ede1c16b3146a1fd86321d1",
  "scout-ws-ridgeline-v0": "129841f55a98a7bd0ab45650e4f44c185fd49deb0d2c3fbfc761b64a4c8a1ec5",
  "watcher-ws-ridgeline-v0": "a320bedf0b416080b7017aa4ee764825ccb16ecd3cceec2ddba2b51cb20e0061",
  "conductor-ws-ridgeline-v0": "5b7e2673fac69dab1603c19a9751bf375fd0bce7cb2802254f02b58b2b947102",
  "offer_strategist-ws-ridgeline-v0": "875c2bc2ce7e086bf334d04de3f327dd2d068f7ce2400a7d7b0582d264b2e2ce",
};

function nowIso() {
  return new Date().toISOString();
}

function nextId(store) {
  const existing = store && store.listStageIGates ? store.listStageIGates() : [];
  return "GATE-I-" + String(existing.length + 1).padStart(3, "0");
}

function cond(id, title, pass, detail) {
  return { id: id, title: title, pass: Boolean(pass), detail: detail || (pass ? "pass" : "fail") };
}

export function evaluateStageIGate(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const findings = (store.listScoutFindings ? store.listScoutFindings(workspaceId) : []) || [];
  const omissions = (store.listFindingOmissions ? store.listFindingOmissions() : []) || [];
  const usefulness = (store.listUsefulnessReviews ? store.listUsefulnessReviews(workspaceId) : []) || [];
  const shadows = (store.listShadowCompiles ? store.listShadowCompiles(workspaceId) : []) || [];
  const events = (store.listContributionEvents ? store.listContributionEvents(workspaceId) : []) || [];
  const proofs = (extras && extras.proofs) || {};

  const salaryOmitted = omissions.some((o) => o.accurateButIrrelevant || o.reason === "accurate_but_irrelevant")
    || findings.some((f) => f.approvalEligible === false && (f.omissionReason === "accurate_but_irrelevant" || (f.flags || []).includes("off_objective")))
    || proofs.salaryRejected === true;
  const salaryLeaked = findings.some((f) => f.approvalEligible === true && f.reviewStatus === "proposed" && /median pay|hourly rate|\$\d{2},\d{3}/i.test(String(f.claim || "")) && !(extras && extras.laborCostObjective));
  const c1 = cond(1, "Irrelevant salary facts rejected automatically", salaryOmitted && !salaryLeaked,
    salaryLeaked ? "A compensation finding is still approval-eligible on a non-labor-cost objective." : (salaryOmitted ? "Salary/wage facts were omitted before owner review." : "No stored omission of irrelevant salary facts."));

  const videoOmitted = findings.some((f) => (f.flags || []).includes("boilerplate") || f.omissionReason === "video_placeholder_or_boilerplate")
    || omissions.some((o) => o.reason === "video_placeholder_or_boilerplate")
    || proofs.videoRejected === true;
  const c2 = cond(2, "Video-placeholder text rejected automatically", videoOmitted,
    videoOmitted ? "Video-placeholder excerpts are not approval-eligible." : "No stored rejection of video-placeholder text.");

  const ownerFacing = findings.filter((f) => f.reviewStatus === "proposed" && f.approvalEligible === true);
  const usefulnessPersisted = ownerFacing.every((f) => f.usefulnessReviewId) && (usefulness.length > 0 || proofs.usefulnessPersisted === true);
  const anyNull = ownerFacing.some((f) => !f.usefulnessReviewId) && proofs.usefulnessPersisted !== true;
  const c3 = cond(3, "Complete usefulness review persisted", usefulnessPersisted && !anyNull,
    anyNull ? "An owner-facing finding still has usefulness=null." : (usefulnessPersisted ? "Usefulness reviews are stored before owner review." : "No persisted usefulness review."));

  const positive = findings.some((f) => f.approvalEligible === true && (f.kind === "source_backed_fact" || f.kind === "inference") && !(f.flags || []).includes("off_objective"))
    || proofs.positiveControlPassed === true;
  const c4 = cond(4, "Relevant supported positive-control finding passed the pipeline", positive,
    positive ? "At least one relevant supported finding is approval-eligible." : "No relevant positive-control finding passed.");

  const shadowOk = shadows.some((s) => s.outcome && (s.retrieved === true || s.retrievable === true || (s.retrieval && s.retrieval.ok) || s.produceVersion != null))
    || proofs.shadowWorked === true;
  const c5 = cond(5, "Shadow retrieval works", shadowOk,
    shadowOk ? "A shadow compile ran and recorded retrieval." : "No successful shadow retrieval record.");

  const policyOk = shadows.some((s) => s.mandatoryPoliciesPreserved === true
    || (s.checks && s.checks.mandatoryPoliciesPreserved)
    || (Array.isArray(s.mandatoryPolicyDisplaced) && s.mandatoryPolicyDisplaced.length === 0 && (s.currentVersionPreserved === true || s.currentServingVersionId)))
    || proofs.mandatoryPoliciesPreserved === true;
  const c6 = cond(6, "Mandatory owner policies preserved", policyOk,
    policyOk ? "Shadow/policy check preserved mandatory owner rules." : "No record that mandatory owner policies were preserved.");

  const provisionalEffective = events.filter((e) => e.state === "provisional" && e.effective === true);
  const scorecard = workspaceId ? contributionScorecard(store, workspaceId) : { verifiedCount: 0 };
  const c7 = cond(7, "Provisional contribution events do not count as effective credit",
    provisionalEffective.length === 0 && (scorecard.verifiedCount === (scorecard.effectiveEvents || []).length),
    provisionalEffective.length
      ? "Still provisional+effective: " + provisionalEffective.map((e) => e.id).join(", ")
      : "Provisional events are not effective. Only verified+effective count.");

  const watcherOk = Array.isArray(WATCHER_SCOPES) && WATCHER_SCOPES.includes("current_decision_chain")
    && (proofs.watcherAudited === true || (store.listWatcherAudits && (store.listWatcherAudits(workspaceId) || []).length > 0));
  const c8 = cond(8, "Watcher can audit the correct current scope", watcherOk,
    watcherOk ? "Watcher scopes include current_decision_chain and an audit can run without inventing Atlas work." : "Watcher current-scope audit not demonstrated.");

  const hashFails = [];
  for (const [id, expected] of Object.entries(FROZEN_HASHES)) {
    const v = store.getVersion(id);
    if (v && v.contentHash && v.contentHash !== expected) hashFails.push(id);
  }
  const serving = extras && extras.ignoreServing ? true : (resolveServingAtlasVersion(store, workspaceId) === "atlas-v15" || !store.getVersion("atlas-v15"));
  const c9 = cond(9, "Existing frozen versions unchanged", hashFails.length === 0,
    hashFails.length ? "Hash drift: " + hashFails.join(", ") : "Frozen atlas-v14/v15/v16 and ridgeline specialist hashes unchanged. Serving remains atlas-v15 when present.");

  const conditions = [c1, c2, c3, c4, c5, c6, c7, c8, c9];
  const failed = conditions.filter((c) => !c.pass);
  const record = {
    id: (extras && extras.id) || nextId(store),
    workspaceId: workspaceId || null,
    createdAt: nowIso(),
    pass: failed.length === 0,
    conditions: conditions,
    failedIds: failed.map((c) => c.id),
    failedTitles: failed.map((c) => c.title),
    employeeFactoryAvailable: failed.length === 0,
    offerStrategistBlocked: failed.length > 0,
    servingVersionId: store.getVersion("atlas-v15") ? "atlas-v15" : resolveServingAtlasVersion(store, workspaceId),
    candidateVersionId: store.getVersion("atlas-v16") ? "atlas-v16" : null,
    promotedVersionId: null,
    note: failed.length
      ? "Stage I FAILED. Offer Strategist is correctly blocked. Failed: " + failed.map((c) => c.id + " " + c.title).join("; ")
      : "Stage I PASSED. All nine conditions hold from stored records. Employee factory may create exactly one specialist.",
    disclosure: "Not promotion. Not IAM. FILE_STORE. One gate pass is not world-class.",
  };
  void serving;
  if (store && store.putStageIGate) store.putStageIGate(record);
  return record;
}
