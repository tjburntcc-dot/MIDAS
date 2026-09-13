import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,appendFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {StateStore} from '../src/state.ts';
import {hash,rawHash,canonical} from '../src/contracts.ts';
import {DurableResponses,BACKGROUND_POLICY,validateBackgroundPolicy} from '../src/durable-responses.ts';
import {buildResponsesBody,responsesModelPort} from '../src/model-port.ts';

const BASE=Date.parse('2026-09-13T12:00:00.000Z');
const MODEL='explicit-offline-background-model',SECRET='DUMMY_KEY_FOR_OFFLINE_TEST_ONLY',PROJECT='proj_offline_fixture';
const ENDPOINT='https://api.openai.com/v1/responses',ID='resp_offline_fixture';
const BYTES=JSON.stringify({model:MODEL,background:true,store:true,input:'Explicit offline transport mechanics fixture'});
const KEY='offline/background/one',GRANT=hash('ephemeral offline test authority');
const originalFetch=globalThis.fetch;let forbiddenNetworkAttempts=0;
test.before(()=>{globalThis.fetch=async()=>{forbiddenNetworkAttempts++;throw Error('Real network is forbidden in durable Responses tests');};});
test.after(()=>{globalThis.fetch=originalFetch;assert.equal(forbiddenNetworkAttempts,0,'all transport must use explicit in-memory fakes');});
const snapshot=(store:StateStore)=>hash(['entities','events','records','artifacts'].map(table=>store.db.prepare('SELECT * FROM '+table).all().map(row=>({...row}))));
const response=(status='completed',extra:Record<string,unknown>={})=>({id:ID,model:MODEL,status,background:true,store:true,service_tier:'default',...(status==='completed'?{usage:{input_tokens:20,output_tokens:10,input_tokens_details:{cached_tokens:0}},output:[{type:'message',content:[{type:'output_text',text:'{"decision":"inspect"}'}]}]}:{}),...extra});
const json=(body:any,status=200)=>Response.json(body,{status,headers:{'x-request-id':'req_offline123456'}});
type Dispatch={method:string;url:string;at:number};

function fixture(options:{expiresMs?:number;bytes?:string}={}){
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'midas-durable-response-test-')),file=join(root,'state.sqlite');let store=new StateStore(file),now=BASE,authorized=0;
 const sleeps:number[]=[],calls:Dispatch[]=[],bytes=options.bytes??BYTES,expiresAt=new Date(BASE+(options.expiresMs??2*86400000)).toISOString();
 const transport=(handler:(call:Dispatch,init:RequestInit)=>Response|Promise<Response>)=>(async(url:any,init:any)=>{
  const method=init?.method,actual=String(url);assert(['POST','GET'].includes(method),'no unrecognized transport method');assert.equal(actual,method==='POST'?ENDPOINT:ENDPOINT+'/'+ID,'only the exact create or retained-ID read is permitted');
  assert.equal(init.redirect,'error');assert(init.signal instanceof AbortSignal);assert.equal(init.headers.authorization,'Bearer '+SECRET);assert.equal(init.headers['OpenAI-Project'],PROJECT);
  if(method==='POST')assert.equal(init.body,bytes);else assert.equal(init.body,undefined,'GET must not resend the inference payload');
  const call={method,url:actual,at:now};calls.push(call);return handler(call,init);
 }) as typeof fetch;
 const job=(overrides:Partial<ConstructorParameters<typeof DurableResponses>[0]>={})=>new DurableResponses({store,key:KEY,requestHash:rawHash(bytes),grantHash:GRANT,policy:BACKGROUND_POLICY,expiresAt,authorize:()=>{authorized++;},now:()=>now,sleep:async ms=>{assert.equal(ms,5000);sleeps.push(ms);now+=ms;},...overrides});
 const args=(fake:typeof fetch,resume=false)=>({bytes,credential:SECRET,projectId:PROJECT,model:MODEL,createDeadlineMs:180000,transport:fake,resume});
 return {root,file,bytes,expiresAt,sleeps,calls,transport,job,args,get store(){return store;},get now(){return now;},get authorized(){return authorized;},advance(ms:number){now+=ms;},reopen(){store.close();store=new StateStore(file);},close(){store.close();const child=realpathSync(root),part=relative(parent,child);assert(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(child,{recursive:true,force:true});}};
}

