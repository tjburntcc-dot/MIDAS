/** Explicit Mission 031 draft continuation. Historical authority is retired,
 * never transferred; historical attempts remain immutable, conservatively held. */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {hash,rawHash,requireThat,scopeKey} from '../contracts.ts';
import {verified} from '../experiment/config.ts';
import {StateStore} from '../state.ts';
import type {PortfolioGrant} from './live.ts';

export type HistoricalExposure={admissions:number;counts:number;reservedMinor:number;provisionalMinor:number;settledMinor:number;countBufferMinor:number};
export type LegacyDraftContinuation={
 kind:'portfolio-v4-draft-continuation-r1';parentRoot:string;parentGrantFileHash:string;parentGrantHash:string;parentOperatingHash:string;parentProposalHash:string;
 backupManifestHash:string;attemptsHash:string;bindingsHash:string;accountHash:string;parentWorkspaceHash:string;
 parentTaskId:string;parentAttemptId:string;draftHash:string;draftBytes:number;taskId:string;
 historical:HistoricalExposure;
 combinedCeilingMinor:number;combinedAdmissionLimit:number;
 tasks:Array<{parentId:string;id:string;workCalls:number}>;
};
export type ArtifactContinuation={
 kind:'portfolio-v4-artifact-continuation-r2';parentRoot:string;parentGrantFileHash:string;parentGrantHash:string;parentOperatingHash:string;parentProposalHash:string;
 backupManifestHash:string;attemptsHash:string;bindingsHash:string;accountHash:string;parentTasksHash:string;parentWorkspaceHash:string;deliveryHash:string;
 parentTaskId:string;artifactId:string;artifactHash:string;manifestHash:string;payloadHash:string;briefHash:string;briefBytes:number;carryId:string;
 historical:HistoricalExposure;combinedCeilingMinor:number;combinedAdmissionLimit:number;originalCeilingMinor:number;originalAdmissionLimit:number;
 tasks:Array<{parentId:string;id:string;workCalls:number}>;
};
export type DraftContinuation=LegacyDraftContinuation|ArtifactContinuation;
const rows=(db:DatabaseSync,kind:string)=>db.prepare('SELECT key,body FROM entities WHERE kind=? ORDER BY key').all(kind).map(r=>({key:String(r.key),body:JSON.parse(String(r.body))}));
const entity=(db:DatabaseSync,kind:string,key:string)=>{const r=db.prepare('SELECT body FROM entities WHERE kind=? AND key=?').get(kind,key);return r?JSON.parse(String(r.body)):null;};

