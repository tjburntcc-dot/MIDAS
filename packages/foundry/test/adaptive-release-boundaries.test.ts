import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, isAbsolute, join, relative, sep} from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {AdaptiveWorkspace, contentHash} from '../src/adaptive/executor.ts';
import type {ExecutorBackend} from '../src/adaptive/executor.ts';
import {AdaptiveAcquisition} from '../src/adaptive/acquisition.ts';
import type {AcquisitionPolicy} from '../src/adaptive/acquisition.ts';
import type {ResearchPorts} from '../src/operations/research.ts';
import {StateStore} from '../src/state.ts';

// Controller/transport fixtures: injected results prove neither sandbox
// containment, runtime-model competence nor actual public network retrieval.
const success = {status:'completed' as const, exitCode:0, stdout:'controller fixture',
  stderr:'', truncated:false, isolation:'injected' as const};
const basePolicy:AcquisitionPolicy = {dataScope:'public-or-synthetic',
  allowedHosts:['docs.example.org'], maxRequests:4, maxBytes:1024, deadlineMs:1000};
const publicDns = async () => [{address:'93.184.216.34'}];
const input = (operationId:string, path='docs/reference.txt') => ({
  operationId, url:'https://docs.example.org/reference', path, expectedHash:null as string|null,
  purpose:'Inspect a bounded reference in a disclosed regression fixture',
});
function temporaryRoot() { return mkdtempSync(join(tmpdir(),'midas-release-boundary-')); }
function removeTemporaryRoot(root:string) {
  const child=relative(tmpdir(),root);
  assert.ok(!isAbsolute(child) && child!=='' && child!=='..' && !child.startsWith('..'+sep));
  assert.ok(basename(root).startsWith('midas-release-boundary-'));
  rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
}
async function until(predicate:()=>boolean, message:string) {
  const deadline=Date.now()+10000;
  while(!predicate()) {
    if(Date.now()>deadline)throw new Error(message);
    await new Promise(resolve=>setTimeout(resolve,10));
  }
}

