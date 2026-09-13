import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {StateStore} from '../src/state.ts';
import {hash,rawHash,scopeKey} from '../src/contracts.ts';
import {keypair,signed} from '../src/experiment/config.ts';
import {createPortfolioProposal} from '../src/portfolio/live.ts';
import {readPortfolioAccounting} from '../src/portfolio/accounting-view.ts';

function setup(){const parent=realpathSync(tmpdir()),root=mkdtempSync(join(parent,'midas-readonly-ledger-')),store=new StateStore(join(root,'portfolio.sqlite'));return {root,store,close(){store.close();const child=realpathSync(root),part=relative(parent,child);assert(part&&!part.startsWith('..')&&!isAbsolute(part));rmSync(child,{recursive:true,force:true});}};}
const snapshot=(store:StateStore)=>hash(['entities','events','records','artifacts'].map(table=>store.db.prepare('SELECT * FROM '+table).all().map(row=>({...row}))));
function signedAccount(f:ReturnType<typeof setup>){
 const keys=keypair(),proposal=createPortfolioProposal({root:f.root,id:'portfolio-031-display-test',projectId:'proj_display_fixture',credentialFile:'NEVER_READ_THIS_CREDENTIAL',mode:'live',expiresAt:'2020-01-01T00:00:00Z',countUncertaintyMinor:400,recoveryAdmissions:2,ventures:[{id:'v',goal:'Ephemeral accounting fixture',capabilities:['service.brief'],tools:[],workCalls:34,searchCalls:2}]});
 proposal.operating.approvedBy='Ephemeral fixture';proposal.operating.approvalReference='Offline unit test only';proposal.portfolio.approved=true;proposal.portfolio.operatingGrantHash=hash(proposal.operating);
 const envelope={...signed(proposal.portfolio,keys.privateKey),operatingEnvelope:signed(proposal.operating,keys.privateKey)};mkdirSync(join(f.root,'auth'));writeFileSync(join(f.root,'auth','portfolio-owner.pub'),keys.publicKey);writeFileSync(join(f.root,'portfolio.authorization.json'),JSON.stringify(envelope));
 const scope=scopeKey(proposal.operating.accountScope);f.store.put('experiment-account',scope,{authorizationHash:hash(proposal.operating),limits:proposal.operating.limits,settled:0,halted:false},null);return {proposal,envelope,scope};
}

test('unfunded owner view distinguishes zero provider activity from unknown billing/labor without creating an account',()=>{
 const f=setup();try{const before=snapshot(f.store),view=readPortfolioAccounting(f.store,f.root) as any;assert.equal(view.status,'unfunded');assert.equal(view.callsUsed,0);assert.equal(view.retainedMinor,0);assert.equal(view.settledMinor,null);assert.equal(view.remainingMinor,null);assert.equal(view.settledBillingStatus,'not_applicable');assert.equal(view.executionAuthority,false);assert.equal(snapshot(f.store),before);}finally{f.close();}
});

