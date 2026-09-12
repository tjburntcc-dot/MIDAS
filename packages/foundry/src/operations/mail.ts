import { businessKey, canonical, hash, identifier, requireThat, safeInteger, scopeKey, assertScope } from '../contracts.ts';
import type { Principal, Scope } from '../contracts.ts';
import { StateStore } from '../state.ts';

export type RecipientEvidence = {
    sourceId: string;
    sourceUri: string;
    sourceObservedAt: string;
    sourceContentHash: string;
    address: string;
    addressKind: 'published_business_contact' | 'owner_supplied_verified';
    eligibility: 'eligible';
    eligibilityBasis: string;
    policyVersion: string;
    evidenceHash: string;
};

export type MailContent = {
    subject: string;
    text: string;
    offerRef: string;
    claimIds: string[];
};

export type MailDraft = {
    id: string;
    sender: string;
    recipient: string;
    evidence: RecipientEvidence;
    content: MailContent;
    kind?: 'initial' | 'follow_up';
    parentOutboxId?: string | null;
};

export type MailEnvelopeItem = {
    outboxId: string;
    revision: number;
    sender: string;
    recipient: string;
    contentHash: string;
    evidenceHash: string;
    offerRef: string;
    claimIds: string[];
};

export type MailGrantPayload = {
    schemaVersion: 'mail-grant-v1';
    grantId: string;
    batchId: string;
    scope: Scope;
    issuerPrincipalId: string;
    issuedAt: string;
    envelope: {
        version: string;
        channel: 'gmail';
        items: MailEnvelopeItem[];
        expiresAt: string;
        maxVolume: number;
        cadence: {
            minimumIntervalSeconds: number;
            maxFollowUpsPerThread: number;
        };
        exceptionRules: {
            stopOnAnyReply: true;
            suppressOnOptOut: true;
            suppressOnHardBounce: true;
        };
    };
};

export type SignedMailGrant = {
    payload: MailGrantPayload;
    signature: {
        algorithm: string;
        keyId: string;
        value: string;
    };
};

export type OutboxStatus = 'queued' | 'approved' | 'revoked' | 'dispatch_unknown' | 'provider_accepted' | 'replied' | 'hard_bounced' | 'authority_failed';

export type MailAuthorityFailure = {
    operation: 'send' | 'reconcile' | 'poll';
    code: 'GMAIL_AUTHORITY_REJECTED';
    httpStatus: 401 | 403;
    at: string;
    priorStatus: OutboxStatus;
};

export type TransportMessage = {
    outboxId: string;
    sender: string;
    recipient: string;
    subject: string;
    text: string;
    messageId: string;
    inReplyTo?:string;
    threadId?:string;
};

export type TransportInboundEvent = {
    id: string;
    threadId: string;
    messageId: string;
    from: string;
    to: string[];
    receivedAt: string;
    kind: 'reply' | 'hard_bounce';
    text: string;
    inReplyTo?: string | null;
    failedRecipient?: string | null;
    originalMessageId?: string | null;
};

export type PollThreadRequest = {
    threadId: string;
    sender: string;
    recipient: string;
    since: string;
    maxResults: number;
};

export interface MailTransport {
    readonly channel: 'gmail';
    readonly mode: 'mock' | 'live';
    send(message: TransportMessage): Promise<{ id: string; threadId: string }>;
    findSentByMessageId(messageId: string, maxResults: number): Promise<
        { status: 'found'; id: string; threadId: string } |
        { status: 'absent' } |
        { status: 'unknown' }
    >;
    pollThread(request: PollThreadRequest): Promise<
        { status: 'ok'; events: TransportInboundEvent[] } |
        { status: 'unknown'; events: [] }
    >;
}

export type VerifySignedMailGrant = (grant: SignedMailGrant) => boolean;

type OutboxRow = MailDraft & {
    scope: Scope;
    kind: 'initial' | 'follow_up';
    parentOutboxId: string | null;
    revision: number;
    contentHash: string;
    draftHash: string;
    messageId: string;
    status: OutboxStatus;
    grantId: string | null;
    providerMessageId: string | null;
    threadId: string | null;
    claimedAt: string | null;
    providerAcceptedAt: string | null;
    lastPolledAt: string | null;
    followUpBlocked: boolean;
    authorityFailure: MailAuthorityFailure | null;
    reconciliation: { attempts: number; lastStatus: 'never' | 'found' | 'absent' | 'unknown'; lastAt: string | null };
};

const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function iso(value: unknown, code = 'INVALID_TIME'): string {
    requireThat(typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value)), code);
    return value;
}

function email(value: unknown): string {
    requireThat(typeof value === 'string' && value === value.trim() && !/[\r\n]/.test(value) && value.length <= 254 && EMAIL.test(value), 'INVALID_EMAIL');
    return value.toLowerCase();
}

function nonempty(value: unknown, code: string, maximum: number): asserts value is string {
    requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !value.includes('\u0000'), code);
}

function sourceUri(value: unknown): asserts value is string {
    nonempty(value, 'INVALID_SOURCE_URI', 2048);
    requireThat(/^https:\/\//i.test(value) || /^urn:midas:owner-record:/i.test(value), 'INVALID_SOURCE_URI');
}

function exactKeys(value: any, keys: string[], code: string): void {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','), code);
}

export function recipientEvidenceHash(evidence: Omit<RecipientEvidence, 'evidenceHash'>): string {
    return hash(evidence);
}

function validateEvidence(value: RecipientEvidence, recipient: string): RecipientEvidence {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'RECIPIENT_EVIDENCE_REQUIRED');
    requireThat(Object.keys(value).sort().join(',') === ['address', 'addressKind', 'eligibility', 'eligibilityBasis', 'evidenceHash', 'policyVersion', 'sourceContentHash', 'sourceId', 'sourceObservedAt', 'sourceUri'].sort().join(','), 'INVALID_RECIPIENT_EVIDENCE');
    identifier(value.sourceId);
    sourceUri(value.sourceUri);
    iso(value.sourceObservedAt, 'INVALID_EVIDENCE_TIME');
    requireThat(SHA256.test(value.sourceContentHash), 'INVALID_SOURCE_CONTENT_HASH');
    requireThat(email(value.address) === recipient, 'RECIPIENT_EVIDENCE_MISMATCH');
    requireThat(['published_business_contact', 'owner_supplied_verified'].includes(value.addressKind), 'UNSUPPORTED_ADDRESS_ORIGIN');
    requireThat(value.eligibility === 'eligible', 'RECIPIENT_NOT_ELIGIBLE');
    nonempty(value.eligibilityBasis, 'ELIGIBILITY_BASIS_REQUIRED', 1000);
    identifier(value.policyVersion);
    requireThat(SHA256.test(value.evidenceHash), 'INVALID_EVIDENCE_HASH');
    const { evidenceHash, ...source } = value;
    requireThat(evidenceHash === recipientEvidenceHash(source), 'RECIPIENT_EVIDENCE_HASH_MISMATCH');
    return { ...value, address: recipient };
}

