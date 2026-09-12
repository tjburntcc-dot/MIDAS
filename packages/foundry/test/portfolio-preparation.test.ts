import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { hash } from '../src/contracts.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { portfolioScope } from '../src/portfolio/contracts.ts';
import type { TaskSpec } from '../src/portfolio/contracts.ts';
import { CAPABILITIES, PortfolioEngine } from '../src/portfolio/engine.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { LocalWorkTools } from '../src/portfolio/tools.ts';
import { createTaskPreparer, SERVICE_FILE_CONTRACT } from '../src/portfolio/task-preparation.ts';
import { prepareOperatingRelease } from '../src/portfolio/release.ts';
import { mockResult, TOOL_NAMES } from '../src/portfolio/worker.ts';
import type { WorkerModel } from '../src/portfolio/worker.ts';
import type { BriefInputs } from '../src/portfolio/products.ts';
import type { ResearchPorts } from '../src/operations/research.ts';

function setup(ports?: ResearchPorts) {
 const root=mkdtempSync(join(tmpdir(),'portfolio-preparation-')),store=new StateStore(join(root,'state.sqlite')),portfolio=new Portfolio(store);
 portfolio.createVenture({id:'service',name:'Owner operations',goal:'Determine a useful reversible next step from permitted evidence'});
 portfolio.registerWorker({id:'worker',name:'Common worker',capabilities:CAPABILITIES,competencies:['source-review','evidence-grounded-work']});
 const tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store,{publicRead:Boolean(ports),ports});
 evidence.add('service',{title:'Owner question',url:null,text:'The owner is considering a source review service. Buyer willingness to pay and delivery effort have not been measured.',rights:'owner_supplied',provenance:'offline_fixture',observedAt:'2026-09-12T00:00:00Z',publishedAt:null});
 return {root,store,portfolio,tools,evidence,close(){store.close();rmSync(root,{recursive:true,force:true});}};
}
const action=(name:string,args:Record<string,unknown>={})=>({action:'tool',reason:'Exercise the common tool contract using observed source and file state',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const complete=()=>({action:'complete',reason:'The current complete packet passed trusted checks and local delivery readback',toolCall:null});
const task=(id:string,capability:string,dependsOn:string[]=[]):TaskSpec=>({id,title:id,lane:'research',capability,dependsOn,acceptance:['A complete source-grounded packet with accountable next actions'],requiredChecks:['delivery.current'],allowedTools:[...TOOL_NAMES],inputs:{flow:id},resource:{modelCalls:8,localToolRuns:10}});
// Explicit test model, using only the visible input contract and source text.
// Its deliberately generic recommendation is not actual-model business judgment.
function report(inputs:BriefInputs,review=false){return {title:inputs.title,client:inputs.client,asOf:inputs.asOf,observations:inputs.sources.map((source,i)=>({id:'source-'+i,statement:source.title,sourceId:source.id,quote:source.text})),recommendation:{title:review?'Request owner review of the revised evidence packet':'Request owner review of the evidence packet',basis:'The supplied sources support review of the question; commercial value and causal conclusions remain unmeasured.',steps:[{action:review?'Record the owner decision and one observable acceptance condition before proposing further work.':'Ask the owner to identify the next decision this evidence should support.',owner:'venture owner',successMeasure:review?'A retained owner decision names its evidence and acceptance condition.':'The owner records a concrete decision and missing evidence.'}]},unknowns:['Whether a buyer finds this output useful or would pay remains unknown.'],obligations:[{id:'owner-review',description:'Owner reviews the local packet and records acceptance or requested correction.',owner:'venture owner',status:'open'}]};}
function inputsFromContext(context:any):BriefInputs{return {...context.workspace.inputs,sources:context.workspace.inputs.sources.map((metadata:any)=>{const source=context.sources.find((s:any)=>s.id===metadata.id);assert(source&&!source.truncated,'This small fixture reads complete source previews; larger sources require research.read');return {id:metadata.id,title:metadata.title,rights:metadata.rights,text:source.text};})};}
function sourceRecords(store:StateStore){const scope=portfolioScope('service');return store.records({id:'test-reader',tenantId:scope.tenantId,businessId:scope.businessId,permissions:['read']},scope).filter(r=>r.kind==='LocalSourceRevision');}

test('dynamically planned research quotes newly fetched evidence after a versioned trusted source update',async()=>{
 let fetches=0;const url='https://example.org/service-evidence';
 const f=setup({dnsLookup:async()=>[{address:'93.184.216.34'}],now:()=>new Date('2026-09-12T00:01:00Z'),fetch:async(requestUrl,_init,address)=>{fetches++;assert.equal(requestUrl,url);assert.equal(address,'93.184.216.34');let done=false;return {status:200,headers:{get:name=>name.toLowerCase()==='content-type'?'text/html':null},body:{getReader:()=>({read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode('<html><title>Public service evidence</title><body><p>A published field note describes a source review workflow. It supplies no measured customer conversion rate.</p></body></html>')})})}};}});
 try{
  f.portfolio.addPlan('service',{rationale:'Plan a source-backed investigation',tasks:[{...task('plan','portfolio.plan'),requiredChecks:['proposal.reference_checks'],allowedTools:[]}]});
  let calls=0,workerCalls=0,beforeFetch:any;
  const model:WorkerModel={kind:'offline_mock',async run(call){calls++;const context=call.request.context as any;
   if(context.task.inputs?.flow==='plan'){assert(context.capabilityProfiles['research.investigate'].requiredTools.includes('check.run'));return mockResult({summary:'Investigate then deliver the source-bound packet',claims:[],contradictions:[],unknowns:['Buyer acceptance is unobserved'],alternatives:[],priority:50,rationale:'A permitted source review can inform the next reversible decision',cancelTaskIds:[],tasks:[{id:'investigate',title:'Investigate the service evidence',objective:'Fetch a relevant permitted public source and write a complete source-grounded packet',lane:'research',capability:'research.investigate',dependsOn:[],acceptance:['Current permitted quotations and a complete accountable recommendation'],requiredCompetencies:['source-review'],allowedTools:[...TOOL_NAMES],priority:50}]});}
   workerCalls++;assert.deepEqual(context.workspace.fileContract,SERVICE_FILE_CONTRACT);const child=f.portfolio.snapshot('service').tasks.find(t=>t.localId.startsWith('investigate-'))!,workspace=f.tools.load('service',child.id),inputs=inputsFromContext(context);
   if(workerCalls===1){assert.equal(workspace.files[0].content,'{}');assert.deepEqual(inputs.requiredSourceIds,[f.evidence.list('service')[0].id]);return mockResult(action('workspace.read',{path:'brief.json'}));}
   if(workerCalls===2||workerCalls===5){
    if(workerCalls===5){assert.equal(inputs.sources.length,2);assert(inputs.sources.some(s=>s.title==='Public service evidence'));assert.equal(workspace.manifest.revision,beforeFetch.manifest.revision+1);assert.deepEqual(workspace.checks,[]);assert.equal(workspace.checkedManifest,null);assert.equal(workspace.published,null);assert.equal(hash(sourceRecords(f.store).find(r=>r.id===beforeFetch.manifest.ref.id)),beforeFetch.recordHash);}
    return mockResult(action('workspace.replace',{path:'brief.json',expectedHash:context.workspace.manifest.files.find((x:any)=>x.path==='brief.json').sha256,content:JSON.stringify(report(inputs))}));
   }
   if(workerCalls===3||workerCalls===6)return mockResult(action('check.run'));
   if(workerCalls===4){assert(workspace.checks.every(c=>c.passed));assert.equal(workspace.checkedManifest,workspace.manifest.sha256);beforeFetch={manifest:workspace.manifest,recordHash:hash(sourceRecords(f.store).find(r=>r.id===workspace.manifest.ref.id))};return mockResult(action('research.fetch',{url}));}
   if(workerCalls===7)return mockResult(action('artifact.publish_local'));
   assert.equal(workerCalls,8);return mockResult(complete());
  }};
  const engine=new PortfolioEngine({...f,model,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence)});
  await engine.runTask('service/plan');const child=f.portfolio.snapshot('service').tasks.find(t=>t.localId.startsWith('investigate-'))!;assert(child);assert.throws(()=>f.tools.load('service',child.id),/WORKSPACE_NOT_FOUND/);
  await engine.runTask(child.id);const finished=f.portfolio.getTask(child.id);assert.equal(finished.status,'completed',finished.reason);assert.equal(fetches,1);assert.equal(calls,9);
  const workspace=f.tools.load('service',child.id),packet=JSON.parse(workspace.files[0].content),fetched=f.evidence.list('service').find(s=>s.url===url)!;
  assert.equal(fetched.provenance,'offline_fixture');assert(packet.observations.some((o:any)=>o.sourceId===fetched.id&&o.quote===fetched.text));assert.equal(workspace.manifest.revision,4);assert.equal(f.store.get('portfolio-execution',child.id).sourceHash,f.evidence.digest('service'));assert.equal(JSON.parse(f.tools.download('service',child.id).content).manifest.sha256,workspace.manifest.sha256);assert.equal(finished.result.artifacts[0].metadata.modelProvenance,'offline_mock');
  const preserved=hash(workspace),inputs=workspace.inputs as BriefInputs;
  assert.throws(()=>f.tools.updateInputs('service',child.id,{...inputs,title:'Unapproved new title'},'test metadata change'),/TRUSTED_INPUT_METADATA_PINNED/);
  assert.throws(()=>f.tools.updateInputs('service',child.id,{...inputs,requiredSourceIds:[]},'test obligation removal'),/REQUIRED_SOURCE_REMOVAL_DENIED/);
  assert.throws(()=>f.tools.updateInputs('service',child.id,{...inputs,sources:inputs.sources.filter(s=>s.id!==fetched.id)},'test optional source removal'),/SOURCE_REMOVAL_DENIED/);
  assert.throws(()=>f.tools.updateInputs('service',child.id,{...inputs,sources:[...inputs.sources,{...inputs.sources[0],id:7 as any}]},'test malformed source'),/SERVICE_SOURCE_INVALID/);
  assert.equal(hash(f.tools.load('service',child.id)),preserved,'rejected source changes do not change the checked publication');
 }finally{f.close();}
});