test('background policy is exact and every changed retention, poll or deadline field is rejected',()=>{
 assert.deepEqual(BACKGROUND_POLICY,{kind:'durable-background-v1',store:true,pollIntervalMs:5000,retrievalDeadlineMs:15000,completionDeadlineMs:900000,resumeWindowMs:86400000,maxRetrievals:240,maxConsecutiveReadErrors:3});
 validateBackgroundPolicy(structuredClone(BACKGROUND_POLICY));
 for(const [key,value] of Object.entries(BACKGROUND_POLICY))assert.throws(()=>validateBackgroundPolicy({...BACKGROUND_POLICY,[key]:typeof value==='number'?value+1:typeof value==='boolean'?!value:'unapproved'} as any),/BACKGROUND_POLICY_NOT_APPROVED/,key);
});

test('a background operation completes after 180 seconds using one POST and bounded same-ID GETs',async()=>{
 const f=fixture(),deadlines:number[]=[],originalTimeout=AbortSignal.timeout;let reads=0;
 AbortSignal.timeout=ms=>{deadlines.push(ms);return originalTimeout(ms);};
 try{
  const job=f.job();job.claim();const result=await job.execute(f.args(f.transport(call=>call.method==='POST'?json(response('queued')):json(response(++reads<=40?'in_progress':'completed')))));job.release();
  assert.equal(result.status,'completed');assert.equal(f.now-BASE,200000);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(reads,41);assert.equal(f.sleeps.length,40);assert.deepEqual(deadlines,[180000,...Array(41).fill(15000)]);
  const state=job.state();assert.equal(state.retrievals,41);assert.equal(state.responseId,ID);assert.equal(state.terminalHash,hash(result));assert.equal(state.completionDeadlineAt,new Date(BASE+900000).toISOString());assert(f.authorized>1);assert(!JSON.stringify(state).includes(SECRET));
 }finally{AbortSignal.timeout=originalTimeout;f.close();}
});

test('lost initial POST acknowledgement remains unknown across SQLite reopen and never resends',async()=>{
 const f=fixture();try{
  let job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>{throw Error('connection lost '+SECRET);}))),/BACKGROUND_CREATE_UNKNOWN/);job.release();
  const saved=job.state();assert.equal(saved.createDispatched,true);assert.equal(saved.responseId,null);assert.equal(saved.retrievals,0);assert.equal(saved.events.at(-1).result,'transport_unknown');assert(!JSON.stringify(saved).includes(SECRET));
  f.reopen();job=f.job();job.claim();const never=f.transport(()=>assert.fail('an unknown create cannot be resent or retrieved without identity'));
  await assert.rejects(job.execute(f.args(never,true)),/BACKGROUND_UNKNOWN_NO_RESUBMIT/);await assert.rejects(job.execute(f.args(never,false)),/BACKGROUND_CREATE_ALREADY_DISPATCHED/);job.release();assert.equal(f.calls.length,1);
 }finally{f.close();}
});

test('lost initial acknowledgement body is also unknown and cannot create a second inference',async()=>{
 const f=fixture();try{
  const job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>new Response(new ReadableStream({start(controller){controller.error(Error('dropped body '+SECRET));}}))))));job.release();
  assert.equal(job.state().createDispatched,true);assert.equal(job.state().responseId,null);assert.equal(job.state().terminal,undefined);
  const resumed=f.job();resumed.claim();await assert.rejects(resumed.execute(f.args(f.transport(()=>assert.fail('no second POST')),true)),/BACKGROUND_UNKNOWN_NO_RESUBMIT/);resumed.release();assert.equal(f.calls.length,1);assert(!JSON.stringify(job.state()).includes(SECRET));
 }finally{f.close();}
});

