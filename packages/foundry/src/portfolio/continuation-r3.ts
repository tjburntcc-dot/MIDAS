/** Mission 031 R3 continuation validation.
 *
 * R2 made one count request and one inference admission whose foreground POST
 * timed out before a response identity or output was persisted. R3 never treats
 * that unknown outcome as a retryable response. It preserves the attempt, its
 * request and reservation, and starts a separately authorized decision task on
 * the durable background route.
 */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {BACKGROUND_POLICY} from '../durable-responses.ts';
import {hash,rawHash,requireThat,scopeKey} from '../contracts.ts';
import {verified} from '../experiment/config.ts';
import {validateContinuation} from './continuation.ts';
import type {HistoricalExposure} from './continuation.ts';
import type {PortfolioGrant} from './live.ts';

export const DURABLE_CONTINUATION_KIND='portfolio-v4-durable-continuation-r3' as const;
export const R3_PARENT_PROPOSAL_HASH='3a14c090c51c88c624a7d9649f77cb0a27c6c9a339761ba59464067c086d98cb';
export const R3_PARENT_ATTEMPT_ID='p031-e2fd5c331b2304ca-0';
export const R3_PARENT_TASK_ID='quote-desk/decide-v4-r2';
export const R3_DECISION_TASK_ID='quote-desk/decide-v4-r3';
export const R3_SOURCE_ARTIFACT_ID='quote-desk/accepted-investigation-v4-r2-source';
export const R3_ACCEPTED_BRIEF_HASH='fae4225c8d37b82b2ad8fc10a622988081538da7a794338e6bfac09bd583d34e';
export const R3_ACCEPTED_BRIEF_BYTES=17908;
export const R3_REPLACEMENT_KIND='approved-fresh-replacement-of-uncertain-r2-v1' as const;

export type DurableContinuationR3={
 kind:typeof DURABLE_CONTINUATION_KIND;
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
 parentAttemptHash:string;
 parentBindingHash:string;
 parentRequestRecordHash:string;
 parentTaskStateHash:string;
 parentStepHash:string;
 parentSourceArtifactHash:string;
 parentRequestBodyHash:string;
 parentRequestHash:string;
 parentSchemaHash:string;
 parentTaskId:string;
 parentAttemptId:string;
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
  retrieval:{method:'GET';admittedResponseIdsOnly:true;inferenceAdmissions:false;countAdmissions:false;maxPerResponse:240;maxAcrossGrantedResponses:6000};
  remoteMutation:{cancel:false;delete:false;retryPost:false};
 };
 combinedCeilingMinor:number;
 combinedAdmissionLimit:number;
 originalCeilingMinor:number;
 originalAdmissionLimit:number;
 replacement:{
  kind:typeof R3_REPLACEMENT_KIND;
  uncertainTaskId:string;
  uncertainAttemptId:string;
  uncertainRequestBodyHash:string;
  replacementTaskId:string;
  preservesUncertainOutcome:true;
  preservesReservation:true;
 };
 tasks:Array<{parentId:string;id:string;workCalls:number}>;
};

type R3Grant=Omit<PortfolioGrant,'continuation'|'recovery'|'route'>&{
 continuation:DurableContinuationR3;
 recovery:{kind:'known-incomplete-v1';maxAdmissions:1};
 route:PortfolioGrant['route']&{background:typeof BACKGROUND_POLICY};
};

const rows=(db:DatabaseSync,kind:string)=>db.prepare('SELECT key,body FROM entities WHERE kind=? ORDER BY key').all(kind).map(r=>({key:String(r.key),body:JSON.parse(String(r.body))}));
const entity=(db:DatabaseSync,kind:string,key:string)=>{const r=db.prepare('SELECT body FROM entities WHERE kind=? AND key=?').get(kind,key);return r?JSON.parse(String(r.body)):null;};
const taskDefinitionHash=(t:any)=>{const {authoritativeArtifactId,...inputs}=t.inputs??{};return hash({id:t.id,ventureId:t.ventureId,title:t.title,objective:t.objective,capability:t.capability,dependsOn:t.dependsOn,allowedTools:t.allowedTools,acceptance:t.acceptance,requiredChecks:t.requiredChecks,requiredCompetencies:t.requiredCompetencies,resource:t.resource,inputs});};

