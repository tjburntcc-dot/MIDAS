/**
 * Owner-approved execution boundary for a configured read connection.  This is
 * deliberately separate from configuration: the connection service retains an
 * opaque reference, while this host may read one explicitly approved token file
 * only after it has verified a signed, current grant.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, rawHash, requireThat } from '../../contracts.ts';
import { signed, verified } from '../../experiment/config.ts';
import { pilotKnowledgeScope } from '../knowledge.ts';
import { createConnectionTransport } from './live-transport.ts';
import type { ProviderId } from './contracts.ts';
import type { ConnectionService, ConnectionSource, ConnectionState } from './service.ts';

const PROPOSAL = 'connection-read.authorization.request.json';
const OWNER_KEY = 'connection-owner.pub';
const PROVIDERS: ProviderId[] = ['google_workspace', 'shopify_admin', 'google_analytics_4'];
const MAX_REQUESTS = 40;
const DEADLINE_MS = 15_000;

export type ConnectionReadGrant = {
    kind: 'pilot-connection-read-authorization-v1';
    id: string;
    root: string;
    businessId: string;
    connectionId: string;
    provider: ProviderId;
    shopDomain: string | null;
    protectedTokenFile: string;
    credentialReference: { kind: 'owner_vault' | 'application_secret'; id: string };
    binding: {
        connection: Pick<ConnectionState, 'businessId' | 'provider' | 'capabilityIds' | 'credentialReference' | 'configuration' | 'consent' | 'revokedAt'>;
        sourceScope: Array<Pick<ConnectionSource, 'id' | 'connectionId' | 'businessId' | 'knowledgeSourceId' | 'sourceHash' | 'revokedAt' | 'supersededAt'>>;
        sourceScopeHash: string;
        requiredScopes: string[];
        providers: ProviderId[];
        implementationHash: string;
    };
    maxRequests: 40;
    deadlineMs: 15000;
    expiresAt: string;
    approvedBy: string;
    approvalReference: string;
};

type ConnectionServices = { connectedAccounts: ConnectionService } | { connections: ConnectionService } | ConnectionService;
type StoredAccount = { grantHash: string; used: number; updatedAt: string; _version: number };
type StoredSync = { grantHash: string; connectionId: string; sequence: number; state: 'pending' | 'completed' | 'failed_or_unknown'; admissions: number; startedAt: string; completedAt?: string; error?: string; _version: number };
type StoredSourceScope = { grantHash: string; connectionId: string; initialSourceScopeHash: string; sourceScope: ConnectionReadGrant['binding']['sourceScope']; sourceScopeHash: string; updatedAt: string; _version: number };

const now = () => new Date().toISOString();
const hostDirectory = () => dirname(fileURLToPath(import.meta.url));
/** Changes to a reader, adapter, service or this admission boundary invalidate a signed packet. */
export const connectionHostImplementationHash = () => rawHash([
    'host.ts', 'live-transport.ts', 'service.ts', 'adapters.ts', 'contracts.ts'
].map(name => readFileSync(join(hostDirectory(), name), 'utf8').replace(/\r\n/g, '\n')).join('\n'));
const serviceFor = (value: ConnectionServices): ConnectionService => value instanceof Object && 'connectedAccounts' in value ? value.connectedAccounts : value instanceof Object && 'connections' in value ? value.connections : value as ConnectionService;
const exactSources = (service: ConnectionService, id: string) => service.sources(id).map(source => ({ id: source.id, connectionId: source.connectionId, businessId: source.businessId, knowledgeSourceId: source.knowledgeSourceId, sourceHash: source.sourceHash, revokedAt: source.revokedAt, supersededAt: source.supersededAt })).sort((a, b) => a.id.localeCompare(b.id));
const connectionBinding = (service: ConnectionService, id: string) => {
    const connection = service.get(id), requiredScopes = [...new Set(service.registry.get(connection.provider).definition.capabilities.filter(capability => connection.capabilityIds.includes(capability.id)).flatMap(capability => capability.requiredScopes))].sort();
    const selected = { businessId: connection.businessId, provider: connection.provider, capabilityIds: [...connection.capabilityIds].sort(), credentialReference: structuredClone(connection.credentialReference), configuration: structuredClone(connection.configuration), consent: connection.consent ? structuredClone(connection.consent) : null, revokedAt: connection.revokedAt };
    const sourceScope = exactSources(service, id);
    return { connection: selected, sourceScope, sourceScopeHash: hash(sourceScope), requiredScopes, providers: [...PROVIDERS], implementationHash: connectionHostImplementationHash() };
};
const validExpiry = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const rootPath = (root: string) => { requireThat(isAbsolute(root), 'CONNECTION_HOST_ROOT_ABSOLUTE'); return resolve(root); };
const tokenPath = (file: string) => { requireThat(typeof file === 'string' && isAbsolute(file), 'CONNECTION_HOST_PROTECTED_TOKEN_FILE'); return resolve(file); };
const shopDomain = (value: unknown) => { requireThat(typeof value === 'string' && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value), 'CONNECTION_HOST_SHOP_DOMAIN'); return value; };
const connectionFileId = (id: string) => { requireThat(typeof id === 'string' && /^connection-[a-z0-9]{8,40}$/.test(id), 'CONNECTION_HOST_CONNECTION_ID'); return id; };
const authorizationDirectory = (root: string) => join(root, 'auth', 'connection-read');
const authorizationFile = (root: string, connectionId: string) => join(authorizationDirectory(root), connectionFileId(connectionId) + '.authorization.json');
const installedConnectionIds = (root: string) => existsSync(authorizationDirectory(root)) ? readdirSync(authorizationDirectory(root)).flatMap(name => { const match = /^(connection-[a-z0-9]{8,40})\.authorization\.json$/.exec(name); return match ? [match[1]] : []; }).sort() : [];
const selectedConnectionId = (root: string, requested?: string) => { if (requested) return connectionFileId(requested); const all = installedConnectionIds(root); requireThat(all.length === 1, all.length ? 'CONNECTION_HOST_CONNECTION_REQUIRED' : 'CONNECTION_HOST_AUTHORIZATION_REQUIRED'); return all[0]; };

