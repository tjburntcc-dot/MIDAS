import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StateStore} from '../src/state.ts';
import {hash,rawHash} from '../src/contracts.ts';
import {BACKGROUND_POLICY} from '../src/durable-responses.ts';
import {
 R3_ACCEPTED_BRIEF_BYTES,R3_ACCEPTED_BRIEF_HASH,R3_DECISION_TASK_ID,R3_PARENT_ATTEMPT_ID,R3_PARENT_PROPOSAL_HASH,R3_PARENT_TASK_ID,
 durableRetirementAllowsProgress,inspectDurableContinuationParent,validateDurableContinuationR3,validateDurableContinuationWorkspace
} from '../src/portfolio/continuation-r3.ts';
import {prepareDurableContinuationR3} from '../tools/prepare-durable-continuation-r3.mjs';

const repository=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const workspace=repository.includes(join('var','foundry-worktree-031-durable-r3'))?resolve(repository,'..','..'):repository;
const parentRoot=join(workspace,'var','foundry-worktree-031-finalization-r2','var','portfolio-031-continuation-r2');
const backupRoot=join(workspace,'var','foundry-worktree-031-finalization-r2','var','portfolio-031-continuation-r2-stop-backup');
const actualFixture=existsSync(join(parentRoot,'portfolio.authorization.json'))&&existsSync(join(backupRoot,'manifest.json'));

test('R3 inspector authenticates the full chain and freezes the exact uncertain R2 stop',{skip:!actualFixture},()=>{
 const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8');
 const parent=inspectDurableContinuationParent(parentRoot,publicKey);
 assert.equal(hash(parent.proposal),R3_PARENT_PROPOSAL_HASH);
 assert.equal(parent.attempt.id,R3_PARENT_ATTEMPT_ID);
 assert.equal(parent.task.id,R3_PARENT_TASK_ID);
 assert.equal(parent.attempt.errorCode,23);
 assert.equal(parent.attempt.reservation,123);
 assert.equal(parent.attempt.result,null);
 assert.equal(parent.attempt.observation.providerRequestId,undefined);
 assert.equal(parent.attempt.observation.outputArtifact,undefined);
 assert.equal(parent.requestBodyHash,'8d2adcbce25ad934b3c64b3c59c98d5d6b50782b18f9379e5d10d3a985999c75');
 assert.equal(parent.attemptHash,'c3ad5f0e1183164fc771a9b61f925fe42f4b33c58e45c4879a8f838617caa923');
 assert.equal(parent.requestRecordHash,'398e54431b5a8e67c891502be942b99c4b206f1e90f6b4a0abdb4696e7c020f4');
 assert.equal(parent.taskStateHash,'7dc74ae2927bc27c0b14da527318ec0439fed699c6020705bb3a26fdcffe028a');
 assert.equal(parent.sourceArtifactHash,'478c66db4ebbe9e9060c19cbed853a622244f14f005bd687c3185c90c8bff6da');
 assert.equal(parent.source.content.brief.sha256,R3_ACCEPTED_BRIEF_HASH);
 assert.equal(parent.source.content.brief.bytes,R3_ACCEPTED_BRIEF_BYTES);
 assert.deepEqual(parent.historical,{admissions:9,counts:9,reservedMinor:1107,provisionalMinor:384,settledMinor:0,countBufferMinor:400});
 assert.equal(parent.retired,null);
 assert.equal(parent.operatingRetired,null);
});

