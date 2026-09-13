import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {preparePortfolio} from '../src/portfolio/prepare.ts';
import {createTaskPreparer} from '../src/portfolio/task-preparation.ts';
import {prepareValueReleaseV4,valueReleaseV4TaskAllowances} from '../src/portfolio/value-release-v4.ts';
import {quoteProductV2} from '../src/portfolio/product-profiles.ts';
import {taskDefinitionHash} from '../src/portfolio/live.ts';
import {hash} from '../src/contracts.ts';

function setup(){
 const root=mkdtempSync(join(tmpdir(),'midas-prospective-profile-')),store=new StateStore(join(root,'state.sqlite'));
 const portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store);
 preparePortfolio(portfolio,tools,evidence);prepareValueReleaseV4(portfolio,evidence);
 const frozen=valueReleaseV4TaskAllowances(portfolio);
 const engine=new PortfolioEngine({portfolio,tools,evidence,accounting:()=>({taskAllocations:frozen}),prepareTask:createTaskPreparer(portfolio,tools,evidence)});
 return {root,store,portfolio,tools,evidence,engine,frozen,close(){store.close();const path=realpathSync(root),rel=relative(realpathSync(tmpdir()),path);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));rmSync(path,{recursive:true,force:true});}};
}

test('research and decision receive the same existing downstream product contract, never a seeded solution',async()=>{
 const f=setup();try{
  const build=f.portfolio.getTask('quote-desk/build-v4');
  assert.throws(()=>f.tools.load('quote-desk',build.id),/WORKSPACE_NOT_FOUND/);
  for(const id of ['quote-desk/investigate-v4','quote-desk/decide-v4']){
   const request=await f.engine.previewRequest(id),context=request.request.context as any;
   assert.deepEqual(context.prospectiveExecutionProfiles,[{tasks:[{taskId:build.id,taskDefinitionHash:taskDefinitionHash(build)}],profileId:'quote-to-job-v2',available:true,contractHash:hash(quoteProductV2),contract:quoteProductV2,authority:'Existing declared execution boundary only. This adds no capability, authority, commercial evidence or build requirement.'}]);
   assert.deepEqual(context.prospectiveExecutionProfiles[0].contract.state.quote.keys,['id','customer','lines','status']);
   assert(!JSON.stringify(context.prospectiveExecutionProfiles).includes('acceptedVersion'));
   assert(!JSON.stringify(context.prospectiveExecutionProfiles).includes('<!doctype'));
  }
  assert.throws(()=>f.tools.load('quote-desk',build.id),/WORKSPACE_NOT_FOUND/);
  assert.equal(f.engine.rows('model-attempt').length,0);
 }finally{f.close();}
});

test('ungranted or changed descendants cannot silently alter a frozen decision context',async()=>{
 const f=setup();try{
  f.portfolio.addPlan('quote-desk',{id:'other-plan',rationale:'Unrelated future assignment.',tasks:[{id:'ungranted-app',title:'Private future implementation',lane:'build',capability:'software.build',dependsOn:['investigate-v4'],acceptance:['Unrelated'],requiredCompetencies:[],allowedTools:[],resource:{modelCalls:1,localToolRuns:0},inputs:{executionProfile:'unrelated-secret-profile'}}]});
  const first=await f.engine.previewRequest('quote-desk/investigate-v4');assert.equal((first.request.context as any).prospectiveExecutionProfiles.length,1);
  assert(!JSON.stringify((first.request.context as any).prospectiveExecutionProfiles).includes('unrelated-secret-profile'));
  const build=f.portfolio.getTask('quote-desk/build-v4');f.store.transaction(()=>f.store.put('portfolio-task',build.id,{...build,inputs:{...build.inputs as any,executionProfile:'quote-to-job-v1'}},build._version));
  await assert.rejects(()=>f.engine.previewRequest('quote-desk/investigate-v4'),/PROSPECTIVE_TASK_SCOPE_CHANGED/);
  assert.equal(f.engine.rows('model-attempt').length,0);
 }finally{f.close();}
});

test('one shared profile carries all descendant bindings without duplicating the full contract',()=>{
 const f=setup();try{
  const task=f.portfolio.getTask('quote-desk/investigate-v4'),build=f.portfolio.getTask('quote-desk/build-v4');
  const descendants=Array.from({length:12},(_,i)=>({...build,id:'quote-desk/bounded-'+i,dependsOn:[task.id]}));
  const profiles=(f.engine as any).prospectiveExecutionProfiles.call({accounting:()=>({taskAllocations:descendants.map(t=>({id:t.id,definitionHash:taskDefinitionHash(t)}))}),rows:()=>descendants},task);
  assert.equal(profiles.length,1);assert.equal(profiles[0].tasks.length,12);assert.deepEqual(profiles[0].contract,quoteProductV2);
  assert.deepEqual(new Set(profiles[0].tasks.map((t:any)=>t.taskId)),new Set(descendants.map(t=>t.id)));
  assert(Buffer.byteLength(JSON.stringify(profiles))<9000,'Shared contracts must not consume 67 KB of repeated context');
 }finally{f.close();}
});
