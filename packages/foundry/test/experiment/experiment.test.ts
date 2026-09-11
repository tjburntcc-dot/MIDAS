import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { sign } from 'node:crypto';
import { StateStore } from '../../src/state.ts';
import { canonical, hash, rawHash, scopeKey } from '../../src/contracts.ts';
import { ModelLedger } from '../../src/experiment/ledger.ts';
import { prepare, route, limits, keypair, signed, readJSON, writeJSON, approve, authorization, analysisSpec } from '../../src/experiment/config.ts';
import { providerPort } from '../../src/experiment/provider.ts';
import { requestFor, roleArtifact, runDevelopment, report, recordReview, candidate, freeze } from '../../src/experiment/workflow.ts';
import { developmentCases, offlineOutput, validateOutput } from '../../src/experiment/task.ts';
import { rehearse } from '../../src/experiment/rehearsal.ts';
import { analyze } from '../../src/experiment/analysis.ts';
import { assertBoundary, schedule } from '../../src/experiment/custodian.ts';
const temp = () => mkdtempSync(join(tmpdir(), 'midas028-'));
const scope = { tenantId: 'test_028', businessId: 'experiment', runId: 'run', dataPolicyVersion: 'v1', mode: 'fixture' } as const;
function setup(cap = 4100) { const root = temp(), store = new StateStore(join(root, 'db.sqlite')), ledger = new ModelLedger(store, scope, 'test-auth', { ...limits, totalMinor: cap }); const c = developmentCases()[0], role: any = { id: 'operator', version: '1', procedure: 'Use the authorized facts.', model: route.model }; const request = requestFor(scope, role, c, 0, 'development'); writeFileSync(join(root, 'credential'), 'MOCK_SECRET_NOT_REAL'); return { root, store, ledger, c, request }; }
const admission = async (t: any, id = t.request.requestId, bytes = '{"request":1}') => { const r = { ...t.request, requestId: id }, port = t.ledger.port('development', { source: 'offline-test' }); await port.prepare!(r, { minorUnits: 13, currency: 'USD' }, rawHash(bytes), bytes); return { r, port }; };
function invoice(t: any, id: string, minor = 1) { const row = t.ledger.get(id), keys = keypair(), statement = { kind: 'closed_attempt_invoice', projectId: 'proj_test', authorizationHash: 'test-auth', scope: scopeKey(scope), attemptId: id, requestHash: row.requestHash, providerRequestId: row.providerRequestId ?? null, actual: { minorUnits: minor, currency: 'USD' }, evidenceSha256: hash('offline invoice'), issuer: 'offline-test', closedAt: new Date().toISOString() }; return { keys, envelope: { statement, signature: sign(null, Buffer.from(canonical(statement)), keys.privateKey).toString('base64') } }; }
function approved() { const root = join(temp(), 'experiment'); prepare(root); const a = readJSON(join(root, 'authorization.request.json')); Object.assign(a, { approved: true, approvedBy: 'TEST ONLY', approvalReference: 'mock transport unit test', projectId: 'proj_test', credentialFile: join(root, 'mock.key'), expiresAt: '2099-01-01T00:00:00Z' }); writeFileSync(a.credentialFile, 'MOCK_SECRET_NOT_REAL'); writeJSON(join(root, 'test-approval.json'), a); approve(root, join(root, 'test-approval.json'), join(root, 'auth', 'owner.key')); return root; }
function response(t: any, changes: any = {}) { return { id: 'mock-response', model: route.model, status: 'completed', usage: { input_tokens: 400, output_tokens: 100 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(offlineOutput(t.c)) }] }], ...changes }; }
test('offline integrated rehearsal: no real transport, labels isolated, reconciliation and no improvement claim', async () => { const root = join(temp(), 'experiment'); prepare(root); const r = await rehearse(root); assert.equal(r.actualProviderCalls, 0); assert.equal(r.attempts, 24); assert.equal(r.simulatedLedger.reserved, 0); assert.equal(r.simulatedLedger.settled, 24); assert.equal(r.analysis.decision, 'inconclusive'); assert.equal(r.measuredRoleImprovement, null); assert.equal(report(root).gate, 1); await assert.rejects(runDevelopment(root, 'smoke', 'baseline', async () => { throw Error('MUST NOT CALL'); })); });
test('authorization is signed, expiry blocks new calls and explicit read mode preserves accounting', () => { const root = approved(); assert.equal(authorization(root).auth.projectId, 'proj_test'); const a = readJSON(join(root, 'authorization.json')); a.payload.expiresAt = '2000-01-01T00:00:00Z'; writeJSON(join(root, 'authorization.json'), signed(a.payload, readFileSync(join(root, 'auth', 'owner.key'), 'utf8'))); assert.throws(() => authorization(root), /AUTHORIZATION_EXPIRED/); assert.equal(authorization(root, true).auth.approved, true); a.payload.limits.totalMinor = 999999; writeJSON(join(root, 'authorization.json'), a); assert.throws(() => authorization(root, true), /SIGNATURE_INVALID/); });
test('admissions bind bytes, reject duplicate identities and atomically enforce aggregate cap', async () => { const t = setup(13); try {
    await admission(t);
    await assert.rejects(admission(t), /ATTEMPT_ALREADY_ADMITTED/);
    await assert.rejects(admission(t, t.request.requestId, 'different'), /ATTEMPT_BYTES_CONFLICT/);
    await assert.rejects(admission(t, 'other'), /AGGREGATE_BUDGET_EXCEEDED/);
    assert.equal(t.ledger.totals().reserved, 13);
    assert.throws(() => new ModelLedger(t.store, scope, 'other-auth', limits), /ACCOUNT_CONFIGURATION_CHANGED/);
}
finally {
    t.store.close();
} });
test('literal scope isolation resists SQL wildcard characters', async () => { const t = setup(); try {
    await admission(t);
    const other = new ModelLedger(t.store, { ...scope, tenantId: 'testX028' }, 'test-auth', limits);
    assert.equal(other.rows().length, 0);
    const p = other.port('development', {});
    await assert.rejects(p.prepare!(t.request, { minorUnits: 13, currency: 'USD' }, rawHash('x'), 'x'), /SCOPE_DENIED/);
}
finally {
    t.store.close();
} });
test('full serialized request goes to provider counter and inference; secrets and labels are absent from persisted request', async () => { const t = setup(); const seen: string[] = []; try {
    const transport: any = async (url: any, init: any) => { seen.push(init.body); assert.equal(init.headers['OpenAI-Project'], 'proj_test'); return new Response(JSON.stringify(String(url).endsWith('input_tokens') ? { object: 'response.input_tokens', input_tokens: 400 } : response(t))); };
    const p = providerPort(route, 'proj_test', join(t.root, 'credential'), t.ledger.port('development', {}), transport);
    const r = await p.run(t.request);
    assert.equal(seen.length, 2);
    const inferenceBody=JSON.parse(seen[1]);delete inferenceBody.max_output_tokens;delete inferenceBody.store;delete inferenceBody.service_tier;assert.deepEqual(JSON.parse(seen[0]),inferenceBody);
    const body = JSON.parse(seen[0]);
    assert.ok(body.text.format.schema);
    assert.equal(body.instructions, t.request.role.procedure);
    assert.equal(body.reasoning.effort, 'medium');
    assert.ok(!seen[0].includes('requiredEvidence'));
    const row = t.ledger.get(t.request.requestId);
    assert.equal(row.requestHash, rawHash(seen[1]));
    assert.ok(!JSON.stringify(row).includes('MOCK_SECRET'));
    assert.equal(row.reservation, 13);
    assert.equal(row.cost.status, 'provisional');
    validateOutput(r.output);
}
finally {
    t.store.close();
} });
for (const [name, change, code] of [['wrong model', { model: 'wrong' }, 'RETURNED_MODEL_MISMATCH'], ['missing usage', { usage: null }, 'MODEL_USAGE_MISSING'], ['overshoot', { usage: { input_tokens: 9000, output_tokens: 100 } }, 'MODEL_USAGE_EXCEEDS_ADMISSION'], ['incomplete', { status: 'incomplete' }, 'MODEL_RESPONSE_INCOMPLETE'], ['refusal', { output: [{ content: [{ type: 'refusal', refusal: 'no' }] }] }, 'MODEL_REFUSED'], ['invalid output', { output: [{ content: [{ type: 'output_text', text: '{}' }] }] }, 'INVALID']] as const) {
    test('failed attempt retains exposure: ' + name, async () => { const t = setup(); let calls = 0; try {
        const p = providerPort(route, 'proj_test', join(t.root, 'credential'), t.ledger.port('development', {}), async (url) => { calls++; return new Response(JSON.stringify(String(url).endsWith('input_tokens') ? { object: 'response.input_tokens', input_tokens: 400 } : response(t, change))); });
        await assert.rejects(p.run(t.request));
        const row = t.ledger.get(t.request.requestId);
        assert.equal(calls, 2);
        assert.equal(row.reservation, 13);
        assert.ok(row.observation);
        if (['incomplete', 'refusal', 'invalid output'].includes(name))
            assert.equal(row.cost.status, 'provisional');
        else
            assert.equal(row.status, 'uncertain');
    }
    finally {
        t.store.close();
    } });
}
for (const n of [8000, -1, null])
    test('token admission fails without inference for invalid/excessive count ' + n, async () => { const t = setup(); let calls = 0; try {
        const p = providerPort(route, 'proj_test', join(t.root, 'credential'), t.ledger.port('development', {}), async () => { calls++; return new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: n })); });
        await assert.rejects(p.run(t.request));
        assert.equal(calls, 1);
        assert.equal(t.ledger.get(t.request.requestId).inferenceDispatchIntent, false);
        assert.equal(t.ledger.totals().reserved, 13);
    }
    finally {
        t.store.close();
    } });
