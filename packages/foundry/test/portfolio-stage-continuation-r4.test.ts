import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StateStore} from '../src/state.ts';
import {hash,rawHash} from '../src/contracts.ts';
import {ModelLedger} from '../src/experiment/ledger.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {OperatingModels} from '../src/operations/model.ts';
import {BACKGROUND_POLICY} from '../src/durable-responses.ts';
import {createPortfolioProposal,portfolioTaskRoute} from '../src/portfolio/live.ts';
import {makeWorkerRequest,workerPrincipal} from '../src/portfolio/worker.ts';
import {STAGE_CONTRACTS,stageSchema,stageTools} from '../src/portfolio/stage-contracts.ts';
import {
 R4_ACCEPTED_BRIEF_BYTES,R4_ACCEPTED_BRIEF_HASH,R4_DECISION_TASK_ID,R4_PARENT_ATTEMPT_IDS,R4_PARENT_PROPOSAL_HASH,R4_PARENT_TASK_ID,R4_TASK_CONTRACTS,
 inspectStageContinuationParent,stageRetirementAllowsProgress,validateStageContinuationR4,validateStageContinuationWorkspace
} from '../src/portfolio/continuation-r4.ts';
import {prepareStageContinuationR4} from '../tools/prepare-stage-continuation-r4.mjs';

const repository=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const workspace=repository.includes(join('var','foundry-worktree-031-contracts-r4'))?resolve(repository,'..','..'):repository;
const parentRoot=join(workspace,'var','foundry-worktree-031-durable-r3','var','portfolio-031-continuation-r3');
const backupRoot=join(workspace,'var','foundry-worktree-031-durable-r3','var','portfolio-031-continuation-r3-stop-backup');
const actualFixture=existsSync(join(parentRoot,'portfolio.authorization.json'))&&existsSync(join(backupRoot,'manifest.json'));

test('R4 inspector authenticates the full chain and freezes both terminal R3 outcomes',{skip:!actualFixture},()=>{
 const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8'),parent=inspectStageContinuationParent(parentRoot,publicKey);
 assert.equal(hash(parent.proposal),R4_PARENT_PROPOSAL_HASH);
 assert.equal(parent.task.id,R4_PARENT_TASK_ID);
 assert.deepEqual(parent.attempts.map((a:any)=>a.id),R4_PARENT_ATTEMPT_IDS);
 assert.deepEqual(parent.attempts.map((a:any)=>[a.errorCode,a.reservation,a.cost.money.minorUnits]),[['MODEL_RESPONSE_INCOMPLETE',123,95],['MODEL_RESPONSE_INCOMPLETE',123,95]]);
 assert.deepEqual(parent.requestBodyHashes,['0bc380cafd396718c3bc8e739053f77f14a3b38e1469242e018178e1f7884614','74a178bc9f455ae3a34bb36da96e406a5f3c38c12dc45ca0e21bb400d1fb6f71']);
 assert.deepEqual(parent.responseIds,['resp_0753b49c8f412da3006aa6d4f0ff4c87d2baa2364d225df268','resp_059a4e036a33e18f006aa6d6d7f85487d2ba8d921431a15675']);
 assert.deepEqual(parent.terminalHashes,['7d7be886f487d15cd2136583d5def9b13a492c44befb952b2e7bfc35113f099c','6ca0cb569b3f69e5f04ad057e93a05d0779b649ea28201e7573af0077df3c89a']);
 assert.equal(parent.source.content.brief.sha256,R4_ACCEPTED_BRIEF_HASH);
 assert.equal(parent.source.content.brief.bytes,R4_ACCEPTED_BRIEF_BYTES);
 assert.deepEqual(parent.historical,{admissions:11,counts:11,reservedMinor:1353,provisionalMinor:574,settledMinor:0,countBufferMinor:400});
 assert.match(parent.historicalLedgerHash,/^[a-f0-9]{64}$/);
 assert.equal(parent.retired,null);assert.equal(parent.operatingRetired,null);
});