function validateContent(value: MailContent): MailContent {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_MAIL_CONTENT');
    requireThat(Object.keys(value).sort().join(',') === ['claimIds', 'offerRef', 'subject', 'text'].sort().join(','), 'INVALID_MAIL_CONTENT');
    nonempty(value.subject, 'SUBJECT_REQUIRED', 998);
    requireThat(!/[\r\n]/.test(value.subject), 'INVALID_SUBJECT');
    nonempty(value.text, 'BODY_REQUIRED', 100_000);
    identifier(value.offerRef);
    requireThat(Array.isArray(value.claimIds) && value.claimIds.length > 0 && new Set(value.claimIds).size === value.claimIds.length, 'CLAIMS_REQUIRED');
    value.claimIds.forEach(identifier);
    return { subject: value.subject, text: value.text.replace(/\r?\n/g, '\n'), offerRef: value.offerRef, claimIds: [...value.claimIds] };
}

function normalizedDraft(draft: MailDraft): MailDraft & { kind: 'initial' | 'follow_up'; parentOutboxId: string | null } {
    requireThat(draft !== null && typeof draft === 'object' && !Array.isArray(draft), 'INVALID_MAIL_DRAFT');
    requireThat(Object.keys(draft).every(k => ['id', 'sender', 'recipient', 'evidence', 'content', 'kind', 'parentOutboxId'].includes(k)), 'INVALID_MAIL_DRAFT');
    identifier(draft.id);
    const sender = email(draft.sender), recipient = email(draft.recipient);
    requireThat(sender !== recipient, 'SENDER_IS_RECIPIENT');
    const kind = draft.kind ?? 'initial';
    requireThat(kind === 'initial' || kind === 'follow_up', 'INVALID_MAIL_KIND');
    const parentOutboxId = draft.parentOutboxId ?? null;
    if (kind === 'follow_up') {
        requireThat(typeof parentOutboxId === 'string', 'FOLLOW_UP_PARENT_REQUIRED');
        identifier(parentOutboxId);
    } else requireThat(parentOutboxId === null, 'INITIAL_HAS_PARENT');
    return { ...draft, sender, recipient, evidence: validateEvidence(draft.evidence, recipient), content: validateContent(draft.content), kind, parentOutboxId };
}

function contentHash(draft: Pick<MailDraft, 'sender' | 'recipient' | 'content'>): string {
    return hash({ sender: draft.sender, recipient: draft.recipient, content: draft.content });
}

function messageId(s: Scope, draft: MailDraft, revision: number): string {
    const domain = draft.sender.slice(draft.sender.lastIndexOf('@') + 1);
    return `<midas.${hash({ scope: s, id: draft.id, revision, contentHash: contentHash(draft) })}@${domain}>`;
}

function rowKey(s: Scope, id: string): string { return scopeKey(s) + '/' + id; }
function grantKey(s: Scope, id: string): string { return scopeKey(s) + '/' + id; }
function suppressionKey(s: Scope, recipient: string): string { return businessKey(s) + '/' + recipient; }

function envelopeItem(row: OutboxRow): MailEnvelopeItem {
    return { outboxId: row.id, revision: row.revision, sender: row.sender, recipient: row.recipient, contentHash: row.contentHash, evidenceHash: row.evidence.evidenceHash, offerRef: row.content.offerRef, claimIds: [...row.content.claimIds] };
}

function validateGrantShape(grant: SignedMailGrant): MailGrantPayload {
    exactKeys(grant, ['payload', 'signature'], 'INVALID_SIGNED_GRANT');
    exactKeys(grant.signature, ['algorithm', 'keyId', 'value'], 'INVALID_SIGNED_GRANT');
    for (const value of [grant.signature.algorithm, grant.signature.keyId, grant.signature.value]) nonempty(value, 'INVALID_SIGNATURE', 4096);
    const p = grant.payload;
    exactKeys(p, ['schemaVersion', 'grantId', 'batchId', 'scope', 'issuerPrincipalId', 'issuedAt', 'envelope'], 'INVALID_GRANT');
    requireThat(p?.schemaVersion === 'mail-grant-v1', 'INVALID_GRANT_VERSION');
    exactKeys(p.envelope, ['version', 'channel', 'items', 'expiresAt', 'maxVolume', 'cadence', 'exceptionRules'], 'INVALID_GRANT_ENVELOPE');
    exactKeys(p.envelope.cadence, ['minimumIntervalSeconds', 'maxFollowUpsPerThread'], 'INVALID_GRANT_ENVELOPE');
    exactKeys(p.envelope.exceptionRules, ['stopOnAnyReply', 'suppressOnOptOut', 'suppressOnHardBounce'], 'INVALID_GRANT_ENVELOPE');
    identifier(p.grantId); identifier(p.batchId); identifier(p.issuerPrincipalId); identifier(p.envelope.version);
    iso(p.issuedAt, 'INVALID_ISSUED_AT'); iso(p.envelope.expiresAt, 'INVALID_EXPIRY');
    requireThat(p.envelope.channel === 'gmail', 'INVALID_CHANNEL');
    safeInteger(p.envelope.maxVolume, 1);
    safeInteger(p.envelope.cadence.minimumIntervalSeconds);
    safeInteger(p.envelope.cadence.maxFollowUpsPerThread);
    requireThat(p.envelope.exceptionRules?.stopOnAnyReply === true && p.envelope.exceptionRules.suppressOnOptOut === true && p.envelope.exceptionRules.suppressOnHardBounce === true, 'UNSAFE_EXCEPTION_RULES');
    requireThat(Array.isArray(p.envelope.items) && p.envelope.items.length > 0 && p.envelope.items.length === p.envelope.maxVolume, 'EXACT_BATCH_VOLUME_REQUIRED');
    requireThat(new Set(p.envelope.items.map(i => i.outboxId)).size === p.envelope.items.length, 'DUPLICATE_BATCH_ITEM');
    for (const item of p.envelope.items) {
        exactKeys(item, ['outboxId', 'revision', 'sender', 'recipient', 'contentHash', 'evidenceHash', 'offerRef', 'claimIds'], 'INVALID_GRANT_ITEM');
        identifier(item.outboxId); safeInteger(item.revision, 1); email(item.sender); email(item.recipient); identifier(item.offerRef);
        requireThat(SHA256.test(item.contentHash) && SHA256.test(item.evidenceHash), 'INVALID_ITEM_HASH');
        requireThat(Array.isArray(item.claimIds) && item.claimIds.length > 0 && new Set(item.claimIds).size === item.claimIds.length, 'CLAIMS_REQUIRED');
        item.claimIds.forEach(identifier);
    }
    return p;
}

