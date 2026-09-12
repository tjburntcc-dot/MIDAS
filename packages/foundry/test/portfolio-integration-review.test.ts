import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { StateStore } from '../src/state.ts';
import { hash } from '../src/contracts.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { PortfolioEngine, CAPABILITIES } from '../src/portfolio/engine.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { LocalWorkTools } from '../src/portfolio/tools.ts';
import { portfolioScope } from '../src/portfolio/contracts.ts';
import { preparePortfolio, offlinePortfolioModel } from '../src/portfolio/prepare.ts';
import { prepareOperatingRelease } from '../src/portfolio/release.ts';
import { createTaskPreparer } from '../src/portfolio/task-preparation.ts';
import { mockResult, TOOL_NAMES } from '../src/portfolio/worker.ts';
import type { ResearchPorts } from '../src/operations/research.ts';

function setup(seeded=false,ports?:ResearchPorts){
 const root=mkdtempSync(join(tmpdir(),'portfolio-integration-review-')),store=new StateStore(join(root,'state.sqlite')),portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store,{publicRead:Boolean(ports),ports});
 if(seeded)preparePortfolio(portfolio,tools,evidence);else{
  portfolio.createVenture({id:'review',name:'Independent integration fixture',goal:'Test permitted source handling and useful local work'});
  portfolio.registerWorker({id:'baseline',name:'Explicit test worker',capabilities:CAPABILITIES,competencies:['source-review','evidence-grounded-work']});
  evidence.add('review',{title:'Fixture owner context',url:null,text:'Buyer demand and correction time have not been observed.',observedAt:new Date().toISOString(),publishedAt:null,rights:'owner_supplied',provenance:'offline_fixture'});
 }
 return {root,store,portfolio,tools,evidence,close(){store.close();rmSync(root,{recursive:true,force:true});}};
}
const action=(name:string,args:Record<string,unknown>={})=>mockResult({action:'tool',reason:'Use the current observed input and unchanged trusted checks.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const complete=()=>mockResult({action:'complete',reason:'The fixture result passed current checks and was delivered locally; no customer acceptance is asserted.',toolCall:null});
const specification=(id:string,capability='service.brief',dependsOn:string[]=[])=>({id,title:id,objective:'Produce a useful local evidence packet',lane:'build' as const,capability,dependsOn,acceptance:['Current evidence, complete recommendation and local delivery'],requiredChecks:capability==='portfolio.plan'?['proposal.reference_checks']:['delivery.current'],allowedTools:capability==='portfolio.plan'?[]:[...TOOL_NAMES],resource:{modelCalls:8,localToolRuns:10}});
const proposal=(tasks:any[]=[],cancelTaskIds:string[]=[])=>({summary:'Use the actual reviewed recommendation to choose bounded follow-up work.',claims:[],contradictions:[],unknowns:['Commercial value remains unobserved'],alternatives:[],priority:27,rationale:'The full reviewed packet identifies a reversible next decision; remove superseded preparation.',cancelTaskIds,tasks});
function packet(inputs:any,quotes:Array<{id:string;text:string}>){return {title:inputs.title,client:inputs.client,asOf:inputs.asOf,observations:quotes.map((source,i)=>({id:'finding-'+i,statement:'The retained source supplies this observation.',sourceId:source.id,quote:source.text})),recommendation:{title:'Review the evidence before further work',basis:'These sources support a bounded next decision; demand and causation remain unmeasured.',steps:[{action:'Inspect the source-supported recommendation and record the next decision.',owner:'venture owner',successMeasure:'A retained observation identifies acceptance or a needed correction.'}]},unknowns:['Willingness to pay and independent correction burden'],obligations:[{id:'owner-review',description:'Owner inspects the current packet',owner:'venture owner',status:'open'}]};}

test('real release preparation passes the full reviewed report to planning and preserves executable child lineage',async()=>{
 const f=setup(true);try{
  prepareOperatingRelease(f.portfolio,f.evidence);const ventureId='release-readiness',decide=ventureId+'/decide-v2';
  for(const id of ['investigate-v2','review-v2','decide-v2']){const t=f.portfolio.getTask(ventureId+'/'+id);f.store.transaction(()=>f.store.put('portfolio-task',t.id,{...t,inputs:{...t.inputs as object,requiresGrant:false}},t._version));}
  f.portfolio.addPlan(ventureId,{rationale:'Unstarted work to supersede',tasks:[specification('obsolete')]});
  const mock=offlinePortfolioModel(f.tools);let planningCalls=0;
  const engine=new PortfolioEngine({...f,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(call){
   if(call.request.scope.runId!=='portfolio-'+hash(decide).slice(0,24))return mock.run(call);planningCalls++;const c=call.request.context as any,upstream=f.tools.load(ventureId,ventureId+'/review-v2'),actual=JSON.parse(upstream.files[0].content),shown=c.dependencies[0].artifacts[0];
   assert.deepEqual(shown.report,actual);assert.equal(shown.reportCompleteness,'full authoritative checked report');assert.equal(shown.sha256,f.portfolio.getTask(ventureId+'/review-v2').outputArtifacts[0].sha256);assert.deepEqual(call.request.tools,[]);
   const task=(id:string,capability:string,dependsOn:string[]=[])=>({id,title:id,objective:'Create and review the useful source-grounded packet',lane:'build',capability,dependsOn,acceptance:['Current sourced packet and trusted checks'],requiredCompetencies:['source-review'],allowedTools:[...TOOL_NAMES],priority:40});
   return mockResult(proposal([task('follow-up','service.brief'),task('follow-up-review','quality.review',['follow-up']),task('later','service.brief')],[ventureId+'/obsolete']));
  }}});
  for(const id of ['investigate-v2','review-v2','decide-v2']){await engine.runTask(ventureId+'/'+id);assert.equal(f.portfolio.getTask(ventureId+'/'+id).status,'completed',f.portfolio.getTask(ventureId+'/'+id).reason);}
  assert.equal(f.portfolio.snapshot(ventureId).observations.length,2,'investigation and review retain operating evidence');assert.equal(f.portfolio.snapshot(ventureId).tasks.filter(t=>t.capability==='portfolio.reassess').length,0,'the declared decision consumes initial feedback without extra reassessment calls');
  assert.equal(planningCalls,1);assert.equal(f.portfolio.getTask(ventureId+'/obsolete').status,'cancelled');assert.equal(f.portfolio.getVenture(ventureId).priority,27);
  const suffix=hash(decide).slice(0,6),child=ventureId+'/follow-up-'+suffix,review=ventureId+'/follow-up-review-'+suffix,later=ventureId+'/later-'+suffix;
  assert(f.portfolio.getTask(child).dependsOn.includes(decide));await engine.runTask(child);assert.equal(f.portfolio.getTask(child).status,'completed',f.portfolio.getTask(child).reason);
  await engine.runTask(review);assert.equal(f.portfolio.getTask(review).status,'completed',f.portfolio.getTask(review).reason);assert.equal(f.portfolio.getTask(review).inputArtifacts.length,2,'review handles planner lineage plus one authoritative delivery');
  const artifact=f.portfolio.getTask(ventureId+'/review-v2').result.artifacts[0];
  f.portfolio.publishArtifact(ventureId,{id:artifact.localId,title:artifact.title,kind:artifact.kind,provenance:'Independent fixture correction',content:{correction:'The previously reviewed recommendation changed.'}});
  assert.equal(f.portfolio.getTask(decide).outputCurrent,false);assert.equal(f.portfolio.getTask(later).status,'stale');assert.equal(f.portfolio.snapshot(ventureId).tasks.find(t=>t.id===later)?.runnable,false);
 }finally{f.close();}
});

test('a fetched 24k source stays readable in chunks and its tail can support a checked report',async()=>{
 const marker='The retained final paragraph reports no measured revenue.',url='https://example.org/long-evidence',page='a'.repeat(23900)+marker;let fetches=0;
 const f=setup(false,{dnsLookup:async()=>[{address:'93.184.216.34'}],fetch:async()=>{fetches++;let done=false;return {status:200,headers:{get:name=>name.toLowerCase()==='content-type'?'text/html':null},body:{getReader:()=>({read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode('<html><title>Long evidence</title><body>'+page+'</body></html>')})})}};}});
 try{
  f.portfolio.addPlan('review',{rationale:'Read a normal bounded public page and retain its exact supporting quote',tasks:[specification('investigate','research.investigate')]});let calls=0;
  const engine=new PortfolioEngine({...f,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(call){calls++;const c=call.request.context as any;assert(Buffer.byteLength(JSON.stringify(c))<=56000);assert(c.workspace.inputs.sources.every((source:any)=>source.text===undefined));
   if(calls===1)return action('research.fetch',{url});const source=f.evidence.list('review').find(s=>s.url===url)!;
   if(calls===2){const preview=c.sources.find((s:any)=>s.id===source.id);assert(preview.truncated);assert.equal(preview.textRange.totalCharacters,source.text.length);assert.equal(c.observations.at(-1).result.source.text,undefined);return action('research.read',{path:source.id,query:'0'});}
   if(calls===3){assert.equal(c.observations.at(-1).result.text,source.text.slice(0,12000));return action('research.read',{path:source.id,query:'12000'});}
   if(calls===4){const last=c.observations.at(-1).result;assert.equal(last.sha256,source.sha256);assert(last.text.includes(marker));assert.equal(c.observations.at(-2).result.text,undefined,'old chunks are referenced, not repeated');const owner=c.sources.find((s:any)=>s.rights==='owner_supplied');return action('workspace.replace',{path:'brief.json',expectedHash:c.workspace.manifest.files[0].sha256,content:JSON.stringify(packet(c.workspace.inputs,[{id:owner.id,text:owner.text},{id:source.id,text:marker}]))});}
   if(calls===5)return action('check.run');if(calls===6)return action('artifact.publish_local');assert.equal(calls,7);return complete();
  }}});
  await engine.runTask('review/investigate');assert.equal(f.portfolio.getTask('review/investigate').status,'completed',f.portfolio.getTask('review/investigate').reason);assert.equal(fetches,1);assert.equal(calls,7);assert.equal(f.portfolio.snapshot().resources.reserved.modelCalls,0);
  const report=JSON.parse(f.tools.load('review','review/investigate').files[0].content);assert(report.observations.some((o:any)=>o.quote===marker));
 }finally{f.close();}
});

