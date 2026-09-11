import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { hash, scopeKey } from '../src/contracts.ts';
import type { Scope, Principal } from '../src/contracts.ts';
import { buildEvidenceRequest, evidenceAudit, fixtureEvidencePort, prospectiveEvidenceRequest, runEvidenceProposal, validateUnderstanding } from '../src/workbench/evidence.ts';
import type { EvidenceBundle, UnderstandingProposal } from '../src/workbench/evidence.ts';

const scope: Scope = { tenantId: 'test', businessId: 'business-a', runId: 'understanding', dataPolicyVersion: 'policy-v1', mode: 'fixture' };
const owner: Principal = { id: 'owner', tenantId: 'test', businessId: 'business-a', permissions: ['read', 'operate'] };
const bundle: EvidenceBundle = {
    version: 'sources-v1', asOf: '2026-09-12T00:00:00Z', purpose: 'Diagnose the next operational constraint from permitted records.', currency: 'USD', valueBasis: 'monthly contribution',
    dimensions: ['delivery', 'economics'], allowedTools: ['lab.evidence'], allowedEffects: ['lab.publish'],
    sources: [
        { id: 'dispatch', version: 'v1', text: 'Ten of twenty shipments missed their promised date. The queue is 12 jobs.', observedAt: '2026-09-10T00:00:00Z', validUntil: null, permission: 'worker', rights: 'Synthetic fixture authored for development.' },
        { id: 'old-note', version: 'v1', text: 'There is no shipment queue.', observedAt: '2026-08-01T00:00:00Z', validUntil: '2026-08-30T00:00:00Z', permission: 'worker', rights: 'Synthetic fixture authored for development.' },
        { id: 'grader-secret', version: 'v1', text: 'PRIVATE_ACCEPTANCE_DO_NOT_TRANSMIT', observedAt: '2026-09-10T00:00:00Z', validUntil: null, permission: 'excluded', rights: 'Evaluator only.' },
    ]
};
/** This is a declared test answer, separate from the production adapter. */
const proposal: UnderstandingProposal = {
    kind: 'business-understanding-proposal', completeness: 'partial',
    claims: [
        { id: 'late', kind: 'observation', dimension: 'delivery', statement: 'The dispatch record reports half the shipments late; independent accuracy is unknown.', references: [{ sourceId: 'dispatch', quote: 'Ten of twenty shipments missed their promised date.' }] },
        { id: 'queue', kind: 'observation', dimension: 'delivery', statement: 'Current dispatch records a queue.', references: [{ sourceId: 'dispatch', quote: 'The queue is 12 jobs.' }] },
        { id: 'old', kind: 'observation', dimension: 'delivery', statement: 'An expired note reported no queue.', references: [{ sourceId: 'old-note', quote: 'There is no shipment queue.' }] },
    ],
    contradictions: [{ claimIds: ['queue', 'old'], explanation: 'Queue statements differ across time; age may explain the discrepancy.' }],
    unknowns: [{ question: 'Which step creates the delay?', consequence: 'Buying capacity could target the wrong cause.', claimIds: ['late'] }],
    evidenceRequests: [{ id: 'timestamps', tool: 'lab.evidence', query: 'Obtain job-stage timestamps for the delayed shipments.', decisionUse: 'Distinguish capacity from upstream delay.', claimIds: ['late', 'queue'] }],
    hypotheses: [
        { id: 'queue-bottleneck', diagnosis: 'A delivery-stage queue may constrain throughput.', claimIds: ['late', 'queue'], alternativeExplanation: 'Late upstream inputs may explain the queue.', uncertainty: 'No step timestamps yet.', estimatedBenefit: { minorUnits: 900, currency: 'USD' }, estimatedCost: { minorUnits: 200, currency: 'USD' }, valueBasis: 'monthly contribution' },
        { id: 'promise-bottleneck', diagnosis: 'Promised dates may be unrealistic.', claimIds: ['late'], alternativeExplanation: 'The queue may instead reflect avoidable execution delay.', uncertainty: 'The promise policy is unavailable.', estimatedBenefit: null, estimatedCost: null, valueBasis: 'monthly contribution' },
    ], selectedHypothesisId: 'queue-bottleneck', selectionReason: 'Request stage evidence before committing to capacity changes.',
    tasks: [{ id: 'trace', hypothesisId: 'queue-bottleneck', description: 'Inspect permitted stage records and recommend a measured intervention.', dependsOn: [], competencies: ['process_diagnosis'], tools: ['lab.evidence'], effect: null, acceptance: ['Source-linked stage-delay comparison; no unsupported capacity purchase.'] }]
};
function setup() { return new StateStore(join(mkdtempSync(join(tmpdir(), 'workbench-evidence-')), 'state.sqlite')); }

