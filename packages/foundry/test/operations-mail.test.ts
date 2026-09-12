import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { GMAIL_RESPONSE_MAX_BYTES, GmailRestTransport, MailOutbox, MockMailTransport, rawRfcMessage, recipientEvidenceHash } from '../src/operations/mail.ts';
import { DurableMockMail, OperatingMail } from '../src/operations/communication.ts';
import { generateKeyPairSync } from 'node:crypto';
import type { MailDraft, RecipientEvidence, SignedMailGrant, TransportInboundEvent } from '../src/operations/mail.ts';
import type { Principal, Scope } from '../src/contracts.ts';

function fixture(runId = 'run-a', businessId = 'venture-a') {
    const root = mkdtempSync(join(tmpdir(), 'foundry-mail-'));
    const path = join(root, 'state.sqlite');
    const s: Scope = { tenantId: 'tenant-a', businessId, runId, dataPolicyVersion: 'mail-policy-v1', mode: 'fixture' };
    const owner: Principal = { id: 'owner', tenantId: s.tenantId, businessId: s.businessId, permissions: ['read', 'operate', 'approve'] };
    const worker: Principal = { id: 'worker', tenantId: s.tenantId, businessId: s.businessId, permissions: ['read', 'operate'] };
    const transport = new MockMailTransport();
    const open = () => { const store = new StateStore(path); return { store, outbox: new MailOutbox(store, transport, grant => grant.signature.value === 'owner-signature') }; };
    const first = open();
    return { root, path, s, owner, worker, transport, ...first, reopen() { this.store.close(); const next = open(); this.store = next.store; this.outbox = next.outbox; }, close() { this.store.close(); } };
}

function evidence(recipient: string, policyVersion = 'mail-policy-v1'): RecipientEvidence {
    const source = { sourceId: 'contact-source-1', sourceUri: 'https://example.test/contact', sourceObservedAt: '2026-09-12T12:00:00.000Z', sourceContentHash: 'a'.repeat(64), address: recipient, addressKind: 'published_business_contact' as const, eligibility: 'eligible' as const, eligibilityBasis: 'Published business contact is relevant to the documented offer and fixture policy.', policyVersion };
    return { ...source, evidenceHash: recipientEvidenceHash(source) };
}

function draft(id = 'mail-1', recipient = 'buyer@example.test', overrides: Partial<MailDraft> = {}): MailDraft {
    return { id, sender: 'operator@midas.test', recipient, evidence: evidence(recipient), content: { subject: 'A documented operations question', text: 'Would this evidence-backed workflow be relevant?', offerRef: 'offer-1', claimIds: ['claim-1'] }, ...overrides };
}

function signed(payload: any, value = 'owner-signature'): SignedMailGrant {
    return { payload, signature: { algorithm: 'fixture-test-only', keyId: 'owner-key', value } };
}

function approveOne(h: ReturnType<typeof fixture>, id = 'mail-1', options: { expiresAt?: string; maxFollowUps?: number } = {}) {
    const payload = h.outbox.approvalRequest(h.owner, h.s, { grantId: 'grant-' + id, batchId: 'batch-' + id, outboxIds: [id], issuedAt: '2026-09-12T12:00:00.000Z', expiresAt: options.expiresAt ?? '2099-09-12T13:00:00.000Z', envelopeVersion: 'envelope-v1', maxFollowUpsPerThread: options.maxFollowUps ?? 0 });
    return h.outbox.approve(h.owner, h.s, signed(payload), Date.parse('2026-09-12T12:01:00.000Z'));
}

