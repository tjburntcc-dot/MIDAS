import { assertScope, businessKey, hash, identifier, requireThat, scopeKey, } from './contracts.ts';
import type { Principal, Ref, Role, Scope } from './contracts.ts';
import { StateStore } from './state.ts';
export type Roles = {
    analyst: Role;
    operator: Role;
    verifier: Role;
};
export type FixtureCase = 'improves' | 'regresses' | 'inconclusive';
export type LearningCandidate = {
    id: string;
    kind: 'LearningCandidate';
    scope: Scope;
    proposerId: string;
    source: 'synthetic_fixture';
    failureRef: Ref;
    outcomeRef: Ref;
    incumbentRoles: Roles;
    incumbentFingerprint: string;
    proposedChange: {
        targetRoleId: 'operator';
        baseVersion: string;
        procedure: string;
        competencies: string[];
        tools: string[];
    };
    rightsReview: {
        source: 'synthetic_fixture';
        sourceAccepted: true;
        grantsChanged: false;
        prohibitedTargets: string[];
    };
    developmentManifest: {
        developmentCaseId: 'fixture-development-operator-v1';
        generator: 'script-v1';
        qualification: 'fixture_only';
        allowedTarget: 'operator.procedure';
        immutableInputs: string[];
    };
    diagnosis: {
        evidenceState: 'observed_failure' | 'diagnostic_gap_only';
        observedFailure: Record<string, unknown> | null;
        knownGap: 'incumbent procedure lacks explicit read-back';
        hypothesis: string;
    };
    originHash: string;
    recordRef: Ref;
};
export type EvaluationReport = {
    id: string;
    kind: 'FixtureEvaluation';
    candidateId: string;
    evaluatorId: string;
    fixtureCase: FixtureCase;
    source: 'synthetic_fixture';
    evaluationManifest: {
        evaluationCaseId: string;
        developmentCaseId: string;
        scoringHash: string;
        accessPolicy: {
            learner: 'development_manifest_only';
            evaluator: 'fixture_case_only';
            approver: 'report_only';
        };
        input: {
            requireDelivery: boolean;
            requireVerification: boolean;
            maximumSteps: number | null;
        };
    };
    replay: {
        predicate: string;
        incumbent: {
            procedure: string;
            observation: Record<string, unknown>;
            passed: boolean;
        };
        candidate: {
            procedure: string;
            observation: Record<string, unknown>;
            passed: boolean;
        };
    };
    thresholds: {
        candidatePasses: boolean;
        incumbentPasses: boolean;
        improvement: number;
        met: boolean;
    };
    verdict: 'passing' | 'rejected' | 'inconclusive';
    recordRef: Ref;
};
export type PromotionDecision = {
    id: string;
    kind: 'PromotionDecision' | 'RollbackDecision';
    candidateId: string | null;
    approverId: string;
    outcome: 'promoted' | 'rejected' | 'inconclusive' | 'rolled_back';
    activeVersion: string;
    predecessorVersion: string | null;
    existingRunsRemainPinned: true;
    recordRef: Ref;
};
export type LearningRead = {
    candidate: LearningCandidate;
    evaluation: EvaluationReport | null;
    decision: PromotionDecision | null;
};
type Registry = {
    schemaVersion: '1';
    business: string;
    roles: {
        [K in keyof Roles]: {
            active: Role;
            history: Record<string, Role>;
        };
    };
};
type RunPin = {
    schemaVersion: '1';
    scope: string;
    roles: Roles;
    registryVersion: number;
};
const REGISTRY = 'foundry.learning.role-registry';
const RUN_PIN = 'foundry.learning.run-role-pin';
const CANDIDATE = 'foundry.learning.candidate';
const CANDIDATE_SEQUENCE = 'foundry.learning.candidate-sequence';
const CANDIDATE_ORIGIN = 'foundry.learning.candidate-origin';
const EVALUATION = 'foundry.learning.evaluation';
const DECISION = 'foundry.learning.decision';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const deepFreeze = <T>(value: T): Readonly<T> => {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value as Record<string, unknown>))
            deepFreeze(child);
        Object.freeze(value);
    }
    return value;
};
function initialRoles(): Roles {
    return {
        analyst: {
            id: 'analyst', version: '1', procedure: 'analyze fixture evidence and explain the decision',
            competencies: ['decision_analysis'], tools: ['lab.evidence'], predecessor: null,
            model: 'script-v1', qualification: 'fixture_only',
        },
        operator: {
            id: 'operator', version: '1', procedure: 'deliver a fixture artifact using recorded evidence',
            competencies: ['artifact_delivery'], tools: ['lab.publish'], predecessor: null,
            model: 'script-v1', qualification: 'fixture_only',
        },
        verifier: {
            id: 'verifier', version: '1', procedure: 'observe the fixture outcome and verify the artifact',
            competencies: ['outcome_verification'], tools: ['lab.observe'], predecessor: null,
            model: 'script-v1', qualification: 'fixture_only',
        },
    };
}
function registryFrom(roles: Roles, business: string): Registry {
    return {
        schemaVersion: '1',
        business,
        roles: {
            analyst: { active: roles.analyst, history: { [roles.analyst.version]: roles.analyst } },
            operator: { active: roles.operator, history: { [roles.operator.version]: roles.operator } },
            verifier: { active: roles.verifier, history: { [roles.verifier.version]: roles.verifier } },
        },
    };
}
function activeRoles(registry: Registry): Roles {
    return {
        analyst: clone(registry.roles.analyst.active),
        operator: clone(registry.roles.operator.active),
        verifier: clone(registry.roles.verifier.active),
    };
}
function candidateKey(s: Scope, candidateId: string): string { return `${scopeKey(s)}::${candidateId}`; }
function nextHistoryVersion(history: Record<string, Role>): string {
    const numbers = Object.keys(history).map(version => {
        requireThat(/^\d+$/.test(version), 'INVALID_ROLE_VERSION');
        return Number(version);
    });
    const next = Math.max(...numbers) + 1;
    requireThat(Number.isSafeInteger(next), 'ROLE_VERSION_OVERFLOW');
    return String(next);
}
function requireFixtureOutcome(outcome: unknown): asserts outcome is Record<string, unknown> {
    requireThat(outcome !== null && typeof outcome === 'object' && !Array.isArray(outcome), 'INVALID_OUTCOME');
    requireThat(Object.getPrototypeOf(outcome) === Object.prototype, 'INVALID_OUTCOME');
    requireThat((outcome as Record<string, unknown>).source === 'synthetic_fixture', 'FIXTURE_SOURCE_REQUIRED');
    // Hashing also rejects undefined, non-finite values, and non-JSON nested values.
    hash(outcome);
}
function observedFailure(outcome: Record<string, unknown>): Record<string, unknown> | null {
    const result = outcome.outcome;
    const resultStatus = result !== null && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>).status
        : outcome.status;
    if (resultStatus === 'passed' || resultStatus === 'pass' || resultStatus === 'confirmed')
        return null;
    const supplied = outcome.failure;
    if (supplied === null || supplied === undefined || supplied === false)
        return null;
    if (typeof supplied === 'object' && !Array.isArray(supplied))
        return clone(supplied as Record<string, unknown>);
    return { supplied };
}
function evaluationManifest(fixtureCase: FixtureCase) {
    const input = fixtureCase === 'improves'
        ? { requireDelivery: true, requireVerification: true, maximumSteps: 3 }
        : fixtureCase === 'regresses'
            ? { requireDelivery: true, requireVerification: false, maximumSteps: 1 }
            : { requireDelivery: true, requireVerification: false, maximumSteps: null };
    const predicateDefinition = { ...input, predicate: 'delivery, required verification, and step budget all pass' };
    return deepFreeze({
        evaluationCaseId: `fixture-evaluation-${fixtureCase}-v1`,
        developmentCaseId: 'fixture-development-operator-v1',
        scoringHash: hash(predicateDefinition),
        accessPolicy: {
            learner: 'development_manifest_only' as const,
            evaluator: 'fixture_case_only' as const,
            approver: 'report_only' as const,
        },
        input,
    });
}
function replayProcedure(procedure: string, input: {
    requireDelivery: boolean;
    requireVerification: boolean;
    maximumSteps: number | null;
}): Record<string, unknown> {
    const steps = procedure.split(' -> ').map(step => step.trim()).filter(Boolean);
    const verbs = steps.map(step => step.toLowerCase());
    return {
        procedureHash: hash(procedure),
        stepsExecuted: steps,
        source: 'synthetic_fixture',
        delivered: verbs.some(step => step.includes('deliver')),
        verified: verbs.some(step => step.includes('verify') || step.includes('read-back')),
        withinStepBudget: input.maximumSteps === null || steps.length <= input.maximumSteps,
    };
}
function predicate(observation: Record<string, unknown>, input: {
    requireDelivery: boolean;
    requireVerification: boolean;
    maximumSteps: number | null;
}): boolean {
    return (!input.requireDelivery || observation.delivered === true)
        && (!input.requireVerification || observation.verified === true)
        && observation.withinStepBudget === true;
}
/**
 * Fixture-only candidate learning. This class has no model port, campaign port, or
 * mutable test/grant surface: it can produce an immutable proposal and promote it
 * only after a mechanically replayed fixture report and a separate approver action.
 */
