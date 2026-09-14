import {object, requireThat} from '../contracts.ts';
import type {Task} from '../portfolio/contracts.ts';
import {workerSchema, validateWorker, FINALIZING_WORKER_PROCEDURE} from '../portfolio/worker.ts';
import {LEAN_WORKER_PROCEDURE} from './lean-worker.ts';

export const ADAPTIVE_TOOL='adaptive.perform';
export const ADAPTIVE_VERSION='adaptive-project-v1';
/** Opt-in per immutable task definition. No historical schema, procedure or grant changes. */
export function adaptiveEnabled(task:Task):boolean {
 const configuration=(task.inputs as any)?.adaptiveExecution;
 if(!configuration)return false;
 requireThat(typeof configuration.allowCommands==='boolean','ADAPTIVE_COMMAND_PERMISSION_INVALID');
 requireThat(configuration.version===ADAPTIVE_VERSION&&['baseline','lean'].includes(configuration.prompt),'ADAPTIVE_CONFIGURATION_INVALID');
 requireThat(!(task.inputs as any)?.stageContract&&!['portfolio.plan','portfolio.reassess'].includes(task.capability),'ADAPTIVE_TASK_PROFILE_REQUIRED');
 requireThat(task.allowedTools.includes(ADAPTIVE_TOOL),'ADAPTIVE_TOOL_REQUIRED');
 requireThat(task.effectAuthority?.kind==='local','ADAPTIVE_LOCAL_AUTHORITY_REQUIRED');
 return true;
}
export const ADAPTIVE_INSTRUCTIONS=`The adaptive.perform tool opens a task-scoped disposable workbench alongside the authoritative delivery workspace. Its payload is a JSON object; inspect the tool contract for actions and arguments. Discover methods and dependencies when useful, build and test within the stated executor authority, retain real failure observations, and return to the parent objective. Workbench files are not automatically published artifacts. Produce the original required deliverable through workspace tools and review the actual required checks. Acquired packages, self-written tests and retained skill candidates do not establish independent review or transfer. A blocked executor does not permit host execution or another business's files. A tool failure is feedback: select a supported alternative when one exists; do not repeat uncertain effects.`;
export function adaptiveProcedure(task:Task):string|null {
 if(!adaptiveEnabled(task))return null;
 return ((task.inputs as any).adaptiveExecution.prompt==='lean'?LEAN_WORKER_PROCEDURE:FINALIZING_WORKER_PROCEDURE)+'\n'+ADAPTIVE_INSTRUCTIONS;
}
export function adaptiveWorkerSchema(task:Task):any|null {
 if(!adaptiveEnabled(task))return null;
 const schema:any=structuredClone(workerSchema);
 schema.properties.toolCall.anyOf.push({type:'object',additionalProperties:false,required:['name','arguments'],properties:{name:{type:'string',enum:[ADAPTIVE_TOOL]},arguments:{type:'object',additionalProperties:false,required:['payload'],properties:{payload:{type:'string',minLength:2,maxLength:32000,description:'One JSON object using the advertised adaptive action contract.'}}}}});
 return schema;
}
export function validateAdaptiveWorker(task:Task,out:any):void {
 requireThat(adaptiveEnabled(task),'ADAPTIVE_NOT_ENABLED');
 if(out?.toolCall?.name!==ADAPTIVE_TOOL){validateWorker(out);return;}
 object(out,['action','reason','toolCall']);object(out.toolCall,['name','arguments']);object(out.toolCall.arguments,['payload']);
 requireThat(out.action==='tool'&&typeof out.reason==='string'&&out.reason.trim().length>0&&out.reason.length<=2000,'ADAPTIVE_DECISION_INVALID');
 const payload=out.toolCall.arguments.payload;
 requireThat(typeof payload==='string'&&payload.length<=32000,'ADAPTIVE_PAYLOAD_BOUND');
 const value=JSON.parse(payload);requireThat(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.action==='string','ADAPTIVE_ACTION_REQUIRED');
}
