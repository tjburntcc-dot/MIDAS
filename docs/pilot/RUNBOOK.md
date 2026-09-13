# Use the first-owner pilot

This release is a local owner workbench, not a hosted or live-model customer service. Start with the actual business; the separate furniture-restoration company is a development-authored test fixture.

From `C:\Users\14844\Downloads\MIDAS\var\owner-pilot-worktree-032`:

```powershell
node packages/foundry/src/pilot/cli.ts serve --root var/owner-pilot-032 --port 43143
```

Open `http://127.0.0.1:43143/`. Node 24.19+ and the already installed Playwright/Chromium runtime are used. No dependency installation, credential loading or provider connection happens on startup. The original R5 workspace remains separate at port 43142.

## Owner walkthrough

1. Create the business with its real name, goal, website reference and owner notes. Nothing assumes what Mason's stepmom sells. Website URLs are saved references, not fetched pages.
2. Add a current policy or operating note and a small relevant export. Supported input is UTF-8 text, Markdown, CSV or JSON, up to 200 KB per source. PDF extraction and account sync are not connected. Do not upload secrets. Confirm the right to use the data.
3. Select the evidence the worker should use. Retain large originals and add a decision-relevant excerpt when needed. Selected execution text is bounded to 8 KB; the product reports excess rather than truncating evidence. Dates, source permissions and original bytes remain available.
4. Inspect the partial understanding, material unknowns and proposed work. Real-company diagnosis is an unsigned ModelPort preparation until a new grant exists. In the explicit demo, sourced hypotheses are test-double outputs, not actual inference.
5. Prepare one outcome: a business response packet or a contained business website/inquiry workflow. The work is persisted and assigned to a strong generalist with source, procedure and tool identity. Unknown qualification is visible.
6. In the labeled demo, run the task, inspect the readable deliverable or interactive preview and its actual checks. Real-company execution has a visible authorization blocker; it cannot fall through to a provider.
7. Start an optional review timer, mark AI assistance accurately, and accept the exact local artifact or request correction. Demo corrections are **literal replacement wording** applied through recorded targeted edits. This demonstrates the mechanics, not arbitrary semantic repair. A pending correction's inherited artifact cannot be accepted as a completed result.
8. Inspect the newly checked artifact. Earlier acceptance becomes stale when the authoritative version changes. Saved inquiry data is carried forward within the same business; stale preview sessions are refused.
9. Record whether the deliverable was accepted, needs change or was not useful, with the evidence behind that judgment. The next recommendation changes by an explicit rule. An acceptance or page delivery never creates a sale, revenue or causal improvement claim.
10. The learning view turns a recorded correction into a scoped candidate and a fair-comparison plan. Separate developer-visible evaluation fixtures exercise retain/reject mechanics. Their result retains the strong baseline; fixtures cannot qualify a worker.

## Offline demonstration and persistence

```powershell
node packages/foundry/src/pilot/cli.ts demo --root var/pilot-demonstration-032
node packages/foundry/src/pilot/cli.ts status --root var/pilot-demonstration-032
node packages/foundry/src/pilot/cli.ts serve --root var/pilot-demonstration-032 --port 43145
```

The demo command creates both artifacts using labeled mock decisions, actual tools and browser checks. It does not invent owner approval, semantic review or outcomes. The generated `offline-demonstration.json` preserves provenance. Stop/restart the server with the same root; the SQLite database and immutable artifacts survive. In-progress inference is not blindly resent. An unsupported or uncertain checkpoint remains visible for reconciliation. An unavailable browser causes failed checks and blocks publication.

```powershell
node packages/foundry/src/pilot/cli.ts backup --root var/owner-pilot-032 --output var/owner-pilot-backup-032
node packages/foundry/src/pilot/cli.ts restore --backup var/owner-pilot-backup-032 --target var/owner-pilot-restored-032 --hash <sha256-from-manifest>
```

Backup and restore refuse existing destinations. Backups contain private company data and must not enter Git. Only explicitly chosen local files are imported; no owner credentials are stored in this database. Local browser preview is contained, with outbound network blocked by the trusted browser controller. Downloaded source is an artifact, not a grant to run host commands.

## Specific pilot connections and next owner input

No real business facts or data-use permission have yet been supplied. In the workbench, Mason and the business owner should provide together:

- Company name and website, the owner's first operating goal, and permission to use the supplied material.
- One current policy/offer document and one small redacted example of the workflow to improve. Include pricing only if relevant; omit credentials and unnecessary personal data.
- The owner who can resolve policy ambiguity and accept the deliverable. Unknown availability and expertise stay unknown.

Then select the first outcome and export its actual unsigned preparation:

```powershell
node packages/foundry/src/pilot/cli.ts prepare-live --root var/owner-pilot-032 --business <persisted-company-id>
```

This prepares exact Responses bodies, schemas, UTF-8 byte counts and hashes using the existing Astra Max background request shape. It is **not a spending request or signed execution grant**. Historical route prices are labeled stale. Final live authorization must bind the selected company data, implementation, role/procedure, task limits, finite deadlines, provider retention, approved route/project, protected credential boundary and numerical exposure after current official pricing/access checks. Prior Mission 031 authority cannot be reused. The default server refuses paid execution; explicit CLI commands below use the existing signed runner through the verified pilot binding. No smoke or count request is needed merely to inspect these bytes.

The smallest first live outcome is one evidence-backed response packet and its correction/review, if the real business has that job. The website task is available when the supplied evidence justifies it. No specialist comparison is purchased by default. Customer communication, publishing, purchases and account changes each remain separately controlled effects.

