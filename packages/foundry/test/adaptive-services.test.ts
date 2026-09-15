import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { WslServiceManager, assertServicesStopped } from '../src/adaptive/wsl-service.ts';
import { StateStore } from '../src/state.ts';
import { backupPilot, restorePilot } from '../src/pilot/continuity.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { AdaptiveWorkTools } from '../src/adaptive/tools.ts';
import { ADAPTIVE_VERSION } from '../src/adaptive/worker-contract.ts';
import { hash } from '../src/contracts.ts';

const live = process.platform === 'win32' && process.env.MIDAS_TEST_WSL === '1';
function fixture() {
  const dataRoot = mkdtempSync(join(tmpdir(), 'midas-services-'));
  const root = join(dataRoot, 'adaptive');
  const manager = new WslServiceManager({ root, businessId: 'one', taskId: 'service-task' });
  mkdirSync(manager.workspacePath, { recursive: true });
  const request = { operationId: 'http', workspace: manager.workspacePath, cwd: manager.workspacePath,
    argv: ['python3', 'service.py'], port: 8765, lifetimeMs: 30_000 };
  return { root, dataRoot, manager, request };
}
const server = `import http.server,json,os,pathlib,socket,subprocess,time
assert not pathlib.Path('/mnt/c/Users').exists()
assert not pathlib.Path('/home').exists()
assert not pathlib.Path('/workspace/../service-evidence').exists()
assert set(name for _,name in socket.if_nameindex()) == {'lo'}
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path == '/big': data=b'x'*70000
  elif self.path == '/redirect':
   self.send_response(302); self.send_header('Location','http://127.0.0.1:1/elsewhere'); self.end_headers(); return
  else: data=json.dumps({'ok':True,'interfaces':[name for _,name in socket.if_nameindex()]}).encode()
  self.send_response(200); self.end_headers(); self.wfile.write(data)
 def do_POST(self):
  data=self.rfile.read(int(self.headers.get('Content-Length',0)))
  pathlib.Path('received.txt').write_bytes(data)
  self.send_response(201); self.end_headers(); self.wfile.write(data)
 def log_message(self,*args): pass
print('isolated service ready',flush=True)
http.server.HTTPServer(('127.0.0.1',8765),Handler).serve_forever()
`;

test('service input constraints reject before dispatch', async () => {
  const { manager, request, root } = fixture();
  await assert.rejects(manager.start({ ...request, lifetimeMs: 600_001 }), /LIFETIME/);
  await assert.rejects(manager.start({ ...request, port: 80 }), /PORT/);
  await assert.rejects(manager.start({ ...request, argv: ['bad\0'] }), /ARGV/);
  await assert.rejects(manager.start({ ...request, cwd: root }), /CWD/);
  await assert.rejects(manager.start({ ...request, workspace: root }), /WORKSPACE/);
  await assert.rejects(manager.request('http', { method: 'GET', path: '//other-host' }), /HTTP_REQUEST/);
  await assert.rejects(manager.request('http', { method: 'GET', path: '/\r\nHost: evil' }), /HTTP_REQUEST/);
  await assert.rejects(manager.request('http', { method: 'POST', path: '/', body: 'x'.repeat(65_537) }), /HTTP_REQUEST/);
  assert.throws(() => new WslServiceManager({ root, businessId: 'x', taskId: 'x', distribution: 'Ubuntu --evil' }), /INVALID/);
});

