/** Mission 031 R4 stage-contract continuation validation.
 *
 * R3 durably observed two terminal, known-incomplete responses: the ordinary
 * planning request and its single approved linked recovery. R4 preserves both
 * outcomes, the older unknown R2 request and every reservation. It starts a
 * separately authorized compact decision under stage-specific request and
 * budget contracts. Nothing here retries or edits a historical response.
 */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {BACKGROUND_POLICY} from '../durable-responses.ts';
import {hash,rawHash,requireThat,scopeKey} from '../contracts.ts';
import {verified} from '../experiment/config.ts';
import {validateContinuation} from './continuation.ts';
import {STAGE_CONTRACTS} from './stage-contracts.ts';
import type {HistoricalExposure} from './continuation.ts';
import type {PortfolioGrant} from './live.ts';

export const STAGE_CONTINUATION_KIND='portfolio-v4-stage-continuation-r4' as const;
export const R4_PARENT_PROPOSAL_HASH='af14b710d2b1ed96f10cd4cdef28bdccbe2025254ba8b5d6ea814052b6663bc2';
export const R4_PARENT_TASK_ID='quote-desk/decide-v4-r3';
export const R4_PARENT_ATTEMPT_IDS=['p031-22358da25ae430ca-0','p031-22358da25ae430ca-1'] as const;
export const R4_DECISION_TASK_ID='quote-desk/decide-v4-r4';
export const R4_SOURCE_ARTIFACT_ID='quote-desk/accepted-investigation-v4-r2-source';
export const R4_ACCEPTED_BRIEF_HASH='fae4225c8d37b82b2ad8fc10a622988081538da7a794338e6bfac09bd583d34e';
export const R4_ACCEPTED_BRIEF_BYTES=17908;
export const R4_REPLACEMENT_KIND='approved-stage-contract-replacement-of-incomplete-r3-v1' as const;
const R4_PARENT_RECORD_HASHES={attempts:'4c002681339e7a86b8a4a01edf28ebe735e272eb7b299b9e16cc37c8928cb13c',bindings:'e84d264740954a1c9cf11049b2a70090b2638f5fd13e809a4e09654710fd88f9',account:'cd31bfb2e362f9412be483d4f3f13f9614be110cd1d06d9ab4fa1d85a4d410fb',tasks:'e3b8916fc95aa26704741c2fec588369be2449b8ae5fbd5450a4cf1535747b1b',requests:'55a77e31d1aa11bbe39831823f300a9447d89de9d2983ba7652ae40b46431600',results:'e114caadc6a84bf6720e4658610a4fe1229a3100d7cfdc5f6c0324e91b232216',steps:'4da5fc4e83cd5cf2cefe4a4e5345090eddf466af102c906a9bf02f19a49db666',jobs:'bb78b97ff0bfe3cc25824b5a2ead5f2c5875474477c05ef4867eb37cf1f4abc7',intents:'96af77dc3229b2cd7e6e36fa65802d8ccc846a5df073526c1b7fe1c9aced4bdb',links:'0c67749b8d8f67eabeb12aab4193204cd8fa144d1753e35d3b6656119bd3222f',source:'478c66db4ebbe9e9060c19cbed853a622244f14f005bd687c3185c90c8bff6da'} as const;

export const R4_TASK_CONTRACTS=[
 {parentId:'quote-desk/decide-v4-r3',id:'quote-desk/decide-v4-r4',workCalls:1,stageContract:'build-gate-v1'},
 {parentId:'quote-desk/build-v4-r3',id:'quote-desk/build-v4-r4',workCalls:5,stageContract:'product-build-v1'},
 {parentId:'quote-desk/review-product-v4-r3',id:'quote-desk/review-product-v4-r4',workCalls:4,stageContract:'product-review-v1'},
 {parentId:'quote-desk/operate-v4-r3',id:'quote-desk/operate-v4-r4',workCalls:4,stageContract:'operating-delivery-v1'},
 {parentId:'quote-desk/adapt-v4-r3',id:'quote-desk/adapt-v4-r4',workCalls:1,stageContract:'outcome-review-v1'}
] as const;