export class MailOutbox {
    readonly store: StateStore;
    readonly transport: MailTransport;
    private readonly verifyGrant: VerifySignedMailGrant;
    constructor(store: StateStore, transport: MailTransport, verifyGrant: VerifySignedMailGrant) {
        requireThat(transport?.channel === 'gmail' && ['mock', 'live'].includes(transport.mode), 'INVALID_MAIL_TRANSPORT');
        requireThat(typeof verifyGrant === 'function', 'TRUSTED_GRANT_VERIFIER_REQUIRED');
        this.store = store;
        this.transport = transport;
        this.verifyGrant = verifyGrant;
    }

    enqueue(principal: Principal, s: Scope, input: MailDraft): any {
        assertScope(principal, s, 'operate');
        const draft = normalizedDraft(input);
        requireThat(draft.evidence.policyVersion === s.dataPolicyVersion, 'RECIPIENT_POLICY_MISMATCH');
        return this.store.transaction(() => {
            requireThat(!this.store.get('mail-outbox', rowKey(s, draft.id)), 'OUTBOX_ITEM_EXISTS');
            requireThat(!this.store.get('mail-suppression', suppressionKey(s, draft.recipient)), 'RECIPIENT_SUPPRESSED');
            if (draft.kind === 'follow_up') this.assertFollowUpAllowed(s, draft);
            const revision = 1, cHash = contentHash(draft);
            const row: OutboxRow = { ...draft, scope: s, revision, contentHash: cHash, draftHash: hash({ ...draft, contentHash: cHash }), messageId: messageId(s, draft, revision), status: 'queued', grantId: null, providerMessageId: null, threadId: null, claimedAt: null, providerAcceptedAt: null, lastPolledAt: null, followUpBlocked: false, authorityFailure: null, reconciliation: { attempts: 0, lastStatus: 'never', lastAt: null } };
            const saved = this.store.put('mail-outbox', rowKey(s, row.id), row, null);
            this.store.event(s, 'mail_queued', { outboxId: row.id, revision, recipient: row.recipient, contentHash: cHash, evidenceHash: row.evidence.evidenceHash, actor: principal.id });
            return saved;
        });
    }

    revise(principal: Principal, s: Scope, id: string, changes: Pick<MailDraft, 'sender' | 'recipient' | 'evidence' | 'content'>): any {
        assertScope(principal, s, 'operate'); identifier(id);
        return this.store.transaction(() => {
            const old = this.getRow(s, id);
            requireThat(['queued', 'approved', 'revoked'].includes(old.status), 'MAIL_ALREADY_CLAIMED');
            const draft = normalizedDraft({ id, ...changes, kind: old.kind, parentOutboxId: old.parentOutboxId });
            requireThat(draft.evidence.policyVersion === s.dataPolicyVersion, 'RECIPIENT_POLICY_MISMATCH');
            requireThat(!this.store.get('mail-suppression', suppressionKey(s, draft.recipient)), 'RECIPIENT_SUPPRESSED');
            if (draft.kind === 'follow_up') this.assertFollowUpAllowed(s, draft);
            const revision = old.revision + 1, cHash = contentHash(draft);
            const next: OutboxRow = { ...old, ...draft, scope: s, revision, contentHash: cHash, draftHash: hash({ ...draft, contentHash: cHash }), messageId: messageId(s, draft, revision), status: 'queued', grantId: null, providerMessageId: null, threadId: null, claimedAt: null, providerAcceptedAt: null, lastPolledAt: null, followUpBlocked: false, authorityFailure: null, reconciliation: { attempts: 0, lastStatus: 'never', lastAt: null } };
            const saved = this.store.put('mail-outbox', rowKey(s, id), next, old._version);
            this.store.event(s, 'mail_revised', { outboxId: id, priorRevision: old.revision, revision, contentHash: cHash, evidenceHash: draft.evidence.evidenceHash, approvalInvalidated: old.grantId !== null, actor: principal.id });
            return saved;
        });
    }

    approvalRequest(principal: Principal, s: Scope, request: { grantId: string; batchId: string; outboxIds: string[]; issuedAt?: string; expiresAt: string; envelopeVersion: string; minimumIntervalSeconds?: number; maxFollowUpsPerThread?: number }): MailGrantPayload {
        assertScope(principal, s, 'approve');
        identifier(request.grantId); identifier(request.batchId); identifier(request.envelopeVersion);
        requireThat(Array.isArray(request.outboxIds) && request.outboxIds.length > 0 && new Set(request.outboxIds).size === request.outboxIds.length, 'INVALID_BATCH');
        request.outboxIds.forEach(identifier);
        const issuedAt = iso(request.issuedAt ?? new Date().toISOString(), 'INVALID_ISSUED_AT');
        const expiresAt = iso(request.expiresAt, 'INVALID_EXPIRY');
        requireThat(Date.parse(expiresAt) > Date.parse(issuedAt), 'INVALID_EXPIRY');
        const minimumIntervalSeconds = request.minimumIntervalSeconds ?? 0, maxFollowUpsPerThread = request.maxFollowUpsPerThread ?? 0;
        safeInteger(minimumIntervalSeconds); safeInteger(maxFollowUpsPerThread);
        const rows = request.outboxIds.map(id => this.getRow(s, id));
        requireThat(rows.every(r => r.status === 'queued'), 'BATCH_ITEM_NOT_QUEUED');
        return { schemaVersion: 'mail-grant-v1', grantId: request.grantId, batchId: request.batchId, scope: s, issuerPrincipalId: principal.id, issuedAt, envelope: { version: request.envelopeVersion, channel: 'gmail', items: rows.map(envelopeItem), expiresAt, maxVolume: rows.length, cadence: { minimumIntervalSeconds, maxFollowUpsPerThread }, exceptionRules: { stopOnAnyReply: true, suppressOnOptOut: true, suppressOnHardBounce: true } } };
    }