test('model-disabled owner view reads only its signed persisted account, preserves count buffer once and keeps settlement separate',()=>{
 const f=setup();try{
  const {envelope,scope}=signedAccount(f);f.store.transaction(()=>{
   const account=f.store.get('experiment-account',scope);f.store.put('experiment-account',scope,{...account,settled:5},account._version);
   f.store.put('model-attempt',scope+'/settled',{reservation:0,invoice:{minorUnits:5},cost:{status:'known',money:{currency:'USD',minorUnits:5}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',metadata:{source:'actual-model'}},null);
   f.store.put('model-attempt',scope+'/retained',{reservation:123,invoice:null,cost:{status:'provisional',money:{currency:'USD',minorUnits:11}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',errorCode:'MODEL_OUTPUT_INVALID',metadata:{source:'actual-model'}},null);
   f.store.put('model-attempt','mason/portfolio-models/another-grant/portfolio-live-v1/fixture/foreign',{reservation:990000,cost:{status:'provisional',money:{currency:'USD',minorUnits:990000}},metadata:{source:'actual-model'}},null);
  });
  const before=snapshot(f.store),view=readPortfolioAccounting(f.store,f.root) as any;assert.equal(view.status,'available');assert.equal(view.ledgerEvidence,'signed_current_grant');assert.equal(view.callsUsed,2);assert.equal(view.inferenceDispatches,2);assert.equal(view.countRequests,2);assert.equal(view.provisionalMinor,11);assert.equal(view.settledMinor,5);assert.equal(view.settlementCount,1);assert.equal(view.settledBillingStatus,'partially_recorded');assert.equal(view.retainedExposureStatus,'ledger_verified');assert.equal(view.retainedMinor,523);assert.equal(view.countBufferMinor,400);assert.equal(view.remainingMinor,4654);assert.equal(view.expired,true);assert.equal(view.executionAuthority,false);assert.equal(snapshot(f.store),before);
  assert.equal(view.estimatedAttempts,1);assert.equal(view.unknownCostAttempts,0,'authoritatively settled attempts are not unknown');
  envelope.payload.approvedBy='Tampered';writeFileSync(join(f.root,'portfolio.authorization.json'),JSON.stringify(envelope));const invalid=readPortfolioAccounting(f.store,f.root) as any;assert.equal(invalid.status,'unavailable');assert.equal(invalid.retainedMinor,undefined);assert.equal(snapshot(f.store),before);
 }finally{f.close();}
});

test('unknown costs remain unknown while mixed estimates expose only their recorded subtotal and retain every reservation',()=>{
 const f=setup();try{
  const {scope,proposal}=signedAccount(f);
  f.store.put('model-attempt',scope+'/unknown',{reservation:123,invoice:null,cost:{status:'unknown',money:null},inferenceDispatchIntent:true,countDispatchIntent:true,errorCode:'PROVIDER_TRANSPORT_UNCERTAIN',metadata:{source:'actual-model'}},null);
  const beforeUnknown=snapshot(f.store),unknown=readPortfolioAccounting(f.store,f.root) as any;
  assert.equal(unknown.status,'available');assert.equal(unknown.provisionalMinor,null,'an unavailable estimate must not become a zero-dollar estimate');assert.equal(unknown.estimatedAttempts,0);assert.equal(unknown.unknownCostAttempts,1);assert.equal(unknown.settledMinor,null);assert.equal(unknown.settlementCount,0);assert.equal(unknown.settledBillingStatus,'unknown');assert.equal(unknown.callsUsed,1);assert.equal(unknown.inferenceDispatches,1);assert.equal(unknown.countRequests,1);assert.equal(unknown.retainedMinor,523);assert.equal(unknown.remainingMinor,proposal.operating.limits.totalMinor-523);assert.equal(snapshot(f.store),beforeUnknown);
  f.store.put('model-attempt',scope+'/estimated',{reservation:123,invoice:null,cost:{status:'provisional',money:{currency:'USD',minorUnits:17}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',metadata:{source:'actual-model'}},null);
  const beforeMixed=snapshot(f.store),mixed=readPortfolioAccounting(f.store,f.root) as any;
  assert.equal(mixed.status,'available');assert.equal(mixed.provisionalMinor,17,'only the recorded estimate contributes to the subtotal');assert.equal(mixed.estimatedAttempts,1);assert.equal(mixed.unknownCostAttempts,1);assert.equal(mixed.settledMinor,null);assert.equal(mixed.callsUsed,2);assert.equal(mixed.inferenceDispatches,2);assert.equal(mixed.countRequests,2);assert.equal(mixed.retainedMinor,646,'both full reservations plus one count buffer remain retained');assert.equal(mixed.countBufferMinor,400);assert.equal(mixed.remainingMinor,proposal.operating.limits.totalMinor-646);assert.equal(mixed.executionAuthority,false);assert.equal(snapshot(f.store),beforeMixed);
 }finally{f.close();}
});

test('missing grant separates an offline fixture from retained provider receipt evidence without treating a worker scope name as provenance',()=>{
 const f=setup();try{
  f.store.put('model-attempt','mason/portfolio-models/old/portfolio-live-v1/fixture/offline',{metadata:{source:'offline_mock'},reservation:123},null);
  const fixture=readPortfolioAccounting(f.store,f.root) as any;assert.equal(fixture.status,'unavailable');assert.equal(fixture.ledgerEvidence,'historical_fixture');assert.match(fixture.reason,/Historical fixture ledger/);
  const g=setup();try{g.store.put('model-attempt','mason/portfolio-models/old/portfolio-live-v1/fixture/actual',{metadata:{source:'actual-model'},inferenceDispatchIntent:true,observation:{inferenceHTTP:{httpStatus:200,providerRequestId:'req_retained'}},reservation:123},null);const actual=readPortfolioAccounting(g.store,g.root) as any;assert.equal(actual.ledgerEvidence,'historical_provider_evidence');assert.match(actual.reason,/Historical provider receipts/);}finally{g.close();}
 }finally{f.close();}
});

test('signed ledger makes retained exposure available even when there were no provider dispatches or settlements',()=>{
 const f=setup();try{signedAccount(f);const view=readPortfolioAccounting(f.store,f.root) as any;assert.equal(view.status,'available');assert.equal(view.inferenceDispatches,0);assert.equal(view.settledMinor,null);assert.equal(view.settledBillingStatus,'not_applicable');assert.equal(view.retainedExposureStatus,'ledger_verified');assert.equal(view.retainedMinor,400,'the signed count buffer is known exposure even before a dispatch');}finally{f.close();}
});

test('unsigned R4 displays only a verified preserved parent ledger and fails closed when its authority copy is tampered',()=>{
 const parent=setup();let relocated:StateStore|undefined;try{
  const {scope}=signedAccount(parent);parent.store.put('model-attempt',scope+'/preserved',{reservation:123,invoice:null,cost:{status:'provisional',money:{currency:'USD',minorUnits:17}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',metadata:{source:'actual-model'}},null);
  const r4Root=join(parent.root,'unsigned-r4');mkdirSync(r4Root);const database=join(r4Root,'portfolio.sqlite');parent.store.db.prepare('VACUUM INTO ?').run(database);
  mkdirSync(join(r4Root,'historical-authority','auth'),{recursive:true});copyFileSync(join(parent.root,'portfolio.authorization.json'),join(r4Root,'historical-authority','portfolio.authorization.json'));copyFileSync(join(parent.root,'auth','portfolio-owner.pub'),join(r4Root,'historical-authority','auth','portfolio-owner.pub'));
  const copied=new DatabaseSync(database);copied.exec('PRAGMA journal_mode=WAL');const account=copied.prepare("SELECT body FROM entities WHERE kind='experiment-account' AND key=?").get(scope),attempts=copied.prepare("SELECT key,body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=? ORDER BY key").all((scope+'/').length,scope+'/').map(row=>({key:String(row.key),value:JSON.parse(String(row.body))}));const historicalLedgerHash=hash({account:JSON.parse(String(account.body)),attempts});copied.close();
  writeFileSync(join(r4Root,'restore.json'),JSON.stringify({sourceRoot:parent.root,backupManifestHash:'a'.repeat(64),originalDatabaseHash:rawHash(database),historicalLedgerHash,credentialsCopied:false,privateKeysCopied:false,activeAuthorizationInstalled:false}));
  relocated=new StateStore(database);const before=snapshot(relocated),view=readPortfolioAccounting(relocated,r4Root) as any;
  assert.equal(view.status,'available');assert.equal(view.historicalOnly,true);assert.equal(view.executionAuthority,false);assert.equal(view.ledgerEvidence,'preserved_historical_signed_ledger');assert.equal(view.retainedMinor,523);assert.equal(view.settledBillingStatus,'not_recorded');assert.match(view.reason,/no active R4 grant/);assert.equal(snapshot(relocated),before);
  writeFileSync(join(r4Root,'historical-authority','portfolio.authorization.json'),'{}');const tampered=readPortfolioAccounting(relocated,r4Root) as any;assert.equal(tampered.status,'unavailable');assert.equal(tampered.retainedMinor,undefined);
 }finally{relocated?.close();parent.close();}
});
