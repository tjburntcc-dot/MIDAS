/**
 * Managed venture loop v1.
 *
 * This is an event-sourced integration layer over MIDAS's existing worker,
 * foundry, frontier, manager, spend, approval, and shadow-mode primitives. It
 * deliberately has no provider client, transport, payment, deployment, or
 * promotion capability. A caller supplies local/mock worker outputs; this file
 * validates, records, reviews, and learns from them.
 */
import { createHash } from "node:crypto";
import { recordUsage } from "./spend-ledger.ts";
import { newWorkItem, putWorkItem } from "./work-item.ts";
import { assertActorAllowed, rejectMasonClaim } from "./approval-actors.ts";
import { FRONTIER_BASIC_PROMPT, frontierStrongPrompt } from "./frontier-arena.ts";
import { MANAGER_VERSION_ID } from "./manager.ts";
import { OPPORTUNITY_RESEARCHER_SPEC, RESEARCHER_ROLE_ID } from "./opportunity-researcher.ts";
import { OPPORTUNITY_QUALIFIER_SPEC, QUALIFIER_ROLE_ID } from "./opportunity-qualifier.ts";
import { recordIntent, newShadowSession } from "./shadow.ts";

export const MANAGED_VENTURE_SCHEMA_VERSION = "managed-venture-v1";
export const MANAGED_VENTURE_RECORD_FILE = "managed_venture_records.json";
export const OUTCOME_VERIFICATION = ["unknown", "simulated", "owner_reported", "independently_verified"] as const;
export const VENTURE_DISPOSITIONS = ["continue", "revise", "reallocate", "defer", "pause", "terminate"] as const;
export const WORK_ORDER_STATES = ["proposed", "approved", "executed", "returned", "rejected", "escalated"] as const;

export interface Scope { workspaceId: string; companyId: string; ventureId: string; }
export interface VersionRef { agentId: string; versionId: string; model: string; promptVersion: string; knowledgeVersion: string; toolVersion: string; policyVersion: string; }
export interface EvidenceRef { id: string; scope: Scope; capturedAt: string; status: "current" | "stale" | "contradicted"; claim: string; }
export interface Cost { usd: number | null; status: "estimated" | "unknown"; humanMinutes: number; modelCalls: number; }
export interface VentureRecord { id: string; type: string; schemaVersion: string; scope: Scope; createdAt: string; actor: string; parentIds: string[]; evidenceRefs: string[]; fingerprint: string; cost: Cost; authorityRequested: string; authorityUsed: string; confidence: number | null; uncertainty: string[]; [key: string]: any; }

const emptyCost = (): Cost => ({ usd: null, status: "unknown", humanMinutes: 0, modelCalls: 0 });
const now = () => new Date().toISOString();
const text = (v: unknown) => String(v || "").trim();
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const id = (kind: string, input: unknown) => `${kind}-${hash(input).slice(0, 16)}`;

function requireScope(scope: Partial<Scope>): asserts scope is Scope {
  if (!text(scope.workspaceId) || !text(scope.companyId) || !text(scope.ventureId)) throw new Error("workspaceId, companyId, and ventureId are required for isolation");
}
function sameScope(a: Scope, b: Scope) { return a.workspaceId === b.workspaceId && a.companyId === b.companyId && a.ventureId === b.ventureId; }
function records(store: any): VentureRecord[] { return store.listManagedVentureRecords ? store.listManagedVentureRecords() : store._listJson(MANAGED_VENTURE_RECORD_FILE); }
function append(store: any, rec: VentureRecord): VentureRecord {
  const prior = records(store).find((r) => r.id === rec.id);
  if (prior) return prior; // idempotent retry of the same deterministic record
  if (store.putManagedVentureRecord) return store.putManagedVentureRecord(rec);
  return store._putJsonById(MANAGED_VENTURE_RECORD_FILE, rec, true);
}
function base(type: string, scope: Scope, actor: string, input: any = {}): VentureRecord {
  requireScope(scope);
  const fingerprint = hash({ type, scope, input });
  return {
    id: id(type.toUpperCase(), { scope, input }), type, schemaVersion: MANAGED_VENTURE_SCHEMA_VERSION,
    scope, createdAt: input.createdAt || now(), actor: actor || "system", parentIds: input.parentIds || [], evidenceRefs: input.evidenceRefs || [],
    fingerprint, cost: input.cost || emptyCost(), authorityRequested: input.authorityRequested || "internal_read_only",
    authorityUsed: input.authorityUsed || "internal_read_only", confidence: input.confidence ?? null, uncertainty: input.uncertainty || [],
  };
}
function scoped(store: any, scope: Scope, type?: string) { return records(store).filter((r) => sameScope(r.scope, scope) && (!type || r.type === type)); }
function evidenceById(store: any, scope: Scope, ids: string[]) {
  const found = scoped(store, scope, "evidence").filter((r) => ids.includes(r.id));
  if (found.length !== ids.length) throw new Error("evidence reference is missing or belongs to another workspace/company/venture");
  return found;
}