    approve(principal: Principal, s: Scope, signed: SignedMailGrant, now = Date.now()): any {
        assertScope(principal, s, 'approve');
        const payload = validateGrantShape(signed);
        requireThat(scopeKey(payload.scope) === scopeKey(s), 'SCOPE_DENIED');
        requireThat(payload.issuerPrincipalId === principal.id, 'WRONG_GRANT_ISSUER');
        requireThat(Date.parse(payload.issuedAt) <= now && Date.parse(payload.envelope.expiresAt) > now, 'APPROVAL_EXPIRED');
        requireThat(this.verifyGrant(signed) === true, 'INVALID_GRANT_SIGNATURE');
        return this.store.transaction(() => {
            requireThat(!this.store.get('mail-grant', grantKey(s, payload.grantId)), 'APPROVAL_ALREADY_EXISTS');
            const rows = payload.envelope.items.map(item => {
                const row = this.getRow(s, item.outboxId);
                requireThat(row.status === 'queued' && canonical(envelopeItem(row)) === canonical(item), 'WRONG_APPROVED_MAIL');
                requireThat(!this.store.get('mail-suppression', suppressionKey(s, row.recipient)), 'RECIPIENT_SUPPRESSED');
                return row;
            });
            const grant = { ...payload, signedHash: hash(signed), payloadHash: hash(payload), revoked: false, claimedCount: 0, lastClaimedAt: null };
            const saved = this.store.put('mail-grant', grantKey(s, payload.grantId), grant, null);
            for (const row of rows) this.store.put('mail-outbox', rowKey(s, row.id), { ...row, status: 'approved', grantId: payload.grantId }, row._version);
            this.store.record(s, 'mail-grant-' + payload.grantId, 'SignedMailGrant', { payload, signature: signed.signature, signedHash: hash(signed) });
            this.store.event(s, 'mail_batch_approved', { grantId: payload.grantId, batchId: payload.batchId, envelopeVersion: payload.envelope.version, itemCount: rows.length, expiresAt: payload.envelope.expiresAt, payloadHash: hash(payload), actor: principal.id });
            return saved;
        });
    }

    revoke(principal: Principal, s: Scope, grantId: string): any {
        assertScope(principal, s, 'approve'); identifier(grantId);
        return this.store.transaction(() => {
            const grant = this.store.get('mail-grant', grantKey(s, grantId));
            requireThat(grant, 'MAIL_GRANT_NOT_FOUND');
            if (grant.revoked) return grant;
            const saved = this.store.put('mail-grant', grantKey(s, grantId), { ...grant, revoked: true }, grant._version);
            for (const item of grant.envelope.items) {
                const row = this.getRow(s, item.outboxId);
                if (row.status === 'approved' && row.grantId === grantId) this.store.put('mail-outbox', rowKey(s, row.id), { ...row, status: 'revoked' }, row._version);
            }
            this.store.event(s, 'mail_batch_revoked', { grantId, actor: principal.id });
            return saved;
        });
    }

    async dispatch(principal: Principal, s: Scope, id: string, now = Date.now()): Promise<any> {
        assertScope(principal, s, 'operate'); identifier(id);
        const claimed = this.store.transaction(() => {
            const row = this.getRow(s, id);
            if (['dispatch_unknown', 'provider_accepted', 'replied', 'hard_bounced', 'authority_failed'].includes(row.status)) return { execute: false, row };
            requireThat(row.status === 'approved' && row.grantId, row.status === 'revoked' ? 'APPROVAL_REVOKED' : 'APPROVAL_REQUIRED');
            requireThat(!this.store.get('mail-suppression', suppressionKey(s, row.recipient)), 'RECIPIENT_SUPPRESSED');
            if (row.kind === 'follow_up') this.assertFollowUpAllowed(s, row);
            const grant = this.store.get('mail-grant', grantKey(s, row.grantId));
            requireThat(grant && !grant.revoked, grant?.revoked ? 'APPROVAL_REVOKED' : 'MAIL_GRANT_NOT_FOUND');
            requireThat(Date.parse(grant.envelope.expiresAt) > now, 'APPROVAL_EXPIRED');
            requireThat(grant.claimedCount < grant.envelope.maxVolume, 'MAIL_VOLUME_EXCEEDED');
            const exact = grant.envelope.items.find((item: MailEnvelopeItem) => item.outboxId === id);
            requireThat(exact && canonical(exact) === canonical(envelopeItem(row)), 'WRONG_APPROVED_MAIL');
            if (grant.lastClaimedAt) requireThat(now - Date.parse(grant.lastClaimedAt) >= grant.envelope.cadence.minimumIntervalSeconds * 1000, 'MAIL_CADENCE_LIMIT');
            if (row.kind === 'follow_up') requireThat(this.followUpCount(s, row.parentOutboxId!) < grant.envelope.cadence.maxFollowUpsPerThread, 'FOLLOW_UP_LIMIT');
            const claimedAt = new Date(now).toISOString();
            const saved = this.store.put('mail-outbox', rowKey(s, id), { ...row, status: 'dispatch_unknown', claimedAt }, row._version);
            this.store.put('mail-grant', grantKey(s, row.grantId), { ...grant, claimedCount: grant.claimedCount + 1, lastClaimedAt: claimedAt }, grant._version);
            this.store.event(s, 'mail_dispatch_claimed', { outboxId: id, grantId: row.grantId, messageId: row.messageId, contentHash: row.contentHash, status: 'unknown', actor: principal.id });
            return { execute: true, row: saved };
        });
        if (!claimed.execute) return claimed.row;
        const row = claimed.row as OutboxRow;
        try {
            const parent=row.parentOutboxId?this.getRow(s,row.parentOutboxId):null;
            const accepted = await this.transport.send({ outboxId: row.id, sender: row.sender, recipient: row.recipient, subject: row.content.subject, text: row.content.text, messageId: row.messageId,...(parent?{inReplyTo:parent.messageId,threadId:parent.threadId!}:{}) });
            nonempty(accepted?.id, 'INVALID_PROVIDER_ACKNOWLEDGEMENT', 512); nonempty(accepted?.threadId, 'INVALID_PROVIDER_ACKNOWLEDGEMENT', 512);
            return this.store.transaction(() => this.accept(s, id, accepted.id, accepted.threadId, new Date().toISOString(), 'send'));
        } catch (error) {
            const authority = permanentAuthorityFailure(error);
            if (authority) return this.recordAuthorityFailure(s, id, 'send', authority);
            return this.store.transaction(() => {
                const current = this.getRow(s, id);
                this.store.event(s, 'mail_dispatch_uncertain', { outboxId: id, messageId: current.messageId, errorCode: typeof (error as any)?.code === 'string' ? (error as any).code : 'TRANSPORT_ERROR', retryPermitted: false });
                return current;
            });
        }
    }

