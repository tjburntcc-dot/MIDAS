# The gold that would not close

## What happened

Forty-four field verdicts were outstanding. Each was repaired from the reviewer's
own stated reasoning, then re-adjudicated in two blinded calls. **Thirty-four
confirmed. Ten did not.** The review ceiling is two calls and both were spent, so
the campaign did not run.

74/84 gated field verdicts confirmed. Preflight refuses on
`gold_fields_all_confirmed` and nothing else.

## Why the ten stayed open

Two causes, and only one of them is a mistake.

### `supportedQuantities` — five cases, and it does not converge

The field asks for *every figure the situation supplies*. That has no boundary,
so the reviewer enumerated it differently each round:

| case | round 1 named | round 2 named |
| --- | --- | --- |
| MF-04 | the three-month quote hold | "no client having been asked", "asking this week" |
| MF-06 | three comparable weddings, one morning | "the model never having been checked" |
| MF-09 | eleven months, two thirds, three weeks | "the two-quarter objective", "two thirds complete" |

Round two's omissions are largely *facts*, not quantities with units. Adding what
it names does not close the field, because the next round names something else.
**A field whose completeness is an enumeration judgement cannot reach CONFIRMED
by iteration.** Recorded as D-41; not repaired, because repairing it is substrate
design and this mission had none.

The fix, when it is made, is a bounded definition a machine can check — every
numeral appearing in the situation text — so the structural audit enforces
completeness without spending a review call.

### Informed retraction — three cases, and the protocol working

Round one was conducted without telling the reviewer how action equivalence is
computed. Round two told it, including that two classes with identical material
properties can never be separated. It then retracted advice it had given:

- **MF-03** — round 1: *add `manufacture_capability`, the set is too narrow.*
  Round 2: *admitting it is too broad, because it drags in its inseparable
  `train_capability`.*
- **MF-12** — the same reversal.
- **MF-11** — round 1: *distribution, and arguably sales.* Round 2: *adding sales
  admits a bottleneck the situation does not establish.*

I had adopted round one's advice verbatim. It was advice the reviewer would not
have given had it known the rules. Recorded as D-42; the guard is already in
place — round two's instructions state the equivalence rules and their
consequences, and produced no such request.

## What this leaves

The Manager's absolute fitness is still **NOT ESTABLISHED**, its
under-commitment concern is still a **development concern**, and it still has
**no clean capability blocker**. Two gpt-5.5 calls were spent; no worker call was
made.

The set is not broken. It is 74/84 confirmed with every remaining objection
recorded verbatim, and five of the ten are one field that needs a definition
rather than another opinion.
