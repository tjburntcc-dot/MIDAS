import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { portfolioScope } from '../src/portfolio/contracts.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { LocalWorkTools } from '../src/portfolio/tools.ts';
import { PortfolioEngine } from '../src/portfolio/engine.ts';
import { preparePortfolio } from '../src/portfolio/prepare.ts';
import { createTaskPreparer } from '../src/portfolio/task-preparation.ts';
import { prepareIntegratedRelease,integratedAllocation,integratedTaskAllowances } from '../src/portfolio/integrated-release.ts';
import { quoteTrackerFiles,serviceBriefFiles } from '../src/portfolio/products.ts';
import { mockResult } from '../src/portfolio/worker.ts';

function setup(){const root=mkdtempSync(join(tmpdir(),'portfolio-integrated-build-')),store=new StateStore(join(root,'portfolio.sqlite')),portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);preparePortfolio(portfolio,tools,evidence);prepareIntegratedRelease(portfolio,evidence);return {root,store,portfolio,tools,evidence,close(){store.close();rmSync(root,{recursive:true,force:true});}};}
const action=(name:string,args:any={})=>mockResult({action:'tool',reason:'Explicit fixture action exercising the actual tool boundary; not model reasoning.',toolCall:{name,arguments:{path:null,content:null,expectedHash:null,query:null,url:null,...args}}});
const complete=()=>mockResult({action:'complete',reason:'The current local artifact was actually checked and delivered; no customer acceptance.',toolCall:null});
function decision(kind:string){return {summary:'Fixture decision based on supplied results; not a market finding.',claims:[],contradictions:[],unknowns:['Demand and founder labor unmeasured'],alternatives:[{name:'quote-to-job',caseFor:'A local prototype can expose execution gaps.',caseAgainst:'No confirmed buyer or distribution advantage.',evidenceIds:[],decision:kind}],priority:31,rationale:'Record what this bounded execution can establish and preserve commercial uncertainty.',cancelTaskIds:[],tasks:[]};}
function enableOffline(f:ReturnType<typeof setup>){for(const [id] of integratedAllocation){const t=f.portfolio.getTask('quote-desk/'+id);f.store.transaction(()=>f.store.put('portfolio-task',t.id,{...t,inputs:{...t.inputs as any,requiresGrant:false}},t._version));}}

