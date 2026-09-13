/** Dynamic, bounded operating calls using the established Responses and ledger ports.
 * Authorization freezes the goal/tool envelope; each derived request is frozen by exact
 * bytes before admission. Mock transports never obtain credentials or fall through. */
import { hostname } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../state.ts';
import { hash, canonical, rawHash, requireThat, scopeKey, assertScope, identifier, safeInteger } from '../contracts.ts';
import type { Scope, Principal, ModelRequest, ModelResult } from '../contracts.ts';
import { buildResponsesBody, responsesModelPort } from '../model-port.ts';
import type { ResponsesRoute } from '../model-port.ts';
import { ModelLedger } from '../experiment/ledger.ts';
import type { Limits } from '../experiment/ledger.ts';
import { verified } from '../experiment/config.ts';
import { countTokens,assertCountableRequest } from '../experiment/token-count.ts';

export type OperatingGrant = {
    kind:'operations-model-grant-v1'; mode:'mock'|'live'; root:string; host:string;
    implementationHash:string; projectId:string; credentialFile:string|null;
    expiresAt:string; approvedBy:string; approvalReference:string;
    billingPublicKey?:string|null;
    countRequestByteCeiling?:196608;
    recovery?:{version:'known-incomplete-v1';maxAdmissions:2};
    learningGate?:'consequential-job-v1';
    accountScope:Scope; route:ResponsesRoute; limits:Limits;
    businesses:Array<{id:string; goalHash:string; sourceHosts:string[]; maxCalls:number;draftOnly?:boolean}>;
    retries:0; providerConcurrency:1; countDeadlineMs:10000; externalAuthority:false;
};
export function implementationHash() {
    const here=dirname(fileURLToPath(import.meta.url));
    return hash(['model.ts','contracts.ts','manager.ts','research.ts','mail.ts','learning.ts','communication.ts','study.ts','trusted.ts','launch.ts','server.ts','cli.ts','../model-port.ts','../state.ts','../experiment/ledger.ts','../experiment/token-count.ts','../experiment/config.ts'].map(p=>readFileSync(join(here,p),'utf8').replace(/\r\n/g,'\n')));
}
export type Invocation = {businessId:string;goalHash:string;sourceHosts:string[];attemptId:string;stage:string;recoveryOf?:string;request:ModelRequest;schema:any;validate:(out:any)=>void};
export const recoveryInstruction='The previous response ended incomplete. Produce a concise but complete answer within the unchanged output limit. Preserve all required evidence, fields, uncertainty and authority constraints. Do not infer the missing completion or invent facts.';
export class OperatingModels {
    readonly store:StateStore; readonly grant:OperatingGrant; readonly ledger:ModelLedger;
    readonly transport:typeof fetch; readonly credential:()=>string;
    afterResponsePersisted?:()=>void;
    constructor(options:{store:StateStore;root:string;envelope:any;trustedPublicKey:string;execution:{kind:'mock';transport:typeof fetch}|{kind:'live';credential:()=>string;transport:typeof fetch}}) {
        this.store=options.store;
        const g=verified(options.envelope,options.trustedPublicKey) as OperatingGrant;
        requireThat(g.kind==='operations-model-grant-v1'&&g.root===resolve(options.root)&&g.host===hostname(),'OPERATING_GRANT_LOCATION');
        requireThat(g.mode===options.execution.kind&&g.implementationHash===implementationHash(),'OPERATING_GRANT_IMPLEMENTATION');
        requireThat(g.retries===0&&g.providerConcurrency===1&&g.countDeadlineMs===10000&&g.externalAuthority===false,'OPERATING_GRANT_AUTHORITY');
        requireThat(g.countRequestByteCeiling===undefined||g.countRequestByteCeiling===196608,'OPERATING_COUNT_BYTE_LIMIT');
        requireThat(g.approvedBy.length>0&&g.approvalReference.length>0&&Number.isFinite(Date.parse(g.expiresAt)),'OPERATING_GRANT_APPROVAL');
        requireThat(g.route.deadlineMs>0&&g.route.deadlineMs<=180000&&g.route.serviceTier==='default'&&g.route.maxCallCost.currency==='USD','OPERATING_ROUTE_LIMIT');
        requireThat(g.limits.concurrency===1&&g.limits.astraCountRequests!==undefined,'OPERATING_AGGREGATE_REQUIRED');
        requireThat(new Set(g.businesses.map(b=>b.id)).size===g.businesses.length&&g.businesses.length>0,'OPERATING_BUSINESS_SCOPE');
        for(const b of g.businesses){identifier(b.id);safeInteger(b.maxCalls);requireThat(/^[a-f0-9]{64}$/.test(b.goalHash),'OPERATING_GOAL_HASH');}
        if(g.recovery)requireThat(g.recovery.version==='known-incomplete-v1'&&g.recovery.maxAdmissions===2&&(g.limits.allocations??[]).some(a=>a.metadataKey==='stage'&&a.value==='recovery'&&a.attempts===2),'OPERATING_RECOVERY_LIMIT');
        const allocations=(g.limits.allocations??[]).filter(a=>a.metadataKey==='businessId');
        requireThat(allocations.length===g.businesses.length&&(g.limits.allocations??[]).every(a=>['businessId','stage'].includes(a.metadataKey)),'OPERATING_ALLOCATION_REQUIRED');
        requireThat(new Set(allocations.map(a=>a.value)).size===allocations.length&&allocations.every(a=>{const business=g.businesses.find(b=>b.id===a.value);return Boolean(business)&&a.attempts===business!.maxCalls&&a.minor>=a.attempts*g.route.maxCallCost.minorUnits;}),'OPERATING_ALLOCATION_SCOPE');
        const allocationMinor=allocations.reduce((sum,a)=>sum+a.minor,0),allocationAttempts=allocations.reduce((sum,a)=>sum+a.attempts,0);
        requireThat(allocationMinor<=g.limits.stages.development.minor&&allocationMinor<=g.limits.totalMinor&&allocationAttempts<=g.limits.stages.development.attempts&&allocationAttempts<=g.limits.astraCountRequests!,'OPERATING_ALLOCATION_BUDGET');
        requireThat(typeof options.execution.transport==='function','EXPLICIT_TRANSPORT_REQUIRED');
        this.grant=g;this.transport=options.execution.transport;
        this.credential=options.execution.kind==='mock'?()=> 'OFFLINE-MOCK-NOT-A-CREDENTIAL':options.execution.credential;
        this.ledger=new ModelLedger(this.store,g.accountScope,hash(g),g.limits);
    }
    recoveryEligible(id:string){
        const r=this.ledger.get(id),o=r?.observation;
        return Boolean(this.grant.recovery&&r?.finishedAt&&r.errorCode==='MODEL_RESPONSE_INCOMPLETE'&&o?.status==='incomplete'&&o.model===this.grant.route.model&&o.providerRequestId&&Number.isSafeInteger(o.inputTokens)&&Number.isSafeInteger(o.outputTokens)&&r.cost?.status==='provisional'&&!r.metadata.recoveryOf&&['investigate','review'].includes(r.metadata.stage));
    }
    async invoke(principal:Principal,x:Invocation):Promise<ModelResult> {
        assertScope(principal,x.request.scope,'operate');identifier(x.attemptId);
        const g=this.grant,b=g.businesses.find(b=>b.id===x.businessId);
        requireThat(b&&principal.businessId===b.id&&x.goalHash===b.goalHash&&hash([...x.sourceHosts].sort())===hash([...b.sourceHosts].sort()),'OPERATING_BUSINESS_NOT_GRANTED');
        requireThat(x.request.role.model===g.route.model,'OPERATING_MODEL_MISMATCH');
        const stages=(g.limits.allocations??[]).filter(a=>a.metadataKey==='stage');
        requireThat(stages.length===0||stages.some(a=>a.value===x.stage),'OPERATING_STAGE_NOT_GRANTED');
        if(g.learningGate&&['procedure-source','procedure-comparison'].includes(x.stage)){
            const work=this.store.get('operating-business',b.id),gate=this.store.get('operating-improvement-case',b.id);
            requireThat(gate&&work?.draft&&gate.draftHash===hash(work.draft)&&gate.reviewHash===hash(work.reviews.at(-1)),'CONSEQUENTIAL_IMPROVEMENT_CASE_REQUIRED');
        }
        const request={...x.request,scope:g.accountScope,requestId:x.attemptId};
        const bytes=canonical(buildResponsesBody(g.route,request,x.schema)),digest=rawHash(bytes),key=scopeKey(g.accountScope)+'/'+x.attemptId;
        assertCountableRequest(JSON.parse(bytes),g.countRequestByteCeiling??65536);
        const prior=this.ledger.get(x.attemptId),saved=this.store.get('operating-response',key);
        if(prior){
            requireThat(prior.requestHash===digest&&prior.metadata.businessId===b.id,'OPERATING_REQUEST_CHANGED');
            requireThat(saved&&!prior.errorCode,'OPERATING_UNCERTAIN_NO_RETRY');
            x.validate(saved.result.output);
            if(!prior.finishedAt)this.ledger.finish(x.attemptId,saved.result,null);
            return saved.result;
        }
        requireThat(Date.parse(g.expiresAt)>Date.now(),'OPERATING_GRANT_EXPIRED');
        requireThat(!this.store.get('operating-revocation',hash(g)),'OPERATING_GRANT_REVOKED');
        requireThat(this.ledger.rows().filter(r=>r.metadata.businessId===b.id).length<b.maxCalls,'OPERATING_BUSINESS_CALL_CAP');
        requireThat((x.stage==='recovery')===Boolean(x.recoveryOf),'OPERATING_RECOVERY_LINK_REQUIRED');
        if(x.recoveryOf){
            requireThat(this.recoveryEligible(x.recoveryOf),'OPERATING_RECOVERY_INELIGIBLE');
            const parent=this.ledger.get(x.recoveryOf),rawParent=this.store.get('operating-request',x.recoveryOf+'-request');
            requireThat(parent.metadata.businessId===b.id&&rawParent,'OPERATING_RECOVERY_SCOPE');
            const expected=JSON.parse(rawParent.bytes);const priorInput=JSON.parse(expected.input);priorInput.context={...priorInput.context,recoveryInstruction};expected.input=canonical(priorInput);
            requireThat(canonical(expected)===bytes,'OPERATING_RECOVERY_REQUEST_CHANGED');
        }
        const budget=this.ledger.port('development',{businessId:b.id,stage:x.stage,recoveryOf:x.recoveryOf??null,source:g.mode==='mock'?'offline_mock':'actual-model',goalHash:b.goalHash});
        const prepare=budget.prepare!;
        budget.prepare=async(r,amount,d,raw)=>{
            requireThat(raw===bytes&&d===digest,'OPERATING_BYTES_CHANGED');
            if(x.recoveryOf)this.store.transaction(()=>{
                // An immutable claim prevents competing fresh identities from replacing
                // the same failed request, including across process interruption.
                const linkKey=scopeKey(g.accountScope)+'/'+x.recoveryOf,old=this.store.get('operating-recovery-link',linkKey);
                requireThat(!old||old.attemptId===x.attemptId,'OPERATING_RECOVERY_ALREADY_CLAIMED');
                if(!old)this.store.put('operating-recovery-link',linkKey,{attemptId:x.attemptId,parent:x.recoveryOf,requestHash:d,correction:recoveryInstruction},null);
            });
            // Preserve immutable exact request evidence before the ledger admits any cost.
            // Recovery may see a denied/pre-admission record, but can never lose the bytes
            // of an admitted provider request.
            this.store.transaction(()=>{const key=x.attemptId+'-request',old=this.store.get('operating-request',key),record={bytes:raw,requestHash:d,businessId:b.id,grantHash:hash(g),source:g.mode};if(old)requireThat(old.requestHash===d&&old.businessId===b.id&&old.bytes===raw,'OPERATING_REQUEST_CHANGED');else this.store.put('operating-request',key,record,null);});
            await prepare(r,amount,d,raw);
        };
        const port=responsesModelPort({route:{...g.route,projectId:g.projectId},apiKey:this.credential,budget,transport:this.transport,schemaForTask:()=>x.schema,validateOutput:(_task,out)=>x.validate(out),countInputTokens:(body,r)=>countTokens(body,g.projectId,this.credential(),async(event)=>budget.observed?.(r!,{tokenCount:event}),this.transport,g.countRequestByteCeiling??65536)});
        try{
            const result=await port.run(request);
            this.store.transaction(()=>this.store.put('operating-response',key,{result,requestHash:digest,provenance:g.mode==='mock'?'offline_mock':'actual-model'},null));
            this.afterResponsePersisted?.();
            this.ledger.finish(x.attemptId,result,null);return result;
        }catch(e){
            const row=this.ledger.get(x.attemptId);
            if(row&&!row.finishedAt&&!this.store.get('operating-response',key))this.ledger.finish(x.attemptId,null,(e as any).code??'OPERATING_MODEL_FAILED');
            throw e;
        }
    }
    totals(){const t=this.ledger.totals(),g=this.grant;return {callsUsed:t.attempts,callLimit:g.limits.stages.development.attempts,retainedMinor:t.reserved+this.ledger.carryExposure(),provisionalMinor:t.provisional,settledMinor:t.settled||null,providerRequests:g.mode==='live'?this.ledger.rows().filter(x=>x.inferenceDispatchIntent).length:0,mode:g.mode,remainingMinor:g.limits.totalMinor-t.reserved-t.settled-this.ledger.carryExposure(),countBufferMinor:g.limits.overheadReserve?.minor??0,currency:'USD'};}
}
