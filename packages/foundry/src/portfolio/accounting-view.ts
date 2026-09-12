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
};
export function readPortfolioAccounting(store:StateStore,root:string):PortfolioAccountingView{
 const base={currency:'USD',readOnly:true,executionAuthority:false,scope:'This portfolio grant only; historical missions and development subscriptions excluded.'} as const;
 const path=join(root,'portfolio.authorization.json');
 if(!existsSync(path)){
  const historical=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND key LIKE 'mason/portfolio-models/%'").all().some(r=>JSON.parse(String(r.body)).metadata?.source==='actual-model');
  return historical?{...base,status:'unavailable',reason:'Prior actual-model ledger exists without its active grant file; inspect historical accounting. Amounts are unknown, not zero.'}:{...base,status:'unfunded',callsUsed:0,inferenceDispatches:0,countRequests:0,provisionalMinor:0,estimatedAttempts:0,unknownCostAttempts:0,settledMinor:null,settlementCount:0,retainedMinor:0,countBufferMinor:0,remainingMinor:null,callLimit:0,reason:'No signed portfolio grant or actual provider admissions. The proposed ceiling is not reserved spending.'};
 }
 try{
  const envelope=JSON.parse(readFileSync(path,'utf8')),publicKey=readFileSync(join(root,'auth','portfolio-owner.pub'),'utf8'),grant=verified(envelope,publicKey) as any,inner=verified(envelope.operatingEnvelope,publicKey) as any;
  requireThat(grant.kind==='portfolio-execution-grant-v1'&&grant.root===resolve(root)&&grant.approved===true&&grant.operatingGrantHash===hash(inner)&&inner.kind==='operations-model-grant-v1'&&hash(grant.accountScope)===hash(inner.accountScope)&&grant.accountScope.businessId==='portfolio-models','ACCOUNTING_GRANT_SCOPE');
  const key=scopeKey(inner.accountScope),account=store.get('experiment-account',key);
  requireThat(account&&account.authorizationHash===hash(inner)&&hash(account.limits)===hash(inner.limits),'ACCOUNTING_LEDGER_BINDING');
  const prefix=key+'/',rows=store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=?").all(prefix.length,prefix).map(r=>JSON.parse(String(r.body)));
  const total=(select:(r:any)=>number)=>rows.reduce((sum,r)=>{const value=select(r);safeInteger(value);return sum+value;},0);
  const reservation=total(r=>r.reservation),settled=total(r=>r.invoice?.minorUnits??0),provisional=total(r=>r.cost?.status==='provisional'?r.cost.money.minorUnits:0),settlementCount=rows.filter(r=>r.invoice).length;
  const estimatedAttempts=rows.filter(r=>r.cost?.status==='provisional').length,unknownCostAttempts=rows.filter(r=>!r.invoice&&r.cost?.status!=='provisional').length;
  const countBuffer=inner.limits.overheadReserve?.minor??0;safeInteger(countBuffer);const carry=(inner.limits.carryIn??[]).reduce((sum:number,r:any)=>{safeInteger(r.exposureMinor);return sum+r.exposureMinor;},0);safeInteger(inner.limits.totalMinor);safeInteger(inner.limits.stages.development.attempts);
  return {...base,status:'available',mode:grant.mode,grantId:grant.id,grantHash:hash(grant),expired:Date.parse(grant.expiresAt)<=Date.now(),revoked:Boolean(store.get('portfolio-revocation',hash(grant))||store.get('operating-revocation',hash(inner))),halted:Boolean(account.halted),callsUsed:rows.length,callLimit:inner.limits.stages.development.attempts,inferenceDispatches:grant.mode==='live'?rows.filter(r=>r.inferenceDispatchIntent).length:0,countRequests:grant.mode==='live'?rows.filter(r=>r.countDispatchIntent).length:0,provisionalMinor:unknownCostAttempts&&!estimatedAttempts?null:provisional,estimatedAttempts,unknownCostAttempts,settledMinor:settlementCount?settled:null,settlementCount,retainedMinor:reservation+countBuffer+carry,countBufferMinor:countBuffer,remainingMinor:inner.limits.totalMinor-reservation-settled-countBuffer-carry,pendingAttempts:rows.filter(r=>!r.finishedAt).length,failedAttempts:rows.filter(r=>r.errorCode).length,reason:'Persisted signed-grant ledger, readable even while model execution is disabled. Reservations are exposure, not actual charges; settlements depend on underlying provider evidence.'};
 }catch{
  return {...base,status:'unavailable',reason:'The retained grant, public signature or ledger binding could not be verified. Accounting is unavailable, not zero; no authority or counters were changed.'};
 }
}