/** Public signatures and non-secret persisted state only. Never reads a key. */
export function inspectContinuationParent(parentRoot:string,publicKey:string){
 const bytes=readFileSync(join(parentRoot,'portfolio.authorization.json')),envelope=JSON.parse(bytes.toString('utf8'));
 const grant=verified(envelope,publicKey) as PortfolioGrant,inner=verified(envelope.operatingEnvelope,publicKey) as any;
 requireThat(grant.approved&&grant.root===resolve(parentRoot)&&!grant.continuation&&grant.operatingGrantHash===hash(inner),'CONTINUATION_PARENT_AUTHORITY');
 const db=new DatabaseSync(join(parentRoot,'portfolio.sqlite'),{readOnly:true});
 try{
  const scope=scopeKey(grant.accountScope),attempts=rows(db,'model-attempt').filter(r=>r.key.startsWith(scope+'/'));
  const bindings=rows(db,'portfolio-work-binding').filter(r=>r.body.grantHash===hash(grant));
  const account=entity(db,'experiment-account',scope),tasks=(grant.tasks??[]).map(t=>entity(db,'portfolio-task',t.id));
  requireThat(account?.authorizationHash===hash(inner)&&hash(account.limits)===hash(inner.limits)&&!account.halted,'CONTINUATION_PARENT_ACCOUNT');
  requireThat(tasks.length===6&&tasks.every(t=>t&&!t.lease&&t.status!=='needs_reconciliation'),'CONTINUATION_PARENT_BUSY');
  requireThat(attempts.length===1&&bindings.length===1&&attempts.every(r=>r.body.finishedAt&&!r.body.errorCode&&r.body.result?.output&&r.body.inferenceDispatchIntent&&r.body.countDispatchIntent),'CONTINUATION_PARENT_NOT_COMPLETED');
  const row=attempts[0].body,task=tasks.find(t=>t.id===bindings[0].body.taskId);
  requireThat(task?.status==='blocked'&&task.reason==='CURRENT_SOURCE_HANDOFF_TOO_LARGE'&&tasks.filter(t=>t.id!==task.id).every(t=>t.attempts===0),'CONTINUATION_PARENT_STOP_CHANGED');
  const workspace=rows(db,'local-workspace').find(r=>r.body.taskId===task.id)?.body;
  const draft=workspace?.files.find((f:any)=>f.path==='brief.json')?.content;
  requireThat(typeof draft==='string'&&row.result.output.toolCall?.name==='workspace.replace'&&row.result.output.toolCall.arguments.path==='brief.json'&&row.result.output.toolCall.arguments.content===draft,'CONTINUATION_DRAFT_RESPONSE_MISMATCH');
  requireThat(!workspace.published&&!workspace.checks.length&&row.reservation===123&&!row.invoice&&row.cost?.status==='provisional'&&inner.limits.overheadReserve?.minor===400&&!inner.limits.carryIn?.length,'CONTINUATION_PARENT_EXPOSURE_CHANGED');
  return {grant,inner,grantFileHash:rawHash(bytes),attemptsHash:hash(attempts),bindingsHash:hash(bindings),accountHash:hash(account),workspaceHash:hash(workspace),workspace,tasks,
   draft,attemptId:row.id,taskId:task.id,historical:{admissions:1,counts:1,reservedMinor:row.reservation,provisionalMinor:row.cost.money.minorUnits,settledMinor:0,countBufferMinor:400},
   retired:entity(db,'portfolio-revocation',hash(grant)),operatingRetired:entity(db,'operating-revocation',hash(inner))};
 }finally{db.close();}
}
const taskDefinitionHash=(t:any)=>{const {authoritativeArtifactId,...inputs}=t.inputs??{};return hash({id:t.id,ventureId:t.ventureId,title:t.title,objective:t.objective,capability:t.capability,dependsOn:t.dependsOn,allowedTools:t.allowedTools,acceptance:t.acceptance,requiredChecks:t.requiredChecks,requiredCompetencies:t.requiredCompetencies,resource:t.resource,inputs});};
const artifactRow=(db:DatabaseSync,scope:string,id:string)=>{const r=db.prepare('SELECT sha256,body FROM artifacts WHERE scope=? AND id=?').get(scope,id);return r?{sha256:String(r.sha256),body:JSON.parse(String(r.body))}:null;};

/** Validate the signed R1 continuation recursively, then authenticate its exact
 * checked local delivery. No historical task is completed or rewritten. */
