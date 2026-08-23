/** Knowledge usefulness and training gates. Novelty alone is not useful. */
import { inferFindingTopicSignal } from "./retrieve-v2.ts";
import { looksLikeBoilerplate, looksLikeA11yChrome, looksLikeVideoPlaceholder } from "./html-extract.ts";
import { checkSourceSupport } from "./source-support.ts";
import { claimSupportsBrief, detectQuestionFamily } from "./research-brief.ts";

export const USEFULNESS_OUTCOMES = [
  "genuinely_new",
  "eligible_new_knowledge",
  "duplicate_existing",
  "corroborates_existing",
  "refines_existing",
  "materially_refines_existing",
  "conflicts_with_existing",
  "irrelevant_to_objective",
  "insufficiently_supported",
  "insufficient_source_support",
  "boilerplate_or_non_substantive",
  "unsupported_inference",
  "owner_review_required",
];

export const USEFULNESS_GATES = [
  "provenance_valid",
  "source_content_substantive",
  "source_support_valid",
  "objective_relevant",
  "workspace_relevant",
  "role_relevant",
  "knowledge_type_allowed",
  "novelty_or_material_refinement",
  "expected_utility_defined",
  "owner_authorized",
];

function nowIso() {
  return new Date().toISOString();
}

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function polarity(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(not|never|no|cannot|must not|do not)\b/.test(t)) return "neg";
  return "pos";
}

function itemWorkspaceId(k) {
  return (k && (k.workspaceId || k.workspace)) || null;
}

function candidateText(c) {
  return String((c && (c.claim || c.statement || c.rule)) || "");
}

function candidateExcerpt(c) {
  return String((c && (c.excerpt || (c.locator && c.locator.text))) || "");
}

function existingApproved(store, workspaceId) {
  return (store.listKnowledge() || []).filter((k) => {
    if (!k) return false;
    const kid = itemWorkspaceId(k);
    if (workspaceId && kid && kid !== workspaceId) return false;
    if (k.reviewStatus === "rejected" || k.reviewStatus === "superseded") return false;
    return k.accepted === true || k.reviewStatus === "approved";
  });
}

function onObjective(claim, objectiveText, brief) {
  if (brief) return claimSupportsBrief(claim, brief);
  const family = detectQuestionFamily(objectiveText);
  if (family !== "general") {
    return claimSupportsBrief(claim, { questionFamily: family, researchQuestion: objectiveText });
  }
  const q = tokenize(objectiveText);
  const c = String(claim || "").toLowerCase();
  if (!q.length) return true;
  let hits = 0;
  for (const t of q) if (c.includes(t)) hits += 1;
  return hits >= 1;
}

function gateRecord(name, pass, detail) {
  return { name: name, pass: Boolean(pass), detail: detail || (pass ? "pass" : "fail") };
}

