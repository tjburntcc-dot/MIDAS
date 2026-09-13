import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {mockResult} from '../src/portfolio/worker.ts';
import {defaultServiceInputs,serviceBriefFiles} from '../src/portfolio/products.ts';

function setup(){
 const root=mkdtempSync(join(tmpdir(),'midas-handoff-write-')),store=new StateStore(join(root,'state.sqlite'));
 const tools=new LocalWorkTools({root,store,scopeFor:portfolioScope});
 const write=(taskId:string,content:string,operationId:string,path='brief.json')=>{const w=tools.load('v',taskId);return tools.execute({ventureId:'v',taskId,tool:'workspace.replace',args:{path,content,expectedHash:w.manifest.files.find(f=>f.path===path)?.sha256??null},operationId});};
 return {root,store,tools,write,close(){store.close();const path=realpathSync(root),rel=relative(realpathSync(tmpdir()),path);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(path,{recursive:true,force:true});}};
}
const action=(name:string,args:any={})=>mockResult({action:'tool',reason:'Offline fault and correction fixture, not measured AI competence.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});

test('oversize rejection preserves authoritative source, checks, publication and exact replay identity',async()=>{
 const f=setup();try{
  f.tools.seed('v','brief',{kind:'service',files:serviceBriefFiles(),inputs:{...defaultServiceInputs,enforceHandoff:true},provenance:'offline fixture'});
  assert.equal((await f.tools.execute({ventureId:'v',taskId:'brief',tool:'check.run',args:{}})).ok,true);
  assert.equal((await f.tools.execute({ventureId:'v',taskId:'brief',tool:'artifact.publish_local',args:{}})).ok,true);
  const before=f.tools.load('v','brief'),download=f.tools.download('v','brief').content;
  const revisions=()=>f.store.db.prepare('SELECT COUNT(*) n FROM records WHERE json_extract(body,\'$.kind\')=\'LocalSourceRevision\'').get()!.n;
  const count=revisions(),failed=await f.write('brief','x'.repeat(20542),'oversize');
  assert.equal(failed.error,'WORKSPACE_HANDOFF_TOO_LARGE');assert.equal(failed.ok,false);
  assert.deepEqual(failed.changes,[]);assert.equal(failed.output.actualBytes,20542);assert.equal(failed.output.limitBytes,18000);assert.equal(failed.output.effect,'none');
  assert.equal(failed.output.path,'brief.json');assert.equal(failed.output.currentSourceHash,before.manifest.files[0].sha256);
  assert.deepEqual(f.tools.load('v','brief'),before);assert.equal(f.tools.download('v','brief').content,download);assert.equal(revisions(),count);
  assert.deepEqual(await f.write('brief','x'.repeat(20542),'oversize'),failed);
  assert.deepEqual(f.tools.recoverOperation('oversize','v','brief'),failed);
  await assert.rejects(()=>f.write('brief','different candidate','oversize'),/TOOL_INVOCATION_CONFLICT/);
  const corrected=await f.write('brief',serviceBriefFiles()[0].content+'\n','fresh-correction');assert.equal(corrected.ok,true);assert.equal(corrected.manifest?.revision,before.manifest.revision+1);
  assert.equal(f.tools.load('v','brief').checkedManifest,null);assert.equal(f.tools.load('v','brief').published,null);
 }finally{f.close();}
});

test('service and operating limits use complete raw UTF-8 bytes with inclusive boundaries',async()=>{
 const f=setup();try{
  for(const [taskId,limit,extra]of [['brief',18000,{}],['operating',9000,{operatingProfile:'operating-packet-v1'}]]as const){
   f.tools.seed('v',taskId,{kind:'service',files:[{path:'brief.json',content:'{}'}],inputs:{...defaultServiceInputs,enforceHandoff:true,...extra},provenance:'offline byte fixture'});
   const exact='é'.repeat(limit/2);assert.equal(exact.length,limit/2);
   assert.equal((await f.write(taskId,exact,'exact-'+taskId)).ok,true);
   const old=f.tools.load('v',taskId),failed=await f.write(taskId,exact+'a','over-'+taskId);
   assert.equal(failed.output.actualBytes,limit+1);assert.equal(failed.error,'WORKSPACE_HANDOFF_TOO_LARGE');assert.deepEqual(f.tools.load('v',taskId),old);
   const check=await f.tools.execute({ventureId:'v',taskId,tool:'check.run',args:{}});assert.equal(check.ok,false,'Byte compliance cannot waive invalid report structure');
  }
 }finally{f.close();}
});

test('software limit includes all serialized files and JSON escapes; historical unbound profiles retain their old limit',async()=>{
 const f=setup();try{
  f.tools.seed('v','software',{kind:'software',files:[{path:'app.html',content:''}],inputs:{profile:'quote-to-job-v2'},provenance:'offline fixture'});
  const overhead=Buffer.byteLength(JSON.stringify([{path:'app.html',content:''}])),content='a'.repeat(24000-overhead);
  assert.equal((await f.write('software',content,'exact-software','app.html')).ok,true);
  assert.equal((await f.write('software',content+'a','over-software','app.html')).output.actualBytes,24001);
  assert.equal((await f.write('software',content.slice(0,-1)+'"','escape-software','app.html')).error,'WORKSPACE_HANDOFF_TOO_LARGE');
  assert.equal((await f.write('software','a','extra-file','notes.txt')).error,'WORKSPACE_HANDOFF_TOO_LARGE');
  f.tools.seed('v','legacy',{kind:'software',files:[{path:'app.html',content:''}],inputs:{profile:'quote-to-job-v1'},provenance:'historical unbound fixture'});
  assert.equal((await f.write('legacy','x'.repeat(25000),'legacy','app.html')).ok,true);
 }finally{f.close();}
});

test('source-bound task receives failure feedback, corrects under unchanged hashes and finishes without poisoning later context',async()=>{
 const f=setup();try{
  const portfolio=new Portfolio(f.store),evidence=new EvidenceLibrary(f.store);
  portfolio.createVenture({id:'v',name:'Failure-containment fixture',goal:'Verify a rejected oversized write remains correctable.'});
  portfolio.registerWorker({id:'worker',name:'Fixture worker',capabilities:['service.brief'],competencies:['source-review']});
  const source=evidence.add('v',{title:'Permitted source',url:null,text:'A permitted observation exists.',observedAt:new Date().toISOString(),publishedAt:null,rights:'owner_supplied',provenance:'owner_report'});
  portfolio.addPlan('v',{rationale:'Offline containment test.',tasks:[{id:'correct',title:'Correct a brief',lane:'research',capability:'service.brief',dependsOn:[],acceptance:['Deliver the current checked brief.'],requiredChecks:['delivery.current'],requiredCompetencies:['source-review'],allowedTools:['workspace.replace','check.run','artifact.publish_local'],resource:{modelCalls:5,localToolRuns:4},inputs:{sourceBindings:[{id:source.id,sha256:source.sha256}]}}]});
  const inputs={...defaultServiceInputs,sources:[{id:source.id,title:source.title,text:source.text,rights:source.rights}],requiredSourceIds:[source.id]};
  f.tools.seed('v','v/correct',{kind:'service',files:[{path:'brief.json',content:'{}'}],inputs,provenance:'offline blank fixture'});
  const original=f.tools.load('v','v/correct');let calls=0;
  const engine=new PortfolioEngine({portfolio,evidence,tools:f.tools,model:{kind:'offline_mock',async run(call){
   const context=call.request.context as any;calls++;
   if(calls===1)return action('workspace.replace',{path:'brief.json',content:'x'.repeat(20542),expectedHash:original.manifest.files[0].sha256});
   if(calls===2){assert.equal(context.workspace.currentSource[0].content,'{}');assert.equal(context.observations[0].result.error,'WORKSPACE_HANDOFF_TOO_LARGE');assert.equal(context.observations[0].result.output.limitBytes,18000);return action('workspace.replace',{path:'brief.json',content:serviceBriefFiles(inputs)[0].content,expectedHash:original.manifest.files[0].sha256});}
   if(calls===3)return action('check.run');if(calls===4)return action('artifact.publish_local');
   return mockResult({action:'complete',reason:'Offline fixture has delivered a current checked report.',toolCall:null});
  }}});
  await engine.runTask('v/correct');assert.equal(portfolio.getTask('v/correct').status,'completed',JSON.stringify({task:portfolio.getTask('v/correct'),execution:engine.rows('portfolio-execution')}));assert.equal(calls,5);
  assert.equal(f.tools.load('v','v/correct').manifest.revision,2);assert.equal(JSON.parse(f.tools.download('v','v/correct').content).manifest.revision,2);
  assert.equal(engine.rows('portfolio-model-result')[0].result.output.toolCall.arguments.content.length,20542,'Failed candidate remains in immutable attempt evidence');
  assert.equal(engine.rows('model-attempt').length,0,'Mocks cannot fall through to provider billing');
  await engine.recover();assert.equal(calls,5);
 }finally{f.close();}
});
