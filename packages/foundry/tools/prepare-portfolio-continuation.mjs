/** Offline-only exact continuation preparation. No provider or credential API. */
import {copyFileSync,constants,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {StateStore} from '../src/state.ts';
import {hash,rawHash,canonical,requireThat} from '../src/contracts.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {createPortfolioProposal,taskDefinitionHash,portfolioRoute,portfolioImplementationHash} from '../src/portfolio/live.ts';
import {inspectContinuationParent,validateContinuation} from '../src/portfolio/continuation.ts';
import {verifyPortfolioBackup} from '../src/portfolio/continuity.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {countPayload,assertCountableRequest} from '../src/experiment/token-count.ts';

export function addContinuationTasks(portfolio,tools,parent){
 const mapping=parent.grant.tasks.map(t=>({parentId:t.id,id:t.id+'-r1',workCalls:t.workCalls-(t.id===parent.taskId?1:0)}));
 const planId='value-release-v4-continuation-r1',existing=portfolio.store.get('portfolio-plan','quote-desk/'+planId);
 if(!existing){
  const specs=mapping.map(m=>{
   const t=portfolio.getTask(m.parentId),inputs=structuredClone(t.inputs);
   for(const old of parent.grant.tasks)requireThat(taskDefinitionHash(portfolio.getTask(old.id))===old.definitionHash,'CONTINUATION_PARENT_TASK_CHANGED');
   inputs.continuationVersion='value-release-v4-continuation-r1';
   if(inputs.prototypeGate)inputs.prototypeGate.cancelUnlessPrototype=inputs.prototypeGate.cancelUnlessPrototype.map(id=>mapping.find(m=>m.parentId===id).id);
   if(t.id===parent.taskId)inputs.draftContinuation={kind:'preserved-draft-correction-v1',parentTaskId:parent.taskId,parentAttemptId:parent.attemptId,taskId:m.id,sha256:rawHash(parent.draft),bytes:Buffer.byteLength(parent.draft)};
   let objective=t.objective;
   if(t.id===parent.taskId)objective=objective.replace('Eight ordinary decisions include','Seven remaining ordinary decisions include')+' Continue from your preserved draft and the exact size feedback; do not restart completed investigation. Reconsider unsupported recommendations against the supplied existing product profile. Owner interviews are not a prerequisite for finishing this bounded engineering experiment.';
   for(const link of mapping)objective=objective.replaceAll(link.parentId.split('/')[1],link.id.split('/')[1]);
   return {id:m.id.split('/')[1],title:t.title,objective,lane:t.lane,capability:t.capability,dependsOn:t.dependsOn.map(id=>mapping.find(m=>m.parentId===id).id),acceptance:t.acceptance,requiredCompetencies:t.requiredCompetencies,allowedTools:t.allowedTools,requiredChecks:t.requiredChecks,resource:{...t.resource,modelCalls:m.workCalls+2,localToolRuns:t.resource.localToolRuns-(t.id===parent.taskId?1:0)},priority:t.priority,maxAttempts:1,inputs};
  });
  portfolio.addPlan('quote-desk',{id:planId,rationale:'Explicit prospective continuation after a completed oversized response. Preserve prior evidence, model-authored draft and consumed allowances; permit self-correction and the unchanged bounded build-or-stop path under a new exact grant.',evidenceIds:parent.tasks[0].inputs.sourceBindings.map(s=>s.id),tasks:specs});
  const id=mapping.find(m=>m.parentId===parent.taskId).id;
  tools.seed('quote-desk',id,{kind:'service',files:parent.workspace.files,inputs:parent.workspace.inputs,provenance:'Exact inherited actual-model draft from '+parent.attemptId+'; unmodified by development assistant. New revision requires actual runtime correction.'});
 }
 return mapping;
}

export async function prepareContinuation({parentRoot,backupRoot,manifestHash,root,id='portfolio-031-value-build-v4-r1',output}){
 root=resolve(root);parentRoot=resolve(parentRoot);backupRoot=resolve(backupRoot);output=resolve(output??join(root,'proposal',id));
 requireThat(!existsSync(join(root,'portfolio.authorization.json'))&&!existsSync(join(output,'portfolio.authorization.request.json')),'CONTINUATION_ALREADY_FROZEN');
 const publicKey=readFileSync(join(parentRoot,'auth','portfolio-owner.pub'),'utf8'),parent=inspectContinuationParent(parentRoot,publicKey);
 requireThat(!parent.retired&&!parent.operatingRetired,'CONTINUATION_PARENT_ALREADY_RETIRED');
 const backup=verifyPortfolioBackup({backupRoot,expectedManifestHash:manifestHash});
 requireThat(resolve(backup.manifest.sourceRoot)===parentRoot&&backup.manifest.implementationHash===parent.grant.implementationHash,'CONTINUATION_BACKUP_IDENTITY');
 if(!existsSync(root)){
  mkdirSync(root,{recursive:true});copyFileSync(join(backupRoot,'portfolio.sqlite'),join(root,'portfolio.sqlite'),constants.COPYFILE_EXCL);
  requireThat(rawHash(readFileSync(join(root,'portfolio.sqlite')))===backup.manifest.database.sha256,'CONTINUATION_COPY_MISMATCH');
  mkdirSync(join(root,'historical-authority','auth'),{recursive:true});
  copyFileSync(join(backupRoot,'portfolio.authorization.json'),join(root,'historical-authority','portfolio.authorization.json'),constants.COPYFILE_EXCL);
  copyFileSync(join(backupRoot,'auth','portfolio-owner.pub'),join(root,'historical-authority','auth','portfolio-owner.pub'),constants.COPYFILE_EXCL);
  writeFileSync(join(root,'restore.json'),JSON.stringify({kind:'explicit-repaired-continuation-copy-v1',backupManifestHash:manifestHash,sourceImplementationHash:backup.manifest.implementationHash,targetImplementationHash:portfolioImplementationHash(),sourceRoot:parentRoot,root,credentialsCopied:false,activeAuthorizationInstalled:false,originalDatabaseHash:backup.manifest.database.sha256},null,2)+'\n',{flag:'wx'});
 }
 const store=new StateStore(join(root,'portfolio.sqlite'));
 try{
  const portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
  const mapping=addContinuationTasks(portfolio,tools,parent),tasks=mapping.map(m=>({id:m.id,definitionHash:taskDefinitionHash(portfolio.getTask(m.id)),workCalls:m.workCalls}));
  const first=mapping.find(m=>m.parentId===parent.taskId).id;
  const engine=new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:tasks})});
  const preview=await engine.previewRequest(first),body=buildResponsesBody(portfolioRoute(id,parent.grant.projectId),preview.request,preview.schema),bytes=canonical(body);
  requireThat(preview.request.context.workspace.currentSource[0].content===parent.draft&&preview.request.context.draftCorrection.inheritedUnchanged&&preview.request.context.prospectiveExecutionProfiles.length===1,'CONTINUATION_INITIAL_CONTEXT');
  const originalProposal=JSON.parse(readFileSync(join(parentRoot,'proposal',parent.grant.id,'portfolio.authorization.request.json'),'utf8'));
  const continuation={kind:'portfolio-v4-draft-continuation-r1',parentRoot,parentGrantFileHash:parent.grantFileHash,parentGrantHash:hash(parent.grant),parentOperatingHash:hash(parent.inner),parentProposalHash:hash(originalProposal),backupManifestHash:manifestHash,attemptsHash:parent.attemptsHash,bindingsHash:parent.bindingsHash,accountHash:parent.accountHash,parentWorkspaceHash:parent.workspaceHash,parentTaskId:parent.taskId,parentAttemptId:parent.attemptId,draftHash:rawHash(parent.draft),draftBytes:Buffer.byteLength(parent.draft),taskId:first,historical:parent.historical,combinedCeilingMinor:parent.inner.limits.totalMinor,combinedAdmissionLimit:parent.inner.limits.astraCountRequests,tasks:mapping};
  const proposal=createPortfolioProposal({root,id,mode:parent.grant.mode,projectId:parent.grant.projectId,credentialFile:parent.grant.credentialFile,billingPublicKey:parent.inner.billingPublicKey,expiresAt:parent.grant.expiresAt,countUncertaintyMinor:400,recoveryAdmissions:2,tasks,initialRequests:[{taskId:first,bodyHash:rawHash(bytes),schemaHash:hash(preview.schema)}],continuation,ventures:parent.grant.ventures.map(v=>({...v,goal:portfolio.getVenture(v.id).goal,workCalls:v.workCalls-1}))});
  validateContinuation(proposal.portfolio,publicKey,false);
  assertCountableRequest(body,proposal.operating.countRequestByteCeiling);
  mkdirSync(output,{recursive:true});const write=(name,value)=>writeFileSync(join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  write('portfolio.authorization.request.json',proposal);write('initial-responses-bytes.json',bytes);write('initial-count-bytes.json',canonical(countPayload(body)));
  write('task-manifest.json',{tasks:tasks.map(a=>({allowance:a,task:portfolio.getTask(a.id)})),lineage:continuation,sources:evidence.forTask(portfolio.getTask(first)).map(({text,...s})=>s),laterRequests:'Depend on actual runtime choices, tool observations and authoritative artifact identities. Each request is persisted before admission.'});
  write('original-runtime-draft.json',parent.draft);
  write('payload-audit.json',{proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),bodyHash:rawHash(bytes),schemaHash:hash(preview.schema),contextBytes:Buffer.byteLength(JSON.stringify(preview.request.context)),payloadBytes:Buffer.byteLength(bytes),fullDraftHash:rawHash(preview.request.context.workspace.currentSource[0].content),productContractHash:preview.request.context.prospectiveExecutionProfiles[0].contractHash,inputTokens:'Unknown until authorized full-payload count; ceiling unchanged',model:body.model,reasoning:body.reasoning,serviceTier:body.service_tier,providerRequests:0,credentialRead:false,signed:false});
  return {root,output,proposalHash:hash(proposal),implementationHash:portfolioImplementationHash(),incrementalExposureMinor:proposal.incrementalExposureMinor,historicalRetainedMinor:proposal.historicalRetainedMinor,combinedExposureMinor:proposal.maximumExposureMinor,inferenceAdmissions:proposal.inferenceAdmissions,countAdmissions:proposal.countAdmissions,providerRequests:0,credentialRead:false};
 }finally{store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=name=>{const i=process.argv.indexOf(name);requireThat(i>=0&&process.argv[i+1],'CONTINUATION_ARGUMENT_'+name);return process.argv[i+1];};
 console.log(JSON.stringify(await prepareContinuation({parentRoot:arg('--parent-root'),backupRoot:arg('--backup'),manifestHash:arg('--manifest-hash'),root:arg('--root')}),null,2));
}
