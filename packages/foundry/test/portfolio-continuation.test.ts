import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {hash,rawHash,scopeKey} from '../src/contracts.ts';
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
import {validateContinuation,retireContinuationParent} from '../src/portfolio/continuation.ts';
import {prepareContinuation} from '../tools/prepare-portfolio-continuation.mjs';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';
import {readPortfolioAccounting} from '../src/portfolio/accounting-view.ts';

const first='quote-desk/investigate-v4';
const tool=(name:string,args:any={})=>({action:'tool',reason:'Explicit in-memory continuation test, not real inference.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const complete={action:'complete',reason:'Explicit fixture completed the exact checked local artifact.',toolCall:null};
const plan=(decision:string)=>({summary:'Offline fixture build-or-stop result.',claims:[],contradictions:[],unknowns:['Buyer value remains unknown'],alternatives:[{name:'quote-to-job',caseFor:'Bounded engineering question.',caseAgainst:'Commercial case unobserved.',evidenceIds:[],decision}],priority:30,rationale:'Fixtures test control flow, not business judgment.',cancelTaskIds:[],tasks:[]});
function sign(p:any,keys:any){p=structuredClone(p);p.operating.approvedBy='ephemeral-fixture-owner';p.operating.approvalReference='Offline fixture only; no paid authority';p.portfolio.approved=true;p.portfolio.approvedBy=p.operating.approvedBy;p.portfolio.approvalReference=p.operating.approvalReference;p.portfolio.operatingGrantHash=hash(p.operating);return {...signed(p.portfolio,keys.privateKey),operatingEnvelope:signed(p.operating,keys.privateKey)};}
const transport=(answer:(body:any)=>any,seen:any[])=>(async(url:any,init:any)=>{const body=JSON.parse(init.body);seen.push({url:String(url),body});if(String(url).endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});return Response.json({id:'resp_explicit_local_mock_'+seen.length,model:'gpt-6-astra',service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:30},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer(body))}]}]});}) as typeof fetch;
async function fixture(){
 const base=mkdtempSync(join(tmpdir(),'portfolio-continuation-')),parentRoot=join(base,'parent'),root=join(base,'continuation'),backupRoot=join(base,'backup'),keys=keypair();mkdirSync(parentRoot);
 const parentStore=new StateStore(join(parentRoot,'portfolio.sqlite')),p=new Portfolio(parentStore),tools=new LocalWorkTools({root:parentRoot,store:parentStore,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(parentStore);preparePortfolio(p,tools,evidence);prepareValueReleaseV4(p,evidence);
 // A fixture of the historical completed-response/local-handoff failure. The
 // current repaired write tool must never create this state in ordinary work.
 for(const cap of valueReleaseV4TaskAllowances(p)){const t=p.getTask(cap.id);parentStore.transaction(()=>parentStore.put('portfolio-task',t.id,{...t,inputs:{...t.inputs as any,requiresGrant:false}},t._version));}
 const inputs={enforceHandoff:true,title:p.getTask(first).title,client:p.getVenture('quote-desk').name,asOf:'2026-09-12',sources:evidence.forTask(p.getTask(first)).map(s=>({id:s.id,title:s.title,text:s.text,rights:s.rights})),requiredSourceIds:[]};
 const corrected=serviceBriefFiles(inputs)[0].content,draft=corrected+' '.repeat(Math.max(1,20000-Buffer.byteLength(corrected)));
 tools.seed('quote-desk',first,{kind:'service',files:[{path:'brief.json',content:draft}],inputs,provenance:'Explicit synthetic fixture of historical oversized model source.'});
 const original=createPortfolioProposal({root:parentRoot,id:'portfolio-031-parent-test',projectId:'proj_mock',credentialFile:null,mode:'mock',expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:400,recoveryAdmissions:2,tasks:valueReleaseV4TaskAllowances(p),ventures:[{id:'quote-desk',goal:p.getVenture('quote-desk').goal,capabilities:['research.investigate','portfolio.plan','software.build','quality.review','service.brief'],tools:['workspace.list','workspace.read','workspace.replace','check.run','artifact.publish_local','research.search','research.fetch','research.read'],workCalls:34,searchCalls:2}]});
 const envelope=sign(original,keys),seen:any[]=[];mkdirSync(join(parentRoot,'auth'));writeFileSync(join(parentRoot,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(parentRoot,'portfolio.authorization.json'),JSON.stringify(envelope));mkdirSync(join(parentRoot,'proposal',original.portfolio.id),{recursive:true});writeFileSync(join(parentRoot,'proposal',original.portfolio.id,'portfolio.authorization.request.json'),JSON.stringify(original));
 const ports=loadLivePortfolio(parentRoot,parentStore,{envelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport:transport(()=>tool('workspace.replace',{path:'brief.json',content:draft,expectedHash:rawHash('{}')}),seen)}}),task=p.getTask(first);
 await ports.worker.run({ventureId:'quote-desk',goal:p.getVenture('quote-desk').goal,sourceHosts:[],attemptId:'fixture-parent-0',request:makeWorkerRequest({ventureId:'quote-desk',taskId:first,attemptId:'fixture-parent-0',tools:task.allowedTools,context:{fixture:'Historical failure, not new provider activity'}}),schema:workerSchema,validate:validateWorker});
 parentStore.transaction(()=>parentStore.put('portfolio-task',first,{...task,status:'blocked',attempts:1,reason:'CURRENT_SOURCE_HANDOFF_TOO_LARGE'},task._version));
 const backup=backupPortfolio(parentStore,{sourceRoot:parentRoot,backupRoot});const prepared=await prepareContinuation({parentRoot,root,backupRoot,manifestHash:backup.manifestHash});
 const proposal=JSON.parse(readFileSync(join(prepared.output,'portfolio.authorization.request.json'),'utf8')),next=sign(proposal,keys),store=new StateStore(join(root,'portfolio.sqlite')),portfolio=new Portfolio(store),local=new LocalWorkTools({root,store,scopeFor:portfolioScope});
 return {base,parentRoot,parentStore,root,keys,proposal,next,store,portfolio,tools:local,draft,corrected,prepared,close(){store.close();parentStore.close();const path=realpathSync(base),r=relative(realpathSync(tmpdir()),path);assert(r&&!r.startsWith('..')&&!isAbsolute(r));rmSync(path,{recursive:true,force:true});}};
}

test('exact continuation contains full unmodified draft, actionable feedback and product contract; unsigned preparation neither retires nor dispatches',async()=>{
 const f=await fixture();try{const body=JSON.parse(readFileSync(join(f.prepared.output,'initial-responses-bytes.json'),'utf8')),c=JSON.parse(body.input).context;
  assert.equal(c.workspace.currentSource[0].content,f.draft);assert.equal(c.draftCorrection.limitBytes,18000);assert.equal(c.remaining.modelCalls,7);assert.equal(c.prospectiveExecutionProfiles[0].profileId,'quote-to-job-v2');assert.equal(c.workspace.inputs.asOf,'2026-09-12');
  assert.equal(f.proposal.incrementalExposureMinor,4659);assert.equal(f.proposal.maximumExposureMinor,5182);assert.equal(f.proposal.historicalRetainedMinor,523);assert.equal(f.proposal.operating.limits.overheadReserve.minor,400);assert.equal(f.proposal.operating.limits.carryIn.length,1);assert.equal(f.proposal.operating.limits.carryIn[0].exposureMinor,123);assert.equal(f.proposal.inferenceAdmissions,35);
  assert.equal(f.parentStore.get('portfolio-revocation',f.proposal.portfolio.continuation.parentGrantHash),null);
  assert.throws(()=>loadLivePortfolio(f.root,f.store,{envelope:f.next,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport:transport(()=>complete,[])}}),/RETIREMENT_REQUIRED/);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM entities WHERE kind='model-attempt'").get()!.n,1);
 }finally{f.close();}
});

test('parent retirement is exclusive, preserves evidence and stops old dispatch; changed history and double-counting fail closed',async()=>{
 const f=await fixture();try{const c=f.proposal.portfolio.continuation;const old=f.parentStore.get('model-attempt',scopeKey(f.next.payload.accountScope).replace(f.next.payload.id,'portfolio-031-parent-test')+'/fixture-parent-0');
  retireContinuationParent(f.next.payload,f.keys.publicKey);retireContinuationParent(f.next.payload,f.keys.publicKey);validateContinuation(f.next.payload,f.keys.publicKey,true);
  assert.equal(f.parentStore.get('model-attempt',scopeKey(old.scope)+'/fixture-parent-0')._version,old._version);
  const seen:any[]=[],ports=loadLivePortfolio(f.root,f.store,{envelope:f.next,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport:transport(()=>complete,seen)}});assert.equal(ports.totals().retainedMinor,523);assert.equal(ports.totals().remainingMinor,4659);assert.equal(ports.totals().combinedCallsUsed,1);
  const task=f.portfolio.getTask(c.taskId);await assert.rejects(()=>ports.worker.run({ventureId:'quote-desk',goal:f.portfolio.getVenture('quote-desk').goal,sourceHosts:[],attemptId:'oversized-local-only',request:makeWorkerRequest({ventureId:'quote-desk',taskId:task.id,attemptId:'oversized-local-only',tools:task.allowedTools,context:{untransmitted:'x'.repeat(196608)}}),schema:workerSchema,validate:validateWorker}),(e:any)=>e.code==='PORTFOLIO_REQUEST_BYTES_LIMIT'&&e.providerAdmission===false);assert.equal(ports.totals().callsUsed,0);assert.equal(seen.length,0);
  const other=structuredClone(f.next.payload);other.id+='-competing';assert.throws(()=>validateContinuation(other,f.keys.publicKey,true),/CONTINUATION/);
  const broken=structuredClone(f.proposal);broken.operating.limits.carryIn.push({...broken.operating.limits.carryIn[0],id:'second'});const duplicate=sign(broken,f.keys);assert.throws(()=>loadLivePortfolio(f.root,f.store,{envelope:duplicate,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport:transport(()=>complete,[])}}),/AGGREGATE_MISMATCH/);
  f.parentStore.transaction(()=>f.parentStore.put('model-attempt',scopeKey(old.scope)+'/unexpected',{...old,id:'unexpected'},null));assert.throws(()=>validateContinuation(f.next.payload,f.keys.publicKey,true),/PARENT_NOT_COMPLETED/);assert.equal(seen.length,0);
 }finally{f.close();}
});

