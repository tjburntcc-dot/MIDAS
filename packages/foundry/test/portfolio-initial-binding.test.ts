import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {StateStore} from '../src/state.ts';
import {hash,canonical,rawHash,scopeKey} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {createPortfolioProposal,writePortfolioProposal,loadLivePortfolio,portfolioRoute,taskDefinitionHash,portfolioRecoveryInstruction} from '../src/portfolio/live.ts';
import {makeWorkerRequest,workerSchema,validateWorker,workerScope} from '../src/portfolio/worker.ts';
import type {WorkerCall} from '../src/portfolio/worker.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {preparePortfolio} from '../src/portfolio/prepare.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {valueReleaseV4TaskAllowances} from '../src/portfolio/value-release-v4.ts';

const base=realpathSync(tmpdir());
function removeTemporary(root:string){const target=realpathSync(root),part=relative(base,target);assert.ok(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(target,{recursive:true,force:true});}
const count=(store:StateStore,kind:string)=>store.db.prepare('SELECT count(*) AS n FROM entities WHERE kind=?').get(kind)!.n;
const completed={id:'resp_local_binding_test',model:'gpt-6-astra',service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:30},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({action:'blocked',reason:'Explicit in-memory transport fixture; no actual model or customer outcome.',toolCall:null})}]}]};
function fixture(options:{legacy?:boolean;liveBoundary?:boolean;recovery?:boolean;schemaHash?:string}={}){
 const root=mkdtempSync(join(base,'portfolio-initial-binding-')),store=new StateStore(join(root,'portfolio.sqlite')),keys=keypair(),requests:any[]=[];let credentialReads=0;
 const id='portfolio-031-initial-binding-test',projectId='proj_test',goal='Review a source-grounded local job',taskId='venture/investigate',tools=['workspace.read','workspace.replace','check.run','artifact.publish_local'];
 const task={id:taskId,ventureId:'venture',title:'Investigate',objective:goal,capability:'research.investigate',dependsOn:[],allowedTools:tools,acceptance:['Retain evidence'],requiredChecks:['delivery.current'],requiredCompetencies:[],resource:{workerSlots:1,modelCalls:4,localToolRuns:4},inputs:{sourceBindings:[{id:'source-test',sha256:hash('retained source')}]}};
 store.transaction(()=>{store.put('portfolio-venture','venture',{id:'venture',goal,status:'active'},null);store.put('portfolio-task',taskId,task,null);});
 const context={business:{goal,summary:'Original reviewed hypothesis'},sources:[{id:'source-test',sha256:hash('retained source'),text:'Exact retained source'}],workspace:{currentSource:[{path:'brief.json',content:'{}'}]}};
 const call=(attemptId='ordinary-1',newContext:any=context):WorkerCall=>({ventureId:'venture',goal,sourceHosts:[],attemptId,request:makeWorkerRequest({ventureId:'venture',taskId,attemptId,tools,context:structuredClone(newContext)}),schema:workerSchema,validate:validateWorker});
 const route=portfolioRoute(id,projectId) as unknown as Parameters<typeof buildResponsesBody>[0];
 const initial={taskId,bodyHash:rawHash(canonical(buildResponsesBody(route,call().request,workerSchema))),schemaHash:options.schemaHash??hash(workerSchema)};
 const input={root,id,projectId,credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),mode:options.liveBoundary?'live' as const:'mock' as const,countUncertaintyMinor:25,recoveryAdmissions:options.recovery?2 as const:0 as const,tasks:[{id:taskId,definitionHash:taskDefinitionHash(task),workCalls:2}],ventures:[{id:'venture',goal,capabilities:[task.capability],tools,workCalls:options.recovery?4:2,searchCalls:0}],...(options.legacy?{}:{initialRequests:[initial]})};
 const proposal=createPortfolioProposal(input);
 proposal.operating.approvedBy='ephemeral-test-owner';proposal.operating.approvalReference='Temporary local fixture only; no real authorization';proposal.portfolio.approved=true;proposal.portfolio.approvedBy=proposal.operating.approvedBy;proposal.portfolio.approvalReference=proposal.operating.approvalReference;proposal.portfolio.operatingGrantHash=hash(proposal.operating);
 const envelope={...signed(proposal.portfolio,keys.privateKey),operatingEnvelope:signed(proposal.operating,keys.privateKey)};
 const transport=(async(_url:any,init:any)=>{const body=JSON.parse(init.body);requests.push(body);if(String(_url).endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});const recovery=JSON.parse(body.input).context.recoveryInstruction;return Response.json(options.recovery&&!recovery?{...completed,status:'incomplete',output:[]}:completed);}) as typeof fetch;
 const execution=options.liveBoundary?{kind:'live' as const,transport,credential:()=>{credentialReads++;throw Error('Credential callback must not be reached');}}:{kind:'mock' as const,transport};
 const ports=loadLivePortfolio(root,store,{envelope,trustedPublicKey:keys.publicKey,execution});
 return {root,store,ports,requests,call,context,input,initial,proposal,taskId,get credentialReads(){return credentialReads;},close(){store.close();removeTemporary(root);}};
}

