import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Workbench } from '../src/workbench/service.ts';
import { startWorkbench } from '../src/workbench/server.ts';
import { invoiceView, runInvoice, invoiceLocation } from '../src/workbench/invoice-runtime.ts';
import { invoiceBundle, lookupInvoiceEvidence, materializePacket } from '../src/workbench/invoice.ts';
import { StateStore } from '../src/state.ts';
import { hash, scopeKey } from '../src/contracts.ts';

const root = () => mkdtempSync(join(tmpdir(), 'midas-workbench-journey-'));
async function plan(app: Workbench, assignment: string) {
    const { id } = app.create(assignment);
    const interpreted = await app.act(id, 'analyze');
    assert.equal(interpreted.business.proposal.provenance, 'offline_mock');
    assert.equal(interpreted.business.proposal.acceptedByOwner, false);
    assert.equal(interpreted.current, null);
    await assert.rejects(() => app.act(id, 'accept', { proposalHash: 'obsolete' }), /STALE_UNDERSTANDING/);
    await app.act(id, 'accept', { proposalHash: interpreted.proposalHash });
    const planned = await app.act(id, 'plan');
    assert.ok(planned.current);
    assert.equal(planned.plan.team.workers.length, 1);
    return { id, planned };
}

test('owner journey connects support interpretation, plan, exact approval, deliverable and business feedback', async () => {
    const app = new Workbench(root());
    try {
        const { id } = await plan(app, 'support');
        const waiting = await app.act(id, 'run');
        assert.ok(waiting.approval?.proposalHash);
        assert.ok(waiting.approval.artifact);
        await assert.rejects(() => app.act(id, 'approve', { proposalHash: '0'.repeat(64) }), /STALE|HASH|APPROVAL/);
        const finished = await app.act(id, 'approve', { proposalHash: waiting.approval.proposalHash });
        assert.equal(finished.plan.outcome.operational, 'pass');
        assert.equal(finished.plan.outcome.effectCount, 1);
        assert.equal(finished.plan.outcome.provenance, 'mock');
        assert.equal(finished.plan.outcome.independentHumanSeconds, null);
        assert.equal(finished.outcome.effectCount, 1);
        assert.ok(finished.finalArtifact);
        const before = hash(finished.plan.outcome);
        const repeated = await app.act(id, 'run');
        assert.equal(hash(repeated.plan.outcome), before);
        assert.equal(repeated.outcome.effectCount, 1);
        assert.equal(repeated.feedback.observations.length, 1);
        assert.ok(repeated.assessment.acquiredEvidence.length > 0);
    } finally { app.close(); }
});

for (const [assignment, total] of [['invoice-1', 29000], ['invoice-2', 17000], ['invoice-3', 27000]] as const) {
    test(`${assignment}: reviewed recommendation authoritatively updates register totals memo approval and one fixture outcome`, async () => {
        const app = new Workbench(root());
        try {
            const { id } = await plan(app, assignment);
            const waiting = await app.act(id, 'run');
            assert.equal(waiting.run.phase, 'waiting_approval');
            assert.equal(waiting.run.callsUsed, 3);
            assert.equal(waiting.run.providerRequests, 0);
            assert.equal(waiting.plan.outcome, null);
            assert.ok(waiting.review.changes.length > 0);
            assert.notEqual(waiting.initialArtifact.contentHash, waiting.approval.artifact.contentHash);
            assert.notEqual(waiting.initialArtifact.totalReleaseMinor, waiting.approval.artifact.totalReleaseMinor);
            assert.notEqual(waiting.initialArtifact.memo, waiting.approval.artifact.memo);
            const b = invoiceBundle('AP-00' + assignment.at(-1));
            const hydrated = lookupInvoiceEvidence(b, b.permittedLookups);
            const authoritative = materializePacket(hydrated, waiting.run.decision.draft.recommendation);
            assert.deepEqual(authoritative, waiting.approval.artifact);
            assert.equal(authoritative.totalReleaseMinor, total);
            assert.equal(authoritative.register.reduce((n, r) => n + r.amountMinor, 0), total);
            assert.equal(authoritative.remainingCashMinor, b.cashMinor - total);
            assert.match(authoritative.memo, new RegExp('Recommend USD ' + total + ' cents'));
            // A proposal bound to the original draft would not authorize the reviewed payload.
            const binding = JSON.parse(readFileSync(join(waiting.plan.execution.root, 'binding.json'), 'utf8'));
            const store = new StateStore(join(waiting.plan.execution.root, 'workflow.sqlite'));
            let oldHash: string;
            try {
                const s = { tenantId: 'workbench', businessId: binding.id, runId: 'invoice-workflow', dataPolicyVersion: 'invoice-policy-v1', mode: 'fixture' as const };
                const run = store.get('run', scopeKey(s));
                const oldPayload = { ...run.proposal.payload, artifact: waiting.initialArtifact };
                oldHash = hash({ ...run.proposal, payload: oldPayload, payloadHash: hash(oldPayload) });
            } finally { store.close(); }
            await assert.rejects(() => app.act(id, 'approve', { proposalHash: oldHash }), /STALE_APPROVAL/);
            assert.equal(app.view(id).run.callsUsed, 3);
            const completed = await app.act(id, 'approve', { proposalHash: waiting.approval.proposalHash });
            assert.equal(completed.run.phase, 'completed');
            assert.equal(completed.run.callsUsed, 4);
            assert.equal(completed.run.providerRequests, 0);
            assert.equal(completed.run.observation.effectCount, 1);
            assert.equal(completed.run.observation.ledger.obligations.minorUnits, 0);
            assert.equal(completed.run.checks.ok, true);
            assert.equal(completed.run.checks.humanCorrectionTime, null);
            assert.deepEqual(completed.finalArtifact, authoritative);
            assert.equal(completed.plan.outcome.operational, 'pass');
            const repeated = await app.act(id, 'run');
            assert.equal(repeated.run.callsUsed, 4);
            assert.equal(repeated.run.observation.effectCount, 1);
            assert.deepEqual(repeated.finalArtifact, authoritative);
        } finally { app.close(); }
    });
}

