import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {hash} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {preparePortfolio} from '../src/portfolio/prepare.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {prepareValueReleaseV4,valueReleaseV4TaskAllowances} from '../src/portfolio/value-release-v4.ts';
import {createPortfolioProposal,loadLivePortfolio,taskDefinitionHash} from '../src/portfolio/live.ts';
import {mockResult} from '../src/portfolio/worker.ts';

const base=realpathSync(tmpdir()),taskId='quote-desk/investigate-v4';
const crash=()=>Object.assign(Error('explicit simulated interruption'),{simulatedCrash:true});
const action=(name:string,args:any={})=>({action:'tool',reason:'Explicit offline fault fixture exercising durable local effects.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
function report(c:any){return JSON.stringify({title:c.workspace.inputs.title,client:c.workspace.inputs.client,asOf:c.workspace.inputs.asOf,observations:c.sources.map((s:any,i:number)=>({id:'fixture-'+i,statement:'Retained source excerpt for this infrastructure test.',sourceId:s.id,quote:s.text.slice(0,180)})),recommendation:{title:'Inspect the actual local evidence',basis:'This is a scripted fault-recovery fixture, not a business recommendation or model-competence claim.',steps:[{action:'Read the retained local packet',owner:'test harness',successMeasure:'Exact source and manifest readback agree'}]},unknowns:['Semantic usefulness, customer value and independent human review remain unobserved.'],obligations:[{id:'review',description:'Actual owner inspection remains outstanding',owner:'owner',status:'open'}]});}
function fixture(padding=0){
 const root=mkdtempSync(join(base,'portfolio-durable-v4-')),file=join(root,'portfolio.sqlite');let store=new StateStore(file),portfolio=new Portfolio(store),tools=new LocalWorkTools({store,root,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
 preparePortfolio(portfolio,tools,evidence);prepareValueReleaseV4(portfolio,evidence);
 // The exact V4 task/resource shape is retained; only its explicit fixture mode
 // differs. The signed transport below is an in-memory mock, never a provider.
 const task=portfolio.getTask(taskId);store.transaction(()=>store.put('portfolio-task',taskId,{...task,inputs:{...task.inputs as any,requiresGrant:false}},task._version));
 const venture=portfolio.getVenture('quote-desk'),proposal=createPortfolioProposal({root,id:'portfolio-031-v4-resume-test',mode:'mock',projectId:'proj_mock',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:400,recoveryAdmissions:2,tasks:valueReleaseV4TaskAllowances(portfolio),ventures:[{id:venture.id,goal:venture.goal,capabilities:['research.investigate','portfolio.plan','software.build','quality.review','service.brief'],tools:task.allowedTools,workCalls:34,searchCalls:2}]}),keys=keypair();
 proposal.operating.approvedBy='ephemeral-test-owner';proposal.operating.approvalReference='Explicit temporary mock fixture; no real authorization';proposal.portfolio.approved=true;proposal.portfolio.approvedBy=proposal.operating.approvedBy;proposal.portfolio.approvalReference=proposal.operating.approvalReference;proposal.portfolio.operatingGrantHash=hash(proposal.operating);
 const envelope={...signed(proposal.portfolio,keys.privateKey),operatingEnvelope:signed(proposal.operating,keys.privateKey)};
 let counts=0,inferences=0,unknown=false;
 const transport=(async(url:any,init:any)=>{if(String(url).endsWith('/input_tokens')){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}inferences++;if(unknown)throw Error('Explicit unknown mock response');const c=JSON.parse(JSON.parse(init.body).input).context,last=c.observations.at(-1)?.tool;
  const output=inferences<=padding?action('workspace.list'):!last||last==='workspace.list'?action('workspace.replace',{path:'brief.json',content:report(c),expectedHash:c.workspace.manifest.files[0].sha256}):last==='workspace.replace'?action('check.run'):last==='check.run'?action('artifact.publish_local'):{action:'complete',reason:'The scripted fixture completed its real local checks and delivery; no customer result is claimed.',toolCall:null};
  return Response.json({id:'resp_mock_'+inferences,model:'gpt-6-astra',service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});}) as typeof fetch;
 const load=()=>loadLivePortfolio(root,store,{envelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}});let ports=load();
 const engineFor=()=>new PortfolioEngine({portfolio,tools,evidence,model:ports.worker,accounting:ports.totals,recoveryAuthority:ports.recoveryEvidence,prepareTask:createTaskPreparer(portfolio,tools,evidence)});let engine=engineFor();
 return {root,get store(){return store;},get portfolio(){return portfolio;},get tools(){return tools;},get evidence(){return evidence;},get engine(){return engine;},get ports(){return ports;},get counts(){return counts;},get inferences(){return inferences;},set unknown(value:boolean){unknown=value;},expectedCalls:padding+4,grantHash:hash(proposal.portfolio),definitionHash:taskDefinitionHash(portfolio.getTask(taskId)),
  reopen(){store.close();store=new StateStore(file);portfolio=new Portfolio(store);tools=new LocalWorkTools({store,root,scopeFor:portfolioScope});evidence=new EvidenceLibrary(store);ports=load();engine=engineFor();},
  close(){store.close();const target=realpathSync(root),part=relative(base,target);assert.ok(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(target,{recursive:true,force:true});}};
}

for(const point of ['before-admission','model','tool','local-effect','before-checkpoint','after-checkpoint','complete-response'] as const)test('V4 maxAttempts=1 durable resume at '+point+' preserves attempts, exact effects and paid limits',async()=>{
 const f=fixture(point==='complete-response'?4:0);try{
  let hit=false;
  if(point==='model'||point==='tool'||point==='complete-response')f.engine.afterPersist=(phase,id)=>{if(!hit&&id===taskId&&(point==='complete-response'?phase==='model'&&f.inferences===f.expectedCalls:phase===point)){hit=true;throw crash();}};
  else if(point==='before-admission'){const reserve=f.portfolio.reserveStep.bind(f.portfolio);f.portfolio.reserveStep=(id,token,kind,step)=>{if(!hit&&id===taskId&&kind==='model'){hit=true;throw crash();}return reserve(id,token,kind,step);};}
  else if(point==='local-effect'){const execute=f.tools.execute.bind(f.tools);f.tools.execute=async input=>{const result=await execute(input);if(!hit&&input.taskId===taskId&&input.tool==='workspace.replace'){hit=true;throw crash();}return result;};}
  else{const checkpoint=f.portfolio.checkpoint.bind(f.portfolio);f.portfolio.checkpoint=(id,token,value)=>{if(!hit&&id===taskId){hit=true;if(point==='after-checkpoint')checkpoint(id,token,value);throw crash();}return checkpoint(id,token,value);};}
  await assert.rejects(()=>f.engine.runTask(taskId),/simulated interruption/);assert(hit);
  const interrupted=f.portfolio.getTask(taskId),oldToken=interrupted.lease!.token,oldGeneration=interrupted.lease!.generation,paidBefore=f.ports.totals().retainedMinor,inferencesBefore=f.inferences;
  assert.equal(interrupted.attempts,1);assert.equal(interrupted.maxAttempts,1);
  if(point==='before-checkpoint'){assert.equal(f.store.get('portfolio-execution',taskId).index,1);assert.equal(interrupted.checkpoint,undefined);}
  f.portfolio.recover({ownerAlive:()=>false});f.reopen();
  const recovered=await f.engine.recover();assert.equal(recovered.pending.length,0);assert.equal(f.portfolio.getTask(taskId).status,'queued','CLI drain can discover the durable continuation');assert.equal(f.inferences,inferencesBefore);assert.equal(f.ports.totals().retainedMinor,paidBefore);
  let newToken='',newGeneration=0;const resume=f.portfolio.resumeTask.bind(f.portfolio);f.portfolio.resumeTask=(id,worker,proof,options)=>{const lease=resume(id,worker,proof,options);if(lease){newToken=lease.token;newGeneration=lease.lease.generation;assert.throws(()=>f.portfolio.heartbeat(id,oldToken),/LEASE_MISMATCH/);}return lease;};
  await f.engine.runTask(taskId);const completed=f.portfolio.getTask(taskId);
  assert.equal(completed.status,'completed',completed.reason);assert.equal(completed.attempts,1);assert.equal(completed.maxAttempts,1);assert.notEqual(newToken,oldToken);assert.ok(newGeneration>oldGeneration);
  assert.equal(taskDefinitionHash(completed),f.definitionHash);assert.equal(f.tools.load('quote-desk',taskId).manifest.revision,2);assert.equal(f.engine.rows('portfolio-tool-intent').filter(r=>r.call.name==='workspace.replace').length,1);
  assert.equal(f.counts,f.expectedCalls);assert.equal(f.inferences,f.expectedCalls);assert.equal(f.ports.totals().callsUsed,f.expectedCalls);assert.equal(f.ports.totals().recoveryAdmissions,0);assert.equal(f.ports.totals().ordinaryWorkLimit,32);assert.equal(f.ports.totals().retainedMinor,f.expectedCalls*123+400);assert.equal(f.ports.totals().providerRequests,0);assert.equal(hash(f.ports.authorization),f.grantHash);
  const used=f.inferences;await f.engine.recover();assert.equal(f.inferences,used);
 }finally{f.close();}
});

test('unknown response cannot obtain a durable-resume lease or another admission',async()=>{
 const f=fixture();try{f.unknown=true;await f.engine.runTask(taskId);assert.equal(f.portfolio.getTask(taskId).status,'needs_reconciliation');const used=f.inferences,money=f.ports.totals().retainedMinor;f.reopen();assert.deepEqual((await f.engine.recover()).pending,[taskId]);assert.throws(()=>f.engine.runTask(taskId),/TASK_NOT_READY_OR_CAPACITY/);assert.equal(f.inferences,used);assert.equal(f.ports.totals().retainedMinor,money);assert.equal(f.portfolio.getTask(taskId).attempts,1);}finally{f.close();}
});

for(const stop of ['pause','cancel'] as const)test('durable resume preserves '+stop+' across reconciliation',async()=>{
 const f=fixture();try{f.engine.afterPersist=()=>{throw crash();};await assert.rejects(()=>f.engine.runTask(taskId));f.portfolio.controlTask(taskId,stop);f.portfolio.recover({ownerAlive:()=>false});f.reopen();await f.engine.recover();assert.equal(f.portfolio.getTask(taskId).status,stop==='pause'?'paused':'cancelled');const used=f.inferences;assert.throws(()=>f.engine.runTask(taskId),/TASK_NOT_READY_OR_CAPACITY/);assert.equal(f.inferences,used);}finally{f.close();}
});

test('explicit owner Resume continues a settled pause without another task attempt',async()=>{
 const f=fixture();try{let paused=false;const execute=f.tools.execute.bind(f.tools);f.tools.execute=async input=>{const result=await execute(input);if(!paused&&input.taskId===taskId){paused=true;f.portfolio.controlTask(taskId,'pause');}return result;};
  await f.engine.runTask(taskId);assert.equal(f.portfolio.getTask(taskId).status,'paused');assert.equal(f.portfolio.getTask(taskId).attempts,1);const used=f.inferences;
  f.portfolio.controlTask(taskId,'resume');assert.equal(f.inferences,used);f.reopen();await f.engine.runTask(taskId);
  const task=f.portfolio.getTask(taskId);assert.equal(task.status,'completed',task.reason);assert.equal(task.attempts,1);assert.equal(task.maxAttempts,1);assert.equal(f.inferences,4);assert.equal(f.ports.totals().recoveryAdmissions,0);assert.equal(taskDefinitionHash(task),f.definitionHash);
 }finally{f.close();}
});

test('pause then Resume cannot manufacture continuation authority for a known-invalid blocked task',async()=>{
 const f=fixture();try{const bad=new PortfolioEngine({portfolio:f.portfolio,tools:f.tools,evidence:f.evidence,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(){return mockResult({action:'complete',reason:'Invalid fixture output',toolCall:{name:'shell.exec'}});}}});
  await bad.runTask(taskId);assert.equal(f.portfolio.getTask(taskId).status,'blocked');f.portfolio.controlTask(taskId,'pause');f.portfolio.controlTask(taskId,'resume');assert.equal((f.portfolio.getTask(taskId) as any).interruptedLease,null);
  assert.throws(()=>f.engine.runTask(taskId),/TASK_NOT_READY_OR_CAPACITY/);assert.equal(f.inferences,0);assert.equal(f.portfolio.getTask(taskId).attempts,1);
 }finally{f.close();}
});

test('changed durable intent cannot reconcile a stored response into a resume ticket',async()=>{
 const f=fixture();try{f.engine.afterPersist=()=>{throw crash();};await assert.rejects(()=>f.engine.runTask(taskId));f.portfolio.recover({ownerAlive:()=>false});const key=taskId+'/model-0',intent=f.store.get('portfolio-model-request',key);f.store.transaction(()=>f.store.put('portfolio-model-request',key,{...intent,identity:'0'.repeat(64)},intent._version));f.reopen();await assert.rejects(()=>f.engine.recover(),/DURABLE_RESULT_BINDING/);assert.equal(f.portfolio.getTask(taskId).status,'needs_reconciliation');assert.equal(f.inferences,1);}finally{f.close();}
});