    async reconcile(principal: Principal, s: Scope, id: string, maxResults = 10): Promise<any> {
        assertScope(principal, s, 'operate'); identifier(id); safeInteger(maxResults, 1); requireThat(maxResults <= 50, 'RECONCILIATION_LIMIT');
        const row = this.getRow(s, id);
        if (['provider_accepted', 'replied', 'hard_bounced', 'authority_failed'].includes(row.status)) return row;
        requireThat(row.status === 'dispatch_unknown', 'RECONCILIATION_NOT_REQUIRED');
        let result: Awaited<ReturnType<MailTransport['findSentByMessageId']>>;
        try { result = await this.transport.findSentByMessageId(row.messageId, maxResults); }
        catch (error) {
            const authority = permanentAuthorityFailure(error);
            if (authority) return this.recordAuthorityFailure(s, id, 'reconcile', authority);
            result = { status: 'unknown' };
        }
        return this.store.transaction(() => {
            const current = this.getRow(s, id);
            if (current.status !== 'dispatch_unknown') return current;
            const at = new Date().toISOString();
            if (result.status === 'found') return this.accept(s, id, result.id, result.threadId, at, 'reconcile');
            const next = { ...current, reconciliation: { attempts: current.reconciliation.attempts + 1, lastStatus: result.status, lastAt: at } };
            const saved = this.store.put('mail-outbox', rowKey(s, id), next, current._version);
            this.store.event(s, 'mail_reconciliation_unresolved', { outboxId: id, messageId: current.messageId, result: result.status, retrySendPermitted: false });
            return saved;
        });
    }

    async poll(principal: Principal, s: Scope, id: string, maxResults = 20): Promise<any> {
        assertScope(principal, s, 'operate'); identifier(id); safeInteger(maxResults, 1); requireThat(maxResults <= 50, 'POLL_LIMIT');
        const row = this.getRow(s, id);
        if (row.status === 'authority_failed') return row;
        requireThat(['provider_accepted', 'replied', 'hard_bounced'].includes(row.status) && row.threadId, 'THREAD_NOT_AVAILABLE');
        let result: Awaited<ReturnType<MailTransport['pollThread']>>;
        try { result = await this.transport.pollThread({ threadId: row.threadId, sender: row.sender, recipient: row.recipient, since: row.claimedAt!, maxResults }); }
        catch (error) {
            const authority = permanentAuthorityFailure(error);
            if (authority) return this.recordAuthorityFailure(s, id, 'poll', authority);
            result = { status: 'unknown', events: [] };
        }
        if (result.status === 'unknown') {
            return this.store.transaction(() => { const current = this.getRow(s, id); this.store.event(s, 'mail_poll_uncertain', { outboxId: id, threadId: row.threadId }); return current; });
        }
        requireThat(result.events.length <= maxResults, 'TRANSPORT_POLL_OVERFLOW');
        return this.store.transaction(() => {
            let current = this.getRow(s, id);
            for (const event of result.events) current = this.applyInbound(s, current, event);
            const fresh = this.getRow(s, id);
            return this.store.put('mail-outbox', rowKey(s, id), { ...fresh, lastPolledAt: new Date().toISOString() }, fresh._version);
        });
    }

    status(principal: Principal, s: Scope, id?: string): any {
        assertScope(principal, s, 'read');
        if (id) { identifier(id); return this.publicStatus(this.getRow(s, id)); }
        const prefix = scopeKey(s) + '/';
        return this.store.db.prepare("SELECT body,version FROM entities WHERE kind='mail-outbox' AND substr(key,1,?)=? ORDER BY key").all(prefix.length, prefix).map((r: any) => this.publicStatus({ ...JSON.parse(String(r.body)), _version: Number(r.version) }));
    }

    private getRow(s: Scope, id: string): OutboxRow & { _version: number } {
        const row = this.store.get('mail-outbox', rowKey(s, id));
        requireThat(row, 'OUTBOX_ITEM_NOT_FOUND');
        return row;
    }

    private accept(s: Scope, id: string, providerMessageId: string, threadId: string, at: string, source: 'send' | 'reconcile'): any {
        const current = this.getRow(s, id);
        if (['provider_accepted', 'replied', 'hard_bounced'].includes(current.status)) {
            requireThat(current.providerMessageId === providerMessageId && current.threadId === threadId, 'PROVIDER_ACKNOWLEDGEMENT_CONFLICT');
            return current;
        }
        requireThat(current.status === 'dispatch_unknown', 'MAIL_NOT_CLAIMED');
        const next = { ...current, status: 'provider_accepted' as const, providerMessageId, threadId, providerAcceptedAt: at, reconciliation: source === 'reconcile' ? { attempts: current.reconciliation.attempts + 1, lastStatus: 'found' as const, lastAt: at } : current.reconciliation };
        const saved = this.store.put('mail-outbox', rowKey(s, id), next, current._version);
        this.store.event(s, 'mail_provider_accepted', { outboxId: id, providerMessageId, threadId, messageId: current.messageId, source, delivery: 'not_evidenced' });
        return saved;
    }

    private recordAuthorityFailure(s: Scope, id: string, operation: MailAuthorityFailure['operation'], failure: { httpStatus: 401 | 403 }): any {
        return this.store.transaction(() => {
            const current = this.getRow(s, id);
            if (current.status === 'authority_failed') return current;
            const at = new Date().toISOString();
            const authorityFailure: MailAuthorityFailure = { operation, code: 'GMAIL_AUTHORITY_REJECTED', httpStatus: failure.httpStatus, at, priorStatus: current.status };
            const saved = this.store.put('mail-outbox', rowKey(s, id), { ...current, status: 'authority_failed', authorityFailure }, current._version);
            this.store.event(s, 'mail_authority_failed', { outboxId: id, operation, code: authorityFailure.code, httpStatus: authorityFailure.httpStatus, retryPermitted: false });
            return saved;
        });
    }