export function inspectFinalizationParent(parentRoot:string,publicKey:string){
 const bytes=readFileSync(join(parentRoot,'portfolio.authorization.json')),envelope=JSON.parse(bytes.toString('utf8'));
 const grant=verified(envelope,publicKey) as PortfolioGrant,inner=verified(envelope.operatingEnvelope,publicKey) as any;
 requireThat(grant.approved&&grant.root===resolve(parentRoot)&&grant.continuation?.kind==='portfolio-v4-draft-continuation-r1'&&grant.operatingGrantHash===hash(inner),'FINALIZATION_PARENT_AUTHORITY');
 // This reaches the signed original parent and verifies its exact retirement
 // claim, rather than accepting a detached R1 summary as historical truth.
 validateContinuation(grant,publicKey,true);
 const db=new DatabaseSync(join(parentRoot,'portfolio.sqlite'),{readOnly:true});
 try{
  const grantHash=hash(grant),scope=scopeKey(grant.accountScope),attempts=rows(db,'model-attempt').filter(r=>r.key.startsWith(scope+'/'));
  const bindings=rows(db,'portfolio-work-binding').filter(r=>r.body.grantHash===grantHash),account=entity(db,'experiment-account',scope);
  const tasks=(grant.tasks??[]).map(a=>entity(db,'portfolio-task',a.id)),parentTaskId=grant.continuation.taskId,parentTask=tasks.find(t=>t?.id===parentTaskId);
  requireThat(account?.authorizationHash===hash(inner)&&hash(account.limits)===hash(inner.limits)&&account.settled===0&&!account.halted,'FINALIZATION_PARENT_ACCOUNT');
  requireThat(tasks.length===6&&tasks.every((t,i)=>t&&!t.lease&&t.status!=='running'&&t.status!=='needs_reconciliation'&&taskDefinitionHash(t)===grant.tasks![i].definitionHash),'FINALIZATION_PARENT_TASKS_CHANGED');
  requireThat(parentTask?.status==='blocked'&&parentTask.reason==='TASK_ORDINARY_ALLOWANCE_EXHAUSTED'&&parentTask.attempts===1&&parentTask.checkpoint?.index===7&&parentTask.checkpoint?.lastTool==='artifact.publish_local','FINALIZATION_PARENT_STOP_CHANGED');
  requireThat(tasks.filter(t=>t.id!==parentTaskId).every(t=>t.status==='queued'&&t.attempts===0&&!t.lease&&!t.outputArtifacts.length),'FINALIZATION_PARENT_DESCENDANT_STARTED');
  requireThat(attempts.length===7&&bindings.length===7&&new Set(attempts.map(r=>r.body.id)).size===7&&new Set(bindings.map(r=>r.body.attemptId)).size===7,'FINALIZATION_PARENT_ATTEMPT_COUNT');
  for(const row of attempts){const binding=bindings.find(b=>b.body.attemptId===row.body.id);requireThat(binding&&row.body.finishedAt&&!row.body.errorCode&&row.body.result?.output&&row.body.inferenceDispatchIntent&&row.body.countDispatchIntent&&row.body.observation?.status==='completed'&&row.body.reservation===123&&row.body.cost?.status==='provisional'&&Number.isSafeInteger(row.body.cost.money?.minorUnits)&&!row.body.invoice&&binding.body.taskId===parentTaskId&&!binding.body.recoveryOf&&binding.body.bodyHash===row.body.requestHash,'FINALIZATION_PARENT_ATTEMPT_CHANGED');}
  const ordered=[...attempts].sort((a,b)=>String(a.body.id).localeCompare(String(b.body.id))),actions=ordered.map(r=>[r.body.result.output.action,r.body.result.output.toolCall?.name??null]);
  requireThat(hash(actions)===hash([['tool','workspace.replace'],['tool','workspace.replace'],['tool','workspace.replace'],['tool','workspace.replace'],['tool','workspace.replace'],['tool','check.run'],['tool','artifact.publish_local']]),'FINALIZATION_PARENT_SEQUENCE_CHANGED');
  const pending=rows(db,'portfolio-step').filter(r=>r.body.taskId===parentTaskId&&r.body.status!=='completed');
  const requests=rows(db,'portfolio-model-request').filter(r=>r.key.startsWith(parentTaskId+'/')),results=rows(db,'portfolio-model-result').filter(r=>r.key.startsWith(parentTaskId+'/'));
  const recoveryIntents=rows(db,'portfolio-recovery-intent').filter(r=>r.body.grantHash===grantHash||r.body.taskId===parentTaskId),recoveryLinks=rows(db,'portfolio-recovery-link').filter(r=>r.body.grantHash===grantHash||r.body.taskId===parentTaskId);
  requireThat(!pending.length&&requests.length===7&&results.length===7&&!recoveryIntents.length&&!recoveryLinks.length,'FINALIZATION_PARENT_PENDING_ACTIVITY');
  const workspaces=rows(db,'local-workspace').filter(r=>r.body.taskId===parentTaskId);requireThat(workspaces.length===1,'FINALIZATION_PARENT_WORKSPACE_COUNT');
  const workspace=workspaces[0].body,brief=workspace.files?.find((f:any)=>f.path==='brief.json')?.content,published=workspace.published;
  requireThat(typeof brief==='string'&&Buffer.byteLength(brief)===17908&&workspace.checkedManifest===workspace.manifest.sha256&&published?.manifestHash===workspace.manifest.sha256&&published?.payloadHash===published?.ref?.sha256&&workspace.checks?.length>0&&workspace.checks.every((c:any)=>c.passed),'FINALIZATION_PARENT_DELIVERY_CHANGED');
  const delivery=artifactRow(db,scopeKey({tenantId:'mason',businessId:'quote-desk',runId:'portfolio-v1',dataPolicyVersion:'portfolio-local-v1',mode:'fixture'}),published.ref.id);
  const deliveredSource=delivery?.body.files&&workspace.files.map((file:any)=>delivery.body.files.find((candidate:any)=>candidate.path===file.path));
  requireThat(delivery&&deliveredSource?.every(Boolean)&&delivery.sha256===published.ref.sha256&&hash(delivery.body)===published.payloadHash&&delivery.body.manifest?.sha256===workspace.manifest.sha256&&hash(deliveredSource)===hash(workspace.files)&&hash(delivery.body.checks)===hash(workspace.checks),'FINALIZATION_PARENT_READBACK_CHANGED');
  const prior=grant.continuation.historical,reserved=prior.reservedMinor+attempts.reduce((n,r)=>n+r.body.reservation,0),provisional=prior.provisionalMinor+attempts.reduce((n,r)=>n+r.body.cost.money.minorUnits,0);
  const historical:HistoricalExposure={admissions:prior.admissions+attempts.length,counts:prior.counts+attempts.length,reservedMinor:reserved,provisionalMinor:provisional,settledMinor:prior.settledMinor,countBufferMinor:prior.countBufferMinor};
  requireThat(hash(historical)===hash({admissions:8,counts:8,reservedMinor:984,provisionalMinor:384,settledMinor:0,countBufferMinor:400})&&inner.limits.totalMinor===5182&&inner.limits.astraCountRequests===35&&inner.limits.overheadReserve?.minor===400&&inner.limits.carryIn?.length===1,'FINALIZATION_PARENT_EXPOSURE_CHANGED');
  return {grant,inner,grantFileHash:rawHash(bytes),attemptsHash:hash(attempts),bindingsHash:hash(bindings),accountHash:hash(account),tasksHash:hash(tasks),workspaceHash:hash(workspace),deliveryHash:hash(delivery.body),workspace,delivery:delivery.body,brief,taskId:parentTaskId,tasks,historical,
   retired:entity(db,'portfolio-revocation',grantHash),operatingRetired:entity(db,'operating-revocation',hash(inner))};
 }finally{db.close();}
}
export function continuationCarry(c:DraftContinuation){return [{id:c.kind==='portfolio-v4-artifact-continuation-r2'?c.carryId:c.parentAttemptId,exposureMinor:c.historical.reservedMinor,evidenceHash:c.attemptsHash}];}

