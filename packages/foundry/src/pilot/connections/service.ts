import {assertLiveConnectionBinding} from './live-transport.ts';
import { randomUUID } from 'node:crypto';
import { hash, requireThat } from '../../contracts.ts';
import { StateStore } from '../../state.ts';
import { PilotKnowledge, pilotKnowledgeScope } from '../knowledge.ts';
import type { ConnectionConsent, ConnectionReadiness, ConnectionTransport, CredentialReference, ProviderId, SyncCursor } from './contracts.ts';
import { ConnectionRegistry } from './registry.ts';

export type ConnectionState = {
    id: string;
    businessId: string;
    provider: ProviderId;
    capabilityIds: string[];
    credentialReference: CredentialReference;
    consent: ConnectionConsent | null;
    readiness: ConnectionReadiness;
    revokedAt: string | null;
    revocationReason: string | null;
    cursor: SyncCursor;
    configuration: Record<string, unknown>;
    lastSync: { at: string; transport: 'offline' | 'live'; sourceCount: number; partial: boolean; limitations: string[] } | null;
    createdAt: string;
    updatedAt: string;
    _version: number;
};
export type ConnectionSource = {
    id: string;
    connectionId: string;
    businessId: string;
    sourceIdentity: string;
    knowledgeSourceId: string;
    sourceHash: string;
    observedAt: string;
    updatedAt: string | null;
    partial: boolean;
    limitations: string[];
    retainedBytesBase64?: string;
    pageCount?: number | null;
    revokedAt: string | null;
    supersededAt: string | null;
    _version: number;
};
const now = () => new Date().toISOString();
const connectionId = () => 'connection-' + randomUUID().replaceAll('-', '').slice(0, 20);
const reference = (input: CredentialReference) => {
    requireThat(input && (input.kind === 'owner_vault' || input.kind === 'application_secret') && typeof input.id === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(input.id), 'CONNECTION_CREDENTIAL_REFERENCE_REQUIRED');
    return structuredClone(input);
};
const consent = (input: ConnectionConsent) => {
    requireThat(input && typeof input.grantedBy === 'string' && input.grantedBy.trim().length > 0 && input.grantedBy.length <= 160 && typeof input.purpose === 'string' && input.purpose.trim().length > 0 && input.purpose.length <= 1000 && Array.isArray(input.scopes) && input.scopes.length > 0 && input.scopes.every(scope => typeof scope === 'string' && scope.length <= 300) && Number.isFinite(Date.parse(input.grantedAt)), 'CONNECTION_CONSENT_INVALID');
    if (input.expiresAt) requireThat(Number.isFinite(Date.parse(input.expiresAt)), 'CONNECTION_CONSENT_EXPIRY_INVALID');
    return { ...structuredClone(input), scopes: [...new Set(input.scopes)].sort() };
};
const listed = <T>(store: StateStore, kind: string) => store.db.prepare('SELECT body,version FROM entities WHERE kind=? ORDER BY rowid').all(kind).map((row: any) => ({ ...JSON.parse(String(row.body)), _version: Number(row.version) })) as T[];
const boundedInteger = (value: unknown, fallback: number, max: number, code: string) => { const candidate = value === undefined ? fallback : value; requireThat(typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 1 && candidate <= max, code); return candidate; };
const validDate = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
function configuration(provider: ProviderId, raw: Record<string, unknown> | undefined) {
    const value = raw ?? {}; requireThat(value && typeof value === 'object' && !Array.isArray(value), 'CONNECTION_CONFIGURATION_INVALID');
    const allowed: Record<ProviderId, string[]> = { google_workspace: ['maxPages','maxFiles','sheetRange'], shopify_admin: ['maxPages','pageSize'], google_analytics_4: ['maxPages','pageSize','propertyId','startDate','endDate'] };
    requireThat(Object.keys(value).every(key => allowed[provider].includes(key)), 'CONNECTION_CONFIGURATION_FIELD');
    if (provider === 'google_workspace') { boundedInteger(value.maxPages,4,8,'CONNECTION_MAX_PAGES_INVALID'); boundedInteger(value.maxFiles,40,100,'CONNECTION_MAX_FILES_INVALID'); if (value.sheetRange !== undefined) requireThat(typeof value.sheetRange === 'string' && /^[A-Za-z0-9_ ]{1,80}![A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$|^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/.test(value.sheetRange), 'CONNECTION_SHEET_RANGE_INVALID'); }
    if (provider === 'shopify_admin') { boundedInteger(value.maxPages,4,8,'CONNECTION_MAX_PAGES_INVALID'); boundedInteger(value.pageSize,50,100,'CONNECTION_PAGE_SIZE_INVALID'); }
    if (provider === 'google_analytics_4') { boundedInteger(value.maxPages,4,8,'CONNECTION_MAX_PAGES_INVALID'); boundedInteger(value.pageSize,500,1000,'CONNECTION_PAGE_SIZE_INVALID'); requireThat(typeof value.propertyId === 'string' && /^\d{1,32}$/.test(value.propertyId) && validDate(value.startDate) && validDate(value.endDate) && String(value.startDate) <= String(value.endDate), 'GA4_PROPERTY_AND_DATE_WINDOW_REQUIRED'); }
    return structuredClone(value);
}

/**
 * Trusted application service for configured connection state and ingestion lineage.
 * It never resolves credentials. A host-only transport receives the opaque reference
 * after this service has checked owner consent, scope, expiry and revocation.
 */
export class ConnectionService {
    readonly store: StateStore;
    readonly knowledge: PilotKnowledge;
    readonly registry: ConnectionRegistry;
    constructor(store: StateStore, knowledge: PilotKnowledge, registry: ConnectionRegistry) { this.store = store; this.knowledge = knowledge; this.registry = registry; }
    list(businessId: string): ConnectionState[] { this.knowledge.company(businessId); return listed<ConnectionState>(this.store, 'pilot-connection').filter(connection => connection.businessId === businessId).map(connection => structuredClone(connection)); }
    get(id: string): ConnectionState { const state = this.store.get('pilot-connection', id) as ConnectionState | null; requireThat(state, 'CONNECTION_NOT_FOUND'); return state; }
    sources(connectionId: string): ConnectionSource[] { this.get(connectionId); return listed<ConnectionSource>(this.store, 'pilot-connection-source').filter(source => source.connectionId === connectionId).map(source => structuredClone(source)); }
    beginConfiguration(input: { businessId: string; provider: ProviderId; credentialReference: CredentialReference; capabilityIds?: string[]; configuration?: Record<string, unknown>; id?: string }): ConnectionState {
        this.knowledge.company(input.businessId); const definition = this.registry.get(input.provider).definition, all = definition.capabilities.map(capability => capability.id), capabilityIds = [...new Set(input.capabilityIds ?? all)].sort();
        requireThat(capabilityIds.length > 0 && capabilityIds.every(id => all.includes(id)), 'CONNECTION_CAPABILITY_INVALID');
        const id = input.id ?? connectionId(); requireThat(/^connection-[a-z0-9]{8,40}$/.test(id), 'CONNECTION_ID_INVALID');
        const createdAt = now(); const state: Omit<ConnectionState, '_version'> = { id, businessId: input.businessId, provider: input.provider, capabilityIds, credentialReference: reference(input.credentialReference), consent: null, readiness: 'permission_missing', revokedAt: null, revocationReason: null, cursor: {}, configuration: configuration(input.provider,input.configuration), lastSync: null, createdAt, updatedAt: createdAt };
        return this.store.transaction(() => { requireThat(!this.store.get('pilot-connection', id), 'CONNECTION_EXISTS'); this.store.record(pilotKnowledgeScope(input.businessId), id, 'PilotConnectionConfigured', { id, provider: state.provider, capabilityIds, readiness: state.readiness, credentialReference: { kind: state.credentialReference.kind, id: state.credentialReference.id }, credentialValueRetained: false }); this.store.event(pilotKnowledgeScope(input.businessId), 'connection.configured', { id, provider: state.provider, readiness: state.readiness }); return this.store.put('pilot-connection', id, state, null); });
    }
    grantConsent(id: string, input: ConnectionConsent): ConnectionState {
        const prior = this.get(id); requireThat(!prior.revokedAt, 'CONNECTION_REVOKED'); const accepted = consent(input), required = this.requiredScopes(prior), missing = required.filter(scope => !accepted.scopes.includes(scope)); const expired = Boolean(accepted.expiresAt && Date.parse(accepted.expiresAt) <= Date.now()), readiness: ConnectionReadiness = missing.length || expired ? 'permission_missing' : 'configured';
        const next = { ...prior, consent: accepted, readiness, updatedAt: now() };
        return this.store.transaction(() => { this.store.record(pilotKnowledgeScope(prior.businessId), `${id}-consent-${next.updatedAt}`, 'PilotConnectionConsent', { connectionId: id, capabilityIds: prior.capabilityIds, grantedBy: accepted.grantedBy, grantedAt: accepted.grantedAt, expiresAt: accepted.expiresAt ?? null, scopes: accepted.scopes, purpose: accepted.purpose, missingScopes: missing, credentialValueRetained: false }); this.store.event(pilotKnowledgeScope(prior.businessId), 'connection.consent_recorded', { id, readiness, missingScopes: missing }); return this.store.put('pilot-connection', id, next, prior._version); });
    }
    revoke(id: string, reason: string): ConnectionState {
        const prior = this.get(id); requireThat(typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 1000, 'CONNECTION_REVOCATION_REASON_REQUIRED'); if (prior.revokedAt) return prior;
        const revokedAt = now(), next = { ...prior, readiness: 'permission_missing' as const, revokedAt, revocationReason: reason.trim(), updatedAt: revokedAt };
        return this.store.transaction(() => { for (const source of this.sources(id)) this.store.put('pilot-connection-source', source.id, { ...source, revokedAt }, source._version); this.store.record(pilotKnowledgeScope(prior.businessId), `${id}-revoked-${revokedAt}`, 'PilotConnectionRevocation', { connectionId: id, reason: reason.trim(), revokedAt, affectedKnowledgeSourceIds: this.sources(id).map(source => source.knowledgeSourceId), preventsFutureTransportReads: true, requiresKnowledgeContextExclusion: true }); this.store.event(pilotKnowledgeScope(prior.businessId), 'connection.revoked', { id, affectedKnowledgeSourceIds: this.sources(id).map(source => source.knowledgeSourceId) }); return this.store.put('pilot-connection', id, next, prior._version); });
    }
    /** Root integration calls this when assembling a worker bundle. It excludes all revoked source revisions. */
    eligibleKnowledgeSourceIds(businessId: string): string[] {
        const active = new Set(this.list(businessId).filter(connection => this.connectionAllowsCachedUse(connection)).map(connection => connection.id));
        return listed<ConnectionSource>(this.store, 'pilot-connection-source').filter(source => source.businessId === businessId && active.has(source.connectionId) && !source.revokedAt && !source.supersededAt).map(source => source.knowledgeSourceId);
    }
    /** IDs for root to remove from every cached knowledge/context path on revocation. */
    excludedKnowledgeSourceIds(businessId: string): string[] {
        const disallowed = new Set(this.list(businessId).filter(connection => !this.connectionAllowsCachedUse(connection)).map(connection => connection.id));
        return listed<ConnectionSource>(this.store, 'pilot-connection-source').filter(source => source.businessId === businessId && (disallowed.has(source.connectionId) || Boolean(source.revokedAt) || Boolean(source.supersededAt))).map(source => source.knowledgeSourceId);
    }
    filterSources<T extends { id: string }>(businessId: string, sources: T[]): T[] { const blocked = new Set(this.excludedKnowledgeSourceIds(businessId)); return sources.filter(source => !blocked.has(source.id)); }
    async sync(id: string, transport: ConnectionTransport): Promise<{ connection: ConnectionState; ingested: ConnectionSource[]; skipped: number; partial: boolean; limitations: string[] }> {
        if(transport.kind==='live')assertLiveConnectionBinding(transport,this,id);const prior = this.get(id); this.assertReadable(prior); const adapter = this.registry.get(prior.provider);
        const scopedTransport: ConnectionTransport = { kind: transport.kind, request: request => transport.request({ ...request, capabilityIds: [...prior.capabilityIds] }) };
        const collected = await adapter.collect(scopedTransport, structuredClone(prior.cursor), { ...structuredClone(prior.configuration), capabilityIds: [...prior.capabilityIds] });
        const admitted = this.get(id); this.assertReadable(admitted); requireThat(admitted._version === prior._version, 'CONNECTION_CHANGED_DURING_SYNC');
        const ingested: ConnectionSource[] = []; let skipped = 0;
        for (const item of collected.sources) {
            requireThat(item.sourceIdentity.length > 0 && item.sourceIdentity.length <= 500 && item.text.length > 0 && item.text.length <= 200_000 && /^[a-f0-9]{64}$/.test(item.sourceHash), 'CONNECTION_COLLECTED_SOURCE_INVALID');
            const priorRevisions = this.sources(id).filter(source => source.sourceIdentity === item.sourceIdentity), key = `connection-source/${id}/${hash(item.sourceIdentity).slice(0, 24)}/${item.sourceHash.slice(0, 24)}`, existing = this.store.get('pilot-connection-source', key) as ConnectionSource | null;
            if (existing && !existing.revokedAt && !existing.supersededAt) { skipped++; continue; }
            if (existing && !existing.revokedAt) {
                const reactivated = this.store.transaction(() => {
                    for (const priorRevision of priorRevisions.filter(revision => revision.id !== existing.id && !revision.revokedAt && !revision.supersededAt)) this.store.put('pilot-connection-source', priorRevision.id, { ...priorRevision, supersededAt: now() }, priorRevision._version);
                    return this.store.put('pilot-connection-source', existing.id, { ...existing, supersededAt: null }, existing._version);
                });
                ingested.push(reactivated); continue;
            }
            const intentId='connection-import-'+hash(key).slice(0,32);if(!this.store.get('pilot-connection-import',intentId))this.store.transaction(()=>this.store.put('pilot-connection-import',intentId,{id:intentId,businessId:prior.businessId,connectionId:id,sourceKey:key,sourceHash:item.sourceHash,status:'pending'},null));
            const retained=this.store.db.prepare("SELECT body FROM entities WHERE kind='pilot-source'").all().map(r=>JSON.parse(String(r.body))).find(s=>s.businessId===prior.businessId&&s.origin?.recordId===intentId&&s.origin?.contentHash===item.sourceHash);
            const knowledgeSource = retained??this.knowledge.addSource(prior.businessId, { title: item.title, text: item.text, kind: item.contentType === 'application/json' ? 'json' : 'text', rights: `${prior.provider} read consent ${prior.consent!.grantedAt}; source identity ${item.sourceIdentity}; no action authority`, observedAt: item.observedAt, validUntil: null, permission: 'worker' },{kind:'connection-read',connectionId:id,recordId:intentId,contentHash:item.sourceHash,url:item.sourceUrl,extraction:'Documented adapter extraction; original read outcome retained. Missing or partial data is not reconstructed.',provenance:transport.kind==='offline'?'Explicit adapter fixture; no account access or customer observation.':'Consented provider response; extracted source assertion, not verified business truth.'});
            const source: Omit<ConnectionSource, '_version'> = { id: key, connectionId: id, businessId: prior.businessId, sourceIdentity: item.sourceIdentity, knowledgeSourceId: knowledgeSource.id, sourceHash: item.sourceHash, observedAt: item.observedAt, updatedAt: item.updatedAt, partial: item.partial, limitations: [...item.limitations, ...(item.sourceUrl ? [`Source URL: ${item.sourceUrl}`] : [])], ...(item.retainedBytesBase64 ? { retainedBytesBase64: item.retainedBytesBase64 } : {}), ...(item.pageCount !== undefined ? { pageCount: item.pageCount } : {}), revokedAt: null, supersededAt: null };
            const saved = this.store.transaction(() => { for (const priorRevision of priorRevisions.filter(revision => !revision.revokedAt && !revision.supersededAt)) this.store.put('pilot-connection-source', priorRevision.id, { ...priorRevision, supersededAt: now() }, priorRevision._version); this.store.record(pilotKnowledgeScope(prior.businessId), key, 'PilotConnectionIngestedSource', { connectionId: id, provider: prior.provider, sourceIdentity: item.sourceIdentity, knowledgeSourceId: knowledgeSource.id, sourceHash: item.sourceHash, observedAt: item.observedAt, updatedAt: item.updatedAt, partial: item.partial, limitations: source.limitations, retainedBytesPreserved: Boolean(item.retainedBytesBase64), retainedBytes: item.retainedBytesBase64 ?? null, sourceUrl: item.sourceUrl ?? null, pageCount: item.pageCount ?? null, supersedesKnowledgeSourceIds: priorRevisions.map(revision => revision.knowledgeSourceId), credentialValueRetained: false }); return this.store.put('pilot-connection-source', key, source, null); });
            const intent=this.store.get('pilot-connection-import',intentId);this.store.transaction(()=>this.store.put('pilot-connection-import',intentId,{...intent,status:'committed',knowledgeSourceId:saved.knowledgeSourceId},intent._version));ingested.push(saved);
        }
        const refreshed = this.get(id); const readiness: ConnectionReadiness = transport.kind === 'live' ? 'live_verified' : 'tested'; const next = { ...refreshed, cursor: collected.cursor, readiness, lastSync: { at: now(), transport: transport.kind, sourceCount: ingested.length, partial: collected.partial, limitations: collected.limitations }, updatedAt: now() };
        const connection = this.store.transaction(() => { this.store.event(pilotKnowledgeScope(prior.businessId), 'connection.sync_completed', { id, transport: transport.kind, readiness, ingested: ingested.length, skipped, partial: collected.partial, limitations: collected.limitations }); return this.store.put('pilot-connection', id, next, refreshed._version); });
        return { connection, ingested, skipped, partial: collected.partial, limitations: collected.limitations };
    }
    private requiredScopes(state: ConnectionState) { const definition = this.registry.get(state.provider).definition; return [...new Set(definition.capabilities.filter(capability => state.capabilityIds.includes(capability.id)).flatMap(capability => capability.requiredScopes))].sort(); }
    private assertReadable(state: ConnectionState) {
        requireThat(!state.revokedAt, 'CONNECTION_REVOKED'); requireThat(state.consent, 'CONNECTION_CONSENT_REQUIRED'); requireThat(!state.consent.expiresAt || Date.parse(state.consent.expiresAt) > Date.now(), 'CONNECTION_CONSENT_EXPIRED'); const missing = this.requiredScopes(state).filter(scope => !state.consent!.scopes.includes(scope)); requireThat(missing.length === 0, 'CONNECTION_SCOPE_PERMISSION_MISSING');
    }
    private connectionAllowsCachedUse(state: ConnectionState) { return !state.revokedAt && state.readiness !== 'permission_missing' && Boolean(state.consent) && (!state.consent!.expiresAt || Date.parse(state.consent!.expiresAt) > Date.now()) && this.requiredScopes(state).every(scope => state.consent!.scopes.includes(scope)); }
}
