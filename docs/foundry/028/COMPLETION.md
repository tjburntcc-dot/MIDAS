# Mission 028 completion packet

Furthest completed gate: **1 â€" verified offline implementation and readiness**.
Gate 2 awaits explicit API project/route/data/numerical authorization and a named reviewer.
Gates 3â€"4 additionally require actual development evidence, immutable model-revision proof,
reviewer calibration, a real separate custodian boundary and a signed protected release.
No measured specialization improvement is claimed. Support remains a replaceable laboratory
adapter, not MIDAS's chosen business or evidence of general business-building competence.

## Repository and local changes

Verified base: `13edfb9796e7d5ed28b86935244ec9917840c0e4`, Foundry 027, clean.
Canonical remains `8d2c6b3db3fe5d1c63493e2774844eda0af013af`, clean.
Origin: `https://github.com/tjburntcc-dot/MIDAS.git`.
Mission 028 was unallocated except for proposal references before this work.
Worktree: `C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028`.
Branch: `codex/foundry-role-baseline-v0-028`.

Local implementation commits:

- `0bed380` â€" scoped model exposure and signed billing reconciliation.
- `1db3bbb` â€" integrated experiment gates, CLI, analysis and focused tests.
- `dbd7259` â€" actual predecessor version and complete baseline measurement checks.
- `1978267`  -  private frozen observations and verified analysis replay.
- The final documentation commit contains this packet and public evidence. Its exact HEAD,
  full changed-file list, status and evidence hashes are recorded after commit in
  `var/foundry-experiment-028-release/completion-receipt.json`. That receipt is outside the
  commit to avoid a self-referential commit hash.

Changed code is confined to `packages/foundry`: ModelPort extension, one behavior-preserving
null-narrowing fix in the support validator, nine experiment modules, two test/helper files,
package commands and the scoped typecheck tool. Documentation/evidence is confined to
`docs/foundry/028`. The original Foundry runtime, fixture CLI, trust roots and campaign
semantics were not changed. No push, merge, deployment or shared-infrastructure change.

## Implemented and observed

| Requirement | Implemented behavior / observed evidence |
|---|---|
| Existing primitives | Reuses native SQLite StateStore, ModelPort, Responses bridge, domain contracts and support artifact. No orchestrator/service added. |
| Reservations and caps | Atomic BEGIN IMMEDIATE admission, stage and aggregate limits, immutable account configuration; separate-process competitors admit exactly one under a 13-cent cap. |
| Exact attempt provenance | Unique IDs bind role, scope, case input, repeat/stage and exact transmitted request bytes/hash. Duplicate same IDs refuse; changed bytes conflict. |
| Conservative token admission | Complete serialized payload goes to official token-count endpoint and inference, with 10% + 256 margin. Oversized/invalid counts refuse inference while retaining exposure. |
| Route and output | Exact request/returned model, strict schema, task contract, usage ceilings and supported settings; wrong route, refusal, incomplete response and invalid output fail and remain accounted. |
| Credentials | Explicit approved project/key-file boundary; no prompt/env/log credential acquisition. Mock tests assert no secret or acceptance-label leakage. |
| Interrupted/uncertain requests | Hard-killed process retains dispatch intent and reservation across restart. Timeout/abort never retries, infers absence, or refunds. |
| Provisional and known cost | Provider usage stays provisional. Signed closed invoices settle atomically; duplicate is idempotent, invalid signature fails, authoritative zero releases, excess invoice records liability and halts. |
| Scope and location | Literal scope keys, no SQL wildcard bleed; source/context separated from labels; development grant bound to host/root. Protected execution binds root, boundary and final release. |
| Human review | Signed dimensional review and measured timestamps bound to attempt/output; missing effort is unknown. Development packet omits arm labels. |
| Baseline/challenger | General-purpose draft plus observed-failure candidate gate; only procedure changes. Tests verify identical transmitted context/settings/schema outside instructions. |
| Freeze | Requires reviewer/custodian commitments, model immutability evidence, baseline effort and reviewed paired validation. Mocked integration reaches freeze and refuses later development. |
| Holdout | Local/same-host boundary refused. Actual separate POSIX boundary required before protected generation; final labels/answers/manuals remain private. No protected cases created. |
| Analysis | Paired lineage bootstrap within strata, repeats kept together, joint quality/risk/resource criteria, conservative all-pass safeguard, incomplete/unknown measurements cannot pass. |
| Reporting | Separate stage costs/exposure, all admitted attempt ledger and review packet, signed aggregate counts/uncertainty without final item-level feedback; no certification/promotion. |