function validate(services: ConnectionServices, root: string, grant: ConnectionReadGrant, signedGrant: boolean, allowRecordedSourceScope = false) {
    const service = serviceFor(services), expectedRoot = rootPath(root);
    requireThat(grant && grant.kind === 'pilot-connection-read-authorization-v1' && typeof grant.id === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(grant.id), 'CONNECTION_HOST_GRANT_SHAPE');
    requireThat(grant.root === expectedRoot && typeof grant.businessId === 'string' && typeof grant.connectionId === 'string' && PROVIDERS.includes(grant.provider) && (grant.provider === 'shopify_admin' ? shopDomain(grant.shopDomain) === grant.shopDomain : grant.shopDomain === null), 'CONNECTION_HOST_GRANT_SCOPE');
    requireThat(grant.protectedTokenFile === tokenPath(grant.protectedTokenFile) && grant.maxRequests === MAX_REQUESTS && grant.deadlineMs === DEADLINE_MS && validExpiry(grant.expiresAt), 'CONNECTION_HOST_GRANT_BOUNDS');
    requireThat(Array.isArray(grant.binding?.providers) && hash(grant.binding.providers) === hash(PROVIDERS) && grant.binding.implementationHash === connectionHostImplementationHash(), 'CONNECTION_HOST_IMPLEMENTATION_CHANGED');
    const fresh = connectionBinding(service, grant.connectionId), savedScope = allowRecordedSourceScope ? service.store.get('pilot-connection-host-source-scope', `connection-host-source-scope/${hash(grant)}`) as StoredSourceScope | null : null, expectedScope = savedScope?.sourceScope ?? grant.binding.sourceScope;
    requireThat(!savedScope || savedScope.grantHash === hash(grant) && savedScope.connectionId === grant.connectionId && savedScope.initialSourceScopeHash === grant.binding.sourceScopeHash && savedScope.sourceScopeHash === hash(savedScope.sourceScope), 'CONNECTION_HOST_SOURCE_SCOPE_RECORD');
    requireThat(fresh.connection.businessId === grant.businessId && fresh.connection.provider === grant.provider && hash(fresh.connection) === hash(grant.binding.connection) && hash(fresh.requiredScopes) === hash(grant.binding.requiredScopes) && fresh.sourceScopeHash === hash(expectedScope) && hash(fresh.sourceScope) === hash(expectedScope), 'CONNECTION_HOST_SCOPE_CHANGED');
    requireThat(hash(fresh.connection.credentialReference) === hash(grant.credentialReference) && !fresh.connection.revokedAt && fresh.connection.consent && (!fresh.connection.consent.expiresAt || Date.parse(fresh.connection.consent.expiresAt) > Date.now()) && fresh.requiredScopes.every(scope => fresh.connection.consent!.scopes.includes(scope)), 'CONNECTION_HOST_CONSENT_CHANGED');
    if (signedGrant) requireThat(grant.approvedBy.trim().length > 0 && grant.approvalReference.trim().length > 0, 'CONNECTION_HOST_UNSIGNED');
    return { service, connection: service.get(grant.connectionId) };
}