test('source-backed eligibility and exact signed batch bind every recipient, revision, claim, and content hash', () => {
    const h = fixture();
    try {
        const guessed = draft('guessed');
        guessed.evidence = { ...guessed.evidence, addressKind: 'guessed' as any };
        assert.throws(() => h.outbox.enqueue(h.worker, h.s, guessed), /UNSUPPORTED_ADDRESS_ORIGIN/);
        h.outbox.enqueue(h.worker, h.s, draft());
        const payload = h.outbox.approvalRequest(h.owner, h.s, { grantId: 'grant-1', batchId: 'batch-1', outboxIds: ['mail-1'], issuedAt: '2026-09-12T12:00:00.000Z', expiresAt: '2099-09-12T13:00:00.000Z', envelopeVersion: 'envelope-v1' });
        assert.equal(payload.envelope.maxVolume, 1);
        assert.equal(payload.envelope.items[0].recipient, 'buyer@example.test');
        assert.throws(() => h.outbox.approve(h.owner, h.s, signed(payload, 'forged'), Date.parse('2026-09-12T12:01:00.000Z')), /INVALID_GRANT_SIGNATURE/);
        const tampered = structuredClone(payload); tampered.envelope.items[0].claimIds = ['different-claim'];
        assert.throws(() => h.outbox.approve(h.owner, h.s, signed(tampered), Date.parse('2026-09-12T12:01:00.000Z')), /WRONG_APPROVED_MAIL/);
        h.outbox.approve(h.owner, h.s, signed(payload), Date.parse('2026-09-12T12:01:00.000Z'));
        assert.equal(h.outbox.status(h.owner, h.s, 'mail-1').status, 'approved');
        h.outbox.revise(h.worker, h.s, 'mail-1', { sender: 'operator@midas.test', recipient: 'buyer@example.test', evidence: evidence('buyer@example.test'), content: { ...draft().content, text: 'Corrected, evidence-backed message.' } });
        const revised = h.outbox.status(h.owner, h.s, 'mail-1');
        assert.equal(revised.status, 'queued'); assert.equal(revised.grantId, null); assert.equal(revised.revision, 2);
        assert.notEqual(revised.contentHash, payload.envelope.items[0].contentHash);
    } finally { h.close(); }
});

test('atomic claim sends once and provider acknowledgement remains distinct from delivery', async () => {
    const h = fixture();
    try {
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h);
        const [a, b] = await Promise.all([h.outbox.dispatch(h.worker, h.s, 'mail-1'), h.outbox.dispatch(h.worker, h.s, 'mail-1')]);
        assert.equal(a.status, 'provider_accepted');
        assert.ok(['dispatch_unknown', 'provider_accepted'].includes(b.status));
        assert.equal(h.transport.sendCalls, 1);
        const status = h.outbox.status(h.owner, h.s, 'mail-1');
        assert.equal(status.status, 'provider_accepted'); assert.equal(status.delivery, 'not_evidenced');
        assert.match(status.providerMessageId, /^mock-message-/); assert.match(status.threadId, /^mock-thread-/);
    } finally { h.close(); }
});

test('timeout after provider effect survives restart and reconciles by exact Message-ID without duplicate send', async () => {
    const h = fixture();
    try {
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h); h.transport.fault = 'timeout_after_accept';
        const uncertain = await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        assert.equal(uncertain.status, 'dispatch_unknown'); assert.equal(h.transport.sendCalls, 1);
        h.reopen();
        const recovered = await h.outbox.reconcile(h.worker, h.s, 'mail-1');
        assert.equal(recovered.status, 'provider_accepted'); assert.equal(recovered.reconciliation.lastStatus, 'found');
        await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        assert.equal(h.transport.sendCalls, 1);
    } finally { h.close(); }
});

test('timeout before acceptance and an authoritative search miss remain unknown and held', async () => {
    const h = fixture();
    try {
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h); h.transport.fault = 'timeout_before_accept';
        await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        const unresolved = await h.outbox.reconcile(h.worker, h.s, 'mail-1');
        assert.equal(unresolved.status, 'dispatch_unknown'); assert.equal(unresolved.reconciliation.lastStatus, 'absent');
        await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        assert.equal(h.transport.sendCalls, 1);
    } finally { h.close(); }
});