export class LearningService {
    private readonly store: StateStore;
    constructor(store: StateStore) { this.store = store; }
    initialize(s: Scope): Roles {
        const business = businessKey(s);
        const run = scopeKey(s);
        return this.store.transaction(() => {
            let registry = this.store.get(REGISTRY, business) as (Registry & {
                _version: number;
            }) | null;
            if (registry === null) {
                registry = this.store.put(REGISTRY, business, registryFrom(initialRoles(), business), null) as Registry & {
                    _version: number;
                };
            }
            const existingPin = this.store.get(RUN_PIN, run) as (RunPin & {
                _version: number;
            }) | null;
            if (existingPin === null) {
                const pin: RunPin = { schemaVersion: '1', scope: run, roles: activeRoles(registry), registryVersion: registry._version };
                this.store.put(RUN_PIN, run, pin, null);
                return clone(pin.roles);
            }
            return clone(existingPin.roles);
        });
    }
    /** Returns the immutable version snapshot pinned when this run was initialized. */
    roles(s: Scope): Roles {
        const pin = this.store.get(RUN_PIN, scopeKey(s)) as (RunPin & {
            _version: number;
        }) | null;
        return pin === null ? this.initialize(s) : clone(pin.roles);
    }
    read(s: Scope, principal: Principal, candidateId: string): LearningRead {
        assertScope(principal, s, 'read');
        identifier(candidateId);
        const candidate = this.readCandidate(s, candidateId);
        this.verifyCandidateRecord(s, principal, candidate);
        const evaluation = this.store.get(EVALUATION, candidateKey(s, candidateId)) as (EvaluationReport & {
            _version: number;
        }) | null;
        if (evaluation !== null)
            this.verifyEvaluationRecord(s, principal, candidate, evaluation);
        const decision = this.store.get(DECISION, candidateKey(s, candidateId)) as (PromotionDecision & {
            _version: number;
        }) | null;
        if (decision !== null)
            this.verifyDecisionRecord(s, principal, candidate, evaluation, decision);
        return { candidate: clone(candidate), evaluation: evaluation === null ? null : clone(evaluation), decision: decision === null ? null : clone(decision) };
    }
    propose(s: Scope, principal: Principal, outcome: unknown): LearningCandidate {
        assertScope(principal, s, 'read');
        assertScope(principal, s, 'operate');
        requireFixtureOutcome(outcome);
        const snapshot = this.roles(s);
        const run = scopeKey(s);
        return this.store.transaction(() => {
            const originHash = hash({ proposerId: principal.id, outcome });
            const originKey = `${run}::${originHash}`;
            const origin = this.store.get(CANDIDATE_ORIGIN, originKey) as {
                candidateId: string;
                originHash: string;
                _version: number;
            } | null;
            if (origin !== null) {
                requireThat(origin.originHash === originHash, 'CANDIDATE_ORIGIN_CORRUPT');
                return clone(this.readCandidate(s, origin.candidateId));
            }
            const sequence = this.store.get(CANDIDATE_SEQUENCE, run) as {
                next: number;
                _version: number;
            } | null;
            const next = sequence === null ? 1 : sequence.next + 1;
            if (sequence === null)
                this.store.put(CANDIDATE_SEQUENCE, run, { next }, null);
            else
                this.store.put(CANDIDATE_SEQUENCE, run, { next }, sequence._version);
            const candidateId = `candidate-${hash(run).slice(0, 16)}-${next}`;
            identifier(candidateId);
            const failureRef = this.store.record(s, `failure-${candidateId}`, 'fixture_failure', (outcome.failure as unknown) ?? { source: 'synthetic_fixture', outcomeHash: hash(outcome) });
            const outcomeRef = this.store.record(s, `outcome-${candidateId}`, 'fixture_outcome', outcome);
            const incumbentFingerprint = hash(snapshot);
            const candidateWithoutRecord = {
                id: candidateId,
                kind: 'LearningCandidate' as const,
                scope: clone(s),
                proposerId: principal.id,
                source: 'synthetic_fixture' as const,
                failureRef,
                outcomeRef,
                incumbentRoles: snapshot,
                incumbentFingerprint,
                proposedChange: {
                    targetRoleId: 'operator' as const,
                    baseVersion: snapshot.operator.version,
                    procedure: 'prepare fixture artifact -> deliver fixture artifact -> verify fixture outcome',
                    competencies: clone(snapshot.operator.competencies),
                    tools: clone(snapshot.operator.tools),
                },
                rightsReview: {
                    source: 'synthetic_fixture' as const,
                    sourceAccepted: true as const,
                    grantsChanged: false as const,
                    prohibitedTargets: ['role_identity', 'grader', 'test_suite', 'grants'],
                },
                developmentManifest: {
                    developmentCaseId: 'fixture-development-operator-v1' as const,
                    generator: 'script-v1' as const,
                    qualification: 'fixture_only' as const,
                    allowedTarget: 'operator.procedure' as const,
                    immutableInputs: ['failureRef', 'outcomeRef', 'incumbentRoles', 'rightsReview'],
                },
                diagnosis: {
                    evidenceState: observedFailure(outcome) === null ? 'diagnostic_gap_only' as const : 'observed_failure' as const,
                    observedFailure: observedFailure(outcome),
                    knownGap: 'incumbent procedure lacks explicit read-back' as const,
                    hypothesis: 'Adding an explicit fixture verification step may improve verification; this is a hypothesis pending independent evaluation.',
                },
                originHash,
            };
            const recordRef = this.store.record(s, `candidate-${candidateId}`, 'learning_candidate', candidateWithoutRecord, [failureRef, outcomeRef]);
            const candidate: LearningCandidate = { ...candidateWithoutRecord, recordRef };
            this.store.put(CANDIDATE, candidateKey(s, candidateId), candidate, null);
            this.store.put(CANDIDATE_ORIGIN, originKey, { candidateId, originHash }, null);
            this.store.event(s, 'learning.candidate_proposed', { candidateId, proposerId: principal.id, candidateRef: recordRef });
            return clone(candidate);
        });
    }
    evaluate(s: Scope, evaluator: Principal, candidateId: string, fixtureCase: FixtureCase = 'inconclusive'): EvaluationReport {
        assertScope(evaluator, s, 'read');
        assertScope(evaluator, s, 'evaluate');
        identifier(candidateId);
        requireThat(['improves', 'regresses', 'inconclusive'].includes(fixtureCase), 'INVALID_FIXTURE_CASE');
        return this.store.transaction(() => {
            const candidate = this.readCandidate(s, candidateId);
            this.verifyCandidateRecord(s, evaluator, candidate);
            requireThat(candidate.proposerId !== evaluator.id, 'EVALUATOR_NOT_INDEPENDENT');
            const existing = this.store.get(EVALUATION, candidateKey(s, candidateId)) as (EvaluationReport & {
                _version: number;
            }) | null;
            if (existing !== null) {
                requireThat(existing.evaluatorId === evaluator.id && existing.fixtureCase === fixtureCase, 'EVALUATION_REPLAY_CONFLICT');
                this.verifyEvaluationRecord(s, evaluator, candidate, existing);
                return clone(existing);
            }
            const manifest = evaluationManifest(fixtureCase);
            const incumbentObservation = replayProcedure(candidate.incumbentRoles.operator.procedure, manifest.input);
            const candidateObservation = replayProcedure(candidate.proposedChange.procedure, manifest.input);
            const incumbentPasses = predicate(incumbentObservation, manifest.input);
            const candidatePasses = predicate(candidateObservation, manifest.input);
            const improvement = Number(candidatePasses) - Number(incumbentPasses);
            const verdict: EvaluationReport['verdict'] = improvement > 0 ? 'passing' : improvement < 0 ? 'rejected' : 'inconclusive';
            const reportWithoutRecord = {
                id: `evaluation-${candidateId}`,
                kind: 'FixtureEvaluation' as const,
                candidateId,
                evaluatorId: evaluator.id,
                fixtureCase,
                source: 'synthetic_fixture' as const,
                evaluationManifest: manifest,
                replay: {
                    predicate: 'delivery, required verification, and step budget all pass',
                    incumbent: { procedure: candidate.incumbentRoles.operator.procedure, observation: incumbentObservation, passed: incumbentPasses },
                    candidate: { procedure: candidate.proposedChange.procedure, observation: candidateObservation, passed: candidatePasses },
                },
                thresholds: { candidatePasses, incumbentPasses, improvement, met: improvement > 0 },
                verdict,
            };
            const recordRef = this.store.record(s, reportWithoutRecord.id, 'fixture_evaluation', reportWithoutRecord, [candidate.recordRef]);
            const report: EvaluationReport = { ...reportWithoutRecord, recordRef };
            this.store.put(EVALUATION, candidateKey(s, candidateId), report, null);
            this.store.event(s, 'learning.candidate_evaluated', { candidateId, evaluatorId: evaluator.id, verdict, evaluationRef: recordRef });
            return clone(report);
        });
    }
    decide(s: Scope, approver: Principal, candidateId: string): PromotionDecision {
        assertScope(approver, s, 'read');
        assertScope(approver, s, 'promote');
        identifier(candidateId);
        return this.store.transaction(() => {
            const candidate = this.readCandidate(s, candidateId);
            const evaluation = this.store.get(EVALUATION, candidateKey(s, candidateId)) as (EvaluationReport & {
                _version: number;
            }) | null;
            requireThat(evaluation !== null, 'EVALUATION_REQUIRED');
            this.verifyCandidateRecord(s, approver, candidate);
            this.verifyEvaluationRecord(s, approver, candidate, evaluation);
            requireThat(evaluation.evaluatorId !== approver.id, 'APPROVER_NOT_INDEPENDENT');
            requireThat(candidate.proposerId !== approver.id, 'APPROVER_IS_PROPOSER');
            const existing = this.store.get(DECISION, candidateKey(s, candidateId)) as (PromotionDecision & {
                _version: number;
            }) | null;
            if (existing !== null) {
                requireThat(existing.approverId === approver.id, 'DECISION_REPLAY_CONFLICT');
                this.verifyDecisionRecord(s, approver, candidate, evaluation, existing);
                return clone(existing);
            }
            let outcome: PromotionDecision['outcome'];
            let activeVersion: string;
            let predecessorVersion: string | null;
            if (evaluation.verdict === 'passing' && evaluation.thresholds.met) {
                const key = businessKey(s);
                const registry = this.store.get(REGISTRY, key) as Registry & {
                    _version: number;
                };
                const current = registry.roles.operator.active;
                requireThat(candidate.incumbentFingerprint === hash(candidate.incumbentRoles), 'CANDIDATE_CORRUPT');
                requireThat(current.version === candidate.proposedChange.baseVersion && hash(current) === hash(candidate.incumbentRoles.operator), 'STALE_INCUMBENT');
                const promoted: Role = {
                    id: current.id,
                    version: nextHistoryVersion(registry.roles.operator.history),
                    procedure: candidate.proposedChange.procedure,
                    competencies: clone(current.competencies),
                    tools: clone(current.tools),
                    predecessor: current.version,
                    model: 'script-v1',
                    qualification: 'fixture_only',
                };
                registry.roles.operator = {
                    active: promoted,
                    history: { ...registry.roles.operator.history, [promoted.version]: promoted },
                };
                this.store.put(REGISTRY, key, registry, registry._version);
                outcome = 'promoted';
                activeVersion = promoted.version;
                predecessorVersion = current.version;
            }
            else {
                outcome = evaluation.verdict === 'rejected' ? 'rejected' : 'inconclusive';
                const registry = this.store.get(REGISTRY, businessKey(s)) as Registry & {
                    _version: number;
                };
                activeVersion = registry.roles.operator.active.version;
                predecessorVersion = registry.roles.operator.active.predecessor;
            }
            const decisionWithoutRecord = {
                id: `decision-${candidateId}`,
                kind: 'PromotionDecision' as const,
                candidateId,
                approverId: approver.id,
                outcome,
                activeVersion,
                predecessorVersion,
                existingRunsRemainPinned: true as const,
            };
            const recordRef = this.store.record(s, decisionWithoutRecord.id, 'promotion_decision', decisionWithoutRecord, [candidate.recordRef, evaluation.recordRef]);
            const decision: PromotionDecision = { ...decisionWithoutRecord, recordRef };
            this.store.put(DECISION, candidateKey(s, candidateId), decision, null);
            this.store.event(s, 'learning.promotion_decided', { candidateId, approverId: approver.id, outcome, decisionRef: recordRef });
            return clone(decision);
        });
    }
    rollback(s: Scope, approver: Principal): PromotionDecision {
        assertScope(approver, s, 'read');
        assertScope(approver, s, 'promote');
        return this.store.transaction(() => {
            const key = businessKey(s);
            const registry = this.store.get(REGISTRY, key) as Registry & {
                _version: number;
            };
            const current = registry.roles.operator.active;
            requireThat(current.predecessor !== null, 'NO_PREDECESSOR');
            const predecessor = registry.roles.operator.history[current.predecessor];
            requireThat(predecessor !== undefined, 'PREDECESSOR_NOT_FOUND');
            registry.roles.operator = { active: clone(predecessor), history: registry.roles.operator.history };
            this.store.put(REGISTRY, key, registry, registry._version);
            const decisionWithoutRecord = {
                id: `rollback-${current.id}-${current.version}`,
                kind: 'RollbackDecision' as const,
                candidateId: null,
                approverId: approver.id,
                outcome: 'rolled_back' as const,
                activeVersion: predecessor.version,
                predecessorVersion: predecessor.predecessor,
                existingRunsRemainPinned: true as const,
            };
            const recordRef = this.store.record(s, decisionWithoutRecord.id, 'rollback_decision', decisionWithoutRecord);
            const decision: PromotionDecision = { ...decisionWithoutRecord, recordRef };
            this.store.event(s, 'learning.rolled_back', { approverId: approver.id, fromVersion: current.version, toVersion: predecessor.version, decisionRef: recordRef });
            return clone(decision);
        });
    }
    private readCandidate(s: Scope, candidateId: string): LearningCandidate {
        const candidate = this.store.get(CANDIDATE, candidateKey(s, candidateId)) as (LearningCandidate & {
            _version: number;
        }) | null;
        requireThat(candidate !== null, 'CANDIDATE_NOT_FOUND');
        return candidate;
    }
    private immutableRecord(s: Scope, principal: Principal, ref: Ref): Record<string, unknown> {
        const record = this.store.records(principal, s).find(entry => entry.id === ref.id);
        requireThat(record !== undefined, 'IMMUTABLE_RECORD_MISSING');
        requireThat(ref.version === '1' && record.sha256 === ref.sha256, 'IMMUTABLE_RECORD_REF_MISMATCH');
        const { sha256, ...body } = record;
        requireThat(hash(body) === ref.sha256, 'IMMUTABLE_RECORD_HASH_MISMATCH');
        return body as Record<string, unknown>;
    }
    private verifyCandidateRecord(s: Scope, principal: Principal, candidate: LearningCandidate): void {
        const record = this.immutableRecord(s, principal, candidate.recordRef);
        const { recordRef, _version, ...candidateWithoutRecord } = candidate as LearningCandidate & {
            _version?: number;
        };
        requireThat(hash(record.value) === hash(candidateWithoutRecord), 'CANDIDATE_ENTITY_MUTATED');
    }
    private verifyEvaluationRecord(s: Scope, principal: Principal, candidate: LearningCandidate, evaluation: EvaluationReport): void {
        const record = this.immutableRecord(s, principal, evaluation.recordRef);
        const { recordRef, _version, ...evaluationWithoutRecord } = evaluation as EvaluationReport & {
            _version?: number;
        };
        requireThat(hash(record.value) === hash(evaluationWithoutRecord), 'EVALUATION_ENTITY_MUTATED');
        const parentRefs = record.parentRefs as Ref[];
        requireThat(Array.isArray(parentRefs) && parentRefs.some(parent => parent.id === candidate.recordRef.id && parent.sha256 === candidate.recordRef.sha256), 'EVALUATION_PARENT_MISMATCH');
    }
    private verifyDecisionRecord(s: Scope, principal: Principal, candidate: LearningCandidate, evaluation: EvaluationReport | null, decision: PromotionDecision): void {
        const record = this.immutableRecord(s, principal, decision.recordRef);
        const { recordRef, _version, ...decisionWithoutRecord } = decision as PromotionDecision & {
            _version?: number;
        };
        requireThat(hash(record.value) === hash(decisionWithoutRecord), 'DECISION_ENTITY_MUTATED');
        if (evaluation !== null) {
            const parentRefs = record.parentRefs as Ref[];
            requireThat(Array.isArray(parentRefs)
                && parentRefs.some(parent => parent.id === candidate.recordRef.id && parent.sha256 === candidate.recordRef.sha256)
                && parentRefs.some(parent => parent.id === evaluation.recordRef.id && parent.sha256 === evaluation.recordRef.sha256), 'DECISION_PARENT_MISMATCH');
        }
    }
}
