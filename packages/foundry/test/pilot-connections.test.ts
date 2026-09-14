import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { StateStore } from '../src/state.ts';
import { PilotKnowledge } from '../src/pilot/knowledge.ts';
import { ConnectionRegistry, ConnectionService, OfflineTransport, maintainedReadAdapters } from '../src/pilot/connections/index.ts';

const withService = async (fn: (service: ConnectionService, knowledge: PilotKnowledge, root: string) => Promise<void> | void) => {
    const root = mkdtempSync(join(tmpdir(), 'pilot-connections-')), store = new StateStore(join(root, 'state.sqlite'));
    try { await fn(new ConnectionService(store, new PilotKnowledge(store), new ConnectionRegistry(maintainedReadAdapters())), new PilotKnowledge(store), root); }
    finally { try { store.close(); } catch {} rmSync(root, { recursive: true, force: true }); }
};
const googleConsent = { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read operating documents for a bounded business assessment.', scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'] };

test('registry describes three implemented maintained read families and explicit capability scopes', () => {
    const definitions = new ConnectionRegistry(maintainedReadAdapters()).list();
    assert.deepEqual(definitions.map(definition => definition.provider), ['google_workspace', 'shopify_admin', 'google_analytics_4']);
    assert.ok(definitions.every(definition => definition.readiness === 'implemented' && definition.documentation.length > 0));
    assert.deepEqual(definitions.find(definition => definition.provider === 'shopify_admin')!.capabilities.map(capability => capability.effects), ['read', 'read']);
});

