import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, renameSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { hash, scopeKey } from '../src/contracts.ts';
import { keypair, signed } from '../src/experiment/config.ts';
import { PilotKnowledge } from '../src/pilot/knowledge.ts';
import { preparePilotDiagnosisAuthorization, signPilotDiagnosisProposal, loadAuthorizedPilotDiagnosis, readPilotDiagnosisAccounting } from '../src/pilot/diagnosis-authorized.ts';

function setup() {
    const root = mkdtempSync(join(tmpdir(), 'midas-pilot-diagnosis-'));
    let store = new StateStore(join(root, 'pilot.sqlite')), knowledge = new PilotKnowledge(store);
    const company = knowledge.createDemo(), prepared = preparePilotDiagnosisAuthorization(knowledge, { root, directory: join(root, 'proposal'), id: 'pilot-diagnosis-032-test', businessId: company.id,
        projectId: 'proj_OFFLINE_TEST', credentialFile: join(root, 'deliberately-absent-api-key'), expiresAt: new Date(Date.now() + 3600000).toISOString(), countUncertaintyMinor: 25, mode: 'mock' });
    const source = knowledge.selectedSources(company.id)[0];
    const output: any = { kind: 'business-understanding-proposal', completeness: 'partial', claims: [{ id: 'owner-goal', kind: 'observation', dimension: 'goals', statement: 'The owner reports this goal; causal benefit is unknown.', references: [{ sourceId: source.id, quote: source.text }] }], contradictions: [], unknowns: [{ question: 'Which work most reduces owner effort?', consequence: 'No useful ranking can be established from the owner statement alone.', claimIds: ['owner-goal'] }], evidenceRequests: [{ id: 'ask-owner', tool: 'owner.evidence_request', query: 'Supply one permitted workflow observation.', decisionUse: 'Connect work to an observed need.', claimIds: ['owner-goal'] }], hypotheses: [], selectedHypothesisId: null, selectionReason: 'Insufficient evidence to choose a causal bottleneck.', tasks: [] };
    const keys = keypair(), signedResult = signPilotDiagnosisProposal(root, { proposal: prepared.proposal, expectedHash: prepared.proposalHash, approvalReference: 'Ephemeral offline test only; no provider authorization', principal: 'ephemeral-fixture-owner', ...keys, knowledge });
    let counts = 0, creates = 0, reads = 0, lostCreate = false, forbiddenRead = false;
    const transport = (async (url: any, init: any) => {
        const u = String(url);
        if (u === 'https://api.openai.com/v1/responses/input_tokens') { counts++; return Response.json({ object: 'response.input_tokens', input_tokens: 100 }); }
        if (u === 'https://api.openai.com/v1/responses' && init.method === 'POST') {
            creates++; const body = JSON.parse(init.body); assert.equal(body.reasoning.effort, 'max'); assert.equal(body.max_output_tokens, 32768); assert.equal(body.background, true); assert.equal(body.store, true);
            assert.equal(hash(body), hash(prepared.body)); assert(!body.input.includes('credentialFile')); assert(!body.input.includes('approvalReference'));
            if (lostCreate) throw Error('Injected lost create; no retry authorized');
            return Response.json({ id: 'resp_pilot_diagnosis_test', model: 'gpt-6-astra', status: 'queued', background: true, store: true, output: [], usage: null });
        }
        assert.equal(u, 'https://api.openai.com/v1/responses/resp_pilot_diagnosis_test'); assert.equal(init.method, 'GET'); reads++;
        if (forbiddenRead) return Response.json({ error: { type: 'permission_error', code: 'permission_denied', message: 'Offline injected retrieval permission error' } }, { status: 403 });
        return Response.json({ id: 'resp_pilot_diagnosis_test', model: 'gpt-6-astra', status: 'completed', service_tier: 'default', background: true, store: true, usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
    }) as typeof fetch;
    return { root, company, prepared, keys, output, signedResult, get store() { return store; }, get knowledge() { return knowledge; }, stats: () => ({ counts, creates, reads }),
        load: (envelope = signedResult.envelope) => loadAuthorizedPilotDiagnosis(knowledge, root, { envelope, trustedPublicKey: keys.publicKey, execution: { kind: 'mock', transport } }),
        loseCreate() { lostCreate = true; }, blockRead(value: boolean) { forbiddenRead = value; }, restart() { store.close(); store = new StateStore(join(root, 'pilot.sqlite')); knowledge = new PilotKnowledge(store); },
        close() { store.close(); const p = realpathSync(root), r = relative(realpathSync(tmpdir()), p); assert(r && !r.startsWith('..') && !isAbsolute(r)); rmSync(p, { recursive: true, force: true }); } };
}

test('exact signed diagnosis records source-linked partial understanding and idempotent accounting with an explicit mock transport', async () => {
    const f = setup(); try {
        assert.equal(f.prepared.proposalHash, hash(f.prepared.proposal)); assert.equal(f.prepared.summary.maximumExposureMinor, 230); assert.equal(f.signedResult.credentialRead, false);
        const result = await f.load().run(); assert.equal(result.understanding.acceptedByOwner, false); assert.match(result.understanding.provenance, /offline mock/); assert.equal(result.understanding.selectedHypothesisId, null);
        assert.deepEqual(f.stats(), { counts: 1, creates: 1, reads: 1 }); const report = readPilotDiagnosisAccounting(f.store, f.root);
        assert.equal(report.callsUsed, 1); assert.equal(report.providerRequests, 0); assert.equal(report.countRequests, 0); assert.equal(report.countDispatches, 1); assert.equal(report.retainedMinor, 230); assert.equal(report.settledMinor, null); assert.equal(report.provisionalMinor, 1);
        f.restart(); await f.load().run(); assert.deepEqual(f.stats(), { counts: 1, creates: 1, reads: 1 }); assert.equal(f.knowledge.snapshot(f.company.id).understanding.outputHash, hash(f.output));
    } finally { f.close(); }
});

test('changed exact bytes/schema/code/company and old grant reject before credential or count access', async () => {
    const f = setup(); try {
        for (const field of ['bodyHash', 'schemaHash', 'implementationHash'] as const) { const grant = structuredClone(f.signedResult.envelope.payload); grant.pilotDiagnosis[field] = '0'.repeat(64); assert.throws(() => f.load(signed(grant, f.keys.privateKey))); }
        const old = structuredClone(f.signedResult.envelope.payload); delete (old as any).pilotDiagnosis; assert.throws(() => f.load(signed(old, f.keys.privateKey)), /PILOT_DIAGNOSIS_SIGNED_BINDING_REQUIRED/);
        f.knowledge.selectEvidence(f.company.id, [f.knowledge.selectedSources(f.company.id)[0].id]); assert.throws(() => f.load(), /PILOT_DIAGNOSIS_CONTEXT_CHANGED/);
        assert.deepEqual(f.stats(), { counts: 0, creates: 0, reads: 0 });
    } finally { f.close(); }
});

test('unknown creation retains reservation and no restart can replace inference or report a free attempt', async () => {
    const f = setup(); try {
        f.loseCreate(); await assert.rejects(() => f.load().run()); f.restart(); await assert.rejects(() => f.load().run(), /BACKGROUND_UNKNOWN_NO_RESUBMIT/);
        assert.deepEqual(f.stats(), { counts: 1, creates: 1, reads: 0 }); const report = readPilotDiagnosisAccounting(f.store, f.root); assert.equal(report.retainedMinor, 230); assert.equal(report.provisionalMinor, null); assert.equal(report.unknownCostAttempts, 1);
        const file = join(f.root, 'pilot.diagnosis.authorization.json'), moved = file + '.preserved'; renameSync(file, moved);
        const unavailable = readPilotDiagnosisAccounting(f.store, f.root); assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.retainedMinor, null); renameSync(moved, file);
    } finally { f.close(); }
});

test('a persisted response identity resumes the same GET after restart without a second count or inference', async () => {
    const f = setup(); try {
        f.blockRead(true); await assert.rejects(() => f.load().run(), /BACKGROUND_RETRIEVAL_HTTP_ERROR/); assert.deepEqual(f.stats(), { counts: 1, creates: 1, reads: 1 });
        const scope = f.signedResult.envelope.payload.accountScope, attemptId = f.prepared.proposal.pilotDiagnosis.attemptId, key = scopeKey(scope) + '/' + attemptId;
        assert.equal(f.store.get('response-job', key).responseId, 'resp_pilot_diagnosis_test'); f.restart(); f.blockRead(false); await f.load().run();
        assert.deepEqual(f.stats(), { counts: 1, creates: 1, reads: 2 }); assert.equal(f.store.get('model-attempt', key).status, 'output_available'); assert.equal(readPilotDiagnosisAccounting(f.store, f.root).retainedMinor, 230);
    } finally { f.close(); }
});

test('response persisted before interruption is reused, while an invalid source claim stays preserved and unaccepted', async () => {
    const f = setup(); try {
        const runner = f.load(); runner.models.afterResponsePersisted = () => { throw Object.assign(Error('Injected process interruption after response persistence'), { simulatedCrash: true }); };
        await assert.rejects(() => runner.run()); f.restart(); await f.load().run(); assert.deepEqual(f.stats(), { counts: 1, creates: 1, reads: 1 });
    } finally { f.close(); }
    const invalid = setup(); try {
        invalid.output.claims[0].references[0].quote = 'Invented quote absent from worker sources'; await assert.rejects(() => invalid.load().run());
        const g = invalid.prepared.proposal, key = scopeKey(g.accountScope) + '/' + g.pilotDiagnosis.attemptId, job = invalid.store.get('response-job', key);
        assert.equal(job.terminal.status, 'completed'); assert.match(job.terminal.output[0].content[0].text, /Invented quote/); assert.equal(invalid.store.get('pilot-understanding', invalid.company.id), null);
        await assert.rejects(() => invalid.load().run()); assert.deepEqual(invalid.stats(), { counts: 1, creates: 1, reads: 1 }); assert.equal(readPilotDiagnosisAccounting(invalid.store, invalid.root).retainedMinor, 230);
    } finally { invalid.close(); }
});
