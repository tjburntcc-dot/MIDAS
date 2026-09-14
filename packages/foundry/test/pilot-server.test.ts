import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PilotService } from '../src/pilot/service.ts';
import { servePilot } from '../src/pilot/server.ts';
import { backupPilot, restorePilot } from '../src/pilot/continuity.ts';

async function client(origin: string) {
  const response = await fetch(origin + '/api/session'), session = await response.json() as any;
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  return { cookie, async get(path: string) { const res = await fetch(origin + path, {headers:{cookie}}); return {status:res.status, body:await res.json() as any}; },
    async post(path: string, body: any, extra: Record<string,string> = {}) { const res = await fetch(origin + path, {method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':session.csrf,...extra},body:JSON.stringify(body)}); return {status:res.status,body:await res.json() as any}; } };
}
test('owner HTTP journey preserves real empty onboarding, scoped fixture execution, correction, acceptance, adaptation and restart', async () => {
  const root=mkdtempSync(join(tmpdir(),'pilot-api-')), service=new PilotService(root), app=servePilot({service,port:0}), origin=await app.ready;
  let closed=false;
  try {
    const c=await client(origin), initial=await c.get('/api/state'); assert.equal(initial.body.business,null); assert.equal(initial.body.businesses.length,0);
    const denied=await c.post('/api/business',{name:'Denied',goal:'Denied'},{'x-csrf-token':'wrong'}); assert.equal(denied.status,403);
    const create=await c.post('/api/business',{name:'Owner company awaiting facts',website:'https://example.test',goal:'Identify the most useful first assignment',notes:'No customers, prices or domain expertise supplied.'}); assert.equal(create.status,200);
    const ownerId=create.body.view.business.id; assert.equal(create.body.view.business.mode,'owner');
    assert.equal((await c.post('/api/business/update',{businessId:ownerId,name:'Owner company, renamed'})).status,200);
    const diagnose=await c.post('/api/diagnose',{businessId:ownerId}); assert.equal(diagnose.status,200); assert.equal(diagnose.body.result.status,'exact_model_grant_required'); assert.equal(diagnose.body.result.actualModelCalls,0);
    assert.equal(diagnose.body.view.understanding.claims.length,0);
    const demo=await c.post('/api/demo',{}); assert.equal(demo.status,200); const businessId=demo.body.view.business.id; assert.notEqual(ownerId,businessId);
    const understanding=await c.post('/api/diagnose',{businessId}); assert.equal(understanding.status,200); assert.equal(understanding.body.view.understanding.completeness,'partial'); assert.equal(understanding.body.view.understanding.hypotheses.length,2);
    const planned=await c.post('/api/plan',{businessId,workflow:'response-packet'}); assert.equal(planned.status,200); const taskId=planned.body.result.id;
    assert.equal((await c.post('/api/run',{businessId:ownerId,taskId})).status,403);
    assert.equal((await c.post('/api/pause',{businessId,taskId})).status,200);
    assert.equal((await c.post('/api/resume',{businessId,taskId})).status,202); await service.settle();
    let view=(await c.get('/api/state?businessId='+businessId)).body, task=view.tasks.find((t:any)=>t.id===taskId); assert.equal(task.status,'completed',JSON.stringify(task));
    const originalHash=task.artifact.hash; assert.equal(task.artifact.current,true); assert.ok(task.artifact.checks.every((x:any)=>x.passed));
    const pendingCorrection=service.execution.correct({businessId,taskId,artifactHash:originalHash,instruction:'Inspect the source before changing the response.'});
    assert.equal(pendingCorrection.status,'queued');
    assert.throws(()=>service.bindArtifact(businessId,pendingCorrection.id,originalHash),/TASK_COMPLETION_REQUIRED/);
    service.execution.portfolio.controlTask(pendingCorrection.id,'cancel');
    const review=await c.post('/api/review/start',{businessId,taskId}); assert.equal(review.status,200);
    const approved=await c.post('/api/approve',{businessId,taskId,artifactHash:originalHash,assisted:true,reviewSessionId:review.body.reviewSessionId}); assert.equal(approved.status,200); assert.equal(approved.body.result.timing.independentSeconds,null);
    const correctionReview=await c.post('/api/review/start',{businessId,taskId});
    assert.equal((await c.post('/api/correct',{businessId,taskId,artifactHash:originalHash,instruction:'fix',assisted:true,reviewSessionId:correctionReview.body.reviewSessionId})).status,400);
    assert.equal(service.store.get('pilot-review',correctionReview.body.reviewSessionId).endedAt,null);
    const corrected=await c.post('/api/correct',{businessId,taskId,artifactHash:originalHash,instruction:'Prepare an item description and dimensions before requesting a human inspection.',assisted:true}); assert.equal(corrected.status,202,JSON.stringify(corrected.body)); await service.settle();
    const newTaskId=corrected.body.result.id; view=(await c.get('/api/state?businessId='+businessId)).body;
    const newTask=view.tasks.find((t:any)=>t.id===newTaskId); assert.equal(newTask.status,'completed',JSON.stringify(newTask)); assert.notEqual(newTask.artifact.hash,originalHash);
    assert.equal(view.tasks.find((t:any)=>t.id===taskId).acceptance.current,false);
    assert.notEqual((await c.post('/api/approve',{businessId,taskId,artifactHash:originalHash,assisted:true})).status,200);
    const outcome=await c.post('/api/outcome',{businessId,taskId:newTaskId,artifactHash:newTask.artifact.hash,kind:'not-useful',notes:'Synthetic test observation: the selected deliverable did not address the requested next decision.',assisted:true}); assert.equal(outcome.status,200); assert.match(outcome.body.view.understanding.nextAction,/Revisit/);
    const learning=await c.post('/api/learning',{businessId,taskId}); assert.equal(learning.status,200,JSON.stringify(learning.body)); assert.equal(learning.body.result.decision,'retain_baseline');
    assert.equal(learning.body.view.accounting.providerCalls,0); assert.equal(learning.body.view.accounting.independentCorrectionSeconds,null);
    const ownerView=(await c.get('/api/state?businessId='+ownerId)).body; assert.equal(ownerView.tasks.length,0); assert.equal(ownerView.outcomes.length,0);
    const original=service.store.records({id:'test',tenantId:'mason',businessId,permissions:['read']},{tenantId:'mason',businessId,runId:'portfolio-v1',dataPolicyVersion:'portfolio-local-v1',mode:'fixture'}); assert.ok(original.length>0);
    const backupDir=join(root,'backup'), manifest=backupPilot(service.store,backupDir); const target=join(root,'restored'); restorePilot(backupDir,target,manifest.sha256);
    await app.close(); service.store.close(); closed=true;
    const restored=new PilotService(target); try { const persisted=restored.view(businessId); assert.equal(persisted.outcomes.length,1); assert.equal(persisted.tasks.length,3); assert.equal(persisted.learning[0].decision,'retain_baseline'); assert.equal(persisted.tasks.find((t:any)=>t.id===newTaskId).artifact.hash,newTask.artifact.hash); } finally {restored.store.close();}
  } finally { if(!closed){await app.close();service.store.close();} }
});

test('local authority refuses live CLI flags and source scope cannot become a fixture grant',async()=>{
  const root=mkdtempSync(join(tmpdir(),'pilot-authority-')),service=new PilotService(root),app=servePilot({service,port:0}),origin=await app.ready;
  try { const c=await client(origin); const created=await c.post('/api/business',{name:'Actual owner',goal:'Prepare a scoped packet',mode:'fixture'});const businessId=created.body.view.business.id;assert.equal(created.body.view.business.mode,'owner');
    await c.post('/api/source',{businessId,title:'Permitted owner note',text:'This company has not supplied prices or permission to contact customers.',kind:'text',rights:'owner supplied for local preparation',observedAt:new Date().toISOString()});
    const planned=await c.post('/api/plan',{businessId,workflow:'response-packet'});assert.equal(planned.status,200,JSON.stringify(planned.body));
    const denied=await c.post('/api/run',{businessId,taskId:planned.body.result.id});assert.equal(denied.status,403);assert.match(denied.body.error,/GRANT/);
    assert.equal(service.store.db.prepare("SELECT count(*) AS n FROM entities WHERE kind='portfolio-attempt'").get()!.n,0);
    assert.throws(()=>restorePilot(join(root,'missing'),join(root,'target'),'not-a-hash'),/RESTORE_HASH_REQUIRED/);
  } finally {await app.close();service.store.close();}
});

test('orphaned diagnosis accounting is unavailable in owner view, never zero spending',()=>{
  const service=new PilotService(mkdtempSync(join(tmpdir(),'pilot-cost-view-')));
  try {
    service.store.transaction(()=>service.store.put('experiment-account','preserved-diagnosis-account',{
      authorizationHash:'historical-signature-unavailable',limits:{allocations:[{metadataKey:'stage',value:'pilot-diagnosis'}]}
    },null));
    const accounting=service.view().accounting;
    assert.equal(accounting.providerCalls,null);assert.equal(accounting.providerCostMinor,null);
    assert.equal(accounting.retainedExposureMinor,null);assert.equal(accounting.ledgerStatus,'unavailable');
  }finally{service.store.close();}
});

test('approved resume clears the persisted pause before its scoped runner and new commercial artifacts become stale after evidence change',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pilot-resume-contract-')),service=new PilotService(root),app=servePilot({service,port:0}),origin=await app.ready;
 try{
  const c=await client(origin),company=service.knowledge.createCompany({name:'Local routing fixture',goal:'Verify resume routing only',notes:'Development fixture; no provider permission or transport.'}),task=service.plan(company.id,'response-packet');
  service.execution.pause(company.id,task.id);let routed=0;
  // Metadata/control seam only: signed binding is separately exercised by the mock transport suite.
  service.authority=()=>({approved:true,current:true,liveEnabled:true,mode:'live',businessId:company.id,expiresAt:new Date(Date.now()+60000).toISOString(),reason:'Explicit local routing test',sameIdRecoveryAvailable:false,credentialRead:false,providerRequests:0});
  service.runApprovedWork=async(id,taskId)=>{assert.equal(id,company.id);assert.equal(taskId,task.id);assert.notEqual(service.task(id,taskId).status,'paused');routed++;return service.task(id,taskId);};
  assert.equal((await c.post('/api/resume',{businessId:company.id,taskId:task.id})).status,202);await service.settle();assert.equal(routed,1);
  const demo=await service.createCommercialDemo('service'),selected=service.intelligence.select(demo.id,'clarify-first-step');await service.execution.run(demo.id,selected.task.id);
  const artifact=service.currentArtifact(demo.id,selected.task.id);assert.equal(service.view(demo.id).tasks.find((t:any)=>t.id===selected.task.id).contextCurrent,true);
  service.knowledge.updateCompany(demo.id,{notes:'Changed operating constraint after the old deliverable was checked.'});
  assert.equal(service.view(demo.id).tasks.find((t:any)=>t.id===selected.task.id).contextCurrent,false);
  assert.throws(()=>service.bindArtifact(demo.id,selected.task.id,artifact.hash),/OWNER_CONTEXT_CHANGED/);
  assert.equal(service.store.db.prepare("SELECT count(*) AS n FROM entities WHERE kind='model-attempt'").get()!.n,0);
 }finally{await app.close();service.store.close();}
});
