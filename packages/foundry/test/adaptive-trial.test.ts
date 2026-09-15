import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {hash} from '../src/contracts.ts';
import {ReleaseTrial,trialImplementationHash,validateReleaseTrialManifest,releaseTrialTemplate,createSignedMockTrialFactory,prepareTrialLineage} from '../src/adaptive/trial.ts';
import {AdaptiveWorkspace} from '../src/adaptive/executor.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {preparePilotAuthorization} from '../src/pilot/authorized.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import type {ReleaseTrialManifest,TrialStage,FixtureTrialFactory,TrialSnapshot} from '../src/adaptive/trial.ts';
import {runAdaptiveTrialCli} from '../../../tools/adaptive-trial.mjs';

const arms=['strong-direct','preserved-midas-procedure','adaptive-midas'] as const;
function fixture(){
 const base=mkdtempSync(join(tmpdir(),'midas-trial-test-')),root=join(base,'coordinator');
 const spec=(id:string)=>({authorityHash:hash('signed-fixture-'+id),taskDefinitionHash:hash('task-'+id)});
 const stages=arms.map((arm,i)=>({id:'stage-'+i,chunk:'flagship',lineageHash:null,arm,phase:'flagship' as const,runner:i===1?'outcome-journey' as const:'pilot' as const,root:join(base,'arm-'+i),caseId:'synthetic-contract-only',workerFactsHash:hash('facts-'+i),bindingHash:hash(spec('stage-'+i)),configurationHash:hash('declared-distinct-fixture-procedure-'+i),configurationReference:'fixture configuration '+i,migrationDisclosure:'Synthetic test adapter; no actual model or historical parity.',maximumCalls:3,maximumMinor:640}));
 const manifest:ReleaseTrialManifest={kind:'adaptive-release-trial-v1',id:'fixture-trial',mode:'fixture',implementationHash:trialImplementationHash(),caseManifestHash:hash('visible synthetic test data'),caseProviderReference:'test author; not independent evidence',rubricHash:hash('no semantic grader in test'),assessorReference:'unavailable; test asserts null assessment',custody:'externally-supplied-not-protected',orderPolicy:'predeclared-fixed',order:stages.map(s=>s.id),maximumCalls:9,maximumMinor:1920,concurrency:1,comparison:{kind:'disclosed-product-comparison',allowedDifferences:['workerFacts']},stages};
 const controls=new Map<string,{throwAfterAdmission?:boolean;unknown?:boolean;wait?:Promise<void>;bindingChanged?:boolean;limitChanged?:boolean;modelChanged?:boolean}>();
 const callLog:string[]=[];
 const factory:FixtureTrialFactory={kind:'fixture-only',open(stage){
  mkdirSync(stage.root,{recursive:true});const store=new StateStore(join(stage.root,'fixture-runner.sqlite'));
  if(!store.get('runner','state'))store.transaction(()=>store.put('runner','state',{status:'queued',runCalls:0,resumeCalls:0,attemptIds:[]},null));
  const snapshot=():TrialSnapshot=>{const s=store.get('runner','state'),c=controls.get(stage.id)??{};return {binding:c.bindingChanged?spec('changed'):spec(stage.id),configurationHash:stage.configurationHash,workerFactsHash:stage.workerFactsHash,conditions:{workerFacts:stage.workerFactsHash,model:hash(c.modelChanged?'changed-model':'same-model'),evidence:hash('same evidence'),tools:hash('same tools'),resources:hash('same limits')},maximumCalls:stage.maximumCalls+(c.limitChanged?1:0),maximumMinor:stage.maximumMinor,fresh:s.status==='queued',resumable:s.attemptIds.length>0&&!c.unknown,unknownEffect:Boolean(c.unknown&&s.attemptIds.length),completed:s.status==='completed',attemptIds:s.attemptIds,metrics:{runCalls:s.runCalls,resumeCalls:s.resumeCalls,independentSemanticAcceptance:null}};};
  const perform=async(resume:boolean)=>{const c=controls.get(stage.id)??{};callLog.push(stage.id+(resume?':resume':':run'));store.transaction(()=>{const s=store.get('runner','state');if(resume)assert.equal(s.attemptIds.length,1);else assert.equal(s.attemptIds.length,0);store.put('runner','state',{...s,status:'running',runCalls:s.runCalls+(resume?0:1),resumeCalls:s.resumeCalls+(resume?1:0),attemptIds:resume?s.attemptIds:['persisted-'+stage.id]},s._version);});if(!resume&&c.throwAfterAdmission)throw Error('fixture interrupted after existing admission');if(c.wait)await c.wait;store.transaction(()=>{const s=store.get('runner','state');store.put('runner','state',{...s,status:'completed'},s._version);});return {status:'completed'};};
  return {snapshot,run:()=>perform(false),resume:()=>perform(true),close:()=>store.close()};
 }};
 const cleanup=()=>{const safe=resolve(base),r=relative(resolve(tmpdir()),safe);assert(!isAbsolute(r)&&!r.startsWith('..')&&safe.includes('midas-trial-test-'));rmSync(safe,{recursive:true,force:true});};
 return {base,root,manifest,controls,callLog,factory,cleanup};
}

