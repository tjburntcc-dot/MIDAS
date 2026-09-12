import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {StateStore} from '../src/state.ts';
import {hash,scopeKey} from '../src/contracts.ts';
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
 const f=setup();try{const before=snapshot(f.store),view=readPortfolioAccounting(f.store,f.root) as any;assert.equal(view.status,'unfunded');assert.equal(view.callsUsed,0);assert.equal(view.retainedMinor,0);assert.equal(view.settledMinor,null);assert.equal(view.remainingMinor,null);assert.equal(view.executionAuthority,false);assert.equal(snapshot(f.store),before);}finally{f.close();}
});

test('model-disabled owner view reads only its signed persisted account, preserves count buffer once and keeps settlement separate',()=>{
 const f=setup();try{
  const {envelope,scope}=signedAccount(f);f.store.transaction(()=>{
   const account=f.store.get('experiment-account',scope);f.store.put('experiment-account',scope,{...account,settled:5},account._version);
   f.store.put('model-attempt',scope+'/settled',{reservation:0,invoice:{minorUnits:5},cost:{status:'known',money:{currency:'USD',minorUnits:5}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',metadata:{source:'actual-model'}},null);
   f.store.put('model-attempt',scope+'/retained',{reservation:123,invoice:null,cost:{status:'provisional',money:{currency:'USD',minorUnits:11}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',errorCode:'MODEL_OUTPUT_INVALID',metadata:{source:'actual-model'}},null);
   f.store.put('model-attempt','mason/portfolio-models/another-grant/portfolio-live-v1/fixture/foreign',{reservation:990000,cost:{status:'provisional',money:{currency:'USD',minorUnits:990000}},metadata:{source:'actual-model'}},null);
  });
  const before=snapshot(f.store),view=readPortfolioAccounting(f.store,f.root) as any;assert.equal(view.status,'available');assert.equal(view.callsUsed,2);assert.equal(view.inferenceDispatches,2);assert.equal(view.countRequests,2);assert.equal(view.provisionalMinor,11);assert.equal(view.settledMinor,5);assert.equal(view.settlementCount,1);assert.equal(view.retainedMinor,523);assert.equal(view.countBufferMinor,400);assert.equal(view.remainingMinor,4654);assert.equal(view.expired,true);assert.equal(view.executionAuthority,false);assert.equal(snapshot(f.store),before);
  assert.equal(view.estimatedAttempts,1);assert.equal(view.unknownCostAttempts,0,'authoritatively settled attempts are not unknown');
  envelope.payload.approvedBy='Tampered';writeFileSync(join(f.root,'portfolio.authorization.json'),JSON.stringify(envelope));const invalid=readPortfolioAccounting(f.store,f.root) as any;assert.equal(invalid.status,'unavailable');assert.equal(invalid.retainedMinor,undefined);assert.equal(snapshot(f.store),before);
 }finally{f.close();}
});

test('unknown costs remain unknown while mixed estimates expose only their recorded subtotal and retain every reservation',()=>{
 const f=setup();try{
  const {scope,proposal}=signedAccount(f);
  f.store.put('model-attempt',scope+'/unknown',{reservation:123,invoice:null,cost:{status:'unknown',money:null},inferenceDispatchIntent:true,countDispatchIntent:true,errorCode:'PROVIDER_TRANSPORT_UNCERTAIN',metadata:{source:'actual-model'}},null);
  const beforeUnknown=snapshot(f.store),unknown=readPortfolioAccounting(f.store,f.root) as any;
  assert.equal(unknown.status,'available');assert.equal(unknown.provisionalMinor,null,'an unavailable estimate must not become a zero-dollar estimate');assert.equal(unknown.estimatedAttempts,0);assert.equal(unknown.unknownCostAttempts,1);assert.equal(unknown.settledMinor,null);assert.equal(unknown.settlementCount,0);assert.equal(unknown.callsUsed,1);assert.equal(unknown.inferenceDispatches,1);assert.equal(unknown.countRequests,1);assert.equal(unknown.retainedMinor,523);assert.equal(unknown.remainingMinor,proposal.operating.limits.totalMinor-523);assert.equal(snapshot(f.store),beforeUnknown);
  f.store.put('model-attempt',scope+'/estimated',{reservation:123,invoice:null,cost:{status:'provisional',money:{currency:'USD',minorUnits:17}},inferenceDispatchIntent:true,countDispatchIntent:true,finishedAt:'2020-01-01',metadata:{source:'actual-model'}},null);
  const beforeMixed=snapshot(f.store),mixed=readPortfolioAccounting(f.store,f.root) as any;
  assert.equal(mixed.status,'available');assert.equal(mixed.provisionalMinor,17,'only the recorded estimate contributes to the subtotal');assert.equal(mixed.estimatedAttempts,1);assert.equal(mixed.unknownCostAttempts,1);assert.equal(mixed.settledMinor,null);assert.equal(mixed.callsUsed,2);assert.equal(mixed.inferenceDispatches,2);assert.equal(mixed.countRequests,2);assert.equal(mixed.retainedMinor,646,'both full reservations plus one count buffer remain retained');assert.equal(mixed.countBufferMinor,400);assert.equal(mixed.remainingMinor,proposal.operating.limits.totalMinor-646);assert.equal(mixed.executionAuthority,false);assert.equal(snapshot(f.store),beforeMixed);
 }finally{f.close();}
});

test('missing grant with prior actual-model evidence displays unavailable accounting rather than inventing zero exposure',()=>{
 const f=setup();try{f.store.put('model-attempt','mason/portfolio-models/old/portfolio-live-v1/fixture/1',{metadata:{source:'actual-model'},reservation:123},null);const view=readPortfolioAccounting(f.store,f.root) as any;assert.equal(view.status,'unavailable');assert.equal(view.provisionalMinor,undefined);assert.equal(view.retainedMinor,undefined);}finally{f.close();}
});
