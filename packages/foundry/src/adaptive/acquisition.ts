import {hash,requireThat} from '../contracts.ts';
import {acquirePublicBytes} from '../operations/research.ts';
import type {ResearchPorts} from '../operations/research.ts';
import type {StateStore} from '../state.ts';
import type {AdaptiveWorkspace} from './executor.ts';

export type AcquisitionPolicy={dataScope:'public-or-synthetic';allowedHosts:string[];maxRequests:number;maxBytes:number;deadlineMs:number};
export function validateAcquisitionPolicy(policy:AcquisitionPolicy){
 requireThat(policy?.dataScope==='public-or-synthetic'&&Array.isArray(policy.allowedHosts)&&policy.allowedHosts.length>0&&policy.allowedHosts.length<=20&&policy.allowedHosts.every(h=>/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(h)),'ACQUISITION_SCOPE_REQUIRED');
 for(const [v,max] of [[policy.maxRequests,100],[policy.maxBytes,16777216],[policy.deadlineMs,30000]])requireThat(Number.isSafeInteger(v)&&v>0&&v<=max,'ACQUISITION_LIMIT_INVALID');
 return policy;
}
export class AdaptiveAcquisition {
 readonly store:StateStore;readonly ports?:ResearchPorts;
 constructor(store:StateStore,ports?:ResearchPorts){this.store=store;this.ports=ports;}
 async fetch(workspace:AdaptiveWorkspace,policy:AcquisitionPolicy,input:{operationId:string;url:string;path:string;expectedHash:string|null;expectedSha256?:string;purpose:string},assertCurrent:()=>void=()=>{}){
  assertCurrent();
  validateAcquisitionPolicy(policy);requireThat(typeof input.purpose==='string'&&input.purpose.trim().length>=5,'ACQUISITION_PURPOSE_REQUIRED');
  const url=new URL(input.url);requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&(!url.port||url.port==='443')&&policy.allowedHosts.includes(url.hostname),'ACQUISITION_URL_DENIED');
  requireThat(!input.expectedSha256||/^[a-f0-9]{64}$/.test(input.expectedSha256),'ACQUISITION_DIGEST_INVALID');
  const kind='adaptive-acquisition',id=input.operationId,scope=hash([workspace.businessId,workspace.taskId]),identity=hash({scope,policy,input});
  const prior=this.store.get(kind,id);if(prior){requireThat(prior.identity===identity,'ACQUISITION_ID_CONFLICT');requireThat(prior.status!=='pending','ACQUISITION_OUTCOME_UNCERTAIN');return prior;}
  this.store.transaction(()=>{const rows=this.store.db.prepare('SELECT body FROM entities WHERE kind=?').all(kind).map(r=>JSON.parse(String(r.body))).filter(r=>r.scope===scope);requireThat(rows.length<policy.maxRequests,'ACQUISITION_REQUEST_LIMIT');this.store.put(kind,id,{id,scope,identity,policyHash:hash(policy),input,status:'pending',startedAt:new Date().toISOString()},null);});
  try{
   const asset=await acquirePublicBytes({url:input.url,allowedHosts:policy.allowedHosts,maxBytes:policy.maxBytes,deadlineMs:policy.deadlineMs},this.ports);
   requireThat(!input.expectedSha256||asset.sha256===input.expectedSha256,'ACQUISITION_DIGEST_MISMATCH');
   // Current authority/context may change while the read is outstanding.
   assertCurrent();
   const file=workspace.write(input.path,asset.bytes,input.expectedHash);
   const row=this.store.get(kind,id),result={...row,status:'downloaded_unverified',observedAt:asset.observedAt,url:asset.url,sha256:asset.sha256,bytes:asset.bytes.length,contentType:asset.contentType,file,provenance:this.ports?'fixture':'public_retrieval',interpretation:'Untrusted downloaded material, not installed or independently verified. Inspect license and contents; installation/tests run only inside isolated commands.'};
   this.store.transaction(()=>this.store.put(kind,id,result,row._version));return result;
  }catch(error){const row=this.store.get(kind,id),result={...row,status:'failed',code:String((error as any)?.code??(error as Error).message).slice(0,200),finishedAt:new Date().toISOString()};this.store.transaction(()=>this.store.put(kind,id,result,row._version));return result;}
 }
}
