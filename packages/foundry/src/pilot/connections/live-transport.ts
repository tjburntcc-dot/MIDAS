import {hash,requireThat} from '../../contracts.ts';
import type {ConnectionTransport,ProviderRequest,ProviderResponse} from './contracts.ts';
import type {ConnectionService} from './service.ts';

const bindings=new WeakMap<ConnectionTransport,{service:ConnectionService;id:string}>();
export function assertLiveConnectionBinding(transport:ConnectionTransport,service:ConnectionService,id:string){const bound=bindings.get(transport);requireThat(bound?.service===service&&bound.id===id,'CONNECTION_LIVE_TRANSPORT_BINDING');}

/** Trusted host boundary. Construction reads no credentials and makes no requests.
 * A connected account must separately supply a consented, business-bound token resolver.
 * There is no environment fallback, model-defined URL, redirect or automatic retry. */
export function createConnectionTransport(service:ConnectionService,id:string,options:{resolveAccessToken:(reference:{kind:string;id:string},binding:{businessId:string;provider:string;connectionId:string})=>Promise<string>;fetch?:typeof fetch;shopDomain?:string;maxRequests?:number;deadlineMs?:number}):ConnectionTransport{
 const initial=service.get(id),allowed=initial.capabilityIds,maximum=options.maxRequests??40,deadlineMs=options.deadlineMs??15000;
 requireThat(Number.isSafeInteger(maximum)&&maximum>=1&&maximum<=100&&Number.isSafeInteger(deadlineMs)&&deadlineMs>=1000&&deadlineMs<=30000,'CONNECTION_TRANSPORT_BOUNDS');
 let used=0;const fetcher=options.fetch??fetch;
 const active=()=>{const c=service.get(id),required=service.registry.get(c.provider).definition.capabilities.filter(x=>allowed.includes(x.id)).flatMap(x=>x.requiredScopes);requireThat(c.businessId===initial.businessId&&c.provider===initial.provider&&hash(c.credentialReference)===hash(initial.credentialReference)&&!c.revokedAt&&c.consent&&(!c.consent.expiresAt||Date.parse(c.consent.expiresAt)>Date.now())&&required.every(s=>c.consent!.scopes.includes(s))&&hash(c.capabilityIds)===hash(allowed),'CONNECTION_READ_AUTHORITY_CHANGED');return c;};
 const transport:ConnectionTransport={kind:'live',async request(request:ProviderRequest):Promise<ProviderResponse>{
  const c=active();requireThat(request.provider===c.provider&&request.capabilityIds?.length&&request.capabilityIds.every(x=>allowed.includes(x)),'CONNECTION_REQUEST_SCOPE');
  let url:URL;const p=request.path;requireThat(!/[?#\\]/.test(p)&&!p.includes('..'),'CONNECTION_PATH_DENIED');
  if(c.provider==='google_workspace'){
   requireThat(request.method==='GET'&&/^\/(?:drive\/v3\/files(?:\/[A-Za-z0-9_-]+)?|docs\/v1\/documents\/[A-Za-z0-9_-]+|sheets\/v4\/spreadsheets\/[A-Za-z0-9_-]+\/values\/[^/]+)$/.test(p),'CONNECTION_GOOGLE_READ_ONLY');
   url=new URL(p.startsWith('/docs/')?'https://docs.googleapis.com'+p.slice(5):p.startsWith('/sheets/')?'https://sheets.googleapis.com'+p.slice(7):'https://www.googleapis.com'+p);
  }else if(c.provider==='shopify_admin'){
   requireThat(typeof options.shopDomain==='string'&&/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(options.shopDomain),'CONNECTION_SHOP_DOMAIN');requireThat(request.method==='POST'&&p==='/admin/api/graphql.json','CONNECTION_SHOPIFY_READ_ONLY');
   const query=(request.body as any)?.query;requireThat(typeof query==='string'&&/^query\b/.test(query.trim())&&!/\bmutation\b/.test(query),'CONNECTION_GRAPHQL_MUTATION_DENIED');
   url=new URL('https://'+options.shopDomain+'/admin/api/2026-07/graphql.json');
  }else{requireThat(request.method==='POST'&&/^\/v1beta\/properties\/\d+:runReport$/.test(p),'CONNECTION_GA4_READ_ONLY');url=new URL('https://analyticsdata.googleapis.com'+p);}
  for(const[k,v]of Object.entries(request.query??{}))if(v!==undefined)url.searchParams.set(k,String(v));
  requireThat(used<maximum,'CONNECTION_REQUEST_CAP');used++;
  /* Adapter query objects deliberately use `undefined` for an omitted cursor.
   * Persist the effective query only; canonical storage has no undefined value. */
  const effectiveQuery=request.query?Object.fromEntries(Object.entries(request.query).filter(([,value])=>value!==undefined)):null;
  const key=id+'/read-'+crypto.randomUUID(),requestHash=hash({provider:request.provider,path:request.path,query:effectiveQuery,body:request.body??null});
  service.store.transaction(()=>service.store.put('pilot-connection-read',key,{id:key,connectionId:id,businessId:c.businessId,requestHash,method:request.method,endpoint:request.path,status:'admitted',at:new Date().toISOString()},null));
  let token:string|undefined;
  try{
   token=await options.resolveAccessToken(c.credentialReference,{businessId:c.businessId,provider:c.provider,connectionId:id});active();requireThat(typeof token==='string'&&token.length>0&&!/[\r\n]/.test(token),'CONNECTION_CREDENTIAL_UNAVAILABLE');
   const headers:Record<string,string>={'accept':'application/json',...(request.body?{'content-type':'application/json'}:{}),...(c.provider==='shopify_admin'?{'X-Shopify-Access-Token':token}:{Authorization:'Bearer '+token})};
   const response=await fetcher(url,{method:request.method,headers,body:request.body?JSON.stringify(request.body):undefined,redirect:'error',signal:AbortSignal.timeout(deadlineMs)});token=undefined;
   const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2_000_000){await reader.cancel();throw Error('CONNECTION_RESPONSE_BYTES');}chunks.push(part.value);}const buffer=Buffer.concat(chunks),type=response.headers.get('content-type')??'';
   const body=request.responseFormat==='base64'||type.includes('application/pdf')?buffer.toString('base64'):type.includes('json')?JSON.parse(buffer.toString('utf8')):buffer.toString('utf8');
   const safeHeaders=Object.fromEntries(['content-type','x-request-id','x-goog-request-id','retry-after'].flatMap(k=>response.headers.has(k)?[[k,response.headers.get(k)!.slice(0,200)]]:[]));
   active();service.store.transaction(()=>{const old=service.store.get('pilot-connection-read',key);service.store.put('pilot-connection-read',key,{...old,status:'observed',httpStatus:response.status,responseBytes:bytes,responseHash:hash(buffer.toString('base64')),headers:safeHeaders,finishedAt:new Date().toISOString()},old._version);});
   return {status:response.status,headers:safeHeaders,body};
  }catch(error){token=undefined;const name=String((error as any)?.name??'Error');service.store.transaction(()=>{const old=service.store.get('pilot-connection-read',key);service.store.put('pilot-connection-read',key,{...old,status:'failed_or_unknown',error:name==='TimeoutError'?'CONNECTION_DEADLINE':'CONNECTION_READ_FAILED',finishedAt:new Date().toISOString()},old._version);});throw Error(name==='TimeoutError'?'CONNECTION_DEADLINE':'CONNECTION_READ_FAILED');}
 }};bindings.set(transport,{service,id});return transport;
}
