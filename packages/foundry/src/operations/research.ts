/**
 * A deliberately small public-web reader.  It is not a search-provider client:
 * a worker first chooses one of the configured seeds or a link observed in the
 * resulting corpus, then asks for a retrieval.  Queries only rank that local,
 * already-retrieved corpus.
 */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

export const RESEARCH_ADAPTER_VERSION = 'midas-bounded-research-v1';
export const UNSUPPORTED_DOCUMENT_NOTE = 'Unsupported document type; ebooks, PDFs, audio, and video are not extracted.';

export type ResearchPolicy = {
    /** Public HTTPS starting points. Their exact hosts define the scope. */
    seedUrls: string[];
    maxPages?: number;
    maxLinksPerPage?: number;
    maxRedirects?: number;
    maxBytes?: number;
    deadlineMs?: number;
    maxTextChars?: number;
    /** Opt-in evidence retention/discovery for the owner pilot. Existing readers keep their scope. */
    retainBody?: boolean;
    discoverLinkedHosts?: boolean;
    allowPublicRedirects?: boolean;
    /** Opt-in prefix evidence; never implies the complete resource was read. */
    partialBodyAtLimit?: boolean;
};

export type ResearchLink = { url: string; text: string };
export type ResearchSource = {
    id: string;
    url: string;
    observedAt: string;
    contentHash: string;
    sourceAssertion: string;
    links: ResearchLink[];
    rights: 'public_readonly';
    contentType: string;
    title: string | null;
    text: string;
    revision: number;
    revises: string | null;
    retainedBody?: { base64: string; byteLength: number; textComplete: boolean; extraction: 'html-text-v1' | 'plain-text-v1'; decoding: 'utf8-with-replacement'; bodyComplete?:boolean; hashScope?:'complete-body'|'retained-prefix'; declaredByteLength?:number|null; receivedBytesAtLeast?:number; limitReason?:string|null };
};

export type RetrievalResult = {
    kind: 'retrieval';
    requestedUrl: string;
    finalUrl: string | null;
    status: 'retrieved' | 'rejected' | 'unsupported' | 'failed';
    code: string | null;
    note: string | null;
    hops: Array<{ url: string; status: number }>;
    source: ResearchSource | null;
};

export type LocalQueryResult = {
    kind: 'dynamic_query';
    keywords: string[];
    matches: Array<Pick<ResearchSource, 'id' | 'url' | 'title' | 'sourceAssertion' | 'links' | 'observedAt' | 'contentHash'>>;
};

export type EvidenceResult = {
    kind: 'evidence';
    source: Pick<ResearchSource, 'id' | 'url' | 'observedAt' | 'contentHash' | 'sourceAssertion' | 'rights' | 'revision' | 'revises'>;
};

type HeadersLike = { get(name: string): string | null };
type BodyReader = { read(): Promise<{ done: boolean; value?: Uint8Array }> };
export type FetchResult = {
    status: number;
    headers: HeadersLike;
    body?: { getReader(): BodyReader } | null;
    arrayBuffer?: () => Promise<ArrayBuffer>;
};
export type ResearchPorts = {
    /** Optional trusted outer scope check, applied to every redirect before DNS or dispatch. */
    beforeRequest?: (url: string) => void;
    /** Test seam only. The resolved vetted address is supplied; production uses pinned HTTPS lookup. */
    fetch?: (url: string, init: { method: 'GET'; redirect: 'manual'; headers: Record<string, string>; signal: AbortSignal }, vettedAddress: string) => Promise<FetchResult>;
    dnsLookup?: (hostname: string) => Promise<Array<{ address: string }>>;
    now?: () => Date;
};

export class ResearchError extends Error {
    readonly code: string;
    constructor(code: string, message = code) { super(message); this.code = code; }
}

