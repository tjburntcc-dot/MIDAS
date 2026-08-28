# Qualification: frozen, unresolved

Recorded so the finding is not lost while attention moves to manufacturing the
rest of the organisation. Nothing in this file is a claim of capability.

## Status

**UNRESOLVED. Not promoted. Not production capability.**

The best measured configuration -- procedure fields plus the reasoning order and
the precedence ladder, `qualification-procedure-v1` on `gpt-4.1` -- reached
0.867 routing accuracy on sealed set `43ebd558005208ec` and was **rejected** on
four frozen checks. The promoted contract remains the disposition-only one that
routes the same records at 0.433.

0.867 is an experimental number on a thirty-case sealed set. It is not a
production figure, nothing runs on that configuration, and no downstream stage
consumes it.

## The unresolved defect, stated exactly

> Qualification can resolve record identity substantially better than baseline
> but remains unstable and occasionally routes toward a party that is not the
> economically relevant contracting or paying counterparty.

Two components, both measured:

**Stability, not accuracy, is the binding constraint.** Six sealed cases repeated
three times: 4 of 6 stable, **2 of 6 stable and correct**. Two of the failures are
stable and wrong three times out of three -- a directory of 260 freelancers kept
as a discovery source, a peer agency's own page declined. The fields-only control
makes both errors identically, so the reasoning order neither caused nor fixed
them.

**One missing distinction.** Both stable-and-wrong cases are the same question:
does this record lead toward people who would pay us, or is it a population of
people who sell what we sell? A directory of pharmacies and a directory of
freelancers are structurally identical and route oppositely.

The production shape -- a category page with no stated total -- is no longer ever
qualified as a single opportunity, which was the original failure. It is not yet
repeat-stable: research / keep / decompose across three repeats.

## What must not be done to this finding

- Do not promote the rejected candidate.
- Do not describe 0.867 as production capability.
- Do not call Qualification solved.
- Do not rescore the run against the corrected gold. One sealed case, QS-20, was
  independently judged underdetermined; it is recorded and the original scoring
  stands.
- Do not re-measure commerciality accuracy through the current contract. Six of
  fourteen disagreements were the worker returning a record *kind* in the
  commerciality field, which makes 0.533 an artefact of two adjacent free-string
  enums rather than evidence about a worker.

## Evidence

- [qualification-procedure-localization.md](qualification-procedure-localization.md)
- `var/state/qualification-procedure-cycle.json`
- sealed answers: `var/state/sealed/qualification-procedure-sealed-v1.json` (gitignored)
