/** Append-only finding and version review dispositions. Do not rewrite history. */

export const DISPOSITION_KINDS = [
  "insufficiently_supported",
  "non_substantive",
  "novelty_without_relevance",
  "unnecessarily_created_version",
  "ineligible_for_promotion",
  "historical_webpage_policy_remediation",
];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix, lister) {
  const existing = lister ? lister() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export const VERSION_ROLES = [
  "candidate_version",
  "selected_workbench_version",
  "serving_version",
  "promoted_version",
];

export function appendFindingDisposition(store, payload) {
  const rec = {
    id: (payload && payload.id) || nextId(store, "FDISP-", () => store.listFindingDispositions ? store.listFindingDispositions() : []),
    createdAt: nowIso(),
    findingId: payload.findingId,
    sourceId: payload.sourceId || null,
    kind: payload.kind,
    originalReviewStatus: payload.originalReviewStatus || null,
    originalUsefulnessOutcome: payload.originalUsefulnessOutcome || null,
    verdict: payload.verdict,
    reason: payload.reason,
    historyPreserved: true,
    rewritten: false,
    actor: payload.actor || "system",
    actorType: payload.actorType || "system",
    note: payload.note || null,
  };
  store.putFindingDisposition(rec);
  return rec;
}

export function appendVersionReview(store, payload) {
  const rec = {
    id: (payload && payload.id) || nextId(store, "VREV-", () => store.listVersionReviews ? store.listVersionReviews() : []),
    createdAt: nowIso(),
    versionId: payload.versionId,
    parentVersionId: payload.parentVersionId || null,
    versionRole: payload.versionRole || "candidate_version",
    immutable: true,
    ineligibleForPromotion: payload.ineligibleForPromotion !== false,
    ineligibleForServing: payload.ineligibleForServing !== false,
    improvementClaim: false,
    findingRetrievedOrCited: Boolean(payload.findingRetrievedOrCited),
    reason: payload.reason,
    actor: payload.actor || "system",
    actorType: payload.actorType || "system",
    note: payload.note || "Append-only version review. The version record itself was not rewritten.",
  };
  store.putVersionReview(rec);
  return rec;
}

export function appendFailureAttribution(store, payload) {
  const rec = {
    id: (payload && payload.id) || nextId(store, "FATTR-", () => store.listFailureAttributions ? store.listFailureAttributions() : []),
    createdAt: nowIso(),
    findingId: payload.findingId || null,
    sourceId: payload.sourceId || null,
    stagesInspected: payload.stagesInspected || [],
    primaryCause: payload.primaryCause,
    secondaryCauses: payload.secondaryCauses || [],
    scoutReceivedBody: payload.scoutReceivedBody !== false && payload.scoutReceivedBody !== undefined ? payload.scoutReceivedBody : false,
    extractorBlamed: Boolean(payload.extractorBlamed),
    scoutBlamed: Boolean(payload.scoutBlamed),
    note: payload.note,
    evidence: payload.evidence || {},
  };
  store.putFailureAttribution(rec);
  return rec;
}

export function appendKnowledgeRemediation(store, payload) {
  const rec = {
    id: (payload && payload.id) || nextId(store, "KREM-", () => store.listKnowledgeRemediations ? store.listKnowledgeRemediations() : []),
    createdAt: nowIso(),
    knowledgeItemId: payload.knowledgeItemId,
    sourceId: payload.sourceId || null,
    originalClaimKind: payload.originalClaimKind || null,
    originalKind: payload.originalKind || null,
    silentlyRelabeled: false,
    preventUseInNewOperationalVersions: payload.preventUseInNewOperationalVersions !== false,
    requiresAuthorizedOwnerPolicyRevision: Boolean(payload.requiresAuthorizedOwnerPolicyRevision),
    historical: payload.historical !== false,
    activeExposure: Boolean(payload.activeExposure),
    reason: payload.reason,
    note: payload.note || "Preserved. Marked for remediation. Not silently relabeled.",
  };
  store.putKnowledgeRemediation(rec);
  return rec;
}

export function diagnoseFnd013(store) {
  const finding = store.getScoutFinding && store.getScoutFinding("FND-013");
  const source = store.getSource && store.getSource("SRC-STUDIO-URL-004");
  const stages = [
    "raw_html",
    "sanitized_html",
    "extracted_main_text",
    "text_supplied_to_scout",
    "scout_raw_model_response",
    "structured_finding",
    "usefulness",
    "approval",
    "training",
  ];
  const storedText = source ? String(source.excerpt || source.captureNote || "") : "";
  const rawPersisted = Boolean(source && source.rawHtmlPersisted);
  const scoutReceivedBody = storedText.length > 400 && !/skip to content/i.test(storedText.slice(0, 200));
  const primary = "extraction";
  const secondary = ["usefulness", "source_support", "training_eligibility"];
  const attribution = appendFailureAttribution(store, {
    findingId: "FND-013",
    sourceId: "SRC-STUDIO-URL-004",
    stagesInspected: stages,
    primaryCause: primary,
    secondaryCauses: secondary,
    scoutReceivedBody: scoutReceivedBody,
    extractorBlamed: true,
    scoutBlamed: false,
    evidence: {
      storedExcerptLead: storedText.slice(0, 180),
      findingClaimLead: finding ? String(finding.claim || "").slice(0, 180) : null,
      rawHtmlPersisted: rawPersisted,
      produceFindingsLiveIgnoredModel: true,
    },
    note:
      "Primary cause is extraction/sanitization: stripHtml kept page chrome and persist used the first 240 characters as excerpt. "
      + "Scout live model was invoked but produceFindingsLive discarded the model response and reused extractClaims chrome. "
      + "Do not punish Scout for never receiving the article body. "
      + "Usefulness then treated unique chrome as genuinely_new. Training created atlas-v16. "
      + (rawPersisted ? "Raw HTML was persisted." : "Raw HTML was not persisted by the Mission 12 extractor; diagnosis uses stored stripped text and the structured finding."),
  });
  const disp = appendFindingDisposition(store, {
    findingId: "FND-013",
    sourceId: "SRC-STUDIO-URL-004",
    kind: "insufficiently_supported",
    originalReviewStatus: finding && finding.reviewStatus,
    originalUsefulnessOutcome: "genuinely_new",
    verdict: "insufficiently_supported_non_substantive",
    reason:
      "Claim is BLS page chrome (title, Skip to Content, .gov means it's official). "
      + "genuinely_new was insufficient: novelty without relevance and support is not useful. "
      + "Finding was not retrieved or cited as operational knowledge.",
    actor: "system",
    actorType: "system",
    note: "FND-013 record is preserved. This is an append-only review. Do not pretend FND-013 was useful.",
  });
  const vrev = appendVersionReview(store, {
    versionId: "atlas-v16",
    parentVersionId: "atlas-v15",
    versionRole: "candidate_version",
    ineligibleForPromotion: true,
    ineligibleForServing: true,
    findingRetrievedOrCited: false,
    reason:
      "atlas-v16 was unnecessarily created from a non-substantive chrome finding. "
      + "Immutable candidate only. No improvement claim. Ineligible for promotion or serving.",
  });
  return { attribution: attribution, disposition: disp, versionReview: vrev };
}