test('transient lost GETs retry only the retained response and reset the consecutive-error counter after success',async()=>{
 const f=fixture();try{
  let reads=0;const job=f.job();job.claim();const result=await job.execute(f.args(f.transport(call=>{
   if(call.method==='POST')return json(response('queued'));reads++;if([1,2,4,5].includes(reads))throw Error('simulated retrieval connection loss '+SECRET);return json(response(reads===3?'in_progress':'completed'));
  })));job.release();assert.equal(result.id,ID);assert.equal(reads,6);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(job.state().consecutiveReadErrors,0);assert.equal(job.state().retrievals,6);assert(!JSON.stringify(job.state()).includes(SECRET));
 }finally{f.close();}
});

test('truncated or interrupted GET bodies use the same three-error bound and only same-ID retrieval',async()=>{
 for(const complete of [true,false]){const f=fixture();try{
  let reads=0;const job=f.job();job.claim();const transport=f.transport(call=>{
   if(call.method==='POST')return json(response('queued'));reads++;
   if(complete&&reads===3)return json(response());
   return reads%2?new Response('{"id":"resp_incomplete'):new Response(new ReadableStream({start(controller){controller.error(Error('body loss '+SECRET));}}));
  });
  if(complete)assert.equal((await job.execute(f.args(transport))).status,'completed');else await assert.rejects(job.execute(f.args(transport)),/BACKGROUND_READ_ERRORS/);
  job.release();assert.equal(reads,3);assert.equal(job.state().responseId,ID);assert.equal(job.state().retrievals,3);assert.equal(job.state().consecutiveReadErrors,complete?0:3);assert.equal(job.state().events.filter((event:any)=>event.result==='body_unknown').length,complete?2:3);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert(!JSON.stringify(job.state()).includes(SECRET));
 }finally{f.close();}}
});

test('three consecutive transient read errors stop polling with the same response ID and retained state',async()=>{
 for(const failure of ['connection','server','rate-limit'] as const){const f=fixture();try{
  const job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(call=>{if(call.method==='POST')return json(response('queued'));if(failure==='connection')throw Error('mock read error');return json({error:{type:'server_error',message:SECRET,code:'unknown-fixture-code'}},failure==='server'?503:429);}))),/BACKGROUND_READ_ERRORS/);job.release();
  assert.equal(job.state().consecutiveReadErrors,3);assert.equal(job.state().retrievals,3);assert.equal(job.state().responseId,ID);assert.equal(job.state().terminal,undefined);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.method==='GET').length,3);assert(!JSON.stringify(job.state()).includes(SECRET));
 }finally{f.close();}}
});

test('a persisted GET dispatch interruption reopens SQLite and retrieves the same ID without another POST',async()=>{
 const f=fixture();try{
  let interrupted=false;const first=f.job({fault:phase=>{if(phase==='retrieve_intent_persisted'&&!interrupted){interrupted=true;throw Error('explicit process-interruption fixture');}}});first.claim();await assert.rejects(first.execute(f.args(f.transport(()=>json(response('queued'))))),/explicit process-interruption/);first.release();
  assert.equal(first.state().retrievals,1,'an interrupted read admission remains counted');assert.equal(f.calls.length,1);f.reopen();const resumed=f.job();resumed.claim();const result=await resumed.execute(f.args(f.transport(()=>json(response())),true));resumed.release();assert.equal(result.id,ID);assert.equal(resumed.state().retrievals,2);assert.deepEqual(f.calls.map(call=>call.method),['POST','GET']);
 }finally{f.close();}
});

test('wrong retrieved response ID never overwrites the acknowledged identity or becomes a terminal result',async()=>{
 const f=fixture();try{
  const job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(call=>json(response(call.method==='POST'?'queued':'completed',call.method==='GET'?{id:'resp_wrong_identity'}:{}))))),/BACKGROUND_RESPONSE_ID_MISMATCH/);job.release();assert.equal(job.state().responseId,ID);assert.equal(job.state().terminal,undefined);assert.equal(f.calls.length,2);
 }finally{f.close();}
});