The operational prepared root is `var/foundry-experiment-028-release` in this worktree.
The reproducible command sequence is [README.md](README.md). Draft parameters/rationale
are [EXPERIMENT.md](EXPERIMENT.md); exact proposed access and spending are
[AUTHORIZATION.md](AUTHORIZATION.md). `prepared/` contains public spec, baseline, open
cases and unapproved grant. `templates/` supplies review, invoice, boundary and release
payloads. The CLI signs them locally; signatures do not substitute for human authorization.

## Verification results and limits

- **68/68 Foundry tests passed:** 44 inherited plus 24 experiment tests, including mocked
  end-to-end development/review/candidate/validation/freeze, separate-process concurrency,
  process death, timeout, signature refusal, reconciliation, scope isolation and analysis.
- **26/26 selected adjacent tests passed:** secondary-governance, sealed-grouping authority,
  restart and structural-isolation synthetic tests. The historical-LSE data-dependent case
  remains outside the selected run, using the same explicit exclusion as Mission 027.
- **Strict scoped semantic check: zero errors**, TypeScript 6.0.3, 13 reachable source files,
  existing Node 25.9.5 declarations. Runtime tests use Node 24.19.0; declarations are a newer
  major and skipLibCheck excludes dependency declarations. Not a whole-repository typecheck.
- An initial experiment test invocation using the old regex TypeScript loader rejected
  non-null assertion syntax. Native Node TypeScript testing passes; instructions use it.
  No dependencies were installed to avoid that loader limitation.
- Actual unauthorized `smoke` invocation exited 1 before transport. `report` shows zero
  actual attempts, zero provider exposure and null measured improvement.
- Final offline rehearsal ran 24 attempts through the Responses bridge using 48 MOCK
  transport calls. Both arms used identical fixture outputs; simulated gain is zero,
  decision inconclusive, simulated settled cost 24 cents and unresolved reservation zero.
  These are fixture mechanics, not actual-model quality, spending or measured human effort.

Evidence files: `evidence/tests.txt`, `adjacent-tests.txt`, `typecheck.txt`, `prepare.json`,
`rehearsal.json`, `report.json`, and `unauthorized-smoke.txt`.

Material limitations: no account-specific model access verified, no actual provider request,
no authoritative live invoice reconciliation, no actual baseline development/challenger,
no real human timing, no immutable Sol snapshot verified, no reviewer calibration, and no
separate POSIX deployment/happy-path protected execution. Boundary rejection and downstream
freeze/analysis mechanics are tested; confidential infrastructure itself is not established.
A local trusted SQLite ledger cannot guarantee external billing limits or resist an
administrator copying/rewriting its database. Actual invoice evidence can remain unresolved;
unknown is retained and can block a positive final resource result. The small synthetic
sample supports only its prespecified population, not customer outcomes or rare-event safety.

## Costs, effort and campaign separation

Actual provider calls: **0**. Actual API spend: **USD 0.00**. Outstanding actual provider
exposure: **USD 0.00**. Install/service spend: **USD 0.00**. Model development/evaluation
usage: none. Human correction effort and engineering hours: **unmeasured**. Test durations
are observed in the raw logs; reviewer workload and budget numbers are planning proposals.
The assistant's own subscription/session usage is not measured by this experiment ledger.

No Protocol-010 payloads, sealed identities, finding-set reconstruction, recovery worktree,
frozen evidence or campaign execution were accessed by this mission. Separation is checked
through confined diffs and clean original checkout states, not by opening protected evidence.
The missing original finding-set is not a prerequisite. Existing concurrent worktrees were
preserved. No evaluator campaign, unblinding, production role promotion or certification ran.

## Exact next input

Return the completed [authorization proposal](AUTHORIZATION.md): exact API project,
approved `gpt-5.6-sol` medium route and synthetic data scope, USD 1 smoke / USD 14 development
including validation / USD 26 protected conditional caps (USD 41 aggregate), 290 attempt
maximum, stated token/deadline limits, exact expiry, trusted credential file paths and named
reviewer. Assign the independent custodian/billing authority and confirm availability before
protected work; provide immutable-revision evidence before final freeze. A narrower approval
must be reflected in the spec/grant before starting, not treated as the whole envelope.

After explicit approval, the next executable action is signing that completed grant, then
running the prepared two-attempt smoke command. Continue Mission 028 through bounded actual
baseline development, freeze and protected comparison when its gates are satisfied; no new
broad roadmap or automatic production action is needed. Until then, report Gate 1 readiness,
not measured role improvement.