/** Creates an unsigned, reviewable packet. It writes neither a token nor an authorization. */
export function prepareConnectionReadAuthorization(services: ConnectionServices, input: { root: string; directory?: string; id: string; businessId: string; connectionId: string; protectedTokenFile: string; expiresAt: string; shopDomain?: string }) {
    const root = rootPath(input.root), service = serviceFor(services), binding = connectionBinding(service, input.connectionId), connection = service.get(input.connectionId);
    requireThat(connection.businessId === input.businessId && validExpiry(input.expiresAt) && Date.parse(input.expiresAt) > Date.now(), 'CONNECTION_HOST_PREPARE_SCOPE');
    const approvedShopDomain = connection.provider === 'shopify_admin' ? shopDomain(input.shopDomain) : null; requireThat(connection.provider === 'shopify_admin' || input.shopDomain === undefined, 'CONNECTION_HOST_SHOP_DOMAIN_SCOPE');
    const proposal: ConnectionReadGrant = { kind: 'pilot-connection-read-authorization-v1', id: input.id, root, businessId: input.businessId, connectionId: input.connectionId, provider: connection.provider, shopDomain: approvedShopDomain, protectedTokenFile: tokenPath(input.protectedTokenFile), credentialReference: structuredClone(connection.credentialReference), binding, maxRequests: MAX_REQUESTS, deadlineMs: DEADLINE_MS, expiresAt: input.expiresAt, approvedBy: '', approvalReference: '' };
    validate(services, root, proposal, false);
    const summary = { approved: false, providerRequests: 0, credentialRead: false, maxRequests: MAX_REQUESTS, deadlineMs: DEADLINE_MS, authority: 'One signed grant permits only read adapters for this exact consented connection and its frozen source scope.' };
    if (input.directory) {
        const directory = rootPath(input.directory); requireThat(!existsSync(join(directory, PROPOSAL)), 'CONNECTION_HOST_UNSIGNED_PACKET_EXISTS');
        mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, PROPOSAL), JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' }); writeFileSync(join(directory, 'connection-read.execution-requirements.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
    }
    return { proposal, proposalHash: hash(proposal), summary };
}

