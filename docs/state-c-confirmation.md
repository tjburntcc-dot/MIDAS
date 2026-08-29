# Stateful access, measured on a runtime that works

26 substantive calls of a 32 ceiling, all `gpt-4.1`. Arms A and B were not rerun:
their stored outputs were valid and remain the frozen comparators. Only C was
invalid, and only C ran.

## The harness, proved before spending

Ten deterministic checks, then a single development smoke case.

| check | result |
|---|---|
| unknown `kind` filter | names the kinds that exist and says how to recover; never silent |
| `list_state({})` | returns the complete listing for every case |
| a real kind | filters to exactly that kind |
| every valid id | reads, content intact |
| invalid id | explicit error naming available ids |
| listing | leaks neither content nor relevance ordering |
| turn budget | four, so one wasted opening guess no longer consumes the decision |
| parity | still holds on all seven sealed cases |
| scorer | accepts a decision produced after tool use |

Smoke: listing worked, 4 of 4 relevant items read, **zero invalid calls**, decision
emitted in 3 turns.

## Result

| | action | bottleneck | stale use | memory use | authority | unauthorised | calls per decision |
|---|---|---|---|---|---|---|---|
| A raw *(stored)* | **0.857** | 0.571 | 0.20 | **1.00** | **0.714** | 1 | **1** |
| B structured *(stored)* | 0.714 | 0.714 | **0.00** | **1.00** | **0.714** | 1 | **1** |
| C stateful *(repaired)* | 0.714 | 0.714 | **0.00** | 0.714 | 0.429 | **3** | 3.29 |

**NOT_DEMONSTRATED.** C equals B and sits 0.143 below A, under the frozen 0.20
margin. The runtime is not the reason: retrieval was 0.959, invalid calls were
zero, and six of seven cases reached a decision.

**Stateful access cost 3.3× the model calls and bought nothing.** On this
benchmark it is strictly dominated by pasting the history into the prompt.

## The uncomfortable detail

C was *worse on control*, which is the opposite of what the state hypothesis
predicted. Authority correctness fell from 0.714 to 0.429, and unauthorised
commitments rose from 1 to 3: on SA-1, SA-2 and SA-4 it chose to act and declared
the action needed no permission, in cases where it did.

It also used the decisive memory signal in 5 of 7 cases against 7 of 7 for both
prose arms — while having read 96% of the relevant items. It retrieved the facts
and then reasoned from them less well than a model handed the same facts as text.

Seven cases and three events. A direction, not a result, and it points away from
the hypothesis rather than towards it.

## Three harness defects in one experiment, all mine

1. An unknown `kind` filter returned an empty string, silently.
2. A three-turn budget left no slack after one wasted guess.
3. A smoke gate that required the worker to skip a distractor, and failed a run
   in which the runtime plainly worked.

The third was corrected after seeing its result, which is recorded rather than
hidden: a smoke test proves a runtime completes a case, and selectivity is a
measured metric in the real run rather than a precondition for it.

Two of the three nearly became findings about architecture. That is now three
missions in five where a defect in code I wrote almost became a conclusion about
a worker or a design.

## Verdict

**Stateful access value: NOT DEMONSTRATED**, on a runtime proved to work, at a
3.3× execution cost, with a control regression.

MIDAS has evidence to build **nothing** here. No memory service, no retrieval
engine, no vector store, no state platform. The seven-case prototype and its
interface stay as an experiment record; they are not adopted anywhere and nothing
depends on them.

The three-way question is now closed: raw context is sufficient at this
complexity, organisation buys a small amount of control, and tool-mediated state
costs more and delivers less.
