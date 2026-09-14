import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {mockResult,FINALIZING_WORKER_PROCEDURE} from '../src/portfolio/worker.ts';
import {serviceBriefFiles} from '../src/portfolio/products.ts';
import {AdaptiveWorkTools} from '../src/adaptive/tools.ts';
import {ADAPTIVE_VERSION,adaptiveEnabled} from '../src/adaptive/worker-contract.ts';
import {LEAN_WORKER_PROCEDURE} from '../src/adaptive/lean-worker.ts';
import type {ExecutorBackend} from '../src/adaptive/executor.ts';

const complete=()=>mockResult({action:'complete',reason:'Fixture worker submits the actual retained source, with unknown customer outcomes.',toolCall:null});
const adaptive=(payload:any)=>mockResult({action:'tool',reason:'Scripted integration action; not observed model competence.',toolCall:{name:'adaptive.perform',arguments:{payload:JSON.stringify(payload)}}});
const deliveryPatch=(expectedHash:string)=>mockResult({action:'tool',reason:'Bind the tested repair result into the original delivery.',toolCall:{name:'workspace.patch',arguments:{path:'brief.json',expectedHash,candidateId:null,serialization:'preserve',edits:[{find:'Test a confirmed-access and arrival-window checklist',replace:'Review the verified fixture import before use'}]}}});
function fixture(prompt:'lean'|'baseline'|null='lean',modelCalls=12){
 const root=mkdtempSync(join(tmpdir(),'midas-adaptive-engine-'));let store=new StateStore(join(root,'state.sqlite')),portfolio=new Portfolio(store),evidence=new EvidenceLibrary(store),base=new LocalWorkTools({root,store,scopeFor:portfolioScope});
 let executions=0;
 const backend:ExecutorBackend={async execute(command){executions++;const content=readFileSync(join(command.workspace,'parser.txt'),'utf8'),passed=content==='valid parser';return {status:passed?'completed':'failed',exitCode:passed?0:1,stdout:passed?'fixture rows verified':'',stderr:passed?'':'fixture parser rejected rows',truncated:false,isolation:'injected'};}};
 const connect=()=>new AdaptiveWorkTools({root,store,base,evidence,taskFor:id=>portfolio.getTask(id),backend,provenance:'fixture'});
 let tools=connect();
 portfolio.createVenture({id:'v',name:'Synthetic fixture',goal:'Verify the shared engine integration, not model intelligence.'});portfolio.registerWorker({id:'worker',name:'Fixture worker',capabilities:['service.brief'],competencies:[]});
 const source=evidence.add('v',{title:'Permitted fixture rule',url:null,text:'A permitted fact exists.',observedAt:new Date().toISOString(),publishedAt:null,rights:'owner_supplied',provenance:'offline_fixture'});
 portfolio.addPlan('v',{rationale:'Fixture scenario for the existing engine',tasks:[{id:'work',title:'Useful fixture brief',objective:'Finish the original brief using a verified import',capability:'service.brief',lane:'research',dependsOn:[],acceptance:['Preserve evidence and publish the current brief'],requiredChecks:['delivery.current'],allowedTools:['workspace.replace','workspace.patch','workspace.candidate_read','check.run','artifact.publish_local',...(prompt?['adaptive.perform']:[])],effectAuthority:{kind:'local',reference:'explicit fixture local authority'},inputs:{executionProtocol:'bounded-finalize-v1',feedbackPolicy:'defer_to_declared_decision',enforceHandoff:true,...(prompt?{adaptiveExecution:{version:ADAPTIVE_VERSION,prompt,allowCommands:true}}:{})},resource:{modelCalls,localToolRuns:20},maxAttempts:1}]});
 const inputs={title:'Useful fixture brief',client:'Fixture',asOf:'2026-09-14',enforceHandoff:true,sources:[source],requiredSourceIds:[source.id]};base.seed('v','v/work',{kind:'service',inputs,files:serviceBriefFiles(inputs),provenance:'Development-authored integration fixture'});
 let calls=0;const requests:any[]=[];
 const make=(answer:(call:any)=>any)=>new PortfolioEngine({portfolio,evidence,tools,model:{kind:'offline_mock',async run(call){calls++;requests.push(call);const value=answer(call);call.validate(value.output);return value;}}});
 return {root,get store(){return store;},get portfolio(){return portfolio;},get base(){return base;},get tools(){return tools;},make,requests,get calls(){return calls;},get executions(){return executions;},reopen(){store.close();store=new StateStore(join(root,'state.sqlite'));portfolio=new Portfolio(store);evidence=new EvidenceLibrary(store);base=new LocalWorkTools({root,store,scopeFor:portfolioScope});tools=connect();},close(){store.close();rmSync(root,{recursive:true,force:true});}};
}