/** Run before signing and every prospective call. Fail closed on new historical
 * activity, missing evidence, altered scope, or a competing continuation. */
export function validateContinuation(g:PortfolioGrant,publicKey:string,requireRetired:boolean){
 const c=g.continuation;if(!c)return null;
 if(c.kind==='portfolio-v4-artifact-continuation-r2')return validateArtifactContinuation(g,c,publicKey,requireRetired);
 requireThat(c.kind==='portfolio-v4-draft-continuation-r1'&&resolve(c.parentRoot)!==g.root&&c.combinedCeilingMinor===5182&&c.combinedAdmissionLimit===36,'CONTINUATION_SCOPE');
 const p=inspectContinuationParent(c.parentRoot,publicKey);
 requireThat(hash(JSON.parse(readFileSync(join(c.parentRoot,'proposal',p.grant.id,'portfolio.authorization.request.json'),'utf8')))===c.parentProposalHash,'CONTINUATION_PARENT_PROPOSAL_CHANGED');
 requireThat(p.grantFileHash===c.parentGrantFileHash&&hash(p.grant)===c.parentGrantHash&&hash(p.inner)===c.parentOperatingHash&&p.attemptsHash===c.attemptsHash&&p.bindingsHash===c.bindingsHash&&p.accountHash===c.accountHash&&p.workspaceHash===c.parentWorkspaceHash,'CONTINUATION_PARENT_CHANGED');
 requireThat(p.taskId===c.parentTaskId&&p.attemptId===c.parentAttemptId&&rawHash(p.draft)===c.draftHash&&Buffer.byteLength(p.draft)===c.draftBytes&&c.draftBytes>18000&&c.draftBytes<=30000&&hash(p.historical)===hash(c.historical),'CONTINUATION_DRAFT_CHANGED');
 requireThat(p.grant.projectId===g.projectId&&p.grant.credentialFile===g.credentialFile&&p.grant.mode===g.mode&&p.grant.expiresAt===g.expiresAt&&hash(p.grant.procedureHashes)===hash(g.procedureHashes)&&hash({...p.grant.route,authorizationId:g.id})===hash(g.route)&&hash(p.grant.recovery)===hash(g.recovery),'CONTINUATION_AUTHORITY_CHANGED');
 requireThat(p.inner.limits.totalMinor===c.combinedCeilingMinor&&p.inner.limits.astraCountRequests===c.combinedAdmissionLimit&&g.countUncertaintyMinor===c.historical.countBufferMinor,'CONTINUATION_CEILING_CHANGED');
 requireThat(g.ventures.length===1&&hash(g.ventures)===hash(p.grant.ventures.map(v=>({...v,workCalls:v.workCalls-1})))&&c.tasks.length===6&&new Set(c.tasks.map(t=>t.parentId)).size===6&&new Set(c.tasks.map(t=>t.id)).size===6,'CONTINUATION_ALLOCATION_CHANGED');
 for(const t of c.tasks){const old=p.grant.tasks?.find(a=>a.id===t.parentId),next=g.tasks?.find(a=>a.id===t.id);requireThat(old&&next&&t.id===t.parentId+'-r1'&&next.workCalls===t.workCalls&&t.workCalls===old.workCalls-(t.parentId===c.parentTaskId?1:0),'CONTINUATION_TASK_CAP');}
 requireThat(g.tasks?.length===6&&c.taskId===c.parentTaskId+'-r1'&&g.initialRequests?.length===1&&g.initialRequests[0].taskId===c.taskId,'CONTINUATION_INITIAL_REQUIRED');
 const expected={continuationId:g.id,continuationRoot:g.root,continuationGrantHash:hash(g)};
 for(const r of [p.retired,p.operatingRetired]){if(r)requireThat(Object.entries(expected).every(([k,v])=>r[k]===v),'CONTINUATION_ALREADY_CLAIMED');else requireThat(!requireRetired,'CONTINUATION_PARENT_RETIREMENT_REQUIRED');}
 return p;
}

