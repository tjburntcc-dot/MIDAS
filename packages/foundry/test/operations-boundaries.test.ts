import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { OperatingManager, owner } from '../src/operations/manager.ts';
import { sourceDigest } from '../src/operations/contracts.ts';

function harness() {
    const dir = mkdtempSync(join(tmpdir(), 'midas-operations-boundary-'));
    const store = new StateStore(join(dir, 'state.sqlite'));
    let dispatched = 0;
    const communication: any = {
        queue: () => [], invalidate: () => {}, approve: () => {}, poll: () => {}, followup: () => 'follow-up',
        dispatch: () => { dispatched++; },
        status: () => ({ outbox: [], approvals: [], observations: [], pendingUnknown: 0 }),
    };
    const manager = new OperatingManager({ store, communication, researchPorts: () => ({ dnsLookup: async () => [], fetch: async () => { throw Error('not used'); } }) });
    const business = manager.create({ id: 'boundary-1', name: 'Boundary test', goal: 'Preserve owner authorization boundaries.', mode: 'offline', allowedUrls: [] });
    return { dir, store, manager, business, dispatched: () => dispatched };
}

test('a blocked operation cannot admit a new run without durable recovery state', async () => {
    const h = harness();
    try {
        const b: any = h.manager.get(h.business.id);
        b.status = 'blocked'; b.activeRequest = null; b.pendingResearch = null;
        h.manager.save(b, 'test.blocked');
        await assert.rejects(h.manager.run(owner(b.id), b.id), /WORK_NOT_RUNNABLE/);
    } finally { h.store.close(); rmSync(h.dir, { recursive: true, force: true }); }
});

test('dispatch requires the exact manager-persisted approved batch before adapter access', async () => {
    const h = harness();
    try {
        const b: any = h.manager.get(h.business.id);
        b.phase = 'approval'; b.status = 'waiting'; b.sourceSnapshot = sourceDigest(b.sources); b.approvedBatch = null;
        h.manager.save(b, 'test.approval-state');
        await assert.rejects(h.manager.dispatch(owner(b.id), b.id, 'batch-not-approved'), /APPROVAL_REQUIRED/);
        assert.equal(h.dispatched(), 0);
    } finally { h.store.close(); rmSync(h.dir, { recursive: true, force: true }); }
});
