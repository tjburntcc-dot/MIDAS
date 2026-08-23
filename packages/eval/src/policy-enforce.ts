import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.js";
import { buildApplicabilityTraces, evaluateApplicability, contractFromItem } from "./applicability.js";
import { analyzeRuntimeCase } from "./retrieve-v2.js";

export const POLICY_CONFLICT_TYPES = [
  "invalid_disqualifier",
  "invalid_qualification",
  "missing_required_research",
  "unsupported_rule_application",
  "prohibited_action",
];

export const POLICY_INVARIANTS = [
  "hard_dq_only_if_conditions_satisfied",
  "not_satisfied_cannot_dq",
  "unknown_mandatory_not_confirmed",
  "unknown_mandatory_needs_research",
  "confirmed_opt_out_blocks_outreach",
  "confirmed_protected_can_exclude",
  "non_protected_not_excluded_for_other",
  "exceptions_before_hard_enforce",
  "scope_cannot_leak",
  "removing_invalid_dq_does_not_auto_qualify",
  "compliant_classification_not_overwritten",
];

export const ADVERSARIAL_FIXTURE_PATH = join(
  REPO_ROOT,
  "evals/atlas/v0/applicability/atlas_policy_adversarial_v0.jsonl",
);
export const ADVERSARIAL_FIXTURE_MANIFEST = join(
  REPO_ROOT,
  "evals/atlas/v0/applicability/atlas_policy_adversarial_v0.manifest.json",
);

const GOLD_LEAK = new RegExp("ranked_tiers|required_unknowns|\"gold\"\\s*:|hidden answer key", "i");
const OWNER_SRC = new RegExp("^SRC-OWN-");
const PROTECTED_RE = new RegExp("protected|existing.customer|lockout", "i");
const OPT_OUT_RE = new RegExp("opt-?out|opted.out|suppression|do not contact", "i");
const OTHER_ACCOUNT_RE = new RegExp("another account|other account|similar name|same company|sibling|looks like|name match", "i");

function asList(v) {
  return Array.isArray(v) ? v : [];
}

function factMissing(v) {
  return v === null || v === undefined || v === "";
}

function isOwnerPolicyItem(item) {
  if (!item) return false;
  const sid = String(item.sourceId || "");
  if (OWNER_SRC.test(sid)) return true;
  return item.claimKind === "owner_policy";
}

function armMayUseOwnerPolicy(arm) {
  return arm === "relevant" || arm === "oracle";
}

function usableItems(items, arm) {
  const rows = asList(items);
  if (armMayUseOwnerPolicy(arm)) return rows;
  return rows.filter((item) => !isOwnerPolicyItem(item));
}


const OWNER_FAMILY_BY_SOURCE = {
  "SRC-OWN-001": "qualification_thresholds",
  "SRC-OWN-002": "buyer_authority",
  "SRC-OWN-003": "signal_freshness",
  "SRC-OWN-004": "territory",
  "SRC-OWN-005": "protected_accounts",
  "SRC-OWN-006": "unit_economics",
  "SRC-OWN-007": "signal_freshness",
  "SRC-OWN-008": "protected_accounts",
};

export function ownerFamilyOf(item, contract) {
  if (item && item.competency) return item.competency;
  const sid = String((item && item.sourceId) || "");
  if (OWNER_FAMILY_BY_SOURCE[sid]) return OWNER_FAMILY_BY_SOURCE[sid];
  const blob = (String((item && item.statement) || "") + " " + String((contract && contract.scope) || "")).toLowerCase();
  if (/monthly spend|2500 usd|employee count|eight employees|united states accounts/.test(blob)) return "qualification_thresholds";
  if (/buyer authority|job title is not proof/.test(blob)) return "buyer_authority";
  if (/stale|hiring signal|freeze/.test(blob)) return "signal_freshness";
  if (/pacific northwest|served region/.test(blob)) return "territory";
  if (new RegExp("existing customer|public-sector|government vertical|lockout").test(blob)) return "protected_accounts";
  if (/payback|seat|unit economic/.test(blob)) return "unit_economics";
  return null;
}

export function namedPolicyFamiliesFromInput(runtime) {
  if (!runtime) return [];
  const analysis = analyzeRuntimeCase({
    title: runtime.title,
    offer: runtime.offer,
    qualification_policy: runtime.qualification_policy || runtime.qualificationPolicy,
    constraints: runtime.constraints,
    prospects: runtime.prospects || [],
  });
  return (analysis.families || []).map((f) => f.family);
}

function pairFor(classification) {
  if (classification === "qualified") return { next_action: "prioritize_outreach", disqualification_reason: null };
  if (classification === "disqualified") return { next_action: "exclude", disqualification_reason: "Confirmed hard disqualifier conditions are satisfied." };
  return { next_action: "research_first", disqualification_reason: null };
}

