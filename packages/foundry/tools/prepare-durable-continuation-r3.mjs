/** Offline-only Mission 031 R3 preparation.
 *
 * Copies the authenticated R2 stop backup, preserves the accepted R1 research
 * artifact exactly, adds fresh -r3 tasks without application seed data, and
 * emits an unsigned exact amendment plus its initial durable request bytes.
 * No credential, private key, token-count endpoint or inference endpoint is
 * accessed here.
 */
import {copyFileSync,constants,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BACKGROUND_POLICY} from '../src/durable-responses.ts';
import {StateStore} from '../src/state.ts';
import {canonical,hash,rawHash,requireThat} from '../src/contracts.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {createPortfolioProposal,portfolioImplementationHash,portfolioRoute,taskDefinitionHash} from '../src/portfolio/live.ts';
import {
 DURABLE_CONTINUATION_KIND,R3_ACCEPTED_BRIEF_BYTES,R3_ACCEPTED_BRIEF_HASH,R3_DECISION_TASK_ID,R3_PARENT_ATTEMPT_ID,R3_PARENT_TASK_ID,R3_REPLACEMENT_KIND,R3_SOURCE_ARTIFACT_ID,
 durableReplacementLink,inspectDurableContinuationParent,validateDurableContinuationR3
} from '../src/portfolio/continuation-r3.ts';
import {verifyPortfolioBackup} from '../src/portfolio/continuity.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {assertCountableRequest,countPayload} from '../src/experiment/token-count.ts';

const allowances=new Map([
 ['quote-desk/decide-v4-r2',1],
 ['quote-desk/build-v4-r2',10],
 ['quote-desk/review-product-v4-r2',6],
 ['quote-desk/operate-v4-r2',6],
 ['quote-desk/adapt-v4-r2',1]
]);
const nextId=id=>id.replace(/-r2$/,'-r3');

export function addDurableContinuationTasks(portfolio,parent,source){
 const mapping=[...allowances].map(([parentId,workCalls])=>({parentId,id:nextId(parentId),workCalls}));
 const planId='value-release-v4-durable-continuation-r3';
 if(!portfolio.store.get('portfolio-plan','quote-desk/'+planId)){
  const specs=mapping.map(m=>{
   const task=parent.tasks.find(t=>t.id===m.parentId);
   requireThat(task&&(m.parentId===R3_PARENT_TASK_ID?task.status==='needs_reconciliation'&&task.attempts===1:task.status==='queued'&&task.attempts===0),'DURABLE_PARENT_TASK_UNAVAILABLE');
   const inputs=structuredClone(task.inputs??{});
   inputs.continuationVersion=planId;
   inputs.budgetGuidance='The frozen ordinary allowance belongs to substantive work. For bounded-finalize-v1, a worker complete submission triggers controller-run current checks, local publication, authenticated readback and closure without extra model decisions. Repair only from actual feedback. One held recovery admission is usable solely after a signed known-incomplete durable response and never increases ordinary task allowances. The uncertain R2 timeout remains historical and is not eligible for resubmission.';
   if(inputs.prototypeGate)inputs.prototypeGate.cancelUnlessPrototype=inputs.prototypeGate.cancelUnlessPrototype.map(nextId);
   const dependencies=task.dependsOn.filter(id=>allowances.has(id)).map(nextId);
   if(m.parentId===R3_PARENT_TASK_ID)inputs.continuationReplacement={kind:R3_REPLACEMENT_KIND,uncertainTaskId:R3_PARENT_TASK_ID,uncertainAttemptId:R3_PARENT_ATTEMPT_ID,uncertainRequestBodyHash:parent.requestBodyHash,replacementTaskId:R3_DECISION_TASK_ID,preservesUncertainOutcome:true,preservesReservation:true};
   return {id:nextId(task.id).split('/')[1],title:task.title,objective:task.objective.replaceAll('-v4-r2','-v4-r3'),lane:task.lane,capability:task.capability,dependsOn:dependencies,
    acceptance:task.acceptance,requiredCompetencies:task.requiredCompetencies,allowedTools:task.allowedTools,requiredChecks:task.requiredChecks,
    resource:task.resource,priority:task.priority,maxAttempts:1,inputs,
    ...(m.parentId===R3_PARENT_TASK_ID?{inputArtifacts:[{artifactId:source.id,version:source.version,sha256:source.sha256}]}:{} )};
  });
  const sourceBindings=parent.task.inputs?.sourceBindings??[];
  portfolio.addPlan('quote-desk',{id:planId,rationale:'After exact R3 approval, replace only the uncertain R2 decision with a fresh durable-background decision. Preserve the R2 timeout outcome, request, reservation and stopped task unchanged. Reuse the authenticated accepted R1 investigation exactly and continue the same four unstarted downstream tasks under their unchanged ordinary allowances.',evidenceIds:sourceBindings.map(s=>s.id),tasks:specs});
 }
 return mapping;
}

