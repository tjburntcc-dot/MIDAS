import {randomUUID} from 'node:crypto';
import {StateStore} from '../state.ts';
import {hash,requireThat} from '../contracts.ts';
import {Portfolio} from '../portfolio/core.ts';
import {PortfolioEngine} from '../portfolio/engine.ts';
import {EvidenceLibrary} from '../portfolio/evidence.ts';
import {LocalWorkTools,localToolIds,mandatoryCheckIds} from '../portfolio/tools.ts';
import {portfolioScope} from '../portfolio/contracts.ts';
import type {Task} from '../portfolio/contracts.ts';
import {FINALIZATION_PROTOCOL} from '../portfolio/finalization.ts';
import {createTaskPreparer} from '../portfolio/task-preparation.ts';
import {fixturePilotWorker} from './fixtures-execution.ts';
import {PilotKnowledge} from './knowledge.ts';
import {taskBusinessContext} from '../portfolio/task-context.ts';

export type PilotWorkflow='response-packet'|'business-site';
export type PilotBusiness={id:string;name:string;mode:string;goal:string;website?:string;notes?:string};
export type PilotSource={id:string;title:string;text:string;rights:string;observedAt:string;permission?:string;validUntil?:string|null;version?:number};
type PlanRequest={business:PilotBusiness;sources:PilotSource[];workflow:PilotWorkflow;procedureBinding?:{procedureScope:any;baselineProcedureId:string;id?:string;name?:string};intakeFields?:Array<{id:string;label:string}>};
const workTools=[...localToolIds,'research.read'];
const purpose:Record<PilotWorkflow,string>={'response-packet':'Prepare a sourced inquiry-response packet for owner review','business-site':'Build a company-information and local inquiry preparation application'};
const companyContext=(business:PilotBusiness)=>({name:business.name,goal:business.goal,website:business.website??'',notes:business.notes??''});
const selectedContext=(sources:PilotSource[])=>sources.filter(s=>s.permission!=='excluded').map(s=>({id:s.id,title:s.title,textHash:hash(s.text),rights:s.rights,observedAt:s.observedAt,validUntil:s.validUntil??null})).sort((a,b)=>a.id.localeCompare(b.id));
/** Product facade over the existing finite controller. It grants no model or effect authority. */
export class PilotExecution{
 readonly store:StateStore;readonly portfolio:Portfolio;readonly tools:LocalWorkTools;readonly evidence:EvidenceLibrary;readonly engine:PortfolioEngine;
 constructor(store:StateStore,options:{root?:string;portfolio?:Portfolio;browserLauncher?:()=>Promise<any>}={}){
  this.store=store;this.portfolio=options.portfolio??new Portfolio(store);this.evidence=new EvidenceLibrary(store,{publicRead:false});
  this.tools=new LocalWorkTools({store,root:options.root??'.',scopeFor:portfolioScope,browserLauncher:options.browserLauncher});
  const standard=createTaskPreparer(this.portfolio,this.tools,this.evidence);
  this.engine=new PortfolioEngine({portfolio:this.portfolio,tools:this.tools,evidence:this.evidence,model:fixturePilotWorker(),prepareTask:task=>{
   if((task.inputs as any)?.pilotWorkflow==='business-site'&&task.capability==='software.build'){
    const sources=this.evidence.forTask(task),v=taskBusinessContext(task,this.portfolio.getVenture(task.ventureId));
    this.tools.seed(task.ventureId,task.id,{kind:'software',files:[{path:'app.html',content:'<!doctype html><html lang="en"><title>Implementation pending</title><body><h1>Implementation pending</h1></body></html>'}],inputs:{profile:'business-site-v1',enforceHandoff:true,companyName:v.name,intakeFields:(task.inputs as any).intakeFields,evidence:sources.map(s=>({sourceId:s.id,title:s.title,quote:s.text})),localOnly:true},provenance:'Controller-created blank source; following source writes have separately recorded worker/test-double provenance.'});
   }else return standard(task);
  }});
  this.portfolio.registerWorker({id:'pilot-generalist',name:'Business generalist · experimental',competencies:['evidence-grounded-work','artifact-correction','local-browser-implementation'],capabilities:['service.brief','software.build','quality.review'],procedureId:'portfolio-worker-v3',maxConcurrency:1});
 }
 private assertTask(businessId:string,taskId:string){const task=this.portfolio.getTask(taskId);requireThat(task.ventureId===businessId&&(task.inputs as any)?.pilotRelease==='032','PILOT_TASK_SCOPE_DENIED');return task;}
 /** A changed owner scope blocks NEW inference, while admitted same-ID recovery
  * remains handled by the signed transport using its original request. */
 assertContextCurrent(taskId:string,requireStored=false){
  const task=this.portfolio.getTask(taskId),binding=(task.inputs as any)?.pilotOwnerContext;
  requireThat(binding&&(!requireStored||binding.kind==='stored_company'),'PILOT_OWNER_CONTEXT_BINDING_REQUIRED');
  if(binding.kind==='stored_company'){
   const knowledge=new PilotKnowledge(this.store),company=knowledge.company(task.ventureId),sources=knowledge.sources(task.ventureId);
   requireThat(binding.hash===hash({business:companyContext(company),sources:selectedContext(sources)}),'PILOT_OWNER_CONTEXT_CHANGED_PREPARE_FRESH_WORK');
   requireThat(sources.filter(s=>s.permission!=='excluded').every(s=>!s.validUntil||Date.parse(s.validUntil)>=Date.now()),'PILOT_STALE_EVIDENCE_REVIEW_REQUIRED');
  }
  return task;
 }
 private recordSources(business:PilotBusiness,sources:PilotSource[]){
  const permitted=sources.filter(s=>s.permission!=='excluded');requireThat(permitted.length>0,'PILOT_PERMITTED_EVIDENCE_REQUIRED');
  requireThat(permitted.length<=12&&permitted.every(s=>s.text.length<=20000),'PILOT_WORKER_BUNDLE_TOO_LARGE');
  requireThat(permitted.reduce((n,s)=>n+Buffer.byteLength(s.text),0)<=8000,'PILOT_EXECUTION_EVIDENCE_SCOPE_REQUIRED');
  requireThat(permitted.every(s=>!s.validUntil||Date.parse(s.validUntil)>=Date.now()),'PILOT_STALE_EVIDENCE_REVIEW_REQUIRED');
  return permitted.map(source=>this.evidence.add(business.id,{title:source.id+' · '+source.title,url:null,text:source.text,observedAt:source.observedAt,publishedAt:null,rights:'owner_supplied',provenance:business.mode==='fixture'?'offline_fixture':'owner_report',textKind:'owner_statement',interpretation:'Imported permitted company evidence. Original rights: '+source.rights+'; original source ID: '+source.id+'; not independently verified.'}));
 }
 plan(input:PlanRequest){
  requireThat(['response-packet','business-site'].includes(input.workflow),'PILOT_WORKFLOW_UNSUPPORTED');
  const businessContext=companyContext(input.business),context={business:businessContext,sources:selectedContext(input.sources)},stored=this.store.get('pilot-company',input.business.id);
  if(stored){const knowledge=new PilotKnowledge(this.store);requireThat(hash(context)===hash({business:companyContext(knowledge.company(input.business.id)),sources:selectedContext(knowledge.sources(input.business.id))}),'PILOT_PLAN_CONTEXT_CHANGED');}
  const pilotOwnerContext={kind:stored?'stored_company':'supplied_fixture',hash:hash(context)};
  let venture:any;try{venture=this.portfolio.getVenture(input.business.id);}catch{venture=this.portfolio.createVenture({id:input.business.id,name:input.business.name,goal:input.business.goal,mode:input.business.mode==='fixture'?'fixture':'local',summary:'Company evidence is incomplete. Supported local preparation only; no customer effects.'});}
  requireThat(venture.mode===(input.business.mode==='fixture'?'fixture':'local'),'PILOT_MODE_CHANGED');
  const intakeFields=input.intakeFields??[{id:'work',label:'Item or service requested'},{id:'scope',label:'Dimensions or relevant scope details'},{id:'condition',label:'Condition or relevant constraints'},{id:'contact',label:'Preferred contact method (test reference only in demonstration)'}];requireThat(intakeFields.length>=1&&intakeFields.length<=8&&new Set(intakeFields.map(f=>f.id)).size===intakeFields.length&&intakeFields.every(f=>/^[a-z][a-zA-Z0-9_-]{0,39}$/.test(f.id)&&typeof f.label==='string'&&f.label.length>0&&f.label.length<=150),'PILOT_INTAKE_FIELDS_INVALID');
  const sources=this.recordSources(input.business,input.sources),id=input.workflow+'-'+randomUUID().slice(0,8),software=input.workflow==='business-site';
  const assignedWorkerId=input.procedureBinding?.id??'pilot-generalist';if(assignedWorkerId!=='pilot-generalist')this.portfolio.registerWorker({id:assignedWorkerId,name:input.procedureBinding?.name??'Experimental business worker',competencies:['evidence-grounded-work','artifact-correction',...(software?['local-browser-implementation']:[])],capabilities:[software?'software.build':'service.brief'],procedureId:input.procedureBinding!.baselineProcedureId,maxConcurrency:1});
  const plan=this.portfolio.addPlan(input.business.id,{id:'plan-'+id,rationale:'Owner selected a supported local outcome from company evidence. Worker assignment covers declared tools; competence is experimental and no second role is justified by evidence.',evidenceIds:sources.map(s=>s.id),tasks:[{id,title:purpose[input.workflow],objective:purpose[input.workflow]+'. Use every permitted source; identify unknowns. Do not send, book, quote an unverified price, or infer customer benefit.',lane:'build',capability:software?'software.build':'service.brief',dependsOn:[],acceptance:[software?'Current app passes company-source, intake, invalid input, save/edit, status, export, desktop/phone and restart-persistence checks.':'A readable packet quotes all required company sources, gives a usable draft/action with owner review, distinguishes unknowns and preserves obligations.','Current artifacts receive recorded worker submission, deterministic finalization and authenticated readback.','Local owner acceptance is separate from independent semantic validation and external-action approval.'],requiredCompetencies:['evidence-grounded-work','artifact-correction',...(software?['local-browser-implementation']:[])],allowedTools:workTools,requiredChecks:mandatoryCheckIds(software?'software':'service',software?'business-site-v1':undefined),resource:{workerSlots:1,modelCalls:8,localToolRuns:14},maxAttempts:1,effectAuthority:{kind:'local',reference:'pilot-032-local-preparation-only'},inputs:{pilotRelease:'032',businessContext,pilotOwnerContext,assignedWorkerId,feedbackPolicy:'defer_to_declared_decision',sourceAuthorship:'from-execution-provenance',pilotWorkflow:input.workflow,pilotMode:input.business.mode==='fixture'?'fixture':'owner',requiresGrant:input.business.mode!=='fixture',executionProtocol:FINALIZATION_PROTOCOL,...(software?{executionProfile:'business-site-v1',intakeFields}:{}),enforceHandoff:true,sourceBindings:sources.map(s=>({id:s.id,sha256:s.sha256})),...(input.procedureBinding?{baselineProcedureId:input.procedureBinding.baselineProcedureId,procedureScope:input.procedureBinding.procedureScope}:{})}}]});
  return this.portfolio.getTask(plan.taskIds[0]);
 }
 run(businessId:string,taskId:string){const task=this.assertTask(businessId,taskId);requireThat((task.inputs as any).pilotMode==='fixture'&&this.portfolio.getVenture(businessId).mode==='fixture','PILOT_LIVE_GRANT_REQUIRED');if(task.status==='completed'){this.preserveOwnerState(task);return Promise.resolve(task);}this.assertContextCurrent(task.id);return this.engine.runTask(task.id,(task.inputs as any).assignedWorkerId??'pilot-generalist').then(result=>{this.preserveOwnerState(this.portfolio.getTask(task.id));return result;});}
 private preserveOwnerState(task:Task){
  if(task.status!=='completed'||(task.inputs as any)?.pilotWorkflow!=='business-site'||!(task.inputs as any)?.correctionOf)return;
  const key=task.id,priorTask=this.portfolio.getTask((task.inputs as any).correctionOf);
  // The corrected workspace was seeded from this exact artifact producer. Keep
  // the originating task explicit even when the owner addressed an older card.
  const producer=(task.inputs as any).correctionSourceTaskId??priorTask.id;
  const original=this.tools.load(task.ventureId,producer),next=this.tools.load(task.ventureId,task.id);
  if(this.store.get('pilot-preview-migration',key))return;
  const before=this.tools.previewState(task.ventureId,producer,{ventureId:task.ventureId,taskId:producer,manifestHash:original.manifest.sha256,operation:'read'}),after=this.tools.previewState(task.ventureId,task.id,{ventureId:task.ventureId,taskId:task.id,manifestHash:next.manifest.sha256,operation:'read'});
  requireThat(after.version===0||hash(after.state)===hash(before.state),'PILOT_PREVIEW_MIGRATION_CONFLICT');
  if(after.version===0)this.tools.previewState(task.ventureId,task.id,{ventureId:task.ventureId,taskId:task.id,manifestHash:next.manifest.sha256,operation:'write',expectedVersion:0,state:before.state});
  this.store.transaction(()=>this.store.put('pilot-preview-migration',key,{taskId:task.id,sourceTaskId:producer,sourceVersion:before.version,stateHash:hash(before.state),provenance:'trusted local state preservation; no customer effect'},null));
 }
 pause(businessId:string,taskId:string){this.assertTask(businessId,taskId);return this.portfolio.controlTask(taskId,'pause');}
 resume(businessId:string,taskId:string){this.assertTask(businessId,taskId);this.portfolio.controlTask(taskId,'resume');return this.run(businessId,taskId);}
 correct(input:{businessId:string;taskId:string;artifactHash:string;instruction:string;[key:string]:unknown}){
  const prior=this.assertTask(input.businessId,input.taskId),artifact=this.artifact(input.businessId,input.taskId);requireThat(artifact&&artifact.hash===input.artifactHash,'PILOT_CORRECTION_ARTIFACT_STALE');requireThat(typeof input.instruction==='string'&&input.instruction.trim().length>=5&&input.instruction.length<=2000,'PILOT_CORRECTION_INSTRUCTION_REQUIRED');
  const correctionInputs={...(prior.inputs as any)};delete correctionInputs.procedureScope;delete correctionInputs.baselineProcedureId;
  const current=this.store.get('portfolio-artifact',artifact.artifactId),id='correction-'+randomUUID().slice(0,8),plan=this.portfolio.addPlan(input.businessId,{id:'plan-'+id,rationale:'Owner correction of exact artifact '+artifact.hash+'. Preserve original source and independently recheck the new authoritative revision.',tasks:[{id,title:'Revise: '+prior.title,objective:'Apply the owner-requested correction to the actual current source. Preserve required sourced statements; report contradictions or unsupported instructions explicitly. The fixture demonstrates editing mechanics, not semantic understanding.',lane:'build',capability:'quality.review',dependsOn:[],inputArtifacts:[{artifactId:current.id,version:current.version,sha256:current.sha256}],acceptance:[...prior.acceptance,'Owner correction changes the actual recommendation or site introduction; copied original remains preserved.'],requiredCompetencies:['evidence-grounded-work','artifact-correction'],allowedTools:workTools,requiredChecks:prior.requiredChecks,resource:{workerSlots:1,modelCalls:8,localToolRuns:14},maxAttempts:1,effectAuthority:prior.effectAuthority,inputs:{...correctionInputs,assignedWorkerId:'pilot-generalist',authoritativeArtifactId:current.id,ownerCorrection:input.instruction,correctionOf:prior.id,correctionSourceTaskId:artifact.taskId,correctionArtifactHash:artifact.hash}}]});
  const task=this.portfolio.getTask(plan.taskIds[0]);this.store.record(portfolioScope(input.businessId),'correction-'+hash(task.id).slice(0,24),'PilotCorrectionRequest',{taskId:task.id,priorTaskId:prior.id,artifactHash:artifact.hash,instruction:input.instruction,provenance:'owner-requested; fixture interpretation is deterministic and not semantic validation'});return task;
 }
 tasks(businessId:string){if(!this.store.get('portfolio-venture',businessId))return [];return this.portfolio.snapshot(businessId).tasks.filter((t:any)=>t.inputs?.pilotRelease==='032').map((t:any)=>({...t,workflow:t.inputs.pilotWorkflow,artifact:this.artifact(businessId,t.id),checkpoint:t.checkpoint??{lastTool:t.attempts?'execution admitted':'planned; no model attempt'},worker:{id:t.workerId??'pilot-generalist',name:'Business generalist',procedureVersion:this.store.get('portfolio-execution',t.id)?.procedureSelection?.procedureId??'portfolio-worker-v3',selectionReason:'One worker has the declared source, correction and browser tools. Relevant job competence is not established by fixtures.'},provenance:this.store.get('portfolio-execution',t.id)?.modelProvenance==='actual_model'?'Actual-model attempt recorded; status and current checks determine completeness':t.inputs.pilotMode==='fixture'?'Explicit development-authored offline fixture through shared controller':'Prepared real-company task; no live attempt recorded',nextAction:t.inputs.requiresGrant&&t.status==='queued'?'Review the exact prospective request and obtain a separately signed model grant':t.nextAction}));}
 artifact(businessId:string,taskId:string):any{
  const task=this.assertTask(businessId,taskId),binding=task.outputArtifacts[0]??task.inputArtifacts.find(b=>b.artifactId===(task.inputs as any)?.authoritativeArtifactId);if(!binding)return null;
  const a=this.store.get('portfolio-artifact',binding.artifactId);if(!a||a.ventureId!==businessId)return null;
  return {hash:a.sha256,artifactId:a.id,taskId:a.taskId,title:a.title,version:a.version,summary:a.summary,checks:a.checks??[],provenance:a.provenance,manifestHash:a.metadata?.manifestHash,sourceAuthorship:a.metadata?.sourceAuthorship,obligations:this.tools.load(businessId,a.taskId).published?.obligations??[],current:task.outputCurrent&&binding.sha256===a.sha256,previewUrl:'/preview?businessId='+encodeURIComponent(businessId)+'&taskId='+encodeURIComponent(taskId),downloadUrl:'/download?businessId='+encodeURIComponent(businessId)+'&taskId='+encodeURIComponent(taskId)};
 }
 preview(businessId:string,taskId:string){this.preserveOwnerState(this.assertTask(businessId,taskId));const a=this.artifact(businessId,taskId);requireThat(a,'PILOT_ARTIFACT_UNAVAILABLE');const w=this.tools.load(businessId,a.taskId);this.tools.download(businessId,a.taskId);return {kind:w.kind,files:w.files,inputs:w.inputs,executionProfile:w.inputs.profile,binding:{ventureId:businessId,taskId:a.taskId,manifestHash:w.manifest.sha256},...(w.kind==='service'?{html:this.tools.download(businessId,a.taskId,'report.html').content}:{})};}
 download(businessId:string,taskId:string,path?:string){const a=this.artifact(businessId,taskId);requireThat(a,'PILOT_ARTIFACT_UNAVAILABLE');return this.tools.download(businessId,a.taskId,path);}
 previewState(businessId:string,taskId:string,body:any){const task=this.assertTask(businessId,taskId),a=this.artifact(businessId,taskId);requireThat(a&&a.taskId===taskId&&a.current&&body.manifestHash===a.manifestHash,'PILOT_PREVIEW_ARTIFACT_STALE');this.preserveOwnerState(task);return this.tools.previewState(businessId,taskId,body);}
 async recover(){return this.engine.recover();}
}
