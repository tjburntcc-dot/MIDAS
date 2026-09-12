# MIDAS operating workspace — Mission 030

The accepted offline checkpoint remains preserved. The current unsigned execution request is [Astra High v3](ASTRA-EXECUTION-V3.md), with a $23 maximum, a hypothesis-challenging investigation, conditional comparison, bounded recovery and a separately selectable Gmail test. Open `http://127.0.0.1:43130/?id=midas-venture-investigation-v3` to review it. The original Sol proposal below is historical; no live grant has been signed by this revision.

This release connects an owner goal, permitted research, persisted business understanding, experimental worker assignment, draft and substantive review, exact communication approval, a durable outbox, inbound evidence and procedure comparison. Its completed verification is offline. The prepared founder workspace contains development-assistant research and proposals, clearly separated from runtime observations.

## Open the working product

From PowerShell:

```powershell
Set-Location 'C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-030'
node packages/foundry/src/operations/cli.ts prepare --root var/operating-workbench-030
node packages/foundry/src/operations/cli.ts serve --root var/operating-workbench-030 --port 43130
```

Open `http://127.0.0.1:43130/`. Keep this process running. The previous workbench remains on port 43129; its state and implementation are preserved. This process binds only loopback, uses a local session cookie and CSRF checks, and is not a remotely deployed service. It stops supervising work when the laptop/process stops.

The first screen is Mason's prepared business workspace. It shows the objective, unvalidated venture hypotheses, three material bottlenecks and the operating decision packet. It cannot make model calls until a fresh signed grant is supplied. **Create offline demonstration workspace** is a separate explicit action; it never changes the real workspace into a simulation.

Use **Work** to run the current goal, **Pipeline** to inspect initial/reviewed materials and revise the current unpublished artifact, **Approvals** to approve and dispatch exact content, and **Results** to inspect reply evidence and accounting. An owner revision invalidates earlier approval and requires another review. Pause/cancel apply to the business assignment. A different goal creates a new assignment workspace and requires its own authorization scope. GET refresh does not spend, send, or admit model work.

## Reproduce the offline operating loop

```powershell
node packages/foundry/src/operations/cli.ts demo --root var/operating-demo-new
node packages/foundry/src/operations/cli.ts demo --root var/operating-team-demo-new --configuration owner-reviewer
```

Each command creates a fresh fictional tool-library assignment, obtains permitted mock evidence through the research adapter, executes investigation/draft/review, uses a clearly labeled test-controller approval, loses a mock send acknowledgement, reconciles one effect, receives an injected negative reply, and runs the source/procedure comparison mechanics. No provider, customer or network message is contacted. The fixture's response logic is a test fixture, not demonstrated reasoning. The mock comparison uses visible source facts; acceptance labels remain outside worker inputs.

Each command prints its business ID and JSON report path. Use that ID with these commands:

```powershell
node packages/foundry/src/operations/cli.ts status --root var/operating-demo-new --business BUSINESS_ID
node packages/foundry/src/operations/cli.ts report --root var/operating-demo-new --business BUSINESS_ID
```

Reports are read-only and remain available after code changes. Resume an unfinished run using the same root, business identity and implementation. Completed responses are reused by exact request identity; a missing response after admission is uncertain and is not resubmitted. Changing implementation or a signed grant cannot reset a ledger. Retain the original root and investigate the checkpoint before authorizing any future recovery.

## Prepare the live request without access or spending

```powershell
node packages/foundry/src/operations/cli.ts prepare-live --root var/operating-workbench-030 --business midas-owned-venture
```

This writes unsigned files under `var/operating-workbench-030/proposal/`: `model-grant.request.json`, `channel-grant.request.json`, and `worker-context.json`. It does not read either credential or sign a grant. The model request pins project, route, goal, hosts, implementation hash, host, root, expiry, finite deadlines and business/stage/aggregate allocations. See [the consolidated proposal](STRATEGY-AND-LIVE-PROPOSAL.md).

After explicit approval, preserve these request files and write approved copies containing the exact owner approval reference. Sign those copies using the existing experiment signing mechanism and an owner-controlled local Ed25519 trust key. Never put private keys or tokens in command arguments, prompts, Git, logs or chat. Key files need an owner-only Windows ACL; POSIX file mode alone does not establish Windows protection. Do not reuse an offline fixture key as live authority.

The existing commands, after the approved files and protected signing key exist, are:

```powershell
node packages/foundry/src/experiment/cli.ts sign --file var/operating-workbench-030/auth/model-grant.approved.json --key var/operating-workbench-030/auth/owner-signing.pem > var/operating-workbench-030/auth/model-grant.signed.json
node packages/foundry/src/operations/cli.ts preflight --root var/operating-workbench-030 --business midas-owned-venture --live-grant var/operating-workbench-030/auth/model-grant.signed.json --trust-anchor var/operating-workbench-030/auth/owner-signing.pem.pub
node packages/foundry/src/operations/cli.ts serve --root var/operating-workbench-030 --port 43130 --live-grant var/operating-workbench-030/auth/model-grant.signed.json --trust-anchor var/operating-workbench-030/auth/owner-signing.pem.pub
```

Use a UTF-8-capable shell for redirected JSON. `preflight` checks the local grant and conservative arithmetic; it does not establish API access. Starting the signed server does not itself dispatch inference. The owner presses **Create and run work**, or uses `run` with the same live flags. A configured signed business grant is required even when a credential exists.

