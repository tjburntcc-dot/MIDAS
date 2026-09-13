import { resolve,join } from 'node:path';
import { mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import { StateStore } from '../state.ts';
import { hash,rawHash,requireThat,canonical } from '../contracts.ts';
import { buildResponsesBody } from '../model-port.ts';
import { countPayload } from '../experiment/token-count.ts';
import { signed } from '../experiment/config.ts';
import { Portfolio } from './core.ts';
import { portfolioScope } from './contracts.ts';
import { LocalWorkTools } from './tools.ts';
import { EvidenceLibrary } from './evidence.ts';
import { PortfolioEngine } from './engine.ts';
import { preparePortfolio,offlinePortfolioModel } from './prepare.ts';
import { prepareIntegratedRelease,integratedTaskAllowances } from './integrated-release.ts';
import {prepareValueReleaseV4,valueReleaseV4TaskAllowances} from './value-release-v4.ts';
import { prepareOperatingRelease } from './release.ts';
import { prepareCommercialPackets } from './commercial.ts';
import { createTaskPreparer } from './task-preparation.ts';
import { loadLivePortfolio,writePortfolioProposal,portfolioImplementationHash,portfolioRoute } from './live.ts';
import { servePortfolio,portfolioView } from './server.ts';
import {retireContinuationParent} from './continuation.ts';
const args=process.argv.slice(2),command=args[0]??'status';
const flag=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
if(command==='restore'){requireThat(!args.includes('--live')&&['--backup','--target','--manifest-hash'].every(f=>args.includes(f)),'RESTORE_EXPLICIT_INPUTS_REQUIRED');const {restorePortfolio}=await import('./continuity.ts');console.log(JSON.stringify(restorePortfolio({backupRoot:resolve(flag('--backup','')),targetRoot:resolve(flag('--target','')),expectedManifestHash:flag('--manifest-hash','')}),null,2));process.exit(0);}
if(command==='backup')requireThat(!args.includes('--live')&&args.includes('--backup')&&args.includes('--root'),'BACKUP_EXPLICIT_INPUTS_REQUIRED');
const root=resolve(flag('--root','var/portfolio-031'));mkdirSync(root,{recursive:true});
requireThat(!(args.includes('--live')&&args.includes('--mock')),'EXPLICIT_MODE_CONFLICT');
const store=new StateStore(join(root,'portfolio.sqlite')),portfolio=new Portfolio(store),tools=new LocalWorkTools({store,root,scopeFor:portfolioScope});
const live=command==='reconcile'?loadLivePortfolio(root,store,{purpose:'billing'}):args.includes('--live')?loadLivePortfolio(root,store):null;
const evidence=new EvidenceLibrary(store,{publicRead:Boolean(live),search:live?.search});
const model=live?.worker??(args.includes('--mock')?offlinePortfolioModel(tools):undefined),engine=new PortfolioEngine({portfolio,tools,evidence,model,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:live?.totals,recoveryAuthority:live?.recoveryEvidence});
const json=(x:unknown)=>console.log(JSON.stringify(x,null,2));
if(command==='prepare'){const prepared=preparePortfolio(portfolio,tools,evidence);json({prepared,release:prepareOperatingRelease(portfolio,evidence),commercial:prepareCommercialPackets(portfolio)});store.close();}
else if(command==='run'){await engine.recover();const task=flag('--task','');const result=task?await engine.runTask(task):await engine.drain();prepareCommercialPackets(portfolio);json({result,accounting:live?.totals()??{providerRequests:0,localComputeCost:null}});store.close();}
else if(command==='reconcile'){requireThat(live&&args.includes('--statement'),'BILLING_STATEMENT_REQUIRED');json(live.reconcileBilling(JSON.parse(readFileSync(resolve(flag('--statement','')),'utf8'))));store.close();}
else if(command==='recover-incomplete'){requireThat(live,'SIGNED_RECOVERY_AUTHORITY_REQUIRED');json(engine.prepareRecovery(flag('--task',''),flag('--parent','')));store.close();}
else if(command==='recover'){json(await engine.recover());store.close();}
else if(command==='serve'){await engine.recover();const app=servePortfolio({engine,tools,port:Number(flag('--port','43131'))});json({url:await app.ready,root,mode:model?.kind??'disabled',providerCallsAuthorized:Boolean(live),automaticDispatch:false});const close=async()=>{await app.close();store.close();process.exit(0);};process.once('SIGINT',close);process.once('SIGTERM',close);}
else if(command==='propose'){
 requireThat(!live,'PROPOSE_MUST_BE_OFFLINE');const valueV4=args.includes('--value-v4'),integrated=args.includes('--integrated')||valueV4;if(valueV4)prepareValueReleaseV4(portfolio,evidence);else if(integrated)prepareIntegratedRelease(portfolio,evidence);else prepareOperatingRelease(portfolio,evidence);const allowances=()=>valueV4?valueReleaseV4TaskAllowances(portfolio):integratedTaskAllowances(portfolio);
 const id=flag('--id','portfolio-031-operating-v1'),directory=resolve(flag('--output',join(root,'proposal',id)));
 const projectId='proj_H01ORqdOPQM6vdGwQYsqFL5r';
 // Finish V4 preview/validation before creating any proposal files. Its initial
 // canonical body is part of the signed packet, not merely a neighboring audit.
 const v4Preview=valueV4?await new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:allowances()})}).previewRequest('quote-desk/investigate-v4'):null;
 const v4Body=v4Preview?buildResponsesBody(portfolioRoute(id,projectId) as unknown as Parameters<typeof buildResponsesBody>[0],v4Preview.request,v4Preview.schema):null;
 const proposal=writePortfolioProposal(directory,{root,id,projectId,credentialFile:'C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key',expiresAt:flag('--expires','2026-09-25T22:00:00.000Z'),countUncertaintyMinor:400,recoveryAdmissions:2,billingPublicKey:args.includes('--billing-public-key')?readFileSync(resolve(flag('--billing-public-key','')),'utf8'):null,...(integrated?{tasks:allowances()}:{}),...(v4Body&&v4Preview?{initialRequests:[{taskId:'quote-desk/investigate-v4',bodyHash:rawHash(canonical(v4Body)),schemaHash:hash(v4Preview.schema)}]}:{}),ventures:portfolio.snapshot().ventures.filter(v=>!integrated||v.id==='quote-desk').map(v=>({id:v.id,goal:v.goal,capabilities:['research.investigate','quality.review','portfolio.plan','portfolio.reassess','service.brief','software.build','commercial.prepare'],tools:['workspace.list','workspace.read','workspace.replace','check.run','artifact.publish_local','research.search','research.fetch','research.read'],workCalls:integrated?34:v.id==='midas-intelligence'?1:17,searchCalls:v.id==='midas-intelligence'?0:2}))});
 const previewEngine=integrated?new PortfolioEngine({portfolio,tools,evidence,prepareTask:createTaskPreparer(portfolio,tools,evidence),accounting:()=>({taskAllocations:proposal.portfolio.tasks})}):engine;
 const preview=v4Preview??await previewEngine.previewRequest(integrated?'quote-desk/investigate-v3':'release-readiness/investigate-v2'),body=v4Body??buildResponsesBody(proposal.operating.route,preview.request,preview.schema);
 writeFileSync(join(directory,'initial-responses-body.json'),JSON.stringify(body,null,2),{flag:'wx'});writeFileSync(join(directory,'initial-count-body.json'),JSON.stringify(countPayload(body),null,2),{flag:'wx'});
 writeFileSync(join(directory,'initial-responses-bytes.json'),canonical(body),{flag:'wx'});writeFileSync(join(directory,'initial-count-bytes.json'),canonical(countPayload(body)),{flag:'wx'});
 if(integrated)writeFileSync(join(directory,'task-manifest.json'),JSON.stringify({tasks:allowances().map(t=>({allowance:t,task:portfolio.getTask(t.id)})),sources:(valueV4?evidence.forTask(portfolio.getTask('quote-desk/investigate-v4')):evidence.list('quote-desk')).map(({text,...source})=>source),laterRequests:'Assembled from actual tool outputs and exact input artifact versions; cannot be serialized before those observations exist.'},null,2),{flag:'wx'});
 writeFileSync(join(directory,'payload-audit.json'),JSON.stringify({implementationHash:portfolioImplementationHash(),proposalHash:hash(proposal),bodyHash:hash(body),schemaHash:hash(preview.schema),serializedBytes:Buffer.byteLength(JSON.stringify(body)),inputTokens:'unknown until authorized provider count',providerAccess:'not probed',credentialRead:false,providerRequests:0,counts:0,stages:integrated?'research / build-or-stop / write-run-test-repair / product review / operating deliverable / outcome decision':'research / report / report review / planning',procedureComparison:'zero released calls; requires evidence-supported fair study'},null,2),{flag:'wx'});json({directory,proposalHash:hash(proposal),maximumExposureMinor:proposal.maximumExposureMinor,providerRequests:0});store.close();
}
else if(command==='preflight'){json({root,implementationHash:portfolioImplementationHash(),signedGrantValid:Boolean(live),providerAccess:'not probed',credentialRead:false,providerRequests:0,accounting:live?.totals()??null,recovery:await engine.recover(),runnable:portfolio.snapshot().tasks.filter(t=>t.runnable).map(t=>t.id)});store.close();}
else if(command==='sign-proposal'){
 requireThat(!live,'SIGN_OFFLINE_ONLY');const path=resolve(flag('--proposal','')),proposal=JSON.parse(readFileSync(path,'utf8')),expected=flag('--approve-proposal-hash',''),reference=flag('--approval-reference','');requireThat(expected.length===64&&hash(proposal)===expected&&reference.length>0,'EXACT_OWNER_APPROVAL_REQUIRED');requireThat(proposal.portfolio.root===root&&proposal.approved===false&&proposal.portfolio.implementationHash===portfolioImplementationHash(),'PROPOSAL_STALE');requireThat(!existsSync(join(root,'portfolio.authorization.json')),'EXISTING_GRANT_PRESERVED');
 const publicKey=readFileSync(resolve(flag('--owner-public-key','')),'utf8'),key=readFileSync(resolve(flag('--owner-private-key','')),'utf8');const approvedBy=flag('--principal','Mason');proposal.operating.approvedBy=approvedBy;proposal.operating.approvalReference=reference;proposal.portfolio.approvedBy=approvedBy;proposal.portfolio.approvalReference=reference;proposal.portfolio.approved=true;proposal.portfolio.operatingGrantHash=hash(proposal.operating);const envelope={...signed(proposal.portfolio,key),operatingEnvelope:signed(proposal.operating,key)};
 loadLivePortfolio(root,store,{envelope,trustedPublicKey:publicKey,purpose:'sign'});retireContinuationParent(envelope.payload,publicKey);mkdirSync(join(root,'auth'),{recursive:true});if(existsSync(join(root,'auth','portfolio-owner.pub')))requireThat(readFileSync(join(root,'auth','portfolio-owner.pub'),'utf8')===publicKey,'SIGNING_PUBLIC_KEY_CHANGED');else writeFileSync(join(root,'auth','portfolio-owner.pub'),publicKey,{flag:'wx'});writeFileSync(join(root,'portfolio.authorization.json'),JSON.stringify(envelope,null,2),{flag:'wx'});json({signed:true,reference,providerRequests:0,credentialRead:false,parentExecutionRetired:Boolean(envelope.payload.continuation)});store.close();
}
else if(command==='backup'){const {backupPortfolio}=await import('./continuity.ts');json(backupPortfolio(store,{sourceRoot:root,backupRoot:resolve(flag('--backup',''))}));store.close();}
else if(command==='report'||command==='status'){const snapshot={...portfolioView(engine,tools),accounting:live?.totals()??null};if(command==='report'){mkdirSync(join(root,'reports'),{recursive:true});writeFileSync(join(root,'reports/portfolio.json'),JSON.stringify(snapshot,null,2));}json(snapshot);store.close();}
else throw Error('Commands: prepare; run --mock|--live [--task venture/task]; serve [--mock|--live]; recover; propose; preflight [--live]; sign-proposal; backup; restore; status; report. No provider route is implicit.');
