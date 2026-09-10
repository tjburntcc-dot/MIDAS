import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { StateStore } from './state.ts';
import { Authority } from './authority.ts';
import { RunController } from './runtime.ts';
import { LearningService } from './learning.ts';
import { createSupportEnvironment, fixtureManifest } from './lab/support.ts';
import { createFixtureModel } from './lab/model-fixture.ts';
import { FixtureService, FixtureHttpPort } from './lab/fixture-service.ts';
import { exportReport, report } from './reporting.ts';
import { identifier, object, requireThat } from './contracts.ts';

function parse(argv:string[]) {
  const command=argv[0] ?? 'help', args:Record<string,string>={};
  for(let i=1;i<argv.length;i+=2){requireThat(argv[i].startsWith('--') && typeof argv[i+1]==='string' && !argv[i+1].startsWith('--'),'INVALID_ARGUMENT');const k=argv[i].slice(2);requireThat(!Object.hasOwn(args,k),'DUPLICATE_ARGUMENT');args[k]=argv[i+1];}
  object(args,[],['root','tenant','business','run','scenario','principal','token-file','cap','model','mode','checkpoint','service-url','service-token-file','fault','proposal','candidate','case','review-minutes','expires-at']);return {command,args};
}
export async function main(argv=process.argv.slice(2)) {
  const {command,args}=parse(argv);
  if(command==='help'){console.log('Foundry fixture lab: setup | run | inspect | approve | revoke | resume | cancel | report | learn | evaluate | decide | rollback. Use --root <isolated lab directory>. Authentication requires --principal and --token-file. No live route is enabled.');return;}
  const root=resolve(args.root ?? 'var/foundry-lab-027'),marker=join(root,'foundry-lab.json');
  if(command==='setup') {
    requireThat(!existsSync(marker),'LAB_ALREADY_EXISTS');
    requireThat(!existsSync(root) || readdirSync(root).length===0,'LAB_DIRECTORY_NOT_EMPTY');mkdirSync(join(root,'auth'),{recursive:true});
    const config={schemaVersion:'1',tenantId:args.tenant ?? 'lab-a',businessId:args.business ?? 'support-a',dataPolicyVersion:'lab-policy-v1',mode:'fixture'};
    identifier(config.tenantId);identifier(config.businessId);
    const store=new StateStore(join(root,'domain.sqlite')),auth=new Authority(store);
    try {
      for(const [id,permissions] of [['fixture-owner',['read','operate','approve','promote','admin']],['fixture-worker',['read','operate']],['fixture-evaluator',['read','evaluate']]] as [string,string[]][]) {
        const token=auth.enroll(id,config.tenantId,config.businessId,permissions);writeFileSync(join(root,'auth',id+'.credential'),token,{flag:'wx',mode:0o600});
      }
      writeFileSync(join(root,'auth','service.credential'),randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
      writeFileSync(marker,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
      console.log(JSON.stringify({status:'ready',root,principals:['fixture-owner','fixture-worker','fixture-evaluator'],fixtureManifest},null,2));
    } finally {store.close();}return;
  }
  requireThat(existsSync(marker),'LAB_SETUP_REQUIRED');const config=JSON.parse(readFileSync(marker,'utf8'));
  requireThat(args.principal && args['token-file'],'AUTHENTICATION_REQUIRED');
  const store=new StateStore(join(root,'domain.sqlite')),auth=new Authority(store),runtime=new RunController(store),learning=new LearningService(store);
  let service:FixtureService|null=null;
  try {
    const principal=auth.authenticate(args.principal,readFileSync(resolve(args['token-file']),'utf8').trim());
    const runId=args.run; if(command!=='run')requireThat(runId,'RUN_ID_REQUIRED');
    const s={...config,runId:runId ?? ''};delete (s as any).schemaVersion;
    let result:any;
    if(command==='run' || command==='resume') {
      requireThat(!args.model || args.model==='fixture','LIVE_EXECUTION_NOT_AUTHORIZED');requireThat(!args.mode || args.mode==='fixture','FIXTURE_MODE_REQUIRED');
      let scenario=args.scenario ?? 'viable';
      if(command==='resume'){const existing=runtime.inspect(principal,s);scenario=existing.environment.id.replace('support-lab-','');}
      requireThat(['viable','rejection','missing','conflict'].includes(scenario),'UNKNOWN_SCENARIO');
      const environment=createSupportEnvironment(scenario as any),model=createFixtureModel(scenario as any);
      const run=command==='run'?runtime.create(principal,environment,{...(runId?{runId}:{}),cap:{minorUnits:Number(args.cap ?? 100),currency:'USD'}}):runtime.inspect(principal,s);
      const actions=args['service-url']?new FixtureHttpPort(args['service-url'],readFileSync(resolve(args['service-token-file'] ?? join(root,'auth','service.credential')),'utf8').trim()):(service=new FixtureService(join(root,'service.sqlite'),args.fault));
      result=await runtime.advance(principal,run.scope,environment,model,actions,{checkpoint:args.checkpoint});
      console.log(JSON.stringify({runId:result.scope.runId,phase:result.phase,proposal:result.proposal,learning:result.learning},null,2));return;
    }
    const run=runtime.inspect(principal,s);
    if(command==='inspect')result=run;
    else if(command==='approve'){requireThat(run.phase==='waiting_approval' && run.proposal,'NO_PENDING_APPROVAL');requireThat(args.proposal===run.proposal.id,'EXACT_PROPOSAL_REQUIRED');result=auth.approve(s,principal,run.proposal,{reviewMinutes:Number(args['review-minutes'] ?? 2),...(args['expires-at']?{expiresAt:args['expires-at']}:{})});}
    else if(command==='revoke'){requireThat(args.proposal,'EXACT_PROPOSAL_REQUIRED');result=auth.revoke(s,principal,args.proposal) ?? {revoked:true};}
    else if(command==='cancel')result=runtime.cancel(principal,s);
    else if(command==='learn')result=learning.propose(s,principal,{source:'synthetic_fixture',outcome:run.outcome ?? run.decision});
    else if(command==='evaluate'){requireThat(args.candidate,'CANDIDATE_ID_REQUIRED');result=learning.evaluate(s,principal,args.candidate,(args.case ?? 'inconclusive') as any);}
    else if(command==='decide'){requireThat(args.candidate,'CANDIDATE_ID_REQUIRED');result=learning.decide(s,principal,args.candidate);if(run.learning?.candidateId===args.candidate)runtime.update(s,run._version,{phase:'completed',learning:{candidateId:args.candidate,status:'decided',decision:result.outcome}},'learning_completed',{decision:result.outcome});}
    else if(command==='rollback')result=learning.rollback(s,principal);
    else if(command==='report')result=exportReport(store,principal,s,join(root,'reports',s.tenantId,s.businessId,s.runId));
    else throw new Error('Unknown command');
    console.log(JSON.stringify(result,null,2));
  } finally {service?.close();store.close();}
}
main().catch(error=>{console.error(JSON.stringify({error:error.code ?? 'COMMAND_FAILED',message:error.message}));process.exitCode=1;});