test('duplicate reply events are harmless and any scoped reply blocks a queued follow-up', async () => {
    const h = fixture();
    try {
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h); await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        const initial = h.outbox.status(h.owner, h.s, 'mail-1');
        h.outbox.enqueue(h.worker, h.s, draft('follow-1', 'buyer@example.test', { kind: 'follow_up', parentOutboxId: 'mail-1', content: { subject: 'Following up', text: 'One bounded follow-up.', offerRef: 'offer-1', claimIds: ['claim-1'] } }));
        approveOne(h, 'follow-1', { maxFollowUps: 1 });
        const reply: TransportInboundEvent = { id: 'reply-1', threadId: initial.threadId, messageId: '<reply-1@example.test>', from: 'buyer@example.test', to: ['operator@midas.test'], receivedAt: new Date(Date.now() + 1000).toISOString(), kind: 'reply', text: 'Thanks, I will review this.', inReplyTo: initial.messageId };
        h.transport.addInbound(reply);
        assert.equal((await h.outbox.poll(h.worker, h.s, 'mail-1')).status, 'replied');
        assert.equal((await h.outbox.poll(h.worker, h.s, 'mail-1')).status, 'replied');
        const count = h.store.db.prepare("SELECT count(*) n FROM entities WHERE kind='mail-inbound-event'").get()!.n;
        assert.equal(count, 1);
        await assert.rejects(h.outbox.dispatch(h.worker, h.s, 'follow-1'), /FOLLOW_UP_BLOCKED/);
    } finally { h.close(); }
});

test('opt-out and hard-bounce suppression persist across restart and business runs', async () => {
    const h = fixture();
    try {
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h); await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        const row = h.outbox.status(h.owner, h.s, 'mail-1');
        h.transport.addInbound({ id: 'reply-optout', threadId: row.threadId, messageId: '<reply-optout@example.test>', from: 'buyer@example.test', to: ['operator@midas.test'], receivedAt: new Date(Date.now() + 1000).toISOString(), kind: 'reply', text: 'Please unsubscribe me.', inReplyTo: row.messageId });
        await h.outbox.poll(h.worker, h.s, 'mail-1'); h.reopen();
        const laterScope = { ...h.s, runId: 'run-b' }, laterWorker = { ...h.worker };
        assert.throws(() => h.outbox.enqueue(laterWorker, laterScope, draft('later')), /RECIPIENT_SUPPRESSED/);

        const bounceRecipient = 'invalid@example.test';
        h.outbox.enqueue(h.worker, h.s, draft('mail-bounce', bounceRecipient)); approveOne(h, 'mail-bounce'); await h.outbox.dispatch(h.worker, h.s, 'mail-bounce');
        const bounceRow = h.outbox.status(h.owner, h.s, 'mail-bounce');
        h.transport.addInbound({ id: 'bounce-1', threadId: bounceRow.threadId, messageId: '<bounce-1@midas.test>', from: 'mailer-daemon@midas.test', to: ['operator@midas.test'], receivedAt: new Date(Date.now() + 1000).toISOString(), kind: 'hard_bounce', text: 'Permanent failure', failedRecipient: bounceRecipient, originalMessageId: bounceRow.messageId });
        assert.equal((await h.outbox.poll(h.worker, h.s, 'mail-bounce')).status, 'hard_bounced');
        assert.throws(() => h.outbox.enqueue(h.worker, laterScope, draft('bounce-later', bounceRecipient)), /RECIPIENT_SUPPRESSED/);
    } finally { h.close(); }
});

test('expiry and revocation stop unclaimed dispatch without contacting transport', async () => {
    const h = fixture();
    try {
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h);
        h.outbox.revoke(h.owner, h.s, 'grant-mail-1');
        await assert.rejects(h.outbox.dispatch(h.worker, h.s, 'mail-1'), /APPROVAL_REVOKED/);
        assert.equal(h.transport.sendCalls, 0);

        h.outbox.enqueue(h.worker, h.s, draft('mail-expired'));
        const payload = h.outbox.approvalRequest(h.owner, h.s, { grantId: 'grant-expired', batchId: 'batch-expired', outboxIds: ['mail-expired'], issuedAt: '2026-09-12T12:00:00.000Z', expiresAt: '2026-09-12T12:02:00.000Z', envelopeVersion: 'envelope-v1' });
        h.outbox.approve(h.owner, h.s, signed(payload), Date.parse('2026-09-12T12:01:00.000Z'));
        await assert.rejects(h.outbox.dispatch(h.worker, h.s, 'mail-expired', Date.parse('2026-09-12T12:03:00.000Z')), /APPROVAL_EXPIRED/);
        assert.equal(h.transport.sendCalls, 0);
    } finally { h.close(); }
});