function proposalOf(assessment) {
  if (!assessment) {
    return {
      classification: "needs_research",
      next_action: "research_first",
      reasoning: "",
      cited_evidence_ids: [],
      missing_information: [],
      disqualification_reason: null,
      fit_score: 40,
    };
  }
  return {
    classification: assessment.classification,
    next_action: assessment.next_action,
    reasoning: String(assessment.rationale || ""),
    cited_evidence_ids: asList(assessment.cited_evidence_ids),
    missing_information: asList(assessment.missing_information),
    disqualification_reason: assessment.disqualification_reason == null ? null : String(assessment.disqualification_reason),
    fit_score: assessment.fit_score == null ? 40 : Number(assessment.fit_score),
  };
}


const FIELD_ALIASES = {
  modeled_payback_months: ["payback_months"],
  seller_capacity_accounts: ["capacity_slots"],
};

function prospectHasField(facts, field) {
  if (!field || !facts || typeof facts !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(facts, field)) return true;
  for (const alt of FIELD_ALIASES[field] || []) {
    if (Object.prototype.hasOwnProperty.call(facts, alt)) return true;
  }
  return false;
}

function ruleInScope(contract, prospect) {
  const facts = (prospect && prospect.facts) || {};
  const conds = asList(contract && contract.requiredConditions);
  if (!conds.length) return false;
  const fields = conds.map((c) => c.field).filter(Boolean);
  if (!fields.length) return true;
  return fields.some((f) => prospectHasField(facts, f));
}

function familyApplicable(item, contract, namedFamilies) {
  if (!namedFamilies || !namedFamilies.length) return true;
  const family = ownerFamilyOf(item, contract);
  if (!family) return true;
  return namedFamilies.includes(family);
}

export function evaluatePolicyForProspect(args) {
  const prospect = args.prospect || {};
  const facts = prospect.facts || {};
  const arm = args.arm || "relevant";
  const items = usableItems(args.knowledgeItems, arm);
  const traces = asList(args.traces).filter((t) => t && t.prospect_id === prospect.id);
  const namedFamilies = args.namedFamilies || namedPolicyFamiliesFromInput({
    title: args.title,
    offer: args.offer,
    qualification_policy: args.qualificationPolicy,
    constraints: args.constraints,
    prospects: [prospect],
  });
  const relevantRules = [];
  const satisfied = [];
  const unmet = [];
  const unknown = [];
  const exceptions = [];
  const authoritativeEffects = [];

  for (const item of items) {
    const contract = contractFromItem(item);
    if (!contract) continue;
    const ev = evaluateApplicability(contract, prospect);
    ev.knowledge_item_id = item.id;
    const inScope = ruleInScope(contract, prospect);
    const famOk = familyApplicable(item, contract, namedFamilies);
    const family = ownerFamilyOf(item, contract);
    let hard = Boolean(ev.hard_exclude) && famOk;
    let suggested = ev.suggested_next_action;
    if (!famOk && ev.hard_exclude) suggested = "ignore";
    relevantRules.push({
      knowledge_item_id: item.id,
      sourceId: item.sourceId || null,
      statement: item.statement || null,
      applicability: ev.applicability,
      effect: ev.effect,
      hard_exclude: hard,
      exception: ev.exception,
      unmet_conditions: ev.unmet_conditions,
      supporting_evidence_ids: ev.supporting_evidence_ids,
      suggested_next_action: suggested,
      priority: ev.priority,
      scope: ev.scope,
      unknown_behavior: ev.unknown_behavior,
      in_scope: inScope,
      family: family,
      family_applicable: famOk,
      inapplicable_family: inScope && !famOk,
    });
    if (!inScope) continue;
    if (ev.applicability === "satisfied") satisfied.push(item.id);
    else if (ev.applicability === "not_satisfied") unmet.push(item.id);
    else unknown.push(item.id);
    if (ev.exception) exceptions.push({ knowledge_item_id: item.id, exception: ev.exception });
    if (hard) authoritativeEffects.push({ knowledge_item_id: item.id, effect: "exclude", reason: "hard_exclude" });
    else if (famOk && ev.applicability === "unknown" && ev.unknown_behavior === "research_first") {
      authoritativeEffects.push({ knowledge_item_id: item.id, effect: "research_first", reason: "unknown_mandatory" });
    } else if (famOk && ev.applicability === "satisfied" && ev.effect === "research_first") {
      authoritativeEffects.push({ knowledge_item_id: item.id, effect: "research_first", reason: "rule_requires_research" });
    }
  }

  const scopedRules = relevantRules.filter((r) => r.in_scope !== false);
  const hard = scopedRules.filter((r) => r.hard_exclude && r.family_applicable !== false).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const researchRules = scopedRules.filter((r) => r.suggested_next_action === "research_first" && !r.hard_exclude && r.family_applicable !== false);
  const notSatExclude = scopedRules.filter((r) => r.effect === "exclude" && r.applicability === "not_satisfied");
  const unknownExclude = scopedRules.filter((r) => r.effect === "exclude" && r.applicability === "unknown");
  const exceptionHits = scopedRules.filter((r) => r.exception);
  const confirmedOptOut = facts.opted_out === true || facts.suppressed === true || facts.suppression === true;
  const confirmedProtected = hard.some((r) => PROTECTED_RE.test(String(r.statement || "") + " " + String(r.scope || "") + " " + String(r.knowledge_item_id || "")));
  const namedPolicyMissing = namedOwnerPolicyRequired(args.qualificationPolicy) && !armMayUseOwnerPolicy(arm);

  const confirmedHardDq = confirmedOptOut || hard.length > 0;
  const mandatoryUnknown =
    (!confirmedHardDq && (unknownExclude.length > 0 || researchRules.length > 0));
  const allMandatorySatisfied =
    !confirmedHardDq &&
    !mandatoryUnknown &&
    unknownExclude.length === 0 &&
    researchRules.length === 0 &&
    armMayUseOwnerPolicy(arm);

  return {
    prospect_id: prospect.id,
    arm: arm,
    relevant_rules: relevantRules,
    applicability: traces.length ? traces : relevantRules,
    satisfied_conditions: satisfied,
    unmet_conditions: unmet,
    unknown_conditions: unknown,
    exceptions: exceptions,
    authoritative_effects: authoritativeEffects,
    confirmed_hard_dq: confirmedHardDq,
    confirmed_opt_out: confirmedOptOut,
    confirmed_protected: confirmedProtected,
    not_satisfied_exclude_rules: notSatExclude.map((r) => r.knowledge_item_id),
    unknown_exclude_rules: unknownExclude.map((r) => r.knowledge_item_id),
    exception_hits: exceptionHits.map((r) => r.knowledge_item_id),
    mandatory_unknown: mandatoryUnknown,
    all_mandatory_satisfied: allMandatorySatisfied,
    named_policy_missing: namedPolicyMissing,
    owner_policy_available: armMayUseOwnerPolicy(arm),
    named_families: namedFamilies,
  };
}