export type StageContinuationR4={
 kind:typeof STAGE_CONTINUATION_KIND;
 parentRoot:string;
 parentGrantFileHash:string;
 parentGrantHash:string;
 parentOperatingHash:string;
 parentProposalHash:string;
 backupManifestHash:string;
 backupDatabaseHash:string;
 restoreHash:string;
 attemptsHash:string;
 bindingsHash:string;
 accountHash:string;
 parentTasksHash:string;
 requestRecordsHash:string;
 resultRecordsHash:string;
 stepsHash:string;
 responseJobsHash:string;
 recoveryIntentsHash:string;
 recoveryLinksHash:string;
 parentSourceArtifactHash:string;
 parentTaskId:string;
 parentAttemptIds:string[];
 parentAttemptHashes:string[];
 parentRequestBodyHashes:string[];
 parentResponseIds:string[];
 parentTerminalHashes:string[];
 sourceArtifactId:string;
 sourceArtifactHash:string;
 sourceManifestHash:string;
 sourcePayloadHash:string;
 sourceBriefHash:string;
 sourceBriefBytes:number;
 carryId:string;
 historical:HistoricalExposure;
 durability:{
  policyHash:string;
  requestBody:{background:true;store:true};
  applicationStateRetention:'store-true-provider-retention-at-least-30-days';
  zeroDataRetentionCompatibility:'not-guaranteed';
  createAcknowledgementGap:'unknown-no-resubmit';
  retrieval:{method:'GET';admittedResponseIdsOnly:true;inferenceAdmissions:false;countAdmissions:false;maxPerResponse:240;maxAcrossGrantedResponses:3600};
  remoteMutation:{cancel:false;delete:false;retryPost:false};
 };
 combinedCeilingMinor:number;
 combinedAdmissionLimit:number;
 originalCeilingMinor:number;
 originalAdmissionLimit:number;
 replacement:{
  kind:typeof R4_REPLACEMENT_KIND;
  failedTaskId:string;
  failedAttemptIds:string[];
  failedRequestBodyHashes:string[];
  replacementTaskId:string;
  preservesFailedOutcomes:true;
  preservesReservations:true;
  olderUnknownAttemptId:string;
  preservesOlderUnknownOutcome:true;
 };
 tasks:Array<{parentId:string;id:string;workCalls:number;stageContract:string}>;
};

type R4Grant=Omit<PortfolioGrant,'continuation'|'recovery'|'route'>&{
 continuation:StageContinuationR4;
 recovery:{kind:'known-incomplete-v1';maxAdmissions:0};
 route:PortfolioGrant['route']&{background:typeof BACKGROUND_POLICY};
};

const rows=(db:DatabaseSync,kind:string)=>db.prepare('SELECT key,body FROM entities WHERE kind=? ORDER BY key').all(kind).map(r=>({key:String(r.key),body:JSON.parse(String(r.body))}));
const entity=(db:DatabaseSync,kind:string,key:string)=>{const r=db.prepare('SELECT body FROM entities WHERE kind=? AND key=?').get(kind,key);return r?JSON.parse(String(r.body)):null;};
const taskDefinitionHash=(t:any)=>{const {authoritativeArtifactId,...inputs}=t.inputs??{};return hash({id:t.id,ventureId:t.ventureId,title:t.title,objective:t.objective,capability:t.capability,dependsOn:t.dependsOn,allowedTools:t.allowedTools,acceptance:t.acceptance,requiredChecks:t.requiredChecks,requiredCompetencies:t.requiredCompetencies,resource:t.resource,inputs});};

export function stageReplacementLink(c:Pick<StageContinuationR4,'parentTaskId'|'parentAttemptIds'|'parentRequestBodyHashes'|'replacement'>){
 return {kind:R4_REPLACEMENT_KIND,failedTaskId:c.parentTaskId,failedAttemptIds:[...c.parentAttemptIds],failedRequestBodyHashes:[...c.parentRequestBodyHashes],replacementTaskId:c.replacement.replacementTaskId,preservesFailedOutcomes:true as const,preservesReservations:true as const,olderUnknownAttemptId:c.replacement.olderUnknownAttemptId,preservesOlderUnknownOutcome:true as const};
}

/** Authenticate R3 and its entire public R3 -> R2 -> R1 chain, then freeze the
 * exact terminal R3 records. Public signature material is the only key data
 * read by this inspector. */