const defaults = { maxPages: 8, maxLinksPerPage: 24, maxRedirects: 3, maxBytes: 350_000, deadlineMs: 7_500, maxTextChars: 20_000, retainBody: false, discoverLinkedHosts: false, allowPublicRedirects: false, partialBodyAtLimit:false };
const textTypes = new Set(['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown']);
const explicitlyUnsupported = /^(application\/pdf|application\/epub\+zip|application\/x-mobipocket-ebook|audio\/|video\/|image\/)/i;

function sha256(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex'); }
function cleanText(value: string): string {
    return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}
function stripMarkup(value: string,partial=false): string {
    // A bounded prefix may end inside an HTML attribute. Preserve that prefix as
    // source evidence, but do not present the unfinished tag as page wording.
    if(partial)value=value.replace(/<[A-Za-z!/?][^>]*$/g,' ');
    if(partial)value=value.replace(/<(script|style|template|noscript|svg|canvas|iframe|object|embed|form|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<(script|style|template|noscript|svg|canvas|iframe|object|embed|form|nav|footer|header|aside)\b[^>]*>[\s\S]*$/gi,' ');
    return cleanText(value
        .replace(/<(script|style|template|noscript|svg|canvas|iframe|object|embed|form|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<\/?(?:p|div|article|main|section|h[1-6]|li|br|tr|blockquote)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '));
}
function titleFromHtml(html: string): string | null {
    const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
    return m ? cleanText(m[1].replace(/<[^>]+>/g, ' ')).slice(0, 240) || null : null;
}
function headerGet(headers: HeadersLike, name: string): string {
    return String(headers.get(name) || '').trim();
}
function contentType(headers: HeadersLike): string { return headerGet(headers, 'content-type').split(';', 1)[0].toLowerCase(); }
function normalizedUrl(raw: string): URL {
    let url: URL;
    try { url = new URL(raw); } catch { throw new ResearchError('INVALID_URL', 'The requested URL is invalid.'); }
    url.hash = '';
    if (url.username || url.password) throw new ResearchError('CREDENTIALS_FORBIDDEN', 'URLs containing credentials are never fetched.');
    if (url.protocol !== 'https:') throw new ResearchError('HTTPS_REQUIRED', 'Only public HTTPS URLs are permitted.');
    if (url.port && url.port !== '443') throw new ResearchError('PORT_FORBIDDEN', 'Only HTTPS port 443 is permitted.');
    return url;
}
function blockedIp(address: string): boolean {
    let v = address.toLowerCase().replace(/^\[|\]$/g, '');
    if(v.includes(':')) { try { v=new URL('https://['+v+']/').hostname.slice(1,-1); } catch { return true; } }
    if (v === '::1' || v === '0:0:0:0:0:0:0:1' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd') || v === '::') return true;
    // Some resolvers render an IPv4-mapped private address as ::ffff:c0a8:0101
    // rather than ::ffff:192.168.1.1. Normalize that form before IPv4 checks.
    const mappedHex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHex) {
        const high = Number.parseInt(mappedHex[1], 16); const low = Number.parseInt(mappedHex[2], 16);
        return blockedIp([(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join('.'));
    }
    if(v.includes(':')&&!v.startsWith('::ffff:')&&(!/^[23][0-9a-f]{0,3}:/.test(v)||v.startsWith('2001:db8:')))return true;
    const ipv4 = v.startsWith('::ffff:') ? v.slice(7) : v;
    const parts = ipv4.split('.').map(Number);
    return parts.length === 4 && parts.every(Number.isFinite) && (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && (parts[1] === 0 || parts[1] === 168)) || parts[0] >= 224);
}
function blockedHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    return host === 'localhost' || host.endsWith('.localhost') || host === 'metadata' || host.includes('metadata.') || blockedIp(host);
}
function isRedirect(status: number): boolean { return [301, 302, 303, 307, 308].includes(status); }
function words(raw: string): string[] { return [...new Set(raw.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,}/gu) || [])].slice(0, 12); }

async function readLimited(response: FetchResult, maxBytes: number,partial=false,abort=()=>{}): Promise<{bytes:Uint8Array;partial:boolean;declaredBytes:number|null;receivedBytesAtLeast:number}> {
    const declaredHeader=headerGet(response.headers,'content-length'),declared=Number(declaredHeader),declaredBytes=declaredHeader!==''&&Number.isSafeInteger(declared)&&declared>=0?declared:null;
    if (declaredBytes!==null && declaredBytes > maxBytes&&!partial) {abort();throw new ResearchError('BYTE_LIMIT_EXCEEDED');}
    if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0,receivedBytesAtLeast=0,truncated=false;
        while (true) {
            const row = await reader.read();
            if (row.done) break;
            const chunk = row.value || new Uint8Array();
            receivedBytesAtLeast+=chunk.byteLength;
            if(size+chunk.byteLength>maxBytes&&!partial){abort();throw new ResearchError('BYTE_LIMIT_EXCEEDED');}
            const take=chunk.subarray(0,Math.max(0,maxBytes-size));chunks.push(take);size+=take.byteLength;
            if(partial&&size>=maxBytes){truncated=true;abort();break;}
        }
        const output = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
        return {bytes:output,partial:truncated,declaredBytes,receivedBytesAtLeast};
    }
    if (!response.arrayBuffer) throw new ResearchError('BODY_UNAVAILABLE');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes&&!partial){abort();throw new ResearchError('BYTE_LIMIT_EXCEEDED');}
    const truncated=bytes.byteLength>maxBytes;if(truncated)abort();return {bytes:bytes.subarray(0,maxBytes),partial:truncated,declaredBytes,receivedBytesAtLeast:bytes.byteLength};
}

async function beforeDeadline<T>(work: Promise<T>, ms: number, controller: AbortController): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new ResearchError('DEADLINE_EXCEEDED')); }, ms); });
    try { return await Promise.race([work, deadline]); } finally { if (timeout) clearTimeout(timeout); }
}

