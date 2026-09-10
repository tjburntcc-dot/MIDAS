import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepare,readJSON,writeJSON,approve} from '../../src/experiment/config.ts';
import {prepareSmoke} from '../../tools/prepare-smoke.mjs';
import {runDevelopment,openExperiment} from '../../src/experiment/workflow.ts';
import {offlineOutput} from '../../src/experiment/task.ts';
import {hash,rawHash} from '../../src/contracts.ts';
function setup(){const dir=mkdtempSync(join(tmpdir(),'midas028-smoke-')),main=join(dir,'main'),root=join(dir,'smoke');prepare(main);return {root,main,proof:prepareSmoke(root,main)};}
test('smoke setup preserves later-stage files and narrows the new grant without approval',()=>{
 const {root,main,proof}=setup();assert.equal(proof.preservedRootUnchanged,true);assert.equal(proof.authorizationExists,false);
 const a=readJSON(join(root,'authorization.request.json'));assert.equal(a.approved,false);assert.equal(a.projectId,null);assert.equal(a.allowProtected,false);assert.equal(a.limits.totalMinor,100);
 assert.equal(readJSON(join(main,'spec.json')).limits.totalMinor,4100);assert.equal(readJSON(join(root,'cases.json')).length,2);
 assert.throws(()=>prepareSmoke(main,main),/SMOKE_ROOT_MUST_NOT_REPLACE/);
});
test('unapproved smoke refuses before credential or HTTP access',async()=>{
 const {root}=setup();let calls=0;await assert.rejects(runDevelopment(root,'smoke','baseline',async()=>{calls++;throw Error('mock forbidden');}));assert.equal(calls,0);
});
test('mock-approved smoke needs no reviewer/custodian, admits only two attempts and denies other stages',async()=>{
 const {root}=setup(),a=readJSON(join(root,'authorization.request.json'));
 Object.assign(a,{approved:true,approvedBy:'OFFLINE TEST',approvalReference:'mock-only',projectId:'proj_mock',credentialFile:join(root,'mock.key'),expiresAt:'2099-01-01T00:00:00Z'});
 writeFileSync(a.credentialFile,'OFFLINE_MOCK_ONLY');writeJSON(join(root,'mock-approval.json'),a);approve(root,join(root,'mock-approval.json'),join(root,'auth','owner.key'));
 const cases=readJSON(join(root,'cases.json'));let calls=0;
 const transport:any=async(url:any,init:any)=>{calls++;if(String(url).endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:400}));
  const body=JSON.parse(init.body),input=JSON.parse(body.input).context.case,c=cases.find((c:any)=>hash(c.input)===hash(input));
  return new Response(JSON.stringify({id:'MOCK-'+calls,model:a.route.model,status:'completed',usage:{input_tokens:400,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(offlineOutput(c))}]}]}));};
 await runDevelopment(root,'smoke','baseline',transport);assert.equal(calls,4);
 await runDevelopment(root,'smoke','baseline',transport);assert.equal(calls,4);
 const x=openExperiment(root);try{assert.equal(x.spec.reviewer,null);assert.equal(x.spec.custodian,null);assert.equal(x.ledger.totals().reserved,26);
  for(const stage of ['development','validation','evaluation'] as const){const p=x.ledger.port(stage,{source:'offline-test'}),r:any={scope:x.spec.scope,requestId:'denied-'+stage};await assert.rejects(p.prepare!(r,{minorUnits:13,currency:'USD'},rawHash('{}'),'{}'),/ATTEMPT_CAP/);}
 }finally{x.store.close();}
 const baseline=readJSON(join(root,'baseline.json'));baseline.version='would-be-third-attempt';writeJSON(join(root,'baseline.json'),baseline);
 await assert.rejects(runDevelopment(root,'smoke','baseline',transport),/ATTEMPT_CAP/);assert.equal(calls,4);
});