export function evaluateGates(candidate, extras) {
  const claim = candidateText(candidate);
  const excerpt = candidateExcerpt(candidate);
  const flags = candidate.flags || [];
  const sourceText = (extras && extras.sourceText) || (candidate.sourceText) || excerpt;
  const extraction = (extras && extras.extraction) || candidate.extraction || null;
  const utility = (extras && extras.utility) || candidate.utility || null;
  const support = (extras && extras.support) || candidate.support || checkSourceSupport({
    claim: claim,
    excerpt: excerpt,
    sourceText: sourceText,
    sourceId: candidate.sourceId,
    contentChecksum: candidate.sourceSha256 || (extras && extras.contentChecksum),
    locator: candidate.locator,
    kind: candidate.kind,
    presentAsFact: candidate.kind === "source_backed_fact",
  });
  const provenance = Boolean(candidate.sourceId) && Boolean(excerpt);
  const substantive = Boolean(
    extraction && extraction.quality && extraction.quality.pass
  ) || (
    excerpt.length >= 24
    && !looksLikeBoilerplate(excerpt)
    && !looksLikeA11yChrome(excerpt)
    && !flags.includes("boilerplate")
  );
  const supportValid = support && (support.supportStatus === "supported_direct_fact" || support.supportStatus === "supported_as_inference_only");
  const briefAware = extras && extras.brief
    ? onObjective(claim, extras.objectiveText, extras.brief)
    : onObjective(claim, extras && extras.objectiveText);
  const objectiveOk = !extras || !extras.objectiveText || (briefAware && !flags.includes("off_objective"));
  const workspaceOk = !extras || !extras.workspaceText || onObjective(claim, extras.workspaceText) || onObjective(excerpt, extras.workspaceText) || substantive;
  const roleOk = !candidate.applicableRole || ["atlas", "business_research", "scout"].includes(candidate.applicableRole) || candidate.applicableRole === (extras && extras.role);
  const typeOk = candidate.kind !== "unresolved_question" && candidate.kind !== "owner_policy_suggestion" && candidate.kind !== "owner_policy";
  const noveltyGate = extras && extras.noveltyPass != null ? extras.noveltyPass : true;
  const utilityOk = utility ? utility.defined === true : (extras && extras.requireUtility === true ? false : true);
  const ownerOk = extras && extras.ownerAuthorized != null ? extras.ownerAuthorized : false;
  const gates = [
    gateRecord("provenance_valid", provenance, provenance ? "source and excerpt present" : "missing source or excerpt"),
    gateRecord("source_content_substantive", substantive, substantive ? "excerpt is substantive" : "source content is chrome or non-substantive"),
    gateRecord("source_support_valid", supportValid, support && support.note),
    gateRecord("objective_relevant", objectiveOk, objectiveOk ? "on objective" : "off objective"),
    gateRecord("workspace_relevant", workspaceOk, workspaceOk ? "workspace relevant" : "not workspace relevant"),
    gateRecord("role_relevant", roleOk, roleOk ? "role allowed" : "role not allowed"),
    gateRecord("knowledge_type_allowed", typeOk, typeOk ? "trainable kind" : "kind not trainable"),
    gateRecord("novelty_or_material_refinement", noveltyGate, noveltyGate ? "new or material refinement" : "duplicate/corroboration only"),
    gateRecord("expected_utility_defined", utilityOk, utilityOk ? "consuming task defined" : "no plausible consuming task"),
    gateRecord("owner_authorized", ownerOk, ownerOk ? "owner authorized" : "owner not yet authorized"),
  ];
  return { gates: gates, support: support, allHardPass: gates.filter((g) => g.name !== "owner_authorized" && g.name !== "expected_utility_defined").every((g) => g.pass) };
}

