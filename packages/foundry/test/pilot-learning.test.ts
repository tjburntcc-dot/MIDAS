import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from '../src/state.ts';
import { hash } from '../src/contracts.ts';
import { PilotKnowledge } from '../src/pilot/knowledge.ts';
import { PilotLearning } from '../src/pilot/learning.ts';

test('recorded correction drives a scoped candidate, fair fixture comparison and retained future baseline', () => {
    const store = new StateStore(':memory:'); try {
        const k = new PilotKnowledge(store), c = k.createDemo(), learning = new PilotLearning(store); const before = learning.assignment(c.id, 'response-packet'); assert.match(before.selectionReason, /Retained strong baseline/);
        assert.throws(() => learning.run(c.id, 'work-one'), /PILOT_CORRECTION_EVIDENCE_REQUIRED/);
        const correction = k.correction(c.id, { taskId: 'work-one', artifactHash: hash('observed fixture output'), instruction: 'Carry the corrected inspection policy through the preview.', assisted: true });
        const result = learning.run(c.id, 'work-one'); assert.equal(result.correctionId, correction.id); assert.equal(result.status, 'fixture_comparison_complete'); assert.equal(result.decision, 'retain_baseline'); assert.equal(result.comparison.actualModelCalls, 0); assert.equal(result.comparison.independentHumanSeconds, null); assert.equal(result.comparison.developmentEvidence.excludedFromEvaluation, true); assert.equal(result.comparison.evaluationAnalysis.matched, true); assert.equal(result.comparison.evaluationAnalysis.eligible, false); assert.equal(result.comparison.observations.length, 2); assert.match(result.comparison.evaluationPopulation, /not a confidential holdout/);
        const after = learning.assignment(c.id, 'response-packet'); assert.equal(after.procedureHash, before.procedureHash); assert.equal(after.procedureVersion, before.procedureVersion); assert.equal(learning.list(c.id).length, 1); assert.equal(learning.run(c.id, 'work-one').id, result.id); assert.throws(() => learning.registry.adopt(result.candidateId, result.comparison.id, after.procedureScope, 'Fixture promotion'), /PROCEDURE_ADVANTAGE_NOT_DEMONSTRATED/);
    } finally { store.close(); }
});

test('owner data prepares a candidate but cannot produce fixture scores; selection is company and job scoped', () => {
    const store = new StateStore(':memory:'); try {
        const k = new PilotKnowledge(store), a = k.createCompany({ name: 'A', goal: 'Useful work' }), b = k.createCompany({ name: 'B', goal: 'Other useful work' }), learning = new PilotLearning(store);
        k.correction(a.id, { taskId: 'work', artifactHash: hash('owner artifact'), instruction: 'Use the current service name.', assisted: false }); const candidate = learning.run(a.id, 'work'); assert.equal(candidate.status, 'candidate_prepared'); assert.equal(candidate.comparison, null); assert.equal(candidate.decision, 'retain_baseline'); assert.throws(() => learning.runFixtureComparison(a.id, 'work'), /PILOT_FIXTURE_COMPARISON_ONLY/); assert.throws(() => learning.propose(b.id, 'work'), /PILOT_CORRECTION_EVIDENCE_REQUIRED/);
        const aResponse = learning.assignment(a.id, 'response-packet'), bResponse = learning.assignment(b.id, 'response-packet'), aSite = learning.assignment(a.id, 'business-site'); assert.notEqual(aResponse.procedureVersion, bResponse.procedureVersion); assert.notEqual(aResponse.procedureVersion, aSite.procedureVersion); assert.equal(aSite.capability, 'software.build'); assert.equal(aResponse.capability, 'service.brief'); assert.match(aResponse.selectedProcedure.procedure, /owner correction/); assert.equal(learning.list(b.id).length, 0);
    } finally { store.close(); }
});