export function inspectStageContinuationParent(parentRoot:string,publicKey:string){
 parentRoot=resolve(parentRoot);
 const grantBytes=readFileSync(join(parentRoot,'portfolio.authorization.json'));
 const envelope=JSON.parse(grantBytes.toString('utf8'));
 const grant=verified(envelope,publicKey) as PortfolioGrant;
 const inner=verified(envelope.operatingEnvelope,publicKey) as any;
 requireThat(grant.approved&&grant.root===parentRoot&&grant.continuation?.kind==='portfolio-v4-durable-continuation-r3'&&grant.operatingGrantHash===hash(inner),'STAGE_PARENT_AUTHORITY');
 validateContinuation(grant,publicKey,true);
 const proposal=JSON.parse(readFileSync(join(parentRoot,'proposal',grant.id,'portfolio.authorization.request.json'),'utf8'));
 requireThat(hash(proposal)===R4_PARENT_PROPOSAL_HASH,'STAGE_PARENT_PROPOSAL_CHANGED');
 const db=new DatabaseSync(join(parentRoot,'portfolio.sqlite'),{readOnly:true});
 try{
  const grantHash=hash(grant),operatingHash=hash(inner),scope=scopeKey(grant.accountScope);
  const attempts=rows(db,'model-attempt').filter(r=>r.key.startsWith(scope+'/'));
  const bindings=rows(db,'portfolio-work-binding').filter(r=>r.key.startsWith(scope+'/'));
  const account=entity(db,'experiment-account',scope);
  const historicalLedgerHash=hash({account,attempts:attempts.map(r=>({key:r.key,value:r.body}))});
  const tasks=(grant.tasks??[]).map(t=>entity(db,'portfolio-task',t.id));
  requireThat(account?.authorizationHash===operatingHash&&hash(account.limits)===hash(inner.limits)&&account.settled===0&&!account.halted,'STAGE_PARENT_ACCOUNT');
  requireThat(tasks.length===5&&tasks.every((t,i)=>t&&!t.lease&&taskDefinitionHash(t)===grant.tasks![i].definitionHash),'STAGE_PARENT_TASKS_CHANGED');
  const decision=tasks.find(t=>t.id===R4_PARENT_TASK_ID);
  requireThat(decision?.status==='needs_reconciliation'&&decision.reason==='MODEL_RESPONSE_INCOMPLETE'&&decision.attempts===2&&!decision.lease&&decision.dependsOn.length===0&&decision.inputArtifacts.length===1&&decision.inputArtifacts[0].artifactId===R4_SOURCE_ARTIFACT_ID&&!decision.outputArtifacts.length&&!decision.result,'STAGE_PARENT_STOP_CHANGED');
  requireThat(tasks.filter(t=>t.id!==R4_PARENT_TASK_ID).every(t=>t.status==='queued'&&t.attempts===0&&!t.lease&&!t.outputArtifacts.length),'STAGE_PARENT_DESCENDANT_STARTED');
  requireThat(attempts.length===2&&bindings.length===2,'STAGE_PARENT_ATTEMPT_COUNT');
  const orderedAttempts=R4_PARENT_ATTEMPT_IDS.map(id=>attempts.find(r=>r.body.id===id)?.body);
  const orderedBindings=R4_PARENT_ATTEMPT_IDS.map(id=>bindings.find(r=>r.body.attemptId===id)?.body);
  requireThat(orderedAttempts.every(Boolean)&&orderedBindings.every(Boolean),'STAGE_PARENT_ATTEMPT_IDENTITY');
  for(let i=0;i<orderedAttempts.length;i++){
   const attempt=orderedAttempts[i],binding=orderedBindings[i],expectedInput=i===0?9704:9748,expectedResponse=i===0?'resp_0753b49c8f412da3006aa6d4f0ff4c87d2baa2364d225df268':'resp_059a4e036a33e18f006aa6d6d7f85487d2ba8d921431a15675';
   requireThat(attempt.finishedAt&&attempt.status==='failed'&&attempt.errorCode==='MODEL_RESPONSE_INCOMPLETE'&&attempt.reservation===123&&attempt.inferenceDispatchIntent===true&&attempt.countDispatchIntent===true&&attempt.result===null&&!attempt.invoice&&attempt.cost?.status==='provisional'&&attempt.cost.money?.currency==='USD'&&attempt.cost.money.minorUnits===95,'STAGE_PARENT_ATTEMPT_CHANGED');
   requireThat(attempt.requestHash===binding.bodyHash&&binding.grantHash===grantHash&&binding.taskId===R4_PARENT_TASK_ID&&binding.ventureId==='quote-desk'&&binding.recoveryOf===(i===0?null:R4_PARENT_ATTEMPT_IDS[0]),'STAGE_PARENT_BINDING_CHANGED');
   const o=attempt.observation;
   requireThat(o?.status==='incomplete'&&o.model==='gpt-6-astra'&&o.providerRequestId===expectedResponse&&attempt.providerRequestId===expectedResponse&&o.inputTokens===expectedInput&&o.outputTokens===16384&&o.cachedInputTokens===0&&o.tokenCount?.operation==='token_count'&&o.tokenCount.phase==='count_received'&&o.tokenCount.httpStatus===200&&o.tokenCount.inputTokens===expectedInput-1&&o.tokenCount.inferenceRequestHash===attempt.requestHash,'STAGE_PARENT_OBSERVATION_CHANGED');
  }
  const requestRecords=rows(db,'portfolio-model-request').filter(r=>r.body.taskId===R4_PARENT_TASK_ID||r.body.call?.taskId===R4_PARENT_TASK_ID||r.key.startsWith(R4_PARENT_TASK_ID+'/'));
  const resultRecords=rows(db,'portfolio-model-result').filter(r=>r.body.taskId===R4_PARENT_TASK_ID||r.key.startsWith(R4_PARENT_TASK_ID+'/'));
  const steps=rows(db,'portfolio-step').filter(r=>r.body.taskId===R4_PARENT_TASK_ID);
  requireThat(requestRecords.length===2&&steps.length===2&&resultRecords.length===1,'STAGE_PARENT_LOCAL_RECORD_COUNT');
  for(let i=0;i<2;i++){
   const request=requestRecords[i].body,binding=orderedBindings[i];
   requireThat(request.call?.attemptId===R4_PARENT_ATTEMPT_IDS[i]&&request.call.ventureId==='quote-desk'&&(request.call.recoveryOf??null)===(i===0?null:R4_PARENT_ATTEMPT_IDS[0])&&hash(request.call.request)===hash(binding.request)&&hash(request.call.schema)===hash(binding.schema)&&hash(request.call.sourceHosts)===hash(binding.sourceHosts)&&/^[a-f0-9]{64}$/.test(request.identity),'STAGE_PARENT_REQUEST_CHANGED');
  }
  requireThat(resultRecords[0].body?.output?.knownFailure==='MODEL_RESPONSE_INCOMPLETE'&&resultRecords[0].body.output.providerEvidence?.parentAttemptId===R4_PARENT_ATTEMPT_IDS[0]&&resultRecords[0].body.output.providerEvidence?.eligible===true,'STAGE_PARENT_FAILURE_RECORD_CHANGED');
  requireThat(steps[0].body.status==='completed'&&steps[0].body.outcome?.reconciled===true&&steps[1].body.status==='uncertain'&&steps[1].body.outcome?.error==='MODEL_RESPONSE_INCOMPLETE','STAGE_PARENT_STEP_CHANGED');
  const responseJobs=rows(db,'response-job').filter(r=>r.key.startsWith(scope+'/'));
  requireThat(responseJobs.length===2,'STAGE_PARENT_RESPONSE_JOB_COUNT');
  const orderedJobs=R4_PARENT_ATTEMPT_IDS.map(id=>responseJobs.find(r=>r.key===scope+'/'+id)?.body);
  for(let i=0;i<2;i++){
   const job=orderedJobs[i],attempt=orderedAttempts[i];
   requireThat(job&&job.grantHash===operatingHash&&job.requestHash===attempt.requestHash&&job.responseId===attempt.providerRequestId&&job.status==='incomplete'&&job.terminal?.id===job.responseId&&job.terminal.status==='incomplete'&&job.terminal.background===true&&job.terminal.store===true&&job.terminal.model==='gpt-6-astra'&&job.terminal.incomplete_details?.reason==='max_output_tokens'&&job.terminal.usage?.input_tokens===attempt.observation.inputTokens&&job.terminal.usage?.output_tokens===16384&&hash(job.terminal)===job.terminalHash&&job.retrievals===(i===0?72:74),'STAGE_PARENT_RESPONSE_JOB_CHANGED');
  }
  const recoveryIntents=rows(db,'portfolio-recovery-intent').filter(r=>r.body.taskId===R4_PARENT_TASK_ID||R4_PARENT_ATTEMPT_IDS.includes(r.body.parentAttemptId as any));
  const recoveryLinks=rows(db,'portfolio-recovery-link').filter(r=>r.body.taskId===R4_PARENT_TASK_ID||R4_PARENT_ATTEMPT_IDS.includes(r.body.parentAttemptId as any));
  requireThat(recoveryIntents.length===1&&recoveryLinks.length===1&&recoveryIntents[0].body.id===R4_PARENT_ATTEMPT_IDS[1]&&recoveryIntents[0].body.parentAttemptId===R4_PARENT_ATTEMPT_IDS[0]&&recoveryLinks[0].body.attemptId===R4_PARENT_ATTEMPT_IDS[1]&&recoveryLinks[0].body.parentAttemptId===R4_PARENT_ATTEMPT_IDS[0]&&recoveryLinks[0].body.grantHash===grantHash,'STAGE_PARENT_RECOVERY_LINK_CHANGED');
  const operatingResponses=rows(db,'operating-response').filter(r=>r.key.startsWith(scope+'/'));
  const operatingRecoveryLinks=rows(db,'operating-recovery-link').filter(r=>r.key.startsWith(scope+'/'));
  requireThat(!operatingResponses.length&&!operatingRecoveryLinks.length,'STAGE_PARENT_EXTRA_ACTIVITY');
  const source=entity(db,'portfolio-artifact',R4_SOURCE_ARTIFACT_ID),upstream=grant.continuation;
  requireThat(source&&source.version===1&&source.sha256===upstream.sourceArtifactHash&&source.metadata?.manifestHash===upstream.sourceManifestHash&&source.metadata?.preservedSource?.payloadHash===upstream.sourcePayloadHash&&source.content?.brief?.sha256===R4_ACCEPTED_BRIEF_HASH&&source.content.brief.bytes===R4_ACCEPTED_BRIEF_BYTES&&source.provenance==='actual_model_historical_reuse','STAGE_PARENT_SOURCE_CHANGED');
  const prior=upstream.historical;
  const historical:HistoricalExposure={admissions:prior.admissions+2,counts:prior.counts+2,reservedMinor:prior.reservedMinor+246,provisionalMinor:prior.provisionalMinor+190,settledMinor:prior.settledMinor,countBufferMinor:prior.countBufferMinor};
  requireThat(hash(historical)===hash({admissions:11,counts:11,reservedMinor:1353,provisionalMinor:574,settledMinor:0,countBufferMinor:400})&&inner.limits.totalMinor===4582&&inner.limits.astraCountRequests===25&&inner.limits.overheadReserve?.minor===400&&inner.limits.carryIn?.length===1,'STAGE_PARENT_EXPOSURE_CHANGED');
  requireThat(hash(attempts)===R4_PARENT_RECORD_HASHES.attempts&&hash(bindings)===R4_PARENT_RECORD_HASHES.bindings&&hash(account)===R4_PARENT_RECORD_HASHES.account&&hash(tasks)===R4_PARENT_RECORD_HASHES.tasks&&hash(requestRecords)===R4_PARENT_RECORD_HASHES.requests&&hash(resultRecords)===R4_PARENT_RECORD_HASHES.results&&hash(steps)===R4_PARENT_RECORD_HASHES.steps&&hash(responseJobs)===R4_PARENT_RECORD_HASHES.jobs&&hash(recoveryIntents)===R4_PARENT_RECORD_HASHES.intents&&hash(recoveryLinks)===R4_PARENT_RECORD_HASHES.links&&hash(source)===R4_PARENT_RECORD_HASHES.source,'STAGE_PARENT_EXACT_DIGEST_CHANGED');
  return {grant,inner,proposal,grantFileHash:rawHash(grantBytes),attemptsHash:hash(attempts),bindingsHash:hash(bindings),accountHash:hash(account),historicalLedgerHash,tasksHash:hash(tasks),requestRecordsHash:hash(requestRecords),resultRecordsHash:hash(resultRecords),stepsHash:hash(steps),responseJobsHash:hash(responseJobs),recoveryIntentsHash:hash(recoveryIntents),recoveryLinksHash:hash(recoveryLinks),sourceArtifactHash:hash(source),attemptHashes:orderedAttempts.map(hash),requestBodyHashes:orderedAttempts.map(a=>a.requestHash),responseIds:orderedAttempts.map(a=>a.providerRequestId),terminalHashes:orderedJobs.map(j=>j.terminalHash),attempts:orderedAttempts,bindings:orderedBindings,responseJobs:orderedJobs,source,tasks,task:decision,historical,
   retired:entity(db,'portfolio-revocation',grantHash),operatingRetired:entity(db,'operating-revocation',operatingHash)};
 }finally{db.close();}
}

