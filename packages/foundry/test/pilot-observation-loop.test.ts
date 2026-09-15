import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PilotService} from '../src/pilot/service.ts';
import {boundObservationContext,type BusinessObservationInput} from '../src/pilot/observation-loop.ts';
import {mockResult} from '../src/portfolio/worker.ts';

function setup(){const root=mkdtempSync(join(tmpdir(),'midas-observation-')),service=new PilotService(root),company=service.knowledge.createCompany({name:'Example repair service',goal:'Reduce incomplete intake without making unsupported promises.',mode:'fixture'});return {root,service,company};}
function input(patch:Partial<BusinessObservationInput>={}):BusinessObservationInput{return {idempotencyKey:'first-observation',taskId:null,artifactHash:null,sourceIds:[],kind:'owner_statement',result:'not_useful',notes:'The prepared checklist did not explain which details are mandatory.',observedAt:'2026-09-01T12:00:00Z',measurement:null,assisted:true,...patch};}
function plan(source:any,observations:any[],decision='prepare'){const challenged=observations.some(o=>o.result==='not_useful');return {decision,rationale:challenged?'The reported failure challenges the prior work; inspect requirements before a further intervention.':'Prepare bounded clarification.',strongestAlternative:'Leave the current workflow unchanged until actual customer evidence is available.',blockingConditions:[],evidenceRefs:[{sourceId:source.id,quote:source.text}],tasks:decision==='prepare'?[{id:'clarify-evidence',family:'response-packet',title:challenged?'Reassess the failed workflow':'Clarify the workflow',outcome:'Prepare a useful supported diagnosis and next decision',details:'Distinguish owner assertions from actual outcomes and test the strongest alternative.',dependsOn:[],sourceIds:[source.id],competencies:['evidence-grounded-work'],reasonForWorker:'One bounded evidence reviewer is sufficient.',calls:5}]:[],successEvidence:['Source-grounded reassessment with explicit unknowns.'],limitsOfInference:'Fixture choices verify mechanics only.'};}

test('a new observation creates executable successor planning with actual evidence and preserves unrelated current work',async()=>{
 const x=setup();try{const original=x.service.plan(x.company.id,'response-packet');await x.service.execution.run(x.company.id,original.id);const artifact=x.service.execution.artifact(x.company.id,original.id),companyBefore=x.service.knowledge.company(x.company.id),contextBefore=x.service.intelligence.contextHash(x.company.id);
 const observed=x.service.recordBusinessObservation(x.company.id,input({taskId:original.id,artifactHash:artifact!.hash}));assert.equal(observed.decision.state,'awaiting_authority');assert.equal(x.service.observationLoop.view(x.company.id).decisions[0].state,'needs_authority');
 assert.equal(x.service.knowledge.company(x.company.id).version,companyBefore.version);assert.equal(x.service.intelligence.contextHash(x.company.id),contextBefore);assert.doesNotThrow(()=>x.service.execution.assertContextCurrent(original.id));
 const next=observed.decision.outcomeId,prepared=x.service.operatingOutcomes.prepare(next);assert.equal(prepared.context.observedResults[0].notes,input().notes);assert.equal(prepared.context.observedResults[0].interpretation,null);
 const source=x.service.knowledge.selectedSources(x.company.id)[0];await x.service.operatingOutcomes.propose(next,{kind:'fixture',run:request=>mockResult(plan(source,(request.context as any).observedResults))});const done=await x.service.operatingOutcomes.runOffline(next);assert.equal(done.state,'completed');assert.equal(done.graph[0].title,'Reassess the failed workflow');assert.equal(x.service.execution.portfolio.getTask(done.graph[0].taskId).inputs.outcomeObservations[0].id,observed.id);assert.equal(x.service.observationLoop.view(x.company.id).decisions[0].state,'completed');assert.equal(x.service.view(x.company.id).accounting.providerCalls,0);
 }finally{x.service.store.close();}
});

test('observations and successor creation are idempotent across process restart and interrupted linkage',()=>{
 const x=setup(),first=x.service.recordBusinessObservation(x.company.id,input());assert.equal(x.service.recordBusinessObservation(x.company.id,input()).id,first.id);assert.throws(()=>x.service.recordBusinessObservation(x.company.id,input({notes:'Different content under the same submission key.'})),/IDEMPOTENCY_CONFLICT/);
 const decision=x.service.store.get('pilot-next-decision',first.decision.id);x.service.store.transaction(()=>x.service.store.put('pilot-next-decision',decision.id,{...decision,state:'preparing',outcomeId:null},decision._version));x.service.store.close();
 const restarted=new PilotService(x.root);try{const recovered=restarted.observationLoop.recover(x.company.id);assert.equal(recovered.observations.length,1);assert.equal(recovered.decisions.length,1);assert.equal(recovered.decisions[0].outcomeId,first.decision.outcomeId);assert.equal(restarted.operatingOutcomes.list(x.company.id).length,1);}finally{restarted.store.close();}
});