test('fixture coordinator follows fixed order, delegates both runner shapes, persists receipts and does not rerun completion',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});assert.equal(trial.preflight().ready,true);assert.deepEqual(f.callLog,[]);
 await assert.rejects(trial.run('stage-1'),/TRIAL_PREDECLARED_ORDER_REQUIRED/);
 for(const id of f.manifest.order)assert.equal((await trial.run(id)).status,'completed');
 const result=trial.inspect();assert.equal(result.provenance,'fixture');assert.equal(result.independentSemanticAcceptance,null);assert.equal(result.lease.active,false);
 assert.deepEqual(f.callLog,['stage-0:run','stage-1:run','stage-2:run']);trial.close();trial=undefined;
 trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});await trial.run('stage-0');assert.equal(f.callLog.length,3);assert.equal(trial.inspect().stages[0].attemptIds[0],'persisted-stage-0');
 }finally{trial?.close();f.cleanup();}
});

test('all bindings and the aggregate ceiling are checked before any runner dispatch',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{
 const excessive=structuredClone(f.manifest);excessive.maximumMinor--;assert.throws(()=>validateReleaseTrialManifest(excessive),/TRIAL_AGGREGATE_EXCEEDED/);
 const copies=structuredClone(f.manifest);copies.stages[2].configurationHash=copies.stages[0].configurationHash;assert.throws(()=>validateReleaseTrialManifest(copies),/TRIAL_BASELINE_COPIES_DENIED/);
 const roots=structuredClone(f.manifest);roots.stages[2].root=join(roots.stages[0].root,'nested');assert.throws(()=>validateReleaseTrialManifest(roots),/TRIAL_ROOTS_MUST_BE_DISJOINT/);
 const labels=structuredClone(f.manifest) as any;labels.stages[0].graderAnswer='not permitted here';assert.throws(()=>validateReleaseTrialManifest(labels),/TRIAL_STAGE_FIELDS/);
 f.controls.set('stage-2',{bindingChanged:true});trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});assert.equal(trial.preflight().ready,false);await assert.rejects(trial.run('stage-0'),/TRIAL_PREFLIGHT_BLOCKED/);assert.deepEqual(f.callLog,[]);assert.equal(trial.inspect().stages[0].status,'not_started');
 f.controls.set('stage-2',{limitChanged:true});assert.equal(trial.preflight().ready,false);assert.deepEqual(f.callLog,[]);
 f.controls.set('stage-2',{modelChanged:true});assert(trial.preflight().failures.some((e:any)=>e.code==='TRIAL_UNDECLARED_CONTROL_DIFFERENCE'&&e.field==='model'));assert.deepEqual(f.callLog,[]);
 }finally{trial?.close();f.cleanup();}
});

test('interruption retains the same attempt and lease across reopen; resume invokes existing runner recovery once',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{f.controls.set('stage-0',{throwAfterAdmission:true});trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});
 await assert.rejects(trial.run('stage-0'),/fixture interrupted/);const before=trial.inspect();assert.equal(before.lease.active,true);assert.equal(before.stages[0].status,'uncertain');const id=before.stages[0].attemptId;
 trial.close();trial=undefined;trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});await assert.rejects(trial.run('stage-0'),/TRIAL_USE_EXISTING_STAGE_RECOVERY/);
 const done=await trial.run('stage-0','resume');assert.equal(done.attemptId,id);assert.deepEqual(done.attemptIds,['persisted-stage-0']);assert.equal(done.metrics.runCalls,1);assert.equal(done.metrics.resumeCalls,1);assert.equal(trial.inspect().lease.active,false);
 assert.deepEqual(f.callLog,['stage-0:run','stage-0:resume']);
 }finally{trial?.close();f.cleanup();}
});

