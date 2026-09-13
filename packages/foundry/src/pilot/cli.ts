import { resolve, join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { requireThat } from '../contracts.ts';
import { PilotService } from './service.ts';
import { servePilot } from './server.ts';
import { backupPilot, restorePilot } from './continuity.ts';
import { preparePilotAuthorization, loadAuthorizedPilot } from './authorized.ts';
import { preparePilotDiagnosisAuthorization, signPilotDiagnosisProposal, loadAuthorizedPilotDiagnosis } from './diagnosis-authorized.ts';

const args = process.argv.slice(2), command = args[0] ?? 'serve';
const option = (key: string, fallback = '') => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
requireThat(!args.includes('--live') && !args.includes('--credential') && !args.includes('--grant'), 'PILOT_CLI_HAS_NO_LIVE_AUTHORITY');
if (command === 'restore') {
  requireThat(['--backup','--target','--hash'].every(x => args.includes(x)), 'RESTORE_EXPLICIT_INPUTS_REQUIRED');
  console.log(JSON.stringify(restorePilot(option('--backup'), option('--target'), option('--hash')), null, 2));
} else {
  const root = resolve(option('--root', 'var/owner-pilot-032')), service = new PilotService(root);
  if (command === 'serve') {
    await service.execution.recover();
    const app = servePilot({service, port: Number(option('--port','43143'))});
    console.log(JSON.stringify({url: await app.ready, root, release: '032', providerCallsAuthorized: false, credentialAccess: false, externalEffects: false, dataMode: 'real company onboarding; fixtures only through explicit demo action'}));
    const close = async () => { await app.close(); service.store.close(); process.exit(0); };
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
      else if (command === 'backup') { requireThat(args.includes('--output'), 'BACKUP_OUTPUT_REQUIRED'); console.log(JSON.stringify(backupPilot(service.store, option('--output')), null, 2)); }
      else if (command === 'demo') {
        const company = service.knowledge.createDemo(); await service.knowledge.diagnose(company.id);
        for (const workflow of ['response-packet','business-site'] as const) { const task = service.plan(company.id,workflow); await service.execution.run(company.id,task.id); }
        const report = service.exportBusiness(company.id); writeFileSync(join(root, 'offline-demonstration.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({businessId:company.id, report:join(root,'offline-demonstration.json'), providerCalls:0, provenance:'explicit offline fixtures; no owner acceptance fabricated'},null,2));
      } else throw Error('Unknown command. Use serve, status, demo, prepare-live, propose-diagnosis, sign-diagnosis, run-diagnosis-approved, propose-execution, run-approved, backup or restore.');
    } finally { service.store.close(); }
  }
}
