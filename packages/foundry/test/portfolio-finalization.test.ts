import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {hash,rawHash} from '../src/contracts.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {mockResult,validateWorker,workerSchema} from '../src/portfolio/worker.ts';
import {serviceBriefFiles} from '../src/portfolio/products.ts';
import {applySourcePatch} from '../src/portfolio/source-repair.ts';
import {sourceHandoff} from '../src/portfolio/source-handoff.ts';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const complete=()=>mockResult({action:'complete',reason:'Explicit offline worker submission; not independent semantic acceptance.',toolCall:null});
const action=(name:string,args:any={})=>mockResult({action:'tool',reason:'Explicit offline repair selection.',toolCall:{name,arguments:name==='workspace.patch'?args:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
function fixture(cap=3){
 const root=mkdtempSync(join(tmpdir(),'midas-finalize-'));let store=new StateStore(join(root,'state.sqlite')),portfolio=new Portfolio(store),evidence=new EvidenceLibrary(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope});
 portfolio.createVenture({id:'v',name:'Fixture',goal:'Test scoped finalization, not AI competence.'});portfolio.registerWorker({id:'worker',name:'Mock worker',competencies:[],capabilities:['service.brief']});
 const source=evidence.add('v',{title:'Permitted rule',url:null,text:'A permitted fact exists.',observedAt:new Date().toISOString(),publishedAt:null,rights:'owner_supplied',provenance:'offline_fixture'});
 portfolio.addPlan('v',{rationale:'Explicit offline fixture',tasks:[{id:'work',title:'Useful brief',capability:'service.brief',lane:'research',dependsOn:[],acceptance:['Retain supported evidence and obligations'],requiredChecks:['delivery.current'],allowedTools:['workspace.replace','workspace.patch','workspace.candidate_read','check.run','artifact.publish_local'],inputs:{executionProtocol:'bounded-finalize-v1',feedbackPolicy:'defer_to_declared_decision',enforceHandoff:true},resource:{modelCalls:cap,localToolRuns:12},maxAttempts:1}]});
 const inputs={title:'Useful brief',client:'Fixture',asOf:'2026-09-13',enforceHandoff:true,sources:[source],requiredSourceIds:[source.id]},files=serviceBriefFiles(inputs);
 tools.seed('v','v/work',{kind:'service',inputs,files,provenance:'Offline source fixture'});
 let calls=0;const make=(answer:(call:any)=>any)=>new PortfolioEngine({portfolio,evidence,tools,model:{kind:'offline_mock',async run(call){calls++;return answer(call);}}});
 return {root,get store(){return store;},get portfolio(){return portfolio;},get tools(){return tools;},inputs,files,make,get calls(){return calls;},reopen(){store.close();store=new StateStore(join(root,'state.sqlite'));portfolio=new Portfolio(store);evidence=new EvidenceLibrary(store);tools=new LocalWorkTools({root,store,scopeFor:portfolioScope});},close(){store.close();const p=realpathSync(root),r=relative(realpathSync(tmpdir()),p);assert(r&&!r.startsWith('..')&&!isAbsolute(r));rmSync(p,{recursive:true,force:true});}};
}

test('one submission checks, publishes, reads back and closes a valid service with open obligations',async()=>{
 const f=fixture(1);try{await f.make(complete).runTask('v/work');const t=f.portfolio.getTask('v/work');assert.equal(t.status,'completed',t.reason);assert.equal(f.calls,1);const bundle=JSON.parse(f.tools.download('v','v/work').content);assert(bundle.obligations.length);assert(bundle.obligations.every((o:any)=>o.status==='open'));assert.equal(t.outputArtifacts.length,1);const fin=f.store.get('portfolio-finalization','v/work/finalize-0');assert.equal(fin.phase,'closed');assert.equal(fin.independentSemanticReview,false);}finally{f.close();}
});

test('failed checks stay unpublished; remaining capacity stops an avoidable admission',async()=>{
 const f=fixture(2);try{const bad=JSON.parse(f.files[0].content);bad.observations[0].quote='NOT SUPPORTED';const w=f.tools.load('v','v/work');await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.replace',args:{path:'brief.json',content:JSON.stringify(bad),expectedHash:w.manifest.files[0].sha256}});
 await f.make(complete).runTask('v/work');assert.equal(f.calls,1);assert.equal(f.portfolio.getTask('v/work').reason,'FINISHING_CAPACITY_INSUFFICIENT');assert.equal(f.tools.load('v','v/work').published,null);const shortage=f.store.get('portfolio-finishing-shortage','v/work');assert.equal(shortage.remainingCalls,1);assert.equal(shortage.minimumCalls,2);assert.equal(shortage.providerAdmission,false);assert(f.tools.load('v','v/work').checks.some(c=>!c.passed));}finally{f.close();}
});

test('a failed source check can be repaired by one literal edit and finalized without regenerating the document',async()=>{
 const f=fixture(3);try{const bad=JSON.parse(f.files[0].content);bad.observations[0].quote='NOT SUPPORTED';await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.replace',args:{path:'brief.json',content:JSON.stringify(bad),expectedHash:f.tools.load('v','v/work').manifest.files[0].sha256}});
 await f.make(call=>f.calls===2?action('workspace.patch',{path:'brief.json',expectedHash:(call.request.context as any).workspace.manifest.files[0].sha256,candidateId:null,serialization:'preserve',edits:[{find:'NOT SUPPORTED',replace:f.inputs.sources[0].text}]}):complete()).runTask('v/work');assert.equal(f.portfolio.getTask('v/work').status,'completed');assert.equal(f.calls,3);assert.deepEqual(JSON.parse(f.tools.load('v','v/work').files[0].content),JSON.parse(f.files[0].content));}finally{f.close();}
});

test('Unicode feedback measures UTF-8; patch ambiguity and stale candidates fail without mutation',async()=>{
 const f=fixture();try{const before=f.tools.load('v','v/work'),bad='😀'.repeat(4501),failed=await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.replace',args:{path:'brief.json',content:bad,expectedHash:before.manifest.files[0].sha256},operationId:'unicode'});
 assert.equal(failed.output.actualBytes,18004);assert.equal(failed.output.requiredReductionBytes,4);assert.equal(failed.output.recommendedTargetBytes,15300);assert.deepEqual(f.tools.load('v','v/work'),before);
 const c=f.tools.repairCandidate('v','v/work')!;assert.equal(c.content,bad);assert.equal(rawHash(c.content),failed.output.candidate.sha256);
 const chunk=await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.candidate_read',args:{path:c.candidateId,query:'0'}});assert.equal(chunk.output.content.length,8000);assert.equal(chunk.output.nextOffset,8000);assert(!/[\uD800-\uDBFF]$/.test(chunk.output.content));
 const ambiguity=await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.patch',args:{path:'brief.json',expectedHash:c.sha256,candidateId:c.candidateId,serialization:'preserve',edits:[{find:'😀',replace:''}]}});assert.equal(ambiguity.error,'PATCH_MATCH_NOT_UNIQUE');assert.deepEqual(f.tools.load('v','v/work'),before);
 await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.replace',args:{path:'brief.json',content:f.files[0].content+' ',expectedHash:before.manifest.files[0].sha256}});
 const stale=await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.patch',args:{path:'brief.json',expectedHash:c.sha256,candidateId:c.candidateId,serialization:'compact-json',edits:[]}});assert.equal(stale.error,'PATCH_CANDIDATE_STALE');assert.equal(f.tools.repairCandidate('v','v/work',c.candidateId)?.content,bad);
 }finally{f.close();}
});

test('concurrent source change cannot finalize the old model submission',async()=>{
 const f=fixture(1);try{await f.make(async()=>{const w=f.tools.load('v','v/work');await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'workspace.replace',args:{path:'brief.json',expectedHash:w.manifest.files[0].sha256,content:w.files[0].content+'\n'}});return complete();}).runTask('v/work');assert.equal(f.portfolio.getTask('v/work').reason,'FINALIZATION_SOURCE_STALE');assert.equal(f.tools.load('v','v/work').published,null);assert.equal(f.portfolio.getTask('v/work').outputArtifacts.length,0);}finally{f.close();}
});

