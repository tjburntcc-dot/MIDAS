#!/usr/bin/env node
/** No key, credential, model or transport flags. Uses only existing signed runner factories. */
import {readFileSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from '../packages/foundry/src/contracts.ts';
import {ReleaseTrial,inspectTrialStage,releaseTrialTemplate,prepareTrialLineage} from '../packages/foundry/src/adaptive/trial.ts';

export const trialHelp={commands:['template','lineage --input ABSOLUTE_JSON','bind-chunk --root ABSOLUTE --manifest ABSOLUTE --manifest-hash SHA256 --input ABSOLUTE_JSON','inspect-stage --stage-root ABSOLUTE --runner pilot|outcome-journey|outcome [--arm ARM --lineage-hash SHA256]','preflight --root ABSOLUTE --manifest ABSOLUTE','status --root ABSOLUTE --manifest ABSOLUTE','run --root ABSOLUTE --manifest ABSOLUTE --manifest-hash SHA256 --stage ID','resume --root ABSOLUTE --manifest ABSOLUTE --manifest-hash SHA256 --stage ID'],authority:'No signing, credential, model, transport or hidden-case inputs. run/resume delegate to current existing signed runners only. A manifest is not authority. Missing configurations stop preflight. Order is fixed before execution.',recovery:'Only the persisted stage/runner is resumed; unknown effects retain the lease and are not replayed.',provenance:'Outputs report mechanical execution and accounting. Independent semantic acceptance remains unknown.'};
function requireValue(ok,code){if(!ok)throw Error(code);}
function parse(argv){const command=argv[0]??'help',args={};const allowed=new Set(['root','manifest','manifest-hash','stage','stage-root','runner','input','arm','lineage-hash']);for(let i=1;i<argv.length;i+=2){const key=argv[i]?.replace(/^--/,''),value=argv[i+1];requireValue(argv[i]?.startsWith('--')&&allowed.has(key)&&value&&!value.startsWith('--')&&!Object.hasOwn(args,key),'TRIAL_CLI_ARGUMENT');args[key]=value;}return {command,args};}
function absolute(value){requireValue(typeof value==='string'&&isAbsolute(value),'TRIAL_CLI_ABSOLUTE_PATH_REQUIRED');return resolve(value);}
export async function runAdaptiveTrialCli(argv=process.argv.slice(2),write=value=>console.log(JSON.stringify(value,null,2))){
 const {command,args}=parse(argv);
 if(command==='help'){requireValue(Object.keys(args).length===0,'TRIAL_CLI_ARGUMENT');write(trialHelp);return trialHelp;}
 if(command==='template'){requireValue(Object.keys(args).length===0,'TRIAL_CLI_ARGUMENT');const result=releaseTrialTemplate();write(result);return result;}
 if(command==='lineage'){requireValue(Object.keys(args).length===1&&typeof args.input==='string','TRIAL_CLI_ARGUMENT');const input=JSON.parse(readFileSync(absolute(args.input),'utf8'));requireValue(Object.keys(input).sort().join(',')==='arm,backupRoot,businessId,sourceRoot,targetRoot','TRIAL_CLI_LINEAGE_FIELDS');const result=prepareTrialLineage(input);write(result);return result;}
 if(command==='inspect-stage'){requireValue(['pilot','outcome-journey','outcome'].includes(args.runner)&&Object.keys(args).every(k=>['stage-root','runner','arm','lineage-hash'].includes(k)),'TRIAL_CLI_RUNNER_REQUIRED');const snapshot=inspectTrialStage({root:absolute(args['stage-root']),runner:args.runner,arm:args.arm,lineageHash:args['lineage-hash']??null});const result={bindingHash:hash(snapshot.binding),snapshot,providerRequests:0,credentialRead:false};write(result);return result;}
 requireValue(['preflight','status','run','resume','bind-chunk'].includes(command),'TRIAL_CLI_COMMAND');
 const active=['run','resume','bind-chunk'].includes(command);
 requireValue(Object.keys(args).every(k=>(active?['root','manifest','manifest-hash','stage','input']:['root','manifest']).includes(k)),'TRIAL_CLI_ARGUMENT');
 const manifest=JSON.parse(readFileSync(absolute(args.manifest),'utf8'));
 if(active)requireValue(args['manifest-hash']===hash(manifest)&&(command==='bind-chunk'||typeof args.stage==='string'),'TRIAL_CLI_EXACT_MANIFEST_REQUIRED');
 const trial=new ReleaseTrial(absolute(args.root),manifest);
 try{const result=command==='preflight'?trial.preflight():command==='status'?trial.inspect():command==='bind-chunk'?trial.bindChunk(JSON.parse(readFileSync(absolute(args.input),'utf8'))):await trial.run(args.stage,command);write(result);return result;}finally{trial.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runAdaptiveTrialCli().catch(e=>{console.error(JSON.stringify({error:e.code??e.message??'TRIAL_CLI_FAILED'}));process.exitCode=1;});
