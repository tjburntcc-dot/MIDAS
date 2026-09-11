import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Workbench} from '../src/workbench/service.ts';
import {runInvoice,approveInvoice,invoiceLocation} from '../src/workbench/invoice-runtime.ts';
import {invoiceMockOutput} from '../src/workbench/invoice-fixtures.ts';

test('negative inspection cannot become completed even when independent arithmetic passes', async()=>{
 const app=new Workbench(mkdtempSync(join(tmpdir(),'midas-inspect-')));
 try {const {id}=app.create('invoice-1');const p=await app.act(id,'analyze');await app.act(id,'accept',{proposalHash:p.proposalHash});const v=await app.act(id,'plan');const root=invoiceLocation(app.root,v.plan);
 const port:any={kind:'fixture',run(r:any){const stage=({investigate:'investigate',decide:'draft',operate:'review',verify:'inspect'} as any)[r.task];return {output:stage==='inspect'?{status:'fail',findings:['Explicit fixture negative inspection'],evidenceRefs:[r.context.receipt.externalReceiptId]}:invoiceMockOutput(stage,r.context.bundle,r.context),route:{kind:'fixture',provider:'mock',model:'offline-invoice-fixture'},usage:{inputTokens:null,outputTokens:null,cost:{status:'unknown',money:null,basis:'fixture'}}};}};
 const waiting=await runInvoice(root,v.plan,'AP-001',{port});approveInvoice(root,waiting.approval!.proposalHash);const result=await runInvoice(root,v.plan,'AP-001',{port});assert.equal(result.outcome.operationalResult,'fail');assert.notEqual(result.phase,'completed');assert.equal(result.observation.effectCount,1);assert.equal(result.callsUsed,4);
 } finally {app.close();}
});

test('comparison invokes two persisted fixture attempts and repeat does not fabricate new observations',async()=>{
 const app=new Workbench(mkdtempSync(join(tmpdir(),'midas-compare-')));
 try {const {id}=app.create('support');const proposal=await app.act(id,'analyze');await app.act(id,'accept',{proposalHash:proposal.proposalHash});const a=await app.act(id,'improvement');const b=await app.act(id,'improvement');assert.deepEqual(a.improvement,b.improvement);assert.equal(a.improvement.comparison.providerRequests,0);assert.equal(a.improvement.comparison.observations.length,2);assert.equal(a.improvement.promotion,false);}finally{app.close();}
});
