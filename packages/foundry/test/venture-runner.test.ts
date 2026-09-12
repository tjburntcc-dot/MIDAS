import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keypair,signed } from '../src/experiment/config.ts';
import { StateStore } from '../src/state.ts';
import { scopeKey,hash } from '../src/contracts.ts';
import { ModelLedger } from '../src/experiment/ledger.ts';
import type { Scope } from '../src/contracts.ts';
import { prepareVentureRun,runVentureEvidence,validationPackageSchema } from '../src/venture/runner.ts';
import type { EvidenceBundle } from '../src/workbench/evidence.ts';

const scope:Scope={tenantId:'test',businessId:'venture',runId:'NEW-VENTURE',dataPolicyVersion:'v1',mode:'fixture'};
const principal={id:'owner',tenantId:'test',businessId:'venture',permissions:['operate']};
const bundle:EvidenceBundle={version:'v1',asOf:'2026-09-12T00:00:00Z',purpose:'Compare a venture hypothesis with actual evidence.',currency:'USD',valueBasis:'monthly contribution',dimensions:['demand'],allowedTools:[],allowedEffects:[],sources:[{id:'s1',version:'v1',text:'There is no observed willingness to pay.',observedAt:'2026-09-12T00:00:00Z',validUntil:null,permission:'worker',rights:'Development-authored synthetic test'},{id:'secret',version:'v1',text:'HIDDEN_EVALUATOR_LABEL',observedAt:'2026-09-12T00:00:00Z',validUntil:null,permission:'excluded',rights:'Not permitted'}]};
const output={kind:'validation-package-review',recommendation:{candidateId:'c1',reason:'Provisional only; test payment.',sourceIds:['s1']},offer:{segment:'Small local firm',promise:'Deliver scoped draft',scope:['One draft'],exclusions:['No guaranteed outcome']},validation:{riskiestAssumption:'Will buyer pay?',method:'Owner conducts interviews after permission',successCriterion:'Explicit paid pilot interest',revisionCriterion:'Problem but wrong scope',stopCriterion:'No problem evidence'},tasks:[{id:'t1',description:'Owner assesses access',competencies:['buyer_access'],dependsOn:[],humanRequired:true}],changes:['Clarified unknown demand'],limitations:['No commercial validation']};
const route={authorizationId:'new-venture-only',model:'gpt-6-astra',reasoningEffort:'high' as const,serviceTier:'default' as const,maxOutputTokens:8192,inputTokenCeiling:8192,deadlineMs:180000,maxCallCost:{minorUnits:52,currency:'USD'},pricing:{inputMinorPerMillion:1250,outputMinorPerMillion:5000,source:'offline test price; not current verification',effectiveAt:'2026-09-12T00:00:00Z'}};
function setup(){
 const root=mkdtempSync(join(tmpdir(),'venture-runner-'));
 const prepared=prepareVentureRun(root,scope,bundle,route,[{attemptId:'A-1',kind:'validation-package-review',candidateIds:['c1','c2'],currentPackage:{candidateId:'c2',status:'draft'}}],{totalMinor:63,countBufferMinor:11},'mock');
 const keys=keypair();const auth={...prepared.authorizationRequest,approved:true,approvedBy:'fixture-owner',approvalReference:'TEST ONLY not spending authority',projectId:'proj_test',credentialFile:join(root,'DOES-NOT-EXIST.key'),expiresAt:new Date(Date.now()+60000).toISOString()};
 return {root,keys,auth,manifest:prepared.manifest,envelope:signed(auth,keys.privateKey),trustedOwnerPublicKey:keys.publicKey,principal,attemptId:'A-1'};
}
function mock(result:any=output){const calls:any[]=[];const transport=(async(url:any,options:any)=>{calls.push({url,body:JSON.parse(options.body),headers:options.headers});assert.equal(options.redirect,'error');assert.ok(options.signal);return new Response(JSON.stringify(String(url).endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:100}:{id:'response_mock',model:route.model,status:'completed',service_tier:'default',usage:{input_tokens:100,output_tokens:200},output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{status:200,headers:{'x-request-id':'req_mock123456'}});}) as typeof fetch;return {kind:'mock' as const,transport,calls};}
function row(s:ReturnType<typeof setup>){const store=new StateStore(join(s.root,'venture-model.sqlite'));try{return store.get('model-attempt',scopeKey(scope)+'/A-1');}finally{store.close();}}

test('signed mock path uses exact complete payload and projects count; persists authoritative replacement and resumes without requests',async()=>{
 const s=setup(),execution=mock();const result=await runVentureEvidence({...s,execution});
 assert.equal(execution.calls.length,2);assert.equal(result.proposal.result.output.recommendation.candidateId,'c1');assert.equal(result.proposal.provenance,'offline_mock');assert.equal(result.proposal.acceptedByOwner,false);
 assert.equal(hash(execution.calls[1].body),hash(JSON.parse(s.manifest.requests[0].bytes)));
 assert.equal(execution.calls[0].body.text.format.schema.type,'object');assert.equal(execution.calls[0].body.max_output_tokens,undefined);
 assert.equal(JSON.stringify(execution.calls).includes('HIDDEN_EVALUATOR_LABEL'),false);
 assert.equal(row(s).reservation,52);assert.equal(row(s).cost.status,'provisional');assert.equal(row(s).inferenceDispatchIntent,true);
 assert.equal((await runVentureEvidence({...s,execution})).reused,true);assert.equal(execution.calls.length,2);
});
test('unsigned, expired, wrong principal, mismatched mode and unlisted attempt deny before transport',async()=>{
 const s=setup(),execution=mock();
 for(const change of [{envelope:{...s.envelope,signature:'bad'}},{envelope:signed({...s.auth,expiresAt:'2000-01-01T00:00:00Z'},s.keys.privateKey)},{principal:{...principal,businessId:'other'}},{execution:{kind:'live' as const}},{attemptId:'A-2'}])await assert.rejects(runVentureEvidence({...s,execution,...change}));
 assert.equal(execution.calls.length,0);
});
test('signed aggregate cap prevents any count and exact request cannot be edited after signing',async()=>{
 const s=setup(),execution=mock();s.manifest.limits.totalMinor=51;s.envelope=signed({...s.auth,manifestHash:hash(s.manifest)},s.keys.privateKey);
 await assert.rejects(runVentureEvidence({...s,execution}),/AGGREGATE_BUDGET_EXCEEDED/);assert.equal(execution.calls.length,0);
 const a=setup();a.manifest.requests[0].bytes+=' ';a.envelope=signed({...a.auth,manifestHash:hash(a.manifest)},a.keys.privateKey);
 await assert.rejects(runVentureEvidence({...a,execution}),/VENTURE_REQUEST_CHANGED/);assert.equal(execution.calls.length,0);
});
test('count failure consumes admission retains exposure and never dispatches inference or retries',async()=>{
 const s=setup();let calls=0;const execution={kind:'mock' as const,transport:(async()=>{calls++;return new Response(JSON.stringify({error:{type:'authentication_error',code:'invalid_project',message:'uncontrolled data'}}),{status:401});}) as typeof fetch};
 await assert.rejects(runVentureEvidence({...s,execution}),/TOKEN_COUNT_HTTP_ERROR/);assert.equal(row(s).inferenceDispatchIntent,false);assert.equal(row(s).reservation,52);assert.equal(row(s).observation.tokenCount.providerErrorCode,'invalid_project');
 await assert.rejects(runVentureEvidence({...s,execution}),/NO_RETRY/);assert.equal(calls,1);
});
test('inference transport uncertainty retained without automatic replacement',async()=>{
 const s=setup(),base=mock();let calls=0;const execution={kind:'mock' as const,transport:(async(...args:any[])=>{calls++;if(calls===2)throw new Error('do not persist uncontrolled errors');return (base.transport as any)(...args);}) as typeof fetch};
 await assert.rejects(runVentureEvidence({...s,execution}));assert.equal(row(s).inferenceDispatchIntent,true);assert.equal(row(s).reservation,52);assert.equal(JSON.stringify(row(s)).includes('uncontrolled errors'),false);
 await assert.rejects(runVentureEvidence({...s,execution}),/NO_RETRY/);assert.equal(calls,2);
});
test('crash after response persistence recovers result and finishes accounting without another request',async()=>{
 const s=setup(),execution=mock();await assert.rejects(runVentureEvidence({...s,execution,afterResponsePersisted(){throw new Error('simulated interruption');}}));assert.equal(row(s).finishedAt,undefined);
 const resumed=await runVentureEvidence({...s,execution});assert.equal(resumed.reused,true);assert.ok(row(s).finishedAt);assert.equal(execution.calls.length,2);
});
test('invalid source and task dependency outputs preserve failed observation and provisional usage',async()=>{
 for(const bad of [{...output,recommendation:{...output.recommendation,sourceIds:['secret']}},{...output,tasks:[{...output.tasks[0],dependsOn:['t1']}]}]){
 const s=setup(),execution=mock(bad);await assert.rejects(runVentureEvidence({...s,execution}));assert.equal(row(s).cost.status,'provisional');assert.ok(row(s).observation.outputArtifact);assert.equal(row(s).reservation,52);await assert.rejects(runVentureEvidence({...s,execution}),/NO_RETRY/);assert.equal(execution.calls.length,2);
 }
});
test('complete-payload input admission over ceiling prevents inference and keeps count exposure',async()=>{
 const s=setup();let calls=0;const execution={kind:'mock' as const,transport:(async()=>{calls++;return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:8192}),{status:200});}) as typeof fetch};
 await assert.rejects(runVentureEvidence({...s,execution}),/MODEL_INPUT_EXCEEDS_ADMISSION/);assert.equal(calls,1);assert.equal(row(s).inferenceDispatchIntent,false);assert.equal(row(s).reservation,52);
});
test('interrupted admitted attempt cannot silently resume counting or inference',async()=>{
 const s=setup(),store=new StateStore(join(s.root,'venture-model.sqlite')),entry=s.manifest.requests[0];
 const ledger=new ModelLedger(store,scope,hash(s.auth),s.manifest.limits);await ledger.port('development',{}).prepare!(entry.request,route.maxCallCost,entry.requestHash,entry.bytes);store.close();
 const execution=mock();await assert.rejects(runVentureEvidence({...s,execution}),/UNCERTAIN_OR_FAILED_NO_RETRY/);assert.equal(execution.calls.length,0);assert.equal(row(s).reservation,52);
});
test('same runner executes sourced understanding output under its strict independent contract',async()=>{
 const s=setup();const p=prepareVentureRun(s.root,scope,bundle,route,[{attemptId:'A-1',kind:'understanding'}],{totalMinor:63,countBufferMinor:11},'mock');s.manifest=p.manifest;s.auth={...s.auth,manifestHash:hash(p.manifest)};s.envelope=signed(s.auth,s.keys.privateKey);
 const result={kind:'business-understanding-proposal',completeness:'partial',claims:[{id:'unknown-demand',kind:'observation',dimension:'demand',statement:'Source records no observed willingness to pay.',references:[{sourceId:'s1',quote:'There is no observed willingness to pay.'}]}],contradictions:[],unknowns:[{question:'Will buyers pay?',consequence:'Venture may not be viable.',claimIds:['unknown-demand']}],evidenceRequests:[],hypotheses:[],selectedHypothesisId:null,selectionReason:'Insufficient evidence; owner access needed.',tasks:[]};
 const execution=mock(result),r=await runVentureEvidence({...s,execution});assert.equal(r.proposal.result.output.selectedHypothesisId,null);assert.equal(r.actualProviderCalls,0);assert.equal(r.accountingProvenance,'simulated-provider-telemetry');
});
test('task identifiers expose the exact core pattern and accept varied valid identifiers',async()=>{
 const schema=validationPackageSchema.properties.tasks.items.properties;
 assert.equal(schema.id.pattern,'^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$');assert.deepEqual(schema.dependsOn.items,schema.id);
 const ids=['A','task_2.v1-accepted','Z'.repeat(96)];
 const tasks=ids.map((id,i)=>({...output.tasks[0],id,dependsOn:i?[ids[i-1]]:[]}));
 const s=setup(),execution=mock({...output,tasks});assert.equal((await runVentureEvidence({...s,execution})).proposal.result.output.tasks.length,3);
});
test('spaces, punctuation, leading separator and overlong task IDs reject before business import',async()=>{
 for(const id of ['bad task','bad/task','_bad','A'.repeat(97)]){
  const s=setup(),execution=mock({...output,tasks:[{...output.tasks[0],id}]});await assert.rejects(runVentureEvidence({...s,execution}),/VENTURE_OUTPUT_PATTERN|VENTURE_OUTPUT_TEXT/);assert.equal(row(s).reservation,52);
 }
 const s=setup(),execution=mock({...output,tasks:[{...output.tasks[0],dependsOn:['bad task']}]});await assert.rejects(runVentureEvidence({...s,execution}),/VENTURE_OUTPUT_PATTERN/);
});