## Exact opt-in execution path, after owner data and approval

There are two separately scoped execution accounts: one diagnosis and selected artifact tasks. They share the existing transport, admission and signing mechanisms. The dashboard sums their actual accounting once. There is no hidden diagnosis, verifier or correction budget. A future owner correction creates a new task; it is not silently added to a previously signed allowance.

For diagnosis, prepare a private JSON configuration containing `id` (a fresh `pilot-diagnosis-032-*` identity), `businessId`, `projectId`, `credentialFile` (approved absolute file location only), `expiresAt`, `countUncertaintyMinor`, and `mode: "live"`. For artifact execution use a fresh `portfolio-pilot-032-*` identity and the same authority fields, plus `tasks: [{"taskId": "<exact persisted ID>", "workCalls": 4}]`. The helper refuses started, stale or unsupported tasks. A response packet permits 2–8 decisions; a website permits 3–8, with actual useful capacity selected at freeze. One model completion decision triggers bounded deterministic checks, publication and readback; ordinary code does not consume extra model calls.

The current helper preserves Astra Max, 32,768 complete-payload input tokens and 32,768 total output tokens including reasoning. Its retained pricing basis reserves 205 cents per admission. This is **not a current live quote**: official route pricing/access and the owner's selected uncertainty buffer must be verified before final approval. If the required reservation exceeds the prepared one, reprepare the unsigned packet. Background `store:true` retention of at least 30 days and bounded same-ID retrieval require explicit data-owner approval. Unknown creation without a response ID stays stopped; there is no replacement inference, fallback, search or automatic retry.

Preparation commands do not read credentials or create admissions:

```powershell
node packages/foundry/src/pilot/cli.ts propose-diagnosis --root var/owner-pilot-032 --config <private-diagnosis-config.json> --output <fresh-proposal-directory>
node packages/foundry/src/pilot/cli.ts propose-execution --root var/owner-pilot-032 --config <private-task-config.json> --output <different-fresh-proposal-directory>
```

Both commands write the exact unsigned request, provider schema, serialized payload, limits, code/data/procedure binding and proposal hash. The owner approves the exact artifacts and numerical combined exposure, never a generic `--live` switch. Do not sign test configurations, reuse an earlier approval reference or copy secrets into configuration files.

After exact approval, the operator uses the existing protected signing keys. These commands read signing keys only when explicitly invoked; they do not display them:

```powershell
node packages/foundry/src/pilot/cli.ts sign-diagnosis --root var/owner-pilot-032 --proposal <diagnosis-proposal>/pilot.diagnosis.authorization.request.json --approve-proposal-hash <exact-approved-hash> --approval-reference <actual-owner-approval-reference> --owner-public-key <protected-public-key-file> --owner-private-key <protected-private-key-file> --principal Mason
node packages/foundry/src/portfolio/cli.ts sign-proposal --root var/owner-pilot-032 --database pilot.sqlite --proposal <task-proposal>/portfolio.authorization.request.json --approve-proposal-hash <exact-approved-hash> --approval-reference <actual-owner-approval-reference> --owner-public-key <protected-public-key-file> --owner-private-key <protected-private-key-file> --principal Mason
node packages/foundry/src/pilot/cli.ts run-diagnosis-approved --root var/owner-pilot-032
node packages/foundry/src/pilot/cli.ts run-approved --root var/owner-pilot-032
```

The owner workspace reads the persisted results. Repeating a run command first recovers already recorded results or the same provider response, subject to its limits. It cannot replenish admissions. A changed company/evidence selection blocks new task inference and requires fresh scoped work. Local owner review remains in the dashboard. Diagnosis proposals must be reviewed before selecting the task they justify; tasks selected beforehand remain explicitly owner-selected, not a claim of model prioritization.

A backup preserves the database and observations. Preserve the matching **non-secret** signed envelopes and public trust anchor separately if accounting has been funded. Restoring a database does not restore execution authority; missing grant evidence is displayed as unavailable accounting, never zero. Private/API signing keys are not copied by backup.

## Hosting path — prepared, not deployed

The release can run as a persistent single-owner process on a private host with Node 24.19+, the same installed Playwright/browser dependency, a private writable state directory and restricted filesystem permissions. `deploy/pilot/midas-pilot.service` is a concrete Linux user-service template. It intentionally binds to loopback. The owner reaches it using an authenticated SSH tunnel:

```text
ssh -N -L 43143:127.0.0.1:43143 <approved-user>@<approved-host>
```

This keeps company data off a public unauthenticated endpoint and lets the process persist independently of Mason's laptop. The deployment operator must provide the approved host/account, runtime/browser paths, a backup destination and startup permissions. Copying files, provisioning the host, installing dependencies or starting the remote service requires separate authorization. No hostname, account or cost is assumed. Public multi-owner hosting still requires a reviewed identity/TLS boundary and tenant isolation beyond this one-owner workspace; it is not claimed complete.

## Accounting and evidence limits

Pilot provider calls, counts, new reservations and external effects are zero. Local compute, development-assistant subscription cost and independent founder correction effort are unmeasured. Optional review sessions record elapsed owner interaction with assistance and idle-time limitations; this is not independent correction time. Historical Mission 031 retained exposure of $19.17 is displayed separately, with billing settlement unavailable. R5 remains unsigned and unchanged.

Neither these fixtures nor prior support observations establish company-specific competence, specialist superiority, customer validation, commercial demand or production qualification.
