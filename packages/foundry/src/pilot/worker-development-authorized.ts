/** The sole provider-capable bridge for worker-development comparisons. */
import {hash,requireThat} from '../contracts.ts';
import type {ModelRequest,Principal} from '../contracts.ts';
import {OperatingModels} from '../operations/model.ts';
import type {Invocation} from '../operations/model.ts';
import type {AuthorizedComparisonExecutor,ComparisonRuntimeObservation} from './worker-development.ts';
import {signed,verified} from '../experiment/config.ts';

const executors=new WeakSet<object>();
const bindings=new WeakMap<object,{grantHash:string;comparisonHashes:Set<string>;store:object;ledgerScopeHash:string}>();
export type ComparisonGrantInput={authorizationId:string;businessId:string;jobId:string;candidateId:string;baselineProcedureHash:string;candidateProcedureHash:string;model:string;toolHash:string;evidenceHash:string;resourcesHash:string;evaluationCaseIds:string[];profileHash?:string};
export type ComparisonGrantEntry=ComparisonGrantInput&{kind:'worker-development-comparison-grant';comparisonHash:string};
const text=(x:unknown,code='WORKER_DEVELOPMENT_GRANT_BINDING')=>requireThat(typeof x==='string'&&x.trim().length>0,code);

/** This canonical packet binds code (through OperatingModels), source hashes,
 * procedures, cases, resources and profile/model routing in one hash. */
export function comparisonGrantSpec(input:ComparisonGrantInput){
  for(const x of [input.authorizationId,input.businessId,input.jobId,input.candidateId,input.baselineProcedureHash,input.candidateProcedureHash,input.model,input.toolHash,input.evidenceHash,input.resourcesHash])text(x);
  requireThat(Array.isArray(input.evaluationCaseIds)&&input.evaluationCaseIds.length>0&&new Set(input.evaluationCaseIds).size===input.evaluationCaseIds.length,'WORKER_DEVELOPMENT_EVALUATION_REQUIRED');input.evaluationCaseIds.forEach(x=>text(x,'WORKER_DEVELOPMENT_EVALUATION_REQUIRED'));if(input.profileHash!==undefined)text(input.profileHash);
  return {kind:'worker-development-comparison-grant' as const,authorizationId:input.authorizationId,businessId:input.businessId,jobId:input.jobId,candidateId:input.candidateId,baselineProcedureHash:input.baselineProcedureHash,candidateProcedureHash:input.candidateProcedureHash,model:input.model,toolHash:input.toolHash,evidenceHash:input.evidenceHash,resourcesHash:input.resourcesHash,evaluationCaseIds:[...input.evaluationCaseIds],...(input.profileHash?{profileHash:input.profileHash}:{})};
}

/** Preparation has no signing, account, token-count, or provider path. */
export function prepareWorkerDevelopmentComparisonGrant(input:ComparisonGrantInput){const spec=comparisonGrantSpec(input),comparisonHash=hash(spec);return {spec:{...spec,comparisonHash} as ComparisonGrantEntry,comparisonHash,providerRequests:0,status:'prepared_unsigned' as const};}

/** A comparison replaces no existing signature: it creates one new unsigned
 * OperatingModels packet containing exactly one comparison entry. */
export function prepareWorkerDevelopmentOperatingPacket(input:{operatingGrant:any;prepared:ReturnType<typeof prepareWorkerDevelopmentComparisonGrant>}){const grant=structuredClone(input.operatingGrant);requireThat(grant?.kind==='operations-model-grant-v1'&&grant.approvedBy===''&&grant.approvalReference===''&&Array.isArray(grant.businesses)&&grant.businesses.some((b:any)=>b.id===input.prepared.spec.businessId)&&grant.route?.model===input.prepared.spec.model&&!grant.workerDevelopmentComparisons,'WORKER_DEVELOPMENT_NEW_PACKET_REQUIRED');grant.workerDevelopmentComparisons=[structuredClone(input.prepared.spec)];return {proposal:grant,proposalHash:hash(grant),comparisonHash:input.prepared.comparisonHash,providerRequests:0};}

/** Signing verifies the exact new full unsigned packet and explicit owner
 * principal/reference; it cannot append an entry under an old signature. */
export function signWorkerDevelopmentComparisonGrant(input:{proposal:any;prepared:ReturnType<typeof prepareWorkerDevelopmentComparisonGrant>;expectedHash:string;principal:string;approvalReference:string;privateKey:string;publicKey:string}){requireThat(hash(input.proposal)===input.expectedHash&&input.proposal?.approvedBy===''&&input.proposal?.approvalReference===''&&Array.isArray(input.proposal.workerDevelopmentComparisons)&&input.proposal.workerDevelopmentComparisons.length===1&&hash(input.proposal.workerDevelopmentComparisons[0])===hash(input.prepared.spec),'WORKER_DEVELOPMENT_EXACT_APPROVAL_HASH');text(input.principal,'WORKER_DEVELOPMENT_OWNER_APPROVAL_REQUIRED');text(input.approvalReference,'WORKER_DEVELOPMENT_OWNER_APPROVAL_REQUIRED');const grant={...structuredClone(input.proposal),approvedBy:input.principal,approvalReference:input.approvalReference},envelope=signed(grant,input.privateKey);verified(envelope,input.publicKey);return {grant,envelope,proposalHash:input.expectedHash,grantHash:hash(grant),comparisonHash:input.prepared.comparisonHash,providerRequests:0};}

