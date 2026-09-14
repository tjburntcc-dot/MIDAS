import {hash, requireThat} from '../contracts.ts';
import {StateStore} from '../state.ts';
import type {Task} from '../portfolio/contracts.ts';
import type {WorkTools} from '../portfolio/engine.ts';
import {EvidenceLibrary} from '../portfolio/evidence.ts';
import {taskDefinitionHash} from '../portfolio/live.ts';
import {AdaptiveWorkspace} from './executor.ts';
import type {ExecutorBackend} from './executor.ts';
import {AdaptiveCapabilities} from './capabilities.ts';
import type {CapabilityBinding, CapabilityFile} from './capabilities.ts';
import {ADAPTIVE_TOOL, adaptiveEnabled} from './worker-contract.ts';

const KIND='adaptive-tool-operation';
const effects=['project-files','isolated-command'];
export const adaptiveToolContract={id:ADAPTIVE_TOOL,description:'Task-scoped capability acquisition workbench. One payload JSON object. Files are separate from published delivery source; commands never run on the unisolated host. Retain candidate skills only after observed tests; continue the original task.',actions:{
 status:{},list:{path:'relative directory, optional'},read:{path:'relative file'},write:{path:'relative file',content:'complete UTF-8 text',expectedHash:'current sha256 or null for new'},patch:{path:'relative file',expectedHash:'exact sha256',edits:[{find:'unique literal',replace:'replacement'}]},
 command:{argv:['executable','argument'],cwd:'relative directory, optional',timeoutMs:'integer <= 60000'},
 episode:{type:'open | diagnose | acquire | resume | retain',fields:'open: objective, obstacle, obstacleEvidence(receipt IDs); diagnose: episodeId, missingCapability, alternatives[{approach,reason}], selectedApproach; acquire: episodeId, package; resume: episodeId, evidenceRef(successful command operationId); retain: episodeId'},
 verify:{episodeId:'episode',checks:[{id:'package test ID',operationId:'successful command receipt ID'}]},
 candidates:{},importCandidate:{candidateId:'same-business candidate; hash-checked copy into this new workbench only'},receiptRead:{operationId:'same-task receipt',offset:'character offset, optional'},episodeView:{episodeId:'same-task episode'},reuse:{candidateId:'same-business candidate',purposeRelevant:'boolean semantic proposal',preconditionEvidence:'map of precondition to existing successful command operationId'},
 reuseOutcome:{reuseOperationId:'prior applicability operation',operationId:'later command receipt',candidateId:'same candidate'}},
 package:{purpose:'scope',preconditions:['conditions'],inputs:['inputs'],outputs:['outputs'],procedure:'reusable instructions',files:[{path:'relative path',sha256:'actual workbench file hash'}],dependencies:['versioned dependencies'],effects,tests:['check IDs'],failureModes:['known failure modes'],sourceRefs:['actual retained references']},
 limits:{network:'off',commands:'only explicitly enabled isolated backend; no fallback',fileBytes:1048576,commandOutputBytes:16384,commandTimeoutMs:60000},
 interpretation:'Command exit and worker-authored tests are mechanical observations, not independent semantic acceptance. Injected backends are fixture evidence only. No automatic skill promotion.'};