test('returned model and storage contracts reject invalid acknowledgements before any retrieval',async()=>{
 for(const [extra,error] of [[{model:'wrong-model'},'RETURNED_MODEL_MISMATCH'],[{store:false},'BACKGROUND_STORAGE_NOT_CONFIRMED'],[{background:false},'BACKGROUND_STORAGE_NOT_CONFIRMED']] as const){const f=fixture();try{
  const job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>json(response('queued',extra))))),new RegExp(error));job.release();assert.equal(job.state().responseId,ID,'safe identity survives the subsequent contract refusal');assert.equal(job.state().terminal,undefined);assert.equal(f.calls.length,1);
 }finally{f.close();}}
});

test('failed, cancelled and incomplete terminal states are durable outcomes and are never represented as completed',async()=>{
 for(const status of ['failed','cancelled','incomplete']){const f=fixture();try{
  const job=f.job();job.claim();const result=await job.execute(f.args(f.transport(call=>json(response(call.method==='POST'?'queued':status,{error:{message:SECRET},incomplete_details:{reason:'max_output_tokens'}})))));job.release();assert.equal(result.status,status);assert.equal(job.state().terminalHash,hash(result));assert(!JSON.stringify(job.state()).includes(SECRET));
  const resumed=f.job();resumed.claim();assert.deepEqual(await resumed.execute(f.args(f.transport(()=>assert.fail('terminal replay needs no transport')),true)),result);resumed.release();assert.deepEqual(f.calls.map(call=>call.method),['POST','GET']);
 }finally{f.close();}}
});

test('a provider 404 for an expired or unavailable stored response never causes a replacement POST',async()=>{
 const f=fixture();try{
  let job=f.job();job.claim();const transport=f.transport(call=>call.method==='POST'?json(response('queued')):json({error:{type:'invalid_request_error',code:'response_expired',message:'Expired '+SECRET,param:'response_id'},debug:SECRET},404));
  await assert.rejects(job.execute(f.args(transport)),/BACKGROUND_RETRIEVAL_HTTP_ERROR/);job.release();f.reopen();job=f.job();job.claim();await assert.rejects(job.execute(f.args(transport,true)),/BACKGROUND_RETRIEVAL_HTTP_ERROR/);job.release();assert.equal(job.state().responseId,ID);assert.equal(job.state().terminal,undefined);assert.deepEqual(f.calls.map(call=>call.method),['POST','GET','GET']);assert(!JSON.stringify(job.state()).includes(SECRET));
 }finally{f.close();}
});

test('completion clock stays fixed and an explicit later resume may inspect the same response once',async()=>{
 const f=fixture();try{
  let job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>json(response('in_progress'))))),/BACKGROUND_COMPLETION_DEADLINE/);job.release();const initial=job.state();assert.equal(f.now,BASE+900000);assert.equal(initial.retrievals,180);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  f.advance(60000);job=f.job();job.claim();const before=f.calls.length;await assert.rejects(job.execute(f.args(f.transport(()=>json(response('in_progress'))),true)),/BACKGROUND_COMPLETION_DEADLINE/);job.release();assert.equal(f.calls.length,before+1,'an explicit late resume permits one bounded same-ID read');assert.equal(job.state().completionDeadlineAt,initial.completionDeadlineAt);
  job=f.job();job.claim();const result=await job.execute(f.args(f.transport(()=>json(response())),true));job.release();assert.equal(result.status,'completed');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(job.state().completionDeadlineAt,initial.completionDeadlineAt);
 }finally{f.close();}
});

