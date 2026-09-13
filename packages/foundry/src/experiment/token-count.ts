import { canonical, rawHash, requireThat, safeInteger, FoundryError } from '../contracts.ts';
export const TOKEN_COUNT_ENDPOINT='https://api.openai.com/v1/responses/input_tokens';
const countFields=new Set(['conversation','input','instructions','model','parallel_tool_calls','personality','previous_response_id','reasoning','text','tool_choice','tools','truncation']);
const generationOnly=new Set(['max_output_tokens','service_tier','store','background']);
/** Keep every documented input-bearing field; reject new fields instead of undercounting. */
export function countPayload(body:Record<string,unknown>){
 const out:Record<string,unknown>={};
 for(const [key,value] of Object.entries(body)){requireThat(countFields.has(key)||generationOnly.has(key),'UNSUPPORTED_COUNT_PROJECTION');if(countFields.has(key))out[key]=value;}
 requireThat(typeof out.model==='string'&&out.input!==undefined,'COUNT_INPUT_REQUIRED');
 return out;
}
const types=new Set(['invalid_request_error','authentication_error','permission_error','rate_limit_error','server_error','not_found_error']);
const messages:Record<string,string>={invalid_api_key:'Provider rejected the API credential.',invalid_project:'Provider rejected the project.',permission_denied:'Provider denied access.',model_not_found:'Requested model unavailable or inaccessible.',insufficient_quota:'Provider reports insufficient quota.',rate_limit_exceeded:'Provider rate limit exceeded.',unknown_parameter:'Provider rejected an unknown request parameter.',unsupported_parameter:'Provider rejected an unsupported request parameter.',invalid_parameter:'Provider rejected a request parameter.',invalid_request_error:'Provider rejected the request.',server_error:'Provider reported a server error.'};
const parameters=new Set([...countFields,...generationOnly]);
export function sanitizeCountResponse(status:number,requestId:unknown,body:any,secret=''){
 const safeValue=(v:unknown)=>typeof v==='string'&&!(secret&&v.includes(secret));
 const type=safeValue(body?.error?.type)&&types.has(body.error.type)?body.error.type:null;
 const code=safeValue(body?.error?.code)&&Object.hasOwn(messages,body.error.code)?body.error.code:null;
 const id=safeValue(requestId)&&/^req_[A-Za-z0-9]{8,96}$/.test(requestId as string)&&!/bearer|authorization/i.test(requestId as string)?requestId:null;
 const parameter=safeValue(body?.error?.param)&&parameters.has(body.error.param)?body.error.param:null;
 return {httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,providerErrorType:type,providerErrorCode:code,providerRequestId:id,errorParameter:parameter,message:code?messages[code]:status>=400?'Provider returned an HTTP error; unrecognized message withheld.':null,messageSource:'local_allowlist',unrecognizedErrorFieldsWithheld:!!body?.error&&(!type||!code)};
}
export async function boundedJSON(response:Response,maxBytes=16384){
 if(!response.body)return null;
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes){await reader.cancel();return null;}chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{return null;}finally{reader.releaseLock();}
}
/** Local byte containment is distinct from provider token admission. The larger
 * bound must be selected by trusted, signed configuration; defaults stay fixed. */
export function assertCountableRequest(body:Record<string,unknown>,maxRequestBytes=65536){
 requireThat([65536,196608].includes(maxRequestBytes),'COUNT_REQUEST_BYTE_LIMIT_INVALID');countPayload(body);
 requireThat(Buffer.byteLength(canonical(body),'utf8')<=maxRequestBytes,'REQUEST_TOO_LARGE');
}
/** Only this endpoint is reachable here. No inference, redirects, retries or raw-body logging. */
export async function countTokens(body:Record<string,unknown>,projectId:string,credential:string,observe:(event:Record<string,unknown>)=>Promise<void>,transport:typeof fetch=fetch,maxRequestBytes=65536){
 const projected=countPayload(body),bytes=canonical(projected);
 assertCountableRequest(body,maxRequestBytes);
 requireThat(/^proj_[A-Za-z0-9_-]+$/.test(projectId),'PROJECT_REQUIRED');
 requireThat(credential.length>0,'MODEL_ACCESS_REQUIRED');
 const started=Date.now();const binding={operation:'token_count',endpoint:TOKEN_COUNT_ENDPOINT,requestHash:rawHash(bytes),inferenceRequestHash:rawHash(canonical(body))};
 await observe({...binding,phase:'dispatch_intent'});
 let response:Response;
 try{response=await transport(TOKEN_COUNT_ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+credential,'OpenAI-Project':projectId,'content-type':'application/json'},body:bytes,redirect:'error',signal:AbortSignal.timeout(10000)});}
 catch{await observe({...binding,phase:'transport_error',httpStatus:null,providerErrorType:null,providerErrorCode:null,providerRequestId:null,message:'No HTTP response available; transport detail withheld.',messageSource:'local_allowlist',latencyMs:Date.now()-started});throw new FoundryError('TOKEN_COUNT_TRANSPORT_ERROR');}
 const value=await boundedJSON(response),diagnostic=sanitizeCountResponse(response.status,response.headers.get('x-request-id'),value,credential);
 const valid=response.ok&&value?.object==='response.input_tokens'&&Number.isSafeInteger(value?.input_tokens)&&value.input_tokens>=0;
 await observe({...binding,...diagnostic,phase:!response.ok?'http_error':valid?'count_received':'invalid_response',inputTokens:valid?value.input_tokens:null,latencyMs:Date.now()-started});
 requireThat(response.ok,'TOKEN_COUNT_HTTP_ERROR');requireThat(valid,'TOKEN_COUNT_INVALID');safeInteger(value.input_tokens);
 const admitted=value.input_tokens+Math.ceil(value.input_tokens/10)+256;safeInteger(admitted);return admitted;
}
