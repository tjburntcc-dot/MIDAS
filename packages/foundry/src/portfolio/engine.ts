import { randomUUID } from 'node:crypto';
import { hash,requireThat,modelResult } from '../contracts.ts';
import type { ModelResult } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { Portfolio } from './core.ts';
import type { Task,TaskLease,ArtifactInput } from './contracts.ts';
import { EvidenceLibrary,publicUrl } from './evidence.ts';
import { disabledWorker,makeWorkerRequest,boundedContext,workerSchema,validateWorker,requestIdentity,workerScope,ALL_TOOL_NAMES,WORKER_PROCEDURE,FINALIZING_WORKER_PROCEDURE } from './worker.ts';
import type { WorkerModel,WorkerCall,WorkerDecision } from './worker.ts';
import { EXECUTIVE_PROCEDURE,planningSchema,validatePlan } from './planning.ts';
import type { PlanningProposal } from './planning.ts';
import { ProcedureRegistry } from './learning.ts';
import { SERVICE_FILE_CONTRACT,SOFTWARE_FILE_CONTRACT } from './task-preparation.ts';
import { portfolioRecoveryInstruction,taskDefinitionHash } from './live.ts';
import {OPERATING_FILE_CONTRACT} from './operating-profile.ts';
import {productProfile} from './product-profiles.ts';
import {sourceHandoff} from './source-handoff.ts';
import {inheritedDraftFeedback} from './continuation.ts';
import {finalizationEnabled,finishingFeasibility} from './finalization.ts';

