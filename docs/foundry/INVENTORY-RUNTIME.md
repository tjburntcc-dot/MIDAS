# Foundry Loop v0.1 / Mission 027: inventory and runtime record

**Inventory date:** 2026-09-10
**Scope:** non-sensitive repository source, tests, package metadata, and the
Foundry 027 implementation only. This record does not inspect environment
values, campaign payloads, sealed identities, or scorecard content. The separately
reported preservation audit hashes authorized files without parsing payloads.
It does not authorize a provider call, external action, install, or
service deployment.

## Provenance, base, and numbering

The planning document, `MIDAS-Foundry-Architecture-and-Build-Plan-2026-09-10.md`,
asked for a Mission 017 inventory before a Foundry Loop implementation. The
repository already contains Mission 17 and Mission 18 work plus Checkpoints
19 through 26. The implementation therefore uses the non-colliding mapping
**proposed Mission 017 -> implemented Mission 027**, with branch
`codex/foundry-loop-v0-027`.

Before code changes, the original repository at `C:\Users\14844\Downloads\MIDAS`
was verified clean on `feature/opportunity-qualification-sealed-grouping-authority-v1`,
HEAD `8d2c6b3db3fe5d1c63493e2774844eda0af013af`, with origin
`https://github.com/tjburntcc-dot/MIDAS.git`. This exactly matched the user-reported
state; no provenance discrepancy or subsequent-work explanation was needed.
The eight-question inventory was reported as a progress update before editing code.
The dedicated worktree `var/foundry-worktree-027` and branch were created from that
verified commit. Implementation commits made afterward are not the base. Existing
FileStore application data and campaign paths stay outside this new runtime.

The architecture's earlier default of PostgreSQL plus a durable workflow engine
is a future production direction. The current user instruction narrows this
mission to a local, synthetic laboratory and authorizes native Node SQLite.
That current instruction governs Mission 027. It does not change the existing
FileStore contract or claim that FileStore has been migrated to SQLite.

## Section N inventory

### 1. Governance, branch, and recovery boundary

* No additional `AGENTS.md` was found in the checked repository/ancestor paths.
  The user's supplied AGENTS instructions govern model economics. Applicable
  repository references read were `docs/DEVELOPMENT.md`, `docs/LOCAL_WINDOWS.md`,
  `QUICKSTART.md`, `CURSOR_HANDOFF.md`, and
  `docs/MIDAS-OQ-SECONDARY-GOVERNANCE-HARDENING-016.md`. The entire supplied
  977-line architecture was read. Its SHA-256 is in the preservation evidence.
* The original checkout was the only worktree at preflight. No tracked or
  untracked canonical edit needed relocation. Campaign-recovery artifacts
  stay in their original namespace, with their frozen trust roots unchanged.
* Existing repository persistence is `FILE_STORE`; `packages/db/src/schema.ts`
  explicitly labels PostgreSQL/Drizzle as documentation-only.
* `packages/db/src/file-store.ts` has single-file atomic temp-write/rename with
  retry for Windows locks. It does not supply multi-record transactions or a
  durable external-effect boundary.
* Foundry 027 is isolated at `packages/foundry`; it must not modify frozen or
  campaign data. The campaign remains a separate proving-ground boundary.
* Mission sources 17/18 and checkpoints 19--26 already exist; no separate formal
  mission registry was found. Conservatively use 027 and document the mapping.

### 2. Language, runtime, package, schema, tests, and normal commands

* The repository is TypeScript/ESM. The root declares `pnpm@9.15.4`; the installed
  CLI was `pnpm 11.19.0`, with Node `24.19.0` and native SQLite `3.53.3`.
  root commands are `pnpm test`, `pnpm build`, and `pnpm typecheck` when a
  package supplies the corresponding script.
* No installed AJV/Zod/pg/Temporal/pg-boss or repository TypeScript compiler was
  found. Existing validators are handwritten; the laboratory follows that
  convention and introduces no dependency. Foundry declares `node >=24.19.0` and uses Node's built-in `node:sqlite`.
  No SQLite npm dependency, ORM, database server, or migration package was
  installed.
* Foundry tests use Node's native test runner:
  `node --test test/*.test.ts src/lab/*.test.ts` from `packages/foundry`.
* Cursor's bundled TypeScript `6.0.3`, discovered after the initial setup, can
  provide syntax checks for the TypeScript source. No full semantic TypeScript
  typecheck is represented as completed by this record; the Foundry package
  does not currently expose a `typecheck` script.