/** Explicit owner-key operation. The installed envelope is immutable and contains a path, never token bytes. */
export function signConnectionReadProposal(services: ConnectionServices, root: string, input: { proposal: ConnectionReadGrant; expectedHash: string; principal: string; approvalReference: string; publicKey: string; privateKey: string }) {
    const resolved = rootPath(root); requireThat(hash(input.proposal) === input.expectedHash && input.principal.trim().length > 0 && input.approvalReference.trim().length > 0 && typeof input.publicKey === 'string' && typeof input.privateKey === 'string' && !existsSync(authorizationFile(resolved, input.proposal.connectionId)), 'CONNECTION_HOST_EXACT_APPROVAL_HASH');
    validate(services, resolved, input.proposal, false); requireThat(Date.parse(input.proposal.expiresAt) > Date.now(), 'CONNECTION_HOST_GRANT_EXPIRED');
    const grant = { ...structuredClone(input.proposal), approvedBy: input.principal.trim(), approvalReference: input.approvalReference.trim() };
    validate(services, resolved, grant, true); const envelope = signed(grant, input.privateKey); verified(envelope, input.publicKey);
    mkdirSync(join(resolved, 'auth'), { recursive: true }); const key = join(resolved, 'auth', OWNER_KEY);
    if (existsSync(key)) requireThat(readFileSync(key, 'utf8') === input.publicKey, 'CONNECTION_HOST_TRUST_ANCHOR_CHANGED'); else writeFileSync(key, input.publicKey, { flag: 'wx' });
    mkdirSync(authorizationDirectory(resolved), { recursive: true }); writeFileSync(authorizationFile(resolved, grant.connectionId), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
    serviceFor(services).store.record(pilotKnowledgeScope(grant.businessId), `connection-host-approved-${hash(grant)}`, 'PilotConnectionReadAuthorization', { grantHash: hash(grant), connectionId: grant.connectionId, businessId: grant.businessId, provider: grant.provider, protectedTokenFile: grant.protectedTokenFile, maxRequests: grant.maxRequests, deadlineMs: grant.deadlineMs, credentialValueRetained: false });
    return { envelope, proposalHash: input.expectedHash, providerRequests: 0, credentialRead: false };
}

const accountKey = (grant: ConnectionReadGrant) => `connection-host-account/${hash(grant)}`;
const syncKey = (grant: ConnectionReadGrant) => `connection-host-sync/${hash(grant)}/${grant.connectionId}`;

/** Read-only status: it verifies an installed envelope but never opens the token file or creates accounting state. */
export function inspectConnectionReadAuthorization(services: ConnectionServices, root: string, connectionId?: string) {
    const resolved = rootPath(root), service = serviceFor(services), none = { approved: false, current: false, liveEnabled: false, businessId: null as string | null, connectionId: null as string | null, reason: 'No signed connection read authorization is installed.', requestsMadeByStatusCall: 0, maxRequests: MAX_REQUESTS, admittedReads: 0, dispatchedReads: null as number | null, unknownReads: 0, readsRemaining: MAX_REQUESTS };
    let selected: string; try { selected = selectedConnectionId(resolved, connectionId); } catch (error) { return { ...none, reason: (error as Error).message }; }
    try {
        const grant = verified(JSON.parse(readFileSync(authorizationFile(resolved, selected), 'utf8')), readFileSync(join(resolved, 'auth', OWNER_KEY), 'utf8')) as ConnectionReadGrant, account = service.store.get('pilot-connection-host-account', accountKey(grant)) as StoredAccount | null;
        let current = true, reason = 'Signed connection read authority is current.'; try { validate(services, resolved, grant, true, true); requireThat(Date.parse(grant.expiresAt) > Date.now(), 'CONNECTION_HOST_GRANT_EXPIRED'); } catch (error) { current = false; reason = (error as Error).message; }
        const admittedReads = account?.used ?? 0; return { approved: true, current, liveEnabled: current && admittedReads < grant.maxRequests, businessId: grant.businessId, connectionId: grant.connectionId, grantHash: hash(grant), reason, requestsMadeByStatusCall: 0, maxRequests: grant.maxRequests, admittedReads, dispatchedReads: null as number | null, unknownReads: admittedReads, readsRemaining: Math.max(0, grant.maxRequests - admittedReads) };
    } catch (error) { return { ...none, reason: (error as Error).message }; }
}

/** Loads the only execution entry point. It exposes sync, never a token resolver or raw transport. */
export function loadAuthorizedConnectionRead(services: ConnectionServices, root: string, options: { connectionId?: string; testing?: { envelope: any; trustedPublicKey: string; fetch: typeof fetch } } = {}) {
    const resolved = rootPath(root), service = serviceFor(services), selected = options.testing ? options.connectionId : selectedConnectionId(resolved, options.connectionId), envelope = options.testing?.envelope ?? JSON.parse(readFileSync(authorizationFile(resolved, selected!), 'utf8')), publicKey = options.testing?.trustedPublicKey ?? readFileSync(join(resolved, 'auth', OWNER_KEY), 'utf8'), grant = verified(envelope, publicKey) as ConnectionReadGrant;
    requireThat(!options.connectionId || grant.connectionId === connectionFileId(options.connectionId), 'CONNECTION_HOST_GRANT_CONNECTION_MISMATCH');
    requireThat(!options.testing || service.knowledge.company(grant.businessId).mode === 'fixture', 'CONNECTION_HOST_TESTING_FIXTURE_ONLY'); validate(services, resolved, grant, true, true); requireThat(Date.parse(grant.expiresAt) > Date.now(), 'CONNECTION_HOST_GRANT_EXPIRED');
    const grantHash = hash(grant), account = () => service.store.get('pilot-connection-host-account', accountKey(grant)) as StoredAccount | null;
    const current = () => { validate(services, resolved, grant, true, true); requireThat(Date.parse(grant.expiresAt) > Date.now(), 'CONNECTION_HOST_GRANT_EXPIRED'); };
    const begin = () => service.store.transaction(() => {
        current(); const old = service.store.get('pilot-connection-host-sync', syncKey(grant)) as StoredSync | null;
        requireThat(!old || old.state === 'completed', 'CONNECTION_HOST_INTERRUPTED_NO_RESUBMIT');
        const value = { grantHash, connectionId: grant.connectionId, sequence: (old?.sequence ?? 0) + 1, state: 'pending' as const, admissions: 0, startedAt: now() };
        return service.store.put('pilot-connection-host-sync', syncKey(grant), value, old?._version ?? null) as StoredSync;
    });
    const admit = (session: StoredSync) => service.store.transaction(() => {
        current(); const old = account(), used = old?.used ?? 0; requireThat(used < grant.maxRequests, 'CONNECTION_HOST_REQUEST_CAP');
        const next = service.store.put('pilot-connection-host-account', accountKey(grant), { grantHash, used: used + 1, updatedAt: now() }, old?._version ?? null) as StoredAccount;
        const latest = service.store.get('pilot-connection-host-sync', syncKey(grant)) as StoredSync; requireThat(latest?.state === 'pending' && latest.sequence === session.sequence, 'CONNECTION_HOST_SESSION_CHANGED');
        service.store.put('pilot-connection-host-sync', syncKey(grant), { ...latest, admissions: latest.admissions + 1 }, latest._version);
        service.store.record(pilotKnowledgeScope(grant.businessId), `connection-host-admission-${grantHash}-${used + 1}`, 'PilotConnectionReadAdmission', { grantHash, connectionId: grant.connectionId, admission: used + 1, maximum: grant.maxRequests, admittedBeforeCredentialRead: true });
        return next;
    });
    const stableFailure = (error: unknown) => { const candidate = typeof (error as any)?.code === 'string' ? (error as any).code : typeof (error as any)?.message === 'string' ? (error as any).message : ''; return /^[A-Z][A-Z0-9_]{2,119}$/.test(candidate) ? candidate : 'CONNECTION_HOST_SYNC_FAILED_OR_UNKNOWN'; };
    const finish = (session: StoredSync, state: 'completed' | 'failed_or_unknown', error?: unknown) => service.store.transaction(() => {
        const old = service.store.get('pilot-connection-host-sync', syncKey(grant)) as StoredSync | null; if (!old || old.sequence !== session.sequence || old.state !== 'pending') return;
        service.store.put('pilot-connection-host-sync', syncKey(grant), { ...old, state, completedAt: now(), ...(error ? { error: stableFailure(error) } : {}) }, old._version);
    });
    const recordSuccessfulSourceScope = () => service.store.transaction(() => {
        const fresh = connectionBinding(service, grant.connectionId), prior = service.store.get('pilot-connection-host-source-scope', `connection-host-source-scope/${grantHash}`) as StoredSourceScope | null;
        /* The adapter can only add this continuation snapshot after every provider
         * request was admitted under the prior snapshot. A later external source
         * change cannot match this exact retained set. */
        requireThat(hash(fresh.connection) === hash(grant.binding.connection) && hash(fresh.requiredScopes) === hash(grant.binding.requiredScopes), 'CONNECTION_HOST_CONSENT_CHANGED');
        service.store.put('pilot-connection-host-source-scope', `connection-host-source-scope/${grantHash}`, { grantHash, connectionId: grant.connectionId, initialSourceScopeHash: grant.binding.sourceScopeHash, sourceScope: fresh.sourceScope, sourceScopeHash: fresh.sourceScopeHash, updatedAt: now() }, prior?._version ?? null);
    });
    const sync = async () => {
        const session = begin();
        try {
            const transport = createConnectionTransport(service, grant.connectionId, { maxRequests: grant.maxRequests, deadlineMs: grant.deadlineMs, shopDomain: grant.shopDomain ?? undefined, fetch: options.testing?.fetch, resolveAccessToken: async () => {
                /* The live transport has already validated its request scope. This durable
                 * admission happens before token bytes are read and before any fetch. */
                admit(session); current(); requireThat(existsSync(grant.protectedTokenFile), 'CONNECTION_HOST_PROTECTED_TOKEN_UNAVAILABLE');
                const token = readFileSync(grant.protectedTokenFile, 'utf8').trim(); requireThat(token.length > 0 && !/[\r\n]/.test(token), 'CONNECTION_HOST_PROTECTED_TOKEN_UNAVAILABLE'); return token;
            }});
            const result = await service.sync(grant.connectionId, transport); recordSuccessfulSourceScope(); finish(session, 'completed'); return result;
        } catch (error) { finish(session, 'failed_or_unknown', error); throw error; }
    };
    return { authorization: grant, sync, status: () => inspectConnectionReadAuthorization(services, resolved, grant.connectionId), totals: () => { const admittedReads = account()?.used ?? 0; return { admittedReads, dispatchedReads: null as number | null, unknownReads: admittedReads, readsRemaining: Math.max(0, grant.maxRequests - admittedReads), maxRequests: grant.maxRequests, requestsMadeByStatusCall: 0 }; } };
}