export function reviewOneFinding(candidate, existingItems, objectiveText, extras) {
  const claim = candidateText(candidate);
  const excerpt = candidateExcerpt(candidate);
  const inferred = inferFindingTopicSignal(claim);
  const topic = candidate.topic || inferred.topic;
  const signal = candidate.signal || inferred.signal;
  const flags = candidate.flags || [];
  const gateExtras = { ...(extras || {}), objectiveText: objectiveText };
  const gated = evaluateGates(candidate, gateExtras);

  function row(outcome, extra) {
    return {
      outcome: outcome,
      matchedId: extra && extra.matchedId != null ? extra.matchedId : null,
      score: extra && extra.score != null ? extra.score : 0,
      topic: topic,
      signal: signal,
      affectsConfidence: Boolean(extra && extra.affectsConfidence),
      explanation: (extra && extra.explanation) || outcome,
      gates: gated.gates,
      support: gated.support,
      overall: outcome,
    };
  }

  if (looksLikeBoilerplate(excerpt) || looksLikeA11yChrome(excerpt) || looksLikeVideoPlaceholder(excerpt) || flags.includes("boilerplate")) {
    return row("boilerplate_or_non_substantive", {
      explanation: "Excerpt is page chrome or boilerplate (for example Skip to Content). Low similarity is not usefulness. Cannot train solely because unique.",
    });
  }
  if (!excerpt || excerpt.length < 8 || flags.includes("missing_support")) {
    return row("insufficiently_supported", {
      explanation: "Finding lacks a supporting excerpt and is not eligible for training.",
    });
  }
  if (gated.support && !gated.support.valid && gated.support.supportStatus === "excerpt_boilerplate") {
    return row("boilerplate_or_non_substantive", { explanation: gated.support.note });
  }
  if (gated.support && gated.support.supportStatus === "unsupported_inference_as_fact") {
    return row("unsupported_inference", { explanation: "Inference must not be presented as what the source said." });
  }
  if (gated.support && !gated.support.valid) {
    return row("insufficient_source_support", { explanation: gated.support.note });
  }
  if (flags.includes("unsupported_numbers")) {
    return row("insufficiently_supported", {
      explanation: "Claim contains numbers that are not supported by the excerpt.",
    });
  }
  if (objectiveText && !onObjective(claim, objectiveText, extras && extras.brief)) {
    return row("irrelevant_to_objective", { explanation: "Finding is off the stated objective. Shared industry nouns are not relevance." });
  }
  const candTokens = tokenSet(claim + " " + excerpt);
  let best = { score: 0, item: null };
  for (const item of existingItems || []) {
    const stmt = String(item.statement || "");
    const itemTokens = tokenSet(stmt + " " + String((item.locator && item.locator.text) || item.excerpt || ""));
    const score = jaccard(candTokens, itemTokens);
    const itemInf = inferFindingTopicSignal(stmt);
    const sameTopic = topic && (topic === item.topic || topic === itemInf.topic);
    const sameSignal = signal && (signal === item.signal || signal === itemInf.signal);
    const adjusted = score + (sameTopic ? 0.08 : 0) + (sameSignal ? 0.08 : 0);
    if (adjusted > best.score) best = { score: adjusted, item: item, raw: score, sameTopic: sameTopic, sameSignal: sameSignal };
  }
  if (!best.item || best.score < 0.22) {
    if (objectiveText && !onObjective(claim, objectiveText, extras && extras.brief)) {
      return row("irrelevant_to_objective", {
        score: best.score,
        explanation: "No existing match and the claim is not on the objective.",
      });
    }
    if (extras && extras.requireUtility && !(candidate.utility && candidate.utility.defined)) {
      return row("owner_review_required", {
        score: best.score,
        explanation: "Novel text without a defined consuming task is not training-eligible.",
      });
    }
    return row("genuinely_new", {
      score: best.score,
      affectsConfidence: true,
      explanation: "No sufficiently similar approved workspace knowledge exists. Novelty is necessary but not sufficient until other gates pass.",
    });
  }
  const existingClaim = String(best.item.statement || "");
  const candPol = polarity(claim);
  const existPol = polarity(existingClaim);
  if (best.sameTopic && candPol !== existPol) {
    return row("conflicts_with_existing", {
      matchedId: best.item.id,
      score: best.score,
      affectsConfidence: true,
      explanation: "Opposite polarity on the same topic as " + best.item.id + ". Owner review required; do not silently replace.",
    });
  }
  const extra = tokenize(claim).filter((t) => !tokenSet(existingClaim).has(t));
  const refineCue = /\b(only|except|unless|when|if|provided that|must also|clarif)\b/i.test(claim);
  if (best.score >= 0.72 || (best.sameTopic && best.sameSignal && best.raw >= 0.55)) {
    return row("duplicate_existing", {
      matchedId: best.item.id,
      score: best.score,
      explanation: "Near-duplicate of existing approved knowledge " + best.item.id + ". Do not create a new Atlas version.",
    });
  }
  if (refineCue && extra.length >= 2 && (best.sameTopic || best.score >= 0.4)) {
    return row("refines_existing", {
      matchedId: best.item.id,
      score: best.score,
      affectsConfidence: true,
      explanation: "Refines " + best.item.id + " by adding constraints or conditions: " + extra.slice(0, 8).join(", ") + ".",
    });
  }
  if (best.sameTopic || best.sameSignal || best.score >= 0.35) {
    return row("corroborates_existing", {
      matchedId: best.item.id,
      score: best.score,
      explanation: "Corroborates existing approved knowledge " + best.item.id + ". Record corroboration; do not auto-create a version.",
    });
  }
  return row("genuinely_new", {
    matchedId: best.item ? best.item.id : null,
    score: best.score,
    affectsConfidence: true,
    explanation: "Overlap with existing knowledge is too weak to treat as a duplicate. Novelty still requires other gates.",
  });
}

function normalizeOutcome(outcome) {
  if (outcome === "genuinely_new") return "eligible_new_knowledge";
  if (outcome === "refines_existing") return "materially_refines_existing";
  if (outcome === "insufficiently_supported") return "insufficient_source_support";
  return outcome;
}

