import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {hash} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotOutcomes} from '../src/pilot/outcomes.ts';
import {fixturePilotWorker} from '../src/pilot/fixtures-execution.ts';
import {prepareOutcomeAuthorization,loadAuthorizedOutcome} from '../src/pilot/outcome-authorized.ts';
import {adaptiveContract,ADAPTIVE_TOOL} from '../src/adaptive/worker-contract.ts';

for(const prompt of ['baseline','direct'] as const)test(`signed ${prompt} owner outcome compiles procedure/schema, meters its tool action, finalizes and resumes without dispatch`,{timeout:30000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-adaptive-outcome-')),store=new StateStore(join(root,'state.sqlite'));
 try{
  const k=new PilotKnowledge(store),c=k.createCompany({name:'Synthetic outcome',website:'',goal:'Prepare useful local work from current evidence',mode:'fixture'});
  const source=k.addSource(c.id,{title:'Task policy',text:'This synthetic service requires owner review. No sale or price is verified.',kind:'text',rights:'synthetic test',observedAt:new Date().toISOString()});
  const execution=new PilotExecution(store,{root}),outcomes=new PilotOutcomes(store,execution);
  const adaptive={prompt,allowCommands:false,allowServices:false};
  const mandate=outcomes.create(c.id,{objective:c.goal,autonomy:'prepare_supported_work',allowedFamilies:['response-packet'],maxCalls:10,repairReserve:3,adaptive});
  assert.deepEqual(outcomes.prepare(mandate.id).context.mandate.adaptive,adaptive);
  const prepared=prepareOutcomeAuthorization({outcomes},{root,directory:join(root,'proposal'),id:'outcome-034-adaptive-test',outcomeId:mandate.id,projectId:'proj_ADAPTIVE_FIXTURE',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:100,mode:'mock'});
  const profile=prepared.proposal.outcome.profiles[0],contract=adaptiveContract(adaptive);
  assert.equal(profile.procedureHash,hash(contract.procedure));assert.equal(profile.schemaHash,hash(contract.schema));assert.ok(profile.allowedTools.includes(ADAPTIVE_TOOL));
  assert.ok(prepared.proposal.outcome.implementationFiles.some(x=>x.path.endsWith('wsl-supervisor.py')));
  const keys=keypair(),envelope=signed({...prepared.proposal,approvedBy:'ephemeral test principal',approvalReference:'Mock-only controller verification'},keys.privateKey);
  let creates=0,counts=0;
  const transport=(async(url:any,init:any)=>{
   if(String(url).endsWith('/input_tokens')){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}
   assert.equal(init.method,'POST','fixture has no real-network fallthrough');creates++;
   const body=JSON.parse(init.body),payload=JSON.parse(body.input),context=payload.context;
   let output:any;
   if(context.mandate)output={decision:'prepare',rationale:'Prepare useful work with one explicitly scoped generalist.',strongestAlternative:'Retain the current process until additional economic evidence exists.',blockingConditions:[],evidenceRefs:[{sourceId:source.id,quote:source.text}],tasks:[{id:'packet',family:'response-packet',title:'Sourced packet',outcome:'Provide a checked local operating packet',details:'Keep price and external effects unknown.',dependsOn:[],sourceIds:[source.id],competencies:['evidence-synthesis'],reasonForWorker:'The baseline has the declared tools; no superiority claim.',calls:6}],successEvidence:['Current checks and authenticated readback'],limitsOfInference:'Explicit fixture, not model competence'};
   else if(creates===2)output={action:'tool',reason:'Inspect the declared workbench state in this scripted fixture.',toolCall:{name:ADAPTIVE_TOOL,arguments:{payload:JSON.stringify({action:'status'})}}};
   else output=(await fixturePilotWorker().run({request:{context}} as any)).output;
   return Response.json({id:'resp_adaptive_outcome_'+creates,model:'gpt-6-astra',status:'completed',service_tier:'default',background:true,store:true,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});
  }) as typeof fetch;
  const load=()=>loadAuthorizedOutcome({outcomes},root,{testing:{envelope,trustedPublicKey:keys.publicKey,transport}});
  const runner=load();await runner.plan();outcomes.materialize(mandate.id);
  const plannedId=outcomes.get(mandate.id).graph[0].taskId,planned=execution.portfolio.getTask(plannedId);
  store.transaction(()=>store.put('portfolio-task',plannedId,{...planned,inputs:{...planned.inputs,adaptiveExecution:{version:'adaptive-project-v1',prompt:'lean',allowCommands:true,allowServices:true}}},planned._version));
  await assert.rejects(()=>runner.run(),/ADAPTIVE_SCOPE_CHANGED/);assert.equal(creates,1);
  store.transaction(()=>{const changed=execution.portfolio.getTask(plannedId);store.put('portfolio-task',plannedId,{...changed,inputs:planned.inputs},changed._version);});
  let interrupted=false;(runner.engine as any).afterPersist=(kind:string)=>{if(kind==='model'&&!interrupted){interrupted=true;throw Object.assign(new Error('fixture controller interruption after durable response'),{simulatedCrash:true});}};
  await assert.rejects(()=>runner.run(),/controller interruption/);assert.equal(creates,2);assert.equal(counts,2);
  (runner.engine as any).afterPersist=undefined;
  const result=await runner.run();assert.equal(result.state,'completed',JSON.stringify(result));
  const task=execution.portfolio.getTask(result.graph[0].taskId);assert.deepEqual((task.inputs as any).adaptiveExecution,{version:'adaptive-project-v1',...adaptive});
  assert.ok(result.artifacts[0].current);assert.equal(creates,4);assert.equal(counts,creates);
  const calls=creates;await load().run();assert.equal(creates,calls);assert.equal(runner.totals().callsUsed,4);
  const beforeCorrection=result.artifacts[0].hash;
  runner.correct({nodeId:'packet',artifactHash:beforeCorrection,instruction:'Make the owner review boundary explicit before quoting any price.',repairCalls:3,assisted:true});
  const corrected=await runner.run();assert.equal(corrected.state,'completed',JSON.stringify(corrected));assert.notEqual(corrected.artifacts[0].hash,beforeCorrection);assert.equal(creates,6);assert.equal(counts,creates);assert.equal(runner.totals().stageUsage['outcome-repair'].used,2);
  assert.deepEqual((execution.portfolio.getTask(corrected.graph[0].taskId).inputs as any).adaptiveExecution,{version:'adaptive-project-v1',...adaptive});
  const current=outcomes.get(mandate.id);store.transaction(()=>store.put('pilot-outcome-mandate',current.id,{...current,adaptive:{...adaptive,allowCommands:true}},current._version));
  assert.throws(()=>load(),/OUTCOME_PLANNER_BINDING_CHANGED/);
 }finally{store.close();}
});
