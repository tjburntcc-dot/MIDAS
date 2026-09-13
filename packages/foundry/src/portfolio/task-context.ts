import {requireThat} from '../contracts.ts';
/** A task may pin a current business brief without rewriting the venture or
 * historical requests. Authority, stage and economics remain controller-owned. */
export function taskBusinessContext(task:any,venture:any){
 const context=task.inputs?.businessContext;if(!context)return venture;
 requireThat(Object.keys(context).sort().join(',')==='goal,name,notes,website'&&typeof context.name==='string'&&context.name.length>0&&context.name.length<=160&&typeof context.goal==='string'&&context.goal.length>0&&context.goal.length<=4000&&typeof context.notes==='string'&&context.notes.length<=12000&&typeof context.website==='string'&&context.website.length<=2048,'TASK_BUSINESS_CONTEXT_INVALID');
 return {...venture,...context};
}