test('stale initial source, workspace or venture context rejects before binding, ledger, count or credential access',async()=>{
 const f=fixture({liveBoundary:true});try{
  for(const [index,patch]of [{business:{...f.context.business,summary:'Unreviewed new hypothesis'}},{sources:[{...f.context.sources[0],text:'Unreviewed replacement source'}]},{workspace:{currentSource:[{path:'brief.json',content:'{"changed":true}'}]}}].entries()){
   await assert.rejects(()=>f.ports.worker.run(f.call('rejected-'+(index+1),{...f.context,...patch})),(error:any)=>{assert.equal(error.code,'PORTFOLIO_INITIAL_REQUEST_CHANGED');assert.equal(error.expected.bodyHash,f.initial.bodyHash);assert.notEqual(error.actual.bodyHash,f.initial.bodyHash);assert.match(error.message,/"bodyHash":"[a-f0-9]{64}"/);assert.ok(!error.message.includes('Unreviewed'));return true;});
  }
  assert.equal(f.requests.length,0);assert.equal(f.credentialReads,0);assert.equal(count(f.store,'model-attempt'),0);assert.equal(count(f.store,'portfolio-work-binding'),0);
 }finally{f.close();}
});

test('exact first ordinary request is independent of attempt suffix, replays once, and permits actual later context',async()=>{
 const f=fixture();try{
  await assert.rejects(()=>f.ports.worker.run(f.call('ordinary-0',{...f.context,unreviewed:true})),/INITIAL_REQUEST_CHANGED/);
  const first=f.call('ordinary-1'),result=await f.ports.worker.run(first);assert.equal(f.requests.length,2);
  assert.equal(rawHash(canonical(f.requests[1])),f.initial.bodyHash);
  assert.deepEqual(await f.ports.worker.recover!(first),result);assert.equal(f.requests.length,2);
  await f.ports.worker.run(f.call('ordinary-2',{...f.context,observations:[{tool:'workspace.read',output:'Preserved later tool observation'}]}));
  assert.equal(f.requests.length,4);assert.equal(count(f.store,'model-attempt'),2);assert.equal(f.ports.totals().providerRequests,0);
 }finally{f.close();}
});

