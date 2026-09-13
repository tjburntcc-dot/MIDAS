import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,rawHash,canonical} from '../src/contracts.ts';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import type {Task,TaskSpec} from '../src/portfolio/contracts.ts';
import {PortfolioEngine,CAPABILITIES} from '../src/portfolio/engine.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {serviceBriefFiles} from '../src/portfolio/products.ts';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';
import {productProfile} from '../src/portfolio/product-profiles.ts';
import {FINALIZATION_PROTOCOL} from '../src/portfolio/finalization.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {mockResult,workerSchema} from '../src/portfolio/worker.ts';
import {taskDefinitionHash} from '../src/portfolio/live.ts';
import {R4_TASK_CONTRACTS} from '../src/portfolio/continuation-r4.ts';
import {STAGE_CONTRACTS,buildGateSchema,outcomeReviewSchema,stageContractForTask,stageProcedure,stageSchema,stageTools,scopeStageContext,validateStageOutput} from '../src/portfolio/stage-contracts.ts';

const fixtures=join(dirname(fileURLToPath(import.meta.url)),'fixtures','stage-contracts-r4');
const provenance=JSON.parse(readFileSync(join(fixtures,'provenance.json'),'utf8'));
const retainedHashes=['15b15261545b03d467c1aec8d2ec3fa953632737e34780cc20015d01e05dba30','6768d0803026d387fb53b4db8057069067f1404ccac4b439aee5effa8dd1e970'];
const gateId='quote-desk/decide-v4-r4',buildId='quote-desk/build-v4-r4',reviewId='quote-desk/review-product-v4-r4',operateId='quote-desk/operate-v4-r4',outcomeId='quote-desk/adapt-v4-r4';
const localTools=['workspace.list','workspace.read','workspace.replace','workspace.patch','workspace.candidate_read','check.run','artifact.publish_local','research.read'];
const gate=(reference:string,decision:'build'|'stop'='build')=>({decision,rationale:decision==='build'?'A bounded engineering experiment can test source-bound delivery and persistence; customer demand remains unobserved.':'The available direct-development reference answers the current engineering question; additional work has no demonstrated value.',strongestAlternative:{name:'Competent direct development agent',rationale:'A capable developer can deliver or retain an adequate small local product; orchestration advantage remains unmeasured.'},sourceRefs:[reference],blockingConditions:decision==='build'?[]:['No remaining consequential engineering question identified']});
const outcome=(reference:string,decision:'continue'|'revise'|'stop'='continue')=>({decision,rationale:'Choose the next bounded action from actual checks and remaining uncertainty.',observedResults:['A retained local check receipt exists; this does not establish buyer acceptance.'],sourceRefs:[reference],limitations:['Owner effort, demand and willingness to pay are unobserved.'],nextAction:{action:'Inspect the current local result',dependency:'The reviewed artifact and its current checks',acceptance:'Record a specific accepted behavior or correction'}});
const complete=()=>mockResult({action:'complete',reason:'Explicit offline fixture: this report contains the permitted source and preserves unknown customer outcomes.',toolCall:null});
const blocked=()=>mockResult({action:'blocked',reason:'The test stops after checking the exact supplied context; no further work is requested.',toolCall:null});
const toolAction=(name:string,args:any={})=>mockResult({action:'tool',reason:'Scripted counterfactual fixture for request-boundary verification; no model or provider is used.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const boundarySoftware=()=>{const files=quoteProductV2Example(),target=23990,current=Buffer.byteLength(JSON.stringify(files));files[0].content+='<!--'+'x'.repeat(target-current-7)+'-->';assert.equal(Buffer.byteLength(JSON.stringify(files)),target);return files;};

async function setup(researchBytes?:number){
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'midas-stage-contract-r4-')),store=new StateStore(join(root,'portfolio.sqlite')),portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
 const close=()=>{store.close();const child=realpathSync(root),part=relative(parent,child);assert(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(child,{recursive:true,force:true});};
 try{
  portfolio.createVenture({id:'quote-desk',name:'Explicit R4 stage fixture',goal:'Test useful bounded local engineering without claiming commercial validation',priority:37});
  portfolio.registerWorker({id:'baseline',name:'Offline fixture worker',capabilities:CAPABILITIES,competencies:[]});
  const source=evidence.add('quote-desk',{title:'Permitted synthetic research observation',url:null,text:'Existing quoting tools are credible substitutes. A local prototype may test execution, but buyer demand and owner effort remain unobserved.',observedAt:'2026-09-13T00:00:00Z',publishedAt:null,rights:'owner_supplied',provenance:'offline_fixture'});
  const inputs={title:'Accepted research fixture',client:'R4 fixture',asOf:'2026-09-13',sources:[{id:source.id,title:source.title,text:source.text,rights:source.rights}],requiredSourceIds:[source.id]};
  portfolio.addPlan('quote-desk',{id:'research-fixture',rationale:'Create a checked local source report for isolated request construction',tasks:[{id:'research-fixture',title:inputs.title,lane:'research',capability:'service.brief',dependsOn:[],acceptance:['Preserved source with honest limitations'],requiredChecks:['delivery.current'],allowedTools:localTools,resource:{modelCalls:1,localToolRuns:4},inputs:{executionProtocol:FINALIZATION_PROTOCOL,feedbackPolicy:'defer_to_declared_decision'}}]});
  const researchFiles=serviceBriefFiles(inputs);
  if(researchBytes){const report=JSON.parse(researchFiles[0].content);report.unknowns.push('Explicit size-bound fixture '+ 'a'.repeat(7500),'x');const difference=researchBytes-Buffer.byteLength(JSON.stringify(report,null,2));assert(difference>=0&&difference<9999);report.unknowns[report.unknowns.length-1]='x'.repeat(difference+1);researchFiles[0].content=JSON.stringify(report,null,2);assert.equal(Buffer.byteLength(researchFiles[0].content),researchBytes);}
  tools.seed('quote-desk','quote-desk/research-fixture',{kind:'service',files:researchFiles,inputs,provenance:'Developer-authored offline research fixture'});
  const researchEngine=new PortfolioEngine({portfolio,tools,evidence,model:{kind:'offline_mock',async run(){return complete();}}});await researchEngine.runTask('quote-desk/research-fixture');const research=portfolio.getTask('quote-desk/research-fixture');assert.equal(research.status,'completed',research.reason);
  const sourceBindings=[{id:source.id,sha256:source.sha256}],artifact=research.outputArtifacts[0];
  const specs:TaskSpec[]=R4_TASK_CONTRACTS.map((contract,index)=>({id:contract.id.split('/')[1],title:contract.stageContract,objective:'Fulfill only the declared '+contract.stageContract+' responsibility using actual supplied evidence.',lane:index===0||index===4?'research':'build',capability:index===0||index===4?'portfolio.plan':index===1?'software.build':index===2?'quality.review':'service.brief',dependsOn:index===0?[]:[R4_TASK_CONTRACTS[index-1].id],acceptance:['Stage-specific current evidence and bounded output'],requiredChecks:index===0||index===4?['proposal.reference_checks']:['delivery.current'],allowedTools:index===0||index===4?[]:localTools,resource:{modelCalls:contract.workCalls,localToolRuns:20},inputArtifacts:[artifact],maxAttempts:1,inputs:{stageContract:contract.stageContract,sourceBindings,release:'value-release-v4',requiresGrant:false,feedbackPolicy:'defer_to_declared_decision',...(index>0&&index<4?{executionProtocol:FINALIZATION_PROTOCOL}:{}),...(index===1||index===2?{executionProfile:'quote-to-job-v2'}:{})}}));
  specs.push({id:'unrelated-same-plan',title:'Independent declared stage',objective:'Remain untouched by the gate for a separate dependency branch',lane:'build',capability:'service.brief',dependsOn:[],acceptance:['Independent branch'],allowedTools:localTools,resource:{modelCalls:1,localToolRuns:4},inputs:{stageContract:'operating-delivery-v1'}});
  portfolio.addPlan('quote-desk',{id:'explicit-stage-r4',rationale:'Fresh scoped continuation fixture; historical outcomes are not decisions',tasks:specs});
  portfolio.addPlan('quote-desk',{id:'historical-queued',rationale:'Preserved historical tasks must not be offered as current planning choices',tasks:['build-v4-r3','operate-v4-r2'].map(id=>({id,title:'Historical queued '+id,lane:'build',capability:'software.build',dependsOn:[],acceptance:['History only'],allowedTools:localTools,inputs:{executionProfile:'quote-to-job-v2'}}))});
  portfolio.addPlan('quote-desk',{id:'another-stage-plan',rationale:'A different plan is outside the stop cancellation scope',tasks:[{id:'other-plan-build',title:'Another plan descendant',lane:'build',capability:'software.build',dependsOn:[gateId],acceptance:['Different plan scope'],allowedTools:localTools,inputs:{stageContract:'product-build-v1',executionProfile:'quote-to-job-v2'}}]});
  portfolio.createVenture({id:'other-venture',name:'Another venture',goal:'Remain outside the current decision'});portfolio.addPlan('other-venture',{id:'unrelated',rationale:'Another venture task',tasks:[{id:'build',title:'Other venture build',lane:'build',capability:'software.build',dependsOn:[],acceptance:['Other venture only'],inputs:{stageContract:'product-build-v1',executionProfile:'quote-to-job-v2'}}]});
  const stageTasks=R4_TASK_CONTRACTS.map(c=>portfolio.getTask(c.id));
  const accounting=()=>({taskAllocations:stageTasks.map(t=>({id:t.id,definitionHash:taskDefinitionHash(t),workCalls:t.resource.modelCalls}))});
  return {root,store,portfolio,tools,evidence,source,inputs,artifact,stageTasks,accounting,close};
 }catch(error){close();throw error;}
}

test('retained R3 visible outputs keep their exact hashes and remain incomplete evidence, never completed decisions',()=>{
 assert.equal(provenance.historicalMutation,false);assert.equal(provenance.fixtures.length,2);
 for(const [index,item] of provenance.fixtures.entries()){
  const bytes=readFileSync(join(fixtures,item.file));assert.equal(rawHash(bytes),retainedHashes[index]);assert.equal(item.sha256,retainedHashes[index]);assert.equal(bytes.length,item.bytes);assert.equal(item.terminalStatus,'incomplete');assert.equal(item.incompleteReason,'max_output_tokens');assert.match(item.provenance,/not an accepted or completed decision/);assert.equal(item.validJSON,false);assert.throws(()=>JSON.parse(bytes.toString('utf8')),SyntaxError,'no partial JSON salvage is allowed');
 }
});

test('prospective gate request has only the bounded decision schema, declared build profile and current references',async()=>{
 const f=await setup();try{
  const engine=new PortfolioEngine({...f,model:{kind:'offline_mock',async run(){assert.fail('previewRequest must not invoke a model');}}});
  const prepared=await engine.previewRequest(gateId),c=prepared.request.context as any,t=f.portfolio.getTask(gateId);
  assert.deepEqual(prepared.schema,buildGateSchema);assert.deepEqual(prepared.schema.required,['decision','rationale','strongestAlternative','sourceRefs','blockingConditions']);assert.equal(prepared.schema.additionalProperties,false);assert.deepEqual(prepared.schema.properties.decision.enum,['build','stop']);
  assert.equal(prepared.request.role.version,'build-gate-v1');assert.equal(prepared.request.limits.maxCost.minorUnits,STAGE_CONTRACTS['build-gate-v1'].maxCallCost.minorUnits);assert.deepEqual(prepared.request.tools,[]);assert.equal(c.stageContract.maxOutputTokens,24576);assert.equal(c.stageContract.ordinaryAdmissions,1);assert.deepEqual(c.task.allowedTools,[]);
  assert(c.allowedReferenceIds.includes(f.source.id));assert(c.allowedReferenceIds.includes(f.artifact.artifactId));assert.equal(c.sources.find((s:any)=>s.id===f.source.id).text,f.source.text);assert.equal(c.dependencies[0].artifacts[0].reportCompleteness,'full authoritative checked report');assert.deepEqual(c.dependencies[0].artifacts[0].report,JSON.parse(f.tools.load('quote-desk','quote-desk/research-fixture').files[0].content));
  for(const key of ['availableCapabilities','capabilityProfiles','existingUnstartedTaskIds','workspace','toolContracts','callEconomy','finalization','workspacePathRule','sourceReading'])assert.equal(c[key],undefined,key+' must not pollute the narrow decision');
  assert.deepEqual(c.observations,[]);assert.equal(c.prospectiveExecutionProfiles.length,1);const profile=c.prospectiveExecutionProfiles[0];assert.equal(profile.profileId,'quote-to-job-v2');assert.equal(profile.contractHash,hash(profile.contract));const {callEconomy:oldEconomy,review:oldReview,...unchanged}=productProfile('quote-to-job-v2') as any;const {callEconomy:newEconomy,review:newReview,...actual}=profile.contract;assert.deepEqual(actual,unchanged,'only stage-specific finishing guidance may change the product profile');assert.notEqual(newEconomy,oldEconomy);assert.match(newEconomy,/no separate publish or close action/);assert(!newReview.includes('then publish locally and complete'));assert.deepEqual(profile.tasks,[{taskId:buildId,taskDefinitionHash:taskDefinitionHash(f.portfolio.getTask(buildId))}]);
  const serialized=canonical(prepared);for(const id of ['quote-desk/build-v4-r3','quote-desk/operate-v4-r2','quote-desk/other-plan-build','other-venture/build'])assert(!serialized.includes(id),id+' is not part of the prospective request');
  assert.match(prepared.request.role.procedure,/without demonstrated demand/);assert.match(prepared.request.role.procedure,/No historical partial response constitutes an earlier decision/);assert.equal(stageContractForTask(t)?.id,'build-gate-v1');assert.deepEqual(stageTools(t),[]);assert.doesNotThrow(()=>validateStageOutput(t,gate(f.artifact.artifactId),c));
 }finally{f.close();}
});

test('gate and outcome local validation enforce exact finite shapes, reference integrity and a clear build-or-stop boundary',async()=>{
 const f=await setup();try{
  const engine=new PortfolioEngine({...f}),request=await engine.previewRequest(gateId),context=request.request.context as any,t=f.portfolio.getTask(gateId),out=f.portfolio.getTask(outcomeId);
  for(const decision of ['build','stop'] as const)assert.doesNotThrow(()=>validateStageOutput(t,gate(f.source.id,decision),context));
  const invalid=[{...gate(f.source.id),tasks:[]},{...gate(f.source.id),priority:37},{...gate(f.source.id),cancelTaskIds:[]},{...gate(f.source.id),rationale:'x'.repeat(901)},{...gate(f.source.id),rationale:'   '},{...gate(f.source.id),sourceRefs:[]},{...gate(f.source.id),sourceRefs:['quote-desk/build-v4-r3']},{...gate(f.source.id),blockingConditions:['An unresolved required capability']},{...gate(f.source.id),decision:'prototype'}];
  for(const value of invalid)assert.throws(()=>validateStageOutput(t,value,context));
  assert.doesNotThrow(()=>validateStageOutput(t,{...gate(f.source.id),sourceRefs:[f.source.id,f.source.id]},context),'provider-valid repeated references remain unchanged in the decision');
  assert.deepEqual(stageSchema(out),outcomeReviewSchema);assert.deepEqual(outcomeReviewSchema.required,['decision','rationale','observedResults','sourceRefs','limitations','nextAction']);
  for(const decision of ['continue','revise','stop'] as const)assert.doesNotThrow(()=>validateStageOutput(out,outcome(f.artifact.artifactId,decision),context));
  for(const value of [{...outcome(f.source.id),tasks:[]},{...outcome(f.source.id),priority:70},{...outcome(f.source.id),observedResults:[]},{...outcome(f.source.id),decision:'build'},{...outcome(f.source.id),sourceRefs:['unseen']},{...outcome(f.source.id),nextAction:{action:'Inspect'}}])assert.throws(()=>validateStageOutput(out,value,context));
  for(const item of provenance.fixtures){const text=readFileSync(join(fixtures,item.file),'utf8');assert.throws(()=>validateStageOutput(t,text,context));assert.throws(()=>validateStageOutput(out,text,context));}
 }finally{f.close();}
});

for(const decision of ['build','stop'] as const)test('engine applies '+decision+' locally and scopes downstream cancellation to declared descendants in the same plan',async()=>{
 const f=await setup();try{
  const untouched=['quote-desk/build-v4-r3','quote-desk/operate-v4-r2','quote-desk/other-plan-build','quote-desk/unrelated-same-plan','other-venture/build'];
  const before=Object.fromEntries(untouched.map(id=>[id,canonical(f.portfolio.getTask(id))])),count=f.portfolio.snapshot().tasks.length;let calls=0;
  const engine=new PortfolioEngine({...f,model:{kind:'offline_mock',async run(call){calls++;assert.equal(call.stageContract,'build-gate-v1');assert.deepEqual(call.schema,buildGateSchema);assert.deepEqual(call.request.tools,[]);assert.equal(call.request.role.version,'build-gate-v1');const result=gate(f.artifact.artifactId,decision);call.validate(result);return mockResult(result);}}});
  await engine.runTask(gateId);const done=f.portfolio.getTask(gateId);assert.equal(done.status,'completed',done.reason);assert.equal(calls,1);assert.equal(done.attempts,1);assert.equal(f.portfolio.snapshot().tasks.length,count,'gate decisions cannot generate tasks');assert.equal(f.portfolio.getVenture('quote-desk').priority,37,'the narrow decision cannot reprioritize the portfolio');
  for(const id of [buildId,reviewId,operateId,outcomeId]){const task=f.portfolio.getTask(id);assert.equal(task.status,decision==='stop'?'cancelled':'queued',id);assert.equal(task.attempts,0);}
  if(decision==='build')assert.equal(f.portfolio.snapshot().tasks.find(t=>t.id===buildId)?.runnable,true);
  for(const id of untouched)assert.equal(canonical(f.portfolio.getTask(id)),before[id],id+' must stay byte-equivalent');
  const published=f.store.get('portfolio-artifact',done.outputArtifacts[0].artifactId);assert.deepEqual(published.content,gate(f.artifact.artifactId,decision));assert.equal(published.provenance,'offline_mock');
 }finally{f.close();}
});

test('outcome review produces only a bounded recommendation and cannot cancel or create work',async()=>{
 const f=await setup();try{
  const task=f.portfolio.getTask(outcomeId);f.store.put('portfolio-task',task.id,{...task,dependsOn:[]},task._version);let calls=0;
  const engine=new PortfolioEngine({...f,accounting:undefined,model:{kind:'offline_mock',async run(call){calls++;assert.equal(call.stageContract,'outcome-review-v1');assert.deepEqual(call.schema,outcomeReviewSchema);const c=call.request.context as any;assert.equal(c.prospectiveExecutionProfiles,undefined);assert.equal(c.availableCapabilities,undefined);assert.equal(c.existingUnstartedTaskIds,undefined);assert.equal(c.workspace,undefined);assert(c.allowedReferenceIds.includes(f.artifact.artifactId));return mockResult(outcome(f.artifact.artifactId,'stop'));}}});
  const before=Object.fromEntries(f.portfolio.snapshot().tasks.filter(t=>t.id!==outcomeId).map(t=>[t.id,canonical(f.portfolio.getTask(t.id))]));const preview=await engine.previewRequest(outcomeId);assert.deepEqual(preview.schema,outcomeReviewSchema);assert.equal(preview.request.role.version,'outcome-review-v1');await engine.runTask(outcomeId);assert.equal(f.portfolio.getTask(outcomeId).status,'completed');assert.equal(calls,1);for(const [id,value] of Object.entries(before))assert.equal(canonical(f.portfolio.getTask(id)),value);
 }finally{f.close();}
});

test('tool stage context retains actual source and current check evidence while replacing obsolete finishing guidance',{timeout:60000},async()=>{
 const f=await setup();try{
  const engine=new PortfolioEngine({...f,model:{kind:'offline_mock',async run(){return blocked();}}});
  // Execute one real isolated browser check and one real service check. These
  // developer fixtures establish context transport, not actual-model authorship.
  for(const [id,kind] of [[buildId,'software'],[operateId,'service']] as const){
   f.tools.seed('quote-desk',id,{kind,files:kind==='software'?quoteProductV2Example():serviceBriefFiles(f.inputs),inputs:kind==='software'?{profile:'quote-to-job-v2'}:f.inputs,provenance:'Developer-authored isolated stage-context fixture'});
   await engine.previewRequest(id);const checked=await f.tools.execute({ventureId:'quote-desk',taskId:id,tool:'check.run',args:{}});assert.equal(checked.ok,true,JSON.stringify(checked));const execution=f.store.get('portfolio-execution',id);f.store.put('portfolio-execution',id,{...execution,observations:[{tool:'check.run',workerReason:'Inspect this actually executed current-source check',result:checked}]},execution._version);
   const prepared=await engine.previewRequest(id),c=prepared.request.context as any,w=f.tools.load('quote-desk',id);assert.deepEqual(c.workspace.currentSource,w.files.filter(file=>kind!=='service'||file.path==='brief.json'));assert.equal(c.workspace.manifest.sha256,checked.manifest?.sha256);assert(c.observations.some((o:any)=>o.tool==='check.run'&&o.result.manifest.sha256===w.manifest.sha256&&o.result.checks.some((check:any)=>check.passed)));assert.equal(c.sources.find((s:any)=>s.id===f.source.id).text,f.source.text);
   assert.equal(c.availableCapabilities,undefined);assert.equal(c.capabilityProfiles,undefined);assert.equal(c.existingUnstartedTaskIds,undefined);assert.equal(c.prospectiveExecutionProfiles,undefined);assert(!c.task.allowedTools.includes('artifact.publish_local'));assert(!prepared.request.tools.some((tool:any)=>tool.name==='artifact.publish_local'));assert(!c.toolContracts.some((tool:any)=>tool.id==='artifact.publish_local'));
   assert.equal(c.callEconomy.afterWriteReserve,undefined);assert.equal(c.callEconomy.hostedSearchUsesSeparateAdmission,undefined);assert.deepEqual(c.callEconomy.finishRequires,c.finalization.finishingActions);assert(!c.callEconomy.finishRequires.includes('publish locally'));assert.match(c.callEconomy.completion,/No separate publication or closure call/);assert(!prepared.request.role.procedure.includes('Complete only after current artifacts satisfy required checks and local delivery'));
   assert.match(prepared.request.role.procedure,/controller.*checks|controller then checks/i);assert.equal(prepared.schema.additionalProperties,false);const names=prepared.schema.properties.toolCall.anyOf.filter((branch:any)=>branch.properties).flatMap((branch:any)=>branch.properties.name.enum);assert.deepEqual(names,stageTools(f.portfolio.getTask(id)));assert(!names.includes('artifact.publish_local'));
   if(kind==='software'){const browser=c.observations[0].result.checks.find((check:any)=>check.id==='software.browser-observation');assert(browser?.evidence.views.length>0);assert.equal(browser.evidence.manifestHash,w.manifest.sha256);assert.equal(browser.evidence.independentHumanReview,false);}
  }
  // The review contract receives the same real source/check evidence without
  // making another browser run merely to test the structural context filter.
  const buildPreview=await engine.previewRequest(buildId),context=buildPreview.request.context as any,review=f.portfolio.getTask(reviewId),before=canonical(context);const scoped=scopeStageContext(review,context);assert.equal(canonical(context),before,'scoping must not mutate the retained caller context');assert.deepEqual(scoped.workspace.currentSource,context.workspace.currentSource);assert.deepEqual(scoped.observations,context.observations);assert.equal(scoped.stageContract.id,'product-review-v1');assert.equal(scoped.stageContract.ordinaryAdmissions,4);
 }finally{f.close();}
});

test('stage schemas deny controller publication and retain strict argument contracts without altering the legacy worker schema',async()=>{
 const f=await setup();try{
  const legacy=canonical(workerSchema),t=f.portfolio.getTask(buildId),schema=stageSchema(t) as any,context={sources:[{id:f.source.id}],dependencies:[]};assert.deepEqual(schema.required,['action','reason','toolCall']);assert.equal(schema.properties.toolCall.anyOf.some((branch:any)=>branch.properties?.name.enum.includes('artifact.publish_local')),false);
  assert.throws(()=>validateStageOutput(t,{action:'tool',reason:'Publish directly',toolCall:{name:'artifact.publish_local',arguments:{path:null,content:null,expectedHash:null,query:null,url:null}}},context));
  assert.doesNotThrow(()=>validateStageOutput(t,{action:'tool',reason:'Observe the source using real checks',toolCall:{name:'check.run',arguments:{path:null,content:null,expectedHash:null,query:null,url:null}}},context));assert.doesNotThrow(()=>validateStageOutput(t,{action:'complete',reason:'The current-source check was inspected; limitations remain explicit.',toolCall:null},context));assert.equal(canonical(workerSchema),legacy);
  const ordinary={...t,inputs:{}} as Task;assert.equal(stageSchema(ordinary),null);assert.equal(stageProcedure(ordinary),null);assert.deepEqual(stageTools(ordinary),ordinary.allowedTools);assert.throws(()=>stageContractForTask({...t,inputs:{stageContract:'unknown'}} as Task),/STAGE_CONTRACT_UNKNOWN/);
 }finally{f.close();}
});

test('per-tool stage schema rejects unused arguments and invalid patch modes before tool execution',async()=>{
 const f=await setup();try{
  const t=f.portfolio.getTask(buildId),context={sources:[{id:f.source.id}],dependencies:[]},args={path:null,content:null,expectedHash:null,query:null,url:null};const action=(name:string,arguments_:any)=>({action:'tool',reason:'Explicit argument validation fixture',toolCall:{name,arguments:arguments_}});
  for(const value of [action('check.run',{...args,url:'https://outside.invalid'}),action('workspace.read',{...args,path:'app.html',query:'unused'}),action('workspace.read',{...args,path:'  '}),action('workspace.read',{path:'app.html'}),action('research.read',{...args,path:f.source.id,query:'-1'}),action('research.read',{...args,path:f.source.id,query:'1.5'}),action('workspace.replace',{...args,path:'app.html',content:'<h1>Fixture</h1>',expectedHash:'not-a-hash'})])assert.throws(()=>validateStageOutput(t,value,context));
  const patch={path:'app.html',expectedHash:'a'.repeat(64),candidateId:null,serialization:'preserve',edits:[]};assert.throws(()=>validateStageOutput(t,action('workspace.patch',patch),context));assert.throws(()=>validateStageOutput(t,action('workspace.patch',{...patch,serialization:'compact-json'}),context));
  assert.doesNotThrow(()=>validateStageOutput(t,action('workspace.patch',{...patch,edits:[{find:'old text',replace:'new text'}]}),context));assert.doesNotThrow(()=>validateStageOutput(t,action('workspace.patch',{...patch,path:'brief.json',serialization:'compact-json'}),context));assert.doesNotThrow(()=>validateStageOutput(t,action('research.read',{...args,path:f.source.id,query:'0'}),context));
  const patchSchema=(stageSchema(t) as any).properties.toolCall.anyOf.find((branch:any)=>branch.properties?.name.enum.includes('workspace.patch')).properties.arguments.anyOf;assert.equal(patchSchema[0].properties.edits.minItems,1);assert.deepEqual(patchSchema[0].properties.serialization.enum,['preserve']);assert.equal(patchSchema[1].properties.path.pattern.endsWith('\\.json$'),true);
 }finally{f.close();}
});

test('a full 17908-byte accepted research report and the completed compact gate both survive downstream build context',async()=>{
 const f=await setup(17908);try{
  const engine=new PortfolioEngine({...f,model:{kind:'offline_mock',async run(){return mockResult(gate(f.artifact.artifactId));}}});await engine.runTask(gateId);assert.equal(f.portfolio.getTask(gateId).status,'completed');
  f.tools.seed('quote-desk',buildId,{kind:'software',files:[{path:'app.html',content:'<!doctype html><title>Unseeded engineering fixture</title>'}],inputs:{profile:'quote-to-job-v2'},provenance:'Controller-created blank workspace for isolated context test'});
  const prepared=await engine.previewRequest(buildId),context=prepared.request.context as any,artifacts=context.dependencies.flatMap((dependency:any)=>dependency.artifacts),research=artifacts.find((artifact:any)=>artifact.artifactId===f.artifact.artifactId),decision=artifacts.find((artifact:any)=>artifact.proposal);
  assert.deepEqual(research.report,JSON.parse(f.tools.load('quote-desk','quote-desk/research-fixture').files[0].content));assert.equal(research.reportCompleteness,'full authoritative checked report');assert.deepEqual(decision.proposal,gate(f.artifact.artifactId));assert(Buffer.byteLength(JSON.stringify(context))<=72000);
 }finally{f.close();}
});

test('counterfactual full R4 chain keeps the exact accepted report and boundary artifacts inside every 72000-byte request',{timeout:90000},async()=>{
 const f=await setup(17908);try{
  const software=boundarySoftware(),acceptedSource=f.tools.load('quote-desk','quote-desk/research-fixture').files[0].content,acceptedReport=JSON.parse(acceptedSource),acceptedContextBytes=Buffer.byteLength(JSON.stringify(acceptedReport)),counts:Record<string,number>={},contexts:Array<{id:string;bytes:number;acceptedBytes:number;softwareBytes:number|null;workingBytes:number|null;artifactIds:string[];dependencyArtifactFields:unknown;workspaceFields:unknown}>=[];assert.equal(Buffer.byteLength(acceptedSource),17908);
  const engine=new PortfolioEngine({...f,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(call){
   const c=call.request.context as any,id=c.task.id,n=counts[id]=(counts[id]??0)+1,artifacts=(c.dependencies??[]).flatMap((dependency:any)=>dependency.artifacts??[]),accepted=artifacts.find((artifact:any)=>artifact.artifactId===f.artifact.artifactId);
   const artifactIds=artifacts.map((artifact:any)=>artifact.artifactId),acceptedBytes=accepted?.report?Buffer.byteLength(JSON.stringify(accepted.report)):0;
   const softwareArtifact=artifacts.find((artifact:any)=>artifact.software),working=c.workspace?.currentSource?Buffer.byteLength(JSON.stringify(c.workspace.currentSource)):null,bytes=Buffer.byteLength(JSON.stringify(c));
   const sizes=(value:any)=>Object.fromEntries(Object.entries(value??{}).map(([key,item])=>[key,Buffer.byteLength(JSON.stringify(item))]));
   contexts.push({id,bytes,acceptedBytes,softwareBytes:softwareArtifact?softwareArtifact.software.files?Buffer.byteLength(JSON.stringify(softwareArtifact.software.files)):23990:null,workingBytes:working,artifactIds,dependencyArtifactFields:artifacts.map((artifact:any)=>({artifactId:artifact.artifactId,fields:sizes(artifact),softwareFields:sizes(artifact.software)})),workspaceFields:sizes(c.workspace)});assert(accepted,id+' must retain the authenticated accepted research artifact: '+JSON.stringify(artifactIds));assert.deepEqual(accepted.report,acceptedReport);assert.equal(acceptedBytes,acceptedContextBytes);assert.equal(accepted.reportCompleteness,'full authoritative checked report');assert(bytes<=72000,id+' context exceeds the R4 aggregate boundary');
   if(call.stageContract==='build-gate-v1')return mockResult(gate(f.artifact.artifactId));
   if(call.stageContract==='outcome-review-v1')return mockResult(outcome(f.artifact.artifactId,'revise'));
   const w=f.tools.load('quote-desk',id);
   if(call.stageContract==='product-build-v1'){
    if(n===1)return toolAction('workspace.replace',{path:'app.html',content:software[0].content,expectedHash:w.manifest.files[0].sha256});
    if(n===2)return toolAction('check.run');
    return complete();
   }
   if(call.stageContract==='product-review-v1')return n===1?toolAction('check.run'):complete();
   if(call.stageContract==='operating-delivery-v1'){
    if(n===1){const report=JSON.parse(serviceBriefFiles(w.inputs)[0].content);report.unknowns.push('x'.repeat(7500),'x');const difference=17900-Buffer.byteLength(JSON.stringify(report));assert(difference>=0&&difference<9999);report.unknowns[report.unknowns.length-1]='x'.repeat(difference+1);const content=JSON.stringify(report);assert.equal(Buffer.byteLength(content),17900);return toolAction('workspace.replace',{path:'brief.json',content,expectedHash:w.manifest.files[0].sha256});}
    return complete();
   }
   assert.fail('Unexpected stage contract '+call.stageContract);
  }}});
  for(const id of [gateId,buildId,reviewId,operateId,outcomeId]){await engine.runTask(id);assert.equal(f.portfolio.getTask(id).status,'completed',id+' '+f.portfolio.getTask(id).reason+' '+JSON.stringify(contexts)+' '+JSON.stringify(engine.rows('portfolio-context-diagnostic')));}
  const audit=JSON.parse(readFileSync(join(fixtures,'context-boundary-audit.json'),'utf8'));assert.deepEqual(audit.requests,contexts.map((row,index)=>({sequence:index+1,taskId:row.id,contextBytes:row.bytes})));assert.equal(audit.maxContextBytes,Math.max(...contexts.map(row=>row.bytes)));
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([id,count])=>[id,count])),{[gateId]:1,[buildId]:3,[reviewId]:2,[operateId]:2,[outcomeId]:1});
  for(const id of [gateId,buildId,reviewId,operateId,outcomeId])assert(contexts.some(row=>row.id===id&&row.acceptedBytes===acceptedContextBytes));
  assert(contexts.some(row=>row.id===reviewId&&row.workingBytes===23990));assert(contexts.some(row=>row.id===operateId&&row.softwareBytes===23990));assert(contexts.some(row=>row.id===outcomeId&&row.workingBytes===null));
 }finally{f.close();}
});

