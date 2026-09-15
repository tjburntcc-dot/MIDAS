import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StateStore} from '../src/state.ts';
import {AdaptiveWorkspace} from '../src/adaptive/executor.ts';
import type {ExecutorBackend} from '../src/adaptive/executor.ts';
import {backupPilot,restorePilot} from '../src/pilot/continuity.ts';

function fixture(){const root=mkdtempSync(join(tmpdir(),'adaptive-continuity-')),store=new StateStore(join(root,'pilot.sqlite'));let calls=0;const backend:ExecutorBackend={async execute(){calls++;return {status:'completed',exitCode:0,stdout:'Explicit injected fixture check',stderr:'',truncated:false,isolation:'injected'};}};const workspace=(base=root)=>new AdaptiveWorkspace({root:join(base,'adaptive'),businessId:'fixture-business',taskId:'fixture-task',policy:{allowCommands:true,network:'off'},backend});return {root,store,workspace,get calls(){return calls;},close(){store.close();rmSync(root,{recursive:true,force:true});}};}

test('V3 restores adaptive files, candidate database state and terminal command replay without dispatch',async()=>{
 const f=fixture();try{const w=f.workspace(),edit=w.write('src/adapter.ts','Fixture adapter, no claim of learned competence',null);f.store.transaction(()=>f.store.put('adaptive-skill-candidate','fixture-candidate',{id:'fixture-candidate',qualification:'unqualified',files:[edit]},null));
  const request={operationId:'fixture-command',argv:['fixture-check'],timeoutMs:1000};const command=await w.command(request);assert.equal(f.calls,1);
  mkdirSync(join(f.root,'auth'));writeFileSync(join(f.root,'auth','openai.key'),'SYNTHETIC_SECRET_DO_NOT_COPY');
  assert.throws(()=>backupPilot(f.store,join(f.root,'not-quiescent'),{sourceRoot:f.root}),/BACKUP_QUIESCENCE_REQUIRED/);
  const backup=join(f.root,'backup'),manifest=backupPilot(f.store,backup,{sourceRoot:f.root,quiescent:true});assert.equal(manifest.version,'pilot-backup-v3');assert(manifest.sidecars.some(s=>s.path.includes('/execution-evidence/')));assert(manifest.sidecars.some(s=>s.path.endsWith('src/adapter.ts')));assert(!existsSync(join(backup,'auth')));
  const target=join(f.root,'restored'),restored=restorePilot(backup,target,manifest.sha256);assert.equal(restored.automaticExecution,false);assert.equal(f.calls,1);const replay=f.workspace(target);assert.equal(replay.read('src/adapter.ts').sha256,edit.sha256);assert.deepEqual(replay.recoverCommand(request.operationId),command);assert.equal(f.calls,1);
  const restoredStore=new StateStore(join(target,'pilot.sqlite'));try{assert.equal(restoredStore.get('adaptive-skill-candidate','fixture-candidate').qualification,'unqualified');}finally{restoredStore.close();}
 }finally{f.close();}
});

test('V3 denies mutated sidecars, unsupported credential files, path links and over-limit snapshots',()=>{
 const f=fixture();try{const w=f.workspace();w.write('adapter.txt','original',null);const backup=join(f.root,'backup'),manifest=backupPilot(f.store,backup,{sourceRoot:f.root,quiescent:true}),item=manifest.sidecars.find(s=>s.path.endsWith('adapter.txt'))!;
  writeFileSync(join(backup,item.path),'modified');assert.throws(()=>restorePilot(backup,join(f.root,'invalid'),manifest.sha256),/RESTORE_SIDECAR_HASH_MISMATCH/);
  w.write('.env','SYNTHETIC_PRIVATE_CONFIGURATION',null);assert.throws(()=>backupPilot(f.store,join(f.root,'secret-backup'),{sourceRoot:f.root,quiescent:true}),/PILOT_ADAPTIVE_AUTH_FILE_DENIED/);rmSync(join(w.workspacePath,'.env'));
  const linked=join(w.workspacePath,'linked');symlinkSync(process.platform==='win32'?w.workspacePath:join(w.workspacePath,'adapter.txt'),linked,process.platform==='win32'?'junction':'file');assert.throws(()=>backupPilot(f.store,join(f.root,'linked-backup'),{sourceRoot:f.root,quiescent:true}),/PILOT_SIDECAR_LINK_DENIED/);rmSync(linked,{recursive:process.platform==='win32'});
  writeFileSync(join(w.workspacePath,'too-large.bin'),Buffer.alloc(1_572_865));assert.throws(()=>backupPilot(f.store,join(f.root,'large-backup'),{sourceRoot:f.root,quiescent:true}),/PILOT_SIDECAR_FILE_INVALID/);assert(!existsSync(join(f.root,'large-backup','manifest.json')));
 }finally{f.close();}
});

test('historical V1/V2 remain supported and V2 cannot authorize adaptive sidecars',()=>{
 const f=fixture();try{const v1=backupPilot(f.store,join(f.root,'v1'));assert.equal(v1.version,'pilot-backup-v1');assert.equal(restorePilot(join(f.root,'v1'),join(f.root,'restore-v1'),v1.sha256).automaticExecution,false);
  const v2=backupPilot(f.store,join(f.root,'v2'),{sourceRoot:f.root,quiescent:true});assert.equal(v2.version,'pilot-backup-v2');assert.equal(restorePilot(join(f.root,'v2'),join(f.root,'restore-v2'),v2.sha256).automaticExecution,false);
  f.workspace().write('adapter.txt','fixture',null);const v3dir=join(f.root,'v3'),v3=backupPilot(f.store,v3dir,{sourceRoot:f.root,quiescent:true});const altered=JSON.parse(readFileSync(join(v3dir,'manifest.json'),'utf8'));altered.version='pilot-backup-v2';writeFileSync(join(v3dir,'manifest.json'),JSON.stringify(altered));assert.throws(()=>restorePilot(v3dir,join(f.root,'downgrade'),v3.sha256),/PILOT_SIDECAR_PATH_DENIED/);
 }finally{f.close();}
});