export interface WorkTools {
 execute(input:{ventureId:string;taskId:string;tool:string;args:any;operationId?:string}):Promise<any>;
 load(ventureId:string,taskId:string):any;
 recoverOperation?(operationId:string,ventureId:string,taskId:string):any;
 download?(ventureId:string,taskId:string,path?:string):{content:string};
 toolContract?():any[];
 repairCandidate?(ventureId:string,taskId:string,id?:string):any;
 updateInputs?(ventureId:string,taskId:string,inputs:any,reason:string):any;
}
export const CAPABILITIES=['software.build','service.brief','research.investigate','quality.review','portfolio.plan','portfolio.reassess','commercial.prepare'];
const deliveryTools=['workspace.read','workspace.replace','check.run','artifact.publish_local'];
export const CAPABILITY_PROFILES:Record<string,{description:string;requiredTools:string[]}>={
 'software.build':{description:'Build and correct a local browser product within the selected replaceable execution profile, source boundary and independently checked acceptance contract. Unsupported jobs need an explicit new profile, not a fabricated capability.',requiredTools:deliveryTools},
 'service.brief':{description:'Produce a full source-grounded recommendation from controller-bound title, client, reporting date and permitted sources. Include accountable actions, uncertainty and open obligations.',requiredTools:deliveryTools},
 'research.investigate':{description:'Investigate permitted sources and produce a complete sourced decision brief. Public search/fetch require their separately connected read tools; local report verification is mandatory.',requiredTools:deliveryTools},
 'quality.review':{description:'Review and replace the full authoritative software source or source-grounded packet, with the original artifact bound in task inputs. Corrections must preserve required source coverage and propagate to downstream work.',requiredTools:deliveryTools},
 'commercial.prepare':{description:'Prepare a source-grounded commercial decision or communication packet for owner review. This profile cannot send, transact, or grant commercial authority.',requiredTools:deliveryTools},
 'portfolio.plan':{description:'Compare source-supported hypotheses and propose a bounded dependency graph using these implemented profiles.',requiredTools:[]},
 'portfolio.reassess':{description:'Controller-created reassessment of a persisted observation; preserves source evidence, completed history and exact task scope.',requiredTools:[]}
};
const code=(error:any)=>typeof error?.code==='string'?error.code:String(error?.message??'WORK_FAILED').slice(0,160);
/** One integration owner. Task leases are durable; active promises merely service them. */
export class PortfolioEngine {
 readonly portfolio:Portfolio;readonly store:StateStore;readonly tools:WorkTools;readonly evidence:EvidenceLibrary;readonly model:WorkerModel;
 readonly prepareTask?: (task:Task)=>void|Promise<void>;
 readonly accounting?:()=>any;
 readonly recoveryAuthority?:(attemptId:string)=>any;
 readonly active=new Map<string,Promise<unknown>>();readonly ownerId='worker-'+process.pid+'-'+randomUUID();
 afterPersist?:(phase:'model'|'tool',taskId:string)=>void;
 constructor(options:{portfolio:Portfolio;tools:WorkTools;evidence:EvidenceLibrary;model?:WorkerModel;prepareTask?:(task:Task)=>void|Promise<void>;accounting?:()=>any;recoveryAuthority?:(attemptId:string)=>any}){this.portfolio=options.portfolio;this.store=options.portfolio.store;this.tools=options.tools;this.evidence=options.evidence;this.model=options.model??disabledWorker;this.prepareTask=options.prepareTask;this.accounting=options.accounting;this.recoveryAuthority=options.recoveryAuthority;}
 rows(kind:string){return this.store.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY key').all(kind).map(r=>JSON.parse(String(r.body)));}
 /** Offline preparation of exact initial payload, with no model admission. */
 async previewRequest(taskId:string){const task=this.portfolio.getTask(taskId);requireThat(task.attempts===0,'PREFLIGHT_REQUIRES_UNSTARTED_TASK');if(!['portfolio.plan','portfolio.reassess'].includes(task.capability)){try{this.tools.load(task.ventureId,task.id);}catch{await this.prepareTask?.(task);}}const planning=['portfolio.plan','portfolio.reassess'].includes(task.capability),s=this.state(task);return {request:makeWorkerRequest({ventureId:task.ventureId,taskId:task.id,attemptId:'p031-'+hash(task.id).slice(0,16)+'-0',context:this.requestContext(task,planning),tools:task.allowedTools,procedure:s.procedure}),schema:planning?planningSchema:workerSchema,warning:'Exact initial worker/schema preparation only. Provider access and token count remain unverified; later requests bind actual tool feedback.'};}
 runTask(taskId:string,workerId?:string){
  if(this.active.has(taskId))return this.active.get(taskId)!;
  requireThat(this.model.kind!=='actual_model'||this.active.size===0,'PROVIDER_WORKER_BUSY');
  const task=this.portfolio.getTask(taskId);const frozen=this.accounting?.().taskAllocations;if(this.model.kind==='actual_model'&&frozen)requireThat(frozen.some((a:any)=>a.id===taskId),'TASK_NOT_IN_FROZEN_RELEASE');requireThat(this.model.kind!=='disabled','PORTFOLIO_MODEL_DISABLED');
  requireThat(!(task.inputs as any)?.requiresGrant||this.model.kind==='actual_model','ACTUAL_MODEL_GRANT_REQUIRED');
  const workers=this.portfolio.snapshot().workers as any[];
  const eligible=workers.filter(w=>(!workerId||w.id===workerId)&&w.available&&w.capabilities.includes(task.capability)&&task.requiredCompetencies.every(c=>w.competencies.includes(c)));
  requireThat(eligible.length,'CAPABILITY_OR_COMPETENCY_UNAVAILABLE');
  const interrupted=(task as any).interruptedLease&&!task.lease&&['queued','blocked'].includes(task.status);
  const resume=interrupted?(()=>{const current=this.assertCurrent(task);return {executionHash:hash(this.state(current)),checkpointHash:hash(current.checkpoint??null)};})():null;
  let lease:TaskLease|null=null;for(const w of eligible){const options={ownerId:this.ownerId,leaseMs:240000};lease=resume?this.portfolio.resumeTask(taskId,w.id,resume,options):this.portfolio.claimTask(taskId,w.id,options);if(lease)break;}requireThat(lease,'TASK_NOT_READY_OR_CAPACITY');
  const promise=this.execute(lease).finally(()=>this.active.delete(taskId));this.active.set(taskId,promise);return promise;
 }
 async drain(){
  const results:unknown[]=[];
  // A finite release: only currently ready tasks; a blocked venture never owns the global queue.
  for(let pass=0;pass<100;pass++){
   const frozen=this.model.kind==='actual_model'?this.accounting?.().taskAllocations:null;const tasks=(this.portfolio.snapshot().tasks as Task[]).filter(t=>(!frozen||frozen.some((a:any)=>a.id===t.id))&&t.status==='queued'&&!this.active.has(t.id)&&(!(t.inputs as any)?.requiresGrant||this.model.kind==='actual_model')).sort((a,b)=>this.portfolio.getVenture(b.ventureId).priority-this.portfolio.getVenture(a.ventureId).priority||b.priority-a.priority||a.id.localeCompare(b.id));
   const launched:Promise<unknown>[]=[];
   for(const t of tasks){try{launched.push(Promise.resolve(this.runTask(t.id)).catch(e=>({taskId:t.id,error:code(e)})));}catch(e){if(!['TASK_NOT_READY_OR_CAPACITY','CAPABILITY_OR_COMPETENCY_UNAVAILABLE','PORTFOLIO_MODEL_DISABLED','PROVIDER_WORKER_BUSY'].includes(code(e)))throw e;}}
   if(!launched.length)break;results.push(...await Promise.all(launched));
  }return results;
 }
 private state(task:Task){let s=this.store.get('portfolio-execution',task.id);if(!s){const input=task.inputs as any,planning=['portfolio.plan','portfolio.reassess'].includes(task.capability);let procedure=planning?EXECUTIVE_PROCEDURE:finalizationEnabled(task)?FINALIZING_WORKER_PROCEDURE:WORKER_PROCEDURE,selection:any={kind:'strong_generic_baseline',adoption:null};if(input?.procedureScope||input?.baselineProcedureId){requireThat(input.procedureScope?.capability===task.capability&&typeof input.procedureScope.population==='string'&&typeof input.baselineProcedureId==='string','TASK_PROCEDURE_SCOPE_REQUIRED');const chosen=new ProcedureRegistry(this.store).selected(input.procedureScope,input.baselineProcedureId);requireThat(chosen.procedure.scope.capability===task.capability,'TASK_PROCEDURE_CAPABILITY_MISMATCH');procedure=chosen.procedure.procedure;selection={kind:'scoped_registry',procedureId:chosen.procedure.id,definitionHash:chosen.procedure.definitionHash,adoption:chosen.adoption,scope:input.procedureScope};}s=this.store.transaction(()=>this.store.put('portfolio-execution',task.id,{taskId:task.id,ventureId:task.ventureId,index:0,observations:[],sourceHash:this.evidence.taskDigest(task),procedure,procedureHash:hash(procedure),procedureSelection:selection,preparedAt:new Date().toISOString(),startedAt:null,modelProvenance:'not_admitted'},null));}return s;}
 private save(task:Task,patch:any){return this.store.transaction(()=>{const old=this.store.get('portfolio-execution',task.id);return this.store.put('portfolio-execution',task.id,{...old,...patch},old._version);});}
 private assertCurrent(task:Task){const t=this.portfolio.getTask(task.id);requireThat(!t.stopRequested&&this.portfolio.getVenture(t.ventureId).status==='active','TASK_STOP_REQUESTED');requireThat(!t.invalidatedAt,'TASK_INPUTS_STALE');if(this.state(t).sourceHash!==this.evidence.taskDigest(t)){this.portfolio.invalidateTask(t.id,'Permitted source evidence changed after the runtime request was pinned');requireThat(false,'TASK_SOURCE_CHANGED');}return t;}
 /** Only declared descendants in the same plan/frozen allowance supply an
  * execution contract. No product source, answers or other venture is included. */
 private prospectiveExecutionProfiles(task:Task){
  if(!['research.investigate','portfolio.plan','portfolio.reassess'].includes(task.capability)||!task.planId)return [];
  const frozen=this.accounting?.().taskAllocations;
  const tasks=(this.rows('portfolio-task') as Task[]).filter(t=>t.ventureId===task.ventureId&&t.planId===task.planId&&(!frozen||frozen.some((a:any)=>a.id===t.id)));
  const reachable=new Set([task.id]),descendants:Task[]=[];
  for(let pass=0;pass<tasks.length;pass++){
   let changed=false;for(const t of tasks){if(reachable.has(t.id)||!t.dependsOn.some(id=>reachable.has(id)))continue;
    if(frozen)requireThat(frozen.find((a:any)=>a.id===t.id)?.definitionHash===taskDefinitionHash(t),'PROSPECTIVE_TASK_SCOPE_CHANGED');
    reachable.add(t.id);descendants.push(t);changed=true;
   }if(!changed)break;
  }
  const profiles=new Map<string,{profileId:string;available:boolean;contractHash:string|null;contract:any;tasks:Array<{taskId:string;taskDefinitionHash:string}>;authority:string}>();
  for(const t of descendants.filter(t=>t.capability==='software.build'&&typeof (t.inputs as any)?.executionProfile==='string').sort((a,b)=>a.id.localeCompare(b.id))){
   const id=(t.inputs as any).executionProfile,contract=id==='quote-to-job-v1'?SOFTWARE_FILE_CONTRACT:id==='quote-to-job-v2'?productProfile(id):null;
   if(!profiles.has(id))profiles.set(id,{profileId:id,available:Boolean(contract),contractHash:contract?hash(contract):null,contract,tasks:[],authority:'Existing declared execution boundary only. This adds no capability, authority, commercial evidence or build requirement.'});
   profiles.get(id)!.tasks.push({taskId:t.id,taskDefinitionHash:taskDefinitionHash(t)});
  }
  return [...profiles.values()];
 }
 private context(task:Task){
  const v=this.portfolio.getVenture(task.ventureId),s=this.state(task),planning=['portfolio.plan','portfolio.reassess'].includes(task.capability);let workspace:any=null;try{workspace=this.tools.load(task.ventureId,task.id);}catch{}
  const sourceMetadata=(source:any)=>{const {text,...metadata}=source;return {...metadata,textLocation:'context.sources preview; research.read(path=source ID, query=decimal character offset) returns preserved text chunks'};};
  const compactInputs=(inputs:any)=>inputs&&Array.isArray(inputs.sources)?(task.inputs as any)?.release==='value-release-v4'?{...inputs,sources:inputs.sources.map((source:any)=>({id:source.id})),sourceLocation:'Complete source metadata and exact available text are in context.sources; research.read accesses retained text.'}:{...inputs,sources:inputs.sources.map(sourceMetadata)}:inputs;
  // Retain the latest requested file/source bytes. Older reads remain identified
  // by their original hash and can be requested again, rather than duplicated.
  const explicitHandoff=Boolean((task.inputs as any)?.sourceBindings||workspace?.inputs?.enforceHandoff||workspace?.inputs?.profile==='quote-to-job-v2');let currentFiles=(workspace?.files??[]).filter((f:any)=>workspace?.kind!=='service'||f.path==='brief.json');const currentFileBytes=Buffer.byteLength(JSON.stringify(currentFiles));const draftCorrection=workspace?inheritedDraftFeedback(this.store,task,workspace):null;requireThat(!workspace||sourceHandoff(workspace,Boolean((task.inputs as any)?.sourceBindings)).accepted||draftCorrection?.inheritedUnchanged,'CURRENT_SOURCE_HANDOFF_TOO_LARGE');
  const browserEvidence=(b:any)=>!b?null:{profile:b.profile,manifestHash:b.manifestHash,independentHumanReview:false,selection:'Bounded actual DOM evidence; full observations/screenshots remain in the immutable check result.',views:b.views.map((v:any)=>({name:v.name,title:v.title,text:v.text?.slice(0,v.name.includes('narrow')?250:800),viewport:v.viewport,scrollWidth:v.scrollWidth,error:v.error??null,screenshot:v.screenshot,controls:v.name.includes('narrow')?v.controls?.map((c:any)=>({control:c.id??c.tag,label:c.text,disabled:c.disabled,box:[c.box.x,c.box.y,c.box.width,c.box.height]})):v.controls?.map((c:any)=>({control:c.id??c.tag,label:c.text}))}))};
  const compactChecks=(checks:any[])=>checks.map(c=>({id:c.id,passed:c.passed,required:c.required,summary:c.summary,...(c.id==='software.browser-observation'?{evidenceLocation:'Latest complete browser observation below; immutable full results remain persisted.'}:c.evidence?{evidence:c.evidence}:{})}));
  let recent=s.observations.slice(-4);
  if(finalizationEnabled(task)&&workspace?.kind==='software'){
   const currentCheck=s.observations.findLast((o:any)=>o.tool==='check.run'&&o.result.manifest?.sha256===workspace.manifest.sha256);
   if(currentCheck&&!recent.includes(currentCheck))recent=[currentCheck,...recent.slice(-3)];
  }
  const lastRead=recent.findLastIndex((o:any)=>['workspace.read','research.read'].includes(o.tool));
  const observations=recent.map((observation:any,index:number)=>{const o=structuredClone(observation),r=o.result;o.workerReason=String(o.workerReason??'').slice(0,300);
   if(r?.source)r.source=sourceMetadata(r.source);
   if(r?.checks)for(const check of r.checks)if(check.id==='software.browser-observation')check.evidence=browserEvidence(check.evidence);
   if(r?.checks&&o.tool!=='check.run'){delete r.checks;r.checksLocation='Latest current check.run observation or authenticated delivery';}else if(r?.checks&&index!==recent.length-1)r.checks=compactChecks(r.checks);
   if(explicitHandoff&&o.tool==='workspace.read'&&r?.output?.content&&currentFiles.some((f:any)=>f.path===r.output.path&&f.content===r.output.content)){delete r.output.content;r.output.contentLocation='workspace.currentSource';}
   if(r?.output?.inputs)r.output.inputs=compactInputs(r.output.inputs);
   if(index!==lastRead&&o.tool==='workspace.read'&&typeof r?.output?.content==='string'){delete r.output.content;r.output.contentOmitted='Earlier file bytes omitted; workspace.read returns the full current file.';}
   if(index!==lastRead&&o.tool==='research.read'){for(const key of ['text','content'])if(typeof r?.[key]==='string'){delete r[key];r.textOmitted='Earlier source chunk omitted; research.read can repeat its source ID and offset.';}if(r?.output)for(const key of ['text','content'])delete r.output[key];}
   return o;
  });
  let reportBytes=0,softwareBytes=0;
  const parents=task.dependsOn.map(id=>this.portfolio.getTask(id));const extra=task.inputArtifacts.filter(ref=>!parents.some(p=>p.outputArtifacts.some(b=>b.artifactId===ref.artifactId)));const dependencyInputs:any[]=[...parents,...(extra.length?[{id:'explicit-preserved-input',objective:'Verified historical input; its originating task remains blocked. This is not a completed build decision.',status:'evidence_only',outputCurrent:true,result:null,outputArtifacts:extra}]:[])];
  const dependencies=dependencyInputs.map(parent=>{return {id:parent.id,objective:parent.objective??parent.title,status:parent.status,outputCurrent:parent.outputCurrent,summary:parent.result?.summary?.slice(0,500)??null,artifacts:parent.outputArtifacts.map((binding:any)=>{
   const a=this.store.get('portfolio-artifact',binding.artifactId);requireThat(a&&a.ventureId===task.ventureId&&a.version===binding.version&&a.sha256===binding.sha256,'DEPENDENCY_ARTIFACT_STALE');
   const detail:any={...binding,title:a.title,kind:a.kind,summary:a.summary?.slice(0,500)??null};
   if(a.kind==='business_proposal'){reportBytes+=Buffer.byteLength(JSON.stringify(a.content));requireThat(reportBytes<=18000,'DEPENDENCY_REPORT_TOO_LARGE_FOR_PLANNING');detail.proposal=a.content;}
   const sourceTaskId=a.taskId??a.metadata?.preservedSource?.taskId;
   if(sourceTaskId&&a.downloadUrl){const upstream=this.tools.load(task.ventureId,sourceTaskId);if(a.metadata?.preservedSource){requireThat(this.tools.download,'PRESERVED_DELIVERY_READER_REQUIRED');const payload=JSON.parse(this.tools.download(task.ventureId,sourceTaskId).content);requireThat(hash(payload)===a.metadata.preservedSource.payloadHash&&payload.manifest.sha256===a.metadata.manifestHash,'PRESERVED_DELIVERY_CHANGED');detail.historicalProvenance=a.metadata.preservedSource;}if(upstream.kind==='service'){
    requireThat(upstream.published?.manifestHash===upstream.manifest.sha256&&a.metadata?.manifestHash===upstream.manifest.sha256,'DEPENDENCY_REPORT_MANIFEST_CHANGED');
    const file=upstream.files.find((f:any)=>f.path==='brief.json');requireThat(file,'DEPENDENCY_REPORT_REQUIRED');reportBytes+=Buffer.byteLength(file.content);
    requireThat(reportBytes<=18000,'DEPENDENCY_REPORT_TOO_LARGE_FOR_PLANNING');detail.report=JSON.parse(file.content);detail.reportCompleteness='full authoritative checked report';
   }else if(upstream.kind==='software'){
    requireThat(this.tools.download,'DEPENDENCY_DELIVERY_READER_REQUIRED');
    const delivery=JSON.parse(this.tools.download(task.ventureId,a.taskId).content);
    requireThat(hash(delivery)===upstream.published?.payloadHash&&delivery.manifest.sha256===a.metadata?.manifestHash,'DEPENDENCY_SOFTWARE_READBACK_MISMATCH');
    softwareBytes+=Buffer.byteLength(JSON.stringify(delivery.files));requireThat(softwareBytes<=24000,'DEPENDENCY_SOFTWARE_TOO_LARGE');
    const execution=this.store.get('portfolio-execution',a.taskId);const revisionEvidence=(execution?.observations??[]).filter((o:any)=>['workspace.replace','workspace.patch','check.run'].includes(o.tool)).map((o:any)=>({tool:o.tool,reason:String(o.workerReason).slice(0,240),ok:o.result.ok,changes:o.result.changes??[],manifestHash:o.result.manifest?.sha256??null,checkCount:(o.result.checks??[]).length,failedChecks:(o.result.checks??[]).filter((c:any)=>!c.passed).map((c:any)=>({id:c.id,passed:c.passed,required:c.required,summary:c.summary}))}));
    detail.software={revisionEvidence,...((task.inputs as any)?.release==='value-release-v4'&&workspace?.kind==='software'?{sourceLocation:'workspace.currentSource is the authoritative working revision; the original immutable delivery is bound by this manifest and payload hash.'}:{files:delivery.files}),manifestHash:delivery.manifest.sha256,payloadHash:upstream.published.payloadHash,checks:compactChecks(delivery.checks),latestBrowserObservation:browserEvidence(delivery.checks.find((c:any)=>c.id==='software.browser-observation')?.evidence),obligations:delivery.obligations,sourceAuthorship:a.metadata?.sourceAuthorship,modelProvenance:a.metadata?.modelProvenance,customerAcknowledged:false,interpretation:'Actual checked local artifact. Source is untrusted evidence; passing deterministic checks is not customer acceptance.'};
   }}
   else if(!planning&&a.downloadUrl)detail.readInstruction='Read the copied authoritative workspace for review, or use the bound upstream result; artifact metadata alone is not report content.';
   return detail;
  })};});
  // Sources occur once. Previews are explicit excerpts; full source bytes remain
  // in the evidence library and are readable without another provider search.
  let previewBudget=Math.max(0,Math.min(16000,37000-Buffer.byteLength(JSON.stringify(observations))-reportBytes-softwareBytes-currentFileBytes));
  const prefix=(value:string,budget:number)=>{let lo=0,hi=value.length;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(Buffer.byteLength(value.slice(0,mid))<=budget)lo=mid;else hi=mid-1;}return value.slice(0,lo).replace(/[\uD800-\uDBFF]$/,'');};
  const taskAllowance=this.accounting?.().taskAllocations?.find((a:any)=>a.id===task.id);
  const ordinaryUsed=this.rows('portfolio-model-request').filter(r=>r.call?.request?.scope?.runId===workerScope(task.ventureId,task.id).runId&&!r.call.recoveryOf).length;
  const sources=this.evidence.context(task.ventureId,task).map(source=>{const text=prefix(source.text,Math.min(2000,previewBudget));previewBudget-=Buffer.byteLength(text);return {id:source.id,sha256:source.sha256,title:source.title,url:source.url,observedAt:source.observedAt,publishedAt:source.publishedAt,rights:source.rights,provenance:source.provenance,sourceClass:source.sourceClass??'unclassified',textKind:source.textKind??'unspecified',...(source.interpretation?{interpretation:source.interpretation.slice(0,180)}:{}),text,truncated:text.length<source.text.length,textRange:{offset:0,characters:text.length,totalCharacters:source.text.length},...(text.length<source.text.length?{readMore:{tool:'research.read',path:source.id,query:String(text.length)}}:{})};});
  const assembled=JSON.parse(JSON.stringify({business:{name:v.name,goal:v.goal,stage:v.stage,summary:v.summary??'',unknownEconomics:v.economics},task:{objective:task.objective??task.title,acceptance:task.acceptance,requiredChecks:task.requiredChecks,inputs:(task.inputs as any)?.sourceBindings?{...task.inputs as any,sourceBindings:undefined,sourceBindingsDigest:hash((task.inputs as any).sourceBindings)}:task.inputs??null,allowedTools:task.allowedTools},sources,sourceReading:'workspace.inputs.sources lists permitted IDs, not duplicate text. context.sources contains exact previews marked truncated when incomplete. Use research.read with path=source ID and query=decimal character offset for preserved text; quote only text actually read. Source hashes describe the full retained source.',dependencies,toolContracts:[...(this.tools.toolContract?.()??[]).filter((t:any)=>task.allowedTools.includes(t.id)),...(task.allowedTools.includes('research.fetch')?[{id:'research.fetch',description:'Read one worker-selected public HTTPS page through bounded DNS-vetted retrieval; rejects private hosts, credentials and cross-host redirects. Returns exact source or an explicit limitation. A fetch needs one ordinary tool-selection decision but no hosted-search admission.'}]:[]),...(task.allowedTools.includes('research.search')?[{id:'research.search',description:'Optional consequential discovery. Selecting it consumes this ordinary decision AND one of two separately metered hosted-search admissions. No hidden helper or retries.'}]:[])],workspace:workspace?{manifest:workspace.manifest??workspace,inputs:compactInputs(workspace.inputs??null),currentSource:currentFiles,fileContract:workspace.kind==='software'?(productProfile(workspace.inputs?.profile??'quote-to-job-v1')??SOFTWARE_FILE_CONTRACT):workspace.inputs?.operatingProfile==='operating-packet-v1'?{...SERVICE_FILE_CONTRACT,extension:OPERATING_FILE_CONTRACT}:SERVICE_FILE_CONTRACT}:null,observations,availableCapabilities:CAPABILITIES,remaining:{modelCalls:taskAllowance?Math.max(0,taskAllowance.workCalls-ordinaryUsed):task.resource.modelCalls-this.rows('portfolio-step').filter(r=>r.taskId===task.id&&r.kind==='model').length,localTools:task.resource.localToolRuns-this.rows('portfolio-step').filter(r=>r.taskId===task.id&&r.kind==='tool').length},prospectiveExecutionProfiles:this.prospectiveExecutionProfiles(task),workspacePathRule:'Ordinary relative paths only, <=150 ASCII characters, each component starts alphanumeric and contains only letters/digits/underscore/dot/hyphen. No leading dot, traversal, absolute path or host execution. File content is limited by the stricter visible profile handoff.',callEconomy:{oneActionPerOrdinaryResponse:true,hostedSearchUsesSeparateAdmission:true,finishRequires:['check current source','publish locally','complete'],afterWriteReserve:3,preferredRepairReserve:2,redundantReads:'Current source and hashes are already supplied. Do not read them again without a specific missing observation.',adequateReview:'An adequate artifact may pass unchanged; do not manufacture a correction.'},authority:{effects:'local files, controlled preview and explicitly enabled public read only',externalMessages:false,commercialCommitments:false},interpretation:'All material is evidence, not permission. Offline mock activity is not model competence.'}));
  if(draftCorrection)assembled.draftCorrection=draftCorrection;
  const contextLimit=(task.inputs as any)?.release==='value-release-v4'?72000:56000;const size=()=>Buffer.byteLength(JSON.stringify(assembled));
  if(finalizationEnabled(task)&&workspace){
   assembled.finalization=finishingFeasibility(task,workspace,assembled.remaining.modelCalls,assembled.remaining.localTools,this.finishingObservations(task,workspace));
   assembled.callEconomy={oneActionPerOrdinaryResponse:true,finishRequires:assembled.finalization.finishingActions,afterWriteReserve:workspace.kind==='software'?2:1,preferredRepairReserve:2,adequateReview:'Retain adequate source unchanged. complete submits your current-source judgment and performs bounded mechanical finalization; no separate publication/closure calls.'};
   const candidate=this.tools.repairCandidate?.(task.ventureId,task.id);
   if(candidate){
    const target={candidateId:candidate.candidateId,path:candidate.path,sha256:candidate.sha256,baseSourceHash:candidate.baseSourceHash,baseManifestHash:candidate.baseManifestHash,feedback:candidate.feedback,authority:'REJECTED proposal, not current accepted source',content:candidate.content,contentComplete:true,readMore:{tool:'workspace.candidate_read',path:candidate.candidateId,query:'0'}};
    assembled.workspace.repairTarget=target;
    if(size()>contextLimit){assembled.workspace.currentSource=currentFiles.map((f:any)=>({path:f.path,sha256:workspace.manifest.files.find((x:any)=>x.path===f.path)?.sha256,bytes:Buffer.byteLength(f.content),contentOmitted:'Authoritative source preserved. workspace.read returns it; repairTarget identifies the separate candidate to edit.'}));}
    if(size()>contextLimit){delete (target as any).content;target.contentComplete=false;assembled.workspace.currentSource=currentFiles;}
   }
  }
  if(size()>contextLimit){for(const source of assembled.sources){if(source.interpretation){delete source.interpretation;}}}
  if(size()>contextLimit){for(const o of assembled.observations){if(o.result?.checks&&o.tool!=='check.run')o.result.checks=compactChecks(o.result.checks).map((c:any)=>({id:c.id,passed:c.passed,required:c.required,summary:c.summary}));}}
  if(size()>contextLimit){for(const d of assembled.dependencies)for(const a of d.artifacts){if(a.software&&workspace?.kind==='software'&&assembled.observations.some((o:any)=>o.tool==='check.run')){a.software.latestBrowserObservation=null;a.software.browserEvidenceLocation='Current manifest-bound check.run observations; upstream full results remain in immutable delivery.';}}}
  if(size()>contextLimit){const diagnostic={taskId:task.id,totalBytes:size(),fieldBytes:Object.fromEntries(Object.entries(assembled).map(([k,v])=>[k,Buffer.byteLength(JSON.stringify(v))])),providerRequests:0};const old=this.store.get('portfolio-context-diagnostic',task.id);this.store.transaction(()=>this.store.put('portfolio-context-diagnostic',task.id,diagnostic,old?._version??null));}requireThat(size()<=contextLimit,'PORTFOLIO_CONTEXT_TOO_LARGE');
  return boundedContext(assembled,contextLimit);
 }
 private requestContext(t:Task,planning:boolean):any{
  if(!planning)return this.context(t);
  return boundedContext({...this.context(t) as any,capabilityProfiles:CAPABILITY_PROFILES,observations:this.portfolio.snapshot(t.ventureId).observations.slice(-12).map(o=>({id:o.id,kind:o.kind,summary:o.summary,source:o.source,provenance:o.provenance})),existingUnstartedTaskIds:(this.portfolio.snapshot(t.ventureId).tasks as Task[]).filter(x=>x.id!==t.id&&x.status==='queued'&&x.attempts===0).map(x=>x.id)});
 }
 private finishingObservations(t:Task,w:any){const observations=this.state(t).observations;return {checkSeen:observations.some((o:any)=>o.tool==='check.run'&&o.result.ok&&o.result.manifest?.sha256===w.manifest.sha256),publicationSeen:observations.some((o:any)=>o.tool==='artifact.publish_local'&&o.result.ok&&o.result.output?.payloadHash===w.published?.payloadHash&&o.result.manifest?.sha256===w.manifest.sha256)};}
 private verifySaved(kind:'portfolio-model-result'|'portfolio-tool-result',key:string,identity:string){
  const saved=this.store.get(kind,key);requireThat(saved&&saved.identity===identity&&saved.requestHash===identity&&saved.outputHash===hash(saved.result)&&hash(saved.output)===saved.outputHash,'DURABLE_RESULT_BINDING');return saved;
 }
 private settleSaved(kind:'portfolio-model-result'|'portfolio-tool-result',key:string,identity:string){
  const saved=this.verifySaved(kind,key,identity),step=this.store.get('portfolio-step',key);requireThat(step&&step.taskId===saved.taskId&&step.stepId===saved.stepId,'DURABLE_RESULT_STEP_BINDING');
  if(step.status!=='completed')this.portfolio.reconcileStep(saved.taskId,saved.stepId,{recordKind:kind,recordKey:key,requestHash:identity,outputHash:saved.outputHash});return saved.result;
 }
 private persistResult(kind:'portfolio-model-result'|'portfolio-tool-result',task:Task,stepId:string,identity:string,result:any){
  const key=task.id+'/'+stepId,outputHash=hash(result);this.store.transaction(()=>{const old=this.store.get(kind,key);if(old){requireThat(old.identity===identity&&old.outputHash===outputHash,'DURABLE_RESULT_CONFLICT');return;}this.store.put(kind,key,{taskId:task.id,stepId,requestHash:identity,outputHash,output:result,identity,result,provenance:this.model.kind},null);this.store.record(workerScope(task.ventureId,task.id),'result-'+hash(key).slice(0,28),kind,{identity,result,provenance:this.model.kind});});
 }
 /** No inference or tool dispatch: recover only persisted output from the same exact intent. */
 async recover(){
  const recovered=this.portfolio.recover({ownerAlive:owner=>{if(owner===this.ownerId)return this.active.size>0;const match=/^worker-(\d+)-/.exec(owner);if(!match)return true;try{process.kill(Number(match[1]),0);return true;}catch{return false;}}});
  const reconciled:string[]=[];
  for(const step of this.rows('portfolio-step').filter(s=>['reserved','uncertain'].includes(s.status))){
   const task=this.portfolio.getTask(step.taskId);if(task.lease)continue;
   const key=task.id+'/'+step.stepId,kind=step.kind==='model'?'portfolio-model-result':'portfolio-tool-result',intent=this.store.get(step.kind==='model'?'portfolio-model-request':'portfolio-tool-intent',key);if(!intent)continue;
   if(!this.store.get(kind,key)&&step.kind==='tool'&&!intent.call.name.startsWith('research.')){const result=await this.tools.recoverOperation?.(intent.operationId,task.ventureId,task.id);if(result)this.persistResult(kind,task,step.stepId,intent.identity,result);}
   if(this.store.get(kind,key)){this.settleSaved(kind,key,intent.identity);reconciled.push(key);}
  }
  const closedFinalizations:string[]=[];
  for(const f of this.rows('portfolio-finalization').filter(f=>f.phase==='published')){
   const t=this.portfolio.getTask(f.taskId);if(t.status!=='completed'||!t.outputCurrent)continue;
   const w=this.tools.load(t.ventureId,t.id);requireThat(w.manifest.sha256===f.manifestHash&&this.tools.download,'FINALIZATION_RECOVERY_STALE');
   const payload=JSON.parse(this.tools.download(t.ventureId,t.id).content);requireThat(hash(payload)===f.publication.payloadHash&&t.outputArtifacts.length>0&&t.result?.artifacts.every((a:any)=>a.metadata?.manifestHash===f.manifestHash),'FINALIZATION_RECOVERY_BINDING');
   this.store.transaction(()=>{const current=this.store.get('portfolio-finalization',f.id);requireThat(current?.phase==='published'&&current.manifestHash===f.manifestHash,'FINALIZATION_RECOVERY_BINDING');this.store.put('portfolio-finalization',f.id,{...current,phase:'closed',taskStatus:t.status,outputArtifacts:t.outputArtifacts,unresolvedObligations:payload.obligations,independentSemanticReview:false,recoveredAfterAtomicTaskClosure:true},current._version);});closedFinalizations.push(f.id);
  }
  return {recovered,reconciled,closedFinalizations,pending:this.portfolio.snapshot().tasks.filter(t=>t.status==='needs_reconciliation').map(t=>t.id)};
 }
 /** Explicit bounded recovery preparation; this never dispatches or clears cost. */
 prepareRecovery(taskId:string,parentAttemptId:string){
  requireThat(this.recoveryAuthority,'SIGNED_RECOVERY_AUTHORITY_REQUIRED');const proof=this.recoveryAuthority(parentAttemptId),task=this.portfolio.getTask(taskId),s=this.state(task);
  requireThat(proof.eligible&&proof.taskId===taskId&&proof.ventureId===task.ventureId&&!task.lease&&!task.stopRequested&&!task.invalidatedAt&&this.evidence.taskDigest(task)===s.sourceHash,'KNOWN_INCOMPLETE_RECOVERY_REQUIRED');
  if(s.pendingRecovery?.parentAttemptId===parentAttemptId)return {taskId,newAttemptId:s.pendingRecovery.newAttemptId,parentAttemptId,providerRequests:0,exposureReleased:0};
  const key=task.id+'/model-'+s.index,parent=this.store.get('portfolio-model-request',key);requireThat(parent?.call.attemptId===parentAttemptId&&!parent.call.recoveryOf,'RECOVERY_PARENT_IDENTITY');
  const next=s.index+1,newAttemptId='p031-'+hash(task.id).slice(0,16)+'-'+next,request={...parent.call.request,requestId:newAttemptId,context:{...parent.call.request.context,recoveryInstruction:portfolioRecoveryInstruction}};
  requireThat(this.rows('portfolio-step').filter(r=>r.taskId===taskId&&r.kind==='model').length<task.resource.modelCalls,'TASK_RECOVERY_CALL_CAP');
  const intent=this.store.get('portfolio-recovery-intent',newAttemptId)??{id:newAttemptId,parentAttemptId,ventureId:task.ventureId,taskId,reason:'known-incomplete-v1',parentRequestHash:proof.parentRequestHash??proof.requestHash,createdAt:new Date().toISOString()};
  requireThat(intent.parentAttemptId===parentAttemptId&&intent.taskId===taskId,'RECOVERY_INTENT_CHANGED');
  if(!this.store.get('portfolio-recovery-intent',newAttemptId))this.store.transaction(()=>this.store.put('portfolio-recovery-intent',newAttemptId,intent,null));
  // Each phase is durable and idempotent. Until final preparation, replay of the
  // known failure cannot dispatch another provider call.
  const result={knownFailure:'MODEL_RESPONSE_INCOMPLETE',providerEvidence:proof};if(!this.store.get('portfolio-model-result',key))this.persistResult('portfolio-model-result',task,'model-'+s.index,parent.identity,result);this.settleSaved('portfolio-model-result',key,parent.identity);
  return this.store.transaction(()=>{
   const execution=this.store.get('portfolio-execution',taskId);this.store.put('portfolio-execution',taskId,{...execution,index:next,pendingRecovery:{parentAttemptId,newAttemptId,request,schema:parent.call.schema}},execution._version);
   const current=this.portfolio.getTask(taskId);this.store.put('portfolio-task',taskId,{...current,status:'queued',interruptedLease:null,reason:'Fresh linked recovery prepared for an observed incomplete response; original exposure retained.',nextAction:'Resume the exact linked request under the unchanged signed cap.',maxAttempts:Math.max(current.maxAttempts,current.attempts+1)},(current as any)._version);
   this.store.record(workerScope(task.ventureId,taskId),'recovery-'+hash(newAttemptId).slice(0,20),'portfolio.linked_recovery_prepared',intent);return {taskId,newAttemptId,parentAttemptId,providerRequests:0,exposureReleased:0};
  });
 }
 private async call(lease:TaskLease,planning=false){
  const t=this.assertCurrent(lease.task),s=this.state(t),stepId='model-'+s.index,key=t.id+'/'+stepId;
  const prior=this.store.get('portfolio-model-request',key),sources=this.evidence.forTask(t),v=this.portfolio.getVenture(t.ventureId);
  if(!prior&&!s.pendingRecovery){const a=this.accounting?.().taskAllocations?.find((x:any)=>x.id===t.id);if(this.model.kind==='actual_model'&&this.accounting)requireThat(a,'TASK_NOT_IN_FROZEN_RELEASE');if(a){const used=this.rows('portfolio-model-request').filter(r=>r.call?.request?.scope?.runId===workerScope(t.ventureId,t.id).runId&&!r.call.recoveryOf).length;requireThat(used<a.workCalls,'TASK_ORDINARY_ALLOWANCE_EXHAUSTED');}}
  if(!prior&&!s.pendingRecovery&&!planning&&finalizationEnabled(t)){
   const cap=this.accounting?.().taskAllocations?.find((a:any)=>a.id===t.id)?.workCalls??t.resource.modelCalls;
   const used=this.rows('portfolio-model-request').filter(r=>r.call?.request?.scope?.runId===workerScope(t.ventureId,t.id).runId&&!r.call.recoveryOf).length;
   const local=t.resource.localToolRuns-this.rows('portfolio-step').filter(r=>r.taskId===t.id&&r.kind==='tool').length;
   const w=this.tools.load(t.ventureId,t.id),feasibility=finishingFeasibility(t,w,cap-used,local,this.finishingObservations(t,w));
   if(!feasibility.feasible){const old=this.store.get('portfolio-finishing-shortage',t.id);this.store.transaction(()=>this.store.put('portfolio-finishing-shortage',t.id,{taskId:t.id,at:new Date().toISOString(),...feasibility,providerAdmission:false},old?._version??null));requireThat(false,'FINISHING_CAPACITY_INSUFFICIENT');}
  }
  const attemptId='p031-'+hash(t.id).slice(0,16)+'-'+s.index;
  const context=prior?.call.request.context??s.pendingRecovery?.request.context??this.requestContext(t,planning);
  const request=prior?.call.request??s.pendingRecovery?.request??makeWorkerRequest({ventureId:t.ventureId,taskId:t.id,attemptId,context,tools:t.allowedTools,procedure:s.procedure});
  const schema=planning?planningSchema:workerSchema;
  const validate:(out:any)=>void=planning?(out:any)=>{validatePlan(out,sources,[...ALL_TOOL_NAMES],CAPABILITIES.filter(c=>c!=='portfolio.reassess'),(context as any).existingUnstartedTaskIds);for(const task of out.tasks)requireThat(CAPABILITY_PROFILES[task.capability].requiredTools.every(tool=>task.allowedTools.includes(tool)),'PLAN_REQUIRED_DELIVERY_TOOLS');}:validateWorker;
  const call:WorkerCall={attemptId,ventureId:t.ventureId,goal:v.goal,sourceHosts:[],request,schema,validate,...(s.pendingRecovery?{recoveryOf:s.pendingRecovery.parentAttemptId}:{})};
  const identity=requestIdentity(call);
  if(prior)requireThat(prior.identity===identity,'PERSISTED_REQUEST_CHANGED');
  else {const {validate:omitted,...serializable}=call;this.store.transaction(()=>this.store.put('portfolio-model-request',key,{identity,call:serializable},null));}
  let result:ModelResult;const saved=this.store.get('portfolio-model-result',key);
  if(saved)result=this.settleSaved('portfolio-model-result',key,identity);
  else{
   // A prior admission without a durable result never permits a new inference.
   requireThat(!this.store.get('portfolio-step',key),'MODEL_COMPLETION_UNCERTAIN');this.portfolio.reserveStep(t.id,lease.token,'model',stepId);
   try{result=await this.model.run(call);}catch(e){if((e as any)?.simulatedCrash)throw e;const error=e as any,initial=error?.code==='PORTFOLIO_INITIAL_REQUEST_CHANGED'&&['expected','actual'].every(k=>/^[a-f0-9]{64}$/.test(error[k]?.bodyHash)&&/^[a-f0-9]{64}$/.test(error[k]?.schemaHash)),byteLimit=error?.code==='PORTFOLIO_REQUEST_BYTES_LIMIT'&&error.providerAdmission===false&&/^[a-f0-9]{64}$/.test(error.requestHash)&&Number.isSafeInteger(error.actualBytes)&&Number.isSafeInteger(error.limitBytes)&&error.actualBytes>error.limitBytes,knownLocal=initial||byteLimit;this.portfolio.finishStep(t.id,lease.token,stepId,{uncertain:!knownLocal,error:code(e),...(knownLocal?{outputRef:{kind:'local_authority_rejection',providerAdmission:false,...(initial?{expected:error.expected,actual:error.actual}:{requestHash:error.requestHash,actualBytes:error.actualBytes,limitBytes:error.limitBytes})}}:{})});throw e;}
   // Preserve the received bytes BEFORE semantic/schema acceptance. Known invalid
   // output is a failed response, not uncertainty about whether a call occurred.
   this.persistResult('portfolio-model-result',t,stepId,identity,result);this.afterPersist?.('model',t.id);
   this.portfolio.finishStep(t.id,lease.token,stepId,{outputRef:{kind:'portfolio-model-result',key,sha256:hash(result)}});
  }
  modelResult(result);
  requireThat(this.model.kind==='offline_mock'?result.route.kind==='fixture'&&((result.usage.cost.status==='known'&&result.usage.cost.money?.minorUnits===0)||result.route.provider==='offline-responses-mock'):result.route.kind==='live'&&result.route.model===request.role.model,'MODEL_PROVENANCE_MISMATCH');
  validate(result.output);return result;
 }
 private async tool(lease:TaskLease,decision:WorkerDecision,finalizePhase?:'check'|'publish'){
  const t=this.assertCurrent(lease.task),s=this.state(t),call=decision.toolCall!;
  requireThat(t.allowedTools.includes(call.name),'TASK_TOOL_DENIED');
  const stepId=finalizePhase?'finalize-'+s.index+'-'+finalizePhase:'tool-'+s.index,key=t.id+'/'+stepId,operationId='tool-'+hash(key).slice(0,28),identity=hash(call),old=this.store.get('portfolio-tool-result',key);
  if(old)return this.settleSaved('portfolio-tool-result',key,identity);
  if(call.name==='research.fetch'){requireThat(this.evidence.network,'PUBLIC_RESEARCH_DISABLED');publicUrl(call.arguments.url!);}
  if(call.name==='research.search')requireThat(this.evidence.searchPort,'SEARCH_CONNECTION_REQUIRED');
  const prior=this.store.get('portfolio-tool-intent',key);if(prior)requireThat(prior.identity===identity,'TOOL_INTENT_CHANGED');else this.store.transaction(()=>this.store.put('portfolio-tool-intent',key,{identity,call,operationId},null));
  const oldStep=this.store.get('portfolio-step',key);this.portfolio.reserveStep(t.id,lease.token,'tool',stepId);
  let result:any;
  try{
   if(oldStep){result=await this.tools.recoverOperation?.(operationId,t.ventureId,t.id);requireThat(result,'TOOL_COMPLETION_UNCERTAIN');}
   else if(call.name==='research.fetch'){result=await this.evidence.fetch(t.ventureId,call.arguments.url!);if(result.source)this.save(t,{retrievedSources:[...(this.state(t).retrievedSources??[]),{id:result.source.id,sha256:result.source.sha256}]});if(result.source&&this.tools.updateInputs){const w=this.tools.load(t.ventureId,t.id);if(w.kind==='service')this.tools.updateInputs(t.ventureId,t.id,{...w.inputs,sources:this.evidence.forTask(t).map(s=>({id:s.id,title:s.title,text:s.text,rights:s.rights}))},'New permitted source retrieved by this task');}this.save(t,{sourceHash:this.evidence.taskDigest(t)});}
   else if(call.name==='research.search')result=await this.evidence.search(t.ventureId,t.id,call.arguments.query!,'search-'+hash(key).slice(0,24));
   else if(call.name==='research.read'){try{result=this.evidence.read(t.ventureId,call.arguments.path!,Number(call.arguments.query),t);}catch(e){result={ok:false,error:code(e),effect:'none',retryable:false,reason:'Local retained-source read failed before any external activity.'};}}
   else result=await this.tools.execute({ventureId:t.ventureId,taskId:t.id,tool:call.name,args:call.name==='workspace.patch'?structuredClone(call.arguments):Object.fromEntries(Object.entries(call.arguments).filter(([k,v])=>v!==null||k==='expectedHash')),operationId});
   this.persistResult('portfolio-tool-result',t,stepId,identity,result);this.afterPersist?.('tool',t.id);
   this.portfolio.finishStep(t.id,lease.token,stepId,{outputRef:{kind:'portfolio-tool-result',key,sha256:hash(result)}});return result;
  }catch(e){if((e as any)?.simulatedCrash)throw e;this.portfolio.finishStep(t.id,lease.token,stepId,{uncertain:!this.store.get('portfolio-tool-result',key),error:code(e)});throw e;}
 }
 private async execute(lease:TaskLease){
  const t=lease.task,started=Date.now();const initial=this.state(t);if(!initial.startedAt)this.save(t,{startedAt:new Date().toISOString(),modelProvenance:this.model.kind});
  const beat=setInterval(()=>{try{this.portfolio.heartbeat(t.id,lease.token,240000);}catch{}},10000);beat.unref();
  try{
   this.state(t);
   if(['portfolio.plan','portfolio.reassess'].includes(t.capability))return await this.plan(lease);
   // Generic work may only run when a real executable input contract exists.
   // Proposed capabilities do not manufacture a seeded product or usable service.
   try{this.tools.load(t.ventureId,t.id);}catch{if(this.prepareTask)await this.prepareTask(t);try{this.tools.load(t.ventureId,t.id);}catch{return this.portfolio.fail(t.id,lease.token,{code:'EXECUTABLE_WORKSPACE_REQUIRED',message:'The proposed '+t.capability+' task needs an executable workspace and trusted input/check contract before a worker can fulfill it.',retryable:false});}}
   for(let step=0;step<t.resource.modelCalls;step++){
    const result=await this.call(lease),decision=result.output as WorkerDecision;
    if(decision.action==='blocked')return this.portfolio.fail(t.id,lease.token,{code:'WORKER_BLOCKED',message:decision.reason,retryable:false});
    if(decision.action==='complete'){
     if(!finalizationEnabled(t))return this.complete(lease,decision.reason,Date.now()-started);
     const outcome=await this.finalize(lease,decision.reason,Date.now()-started);if(outcome.completed)return outcome.task;
     const s=this.state(t);this.save(t,{index:s.index+1,pendingRecovery:null,observations:[...s.observations,{workerReason:decision.reason,tool:'artifact.finalize',result:outcome}]});
     this.portfolio.checkpoint(t.id,lease.token,{index:s.index+1,lastTool:'artifact.finalize',manifestHash:outcome.manifestHash,finalization:outcome.reason,modelProvenance:this.model.kind});continue;
    }
    const observation=await this.tool(lease,decision),s=this.state(t);
    this.save(t,{index:s.index+1,pendingRecovery:null,observations:[...s.observations,{workerReason:decision.reason,tool:decision.toolCall!.name,result:observation}]});
    this.portfolio.checkpoint(t.id,lease.token,{index:s.index+1,lastTool:decision.toolCall!.name,manifestHash:observation.manifest?.sha256??null,modelProvenance:this.model.kind});
   }
   return this.portfolio.fail(t.id,lease.token,{code:'TASK_MODEL_LIMIT',message:'The finite task call limit was consumed; preserve observations and diagnose before new work.',retryable:false});
  }catch(e){if((e as any)?.simulatedCrash)throw e;const now=this.portfolio.getTask(t.id);if(now.lease?.token===lease.token){try{return this.portfolio.fail(t.id,lease.token,{code:code(e),message:code(e),retryable:false});}catch(failure){if(code(failure)==='TASK_LEASE_EXPIRED'){this.portfolio.recover();return this.portfolio.getTask(t.id);}throw failure;}}throw e;}finally{clearInterval(beat);}
 }
 private async finalize(lease:TaskLease,reason:string,workerMs:number):Promise<any>{
  const t=this.assertCurrent(lease.task),s=this.state(t),key=t.id+'/finalize-'+s.index;
  const request=this.store.get('portfolio-model-request',t.id+'/model-'+s.index),expected=request?.call.request.context.workspace.manifest.sha256;
  let current=this.tools.load(t.ventureId,t.id);requireThat(expected&&current.manifest.sha256===expected,'FINALIZATION_SOURCE_STALE');
  const original=this.store.get('portfolio-finalization',key);
  const record=(phase:string,extra:any={})=>{const old=this.store.get('portfolio-finalization',key);this.store.transaction(()=>this.store.put('portfolio-finalization',key,{...old,id:key,taskId:t.id,manifestHash:expected,requestHash:request.identity,workerSubmission:reason,phase,semanticAcceptance:'worker proposal only; independent review remains unknown',...extra},old?._version??null));};
  requireThat(!original||original.manifestHash===expected&&original.requestHash===request.identity,'FINALIZATION_BINDING_CHANGED');
  if(!original)record('requested');
  this.portfolio.checkpoint(t.id,lease.token,{index:s.index,lastTool:'artifact.finalize',manifestHash:expected,finalization:original?.phase??'requested',modelProvenance:this.model.kind});
  const observe=(tool:string,result:any)=>{const state=this.state(t);if(!state.observations.some((o:any)=>o.finalizationKey===key&&o.tool===tool))this.save(t,{observations:[...state.observations,{workerReason:reason,tool,result,finalizationKey:key,origin:'controller bounded finalization requested by worker'}]});};
  let checked=this.state(t).observations.filter((o:any)=>o.tool==='check.run'&&o.result.manifest?.sha256===expected&&o.result.ok).at(-1)?.result;
  if(!checked||current.checkedManifest!==expected){
   checked=await this.tool(lease,{action:'tool',reason,toolCall:{name:'check.run',arguments:{path:null,content:null,expectedHash:null,query:null,url:null}}},'check');observe('check.run',checked);
  }
  current=this.tools.load(t.ventureId,t.id);requireThat(current.manifest.sha256===expected,'FINALIZATION_SOURCE_STALE');
  if(!checked.ok||checked.checks?.some((c:any)=>!c.passed)){record('checks_failed',{checks:checked.checks});return {completed:false,reason:'CURRENT_CHECKS_FAILED',manifestHash:expected,checks:checked.checks,effect:'none',nextAction:'Repair the current source or explicitly block. Acceptance rules are unchanged.'};}
  record('checked',{checks:checked.checks});
  const seen=request.call.request.context.observations?.some((o:any)=>o.tool==='check.run'&&o.result?.ok&&o.result?.manifest?.sha256===expected&&o.result.checks?.some((c:any)=>c.id==='software.browser-observation'));
  if(current.kind==='software'&&!seen){record('worker_review_required');return {completed:false,reason:'CURRENT_BROWSER_REVIEW_REQUIRED',manifestHash:expected,effect:'none',nextAction:'Inspect the actual current check.run browser/DOM evidence now supplied. Correct a consequential defect or submit complete with your source-specific review and limitations. No publication has occurred.'};}
  const priorDelivery=this.state(t).observations.findLast((o:any)=>o.tool==='artifact.publish_local'&&o.result.ok&&o.result.manifest?.sha256===expected&&o.result.output?.payloadHash===current.published?.payloadHash)?.result;
  const delivery=priorDelivery??await this.tool(lease,{action:'tool',reason,toolCall:{name:'artifact.publish_local',arguments:{path:null,content:null,expectedHash:null,query:null,url:null}}},'publish');observe('artifact.publish_local',delivery);
  requireThat(delivery.ok,'FINALIZATION_PUBLICATION_FAILED');record('published',{publication:delivery.output});
  this.portfolio.checkpoint(t.id,lease.token,{index:s.index,lastTool:'artifact.finalize',manifestHash:expected,finalization:'published; authenticated readback and closure pending',modelProvenance:this.model.kind});
  this.assertCurrent(t);requireThat(this.tools.load(t.ventureId,t.id).manifest.sha256===expected,'FINALIZATION_SOURCE_STALE');
  const task=this.complete(lease,reason,workerMs);record('closed',{taskStatus:task.status,outputArtifacts:task.outputArtifacts,unresolvedObligations:delivery.output.obligations??[],independentSemanticReview:false});return {completed:true,task};
 }
 private complete(lease:TaskLease,reason:string,workerMs:number){
  const t=this.assertCurrent(lease.task),s=this.state(t),observations=s.observations;
  const delivery=observations.filter((o:any)=>o.tool==='artifact.publish_local'&&o.result.ok).at(-1)?.result;
  const current=this.tools.load(t.ventureId,t.id),manifest=current?.manifest??current;
  requireThat(delivery&&delivery.manifest?.sha256===manifest?.sha256,'CURRENT_DELIVERY_REQUIRED');
  requireThat(current.published&&current.published.manifestHash===manifest.sha256&&delivery.output?.payloadHash===current.published.payloadHash&&this.tools.download,'CURRENT_DELIVERY_READBACK_REQUIRED');
  const delivered=JSON.parse(this.tools.download(t.ventureId,t.id).content);requireThat(hash(delivered)===current.published.payloadHash&&delivered.manifest.sha256===manifest.sha256,'DELIVERY_READBACK_MISMATCH');
  const checked=observations.filter((o:any)=>o.tool==='check.run'&&o.result.manifest?.sha256===manifest?.sha256&&o.result.ok).at(-1)?.result;
  requireThat(checked&&checked.checks?.length>0&&checked.checks.every((c:any)=>c.passed),'CURRENT_INDEPENDENT_CHECKS_REQUIRED');
  const target=(t.inputs as any)?.authoritativeArtifactId;let artifactId='delivery-'+hash(t.id).slice(0,20);
  if(target){requireThat(typeof target==='string'&&(!target.includes('/')||target.startsWith(t.ventureId+'/')),'AUTHORITATIVE_ARTIFACT_SCOPE');const key=target.includes('/')?target:t.ventureId+'/'+target,current=this.store.get('portfolio-artifact',key);requireThat(current&&t.inputArtifacts.some(ref=>(ref.artifactId.includes('/')?ref.artifactId:t.ventureId+'/'+ref.artifactId)===key&&ref.version===current.version&&ref.sha256===current.sha256),'AUTHORITATIVE_ARTIFACT_BINDING_REQUIRED');artifactId=target.includes('/')?target.slice(t.ventureId.length+1):target;}
  const artifact:ArtifactInput={id:artifactId,title:t.title,kind:(t.inputs as any)?.kind??t.capability,provenance:this.model.kind==='offline_mock'?'offline_mock_with_real_local_tool_effects':'actual_model_with_local_tool_effects',summary:reason,content:{manifest,delivery,sourceHash:s.sourceHash},metadata:{taskId:t.id,manifestHash:manifest.sha256,modelProvenance:this.model.kind,procedureHash:s.procedureHash,sourceAuthorship:(t.inputs as any)?.sourceAuthorship??'runtime',semanticReview:'not_independent_human_validation',customerAcceptance:'unobserved'},checks:checked.checks,previewUrl:'/preview?ventureId='+encodeURIComponent(t.ventureId)+'&taskId='+encodeURIComponent(t.id),downloadUrl:'/api/delivery?ventureId='+encodeURIComponent(t.ventureId)+'&taskId='+encodeURIComponent(t.id)};
  return this.portfolio.complete(t.id,lease.token,{artifacts:[artifact],checks:[...checked.checks,{id:'delivery.current',passed:true,summary:'Local delivery readback matches the independently checked current manifest.'}],summary:reason,usage:{workerMs},observations:[{kind:'local_deliverable_verified',summary:'Produced and checked '+t.title+'. Customer acceptance and independent correction time remain unobserved.',source:t.id,provenance:this.model.kind,reassess:(t.inputs as any)?.feedbackPolicy!=='defer_to_declared_decision',metadata:{manifestHash:manifest.sha256,toolFailureCount:observations.filter((o:any)=>o.result.ok===false).length}}]});
 }
 private async plan(lease:TaskLease){
  const t=lease.task,result=await this.call(lease,true),p=structuredClone(result.output) as PlanningProposal;
  const gate=(t.inputs as any)?.prototypeGate;
  if(gate){const selected=p.alternatives.filter(a=>a.name===gate.alternativeName);requireThat(selected.length===1,'EXPLICIT_PROTOTYPE_DECISION_REQUIRED');if(selected[0].decision!=='prototype')p.cancelTaskIds=[...new Set([...p.cancelTaskIds,...gate.cancelUnlessPrototype])];}

  this.assertCurrent(t);const tasks=p.tasks.map(x=>({...x,id:x.id+'-'+hash(t.id).slice(0,6),dependsOn:[t.id,...x.dependsOn.map(id=>id+'-'+hash(t.id).slice(0,6))],requiredChecks:[x.capability==='portfolio.plan'?'proposal.reference_checks':'delivery.current'],inputs:{requiresGrant:this.model.kind==='actual_model',proposed:true,parentPlanningTaskId:t.id},resource:{modelCalls:8,localToolRuns:20}}));
  this.store.record(workerScope(t.ventureId,t.id),'executive-proposal-'+hash(t.id).slice(0,20),'portfolio.executive_proposal',{proposal:result.output,appliedProposal:p,controllerAdjustments:gate?{kind:'worker-visible-prototype-gate',alternativeName:gate.alternativeName,cancelledUnlessPrototype:gate.cancelUnlessPrototype}:null,sourceSnapshot:this.evidence.forTask(t),provenance:this.model.kind,semanticTruth:'proposal_not_established_causality'});
  if(t.capability==='portfolio.reassess')return this.portfolio.applyReassessment(t.id,lease.token,{rationale:p.rationale,tasks,cancelTaskIds:p.cancelTaskIds,priority:p.priority});
  return this.portfolio.applyPlanning(t.id,lease.token,{rationale:p.rationale,tasks,cancelTaskIds:p.cancelTaskIds,priority:p.priority,evidenceIds:this.evidence.forTask(t).map(source=>source.id),summary:p.summary,checks:[{id:'proposal.reference_checks',passed:true}],artifacts:[{id:'understanding-'+hash(t.id).slice(0,16),title:'Business understanding and proposed work',kind:'business_proposal',provenance:this.model.kind,content:p,summary:p.summary}]});
 }
}