test('unknown provider or command effects keep the global lease and cannot trigger new dispatch',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{f.controls.set('stage-0',{throwAfterAdmission:true,unknown:true});trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});
 await assert.rejects(trial.run('stage-0'),/fixture interrupted/);const lease=trial.inspect().lease;
 trial.close();trial=undefined;trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});
 await assert.rejects(trial.run('stage-0','resume'),/TRIAL_UNKNOWN_EFFECT_NO_REPLAY/);await assert.rejects(trial.run('stage-1'),/TRIAL_PREDECLARED_ORDER_REQUIRED/);
 assert.equal(trial.inspect().lease.attemptId,lease.attemptId);assert.equal(trial.inspect().lease.active,true);assert.deepEqual(f.callLog,['stage-0:run']);
 }finally{trial?.close();f.cleanup();}
});

test('separate coordinators cannot enter a live lease concurrently',async()=>{
 const f=fixture();let one:ReleaseTrial|undefined,two:ReleaseTrial|undefined,release:()=>void=()=>{};
 try{const wait=new Promise<void>(r=>release=r);f.controls.set('stage-0',{wait});one=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});two=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});
 const active=one.run('stage-0');await new Promise(r=>setImmediate(r));
 await assert.rejects(two.run('stage-0','resume'),/TRIAL_CONCURRENCY_OR_UNCERTAINTY/);assert.deepEqual(f.callLog,['stage-0:run']);release();assert.equal((await active).status,'completed');
 }finally{release();one?.close();two?.close();f.cleanup();}
});

test('fixture factories never enable live mode; current code and manifest changes are rejected',()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{const live={...f.manifest,mode:'live' as const};assert.throws(()=>new ReleaseTrial(f.root,live,{testing:f.factory}),/TRIAL_FIXTURE_CANNOT_AUTHORIZE_LIVE/);
 const stale={...f.manifest,implementationHash:hash('old code')};assert.throws(()=>new ReleaseTrial(f.root,stale,{testing:f.factory}),/TRIAL_CODE_CHANGED/);
 trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});trial.close();trial=undefined;
 const changed=structuredClone(f.manifest);changed.rubricHash=hash('post-result rubric');assert.throws(()=>new ReleaseTrial(f.root,changed,{testing:f.factory}),/TRIAL_MANIFEST_CHANGED/);
 }finally{trial?.close();f.cleanup();}
});