test('oversized authoritative reports block planning before inference instead of silently losing content',async()=>{
 const f=setup();try{
  f.portfolio.addPlan('review',{rationale:'Test an oversized checked report handoff',tasks:[specification('large-report'),specification('decide','portfolio.plan',['large-report'])]});let calls=0;
  const engine=new PortfolioEngine({...f,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(call){calls++;assert.notEqual(call.request.scope.runId,'portfolio-'+hash('review/decide').slice(0,24),'planner is not called with a partial report');const c=call.request.context as any;
   if(calls===1){const source=c.sources[0],report=packet(c.workspace.inputs,[{id:source.id,text:source.text}]);report.unknowns=['a'.repeat(10000),'b'.repeat(10000)];return action('workspace.replace',{path:'brief.json',expectedHash:c.workspace.manifest.files[0].sha256,content:JSON.stringify(report)});}
   if(calls===2)return action('check.run');if(calls===3)return action('artifact.publish_local');return complete();
  }}});
  await engine.runTask('review/large-report');assert.equal(f.portfolio.getTask('review/large-report').status,'completed');const admitted=f.portfolio.snapshot().resources.used.modelCalls;
  await engine.runTask('review/decide');assert.equal(f.portfolio.getTask('review/decide').status,'blocked');assert.match(f.portfolio.getTask('review/decide').reason,/DEPENDENCY_REPORT_TOO_LARGE_FOR_PLANNING/);assert.equal(f.portfolio.snapshot().resources.used.modelCalls,admitted);assert.equal(calls,4);
 }finally{f.close();}
});

