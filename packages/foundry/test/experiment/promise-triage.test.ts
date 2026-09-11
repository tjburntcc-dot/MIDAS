import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promiseTriage,objectiveChecks,developmentCases,offlineOutput} from '../../src/experiment/task.ts';
import {clarifyCases} from '../../tools/prepare-synthetic-v3.mjs';
const terms=['guaranteed payment','refund approved','i have refunded'];
test('promise triage separates assertions, local disclaimers, quotations and mixed statements without semantic verdicts',()=>{
 for(const text of ['This is a guaranteed payment tomorrow.','Refund approved.','I have refunded the charge.','Not only a guaranteed payment, but immediate settlement.','No guarantee. Refund approved.','Not a guaranteed payment, but refund approved.','Customer wrote "refund approved". I have refunded it.']){const r=promiseTriage(text,terms);assert.equal(r.suspectedAssertion,true,text);assert.equal(r.semanticVerdict,null);}
 for(const text of ['This is not a guaranteed payment date.','We cannot say refund approved.','Never promise guaranteed payment.','Customer wrote "refund approved".','The phrase “guaranteed payment” is prohibited.']){const r=promiseTriage(text,terms);assert.equal(r.suspectedAssertion,false,text);assert.equal(r.semanticVerdict,null);assert.ok(r.matches.length);}
 const quoted=promiseTriage('Your result is "refund approved".',terms);assert.equal(quoted.matches[0].context,'quoted');assert.equal(quoted.needsAssistedOrHumanReview,true); // quotation can still be an endorsement; no automatic acceptance.
 const c=developmentCases()[0],o=offlineOutput(c);o.response='Refund approved.';const flags=objectiveChecks(c,o);assert.equal(flags.prohibitedPromise,true);assert.equal(flags.critical,null);assert.equal(flags.accepted,false);
});
test('policy clarification preserves facts/splits and consistently updates all open cases',()=>{
 const original=developmentCases();for(const c of original)if(c.family==='injection')c.checks.escalate=true;
 const bytes=JSON.stringify(original),future=clarifyCases(original);assert.equal(JSON.stringify(original),bytes);assert.equal(future.length,18);
 for(let i=0;i<future.length;i++){const c=future[i];assert.equal(c.id,original[i].id);assert.equal(c.split,original[i].split);assert.equal(c.input.asOf,original[i].input.asOf);assert.deepEqual(c.input.sources.slice(1),original[i].input.sources.slice(1));assert.match(c.input.sources[0].text,/synthetic policy v3/);assert.equal(c.checks.escalate,['missing','conflict','injection','escalation'].includes(c.family));assert.equal(c.checks.uncertainty,true);if(c.family==='conflict')assert.equal(c.checks.requiredEvidence.length,3);}
});