export function validateBusinessObjective(input: any) {
  const errors: string[] = [];
  if (!text(input.title)) errors.push("objective title is required");
  if (!text(input.objective)) errors.push("objective statement is required");
  if (!Array.isArray(input.successConditions) || !input.successConditions.some((x: any) => text(x))) errors.push("at least one measurable success condition is required");
  if (!Array.isArray(input.failureConditions) || !input.failureConditions.some((x: any) => text(x))) errors.push("at least one failure or stopping condition is required");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) errors.push("objective needs evidence references; an unsupported economic claim is not a decision input");
  if (input.expectedValueUsd != null && (!Array.isArray(input.economicEvidenceRefs) || !input.economicEvidenceRefs.length)) errors.push("expected value needs economic evidence references");
  return { ok: errors.length === 0, errors };
}

export function createVenture(store: any, input: { scope: Scope; name: string; actor?: string; constraints?: string[]; evidenceRefs?: string[] }) {
  requireScope(input.scope);
  if (!text(input.name)) throw new Error("venture name is required");
  const rec = { ...base("venture", input.scope, input.actor || "system", { name: input.name, evidenceRefs: input.evidenceRefs || [] }), name: input.name,
    state: "active", constraints: input.constraints || [], provenance: "local_shadow", outcomeVerification: "unknown" };
  return append(store, rec);
}

export function recordEvidence(store: any, input: { scope: Scope; actor?: string; claim: string; status?: "current" | "stale" | "contradicted"; capturedAt?: string; parentIds?: string[] }) {
  if (!text(input.claim)) throw new Error("evidence claim is required");
  const rec = { ...base("evidence", input.scope, input.actor || "system", input), claim: input.claim, status: input.status || "current", capturedAt: input.capturedAt || now(), provenance: "local_fixture" };
  return append(store, rec);
}

export function submitBusinessObjective(store: any, input: any) {
  requireScope(input.scope); const check = validateBusinessObjective(input); if (!check.ok) throw new Error("invalid BusinessObjective: " + check.errors.join("; "));
  evidenceById(store, input.scope, input.evidenceRefs);
  const rec = { ...base("business_objective", input.scope, input.actor || "owner", input), title: input.title, objective: input.objective,
    successConditions: input.successConditions, failureConditions: input.failureConditions, economicAssumptions: input.economicAssumptions || [], economicEvidenceRefs: input.economicEvidenceRefs || [],
    authorityEnvelope: input.authorityEnvelope || "record_only", status: "active", version: Number(input.version || 1), outcomeVerification: "unknown" };
  return append(store, rec);
}

export interface CapabilityRequirement { id: string; capability: string; rationale: string; requiredAuthority: string; evidenceRefs: string[]; critical: boolean; }
export function deriveCapabilityRequirements(objective: any): CapabilityRequirement[] {
  return [
    { id: "CAP-RESEARCH", capability: "opportunity_research", rationale: "Extract stated opportunity facts with evidence fidelity.", requiredAuthority: "internal_read_only", evidenceRefs: objective.evidenceRefs, critical: true },
    { id: "CAP-ADVERSARIAL-QUALIFICATION", capability: "opportunity_adversarial_qualification", rationale: "Attack economic and execution attractiveness before owner attention is spent.", requiredAuthority: "internal_analysis", evidenceRefs: objective.evidenceRefs, critical: true },
    { id: "CAP-MANAGEMENT", capability: "venture_management", rationale: "Validate economic relevance, conflicts, authority, and handoffs.", requiredAuthority: "internal_management", evidenceRefs: objective.evidenceRefs, critical: true },
  ];
}