test('dynamic review clones the exact upstream packet and publishes its corrected authoritative version',async()=>{
 const f=setup();try{
  f.portfolio.addPlan('service',{rationale:'Produce then review the actual packet',tasks:[task('initial','service.brief'),{...task('review','quality.review',['initial']),title:'Review the upstream recommendation'}]});
  const counts:Record<string,number>={},upstream:any={};
  const model:WorkerModel={kind:'offline_mock',async run(call){const context=call.request.context as any,flow=context.task.inputs.flow,step=counts[flow]=(counts[flow]??0)+1;assert.deepEqual(context.workspace.fileContract,SERVICE_FILE_CONTRACT);
   if(step===1){if(flow==='review'){const workspace=f.tools.load('service','service/review');assert.deepEqual(workspace.files,upstream.files);assert.deepEqual(inputsFromContext(context),upstream.inputs);assert.equal(context.task.inputs.authoritativeArtifactId,upstream.artifact.id);assert.equal(context.workspace.inputs.title,'initial','review uses original packet metadata, not its new task title');}return mockResult(action('workspace.read',{path:'brief.json'}));}
   if(step===2){if(flow==='review')assert.equal(context.observations.at(-1).result.output.content,upstream.files[0].content);return mockResult(action('workspace.replace',{path:'brief.json',expectedHash:context.workspace.manifest.files[0].sha256,content:JSON.stringify(report(inputsFromContext(context),flow==='review'))}));}
   if(step===3)return mockResult(action('check.run'));if(step===4)return mockResult(action('artifact.publish_local'));assert.equal(step,5);return mockResult(complete());
  }};
  const engine=new PortfolioEngine({...f,model,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence)});
  await engine.runTask('service/initial');assert.equal(f.portfolio.getTask('service/initial').status,'completed');Object.assign(upstream,f.tools.load('service','service/initial'));upstream.artifact=f.portfolio.getTask('service/initial').result.artifacts[0];const oldRecord=sourceRecords(f.store).find(r=>r.id===upstream.manifest.ref.id),oldHash=hash(oldRecord),oldDownload=f.tools.download('service','service/initial').content;
  f.portfolio.addPlan('service',{rationale:'An independent consumer is bound to the old packet',tasks:[{...task('consumer','service.brief'),inputArtifacts:[{artifactId:upstream.artifact.id,version:upstream.artifact.version,sha256:upstream.artifact.sha256}]}]});
  await engine.runTask('service/review');const review=f.portfolio.getTask('service/review');assert.equal(review.status,'completed',review.reason);assert.deepEqual(counts,{initial:5,review:5});assert.equal(review.result.artifacts[0].id,upstream.artifact.id);assert.equal(review.result.artifacts[0].version,2);assert.equal(f.portfolio.getTask('service/consumer').status,'stale');assert.equal(f.portfolio.getTask('service/initial').outputCurrent,false);
  const reviewedWorkspace=f.tools.load('service','service/review'),revised=JSON.parse(reviewedWorkspace.files[0].content);assert.equal(revised.recommendation.title,'Request owner review of the revised evidence packet');assert.equal(revised.title,upstream.inputs.title);assert.equal(hash(sourceRecords(f.store).find(r=>r.id===oldRecord.id)),oldHash);assert.equal(f.tools.download('service','service/initial').content,oldDownload);assert.equal(f.portfolio.snapshot('service').artifacts.length,1);
  // A later local draft must not be mistaken for the exact published artifact.
  const edited=await f.tools.execute({ventureId:'service',taskId:'service/review',tool:'workspace.replace',args:{path:'brief.json',content:JSON.stringify({...revised,unknowns:['Unpublished new draft uncertainty']}),expectedHash:reviewedWorkspace.manifest.files[0].sha256}});assert(edited.ok);
  f.portfolio.addPlan('service',{rationale:'Review the authoritative result again',tasks:[task('followup','quality.review',['review'])]});await engine.runTask('service/followup');const refused=f.portfolio.getTask('service/followup');assert.equal(refused.status,'blocked');assert.match(refused.reason,/AUTHORITATIVE_REVIEW_SOURCE_CHANGED/);assert.deepEqual(counts,{initial:5,review:5},'unpublished source mismatch is detected before buying a model call');assert.throws(()=>f.tools.load('service','service/followup'),/WORKSPACE_NOT_FOUND/);
 }finally{f.close();}
});

