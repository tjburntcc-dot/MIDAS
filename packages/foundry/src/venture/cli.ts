/** Explicit CLI: prepare never dispatches. run requires a new signed grant and independent trust anchor. */
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {prepareVentureRun,runVentureEvidence} from './runner.ts';
import {VentureWorkspace} from './workspace.ts';
import {StateStore} from '../state.ts';
import {route} from '../workflow/config.ts';
import {hash,requireThat} from '../contracts.ts';
import type {EvidenceBundle} from '../workbench/evidence.ts';
const {values,positionals}=parseArgs({allowPositionals:true,options:{workspace:{type:'string'},root:{type:'string'},grant:{type:'string'},'trust-anchor':{type:'string'},attempt:{type:'string'}}});
const root=resolve(values.root??'var/founder-venture-runtime-v1'),command=positionals[0];
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
if(command==='prepare'){
 requireThat(!existsSync(join(root,'manifest.json')),'PREPARATION_ALREADY_EXISTS');mkdirSync(root,{recursive:true});const prepared=json(join(dirname(fileURLToPath(import.meta.url)),'prepared.json'));
 const bundle:EvidenceBundle={version:'founder-evidence-v1',asOf:new Date().toISOString(),purpose:'Review a Mason-owned venture validation hypothesis; no external action or claims of validated demand.',currency:'USD',valueBasis:'Unknown economic return; reversible evidence gathering',dimensions:['customers','distribution','operations','resources','economics','authority'],allowedTools:['permitted_sources'],allowedEffects:[],sources:[{id:'founder-context',version:'v1',text:JSON.stringify(prepared.founder),permission:'worker',rights:'Founder-authorized context from this conversation; no unrelated personal information',observedAt:prepared.provenance.createdAt,validUntil:null},...prepared.sources.map((s:any)=>({id:s.id,version:'v1',text:JSON.stringify(s),permission:'worker' as const,rights:'Public source reference and development-assistant summary; no customer/private evidence',observedAt:prepared.provenance.createdAt,validUntil:null}))]};
 const workspace=resolve(values.workspace??'var/founder-owned-venture-v1');requireThat(existsSync(join(workspace,'workbench.sqlite')),'EXISTING_OWNER_WORKSPACE_REQUIRED');const ownerStore=new StateStore(join(workspace,'workbench.sqlite'));let currentPackage;try{currentPackage=new VentureWorkspace(ownerStore).view().state.packet;}finally{ownerStore.close();}
 const scope={tenantId:'founder',businessId:'mason-owned-venture',runId:'venture-model-account-v1',dataPolicyVersion:'founder-creation-v1',mode:'fixture' as const};
 const result=prepareVentureRun(root,scope,bundle,{...route,authorizationId:'founder-venture-review-v1'},[{attemptId:'understanding-1',kind:'understanding'},{attemptId:'package-review-1',kind:'validation-package-review',candidateIds:prepared.candidates.map((c:any)=>c.id),currentPackage}],{totalMinor:125,countBufferMinor:21});
 result.authorizationRequest.projectId='proj_H01ORqdOPQM6vdGwQYsqFL5r' as any;result.authorizationRequest.credentialFile='C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key' as any;result.authorizationRequest.expiresAt='2026-09-25T22:00:00Z' as any;
 for(const [name,value] of Object.entries({'manifest.json':result.manifest,'authorization.request.json':result.authorizationRequest}))writeFileSync(join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({root,manifestHash:hash(result.manifest),providerRequests:0,approved:false,notice:'Optional two-call review prepared only. No paid runtime execution recommended before founder fit and commercial access decisions.'}));
}else if(command==='run'){
 requireThat(values.grant&&values['trust-anchor']&&values.attempt,'SIGNED_GRANT_TRUST_ANCHOR_AND_ATTEMPT_REQUIRED');const manifest=json(join(root,'manifest.json'));requireThat(manifest.root===root,'ROOT_MISMATCH');
 const result=await runVentureEvidence({manifest,envelope:json(resolve(values.grant)),trustedOwnerPublicKey:readFileSync(resolve(values['trust-anchor']),'utf8'),principal:{id:'authorized-local-runner',tenantId:manifest.scope.tenantId,businessId:manifest.scope.businessId,permissions:['read','operate']},attemptId:values.attempt,execution:{kind:'live'}});
 if(values.workspace&&result.proposal.result.output.kind==='validation-package-review'){const entry=manifest.requests.find((r:any)=>r.call.attemptId===values.attempt);const ownerStore=new StateStore(join(resolve(values.workspace),'workbench.sqlite'));try{new VentureWorkspace(ownerStore).stageRuntimeProposal(result.proposal,hash(entry.call.currentPackage));}finally{ownerStore.close();}}
 const path=join(root,values.attempt+'.proposal.json');if(!existsSync(path))writeFileSync(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({proposalFile:path,reused:result.reused,accounting:result.accounting,acceptedByOwner:false}));
}else throw Error('Use prepare --root <new-root>, or run --root <root> --grant <new-signed-grant> --trust-anchor <trusted-owner-public-key> --attempt <frozen-id>. No automatic signing or calls.');