test('actual private service survives manager restart; same ID is not redispatched and HTTP is scoped', { skip: !live }, async t => {
  const { root, dataRoot, manager, request } = fixture();
  const store = new StateStore(join(dataRoot, 'pilot.sqlite')); t.after(() => store.close());
  const host = createServer(socket => socket.end('HOST-NETWORK-MARKER'));
  await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve));
  t.after(() => host.close());
  const hostPort = (host.address() as { port: number }).port;
  writeFileSync(join(manager.workspacePath, 'service.py'), `try:\n import socket\n socket.create_connection(('127.0.0.1',${hostPort}),timeout=.2)\n raise AssertionError('host network reachable')\nexcept OSError: pass\n` + server);
  t.after(async () => { await manager.stop('http'); });
  const first = await manager.start(request);
  assert.equal(first.status, 'ready', JSON.stringify(first));
  assert.equal(first.isolation, 'wsl-bubblewrap');
  const restarted = new WslServiceManager({ root, businessId: 'one', taskId: 'service-task' });
  const replay = await restarted.start(request);
  assert.equal(replay.status, 'ready'); assert.equal(replay.startedAt, first.startedAt);
  assert.equal(replay.inputHash, first.inputHash);
  assert.equal((await restarted.list()).length, 1);
  assert.throws(() => assertServicesStopped(root), /STOP_UNCONFIRMED/);
  assert.throws(() => backupPilot(store, join(dataRoot, 'live-backup'), { sourceRoot: dataRoot, quiescent: true, format: 'v4' }), /STOP_UNCONFIRMED/);
  await assert.rejects(restarted.start({ ...request, argv: ['false'] }), /ID_CONFLICT/);
  await assert.rejects(restarted.start({ ...request, operationId: 'second-service' }), /TASK_BUSY/);
  const result = await restarted.request('http', { method: 'GET', path: '/' });
  assert.equal(result.statusCode, 200); assert.deepEqual(JSON.parse(result.body), { ok: true, interfaces: ['lo'] });
  const posted = await restarted.request('http', { method: 'POST', path: '/', body: '{"local":true}' });
  assert.equal(posted.statusCode, 201); assert.equal(readFileSync(join(manager.workspacePath, 'received.txt'), 'utf8'), '{"local":true}');
  assert.equal((await restarted.request('http', { method: 'GET', path: '/redirect' })).statusCode, 302);
  await assert.rejects(restarted.request('http', { method: 'GET', path: '/big' }), /RESPONSE_LIMIT/);
  const stopped = await restarted.stopAll();
  assert.equal(stopped[0]?.status, 'stopped'); assert.equal(stopped[0]?.stopConfirmed, true); assert.equal(stopped[0]?.quiescent, true);
  assertServicesStopped(root);
  const backupPath = join(dataRoot, 'stopped-backup');
  const manifest = backupPilot(store, backupPath, { sourceRoot: dataRoot, quiescent: true, format: 'v4' });
  assert.equal(manifest.version, 'pilot-backup-v4');
  assert.equal('sidecars' in manifest && manifest.sidecars.some(sidecar => sidecar.path.includes('service-evidence')), false);
  const restorePath = join(dataRoot, 'restored');
  assert.equal(restorePilot(backupPath, restorePath, manifest.sha256).automaticExecution, false);
  assert.equal(existsSync(join(restorePath, 'adaptive', 'service-evidence')), false);
  assert.equal((await restarted.start(request)).status, 'stopped');
  await assert.rejects(restarted.request('http', { method: 'GET', path: '/' }), /NOT_READY/);
  assert.equal((await restarted.stop('http'))?.status, 'stopped');
  const restoredRoot = mkdtempSync(join(tmpdir(), 'midas-services-restored-'));
  cpSync(root, restoredRoot, { recursive: true });
  await assert.rejects(new WslServiceManager({ root: restoredRoot, businessId: 'one', taskId: 'service-task' }).stop('http'), /STATE_RELOCATED/);
});

test('actual stop and lease expiry kill detached descendants, and logs remain bounded', { skip: !live }, async t => {
  for (const action of ['stop', 'expire']) {
    const { manager, request } = fixture();
    writeFileSync(join(manager.workspacePath, 'service.py'), `import subprocess\nsubprocess.Popen(['python3','-c',"import time,pathlib;time.sleep(6);pathlib.Path('late.txt').write_text('bad')"],start_new_session=True)\nprint('x'*100000,flush=True)\n` + server);
    t.after(async () => { await manager.stop('http'); });
    const started = await manager.start({ ...request, lifetimeMs: action === 'expire' ? 3000 : 30000 });
    assert.equal(started.status, 'ready', JSON.stringify({ status: started.status, reason: started.reason, stderr: started.stderr }));
    if (action === 'stop') assert.equal((await manager.stop('http'))?.status, 'stopped');
    await new Promise(resolve => setTimeout(resolve, 6500));
    const ended = await manager.status('http');
    assert.equal(ended?.status, action === 'expire' ? 'expired' : 'stopped');
    assert.equal(ended?.truncated, true); assert.ok(Buffer.byteLength(ended!.stdout + ended!.stderr) <= 65_536);
    assert.equal(existsSync(join(manager.workspacePath, 'late.txt')), false);
    await assert.rejects(manager.request('http', { method: 'GET', path: '/' }), /NOT_READY/);
  }
});