test('offline CLI proposal signing uses matching approval references and never opens a provider credential',{timeout:30000},()=>{
 const root=mkdtempSync(join(tmpdir(),'portfolio-cli-signing-review-')),cli=resolve('packages/foundry/src/portfolio/cli.ts');
 const command=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args,'--root',root],{encoding:'utf8',timeout:20000}));
 try{
  command('prepare');const output=join(root,'unsigned');const prepared=command('propose','--id','portfolio-031-independent-test','--output',output);assert.equal(prepared.providerRequests,0);
  const path=join(output,'portfolio.authorization.request.json'),request=JSON.parse(readFileSync(path,'utf8')),providerCredential=join(root,'provider-credential-deliberately-does-not-exist');
  // This is an isolated signer wiring test. Its ephemeral owner key and fake
  // credential pointer authorize no real account and cannot spend money.
  request.portfolio.credentialFile=providerCredential;request.operating.credentialFile=providerCredential;request.portfolio.operatingGrantHash=hash(request.operating);writeFileSync(path,JSON.stringify(request));
  const keys=generateKeyPairSync('ed25519'),publicPath=join(root,'test-owner.pub'),privatePath=join(root,'test-owner.key');writeFileSync(publicPath,keys.publicKey.export({type:'spki',format:'pem'}));writeFileSync(privatePath,keys.privateKey.export({type:'pkcs8',format:'pem'}));
  const reference='isolated-integration-test-only-no-provider-authority',signed=command('sign-proposal','--proposal',path,'--approve-proposal-hash',hash(request),'--approval-reference',reference,'--principal','Ephemeral integration fixture','--owner-public-key',publicPath,'--owner-private-key',privatePath);
  assert.equal(signed.signed,true);assert.equal(signed.providerRequests,0);assert.equal(signed.credentialRead,false);assert.equal(existsSync(providerCredential),false);
  const envelope=JSON.parse(readFileSync(join(root,'portfolio.authorization.json'),'utf8'));assert.equal(envelope.payload.approvalReference,reference);assert.equal(envelope.operatingEnvelope.payload.approvalReference,reference);assert.equal(envelope.payload.operatingGrantHash,hash(envelope.operatingEnvelope.payload));
  const preflight=command('preflight','--live');assert.equal(preflight.signedGrantValid,true);assert.equal(preflight.providerRequests,0);assert.equal(preflight.credentialRead,false);assert.equal(existsSync(providerCredential),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