function namedOwnerPolicyRequired(policy) {
  const req = asList(policy && policy.required);
  const dq = asList(policy && policy.disqualifiers);
  const blob = (req.concat(dq)).join(" ");
  return /owner policy/i.test(blob);
}

export function latticeFallback(policyEval) {
  if (policyEval.confirmed_hard_dq) {
    return {
      classification: "disqualified",
      next_action: "exclude",
      reason: "confirmed hard disqualifier conditions are satisfied",
      invariant: "hard_dq_only_if_conditions_satisfied",
    };
  }
  if (policyEval.mandatory_unknown) {
    return {
      classification: "needs_research",
      next_action: "research_first",
      reason: "mandatory information is unknown; research is required",
      invariant: "unknown_mandatory_needs_research",
    };
  }
  if (policyEval.all_mandatory_satisfied) {
    return {
      classification: "qualified",
      next_action: "prioritize_outreach",
      reason: "applicable mandatory conditions are satisfied and no hard disqualifier holds",
      invariant: "hard_dq_only_if_conditions_satisfied",
    };
  }
  return {
    classification: "needs_research",
    next_action: "research_first",
    reason: "contradictory or insufficient applicable mandatory information",
    invariant: "unknown_mandatory_needs_research",
  };
}

function addConflict(out, type, invariant, reason, extra) {
  if (!POLICY_CONFLICT_TYPES.includes(type)) return;
  out.push({
    "type": type,
    invariant: invariant,
    reason: reason,
    ...(extra || {}),
  });
}