test('engine records initial-body rejection as known local failure with zero uncertain provider exposure',async()=>{
 const f=fixture({liveBoundary:true});try{
  const portfolio=new Portfolio(f.store),tools=new LocalWorkTools({store:f.store,root:f.root,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(f.store);
  portfolio.registerWorker({id:'fixture-worker',name:'Explicit local fixture worker',competencies:[],capabilities:['research.investigate']});
  const old=f.store.get('portfolio-task',f.taskId);f.store.transaction(()=>f.store.put('portfolio-task',f.taskId,{...old,status:'queued',attempts:0,maxAttempts:1,inputArtifacts:[],outputArtifacts:[],outputCurrent:true,invalidatedAt:null,lease:null,workerId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},old._version));
  f.store.record(workerScope('venture','sources'),'source-test-r1','portfolio.source',{id:'source-test',ventureId:'venture',revision:1,title:'Explicit retained fixture source',url:null,text:'retained source',observedAt:'2026-09-12T00:00:00Z',publishedAt:null,rights:'owner_supplied',provenance:'offline_fixture',sha256:hash('retained source'),supersedes:null});
  tools.seed('venture',f.taskId,{kind:'software',files:[{path:'app.html',content:'<!doctype html><title>Explicit stale-workspace fixture</title>'}],provenance:'offline_fixture'});
  const engine=new PortfolioEngine({portfolio,tools,evidence,model:f.ports.worker,accounting:f.ports.totals});await engine.runTask(f.taskId);
  const task=portfolio.getTask(f.taskId),step=f.store.get('portfolio-step',f.taskId+'/model-0');assert.equal(task.status,'blocked');assert.equal(task.reason,'PORTFOLIO_INITIAL_REQUEST_CHANGED');assert.equal(step.status,'completed');assert.equal(step.outcome.outputRef.providerAdmission,false);assert.equal((task as any).interruptedLease,null);
  assert.equal(f.requests.length,0);assert.equal(f.credentialReads,0);assert.equal(count(f.store,'model-attempt'),0);assert.equal(count(f.store,'portfolio-work-binding'),0);assert.equal(portfolio.snapshot().resources.reserved.modelCalls,0);
 }finally{f.close();}
});

test('initial schema hash is signed; invalid binding scope leaves no partial proposal; legacy grants stay optional',async()=>{
 const f=fixture({schemaHash:'0'.repeat(64)});try{
  await assert.rejects(()=>f.ports.worker.run(f.call()),(error:any)=>{assert.equal(error.code,'PORTFOLIO_INITIAL_REQUEST_CHANGED');assert.equal(error.actual.schemaHash,hash(workerSchema));return true;});assert.equal(f.requests.length,0);assert.equal(count(f.store,'model-attempt'),0);
  const output=join(f.root,'rejected-proposal');assert.throws(()=>writePortfolioProposal(output,{...f.input,initialRequests:[{...f.initial,taskId:'venture/ungranted'}]}),/INITIAL_REQUEST_BINDINGS/);assert.equal(existsSync(output),false);
 }finally{f.close();}
 const legacy=fixture({legacy:true});try{assert.equal(Object.hasOwn(legacy.proposal.portfolio,'initialRequests'),false);await legacy.ports.worker.run(legacy.call('legacy',{legacyContext:true}));assert.equal(legacy.requests.length,2);}finally{legacy.close();}
});

test('known incomplete recovery retains the reviewed initial binding and allows only its existing linked correction',async()=>{
 const f=fixture({recovery:true});try{
  const parent=f.call();await assert.rejects(()=>f.ports.worker.run(parent),/MODEL_RESPONSE_INCOMPLETE/);const proof=f.ports.recoveryEvidence(parent.attemptId);assert.equal(proof.eligible,true);
  const attemptId='linked-recovery',request={...parent.request,requestId:attemptId,context:{...parent.request.context as any,recoveryInstruction:portfolioRecoveryInstruction}};
  f.store.transaction(()=>f.store.put('portfolio-recovery-intent',attemptId,{id:attemptId,parentAttemptId:parent.attemptId,ventureId:'venture',taskId:f.taskId,reason:'known-incomplete-v1',parentRequestHash:proof.parentRequestHash,createdAt:new Date().toISOString()},null));
  const recovery={...parent,attemptId,recoveryOf:parent.attemptId,request};
  await assert.rejects(()=>f.ports.worker.run({...recovery,request:{...request,context:{...request.context,extra:'unapproved'}}}),/RECOVERY_REQUEST_CHANGED/);
  await f.ports.worker.run(recovery);assert.equal(f.requests.length,4);assert.equal(f.ports.totals().recoveryAdmissions,1);assert.equal(f.ports.totals().callsUsed,2);assert.equal(f.ports.totals().providerRequests,0);
 }finally{f.close();}
});

test('V4 CLI binds retained initial bytes and actual first engine request; failed preview creates no proposal files',async()=>{
 const root=mkdtempSync(join(base,'portfolio-v4-packet-')),repo=resolve(fileURLToPath(new URL('../../..',import.meta.url))),cli=join(repo,'packages/foundry/src/portfolio/cli.ts');let store:StateStore|null=new StateStore(join(root,'portfolio.sqlite'));
 try{
  const initial=new Portfolio(store),initialTools=new LocalWorkTools({store,root,scopeFor:portfolioScope});preparePortfolio(initial,initialTools,new EvidenceLibrary(store));store.close();store=null;
  const directory=join(root,'proposal','bound-v4');execFileSync(process.execPath,[cli,'propose','--value-v4','--root',root,'--output',directory,'--id','portfolio-031-binding-cli-test'],{cwd:repo,encoding:'utf8'});
  const proposal=JSON.parse(readFileSync(join(directory,'portfolio.authorization.request.json'),'utf8')),bytes=readFileSync(join(directory,'initial-responses-bytes.json'),'utf8'),binding=proposal.portfolio.initialRequests[0];
  assert.equal(binding.taskId,'quote-desk/investigate-v4');assert.equal(binding.bodyHash,rawHash(bytes));assert.equal(binding.schemaHash,hash(JSON.parse(bytes).text.format.schema));assert.equal(proposal.providerRequests,0);
  store=new StateStore(join(root,'portfolio.sqlite'));const portfolio=new Portfolio(store),tools=new LocalWorkTools({store,root,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);let actual:WorkerCall|undefined;
  const engine=new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:valueReleaseV4TaskAllowances(portfolio)}),model:{kind:'actual_model',async run(call){actual=call;throw Error('Explicit test stop before any provider or credential adapter');}}});
  await engine.runTask(binding.taskId);assert.ok(actual);assert.equal(rawHash(canonical(buildResponsesBody(proposal.operating.route,actual.request,actual.schema))),binding.bodyHash,'Claim time, startedAt and local bookkeeping do not alter reviewed request bytes');assert.equal(count(store,'model-attempt'),0);
  store.close();store=null;
  const failedDirectory=join(root,'proposal','must-not-exist');assert.throws(()=>execFileSync(process.execPath,[cli,'propose','--value-v4','--root',root,'--output',failedDirectory,'--id','portfolio-031-binding-rejected-test'],{cwd:repo,encoding:'utf8',stdio:'pipe'}));assert.equal(existsSync(failedDirectory),false);
 }finally{store?.close();removeTemporary(root);}
});
