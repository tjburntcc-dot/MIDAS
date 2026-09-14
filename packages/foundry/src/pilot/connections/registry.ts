import type { ConnectionDefinition, ProviderId, ReadAdapter } from './contracts.ts';

/** Discoverable maintained reads. Availability is per capability, never inferred from a logo. */
export class ConnectionRegistry {
    private readonly adapters = new Map<ProviderId, ReadAdapter>();
    constructor(adapters: ReadAdapter[]) { for (const adapter of adapters) this.adapters.set(adapter.definition.provider, adapter); }
    get(provider: ProviderId): ReadAdapter { const adapter = this.adapters.get(provider); if (!adapter) throw new Error('CONNECTION_PROVIDER_UNAVAILABLE'); return adapter; }
    list(): ConnectionDefinition[] { return [...this.adapters.values()].map(a => structuredClone(a.definition)); }
}
