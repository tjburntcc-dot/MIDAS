import { randomBytes, timingSafeEqual } from 'node:crypto';
import { StateStore } from './state.ts';
import { assertScope, businessKey, cost, hash, identifier, money, object, proposal, requireThat, safeInteger, scopeKey } from './contracts.ts';
import type { Scope, Money, Principal, Proposal, Observation } from './contracts.ts';

export class Authority {
  store: StateStore;
  constructor(store: StateStore) { this.store = store; }
  /** Local fixture enrollment is a trusted CLI setup operation, never a ModelPort tool. */
  enroll(id: string, tenantId: string, businessId: string, permissions: string[]): string {
    [id,tenantId,businessId].forEach(identifier);
    requireThat(permissions.every(p => ['read','operate','approve','promote','evaluate','admin'].includes(p)), 'INVALID_PERMISSION');
    const token = randomBytes(32).toString('hex');
    this.store.transaction(() => this.store.put('principal',id,{id,tenantId,businessId,permissions,tokenHash:hash(token)},null));
    return token;
  }
  authenticate(id: string, token: string): Principal {
    const row = this.store.get('principal',id);
    requireThat(row && typeof token === 'string', 'AUTHENTICATION_FAILED');
    const actual = Buffer.from(hash(token)); const expected=Buffer.from(row.tokenHash);
    requireThat(actual.length===expected.length && timingSafeEqual(actual,expected), 'AUTHENTICATION_FAILED');
    return { id:row.id,tenantId:row.tenantId,businessId:row.businessId,permissions:[...row.permissions] };
  }
  initializeBusiness(s: Scope, cap: Money) {
    money(cap); const key=businessKey(s); const existing=this.store.get('business',key);
    if (existing) { requireThat(existing.policyVersion===s.dataPolicyVersion,'POLICY_MISMATCH'); requireThat(existing.cap.currency===cap.currency,'CURRENCY_MISMATCH'); return; }
    this.store.put('business',key,{policyVersion:s.dataPolicyVersion,stateVersion:1,cap,reserved:0,spent:0},null);
  }
  business(s: Scope) { const value=this.store.get('business',businessKey(s)); requireThat(value,'BUSINESS_NOT_FOUND'); return value; }
  changePolicy(s: Scope, principal: Principal, version: string) {
    assertScope(principal,s,'admin'); identifier(version);
    this.store.transaction(() => { const b=this.business(s); this.store.put('business',businessKey(s),{...b,policyVersion:version,stateVersion:b.stateVersion+1},b._version); this.store.event(s,'policy_changed',{version,actor:principal.id}); });
  }
  approve(s: Scope, principal: Principal, p: Proposal, options: any = {}) {
    assertScope(principal,s,'approve'); proposal(p); requireThat(scopeKey(s)===scopeKey(p.scope),'SCOPE_DENIED');
    object(options,[],['expiresAt','maxCost','maxActions','reviewMinutes']);
    const expiresAt=options.expiresAt ?? new Date(Date.now()+3600000).toISOString();
    requireThat(typeof expiresAt==='string' && Number.isFinite(Date.parse(expiresAt)) && expiresAt.endsWith('Z'),'INVALID_EXPIRY');
    const maxCost=money(options.maxCost ?? p.estimatedCost); const maxActions=options.maxActions ?? 1; safeInteger(maxActions,1);
    const reviewMinutes=options.reviewMinutes ?? 2; safeInteger(reviewMinutes);
    return this.store.transaction(() => {
      const b=this.business(s); requireThat(b.policyVersion===p.policyVersion && b.stateVersion===p.businessVersion,'STALE_APPROVAL');
      const key=scopeKey(s)+'/'+p.id; const old=this.store.get('grant',key);
      if (old) { requireThat(old.proposalHash===hash(p) && !old.revoked,'APPROVAL_ALREADY_EXISTS'); return old; }
      const grant={id:'grant-'+p.id,scope:s,issuer:principal.id,subject:'operator',proposalHash:hash(p),policyVersion:p.policyVersion,businessVersion:p.businessVersion,expiresAt,maxCost,maxActions,usedActions:0,reserved:0,spent:0,revoked:false};
      requireThat(maxCost.currency===p.estimatedCost.currency,'CURRENCY_MISMATCH');
      this.store.put('grant',key,grant,null);
      this.store.record(s,grant.id,'AuthorityGrant',grant);
      this.store.event(s,'approval_granted',{id:grant.id,actor:principal.id,proposalHash:hash(p),reviewMinutes,cost:{status:'unknown',money:null,basis:'human review valuation not supplied'},simulated:true});
      return grant;
    });
  }
  revoke(s: Scope, principal: Principal, proposalId: string) {
    assertScope(principal,s,'approve');
    this.store.transaction(() => { const key=scopeKey(s)+'/'+proposalId; const g=this.store.get('grant',key); requireThat(g,'GRANT_NOT_FOUND'); this.store.put('grant',key,{...g,revoked:true},g._version); this.store.event(s,'approval_revoked',{id:g.id,actor:principal.id}); });
  }
  reserve(p: Proposal, now=Date.now()): { execute: boolean; action: any } {
    proposal(p); const s=p.scope; const key=scopeKey(s)+'/'+p.id;
    try {
      return this.store.transaction(() => {
        const existing=this.store.get('action',key);
        if (existing) { requireThat(existing.proposalHash===hash(p),'IDEMPOTENCY_CONFLICT'); return {execute:false,action:existing}; }
        const run=this.store.get('run',scopeKey(s)); requireThat(!run?.cancelled,'RUN_CANCELLED');
        const g=this.store.get('grant',key); const b=this.business(s);
        requireThat(g,'APPROVAL_REQUIRED'); requireThat(!g.revoked,'APPROVAL_REVOKED');
        requireThat(Date.parse(g.expiresAt)>now,'APPROVAL_EXPIRED');
        requireThat(scopeKey(g.scope)===scopeKey(s),'SCOPE_DENIED');
        requireThat(g.proposalHash===hash(p),'WRONG_APPROVED_PAYLOAD');
        requireThat(g.policyVersion===p.policyVersion && b.policyVersion===p.policyVersion && b.stateVersion===p.businessVersion && g.businessVersion===p.businessVersion,'STALE_APPROVAL');
        requireThat(g.subject==='operator','WRONG_SUBJECT');
        requireThat(p.estimatedCost.currency===b.cap.currency && p.estimatedCost.currency===g.maxCost.currency,'CURRENCY_MISMATCH');
        const reserve=p.estimatedCost.minorUnits;
        safeInteger(b.spent+b.reserved+reserve); safeInteger(g.spent+g.reserved+reserve);
        requireThat(b.spent+b.reserved+reserve<=b.cap.minorUnits && g.spent+g.reserved+reserve<=g.maxCost.minorUnits && g.usedActions<g.maxActions,'BUDGET_EXCEEDED');
        // Globally unique within a business, not merely within this run.
        const effectKey=businessKey(s)+'/'+p.idempotencyKey;
        requireThat(!this.store.get('idempotency',effectKey),'IDEMPOTENCY_CONFLICT');
        this.store.put('idempotency',effectKey,{scope:s,proposalHash:hash(p)},null);
        this.store.put('business',businessKey(s),{...b,reserved:b.reserved+reserve},b._version);
        this.store.put('grant',key,{...g,reserved:g.reserved+reserve,usedActions:g.usedActions+1},g._version);
        const action={id:p.id,scope:s,proposal:p,proposalHash:hash(p),status:'unknown',reservation:reserve,actualCost:{status:'unknown',money:null,basis:'dispatch intent committed; external result pending'},externalReceiptId:null,observation:null,attempts:1};
        this.store.put('action',key,action,null);
        this.store.event(s,'action_dispatch_intent',{id:p.id,idempotencyKey:p.idempotencyKey,reservation:p.estimatedCost,status:'unknown'});
        return {execute:true,action};
      });
    } catch(error) {
      this.store.transaction(() => this.store.event(s,'action_denied',{id:p.id,code:(error as any).code ?? 'STATE_ERROR',retried:false})); throw error;
    }
  }
  settle(p: Proposal, observation: Observation) {
    object(observation,['status'],['externalReceiptId','payloadHash','artifact','ledger','actualCost','effectCount']);
    requireThat(['confirmed','absent','unknown','failed'].includes(observation.status),'INVALID_OBSERVATION');
    if (observation.actualCost) cost(observation.actualCost);
    return this.store.transaction(() => {
      const s=p.scope,key=scopeKey(s)+'/'+p.id;
      const a=this.store.get('action',key); requireThat(a && a.proposalHash===hash(p),'ACTION_NOT_FOUND');
      if (a.status==='confirmed' || a.status==='failed') return a;
      const b=this.business(s),g=this.store.get('grant',key);
      const amount=observation.actualCost;
      const confirmed=observation.status==='confirmed';
      if (confirmed) requireThat(observation.payloadHash===p.payloadHash && typeof observation.externalReceiptId==='string' && observation.externalReceiptId.length>0,'INVALID_RECEIPT');
      const known=amount?.status==='known';
      if (known) { requireThat(amount.money!.currency===b.cap.currency,'CURRENCY_MISMATCH'); requireThat(amount.money!.minorUnits<=a.reservation,'COST_EXCEEDS_RESERVATION'); }
      // Absence is safe to release only when the adapter's reconciliation is authoritative.
      const resolved=known && observation.status!=='unknown';
      const spent=resolved ? amount!.money!.minorUnits : 0;
      if (resolved) {
        this.store.put('business',businessKey(s),{...b,reserved:b.reserved-a.reservation,spent:b.spent+spent},b._version);
        this.store.put('grant',key,{...g,reserved:g.reserved-a.reservation,spent:g.spent+spent},g._version);
      }
      const next={...a,status:resolved ? (confirmed?'confirmed':'failed') : 'unknown',reservation:resolved?0:a.reservation,actualCost:amount ?? a.actualCost,externalReceiptId:observation.externalReceiptId ?? null,observation};
      this.store.put('action',key,next,a._version);
      this.store.event(s,resolved?'action_settled':'action_uncertain',{id:p.id,status:next.status,cost:next.actualCost,reservation:next.reservation,externalReceiptId:next.externalReceiptId});
      if (resolved) this.store.record(s,'receipt-'+p.id,'ActionReceipt',{proposalHash:hash(p),status:next.status,externalReceiptId:next.externalReceiptId,actualCost:next.actualCost,requestDigest:p.payloadHash});
      return next;
    });
  }
  action(p: Proposal) { return this.store.get('action',scopeKey(p.scope)+'/'+p.id); }
}
