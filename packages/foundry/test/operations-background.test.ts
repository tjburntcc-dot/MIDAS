import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {OperatingModels} from '../src/operations/model.ts';
import {createPortfolioProposal} from '../src/portfolio/live.ts';
import {makeWorkerRequest,workerPrincipal} from '../src/portfolio/worker.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {hash} from '../src/contracts.ts';

function fixture(fault:'none'|'post_loss'|'read_loss'|'incomplete'|'wrong_output'='none'){
 const root=mkdtempSync(join(tmpdir(),'midas-background-ledger-')),store=new StateStore(join(root,'state.sqlite')),keys=keypair();
 const proposal=createPortfolioProposal({root,id:'portfolio-031-background-fixture',mode:'mock',background:true,projectId:'proj_OFFLINE',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:400,ventures:[{id:'business',goal:'A bounded test',capabilities:['portfolio.plan'],tools:[],workCalls:3,searchCalls:0}]});
 const grant={...proposal.operating,approvedBy:'ephemeral-fixture',approvalReference:'Offline transport test only'};
 let counts=0,creates=0,reads=0,lose=fault==='read_loss';
 const terminal=()=>({id:'resp_test_saved',model:grant.route.model,status:fault==='incomplete'?'incomplete':'completed',service_tier:'default',background:true,store:true,usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({decision:fault==='wrong_output'?'bad':'stop'})}]}]});
 const transport=(async(url:any,init:any)=>{
  if(String(url)==='https://api.openai.com/v1/responses/input_tokens'){counts++;const body=JSON.parse(init.body);assert(!('background'in body));assert(!('store'in body));return Response.json({object:'response.input_tokens',input_tokens:100});}
  if(String(url)==='https://api.openai.com/v1/responses'&&init.method==='POST'){creates++;const body=JSON.parse(init.body);assert.equal(body.store,true);assert.equal(body.background,true);assert.equal(body.reasoning.effort,'max');if(fault==='post_loss')throw Error('mock connection lost');return Response.json({...terminal(),status:'queued',usage:null,output:[]});}
  assert.equal(String(url),'https://api.openai.com/v1/responses/resp_test_saved');assert.equal(init.method,'GET');assert.equal(init.body,undefined);reads++;if(lose)return Response.json({error:{message:'not retained',code:'not_found'}},{status:404});return Response.json(terminal());
 }) as typeof fetch;
 const make=()=>new OperatingModels({root,store,envelope:signed(grant,keys.privateKey),trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}});
 const request=makeWorkerRequest({ventureId:'business',taskId:'business/test',attemptId:'attempt-1',tools:[],context:{authorized:'synthetic'},maxMinor:123}),schema={type:'object',additionalProperties:false,required:['decision'],properties:{decision:{type:'string'}}};
 const invocation={businessId:'business',goalHash:hash('A bounded test'),sourceHosts:[],attemptId:request.requestId,stage:'portfolio-work',request,schema,validate:(o:any)=>assert.equal(o.decision,'stop')};
 return {store,make,invocation,principal:workerPrincipal('business'),stats:()=>({counts,creates,reads}),heal:()=>{lose=false;}};
}
test('background completion uses one durable admission/count/create and charges usage once',async()=>{
 const f=fixture();try{const m=f.make(),a=await m.invoke(f.principal,f.invocation);assert.equal(a.output.decision,'stop');assert.equal(m.totals().callsUsed,1);assert.equal(m.totals().retainedMinor,523);assert.equal(m.totals().provisionalMinor,1);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:1});const again=await f.make().invoke(f.principal,f.invocation);assert.deepEqual(again,a);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:1});}finally{f.store.close();}
});
test('lost initial acknowledgement remains unknown; later invocation cannot recount or recreate',async()=>{
 const f=fixture('post_loss');try{const m=f.make();await assert.rejects(m.invoke(f.principal,f.invocation),/BACKGROUND_CREATE_UNKNOWN/);const original=m.ledger.get('attempt-1');assert.equal(original.reservation,123);assert.equal(original.cost.status,'unknown');await assert.rejects(f.make().invoke(f.principal,f.invocation),/BACKGROUND_UNKNOWN_NO_RESUBMIT/);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:0});assert.equal(m.totals().retainedMinor,523);}finally{f.store.close();}
});
test('an unresolved background operation blocks competing new admissions even after local failure',async()=>{
 const f=fixture('post_loss');try{const m=f.make();await assert.rejects(m.invoke(f.principal,f.invocation),/BACKGROUND_CREATE_UNKNOWN/);const second={...f.invocation,attemptId:'attempt-2',request:{...f.invocation.request,requestId:'attempt-2'}};await assert.rejects(m.invoke(f.principal,second),/CONCURRENCY_CAP/);assert.equal(m.ledger.rows().length,1);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:0});assert.equal(m.ledger.get('attempt-1').reservation,123);}finally{f.store.close();}
});
test('readback loss resumes same response in a new model instance with no new admission',async()=>{
 const f=fixture('read_loss');try{const m=f.make();await assert.rejects(m.invoke(f.principal,f.invocation),/BACKGROUND_RETRIEVAL_HTTP_ERROR/);assert.equal(m.ledger.get('attempt-1').cost.status,'unknown');f.heal();const out=await f.make().invoke(f.principal,f.invocation);assert.equal(out.output.decision,'stop');const row=m.ledger.get('attempt-1');assert.equal(row.errorCode,null);assert.equal(row.reconciliations.length,1);assert.equal(row.reservation,123);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:2});}finally{f.store.close();}
});
test('terminal output persists before local processing interruption and restarts without any network',async()=>{
 const f=fixture();try{const m=f.make();m.afterResponsePersisted=()=>{throw Object.assign(Error('simulated process boundary'),{simulatedCrash:true});};await assert.rejects(m.invoke(f.principal,f.invocation));const before=f.stats();assert.equal(m.ledger.get('attempt-1').finishedAt,undefined);const out=await f.make().invoke(f.principal,f.invocation);assert.equal(out.output.decision,'stop');assert.deepEqual(f.stats(),before);assert.equal(m.ledger.get('attempt-1').status,'output_available');}finally{f.store.close();}
});
test('incomplete or invalid answers retain their usage and cannot become semantic success',async()=>{
 for(const fault of ['incomplete','wrong_output'] as const){const f=fixture(fault);try{const m=f.make();await assert.rejects(m.invoke(f.principal,f.invocation));const r=m.ledger.get('attempt-1');assert.equal(r.cost.status,'provisional');assert.equal(r.result,null);assert.equal(r.reservation,123);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:1});await assert.rejects(f.make().invoke(f.principal,f.invocation));assert.deepEqual(f.stats(),{counts:1,creates:1,reads:1});}finally{f.store.close();}}
});
