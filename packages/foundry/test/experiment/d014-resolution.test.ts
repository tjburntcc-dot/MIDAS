import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,rawHash} from '../../src/contracts.ts';
import {developmentCases,outputSchema} from '../../src/experiment/task.ts';
import {boundedRoute} from '../../src/experiment/bounded.ts';
import {clarifyCases} from '../../tools/prepare-synthetic-v3.mjs';
import {inspectRecordedRequest,prospectiveCases,refundDefinition} from '../../tools/resolve-d014.mjs';
test('offline exact-request reconstruction matches commitment and rejects different bytes without external boundaries',async()=>{
 const request={scope:{tenantId:'test',businessId:'business',runId:'run',dataPolicyVersion:'v1',mode:'fixture'},requestId:'A-test',task:'operate',context:{case:developmentCases()[0].input},tools:[],role:{model:'gpt-6-astra',procedure:'Test instructions only.'},limits:{maxCost:{minorUnits:52,currency:'USD'}}};
 const body={reasoning:{effort:'high'},service_tier:'default',model:'gpt-6-astra',input:canonical({task:request.task,context:request.context,tools:request.tools}),instructions:request.role.procedure,max_output_tokens:8192,store:false,text:{format:{type:'json_schema',name:'foundry_operate',strict:true,schema:outputSchema}}};
 const row={request,requestHash:rawHash(canonical(body))},r=await inspectRecordedRequest(row,boundedRoute);assert.deepEqual(r.body,body);await assert.rejects(inspectRecordedRequest({...row,requestHash:'changed'},boundedRoute),/RECORDED_BYTES_MISMATCH/);
});
test('prospective definition is visible for both conditions in every case, without changing historical inputs or labels',()=>{
 const v3=clarifyCases(developmentCases()),before=canonical(v3),v4=prospectiveCases(v3);assert.equal(canonical(v3),before);assert.equal(v4.length,18);
 for(let i=0;i<v4.length;i++){assert.ok(v4[i].input.sources[0].text.includes(refundDefinition));assert.match(v4[i].input.sources[0].text,/policy v4/);assert.deepEqual(v4[i].input.sources.slice(1),v3[i].input.sources.slice(1));assert.deepEqual(v4[i].checks,v3[i].checks);assert.equal(v4[i].id,v3[i].id);}
});