function validateArtifactContinuation(g:PortfolioGrant,c:ArtifactContinuation,publicKey:string,requireRetired:boolean){
 requireThat(resolve(c.parentRoot)!==g.root&&c.combinedCeilingMinor===4582&&c.combinedAdmissionLimit===34&&c.originalCeilingMinor===5182&&c.originalAdmissionLimit===36&&c.briefBytes===17908&&c.historical.admissions===8&&c.historical.counts===8&&c.historical.reservedMinor===984&&c.historical.provisionalMinor===384&&c.historical.settledMinor===0&&c.historical.countBufferMinor===400,'FINALIZATION_CONTINUATION_SCOPE');
 const p=inspectFinalizationParent(c.parentRoot,publicKey),proposal=JSON.parse(readFileSync(join(c.parentRoot,'proposal',p.grant.id,'portfolio.authorization.request.json'),'utf8'));
 requireThat(hash(proposal)===c.parentProposalHash&&p.grantFileHash===c.parentGrantFileHash&&hash(p.grant)===c.parentGrantHash&&hash(p.inner)===c.parentOperatingHash&&p.attemptsHash===c.attemptsHash&&p.bindingsHash===c.bindingsHash&&p.accountHash===c.accountHash&&p.tasksHash===c.parentTasksHash&&p.workspaceHash===c.parentWorkspaceHash&&p.deliveryHash===c.deliveryHash,'FINALIZATION_PARENT_CHANGED');
 requireThat(p.taskId===c.parentTaskId&&p.workspace.manifest.sha256===c.manifestHash&&p.workspace.published.payloadHash===c.payloadHash&&rawHash(p.brief)===c.briefHash&&Buffer.byteLength(p.brief)===c.briefBytes&&hash(p.historical)===hash(c.historical),'FINALIZATION_DELIVERY_CHANGED');
 requireThat(p.grant.projectId===g.projectId&&p.grant.credentialFile===g.credentialFile&&p.grant.mode===g.mode&&p.grant.expiresAt===g.expiresAt&&hash({...p.grant.route,authorizationId:g.id})===hash(g.route)&&hash(p.grant.recovery)===hash(g.recovery),'FINALIZATION_AUTHORITY_CHANGED');
 const expectedCalls=26,ordinary=24,spend=3198,total=spend+c.historical.reservedMinor+c.historical.countBufferMinor;
 requireThat(g.countUncertaintyMinor===400&&g.recovery.maxAdmissions===2&&total===c.combinedCeilingMinor&&total<=c.originalCeilingMinor&&expectedCalls+c.historical.admissions===c.combinedAdmissionLimit&&c.combinedAdmissionLimit<=c.originalAdmissionLimit,'FINALIZATION_COMBINED_CAP');
 requireThat(g.ventures.length===1&&g.ventures[0].id==='quote-desk'&&g.ventures[0].goalHash===p.grant.ventures[0].goalHash&&g.ventures[0].workCalls===expectedCalls&&g.ventures[0].searchCalls===0&&g.tasks?.length===5&&g.tasks.reduce((n,t)=>n+t.workCalls,0)===ordinary,'FINALIZATION_ALLOCATION_CHANGED');
 const expected=new Map([['quote-desk/decide-v4-r1',1],['quote-desk/build-v4-r1',10],['quote-desk/review-product-v4-r1',6],['quote-desk/operate-v4-r1',6],['quote-desk/adapt-v4-r1',1]]);
 requireThat(c.tasks.length===5&&new Set(c.tasks.map(t=>t.parentId)).size===5&&new Set(c.tasks.map(t=>t.id)).size===5,'FINALIZATION_TASK_MAPPING');
 for(const t of c.tasks){const old=p.grant.tasks?.find(a=>a.id===t.parentId),next=g.tasks!.find(a=>a.id===t.id);requireThat(old&&next&&expected.get(t.parentId)===t.workCalls&&old.workCalls===t.workCalls&&t.id===t.parentId.replace(/-r1$/,'-r2')&&next.workCalls===t.workCalls,'FINALIZATION_TASK_CAP');}
 const decision='quote-desk/decide-v4-r2';requireThat(g.initialRequests?.length===1&&g.initialRequests[0].taskId===decision&&c.tasks.find(t=>t.parentId==='quote-desk/decide-v4-r1')?.id===decision,'FINALIZATION_INITIAL_REQUIRED');
 const db=new DatabaseSync(join(g.root,'portfolio.sqlite'),{readOnly:true});try{
  const artifact=entity(db,'portfolio-artifact',c.artifactId),decisionTask=entity(db,'portfolio-task',decision);
  requireThat(artifact&&artifact.sha256===c.artifactHash&&artifact.version===1&&artifact.ventureId==='quote-desk'&&artifact.metadata?.manifestHash===c.manifestHash&&artifact.metadata?.preservedSource?.taskId===c.parentTaskId&&artifact.metadata.preservedSource.payloadHash===c.payloadHash&&artifact.metadata.preservedSource.grantHash===c.parentGrantHash&&artifact.content?.manifest?.sha256===c.manifestHash,'FINALIZATION_ARTIFACT_CHANGED');
  requireThat(decisionTask?.dependsOn.length===0&&decisionTask.inputArtifacts.length===1&&decisionTask.inputArtifacts[0].artifactId===c.artifactId&&decisionTask.inputArtifacts[0].version===1&&decisionTask.inputArtifacts[0].sha256===c.artifactHash,'FINALIZATION_ARTIFACT_BINDING');
 }finally{db.close();}
 const expectedRetirement={continuationId:g.id,continuationRoot:g.root,continuationGrantHash:hash(g)};
 for(const r of [p.retired,p.operatingRetired]){if(r)requireThat(Object.entries(expectedRetirement).every(([k,v])=>r[k]===v),'CONTINUATION_ALREADY_CLAIMED');else requireThat(!requireRetired,'CONTINUATION_PARENT_RETIREMENT_REQUIRED');}
 return p;
}

