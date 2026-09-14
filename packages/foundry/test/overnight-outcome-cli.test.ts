import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join,relative,isAbsolute,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {PilotService} from '../src/pilot/service.ts';
import {fixturePilotWorker} from '../src/pilot/fixtures-execution.ts';
import {keypair} from '../src/experiment/config.ts';
import {loadAuthorizedOutcome} from '../src/pilot/outcome-authorized.ts';
import {outcomeCliMain} from '../src/pilot/outcome-cli.ts';

function outcomePlan(source:any){return {decision:'prepare',rationale:'Prepare one bounded sourced packet and preserve owner review.',strongestAlternative:'Reject until the owner supplies different current evidence.',blockingConditions:[],evidenceRefs:[{sourceId:source.id,quote:source.text}],tasks:[{id:'foundation',family:'response-packet',title:'Owner packet',outcome:'Provide one source-grounded owner packet.',details:'Keep pricing and customer results unknown pending owner review.',dependsOn:[],sourceIds:[source.id],competencies:['evidence-synthesis'],reasonForWorker:'The declared generalist has the necessary local source and review tools.',calls:4}],successEvidence:['Current local checks and readback.'],limitsOfInference:'Ephemeral mock transport verifies authority mechanics only.'};}

test('standalone outcome CLI prepares, signs, runs and resumes one signed mock graph without provider fallback',async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-outcome-cli-')),service=new PilotService(root),company=service.knowledge.createCompany({name:'CLI fixture',website:'',goal:'Prepare a current source-grounded packet',notes:'Synthetic only.',mode:'fixture'}),source=service.knowledge.addSource(company.id,{title:'Owner rule',text:'The owner must review pricing and no customer result is verified.',kind:'notes',rights:'Synthetic fixture',observedAt:new Date().toISOString()}),mandate=service.operatingOutcomes.create(company.id,{objective:'Prepare a current source-grounded packet',autonomy:'prepare_supported_work',allowedFamilies:['response-packet'],maxCalls:12,repairReserve:4}),packet=join(root,'review'),keys=keypair(),publicKey=join(root,'fixture-owner.pub'),privateKey=join(root,'fixture-owner.key');
 let counts=0,creates=0;const transport=(async(url:any,init:any)=>{const target=String(url);if(target.endsWith('/input_tokens')){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}assert.equal(init.method,'POST');creates++;const input=JSON.parse(JSON.parse(init.body).input),output=input.context.mandate?outcomePlan(source):(await fixturePilotWorker().run({request:{context:input.context}} as any)).output;return Response.json({id:'resp_cli_'+creates,model:'gpt-6-astra',status:'completed',service_tier:'default',background:true,store:true,usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});}) as typeof fetch;
 const write=(_value:any)=>{},deps={service,write,loadAuthorized:(_services:any,_root:string)=>loadAuthorizedOutcome({outcomes:service.operatingOutcomes},root,{testing:{envelope:JSON.parse(readFileSync(join(root,'pilot.outcome.authorization.json'),'utf8')),trustedPublicKey:keys.publicKey,transport}})};
 try{
  const prepared:any=await outcomeCliMain(['prepare','--root',root,'--outcome',mandate.id,'--id','outcome-034-cli-test','--project','proj_CLI_OFFLINE','--expires-at',new Date(Date.now()+3600000).toISOString(),'--count-reserve','301','--mode','mock','--output',packet],deps);assert.equal(prepared.providerRequests,0);assert.equal(counts,0);assert.equal(creates,0);
  writeFileSync(publicKey,keys.publicKey,{flag:'wx'});writeFileSync(privateKey,keys.privateKey,{flag:'wx'});
  const signed:any=await outcomeCliMain(['sign','--root',root,'--proposal',join(packet,'pilot.outcome.authorization.request.json'),'--approve-proposal-hash',prepared.proposalHash,'--principal','fixture-owner','--approval-reference','Explicit fixture-only approval evidence.','--owner-public-key',publicKey,'--owner-private-key',privateKey],deps);assert.equal(signed.credentialRead,false);assert.equal(creates,0);
  const first:any=await outcomeCliMain(['run','--root',root],deps);assert.equal(first.outcome.state,'completed',JSON.stringify(first.outcome));assert.equal(first.sameIdRecoveryOnly,true);assert.equal(counts,3);assert.equal(creates,3);
  const resumed:any=await outcomeCliMain(['resume','--root',root],deps);assert.equal(resumed.outcome.state,'completed');assert.equal(counts,3);assert.equal(creates,3);
  const status:any=await outcomeCliMain(['status','--root',root,'--outcome',mandate.id],deps);assert.equal(status.authorizationInstalled,true);assert.equal(status.credentialRead,false);assert.equal(status.providerRequests,0);
  await assert.rejects(()=>outcomeCliMain(['run','--root',root],{service,write}),/OPERATING_GRANT_IMPLEMENTATION|OPERATING_GRANT_LOCATION|OPERATING_GRANT/);
 }finally{service.store.close();const exact=realpathSync(root),inside=relative(realpathSync(tmpdir()),exact);assert(inside&&!inside.startsWith('..')&&!isAbsolute(inside));rmSync(exact,{recursive:true,force:true});}
});

test('CLI refuses plaintext execution, implicit signing, relative protected paths, and invalid controls',async()=>{
 const writes:any[]=[],root=resolve(tmpdir(),'midas-outcome-cli-invalid-root');
 await assert.rejects(()=>outcomeCliMain(['run','--root',root],{service:{operatingOutcomes:{},store:{close(){}}},write:v=>writes.push(v)}),/pilot.outcome.authorization|ENOENT/);
 await assert.rejects(()=>outcomeCliMain(['sign','--root',root],{service:{operatingOutcomes:{},store:{close(){}}},write:v=>writes.push(v)}),/OUTCOME_CLI_PROPOSAL_REQUIRED/);
 await assert.rejects(()=>outcomeCliMain(['prepare','--root',root,'--outcome','x','--id','outcome-034-x','--project','proj_x','--expires-at','2099-01-01T00:00:00.000Z','--count-reserve','1','--mode','live','--credential-file','relative.key','--output',root],{service:{operatingOutcomes:{},store:{close(){}}},write:v=>writes.push(v)}),/CREDENTIAL_ABSOLUTE/);
 await assert.rejects(()=>outcomeCliMain(['control','--root',root,'--outcome','x','--action','send'],{service:{operatingOutcomes:{},store:{close(){}}},write:v=>writes.push(v)}),/OUTCOME_CLI_CONTROL_REQUIRED/);
});
