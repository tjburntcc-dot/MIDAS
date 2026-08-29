# The certification target that described a system that never ran

## What was wrong

`CT-60ca32fb0995` was the target the Auditor was certified against. It was false
in two places:

| field | recorded | actual |
| --- | --- | --- |
| `tools` | `["sandbox"]` | none; the run was single-shot |
| `executionEnvironmentId` | `EE-8880ef0d5a0f`, the workstation | no protocol, no inventory, no action schema |

Neither was anyone's lie. `adaptedTarget` hardcoded a sandbox tool list for every
role, and the runner stamped the current environment without asking whether the
run had used it. Both defaults were true of the Researcher, which is the worker
they were written for. Nobody checked when the Auditor reused them.

The consequence was not cosmetic. The cap that blocked the Auditor at TRAINING
was `sandbox_tool_use` 0/6 — a measurement of an absence that the target
asserted was present.

## The repair

`adaptedTarget(worker, baseModel, actual)` now requires the caller to state the
tools the worker genuinely had, and throws otherwise. Every historical id that
was truthful is byte-identical: the Researcher is still `CT-44e7595af4a1`.
`CT-60ca32fb0995` is not rewritten. It is recorded as malformed, and two new
targets exist beside it:

- `CT-367f2d547bf0` — the corrected no-tool, single-shot target. Same worker,
  same model, same knowledge, same policy. Only the two false fields move.
- `CT-6bfb7037bf36` — the read-only-tool target, with `list_evidence` and
  `read_evidence` and nothing else.

## Portability, computed rather than argued

Two live rules were run. They disagree, and the disagreement matters.

| leg | `recertificationScope` | `evidencePortability` | sealed exam |
| --- | --- | --- | --- |
| malformed → corrected | not invoked: relabelling | not invoked | survives |
| corrected → read-only | `partial`, invalidates tool-use, simulation, team-integration, **not sealed_exam** | `none`, all three components change | **does not survive** |

The target rule alone would have carried the twelve sealed cases into the
tool-enabled configuration. The environment rule refuses, and it governs: the
Academy has one representation for partial portability and it operates below the
environment, not across it.

So the read-only Auditor holds **no sealed-exam evidence at all**, and
SANDBOX_COMPETENT — which needs twelve sealed and six tool-use cases — was never
reachable in this mission. That was established before any model was called.

## What the run bought

Eight sealed cases, 24 calls, against `CT-6bfb7037bf36`. Three critical gates
failed and no tool-use evidence was produced. The declared result is not revised.
But two of the three failures were mine:

- **`ambiguousHandling` 0/2 — gold.** Both underdetermined cases asked whether
  the *subject matter* could be settled from the records. The audit question is
  whether *the output* is sound, and an output that converts silence into a
  stated absence is defective either way. Blind independent adjudication
  returned `fail` on both at high confidence. The auditor was right; the
  reference answers were wrong.
- **`decisiveReadRate` 0.714 — harness.** Preflight raised an advisory that the
  turn budget equalled the workflow length. I silenced it by relabelling the
  workflow shape from three steps to two rather than raising the budget. The
  worker then returned one tool call per turn: list, one read, forced finish.
  Cases needing two records opened were unreachable.

One finding belongs to the worker — AT-03, a well-argued half-deliverable passed
without opening the signed scope annex — and even that is confounded by the turn
budget.

## Guards added

- The turn floor is derived from `runtime.expectedTools` plus one. A
  self-declared workflow shape can no longer lower it.
- A sealed set must declare who wrote its reference answers, and is warned when
  nobody independent has checked them. `GOLD_DEFECT` is now the most common
  recorded category, at five, and two of them changed a verdict.
- A preflight refusal writes to its own path. The first version wrote over the
  completed result, and a later dry run destroyed every raw trace the run had
  captured — the traces preflight had refused to run without.

## The state this leaves

The corrected experiment is defined and **refuses to run**. Preflight blocks it
for two reasons, both correct: 40 calls against a 30 ceiling, and a gate on
`ambiguousHandling` that no case now exercises, because repairing the gold
removed both underdetermined cases. Writing a replacement now — after seeing
which way the worker leans — would be writing the gold to the answer.
