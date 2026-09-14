# Mission 034 connection contract

`packages/foundry/src/pilot/connections` is a read-only connection layer. It has maintained Google Workspace, Shopify Admin GraphQL, and GA4 Data API adapters with bounded pagination, retained cursors, incremental windows, and source-level lineage. The adapters have no write or mutation surface. They do not obtain a credential from an environment variable, OAuth flow, SDK default, or account lookup.

## Configuration, consent, and the account token are separate

`ConnectionService.beginConfiguration` records the selected provider, read capabilities, an **opaque** credential reference, and bounded adapter configuration. `grantConsent` separately records the owner, purpose, timestamp, optional expiry, and exact required read scopes. A configured reference is not an account token and does not prove that an account is connected. Until all selected capability scopes are consented, the connection is `permission_missing`; `sync` stops before calling a transport.

The executable boundary is `connections/host.ts`. It prepares and verifies a signed connection-read grant that binds the business, connection ID, provider, capability set, opaque reference, consent, initial mapped source scope, all three maintained provider families, host/adapter implementation closure, one absolute protected token-file path, a 40-read cap, and a 15-second request deadline. The packet contains the file path and opaque reference only; it never contains token bytes.

`prepare`, `sign`, and `status` do not open the protected token file or call a provider. At `sync`, the host first verifies the installed signature, expiry, configuration, consent, source scope, and durable request allowance. It records an admission before it reads the token file and before it dispatches a provider request. The resolver has no environment fallback and does not log or persist the token.

The protected file and its contents are an owner-managed prerequisite. Its existence, whether its token is accepted by a provider, the provider account's actual accessible data, provider-side billing, and provider-side request accounting are all unknown until a separately approved live sync is attempted. The local host reports durable admissions and conservative unknown dispatches; it does not invent provider billing or actual provider usage.

## Explicit owner CLI

The top-level pilot CLI delegates `connection` commands to the connection host. All path arguments below are absolute paths. These commands prepare or inspect local state; they do not grant consent and they do not create an account token.

```powershell
node packages/foundry/src/pilot/cli.ts connection prepare `
  --root <absolute-pilot-root> `
  --business <business-id> `
  --connection <connection-id> `
  --id <owner-chosen-packet-id> `
  --token-file <absolute-protected-token-file> `
  --expires-at <ISO-8601-expiry> `
  --output <new-absolute-packet-directory>

node packages/foundry/src/pilot/cli.ts connection sign `
  --root <absolute-pilot-root> `
  --proposal <absolute-packet-directory/connection-read.authorization.request.json> `
  --approve-proposal-hash <exact-proposal-hash> `
  --principal <owner-principal> `
  --approval-reference <owner-review-reference> `
  --owner-public-key <absolute-public-key-file> `
  --owner-private-key <absolute-private-key-file>

node packages/foundry/src/pilot/cli.ts connection status `
  --root <absolute-pilot-root> `
  --connection <connection-id>

node packages/foundry/src/pilot/cli.ts connection sync `
  --root <absolute-pilot-root> `
  --connection <connection-id>
```

`sign` accepts the reviewed packet only when its supplied hash is exact and it receives explicit owner key files. The installed envelope is written to:

```text
<pilot-root>/auth/connection-read/<connection-id>.authorization.json
```

The root has one `auth/connection-owner.pub` trust anchor and can hold separate grants for separate configured connections. A `sync` or `status` without `--connection` is accepted only when exactly one connection grant is installed; it is rejected as ambiguous otherwise. One connection grant cannot be used for another connection.

For Shopify, `prepare` additionally requires the exact approved shop domain:

```powershell
node packages/foundry/src/pilot/cli.ts connection prepare ... `
  --shop-domain <lowercase-shop>.myshopify.com