export function evaluateKnowledgeUsefulness(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required for usefulness review.");
  const objectiveText = (payload && (payload.objectiveText || payload.ownerText)) || "";
  const candidates = (payload && (payload.findings || payload.items)) || [];
  const candidateFindingIds = new Set(candidates.map((c) => c && c.id).filter(Boolean));
  const candidateItemIds = new Set(candidates.flatMap((c) => [c && c.knowledgeItemId, c && c.id]).filter(Boolean));
  const existing = existingApproved(store, workspaceId).filter((k) => {
    if (k && k.scoutFindingId && candidateFindingIds.has(k.scoutFindingId)) return false;
    if (k && candidateItemIds.has(k.id)) return false;
    return true;
  });
  const reviews = [];
  for (const c of candidates) {
    const kind = c && c.kind;
    if (kind === "unresolved_question" || kind === "owner_policy_suggestion") {
      reviews.push({
        id: c.id || null,
        outcome: kind === "unresolved_question" ? "insufficiently_supported" : "irrelevant_to_objective",
        overall: kind === "unresolved_question" ? "insufficient_source_support" : "irrelevant_to_objective",
        matchedId: null,
        score: 0,
        topic: c.topic || null,
        signal: c.signal || null,
        affectsConfidence: false,
        explanation: kind === "unresolved_question"
          ? "Unresolved questions are not Atlas training material."
          : "A suggestion is not owner policy and is not Atlas training material.",
        gates: evaluateGates(c, { objectiveText: objectiveText, ownerAuthorized: false }).gates,
      });
      continue;
    }
    const source = c.sourceId && store.getSource ? store.getSource(c.sourceId) : null;
    const sourceText = (c.sourceText) || (source && (source.substantiveText || source.excerpt)) || c.excerpt;
    const row = reviewOneFinding(c, existing, objectiveText, {
      sourceText: sourceText,
      extraction: c.extraction,
      utility: c.utility || (payload && payload.utility),
      requireUtility: Boolean(payload && payload.requireUtility),
      ownerAuthorized: Boolean(payload && payload.ownerAuthorized),
      workspaceText: payload && payload.workspaceText,
      brief: payload && payload.brief,
    });
    if (row.outcome === "genuinely_new") {
      const hard = (row.gates || []).filter((g) => !["owner_authorized", "expected_utility_defined", "novelty_or_material_refinement"].includes(g.name));
      if (hard.some((g) => !g.pass)) {
        row.outcome = hard.find((g) => g.name === "source_content_substantive" && !g.pass)
          ? "boilerplate_or_non_substantive"
          : (hard.find((g) => g.name === "source_support_valid" && !g.pass) ? "insufficient_source_support" : row.outcome);
      }
    }
    row.overall = normalizeOutcome(row.outcome);
    reviews.push({ id: c.id || null, knowledgeItemId: c.knowledgeItemId || c.id || null, ...row });
  }
  const conflicts = reviews.filter((r) => r.outcome === "conflicts_with_existing");
  const blocked = reviews.filter((r) => [
    "boilerplate_or_non_substantive", "insufficient_source_support", "insufficiently_supported",
    "unsupported_inference", "irrelevant_to_objective",
  ].includes(r.outcome));
  const meaningful = reviews.filter((r) =>
    (r.outcome === "genuinely_new" || r.outcome === "eligible_new_knowledge" || r.outcome === "refines_existing" || r.outcome === "materially_refines_existing"
      || (r.outcome === "corroborates_existing" && r.affectsConfidence === true))
    && !blocked.includes(r)
  ).filter((r) => r.outcome !== "boilerplate_or_non_substantive" && r.outcome !== "insufficient_source_support");
  const duplicates = reviews.filter((r) => r.outcome === "duplicate_existing" || (r.outcome === "corroborates_existing" && !r.affectsConfidence));
  let skipReason = null;
  let shouldTrain = false;
  if (blocked.length && !meaningful.length) {
    skipReason = blocked.some((r) => r.outcome === "boilerplate_or_non_substantive") ? "boilerplate_or_non_substantive" : "no_meaningful_change";
  } else if (conflicts.length && !meaningful.length) {
    skipReason = "conflict_needs_owner_review";
  } else if (!meaningful.length) {
    skipReason = duplicates.length ? "duplicate_or_corroboration_only" : "no_meaningful_change";
  } else {
    shouldTrain = true;
  }
  const record = {
    id: (payload && payload.id) || ("USE-" + nowIso().replace(/[:.]/g, "")),
    workspaceId: workspaceId,
    objectiveId: (payload && payload.objectiveId) || null,
    createdAt: nowIso(),
    reviews: reviews,
    shouldTrain: shouldTrain,
    warranted: shouldTrain,
    skipReason: skipReason,
    outcomes: Object.fromEntries(USEFULNESS_OUTCOMES.map((o) => [o, reviews.filter((r) => r.outcome === o || r.overall === o).length])),
    gates: USEFULNESS_GATES.slice(),
    note: shouldTrain
      ? "Meaningful change warrants a candidate Atlas version after shadow compile. Creating a version is not promotion or serving."
      : "Retraining skipped. Keep the existing Atlas version. " + (skipReason || "no_meaningful_change"),
  };
  if (store && store.putUsefulnessReview) store.putUsefulnessReview(record);
  return record;
}

export function shouldCreateAtlasVersion(review) {
  return Boolean(review && review.shouldTrain === true && review.warranted === true);
}

export function ownerCannotOverrideEvidence(support) {
  if (!support) return { allowed: false, reason: "missing_support_record" };
  if (!support.valid || !support.eligibleAsSourceBackedFact) {
    return {
      allowed: false,
      reason: support.supportStatus || "hard_evidence_failure",
      note: "Approving cannot convert unsupported webpage text into a supported external fact.",
    };
  }
  return { allowed: true };
}
