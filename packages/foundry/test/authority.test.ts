import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, waitForApproval } from './helpers.ts';
import { hash, scopeKey } from '../src/contracts.ts';
import { FixtureService } from '../src/lab/fixture-service.ts';
import { join } from 'node:path';
test('missing, expired, revoked, wrong-tenant, wrong-payload and stale-state grants refuse effects', async () => {
    for (const fault of ['missing', 'expired', 'revoked', 'wrong-tenant', 'wrong-payload', 'stale-state', 'stale-policy']) {
        const h = harness();
        try {
            const run = await waitForApproval(h);
            let p = structuredClone(run.proposal);
            if (fault !== 'missing')
                h.authority.approve(h.s, h.principals.owner, p, fault === 'expired' ? { expiresAt: '2000-01-01T00:00:00.000Z' } : {});
            if (fault === 'revoked')
                h.authority.revoke(h.s, h.principals.owner, p.id);
            if (fault === 'wrong-tenant')
                p.scope.tenantId = 'lab-b';
            if (fault === 'wrong-payload') {
                p.payload.artifact.title = 'changed after approval';
                p.payloadHash = hash(p.payload);
            }
            if (fault === 'stale-state') {
                const b = h.authority.business(h.s);
                h.store.transaction(() => h.store.put('business', 'lab-a/support-a', { ...b, stateVersion: b.stateVersion + 1 }, b._version));
            }
            if (fault === 'stale-policy')
                h.authority.changePolicy(h.s, h.principals.owner, 'lab-policy-v2');
            assert.throws(() => h.authority.reserve(p), undefined, fault);
            assert.equal(h.service.reconcile(run.proposal).effectCount, 0);
            assert.equal(h.authority.business(h.s).reserved, 0);
            if (fault !== 'wrong-tenant')
                assert.equal(h.store.events(h.principals.owner, h.s).filter(e => e.kind === 'action_denied').length, 1);
        }
        finally {
            h.close();
        }
    }
});
test('worker proposal text cannot authenticate approval or promotion', async () => {
    const h = harness();
    try {
        const run = await waitForApproval(h);
        assert.throws(() => h.authority.approve(h.s, h.principals.worker, run.proposal), /SCOPE_DENIED/);
        assert.throws(() => h.authority.authenticate('owner', h.tokens.worker), /AUTHENTICATION_FAILED/);
        assert.equal(h.store.get('grant', scopeKey(h.s) + '/publish'), null);
    }
    finally {
        h.close();
    }
});
test('timeout after effect retains reservation and obligations until receipt reconciliation with no duplicate', async () => {
    const h = harness('viable', { fault: 'timeout_after_effect' });
    try {
        const run = await waitForApproval(h);
        h.authority.approve(h.s, h.principals.owner, run.proposal);
        const uncertain = await h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, h.service);
        assert.equal(uncertain.phase, 'reconciling');
        assert.equal(h.authority.action(run.proposal).status, 'unknown');
        assert.equal(h.authority.business(h.s).reserved, 25);
        assert.equal(uncertain.proposal.payload.simulatedLedger.obligations.minorUnits, 1000);
        const done = await h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, h.service);
        assert.equal(done.phase, 'learning_review');
        assert.equal(h.service.reconcile(run.proposal).effectCount, 1);
        assert.equal(h.authority.business(h.s).spent, 25);
        assert.equal(h.authority.business(h.s).reserved, 0);
        assert.equal(h.authority.action(run.proposal).attempts, 1);
    }
    finally {
        h.close();
    }
});
test('unknown and provisional costs remain reserved; settlement and release are atomic and idempotent', async () => {
    const h = harness();
    try {
        const run = await waitForApproval(h), p = run.proposal;
        h.authority.approve(h.s, h.principals.owner, p);
        h.authority.reserve(p);
        h.authority.settle(p, { status: 'unknown', actualCost: { status: 'unknown', money: null, basis: 'invoice missing' } });
        assert.equal(h.authority.business(h.s).reserved, 25);
        h.authority.settle(p, { status: 'confirmed', externalReceiptId: 'receipt', payloadHash: p.payloadHash, actualCost: { status: 'provisional', money: { minorUnits: 19, currency: 'USD' }, basis: 'provisional invoice' } });
        assert.equal(h.authority.action(p).status, 'unknown');
        assert.equal(h.authority.business(h.s).spent, 0);
        assert.equal(h.authority.business(h.s).reserved, 25);
        const actual = { status: 'confirmed', externalReceiptId: 'receipt', payloadHash: p.payloadHash, actualCost: { status: 'known', money: { minorUnits: 19, currency: 'USD' }, basis: 'settled invoice' } } as any;
        h.authority.settle(p, actual);
        h.authority.settle(p, actual);
        assert.equal(h.authority.business(h.s).spent, 19);
        assert.equal(h.authority.business(h.s).reserved, 0);
    }
    finally {
        h.close();
    }
});
test('authoritative absence releases funds and records failed reservation without retry', async () => {
    const h = harness();
    try {
        const run = await waitForApproval(h), p = run.proposal;
        h.authority.approve(h.s, h.principals.owner, p);
        h.authority.reserve(p);
        const absent = h.service.reconcile(p);
        h.authority.settle(p, absent, h.service.verifyObservation.bind(h.service));
        assert.equal(h.authority.business(h.s).reserved, 0);
        assert.equal(h.authority.business(h.s).spent, 0);
        assert.equal(h.authority.action(p).status, 'failed');
        assert.equal(h.authority.reserve(p).execute, false);
        assert.equal(h.authority.action(p).attempts, 1);
    }
    finally {
        h.close();
    }
});
test('business budget cannot be reset by a later run and denial remains inspectable', async () => {
    const h = harness('viable', { cap: 25 });
    try {
        const first = await waitForApproval(h);
        h.authority.approve(h.s, h.principals.owner, first.proposal);
        h.authority.reserve(first.proposal);
        const second = h.runtime.create(h.principals.worker, h.environment, { cap: { minorUnits: 1000000, currency: 'USD' } });
        const next = await h.runtime.advance(h.principals.worker, second.scope, h.environment, h.model, h.service);
        h.authority.approve(second.scope, h.principals.owner, next.proposal);
        assert.throws(() => h.authority.reserve(next.proposal), /BUDGET_EXCEEDED/);
        const b = h.authority.business(h.s);
        assert.equal(b.cap.minorUnits, 25);
        assert.equal(b.reserved + b.spent, 25);
        assert.ok(h.store.events(h.principals.owner, second.scope).some(e => e.kind === 'action_denied' && e.code === 'BUDGET_EXCEEDED'));
    }
    finally {
        h.close();
    }
});
test('cancellation reconciles an unknown effect without erasing the obligation or authorizing a new write', async () => {
    const h = harness('viable', { fault: 'timeout_after_effect' });
    try {
        const run = await waitForApproval(h);
        h.authority.approve(h.s, h.principals.owner, run.proposal);
        await h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, h.service);
        h.runtime.cancel(h.principals.worker, h.s);
        assert.equal(h.authority.business(h.s).reserved, 25);
        const r = await h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, h.service);
        assert.equal(r.phase, 'cancelled_with_effect');
        assert.equal(h.authority.business(h.s).reserved, 0);
        assert.equal(h.authority.business(h.s).spent, 25);
        assert.equal(h.service.reconcile(run.proposal).effectCount, 1);
    }
    finally {
        h.close();
    }
});
test('unresolved service stays uncertain across resumes and wrong-cost receipts cannot release exposure', async () => {
    const h = harness();
    try {
        const run = await waitForApproval(h), p = run.proposal;
        h.authority.approve(h.s, h.principals.owner, p);
        h.authority.reserve(p);
        const unknown = { identity: h.service.identity.bind(h.service), execute() { throw Error('must not execute'); }, reconcile() { return { status: 'unknown' } as any; } };
        for (let i = 0; i < 2; i++)
            assert.equal((await h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, unknown)).phase, 'reconciling');
        assert.throws(() => h.authority.settle(p, { status: 'confirmed', payloadHash: p.payloadHash, externalReceiptId: 'r', actualCost: { status: 'known', money: { minorUnits: 26, currency: 'USD' }, basis: 'unexpected cost' } }), /COST_EXCEEDS_RESERVATION/);
        assert.equal(h.authority.business(h.s).reserved, 25);
        assert.equal(h.authority.business(h.s).spent, 0);
        assert.equal(h.authority.action(p).status, 'unknown');
    }
    finally {
        h.close();
    }
});
test('idempotency keys reject changed requests at domain and fixture service boundaries', async () => {
    const h = harness();
    try {
        const run = await waitForApproval(h), p = run.proposal;
        h.authority.approve(h.s, h.principals.owner, p);
        h.authority.reserve(p);
        h.service.execute(p);
        const changed = structuredClone(p);
        changed.payload.artifact.title = 'different';
        changed.payloadHash = hash(changed.payload);
        assert.throws(() => h.authority.reserve(changed), /IDEMPOTENCY_CONFLICT/);
        assert.throws(() => h.service.execute(changed), /EXTERNAL_IDEMPOTENCY_CONFLICT/);
        assert.equal(h.service.reconcile(p).effectCount, 1);
    }
    finally {
        h.close();
    }
});
test('pinned role, recorded plan and exact pending proposal cannot be substituted before approval', async () => {
    const h = harness();
    try {
        const r = await waitForApproval(h);
        for (const field of ['roleVersion', 'toolId', 'taskId']) {
            const changed = structuredClone(r.proposal);
            changed[field] = 'substituted';
            assert.throws(() => h.authority.approve(h.s, h.principals.owner, changed), /RUN_PROPOSAL_MISMATCH/);
        }
        assert.equal(h.authority.business(h.s).reserved, 0);
    }
    finally {
        h.close();
    }
});
test('forged negative reconciliation cannot release funds; authenticated absence fences late dispatch', async () => {
    const h = harness();
    try {
        const r = await waitForApproval(h), p = r.proposal;
        h.authority.approve(h.s, h.principals.owner, p);
        h.authority.reserve(p);
        const forged = { status: 'absent', effectCount: 0, actualCost: { status: 'known', money: { minorUnits: 0, currency: 'USD' }, basis: 'untrusted negative' } } as any;
        h.authority.settle(p, forged, h.service.verifyObservation.bind(h.service));
        assert.equal(h.authority.action(p).status, 'unknown');
        assert.equal(h.authority.business(h.s).reserved, 25);
        const proof = h.service.reconcile(p);
        assert.equal(h.service.verifyObservation(p, proof), true);
        h.authority.settle(p, proof, h.service.verifyObservation.bind(h.service));
        assert.equal(h.authority.business(h.s).reserved, 0);
        assert.equal(h.service.execute(p).status, 'absent');
        assert.equal(h.service.reconcile(p).effectCount, 0);
    }
    finally {
        h.close();
    }
});
test('verified readback must retain the original receipt identity even with a valid service signature', async () => {
    const h = harness();
    try {
        const r = await waitForApproval(h);
        h.authority.approve(h.s, h.principals.owner, r.proposal);
        const swapped = { identity: h.service.identity.bind(h.service), execute: h.service.execute.bind(h.service), verifyObservation: h.service.verifyObservation.bind(h.service), reconcile(p) { const original = h.service.reconcile(p); return h.service.attest(p, { ...original, externalReceiptId: 'different-receipt' }); } };
        await assert.rejects(h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, swapped), /VERIFICATION_RECEIPT_REQUIRED/);
        assert.notEqual(h.runtime.inspect(h.principals.owner, h.s).phase, 'completed');
    }
    finally {
        h.close();
    }
});
test('task deadline and human review cap are enforced without acquiring action authority', async () => {
    const h = harness();
    try {
        const r = await waitForApproval(h);
        assert.throws(() => h.authority.approve(h.s, h.principals.owner, r.proposal, { reviewMinutes: 11 }), /HUMAN_REVIEW_LIMIT/);
        const deadline = Date.parse(r.plan.tasks[0].deadline);
        h.authority.approve(h.s, h.principals.owner, r.proposal, { expiresAt: new Date(deadline + 3600000).toISOString() });
        assert.throws(() => h.authority.reserve(r.proposal, deadline + 1), /TASK_DEADLINE_EXPIRED/);
        assert.equal(h.authority.business(h.s).reserved, 0);
    }
    finally {
        h.close();
    }
});
test('recovery rejects a fresh service database even when the service credential is reused', async () => {
    const h = harness('viable', { fault: 'timeout_after_effect' });
    let replacement: FixtureService | undefined;
    try {
        const r = await waitForApproval(h);
        h.authority.approve(h.s, h.principals.owner, r.proposal);
        const uncertain = await h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, h.service);
        assert.equal(uncertain.phase, 'reconciling');
        const key = String(h.service.db.prepare('SELECT key FROM service_identity WHERE id=1').get()!.key);
        replacement = new FixtureService(join(h.root, 'replacement.sqlite'), 'none', key);
        assert.notEqual(replacement.identity(), h.service.identity());
        await assert.rejects(h.runtime.advance(h.principals.worker, h.s, h.environment, h.model, replacement), /SERVICE_IDENTITY_MISMATCH/);
        assert.equal(h.authority.business(h.s).reserved, 25);
        assert.equal(h.authority.action(r.proposal).status, 'unknown');
        assert.equal(h.service.reconcile(r.proposal).effectCount, 1);
        assert.equal(replacement.db.prepare('SELECT count(*) n FROM effects').get()!.n, 0);
    }
    finally {
        replacement?.close();
        h.close();
    }
});
