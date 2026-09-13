import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {hash} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {PilotLearning} from '../src/pilot/learning.ts';
import {fixturePilotWorker} from '../src/pilot/fixtures-execution.ts';
import {preparePilotAuthorization,loadAuthorizedPilot} from '../src/pilot/authorized.ts';
const sign=(proposal:any,keys:any)=>{const p=structuredClone(proposal);p.operating.approvedBy='ephemeral-local-test-owner';p.operating.approvalReference='Mock transport test only; no provider authority';p.portfolio.approved=true;p.portfolio.approvedBy=p.operating.approvedBy;p.portfolio.approvalReference=p.operating.approvalReference;p.portfolio.operatingGrantHash=hash(p.operating);return {...signed(p.portfolio,keys.privateKey),operatingEnvelope:signed(p.operating,keys.privateKey)};};
async function setup(workflows:Array<'response-packet'|'business-site'>=['response-packet'],mode:'mock'|'live'='mock'){
 const root=mkdtempSync(join(tmpdir(),'midas-pilot-signed-')),store=new StateStore(join(root,'pilot.sqlite')),x=new PilotExecution(store,{root}),knowledge=new PilotKnowledge(store),company=knowledge.createDemo(),learning=new PilotLearning(store),tasks=workflows.map(workflow=>x.plan({business:company,sources:knowledge.sources(company.id),workflow,procedureBinding:learning.assignment(company.id,workflow)}));
 const prepared=await preparePilotAuthorization(x,{root,directory:join(root,'proposal'),id:'portfolio-pilot-032-test',projectId:'proj_OFFLINE_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode,tasks:tasks.map(t=>({taskId:t.id,workCalls:(t.inputs as any).pilotWorkflow==='business-site'?3:2}))});
 const keys=keypair(),env=sign(prepared.proposal,keys),terminal=new Map<string,any>();let counts=0,creates=0,reads=0,lose=false;
 const transport=(async(url:any,init:any)=>{const u=String(url);if(u==='https://api.openai.com/v1/responses/input_tokens'){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}if(u==='https://api.openai.com/v1/responses'&&init.method==='POST'){creates++;const body=JSON.parse(init.body);assert.equal(body.reasoning.effort,'max');assert.equal(body.max_output_tokens,32768);assert.equal(body.background,true);assert.equal(body.store,true);if(lose)throw Error('Explicit lost create fixture');const result=await fixturePilotWorker().run({request:{context:JSON.parse(body.input).context}} as any),id='resp_pilot_test_'+creates;terminal.set(id,{id,model:'gpt-6-astra',status:'completed',service_tier:'default',background:true,store:true,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result.output)}]}]});return Response.json({id,model:'gpt-6-astra',status:'queued',background:true,store:true,output:[],usage:null});}const id=u.split('/').at(-1)!;assert.equal(init.method,'GET');assert.equal(u,'https://api.openai.com/v1/responses/'+id);assert(terminal.has(id));reads++;return Response.json(terminal.get(id));}) as typeof fetch;
 return {root,store,x,knowledge,company,tasks,prepared,keys,env,transport,stats:()=>({counts,creates,reads}),lose:()=>{lose=true;},load:(envelope=env)=>loadAuthorizedPilot(x,root,{envelope,trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}}),close(){store.close();const p=realpathSync(root),r=relative(realpathSync(tmpdir()),p);assert(r&&!r.startsWith('..')&&!isAbsolute(r));rmSync(p,{recursive:true,force:true});}};
}
test('signed pilot supplement executes both profiles through count/background/ledger with no fixture fallback to a provider',async()=>{const f=await setup(['response-packet','business-site']);try{assert.equal(f.prepared.proposal.maximumExposureMinor,1050);assert.equal(f.prepared.summary.approved,false);assert(f.prepared.requests.every(r=>r.body.max_output_tokens===32768));const runner=f.load(),results=await runner.runAll();assert.deepEqual(results.map((r:any)=>r.status),['completed','completed']);assert.deepEqual(f.stats(),{counts:5,creates:5,reads:5});assert.equal(runner.totals().providerRequests,0);assert.equal(runner.totals().retainedMinor,1050);assert.equal(runner.totals().callsUsed,5);for(const t of f.tasks){assert(f.x.artifact(t.ventureId,t.id).checks.every((c:any)=>c.passed));assert.equal(f.x.portfolio.getTask(t.id).workerId,(t.inputs as any).assignedWorkerId);}await f.load().runAll();assert.deepEqual(f.stats(),{counts:5,creates:5,reads:5});}finally{f.close();}});
test('pilot code, procedure and exact initial-request changes reject before count or inference',async()=>{for(const mutation of ['code','procedure','initial'] as const){const f=await setup();try{const env=structuredClone(f.env);if(mutation==='code')env.payload.pilotBinding!.implementationHash='0'.repeat(64);if(mutation==='procedure')env.payload.pilotBinding!.taskProcedures[0].procedureHash='0'.repeat(64);if(mutation==='initial')env.payload.initialRequests![0].bodyHash='0'.repeat(64);env.signature=signed(env.payload,f.keys.privateKey).signature;if(mutation==='initial'){const runner=f.load(env);const result=await runner.run(f.tasks[0].id);assert.notEqual((result as any).status,'completed');}else assert.throws(()=>f.load(env));assert.deepEqual(f.stats(),{counts:0,creates:0,reads:0});}finally{f.close();}}});
test('unknown background creation retains exposure and cannot become a replacement inference',async()=>{const f=await setup();try{f.lose();const runner=f.load();const result=await runner.run(f.tasks[0].id);assert.equal((result as any).status,'needs_reconciliation');assert.deepEqual(f.stats(),{counts:1,creates:1,reads:0});assert.equal(runner.totals().retainedMinor,230);await assert.rejects(()=>f.load().run(f.tasks[0].id));assert.deepEqual(f.stats(),{counts:1,creates:1,reads:0});}finally{f.close();}});
test('existing exact-proposal signer accepts constrained pilot database with ephemeral test keys and never reads an API key',async()=>{const f=await setup(['response-packet'],'live');try{
 const cli=fileURLToPath(new URL('../src/portfolio/cli.ts',import.meta.url)),pub=join(f.root,'ephemeral.pub'),key=join(f.root,'ephemeral.key');writeFileSync(pub,f.keys.publicKey);writeFileSync(key,f.keys.privateKey);
 const args=[cli,'sign-proposal','--root',f.root,'--database','pilot.sqlite','--proposal',join(f.root,'proposal','portfolio.authorization.request.json'),'--approve-proposal-hash',hash(f.prepared.proposal),'--approval-reference','Ephemeral offline signer test only','--owner-public-key',pub,'--owner-private-key',key];
 const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/"credentialRead": false/);assert(existsSync(join(f.root,'portfolio.authorization.json')));assert.equal(f.stats().creates,0);
 const denied=spawnSync(process.execPath,[cli,'status','--root',f.root,'--database','../other.sqlite'],{encoding:'utf8',timeout:15000});assert.notEqual(denied.status,0);assert.match(denied.stderr,/DATABASE_FILE_DENIED/);
 }finally{f.close();}});

