# Current Mission 028 evidence

See [EXPLORATORY-FIRST-PASS-RESULT.md](EXPLORATORY-FIRST-PASS-RESULT.md) for the latest actual development outcome: eight clarified-policy baseline attempts, seven assisted acceptances, one unresolved task-intent/rubric mismatch, and no justified challenger or protected evaluation. Earlier setup/completion sections below are historical infrastructure handoffs.

# Mission 028: executable role baseline experiment

Gate 1 (offline implementation and readiness) is complete. No actual-model attempt,

protected final case, measured role improvement, customer validation, or production

qualification is claimed. This experiment develops a reusable role evaluation method;

billing-status support is its first replaceable task adapter, not MIDAS's business thesis.

Read [PROVENANCE.md](PROVENANCE.md), [EXPERIMENT.md](EXPERIMENT.md),

[AUTHORIZATION.md](AUTHORIZATION.md), and [COMPLETION.md](COMPLETION.md).

The implementation reuses Foundry's ModelPort, Responses bridge, SQLite StateStore,

contracts and support artifact. It adds one scoped experiment account, not another

workflow engine. The original fixture CLI still refuses live routes.

## Installed setup and offline commands

Run PowerShell from the isolated worktree. Node 24.19.0 is installed; no npm install,

provider credential, service provisioning, or network call is needed for these commands.

Use native Node TypeScript support, not the repository's older regex stripping loader.

```powershell

Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028

$cli = 'packages/foundry/src/experiment/cli.ts'

$exp = 'var/foundry-experiment-028-release'

node $cli report --root $exp

# Optional fresh offline rehearsal (choose a new empty root):

node $cli prepare --root var/foundry-experiment-028-release-new

node $cli rehearse --root var/foundry-experiment-028-release-new

node --test packages/foundry/test/*.test.ts packages/foundry/src/lab/*.test.ts packages/foundry/test/experiment/*.test.ts

```

`prepare` requires an empty/new root and writes the open cases, baseline, proposed spec,

unapproved authorization request, and a local owner signing key. It does not authorize

spending. `rehearse` uses a separate SQLite file, synthetic credentials and injected

in-memory HTTP responses. Its 24 simulated cents are not API spend. Rehearsal intentionally

uses identical outputs in both arms and must never report measured improvement.

An already prepared and rehearsed root is at `var/foundry-experiment-028-release` in this worktree.

Do not prepare it twice. `report` is safe to run now. Intermediate ignored rehearsal roots

are not final evidence. Public copies of the final draft are in `prepared/`; owner keys,

credentials and SQLite files are never committed.

Scoped semantic check, using existing compiler and declaration packages:

```powershell

node packages/foundry/tools/typecheck-experiment.mjs C:/Users/14844/AppData/Local/Programs/cursor/resources/app/extensions/node_modules/typescript/lib/typescript.js C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@types

```

This is strict semantic checking of 13 reachable source files, not merely transpilation.

Dependency declarations are skipped. Installed Node declarations are version 25.9.5,

while runtime verification uses Node 24.19.0. No repository-wide typecheck is claimed.

## Approved smoke and development sequence

Everything below this point requires the approvals and people in AUTHORIZATION.md.

No command below has been executed against a provider in this mission.

1. Confirm current official pricing, project access and exact model route. Resolve the

   request with explicit owner approval, project ID, absolute credential-file path,

   expiration timestamp and approval reference. The API key must be supplied by the

   authorized project owner via an OS-protected file, not a prompt, command argument,

   `.env` scan or tracked file. The harness reads only the explicitly named file.

2. Configure the named independent reviewer's public key and identity in `spec.json`.

   Keep their private key under their control. Configure the billing authority's public

   key. These are new experiment trust roots, unrelated to Protocol-010.

3. Have the owner set `approved: true` in a copy of `authorization.request.json` only

   after explicit approval. For the proposed whole-mission conditional envelope, set

   `allowProtected: true` and change permittedData to include independently custodial

   synthetic final cases after freeze/release. The signed final release remains mandatory.

   Do not reduce or change numerical fields without recomputing/reviewing the spec hash.

4. Sign the approval and run the two-attempt smoke. Review both outputs and actual

   provider model/usage before development. An error must be investigated; there is no

   automatic retry, model fallback, or new attempt ID to conceal a failed cell.

```powershell

node $cli authorize --root $exp --file "$exp/authorization.approved.json" --key "$exp/auth/owner.key"

node $cli smoke --root $exp --condition baseline

node $cli review-pack --root $exp

node $cli report --root $exp

node $cli develop --root $exp --condition baseline

node $cli review-pack --root $exp

```

