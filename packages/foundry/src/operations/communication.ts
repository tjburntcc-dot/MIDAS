import { randomUUID, sign, verify } from 'node:crypto';
import { canonical, hash, requireThat, scopeKey } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { MailOutbox,recipientEvidenceHash } from './mail.ts';
import type { MailTransport,TransportMessage,TransportInboundEvent,PollThreadRequest,SignedMailGrant } from './mail.ts';
import { owner } from './manager.ts';
import type { OperatingBusiness,OperatingCommunication } from './manager.ts';

/** Mock provider effects live in separate durable tables, so a restarted runtime can
 * reconcile a deliberately lost acknowledgement against actual mock service state. */
export class DurableMockMail implements MailTransport {
    readonly channel='gmail' as const;readonly mode='mock' as const;readonly store:StateStore;
    fault:'none'|'lose-response'='none';
    constructor(store:StateStore){this.store=store;}
    async send(m:TransportMessage){
        const prior=this.store.get('mock-mail-provider',m.messageId);
        requireThat(!prior,'MOCK_PROVIDER_DUPLICATE_EFFECT');
        const result={id:'mock-'+hash(m).slice(0,20),threadId:m.threadId??'mock-thread-'+hash(m.messageId).slice(0,20)};
        this.store.transaction(()=>this.store.put('mock-mail-provider',m.messageId,{message:m,result},null));
        if(this.fault==='lose-response')throw Error('MOCK_LOST_ACK');return result;
    }
    async findSentByMessageId(id:string){const p=this.store.get('mock-mail-provider',id);return p?{status:'found' as const,...p.result}:{status:'absent' as const};}
    async pollThread(r:PollThreadRequest){return {status:'ok' as const,events:this.store.db.prepare("SELECT body FROM entities WHERE kind='mock-mail-inbound'").all().map(x=>JSON.parse(String(x.body))).filter(x=>x.threadId===r.threadId).slice(0,r.maxResults)};}
    inject(event:TransportInboundEvent){this.store.transaction(()=>this.store.put('mock-mail-inbound',event.id,event,null));}
}
export type CommunicationAuthority={mode:'mock'|'live';sender:string;permittedRecipients:string[];expiresAt:string;maxMessages:number;maxPolls:number;minimumIntervalSeconds:number;maxFollowUpsPerThread:number;approvalReference:string;eligibilityBasis:string;businessIds:string[]};
/** Constructor input comes from trusted signed server configuration; never model output.
 * Live enabling also requires the channel authority signature verified by the server. */