    private applyInbound(s: Scope, row: OutboxRow & { _version: number }, event: TransportInboundEvent): OutboxRow & { _version: number } {
        nonempty(event.id, 'INVALID_INBOUND_EVENT', 512); nonempty(event.threadId, 'INVALID_INBOUND_EVENT', 512); nonempty(event.messageId, 'INVALID_INBOUND_EVENT', 998); iso(event.receivedAt, 'INVALID_INBOUND_TIME');
        requireThat(event.threadId === row.threadId, 'INBOUND_THREAD_MISMATCH');
        requireThat(Date.parse(event.receivedAt) >= Date.parse(row.claimedAt!), 'STALE_INBOUND_EVENT');
        requireThat(typeof event.text === 'string' && event.text.length <= 100_000, 'INVALID_INBOUND_EVENT');
        let disposition: 'reply' | 'opt_out' | 'hard_bounce';
        if (event.kind === 'reply') {
            requireThat(email(event.from) === row.recipient && event.to.map(email).includes(row.sender), 'INBOUND_PARTICIPANT_MISMATCH');
            disposition = explicitOptOut(event.text) ? 'opt_out' : 'reply';
        } else {
            requireThat(event.failedRecipient !== null && event.failedRecipient !== undefined && email(event.failedRecipient) === row.recipient, 'BOUNCE_RECIPIENT_MISMATCH');
            if (event.originalMessageId !== row.messageId) return this.getRow(s, row.id);
            disposition = 'hard_bounce';
        }
        const recorded = this.store.get('mail-inbound-event', rowKey(s, event.id));
        if (recorded) requireThat(recorded.providerMessageId === event.messageId && recorded.disposition === disposition && recorded.threadId === event.threadId, 'INBOUND_EVENT_CONFLICT');
        else this.store.put('mail-inbound-event', rowKey(s, event.id), { scope: s, outboxId: row.id, providerEventId: event.id, providerMessageId: event.messageId, threadId:event.threadId, disposition, receivedAt: event.receivedAt, from:event.from,to:event.to, text:event.text.slice(0,20000),textTruncated:event.text.length>20000, contentTrustedAsInstruction:false,untrustedContentHash: hash(event.text) }, null);
        if (disposition === 'opt_out' || disposition === 'hard_bounce') this.suppress(s, row.recipient, disposition, event.id, event.receivedAt);
        const nextStatus: OutboxStatus = disposition === 'hard_bounce' ? 'hard_bounced' : 'replied';
        const fresh = this.getRow(s, row.id);
        const saved = this.store.put('mail-outbox', rowKey(s, row.id), { ...fresh, status: nextStatus, followUpBlocked: true }, fresh._version);
        if (!recorded) this.store.event(s, 'mail_inbound_recorded', { outboxId: row.id, providerEventId: event.id, disposition, threadId: event.threadId, followUpBlocked: true, contentTrustedAsInstruction: false });
        return saved;
    }

    private suppress(s: Scope, recipient: string, reason: 'opt_out' | 'hard_bounce', eventId: string, at: string): void {
        const key = suppressionKey(s, recipient), old = this.store.get('mail-suppression', key);
        if (old) return;
        this.store.put('mail-suppression', key, { tenantId: s.tenantId, businessId: s.businessId, recipient, reason, eventId, at }, null);
        this.store.event(s, 'mail_recipient_suppressed', { recipient, reason, providerEventId: eventId });
    }

    private assertFollowUpAllowed(s: Scope, draft: Pick<MailDraft, 'sender' | 'recipient'> & { parentOutboxId: string | null }): void {
        const parent = this.getRow(s, draft.parentOutboxId!);
        requireThat(parent.kind==='initial','FOLLOW_UP_MUST_REFERENCE_ORIGINAL');
        requireThat(parent.sender === draft.sender && parent.recipient === draft.recipient, 'FOLLOW_UP_PARTICIPANT_MISMATCH');
        requireThat(parent.status === 'provider_accepted' && !parent.followUpBlocked, 'FOLLOW_UP_BLOCKED');
    }

    private followUpCount(s: Scope, parentId: string): number {
        const prefix = scopeKey(s) + '/';
        const rows = this.store.db.prepare("SELECT body FROM entities WHERE kind='mail-outbox' AND substr(key,1,?)=?").all(prefix.length, prefix) as any[];
        return rows.map(r => JSON.parse(String(r.body))).filter(r => r.kind === 'follow_up' && r.parentOutboxId === parentId && ['dispatch_unknown', 'provider_accepted', 'replied', 'hard_bounced'].includes(r.status)).length;
    }

    private publicStatus(row: OutboxRow & { _version: number }): any {
        const delivery = row.status === 'replied' ? 'evidenced_by_reply' : row.status === 'hard_bounced' ? 'failed' : 'not_evidenced';
        return { ...row, authorityFailure: row.authorityFailure ?? null, delivery };
    }
}

