import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, runWorkflow, approvalView, approve, open, status } from '../src/workflow/runner.ts';
import { read, write, configFor, accountScope } from '../src/workflow/config.ts';
import { captureParent, claimRecovery, recoveryRunId } from '../src/workflow/recovery.ts';
import { valueReport } from '../src/workflow/value-report.ts';
import { ModelLedger } from '../src/experiment/ledger.ts';
import { rawHash } from '../src/contracts.ts';

async function setup() {
    const base = mkdtempSync(join(tmpdir(), 'workflow-recovery-')), parent = join(base, 'parent'), root = join(base, 'recovery');
    prepare(parent, 'mock', 'value'); await assert.rejects(runWorkflow(parent, 'W-001-single', { fault: 'malformed' }));
    prepare(root, 'mock', 'recovery', parent); return { parent, root };
}

test('linked recovery retains historical attempt/exposure once and completes through exact MOCK approval', async () => {
    const { parent, root } = await setup(), prior = captureParent(parent, 'mock');
    const c = configFor(root); assert.equal(c.link.priorAttempts, 1); assert.equal(c.link.priorCounts, 1); assert.equal(c.link.exposureMinor, 556);
    assert.equal(c.limits.overheadReserve, undefined); assert.equal(c.limits.carryIn.length, 1); assert.equal(c.limits.stages.smoke.minor, 208);
    await assert.rejects(runWorkflow(root, 'W-006-single'), /UNDECLARED_WORKFLOW/);
    await assert.rejects(runWorkflow(root, 'W-001-team'), /UNDECLARED_WORKFLOW/);
    const waiting = await runWorkflow(root, recoveryRunId); assert.equal(waiting.checkpoint, 'waiting_approval'); assert.equal(waiting.callsUsed, 3);
    const view = approvalView(root, recoveryRunId); approve(root, recoveryRunId, view.proposalHash, 'fixture-demo');
    const done = await runWorkflow(root, recoveryRunId); assert.equal(done.checkpoint, 'completed'); assert.equal(done.aggregateRemainingMinor, 2236);
    await runWorkflow(root, recoveryRunId); assert.equal(status(root, recoveryRunId).callsUsed, 4);
    assert.deepEqual(captureParent(parent, 'mock'), prior);
    const r: any = valueReport(root); assert.equal(r.workflows.length, 1); assert.equal(r.workflows[0].execution.deterministicAccepted, true); assert.equal(r.workflows[0].approvalProvenance.measuredHumanApprovalSeconds, null);
    const raw = read(root, 'reports/comparison.json'); assert.deepEqual(raw.paired, []); assert.equal(raw.accounting.combinedExposureMinor, 764);
});

test('four admissions are a hard cap, not an authorization to replace a failed request', async () => {
    const { root } = await setup(); await assert.rejects(runWorkflow(root, recoveryRunId, { fault: 'malformed' }));
    await assert.rejects(runWorkflow(root, recoveryRunId), /MODEL_COMPLETION_UNCERTAIN|MODEL_RESULT_UNCERTAIN/);
    const s = status(root, recoveryRunId); assert.equal(s.callsUsed, 1); assert.equal(s.aggregateRemainingMinor, 2392); assert.equal(s.retainedMinor, 52);
});

test('linked grant scope and parent bytes cannot drift and a second amendment cannot stack', async () => {
    const { parent, root } = await setup(), config = configFor(root);
    claimRecovery(config); const bytes = readFileSync(join(parent, 'authorization.request.json'), 'utf8');
    const other = join(root, '..', 'other'); prepare(other, 'mock', 'recovery', parent);
    assert.throws(() => claimRecovery(configFor(other)), /RECOVERY_AMENDMENT_ALREADY_BOUND/);
    assert.equal(readFileSync(join(parent, 'authorization.request.json'), 'utf8'), bytes);
    const { store } = open(parent); try { const rows=store.db.prepare("SELECT key,body FROM entities WHERE kind='model-attempt'").all(); const row=JSON.parse(String(rows[0].body)); row.reservation=53; store.db.prepare("UPDATE entities SET body=? WHERE key=?").run(JSON.stringify(row),rows[0].key); } finally {store.close();}
    assert.throws(() => configFor(root), /RECOVERY_PARENT_EVIDENCE_CHANGED|RECOVERY_PARENT_EXPOSURE_MISMATCH/);
});

test('atomic recovery ledger caps fifth admission and keeps the shared buffer solely in linked exposure', async () => {
    const { root } = await setup(), { config, store } = open(root);
    try {
        const ledger = new ModelLedger(store, accountScope, 'offline-cap-test', config.limits);
        for(let i=0;i<4;i++) { const request: any={scope:accountScope,requestId:'cap-'+i}; const port=ledger.port('smoke',{workflow:recoveryRunId,configuration:'single'}); await port.prepare!(request,{minorUnits:52,currency:'USD'},rawHash('{}'),'{}'); ledger.finish(request.requestId,null,'MOCK_FAILED_ADMISSION'); }
        const extra: any={scope:accountScope,requestId:'cap-4'};
        await assert.rejects(ledger.port('smoke',{workflow:recoveryRunId,configuration:'single'}).prepare!(extra,{minorUnits:52,currency:'USD'},rawHash('{}'),'{}'), /ALLOCATION_ATTEMPT_CAP|COUNT_REQUEST_CAP|ATTEMPT_CAP/);
        assert.equal(ledger.carryExposure(),556); assert.equal(ledger.totals().reserved,208);
    } finally { store.close(); }
});


test('a fresh recovery refuses changed parent exposure, count-only failure and unrelated error', async () => {
    for (const patch of [{reservation:51}, {inferenceDispatchIntent:false}, {errorCode:'MODEL_HTTP_ERROR'}]) {
        const {parent}=await setup(); const {store}=open(parent);
        try { const row:any=store.db.prepare("SELECT key,body FROM entities WHERE kind='model-attempt'").get(); const body={...JSON.parse(String(row.body)),...patch}; store.db.prepare("UPDATE entities SET body=? WHERE key=?").run(JSON.stringify(body),row.key); } finally {store.close();}
        assert.throws(()=>captureParent(parent,'mock'), /RECOVERY_PARENT_EXPOSURE_MISMATCH|RECOVERY_PARENT_CAUSE_MISMATCH/);
    }
});
