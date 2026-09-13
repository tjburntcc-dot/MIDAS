/** Provider diagnostics are evidence, never instructions or authority. Only these
 * bounded fields enter the general ledger; complete diagnostic bodies belong in
 * separately authorized protected storage. Redact before truncating. */
export function responseObservation(raw:any,secret:string){
 const clean=(value:unknown,limit=4096)=>{
  if(typeof value!=='string')return null;
  return (secret?value.split(secret).join('[REDACTED]'):value)
   .replace(/Bearer\s+[^\s"\\]+/gi,'Bearer [REDACTED]')
   .replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]')
   .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,limit);
 };
 const status=['completed','failed','incomplete','cancelled','queued','in_progress'].includes(raw?.status)?raw.status:null;
 const error=raw?.error&&typeof raw.error==='object'?{code:clean(raw.error.code,180),type:clean(raw.error.type,180),param:clean(raw.error.param,180),message:clean(raw.error.message),messageTruncated:typeof raw.error.message==='string'&&raw.error.message.length>4096}:null;
 const validCount=(n:any)=>Number.isSafeInteger(n)&&n>=0?n:null;
 return {providerRequestId:clean(raw?.id,200),model:clean(raw?.model,180),status,
  outcome:status==='failed'?'terminal_failed':status==='incomplete'?'terminal_incomplete':status==='cancelled'?'terminal_cancelled':status==='completed'?'terminal_completed':status?'pending':'unknown',
  providerError:error,incompleteDetails:raw?.incomplete_details?{reason:clean(raw.incomplete_details.reason,180)}:null,
  inputTokens:validCount(raw?.usage?.input_tokens),outputTokens:validCount(raw?.usage?.output_tokens),
  accountingUsage:validCount(raw?.usage?.input_tokens)!==null&&validCount(raw?.usage?.output_tokens)!==null?'reported_unvalidated':'unknown'};
}
export function terminalFailureCode(status:unknown){
 return status==='failed'?'MODEL_RESPONSE_FAILED':status==='incomplete'?'MODEL_RESPONSE_INCOMPLETE':status==='cancelled'?'MODEL_RESPONSE_CANCELLED':null;
}
