import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openExperiment,exploratoryReviewFor} from '../src/experiment/workflow.ts';
import {boundedReport} from '../src/experiment/bounded.ts';
import {objectiveChecks} from '../src/experiment/task.ts';
import {readJSON,writeJSON} from '../src/experiment/config.ts';
import {hash,rawHash} from '../src/contracts.ts';

export function reportExploratory(root){
 root=resolve(root);const x=openExperiment(root,true);
 try{
  if(!x.exploratory)throw Error('AMENDMENT_REQUIRED');
  const rows=x.ledger.rows(),current=rows.filter(r=>r.stage==='development'&&r.metadata.taskSpecificationHash===x.exploratory.casesHash);
  const items=current.map(r=>({attemptId:r.id,caseId:r.metadata.caseId,family:r.metadata.family,repeat:r.metadata.repeat,condition:r.metadata.condition,taskVersion:r.metadata.taskVersion,requestHash:r.requestHash,attemptHash:hash(r.result),finishedAt:r.finishedAt,error:r.errorCode??null,input:r.request.context.case,output:r.result?.output??null,objectiveTriage:objectiveChecks(x.exploratory.cases.find(c=>c.id===r.metadata.caseId),r.result?.output),assistedReview:exploratoryReviewFor(x,r),usage:r.result?.usage??null,cost:r.cost,observation:r.observation})).sort((a,b)=>a.caseId.localeCompare(b.caseId));
  const preservation=readJSON(join(root,'reports/pre-v3-preservation.json'));
  const originalFilesUnchanged=Object.entries(preservation.files).every(([p,d])=>rawHash(readFileSync(join(root,p)))===d);
  const originalAttemptsUnchanged=preservation.attempts.every(p=>{const r=x.store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key=?").get(p.key);return r&&hash(JSON.parse(String(r.body)))===p.hash;});
  if(!originalFilesUnchanged||!originalAttemptsUnchanged)throw Error('ORIGINAL_EVIDENCE_CHANGED');
  const summary={kind:'exploratory-development-observations',generatedAt:new Date().toISOString(),authorizationHash:x.authorizationHash,amendmentHash:x.exploratory.amendmentHash,taskVersion:x.exploratory.taskVersion,baselineHash:hash(readJSON(join(root,'baseline.json'))),caseManifestHash:x.exploratory.casesHash,rubricHash:x.exploratory.rubricHash,
   currentSpecification:{attempts:items.length,caseCount:new Set(items.map(i=>i.caseId)).size,families:new Set(items.map(i=>i.family)).size,assistedAccepted:items.filter(i=>i.assistedReview?.accepted===true).length,assistedRejected:items.filter(i=>i.assistedReview?.accepted===false).length,assistedUnresolved:items.filter(i=>i.assistedReview?.accepted==null).length,assistedCritical:items.filter(i=>i.assistedReview?.critical===true).length,unnecessaryEscalation:items.filter(i=>i.assistedReview?.unnecessaryEscalation===true).length,failedAttempts:items.filter(i=>i.error).length},
   originalSpecification:{developmentAttempts:rows.filter(r=>r.stage==='development'&&!r.metadata.taskVersion).length,assistedCalibration:'four founder AI-assisted judgments; D-001 accepted under explicit original-policy interpretation, not independent truth'},
   independentHumanCorrectionSeconds:null,independentValidation:false,protectedEvaluation:false,pairedComparison:null,
   limits:'Open synthetic cases with related variants; developer performed assisted analysis and saw sources. Separate task versions, no random population sample, no independent adjudication or measured correction time; no statistical superiority claim.',
   originalFilesUnchanged,originalAttemptsUnchanged,accounting:boundedReport(root),items};
  writeJSON(join(root,'reports/exploratory-v3-observations.json'),summary);return summary;
 }finally{x.store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const r=reportExploratory(process.argv[2]??'var/foundry-bounded-028');console.log(JSON.stringify({currentSpecification:r.currentSpecification,originalFilesUnchanged:r.originalFilesUnchanged,originalAttemptsUnchanged:r.originalAttemptsUnchanged,exposure:r.accounting.exposure},null,2));}
