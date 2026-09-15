import {hash,requireThat} from '../contracts.ts';
import {StateStore} from '../state.ts';
import {PilotKnowledge,pilotKnowledgeScope} from './knowledge.ts';
import type {PilotOutcomes} from './outcomes.ts';

export type BusinessMeasurement={name:string;unit:string;baseline:number|null;value:number;sampleSize:number;windowStart:string;windowEnd:string;instrumentation:'checked'|'unchecked';comparison:'before_after'|'controlled'|'none'};
export type BusinessObservationInput={idempotencyKey:string;taskId:string|null;artifactHash:string|null;outcomeId?:string|null;sourceIds:string[];kind:'measurement'|'owner_statement'|'hypothesis'|'pending_feedback';result:'improved'|'no_change'|'worse'|'inconclusive'|'not_useful'|'pending';notes:string;observedAt:string;measurement:BusinessMeasurement|null;assisted:boolean;supersedesId?:string|null};
const text=(value:unknown,max:number)=>requireThat(typeof value==='string'&&value.trim().length>0&&value.length<=max,'OBSERVATION_TEXT_REQUIRED');
const instant=(value:unknown)=>requireThat(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value)),'OBSERVATION_DATE_REQUIRED');
const key=(value:unknown)=>requireThat(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value),'OBSERVATION_IDEMPOTENCY_KEY');

/** Observation memory is scoped to its next mandate, not added to every task's
 * source bundle. Withdrawing it or its cited sources blocks dependent work only. */
export function boundObservationContext(store:StateStore,businessId:string,ids:string[]=[]){
 const knowledge=new PilotKnowledge(store),sources=knowledge.selectedSources(businessId);
 requireThat(Array.isArray(ids)&&ids.length<=8&&new Set(ids).size===ids.length,'OBSERVATION_CONTEXT_BOUNDS');
 return ids.map(id=>{const record=store.get('pilot-business-observation',id);requireThat(record?.businessId===businessId,'OBSERVATION_BUSINESS_SCOPE');
  requireThat(!store.get('pilot-observation-withdrawal',id),'OBSERVATION_WITHDRAWN');
  requireThat(record.sourceIds.every((sourceId:string)=>sources.some(s=>s.id===sourceId&&(!s.validUntil||Date.parse(s.validUntil)>Date.now()))),'OBSERVATION_SOURCE_REVOKED');
  return {id:record.id,taskId:record.taskId,artifactHash:record.artifactHash,sourceIds:record.sourceIds,kind:record.kind,result:record.result,notes:record.notes,observedAt:record.observedAt,measurement:record.measurement,assisted:record.assisted,provenance:record.provenance,interpretation:record.interpretation,supersedesId:record.supersedesId};
 });
}

/** Persists evidence and a resumable request for judgment. The deterministic
 * routing below does not assess causality or authorize a model/effect. */