test('task-wide command claim excludes a second process with a distinct operation ID', {timeout:20000}, async()=>{
  const root=temporaryRoot();
  const executorUrl=new URL('../src/adaptive/executor.ts',import.meta.url).href;
  // Both owners attempt admission before either can finish its pre-dispatch
  // snapshot. The original per-operation wx receipt fails this rendezvous.
  const source=[
    'import {AdaptiveWorkspace} from '+JSON.stringify(executorUrl)+';',
    "import {existsSync,writeFileSync} from 'node:fs';",
    "import {join} from 'node:path';",
    "const [root,id]=process.argv.slice(1);",
    "const waitFor=name=>{const end=Date.now()+12000;while(!existsSync(join(root,name))){",
    "if(Date.now()>end)throw new Error('fixture rendezvous timed out');",
    "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}};",
    "const backend={execute:async()=>{writeFileSync(join(root,'dispatched-'+id),'fixture');",
    "return {status:'completed',exitCode:0,stdout:'fixture',stderr:'',truncated:false,isolation:'injected'};}};",
    "const w=new AdaptiveWorkspace({root,businessId:'same-business',taskId:'same-task',backend,policy:{allowCommands:true}});",
    "const original=w.snapshot.bind(w);let first=true;",
    "w.snapshot=()=>{if(first){first=false;writeFileSync(join(root,'snapshot-'+id),'ready');",
    "waitFor('release-snapshots');}return original();};",
    "writeFileSync(join(root,'ready-'+id),'ready');waitFor('start');let result;",
    "try {const receipt=await w.command({operationId:id,argv:['fixture-command']});result={ok:true,status:receipt.status};}",
    "catch(error){result={ok:false,error:String(error.message)};}",
    "writeFileSync(join(root,'result-'+id+'.json'),JSON.stringify(result));",
  ].join('\n');
  const children:Array<ReturnType<typeof spawn>>=[];
  const exits:Promise<{code:number|null;stderr:string}>[]=[];
  try {
    for(const id of ['owner-a','owner-b']) {
      const child=spawn(process.execPath,['--input-type=module','-e',source,root,id],
        {stdio:['ignore','ignore','pipe'],windowsHide:true});
      children.push(child);
      exits.push(new Promise((resolveExit,reject)=>{
        let stderr='';
        child.stderr?.on('data',chunk=>stderr+=String(chunk));
        child.once('error',reject);
        child.once('close',code=>resolveExit({code,stderr}));
      }));
    }
    await until(()=>['owner-a','owner-b'].every(id=>existsSync(join(root,'ready-'+id))),
      'Both command owners must become ready');
    writeFileSync(join(root,'start'),'go');
    await until(()=>['owner-a','owner-b'].every(id=>
      existsSync(join(root,'snapshot-'+id)) || existsSync(join(root,'result-'+id+'.json'))),
      'Each owner must reach the snapshot or report rejected admission');
    writeFileSync(join(root,'release-snapshots'),'go');
    const results=await Promise.all(exits);
    for(const result of results)assert.equal(result.code,0,result.stderr);
    const outcomes=['owner-a','owner-b'].map(id=>
      JSON.parse(readFileSync(join(root,'result-'+id+'.json'),'utf8')));
    assert.equal(outcomes.filter(row=>row.ok).length,1,'Only one task owner may dispatch');
    assert.equal(outcomes.filter(row=>!row.ok && /EXECUTOR_OUTCOME_UNCERTAIN/.test(row.error)).length,1);
    assert.equal(readdirSync(root).filter(name=>name.startsWith('dispatched-')).length,1);
    const workspace=new AdaptiveWorkspace({root,businessId:'same-business',taskId:'same-task',
      backend:{execute:async()=>success},policy:{allowCommands:true}});
    assert.equal(existsSync(join(workspace.evidencePath,'command-active.json')),false,
      'A durably completed command releases the task lease');
    const receipts=readdirSync(workspace.evidencePath)
      .filter(name=>name.startsWith('command-') && name.endsWith('.json'));
    assert.equal(receipts.length,1,'The rejected contender must not leave an execution receipt');
    assert.equal(JSON.parse(readFileSync(join(workspace.evidencePath,receipts[0]),'utf8')).status,'completed');
    assert.equal((await workspace.command({operationId:'later-owner',argv:['fixture-command']})).status,'completed');
  } finally {
    // Release a blocked fixture, await closure, then remove only the verified
    // temporary root created by this test.
    writeFileSync(join(root,'start'),'cleanup');
    writeFileSync(join(root,'release-snapshots'),'cleanup');
    for(const child of children)if(child.exitCode===null)child.kill();
    await Promise.allSettled(exits);
    removeTemporaryRoot(root);
  }
});

test('uncertain command retains its task lease and dispatch receipt across reconstruction',async()=>{
  const root=temporaryRoot();
  try {
    const backend:ExecutorBackend={execute:async command=>{
      writeFileSync(join(command.workspace,'partial-effect.txt'),'explicit fixture effect');
      throw new Error('fixture observation lost after dispatch');
    }};
    const workspace=new AdaptiveWorkspace({root,businessId:'business',taskId:'task',
      backend,policy:{allowCommands:true}});
    const request={operationId:'uncertain',argv:['fixture-command']};
    await assert.rejects(workspace.command(request),/observation lost/);
    const leasePath=join(workspace.evidencePath,'command-active.json');
    const lease=readFileSync(leasePath,'utf8');
    assert.equal(JSON.parse(lease).operationId,request.operationId);
    const receiptPath=join(workspace.evidencePath,'command-'+contentHash(request.operationId)+'.json');
    assert.equal(JSON.parse(readFileSync(receiptPath,'utf8')).status,'dispatching');
    assert.equal(workspace.read('partial-effect.txt').content,'explicit fixture effect');
    let replacementDispatches=0;
    const restarted=new AdaptiveWorkspace({root,businessId:'business',taskId:'task',
      backend:{execute:async()=>{replacementDispatches++;return success;}},policy:{allowCommands:true}});
    assert.throws(()=>restarted.recoverCommand(request.operationId),/OUTCOME_UNCERTAIN/);
    await assert.rejects(restarted.command(request),/OUTCOME_UNCERTAIN/);
    await assert.rejects(restarted.command({...request,operationId:'different-id'}),/OUTCOME_UNCERTAIN/);
    assert.equal(replacementDispatches,0);
    assert.equal(readFileSync(leasePath,'utf8'),lease,'Rejection must preserve the uncertain owner lease');
    assert.equal(JSON.parse(readFileSync(receiptPath,'utf8')).status,'dispatching');
  } finally {removeTemporaryRoot(root);}
});

