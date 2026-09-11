import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from '../src/contracts.ts';
import {openExperiment} from '../src/experiment/workflow.ts';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function annotateAssisted(bytes,packet,recordedAt){
 const source=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 const {packetHash,...payload}=packet;
 if(hash(payload)!==packetHash||source.packetHash!==packetHash||source.authorizationHash!==packet.authorizationHash||source.rubricHash!==packet.rubricHash)throw Error('REVIEW_SCOPE_MISMATCH');
 const ids=new Set();
 if(source.reviews.length!==packet.items.length)throw Error('REVIEW_SET_MISMATCH');
 for(const r of source.reviews){
  const item=packet.items.find(i=>i.attemptId===r.attemptId);
  if(!item||item.attemptHash!==r.attemptHash||r.reviewer!==packet.reviewer||ids.has(r.attemptId))throw Error('REVIEW_IDENTITY_MISMATCH');
  ids.add(r.attemptId);
 }
 return {kind:'assisted-calibration-provenance-amendment',version:1,recordedAt,sourceSha256:sha256(bytes),sourceExportedAt:source.exportedAt,packetHash,authorizationHash:source.authorizationHash,rubricHash:source.rubricHash,
  authority:'Founder explicitly corrected all four reviews in this Mission 028 chat: AI-assisted; exclude durations from independent human review/correction-time metrics. This record documents that correction, not a new reviewer signature.',
  supersedes:'Original human-review classification, unassisted boilerplate attestation and timing eligibility only. Original bytes, timestamps, interruption flags, scores and reasons remain preserved.',
  evidenceClass:'assisted calibration judgments; not independent human validation',assistanceModel:null,assistanceCost:null,
  reviews:source.reviews.map(r=>({...r,kind:'assisted-calibration-review',aiAssisted:true,independentHumanReviewEligible:false,independentValidation:false,independentHumanTimingEligible:false,measurementSource:'ai-assisted-excluded',
   originalTiming:{measurementSource:r.measurementSource,correctionStartedAt:r.correctionStartedAt,correctionFinishedAt:r.correctionFinishedAt,measuredElapsedMs:r.measuredElapsedMs,interrupted:r.interrupted},
   correctionStartedAt:null,correctionFinishedAt:null,measuredElapsedMs:null,correctionSeconds:null})),
  metrics:{assistedJudgments:source.reviews.length,assistedAccepted:source.reviews.filter(r=>r.accepted).length,assistedCritical:source.reviews.filter(r=>r.critical).length,independentHumanReviews:0,eligibleIndependentTimingObservations:0,independentReviewCorrectionSeconds:null,meanIndependentReviewCorrectionSeconds:null},
  limitation:'Assisted acceptance is exploratory calibration evidence only. No independent quality validation, measured independent correction effort or specialist improvement is established. Do not import these records as experiment-review or mark the existing calibration gate complete.'};
}
function preserve(path,bytes){if(existsSync(path)){if(!readFileSync(path).equals(bytes))throw Error('PRESERVED_ARTIFACT_CONFLICT');}else writeFileSync(path,bytes,{flag:'wx'});}
export function recordAssisted(root,sourcePath){
 root=resolve(root);const bytes=readFileSync(sourcePath),packet=JSON.parse(readFileSync(join(root,'reports/founder-calibration-packet.json'),'utf8'));
 const amendment=annotateAssisted(bytes,packet,new Date().toISOString()),x=openExperiment(root,true);
 try{
  if(x.authorizationHash!==amendment.authorizationHash||hash(JSON.parse(readFileSync(join(root,'rubric.json'),'utf8')))!==amendment.rubricHash)throw Error('CURRENT_SCOPE_MISMATCH');
  for(const r of amendment.reviews){const row=x.ledger.get(r.attemptId);if(!row||row.stage!=='development'||hash(row.result)!==r.attemptHash)throw Error('ATTEMPT_PROVENANCE_MISMATCH');if(x.store.get('experiment-review',x.ledger.key(r.attemptId)))throw Error('EXISTING_REVIEW_REQUIRES_EXPLICIT_SUPERSESSION');}
 }finally{x.store.close();}
 const dir=join(root,'reviews');mkdirSync(dir,{recursive:true});
 const original=join(dir,'calibration-original-'+amendment.sourceSha256+'.json'),annotation=join(dir,'calibration-assisted-'+amendment.sourceSha256+'.json');
 preserve(original,bytes);
 if(!existsSync(annotation))writeFileSync(annotation,JSON.stringify(amendment,null,2)+'\n',{flag:'wx'});
 else{const existing=JSON.parse(readFileSync(annotation,'utf8'));if(hash({...existing,recordedAt:amendment.recordedAt})!==hash(amendment))throw Error('ANNOTATION_CONFLICT');}
 if(!readFileSync(sourcePath).equals(bytes))throw Error('SOURCE_CHANGED');
 return {original,annotation,sourceSha256:amendment.sourceSha256,metrics:amendment.metrics,providerRequests:0,importedIndependentReviews:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(recordAssisted(process.argv[2],process.argv[3]),null,2));