test('R4 still refuses each report or proposal artifact above 18000 bytes before model admission',async()=>{
 for(const kind of ['report','proposal'] as const){const f=await setup(kind==='report'?18001:undefined);let calls=0;try{
  if(kind==='proposal'){
   const content={fixture:'Explicit oversized proposal fixture',padding:''};content.padding='x'.repeat(18001-Buffer.byteLength(JSON.stringify(content)));assert.equal(Buffer.byteLength(JSON.stringify(content)),18001);
   const artifact=f.portfolio.publishArtifact('quote-desk',{id:'oversized-proposal',title:'Oversized local fixture',kind:'business_proposal',provenance:'offline_fixture_not_accepted_decision',content}),task=f.portfolio.getTask(gateId);f.store.put('portfolio-task',task.id,{...task,inputArtifacts:[...task.inputArtifacts,{artifactId:artifact.id,version:artifact.version,sha256:artifact.sha256}]},task._version);
  }
  const engine=new PortfolioEngine({...f,model:{kind:'offline_mock',async run(){calls++;return mockResult(gate(f.artifact.artifactId));}}});await assert.rejects(engine.previewRequest(gateId),/DEPENDENCY_REPORT_TOO_LARGE_FOR_PLANNING/);assert.equal(calls,0);assert.equal(f.portfolio.getTask(gateId).attempts,0);
 }finally{f.close();}}
});