test('operating release prepares the bounded investigate-review-decide chain without granting or dispatching work',()=>{
 const f=setup();try{
  f.portfolio.createVenture({id:'midas-intelligence',name:'Operating intelligence',goal:'Choose useful system work'});
  f.portfolio.addPlan('service',{rationale:'Superseded unexecuted planning path',tasks:[{...task('live-investigation','portfolio.plan'),requiredChecks:['proposal.reference_checks'],allowedTools:[]}]});
  const first=prepareOperatingRelease(f.portfolio,f.evidence);assert.equal(first.authority,'unsigned_preparation_only');assert.equal(first.providerRequests,0);assert.equal(f.portfolio.getTask('service/live-investigation').status,'cancelled');
  const investigate=f.portfolio.getTask('service/investigate-v2'),review=f.portfolio.getTask('service/review-v2'),decide=f.portfolio.getTask('service/decide-v2');assert.equal(investigate.capability,'research.investigate');assert(investigate.allowedTools.includes('research.fetch'));assert.deepEqual(review.dependsOn,[investigate.id]);assert.equal(review.capability,'quality.review');assert(review.allowedTools.includes('research.read'));assert.deepEqual(decide.dependsOn,[review.id]);assert.deepEqual([investigate.resource.modelCalls,review.resource.modelCalls,decide.resource.modelCalls],[8,6,1]);assert.deepEqual([investigate.resource.localToolRuns,review.resource.localToolRuns,decide.resource.localToolRuns],[10,8,0]);assert([investigate,review,decide].every(t=>(t.inputs as any).requiresGrant===true&&t.attempts===0&&t.status==='queued'));
  assert.deepEqual(f.portfolio.getTask('midas-intelligence/decide-v2').dependsOn,[]);const count=f.portfolio.snapshot().tasks.length;assert.equal(prepareOperatingRelease(f.portfolio,f.evidence).prepared.length,0);assert.equal(f.portfolio.snapshot().tasks.length,count);assert.equal(f.portfolio.snapshot().resources.used.modelCalls,0);
 }finally{f.close();}
});