test('inherited oversized draft cannot publish; model corrects its own source then rejection cancels paid descendants without replaying original',async()=>{
 const f=await fixture();try{
  const id=first+'-r1',original=hash(f.tools.load('quote-desk',first));const check=await f.tools.execute({ventureId:'quote-desk',taskId:id,tool:'check.run',args:{},operationId:'explicit-preflight-check'});assert.equal(check.ok,false);assert(check.checks.some(c=>c.id==='service.handoff'&&!c.passed));assert.equal((await f.tools.execute({ventureId:'quote-desk',taskId:id,tool:'artifact.publish_local',args:{},operationId:'explicit-preflight-publish'})).ok,false);
  // Checks change context, so this is a negative gate test before a fresh fixture
  // for exact signed execution, never a mutation of the prepared live packet.
  assert.equal(hash(f.tools.load('quote-desk',first)),original);
 }finally{f.close();}
 const f2=await fixture();try{const id=first+'-r1';retireContinuationParent(f2.next.payload,f2.keys.publicKey);const seen:any[]=[];
  const ports=loadLivePortfolio(f2.root,f2.store,{envelope:f2.next,trustedPublicKey:f2.keys.publicKey,execution:{kind:'mock',transport:transport(body=>{const c=JSON.parse(body.input).context;if(c.task.allowedTools.length===0)return plan('reject');const w=f2.tools.load('quote-desk',id);if(w.files[0].content===f2.draft)return tool('workspace.replace',{path:'brief.json',content:f2.corrected,expectedHash:rawHash(f2.draft)});if(!w.checkedManifest)return tool('check.run');if(!w.published)return tool('artifact.publish_local');return complete;},seen)}});
  const engine=new PortfolioEngine({portfolio:f2.portfolio,tools:f2.tools,evidence:new EvidenceLibrary(f2.store),model:ports.worker,prepareTask:createTaskPreparer(f2.portfolio,f2.tools,new EvidenceLibrary(f2.store)),accounting:ports.totals});
  await engine.runTask(id);assert.equal(f2.portfolio.getTask(id).status,'completed',f2.portfolio.getTask(id).reason);await engine.runTask('quote-desk/decide-v4-r1');
  assert.equal(f2.portfolio.getTask('quote-desk/decide-v4-r1').status,'completed');for(const t of ['build','review-product','operate','adapt'])assert.equal(f2.portfolio.getTask('quote-desk/'+t+'-v4-r1').status,'cancelled');
  assert.equal(f2.tools.load('quote-desk',first).files[0].content,f2.draft);assert.equal(f2.tools.load('quote-desk',id).files[0].content,f2.corrected);assert.equal(ports.totals().callsUsed,5);assert.equal(ports.totals().combinedCallsUsed,6);assert.equal(seen.length,10);await engine.recover();assert.equal(seen.length,10);
 }finally{f2.close();}
});