test('actual broker rejects changed unit identity before entering a namespace', { skip: !live }, async t => {
  const { manager, request } = fixture();
  writeFileSync(join(manager.workspacePath, 'service.py'), server);
  t.after(async () => { await manager.stop('http'); });
  assert.equal((await manager.start(request)).status, 'ready');
  const operationDirectory = join(manager.controlPath, createHash('sha256').update('http').digest('hex'));
  const configFile = join(operationDirectory, 'config.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const originalUnit = config.unit;
  config.unit = 'midas-no-such-service.service';
  writeFileSync(configFile, JSON.stringify(config));
  try { await assert.rejects(manager.request('http', { method: 'GET', path: '/' }), /NOT_READY|CGROUP_IDENTITY/); }
  finally { config.unit = originalUnit; writeFileSync(configFile, JSON.stringify(config)); }
});

function toolFixture(t: {after(fn: () => void): void}) {
  const dataRoot=mkdtempSync(join(tmpdir(),'midas-service-tools-')),store=new StateStore(join(dataRoot,'pilot.sqlite'));
  const portfolio=new Portfolio(store),evidence=new EvidenceLibrary(store);
  portfolio.createVenture({id:'one',name:'Synthetic service mechanics',goal:'Validate local service lifecycle only'});
  portfolio.addPlan('one',{rationale:'Explicit synthetic test authority',tasks:['permitted','denied'].map(id=>({id,title:'Synthetic service task',objective:'Test local lifecycle',lane:'research' as const,capability:'service.brief',dependsOn:[],acceptance:['Mechanics observed'],allowedTools:['adaptive.perform'],requiredChecks:[],effectAuthority:{kind:'local' as const,reference:'Synthetic local test only'},inputs:{adaptiveExecution:{version:ADAPTIVE_VERSION,prompt:'lean',allowCommands:true,allowServices:id==='permitted'}}}))});
  const tools=new AdaptiveWorkTools({root:join(dataRoot,'adaptive'),store,evidence,taskFor:id=>portfolio.getTask(id),provenance:'fixture',base:{execute:async()=>{throw Error('UNEXPECTED_BASE');},load:()=>null} as any});
  const call=(id:string,payload:any,taskId='one/permitted')=>tools.execute({ventureId:'one',taskId,tool:'adaptive.perform',operationId:id,args:{payload:JSON.stringify(payload)}});
  return {store,portfolio,tools,call};
}

test('service tool authority and running status serialize without granting execution',async t=>{
  const f=toolFixture(t);
  t.after(()=>f.store.close());
  const status=await f.call('status',{action:'status'});
  assert.equal(status.ok,true);assert.doesNotThrow(()=>hash(status));
  assert.equal(status.output.receiptIds.find((row:any)=>row.operationId==='status').ok,null);
  const denied=await f.call('denied-start',{action:'serviceStart',argv:['python3','service.py'],port:8765,lifetimeMs:3000},'one/denied');
  assert.equal(denied.ok,false);assert.match(denied.error!,/NOT_AUTHORIZED/);
  assert.equal(f.tools.completionBlocker(f.portfolio.getTask('one/denied')),null);
  await assert.rejects(f.tools.stopServices('different','one/permitted'),/SCOPE_DENIED/);
});

test('prospective candidate memory mask hides and denies reuse without deleting historical candidates',async t=>{
  const f=toolFixture(t);t.after(()=>f.store.close());
  for(const id of ['visible','masked'])f.store.transaction(()=>f.store.put('adaptive-skill-candidate',id,{id,businessId:'one',taskId:'one/historical',status:'candidate',qualification:'unqualified',package:{purpose:'Synthetic historical mechanics',preconditions:[],files:[],effects:[]}},null));
  assert.equal((await f.call('all-candidates',{action:'candidates'})).output.length,2);
  const task=f.portfolio.getTask('one/permitted');
  f.store.transaction(()=>f.store.put('portfolio-task',task.id,{...task,inputs:{...task.inputs,adaptiveExecution:{...(task.inputs as any).adaptiveExecution,memoryPolicy:{kind:'retained-candidates-v1',candidateIds:['visible']}}}},task._version));
  assert.deepEqual((await f.call('masked-candidates',{action:'candidates'})).output.map((row:any)=>row.id),['visible']);
  assert.deepEqual(f.tools.contextFor(f.portfolio.getTask(task.id))!.candidateSkills.map((row:any)=>row.id),['visible']);
  for(const action of ['importCandidate','reuse','reuseOutcome']){const denied=await f.call('masked-'+action,{action,candidateId:'masked'});assert.equal(denied.ok,false);assert.match(denied.error!,/MEMORY_POLICY_DENIED/);}
  const masked=f.portfolio.getTask(task.id);
  f.store.transaction(()=>f.store.put('portfolio-task',task.id,{...masked,inputs:{...masked.inputs,adaptiveExecution:{...(masked.inputs as any).adaptiveExecution,memoryPolicy:{kind:'retained-candidates-v1',candidateIds:[]}}}},masked._version));
  assert.deepEqual((await f.call('empty-candidates',{action:'candidates'})).output,[]);
  assert.equal(f.store.get('adaptive-skill-candidate','masked').status,'candidate');
});

test('actual tool service blocks completion, recovers creation read-only and owner stop works after latch',{skip:!live},async t=>{
  const f=toolFixture(t),task=f.portfolio.getTask('one/permitted');
  f.tools.workspace(task).write('service.py',server,null);
  t.after(async()=>{try{await f.tools.stopServices('one',task.id);}finally{f.store.close();}});
  const started=await f.call('service-create',{action:'serviceStart',argv:['python3','service.py'],port:8765,lifetimeMs:30000});
  assert.equal(started.ok,true,JSON.stringify(started));
  assert.equal(f.tools.completionBlocker(task)?.code,'ADAPTIVE_SERVICE_UNRESOLVED');
  assert.equal(f.tools.finishingFloor(task),1);
  const competingCommand=await f.call('competing-command',{action:'command',argv:['python3','-V']});
  assert.equal(competingCommand.ok,false);assert.match(competingCommand.error!,/EXECUTION_BUSY/);
  const competingService=await f.call('competing-service',{action:'serviceStart',argv:['python3','service.py'],port:8766,lifetimeMs:30000});
  assert.equal(competingService.ok,false);assert.match(competingService.error!,/EXECUTION_BUSY/);
  const saved=f.store.get('adaptive-tool-operation','service-create');
  f.store.transaction(()=>f.store.put('adaptive-tool-operation','service-create',{...saved,status:'running',result:null},saved._version));
  const recovered=await f.tools.recoverOperation('service-create','one',task.id);
  assert.equal(recovered.output.startedAt,started.output.startedAt);assert.equal(recovered.ok,true);
  const response=await f.call('service-post',{action:'serviceRequest',serviceId:'service-create',method:'POST',path:'/',body:'synthetic observation'});
  assert.equal(response.output.statusCode,201);
  const observed=f.store.get('adaptive-tool-operation','service-post');
  f.store.transaction(()=>f.store.put('adaptive-tool-operation','service-post',{...observed,status:'running',result:null},observed._version));
  assert.equal(await f.tools.recoverOperation('service-post','one',task.id),null,'Uncertain POST is never replayed');
  const current=f.portfolio.getTask(task.id);
  f.store.transaction(()=>f.store.put('portfolio-task',task.id,{...current,stopRequested:true},current._version));
  const stopped=await f.tools.stopServices('one',task.id);
  assert.equal(stopped[0].stopConfirmed,true);assert.equal(stopped[0].quiescent,true);
  assert.equal(f.tools.completionBlocker(f.portfolio.getTask(task.id)),null);
  assert.doesNotThrow(()=>hash(f.tools.contextFor(f.portfolio.getTask(task.id))));
});