test('retrieval cap survives a restart and stops before dispatching an extra GET',async()=>{
 const f=fixture();try{
  const first=f.job({fault:phase=>{if(phase==='identity_persisted')throw Error('fixture identity retained');}});first.claim();await assert.rejects(first.execute(f.args(f.transport(()=>json(response('queued'))))),/fixture identity retained/);first.release();
  // Seed the already-consumed counter as a boundary fixture; these are not
  // claims that 239 provider requests actually occurred in the test.
  const row=first.state();f.store.put('response-job',KEY,{...row,retrievals:239},row._version);f.reopen();const job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>json(response('in_progress'))),true)),/BACKGROUND_RETRIEVAL_CAP/);job.release();assert.equal(job.state().retrievals,240);assert.deepEqual(f.calls.map(call=>call.method),['POST','GET']);
  const again=f.job();again.claim();await assert.rejects(again.execute(f.args(f.transport(()=>assert.fail('retrieval cap must precede transport')),true)),/BACKGROUND_RETRIEVAL_CAP/);again.release();assert.equal(f.calls.length,2);
 }finally{f.close();}
});

test('grant expiry and the 24-hour resume boundary deny further GETs without resetting the original deadlines',async()=>{
 for(const limit of ['grant','resume'] as const){const f=fixture({expiresMs:limit==='grant'?10000:2*86400000});try{
  const first=f.job({fault:phase=>{if(phase==='identity_persisted')throw Error('identity retained for boundary test');}});first.claim();await assert.rejects(first.execute(f.args(f.transport(()=>json(response('queued'))))),/identity retained/);first.release();const original=first.state();assert.equal(original.resumeUntil,new Date(BASE+(limit==='grant'?10000:86400000)).toISOString());
  f.advance(limit==='grant'?10000:86400000);f.reopen();const resumed=f.job();resumed.claim();await assert.rejects(resumed.execute(f.args(f.transport(()=>assert.fail('expired authority/window must precede GET')),true)),new RegExp(limit==='grant'?'BACKGROUND_GRANT_EXPIRED':'BACKGROUND_RESUME_WINDOW_EXPIRED'));resumed.release();assert.equal(f.calls.length,1);assert.equal(resumed.state().completionDeadlineAt,original.completionDeadlineAt);assert.equal(resumed.state().resumeUntil,original.resumeUntil);
 }finally{f.close();}}
});

test('authorization is checked again after each fake polling wait and before the next GET',async()=>{
 const f=fixture();try{
  let checks=0;const job=f.job({authorize:()=>{checks++;if(f.now>=BASE+5000)throw Error('explicit grant revocation fixture');}});job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>json(response('in_progress'))))),/explicit grant revocation/);job.release();assert(checks>1);assert.deepEqual(f.calls.map(call=>call.method),['POST','GET']);assert.equal(job.state().retrievals,1);
 }finally{f.close();}
});

test('another live claimant cannot execute or release the owning claim',async()=>{
 const f=fixture();try{
  const first=f.job(),second=f.job();first.claim();const before=snapshot(f.store);assert.throws(()=>second.claim(),/BACKGROUND_OWNER_ACTIVE/);second.release();assert.equal(snapshot(f.store),before);await assert.rejects(second.execute(f.args(f.transport(()=>assert.fail('non-owner transport')))),/BACKGROUND_OWNER_REQUIRED/);
  first.release();second.claim();assert.notEqual(second.owner,first.owner);await assert.rejects(first.execute(f.args(f.transport(()=>assert.fail('stale owner transport')))),/BACKGROUND_OWNER_REQUIRED/);second.release();assert.equal(f.calls.length,0);
 }finally{f.close();}
});

test('changed bytes or grant bindings and tampered terminal content cannot be consumed or dispatched',async()=>{
 const f=fixture();try{
  const job=f.job();job.claim();const before=snapshot(f.store);await assert.rejects(job.execute({...f.args(f.transport(()=>assert.fail('changed bytes transport'))),bytes:BYTES+' '}),/BACKGROUND_REQUEST_CHANGED/);assert.equal(snapshot(f.store),before);job.release();assert.throws(()=>f.job({grantHash:hash('different grant')}).claim(),/BACKGROUND_BINDING_CHANGED/);assert.throws(()=>f.job({requestHash:hash('different request')}).claim(),/BACKGROUND_BINDING_CHANGED/);
  const valid=f.job();valid.claim();await valid.execute(f.args(f.transport(()=>json(response()))));valid.release();const row=valid.state();f.store.put('response-job',KEY,{...row,terminal:{...row.terminal,status:'failed'}},row._version);
  const resumed=f.job();resumed.claim();await assert.rejects(resumed.execute(f.args(f.transport(()=>assert.fail('tampered terminal transport')),true)),/BACKGROUND_TERMINAL_CHANGED/);resumed.release();assert.equal(f.calls.length,1);
 }finally{f.close();}
});