test('Google Docs and Sheets sync is consent-gated, paginated, persisted, restart-safe, and never fetches a network', async () => withService(async (service, knowledge, root) => {
    const company = knowledge.createCompany({ name: 'Documents business', goal: 'Understand written operating procedures.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_workspace', credentialReference: { kind: 'owner_vault', id: 'vault-ref-google-docs' }, configuration: { maxPages: 2, maxFiles: 5 } });
    let requests = 0;
    const denied = { kind: 'offline' as const, async request() { requests++; throw Error('MUST_NOT_RUN'); } };
    await assert.rejects(service.sync(connection.id, denied), /CONNECTION_CONSENT_REQUIRED/); assert.equal(requests, 0);
    service.grantConsent(connection.id, googleConsent);
    const oldFetch = globalThis.fetch; globalThis.fetch = (() => { throw Error('NETWORK_MUST_NOT_BE_CALLED'); }) as any;
    try {
        const transport = new OfflineTransport([
            { matches: request => request.path === '/drive/v3/files' && !request.query?.pageToken, response: { status: 200, body: { files: [{ id: 'doc-1', name: 'Operating policy', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-09-12T10:00:00.000Z', webViewLink: 'https://docs.google.com/document/d/doc-1' }], nextPageToken: 'page-2', incompleteSearch: false } } },
            { matches: request => request.path === '/drive/v3/files' && request.query?.pageToken === 'page-2', response: { status: 200, body: { files: [{ id: 'sheet-1', name: 'Offer table', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-09-13T10:00:00.000Z', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-1' }] } } },
            { matches: request => request.path === '/docs/v1/documents/doc-1', response: { status: 200, body: { body: { content: [{ paragraph: { elements: [{ textRun: { content: 'A human confirms scope before any promise.\n' } }] } }] } } } },
            { matches: request => request.path === '/sheets/v4/spreadsheets/sheet-1/values/A1%3AZ1000', response: { status: 200, body: { values: [['service', 'approval'], ['repair', 'human confirmation']] } } }
        ]);
        const result = await service.sync(connection.id, transport); assert.equal(result.connection.readiness, 'tested'); assert.equal(result.ingested.length, 2); assert.equal(result.partial, false);
        assert.deepEqual(result.ingested.map(source => source.sourceIdentity).sort(), ['google-drive:file:doc-1', 'google-drive:sheet:sheet-1:A1:Z1000']);
        const persistedKnowledgeIds = new Set(knowledge.sources(company.id).map(source => source.id));
        assert.equal(result.ingested.every(source => persistedKnowledgeIds.has(source.knowledgeSourceId)), true, 'actual PilotKnowledge sources were persisted');
        assert.equal(service.eligibleKnowledgeSourceIds(company.id).length, 2);
        const before = JSON.stringify(service.get(connection.id).cursor);
        const reopenedStore = new StateStore(join(root, 'state.sqlite')); try { const reopened = new ConnectionService(reopenedStore, new PilotKnowledge(reopenedStore), new ConnectionRegistry(maintainedReadAdapters())); assert.equal(reopened.sources(connection.id).length, 2); assert.equal(JSON.stringify(reopened.get(connection.id).cursor), before); } finally { reopenedStore.close(); }
    } finally { globalThis.fetch = oldFetch; }
}));

test('Shopify reader retains products plus safe order aggregates, bounds pages, and omits customer fields', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Commerce business', goal: 'Review merchandise and conversion observations.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'shopify_admin', credentialReference: { kind: 'application_secret', id: 'approved-shopify-reference' }, configuration: { maxPages: 1, pageSize: 10 } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read merchandise and privacy-safe sales aggregates.', scopes: ['read_products', 'read_orders'] });
    const transport = new OfflineTransport([{ matches: request => request.provider === 'shopify_admin' && request.path === '/admin/api/graphql.json', response: { status: 200, body: { data: { products: { nodes: [{ id: 'gid://shopify/Product/1', title: 'Field notebook', handle: 'field-notebook', updatedAt: '2026-09-12T11:00:00Z', status: 'ACTIVE', productType: 'stationery', vendor: 'MIDAS', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/1', title: 'Standard', sku: 'NB-1', price: '24.00', inventoryQuantity: 8 }] } }], pageInfo: { hasNextPage: false, endCursor: null } }, orders: { nodes: [{ id: 'gid://shopify/Order/1', createdAt: '2026-09-12T11:00:00Z', updatedAt: '2026-09-12T12:00:00Z', displayFinancialStatus: 'PAID', currentTotalPriceSet: { shopMoney: { amount: '24.00', currencyCode: 'USD' } }, lineItems: { nodes: [{ title: 'Field notebook', sku: 'NB-1', quantity: 1 }] }, customer: { email: 'must-not-be-retained@example.test' } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } }]);
    const result = await service.sync(connection.id, transport); assert.equal(result.ingested.length, 2);
    const serialized = JSON.stringify(service.sources(connection.id)) + JSON.stringify(knowledge.sources(company.id));
    assert.doesNotMatch(serialized, /must-not-be-retained@example\.test/); assert.match(serialized, /customer names, email, addresses, notes and customer IDs intentionally omitted/);
}));

test('GA4 requires a dated property window, pages by offset, and persists dated analytics provenance', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Analytics business', goal: 'Inspect dated traffic observations.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_analytics_4', credentialReference: { kind: 'owner_vault', id: 'vault-ga4' }, configuration: { propertyId: '12345', startDate: '2026-09-01', endDate: '2026-09-07', pageSize: 1, maxPages: 2 } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read dated GA4 traffic and conversion observations.', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const transport = new OfflineTransport([{ matches: request => request.provider === 'google_analytics_4' && (request.body as any)?.offset === 0, response: { status: 200, body: { rowCount: 2, rows: [{ dimensionValues: [{ value: '20260901' }, { value: 'Organic Search' }], metricValues: [{ value: '11' }, { value: '10' }, { value: '1' }, { value: '1' }] }] } } }, { matches: request => request.provider === 'google_analytics_4' && (request.body as any)?.offset === 1, response: { status: 200, body: { rowCount: 2, rows: [{ dimensionValues: [{ value: '20260902' }, { value: 'Direct' }], metricValues: [{ value: '7' }, { value: '6' }, { value: '0' }, { value: '0' }] }] } } }]);
    const result = await service.sync(connection.id, transport); assert.equal(result.partial, false); assert.equal(result.ingested.length, 1); assert.equal(service.get(connection.id).cursor.offset, null);
    const source = service.sources(connection.id)[0]; assert.equal(source.sourceIdentity, 'ga4:property:12345:traffic:2026-09-01:2026-09-07:offset:0-2'); assert.equal(source.updatedAt, null, 'GA4 does not provide a provider-update timestamp'); assert.ok(Date.parse(source.observedAt) > 0, 'observedAt records this retrieval rather than a fabricated provider update time');
}));

test('Drive keeps its committed incremental window fixed across a page-token continuation before advancing its watermark', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Drive continuation business', goal: 'Retain every document in an incremental window.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_workspace', credentialReference: { kind: 'owner_vault', id: 'vault-drive-window' }, configuration: { maxPages: 1, maxFiles: 10 } });
    service.grantConsent(connection.id, googleConsent);
    const seen: any[] = [];
    const transport = new OfflineTransport([
        { matches: request => request.path === '/drive/v3/files' && !request.query?.pageToken, response: request => { seen.push(request); return { status: 200, body: { files: [{ id: 'one', name: 'One', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-09-11T00:00:00Z' }], nextPageToken: 'next' } }; } },
        { matches: request => request.path === '/drive/v3/files' && request.query?.pageToken === 'next', response: request => { seen.push(request); return { status: 200, body: { files: [{ id: 'two', name: 'Two', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-09-12T00:00:00Z' }] } }; } },
        { matches: request => request.path.startsWith('/docs/v1/documents/'), response: { status: 200, body: { body: { content: [] } } } }
    ]);
    const first = await service.sync(connection.id, transport); assert.equal(first.partial, true); assert.equal(first.connection.cursor.updatedAfter, null); assert.equal(first.connection.cursor.pendingUpdatedAfter, '2026-09-11T00:00:00.000Z');
    const second = await service.sync(connection.id, transport); assert.equal(second.partial, false); assert.equal(second.connection.cursor.pageToken, null); assert.equal(second.connection.cursor.updatedAfter, '2026-09-12T00:00:00.000Z');
    assert.equal(seen.length, 2); assert.equal(seen[1].query.q, 'trashed = false', 'a resumed page must retain the same window instead of querying after the first page watermark'); assert.equal(service.sources(connection.id).length, 2);
}));

test('Shopify resumes only unfinished streams, preserves its query window, and marks bounded nested connections partial', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Shopify continuation business', goal: 'Retain all catalog pages without duplicate order reads.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'shopify_admin', credentialReference: { kind: 'application_secret', id: 'shopify-window-reference' }, configuration: { maxPages: 1, pageSize: 10 } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read catalog and safe order aggregates.', scopes: ['read_products', 'read_orders'] });
    const calls: any[] = []; let productPage = 0;
    const transport = { kind: 'offline' as const, async request(request: any) {
        calls.push(request); const product = String(request.body?.query).includes('MidasProducts');
        if (product) { productPage++; return { status: 200, body: { data: { products: { nodes: [{ id: 'gid://shopify/Product/' + productPage, title: 'Product ' + productPage, updatedAt: productPage === 1 ? '2026-09-11T00:00:00Z' : '2026-09-12T00:00:00Z', variants: { nodes: [], pageInfo: { hasNextPage: productPage === 1, endCursor: productPage === 1 ? 'product-next' : null } } }], pageInfo: { hasNextPage: productPage === 1, endCursor: productPage === 1 ? 'product-next' : null } } } } }; }
        if (calls.filter(call => String(call.body?.query).includes('MidasOrders')).length > 1) throw new Error('ORDERS_MUST_NOT_BE_REREQUESTED_AFTER_COMPLETION');
        return { status: 200, body: { data: { orders: { nodes: [{ id: 'gid://shopify/Order/1', updatedAt: '2026-09-11T00:00:00Z', createdAt: '2026-09-11T00:00:00Z', lineItems: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'items-next' } } }], pageInfo: { hasNextPage: false, endCursor: null } } } } };
    } };
    const first = await service.sync(connection.id, transport); assert.equal(first.partial, true); assert.equal(first.connection.cursor.updatedAfter, null); assert.match(String(first.connection.cursor.pageToken), /"orders"\s*:\s*\{\s*"after":null,"done":true/);
    const second = await service.sync(connection.id, transport); assert.equal(second.partial, false); assert.equal(second.connection.cursor.updatedAfter, '2026-09-12T00:00:00.000Z');
    assert.equal(calls.filter(call => String(call.body?.query).includes('MidasOrders')).length, 1); assert.equal(calls.filter(call => String(call.body?.query).includes('MidasProducts'))[1].body.variables.query, null, 'continuation must use the original committed window');
    const order = service.sources(connection.id).find(source => source.sourceIdentity.includes('order-aggregate'))!; assert.equal(order.partial, true); assert.match(order.limitations.join(' '), /line items exceeded/);
}));

test('GA4 keeps each resumed offset chunk as a separately mapped source with row-range provenance', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'GA4 chunks business', goal: 'Preserve report rows across restart-safe paging.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_analytics_4', credentialReference: { kind: 'owner_vault', id: 'vault-ga4-chunks' }, configuration: { propertyId: '777', startDate: '2026-09-01', endDate: '2026-09-02', pageSize: 1, maxPages: 1 } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read a bounded dated report.', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const transport = new OfflineTransport([
        { matches: request => (request.body as any)?.offset === 0, response: { status: 200, body: { rowCount: 2, rows: [{ dimensionValues: [{ value: '20260901' }, { value: 'Direct' }], metricValues: [{ value: '1' }] }] } } },
        { matches: request => (request.body as any)?.offset === 1, response: { status: 200, body: { rowCount: 2, rows: [{ dimensionValues: [{ value: '20260902' }, { value: 'Organic Search' }], metricValues: [{ value: '2' }] }] } } }
    ]);
    const first = await service.sync(connection.id, transport); assert.equal(first.partial, true); assert.equal(first.connection.cursor.offset, 1);
    const second = await service.sync(connection.id, transport); assert.equal(second.partial, false); assert.equal(second.connection.cursor.offset, null);
    const chunks = service.sources(connection.id); assert.deepEqual(chunks.map(source => source.sourceIdentity).sort(), ['ga4:property:777:traffic:2026-09-01:2026-09-02:offset:0-1', 'ga4:property:777:traffic:2026-09-01:2026-09-02:offset:1-2']); assert.equal(chunks.every(source => !source.supersededAt), true);
    assert.match(knowledge.sources(company.id).map(source => source.text).join('\n'), /"offsetStart":0/); assert.match(knowledge.sources(company.id).map(source => source.text).join('\n'), /"offsetStart":1/);
}));

test('connection configuration rejects impossible dates, zero or non-finite limits, and unallowlisted secret-shaped fields', () => withService((service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Configuration business', goal: 'Reject unsafe connector setup.' });
    const base = { businessId: company.id, credentialReference: { kind: 'owner_vault' as const, id: 'vault-config' } };
    assert.throws(() => service.beginConfiguration({ ...base, provider: 'google_workspace', configuration: { maxPages: 0 } }), /CONNECTION_MAX_PAGES_INVALID/);
    assert.throws(() => service.beginConfiguration({ ...base, provider: 'shopify_admin', configuration: { pageSize: Number.NaN } }), /CONNECTION_PAGE_SIZE_INVALID/);
    assert.throws(() => service.beginConfiguration({ ...base, provider: 'google_workspace', configuration: { apiKey: 'secret-value' } }), /CONNECTION_CONFIGURATION_FIELD/);
    assert.throws(() => service.beginConfiguration({ ...base, provider: 'google_analytics_4', configuration: { propertyId: '1', startDate: '2026-02-30', endDate: '2026-02-31' } }), /GA4_PROPERTY_AND_DATE_WINDOW_REQUIRED/);
    assert.throws(() => service.beginConfiguration({ ...base, provider: 'google_analytics_4', configuration: { propertyId: '1', startDate: '2026-09-02', endDate: '2026-09-01' } }), /GA4_PROPERTY_AND_DATE_WINDOW_REQUIRED/);
}));

test('an unavailable PDF extractor records document availability without claiming extracted text', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'PDF fallback business', goal: 'Keep an honest record of unavailable extraction.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_workspace', credentialReference: { kind: 'owner_vault', id: 'vault-pdf-fallback' }, configuration: { maxPages: 1, maxFiles: 1 } });
    service.grantConsent(connection.id, googleConsent);
    const transport = new OfflineTransport([
        { matches: request => request.path === '/drive/v3/files', response: { status: 200, body: { files: [{ id: 'not-a-pdf', name: 'Unreadable PDF', mimeType: 'application/pdf' }] } } },
        { matches: request => request.path.endsWith('/not-a-pdf'), response: { status: 200, body: Buffer.from('this is deliberately not a PDF').toString('base64') } }
    ]);
    await service.sync(connection.id, transport);
    const retained = service.sources(connection.id)[0]; assert.equal(retained.partial, true); assert.ok(retained.retainedBytesBase64); assert.equal(retained.updatedAt, null); assert.match(knowledge.sources(company.id).find(source => source.id === retained.knowledgeSourceId)!.text, /PDF bytes retained.*Text extraction is unavailable/);
}));

function textPdf(text: string) {
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET\n`, bodies = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdf = '%PDF-1.4\n', offsets = [0]; bodies.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'utf8');
}

test('installed local PDF extraction retains actual text, bytes, dates, rights, and extraction limitations without a network', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Extracted PDF business', goal: 'Retain a bounded owner document.' }), bytes = textPdf('Owner approval is required before pricing.'), base64 = bytes.toString('base64');
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_workspace', credentialReference: { kind: 'owner_vault', id: 'vault-positive-pdf' }, configuration: { maxPages: 1, maxFiles: 1 } }); service.grantConsent(connection.id, googleConsent);
    const oldFetch = globalThis.fetch; globalThis.fetch = (() => { throw Error('NETWORK_MUST_NOT_BE_CALLED'); }) as any;
    try {
        await service.sync(connection.id, new OfflineTransport([
            { matches: request => request.path === '/drive/v3/files', response: { status: 200, body: { files: [{ id: 'text-pdf', name: 'Owner approval', mimeType: 'application/pdf', modifiedTime: '2026-09-12T09:30:00.000Z', webViewLink: 'https://docs.example.test/text-pdf' }] } } },
            { matches: request => request.path.endsWith('/text-pdf') && request.responseFormat === 'base64', response: { status: 200, body: base64 } }
        ]));
    } finally { globalThis.fetch = oldFetch; }
    const retained = service.sources(connection.id)[0], source = knowledge.sources(company.id).find(item => item.id === retained.knowledgeSourceId)!;
    assert.equal(retained.partial, false); assert.equal(retained.pageCount, 1); assert.equal(retained.updatedAt, '2026-09-12T09:30:00.000Z'); assert.equal(retained.retainedBytesBase64, base64); assert.equal(createHash('sha256').update(Buffer.from(retained.retainedBytesBase64!, 'base64')).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
    assert.match(source.text, /Owner approval is required before pricing/); assert.match(source.rights, /google_workspace read consent/); assert.equal(source.observedAt.length > 0, true); assert.equal(source.origin?.extraction, 'Documented adapter extraction; original read outcome retained. Missing or partial data is not reconstructed.'); assert.equal(retained.limitations.some(item => /unavailable|OCR|capped/i.test(item)), false);
}));

test('revocation blocks future transport reads and exposes exact cached source IDs for root knowledge exclusion', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Revocation business', goal: 'Keep permissions current.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_analytics_4', credentialReference: { kind: 'owner_vault', id: 'vault-revocable' }, configuration: { propertyId: '9', startDate: '2026-09-01', endDate: '2026-09-01' } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read one dated analytic observation.', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    await service.sync(connection.id, new OfflineTransport([{ matches: () => true, response: { status: 200, body: { rowCount: 0, rows: [] } } }]));
    const retainedId = service.sources(connection.id)[0].knowledgeSourceId; service.revoke(connection.id, 'Owner withdrew analytics access.');
    assert.deepEqual(service.excludedKnowledgeSourceIds(company.id), [retainedId]); assert.deepEqual(service.filterSources(company.id, knowledge.sources(company.id)).map(source => source.id).includes(retainedId), false);
    let calls = 0; await assert.rejects(service.sync(connection.id, { kind: 'offline', async request() { calls++; return { status: 200, body: {} }; } }), /CONNECTION_REVOKED/); assert.equal(calls, 0);
}));

test('a changed source revision retains its old lineage and makes only the current revision eligible', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Revision business', goal: 'Use current data only.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'google_analytics_4', credentialReference: { kind: 'owner_vault', id: 'vault-revisions' }, configuration: { propertyId: '22', startDate: '2026-09-01', endDate: '2026-09-01' } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read one report revision.', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    let value = '1'; const transport = { kind: 'offline' as const, async request() { return { status: 200, body: { rowCount: 1, rows: [{ dimensionValues: [{ value: '20260901' }, { value: 'Direct' }], metricValues: [{ value }, { value }, { value: '0' }, { value: '0' }] }] } }; } };
    await service.sync(connection.id, transport); value = '2'; await service.sync(connection.id, transport);
    const revisions = service.sources(connection.id); assert.equal(revisions.length, 2); assert.equal(revisions.filter(source => Boolean(source.supersededAt)).length, 1);
    const eligible = service.eligibleKnowledgeSourceIds(company.id), excluded = service.excludedKnowledgeSourceIds(company.id); assert.equal(eligible.length, 1); assert.equal(excluded.length, 1); assert.notEqual(eligible[0], excluded[0]);
    assert.equal(service.filterSources(company.id, knowledge.sources(company.id)).some(source => source.id === excluded[0]), false);
    value = '1'; await service.sync(connection.id, transport); assert.equal(service.sources(connection.id).length, 2, 'a reappearing identical revision reactivates its preserved lineage rather than creating a third source'); assert.equal(service.eligibleKnowledgeSourceIds(company.id).length, 1);
}));

test('a revoke during collection aborts ingestion before source persistence, and the host sees only consented capability IDs', async () => withService(async (service, knowledge) => {
    const company = knowledge.createCompany({ name: 'Race business', goal: 'Do not ingest after revoked consent.' });
    const connection = service.beginConfiguration({ businessId: company.id, provider: 'shopify_admin', capabilityIds: ['products_read'], credentialReference: { kind: 'application_secret', id: 'shopify-race-reference' }, configuration: { maxPages: 1 } });
    service.grantConsent(connection.id, { grantedAt: '2026-09-13T12:00:00.000Z', grantedBy: 'owner-1', purpose: 'Read product catalog only.', scopes: ['read_products'] });
    let requestCount = 0, capabilityIds: string[] | undefined;
    await assert.rejects(service.sync(connection.id, { kind: 'offline', async request(request) { requestCount++; capabilityIds = request.capabilityIds; assert.match(String((request.body as any).query), /MidasProducts/); service.revoke(connection.id, 'Revoked while response was pending.'); return { status: 200, body: { data: { products: { nodes: [], pageInfo: { hasNextPage: false } } } } }; } }), /CONNECTION_REVOKED/);
    assert.equal(requestCount, 1); assert.deepEqual(capabilityIds, ['products_read']); assert.equal(service.sources(connection.id).length, 0); assert.equal(knowledge.sources(company.id).length, 1, 'only onboarding evidence remains');
}));
