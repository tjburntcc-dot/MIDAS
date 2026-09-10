import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responsesModelPort } from '../src/model-port.ts';
function inputs(overrides: any = {}) {
    const calls: any[] = [];
    let network = 0;
    const request: any = { scope: { tenantId: 'lab-a', businessId: 'support-a', runId: 'model-test', dataPolicyVersion: 'lab-policy-v1', mode: 'fixture' }, requestId: 'request-1', role: { id: 'analyst', version: '1', procedure: 'Analyze supplied evidence only.', model: 'explicit-test-model' }, task: 'decide', context: { snapshot: {}, evidence: [] }, tools: [], limits: { maxCost: { minorUnits: 10, currency: 'USD' }, maxAttempts: 1, maxHumanMinutes: 0 } };
    const port = responsesModelPort({ route: { authorizationId: 'test-authorization-no-network', model: 'explicit-test-model', maxOutputTokens: 100, deadlineMs: 1000, inputTokenCeiling: 1000, maxCallCost: { minorUnits: 10, currency: 'USD' }, pricing: { inputMinorPerMillion: 1000, outputMinorPerMillion: 2000, source: 'synthetic transport test rates', effectiveAt: '2026-09-10T00:00:00Z' } }, apiKey: () => 'FAKE-NOT-A-CREDENTIAL', budget: { async reserve(r, amount, h) { calls.push({ kind: 'reserve', amount, h }); }, async settle(r, cost, id) { calls.push({ kind: 'settle', cost, id }); }, async uncertain(r, reason) { calls.push({ kind: 'uncertain', reason }); } }, countInputTokens: () => 20, schemaForTask: () => ({ type: 'object', properties: { decision: { type: 'string' } }, required: ['decision'], additionalProperties: false }), validateOutput(task, out) { assert.deepEqual(Object.keys(out), ['decision']); }, transport: async (url, init) => { network++; const body = JSON.parse(String(init?.body)); assert.equal(body.max_output_tokens, 100); assert.equal(body.store, false); assert.equal(body.text.format.strict, true); assert.ok(init?.signal); return new Response(JSON.stringify({ id: 'mock-response-1', model: 'explicit-test-model', status: 'completed', usage: { input_tokens: 20, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: '{"decision":"no-action"}' }] }] }), { status: 200 }); }, ...overrides });
    return { port, request, calls, network: () => network };
}
test('Responses ModelPort mock binds limits, scope, usage and provisional cost without real network', async () => { const t = inputs(); const r = await t.port.run(t.request); assert.equal(r.output.decision, 'no-action'); assert.equal(r.usage.cost.status, 'provisional'); assert.equal(r.metadata!.providerRequestId, 'mock-response-1'); assert.equal(t.calls[0].kind, 'reserve'); assert.equal(t.calls[1].kind, 'settle'); assert.equal(t.network(), 1); });
test('budget and route refusals happen before transport; ambiguous transport retains exposure and never retries', async () => { const t = inputs(); t.request.limits.maxCost.minorUnits = 0; await assert.rejects(t.port.run(t.request), /MODEL_BUDGET_EXCEEDED/); assert.equal(t.network(), 0); const u = inputs({ transport: async () => { throw Error('mock timeout'); } }); await assert.rejects(u.port.run(u.request), /No automatic retry/); assert.deepEqual(u.calls.map(x => x.kind), ['reserve', 'uncertain']); });
test('input admission rejects before credential access, budget reservation and transport', async () => {
    const t = inputs({ countInputTokens: () => 1001, apiKey: () => { throw Error('must not access'); } });
    await assert.rejects(t.port.run(t.request), /MODEL_INPUT_EXCEEDS_ADMISSION/);
    assert.deepEqual(t.calls, []);
    assert.equal(t.network(), 0);
});
test('missing or excessive provider usage preserves reservation without settlement', async () => {
    for (const usage of [null, { input_tokens: 1001, output_tokens: 10 }, { input_tokens: 20, output_tokens: 101 }]) {
        const t = inputs({ transport: async () => new Response(JSON.stringify({ id: 'mock', model: 'explicit-test-model', status: 'completed', usage, output: [] })) });
        await assert.rejects(t.port.run(t.request), /No automatic retry/);
        assert.deepEqual(t.calls.map(x => x.kind), ['reserve', 'uncertain']);
    }
});
test('invalid output does not overwrite already recorded provisional usage with unknown billing', async () => {
    const t = inputs({ transport: async () => new Response(JSON.stringify({ id: 'mock', model: 'explicit-test-model', status: 'completed', usage: { input_tokens: 20, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: 'invalid JSON' }] }] })) });
    await assert.rejects(t.port.run(t.request), /No automatic retry/);
    assert.deepEqual(t.calls.map(x => x.kind), ['reserve', 'settle']);
    assert.equal(t.calls[1].cost.status, 'provisional');
});