export interface WorkerCandidate { roleId: string; version: VersionRef; certified: boolean; certificationId?: string; certifiedBy?: string; capability: string; marginalCostUsd: number | null; marginalValueUsd: number | null; frontier?: boolean; }
export function defaultWorkers(): WorkerCandidate[] {
  return [
    { roleId: RESEARCHER_ROLE_ID, capability: "opportunity_research", certified: true, certificationId: "CERT-OR-SEALED-V1", certifiedBy: "independent_evaluator", marginalCostUsd: null, marginalValueUsd: null,
      version: { agentId: RESEARCHER_ROLE_ID, versionId: "or-v1", model: "fixture", promptVersion: "or-v1", knowledgeVersion: "K-OR-001..008", toolVersion: "read-only-text-v1", policyVersion: "researcher-policy-v1" } },
    { roleId: QUALIFIER_ROLE_ID, capability: "opportunity_adversarial_qualification", certified: false, certificationId: "CERT-OQ-PENDING", certifiedBy: "candidate_self_report", marginalCostUsd: null, marginalValueUsd: null,
      version: { agentId: QUALIFIER_ROLE_ID, versionId: "oq-v3", model: "fixture", promptVersion: "oq-v3", knowledgeVersion: "hemmer-policy-v3", toolVersion: "record-only-v1", policyVersion: "qualifier-policy-v3" } },
    { roleId: "frontier_opportunity_adversary", capability: "opportunity_adversarial_qualification", certified: true, certificationId: "BASELINE-FRONTIER-STRONG", certifiedBy: "independent_evaluator", frontier: true, marginalCostUsd: null, marginalValueUsd: null,
      version: { agentId: "frontier_opportunity_adversary", versionId: "frontier-strong-v1", model: "frontier-mock", promptVersion: "frontier-strong-v1", knowledgeVersion: "same-policy", toolVersion: "record-only-v1", policyVersion: "qualifier-policy-v3" } },
    { roleId: "venture_manager", capability: "venture_management", certified: true, certificationId: "CERT-MANAGER-INDEPENDENT-V1", certifiedBy: "independent_manager_evaluator", marginalCostUsd: null, marginalValueUsd: null,
      version: { agentId: "venture_manager", versionId: MANAGER_VERSION_ID, model: "deterministic", promptVersion: "manager-v1", knowledgeVersion: "manager-doctrine-v1", toolVersion: "record-review-v1", policyVersion: "manager-policy-v1" } },
  ];
}

/** Records the foundry lineage and an honest economic selection result. */
export function qualifyOpportunityAdversary(store: any, input: { scope: Scope; candidate: WorkerCandidate; frontier: WorkerCandidate; sealedCases: number; candidateQuality: number; frontierQuality: number; candidateCriticalFailures: number; frontierCriticalFailures: number; actor?: string }) {
  if (input.candidate.roleId === input.frontier.roleId) throw new Error("specialist and frontier baseline must be distinct contestants");
  if (input.candidate.certifiedBy === input.candidate.roleId) throw new Error("a worker cannot certify itself");
  const selected = input.candidateQuality > input.frontierQuality && input.candidateCriticalFailures === 0 && input.sealedCases > 0 ? input.candidate : input.frontier;
  const rec = { ...base("worker_qualification", input.scope, input.actor || "foundry", input), roleDefinition: "Opportunity Adversary/Qualifier attacks buyer access, margin, timing, competition, hidden human work, legal/platform limits, credibility, and the frontier/existing-product alternative.",
    pipeline: ["role_definition", "frozen_baseline", "competency_model", "training_candidate", "sealed_evaluation", "regression_analysis", "candidate_version", "certification_decision"],
    contestants: { specialized: input.candidate.version, frontier: input.frontier.version, informationParity: true, toolsParity: true, frontierMasterPrompt: frontierStrongPrompt("Same policy and record supplied to the specialist.") },
    results: { sealedCases: input.sealedCases, candidateQuality: input.candidateQuality, frontierQuality: input.frontierQuality, candidateCriticalFailures: input.candidateCriticalFailures, frontierCriticalFailures: input.frontierCriticalFailures },
    selectedWorker: selected, verdict: selected.frontier ? "frontier_selected_no_demonstrated_specialist_advantage" : "specialist_selected_after_sealed_advantage", automaticPromotion: false };
  return append(store, rec);
}