test('shared engine receives adaptive failure, patches the scoped workbench, resumes parent and finalizes real local source',async()=>{
 const f=fixture();try{
  await f.make(call=>{const ctx=call.request.context,last=ctx.observations.at(-1)?.result;
   switch(f.calls){
    case 1:assert(call.request.role.procedure.startsWith(LEAN_WORKER_PROCEDURE));return adaptive({action:'write',path:'parser.txt',content:'broken parser',expectedHash:null});
    case 2:assert.equal(last.ok,true);return adaptive({action:'command',argv:['fixture-check'],timeoutMs:1000});
    case 3:assert.equal(last.ok,false);assert.match(last.output.stderr,/rejected rows/);return adaptive({action:'patch',path:'parser.txt',expectedHash:f.tools.workspace(f.portfolio.getTask('v/work')).read('parser.txt').sha256,edits:[{find:'broken',replace:'valid'}]});
    case 4:assert.equal(last.ok,true);return adaptive({action:'command',argv:['fixture-check'],timeoutMs:1000});
    case 5:assert.equal(last.ok,true);assert.match(last.output.stdout,/verified/);return deliveryPatch(ctx.workspace.manifest.files[0].sha256);
    default:return complete();
   }
  }).runTask('v/work');
  const task=f.portfolio.getTask('v/work');assert.equal(task.status,'completed',task.reason);assert.equal(f.executions,2);assert.equal(f.calls,6);assert.equal(task.attempts,1);
  assert(f.requests.every(r=>r.request.context.task.objective==='Finish the original brief using a verified import'));
  const bundle=JSON.parse(f.base.download('v','v/work').content);assert(bundle.files.some((file:any)=>file.content.includes('Review the verified fixture import before use')));
  assert.equal(f.store.get('portfolio-finalization','v/work/finalize-5').phase,'closed');assert(f.store.get('adaptive-context-projection','v/work/0'));
 }finally{f.close();}
});

test('nonadaptive baseline request retains its original procedure and schema',async()=>{
 const f=fixture(null);try{const preview=await f.make(complete).previewRequest('v/work');assert.equal(preview.request.role.procedure,FINALIZING_WORKER_PROCEDURE);assert(!JSON.stringify(preview.schema).includes('adaptive.perform'));assert.equal((preview.request.context as any).adaptive,undefined);await f.make(complete).runTask('v/work');assert.equal(f.portfolio.getTask('v/work').status,'completed');assert.equal(f.executions,0);}finally{f.close();}
});

test('invalid opt-in is rejected; unresolved episode prevents otherwise valid delivery completion',async()=>{
 const f=fixture();try{
  const task=f.portfolio.getTask('v/work');assert.equal(adaptiveEnabled(task),true);assert.throws(()=>adaptiveEnabled({...task,effectAuthority:{kind:'external',reference:'not applicable'}}),/ADAPTIVE_LOCAL_AUTHORITY_REQUIRED/);assert.throws(()=>adaptiveEnabled({...task,allowedTools:task.allowedTools.filter(t=>t!=='adaptive.perform')}),/ADAPTIVE_TOOL_REQUIRED/);
  await f.make(call=>{const last=call.request.context.observations.at(-1)?.result;
   if(f.calls===1)return adaptive({action:'write',path:'parser.txt',content:'broken parser',expectedHash:null});
   if(f.calls===2)return adaptive({action:'command',argv:['fixture-check']});
   if(f.calls===3)return adaptive({action:'episode',type:'open',objective:task.objective,obstacle:'Fixture parser rejected required rows',obstacleEvidence:[last.observationId]});
   if(f.calls===4){assert.equal(last.ok,true);return complete();}
   assert.equal(last.code,'ADAPTIVE_CAPABILITY_UNRESOLVED');return mockResult({action:'blocked',reason:'Fixture deliberately stops with an unresolved capability episode.',toolCall:null});
  }).runTask('v/work');
  assert.equal(f.calls,5);assert.notEqual(f.portfolio.getTask('v/work').status,'completed');assert.equal(f.base.load('v','v/work').published,null);
 }finally{f.close();}
});

test('restart after committed adaptive command recovers broker receipt without repeating command or model',async()=>{
 const f=fixture();try{
  await f.tools.execute({ventureId:'v',taskId:'v/work',tool:'adaptive.perform',args:{payload:JSON.stringify({action:'write',path:'parser.txt',content:'valid parser',expectedHash:null})},operationId:'fixture-prepare'});
  const execute=f.tools.execute.bind(f.tools);f.tools.execute=async call=>{const result=await execute(call);if(call.tool==='adaptive.perform')throw Object.assign(Error('fixture interruption after broker commit'),{simulatedCrash:true});return result;};
  await assert.rejects(()=>f.make(()=>adaptive({action:'command',argv:['fixture-check']})).runTask('v/work'),/broker commit/);assert.equal(f.calls,1);assert.equal(f.executions,1);
  f.portfolio.recover({ownerAlive:()=>false});f.reopen();const engine=f.make(()=>complete());await engine.recover();await engine.runTask('v/work');
  assert.equal(f.portfolio.getTask('v/work').status,'completed',f.portfolio.getTask('v/work').reason);assert.equal(f.calls,2);assert.equal(f.executions,1);assert.equal(f.portfolio.getTask('v/work').outputArtifacts.length,1);
 }finally{f.close();}
});


test('known adaptive finishing shortage stops before another avoidable model admission',async()=>{
 const f=fixture('lean',4);try{
  await f.make(call=>{const last=call.request.context.observations.at(-1)?.result;
   if(f.calls===1)return adaptive({action:'write',path:'parser.txt',content:'broken parser',expectedHash:null});
   if(f.calls===2)return adaptive({action:'command',argv:['fixture-check']});
   if(f.calls===3){assert.equal(last.ok,false);return adaptive({action:'episode',type:'open',objective:'Finish the original brief using a verified import',obstacle:'Fixture parser rejected rows',obstacleEvidence:[last.observationId]});}
   throw Error('AVOIDABLE_MODEL_ADMISSION');
  }).runTask('v/work');
  assert.equal(f.calls,3);assert.equal(f.executions,1);assert.equal(f.portfolio.getTask('v/work').reason,'FINISHING_CAPACITY_INSUFFICIENT');
  const shortage=f.store.get('portfolio-finishing-shortage','v/work');assert.equal(shortage.remainingCalls,1);assert.equal(shortage.adaptiveRequiredActions,6);assert.equal(shortage.minimumCalls,7);assert.equal(shortage.providerAdmission,false);assert.equal(f.base.load('v','v/work').published,null);
 }finally{f.close();}
});