export function durableReplacementLink(c:Pick<DurableContinuationR3,'parentTaskId'|'parentAttemptId'|'parentRequestBodyHash'|'replacement'>){
 return {kind:R3_REPLACEMENT_KIND,uncertainTaskId:c.parentTaskId,uncertainAttemptId:c.parentAttemptId,uncertainRequestBodyHash:c.parentRequestBodyHash,replacementTaskId:c.replacement.replacementTaskId,preservesUncertainOutcome:true as const,preservesReservation:true as const};
}

/** Authenticate the signed R2 packet and recursively validate R2 -> R1 -> the
 * original grant before examining the exact stopped R2 database. Only public
 * authority, proposal bytes and persisted state are read. */
export function inspectDurableContinuationParent(parentRoot:string,publicKey:string){
 parentRoot=resolve(parentRoot);
 const grantBytes=readFileSync(join(parentRoot,'portfolio.authorization.json'));
 const envelope=JSON.parse(grantBytes.toString('utf8'));
 const grant=verified(envelope,publicKey) as PortfolioGrant;
 const inner=verified(envelope.operatingEnvelope,publicKey) as any;
 requireThat(grant.approved&&grant.root===parentRoot&&grant.continuation?.kind==='portfolio-v4-artifact-continuation-r2'&&grant.operatingGrantHash===hash(inner),'DURABLE_PARENT_AUTHORITY');
 // This validates both public signatures, the authenticated R1 delivery and
 // the exact R1 retirement markers that gave R2 its execution authority.
 validateContinuation(grant,publicKey,true);
 const proposal=JSON.parse(readFileSync(join(parentRoot,'proposal',grant.id,'portfolio.authorization.request.json'),'utf8'));
 requireThat(hash(proposal)===R3_PARENT_PROPOSAL_HASH,'DURABLE_PARENT_PROPOSAL_CHANGED');
 const db=new DatabaseSync(join(parentRoot,'portfolio.sqlite'),{readOnly:true});
 try{
  const grantHash=hash(grant),operatingHash=hash(inner),scope=scopeKey(grant.accountScope);
  const attempts=rows(db,'model-attempt').filter(r=>r.key.startsWith(scope+'/'));
  const bindings=rows(db,'portfolio-work-binding').filter(r=>r.key.startsWith(scope+'/'));
  const account=entity(db,'experiment-account',scope);
  const tasks=(grant.tasks??[]).map(t=>entity(db,'portfolio-task',t.id));
  requireThat(account?.authorizationHash===operatingHash&&hash(account.limits)===hash(inner.limits)&&account.settled===0&&!account.halted,'DURABLE_PARENT_ACCOUNT');
  requireThat(tasks.length===5&&tasks.every((t,i)=>t&&!t.lease&&taskDefinitionHash(t)===grant.tasks![i].definitionHash),'DURABLE_PARENT_TASKS_CHANGED');
  const decision=tasks.find(t=>t.id===R3_PARENT_TASK_ID);
  requireThat(decision?.status==='needs_reconciliation'&&decision.reason==='Model attempt has no accepted output (23). No automatic retry or fixture fallback.'&&decision.attempts===1&&!decision.lease&&decision.dependsOn.length===0&&decision.inputArtifacts.length===1&&decision.inputArtifacts[0].artifactId===R3_SOURCE_ARTIFACT_ID,'DURABLE_PARENT_STOP_CHANGED');
  requireThat(tasks.filter(t=>t.id!==R3_PARENT_TASK_ID).every(t=>t.status==='queued'&&t.attempts===0&&!t.lease&&!t.outputArtifacts.length),'DURABLE_PARENT_DESCENDANT_STARTED');
  requireThat(attempts.length===1&&bindings.length===1,'DURABLE_PARENT_ATTEMPT_COUNT');
  const attempt=attempts[0].body,binding=bindings[0].body;
  requireThat(attempt.id===R3_PARENT_ATTEMPT_ID&&attempt.finishedAt&&attempt.errorCode===23&&attempt.reservation===123&&attempt.inferenceDispatchIntent===true&&attempt.countDispatchIntent===true&&attempt.result===null&&!attempt.invoice&&attempt.cost?.status==='unknown'&&attempt.cost.money===null,'DURABLE_PARENT_ATTEMPT_CHANGED');
  requireThat(attempt.requestHash===binding.bodyHash&&binding.attemptId===attempt.id&&binding.grantHash===grantHash&&binding.taskId===R3_PARENT_TASK_ID&&binding.ventureId==='quote-desk'&&!binding.recoveryOf,'DURABLE_PARENT_BINDING_CHANGED');
  const observation=attempt.observation;
  requireThat(observation&&Object.keys(observation).sort().join(',')==='latencyMs,tokenCount'&&!observation.providerRequestId&&!observation.outputArtifact&&observation.inputTokens===undefined&&observation.outputTokens===undefined,'DURABLE_PARENT_RESPONSE_ID_OR_OUTPUT');
  requireThat(observation.tokenCount?.operation==='token_count'&&observation.tokenCount.phase==='count_received'&&observation.tokenCount.httpStatus===200&&observation.tokenCount.inputTokens===9506&&observation.tokenCount.inferenceRequestHash===attempt.requestHash&&/^[A-Za-z0-9_-]+$/.test(observation.tokenCount.providerRequestId),'DURABLE_PARENT_COUNT_CHANGED');
  const requestRecord=entity(db,'portfolio-model-request',R3_PARENT_TASK_ID+'/model-0');
  const resultRecord=entity(db,'portfolio-model-result',R3_PARENT_TASK_ID+'/model-0');
  const step=entity(db,'portfolio-step',R3_PARENT_TASK_ID+'/model-0');
  requireThat(requestRecord?.call?.attemptId===attempt.id&&requestRecord.call.ventureId==='quote-desk'&&requestRecord.call.recoveryOf==null&&hash(requestRecord.call.request)===hash(binding.request)&&hash(requestRecord.call.schema)===hash(binding.schema)&&hash(requestRecord.call.sourceHosts)===hash(binding.sourceHosts)&&requestRecord.identity&&/^[a-f0-9]{64}$/.test(requestRecord.identity),'DURABLE_PARENT_REQUEST_CHANGED');
  requireThat(!resultRecord&&step?.status==='uncertain'&&step.kind==='model'&&step.taskId===R3_PARENT_TASK_ID&&step.outcome?.uncertain===true&&step.outcome.error===decision.reason,'DURABLE_PARENT_OUTCOME_CHANGED');
  const recoveryIntents=rows(db,'portfolio-recovery-intent').filter(r=>r.body.grantHash===grantHash||r.body.taskId===R3_PARENT_TASK_ID||r.body.parentAttemptId===attempt.id);
  const recoveryLinks=rows(db,'portfolio-recovery-link').filter(r=>r.body.grantHash===grantHash||r.body.taskId===R3_PARENT_TASK_ID||r.body.parentAttemptId===attempt.id);
  const responseJobs=rows(db,'response-job').filter(r=>r.key===scope+'/'+attempt.id||r.body.requestHash===attempt.requestHash);
  const operatingResponses=rows(db,'operating-response').filter(r=>r.key===scope+'/'+attempt.id);
  requireThat(!recoveryIntents.length&&!recoveryLinks.length&&!responseJobs.length&&!operatingResponses.length,'DURABLE_PARENT_ACTIVITY_CHANGED');
  const source=entity(db,'portfolio-artifact',R3_SOURCE_ARTIFACT_ID),upstream=grant.continuation;
  requireThat(source&&source.version===1&&source.sha256===upstream.artifactHash&&source.metadata?.manifestHash===upstream.manifestHash&&source.metadata?.preservedSource?.payloadHash===upstream.payloadHash&&source.content?.brief?.sha256===R3_ACCEPTED_BRIEF_HASH&&source.content.brief.bytes===R3_ACCEPTED_BRIEF_BYTES&&source.metadata?.preservedSource?.briefHash===R3_ACCEPTED_BRIEF_HASH&&source.metadata.preservedSource.briefBytes===R3_ACCEPTED_BRIEF_BYTES&&source.provenance==='actual_model_historical_reuse','DURABLE_PARENT_SOURCE_CHANGED');
  const prior=upstream.historical;
  const historical:HistoricalExposure={admissions:prior.admissions+1,counts:prior.counts+1,reservedMinor:prior.reservedMinor+attempt.reservation,provisionalMinor:prior.provisionalMinor,settledMinor:prior.settledMinor,countBufferMinor:prior.countBufferMinor};
  requireThat(hash(historical)===hash({admissions:9,counts:9,reservedMinor:1107,provisionalMinor:384,settledMinor:0,countBufferMinor:400})&&inner.limits.totalMinor===4582&&inner.limits.astraCountRequests===26&&inner.limits.overheadReserve?.minor===400&&inner.limits.carryIn?.length===1,'DURABLE_PARENT_EXPOSURE_CHANGED');
  return {grant,inner,proposal,grantFileHash:rawHash(grantBytes),attemptsHash:hash(attempts),bindingsHash:hash(bindings),accountHash:hash(account),tasksHash:hash(tasks),attemptHash:hash(attempt),bindingHash:hash(binding),requestRecordHash:hash(requestRecord),taskStateHash:hash(decision),stepHash:hash(step),sourceArtifactHash:hash(source),requestBodyHash:attempt.requestHash,requestHash:hash(binding.request),schemaHash:hash(binding.schema),attempt,binding,requestRecord,step,source,tasks,task:decision,historical,
   retired:entity(db,'portfolio-revocation',grantHash),operatingRetired:entity(db,'operating-revocation',operatingHash)};
 }finally{db.close();}
}

