# Qualification after the procedure cycle

Sealed set `43ebd558005208ec`, 30 cases, balance qualify 10 / research 5 /
decompose 6 / keep 5 / decline 4, hashed before execution. Candidate declared
before execution. Every arm ran through the worker adapter, so the subject of
each result is `qualifier@oq-v2 on gpt-4.1` rather than a bare model — the
previous two cycles in this line called the provider directly, which made them
diagnosis-grade and not promotion-grade.

## Results

| | routing | qualify recall | false acc | false dec | false hold | agg-as-single | counterparty | commerciality | unknown honesty | decompose | discovery kept |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A incumbent | 0.433 | 0.60 | 0.00 | 0.00 | **0.567** | 0 | n/a | n/a | 1.00 | 0.00 | 1.00 |
| B prior schema | 0.700 | 0.80 | 0.00 | 0.03 | 0.03 | 0 | n/a | n/a | 1.00 | 0.67 | 0.80 |
| D fields only | 0.767 | 0.90 | 0.00 | 0.00 | 0.10 | 0 | 0.833 | 0.600 | 1.00 | 0.33 | 1.00 |
| **C candidate** | **0.867** | 0.90 | 0.00 | 0.03 | 0.00 | 0 | 0.733 | 0.533 | 1.00 | 0.833 | 0.80 |

Stability, six sealed cases repeated three times: C 4/6 stable, **2/6 stable and
correct**. D 2/6 stable, 1/6 stable and correct.

**REJECTED**, on four checks: `order_beats_fields_alone`,
`counterparty_selection`, `commerciality_before_cardinality`, and both stability
checks.

The three critical non-compensatory gates all passed. Nothing in any arm
qualified an aggregate as one opportunity, invented a count, or invented a buyer
identity — the failure that started this line of work is gone from every
identity-aware configuration.

## What the order did and did not do

It did the thing it was aimed at. False holds fell from 0.567 to 0.00,
decomposition accuracy rose from 0.33 to 0.833 against the same fields without
the order, and routing reached 0.867 — the best any Qualification configuration
has measured. The incumbent contract, which is what is promoted today, routes
these records at 0.433 and holds more than half of them.

It did not do it by enough, and it did not do it stably. Three residual problems,
in order of how much they matter.

### 1. Stability is now the binding constraint, not accuracy

C is stable on 4 of 6 repeated cases and **correct on only 2**. Two of those
failures are stable and wrong three times out of three:

- QS-25, a peer agency's own services page: `decline` ×3. Gold keeps it.
- QS-29, a directory of 260 freelancers for hire: `keep_as_discovery_source` ×3.
  Gold declines it.

D makes both errors identically, so the order neither caused nor fixed them.
These are the adversarial near-neighbour pair the set was built around, and the
worker has the distinction exactly inverted: it keeps a population of sellers and
discards a peer that might subcontract.

The remaining two are genuinely unstable rather than stably wrong. QS-17, the
production shape — a category page with no stated total — came back
`research_identity`, `keep_as_discovery_source`, `decompose` across three
repeats, while the same case routed correctly in the single-pass sealed run. The
original production failure is fixed in the sense that it is never qualified as
one opportunity, and it is **not yet repeat-stable**.

### 2. One competency is missing, and it is a single one

Both stable-and-wrong cases are the same question: *does this record lead toward
people who buy, or is it a population of people who sell?* A directory of
pharmacies and a directory of freelancers are structurally identical — a list of
organisations, contact details, a large count — and route oppositely. The
procedure has no step that asks it. `enables_discovery` was defined as "a real
route to work" and the worker reads "route" as "lots of names", which is the same
count-first reflex one level up.

This is the next candidate increment and it is small: a route is a route to
someone who would *pay us*, not to anyone at all.

### 3. My contract lets two fields collide

Six of fourteen commerciality disagreements are the worker returning a **record
kind** in the commerciality field: `aggregate_listing`, `single_opportunity`,
`directory`. On four of those six the routing was still correct.

That means commerciality accuracy of 0.533 is not a clean measurement of
commerciality reasoning. Two adjacent free-string enums in one object, described
only by a pipe-joined list of their values, invite exactly this. It is a contract
defect of mine.

It does not rescue the candidate — counterparty accuracy is 0.733 against a
0.85 gate on a field with no such collision, and the stability failures are
independent of it — but the next cycle must not measure commerciality through
this contract. Constrain both fields with `enum`, or merge them, before the
number is treated as evidence about a worker again.

## Defects found in my own instrument

**A gate defect that did not change the outcome.** The candidate beat its control
by exactly three cases in thirty. The criterion was a margin of 0.10. The check
compared `0.867 - 0.767`, which in floating point is `0.09999999999999998`, and
reported FAIL under a detail line reading "0.100". The threshold was never wrong
and is unchanged. The comparison now rounds to the precision of its inputs, and a
regression test pins it. **The candidate fails four checks with or without this,
so the promotion decision is identical** — recorded because the next candidate
might be decided by a margin, not because this one was.

**Independent adjudication** by `gpt-5.5`, given the record, the gold and the
answer but not told which arm produced it, on all four candidate failures:

| case | gold | predicted | verdict |
|---|---|---|---|
| QS-07 | qualify | decompose | worker defect (high) |
| QS-20 | decompose | keep_as_discovery_source | **underdetermined** (medium) |
| QS-25 | keep | decline | worker defect (medium) |
| QS-29 | decline | keep | worker defect (high) |

One case attributed to the instrument. QS-20 is a weekly digest of nine briefs,
and a reasonable person could call that a source rather than a decomposable
record. It is recorded and **not rescored**; the promotion decision stands on the
original scoring, and the case will be sharpened or replaced before the next run.

## What this means

Qualification still blocks Shadow, and the blocker is now stability plus one
missing distinction rather than a structural defect. Routing correctness has
moved 0.25 → 0.50 → 0.80 → 0.867 across three cycles on progressively harder
sealed sets, and each step was earned against a control that could have explained
it away.

The integrated team was **not** rerun. Running it with an unpromoted candidate
would produce a team number for a configuration that does not exist.

## Deferred as non-blocking

- The commerciality/kind field collision is an instrument repair, not a worker
  repair. It blocks the *measurement* of one competency and no decision.
- QS-20's underdetermined gold. One case in thirty, and it did not decide the
  outcome.
- `academy-certification.json` and `-judged.json` still carry the pre-adapter
  results with no subject identity attached. They are historical and correctly
  superseded by `academy-certification-midas.json`; relabelling them changes no
  decision.