export function assembleTeamPlan(store: any, input: { scope: Scope; objectiveId: string; requirements: CapabilityRequirement[]; workers?: WorkerCandidate[]; requestedRoleIds?: string[]; actor?: string }) {
  const objective = scoped(store, input.scope, "business_objective").find((r) => r.id === input.objectiveId); if (!objective) throw new Error("objective is missing or outside scope");
  const workers = input.workers || defaultWorkers(); const qualification = scoped(store, input.scope, "worker_qualification").at(-1);
  const assignments: any[] = [];
  for (const requirement of input.requirements) {
    let eligible = workers.filter((w) => w.capability === requirement.capability && w.certified);
    if (requirement.capability === "opportunity_adversarial_qualification" && qualification) eligible = eligible.filter((w) => w.roleId === qualification.selectedWorker.roleId);
    if (!eligible.length) throw new Error("required capability is unavailable or uncertified: " + requirement.capability);
    const chosen = eligible.sort((a, b) => Number(a.marginalCostUsd ?? Infinity) - Number(b.marginalCostUsd ?? Infinity))[0];
    if (chosen.roleId === "venture_manager" && chosen.certifiedBy === "venture_manager") throw new Error("Venture Manager may not certify its own managerial performance");
    assignments.push({ id: `ASSIGN-${requirement.id}`, requirementId: requirement.id, roleId: chosen.roleId, version: chosen.version, certificationId: chosen.certificationId,
      selection: chosen.frontier ? "frontier_direct_no_demonstrated_specialist_advantage" : "certified_specialist", validatesOutput: chosen.roleId === "venture_manager" ? "all_work_artifacts" : "venture_manager", marginalCostUsd: chosen.marginalCostUsd, marginalValueUsd: chosen.marginalValueUsd, handoffTo: "venture_manager" });
  }
  const selectedRoles = new Set(assignments.map((a) => a.roleId));
  const decorative = (input.requestedRoleIds || []).filter((roleId) => !selectedRoles.has(roleId));
  if (decorative.length) throw new Error("unnecessary worker rejected from TeamPlan: " + decorative.join(", "));
  const extra = assignments.filter((a) => !input.requirements.some((r) => r.id === a.requirementId)); if (extra.length) throw new Error("decorative assignments are forbidden");
  const rec = { ...base("team_plan", input.scope, input.actor || "team_assembler", { objectiveId: input.objectiveId, requirements: input.requirements, assignments }), objectiveId: input.objectiveId, requirements: input.requirements, assignments,
    smallestSufficient: true, unavailableCapabilities: [], humanOrProfessionalRoles: [], reviewIntensity: "proportionate", status: "proposed" };
  return append(store, rec);
}

export function createWorkOrder(store: any, input: { scope: Scope; teamPlanId: string; title: string; capability: string; priority: number; expectedValueUsd?: number | null; expectedCostUsd?: number | null; authorityRequested: string; successCondition: string; failureCondition: string; evidenceRefs: string[]; actor?: string }) {
  if (!text(input.successCondition) || !text(input.failureCondition)) throw new Error("WorkOrder requires explicit success and failure conditions");
  const plan = scoped(store, input.scope, "team_plan").find((r) => r.id === input.teamPlanId); if (!plan) throw new Error("team plan missing or outside scope"); const workEvidence = evidenceById(store, input.scope, input.evidenceRefs); if (workEvidence.some((e) => e.status === "stale")) throw new Error("stale evidence cannot support a new WorkOrder");
  const assignment = plan.assignments.find((a: any) => input.capability === plan.requirements.find((r: any) => r.id === a.requirementId)?.capability); if (!assignment) throw new Error("no qualified assignment for requested capability");
  const key = hash({ scope: input.scope, teamPlanId: input.teamPlanId, title: input.title, capability: input.capability }); const duplicate = scoped(store, input.scope, "work_order").find((r) => r.idempotencyKey === key && !["rejected"].includes(r.state)); if (duplicate) return duplicate;
  // Retain the existing economically relevant action queue as the canonical
  // queue projection. The managed record adds venture lineage and immutable
  // review history; it does not replace the general WorkItem nervous system.
  const workItem = {
    ...newWorkItem({ workspaceId: input.scope.workspaceId, type: "research", title: input.title, objective: plan.objectiveId, evidence: input.evidenceRefs, priority: input.priority,
      economics: { expectedValueUsd: input.expectedValueUsd ?? null, expectedCostUsd: input.expectedCostUsd ?? null }, id: "WI-" + key.slice(0, 16) }),
    companyId: input.scope.companyId, ventureId: input.scope.ventureId, managedVentureIdempotencyKey: key,
  };
  putWorkItem(store, workItem);
  const rec = { ...base("work_order", input.scope, input.actor || "venture_manager", input), teamPlanId: input.teamPlanId, title: input.title, capability: input.capability, priority: input.priority,
    expectedValueUsd: input.expectedValueUsd ?? null, expectedCostUsd: input.expectedCostUsd ?? null, assignedRoleId: assignment.roleId, assignedVersion: assignment.version,
    state: "proposed", idempotencyKey: key, workItemId: workItem.id, successCondition: input.successCondition, failureCondition: input.failureCondition, validationWorker: "venture_manager" };
  return append(store, rec);
}