test('template and CLI expose no secret or model transport inputs and no executable hidden cases',async()=>{
 const template=releaseTrialTemplate();assert.equal(template.notExecutable,true);assert.equal(template.providerRequests,0);assert.equal(template.manifest.caseManifestHash,null);
 assert.throws(()=>validateReleaseTrialManifest(template.manifest as any),/TRIAL_EXTERNAL_BINDINGS_REQUIRED/);
 const output:any[]=[];await runAdaptiveTrialCli(['help'],(v:any)=>output.push(v));assert(output[0].commands.some((x:string)=>x.startsWith('inspect-stage')));
 await assert.rejects(runAdaptiveTrialCli(['run','--credential-file','private.txt'],()=>{}),/TRIAL_CLI_ARGUMENT/);
 await assert.rejects(runAdaptiveTrialCli(['run','--transport','anything'],()=>{}),/TRIAL_CLI_ARGUMENT/);
});
test('signed-mock factory uses the actual pilot loader before admission and detects running operations and unstopped services',async()=>{
 const f=fixture();let store:StateStore|undefined,adapter:any;
 try{
  const stage=f.manifest.stages[0];mkdirSync(stage.root,{recursive:true});store=new StateStore(join(stage.root,'pilot.sqlite'));
  const execution=new PilotExecution(store,{root:stage.root}),knowledge=new PilotKnowledge(store),company=knowledge.createDemo();
  const task=execution.plan({business:company,sources:knowledge.sources(company.id),workflow:'response-packet',adaptive:{prompt:'lean',allowCommands:false,modelCalls:3,localToolRuns:12}});
  const prepared=await preparePilotAuthorization(execution,{root:stage.root,directory:join(stage.root,'proposal'),id:'portfolio-pilot-032-trial-mock',projectId:'proj_OFFLINE_TRIAL_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode:'mock',tasks:[{taskId:task.id,workCalls:3}]});
  const keys=keypair(),p=structuredClone(prepared.proposal);p.operating.approvedBy='ephemeral-mock-test';p.operating.approvalReference='Signed mock transport regression only';p.portfolio.approved=true;p.portfolio.approvedBy=p.operating.approvedBy;p.portfolio.approvalReference=p.operating.approvalReference;p.portfolio.operatingGrantHash=hash(p.operating);
  mkdirSync(join(stage.root,'auth'));writeFileSync(join(stage.root,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(stage.root,'portfolio.authorization.json'),JSON.stringify({...signed(p.portfolio,keys.privateKey),operatingEnvelope:signed(p.operating,keys.privateKey)}));
  let providerAttempts=0;const factory=createSignedMockTrialFactory((async()=>{providerAttempts++;throw Error('preflight must never invoke transport');}) as typeof fetch);
  adapter=factory.open(stage);const actual=adapter.snapshot();assert.equal(actual.fresh,true);assert.equal(actual.maximumCalls,3);assert.equal(actual.maximumMinor,640);assert.equal(actual.binding.taskBindings[0].procedureHash,hash(prepared.requests[0].request.role.procedure));assert.deepEqual(actual.attemptIds,[]);assert.equal(providerAttempts,0);
  const binding={businessId:company.id,taskId:task.id,contextHash:hash('synthetic journal binding')};
  store.transaction(()=>store!.put('adaptive-tool-operation','running-op',{id:'running-op',action:'command',binding,status:'running'},null));
  assert.equal(adapter.snapshot().unknownEffect,true);
  store.transaction(()=>{const row=store!.get('adaptive-tool-operation','running-op');store!.put('adaptive-tool-operation','running-op',{...row,status:'completed',result:{ok:true}},row._version);store!.put('adaptive-tool-operation','service-op',{id:'service-op',action:'serviceStart',binding,status:'completed',result:{ok:true,output:{operationId:'service-op',status:'running'}}},null);});
  assert.equal(adapter.snapshot().unknownEffect,true);assert.deepEqual(adapter.snapshot().metrics.unresolvedServiceIds,['service-op']);
  store.transaction(()=>store!.put('adaptive-service-stop','stop-observation',{businessId:company.id,taskId:task.id,serviceId:'service-op',state:{quiescent:true,stopConfirmed:true}},null));
  assert.equal(adapter.snapshot().unknownEffect,false);assert.equal(providerAttempts,0);assert.equal(adapter.snapshot().metrics.independentSemanticAcceptance,null);
  store.transaction(()=>store!.put('adaptive-task-execution-lease','completed-operation-lease',{businessId:company.id,taskId:task.id,operationId:'running-op',kind:'command',status:'active'},null));
  assert.equal(adapter.snapshot().unknownEffect,true);
  store.transaction(()=>{const row=store!.get('adaptive-task-execution-lease','completed-operation-lease');store!.put('adaptive-task-execution-lease','completed-operation-lease',{...row,status:'released'},row._version);});
  assert.equal(adapter.snapshot().unknownEffect,false);
  store.transaction(()=>store!.put('model-attempt','unbound-other-account/old-request',{id:'old-request',finishedAt:new Date().toISOString(),status:'transport_error'},null));
  assert.throws(()=>adapter.snapshot(),/TRIAL_UNBOUND_HISTORICAL_ATTEMPT/);assert.equal(providerAttempts,0);
 }finally{adapter?.close();store?.close();f.cleanup();}
});
test('deferred phase binding preserves the fixed global allocation and only binds after preceding work completes',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{
  const bound=f.manifest.stages.map((s,i)=>{const id='transfer-'+i;return {...s,id,chunk:'transfer',phase:'transfer' as const,root:join(f.base,id),caseId:'visible synthetic transfer test',bindingHash:hash({authorityHash:hash('signed-fixture-'+id),taskDefinitionHash:hash('task-'+id)})};});
  f.manifest.stages.push(...bound.map(s=>({...s,bindingHash:'deferred',workerFactsHash:'deferred',configurationHash:'deferred',lineageHash:'deferred'})));f.manifest.order.push(...bound.map(s=>s.id));f.manifest.maximumCalls=18;f.manifest.maximumMinor=3840;
  trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});assert.equal(trial.preflight().ready,true);assert.equal(trial.preflight().pendingBindings.length,3);
  assert.throws(()=>trial!.bindChunk(bound),/TRIAL_PREDECLARED_ORDER_REQUIRED/);
  for(const id of f.manifest.order.slice(0,3))await trial.run(id);
  assert.equal(trial.preflight().ready,false);await assert.rejects(trial.run(bound[0].id),/TRIAL_PREFLIGHT_BLOCKED/);
  const changed=structuredClone(bound);changed[0].maximumCalls=4;assert.throws(()=>trial!.bindChunk(changed),/TRIAL_CHUNK_SCOPE_CHANGED/);
  trial.bindChunk(bound);assert.equal(trial.preflight().ready,true);trial.close();trial=undefined;
  trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});for(const s of bound)await trial.run(s.id);
  assert.equal(trial.inspect().stages.length,6);assert.equal(f.callLog.filter(x=>x.endsWith(':run')).length,6);assert.equal(trial.manifest.maximumCalls,18);assert.equal(trial.manifest.maximumMinor,3840);
 }finally{trial?.close();f.cleanup();}
});