test('insufficient local-tool capacity stops before inference; no allowance is borrowed',async()=>{
 const f=fixture(1);try{const t=f.portfolio.getTask('v/work');f.store.transaction(()=>f.store.put('portfolio-task',t.id,{...t,resource:{...t.resource,localToolRuns:1}},t._version));await f.make(()=>{throw Error('UNNECESSARY_CALL');}).runTask(t.id);assert.equal(f.calls,0);assert.equal(f.portfolio.getTask(t.id).reason,'FINISHING_CAPACITY_INSUFFICIENT');assert.equal(f.store.get('portfolio-finishing-shortage',t.id).minimumLocalTools,2);}finally{f.close();}
});

test('mismatched publication readback cannot close a task',async()=>{
 const f=fixture(1);try{const download=f.tools.download.bind(f.tools);f.tools.download=(...args)=>{const result=download(...args);const value=JSON.parse(result.content);value.obligations=[];return {...result,content:JSON.stringify(value)};};await f.make(complete).runTask('v/work');assert.equal(f.portfolio.getTask('v/work').status,'blocked');assert.equal(f.portfolio.getTask('v/work').reason,'DELIVERY_READBACK_MISMATCH');assert.equal(f.portfolio.getTask('v/work').outputArtifacts.length,0);assert(f.tools.load('v','v/work').published);}finally{f.close();}
});