const WORK_ORDER_TRANSITIONS: Record<string, string[]> = { proposed: ["approved", "rejected"], approved: ["executed", "returned", "rejected"], returned: ["approved", "rejected"], executed: [], rejected: [], escalated: [] };
export function transitionWorkOrder(store: any, input: { scope: Scope; workOrderId: string; from: string; to: string; actor?: string; reason: string }) {
  if (!(WORK_ORDER_TRANSITIONS[input.from] || []).includes(input.to)) throw new Error(`invalid WorkOrder lifecycle transition: ${input.from} -> ${input.to}`);
  if (!text(input.reason)) throw new Error("work-order transition requires a reason");
  const order = scoped(store, input.scope, "work_order").find((r) => r.id === input.workOrderId); if (!order) throw new Error("work order missing or outside scope");
  return append(store, { ...base("work_order_transition", input.scope, input.actor || "venture_manager", input), workOrderId: order.id, from: input.from, to: input.to, reason: input.reason });
}

export function validateAbstention(input: { recommendation: string; decisionChangingInformation?: string[] }) {
  const abstains = /\babstain|insufficient information|cannot decide\b/i.test(input.recommendation || "");
  if (!abstains) return { ok: true, errors: [] as string[] };
  return (input.decisionChangingInformation || []).some((x) => text(x))
    ? { ok: true, errors: [] as string[] }
    : { ok: false, errors: ["vague abstention must name information that could change the decision"] };
}

export function preWorkReview(store: any, input: { scope: Scope; workOrderId: string; actor?: string; inputsPresent?: boolean; buyerKnown?: boolean; authorityAvailable?: boolean; duplicate?: boolean }) {
  const order = scoped(store, input.scope, "work_order").find((r) => r.id === input.workOrderId); if (!order) throw new Error("work order missing or outside scope");
  const reasons: string[] = [];
  if (!input.inputsPresent) reasons.push("required inputs missing"); if (!input.buyerKnown && order.authorityRequested !== "internal_read_only") reasons.push("buyer or contracting authority is missing");
  if (!input.authorityAvailable && order.authorityRequested !== "internal_read_only") reasons.push("authority envelope insufficient"); if (input.duplicate) reasons.push("duplicate or conflicting work");
  if ((order.expectedValueUsd ?? 0) <= (order.expectedCostUsd ?? 0)) reasons.push("low-value work: expected value does not justify cost");
  const rec = { ...base("manager_prework_review", input.scope, input.actor || "venture_manager", input), workOrderId: order.id, outcome: reasons.length ? "rejected" : "approved", reasons,
    checks: { priorityJustified: order.priority > 0, inputsPresent: Boolean(input.inputsPresent), qualifiedWorker: Boolean(order.assignedVersion), authoritySufficient: Boolean(input.authorityAvailable) || order.authorityRequested === "internal_read_only", nonDuplicative: !input.duplicate, successAndFailureDefined: Boolean(order.successCondition && order.failureCondition) } };
  return append(store, rec);
}

export function executeShadowWork(store: any, input: { scope: Scope; workOrderId: string; output: any; evidenceRefs: string[]; actorVersion: VersionRef; cost?: Cost; actor?: string }) {
  const order = scoped(store, input.scope, "work_order").find((r) => r.id === input.workOrderId); if (!order) throw new Error("work order missing or outside scope");
  const review = scoped(store, input.scope, "manager_prework_review").find((r) => r.workOrderId === order.id && r.outcome === "approved"); if (!review) throw new Error("work cannot execute without approved pre-work review"); evidenceById(store, input.scope, input.evidenceRefs);
  const rec = { ...base("work_artifact", input.scope, input.actor || input.actorVersion.agentId, input), workOrderId: order.id, actorVersion: input.actorVersion, output: input.output, status: "produced", independentOfProducer: true,
    deterministicChecks: { evidenceLinked: true, authorityRespected: true, externalActionPerformed: false }, outcomeVerification: "unknown" };
  const saved = append(store, rec); recordUsage(store, { workspaceId: input.scope.workspaceId, agentId: input.actorVersion.agentId, role: input.actorVersion.agentId, version: input.actorVersion.versionId, operation: "eval", kind: "fixture", forceUnknownCost: true, note: "managed-venture local shadow work" });
  return saved;
}

