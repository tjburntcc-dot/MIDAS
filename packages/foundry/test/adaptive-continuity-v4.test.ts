import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {AdaptiveWorkspace,contentHash} from '../src/adaptive/executor.ts';
import {backupPilot,restorePilot} from '../src/pilot/continuity.ts';
import {hash} from '../src/contracts.ts';

const setup=()=>{const root=mkdtempSync(join(tmpdir(),'continuity-v4-')),store=new StateStore(join(root,'pilot.sqlite'));return {root,store,close(){store.close();rmSync(root,{recursive:true,force:true});}};};
const options=(root:string)=>({sourceRoot:root,quiescent:true,format:'v4' as const});

test('explicit V4 restores a real durable uncertain claim and binary bytes without replay',async()=>{
 const f=setup();let calls=0;const backend={async execute(){calls++;throw Error('Injected loss after durable dispatch');}};
 const workspace=(root:string)=>new AdaptiveWorkspace({root:join(root,'adaptive'),businessId:'fixture-business',taskId:'fixture-task',policy:{allowCommands:true,network:'off',maxBinaryBytes:16*1024*1024},backend});
 try{const work=workspace(f.root),asset=Buffer.alloc(3*1024*1024,0x6a),edit=work.write('public-archive.zip',asset,null),request={operationId:'uncertain-fixture',argv:['fixture-check'],timeoutMs:1000};
  await assert.rejects(()=>work.command(request),/Injected loss/);assert.equal(calls,1);assert(existsSync(join(work.evidencePath,'command-active.json')));
  assert.throws(()=>backupPilot(f.store,join(f.root,'v3'),{sourceRoot:f.root,quiescent:true}),/PILOT_ADAPTIVE_PATH_DENIED|PILOT_SIDECAR_FILE_INVALID/);
  const backup=join(f.root,'v4'),manifest=backupPilot(f.store,backup,options(f.root));assert.equal(manifest.version,'pilot-backup-v4');assert('database' in manifest);assert.equal(manifest.sha256,hash({version:'pilot-backup-v4',database:manifest.database,sidecars:manifest.sidecars}));
  const target=join(f.root,'restored');assert.equal(restorePilot(backup,target,manifest.sha256).automaticExecution,false);const restored=workspace(target);
  assert.equal(contentHash(readFileSync(join(restored.workspacePath,'public-archive.zip'))),edit.sha256);assert.equal(readFileSync(join(restored.evidencePath,'command-active.json'),'utf8'),readFileSync(join(work.evidencePath,'command-active.json'),'utf8'));
  await assert.rejects(()=>restored.command(request),/EXECUTOR_OUTCOME_UNCERTAIN/);await assert.rejects(()=>restored.command({...request,operationId:'new-operation'}),/EXECUTOR_OUTCOME_UNCERTAIN/);assert.equal(calls,1);
  const file=manifest.sidecars.find(s=>s.path.endsWith('public-archive.zip'))!;writeFileSync(join(backup,file.path),'changed');assert.throws(()=>restorePilot(backup,join(f.root,'tampered'),manifest.sha256),/RESTORE_SIDECAR_HASH_MISMATCH/);
 }finally{f.close();}
});

test('V4 preserves bound supervisor completion evidence for recovery after relocation',async()=>{
 const f=setup();let calls=0;const backend={async execute(command:any){calls++;writeFileSync(command.completion.path,JSON.stringify({version:'wsl-command-completion-v1',binding:command.completion.binding,finishedAt:new Date().toISOString(),result:{status:'completed',exitCode:0,stdout:'Explicit injected supervisor fixture',stderr:'',truncated:false,isolation:'wsl-bubblewrap'}}));throw Error('Injected controller loss');}};
 const workspace=(root:string)=>new AdaptiveWorkspace({root:join(root,'adaptive'),businessId:'fixture-business',taskId:'terminal-task',policy:{allowCommands:true},backend});
 try{const request={operationId:'terminal-fixture',argv:['fixture-check'],timeoutMs:1000};await assert.rejects(()=>workspace(f.root).command(request),/Injected controller loss/);const backup=join(f.root,'v4'),manifest=backupPilot(f.store,backup,options(f.root));assert('sidecars' in manifest);assert(manifest.sidecars.some(s=>s.path.includes('/command-result-')));
  const target=join(f.root,'restored');restorePilot(backup,target,manifest.sha256);const restored=workspace(target),receipt=await restored.command(request);assert.equal(receipt.status,'completed');assert.equal(calls,1);assert(!existsSync(join(restored.evidencePath,'command-active.json')));
  const altered=JSON.parse(readFileSync(join(backup,'manifest.json'),'utf8'));altered.version='pilot-backup-v3';writeFileSync(join(backup,'manifest.json'),JSON.stringify(altered));assert.throws(()=>restorePilot(backup,join(f.root,'downgraded'),manifest.sha256),/PILOT_ADAPTIVE_PATH_DENIED/);
 }finally{f.close();}
});

test('V4 refuses active owner/worker processes and oversized bytes while retaining stopped claims',()=>{
 const f=setup();try{writeFileSync(join(f.root,'owner-service.json'),JSON.stringify({pid:process.pid}));assert.throws(()=>backupPilot(f.store,join(f.root,'owner-active'),options(f.root)),/BACKUP_OWNER_SERVICE_STILL_RUNNING/);rmSync(join(f.root,'owner-service.json'));
  f.store.put('portfolio-task','active',{id:'active',lease:{ownerId:'worker-'+process.pid+'-fixture',expiresAt:new Date(Date.now()+60000).toISOString()}},null);assert.throws(()=>backupPilot(f.store,join(f.root,'worker-active'),options(f.root)),/BACKUP_WORKER_STILL_RUNNING/);const current=f.store.get('portfolio-task','active');f.store.put('portfolio-task','active',{...current,lease:null},current._version);
  const scope='a'.repeat(64),path=join(f.root,'adaptive','workspaces',scope);mkdirSync(path,{recursive:true});writeFileSync(join(path,'oversize.zip'),Buffer.alloc(16*1024*1024+1));assert.throws(()=>backupPilot(f.store,join(f.root,'oversize'),options(f.root)),/PILOT_SIDECAR_FILE_INVALID/);rmSync(join(path,'oversize.zip'));
  writeFileSync(join(path,'.env'),'fixture private configuration');assert.throws(()=>backupPilot(f.store,join(f.root,'private'),options(f.root)),/PILOT_ADAPTIVE_AUTH_FILE_DENIED/);rmSync(join(path,'.env'));
  mkdirSync(join(f.root,'adaptive','services','unknown'),{recursive:true});assert.throws(()=>backupPilot(f.store,join(f.root,'service'),options(f.root)),/PILOT_ADAPTIVE_PATH_DENIED/);
 }finally{f.close();}
});
