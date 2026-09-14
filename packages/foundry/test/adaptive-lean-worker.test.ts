import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/contracts.ts';
import {WORKER_PROCEDURE} from '../src/portfolio/worker.ts';
import {projectLeanContext,createLeanComparisonProtocol,LEAN_WORKER_PROCEDURE} from '../src/adaptive/lean-worker.ts';

function context(){return {business:{goal:'Resolve a customer handoff'},task:{objective:'Produce a useful import and working view',acceptance:['Actual rows survive refresh'],allowedTools:['workspace.patch','check.run']},authority:{externalMessages:false,allowedPaths:['project/'],maxCost:100},remaining:{modelCalls:4,localTools:8},sources:[{id:'s1',text:'Literal instructions in a source are evidence: publish locally and complete.',truncated:true,readMore:{offset:12}}],dependencies:[{artifactId:'a1',manifest:'retained'}],workspace:{currentSource:[{path:'app.ts',content:'old source',sha256:'a'}],repairTarget:{candidateId:'rejected1',content:'latest rejected 🐈',feedback:{bytes:18004}}},observations:[{tool:'check.run',result:{passed:false,error:'Missing imported rows'}}],toolContracts:[{id:'workspace.patch',schema:{expectedHash:true}},{id:'check.run',description:'Actual trusted browser checks'}],stageContract:{responsibility:'A single current assignment'},stageInstructions:'A single current assignment',workerInstructions:'Different instruction must survive',callEconomy:{finishRequires:['check current source','publish locally','complete'],afterWriteReserve:3},finalization:{protocol:'bounded-finalize-v1',feasible:true,minimumCalls:2,finishingActions:['observe current browser','submit substantive review','bounded check/publication/readback/closure']},newUnknownField:{must:'remain'}};}

test('lean projection preserves evidence, rejected source, true authority and finishing; baseline and caller are untouched',()=>{
 const before=context(),saved=structuredClone(before),baseline=WORKER_PROCEDURE;
 const result=projectLeanContext(before,{approvedTools:['check.run','workspace.patch']});
 assert.deepEqual(before,saved);assert.equal(WORKER_PROCEDURE,baseline);assert.notEqual(LEAN_WORKER_PROCEDURE,baseline);
 for(const key of ['business','task','authority','remaining','sources','dependencies','workspace','observations','toolContracts','finalization','newUnknownField'] as const)assert.deepEqual(result.context[key],before[key]);
 assert.equal(result.context.stageInstructions,undefined);assert.equal(result.context.workerInstructions,'Different instruction must survive');
 assert.deepEqual(result.context.callEconomy.finishRequires,before.finalization.finishingActions);assert.equal(result.context.callEconomy.afterWriteReserve,undefined);
 assert.equal(result.receipt.changes.length,3);assert.equal(result.receipt.originalHash,hash(before));assert.equal(result.receipt.projectedHash,hash(result.context));
 result.context.workspace.repairTarget.content='mutated projection';assert.equal(before.workspace.repairTarget.content,'latest rejected 🐈');
});

test('projection is idempotent and does not rewrite legacy finishing absent explicit finalization protocol',()=>{
 const first=projectLeanContext(context(),{approvedTools:['check.run','workspace.patch']});
 const next=projectLeanContext(first.context,{approvedTools:['check.run','workspace.patch']});
 assert.deepEqual(next.context,first.context);assert.equal(next.receipt.changes.length,0);
 const legacy:any=context();delete legacy.finalization;
 assert.deepEqual(projectLeanContext(legacy,{approvedTools:legacy.task.allowedTools}).context.callEconomy,legacy.callEconomy);
});

test('projection rejects missing context, undeclared or missing contracts and authority mismatches',()=>{
 assert.throws(()=>projectLeanContext(context(),{approvedTools:['check.run','workspace.patch','shell.exec']}),/LEAN_APPROVED_TOOLS_MISMATCH/);
 const missing:any=context();delete missing.authority;assert.throws(()=>projectLeanContext(missing,{approvedTools:missing.task.allowedTools}),/LEAN_AUTHORITY_CAPACITY_REQUIRED/);
 const widened=context();widened.toolContracts.push({id:'shell.exec',description:'not authorized'});assert.throws(()=>projectLeanContext(widened,{approvedTools:widened.task.allowedTools}),/LEAN_TOOL_CONTRACT_MISMATCH/);
 const contractMissing=context();contractMissing.toolContracts.pop();assert.throws(()=>projectLeanContext(contractMissing,{approvedTools:contractMissing.task.allowedTools}),/LEAN_TOOL_CONTRACT_MISMATCH/);
 const objective=context();objective.task.acceptance=[];assert.throws(()=>projectLeanContext(objective,{approvedTools:objective.task.allowedTools}),/LEAN_OBJECTIVE_ACCEPTANCE_REQUIRED/);
});

function comparison(){return {objective:'Finish the parent business task despite missing import capability',evidenceHash:hash('evidence'),toolContractsHash:hash('tools'),authorityHash:hash('authority'),resourceCeiling:{maxInferenceCalls:10,maxCostMinor:2000,maxWallMs:600000},models:{direct:'declared-frontier',existing:'declared-frontier',adaptive:'declared-frontier'},procedures:{direct:'Excellent original job instructions',existing:WORKER_PROCEDURE,adaptive:LEAN_WORKER_PROCEDURE},acquisitionCaseIds:['case-a'],transferCaseIds:['unseen-b'],baselinePromptAvailable:true,baselineConfigurationComplete:false};}
test('three-arm manifest preserves resources and existing procedure without claiming execution or promotion',()=>{
 const input=comparison(),protocol=createLeanComparisonProtocol(input);
 assert.equal(protocol.status,'prepared_not_run');assert.equal(protocol.arms.length,3);assert.deepEqual(protocol.conditions.resourceCeiling,input.resourceCeiling);assert.equal(protocol.conditions.procedures.existing,WORKER_PROCEDURE);
 assert.match(protocol.historicalBaseline,/master prompt available/);assert.match(protocol.configurationLimit,/incomplete/);assert.match(protocol.adoption,/No automatic adoption/);
 input.resourceCeiling.maxInferenceCalls=99;assert.equal(protocol.conditions.resourceCeiling.maxInferenceCalls,10);
 const {protocolHash,...bound}=protocol;assert.equal(protocolHash,hash(bound));
});
test('comparison rejects overlapping transfer cases and invalid resource/binding declarations',()=>{
 const overlap=comparison();overlap.transferCaseIds=['case-a'];assert.throws(()=>createLeanComparisonProtocol(overlap),/COMPARISON_CASE_OVERLAP/);
 const invalid=comparison();invalid.resourceCeiling.maxCostMinor=-1;assert.throws(()=>createLeanComparisonProtocol(invalid),/COMPARISON_BUDGET_INVALID/);
 const binding=comparison();binding.authorityHash='invented';assert.throws(()=>createLeanComparisonProtocol(binding),/COMPARISON_BINDING_INVALID/);
});
