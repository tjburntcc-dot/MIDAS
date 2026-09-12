# MIDAS portfolio workspace — runnable handoff

Open **http://127.0.0.1:43131/**. Mission 030's earlier workspace remains at port 43130. This additive release lives on `codex/portfolio-operating-system-v0-031` in `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-031`.

The local product performs the quote-to-job workflow: create a customer quote, calculate quantities and USD cents, convert accepted work to a job, update its status, reload persisted work, and export CSV. The service and internal decision packets contain preserved sources, recommendations, action owners, measures, unknowns and delivery obligations. Products opens actual previews/downloads. Evidence and Results change persisted state and create reassessment work. Revision requests preserve the original artifact and bind the requested correction to its hash. The owner operating packet explains capabilities, bottlenecks and the next decision.

The initial product/report source and repair content were authored by the development assistant. Deterministic runtime decisions exercised real edits, browser/document checks and delivery. These observations prove connected tool behavior, not actual-model skill or commercial demand. Prepared commercial drafts are unsent. The initial defects were deliberately injected and are never classified as naturally occurring model errors.

## Local launch and inspection

Run in PowerShell:

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-031
node packages/foundry/src/portfolio/cli.ts status --root var/portfolio-031
node packages/foundry/src/portfolio/cli.ts serve --root var/portfolio-031 --mock --port 43131
```

If that port already serves this workspace, use the existing process. `serve` does not automatically dispatch tasks. `--mock` is explicit; omitting it leaves model execution disabled. The new actual-model tasks remain gated even in mock mode. Only one configured live worker is dispatched at a time; independent offline local work can run concurrently.

For a fresh, separately labelled local demonstration, choose a new root:

```powershell
node packages/foundry/src/portfolio/cli.ts prepare --root var/portfolio-demo-new
node packages/foundry/src/portfolio/cli.ts run --root var/portfolio-demo-new --mock
node packages/foundry/src/portfolio/cli.ts serve --root var/portfolio-demo-new --mock --port 43132
```

Preparation is idempotent. It preserves existing work. `run` reuses completed tasks; it does not resubmit them. A persisted uncertain attempt is inspected with:

```powershell
node packages/foundry/src/portfolio/cli.ts recover --root var/portfolio-031
node packages/foundry/src/portfolio/cli.ts report --root var/portfolio-031
```

The report is written to `var/portfolio-031/reports/portfolio.json`. SQLite source revisions, requests/results, tool operations, artifact readback and observations remain in `var/portfolio-031/portfolio.sqlite`. Main-workspace prepared tasks are distinct from mutation tests under `var/portfolio-browser-*` and temporary test roots.

## Proposed actual-model run — not authorized

The proposed **$59.05 maximum** contains 33 ordinary Astra decisions, two held known-incomplete recovery admissions, four separately metered hosted-search responses, and $4 of unpriced token-count uncertainty. At most 39 inference and 39 supporting count admissions; no model fallback. This is a new proposed ceiling, not a transfer of Mission 028, 029 or 030 allowances. See [the full proposal](LIVE-PORTFOLIO-PROPOSAL.md).

The route is Astra `max`, default tier, because the governing attached goal explicitly requests the highest supported Astra effort. Earlier Sol Medium was selected for cheaper bounded transport/preparation, not because it was established as a stronger business baseline. The earlier Astra High $23 proposal remains preserved. The expanded price buys actual research, tool use, a reviewed deliverable and decisions across two hypotheses; it is not a silent amendment to that earlier amount. No fair specialist comparison is released by this package. A candidate needs an observed consequential weakness, identical source/tool/model limits, fresh/regression cases and a result that could change worker selection.

The current unsigned packet is already prepared. Its canonical proposal hash is b367e630e211b184ab078d6d3a0c9a6283d21ada1f8bd4b070128bfcf2dfa5d6. The earlier unsigned v1 packet is preserved and superseded after the final wait-state wording correction. For a fresh equivalent packet, the preparation command is:

```powershell
node packages/foundry/src/portfolio/cli.ts propose --root var/portfolio-031 --id portfolio-031-operating-v2 --billing-public-key ../foundry-worktree-028/var/foundry-smoke-028/auth/owner.pub
```

It writes exclusively to `var/portfolio-031/proposal/portfolio-031-operating-v2/`: the unsigned combined request, exact initial Responses payload, count projection and payload audit. Do not run it over an existing proposal. Read the preserved files or use a new explicit version after a change. The source hash freezes the actual code, procedures, schema and tools. Later requests are bound to their complete serialized payload at admission.

No request proves API access yet. The approved project pointer is `proj_H01ORqdOPQM6vdGwQYsqFL5r`; the proposed credential pointer is the existing protected `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key`. It has not been read or copied during this release. Subscription usage is not assumed to supply API credit. A route/account failure stops fresh requests; provider billing and immutable model revision availability remain separate evidence questions. The alias is not described as immutable.

After explicit approval of the exact proposal hash, the existing signing mechanism can sign both payloads with the owner key. The `sign-proposal` command requires `--proposal`, `--approve-proposal-hash`, `--approval-reference`, `--owner-public-key` and `--owner-private-key`; it refuses an existing active grant. Mason is the proposed billing-statement issuer, using the existing owner public key only if this scope is approved. A signature authenticates the issuer; factual provider-project records must support each closed-attempt statement. The existing count uncertainty reserve is not released merely by settling inference. After that evidence exists, `reconcile --root var/portfolio-031 --statement ABSOLUTE_STATEMENT_PATH` uses billing-only loading, including after execution expiry, and cannot dispatch. The established owner key paths are under the preserved 028 smoke root's `auth/owner.pub` and `auth/owner.key`. Signing/access is a future approved action, not a step performed by this preparation. No private key is printed or copied.

After signing, the first complete operating result is run sequentially:

```powershell
node packages/foundry/src/portfolio/cli.ts preflight --root var/portfolio-031 --live
node packages/foundry/src/portfolio/cli.ts run --root var/portfolio-031 --live --task release-readiness/investigate-v2
node packages/foundry/src/portfolio/cli.ts run --root var/portfolio-031 --live --task release-readiness/review-v2
node packages/foundry/src/portfolio/cli.ts run --root var/portfolio-031 --live --task release-readiness/decide-v2
```

Each step must finish its required state before the next. A shared access, contract or accounting defect stops further paid work. Continue the corresponding quote-desk chain only if it addresses an unresolved choice and the first run is interpretable. Finish `midas-intelligence/decide-v2` from its permitted evidence; cross-venture private inputs are not automatically shared. Owner-reviewed source/observation entries can support later controlled reassessment within the held ordinary allowance. No redundant automatic reassessment is purchased after each intermediate report: the declared decision task owns that feedback.

For a qualifying observed incomplete response only, `recover-incomplete --root var/portfolio-031 --live --task TASK --parent ORIGINAL_ATTEMPT` prepares an explicit fresh linked identity without dispatch. Then `run --task TASK --live` resumes it. It consumes existing task, venture, global work/count and two-recovery limits. Unknown completion, access errors or a second recovery of the same parent cannot use this path. Original exposure remains retained. No automatic replacement occurs.

The workspace can be restarted with `serve --live` after signing. Buttons then use the same trusted binding; they cannot bypass budget, code, tool or goal limits. No commercial sending or publication authority is granted by the model envelope.

## Optional controlled Gmail test

This is separately selectable and can be deferred without blocking model work. The preserved Mission 030 adapter and its tests cover exact-message approval, one effect, Message-ID reconciliation, reply receipt and suppression. Use only an owner-controlled or explicitly consenting test mailbox. No account was connected here.

The exact prepared subjects/bodies are retained in `../030/ASTRA-EXECUTION-V3.md` and `../../../../var/foundry-worktree-030/var/operating-workbench-030/proposal/astra-v3/gmail-test-messages.json`. Test A asks for `ACK 030-A`; test B asks for a controlled opt-out reply. Neither is outreach or evidence of demand. Sender and recipient addresses are still required before final message hashes can be approved.

Owner steps: select Gmail; supply the sender and up to two eligible recipients; enable Gmail API; configure a Web OAuth client for Google OAuth Playground; use your own client with only `gmail.send` and `gmail.readonly`; sign into the exact sender and consent. Enter the resulting short-lived token only into the preserved local hidden-input helper, never chat or a command argument. The helper remains pinned to the 030 protected account file. Approve the exact sender/recipient/body hashes and separately signed two-send/eight-thread-poll channel scope, then send the two requested replies from the controlled inboxes. No automatic token refresh is implemented; use its actual expiry. Read/consent restrictions must be honored. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth Playground](https://developers.google.com/oauthplayground/).

## Verification and open evidence gates

Use the focused `portfolio-*.test.ts` suite, `portfolio-ui.mjs`, `portfolio-browser.mjs`, and installed scoped semantic typecheck. The completion receipt records final results and actual browser evidence. Open gates are actual-model quality/access, owner usefulness and correction effort, customer validation, authoritative billing, optional account consent, protected comparative evaluation, and approved remote deployment. None is represented by a mock pass. [Capability limits](CAPABILITY-AND-LIMITS.md) and [remote continuity](REMOTE-CONTINUITY.md) describe the concrete boundaries.