test('continuation executes blank build, actual browser checks, authoritative review, operating delivery and reassessment through mock Responses only',{timeout:90000},async()=>{
 const f=await fixture();try{retireContinuationParent(f.next.payload,f.keys.publicKey);const seen:any[]=[];let blank=false,review=false,operating=false;
 const ports=loadLivePortfolio(f.root,f.store,{envelope:f.next,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport:transport(body=>{
  const c=JSON.parse(body.input).context,t=f.portfolio.snapshot().tasks.find(t=>t.lease)!;
  if(t.capability.startsWith('portfolio.'))return plan(t.id.includes('/adapt-')?'retain':'prototype');
  const w=f.tools.load('quote-desk',t.id);assert.equal(c.workspace.currentSource[0].content,w.files[0].content);
  if(t.capability==='software.build'&&w.manifest.revision===1){blank=true;assert.match(w.files[0].content,/Product implementation pending/);return tool('workspace.replace',{path:'app.html',content:quoteProductV2Example()[0].content,expectedHash:w.manifest.files[0].sha256});}
  if(t.capability==='quality.review'){review=true;assert(c.dependencies[0].artifacts[0].software.latestBrowserObservation||c.observations.some((o:any)=>o.tool==='check.run'));}
  if(w.kind==='service'&&w.manifest.revision===1){
   const report=JSON.parse(serviceBriefFiles(w.inputs)[0].content);
   if(w.inputs.operatingProfile){operating=true;assert.equal(c.dependencies[0].artifacts[0].software.files[0].content,quoteProductV2Example()[0].content);
    report.operating={version:'operating-deliverable-v1',reviewedProduct:{artifactHash:w.inputs.reviewedArtifactHash},recommendation:{decision:'revise',rationale:'Offline fixture; commercial evidence remains unobserved.'},trySteps:[{action:'Open the reviewed product and save a quote.',expected:'Reopen the same record.'}],advantage:{statement:'Unmeasured workflow hypothesis.',substitutes:['Spreadsheet and calendar']},contraryEvidence:['Existing quoting software already exists.'],unresolvedAssumptions:['Willingness to switch is unknown.'],demo:{summary:'Fixture-only demonstration.',steps:['Save and reopen a quote','Convert to job and export']},nextObservation:{route:'Owner-arranged consenting operator; no contact made.',record:'Observe their existing workflow.',decisionRule:'Continue only for a consequential unmet need.'},interviewQuestions:['What happens after a quote is accepted?'],acquisitionDraft:{status:'unsent',subject:'Your quoting workflow',body:'Would you show how you turn a quote into a job? No claim of validated value.'},economics:Object.fromEntries(['acquisition','delivery','correction','founderEffort'].map(k=>[k,{status:'unknown',detail:'No real labor or revenue measured.'}])),nextTasks:[{id:'observe',title:'Observe a consenting operator',dependsOn:[],acceptance:['Retain observed friction and contrary evidence.']}],evidence:{findingIds:[report.observations[0].id],sourceIds:[report.observations[0].sourceId],verification:'review_required'}};
   }
   return tool('workspace.replace',{path:'brief.json',content:JSON.stringify(report),expectedHash:w.manifest.files[0].sha256});
  }
  if(!w.checkedManifest)return tool('check.run');if(!w.published)return tool('artifact.publish_local');return complete;
 },seen)}});
 const evidence=new EvidenceLibrary(f.store),engine=new PortfolioEngine({portfolio:f.portfolio,tools:f.tools,evidence,model:ports.worker,prepareTask:createTaskPreparer(f.portfolio,f.tools,evidence),accounting:ports.totals});
 for(const t of f.proposal.portfolio.tasks){await engine.runTask(t.id);assert.equal(f.portfolio.getTask(t.id).status,'completed',t.id+' '+f.portfolio.getTask(t.id).reason);}
 assert(blank&&review&&operating);assert.equal(ports.totals().callsUsed,17);assert.equal(ports.totals().combinedCallsUsed,18);assert.equal(seen.length,34);assert.equal(f.tools.load('quote-desk',first).files[0].content,f.draft);
 const delivered=f.tools.download('quote-desk','quote-desk/operate-v4-r1','report.html');assert.match(delivered.content,/unsent/i);assert.match(delivered.content,/founder/i);
 mkdirSync(join(f.root,'auth'));writeFileSync(join(f.root,'auth','portfolio-owner.pub'),f.keys.publicKey);writeFileSync(join(f.root,'portfolio.authorization.json'),JSON.stringify(f.next));const view=readPortfolioAccounting(f.store,f.root);assert.equal(view.retainedMinor,523+17*123);assert.equal(view.combinedCallsUsed,18);assert.equal(view.countBufferMinor,400);assert.equal(view.settledMinor,null);
 await engine.recover();assert.equal(seen.length,34);
 }finally{f.close();}
});
