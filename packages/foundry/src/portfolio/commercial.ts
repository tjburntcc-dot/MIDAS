/** Preparation and outcome tracking shared by acquisition and delivery. This
 * module cannot access an account or send: connected transport authority remains
 * with the existing signed OperatingMail adapter. */
import { StateStore } from '../state.ts';
import { hash,requireThat } from '../contracts.ts';
import { Portfolio } from './core.ts';
import { portfolioScope } from './contracts.ts';
export class CommercialWork {
 readonly store:StateStore;readonly portfolio:Portfolio;
 constructor(portfolio:Portfolio){this.portfolio=portfolio;this.store=portfolio.store;}
 prepare(input:{ventureId:string;artifactId:string;subject:string;body:string;recipient:string|null;purpose:'interview'|'delivery';consentEvidence:string|null}){
  const artifact=this.store.get('portfolio-artifact',input.artifactId);requireThat(artifact&&artifact.ventureId===input.ventureId,'COMMERCIAL_ARTIFACT_SCOPE');
  requireThat(input.subject.length>0&&input.subject.length<=200&&!/[\r\n]/.test(input.subject)&&input.body.length>0&&input.body.length<=12000,'COMMERCIAL_CONTENT_BOUNDS');
  requireThat(input.recipient===null||/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.recipient),'RECIPIENT_INVALID');
  const proposal={...input,artifactHash:artifact.sha256,authority:'preparation_only',externalExecution:false},id='commercial-'+hash(proposal).slice(0,24);
  const old=this.store.get('portfolio-commercial',id);if(old)return old;
  return this.store.transaction(()=>{const value={...proposal,id,status:input.recipient&&input.consentEvidence?'prepared_for_exact_authorization':'waiting_recipient_and_authority',createdAt:new Date().toISOString(),sentAt:null,acceptedAt:null,obligations:['Exact scoped channel authorization','Permitted account connection','Recipient eligibility evidence','Any promised delivery or reply handling']};this.store.record(portfolioScope(input.ventureId),id,'portfolio.commercial_preparation',value);return this.store.put('portfolio-commercial',id,value,null);});
 }
 recordOutcome(input:{id:string;ventureId:string;kind:'reply'|'delivery_acknowledgment'|'rejection'|'rework'|'activation'|'cancellation'|'owner_observation';text:string;evidenceReference:string;assisted:boolean}){
  requireThat(['reply','delivery_acknowledgment','rejection','rework','activation','cancellation','owner_observation'].includes(input.kind),'OUTCOME_KIND');requireThat(input.text.length>0&&input.evidenceReference.length>0,'OUTCOME_EVIDENCE_REQUIRED');
  // Owner reports may change investigation; they cannot manufacture receipts,
  // confirmed revenue, independent reviewer timing or authoritative billing.
  return this.portfolio.recordObservation(input.ventureId,{id:input.id,kind:input.kind,summary:input.text,source:input.evidenceReference,provenance:input.assisted?'AI-assisted owner report':'owner report; not independently verified',metrics:{independentHumanSeconds:null},reassess:true});
 }
 current(id:string){const p=this.store.get('portfolio-commercial',id);requireThat(p,'COMMERCIAL_PROPOSAL_NOT_FOUND');const a=this.store.get('portfolio-artifact',p.artifactId);return {...p,current:a?.sha256===p.artifactHash,nextAction:a?.sha256===p.artifactHash?p.status:'Rebuild exact proposed message from the revised authoritative artifact; historical approval cannot carry over.'};}
}
export function prepareCommercialPackets(portfolio:Portfolio){
 const commercial=new CommercialWork(portfolio),outputs=portfolio.snapshot().artifacts;const created=[];
 for(const venture of portfolio.snapshot().ventures.filter(v=>v.id==='release-readiness')){const artifact=outputs.find(a=>a.ventureId===venture.id&&a.taskId&&a.kind==='service');if(!artifact)continue;
  created.push(commercial.prepare({ventureId:venture.id,artifactId:artifact.id,subject:'A question about your last release handoff',body:'Hello,\n\nI’m investigating how small web teams decide a client release is ready. I’m preparing a narrowly scoped review service and have not validated demand yet. Could I ask about your last release: what you checked, what escaped review, and whether the handoff caused avoidable work?\n\nThis is a research conversation, not a claim that I found a defect in your site. I can share a sample of the proposed report. If this is not relevant, no reply is needed.\n\nMason',recipient:null,purpose:'interview',consentEvidence:null}));
 }
 return created;
}
