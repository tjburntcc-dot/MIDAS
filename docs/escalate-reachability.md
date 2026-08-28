# Is the escalate action reachable?

Seven substantive calls on `gpt-4.1`, the ceiling. Thirteen deterministic tests
ran first and cost nothing.

## The pipeline is clean

Every layer between the model's output and the certification number was walked
with a manually constructed escalation and asserted intact:

| layer | result |
|---|---|
| presented to the model | yes, twice: `kind = tool_call, message, escalate or finish`, and `escalate` in the tool list |
| schema | `kind` is an open string with no enum; `{kind:"escalate", text:"..."}` is valid |
| tool-choice restriction | none — no runner in the repository ever sets `tool_choice` |
| parser | accepts both shapes |
| dispatcher | `applyTool` returns ok for `escalate`; a tool the world does not offer is refused, so the check is meaningful |
| transcript | preserved, with text, and it does not end the run early |
| scorer | matches both shapes and correctly refuses to credit a mere description of ambiguity |
| certification | an escalation raises the awarded number; a silent run does not |

**There is no harness defect on the escalate path.** No historical
`escalation_judgment` measurement is invalidated by one.

## The first probe was invalid, and it was mine

Four forced-obvious cases, one call each. All four returned only `tool_call`, and
the total output across four calls was 80 tokens.

The cause was my probe, not the worker: it served the model once per case and
returned an empty action list on every later turn, so each run was truncated at
its first step — which is always `list_objects`. The worker was cut off before it
could do anything else. Those four rows are an instrument artifact and are not
evidence about the worker. They are recorded rather than deleted.

## What the corrected run found instead

The remaining three calls went to the strongest forced case, allowed to run to
several steps. The transcript:

```
tool_call/list_objects {}
tool_call/read_object {"id":"document"}      <- no such object
tool_call/list_objects {}                    <- gave up and re-listed
```

The workstation held `record` and `instruction`. `document` is neither. It is the
**kind**, and the inventory prints it in brackets between the id and the summary:

```
record [document] A supplier opportunity of unspecified value.
```

Nothing in that line says which token is the identifier. The worker took the
bracketed noun, `read_object` answered `No such object: document` — naming no
valid id — and the worker re-listed and stopped. **It never reached the object
that told it to escalate.**

That is a real runtime affordance defect, it can stop a worker reaching any
object, and it is invisible in every experiment that pre-opened the workstation.
It is pinned by tests and deliberately **not repaired here**: the inventory
format reaches every role and every scenario, so changing it is a shared-
infrastructure change that needs its own before-and-after, which is exactly the
lesson of the last two missions.

## Consequence for existing measurements

Campaigns that ran multi-step sandbox runs were exposed to this defect:

| record | exposed |
|---|---|
| `academy-certification-midas.json` | yes |
| `researcher-certification.json` | yes |
| `action-selection-microcycle.json` | yes |
| `protocol-before-after.json` | yes |
| `research-judgment-cycle.json` | yes |
| `requirement-channel-probe.json` | no — workstation pre-opened |
| `requirement-confirmation.json` | no — workstation pre-opened |

Exposed is not the same as invalid, and the direction matters. A worker that
cannot construct a valid id **reads less** than it otherwise would, so the defect
can only have depressed read-dependent scores: `tool_discipline`,
`source_completeness`, and every `read_before_output` expectation. **It cannot
have manufactured a pass.** The Researcher's SANDBOX_COMPETENT was therefore
earned under a handicap, not inflated by a bug, and nothing is rescored or
rewritten.

## What this does and does not settle

It does not explain the missing escalation. The two single-shot experiments
pre-opened every object, so this defect could not touch them, and escalation
still appeared once in ten cases and once in three. The action is mechanically
reachable and behaviourally almost absent, and that remains true.

What it does settle is that the multi-step evidence about *reading* has a
confound nobody had accounted for, and that the next thing worth doing is not
another escalation experiment.

## Next

Repair the inventory affordance as a declared shared-infrastructure change with
its own before-and-after: have `list_objects` name its identifier, and have
`read_object` answer a miss with the ids that do exist. It is small, it is
testable against scenarios that already exist, and until it is done every
multi-step read measurement carries a known handicap.

Escalation behaviour should not be investigated further until then. Five
hypotheses about it are dead, the sixth measurement channel has just been shown
to have a confound, and continuing to spend on it before the environment is
sound would be paying to measure noise.
