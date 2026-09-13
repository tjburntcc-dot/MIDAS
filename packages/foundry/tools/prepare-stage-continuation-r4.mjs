/** Offline-only Mission 031 R4 stage-contract preparation.
 *
 * Copies the authenticated R3 stop backup, preserves its three historical
 * unresolved/failed outcomes and accepted research, creates five fresh -r4
 * tasks, and writes an exact unsigned amendment. No credential, private key,
 * token-count endpoint or inference endpoint is accessed.
 */
import {copyFileSync,constants,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {StateStore} from '../src/state.ts';
import {canonical,hash,rawHash,requireThat,scopeKey} from '../src/contracts.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {createPortfolioProposal,portfolioImplementationHash,portfolioRoute,portfolioTaskRoute,taskDefinitionHash} from '../src/portfolio/live.ts';
import {STAGE_CONTRACTS} from '../src/portfolio/stage-contracts.ts';
import {
 R4_ACCEPTED_BRIEF_BYTES,R4_ACCEPTED_BRIEF_HASH,R4_DECISION_TASK_ID,R4_PARENT_ATTEMPT_IDS,R4_PARENT_TASK_ID,R4_REPLACEMENT_KIND,R4_SOURCE_ARTIFACT_ID,R4_TASK_CONTRACTS,STAGE_CONTINUATION_KIND,
 inspectStageContinuationParent,stageReplacementLink,validateStageContinuationR4
} from '../src/portfolio/continuation-r4.ts';
import {verifyPortfolioBackup} from '../src/portfolio/continuity.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {assertCountableRequest,countPayload} from '../src/experiment/token-count.ts';

const stageIds=Object.keys(STAGE_CONTRACTS);
const nextId=id=>id.replace(/-r3$/,'-r4');
const objectiveFor=(_task,contract)=>{
 if(contract==='build-gate-v1')return 'Use the authenticated accepted investigation and supplied current evidence to make one compact build-or-stop decision for the declared quote-to-job-v2 local engineering prototype. Give the bounded engineering or commercial rationale, strongest alternative, exact supporting reference IDs, and any blocking conditions. Do not repeat the investigation, create tasks, treat either partial R3 response as a decision, or infer demand. A stop decision cancels only the four fresh R4 descendants without admitting them.';
 if(contract==='product-build-v1')return 'Starting from the unseeded authoritative workspace, build the declared quote-to-job-v2 local browser product. It must create itemized USD quotes, preserve stable IDs and all records through save/reload/edit, update the same record through job statuses, report invalid inputs and failed persistence honestly, recover in the supported fresh-session and same-directory-restart cases, remain usable at narrow width, and export guarded all-record CSV. Use actual source and current browser/DOM checks. Keep adequate source, repair consequential defects from observed feedback, and submit complete only after a current passing check. Completion triggers controller-owned checks, publication, authenticated readback and closure; do not repeat research, expand the profile or claim commercial validation. Five ordinary admissions bound the write, check, one repair/check path and completion.';
 if(contract==='product-review-v1')return 'Review the exact authoritative quote-to-job-v2 product, upstream artifact/manifest binding, source revision history and current browser/DOM observations. Check itemized arithmetic and USD parsing, stable identity, preservation of every quote, reopen/edit, same-record status transitions, invalid/error feedback, supported persistence recovery, first-use clarity, narrow layout and guarded CSV. Retain adequate source unchanged; correct only consequential evidenced defects and run a new current check after any correction. Submit complete with the substantive changes or reason the source remained adequate and its unresolved limits. Completion triggers controller-owned publication/readback. Four ordinary admissions bound check, one repair/check path and completion.';
 if(contract==='operating-delivery-v1')return 'Create the operating-packet-v1 brief.json from the exact reviewed product, accepted research, gate/review decisions, artifact identities and actual checks. Include practical try/demo steps, the narrow switching hypothesis and strongest contrary evidence, one explicitly unsent customer test, unknown cost/labor/access, acceptance and stop criteria, and one concrete next owner action. Preserve exact source and artifact references; separate observed behavior from vendor assertions and hypotheses. Write or repair only from actual feedback, then submit complete for controller-owned checks, local publication, authenticated readback and closure. Do not send, transact, infer demand or claim unobserved savings. Four ordinary admissions bound write, one repair path and completion.';
 return 'Assess the completed R4 build, review and operating delivery from their authenticated artifacts, checks, accepted research and preserved obligations. Return one continue, revise or stop recommendation with bounded rationale, observed results, exact reference IDs, limitations, and one next action with a concrete dependency and acceptance condition. Separate runtime authorship, deterministic checks, development-assistant intervention and untested commercial claims. Do not create tasks, rank a portfolio, reopen research, certify competence, or infer demand, revenue, labor savings or independent validation.';
};
const acceptanceFor=(task,contract)=>{
 if(contract==='build-gate-v1')return ['The strict result records exactly one build or stop decision, bounded rationale, strongest alternative, at least one allowed source reference and every unresolved blocking condition.','A build decision has no unresolved blocking condition; a stop decision gates only the four fresh R4 descendants without rewriting historical tasks or outcomes.','The decision distinguishes bounded engineering value from commercial validation and makes no unsupported demand, revenue, labor-saving, specialist or customer claim.'];
 if(contract==='outcome-review-v1')return ['The strict result records exactly one continue, revise or stop recommendation, actual observed results, allowed reference IDs, limitations, and one bounded next action with dependency and acceptance.','The recommendation binds the actual R4 artifacts/checks and accepted research, and distinguishes runtime authorship, deterministic evidence, outside intervention and untested commercial claims.','The result creates no task or authority, reopens no research, certifies no competence and preserves every historical outcome and obligation.'];
 return task.acceptance;
};

export function addStageContinuationTasks(portfolio,parent,source){
 const mapping=R4_TASK_CONTRACTS.map(x=>({...x}));
 const planId='value-release-v4-stage-continuation-r4';
 if(!portfolio.store.get('portfolio-plan','quote-desk/'+planId)){
  const specs=mapping.map(m=>{
   const task=parent.tasks.find(t=>t.id===m.parentId);
   requireThat(task&&(m.parentId===R4_PARENT_TASK_ID?task.status==='needs_reconciliation'&&task.attempts===2:task.status==='queued'&&task.attempts===0),'STAGE_PARENT_TASK_UNAVAILABLE');
   const inputs=structuredClone(task.inputs??{});
   delete inputs.budgetGuidance;delete inputs.prototypeGate;delete inputs.continuationReplacement;delete inputs.continuationVersion;
   inputs.continuationVersion=planId;inputs.stageContract=m.stageContract;
   if(m.stageContract!=='build-gate-v1'&&m.stageContract!=='outcome-review-v1')inputs.executionProtocol='bounded-finalize-v1';
   if(m.stageContract==='build-gate-v1')inputs.continuationReplacement={kind:R4_REPLACEMENT_KIND,failedTaskId:R4_PARENT_TASK_ID,failedAttemptIds:[...R4_PARENT_ATTEMPT_IDS],failedRequestBodyHashes:[...parent.requestBodyHashes],replacementTaskId:R4_DECISION_TASK_ID,preservesFailedOutcomes:true,preservesReservations:true,olderUnknownAttemptId:'p031-e2fd5c331b2304ca-0',preservesOlderUnknownOutcome:true};
   const dependencies=task.dependsOn.filter(id=>mapping.some(x=>x.parentId===id)).map(nextId);
   return {id:nextId(task.id).split('/')[1],title:task.title,objective:objectiveFor(task,m.stageContract),lane:task.lane,capability:m.stageContract==='outcome-review-v1'?'portfolio.plan':task.capability,dependsOn:dependencies,
    acceptance:acceptanceFor(task,m.stageContract),requiredCompetencies:task.requiredCompetencies,allowedTools:task.allowedTools,requiredChecks:task.requiredChecks,
    resource:{...task.resource,modelCalls:m.workCalls},priority:task.priority,maxAttempts:1,inputs,
    inputArtifacts:[{artifactId:source.id,version:source.version,sha256:source.sha256}]};
  });
  const sourceBindings=parent.task.inputs?.sourceBindings??[];
  portfolio.addPlan('quote-desk',{id:planId,rationale:'After exact R4 approval, use a compact stage-specific gate to replace the two terminal incomplete R3 planning outcomes, then permit only the four declared dependent stages. Preserve both R3 outcomes, the older unknown R2 attempt, all reservations, the accepted R1 research and public evidence. Each stage has its own non-borrowable admission and cost limit.',evidenceIds:sourceBindings.map(s=>s.id),tasks:specs});
 }
 return mapping;
}

export async function prepareStageContinuationR4({parentRoot,backupRoot,manifestHash,root,id='portfolio-031-value-build-v4-r4',output}){
 root=resolve(root);parentRoot=resolve(parentRoot);backupRoot=resolve(backupRoot);output=resolve(output??join(root,'proposal',id));
 requireThat(!existsSync(join(root,'portfolio.authorization.json'))&&!existsSync(join(output,'portfolio.authorization.request.json')),'STAGE_CONTINUATION_ALREADY_FROZEN');
 const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8');
 const parent=inspectStageContinuationParent(parentRoot,publicKey);
 requireThat(!parent.retired&&!parent.operatingRetired,'STAGE_PARENT_ALREADY_RETIRED');
 const backup=verifyPortfolioBackup({backupRoot,expectedManifestHash:manifestHash});
 requireThat(backup.manifest.credentialsCopied===false&&resolve(backup.manifest.sourceRoot)===parentRoot&&backup.manifest.implementationHash===parent.grant.implementationHash&&backup.manifest.database.sha256===rawHash(readFileSync(join(backupRoot,'portfolio.sqlite'))),'STAGE_BACKUP_IDENTITY');
 const backupDb=new DatabaseSync(join(backupRoot,'portfolio.sqlite'),{readOnly:true});
 let historicalLedgerHash;
 try{
  const scope=scopeKey(parent.inner.accountScope),prefix=scope+'/',account=backupDb.prepare("SELECT body FROM entities WHERE kind='experiment-account' AND key=?").get(scope);
  requireThat(account,'STAGE_HISTORICAL_ACCOUNT_MISSING');
  const attempts=backupDb.prepare("SELECT key,body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=? ORDER BY key").all(prefix.length,prefix).map(row=>({key:String(row.key),value:JSON.parse(String(row.body))}));
  historicalLedgerHash=hash({account:JSON.parse(String(account.body)),attempts});
 }finally{backupDb.close();}
 requireThat(historicalLedgerHash===parent.historicalLedgerHash,'STAGE_HISTORICAL_LEDGER_CHANGED');
 const restoreFile=join(root,'restore.json');
 if(!existsSync(root)){
  mkdirSync(root,{recursive:true});
  copyFileSync(join(backupRoot,'portfolio.sqlite'),join(root,'portfolio.sqlite'),constants.COPYFILE_EXCL);
  requireThat(rawHash(readFileSync(join(root,'portfolio.sqlite')))===backup.manifest.database.sha256,'STAGE_COPY_MISMATCH');
  mkdirSync(join(root,'historical-authority','auth'),{recursive:true});
  copyFileSync(join(backupRoot,'portfolio.authorization.json'),join(root,'historical-authority','portfolio.authorization.json'),constants.COPYFILE_EXCL);
  copyFileSync(join(backupRoot,'auth','portfolio-owner.pub'),join(root,'historical-authority','auth','portfolio-owner.pub'),constants.COPYFILE_EXCL);
  writeFileSync(restoreFile,JSON.stringify({kind:'explicit-stage-continuation-copy-r4',backupManifestHash:manifestHash,sourceImplementationHash:backup.manifest.implementationHash,targetImplementationHash:portfolioImplementationHash(),sourceRoot:parentRoot,root,credentialsCopied:false,privateKeysCopied:false,activeAuthorizationInstalled:false,originalDatabaseHash:backup.manifest.database.sha256,historicalLedgerHash},null,2)+'\n',{flag:'wx'});
 }
 const restore=JSON.parse(readFileSync(restoreFile,'utf8'));
 requireThat(restore.kind==='explicit-stage-continuation-copy-r4'&&restore.backupManifestHash===manifestHash&&restore.originalDatabaseHash===backup.manifest.database.sha256&&restore.historicalLedgerHash===historicalLedgerHash&&resolve(restore.sourceRoot)===parentRoot&&resolve(restore.root)===root&&restore.credentialsCopied===false&&restore.privateKeysCopied===false&&restore.activeAuthorizationInstalled===false,'STAGE_RESTORE_CHANGED');
 const store=new StateStore(join(root,'portfolio.sqlite'));
 try{
  const copiedScope=Object.values(parent.grant.accountScope).join('/');
  for(let i=0;i<R4_PARENT_ATTEMPT_IDS.length;i++){
   const copiedAttempt=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key=?").get(copiedScope+'/'+R4_PARENT_ATTEMPT_IDS[i]);
   requireThat(copiedAttempt&&hash(JSON.parse(String(copiedAttempt.body)))===parent.attemptHashes[i],'STAGE_BACKUP_STOP_CHANGED');
  }
  const portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
  const source=store.get('portfolio-artifact',R4_SOURCE_ARTIFACT_ID),{_version:sourceVersion,...sourceBody}=source??{};
  requireThat(sourceVersion===1&&hash(sourceBody)===parent.sourceArtifactHash&&source.sha256===parent.source.sha256&&source.content?.brief?.sha256===R4_ACCEPTED_BRIEF_HASH&&source.content.brief.bytes===R4_ACCEPTED_BRIEF_BYTES,'STAGE_SOURCE_COPY_CHANGED');
  const mapping=addStageContinuationTasks(portfolio,parent,source);
  const tasks=mapping.map(m=>({id:m.id,definitionHash:taskDefinitionHash(portfolio.getTask(m.id)),workCalls:m.workCalls,stageContract:m.stageContract}));
  requireThat(tasks.reduce((n,t)=>n+t.workCalls,0)===15&&tasks.reduce((n,t)=>n+t.workCalls*STAGE_CONTRACTS[t.stageContract].maxCallCost.minorUnits,0)===2829&&portfolio.getTask(R4_DECISION_TASK_ID).inputArtifacts[0].sha256===source.sha256,'STAGE_TASK_ALLOCATION');
  const engine=new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:tasks})});
  const preview=await engine.previewRequest(R4_DECISION_TASK_ID),gateContract=STAGE_CONTRACTS['build-gate-v1'];
  const route=portfolioRoute(id,parent.grant.projectId,true,true),body=buildResponsesBody(portfolioTaskRoute(route,gateContract),preview.request,preview.schema),bytes=canonical(body);
  requireThat(route.maxOutputTokens===32768&&route.maxCallCost.minorUnits===205&&body.max_output_tokens===24576&&preview.request.limits.maxCost.minorUnits===164&&body.background===true&&body.store===true,'STAGE_INITIAL_ROUTE_CHANGED');
  const preserved=preview.request.context.dependencies?.find(d=>d.id==='explicit-preserved-input')?.artifacts?.find(a=>a.artifactId===source.id);
  const acceptedBriefFile=join(parentRoot,'proposal',parent.grant.id,'accepted-r1-brief.json');
  requireThat(preserved?.historicalProvenance?.payloadHash===parent.source.metadata.preservedSource.payloadHash&&preserved.historicalProvenance.briefHash===R4_ACCEPTED_BRIEF_HASH&&hash(preserved.report)===hash(JSON.parse(readFileSync(acceptedBriefFile,'utf8')))&&preserved.reportCompleteness==='full authoritative checked report','STAGE_INITIAL_CONTEXT');
  const continuation={kind:STAGE_CONTINUATION_KIND,parentRoot,parentGrantFileHash:parent.grantFileHash,parentGrantHash:hash(parent.grant),parentOperatingHash:hash(parent.inner),parentProposalHash:hash(parent.proposal),backupManifestHash:manifestHash,backupDatabaseHash:backup.manifest.database.sha256,restoreHash:hash(restore),
   attemptsHash:parent.attemptsHash,bindingsHash:parent.bindingsHash,accountHash:parent.accountHash,parentTasksHash:parent.tasksHash,requestRecordsHash:parent.requestRecordsHash,resultRecordsHash:parent.resultRecordsHash,stepsHash:parent.stepsHash,responseJobsHash:parent.responseJobsHash,recoveryIntentsHash:parent.recoveryIntentsHash,recoveryLinksHash:parent.recoveryLinksHash,parentSourceArtifactHash:parent.sourceArtifactHash,
   parentTaskId:R4_PARENT_TASK_ID,parentAttemptIds:[...R4_PARENT_ATTEMPT_IDS],parentAttemptHashes:parent.attemptHashes,parentRequestBodyHashes:parent.requestBodyHashes,parentResponseIds:parent.responseIds,parentTerminalHashes:parent.terminalHashes,
   sourceArtifactId:source.id,sourceArtifactHash:source.sha256,sourceManifestHash:source.metadata.manifestHash,sourcePayloadHash:source.metadata.preservedSource.payloadHash,sourceBriefHash:R4_ACCEPTED_BRIEF_HASH,sourceBriefBytes:R4_ACCEPTED_BRIEF_BYTES,
   carryId:'portfolio-031-history-through-r3-incomplete',historical:parent.historical,durability:{policyHash:hash(route.background),requestBody:{background:true,store:true},applicationStateRetention:'store-true-provider-retention-at-least-30-days',zeroDataRetentionCompatibility:'not-guaranteed',createAcknowledgementGap:'unknown-no-resubmit',retrieval:{method:'GET',admittedResponseIdsOnly:true,inferenceAdmissions:false,countAdmissions:false,maxPerResponse:240,maxAcrossGrantedResponses:3600},remoteMutation:{cancel:false,delete:false,retryPost:false}},combinedCeilingMinor:4582,combinedAdmissionLimit:26,originalCeilingMinor:4582,originalAdmissionLimit:34,
   replacement:{kind:R4_REPLACEMENT_KIND,failedTaskId:R4_PARENT_TASK_ID,failedAttemptIds:[...R4_PARENT_ATTEMPT_IDS],failedRequestBodyHashes:parent.requestBodyHashes,replacementTaskId:R4_DECISION_TASK_ID,preservesFailedOutcomes:true,preservesReservations:true,olderUnknownAttemptId:'p031-e2fd5c331b2304ca-0',preservesOlderUnknownOutcome:true},tasks:mapping};
  requireThat(hash(portfolio.getTask(R4_DECISION_TASK_ID).inputs.continuationReplacement)===hash(stageReplacementLink(continuation)),'STAGE_REPLACEMENT_CONTEXT_CHANGED');
  const proposal=createPortfolioProposal({root,id,mode:parent.grant.mode,projectId:parent.grant.projectId,credentialFile:parent.grant.credentialFile,billingPublicKey:parent.inner.billingPublicKey,expiresAt:parent.grant.expiresAt,background:true,stageContracts:stageIds,
   countUncertaintyMinor:400,recoveryAdmissions:0,tasks,initialRequests:[{taskId:R4_DECISION_TASK_ID,bodyHash:rawHash(bytes),schemaHash:hash(preview.schema)}],continuation,
   ventures:[{id:'quote-desk',goal:portfolio.getVenture('quote-desk').goal,capabilities:parent.grant.ventures[0].capabilities,tools:parent.grant.ventures[0].tools,sourceHosts:[],workCalls:15,searchCalls:0}]});
  validateStageContinuationR4(proposal.portfolio,publicKey,false);
  assertCountableRequest(body,proposal.operating.countRequestByteCeiling);
  requireThat(proposal.incrementalExposureMinor===2829&&proposal.historicalRetainedMinor===1753&&proposal.maximumExposureMinor===4582&&proposal.inferenceAdmissions===15&&proposal.countAdmissions===15,'STAGE_PROPOSAL_TOTALS');
  mkdirSync(output,{recursive:true});
  const write=(name,value)=>writeFileSync(join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  write('portfolio.authorization.request.json',proposal);
  write('initial-responses-bytes.json',bytes);
  write('initial-count-bytes.json',canonical(countPayload(body)));
  write('task-manifest.json',{tasks:tasks.map(a=>({allowance:a,contract:STAGE_CONTRACTS[a.stageContract],task:portfolio.getTask(a.id)})),lineage:continuation,preservedArtifact:{id:source.id,version:source.version,sha256:source.sha256,manifestHash:continuation.sourceManifestHash,payloadHash:continuation.sourcePayloadHash,briefHash:continuation.sourceBriefHash,briefBytes:continuation.sourceBriefBytes},historicalOutcomes:{unknownR2:{attemptId:'p031-e2fd5c331b2304ca-0',reservationMinor:123,preserved:true},terminalIncompleteR3:R4_PARENT_ATTEMPT_IDS.map((attemptId,i)=>({attemptId,attemptHash:continuation.parentAttemptHashes[i],requestBodyHash:continuation.parentRequestBodyHashes[i],responseId:continuation.parentResponseIds[i],terminalHash:continuation.parentTerminalHashes[i],reservationMinor:123,preserved:true,retryable:false}))},laterRequests:'Each request uses only its task stage contract. Ordinary admissions and reserved minor cannot move between stages. Same-ID durable retrieval is transport continuation and creates no new inference/count admission; no fresh linked recovery is authorized.'});
  write('accepted-r1-brief.json',readFileSync(acceptedBriefFile,'utf8'));
  write('payload-audit.json',{proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),bodyHash:rawHash(bytes),schemaHash:hash(preview.schema),contextBytes:Buffer.byteLength(JSON.stringify(preview.request.context)),payloadBytes:Buffer.byteLength(bytes),acceptedBriefHash:R4_ACCEPTED_BRIEF_HASH,acceptedBriefBytes:R4_ACCEPTED_BRIEF_BYTES,historical:parent.historical,stageContracts:Object.values(STAGE_CONTRACTS),incrementalExposureMinor:2829,combinedExposureMinor:4582,combinedAdmissions:26,inputTokens:'Unknown until authorized full-payload count',model:body.model,reasoning:body.reasoning,serviceTier:body.service_tier,background:body.background,store:body.store,applicationStateRetention:'store:true uses provider application-state retention of at least 30 days per current documentation; the exact deletion time is not guaranteed, and this packet makes no zero-data-retention compatibility claim',retrievalPolicy:{onlyAlreadyAdmittedResponseIds:true,maxPerResponse:240,maxAcross15Responses:3600,retrievalDeadlineMs:15000,completionDeadlineMs:900000,resumeWindowMs:86400000,maxConsecutiveReadErrors:3,pricing:'GET retrieval and count endpoint pricing are unestablished; the same USD 4.00 uncertainty buffer covers both without treating either as free'},earlyCreateGap:'A POST whose acknowledgement is lost before a response ID is persisted remains unknown. It is never resubmitted, cancelled or deleted by this amendment.',providerRequests:0,credentialRead:false,privateKeyRead:false,signed:false,parentRetired:false});
  return {root,output,proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),incrementalExposureMinor:proposal.incrementalExposureMinor,historicalRetainedMinor:proposal.historicalRetainedMinor,combinedExposureMinor:proposal.maximumExposureMinor,inferenceAdmissions:proposal.inferenceAdmissions,countAdmissions:proposal.countAdmissions,combinedAdmissions:parent.historical.admissions+proposal.inferenceAdmissions,maxRetrievalsPerResponse:240,maxRetrievalsAcrossAuthorizedResponses:3600,providerRequests:0,credentialRead:false,privateKeyRead:false,signed:false,parentRetired:false};
 }finally{store.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=name=>{const i=process.argv.indexOf(name);requireThat(i>=0&&process.argv[i+1],'STAGE_ARGUMENT_'+name);return process.argv[i+1];};
 console.log(JSON.stringify(await prepareStageContinuationR4({parentRoot:arg('--parent-root'),backupRoot:arg('--backup'),manifestHash:arg('--manifest-hash'),root:arg('--root')}),null,2));
}
