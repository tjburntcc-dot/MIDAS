import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PilotService} from '../src/pilot/service.ts';
import {CommercialReview} from '../src/pilot/commercial-review.ts';
import {commercialCases,commercialFixturePort,fixtureCommercialOutput} from '../src/pilot/intelligence-fixtures.ts';
import {intelligenceSchema,validateIntelligence} from '../src/pilot/intelligence-contract.ts';
import {mockResult} from '../src/portfolio/worker.ts';
import {hash,rawHash} from '../src/contracts.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {countPayload} from '../src/experiment/token-count.ts';
import {portfolioRoute} from '../src/portfolio/live.ts';

function setup(which:'service'|'retail'){
 const c=commercialCases[which],requests:string[]=[],root=mkdtempSync(join(tmpdir(),'intelligence-033-'));
 const publicReader={kind:'mock' as const,ports:{dnsLookup:async()=>[{address:'93.184.216.34'}],fetch:async(url:string)=>{requests.push(url);const u=new URL(url),p=c.pages.find(p=>p.path===u.pathname),text=u.pathname==='/robots.txt'?'User-agent: *\nAllow: /':p?'<html><title>'+p.title+'</title><main><p>'+p.text+'</p>'+p.links.map(h=>'<a href="'+h+'">'+h+'</a>').join('')+'</main></html>':'Not found';return {status:p||u.pathname==='/robots.txt'?200:404,headers:{get:(n:string)=>n==='content-type'?(u.pathname==='/robots.txt'?'text/plain':'text/html'):null},arrayBuffer:async()=>new TextEncoder().encode(text).buffer};}}};
 const s=new PilotService(root,{publicReader});return {s,c,root,requests,publicReader};
}
for(const which of ['service','retail'] as const)test(which+' business uses discovery, sourced proposals, executable selection, checked campaign, owner rejection and persisted adaptation',async()=>{
 const f=setup(which);let s=f.s;try{
  const b=s.knowledge.createCompany({name:f.c.name,website:f.c.website,goal:f.c.goal,notes:f.c.notes,mode:'fixture'});
  s.discovery.start(b.id,{website:b.website});await s.discovery.seed(b.id);assert.equal(s.discoveryView(b.id).pagesRetrieved,1);
  for(const [i,p]of f.c.pages.slice(1).entries())await s.discovery.next(b.id,{attemptId:'fixture-'+which+'-read-'+i,port:{kind:'fixture',async run(r){assert.match(JSON.stringify(r.context),/synthetic|test|fixture/i);assert.doesNotMatch(JSON.stringify(r),/fit_kitty_audit|credentialFile|OPENAI_API_KEY/);return mockResult({action:'follow',url:new URL(p.path,b.website).toString(),sourceId:null,reason:'Inspect the decision-relevant public scope or operating policy.',unresolved:[]});}}});
  await s.discovery.next(b.id,{attemptId:'fixture-'+which+'-finish',port:{kind:'fixture',async run(){return mockResult({action:'finish',url:null,sourceId:null,reason:'Current public scope is sufficient for a bounded proposal; private economics remain unknown.',unresolved:['Actual customer behavior and economics remain unobserved.']});}}});
  assert.equal(f.requests.length,5);assert.equal(s.discovery.view(b.id).state,'ready_for_analysis');
  const dc=s.discovery.context(b.id),p=s.intelligence.prepare(b.id,dc);await s.intelligence.analyze(b.id,commercialFixturePort(which,p.sources),dc);
  const original=s.intelligence.view(b.id);assert.equal(original.opportunities.length,2);assert.equal(original.sourceAudit.referenceChecks,'passed');assert.match(original.provenance,/fixture/);
  s.intelligence.reject(b.id,'observe-before-scale','Keep this external observation deferred until owner contact authority exists.');
  assert.throws(()=>s.intelligence.select(b.id,'observe-before-scale'),/OPPORTUNITY_CURRENT/);assert.equal(s.execution.tasks(b.id).length,0);
  const selected=s.intelligence.select(b.id,'clarify-first-step');assert.equal(selected.task.resource.modelCalls,6);await s.execution.run(b.id,selected.task.id);
  assert.equal(s.task(b.id,selected.task.id).status,'completed');const campaign=s.execution.campaignSource(b.id,selected.task.id);assert.equal(campaign.campaign.assets.length,7);assert(campaign.artifact.checks.every((x:any)=>x.passed));
  const pages=s.intelligence.materialize(b.id);assert.equal(pages.length,1);assert.equal(pages[0].resource.modelCalls,8);assert.equal(s.intelligence.materialize(b.id).length,0);
  const next=await s.execution.engine.previewRequest(pages[0].id);assert.equal((next.request.context as any).workspace.inputs.campaign.foundation.offer.value,campaign.campaign.foundation.offer.value);assert.equal((next.request.context as any).dependencies[0].artifacts[0].campaignHash,hash(campaign.campaign));
  const out=s.knowledge.outcome(b.id,{taskId:selected.task.id,artifactHash:campaign.artifact.hash,kind:'not-useful',notes:'Fixture owner report: the packet did not resolve the actual decision. Revisit the missing workflow context.',assisted:true});
  assert(out.id);assert.equal(s.intelligence.view(b.id).current,false);assert.equal(s.intelligence.view(b.id).report,original.report);assert.match(s.view(b.id).understanding.nextAction,/outcome|reconsider|review|revise|revisit/i);
  const before=hash(s.intelligence.view(b.id)),count=s.execution.tasks(b.id).length;s.store.close();s=new PilotService(f.root,{publicReader:f.publicReader});assert.equal(hash(s.intelligence.view(b.id)),before);assert.equal(s.execution.tasks(b.id).length,count);assert.equal(s.view(b.id).accounting.providerCalls,0);
 }finally{s.store.close();}
});
test('analysis rejects unsupported references, preserves a lost response and recovers only its exact identity before rejecting stale application',async()=>{
 const f=setup('service'),s=f.s;try{const b=await s.createCommercialDemo('service'),sources=s.intelligence.sources(b.id),bad=fixtureCommercialOutput('service',sources);bad.findings[0].evidenceRefs[0].quote='Not present';assert.throws(()=>validateIntelligence(bad,sources),/SOURCE_REFERENCE/);
  s.knowledge.updateCompany(b.id,{goal:'Review a changed owner objective without fabricating new evidence.'});
  const p=s.intelligence.prepare(b.id),output=fixtureCommercialOutput('service',p.sources);let calls=0;
  await assert.rejects(s.intelligence.analyze(b.id,{kind:'fixture',async run(){calls++;throw Error('simulated interrupted response');}}));
  await assert.rejects(s.intelligence.analyze(b.id,{kind:'fixture',async run(){calls++;return mockResult(output);}}),/NO_RESUBMIT/);assert.equal(calls,1);
  s.knowledge.updateCompany(b.id,{notes:'A later owner correction must not prevent preservation of an already admitted response.'});
  let recovered=0;await assert.rejects(s.intelligence.resume(b.id,{kind:'fixture',async run(){throw Error('No fresh call allowed');},async recoverSameResponse(r){recovered++;assert.equal(hash(r),hash(p.request));return mockResult(output);}}),/CONTEXT_CHANGED/);
  assert.equal(recovered,1);const record=s.store.get('pilot-commercial-attempt',b.id+'/'+p.attemptId);assert(record.result);assert.equal(record.status,'response_preserved');
 }finally{s.store.close();}
});
test('retained image input is exactly bound into both inference and complete-payload count; text requests remain unchanged',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),route=portfolioRoute('image-contract','proj_TEST',true,true);
 const request:any={scope:{},requestId:'image-contract',task:'investigate',role:{procedure:'Inspect only the supplied synthetic pixel evidence.'},context:{provenance:'offline image transport contract test'},tools:[]};
 const text=buildResponsesBody(route as any,request,intelligenceSchema);assert.equal(typeof text.input,'string');
 request.images=[{sourceId:'retained-image-1',mimeType:'image/png',base64:png.toString('base64'),sha256:rawHash(png),detail:'auto',provenance:'synthetic pixel test; not real model vision'}];
 const body=buildResponsesBody(route as any,request,intelligenceSchema);assert.equal(body.input[0].content[1].type,'input_image');assert.deepEqual(countPayload(body).input,body.input);assert.match(body.input[0].content[0].text,/retained-image-1/);
 request.images[0].sha256='0'.repeat(64);assert.throws(()=>buildResponsesBody(route as any,request,intelligenceSchema),/IMAGE_BYTES_OR_HASH/);
});
test('a supported reported omission creates a scoped candidate and preserves a strong unqualified baseline, never a victory',async()=>{
 const f=setup('retail'),s=f.s;try{const b=await s.createCommercialDemo('retail'),a=s.intelligence.view(b.id),source=s.knowledge.selectedSources(b.id)[1],review=new CommercialReview(s.store),input={analysisAttemptId:a.attemptId,sourceId:source.id,quote:source.text,omission:'Injected evaluation observation: a decision-relevant source was not addressed.',decisionImpact:'This would change which uncertainty needs investigation before proposing work.',severity:'consequential' as const,assisted:true};
  assert.throws(()=>review.record(b.id,{...input,quote:'A nonexistent sentence'}),/SOURCE_REQUIRED/);const result=review.record(b.id,input);assert(result.candidateId);assert.equal(result.decision,'retain_baseline');assert.equal(result.comparison.actualModelCalls,0);assert.equal(result.independentHumanSeconds,null);assert.match(result.candidateProcedure,/coverage table|coverage work|coverage|evidence-coverage/);assert.doesNotMatch(result.candidateProcedure,/Moss|tea retailer|Signal Bench|FitKitty/);assert.equal(review.record(b.id,input).id,result.id);assert(s.view(b.id).learning.some((l:any)=>l.id===result.id));
 }finally{s.store.close();}
});

