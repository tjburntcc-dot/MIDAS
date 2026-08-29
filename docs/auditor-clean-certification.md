# The campaign that is ready and cannot be paid for

## What was built

The first Auditor certification campaign whose every component was fixed before
anything ran.

| component | value |
| --- | --- |
| target | `CT-677749cd2035` |
| environment | `EE-ab6da07f1924` (`audit-desk-v1`) |
| tools | `read_evidence({ids})` — one tool |
| cases | 18 fresh (12 `sealed_exam`, 6 `sandbox_tool_use`) |
| gold review | 18/18 `REFERENCE_CORRECT`, blind, before execution |
| preflight | clean on every check except cost |

## The accounting question

Can one execution contribute to both `sealed_exam` and `sandbox_tool_use`?

**No.** `SandboxScenario.evidenceClass` is singular and the aggregator buckets
each result by that one value. Nothing in the Academy lets an execution count
twice. Independently, `recertificationScope` invalidates `sandbox_tool_use` on a
tools change while sparing `sealed_exam` — a rule only coherent if the two are
different observations. So SANDBOX_COMPETENT costs 18 executions, not 12.

## The interface, chosen from the job

The previous desk was `list_evidence()` then `read_evidence({id})`, one record
per call. It failed for a reason unrelated to auditing: three turns bought an
inventory, one document, and a forced verdict.

The fix is fidelity, not budget. An auditor is handed a packet with a contents
page and decides what to open. So the index moved into the brief and the read
became a batch. It still leaks nothing: id and label only, bodies whole and in
the order asked for, no ranking, no summary, no hint which subset was right.

## The budget, measured rather than assumed

A five-call probe on two throwaway cases settled what no amount of reasoning
could:

- the auditor **does** batch ids — the two-record packet went in one call, two turns;
- it does **not** gather exhaustively — the four-record packet batched two, went
  back for a third, and finished at the cap with one record still unopened.

Both halves matter. Batching is why the desk is cheaper than the old interface.
Not gathering exhaustively is why a four-record packet needs a fourth turn.
Assuming either alone gets the budget wrong by a third.

| | calls |
| --- | --- |
| 12 two-record packets × 3 turns | 36 |
| 6 four-record packets × 4 turns | 24 |
| **worker worst case** | **60** |
| worker expected, at measured turn counts | 42 |
| gold review (spent, durable) | 3 |
| instrument probe (spent, durable) | 5 |
| **worst case total** | **68** against a ceiling of 44 |

## Why it did not run

Preflight refuses on `budget_fits_the_ceiling` and on nothing else. The campaign
needs 60 worker calls; 36 remained. Running it would have meant either
truncating the turn budget — the defect that cost the last campaign its tool-use
gate — or spending 36 calls on a campaign that could not complete.

The review and the probe do not need repeating. **A ceiling of 60 runs it; 66
runs it with margin for infrastructure retries.**

## What changed anyway

The Auditor is **EVIDENCE_READY** — the first worker to clear all four gates of
that ledger. Capability unblocked, configuration settled and frozen,
examinations trusted, evidence genuinely short. It is the only one of six roles
where spending money now produces a tier.
