import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../src/contracts.ts';
import { keypair } from '../src/experiment/config.ts';
import { StateStore } from '../src/state.ts';
import { PilotKnowledge } from '../src/pilot/knowledge.ts';
import { ConnectionRegistry, ConnectionService, OfflineTransport, maintainedReadAdapters } from '../src/pilot/connections/index.ts';
import { inspectConnectionReadAuthorization, loadAuthorizedConnectionRead, prepareConnectionReadAuthorization, signConnectionReadProposal } from '../src/pilot/connections/host.ts';
import { runConnectionHostCli } from '../src/pilot/connections/cli.ts';

const consent = () => ({ grantedAt: new Date().toISOString(), grantedBy: 'ephemeral-owner', purpose: 'Read only the bounded synthetic Drive fixture.', scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
function setup() {
    const root = mkdtempSync(join(tmpdir(), 'midas-connection-host-')), store = new StateStore(join(root, 'state.sqlite')), knowledge = new PilotKnowledge(store), company = knowledge.createCompany({ name: 'Synthetic read host', goal: 'Read a synthetic document under a signed owner grant.', mode: 'fixture' }), service = new ConnectionService(store, knowledge, new ConnectionRegistry(maintainedReadAdapters())), connection = service.beginConfiguration({ businessId: company.id, provider: 'google_workspace', credentialReference: { kind: 'owner_vault', id: 'synthetic-opaque-reference' }, capabilityIds: ['drive_documents_read'], configuration: { maxFiles: 1, maxPages: 1 } });
    service.grantConsent(connection.id, consent()); const token = join(root, 'protected.synthetic.token'); writeFileSync(token, 'SYNTHETIC_TOKEN_NOT_A_CREDENTIAL'); return { root, store, knowledge, company, service, connection, token, keys: keypair() };
}
function prepared(f: ReturnType<typeof setup>, write = true) { return prepareConnectionReadAuthorization({ connectedAccounts: f.service }, { root: f.root, ...(write ? { directory: join(f.root, 'packet') } : {}), id: 'synthetic-connection-read-v1', businessId: f.company.id, connectionId: f.connection.id, protectedTokenFile: f.token, expiresAt: new Date(Date.now() + 60_000).toISOString() }); }
function signedFixture(f: ReturnType<typeof setup>) { const p = prepared(f); const result = signConnectionReadProposal({ connectedAccounts: f.service }, f.root, { proposal: p.proposal, expectedHash: p.proposalHash, principal: 'ephemeral-owner', approvalReference: 'Synthetic mock-only approval with no account or provider authority.', publicKey: f.keys.publicKey, privateKey: f.keys.privateKey }); return { ...p, envelope: result.envelope }; }

test('connection host writes an unsigned exact packet, signs with explicit ephemeral keys, and durably admits reads before mock transport access', async () => {
    const f = setup(); try {
        const signed = signedFixture(f), packet = readFileSync(join(f.root, 'packet', 'connection-read.authorization.request.json'), 'utf8');
        assert.ok(!packet.includes('SYNTHETIC_TOKEN_NOT_A_CREDENTIAL')); assert.equal(inspectConnectionReadAuthorization({ connectedAccounts: f.service }, f.root).admittedReads, 0);
        let calls = 0, listCalls = 0; const fetch = async (url: URL | string, init?: RequestInit) => { calls++; assert.equal((init!.headers as any).Authorization, 'Bearer SYNTHETIC_TOKEN_NOT_A_CREDENTIAL'); const value = String(url); if (value.startsWith('https://www.googleapis.com/drive/v3/files?')) { listCalls++; return new Response(JSON.stringify(listCalls === 1 ? { files: [{ id: 'first-owned-source', name: 'First owned source', mimeType: 'application/vnd.google-apps.document' }] } : { files: [] }), { status: 200, headers: { 'content-type': 'application/json' } }); } assert.ok(value.includes('/documents/first-owned-source')); return new Response(JSON.stringify({ body: { content: [{ textRun: { content: 'The first signed sync created this bounded continuation source.' } }] } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
        const first = loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { testing: { envelope: signed.envelope, trustedPublicKey: f.keys.publicKey, fetch } }); await first.sync();
        const second = loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { testing: { envelope: signed.envelope, trustedPublicKey: f.keys.publicKey, fetch } }); await second.sync();
        assert.equal(calls, 3); assert.equal(second.totals().admittedReads, 3); assert.equal(inspectConnectionReadAuthorization({ connectedAccounts: f.service }, f.root).liveEnabled, true);
        const grantHash = hash(signed.envelope.payload), accountKey = 'connection-host-account/' + grantHash, existing = f.store.get('pilot-connection-host-account', accountKey); f.store.transaction(() => f.store.put('pilot-connection-host-account', accountKey, { grantHash, used: 40, updatedAt: new Date().toISOString() }, existing._version));
        const capped = loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { testing: { envelope: signed.envelope, trustedPublicKey: f.keys.publicKey, fetch } }); await assert.rejects(capped.sync(), /CONNECTION_READ_FAILED/); assert.equal(calls, 3); assert.equal(capped.totals().admittedReads, 40);
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test('signed connection packets reject expiry, source/configuration rotation, and cannot replay an interrupted read', async () => {
    const f = setup(); try {
        const p = prepared(f, false); assert.throws(() => prepareConnectionReadAuthorization({ connectedAccounts: f.service }, { root: f.root, id: 'expired-packet', businessId: f.company.id, connectionId: f.connection.id, protectedTokenFile: f.token, expiresAt: '2000-01-01T00:00:00Z' }), /PREPARE_SCOPE/);
        const state = f.service.get(f.connection.id); f.store.transaction(() => f.store.put('pilot-connection', state.id, { ...state, configuration: { maxFiles: 2, maxPages: 1 } }, state._version));
        assert.throws(() => signConnectionReadProposal({ connectedAccounts: f.service }, f.root, { proposal: p.proposal, expectedHash: p.proposalHash, principal: 'owner', approvalReference: 'Exact packet rejects rotated connection configuration.', publicKey: f.keys.publicKey, privateKey: f.keys.privateKey }), /SCOPE_CHANGED/);
        f.store.transaction(() => f.store.put('pilot-connection', state.id, state, f.service.get(state.id)._version));
        await f.service.sync(f.connection.id, new OfflineTransport([{ matches: request => request.path === '/drive/v3/files', response: { status: 200, body: { files: [{ id: 'new-scope', name: 'New source', mimeType: 'application/vnd.google-apps.document' }] } } }, { matches: request => request.path.includes('/documents/'), response: { status: 200, body: { body: { content: [{ textRun: { content: 'A newly observed source changes the signed source scope.' } }] } } } }]));
        assert.throws(() => signConnectionReadProposal({ connectedAccounts: f.service }, f.root, { proposal: p.proposal, expectedHash: p.proposalHash, principal: 'owner', approvalReference: 'Exact packet rejects a newly observed connection source.', publicKey: f.keys.publicKey, privateKey: f.keys.privateKey }), /SCOPE_CHANGED/);
        const signed = signedFixture(f); let calls = 0;
        const failed = loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { testing: { envelope: signed.envelope, trustedPublicKey: f.keys.publicKey, fetch: async () => { calls++; throw Error('synthetic interrupt'); } } }); await assert.rejects(failed.sync(), /CONNECTION_READ_FAILED/); assert.equal(calls, 1);
        const restarted = loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { testing: { envelope: signed.envelope, trustedPublicKey: f.keys.publicKey, fetch: async () => { calls++; return new Response(JSON.stringify({ files: [] }), { headers: { 'content-type': 'application/json' } }); } } }); await assert.rejects(restarted.sync(), /INTERRUPTED_NO_RESUBMIT/); assert.equal(calls, 1);
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test('connection host CLI prepares, signs, and reports a current synthetic grant without exposing the protected token', async () => {
    const f = setup(); try {
        const publicKey = join(f.root, 'owner.pub'), privateKey = join(f.root, 'owner.key'), output = join(f.root, 'cli-packet'); writeFileSync(publicKey, f.keys.publicKey); writeFileSync(privateKey, f.keys.privateKey); const messages: any[] = [], dependencies = { service: { connectedAccounts: f.service, store: f.store } as any, write: (value: any) => messages.push(value) };
        const prepare = await runConnectionHostCli(['prepare', '--root', f.root, '--business', f.company.id, '--connection', f.connection.id, '--id', 'cli-synthetic-read', '--token-file', f.token, '--expires-at', new Date(Date.now() + 60_000).toISOString(), '--output', output], dependencies);
        await runConnectionHostCli(['sign', '--root', f.root, '--proposal', join(output, 'connection-read.authorization.request.json'), '--approve-proposal-hash', prepare.proposalHash, '--principal', 'cli-owner', '--approval-reference', 'Explicit synthetic owner review for the exact unsigned packet.', '--owner-public-key', publicKey, '--owner-private-key', privateKey], dependencies);
        const status = await runConnectionHostCli(['status', '--root', f.root], dependencies); assert.equal(status.authorization.current, true); assert.ok(!JSON.stringify(messages).includes('SYNTHETIC_TOKEN_NOT_A_CREDENTIAL'));
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test('separate connection grants share a trust anchor but never a file, scope, or durable request account', () => {
    const f = setup(); try {
        const second = f.service.beginConfiguration({ businessId: f.company.id, provider: 'google_workspace', credentialReference: { kind: 'owner_vault', id: 'second-synthetic-opaque-reference' }, capabilityIds: ['drive_documents_read'], configuration: { maxFiles: 1, maxPages: 1 } }); f.service.grantConsent(second.id, consent());
        const first = prepared(f, false), other = prepareConnectionReadAuthorization({ connectedAccounts: f.service }, { root: f.root, id: 'second-synthetic-read', businessId: f.company.id, connectionId: second.id, protectedTokenFile: f.token, expiresAt: new Date(Date.now() + 60_000).toISOString() });
        const approve = (proposal: any, expectedHash: string) => signConnectionReadProposal({ connectedAccounts: f.service }, f.root, { proposal, expectedHash, principal: 'multi-connection-owner', approvalReference: 'Separate exact synthetic grant for one configured connection.', publicKey: f.keys.publicKey, privateKey: f.keys.privateKey });
        const signedFirst = approve(first.proposal, first.proposalHash), signedSecond = approve(other.proposal, other.proposalHash);
        assert.equal(inspectConnectionReadAuthorization({ connectedAccounts: f.service }, f.root).reason, 'CONNECTION_HOST_CONNECTION_REQUIRED'); assert.equal(inspectConnectionReadAuthorization({ connectedAccounts: f.service }, f.root, second.id).connectionId, second.id);
        assert.throws(() => loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { connectionId: second.id, testing: { envelope: signedFirst.envelope, trustedPublicKey: f.keys.publicKey, fetch: async () => new Response('{}') } }), /GRANT_CONNECTION_MISMATCH/);
        assert.equal(loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { connectionId: second.id, testing: { envelope: signedSecond.envelope, trustedPublicKey: f.keys.publicKey, fetch: async () => new Response('{}') } }).totals().admittedReads, 0);
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test('a Shopify grant binds its exact approved domain and never accepts a testing-time redirect', async () => {
    const f = setup(); try {
        const shop = f.service.beginConfiguration({ businessId: f.company.id, provider: 'shopify_admin', credentialReference: { kind: 'owner_vault', id: 'synthetic-shopify-reference' }, capabilityIds: ['products_read'], configuration: { maxPages: 1, pageSize: 1 } }); f.service.grantConsent(shop.id, { ...consent(), scopes: ['read_products'] });
        assert.throws(() => prepareConnectionReadAuthorization({ connectedAccounts: f.service }, { root: f.root, id: 'shop-no-domain', businessId: f.company.id, connectionId: shop.id, protectedTokenFile: f.token, expiresAt: new Date(Date.now() + 60_000).toISOString() }), /SHOP_DOMAIN/);
        const p = prepareConnectionReadAuthorization({ connectedAccounts: f.service }, { root: f.root, id: 'shop-bound-domain', businessId: f.company.id, connectionId: shop.id, protectedTokenFile: f.token, shopDomain: 'bounded-shop.myshopify.com', expiresAt: new Date(Date.now() + 60_000).toISOString() }); const accepted = signConnectionReadProposal({ connectedAccounts: f.service }, f.root, { proposal: p.proposal, expectedHash: p.proposalHash, principal: 'shop-owner', approvalReference: 'Exact synthetic Shopify read grant with one approved shop domain.', publicKey: f.keys.publicKey, privateKey: f.keys.privateKey });
        let endpoint = ''; const runner = loadAuthorizedConnectionRead({ connectedAccounts: f.service }, f.root, { connectionId: shop.id, testing: { envelope: accepted.envelope, trustedPublicKey: f.keys.publicKey, shopDomain: 'redirected.example', fetch: async (url: URL | string) => { endpoint = String(url); return new Response(JSON.stringify({ data: { products: { nodes: [], pageInfo: {} } } }), { headers: { 'content-type': 'application/json' } }); } } as any }); await runner.sync(); assert.ok(endpoint.startsWith('https://bounded-shop.myshopify.com/admin/api/2026-07/graphql.json'));
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});