/** Called only by exact-owner-approved signing. Append retirement markers; do
 * not edit the historical grant, attempts, task states, source or records. */
export function retireContinuationParent(g:PortfolioGrant,publicKey:string){
 if(g.continuation)requireThat(g.approved===true&&g.approvedBy.length>0&&g.approvalReference.length>0,'CONTINUATION_EXPLICIT_APPROVAL_REQUIRED');
 const p=validateContinuation(g,publicKey,false);if(!p)return;
 const store=new StateStore(join(g.continuation!.parentRoot,'portfolio.sqlite'));
 try{store.transaction(()=>{validateContinuation(g,publicKey,false);for(const [kind,key]of [['portfolio-revocation',hash(p.grant)],['operating-revocation',hash(p.inner)]]){
  const old=store.get(kind,key);if(old){requireThat(old.continuationGrantHash===hash(g),'CONTINUATION_ALREADY_CLAIMED');continue;}
  store.put(kind,key,{continuationId:g.id,continuationRoot:g.root,continuationGrantHash:hash(g),approvalReference:g.approvalReference,retiredAt:new Date().toISOString(),reason:'Explicit exact continuation supersedes execution authority only; historical evidence and exposure preserved.'},null);
 }});}finally{store.close();}
 validateContinuation(g,publicKey,true);
}