export function stageContinuationCarry(c:StageContinuationR4){
 return [{id:c.carryId,exposureMinor:c.historical.reservedMinor,evidenceHash:hash({parentGrantHash:c.parentGrantHash,parentHistorical:c.historical,attemptsHash:c.attemptsHash,responseJobsHash:c.responseJobsHash})}];
}

export function stageRetirementAllowsProgress(g:PortfolioGrant,retired:any,operatingRetired:any,requireRetired:boolean){
 const expected={continuationId:g.id,continuationRoot:g.root,continuationGrantHash:hash(g)};
 if(!retired&&!operatingRetired){requireThat(!requireRetired,'STAGE_PARENT_RETIREMENT_REQUIRED');return false;}
 requireThat(retired&&operatingRetired,'STAGE_PARENT_RETIREMENT_PARTIAL');
 for(const marker of [retired,operatingRetired])requireThat(Object.entries(expected).every(([k,v])=>marker[k]===v),'STAGE_PARENT_ALREADY_CLAIMED');
 return true;
}

/** Before R3 retirement, every R4 task must be pristine. After the exact pair
 * of retirement markers exists, mutable progress is allowed while task
 * definitions, source identity and grant-scoped lineage remain immutable. */
export function validateStageContinuationWorkspace(g:PortfolioGrant,c:StageContinuationR4,allowProgress:boolean){
 const db=new DatabaseSync(join(g.root,'portfolio.sqlite'),{readOnly:true});
 try{
  const source=entity(db,'portfolio-artifact',c.sourceArtifactId),freshTasks=c.tasks.map(t=>entity(db,'portfolio-task',t.id)),decision=freshTasks.find(t=>t?.id===R4_DECISION_TASK_ID);
  requireThat(source&&hash(source)===c.parentSourceArtifactHash&&source.sha256===c.sourceArtifactHash,'STAGE_IMPORTED_SOURCE_CHANGED');
  requireThat(freshTasks.length===5&&freshTasks.every(t=>t&&g.tasks?.some(a=>a.id===t.id&&a.definitionHash===taskDefinitionHash(t))),'STAGE_FRESH_TASKS_CHANGED');
  for(const mapping of c.tasks){const task=freshTasks.find(t=>t.id===mapping.id);requireThat(task?.inputs?.stageContract===mapping.stageContract&&task.inputArtifacts.length===1&&task.inputArtifacts[0].artifactId===c.sourceArtifactId&&task.inputArtifacts[0].version===1&&task.inputArtifacts[0].sha256===c.sourceArtifactHash,'STAGE_TASK_CONTRACT_CHANGED');}
  requireThat(decision?.dependsOn.length===0&&decision.inputArtifacts.length===1&&decision.inputArtifacts[0].artifactId===c.sourceArtifactId&&decision.inputArtifacts[0].version===1&&decision.inputArtifacts[0].sha256===c.sourceArtifactHash&&hash(decision.inputs?.continuationReplacement)===hash(stageReplacementLink(c)),'STAGE_REPLACEMENT_TASK_CHANGED');
  const freshIds=new Set(c.tasks.map(t=>t.id)),scope=scopeKey(g.accountScope),allBindings=rows(db,'portfolio-work-binding'),freshBindings=allBindings.filter(r=>freshIds.has(r.body.taskId)),scopedBindings=allBindings.filter(r=>r.key.startsWith(scope+'/'));
  requireThat(freshBindings.every(r=>r.key.startsWith(scope+'/')&&r.body.grantHash===hash(g)&&r.body.attemptId&&r.key===scope+'/'+r.body.attemptId&&/^[a-f0-9]{64}$/.test(r.body.bodyHash))&&scopedBindings.every(r=>freshIds.has(r.body.taskId)&&r.body.grantHash===hash(g)),'STAGE_PROGRESS_LINEAGE_CHANGED');
  const jobs=rows(db,'response-job').filter(r=>r.key.startsWith(scope+'/'));
  requireThat(jobs.every(r=>r.body.grantHash===g.operatingGrantHash&&/^[a-f0-9]{64}$/.test(r.body.requestHash)),'STAGE_RESPONSE_JOB_LINEAGE_CHANGED');
  if(!allowProgress){
   requireThat(freshTasks.every(t=>t.status==='queued'&&t.attempts===0&&!t.lease&&!t.outputArtifacts.length),'STAGE_FRESH_TASKS_CHANGED');
   requireThat(!rows(db,'local-workspace').some(r=>freshIds.has(r.body.taskId))&&!rows(db,'portfolio-step').some(r=>freshIds.has(r.body.taskId))&&!rows(db,'portfolio-model-result').some(r=>freshIds.has(r.body.taskId))&&!freshBindings.length&&!jobs.length,'STAGE_FRESH_ACTIVITY_PRESENT');
  }
 }finally{db.close();}
}

