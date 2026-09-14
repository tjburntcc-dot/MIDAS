import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { adaptiveOwnerView } from '../src/adaptive/owner-view.ts';
import { PilotService } from '../src/pilot/service.ts';
import { servePilot } from '../src/pilot/server.ts';

test('adaptive owner projection scopes records, escapes content, and preserves stale/unverified provenance after restart', () => {
  const root=mkdtempSync(join(tmpdir(),'adaptive-owner-')), path=join(root,'state.sqlite');let store=new StateStore(path);
  try {
    const hostile='<img src=x onerror="alert(1)">';
    const base={id:'episode',businessId:'company-a',taskId:'task-a',contextHash:'old',objective:hostile,obstacle:'Unsupported format',state:'retained',selectedApproach:'Investigate parser',obstacleEvidence:['receipt-1'],verification:{receiptId:'verified',provenance:'fixture',checks:[{id:'parse',passed:true,evidenceRef:hostile}]},resumeEvidence:'parent-receipt',candidateId:'candidate'};
    store.put('adaptive-capability-episode','episode',base,null);
    store.put('adaptive-capability-episode','foreign',{...base,id:'foreign',businessId:'company-b'},null);
    store.put('adaptive-capability-episode','orphan',{...base,id:'orphan',taskId:'unknown'},null);
    store.put('adaptive-skill-candidate','candidate',{...base,id:'candidate',package:{purpose:'Read export',preconditions:['permitted source']},qualification:'certified',transfer:'passed'},null);
    store.put('adaptive-skill-reuse','reuse',{businessId:'company-a',taskId:'task-a',candidateId:'candidate',contextHash:'old',status:'applicable_candidate',transfer:'passed',reasons:[]},null);
    store.put('adaptive-tool-operation','op',{binding:{businessId:'company-a',taskId:'task-a',contextHash:'old'},status:'completed',action:'command',provenance:'development',payload:{argv:['secret']},result:{ok:false,error:{code:'ISOLATION_UNAVAILABLE'},output:{status:'blocked',secret:'do not expose'}}},null);
    store.put('adaptive-skill-reuse-outcome','reuse-result',{businessId:'company-a',taskId:'task-a',candidateId:'candidate',contextHash:'old',passed:true,provenance:'fixture',evidenceRefs:['later-check']},null);
    const tasks=[{id:'task-a',ventureId:'company-a',adaptiveContextHash:'new',contextCurrent:true,title:'Parent task'}];
    let view=adaptiveOwnerView(store,'company-a',tasks);
    assert.equal(view.episodes.length,1);assert.equal(view.episodes[0].context,'stale');assert.equal(view.episodes[0].verification.provenance,'fixture');
    assert.equal(view.reuseOutcomes[0].provenance,'fixture');assert.equal(view.reuseOutcomes[0].passed,true);assert.match(view.html,/Passed recorded check · fixture/);assert.equal(view.candidates[0].qualification,'unqualified');assert.equal(view.reuse[0].transfer,'unobserved');
    assert.match(view.html,/&lt;img/);assert.doesNotMatch(view.html,/<img/);assert.doesNotMatch(JSON.stringify(view),/do not expose|\["secret"\]/);
    assert.equal(view.operations[0].error,'ISOLATION_UNAVAILABLE');assert.equal(view.operations[0].status,'blocked');assert.equal(view.operations[0].receiptStatus,'completed');assert.equal(view.operations[0].provenance,'development');
    assert.equal(adaptiveOwnerView(store,'company-b',tasks).episodes.length,0);
    assert.equal(adaptiveOwnerView(store,null,tasks).episodes.length,0);
    assert.equal(adaptiveOwnerView(store,'company-a',[{id:'task-a',ventureId:'company-a'}]).episodes[0].context,'unverified');
    store.close();store=new StateStore(path);view=adaptiveOwnerView(store,'company-a',tasks);
    assert.equal(view.episodes[0].resumeEvidence,'parent-receipt');assert.equal(view.episodes[0].context,'stale');
  } finally {store.close();rmSync(root,{recursive:true,force:true});}
});