test('development uses the global envelope before independently supplied flagship facts are bound as one complete cohort',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{
  const flagship=f.manifest.stages.map(s=>({...s,maximumCalls:20,maximumMinor:4200}));
  const id='development',development={...flagship[2],id,chunk:'development',phase:'development' as const,runner:'outcome-journey' as const,root:join(f.base,'development'),caseId:'visible-development-population',bindingHash:hash({authorityHash:hash('signed-fixture-'+id),taskDefinitionHash:hash('task-'+id)}),maximumCalls:28,maximumMinor:5880};
  f.manifest.stages=[development,...flagship.map(s=>({...s,bindingHash:'deferred',workerFactsHash:'deferred',configurationHash:'deferred',lineageHash:'deferred'}))];f.manifest.order=f.manifest.stages.map(s=>s.id);f.manifest.maximumCalls=138;f.manifest.maximumMinor=28980;
  const partial=structuredClone(f.manifest);partial.stages[1]=flagship[0];assert.throws(()=>validateReleaseTrialManifest(partial),/TRIAL_PARTIAL_FLAGSHIP_BINDING_DENIED/);
  trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});assert.equal(trial.preflight().ready,true);assert.deepEqual(trial.preflight().pendingBindings,flagship.map(s=>s.id));assert.throws(()=>trial!.bindChunk(flagship),/TRIAL_PREDECLARED_ORDER_REQUIRED/);
  assert.equal((await trial.run(id)).status,'completed');assert.deepEqual(f.callLog,['development:run']);assert.equal(trial.inspect().stages[0].snapshot.maximumCalls,28);assert.equal(trial.inspect().stages[0].snapshot.maximumMinor,5880);
  trial.close();trial=undefined;trial=new ReleaseTrial(f.root,f.manifest,{testing:f.factory});assert.equal(trial.manifest.maximumCalls,138);assert.equal(trial.manifest.maximumMinor,28980);assert.equal(trial.preflight().ready,false);await assert.rejects(trial.run(flagship[0].id),/TRIAL_PREFLIGHT_BLOCKED/);
  assert.throws(()=>trial!.bindChunk(flagship.slice(0,2)),/TRIAL_EXACT_DEFERRED_CHUNK_REQUIRED/);
  const copies=structuredClone(flagship);copies[2].configurationHash=copies[0].configurationHash;assert.throws(()=>trial!.bindChunk(copies),/TRIAL_BASELINE_COPIES_DENIED/);assert.equal(trial.store.get('adaptive-release-chunk','flagship'),null);
  const changed=structuredClone(flagship);changed[0].caseId='different-population';assert.throws(()=>trial!.bindChunk(changed),/TRIAL_CHUNK_SCOPE_CHANGED/);
  trial.bindChunk(flagship);assert.equal(trial.preflight().ready,true);await trial.run(flagship[0].id);assert.deepEqual(f.callLog,['development:run','stage-0:run']);assert.equal(trial.inspect().stages[1].snapshot.maximumCalls,20);assert.equal(trial.manifest.maximumMinor,28980);
 }finally{trial?.close();f.cleanup();}
});

