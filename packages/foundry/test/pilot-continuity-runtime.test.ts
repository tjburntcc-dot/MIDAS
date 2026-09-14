import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PilotService } from '../src/pilot/service.ts';
import { backupPilot, restorePilot } from '../src/pilot/continuity.ts';
import { blankProjectFiles } from '../src/portfolio/project-contracts.ts';
import { TrustedProjectServer } from '../src/portfolio/project-server.ts';
import { ProjectWorkspace } from '../src/portfolio/project-workspace.ts';

function ownerProject(root:string){const project=new ProjectWorkspace(join(root,'functional-project-runtime'),'owner-project');project.seed(blankProjectFiles());const prior=project.state();prior.entities['work-item']=[{id:'owner-record-1',title:'Preserved owner record',status:'ready',notes:'This record must survive a local continuity restore.'}];prior.operations['owner-create-1']={status:201,body:{id:'owner-record-1'},requestHash:'owner-request-hash',operation:'create',entity:'work-item',recordId:'owner-record-1'};project.saveState(prior,prior.version);return project;}

test('v2 continuity binds the SQLite snapshot and bounded functional-project owner records, then reconstructs a local preview',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pilot-continuity-runtime-')),service=new PilotService(root),backup=join(root,'backup'),target=join(root,'restored');let preview:TrustedProjectServer|undefined;
 try{const company=service.knowledge.createCompany({name:'Continuity owner',goal:'Keep a local project record durable',notes:'No external access.'}),project=ownerProject(root);assert.equal(project.state().entities['work-item'][0].id,'owner-record-1');assert.throws(()=>backupPilot(service.store,join(root,'needs-confirmation'),{sourceRoot:root}),/BACKUP_QUIESCENCE_REQUIRED/);
  const manifest=backupPilot(service.store,backup,{sourceRoot:root,quiescent:true});assert.equal(manifest.version,'pilot-backup-v2');assert.notEqual(manifest.sha256,manifest.database.sha256);assert(manifest.sidecars.some(item=>item.path.endsWith('/runtime/state.json')));const receipt=restorePilot(backup,target,manifest.sha256);assert.equal(receipt.sidecars,manifest.sidecars.length);
  const restored=new PilotService(target);try{assert.equal(restored.knowledge.company(company.id).name,'Continuity owner');}finally{restored.store.close();}const reconstructed=new ProjectWorkspace(join(target,'functional-project-runtime'),'owner-project');assert.equal(reconstructed.state().entities['work-item'][0].title,'Preserved owner record');preview=new TrustedProjectServer(reconstructed);await preview.start();const response=await fetch(preview.url()+'/api/entities/work-item');const body=await response.json() as any;assert.equal(response.status,200);assert.equal(body.records[0].id,'owner-record-1');
 }finally{await preview?.close();service.store.close();rmSync(root,{recursive:true,force:true});}
});

test('v2 restore refuses changed sidecars and occupied targets, and v2 backup refuses runtime symlinks',(t)=>{
 const root=mkdtempSync(join(tmpdir(),'pilot-continuity-denial-')),service=new PilotService(root),backup=join(root,'backup'),occupied=join(root,'occupied');
 try{ownerProject(root);const manifest=backupPilot(service.store,backup,{sourceRoot:root,quiescent:true}),state=manifest.sidecars.find(item=>item.path.endsWith('/runtime/state.json'))!;writeFileSync(join(backup,state.path),'tampered owner record');assert.throws(()=>restorePilot(backup,join(root,'tampered-target'),manifest.sha256),/RESTORE_SIDECAR_HASH_MISMATCH/);mkdirSync(occupied);assert.throws(()=>restorePilot(backup,occupied,manifest.sha256),/RESTORE_TARGET_EXISTS/);
 }finally{service.store.close();rmSync(root,{recursive:true,force:true});}
 const linked=mkdtempSync(join(tmpdir(),'pilot-continuity-link-')),linkedService=new PilotService(linked);try{const project=ownerProject(linked),source=project.sourceDirectory,publicDir=join(source,'public'),saved=join(source,'public-owner');renameSync(publicDir,saved);try{symlinkSync(saved,publicDir,'junction');}catch(error:any){if(error?.code==='EPERM'){t.skip('Windows host does not permit a symlink or junction in this test sandbox.');return;}throw error;}assert.throws(()=>backupPilot(linkedService.store,join(linked,'backup'),{sourceRoot:linked,quiescent:true}),/PILOT_SIDECAR_LINK_DENIED/);}finally{linkedService.store.close();rmSync(linked,{recursive:true,force:true});}
});
