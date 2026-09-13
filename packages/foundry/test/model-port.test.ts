import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responsesModelPort } from '../src/model-port.ts';
import {readFileSync} from 'node:fs';
import {responseObservation} from '../src/response-observation.ts';
function inputs(overrides: any = {}) {
    const calls: any[] = [];
    let network = 0;
    const request: any = { scope: { tenantId: 'lab-a', businessId: 'support-a', runId: 'model-test', dataPolicyVersion: 'lab-policy-v1', mode: 'fixture' }, requestId: 'request-1', role: { id: 'analyst', version: '1', procedure: 'Analyze supplied evidence only.', model: 'explicit-test-model' }, task: 'decide', context: { snapshot: {}, evidence: [] }, tools: [], limits: { maxCost: { minorUnits: 10, currency: 'USD' }, maxAttempts: 1, maxHumanMinutes: 0 } };
    const port = responsesModelPort({ route: { authorizationId: 'test-authorization-no-network', model: 'explicit-test-model', maxOutputTokens: 100, deadlineMs: 1000, inputTokenCeiling: 1000, maxCallCost: { minorUnits: 10, currency: 'USD' }, pricing: { inputMinorPerMillion: 1000, outputMinorPerMillion: 2000, source: 'synthetic transport test rates', effectiveAt: '2026-09-10T00:00:00Z' } }, apiKey: () => 'FAKE-NOT-A-CREDENTIAL', budget: { async reserve(r, amount, h) { calls.push({ kind: 'reserve', amount, h }); }, async settle(r, cost, id) { calls.push({ kind: 'settle', cost, id }); }, async uncertain(r, reason) { calls.push({ kind: 'uncertain', reason }); } }, countInputTokens: () => 20, schemaForTask: () => ({ type: 'object', properties: { decision: { type: 'string' } }, required: ['decision'], additionalProperties: false }), validateOutput(task, out) { assert.deepEqual(Object.keys(out), ['decision']); }, transport: async (url, init) => { network++; const body = JSON.parse(String(init?.body)); assert.equal(body.max_output_tokens, 100); assert.equal(Object.hasOwn(JSON.parse(body.input), "scope"), false); assert.equal(body.store, false); assert.equal(body.text.format.strict, true); assert.ok(init?.signal); return new Response(JSON.stringify({ id: 'mock-response-1', model: 'explicit-test-model', status: 'completed', usage: { input_tokens: 20, output_tokens: 10 }, output: [{ content: [{ type: 'output_text', text: '{"decision":"no-action"}' }] }] }), { status: 200 }); }, ...overrides });
    return { port, request, calls, network: () => network };
}

test('terminal provider failure remains primary without usage; diagnostics precede accounting',async()=>{
 for(const status of ['failed','incomplete','cancelled'])for(const error of [null,{code:'credit_balance_exhausted',message:'No credits remain.'}]){
  const events:any[]=[];let dispatches=0;
  const t=inputs({budget:{async reserve(){events.push({kind:'reserve'});},async settle(){throw Error('no usage to settle');},async uncertain(_r:any,reason:any){events.push({kind:'uncertain',reason});},async observed(_r:any,o:any){events.push({kind:'observation',...o});}},transport:async()=>{dispatches++;return Response.json({id:'resp_test',model:'explicit-test-model',status,error,usage:null,output:[],incomplete_details:status==='incomplete'?{reason:'max_output_tokens'}:null});}});
  const expected=status==='failed'?'MODEL_RESPONSE_FAILED':status==='incomplete'?'MODEL_RESPONSE_INCOMPLETE':'MODEL_RESPONSE_CANCELLED';
  await assert.rejects(t.port.run(t.request),(e:any)=>e.code===expected);
  assert.equal(dispatches,1);assert.equal(events.at(-1).reason,expected);
  const observation=events.find(e=>e.outcome==='terminal_'+status);assert(observation);assert.equal(observation.accountingUsage,'unknown');
  assert.equal(observation.providerError?.code,error?.code);assert(events.find(e=>e.accountingError==='MODEL_USAGE_MISSING'));
 }
});