test('timeout does not retry, refund or expose credential errors', async () => { const t = setup(); let calls = 0; try {
    const p = providerPort({ ...route, deadlineMs: 5 }, 'proj_test', join(t.root, 'credential'), t.ledger.port('development', {}), async (url, init) => { calls++; if (String(url).endsWith('input_tokens'))
        return new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: 400 })); await new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('MOCK_SECRET must be sanitized')), 30); init!.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(Error('MOCK_SECRET')); }); }); return new Response(); });
    await assert.rejects(p.run(t.request), e => !String(e).includes('MOCK_SECRET'));
    assert.equal(calls, 2);
    assert.equal(t.ledger.totals().reserved, 13);
}
finally {
    t.store.close();
} });
test('signed reconciliation is idempotent, zero cost releases, excess invoice records liability and halts', async () => { const t = setup(); try {
    await admission(t);
    const a = invoice(t, t.request.requestId, 0);
    assert.throws(() => t.ledger.reconcile({ ...a.envelope, signature: 'bad' }, a.keys.publicKey, 'proj_test'), /BILLING_SIGNATURE_INVALID/);
    t.ledger.reconcile(a.envelope, a.keys.publicKey, 'proj_test');
    t.ledger.reconcile(a.envelope, a.keys.publicKey, 'proj_test');
    assert.equal(t.ledger.totals().reserved, 0);
    await admission(t, 'second');
    const b = invoice(t, 'second', 20);
    t.ledger.reconcile(b.envelope, b.keys.publicKey, 'proj_test');
    assert.equal(t.ledger.totals().settled, 20);
    await assert.rejects(admission(t, 'third'), /ACCOUNT_HALTED/);
}
finally {
    t.store.close();
} });
test('same-host signed custodian assertion is rejected and schedule is paired/reproducible', () => { const keys = keypair(), spec = { custodian: 'test', custodianPublicKey: keys.publicKey, developerHost: hostname() }, b = { kind: 'custodian-boundary', custodian: 'test', developerHost: hostname(), host: hostname(), account: 'test', noDeveloperAccess: true, auditor: 'test', auditedAt: new Date().toISOString() }; assert.throws(() => assertBoundary(spec, signed(b, keys.privateKey)), /SEPARATE_CUSTODIAN_HOST_REQUIRED/); const cases = developmentCases(); const a = schedule(cases, 2, 28); assert.deepEqual(a, schedule(cases, 2, 28)); assert.equal(a.length, 72); for (let i = 0; i < a.length; i += 2) {
    assert.equal(a[i].c.id, a[i + 1].c.id);
    assert.notEqual(a[i].condition, a[i + 1].condition);
} });
function observations() { return Array.from({ length: 48 }, (_, c) => [0, 1].flatMap(repeat => (['baseline', 'challenger'] as const).map(condition => ({ id: `${c}-${repeat}-${condition}`, caseId: 'c' + c, cluster: 'k' + Math.floor(c / 2), family: 'f' + Math.floor(c / 8), repeat, condition, accepted: condition === 'challenger', critical: false, costMinor: 1, latencyMs: 100, correctionSeconds: condition === 'challenger' ? 0 : 10, failed: false })))).flat(); }
test('paired cluster analysis supports large measured improvement with correct independent count and risk bound', () => { const rows = observations(), a = analyze(rows, analysisSpec); assert.equal(a.decision, 'improvement_supported'); assert.equal(a.independentClusters, 24); assert.equal(a.caseCount, 48); assert.ok(a.criticalClusterUpper95! > .11); assert.deepEqual(a, analyze(rows, analysisSpec)); });
test('analysis cannot hide failures, critical errors, missing cost or unknown correction; duplicates rejected', () => { const rows = observations(); assert.equal(analyze(rows.slice(1), analysisSpec).decision, 'inconclusive'); const unknown = structuredClone(rows) as any; unknown[0].costMinor=null;assert.equal(analyze(unknown,analysisSpec).decision,'inconclusive');unknown[0].costMinor=1;unknown[1].costMinor = null; assert.equal(analyze(unknown, analysisSpec).decision, 'inconclusive'); unknown[1].costMinor = 1; unknown[1].correctionSeconds = null; assert.equal(analyze(unknown, analysisSpec).decision, 'inconclusive'); const bad = structuredClone(rows); bad[1].critical = true; bad[1].accepted = false; assert.equal(analyze(bad, analysisSpec).decision, 'improvement_unsupported'); assert.throws(() => analyze([...rows, rows[0]], analysisSpec), /DUPLICATE/); const invalid = structuredClone(rows); invalid[0].costMinor = -1; assert.throws(() => analyze(invalid, analysisSpec), /INVALID_MEASUREMENT/); });
test('candidate refuses invented failure IDs and freeze refuses absent independent boundary', () => { const root = approved(); writeFileSync(join(root, 'procedure.txt'), 'A different checklist'); assert.throws(() => candidate(root, join(root, 'procedure.txt'), ['invented'], 'This is only a fabricated failure claim.'), /OBSERVED_BASELINE_FAILURE_REQUIRED/); assert.throws(() => freeze(root, {}), /CUSTODIAN_REVIEWER_REQUIRED/); });
const helper = new URL('./process-helper.ts', import.meta.url);
function child(db: string, id: string, mode = 'admit') { const p = spawn(process.execPath, [helper.pathname.replace(/^\/([A-Za-z]:)/, '$1'), db, id, mode], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; p.stdout.on('data', d => out += d); return { p, done: new Promise<string>((resolve, reject) => { p.on('error', reject); p.on('exit', () => resolve(out.trim())); }) }; }
test('separate processes cannot overspend the same account', async () => { const t = setup(13); const db = join(t.root, 'db.sqlite'); t.store.close(); const a = child(db, 'a'), b = child(db, 'b'); const results = await Promise.all([a.done, b.done]); assert.equal(results.filter(r => r === 'admitted').length, 1); assert.equal(results.filter(r => r === 'AGGREGATE_BUDGET_EXCEEDED').length, 1); const store = new StateStore(db); try {
    assert.equal(new ModelLedger(store, scope, 'test-auth', { ...limits, totalMinor: 13 }).totals().reserved, 13);
}
finally {
    store.close();
} });
test('killed process preserves dispatch intent, exact bytes and exposure on restart', async () => { const t = setup(13); const db = join(t.root, 'db.sqlite'); t.store.close(); const c = child(db, 'killed', 'wait'); await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(Error('child checkpoint timeout')), 10000); c.p.stdout.on('data', d => { if (String(d).includes('dispatched')) {
    clearTimeout(timer);
    resolve();
} }); }); c.p.kill(); await c.done; const store = new StateStore(db); try {
    const ledger = new ModelLedger(store, scope, 'test-auth', { ...limits, totalMinor: 13 });
    assert.equal(ledger.get('killed').inferenceDispatchIntent, true);
    assert.equal(ledger.totals().reserved, 13);
    ledger.interrupt('killed');
    assert.equal(ledger.totals().reserved, 13);
    await assert.rejects(admission({ ledger, request: t.request }, 'killed', '{}'), /ATTEMPT_ALREADY_ADMITTED/);
}
finally {
    store.close();
} });
test('mocked development, signed human-review mechanics, procedure-only challenger, validation and freeze integrate', async () => {
    const root = approved(), reviewer = keypair(), custodian = keypair(), spec = readJSON(join(root, 'spec.json'));
    Object.assign(spec, { reviewer: 'OFFLINE TEST REVIEWER', reviewerPublicKey: reviewer.publicKey, custodian: 'OFFLINE TEST CUSTODIAN', custodianPublicKey: custodian.publicKey, modelRevision: { immutable: true, requestModel: route.model, officialEvidence: 'OFFLINE MOCK ATTESTATION ONLY' }, calibration: { complete: true, reviewer: 'OFFLINE TEST REVIEWER', rubricHash: hash('mock rubric') } });
    writeJSON(join(root, 'spec.json'), spec);
    const baseline = readJSON(join(root, 'baseline.json'));
    baseline.version='baseline-v2';baseline.development = { method: 'OFFLINE TEST ONLY', measuredHumanSeconds: 0 };
    writeJSON(join(root, 'baseline.json'), baseline);
    const cases = readJSON(join(root, 'cases.json')), bodies: any[] = [];
    const transport: any = async (url: any, init: any) => { const body = JSON.parse(init.body); if (String(url).endsWith('input_tokens'))
        return new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: 400 })); bodies.push(body); const input = JSON.parse(body.input).context.case, c = cases.find((c: any) => hash(c.input) === hash(input)); return new Response(JSON.stringify(response({ c }))); };
    await runDevelopment(root, 'development', 'baseline', transport);
    const { openExperiment } = await import('../../src/experiment/workflow.ts');
    let x = openExperiment(root);
    const dev = x.ledger.rows();
    x.store.close();
    function review(row: any, accepted: boolean) { const payload = { kind: 'human-review', reviewer: spec.reviewer, measurementSource: 'observed-stopwatch', attemptId: row.id, attemptHash: hash(row.result), accepted, critical: false, dimensions: { correctness: accepted, evidenceSupport: true, uncertainty: true, escalation: true, prohibitedPromises: true }, correctionStartedAt: '2026-09-10T12:00:00Z', correctionFinishedAt: '2026-09-10T12:00:01Z', reason: 'OFFLINE MOCK REVIEW; no human effort measured' }; return recordReview(root, signed(payload, reviewer.privateKey)); }
    review(dev[0], false);
    writeFileSync(join(root, 'procedure.txt'), baseline.procedure + '\nCheck invoice conflicts before drafting.');
    candidate(root, join(root, 'procedure.txt'), [dev[0].id], 'OFFLINE MOCK FAILURE motivates a checklist for this infrastructure test only.');
    await runDevelopment(root, 'validation', 'baseline', transport);
    await runDevelopment(root, 'validation', 'challenger', transport);
    x = openExperiment(root);
    const validation = x.ledger.rows().filter(r => r.stage === 'validation');
    x.store.close();
    for (const row of validation)
        review(row, true);
    const b = bodies[24], c = bodies[36];
    assert.notEqual(b.instructions, c.instructions);
    assert.deepEqual({ ...b, instructions: null }, { ...c, instructions: null });
    const manifest = { kind: 'protected-manifest', custodian: spec.custodian, developerHost: spec.developerHost, caseCount: 48, clusterCount: 24, boundaryHash: hash('mock'), populationHash: hash('mock'), rightsHash: hash('mock'), labelsHash: hash('mock'), splitHash: hash('mock'), reviewRubricHash: spec.calibration.rubricHash };
    assert.equal(freeze(root, signed(manifest, custodian.privateKey)).status, 'frozen');
    await assert.rejects(runDevelopment(root, 'development', 'baseline', transport), /EXPERIMENT_FROZEN/);
    const frozen = readJSON(join(root, 'freeze.json'));
    assert.equal(frozen.analysisVersion, 'paired-cluster-v1');
    assert.equal(frozen.baseline.procedure, baseline.procedure);assert.equal(frozen.challenger.predecessorVersion,'baseline-v2');
});

test('protected aggregate and analysis replay refuse the development host before reading final observations',async()=>{
 const root=approved(),keys=keypair(),spec=readJSON(join(root,'spec.json'));
 spec.custodian='OFFLINE TEST';spec.custodianPublicKey=keys.publicKey;writeJSON(join(root,'spec.json'),spec);
 const b=signed({kind:'custodian-boundary',custodian:spec.custodian,developerHost:hostname(),host:hostname(),account:'test',noDeveloperAccess:true,auditor:'test',auditedAt:new Date().toISOString()},keys.privateKey);
 const {releaseAggregate,replayAggregate}=await import('../../src/experiment/custodian.ts');
 assert.throws(()=>releaseAggregate(root,b,'absent.key'),/SEPARATE_CUSTODIAN_HOST_REQUIRED/);
 assert.throws(()=>replayAggregate(root,b),/SEPARATE_CUSTODIAN_HOST_REQUIRED/);
 const rows=observations();assert.deepEqual(analyze(rows,analysisSpec),analyze(JSON.parse(JSON.stringify(rows)),analysisSpec));
});
