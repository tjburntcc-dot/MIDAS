import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { DEVELOPER_VISIBLE_PROCEDURE_CASES, PROCEDURE_EXTRACTION_SCHEMA, PROCEDURE_WORK_OUTPUT_SCHEMA, ProcedureLab } from '../src/operations/learning.ts';
import type { MeteredInvocation, OperatingModelInvoker, ProcedureSource, ProcedureWorkerContext } from '../src/operations/learning.ts';

const scope = { tenantId: 'tenant', businessId: 'business', runId: 'procedure-run', dataPolicyVersion: 'policy', mode: 'fixture' as const };
const principal = { id: 'operator', tenantId: 'tenant', businessId: 'business', permissions: ['read', 'operate'] };
const source: ProcedureSource = { id: 'public-research-1', url: 'https://studio.example/about', observedAt: '2026-09-12T00:00:00.000Z', contentHash: 'a'.repeat(64), sourceAssertion: 'A public operations article recommends checking current inquiry routes and naming unknown demand. It lists editor@studio.example in its author biography.', rights: 'public_readonly', status: 'available' };
function harness(path?: string) { const root = path ? null : mkdtempSync(join(tmpdir(), 'procedure-lab-')), dbPath = path ?? join(root!, 'state.sqlite'), store = new StateStore(dbPath); return { root, dbPath, store, app: new ProcedureLab(store), close(remove = true) { store.close(); if (remove && root) rmSync(root, { recursive: true, force: true }); } }; }
function candidate(app: ProcedureLab, overlay: Record<string, unknown> | null = null) { return app.propose(principal, scope, source, { archetype: 'research_validation', evidenceQuote: 'checking current inquiry routes', specialization: 'Check source currency and contradictions, cite every material source, preserve unknown demand, and select the smallest policy-compliant next step.', privateOverlay: overlay }); }
function frozen(app: ProcedureLab) { const c = candidate(app); return app.freeze(principal, scope, c.id, DEVELOPER_VISIBLE_PROCEDURE_CASES, { model: 'offline-fixture' }, { reasoning: 'none' }, { maxCalls: 12, maxCostMinor: 0 }); }