Smoke allows 2 attempts. Each development pass is 12 cases x 2 repeats = 24 attempts;

72 development attempts allow one initial baseline pass, one refined baseline pass if

needed, and one challenger development pass. Directly authored baseline instructions

already address evidence, policy precedence, uncertainty, prompt injection, escalation

and unauthorized promises. Actual development must establish its adequacy; readiness

does not mean a strong baseline has already been empirically established.

Record every baseline edit, rationale, model usage, and measured human work in

`baseline.json.development` before creating the challenger. Do not infer historical

engineering hours. If baseline instructions change, give the version a new value; old

attempts remain counted. Repeating an unchanged command reports prior attempts and does

not issue another call. Same-cell failures cannot be rerun. The authorization and

implementation are pinned; changed code or a changed authorized route requires explicit

review, not a fresh ledger to evade old exposure.

## Reviews and specialization

`review-pack` creates `reports/review-packet.json` containing opaque attempt IDs, authorized

inputs, outputs, diagnostic flags and blank review fields. It does not identify the arm

in the packet. The developer can inspect development data; final packets stay private.

The operator request never includes checks, labels, reference answers or case-family IDs.

Use `templates/review.json` for each review. Copy the packet's attemptId/attemptHash,

complete all dimensions, record actual correction start/finish timestamps, and sign it.

Accepted means the original output needs no substantive correction and every dimension

passes; correction time measures the work needed to obtain an acceptable result even

when the original attempt fails. Zero is valid only if observed, never a missing value.

Review includes a critical-failure decision separate from ordinary acceptance.

```powershell

# On the reviewer's trusted account; keygen is a local key utility, not an approval.

node $cli keygen --file reviewer.key

node $cli sign --file review.completed.json --key reviewer.key > review.signed.json

node $cli review --root $exp --file review.signed.json

```

After signed reviews identify an actual baseline failure, write a procedure responding

specifically to that failure. Change only the operator procedure/checklist; facts,

output contract, tools, overlay, model/settings and resource caps remain equal.

```powershell

node $cli candidate --root $exp --procedure challenger-procedure.txt --failures ACTUAL-ATTEMPT-ID --rationale 'Describe the observed development failure and how this checklist addresses it.'

node $cli develop --root $exp --condition challenger

node $cli validate --root $exp --condition baseline

node $cli validate --root $exp --condition challenger

node $cli review-pack --root $exp

# Complete and sign reviews for all 24 validation attempts as above.

```

The candidate command refuses fabricated IDs, fixture-source failures, unreviewed

failures, failures from a different current baseline, and a second challenger. Validation

is open, explicitly synthetic selection material: it is not the confidential final set.

Freeze requires paired validation, no challenger critical failure and at least baseline

acceptance. A rejected candidate does not silently get a new final test or more budget.

If no baseline failure exists, record that specialization is not justified; do not invent

one or weaken the baseline to make a challenger possible.

## Protected boundary, freeze, and comparison

Before anyone creates final cases, the independent custodian provisions an already

approved separate POSIX host/account/private root, inaccessible to the developer and

optimizer. No infrastructure provisioning is authorized here. A second agent or directory

on this Windows host cannot satisfy the gate. An administrator must audit login, network,

backups, shared mounts and feedback paths; the runtime's hostname/uid/0700 checks do not

prove those organizational facts. Sign `templates/boundary.json` with the configured

custodian key. Keep the final labels, grader instructions, calibration answers and

item-level feedback in that private root. Only signed commitments return to development.

The custodian creates 48 new cases in 24 independent policy/invoice lineages, two cases

per lineage, four lineages per each of the six strata. Use the exported `Case` contract,

`split: "protected"`, and synthetic rights. It requires label/check objects separately

from `input`. This repository deliberately does not generate or include those cases.

Create a private detailed grading manual and reference answers; calibrate the reviewer

on separate material. Record the manual hash and calibration result in spec.calibration.

On the custodian host, use the same source revision and public prepared config. Set

spec.custodian, custodianPublicKey, reviewer, reviewerPublicKey and calibration before

manifest generation. On development, set matching public values. The documented model

alias has no verified immutable snapshot yet: `modelRevision` must remain null until

an exact immutable revision and official evidence are established. Do not assert that

an alias is immutable to get past freeze. A route change requires renewed approval and

