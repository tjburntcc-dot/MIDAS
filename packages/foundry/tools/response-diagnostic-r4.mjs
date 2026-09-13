// Exact owner-authorized one-read diagnostic. No POST/count/retry path exists.
import {readFileSync,writeFileSync,existsSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,rawHash,requireThat} from '../src/contracts.ts';
import {signed,verified} from '../src/experiment/config.ts';
const original=resolve('../foundry-worktree-031-contracts-r4/var/portfolio-031-continuation-r4');
const out=join(original,'diagnostics/response-r4-one-read');
const responseId='resp_0a21f75cf3898a96006aa6eec8de0087d2a16fc185bdc9c795';
const attemptId='p031-2c7a9771c07a9c24-0';
const publicKey=readFileSync(join(original,'auth/portfolio-owner.pub'),'utf8');
const parent=verified(JSON.parse(readFileSync(join(original,'portfolio.authorization.json'),'utf8')),publicKey);
const db=new DatabaseSync(join(original,'portfolio.sqlite'),{readOnly:true});
const job=JSON.parse(db.prepare("SELECT body FROM entities WHERE kind='response-job' AND key LIKE ?").get('%/'+attemptId).body);db.close();
requireThat(job.responseId===responseId&&job.terminalHash==='3760be8e2a4eb24e3d9fa55d9313b19d8a9e6ec0926f277a6b54e02aa8c0fa9d'&&hash(job.terminal)===job.terminalHash,'ORIGINAL_CHANGED');
requireThat(parent.projectId==='proj_H01ORqdOPQM6vdGwQYsqFL5r'&&Date.parse(parent.expiresAt)>Date.now(),'PROJECT_OR_EXPIRY');
requireThat(job.retrievals===2&&job.retrievals+1<=240,'READ_BOUNDARY');
const grant={kind:'response-diagnostic-one-read-v1',approved:true,approvedBy:'Mason',approvalReference:'Explicit owner authorization in this chat: one GET of exact R4 response; 15 seconds; no retry/count/inference; preserve original.',originalRoot:original,parentGrantHash:hash(parent),attemptId,responseId,originalTerminalHash:job.terminalHash,projectId:parent.projectId,credentialFile:parent.credentialFile,endpoint:'https://api.openai.com/v1/responses/'+responseId,method:'GET',deadlineMs:15000,maxGETs:1,maxPOSTs:0,maxCounts:0,retries:0,expiresAt:parent.expiresAt,runnerHash:rawHash(readFileSync(fileURLToPath(import.meta.url))),accounting:{existingRetrievals:2,diagnosticRetrievals:1,combinedRetrievals:3,perResponseCap:240,aggregateCap:3600,retainedMinor:1917,existingUnpricedBufferMinor:400,newBufferMinor:0,charge:'unknown; no reservation released'}};
const write=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
if(process.argv[2]!=='execute'){write('authorization.request.json',grant);console.log(JSON.stringify({prepared:true,hash:hash(grant),out}));process.exit(0);}
requireThat(hash(JSON.parse(readFileSync(join(out,'authorization.request.json'),'utf8')))===hash(grant),'DIAGNOSTIC_CHANGED');
requireThat(!existsSync(join(out,'dispatch.json'))&&!existsSync(join(out,'authorization.json')),'DIAGNOSTIC_ALREADY_ADMITTED');
const ownerPrivate=readFileSync('C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/owner.key','utf8');
const envelope=signed(grant,ownerPrivate);requireThat(hash(verified(envelope,publicKey))===hash(grant),'SIGNATURE_INVALID');write('authorization.json',envelope);
const credential=readFileSync(grant.credentialFile,'utf8').trim();requireThat(credential.length>0,'CREDENTIAL_EMPTY');
const requestHeaders={'OpenAI-Project':grant.projectId,Accept:'application/json'};
const intent={authorizationHash:hash(grant),attemptId,responseId,method:'GET',url:grant.endpoint,requestHeaders,deadlineMs:15000,at:new Date().toISOString(),getAdmissions:1,counts:0,inferences:0,retries:0};
const fd=openSync(join(out,'dispatch.json'),'wx',0o600);writeSync(fd,JSON.stringify(intent,null,2));fsyncSync(fd);closeSync(fd);
try{
 const response=await fetch(grant.endpoint,{method:'GET',headers:{...requestHeaders,Authorization:'Bearer '+credential},redirect:'error',signal:AbortSignal.timeout(15000)});
 const headers=Object.fromEntries(['x-request-id','date','content-type','openai-processing-ms','openai-version','openai-project'].map(k=>[k,response.headers.get(k)]).filter(([,v])=>v!==null));
 write('response-headers.json',{httpStatus:response.status,headers});
 const bytes=Buffer.from(await response.arrayBuffer());
 // Never capture a credential even if a provider unexpectedly echoes it.
 requireThat(!bytes.includes(Buffer.from(credential)),'CREDENTIAL_ECHO_BODY_WITHHELD');
 writeFileSync(join(out,'response-body.json'),bytes,{flag:'wx',mode:0o600});
 let body=null;try{body=JSON.parse(bytes.toString('utf8'));}catch{}
 const observation={...intent,finishedAt:new Date().toISOString(),httpStatus:response.status,responseHeaders:headers,bodyHash:rawHash(bytes),bodyBytes:bytes.length,responseIdMatches:body?.id===responseId,status:body?.status??null,error:body?.error??null,incomplete_details:body?.incomplete_details??null,usage:body?.usage??null,accounting:grant.accounting,originalUnchanged:true};
 write('observation.json',observation);
 // Only selected failure metadata goes to the console, never the full body.
 console.log(JSON.stringify({httpStatus:response.status,status:body?.status,error:body?.error??null,usage:body?.usage??null,bodyHash:observation.bodyHash,out}));
}catch(e){write('diagnostic-failure.json',{at:new Date().toISOString(),code:e.code??(e.name==='TimeoutError'?'DEADLINE':'READ_OR_PERSIST_FAILURE'),getAdmissions:1,noRetry:true,originalUnchanged:true});console.log(JSON.stringify({diagnosticFailed:true,noRetry:true,out}));process.exitCode=1;}