test('edited evidence cannot silently execute the original assignment corpus', async () => {
    const app = new Workbench(root());
    try {
        const { id } = app.create('invoice-1');
        const v = app.view(id);
        await app.act(id, 'save', { expected: v.business.revision, goal: v.business.goal, sources: v.business.bundle.sources.map((s: any, index: number) => ({ index, text: s.text + '\nChanged source: cash allowance is now zero.' })) });
        const interpreted = await app.act(id, 'analyze');
        await app.act(id, 'accept', { proposalHash: interpreted.proposalHash });
        await app.act(id, 'plan');
        await assert.rejects(() => app.act(id, 'run'), /EDITED_EVIDENCE/);
        assert.equal(app.view(id).plan.execution, null);
    } finally { app.close(); }
});

test('invoice invalid model output stays failed with its reservation and cannot silently retry', async () => {
    const app = new Workbench(root());
    try {
        const { planned } = await plan(app, 'invoice-1');
        const executionRoot = invoiceLocation(app.root, planned.plan);
        let calls = 0;
        const options = { port: { kind: 'fixture' as const, run() { calls++; return { output: { bad: true }, usage: { inputTokens: null, outputTokens: null, cost: { status: 'unknown' as const, money: null, basis: 'invalid injected fixture output' } }, route: { kind: 'fixture' as const, provider: 'mock', model: 'offline-invoice-fixture' } }; } } };
        // The controller may return a durable failed state instead of throwing.
        try { await runInvoice(executionRoot, planned.plan, 'AP-001', options); } catch { /* inspected below */ }
        const failed = invoiceView(executionRoot);
        assert.equal(failed.callsUsed, 1);
        assert.equal(failed.providerRequests, 0);
        assert.ok(failed.attempts[0].error);
        assert.equal(failed.attempts[0].reservation, 52);
        assert.equal(failed.approval, null);
        try { await runInvoice(executionRoot, planned.plan, 'AP-001', options); } catch { /* no retry is permitted */ }
        assert.equal(calls, 1);
        assert.equal(invoiceView(executionRoot).callsUsed, 1);
    } finally { app.close(); }
});

test('interactive server requires local session, matching origin and CSRF before persistent mutations', async () => {
    const { server, app } = startWorkbench(root(), 0);
    try {
        await once(server, 'listening');
        const origin = 'http://127.0.0.1:' + (server.address() as any).port;
        assert.equal((await fetch(origin + '/api/state')).status, 401);
        const page = await fetch(origin + '/');
        assert.equal(page.status, 200);
        assert.match(await page.text(), /MIDAS/);
        const cookie = page.headers.get('set-cookie')!.split(';')[0];
        assert.match(page.headers.get('set-cookie')!, /HttpOnly/);
        assert.match(page.headers.get('set-cookie')!, /SameSite=Strict/);
        const state = await (await fetch(origin + '/api/state', { headers: { cookie } })).json();
        assert.ok(state.csrf);
        const post = (extra: Record<string, string>) => fetch(origin + '/api/create', { method: 'POST', headers: { cookie, 'content-type': 'application/json', ...extra }, body: JSON.stringify({ assignment: 'invoice-1' }) });
        assert.equal((await post({})).status, 403);
        assert.equal((await post({ origin: 'https://untrusted.example', 'x-csrf-token': state.csrf })).status, 403);
        assert.equal((await post({ origin, 'x-csrf-token': 'bad-token' })).status, 403);
        assert.equal(app.list().length, 0);
        const created = await post({ origin, 'x-csrf-token': state.csrf });
        assert.equal(created.status, 200);
        const { id } = await created.json();
        assert.equal(app.list().length, 1);
        const viewed = await (await fetch(origin + '/api/state?id=' + id, { headers: { cookie } })).json();
        assert.equal(viewed.business.id, id);
        assert.equal(viewed.current, null);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