test('V4 lineage preparation preserves completed records and bounded files without old authority, cross-arm copying or overwrite',()=>{
 const f=fixture(),sourceRoot=join(f.base,'source-lineage'),targetRoot=join(f.base,'target-lineage'),backupRoot=join(f.base,'backup-lineage');let store:StateStore|undefined,restored:StateStore|undefined;
 try{
  mkdirSync(sourceRoot);store=new StateStore(join(sourceRoot,'pilot.sqlite'));
  const task={id:'completed-source',ventureId:'synthetic-business',title:'Synthetic prior task',objective:'Preserve source lineage',capability:'service.brief',dependsOn:[],allowedTools:[],acceptance:['fixture only'],requiredChecks:[],requiredCompetencies:[],resource:{workerSlots:1,modelCalls:3,localToolRuns:12},inputs:{},status:'completed',attempts:1,lease:null};
  const skill={id:'synthetic-candidate',businessId:task.ventureId,taskId:task.id,packageHash:hash('synthetic test package'),qualification:'fixture unqualified'};
  store.transaction(()=>{store!.put('portfolio-task',task.id,task,null);store!.put('adaptive-skill-candidate',skill.id,skill,null);});
  const workspace=new AdaptiveWorkspace({root:join(sourceRoot,'adaptive'),businessId:task.ventureId,taskId:task.id,policy:{allowCommands:false}});
  workspace.write('skill.txt','Visible synthetic lineage bytes; not competence evidence.',null);
  writeFileSync(join(sourceRoot,'trial-stage-origin.json'),JSON.stringify({arm:'strong-direct',status:'completed',manifestHash:hash('fixture manifest'),receiptHash:hash('fixture receipt'),provenance:'fixture'}));
  writeFileSync(join(sourceRoot,'portfolio.authorization.json'),'UNSIGNED TEST MARKER - must not be copied');
  mkdirSync(join(sourceRoot,'auth'));writeFileSync(join(sourceRoot,'auth','portfolio-owner.pub'),'TEST MARKER');
  assert.throws(()=>prepareTrialLineage({sourceRoot,targetRoot,backupRoot,businessId:task.ventureId,arm:'adaptive-midas'}),/TRIAL_LINEAGE_SAME_ARM_REQUIRED/);
  assert.equal(existsSync(targetRoot),false);
  store.transaction(()=>store!.put('adaptive-task-execution-lease','active-source',{businessId:task.ventureId,taskId:task.id,kind:'command',status:'active'},null));
  assert.throws(()=>prepareTrialLineage({sourceRoot,targetRoot,backupRoot,businessId:task.ventureId,arm:'strong-direct'}),/TRIAL_LINEAGE_ACTIVE_EXECUTION_LEASE/);assert.equal(existsSync(backupRoot),false);
  store.transaction(()=>{const row=store!.get('adaptive-task-execution-lease','active-source');store!.put('adaptive-task-execution-lease','active-source',{...row,status:'released'},row._version);store!.put('model-attempt','old-account/lost-request',{id:'lost-request',finishedAt:new Date().toISOString(),status:'transport_error'},null);store!.put('response-job','old-account/lost-request',{createDispatched:true,responseId:null,terminal:null},null);});
  assert.throws(()=>prepareTrialLineage({sourceRoot,targetRoot,backupRoot,businessId:task.ventureId,arm:'strong-direct'}),/TRIAL_LINEAGE_UNKNOWN_RESPONSE/);assert.equal(existsSync(backupRoot),false);
  store.transaction(()=>{const row=store!.get('response-job','old-account/lost-request');store!.put('response-job','old-account/lost-request',{...row,terminal:'failed'},row._version);});
  const result=prepareTrialLineage({sourceRoot,targetRoot,backupRoot,businessId:task.ventureId,arm:'strong-direct'});assert.equal(result.providerRequests,0);assert.equal(result.restored.automaticExecution,false);assert.equal(result.payload.authorizationCopied,false);assert.equal(result.payload.candidateBindings[0].recordHash,hash(skill));
  assert.equal(existsSync(join(targetRoot,'auth')),false);assert.equal(existsSync(join(targetRoot,'portfolio.authorization.json')),false);
  restored=new StateStore(join(targetRoot,'pilot.sqlite'));assert.equal(restored.get('portfolio-task',task.id).status,'completed');const copied=restored.get('adaptive-skill-candidate',skill.id);const {_version,...body}=copied;assert.deepEqual(body,skill);
  const restoredWorkspace=new AdaptiveWorkspace({root:join(targetRoot,'adaptive'),businessId:task.ventureId,taskId:task.id,policy:{allowCommands:false}});assert.equal(restoredWorkspace.read('skill.txt').sha256,workspace.read('skill.txt').sha256);assert.equal(JSON.parse(readFileSync(join(targetRoot,'trial-lineage.json'),'utf8')).lineageHash,result.lineageHash);
  assert.throws(()=>prepareTrialLineage({sourceRoot,targetRoot,backupRoot,businessId:task.ventureId,arm:'strong-direct'}),/TRIAL_LINEAGE_NEW_ROOT_REQUIRED/);
 }finally{restored?.close();store?.close();f.cleanup();}
});

test('candidate-memory ablation requires matched complete workflow controls and one immutable candidate mask',()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;
 try{
  const additions=f.manifest.stages.slice(0,2).map((s,i)=>{const id='ablation-'+i;return {...s,id,chunk:'ablation',phase:'ablation' as const,root:join(f.base,id),bindingHash:hash({authorityHash:hash('signed-fixture-'+id),taskDefinitionHash:hash('task-'+id)})};});
  f.manifest.stages.push(...additions);f.manifest.order.push(...additions.map(s=>s.id));f.manifest.maximumCalls=15;f.manifest.maximumMinor=3200;
  let mismatch=false;const factory:FixtureTrialFactory={kind:'fixture-only',open(stage){const adapter=f.factory.open(stage);return {...adapter,snapshot(){const value=adapter.snapshot();return stage.phase==='ablation'?{...value,ablation:{factsHash:hash(mismatch&&stage.id==='ablation-1'?'changed job':'same job facts without mask'),backupHash:hash('same original backup'),candidateIds:stage.id==='ablation-0'?['visible-test-candidate']:[]}}:value;}};}};
  trial=new ReleaseTrial(f.root,f.manifest,{testing:factory});assert.equal(trial.preflight().ready,true);mismatch=true;assert(trial.preflight().failures.some((r:any)=>r.code==='TRIAL_ABLATION_MATCHING_REQUIRED'));assert.deepEqual(f.callLog,[]);
 }finally{trial?.close();f.cleanup();}
});