export function durableContinuationCarry(c:DurableContinuationR3){
 return [{id:c.carryId,exposureMinor:c.historical.reservedMinor,evidenceHash:hash({parentGrantHash:c.parentGrantHash,parentHistorical:c.historical,attemptsHash:c.attemptsHash})}];
}

/** Only a complete pair of exact parent retirement markers permits runtime
 * progress. An absent pair is valid solely while preparing/signing a fresh
 * workspace; a partial or competing retirement never relaxes freshness. */
export function durableRetirementAllowsProgress(g:PortfolioGrant,retired:any,operatingRetired:any,requireRetired:boolean){
 const expected={continuationId:g.id,continuationRoot:g.root,continuationGrantHash:hash(g)};
 if(!retired&&!operatingRetired){requireThat(!requireRetired,'DURABLE_PARENT_RETIREMENT_REQUIRED');return false;}
 requireThat(retired&&operatingRetired,'DURABLE_PARENT_RETIREMENT_PARTIAL');
 for(const marker of [retired,operatingRetired])requireThat(Object.entries(expected).every(([k,v])=>marker[k]===v),'DURABLE_PARENT_ALREADY_CLAIMED');
 return true;
}

/** Validate immutable R3 task/source lineage at every lifecycle stage. Before
 * retirement there must be no R3 work. Once exact retirement is authenticated,
 * status, attempts, outputs and durable activity may advance under the signed
 * task definitions and the new grant/account scope. */
