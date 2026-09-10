import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FoundryError } from '../src/contracts.ts';
import { LearningService } from '../src/learning.ts';
import { StateStore } from '../src/state.ts';

const scope = (runId: string) => ({ tenantId: 'tenant', businessId: 'business', runId, dataPolicyVersion: 'policy1', mode: 'fixture' as const });
const proposer = { id: 'proposer', tenantId: 'tenant', businessId: 'business', permissions: ['read', 'operate'] };
const evaluator = { id: 'evaluator', tenantId: 'tenant', businessId: 'business', permissions: ['read', 'evaluate'] };
const approver = { id: 'approver', tenantId: 'tenant', businessId: 'business', permissions: ['read', 'promote'] };
const fixtureOutcome = { source: 'synthetic_fixture', failure: { symptom: 'missed verification' }, outcome: { delivered: false } };

function serviceForTest() {
  const directory = mkdtempSync(join(tmpdir(), 'foundry-learning-'));
  const store = new StateStore(join(directory, 'state.sqlite'));
  return { directory, store, service: new LearningService(store) };
}

test('rejected and inconclusive fixture candidates preserve the incumbent', () => {
  const { directory, store, service } = serviceForTest();
  try {
    const s = scope('run-reject');
    assert.equal(service.initialize(s).operator.version, '1');
    const rejected = service.propose(s, proposer, fixtureOutcome);
    const rejectedReport = service.evaluate(s, evaluator, rejected.id, 'regresses');
    assert.equal(rejectedReport.verdict, 'rejected');
    assert.equal(rejectedReport.thresholds.improvement, -1);
    assert.equal(service.decide(s, approver, rejected.id).outcome, 'rejected');

    const inconclusive = service.propose(s, proposer, { ...fixtureOutcome, hypothesis: 'delivery-only control' });
    assert.equal(service.evaluate(s, evaluator, inconclusive.id, 'inconclusive').verdict, 'inconclusive');
    assert.equal(service.decide(s, approver, inconclusive.id).outcome, 'inconclusive');
    assert.equal(service.roles(scope('run-after-reject')).operator.version, '1');
    const read = service.read(s, { ...approver, permissions: ['read'] }, rejected.id);
    assert.equal(read.evaluation?.evaluationManifest.accessPolicy.learner, 'development_manifest_only');
    assert.notEqual(read.evaluation?.evaluationManifest.evaluationCaseId, read.evaluation?.evaluationManifest.developmentCaseId);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('promotion is independently approved, stale incumbents cannot promote, and rollback only changes new runs', () => {
  const { directory, store, service } = serviceForTest();
  try {
    const before = scope('run-before');
    service.initialize(before);
    const stale = service.propose(before, proposer, fixtureOutcome);
    const winning = service.propose(before, proposer, { ...fixtureOutcome, hypothesis: 'independent verification trial' });
    service.evaluate(before, evaluator, stale.id, 'improves');
    service.evaluate(before, evaluator, winning.id, 'improves');
    assert.equal(service.evaluate(before, evaluator, winning.id, 'improves').recordRef.sha256, service.read(before, evaluator, winning.id).evaluation?.recordRef.sha256);
    const promoted = service.decide(before, approver, winning.id);
    assert.equal(promoted.outcome, 'promoted');
    assert.equal(promoted.activeVersion, '2');
    assert.equal(service.decide(before, approver, winning.id).recordRef.sha256, promoted.recordRef.sha256, 'the same approval command is recoverable');
    assert.equal(service.roles(before).operator.version, '1', 'the existing run is pinned');
    assert.equal(service.roles(scope('run-promoted')).operator.version, '2', 'new work uses the active promotion');
    assert.throws(() => service.decide(before, approver, stale.id), (error: unknown) => error instanceof FoundryError && error.code === 'STALE_INCUMBENT');

    const rollback = service.rollback(scope('run-rollback'), approver);
    assert.equal(rollback.outcome, 'rolled_back');
    assert.equal(rollback.activeVersion, '1');
    assert.equal(service.roles(scope('run-promoted')).operator.version, '2', 'already initialized promoted work remains pinned');
    assert.equal(service.roles(scope('run-after-rollback')).operator.version, '1');

    const repromoteScope = scope('run-repromote');
    const repromote = service.propose(repromoteScope, proposer, fixtureOutcome);
    service.evaluate(repromoteScope, evaluator, repromote.id, 'improves');
    assert.equal(service.decide(repromoteScope, approver, repromote.id).activeVersion, '3', 'version history is never overwritten after rollback');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fixture source, permission, and independent evaluator gates are enforced', () => {
  const { directory, store, service } = serviceForTest();
  try {
    const s = scope('run-gates');
    assert.throws(() => service.propose(s, proposer, { source: 'live' }), (error: unknown) => error instanceof FoundryError && error.code === 'FIXTURE_SOURCE_REQUIRED');
    const candidate = service.propose(s, proposer, fixtureOutcome);
    assert.equal(service.propose(s, proposer, fixtureOutcome).id, candidate.id, 'the exact proposal command is recoverable');
    assert.throws(() => service.evaluate(s, proposer, candidate.id), (error: unknown) => error instanceof FoundryError && error.code === 'SCOPE_DENIED');
    const notSeparate = { ...proposer, permissions: ['read', 'evaluate'] };
    assert.throws(() => service.evaluate(s, notSeparate, candidate.id), (error: unknown) => error instanceof FoundryError && error.code === 'EVALUATOR_NOT_INDEPENDENT');
    service.evaluate(s, evaluator, candidate.id, 'improves');
    const learnerApprover = { ...proposer, permissions: ['read', 'promote'] };
    assert.throws(() => service.decide(s, learnerApprover, candidate.id), (error: unknown) => error instanceof FoundryError && error.code === 'APPROVER_IS_PROPOSER');

    const passOutcome = service.propose(scope('run-passed-outcome'), proposer, { source: 'synthetic_fixture', outcome: { status: 'passed' } });
    assert.equal(passOutcome.diagnosis.evidenceState, 'diagnostic_gap_only');
    assert.equal(passOutcome.diagnosis.observedFailure, null);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