test('Gmail REST transport uses only injected OAuth/fetch, sends base64url RFC mail, and reconciles exact SENT Message-ID', async () => {
    const calls: any[] = [];
    const stableId = '<stable-id@midas.test>';
    const response = (body: any, ok = true) => new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'content-type': 'application/json' } });
    const fetch = async (url: string, init: any) => {
        calls.push({ url, init });
        if (url.endsWith('/messages/send')) return response({ id: 'gmail-1', threadId: 'thread-1' });
        if (url.includes('/messages?')) return response({ messages: [{ id: 'gmail-1', threadId: 'thread-1' }] });
        if (url.includes('/messages/gmail-1?')) return response({ id: 'gmail-1', threadId: 'thread-1', labelIds: ['SENT'], payload: { headers: [{ name: 'Message-ID', value: stableId }] } });
        throw new Error('unexpected URL ' + url);
    };
    let credentials = 0;
    const transport = new GmailRestTransport({ expectedSender: 'operator@midas.test', credential: () => { credentials++; return { type: 'oauth2', accountEmail: 'operator@midas.test', accessToken: 'fixture-token-never-logged', expiresAt: '2099-01-01T00:00:00.000Z', scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'] }; }, fetch });
    assert.equal(credentials, 0);
    const accepted = await transport.send({ outboxId: 'mail-1', sender: 'operator@midas.test', recipient: 'buyer@example.test', subject: 'Résumé', text: 'Hello\nWorld', messageId: stableId });
    assert.deepEqual(accepted, { id: 'gmail-1', threadId: 'thread-1' });
    const encoded = JSON.parse(calls[0].init.body).raw;
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    assert.match(decoded, /Message-ID: <stable-id@midas\.test>/); assert.match(decoded, /Subject: =\?UTF-8\?B\?/); assert.match(decoded, /Hello\r\nWorld/);
    assert.deepEqual(await transport.findSentByMessageId(stableId, 10), { status: 'found', id: 'gmail-1', threadId: 'thread-1' });
    assert.ok(calls[1].url.includes(encodeURIComponent('rfc822msgid:' + stableId)));
    assert.ok(calls.every(c => c.init.headers.Authorization === 'Bearer fixture-token-never-logged'));
    assert.equal(credentials, 2);
});

test('Gmail inbound read is restricted to one exact thread and at most the requested full bodies', async () => {
    const calls: string[] = [], threadId = 'thread-bounded', sender = 'operator@midas.test', recipient = 'buyer@example.test';
    const response = (body: any) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const message = (id: string) => ({ id, threadId, internalDate: String(Date.parse('2026-09-12T12:10:00.000Z')), payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: recipient }, { name: 'To', value: sender }, { name: 'Message-ID', value: `<${id}@example.test>` }, { name: 'In-Reply-To', value: '<original@midas.test>' }, { name: 'Content-Type', value: 'text/plain' }], body: { data: Buffer.from('A bounded reply').toString('base64url') } } });
    const fetch = async (url: string) => {
        calls.push(url);
        if (url.includes('/threads/')) return response({ id: threadId, messages: ['m1', 'm2', 'm3'].map(message) });
        const id = url.match(/\/messages\/(m\d)/)?.[1];
        if (id) return response(message(id));
        throw new Error('unexpected URL');
    };
    const transport = new GmailRestTransport({ expectedSender: sender, credential: () => ({ type: 'oauth2', accountEmail: sender, accessToken: 'fixture-token', expiresAt: '2099-01-01T00:00:00.000Z', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }), fetch: fetch as any });
    const result = await transport.pollThread({ threadId, sender, recipient, since: '2026-09-12T12:00:00.000Z', maxResults: 2 });
    assert.equal(result.status, 'ok'); assert.equal(result.events.length, 2);
    assert.equal(calls.filter(url => url.includes('/messages/')).length, 2);
    assert.ok(calls[0].includes('/threads/thread-bounded?')); assert.ok(!calls.some(url => url.includes('/messages/m1?')));
});

test('raw RFC builder rejects header injection', () => {
    assert.throws(() => rawRfcMessage({ sender: 'operator@midas.test', recipient: 'buyer@example.test', subject: 'Hello\r\nBcc: victim@example.test', text: 'Body', messageId: '<id@midas.test>' }), /INVALID_SUBJECT/);
});