test('permitted sources reach exact prospective request; excluded evaluator text and identifiers never do', () => {
    const request = buildEvidenceRequest(scope, bundle, 'A-001');
    assert.equal(JSON.stringify(request).includes('PRIVATE_ACCEPTANCE'), false);
    assert.equal(JSON.stringify(request).includes('grader-secret'), false);
    assert.deepEqual(evidenceAudit(bundle).staleSourceIds, ['old-note']);
    const route = { authorizationId: 'prospective-only', model: 'gpt-6-astra', reasoningEffort: 'high' as const, serviceTier: 'default' as const, maxOutputTokens: 8192, inputTokenCeiling: 8192, deadlineMs: 180000, maxCallCost: { minorUnits: 52, currency: 'USD' }, pricing: { inputMinorPerMillion: 1250, outputMinorPerMillion: 5000, source: 'current verification required', effectiveAt: '2026-09-11T00:00:00Z' } };
    const prospective = prospectiveEvidenceRequest(scope, bundle, 'A-001', route);
    assert.equal(prospective.liveAuthorized, false);
    assert.equal(prospective.body.model, route.model);
    assert.equal(prospective.body.text.format.strict, true);
    assert.equal(JSON.parse(prospective.body.input).context.sources.length, 2);
});

test('proposal output controls claims, comparison and plan; persisted resume does not invoke model again', async () => {
    const store = setup(); let calls = 0;
    try {
        const fixture = fixtureEvidencePort(proposal);
        const port = { kind: 'fixture' as const, run(r: any) { calls++; return fixture.run(r); } };
        const result = await runEvidenceProposal(store, owner, scope, bundle, port, 'A-001');
        assert.equal(result.output.selectedHypothesisId, 'queue-bottleneck');
        assert.equal(result.comparisons[0].netEstimatedMinor, 700);
        assert.equal(result.comparisons[1].netEstimatedMinor, null);
        assert.equal(result.acceptedByOwner, false);
        assert.equal(result.costs.actualProviderCalls, 0);
        const resumed = await runEvidenceProposal(store, owner, scope, bundle, port, 'A-001');
        assert.equal(resumed.outputHash, hash(proposal)); assert.equal(calls, 1);
        assert.equal(store.records(owner, scope).length, 3);
        const alternative = structuredClone(proposal); alternative.selectedHypothesisId = null; alternative.tasks = []; alternative.selectionReason = 'Insufficient evidence: defer action.';
        const second = await runEvidenceProposal(store, owner, scope, bundle, fixtureEvidencePort(alternative), 'A-002');
        assert.equal(second.output.selectedHypothesisId, null);
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, { ...bundle, purpose: 'Changed' }, port, 'A-001'), /UNDERSTANDING_REQUEST_CHANGED/);
    } finally { store.close(); }
});

