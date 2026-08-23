/** Structured contribution events with real evidence refs. Not fake XP. */
export const CONTRIBUTION_KINDS = {
  scout: [
    "relevant_source_fetched",
    "supported_finding_proposed",
    "owner_approved_finding",
    "genuinely_new_finding",
    "finding_retrieved_by_atlas",
    "finding_cited_in_decision",
  ],
  atlas: [
    "fictional_case_completed",
    "mandatory_policy_coverage_preserved",
    "approved_knowledge_retrieved",
    "approved_knowledge_cited",
    "policy_violation_detected",
    "unsupported_claim_detected",
  ],
  watcher: [
    "audit_completed",
    "verified_policy_violation_detected",
    "false_alarm_detected",
    "provenance_chain_verified",
    "cross_workspace_violation_detected",
  ],
  conductor: [
    "objective_completed",
    "approval_gate_respected",
    "specialist_task_completed",
    "budget_respected",
    "blocked_issue_escalated",
    "duplicate_retraining_avoided",
    "research_stopped_irrelevant",
  ],
  offer_strategist: [
    "live_task_completed",
    "approved_evidence_cited",
    "hypothesis_labeled",
    "watcher_chain_verified",
    "supported_offer_hypothesis_proposed",
    "assumptions_explicitly_labeled",
  ],
  founder_brief: [
    "approved_workspace_evidence_used",
    "supported_offer_hypothesis_proposed",
    "assumptions_explicitly_labeled",
    "material_uncertainty_identified",
    "authorized_internal_task_completed",
    "decision_chain_audited",
    "founder_brief_completed",
  ],
  teaching: [
    "relevant_passage_extracted",
    "teaching_finding_proposed",
    "teaching_packet_proposed",
    "lesson_awaiting_owner_approval",
    "lesson_approved_for_supervised_use",
    "lesson_delivered",
    "lesson_used",
    "lesson_helped",
    "lesson_did_not_help",
    "no_actionable_evidence_recorded",
    "teaching_chain_audited",
    "teaching_correction_recorded",
  ],
  system: [
    "system_development_schema_failure",
    "evaluator_correction",
  ],
};

export const ALL_CONTRIBUTION_KINDS = [
  ...CONTRIBUTION_KINDS.scout,
  ...CONTRIBUTION_KINDS.atlas,
  ...CONTRIBUTION_KINDS.watcher,
  ...CONTRIBUTION_KINDS.conductor,
  ...CONTRIBUTION_KINDS.offer_strategist,
  ...CONTRIBUTION_KINDS.founder_brief,
  ...CONTRIBUTION_KINDS.teaching,
  ...CONTRIBUTION_KINDS.system,
];

export const CONTRIBUTION_STATES = ["provisional", "verified", "invalidated", "disputed", "superseded"];