test('interruption after atomic task closure repairs only the finalization receipt',async()=>{
 const f=fixture(1);try{const close=f.portfolio.complete.bind(f.portfolio);f.portfolio.complete=(...args)=>{close(...args);throw Object.assign(Error('after closure'),{simulatedCrash:true});};await assert.rejects(()=>f.make(complete).runTask('v/work'),/after closure/);assert.equal(f.portfolio.getTask('v/work').status,'completed');assert.equal(f.store.get('portfolio-finalization','v/work/finalize-0').phase,'published');f.reopen();const result=await f.make(()=>{throw Error('DUPLICATE_INFERENCE');}).recover();assert.deepEqual(result.closedFinalizations,['v/work/finalize-0']);assert.equal(f.calls,1);assert.equal(f.store.get('portfolio-finalization','v/work/finalize-0').phase,'closed');assert.equal(f.portfolio.getTask('v/work').outputArtifacts.length,1);}finally{f.close();}
});

test('publication response interruption resumes from durable effects without another inference or publication',async()=>{
 const f=fixture(1);try{const actual=f.tools.execute.bind(f.tools);let publications=0;f.tools.execute=async c=>{const result=await actual(c);if(c.tool==='artifact.publish_local'){publications++;throw Object.assign(Error('offline simulated process interruption after committed publication'),{simulatedCrash:true});}return result;};
 await assert.rejects(()=>f.make(complete).runTask('v/work'),/interruption/);const published=f.tools.load('v','v/work').published;assert(published);f.portfolio.recover({ownerAlive:()=>false});f.reopen();const engine=f.make(()=>{throw Error('UNAUTHORIZED_DUPLICATE_INFERENCE');});await engine.recover();await engine.runTask('v/work');assert.equal(f.calls,1);assert.equal(publications,1);assert.equal(f.portfolio.getTask('v/work').status,'completed',f.portfolio.getTask('v/work').reason);assert.deepEqual(f.tools.load('v','v/work').published,published);assert.equal(f.portfolio.getTask('v/work').outputArtifacts.length,1);
 }finally{f.close();}
});