test('Gmail response parsing rejects declared and streamed bodies above a finite limit without parsing provider text', async () => {
    const sender = 'operator@midas.test';
    const credential = () => ({ type: 'oauth2' as const, accountEmail: sender, accessToken: 'fixture-token', expiresAt: '2099-01-01T00:00:00.000Z', scopes: ['https://www.googleapis.com/auth/gmail.send'] });
    let reads = 0;
    const declared = new GmailRestTransport({ expectedSender: sender, credential, fetch: async () => ({ ok: true, status: 200, headers: { get: () => String(GMAIL_RESPONSE_MAX_BYTES + 1) }, body: { getReader: () => ({ read: async () => { reads++; return { done: true }; }, releaseLock() {} }) } }) });
    await assert.rejects(declared.send({ outboxId: 'mail-1', sender, recipient: 'buyer@example.test', subject: 'Hello', text: 'Body', messageId: '<bounded@midas.test>' }), (error: any) => error.code === 'GMAIL_RESPONSE_TOO_LARGE' && !String(error).includes('provider-secret'));
    assert.equal(reads, 0);

    let step = 0, cancelled = false;
    const streamed = new GmailRestTransport({ expectedSender: sender, credential, fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => step++ === 0 ? { done: false, value: new Uint8Array(GMAIL_RESPONSE_MAX_BYTES) } : { done: false, value: new Uint8Array([123]) }, cancel: async () => { cancelled = true; }, releaseLock() {} }) } }) });
    await assert.rejects(streamed.send({ outboxId: 'mail-2', sender, recipient: 'buyer@example.test', subject: 'Hello', text: 'Body', messageId: '<streamed@midas.test>' }), (error: any) => error.code === 'GMAIL_RESPONSE_TOO_LARGE');
    assert.equal(cancelled, true);
});

