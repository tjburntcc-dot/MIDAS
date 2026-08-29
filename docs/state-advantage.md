# Does proprietary state create decision value?

38 substantive calls of a 45 ceiling, all `gpt-4.1`. One list of facts per case,
rendered three ways, with a parity test asserting no arm can hold a fact another
lacks.

## The design

| arm | what it gets |
|---|---|
| A raw | every item, in the order it happened, as prose, with a note that some was later overtaken |
| B structured | the same items, sorted by kind, labelled current or superseded |
| C stateful | the same items behind `list_state` and `read_state`, the listing showing ids and never content |

Seven businesses, eleven items each on average, seven distinct memory shapes:
repeated failure, superseded constraint, an old success now wrong, outcomes
contradicting the company narrative, a worker whose reliability changed, capital
allocation settled by history, and a capability unlock. Five contain items that
were explicitly superseded.

## Result on the fair comparison

A and B are both single-shot and directly comparable.

| | action correctness | stale-state use | memory use | invented economics |
|---|---|---|---|---|
| A raw | **0.857** | 0.20 | 1.00 | 0 |
| B structured | 0.714 | **0.00** | 1.00 | 1 |

**RAW_CONTEXT_SUFFICIENT on decisions.** The gap runs the wrong way for
structure and is 0.143, below the frozen 0.20 margin — one case in seven.

The one thing structure did was eliminate the single stale-state error, where the
raw arm justified a decision using a fact the record says was overtaken. That is
the same shape found in the Manager cycle: **structure buys control, not
decisions.** One event in seven cases; a direction, not a result.

## Arm C is INCONCLUSIVE, and the fault is mine

C scored 0.286 and four of its seven cases produced no decision at all. Before
reporting that as a regression I spent three calls to find out why, and the
transcript settles it:

```
turn 0: list_state({kind:"all"})  -> "all" is not a kind, so my code returned an
                                      EMPTY STRING. No error, no hint, nothing.
turn 1: list_state({})            -> the real listing
turn 2: read_state x 4            -> all four succeeded
        ...and the three-turn budget ended before it could decide
```

Two defects, both mine:

1. **An unknown `kind` filter returned silence.** A worker's reasonable opening
   guess consumed a turn and taught it nothing.
2. **Three turns is not a budget for a stateful arm.** List, read, then decide is
   three turns with zero slack, and arms A and B were handed everything in one
   shot. C was structurally handicapped by the harness, not by the idea.

Both are repaired and pinned: an unknown kind now names the kinds that exist and
says how to recover, and a test records that a fair arm C costs 4 turns per case,
which is 28 calls for that arm alone.

**No conclusion about stateful access may be drawn from this run.** The
classification the tool printed — `STATEFUL_REGRESSION` — is withdrawn. Where C
did reach a decision it opened 5 of 5 relevant items twice and used the memory
signal both times, which is the opposite of a retrieval failure.

## What this does and does not establish

**Established:** at this complexity, a capable model handed a company's history as
prose synthesises it well enough that organising the same facts does not improve
its decisions. That is a real answer to H1 and it says: do not build state
infrastructure to make decisions better.

**Established, weakly:** organised state prevented the only stale-state error
observed. Structure keeps appearing on the control side of the ledger.

**Not established:** whether tool-mediated access adds anything. The experiment
that would have said was invalidated by two harness defects, and the remaining
seven calls of budget cannot rerun it.

## What must not be built

Nothing. No vector store, no retrieval engine, no memory service, no summarisation
layer. H1 was not refuted, and the one hypothesis that might have justified
building something was never fairly tested.

## The rerun, priced

Arm A 7, arm B 7, arm C 7 x 4 = 28. **42 calls**, inside a 45 ceiling, with the
interface already repaired and the cases, parity audit and scorer already built.
That is the whole cost of converting an inconclusive result into an answer.
