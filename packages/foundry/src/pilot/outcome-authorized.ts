/** Prospective, signed authority for one persisted owner outcome mandate.
 *
 * Preparation writes an unsigned payload. Explicit owner signing requires its
 * exact hash and supplied key; production loading trusts only the pinned public
 * key. Tests may inject an ephemeral signed mock envelope and explicit transport.
 */
import {existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {hostname} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,hash,rawHash,requireThat,scopeKey} from '../contracts.ts';
import type {ModelRequest,Principal,Scope} from '../contracts.ts';
import {signed,verified} from '../experiment/config.ts';
import {assertCountableRequest} from '../experiment/token-count.ts';
import {buildResponsesBody} from '../model-port.ts';
import {OperatingModels,implementationHash as operatingImplementationHash} from '../operations/model.ts';
import type {OperatingGrant} from '../operations/model.ts';
import {PortfolioEngine} from '../portfolio/engine.ts';
import {portfolioRoute,taskDefinitionHash} from '../portfolio/live.ts';
import {ProcedureRegistry} from '../portfolio/learning.ts';
import {ALL_TOOL_NAMES,FINALIZING_WORKER_PROCEDURE,workerSchema,workerScope,validateWorker} from '../portfolio/worker.ts';
import type {WorkerCall,WorkerModel} from '../portfolio/worker.ts';
import {PilotLearning} from './learning.ts';
import {OUTCOME_PLANNER_PROCEDURE,outcomeFamilies,outcomePlanSchema,validateOutcomePlan} from './outcome-contract.ts';
import type {OutcomeFamily} from './outcome-contract.ts';
import {PilotOutcomes} from './outcomes.ts';

const AUTH='pilot.outcome.authorization.json';
const PROPOSAL='pilot.outcome.authorization.request.json';
const POLICY='business-outcome-034-v1';
const LOCAL_TOOLS=['workspace.list','workspace.read','workspace.replace','workspace.patch','workspace.candidate_read','check.run','artifact.publish_local','research.read'] as const;
const PACKAGE_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

type Services={outcomes:PilotOutcomes};
type Stage='outcome-planner'|'outcome-primary'|'outcome-repair';
type FileBinding={path:string;sha256:string};
type Profile={family:OutcomeFamily;capability:string;procedureHash:string;schemaHash:string;allowedTools:string[];effect:'local_preparation_only';minimumCalls:number;executionProfile:string|null};
type OutcomeBinding={kind:typeof POLICY;id:string;outcomeId:string;businessId:string;businessGoalHash:string;mandateHash:string;contextHash:string;scopeContextHash:string;sourceBindings:Array<{id:string;sha256:string;permission:string}>;ownerObservationBaseline:{correctionHashes:string[];outcomeHashes:string[]};ownerCorrections:{permitted:true;maximumInstructionCharacters:4000;mustBindArtifactHash:true;mustUseRepairReserve:true};allowedFamilies:OutcomeFamily[];maximumCalls:number;repairReserve:number;plannerCalls:1;maximumTasks:6;implementationRoot:string;implementationFiles:FileBinding[];adapterHash:string;planner:{request:ModelRequest;requestHash:string;bodyHash:string;procedureHash:string;schemaHash:string};correctionProcedureHash:string;profiles:Profile[];externalEffects:false};
export type OutcomeGrant=OperatingGrant&{outcome:OutcomeBinding};