function explicitOptOut(text: string): boolean {
    return /(?:^|\b)(unsubscribe|opt[ -]?out|remove me|do not contact|don't contact|stop emailing)(?:\b|$)/i.test(text);
}

function mimeSubject(subject: string): string {
    return /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

export function rawRfcMessage(message: Pick<TransportMessage, 'sender' | 'recipient' | 'subject' | 'text' | 'messageId'|'inReplyTo'>, date = new Date()): string {
    const sender = email(message.sender), recipient = email(message.recipient);
    requireThat(/^<[^<>\r\n]+@[^<>\r\n]+>$/.test(message.messageId), 'INVALID_MESSAGE_ID');
    const subject = validateContent({ subject: message.subject, text: message.text, offerRef: 'mail', claimIds: ['mail'] }).subject;
    requireThat(Number.isFinite(date.getTime()), 'INVALID_TIME');
    const body = message.text.replace(/\r?\n/g, '\r\n');
    if(message.inReplyTo)requireThat(/^<[^<>\r\n]+@[^<>\r\n]+>$/.test(message.inReplyTo),'INVALID_REPLY_MESSAGE_ID');
    return [`From: ${sender}`, `To: ${recipient}`, `Subject: ${mimeSubject(subject)}`, `Date: ${date.toUTCString()}`, `Message-ID: ${message.messageId}`,...(message.inReplyTo?[`In-Reply-To: ${message.inReplyTo}`,`References: ${message.inReplyTo}`]:[]), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
}

export type OAuthCredential = {
    type: 'oauth2';
    accountEmail: string;
    accessToken: string;
    expiresAt: string;
    scopes: string[];
};

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<any>;

export const GMAIL_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

export class GmailTransportError extends Error {
    readonly code: 'GMAIL_AUTHORITY_REJECTED' | 'GMAIL_REQUEST_FAILED' | 'GMAIL_RESPONSE_TOO_LARGE' | 'GMAIL_RESPONSE_READ_FAILED' | 'GMAIL_INVALID_RESPONSE';
    readonly httpStatus: number | null;
    readonly permanent: boolean;
    constructor(code: GmailTransportError['code'], httpStatus: number | null = null, permanent = false) {
        super(code);
        this.name = 'GmailTransportError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.permanent = permanent;
    }
}

function permanentAuthorityFailure(error: unknown): { httpStatus: 401 | 403 } | null {
    const value = error as Partial<GmailTransportError> | null;
    return value?.code === 'GMAIL_AUTHORITY_REJECTED' && value.permanent === true && (value.httpStatus === 401 || value.httpStatus === 403)
        ? { httpStatus: value.httpStatus }
        : null;
}

export class GmailRestTransport implements MailTransport {
    readonly channel = 'gmail' as const;
    readonly mode = 'live' as const;
    private readonly credential: () => Promise<OAuthCredential> | OAuthCredential;
    private readonly fetcher: FetchLike;
    private readonly expectedSender: string;
    private readonly endpoint: string;
    constructor(options: { expectedSender: string; credential: () => Promise<OAuthCredential> | OAuthCredential; fetch: FetchLike; endpoint?: string }) {
        this.expectedSender = email(options.expectedSender);
        requireThat(typeof options.credential === 'function', 'TRUSTED_OAUTH_CALLBACK_REQUIRED');
        requireThat(typeof options.fetch === 'function', 'INJECTED_FETCH_REQUIRED');
        this.credential = options.credential;
        this.fetcher = options.fetch;
        this.endpoint = options.endpoint ?? 'https://gmail.googleapis.com/gmail/v1/users/me';
        requireThat(/^https:\/\//.test(this.endpoint) && !this.endpoint.endsWith('/'), 'INVALID_GMAIL_ENDPOINT');
    }
    async send(message: TransportMessage): Promise<{ id: string; threadId: string }> {
        requireThat(email(message.sender) === this.expectedSender, 'OAUTH_SENDER_MISMATCH');
        const headers = await this.headers('send');
        const raw = Buffer.from(rawRfcMessage(message), 'utf8').toString('base64url');
        const response = await this.fetcher(this.endpoint + '/messages/send', { method: 'POST', headers, body: canonical({ raw,...(message.threadId?{threadId:message.threadId}:{}) }) });
        const body = await this.response(response);
        nonempty(body.id, 'INVALID_PROVIDER_ACKNOWLEDGEMENT', 512); nonempty(body.threadId, 'INVALID_PROVIDER_ACKNOWLEDGEMENT', 512);
        return { id: body.id, threadId: body.threadId };
    }
    async findSentByMessageId(messageIdValue: string, maxResults: number): Promise<{ status: 'found'; id: string; threadId: string } | { status: 'absent' } | { status: 'unknown' }> {
        safeInteger(maxResults, 1); requireThat(maxResults <= 50, 'RECONCILIATION_LIMIT');
        const headers = await this.headers('read');
        const params = new URLSearchParams({ q: `rfc822msgid:${messageIdValue}`, maxResults: String(maxResults), includeSpamTrash: 'true' });
        params.append('labelIds', 'SENT');
        const list = await this.response(await this.fetcher(this.endpoint + '/messages?' + params, { method: 'GET', headers }));
        const matches: { id: string; threadId: string }[] = [];
        for (const ref of Array.isArray(list.messages) ? list.messages.slice(0, maxResults) : []) {
            nonempty(ref.id, 'INVALID_GMAIL_RESPONSE', 512);
            const query = new URLSearchParams({ format: 'metadata' }); query.append('metadataHeaders', 'Message-ID');
            const detail = await this.response(await this.fetcher(this.endpoint + '/messages/' + encodeURIComponent(ref.id) + '?' + query, { method: 'GET', headers }));
            const found = header(detail, 'Message-ID');
            if (found === messageIdValue && Array.isArray(detail.labelIds) && detail.labelIds.includes('SENT')) matches.push({ id: String(detail.id), threadId: String(detail.threadId) });
        }
        return matches.length === 1 ? { status: 'found', ...matches[0] } : matches.length === 0 ? { status: 'absent' } : { status: 'unknown' };
    }
    async pollThread(request: PollThreadRequest): Promise<{ status: 'ok'; events: TransportInboundEvent[] } | { status: 'unknown'; events: [] }> {
        nonempty(request.threadId, 'INVALID_THREAD_ID', 512); email(request.sender); email(request.recipient); iso(request.since, 'INVALID_POLL_TIME'); safeInteger(request.maxResults, 1); requireThat(request.maxResults <= 50, 'POLL_LIMIT');
        requireThat(email(request.sender) === this.expectedSender, 'OAUTH_SENDER_MISMATCH');
        const headers = await this.headers('read');
        const params = new URLSearchParams({ format: 'metadata' });
        for (const name of ['From', 'To', 'Message-ID', 'In-Reply-To', 'References', 'Content-Type']) params.append('metadataHeaders', name);
        const thread = await this.response(await this.fetcher(this.endpoint + '/threads/' + encodeURIComponent(request.threadId) + '?' + params, { method: 'GET', headers }));
        requireThat(thread.id === request.threadId && Array.isArray(thread.messages), 'INVALID_GMAIL_RESPONSE');
        const candidates = thread.messages.filter((message: any) => Number(message.internalDate) >= Date.parse(request.since)).slice(-request.maxResults), events: TransportInboundEvent[] = [];
        for (const metadata of candidates) {
            nonempty(metadata.id, 'INVALID_GMAIL_RESPONSE', 512);
            const detail = await this.response(await this.fetcher(this.endpoint + '/messages/' + encodeURIComponent(metadata.id) + '?format=full', { method: 'GET', headers }));
            requireThat(detail.threadId === request.threadId, 'INVALID_GMAIL_RESPONSE');
            const message = detail;
            const from = parseAddress(header(message, 'From')), to = parseAddressList(header(message, 'To'));
            if (!from || to.length === 0) continue;
            if (from === this.expectedSender) continue;
            const body = messageText(message), contentType = header(message, 'Content-Type').toLowerCase();
            const bounce = /(?:mailer-daemon|postmaster)@/i.test(from) && (/delivery-status|multipart\/report/.test(contentType) || /delivery (?:failed|failure)|undeliverable|permanent failure/i.test(message.snippet ?? body));
            events.push({ id: String(message.id), threadId: String(message.threadId), messageId: header(message, 'Message-ID'), from, to, receivedAt: new Date(Number(message.internalDate)).toISOString(), kind: bounce ? 'hard_bounce' : 'reply', text: body || String(message.snippet ?? ''), inReplyTo: header(message, 'In-Reply-To') || null, failedRecipient: bounce ? extractFailedRecipient(body) : null, originalMessageId: bounce ? extractOriginalMessageId(message, body) : null });
        }
        return { status: 'ok', events };
    }
    private async headers(operation: 'send' | 'read'): Promise<Record<string, string>> {
        const credential = await this.credential();
        requireThat(credential?.type === 'oauth2' && email(credential.accountEmail) === this.expectedSender, 'INVALID_OAUTH_CREDENTIAL');
        nonempty(credential.accessToken, 'INVALID_OAUTH_CREDENTIAL', 16_384); requireThat(!/[\r\n]/.test(credential.accessToken), 'INVALID_OAUTH_CREDENTIAL');
        requireThat(Date.parse(iso(credential.expiresAt, 'INVALID_OAUTH_CREDENTIAL')) > Date.now(), 'OAUTH_CREDENTIAL_EXPIRED');
        requireThat(Array.isArray(credential.scopes), 'INVALID_OAUTH_CREDENTIAL');
        const allowed = operation === 'send' ? ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'] : ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'];
        requireThat(credential.scopes.some(s => allowed.includes(s)), operation === 'send' ? 'GMAIL_SEND_SCOPE_REQUIRED' : 'GMAIL_READ_SCOPE_REQUIRED');
        return { Authorization: 'Bearer ' + credential.accessToken, Accept: 'application/json', 'Content-Type': 'application/json' };
    }
    private async response(response: any): Promise<any> {
        if (!response || typeof response.ok !== 'boolean' || !Number.isInteger(response.status)) throw new GmailTransportError('GMAIL_INVALID_RESPONSE');
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new GmailTransportError('GMAIL_AUTHORITY_REJECTED', response.status, true);
            throw new GmailTransportError('GMAIL_REQUEST_FAILED', response.status);
        }
        const declaredValue = response.headers?.get?.('content-length');
        if (declaredValue !== null && declaredValue !== undefined && declaredValue !== '') {
            const declared = Number(declaredValue);
            if (!Number.isSafeInteger(declared) || declared < 0) throw new GmailTransportError('GMAIL_INVALID_RESPONSE', response.status);
            if (declared > GMAIL_RESPONSE_MAX_BYTES) throw new GmailTransportError('GMAIL_RESPONSE_TOO_LARGE', response.status);
        }
        const reader = response.body?.getReader?.();
        if (!reader || typeof reader.read !== 'function') throw new GmailTransportError('GMAIL_INVALID_RESPONSE', response.status);
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
            while (true) {
                const part = await reader.read();
                if (!part || typeof part.done !== 'boolean') throw new GmailTransportError('GMAIL_RESPONSE_READ_FAILED', response.status);
                if (part.done) break;
                if (!(part.value instanceof Uint8Array)) throw new GmailTransportError('GMAIL_RESPONSE_READ_FAILED', response.status);
                total += part.value.byteLength;
                if (total > GMAIL_RESPONSE_MAX_BYTES) {
                    await reader.cancel?.().catch?.(() => undefined);
                    throw new GmailTransportError('GMAIL_RESPONSE_TOO_LARGE', response.status);
                }
                chunks.push(part.value);
            }
        } catch (error) {
            if (error instanceof GmailTransportError) throw error;
            throw new GmailTransportError('GMAIL_RESPONSE_READ_FAILED', response.status);
        } finally {
            reader.releaseLock?.();
        }
        try {
            const parsed = JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total).toString('utf8'));
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new GmailTransportError('GMAIL_INVALID_RESPONSE', response.status);
            return parsed;
        } catch (error) {
            if (error instanceof GmailTransportError) throw error;
            throw new GmailTransportError('GMAIL_INVALID_RESPONSE', response.status);
        }
    }
}

