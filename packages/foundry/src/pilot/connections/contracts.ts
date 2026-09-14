/**
 * The connection boundary deliberately carries only opaque credential references.
 * Tokens are resolved by a host-owned transport, after consent has been checked;
 * neither adapters nor persisted business evidence receive a secret.
 */
export const CONNECTION_READINESS = ['implemented', 'tested', 'configured', 'live_verified', 'permission_missing'] as const;
export type ConnectionReadiness = typeof CONNECTION_READINESS[number];
export type ProviderId = 'google_workspace' | 'shopify_admin' | 'google_analytics_4';
export type CredentialReference = { kind: 'owner_vault' | 'application_secret'; id: string };
export type ConnectionConsent = {
    grantedAt: string;
    grantedBy: string;
    scopes: string[];
    purpose: string;
    expiresAt?: string | null;
};
export type ConnectionCapability = {
    id: string;
    title: string;
    requiredScopes: string[];
    effects: 'read';
    incremental: boolean;
    sensitivity: 'business_documents' | 'commerce' | 'analytics';
};
export type ConnectionDefinition = {
    provider: ProviderId;
    title: string;
    documentation: string[];
    capabilities: ConnectionCapability[];
    readiness: ConnectionReadiness;
};
export type ProviderRequest = {
    method: 'GET' | 'POST';
    provider: ProviderId;
    /** Host transports may use this allow-list when resolving their opaque credential reference. */
    capabilityIds?: string[];
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    responseFormat?: 'json' | 'text' | 'base64';
};
export type ProviderResponse = { status: number; headers?: Record<string, string>; body: unknown };
/** A transport has no implicit fetch implementation. Test transports are explicit and cannot reach a network. */
export interface ConnectionTransport { readonly kind: 'offline' | 'live'; request(request: ProviderRequest): Promise<ProviderResponse>; }
/** `updatedAfter` is a committed watermark. `pendingUpdatedAfter` only advances while a paginated window is incomplete. */
export type SyncCursor = { updatedAfter?: string | null; pendingUpdatedAfter?: string | null; pageToken?: string | null; offset?: number | null };
export type CollectedSource = {
    sourceIdentity: string;
    title: string;
    text: string;
    observedAt: string;
    updatedAt: string | null;
    contentType: string;
    sourceUrl: string | null;
    sourceHash: string;
    partial: boolean;
    limitations: string[];
    retainedBytesBase64?: string;
    pageCount?: number | null;
};
export type CollectionResult = { sources: CollectedSource[]; cursor: SyncCursor; pagesRead: number; partial: boolean; limitations: string[] };
export interface ReadAdapter {
    readonly definition: ConnectionDefinition;
    collect(transport: ConnectionTransport, cursor: SyncCursor, options: Record<string, unknown>): Promise<CollectionResult>;
}