export function detectConflicts(args) {
  const proposal = args.proposal || {};
  const ev = args.policyEval || {};
  const prospect = args.prospect || {};
  const facts = prospect.facts || {};
  const conflicts = [];
  const cls = proposal.classification;
  const action = proposal.next_action;
  const reasonText = String(proposal.reasoning || "") + " " + String(proposal.disqualification_reason || "");
  const excluded = cls === "disqualified" || action === "exclude";
  const qualified = cls === "qualified" || action === "prioritize_outreach";
  const researched = cls === "needs_research" || action === "research_first";

  function reasonCitesRule(ruleId) {
    const rule = asList(ev.relevant_rules).find((r) => r.knowledge_item_id === ruleId);
    const stmt = String((rule && (rule.statement || rule.scope || "")) || ruleId).toLowerCase();
    const tokens = stmt.split(/[^a-z0-9]+/).filter((w) => w.length > 4);
    const blob = reasonText.toLowerCase();
    if (blob.includes(String(ruleId).toLowerCase())) return true;
    return tokens.some((tok) => blob.includes(tok));
  }
  if (excluded && !ev.confirmed_hard_dq) {
    const citedNotSat = asList(ev.not_satisfied_exclude_rules).filter(reasonCitesRule);
    if (citedNotSat.length) {
      addConflict(conflicts, "invalid_disqualifier", "not_satisfied_cannot_dq", "A not_satisfied rule cannot be a disqualification reason.", {
        rules: citedNotSat,
      });
    } else if (ev.unknown_exclude_rules && ev.unknown_exclude_rules.length) {
      addConflict(conflicts, "invalid_disqualifier", "unknown_mandatory_not_confirmed", "Unknown mandatory conditions were treated as a confirmed disqualifier.", {
        rules: ev.unknown_exclude_rules,
      });
    } else if (ev.owner_policy_available && !ev.confirmed_hard_dq) {
      addConflict(conflicts, "invalid_disqualifier", "hard_dq_only_if_conditions_satisfied", "Hard exclusion without satisfied required conditions.", {});
    }
  }

  if (excluded && ev.exception_hits && ev.exception_hits.length && !ev.confirmed_opt_out) {
    addConflict(conflicts, "unsupported_rule_application", "exceptions_before_hard_enforce", "A documented exception was ignored before hard enforcement.", {
      rules: ev.exception_hits,
    });
  }

  if (qualified && ev.confirmed_hard_dq) {
    addConflict(conflicts, "invalid_qualification", "hard_dq_only_if_conditions_satisfied", "Prospect was qualified despite a confirmed hard disqualifier.", {});
  }

  if (ev.confirmed_opt_out && (qualified || action === "prioritize_outreach")) {
    addConflict(conflicts, "prohibited_action", "confirmed_opt_out_blocks_outreach", "Confirmed opt-out or suppression blocks outreach.", {});
  }

  if (ev.confirmed_protected && qualified) {
    addConflict(conflicts, "invalid_qualification", "confirmed_protected_can_exclude", "Confirmed protected account was qualified for outreach.", {});
  }

  if (excluded && ev.not_satisfied_exclude_rules && ev.not_satisfied_exclude_rules.length && OTHER_ACCOUNT_RE.test(reasonText)) {
    addConflict(conflicts, "unsupported_rule_application", "non_protected_not_excluded_for_other", "An explicitly non-protected account was excluded because another account is protected.", {});
  }

  if (excluded && ev.not_satisfied_exclude_rules && ev.not_satisfied_exclude_rules.length && /territor|region|family|period|pacific northwest/i.test(reasonText) && !ev.confirmed_hard_dq) {
    addConflict(conflicts, "unsupported_rule_application", "scope_cannot_leak", "A scoped rule was applied outside its account, territory, family, or period.", {});
  }

  if (!researched && ev.mandatory_unknown && !ev.confirmed_hard_dq) {
    addConflict(conflicts, "missing_required_research", "unknown_mandatory_needs_research", "Unknown mandatory qualification information requires research_first.", {});
  }

  if (qualified && ev.mandatory_unknown) {
    addConflict(conflicts, "invalid_qualification", "unknown_mandatory_not_confirmed", "Unknown mandatory information was treated as confirmed qualification.", {});
  }

  for (const [field, value] of Object.entries(facts)) {
    if (!factMissing(value)) continue;
    const fieldRe = new RegExp("\\b" + String(field).replace(/_/g, "[_ ]") + "\\b", "i");
    if (excluded && fieldRe.test(reasonText) && /is|confirmed|established|proved/.test(reasonText)) {
      addConflict(conflicts, "invalid_disqualifier", "unknown_mandatory_not_confirmed", "A missing fact was treated as a confirmed disqualifier: " + field, { field: field });
    }
  }

  if ((cls === "qualified" && action && action !== "prioritize_outreach") || (cls === "needs_research" && action && action !== "research_first") || (cls === "disqualified" && action && action !== "exclude")) {
    addConflict(conflicts, "prohibited_action", "hard_dq_only_if_conditions_satisfied", "Classification and next_action pairing is invalid.", {});
  }

  if (ev.confirmed_opt_out && !excluded) {
    addConflict(conflicts, "prohibited_action", "confirmed_opt_out_blocks_outreach", "Confirmed opt-out must exclude.", {});
  }

  return conflicts;
}