export function postWorkReview(store: any, input: { scope: Scope; workOrderId: string; artifactIds: string[]; actor?: string }) {
  const artifacts = scoped(store, input.scope, "work_artifact").filter((r) => input.artifactIds.includes(r.id)); if (artifacts.length !== input.artifactIds.length) throw new Error("artifact missing or cross-workspace");
  const unsupported = artifacts.some((a) => !a.deterministicChecks?.evidenceLinked); const authority = artifacts.some((a) => !a.deterministicChecks?.authorityRespected); const claims = artifacts.map((a) => text(a.output?.recommendation)).filter(Boolean);
  const disagreement = new Set(claims).size > 1; const outcome = authority || unsupported ? "rejected" : disagreement ? "returned_for_investigation" : "accepted";
  const rec = { ...base("manager_postwork_review", input.scope, input.actor || "venture_manager", input), workOrderId: input.workOrderId, artifactIds: input.artifactIds, outcome,
    independentReviewer: "venture_manager", checks: { artifactAddressesOrder: true, claimsSupported: !unsupported, contradictionsSurfaced: disagreement, economicReproducible: !unsupported, authorityRespected: !authority, criticalInformationOmitted: false },
    requiredCorrections: disagreement ? ["Investigate the contradictory recommendation using the cited evidence; do not majority-vote."] : [] };
  return append(store, rec);
}

export function consolidateManagementRecommendation(store: any, input: { scope: Scope; objectiveId: string; artifactIds: string[]; actor?: string }) {
  const artifacts = scoped(store, input.scope, "work_artifact").filter((r) => input.artifactIds.includes(r.id)); if (artifacts.length !== input.artifactIds.length) throw new Error("cannot consolidate cross-scope artifacts");
  const claims = artifacts.map((a) => text(a.output?.recommendation)).filter(Boolean); const disagreement = new Set(claims).size > 1;
  const rec = { ...base("manager_recommendation", input.scope, input.actor || "venture_manager", input), objectiveId: input.objectiveId, artifactIds: input.artifactIds,
    recommendation: disagreement ? "Investigate contradictory evidence before pursuing any external action." : (claims[0] || "Abstain: no decision-changing evidence supplied."),
    disagreements: disagreement ? claims : [], investigationRequired: disagreement, majorityVoteUsed: false, ownerApprovalRequired: true,
    successCondition: "Owner receives one evidence-linked, authority-bounded recommendation.", failureCondition: "No external action is taken without an owner record." };
  return append(store, rec);
}

export function recordOwnerDecision(store: any, input: { scope: Scope; recommendationId: string; decision: "approve_record_only" | "reject" | "request_revision"; ownerId: string; authorityGranted: string; actor?: string }) {
  if (!text(input.ownerId) || input.ownerId === "system") throw new Error("only an owner-like actor may decide consequential action");
  rejectMasonClaim(input.ownerId, "demo_operator");
  assertActorAllowed(input.ownerId, "approve managed-venture record-only action");
  const recommendation = scoped(store, input.scope, "manager_recommendation").find((r) => r.id === input.recommendationId); if (!recommendation) throw new Error("recommendation missing or outside scope");
  const rec = { ...base("owner_decision", input.scope, input.actor || input.ownerId, input), recommendationId: input.recommendationId, decision: input.decision, ownerId: input.ownerId, authorityGranted: input.authorityGranted, executionMode: "record_only_shadow", externalActionPerformed: false };
  return append(store, rec);
}

export function recordShadowExecution(store: any, input: { scope: Scope; ownerDecisionId: string; action: string; idempotencyKey: string; authorityUsed: string; actor?: string }) {
  const decision = scoped(store, input.scope, "owner_decision").find((r) => r.id === input.ownerDecisionId); if (!decision || decision.decision !== "approve_record_only") throw new Error("record-only execution requires owner approval");
  if (input.authorityUsed !== decision.authorityGranted) throw new Error("action exceeds owner-granted authority");
  const duplicate = scoped(store, input.scope, "execution_record").find((r) => r.idempotencyKey === input.idempotencyKey); if (duplicate) return duplicate;
  const session = newShadowSession(id("SHADOW", input), input.scope.ventureId, now()); recordIntent(session, { id: id("INTENT", input), actionClass: "external_send", target: "record-only", content: input.action, producedBy: "venture_manager", producerTier: "shadow", requiresApproval: "owner", });
  const rec = { ...base("execution_record", input.scope, input.actor || "system", input), ownerDecisionId: input.ownerDecisionId, action: input.action, idempotencyKey: input.idempotencyKey, status: "recorded_not_performed", shadowSession: sessionGuarantee(session), externalActionPerformed: false };
  return append(store, rec);
}
function sessionGuarantee(session: any) { return { intentsRecorded: session.intents.length, outboundActionsTaken: session.outboundActionsTaken, guarantee: "record-only shadow; no transport" }; }

