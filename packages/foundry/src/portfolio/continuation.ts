/** Explicit Mission 031 draft continuation. Historical authority is retired,
 * never transferred; historical attempts remain immutable, conservatively held. */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {hash,rawHash,requireThat,scopeKey} from '../contracts.ts';
import {verified} from '../experiment/config.ts';
import {StateStore} from '../state.ts';
import type {PortfolioGrant} from './live.ts';

export type DraftContinuation={
 kind:'portfolio-v4-draft-continuation-r1';parentRoot:string;parentGrantFileHash:string;parentGrantHash:string;parentOperatingHash:string;parentProposalHash:string;
 backupManifestHash:string;attemptsHash:string;bindingsHash:string;accountHash:string;parentWorkspaceHash:string;
 parentTaskId:string;parentAttemptId:string;draftHash:string;draftBytes:number;taskId:string;
 historical:{admissions:number;counts:number;reservedMinor:number;provisionalMinor:number;settledMinor:number;countBufferMinor:number};
 combinedCeilingMinor:number;combinedAdmissionLimit:number;
 tasks:Array<{parentId:string;id:string;workCalls:number}>;
};
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
export function continuationCarry(c:DraftContinuation){return [{id:c.parentAttemptId,exposureMinor:c.historical.reservedMinor,evidenceHash:c.attemptsHash}];}

/** Run before signing and every prospective call. Fail closed on new historical
 * activity, missing evidence, altered scope, or a competing continuation. */
export function validateContinuation(g:PortfolioGrant,publicKey:string,requireRetired:boolean){
 const c=g.continuation;if(!c)return null;
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
