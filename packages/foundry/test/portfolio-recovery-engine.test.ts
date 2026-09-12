import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {hash} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {preparePortfolio,offlinePortfolioModel} from '../src/portfolio/prepare.ts';
import {createPortfolioProposal,loadLivePortfolio} from '../src/portfolio/live.ts';

test('trusted mocked Responses binding recovers one known incomplete worker and completes same actual tools without clearing parent exposure',async()=>{
 const root=mkdtempSync(join(tmpdir(),'portfolio-recovery-engine-')),store=new StateStore(join(root,'portfolio.sqlite'));
 try{
  const p=new Portfolio(store),tools=new LocalWorkTools({store,root,scopeFor:portfolioScope}),e=new EvidenceLibrary(store);preparePortfolio(p,tools,e);
  const t=p.getTask('release-readiness/fulfill'),v=p.getVenture(t.ventureId),keys=keypair();
  const proposal=createPortfolioProposal({root,id:'portfolio-031-linked-mock',mode:'mock',projectId:'proj_mock',credentialFile:null,expiresAt:new Date(Date.now()+3600000).toISOString(),countUncertaintyMinor:25,recoveryAdmissions:2,ventures:[{id:v.id,goal:v.goal,capabilities:[t.capability],tools:t.allowedTools,workCalls:10,searchCalls:0}]});
  proposal.operating.approvedBy='ephemeral-test';proposal.operating.approvalReference='explicit mock test only';proposal.portfolio.approved=true;proposal.portfolio.approvedBy=proposal.operating.approvedBy;proposal.portfolio.approvalReference=proposal.operating.approvalReference;proposal.portfolio.operatingGrantHash=hash(proposal.operating);
  let counts=0,inferences=0;const fixture=offlinePortfolioModel(tools);
  const transport=(async(url:any)=>{if(String(url).endsWith('/input_tokens')){counts++;return Response.json({object:'response.input_tokens',input_tokens:100});}inferences++;if(inferences===1)return Response.json({id:'resp_known_incomplete',model:'gpt-6-astra',service_tier:'default',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:100},output:[]});const requests=store.db.prepare("SELECT body FROM entities WHERE kind='portfolio-model-request' ORDER BY rowid DESC").all();const latest=JSON.parse(String(requests[0].body)).call;const result=await fixture.run(latest);return Response.json({id:'resp_complete_'+inferences,model:'gpt-6-astra',service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result.output)}]}]});}) as typeof fetch;
  const ports=loadLivePortfolio(root,store,{envelope:{...signed(proposal.portfolio,keys.privateKey),operatingEnvelope:signed(proposal.operating,keys.privateKey)},trustedPublicKey:keys.publicKey,execution:{kind:'mock',transport}}),engine=new PortfolioEngine({portfolio:p,tools,evidence:e,model:ports.worker,recoveryAuthority:ports.recoveryEvidence});
  await engine.runTask(t.id);assert.equal(p.getTask(t.id).status,'needs_reconciliation');const parent=engine.rows('portfolio-model-request')[0].call.attemptId;assert.equal(ports.recoveryEvidence(parent).eligible,true);const before=ports.totals().retainedMinor;
  const prepared=engine.prepareRecovery(t.id,parent);assert.notEqual(prepared.newAttemptId,parent);assert.equal(inferences,1);assert.equal(ports.totals().retainedMinor,before);assert.equal(p.getTask(t.id).status,'queued');
  await engine.runTask(t.id);assert.equal(p.getTask(t.id).status,'completed',p.getTask(t.id).reason);assert.equal(inferences,7);assert.equal(counts,7);assert.equal(ports.totals().callsUsed,7);assert.equal(ports.totals().recoveryAdmissions,1);assert.equal(ports.totals().retainedMinor,7*123+25);assert.equal(ports.totals().providerRequests,0);assert.equal(tools.load(v.id,t.id).manifest.revision,2);assert.throws(()=>engine.prepareRecovery(t.id,parent));
  const n=inferences;await engine.recover();assert.equal(inferences,n);assert.equal(engine.rows('portfolio-recovery-intent').length,1);assert.equal(engine.rows('portfolio-model-request').length,7);
 }finally{store.close();rmSync(root,{recursive:true,force:true});}
});
