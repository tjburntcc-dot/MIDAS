import { resolve, join } from 'node:path';
import { writeFileSync, readFileSync,existsSync,unlinkSync } from 'node:fs';
import { requireThat } from '../contracts.ts';
import { PilotService } from './service.ts';
import { servePilot } from './server.ts';
import { backupPilot, restorePilot } from './continuity.ts';
import { preparePilotAuthorization, loadAuthorizedPilot } from './authorized.ts';
import { preparePilotDiagnosisAuthorization, signPilotDiagnosisProposal, loadAuthorizedPilotDiagnosis } from './diagnosis-authorized.ts';
import { prepareIntelligenceAuthorization, signIntelligenceProposal, loadAuthorizedIntelligence } from './intelligence-authorized.ts';
import {runOutcomeJourneyCli} from './outcome-journey-cli.ts';
import {runConnectionHostCli} from './connections/cli.ts';

const args = process.argv.slice(2), command = args[0] ?? 'serve';
const option = (key: string, fallback = '') => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const processAlive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
requireThat(!args.includes('--live') && !args.includes('--credential') && !args.includes('--grant'), 'PILOT_CLI_HAS_NO_LIVE_AUTHORITY');
if(command==='connection'){
  await runConnectionHostCli(args.slice(1));
}else if(command==='journey'){
  await runOutcomeJourneyCli(args.slice(1));
} else if (command === 'restore') {
  requireThat(['--backup','--target','--hash'].every(x => args.includes(x)), 'RESTORE_EXPLICIT_INPUTS_REQUIRED');
  console.log(JSON.stringify(restorePilot(option('--backup'), option('--target'), option('--hash')), null, 2));
} else {
  const root = resolve(option('--root', 'var/overnight-product-034')), service = new PilotService(root,{publicReader:{kind:'public'}});
  if (command === 'serve') {
    await service.execution.recover();
    const app = servePilot({service, port: Number(option('--port','43145'))});
    const url=await app.ready,lease=join(root,'owner-service.json');
    writeFileSync(lease,JSON.stringify({pid:process.pid,root,url,startedAt:new Date().toISOString()})+'\n');
    console.log(JSON.stringify({url, root, release: '034', providerCallsAuthorized: service.authority().liveEnabled || service.journeyAuthority().liveEnabled, credentialAccessOnStartup: false, externalEffects: false, dataMode: 'website-first public retrieval; exact signed scope required for inference; fixtures only through explicit archive action'}));
    const close = async () => { await app.close();if(existsSync(lease)&&JSON.parse(readFileSync(lease,'utf8')).pid===process.pid)unlinkSync(lease);service.store.close(); process.exit(0); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
  } else {
    try {
      if (command === 'status') console.log(JSON.stringify(service.view(option('--business') || undefined), null, 2));
      else if (command === 'prepare-live') { requireThat(args.includes('--business'), 'BUSINESS_REQUIRED'); console.log(JSON.stringify(await service.prepareLive(option('--business')), null, 2)); }
      else if (command === 'propose-execution') {
        requireThat(args.includes('--config') && args.includes('--output'), 'EXACT_PILOT_CONFIGURATION_REQUIRED');
        const config=JSON.parse(readFileSync(resolve(option('--config')),'utf8'));
        const result=await preparePilotAuthorization(service.execution,{...config,root,directory:resolve(option('--output'))});
        console.log(JSON.stringify(result.summary,null,2));
      }
      else if(command==='propose-intelligence'){
        requireThat(args.includes('--config')&&args.includes('--output'),'EXACT_INTELLIGENCE_CONFIGURATION_REQUIRED');
        const config=JSON.parse(readFileSync(resolve(option('--config')),'utf8'));
        const result=prepareIntelligenceAuthorization({intelligence:service.intelligence,discovery:service.discovery},{...config,root,directory:resolve(option('--output'))});
        console.log(JSON.stringify(result.summary,null,2));
      }
      else if(command==='sign-intelligence'){
        requireThat(['--proposal','--approve-proposal-hash','--approval-reference','--owner-public-key','--owner-private-key','--principal'].every(x=>args.includes(x)),'EXACT_OWNER_APPROVAL_AND_PROTECTED_SIGNER_REQUIRED');
        const proposal=JSON.parse(readFileSync(resolve(option('--proposal')),'utf8'));
        const result=signIntelligenceProposal({intelligence:service.intelligence,discovery:service.discovery},root,{proposal,expectedHash:option('--approve-proposal-hash'),approvalReference:option('--approval-reference'),principal:option('--principal'),publicKey:readFileSync(resolve(option('--owner-public-key')),'utf8'),privateKey:readFileSync(resolve(option('--owner-private-key')),'utf8')});
        console.log(JSON.stringify({proposalHash:result.proposalHash,credentialRead:result.credentialRead,providerRequests:result.providerRequests},null,2));
      }
      else if(command==='run-intelligence-approved'){
        const live=loadAuthorizedIntelligence({intelligence:service.intelligence,discovery:service.discovery},root),businessId=live.authorization.intelligence.businessId;
        if(args.includes('--task')){
          const result=await live.runTask(option('--task'));
          console.log(JSON.stringify({result,accounting:live.totals()},null,2));
        }else{
          const discovery=await live.runInvestigation();
          if(discovery.state!=='ready_for_analysis')console.log(JSON.stringify({status:discovery.state,reason:discovery.reason,discovery,accounting:live.totals()},null,2));
          else{
            const analysis=await live.runAnalysis(),work:any[]=[];
            const selected=service.intelligence.rows('pilot-commercial-work').filter(w=>w.businessId===businessId&&w.analysisAttemptId===analysis.attemptId);
            requireThat(selected.length<=1,'INTELLIGENCE_SELECT_ONE_OPPORTUNITY_FOR_THIS_ENVELOPE');
            for(const item of selected){
              const campaign=await live.runTask(item.campaignTaskId);work.push(campaign);
              if((campaign as any)?.status!=='completed')break;
              service.intelligence.materialize(businessId);
              const current=service.store.get('pilot-commercial-work',item.campaignTaskId);
              if(current?.pageTaskId){const page=await live.runTask(current.pageTaskId);work.push(page);}
            }
            console.log(JSON.stringify({businessId,status:!selected.length?'waiting_for_owner_opportunity_selection':work.every(t=>t?.status==='completed')?'selected_work_completed':'execution_stopped',analysis:{status:analysis.status,executiveSummary:analysis.executiveSummary,opportunities:analysis.opportunities},work,accounting:live.totals(),nextAction:!selected.length?'Review the analysis in the owner workspace and select one supported opportunity; rerun this same command to execute its campaign and page.':'Inspect the actual artifacts and current checks in the owner workspace. No external effect or independent semantic acceptance is implied.'},null,2));
          }
        }
      }
      else if (command === 'propose-diagnosis') {
        requireThat(args.includes('--config') && args.includes('--output'), 'EXACT_PILOT_CONFIGURATION_REQUIRED');
        const config=JSON.parse(readFileSync(resolve(option('--config')),'utf8'));
        const result=preparePilotDiagnosisAuthorization(service.knowledge,{...config,root,directory:resolve(option('--output'))});
        console.log(JSON.stringify(result.summary,null,2));
      }
      else if (command === 'sign-diagnosis') {
        requireThat(['--proposal','--approve-proposal-hash','--approval-reference','--owner-public-key','--owner-private-key','--principal'].every(x=>args.includes(x)), 'EXACT_OWNER_APPROVAL_AND_PROTECTED_SIGNER_REQUIRED');
        const proposal=JSON.parse(readFileSync(resolve(option('--proposal')),'utf8'));
        const result=signPilotDiagnosisProposal(root,{proposal,expectedHash:option('--approve-proposal-hash'),approvalReference:option('--approval-reference'),principal:option('--principal'),
          publicKey:readFileSync(resolve(option('--owner-public-key')),'utf8'),privateKey:readFileSync(resolve(option('--owner-private-key')),'utf8'),knowledge:service.knowledge});
        console.log(JSON.stringify({proposalHash:result.proposalHash,grantHash:result.grantHash,credentialRead:result.credentialRead,providerRequests:result.providerRequests},null,2));
      }
      else if (command === 'run-diagnosis-approved') {
        const live=loadAuthorizedPilotDiagnosis(service.knowledge,root);
        const result=await live.run(); console.log(JSON.stringify({understanding:result.understanding,accounting:live.totals(),attemptId:result.attemptId},null,2));
      }
      else if (command === 'run-approved') {
        // Loading verifies exact signatures, scope, code, task/source/procedure bindings and expiry.
        // No CLI argument, model text or historical grant can supply approval instead.
        const live=loadAuthorizedPilot(service.execution,root);
        const result=args.includes('--task')?await live.run(option('--task')):await live.runAll();
        console.log(JSON.stringify({result,accounting:live.totals()},null,2));
      }
      else if (command === 'backup') {
        requireThat(args.includes('--output')&&args.includes('--confirm-stopped'), 'BACKUP_STOP_OWNER_SERVICE_AND_CONFIRM');
        const lease=join(root,'owner-service.json');requireThat(!existsSync(lease)||!processAlive(JSON.parse(readFileSync(lease,'utf8')).pid),'BACKUP_OWNER_SERVICE_STILL_RUNNING');
        console.log(JSON.stringify(backupPilot(service.store, option('--output'),{sourceRoot:root,quiescent:true}),null,2));
      }
      else if (command === 'demo') {
        const company = service.knowledge.createDemo(); await service.knowledge.diagnose(company.id);
        for (const workflow of ['response-packet','business-site'] as const) { const task = service.plan(company.id,workflow); await service.execution.run(company.id,task.id); }
        const report = service.exportBusiness(company.id); writeFileSync(join(root, 'offline-demonstration.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({businessId:company.id, report:join(root,'offline-demonstration.json'), providerCalls:0, provenance:'explicit offline fixtures; no owner acceptance fabricated'},null,2));
      } else throw Error('Unknown command. Use serve, status, demo, prepare-live, propose-intelligence, sign-intelligence, run-intelligence-approved, propose-diagnosis, sign-diagnosis, run-diagnosis-approved, propose-execution, run-approved, backup or restore.');
    } finally { service.store.close(); }
  }
}