export function validateStageContinuationR4(input:PortfolioGrant,publicKey:string,requireRetired:boolean){
 const c=input.continuation as StageContinuationR4|undefined;
 requireThat(c?.kind===STAGE_CONTINUATION_KIND&&resolve(c.parentRoot)!==input.root&&c.parentProposalHash===R4_PARENT_PROPOSAL_HASH,'STAGE_CONTINUATION_SCOPE');
 const g=input as R4Grant;
 requireThat(c.combinedCeilingMinor===4582&&c.combinedAdmissionLimit===26&&c.originalCeilingMinor===4582&&c.originalAdmissionLimit===34&&hash(c.historical)===hash({admissions:11,counts:11,reservedMinor:1353,provisionalMinor:574,settledMinor:0,countBufferMinor:400}),'STAGE_CONTINUATION_EXPOSURE');
 const p=inspectStageContinuationParent(c.parentRoot,publicKey);
 const restore=JSON.parse(readFileSync(join(g.root,'restore.json'),'utf8'));
 requireThat(hash(restore)===c.restoreHash&&restore.kind==='explicit-stage-continuation-copy-r4'&&restore.backupManifestHash===c.backupManifestHash&&restore.originalDatabaseHash===c.backupDatabaseHash&&restore.historicalLedgerHash===p.historicalLedgerHash&&resolve(restore.sourceRoot)===resolve(c.parentRoot)&&resolve(restore.root)===resolve(g.root)&&restore.credentialsCopied===false&&restore.privateKeysCopied===false&&restore.activeAuthorizationInstalled===false,'STAGE_RESTORE_CHANGED');
 requireThat(p.grantFileHash===c.parentGrantFileHash&&hash(p.grant)===c.parentGrantHash&&hash(p.inner)===c.parentOperatingHash&&p.attemptsHash===c.attemptsHash&&p.bindingsHash===c.bindingsHash&&p.accountHash===c.accountHash&&p.tasksHash===c.parentTasksHash,'STAGE_PARENT_CHANGED');
 requireThat(p.requestRecordsHash===c.requestRecordsHash&&p.resultRecordsHash===c.resultRecordsHash&&p.stepsHash===c.stepsHash&&p.responseJobsHash===c.responseJobsHash&&p.recoveryIntentsHash===c.recoveryIntentsHash&&p.recoveryLinksHash===c.recoveryLinksHash&&p.sourceArtifactHash===c.parentSourceArtifactHash,'STAGE_PARENT_RECORD_CHANGED');
 requireThat(hash(p.attemptHashes)===hash(c.parentAttemptHashes)&&hash(p.requestBodyHashes)===hash(c.parentRequestBodyHashes)&&hash(p.responseIds)===hash(c.parentResponseIds)&&hash(p.terminalHashes)===hash(c.parentTerminalHashes)&&hash(p.historical)===hash(c.historical),'STAGE_PARENT_REQUEST_IDENTITY_CHANGED');
 requireThat(c.parentTaskId===R4_PARENT_TASK_ID&&hash(c.parentAttemptIds)===hash(R4_PARENT_ATTEMPT_IDS)&&c.sourceArtifactId===R4_SOURCE_ARTIFACT_ID&&c.sourceArtifactHash===p.source.sha256&&c.sourceManifestHash===p.source.metadata.manifestHash&&c.sourcePayloadHash===p.source.metadata.preservedSource.payloadHash&&c.sourceBriefHash===R4_ACCEPTED_BRIEF_HASH&&c.sourceBriefBytes===R4_ACCEPTED_BRIEF_BYTES,'STAGE_SOURCE_IDENTITY_CHANGED');
 const expectedRoute={...p.grant.route,authorizationId:g.id,maxOutputTokens:32768,maxCallCost:{currency:'USD',minorUnits:205}};
 requireThat(p.grant.projectId===g.projectId&&p.grant.credentialFile===g.credentialFile&&p.grant.mode===g.mode&&p.grant.expiresAt===g.expiresAt&&hash(expectedRoute)===hash(g.route),'STAGE_AUTHORITY_CHANGED');
 requireThat(g.countUncertaintyMinor===400&&g.recovery?.maxAdmissions===0&&g.route.background?.store===true&&hash(g.route.background)===hash(BACKGROUND_POLICY),'STAGE_ROUTE_POLICY_CHANGED');
 const ordinary=15,spend=2829,total=spend+c.historical.reservedMinor+c.historical.countBufferMinor;
 requireThat(total===c.combinedCeilingMinor&&ordinary+c.historical.admissions===c.combinedAdmissionLimit&&total<=c.originalCeilingMinor&&c.combinedAdmissionLimit<=c.originalAdmissionLimit,'STAGE_COMBINED_CAP');
 requireThat(hash(c.durability)===hash({policyHash:hash(BACKGROUND_POLICY),requestBody:{background:true,store:true},applicationStateRetention:'store-true-provider-retention-at-least-30-days',zeroDataRetentionCompatibility:'not-guaranteed',createAcknowledgementGap:'unknown-no-resubmit',retrieval:{method:'GET',admittedResponseIdsOnly:true,inferenceAdmissions:false,countAdmissions:false,maxPerResponse:240,maxAcrossGrantedResponses:3600},remoteMutation:{cancel:false,delete:false,retryPost:false}}),'STAGE_DISCLOSURE_CHANGED');
  requireThat(g.ventures.length===1&&g.ventures[0].id==='quote-desk'&&g.ventures[0].goalHash===p.grant.ventures[0].goalHash&&g.ventures[0].workCalls===ordinary&&g.ventures[0].searchCalls===0&&g.tasks?.length===5&&g.tasks.reduce((n,t)=>n+t.workCalls,0)===ordinary,'STAGE_ALLOCATION_CHANGED');
 requireThat(hash(g.stageContracts)===hash(Object.values(STAGE_CONTRACTS)),'STAGE_CONTRACT_SET_CHANGED');
 requireThat(c.tasks.length===5&&new Set(c.tasks.map(t=>t.parentId)).size===5&&new Set(c.tasks.map(t=>t.id)).size===5&&hash(c.tasks)===hash(R4_TASK_CONTRACTS),'STAGE_TASK_MAPPING');
 for(const t of c.tasks){const old=p.grant.tasks?.find(a=>a.id===t.parentId),next=g.tasks!.find(a=>a.id===t.id);requireThat(old&&next&&t.id===t.parentId.replace(/-r3$/,'-r4')&&next.workCalls===t.workCalls&&next.stageContract===t.stageContract,'STAGE_TASK_CAP');}
 requireThat(hash(c.replacement)===hash({kind:R4_REPLACEMENT_KIND,failedTaskId:R4_PARENT_TASK_ID,failedAttemptIds:[...R4_PARENT_ATTEMPT_IDS],failedRequestBodyHashes:c.parentRequestBodyHashes,replacementTaskId:R4_DECISION_TASK_ID,preservesFailedOutcomes:true,preservesReservations:true,olderUnknownAttemptId:'p031-e2fd5c331b2304ca-0',preservesOlderUnknownOutcome:true}),'STAGE_REPLACEMENT_LINK_CHANGED');
 requireThat(g.initialRequests?.length===1&&g.initialRequests[0].taskId===R4_DECISION_TASK_ID,'STAGE_INITIAL_REQUIRED');
 const allowProgress=stageRetirementAllowsProgress(g,p.retired,p.operatingRetired,requireRetired);
 validateStageContinuationWorkspace(g,c,allowProgress);
 return p;
}
