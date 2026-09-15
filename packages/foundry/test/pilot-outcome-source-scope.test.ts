import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotOutcomes} from '../src/pilot/outcomes.ts';
import {mockResult} from '../src/portfolio/worker.ts';

function setup(){const root=mkdtempSync(join(tmpdir(),'outcome-source-scope-')),store=new StateStore(join(root,'state.sqlite')),knowledge=new PilotKnowledge(store),business=knowledge.createCompany({name:'Selected evidence fixture',goal:'Prepare a local operating response',mode:'fixture'});const add=(title:string,text:string)=>knowledge.addSource(business.id,{title,text,kind:'text',rights:'Synthetic development fixture',observedAt:new Date().toISOString()});const needed=add('Required operating rule','The service requires owner review before pricing. No customer result is verified.'),large=add('Unrelated long reference','A separate hypothetical reference. '.repeat(280)),execution=new PilotExecution(store,{root}),outcomes=new PilotOutcomes(store,execution);let workerCalls=0;const run=execution.engine.model.run.bind(execution.engine.model);execution.engine.model.run=async call=>{workerCalls++;return run(call);};return {root,store,knowledge,business,needed,large,execution,outcomes,get workerCalls(){return workerCalls;},close(){store.close();rmSync(root,{recursive:true,force:true});}};}
const planner=(source:any)=>({decision:'prepare',rationale:'Prepare a bounded response from the selected operating rule.',strongestAlternative:'Keep the existing process when no useful change is supported.',blockingConditions:[],evidenceRefs:[{sourceId:source.id,quote:source.text.slice(0,2000)}],tasks:[{id:'packet',family:'response-packet',title:'Operating response',outcome:'Prepare a checked local response',details:'Keep source support and owner review explicit.',dependsOn:[],sourceIds:[source.id],competencies:['evidence-grounded-work'],reasonForWorker:'A generalist has the required writing tools.',calls:4}],successEvidence:['Current local checks and source references'],limitsOfInference:'Development fixture, not model competence'});
const mandate=(f:ReturnType<typeof setup>)=>f.outcomes.create(f.business.id,{objective:f.business.goal,autonomy:'prepare_supported_work',allowedFamilies:['response-packet'],maxCalls:12,repairReserve:4});

test('outcome response packet excludes a nonrequired 9KB source and completes from exact permitted evidence',async()=>{
 const f=setup();try{assert(Buffer.byteLength(f.large.text)>9000);assert.equal(f.outcomes.intelligence.executionSources(f.business.id,[f.needed.id]).length,3,'Historical default selection keeps its original larger bounds');const outcome=mandate(f);await f.outcomes.propose(outcome.id,{kind:'fixture',run:()=>mockResult(planner(f.needed))});const done=await f.outcomes.runOffline(outcome.id);assert.equal(done.state,'completed',JSON.stringify(done));const task=f.execution.portfolio.getTask(done.graph[0].taskId),sources=f.execution.evidence.forTask(task);assert.equal(sources.length,2);assert.equal(sources[0].text,f.needed.text);assert(!sources.some(s=>s.text===f.large.text));assert(f.workerCalls>0);assert.equal(f.knowledge.selectedSources(f.business.id).length,3,'Owner evidence is not removed or rewritten');assert.equal(f.outcomes.materialize(outcome.id).taskIds.length,1);
  f.knowledge.selectEvidence(f.business.id,[f.large.id]);assert.throws(()=>f.execution.assertContextCurrent(task.id),/OWNER_CONTEXT_CHANGED/);
 }finally{f.close();}
});

test('required oversized evidence blocks before worker dispatch rather than being silently omitted',async()=>{
 const f=setup();try{const outcome=mandate(f);await f.outcomes.propose(outcome.id,{kind:'fixture',run:()=>mockResult(planner(f.large))});assert.throws(()=>f.outcomes.materialize(outcome.id),/INTELLIGENCE_REQUIRED_EVIDENCE_NEEDS_BOUNDED_EXCERPT/);assert.equal(f.workerCalls,0);assert.deepEqual(f.outcomes.get(outcome.id).taskIds,[]);assert.equal(f.outcomes.get(outcome.id).graph[0].sourceIds[0],f.large.id);assert.equal(f.knowledge.selectedSources(f.business.id).length,3);
 }finally{f.close();}
});

test('selected scope is explicit, exact and cannot bypass default direct-plan or required-source binding',()=>{
 const f=setup();try{const request={business:f.business,sources:[f.needed],workflow:'response-packet' as const,job:{title:'Selected response',outcome:'Prepare local reviewed work',details:'Retain the original operating rule.'},requiredSourceIds:[f.needed.id]};assert.throws(()=>f.execution.plan(request),/PILOT_PLAN_CONTEXT_CHANGED/);assert.throws(()=>f.execution.plan({...request,selectedEvidence:true,sources:[{...f.needed,text:'Changed without a permitted source version.'}]}),/PILOT_PLAN_CONTEXT_CHANGED/);assert.throws(()=>f.execution.plan({...request,selectedEvidence:true,requiredSourceIds:[f.large.id]}),/PILOT_SELECTED_EVIDENCE_SCOPE/);assert.equal(f.execution.tasks(f.business.id).length,0);
 }finally{f.close();}
});
