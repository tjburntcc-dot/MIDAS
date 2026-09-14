import {hash,requireThat} from '../contracts.ts';
import type {ModelPort} from '../contracts.ts';
import {StateStore} from '../state.ts';
import {PilotKnowledge,pilotKnowledgeScope} from './knowledge.ts';
import {PilotExecution} from './execution.ts';
import {PilotLearning} from './learning.ts';
import {intelligenceRequest,validateIntelligence} from './intelligence-contract.ts';

/** Persist commercial proposals and their selected work in the existing company/task store. */
export class PilotIntelligence{
 readonly knowledge:PilotKnowledge;readonly execution:PilotExecution;readonly store:StateStore;
 constructor(store:StateStore,execution:PilotExecution){this.store=store;this.knowledge=new PilotKnowledge(store);this.execution=execution;}
 rows(kind:string){return this.store.db.prepare('SELECT body,version FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(r=>({...JSON.parse(String(r.body)),_version:Number(r.version)}));}
 contextHash(id:string){const b=this.knowledge.company(id);return hash({name:b.name,website:b.website,goal:b.goal,notes:b.notes,sources:this.knowledge.selectedSources(id).map(s=>({id:s.id,sha256:s.sha256,validUntil:s.validUntil})),corrections:this.knowledge.corrections(id),outcomes:this.knowledge.outcomes(id)});}
 sources(id:string,discovery:any=null){
  const all=this.knowledge.selectedSources(id);requireThat(all.length<=32,'INTELLIGENCE_SELECT_AT_MOST_32_SOURCES');
  const focusedId=discovery?.sources?.find((s:any)=>s.id===discovery?.focusedSource?.id)?.knowledgeSourceId,focus=all.find(s=>s.id===focusedId);
  const focusedBudget=focus?Math.min(20000,Buffer.byteLength(focus.text)):0,maxPer=Math.floor((32000-focusedBudget)/Math.max(1,all.length-(focus?1:0)));
  return all.map(s=>{let text=s.text;const budget=s.id===focusedId?focusedBudget:maxPer;while(Buffer.byteLength(text)>budget)text=text.slice(0,Math.max(0,text.length-100));return {...s,text,excerpt:{offset:0,characters:text.length,totalCharacters:s.text.length,complete:text.length===s.text.length,reason:s.id===focusedId?'Worker-selected focused source given additional context capacity.':'Bounded initial analysis excerpt; full retained document remains available to discovery and owner inspection.'}};});
 }
 prepare(id:string,discovery:any=null){const contextHash=this.contextHash(id),attemptId='commercial-'+hash({id,contextHash,discovery}).slice(0,30),sources=this.sources(id,discovery),request=intelligenceRequest(this.knowledge.company(id),sources,attemptId,discovery);request.context={...(request.context as any),ownerObservations:{corrections:this.knowledge.corrections(id).slice(-8),outcomes:this.knowledge.outcomes(id).slice(-8),rule:'These are owner-reported interpretations and outcomes, not measured demand, revenue, independent timing or verified source truth. Explain how they affect the next action without silently changing earlier findings.'}};return {request,sources,contextHash,attemptId};}
 async analyze(id:string,port:ModelPort,discovery:any=null){
  const p=this.prepare(id,discovery),key=id+'/'+p.attemptId,previous=this.store.get('pilot-commercial-attempt',key);
  if(previous?.result)return this.accept(id,p,previous.result,previous.provenance);
  requireThat(!previous,'INTELLIGENCE_ATTEMPT_UNCERTAIN_NO_RESUBMIT');
  const provenance=port.kind==='fixture'?'offline fixture; no measured model competence':port.kind==='live'?'actual-model under separately signed operating grant':'human-mediated model result; explicit assistance';
  this.store.transaction(()=>this.store.put('pilot-commercial-attempt',key,{businessId:id,attemptId:p.attemptId,request:p.request,sources:p.sources,contextHash:p.contextHash,requestHash:hash(p.request),status:'pending',provenance,createdAt:new Date().toISOString()},null));
  try{const result=await port.run(p.request);const old=this.store.get('pilot-commercial-attempt',key);this.store.transaction(()=>this.store.put('pilot-commercial-attempt',key,{...old,result,status:'response_preserved'},old._version));return this.accept(id,p,result,provenance);}
  catch(error){const old=this.store.get('pilot-commercial-attempt',key);this.store.transaction(()=>this.store.put('pilot-commercial-attempt',key,{...old,status:old.result?'invalid_response_preserved':'unknown_or_failed',error:String((error as Error).message),finishedAt:new Date().toISOString()},old._version));throw error;}
 }
 /** A trusted port must recover an already admitted identity; ordinary run is never a retry. */
 async resume(id:string,port:ModelPort & {recoverSameResponse?:(request:any)=>Promise<any>}){
  const previous=this.rows('pilot-commercial-attempt').filter(a=>a.businessId===id&&a.status!=='completed').at(-1);
  requireThat(previous&&previous.sources&&previous.contextHash,'INTELLIGENCE_RECOVERY_RECORD_REQUIRED');
  requireThat(hash(previous.request)===previous.requestHash,'INTELLIGENCE_RECOVERY_REQUEST_CHANGED');
  const p={request:previous.request,sources:previous.sources,contextHash:previous.contextHash,attemptId:previous.attemptId};
  if(previous.result)return this.accept(id,p,previous.result,previous.provenance);
  requireThat(typeof port.recoverSameResponse==='function','INTELLIGENCE_SAME_RESPONSE_RECOVERY_REQUIRED');
  const result=await port.recoverSameResponse(previous.request),key=id+'/'+previous.attemptId,old=this.store.get('pilot-commercial-attempt',key);
  this.store.transaction(()=>this.store.put('pilot-commercial-attempt',key,{...old,result,status:'response_preserved',recoveredAt:new Date().toISOString()},old._version));
  return this.accept(id,p,result,previous.provenance);
 }
 /** Only a persisted result from the declared request can update understanding. */
 accept(id:string,p:ReturnType<PilotIntelligence['prepare']>,result:any,provenance:string){
  const audit=validateIntelligence(result.output,p.sources);requireThat(this.contextHash(id)===p.contextHash,'INTELLIGENCE_CONTEXT_CHANGED');
  const value={...result.output,businessId:id,status:'proposal_ready',contextHash:p.contextHash,provenance,modelRoute:result.route,usage:result.usage,attemptId:p.attemptId,sourceAudit:audit,version:1,createdAt:new Date().toISOString()};
  return this.store.transaction(()=>{const old=this.store.get('pilot-intelligence',id);if(old?.attemptId===p.attemptId)return old;value.version=(old?.version??0)+1;this.store.record(pilotKnowledgeScope(id),'commercial-'+p.attemptId,'CommercialUnderstandingProposal',value);this.store.put('pilot-intelligence',id,value,old?._version??null);const key=id+'/'+p.attemptId,a=this.store.get('pilot-commercial-attempt',key);this.store.put('pilot-commercial-attempt',key,{...a,status:'completed'},a._version);return value;});
 }
 view(id:string){const value=this.store.get('pilot-intelligence',id);if(!value)return {status:'awaiting_model_authorization',executiveSummary:'Public evidence can be collected now. Commercial interpretation needs an exact model grant.',claims:[],findings:[],opportunities:[],unknowns:[],provenance:'No commercial model analysis executed.'};
  const fresh=value.contextHash===this.contextHash(id)&&!this.knowledge.selectedSources(id).some(s=>s.validUntil&&Date.parse(s.validUntil)<Date.now()),decisions=this.rows('pilot-opportunity-decision').filter(d=>d.businessId===id&&d.analysisAttemptId===value.attemptId);
  return {...value,status:fresh?value.status:'stale_evidence',current:fresh,opportunities:value.opportunities.map((o:any)=>({...o,status:decisions.find(d=>d.opportunityId===o.id)?.action??'available',decision:decisions.find(d=>d.opportunityId===o.id)??null})),changes:this.knowledge.snapshot(id).understanding.nextAction};
 }
 reject(id:string,opportunityId:string,reason:string){requireThat(typeof reason==='string'&&reason.trim().length>=5&&reason.length<=4000,'OPPORTUNITY_REJECTION_REASON');return this.decide(id,opportunityId,'rejected',{reason});}
 executionSources(id:string,requiredIds:string[]){
  const all=this.knowledge.selectedSources(id),required=all.filter(s=>requiredIds.includes(s.id)),remaining=all.filter(s=>!requiredIds.includes(s.id)).sort((a,b)=>Number(b.kind==='notes')-Number(a.kind==='notes'));
  requireThat(required.length===new Set(requiredIds).size,'INTELLIGENCE_WORK_EVIDENCE_UNAVAILABLE');
  const chosen:any[]=[];let bytes=0;for(const s of [...required,...remaining]){const fit=chosen.length<24&&s.text.length<=24000&&bytes+Buffer.byteLength(s.text)<=160000;if(!fit){requireThat(!requiredIds.includes(s.id),'INTELLIGENCE_REQUIRED_EVIDENCE_NEEDS_BOUNDED_EXCERPT');continue;}chosen.push(s);bytes+=Buffer.byteLength(s.text);}return chosen;
 }
 private decide(id:string,opportunityId:string,action:string,details:any){const analysis=this.view(id);requireThat(analysis.current&&analysis.opportunities.some((o:any)=>o.id===opportunityId),'OPPORTUNITY_CURRENT_REQUIRED');const key=id+'/'+analysis.attemptId+'/'+opportunityId,prior=this.store.get('pilot-opportunity-decision',key);requireThat(!prior,'OPPORTUNITY_DECISION_ALREADY_RECORDED');const value={businessId:id,analysisAttemptId:analysis.attemptId,opportunityId,action,...details,at:new Date().toISOString(),provenance:'owner selection/rejection; not proof of causal priority'};return this.store.transaction(()=>{this.store.record(pilotKnowledgeScope(id),'selection-'+hash(key).slice(0,24),'OpportunityDecision',value);return this.store.put('pilot-opportunity-decision',key,value,null);});}
 select(id:string,opportunityId:string){
  const analysis=this.view(id),o=analysis.opportunities.find((x:any)=>x.id===opportunityId);requireThat(analysis.current&&o?.status==='available','OPPORTUNITY_CURRENT_REQUIRED');
  requireThat(o.dependsOn.every((dep:string)=>analysis.opportunities.find((x:any)=>x.id===dep)?.status==='selected'),'OPPORTUNITY_DEPENDENCY_UNSELECTED');
  const campaign=o.deliverables.find((d:any)=>d.family==='campaign-packet'),page=o.deliverables.find((d:any)=>d.family==='marketing-page');
  requireThat(campaign||page,'OPPORTUNITY_UNSUPPORTED_CAPABILITY');
  const company=this.knowledge.company(id),assignment=new PilotLearning(this.store).assignment(id,'campaign-packet' as any);
  const job=campaign??{title:'Shared commercial foundation for '+o.title,outcome:o.intervention,details:'Prepare consistent audience, offer, proof and measurement before implementing the page.'};
  const requiredSourceIds:string[]=[...new Set<string>(o.evidenceRefs.map((r:any)=>r.sourceId))],sources=this.executionSources(id,requiredSourceIds),intentId='commercial-select-'+hash({id,analysis:analysis.attemptId,opportunityId}).slice(0,28),intent=this.store.get('pilot-work-intent',intentId),taskId=intentId+'-task';
  if(!intent)this.store.transaction(()=>this.store.put('pilot-work-intent',intentId,{id:intentId,businessId:id,analysisAttemptId:analysis.attemptId,opportunityId,taskId,contextHash:this.contextHash(id),job,sourceIds:sources.map(s=>s.id),status:'planning'},null));
  else requireThat(intent.contextHash===this.contextHash(id)&&hash(intent.job)===hash(job),'INTELLIGENCE_SELECTION_INTENT_CHANGED');
  const task=this.execution.plan({taskId,business:company,sources,workflow:'campaign-packet',procedureBinding:assignment,job,requiredSourceIds});
  this.store.transaction(()=>{const prior=this.store.get('pilot-commercial-work',task.id);if(!prior)this.store.put('pilot-commercial-work',task.id,{businessId:id,opportunityId,analysisAttemptId:analysis.attemptId,campaignTaskId:task.id,pageIntent:page??null,pageTaskId:null,status:'campaign_planned',sourceContextHash:this.contextHash(id),sourceIds:sources.map(s=>s.id)},null);const old=this.store.get('pilot-work-intent',intentId);this.store.put('pilot-work-intent',intentId,{...old,status:'planned'},old._version);});
  const decision=this.decide(id,opportunityId,'selected',{taskId:task.id,job,reason:o.priorityBasis});
  return {decision,task,pageIntent:page?{status:'waiting_for_checked_campaign',details:page}:null};
 }
 materialize(id:string){const results=[];for(const item of this.rows('pilot-commercial-work').filter(w=>w.businessId===id&&w.pageIntent&&!w.pageTaskId)){
  const task=this.store.get('portfolio-task',item.campaignTaskId);if(task?.status!=='completed')continue;
  if(item.sourceContextHash!==this.contextHash(id)){results.push({campaignTaskId:task.id,status:'company_context_changed'});continue;}
  const taskId='commercial-page-'+hash({id,campaign:task.id}).slice(0,28),intent=this.store.get('pilot-work-intent',taskId);if(!intent)this.store.transaction(()=>this.store.put('pilot-work-intent',taskId,{id:taskId,businessId:id,taskId,campaignTaskId:task.id,status:'planning'},null));
  const assignment=new PilotLearning(this.store).assignment(id,'marketing-page'),page=this.execution.plan({taskId,business:this.knowledge.company(id),sources:this.executionSources(id,item.sourceIds??[]),workflow:'marketing-page',procedureBinding:assignment,job:item.pageIntent,campaignTaskId:task.id});
  this.store.transaction(()=>{this.store.put('pilot-commercial-work',task.id,{...item,pageTaskId:page.id,status:'page_planned'},item._version);const old=this.store.get('pilot-work-intent',taskId);this.store.put('pilot-work-intent',taskId,{...old,status:'planned'},old._version);});results.push(page);
 }return results;}
}
