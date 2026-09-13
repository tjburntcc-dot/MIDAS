/** Explicit offline integration. No credentials or network transport; all decisions
 * and software source are test fixtures, never live competence observations. */
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {inspectFinalizationParent} from '../src/portfolio/continuation.ts';
import {importAcceptedInvestigation,addFinalizationTasks} from './prepare-portfolio-finalization.mjs';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';
import {serviceBriefFiles} from '../src/portfolio/products.ts';
import {mockResult} from '../src/portfolio/worker.ts';
import {buildResponsesBody} from '../src/model-port.ts';
import {portfolioRoute,taskDefinitionHash} from '../src/portfolio/live.ts';
import {canonical,hash,rawHash} from '../src/contracts.ts';
const root=resolve(process.argv[2]),reject=process.argv.includes('--reject'),parentRoot=resolve('../foundry-worktree-031-handoff-r1/var/portfolio-031-continuation-r1');
assert(!existsSync(root),'Use a fresh explicitly labelled offline demo directory.');mkdirSync(root,{recursive:true});
const parent=inspectFinalizationParent(parentRoot,readFileSync(join(parentRoot,'auth/portfolio-owner.pub'),'utf8'));
copyFileSync(join(parentRoot,'../portfolio-031-continuation-r1-stop-backup/portfolio.sqlite'),join(root,'portfolio.sqlite'));
const store=new StateStore(join(root,'portfolio.sqlite')),portfolio=new Portfolio(store),evidence=new EvidenceLibrary(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope});
const action=(name,args={})=>mockResult({action:'tool',reason:'Explicit offline integration fixture.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const decision=choice=>({summary:'Scripted offline '+choice+'; not a live business judgment.',claims:[],contradictions:[],unknowns:['Demand, independent quality review and human effort remain unmeasured.'],alternatives:[{name:'quote-to-job',caseFor:'Exercise the implemented engineering path.',caseAgainst:'No demonstrated switching benefit.',evidenceIds:[],decision:choice}],priority:31,rationale:'Explicit mock validates that the actual decision controls execution.',cancelTaskIds:[],tasks:[]});
function operating(report,artifactHash){return {version:'operating-deliverable-v1',reviewedProduct:{artifactHash},recommendation:{decision:'revise',rationale:'Offline example only; actual user observation is still needed.'},trySteps:[{action:'Open the exact local reviewed product and save a two-line example quote.',expected:'Reopen the same record with identical work and totals.'}],advantage:{statement:'A small local work ledger is a hypothesis, not demonstrated switching value.',substitutes:['Spreadsheet and calendar','Existing field-service software']},contraryEvidence:['Existing alternatives already provide quote-to-job workflows.'],unresolvedAssumptions:['No willingness to pay or founder acquisition cost measured.'],demo:{summary:'Synthetic example, not customer activity.',steps:['Save a quote','Reopen and edit it','Convert to job and export']},nextObservation:{route:'Owner-arranged consenting observation; no outreach sent.',record:'Current workflow, missing fields, errors and actual correction effort.',decisionRule:'Retain only if the observation identifies consequential value beyond substitutes.'},interviewQuestions:['Show the last quote you turned into a job. Where was information re-entered?'],acquisitionDraft:{status:'unsent',subject:'A question about your quote-to-job workflow',body:'Would you be willing to show how a recent quote became scheduled work? This is research, not a sales claim.'},economics:Object.fromEntries(['acquisition','delivery','correction','founderEffort'].map(k=>[k,{status:'unknown',detail:'Not measured; record actual effort before qualification.'}])),nextTasks:[{id:'observe',title:'Record a consenting operator walkthrough',dependsOn:[],acceptance:['One source-linked observation preserves contrary evidence and workload.']}],evidence:{findingIds:[report.observations[0].id],sourceIds:[report.observations[0].sourceId],verification:'review_required'}};}

try{
 const artifact=importAcceptedInvestigation(portfolio,tools,parent),mapping=addFinalizationTasks(portfolio,parent,artifact);
 for(const {id} of mapping){const t=portfolio.getTask(id);store.transaction(()=>store.put('portfolio-task',id,{...t,inputs:{...t.inputs,requiresGrant:false,offlineDemonstration:'Explicit fixture clone; source author is development assistant, not paid runtime.'}},t._version));}
 const allowances=mapping.map(m=>({id:m.id,workCalls:m.workCalls,definitionHash:taskDefinitionHash(portfolio.getTask(m.id))})),counts={},requests=[];
 const engine=new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:allowances}),model:{kind:'offline_mock',async run(call){
  const t=portfolio.snapshot().tasks.find(t=>t.lease),c=call.request.context,n=counts[t.id]=(counts[t.id]??0)+1;
  const body=canonical(buildResponsesBody(portfolioRoute('offline-finalization-r2','proj_offline'),call.request,call.schema));requests.push({taskId:t.id,n,bodyHash:rawHash(body),bytes:Buffer.byteLength(body),remaining:c.remaining});writeFileSync(join(root,'request-'+requests.length+'.json'),body);
  assert.equal(c.remaining.modelCalls,allowances.find(a=>a.id===t.id).workCalls-n+1);
  if(t.id.includes('/decide-')){const input=c.dependencies.find(d=>d.id==='explicit-preserved-input').artifacts[0];assert.equal(hash(input.report),hash(JSON.parse(parent.brief)));assert.equal(input.historicalProvenance.payloadHash,parent.workspace.published.payloadHash);return mockResult(decision(reject?'reject':'prototype'));}
  if(t.id.includes('/adapt-')){assert(c.dependencies[0].artifacts[0].report.operating);return mockResult(decision('retain'));}
  const w=tools.load('quote-desk',t.id);assert.equal(c.workspace.currentSource[0].content,w.files[0].content);
  if(t.capability==='quality.review'){const upstream=c.dependencies[0].artifacts[0].software;assert(upstream.manifestHash&&upstream.payloadHash);assert.equal(w.files[0].content,quoteProductV2Example()[0].content);if(n===1)return action('check.run');}
  else if(n===1){if(w.kind==='software'){assert(w.files[0].content.includes('Product implementation pending'));return action('workspace.replace',{path:'app.html',content:quoteProductV2Example()[0].content,expectedHash:w.manifest.files[0].sha256});}
   const report=JSON.parse(serviceBriefFiles(w.inputs)[0].content);assert(c.dependencies[0].artifacts[0].software.files[0].content===quoteProductV2Example()[0].content);report.operating=operating(report,w.inputs.reviewedArtifactHash);return action('workspace.replace',{path:'brief.json',content:JSON.stringify(report),expectedHash:w.manifest.files[0].sha256});
  }else if(w.kind==='software'&&n===2)return action('check.run');
  return mockResult({action:'complete',reason:'Offline fixture submission after actual current local observations; no model or human competence claim.',toolCall:null});
 }}});
 for(const {id} of mapping){const t=portfolio.getTask(id);if(t.status==='cancelled'){assert(reject);continue;}await engine.runTask(id);const finished=portfolio.getTask(id);assert.equal(finished.status,'completed',id+' '+finished.reason+' '+JSON.stringify(engine.rows('portfolio-context-diagnostic')));}
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),reject?1:9);
 assert.equal(portfolio.getTask(parent.taskId).status,'blocked');assert.equal(tools.load('quote-desk',parent.taskId).files[0].content,parent.brief);
 if(!reject){const review=portfolio.getTask('quote-desk/review-product-v4-r2'),operatingTask=portfolio.getTask('quote-desk/operate-v4-r2');assert.equal(review.result.artifacts[0].version,2);assert.equal(operatingTask.inputArtifacts[0].sha256,review.outputArtifacts[0].sha256);for(const id of ['build','review-product','operate']){const taskId='quote-desk/'+id+'-v4-r2';writeFileSync(join(root,id+'-delivery.json'),tools.download('quote-desk',taskId).content);}}
 const result={provenance:'Offline fixture decisions/source with actual local tools and browser; no new live competence result.',parentTaskUnchanged:true,acceptedBriefHash:rawHash(parent.brief),acceptedBriefBytes:Buffer.byteLength(parent.brief),providerRequests:0,credentialAccess:false,reject,counts,requests,statuses:mapping.map(m=>({id:m.id,status:portfolio.getTask(m.id).status})),finalizations:engine.rows('portfolio-finalization'),humanReview:'not measured'};
 writeFileSync(join(root,'offline-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,reject,counts,statuses:result.statuses,providerRequests:0},null,2));
}finally{store.close();}