function servedAssessment(proposal, lattice, conflicts, policyEval, prospect) {
  const original = proposalOf(proposal);
  const intervened = conflicts.length > 0;
  let classification = original.classification;
  let next = original.next_action;
  let reason = original.reasoning;
  let dq = original.disqualification_reason;
  let missing = original.missing_information.slice();
  let interventionReason = null;

  if (intervened) {
    classification = lattice.classification;
    next = lattice.next_action;
    interventionReason = conflicts.map((c) => c.invariant + ": " + c.reason).join(" | ");
    reason = "Policy enforcement overrode the model proposal. Original classification was " + original.classification + " / " + original.next_action + ". " + lattice.reason + ". Original reasoning (not authoritative): " + (original.reasoning || "(none)");
    if (classification === "disqualified") {
      dq = policyEval.confirmed_opt_out
        ? "Confirmed opt-out or suppression record."
        : "Confirmed hard disqualifier conditions are satisfied.";
    } else {
      dq = null;
    }
    if (classification === "needs_research") {
      const fields = [];
      for (const [k, v] of Object.entries((prospect && prospect.facts) || {})) {
        if (factMissing(v)) fields.push(k);
      }
      if (!fields.length) fields.push("applicable_policy_conditions");
      missing = [...new Set(fields.concat(missing))];
    }
  }

  const pair = pairFor(classification);
  if (classification === "disqualified") {
    next = "exclude";
    if (!dq || String(dq).length < 5) dq = pair.disqualification_reason;
  } else {
    next = pair.next_action;
    dq = null;
  }

  const cited = original.cited_evidence_ids.filter((id) => {
    const ok = new Set(asList(prospect && prospect.evidence).map((e) => e.id));
    return ok.has(id);
  });

  return {
    prospect_id: prospect.id,
    classification: classification,
    fit_score: classification === "qualified" ? Math.max(60, original.fit_score || 0) : classification === "disqualified" ? Math.min(25, original.fit_score || 15) : Math.min(50, original.fit_score || 40),
    cited_evidence_ids: cited,
    rationale: reason.length >= 12 ? reason : (reason + " Policy lattice applied.").slice(0, 400),
    missing_information: missing,
    next_action: next,
    disqualification_reason: dq,
    enforcement_intervened: intervened,
    intervention_reason: interventionReason,
    why_safe: whySafe(classification, policyEval, conflicts),
  };
}

function whySafe(classification, policyEval, conflicts) {
  if (policyEval.confirmed_opt_out) return "Confirmed opt-out or suppression is a hard stop; outreach is blocked.";
  if (classification === "disqualified" && policyEval.confirmed_hard_dq) return "Hard exclusion only after required conditions were satisfied on this account.";
  if (classification === "needs_research") return "Unknown or unmet mandatory conditions stay unknown; research is required. Invalid disqualifiers were not turned into a qualification.";
  if (classification === "qualified") return "No confirmed hard disqualifier applies to this account; not_satisfied and unknown rules were not used as exclusions.";
  return "Served decision follows the policy lattice. Original proposal remains visible.";
}

export function assembleServedOutput(caseId, assessments, originalOutput) {
  const ranked = [];
  const research = [];
  const excluded = [];
  const seenQ = new Set();
  for (const id of asList(originalOutput && originalOutput.ranked_qualified_ids)) {
    const a = assessments.find((x) => x.prospect_id === id);
    if (a && a.classification === "qualified" && !seenQ.has(id)) {
      ranked.push(id);
      seenQ.add(id);
    }
  }
  for (const a of assessments) {
    if (a.classification === "qualified" && !seenQ.has(a.prospect_id)) {
      ranked.push(a.prospect_id);
      seenQ.add(a.prospect_id);
    }
    if (a.classification === "needs_research") research.push(a.prospect_id);
    if (a.classification === "disqualified") excluded.push(a.prospect_id);
  }
  const uncertainties = asList(originalOutput && originalOutput.case_uncertainties).slice();
  for (const a of assessments) {
    if (a.enforcement_intervened && a.intervention_reason) {
      const line = "Enforcement overrode " + a.prospect_id + " (original not authoritative).";
      if (!uncertainties.includes(line)) uncertainties.push(line);
    }
  }
  return {
    case_id: caseId,
    assessments: assessments.map((a) => ({
      prospect_id: a.prospect_id,
      classification: a.classification,
      fit_score: Number.isInteger(a.fit_score) ? a.fit_score : Math.round(Number(a.fit_score) || 40),
      cited_evidence_ids: asList(a.cited_evidence_ids),
      rationale: String(a.rationale || "Policy lattice applied to this prospect."),
      missing_information: asList(a.missing_information),
      next_action: a.next_action,
      disqualification_reason: a.disqualification_reason,
    })),
    ranked_qualified_ids: ranked,
    research_queue_ids: research,
    excluded_ids: excluded,
    case_uncertainties: uncertainties.length ? uncertainties : ["Policy enforcement recorded."],
  };
}