test('blank source → real failing browser check → mock-authored repair → product review → operating handoff → decision',{timeout:60000},async()=>{
 const f=setup();try{enableOffline(f);let sawFailure=false,sawReview=false,sawDelivery=false,sawDecision=false;const counts:Record<string,number>={};
 const engine=new PortfolioEngine({...f,accounting:()=>({taskAllocations:integratedTaskAllowances(f.portfolio)}),prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(call){
  const c=call.request.context as any,id=call.attemptId,task=f.portfolio.snapshot().tasks.find(t=>t.lease)?.id!;counts[task]=(counts[task]??0)+1;const n=counts[task];
  assert(c.task.inputs.release==='integrated-build-v3');assert.equal(c.remaining.modelCalls,integratedAllocation.find(a=>task.endsWith('/'+a[0]))![1]-n+1);
  if(task.endsWith('/decide-v3')){assert(c.dependencies[0].artifacts[0].report);return mockResult(decision('prototype'));}
  if(task.endsWith('/adapt-v3')){assert(c.dependencies[0].artifacts[0].report.recommendation.basis.includes('actual product'));sawDecision=true;return mockResult(decision('retain'));}
  const w=f.tools.load('quote-desk',task),file=w.files[0];
  if(task.endsWith('/build-v3')){
   assert(c.dependencies[0].artifacts[0].proposal.alternatives[0].decision==='prototype');
   if(n===1){assert(file.content.includes('Product implementation pending'));return action('workspace.replace',{path:'app.html',expectedHash:file? w.manifest.files[0].sha256:null,content:quoteTrackerFiles({defect:true})[0].content});}
   if(n===2||n===4)return action('check.run');
   if(n===3){assert.equal(c.observations.at(-1).result.ok,false);assert(c.observations.at(-1).result.checks.some((r:any)=>!r.passed));sawFailure=true;return action('workspace.replace',{path:'app.html',expectedHash:w.manifest.files[0].sha256,content:quoteTrackerFiles()[0].content});}
   if(n===5)return action('artifact.publish_local');return complete();
  }
  if(task.endsWith('/review-product-v3')){
   const d=c.dependencies[0].artifacts[0].software;assert(d.files[0].content===quoteTrackerFiles()[0].content);assert(d.checks.every((r:any)=>r.passed));sawReview=true;
   if(n===1)return action('workspace.read',{path:'app.html'});
   if(n===2)return action('workspace.replace',{path:'app.html',expectedHash:w.manifest.files[0].sha256,content:file.content.replace('<body>','<body><p>Local-only prototype; no messages or payments are sent.</p>')});
   if(n===3)return action('check.run');if(n===4)return action('artifact.publish_local');return complete();
  }
  if(task.endsWith('/operate-v3')){const d=c.dependencies[0].artifacts[0].software;assert(d.files[0].content.includes('no messages or payments'));assert(d.payloadHash);assert(d.customerAcknowledged===false);sawDelivery=true;}
  if(n===1){const report=JSON.parse(serviceBriefFiles(w.inputs)[0].content);report.recommendation.basis=task.endsWith('/operate-v3')?'Use the actual product and checked delivery; no customer use observed.':'Investigate the bounded problem and substitutes.';return action('workspace.replace',{path:'brief.json',expectedHash:w.manifest.files[0].sha256,content:JSON.stringify(report)});}
  if(n===2)return action('check.run');if(n===3)return action('artifact.publish_local');return complete();
 }}});
 for(const [id]of integratedAllocation){await engine.runTask('quote-desk/'+id);assert.equal(f.portfolio.getTask('quote-desk/'+id).status,'completed',f.portfolio.getTask('quote-desk/'+id).reason);}
 assert(sawFailure&&sawReview&&sawDelivery&&sawDecision);assert.equal(f.portfolio.getVenture('quote-desk').priority,31);assert(f.tools.load('quote-desk','quote-desk/build-v3').manifest.revision>=3);assert.equal(f.tools.load('quote-desk','quote-desk/review-product-v3').published.customerAcknowledged,false);
 const calls=Object.values(counts).reduce((a,b)=>a+b,0);assert.equal(calls,21);await engine.recover();assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),calls);
 }finally{f.close();}
});

test('a model rejection cancels all downstream product spending while retaining the original response',async()=>{
 const f=setup();try{enableOffline(f);let output:any;const engine=new PortfolioEngine({...f,prepareTask:createTaskPreparer(f.portfolio,f.tools,f.evidence),model:{kind:'offline_mock',async run(call){const c=call.request.context as any;if(c.task.inputs.prototypeGate){output=decision('reject');return mockResult(output);}const w=f.tools.load('quote-desk','quote-desk/investigate-v3'),obs=c.observations;if(!obs.length)return action('workspace.replace',{path:'brief.json',expectedHash:w.manifest.files[0].sha256,content:serviceBriefFiles(w.inputs)[0].content});if(obs.at(-1).tool==='workspace.replace')return action('check.run');if(obs.at(-1).tool==='check.run')return action('artifact.publish_local');return complete();}}});
 await engine.runTask('quote-desk/investigate-v3');await engine.runTask('quote-desk/decide-v3');assert.deepEqual(output.cancelTaskIds,[],'controller gate must not relabel provider output');for(const [id]of integratedAllocation.slice(2)){const t=f.portfolio.getTask('quote-desk/'+id);assert.equal(t.status,'cancelled');assert.equal(t.attempts,0);}assert.equal(f.portfolio.getTask('quote-desk/decide-v3').status,'completed');
 }finally{f.close();}
});

test('integrated scope totals 32 ordinary work calls and preserves prior unstarted release records',()=>{const f=setup();try{const old=f.portfolio.getTask('quote-desk/investigate-v2');assert.equal(old.status,'cancelled');assert.equal(old.attempts,0);const scopes=integratedTaskAllowances(f.portfolio);assert.equal(scopes.reduce((n,t)=>n+t.workCalls,0),32);assert.equal(scopes.length,6);assert.equal(prepareIntegratedRelease(f.portfolio,f.evidence).prepared,false);}finally{f.close();}});