test('structural, reference, permission, arithmetic and dependency defects are rejected', () => {
    validateUnderstanding(bundle, proposal);
    const mutate = (f: (p: any) => void) => { const p = structuredClone(proposal); f(p); return p; };
    for (const broken of [
        mutate(p => p.unexpected = true), mutate(p => p.completeness = 'complete'),
        mutate(p => p.claims[0].references[0].quote = 'A fabricated quote'),
        mutate(p => p.claims[0].references[0] = { sourceId: 'grader-secret', quote: 'PRIVATE_ACCEPTANCE_DO_NOT_TRANSMIT' }),
        mutate(p => p.evidenceRequests[0].tool = 'network.unapproved'),
        mutate(p => p.tasks[0].effect = 'customer.refund'),
        mutate(p => p.tasks[0].dependsOn = ['trace']),
        mutate(p => p.hypotheses[0].estimatedBenefit.minorUnits = 1.2),
        mutate(p => p.hypotheses[0].estimatedBenefit.currency = 'EUR'),
        mutate(p => p.hypotheses[0].claimIds = ['invented']),
        mutate(p => p.tasks = []), mutate(p => p.hypotheses[0].valueBasis = 'yearly revenue'),
    ]) assert.throws(() => validateUnderstanding(bundle, broken));
});

test('failed output consumes admission and preserves reservation, with no automatic replacement', async () => {
    const store = setup(); let calls = 0;
    try {
        const bad = { kind: 'fixture' as const, run() { calls++; throw new Error('injected unknown completion'); } };
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, bad, 'A-001'), /unknown completion/);
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, fixtureEvidencePort(proposal), 'A-001'), /UNCERTAIN_OR_FAILED/);
        const row = store.get('model-attempt', scopeKey(scope) + '/A-001');
        assert.equal(row.reservation, 52); assert.equal(row.inferenceDispatchIntent, true); assert.equal(calls, 1);
    } finally { store.close(); }
});

test('invalid returned model output remains an immutable observation, not an accepted proposal', async () => {
    const store = setup();
    try {
        const invalid = structuredClone(proposal); invalid.tasks[0].effect = 'customer.refund';
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, fixtureEvidencePort(invalid), 'A-001'), /UNDERSTANDING_AUTHORITY/);
        const preserved = store.records(owner, scope).find(r => r.kind === 'business-understanding-response');
        assert.equal(preserved.value.result.output.tasks[0].effect, 'customer.refund');
        assert.equal(store.get('understanding-proposal', scopeKey(scope) + '/A-001'), null);
        assert.equal(store.get('model-attempt', scopeKey(scope) + '/A-001').reservation, 52);
    } finally { store.close(); }
});

test('concurrent duplicate and changed-scope accesses cannot execute; no live port is reached', async () => {
    const store = setup(); let release!: () => void;
    try {
        let calls = 0;
        const port = { kind: 'fixture' as const, async run(r: any) { calls++; await new Promise<void>(resolve => { release = resolve; }); return fixtureEvidencePort(proposal).run(r); } };
        const first = runEvidenceProposal(store, owner, scope, bundle, port, 'A-001');
        await new Promise(resolve => setImmediate(resolve));
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, port, 'A-001'), /UNCERTAIN_OR_FAILED/);
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, port, 'A-002'), /CONCURRENCY_CAP/);
        release(); await first; assert.equal(calls, 1);
        await assert.rejects(() => runEvidenceProposal(store, { ...owner, businessId: 'other' }, scope, bundle, port, 'A-003'), /SCOPE_DENIED/);
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, { kind: 'live', run() { throw Error('must never execute'); } }, 'A-003'), /LIVE_NOT_AUTHORIZED/);
    } finally { store.close(); }
});

test('eight fixture admissions share one finite cap; failed calls cannot reset it', async () => {
    const store = setup();
    try {
        for (let n = 0; n < 8; n++) await runEvidenceProposal(store, owner, scope, bundle, fixtureEvidencePort(proposal), 'A-' + n);
        await assert.rejects(() => runEvidenceProposal(store, owner, scope, bundle, fixtureEvidencePort(proposal), 'A-9'), /ATTEMPT_CAP/);
        assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM entities WHERE kind='model-attempt'").get()!.n, 8);
    } finally { store.close(); }
});
