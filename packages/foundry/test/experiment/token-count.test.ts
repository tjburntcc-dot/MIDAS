import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countPayload,countTokens,sanitizeCountResponse,TOKEN_COUNT_ENDPOINT,assertCountableRequest} from '../../src/experiment/token-count.ts';
import {canonical} from '../../src/contracts.ts';
const body={model:'gpt-5.6-sol',input:'authorized synthetic input',instructions:'operator instructions',reasoning:{effort:'medium'},text:{format:{type:'json_schema',name:'test',schema:{type:'object',additionalProperties:false}}},max_output_tokens:4096,service_tier:'default',store:false};
test('count projection preserves input, instructions, reasoning and schema; generation fields omitted, unknown inputs fail closed',()=>{const p=countPayload(body);assert.deepEqual(Object.keys(p),['model','input','instructions','reasoning','text']);assert.deepEqual(p.text,body.text);assert.throws(()=>countPayload({...body,new_input_type:'unaccounted'}),/UNSUPPORTED_COUNT_PROJECTION/);});
for(const status of [400,401,403,404,429,500])test('HTTP '+status+' captures allowlisted diagnostic without inference or secret leakage',async()=>{
 const events:any[]=[];let calls=0;
 const transport:any=async(url:any,init:any)=>{calls++;assert.equal(url,TOKEN_COUNT_ENDPOINT);assert.equal(init.redirect,'error');assert.equal(init.headers['OpenAI-Project'],'proj_test');assert.equal(init.headers.authorization,'Bearer SECRET_EXACT');assert.deepEqual(JSON.parse(init.body),countPayload(body));return new Response(JSON.stringify({error:{type:'invalid_request_error',code:'unknown_parameter',param:'max_output_tokens',message:'SECRET_EXACT Authorization: Bearer sk-hidden entire request '+JSON.stringify(body)},extra:{secret:'SECRET_EXACT'}}),{status,headers:{'x-request-id':'req_12345678abcdef','authorization':'SECRET_EXACT'}});};
 await assert.rejects(countTokens(body,'proj_test','SECRET_EXACT',async e=>{events.push(e);},transport),/TOKEN_COUNT_HTTP_ERROR/);assert.equal(calls,1);
 const e=events.at(-1);assert.equal(e.httpStatus,status);assert.equal(e.providerErrorCode,'unknown_parameter');assert.equal(e.providerRequestId,'req_12345678abcdef');assert.equal(e.errorParameter,'max_output_tokens');assert.equal(e.message,'Provider rejected an unknown request parameter.');
 const saved=JSON.stringify(events);for(const forbidden of ['SECRET_EXACT','sk-hidden','Bearer','authorized synthetic input','operator instructions','extra'])assert.ok(!saved.includes(forbidden));
});
test('unknown error fields, request-ID injection, control characters and HTML are withheld',async()=>{
 for(const id of ['Bearer SECRET','req_12345678SECRET','req_sk-secret','bad\nheader']){const e=sanitizeCountResponse(401,id,{error:{type:'SECRET',code:'SECRET',param:'SECRET',message:'SECRET'}},'SECRET');assert.equal(e.providerRequestId,null);assert.equal(e.providerErrorType,null);assert.equal(e.providerErrorCode,null);assert.ok(!JSON.stringify(e).includes('SECRET'));}
 const events:any[]=[];await assert.rejects(countTokens(body,'proj_test','SECRET',async e=>{events.push(e);},async()=>new Response('<html>SECRET</html>',{status:502})),/TOKEN_COUNT_HTTP_ERROR/);assert.equal(events.at(-1).httpStatus,502);assert.ok(!JSON.stringify(events).includes('html'));
});
test('oversized and malformed success bodies never become a guessed count',async()=>{for(const text of ['invalid','x'.repeat(17000),JSON.stringify({object:'response.input_tokens',input_tokens:-1})]){const events:any[]=[];await assert.rejects(countTokens(body,'proj_test','SECRET',async e=>{events.push(e);},async()=>new Response(text)),/TOKEN_COUNT_INVALID/);assert.equal(events.at(-1).phase,'invalid_response');}});
test('transport error text is suppressed; successful provider count retains safety margin',async()=>{const events:any[]=[];await assert.rejects(countTokens(body,'proj_test','SECRET',async e=>{events.push(e);},async()=>{throw Error('SECRET echoed in transport error');}),/TOKEN_COUNT_TRANSPORT_ERROR/);assert.equal(events.at(-1).httpStatus,null);assert.ok(!JSON.stringify(events).includes('SECRET'));assert.equal(await countTokens(body,'proj_test','SECRET',async()=>{},async()=>new Response(JSON.stringify({object:'response.input_tokens',input_tokens:100}))),366);});
test('signed larger byte containment counts the complete payload; default bound, exact boundaries and provider token margin remain unchanged',async()=>{
 const sized=(n:number)=>{const x={...body,input:''};x.input='x'.repeat(n-Buffer.byteLength(canonical(x)));return x;};
 assertCountableRequest(sized(65536));assert.throws(()=>assertCountableRequest(sized(65537)),/REQUEST_TOO_LARGE/);
 assertCountableRequest(sized(196608),196608);assert.throws(()=>assertCountableRequest(sized(196609),196608),/REQUEST_TOO_LARGE/);assert.throws(()=>assertCountableRequest(body,262144),/BYTE_LIMIT_INVALID/);
 let requests=0;const large=sized(85000),mock=(async(_url:any,init:any)=>{requests++;assert.deepEqual(JSON.parse(init.body),countPayload(large));return Response.json({object:'response.input_tokens',input_tokens:100});}) as typeof fetch;
 await assert.rejects(()=>countTokens(large,'proj_test','MOCK',async()=>{},mock),/REQUEST_TOO_LARGE/);assert.equal(requests,0);
 assert.equal(await countTokens(large,'proj_test','MOCK',async()=>{},mock,196608),366);assert.equal(requests,1);
 await assert.rejects(()=>countTokens(sized(196609),'proj_test','MOCK',async()=>{},mock,196608),/REQUEST_TOO_LARGE/);assert.equal(requests,1);
});
