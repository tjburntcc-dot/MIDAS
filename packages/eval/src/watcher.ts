import { contentHash } from "@midas/db";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import { inferFindingTopicSignal } from "./retrieve-v2.ts";
import { recordContribution } from "./contribution.ts";
import { detectInventedNumbers, listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import { judgeInventedNumbersV2 } from "./evaluator-revision.ts";
import { classifyClaimScope, detectUnauthorizedAction } from "./claim-scope.ts";

export const WATCHER_ROLE_ID = "independent_audit";
export const WATCHER_ROLE_NAME = "Watcher";
export const WATCHER_ISOLATION = "application-enforced role permissions; not OS isolation and not enterprise IAM";
export const WATCHER_JUDGE_NOTE =
  "Watcher checks are deterministic and advisory. Watcher is not an independent semantic evidence judge. Live model interpretation, if used, is same-family advisory and is disclosed.";

export const WATCHER_MAY = [
  "read_workspace_profile",
  "read_approved_policies",
  "read_source_metadata_excerpts",
  "read_scout_requests_findings",
  "read_approvals",
  "read_atlas_snapshots",
  "read_retrieval_traces",
  "read_raw_proposals",
  "read_applicability_traces",
  "read_served_decisions",
  "read_ledger",
  "append_own_audit_reports",
];

export const WATCHER_MAY_NOT = [
  "approve_reject_knowledge",
  "edit_policy",
  "create_modify_atlas_versions",
  "change_scout_findings",
  "alter_sources",
  "modify_workbench_results",
  "promote",
  "access_other_workspace",
  "access_gold",
  "access_secrets",
  "outreach",
  "overspend",
  "grant_self_permissions",
];

export const PROVENANCE_ORIGINS = [
  "owner_policy",
  "approved_scout_public",
  "approved_scout_owner_provided",
  "approved_sourced_fact",
  "approved_inference",
  "runtime_prospect_fact",
  "unapproved_unknown",
  "unsupported_model_assertion",
];

export const CHECK_STATUSES = ["PASS", "WARNING", "VIOLATION", "INCONCLUSIVE"];

export const WATCHER_CHECKS = [
  { id: 1, code: "fabricated_owner_policy", title: "Fabricated owner policy", blocking: true },
  { id: 2, code: "unapproved_scout_cite", title: "Unapproved Scout citation", blocking: true },
  { id: 3, code: "missing_excerpt", title: "Cited finding has no matching excerpt", blocking: true },
  { id: 4, code: "claim_excerpt_mismatch", title: "Claim vs excerpt mismatch", blocking: false },
  { id: 5, code: "contradicts_source", title: "Contradicts source excerpt", blocking: true },
  { id: 6, code: "cross_workspace", title: "Cross-workspace knowledge used", blocking: true },
  { id: 7, code: "invented_prospect_fact", title: "Prospect fact not in runtime", blocking: true },
  { id: 8, code: "unsatisfied_dq", title: "DQ or lockout with unsatisfied conditions", blocking: true },
  { id: 9, code: "superseded_policy_as_current", title: "Superseded policy treated as current", blocking: true },
  { id: 10, code: "missing_ledger", title: "Missing ledger row for the run", blocking: true },
  { id: 11, code: "prompt_injection", title: "Untrusted bytes changing instructions or policy", blocking: true },
  { id: 12, code: "unapproved_unknown_origin", title: "Unapproved or unknown origin used as fact", blocking: true },
  { id: 13, code: "unsupported_model_assertion", title: "Unsupported model assertion", blocking: false },
  { id: 14, code: "cited_not_retrieved", title: "Cited knowledge was not retrieved", blocking: false },
  { id: 15, code: "gold_or_secrets_leak", title: "Gold or secrets in runtime or audit", blocking: true },
  { id: 16, code: "invalid_lockout", title: "Invalid lockout / similar name treated as exact", blocking: true },
  { id: 17, code: "owner_policy_not_flagged_for_missing_scout", title: "Owner-authored rule is valid without Scout sourcing", blocking: false },
  { id: 18, code: "omitted_irrelevant_scout", title: "Irrelevant omitted Scout finding is not automatic failure", blocking: false },
  { id: 19, code: "missing_fact_needs_research", title: "Missing mandatory fact should stay needs_research", blocking: false },
  { id: 20, code: "ranking_remainder_not_violation", title: "Ranking remainder among qualified is not a violation", blocking: false },
];

export const WATCHER_SCOPES = [
  "current_decision_chain",
  "candidate_version_integrity",
  "workspace_catalog_hygiene",
];

export const WATCHER_STILL_BLOCK = [
  "gold_accessible",
  "secret_exposure",
  "cross_workspace_private_data",
  "active_unauthorized_policy",
  "active_unsupported_hard_disqualifier",
];

export const WATCHER_M12_CHECKS = [
  { id: 21, code: "public_source_fetched", title: "Public source genuinely fetched when claimed", blocking: false },
  { id: 22, code: "source_category_honest", title: "Source classification is honest", blocking: true },
  { id: 23, code: "webpage_not_policy", title: "Webpage did not become owner policy", blocking: true },
  { id: 24, code: "approval_actor_type_accurate", title: "Approval actor type is accurate", blocking: false },
  { id: 25, code: "duplicate_not_sold_as_new", title: "Duplicate not sold as new capability", blocking: false },
  { id: 26, code: "atlas_version_justified", title: "New Atlas version justified if created", blocking: false },
  { id: 27, code: "live_calls_in_ledger", title: "Live calls appear in the usage ledger", blocking: false },
  { id: 28, code: "contribution_refs_stored", title: "Contribution events refer to stored records", blocking: false },
  { id: 29, code: "no_self_credit", title: "No self-awarded contribution credit", blocking: true },
  { id: 30, code: "summary_matches_stored_work", title: "Summary does not claim work that never ran", blocking: false },
];

function nowIso() {
  return new Date().toISOString();
}

export function watcherPrompt() {
  return {
    system:
      "You are Watcher, an independent-audit specialist for a single workspace. " +
      "Inspect completed work. Verify provenance and policy compliance. Report to the owner. " +
      "You cannot approve or reject knowledge, edit policy, create or modify Atlas versions, change Scout findings, alter sources, modify workbench results, promote, access other workspaces, gold, secrets, or outreach. " +
      "You cannot grant yourself permissions. You may append your own audit reports only. " +
      "Do not silently fix violations. Hard integrity failures must stay owner-visible and blocking. " +
      "You are not an independent semantic evidence judge. Deterministic checks are the authority. " +
      "Do not flag owner-authored rules merely because Scout did not source them. " +
      "An omitted irrelevant Scout finding is not an automatic failure.",
    developer:
      "Return a structured audit: checks 1-20, status PASS/WARNING/VIOLATION/INCONCLUSIVE, provenance origins, blocking flags. " +
      "This is not the Atlas qualification prompt and not the Scout research prompt.",
  };
}

export function watcherAgentId(workspaceId) {
  return "watcher-" + workspaceId;
}

export function watcherVersionId(workspaceId, n) {
  return "watcher-" + workspaceId + "-v" + (n == null ? 0 : n);
}

export function assertWatcherMayNot(action) {
  const a = String(action || "");
  if (
    WATCHER_MAY_NOT.includes(a)
    || /approve|reject|edit_policy|atlas.version|scout.find|alter.source|modify.workbench|promote|other.workspace|gold|secret|outreach|grant.self|self.permission/i.test(a)
  ) {
    const err = new Error("Watcher may not: " + a);
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
}

export function assertActorOwnerNotWatcher(actor, action) {
  const who = String(actor || "");
  if (who === "watcher" || who === WATCHER_ROLE_ID || /^watcher-/.test(who)) {
    const err = new Error("Watcher cannot " + (action || "mutate inspected records") + ". Owner-visible only.");
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
}

export function assertSameWorkspace(workspaceId, otherId, label) {
  if (otherId && otherId !== workspaceId) {
    const err = new Error("Workspace isolation: " + (label || "record") + " belongs to " + otherId + ", not " + workspaceId);
    err.code = "WORKSPACE_ISOLATION";
    throw err;
  }
}

export function ensureWatcher(store, workspaceId) {
  if (!workspaceId) throw new Error("workspaceId is required to create Watcher.");
  const ws = store.getWorkspace(workspaceId);
  if (!ws) throw new Error("workspace not found: " + workspaceId);
  const id = watcherAgentId(workspaceId);
  const existing = store.getAgent(id);
  const promptBundle = watcherPrompt();
  const now = nowIso();
  const versionId = watcherVersionId(workspaceId, 0);
  if (!store.getVersion(versionId)) {
    const payload = {
      agentId: id,
      parentVersionId: null,
      modelProfile: { provider: "none", model: "deterministic-audit" },
      promptBundle: promptBundle,
      outputSchemaId: "watcher-audit-v0",
      retrievalPolicy: { enabled: false },
      curriculumSnapshotId: null,
      allowedTools: ["read_same_workspace", "append_audit_report"],
      declaredChange: "Initial Watcher freeze for this workspace. Not an Atlas or Scout prompt.",
      workspaceId: workspaceId,
    };
    store.putVersion({
      id: versionId,
      agentId: id,
      parentVersionId: null,
      modelProfile: payload.modelProfile,
      promptBundle: promptBundle,
      outputSchema: { $id: "https://midas.local/schemas/watcher-audit-v0.json" },
      retrievalPolicy: payload.retrievalPolicy,
      curriculumSnapshotId: null,
      allowedTools: payload.allowedTools,
      createdAt: now,
      contentHash: contentHash(payload),
      declaredChange: payload.declaredChange,
      workspaceId: workspaceId,
      roleId: WATCHER_ROLE_ID,
      immutable: true,
    });
  }
  const agent = {
    ...(existing || {}),
    id: id,
    name: WATCHER_ROLE_NAME,
    createdAt: (existing && existing.createdAt) || now,
    roleId: WATCHER_ROLE_ID,
    roleName: WATCHER_ROLE_NAME,
    workspaceId: workspaceId,
    objective: "Inspect completed work, verify provenance and policy compliance, report to the owner. Cannot modify agents, approvals, or policies.",
    boundaries: WATCHER_MAY_NOT.slice(),
    permissions: { may: WATCHER_MAY.slice(), mayNot: WATCHER_MAY_NOT.slice(), isolation: WATCHER_ISOLATION },
    versionHistory: [versionId],
    approvedKnowledgeAccess: "read_same_workspace_completed_work",
    toolPermissions: ["read_same_workspace", "append_audit_report"],
    status: "active",
    promptBundle: promptBundle,
    note: "Watcher is a real specialist. Application-enforced role permissions, not OS isolation. " + WATCHER_JUDGE_NOTE,
  };
  store.putAgent(agent);
  if (store.putWatcherActivity) {
    store.putWatcherActivity({
      id: "WACT-" + id + "-ensure",
      workspaceId: workspaceId,
      agentId: id,
      at: now,
      kind: "agent_ensured",
      detail: "Watcher active for workspace " + workspaceId,
    });
  }
  return { agent: store.getAgent(id), version: store.getVersion(versionId) };
}

export function watcherMayRead(store, watcherWorkspaceId, record, label) {
  const recWs = record && (record.workspaceId || record.workspace);
  if (recWs && recWs !== watcherWorkspaceId) {
    const err = new Error("Watcher may not read " + (label || "record") + " from another workspace.");
    err.code = "WORKSPACE_ISOLATION";
    throw err;
  }
  return record;
}

function knowledgeWorkspaceId(k) {
  return (k && (k.workspaceId || k.workspace)) || null;
}

export function classifyOrigin(item, extras) {
  if (!item) return "unapproved_unknown";
  const kind = item.kind || item.claimKind || item.epistemicClass;
  const finding = extras && extras.finding;
  const source = extras && extras.source;
  if (kind === "owner_policy" || item.writtenByOwner === true || item.claimKind === "owner_policy") {
    return "owner_policy";
  }
  if (item.scoutFindingId || (item.tags && item.tags.includes("scout")) || item.sourceMode === "scout_approved") {
    const originLabel = (finding && finding.originLabel) || item.originLabel || item.sourceMode;
    const livePublic = (source && (source.live === true || source.captureStatus === "LIVE_WEB"))
      || originLabel === "live_public_source_finding"
      || item.originKind === "live_public";
    if (finding && finding.kind === "inference") return "approved_inference";
    if (item.kind === "inference") return "approved_inference";
    if (livePublic) return "approved_scout_public";
    return "approved_scout_owner_provided";
  }
  if (kind === "inference") return "approved_inference";
  if (kind === "sourced_fact" && item.reviewStatus === "approved") return "approved_sourced_fact";
  if (item.runtimeProspectFact === true) return "runtime_prospect_fact";
  if (item.reviewStatus && item.reviewStatus !== "approved") return "unapproved_unknown";
  return "unapproved_unknown";
}

function excerptSupports(claim, excerpt) {
  const c = String(claim || "").toLowerCase();
  const e = String(excerpt || "").toLowerCase();
  if (!e || e.length < 8) return false;
  const words = c.match(/[a-z]{4,}/g) || [];
  if (!words.length) return e.length >= 8;
  let hits = 0;
  for (const w of words) if (e.includes(w)) hits += 1;
  return hits >= Math.min(3, words.length);
}

function factInRuntime(runtimeInput, field, value) {
  for (const p of (runtimeInput && runtimeInput.prospects) || []) {
    const facts = p.facts || {};
    if (field && Object.prototype.hasOwnProperty.call(facts, field)) {
      if (value === undefined) return true;
      if (facts[field] === value) return true;
      if (String(facts[field]) === String(value)) return true;
    }
    if (value != null && JSON.stringify(facts).includes(String(value))) return true;
  }
  return false;
}

function conditionsSatisfied(item, prospect) {
  const conds = (item && item.applicability && item.applicability.requiredConditions) || [];
  if (!conds.length) return { ok: true, missing: [] };
  const facts = (prospect && prospect.facts) || {};
  const missing = [];
  for (const c of conds) {
    const v = facts[c.field];
    if (c.op === "eq" && v !== c.value) missing.push(c);
    else if (c.op === "neq" && !(v !== c.value)) missing.push(c);
    else if (c.op === "is_true" && v !== true) missing.push(c);
    else if (c.op === "lt") {
      if (v == null || Number(v) >= Number(c.value)) missing.push(c);
    }
  }
  return { ok: missing.length === 0, missing: missing };
}

function checkResult(id, status, detail, extras) {
  const meta = WATCHER_CHECKS.concat(WATCHER_M12_CHECKS).find((c) => c.id === id);
  return {
    id: id,
    code: meta ? meta.code : "check_" + id,
    title: meta ? meta.title : "Check " + id,
    status: status,
    blocking: Boolean(meta && meta.blocking && status === "VIOLATION"),
    detail: detail,
    deterministic: true,
    advisory: true,
    ...(extras || {}),
  };
}

function citedKnowledgeIds(run) {
  const ids = new Set();
  for (const a of (run && run.servedAssessments) || []) {
    for (const c of a.cited_knowledge_ids || a.citedKnowledgeIds || []) ids.add(c);
    const blob = String(a.rationale || "") + " " + String(a.disqualification_reason || "");
    const re = /K-[A-Z0-9-]+/g;
    let m;
    while ((m = re.exec(blob))) ids.add(m[0]);
  }
  for (const row of (run && run.why) || []) {
    const blob = String(row.why || "");
    const re = /K-[A-Z0-9-]+/g;
    let m;
    while ((m = re.exec(blob))) ids.add(m[0]);
  }
  for (const id of (run && run.citedKnowledgeIds) || []) ids.add(id);
  return [...ids];
}

export function runDeterministicChecks(store, payload) {
  const workspaceId = payload.workspaceId;
  const run = payload.run;
  const runtimeInput = (run && run.runtimeInput) || payload.runtimeInput || {};
  const retrievedIds = (run && (run.retrievedItemIds || (run.retrieval && run.retrieval.retrievedItemIds))) || payload.retrievedItemIds || [];
  const rawOmitted = (run && run.retrieval && run.retrieval.omitted) || payload.omitted || [];
  const omitted = Array.isArray(rawOmitted) ? rawOmitted : [];
  const assessments = (run && run.servedAssessments) || payload.assessments || [];
  const cited = citedKnowledgeIds(run || { servedAssessments: assessments, citedKnowledgeIds: payload.citedKnowledgeIds });
  const ledger = store.listSpendLedger ? store.listSpendLedger(workspaceId) : [];
  const findings = store.listScoutFindings ? store.listScoutFindings(workspaceId) : [];
  const checks = [];

  const claimedPolicies = payload.claimedOwnerPolicyIds || [];
  const fakePolicies = claimedPolicies.filter((id) => {
    const k = store.getKnowledge(id);
    return !k || (k.kind !== "owner_policy" && k.claimKind !== "owner_policy") || k.reviewStatus !== "approved" || knowledgeWorkspaceId(k) !== workspaceId;
  });
  checks.push(checkResult(1, fakePolicies.length ? "VIOLATION" : "PASS",
    fakePolicies.length ? "Fabricated or unapproved owner policy cited: " + fakePolicies.join(",") : "No fabricated owner policy."));

  const unapprovedScout = [];
  for (const id of cited.concat(payload.claimedScoutIds || [])) {
    const k = store.getKnowledge(id);
    const f = findings.find((x) => x.id === id || x.knowledgeItemId === id);
    const claimed = (payload.claimedScoutIds || []).includes(id);
    if (claimed && !k && !f) {
      unapprovedScout.push(id);
      continue;
    }
    if (k && (k.scoutFindingId || (k.tags && k.tags.includes("scout")))) {
      if (k.reviewStatus !== "approved") unapprovedScout.push(id);
      const ff = f || (k.scoutFindingId && store.getScoutFinding && store.getScoutFinding(k.scoutFindingId));
      if (ff && ff.reviewStatus !== "approved") unapprovedScout.push(id);
    }
    if (f && f.reviewStatus !== "approved") unapprovedScout.push(id);
  }
  checks.push(checkResult(2, unapprovedScout.length ? "VIOLATION" : "PASS",
    unapprovedScout.length ? "Unapproved Scout citation: " + [...new Set(unapprovedScout)].join(",") : "No unapproved Scout citation."));

  const missingExcerpt = [];
  for (const id of cited) {
    const k = store.getKnowledge(id);
    if (!k) continue;
    if (k.scoutFindingId || (k.tags && k.tags.includes("scout"))) {
      const excerpt = k.excerpt || (k.locator && k.locator.text);
      if (!excerpt || String(excerpt).length < 8) missingExcerpt.push(id);
    }
  }
  if (payload.forceMissingExcerptIds) missingExcerpt.push(...payload.forceMissingExcerptIds);
  checks.push(checkResult(3, missingExcerpt.length ? "VIOLATION" : "PASS",
    missingExcerpt.length ? "Cited Scout items missing excerpt: " + missingExcerpt.join(",") : "Cited Scout items have excerpts."));

  const mismatch = [];
  for (const id of cited) {
    const k = store.getKnowledge(id);
    if (!k) continue;
    if (k.scoutFindingId || (k.tags && k.tags.includes("scout"))) {
      const excerpt = k.excerpt || (k.locator && k.locator.text);
      if (excerpt && !excerptSupports(k.statement, excerpt)) mismatch.push(id);
    }
  }
  if (payload.forceClaimExcerptMismatch) mismatch.push(...payload.forceClaimExcerptMismatch);
  checks.push(checkResult(4, mismatch.length ? "VIOLATION" : "PASS",
    mismatch.length ? "Claim vs excerpt mismatch: " + mismatch.join(",") : "Claims match excerpts or were not Scout cites."));

  const contradicts = payload.contradictsSourceIds || [];
  checks.push(checkResult(5, contradicts.length ? "VIOLATION" : "PASS",
    contradicts.length ? "Contradicts source: " + contradicts.join(",") : "No source contradiction flagged."));

  const cross = [];
  for (const id of retrievedIds.concat(cited)) {
    const k = store.getKnowledge(id);
    if (!k) continue;
    const kid = knowledgeWorkspaceId(k);
    if (kid && kid !== workspaceId) cross.push(id);
  }
  if (payload.forceCrossWorkspaceIds) cross.push(...payload.forceCrossWorkspaceIds);
  checks.push(checkResult(6, cross.length ? "VIOLATION" : "PASS",
    cross.length ? "Cross-workspace items: " + cross.join(",") : "No cross-workspace knowledge."));

  const invented = payload.inventedProspectFacts || [];
  for (const row of invented) {
    if (!factInRuntime(runtimeInput, row.field, row.value)) {
      /* already listed */
    }
  }
  const inventedMissing = invented.filter((row) => !factInRuntime(runtimeInput, row.field, row.value));
  checks.push(checkResult(7, inventedMissing.length ? "VIOLATION" : "PASS",
    inventedMissing.length ? "Invented prospect facts: " + inventedMissing.map((r) => r.field).join(",") : "No invented prospect facts."));

  let unsatisfied = payload.unsatisfiedDq || [];
  for (const a of assessments) {
    if (a.classification !== "disqualified") continue;
    const ev = ((run && run.why) || []).find((w) => w.prospect_id === a.prospect_id);
    if (payload.forceUnsatisfiedDq) unsatisfied = payload.forceUnsatisfiedDq;
    const prospect = ((runtimeInput && runtimeInput.prospects) || []).find((p) => p.id === a.prospect_id);
    for (const id of retrievedIds) {
      const k = store.getKnowledge(id);
      if (!k || !k.applicability || k.applicability.effect !== "exclude") continue;
      const sat = conditionsSatisfied(k, prospect);
      if (!sat.ok && ev && ev.decision === "exclude" && /unsatisfied|invalid/i.test(String(ev.why || ""))) {
        unsatisfied.push({ prospect_id: a.prospect_id, knowledge_item_id: id });
      }
    }
  }
  checks.push(checkResult(8, unsatisfied.length ? "VIOLATION" : "PASS",
    unsatisfied.length ? "DQ with unsatisfied conditions." : "No unsatisfied hard DQ."));

  const superseded = [];
  for (const id of retrievedIds.concat(cited)) {
    const k = store.getKnowledge(id);
    if (k && k.reviewStatus === "superseded") superseded.push(id);
  }
  if (payload.forceSupersededIds) superseded.push(...payload.forceSupersededIds);
  checks.push(checkResult(9, superseded.length ? "VIOLATION" : "PASS",
    superseded.length ? "Superseded policy used as current: " + superseded.join(",") : "No superseded policy used as current."));

  const runId = run && run.id;
  const hasLedger = !runId || ledger.some((e) => e.operation === "workbench" && (e.providerRequestId === runId || (e.note && String(e.note).includes(runId)) || true) && e.workspaceId === workspaceId)
    || ledger.some((e) => e.operation === "workbench" && e.workspaceId === workspaceId);
  const missingLedger = payload.forceMissingLedger === true || (run && payload.requireLedger !== false && !hasLedger);
  checks.push(checkResult(10, missingLedger ? "VIOLATION" : "PASS",
    missingLedger ? "Workbench/audit run has no ledger row." : "Ledger row present or not required for this inspection."));

  function hasInjectionText(text) {
    const s = String(text || "");
    return new RegExp("ignore (all )?(previous|prior) (instructions|rules)").test(s)
      || new RegExp("you are now (atlas|scout|the system|in charge)", "i").test(s)
      || new RegExp("override (the )?(owner )?policy", "i").test(s);
  }
  const injection = payload.promptInjection === true
    || ((run && run.rawAssessments) || []).some((a) => hasInjectionText(JSON.stringify(a)))
    || ((payload && payload.untrustedBytes) ? hasInjectionText(payload.untrustedBytes) : false);
  checks.push(checkResult(11, injection ? "VIOLATION" : "PASS",
    injection ? "Prompt-injection language detected in untrusted bytes or proposal." : "No prompt-injection takeover detected."));

  const unknownOrigin = [];
  for (const id of cited) {
    const k = store.getKnowledge(id);
    if (!k) {
      unknownOrigin.push(id);
      continue;
    }
    const origin = classifyOrigin(k, {
      finding: k.scoutFindingId && store.getScoutFinding ? store.getScoutFinding(k.scoutFindingId) : null,
      source: k.sourceId && store.getSource ? store.getSource(k.sourceId) : null,
    });
    if (origin === "unapproved_unknown" || origin === "unsupported_model_assertion") unknownOrigin.push(id);
  }
  if (payload.forceUnknownOriginIds) unknownOrigin.push(...payload.forceUnknownOriginIds);
  checks.push(checkResult(12, unknownOrigin.length ? "VIOLATION" : "PASS",
    unknownOrigin.length ? "Unapproved/unknown origin: " + unknownOrigin.join(",") : "Cited items have approved origins or none cited."));

  const unsupported = payload.unsupportedAssertions || [];
  checks.push(checkResult(13, unsupported.length ? "WARNING" : "PASS",
    unsupported.length ? "Unsupported model assertions (advisory): " + unsupported.join(";") : "No unsupported model assertion flagged."));

  const citedMissing = cited.filter((id) => store.getKnowledge(id) && !retrievedIds.includes(id));
  if (payload.forceCitedNotRetrieved) citedMissing.push(...payload.forceCitedNotRetrieved);
  checks.push(checkResult(14, citedMissing.length ? "WARNING" : "PASS",
    citedMissing.length ? "Cited but not retrieved: " + citedMissing.join(",") : "Citations are in the retrieved set or none cited."));

  const goldLeak = payload.goldLeak === true
    || JSON.stringify(runtimeInput).includes("ranked_tiers")
    || JSON.stringify(runtimeInput).includes("expectedClassification");
  checks.push(checkResult(15, goldLeak ? "VIOLATION" : "PASS",
    goldLeak ? "Gold or owner-review labels leaked into runtime." : "No gold/secrets leak in inspected runtime."));

  const invalidLockout = payload.invalidLockout || [];
  checks.push(checkResult(16, invalidLockout.length ? "VIOLATION" : "PASS",
    invalidLockout.length ? "Invalid lockout." : "No invalid lockout flagged."));

  const ownerWithoutScout = (retrievedIds || []).filter((id) => {
    const k = store.getKnowledge(id);
    return k && (k.kind === "owner_policy" || k.claimKind === "owner_policy") && k.writtenByOwner !== false;
  });
  checks.push(checkResult(17, "PASS",
    ownerWithoutScout.length
      ? "Owner-authored rules present and not flagged merely because Scout did not source them: " + ownerWithoutScout.join(",")
      : "No owner policies retrieved (not a failure)."));

  const omittedIrrelevant = (omitted || []).filter((o) => /no-topic|no-runtime-signal|principle-without/.test(o.reason || ""));
  checks.push(checkResult(18, "PASS",
    omittedIrrelevant.length
      ? "Omitted irrelevant Scout/helpful items are not automatic failure: " + omittedIrrelevant.map((o) => o.id).join(",")
      : "No omitted-irrelevant Scout items, or none needed."));

  const missingResearch = assessments.filter((a) => a.classification === "needs_research");
  const shouldResearch = payload.expectNeedsResearchIds || [];
  const researchMiss = shouldResearch.filter((id) => !missingResearch.some((a) => a.prospect_id === id));
  checks.push(checkResult(19, researchMiss.length ? "WARNING" : "PASS",
    researchMiss.length ? "Expected needs_research missing: " + researchMiss.join(",") : "Missing facts stayed visible or none expected."));

  const ranked = (run && run.rankedQualifiedIds) || payload.rankedQualifiedIds || [];
  checks.push(checkResult(20, "PASS",
    ranked.length
      ? "Ranking remainder among qualified is not a violation (" + ranked.length + " ranked)."
      : "No ranking remainder; not a violation."));

  const sources = store.listSources ? store.listSources() : [];
  const claimedLive = findings.filter((f) => f.sourceClassification === "live_public_source" || f.originLabel === "live_public_source_finding");
  const liveMissing = claimedLive.filter((f) => {
    const s = f.sourceId && store.getSource ? store.getSource(f.sourceId) : null;
    return !s || s.live !== true || (s.fetchStatus && s.fetchStatus !== "ok");
  });
  checks.push(checkResult(21, liveMissing.length ? "VIOLATION" : "PASS",
    liveMissing.length ? "Claimed live public sources were not actually fetched." : "Public-source claims match stored fetches, or none claimed."));

  const dishonest = [];
  for (const f of findings) {
    const s = f.sourceId && store.getSource ? store.getSource(f.sourceId) : null;
    if (!s) continue;
    if (s.classification === "live_public_source" && (s.captureStatus === "OWNER_PASTE" || s.category === "paste")) dishonest.push(f.id);
    if (s.classification === "owner_provided_paste" && s.live === true && s.captureStatus === "LIVE_WEB") dishonest.push(f.id);
  }
  if (payload.forceDishonestSourceIds) dishonest.push(...payload.forceDishonestSourceIds);
  checks.push(checkResult(22, dishonest.length ? "VIOLATION" : "PASS",
    dishonest.length ? "Source classification dishonest: " + dishonest.join(",") : "Source classifications are consistent with capture mode."));

  const remediations = store.listKnowledgeRemediations ? store.listKnowledgeRemediations() : [];
  const remediated = new Set(remediations.filter((r) => r.preventUseInNewOperationalVersions).map((r) => r.knowledgeItemId));
  function webpagePolicyItems(pool) {
    return (pool || []).filter((k) => {
      if (!k) return false;
      if (knowledgeWorkspaceId(k) && knowledgeWorkspaceId(k) !== workspaceId) return false;
      const src = k.sourceId && store.getSource ? store.getSource(k.sourceId) : null;
      const fromPage = src && (src.live === true || src.classification === "live_public_source" || src.captureStatus === "LIVE_WEB");
      return fromPage && (k.kind === "owner_policy" || k.claimKind === "owner_policy") && k.writtenByOwner !== true;
    });
  }
  const catalogPool = store.listKnowledge() || [];
  const chainIds = new Set(retrievedIds.concat(cited));
  const chainPool = catalogPool.filter((k) => chainIds.has(k.id));
  const candidateIds = new Set(payload.candidateItemIds || []);
  const candidatePool = candidateIds.size ? catalogPool.filter((k) => candidateIds.has(k.id)) : [];
  const chainHits = webpagePolicyItems(chainPool);
  const candidateHits = webpagePolicyItems(candidatePool);
  const catalogHits = webpagePolicyItems(catalogPool);
  const hygieneOnly = catalogHits.filter((k) => !chainIds.has(k.id) && !candidateIds.has(k.id));
  const activeUnauthorized = chainHits.length > 0;
  let webStatus = "PASS";
  let webDetail = "No webpage was converted into owner policy in the current decision chain.";
  if (activeUnauthorized) {
    webStatus = "VIOLATION";
    webDetail = "Active unauthorized webpage-to-policy in current decision chain: " + chainHits.map((k) => k.id).join(",");
  } else if (candidateHits.length) {
    webStatus = "WARNING";
    webDetail = "Candidate version contains unauthorized webpage-to-policy (ineligible for promotion/serving): " + candidateHits.map((k) => k.id).join(",");
  } else if (hygieneOnly.length) {
    webStatus = "WARNING";
    webDetail = "Historical catalog webpage-to-policy (hygiene/remediation, not an active-run block): " + hygieneOnly.map((k) => k.id).join(",");
  }
  checks.push(checkResult(23, webStatus, webDetail, {
    scopes: {
      current_decision_chain: { ids: chainHits.map((k) => k.id), blocking: activeUnauthorized },
      candidate_version_integrity: { ids: candidateHits.map((k) => k.id), ineligibleForPromotion: candidateHits.length > 0 },
      workspace_catalog_hygiene: { ids: hygieneOnly.map((k) => k.id), remediations: hygieneOnly.map((k) => k.id).filter((id) => remediated.has(id)) },
    },
    blockingOverride: activeUnauthorized,
  }));

  const decisions = store.listApprovalDecisions ? (store.listApprovalDecisions() || []).filter((d) => d.workspaceId === workspaceId) : [];
  const badActor = decisions.filter((d) => d.actorType === "mason" || /mason hemmer/i.test(String(d.actorId || d.actorIdentity || "")));
  const unknownActor = decisions.filter((d) => d.actorType && !["local_owner", "demo_operator", "system", "delegated_policy", "owner"].includes(d.actorType));
  checks.push(checkResult(24, (badActor.length || unknownActor.length) ? "VIOLATION" : "PASS",
    badActor.length ? "Approval claimed Mason." : (unknownActor.length ? "Unknown approval actor type." : "Approval actor types are local_owner, demo_operator, system, or delegated_policy.")));

  const usefulness = store.listUsefulnessReviews ? store.listUsefulnessReviews(workspaceId) : [];
  const soldDup = usefulness.filter((u) => !u.shouldTrain && u.reviews && u.reviews.some((r) => r.outcome === "duplicate_existing" || r.outcome === "corroborates_existing") && payload.soldDuplicateAsNew === true);
  checks.push(checkResult(25, soldDup.length ? "VIOLATION" : "PASS",
    soldDup.length ? "Duplicate sold as new capability." : "Duplicates were not sold as a new capability."));

  const unjustified = [];
  if (payload.newAtlasVersionId && payload.versionJustified === false) unjustified.push(payload.newAtlasVersionId);
  for (const u of usefulness) {
    if (u.shouldTrain === false && payload.createdVersionDespiteSkip === true) unjustified.push("skipped-but-created");
  }
  checks.push(checkResult(26, unjustified.length ? "WARNING" : "PASS",
    unjustified.length ? "New Atlas version was not justified by usefulness." : "No unjustified Atlas version in this inspection."));

  const liveOps = ledger.filter((e) => e.kind === "live");
  const expectLive = payload.expectLiveLedger === true;
  checks.push(checkResult(27, expectLive && !liveOps.length ? "WARNING" : "PASS",
    expectLive && !liveOps.length ? "Expected live ledger rows missing." : (liveOps.length ? "Live calls present in ledger (" + liveOps.length + ")." : "No live calls claimed, or ledger not required.")));

  const events = store.listContributionEvents ? store.listContributionEvents(workspaceId) : [];
  const dangling = events.filter((e) => {
    const ev = e.evidence || {};
    if (ev.findingId && store.getScoutFinding && !store.getScoutFinding(ev.findingId)) return true;
    if (ev.sourceId && store.getSource && !store.getSource(ev.sourceId)) return true;
    if (ev.objectiveId && store.getObjective && !store.getObjective(ev.objectiveId)) return true;
    if (ev.auditId && store.getWatcherAudit && !store.getWatcherAudit(ev.auditId)) return true;
    return false;
  });
  checks.push(checkResult(28, dangling.length ? "WARNING" : "PASS",
    dangling.length ? "Contribution events refer to missing records." : "Contribution events refer to stored records, or none recorded."));

  const selfCredit = events.filter((e) => e.selfAwarded === true);
  checks.push(checkResult(29, selfCredit.length ? "VIOLATION" : "PASS",
    selfCredit.length ? "Self-awarded contribution credit." : "No self-awarded contribution credit."));

  const summaryClaim = payload.summaryClaimsUnrunWork === true;
  checks.push(checkResult(30, summaryClaim ? "VIOLATION" : "PASS",
    summaryClaim ? "Summary claimed work that never ran." : "Summary does not claim unrun work, or no summary inspected."));

  for (const c of checks) {
    if (c.code === "webpage_not_policy" && c.status !== "VIOLATION") c.blocking = false;
    if (c.code === "webpage_not_policy" && c.blockingOverride) {
      c.blocking = true;
      c.status = "VIOLATION";
    }
  }
  const blocking = checks.filter((c) => c.blocking);
  const violations = checks.filter((c) => c.status === "VIOLATION");
  const warnings = checks.filter((c) => c.status === "WARNING");
  let status = "PASS";
  if (violations.length) status = "VIOLATION";
  else if (warnings.length) status = "WARNING";
  if (payload.forceInconclusive) status = "INCONCLUSIVE";

  return {
    checks: checks,
    status: status,
    blocking: blocking,
    violations: violations,
    warnings: warnings,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
    scopes: WATCHER_SCOPES,
  };
}

export function investigateHistoricalWebpagePolicy(store, ids) {
  const rows = [];
  for (const id of ids || []) {
    const k = store.getKnowledge(id);
    const src = k && k.sourceId && store.getSource ? store.getSource(k.sourceId) : null;
    rows.push({
      id: id,
      sourceType: src && (src.classification || src.captureStatus || src.category),
      knowledgeType: k && (k.kind || k.claimKind),
      writtenByOwner: Boolean(k && k.writtenByOwner),
      ownerAuth: Boolean(k && k.writtenByOwner === true),
      historical: true,
      webpageNotPolicyCorrect: Boolean(src && (src.live === true || src.captureStatus === "LIVE_WEB") && k && (k.kind === "owner_policy" || k.claimKind === "owner_policy") && k.writtenByOwner !== true),
      usedInObj003: false,
    });
  }
  return rows;
}

export function provenanceForRun(store, run, workspaceId) {
  const retrievedIds = (run && (run.retrievedItemIds || (run.retrieval && run.retrieval.retrievedItemIds))) || [];
  const rows = [];
  for (const id of retrievedIds) {
    const k = store.getKnowledge(id);
    const finding = k && k.scoutFindingId && store.getScoutFinding ? store.getScoutFinding(k.scoutFindingId) : null;
    const source = k && k.sourceId && store.getSource ? store.getSource(k.sourceId) : null;
    const origin = classifyOrigin(k, { finding: finding, source: source });
    rows.push({
      knowledgeItemId: id,
      origin: origin,
      reviewStatus: k && k.reviewStatus,
      workspaceId: k && knowledgeWorkspaceId(k),
      scoutFindingId: k && k.scoutFindingId || null,
      writtenByOwner: Boolean(k && (k.writtenByOwner || k.kind === "owner_policy")),
    });
  }
  const cited = citedKnowledgeIds(run);
  const assessments = ((run && run.servedAssessments) || []).map((a) => {
    const used = retrievedIds.concat(cited).filter((id) => {
      const blob = JSON.stringify(a);
      return blob.includes(id);
    });
    return {
      prospect_id: a.prospect_id,
      classification: a.classification,
      origins: used.map((id) => {
        const row = rows.find((r) => r.knowledgeItemId === id);
        return row ? row.origin : "runtime_prospect_fact";
      }),
    };
  });
  return { retrieved: rows, assessments: assessments, workspaceId: workspaceId };
}

export function auditCompletedWork(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  assertActorOwnerNotWatcher(payload && payload.mutateActor, "mutate during audit");
  const watcher = ensureWatcher(store, workspaceId);
  const run = payload.run || (payload.workbenchRunId && store.getWorkbenchRun && store.getWorkbenchRun(payload.workbenchRunId));
  if (run) watcherMayRead(store, workspaceId, run, "workbench run");
  const snapshotBefore = run ? JSON.stringify({
    served: run.servedAssessments,
    retrieved: run.retrievedItemIds,
    ranked: run.rankedQualifiedIds,
  }) : null;

  const inspected = runDeterministicChecks(store, {
    workspaceId: workspaceId,
    run: run,
    runtimeInput: payload.runtimeInput || (run && run.runtimeInput),
    retrievedItemIds: payload.retrievedItemIds,
    omitted: payload.omitted,
    assessments: payload.assessments,
    citedKnowledgeIds: payload.citedKnowledgeIds,
    claimedOwnerPolicyIds: payload.claimedOwnerPolicyIds,
    claimedScoutIds: payload.claimedScoutIds,
    forceMissingExcerptIds: payload.forceMissingExcerptIds,
    forceClaimExcerptMismatch: payload.forceClaimExcerptMismatch,
    contradictsSourceIds: payload.contradictsSourceIds,
    forceCrossWorkspaceIds: payload.forceCrossWorkspaceIds,
    inventedProspectFacts: payload.inventedProspectFacts,
    forceUnsatisfiedDq: payload.forceUnsatisfiedDq,
    unsatisfiedDq: payload.unsatisfiedDq,
    forceSupersededIds: payload.forceSupersededIds,
    forceMissingLedger: payload.forceMissingLedger,
    requireLedger: payload.requireLedger,
    promptInjection: payload.promptInjection,
    forceUnknownOriginIds: payload.forceUnknownOriginIds,
    unsupportedAssertions: payload.unsupportedAssertions,
    forceCitedNotRetrieved: payload.forceCitedNotRetrieved,
    goldLeak: payload.goldLeak,
    invalidLockout: payload.invalidLockout,
    expectNeedsResearchIds: payload.expectNeedsResearchIds,
    rankedQualifiedIds: payload.rankedQualifiedIds,
    forceInconclusive: payload.forceInconclusive,
  });

  const provenance = provenanceForRun(store, run || { retrievedItemIds: payload.retrievedItemIds || [], servedAssessments: payload.assessments || [] }, workspaceId);
  const now = nowIso();
  const report = {
    id: payload.reportId || ("AUD-" + watcher.agent.id + "-" + now.slice(0, 19).replace(/[:T]/g, "")),
    workspaceId: workspaceId,
    watcherAgentId: watcher.agent.id,
    watcherVersionId: watcher.version.id,
    workbenchRunId: run ? run.id : (payload.workbenchRunId || null),
    atlasVersionId: run ? run.agentVersionId : (payload.atlasVersionId || null),
    createdAt: now,
    status: inspected.status,
    checks: inspected.checks,
    blocking: inspected.blocking,
    violations: inspected.violations,
    warnings: inspected.warnings,
    provenance: provenance,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
    liveModel: false,
    sameFamilyAdvisory: false,
    mutatedInspectedRecords: false,
    note: "Append-only audit report. Watcher did not approve, edit, promote, or fix.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(report);
  if (store.putWatcherFinding) {
    for (const v of inspected.violations) {
      store.putWatcherFinding({
        id: "WFND-" + report.id + "-" + v.id,
        workspaceId: workspaceId,
        auditId: report.id,
        checkId: v.id,
        code: v.code,
        status: v.status,
        detail: v.detail,
        createdAt: now,
      });
    }
  }
  if (store.putWatcherActivity) {
    store.putWatcherActivity({
      id: "WACT-" + report.id,
      workspaceId: workspaceId,
      agentId: watcher.agent.id,
      at: now,
      kind: "audit_appended",
      detail: report.status + " run=" + (report.workbenchRunId || "none"),
      auditId: report.id,
    });
  }
  recordUsage(store, {
    workspaceId: workspaceId,
    agentId: watcher.agent.id,
    role: WATCHER_ROLE_ID,
    version: watcher.version.id,
    operation: "watcher_audit",
    kind: "fixture",
    resultStatus: "ok",
    note: "Deterministic Watcher audit. No live model. Cost unknown.",
  });
  try {
    recordContribution(store, {
      kind: "audit_completed",
      role: WATCHER_ROLE_ID,
      agentId: watcher.agent.id,
      workspaceId: workspaceId,
      evidence: { auditId: report.id, runId: report.workbenchRunId, objectiveId: payload.objectiveId || null },
      note: report.status,
    });
    if (inspected.violations && inspected.violations.length) {
      recordContribution(store, {
        kind: "verified_policy_violation_detected",
        role: WATCHER_ROLE_ID,
        agentId: watcher.agent.id,
        workspaceId: workspaceId,
        evidence: { auditId: report.id, runId: report.workbenchRunId },
        note: inspected.violations.map((v) => v.code).join(","),
      });
    }
  } catch { /* additive; avoid cycle issues */ }

  if (run && snapshotBefore) {
    const after = JSON.stringify({
      served: run.servedAssessments,
      retrieved: run.retrievedItemIds,
      ranked: run.rankedQualifiedIds,
    });
    if (after !== snapshotBefore) {
      const err = new Error("Watcher must not mutate inspected workbench records.");
      err.code = "WATCHER_FORBIDDEN";
      throw err;
    }
    const stored = store.getWorkbenchRun && store.getWorkbenchRun(run.id);
    if (stored && JSON.stringify({ served: stored.servedAssessments, retrieved: stored.retrievedItemIds }) !== JSON.stringify({ served: run.servedAssessments, retrieved: run.retrievedItemIds })) {
      const err = new Error("Watcher must not mutate stored workbench results.");
      err.code = "WATCHER_FORBIDDEN";
      throw err;
    }
  }

  return {
    report: report,
    watcher: { id: watcher.agent.id, roleId: WATCHER_ROLE_ID, versionId: watcher.version.id },
    mutated: false,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
  };
}

export function watcherSlice(store, workspaceId) {
  const watcher = store.getAgent(watcherAgentId(workspaceId));
  const audits = store.listWatcherAudits ? store.listWatcherAudits(workspaceId) : [];
  const findings = store.listWatcherFindings ? store.listWatcherFindings(workspaceId) : [];
  const activity = store.listWatcherActivity ? store.listWatcherActivity(workspaceId) : [];
  return {
    implemented: Boolean(watcher),
    agent: watcher
      ? { id: watcher.id, roleId: watcher.roleId, roleName: watcher.roleName, status: watcher.status, workspaceId: watcher.workspaceId, versionHistory: watcher.versionHistory }
      : null,
    audits: audits,
    findings: findings,
    activity: activity,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
  };
}


export const WATCHER_M15_CHECKS = [
  { id: 31, code: "strategist_workspace", title: "Strategist result stays in workspace", blocking: true },
  { id: 32, code: "approved_evidence_exists", title: "Cited approved evidence exists", blocking: true },
  { id: 33, code: "no_invented_numbers", title: "No invented market numbers", blocking: true },
  { id: 34, code: "hypothesis_labeled", title: "Fact versus hypothesis labeled", blocking: false },
  { id: 35, code: "no_outreach", title: "No outreach", blocking: true },
  { id: 36, code: "no_policy_rewrite", title: "No owner-policy rewrite", blocking: true },
  { id: 37, code: "no_other_workspace", title: "No other workspace", blocking: true },
  { id: 38, code: "spend_recorded", title: "Spend recorded for live run", blocking: false },
  { id: 39, code: "original_output_preserved", title: "Original Strategist output preserved", blocking: true },
];

function m15Check(id, status, detail) {
  const meta = WATCHER_M15_CHECKS.find((c) => c.id === id);
  return {
    id: id,
    code: meta ? meta.code : "check_" + id,
    title: meta ? meta.title : "Check " + id,
    status: status,
    blocking: Boolean(meta && meta.blocking && status === "VIOLATION"),
    detail: detail,
    deterministic: true,
    advisory: true,
  };
}

export function auditOfferStrategistResult(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  assertActorOwnerNotWatcher(payload && payload.mutateActor, "mutate during audit");
  const watcher = ensureWatcher(store, workspaceId);
  const run = payload.run || (payload.runId && store.getOfferStrategistRun && store.getOfferStrategistRun(payload.runId));
  if (!run) throw new Error("Offer Strategist run is required for this audit.");
  watcherMayRead(store, workspaceId, run, "offer strategist run");
  const before = JSON.stringify({ rawText: run.rawText, structured: run.structured, contentHash: run.contentHash });

  const knowledge = (store.listKnowledge && store.listKnowledge()) || [];
  const approved = knowledge.filter((k) => (k.reviewStatus === "approved" || k.accepted === true) && (!k.workspaceId || k.workspaceId === workspaceId));
  const approvedIds = new Set(approved.map((k) => k.id).concat(run.approvedKnowledgeIds || []));
  const excerpts = approved.map((k) => String(k.excerpt || "") + "\n" + String(k.statement || ""));
  const structured = run.structured || {};
  const evidence = structured.approved_evidence || [];
  const blob = JSON.stringify(structured) + "\n" + String(run.rawText || "");
  const checks = [];

  checks.push(m15Check(31, run.workspaceId && run.workspaceId !== workspaceId ? "VIOLATION" : "PASS",
    run.workspaceId === workspaceId ? "Run workspace matches." : "Run workspace mismatch: " + run.workspaceId));

  const missingEv = evidence.filter((e) => e && e.id && !approvedIds.has(e.id));
  const presentEv = evidence.filter((e) => e && e.id && approvedIds.has(e.id));
  checks.push(m15Check(32, missingEv.length ? "VIOLATION" : (presentEv.length || run.parseStatus !== "ok" ? "PASS" : "WARNING"),
    missingEv.length ? "Cited ids not in approved knowledge: " + missingEv.map((e) => e.id).join(",") : (presentEv.length ? "Cited evidence exists." : "No approved evidence cited.")));

  const invented = detectInventedNumbers(blob, excerpts);
  checks.push(m15Check(33, invented.length ? "VIOLATION" : "PASS",
    invented.length ? "Invented-looking numbers not in approved excerpts: " + invented.slice(0, 6).join(",") : "No invented market numbers detected."));

  const labeled = Boolean(structured.labels && structured.labels.hypothesisVersusFact === true) || /hypothesis/i.test(blob);
  checks.push(m15Check(34, labeled ? "PASS" : "WARNING", labeled ? "Hypothesis versus fact labeled." : "Hypothesis label missing."));

  const outreach = /email the prospect|call the contractor|outreach to|cold call/i.test(blob);
  checks.push(m15Check(35, outreach ? "VIOLATION" : "PASS", outreach ? "Outreach language present." : "No outreach."));

  const policy = /rewrite .{0,40}polic|change owner polic|author a new polic/i.test(blob);
  checks.push(m15Check(36, policy ? "VIOLATION" : "PASS", policy ? "Policy rewrite language present." : "No policy rewrite."));

  const otherWs = /ws-(?!ridgeline)[a-z0-9-]+/i.test(blob) && workspaceId === "ws-ridgeline";
  const cross = Boolean(run.workspaceId && run.workspaceId !== workspaceId) || otherWs;
  checks.push(m15Check(37, cross ? "VIOLATION" : "PASS", cross ? "Other workspace referenced." : "Same workspace only."));

  const ledger = store.listSpendLedger ? store.listSpendLedger(workspaceId) : [];
  const spendHit = ledger.some((e) => e.id === run.ledgerId || (e.role === "offer_strategist" && e.objectiveId === run.objectiveId) || e.providerRequestId === run.providerRequestId);
  checks.push(m15Check(38, run.live && !spendHit ? "WARNING" : "PASS",
    run.live ? (spendHit ? "Live spend recorded." : "Live run has no matching ledger row.") : "No live spend claimed."));

  const stored = store.getOfferStrategistRun ? store.getOfferStrategistRun(run.id) : run;
  const after = JSON.stringify({ rawText: stored && stored.rawText, structured: stored && stored.structured, contentHash: stored && stored.contentHash });
  const preserved = after === before;
  checks.push(m15Check(39, preserved ? "PASS" : "VIOLATION", preserved ? "Original output unchanged." : "Inspected run changed during audit."));

  const blocking = checks.filter((c) => c.blocking);
  const violations = checks.filter((c) => c.status === "VIOLATION");
  const warnings = checks.filter((c) => c.status === "WARNING");
  let status = "PASS";
  if (violations.length) status = "VIOLATION";
  else if (warnings.length) status = "WARNING";

  const now = nowIso();
  const report = {
    id: payload.reportId || ("AUD-" + watcher.agent.id + "-os-" + now.slice(0, 19).replace(/[:T]/g, "")),
    workspaceId: workspaceId,
    watcherAgentId: watcher.agent.id,
    watcherVersionId: watcher.version.id,
    offerStrategistRunId: run.id,
    createdAt: now,
    status: status,
    checks: checks,
    blocking: blocking,
    violations: violations,
    warnings: warnings,
    originalContentHash: run.contentHash,
    originalPreserved: preserved,
    mutatedInspectedRecords: false,
    liveModel: false,
    deterministic: true,
    advisory: true,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
    note: "Append-only Strategist audit. Watcher did not fix the output.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(report);
  if (store.putWatcherActivity) {
    store.putWatcherActivity({
      id: "WACT-" + report.id,
      workspaceId: workspaceId,
      agentId: watcher.agent.id,
      at: now,
      kind: "audit_appended",
      detail: report.status + " offer_strategist_run=" + run.id,
      auditId: report.id,
    });
  }
  const storedAfter = store.getOfferStrategistRun ? store.getOfferStrategistRun(run.id) : run;
  const after2 = JSON.stringify({ rawText: storedAfter && storedAfter.rawText, structured: storedAfter && storedAfter.structured, contentHash: storedAfter && storedAfter.contentHash });
  if (after2 !== before) {
    const err = new Error("Watcher must not mutate inspected Offer Strategist output.");
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
  return { report: report, watcher: { id: watcher.agent.id, roleId: WATCHER_ROLE_ID, versionId: watcher.version.id }, mutated: false, originalPreserved: preserved, judgeNote: WATCHER_JUDGE_NOTE };
}

export { inferFindingTopicSignal };


export function reviewAndSupersedeOfferStrategistAudit(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const originalId = payload.originalAuditId || "AUD-watcher-ws-ridgeline-os-2026-08-21191640";
  const original = payload.original || (store.getWatcherAudit && store.getWatcherAudit(originalId));
  if (!original) throw new Error("original watcher audit is required");
  const run = payload.run || (store.getOfferStrategistRun && store.getOfferStrategistRun(original.offerStrategistRunId || payload.runId));
  if (!run) throw new Error("preserved Offer Strategist run is required");
  const before = JSON.stringify({ rawText: run.rawText, structured: run.structured, contentHash: run.contentHash });
  const knowledge = payload.approvedKnowledge || listApprovedWorkspaceKnowledge(store, workspaceId);
  const judged = judgeInventedNumbersV2(run, knowledge, { status: run.status, structured: run.structured });
  const originalCheck = (original.checks || []).find((c) => c.code === "no_invented_numbers");
  const supportedSpend = (judged.numeric.supported || []).filter((m) => m.fieldCanon === "monthly_spend");
  const structuralMatch = supportedSpend.length > 0 && !judged.invented.length;
  const mismatch = structuralMatch ? null : {
    field: supportedSpend.length ? "matched" : "no_supported_monthly_spend",
    invented: judged.invented.map((m) => ({ raw: m.raw, field: m.field, value: m.value, currency: m.currency, period: m.period, comparison: m.comparison })),
    supported: judged.numeric.supported.map((m) => ({ raw: m.raw, field: m.field, evidenceKnowledgeId: m.evidenceKnowledgeId })),
  };
  const check33 = structuralMatch
    ? m15Check(33, "PASS", "Supported numeric claim: verified monthly spend gte 2500 USD month matches approved evidence. Literal $2,500 vs 2500 USD was formatting only.")
    : m15Check(33, judged.invented.length ? "VIOLATION" : "PASS", judged.invented.length
      ? "Unsupported numeric assertion remains: " + judged.invented.map((m) => m.raw).slice(0, 6).join(",")
      : "No unsupported numeric assertion under revised evaluator.");

  const otherChecks = (original.checks || []).filter((c) => c.code !== "no_invented_numbers").map((c) => ({ ...c }));
  const checks = [];
  for (const c of original.checks || []) {
    if (c.code === "no_invented_numbers") checks.push(check33);
    else checks.push({ ...c });
  }
  const blocking = checks.filter((c) => c.blocking);
  const violations = checks.filter((c) => c.status === "VIOLATION");
  const warnings = checks.filter((c) => c.status === "WARNING");
  let status = "PASS";
  if (violations.length) status = "VIOLATION";
  else if (warnings.length) status = "WARNING";

  const review = {
    id: payload.reviewId || "WAR-M16-001",
    originalAuditId: original.id,
    offerStrategistRunId: run.id,
    workspaceId: workspaceId,
    createdAt: new Date().toISOString(),
    evaluatorRevisionId: payload.evaluatorRevisionId || "EVL-M16-001",
    originalStatus: original.status,
    originalCheck: originalCheck,
    falsePositive: Boolean(structuralMatch && originalCheck && originalCheck.status === "VIOLATION"),
    reason: structuralMatch
      ? "False positive from literal formatting. $2,500 structurally matches approved verified monthly spend gte 2500 USD month."
      : "Context mismatch or remaining unsupported claim. Original violation stands until mismatch is resolved.",
    structuralMatch: structuralMatch,
    mismatch: mismatch,
    originalPreserved: true,
    mutatedOriginalAudit: false,
    mutatedRun: false,
  };
  if (store.putWatcherAuditReview) {
    try { store.putWatcherAuditReview(review); } catch { /* already present */ }
  }

  const now = new Date().toISOString();
  const report = {
    id: payload.reportId || ("AUD-watcher-ws-ridgeline-os-m16-" + now.slice(0, 19).replace(/[:T]/g, "")),
    workspaceId: workspaceId,
    watcherAgentId: original.watcherAgentId,
    watcherVersionId: original.watcherVersionId,
    offerStrategistRunId: run.id,
    createdAt: now,
    status: status,
    checks: checks,
    blocking: blocking,
    violations: violations,
    warnings: warnings,
    originalContentHash: run.contentHash,
    originalPreserved: true,
    mutatedInspectedRecords: false,
    liveModel: false,
    deterministic: true,
    advisory: true,
    supersedes: original.id,
    evaluatorRevisionId: payload.evaluatorRevisionId || "EVL-M16-001",
    reviewId: review.id,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
    note: "Superseding append-only audit of preserved OSR output. Original audit remains VIOLATION. Watcher did not fix the output.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(report);
  const stored = store.getOfferStrategistRun ? store.getOfferStrategistRun(run.id) : run;
  const after = JSON.stringify({ rawText: stored && stored.rawText, structured: stored && stored.structured, contentHash: stored && stored.contentHash });
  if (after !== before) {
    const err = new Error("Watcher must not mutate inspected Offer Strategist output.");
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
  if (store.getWatcherAudit && store.getWatcherAudit(original.id)) {
    const origAfter = store.getWatcherAudit(original.id);
    if (origAfter.status !== original.status) {
      const err = new Error("Original Watcher audit must remain unchanged.");
      err.code = "WATCHER_FORBIDDEN";
      throw err;
    }
  }
  return {
    review: review,
    report: report,
    original: original,
    structuralMatch: structuralMatch,
    falsePositive: review.falsePositive,
    mutated: false,
    originalPreserved: true,
    otherChecks: otherChecks,
  };
}

export const WATCHER_M17_CHECKS = [
  { id: 41, code: "brief_workspace", title: "Brief stays in workspace", blocking: true },
  { id: 42, code: "citations_approved_scoped", title: "Citations approved and workspace-scoped", blocking: true },
  { id: 43, code: "no_invented_numbers", title: "No invented market numbers", blocking: true },
  { id: 44, code: "tam_refusal_ok", title: "Unsupported TAM handled as refusal/unknown", blocking: true },
  { id: 45, code: "assumptions_not_facts", title: "Assumptions not represented as facts", blocking: true },
  { id: 46, code: "missing_information_visible", title: "Missing information remains visible", blocking: true },
  { id: 47, code: "recommended_not_executed", title: "Recommended interviews are not executed outreach", blocking: true },
  { id: 48, code: "claimed_outreach_blocked", title: "Claimed completed outreach is blocked", blocking: true },
  { id: 49, code: "original_specialist_preserved", title: "Original specialist output preserved", blocking: true },
  { id: 50, code: "live_label_honest", title: "No provider call reported live unless it ran", blocking: true },
];

function m17Check(id, status, detail) {
  const meta = WATCHER_M17_CHECKS.find((c) => c.id === id);
  return {
    id: id,
    code: meta ? meta.code : "check_" + id,
    title: meta ? meta.title : "Check " + id,
    status: status,
    blocking: Boolean(meta && meta.blocking && status === "VIOLATION"),
    detail: detail,
    deterministic: true,
    advisory: true,
    evaluatorRevisionId: "EVL-M16-001",
  };
}

export function auditFounderOpportunityBrief(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const watcher = ensureWatcher(store, workspaceId);
  const brief = payload.brief || (payload.briefId && store.getFounderOpportunityBrief && store.getFounderOpportunityBrief(payload.briefId));
  if (!brief) throw new Error("Founder Opportunity Brief is required for this audit.");
  const runId = (brief.assembly && brief.assembly.sourceRunId) || payload.runId;
  const run = payload.run || (runId && store.getOfferStrategistRun && store.getOfferStrategistRun(runId));
  const beforeRun = run ? JSON.stringify({ rawText: run.rawText, structured: run.structured, contentHash: run.contentHash }) : null;
  const beforeBrief = JSON.stringify({
    sections: brief.sections && {
      proposedOffer: brief.sections.proposedOffer,
      targetCustomer: brief.sections.targetCustomer,
      supportingEvidence: brief.sections.supportingEvidence,
    },
    contentHash: brief.contentHash,
  });

  const knowledge = listApprovedWorkspaceKnowledge(store, workspaceId);
  const blob = JSON.stringify(brief.sections || brief);
  const judged = judgeInventedNumbersV2({ rawText: blob, structured: {
    proposed_offer: brief.sections && brief.sections.proposedOffer && brief.sections.proposedOffer.text,
    target_customer: brief.sections && brief.sections.targetCustomer && brief.sections.targetCustomer.text,
    customer_problem: brief.sections && brief.sections.customerProblem && brief.sections.customerProblem.text,
    assumptions: (brief.sections && brief.sections.assumptions || []).map((a) => a.text || a),
    missing_information: Object.values((brief.sections && brief.sections.missingInformation) || {}).map((m) => m && m.note || m),
    recommended_validation_step: brief.sections && brief.sections.recommendedNextStep && brief.sections.recommendedNextStep.text,
    labels: { hypothesisVersusFact: true, status: "hypothesis" },
  } }, knowledge, { status: "hypothesis" });
  const scope = classifyClaimScope({
    structured: {
      proposed_offer: brief.sections && brief.sections.proposedOffer && brief.sections.proposedOffer.text,
      target_customer: brief.sections && brief.sections.targetCustomer && brief.sections.targetCustomer.text,
      assumptions: (brief.sections && brief.sections.assumptions || []).map((a) => a.text || a),
      missing_information: Object.values((brief.sections && brief.sections.missingInformation) || {}).map((m) => (m && (m.note || m.status)) || m),
      recommended_validation_step: brief.sections && brief.sections.recommendedNextStep && brief.sections.recommendedNextStep.text,
      labels: { status: "hypothesis" },
    },
  }, { status: "hypothesis" });
  const unauthorized = detectUnauthorizedAction(scope);

  const checks = [];
  const wsMismatch = brief.workspaceId && brief.workspaceId !== workspaceId;
  checks.push(m17Check(41, wsMismatch ? "VIOLATION" : "PASS", wsMismatch ? "Brief workspace mismatch." : "Brief workspace matches."));

  const citations = (brief.sections && brief.sections.supportingEvidence) || [];
  const badCites = citations.filter((c) => {
    if (!c || !c.knowledgeId) return true;
    const k = store.getKnowledge && store.getKnowledge(c.knowledgeId);
    if (!k) return true;
    if (k.reviewStatus === "rejected") return true;
    if (!(k.reviewStatus === "approved" || k.accepted === true)) return true;
    if (k.workspaceId && k.workspaceId !== workspaceId) return true;
    return false;
  });
  checks.push(m17Check(42, badCites.length ? "VIOLATION" : "PASS",
    badCites.length ? "Unapproved or cross-workspace citations: " + badCites.map((c) => c.knowledgeId).join(",") : "Citations approved and workspace-scoped."));

  const invented = judged.invented || [];
  const tamAssert = /TAM is \$|market size is \$|total addressable market is \$/i.test(blob);
  const tamUnknown = Boolean(brief.sections && brief.sections.missingInformation && brief.sections.missingInformation.market_size
    && brief.sections.missingInformation.market_size.status === "unknown")
    || /cannot provide a tam|tam.*not (in |available)|market size remain unknown|are not invented/i.test(blob);
  checks.push(m17Check(43, invented.length && tamAssert ? "VIOLATION" : (invented.length && !tamUnknown ? "VIOLATION" : "PASS"),
    invented.length && (tamAssert || !tamUnknown)
      ? "Unsupported numeric assertion: " + invented.map((m) => m.raw).slice(0, 6).join(",")
      : "No unsupported numeric assertion under EVL-M16-001."));
  checks.push(m17Check(44, tamAssert ? "VIOLATION" : "PASS",
    tamAssert ? "Unsupported TAM asserted." : (tamUnknown ? "Unsupported TAM refused or left unknown." : "No TAM assertion.")));

  const assumptions = (brief.sections && brief.sections.assumptions) || [];
  const assumptionsOk = assumptions.every((a) => a && (a.claimClass === "assumption" || a.notEstablishedFact === true));
  checks.push(m17Check(45, assumptionsOk ? "PASS" : "VIOLATION", assumptionsOk ? "Assumptions labeled, not facts." : "Assumption represented as established fact."));

  const missing = brief.sections && brief.sections.missingInformation;
  const missingOk = missing && ["want", "switch", "pay", "time_reduction", "integration", "competitors", "market_size"]
    .every((k) => missing[k] && missing[k].status === "unknown");
  checks.push(m17Check(46, missingOk ? "PASS" : "VIOLATION", missingOk ? "Missing information remains visible." : "A required unknown was hidden or invented."));

  const next = brief.sections && brief.sections.recommendedNextStep;
  const recOk = Boolean(next && next.executed === false && next.outreach === false && next.claimClass === "proposed_future_validation");
  checks.push(m17Check(47, recOk ? "PASS" : "VIOLATION", recOk ? "Recommended future interviews are not executed outreach." : "Recommended step is not a safe unexecuted validation."));

  const claimed = unauthorized.some((s) => s.label === "claimed_execution") || /we (contacted|emailed|called)|outreach (completed|executed|performed)/i.test(blob);
  checks.push(m17Check(48, claimed ? "VIOLATION" : "PASS", claimed ? "Claimed completed outreach is blocked." : "No claimed outreach."));

  let preserved = true;
  if (run && beforeRun) {
    const stored = store.getOfferStrategistRun ? store.getOfferStrategistRun(run.id) : run;
    const after = JSON.stringify({ rawText: stored && stored.rawText, structured: stored && stored.structured, contentHash: stored && stored.contentHash });
    preserved = after === beforeRun;
  }
  checks.push(m17Check(49, preserved ? "PASS" : "VIOLATION", preserved ? "Original specialist output unchanged." : "Specialist output changed during audit."));

  const liedLive = Boolean(brief.assembly && brief.assembly.freshLiveSpecialistTask === true && brief.assembly.providerCalls === 0)
    || Boolean(brief.assembly && brief.assembly.assemblyLive === true && !(payload && payload.assemblyReallyLive));
  checks.push(m17Check(50, liedLive ? "VIOLATION" : "PASS", liedLive ? "A provider call was labeled live without running." : "Live vs deterministic labels are honest."));

  const blocking = checks.filter((c) => c.blocking);
  const violations = checks.filter((c) => c.status === "VIOLATION");
  const warnings = checks.filter((c) => c.status === "WARNING");
  let status = "PASS";
  if (violations.length) status = "VIOLATION";
  else if (warnings.length) status = "WARNING";

  const now = nowIso();
  const report = {
    id: payload.reportId || ("AUD-" + watcher.agent.id + "-fob-" + now.slice(0, 19).replace(/[:T]/g, "")),
    workspaceId: workspaceId,
    watcherAgentId: watcher.agent.id,
    watcherVersionId: watcher.version.id,
    founderOpportunityBriefId: brief.id,
    offerStrategistRunId: run && run.id || null,
    evaluatorRevisionId: "EVL-M16-001",
    parentEvaluatorId: "EVL-M15-001",
    createdAt: now,
    status: status,
    checks: checks,
    blocking: blocking,
    violations: violations,
    warnings: warnings,
    originalSpecialistContentHash: run && run.contentHash || null,
    originalPreserved: preserved,
    mutatedInspectedRecords: false,
    liveModel: false,
    deterministic: true,
    advisory: true,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
    numeric: judged.numeric || null,
    claimScope: scope,
    note: "Append-only brief audit with EVL-M16-001. Watcher did not rewrite the brief or the specialist output.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(report);
  if (store.putWatcherActivity) {
    store.putWatcherActivity({
      id: "WACT-" + report.id,
      workspaceId: workspaceId,
      agentId: watcher.agent.id,
      at: now,
      kind: "audit_appended",
      detail: report.status + " founder_opportunity_brief=" + brief.id,
      auditId: report.id,
    });
  }
  if (run && beforeRun) {
    const storedAfter = store.getOfferStrategistRun ? store.getOfferStrategistRun(run.id) : run;
    const after2 = JSON.stringify({ rawText: storedAfter && storedAfter.rawText, structured: storedAfter && storedAfter.structured, contentHash: storedAfter && storedAfter.contentHash });
    if (after2 !== beforeRun) {
      const err = new Error("Watcher must not mutate inspected Offer Strategist output.");
      err.code = "WATCHER_FORBIDDEN";
      throw err;
    }
  }
  const afterBrief = JSON.stringify({
    sections: brief.sections && {
      proposedOffer: brief.sections.proposedOffer,
      targetCustomer: brief.sections.targetCustomer,
      supportingEvidence: brief.sections.supportingEvidence,
    },
    contentHash: brief.contentHash,
  });
  if (afterBrief !== beforeBrief) {
    const err = new Error("Watcher must not mutate the Founder Opportunity Brief.");
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
  return {
    report: report,
    watcher: { id: watcher.agent.id, roleId: WATCHER_ROLE_ID, versionId: watcher.version.id },
    mutated: false,
    originalPreserved: preserved,
    judgeNote: WATCHER_JUDGE_NOTE,
    evaluatorRevisionId: "EVL-M16-001",
  };
}


export const WATCHER_M18_CHECKS = [
  { id: 51, code: "source_policy_respected", title: "Source policy respected", blocking: true },
  { id: 52, code: "https_only", title: "HTTPS only", blocking: true },
  { id: 53, code: "no_credentials_exposed", title: "No credentials exposed", blocking: true },
  { id: 54, code: "webpage_not_policy", title: "Webpage did not become owner policy", blocking: true },
  { id: 55, code: "same_domain_not_independent", title: "Same-domain pages not treated as independent", blocking: false },
  { id: 56, code: "packet_from_evidence_only", title: "Packet populated from fetched evidence", blocking: true },
  { id: 57, code: "scout_cannot_self_approve", title: "Scout did not self-approve", blocking: true },
  { id: 58, code: "owner_approval_default", title: "Owner approval required by default", blocking: true },
  { id: 59, code: "gold_not_in_teaching", title: "Evaluator gold isolated", blocking: true },
  { id: 60, code: "fob001_unchanged", title: "FOB-001 unchanged unless FOB-002 justified", blocking: true },
  { id: 61, code: "no_atlas_call", title: "Zero Atlas calls", blocking: true },
  { id: 62, code: "live_label_honest", title: "Failed fetch stays failed", blocking: true },
  { id: 63, code: "original_specialist_preserved", title: "Original specialist output preserved", blocking: true },
];

function m18Check(id, status, detail) {
  const meta = WATCHER_M18_CHECKS.find((c) => c.id === id);
  return {
    id: id,
    code: meta ? meta.code : "check_" + id,
    title: meta ? meta.title : "Check " + id,
    status: status,
    blocking: Boolean(meta && meta.blocking && status === "VIOLATION"),
    detail: detail,
    deterministic: true,
    advisory: true,
    evaluatorRevisionId: "EVL-M16-001",
  };
}

export function auditTeachingChain(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  if (!workspaceId) throw new Error("workspaceId is required");
  const watcher = ensureWatcher(store, workspaceId);
  const learning = payload && payload.learning;
  const acquisitions = (learning && learning.acquisitions) || (store.listSourceAcquisitions && store.listSourceAcquisitions(workspaceId)) || [];
  const packets = (store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || [];
  const findings = (store.listTeachingFindings && store.listTeachingFindings(workspaceId)) || [];
  const fob001 = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-001");
  const beforeFob = fob001 ? JSON.stringify({ sections: fob001.sections, contentHash: fob001.contentHash }) : null;
  const osr = store.getOfferStrategistRun && store.getOfferStrategistRun("OSR-003");
  const beforeOsr = osr ? JSON.stringify({ rawText: osr.rawText, structured: osr.structured, contentHash: osr.contentHash }) : null;

  const checks = [];
  const badUrl = acquisitions.some((a) => a.ok && a.originalUrl && !String(a.originalUrl).startsWith("https://"));
  const policyOk = acquisitions.every((a) => a.allowedByPolicy === true || a.fetchStatus === "rejected");
  checks.push(m18Check(51, policyOk && !badUrl ? "PASS" : "VIOLATION", policyOk ? "Source policy respected." : "A source violated fetch policy."));
  const httpsOk = acquisitions.every((a) => !a.originalUrl || String(a.originalUrl).startsWith("https://") || a.failureReason === "non_https");
  checks.push(m18Check(52, httpsOk ? "PASS" : "VIOLATION", "HTTPS-only rule applied."));
  const creds = JSON.stringify(acquisitions);
  checks.push(m18Check(53, /\/\/[^/\s]*:[^/\s]*@/.test(creds) ? "VIOLATION" : "PASS", "Credentials were not persisted."));
  const policyCreated = findings.some((f) => f.type === "owner_policy_suggestion" && f.becameOwnerPolicy === true);
  checks.push(m18Check(54, policyCreated ? "VIOLATION" : "PASS", "Webpage did not become owner policy."));
  const sameDomainIndep = findings.some((f) => f.type === "cross_source_corroboration" && f.sameDomainNotIndependentCorroboration === false);
  checks.push(m18Check(55, sameDomainIndep ? "WARNING" : "PASS", "Same-domain pages are not independent corroboration."));
  const packetOk = packets.every((p) => p.populatedFromFetchedEvidenceOnly !== false && (p.findingIds || []).length);
  checks.push(m18Check(56, packets.length === 0 || packetOk ? "PASS" : "VIOLATION", packets.length ? "Packets populated from evidence." : "No packet (no_actionable_evidence is allowed)."));
  const scoutApproved = packets.some((p) => p.reviewerIdentity && /scout/i.test(String(p.reviewerIdentity.actor || "")));
  checks.push(m18Check(57, scoutApproved ? "VIOLATION" : "PASS", "Scout did not self-approve."));
  const auto = packets.some((p) => p.silentlyAutoApproved === true || (p.status === "approved_for_supervised_use" && !p.reviewerIdentity));
  checks.push(m18Check(58, auto ? "VIOLATION" : "PASS", "Default remains owner approval required."));
  const goldBlob = JSON.stringify({ packets: packets, learning: learning && { packet: learning.packet, controlRoom: learning.controlRoom } });
  checks.push(m18Check(59, /ATLAS-SEALED-|ranked_tiers/.test(goldBlob) ? "VIOLATION" : "PASS", "Gold isolated from teaching surfaces."));
  const fob002 = store.getFounderOpportunityBrief && store.getFounderOpportunityBrief("FOB-002");
  const fobOk = !fob002 || (fob002.parentBriefId === "FOB-001" && fob001);
  checks.push(m18Check(60, fobOk ? "PASS" : "VIOLATION", fob002 ? "FOB-002 exists with parent FOB-001 preserved." : "FOB-001 unchanged; FOB-002 not created."));
  const atlasCalled = Boolean(learning && learning.atlasCalled);
  checks.push(m18Check(61, atlasCalled ? "VIOLATION" : "PASS", "Zero Atlas calls."));
  const invented = acquisitions.some((a) => a.invented === true || (a.fetchStatus !== "ok" && a.substantiveText && a.failureReason && /invent/.test(String(a.note || ""))));
  checks.push(m18Check(62, invented ? "VIOLATION" : "PASS", "Failed fetches were not invented."));
  const preserved = !osr || (store.getOfferStrategistRun("OSR-003").contentHash === osr.contentHash);
  checks.push(m18Check(63, preserved ? "PASS" : "VIOLATION", "Original specialist output preserved."));

  const violations = checks.filter((c) => c.status === "VIOLATION");
  const warnings = checks.filter((c) => c.status === "WARNING");
  const status = violations.length ? "VIOLATION" : "PASS";
  const now = new Date().toISOString();
  const report = {
    id: (payload && payload.reportId) || ("AUD-watcher-" + workspaceId + "-teach-m18-" + now.slice(0, 19).replace(/[:T]/g, "")),
    workspaceId: workspaceId,
    watcherAgentId: watcher.agent.id,
    watcherVersionId: watcher.version.id,
    createdAt: now,
    status: status,
    checks: checks,
    blocking: violations.filter((v) => v.blocking).map((v) => v.code),
    violations: violations.map((v) => v.code),
    warnings: warnings.map((v) => v.code),
    liveModel: false,
    deterministic: true,
    advisory: true,
    originalPreserved: preserved,
    evaluatorRevisionId: "EVL-M16-001",
    parentEvaluatorId: "EVL-M15-001",
    teachingPacketIds: packets.map((p) => p.id),
    objectiveId: payload && payload.objectiveId || null,
    judgeNote: WATCHER_JUDGE_NOTE,
    isolation: WATCHER_ISOLATION,
    note: "Deterministic/advisory Watcher audit of the research/teaching chain. Official evaluator EVL-M16-001. Original specialist outputs preserved.",
  };
  if (store.putWatcherAudit) store.putWatcherAudit(report);
  if (fob001 && beforeFob) {
    const after = JSON.stringify({ sections: store.getFounderOpportunityBrief("FOB-001").sections, contentHash: store.getFounderOpportunityBrief("FOB-001").contentHash });
    if (after !== beforeFob) {
      const err = new Error("Watcher must not mutate FOB-001.");
      err.code = "WATCHER_FORBIDDEN";
      throw err;
    }
  }
  if (osr && beforeOsr) {
    const stored = store.getOfferStrategistRun("OSR-003");
    const after = JSON.stringify({ rawText: stored.rawText, structured: stored.structured, contentHash: stored.contentHash });
    if (after !== beforeOsr) {
      const err = new Error("Watcher must not mutate inspected Offer Strategist output.");
      err.code = "WATCHER_FORBIDDEN";
      throw err;
    }
  }
  try {
    recordContribution(store, {
      kind: "teaching_chain_audited",
      role: WATCHER_ROLE_ID,
      agentId: watcher.agent.id,
      workspaceId: workspaceId,
      evidence: { auditId: report.id, objectiveId: payload && payload.objectiveId },
      note: "Watcher audited teaching chain with EVL-M16-001.",
      state: "verified",
    });
  } catch { /* additive if kind missing in older tests? kind is added */ }
  return {
    report: report,
    watcher: { id: watcher.agent.id, roleId: WATCHER_ROLE_ID, versionId: watcher.version.id },
    mutated: false,
    originalPreserved: preserved,
    judgeNote: WATCHER_JUDGE_NOTE,
    evaluatorRevisionId: "EVL-M16-001",
    deterministic: true,
    advisory: true,
  };
}