export function buildPolicyRepairPayload(args) {
  const evs = asList(args.policyEvaluations);
  const conflicts = asList(args.conflicts);
  const payload = {
    notice: "Your previous structured output contradicted inspectable policy. Return one corrected JSON object. Evaluator labels are not provided.",
    runtime_case: {
      case_id: args.runtimeInput && args.runtimeInput.case_id,
      title: args.runtimeInput && args.runtimeInput.title,
      qualification_policy: args.runtimeInput && args.runtimeInput.qualification_policy,
      constraints: args.runtimeInput && args.runtimeInput.constraints,
      prospects: asList(args.runtimeInput && args.runtimeInput.prospects).map((p) => ({
        id: p.id,
        company: p.company,
        facts: p.facts,
        evidence: p.evidence,
      })),
    },
    original_proposal: asList(args.originalProposal && args.originalProposal.assessments).map((a) => ({
      prospect_id: a.prospect_id,
      classification: a.classification,
      next_action: a.next_action,
      rationale: a.rationale,
      cited_evidence_ids: a.cited_evidence_ids,
      missing_information: a.missing_information,
      disqualification_reason: a.disqualification_reason,
    })),
    policy_trace: evs.map((e) => ({
      prospect_id: e.prospect_id,
      relevant_rules: e.relevant_rules,
      confirmed_hard_dq: e.confirmed_hard_dq,
      mandatory_unknown: e.mandatory_unknown,
      exceptions: e.exceptions,
      authoritative_effects: e.authoritative_effects,
    })),
    violated_invariants: [...new Set(conflicts.map((c) => c.invariant).filter(Boolean))],
    conflicts: conflicts.map((c) => ({ "type": c.type, invariant: c.invariant, reason: c.reason, prospect_id: c.prospect_id })),
    allowed_constraints: [
      "Hard exclude only when required conditions are satisfied.",
      "A not_satisfied rule cannot be a disqualification reason.",
      "Unknown mandatory information is not confirmed and requires research_first.",
      "Confirmed opt-out or suppression blocks outreach.",
      "A documented exception must be evaluated before hard enforcement.",
      "Scope must not leak across account, territory, family, or period.",
      "Removing an invalid disqualifier does not auto-qualify when other mandatory facts are unknown.",
    ],
  };
  const json = JSON.stringify(payload);
  if (GOLD_LEAK.test(json)) {
    throw new Error("policy repair payload leaked evaluator gold");
  }
  return payload;
}


export function mergeRepairPreservingCompliant(first, second, runtimeInput) {
  const firstBy = Object.fromEntries(asList(first && first.per_prospect).map((p) => [p.prospect_id, p]));
  const mergedPer = [];
  const servedAssessments = [];
  for (const row of asList(second && second.per_prospect)) {
    const orig = firstBy[row.prospect_id];
    const origConflicts = asList(orig && orig.policy_conflicts);
    const origComplies = Boolean(orig) && origConflicts.length === 0;
    if (origComplies) {
      const kept = {
        ...orig,
        repair_ignored: true,
        repair_note: "Original classification already complied with authoritative rules and was not overwritten by repair.",
      };
      mergedPer.push(kept);
      servedAssessments.push({
        ...(orig.served_decision || {}),
        enforcement_intervened: Boolean(orig.served_decision && orig.served_decision.enforcement_intervened),
        intervention_reason: orig.served_decision && orig.served_decision.intervention_reason,
        why_safe: (orig.served_decision && orig.served_decision.why_safe) || "Compliant original was preserved.",
        rationale: orig.served_decision && orig.served_decision.rationale,
      });
    } else {
      mergedPer.push({
        ...row,
        model_proposal: (orig && orig.model_proposal) || row.model_proposal,
        original_conflicts: origConflicts,
      });
      servedAssessments.push(row.served_decision);
    }
  }
  const servedOutput = assembleServedOutput(
    (runtimeInput && runtimeInput.case_id) || (second && second.servedOutput && second.servedOutput.case_id),
    servedAssessments.map((s, i) => ({
      prospect_id: s.prospect_id,
      classification: s.classification,
      fit_score: s.fit_score == null ? 40 : s.fit_score,
      cited_evidence_ids: asList(s.cited_evidence_ids),
      rationale: s.rationale || "Policy lattice applied to this prospect.",
      missing_information: asList(s.missing_information),
      next_action: s.next_action,
      disqualification_reason: s.disqualification_reason,
      enforcement_intervened: s.enforcement_intervened,
      intervention_reason: s.intervention_reason,
    })),
    (first && first.servedOutput) || (second && second.servedOutput),
  );
  const intervened = servedAssessments.some((a) => a && a.enforcement_intervened);
  return {
    ...second,
    model_proposal: first.model_proposal,
    policy_conflicts: first.policy_conflicts,
    original_conflicts: first.policy_conflicts,
    per_prospect: mergedPer,
    served_decision: servedAssessments,
    servedOutput: servedOutput,
    enforcement_intervened: intervened || Boolean(first.enforcement_intervened),
    intervention_reason: first.intervention_reason || second.intervention_reason,
    preserved_compliant: mergedPer.filter((p) => p.repair_ignored).map((p) => p.prospect_id),
  };
}

