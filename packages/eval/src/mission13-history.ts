/** Append-only Mission 13 historical dispositions. Does not rewrite FND-013, atlas-v16, or AUD-161327. */
import { diagnoseFnd013, appendKnowledgeRemediation, appendVersionReview } from "./finding-disposition.ts";
import { invalidateContribution } from "./contribution.ts";
import { investigateHistoricalWebpagePolicy } from "./watcher.ts";

export const HISTORICAL_WEBPAGE_POLICY_IDS = ["K-004-03", "K-005-02", "K-005-04"];

export function applyMission13History(store) {
  const out = { dispositions: [], remediations: [], invalidations: [], investigations: [] };
  if (store.getScoutFinding && store.getScoutFinding("FND-013")) {
    const d = diagnoseFnd013(store);
    out.dispositions.push(d.disposition, d.versionReview);
    out.attribution = d.attribution;
  } else if (store.getVersion && store.getVersion("atlas-v16") && !(store.listVersionReviews || (() => []))().some((r) => r.versionId === "atlas-v16")) {
    out.dispositions.push(appendVersionReview(store, {
      versionId: "atlas-v16",
      parentVersionId: "atlas-v15",
      versionRole: "candidate_version",
      ineligibleForPromotion: true,
      ineligibleForServing: true,
      reason: "atlas-v16 unnecessarily created; ineligible for promotion/serving; immutable.",
    }));
  }
  const events = store.listContributionEvents ? store.listContributionEvents() : [];
  const proposed = events.find((e) => e.kind === "supported_finding_proposed" && e.evidence && e.evidence.findingId === "FND-013" && e.state !== "invalidated");
  if (proposed) {
    out.invalidations.push(invalidateContribution(store, proposed.id, {
      reason: "FND-013 is non-substantive page chrome. supported_finding_proposed is not verified credit.",
      failureStage: "extraction",
      responsibleComponent: "html_extractor",
      findingId: "FND-013",
      reviewEvidence: { findingId: "FND-013", sourceId: "SRC-STUDIO-URL-004" },
    }));
  }
  out.investigations = investigateHistoricalWebpagePolicy(store, HISTORICAL_WEBPAGE_POLICY_IDS);
  for (const row of out.investigations) {
    if (!row.webpageNotPolicyCorrect) continue;
    const existing = (store.listKnowledgeRemediations ? store.listKnowledgeRemediations() : []).some((r) => r.knowledgeItemId === row.id);
    if (existing) continue;
    out.remediations.push(appendKnowledgeRemediation(store, {
      knowledgeItemId: row.id,
      sourceId: (store.getKnowledge(row.id) || {}).sourceId,
      originalClaimKind: row.knowledgeType,
      requiresAuthorizedOwnerPolicyRevision: true,
      preventUseInNewOperationalVersions: true,
      historical: true,
      activeExposure: false,
      reason: "Unauthorized webpage-to-policy. Preserve; do not silently relabel. Require a new authorized owner-policy revision to use operationally.",
    }));
  }
  const ws = store.getWorkspace && store.getWorkspace("ws-ridgeline");
  if (ws && !ws.servingAtlasVersionId && store.getVersion && store.getVersion("atlas-v15")) {
    store.putWorkspace({
      ...ws,
      servingAtlasVersionId: "atlas-v15",
      selectedWorkbenchVersionId: ws.selectedWorkbenchVersionId || "atlas-v15",
      servingNote: "Serving remains atlas-v15. atlas-v16 is an immutable candidate, not serving and not promoted.",
    });
    out.servingVersionId = "atlas-v15";
  } else {
    out.servingVersionId = ws && ws.servingAtlasVersionId;
  }
  return out;
}
