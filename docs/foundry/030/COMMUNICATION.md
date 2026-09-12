# Mission 030 communication boundary

Status: implemented and verified offline on September 12, 2026. No Gmail credential was read, no provider call was made, and no message was sent. The development assistant's Gmail connector is not a MIDAS runtime identity and is not used by this module.

## Operational result

`packages/foundry/src/operations/mail.ts` provides a persistent email outbox, an exact-batch authority gate, a Gmail REST transport, a separate programmable mock transport, conservative uncertain-send recovery, bounded inbound handling, and durable business-level suppression.

The design deliberately makes one availability tradeoff. MIDAS persists `dispatch_unknown` and consumes the batch action before it begins the provider request. A process loss before the request can therefore hold a message that was never sent. This is preferable to an unapproved duplicate: neither restart nor a negative reconciliation search permits another send. An operator must resolve or replace that work under a new version and approval.

The public integration surface is:

```ts
const mail = new MailOutbox(store, transport, verifySignedGrant);

mail.enqueue(operator, scope, draft);
mail.revise(operator, scope, outboxId, correctedDraft);
const unsignedPayload = mail.approvalRequest(owner, scope, exactBatch);
mail.approve(owner, scope, externallySignedGrant);
mail.revoke(owner, scope, grantId);
await mail.dispatch(operator, scope, outboxId);
await mail.reconcile(operator, scope, outboxId);
await mail.poll(operator, scope, outboxId, 20);
mail.status(reader, scope, outboxId);
```

`approvalRequest` only materializes the exact unsigned bytes that an owner-facing root can review and sign. This module has no signing key, signing helper, default approval, environment-variable credential lookup, global-fetch fallback, provider retry, or broad mailbox scan.

## Authority and recipient evidence

Every draft requires a recipient-evidence object. It binds the exact normalized address to a source ID, HTTPS or owner-record URI, observation time, retrieved source-content hash, allowed source kind, eligibility basis, policy version, and SHA-256 evidence hash. Accepted source kinds are `published_business_contact` and `owner_supplied_verified`; a guessed or generated address has no representable eligible source kind. The evidence hash is recomputed before queueing. The evidence policy version must equal the run's data-policy version.

The signed `mail-grant-v1` payload binds:

- tenant, business, run, data policy, and fixture scope;
- issuer, issue time, grant ID, and batch ID;
- envelope version and Gmail channel;
- every exact outbox ID, revision, sender, recipient, content hash, recipient-evidence hash, offer reference, and claim ID;
- expiry, exact maximum volume, minimum interval, maximum follow-ups, and mandatory stop/suppression rules.

`maxVolume` must equal the number of exact items. This release does not interpret a recipient class or allow a future message to consume spare volume. That keeps the first live request reviewable. A qualifying-class envelope can be added later as a new schema once its deterministic eligibility predicate and exception handling have their own evidence.

Approval requires both an in-scope principal with `approve` permission and a caller-supplied trusted signature verifier. The root owns the signing identity and trusted verification boundary. The module never creates or treats an unsigned payload as authority. Revision of any unclaimed draft increments its revision, changes its stable RFC `Message-ID`, returns it to `queued`, clears its grant, and leaves the historical grant and event trail intact. Revocation stops all still-unclaimed items. Dispatch checks scope, exact bytes, signature-derived grant, expiry, volume, cadence, follow-up count, and suppression again inside one immediate SQLite transaction.

## State and evidence meanings

| State | Established fact | Explicitly not established |
|---|---|---|
| `queued` | A source-backed draft is durable. | Owner approval or provider activity. |
| `approved` | The exact current revision is covered by a verified signed grant. | Dispatch or delivery. |
| `revoked` | Its unclaimed grant was revoked. | Provider activity. |
| `dispatch_unknown` | The one allowed dispatch claim was durably consumed. | Whether Gmail accepted, rejected, or never received it. |
| `provider_accepted` | Gmail returned an ID/thread, or exact SENT reconciliation found one stable `Message-ID`. | Delivery, reading, interest, qualification, or revenue. |
| `replied` | A bounded exact-thread event matched the recipient and sender; duplicate provider events are idempotent. | Commercial qualification. |
| `hard_bounced` | A correlated delivery-status event named the exact recipient and original `Message-ID`. | A general conclusion about the business or offer. |

The status view exposes delivery separately. Provider acceptance and uncertain receipts produce `not_evidenced`; a correlated reply produces `evidenced_by_reply`; a correlated hard bounce produces `failed`. An accepted provider ID is never relabeled as delivery.

Any valid reply sets `followUpBlocked`, even when its text is hostile or irrelevant. The inbound event retains its matched sender/recipients, a bounded 20,000-character text copy, truncation flag, and full-content hash so the owner and later feedback work can inspect the evidence. It is explicitly marked untrusted as instruction. A narrow explicit phrase detector classifies opt-outs. Opt-outs and hard bounces create a suppression record keyed by tenant, business, and normalized recipient, so another run for the same business cannot queue or dispatch that address. Duplicate inbound IDs do not create another event or change the result.

## Gmail transport