function stableMandate(o:any){return {id:o.id,businessId:o.businessId,objective:o.objective,autonomy:o.autonomy,allowedFamilies:o.allowedFamilies,maxCalls:o.maxCalls,repairReserve:o.repairReserve,effects:o.effects,createdAt:o.createdAt};}
function rows(store:any,kind:string){return store.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY key').all(kind).map((r:any)=>JSON.parse(String(r.body)));}
function accountScope(id:string):Scope{return {tenantId:'mason',businessId:'outcome-model-account',runId:id,dataPolicyVersion:POLICY,mode:'fixture'};}
function cleanRelative(path:string){requireThat(typeof path==='string'&&path.length>0&&path.length<=240&&!isAbsolute(path),'OUTCOME_IMPLEMENTATION_PATH');const normalized=path.replace(/\\/g,'/');requireThat(!normalized.split('/').includes('..')&&!normalized.startsWith('/'),'OUTCOME_IMPLEMENTATION_PATH');return normalized;}
function sourcePaths(directory=join(PACKAGE_ROOT,'src'),base=PACKAGE_ROOT):string[]{
 requireThat(existsSync(directory)&&statSync(directory).isDirectory(),'OUTCOME_IMPLEMENTATION_FILE_MISSING');
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourcePaths(join(directory,entry.name),base):entry.isFile()&&entry.name.endsWith('.ts')?[cleanRelative(relative(base,join(directory,entry.name)))]:[]).sort();
}
function implementationFiles(root:string,paths:string[]){
 const base=resolve(root),normalized=paths.map(cleanRelative).sort();requireThat(base===PACKAGE_ROOT&&hash(normalized)===hash(sourcePaths()),'OUTCOME_IMPLEMENTATION_ROOT_OR_CLOSURE_CHANGED');
 return normalized.sort().map(path=>{const full=resolve(base,path),rel=relative(base,full);requireThat(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&existsSync(full),'OUTCOME_IMPLEMENTATION_FILE_MISSING');return {path,sha256:rawHash(readFileSync(full))};});
}
function adapterHash(){return rawHash(readFileSync(fileURLToPath(import.meta.url)));}
function sourceBindings(context:any){return context.sources.map((s:any)=>({id:s.id,sha256:s.sha256??hash(s.text),permission:s.permission??'worker'}));}
/** Commercial interpretation is a retained proposal, not fresh-work authority.
 * Owner corrections may make it stale while preserving the original source scope. */