test('software publication requires the model to receive actual current browser observations', {timeout:60000},async()=>{
 const f=fixture();try{
  f.portfolio.registerWorker({id:'browser-worker',name:'Offline browser worker',competencies:[],capabilities:['software.build']});
  f.portfolio.addPlan('v',{rationale:'Actual browser review gate, not visual AI competence.',tasks:[{id:'product',title:'Software',capability:'software.build',lane:'build',dependsOn:[],acceptance:['Current browser evidence before review submission'],requiredChecks:['delivery.current'],allowedTools:['workspace.replace','workspace.patch','check.run','artifact.publish_local'],inputs:{executionProtocol:'bounded-finalize-v1',feedbackPolicy:'defer_to_declared_decision'},resource:{modelCalls:2,localToolRuns:4},maxAttempts:1}]});
  f.tools.seed('v','v/product',{kind:'software',files:quoteProductV2Example(),inputs:{profile:'quote-to-job-v2'},provenance:'Development-assistant source used only as an explicit offline regression fixture.'});
  await f.make(call=>{if(f.calls===2){assert.equal(f.tools.load('v','v/product').published,null);const c=call.request.context as any;const check=c.observations.find((o:any)=>o.tool==='check.run');assert(check.result.checks.some((x:any)=>x.id==='software.browser-observation'));assert(c.observations.some((o:any)=>o.result.reason==='CURRENT_BROWSER_REVIEW_REQUIRED'));}return complete();}).runTask('v/product');
  assert.equal(f.calls,2);assert.equal(f.portfolio.getTask('v/product').status,'completed',f.portfolio.getTask('v/product').reason);
 }finally{f.close();}
});

test('a real exited process resumes committed publication without repeating inference or the effect', {timeout:30000},async()=>{
 const f=fixture(1);try{
  const module=(path:string)=>pathToFileURL(resolve('packages/foundry/src',path)).href;
  const code=`import {StateStore} from ${JSON.stringify(module('state.ts'))};import {Portfolio} from ${JSON.stringify(module('portfolio/core.ts'))};import {LocalWorkTools} from ${JSON.stringify(module('portfolio/tools.ts'))};import {portfolioScope} from ${JSON.stringify(module('portfolio/contracts.ts'))};import {EvidenceLibrary} from ${JSON.stringify(module('portfolio/evidence.ts'))};import {PortfolioEngine} from ${JSON.stringify(module('portfolio/engine.ts'))};import {mockResult} from ${JSON.stringify(module('portfolio/worker.ts'))};const store=new StateStore(process.argv[1]),portfolio=new Portfolio(store),tools=new LocalWorkTools({root:process.argv[2],store,scopeFor:portfolioScope}),execute=tools.execute.bind(tools);tools.execute=async c=>{const r=await execute(c);if(c.tool==='artifact.publish_local')process.exit(86);return r;};await new PortfolioEngine({portfolio,tools,evidence:new EvidenceLibrary(store),model:{kind:'offline_mock',async run(){return mockResult({action:'complete',reason:'Offline process interruption fixture.',toolCall:null});}}}).runTask('v/work');`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code,join(f.root,'state.sqlite'),f.root],{encoding:'utf8',timeout:20000});assert.equal(child.status,86,child.stderr);
  const published=f.tools.load('v','v/work').published;assert(published);const engine=f.make(()=>{throw Error('DUPLICATE_MODEL_DISPATCH');});await engine.recover();await engine.runTask('v/work');
  assert.equal(f.calls,0);assert.equal(f.portfolio.getTask('v/work').status,'completed',f.portfolio.getTask('v/work').reason);assert.deepEqual(f.tools.load('v','v/work').published,published);assert.equal(f.portfolio.getTask('v/work').outputArtifacts.length,1);
 }finally{f.close();}
});

