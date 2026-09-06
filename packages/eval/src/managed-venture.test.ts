import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@midas/db";
import {
  createVenture, recordEvidence, submitBusinessObjective, validateBusinessObjective,
  deriveCapabilityRequirements, defaultWorkers, qualifyOpportunityAdversary, assembleTeamPlan,
  createWorkOrder, preWorkReview, transitionWorkOrder, executeShadowWork, postWorkReview,
  consolidateManagementRecommendation, recordOwnerDecision, recordShadowExecution,
  recordOutcomeObservation, createLearningSignal, reviewVenture, validateAbstention,
  runManagedVentureShadow,
} from "./managed-venture.ts";

function fresh() {
  const store = new FileStore(mkdtempSync(join(tmpdir(), "midas-venture-")));
  const scope = { workspaceId: "WS-VENTURE", companyId: "CO-VENTURE", ventureId: "VEN-VENTURE" };
  createVenture(store, { scope, name: "Synthetic venture" });
  const fact = recordEvidence(store, { scope, claim: "Synthetic buyer wants a bounded internal analysis." });
  const objective = submitBusinessObjective(store, { scope, title: "Validate a synthetic opportunity", objective: "Choose the next bounded validation.", successConditions: ["An evidence-linked recommendation exists."], failureConditions: ["Stop when authority remains unknown."], evidenceRefs: [fact.id], authorityEnvelope: "record_only" });
  const workers = defaultWorkers();
  qualifyOpportunityAdversary(store, { scope, candidate: workers[1], frontier: workers[2], sealedCases: 8, candidateQuality: 70, frontierQuality: 90, candidateCriticalFailures: 0, frontierCriticalFailures: 0 });
  const plan = assembleTeamPlan(store, { scope, objectiveId: objective.id, requirements: deriveCapabilityRequirements(objective), workers });
  return { store, scope, fact, objective, workers, plan };
}

function order(f: ReturnType<typeof fresh>, more: any = {}) {
  return createWorkOrder(f.store, { scope: f.scope, teamPlanId: f.plan.id, title: "Bounded evidence review", capability: "opportunity_research", priority: 5, expectedValueUsd: 20, expectedCostUsd: 1, authorityRequested: "internal_read_only", successCondition: "Evidence is linked.", failureCondition: "Return if claim lacks support.", evidenceRefs: [f.fact.id], ...more });
}

describe("managed venture contracts and team controls", () => {
  test("rejects malformed objectives and unsupported economic claims", () => {
    assert.equal(validateBusinessObjective({ title: "", objective: "", successConditions: [], failureConditions: [], evidenceRefs: [] }).ok, false);
    const f = fresh();
    assert.throws(() => submitBusinessObjective(f.store, { scope: f.scope, title: "Economic claim", objective: "Do it", successConditions: ["x"], failureConditions: ["y"], evidenceRefs: [f.fact.id], expectedValueUsd: 900 }), /economic evidence/);
  });

  test("enforces workspace/company/venture isolation and stale evidence", () => {
    const f = fresh(); const other = { workspaceId: "WS-OTHER", companyId: "CO-OTHER", ventureId: "VEN-OTHER" };
    assert.throws(() => submitBusinessObjective(f.store, { scope: other, title: "Cross scope", objective: "x", successConditions: ["x"], failureConditions: ["y"], evidenceRefs: [f.fact.id] }), /belongs/);
    const stale = recordEvidence(f.store, { scope: f.scope, claim: "Old fixture", status: "stale" });
    assert.throws(() => order(f, { title: "stale", evidenceRefs: [stale.id] }), /stale evidence/);
  });

  test("requires a minimal capability-driven team and blocks uncertified or decorative workers", () => {
    const f = fresh();
    assert.throws(() => assembleTeamPlan(f.store, { scope: f.scope, objectiveId: f.objective.id, requirements: deriveCapabilityRequirements(f.objective), workers: f.workers, requestedRoleIds: ["marketing_decorator"] }), /unnecessary worker/);
    const noFrontier = f.workers.filter((w) => !w.frontier);
    assert.throws(() => assembleTeamPlan(f.store, { scope: f.scope, objectiveId: f.objective.id, requirements: deriveCapabilityRequirements(f.objective), workers: noFrontier }), /unavailable or uncertified/);
    const selfCert = f.workers.map((w) => w.roleId === "venture_manager" ? { ...w, certifiedBy: "venture_manager" } : w);
    assert.throws(() => assembleTeamPlan(f.store, { scope: f.scope, objectiveId: f.objective.id, requirements: deriveCapabilityRequirements(f.objective), workers: selfCert }), /may not certify/);
  });

  test("uses the frontier baseline honestly when specialty has no demonstrated advantage", () => {
    const f = fresh(); const q = f.store.listManagedVentureRecords().find((r: any) => r.type === "worker_qualification");
    assert.equal(q.selectedWorker.roleId, "frontier_opportunity_adversary");
    assert.equal(q.verdict, "frontier_selected_no_demonstrated_specialist_advantage");
    assert.equal(q.contestants.informationParity, true);
    assert.equal(q.pipeline.length, 8);
  });

  test("critical failure blocks promotion and a worker cannot self-certify", () => {
    const f = fresh();
    const candidate = { ...f.workers[1], certifiedBy: "opportunity_qualifier" };
    assert.throws(() => qualifyOpportunityAdversary(f.store, { scope: f.scope, candidate, frontier: f.workers[2], sealedCases: 4, candidateQuality: 99, frontierQuality: 1, candidateCriticalFailures: 0, frontierCriticalFailures: 0 }), /cannot certify itself/);
    const q = qualifyOpportunityAdversary(f.store, { scope: f.scope, candidate: f.workers[1], frontier: f.workers[2], sealedCases: 4, candidateQuality: 99, frontierQuality: 1, candidateCriticalFailures: 1, frontierCriticalFailures: 0 });
    assert.equal(q.selectedWorker.frontier, true);
  });
});