* Existing MIDAS evaluation tests use Node test plus `tools/register-ts.mjs`.
  Relevant non-sensitive checks include `restart.test.ts`,
  `isolation-structural.test.ts`, `company-ops.test.ts`, `model-cost.test.ts`,
  and Checkpoints 19--26.

### 3. Existing workflow, queue, restart, retry, approval, and cancellation

Existing application primitives are useful behavioral references:

* `packages/eval/src/conductor.ts`: `submitObjective`, `planObjective`,
  `tickObjective`, `runUntilBlocked`, `pauseObjective`, `resumeObjective`,
  `cancelObjective`, and `objectiveView`. The conductor persists objectives,
  plans, tasks, activities, approvals, and summaries in FileStore.
* `packages/eval/src/work-item.ts`: finite state transitions require actor and
  reason, preserve provenance/cost, and reject illegal transitions.
* `packages/eval/src/approval-actors.ts`, `approval-queue.ts`, and
  `approval-reconciliation.ts`: local-owner labeling, read-only queue
  projection, content-bound approval, and stale-approval reconciliation.
* `packages/eval/src/conductor.ts` binds approval decisions to a content hash
  and revision. `FileStore.putApprovalDecision` is append-only.
* `packages/eval/src/restart.test.ts`, `checkpoint23.test.ts`, and
  `company-ops.test.ts` cover existing persistence/restart, bounded workflow
  behavior, approval gates, and provenance. They do not establish atomic
  recovery around a real external effect.

Foundry 027 does not extend that FileStore workflow. It provides a finite
controller for one laboratory episode only. The implemented controller records
dispatch intent before an effect; an unresolved effect moves to reconciliation
and is never silently retried.

### 4. Database, migrations, artifacts, and identifiers

FileStore remains the active MIDAS application persistence. Its `stateDir` and
`artifactsDir` helpers live in `packages/db/src/locate.ts`; workspace path
validation lives in `packages/eval/src/workspace-isolation.ts`.

Foundry 027 owns a separate local SQLite state store at
`packages/foundry/src/state.ts`. It sets:

```sql
PRAGMA busy_timeout = 10000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
```

The store presently supports database schema version `1` through SQLite
`PRAGMA user_version`; it is the Foundry-local migration/version boundary.
Transactions are synchronous by design: async work inside a database
transaction is rejected, so network/effect execution occurs outside the
transaction after durable dispatch intent.

Foundry records scope-qualified state, immutable canonical hashes, record
references, approvals, action intents, receipts, events, and a local artifact.
The `Scope` contract includes tenant, business, run, and data-policy version;
the current mode is deliberately only `fixture`.

### 5. Model/provider adapters, cost, tracing, and structured contracts

Existing reusable MIDAS code includes:

* `packages/model/src/index.ts`: `ModelProvider`, `CompleteRequest`,
  `CompleteResponse`, `FixtureProvider`, and `OpenAIResponsesProvider`.
* `packages/eval/src/provider-gateway.ts`: safe connection-status and
  verification metadata without exposing keys.
* `packages/eval/src/model-routing.ts`: model routing/disclosure controls.
* `packages/eval/src/spend.ts`, `spend-ledger.ts`, `call-budget.ts`, and
  `model-cost.ts`: aggregate caps, usage records, call budgets, and
  price-provenance-aware model cost calculation.
* `packages/eval/src/schema-guard.ts` and `worker-spec.ts`: structured-output
  validation and generic worker/evaluation concepts.

Foundry's domain port is `ModelPort` in `packages/foundry/src/contracts.ts`.
The CLI is fixture-only: it validates `port.kind` before invocation and validates
the returned route kind afterward. Fixture model calls carry zero input/output tokens and
known zero model cost. The report separately preserves the known simulated
fixture delivery charge of 25 USD minor units and treats human-review valuation
as unknown.

`packages/foundry/src/model-port.ts` contains a typed, non-CLI-enabled OpenAI
Responses transport adapter. It adds typed model/output/deadline/token-limit
admission inputs, `max_output_tokens`, `AbortSignal.timeout`, strict JSON
schema validation, no automatic retry/fallback, provider request metadata, and
budget reserve/settle/uncertain callbacks. Its comments and tests state that
no provider calls were made for Mission 027.

The older `OpenAIResponsesProvider` remains an established adapter reference,
but its exported request contract has no typed output-token cap, deadline, or
cost-cap field. A later F2 admission must use the typed transport adapter (or
an equivalent typed extension), not assume a domain `maxCost` field is enforced
by that older adapter.

### 6. Authority, tenant isolation, idempotency, and receipts

