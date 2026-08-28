# The Researcher does not escalate because the environment tells it not to

## What was bought, and for how much

61 calls on `gpt-4.1`, 59,864 in / 2,817 out, no frontier model, no judge sweep.
Nine development cases, two arms, one run each. Everything scored deterministically
from the transcript, because the question was about an action and an action is
observable.

## Result

| | action acc. | esc. recall | esc. precision | stopping | recitation | source indep. | liveness |
|---|---|---|---|---|---|---|---|
| A control (or-v3) | 0.333 | **0.00** | n/a | 0.333 | 0.00 | 80 | 62.5 |
| C candidate (action procedure) | 0.333 | **0.00** | n/a | 0.500 | 0.00 | **100** | 50 |

**REJECTED** by the frozen decision rule: escalation recall did not rise, action
accuracy did not rise, and liveness fell.

Two things did move. Source independence went 80 → 100, confirming for the third
time that the source-lineage step works. Recitation is zero in both arms, so the
"do not restate these steps" instruction fixed the regression that killed v1 —
but it fixed it by removing a defect the candidate itself had introduced, not by
improving anything.

## The finding that matters

The candidate procedure said, in capitals:

> If two readings remain and the difference between them would change the answer,
> CALL THE ESCALATE TOOL. Writing 'this is ambiguous' in your answer is not
> escalating and does not satisfy this.

The worker read both documents, reported both budgets, correctly identified that
the request did not say which organisation it meant, and finished. It did not
escalate.

Checking the record rather than iterating: **the escalate action has never been
used in any recorded run.**

| campaign | worker | escalation-required cases | escalations |
|---|---|---|---|
| researcher certification | MIDAS or-v3 | SC-RSE-06 ×2 runs | 0 |
| researcher certification | generic baseline | SC-RSE-06 ×2 runs | 0 |
| judgment cycle | control + v1 candidate | SC-RJB-05 ×4 runs | 0 |
| this micro-cycle | control + v2 candidate | SC-RJB-05 ×2 runs | 0 |

Three campaigns, four arms, two different workers including a bare model with no
MIDAS knowledge at all. `escalation_judgment` reads 66.67 in the judgment cycle
only because two of its three cases are ones where *not* escalating is correct,
and those pass for free.

When an instruction that explicit produces zero behavioural change across a
worker and a baseline that share nothing but the environment, the instruction is
not the variable. **The environment is.**

The sandbox protocol every actor receives contains:

> Only ask the owner for a fact that no tool available to you could produce.

That clause is correct for the job it was written for — it is what stopped the
worker treating unread documents as missing information, and that repair holds.
It also governs every escalation case in every set, because in all of them the
worker has already opened everything. What remains unresolved is not a fact any
tool holds; it is which of two readings the requester intended. The worker
resolves the conflict the way it was told to, and the way that scores zero.

Deterministic checks now pin all of it: escalation is detectable in both action
shapes the protocol allows, saying "this is ambiguous" correctly does not count,
the protocol clause is present, the escalation-required cases are exactly the
cases it covers, and both texts reach the worker in the same prompt.

## What this changes

Two candidate procedures have now been rejected for the same axis, and neither
was ever going to work. The next intervention is not training and not knowledge:

**Resolve the conflict in the protocol.** The clause needs an exception it does
not have — asking is warranted when the unresolved question is *which* reading was
intended rather than *what* the facts are, because no amount of reading produces
an answer to it. That is a one-paragraph change to `SANDBOX_PROTOCOL`, it is
free to test against the existing cases, and until it is made, no measurement of
`escalation_judgment` on this worker is measuring the worker.

Also worth recording: the protocol change touches every role's evaluation, so it
must be made as a declared configuration change with its own before-and-after,
not slipped in. Every prior `escalation_judgment` number in the repository was
produced under the old protocol and should not be compared across it.

## Not done, deliberately

No repeats, no fresh sealed set, no stronger model, no promotion, no certification.
The decision rule said reject and stop, and the evidence for the real cause was
already in the repository at zero additional cost.
