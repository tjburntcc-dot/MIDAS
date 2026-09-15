import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {AdaptiveWorkspace,contentHash} from '../src/adaptive/executor.ts';
import {AdaptiveAcquisition} from '../src/adaptive/acquisition.ts';
import {acquirePublicBytes} from '../src/operations/research.ts';

const policy={dataScope:'public-or-synthetic' as const,allowedHosts:['docs.example.org'],maxRequests:2,maxBytes:1024,deadlineMs:500};
const bytes=Buffer.from('Documentation \u03bb');
const ports={dnsLookup:async()=>[{address:'93.184.216.34'}],fetch:async()=>({status:200,headers:new Headers({'content-type':'text/plain'}),arrayBuffer:async()=>Uint8Array.from(bytes).buffer})};
test('acquisition retains exact bytes/provenance, same-ID replay, failures and aggregate cap',async()=>{
 const root=mkdtempSync(join(tmpdir(),'acq-')),store=new StateStore(join(root,'state.sqlite'));
 try{
  const workspace=new AdaptiveWorkspace({root,businessId:'one',taskId:'task',policy:{allowCommands:false}}),broker=new AdaptiveAcquisition(store,ports);
  const input={operationId:'fetch-1',url:'https://docs.example.org/topic',path:'docs/topic.txt',expectedHash:null,purpose:'Understand the relevant tool contract',expectedSha256:contentHash(bytes)};
  const r=await broker.fetch(workspace,policy,input);assert.equal(r.status,'downloaded_unverified');assert.equal(r.provenance,'fixture');assert.equal(workspace.read('docs/topic.txt').sha256,contentHash(bytes));
  assert.equal((await broker.fetch(workspace,policy,input)).sha256,r.sha256);
  const failed=await broker.fetch(workspace,policy,{...input,operationId:'fetch-2',path:'bad.txt',expectedSha256:'0'.repeat(64)});assert.equal(failed.code,'ACQUISITION_DIGEST_MISMATCH');
  await assert.rejects(broker.fetch(workspace,policy,{...input,operationId:'fetch-3'}),/REQUEST_LIMIT/);
  await assert.rejects(broker.fetch(workspace,policy,{...input,url:'https://docs.example.org/topic?token=never-store'}),/URL_DENIED/);
 }finally{store.close();}
});
test('public acquisition denies rebinding, redirect, oversized body and private/auth destinations',async()=>{
 const input={url:'https://docs.example.org/topic',allowedHosts:policy.allowedHosts,maxBytes:20,deadlineMs:500};
 await assert.rejects(acquirePublicBytes(input,{...ports,dnsLookup:async()=>[{address:'127.0.0.1'}]}),/PRIVATE/);
 await assert.rejects(acquirePublicBytes({...input,url:'https://docs.example.org.evil.test/'},ports),/DENIED/);
 await assert.rejects(acquirePublicBytes({...input,url:'https://name:pass@docs.example.org/'},ports),{code:'CREDENTIALS_FORBIDDEN'});
 await assert.rejects(acquirePublicBytes(input,{...ports,fetch:async()=>({status:302,headers:new Headers({location:'https://elsewhere.org/'})})}),/REDIRECT/);
 await assert.rejects(acquirePublicBytes({...input,maxBytes:2},ports),/BYTE_LIMIT/);
});
test('pending acquisition survives restart and cannot redownload under same identity',async()=>{
 const root=mkdtempSync(join(tmpdir(),'acq-pending-')),store=new StateStore(join(root,'s.sqlite'));
 try{
  const workspace=new AdaptiveWorkspace({root,businessId:'one',taskId:'task',policy:{allowCommands:false}});
  let release:()=>void=()=>{};const wait=new Promise<void>(r=>release=r);
  const broker=new AdaptiveAcquisition(store,{...ports,fetch:async()=>{await wait;return ports.fetch();}});
  const input={operationId:'wait',url:'https://docs.example.org/topic',path:'docs.txt',expectedHash:null,purpose:'Read contract'};
  const pending=broker.fetch(workspace,policy,input);await new Promise(r=>setTimeout(r,10));
  await assert.rejects(new AdaptiveAcquisition(store,ports).fetch(workspace,policy,input),/UNCERTAIN/);
  release();assert.equal((await pending).status,'downloaded_unverified');
 }finally{store.close();}
});
test('real public technical retrieval uses pinned HTTPS and retains exact bytes',{skip:process.env.MIDAS_TEST_PUBLIC_ACQUISITION!=='1'},async()=>{
 const root=mkdtempSync(join(tmpdir(),'acq-public-')),store=new StateStore(join(root,'s.sqlite'));
 try{const workspace=new AdaptiveWorkspace({root,businessId:'public-probe',taskId:'read',policy:{allowCommands:false}});
 const r=await new AdaptiveAcquisition(store).fetch(workspace,{...policy,allowedHosts:['docs.python.org'],maxBytes:1000000,deadlineMs:15000},{operationId:'real-read',url:'https://docs.python.org/3/library/csv.html',path:'documentation.html',expectedHash:null,purpose:'Verify the public documentation transport without any model request'});
 assert.equal(r.status,'downloaded_unverified',r.code);assert.equal(r.provenance,'public_retrieval');assert.ok(workspace.read('documentation.html').content.includes('csv'));console.log(JSON.stringify({url:r.url,sha256:r.sha256,bytes:r.bytes,observedAt:r.observedAt,providerCalls:0,workerDecision:false}));
 }finally{store.close();}
});