export function enforceCase(args) {
  const runtimeInput = args.runtimeInput || {};
  const modelOutput = args.modelOutput || args.proposal || {};
  const arm = args.arm || "relevant";
  const items = usableItems(args.knowledgeItems, arm);
  const prospects = asList(runtimeInput.prospects);
  const traces = asList(args.traces).length
    ? args.traces
    : buildApplicabilityTraces(items, prospects);

  const perProspect = [];
  const allConflicts = [];
  const servedAssessments = [];
  const modelProposal = [];
  const policyEvaluations = [];

  for (const prospect of prospects) {
    const assessment = asList(modelOutput.assessments).find((a) => a && a.prospect_id === prospect.id);
    const proposal = proposalOf(assessment);
    proposal.prospect_id = prospect.id;
    const policyEval = evaluatePolicyForProspect({
      prospect: prospect,
      knowledgeItems: items,
      traces: traces,
      qualificationPolicy: runtimeInput.qualification_policy,
      constraints: runtimeInput.constraints,
      offer: runtimeInput.offer,
      title: runtimeInput.title,
      arm: arm,
    });
    const conflicts = detectConflicts({ proposal: proposal, policyEval: policyEval, prospect: prospect }).map((c) => ({
      ...c,
      prospect_id: prospect.id,
    }));
    const lattice = latticeFallback(policyEval);
    if (conflicts.some((c) => c.invariant === "not_satisfied_cannot_dq" || c.invariant === "unknown_mandatory_not_confirmed" || c.invariant === "hard_dq_only_if_conditions_satisfied")) {
      if (lattice.classification === "qualified" && policyEval.mandatory_unknown) {
        lattice.classification = "needs_research";
        lattice.next_action = "research_first";
        lattice.reason = "Removing an invalid disqualifier does not auto-qualify while mandatory facts remain unknown.";
        lattice.invariant = "removing_invalid_dq_does_not_auto_qualify";
      }
    }
    const served = servedAssessment(assessment, lattice, conflicts, policyEval, prospect);
    modelProposal.push({
      prospect_id: prospect.id,
      classification: proposal.classification,
      next_action: proposal.next_action,
      reasoning: proposal.reasoning,
      cited_evidence_ids: proposal.cited_evidence_ids,
      missing_information: proposal.missing_information,
      disqualification_reason: proposal.disqualification_reason,
    });
    policyEvaluations.push(policyEval);
    allConflicts.push(...conflicts);
    servedAssessments.push(served);
    perProspect.push({
      prospect_id: prospect.id,
      model_proposal: modelProposal[modelProposal.length - 1],
      policy_evaluation: policyEval,
      policy_conflicts: conflicts,
      lattice: lattice,
      served_decision: {
        prospect_id: prospect.id,
        classification: served.classification,
        next_action: served.next_action,
        cited_evidence_ids: served.cited_evidence_ids,
        missing_information: served.missing_information,
        enforcement_intervened: served.enforcement_intervened,
        intervention_reason: served.intervention_reason,
        why_safe: served.why_safe,
        rationale: served.rationale,
      },
    });
  }

  const servedOutput = assembleServedOutput(modelOutput.case_id || runtimeInput.case_id, servedAssessments, modelOutput);
  const intervened = servedAssessments.some((a) => a.enforcement_intervened);
  return {
    arm: arm,
    model_proposal: modelProposal,
    policy_evaluation: policyEvaluations,
    policy_conflicts: allConflicts,
    served_decision: perProspect.map((p) => p.served_decision),
    per_prospect: perProspect,
    servedOutput: servedOutput,
    enforcement_intervened: intervened,
    intervention_reason: allConflicts.map((c) => c.prospect_id + ":" + c.type).join("; ") || null,
    repair_attempts: args.repairAlreadyAttempted ? 1 : 0,
    used_owner_policy: armMayUseOwnerPolicy(arm),
  };
}