function scopeContext(context:any){return {business:context.business,mandate:context.mandate,sources:sourceBindings(context)};}
function profileFor(services:Services,businessId:string,family:OutcomeFamily):Profile{
 const assignment=new PilotLearning(services.outcomes.store).assignment(businessId,family);
 return {family,capability:assignment.capability,procedureHash:assignment.procedureHash,schemaHash:hash(workerSchema),allowedTools:[...LOCAL_TOOLS],effect:'local_preparation_only',minimumCalls:family==='functional-project'?7:3,executionProfile:family==='functional-project'?'functional-project-v1':family==='marketing-page'?'marketing-page-v1':family==='business-site'?'business-site-v1':family==='campaign-packet'?'commercial-campaign-v1':null};
}
function limits(businessId:string,maximum:number,repair:number,countReserve:number){
 const callMinor=205,primary=maximum-repair-1;requireThat(primary>=0,'OUTCOME_FINITE_CAPACITY');
 return {totalMinor:maximum*callMinor+countReserve,concurrency:1,astraCountRequests:maximum,overheadReserve:{minor:countReserve,reason:'Explicit unpriced token-count and bounded same-ID retrieval uncertainty reserve; not a provider fee quote.'},stages:{smoke:{minor:0,attempts:0},development:{minor:maximum*callMinor,attempts:maximum},validation:{minor:0,attempts:0},evaluation:{minor:0,attempts:0}},allocations:[{metadataKey:'businessId',value:businessId,attempts:maximum,minor:maximum*callMinor},{metadataKey:'stage',value:'outcome-planner',attempts:1,minor:callMinor},{metadataKey:'stage',value:'outcome-primary',attempts:primary,minor:primary*callMinor},{metadataKey:'stage',value:'outcome-repair',attempts:repair,minor:repair*callMinor}]};
}
function bodyHash(g:OutcomeGrant,request:ModelRequest,schema:any){const body=buildResponsesBody(g.route,{...request,scope:g.accountScope},schema),bytes=canonical(body);assertCountableRequest(body,196608);return rawHash(bytes);}
function currentImplementation(binding:OutcomeBinding){const files=implementationFiles(binding.implementationRoot,binding.implementationFiles.map(x=>x.path));requireThat(hash(files)===hash(binding.implementationFiles)&&binding.adapterHash===adapterHash(),'OUTCOME_AUTHORIZED_CODE_CHANGED');}
function currentContext(services:Services,g:OutcomeGrant){
 const b=g.outcome,o=services.outcomes.get(b.outcomeId),prepared=services.outcomes.prepare(o.id);
 requireThat(hash(stableMandate(o))===b.mandateHash&&o.businessId===b.businessId&&hash(o.allowedFamilies)===hash(b.allowedFamilies)&&o.maxCalls===b.maximumCalls&&o.repairReserve===b.repairReserve,'OUTCOME_OWNER_MANDATE_CHANGED');
 requireThat((o.contextHash===null&&prepared.contextHash===b.contextHash||o.contextHash===prepared.contextHash)&&hash(scopeContext(prepared.context))===b.scopeContextHash,'OUTCOME_CONTEXT_CHANGED');
 requireThat(hash(sourceBindings(prepared.context))===hash(b.sourceBindings),'OUTCOME_SOURCE_BINDING_CHANGED');
 const corrections=services.outcomes.knowledge.corrections(b.businessId),outcomes=services.outcomes.knowledge.outcomes(b.businessId),prefix=corrections.slice(0,b.ownerObservationBaseline.correctionHashes.length),added=corrections.slice(b.ownerObservationBaseline.correctionHashes.length),declared=o.corrections??[];
 requireThat(hash(prefix.map((x:any)=>hash(x)))===hash(b.ownerObservationBaseline.correctionHashes)&&hash(outcomes.map((x:any)=>hash(x)))===hash(b.ownerObservationBaseline.outcomeHashes),'OUTCOME_OWNER_OBSERVATION_CHANGED');
 requireThat(added.length===declared.length&&added.every((x:any,i:number)=>x.id===declared[i].correctionKey&&x.taskId===declared[i].taskId&&x.artifactHash===declared[i].artifactHash&&x.instruction===declared[i].instruction),'OUTCOME_UNBOUND_OWNER_CORRECTION');
 return {o,prepared};
}
function validateGrant(services:Services,root:string,g:OutcomeGrant,approved:boolean){
 const b=g?.outcome;requireThat(b?.kind===POLICY&&/^outcome-034-[A-Za-z0-9_-]+$/.test(b.id),'OUTCOME_SIGNED_BINDING_REQUIRED');
 requireThat(g.kind==='operations-model-grant-v1'&&['mock','live'].includes(g.mode)&&g.root===resolve(root)&&g.host===hostname()&&g.implementationHash===operatingImplementationHash(),'OUTCOME_GRANT_LOCATION_OR_CODE');
 requireThat(hash(g.accountScope)===hash(accountScope(b.id))&&g.retries===0&&g.providerConcurrency===1&&g.countDeadlineMs===10000&&g.countRequestByteCeiling===196608&&g.externalAuthority===false&&!g.recovery&&!g.stageContracts&&!g.learningGate,'OUTCOME_GRANT_SCOPE');
 requireThat(/^proj_[A-Za-z0-9_-]+$/.test(g.projectId)&&(g.credentialFile===null||typeof g.credentialFile==='string'&&isAbsolute(g.credentialFile)),'OUTCOME_PROJECT_OR_CREDENTIAL_PATH');
 requireThat(b.externalEffects===false&&b.plannerCalls===1&&b.maximumTasks===6&&hash(b.allowedFamilies)===hash(services.outcomes.get(b.outcomeId).allowedFamilies)&&b.allowedFamilies.every(f=>outcomeFamilies.includes(f)),'OUTCOME_OWNER_SCOPE');
 requireThat(b.ownerCorrections?.permitted===true&&b.ownerCorrections.maximumInstructionCharacters===4000&&b.ownerCorrections.mustBindArtifactHash===true&&b.ownerCorrections.mustUseRepairReserve===true,'OUTCOME_CORRECTION_AUTHORITY');
 requireThat(b.correctionProcedureHash===hash(FINALIZING_WORKER_PROCEDURE),'OUTCOME_CORRECTION_PROCEDURE_CHANGED');
 requireThat(b.profiles.length===b.allowedFamilies.length&&new Set(b.profiles.map(p=>p.family)).size===b.profiles.length,'OUTCOME_PROFILE_SET');
 for(const p of b.profiles){const expected=profileFor(services,b.businessId,p.family);requireThat(b.allowedFamilies.includes(p.family)&&hash(p)===hash(expected)&&p.allowedTools.every(t=>(ALL_TOOL_NAMES as readonly string[]).includes(t)),'OUTCOME_PROFILE_CHANGED');}
 const reserve=g.limits.overheadReserve?.minor;requireThat(Number.isSafeInteger(reserve)&&reserve!>0&&hash(g.limits)===hash(limits(b.businessId,b.maximumCalls,b.repairReserve,reserve!)),'OUTCOME_AGGREGATE_LIMITS');
 requireThat(hash(g.route)===hash(portfolioRoute(b.id,g.projectId,true,true))&&g.businesses.length===1&&g.businesses[0].id===b.businessId&&g.businesses[0].maxCalls===b.maximumCalls&&g.businesses[0].goalHash===b.businessGoalHash&&g.businesses[0].sourceHosts.length===0,'OUTCOME_ROUTE_OR_BUSINESS');
 requireThat(b.planner.requestHash===hash(b.planner.request)&&b.planner.procedureHash===hash(OUTCOME_PLANNER_PROCEDURE)&&b.planner.schemaHash===hash(outcomePlanSchema)&&b.planner.bodyHash===bodyHash(g,b.planner.request,outcomePlanSchema),'OUTCOME_PLANNER_BINDING_CHANGED');
 requireThat(approved?g.approvedBy.trim().length>0&&g.approvalReference.trim().length>0:g.approvedBy===''&&g.approvalReference==='','OUTCOME_APPROVAL_REQUIRED');
 requireThat(Number.isFinite(Date.parse(g.expiresAt)),'OUTCOME_EXPIRY_REQUIRED');currentImplementation(b);return b;
}