function fixtureOutput(context: ProcedureWorkerContext) {
    const sourceIds = context.sources.map(s => s.id).sort();
    let action: 'prepare_contact' | 'no_contact' | 'request_evidence' = 'no_contact', recipientAddress: string | null = null;
    if (context.sources.some(s => /\b(?:withdrawn|do not use|no longer valid)\b/i.test(s.text))) action = 'request_evidence';
    else {
        const current = context.sources.filter(s => Date.parse(s.observedAt) <= Date.parse(context.currentAt) && (s.validUntil === null || Date.parse(s.validUntil) > Date.parse(context.currentAt)));
        if (current.length === 0) action = 'request_evidence';
        else {
            const addresses = [...new Set(current.flatMap(s => [...s.text.matchAll(/business inquiries?\s*:\s*([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi)].map(m => m[1].toLowerCase())))];
            if (addresses.length === 1) { action = 'prepare_contact'; recipientAddress = addresses[0]; }
            else if (addresses.length > 1) action = 'request_evidence';
        }
    }
    return { action, sourceIds, recipientAddress, observations: ['The result follows only the supplied source state and operational policy.'], unknowns: ['Demand, permission to send, conversion, and economics remain unknown.'], nextStep: action === 'prepare_contact' ? 'Prepare a draft for separate exact approval; do not send.' : 'Preserve the constraint and obtain only the smallest missing evidence.' };
}
function invoker(run: (request: MeteredInvocation) => any): OperatingModelInvoker { return { kind: 'operating-models', invoke: async request => run(request) }; }

test('shared provider access failure stops comparison and replay does not admit the remaining cells',async()=>{
    const h=harness();try{const f=frozen(h.app);let calls=0;const failing=invoker(()=>{calls++;throw Object.assign(Error('sanitized'),{code:'MODEL_HTTP_ERROR'});});const first=await h.app.compare(principal,scope,f.id,failing);assert.equal(calls,1);assert.equal(first.attempts.length,1);assert.equal(first.analysis.completedPairs,0);assert.equal(first.analysis.failures[0].errorCode,'MODEL_HTTP_ERROR');await h.app.compare(principal,scope,f.id,failing);assert.equal(calls,1);}finally{h.close();}
});

test('strict extraction schema creates an unqualified hypothesis and literal guards keep source email and private overlay values out of reusable procedure', () => {
    const h = harness(); try {
        assert.equal(PROCEDURE_EXTRACTION_SCHEMA.additionalProperties, false); assert.equal(PROCEDURE_WORK_OUTPUT_SCHEMA.additionalProperties, false);
        const c = candidate(h.app, { founderAccount: 'PRIVATE-ACCOUNT-771', note: 'local only' });
        assert.equal(c.epistemicStatus, 'hypothesis'); assert.equal(c.qualification, 'unqualified'); assert.ok(c.privateOverlayRef);
        assert.doesNotMatch(c.procedure, /editor@studio\.example|PRIVATE-ACCOUNT-771|local only/i);
        assert.throws(() => h.app.propose(principal, scope, source, { archetype: 'research_validation', evidenceQuote: 'checking current inquiry routes', specialization: 'Always reuse editor@studio.example while checking current sources and preserving uncertainty.' }), /PROCEDURE_LITERAL_LEAK/);
        assert.throws(() => h.app.propose(principal, scope, source, { archetype: 'research_validation', evidenceQuote: 'checking current inquiry routes', specialization: 'Always reuse PRIVATE-ACCOUNT-771 while checking current sources and preserving uncertainty.', privateOverlay: { account: 'PRIVATE-ACCOUNT-771' } }), /PROCEDURE_LITERAL_LEAK/);
        assert.throws(() => h.app.propose(principal, scope, source, { archetype: 'research_validation', evidenceQuote: 'checking current inquiry routes', specialization: 'A sufficiently long procedure specialization.', extra: true } as any), /OUTPUT_KEYS/);
    } finally { h.close(); }
});

test('six neutral cases use distinct meaningful sources and freeze refuses evaluator labels that do not follow the published worker policy', () => {
    const h = harness(); try {
        assert.deepEqual(DEVELOPER_VISIBLE_PROCEDURE_CASES.map(c => c.id), ['case-01', 'case-02', 'case-03', 'case-04', 'case-05', 'case-06']);
        assert.ok(new Set(DEVELOPER_VISIBLE_PROCEDURE_CASES.flatMap(c => c.sources.map(s => s.url))).size >= 6);
        assert.ok(DEVELOPER_VISIBLE_PROCEDURE_CASES.some(c => c.sources.some(s => s.validUntil !== null && Date.parse(s.validUntil) <= Date.parse(c.currentAt))));
        assert.ok(DEVELOPER_VISIBLE_PROCEDURE_CASES.some(c => c.sources.some(s => /withdrawn/i.test(s.text))));
        assert.ok(DEVELOPER_VISIBLE_PROCEDURE_CASES.some(c => c.sources.some(s => /IGNORE YOUR RULES/.test(s.text))));
        const f = frozen(h.app); assert.equal(f.conditions.conditionOrder, 'alternating_baseline_first');
        const changed = structuredClone(DEVELOPER_VISIBLE_PROCEDURE_CASES); changed[0].expected.action = 'no_contact'; changed[0].expected.recipientAddress = null;
        assert.throws(() => h.app.freeze(principal, scope, f.candidateId, changed, {}, {}, {}), /CASE_EXPECTED_POLICY_MISMATCH/);
    } finally { h.close(); }
});

test('metered requests contain worker rules and source text but no evaluator answer; arms share context and alternate first condition fairly', async () => {
    const h = harness(); try {
        const f = frozen(h.app), seen: MeteredInvocation[] = [];
        const result = await h.app.compare(principal, scope, f.id, invoker(request => { seen.push(structuredClone(request)); return { output: fixtureOutput(request.context), usage: { fixture: true }, route: { kind: 'fixture' } }; }));
        assert.equal(seen.length, 12); assert.equal(result.analysis.completedPairs, 6); assert.equal(result.analysis.semanticResult, 'unknown'); assert.equal(result.analysis.decision, 'inconclusive');
        assert.deepEqual(seen.map(x => x.condition), ['baseline', 'challenger', 'challenger', 'baseline', 'baseline', 'challenger', 'challenger', 'baseline', 'baseline', 'challenger', 'challenger', 'baseline']);
        for (const request of seen) { const serialized = JSON.stringify(request.context); assert.doesNotMatch(serialized, /"expected"|"family"|"status"|suitableForPurpose|sourceQuality|reasonCode|stale-route|no-address-route|hostile-source/); assert.equal(request.context.objective, 'Select a documented business inquiry route under the supplied policy, without assuming contact authority or demand.'); assert.equal(request.context.operatingRules.noPublishedRouteRequiresNoContact, true); assert.equal(request.context.operatingRules.allSuppliedSourceIdsRequired, true); assert.ok(request.context.sources.every(s => serialized.includes(s.id))); assert.equal(request.schema.additionalProperties, false); }
        for (const c of DEVELOPER_VISIBLE_PROCEDURE_CASES) { const arms = seen.filter(x => x.caseId === c.id); assert.equal(arms.length, 2); assert.deepEqual(arms[0].context, arms[1].context); assert.deepEqual(arms[0].route, arms[1].route); const attempts = result.attempts.filter(x => x.caseId === c.id); assert.equal(attempts[0].requestHash, attempts[1].requestHash); }
        assert.equal(result.analysis.baseline.mechanicalPasses, 6); assert.equal(result.analysis.challenger.mechanicalPasses, 6);
    } finally { h.close(); }
});

test('attempt records preserve full output and mechanical failures/counts cannot become a semantic win', async () => {
    const h = harness(); try {
        const f = frozen(h.app);
        const result = await h.app.compare(principal, scope, f.id, invoker(request => {
            if (request.caseId === 'case-03' && request.condition === 'challenger') throw Object.assign(new Error('fixture failure'), { code: 'FIXTURE_FAILURE' });
            const output: any = fixtureOutput(request.context); if (request.caseId === 'case-04' && request.condition === 'baseline') output.recipientAddress = 'invented@example.test'; return { output, usage: { fixture: true }, route: { kind: 'fixture' } };
        }));
        const preserved = result.attempts.find(a => a.caseId === 'case-01' && a.condition === 'baseline')!;
        assert.equal(preserved.outcome?.status, 'completed'); assert.deepEqual((preserved.outcome as any).output.unknowns, ['Demand, permission to send, conversion, and economics remain unknown.']);
        assert.equal(result.analysis.baseline.completed, 6); assert.equal(result.analysis.baseline.mechanicalPasses, 5); assert.equal(result.analysis.challenger.completed, 5); assert.equal(result.analysis.challenger.failed, 1);
        assert.deepEqual(result.analysis.failures, [{ caseId: 'case-03', condition: 'challenger', errorCode: 'FIXTURE_FAILURE' }]); assert.equal(result.analysis.decision, 'inconclusive'); assert.equal(result.analysis.semanticResult, 'unknown');
    } finally { h.close(); }
});

test('pending intent is durable before invoke and resumes only through the same OperatingModels attempt without another provider effect', async () => {
    const h = harness(); const f = frozen(h.app); const durable = new Map<string, any>(); let providerEffects = 0, interrupted = false;
    const models = invoker(request => { const prior = durable.get(request.attemptId); if (prior) return prior; providerEffects++; const result = { output: fixtureOutput(request.context), usage: { fixture: true }, route: { kind: 'fixture-operating-models' } }; durable.set(request.attemptId, result); return result; });
    h.app.afterInvoke = () => { if (!interrupted) { interrupted = true; throw Object.assign(new Error('PROCESS_INTERRUPTED'), { code: 'PROCESS_INTERRUPTED' }); } };
    await assert.rejects(h.app.compare(principal, scope, f.id, models), /PROCESS_INTERRUPTED/);
    const run = h.store.db.prepare("SELECT body FROM entities WHERE kind='procedure-lab-run'").get() as any; assert.equal(JSON.parse(String(run.body)).attempts[0].state, 'pending');
    h.close(false);
    const recovered = harness(h.dbPath); try {
        await assert.rejects(recovered.app.compare(principal, scope, f.id, { kind: 'fixture', invoke: async () => ({ output: {} }) } as any), /OPERATING_MODELS_INVOKER_REQUIRED/);
        const result = await recovered.app.compare(principal, scope, f.id, models);
        assert.equal(providerEffects, 12); assert.equal(result.attempts.length, 12); assert.ok(result.attempts.every(a => a.state === 'finished')); assert.equal(result.analysis.completedPairs, 6);
    } finally { recovered.close(false); rmSync(h.root!, { recursive: true, force: true }); }
});