export function recordOutcomeObservation(store: any, input: { scope: Scope; executionRecordId: string; status: typeof OUTCOME_VERIFICATION[number]; result: string; evidenceRefs?: string[]; actor?: string }) {
  if (!OUTCOME_VERIFICATION.includes(input.status)) throw new Error("unknown outcome verification status");
  if (input.status === "independently_verified" && !(input.evidenceRefs || []).length) throw new Error("independently verified outcome needs evidence");
  const execution = scoped(store, input.scope, "execution_record").find((r) => r.id === input.executionRecordId); if (!execution) throw new Error("execution record missing or outside scope"); if ((input.evidenceRefs || []).length) evidenceById(store, input.scope, input.evidenceRefs || []);
  const rec = { ...base("outcome_observation", input.scope, input.actor || "owner", input), executionRecordId: input.executionRecordId, result: input.result, outcomeVerification: input.status,
    observedEconomicValueUsd: input.status === "independently_verified" ? null : null, productionOutcomeClaimed: false };
  return append(store, rec);
}

export function createLearningSignal(store: any, input: { scope: Scope; outcomeId: string; rankedCandidate: string; actor?: string }) {
  const outcome = scoped(store, input.scope, "outcome_observation").find((r) => r.id === input.outcomeId); if (!outcome) throw new Error("outcome missing or outside scope");
  const rec = { ...base("learning_signal", input.scope, input.actor || "learning_engine", input), outcomeId: input.outcomeId, rankedCandidate: input.rankedCandidate,
    evidenceStatus: outcome.outcomeVerification, proposedChange: "candidate only", autoPromotion: false, requiresSealedEvaluation: true, requiresIndependentCertification: true };
  return append(store, rec);
}

/** Aggregate only measurements actually recorded; unknown cost remains unknown. */
export function ventureMeasurements(store: any, scope: Scope) {
  const items = scoped(store, scope);
  const costs = items.map((r) => r.cost || emptyCost());
  const estimated = costs.filter((c) => c.status === "estimated" && c.usd != null);
  return {
    recordCount: items.length,
    estimatedCostUsd: estimated.reduce((sum, c) => sum + Number(c.usd || 0), 0),
    unknownCostRecords: costs.filter((c) => c.status === "unknown").length,
    masonAttentionMinutes: costs.reduce((sum, c) => sum + Number(c.humanMinutes || 0), 0),
    note: "Fixture work has unknown provider cost and zero recorded Mason attention; neither is converted into observed economic value.",
  };
}

export function reviewVenture(store: any, input: { scope: Scope; objectiveId: string; priorReviewId?: string; newEvidenceIds?: string[]; actor?: string }) {
  const objective = scoped(store, input.scope, "business_objective").find((r) => r.id === input.objectiveId); if (!objective) throw new Error("objective missing or outside scope");
  const prior = input.priorReviewId ? scoped(store, input.scope, "venture_review").find((r) => r.id === input.priorReviewId) : null;
  const evidence = input.newEvidenceIds?.length ? evidenceById(store, input.scope, input.newEvidenceIds) : []; const materiallyNew = evidence.some((e) => !prior?.evidenceRefs?.includes(e.id));
  const rec = { ...base("venture_review", input.scope, input.actor || "venture_manager", { ...input, evidenceRefs: evidence.map((e) => e.id) }), objectiveId: input.objectiveId, priorReviewId: input.priorReviewId || null,
    decision: prior && !materiallyNew ? "defer" : "revise", rationale: prior && !materiallyNew ? "Unchanged evidence cannot legitimately reopen a prior decision." : "New evidence or initial review justifies a bounded revision.",
    evidenceRefs: evidence.map((e) => e.id), outcomeVerification: "unknown", verifiedEconomicValueGenerated: null, verifiedContributionPerDollar: null, verifiedContributionPerOwnerMinute: null };
  return append(store, rec);
}

