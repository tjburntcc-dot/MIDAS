import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {StateStore} from '../src/state.ts';
import {hash,rawHash,canonical,requireThat} from '../src/contracts.ts';
import {readJSON,writeJSON,verified,implementationHash} from '../src/experiment/config.ts';
import {countPayload,countTokens,TOKEN_COUNT_ENDPOINT} from '../src/experiment/token-count.ts';
const codeHash=()=>hash({runtime:implementationHash(),runner:readFileSync(fileURLToPath(import.meta.url),'utf8').replace(/\r\n/g,'\n')});
function original(root){
 const auth=verified(readJSON(join(root,'authorization.json')),readFileSync(join(root,'auth','owner.pub'),'utf8'));
 requireThat(auth.approved===true&&auth.route.model==='gpt-5.6-sol'&&auth.route.reasoningEffort==='medium','ORIGINAL_GRANT_MISMATCH');
 const db=new DatabaseSync(join(root,'experiment.sqlite'),{readOnly:true});
 try{
  const rows=db.prepare("SELECT body FROM entities WHERE kind='model-attempt' ORDER BY key").all().map(r=>JSON.parse(String(r.body)));
  requireThat(rows.length===2&&rows.every(r=>r.stage==='smoke'&&r.inferenceDispatchIntent===false&&r.errorCode==='TOKEN_COUNT_HTTP_ERROR'),'ORIGINAL_ATTEMPTS_CHANGED');
  const source=rows.find(r=>r.metadata.caseId==='D-001');requireThat(source&&rawHash(source.requestBytes)===source.requestHash,'ORIGINAL_REQUEST_HASH_MISMATCH');
  const body=JSON.parse(source.requestBytes);requireThat(body.model===auth.route.model,'ORIGINAL_MODEL_MISMATCH');
  return {auth,rowsHash:hash(rows),priorExposureMinor:rows.reduce((n,r)=>n+r.reservation+(r.invoice?.minorUnits??0),0),body,sourceHash:source.requestHash,countHash:rawHash(canonical(countPayload(body)))};
 }finally{db.close();}
}
export function prepareDiagnostic(root,originalRoot){
 root=resolve(root);originalRoot=resolve(originalRoot);requireThat(!existsSync(root),'DIAGNOSTIC_ROOT_EXISTS');
 const o=original(originalRoot);mkdirSync(root,{recursive:true});
 const request={kind:'token-count-diagnostic',approved:false,approvedBy:null,approvalReference:null,diagnosticRoot:root,originalRoot,codeHash:codeHash(),projectId:o.auth.projectId,credentialFile:o.auth.credentialFile,endpoint:TOKEN_COUNT_ENDPOINT,model:'gpt-5.6-sol',sourceCase:'D-001',originalRequestHash:o.sourceHash,countRequestHash:o.countHash,originalRowsHash:o.rowsHash,priorExposureMinor:o.priorExposureMinor,maxCountRequests:1,maxInferenceRequests:0,reservationMinor:13,aggregateCapMinor:100,timeoutMs:10000,expiresAt:'2026-09-11T22:00:00Z'};
 requireThat(o.priorExposureMinor+13<=100,'AGGREGATE_CAP');writeJSON(join(root,'authorization.request.json'),request,true);return request;
}
export async function runDiagnostic(root,transport=fetch){
 root=resolve(root);const proposed=readJSON(join(root,'authorization.request.json'));
 const grant=verified(readJSON(join(root,'authorization.json')),readFileSync(join(proposed.originalRoot,'auth','owner.pub'),'utf8'));
 requireThat(grant.kind==='token-count-diagnostic'&&grant.approved===true&&grant.approvedBy&&grant.approvalReference&&Date.parse(grant.expiresAt)>Date.now(),'DIAGNOSTIC_APPROVAL_REQUIRED');
 requireThat(hash({...grant,approved:false,approvedBy:null,approvalReference:null})===hash(proposed),'DIAGNOSTIC_GRANT_CHANGED');
 requireThat(grant.diagnosticRoot===root&&grant.codeHash===codeHash()&&grant.endpoint===TOKEN_COUNT_ENDPOINT&&grant.model==='gpt-5.6-sol'&&grant.maxCountRequests===1&&grant.maxInferenceRequests===0&&grant.reservationMinor===13&&grant.aggregateCapMinor===100&&grant.timeoutMs===10000,'DIAGNOSTIC_POLICY_MISMATCH');
 const o=original(grant.originalRoot);requireThat(o.rowsHash===grant.originalRowsHash&&o.sourceHash===grant.originalRequestHash&&o.countHash===grant.countRequestHash&&o.auth.projectId===grant.projectId&&o.auth.credentialFile===grant.credentialFile,'DIAGNOSTIC_BINDING_MISMATCH');
 requireThat(o.priorExposureMinor===grant.priorExposureMinor&&o.priorExposureMinor+13<=grant.aggregateCapMinor,'AGGREGATE_CAP');
 const store=new StateStore(join(root,'diagnostic.sqlite'));
 try{
  store.transaction(()=>{requireThat(!store.get('count-diagnostic','one'),'DIAGNOSTIC_ALREADY_ADMITTED');store.put('count-diagnostic','one',{authorizationHash:hash(grant),requestHash:o.countHash,sourceHash:o.sourceHash,reservationMinor:13,inferenceDispatches:0,countDispatchIntent:false,cost:{status:'unknown',money:null},status:'admitted',admittedAt:new Date().toISOString()},null);});
  const update=fields=>store.transaction(()=>{const old=store.get('count-diagnostic','one');store.put('count-diagnostic','one',{...old,...fields},old._version);});
  try{
   const credential=readFileSync(grant.credentialFile,'utf8').trim();
   const admitted=await countTokens(o.body,grant.projectId,credential,async diagnostic=>update({countDispatchIntent:true,diagnostic}),transport);
   update({status:admitted<=8192?'count_received':'input_ceiling_exceeded',admittedInputTokens:admitted,finishedAt:new Date().toISOString()});
  }catch(e){update({status:'failed',errorCode:['TOKEN_COUNT_HTTP_ERROR','TOKEN_COUNT_INVALID','TOKEN_COUNT_TRANSPORT_ERROR'].includes(e.code)?e.code:'DIAGNOSTIC_FAILED',finishedAt:new Date().toISOString()});}
  const result=store.get('count-diagnostic','one');writeJSON(join(root,'report.json'),{...result,priorExposureMinor:o.priorExposureMinor,aggregateExposureMinor:o.priorExposureMinor+result.reservationMinor,remainingAggregateRoomMinor:100-o.priorExposureMinor-result.reservationMinor});return readJSON(join(root,'report.json'));
 }finally{store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,root='var/foundry-count-diagnostic-028',old='var/foundry-smoke-028']=process.argv.slice(2);
 try{requireThat(['prepare','run'].includes(command),'COMMAND_REQUIRED');const result=command==='prepare'?prepareDiagnostic(root,old):await runDiagnostic(root);console.log(JSON.stringify(result,null,2));}
 catch(e){console.error(JSON.stringify({error:e.code??'DIAGNOSTIC_COMMAND_FAILED',message:'No automatic retry; inspect sanitized local diagnostic state.'}));process.exitCode=1;}
}
