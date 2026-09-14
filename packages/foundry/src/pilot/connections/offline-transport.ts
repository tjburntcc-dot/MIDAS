import type { ConnectionTransport, ProviderRequest, ProviderResponse } from './contracts.ts';

export type OfflineRoute = { matches: (request: ProviderRequest) => boolean; response: ProviderResponse | ((request: ProviderRequest) => ProviderResponse) };
/** Exact, caller-supplied fixtures. There is deliberately no fallback to fetch or an SDK. */
export class OfflineTransport implements ConnectionTransport {
    readonly kind = 'offline' as const;
    private readonly routes: OfflineRoute[];
    constructor(routes: OfflineRoute[]) { this.routes = routes; }
    async request(request: ProviderRequest): Promise<ProviderResponse> {
        const route = this.routes.find(candidate => candidate.matches(request));
        if (!route) throw new Error('OFFLINE_TRANSPORT_ROUTE_MISSING');
        const response = typeof route.response === 'function' ? route.response(request) : route.response;
        return structuredClone(response);
    }
}
/** Useful as the default boundary in owner flows: callers must intentionally supply a transport. */
export class NoNetworkTransport implements ConnectionTransport {
    readonly kind = 'offline' as const;
    async request(): Promise<ProviderResponse> { throw new Error('CONNECTION_TRANSPORT_REQUIRED_NO_NETWORK_FALLBACK'); }
}
