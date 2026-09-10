# MIDAS Foundry Loop v0.1

Mission `MIDAS-FOUNDRY-LOOP-V0-027` implements the supplied plan's proposed Mission 017. This is a runnable synthetic laboratory with durable state, authenticated fixture approvals, a separate idempotent fixture service, verified artifacts, cost accounting, and controlled fixture learning. It provides no worker certification, measured role improvement, or customer action.

## Setup and a complete episode

Use installed Node **24.19.0 or later** with native TypeScript and `node:sqlite`. No package installation or server is required. From the dedicated worktree in PowerShell:

```powershell
Set-Location 'C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-027'
node --test packages/foundry/test/*.test.ts packages/foundry/src/lab/*.test.ts
node packages/foundry/tools/acceptance-demo.mjs var/my-foundry-demo
```

The demo requires a fresh/empty directory and exercises every CLI command needed for a viable episode, rejection, uncertainty recovery, learning decisions, promotion and rollback. It exits nonzero if an expected state is missing. Its local reports and credentials remain under the chosen directory. Use a different root to repeat it; do not delete existing runs to obtain a pass.

For an interactive episode, these are working commands. Each CLI process opens persisted state, authenticates its named principal and exits. Setup creates three **synthetic** principals and private credential files; their contents should stay outside prompts, reports and source control.

```powershell
$labRoot = 'var/my-foundry-lab'
$labCli = 'packages/foundry/src/cli.ts'
$workerToken = "$labRoot/auth/fixture-worker.credential"
$ownerToken = "$labRoot/auth/fixture-owner.credential"
$evaluatorToken = "$labRoot/auth/fixture-evaluator.credential"

node $labCli setup --root $labRoot
node $labCli run --root $labRoot --run LAB-001 --scenario viable --model fixture --mode fixture --principal fixture-worker --token-file $workerToken
node $labCli inspect --root $labRoot --run LAB-001 --principal fixture-owner --token-file $ownerToken
# Inspect the exact publish proposal, payload, role, policy and cost before approving.
node $labCli approve --root $labRoot --run LAB-001 --proposal publish --principal fixture-owner --token-file $ownerToken
node $labCli resume --root $labRoot --run LAB-001 --principal fixture-worker --token-file $workerToken

$episode = node $labCli inspect --root $labRoot --run LAB-001 --principal fixture-worker --token-file $workerToken | ConvertFrom-Json
$candidate = $episode.learning.candidateId
node $labCli evaluate --root $labRoot --run LAB-001 --candidate $candidate --case inconclusive --principal fixture-evaluator --token-file $evaluatorToken
node $labCli decide --root $labRoot --run LAB-001 --candidate $candidate --principal fixture-owner --token-file $ownerToken
node $labCli report --root $labRoot --run LAB-001 --principal fixture-owner --token-file $ownerToken

node $labCli run --root $labRoot --run LAB-002 --scenario rejection --principal fixture-worker --token-file $workerToken
node $labCli report --root $labRoot --run LAB-002 --principal fixture-owner --token-file $ownerToken
```

`run` stops at `waiting_approval`. `resume` after approval delivers and verifies the artifact, then stops at `learning_review`. Only the separate evaluator and promotion principal can finish the learning decision. The no-go episode stops at `rejected`, records an outcome and performs no action. `--case improves|regresses|inconclusive` selects a disclosed **fixture evaluation**, not an observed model result. The demo proves all three paths.

Reports are under `<root>/reports/<tenant>/<business>/<run>/`: `report.json`, `normalized.json`, `manifest.json`, and, following delivery, `artifact.json`. `report.json` contains linked immutable records, event history, evidence, task contracts, exact grants, receipts, role versions, usage, costs and learning decisions. `domain.sqlite` holds domain state; `service.sqlite` independently persists fixture effects.

## Recovery and controls

