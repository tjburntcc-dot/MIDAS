/** Read-only owner display. Never loads a credential, creates a model account,
 * validates execution readiness or grants provider authority. */
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {hash,requireThat,scopeKey,safeInteger} from '../contracts.ts';
import {verified} from '../experiment/config.ts';
import {StateStore} from '../state.ts';

export type PortfolioAccountingView={
 currency:'USD';readOnly:true;executionAuthority:false;scope:string;status:'unfunded'|'available'|'unavailable';reason:string;
 mode?:string;grantId?:string;grantHash?:string;expired?:boolean;revoked?:boolean;halted?:boolean;
 callsUsed?:number;callLimit?:number;inferenceDispatches?:number;countRequests?:number;
 provisionalMinor?:number|null;estimatedAttempts?:number;unknownCostAttempts?:number;
 settledMinor?:number|null;settlementCount?:number;retainedMinor?:number;countBufferMinor?:number;remainingMinor?:number|null;
 pendingAttempts?:number;failedAttempts?:number;
 /** Persisted evidence class. It does not imply a provider charge or a customer outcome. */
 ledgerEvidence?:'signed_current_grant'|'preserved_historical_signed_ledger'|'historical_fixture'|'historical_provider_evidence'|'historical_ledger'|'mixed_historical';
 /** Historical signed evidence may be displayed in a relocated workspace, but
  * can never authorize that workspace to run a model. */
 historicalOnly?:boolean;
 /** `not_recorded` is a known absence of an invoice in a readable ledger;
  * `unknown` means an attempt itself has an unknown cost. */
 settledBillingStatus?:'not_applicable'|'recorded'|'partially_recorded'|'not_recorded'|'unknown';
 /** Reservation exposure is known from the signed ledger even when billing is absent. */
 retainedExposureStatus?:'ledger_verified';
 historical?:unknown;combinedCallsUsed?:number;combinedCallLimit?:number;combinedProvisionalMinor?:number|null;countBufferReused?:boolean;
};
const base={currency:'USD',readOnly:true,executionAuthority:false,scope:'This portfolio grant only; historical missions and development subscriptions excluded.'} as const;
function ledgerView(store:StateStore,grant:any,inner:any,historicalOnly:boolean):PortfolioAccountingView{
 const key=scopeKey(inner.accountScope),account=store.get('experiment-account',key);
 requireThat(account&&account.authorizationHash===hash(inner)&&hash(account.limits)===hash(inner.limits),'ACCOUNTING_LEDGER_BINDING');
 const prefix=key+'/',rows=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=?").all(prefix.length,prefix).map(r=>JSON.parse(String(r.body)));
 const total=(select:(r:any)=>number)=>rows.reduce((sum,r)=>{const value=select(r);safeInteger(value);return sum+value;},0);
 const reservation=total(r=>r.reservation),settled=total(r=>r.invoice?.minorUnits??0),provisional=total(r=>r.cost?.status==='provisional'?r.cost.money.minorUnits:0),settlementCount=rows.filter(r=>r.invoice).length;
 const estimatedAttempts=rows.filter(r=>r.cost?.status==='provisional').length,unknownCostAttempts=rows.filter(r=>!r.invoice&&r.cost?.status!=='provisional').length;
 const countBuffer=inner.limits.overheadReserve?.minor??0;safeInteger(countBuffer);const carry=(inner.limits.carryIn??[]).reduce((sum:number,r:any)=>{safeInteger(r.exposureMinor);return sum+r.exposureMinor;},0);safeInteger(inner.limits.totalMinor);safeInteger(inner.limits.stages.development.attempts);
 const dispatches=grant.mode==='live'?rows.filter(r=>r.inferenceDispatchIntent).length:0;
 const settledBillingStatus:PortfolioAccountingView['settledBillingStatus']=!dispatches?'not_applicable':settlementCount===dispatches?'recorded':settlementCount?'partially_recorded':unknownCostAttempts?'unknown':'not_recorded';
 return {...base,...(grant.continuation?{scope:'Exact continuation plus explicitly carried Mission 031 parent exposure; other missions and subscriptions excluded.',historical:grant.continuation.historical,combinedCallsUsed:rows.length+grant.continuation.historical.admissions,combinedCallLimit:grant.continuation.combinedAdmissionLimit,combinedProvisionalMinor:unknownCostAttempts&&!estimatedAttempts?null:provisional+grant.continuation.historical.provisionalMinor,countBufferReused:true}:{}),status:'available',ledgerEvidence:historicalOnly?'preserved_historical_signed_ledger':'signed_current_grant',historicalOnly,settledBillingStatus,retainedExposureStatus:'ledger_verified',mode:grant.mode,grantId:grant.id,grantHash:hash(grant),expired:historicalOnly||Date.parse(grant.expiresAt)<=Date.now(),revoked:Boolean(store.get('portfolio-revocation',hash(grant))||store.get('operating-revocation',hash(inner))),halted:Boolean(account.halted),callsUsed:rows.length,callLimit:inner.limits.stages.development.attempts,inferenceDispatches:dispatches,countRequests:grant.mode==='live'?rows.filter(r=>r.countDispatchIntent).length:0,provisionalMinor:unknownCostAttempts&&!estimatedAttempts?null:provisional,estimatedAttempts,unknownCostAttempts,settledMinor:settlementCount?settled:null,settlementCount,retainedMinor:reservation+countBuffer+carry,countBufferMinor:countBuffer,remainingMinor:inner.limits.totalMinor-reservation-settled-countBuffer-carry,pendingAttempts:rows.filter(r=>!r.finishedAt).length,failedAttempts:rows.filter(r=>r.errorCode).length,reason:historicalOnly?'Preserved parent signed ledger verified against this copied database. It is historical evidence only: no active R4 grant or execution authority is present. Reservations are exposure, not provider charges; settlements require provider evidence.':'Persisted signed-grant ledger, readable even while model execution is disabled. Reservations are exposure, not actual charges; settlements depend on underlying provider evidence.'};
}
function ledgerHash(store:StateStore,key:string){
 const account=store.db.prepare("SELECT body FROM entities WHERE kind='experiment-account' AND key=?").get(key);requireThat(account,'HISTORICAL_LEDGER_ACCOUNT_MISSING');
 const prefix=key+'/',attempts=store.db.prepare("SELECT key,body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=? ORDER BY key").all(prefix.length,prefix).map(row=>({key:String(row.key),value:JSON.parse(String(row.body))}));
 return hash({account:JSON.parse(String(account.body)),attempts});
}
function preservedHistoricalLedger(store:StateStore,root:string):PortfolioAccountingView{
 const historical=join(root,'historical-authority'),restore=JSON.parse(readFileSync(join(root,'restore.json'),'utf8'));
 requireThat(typeof restore.sourceRoot==='string'&&typeof restore.backupManifestHash==='string'&&/^[a-f0-9]{64}$/.test(restore.backupManifestHash)&&typeof restore.originalDatabaseHash==='string'&&/^[a-f0-9]{64}$/.test(restore.originalDatabaseHash)&&typeof restore.historicalLedgerHash==='string'&&/^[a-f0-9]{64}$/.test(restore.historicalLedgerHash),'HISTORICAL_RESTORE_INVALID');
 requireThat(restore.activeAuthorizationInstalled===false&&restore.credentialsCopied===false&&restore.privateKeysCopied===false,'HISTORICAL_AUTHORITY_NOT_READONLY');
 const envelope=JSON.parse(readFileSync(join(historical,'portfolio.authorization.json'),'utf8')),publicKey=readFileSync(join(historical,'auth','portfolio-owner.pub'),'utf8'),grant=verified(envelope,publicKey) as any,inner=verified(envelope.operatingEnvelope,publicKey) as any;
 requireThat(grant.kind==='portfolio-execution-grant-v1'&&grant.approved===true&&grant.root===resolve(restore.sourceRoot)&&grant.operatingGrantHash===hash(inner)&&inner.kind==='operations-model-grant-v1'&&hash(grant.accountScope)===hash(inner.accountScope)&&grant.accountScope.businessId==='portfolio-models','HISTORICAL_GRANT_SCOPE');
 requireThat(ledgerHash(store,scopeKey(inner.accountScope))===restore.historicalLedgerHash,'HISTORICAL_LEDGER_CHANGED');
 return ledgerView(store,grant,inner,true);
}
export function readPortfolioAccounting(store:StateStore,root:string):PortfolioAccountingView{
 const path=join(root,'portfolio.authorization.json');
 if(!existsSync(path)){
  try{return preservedHistoricalLedger(store,root);}catch{}
  const historical=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key LIKE 'mason/portfolio-models/%'").all().map(r=>JSON.parse(String(r.body)));
  const fixture=historical.some((row:any)=>/fixture|mock|offline|synthetic/i.test(String(row.metadata?.source??'')));
  const providerEvidence=historical.some((row:any)=>row.metadata?.source==='actual-model'&&row.inferenceDispatchIntent===true&&row.observation?.inferenceHTTP?.httpStatus===200&&typeof row.observation.inferenceHTTP.providerRequestId==='string');
  const ledgerEvidence=fixture&&providerEvidence?'mixed_historical':providerEvidence?'historical_provider_evidence':fixture?'historical_fixture':'historical_ledger';
  const reason=ledgerEvidence==='historical_fixture'?'Historical fixture ledger exists without an active signed grant. Amounts are unavailable, not zero.':ledgerEvidence==='historical_provider_evidence'?'Historical provider receipts exist without an active signed grant. The receipts remain visible as historical evidence; accounting amounts are unavailable, not zero.':'Historical ledger exists without its active signed grant. Amounts are unavailable, not zero.';
  return historical.length?{...base,status:'unavailable',ledgerEvidence,reason}:{...base,status:'unfunded',ledgerEvidence:'signed_current_grant',settledBillingStatus:'not_applicable',callsUsed:0,inferenceDispatches:0,countRequests:0,provisionalMinor:0,estimatedAttempts:0,unknownCostAttempts:0,settledMinor:null,settlementCount:0,retainedMinor:0,countBufferMinor:0,remainingMinor:null,callLimit:0,reason:'No signed portfolio grant or actual provider admissions. The proposed ceiling is not reserved spending.'};
 }
 try{
  const envelope=JSON.parse(readFileSync(path,'utf8')),publicKey=readFileSync(join(root,'auth','portfolio-owner.pub'),'utf8'),grant=verified(envelope,publicKey) as any,inner=verified(envelope.operatingEnvelope,publicKey) as any;
  requireThat(grant.kind==='portfolio-execution-grant-v1'&&grant.root===resolve(root)&&grant.approved===true&&grant.operatingGrantHash===hash(inner)&&inner.kind==='operations-model-grant-v1'&&hash(grant.accountScope)===hash(inner.accountScope)&&grant.accountScope.businessId==='portfolio-models','ACCOUNTING_GRANT_SCOPE');
  return ledgerView(store,grant,inner,false);
 }catch{
  return {...base,status:'unavailable',reason:'The retained grant, public signature or ledger binding could not be verified. Accounting is unavailable, not zero; no authority or counters were changed.'};
 }
}

/** Read-only projection for a verified single OperatingModels grant. Never creates an account. */
export function readOperatingLedgerAccounting(store:StateStore,grant:any):PortfolioAccountingView{return ledgerView(store,grant,grant,false);}
