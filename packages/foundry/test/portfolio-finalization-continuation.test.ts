import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {hash,rawHash} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {preparePortfolio} from '../src/portfolio/prepare.ts';
import {prepareValueReleaseV4,valueReleaseV4TaskAllowances} from '../src/portfolio/value-release-v4.ts';
import {createPortfolioProposal,loadLivePortfolio} from '../src/portfolio/live.ts';
import {makeWorkerRequest,workerSchema,validateWorker} from '../src/portfolio/worker.ts';
import {serviceBriefFiles} from '../src/portfolio/products.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {backupPortfolio} from '../src/portfolio/continuity.ts';
import {retireContinuationParent,validateContinuation} from '../src/portfolio/continuation.ts';
import {prepareContinuation} from '../tools/prepare-portfolio-continuation.mjs';
import {prepareFinalization} from '../tools/prepare-portfolio-finalization.mjs';

const investigation='quote-desk/investigate-v4';
const tool=(name:string,args:any={})=>({action:'tool',reason:'Ephemeral bounded continuation fixture.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const rejectPlan={summary:'The preserved investigation supports stopping this bounded build.',claims:[],contradictions:[],unknowns:['Buyer value and founder effort remain unknown.'],alternatives:[{name:'quote-to-job',caseFor:'A local engineering exercise could test implementation behavior.',caseAgainst:'This fixture chooses a supported stop without claiming customer value.',evidenceIds:[],decision:'reject'}],priority:45,rationale:'Reject the bounded prototype in this fixture and preserve all evidence and capacity.',cancelTaskIds:[],tasks:[]};
const transport=(answer:(body:any)=>any,seen:any[])=>(async(url:any,init:any)=>{const body=JSON.parse(init.body);seen.push({url:String(url),body});if(String(url).endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});const fixture=answer(body),output=fixture.fixtureOutput??fixture,usage=fixture.fixtureUsage??{input_tokens:100,output_tokens:30};return Response.json({id:'resp_ephemeral_finalization_'+seen.length,model:'gpt-6-astra',service_tier:'default',status:'completed',usage,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});}) as typeof fetch;
function sign(proposal:any,keys:any){proposal=structuredClone(proposal);proposal.operating.approvedBy='ephemeral-fixture-owner';proposal.operating.approvalReference='Ephemeral local test only; no paid authority.';proposal.portfolio.approved=true;proposal.portfolio.approvedBy=proposal.operating.approvedBy;proposal.portfolio.approvalReference=proposal.operating.approvalReference;proposal.portfolio.operatingGrantHash=hash(proposal.operating);return {...signed(proposal.portfolio,keys.privateKey),operatingEnvelope:signed(proposal.operating,keys.privateKey)};}
function exactBrief(content:string,bytes:number){const value=JSON.parse(content);value.fixturePadding='';let result=JSON.stringify(value),remaining=bytes-Buffer.byteLength(result);assert(remaining>0);value.fixturePadding='x'.repeat(remaining);result=JSON.stringify(value);assert.equal(Buffer.byteLength(result),bytes);return result;}

async function fixture(){
 const base=mkdtempSync(join(tmpdir(),'portfolio-finalization-')),originalRoot=join(base,'original'),originalBackup=join(base,'original-backup'),r1Root=join(base,'r1'),r1Backup=join(base,'r1-backup'),r2Root=join(base,'r2'),keys=keypair();mkdirSync(originalRoot);
 const originalStore=new StateStore(join(originalRoot,'portfolio.sqlite')),portfolio=new Portfolio(originalStore),tools=new LocalWorkTools({root:originalRoot,store:originalStore,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(originalStore);preparePortfolio(portfolio,tools,evidence);prepareValueReleaseV4(portfolio,evidence);
 for(const cap of valueReleaseV4TaskAllowances(portfolio)){const task=portfolio.getTask(cap.id);originalStore.transaction(()=>originalStore.put('portfolio-task',task.id,{...task,inputs:{...task.inputs as any,requiresGrant:false}},task._version));}
 const task=portfolio.getTask(investigation),inputs={enforceHandoff:true,title:task.title,client:portfolio.getVenture('quote-desk').name,asOf:'2026-09-12',sources:evidence.forTask(task).map(s=>({id:s.id,title:s.title,text:s.text,rights:s.rights})),requiredSourceIds:[]};
 const corrected=serviceBriefFiles(inputs)[0].content,oversized=corrected+' '.repeat(Math.max(1,20542-Buffer.byteLength(corrected)));tools.seed('quote-desk',investigation,{kind:'service',files:[{path:'brief.json',content:oversized}],inputs,provenance:'Synthetic historical oversized draft.'});
 const originalProposal=createPortfolioProposal({root:originalRoot,id:'portfolio-031-finalization-parent-test',projectId:'proj_mock',credentialFile:null,mode:'mock',expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:400,recoveryAdmissions:2,tasks:valueReleaseV4TaskAllowances(portfolio),ventures:[{id:'quote-desk',goal:portfolio.getVenture('quote-desk').goal,capabilities:['research.investigate','quality.review','portfolio.plan','portfolio.reassess','service.brief','software.build','commercial.prepare'],tools:['workspace.list','workspace.read','workspace.replace','check.run','artifact.publish_local','research.search','research.fetch','research.read'],workCalls:34,searchCalls:2}]});
 const originalEnvelope=sign(originalProposal,keys),seenOriginal:any[]=[];mkdirSync(join(originalRoot,'auth'));writeFileSync(join(originalRoot,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(originalRoot,'portfolio.authorization.json'),JSON.stringify(originalEnvelope));mkdirSync(join(originalRoot,'proposal',originalProposal.portfolio.id),{recursive:true});writeFileSync(join(originalRoot,'proposal',originalProposal.portfolio.id,'portfolio.authorization.request.json'),JSON.stringify(originalProposal));
 const originalPorts=loadLivePortfolio(originalRoot,originalStore,{envelope:originalEnvelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport:transport(()=>({fixtureOutput:tool('workspace.replace',{path:'brief.json',content:oversized,expectedHash:rawHash('{}')}),fixtureUsage:{input_tokens:0,output_tokens:9200}}),seenOriginal)}});
 await originalPorts.worker.run({ventureId:'quote-desk',goal:portfolio.getVenture('quote-desk').goal,sourceHosts:[],attemptId:'fixture-original-0',request:makeWorkerRequest({ventureId:'quote-desk',taskId:investigation,attemptId:'fixture-original-0',tools:task.allowedTools,context:{fixture:'Historical local handoff failure.'}}),schema:workerSchema,validate:validateWorker});
 const now=portfolio.getTask(investigation);originalStore.transaction(()=>originalStore.put('portfolio-task',investigation,{...now,status:'blocked',attempts:1,reason:'CURRENT_SOURCE_HANDOFF_TOO_LARGE'},now._version));
 const b0=backupPortfolio(originalStore,{sourceRoot:originalRoot,backupRoot:originalBackup}),r1Prepared=await prepareContinuation({parentRoot:originalRoot,root:r1Root,backupRoot:originalBackup,manifestHash:b0.manifestHash});
 const r1Proposal=JSON.parse(readFileSync(join(r1Prepared.output,'portfolio.authorization.request.json'),'utf8')),r1Envelope=sign(r1Proposal,keys);retireContinuationParent(r1Envelope.payload,keys.publicKey);mkdirSync(join(r1Root,'auth'));writeFileSync(join(r1Root,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(r1Root,'portfolio.authorization.json'),JSON.stringify(r1Envelope));
 const r1Store=new StateStore(join(r1Root,'portfolio.sqlite')),r1Portfolio=new Portfolio(r1Store),r1Tools=new LocalWorkTools({root:r1Root,store:r1Store,scopeFor:portfolioScope}),r1Evidence=new EvidenceLibrary(r1Store),accepted=exactBrief(corrected,17908),seenR1:any[]=[];let inference=0;
 const costs=[61,59,59,63,55,20,21],r1Ports=loadLivePortfolio(r1Root,r1Store,{envelope:r1Envelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport:transport(()=>{const index=inference++;let output;if(index<4)output=tool('workspace.replace',{path:'brief.json',content:accepted+' '.repeat(1000-index),expectedHash:rawHash(oversized)});else if(index===4)output=tool('workspace.replace',{path:'brief.json',content:accepted,expectedHash:rawHash(oversized)});else if(index===5)output=tool('check.run');else output=tool('artifact.publish_local');return {fixtureOutput:output,fixtureUsage:{input_tokens:0,output_tokens:costs[index]*200}};},seenR1)}});
 const r1Engine=new PortfolioEngine({portfolio:r1Portfolio,tools:r1Tools,evidence:r1Evidence,model:r1Ports.worker,prepareTask:createTaskPreparer(r1Portfolio,r1Tools,r1Evidence),accounting:r1Ports.totals});
 await r1Engine.runTask('quote-desk/investigate-v4-r1');assert.equal(r1Portfolio.getTask('quote-desk/investigate-v4-r1').reason,'TASK_ORDINARY_ALLOWANCE_EXHAUSTED');assert.equal(inference,7);assert.equal(seenR1.length,14);
 const b1=backupPortfolio(r1Store,{sourceRoot:r1Root,backupRoot:r1Backup}),prepared=await prepareFinalization({parentRoot:r1Root,backupRoot:r1Backup,manifestHash:b1.manifestHash,root:r2Root});
 return {base,keys,originalStore,r1Store,r1Root,r2Root,prepared,accepted,r1Envelope,close(){r1Store.close();originalStore.close();const path=realpathSync(base),rel=relative(realpathSync(tmpdir()),path);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(path,{recursive:true,force:true});}};
}

test('R2 preparation imports the authenticated accepted report and freezes only the five unexecuted tasks',{timeout:90000},async()=>{
 const f=await fixture();try{
  const proposal=JSON.parse(readFileSync(join(f.prepared.output,'portfolio.authorization.request.json'),'utf8')),manifest=JSON.parse(readFileSync(join(f.prepared.output,'task-manifest.json'),'utf8')),body=JSON.parse(readFileSync(join(f.prepared.output,'initial-responses-bytes.json'),'utf8')),context=JSON.parse(body.input).context;
  assert.equal(proposal.incrementalExposureMinor,3198);assert.equal(proposal.historicalRetainedMinor,1384);assert.equal(proposal.maximumExposureMinor,4582);assert.equal(proposal.inferenceAdmissions,26);assert.equal(proposal.countAdmissions,26);
  assert.equal(proposal.portfolio.continuation.kind,'portfolio-v4-artifact-continuation-r2');assert.deepEqual(proposal.portfolio.continuation.historical,{admissions:8,counts:8,reservedMinor:984,provisionalMinor:384,settledMinor:0,countBufferMinor:400});
  assert.equal(proposal.portfolio.ventures[0].workCalls,26);assert.equal(proposal.portfolio.ventures[0].searchCalls,0);assert.equal(proposal.portfolio.tasks.length,5);assert.equal(proposal.portfolio.tasks.reduce((n:number,t:any)=>n+t.workCalls,0),24);
  assert.deepEqual(proposal.portfolio.tasks.map((t:any)=>[t.id,t.workCalls]),[['quote-desk/decide-v4-r2',1],['quote-desk/build-v4-r2',10],['quote-desk/review-product-v4-r2',6],['quote-desk/operate-v4-r2',6],['quote-desk/adapt-v4-r2',1]]);
  const preserved=context.dependencies.find((d:any)=>d.id==='explicit-preserved-input').artifacts[0];assert.equal(hash(preserved.report),hash(JSON.parse(f.accepted)));assert.equal(preserved.historicalProvenance.payloadHash,proposal.portfolio.continuation.payloadHash);assert.equal(f.prepared.providerRequests,0);
  const r2Db=new StateStore(join(f.r2Root,'portfolio.sqlite'));try{assert.equal(r2Db.get('portfolio-artifact',manifest.preservedArtifact.id).provenance,'actual_model_historical_reuse');}finally{r2Db.close();}
  assert.equal(manifest.preservedArtifact.briefBytes,17908);assert.equal(manifest.tasks[0].task.dependsOn.length,0);assert.equal(manifest.tasks[0].task.inputArtifacts[0].sha256,manifest.preservedArtifact.sha256);
  for(const entry of manifest.tasks.filter((x:any)=>!x.task.capability.startsWith('portfolio.'))){assert.equal(entry.task.inputs.executionProtocol,'bounded-finalize-v1');assert.equal(entry.task.resource.modelCalls,entry.allowance.workCalls+2);assert.equal(entry.task.resource.localToolRuns,2*entry.allowance.workCalls+2);assert(entry.task.allowedTools.includes('workspace.patch'));assert(entry.task.allowedTools.includes('workspace.candidate_read'));}
  assert.equal(f.r1Store.get('portfolio-task','quote-desk/investigate-v4-r1').status,'blocked');assert.equal(f.r1Store.get('portfolio-revocation',hash(f.r1Envelope.payload)),null);
  const signedR2=sign(proposal,f.keys),r2Store=new StateStore(join(f.r2Root,'portfolio.sqlite'));try{
   assert.throws(()=>loadLivePortfolio(f.r2Root,r2Store,{envelope:signedR2,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport:transport(()=>rejectPlan,[])}}),/RETIREMENT_REQUIRED/);
   retireContinuationParent(signedR2.payload,f.keys.publicKey);validateContinuation(signedR2.payload,f.keys.publicKey,true);const seenR2:any[]=[],ports=loadLivePortfolio(f.r2Root,r2Store,{envelope:signedR2,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport:transport(()=>rejectPlan,seenR2)}});
   assert.equal(ports.totals().historical.reservedMinor,984);assert.equal(ports.totals().combinedCallLimit,34);assert.equal(proposal.portfolio.initialRequests[0].bodyHash,rawHash(readFileSync(join(f.prepared.output,'initial-responses-bytes.json'),'utf8')));
   const r2Portfolio=new Portfolio(r2Store),r2Tools=new LocalWorkTools({root:f.r2Root,store:r2Store,scopeFor:portfolioScope}),r2Evidence=new EvidenceLibrary(r2Store),r2Engine=new PortfolioEngine({portfolio:r2Portfolio,tools:r2Tools,evidence:r2Evidence,model:ports.worker,prepareTask:createTaskPreparer(r2Portfolio,r2Tools,r2Evidence),accounting:ports.totals});
   await r2Engine.runTask('quote-desk/decide-v4-r2');assert.equal(r2Portfolio.getTask('quote-desk/decide-v4-r2').status,'completed');for(const id of ['build','review-product','operate','adapt'])assert.equal(r2Portfolio.getTask('quote-desk/'+id+'-v4-r2').status,'cancelled');
   assert.equal(seenR2.filter(x=>x.url.endsWith('/input_tokens')).length,1);assert.equal(seenR2.filter(x=>!x.url.endsWith('/input_tokens')).length,1);assert.equal(ports.totals().callsUsed,1);assert.equal(ports.totals().combinedCallsUsed,9);assert.equal(f.r1Store.get('portfolio-task','quote-desk/investigate-v4-r1').status,'blocked');
  }finally{r2Store.close();}
 }finally{f.close();}
});

test('R2 preparation fails closed when R1 history gains an unexpected attempt',{timeout:90000},async()=>{
 const f=await fixture();try{
  const scope=f.r1Envelope.payload.accountScope,key=Object.values(scope).join('/');
  const existing=f.r1Store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key LIKE ? ORDER BY key LIMIT 1").get(key+'/%') as any;assert(existing);
  f.r1Store.transaction(()=>f.r1Store.put('model-attempt',key+'/unexpected-r2-history',{...JSON.parse(String(existing.body)),id:'unexpected-r2-history'},null));
  const proposal=JSON.parse(readFileSync(join(f.prepared.output,'portfolio.authorization.request.json'),'utf8'));
  assert.throws(()=>validateContinuation(sign(proposal,f.keys).payload,f.keys.publicKey,false),/FINALIZATION_PARENT_ATTEMPT_COUNT/);
 }finally{f.close();}
});
