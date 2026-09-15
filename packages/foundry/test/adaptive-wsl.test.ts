import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AdaptiveWorkspace} from '../src/adaptive/executor.ts';
import {WslBubblewrapBackend} from '../src/adaptive/wsl-backend.ts';

const live=process.platform==='win32'&&process.env.MIDAS_TEST_WSL==='1';
test('real WSL sandbox executes scoped code and denies host, sibling, evidence and network access',{skip:!live},async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-wsl-'));
 const ws=new AdaptiveWorkspace({root,businessId:'test-a',taskId:'task',policy:{allowCommands:true}});
 const other=new AdaptiveWorkspace({root,businessId:'test-b',taskId:'task',policy:{allowCommands:true}});
 other.write('private.txt','unrelated-test-data',null);
 ws.write('probe.py',`import pathlib,socket,os,json
p=pathlib.Path('/workspace/result.txt');p.write_text('scoped result')
assert not pathlib.Path('${other.workspacePath.replaceAll('\\','/')}').exists()
assert not pathlib.Path('/mnt/c/Users').exists()
assert not pathlib.Path('/home').exists()
assert not pathlib.Path('/workspace/../execution-evidence').exists()
assert set(name for _,name in socket.if_nameindex())=={'lo'}
os.symlink('/mnt/c/Users','/workspace/host-link')
assert not pathlib.Path('/workspace/host-link').exists()
try:
 socket.create_connection(('1.1.1.1',443),timeout=.2)
 raise AssertionError('network reached')
except OSError: pass
print(json.dumps({'scope':'passed','network':'denied','artifact':p.read_text()}))`,null);
 const result=await ws.command({operationId:'probe',argv:['python3','probe.py'],timeoutMs:10000});
 assert.equal(result.status,'completed',result.stderr);assert.equal(result.isolation,'wsl-bubblewrap');
 assert.equal(ws.read('result.txt').content,'scoped result');
 assert.throws(()=>ws.read('host-link/anything'));
 assert.deepEqual(await ws.command({operationId:'probe',argv:['python3','probe.py'],timeoutMs:10000}),result);
 assert.equal(new AdaptiveWorkspace({root,businessId:'test-a',taskId:'task',policy:{allowCommands:true}}).recoverCommand('probe')?.status,'completed');
});
test('real WSL deadline kills delayed writes; network opt-in does not bypass broker',{skip:!live},async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-wsl-time-'));
 const ws=new AdaptiveWorkspace({root,businessId:'test',taskId:'task',policy:{allowCommands:true}});
 const r=await ws.command({operationId:'deadline',argv:['python3','-c',"import time,pathlib;time.sleep(2);pathlib.Path('late.txt').write_text('bad')"],timeoutMs:100});
 assert.equal(r.status,'timed_out',r.stderr);await new Promise(r=>setTimeout(r,2100));assert.equal(existsSync(join(ws.workspacePath,'late.txt')),false);
 const backend=new WslBubblewrapBackend();const denied=await backend.execute({argv:['python3','-V'],cwd:ws.workspacePath,workspace:ws.workspacePath,network:'on',timeoutMs:1000,maxOutputBytes:1000});
 assert.equal(denied.reason,'WSL_NETWORK_REQUIRES_ACQUISITION_BROKER');
});
test('WSL backend rejects configuration injection without dispatch',()=>{assert.throws(()=>new WslBubblewrapBackend('Ubuntu --evil'),/INVALID/);});

test('actual owner cancellation terminates the scoped command tree and preserves partial effects',{skip:!live},async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-wsl-cancel-'));
 const ws=new AdaptiveWorkspace({root,businessId:'one',taskId:'task',policy:{allowCommands:true}}),controller=new AbortController();
 const request={operationId:'cancel',argv:['python3','-c',"import pathlib,time,subprocess;pathlib.Path('started').write_text('yes');subprocess.Popen(['python3','-c',\"import time,pathlib;time.sleep(4);pathlib.Path('late').write_text('no')\"]);time.sleep(20)"],timeoutMs:30000};
 const pending=ws.command(request,{signal:controller.signal});
 for(let i=0;i<100&&!existsSync(join(ws.workspacePath,'started'));i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(existsSync(join(ws.workspacePath,'started')),'command started');controller.abort();
 const r=await pending;assert.equal(r.status,'failed');assert.equal(r.reason,'EXECUTOR_CANCELLED');
 await new Promise(r=>setTimeout(r,4100));assert.equal(existsSync(join(ws.workspacePath,'late')),false);
 assert.equal(ws.read('started').content,'yes');assert.equal(ws.recoverCommand('cancel')?.reason,'EXECUTOR_CANCELLED');
});

test('actual cgroup bounds process fanout without affecting unrelated task',{skip:!live},async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-wsl-cgroup-'));
 const ws=new AdaptiveWorkspace({root,businessId:'one',taskId:'task',policy:{allowCommands:true}});
 const other=new AdaptiveWorkspace({root,businessId:'two',taskId:'task',policy:{allowCommands:false}});other.write('marker','intact',null);
 const r=await ws.command({operationId:'pids',argv:['python3','-c',"import subprocess,json;children=[]\ntry:\n for i in range(80): children.append(subprocess.Popen(['sleep','2']))\nexcept BlockingIOError: pass\nfinally:\n for p in children: p.terminate()\nprint(json.dumps({'spawned':len(children)}))"],timeoutMs:10000});
 assert.equal(r.status,'completed',r.stderr);assert.ok(JSON.parse(r.stdout).spawned<64);assert.equal(other.read('marker').content,'intact');
});

test('trusted WSL completion survives lost controller observation and releases the task lease on recovery',{skip:!live},async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-wsl-recover-')),backend=new WslBubblewrapBackend();
 const ws=new AdaptiveWorkspace({root,businessId:'one',taskId:'task',policy:{allowCommands:true},backend:{execute:async c=>{await backend.execute(c);throw Error('SIMULATED_CONTROLLER_CONNECTION_LOSS');}}});
 const request={operationId:'lost',argv:['python3','-c',"from pathlib import Path; p=Path('effects');p.write_text(str(int(p.read_text())+1) if p.exists() else '1');print('done')"],timeoutMs:10000};
 await assert.rejects(ws.command(request),/CONNECTION_LOSS/);
 const restored=new AdaptiveWorkspace({root,businessId:'one',taskId:'task',policy:{allowCommands:true}});
 const recovered=restored.recoverCommand('lost');assert.equal(recovered?.status,'completed');assert.equal(recovered?.stdout.trim(),'done');
 assert.equal((await restored.command(request)).status,'completed');assert.equal(restored.read('effects').content,'1');
 assert.equal(existsSync(join(restored.evidencePath,'command-active.json')),false);
});
