import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hash} from '../../src/contracts.ts';
import {annotateAssisted} from '../../tools/annotate-assisted-calibration.mjs';
function fixture(){
 const payload={reviewer:'test',authorizationHash:'auth',rubricHash:'rubric',items:[0,1,2,3].map(i=>({attemptId:String(i),attemptHash:'hash'+i}))},packet={...payload,packetHash:hash(payload)};
 const source={packetHash:packet.packetHash,authorizationHash:'auth',rubricHash:'rubric',exportedAt:'2026-09-11T02:07:21.423Z',reviews:packet.items.map((r,i)=>({...r,reviewer:'test',kind:'human-review',accepted:true,critical:false,reason:'original reason',measurementSource:i<2?'observed-stopwatch':'missing-interrupted',correctionStartedAt:i<2?'original-start':null,correctionFinishedAt:i<2?'original-end':null,measuredElapsedMs:i<2?123000:null,interrupted:i>=2}))};
 return {packet,source,bytes:Buffer.from(JSON.stringify(source,null,2)+'\r\n')};
}
test('all assisted reviews exclude effective timing while preserving original observations and raw bytes',()=>{
 const {packet,source,bytes}=fixture(),before=Buffer.from(bytes),a=annotateAssisted(bytes,packet,'recorded');assert.deepEqual(bytes,before);assert.equal(a.sourceSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(a.sourceExportedAt,source.exportedAt);
 for(let i=0;i<4;i++){const r=a.reviews[i];assert.equal(r.aiAssisted,true);assert.equal(r.independentHumanReviewEligible,false);assert.equal(r.independentHumanTimingEligible,false);assert.equal(r.correctionSeconds,null);assert.equal(r.measuredElapsedMs,null);assert.equal(r.originalTiming.measuredElapsedMs,source.reviews[i].measuredElapsedMs);assert.equal(r.originalTiming.correctionStartedAt,source.reviews[i].correctionStartedAt);assert.equal(r.reason,source.reviews[i].reason);assert.equal(r.accepted,true);}
 assert.equal(a.metrics.eligibleIndependentTimingObservations,0);assert.equal(a.metrics.meanIndependentReviewCorrectionSeconds,null);
});
test('amendment rejects wrong scope, changed output hashes, duplicate or missing reviews',()=>{
 for(const change of [(s:any)=>s.authorizationHash='wrong',(s:any)=>s.reviews[0].attemptHash='wrong',(s:any)=>s.reviews[1]=s.reviews[0],(s:any)=>s.reviews.pop()]){const {packet,source}=fixture();change(source);assert.throws(()=>annotateAssisted(Buffer.from(JSON.stringify(source)),packet,'recorded'),/MISMATCH/);}
 const {packet,bytes}=fixture();packet.rubricHash='changed';assert.throws(()=>annotateAssisted(bytes,packet,'recorded'),/MISMATCH/);
});
