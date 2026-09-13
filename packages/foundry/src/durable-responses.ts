/** A single-create, durable Responses background operation. No inference retry.
 * Identity is saved from the initial acknowledgement, before polling. A lost
 * acknowledgement remains unknown. Read recovery is bounded by signed policy. */
import {randomUUID} from 'node:crypto';
import {StateStore} from './state.ts';
import {hash,rawHash,requireThat,FoundryError} from './contracts.ts';
import {boundedJSON,sanitizeCountResponse} from './experiment/token-count.ts';

export type BackgroundPolicy={kind:'durable-background-v1';store:true;pollIntervalMs:number;retrievalDeadlineMs:number;completionDeadlineMs:number;resumeWindowMs:number;maxRetrievals:number;maxConsecutiveReadErrors:number};
export const BACKGROUND_POLICY:BackgroundPolicy={kind:'durable-background-v1',store:true,pollIntervalMs:5000,retrievalDeadlineMs:15000,completionDeadlineMs:900000,resumeWindowMs:86400000,maxRetrievals:240,maxConsecutiveReadErrors:3};
export function validateBackgroundPolicy(p:BackgroundPolicy){requireThat(hash(p)===hash(BACKGROUND_POLICY),'BACKGROUND_POLICY_NOT_APPROVED');}
const endpoint='https://api.openai.com/v1/responses';
const responseId=(id:unknown):id is string=>typeof id==='string'&&/^resp_[A-Za-z0-9_-]{1,190}$/.test(id);
const pending=(status:string)=>['queued','in_progress'].includes(status);
const ownerAlive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(e){return (e as any).code!=='ESRCH';}};
export class DurableResponses {
 readonly store:StateStore; readonly key:string; readonly requestHash:string; readonly grantHash:string; readonly policy:BackgroundPolicy;
 readonly owner=process.pid+'-'+randomUUID(); readonly now:()=>number; readonly sleep:(ms:number)=>Promise<void>;
 readonly authorize:()=>void; readonly expiresAt:string; readonly fault?:(phase:string)=>void;
 constructor(x:{store:StateStore;key:string;requestHash:string;grantHash:string;policy:BackgroundPolicy;expiresAt:string;authorize:()=>void;now?:()=>number;sleep?:(ms:number)=>Promise<void>;fault?:(phase:string)=>void}){
  validateBackgroundPolicy(x.policy);this.store=x.store;this.key=x.key;this.requestHash=x.requestHash;this.grantHash=x.grantHash;this.policy=structuredClone(x.policy);this.expiresAt=x.expiresAt;this.authorize=x.authorize;this.now=x.now??Date.now;this.sleep=x.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));this.fault=x.fault;
 }
 state(){const r=this.store.get('response-job',this.key);if(r)requireThat(r.requestHash===this.requestHash&&r.grantHash===this.grantHash&&r.policyHash===hash(this.policy),'BACKGROUND_BINDING_CHANGED');return r;}
 claim(){this.store.transaction(()=>{const r=this.state();requireThat(!r?.owner||!ownerAlive(r.ownerPid),'BACKGROUND_OWNER_ACTIVE');const value=r??{requestHash:this.requestHash,grantHash:this.grantHash,policyHash:hash(this.policy),createDispatched:false,responseId:null,retrievals:0,consecutiveReadErrors:0,events:[],createdAt:new Date(this.now()).toISOString()};this.store.put('response-job',this.key,{...value,owner:this.owner,ownerPid:process.pid},r?._version??null);});}
 release(){this.store.transaction(()=>{const r=this.state();if(r?.owner===this.owner)this.store.put('response-job',this.key,{...r,owner:null,ownerPid:null},r._version);});}
 private change(fn:(r:any)=>any){return this.store.transaction(()=>{const r=this.state();requireThat(r?.owner===this.owner,'BACKGROUND_OWNER_CHANGED');const next=fn(r);this.store.put('response-job',this.key,next,r._version);return next;});}
 private gate(){this.authorize();requireThat(this.now()<Date.parse(this.expiresAt),'BACKGROUND_GRANT_EXPIRED');}
 private record(event:Record<string,unknown>){this.change(r=>({...r,events:[...r.events,{...event,at:new Date(this.now()).toISOString()}]}));}
 private safeTerminal(raw:any,secret:string){
  const output=(raw.output??[]).map((item:any)=>({type:item.type,content:(item.content??[]).filter((c:any)=>['output_text','refusal'].includes(c.type)).map((c:any)=>c.type==='output_text'?{type:c.type,text:c.text}:{type:c.type,refusal:'Provider refusal'})}));
  const usage=raw.usage?{input_tokens:raw.usage.input_tokens,output_tokens:raw.usage.output_tokens,input_tokens_details:{cached_tokens:raw.usage.input_tokens_details?.cached_tokens??0},output_tokens_details:{reasoning_tokens:raw.usage.output_tokens_details?.reasoning_tokens??null}}:null;
  const result={id:raw.id,model:raw.model,status:raw.status,service_tier:raw.service_tier,background:raw.background,store:raw.store,usage,output,incomplete_details:raw.incomplete_details?{reason:['max_output_tokens','content_filter'].includes(raw.incomplete_details.reason)?raw.incomplete_details.reason:'withheld'}:null};
  requireThat(!JSON.stringify(result).includes(secret),'MODEL_SENSITIVE_OUTPUT');return result;
 }
 private accept(raw:any,secret:string,model:string){
  requireThat(raw&&responseId(raw.id)&&!raw.id.includes(secret),'BACKGROUND_RESPONSE_ID_MISSING');
  const old=this.state();requireThat(!old.responseId||old.responseId===raw.id,'BACKGROUND_RESPONSE_ID_MISMATCH');
  // Retain a syntactically valid identity before subsequent contract validation.
  this.change(r=>({...r,responseId:raw.id,status:['queued','in_progress','completed','incomplete','failed','cancelled'].includes(raw.status)?raw.status:null,identityAt:r.identityAt??new Date(this.now()).toISOString()}));this.fault?.('identity_persisted');
  requireThat(raw.model===model,'RETURNED_MODEL_MISMATCH');
  requireThat(raw.background===true&&raw.store===true,'BACKGROUND_STORAGE_NOT_CONFIRMED');
  requireThat(['queued','in_progress','completed','incomplete','failed','cancelled'].includes(raw.status),'BACKGROUND_STATUS_INVALID');
  if(!pending(raw.status)){
   const terminal=this.safeTerminal(raw,secret);
   this.change(r=>({...r,terminal,terminalHash:hash(terminal),terminalAt:new Date(this.now()).toISOString()}));this.fault?.('terminal_persisted');
  }
 }
 async execute(x:{bytes:string;credential:string;projectId:string;model:string;createDeadlineMs:number;transport:typeof fetch;resume:boolean}):Promise<any>{
  requireThat(rawHash(x.bytes)===this.requestHash,'BACKGROUND_REQUEST_CHANGED');const secret=x.credential;requireThat(secret.length>0,'MODEL_ACCESS_REQUIRED');
  const headers={authorization:'Bearer '+secret,'OpenAI-Project':x.projectId,'content-type':'application/json'};
  let state=this.state();requireThat(state?.owner===this.owner,'BACKGROUND_OWNER_REQUIRED');
  if(state.terminal){requireThat(hash(state.terminal)===state.terminalHash,'BACKGROUND_TERMINAL_CHANGED');return state.terminal;}
  this.gate();
  if(!x.resume){
   requireThat(!state.createDispatched,'BACKGROUND_CREATE_ALREADY_DISPATCHED');
   this.change(r=>({...r,createDispatched:true,dispatchAt:new Date(this.now()).toISOString(),completionDeadlineAt:new Date(this.now()+this.policy.completionDeadlineMs).toISOString(),resumeUntil:new Date(Math.min(this.now()+this.policy.resumeWindowMs,Date.parse(this.expiresAt))).toISOString()}));
   this.fault?.('create_intent_persisted');
   let response:Response;
   try{response=await x.transport(endpoint,{method:'POST',headers,body:x.bytes,redirect:'error',signal:AbortSignal.timeout(x.createDeadlineMs)});}catch(e){this.record({operation:'create',result:'transport_unknown',error:(e as any).name==='TimeoutError'?'deadline':'connection'});throw new FoundryError('BACKGROUND_CREATE_UNKNOWN');}
   this.record({operation:'create',phase:'headers',...sanitizeCountResponse(response.status,response.headers.get('x-request-id'),null,secret)});
   const raw=await boundedJSON(response,262144);
   if(!response.ok){this.record({operation:'create',phase:'http_error',...sanitizeCountResponse(response.status,response.headers.get('x-request-id'),raw,secret)});throw new FoundryError('BACKGROUND_CREATE_HTTP_ERROR');}
   this.accept(raw,secret,x.model);state=this.state();
  }else requireThat(state.createDispatched&&responseId(state.responseId),'BACKGROUND_UNKNOWN_NO_RESUBMIT');
  let lateRead=false;
  while(!this.state().terminal){
   state=this.state();this.gate();requireThat(this.now()<Date.parse(state.resumeUntil),'BACKGROUND_RESUME_WINDOW_EXPIRED');
   requireThat(state.retrievals<this.policy.maxRetrievals,'BACKGROUND_RETRIEVAL_CAP');
   const late=this.now()>=Date.parse(state.completionDeadlineAt);
   // A later explicit resume may inspect the same response once; never restart
   // the fifteen-minute completion clock or buy another inference.
   requireThat(!late||x.resume&&!lateRead,'BACKGROUND_COMPLETION_DEADLINE');lateRead=lateRead||late;
   if(state.retrievals>0&&!late)await this.sleep(this.policy.pollIntervalMs);
   this.gate();requireThat(this.now()<Date.parse(state.resumeUntil),'BACKGROUND_RESUME_WINDOW_EXPIRED');
   if(!late&&this.now()>=Date.parse(state.completionDeadlineAt))throw new FoundryError('BACKGROUND_COMPLETION_DEADLINE');
   const seq=state.retrievals+1;
   this.change(r=>({...r,retrievals:seq,events:[...r.events,{operation:'retrieve',phase:'dispatch_intent',seq,responseId:r.responseId,at:new Date(this.now()).toISOString()}]}));
   this.fault?.('retrieve_intent_persisted');
   let response:Response;
   try{response=await x.transport(endpoint+'/'+state.responseId,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(this.policy.retrievalDeadlineMs)});}catch(e){
    this.record({operation:'retrieve',seq,result:'transport_unknown',error:(e as any).name==='TimeoutError'?'deadline':'connection'});
    const next=this.change(r=>({...r,consecutiveReadErrors:r.consecutiveReadErrors+1}));requireThat(next.consecutiveReadErrors<this.policy.maxConsecutiveReadErrors,'BACKGROUND_READ_ERRORS');continue;
   }
   this.record({operation:'retrieve',seq,phase:'headers',...sanitizeCountResponse(response.status,response.headers.get('x-request-id'),null,secret)});
   const raw=await boundedJSON(response,262144);
   if(!response.ok){
    this.record({operation:'retrieve',seq,phase:'http_error',...sanitizeCountResponse(response.status,response.headers.get('x-request-id'),raw,secret)});
    if(response.status===429||response.status>=500){const next=this.change(r=>({...r,consecutiveReadErrors:r.consecutiveReadErrors+1}));requireThat(next.consecutiveReadErrors<this.policy.maxConsecutiveReadErrors,'BACKGROUND_READ_ERRORS');continue;}
    throw new FoundryError('BACKGROUND_RETRIEVAL_HTTP_ERROR');
   }
   if(!raw){this.record({operation:'retrieve',seq,result:'body_unknown'});const next=this.change(r=>({...r,consecutiveReadErrors:r.consecutiveReadErrors+1}));requireThat(next.consecutiveReadErrors<this.policy.maxConsecutiveReadErrors,'BACKGROUND_READ_ERRORS');continue;}this.accept(raw,secret,x.model);this.change(r=>({...r,consecutiveReadErrors:0}));
  }
  state=this.state();requireThat(hash(state.terminal)===state.terminalHash,'BACKGROUND_TERMINAL_CHANGED');return state.terminal;
 }
}