test('R3 preparer creates an unsigned durable amendment without provider work or application seed',{skip:!actualFixture,timeout:90000},async()=>{
 const base=mkdtempSync(join(tmpdir(),'portfolio-durable-r3-')),root=join(base,'r3');
 try{
  const manifest=JSON.parse(readFileSync(join(backupRoot,'manifest.json'),'utf8'));
  const prepared=await prepareDurableContinuationR3({parentRoot,backupRoot,manifestHash:manifest.sha256,root});
  const proposal=JSON.parse(readFileSync(join(prepared.output,'portfolio.authorization.request.json'),'utf8'));
  const bytes=readFileSync(join(prepared.output,'initial-responses-bytes.json'),'utf8'),body=JSON.parse(bytes);
  const taskManifest=JSON.parse(readFileSync(join(prepared.output,'task-manifest.json'),'utf8'));
  assert.equal(proposal.approved,false);
  assert.equal(proposal.portfolio.approved,false);
  assert.equal(proposal.portfolio.continuation.kind,'portfolio-v4-durable-continuation-r3');
  assert.deepEqual(proposal.portfolio.continuation.durability.retrieval,{method:'GET',admittedResponseIdsOnly:true,inferenceAdmissions:false,countAdmissions:false,maxPerResponse:240,maxAcrossGrantedResponses:6000});
  assert.equal(proposal.portfolio.continuation.durability.applicationStateRetention,'store-true-provider-retention-at-least-30-days');
  assert.equal(proposal.portfolio.continuation.durability.zeroDataRetentionCompatibility,'not-guaranteed');
  assert.equal(proposal.portfolio.continuation.durability.createAcknowledgementGap,'unknown-no-resubmit');
  assert.equal(proposal.portfolio.route.deadlineMs,60000);
  assert.deepEqual(proposal.portfolio.route.background,BACKGROUND_POLICY);
  assert.equal(body.background,true);
  assert.equal(body.store,true);
  assert.equal(proposal.incrementalExposureMinor,3075);
  assert.equal(proposal.historicalRetainedMinor,1507);
  assert.equal(proposal.maximumExposureMinor,4582);
  assert.equal(proposal.inferenceAdmissions,25);
  assert.equal(proposal.countAdmissions,25);
  assert.equal(prepared.providerRequests,0);
  assert.equal(prepared.credentialRead,false);
  assert.equal(prepared.privateKeyRead,false);
  assert.equal(proposal.portfolio.initialRequests[0].bodyHash,rawHash(bytes));
  assert.deepEqual(proposal.portfolio.tasks.map((t:any)=>[t.id,t.workCalls]),[['quote-desk/decide-v4-r3',1],['quote-desk/build-v4-r3',10],['quote-desk/review-product-v4-r3',6],['quote-desk/operate-v4-r3',6],['quote-desk/adapt-v4-r3',1]]);
  assert.equal(taskManifest.preservedArtifact.briefHash,R3_ACCEPTED_BRIEF_HASH);
  assert.equal(taskManifest.preservedArtifact.briefBytes,R3_ACCEPTED_BRIEF_BYTES);
  assert.equal(taskManifest.uncertainR2.attemptId,R3_PARENT_ATTEMPT_ID);
  assert.equal(taskManifest.uncertainR2.preserved,true);
  assert.equal(existsSync(join(root,'portfolio.authorization.json')),false);
  assert.equal(existsSync(join(root,'auth')),false);
  const store=new StateStore(join(root,'portfolio.sqlite'));
  try{
   const oldAttempt=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key LIKE ?").get('%/'+R3_PARENT_ATTEMPT_ID) as any;
   assert(oldAttempt);
   assert.equal(JSON.parse(String(oldAttempt.body)).reservation,123);
   assert.equal(store.get('portfolio-task',R3_PARENT_TASK_ID).status,'needs_reconciliation');
   const fresh=store.get('portfolio-task',R3_DECISION_TASK_ID);
   assert.equal(fresh.status,'queued');
   assert.equal(fresh.inputs.continuationReplacement.preservesUncertainOutcome,true);
   assert.equal(fresh.inputs.continuationReplacement.preservesReservation,true);
   assert.equal(store.db.prepare("SELECT COUNT(*) count FROM entities WHERE kind='local-workspace' AND json_extract(body,'$.taskId') LIKE '%-r3'").get().count,0);
  }finally{store.close();}
  const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8');
  validateDurableContinuationR3(proposal.portfolio,publicKey,false);
  assert.throws(()=>validateDurableContinuationR3(proposal.portfolio,publicKey,true),/DURABLE_PARENT_RETIREMENT_REQUIRED/);
  const changed=structuredClone(proposal.portfolio);changed.continuation.parentAttemptHash='0'.repeat(64);
  assert.throws(()=>validateDurableContinuationR3(changed,publicKey,false),/DURABLE_PARENT_RECORD_CHANGED/);
  const marker={continuationId:proposal.portfolio.id,continuationRoot:proposal.portfolio.root,continuationGrantHash:hash(proposal.portfolio)};
  assert.equal(durableRetirementAllowsProgress(proposal.portfolio,null,null,false),false);
  assert.throws(()=>durableRetirementAllowsProgress(proposal.portfolio,null,null,true),/DURABLE_PARENT_RETIREMENT_REQUIRED/);
  assert.throws(()=>durableRetirementAllowsProgress(proposal.portfolio,marker,null,false),/DURABLE_PARENT_RETIREMENT_PARTIAL/);
  assert.throws(()=>durableRetirementAllowsProgress(proposal.portfolio,{...marker,continuationId:'competing-r3'},marker,true),/DURABLE_PARENT_ALREADY_CLAIMED/);
  assert.equal(durableRetirementAllowsProgress(proposal.portfolio,marker,marker,true),true);

  // Exercise the lifecycle distinction only in the disposable R3 copy. Exact
  // retirement permits legitimate progress, while task definitions, source and
  // grant-scoped activity remain bound to the signed lineage.
  const progressed=new StateStore(join(root,'portfolio.sqlite'));
  try{
   const task=progressed.get('portfolio-task',R3_DECISION_TASK_ID);
   progressed.transaction(()=>progressed.put('portfolio-task',R3_DECISION_TASK_ID,{...task,status:'running',attempts:1,lease:{token:'test-only',ownerId:'test',workerId:'portfolio-worker',generation:1,heartbeatAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}},task._version));
   progressed.put('local-workspace','r3-lifecycle-test',{taskId:R3_DECISION_TASK_ID,kind:'service',files:[],checks:[],published:null},null);
   const attemptId='r3-lifecycle-test',scope=Object.values(proposal.portfolio.accountScope).join('/'),bindingKey=scope+'/'+attemptId;
   progressed.put('portfolio-work-binding',bindingKey,{attemptId,taskId:R3_DECISION_TASK_ID,ventureId:'quote-desk',grantHash:hash(proposal.portfolio),bodyHash:'a'.repeat(64),recoveryOf:null},null);
   validateDurableContinuationWorkspace(proposal.portfolio,proposal.portfolio.continuation,true);
   assert.throws(()=>validateDurableContinuationWorkspace(proposal.portfolio,proposal.portfolio.continuation,false),/DURABLE_FRESH_TASKS_CHANGED|DURABLE_FRESH_ACTIVITY_PRESENT/);
   const binding=progressed.get('portfolio-work-binding',bindingKey);
   progressed.put('portfolio-work-binding',bindingKey,{...binding,grantHash:'0'.repeat(64)},binding._version);
   assert.throws(()=>validateDurableContinuationWorkspace(proposal.portfolio,proposal.portfolio.continuation,true),/DURABLE_PROGRESS_LINEAGE_CHANGED/);
  }finally{progressed.close();}
 }finally{
  const path=realpathSync(base),rel=relative(realpathSync(tmpdir()),path);
  assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(path,{recursive:true,force:true});
 }
});