export function loadAdversarialFixtures(path) {
  const p = path || ADVERSARIAL_FIXTURE_PATH;
  const text = readFileSync(p, "utf8");
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function adversarialSha256(path) {
  const p = path || ADVERSARIAL_FIXTURE_PATH;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

export function runAdversarialFixture(item) {
  const runtimeInput = {
    case_id: item.case_id || "ATLAS-DEV-000",
    title: item.title || item.id,
    offer: item.offer || { name: "synthetic", summary: "synthetic offer", price_usd: 1, billing_period: "month", sales_motion: "founder_led" },
    qualification_policy: item.qualification_policy || { required: ["Mandatory unknowns require research"], preferred: [], disqualifiers: [], unknown_policy: "mandatory_unknown_requires_research" },
    constraints: item.constraints || [],
    prospects: item.prospects,
  };
  const modelOutput = item.model_proposal;
  const knowledgeItems = item.knowledge_items || [];
  const result = enforceCase({
    runtimeInput: runtimeInput,
    modelOutput: modelOutput,
    knowledgeItems: knowledgeItems,
    arm: item.arm || "relevant",
    traces: item.traces,
  });
  const repair = buildPolicyRepairPayload({
    runtimeInput: runtimeInput,
    originalProposal: modelOutput,
    policyEvaluations: result.policy_evaluation,
    conflicts: result.policy_conflicts,
  });
  const exp = item.expected || {};
  const servedById = Object.fromEntries(result.served_decision.map((s) => [s.prospect_id, s]));
  const originalById = Object.fromEntries(result.model_proposal.map((s) => [s.prospect_id, s]));
  const expectConflicts = asList(exp.conflict_types);
  const allowNone = exp.allow_no_conflict === true || (Object.prototype.hasOwnProperty.call(exp, "conflict_types") && expectConflicts.length === 0);
  const gotTypes = new Set(result.policy_conflicts.map((c) => c.type));
  const checks = {
    originalErrorVisible: true,
    conflictDetected: allowNone ? expectConflicts.every((t) => gotTypes.has(t)) : result.policy_conflicts.length > 0,
    repairAtMostOne: result.repair_attempts <= 1,
    noGoldInRepair: !GOLD_LEAK.test(JSON.stringify(repair)),
    unknownsStayUnknown: true,
    noUnsafeOutreach: true,
    servedRespectsPolicy: true,
  };
  for (const row of asList(exp.prospects)) {
    const served = servedById[row.prospect_id];
    const original = originalById[row.prospect_id];
    if (!served || !original) {
      checks.servedRespectsPolicy = false;
      continue;
    }
    if (row.original_classification && original.classification !== row.original_classification) checks.originalErrorVisible = false;
    if (row.served_classification && served.classification !== row.served_classification) checks.servedRespectsPolicy = false;
    if (row.served_action && served.next_action !== row.served_action) checks.servedRespectsPolicy = false;
    if (row.must_intervene === true && !served.enforcement_intervened) checks.servedRespectsPolicy = false;
    if (row.must_intervene === false && served.enforcement_intervened && item.arm === "baseline") checks.servedRespectsPolicy = false;
    if (row.unknowns_stay_unknown && served.classification !== "needs_research" && row.served_classification === "needs_research") {
      checks.unknownsStayUnknown = false;
    }
    if (served.next_action === "prioritize_outreach" && row.unsafe_outreach === true) checks.noUnsafeOutreach = false;
  }
  if (exp.conflict_types) {
    const got = new Set(result.policy_conflicts.map((c) => c.type));
    for (const t of exp.conflict_types) {
      if (!got.has(t)) checks.conflictDetected = false;
    }
  }
  if (item.arm === "baseline" && result.used_owner_policy) checks.servedRespectsPolicy = false;
  const ok =
    checks.originalErrorVisible &&
    checks.conflictDetected &&
    checks.repairAtMostOne &&
    checks.noGoldInRepair &&
    checks.unknownsStayUnknown &&
    checks.noUnsafeOutreach &&
    checks.servedRespectsPolicy;
  return { id: item.id, ok: ok, checks: checks, result: result, repair: repair };
}

export function scoreAdversarialFixtures(path) {
  const items = loadAdversarialFixtures(path);
  const rows = items.map((item) => runAdversarialFixture(item));
  const correct = rows.filter((r) => r.ok).length;
  return {
    n: items.length,
    correct: correct,
    passed: correct === items.length,
    rows: rows.map((r) => ({ id: r.id, ok: r.ok, checks: r.checks, conflicts: r.result.policy_conflicts })),
  };
}

export function assertNoGold(obj) {
  const json = JSON.stringify(obj);
  return !GOLD_LEAK.test(json);
}
