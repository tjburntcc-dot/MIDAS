import test from 'node:test';
import assert from 'node:assert/strict';
import {episodes,environmentFor,mockOutput,schemaForTask,validateWorkflowOutput,teamProposal} from '../src/workflow/task.ts';

function observed(id:string){const env=environmentFor(id),snapshot=env.snapshot(),investigate=mockOutput({task:'investigate',context:{snapshot,evidence:[]}}),evidence=env.evidenceRequests!(investigate).map(r=>env.getEvidence(r)),decision=mockOutput({task:'decide',context:{snapshot,evidence}});return {env,snapshot,evidence,decision};}
test('all six MOCK decisions derive from retrieved public facts and independent adapter accepts them',()=>{
 for(const ep of episodes){const {env,snapshot,evidence,decision}=observed(ep.id);assert.equal(decision.status,ep.expected.decision);assert.equal(decision.chosenOptionId,ep.expected.choice);assert.equal(env.validateDecision(snapshot,evidence,decision).ok,true);assert.equal(JSON.stringify(snapshot).includes('expected'),false);assert.equal(Object.hasOwn(snapshot,'seeding'),false);assert.equal(snapshot.taskBrief.artifactRules.some((x:string)=>x.includes('demand to say refund approved')),true);}
});
test('changing visible cost changes mock decision without case-ID selection',()=>{
 const {snapshot,evidence}=observed('W-001');for(const r of evidence)if(r.status==='provided'&&r.requested.variable==='cost_per_case')for(const e of r.evidence)e.value=999;const changed=mockOutput({task:'decide',context:{snapshot,evidence}});assert.equal(changed.status,'rejected');
});
test('seeded defect is genuinely presented then corrected before publication',()=>{
 const {env,snapshot,evidence,decision}=observed('W-006');assert.match(decision.draft.artifact.steps.join(' '),/guaranteed tomorrow/);const reviewed=mockOutput({task:'operate',context:{snapshot,evidence,decision,draft:decision.draft}});assert.equal(reviewed.review.issues.length,1);assert.doesNotMatch(reviewed.artifact.steps.join(' '),/guaranteed tomorrow/);const action=env.actionFor(reviewed);assert.equal(action.toolId,'lab.publish');const blocked=structuredClone(reviewed);blocked.review.verdict='blocked';assert.throws(()=>env.actionFor(blocked),/WORKFLOW_REVIEW_BLOCKED/);
});
test('review requires actual proposal; inspection cannot assert success from draft alone',()=>{
 const {snapshot,evidence,decision}=observed('W-001');assert.throws(()=>mockOutput({task:'operate',context:{snapshot,evidence}}),/WORKFLOW_REVIEW_INPUT_MISSING/);const inspection=mockOutput({task:'verify',context:{snapshot,evidence,artifact:decision.draft.artifact}});assert.equal(inspection.status,'fail');const unknown=mockOutput({task:'verify',context:{snapshot,evidence,artifact:decision.draft.artifact,receipt:{status:'unknown'},observation:{status:'unknown'}}});assert.equal(unknown.status,'unknown');
});
test('strict contracts reject unsupported keys, unsafe money, malformed output and unsupported tasks',()=>{
 const {decision}=observed('W-001');validateWorkflowOutput('decide',decision);const extra={...decision,secret:'x'};assert.throws(()=>validateWorkflowOutput('decide',extra),/WORKFLOW_OUTPUT_INVALID/);const unsafe=structuredClone(decision);unsafe.alternatives[0].cost.minorUnits=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>validateWorkflowOutput('decide',unsafe),/WORKFLOW_OUTPUT_INVALID/);assert.throws(()=>validateWorkflowOutput('verify',{kind:'inspection',status:'pass',findings:[],evidenceIds:[],approval:true}),/WORKFLOW_OUTPUT_INVALID/);assert.throws(()=>schemaForTask('optimizer'),/WORKFLOW_TASK_UNSUPPORTED/);for(const name of ['investigate','decide','operate','verify'])assert.equal(schemaForTask(name).additionalProperties,false);
});
test('stale evidence and fabricated economics fail independent decision validation',()=>{
 const {env,snapshot,evidence,decision}=observed('W-001');const stale=structuredClone(evidence);for(const r of stale)if(r.status==='provided')r.evidence[0].observedAt='2020-01-01T00:00:00Z';assert.equal(env.validateDecision(snapshot,stale,decision).ok,false);const fabricated=structuredClone(decision);fabricated.alternatives[0].contribution.minorUnits=500;assert.equal(env.validateDecision(snapshot,evidence,fabricated).ok,false);
});
test('proposal is separate deterministic unknown-qualified recommendation; fixed team has two calls per role',()=>{
 const snapshot=environmentFor('W-001').snapshot(),single=teamProposal(snapshot,'single'),team=teamProposal(snapshot,'team');assert.equal(single.changesComparisonAssignment,false);assert.equal(team.eligibleWorkers.every(w=>w.qualification.includes('unknown')),true);assert.deepEqual(team.callAssignment,{investigate:'workflow-owner',decide:'workflow-owner',operate:'outcome-verifier',verify:'outcome-verifier'});assert.equal(single.selectedWorkers.length,1);assert.equal(team.selectedWorkers.length,2);assert.equal(team.adaptiveRecommendation,single.adaptiveRecommendation);
});
