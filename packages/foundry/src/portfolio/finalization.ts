import {sourceHandoff} from './source-handoff.ts';
export const FINALIZATION_PROTOCOL='bounded-finalize-v1';
export function finalizationEnabled(task:any){return task.inputs?.executionProtocol===FINALIZATION_PROTOCOL;}
/** A lower bound, not a promise that the worker will solve the task. No model or
 * browser is run here. Known failed/blank source needs a write; software also
 * needs actual current browser feedback before the worker submits its review. */
export function finishingFeasibility(task:any,w:any,remaining:number,localRemaining:number,observed:{checkSeen:boolean;publicationSeen:boolean}={checkSeen:false,publicationSeen:false}){
 const currentChecks=w?.checkedManifest===w?.manifest?.sha256&&Array.isArray(w?.checks)&&w.checks.length>0;
 const passed=currentChecks&&w.checks.every((c:any)=>c.passed);
 const blank=Boolean(w&&(w.provenance?.startsWith('Controller-created blank')&&w.manifest.revision===1||w.files?.length===1&&w.files[0].content.trim()==='{}'));
 const writeRequired=Boolean(w&&(!sourceHandoff(w,Boolean(task.inputs?.sourceBindings)).accepted||blank||currentChecks&&!passed));
 const software=w?.kind==='software',checkRequired=!passed||!observed.checkSeen;
 const minimumCalls=writeRequired?(software?3:2):software&&checkRequired?2:1;
 const minimumLocalTools=(writeRequired?1:0)+(checkRequired||writeRequired?1:0)+(w?.published?.manifestHash===w?.manifest?.sha256&&!writeRequired&&observed.publicationSeen?0:1);
 return {protocol:FINALIZATION_PROTOCOL,remainingCalls:remaining,remainingLocalTools:localRemaining,minimumCalls,minimumLocalTools,
  feasible:remaining>=minimumCalls&&localRemaining>=minimumLocalTools,writeRequired,checkRequired,
  finishingActions:software?['repair if necessary','observe current browser/check evidence','model submits substantive current-source review','bounded check/publication/readback/closure']:['repair if necessary','model submits current-source recommendation and limitations','bounded check/publication/readback/closure'],
  meaning:'Minimum capacity for the current known state; no borrowed allowances, guaranteed model success or independent semantic acceptance.'};
}
