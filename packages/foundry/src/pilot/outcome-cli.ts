/** Standalone entry point for the bounded outcome grant. It is intentionally
 * separate from the ordinary pilot CLI until an owner chooses to expose it. */
import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {requireThat} from '../contracts.ts';
import {PilotService} from './service.ts';
import {loadAuthorizedOutcome,outcomeAuthorizationFiles,prepareOutcomeAuthorization,signOutcomeProposal} from './outcome-authorized.ts';

type Service={operatingOutcomes:any;store:{close:()=>void}};
type Dependencies={service?:Service;loadAuthorized?:(services:{outcomes:any},root:string)=>any;write?:(value:any)=>void};
type Args=Record<string,string>;
const allowed=new Set(['root','outcome','id','project','credential-file','expires-at','count-reserve','mode','output','proposal','approve-proposal-hash','approval-reference','owner-public-key','owner-private-key','principal','action']);

function parse(argv:string[]){
 const command=argv[0]??'help',args:Args={};
 for(let i=1;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];requireThat(typeof key==='string'&&key.startsWith('--')&&typeof value==='string'&&!value.startsWith('--'),'OUTCOME_CLI_ARGUMENT');const name=key.slice(2);requireThat(allowed.has(name)&&!Object.hasOwn(args,name),'OUTCOME_CLI_ARGUMENT');args[name]=value;}
 return {command,args};
}
function required(args:Args,...names:string[]){for(const name of names)requireThat(typeof args[name]==='string'&&args[name].length>0,'OUTCOME_CLI_'+name.toUpperCase().replace(/-/g,'_')+'_REQUIRED');}
function absolute(value:string,code:string){requireThat(isAbsolute(value),code);return resolve(value);}
function number(value:string,code:string){const n=Number(value);requireThat(Number.isSafeInteger(n)&&n>0,code);return n;}
function help(){return {commands:['prepare --root --outcome --id --project --expires-at --count-reserve --output --mode live|mock [--credential-file]','sign --root --proposal --approve-proposal-hash --principal --approval-reference --owner-public-key --owner-private-key','run --root','resume --root','status --root','control --root --action pause|resume|cancel'],authority:'Preparation is unsigned. Signing requires exact owner approval evidence. Run/resume load only a signed current grant; there is no --live, ambient credential, plaintext proposal, or fixture fallback argument.',files:outcomeAuthorizationFiles};}

export async function outcomeCliMain(argv=process.argv.slice(2),dependencies:Dependencies={}){
 const {command,args}=parse(argv),write=dependencies.write??(value=>console.log(JSON.stringify(value,null,2)));
 if(command==='help'){write(help());return help();}
 required(args,'root');const root=absolute(args.root,'OUTCOME_CLI_ROOT_ABSOLUTE_REQUIRED');
 const service=dependencies.service??new PilotService(root,{publicReader:{kind:'public'}}),ownsService=!dependencies.service;
 try{
  const outcomes=service.operatingOutcomes,services={outcomes};
  if(command==='prepare'){
   required(args,'outcome','id','project','expires-at','count-reserve','output','mode');requireThat(['live','mock'].includes(args.mode),'OUTCOME_CLI_MODE_REQUIRED');
   const credential=args['credential-file']===undefined?null:absolute(args['credential-file'],'OUTCOME_CLI_CREDENTIAL_ABSOLUTE_REQUIRED');requireThat(args.mode==='mock'||credential!==null,'OUTCOME_CLI_LIVE_CREDENTIAL_REQUIRED');
   const result=prepareOutcomeAuthorization(services,{root,directory:absolute(args.output,'OUTCOME_CLI_OUTPUT_ABSOLUTE_REQUIRED'),id:args.id,outcomeId:args.outcome,projectId:args.project,credentialFile:credential,expiresAt:args['expires-at'],countUncertaintyMinor:number(args['count-reserve'],'OUTCOME_CLI_COUNT_RESERVE_REQUIRED'),mode:args.mode as 'live'|'mock'});
   const value={command,proposalHash:result.proposalHash,summary:result.summary,providerRequests:0,credentialRead:false};write(value);return value;
  }
  if(command==='sign'){
   required(args,'proposal','approve-proposal-hash','principal','approval-reference','owner-public-key','owner-private-key');
   const proposalPath=absolute(args.proposal,'OUTCOME_CLI_PROPOSAL_ABSOLUTE_REQUIRED'),publicKeyPath=absolute(args['owner-public-key'],'OUTCOME_CLI_OWNER_PUBLIC_KEY_ABSOLUTE_REQUIRED'),privateKeyPath=absolute(args['owner-private-key'],'OUTCOME_CLI_OWNER_PRIVATE_KEY_ABSOLUTE_REQUIRED');
   requireThat(existsSync(proposalPath)&&existsSync(publicKeyPath)&&existsSync(privateKeyPath),'OUTCOME_CLI_SIGNING_FILE_REQUIRED');
   const result=signOutcomeProposal(services,root,{proposal:JSON.parse(readFileSync(proposalPath,'utf8')),expectedHash:args['approve-proposal-hash'],principal:args.principal,approvalReference:args['approval-reference'],publicKey:readFileSync(publicKeyPath,'utf8'),privateKey:readFileSync(privateKeyPath,'utf8')});
   const value={command,proposalHash:result.proposalHash,credentialRead:false,providerRequests:0,authorizationFile:outcomeAuthorizationFiles.authorization};write(value);return value;
  }
  if(command==='status'){
   required(args,'outcome');const value={command,outcome:outcomes.view(args.outcome),authorizationInstalled:existsSync(resolve(root,outcomeAuthorizationFiles.authorization)),providerRequests:0,credentialRead:false};write(value);return value;
  }
  if(command==='control'){
   required(args,'action','outcome');requireThat(['pause','resume','cancel'].includes(args.action),'OUTCOME_CLI_CONTROL_REQUIRED');
   const runner=(dependencies.loadAuthorized??loadAuthorizedOutcome)(services,root),outcome=runner.control(args.action);const value={command,outcome,accounting:runner.totals(),providerRequests:runner.totals().providerRequests};write(value);return value;
  }
  if(command==='run'||command==='resume'){
   const runner=(dependencies.loadAuthorized??loadAuthorizedOutcome)(services,root),planned=await runner.plan(),outcome=planned.plan?.decision==='prepare'?await runner.run():planned;
   const value={command,outcome,accounting:runner.totals(),sameIdRecoveryOnly:true,nextAction:outcome.state==='completed'?'Inspect current local artifacts and record owner feedback separately.':outcome.state==='rejected'?'Review the persisted rejection and owner alternatives.':outcome.state==='blocked'?'Inspect the retained terminal/unknown state or provide an owner correction within the signed reserve.':'Resume this command only after the persisted outcome has a runnable task or owner action.'};write(value);return value;
  }
  requireThat(false,'OUTCOME_CLI_COMMAND');
 }finally{if(ownsService)service.store.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)outcomeCliMain().catch(error=>{console.error(JSON.stringify({error:error.code??'OUTCOME_CLI_FAILED',message:error.message}));process.exitCode=1;});
