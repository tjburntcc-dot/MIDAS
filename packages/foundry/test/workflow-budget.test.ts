import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {StateStore} from '../src/state.ts';
import {ModelLedger} from '../src/experiment/ledger.ts';
import {accountScope} from '../src/workflow/config.ts';
const caps={totalMinor:104,overheadReserve:{minor:52,reason:'Unknown count exposure buffer'},stages:{smoke:{minor:104,attempts:2},development:{minor:0,attempts:0},validation:{minor:0,attempts:0},evaluation:{minor:0,attempts:0}},allocations:[{metadataKey:'workflow',value:'one',minor:52,attempts:1}]};
test('two independent processes compete atomically for one workflow allocation and fixed count buffer',async()=>{
 const db=join(mkdtempSync(join(tmpdir(),'workflow-cap-')),'ledger.sqlite');let store=new StateStore(db);new ModelLedger(store,accountScope,'mock-only',caps);store.close();
 const moduleURL=(path:string)=>pathToFileURL(join(process.cwd(),'packages/foundry/src',path)).href;
 const script=`import {StateStore} from ${JSON.stringify(moduleURL('state.ts'))};import {ModelLedger} from ${JSON.stringify(moduleURL('experiment/ledger.ts'))};import {rawHash} from ${JSON.stringify(moduleURL('contracts.ts'))};const store=new StateStore(${JSON.stringify(db)});const ledger=new ModelLedger(store,${JSON.stringify(accountScope)},'mock-only',${JSON.stringify(caps)});try{await ledger.port('smoke',{workflow:'one'}).prepare({scope:${JSON.stringify(accountScope)},requestId:process.argv[1]}, {minorUnits:52,currency:'USD'},rawHash('{}'),'{}');process.exitCode=0;}catch{process.exitCode=3;}finally{store.close();}`;
 const child=(id:string)=>new Promise<number|null>((done,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',script,id],{windowsHide:true,stdio:'ignore'});p.on('error',reject);p.on('exit',done);});
 const codes=await Promise.all([child('one'),child('two')]);assert.deepEqual(codes.sort(),[0,3]);store=new StateStore(db);const ledger=new ModelLedger(store,accountScope,'mock-only',caps);assert.equal(ledger.rows().length,1);assert.equal(ledger.totals().reserved+ledger.carryExposure(),104);store.close();
});
