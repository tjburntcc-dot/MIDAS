import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {hash,scopeKey} from '../src/contracts.ts';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {InteractivePreviewSessions} from '../src/portfolio/preview.ts';
import type {PreviewAction} from '../src/portfolio/preview.ts';
import {servePortfolio} from '../src/portfolio/server.ts';

type OpenOptions=Parameters<InteractivePreviewSessions['open']>[0];
type Owner={cookie:string;csrf:string};
const snapshot=(store:StateStore)=>hash(['entities','events','records','artifacts'].map(table=>store.db.prepare('SELECT * FROM '+table).all().map(row=>({...row}))));

/** Only the transient browser is replaced. HTTP authentication, workspace
 * binding and durable preview-state reads use the production implementations. */
class PreviewStub extends InteractivePreviewSessions{
 readonly entries=new Map<string,OpenOptions>();readonly closed:string[]=[];readonly operations:string[]=[];readonly observedStates:any[]=[];private sequence=0;
 override binding(id:string){const entry=this.entries.get(id);assert(entry,'preview must still be open');return {ventureId:entry.ventureId,taskId:entry.taskId,manifestHash:entry.manifestHash};}
 private result(id:string){return {sessionId:id,binding:this.binding(id),width:1100,height:850,image:{mimeType:'image/png',data:'explicit-test-image'},blockedRequests:0};}
 override async open(options:OpenOptions){const id='preview-fixture-'+(++this.sequence);this.entries.set(id,options);this.operations.push('open:'+id);this.observedStates.push(options.stateHandler({...this.binding(id),operation:'read'}));return this.result(id);}
 override async act(id:string,action:PreviewAction){assert.equal(action.kind,'refresh');return this.result(id);}
 override async close(id:string){assert(this.entries.has(id),'server must close an existing transient session');this.entries.delete(id);this.closed.push(id);this.operations.push('close:'+id);}
 override async closeAll(){for(const id of [...this.entries.keys()])await this.close(id);}
}