```powershell
# Stop before deciding, then continue in a new process:
node $labCli run --root $labRoot --run checkpoint-001 --scenario viable --checkpoint decide --principal fixture-worker --token-file $workerToken
node $labCli resume --root $labRoot --run checkpoint-001 --principal fixture-worker --token-file $workerToken

# For a newly approved run, simulate a timeout after the service applied its effect:
node $labCli resume --root $labRoot --run checkpoint-001 --fault timeout_after_effect --principal fixture-worker --token-file $workerToken
node $labCli resume --root $labRoot --run checkpoint-001 --principal fixture-worker --token-file $workerToken

# Exact grants can be revoked; cancellation retains unresolved effects:
node $labCli revoke --root $labRoot --run checkpoint-001 --proposal publish --principal fixture-owner --token-file $ownerToken
node $labCli cancel --root $labRoot --run checkpoint-001 --principal fixture-worker --token-file $workerToken
```

Approve `checkpoint-001` using the earlier `approve` command before exercising its timeout. Approval defaults to one action, 25 simulated USD minor units and a one-hour expiry; tasks have a 24-hour deadline. `--expires-at` accepts an explicit UTC timestamp; `--review-minutes` is a nonnegative integer bounded by the task's ten-minute fixture limit. Repeating an exact approval returns its existing grant; it does not renew its expiry or reverse revocation. Create a fresh reviewed run if replanning is required. `missing` and `conflict` scenarios retain blocked evidence with no proposal.

`--cap` is the business's initial integer USD minor-unit cap (default 100); later runs cannot reset it. Unknown/provisional costs retain their reservation. Known settlement atomically charges actual cost and releases the remainder. A proved zero-effect result releases all unused reservation. An over-reservation bill remains unresolved for operator investigation, with funds held. No automatic re-dispatch happens after a durable intent. A local read failure can retry at most twice; denied actions do not automatically retry.

To run the same fixture service in a separate foreground terminal:

```powershell
node packages/foundry/src/lab/fixture-service.ts --db var/my-foundry-lab/http-service.sqlite --token-file var/my-foundry-lab/auth/service.credential --port 0
```

It prints a loopback URL. Supply that URL to **both** action-bearing `run`/`resume` calls with `--service-url http://127.0.0.1:<printed-port> --service-token-file var/my-foundry-lab/auth/service.credential`. Restart the service with the same database and credential. Keep a run on its original service/database; changing the service is not recovery. Process tests launch hidden local children and prove actual kill/restart and competing reservations.

## Contracts and trust boundaries

`src/contracts.ts` defines scoped `ModelPort`, `EnvironmentPort` and `ActionPort` contracts. `state.ts`, `runtime.ts`, `authority.ts`, `context.ts` and `learning.ts` contain reusable local control logic. Support policy, costs, fixture tapes, tickets and artifact verification live in `src/lab`. The controller does not select an answer based on a scenario label.

All monetary amounts are safe integers in explicit three-letter currencies; signed option contribution is validated separately from nonnegative spend. Unknown cost has `money: null`; a provisional amount carries a basis and is never reported as a settled bill. Models receive scoped evidence and a pinned role, with no credentials, grants, verifier ticket truth or promotion capability. The local CLI authenticates real file-held random tokens outside model text; the principal names alone confer no authority.

SQLite provides one-host transactions and immutable records/events. The service attests observations with HMAC-SHA256 and fences authoritative absence with a permanent idempotency tombstone so a delayed original dispatch cannot act afterward. These are trusted application boundaries on one machine, not isolation from another program running as the same OS user. Direct database access and low-level `StateStore`/`Authority` methods are trusted kernel APIs, not worker tools.

`normalized.json` is an explicit semantic fixture projection excluding run IDs, timestamps, receipt IDs and their derived hashes. Matching it does **not** imply raw-byte equality. `manifest.json` separately reports the raw report hash. Records pin in-flight role/policy versions; promotion changes only newly initialized runs, and rollback retains old provenance.

The CLI rejects live/human-mediated model ports before invocation. The separately exported supported Responses bridge and its exact next integration/access requirements are documented in [the F2 handoff](../../docs/foundry/F2-HANDOFF.md). The fixture tapes and learning mini-interpreter establish control mechanics only. No evaluation holdout is certified by this repository's visible synthetic fixtures.

See [inventory/runtime decision](../../docs/foundry/INVENTORY-RUNTIME.md) and [completion packet](../../docs/foundry/COMPLETION-027.md) for verified provenance, acceptance evidence and limitations.
