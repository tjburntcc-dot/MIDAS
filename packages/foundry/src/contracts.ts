import { createHash } from 'node:crypto';
export type Money = {
    minorUnits: number;
    currency: string;
};
export type Scope = {
    tenantId: string;
    businessId: string;
    runId: string;
    dataPolicyVersion: string;
    mode: 'fixture';
};
export type Ref = {
    id: string;
    version: string;
    sha256: string;
};
export type Cost = {
    status: 'known' | 'provisional' | 'unknown';
    money: Money | null;
    basis: string;
};
export type Principal = {
    id: string;
    tenantId: string;
    businessId: string;
    permissions: string[];
};
export type Role = {
    id: string;
    version: string;
    procedure: string;
    competencies: string[];
    tools: string[];
    predecessor: string | null;
    model: string;
    qualification: 'fixture_only' | 'experimental_unqualified';
};
export type ModelRequest = {
    scope: Scope;
    requestId: string;
    role: Role;
    task: 'investigate' | 'decide' | 'operate' | 'verify';
    context: unknown;
    /** Explicit retained pixel evidence. Absence preserves the historical text-only request exactly. */
    images?: Array<{sourceId:string;mimeType:'image/png'|'image/jpeg';base64:string;sha256:string;detail:'auto';provenance:string}>;
    limits: {
        maxCost: Money;
        maxAttempts: number;
        maxHumanMinutes: number;
    };
    tools: unknown[];
};
export type ModelResult = {
    output: any;
    usage: {
        inputTokens: number | null;
        outputTokens: number | null;
        cost: Cost;
    };
    route: {
        provider: string;
        model: string;
        kind: 'fixture' | 'live' | 'human_mediated';
    };
    metadata?: {
        providerRequestId: string | null;
        cachedInputTokens: number | null;
        latencyMs: number;
    };
};
export interface ModelPort {
    readonly kind: 'fixture' | 'live' | 'human_mediated';
    run(request: ModelRequest): Promise<ModelResult> | ModelResult;
}
export interface EnvironmentPort {
    id: string;
    version: string;
    snapshot(): any;
    getEvidence(request: any): any;
    evidenceRequests?(request: any): any[];
    validateDecision(snapshot: any, evidence: any, decision: any): {
        ok: boolean;
        reason: string;
    };
    actionFor(output: any): {
        toolId: string;
        payload: any;
        estimatedCost: Money;
        effectClass: string;
    };
    verify(input: any): any;
}
export type Proposal = {
    id: string;
    scope: Scope;
    taskId: string;
    toolId: string;
    payload: any;
    payloadHash: string;
    policyVersion: string;
    businessVersion: number;
    roleVersion: string;
    idempotencyKey: string;
    estimatedCost: Money;
    effectClass: string;
};
export type Observation = {
    status: 'confirmed' | 'absent' | 'unknown' | 'failed';
    externalReceiptId?: string;
    payloadHash?: string;
    artifact?: any;
    ledger?: any;
    actualCost?: Cost;
    effectCount?: number;
    proof?: {
        requestHash: string;
        serviceIdentity: string;
        signature: string;
    };
};
export interface ActionPort {
    identity(): Promise<string> | string;
    execute(proposal: Proposal): Promise<Observation> | Observation;
    reconcile(proposal: Proposal): Promise<Observation> | Observation;
    verifyObservation?(proposal: Proposal, observation: Observation): boolean;
}
export class FoundryError extends Error {
    code: string;
    constructor(code: string, message = code) { super(message); this.name = 'FoundryError'; this.code = code; }
}
export function requireThat(condition: unknown, code: string): asserts condition {
    if (!condition)
        throw new FoundryError(code);
}
export function object(value: any, required: string[], optional: string[] = []): void {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_OBJECT');
    requireThat(required.every(k => Object.hasOwn(value, k)), 'MISSING_FIELD');
    requireThat(Object.keys(value).every(k => [...required, ...optional].includes(k)), 'UNKNOWN_FIELD');
}
export function identifier(value: unknown): asserts value is string {
    requireThat(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(value), 'INVALID_ID');
}
export function safeInteger(value: unknown, minimum = 0): asserts value is number {
    requireThat(Number.isSafeInteger(value) && Number(value) >= minimum, 'INVALID_INTEGER');
}
export function money(value: any): Money {
    object(value, ['minorUnits', 'currency']);
    safeInteger(value.minorUnits);
    requireThat(typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency), 'INVALID_CURRENCY');
    return value;
}
export function addMoney(a: Money, b: Money): Money {
    money(a);
    money(b);
    requireThat(a.currency === b.currency, 'CURRENCY_MISMATCH');
    const sum = a.minorUnits + b.minorUnits;
    safeInteger(sum);
    return { minorUnits: sum, currency: a.currency };
}
export function cost(value: any): Cost {
    object(value, ['status', 'money', 'basis']);
    requireThat(['known', 'provisional', 'unknown'].includes(value.status), 'INVALID_COST_STATUS');
    requireThat(typeof value.basis === 'string' && value.basis.length > 0, 'MISSING_COST_BASIS');
    if (value.status === 'unknown')
        requireThat(value.money === null, 'UNKNOWN_COST_HAS_AMOUNT');
    else
        money(value.money);
    return value;
}
export function scope(value: any): Scope {
    object(value, ['tenantId', 'businessId', 'runId', 'dataPolicyVersion', 'mode']);
    for (const key of ['tenantId', 'businessId', 'runId', 'dataPolicyVersion'])
        identifier(value[key]);
    requireThat(value.mode === 'fixture', 'FIXTURE_MODE_REQUIRED');
    return value;
}
export function scopeKey(value: Scope): string { scope(value); return [value.tenantId, value.businessId, value.runId, value.dataPolicyVersion, value.mode].join('/'); }
export function businessKey(value: Scope): string { scope(value); return [value.tenantId, value.businessId].join('/'); }
export function assertScope(principal: Principal, value: Scope, permission = 'read'): void {
    scope(value);
    requireThat(principal?.tenantId === value.tenantId && principal?.businessId === value.businessId && principal.permissions.includes(permission), 'SCOPE_DENIED');
}
export function canonical(value: any): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        requireThat(Number.isFinite(value), 'NONFINITE_JSON');
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    requireThat(typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'NON_JSON_VALUE');
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export function hash(value: any): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function rawHash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function ref(id: string, value: any, version = '1'): Ref { identifier(id); return { id, version, sha256: hash(value) }; }
export function proposal(value: any): Proposal {
    object(value, ['id', 'scope', 'taskId', 'toolId', 'payload', 'payloadHash', 'policyVersion', 'businessVersion', 'roleVersion', 'idempotencyKey', 'estimatedCost', 'effectClass']);
    scope(value.scope);
    for (const k of ['id', 'taskId', 'toolId', 'policyVersion', 'roleVersion', 'idempotencyKey'])
        identifier(value[k]);
    safeInteger(value.businessVersion, 1);
    money(value.estimatedCost);
    requireThat(value.payloadHash === hash(value.payload), 'PAYLOAD_HASH_MISMATCH');
    requireThat(['read', 'reversible_write', 'external_commitment'].includes(value.effectClass), 'INVALID_EFFECT');
    return value;
}
export function modelResult(value: any): ModelResult {
    object(value, ['output', 'usage', 'route'], ['metadata']);
    object(value.usage, ['inputTokens', 'outputTokens', 'cost']);
    cost(value.usage.cost);
    for (const k of ['inputTokens', 'outputTokens'])
        if (value.usage[k] !== null)
            safeInteger(value.usage[k]);
    object(value.route, ['provider', 'model', 'kind']);
    identifier(value.route.provider);
    identifier(value.route.model);
    requireThat(['fixture', 'live', 'human_mediated'].includes(value.route.kind), 'INVALID_MODEL_KIND');
    if (value.metadata) {
        object(value.metadata, ['providerRequestId', 'cachedInputTokens', 'latencyMs']);
        requireThat(value.metadata.providerRequestId === null || (typeof value.metadata.providerRequestId === 'string' && value.metadata.providerRequestId.length > 0), 'INVALID_PROVIDER_REQUEST_ID');
        if (value.metadata.cachedInputTokens !== null)
            safeInteger(value.metadata.cachedInputTokens);
        safeInteger(value.metadata.latencyMs);
    }
    canonical(value.output);
    return value;
}