Existing application controls include content-hash approvals and application-
level workspace isolation. They explicitly are not enterprise IAM.

Foundry 027 adds local laboratory controls:

* `packages/foundry/src/authority.ts` authenticates synthetic principals using
  token hashes and `timingSafeEqual`; it is a local test principal mechanism,
  not production identity management.
* Scope checks bind principal tenant/business permissions to the run scope.
* `Authority.reserve` atomically checks business/grant caps, writes an
  idempotency record keyed globally within the business, reserves the action
  amount, and records dispatch intent.
* Changed requests with a reused idempotency key are refused. The fixture
  service independently detects an idempotency key paired with a changed
  request hash.
* Reconciliation retains reservations for unknown/provisional observations.
  Release requires a known settled cost and, for a negative observation, an
  authoritative verified zero-effect result.
* Confirmed observations require payload hash, receipt identity, one effect,
  and service-observation authentication before verification can complete.

This is an HMAC-SHA256 authenticated fixture-service approach only: the fixture
service signs the canonical request-hash/observation body and the local adapter
checks that attestation. It proves the test boundary and receipt/reconciliation
mechanics, not a general production service-authentication protocol or a
real-world action receipt. Before dispatch the run pins a persistent service
instance identity. A fresh database with the same credential is refused during
reconciliation, preserving the original unresolved reservation.

### 7. Non-sensitive OQ interfaces and the no-coupling boundary

The safe role-level references are `packages/eval/src/opportunity-qualifier.ts`
(`QUALIFIER_*` objectives/prohibitions/authority/schema/spec exports) and
`packages/eval/src/worker-spec.ts` (generic worker contract/hash/scoring).

No OQ HTTP/UI adapter was found in `apps/api/src` or `apps/web`. The package
barrel also exports campaign/telemetry/governance functions, so Foundry 027 does
not depend on that broad barrel. It does not read or invoke campaign tools,
payloads, evaluation, unblinding, selection, certification, recovery, or
governed planning. OQ's useful general design lessons are immutable contracts,
separated evaluator authority, and honest no-winner outcomes.

### 8. Local execution capability and constraints

Docker and psql executables and PostgreSQL/Temporal/Docker services were not found.
WSL enumeration was denied and was not needed; WSL availability is unverified.
Node `24.19.0` and its built-in SQLite support are the available local runtime
for the laboratory. No install, persistent external service, container, WSL,
database server, or provider call is needed for the fixture proof. Docker or a
separate database service is not a dependency of Mission 027; WSL enumeration
was not required and is not assumed available.

Process tests start only local fixture child processes and a local fixture
service backed by a temporary SQLite file. They use loopback HTTP only and make
no external network/provider calls. `packages/foundry/test/process.test.ts` covers a restart after a decision
checkpoint, restart at an approval wait, a service effect that occurs before
the domain receipt, authoritative absence after dispatch intent, and two
independent processes competing for one business cap. In the effect-before-
receipt test, worker and fixture service restart, reconciliation retains a
single effect, and the domain action completes with exactly one attempt.

`packages/foundry/test/authority.test.ts` additionally covers timeout-after-
effect reconciliation, unknown/provisional cost reservation, cancellation while
an effect is uncertain, changed-request idempotency conflicts, and receipt-ID
swap rejection despite a valid service signature.

## Native SQLite finite-controller decision and limitations

Mission 027 deliberately uses one local SQLite writer at a time with WAL,
FULL synchronous mode, foreign keys, a busy timeout, and `BEGIN IMMEDIATE`.
This supports the required local proof: durable state transitions, capped
reservations, process restart, and reconciliation without duplicated fixture
effects. It is smaller than introducing Temporal or another scheduler before a
laboratory episode proves it needs one.

It is not a production workflow platform. It provides no multi-host leader
election, distributed queue, cloud failover, tenant authentication service,
provider-spend guarantee, production action integration, or durable external
transaction. `AbortSignal.timeout` in a future admitted model transport means
the local caller has uncertainty; it does not prove the provider stopped
processing or billing. A live F2 comparison therefore remains separately gated
by explicit authorization, model identity, input/output token ceilings,
deadline, actual call cap, sourced pricing/effective date, hard pre-reservation,
protected manifests, and reviewer/correction measurement.

## Current evidence boundary

The Foundry report may claim only fixture state, isolation, authority,
idempotency, process-recovery, receipt, accounting, and learning-decision
mechanics. It may not claim live model performance, role specialization,
customer value, production reliability, real revenue, real costs, or a
commercial action. The complete first-role F2 comparison remains future work
after separate authorization.