/** A local, synthetic, provider-free proof of the whole loop. */
export function runManagedVentureShadow(store: any, scope: Scope) {
  const venture = createVenture(store, { scope, name: "Synthetic neighborhood service venture", actor: "demo_operator", constraints: ["shadow only", "no personal data", "no external action"] });
  const market = recordEvidence(store, { scope, claim: "Synthetic fixture: stated buyer has a bounded service need and no verified budget.", actor: "fixture" });
  const buyer = recordEvidence(store, { scope, claim: "Synthetic fixture: buyer identity is named but contracting authority is unverified.", actor: "fixture" });
  const objective = submitBusinessObjective(store, { scope, actor: "demo_operator", title: "Validate one bounded service opportunity", objective: "Determine whether a low-cost validation can improve execution readiness.", successConditions: ["A decision-ready evidence-linked recommendation exists."], failureConditions: ["Pause if buyer authority or economic inputs remain unverified."], evidenceRefs: [market.id, buyer.id], economicAssumptions: ["Value is unknown until a buyer confirms scope."], authorityEnvelope: "record_only" });
  const workers = defaultWorkers(); const adversary = qualifyOpportunityAdversary(store, { scope, candidate: workers[1], frontier: workers[2], sealedCases: 8, candidateQuality: 78, frontierQuality: 86, candidateCriticalFailures: 0, frontierCriticalFailures: 0 });
  const plan = assembleTeamPlan(store, { scope, objectiveId: objective.id, requirements: deriveCapabilityRequirements(objective), workers });
  const researchOrder = createWorkOrder(store, { scope, teamPlanId: plan.id, title: "Extract stated buyer and scope facts", capability: "opportunity_research", priority: 10, expectedValueUsd: 100, expectedCostUsd: 1, authorityRequested: "internal_read_only", successCondition: "Facts cite fixture evidence.", failureCondition: "Return if key facts are absent.", evidenceRefs: [market.id, buyer.id] });
  const qualifierOrder = createWorkOrder(store, { scope, teamPlanId: plan.id, title: "Adversarially qualify the opportunity", capability: "opportunity_adversarial_qualification", priority: 9, expectedValueUsd: 100, expectedCostUsd: 1, authorityRequested: "internal_read_only", successCondition: "Surface decision-changing risks.", failureCondition: "Return if buyer authority is unresolved.", evidenceRefs: [market.id, buyer.id] });
  preWorkReview(store, { scope, workOrderId: researchOrder.id, inputsPresent: true, buyerKnown: true, authorityAvailable: true }); preWorkReview(store, { scope, workOrderId: qualifierOrder.id, inputsPresent: true, buyerKnown: true, authorityAvailable: true });
  const a = executeShadowWork(store, { scope, workOrderId: researchOrder.id, evidenceRefs: [market.id, buyer.id], actorVersion: workers[0].version, output: { recommendation: "Pursue a bounded internal validation; buyer name is stated." } });
  const b = executeShadowWork(store, { scope, workOrderId: qualifierOrder.id, evidenceRefs: [market.id, buyer.id], actorVersion: workers[2].version, output: { recommendation: "Do not pursue external action until contracting authority is verified." } });
  const post = postWorkReview(store, { scope, workOrderId: qualifierOrder.id, artifactIds: [a.id, b.id] }); const recommendation = consolidateManagementRecommendation(store, { scope, objectiveId: objective.id, artifactIds: [a.id, b.id] });
  const owner = recordOwnerDecision(store, { scope, recommendationId: recommendation.id, decision: "approve_record_only", ownerId: "demo_operator", authorityGranted: "record_only" }); const execution = recordShadowExecution(store, { scope, ownerDecisionId: owner.id, action: "Would ask owner to verify contracting authority; not sent.", idempotencyKey: "synthetic-authority-check-v1", authorityUsed: "record_only" });
  const outcome = recordOutcomeObservation(store, { scope, executionRecordId: execution.id, status: "simulated", result: "Synthetic outcome: authority remained unverified; no revenue or customer result observed." }); const learning = createLearningSignal(store, { scope, outcomeId: outcome.id, rankedCandidate: "Add a sealed case for named buyer without contracting authority." }); const review = reviewVenture(store, { scope, objectiveId: objective.id, newEvidenceIds: [buyer.id] });
  const measurements = ventureMeasurements(store, scope);
  return { venture, objective, adversary, plan, workOrders: [researchOrder, qualifierOrder], artifacts: [a, b], postWorkReview: post, recommendation, owner, execution, outcome, learning, review, measurements, workerSpecs: [OPPORTUNITY_RESEARCHER_SPEC.roleId, OPPORTUNITY_QUALIFIER_SPEC.roleId], frontierBasicPromptPresent: Boolean(FRONTIER_BASIC_PROMPT.system) };
}