describe("managed venture management, execution, and learning", () => {
  test("pre-work review rejects missing buyer/authority, low value, and missing conditions", () => {
    const f = fresh();
    assert.throws(() => order(f, { title: "missing conditions", successCondition: "", failureCondition: "" }), /success and failure/);
    const external = order(f, { title: "external", authorityRequested: "external_send" });
    const review = preWorkReview(f.store, { scope: f.scope, workOrderId: external.id, inputsPresent: true, buyerKnown: false, authorityAvailable: false });
    assert.equal(review.outcome, "rejected"); assert.ok(review.reasons.some((x: string) => /buyer/.test(x))); assert.ok(review.reasons.some((x: string) => /authority/.test(x)));
    const low = order(f, { title: "low", expectedValueUsd: 1, expectedCostUsd: 2 });
    assert.equal(preWorkReview(f.store, { scope: f.scope, workOrderId: low.id, inputsPresent: true, buyerKnown: true, authorityAvailable: true }).outcome, "rejected");
  });

  test("pre-work gated execution, independent review, and contradiction investigation do not majority-vote", () => {
    const f = fresh(); const aOrder = order(f, { title: "A" }); const bOrder = order(f, { title: "B" });
    assert.throws(() => executeShadowWork(f.store, { scope: f.scope, workOrderId: aOrder.id, evidenceRefs: [f.fact.id], actorVersion: f.workers[0].version, output: {} }), /pre-work/);
    preWorkReview(f.store, { scope: f.scope, workOrderId: aOrder.id, inputsPresent: true, buyerKnown: true, authorityAvailable: true }); preWorkReview(f.store, { scope: f.scope, workOrderId: bOrder.id, inputsPresent: true, buyerKnown: true, authorityAvailable: true });
    const a = executeShadowWork(f.store, { scope: f.scope, workOrderId: aOrder.id, evidenceRefs: [f.fact.id], actorVersion: f.workers[0].version, output: { recommendation: "Pursue" } });
    const b = executeShadowWork(f.store, { scope: f.scope, workOrderId: bOrder.id, evidenceRefs: [f.fact.id], actorVersion: f.workers[2].version, output: { recommendation: "Pause" } });
    const post = postWorkReview(f.store, { scope: f.scope, workOrderId: bOrder.id, artifactIds: [a.id, b.id] }); assert.equal(post.outcome, "returned_for_investigation");
    const rec = consolidateManagementRecommendation(f.store, { scope: f.scope, objectiveId: f.objective.id, artifactIds: [a.id, b.id] }); assert.equal(rec.investigationRequired, true); assert.equal(rec.majorityVoteUsed, false);
  });

  test("guards lifecycle, authority, duplicate execution, abstention, and outcome truth", () => {
    const f = fresh(); const o = order(f); assert.throws(() => transitionWorkOrder(f.store, { scope: f.scope, workOrderId: o.id, from: "executed", to: "approved", reason: "no" }), /invalid WorkOrder/);
    const valid = transitionWorkOrder(f.store, { scope: f.scope, workOrderId: o.id, from: "proposed", to: "approved", reason: "manager approved" }); assert.equal(valid.to, "approved");
    assert.equal(validateAbstention({ recommendation: "Abstain." }).ok, false); assert.equal(validateAbstention({ recommendation: "Abstain pending contracting authority.", decisionChangingInformation: ["contracting authority"] }).ok, true);
    const r = { id: "REC-LOCAL" }; f.store.putManagedVentureRecord({ ...r, type: "manager_recommendation", schemaVersion: "v", scope: f.scope, createdAt: new Date().toISOString(), actor: "manager", parentIds: [], evidenceRefs: [], fingerprint: "f", cost: { usd: null, status: "unknown", humanMinutes: 0, modelCalls: 0 }, authorityRequested: "none", authorityUsed: "none", confidence: null, uncertainty: [] });
    const owner = recordOwnerDecision(f.store, { scope: f.scope, recommendationId: r.id, decision: "approve_record_only", ownerId: "demo_operator", authorityGranted: "record_only" });
    assert.throws(() => recordShadowExecution(f.store, { scope: f.scope, ownerDecisionId: owner.id, action: "x", idempotencyKey: "one", authorityUsed: "external_send" }), /exceeds/);
    const ex = recordShadowExecution(f.store, { scope: f.scope, ownerDecisionId: owner.id, action: "x", idempotencyKey: "one", authorityUsed: "record_only" }); assert.equal(recordShadowExecution(f.store, { scope: f.scope, ownerDecisionId: owner.id, action: "x", idempotencyKey: "one", authorityUsed: "record_only" }).id, ex.id);
    assert.throws(() => recordOutcomeObservation(f.store, { scope: f.scope, executionRecordId: ex.id, status: "independently_verified", result: "claimed" }), /needs evidence/);
    const simulated = recordOutcomeObservation(f.store, { scope: f.scope, executionRecordId: ex.id, status: "simulated", result: "no production evidence" }); assert.equal(simulated.productionOutcomeClaimed, false);
  });

  test("new evidence can reopen a review, unchanged evidence cannot, and learning never auto-promotes", () => {
    const f = fresh(); const first = reviewVenture(f.store, { scope: f.scope, objectiveId: f.objective.id, newEvidenceIds: [f.fact.id] }); const unchanged = reviewVenture(f.store, { scope: f.scope, objectiveId: f.objective.id, priorReviewId: first.id, newEvidenceIds: [f.fact.id] }); assert.equal(unchanged.decision, "defer");
    const newFact = recordEvidence(f.store, { scope: f.scope, claim: "New synthetic information." }); const reopened = reviewVenture(f.store, { scope: f.scope, objectiveId: f.objective.id, priorReviewId: first.id, newEvidenceIds: [newFact.id] }); assert.equal(reopened.decision, "revise");
    const fakeExecution = f.store.putManagedVentureRecord({ id: "EX-LEARN", type: "execution_record", schemaVersion: "v", scope: f.scope, createdAt: new Date().toISOString(), actor: "system", parentIds: [], evidenceRefs: [], fingerprint: "ex", cost: { usd: null, status: "unknown", humanMinutes: 0, modelCalls: 0 }, authorityRequested: "none", authorityUsed: "none", confidence: null, uncertainty: [] }); const outcome = recordOutcomeObservation(f.store, { scope: f.scope, executionRecordId: fakeExecution.id, status: "simulated", result: "fixture" }); const learning = createLearningSignal(f.store, { scope: f.scope, outcomeId: outcome.id, rankedCandidate: "candidate case" }); assert.equal(learning.autoPromotion, false); assert.equal(learning.requiresIndependentCertification, true);
  });
});

test("managed venture shadow demonstration completes the record-only lifecycle", () => {
  const store = new FileStore(mkdtempSync(join(tmpdir(), "midas-venture-demo-"))); const scope = { workspaceId: "WS-DEMO", companyId: "CO-DEMO", ventureId: "VEN-DEMO" }; const demo = runManagedVentureShadow(store, scope);
  assert.equal(demo.plan.smallestSufficient, true); assert.equal(demo.adversary.selectedWorker.frontier, true); assert.equal(demo.postWorkReview.outcome, "returned_for_investigation"); assert.equal(demo.recommendation.investigationRequired, true); assert.equal(demo.execution.status, "recorded_not_performed"); assert.equal(demo.execution.shadowSession.outboundActionsTaken, 0); assert.equal(demo.outcome.outcomeVerification, "simulated"); assert.equal(demo.learning.autoPromotion, false); assert.equal(demo.review.verifiedEconomicValueGenerated, null); assert.equal(demo.measurements.masonAttentionMinutes, 0); assert.ok(demo.measurements.unknownCostRecords > 0);
});