Google's current official documentation says `users.messages.send` accepts an RFC 2822 MIME message encoded as base64url in the message resource's `raw` field and returns a Gmail Message resource. The Message resource contains provider `id` and `threadId`; those fields acknowledge provider state rather than downstream delivery. See [Create and send email messages](https://developers.google.com/workspace/gmail/api/guides/sending), [users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), and the [Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages).

`GmailRestTransport` builds a plain-text RFC message with a stable, revision-specific `Message-ID`, encoded subject, CRLF headers/body, and no CC/BCC surface. Header injection is rejected. The transport calls only the injected HTTPS endpoint through an injected fetch function.

For uncertain recovery, Gmail's `messages.list` supports the Gmail search query syntax, including `rfc822msgid:<message-id>`, and can restrict results to the `SENT` label. A list result contains only IDs/thread IDs, so this adapter retrieves metadata for every bounded candidate and requires one exact `Message-ID` header plus `SENT`. Zero matches remain `dispatch_unknown`; multiple exact matches are also unknown. See [users.messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Search and filter messages](https://developers.google.com/workspace/gmail/api/guides/filtering), and [users.messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get).

For replies, `users.threads.get` offers exact thread retrieval and metadata/full formats. The adapter first retrieves headers for the exact acknowledged thread, filters by the dispatch time, takes at most the requested limit (maximum 50), and then retrieves full bodies only for those candidates. Core processing again requires exact thread ID and exact sender/recipient participation; a bounce additionally requires the failed recipient and original stable `Message-ID`. See [users.threads.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get).

The constructor requires a trusted OAuth callback that returns the expected account address, unexpired OAuth access token, and declared scopes. It does not read a file, process environment, browser session, assistant connector, or application default credential. Sending accepts `gmail.send`, `gmail.modify`, or `mail.google.com`; inbound/reconciliation accepts `gmail.readonly`, `gmail.modify`, or `mail.google.com`. Google's scope guide classifies `gmail.send` as sensitive and `gmail.readonly`/`gmail.modify` as restricted, advises choosing the narrowest scopes, and describes verification obligations for user-data applications. A live MIDAS root will usually need separate `gmail.send` plus `gmail.readonly`, or the broader `gmail.modify`, based on the approved product use. See [Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and the [Google Workspace API user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

## Root integration contract

A live root must provide all of the following before constructing `GmailRestTransport`:

1. An owner-selected sender account and Google Cloud project with the Gmail API enabled.
2. A correctly configured OAuth consent/client flow and secure token storage outside this module.
3. A trusted credential callback returning only the selected account's current token material and scopes.
4. An injected fetch implementation with its own request timeout and network policy.
5. A trusted owner-signature verifier and an actually signed `SignedMailGrant`; the prepared unsigned payload is not enough.
6. A bounded scheduler that calls `dispatch`, `reconcile`, and `poll` while respecting the durable status instead of retrying around it.

The smallest controlled live test should use one exact sourced recipient, one exact reviewed revision, one sender, one grant action, a short expiry, zero follow-ups, and no content outside the hash-bound offer and claims. It should separately authorize mailbox read scope because sending permission alone cannot reconcile or observe replies. Stop on an invalid credential/account identity, signature failure, stale revision, expiry, revocation, suppression, cadence/volume breach, uncertain reconciliation, malformed acknowledgement, participant/thread mismatch, or transport error.

No live grant or sender account is configured in this worktree. The owner-facing root should render the full unsigned payload and source evidence for review, sign only after explicit authorization, then preserve the returned provider/reply evidence without claiming delivery or economic success beyond what it proves.

## Offline verification

`test/operations-mail.test.ts` uses only `MockMailTransport` or an injected in-memory fetch. It verifies:

- rejection of guessed recipients, forged signatures, and altered grant claims;
- exact-batch approval plus revision invalidation;
- atomic concurrent dispatch with one transport call;
- durable restart recovery after timeout following a fake provider effect;
- a pre-effect timeout whose exact search miss remains unknown and is never resent;
- provider acceptance remaining distinct from delivery;
- duplicate reply idempotency and stop-on-any-reply behavior;
- persistent opt-out and hard-bounce suppression across restart and business runs;
- expiry and revocation before transport contact;
- base64url RFC construction, Unicode subject encoding, stable `Message-ID` reconciliation, injected OAuth/fetch use, and header-injection rejection.

The fake transport can model `timeout_before_accept` and `timeout_after_accept`. It is a separate class with no fetch path. These tests establish local behavior only; they do not establish Gmail account access, OAuth correctness in a deployed root, inbox semantics for a real account, deliverability, recipient consent, commercial qualification, customer interest, or economic return.

## Integrated release refinements

The bridge now treats `owner_supplied_verified` as a legacy address-origin enum: the owner supplied an assertion, not independent verification. The source and recipient still must match the exact channel envelope. Gmail JSON is streamed with a 2 MiB ceiling; error response bodies are never inspected or persisted. HTTP 401/403 become durable terminal authority failures and do not trigger transport retries. Follow-up preparation and dispatch refresh the original thread, reject unknown completion or newly observed replies, and preserve Subject/References/In-Reply-To/thread identity. Recursive follow-ups are refused. The proposed initial live channel permits zero follow-ups.
