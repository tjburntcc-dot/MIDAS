import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorker,workerSchema } from '../src/portfolio/worker.ts';
import { validatePlan } from '../src/portfolio/planning.ts';
const args={path:null,content:null,expectedHash:null,query:null,url:null};
test('worker schema and semantics reject hidden/unused authority and unsupported tools',()=>{
 for(const action of ['complete','blocked'])validateWorker({action,reason:'Current observation',toolCall:null});
 validateWorker({action:'tool',reason:'Read source',toolCall:{name:'workspace.read',arguments:{...args,path:'app.html'}}});
 assert.throws(()=>validateWorker({action:'complete',reason:'Done',toolCall:{name:'check.run',arguments:args}}));
 assert.throws(()=>validateWorker({action:'tool',reason:'Changed',toolCall:{name:'workspace.replace',arguments:{...args,path:'app.html',content:'x',expectedHash:'stale'}}}));
 assert.throws(()=>validateWorker({action:'tool',reason:'Unsafe',toolCall:{name:'shell',arguments:args}}));
 assert.throws(()=>validateWorker({action:'tool',reason:'Changed',toolCall:{name:'check.run',arguments:{...args,content:'change acceptance'}}}));
 assert.equal(workerSchema.additionalProperties,false);
});
test('executive claims and dependencies must be supported by visible scoped evidence',()=>{
 const p={summary:'Reject unsupported commitment',claims:[{kind:'hypothesis',text:'Needs investigation',sourceId:null,quote:null}],contradictions:[],unknowns:['Buyer demand'],alternatives:[],priority:50,rationale:'Cheap investigation can change the decision without invented economics.',cancelTaskIds:[],tasks:[{id:'check',title:'Read facts',objective:'Observe evidence',lane:'research',capability:'research.investigate',dependsOn:[],acceptance:['Preserved source with rights'],requiredCompetencies:[],allowedTools:['research.fetch'],priority:50}]};
 validatePlan(p,[],['research.fetch'],['research.investigate'],[]);
 assert.throws(()=>validatePlan({...p,claims:[{kind:'source_assertion',text:'Purchased',sourceId:null,quote:null}]},[],['research.fetch'],['research.investigate'],[]));
 assert.throws(()=>validatePlan({...p,tasks:[{...p.tasks[0],dependsOn:['later']}]},[],['research.fetch'],['research.investigate'],[]));
 assert.throws(()=>validatePlan({...p,tasks:[{...p.tasks[0],allowedTools:['send.email']}]},[],['research.fetch'],['research.investigate'],[]));
});