test('company corrections and evidence changes block unsigned preparation and every fresh admission without changing historical requests',async()=>{
 for(const change of ['company','selection','source'] as const){const f=await setup();try{
  const oldRequestHash=hash(f.prepared.requests[0].body),task=f.tasks[0];
  if(change==='company')f.knowledge.updateCompany(f.company.id,{name:'Revised test business',goal:'A different confirmed owner goal'});
  if(change==='selection')f.knowledge.selectEvidence(f.company.id,[f.knowledge.sources(f.company.id)[0].id]);
  if(change==='source')f.knowledge.addSource(f.company.id,{title:'New current owner policy',text:'New evidence changes the decision scope. Owner review remains required.',kind:'notes',rights:'Synthetic test source',observedAt:new Date().toISOString()});
  await assert.rejects(()=>preparePilotAuthorization(f.x,{root:f.root,directory:join(f.root,'second-proposal'),id:'portfolio-pilot-032-stale',projectId:'proj_OFFLINE_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode:'mock',tasks:[{taskId:task.id,workCalls:2}]}),/PILOT_OWNER_CONTEXT_CHANGED/);
  await assert.rejects(()=>f.load().run(task.id),/PILOT_OWNER_CONTEXT_CHANGED/);assert.deepEqual(f.stats(),{counts:0,creates:0,reads:0});assert.equal(hash(f.prepared.requests[0].body),oldRequestHash);
 }finally{f.close();}}
});
test('fresh work pins corrected company context into requests, goals and actual website seed without rewriting earlier venture evidence',async()=>{const f=await setup();try{
 const prior=f.prepared.requests[0],originalVenture=f.x.portfolio.getVenture(f.company.id),company=f.knowledge.updateCompany(f.company.id,{name:'Updated studio — synthetic',goal:'Prepare accessible project descriptions before owner consultation'});
 const task=f.x.plan({business:company,sources:f.knowledge.sources(company.id),workflow:'business-site',procedureBinding:new PilotLearning(f.store).assignment(company.id,'business-site')});
 const prepared=await preparePilotAuthorization(f.x,{root:f.root,directory:join(f.root,'fresh-proposal'),id:'portfolio-pilot-032-fresh',projectId:'proj_OFFLINE_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode:'mock',tasks:[{taskId:task.id,workCalls:3}]});
 const context=prepared.requests[0].request.context as any;assert.equal(context.business.name,company.name);assert.equal(context.business.goal,company.goal);assert.equal(context.workspace.inputs.companyName,company.name);assert.equal(prepared.proposal.portfolio.ventures[0].goalHash,hash(company.goal));assert.equal(f.x.portfolio.getVenture(company.id).goal,originalVenture.goal);assert.notEqual((prior.request.context as any).business.goal,company.goal);
 assert.equal(f.stats().creates,0);
 }finally{f.close();}});
test('owner scope changes between decisions prevent the next count/inference admission',async()=>{const f=await setup();try{
 let changed=false;const transport=(async(url:any,init:any)=>{const response=await f.transport(url,init);if(!changed&&String(url)==='https://api.openai.com/v1/responses'&&init.method==='POST'){changed=true;f.knowledge.selectEvidence(f.company.id,[f.knowledge.sources(f.company.id)[0].id]);}return response;}) as typeof fetch;
 const runner=loadAuthorizedPilot(f.x,f.root,{envelope:f.env,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport}}),result=await runner.run(f.tasks[0].id);
 assert.notEqual((result as any).status,'completed');assert.match((result as any).reason??'',/PILOT_OWNER_CONTEXT_CHANGED/);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:1});assert.equal(runner.totals().retainedMinor,230);
 }finally{f.close();}});
test('changed owner scope permits only same-ID recovery of an admitted result, then blocks fresh inference',async()=>{const f=await setup();try{
 const transport=(async(url:any,init:any)=>{if(init.method==='GET')throw Error('Explicit lost GET fixture');return f.transport(url,init);}) as typeof fetch;
 const runner=loadAuthorizedPilot(f.x,f.root,{envelope:f.env,trustedPublicKey:f.keys.publicKey,execution:{kind:'mock',transport}}),result=await runner.run(f.tasks[0].id);assert.equal((result as any).status,'needs_reconciliation');
 f.knowledge.updateCompany(f.company.id,{goal:'Revised owner goal after existing response admission'});
 await assert.rejects(()=>f.load().run(f.tasks[0].id),/PILOT_OWNER_CONTEXT_CHANGED/);assert.deepEqual(f.stats(),{counts:1,creates:1,reads:1});assert.equal(f.x.engine.rows('portfolio-model-result').length,1);assert.equal(f.load().totals().retainedMinor,230);
 }finally{f.close();}});