test('owner preview reopening replaces only the matching transient session and preserves product data and model counters',{timeout:15000},async()=>{
 const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'midas-server-preview-')),store=new StateStore(join(root,'portfolio.sqlite'));
 const portfolio=new Portfolio(store),tools=new LocalWorkTools({root,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store),previews=new PreviewStub();let modelCalls=0;
 const engine=new PortfolioEngine({portfolio,tools,evidence,model:{kind:'disabled',async run(){modelCalls++;throw Error('Preview must not execute a model');}}});
 let app:ReturnType<typeof servePortfolio>|undefined;
 try{
  portfolio.createVenture({id:'preview-fixture',name:'Explicit server routing fixture',goal:'Verify transient preview ownership without running authored software'});
  portfolio.addPlan('preview-fixture',{rationale:'Isolated preview lifecycle test',tasks:['first','other'].map(id=>({id,title:id,lane:'build' as const,capability:'software.build',dependsOn:[],acceptance:['This fixture tests session routing only'],resource:{modelCalls:1,localToolRuns:1}}))});
  const savedState={schemaVersion:1,quotes:[{id:'demo-existing',customer:'Existing synthetic demo quote',lines:[{description:'Persisted fixture work',quantity:2,unitMinor:1250}],status:'quoted'}]};
  const bindings=['first','other'].map(id=>{
   const taskId='preview-fixture/'+id,manifest=tools.seed('preview-fixture',taskId,{kind:'software',files:[{path:'app.html',content:'<h1>Explicit session routing fixture; no product acceptance asserted</h1>'}],inputs:{profile:'quote-to-job-v2'},provenance:'Offline test fixture, not a checked product'});
   // Seed only the server's publication precondition. This test never asserts
   // product checks passed and never launches or publishes authored software.
   const key=scopeKey(portfolioScope('preview-fixture'))+'/'+encodeURIComponent(taskId),workspace=tools.load('preview-fixture',taskId);
   store.put('local-workspace',key,{...workspace,published:{manifestHash:manifest.sha256}},workspace._version!);
   const binding={ventureId:'preview-fixture',taskId,manifestHash:manifest.sha256};tools.previewState(binding.ventureId,taskId,{...binding,operation:'write',expectedVersion:0,state:savedState});return binding;
  });
  // Missing retained grant plus historical provider evidence must stay unknown
  // through the real server's legacy resource aliases as well as its new view.
  store.put('model-attempt','mason/portfolio-models/historical/portfolio-live-v1/fixture/1',{metadata:{source:'actual-model'},reservation:123},null);
  const before=snapshot(store);app=servePortfolio({engine,tools,previews,port:0});const origin=await app.ready;
  const owner=async():Promise<Owner>=>{const response=await fetch(origin+'/api/session');assert.equal(response.status,200);const data=await response.json() as any,cookie=response.headers.get('set-cookie')?.split(';')[0];assert(cookie);return {cookie,csrf:data.csrf};};
  const post=async(owner:Owner,path:string,body:unknown)=>{const response=await fetch(origin+path,{method:'POST',headers:{cookie:owner.cookie,origin,'x-csrf-token':owner.csrf,'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json() as any};};
  const open=async(owner:Owner,binding=bindings[0])=>{const response=await post(owner,'/api/preview/open',binding);assert.equal(response.status,200,JSON.stringify(response.body));return response.body.sessionId as string;};
  const act=(owner:Owner,sessionId:string)=>post(owner,'/api/preview/action',{sessionId,kind:'refresh'});
  const alice=await owner(),bob=await owner();assert.notEqual(alice.cookie,bob.cookie);assert.notEqual(alice.csrf,bob.csrf);
  const dataResponse=await fetch(origin+'/api/portfolio',{headers:{cookie:alice.cookie}});assert.equal(dataResponse.status,200);const data=await dataResponse.json() as any;assert.equal(data.modelAccounting.status,'unavailable');for(const key of ['providerRequests','provisionalMinor','settledMinor','retainedMinor','remainingMinor','callsUsed','callLimit','countBufferMinor'])assert.equal(data.resources[key],null,key+' must not invent zero while accounting is unavailable');
  const first=await open(alice),foreign=await open(bob),other=await open(alice,bindings[1]);assert.deepEqual(previews.closed,[]);
  const replacement=await open(alice);assert.notEqual(replacement,first);assert.deepEqual(previews.closed,[first]);assert(previews.entries.has(foreign));assert(previews.entries.has(other));
  assert(previews.operations.indexOf('close:'+first)<previews.operations.indexOf('open:'+replacement),'close the prior browser before allocating its replacement');
  assert.deepEqual(await act(alice,first),{status:400,body:{error:'PREVIEW_SESSION_SCOPE'}});
  assert.deepEqual(await act(alice,foreign),{status:400,body:{error:'PREVIEW_SESSION_SCOPE'}});
  for(const [identity,id] of [[bob,foreign],[alice,other],[alice,replacement]] as const)assert.equal((await act(identity,id)).status,200);
  const again=await open(alice);assert.notEqual(again,replacement);assert.deepEqual(previews.closed,[first,replacement]);assert.equal(previews.entries.size,3);
  assert.deepEqual(await post(alice,'/api/preview/open',{...bindings[0],ventureId:'another-venture'}),{status:400,body:{error:'PREVIEW_SCOPE_DENIED'}});
  assert.deepEqual(await post(alice,'/api/preview/open',{...bindings[0],manifestHash:'stale'}),{status:400,body:{error:'PREVIEW_MANIFEST_STALE'}});
  assert.deepEqual(await post({...alice,csrf:bob.csrf},'/api/preview/open',bindings[0]),{status:400,body:{error:'CSRF_INVALID'}});
  assert.deepEqual(previews.closed,[first,replacement],'invalid requests must not close the current preview');
  for(const observed of previews.observedStates)assert.deepEqual(observed,{version:1,state:savedState},'reopening reads the existing durable product data');
  for(const binding of bindings)assert.deepEqual(tools.previewState(binding.ventureId,binding.taskId,{...binding,operation:'read'}),{version:1,state:savedState});
  assert.equal(modelCalls,0);assert.equal(snapshot(store),before,'preview lifecycle and denied requests must not mutate product data, ledger rows, tasks or resource counters');
  await app.close();app=undefined;assert.equal(previews.entries.size,0);assert.equal(snapshot(store),before,'closing transient sessions must not mutate durable state');
 }finally{await app?.close();store.close();const child=realpathSync(root),part=relative(parent,child);assert(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(child,{recursive:true,force:true});}
});