/** Composite port for the EXISTING PortfolioEngine, not another execution loop. */
export class AdaptiveWorkTools implements WorkTools {
 readonly base:WorkTools;readonly store:StateStore;readonly root:string;readonly taskFor:(id:string)=>Task;
 readonly evidence:EvidenceLibrary;readonly backend?:ExecutorBackend;
 readonly provenance:'fixture'|'development'|'actual_model';readonly capabilities:AdaptiveCapabilities;
 constructor(options:{base:WorkTools;store:StateStore;root:string;taskFor:(id:string)=>Task;evidence:EvidenceLibrary;backend?:ExecutorBackend;provenance:'fixture'|'development'|'actual_model'}){
  Object.assign(this,options);this.base=options.base;this.store=options.store;this.root=options.root;this.taskFor=options.taskFor;this.evidence=options.evidence;this.backend=options.backend;this.provenance=options.provenance;
  requireThat(!options.backend||options.provenance!=='actual_model','INJECTED_EXECUTOR_NOT_LIVE_EVIDENCE');
  this.capabilities=new AdaptiveCapabilities(this.store,(binding,files)=>this.currentFiles(binding,files));
 }
 binding(task:Task):CapabilityBinding {return {businessId:task.ventureId,taskId:task.id,contextHash:hash({task:taskDefinitionHash(task),evidence:this.evidence.taskDigest(task)})};}
 private task(ventureId:string,taskId:string){const t=this.taskFor(taskId);requireThat(t.ventureId===ventureId&&adaptiveEnabled(t),'ADAPTIVE_SCOPE_DENIED');requireThat(!t.invalidatedAt&&!t.stopRequested,'ADAPTIVE_TASK_STALE');return t;}
 workspace(task:Task){requireThat(adaptiveEnabled(task),'ADAPTIVE_NOT_ENABLED');return new AdaptiveWorkspace({root:this.root,businessId:task.ventureId,taskId:task.id,backend:this.backend,policy:{allowCommands:(task.inputs as any).adaptiveExecution.allowCommands===true,network:'off',maxOutputBytes:16384,maxTimeoutMs:60000}});}
 private currentFiles(binding:CapabilityBinding,files:CapabilityFile[]){const task=this.task(binding.businessId,binding.taskId);requireThat(hash(this.binding(task))===hash(binding),'CAPABILITY_CONTEXT_STALE');const w=this.workspace(task);return files.map(f=>({path:f.path,sha256:w.read(f.path).sha256}));}
 private rows(kind:string){return this.store.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(row=>JSON.parse(String(row.body)));}
 private sequence(id:string){return Number(this.store.db.prepare('SELECT rowid AS sequence FROM entities WHERE kind=? AND key=?').get(KIND,id)?.sequence??0);}
 private commandReceipt(binding:CapabilityBinding,id:string){const r=this.store.get(KIND,id);requireThat(r&&hash(r.binding)===hash(binding)&&r.action==='command'&&r.status==='completed','ADAPTIVE_COMMAND_RECEIPT_REQUIRED');return r;}
 contextFor(task:Task){if(!adaptiveEnabled(task))return null;const binding=this.binding(task);return {binding,episodes:this.capabilities.list(binding).map(e=>({id:e.id,objective:e.objective,obstacle:e.obstacle,state:e.state,packageHash:e.packageHash,candidateId:e.candidateId,verification:e.verification?{receiptId:e.verification.receiptId,provenance:e.verification.provenance}:null})),commandPolicy:{enabled:(task.inputs as any).adaptiveExecution.allowCommands===true,network:'off',isolation:this.backend?'injected_fixture':'bubblewrap_required',availability:'A successful isolated command has not been assumed; consult actual receipts.'},candidateSkills:this.rows('adaptive-skill-candidate').filter(r=>r.businessId===task.ventureId).map(r=>({id:r.id,purpose:r.package.purpose,preconditions:r.package.preconditions,status:r.status,qualification:r.qualification})),receiptIds:this.rows(KIND).filter(r=>hash(r.binding)===hash(binding)).map(r=>({operationId:r.id,action:r.action,status:r.status,ok:r.result?.ok}))};}
 finishingFloor(task:Task){
  if(!adaptiveEnabled(task))return 0;
  const binding=this.binding(task),commands=this.rows(KIND).filter(r=>r.action==='command'&&r.result?.ok&&hash(r.binding)===hash(binding));
  return this.capabilities.list(binding).reduce((total,e)=>{
   if(e.state==='diagnosing')return total+6;
   if(e.state==='acquiring'&&!e.package)return total+5;
   if(e.state==='acquiring'){
    const current=this.currentFiles(binding,e.package!.files),tested=commands.some(r=>(r.fullOutput??r.result.output).packages?.some((p:any)=>p.episodeId===e.id&&hash(p.files)===hash(current)));
    return total+(tested?3:4);
   }
   if(e.state==='verified'){const current=this.currentFiles(binding,e.package!.files),resumable=commands.some(r=>this.sequence(r.id)>this.sequence(e.verification!.receiptId)&&(r.fullOutput??r.result.output).packages?.some((p:any)=>p.episodeId===e.id&&hash(p.files)===hash(current)));return total+(resumable?1:2);}
   return total;
  },0);
 }
 completionBlocker(task:Task){if(!adaptiveEnabled(task))return null;const pending=this.capabilities.list(this.binding(task)).filter(e=>!['resumed','retained'].includes(e.state));return pending.length?{code:'ADAPTIVE_CAPABILITY_UNRESOLVED',episodes:pending.map(e=>({id:e.id,state:e.state,obstacle:e.obstacle})),nextAction:'Resolve, verify and resume the original objective, or report the precise blocked branch. Do not declare it complete.'}:null;}
 load(ventureId:string,taskId:string){return this.base.load(ventureId,taskId);}
 download(ventureId:string,taskId:string,path?:string){requireThat(this.base.download,'DELIVERY_DOWNLOAD_UNAVAILABLE');return this.base.download!(ventureId,taskId,path);}
 repairCandidate(ventureId:string,taskId:string,id?:string){return this.base.repairCandidate?.(ventureId,taskId,id);}
 updateInputs(ventureId:string,taskId:string,inputs:any,reason:string){return this.base.updateInputs?.(ventureId,taskId,inputs,reason);}
 toolContract(){return [...(this.base.toolContract?.()??[]),adaptiveToolContract];}
 recoverOperation(operationId:string,ventureId:string,taskId:string){
  const r=this.store.get(KIND,operationId);if(!r)return this.base.recoverOperation?.(operationId,ventureId,taskId);
  requireThat(r.binding.businessId===ventureId&&r.binding.taskId===taskId,'ADAPTIVE_SCOPE_DENIED');if(r.status==='completed')return r.result;
  if(r.action!=='command')return null;
  const observed=this.workspace(this.taskFor(taskId)).recoverCommand(operationId);if(!observed)return null;
  const result={ok:observed.status==='completed',tool:ADAPTIVE_TOOL,observationId:operationId,manifest:null,checks:[],changes:[],output:{...observed,packages:r.packages??[],provenance:r.provenance,independentSemanticReview:false},provenance:r.provenance};
  const fullOutput=result.output;if(Buffer.byteLength(JSON.stringify(fullOutput))>18000)(result as any).output={retained:true,operationId,summary:'Complete output retained separately; read relevant chunks.',readMore:{action:'receiptRead',operationId,offset:0}};
  this.store.transaction(()=>this.store.put(KIND,operationId,{...r,status:'completed',result,...(fullOutput!==result.output?{fullOutput}:{}),recovered:true},r._version));return result;
 }
 async execute(call:{ventureId:string;taskId:string;tool:string;args:any;operationId?:string}){
  if(call.tool!==ADAPTIVE_TOOL)return this.base.execute(call);
  const task=this.task(call.ventureId,call.taskId),binding=this.binding(task),id=call.operationId;
  requireThat(typeof id==='string'&&id.length>0,'ADAPTIVE_OPERATION_ID_REQUIRED');
  const payload=JSON.parse(call.args.payload);requireThat(payload&&typeof payload.action==='string','ADAPTIVE_ACTION_REQUIRED');
  const identity=hash({binding,payload}),prior=this.store.get(KIND,id);
  if(prior){requireThat(prior.identity===identity,'ADAPTIVE_OPERATION_CONFLICT');requireThat(prior.status==='completed','ADAPTIVE_OUTCOME_UNCERTAIN');return prior.result;}
  this.store.transaction(()=>this.store.put(KIND,id,{id,binding,identity,action:payload.action,payload,status:'running',provenance:this.provenance,at:new Date().toISOString()},null));
  const workspace=this.workspace(task);
  let output:any,ok=true,error:string|undefined;
  try{
   switch(payload.action){
    case 'status':output=this.contextFor(task);break;
    case 'list':output=workspace.list(payload.path??'.');break;
    case 'read':{const file=workspace.read(payload.path),offset=payload.offset??0;requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<=file.content.length,'ADAPTIVE_READ_OFFSET');const chunk=file.content.slice(offset,offset+12000);output={...file,content:chunk,offset,totalCharacters:file.content.length,nextOffset:offset+chunk.length<file.content.length?offset+chunk.length:null};break;}
    case 'write':output=workspace.write(payload.path,payload.content,payload.expectedHash);break;
    case 'patch':output=workspace.patch(payload.path,payload.expectedHash,payload.edits);break;
    case 'command':{
     // Snapshot declared packages BEFORE command; a later command cannot verify changed source.
     const packages=this.capabilities.list(binding).filter(e=>e.package).map(e=>({episodeId:e.id,files:this.currentFiles(binding,e.package!.files)}));
     this.store.transaction(()=>{const row=this.store.get(KIND,id);this.store.put(KIND,id,{...row,packages},row._version);});
     const receipt=await workspace.command({argv:payload.argv,cwd:payload.cwd,timeoutMs:payload.timeoutMs,operationId:id});
     output={...receipt,packages,provenance:this.provenance,independentSemanticReview:false};ok=receipt.status==='completed';break;
    }
    case 'episode':{
     const {action,...fields}=payload;
     if(fields.type==='open'){requireThat(Array.isArray(fields.obstacleEvidence)&&fields.obstacleEvidence.length>0,'CAPABILITY_OBSTACLE_EVIDENCE_REQUIRED');for(const ref of fields.obstacleEvidence){const r=this.store.get(KIND,ref);requireThat(r&&hash(r.binding)===hash(binding)&&r.status==='completed','CAPABILITY_OBSTACLE_RECEIPT_REQUIRED');}}
     if(fields.type==='acquire'){requireThat(Array.isArray(fields.package?.effects)&&fields.package.effects.every((effect:string)=>effects.includes(effect)),'CAPABILITY_EFFECT_DENIED');requireThat(Array.isArray(fields.package?.sourceRefs),'CAPABILITY_SOURCE_REFS_REQUIRED');const permitted=new Set(this.evidence.forTask(task).map(s=>s.id));for(const ref of fields.package.sourceRefs){const r=this.store.get(KIND,ref);requireThat(permitted.has(ref)||r&&hash(r.binding)===hash(binding)&&r.status==='completed','CAPABILITY_SOURCE_REF_UNKNOWN');}}
     if(fields.type==='resume'){const r=this.commandReceipt(binding,fields.evidenceRef),episode=this.capabilities.view(binding,fields.episodeId);requireThat(r.result.ok,'CAPABILITY_RESUME_COMMAND_FAILED');requireThat(episode.verification&&this.sequence(fields.evidenceRef)>this.sequence(episode.verification.receiptId),'CAPABILITY_RESUME_EVIDENCE_PREDATES_VERIFICATION');}
     output=this.capabilities.apply(binding,{...fields,invocationId:id} as any);break;
    }
    case 'verify':{
     const episode=this.capabilities.view(binding,payload.episodeId);requireThat(episode.package&&Array.isArray(payload.checks),'CAPABILITY_PACKAGE_REQUIRED');
     const currentFiles=this.currentFiles(binding,episode.package!.files);
     const checks=payload.checks.map((c:any)=>{const r=this.commandReceipt(binding,c.operationId),snapshot=(r.fullOutput??r.result.output).packages.find((p:any)=>p.episodeId===episode.id);return {id:c.id,passed:r.result.ok===true&&!!snapshot&&hash(snapshot.files)===hash(currentFiles),evidenceRef:c.operationId};});
     output=this.capabilities.verify(binding,episode.id,{receiptId:id,packageHash:episode.packageHash!,currentFiles,checks,provenance:this.provenance});ok=output.state==='verified';break;
    }
    case 'receiptRead':{const r=this.store.get(KIND,payload.operationId);requireThat(r&&hash(r.binding)===hash(binding)&&r.status==='completed','ADAPTIVE_RECEIPT_REQUIRED');const text=JSON.stringify(r.fullOutput??r.result.output),offset=payload.offset??0;requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<=text.length,'ADAPTIVE_READ_OFFSET');output={operationId:r.id,content:text.slice(offset,offset+12000),offset,totalCharacters:text.length,nextOffset:offset+12000<text.length?offset+12000:null};break;}
    case 'episodeView':output=this.capabilities.view(binding,payload.episodeId);break;
    case 'importCandidate':{
     const candidate=this.store.get('adaptive-skill-candidate',payload.candidateId);requireThat(candidate?.businessId===task.ventureId&&candidate.taskId!==task.id&&candidate.status==='candidate','CAPABILITY_SCOPE_MISMATCH');
     requireThat(candidate.package.effects.every((effect:string)=>((task.inputs as any).adaptiveExecution.allowCommands===true?effects:['project-files']).includes(effect)),'CAPABILITY_EFFECT_DENIED');
     const sourceTask=this.task(candidate.businessId,candidate.taskId);requireThat(hash(this.binding(sourceTask))===hash({businessId:candidate.businessId,taskId:candidate.taskId,contextHash:candidate.contextHash}),'CAPABILITY_CONTEXT_STALE');
     const from=this.workspace(sourceTask),copies=candidate.package.files.map((file:CapabilityFile)=>{const observed=from.read(file.path);requireThat(observed.sha256===file.sha256,'CAPABILITY_ARTIFACT_STALE');return observed;});
     for(const file of copies){let current:any=null;try{current=workspace.read(file.path);}catch(e){requireThat((e as any).code==='ENOENT','CAPABILITY_TARGET_UNREADABLE');}requireThat(!current||current.sha256===file.sha256,'CAPABILITY_TARGET_CONFLICT');}
     output={candidateId:candidate.id,files:copies.map((file:any)=>workspace.write(file.path,file.content,(()=>{try{return workspace.read(file.path).sha256;}catch{return null;}})())),qualification:'unqualified',effects:'project-files',execution:false};break;
    }
    case 'candidates':output=this.rows('adaptive-skill-candidate').filter(r=>r.businessId===task.ventureId);break;
    case 'reuse':{
     const candidate=this.store.get('adaptive-skill-candidate',payload.candidateId);requireThat(candidate?.businessId===task.ventureId,'CAPABILITY_SCOPE_MISMATCH');
     const evidence:Record<string,string>={};for(const [condition,ref] of Object.entries(payload.preconditionEvidence??{})){const r=this.commandReceipt(binding,String(ref));if(r.result.ok)evidence[condition]=String(ref);}
     output=this.capabilities.assessReuse(binding,{invocationId:id,candidateId:candidate.id,currentFiles:this.currentFiles(binding,candidate.package.files),allowedEffects:(task.inputs as any).adaptiveExecution.allowCommands===true?effects:['project-files'],preconditionEvidence:evidence,purposeRelevant:payload.purposeRelevant===true});break;
    }
    case 'reuseOutcome':{
     const candidate=this.store.get('adaptive-skill-candidate',payload.candidateId);requireThat(candidate?.businessId===task.ventureId,'CAPABILITY_SCOPE_MISMATCH');
     const reuse=this.store.get('adaptive-skill-reuse',hash({binding,invocationId:payload.reuseOperationId}));requireThat(reuse?.candidateId===candidate.id,'CAPABILITY_REUSE_CANDIDATE_MISMATCH');
     const receipt=this.commandReceipt(binding,payload.operationId);requireThat(this.sequence(payload.operationId)>this.sequence(payload.reuseOperationId),'CAPABILITY_REUSE_EVIDENCE_PREDATES_APPLICABILITY');
     output=this.capabilities.recordReuseOutcome(binding,{invocationId:id,reuseInvocationId:payload.reuseOperationId,passed:receipt.result.ok===true,evidenceRefs:[payload.operationId],provenance:this.provenance,currentFiles:this.currentFiles(binding,candidate.package.files)});break;
    }
    default:requireThat(false,'ADAPTIVE_ACTION_UNSUPPORTED');
   }
  }catch(e){
   if((e as any)?.simulatedCrash)throw e;
   if(payload.action==='command'){try{workspace.recoverCommand(id);}catch(recovery){if(String((recovery as any)?.message).includes('EXECUTOR_OUTCOME_UNCERTAIN'))throw recovery;}}
   ok=false;error=String((e as any)?.code??(e as any)?.message??e).slice(0,500);output={effect:'Inspect durable prior receipts; no automatic replay of uncertain operations.',error};}
  const fullOutput=output;
  if(Buffer.byteLength(JSON.stringify(output??null))>18000)output={retained:true,operationId:id,summary:'Complete output retained separately; read all relevant chunks before relying on it.',readMore:{action:'receiptRead',operationId:id,offset:0}};
  const result={ok,tool:ADAPTIVE_TOOL,observationId:id,manifest:null,checks:[],changes:[],output,...(error?{error}:{}),provenance:this.provenance};
  this.store.transaction(()=>{const r=this.store.get(KIND,id);this.store.put(KIND,id,{...r,status:'completed',result,...(fullOutput!==output?{fullOutput}:{}),finishedAt:new Date().toISOString()},r._version);});return result;
 }
}