/** Production transport pins Node's connection lookup to the address vetted above. */
export function createPinnedLookup(vettedAddress:string){
    return (_hostname:string,options:{all?:boolean},callback:(...args:any[])=>void)=>{
        const family=vettedAddress.includes(':')?6:4;
        if(options?.all)callback(null,[{address:vettedAddress,family}]);else callback(null,vettedAddress,family);
    };
}
function pinnedHttpsFetch(url: string, init: { method: 'GET'; redirect: 'manual'; headers: Record<string, string>; signal: AbortSignal }, vettedAddress: string): Promise<FetchResult> {
    const parsed = new URL(url);
    return new Promise((resolve, reject) => {
        const req = httpsRequest(parsed, { method: init.method, headers: init.headers, lookup: createPinnedLookup(vettedAddress) }, response => {
            const body = Readable.toWeb(response) as unknown as { getReader(): BodyReader };
            resolve({ status: response.statusCode || 0, headers: { get: name => { const value = response.headers[name.toLowerCase()]; return Array.isArray(value) ? value.join(', ') : value || null; } }, body });
        });
        const abort = () => req.destroy(new ResearchError('DEADLINE_EXCEEDED'));
        init.signal.addEventListener('abort', abort, { once: true });
        req.once('error', error => reject(error));
        req.once('close', () => init.signal.removeEventListener('abort', abort));
        req.end();
    });
}

function extractLinks(html: string, base: URL, allowedHosts: Set<string>, maxLinks: number, discoverLinkedHosts = false): ResearchLink[] {
    if (maxLinks === 0) return [];
    const seen = new Set<string>(); const links: ResearchLink[] = [];
    const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
    for (let match; (match = pattern.exec(html));) {
        try {
            const url = normalizedUrl(new URL(match[2], base).toString());
            if (blockedHostname(url.hostname) || !discoverLinkedHosts && !allowedHosts.has(url.hostname.toLowerCase())) continue;
            const value = url.toString();
            if (!seen.has(value)) { seen.add(value); links.push({ url: value, text: cleanText(match[3].replace(/<[^>]+>/g, ' ')).slice(0, 240) }); }
            if (links.length >= maxLinks) break;
        } catch { /* Untrusted markup is data, not a capability. */ }
    }
    return links;
}

