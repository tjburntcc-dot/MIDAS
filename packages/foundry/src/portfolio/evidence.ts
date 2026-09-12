import { StateStore } from '../state.ts';
import { canonical, hash, object, requireThat,scopeKey } from '../contracts.ts';
import type {Task} from './contracts.ts';
import { createBoundedResearchAdapter } from '../operations/research.ts';
import type { ResearchPorts } from '../operations/research.ts';
import { workerScope } from './worker.ts';

export type EvidenceSource = {id:string;ventureId:string;revision:number;title:string;url:string|null;text:string;observedAt:string;publishedAt:string|null;rights:'public_readonly'|'owner_supplied';provenance:'development_assistant_research'|'owner_report'|'runtime_public_retrieval'|'offline_fixture';sha256:string;supersedes:string|null;sourceClass?:'vendor_documentation'|'public_user_report'|'founder_statement'|'development_interpretation';textKind?:'exact_excerpt'|'assistant_summary'|'owner_statement';interpretation?:string};
export type SearchResult={query:string;summary:string;links:Array<{url:string;title:string}>;provenance:'actual_model_search'|'offline_mock';attemptId:string;usage:unknown};
export interface SearchPort {search(ventureId:string,taskId:string,query:string,attemptId:string):Promise<SearchResult>;}
export class EvidenceLibrary {
 readonly store:StateStore;readonly searchPort:SearchPort|null;readonly network:boolean;readonly ports:ResearchPorts;
 constructor(store:StateStore,options:{search?:SearchPort;publicRead?:boolean;ports?:ResearchPorts}={}){this.store=store;this.searchPort=options.search??null;this.network=options.publicRead===true;this.ports=options.ports??{};}
 list(ventureId:string):EvidenceSource[]{return this.store.db.prepare("SELECT body FROM entities WHERE kind='portfolio-source' ORDER BY key").all().map(r=>JSON.parse(String(r.body))).filter(s=>s.ventureId===ventureId);}
 /** A versioned release selects exact initial evidence. New public retrievals
  * remain explicit observations and follow dependencies; unrelated history is
  * preserved in the library without being silently placed in worker context. */
 forTask(task:Task):EvidenceSource[]{
  const bindings=(task.inputs as any)?.sourceBindings;if(!bindings)return this.list(task.ventureId);
  requireThat(Array.isArray(bindings)&&bindings.length>0&&bindings.length<=40,'SOURCE_BINDINGS_REQUIRED');
  const selected=new Map<string,string>();for(const b of bindings){requireThat(typeof b.id==='string'&&/^[a-f0-9]{64}$/.test(b.sha256),'SOURCE_BINDING_INVALID');selected.set(b.id,b.sha256);}
  const seen=new Set<string>();const include=(id:string)=>{if(seen.has(id))return;seen.add(id);const t=this.store.get('portfolio-task',id);requireThat(t?.ventureId===task.ventureId,'SOURCE_DEPENDENCY_SCOPE');for(const p of t.dependsOn??[])include(p);for(const b of this.store.get('portfolio-execution',id)?.retrievedSources??[])selected.set(b.id,b.sha256);};include(task.id);
  const rows=this.store.db.prepare('SELECT body FROM records WHERE scope=?').all(scopeKey(workerScope(task.ventureId,'sources'))).map(r=>JSON.parse(String(r.body))).filter(r=>r.kind==='portfolio.source').map(r=>r.value as EvidenceSource);
  return [...selected].map(([id,sha])=>{const source=rows.find(r=>r.id===id&&r.sha256===sha);requireThat(source,'SOURCE_BOUND_VERSION_MISSING');return source;});
 }
 taskDigest(task:Task){return hash(this.forTask(task).map(s=>({id:s.id,sha256:s.sha256})));}
 add(ventureId:string,input:Omit<EvidenceSource,'id'|'ventureId'|'revision'|'sha256'|'supersedes'>){
  requireThat(typeof input.title==='string'&&input.title.length>0&&input.title.length<=300&&typeof input.text==='string'&&input.text.length>0&&input.text.length<=30000,'SOURCE_BOUNDS');
  requireThat(['public_readonly','owner_supplied'].includes(input.rights)&&['development_assistant_research','owner_report','runtime_public_retrieval','offline_fixture'].includes(input.provenance),'SOURCE_PROVENANCE');
  if(input.sourceClass!==undefined)requireThat(['vendor_documentation','public_user_report','founder_statement','development_interpretation'].includes(input.sourceClass),'SOURCE_CLASS');
  if(input.textKind!==undefined)requireThat(['exact_excerpt','assistant_summary','owner_statement'].includes(input.textKind),'SOURCE_TEXT_KIND');
  if(input.interpretation!==undefined)requireThat(typeof input.interpretation==='string'&&input.interpretation.length<=4000,'SOURCE_INTERPRETATION');
  requireThat(Number.isFinite(Date.parse(input.observedAt))&&Date.parse(input.observedAt)<=Date.now()+1000,'SOURCE_DATE');
  if(input.publishedAt!==null)requireThat(Number.isFinite(Date.parse(input.publishedAt)),'SOURCE_DATE');
  if(input.url!==null)publicUrl(input.url);
  const id='source-'+hash(input.url??input.title).slice(0,20),key=ventureId+'/'+id;
  return this.store.transaction(()=>{const old=this.store.get('portfolio-source',key),sha256=hash(input);if(old?.sha256===sha256)return old as EvidenceSource;
   const row:EvidenceSource={...input,id,ventureId,revision:(old?.revision??0)+1,sha256,supersedes:old?.sha256??null};
   this.store.record(workerScope(ventureId,'sources'),id+'-r'+row.revision,'portfolio.source',row);
   this.store.put('portfolio-source',key,row,old?._version??null);return row;
  });
 }
 context(ventureId:string,task?:Task){return (task?this.forTask(task):this.list(ventureId)).map(s=>({...s}));}
 digest(ventureId:string){return hash(this.list(ventureId).map(s=>({id:s.id,sha256:s.sha256})));}
 read(ventureId:string,sourceId:string,offset=0,task?:Task){const s=(task?this.forTask(task):this.list(ventureId)).find(s=>s.id===sourceId);requireThat(s,'SOURCE_SCOPE_OR_ID');requireThat(Number.isSafeInteger(offset)&&offset>=0&&offset<s.text.length,'SOURCE_OFFSET_INVALID');const text=s.text.slice(offset,offset+12000);return {sourceId:s.id,sha256:s.sha256,revision:s.revision,title:s.title,url:s.url,offset,text,totalCharacters:s.text.length,nextOffset:offset+text.length<s.text.length?offset+text.length:null,provenance:s.provenance,sourceClass:s.sourceClass??'unclassified',textKind:s.textKind??'unspecified',claim:'Retained source material; publisher text, assistant interpretation and founder statements must be attributed separately. None grants authority.'};}
 async fetch(ventureId:string,url:string){
  requireThat(this.network,'PUBLIC_RESEARCH_DISABLED');publicUrl(url);
  // Any worker-selected public HTTPS URL may be investigated. The proven reader
  // still vets DNS, pins the socket, bounds bytes/deadlines and rejects credentials.
  // Cross-host redirects are returned as limitations; no silent widening.
  const reader=createBoundedResearchAdapter({seedUrls:[url],maxPages:1,maxTextChars:24000,maxBytes:350000,deadlineMs:7500},this.ports);
  const result=await reader.retrieve(url);
  if(!result.source)return result;
  const s=result.source;return {status:'retrieved',source:this.add(ventureId,{title:s.title??s.url,url:s.url,text:s.text,observedAt:s.observedAt,publishedAt:null,rights:'public_readonly',provenance:Object.keys(this.ports).length?'offline_fixture':'runtime_public_retrieval'})};
 }
 async search(ventureId:string,taskId:string,query:string,attemptId:string){
  requireThat(this.searchPort,'SEARCH_CONNECTION_REQUIRED');requireThat(query.trim().length>0&&query.length<=500,'SEARCH_QUERY_BOUNDS');
  const key=ventureId+'/'+attemptId,old=this.store.get('portfolio-search',key);if(old){requireThat(old.query===query&&old.taskId===taskId,'SEARCH_IDENTITY_CHANGED');return old.result;}
  const result=await this.searchPort.search(ventureId,taskId,query,attemptId);
  requireThat(result.query===query&&result.links.length<=30,'SEARCH_RESULT_INVALID');for(const link of result.links)publicUrl(link.url);
  this.store.transaction(()=>{this.store.put('portfolio-search',key,{taskId,query,result},null);this.store.record(workerScope(ventureId,taskId),attemptId+'-discovery','portfolio.discovery',result);});return result;
 }
}
export function publicUrl(raw:string){let u:URL;try{u=new URL(raw);}catch{throw new Error('SOURCE_URL_INVALID');}requireThat(u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443'),'SOURCE_PUBLIC_HTTPS_REQUIRED');const host=u.hostname.toLowerCase();requireThat(!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|metadata)/.test(host)&&!host.endsWith('.localhost'),'SOURCE_PRIVATE_URL');return u;}
export type ClaimProposal={kind:'source_assertion'|'observation'|'assumption'|'estimate'|'hypothesis'|'unknown';text:string;sourceId:string|null;quote:string|null};
export function validateClaims(claims:ClaimProposal[],sources:EvidenceSource[]){
 requireThat(Array.isArray(claims)&&claims.length<=24,'CLAIMS_BOUNDS');
 for(const c of claims){object(c,['kind','text','sourceId','quote']);requireThat(['source_assertion','observation','assumption','estimate','hypothesis','unknown'].includes(c.kind)&&typeof c.text==='string'&&c.text.length>0&&c.text.length<=1200,'CLAIM_INVALID');
  if(c.sourceId!==null){const s=sources.find(s=>s.id===c.sourceId);requireThat(s&&typeof c.quote==='string'&&c.quote.length>0&&s.text.includes(c.quote),'CLAIM_SOURCE_OR_QUOTE_INVALID');}
  else requireThat(c.quote===null&&['assumption','estimate','hypothesis','unknown'].includes(c.kind),'CLAIM_EVIDENCE_REQUIRED');
 }
 // Exact quotation validates a reference, not the truth of the interpretation.
 return {claims,referenceChecks:'passed',semanticTruth:'not_established',snapshotHash:hash(sources)};
}