export function validateDurableContinuationWorkspace(g:PortfolioGrant,c:DurableContinuationR3,allowProgress:boolean){
 const db=new DatabaseSync(join(g.root,'portfolio.sqlite'),{readOnly:true});
 try{
  const source=entity(db,'portfolio-artifact',c.sourceArtifactId),freshTasks=c.tasks.map(t=>entity(db,'portfolio-task',t.id)),decision=freshTasks.find(t=>t?.id===R3_DECISION_TASK_ID);
  requireThat(source&&hash(source)===c.parentSourceArtifactHash&&source.sha256===c.sourceArtifactHash,'DURABLE_IMPORTED_SOURCE_CHANGED');
  requireThat(freshTasks.length===5&&freshTasks.every(t=>t&&g.tasks?.some(a=>a.id===t.id&&a.definitionHash===taskDefinitionHash(t))),'DURABLE_FRESH_TASKS_CHANGED');
  requireThat(decision?.dependsOn.length===0&&decision.inputArtifacts.length===1&&decision.inputArtifacts[0].artifactId===c.sourceArtifactId&&decision.inputArtifacts[0].version===1&&decision.inputArtifacts[0].sha256===c.sourceArtifactHash&&hash(decision.inputs?.continuationReplacement)===hash(durableReplacementLink(c)),'DURABLE_REPLACEMENT_TASK_CHANGED');
  const freshIds=new Set(c.tasks.map(t=>t.id)),scope=scopeKey(g.accountScope),allBindings=rows(db,'portfolio-work-binding'),freshBindings=allBindings.filter(r=>freshIds.has(r.body.taskId)),scopedBindings=allBindings.filter(r=>r.key.startsWith(scope+'/'));
  requireThat(freshBindings.every(r=>r.key.startsWith(scope+'/')&&r.body.grantHash===hash(g)&&r.body.attemptId&&r.key===scope+'/'+r.body.attemptId&&/^[a-f0-9]{64}$/.test(r.body.bodyHash))&&scopedBindings.every(r=>freshIds.has(r.body.taskId)&&r.body.grantHash===hash(g)),'DURABLE_PROGRESS_LINEAGE_CHANGED');
  const jobs=rows(db,'response-job').filter(r=>r.key.startsWith(scope+'/'));
  requireThat(jobs.every(r=>r.body.grantHash===g.operatingGrantHash&&/^[a-f0-9]{64}$/.test(r.body.requestHash)),'DURABLE_RESPONSE_JOB_LINEAGE_CHANGED');
  if(!allowProgress){
   requireThat(freshTasks.every(t=>t.status==='queued'&&t.attempts===0&&!t.lease&&!t.outputArtifacts.length),'DURABLE_FRESH_TASKS_CHANGED');
   requireThat(!rows(db,'local-workspace').some(r=>freshIds.has(r.body.taskId))&&!rows(db,'portfolio-step').some(r=>freshIds.has(r.body.taskId))&&!rows(db,'portfolio-model-result').some(r=>freshIds.has(r.body.taskId))&&!freshBindings.length&&!jobs.length,'DURABLE_FRESH_ACTIVITY_PRESENT');
  }
 }finally{db.close();}
}