export class PilotObservationLoop{
 readonly store:StateStore;readonly outcomes:PilotOutcomes;readonly knowledge:PilotKnowledge;
 constructor(store:StateStore,outcomes:PilotOutcomes){this.store=store;this.outcomes=outcomes;this.knowledge=new PilotKnowledge(store);}
 private rows(kind:string){return this.store.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(String(r.body)));}
 record(businessId:string,input:BusinessObservationInput){
  const company=this.knowledge.company(businessId);key(input.idempotencyKey);text(input.notes,4000);instant(input.observedAt);
  requireThat(Date.parse(input.observedAt)<=Date.now()+60000,'OBSERVATION_FUTURE_DATE');
  requireThat(['measurement','owner_statement','hypothesis','pending_feedback'].includes(input.kind)&&['improved','no_change','worse','inconclusive','not_useful','pending'].includes(input.result),'OBSERVATION_CLASSIFICATION');
  requireThat((input.kind==='pending_feedback')===(input.result==='pending'),'OBSERVATION_PENDING_CLASSIFICATION');
  requireThat(typeof input.assisted==='boolean','OBSERVATION_ASSISTANCE_REQUIRED');
  requireThat(Array.isArray(input.sourceIds)&&input.sourceIds.length<=12&&new Set(input.sourceIds).size===input.sourceIds.length&&input.sourceIds.every(s=>typeof s==='string'),'OBSERVATION_SOURCE_SCOPE');
  requireThat(input.taskId===null?input.artifactHash===null:typeof input.taskId==='string'&&typeof input.artifactHash==='string'&&/^[a-f0-9]{64}$/.test(input.artifactHash),'OBSERVATION_ARTIFACT_BINDING');
  const measurement=input.measurement;
  requireThat(input.kind==='measurement'?Boolean(measurement):measurement===null,'OBSERVATION_MEASUREMENT_REQUIRED');
  if(measurement){text(measurement.name,160);text(measurement.unit,100);instant(measurement.windowStart);instant(measurement.windowEnd);requireThat(Date.parse(measurement.windowStart)<=Date.parse(measurement.windowEnd)&&Date.parse(measurement.windowEnd)<=Date.parse(input.observedAt),'OBSERVATION_MEASUREMENT_WINDOW');
   requireThat(Number.isFinite(measurement.value)&&(measurement.baseline===null||(Number.isFinite(measurement.baseline)&&Number.isFinite(measurement.value-measurement.baseline)))&&Number.isSafeInteger(measurement.sampleSize)&&measurement.sampleSize>=0&&measurement.sampleSize<=1000000000,'OBSERVATION_MEASUREMENT_VALUE');
   requireThat(['checked','unchecked'].includes(measurement.instrumentation)&&['before_after','controlled','none'].includes(measurement.comparison),'OBSERVATION_MEASUREMENT_METHOD');
   requireThat((measurement.instrumentation==='checked'&&measurement.sampleSize>0)||input.result==='inconclusive','OBSERVATION_INSTRUMENTATION_INCONCLUSIVE');
  }
  const payload={idempotencyKey:input.idempotencyKey,taskId:input.taskId,artifactHash:input.artifactHash,outcomeId:input.outcomeId??null,sourceIds:[...input.sourceIds].sort(),kind:input.kind,result:input.result,notes:input.notes.trim(),observedAt:input.observedAt,measurement:measurement?{name:measurement.name,unit:measurement.unit,baseline:measurement.baseline,value:measurement.value,sampleSize:measurement.sampleSize,windowStart:measurement.windowStart,windowEnd:measurement.windowEnd,instrumentation:measurement.instrumentation,comparison:measurement.comparison}:null,assisted:input.assisted,supersedesId:input.supersedesId??null};
  const id='observation-'+hash({businessId,key:input.idempotencyKey}).slice(0,30),prior=this.store.get('pilot-business-observation',id);
  if(prior){requireThat(prior.payloadHash===hash(payload),'OBSERVATION_IDEMPOTENCY_CONFLICT');this.materialize(prior.decisionId);return this.get(businessId,id);}
  const sources=this.knowledge.selectedSources(businessId);requireThat(payload.sourceIds.every(id=>sources.some(s=>s.id===id&&(!s.validUntil||Date.parse(s.validUntil)>Date.now()))),'OBSERVATION_SOURCE_SCOPE');
  let task:any=null;if(payload.taskId){task=this.outcomes.execution.portfolio.getTask(payload.taskId);requireThat(task.ventureId===businessId,'OBSERVATION_BUSINESS_SCOPE');requireThat(task.status==='completed'&&task.outputArtifacts.some((a:any)=>a.sha256===payload.artifactHash),'OBSERVATION_CHECKED_ARTIFACT_REQUIRED');}
  const outcomeId=payload.outcomeId??task?.inputs?.outcomeId??null,parent=outcomeId?this.outcomes.get(outcomeId):null;requireThat(!parent||parent.businessId===businessId,'OBSERVATION_BUSINESS_SCOPE');requireThat(!parent||!task||parent.taskIds.includes(task.id),'OBSERVATION_OUTCOME_TASK_SCOPE');
  if(payload.supersedesId){const old=this.store.get('pilot-business-observation',payload.supersedesId);requireThat(old?.businessId===businessId&&old.taskId===payload.taskId,'OBSERVATION_SUPERSESSION_SCOPE');}
  const decisionId='decision-'+hash(id).slice(0,30),at=new Date().toISOString();
  const reason=payload.kind==='pending_feedback'?'Await the named feedback before choosing further work.':payload.result==='not_useful'?'Challenge the prior diagnosis and whether this work addresses the actual constraint.':payload.result==='worse'?'Investigate the adverse observation, alternatives and whether a bounded correction or rollback is warranted.':payload.result==='improved'?'Reassess the observation, economics and operating capacity before recommending further work.':'Determine what the evidence changes, what remains unknown and the smallest useful next action.';
  const observation={id,businessId,...payload,parentOutcomeId:outcomeId,payloadHash:hash(payload),decisionId,createdAt:at,provenance:company.mode==='fixture'?'synthetic business observation; owner-entered development evidence':'owner-reported observation; not independently verified',interpretation:measurement?{delta:measurement.baseline===null?null:measurement.value-measurement.baseline,causalAttribution:'not established',statisticalSignificance:'not established',economicMeaning:'Metric values are not automatically cash collected, contribution or net profit.'}:null};
  const decision={id:decisionId,businessId,observationId:id,parentOutcomeId:outcomeId,state:payload.kind==='pending_feedback'?'awaiting_feedback':'preparing',reason,objective:(reason+' Original business objective: '+company.goal).slice(0,4000),outcomeId:null,createdAt:at,policy:'Deterministic routing to an evidence review; the business decision remains for the authorized planner.',plannedLimits:{allowedFamilies:parent?.allowedFamilies??['response-packet'],maxCalls:parent?.maxCalls??18,repairReserve:parent?.repairReserve??4},authority:'Separate unsigned successor proposal; no prior grant, spending allowance, or remaining allocation is transferred.'};
  this.store.transaction(()=>{this.store.record(pilotKnowledgeScope(businessId),id,'BusinessObservation',observation);this.store.put('pilot-business-observation',id,observation,null);this.store.put('pilot-next-decision',decisionId,decision,null);this.store.event(pilotKnowledgeScope(businessId),'business.observation_received',{observationId:id,decisionId,kind:payload.kind});
   if(payload.supersedesId){const old=this.store.get('pilot-business-observation',payload.supersedesId),d=this.store.get('pilot-next-decision',old.decisionId);if(d&&['awaiting_feedback','preparing'].includes(d.state))this.store.put('pilot-next-decision',d.id,{...d,state:'superseded',supersededBy:decisionId},d._version);}
  });
  this.materialize(decisionId);return this.get(businessId,id);
 }
 materialize(decisionId:string){
  const d=this.store.get('pilot-next-decision',decisionId);requireThat(d,'OBSERVATION_DECISION_NOT_FOUND');if(d.state!=='preparing')return d;
  const observation=this.store.get('pilot-business-observation',d.observationId);boundObservationContext(this.store,d.businessId,[observation.id]);
  const outcome=this.outcomes.create(d.businessId,{id:'outcome-'+hash(decisionId).slice(0,30),objective:d.objective,autonomy:'prepare_supported_work',...d.plannedLimits,observationIds:[observation.id]});
  return this.store.transaction(()=>{const current=this.store.get('pilot-next-decision',decisionId);if(current.state!=='preparing')return current;return this.store.put('pilot-next-decision',decisionId,{...current,state:'awaiting_authority',outcomeId:outcome.id,preparedAt:new Date().toISOString()},current._version);});
 }
 recover(businessId:string){for(const decision of this.rows('pilot-next-decision').filter(d=>d.businessId===businessId&&d.state==='preparing'))this.materialize(decision.id);return this.view(businessId);}
 get(businessId:string,id:string){const o=this.store.get('pilot-business-observation',id);requireThat(o?.businessId===businessId,'OBSERVATION_BUSINESS_SCOPE');return {...o,withdrawal:this.store.get('pilot-observation-withdrawal',id),decision:this.store.get('pilot-next-decision',o.decisionId)};}
 reject(businessId:string,decisionId:string,reason:string){text(reason,4000);const d=this.store.get('pilot-next-decision',decisionId);requireThat(d?.businessId===businessId,'OBSERVATION_BUSINESS_SCOPE');if(d.state==='rejected'){requireThat(d.rejectionReason===reason.trim(),'OBSERVATION_REJECTION_CONFLICT');return d;}requireThat(!['superseded','withdrawn'].includes(d.state),'OBSERVATION_DECISION_CLOSED');if(d.outcomeId&&this.outcomes.get(d.outcomeId).state!=='cancelled')this.outcomes.control(d.outcomeId,'cancel');return this.store.transaction(()=>{this.store.record(pilotKnowledgeScope(businessId),decisionId+'-rejected','NextDecisionRejected',{decisionId,reason:reason.trim()});return this.store.put('pilot-next-decision',decisionId,{...d,state:'rejected',rejectionReason:reason.trim(),rejectedAt:new Date().toISOString()},d._version);});}
 withdraw(businessId:string,id:string,reason:string){text(reason,4000);const o=this.get(businessId,id);if(o.withdrawal)return o;const d=o.decision;if(d.outcomeId&&this.outcomes.get(d.outcomeId).state!=='cancelled')this.outcomes.control(d.outcomeId,'cancel');this.store.transaction(()=>{const withdrawal={id,businessId,reason:reason.trim(),at:new Date().toISOString()};this.store.record(pilotKnowledgeScope(businessId),id+'-withdrawn','BusinessObservationWithdrawn',withdrawal);this.store.put('pilot-observation-withdrawal',id,withdrawal,null);const current=this.store.get('pilot-next-decision',d.id);this.store.put('pilot-next-decision',d.id,{...current,state:'withdrawn'},current._version);});return this.get(businessId,id);}
 view(businessId:string,authority?:{liveEnabled?:boolean;businessId?:string|null;outcomeId?:string|null}){
  this.knowledge.company(businessId);return {observations:this.rows('pilot-business-observation').filter(o=>o.businessId===businessId).map(o=>this.get(businessId,o.id)),decisions:this.rows('pilot-next-decision').filter(d=>d.businessId===businessId).map(d=>{
   let contextCurrent=true;try{boundObservationContext(this.store,businessId,[d.observationId]);}catch{contextCurrent=false;}const outcome=d.outcomeId?this.outcomes.view(d.outcomeId):null;
   const authorized=Boolean(authority?.liveEnabled&&authority.businessId===businessId&&authority.outcomeId===d.outcomeId);
   const state=['rejected','withdrawn','superseded','awaiting_feedback'].includes(d.state)?d.state:!contextCurrent?'blocked_source_permission':outcome?.state==='completed'?'completed':outcome?.state==='rejected'?'planner_rejected':outcome?.state==='cancelled'?'cancelled':authorized?'ready':'needs_authority';
   return {...d,state,contextCurrent,executionProvenance:this.knowledge.company(businessId).mode==='fixture'?'fixture_available':'owner',outcomeState:outcome?.state??null};
  })};
 }
}
