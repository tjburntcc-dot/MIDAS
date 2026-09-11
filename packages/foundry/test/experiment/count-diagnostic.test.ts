import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../../src/state.ts';
import {canonical,rawHash} from '../../src/contracts.ts';
import {keypair,signed,writeJSON,readJSON} from '../../src/experiment/config.ts';
import {prepareDiagnostic,runDiagnostic} from '../../tools/count-diagnostic.mjs';
function setup(){
 const base=mkdtempSync(join(tmpdir(),'count-only028-')),old=join(base,'old'),root=join(base,'diagnostic');mkdirSync(join(old,'auth'),{recursive:true});const keys=keypair();writeFileSync(join(old,'auth','owner.pub'),keys.publicKey);writeFileSync(join(old,'mock.key'),'SECRET_MOCK_ONLY');
 writeJSON(join(old,'authorization.json'),signed({approved:true,route:{model:'gpt-5.6-sol',reasoningEffort:'medium'},projectId:'proj_test',credentialFile:join(old,'mock.key')},keys.privateKey));
 const store=new StateStore(join(old,'experiment.sqlite'));
 try{for(const id of ['D-001','D-002']){const bytes=canonical({model:'gpt-5.6-sol',input:'SYNTHETIC_INPUT_PRIVATE_TO_ATTEMPT',instructions:'instructions',reasoning:{effort:'medium'},text:{format:{type:'json_schema'}},max_output_tokens:4096,service_tier:'default',store:false});store.transaction(()=>store.put('model-attempt',id,{metadata:{caseId:id},stage:'smoke',inferenceDispatchIntent:false,errorCode:'TOKEN_COUNT_HTTP_ERROR',requestBytes:bytes,requestHash:rawHash(bytes),reservation:13,invoice:null},null));}}
 finally{store.close();}
 const request=prepareDiagnostic(root,old);
 // This is a fresh MOCK grant; keep the historical production expiry unchanged.
 request.expiresAt=new Date(Date.now()+3600000).toISOString();writeJSON(join(root,'authorization.request.json'),request);return {root,old,keys,request};
}
function approve(t:any){const a={...t.request,approved:true,approvedBy:'MOCK TEST ONLY',approvalReference:'offline test'};writeJSON(join(t.root,'authorization.json'),signed(a,t.keys.privateKey));}
test('count-only diagnostic refuses without its own new signed authorization',async()=>{const t=setup();let calls=0;await assert.rejects(runDiagnostic(t.root,async()=>{calls++;throw Error('forbidden');}));assert.equal(calls,0);});
test('diagnostic preserves original DB, captures only safe evidence and consumes one count with zero inference',async()=>{
 const t=setup();approve(t);const before=readFileSync(join(t.old,'experiment.sqlite'));let calls=0;
 const result=await runDiagnostic(t.root,async(url:any)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses/input_tokens');return new Response(JSON.stringify({error:{type:'authentication_error',code:'invalid_api_key',message:'SECRET_MOCK_ONLY'}}),{status:401,headers:{'x-request-id':'req_abcdef1234567890'}});});
 assert.equal(calls,1);assert.equal(result.inferenceDispatches,0);assert.equal(result.diagnostic.httpStatus,401);assert.equal(result.aggregateExposureMinor,39);assert.equal(result.cost.status,'unknown');assert.equal(result.reservationMinor,13);
 const report=JSON.stringify(result);assert.ok(!report.includes('SECRET_MOCK_ONLY'));assert.ok(!report.includes('SYNTHETIC_INPUT_PRIVATE_TO_ATTEMPT'));assert.deepEqual(readFileSync(join(t.old,'experiment.sqlite')),before);
 await assert.rejects(runDiagnostic(t.root,async()=>{calls++;return new Response();}),/DIAGNOSTIC_ALREADY_ADMITTED/);assert.equal(calls,1);
});
test('competing diagnostic invocations admit only one count; success cannot dispatch inference or release exposure',async()=>{
 const t=setup();approve(t);let calls=0;const transport:any=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:400}));};
 const results=await Promise.allSettled([runDiagnostic(t.root,transport),runDiagnostic(t.root,transport)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);const value=(results.find(x=>x.status==='fulfilled') as any).value;assert.equal(value.inferenceDispatches,0);assert.equal(value.reservationMinor,13);assert.equal(value.diagnostic.inputTokens,400);
});
test('changed grant, expired grant and changed historical request are refused without transport',async()=>{
 for(const kind of ['changed','expired','history']){const t=setup();let calls=0;const a={...t.request,approved:true,approvedBy:'MOCK',approvalReference:'test'};if(kind==='changed')a.maxInferenceRequests=1;if(kind==='expired')a.expiresAt='2000-01-01T00:00:00Z';writeJSON(join(t.root,'authorization.json'),signed(a,t.keys.privateKey));if(kind==='history'){const db=new StateStore(join(t.old,'experiment.sqlite'));db.transaction(()=>{const row=db.get('model-attempt','D-001');db.put('model-attempt','D-001',{...row,reservation:0},row._version);});db.close();}await assert.rejects(runDiagnostic(t.root,async()=>{calls++;throw Error('forbidden');}));assert.equal(calls,0);}
});
