import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {keypair} from '../src/experiment/config.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotOutcomes} from '../src/pilot/outcomes.ts';
import {PilotIntelligence} from '../src/pilot/intelligence.ts';
import {PilotDiscovery} from '../src/pilot/discovery.ts';
import {commercialCases,fixtureCommercialOutput} from '../src/pilot/intelligence-fixtures.ts';
import {fixturePilotWorker} from '../src/pilot/fixtures-execution.ts';
import {fixtureProjectWorker} from '../src/pilot/fixtures-project.ts';
import {rawHash} from '../src/contracts.ts';
import {mockResult} from '../src/portfolio/worker.ts';
import {prepareOutcomeJourneyAuthorization,signOutcomeJourneyProposal,loadAuthorizedOutcomeJourney} from '../src/pilot/outcome-journey-authorized.ts';

async function fixtureJourneyWorker(call:any){
 const c=call.request.context,w=c.workspace;
 if(w?.inputs?.profile!=='functional-project-v1'||!c.task.inputs.ownerCorrection)return fixtureProjectWorker(fixturePilotWorker()).run(call);
 const source=w.currentSource.find((s:any)=>s.path==='public/index.html'),note='<p class="owner-review">Owner review is required before any price discussion.</p>';
 if(!source.content.includes(note))return mockResult({action:'tool',reason:'Explicit development fixture makes one targeted owner-review correction.',toolCall:{name:'workspace.replace',arguments:{path:source.path,content:source.content.replace('</header>',note+'</header>'),expectedHash:rawHash(source.content),query:null,url:null}}});
 const checked=c.observations.findLast((o:any)=>o.tool==='check.run'&&o.result?.manifest?.sha256===w.manifest.sha256);
 if(!checked)return mockResult({action:'tool',reason:'Run actual local browser checks on this exact correction.',toolCall:{name:'check.run',arguments:{path:null,content:null,expectedHash:null,query:null,url:null}}});
 return mockResult({action:checked.result.ok?'complete':'blocked',reason:checked.result.ok?'Fixture reviewed actual checks for the current correction; no model competence or customer result is claimed.':'Actual project checks failed; preserve the defect.',toolCall:null});
}