```

The signed Shopify grant carries that exact `myshopify.com` domain. Execution uses the signed value and accepts no runtime or testing-time domain override. Google Workspace and GA4 packets reject `--shop-domain` because it is outside their provider scope.

## Limits, continuation, and failure handling

Each signed grant has its own durable counter keyed by its signed-grant hash. It permits at most **40 admitted reads** in total, across process restarts and newly constructed transports. A 15-second timeout applies to each dispatched provider request. A new connection grant has a separate counter; it cannot reset or borrow another grant's counter.

After a successful sync, the host saves an exact continuation snapshot of sources produced under that grant. This permits later bounded incremental syncs while preserving the original signed grant. A later external source, configuration, consent, capability, revocation, connection, provider, or implementation change fails the current-scope check before another credential read.

There is no automatic retry. If a read or sync is interrupted or otherwise uncertain, the host retains the durable `failed_or_unknown` session and refuses a new submission under that session. Inspect the retained state and prepare a new exact owner-reviewed grant when a further read is justified. Failure records retain only a stable allow-listed failure code, never raw error text or a secret.

`status` is read-only. It makes `requestsMadeByStatusCall: 0` explicit and exposes `admittedReads`, `dispatchedReads: null`, `unknownReads`, `readsRemaining`, `current`, and `liveEnabled`. `dispatchedReads` remains null because the local admission ledger is not a provider receipt; `unknownReads` conservatively includes admitted reads.

## Ingestion lineage and revocation

`ConnectionService.sync` normalizes collected material into `PilotKnowledge.addSource` and records an immutable `PilotConnectionIngestedSource` revision. The revision includes provider source identity, collection/update time, content hash, partial retrieval, pagination limitations, source URL when available, and retained PDF bytes/page count when applicable. It retains no credential value. Shopify order material is deliberately limited to order-level financial and line-item aggregates; no customer name, email, address, notes, or customer ID is requested or stored.

`observedAt` is local retrieval time. `updatedAt` is present only when the provider supplied a valid update time; GA4 reports use `updatedAt: null`. Drive and Shopify retain the committed `updatedAfter` watermark while a page-token continuation is outstanding and use `pendingUpdatedAfter` for the incomplete window maximum. Shopify persists independent products/orders cursor state. GA4 stores resumed offset ranges under distinct source identities so a later range cannot replace an earlier report row.

Revocation marks the connection and every mapped `ConnectionSource`, blocks later transport reads, and returns the old `knowledgeSourceId` values through `excludedKnowledgeSourceIds(businessId)`. Root integration must apply `filterSources` or those IDs before every `PilotKnowledge.bundle`, discovery context, cached-context reuse, and worker request. Source revisions remain immutable; revocation changes present permission, not historical bytes.

## PDF extraction

Google Drive PDF handling retains bounded original bytes and remains explicit about partial or unavailable text. Extraction has a 2 MB input ceiling, a 10-second local process deadline, an 80-page / 180,000-character Python bound, and no OCR or model inspection.

The host first uses installed `pdftotext`. If that is unavailable or returns no text, it may use the already bundled local Python runtime at the configured Codex runtime path with installed `pypdf`; it does not download or install a package. If neither extractor succeeds, the source remains partial with retained bytes and an explicit unavailable-extraction limitation. A scanned document still needs separately permitted OCR or an owner text export.

## Stopped-service backup and restore v2

Connection lineage and its durable admission records are ordinary private data in `pilot.sqlite`. To create a v2 continuity snapshot, stop the owner service first and use the stopped-service confirmation command:

```powershell
node packages/foundry/src/pilot/cli.ts backup `
  --root <absolute-pilot-root> `
  --output <new-absolute-backup-directory> `
  --confirm-stopped
```

The command refuses a live `owner-service.json` lease, copies the SQLite snapshot plus bounded functional-project sidecars, and writes a `pilot-backup-v2` manifest. The manifest explicitly excludes credentials and authorization files. Restore only to a new, non-existent target with the manifest's exact `sha256`:

```powershell
node packages/foundry/src/pilot/cli.ts restore `
  --backup <absolute-backup-directory> `
  --target <new-absolute-target-root> `
  --hash <manifest-sha256>
```

Restore verifies the v2 manifest, database and sidecar hashes, and SQLite integrity. It does not reinstall an authorization, read a token, or resume a connection sync.

## Maintained adapter references

The adapter protocol is based on primary documentation checked 2026-09-13:

- [Google Drive `files.list`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list) for `nextPageToken`, page size, modified-time filtering, and incomplete-search reporting.
- [Google Docs `documents.get`](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get) for the document GET endpoint, `includeTabsContent`, and read scopes.
- [Google Sheets values get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get) for the bounded Sheets range read.
- [Shopify Admin GraphQL products](https://shopify.dev/docs/api/admin-graphql/latest/queries/products) and [orders](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders) for maintained connection cursor reads.
- [GA4 Data API `properties.runReport`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport) for dated report reads and fixed-window offset paging.