test('one acquisition deadline covers DNS, headers and body and persists the failed attempt',async t=>{
  const root=temporaryRoot();
  const store=new StateStore(join(root,'state.sqlite'));
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.UTC(2026,8,14)});
  let signal:AbortSignal|undefined;
  let fetches=0;
  const delay=()=>new Promise<void>(resolve=>setTimeout(resolve,70));
  try {
    const ports:ResearchPorts={
      dnsLookup:async()=>{await delay();return publicDns();},
      fetch:async(_url,init)=>{fetches++;signal=init.signal;await delay();
        return {status:200,headers:new Headers({'content-type':'text/plain'}),
          arrayBuffer:async()=>{await delay();return Uint8Array.from([65]).buffer;}};
      },
    };
    const workspace=new AdaptiveWorkspace({root,businessId:'business',taskId:'deadline',policy:{}});
    const broker=new AdaptiveAcquisition(store,ports);
    const request=input('deadline');
    const resultPromise=broker.fetch(workspace,{...basePolicy,deadlineMs:100},request);
    // Every phase individually fits 100ms; their total does not. Fake time
    // removes scheduler-speed dependence and settles the remaining fixture work.
    for(let phase=0;phase<3;phase++){t.mock.timers.tick(70);await nextTurn();}
    const result=await resultPromise;
    assert.equal(result.status,'failed','A reset-per-phase deadline would incorrectly succeed');
    assert.match(result.code,/DEADLINE_EXCEEDED/);
    assert.equal(fetches,1);
    assert.equal(signal?.aborted,true);
    assert.equal(existsSync(join(workspace.workspacePath,request.path)),false);
    assert.equal(store.get('adaptive-acquisition',request.operationId).status,'failed');
    assert.match(store.get('adaptive-acquisition',request.operationId).code,/DEADLINE_EXCEEDED/);
    assert.equal((await broker.fetch(workspace,{...basePolicy,deadlineMs:100},request)).status,'failed');
    assert.equal(fetches,1,'Terminal replay does not issue a replacement HTTP request');
  } finally {
    t.mock.timers.reset();
    store.close();
    removeTemporaryRoot(root);
  }
});

test('a revoked current-context callback after download prevents overwrite and survives restart',async()=>{
  const root=temporaryRoot(),database=join(root,'state.sqlite');
  let store=new StateStore(database);
  let releaseBody!:()=>void,bodyStarted!:()=>void;
  const release=new Promise<void>(resolve=>releaseBody=resolve);
  const started=new Promise<void>(resolve=>bodyStarted=resolve);
  let fetches=0,checks=0;
  try {
    store.transaction(()=>store.put('fixture-authority','current',{active:true},null));
    const current=()=>{checks++;if(!store.get('fixture-authority','current').active)
      throw new Error('FIXTURE_TASK_NO_LONGER_CURRENT');};
    const workspace=new AdaptiveWorkspace({root,businessId:'business',taskId:'withdrawal',policy:{}});
    const original=workspace.write('docs/reference.txt','original permitted material',null);
    const request={...input('withdrawal'),expectedHash:original.sha256};
    const ports:ResearchPorts={dnsLookup:publicDns,fetch:async()=>{
      fetches++;
      return {status:200,headers:new Headers({'content-type':'text/plain'}),arrayBuffer:async()=>{
        bodyStarted();await release;return Uint8Array.from(Buffer.from('stale replacement')).buffer;
      }};
    }};
    const pending=new AdaptiveAcquisition(store,ports).fetch(workspace,basePolicy,request,current);
    await started;
    const before=store.get('fixture-authority','current');
    store.transaction(()=>store.put('fixture-authority','current',{active:false},before._version));
    releaseBody();
    const result=await pending;
    assert.equal(result.status,'failed');
    assert.equal(result.code,'FIXTURE_TASK_NO_LONGER_CURRENT');
    assert.equal(checks,2,'The binding is checked before dispatch and immediately before file application');
    assert.equal(workspace.read(request.path).sha256,original.sha256);
    assert.equal(readdirSync(workspace.evidencePath).filter(name=>name.startsWith('edit-')).length,1);
    store.close();store=new StateStore(database);
    assert.equal(store.get('adaptive-acquisition',request.operationId).status,'failed');
    assert.equal(store.get('fixture-authority','current').active,false);
    const restarted=new AdaptiveWorkspace({root,businessId:'business',taskId:'withdrawal',policy:{}});
    assert.equal(restarted.read(request.path).content,'original permitted material');
    await assert.rejects(new AdaptiveAcquisition(store,ports).fetch(restarted,basePolicy,request,current),
      /FIXTURE_TASK_NO_LONGER_CURRENT/);
    assert.equal(fetches,1);
  } finally {
    releaseBody();
    store.close();
    removeTemporaryRoot(root);
  }
});