export const CONTRIBUTION_DISCLOSURE =
  "Contribution events are an evidence ledger, not a sealed eval and not official rank. One demo is not expertise. Scores cannot be self-awarded. No autonomy levels or promotions from one run. Only verified events count toward future progression.";

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listContributionEvents ? store.listContributionEvents() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const e of existing) {
    const m = String(e.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function evidenceHasRef(evidence) {
  if (!evidence || typeof evidence !== "object") return false;
  const keys = ["sourceId", "findingId", "approvalId", "versionId", "taskId", "runId", "auditId", "objectiveId", "usefulnessId", "evaluatorRevisionId", "bakeoffId", "systemEventId", "briefId", "packetId", "episodeId", "deliveryId", "passageId", "sourceAcquisitionId"];
  return keys.some((k) => evidence[k]);
}

export function recordContribution(store, raw) {
  if (raw && raw.selfAwarded === true) {
    const err = new Error("Contribution events cannot be self-awarded.");
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  if (raw && raw.awardedBy && raw.agentId && raw.awardedBy === raw.agentId && raw.role === "offer_strategist") {
    const err = new Error("Contribution events cannot be self-awarded.");
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  const kind = String((raw && raw.kind) || "");
  if (!ALL_CONTRIBUTION_KINDS.includes(kind)) {
    const err = new Error("Unknown contribution kind: " + kind);
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  const evidence = (raw && raw.evidence) || {};
  if (!evidenceHasRef(evidence)) {
    const err = new Error("Contribution event requires a stored evidence ref (source/finding/approval/version/task/run/audit/objective).");
    err.code = "CONTRIBUTION_FORBIDDEN";
    throw err;
  }
  const event = {
    id: (raw && raw.id) || nextId(store, "CE-"),
    at: (raw && raw.at) || nowIso(),
    workspaceId: (raw && raw.workspaceId) || null,
    role: (raw && raw.role) || null,
    agentId: (raw && raw.agentId) || null,
    kind: kind,
    evidence: {
      sourceId: evidence.sourceId || null,
      findingId: evidence.findingId || null,
      approvalId: evidence.approvalId || null,
      versionId: evidence.versionId || null,
      taskId: evidence.taskId || null,
      runId: evidence.runId || null,
      auditId: evidence.auditId || null,
      objectiveId: evidence.objectiveId || null,
      usefulnessId: evidence.usefulnessId || null,
      evaluatorRevisionId: evidence.evaluatorRevisionId || null,
      bakeoffId: evidence.bakeoffId || null,
      systemEventId: evidence.systemEventId || null,
      briefId: evidence.briefId || null,
      packetId: evidence.packetId || null,
      episodeId: evidence.episodeId || null,
      deliveryId: evidence.deliveryId || null,
      passageId: evidence.passageId || null,
      sourceAcquisitionId: evidence.sourceAcquisitionId || null,
    },
    note: (raw && raw.note) || null,
    selfAwarded: false,
    sealedEval: false,
    officialRank: false,
    state: (raw && raw.state) || "provisional",
    effective: ((raw && raw.state) || "provisional") === "verified" && !(raw && raw.effective === false),
    originalEventId: (raw && raw.originalEventId) || null,
    supersedesEventId: (raw && raw.supersedesEventId) || null,
    failureStage: (raw && raw.failureStage) || null,
    responsibleComponent: (raw && raw.responsibleComponent) || null,
    disclosure: CONTRIBUTION_DISCLOSURE,
  };
  if (store && store.putContributionEvent) store.putContributionEvent(event);
  return event;
}

export function listContributions(store, workspaceId) {
  const all = store && store.listContributionEvents ? store.listContributionEvents(workspaceId) : [];
  return all;
}

export function contributionScorecard(store, workspaceId) {
  const events = listContributions(store, workspaceId);
  const byKind = {};
  for (const k of ALL_CONTRIBUTION_KINDS) byKind[k] = 0;
  const effective = events.filter((e) => e.state === "verified" && e.effective !== false);
  for (const e of effective) if (byKind[e.kind] != null) byKind[e.kind] += 1;
  return {
    workspaceId: workspaceId || null,
    eventCount: events.length,
    verifiedCount: effective.length,
    byKind: byKind,
    events: events,
    effectiveEvents: effective,
    disclosure: CONTRIBUTION_DISCLOSURE,
    sealedEval: false,
    officialRank: false,
    note: "Not sealed eval. One demo is not expertise. No official rank without gates. Scores cannot be self-awarded.",
  };
}

export function invalidateContribution(store, originalId, payload) {
  const orig = store.getContributionEvent(originalId);
  if (!orig) throw new Error("contribution event not found: " + originalId);
  const review = {
    id: nextId(store, "CE-"),
    at: nowIso(),
    workspaceId: orig.workspaceId,
    role: (payload && payload.role) || orig.role,
    agentId: orig.agentId,
    kind: orig.kind,
    evidence: {
      ...(orig.evidence || {}),
      originalEventId: originalId,
      findingId: (payload && payload.findingId) || (orig.evidence && orig.evidence.findingId) || null,
    },
    note: (payload && payload.reason) || "Invalidated by later review.",
    selfAwarded: false,
    sealedEval: false,
    officialRank: false,
    state: "invalidated",
    effective: false,
    originalEventId: originalId,
    supersedesEventId: originalId,
    failureStage: (payload && payload.failureStage) || null,
    responsibleComponent: (payload && payload.responsibleComponent) || null,
    reviewEvidence: (payload && payload.reviewEvidence) || null,
    disclosure: CONTRIBUTION_DISCLOSURE,
  };
  store.putContributionEvent(review);
  if (store.putContributionReview) {
    store.putContributionReview({
      id: "CREV-" + originalId,
      originalEventId: originalId,
      supersedingEventId: review.id,
      reason: review.note,
      failureStage: review.failureStage,
      responsibleComponent: review.responsibleComponent,
      effective: false,
      timestamp: review.at,
    });
  }
  const patched = { ...orig, state: orig.state === "verified" ? "invalidated" : "invalidated", effective: false, supersededBy: review.id };
  store.putContributionEvent(patched);
  return { original: patched, review: review };
}

export function verifyContribution(store, eventId, payload) {
  const ev = store.getContributionEvent(eventId);
  if (!ev) throw new Error("contribution event not found: " + eventId);
  const next = { ...ev, state: "verified", effective: true, verifiedAt: nowIso(), verifiedNote: (payload && payload.note) || null };
  store.putContributionEvent(next);
  return next;
}

export function scoutCreditEligible(finding, extras) {
  const supportOk = Boolean(extras && extras.sourceSubstantive && extras.findingSupported);
  const ownerOk = Boolean(extras && extras.ownerApproved);
  const used = Boolean(extras && (extras.retrievedOrUsed || extras.watcherVerified));
  const relevant = extras && extras.relevant === false ? false : !(finding && finding.approvalEligible === false);
  const intended = extras && extras.intendedEmployeeCanUse === false ? false : true;
  return Boolean(supportOk && ownerOk && used && relevant && intended);
}

export function correctProvisionalEffective(store, eventIds) {
  const ids = eventIds || [];
  const out = [];
  for (const id of ids) {
    const orig = store.getContributionEvent(id);
    if (!orig) continue;
    if (orig.state === "provisional" && orig.effective === true) {
      const patched = {
        ...orig,
        effective: false,
        correctedAt: nowIso(),
        correction: "provisional_must_not_be_effective",
      };
      store.putContributionEvent(patched);
      const review = {
        id: nextId(store, "CE-"),
        at: nowIso(),
        workspaceId: orig.workspaceId,
        role: orig.role,
        agentId: orig.agentId,
        kind: orig.kind,
        evidence: { ...(orig.evidence || {}), originalEventId: id },
        note: "Append-only correction: provisional contribution events are not effective for progression.",
        selfAwarded: false,
        sealedEval: false,
        officialRank: false,
        state: "provisional",
        effective: false,
        originalEventId: id,
        supersedesEventId: null,
        failureStage: "contribution_effective_flag",
        responsibleComponent: "contribution_ledger",
        disclosure: CONTRIBUTION_DISCLOSURE,
      };
      store.putContributionEvent(review);
      out.push({ original: patched, correction: review });
    }
  }
  return out;
}
