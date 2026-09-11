import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { prepare, approvalView, approve, status } from '../src/workflow/runner.ts';

const cli = fileURLToPath(new URL('../src/workflow/cli.ts', import.meta.url));
function fresh() { const root = mkdtempSync(join(tmpdir(), 'foundry-workflow-process-')); prepare(root, 'mock'); return root; }
function child(root: string, runId: string, crash?: string, fault?: string) {
    const args = [cli, 'run', '--root', root, '--run', runId];
    if (crash) args.push('--crash', crash);
    if (fault) args.push('--fault', fault);
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(result.error, undefined, String(result.error));
    return result;
}
function read(root: string, kind: string) {
    const db = new DatabaseSync(join(root, 'workflow.sqlite'), { readOnly: true });
    try { return db.prepare('SELECT body FROM entities WHERE kind=?').all(kind).map(x => JSON.parse(String(x.body))); }
    finally { db.close(); }
}
function effects(root: string, runId: string) {
    const db = new DatabaseSync(join(root, 'services', runId + '.sqlite'), { readOnly: true });
    try { return db.prepare('SELECT result FROM effects').all().map(x => JSON.parse(String(x.result))); }
    finally { db.close(); }
}
function succeed(result: ReturnType<typeof child>) { assert.equal(result.status, 0, result.stderr || result.stdout); }
function fixtureApprove(root: string, runId: string) {
    const view = approvalView(root, runId);
    return approve(root, runId, view.proposalHash, 'fixture-demo');
}

for (const point of ['after-admission', 'after-inference-intent', 'after-model-response']) {
    test('hard process exit ' + point + ' retains admission and refuses duplicate provider work', () => {
        const root = fresh(), runId = 'W-001-single';
        const result = child(root, runId, point);
        assert.equal(result.status, 86, result.stderr);
        const before = read(root, 'model-attempt');
        assert.equal(before.length, 1);
        assert.equal(before[0].reservation, 52);
        assert.equal(before[0].finishedAt, undefined);
        assert.equal(before[0].inferenceDispatchIntent, point !== 'after-admission');
        assert.equal(!!before[0].countDispatchIntent, point !== 'after-admission');
        assert.equal(read(root, 'model')[0].status, 'pending');
        assert.equal(effects(root, runId).length, 0);
        const resumed = child(root, runId);
        assert.equal(resumed.status, 1);
        assert.match(resumed.stderr, /MODEL_RESULT_UNCERTAIN/);
        assert.deepEqual(read(root, 'model-attempt'), before, 'resume must not count, infer, settle or overwrite the prior attempt');
        assert.equal(effects(root, runId).length, 0);
        const report: any = status(root, runId);
        assert.equal(report.state, 'blocked');
        assert.equal(report.retainedMinor, 52);
        assert.equal(report.callsUsed, 1);
    });
}

for (const point of ['after-ledger-result', 'persisted-decide']) {
    test('hard process exit ' + point + ' recovers committed response and preserves unique stage admissions', () => {
        const root = fresh(), runId = 'W-001-single';
        assert.equal(child(root, runId, point).status, 86);
        const before = read(root, 'model-attempt');
        const committed = before.find(x => x.id.endsWith(point === 'after-ledger-result' ? '-investigate' : '-decide'));
        assert.ok(committed.result);
        assert.ok(committed.finishedAt);
        succeed(child(root, runId));
        const after = read(root, 'model-attempt');
        assert.equal(after.length, 3);
        assert.deepEqual(after.find(x => x.id === committed.id), committed);
        assert.equal(new Set(after.map(x => x.id)).size, 3);
        assert.equal(after.filter(x => x.countDispatchIntent).length, 3);
        assert.equal(after.filter(x => x.inferenceDispatchIntent).length, 3);
        assert.equal((status(root, runId) as any).checkpoint, 'waiting_approval');
        assert.equal(effects(root, runId).length, 0);
        fixtureApprove(root, runId);
        succeed(child(root, runId));
        assert.equal(read(root, 'model-attempt').length, 4);
        assert.equal((status(root, runId) as any).checkpoint, 'completed');
        assert.equal(effects(root, runId).length, 1);
        assert.equal(effects(root, runId)[0].effectCount, 1);
    });
}

test('hard approval-wait exit preserves exact unapproved artifact and resumes without calls or effects', () => {
    const root = fresh(), runId = 'W-001-single';
    assert.equal(child(root, runId, 'waiting_approval').status, 86);
    const before = read(root, 'model-attempt');
    const view = approvalView(root, runId);
    succeed(child(root, runId));
    assert.deepEqual(read(root, 'model-attempt'), before);
    assert.equal(approvalView(root, runId).proposalHash, view.proposalHash);
    assert.equal(read(root, 'grant').length, 0);
    assert.equal(effects(root, runId).length, 0);
    fixtureApprove(root, runId);
    succeed(child(root, runId));
    assert.equal((status(root, runId) as any).checkpoint, 'completed');
    const provenance = read(root, 'run')[0];
    assert.equal(provenance.outcome.operationalResult, 'pass');
});

test('hard dispatch-intent exit reconciles absence and seals the key without a blind effect retry', () => {
    const root = fresh(), runId = 'W-001-single';
    succeed(child(root, runId)); fixtureApprove(root, runId);
    assert.equal(child(root, runId, 'after-dispatch-intent').status, 86);
    const before = read(root, 'model-attempt');
    assert.equal(read(root, 'action')[0].status, 'unknown');
    assert.equal(effects(root, runId).length, 0);
    succeed(child(root, runId));
    assert.equal(read(root, 'action')[0].status, 'failed');
    assert.equal((status(root, runId) as any).checkpoint, 'failed');
    assert.deepEqual(read(root, 'model-attempt'), before);
    const observed = effects(root, runId);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].status, 'absent');
    assert.equal(observed[0].effectCount, 0);
    succeed(child(root, runId));
    assert.deepEqual(effects(root, runId), observed);
});

for (const point of ['after-effect', 'reconciling']) {
    test('hard exit ' + point + ' recovers one committed fixture effect and inspects it once', () => {
        const root = fresh(), runId = 'W-001-single';
        succeed(child(root, runId)); fixtureApprove(root, runId);
        assert.equal(child(root, runId, point, point === 'reconciling' ? 'timeout_after_effect' : undefined).status, 86);
        assert.equal(read(root, 'action')[0].status, 'unknown');
        const committed = effects(root, runId);
        assert.equal(committed.length, 1);
        assert.equal(committed[0].effectCount, 1);
        assert.equal(read(root, 'model-attempt').length, 3);
        succeed(child(root, runId));
        assert.equal((status(root, runId) as any).checkpoint, 'completed');
        assert.equal(read(root, 'action')[0].status, 'confirmed');
        assert.equal(read(root, 'action')[0].attempts, 1);
        assert.deepEqual(effects(root, runId), committed);
        assert.equal(read(root, 'model-attempt').length, 4);
        const complete = read(root, 'model-attempt');
        succeed(child(root, runId));
        assert.deepEqual(read(root, 'model-attempt'), complete);
        assert.deepEqual(effects(root, runId), committed);
        assert.equal((status(root, runId) as any).humanCorrectionSeconds, null);
    });
}