comparable development on that route; it cannot reset accumulated costs silently.

```powershell

# Run only on the independent custodian host; paths are illustrative POSIX locations.

node $cli custodian-manifest --root /private/experiment --boundary /private/boundary.signed.json --cases /private/final-cases.json --key /private/custodian.key

# Copy ONLY /private/manifest.json and public calibration/attestation back to development.

node $cli freeze --root $exp --file custodian-manifest.json

```

Freeze hashes the complete spec, baseline/challenger, validation, model/settings/context,

analysis, limits, commitments, review calibration and authorization. It refuses an

unmeasured baseline effort field or missing immutable-model evidence. After freeze,

stop the development process and transfer a consistent, closed experiment SQLite ledger,

public authorization, role files, spec and freeze to `/private/experiment`. Keep the

owner private key on the owner's account; do not copy it to workers. Do not run multiple

copies of the account database. The initial grant records both the Windows development credentialFile and a separate

protectedCredentialFile (for example /private/credentials/openai.key) supplied by the

owner for the custodian host. Protected execution verifies that file is inside the private

root. The grant is copied unchanged; the developer credential is never used there.

The owner reviews the exact freeze and signs `templates/final-release.json`, filling

freezeHash, authorizationHash, projectId, exact private experimentRoot and expiry. This

is the protected-stage release within the approved numerical envelope, not an inference

that preparation authorized spending. All item-level files remain private.

```powershell

node $cli sign --file final-release.completed.json --key "$exp/auth/owner.key" > final-release.signed.json

# The following commands run only inside the custodian environment.

node $cli evaluate --root /private/experiment --boundary /private/boundary.signed.json --cases /private/final-cases.json --release /private/final-release.signed.json

node $cli review-pack --root /private/experiment

# Complete/sign/import the single new review before invoking evaluate again.

node $cli review --root /private/experiment --file /private/review.signed.json

# Repeat one admission + review until done; any confirmed critical failure stops admissions.

node $cli aggregate --root /private/experiment --boundary /private/boundary.signed.json --key /private/custodian.key
node $cli replay-analysis --root /private/experiment --boundary /private/boundary.signed.json

```

The aggregate is written once and signed. Exact scored observations are saved separately
as private frozen-observations.json and hash-bound to the aggregate. replay-analysis
verifies those hashes and reproduces the result without a provider call. It contains paired statistics, failure counts,

critical counts, resource results and observation hashes, not final items. Only this

aggregate may leave the custodian environment. A partial, contaminated, unreconciled or

under-reviewed study cannot claim improvement. Actual outputs need not repeat byte for

byte; frozen recorded observations and analysis must reproduce exactly.

## Exposure, reconciliation, interruption and reporting

Every admitted attempt reserves the full safe integer USD minor-unit amount before

credential access to token counting. The exact same complete serialized request is used

for the provider-compatible token count and inference. An explicit 10% + 256-token

margin is added to the provider count. There is no character-ratio estimate or fallback.

Reservations and dispatch intent commit before HTTP; unique attempts bind exact bytes.

Token counting can fail after reservation. Unknown/provisional amounts retain full

exposure. HTTP failures, refusals, incomplete output and invalid contracts count as attempts.

Provider usage is provisional, never an invoice. The designated billing authority must

obtain actual evidence assigning closed charges (including count calls if billed) to the

attempt. Sign `templates/invoice.json` with the configured billing key. If the provider

cannot close/attribute an uncertain attempt, retain the reservation and report unknown

cost; do not fabricate zero from absence of a response. This authority is not the model.

```powershell

node $cli sign-invoice --file invoice.completed.json --key billing.key > invoice.signed.json

node $cli reconcile --root $exp --file invoice.signed.json

node $cli interrupt --root $exp --attempt ACTUAL-ATTEMPT-ID

node $cli contaminate --root $exp --reason 'Describe actual exposure or contamination.'

node $cli report --root $exp

```

A signed closed invoice settles and releases atomically. Exact duplicate statements are

idempotent; contradictory statements fail. An invoice exceeding reservation records the

liability and halts new admissions. Interrupting never releases exposure or permits a

retry. Report/review/reconcile work after the spending grant expires. A killed incomplete

attempt makes final comparison incomplete; it cannot be replaced to improve the result.

The ledger is an admission safeguard for one authoritative SQLite account, not an external

billing hard limit. Provider cancellation, cache-write billing, count-endpoint charges,

late settlement and copies run by an administrator remain outside a local ledger guarantee.