export class BoundedResearchAdapter {
    private readonly policy: Required<ResearchPolicy>;
    private readonly allowedHosts: Set<string>;
    private readonly selectable = new Set<string>();
    private readonly sources: ResearchSource[] = [];
    private sequence = 0;
    private requestAttempts = 0;
    private readonly ports: ResearchPorts;

    constructor(policy: ResearchPolicy, ports: ResearchPorts = {}) {
        this.ports = ports;
        if (!policy?.seedUrls?.length) throw new ResearchError('SEEDS_REQUIRED', 'A bounded public-research policy needs at least one seed URL.');
        this.policy = { ...defaults, ...policy, seedUrls: policy.seedUrls };
        if ([this.policy.retainBody, this.policy.discoverLinkedHosts, this.policy.allowPublicRedirects,this.policy.partialBodyAtLimit].some(v => typeof v !== 'boolean')) throw new ResearchError('INVALID_RESEARCH_DISCOVERY_OPTIONS');
        if(this.policy.partialBodyAtLimit&&!this.policy.retainBody)throw new ResearchError('PARTIAL_BODY_REQUIRES_RETENTION');
        for (const [name, value, min, max] of [['maxPages', this.policy.maxPages, 1, 32], ['maxLinksPerPage', this.policy.maxLinksPerPage, 0, 128], ['maxRedirects', this.policy.maxRedirects, 0, 8], ['maxBytes', this.policy.maxBytes, 1, 1_000_000], ['deadlineMs', this.policy.deadlineMs, 1, 30_000], ['maxTextChars', this.policy.maxTextChars, 1, 100_000]] as const)
            if (!Number.isSafeInteger(value) || value < min || value > max) throw new ResearchError('INVALID_' + name.toUpperCase());
        this.allowedHosts = new Set(policy.seedUrls.map(seed => normalizedUrl(seed).hostname.toLowerCase()));
        for (const seed of policy.seedUrls) {
            const url = normalizedUrl(seed).toString();
            if (blockedHostname(new URL(url).hostname)) throw new ResearchError('PRIVATE_HOST_FORBIDDEN');
            this.selectable.add(url);
        }
    }

    listSources(): ResearchSource[] { return structuredClone(this.sources); }
    candidates(): string[] { return [...this.selectable]; }
    attemptedRequests(): number { return this.requestAttempts; }

    async run(request: { operation: 'retrieve'; url: string } | { operation: 'dynamic_query'; query: string } | { operation: 'evidence'; sourceId: string }): Promise<RetrievalResult | LocalQueryResult | EvidenceResult> {
        if (request.operation === 'retrieve') return this.retrieve(request.url);
        if (request.operation === 'dynamic_query') return this.dynamicQuery(request.query);
        return this.evidence(request.sourceId);
    }

