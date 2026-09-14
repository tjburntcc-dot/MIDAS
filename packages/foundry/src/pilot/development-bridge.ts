import {hash,requireThat} from '../contracts.ts';
import {mockResult} from '../portfolio/worker.ts';
import {PilotOutcomes} from './outcomes.ts';
import {WorkerDevelopmentService} from './worker-development-service.ts';
import type {DevelopmentCause,PracticeCase} from './worker-development.ts';

/** Connect an actual owner correction and task binding to the job registry.
 * Drafted test cases are exploratory, developer-visible proposals. They never
 * become a confidential holdout or an independent semantic judgment. */
export class PilotDevelopmentBridge{
 readonly outcomes:PilotOutcomes;readonly development:WorkerDevelopmentService;
 constructor(outcomes:PilotOutcomes){this.outcomes=outcomes;this.development=new WorkerDevelopmentService(outcomes.store);}
 prepare(businessId:string,input:{taskId:string;sourceId:string;quote:string;consequence:string;cause:DevelopmentCause;rationale:string;alternatives:string[];material:{title:string;content:string;provenance:string;rights:'reusable'};procedureAddition:string;assisted:boolean}){
  const {store,execution,knowledge}=this.outcomes,task=execution.portfolio.getTask(input.taskId),workflow=(task.inputs as any).pilotWorkflow;
  requireThat(task.ventureId===businessId&&(task.inputs as any)?.pilotRelease==='032','DEVELOPMENT_TASK_SCOPE');const artifact=execution.artifact(businessId,task.id);requireThat(artifact,'DEVELOPMENT_OBSERVED_ARTIFACT_REQUIRED');
  const correction=knowledge.corrections(businessId).findLast(c=>c.taskId===task.id||c.artifactHash===artifact.hash);
  requireThat(correction,'DEVELOPMENT_RECORDED_CORRECTION_REQUIRED');
  requireThat(typeof input.assisted==='boolean'&&Array.isArray(input.alternatives)&&input.alternatives.length>=2,'DEVELOPMENT_PROVENANCE_AND_ALTERNATIVES_REQUIRED');
  requireThat(input.material?.rights==='reusable','DEVELOPMENT_REUSE_RIGHTS_REQUIRED');const source=knowledge.selectedSources(businessId).find(s=>s.id===input.sourceId);requireThat(source&&source.text.includes(input.quote)&&input.quote.trim().length>0,'DEVELOPMENT_EXACT_SOURCE_REQUIRED');
  const node={family:workflow,sourceIds:execution.evidence.forTask(task).map(s=>JSON.parse(s.interpretation??'{}').originalSourceId).filter((id:any)=>typeof id==='string'),reasonForWorker:'Preserve the existing strong task baseline while examining a recorded correction.',competencies:task.requiredCompetencies};
  requireThat(node.sourceIds.includes(source.id),'DEVELOPMENT_SOURCE_NOT_IN_OBSERVED_TASK');const assignment=this.outcomes.assignment(businessId,node),id='development-preparation-'+hash({businessId,input,correctionId:correction.id}).slice(0,24),prior=store.get('pilot-development-preparation',id);if(prior)return prior;
  const observed=this.development.observe(businessId,assignment.jobId,{id:id+'-observation',kind:'owner_correction',sourceId:source.id,quote:input.quote,summary:correction.instruction,consequence:input.consequence,assisted:input.assisted});
  const material=this.development.intake(businessId,{id:id+'-material',kind:'existing_document',title:input.material.title,content:input.material.content,contentHash:hash(input.material.content),provenance:input.material.provenance,rights:'reusable'});
  const evidenceIds=node.sourceIds,job=task.objective;
  const cases:PracticeCase[]=[
   {id:id+'-practice',partition:'practice',prompt:'Development practice: '+job+'\nInspect the correction and propose how to satisfy it: '+correction.instruction,evidenceIds,regression:false},
   {id:id+'-review',partition:'evaluation',prompt:'Exploratory draft case: '+job+'\nReview a prospective deliverable for unsupported claims, missing decision evidence and usable next action. Explain limitations.',evidenceIds,regression:false},
   {id:id+'-regression',partition:'evaluation',prompt:'Exploratory regression case: '+job+'\nDetermine whether an adequate unchanged deliverable could be retained. Preserve uncertainties and existing authority; do not force a change to justify the candidate.',evidenceIds,regression:true}
  ];
  const proposed=this.development.propose(businessId,assignment.jobId,{observationId:observed.id,diagnosis:{cause:input.cause,rationale:input.rationale,alternativeExplanations:input.alternatives},materialIds:[material.id],candidateMechanism:input.procedureAddition,cases,diagnosisProvenance:'owner_or_assisted'});
  const value={id,businessId,taskId:task.id,artifactHash:artifact.hash,correctionId:correction.id,jobId:assignment.jobId,candidateId:proposed.candidate.id,assisted:input.assisted,provenance:'owner/development-assisted hypothesis tied to an actual correction; not measured worker weakness',casesStatus:'Draft exploratory prompts share the development source corpus. They require review and distinct protected material before confirmatory evaluation.',decision:'retain_baseline_pending_evidence',nextAction:knowledge.company(businessId).mode==='fixture'?'Exercise the labeled fixture comparison mechanics.':'Review these candidate/case drafts, then approve an exact comparison only if it can change worker selection.',createdAt:new Date().toISOString()};
  return store.transaction(()=>store.put('pilot-development-preparation',id,value,null));
 }
 async fixture(businessId:string,candidateId:string){
  const {store,knowledge}=this.outcomes;requireThat(knowledge.company(businessId).mode==='fixture','DEVELOPMENT_FIXTURE_ONLY');const preparation=store.db.prepare("SELECT body FROM entities WHERE kind='pilot-development-preparation'").all().map(r=>JSON.parse(String(r.body))).find(p=>p.businessId===businessId&&p.candidateId===candidateId);requireThat(preparation,'DEVELOPMENT_PREPARATION_REQUIRED');
  const worker=this.development.development.getDefinition(businessId,preparation.jobId),cases=store.get('worker-development-cases',candidateId).items.filter((c:PracticeCase)=>c.partition==='evaluation');
  const comparison=await this.development.evaluate(candidateId,{mode:'offline_fixture',modelPort:{kind:'fixture',run(request){const result=mockResult({kind:'fixture-observation',statement:'This is a deterministic fixture response exercising preserved request and evaluation mechanics, not the execution of this procedure.',job:worker.outputContract.description,sourceEvidenceReceived:Boolean((request.context as any).evidence?.length||(request.context as any).materials?.length)});return {...result,route:{...result.route,model:worker.model.route}};}},resources:{maxCostMinor:0,maxCalls:cases.length*2,maxAttempts:1,maxHumanMinutes:0},custody:{claimedProtected:false,custody:'not_claimed',manifestHash:null,custodianId:null}});
  if(comparison.status==='graded')return comparison;
  // No semantic verdict is fabricated. These explicit negative fixture grades
  // prove conservative retention when accepted-job evidence is absent.
  return this.development.grade(comparison.id,cases.map((c:PracticeCase)=>({caseId:c.id,baselineAccepted:false,candidateAccepted:false,criticalCommercialOmission:false,baselineCorrectionSeconds:null,candidateCorrectionSeconds:null,assessor:'deterministic mechanics fixture; no semantic assessment',independent:false,opaqueGradeHash:hash({comparison:comparison.id,caseId:c.id,rule:'No accepted work has been measured; neither arm is scored as accepted.'})})));
 }
}