export function assertAuthorizedComparisonExecutor(value:unknown,input:ComparisonGrantInput,store:object){requireThat(typeof value==='object'&&value!==null&&executors.has(value),'WORKER_DEVELOPMENT_LEDGER_FACTORY_REQUIRED');const binding=bindings.get(value);requireThat(binding?.store===store&&binding.ledgerScopeHash===(value as any).ledgerScopeHash&&binding.comparisonHashes.has(hash(comparisonGrantSpec(input))),'WORKER_DEVELOPMENT_GRANT_BINDING');}

/** The WeakSet marker is private. The factory also refuses a changed request,
 * and exposes only a same-attempt terminal observation for durable recovery. */
export function createOperatingModelsComparisonExecutor(input:{operating:OperatingModels;principal:Principal;invocationFor(request:ModelRequest):Invocation}):AuthorizedComparisonExecutor{
 const grantHash=hash(input.operating.grant),comparisonHashes=new Set<string>();
 for(const entry of (input.operating.grant as any).workerDevelopmentComparisons??[]){const spec=comparisonGrantSpec(entry);requireThat(entry.kind==='worker-development-comparison-grant'&&entry.comparisonHash===hash(spec),'WORKER_DEVELOPMENT_GRANT_BINDING');comparisonHashes.add(entry.comparisonHash);}requireThat(comparisonHashes.size===1,'WORKER_DEVELOPMENT_GRANT_BINDING');
 const observe=(request:ModelRequest):ComparisonRuntimeObservation=>{const key=input.operating.ledger.key(request.requestId),job=input.operating.store.get('response-job',key),response=input.operating.store.get('operating-response',key),details={terminal:structuredClone(job?.terminal??null),terminalHash:job?.terminalHash??null,providerObservation:structuredClone(job?.providerObservation??null)};if(response)return {status:'result'};if(['failed','cancelled'].includes(job?.terminal?.status))return {status:'terminal_failed',...details};if(job?.terminal?.status==='incomplete')return {status:'terminal_incomplete',...details};if(job?.terminal?.status==='completed')return {status:'invalid_output',...details};return {status:'unknown'};};
 const ledgerScopeHash=hash(input.operating.ledger.scope);
 const executor:AuthorizedComparisonExecutor={kind:'operating-models-comparison-executor-v1',trustedSignedFactory:true,executionProvenance:input.operating.grant.mode==='mock'?'fixture':'runtime',grantHash,ledgerScopeHash,assertCurrent(){requireThat(Date.parse(input.operating.grant.expiresAt)>Date.now(),'WORKER_DEVELOPMENT_OPERATING_GRANT_EXPIRED');requireThat(!input.operating.store.get('operating-revocation',grantHash),'WORKER_DEVELOPMENT_OPERATING_GRANT_REVOKED');},observe,assertRecovery(request){const row=input.operating.ledger.get(request.requestId);requireThat(row&&row.request?.requestId===request.requestId,'WORKER_DEVELOPMENT_RECOVERY_NOT_ADMITTED');},async execute(request){this.assertCurrent();const invocation=input.invocationFor(request);requireThat(hash(invocation.request)===hash(request)&&invocation.attemptId===request.requestId,'WORKER_DEVELOPMENT_OPERATING_REQUEST_CHANGED');return input.operating.invoke(input.principal,invocation);}};
 executors.add(executor);bindings.set(executor,{grantHash,comparisonHashes,store:input.operating.store,ledgerScopeHash});return executor;
}

/** Load the one signed comparison entry into a usable WorkerDevelopment input.
 * This does not create a request; the WorkerDevelopment slot writer persists
 * each full request before the executor can reach OperatingModels admission. */
export function loadAuthorizedWorkerDevelopmentComparison(input:{operating:OperatingModels;principal:Principal;invocationFor(request:ModelRequest):Invocation}){
 const entry=(input.operating.grant as any).workerDevelopmentComparisons?.[0];requireThat(entry&&Array.isArray((input.operating.grant as any).workerDevelopmentComparisons)&&(input.operating.grant as any).workerDevelopmentComparisons.length===1,'WORKER_DEVELOPMENT_GRANT_BINDING');
 const spec=comparisonGrantSpec(entry);requireThat(entry.kind==='worker-development-comparison-grant'&&entry.comparisonHash===hash(spec)&&typeof input.operating.grant.approvedBy==='string'&&input.operating.grant.approvedBy.trim().length>0&&typeof input.operating.grant.approvalReference==='string'&&input.operating.grant.approvalReference.trim().length>0&&Date.parse(input.operating.grant.expiresAt)>Date.now(),'WORKER_DEVELOPMENT_GRANT_BINDING');
 return {runtime:createOperatingModelsComparisonExecutor(input),authorization:{...spec,comparisonHash:entry.comparisonHash,approved:true as const,approvedBy:input.operating.grant.approvedBy,approvalReference:input.operating.grant.approvalReference,expiresAt:input.operating.grant.expiresAt,permitProvider:true as const}};
}
