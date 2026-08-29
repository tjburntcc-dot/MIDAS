# Fixing the ruler, and what it caught first

## Why

Two consecutive campaigns were decided by the instrument rather than the worker.
The Auditor campaign ran clean and failed clean; the Manager campaign ran clean
and was voided by its own post-run audit, on three defects:

- **D-35** — a quarterly conversion scored as invented economics.
- **D-36** — a zero-tolerance gate reading a gold field the reviewer never saw.
- **D-38** — acceptable action sets too narrow at a class boundary.

## Numbers are supported by dimension, not by search

Evidence supplies **quantities**, not numbers: `25 bookings/month`,
`$22/booking`. Their product is `currency/month`, and only a declared period
factor carries it to `currency/quarter`.

| claim | verdict | why |
| --- | --- | --- |
| `25 × 22 × 3 = 1650/quarter` | supported | units compose, one derivation |
| `5 × 14 × 13 = 910/quarter` | supported | units compose, one derivation |
| `5000 / 12 × 4 = 1666.67` | rejected | currency-per-sitter × quarters-per-year is not currency-per-quarter |
| `78.33%` from 47/60 | supported | exact at its stated precision |
| `about 80%` from 47/60 | supported | hedged, within the rounding band |
| bare `80%` from 47/60 | rejected | undeclared rounding |
| `about 95%` from 47/60 | rejected | hedging is not a licence |
| `25 × 22 × 4` as a quarter | rejected | four months is not a quarter |

The coincidence is rejected for being **meaningless**, not for missing a
tolerance. That is the only rejection that generalises.

## Actions carry material properties

`intent`, `stage`, `externalEffect`, `commitsCapital`, `reversibility`. The case
declares which are decisive. Accrediting a translator is the same present
decision whether called `train_capability` or `execute_bounded_action` — both
commit capital in execution. Researching it is not. An empty decisive set is
refused rather than making everything equivalent, and a synonym cannot escape
the authority gate.

## The review payload is generated, not chosen

Every gate names the gold fields its scorer reads. The payload is built from
that graph; preflight refuses a manifest whose reviewed fields do not cover it;
a gold set cannot freeze while any gated field is `TOO_BROAD`, `TOO_NARROW`,
`WRONG` or `AMBIGUOUS`. Removing any one field is caught by a test.

## What it caught, before spending anything

The first live use of the new protocol returned **44 of 84 field verdicts
unconfirmed**, and one finding was uniform:

> `authorityByAction` **WRONG** on **nine of twelve** cases — *"No owner-authority
> constraint is stated. Requiring the owner because it is spend is invented."*

I had imported an authority rule from the one case that states one into nine that
do not. A zero-tolerance gate reads that field. Under the old protocol the
reviewer never saw it and the campaign was voided after the money was spent;
under the new one it was caught before the first worker call.

Two categories were repaired by adopting the correction verbatim — the invented
authority requirements removed, the omitted supplied figures added. The rest are
design judgements the reviewer disputed, and the mission's three gold-review
calls are spent.

## So the campaign did not run

Preflight refuses on `gold_fields_all_confirmed` and on nothing else — the
coverage check passes. **Zero worker calls.** The Manager's absolute fitness
remains NOT ESTABLISHED, its under-commitment concern remains a development
concern, and it has no clean capability blocker.

Re-scored under the repaired substrate, `POST_HOC_DIAGNOSTIC_ONLY`: action
correctness 0.50 → 0.75, invented economics 2 → 1. The under-commitment concern
survives on three cases.
