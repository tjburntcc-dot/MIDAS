import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';
import {parseCSV} from '../src/portfolio/product-check-v2.ts';
import {quoteProductV2,quoteV2Checks} from '../src/portfolio/product-profiles.ts';
import {checkServiceBrief,defaultServiceInputs,serviceBriefFiles} from '../src/portfolio/products.ts';
function fixture(){const root=mkdtempSync(join(tmpdir(),'midas-product-v2-')),store=new StateStore(join(root,'state.sqlite'));const scopeFor=(businessId:string)=>({tenantId:'test',businessId,runId:'v2-test',dataPolicyVersion:'v1',mode:'fixture'} as const);const tools=new LocalWorkTools({root,store,scopeFor});return {root,store,scopeFor,tools,close:()=>{store.close();const cleanupPath=realpathSync(root),cleanupRelative=relative(realpathSync(tmpdir()),cleanupPath);assert(cleanupRelative&&!cleanupRelative.startsWith('..')&&!isAbsolute(cleanupRelative));rmSync(cleanupPath,{recursive:true,force:true});}};}
const call=(f:any,tool:string,args:any={})=>f.tools.execute({ventureId:'v',taskId:'t',tool,args});
test('v2 actual browser accepts normal form workflow, complete state, fresh session, CSV and narrow controls', {timeout:60000},async()=>{const f=fixture();try{
 f.tools.seed('v','t',{kind:'software',files:quoteProductV2Example(),inputs:{profile:quoteProductV2.id},provenance:'Development-assistant offline reference, never a live seed.'});
 const result=await call(f,'check.run');assert.equal(result.ok,true,JSON.stringify(result));for(const id of quoteV2Checks)assert.equal(result.checks.find((c:any)=>c.id===id)?.passed,true,id);
 const browser=result.checks.find((c:any)=>c.id==='software.browser-observation');assert.equal(browser.evidence.independentHumanReview,false);assert.ok(browser.evidence.views.some((v:any)=>v.name==='completed-narrow'&&v.viewport===390));assert.ok(browser.evidence.views.every((v:any)=>v.screenshot?.sha256));
 const owner=f.tools.previewState('v','t',{ventureId:'v',taskId:'t',manifestHash:result.manifest.sha256,operation:'read'});assert.equal(owner.state.quotes.length,0,'Checks cannot populate owner customer state');
 assert.equal((await call(f,'artifact.publish_local')).ok,true);assert.equal(JSON.parse(f.tools.download('v','t').content).manifest.sha256,result.manifest.sha256);
 const updated=await call(f,'workspace.replace',{path:'app.html',content:quoteProductV2Example()[0].content+'\n<!-- revised -->',expectedHash:result.manifest.files[0].sha256});assert.equal(updated.ok,true);assert.equal((await call(f,'artifact.publish_local')).ok,false,'Changed source invalidates checks and delivery');
 }finally{f.close();}});
test('v2 deliberate source defect yields real failed journey and blocks publication', {timeout:60000},async()=>{const f=fixture();try{
 const files=quoteProductV2Example();files[0].content=files[0].content.replace('sum+line.quantity*line.unitMinor','sum+line.unitMinor');
 f.tools.seed('v','t',{kind:'software',files,inputs:{profile:quoteProductV2.id},provenance:'Explicitly injected offline defect'});const r=await call(f,'check.run');assert.equal(r.ok,false);assert.equal(r.checks.find((c:any)=>c.id==='software.line-totals')?.passed,false);assert.equal((await call(f,'artifact.publish_local')).ok,false);
 }finally{f.close();}});
test('CSV accepts normalized quoting and line endings; malformed or differing content does not become byte-equality acceptance',()=>{assert.deepEqual(parseCSV('customer,status,total_usd\n"Acme, Inc",quoted,25.50\n'),[['customer','status','total_usd'],['Acme, Inc','quoted','25.50']]);assert.deepEqual(parseCSV('"customer","status","total_usd"\r\n"Acme ""A""",quoted,0.10'),[['customer','status','total_usd'],['Acme "A"','quoted','0.10']]);assert.throws(()=>parseCSV('"unclosed'),/UNCLOSED/);});
test('v4 report handoff fails before publication, preserving legacy report acceptance',async()=>{const f=fixture();try{const files=serviceBriefFiles();const r=JSON.parse(files[0].content);r.unknowns=Array(3).fill('x'.repeat(6500));files[0].content=JSON.stringify(r);assert.ok(checkServiceBrief(files,defaultServiceInputs).checks.every(c=>c.passed));f.tools.seed('v','t',{kind:'service',files,inputs:{...defaultServiceInputs,enforceHandoff:true},provenance:'Offline boundary test'});const observed=await call(f,'check.run');assert.equal(observed.ok,false);assert.equal(observed.checks.find((c:any)=>c.id==='service.handoff')?.passed,false);assert.equal((await call(f,'artifact.publish_local')).ok,false);}finally{f.close();}});