test('actual signed pilot loader accepts a newly bound lineage task and rejects altered candidate or material history',async()=>{
 const f=fixture(),sourceRoot=join(f.base,'real-source'),targetRoot=join(f.base,'real-target'),backupRoot=join(f.base,'real-backup');let source:StateStore|undefined,target:StateStore|undefined,adapter:any;
 try{
  source=new StateStore(join(sourceRoot,'pilot.sqlite'));const knowledge=new PilotKnowledge(source),company=knowledge.createDemo(),execution=new PilotExecution(source,{root:sourceRoot});
  const old=execution.plan({business:company,sources:knowledge.sources(company.id),workflow:'response-packet',adaptive:{prompt:'lean',allowCommands:false,modelCalls:3,localToolRuns:12}});
  const candidate={id:'visible-fixture-candidate',businessId:company.id,taskId:old.id,packageHash:hash('fixture package'),package:{purpose:'Visible synthetic fixture only',preconditions:['No real competence claim'],inputs:[],outputs:[],procedure:'Synthetic package for lineage-contract testing',files:[],dependencies:[],effects:['project-files'],tests:[],failureModes:[],sourceRefs:[]},status:'candidate',qualification:'fixture unqualified'};
  source.transaction(()=>{const current=source!.get('portfolio-task',old.id);source!.put('portfolio-task',old.id,{...current,status:'completed',lease:null},current._version);source!.put('adaptive-skill-candidate',candidate.id,candidate,null);});
  const workspace=new AdaptiveWorkspace({root:join(sourceRoot,'adaptive'),businessId:company.id,taskId:old.id,policy:{allowCommands:false}});workspace.write('source.txt','Visible fixture package bytes.',null);
  writeFileSync(join(sourceRoot,'trial-stage-origin.json'),JSON.stringify({arm:'adaptive-midas',status:'completed',manifestHash:hash('fixture manifest'),receiptHash:hash('fixture receipt'),provenance:'fixture'}));
  const lineage=prepareTrialLineage({sourceRoot,targetRoot,backupRoot,businessId:company.id,arm:'adaptive-midas'});target=new StateStore(join(targetRoot,'pilot.sqlite'));const nextExecution=new PilotExecution(target,{root:targetRoot}),nextKnowledge=new PilotKnowledge(target);
  const next=nextExecution.plan({business:nextKnowledge.company(company.id),sources:nextKnowledge.sources(company.id),workflow:'response-packet',adaptive:{prompt:'lean',allowCommands:false,memoryPolicy:{kind:'retained-candidates-v1',candidateIds:[candidate.id]},modelCalls:3,localToolRuns:12}});
  const prepared=await preparePilotAuthorization(nextExecution,{root:targetRoot,directory:join(targetRoot,'proposal'),id:'portfolio-pilot-032-lineage-mock',projectId:'proj_OFFLINE_TRIAL_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode:'mock',tasks:[{taskId:next.id,workCalls:3}]});
  const keys=keypair(),p=structuredClone(prepared.proposal);p.operating.approvedBy='ephemeral-mock-test';p.operating.approvalReference='Actual loader lineage regression only';p.portfolio.approved=true;p.portfolio.approvedBy=p.operating.approvedBy;p.portfolio.approvalReference=p.operating.approvalReference;p.portfolio.operatingGrantHash=hash(p.operating);mkdirSync(join(targetRoot,'auth'));writeFileSync(join(targetRoot,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(targetRoot,'portfolio.authorization.json'),JSON.stringify({...signed(p.portfolio,keys.privateKey),operatingEnvelope:signed(p.operating,keys.privateKey)}));
  let calls=0;const factory=createSignedMockTrialFactory((async()=>{calls++;throw Error('No transport in preflight');}) as typeof fetch);const stage={...f.manifest.stages[2],phase:'ablation' as const,root:targetRoot,runner:'pilot' as const,lineageHash:lineage.lineageHash};adapter=factory.open(stage);
  const actual=adapter.snapshot();assert.equal(actual.fresh,true);assert.equal(actual.binding.lineage.origin.provenance,'fixture');assert.deepEqual(actual.ablation.candidateIds,[candidate.id]);assert.equal(actual.binding.lineage.historicalTaskHashes.length,1);assert.equal(calls,0);
  target.transaction(()=>{const current=target!.get('adaptive-skill-candidate',candidate.id);target!.put('adaptive-skill-candidate',candidate.id,{...current,packageHash:hash('changed')},current._version);});assert.throws(()=>adapter.snapshot(),/TRIAL_LINEAGE_CANDIDATE_CHANGED/);
  target.transaction(()=>{const current=target!.get('adaptive-skill-candidate',candidate.id);target!.put('adaptive-skill-candidate',candidate.id,candidate,current._version);});assert.equal(adapter.snapshot().fresh,true);
  const material=lineage.payload.sidecars.find((s:any)=>s.path.endsWith('/source.txt'));writeFileSync(join(targetRoot,material.path),'Changed after lineage was sealed');assert.throws(()=>adapter.snapshot(),/TRIAL_LINEAGE_FILE_CHANGED/);assert.equal(calls,0);
 }finally{adapter?.close();target?.close();source?.close();f.cleanup();}
});

test('actual direct, baseline and lean signed pilots share semantic facts while retaining distinct full bindings',async()=>{
 const f=fixture();let trial:ReleaseTrial|undefined;const stores:StateStore[]=[],adapters:any[]=[];
 try{
  let calls=0;const factory=createSignedMockTrialFactory((async()=>{calls++;throw Error('No provider in control preflight');}) as typeof fetch),snapshots:TrialSnapshot[]=[];
  const seed=new StateStore(join(f.base,'matched-seed.sqlite'));stores.push(seed);const knowledge=new PilotKnowledge(seed),business=knowledge.createDemo(),sources=knowledge.sources(business.id);
  for(const [i,prompt] of (['direct','baseline','lean'] as const).entries()){
   const stage={...f.manifest.stages[i],runner:'pilot' as const};f.manifest.stages[i]=stage;mkdirSync(stage.root,{recursive:true});seed.db.prepare('VACUUM INTO ?').run(join(stage.root,'pilot.sqlite'));const store=new StateStore(join(stage.root,'pilot.sqlite'));stores.push(store);const execution=new PilotExecution(store,{root:stage.root});
   const task=execution.plan({taskId:'matched-task',business,sources,workflow:'response-packet',adaptive:{prompt,allowCommands:false,modelCalls:3,localToolRuns:12}});
   const prepared=await preparePilotAuthorization(execution,{root:stage.root,directory:join(stage.root,'proposal'),id:'portfolio-pilot-032-controls-'+i,projectId:'proj_OFFLINE_TRIAL_TEST',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,mode:'mock',tasks:[{taskId:task.id,workCalls:3}]});
   const keys=keypair(),p=structuredClone(prepared.proposal);p.operating.approvedBy='ephemeral-mock-test';p.operating.approvalReference='Exact signed controls regression only';p.portfolio.approved=true;p.portfolio.approvedBy=p.operating.approvedBy;p.portfolio.approvalReference=p.operating.approvalReference;p.portfolio.operatingGrantHash=hash(p.operating);mkdirSync(join(stage.root,'auth'));writeFileSync(join(stage.root,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(stage.root,'portfolio.authorization.json'),JSON.stringify({...signed(p.portfolio,keys.privateKey),operatingEnvelope:signed(p.operating,keys.privateKey)}));
   const adapter=factory.open(stage);adapters.push(adapter);const observed=adapter.snapshot();snapshots.push(observed);Object.assign(stage,{bindingHash:hash(observed.binding),configurationHash:observed.configurationHash,workerFactsHash:observed.workerFactsHash});
  }
  assert.equal(new Set(snapshots.map(s=>s.conditions.workerFacts)).size,1);assert.equal(new Set(snapshots.map(s=>s.workerFactsHash)).size,3);assert.equal(new Set(snapshots.map(s=>s.configurationHash)).size,3);
  f.manifest.comparison={kind:'common-controls',allowedDifferences:[]};trial=new ReleaseTrial(f.root,f.manifest,{testing:factory});assert.equal(trial.preflight().ready,true);assert.deepEqual(trial.preflight().observedDifferences,[]);assert.equal(calls,0);
  stores[3].transaction(()=>{const task=stores[3].get('portfolio-task',business.id+'/matched-task');stores[3].put('portfolio-task',task.id,{...task,objective:task.objective+' Changed commercial fact.'},task._version);});assert.equal(trial.preflight().ready,false);assert.equal(calls,0);
 }finally{trial?.close();for(const a of adapters)a.close();for(const s of stores)s.close();f.cleanup();}
});
