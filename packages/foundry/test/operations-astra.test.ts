import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { OperatingManager,owner } from '../src/operations/manager.ts';
import { OperatingModels,recoveryInstruction } from '../src/operations/model.ts';
import { fixtureTransport,mockGrant,OFFLINE_URL,OFFLINE_SOURCE } from '../src/operations/offline.ts';
import { keypair,signed } from '../src/experiment/config.ts';
import { hash,canonical } from '../src/contracts.ts';
import { prepareAstra,prepareGmailTest,BUSINESS_ID,MAIL_ID,TEST_MESSAGES } from '../src/operations/launch.ts';
import { draftOnlySchema,decisionSchema,reviewSchema,structure } from '../src/operations/contracts.ts';
import { startLearning,recordImprovementCase } from '../src/operations/study.ts';

function base(){const root=mkdtempSync(join(tmpdir(),'midas-astra-proposal-')),store=new StateStore(join(root,'state.sqlite')),bare=new OperatingManager({store,researchPorts:()=>({})});return {root,store,bare};}
function recoveryHarness(fault:'incomplete'|'uncertain'|'access'|'all-incomplete'){
 const h=base(),b=h.bare.create({id:'recovery-test',name:'Recovery test',goal:'Investigate and draft a useful result.',mode:'offline',allowedUrls:[OFFLINE_URL]});
 const g=mockGrant(h.root,[b],6);g.recovery={version:'known-incomplete-v1',maxAdmissions:2};g.limits.allocations!.push({metadataKey:'stage',value:'recovery',attempts:2,minor:104},{metadataKey:'stage',value:'investigate',attempts:4,minor:208},{metadataKey:'stage',value:'review',attempts:2,minor:104});
 const captured:any[]=[],normal=fixtureTransport();let inferences=0;
 const transport=(async(url:any,init:any)=>{const body=JSON.parse(init.body);captured.push(body);if(!String(url).endsWith('/input_tokens')){inferences++;if(inferences===1||fault==='all-incomplete'){
  if(fault==='uncertain')throw Error('OFFLINE_UNCERTAIN');
  if(fault==='access')return new Response(JSON.stringify({error:{type:'invalid_request_error',code:'invalid_project',message:'Invalid project'}}),{status:401});
  return new Response(JSON.stringify({id:'mock-incomplete',model:body.model,status:'incomplete',service_tier:'default',usage:{input_tokens:1200,output_tokens:800},output:[]}),{headers:{'x-request-id':'mock-incomplete'}});
 }}return normal(url,init);}) as typeof fetch;
 const keys=keypair(),models=new OperatingModels({root:h.root,store:h.store,envelope:signed(g,keys.privateKey),trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}});
 const manager=new OperatingManager({store:h.store,models,researchPorts:()=>({fetch:async()=>new Response(OFFLINE_SOURCE,{headers:{'content-type':'text/plain'}}),dnsLookup:async()=>[{address:'93.184.216.34'}]})});
 return {...h,b,g,models,manager,captured,inferences:()=>inferences};
}
test('Astra proposal preserves historical unsigned bytes and serializes the actual strict payload without access',()=>{
 const h=base();try{
  const parent=h.bare.create({id:'midas-owned-venture',name:'Existing venture',goal:'Historical hypothesis',mode:'live',allowedUrls:[]});
  const old=JSON.stringify(parent),p=prepareAstra(h.root,h.bare),g=p.grant;
  assert.equal(JSON.stringify(h.bare.get(parent.id)),old);assert.equal(g.route.model,'gpt-6-astra');assert.equal(g.route.reasoningEffort,'high');assert.equal(g.limits.totalMinor,2300);
  assert.equal(g.limits.stages.development.attempts,25);assert.equal(g.limits.stages.development.minor+g.limits.overheadReserve!.minor,2300);assert.equal(g.approvedBy,'');
  const body=JSON.parse(readFileSync(join(p.directory,'initial-responses-body.json'),'utf8')),count=JSON.parse(readFileSync(join(p.directory,'initial-count-body.json'),'utf8'));
  assert.equal(body.model,g.route.model);assert.equal(body.store,false);assert.equal(body.max_output_tokens,8192);assert.equal(body.text.format.schema.properties.draft.anyOf[0].properties.outreach.maxItems,0);
  assert.equal(count.input,body.input);assert.equal(count.instructions,body.instructions);assert.deepEqual(count.text,body.text);assert.ok(!Object.hasOwn(count,'max_output_tokens'));assert.ok(!canonical(body).includes('openai.key'));
  assert.match(JSON.parse(body.input).context.goal,/replace.*inherited|replace the inherited/i);
  assert.equal(h.store.db.prepare("SELECT count(*) AS n FROM entities WHERE kind='model-attempt'").get()!.n,0);
  writeFileSync(join(p.directory,'model-grant.signed.json'),'preserved');assert.throws(()=>prepareAstra(h.root,h.bare),/SIGNED_PROPOSAL_IMMUTABLE/);
 }finally{h.store.close();}
});
test('optional Gmail uses a separate zero-model-call business and exact unsent messages',()=>{
 const h=base();try{h.bare.create({id:'midas-owned-venture',name:'Parent',goal:'Historical idea',mode:'live',allowedUrls:[]});const p=prepareAstra(h.root,h.bare);const original=hash(h.bare.get(BUSINESS_ID));
  assert.throws(()=>prepareGmailTest(h.root,h.bare,'a@example.com',['b@example.com','b@example.com']),/DISTINCT/);
  const mail=prepareGmailTest(h.root,h.bare,'sender@example.com',['ack@example.com','stop@example.com']);
  assert.equal(hash(h.bare.get(BUSINESS_ID)),original);assert.equal(p.grant.businesses.find(b=>b.id===MAIL_ID)!.maxCalls,0);assert.equal(mail.externalMessages,0);
  assert.deepEqual(mail.messages.map((m:any)=>({subject:m.subject,body:m.body})),TEST_MESSAGES);assert.equal(h.bare.get(MAIL_ID).approvedBatch,null);
 }finally{h.store.close();}
});
test('provider-visible draft-only schema applies equally to initial and reviewed deliverables',()=>{
 for(const schema of [decisionSchema,reviewSchema]){const changed=draftOnlySchema(schema),d=(changed.properties.draft??changed.properties.replacement).anyOf[0];assert.equal(d.properties.outreach.maxItems,0);assert.throws(()=>structure(d.properties.outreach,[{}]),/OUTPUT_ARRAY/);assert.equal((schema.properties.draft??schema.properties.replacement).anyOf[0].properties.outreach.maxItems,4);}
});
test('known incomplete response receives one fresh linked correction; both reservations remain',async()=>{
 const h=recoveryHarness('incomplete');try{const v=await h.manager.run(owner(h.b.id),h.b.id),rows=h.models.ledger.rows().sort((a,b)=>Date.parse(a.admittedAt)-Date.parse(b.admittedAt));assert.equal(v.phase,'approval');assert.equal(rows.length,4);assert.equal(h.inferences(),4);assert.equal(rows[0].errorCode,'MODEL_RESPONSE_INCOMPLETE');assert.equal(rows[1].metadata.recoveryOf,rows[0].id);assert.notEqual(rows[0].id,rows[1].id);assert.equal(rows[0].reservation,52);assert.equal(rows[1].reservation,52);assert.equal(rows[1].request.context.recoveryInstruction,recoveryInstruction);
 const original=JSON.parse(h.store.get('operating-request',rows[0].id+'-request').bytes),recovered=JSON.parse(h.store.get('operating-request',rows[1].id+'-request').bytes);const input=JSON.parse(recovered.input);delete input.context.recoveryInstruction;recovered.input=canonical(input);assert.deepEqual(recovered,original);
 }finally{h.store.close();}
});
for(const fault of ['uncertain','access'] as const)test(fault+' never releases recovery or duplicates a provider request',async()=>{const h=recoveryHarness(fault);try{await assert.rejects(h.manager.run(owner(h.b.id),h.b.id));await assert.rejects(h.manager.run(owner(h.b.id),h.b.id));assert.equal(h.inferences(),1);assert.equal(h.models.ledger.rows().length,1);assert.equal(h.models.ledger.rows()[0].reservation,52);}finally{h.store.close();}});
test('a recovery cannot itself be recovered or consume another primary identity',async()=>{const h=recoveryHarness('all-incomplete');try{await assert.rejects(h.manager.run(owner(h.b.id),h.b.id));await assert.rejects(h.manager.run(owner(h.b.id),h.b.id));assert.equal(h.inferences(),2);assert.equal(h.models.ledger.rows().length,2);assert.equal(h.manager.get(h.b.id).status,'blocked');}finally{h.store.close();}});
test('source presence and mock success cannot release conditional study calls',async()=>{const h=recoveryHarness('incomplete');try{h.models.grant.learningGate='consequential-job-v1';await h.manager.run(owner(h.b.id),h.b.id);const n=h.inferences(),b=h.manager.get(h.b.id);await assert.rejects(startLearning(h.manager,owner(b.id),b.id,b.sources[0].id),/CONSEQUENTIAL_IMPROVEMENT_CASE_REQUIRED/);assert.equal(h.inferences(),n);assert.throws(()=>recordImprovementCase(h.manager,owner(b.id),b.id,{}),/ACTUAL_REVIEW_REQUIRED/);}finally{h.store.close();}});
test('the same failed parent cannot obtain a second fresh replacement',async()=>{
 const h=recoveryHarness('incomplete');try{await h.manager.run(owner(h.b.id),h.b.id);const parent=h.models.ledger.rows().find(r=>r.errorCode==='MODEL_RESPONSE_INCOMPLETE'),raw=h.store.get('operating-request',parent.id+'-request');
 const request={...parent.request,scope:h.b.scope,requestId:'another-replacement',context:{...parent.request.context,recoveryInstruction}};
 await assert.rejects(h.models.invoke(owner(h.b.id),{businessId:h.b.id,goalHash:hash(h.b.goal),sourceHosts:h.manager.hosts(h.b),attemptId:request.requestId,stage:'recovery',recoveryOf:parent.id,request,schema:JSON.parse(raw.bytes).text.format.schema,validate:()=>{}}),/OPERATING_RECOVERY_ALREADY_CLAIMED/);
 assert.equal(h.inferences(),4);assert.equal(h.models.ledger.rows().length,4);
 }finally{h.store.close();}
});
test('the exact proposed envelope runs a mocked reviewed rejection without mail or comparison spending',async()=>{
 const h=base();try{
  h.bare.create({id:'midas-owned-venture',name:'Prior hypothesis',goal:'Original cleaning audit',mode:'live',allowedUrls:[]});const proposal=prepareAstra(h.root,h.bare),g=structuredClone(proposal.grant);
  g.mode='mock';g.projectId='proj_OFFLINE_ONLY';g.credentialFile=null;g.approvedBy='offline-test-controller';g.approvalReference='OFFLINE TEST ONLY';g.accountScope=structuredClone(g.accountScope);
  let b=h.bare.get(BUSINESS_ID);b.mode='offline';b.sources=[{id:'test-source',url:'https://www.getjobber.com/features/client-hub/',title:'Fictional test source',text:'OFFLINE FIXTURE: substitute workflow documented, willingness to pay unknown.',observedAt:new Date().toISOString(),sha256:hash('mock'),status:'available',provenance:'offline_mock',rights:'public_readonly',validUntil:null}];h.bare.save(b,'test.mock_scope');
  const draft={title:'Reject current commercial commitment',buyer:'No qualified accessible buyer yet',offer:'Defer the cleaning-site offer pending buyer evidence.',scope:['An actual test rejection memo: substitute solution exists in supplied fictional evidence; no documented willingness to pay.'],assumptions:['This fixture is not commercial evidence.'],sourceIds:['test-source'],nextTest:'Prepare interviews to test whether an unresolved workflow problem exists.',outreach:[]};
  const outputs=[{action:'draft',reason:'The hypothesis is not supported; prepare a rejection memo for review.',query:null,sourceUrls:[],claims:[],bottlenecks:[],draft},{verdict:'ready',reason:'Correct the rejection to distinguish missing evidence from proof of no market.',query:null,sourceUrls:[],replacement:{...draft,offer:'Insufficient evidence to commit; do not infer absence of a market.'},changes:['Removed the overstrong market-negative implication.'],limitations:['Offline fixture; no demonstrated reasoning or demand.']}];
  const keys=keypair(),models=new OperatingModels({root:h.root,store:h.store,envelope:signed(g,keys.privateKey),trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport:fixtureTransport({outputs})}}),m=new OperatingManager({store:h.store,models,researchPorts:()=>({fetch:async()=>{throw Error('UNEXPECTED_NETWORK');}})});
  const result=await m.run(owner(b.id),b.id);assert.equal(result.status,'completed');assert.equal(result.phase,'closed');assert.equal(result.draft.offer,outputs[1].replacement!.offer);assert.equal(result.accounting.callsUsed,2);assert.equal(result.outbox.length,0);assert.equal(result.artifacts.at(-1).provenance,'offline_mock');assert.equal(result.learning.candidate,null);
 }finally{h.store.close();}
});
test('two recovery slots cannot be exceeded even with another eligible terminal parent',async()=>{
 const h=recoveryHarness('all-incomplete');try{await assert.rejects(h.manager.run(owner(h.b.id),h.b.id));const parent=h.models.ledger.rows().find(r=>!r.metadata.recoveryOf),raw=h.store.get('operating-request',parent.id+'-request');
 const invoke=(id:string,recoveryOf?:string)=>{const request={...parent.request,scope:h.b.scope,requestId:id,context:recoveryOf?{...parent.request.context,recoveryInstruction}:parent.request.context};return h.models.invoke(owner(h.b.id),{businessId:h.b.id,goalHash:hash(h.b.goal),sourceHosts:h.manager.hosts(h.b),attemptId:id,stage:recoveryOf?'recovery':'investigate',recoveryOf,request,schema:JSON.parse(raw.bytes).text.format.schema,validate:()=>{}});};
 await assert.rejects(invoke('parent-two'),/MODEL_RESPONSE_INCOMPLETE/);await assert.rejects(invoke('replacement-two','parent-two'),/MODEL_RESPONSE_INCOMPLETE/);
 await assert.rejects(invoke('parent-three'),/MODEL_RESPONSE_INCOMPLETE/);await assert.rejects(invoke('replacement-three','parent-three'),/ALLOCATION_ATTEMPT_CAP/);
 assert.equal(h.inferences(),5);assert.equal(h.models.ledger.rows().filter(r=>r.metadata.stage==='recovery').length,2);assert.ok(h.models.ledger.rows().every(r=>r.reservation===52));
 }finally{h.store.close();}
});
