import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunController } from '../src/runtime.ts';
import type { RunExtension, } from '../src/runtime.ts';
import { harness } from './helpers.ts';
import { scopeKey } from '../src/contracts.ts';

function extended(h: any, changes: Partial<RunExtension> = {}) {
    const requests: any[] = [];
    const extension: RunExtension = {
        id: 'experiment-test-v1', maxModelCost: { minorUnits: 52, currency: 'USD' }, skipLearning: true,
        context: ({ run, task, observed }) => ({ snapshot: run.snapshot, evidence: run.evidence, roleVersion: run.roles.analyst.version, dataPolicyVersion: run.scope.dataPolicyVersion, ...(task === 'operate' ? { draft: run.decision.draft } : {}), ...(task === 'verify' ? { observed } : {}) }),
        model: async ({ request }) => {
            requests.push(request);
            const result = await h.model.run(request);
            if (request.task === 'decide') result.output.draft = (await h.model.run({ ...request, task: 'operate' })).output;
            return result;
        }, ...changes,
    };
    const runtime = new RunController(h.store, extension);
    const s = runtime.create(h.principals.worker, h.environment, { runId: 'extended-test' }).scope;
    const port: any = { kind: 'live', run() { throw new Error('BYPASS_PORT_INVOKED'); } };
    const advance = (options?: any) => runtime.advance(h.principals.worker, s, h.environment, port, h.service, options);
    return { runtime, extension, requests, s, port, advance };
}

test('explicit callback integrates four stages, draft review, real readback, exact approval and no learning promotion', async () => {
    const h = harness();
    try {
        const x = extended(h);
        let run = await x.advance();
        assert.equal(run.phase, 'waiting_approval');
        assert.deepEqual(x.requests.map(r => r.task), ['investigate', 'decide', 'operate']);
        assert.deepEqual(x.requests[2].context.draft, run.decision.draft);
        assert.equal(x.requests.every(r => r.limits.maxAttempts === 1 && r.limits.maxCost.minorUnits === 52), true);
        assert.equal(h.authority.action(run.proposal), null);
        await x.advance();
        assert.equal(x.requests.length, 3);
        h.authority.approve(x.s, h.principals.owner, run.proposal);
        run = await x.advance();
        assert.equal(run.phase, 'completed', JSON.stringify(run.outcome));
        assert.equal(run.learning, null);
        assert.equal(run.outcome.operationalResult, 'pass');
        assert.equal(x.requests.length, 4);
        assert.deepEqual(x.requests[3].context.observed.artifact, run.proposal.payload.artifact);
        assert.equal(x.requests[3].context.observed.effectCount, 1);
        assert.equal(x.requests[3].context.observed.ledger.obligations.minorUnits, 0);
        await x.advance();
        assert.equal(x.requests.length, 4);
        assert.equal(h.service.reconcile(run.proposal).effectCount, 1);
    } finally { h.close(); }
});

test('completed model response survives a process-boundary fault and resume does not redispatch', async () => {
    const h = harness();
    try {
        let fault = true;
        const x = extended(h, { afterModelPersist: () => { if (fault) { fault = false; throw new Error('PROCESS_INTERRUPTION'); } } });
        await assert.rejects(x.advance(), /PROCESS_INTERRUPTION/);
        assert.equal(x.runtime.inspect(h.principals.worker, x.s).phase, 'investigate');
        assert.equal(h.store.get('model', scopeKey(x.s) + '/investigate').status, 'complete');
        const resumed = new RunController(h.store, x.extension);
        const run = await resumed.advance(h.principals.worker, x.s, h.environment, x.port, h.service);
        assert.equal(run.phase, 'waiting_approval');
        assert.equal(x.requests.filter(r => r.task === 'investigate').length, 1);
    } finally { h.close(); }
});

test('unknown callback completion remains uncertain and cannot be silently retried', async () => {
    const h = harness();
    try {
        let calls = 0;
        const x = extended(h, { model: async () => { calls++; throw new Error('TIMEOUT_WITH_UNKNOWN_COMPLETION'); } });
        await assert.rejects(x.advance(), /TIMEOUT_WITH_UNKNOWN_COMPLETION/);
        assert.equal(h.store.get('model', scopeKey(x.s) + '/investigate').status, 'uncertain');
        await assert.rejects(x.advance(), /MODEL_RESULT_UNCERTAIN/);
        assert.equal(calls, 1);
        assert.equal(x.runtime.inspect(h.principals.worker, x.s).proposal, null);
    } finally { h.close(); }
});