test('pending feedback creates no work and a later observation supersedes the wait without repeated polling',()=>{
 const x=setup();try{const pending=x.service.recordBusinessObservation(x.company.id,input({kind:'pending_feedback',result:'pending',notes:'Awaiting the consenting operator workflow observation.'}));assert.equal(pending.decision.outcomeId,null);assert.equal(pending.decision.state,'awaiting_feedback');assert.equal(x.service.operatingOutcomes.list(x.company.id).length,0);
 const next=x.service.recordBusinessObservation(x.company.id,input({idempotencyKey:'feedback-arrived',supersedesId:pending.id}));assert.ok(next.decision.outcomeId);assert.equal(x.service.observationLoop.view(x.company.id).decisions[0].state,'superseded');
 }finally{x.service.store.close();}
});

test('measured values, unchecked instruments and causal uncertainty remain distinct',()=>{
 const x=setup();try{const measurement={name:'Complete inquiry count',unit:'inquiries',baseline:5,value:7,sampleSize:12,windowStart:'2026-08-01T00:00:00Z',windowEnd:'2026-09-01T00:00:00Z',instrumentation:'checked' as const,comparison:'before_after' as const};
 const observed=x.service.recordBusinessObservation(x.company.id,input({kind:'measurement',result:'improved',measurement}));assert.equal(observed.interpretation.delta,2);assert.equal(observed.interpretation.causalAttribution,'not established');assert.match(observed.decision.reason,/economics and operating capacity/);
 assert.throws(()=>x.service.recordBusinessObservation(x.company.id,input({idempotencyKey:'unchecked',kind:'measurement',result:'improved',measurement:{...measurement,instrumentation:'unchecked'}})),/INSTRUMENTATION_INCONCLUSIVE/);
 const uncertain=x.service.recordBusinessObservation(x.company.id,input({idempotencyKey:'unchecked-inconclusive',kind:'measurement',result:'inconclusive',measurement:{...measurement,instrumentation:'unchecked'}}));assert.equal(uncertain.result,'inconclusive');
 assert.throws(()=>x.service.recordBusinessObservation(x.company.id,input({idempotencyKey:'bad-value',kind:'measurement',measurement:{...measurement,value:Infinity}})),/MEASUREMENT_VALUE/);
 }finally{x.service.store.close();}
});

test('owner rejection cancels only the successor and a planner rejection does not create tasks',async()=>{
 const x=setup();try{const observed=x.service.recordBusinessObservation(x.company.id,input()),decision=x.service.observationLoop.reject(x.company.id,observed.decision.id,'The measured workflow is no longer in scope.');assert.equal(decision.state,'rejected');assert.equal(x.service.operatingOutcomes.get(decision.outcomeId).state,'cancelled');assert.equal(x.service.observationLoop.reject(x.company.id,decision.id,'The measured workflow is no longer in scope.').id,decision.id);
 const second=x.service.recordBusinessObservation(x.company.id,input({idempotencyKey:'second'})),source=x.service.knowledge.selectedSources(x.company.id)[0];await x.service.operatingOutcomes.propose(second.decision.outcomeId,{kind:'fixture',run:()=>mockResult(plan(source,[],'reject'))});assert.equal(x.service.observationLoop.view(x.company.id).decisions[1].state,'planner_rejected');assert.deepEqual(x.service.operatingOutcomes.get(second.decision.outcomeId).taskIds,[]);
 }finally{x.service.store.close();}
});

test('cross-business data, revoked sources and withdrawn observation context cannot reach a future worker',()=>{
 const x=setup();try{const source=x.service.knowledge.selectedSources(x.company.id)[0],other=x.service.knowledge.createCompany({name:'Other business',goal:'Keep business contexts isolated.',mode:'fixture'});
 assert.throws(()=>x.service.recordBusinessObservation(other.id,input({sourceIds:[source.id]})),/SOURCE_SCOPE/);
 const observed=x.service.recordBusinessObservation(x.company.id,input({sourceIds:[source.id]}));assert.throws(()=>boundObservationContext(x.service.store,other.id,[observed.id]),/BUSINESS_SCOPE/);
 x.service.knowledge.selectEvidence(x.company.id,[]);assert.throws(()=>x.service.operatingOutcomes.prepare(observed.decision.outcomeId),/SOURCE_REVOKED/);assert.equal(x.service.observationLoop.view(x.company.id).decisions[0].state,'blocked_source_permission');
 const uncited=x.service.recordBusinessObservation(x.company.id,input({idempotencyKey:'withdraw'}));x.service.observationLoop.withdraw(x.company.id,uncited.id,'Withdraw this owner statement from future work.');assert.throws(()=>boundObservationContext(x.service.store,x.company.id,[uncited.id]),/WITHDRAWN/);assert.equal(x.service.store.get('pilot-business-observation',uncited.id).notes,input().notes);
 }finally{x.service.store.close();}
});