test('unchanged historical rejected candidates remain complete repair targets; explicit serialization and finalization fit the seven-call envelope',async()=>{
 const parent=resolve(process.env.M031_R1_ROOT??'../../var/foundry-worktree-031-handoff-r1/var/portfolio-031-continuation-r1');
 const base=mkdtempSync(join(tmpdir(),'midas-observed-repair-'));copyFileSync(join(parent,'../portfolio-031-continuation-r1-stop-backup/portfolio.sqlite'),join(base,'state.sqlite'));
 const store=new StateStore(join(base,'state.sqlite'));try{const p=new Portfolio(store),tools=new LocalWorkTools({root:base,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store),original=tools.load('quote-desk','quote-desk/investigate-v4'),old=p.getTask('quote-desk/investigate-v4-r1'),id='quote-desk/observed-repair-regression';
 const candidates=[1,2,3,4].map(i=>readFileSync(join(parent,'reports/actual-result/candidate-'+i+'.json'),'utf8'));
 assert.deepEqual(candidates.map(x=>Buffer.byteLength(x)),[20447,19148,19240,18473]);
 p.addPlan('quote-desk',{id:'observed-repair-regression',rationale:'Offline replay of original unchanged candidate inputs; no model competence claim.',tasks:[{id:'observed-repair-regression',title:old.title,lane:'research',capability:'research.investigate',dependsOn:[],acceptance:old.acceptance,requiredChecks:['delivery.current'],allowedTools:['workspace.replace','workspace.patch','workspace.candidate_read','check.run','artifact.publish_local'],resource:{modelCalls:7,localToolRuns:12},maxAttempts:1,inputs:{executionProtocol:'bounded-finalize-v1',release:'value-release-v4',sourceBindings:old.inputs.sourceBindings,feedbackPolicy:'defer_to_declared_decision',draftContinuation:{kind:'preserved-draft-correction-v1',parentTaskId:'quote-desk/investigate-v4',parentAttemptId:'p031-da316e4919694723-0',taskId:id,sha256:rawHash(original.files[0].content),bytes:Buffer.byteLength(original.files[0].content)}}}]});
 tools.seed('quote-desk',id,{kind:'service',files:original.files,inputs:original.inputs,provenance:'Unchanged actual historical source, reused only as an offline fixture.'});let calls=0;
 const engine=new PortfolioEngine({portfolio:p,tools,evidence,model:{kind:'offline_mock',async run(call){const c=call.request.context as any;calls++;if(calls<=4){assert.equal(c.workspace.currentSource[0].content,original.files[0].content);return action('workspace.replace',{path:'brief.json',content:candidates[calls-1],expectedHash:original.manifest.files[0].sha256});}
 if(calls===5){assert.equal(c.workspace.repairTarget.content,candidates[3]);assert.equal(c.workspace.repairTarget.contentComplete,true);assert.equal(c.workspace.repairTarget.feedback.requiredReductionBytes,473);const args={path:'brief.json',expectedHash:c.workspace.repairTarget.sha256,candidateId:c.workspace.repairTarget.candidateId,serialization:'compact-json',edits:[]};validateWorker(action('workspace.patch',args).output);return action('workspace.patch',args);}return complete();}}});
 await engine.runTask(id);assert.equal(p.getTask(id).status,'completed',p.getTask(id).reason);assert.equal(calls,6);const w=tools.load('quote-desk',id);assert.equal(Buffer.byteLength(w.files[0].content),17653);assert.deepEqual(JSON.parse(w.files[0].content),JSON.parse(candidates[3]));assert.equal(p.getTask(old.id).status,'blocked');assert.equal(tools.load('quote-desk',old.id).files[0].content,readFileSync(join(parent,'reports/actual-result/brief.json'),'utf8'));
 const retained=store.db.prepare("SELECT body FROM entities WHERE kind='workspace-rejected-candidate'").all().map(r=>JSON.parse(String(r.body))).filter(c=>c.taskId===id);assert.deepEqual(retained.map(c=>rawHash(c.content)).sort(),candidates.map(rawHash).sort());
 const edit=store.db.prepare("SELECT body FROM records WHERE json_extract(body,'$.kind')='ModelSourceEdit'").all().map(r=>JSON.parse(String(r.body))).find(r=>r.scope.businessId==='quote-desk');assert.equal(edit.value.authoredCandidate,candidates[3]);assert.equal(edit.value.serialization,'compact-json');assert.equal(JSON.parse(tools.download('quote-desk',id).content).obligations.length,JSON.parse(candidates[3]).obligations.length);
 }finally{store.close();const path=realpathSync(base),r=relative(realpathSync(tmpdir()),path);assert(r&&!r.startsWith('..')&&!isAbsolute(r));rmSync(path,{recursive:true,force:true});}
});