test('failed response preserves valid reported usage without accepting output or overwriting cost',async()=>{
 const t=inputs({transport:async()=>Response.json({id:'resp_failed',model:'explicit-test-model',status:'failed',usage:{input_tokens:20,output_tokens:10},error:{code:'server_error',message:'Failure'},output:[]})});
 await assert.rejects(t.port.run(t.request),(e:any)=>e.code==='MODEL_RESPONSE_FAILED');assert.deepEqual(t.calls.map(e=>e.kind),['reserve','settle']);
});

test('failed response with excessive usage retains primary failure and records accounting defect',async()=>{
 const observed:any[]=[];const t=inputs({budget:{async reserve(){},async settle(){throw Error('must not settle');},async uncertain(){},async observed(_r:any,o:any){observed.push(o);}},transport:async()=>Response.json({id:'resp_failed',model:'explicit-test-model',status:'failed',usage:{input_tokens:1001,output_tokens:10},output:[]})});
 await assert.rejects(t.port.run(t.request),(e:any)=>e.code==='MODEL_RESPONSE_FAILED');assert(observed.some(o=>o.accountingError==='MODEL_USAGE_EXCEEDS_ADMISSION'));
});

test('recovered live R4 failure metadata remains a failure, not a usage failure or valid decision',async()=>{
 const raw=JSON.parse(readFileSync(new URL('./fixtures/provider-failure-r4/terminal.json',import.meta.url),'utf8').trim());
 assert.equal(raw.originalBodyHash,'5597a9cfb9515f02fa6a6bf10c11dbe4cfe42e013114e4b7dc6a327fc86d0d59');
 const observed:any[]=[];const t=inputs({route:{authorizationId:'offline',model:'gpt-6-astra',maxOutputTokens:100,deadlineMs:1000,inputTokenCeiling:1000,maxCallCost:{minorUnits:10,currency:'USD'},pricing:{inputMinorPerMillion:1000,outputMinorPerMillion:2000,source:'offline test rates',effectiveAt:'2026-09-13'}},budget:{async reserve(){},async settle(){throw Error('must not settle');},async uncertain(){},async observed(_r:any,o:any){observed.push(o);}},transport:async()=>Response.json(raw)});
 t.request.role.model='gpt-6-astra';await assert.rejects(t.port.run(t.request),(e:any)=>e.code==='MODEL_RESPONSE_FAILED');
 assert.equal(observed.find(o=>o.providerError)?.providerError.code,'credit_balance_exhausted');assert(!observed.some(o=>o.outputArtifact));
});

test('diagnostic field allowlist bounds messages and removes secret echoes before truncation',()=>{
 const secret='DUMMY_SECRET_123';const o=responseObservation({status:'failed',error:{code:'credit_balance_exhausted',message:secret+' Bearer hidden-token sk-hidden-key '+ 'x'.repeat(5000),extra:secret},headers:{authorization:secret},usage:null},secret);
 assert.equal(o.providerError?.message?.length,4096);assert.equal(o.providerError?.messageTruncated,true);assert(!JSON.stringify(o).includes(secret));assert(!JSON.stringify(o).includes('hidden-token'));assert(!JSON.stringify(o).includes('sk-hidden-key'));assert(!Object.hasOwn(o,'headers'));assert(!Object.hasOwn(o.providerError!,'extra'));
});
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
test('failed schema output preserves bounded diagnostic artifact and credential echoes never persist or return',async()=>{
 for(const content of [{wrong:'shape'},{decision:'FAKE-NOT-A-CREDENTIAL'}]){
  const observed:any[]=[];const t=inputs({budget:{async reserve(){},async settle(){},async uncertain(){},async observed(_r:any,o:any){observed.push(o);}},transport:async()=>new Response(JSON.stringify({id:'mock',model:'explicit-test-model',status:'completed',usage:{input_tokens:20,output_tokens:10},output:[{content:[{type:'output_text',text:JSON.stringify(content)}]}]}))});
  await assert.rejects(t.port.run(t.request));assert.ok(observed.some(x=>x.outputArtifact));assert.doesNotMatch(JSON.stringify(observed),/FAKE-NOT-A-CREDENTIAL/);
 }
});