test('R4 preparer freezes non-borrowable stage routes in an unsigned exact amendment',{skip:!actualFixture,timeout:90000},async()=>{
 const base=mkdtempSync(join(tmpdir(),'portfolio-stage-r4-')),root=join(base,'r4');
 try{
  const manifest=JSON.parse(readFileSync(join(backupRoot,'manifest.json'),'utf8'));
  const prepared=await prepareStageContinuationR4({parentRoot,backupRoot,manifestHash:manifest.sha256,root});
  const proposal=JSON.parse(readFileSync(join(prepared.output,'portfolio.authorization.request.json'),'utf8'));
  const restore=JSON.parse(readFileSync(join(root,'restore.json'),'utf8'));
  const bytes=readFileSync(join(prepared.output,'initial-responses-bytes.json'),'utf8'),body=JSON.parse(bytes),taskManifest=JSON.parse(readFileSync(join(prepared.output,'task-manifest.json'),'utf8'));
  assert.equal(proposal.approved,false);assert.equal(proposal.portfolio.approved,false);assert.equal(proposal.portfolio.continuation.kind,'portfolio-v4-stage-continuation-r4');
  assert.deepEqual(proposal.portfolio.stageContracts,Object.values(STAGE_CONTRACTS));
  assert.deepEqual(proposal.operating.stageContracts,Object.values(STAGE_CONTRACTS));
  assert.equal(proposal.portfolio.recovery.maxAdmissions,0);
  assert.equal(proposal.portfolio.route.maxOutputTokens,32768);assert.equal(proposal.portfolio.route.maxCallCost.minorUnits,205);
  assert.deepEqual(proposal.portfolio.route.background,BACKGROUND_POLICY);
  assert.equal(body.max_output_tokens,24576);assert.equal(body.background,true);assert.equal(body.store,true);
  assert.equal(proposal.incrementalExposureMinor,2829);assert.equal(proposal.historicalRetainedMinor,1753);assert.equal(proposal.maximumExposureMinor,4582);
  assert.equal(proposal.inferenceAdmissions,15);assert.equal(proposal.countAdmissions,15);
  assert.equal(prepared.providerRequests,0);assert.equal(prepared.credentialRead,false);assert.equal(prepared.privateKeyRead,false);assert.equal(prepared.signed,false);
  assert.equal(restore.historicalLedgerHash,inspectStageContinuationParent(parentRoot,readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8')).historicalLedgerHash);
  assert.equal(proposal.portfolio.initialRequests[0].bodyHash,rawHash(bytes));
  assert.deepEqual(proposal.portfolio.tasks.map((t:any)=>[t.id,t.workCalls,t.stageContract]),R4_TASK_CONTRACTS.map(t=>[t.id,t.workCalls,t.stageContract]));
  assert.deepEqual(proposal.operating.limits.allocations.filter((a:any)=>a.metadataKey==='stageContract'),Object.values(STAGE_CONTRACTS).map(c=>({metadataKey:'stageContract',value:c.id,attempts:c.ordinaryAdmissions,minor:c.ordinaryAdmissions*c.maxCallCost.minorUnits})));
  assert.equal(taskManifest.preservedArtifact.briefHash,R4_ACCEPTED_BRIEF_HASH);assert.equal(taskManifest.preservedArtifact.briefBytes,R4_ACCEPTED_BRIEF_BYTES);
  assert.equal(taskManifest.historicalOutcomes.unknownR2.preserved,true);assert.equal(taskManifest.historicalOutcomes.terminalIncompleteR3.length,2);assert.ok(taskManifest.historicalOutcomes.terminalIncompleteR3.every((x:any)=>x.preserved&&!x.retryable));
  assert.equal(existsSync(join(root,'portfolio.authorization.json')),false);assert.equal(existsSync(join(root,'auth')),false);
  const store=new StateStore(join(root,'portfolio.sqlite'));
  try{
   for(const id of R4_PARENT_ATTEMPT_IDS){const old=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key LIKE ?").get('%/'+id) as any;assert(old);assert.equal(JSON.parse(String(old.body)).reservation,123);}
   assert.equal(store.get('portfolio-task',R4_PARENT_TASK_ID).status,'needs_reconciliation');
   const fresh=store.get('portfolio-task',R4_DECISION_TASK_ID);assert.equal(fresh.status,'queued');assert.equal(fresh.inputs.stageContract,'build-gate-v1');assert.equal(fresh.inputs.budgetGuidance,undefined);assert.equal(fresh.inputs.prototypeGate,undefined);
   for(const mapping of R4_TASK_CONTRACTS)assert.equal(store.get('portfolio-task',mapping.id).inputs.stageContract,mapping.stageContract);
   const build=store.get('portfolio-task','quote-desk/build-v4-r4'),tools=stageTools(build),schema=stageSchema(build);
   assert.equal(tools.includes('artifact.publish_local'),false);assert.equal(tools.includes('research.search'),false);assert.ok(schema.properties.toolCall.anyOf.every((x:any)=>!x.properties||x.properties.name.enum.every((name:string)=>tools.includes(name))));
  }finally{store.close();}
  const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8');
  validateStageContinuationR4(proposal.portfolio,publicKey,false);
  assert.throws(()=>validateStageContinuationR4(proposal.portfolio,publicKey,true),/STAGE_PARENT_RETIREMENT_REQUIRED/);
  const changed=structuredClone(proposal.portfolio);changed.continuation.parentTerminalHashes[0]='0'.repeat(64);assert.throws(()=>validateStageContinuationR4(changed,publicKey,false),/STAGE_PARENT_REQUEST_IDENTITY_CHANGED/);
  const marker={continuationId:proposal.portfolio.id,continuationRoot:proposal.portfolio.root,continuationGrantHash:hash(proposal.portfolio)};
  assert.equal(stageRetirementAllowsProgress(proposal.portfolio,null,null,false),false);assert.throws(()=>stageRetirementAllowsProgress(proposal.portfolio,marker,null,false),/STAGE_PARENT_RETIREMENT_PARTIAL/);assert.equal(stageRetirementAllowsProgress(proposal.portfolio,marker,marker,true),true);
  const progressed=new StateStore(join(root,'portfolio.sqlite'));
  try{
   const task=progressed.get('portfolio-task',R4_DECISION_TASK_ID);progressed.put('portfolio-task',R4_DECISION_TASK_ID,{...task,status:'running',attempts:1,lease:{token:'test-only'}},task._version);
   validateStageContinuationWorkspace(proposal.portfolio,proposal.portfolio.continuation,true);
   assert.throws(()=>validateStageContinuationWorkspace(proposal.portfolio,proposal.portfolio.continuation,false),/STAGE_FRESH_TASKS_CHANGED/);
  }finally{progressed.close();}
  const budgetStore=new StateStore(join(root,'stage-budget-test.sqlite'));
  try{
   const ledger=new ModelLedger(budgetStore,proposal.operating.accountScope,hash(proposal.operating),proposal.operating.limits),scope=proposal.operating.accountScope;
   const request=(id:string)=>({scope,requestId:id,task:'operate',role:{},context:{},limits:{},tools:[]}) as any,admit=(id:string,contract:string,minor:number)=>{const raw='{"id":"'+id+'"}';return ledger.port('development',{businessId:'quote-desk',stage:'portfolio-work',stageContract:contract,recoveryOf:null,source:'offline_mock',goalHash:proposal.operating.businesses[0].goalHash}).prepare!(request(id),{currency:'USD',minorUnits:minor},rawHash(raw),raw);};
   await admit('gate-1','build-gate-v1',164);ledger.finish('gate-1',null,'OFFLINE_TEST_COMPLETE');
   await assert.rejects(admit('gate-2','build-gate-v1',164),/ALLOCATION_ATTEMPT_CAP/);
   await admit('build-1','product-build-v1',205);ledger.finish('build-1',null,'OFFLINE_TEST_COMPLETE');
   await assert.rejects(admit('build-over','product-build-v1',821),/ALLOCATION_BUDGET_CAP/);
   assert.equal(ledger.get('gate-2'),null);assert.equal(ledger.get('build-over'),null);
  }finally{budgetStore.close();}
  assert.equal(portfolioTaskRoute(proposal.portfolio.route,STAGE_CONTRACTS['build-gate-v1']).maxCallCost.minorUnits,164);
  assert.equal(portfolioTaskRoute(proposal.portfolio.route,STAGE_CONTRACTS['product-review-v1']).maxOutputTokens,32768);
 }finally{
  const path=realpathSync(base),rel=relative(realpathSync(tmpdir()),path);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(path,{recursive:true,force:true});
 }
});

test('ephemeral signed operating grant binds each stage request, route and non-borrowable ledger allocation',async()=>{
 const base=mkdtempSync(join(tmpdir(),'portfolio-stage-route-r4-')),store=new StateStore(join(base,'state.sqlite')),keys=keypair(),seen:any[]=[];
 try{
  const tasks=R4_TASK_CONTRACTS.map(t=>({id:t.id,definitionHash:hash({fixture:t.id}),workCalls:t.workCalls,stageContract:t.stageContract}));
  const proposal=createPortfolioProposal({root:base,id:'portfolio-031-stage-route-fixture',mode:'mock',background:true,stageContracts:Object.keys(STAGE_CONTRACTS) as any,projectId:'proj_OFFLINE',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:400,recoveryAdmissions:0,tasks,ventures:[{id:'quote-desk',goal:'Exercise exact signed stage routes without provider access',capabilities:['portfolio.plan','software.build','quality.review','service.brief'],tools:[],workCalls:15,searchCalls:0}]});
  const grant={...proposal.operating,approvedBy:'ephemeral-test-owner',approvalReference:'Generated test-only signature; no execution authority outside this temporary fixture'};
  let responseSequence=0;
  const transport=(async(input:any,init:any)=>{const url=String(input),body=JSON.parse(String(init.body));seen.push({url,body});if(url.endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:100});assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.method,'POST');return Response.json({id:'resp_stage_'+(++responseSequence),model:'gpt-6-astra',service_tier:'default',status:'completed',background:true,store:true,usage:{input_tokens:100,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:'accepted'})}]}]});}) as typeof fetch;
  const models=new OperatingModels({root:base,store,envelope:signed(grant,keys.privateKey),trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}}),principal=workerPrincipal('quote-desk'),schema={type:'object',additionalProperties:false,required:['result'],properties:{result:{type:'string'}}};
  const invoke=(attemptId:string,stageContract:keyof typeof STAGE_CONTRACTS,requestContract=stageContract)=>{const contract=STAGE_CONTRACTS[requestContract],request=makeWorkerRequest({ventureId:'quote-desk',taskId:'quote-desk/'+attemptId,attemptId,tools:[],context:{stageContract:{id:requestContract}},maxMinor:contract.maxCallCost.minorUnits});request.role.version=requestContract;return models.invoke(principal,{businessId:'quote-desk',goalHash:hash('Exercise exact signed stage routes without provider access'),sourceHosts:[],attemptId,stage:'portfolio-work',stageContract,request,schema,validate:(out:any)=>assert.equal(out.result,'accepted')});};
  await invoke('gate-1','build-gate-v1');
  const firstPost=seen.find(r=>r.url.endsWith('/responses')&&!r.url.endsWith('/input_tokens'));assert.equal(firstPost.body.max_output_tokens,24576);assert.equal(firstPost.body.background,true);assert.equal(firstPost.body.store,true);assert.equal(models.ledger.get('gate-1').reservation,164);assert.equal(models.ledger.get('gate-1').metadata.stageContract,'build-gate-v1');
  const bound=store.get('operating-request','gate-1-request');assert.equal(bound.requestHash,rawHash(bound.bytes));assert.equal(JSON.parse(bound.bytes).max_output_tokens,24576);
  const beforeWrong=seen.length;await assert.rejects(invoke('wrong-stage','product-build-v1','build-gate-v1'),/OPERATING_STAGE_CONTRACT_MISMATCH/);assert.equal(seen.length,beforeWrong);assert.equal(models.ledger.get('wrong-stage'),null);
  const postsBeforeBorrow=seen.filter(r=>r.url.endsWith('/responses')&&!r.url.endsWith('/input_tokens')).length;await assert.rejects(invoke('gate-2','build-gate-v1'),/ALLOCATION_ATTEMPT_CAP/);assert.equal(seen.filter(r=>r.url.endsWith('/responses')&&!r.url.endsWith('/input_tokens')).length,postsBeforeBorrow);assert.equal(models.ledger.get('gate-2'),null);
  await invoke('build-1','product-build-v1');const posts=seen.filter(r=>r.url.endsWith('/responses')&&!r.url.endsWith('/input_tokens'));assert.equal(posts.at(-1).body.max_output_tokens,32768);assert.equal(models.ledger.get('build-1').reservation,205);assert.equal(models.ledger.get('build-1').metadata.stageContract,'product-build-v1');assert.equal(models.totals().callsUsed,2);assert.equal(models.totals().retainedMinor,164+205+400);
 }finally{store.close();const path=realpathSync(base),rel=relative(realpathSync(tmpdir()),path);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(path,{recursive:true,force:true});}
});
