import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {hash,rawHash,canonical} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {fixturePilotWorker} from '../src/pilot/fixtures-execution.ts';
import {preparePilotAuthorization,loadAuthorizedPilot} from '../src/pilot/authorized.ts';
import {pilotImplementationFiles,pilotImplementationHash} from '../src/pilot/binding.ts';
import {LEAN_WORKER_PROCEDURE} from '../src/adaptive/lean-worker.ts';
import {AdaptiveWorkspace} from '../src/adaptive/executor.ts';

test('exact signed adaptive pilot packet binds code and schema and executes through mocked count/background/finalization',async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-adaptive-authorized-')),store=new StateStore(join(root,'pilot.sqlite'));
 try{
  const execution=new PilotExecution(store,{root}),knowledge=new PilotKnowledge(store),company=knowledge.createDemo();
  const task=execution.plan({business:company,sources:knowledge.sources(company.id),workflow:'response-packet',adaptive:{prompt:'lean',allowCommands:false,modelCalls:3,localToolRuns:12}});
  const prepared=await preparePilotAuthorization(execution,{root,directory:join(root,'proposal'),id:'portfolio-pilot-032-adaptive-test',projectId:'proj_OFFLINE_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode:'mock',tasks:[{taskId:task.id,workCalls:3}]});
  const first=prepared.requests[0];assert(first.request.role.procedure.startsWith(LEAN_WORKER_PROCEDURE));assert(JSON.stringify(first.schema).includes('adaptive.perform'));assert.equal(first.bodyHash,rawHash(canonical(first.body)));assert.equal(first.schemaHash,hash(first.schema));
  const boundFiles=pilotImplementationFiles().map(file=>file.path);for(const path of ['adaptive/worker-contract.ts','adaptive/lean-worker.ts','adaptive/tools.ts','adaptive/executor.ts','adaptive/capabilities.ts'])assert(boundFiles.includes(path),path);
  assert.equal(prepared.proposal.portfolio.pilotBinding!.implementationHash,pilotImplementationHash());
  const keys=keypair(),proposal=structuredClone(prepared.proposal);proposal.operating.approvedBy='ephemeral-fixture-owner';proposal.operating.approvalReference='Offline injected transport only; no actual API authority';proposal.portfolio.approved=true;proposal.portfolio.approvedBy=proposal.operating.approvedBy;proposal.portfolio.approvalReference=proposal.operating.approvalReference;proposal.portfolio.operatingGrantHash=hash(proposal.operating);
  const envelope={...signed(proposal.portfolio,keys.privateKey),operatingEnvelope:signed(proposal.operating,keys.privateKey)};
  let counts=0,creates=0,reads=0;const terminal=new Map<string,unknown>();
  const transport=(async(url:any,init:any)=>{
   const endpoint=String(url);assert(endpoint.startsWith('https://api.openai.com/v1/responses'));
   if(endpoint.endsWith('/input_tokens')){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}
   if(endpoint==='https://api.openai.com/v1/responses'&&init.method==='POST'){
    creates++;const body=JSON.parse(init.body);assert.equal(body.reasoning.effort,'max');assert.equal(body.background,true);assert.equal(body.store,true);assert(JSON.stringify(body).includes('adaptive.perform'));
    if(creates===1)assert.equal(rawHash(canonical(body)),first.bodyHash);
    const request=JSON.parse(body.input),context=request.context;
    if(creates===2){const observation=context.observations.at(-1);assert.equal(observation.tool,'adaptive.perform');assert.equal(observation.result.ok,true);assert.equal(context.task.objective,(first.request.context as any).task.objective);}
    const output=creates===1?{action:'tool',reason:'Explicit fixture writes a task-scoped workbench artifact before resuming its original brief.',toolCall:{name:'adaptive.perform',arguments:{payload:JSON.stringify({action:'write',path:'notes/fixture.txt',content:'Offline fixture workbench output; not model competence',expectedHash:null})}}}:(await fixturePilotWorker().run({request:{context}} as any)).output;
    const id='resp_adaptive_fixture_'+creates;terminal.set(id,{id,model:'gpt-6-astra',status:'completed',service_tier:'default',background:true,store:true,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});return Response.json({id,model:'gpt-6-astra',status:'queued',background:true,store:true,output:[],usage:null});
   }
   assert.equal(init.method,'GET');const id=endpoint.split('/').at(-1)!;assert(terminal.has(id));reads++;return Response.json(terminal.get(id));
  }) as typeof fetch;
  const originalAuthority=structuredClone(execution.portfolio.getTask(task.id).effectAuthority);
  store.transaction(()=>{const current=store.get('portfolio-task',task.id);store.put('portfolio-task',task.id,{...current,effectAuthority:{kind:'local',reference:'changed authority reference outside signed definition'}},current._version);});
  assert.throws(()=>loadAuthorizedPilot(execution,root,{envelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}}),/PORTFOLIO_TOOL_ENVELOPE|PORTFOLIO_FROZEN_TASK_SCOPE/);assert.deepEqual({counts,creates,reads},{counts:0,creates:0,reads:0});
  store.transaction(()=>{const current=store.get('portfolio-task',task.id);store.put('portfolio-task',task.id,{...current,effectAuthority:originalAuthority},current._version);});
  const runner=loadAuthorizedPilot(execution,root,{envelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}}),results=await runner.runAll();assert.deepEqual(results.map((result:any)=>result.status),['completed'],JSON.stringify({results,counts,creates,reads}));assert.deepEqual({counts,creates,reads},{counts:3,creates:3,reads:3});assert.equal(runner.totals().providerRequests,0);assert.equal(runner.totals().callsUsed,3);
  assert(execution.artifact(company.id,task.id).checks.every((check:any)=>check.passed));const workspace=new AdaptiveWorkspace({root:join(root,'adaptive'),businessId:company.id,taskId:task.id,policy:{allowCommands:false,network:'off'}});assert.match(workspace.read('notes/fixture.txt').content,/Offline fixture/);
  await runner.runAll();assert.deepEqual({counts,creates,reads},{counts:3,creates:3,reads:3});
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
