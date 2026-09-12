import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedResearchAdapter, type FetchResult } from '../src/operations/research.ts';

const text = (body: string, contentType = 'text/html'): FetchResult => ({
    status: 200, headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    body: { getReader: () => { let sent = false; return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode(body) }) }; } },
});
const redirect = (location: string): FetchResult => ({ status: 302, headers: { get: name => name.toLowerCase() === 'location' ? location : null } });
const publicDns = async () => [{ address: '93.184.216.34' }];

test('retrieval is chosen explicitly, extracts useful markup and allows local corpus query plus evidence', async () => {
    const pages = new Map([
        ['https://docs.example.com/start', text('<html><head><title>Useful docs</title><script>ignore secret()</script></head><body><main><h1>Research guide</h1><p>Evidence comes from public documentation.</p><a href="/detail">Detailed evidence</a></main></body></html>')],
        ['https://docs.example.com/detail', text('<article><h1>Detail</h1><p>Verified economics require receipts.</p></article>')],
    ]);
    const app = new BoundedResearchAdapter({ seedUrls: ['https://docs.example.com/start'] }, { dnsLookup: publicDns, now: () => new Date('2026-09-12T00:00:00.000Z'), fetch: async url => pages.get(url)! });
    assert.deepEqual(app.candidates(), ['https://docs.example.com/start']);
    const first = await app.run({ operation: 'retrieve', url: 'https://docs.example.com/start' });
    assert.equal(first.kind, 'retrieval'); assert.equal(first.status, 'retrieved');
    assert.match(first.source!.text, /Evidence comes/); assert.doesNotMatch(first.source!.text, /ignore secret/);
    assert.deepEqual(first.source!.links, [{ url: 'https://docs.example.com/detail', text: 'Detailed evidence' }]);
    const query = await app.run({ operation: 'dynamic_query', query: 'public evidence' });
    assert.equal(query.kind, 'dynamic_query'); assert.equal(query.matches[0].url, 'https://docs.example.com/start');
    const next = await app.run({ operation: 'retrieve', url: query.matches[0].links[0].url });
    assert.equal(next.kind, 'retrieval'); assert.equal(next.status, 'retrieved');
    const evidence = await app.run({ operation: 'evidence', sourceId: next.source!.id });
    assert.equal(evidence.kind, 'evidence'); assert.equal(evidence.source.rights, 'public_readonly'); assert.match(evidence.source.sourceAssertion, /Verified economics/);
});

test('hostile URLs, ambient credential hosts, and off-scope redirects never receive a fetch', async () => {
    let calls = 0; let receivedHeaders: Record<string, string> | null = null;
    const app = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: publicDns, fetch: async (_url, init) => { calls++; receivedHeaders = init.headers; return text('never'); } });
    for (const url of ['http://safe.example.org/seed', 'https://localhost/seed', 'https://safe.example.org@evil.example/seed']) {
        const result = await app.retrieve(url); assert.equal(result.status, 'failed'); assert.equal(calls, 0);
    }
    const unselected = await app.retrieve('https://safe.example.org/not-an-observed-link');
    assert.equal(unselected.code, 'URL_NOT_SELECTED_FROM_SEED_OR_CORPUS'); assert.equal(calls, 0);
    await app.retrieve('https://safe.example.org/seed');
    assert.deepEqual(receivedHeaders, { accept: 'text/html, text/plain;q=0.8', 'user-agent': 'MIDAS-BoundedResearch/1.0 (+public-readonly)' });
    const redirected = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: publicDns, fetch: async () => redirect('https://evil.example.org/steal') });
    const result = await redirected.retrieve('https://safe.example.org/seed');
    assert.equal(result.code, 'URL_OUTSIDE_SEED_SCOPE'); assert.equal(result.hops.length, 1);
});

test('private DNS answers, response byte ceilings, and non-text documents are bounded and not extracted', async () => {
    const privateDns = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: async () => [{ address: '127.0.0.1' }], fetch: async () => { throw new Error('must not fetch'); } });
    assert.equal((await privateDns.retrieve('https://safe.example.org/seed')).code, 'PRIVATE_ADDRESS_RESOLUTION_FORBIDDEN');
    const mappedPrivateDns = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: async () => [{ address: '::ffff:c0a8:0101' }], fetch: async () => { throw new Error('must not fetch'); } });
    assert.equal((await mappedPrivateDns.retrieve('https://safe.example.org/seed')).code, 'PRIVATE_ADDRESS_RESOLUTION_FORBIDDEN');
    const large = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'], maxBytes: 5 }, { dnsLookup: publicDns, fetch: async () => text('six bytes') });
    assert.equal((await large.retrieve('https://safe.example.org/seed')).code, 'BYTE_LIMIT_EXCEEDED');
    const pdf = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: publicDns, fetch: async () => text('%PDF-1.7', 'application/pdf') });
    const result = await pdf.retrieve('https://safe.example.org/seed'); assert.equal(result.status, 'unsupported'); assert.equal(result.code, 'UNSUPPORTED_DOCUMENT_TYPE'); assert.match(result.note || '', /not extracted/);
});

test('deadline races a non-cooperative fetch and source revisions preserve the earlier observation', async () => {
    const slow = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'], deadlineMs: 10 }, { dnsLookup: publicDns, fetch: async () => await new Promise<FetchResult>(() => {}) });
    assert.equal((await slow.retrieve('https://safe.example.org/seed')).code, 'DEADLINE_EXCEEDED');
    let version = 0;
    const app = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: publicDns, fetch: async () => text('<p>Version ' + (++version) + '</p>') });
    const one = await app.retrieve('https://safe.example.org/seed'); const two = await app.retrieve('https://safe.example.org/seed');
    assert.notEqual(one.source!.contentHash, two.source!.contentHash); assert.equal(two.source!.revision, 2); assert.equal(two.source!.revises, one.source!.id);
});

test('DNS is deadline-bounded, rejects CGNAT, supplies the vetted address to test transports, and counts failed requests', async () => {
    const unresolved = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'], deadlineMs: 50 }, { dnsLookup: async () => await new Promise<never>(() => {}), fetch: async () => text('never') });
    assert.equal((await unresolved.retrieve('https://safe.example.org/seed')).code, 'DEADLINE_EXCEEDED');
    const cgnat = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'] }, { dnsLookup: async () => [{ address: '100.64.3.9' }], fetch: async () => text('never') });
    assert.equal((await cgnat.retrieve('https://safe.example.org/seed')).code, 'PRIVATE_ADDRESS_RESOLUTION_FORBIDDEN');
    let pinned = '';
    const capped = new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'], maxPages: 2 }, { dnsLookup: async () => [{ address: '93.184.216.34' }], fetch: async (_url, _init, address) => { pinned = address; return { status: 503, headers: { get: () => null } }; } });
    assert.equal((await capped.retrieve('https://safe.example.org/seed')).code, 'HTTP_503');
    assert.equal((await capped.retrieve('https://safe.example.org/seed')).code, 'HTTP_503');
    assert.equal((await capped.retrieve('https://safe.example.org/seed')).code, 'PAGE_LIMIT_EXCEEDED');
    assert.equal(pinned, '93.184.216.34');
    assert.throws(() => new BoundedResearchAdapter({ seedUrls: ['https://safe.example.org/seed'], maxBytes: 1_000_001 }), /INVALID_MAXBYTES/);
});
