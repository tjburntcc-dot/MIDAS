/** Finding relevance before owner review. Persist usefulness. Omit accurate-but-irrelevant. */

import { looksLikeBoilerplate, looksLikeVideoPlaceholder } from "./html-extract.ts";
import { evaluateKnowledgeUsefulness } from "./usefulness.ts";
import { claimSupportsBrief, isVideoPlaceholderText, isCompensationText } from "./research-brief.ts";

export const RELEVANCE_CHECKS = [
  "fetched",
  "workspace",
  "substantive_extract",
  "excerpt_exists",
  "not_boilerplate",
  "no_invented_facts",
  "claim_supports_objective",
  "relevant_to_intended_agent",
  "fact_vs_inference_labeled",
  "plausible_operational_use",
  "not_unnecessary_duplicate",
];

function nowIso() {
  return new Date().toISOString();
}

function nextOmissionId(store) {
  const existing = store && store.listFindingOmissions ? store.listFindingOmissions() : [];
  let n = 1;
  const re = /^OM-(\d+)$/;
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return "OM-" + String(n).padStart(3, "0");
}

function check(name, pass, detail) {
  return { name: name, pass: Boolean(pass), detail: detail || (pass ? "pass" : "fail") };
}

export function assessFindingRelevance(finding, extras) {
  const brief = extras && extras.brief;
  const source = extras && extras.source;
  const fetched = Boolean(source && (source.fetchStatus === "ok" || source.classification === "owner_provided_paste"
    || source.classification === "synthetic_fixture" || source.classification === "owner_provided_document"
    || source.classification === "live_public_source" || finding.sourceId));
  const workspaceOk = Boolean(finding.workspaceId) && (!brief || !brief.workspaceId || finding.workspaceId === brief.workspaceId);
  const excerpt = String(finding.excerpt || "");
  const excerptOk = excerpt.length >= 8;
  const video = looksLikeVideoPlaceholder(excerpt) || isVideoPlaceholderText(excerpt);
  const boilerplate = looksLikeBoilerplate(excerpt) || video || (finding.flags || []).includes("boilerplate");
  const invented = (finding.flags || []).includes("unsupported_numbers") || (finding.kind === "source_backed_fact" && finding.support && finding.support.valid === false);
  const supportsObjective = brief ? claimSupportsBrief(finding.claim, brief) : true;
  const intendedAgent = (brief && brief.intendedConsumingAgent) || "atlas";
  const roleOk = !finding.applicableRole || ["atlas", "business_research", "scout", intendedAgent].includes(finding.applicableRole);
  const labeled = Boolean(finding.kind);
  const operationalUse = supportsObjective && !boilerplate && excerptOk && finding.kind !== "unresolved_question";
  const duplicate = (finding.flags || []).includes("contradiction") ? false : true;
  const checks = [
    check("fetched", fetched, fetched ? "source present" : "source missing"),
    check("workspace", workspaceOk, workspaceOk ? "same workspace" : "workspace mismatch"),
    check("substantive_extract", !boilerplate && excerptOk, boilerplate ? "chrome or video-placeholder" : "excerpt substantive"),
    check("excerpt_exists", excerptOk, excerptOk ? "excerpt present" : "no excerpt"),
    check("not_boilerplate", !boilerplate, boilerplate ? "boilerplate or video-placeholder" : "not boilerplate"),
    check("no_invented_facts", !invented, invented ? "unsupported or invented numbers" : "no invented facts flagged"),
    check("claim_supports_objective", supportsObjective, supportsObjective ? "supports current question" : "accurate or not, off the current question"),
    check("relevant_to_intended_agent", roleOk, roleOk ? "intended agent can use" : "not for intended agent"),
    check("fact_vs_inference_labeled", labeled, labeled ? String(finding.kind) : "unlabeled"),
    check("plausible_operational_use", operationalUse, operationalUse ? "plausible use" : "no plausible operational use for the current question"),
    check("not_unnecessary_duplicate", duplicate, "not flagged as unnecessary duplicate"),
  ];
  const hardFail = checks.filter((c) => [
    "fetched", "workspace", "excerpt_exists", "not_boilerplate", "no_invented_facts", "claim_supports_objective",
  ].includes(c.name) && !c.pass);
  const trainableKind = finding.kind === "source_backed_fact" || finding.kind === "inference" || finding.kind === "owner_policy_suggestion";
  const approvalEligible = hardFail.length === 0 && trainableKind && finding.kind !== "unresolved_question";
  let omissionReason = null;
  if (!approvalEligible) {
    if (video || boilerplate) omissionReason = "video_placeholder_or_boilerplate";
    else if (!supportsObjective) omissionReason = "accurate_but_irrelevant";
    else if (finding.kind === "unresolved_question") omissionReason = "unresolved_question_not_approval_eligible";
    else if (!excerptOk) omissionReason = "missing_excerpt";
    else if (invented) omissionReason = "invented_or_unsupported";
    else omissionReason = "failed_relevance_checklist";
  }
  return {
    checks: checks,
    approvalEligible: approvalEligible,
    omissionReason: omissionReason,
    accurateButIrrelevant: !supportsObjective && excerptOk && !boilerplate,
    intendedAgent: intendedAgent,
    factVsInference: finding.kind,
  };
}

