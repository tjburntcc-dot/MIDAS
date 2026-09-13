import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {portfolioView} from '../src/portfolio/server.ts';

function fixture(terminal:any){
 const root=mkdtempSync(join(tmpdir(),'midas-r4-completion-')),store=new StateStore(join(root,'portfolio.sqlite'));
 const task={id:'v/research',ventureId:'v',title:'Research',status:'blocked',inputs:{requiresGrant:true},updatedAt:'2026-09-13T00:00:00Z'};
 store.transaction(()=>{
  store.put('portfolio-execution',task.id,{index:0},null);
  store.put('portfolio-model-request',task.id+'/model-0',{call:{attemptId:'attempt-r4'}},null);
 });
 const engine:any={
  portfolio:{store,snapshot:()=>({portfolio:{name:'Fixture',maxConcurrency:1},ventures:[{id:'v',name:'Venture'}],tasks:[task],artifacts:[],workers:[],decisions:[],resources:{}})},
  store,evidence:{list:()=>[]},accounting:()=>undefined,model:{kind:'actual_model'},
  rows:(kind:string)=>kind==='portfolio-work-binding'?[{attemptId:'attempt-r4',taskId:task.id,bodyHash:'request-r4'}]:kind==='response-job'?[{requestHash:'request-r4',grantHash:'grant-r4',responseId:terminal===undefined?null:'resp_r4',status:terminal?.status??'in_progress',retrievals:2,terminal}]:[]
 };
 const tools:any={root,load:()=>{throw Error('No workspace fixture');},download:()=>{throw Error('No delivery fixture');}};
 return {root,store,view:()=>portfolioView(engine,tools),close(){store.close();rmSync(root,{recursive:true,force:true});}};
}

test('owner payload distinguishes durable terminal incompleteness from genuinely unknown provider completion',()=>{
 const incomplete=fixture({status:'incomplete'});try{
  const execution=(incomplete.view() as any).tasks[0].providerExecution;
  assert.equal(execution.completionState,'terminal_incomplete');
  assert.equal(execution.terminalPersisted,true);
  assert.equal(execution.status,'incomplete');
  assert.equal(execution.terminalIncompleteAttempts,1);
 }finally{incomplete.close();}
 const unknown=fixture(undefined);try{
  const execution=(unknown.view() as any).tasks[0].providerExecution;
  assert.equal(execution.completionState,'completion_unknown');
  assert.equal(execution.terminalPersisted,false);
  assert.equal(execution.responseId,null);
 }finally{unknown.close();}
});

test('owner payload calls only terminal completed responses completed',()=>{
 const complete=fixture({status:'completed'});try{
  const execution=(complete.view() as any).tasks[0].providerExecution;
  assert.equal(execution.completionState,'terminal_completed');
 }finally{complete.close();}
});

test('owner payload keeps terminal failed and cancelled distinct from incomplete and unknown',()=>{
 for(const status of ['failed','cancelled']){const f=fixture({status});try{assert.equal((f.view() as any).tasks[0].providerExecution.completionState,'terminal_'+status);}finally{f.close();}}
});