/** Prepare an exact unsigned payload. This performs no signing, credential read,
 * token count, model dispatch, account mutation, or provider request. */
export function prepareOutcomeAuthorization(services:Services,input:{root:string;directory:string;implementationRoot?:string;implementationPaths?:string[];id:string;outcomeId:string;projectId:string;credentialFile:string|null;expiresAt:string;countUncertaintyMinor:number;mode?:'mock'|'live';billingPublicKey?:string|null}){
 requireThat(!existsSync(join(input.root,AUTH))&&!existsSync(join(input.directory,PROPOSAL)),'OUTCOME_NEW_UNSIGNED_PACKET_REQUIRED');
 requireThat(/^outcome-034-[A-Za-z0-9_-]+$/.test(input.id)&&/^proj_[A-Za-z0-9_-]+$/.test(input.projectId)&&Date.parse(input.expiresAt)>Date.now()&&Number.isSafeInteger(input.countUncertaintyMinor)&&input.countUncertaintyMinor>0,'OUTCOME_PREPARATION_INPUT');
 const o=services.outcomes.get(input.outcomeId);requireThat(o.state==='awaiting_plan'&&o.autonomy==='prepare_supported_work'&&!services.outcomes.store.get('pilot-outcome-plan-attempt',o.id),'OUTCOME_UNSTARTED_MANDATE_REQUIRED');
 const prepared=services.outcomes.prepare(o.id),implementationRoot=resolve(input.implementationRoot??PACKAGE_ROOT),paths=input.implementationPaths??sourcePaths(),files=implementationFiles(implementationRoot,paths),profiles=o.allowedFamilies.map((f:OutcomeFamily)=>profileFor(services,o.businessId,f)),route=portfolioRoute(input.id,input.projectId,true,true);
 const businessGoalHash=hash(services.outcomes.knowledge.company(o.businessId).goal),binding:OutcomeBinding={kind:POLICY,id:input.id,outcomeId:o.id,businessId:o.businessId,businessGoalHash,mandateHash:hash(stableMandate(o)),contextHash:prepared.contextHash,scopeContextHash:hash(scopeContext(prepared.context)),sourceBindings:sourceBindings(prepared.context),ownerObservationBaseline:{correctionHashes:services.outcomes.knowledge.corrections(o.businessId).map((x:any)=>hash(x)),outcomeHashes:services.outcomes.knowledge.outcomes(o.businessId).map((x:any)=>hash(x))},ownerCorrections:{permitted:true,maximumInstructionCharacters:4000,mustBindArtifactHash:true,mustUseRepairReserve:true},allowedFamilies:[...o.allowedFamilies],maximumCalls:o.maxCalls,repairReserve:o.repairReserve,plannerCalls:1,maximumTasks:6,implementationRoot,implementationFiles:files,adapterHash:adapterHash(),planner:{request:prepared.request,requestHash:hash(prepared.request),bodyHash:'',procedureHash:hash(OUTCOME_PLANNER_PROCEDURE),schemaHash:hash(outcomePlanSchema)},correctionProcedureHash:hash(FINALIZING_WORKER_PROCEDURE),profiles,externalEffects:false};
 const grant:OutcomeGrant={kind:'operations-model-grant-v1',mode:input.mode??'live',root:resolve(input.root),host:hostname(),implementationHash:operatingImplementationHash(),projectId:input.projectId,credentialFile:input.credentialFile,billingPublicKey:input.billingPublicKey??null,expiresAt:input.expiresAt,approvedBy:'',approvalReference:'',accountScope:accountScope(input.id),route,limits:limits(o.businessId,o.maxCalls,o.repairReserve,input.countUncertaintyMinor),businesses:[{id:o.businessId,goalHash:hash(services.outcomes.knowledge.company(o.businessId).goal),sourceHosts:[],maxCalls:o.maxCalls}],retries:0,providerConcurrency:1,countDeadlineMs:10000,countRequestByteCeiling:196608,externalAuthority:false,outcome:binding};
 binding.planner.bodyHash=bodyHash(grant,prepared.request,outcomePlanSchema);validateGrant(services,input.root,grant,false);currentContext(services,grant);
 const summary={approved:false,proposalHash:hash(grant),providerRequests:0,credentialRead:false,outcomeId:o.id,maximumAdmissions:o.maxCalls,primaryAdmissions:o.maxCalls-o.repairReserve,repairAdmissions:o.repairReserve,maximumReservationMinor:o.maxCalls*route.maxCallCost.minorUnits,countUncertaintyMinor:input.countUncertaintyMinor,currency:'USD',pricingStatus:'Route pricing is a pinned provisional estimate. Invoice settlement and the token-count endpoint price remain unknown.',authority:'One planner proposal and only its validated local task graph. The planner may reject. Owner UI mandate and this signed model grant are separate authorities.',recovery:'Only the same persisted response ID may be retrieved. Unknown creation is never resubmitted. Terminal failed and incomplete states stay terminal.',implementationFiles:files,signingProcedure:'Call signOutcomeProposal with this exact proposal hash, a named approval principal/reference, and an explicitly supplied protected signing key. It writes one envelope and one matching public-key anchor; plaintext proposal files never authorize provider access.',requirements:['Owner must inspect the exact payload hash, explicitly approve max reasoning, and supply approval identity/reference.','Install the signed envelope at pilot.outcome.authorization.json under the exact execution root and retain the matching auth/portfolio-owner.pub trust anchor.','Configure the protected credential path only for live execution; no environment or fixture fallback exists.','Any loaded Foundry src/**/*.ts code, owner mandate, source IDs/hashes/permissions, procedure, schema, tool profile, task definition, grant expiry or revocation change stops new admission.']};
 mkdirSync(input.directory,{recursive:true});writeFileSync(join(input.directory,PROPOSAL),JSON.stringify(grant,null,2)+'\n',{flag:'wx'});writeFileSync(join(input.directory,'outcome-exact-initial-request.json'),JSON.stringify({...prepared.request,bodyHash:binding.planner.bodyHash},null,2)+'\n',{flag:'wx'});writeFileSync(join(input.directory,'outcome-execution-requirements.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});return {proposal:grant,proposalHash:hash(grant),summary};
}

/** Installs one exact owner-approved envelope. Callers supply a signing key
 * explicitly; this function never discovers keys, credentials, or accounts. */
export function signOutcomeProposal(services:Services,root:string,input:{proposal:OutcomeGrant;expectedHash:string;principal:string;approvalReference:string;publicKey:string;privateKey:string}){
 requireThat(hash(input.proposal)===input.expectedHash&&!existsSync(join(root,AUTH)),'OUTCOME_EXACT_APPROVAL_HASH');
 requireThat(typeof input.principal==='string'&&input.principal.trim().length>0&&typeof input.approvalReference==='string'&&input.approvalReference.trim().length>0,'OUTCOME_APPROVAL_REQUIRED');
 validateGrant(services,root,input.proposal,false);currentContext(services,input.proposal);requireThat(Date.parse(input.proposal.expiresAt)>Date.now(),'OUTCOME_GRANT_EXPIRED');
 const grant={...structuredClone(input.proposal),approvedBy:input.principal,approvalReference:input.approvalReference};validateGrant(services,root,grant,true);
 const envelope=signed(grant,input.privateKey);verified(envelope,input.publicKey);mkdirSync(join(root,'auth'),{recursive:true});const anchor=join(root,'auth','portfolio-owner.pub');
 if(existsSync(anchor))requireThat(readFileSync(anchor,'utf8')===input.publicKey,'OUTCOME_TRUST_ANCHOR_CHANGED');else writeFileSync(anchor,input.publicKey,{flag:'wx'});
 writeFileSync(join(root,AUTH),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
 services.outcomes.store.record(grant.accountScope,'owner-exact-approval','OutcomeAuthorizationApproval',{proposalHash:input.expectedHash,grantHash:hash(grant),principal:input.principal,approvalReference:input.approvalReference});
 return {envelope,proposalHash:input.expectedHash,credentialRead:false,providerRequests:0};
}

function taskNode(services:Services,g:OutcomeGrant,taskId:string){const o=services.outcomes.get(g.outcome.outcomeId),node=o.graph.find((n:any)=>n.taskId===taskId),task=node?nodeTask(services,taskId):null;requireThat(node&&task&&o.planHash===(task.inputs as any)?.outcomePlanHash,'OUTCOME_TASK_NOT_IN_ADMITTED_GRAPH');return {o,node,task};}
function nodeTask(services:Services,taskId:string){return services.outcomes.execution.portfolio.getTask(taskId);}
function effectiveTaskProcedureHash(store:any,task:any){
 const inputs=task.inputs as any;requireThat(inputs?.procedureScope?.capability===task.capability&&typeof inputs.baselineProcedureId==='string','OUTCOME_TASK_PROCEDURE_SCOPE_CHANGED');
 return hash(new ProcedureRegistry(store).selected(inputs.procedureScope,inputs.baselineProcedureId).procedure.procedure);
}

export function loadAuthorizedOutcome(services:Services,root:string,options:{}|{testing:{envelope:any;trustedPublicKey:string;transport:typeof fetch}}={}){
 const testing='testing' in options?(options as any).testing:null,envelope=testing?.envelope??JSON.parse(readFileSync(join(root,AUTH),'utf8')),publicKey=testing?.trustedPublicKey??readFileSync(join(root,'auth','portfolio-owner.pub'),'utf8'),g=verified(envelope,publicKey) as OutcomeGrant,b=validateGrant(services,root,g,true),store=services.outcomes.store;
 requireThat(!testing||g.mode==='mock','OUTCOME_TEST_ENVELOPE_MOCK_ONLY');
 const credential=()=>{requireThat(typeof g.credentialFile==='string'&&isAbsolute(g.credentialFile),'OUTCOME_PROTECTED_CREDENTIAL_REQUIRED');return readFileSync(g.credentialFile,'utf8').trim();};
 const execution=testing?{kind:'mock' as const,transport:testing.transport}:{kind:'live' as const,credential,transport:fetch};
 const models=new OperatingModels({store,root,envelope,trustedPublicKey:publicKey,execution}),principal:Principal={id:g.approvedBy,tenantId:'mason',businessId:b.businessId,permissions:['read','operate']},grantHash=hash(g),bindingPrefix=b.id+'/';
 const expose=(result:any)=>g.mode==='live'?result:{...result,route:{...result.route,kind:'fixture' as const,provider:'offline-responses-mock'}};
 const current=()=>{validateGrant(services,root,g,true);requireThat(Date.parse(g.expiresAt)>Date.now()&&!store.get('operating-revocation',grantHash),'OUTCOME_GRANT_EXPIRED_OR_REVOKED');return currentContext(services,g);};
 const invoke=async(stage:Stage,request:ModelRequest,schema:any,accept:(out:any)=>void,recover=false)=>{
  validateGrant(services,root,g,true);const prior=models.ledger.get(request.requestId);if(recover)requireThat(prior,'OUTCOME_RECOVERY_NOT_ADMITTED');else{requireThat(!prior,'OUTCOME_USE_SAME_RESPONSE_RECOVERY');current();}
  const result=expose(await models.invoke(principal,{businessId:b.businessId,goalHash:g.businesses[0].goalHash,sourceHosts:[],attemptId:request.requestId,stage,request,schema,validate:accept}));
  current();return result;
 };
 const plannerAttempt=()=>store.get('pilot-outcome-plan-attempt',b.outcomeId);
 const plan=async()=>{
  let attempt=plannerAttempt();if(!attempt){const {o,prepared}=current();requireThat(hash(prepared.request)===b.planner.requestHash&&bodyHash(g,prepared.request,outcomePlanSchema)===b.planner.bodyHash,'OUTCOME_INITIAL_PLANNER_CHANGED');requireThat(o.state==='awaiting_plan'&&o.plannerAdmissions===0,'OUTCOME_PLANNER_ALREADY_USED');attempt={id:o.id,request:prepared.request,requestHash:hash(prepared.request),context:prepared.context,contextHash:prepared.contextHash,grantHash,state:'pending',createdAt:new Date().toISOString()};store.transaction(()=>{store.put('pilot-outcome-plan-attempt',o.id,attempt,null);const old=store.get('pilot-outcome-mandate',o.id);store.put('pilot-outcome-mandate',o.id,{...old,plannerAdmissions:1,state:'planning',updatedAt:new Date().toISOString()},old._version);});}
  requireThat(attempt.id===b.outcomeId&&attempt.grantHash===grantHash&&attempt.requestHash===b.planner.requestHash&&hash(attempt.request)===attempt.requestHash&&attempt.contextHash===b.contextHash,'OUTCOME_PLANNER_ATTEMPT_CHANGED');
  if(attempt.result)return services.outcomes.acceptPlan(b.outcomeId,attempt,attempt.result);
  const recover=Boolean(models.ledger.get(attempt.request.requestId));
  try{const result=await invoke('outcome-planner',attempt.request,outcomePlanSchema,out=>validateOutcomePlan(out,attempt.context),recover),old=plannerAttempt();store.transaction(()=>store.put('pilot-outcome-plan-attempt',b.outcomeId,{...old,result,state:'response_preserved'},old._version));return services.outcomes.acceptPlan(b.outcomeId,plannerAttempt(),result);}catch(error){const old=plannerAttempt(),ledger=models.ledger.get(attempt.request.requestId),job=ledger?store.get('response-job',models.ledger.key(attempt.request.requestId)):null,message=String((error as Error).message),stale=(error as any)?.code==='OUTCOME_CONTEXT_CHANGED'||/OUTCOME_(?:CONTEXT|SOURCE|OWNER_MANDATE)_CHANGED/.test(message),status=stale?'stale_input':job?.terminal?.status==='incomplete'?'terminal_incomplete':['failed','cancelled'].includes(job?.terminal?.status)?'terminal_failed':ledger?'unknown':'not_admitted';store.transaction(()=>{store.put('pilot-outcome-plan-attempt',b.outcomeId,{...old,state:status,error:message},old._version);const mandate=store.get('pilot-outcome-mandate',b.outcomeId);store.put('pilot-outcome-mandate',b.outcomeId,{...mandate,state:'blocked',reason:message,updatedAt:new Date().toISOString()},mandate._version);});throw error;}
 };
 let engine:PortfolioEngine;
 const bindings=()=>rows(store,'pilot-authorized-outcome-task').filter((x:any)=>x.grantHash===grantHash);
 const bindTask=async(taskId:string)=>{
  current();let {o,node,task}=taskNode(services,g,taskId);requireThat(task.ventureId===b.businessId&&task.status==='queued'&&task.attempts===0&&!task.lease,'OUTCOME_UNSTARTED_TASK_REQUIRED');const profile=b.profiles.find(p=>p.family===node.family),correction=node.generation>0&&Boolean((task.inputs as any)?.correctionOf),expectedCapability=correction?'quality.review':profile?.capability,minimum=correction?3:profile?.minimumCalls;requireThat(profile&&task.capability===expectedCapability&&task.effectAuthority?.kind==='local'&&task.effectAuthority.reference==='pilot-032-local-preparation-only'&&task.allowedTools.every((t:string)=>profile.allowedTools.includes(t))&&task.resource.modelCalls===node.calls&&node.calls>=minimum!,'OUTCOME_TASK_PROFILE_DENIED');
  const inputs=task.inputs as any;requireThat(inputs?.outcomeId===b.outcomeId&&inputs?.outcomeNodeId===node.id&&inputs?.outcomeGeneration===node.generation&&inputs?.outcomePlanHash===o.planHash,'OUTCOME_TASK_GRAPH_BINDING');
  const key=bindingPrefix+taskId,existing=store.get('pilot-authorized-outcome-task',key);if(existing){requireThat(existing.grantHash===grantHash&&existing.definitionHash===taskDefinitionHash(task)&&existing.inputArtifactsHash===hash(task.inputArtifacts)&&existing.generation===node.generation,'OUTCOME_TASK_DEFINITION_CHANGED');return existing;}
  store.transaction(()=>{task=nodeTask(services,taskId);store.put('portfolio-task',taskId,{...task,inputs:{...(task.inputs as any),modelCallMaxMinor:205}},task._version);});task=nodeTask(services,taskId);
  const preview=await engine.previewRequest(taskId),procedureHash=hash(preview.request.role.procedure),expectedProcedureHash=correction?b.correctionProcedureHash:effectiveTaskProcedureHash(store,task);requireThat(procedureHash===expectedProcedureHash&&hash(preview.schema)===profile.schemaHash,'OUTCOME_TASK_PROCEDURE_OR_SCHEMA_CHANGED');
  const stage:Stage=node.generation===0?'outcome-primary':'outcome-repair',value={id:taskId,outcomeId:b.outcomeId,nodeId:node.id,generation:node.generation,family:node.family,stage,workCalls:node.calls,grantHash,planHash:o.planHash,definitionHash:taskDefinitionHash(task),inputArtifactsHash:hash(task.inputArtifacts),procedureHash,schemaHash:hash(preview.schema),initialRequest:preview.request,initialBodyHash:bodyHash(g,preview.request,preview.schema)};store.transaction(()=>store.put('pilot-authorized-outcome-task',key,value,null));return value;
 };
 const workerInvoke=async(call:WorkerCall,recover:boolean)=>{
  const task=rows(store,'portfolio-task').find((t:any)=>t.ventureId===b.businessId&&scopeKey(workerScope(t.ventureId,t.id))===scopeKey(call.request.scope));requireThat(task,'OUTCOME_WORKER_TASK_MISSING');const binding=store.get('pilot-authorized-outcome-task',bindingPrefix+task.id);requireThat(binding?.grantHash===grantHash,'OUTCOME_WORKER_TASK_NOT_BOUND');
  const persisted=rows(store,'portfolio-model-request').find((r:any)=>r.call?.attemptId===call.attemptId);requireThat(persisted&&hash(persisted.call.request)===hash(call.request)&&hash(persisted.call.schema)===hash(call.schema),'OUTCOME_WORKER_INTENT_REQUIRED');
  requireThat(binding.definitionHash===taskDefinitionHash(nodeTask(services,task.id))&&binding.inputArtifactsHash===hash(nodeTask(services,task.id).inputArtifacts)&&hash(call.schema)===binding.schemaHash&&hash(call.request.role.procedure)===binding.procedureHash&&call.request.role.model===g.route.model&&!call.recoveryOf&&!call.stageContract&&call.sourceHosts.length===0,'OUTCOME_WORKER_REQUEST_CHANGED');
  if(!recover){current();services.outcomes.execution.assertContextCurrent(task.id,true);}const result=await invoke(binding.stage,call.request,call.schema,validateWorker,recover);services.outcomes.execution.assertContextCurrent(task.id,true);return result;
 };
 const worker:WorkerModel={kind:g.mode==='live'?'actual_model':'offline_mock',run:call=>workerInvoke(call,false),recover:call=>models.ledger.get(call.attemptId)?workerInvoke(call,true):Promise.resolve(null)};
 const totals=()=>({...models.totals(),stageUsage:Object.fromEntries((['outcome-planner','outcome-primary','outcome-repair'] as Stage[]).map(stage=>[stage,{used:models.ledger.rows().filter(r=>r.metadata.stage===stage).length,limit:g.limits.allocations!.find(a=>a.metadataKey==='stage'&&a.value===stage)!.attempts}])),taskAllocations:bindings().map((x:any)=>({id:x.id,workCalls:x.workCalls,definitionHash:x.definitionHash,generation:x.generation,stage:x.stage})),billing:'Provisional route estimates and retained reservations only; invoice settlement may be unavailable.'});
 engine=new PortfolioEngine({portfolio:services.outcomes.execution.portfolio,tools:services.outcomes.execution.tools,evidence:services.outcomes.execution.evidence,prepareTask:services.outcomes.execution.engine.prepareTask,model:worker,accounting:totals,validateTask:task=>{current();services.outcomes.execution.assertContextCurrent(task.id,true);}});
 const runTask=async(taskId:string)=>{await engine.recover();let task=nodeTask(services,taskId);if(task.status==='needs_reconciliation'){requireThat(store.get('pilot-authorized-outcome-task',bindingPrefix+taskId),'OUTCOME_RECOVERY_TASK_NOT_BOUND');await engine.resumeResponse(taskId);task=nodeTask(services,taskId);}if(task.status==='completed')return task;await bindTask(taskId);return engine.runTask(taskId,(nodeTask(services,taskId).inputs as any).assignedWorkerId??'pilot-generalist');};
 const run=async()=>{requireThat(services.outcomes.get(b.outcomeId).plan?.decision==='prepare','OUTCOME_PLAN_REQUIRED');for(let pass=0;pass<b.maximumTasks+2;pass++){services.outcomes.materialize(b.outcomeId);const o=services.outcomes.get(b.outcomeId);let advanced=false;for(const node of o.graph){if(!node.taskId)continue;const task=nodeTask(services,node.taskId);if(['queued','needs_reconciliation'].includes(task.status)){await runTask(task.id);advanced=true;}}if(!advanced)break;}return services.outcomes.refresh(b.outcomeId);};
 return {authorization:g,engine,plan,run,runTask,totals,correct(input:{nodeId:string;artifactHash:string;instruction:string;repairCalls:number;assisted:boolean}){current();return services.outcomes.correct(b.outcomeId,input);},control(action:'pause'|'resume'|'cancel'){return services.outcomes.control(b.outcomeId,action);}};
}

export const outcomeAuthorizationFiles={authorization:AUTH,proposal:PROPOSAL,implementationRoot:PACKAGE_ROOT,requiredImplementationPaths:sourcePaths()};