/** The exception is solely for reading the exact inherited failed draft. All
 * new writes, checks, publication and downstream handoffs keep the 18 KB limit. */
export function inheritedDraftFeedback(store:StateStore,task:any,workspace:any){
 const c=task.inputs?.draftContinuation;if(!c)return null;
 requireThat(c.kind==='preserved-draft-correction-v1'&&task.id===c.taskId&&workspace?.kind==='service','CONTINUATION_WORKSPACE_SCOPE');
 const original=store.db.prepare("SELECT body FROM entities WHERE kind='local-workspace'").all().map(r=>JSON.parse(String(r.body))).find(w=>w.taskId===c.parentTaskId);
 const draft=original?.files.find((f:any)=>f.path==='brief.json')?.content;
 requireThat(typeof draft==='string'&&rawHash(draft)===c.sha256&&Buffer.byteLength(draft)===c.bytes,'CONTINUATION_PRESERVED_SOURCE_CHANGED');
 const current=workspace.files.find((f:any)=>f.path==='brief.json')?.content,unchanged=current===draft;
 return {kind:c.kind,parentTaskId:c.parentTaskId,parentAttemptId:c.parentAttemptId,preservedDraftHash:c.sha256,originalBytes:c.bytes,limitBytes:18000,measurement:'brief.json raw UTF-8 bytes',inheritedUnchanged:unchanged,
  instruction:'The previous response completed, but this exact draft exceeded the visible 18000-byte handoff limit. The unchanged original is preserved. Correct your own draft in workspace.currentSource using workspace.replace and its current hash; keep all required fields, source support and substantive answers, while shortening to <=18000 raw UTF-8 bytes. Inspect the supplied prospective product contract and revise unsupported recommendations yourself. No approval snapshots or unsupported features exist in that profile. Check, publish locally, and complete the corrected current report. This investigation starts with seven remaining ordinary decisions, including correction/check/publication/completion; context.remaining reports the current balance. This is continuation capacity, not a retry or restored allowance. A supported build rejection remains valid.'};
}
