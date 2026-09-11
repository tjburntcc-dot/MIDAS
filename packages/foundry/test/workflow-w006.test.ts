import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepare,runWorkflow,approve,approvalView,open,workflowScope} from '../src/workflow/runner.ts';
import {configFor} from '../src/workflow/config.ts';
import {captureCompletedParent,claimRecovery,w006RunId} from '../src/workflow/recovery.ts';
import {report} from '../src/workflow/report.ts';
import {scopeKey} from '../src/contracts.ts';

async function parent() {
 const base=mkdtempSync(join(tmpdir(),'w006-amendment-')),original=join(base,'original'),completed=join(base,'completed');
 prepare(original,'mock','value');await assert.rejects(runWorkflow(original,'W-001-single',{fault:'malformed'}));
 prepare(completed,'mock','recovery',original);await runWorkflow(completed,'W-001-single-r1');approve(completed,'W-001-single-r1',approvalView(completed,'W-001-single-r1').proposalHash,'fixture-demo');await runWorkflow(completed,'W-001-single-r1');return{base,completed};
}
test('W006 carries all five consumed admissions and one buffer, then independently reconciles one committed effect',async()=>{
 const {base,completed}=await parent(),root=join(base,'w006'),before=captureCompletedParent(completed,'mock');prepare(root,'mock','w006',completed);const c=configFor(root);
 assert.equal(c.link.priorAttempts,5);assert.equal(c.link.exposureMinor,764);assert.equal(c.limits.overheadReserve,undefined);assert.equal(c.limits.stages.smoke.attempts,4);
 await assert.rejects(runWorkflow(root,'W-001-single-r1'),/UNDECLARED_WORKFLOW/);await assert.rejects(runWorkflow(root,'W-006-team'),/UNDECLARED_WORKFLOW/);
 let state=await runWorkflow(root,w006RunId);assert.equal(state.checkpoint,'waiting_approval');assert.equal(state.callsUsed,3);
 const {store}=open(root);try{const run=store.get('run',scopeKey(workflowScope(w006RunId)));assert.match(JSON.stringify(run.snapshot.taskBrief.existingDraft),/refund approved|guaranteed tomorrow/i);assert.match(JSON.stringify(run.snapshot.taskBrief.artifactRules),/Never claim refund approval/);assert.doesNotMatch(JSON.stringify(run.proposal.payload.artifact),/guaranteed tomorrow|but refund approved/i);}finally{store.close();}
 approve(root,w006RunId,approvalView(root,w006RunId).proposalHash,'fixture-demo');state=await runWorkflow(root,w006RunId);assert.equal(state.checkpoint,'reconciling');assert.equal(state.callsUsed,3);assert.equal(state.pendingEffect,true);
 state=await runWorkflow(root,w006RunId);assert.equal(state.checkpoint,'completed');assert.equal(state.callsUsed,4);assert.equal(state.aggregateRemainingMinor,2028);
 const r=report(root),o=r.observations[0];assert.equal(o.effectCount,1);assert.equal(o.deterministicAccepted,true);assert.equal(r.accounting.combinedAttempts,9);assert.equal(r.accounting.combinedExposureMinor,972);assert.ok(o.failures.some(f=>f.category==='uncertain_external_effect'));
 await runWorkflow(root,w006RunId);assert.equal(report(root).allAttempts.length,4);assert.deepEqual(captureCompletedParent(completed,'mock'),before);
 claimRecovery(c);const other=join(base,'second');prepare(other,'mock','w006',completed);assert.throws(()=>claimRecovery(configFor(other)),/RECOVERY_AMENDMENT_ALREADY_BOUND/);
});
test('W006 refuses an incomplete parent and never replaces a failed child call',async()=>{
 const {base,completed}=await parent(),root=join(base,'w006');prepare(root,'mock','w006',completed);
 await assert.rejects(runWorkflow(root,w006RunId,{fault:'malformed'}));await assert.rejects(runWorkflow(root,w006RunId));assert.equal(report(root).allAttempts.length,1);
 const {store}=open(completed);try{const key=scopeKey(workflowScope('W-001-single-r1')),run=store.get('run',key);store.transaction(()=>store.put('run',key,{...run,phase:'waiting_approval'},run._version));}finally{store.close();}
 assert.throws(()=>captureCompletedParent(completed,'mock'),/W006_PARENT_NOT_COMPLETE/);
});
