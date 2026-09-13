/** Offline-only Mission 031 R2 preparation. This copies a verified stop backup,
 * authenticates the accepted R1 delivery, imports it as evidence, and freezes a
 * fresh unsigned five-task proposal. It never reads credentials or calls/counts
 * against a provider. */
import {copyFileSync,constants,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {StateStore} from '../src/state.ts';
import {canonical,hash,rawHash,requireThat} from '../src/contracts.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {createPortfolioProposal,portfolioImplementationHash,portfolioRoute,taskDefinitionHash} from '../src/portfolio/live.ts';
import {inspectFinalizationParent,validateContinuation} from '../src/portfolio/continuation.ts';
import {verifyPortfolioBackup} from '../src/portfolio/continuity.ts';
import {ALL_TOOL_NAMES} from '../src/portfolio/worker.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {assertCountableRequest,countPayload} from '../src/experiment/token-count.ts';

const allowances=new Map([
 ['quote-desk/decide-v4-r1',1],
 ['quote-desk/build-v4-r1',10],
 ['quote-desk/review-product-v4-r1',6],
 ['quote-desk/operate-v4-r1',6],
 ['quote-desk/adapt-v4-r1',1]
]);
const nextId=id=>id.replace(/-r1$/,'-r2');

export function importAcceptedInvestigation(portfolio,tools,parent){
 const prior=parent.workspace,payload=JSON.parse(tools.download('quote-desk',parent.taskId).content),brief=payload.files.find(f=>f.path==='brief.json')?.content;
 const sourceFiles=prior.files.map(file=>payload.files.find(delivered=>delivered.path===file.path));
 requireThat(sourceFiles.every(Boolean)&&hash(payload)===prior.published.payloadHash&&payload.manifest.sha256===prior.manifest.sha256&&hash(sourceFiles)===hash(prior.files)&&hash(payload.checks)===hash(prior.checks)&&brief===parent.brief,'FINALIZATION_IMPORT_READBACK_CHANGED');
 const artifact=portfolio.publishArtifact('quote-desk',{
  id:'accepted-investigation-v4-r2-source',title:'Accepted R1 quote-to-job investigation',kind:'historical_service_delivery',
  provenance:'actual_model_historical_reuse',
  summary:'Full accepted 17,908-byte investigation and its checks, manifest, delivery identity, open obligations and source support.',
  content:{manifest:prior.manifest,delivery:{payloadHash:prior.published.payloadHash,ref:prior.published.ref},brief:{sha256:rawHash(brief),bytes:Buffer.byteLength(brief)}},
  metadata:{manifestHash:prior.manifest.sha256,preservedSource:{taskId:parent.taskId,grantHash:hash(parent.grant),payloadHash:prior.published.payloadHash,briefHash:rawHash(brief),briefBytes:Buffer.byteLength(brief),checksHash:hash(prior.checks),sourceAuthorship:'actual_model_r1'}},
  checks:prior.checks,previewUrl:'/preview?ventureId=quote-desk&taskId='+encodeURIComponent(parent.taskId),downloadUrl:'/api/delivery?ventureId=quote-desk&taskId='+encodeURIComponent(parent.taskId)
 });
 requireThat(artifact.version===1&&artifact.metadata.preservedSource.payloadHash===prior.published.payloadHash&&artifact.content.manifest.sha256===prior.manifest.sha256,'FINALIZATION_IMPORT_FAILED');
 return artifact;
}

export function addFinalizationTasks(portfolio,parent,artifact){
 const mapping=[...allowances].map(([parentId,workCalls])=>({parentId,id:nextId(parentId),workCalls}));
 const planId='value-release-v4-finalization-r2',existing=portfolio.store.get('portfolio-plan','quote-desk/'+planId);
 if(!existing){
  const specs=mapping.map(m=>{
   const task=parent.tasks.find(t=>t.id===m.parentId);requireThat(task&&task.status==='queued'&&task.attempts===0,'FINALIZATION_PARENT_TASK_UNAVAILABLE');
   const inputs=structuredClone(task.inputs??{});delete inputs.procedureScope;delete inputs.baselineProcedureId;delete inputs.draftContinuation;
   inputs.continuationVersion=planId;
   inputs.budgetGuidance='The frozen ordinary allowance belongs to substantive work. For bounded-finalize-v1, a worker complete submission triggers controller-run current checks, local publication, authenticated readback and closure without extra model decisions. Repair only from actual feedback. Two held recovery admissions are usable solely after a signed known-incomplete response and never increase ordinary task allowances.';
   if(task.capability==='portfolio.plan'||task.capability==='portfolio.reassess')delete inputs.executionProtocol;else inputs.executionProtocol='bounded-finalize-v1';
   if(inputs.prototypeGate)inputs.prototypeGate.cancelUnlessPrototype=inputs.prototypeGate.cancelUnlessPrototype.map(nextId);
   const dependencies=task.dependsOn.filter(id=>allowances.has(id)).map(nextId),planning=['portfolio.plan','portfolio.reassess'].includes(task.capability);
   const allowedTools=planning?[]:[...new Set([...task.allowedTools,'workspace.patch','workspace.candidate_read'])];
   requireThat(allowedTools.every(name=>ALL_TOOL_NAMES.includes(name)),'FINALIZATION_TASK_TOOL');
   return {id:nextId(task.id).split('/')[1],title:task.title,objective:task.objective.replaceAll('-v4-r1','-v4-r2'),lane:task.lane,capability:task.capability,dependsOn:dependencies,
    acceptance:task.acceptance,requiredCompetencies:task.requiredCompetencies,allowedTools,requiredChecks:task.requiredChecks,
    resource:{workerSlots:1,modelCalls:m.workCalls+2,localToolRuns:2*m.workCalls+2},priority:task.priority,maxAttempts:1,inputs,
    ...(m.parentId==='quote-desk/decide-v4-r1'?{inputArtifacts:[{artifactId:artifact.id,version:artifact.version,sha256:artifact.sha256}]}:{})};
  });
  const sourceBindings=parent.tasks.find(t=>t.id===parent.taskId)?.inputs?.sourceBindings??[];
  portfolio.addPlan('quote-desk',{id:planId,rationale:'Continue only the five unexecuted R1 decisions under a fresh bounded-finalization controller. The accepted R1 investigation is an authenticated explicit input artifact; its blocked task and all eight historical attempts remain unchanged.',evidenceIds:sourceBindings.map(s=>s.id),tasks:specs});
 }
 return mapping;
}

export async function prepareFinalization({parentRoot,backupRoot,manifestHash,root,id='portfolio-031-value-build-v4-r2',output}){
 root=resolve(root);parentRoot=resolve(parentRoot);backupRoot=resolve(backupRoot);output=resolve(output??join(root,'proposal',id));
 requireThat(!existsSync(join(root,'portfolio.authorization.json'))&&!existsSync(join(output,'portfolio.authorization.request.json')),'FINALIZATION_ALREADY_FROZEN');
 const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8'),parent=inspectFinalizationParent(parentRoot,publicKey);
 requireThat(!parent.retired&&!parent.operatingRetired,'FINALIZATION_PARENT_ALREADY_RETIRED');
 const backup=verifyPortfolioBackup({backupRoot,expectedManifestHash:manifestHash});
 requireThat(resolve(backup.manifest.sourceRoot)===parentRoot&&backup.manifest.implementationHash===parent.grant.implementationHash&&backup.manifest.database.sha256===rawHash(readFileSync(join(backupRoot,'portfolio.sqlite'))),'FINALIZATION_BACKUP_IDENTITY');
 if(!existsSync(root)){
  mkdirSync(root,{recursive:true});copyFileSync(join(backupRoot,'portfolio.sqlite'),join(root,'portfolio.sqlite'),constants.COPYFILE_EXCL);
  requireThat(rawHash(readFileSync(join(root,'portfolio.sqlite')))===backup.manifest.database.sha256,'FINALIZATION_COPY_MISMATCH');
  mkdirSync(join(root,'historical-authority','auth'),{recursive:true});
  copyFileSync(join(backupRoot,'portfolio.authorization.json'),join(root,'historical-authority','portfolio.authorization.json'),constants.COPYFILE_EXCL);
  copyFileSync(join(backupRoot,'auth','portfolio-owner.pub'),join(root,'historical-authority','auth','portfolio-owner.pub'),constants.COPYFILE_EXCL);
  writeFileSync(join(root,'restore.json'),JSON.stringify({kind:'explicit-artifact-continuation-copy-r2',backupManifestHash:manifestHash,sourceImplementationHash:backup.manifest.implementationHash,targetImplementationHash:portfolioImplementationHash(),sourceRoot:parentRoot,root,credentialsCopied:false,activeAuthorizationInstalled:false,originalDatabaseHash:backup.manifest.database.sha256},null,2)+'\n',{flag:'wx'});
 }
 const store=new StateStore(join(root,'portfolio.sqlite'));
 try{
  const portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
  const artifact=importAcceptedInvestigation(portfolio,tools,parent),mapping=addFinalizationTasks(portfolio,parent,artifact);
  const tasks=mapping.map(m=>({id:m.id,definitionHash:taskDefinitionHash(portfolio.getTask(m.id)),workCalls:m.workCalls})),first='quote-desk/decide-v4-r2';
  requireThat(tasks.reduce((n,t)=>n+t.workCalls,0)===24&&portfolio.getTask(first).inputArtifacts[0].sha256===artifact.sha256,'FINALIZATION_TASK_ALLOCATION');
  const engine=new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:tasks})});
  const preview=await engine.previewRequest(first),body=buildResponsesBody(portfolioRoute(id,parent.grant.projectId),preview.request,preview.schema),bytes=canonical(body);
  const preserved=preview.request.context.dependencies?.find(d=>d.id==='explicit-preserved-input')?.artifacts?.find(a=>a.artifactId===artifact.id);
  requireThat(preserved?.historicalProvenance?.payloadHash===parent.workspace.published.payloadHash&&hash(preserved.report)===hash(JSON.parse(parent.brief))&&preserved.reportCompleteness==='full authoritative checked report','FINALIZATION_INITIAL_CONTEXT');
  const originalProposal=JSON.parse(readFileSync(join(parentRoot,'proposal',parent.grant.id,'portfolio.authorization.request.json'),'utf8'));
  const continuation={kind:'portfolio-v4-artifact-continuation-r2',parentRoot,parentGrantFileHash:parent.grantFileHash,parentGrantHash:hash(parent.grant),parentOperatingHash:hash(parent.inner),parentProposalHash:hash(originalProposal),
   backupManifestHash:manifestHash,attemptsHash:parent.attemptsHash,bindingsHash:parent.bindingsHash,accountHash:parent.accountHash,parentTasksHash:parent.tasksHash,parentWorkspaceHash:parent.workspaceHash,deliveryHash:parent.deliveryHash,
   parentTaskId:parent.taskId,artifactId:artifact.id,artifactHash:artifact.sha256,manifestHash:parent.workspace.manifest.sha256,payloadHash:parent.workspace.published.payloadHash,briefHash:rawHash(parent.brief),briefBytes:Buffer.byteLength(parent.brief),
   carryId:'portfolio-031-history-through-r1',historical:parent.historical,combinedCeilingMinor:4582,combinedAdmissionLimit:34,originalCeilingMinor:5182,originalAdmissionLimit:36,tasks:mapping};
  const usedTools=[...new Set(mapping.flatMap(m=>portfolio.getTask(m.id).allowedTools))];
  const proposal=createPortfolioProposal({root,id,mode:parent.grant.mode,projectId:parent.grant.projectId,credentialFile:parent.grant.credentialFile,billingPublicKey:parent.inner.billingPublicKey,expiresAt:parent.grant.expiresAt,
   countUncertaintyMinor:400,recoveryAdmissions:2,tasks,initialRequests:[{taskId:first,bodyHash:rawHash(bytes),schemaHash:hash(preview.schema)}],continuation,
   ventures:[{id:'quote-desk',goal:portfolio.getVenture('quote-desk').goal,capabilities:parent.grant.ventures[0].capabilities,tools:usedTools,sourceHosts:[],workCalls:26,searchCalls:0}]});
  validateContinuation(proposal.portfolio,publicKey,false);assertCountableRequest(body,proposal.operating.countRequestByteCeiling);
  requireThat(proposal.incrementalExposureMinor===3198&&proposal.historicalRetainedMinor===1384&&proposal.maximumExposureMinor===4582&&proposal.inferenceAdmissions===26&&proposal.countAdmissions===26,'FINALIZATION_PROPOSAL_TOTALS');
  mkdirSync(output,{recursive:true});const write=(name,value)=>writeFileSync(join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  write('portfolio.authorization.request.json',proposal);write('initial-responses-bytes.json',bytes);write('initial-count-bytes.json',canonical(countPayload(body)));
  write('task-manifest.json',{tasks:tasks.map(a=>({allowance:a,task:portfolio.getTask(a.id)})),lineage:continuation,preservedArtifact:{id:artifact.id,version:artifact.version,sha256:artifact.sha256,manifestHash:continuation.manifestHash,payloadHash:continuation.payloadHash,briefHash:continuation.briefHash,briefBytes:continuation.briefBytes},laterRequests:'Depend on actual bounded-finalization decisions, controller checks and authoritative artifact identities. Each request is persisted before admission.'});
  write('accepted-r1-brief.json',parent.brief);
  write('payload-audit.json',{proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),bodyHash:rawHash(bytes),schemaHash:hash(preview.schema),contextBytes:Buffer.byteLength(JSON.stringify(preview.request.context)),payloadBytes:Buffer.byteLength(bytes),acceptedBriefHash:rawHash(parent.brief),acceptedBriefBytes:Buffer.byteLength(parent.brief),historical:parent.historical,incrementalExposureMinor:3198,combinedExposureMinor:4582,originalCeilingMinor:5182,combinedAdmissions:34,originalAdmissionLimit:36,inputTokens:'Unknown until authorized full-payload count',model:body.model,reasoning:body.reasoning,serviceTier:body.service_tier,providerRequests:0,credentialRead:false,signed:false,parentRetired:false});
  return {root,output,proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),incrementalExposureMinor:proposal.incrementalExposureMinor,historicalRetainedMinor:proposal.historicalRetainedMinor,combinedExposureMinor:proposal.maximumExposureMinor,originalCeilingMinor:continuation.originalCeilingMinor,inferenceAdmissions:proposal.inferenceAdmissions,countAdmissions:proposal.countAdmissions,combinedAdmissions:parent.historical.admissions+proposal.inferenceAdmissions,originalAdmissionLimit:continuation.originalAdmissionLimit,providerRequests:0,credentialRead:false,signed:false,parentRetired:false};
 }finally{store.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=name=>{const i=process.argv.indexOf(name);requireThat(i>=0&&process.argv[i+1],'FINALIZATION_ARGUMENT_'+name);return process.argv[i+1];};
 console.log(JSON.stringify(await prepareFinalization({parentRoot:arg('--parent-root'),backupRoot:arg('--backup'),manifestHash:arg('--manifest-hash'),root:arg('--root')}),null,2));
}