## Communication account setup and exact approval

The supported provider is Gmail REST, not an assistant connector. No account is currently connected. Mason must select one owned sender account, configure an owner-controlled Google OAuth client/consent flow and Gmail API access, and place an unexpired access token in a protected local file. The trusted callback expects `{type:"oauth2",accountEmail,accessToken,expiresAt,scopes}`. Use `gmail.send` and `gmail.readonly` for the send/read feature set. Do not use a password or paste the token into chat. Automatic OAuth provisioning and token refresh are not implemented; an expired token stops access. The adapter checks declared identity/scope but actual access remains unverified until the authorized controlled test.

The separate approved channel envelope must contain the exact sender, at most two controlled or explicitly consenting test recipients, the protected OAuth and local signing-key paths, model-grant hash, implementation/root/host bindings, expiry, two-message/eight-poll caps, 30-second minimum send interval and zero follow-ups. The address also needs a source visible to the worker; a public address alone does not authorize contacting it. This is a controlled integration test, not cold prospecting.

Sign the channel's approved copy using the same established mechanism. Start `serve` with the additional `--channel-grant var/operating-workbench-030/auth/channel-grant.signed.json` flag. All live commands accept that same flag. The UI then shows the actual exact batch for approval and dispatch. Source/content changes revoke prior unstarted authority. The channel envelope does not replace exact-content approval or authorize model spending.

```powershell
node packages/foundry/src/operations/cli.ts approve --root RUN_ROOT --business BUSINESS_ID --hash EXACT_BATCH_HASH --live-grant MODEL_ENVELOPE --trust-anchor OWNER_PUBLIC_KEY --channel-grant CHANNEL_ENVELOPE
node packages/foundry/src/operations/cli.ts dispatch --root RUN_ROOT --business BUSINESS_ID --hash EXACT_BATCH_HASH --live-grant MODEL_ENVELOPE --trust-anchor OWNER_PUBLIC_KEY --channel-grant CHANNEL_ENVELOPE
node packages/foundry/src/operations/cli.ts poll --root RUN_ROOT --business BUSINESS_ID --live-grant MODEL_ENVELOPE --trust-anchor OWNER_PUBLIC_KEY --channel-grant CHANNEL_ENVELOPE
```

The optional local live supervisor polls waiting mail assignments once per minute, bounded by the channel ledger. Invalid authority or exhausted limits block the affected assignment. It does not invent replies or run while the computer is off. A send uncertainty is reconciled by exact stable Message-ID in SENT; a miss remains unknown, not permission to resend. A provider acknowledgement is not delivery, interest or revenue. See [communication contracts](COMMUNICATION.md).

## Procedure comparison and accounting

**Results → Add to learning** invokes one bounded source extraction. It may retain the baseline without comparisons. A credible lesson produces a versioned general procedure, separate from private company context, and freezes six developer-visible paired tasks before their 12 metered calls. Both conditions have strong common instructions, identical source facts/settings/limits, alternating order and isolated trial context. Results and failures persist; they do not certify a worker. The direct command is `learn --source SOURCE_ID`, with the same root/business/live flags.

A local ledger is admission control, not a guarantee of external billing. Failed/incomplete/uncertain calls keep their reservation. Supporting counts consume their own admission allowance and share an explicitly unpriced uncertainty reserve. Provisional token prices, settled charges, simulated amounts and unknown founder effort remain separate.

For authoritative settlement, the original approved model grant must pin a `billingPublicKey`. An authorized billing custodian must obtain actual closed-attempt evidence and prepare a signed `closed_attempt_invoice` with project, grant hash, scope, attempt/request/provider IDs, USD integer minor units, evidence SHA-256, issuer and closed time. A signature authenticates the submitter; it does not make unsupported billing claims accurate. Aggregate dashboards that cannot attribute an attempt are insufficient to release its reservation. Keep unknown amounts retained.

```powershell
node packages/foundry/src/operations/cli.ts reconcile --root RUN_ROOT --business BUSINESS_ID --statement SIGNED_INVOICE_FILE --live-grant MODEL_ENVELOPE --trust-anchor OWNER_PUBLIC_KEY
```

This reuses the prior ledger's idempotent reconciliation and overage halt. No billing evidence, revenue, collection, refund, fulfillment, qualified prospect, independent human timing or worker certification has been fabricated. Collections and fulfillment integrations remain outside this release.

## Verification commands

Run from this worktree root, using existing Node and installed TypeScript:

```powershell
node --test packages/foundry/test/*.test.ts
node --test packages/foundry/test/experiment/*.test.ts
node packages/foundry/tools/typecheck-workflow.mjs C:/Users/14844/AppData/Local/Programs/cursor/resources/app/extensions/node_modules/typescript/lib/typescript.js C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@types
$env:MIDAS_OPERATIONS_REPORTS='var/operating-workbench-030/reports/browser'
node packages/foundry/test/operations-browser.mjs
```

The browser test requires the server on 43130 and the installed Playwright/Chrome paths in the test script. It creates its own explicitly offline workspace; it does not run the real founder assignment. It inspects the full desktop/mobile journey, exact approval, revised artifact, negative response, escaped source evidence and console errors. Required verification and preservation results are recorded in [COMPLETION.md](COMPLETION.md).
