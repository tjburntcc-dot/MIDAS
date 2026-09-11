import { randomUUID, verify } from 'node:crypto';
import { StateStore } from '../state.ts';
import { canonical, hash, rawHash, requireThat, money, safeInteger, scopeKey, assertScope } from '../contracts.ts';
import type { Scope, ModelRequest, Money, Cost } from '../contracts.ts';
import type { ModelBudgetPort } from '../model-port.ts';
export type Stage = 'smoke' | 'development' | 'validation' | 'evaluation' | 'diagnostic';
export type Limits = {
    totalMinor: number;
    carryIn?: Array<{ id: string; exposureMinor: number; evidenceHash: string }>;
    concurrency?: number;
    astraCountRequests?: number;
    smokePrimary?: number;
    smokeRecovery?: number;
    stages: Record<Exclude<Stage, 'diagnostic'>, {
        minor: number;
        attempts: number;
    }> & { diagnostic?: {minor:number; attempts:number} };
};
/** One trusted experiment account per database. The fixture business ledger is never used. */
export class ModelLedger {
    readonly store: StateStore;
    readonly scope: Scope;
    readonly authorizationHash: string;
    readonly limits: Limits;
    constructor(store: StateStore, scope: Scope, authorizationHash: string, limits: Limits) {
        this.store = store;
        this.scope = scope;
        this.authorizationHash = authorizationHash;
        this.limits = structuredClone(limits);
        safeInteger(limits.totalMinor);
        for(const item of limits.carryIn??[]){safeInteger(item.exposureMinor);requireThat(/^[a-f0-9]{64}$/.test(item.evidenceHash),'CARRY_EVIDENCE_REQUIRED');}
        requireThat(new Set((limits.carryIn??[]).map(x=>x.id)).size===(limits.carryIn??[]).length,'DUPLICATE_CARRY_IN');
        if(limits.concurrency!==undefined)safeInteger(limits.concurrency,1);
        if(limits.astraCountRequests!==undefined)safeInteger(limits.astraCountRequests);
        for (const x of Object.values(limits.stages)) {
            safeInteger(x.minor);
            safeInteger(x.attempts);
        }
        store.transaction(() => {
            const previous = store.get('experiment-account', scopeKey(scope));
            if (previous)
                requireThat(previous.authorizationHash === authorizationHash && hash(previous.limits) === hash(limits), 'ACCOUNT_CONFIGURATION_CHANGED');
            else
                store.put('experiment-account', scopeKey(scope), { authorizationHash, limits, settled: 0, halted: false }, null);
        });
    }
    rows(): any[] { const prefix = scopeKey(this.scope) + '/'; return this.store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=?").all(prefix.length, prefix).map(r => JSON.parse(String(r.body))); }
    key(id: string) { return scopeKey(this.scope) + '/' + id; }
    get(id: string) { return this.store.get('model-attempt', this.key(id)); }
    totals(stage?: Stage) { const rows = this.rows().filter(r => !stage || r.stage === stage); return { attempts: rows.length, reserved: rows.reduce((n, r) => n + r.reservation, 0), settled: rows.reduce((n, r) => n + (r.invoice?.minorUnits ?? 0), 0), provisional: rows.reduce((n, r) => n + (r.cost?.status === 'provisional' ? r.cost.money.minorUnits : 0), 0), unresolved: rows.filter(r => r.reservation > 0).length }; }
    carryExposure(){return (this.limits.carryIn??[]).reduce((n,r)=>n+r.exposureMinor,0);}
    port(stage: Stage, metadata: Record<string, unknown>): ModelBudgetPort {
        const lease = randomUUID();
        const checked = (r: ModelRequest) => { requireThat(scopeKey(r.scope) === scopeKey(this.scope), 'SCOPE_DENIED'); };
        const mutate = (r: ModelRequest, fn: (row: any) => any) => this.store.transaction(() => { checked(r); const old = this.get(r.requestId); requireThat(old && old.lease === lease, 'ATTEMPT_LEASE_MISMATCH'); this.store.put('model-attempt', this.key(r.requestId), fn(old), old._version); });
        return {
            prepare: async (r, amount, digest, bytes) => {
                checked(r);
                money(amount);
                requireThat(amount.currency === 'USD' && digest === rawHash(bytes), 'REQUEST_BYTES_MISMATCH');
                try {
                    this.store.transaction(() => {
                        const previous = this.get(r.requestId);
                        requireThat(!previous, previous?.requestHash === digest ? 'ATTEMPT_ALREADY_ADMITTED' : 'ATTEMPT_BYTES_CONFLICT');
                        const account = this.store.get('experiment-account', scopeKey(this.scope)), all = this.totals(), part = this.totals(stage), cap = this.limits.stages[stage];
                        requireThat(cap, 'STAGE_NOT_AUTHORIZED');
                        requireThat(!account.halted, 'ACCOUNT_HALTED');
                        const rows=this.rows();
                        if(this.limits.concurrency!==undefined)requireThat(rows.filter(x=>!x.finishedAt).length<this.limits.concurrency,'CONCURRENCY_CAP');
                        if(stage!=='diagnostic'&&this.limits.astraCountRequests!==undefined)requireThat(rows.filter(x=>x.stage!=='diagnostic').length<this.limits.astraCountRequests,'COUNT_REQUEST_CAP');
                        if(stage==='smoke'&&this.limits.smokePrimary!==undefined){const recovery=!!metadata.recoveryOf;requireThat(rows.filter(x=>x.stage==='smoke'&&!!x.metadata.recoveryOf===recovery).length<(recovery?(this.limits.smokeRecovery??0):this.limits.smokePrimary),'SMOKE_SUBCAP');if(recovery){const parent=this.get(String(metadata.recoveryOf));requireThat(parent?.stage==='smoke'&&parent.finishedAt&&parent.errorCode&&parent.metadata.caseId===metadata.caseId,'RECOVERY_PARENT_REQUIRED');requireThat(typeof metadata.cause==='string'&&metadata.cause.length>20&&typeof metadata.correction==='string'&&metadata.correction.length>20&&typeof metadata.correctionEvidenceHash==='string'&&/^[a-f0-9]{64}$/.test(metadata.correctionEvidenceHash),'RECOVERY_EVIDENCE_REQUIRED');requireThat(!rows.some(x=>x.metadata.recoveryOf===metadata.recoveryOf),'RECOVERY_ALREADY_USED');}}
                        requireThat(part.attempts < cap.attempts, 'ATTEMPT_CAP');
                        requireThat(this.carryExposure() + all.settled + all.reserved + amount.minorUnits <= this.limits.totalMinor && part.settled + part.reserved + amount.minorUnits <= cap.minor, 'AGGREGATE_BUDGET_EXCEEDED');
                        this.store.put('model-attempt', this.key(r.requestId), { id: r.requestId, scope: r.scope, stage, lease, requestHash: digest, requestBytesPersisted: false, request: structuredClone(r), metadata: structuredClone(metadata), reservation: amount.minorUnits, status: 'admitted', inferenceDispatchIntent: false, cost: { status: 'unknown', money: null, basis: 'admission before token-count/provider access' }, observation: null, result: null, invoice: null, admittedAt: new Date().toISOString() }, null);
                        this.store.event(this.scope, 'experiment.admitted', { id: r.requestId, stage, requestHash: digest, reservation: amount });
                    });
                }
                catch (e) {
                    this.store.transaction(() => this.store.event(this.scope, 'experiment.admission_denied', { id: r.requestId, stage, code: (e as any).code ?? 'STATE_ERROR' }));
                    throw e;
                }
            },
            reserve: async (r, amount, digest) => { mutate(r, row => { requireThat(row.requestHash === digest && row.reservation === amount.minorUnits && !row.inferenceDispatchIntent, 'ATTEMPT_ALREADY_DISPATCHED'); return { ...row, inferenceDispatchIntent: true, status: 'pending', dispatchAt: new Date().toISOString() }; }); },
            observed: async (r, observation) => { mutate(r, row => { const count=observation.tokenCount as any;if(count?.phase==='dispatch_intent')requireThat(!row.countDispatchIntent,'COUNT_ALREADY_DISPATCHED');return { ...row, countDispatchIntent:row.countDispatchIntent||count?.phase==='dispatch_intent', observation: {...(row.observation??{}),...observation} };}); },
            settle: async (r, cost, providerRequestId) => { requireThat(cost.status === 'provisional', 'PROVIDER_USAGE_NOT_AN_INVOICE'); mutate(r, row => ({ ...row, cost, providerRequestId, status: 'provisional' })); },
            uncertain: async (r, reason) => { mutate(r, row => ({ ...row, status: 'uncertain', errorCode: reason })); },
        };
    }
    finish(id: string, result: any, errorCode: string | null) { this.store.transaction(() => { const row = this.get(id); requireThat(row, 'ATTEMPT_NOT_ADMITTED'); requireThat(!row.finishedAt, 'ATTEMPT_ALREADY_FINISHED'); this.store.put('model-attempt', this.key(id), { ...row, result, errorCode, observation: { ...(row.observation ?? {}), latencyMs: row.observation?.latencyMs ?? Date.now() - Date.parse(row.admittedAt) }, status: errorCode ? 'failed' : 'output_available', finishedAt: new Date().toISOString() }, row._version); this.store.event(this.scope, 'experiment.attempt_finished', { id, errorCode, acceptedOutput: !errorCode }); }); }
    /** Abandoning the worker never proves provider absence or releases money. */
    interrupt(id: string) { this.store.transaction(() => { const row = this.get(id); requireThat(row && !row.invoice, 'ATTEMPT_NOT_UNRESOLVED'); this.store.put('model-attempt', this.key(id), { ...row, status: 'interrupted', errorCode: 'PROCESS_INTERRUPTED' }, row._version); this.store.event(this.scope, 'experiment.interrupted', { id, reservationRetained: row.reservation }); }); }
    reconcile(envelope: any, publicKey: string, projectId: string) {
        requireThat(envelope && typeof envelope.signature === 'string' && verify(null, Buffer.from(canonical(envelope.statement)), publicKey, Buffer.from(envelope.signature, 'base64')), 'BILLING_SIGNATURE_INVALID');
        const s = envelope.statement;
        requireThat(s.kind === 'closed_attempt_invoice' && s.projectId === projectId && s.authorizationHash === this.authorizationHash && s.scope === scopeKey(this.scope), 'BILLING_SCOPE_MISMATCH');
        money(s.actual);
        requireThat(s.actual.currency === 'USD' && typeof s.evidenceSha256 === 'string' && /^[a-f0-9]{64}$/.test(s.evidenceSha256) && typeof s.issuer === 'string' && Number.isFinite(Date.parse(s.closedAt)), 'BILLING_EVIDENCE_REQUIRED');
        this.store.transaction(() => {
            const row = this.get(s.attemptId);
            requireThat(row && row.requestHash === s.requestHash, 'BILLING_ATTEMPT_MISMATCH');
            if (row.invoice) {
                requireThat(row.invoice.statementHash === hash(s), 'BILLING_RECONCILIATION_CONFLICT');
                return;
            }
            if (row.providerRequestId)
                requireThat(row.providerRequestId === s.providerRequestId, 'BILLING_RESPONSE_MISMATCH');
            const overage = s.actual.minorUnits > row.reservation;
            this.store.put('model-attempt', this.key(s.attemptId), { ...row, reservation: 0, invoice: { ...s.actual, statementHash: hash(s), evidenceSha256: s.evidenceSha256, closedAt: s.closedAt, issuer: s.issuer }, cost: { status: 'known', money: s.actual, basis: 'signed authoritative closed-attempt billing statement' } }, row._version);
            const a = this.store.get('experiment-account', scopeKey(this.scope));
            this.store.put('experiment-account', scopeKey(this.scope), { ...a, settled: a.settled + s.actual.minorUnits, halted: a.halted || overage }, a._version);
            this.store.event(this.scope, 'experiment.invoice_reconciled', { id: s.attemptId, actual: s.actual, overage, evidenceSha256: s.evidenceSha256 });
        });
    }
}