test('allowlisted diagnostics and terminal fields exclude raw headers, provider messages and unrelated secret-bearing fields',async()=>{
 const f=fixture();try{
  let reads=0;const job=f.job();job.claim();const result=await job.execute(f.args(f.transport(call=>{
   if(call.method==='POST')return json(response('queued',{metadata:{secret:SECRET}}));
   if(++reads===1)return Response.json({error:{type:'server_error',code:'unrecognized-fixture-code',param:SECRET,message:SECRET,extra:SECRET},debug:SECRET},{status:503,headers:{'x-request-id':'req_'+SECRET,'x-debug':SECRET}});
   return json(response('completed',{metadata:{secret:SECRET},error:{message:SECRET},headers:{authorization:SECRET},output:[{type:'reasoning',summary:[{text:SECRET}]},{type:'message',role:SECRET,content:[{type:'output_text',text:'{"decision":"inspect"}',annotations:[{url:SECRET}]},{type:'refusal',refusal:SECRET},{type:'unrecognized',text:SECRET}]}]}));
  })));job.release();assert(!JSON.stringify(job.state()).includes(SECRET));assert(!JSON.stringify(result).includes(SECRET));assert.equal(result.output[1].content[1].refusal,'Provider refusal');assert.deepEqual(result.output[0],{type:'reasoning',content:[]});assert.equal(result.metadata,undefined);assert.equal(result.error,undefined);assert.equal(result.headers,undefined);
  const diagnostic=job.state().events.find((event:any)=>event.phase==='http_error');assert.equal(diagnostic.messageSource,'local_allowlist');assert.equal(diagnostic.providerRequestId,null);assert.equal(diagnostic.providerErrorCode,null);assert.equal(diagnostic.unrecognizedErrorFieldsWithheld,true);
 }finally{f.close();}
});

test('secret-bearing response IDs, invalid statuses and visible terminal output never persist',async()=>{
 for(const variant of ['id','status','output'] as const){const f=fixture();try{
  const body=variant==='id'?response('queued',{id:'resp_'+SECRET}):variant==='status'?response('queued',{status:{untrusted:SECRET}}):response('completed',{output:[{type:'message',content:[{type:'output_text',text:SECRET}]}]});
  const job=f.job();job.claim();await assert.rejects(job.execute(f.args(f.transport(()=>json(body)))));job.release();assert(!JSON.stringify(job.state()).includes(SECRET),variant+' must be checked before persistence');assert.equal(job.state().terminal,undefined);assert.equal(f.calls.length,1);
 }finally{f.close();}}
});