test('bounded binary acquisition above the text limit preserves exact bytes, hashes and restart state',async()=>{
  const root=temporaryRoot(),database=join(root,'state.sqlite'),textLimit=1_048_576;
  let store=new StateStore(database);
  const bytes=Buffer.alloc(textLimit+1);
  for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const policy={...basePolicy,maxBytes:bytes.length,deadlineMs:1000};
  const workspacePolicy={maxFileBytes:textLimit,maxBinaryBytes:policy.maxBytes};
  let fetches=0;
  const ports:ResearchPorts={dnsLookup:publicDns,fetch:async()=>{
    fetches++;return {status:200,headers:new Headers({'content-type':'application/octet-stream'}),
      arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  }};
  try {
    const workspace=new AdaptiveWorkspace({root,businessId:'business',taskId:'binary',policy:workspacePolicy});
    const request={...input('binary','packages/reference.bin'),expectedSha256:contentHash(bytes)};
    const result=await new AdaptiveAcquisition(store,ports).fetch(workspace,policy,request);
    assert.equal(result.status,'downloaded_unverified',result.code);
    assert.equal(result.provenance,'fixture');
    assert.equal(result.bytes,bytes.length);
    assert.equal(result.sha256,contentHash(bytes));
    assert.deepEqual(readFileSync(join(workspace.workspacePath,request.path)),bytes);
    assert.throws(()=>workspace.read(request.path),/FILE_LIMIT/,
      'Large binary content does not silently widen model text reads');
    assert.throws(()=>workspace.write('oversized-text.txt','x'.repeat(textLimit+1),null),/FILE_LIMIT/);
    assert.throws(()=>workspace.write('oversized.bin',Buffer.alloc(policy.maxBytes+1),null),/FILE_LIMIT/);
    assert.throws(()=>workspace.write(request.path,Buffer.from('replacement'),'0'.repeat(64)),/STALE/);
    assert.equal(contentHash(readFileSync(join(workspace.workspacePath,request.path))),result.sha256);
    store.close();store=new StateStore(database);
    const restarted=new AdaptiveWorkspace({root,businessId:'business',taskId:'binary',policy:workspacePolicy});
    const replay=await new AdaptiveAcquisition(store,ports).fetch(restarted,policy,request);
    assert.equal(replay.sha256,result.sha256);
    assert.equal(fetches,1);
    assert.deepEqual(readFileSync(join(restarted.workspacePath,request.path)),bytes);
    const replacement=Buffer.from('smaller verified package');
    const next=restarted.write(request.path,replacement,result.sha256);
    assert.equal(next.sha256,contentHash(replacement),
      'Expected-hash replacement can validate the existing larger binary');
    assert.deepEqual(readFileSync(join(restarted.workspacePath,request.path)),replacement);
    assert.equal(store.get('adaptive-acquisition',request.operationId).sha256,result.sha256,
      'Historical acquisition receipts retain their original digest');
  } finally {store.close();removeTemporaryRoot(root);}
});