export function applyFindingRelevance(store, payload) {
  const request = payload.request;
  const brief = payload.brief;
  const findings = payload.findings || [];
  const collected = payload.collected || [];
  const bySource = new Map();
  for (const row of collected) {
    if (row && row.source && row.source.id) bySource.set(row.source.id, row.source);
  }
  const omitted = [];
  const eligible = [];
  for (const f of findings) {
    const source = (f.sourceId && bySource.get(f.sourceId))
      || (f.sourceId && store.getSource ? store.getSource(f.sourceId) : null);
    const review = assessFindingRelevance(f, { brief: brief, source: source });
    f.approvalEligible = review.approvalEligible;
    f.omissionReason = review.omissionReason;
    f.relevanceReview = review;
    f.factVsInference = f.kind;
    if (!review.approvalEligible) {
      const markOmitted = review.omissionReason === "video_placeholder_or_boilerplate"
        || review.omissionReason === "invented_or_unsupported"
        || (review.accurateButIrrelevant && isCompensationText(String(f.claim || "") + " " + String(f.excerpt || "")));
      if (markOmitted && f.reviewStatus === "proposed") f.reviewStatus = "omitted";
      const rec = {
        id: nextOmissionId(store),
        workspaceId: f.workspaceId,
        findingId: f.id,
        requestId: request && request.id,
        objectiveId: request && request.objectiveId,
        briefId: brief && brief.id,
        reason: review.omissionReason,
        accurateButIrrelevant: review.accurateButIrrelevant,
        performanceCredit: false,
        train: false,
        researchSuccess: false,
        detail: review.accurateButIrrelevant
          ? "Accurate-but-irrelevant fact stored as an omission. Not sent to owner. No performance credit. No train. Not a research success."
          : "Finding omitted before owner review: " + review.omissionReason,
        createdAt: nowIso(),
      };
      if (store && store.putFindingOmission) store.putFindingOmission(rec);
      omitted.push({ finding: f, omission: rec });
    } else {
      eligible.push(f);
    }
    if (store && store.putScoutFinding) store.putScoutFinding(f);
  }

  const usefulness = evaluateKnowledgeUsefulness(store, {
    workspaceId: request.workspaceId,
    objectiveId: request.objectiveId || null,
    objectiveText: (brief && brief.researchQuestion) || request.question,
    workspaceText: (brief && (brief.businessOffer || brief.intendedCustomer)) || request.context,
    findings: findings,
    brief: brief,
  });
  for (const f of findings) {
    f.usefulnessReviewId = usefulness.id;
    const row = (usefulness.reviews || []).find((r) => r.id === f.id);
    if (row) f.usefulnessOutcome = row.outcome;
    if (store && store.putScoutFinding) store.putScoutFinding(f);
  }
  return {
    findings: findings,
    eligible: eligible,
    omitted: omitted,
    usefulness: usefulness,
    approvalEligibleCount: eligible.length,
    noActionableEvidence: eligible.length === 0,
  };
}