export class OperatingMail implements OperatingCommunication {
    readonly store:StateStore;readonly outbox:MailOutbox;readonly authority:CommunicationAuthority;readonly transport:MailTransport;
    private readonly privateKey:string;
    constructor(store:StateStore,transport:MailTransport,authority:CommunicationAuthority,keys:{publicKey:string;privateKey:string}){
        requireThat(authority.mode===transport.mode&&authority.maxMessages>0&&authority.maxMessages<=20&&authority.maxPolls>0&&authority.maxPolls<=100,'COMMUNICATION_LIMIT_REQUIRED');
        requireThat(authority.approvalReference.length>0&&authority.eligibilityBasis.length>0&&Number.isFinite(Date.parse(authority.expiresAt)),'COMMUNICATION_AUTHORITY_REQUIRED');
        this.store=store;this.authority=authority;this.transport=transport;this.privateKey=keys.privateKey;
        this.outbox=new MailOutbox(store,transport,g=>g.signature.algorithm==='Ed25519'&&verify(null,Buffer.from(canonical(g.payload)),keys.publicKey,Buffer.from(g.signature.value,'base64')));
    }
    private access(b:OperatingBusiness){requireThat(this.authority.businessIds.includes(b.id)&&(b.mode==='offline')===(this.authority.mode==='mock'),'COMMUNICATION_BUSINESS_SCOPE');}
    private account(){return 'channel-'+hash(this.authority);}
    private admit(kind:'send'|'poll',b:OperatingBusiness){this.access(b);requireThat(Date.parse(this.authority.expiresAt)>Date.now(),'COMMUNICATION_AUTHORITY_EXPIRED');this.store.transaction(()=>{const key=this.account(),old=this.store.get('communication-account',key),next={send:old?.send??0,poll:old?.poll??0};requireThat(next[kind]<(kind==='send'?this.authority.maxMessages:this.authority.maxPolls),'COMMUNICATION_ACTIVITY_CAP');next[kind]++;this.store.put('communication-account',key,next,old?old._version:null);});}
    queue(b:OperatingBusiness,draft:any){this.access(b);const ids:string[]=[];
        for(const [i,m]of draft.outreach.entries()){
            const s=b.sources.find(s=>s.id===m.recipientSourceId);requireThat(s,'RECIPIENT_SOURCE_MISSING');
            const id='mail-'+hash({business:b.id,revision:b.revision,draft,index:i}).slice(0,20);ids.push(id);
            // Queue may contain prospects outside the approved recipient set; they remain
            // reviewable but cannot be approved or sent under this channel authority.
            if(this.store.get('mail-outbox',scopeKey(b.scope)+'/'+id))continue;
            const evidence={sourceId:s.id,sourceUri:s.url,sourceObservedAt:s.observedAt,sourceContentHash:s.sha256,address:m.to,addressKind:(s.url.startsWith('urn:midas:owner-record:')?'owner_supplied_verified':'published_business_contact') as 'owner_supplied_verified'|'published_business_contact',eligibility:'eligible' as const,eligibilityBasis:m.eligibilityReason.slice(0,1000),policyVersion:b.scope.dataPolicyVersion};
            this.outbox.enqueue(owner(b.id),b.scope,{id,sender:this.authority.sender,recipient:m.to,evidence:{...evidence,evidenceHash:recipientEvidenceHash(evidence)},content:{subject:m.subject,text:m.body,offerRef:b.artifacts.at(-1).id,claimIds:m.sourceIds}});
        }
        this.prepareBatch(b,ids);return ids;
    }
    private prepareBatch(b:OperatingBusiness,ids:string[]){
        if(!ids.length)return;
        const digest=hash(ids),key=b.id+'/'+digest;
        if(this.store.get('operating-mail-batch',key))return;
        const payload=this.outbox.approvalRequest(owner(b.id),b.scope,{grantId:'mail-grant-'+digest.slice(0,20),batchId:'batch-'+digest.slice(0,20),outboxIds:ids,expiresAt:this.authority.expiresAt,envelopeVersion:'communication-v1',minimumIntervalSeconds:this.authority.minimumIntervalSeconds,maxFollowUpsPerThread:this.authority.maxFollowUpsPerThread});
        this.store.transaction(()=>this.store.put('operating-mail-batch',key,{businessId:b.id,payload,batchHash:hash(payload),state:'pending',sourceSnapshot:b.sourceSnapshot,revision:b.revision},null));
    }
    private batches(b:OperatingBusiness){return this.store.db.prepare("SELECT body,version FROM entities WHERE kind='operating-mail-batch'").all().map(r=>({...JSON.parse(String(r.body)),_version:Number(r.version)})).filter(x=>x.businessId===b.id);}
    invalidate(b:OperatingBusiness,reason:string){for(const batch of this.batches(b)){if(batch.state==='invalidated')continue;const grant=this.store.get('mail-grant',scopeKey(b.scope)+'/'+batch.payload.grantId);if(grant)this.outbox.revoke(owner(b.id),b.scope,grant.grantId);this.store.transaction(()=>this.store.put('operating-mail-batch',b.id+'/'+hash(batch.payload.envelope.items.map((x:any)=>x.outboxId)),{...batch,state:'invalidated',reason},batch._version));}}
    approve(b:OperatingBusiness,batchHash:string){this.access(b);requireThat(Date.parse(this.authority.expiresAt)>Date.now(),'COMMUNICATION_AUTHORITY_EXPIRED');const batch=this.batches(b).find(x=>x.batchHash===batchHash);requireThat(batch&&batch.state==='pending'&&batch.revision===b.revision&&batch.sourceSnapshot===b.sourceSnapshot,'BATCH_MISMATCH');
        requireThat(batch.payload.envelope.items.every((m:any)=>this.authority.permittedRecipients.map(x=>x.toLowerCase()).includes(m.recipient.toLowerCase())),'RECIPIENT_OUTSIDE_CHANNEL_AUTHORITY');
        const signed:SignedMailGrant={payload:batch.payload,signature:{algorithm:'Ed25519',keyId:'local-owner',value:sign(null,Buffer.from(canonical(batch.payload)),this.privateKey).toString('base64')}};
        const prior=this.store.get('mail-grant',scopeKey(b.scope)+'/'+batch.payload.grantId);
        if(prior)requireThat(prior.payloadHash===hash(batch.payload)&&!prior.revoked,'BATCH_MISMATCH');
        else this.outbox.approve(owner(b.id),b.scope,signed);
        this.store.transaction(()=>this.store.put('operating-mail-batch',b.id+'/'+hash(batch.payload.envelope.items.map((x:any)=>x.outboxId)),{...batch,state:'approved'},batch._version));
    }
    private async refresh(b:OperatingBusiness,id:string){let row=this.outbox.status(owner(b.id),b.scope,id);if(row.status==='dispatch_unknown'){this.admit('poll',b);row=await this.outbox.reconcile(owner(b.id),b.scope,id);}if(row.status==='provider_accepted'){this.admit('poll',b);row=await this.outbox.poll(owner(b.id),b.scope,id);}return row;}
    private assertFollowUpParent(row:any){requireThat(row.kind==='initial','FOLLOW_UP_MUST_REFERENCE_ORIGINAL');requireThat(row.status!=='authority_failed','FOLLOW_UP_PARENT_AUTHORITY_FAILED');requireThat(row.status==='provider_accepted'&&!row.followUpBlocked,'FOLLOW_UP_BLOCKED');}
    async dispatch(b:OperatingBusiness,batchHash?:string){this.access(b);const batch=this.batches(b).find(x=>x.batchHash===batchHash&&x.state==='approved');const batchIds=batch?.payload.envelope.items.map((x:any)=>x.outboxId)??[];requireThat(batch&&hash([...batchIds].sort())===hash([...b.outboxIds].sort()),'APPROVED_BATCH_REQUIRED');for(const id of batchIds){let row=this.outbox.status(owner(b.id),b.scope,id);if(row.kind==='follow_up'){const parent=await this.refresh(b,row.parentOutboxId);this.assertFollowUpParent(parent);row=this.outbox.status(owner(b.id),b.scope,id);}if(row.status==='dispatch_unknown'){this.admit('poll',b);await this.outbox.reconcile(owner(b.id),b.scope,id);continue;}if(row.status!=='approved')continue;
        const grant=this.store.get('mail-grant',scopeKey(b.scope)+'/'+batch.payload.grantId);
        const waitMs=grant?.lastClaimedAt?Math.max(0,Date.parse(grant.lastClaimedAt)+grant.envelope.cadence.minimumIntervalSeconds*1000-Date.now()):0;
        // Cadence is a wait before admission, not a failed provider attempt. The
        // underlying outbox still atomically verifies the current signed approval.
        requireThat(waitMs<=60000,'MAIL_CADENCE_WAIT_TOO_LONG');
        if(waitMs)await new Promise<void>(done=>setTimeout(done,waitMs));
        const currentBusiness=this.store.get('operating-business',b.id);
        requireThat(!['paused','cancelled'].includes(currentBusiness?.status),'WORK_NOT_RUNNABLE');
        row=this.outbox.status(owner(b.id),b.scope,id);if(row.status!=='approved')continue;
        this.admit('send',b);await this.outbox.dispatch(owner(b.id),b.scope,id);}}
    async poll(b:OperatingBusiness){this.access(b);const ids:string[]=[];for(const id of b.outboxIds){const row=this.outbox.status(owner(b.id),b.scope,id);if(row.parentOutboxId&&!ids.includes(row.parentOutboxId))ids.push(row.parentOutboxId);if(!ids.includes(id))ids.push(id);}for(const id of ids)await this.refresh(b,id);}
    async followup(b:OperatingBusiness,messageId:string){this.access(b);requireThat(this.authority.maxFollowUpsPerThread>0,'FOLLOWUP_NOT_IN_CHANNEL_AUTHORITY');const old=await this.refresh(b,messageId);this.assertFollowUpParent(old);const id='followup-'+randomUUID().slice(0,20);
        this.outbox.enqueue(owner(b.id),b.scope,{id,sender:old.sender,recipient:old.recipient,evidence:old.evidence,content:{...old.content,subject:old.content.subject,text:'Following up on the question below. If it is not relevant, no response is needed.\n\n'+old.content.text},kind:'follow_up',parentOutboxId:messageId});this.prepareBatch(b,[id]);return id;}
    status(b:OperatingBusiness){this.access(b);const rows=this.outbox.status(owner(b.id),b.scope),outbox=rows.map((r:any)=>{const full=this.store.get('mail-outbox',scopeKey(b.scope)+'/'+r.id);return {...r,to:full.recipient,subject:full.content.subject,body:full.content.text};});
        const observations=this.store.events(owner(b.id),b.scope).filter(e=>['mail_provider_accepted','mail_inbound_recorded','mail_recipient_suppressed','mail_reconciliation_unresolved','mail_authority_failed'].includes(e.kind));
        const inbound=this.store.db.prepare("SELECT body FROM entities WHERE kind='mail-inbound-event' AND substr(key,1,?)=?").all((scopeKey(b.scope)+'/').length,scopeKey(b.scope)+'/').map(r=>JSON.parse(String(r.body)));
        const approvals=this.batches(b).filter(x=>x.state==='pending'||x.state==='approved').map(x=>({batchHash:x.batchHash,status:x.state,sender:this.authority.sender,recipients:x.payload.envelope.items.map((i:any)=>i.recipient),messages:x.payload.envelope.items.map((i:any)=>{const row=this.store.get('mail-outbox',scopeKey(b.scope)+'/'+i.outboxId);return {to:row.recipient,subject:row.content.subject,body:row.content.text};}),expiresAt:x.payload.envelope.expiresAt,reason:'Approve the exact draft batch; no demand or outcome is asserted.',simulated:this.authority.mode==='mock',maxMessages:x.payload.envelope.maxVolume,sourceSnapshot:x.sourceSnapshot}));
        return {outbox,approvals,observations:[...observations,...inbound],pendingUnknown:rows.filter((r:any)=>r.status==='dispatch_unknown').length};
    }
}