    async retrieve(rawUrl: string): Promise<RetrievalResult> {
        let requested: URL;
        try { requested = this.assertInScope(rawUrl, true); }
        catch (error) { return this.failed(rawUrl, error, []); }
        const hops: Array<{ url: string; status: number }> = [];
        let current = requested;
        try {
            for (let redirects = 0; redirects <= this.policy.maxRedirects; redirects++) {
                if (this.requestAttempts >= this.policy.maxPages) throw new ResearchError('PAGE_LIMIT_EXCEEDED');
                this.ports.beforeRequest?.(current.toString());
                this.requestAttempts++;
                const vettedAddress = await this.resolvePublic(current.hostname);
                const controller = new AbortController();
                const init = { method: 'GET' as const, redirect: 'manual' as const, headers: { accept: 'text/html, text/plain;q=0.8', 'user-agent': 'MIDAS-BoundedResearch/1.0 (+public-readonly)' }, signal: controller.signal };
                const response = await beforeDeadline(this.ports.fetch ? this.ports.fetch(current.toString(), init, vettedAddress) : pinnedHttpsFetch(current.toString(), init, vettedAddress), this.policy.deadlineMs, controller);
                hops.push({ url: current.toString(), status: response.status });
                if (isRedirect(response.status)) {
                    const location = headerGet(response.headers, 'location');
                    if (!location) throw new ResearchError('REDIRECT_WITHOUT_LOCATION');
                    if (redirects === this.policy.maxRedirects) throw new ResearchError('REDIRECT_LIMIT_EXCEEDED');
                    current = this.assertInScope(new URL(location, current).toString(), false);
                    continue;
                }
                if (response.status < 200 || response.status >= 300) throw new ResearchError('HTTP_' + response.status);
                const type = contentType(response.headers) || 'text/html';
                if (explicitlyUnsupported.test(type)) return { kind: 'retrieval', requestedUrl: requested.toString(), finalUrl: current.toString(), status: 'unsupported', code: 'UNSUPPORTED_DOCUMENT_TYPE', note: UNSUPPORTED_DOCUMENT_NOTE, hops, source: null };
                if (!textTypes.has(type)) return { kind: 'retrieval', requestedUrl: requested.toString(), finalUrl: current.toString(), status: 'unsupported', code: 'UNSUPPORTED_CONTENT_TYPE', note: 'Unsupported content type; no extraction was performed.', hops, source: null };
                const captured = await beforeDeadline(readLimited(response, this.policy.maxBytes,this.policy.partialBodyAtLimit,()=>controller.abort()), this.policy.deadlineMs, controller),bytes=captured.bytes;
                const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                const html = type === 'text/html' || type === 'application/xhtml+xml';
                const fullText = html ? stripMarkup(raw,captured.partial) : cleanText(raw), text = fullText.slice(0, this.policy.maxTextChars);
                const linkMarkup=captured.partial?raw.replace(/<(script|style|template|noscript|svg|canvas|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<(script|style|template|noscript|svg|canvas|iframe|object|embed)\b[^>]*>[\s\S]*$/gi,' '):raw;
                const links = html ? extractLinks(linkMarkup, current, this.allowedHosts, this.policy.maxLinksPerPage, this.policy.discoverLinkedHosts) : [];
                for (const link of links) if (this.allowedHosts.has(new URL(link.url).hostname.toLowerCase())) this.selectable.add(link.url);
                const contentHash = sha256(bytes);
                const prior = [...this.sources].reverse().find(source => source.url === current.toString());
                const source: ResearchSource = {
                    id: 'research-' + String(++this.sequence).padStart(4, '0'), url: current.toString(), observedAt: this.now(), contentHash,
                    sourceAssertion: text.slice(0, 1_000), links, rights: 'public_readonly', contentType: type, title: html ? titleFromHtml(raw) : null, text,
                    revision: prior ? prior.revision + 1 : 1, revises: prior?.id || null,
                    ...(this.policy.retainBody ? { retainedBody: { base64: Buffer.from(bytes).toString('base64'), byteLength: bytes.byteLength, textComplete: !captured.partial&&fullText.length <= this.policy.maxTextChars, extraction: html ? 'html-text-v1' as const : 'plain-text-v1' as const, decoding: 'utf8-with-replacement' as const,bodyComplete:!captured.partial,hashScope:captured.partial?'retained-prefix' as const:'complete-body' as const,declaredByteLength:captured.declaredBytes,receivedBytesAtLeast:captured.receivedBytesAtLeast,limitReason:captured.partial?'BYTE_CAP_RETAINED_PREFIX':null } } : {}),
                };
                this.sources.push(source);
                return { kind: 'retrieval', requestedUrl: requested.toString(), finalUrl: current.toString(), status: 'retrieved', code: captured.partial?'PARTIAL_BODY_RETAINED':null, note: captured.partial?'Only the exact retained prefix was read; remaining body was aborted at the byte cap. Text, links and layout may omit consequential content. The hash identifies this prefix, not the complete resource.':null, hops, source: structuredClone(source) };
            }
            throw new ResearchError('REDIRECT_LIMIT_EXCEEDED');
        } catch (error) { return this.failed(requested.toString(), error, hops, current.toString()); }
    }

    dynamicQuery(query: string): LocalQueryResult {
        const keywords = words(query);
        if (!keywords.length) throw new ResearchError('QUERY_REQUIRED', 'A local dynamic query needs specific keywords.');
        const matches = this.sources.map(source => {
            const corpus = (source.title || '') + ' ' + source.text + ' ' + source.links.map(link => link.text + ' ' + link.url).join(' ');
            const score = keywords.reduce((sum, keyword) => sum + (corpus.toLowerCase().match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 0);
            return { source, score };
        }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.source.url.localeCompare(b.source.url));
        return { kind: 'dynamic_query', keywords, matches: matches.map(({ source }) => ({ id: source.id, url: source.url, title: source.title, sourceAssertion: source.sourceAssertion, links: structuredClone(source.links), observedAt: source.observedAt, contentHash: source.contentHash })) };
    }

    evidence(sourceId: string): EvidenceResult {
        const source = this.sources.find(value => value.id === sourceId);
        if (!source) throw new ResearchError('SOURCE_NOT_FOUND');
        const { id, url, observedAt, contentHash, sourceAssertion, rights, revision, revises } = source;
        return { kind: 'evidence', source: { id, url, observedAt, contentHash, sourceAssertion, rights, revision, revises } };
    }

    private assertInScope(raw: string, requireSelected: boolean): URL {
        const url = normalizedUrl(raw); const host = url.hostname.toLowerCase();
        if (blockedHostname(host)) throw new ResearchError('PRIVATE_HOST_FORBIDDEN');
        if (!this.allowedHosts.has(host) && (requireSelected || !this.policy.allowPublicRedirects)) throw new ResearchError('URL_OUTSIDE_SEED_SCOPE');
        if (requireSelected && !this.selectable.has(url.toString())) throw new ResearchError('URL_NOT_SELECTED_FROM_SEED_OR_CORPUS');
        return url;
    }
    private async resolvePublic(hostname: string): Promise<string> {
        if (blockedHostname(hostname)) throw new ResearchError('PRIVATE_HOST_FORBIDDEN');
        const resolver = this.ports.dnsLookup || (async (host: string) => (await lookup(host, { all: true, verbatim: true })).map(row => ({ address: row.address })));
        const controller = new AbortController();
        const records = await beforeDeadline(resolver(hostname), this.policy.deadlineMs, controller);
        if (!records.length || records.some(row => blockedIp(row.address))) throw new ResearchError('PRIVATE_ADDRESS_RESOLUTION_FORBIDDEN');
        return records[0].address;
    }
    private failed(requestedUrl: string, error: unknown, hops: Array<{ url: string; status: number }>, finalUrl: string | null = null): RetrievalResult {
        const nativeCodes=new Set(['ERR_INVALID_IP_ADDRESS','EACCES','EPERM','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);
        const code = error instanceof ResearchError ? error.code : nativeCodes.has((error as any)?.code)?(error as any).code:'FETCH_FAILED';
        return { kind: 'retrieval', requestedUrl, finalUrl, status: 'failed', code, note: null, hops, source: null };
    }
    private now(): string { return (this.ports.now || (() => new Date()))().toISOString(); }
}

export function createBoundedResearchAdapter(policy: ResearchPolicy, ports: ResearchPorts = {}): BoundedResearchAdapter {
    return new BoundedResearchAdapter(policy, ports);
}