test('adaptive endpoint uses the existing owner session and validates business identity',async()=>{
  const root=mkdtempSync(join(tmpdir(),'adaptive-owner-http-')),service=new PilotService(root),app=servePilot({service,port:0}),origin=await app.ready;
  try {
    assert.equal((await fetch(origin+'/api/adaptive?businessId=unknown')).status,403);
    const session=await fetch(origin+'/api/session'),cookie=session.headers.get('set-cookie')!.split(';')[0];
    const headers={cookie};
    assert.equal((await fetch(origin+'/api/adaptive?businessId=unknown',{headers})).status,400);
    const state=await (await fetch(origin+'/api/state',{headers})).json() as any;
    assert.deepEqual(state.adaptive.episodes,[]);assert.match(state.adaptive.html,/No capability acquisition/);
    const script=await (await fetch(origin+'/app.js')).text();assert.match(script,/'outcomes','adaptive','work'/);
  }finally{await app.close();service.store.close();rmSync(root,{recursive:true,force:true});}
});

test('owner can prepare a new adaptive assignment without granting or dispatching execution',async()=>{
  const root=mkdtempSync(join(tmpdir(),'adaptive-plan-http-')),service=new PilotService(root),app=servePilot({service,port:0}),origin=await app.ready;
  let modelCalls=0;service.execution.engine.model.run=async()=>{modelCalls++;throw Error('No model dispatch permitted in preparation');};
  try {
    const business=service.knowledge.createCompany({name:'Owner business',goal:'Prepare a useful operating packet'});
    service.knowledge.addSource(business.id,{title:'Permitted process',kind:'text',text:'Owner review is required before any customer reply.',rights:'Owner permitted this source',observedAt:new Date().toISOString()});
    const sessionResponse=await fetch(origin+'/api/session'),cookie=sessionResponse.headers.get('set-cookie')!.split(';')[0],session=await sessionResponse.json() as any;
    const post=async(body:any,csrf=session.csrf)=>{const response=await fetch(origin+'/api/adaptive/plan',{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});return {status:response.status,body:await response.json() as any};};
    const request={businessId:business.id,workflow:'response-packet',job:{title:'Complete operating packet',outcome:'Resolve evidence gaps and prepare useful local work',details:'Retain source support and owner review obligations.'},adaptive:{prompt:'lean',allowCommands:true,modelCalls:24,localToolRuns:64}};
    assert.equal((await post(request,'wrong')).status,403);
    assert.equal((await post({...request,businessId:'unknown'})).status,400);
    assert.equal((await post({...request,adaptive:{...request.adaptive,modelCalls:65}})).status,400);
    assert.equal(service.execution.tasks(business.id).length,0);
    const prepared=await post(request);assert.equal(prepared.status,200,JSON.stringify(prepared.body));
    const task=prepared.body.result;assert.equal(task.status,'queued');assert.equal(task.ventureId,business.id);assert.equal(task.resource.modelCalls,24);assert.equal(task.resource.localToolRuns,64);
    assert.equal(task.inputs.adaptiveExecution.prompt,'lean');assert.equal(task.inputs.adaptiveExecution.allowCommands,true);assert.equal(task.inputs.requiresGrant,true);
    assert.equal(prepared.body.view.authority.liveEnabled,false);assert.equal(modelCalls,0);
    const another=await post({...request,taskId:task.id,job:{...request.job,title:'A second new assignment'}});
    assert.equal(another.status,200);assert.notEqual(another.body.result.id,task.id);assert.equal(service.execution.portfolio.getTask(task.id).title,'Complete operating packet');assert.equal(modelCalls,0);
  }finally{await app.close();service.store.close();rmSync(root,{recursive:true,force:true});}
});