test('401 send rejection and 403 poll rejection become durable terminal authority failures', async () => {
    const h = fixture();
    const sender = 'operator@midas.test';
    const credential = () => ({ type: 'oauth2' as const, accountEmail: sender, accessToken: 'fixture-token', expiresAt: '2099-01-01T00:00:00.000Z', scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'] });
    try {
        let calls = 0;
        const rejected = new GmailRestTransport({ expectedSender: sender, credential, fetch: async () => { calls++; return new Response('provider-secret-must-not-surface', { status: 401 }); } });
        h.outbox = new MailOutbox(h.store, rejected, grant => grant.signature.value === 'owner-signature');
        h.outbox.enqueue(h.worker, h.s, draft()); approveOne(h);
        const failed = await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        assert.equal(failed.status, 'authority_failed');
        assert.deepEqual(failed.authorityFailure, { operation: 'send', code: 'GMAIL_AUTHORITY_REJECTED', httpStatus: 401, at: failed.authorityFailure.at, priorStatus: 'dispatch_unknown' });
        await h.outbox.dispatch(h.worker, h.s, 'mail-1');
        assert.equal(calls, 1);

        h.store.close();
        h.store = new StateStore(h.path);
        h.outbox = new MailOutbox(h.store, rejected, grant => grant.signature.value === 'owner-signature');
        assert.equal((await h.outbox.dispatch(h.worker, h.s, 'mail-1')).status, 'authority_failed');
        assert.equal(calls, 1);

        h.outbox.enqueue(h.worker, h.s, draft('mail-poll')); approveOne(h, 'mail-poll');
        let pollCalls = 0;
        const pollRejected = new GmailRestTransport({ expectedSender: sender, credential, fetch: async (url) => {
            pollCalls++;
            if (url.endsWith('/messages/send')) return new Response(JSON.stringify({ id: 'gmail-poll', threadId: 'thread-poll' }), { status: 200 });
            return new Response('private-provider-policy', { status: 403 });
        } });
        h.outbox = new MailOutbox(h.store, pollRejected, grant => grant.signature.value === 'owner-signature');
        assert.equal((await h.outbox.dispatch(h.worker, h.s, 'mail-poll')).status, 'provider_accepted');
        const readFailed = await h.outbox.poll(h.worker, h.s, 'mail-poll');
        assert.equal(readFailed.status, 'authority_failed'); assert.equal(readFailed.authorityFailure.operation, 'poll'); assert.equal(readFailed.authorityFailure.httpStatus, 403);
        await h.outbox.poll(h.worker, h.s, 'mail-poll');
        assert.equal(pollCalls, 2);
    } finally { h.close(); }
});

test('follow-up dispatch re-polls its original, blocks a newly arrived reply, and rejects recursive follow-ups', async () => {
    const root = mkdtempSync(join(tmpdir(), 'foundry-followup-')), store = new StateStore(join(root, 'state.sqlite'));
    try {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519', { publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
        const transport = new DurableMockMail(store);
        const business: any = { id: 'venture-followup', mode: 'offline', revision: 1, sourceSnapshot: 'source-snapshot-1', scope: { tenantId: 'mason', businessId: 'venture-followup', runId: 'operations-v1', dataPolicyVersion: 'public-business-v1', mode: 'fixture' }, outboxIds: [], sources: [{ id: 'contact-1', url: 'urn:midas:owner-record:contact-1', observedAt: '2026-09-12T12:00:00.000Z', sha256: 'b'.repeat(64) }], artifacts: [{ id: 'artifact-1' }] };
        const mail = new OperatingMail(store, transport, { mode: 'mock', sender: 'operator@midas.test', permittedRecipients: ['buyer@example.test'], expiresAt: '2099-01-01T00:00:00.000Z', maxMessages: 4, maxPolls: 20, minimumIntervalSeconds: 0, maxFollowUpsPerThread: 1, approvalReference: 'owner-approved-fixture', eligibilityBasis: 'Published business inquiry address in fixture source.', businessIds: [business.id] }, { publicKey, privateKey });
        business.outboxIds = mail.queue(business, { outreach: [{ to: 'buyer@example.test', recipientSourceId: 'contact-1', eligibilityReason: 'Owner supplied this business inquiry address.', subject: 'Question', body: 'Is this relevant?', sourceIds: ['contact-1'] }] });
        assert.equal(mail.outbox.status({ id: 'mason-local-owner', tenantId: 'mason', businessId: business.id, permissions: ['read', 'operate', 'approve'] }, business.scope, business.outboxIds[0]).evidence.addressKind, 'owner_supplied_verified');
        let batch = mail.status(business).approvals.find((item: any) => item.status === 'pending');
        mail.approve(business, batch.batchHash); await mail.dispatch(business, batch.batchHash);
        const initialId = business.outboxIds[0], initial = mail.outbox.status({ id: 'mason-local-owner', tenantId: 'mason', businessId: business.id, permissions: ['read', 'operate', 'approve'] }, business.scope, initialId);

        const followId = await mail.followup(business, initialId);
        await assert.rejects(mail.followup(business, followId), /FOLLOW_UP_MUST_REFERENCE_ORIGINAL/);
        business.outboxIds = [followId];
        batch = mail.status(business).approvals.find((item: any) => item.status === 'pending');
        mail.approve(business, batch.batchHash);
        transport.inject({ id: 'reply-after-review', threadId: initial.threadId, messageId: '<reply-after-review@example.test>', from: 'buyer@example.test', to: ['operator@midas.test'], receivedAt: new Date(Date.now() + 1000).toISOString(), kind: 'reply', text: 'No thank you.', inReplyTo: initial.messageId });
        await assert.rejects(mail.dispatch(business, batch.batchHash), /FOLLOW_UP_BLOCKED/);
        assert.equal(Number(store.db.prepare("SELECT count(*) n FROM entities WHERE kind='mock-mail-provider'").get()!.n), 1);
        assert.equal(mail.outbox.status({ id: 'mason-local-owner', tenantId: 'mason', businessId: business.id, permissions: ['read', 'operate', 'approve'] }, business.scope, initialId).status, 'replied');
        assert.equal(mail.outbox.status({ id: 'mason-local-owner', tenantId: 'mason', businessId: business.id, permissions: ['read', 'operate', 'approve'] }, business.scope, followId).status, 'approved');
    } finally { store.close(); }
});
