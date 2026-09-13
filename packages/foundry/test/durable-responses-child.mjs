import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {rawHash} from '../src/contracts.ts';
import {DurableResponses,BACKGROUND_POLICY} from '../src/durable-responses.ts';

// This child is an offline fault injector. No real credential or transport is
// read. A hard exit deliberately skips release(), close() and other cleanup.
globalThis.fetch=async()=>{throw Error('Real network is forbidden in the durable transport child');};
const file=process.argv[2],c=JSON.parse(process.argv[3]);assert(['identity_persisted','terminal_persisted'].includes(c.phase));assert.equal(c.secret,'DUMMY_KEY_FOR_OFFLINE_TEST_ONLY');
const store=new StateStore(file);let now=c.now;
const job=new DurableResponses({store,key:c.key,requestHash:rawHash(c.bytes),grantHash:c.grantHash,policy:BACKGROUND_POLICY,expiresAt:c.expiresAt,authorize:()=>{},now:()=>now,sleep:async ms=>{assert.equal(ms,5000);now+=ms;},fault:phase=>{if(phase===c.phase)process.exit(79);}});
const endpoint='https://api.openai.com/v1/responses';
const transport=async(url,init)=>{
 assert(['POST','GET'].includes(init.method));assert.equal(String(url),init.method==='POST'?endpoint:endpoint+'/'+c.responseId);if(init.method==='POST')assert.equal(init.body,c.bytes);else assert.equal(init.body,undefined);
 appendFileSync(join(dirname(file),'transport.ndjson'),JSON.stringify({method:init.method,url:String(url)})+'\n');
 return Response.json({id:c.responseId,model:c.model,status:init.method==='POST'?'queued':'completed',background:true,store:true,service_tier:'default',...(init.method==='GET'?{usage:{input_tokens:20,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:'{"decision":"inspect"}'}]}]}:{})});
};
job.claim();await job.execute({bytes:c.bytes,credential:c.secret,projectId:c.projectId,model:c.model,createDeadlineMs:180000,transport,resume:false});
assert.fail('The requested persistence fault must exit before result consumption');
