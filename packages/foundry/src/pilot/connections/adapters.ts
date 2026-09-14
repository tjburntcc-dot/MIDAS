import { createHash } from 'node:crypto';
import {extractInstalledPdf} from './pdf-extraction.ts';
import type { CollectedSource, CollectionResult, ConnectionDefinition, ConnectionTransport, ProviderRequest, ReadAdapter, SyncCursor } from './contracts.ts';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const iso = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const positiveInteger = (value: unknown, fallback: number, max: number, code: string) => { const actual = value === undefined ? fallback : value; if (typeof actual !== 'number' || !Number.isInteger(actual) || actual < 1 || actual > max) throw new Error(code); return actual; };
const calendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
const limitText = (value: string, max = 180_000) => value.length <= max ? { text: value, partial: false } : { text: value.slice(0, max), partial: true };
const json = async (transport: ConnectionTransport, request: ProviderRequest) => {
    const response = await transport.request(request);
    if (response.status < 200 || response.status >= 300) throw new Error('CONNECTION_PROVIDER_HTTP_' + response.status);
    if (!response.body || typeof response.body !== 'object') throw new Error('CONNECTION_PROVIDER_BODY_INVALID');
    return response.body as Record<string, any>;
};
const plain = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value);
const docText = (document: any): string => {
    const chunks: string[] = [];
    const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.textRun?.content === 'string') chunks.push(node.textRun.content);
        if (Array.isArray(node.content)) node.content.forEach(visit);
        if (Array.isArray(node.tabs)) node.tabs.forEach((tab: any) => visit(tab.documentTab ?? tab));
    };
    visit(document.body); if (Array.isArray(document.tabs)) document.tabs.forEach((tab: any) => visit(tab.documentTab ?? tab));
    return chunks.join('').replace(/\n{3,}/g, '\n\n').trim();
};
const safeTitle = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.slice(0, 240) : fallback;
const source = (input: Omit<CollectedSource, 'sourceHash'>): CollectedSource => ({ ...input, sourceHash: digest(input.text) });
const googleDriveDefinition: ConnectionDefinition = {
    provider: 'google_workspace', title: 'Google Drive, Docs and Sheets', readiness: 'implemented',
    documentation: ['https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list', 'https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get', 'https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get'],
    capabilities: [
        { id: 'drive_documents_read', title: 'List and extract Drive files and Google Docs', requiredScopes: ['https://www.googleapis.com/auth/drive.readonly'], effects: 'read', incremental: true, sensitivity: 'business_documents' },
        { id: 'sheets_values_read', title: 'Read bounded Google Sheets values', requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], effects: 'read', incremental: true, sensitivity: 'business_documents' }
    ]
};
/** Google Workspace reader: Drive list paging plus Docs/Sheets extraction. No write endpoints exist here. */
export class GoogleWorkspaceReadAdapter implements ReadAdapter {
    readonly definition = googleDriveDefinition;
    async collect(transport: ConnectionTransport, cursor: SyncCursor, options: Record<string, unknown>): Promise<CollectionResult> {
        const maxPages = positiveInteger(options.maxPages,4,8,'CONNECTION_MAX_PAGES_INVALID'), maxFiles = positiveInteger(options.maxFiles,40,100,'CONNECTION_MAX_FILES_INVALID'), sources: CollectedSource[] = [], limitations: string[] = [], observedAt = new Date().toISOString();
        const capabilityIds = Array.isArray(options.capabilityIds) ? options.capabilityIds : [], allowDocuments = capabilityIds.includes('drive_documents_read'), allowSheets = capabilityIds.includes('sheets_values_read');
        let pageToken = cursor.pageToken ?? null, pagesRead = 0, newest = cursor.pendingUpdatedAfter ?? cursor.updatedAfter ?? null, partial = false;
        for (; pagesRead < maxPages && sources.length < maxFiles; pagesRead++) {
            const query = cursor.updatedAfter ? `trashed = false and modifiedTime > '${cursor.updatedAfter}'` : 'trashed = false';
            const list = await json(transport, { provider: 'google_workspace', method: 'GET', path: '/drive/v3/files', query: { q: query, orderBy: 'modifiedTime desc', pageSize: Math.min(100, maxFiles - sources.length), pageToken: pageToken ?? undefined, fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum,size)' } });
            if (list.incompleteSearch) { partial = true; limitations.push('Google Drive reported incompleteSearch; some matching files were omitted by the provider.'); }
            for (const file of Array.isArray(list.files) ? list.files : []) {
                if (!file?.id || typeof file.id !== 'string') { partial = true; limitations.push('A Drive list item without a stable ID was omitted.'); continue; }
                const updatedAt = iso(file.modifiedTime), title = safeTitle(file.name, 'Google Drive file ' + file.id), mime = String(file.mimeType ?? 'application/octet-stream');
                if (updatedAt && (!newest || updatedAt > newest)) newest = updatedAt;
                if (mime === 'application/vnd.google-apps.document' && allowDocuments) {
                    const document = await json(transport, { provider: 'google_workspace', method: 'GET', path: '/docs/v1/documents/' + encodeURIComponent(file.id), query: { includeTabsContent: true } });
                    const clipped = limitText(docText(document));
                    sources.push(source({ sourceIdentity: 'google-drive:file:' + file.id, title, text: clipped.text || '[Google Doc had no extractable text.]', observedAt, updatedAt, contentType: mime, sourceUrl: typeof file.webViewLink === 'string' ? file.webViewLink : null, partial: clipped.partial, limitations: clipped.partial ? ['Document text was bounded to 180,000 characters.'] : [] }));
                } else if (mime === 'application/vnd.google-apps.spreadsheet' && allowSheets) {
                    const range = typeof options.sheetRange === 'string' ? options.sheetRange : 'A1:Z1000';
                    const values = await json(transport, { provider: 'google_workspace', method: 'GET', path: '/sheets/v4/spreadsheets/' + encodeURIComponent(file.id) + '/values/' + encodeURIComponent(range) });
                    const clipped = limitText((Array.isArray(values.values) ? values.values : []).map((row: unknown) => Array.isArray(row) ? row.map(cell => String(cell).replaceAll('\t', ' ')).join('\t') : '').join('\n'));
                    sources.push(source({ sourceIdentity: 'google-drive:sheet:' + file.id + ':' + range, title, text: clipped.text || '[Google Sheet range was empty.]', observedAt, updatedAt, contentType: mime, sourceUrl: typeof file.webViewLink === 'string' ? file.webViewLink : null, partial: clipped.partial, limitations: clipped.partial ? ['Sheet values were bounded to A1:Z1000 / 180,000 characters.'] : [] }));
                } else if (mime === 'application/pdf' && allowDocuments) {
                    const binary = await transport.request({ responseFormat:'base64', provider: 'google_workspace', method: 'GET', path: '/drive/v3/files/' + encodeURIComponent(file.id), query: { alt: 'media' } });
                    if (binary.status < 200 || binary.status >= 300 || typeof binary.body !== 'string') { partial = true; limitations.push('PDF ' + file.id + ' could not be retrieved as retained bytes.'); continue; }
                    const bytes = Buffer.from(binary.body, 'base64'), extracted = extractPdf(bytes);
                    sources.push(source({ sourceIdentity: 'google-drive:pdf:' + file.id, title, text: extracted.text.trim() || '[PDF bytes retained. Text extraction is unavailable; do not infer the document contents.]', observedAt, updatedAt, contentType: mime, sourceUrl: typeof file.webViewLink === 'string' ? file.webViewLink : null, partial: extracted.partial, limitations: extracted.limitations, retainedBytesBase64: bytes.length <= 2_000_000 ? binary.body : undefined, pageCount: extracted.pageCount }));
                } else if ((mime.startsWith('text/') || mime === 'application/json') && allowDocuments) {
                    const body = await transport.request({ provider: 'google_workspace', method: 'GET', path: '/drive/v3/files/' + encodeURIComponent(file.id), query: { alt: 'media' } });
                    if (body.status < 200 || body.status >= 300) throw new Error('CONNECTION_PROVIDER_HTTP_' + body.status);
                    const clipped = limitText(plain(body.body));
                    sources.push(source({ sourceIdentity: 'google-drive:file:' + file.id, title, text: clipped.text, observedAt, updatedAt, contentType: mime, sourceUrl: typeof file.webViewLink === 'string' ? file.webViewLink : null, partial: clipped.partial, limitations: clipped.partial ? ['File text was bounded to 180,000 characters.'] : [] }));
                } else if (mime === 'application/vnd.google-apps.document' || mime === 'application/vnd.google-apps.spreadsheet' || mime === 'application/pdf' || mime.startsWith('text/') || mime === 'application/json') { limitations.push('Drive file omitted because its read capability was not owner-consented: ' + mime + '.'); }
                else { partial = true; limitations.push('Unsupported Drive MIME type omitted: ' + mime + '.'); }
                if (sources.length >= maxFiles) break;
            }
            pageToken = typeof list.nextPageToken === 'string' ? list.nextPageToken : null;
            if (!pageToken) break;
        }
        if (pageToken) { partial = true; limitations.push('Drive pagination stopped at the configured page limit; nextPageToken is retained for continuation.'); }
        return { sources, cursor: pageToken ? { updatedAfter: cursor.updatedAfter ?? null, pendingUpdatedAfter: newest, pageToken } : { updatedAfter: newest, pendingUpdatedAfter: null, pageToken: null }, pagesRead, partial, limitations };
    }
}
const extractPdf=extractInstalledPdf;

const shopifyDefinition: ConnectionDefinition = {
    provider: 'shopify_admin', title: 'Shopify Admin', readiness: 'implemented', documentation: ['https://shopify.dev/docs/api/admin-graphql/latest/queries/products', 'https://shopify.dev/docs/api/admin-graphql/latest/queries/orders'],
    capabilities: [
        { id: 'products_read', title: 'Read paginated products and variants', requiredScopes: ['read_products'], effects: 'read', incremental: true, sensitivity: 'commerce' },
        { id: 'orders_aggregate_read', title: 'Read paginated order aggregates without customer data', requiredScopes: ['read_orders'], effects: 'read', incremental: true, sensitivity: 'commerce' }
    ]
};
const shopifyProductsQuery = `query MidasProducts($after: String, $first: Int!, $query: String) { products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) { nodes { id title handle updatedAt status productType vendor variants(first: 50) { nodes { id title sku price inventoryQuantity } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } }`;
const shopifyOrdersQuery = `query MidasOrders($after: String, $first: Int!, $query: String) { orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) { nodes { id updatedAt createdAt displayFinancialStatus currentTotalPriceSet { shopMoney { amount currencyCode } } lineItems(first: 100) { nodes { quantity title sku } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } }`;
/** Shopify GraphQL reader. Orders deliberately become aggregates: no names, email, addresses, notes or raw customer objects. */
export class ShopifyReadAdapter implements ReadAdapter {
    readonly definition = shopifyDefinition;
    async collect(transport: ConnectionTransport, cursor: SyncCursor, options: Record<string, unknown>): Promise<CollectionResult> {
        const maxPages = positiveInteger(options.maxPages,4,8,'CONNECTION_MAX_PAGES_INVALID'), first = positiveInteger(options.pageSize,50,100,'CONNECTION_PAGE_SIZE_INVALID'), sources: CollectedSource[] = [], limitations: string[] = [], observedAt = new Date().toISOString();
        const capabilityIds = Array.isArray(options.capabilityIds) ? options.capabilityIds : [], readProducts = capabilityIds.includes('products_read'), readOrders = capabilityIds.includes('orders_aggregate_read');
        let productAfter: string | null = null, orderAfter: string | null = null, productsDone = !readProducts, ordersDone = !readOrders, newest = cursor.pendingUpdatedAfter ?? cursor.updatedAfter ?? null, pagesRead = 0, partial = false;
        if (cursor.pageToken) { try { const saved = JSON.parse(cursor.pageToken); productAfter = typeof saved.products?.after === 'string' ? saved.products.after : null; orderAfter = typeof saved.orders?.after === 'string' ? saved.orders.after : null; productsDone = saved.products?.done === true || !readProducts; ordersDone = saved.orders?.done === true || !readOrders; } catch { limitations.push('An invalid persisted Shopify cursor was discarded and the incremental window restarted.'); } }
        const query = cursor.updatedAfter ? 'updated_at:>=' + cursor.updatedAfter : null;
        for (; pagesRead < maxPages; pagesRead++) {
            const productResponse = !productsDone ? await json(transport, { provider: 'shopify_admin', method: 'POST', path: '/admin/api/graphql.json', body: { query: shopifyProductsQuery, variables: { after: productAfter, first, query } } }) : { data: { products: { nodes: [], pageInfo: {} } } };
            const orderResponse = !ordersDone ? await json(transport, { provider: 'shopify_admin', method: 'POST', path: '/admin/api/graphql.json', body: { query: shopifyOrdersQuery, variables: { after: orderAfter, first, query } } }) : { data: { orders: { nodes: [], pageInfo: {} } } };
            if (Array.isArray(productResponse.errors) && productResponse.errors.length || Array.isArray(orderResponse.errors) && orderResponse.errors.length) throw new Error('CONNECTION_SHOPIFY_GRAPHQL_ERROR');
            const products = productResponse.data?.products ?? { nodes: [], pageInfo: {} }, orders = orderResponse.data?.orders ?? { nodes: [], pageInfo: {} };
            for (const product of Array.isArray(products.nodes) ? products.nodes : []) {
                const updatedAt = iso(product.updatedAt), rows = Array.isArray(product.variants?.nodes) ? product.variants.nodes.map((variant: any) => ({ id: variant.id, title: variant.title, sku: variant.sku ?? null, price: variant.price ?? null, inventoryQuantity: Number.isFinite(variant.inventoryQuantity) ? variant.inventoryQuantity : null })) : [], childPartial = product.variants?.pageInfo?.hasNextPage === true;
                const text = JSON.stringify({ title: product.title, handle: product.handle, status: product.status, productType: product.productType, vendor: product.vendor, variants: rows });
                sources.push(source({ sourceIdentity: 'shopify:product:' + product.id, title: safeTitle(product.title, 'Shopify product'), text, observedAt, updatedAt, contentType: 'application/json', sourceUrl: null, partial: childPartial, limitations: childPartial ? ['Product variants exceeded the bounded first:50 connection; remaining variants were omitted.'] : [] })); if (updatedAt && (!newest || updatedAt > newest)) newest = updatedAt;
            }
            for (const order of Array.isArray(orders.nodes) ? orders.nodes : []) {
                const updatedAt = iso(order.updatedAt), createdAt = iso(order.createdAt), lines = Array.isArray(order.lineItems?.nodes) ? order.lineItems.nodes.map((line: any) => ({ title: line.title, sku: line.sku ?? null, quantity: Number(line.quantity ?? 0) })) : [], childPartial = order.lineItems?.pageInfo?.hasNextPage === true;
                const aggregate = { orderId: order.id, createdAt, updatedAt, financialStatus: order.displayFinancialStatus ?? null, total: order.currentTotalPriceSet?.shopMoney ?? null, lineItems: lines, privacy: 'customer names, email, addresses, notes and customer IDs intentionally omitted' };
                sources.push(source({ sourceIdentity: 'shopify:order-aggregate:' + order.id, title: 'Shopify order aggregate ' + order.id, text: JSON.stringify(aggregate), observedAt, updatedAt, contentType: 'application/json', sourceUrl: null, partial: childPartial, limitations: ['Order source is a safe aggregate; customer personal data was not requested or retained.', ...(childPartial ? ['Order line items exceeded the bounded first:100 connection; remaining line items were omitted.'] : [])] })); if (updatedAt && (!newest || updatedAt > newest)) newest = updatedAt;
            }
            productAfter = products.pageInfo?.hasNextPage && typeof products.pageInfo.endCursor === 'string' ? products.pageInfo.endCursor : null; productsDone = !productAfter;
            orderAfter = orders.pageInfo?.hasNextPage && typeof orders.pageInfo.endCursor === 'string' ? orders.pageInfo.endCursor : null; ordersDone = !orderAfter;
            if (productsDone && ordersDone) break;
        }
        const pageToken = !productsDone || !ordersDone ? JSON.stringify({ products: { after: productAfter, done: productsDone }, orders: { after: orderAfter, done: ordersDone } }) : null;
        if (pageToken) { partial = true; limitations.push('Shopify pagination stopped at the configured page limit; product and order cursors are retained independently for continuation.'); }
        return { sources, cursor: pageToken ? { updatedAfter: cursor.updatedAfter ?? null, pendingUpdatedAfter: newest, pageToken } : { updatedAfter: newest, pendingUpdatedAfter: null, pageToken: null }, pagesRead, partial, limitations };
    }
}
const ga4Definition: ConnectionDefinition = {
    provider: 'google_analytics_4', title: 'Google Analytics 4', readiness: 'implemented', documentation: ['https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport'],
    capabilities: [{ id: 'dated_traffic_read', title: 'Read dated traffic, channel and conversion observations', requiredScopes: ['https://www.googleapis.com/auth/analytics.readonly'], effects: 'read', incremental: true, sensitivity: 'analytics' }]
};
/** GA4 Data API reader with explicitly supplied date window and bounded offset paging. */
export class Ga4ReadAdapter implements ReadAdapter {
    readonly definition = ga4Definition;
    async collect(transport: ConnectionTransport, cursor: SyncCursor, options: Record<string, unknown>): Promise<CollectionResult> {
        const propertyId = String(options.propertyId ?? ''), startDate = String(options.startDate ?? ''), endDate = String(options.endDate ?? '');
        if (!/^\d+$/.test(propertyId) || !calendarDate(startDate) || !calendarDate(endDate) || startDate > endDate) throw new Error('GA4_PROPERTY_AND_DATE_WINDOW_REQUIRED');
        const maxPages = positiveInteger(options.maxPages,4,8,'CONNECTION_MAX_PAGES_INVALID'), pageSize = positiveInteger(options.pageSize,500,1000,'CONNECTION_PAGE_SIZE_INVALID'), rows: any[] = [], limitations: string[] = [], observedAt = new Date().toISOString();
        let offset = cursor.offset ?? 0, pagesRead = 0, total: number | null = null; if (!Number.isInteger(offset) || offset < 0) throw new Error('GA4_CURSOR_OFFSET_INVALID'); const firstOffset = offset;
        for (; pagesRead < maxPages; pagesRead++) {
            const result = await json(transport, { provider: 'google_analytics_4', method: 'POST', path: '/v1beta/properties/' + propertyId + ':runReport', body: { dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'ecommercePurchases' }], limit: pageSize, offset, keepEmptyRows: false } });
            const headers = { dimensions: (result.dimensionHeaders ?? []).map((x: any) => x.name), metrics: (result.metricHeaders ?? []).map((x: any) => x.name) };
            const pageRows = Array.isArray(result.rows) ? result.rows : [];
            rows.push(...pageRows.map((row: any) => ({ dimensions: (row.dimensionValues ?? []).map((v: any) => v.value), metrics: (row.metricValues ?? []).map((v: any) => v.value) })));
            total = Number.isFinite(Number(result.rowCount)) && Number(result.rowCount) >= 0 ? Number(result.rowCount) : offset + pageRows.length; offset += pageRows.length; if (offset >= total || pageRows.length === 0) break;
        }
        const partial = total !== null && offset < total;
        if (partial) limitations.push('GA4 report paging stopped at the configured page limit; retained offset continues the same dated window.');
        const body = JSON.stringify({ propertyId, dateRange: { startDate, endDate }, chunk: { offsetStart: firstOffset, offsetEndExclusive: offset, reportedTotal: total, continuationOffset: partial ? offset : null }, headers: { dimensions: ['date', 'sessionDefaultChannelGroup'], metrics: ['sessions', 'totalUsers', 'conversions', 'ecommercePurchases'] }, rows });
        const clipped = limitText(body);
        return { sources: [source({ sourceIdentity: `ga4:property:${propertyId}:traffic:${startDate}:${endDate}:offset:${firstOffset}-${offset}`, title: `GA4 traffic and conversion observations ${startDate} to ${endDate} (rows ${firstOffset}–${Math.max(firstOffset,offset - 1)})`, text: clipped.text, observedAt, updatedAt: null, contentType: 'application/json', sourceUrl: null, partial: partial || clipped.partial, limitations: [...limitations, ...(clipped.partial ? ['GA4 serialized report text was bounded to 180,000 characters.'] : [])] })], cursor: { updatedAfter: partial ? cursor.updatedAfter ?? null : endDate + 'T23:59:59.999Z', pendingUpdatedAfter: partial ? endDate + 'T23:59:59.999Z' : null, offset: partial ? offset : null }, pagesRead, partial: partial || clipped.partial, limitations };
    }
}
export const maintainedReadAdapters = (): ReadAdapter[] => [new GoogleWorkspaceReadAdapter(), new ShopifyReadAdapter(), new Ga4ReadAdapter()];