function header(message: any, name: string): string {
    const headers = message?.payload?.headers;
    if (!Array.isArray(headers)) return '';
    return String(headers.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value ?? '').trim();
}

function parseAddress(value: string): string | null {
    const match = value.match(/<([^<>]+)>\s*$/) ?? value.match(/([^\s,<>]+@[^\s,<>]+)/);
    if (!match) return null;
    try { return email(match[1]); } catch { return null; }
}

function parseAddressList(value: string): string[] {
    return value.split(',').map(parseAddress).filter((x): x is string => x !== null);
}

function decodeBase64Url(value: string): string {
    try { return Buffer.from(value, 'base64url').toString('utf8'); } catch { return ''; }
}

function messageText(message: any): string {
    const visit = (part: any): string[] => {
        if (!part || typeof part !== 'object') return [];
        if (part.mimeType === 'text/plain' && typeof part.body?.data === 'string') return [decodeBase64Url(part.body.data)];
        return Array.isArray(part.parts) ? part.parts.flatMap(visit) : [];
    };
    return visit(message.payload).join('\n').slice(0, 100_000);
}

function extractFailedRecipient(text: string): string | null {
    const match = text.match(/(?:Final-Recipient|Original-Recipient):\s*(?:rfc822;\s*)?([^\s;]+)/i);
    return match ? parseAddress(match[1]) : null;
}

function extractOriginalMessageId(message: any, text: string): string | null {
    const referenced = header(message, 'In-Reply-To') || header(message, 'References');
    const match = (referenced + '\n' + text).match(/<[^<>\s]+@[^<>\s]+>/);
    return match?.[0] ?? null;
}

export class MockMailTransport implements MailTransport {
    readonly channel = 'gmail' as const;
    readonly mode = 'mock' as const;
    readonly sent = new Map<string, { id: string; threadId: string; message: TransportMessage }>();
    readonly inbound = new Map<string, TransportInboundEvent[]>();
    sendCalls = 0;
    fault: 'none' | 'timeout_before_accept' | 'timeout_after_accept' = 'none';
    async send(message: TransportMessage): Promise<{ id: string; threadId: string }> {
        this.sendCalls++;
        if (this.fault === 'timeout_before_accept') throw Object.assign(new Error('MOCK_TIMEOUT'), { code: 'MOCK_TIMEOUT' });
        const accepted = { id: 'mock-message-' + hash(message).slice(0, 16), threadId: 'mock-thread-' + hash({ sender: message.sender, recipient: message.recipient, outboxId: message.outboxId }).slice(0, 16), message: structuredClone(message) };
        this.sent.set(message.messageId, accepted);
        if (this.fault === 'timeout_after_accept') throw Object.assign(new Error('MOCK_TIMEOUT'), { code: 'MOCK_TIMEOUT' });
        return { id: accepted.id, threadId: accepted.threadId };
    }
    async findSentByMessageId(id: string, maxResults: number): Promise<{ status: 'found'; id: string; threadId: string } | { status: 'absent' }> {
        safeInteger(maxResults, 1);
        const found = this.sent.get(id);
        return found ? { status: 'found', id: found.id, threadId: found.threadId } : { status: 'absent' };
    }
    async pollThread(request: PollThreadRequest): Promise<{ status: 'ok'; events: TransportInboundEvent[] }> {
        safeInteger(request.maxResults, 1);
        return { status: 'ok', events: structuredClone((this.inbound.get(request.threadId) ?? []).filter(e => Date.parse(e.receivedAt) >= Date.parse(request.since)).slice(-request.maxResults)) };
    }
    addInbound(event: TransportInboundEvent): void {
        const list = this.inbound.get(event.threadId) ?? [];
        list.push(structuredClone(event)); this.inbound.set(event.threadId, list);
    }
}