/** Validate an unsigned proposal during preparation or a signed grant before
 * dispatch. requireRetired=true is the dispatch gate. */
export function validateDurableContinuationR3(input:PortfolioGrant,publicKey:string,requireRetired:boolean){
 const c=input.continuation;
 requireThat(c?.kind===DURABLE_CONTINUATION_KIND&&resolve(c.parentRoot)!==input.root&&c.parentProposalHash===R3_PARENT_PROPOSAL_HASH,'DURABLE_CONTINUATION_SCOPE');
 // The discriminant above is the runtime trust boundary. This local view only
 // exposes the narrower R3 recovery and background-route fields to TypeScript.
 const g=input as R3Grant;
 requireThat(c.combinedCeilingMinor===4582&&c.combinedAdmissionLimit===34&&c.originalCeilingMinor===5182&&c.originalAdmissionLimit===36&&hash(c.historical)===hash({admissions:9,counts:9,reservedMinor:1107,provisionalMinor:384,settledMinor:0,countBufferMinor:400}),'DURABLE_CONTINUATION_EXPOSURE');
 const p=inspectDurableContinuationParent(c.parentRoot,publicKey);
 const restore=JSON.parse(readFileSync(join(g.root,'restore.json'),'utf8'));
 requireThat(hash(restore)===c.restoreHash&&restore.kind==='explicit-durable-continuation-copy-r3'&&restore.backupManifestHash===c.backupManifestHash&&restore.originalDatabaseHash===c.backupDatabaseHash&&resolve(restore.sourceRoot)===resolve(c.parentRoot)&&resolve(restore.root)===resolve(g.root)&&restore.credentialsCopied===false&&restore.privateKeysCopied===false&&restore.activeAuthorizationInstalled===false,'DURABLE_RESTORE_CHANGED');
 requireThat(p.grantFileHash===c.parentGrantFileHash&&hash(p.grant)===c.parentGrantHash&&hash(p.inner)===c.parentOperatingHash&&p.attemptsHash===c.attemptsHash&&p.bindingsHash===c.bindingsHash&&p.accountHash===c.accountHash&&p.tasksHash===c.parentTasksHash,'DURABLE_PARENT_CHANGED');
 requireThat(p.attemptHash===c.parentAttemptHash&&p.bindingHash===c.parentBindingHash&&p.requestRecordHash===c.parentRequestRecordHash&&p.taskStateHash===c.parentTaskStateHash&&p.stepHash===c.parentStepHash&&p.sourceArtifactHash===c.parentSourceArtifactHash,'DURABLE_PARENT_RECORD_CHANGED');
 requireThat(p.attempt.id===c.parentAttemptId&&p.task.id===c.parentTaskId&&p.requestBodyHash===c.parentRequestBodyHash&&p.requestHash===c.parentRequestHash&&p.schemaHash===c.parentSchemaHash&&hash(p.historical)===hash(c.historical),'DURABLE_PARENT_REQUEST_IDENTITY_CHANGED');
 requireThat(c.parentTaskId===R3_PARENT_TASK_ID&&c.parentAttemptId===R3_PARENT_ATTEMPT_ID&&c.sourceArtifactId===R3_SOURCE_ARTIFACT_ID&&c.sourceArtifactHash===p.source.sha256&&c.sourceManifestHash===p.source.metadata.manifestHash&&c.sourcePayloadHash===p.source.metadata.preservedSource.payloadHash&&c.sourceBriefHash===R3_ACCEPTED_BRIEF_HASH&&c.sourceBriefBytes===R3_ACCEPTED_BRIEF_BYTES,'DURABLE_SOURCE_IDENTITY_CHANGED');
 const expectedRoute={...p.grant.route,authorizationId:g.id,deadlineMs:60000,background:BACKGROUND_POLICY};
 requireThat(p.grant.projectId===g.projectId&&p.grant.credentialFile===g.credentialFile&&p.grant.mode===g.mode&&p.grant.expiresAt===g.expiresAt&&hash(p.grant.procedureHashes)===hash(g.procedureHashes)&&hash(expectedRoute)===hash(g.route),'DURABLE_AUTHORITY_CHANGED');
 requireThat(g.countUncertaintyMinor===400&&g.recovery?.maxAdmissions===1&&g.route.background?.store===true&&hash(g.route.background)===hash(BACKGROUND_POLICY),'DURABLE_ROUTE_POLICY_CHANGED');
 const expectedCalls=25,ordinary=24,spend=3075,total=spend+c.historical.reservedMinor+c.historical.countBufferMinor;
 requireThat(total===c.combinedCeilingMinor&&expectedCalls+c.historical.admissions===c.combinedAdmissionLimit&&total<=c.originalCeilingMinor&&c.combinedAdmissionLimit<=c.originalAdmissionLimit,'DURABLE_COMBINED_CAP');
 requireThat(hash(c.durability)===hash({policyHash:hash(BACKGROUND_POLICY),requestBody:{background:true,store:true},applicationStateRetention:'store-true-provider-retention-at-least-30-days',zeroDataRetentionCompatibility:'not-guaranteed',createAcknowledgementGap:'unknown-no-resubmit',retrieval:{method:'GET',admittedResponseIdsOnly:true,inferenceAdmissions:false,countAdmissions:false,maxPerResponse:240,maxAcrossGrantedResponses:6000},remoteMutation:{cancel:false,delete:false,retryPost:false}}),'DURABLE_DISCLOSURE_CHANGED');
 requireThat(g.ventures.length===1&&g.ventures[0].id==='quote-desk'&&g.ventures[0].goalHash===p.grant.ventures[0].goalHash&&g.ventures[0].workCalls===expectedCalls&&g.ventures[0].searchCalls===0&&g.tasks?.length===5&&g.tasks.reduce((n,t)=>n+t.workCalls,0)===ordinary,'DURABLE_ALLOCATION_CHANGED');
 const expected=new Map([['quote-desk/decide-v4-r2',1],['quote-desk/build-v4-r2',10],['quote-desk/review-product-v4-r2',6],['quote-desk/operate-v4-r2',6],['quote-desk/adapt-v4-r2',1]]);
 requireThat(c.tasks.length===5&&new Set(c.tasks.map(t=>t.parentId)).size===5&&new Set(c.tasks.map(t=>t.id)).size===5,'DURABLE_TASK_MAPPING');
 for(const t of c.tasks){const old=p.grant.tasks?.find(a=>a.id===t.parentId),next=g.tasks!.find(a=>a.id===t.id);requireThat(old&&next&&expected.get(t.parentId)===t.workCalls&&old.workCalls===t.workCalls&&t.id===t.parentId.replace(/-r2$/,'-r3')&&next.workCalls===t.workCalls,'DURABLE_TASK_CAP');}
 requireThat(hash(c.replacement)===hash({kind:R3_REPLACEMENT_KIND,uncertainTaskId:R3_PARENT_TASK_ID,uncertainAttemptId:R3_PARENT_ATTEMPT_ID,uncertainRequestBodyHash:c.parentRequestBodyHash,replacementTaskId:R3_DECISION_TASK_ID,preservesUncertainOutcome:true,preservesReservation:true}),'DURABLE_REPLACEMENT_LINK_CHANGED');
 requireThat(g.initialRequests?.length===1&&g.initialRequests[0].taskId===R3_DECISION_TASK_ID&&c.tasks.find(t=>t.parentId===R3_PARENT_TASK_ID)?.id===R3_DECISION_TASK_ID,'DURABLE_INITIAL_REQUIRED');
 const allowProgress=durableRetirementAllowsProgress(g,p.retired,p.operatingRetired,requireRetired);
 validateDurableContinuationWorkspace(g,c,allowProgress);
 return p;
}