test('strict rejected output preserves observation and does not purchase a replacement', async () => {
    const h = harness();
    try {
        const x = extended(h, { validate: () => { throw new Error('INVALID_STAGE_OUTPUT'); } });
        await assert.rejects(x.advance(), /INVALID_STAGE_OUTPUT/);
        const row = h.store.get('model', scopeKey(x.s) + '/investigate');
        assert.equal(row.status, 'failed');
        assert.equal(row.received.output.kind, 'information_request');
        await assert.rejects(x.advance(), /MODEL_FAILED_NO_AUTOMATIC_RETRY/);
        assert.equal(x.requests.length, 1);
    } finally { h.close(); }
});

test('extension identity and cost cap are pinned; ordinary fixture controller cannot resume an experiment', () => {
    const h = harness();
    try {
        const x = extended(h);
        assert.throws(() => new RunController(h.store).inspect(h.principals.worker, x.s), /EXECUTION_EXTENSION_MISMATCH/);
        assert.throws(() => new RunController(h.store, { ...x.extension, id: 'changed' }).inspect(h.principals.worker, x.s), /EXECUTION_EXTENSION_MISMATCH/);
        assert.throws(() => new RunController(h.store, { ...x.extension, maxModelCost: { minorUnits: 53, currency: 'USD' } }).inspect(h.principals.worker, x.s), /EXECUTION_EXTENSION_MISMATCH/);
    } finally { h.close(); }
});

test('qualified missing evidence produces successful blocked no-effect observation', async () => {
    const h = harness('missing');
    try {
        const x = extended(h);
        const run = await x.advance();
        assert.equal(run.phase, 'blocked');
        assert.equal(run.outcome.operationalResult, 'pass');
        assert.equal(run.outcome.measurements.decision, 'blocked');
        assert.equal(run.proposal, null);
        assert.equal(x.requests.length, 2);
        assert.equal(h.authority.business(x.s).spent, 0);
    } finally { h.close(); }
});



test('pending controller stage recovers only a durable admitted result without invoking callback again', async () => {
    const h = harness();
    try {
        let completed: any = null, calls = 0;
        const x = extended(h, {
            model: async ({ request }) => { calls++; completed = await h.model.run(request); throw new Error('CRASH_AFTER_ADMISSION_RESULT_COMMIT'); },
            recover: requestId => requestId.endsWith('-investigate') ? completed : null,
        });
        await assert.rejects(x.advance(), /CRASH_AFTER_ADMISSION_RESULT_COMMIT/);
        const key = scopeKey(x.s) + '/investigate';
        assert.equal(h.store.get('model', key).status, 'uncertain');
        const run = await x.advance({ checkpoint: 'evidence' });
        assert.equal(run.phase, 'evidence');
        assert.equal(h.store.get('model', key).recovered, true);
        assert.equal(calls, 1);
    } finally { h.close(); }
});

test('opted-in terminal decisions receive bounded review before a successful no-effect outcome', async () => {
    for (const verdict of ['ready', 'blocked']) {
        const h = harness('missing');
        try {
            const x = extended(h, { reviewTerminalDecision: true });
            const original = x.extension.model;
            x.extension.model = async args => {
                const result = await original(args);
                if (args.task === 'operate') result.output.review = { verdict, findings: verdict === 'ready' ? [] : ['Decision evidence needs review.'] };
                return result;
            };
            if (verdict === 'ready') {
                const run = await x.advance();
                assert.equal(run.phase, 'blocked');
                assert.equal(run.outcome.operationalResult, 'pass');
                assert.equal(run.outcome.workerReview.verdict, 'ready');
            } else {
                await assert.rejects(x.advance(), /WORKFLOW_REVIEW_BLOCKED/);
                assert.equal(x.runtime.inspect(h.principals.worker, x.s).phase, 'terminal_review');
                assert.equal(x.runtime.inspect(h.principals.worker, x.s).outcome, null);
                await assert.rejects(x.advance(), /WORKFLOW_REVIEW_BLOCKED/);
            }
            assert.deepEqual(x.requests.map(r => r.task), ['investigate', 'decide', 'operate']);
            assert.equal(x.runtime.inspect(h.principals.worker, x.s).proposal, null);
            assert.equal(h.authority.business(x.s).spent, 0);
        } finally { h.close(); }
    }
});