test('R4 aggregate context overflow is rejected locally without truncating individually valid artifact content',async()=>{
 const f=await setup();let calls=0;try{
  const refs=[...f.portfolio.getTask(gateId).inputArtifacts];
  for(let index=0;index<5;index++){
   const content={fixture:'Explicit aggregate-size fixture '+index,padding:''};content.padding='x'.repeat(17900-Buffer.byteLength(JSON.stringify(content)));assert.equal(Buffer.byteLength(JSON.stringify(content)),17900);
   const artifact=f.portfolio.publishArtifact('quote-desk',{id:'context-size-'+index,title:'Aggregate context fixture '+index,kind:'business_proposal',provenance:'offline_fixture_not_accepted_decision',content});refs.push({artifactId:artifact.id,version:artifact.version,sha256:artifact.sha256});
  }
  const task=f.portfolio.getTask(gateId);f.store.put('portfolio-task',task.id,{...task,inputArtifacts:refs},task._version);
  const engine=new PortfolioEngine({...f,model:{kind:'offline_mock',async run(){calls++;return mockResult(gate(f.artifact.artifactId));}}});await assert.rejects(engine.previewRequest(gateId),/PORTFOLIO_CONTEXT_TOO_LARGE/);assert.equal(calls,0);assert.equal(f.portfolio.getTask(gateId).attempts,0);const diagnostic=f.store.get('portfolio-context-diagnostic',gateId);assert(diagnostic.totalBytes>72000);assert.equal(diagnostic.providerRequests,0);
  for(const ref of refs.slice(1))assert.equal(Buffer.byteLength(JSON.stringify(f.store.get('portfolio-artifact',ref.artifactId).content)),17900,'oversized aggregate must not silently rewrite or truncate its preserved artifacts');
 }finally{f.close();}
});
