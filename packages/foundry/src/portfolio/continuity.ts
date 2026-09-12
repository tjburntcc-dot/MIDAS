/** Consistent local backup and fresh-root restore. No deployment, credential
 * copying, signing, execution, deletion or historical-authority transfer. */
import { DatabaseSync } from 'node:sqlite';
import { constants,existsSync,mkdirSync,lstatSync,readFileSync,writeFileSync,openSync,closeSync,fsyncSync,copyFileSync,statSync } from 'node:fs';
import { dirname,join,resolve,isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { hash,rawHash,requireThat } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { portfolioImplementationHash } from './live.ts';

const authorityFiles=['portfolio.authorization.json','auth/portfolio-owner.pub'] as const;
const tableQueries={entities:'SELECT kind,key,version,body FROM entities ORDER BY kind,key',events:'SELECT seq,scope,kind,body FROM events ORDER BY seq',records:'SELECT scope,id,version,sha256,body FROM records ORDER BY scope,id',artifacts:'SELECT scope,id,sha256,body FROM artifacts ORDER BY scope,id'};
type LogicalSnapshot={schemaVersion:number;tables:Record<string,{rows:number;sha256:string}>;schemaHash:string};
export type BackupManifest={version:'portfolio-backup-v1';createdAt:string;sourceRoot:string;sourceHost:string;implementationHash:string;database:{path:'portfolio.sqlite';sha256:string;bytes:number;logical:LogicalSnapshot};authority:Array<{path:string;sha256:string;bytes:number}>;credentialsCopied:false;grantDisposition:'historical-evidence-only';snapshotMethod:'sqlite-vacuum-into';status:'complete'};
function safeAbsolute(path:string){requireThat(typeof path==='string'&&isAbsolute(path),'CONTINUITY_ABSOLUTE_PATH_REQUIRED');const absolute=resolve(path);for(let p=absolute;;p=dirname(p)){if(existsSync(p))requireThat(!lstatSync(p).isSymbolicLink(),'CONTINUITY_LINK_PATH_DENIED');if(dirname(p)===p)break;}return absolute;}
function fileInfo(path:string){const stat=statSync(path);requireThat(stat.isFile()&&stat.size<=536870912,'CONTINUITY_FILE_INVALID');return {sha256:rawHash(readFileSync(path)),bytes:stat.size};}
function flush(path:string){const fd=openSync(path,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}}
function writeNew(path:string,value:string|Buffer){const fd=openSync(path,'wx');try{writeFileSync(fd,value);fsyncSync(fd);}finally{closeSync(fd);}}
function inspectDatabase(file:string):LogicalSnapshot{const db=new DatabaseSync(file,{readOnly:true});try{db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');const integrity=db.prepare('PRAGMA integrity_check').all();requireThat(integrity.length===1&&Object.values(integrity[0])[0]==='ok','CONTINUITY_DATABASE_CORRUPT');requireThat(db.prepare('PRAGMA foreign_key_check').all().length===0,'CONTINUITY_FOREIGN_KEY_FAILURE');const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);requireThat(version===1,'CONTINUITY_SCHEMA_UNSUPPORTED');const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>({...row}));const tables:LogicalSnapshot['tables']={};for(const [name,query]of Object.entries(tableQueries)){const rows=db.prepare(query).all().map(row=>({...row}));tables[name]={rows:rows.length,sha256:hash(rows)};}return {schemaVersion:version,tables,schemaHash:hash(schema)};}finally{db.close();}}
function authorityBytes(sourceRoot:string,path:string){const source=safeAbsolute(join(sourceRoot,path)),bytes=readFileSync(source);requireThat(bytes.length<=1048576,'CONTINUITY_AUTHORITY_TOO_LARGE');const text=bytes.toString('utf8');requireThat(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),'CONTINUITY_PRIVATE_KEY_DENIED');if(path.endsWith('.pub'))requireThat(text.includes('-----BEGIN PUBLIC KEY-----'),'CONTINUITY_PUBLIC_KEY_REQUIRED');else{const parsed=JSON.parse(text);const visit=(v:any)=>{if(v&&typeof v==='object')for(const [k,value]of Object.entries(v)){requireThat(!/^(?:apiKey|api_key|privateKey|private_key|access_token|refresh_token|password|credential)$/i.test(k),'CONTINUITY_INLINE_CREDENTIAL_DENIED');visit(value);}};visit(parsed);}return bytes;}

export function backupPortfolio(store:StateStore,options:{sourceRoot:string;backupRoot:string}){
 const sourceRoot=safeAbsolute(options.sourceRoot),backupRoot=safeAbsolute(options.backupRoot);requireThat(!existsSync(backupRoot),'CONTINUITY_TARGET_EXISTS');requireThat(existsSync(dirname(backupRoot)),'CONTINUITY_PARENT_REQUIRED');
 const source=store.db.prepare('PRAGMA database_list').all().find(row=>row.name==='main');requireThat(source&&resolve(String(source.file))===join(sourceRoot,'portfolio.sqlite'),'CONTINUITY_SOURCE_DATABASE_MISMATCH');
 const authorities=authorityFiles.filter(path=>existsSync(join(sourceRoot,path))).map(path=>({path,bytes:authorityBytes(sourceRoot,path)}));
 mkdirSync(backupRoot);const file=join(backupRoot,'portfolio.sqlite');
 // Parameter binding prevents SQL/path interpolation; SQLite includes committed
 // WAL contents in one consistent snapshot even while other readers are open.
 store.db.prepare('VACUUM INTO ?').run(file);flush(file);const logical=inspectDatabase(file),database={path:'portfolio.sqlite' as const,...fileInfo(file),logical};
 const authority:BackupManifest['authority']=[];for(const item of authorities){const target=join(backupRoot,item.path);if(!existsSync(dirname(target)))mkdirSync(dirname(target));writeNew(target,item.bytes);authority.push({path:item.path,...fileInfo(target)});}
 const manifest:BackupManifest={version:'portfolio-backup-v1',createdAt:new Date().toISOString(),sourceRoot,sourceHost:hostname(),implementationHash:portfolioImplementationHash(),database,authority,credentialsCopied:false,grantDisposition:'historical-evidence-only',snapshotMethod:'sqlite-vacuum-into',status:'complete'};
 const manifestHash=hash(manifest);writeNew(join(backupRoot,'manifest.json'),JSON.stringify({manifest,sha256:manifestHash},null,2)+'\n');
 return {backupRoot,manifestHash,manifest,verification:'SQLite integrity, schema, logical table digests and file hashes checked',credentialsCopied:false};
}
export function verifyPortfolioBackup(options:{backupRoot:string;expectedManifestHash:string}){
 const backupRoot=safeAbsolute(options.backupRoot);requireThat(/^[a-f0-9]{64}$/.test(options.expectedManifestHash),'CONTINUITY_MANIFEST_ANCHOR_REQUIRED');const envelope=JSON.parse(readFileSync(join(backupRoot,'manifest.json'),'utf8')),manifest=envelope.manifest as BackupManifest;
 requireThat(manifest?.version==='portfolio-backup-v1'&&manifest.status==='complete'&&manifest.credentialsCopied===false&&manifest.grantDisposition==='historical-evidence-only'&&manifest.database.path==='portfolio.sqlite'&&manifest.snapshotMethod==='sqlite-vacuum-into','CONTINUITY_MANIFEST_INVALID');requireThat(hash(manifest)===envelope.sha256&&envelope.sha256===options.expectedManifestHash,'CONTINUITY_MANIFEST_HASH_MISMATCH');
 const file=safeAbsolute(join(backupRoot,manifest.database.path)),info=fileInfo(file);requireThat(info.sha256===manifest.database.sha256&&info.bytes===manifest.database.bytes,'CONTINUITY_DATABASE_HASH_MISMATCH');requireThat(hash(inspectDatabase(file))===hash(manifest.database.logical),'CONTINUITY_LOGICAL_DIGEST_MISMATCH');
 requireThat(Array.isArray(manifest.authority)&&new Set(manifest.authority.map(a=>a.path)).size===manifest.authority.length&&manifest.authority.every(a=>(authorityFiles as readonly string[]).includes(a.path)),'CONTINUITY_AUTHORITY_PATH_DENIED');for(const a of manifest.authority){const bytes=authorityBytes(backupRoot,a.path);requireThat(bytes.length===a.bytes&&rawHash(bytes)===a.sha256,'CONTINUITY_AUTHORITY_HASH_MISMATCH');}
 return {backupRoot,manifest,manifestHash:envelope.sha256};
}
export function restorePortfolio(options:{backupRoot:string;targetRoot:string;expectedManifestHash:string}){
 const targetRoot=safeAbsolute(options.targetRoot);requireThat(!existsSync(targetRoot),'CONTINUITY_TARGET_EXISTS');requireThat(existsSync(dirname(targetRoot)),'CONTINUITY_PARENT_REQUIRED');const backup=verifyPortfolioBackup(options);requireThat(backup.manifest.implementationHash===portfolioImplementationHash(),'CONTINUITY_CODE_MISMATCH');
 // No target is created until source validation succeeds. mkdir and exclusive
 // copying also reject a competing restore or an already occupied destination.
 mkdirSync(targetRoot);const database=join(targetRoot,'portfolio.sqlite');copyFileSync(join(backup.backupRoot,'portfolio.sqlite'),database,constants.COPYFILE_EXCL);flush(database);requireThat(fileInfo(database).sha256===backup.manifest.database.sha256&&hash(inspectDatabase(database))===hash(backup.manifest.database.logical),'CONTINUITY_RESTORE_READBACK_FAILED');
 for(const a of backup.manifest.authority){const target=join(targetRoot,'historical-authority',a.path);mkdirSync(dirname(target),{recursive:true});writeNew(target,authorityBytes(backup.backupRoot,a.path));}
 const receipt={version:'portfolio-restore-v1',restoredAt:new Date().toISOString(),backupManifestHash:backup.manifestHash,targetRoot,database,sourceRoot:backup.manifest.sourceRoot,sourceHost:backup.manifest.sourceHost,targetHost:hostname(),implementationHash:portfolioImplementationHash(),credentialsCopied:false,activeAuthorizationInstalled:false,recoveryRequired:true,requirements:['Start with model execution disabled.','Confirm the old runtime has stopped before any queue continuation.','Run Portfolio.recover with explicit old-owner liveness evidence; uncertain steps remain for reconciliation.','Reconcile unknown model/tool effects before redispatch.','A relocated root, host or profile requires a separately approved authority path; historical grants are evidence only.']};writeNew(join(targetRoot,'restore.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
