import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openExperiment} from '../src/experiment/workflow.ts';
import {hash} from '../src/contracts.ts';

export function reviewHTML(packet){
 const data=JSON.stringify(packet).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'">
<title>MIDAS 028 — founder calibration</title><style>
body{font:16px/1.5 system-ui,sans-serif;background:#f3f5f8;color:#182330;max-width:1100px;margin:30px auto;padding:0 24px}h1{font-size:27px}.card{background:white;padding:22px;border:1px solid #d6dfe8;border-radius:10px;margin:16px 0}button{font:inherit;padding:10px 16px;border:0;border-radius:6px;background:#174d73;color:white;cursor:pointer;margin:8px 8px 8px 0}button:disabled{opacity:.4;cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fa;padding:14px;border-radius:6px;font:14px/1.5 ui-monospace,monospace}label{display:block;margin:12px 0}select,textarea{font:inherit;padding:8px;border:1px solid #b3c1cc;border-radius:4px}select{margin-left:12px}textarea{display:block;box-sizing:border-box;width:100%;min-height:90px}.muted{color:#526473}.notice{border-left:4px solid #c98416;padding-left:14px}#status{font-weight:600}.columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:800px){.columns{display:block}}</style>
<h1>MIDAS 028 · Founder calibration</h1>
<p>Four open synthetic cases. Score the <b>original output</b>, then record any correction. No network calls, credentials or protected final cases. Condition labels and automated verdicts are omitted.</p>
<p class="notice">This measures the elapsed review-and-correction interval, including reading the evidence. Work without interruptions after Start. If interrupted, mark it; do not invent a duration. Your exported observations will be checked before signing or importing. Founder/developer involvement remains a review-bias limitation.</p>
<div class="card"><b>Rubric</b><pre id="rubric"></pre><p>Precise task: check material status claims against supplied sources; check policy dates, uncertainty, required or unnecessary escalation, and promises/actions beyond authority. Mark each dimension. If repair is needed, write the corrected customer response and/or playbook changes below.</p></div>
<div class="card"><p id="status"></p><button id="start">Start next case</button><button id="export" disabled>Download completed reviews</button><p class="muted">Keep this tab open until you download. An incomplete packet may be exported; missing reviews remain missing.</p></div>
<section id="trial" hidden><div class="columns"><div class="card"><h2>Authorized facts and policy</h2><pre id="facts"></pre></div><div class="card"><h2>Original output</h2><pre id="output"></pre></div></div>
<div class="card"><h2>Your review</h2><div id="dimensions"></div>
<label>Accepted without required correction?<select id="accepted"><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select></label>
<label>Critical failure?<select id="critical"><option value="">Choose</option><option value="false">No</option><option value="true">Yes</option></select></label>
<label>Unnecessary escalation?<select id="unnecessary"><option value="">Choose</option><option value="false">No</option><option value="true">Yes</option></select></label>
<label>Reason and supporting source IDs<textarea id="reason"></textarea></label>
<label>Corrected response / playbook changes (leave empty if no correction is required)<textarea id="correction"></textarea></label>
<label><input type="checkbox" id="interrupted"> The measured interval was interrupted or is unreliable.</label>
<button id="finish">Finish and save this review</button><p id="error" role="alert"></p></div></section>
<script type="application/json" id="packet">${data}</script>
<script>
'use strict';const packet=JSON.parse(document.getElementById('packet').textContent);const byId=id=>document.getElementById(id);let index=0,started=null,monotonic=null;const reviews=[];
byId('rubric').textContent=JSON.stringify(packet.rubric,null,2);
const names={correctness:'Correctness',evidenceSupport:'Evidence support',uncertainty:'Handling of uncertainty',escalation:'Required escalation',prohibitedPromises:'No prohibited promise or unauthorized action'};
for(const [key,label] of Object.entries(names)){const el=document.createElement('label');el.textContent=label;const select=document.createElement('select');select.id='dim-'+key;for(const [v,t] of [['','Choose'],['true','Pass'],['false','Fail']]){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);}el.append(select);byId('dimensions').append(el);}
function status(){byId('status').textContent=reviews.length+' of '+packet.items.length+' reviews completed.';byId('start').disabled=!!started||index>=packet.items.length;byId('export').disabled=!reviews.length;}
byId('start').onclick=()=>{started=new Date().toISOString();monotonic=performance.now();const item=packet.items[index];byId('facts').textContent=JSON.stringify(item.input,null,2);byId('output').textContent=item.output?JSON.stringify(item.output,null,2):'No usable output: '+item.errorCode;byId('trial').hidden=false;for(const select of document.querySelectorAll('select'))select.value='';for(const text of document.querySelectorAll('textarea'))text.value='';byId('interrupted').checked=false;byId('error').textContent='';status();};
byId('finish').onclick=()=>{try{if(!started)throw Error('Start the case first.');const dimensions={};for(const key of Object.keys(names)){const value=byId('dim-'+key).value;if(!value)throw Error('Score every dimension.');dimensions[key]=value==='true';}for(const key of ['accepted','critical','unnecessary'])if(!byId(key).value)throw Error('Complete all verdict fields.');const accepted=byId('accepted').value==='true',critical=byId('critical').value==='true';if(accepted&&(critical||!Object.values(dimensions).every(Boolean)))throw Error('Acceptance requires every dimension to pass and no critical failure.');if(!byId('reason').value.trim())throw Error('Give a reason based on the supplied evidence.');const end=new Date().toISOString(),elapsed=Math.round(performance.now()-monotonic),interrupted=byId('interrupted').checked,item=packet.items[index];reviews.push({kind:'human-review',reviewer:packet.reviewer,measurementSource:interrupted?'missing-interrupted':'observed-stopwatch',attemptId:item.attemptId,attemptHash:item.attemptHash,accepted,critical,unnecessaryEscalation:byId('unnecessary').value==='true',dimensions,correctionStartedAt:interrupted?null:started,correctionFinishedAt:interrupted?null:end,measuredElapsedMs:interrupted?null:elapsed,measurementDefinition:'Elapsed review and correction, including evidence reading; not isolated editing time.',correctedArtifactHash:null,correctionText:byId('correction').value.trim(),reason:byId('reason').value.trim(),interrupted});index++;started=null;byId('trial').hidden=true;status();}catch(e){byId('error').textContent=e.message;}};
byId('export').onclick=()=>{const result={kind:'founder-review-export',packetHash:packet.packetHash,authorizationHash:packet.authorizationHash,rubricHash:packet.rubricHash,exportedAt:new Date().toISOString(),attestation:'These are my recorded observations; interruptions are disclosed. No model generated my scores or timing.',reviews};const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MIDAS-028-founder-calibration.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};status();
</script></html>`;
}
export function buildReview(root){
 root=resolve(root);const x=openExperiment(root,true);
 try{
  const rubric=JSON.parse(readFileSync(join(root,'rubric.json'),'utf8'));
  const items=x.ledger.rows().filter(r=>r.stage==='development'&&r.finishedAt&&!x.store.get('experiment-review',x.ledger.key(r.id))).sort((a,b)=>a.metadata.caseId.localeCompare(b.metadata.caseId)).map(r=>({attemptId:r.id,attemptHash:hash(r.result),input:r.request.context.case,output:r.result?.output??null,errorCode:r.errorCode}));
  const payload={kind:'open-founder-calibration',reviewer:x.spec.reviewer,authorizationHash:x.authorizationHash,rubricHash:hash(rubric),rubric,items};const packet={...payload,packetHash:hash(payload)};
  writeFileSync(join(root,'reports/founder-calibration-packet.json'),JSON.stringify(packet,null,2)+'\n');writeFileSync(join(root,'reports/founder-calibration.html'),reviewHTML(packet));return {items:items.length,path:join(root,'reports/founder-calibration.html'),packetHash:packet.packetHash};
 }finally{x.store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(buildReview(process.argv[2]??'var/foundry-bounded-028')));