test('terminal result is durable before model-port validation and saved replay skips count and admission',async()=>{
 const request:any={scope:{tenantId:'fixture',businessId:'fixture',runId:'durable',dataPolicyVersion:'v1',mode:'fixture'},requestId:'one',role:{id:'analyst',version:'1',procedure:'Offline transport test only',model:MODEL},task:'decide',context:{fixture:true},tools:[],limits:{maxCost:{minorUnits:10,currency:'USD'},maxAttempts:1,maxHumanMinutes:0}};
 const schema={type:'object',properties:{decision:{type:'string'}},required:['decision'],additionalProperties:false};
 const route:any={authorizationId:'offline-test',model:MODEL,projectId:PROJECT,background:BACKGROUND_POLICY,serviceTier:'default',maxOutputTokens:100,deadlineMs:180000,inputTokenCeiling:1000,maxCallCost:{minorUnits:10,currency:'USD'},pricing:{inputMinorPerMillion:1000,outputMinorPerMillion:2000,source:'Synthetic offline fixture rates',effectiveAt:new Date(BASE).toISOString()}};
 const actual=fixture({bytes:canonical(buildResponsesBody(route,request,schema))});let counts=0,admissions=0,reservations=0,validations=0;
 try{
  const run=async(resume:boolean)=>{const durable=actual.job();durable.claim();try{return await responsesModelPort({route,durable,resume,apiKey:()=>SECRET,budget:{async prepare(){admissions++;},async reserve(){reservations++;},async observed(){},async settle(){},async uncertain(){}},schemaForTask:()=>schema,validateOutput(_task,output){validations++;assert.equal(durable.state().terminalHash,hash(durable.state().terminal));assert.deepEqual(output,{decision:'inspect'});},countInputTokens:()=>{counts++;return 20;},transport:actual.transport(call=>json(response(call.method==='POST'?'queued':'completed')))}).run(request);}finally{durable.release();}};
  assert.equal((await run(false)).output.decision,'inspect');actual.reopen();assert.equal((await run(true)).output.decision,'inspect');assert.equal(validations,2);assert.equal(counts,1);assert.equal(admissions,1);assert.equal(reservations,1);assert.deepEqual(actual.calls.map(call=>call.method),['POST','GET']);
 }finally{actual.close();}
});

for(const phase of ['identity_persisted','terminal_persisted'])test('real child exit at '+phase+' resumes from reopened SQLite with no second POST',{timeout:15000},async()=>{
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'midas-durable-response-child-')),file=join(root,'state.sqlite'),events=join(root,'transport.ndjson');let store:StateStore|undefined;
 try{
  const config={phase,bytes:BYTES,model:MODEL,secret:SECRET,projectId:PROJECT,key:KEY,grantHash:GRANT,now:BASE,expiresAt:new Date(BASE+2*86400000).toISOString(),responseId:ID};
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./durable-responses-child.mjs',import.meta.url)),file,JSON.stringify(config)],{encoding:'utf8',timeout:10000});assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,79,child.stderr||child.stdout);assert(!child.stderr.includes(SECRET));
  const beforeCalls=readFileSync(events,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(beforeCalls.filter(call=>call.method==='POST').length,1);assert.equal(beforeCalls.filter(call=>call.method==='GET').length,phase==='identity_persisted'?0:1);
  store=new StateStore(file);const retained=store.get('response-job',KEY);assert.equal(retained.responseId,ID);assert.equal(retained.createDispatched,true);assert(retained.owner,'the child exited without graceful release');assert.notEqual(retained.ownerPid,process.pid);if(phase==='terminal_persisted')assert.equal(retained.terminalHash,hash(retained.terminal));else assert.equal(retained.terminal,undefined);
  let now=BASE;const job=new DurableResponses({store,key:KEY,requestHash:rawHash(BYTES),grantHash:GRANT,policy:BACKGROUND_POLICY,expiresAt:config.expiresAt,authorize:()=>{},now:()=>now,sleep:async ms=>{now+=ms;}});job.claim();assert.notEqual(job.state().owner,retained.owner);
  const transport=(async(url:any,init:any)=>{assert.equal(init.method,'GET','restart must never create another inference');assert.equal(String(url),ENDPOINT+'/'+ID);appendFileSync(events,JSON.stringify({method:'GET',url:String(url)})+'\n');return json(response());}) as typeof fetch;
  const result=await job.execute({bytes:BYTES,credential:SECRET,projectId:PROJECT,model:MODEL,createDeadlineMs:180000,transport,resume:true});job.release();assert.equal(result.status,'completed');assert.equal(job.state().terminalHash,hash(result));const afterCalls=readFileSync(events,'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(afterCalls.filter(call=>call.method==='POST').length,1);assert.equal(afterCalls.filter(call=>call.method==='GET').length,1);assert(!JSON.stringify(job.state()).includes(SECRET));
 }finally{store?.close();const child=realpathSync(root),part=relative(parent,child);assert(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(child,{recursive:true,force:true});}
});
