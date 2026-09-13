/** Exact local evidence audit; zero network or credential access. */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {canonical,hash,rawHash} from '../src/contracts.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {countPayload} from '../src/experiment/token-count.ts';
const parent=resolve(process.argv[2]),out=resolve(process.argv[3]);mkdirSync(out,{recursive:true});
const g=JSON.parse(readFileSync(join(parent,'portfolio.authorization.json'),'utf8')).payload;
const db=new DatabaseSync(join(parent,'portfolio.sqlite'),{readOnly:true});
try{
 const rows=k=>db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY key').all(k).map(r=>JSON.parse(r.body));
 const attempts=rows('model-attempt').filter(a=>a.scope.runId===g.id).sort((a,b)=>a.admittedAt.localeCompare(b.admittedAt));
 const execution=rows('portfolio-execution').find(e=>e.taskId==='quote-desk/investigate-v4-r1');
 const strings=x=>typeof x==='string'?[x]:x&&typeof x==='object'?Object.values(x).flatMap(strings):[];
 let rejected=null;
 const trace=attempts.map((a,i)=>{
  const binding=rows('portfolio-work-binding').find(b=>b.attemptId===a.id),body=buildResponsesBody(g.route,binding.request,binding.schema),bytes=canonical(body),c=JSON.parse(body.input).context;
  if(rawHash(bytes)!==a.requestHash||binding.bodyHash!==a.requestHash||rawHash(canonical(countPayload(body)))!==a.observation.tokenCount.requestHash)throw Error('HISTORICAL_PAYLOAD_IDENTITY_CHANGED');
  writeFileSync(join(out,'request-'+i+'-hash-verified-reconstruction.json'),bytes,{flag:'wx'});
  const outcome=execution.observations[i]?.result,proposed=a.result.output.toolCall?.arguments?.content;
  const row={attempt:a.id,requestHash:a.requestHash,serializedBytes:Buffer.byteLength(bytes),requestProvenance:'Canonical reconstruction from retained exact request/schema/route, verified against admitted digest; not claimed to be separately retained wire bytes',
   authoritativeSource:c.workspace.currentSource.map(f=>({path:f.path,sha256:rawHash(f.content),bytes:Buffer.byteLength(f.content)})),
   latestRejectedCandidateBeforeRequest:rejected?{sha256:rawHash(rejected),bytes:Buffer.byteLength(rejected),completeContentVisible:strings(c).includes(rejected)}:null,
   explicitRepairTarget:c.workspace.repairTarget??null,feedback:c.observations.map(o=>({tool:o.tool,error:o.result?.error,output:o.result?.output})),
   originalDraftFeedback:c.draftCorrection,remaining:c.remaining,finish:c.callEconomy,action:a.result.output,
   toolOutcome:outcome,proposedBytes:proposed?Buffer.byteLength(proposed):null,proposedCompactJsonBytes:proposed?Buffer.byteLength(JSON.stringify(JSON.parse(proposed))):null};
  if(outcome?.error==='WORKSPACE_HANDOFF_TOO_LARGE')rejected=proposed;
  return row;
 });
 const result={provenance:'Development-assistant forensic audit of unchanged local execution records',at:new Date().toISOString(),parentRoot:parent,attempts:trace,providerRequests:0,credentialAccess:false};
 writeFileSync(join(out,'seven-admission-trace.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(trace.map(({attempt,authoritativeSource,latestRejectedCandidateBeforeRequest,remaining,proposedBytes,proposedCompactJsonBytes,toolOutcome})=>({attempt,authoritativeSource,latestRejectedCandidateBeforeRequest,remaining,proposedBytes,proposedCompactJsonBytes,toolOutcome:toolOutcome?.error??toolOutcome?.ok})),null,2));
}finally{db.close();}