function outcome(source:any,decision:'prepare'|'reject'='prepare',family:'response-packet'|'functional-project'='response-packet'){
 return {decision,rationale:decision==='prepare'?'Prepare one locally reviewable source-grounded packet.':'Evidence does not justify local work.',strongestAlternative:'Ask the owner for a current priority and private economics.',blockingConditions:[],evidenceRefs:[{sourceId:source.id,quote:source.text}],tasks:decision==='prepare'?[{id:'packet',family,title:'Owner review packet',outcome:'Prepare a locally reviewable packet',details:'Keep pricing and customer outcomes unknown.',dependsOn:[],sourceIds:[source.id],competencies:['evidence-synthesis'],reasonForWorker:'A bounded generalist can prepare and check this packet.',calls:family==='functional-project'?7:3}]:[],successEvidence:['Authenticated local readback.'],limitsOfInference:'This mock verifies authority mechanics, not business value.'};
}
test('an impossible finishing allocation is refused before changing the mandate or creating authority',()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-short-journey-')),store=new StateStore(join(root,'state.sqlite'));
 try{const knowledge=new PilotKnowledge(store),c=knowledge.createCompany({name:'Capacity fixture',website:'https://example.test/',goal:'Prepare a useful bounded operating packet.',mode:'fixture'}),execution=new PilotExecution(store,{root}),outcomes=new PilotOutcomes(store,execution),intelligence=new PilotIntelligence(store,execution),discovery=new PilotDiscovery(store,{root,knowledge});
 discovery.start(c.id,{website:c.website,limits:{maxDecisions:6}});
 const mandate=outcomes.create(c.id,{objective:'Prepare an operating packet',autonomy:'prepare_supported_work',allowedFamilies:['response-packet'],maxCalls:12,repairReserve:3});
 assert.throws(()=>prepareOutcomeJourneyAuthorization({outcomes,intelligence,discovery},{root,id:'journey-034-short',outcomeId:mandate.id,projectId:'proj_OFFLINE',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:100,mode:'mock'}),/JOURNEY_FINISHING_CAPACITY_REQUIRED/);
 assert.equal(outcomes.get(mandate.id).preparationReserve,0);assert.equal(discovery.view(c.id).used.decisions,0);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
async function setup(reject=false,adaptive=false,functional=false){
 const root=mkdtempSync(join(tmpdir(),'midas-one-journey-')),store=new StateStore(join(root,'state.sqlite')),knowledge=new PilotKnowledge(store),sample=commercialCases.service,c=knowledge.createCompany({name:sample.name,website:sample.website,goal:sample.goal,notes:sample.notes,mode:'fixture'});
 for(const p of sample.pages)knowledge.addSource(c.id,{title:p.title,text:p.text,kind:'website',rights:'Synthetic fixture',observedAt:new Date().toISOString()});
 const execution=new PilotExecution(store,{root}),outcomes=new PilotOutcomes(store,execution),intelligence=new PilotIntelligence(store,execution),discovery=new PilotDiscovery(store,{root,knowledge});discovery.start(c.id,{website:c.website,limits:{maxDecisions:6}});const mandate=outcomes.create(c.id,{objective:'Prepare a source-grounded owner packet for review',autonomy:'prepare_supported_work',allowedFamilies:[functional?'functional-project':'response-packet'],maxCalls:functional?25:18,repairReserve:functional?10:7,...(adaptive?{adaptive:{prompt:'baseline' as const,allowCommands:false,allowServices:false}}:{})});const services={outcomes,intelligence,discovery};
 const prepared=prepareOutcomeJourneyAuthorization(services,{root,id:'journey-034-test',outcomeId:mandate.id,projectId:'proj_JOURNEY_OFFLINE_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:271,mode:'mock'}),keys=keypair();let counts=0,creates=0,loseReads=false,onGet:(()=>void)|null=null;const terminal=new Map<string,any>();const transport=(async(url:any,init:any)=>{if(String(url).endsWith('/input_tokens')){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}if(init.method==='POST'){creates++;const payload=JSON.parse(JSON.parse(init.body).input);let value:any;if(creates===1)value={action:'finish',url:null,sourceId:null,reason:'The retained owner sources make the finite public discovery ready for separate analysis.',unresolved:['No public retrieval was needed in this synthetic fixture.']};else if(creates===2)value=fixtureCommercialOutput('service',payload.context.sources);else if(creates===3)value=outcome(payload.context.sources[0],reject?'reject':'prepare',functional?'functional-project':'response-packet');else if(adaptive&&creates===4)value={action:'tool',reason:'Inspect scripted scoped workbench state.',toolCall:{name:'adaptive.perform',arguments:{payload:JSON.stringify({action:'status'})}}};else value=(await fixtureJourneyWorker({request:{context:payload.context}} as any)).output;const id='resp_journey_'+creates;terminal.set(id,{id,model:'gpt-6-astra',status:'completed',service_tier:'default',background:true,store:true,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});return Response.json({id,model:'gpt-6-astra',status:'queued',service_tier:'default',background:true,store:true,usage:null,output:[]});}const id=String(url).split('/').at(-1)!;assert.equal(init.method,'GET');if(loseReads)throw Error('Explicit lost same-ID mock retrieval');const hook=onGet;onGet=null;hook?.();return Response.json(terminal.get(id));}) as typeof fetch;
 const signed=signOutcomeJourneyProposal(services,root,{proposal:prepared.proposal,expectedHash:prepared.proposalHash,principal:'ephemeral-owner',approvalReference:'Ephemeral mock-only journey approval.',...keys});return {root,store,services,mandate,prepared,keys,transport,stats:()=>({counts,creates}),loseReads:(v:boolean)=>{loseReads=v;},onGet:(fn:()=>void)=>{onGet=fn;},load:()=>loadAuthorizedOutcomeJourney(services,root,{testing:{envelope:signed.envelope,trustedPublicKey:keys.publicKey,transport}}),close(){store.close();rmSync(root,{recursive:true,force:true});}};
}
test('one signed journey uses one ledger from discovery through a bounded outcome graph',async()=>{const f=await setup();try{assert.equal(f.services.outcomes.get(f.mandate.id).preparationReserve,7);const r=f.load();const done=await r.run();assert.equal(done.state,'completed',JSON.stringify(done));assert.equal(r.totals().callsUsed,5);assert.deepEqual(Object.fromEntries(Object.entries(r.totals().stageUsage).map(([k,v]:any)=>[k,v.used])),{discovery:1,analysis:1,planner:1,primary:2,repair:0});assert.equal(f.stats().creates,5);assert.equal(f.services.outcomes.get(f.mandate.id).preparationAdmissions,2);assert.equal(f.services.outcomes.get(f.mandate.id).plannerAdmissions,1);}finally{f.close();}});
test('planner rejection records the decision and prevents graph work',async()=>{const f=await setup(true);try{const r=f.load();await r.runDiscovery();await r.runAnalysis();const result=await r.plan();assert.equal(result.state,'rejected');const after=await r.run();assert.equal(after.state,'rejected');assert.equal(r.totals().stageUsage.primary.used,0);assert.equal(f.stats().creates,3);}finally{f.close();}});
test('changed effective evidence is refused after planner freeze before a worker admission',async()=>{const f=await setup();try{const r=f.load();await r.runDiscovery();await r.runAnalysis();await r.plan();f.services.outcomes.knowledge.addSource(f.services.outcomes.get(f.mandate.id).businessId,{title:'Later constraint',text:'Later evidence must not enter this frozen journey.',kind:'notes',rights:'Synthetic fixture',observedAt:new Date().toISOString()});await assert.rejects(()=>r.run(),/CONTEXT_CHANGED/);assert.equal(r.totals().stageUsage.primary.used,0);}finally{f.close();}});
test('recovery retrieves the known response ID and never creates another discovery admission',async()=>{const f=await setup();try{f.loseReads(true);await assert.rejects(()=>f.load().runDiscovery(),/BACKGROUND|retrieval/i);assert.deepEqual(f.stats(),{counts:1,creates:1});f.loseReads(false);await f.load().runDiscovery();assert.deepEqual(f.stats(),{counts:1,creates:1});assert.equal(f.load().totals().stageUsage.discovery.used,1);}finally{f.close();}});
test('a response retained while owner evidence is withdrawn is never applied, including after restart',async()=>{const f=await setup();try{const businessId=f.services.outcomes.get(f.mandate.id).businessId,ids=f.services.outcomes.knowledge.selectedSources(businessId).map(s=>s.id);f.onGet(()=>f.services.outcomes.knowledge.selectEvidence(businessId,ids.slice(1)));await assert.rejects(()=>f.load().runDiscovery(),/CHANGED|EVIDENCE/);assert.equal(f.stats().creates,1);assert.equal(f.store.db.prepare("SELECT count(*) n FROM entities WHERE kind='operating-response'").get().n,1);const record=JSON.parse(String(f.store.db.prepare("SELECT body FROM entities WHERE kind='pilot-discovery-record'").get().body));assert.notEqual(record.status,'applied');await assert.rejects(()=>f.load().runDiscovery(),/CHANGED|EVIDENCE/);assert.equal(f.stats().creates,1);}finally{f.close();}});
test('a declared owner correction uses repair reserve and survives journey resume',async()=>{const f=await setup();try{const r=f.load(),first=await r.run(),node=first.graph[0],artifact=f.services.outcomes.execution.artifact(f.services.outcomes.get(f.mandate.id).businessId,node.taskId);r.correct({nodeId:node.id,artifactHash:artifact.hash,instruction:'State the owner review boundary before any price discussion.',repairCalls:3,assisted:true});const done=await f.load().resume();assert.equal(done.state,'completed',JSON.stringify(done));assert.equal(f.services.outcomes.get(f.mandate.id).repairAllocated,3);assert.equal(f.load().totals().stageUsage.repair.used,2);}finally{f.close();}});


test('adaptive discovery-to-outcome journey pins the approved task options and executes its actual tool contract',async()=>{
 const f=await setup(false,true);try{
  const r=f.load();await r.runDiscovery();await r.runAnalysis();await r.plan();f.services.outcomes.materialize(f.mandate.id);
  const node=f.services.outcomes.get(f.mandate.id).graph[0],execution=f.services.outcomes.execution,task=execution.portfolio.getTask(node.taskId);
  f.store.transaction(()=>f.store.put('portfolio-task',task.id,{...task,inputs:{...task.inputs,adaptiveExecution:{version:'adaptive-project-v1',prompt:'lean',allowCommands:true,allowServices:true}}},task._version));
  await assert.rejects(()=>r.run(),/JOURNEY_TASK_ADAPTIVE_SCOPE_CHANGED/);assert.equal(f.stats().creates,3);
  f.store.transaction(()=>{const current=execution.portfolio.getTask(task.id);f.store.put('portfolio-task',task.id,{...current,inputs:task.inputs},current._version);});
  const done=await r.run();assert.equal(done.state,'completed',JSON.stringify(done));assert.equal(f.stats().creates,6);assert.equal(f.stats().counts,6);
  await f.load().run();assert.equal(f.stats().creates,6);
 }finally{f.close();}
});

test('a functional project correction uses its accepted three-call reserve after journey restart',async()=>{
 const f=await setup(false,false,true);try{
  const r=f.load(),first=await r.run();assert.equal(first.state,'completed',JSON.stringify(first));
  const node=first.graph[0],businessId=f.services.outcomes.get(f.mandate.id).businessId,artifact=f.services.outcomes.execution.artifact(businessId,node.taskId),before=f.stats().creates;
  r.correct({nodeId:node.id,artifactHash:artifact.hash,instruction:'State the owner review boundary before any price discussion.',repairCalls:3,assisted:true});
  const queued=f.services.outcomes.get(f.mandate.id);assert.equal(queued.repairAllocated,3);assert.equal(queued.graph[0].calls,3);assert.equal(f.services.outcomes.execution.portfolio.getTask(queued.graph[0].taskId).resource.modelCalls,3);
  const resumed=f.load(),done=await resumed.resume();assert.equal(done.state,'completed',JSON.stringify(done));assert.notEqual(done.artifacts[0].hash,artifact.hash);assert.equal(resumed.totals().stageUsage.repair.used,3);assert.equal(f.stats().creates,before+3);
  await f.load().resume();assert.equal(f.stats().creates,before+3,'Completed correction cannot repeat its provider admissions');
 }finally{f.close();}
});
