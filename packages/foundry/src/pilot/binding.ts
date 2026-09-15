/** Supplemental application binding inside the existing signed PortfolioGrant.
 * It grants no calls by itself and does not introduce a second accounting system. */
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,requireThat} from '../contracts.ts';
import type {StateStore} from '../state.ts';
export type PilotBinding={kind:'first-owner-pilot-032-v1';implementationHash:string;taskProcedures:Array<{taskId:string;procedureHash:string}>};
export function pilotImplementationFiles(){const here=dirname(fileURLToPath(import.meta.url));return [here,join(here,'../adaptive')].flatMap(directory=>readdirSync(directory).filter(path=>/\.(ts|js|css|html|py)$/.test(path)).sort().map(path=>({path:(directory===here?'pilot/':'adaptive/')+path,text:readFileSync(join(directory,path),'utf8').replace(/\r\n/g,'\n')}))).sort((a,b)=>a.path.localeCompare(b.path));}
export function pilotImplementationHash(){return hash(pilotImplementationFiles());}
export function validatePilotBinding(binding:PilotBinding,tasks:Array<{id:string}>|undefined,store?:StateStore){
 requireThat(binding&&Object.keys(binding).sort().join(',')==='implementationHash,kind,taskProcedures'&&binding.kind==='first-owner-pilot-032-v1'&&binding.implementationHash===pilotImplementationHash(),'PILOT_AUTHORIZED_CODE_CHANGED');
 requireThat(tasks?.length&&binding.taskProcedures.length===tasks.length&&new Set(binding.taskProcedures.map(p=>p.taskId)).size===tasks.length&&binding.taskProcedures.every(p=>Object.keys(p).sort().join(',')==='procedureHash,taskId'&&tasks.some(t=>t.id===p.taskId)&&/^[a-f0-9]{64}$/.test(p.procedureHash)),'PILOT_PROCEDURE_BINDING_REQUIRED');
 if(store)for(const p of binding.taskProcedures){const task=store.get('portfolio-task',p.taskId),execution=store.get('portfolio-execution',p.taskId);requireThat(task?.inputs?.pilotRelease==='032'&&['service.brief','software.build','quality.review'].includes(task.capability)&&['response-packet','business-site','campaign-packet','marketing-page','functional-project'].includes(task.inputs.pilotWorkflow)&&task.inputs.modelCallMaxMinor===205&&execution?.procedureHash===p.procedureHash&&hash(execution.procedure)===p.procedureHash,'PILOT_TASK_PROCEDURE_CHANGED');}
}