export async function prepareDurableContinuationR3({parentRoot,backupRoot,manifestHash,root,id='portfolio-031-value-build-v4-r3',output}){
 root=resolve(root);parentRoot=resolve(parentRoot);backupRoot=resolve(backupRoot);output=resolve(output??join(root,'proposal',id));
 requireThat(!existsSync(join(root,'portfolio.authorization.json'))&&!existsSync(join(output,'portfolio.authorization.request.json')),'DURABLE_CONTINUATION_ALREADY_FROZEN');
 const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8');
 const parent=inspectDurableContinuationParent(parentRoot,publicKey);
 requireThat(!parent.retired&&!parent.operatingRetired,'DURABLE_PARENT_ALREADY_RETIRED');
 const backup=verifyPortfolioBackup({backupRoot,expectedManifestHash:manifestHash});
 requireThat(backup.manifest.credentialsCopied===false&&resolve(backup.manifest.sourceRoot)===parentRoot&&backup.manifest.implementationHash===parent.grant.implementationHash&&backup.manifest.database.sha256===rawHash(readFileSync(join(backupRoot,'portfolio.sqlite'))),'DURABLE_BACKUP_IDENTITY');
 const restoreFile=join(root,'restore.json');
 if(!existsSync(root)){
  mkdirSync(root,{recursive:true});
  copyFileSync(join(backupRoot,'portfolio.sqlite'),join(root,'portfolio.sqlite'),constants.COPYFILE_EXCL);
  requireThat(rawHash(readFileSync(join(root,'portfolio.sqlite')))===backup.manifest.database.sha256,'DURABLE_COPY_MISMATCH');
  mkdirSync(join(root,'historical-authority','auth'),{recursive:true});
  copyFileSync(join(backupRoot,'portfolio.authorization.json'),join(root,'historical-authority','portfolio.authorization.json'),constants.COPYFILE_EXCL);
  copyFileSync(join(backupRoot,'auth','portfolio-owner.pub'),join(root,'historical-authority','auth','portfolio-owner.pub'),constants.COPYFILE_EXCL);
  writeFileSync(restoreFile,JSON.stringify({kind:'explicit-durable-continuation-copy-r3',backupManifestHash:manifestHash,sourceImplementationHash:backup.manifest.implementationHash,targetImplementationHash:portfolioImplementationHash(),sourceRoot:parentRoot,root,credentialsCopied:false,privateKeysCopied:false,activeAuthorizationInstalled:false,originalDatabaseHash:backup.manifest.database.sha256},null,2)+'\n',{flag:'wx'});
 }
 const restore=JSON.parse(readFileSync(restoreFile,'utf8'));
 requireThat(restore.kind==='explicit-durable-continuation-copy-r3'&&restore.backupManifestHash===manifestHash&&restore.originalDatabaseHash===backup.manifest.database.sha256&&resolve(restore.sourceRoot)===parentRoot&&resolve(restore.root)===root&&restore.credentialsCopied===false&&restore.privateKeysCopied===false&&restore.activeAuthorizationInstalled===false,'DURABLE_RESTORE_CHANGED');
 const store=new StateStore(join(root,'portfolio.sqlite'));
 try{
  const copiedKey=Object.values(parent.grant.accountScope).join('/')+'/'+R3_PARENT_ATTEMPT_ID;
  const copiedAttempt=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key=?").get(copiedKey);
  const copiedBinding=store.db.prepare("SELECT body FROM entities WHERE kind='portfolio-work-binding' AND key=?").get(copiedKey);
  requireThat(copiedAttempt&&copiedBinding&&hash(JSON.parse(String(copiedAttempt.body)))===parent.attemptHash&&hash(JSON.parse(String(copiedBinding.body)))===parent.bindingHash,'DURABLE_BACKUP_STOP_CHANGED');
  const portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
  const source=store.get('portfolio-artifact',R3_SOURCE_ARTIFACT_ID);
  const {_version:sourceVersion,...sourceBody}=source??{};
  requireThat(sourceVersion===1&&hash(sourceBody)===parent.sourceArtifactHash&&source.sha256===parent.source.sha256&&source.content?.brief?.sha256===R3_ACCEPTED_BRIEF_HASH&&source.content.brief.bytes===R3_ACCEPTED_BRIEF_BYTES,'DURABLE_SOURCE_COPY_CHANGED');
  const mapping=addDurableContinuationTasks(portfolio,parent,source);
  const tasks=mapping.map(m=>({id:m.id,definitionHash:taskDefinitionHash(portfolio.getTask(m.id)),workCalls:m.workCalls}));
  requireThat(tasks.reduce((n,t)=>n+t.workCalls,0)===24&&portfolio.getTask(R3_DECISION_TASK_ID).inputArtifacts[0].sha256===source.sha256,'DURABLE_TASK_ALLOCATION');
  const engine=new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:tasks})});
  const preview=await engine.previewRequest(R3_DECISION_TASK_ID);
  const route=portfolioRoute(id,parent.grant.projectId,true);
  requireThat(route.deadlineMs===60000&&hash(route.background)===hash(BACKGROUND_POLICY),'DURABLE_ROUTE_NOT_ENABLED');
  const body=buildResponsesBody(route,preview.request,preview.schema),bytes=canonical(body);
  requireThat(body.background===true&&body.store===true,'DURABLE_INITIAL_BODY_NOT_BACKGROUND');
  const preserved=preview.request.context.dependencies?.find(d=>d.id==='explicit-preserved-input')?.artifacts?.find(a=>a.artifactId===source.id);
  const acceptedBriefFile=join(parentRoot,'proposal',parent.grant.id,'accepted-r1-brief.json');
  requireThat(preserved?.historicalProvenance?.payloadHash===parent.source.metadata.preservedSource.payloadHash&&preserved.historicalProvenance.briefHash===R3_ACCEPTED_BRIEF_HASH&&hash(preserved.report)===hash(JSON.parse(readFileSync(acceptedBriefFile,'utf8')))&&preserved.reportCompleteness==='full authoritative checked report','DURABLE_INITIAL_CONTEXT');
  const continuation={kind:DURABLE_CONTINUATION_KIND,parentRoot,parentGrantFileHash:parent.grantFileHash,parentGrantHash:hash(parent.grant),parentOperatingHash:hash(parent.inner),parentProposalHash:hash(parent.proposal),backupManifestHash:manifestHash,backupDatabaseHash:backup.manifest.database.sha256,restoreHash:hash(restore),
   attemptsHash:parent.attemptsHash,bindingsHash:parent.bindingsHash,accountHash:parent.accountHash,parentTasksHash:parent.tasksHash,parentAttemptHash:parent.attemptHash,parentBindingHash:parent.bindingHash,parentRequestRecordHash:parent.requestRecordHash,parentTaskStateHash:parent.taskStateHash,parentStepHash:parent.stepHash,parentSourceArtifactHash:parent.sourceArtifactHash,
   parentRequestBodyHash:parent.requestBodyHash,parentRequestHash:parent.requestHash,parentSchemaHash:parent.schemaHash,parentTaskId:R3_PARENT_TASK_ID,parentAttemptId:R3_PARENT_ATTEMPT_ID,
   sourceArtifactId:source.id,sourceArtifactHash:source.sha256,sourceManifestHash:source.metadata.manifestHash,sourcePayloadHash:source.metadata.preservedSource.payloadHash,sourceBriefHash:R3_ACCEPTED_BRIEF_HASH,sourceBriefBytes:R3_ACCEPTED_BRIEF_BYTES,
   carryId:'portfolio-031-history-through-r2-uncertain',historical:parent.historical,durability:{policyHash:hash(BACKGROUND_POLICY),requestBody:{background:true,store:true},applicationStateRetention:'store-true-provider-retention-at-least-30-days',zeroDataRetentionCompatibility:'not-guaranteed',createAcknowledgementGap:'unknown-no-resubmit',retrieval:{method:'GET',admittedResponseIdsOnly:true,inferenceAdmissions:false,countAdmissions:false,maxPerResponse:240,maxAcrossGrantedResponses:6000},remoteMutation:{cancel:false,delete:false,retryPost:false}},combinedCeilingMinor:4582,combinedAdmissionLimit:34,originalCeilingMinor:5182,originalAdmissionLimit:36,
   replacement:{kind:R3_REPLACEMENT_KIND,uncertainTaskId:R3_PARENT_TASK_ID,uncertainAttemptId:R3_PARENT_ATTEMPT_ID,uncertainRequestBodyHash:parent.requestBodyHash,replacementTaskId:R3_DECISION_TASK_ID,preservesUncertainOutcome:true,preservesReservation:true},tasks:mapping};
  requireThat(hash(portfolio.getTask(R3_DECISION_TASK_ID).inputs.continuationReplacement)===hash(durableReplacementLink(continuation)),'DURABLE_REPLACEMENT_CONTEXT_CHANGED');
  const proposal=createPortfolioProposal({root,id,mode:parent.grant.mode,projectId:parent.grant.projectId,credentialFile:parent.grant.credentialFile,billingPublicKey:parent.inner.billingPublicKey,expiresAt:parent.grant.expiresAt,background:true,
   countUncertaintyMinor:400,recoveryAdmissions:1,tasks,initialRequests:[{taskId:R3_DECISION_TASK_ID,bodyHash:rawHash(bytes),schemaHash:hash(preview.schema)}],continuation,
   ventures:[{id:'quote-desk',goal:portfolio.getVenture('quote-desk').goal,capabilities:parent.grant.ventures[0].capabilities,tools:parent.grant.ventures[0].tools,sourceHosts:[],workCalls:25,searchCalls:0}]});
  validateDurableContinuationR3(proposal.portfolio,publicKey,false);
  assertCountableRequest(body,proposal.operating.countRequestByteCeiling);
  requireThat(proposal.incrementalExposureMinor===3075&&proposal.historicalRetainedMinor===1507&&proposal.maximumExposureMinor===4582&&proposal.inferenceAdmissions===25&&proposal.countAdmissions===25,'DURABLE_PROPOSAL_TOTALS');
  mkdirSync(output,{recursive:true});
  const write=(name,value)=>writeFileSync(join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  write('portfolio.authorization.request.json',proposal);
  write('initial-responses-bytes.json',bytes);
  write('initial-count-bytes.json',canonical(countPayload(body)));
  write('task-manifest.json',{tasks:tasks.map(a=>({allowance:a,task:portfolio.getTask(a.id)})),lineage:continuation,preservedArtifact:{id:source.id,version:source.version,sha256:source.sha256,manifestHash:continuation.sourceManifestHash,payloadHash:continuation.sourcePayloadHash,briefHash:continuation.sourceBriefHash,briefBytes:continuation.sourceBriefBytes},uncertainR2:{attemptId:R3_PARENT_ATTEMPT_ID,taskId:R3_PARENT_TASK_ID,attemptHash:continuation.parentAttemptHash,requestRecordHash:continuation.parentRequestRecordHash,requestBodyHash:continuation.parentRequestBodyHash,taskStateHash:continuation.parentTaskStateHash,outcome:'unknown; no response identity or output was persisted',reservationMinor:123,preserved:true},laterRequests:'Depend on actual durable decisions, controller checks and authoritative artifact identities. Each inference request is persisted and counted before one POST. Only known admitted response IDs may be retrieved with GET.'});
  write('accepted-r1-brief.json',readFileSync(acceptedBriefFile,'utf8'));
  write('payload-audit.json',{proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),bodyHash:rawHash(bytes),schemaHash:hash(preview.schema),contextBytes:Buffer.byteLength(JSON.stringify(preview.request.context)),payloadBytes:Buffer.byteLength(bytes),acceptedBriefHash:R3_ACCEPTED_BRIEF_HASH,acceptedBriefBytes:R3_ACCEPTED_BRIEF_BYTES,historical:parent.historical,incrementalExposureMinor:3075,combinedExposureMinor:4582,originalCeilingMinor:5182,combinedAdmissions:34,originalAdmissionLimit:36,inputTokens:'Unknown until authorized full-payload count',model:body.model,reasoning:body.reasoning,serviceTier:body.service_tier,background:body.background,store:body.store,applicationStateRetention:'store:true uses provider application-state retention of at least 30 days per current documentation; the exact deletion time is not guaranteed, and this packet makes no zero-data-retention compatibility claim',retrievalPolicy:{onlyAlreadyAdmittedResponseIds:true,maxPerResponse:240,maxAcross25Responses:6000,retrievalDeadlineMs:15000,completionDeadlineMs:900000,resumeWindowMs:86400000,maxConsecutiveReadErrors:3,pricing:'GET retrieval and count endpoint pricing are unestablished; the same USD 4.00 uncertainty buffer covers both without treating either as free'},earlyCreateGap:'A POST whose acknowledgement is lost before a response ID is persisted remains unknown. It is never resubmitted, cancelled or deleted by this amendment.',providerRequests:0,credentialRead:false,privateKeyRead:false,signed:false,parentRetired:false});
  return {root,output,proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),incrementalExposureMinor:proposal.incrementalExposureMinor,historicalRetainedMinor:proposal.historicalRetainedMinor,combinedExposureMinor:proposal.maximumExposureMinor,originalCeilingMinor:continuation.originalCeilingMinor,inferenceAdmissions:proposal.inferenceAdmissions,countAdmissions:proposal.countAdmissions,combinedAdmissions:parent.historical.admissions+proposal.inferenceAdmissions,originalAdmissionLimit:continuation.originalAdmissionLimit,maxRetrievalsPerResponse:240,maxRetrievalsAcrossAuthorizedResponses:6000,providerRequests:0,credentialRead:false,privateKeyRead:false,signed:false,parentRetired:false};
 }finally{store.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=name=>{const i=process.argv.indexOf(name);requireThat(i>=0&&process.argv[i+1],'DURABLE_ARGUMENT_'+name);return process.argv[i+1];};
 console.log(JSON.stringify(await prepareDurableContinuationR3({parentRoot:arg('--parent-root'),backupRoot:arg('--backup'),manifestHash:arg('--manifest-hash'),root:arg('--root')}),null,2));
}
