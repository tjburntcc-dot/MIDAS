# Mission 029: integrated business workflow and team capability

**Current governing direction:** MIDAS is an adaptive business-building system; the workbench is its interface. See [BUSINESS-FOUNDATION.md](BUSINESS-FOUNDATION.md) for the implemented business-understanding → prioritization → assignment → execution → verified-feedback loop, decision ownership, and offline commands. The completed live laboratory is closed in [LAB-CLOSURE.md](LAB-CLOSURE.md). The original implementation/proposal information below is preserved historical context; it is not a fresh execution authorization.

Mission 029 was available: no branch, worktree, mission file or existing phase implementation used 029. Work began from verified clean Mission 028 `f6dce49150519ca5551d66ee0eb8a85624cf3c6b`, on `codex/business-workflow-team-v0-029`, in `C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029`. Origin remains `https://github.com/tjburntcc-dot/MIDAS.git`. Canonical and Foundry 027 are preserved. No historical campaign evidence is a dependency.

This phase implements a separately authorized experiment entry point over the existing finite controller, SQLite state, ModelPort, Responses transport, admission ledger, authority, fixture service and independent checks. It uses closed offline mocks. Offline passes establish software behavior, not AI competence, specialization improvement or optimal team assignment. Support is a replaceable proving environment.

Read [COMPLETION.md](COMPLETION.md) for executed evidence and limitations, [LIVE-EXPERIMENT.md](LIVE-EXPERIMENT.md) for the unapproved numerical proposal, and [DESIGN.md](DESIGN.md) for fairness, acceptance and reuse.

## One local command path

No installation, provider credential or service provisioning is required. Node 24.19.0 supplies TypeScript execution and SQLite.

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029
$wf = 'packages/foundry/src/workflow/cli.ts'
$root = 'var/workflow-your-fresh-demo'
node $wf prepare --root $root --mode mock
node $wf preflight --root $root
node $wf run --root $root --run W-001-single
# Stops after three model MOCK calls, before any fixture effect.
node $wf status --root $root --run W-001-single
node $wf approve --root $root --run W-001-single
# Read the exact artifact, evidence, consequence and cost. Type APPROVE or DENY.
node $wf resume --root $root --run W-001-single
node $wf report --root $root
```

`approve` is authenticated through a freshly enrolled local fixture principal bound to this business and exact payload. It grants only the synthetic effect. It does not authorize model spending. The terminal records actual approval-screen time separately from correction work; neither implies independent reviewer expertise. No real provider credentials are used for mock execution.

To reproduce all twelve offline workflows without pretending a human approved them:

```powershell
node $wf demo --root $root
node $wf report --root $root
```

The **mock-only** demo uses explicit `fixture-demo` approval provenance. It never creates human review or timing. Repeating it resumes persisted runs; it does not purchase new attempts or duplicate effects. Open `$root/reports/comparison.html` to inspect the outcomes and delivered artifacts. `comparison.json`, `failures.json` and `capabilities.json` hold reproducible observations and analysis. The completed demonstration is at `var/workflow-029-completion`.

Ordinary batch operation is `run-all`: advance each declared workflow in the counterbalanced schedule until its wait/terminal state. Each positive effect still needs exact approval; no blind batch approval is offered. Under a future live grant the first diagnostic pair must finish and its review gate must be recorded before the remaining ten workflows can start. `run-all` continues independent workflows while an exact publication approval is pending, within the serialized provider cap.

## Review and timing

```powershell
node $wf review --root $root --run W-001-single
node $wf report --root $root
```

The review command presents worker-visible facts/policy, actual decision, draft correction, artifact and outcome evidence, with a small explicit rubric. It requests judgments, assistance/timing provenance and the minimum correction. Separate monotonic scoring/correction timers run only within the same uninterrupted process. Assisted, unreliable or interrupted times remain null. Reviews are immutable and bound to the observation; a reviewer name is not proof of independence or expertise. The command argument and developer exposure can unblind the arm despite labels being omitted from the packet.

## Failure and recovery

`status` shows the last durable phase, exact wait/failure, valid next action, calls and retained exposure. A pending model completion is not automatically resubmitted. Durable validated model results can be recovered without another request. A fixture effect with lost response resumes through authenticated reconciliation; it is not dispatched again. Restart after dispatch intent but before an effect seals authoritative absence and reports delivery failure rather than buying a retry.

Mock-only fault controls include `--fault malformed`, `wrong_model`, `transport_timeout`, `handoff_loss`, `false_inspection`; process tests use `--crash` at durable boundaries. These are never enabled in live execution. Failed roots and observations are preserved. Source/configuration changes require a new versioned experiment; old roots pin their original implementation, so use the recorded checkout to resume them. There is no automatic repair/retry budget.

## Checks

```powershell
node --test packages/foundry/test/*.test.ts packages/foundry/test/experiment/*.test.ts packages/foundry/src/lab/*.test.ts
node packages/foundry/tools/typecheck-workflow.mjs C:/Users/14844/AppData/Local/Programs/cursor/resources/app/extensions/node_modules/typescript/lib/typescript.js C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@types
```

The strict semantic check uses existing TypeScript 6.0.3 and existing Node declarations with `skipLibCheck`; it is scoped to Foundry, not a whole-repository claim. No campaign/evaluator execution, sealed inspection, production action, model call or token-count request is part of these commands.

## Interactive integrated workbench

See [WORKBENCH-COMPLETION.md](WORKBENCH-COMPLETION.md) for the runnable owner journey, assignment reuse and verification. The [pre-extension reconciliation](WORKBENCH-RECONCILIATION.md) preserves the original gaps. [WORKBENCH-LIVE-PROPOSAL.md](WORKBENCH-LIVE-PROPOSAL.md) is unsigned preparation only.
