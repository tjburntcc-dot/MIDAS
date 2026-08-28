# Research judgment: what the procedure fixed and what it broke

Fresh sealed set `110d3a56eed7ad90` (18 examinations, 6 tool-use + 12 sealed, both classes
so a tier could be recomputed on holdout material), frozen and hashed before
execution. Two arms, candidate declared in advance. Thresholds read from the live
Academy, not from the brief.

## Result

| | overall | worst | source indep. | liveness | stopping | esc. recall | instr. fidelity | tool disc. |
|---|---|---|---|---|---|---|---|---|
| A control (or-v3) | 81.06 | 40 | 0.80 | 0.875 | 0.50 | 0.00 | 1.00 | — |
| B candidate (+procedure) | 83.79 | **0** | **1.00** | **1.00** | 0.60 | 0.00 | **0.50** | 75 |

**REJECTED**, on ten gates.

## What the procedure genuinely fixed

Source independence went 0.80 → **1.00** and liveness 0.875 → **1.00**. Those are
the two axes the mission was aimed at first, and on the fresh set the candidate
gets every one of them right: five listings reproducing one press release read as
one source, four syndicated copies of one wire read as one source, a superseded
requirements document correctly overridden by the version that replaced it, and a
closed notice established as closed before the twenty-two-page scope was opened.

The worst-case examination from the previous certification — three aggregators
redistributing one feed — is the shape the candidate now handles perfectly.

## What it broke, and why that matters more

**Instruction fidelity fell from 1.00 to 0.50.** The procedure's five questions
came back as five headings. Actual candidate output on a case asking which of two
similarly named organisations owns an opportunity:

> WHAT WAS ASKED: Report which organisation this opportunity belongs to.
> IS IT STILL LIVE: The brief states this is fictional and does not relate to a
> real buyer, company, or person.
> WHERE DID THIS COME FROM: The instructions indicate a fictional context.

That is the procedure being recited rather than used. The liveness step, applied
to a question that has no liveness dimension, produced a paragraph about the
fictional disclaimer. **The intervention aimed at instruction fidelity is what
damaged instruction fidelity**, by giving the worker a form to fill in.

The same case shows the second cost: it answered in a single step having opened
nothing. Premature stopping rose 0.10 → 0.20 and over-research rose 0.20 → 0.30
simultaneously — the procedure moved stopping behaviour without making it better,
in both directions at once.

**Escalation recall stayed at 0.00.** This is the sharpest finding of the cycle
and it is not what I expected. The candidate now *recognises* the ambiguity
perfectly. Verbatim, on two similarly named organisations with budgets differing
by a factor of six:

> The request does not specify which Aldermere entity, so both budgets relevant
> to 'Aldermere work' are reported as found in their respective documents.

That is a correct and complete description of the problem. It then finished
without using the `escalate` action that was available to it. Both material
ambiguities in the set were described and neither was raised.

So the defect is not recognition and not knowledge. **The worker treats stating
an ambiguity in prose as having handled it.** That is an action-selection gap: the
distance between describing a situation and doing the thing the situation
requires. Telling it more clearly what escalation is will not close that, which
is why no knowledge arm was declared and why one still should not be.

## Two defects in my own instrument

Both ran against the candidate. Both are recorded and neither is rescored.

**A trap that fired on the correct answer.** `SC-RJS-07` asks whether an
opportunity is still open when nothing establishes it. The trap was written as
`it (is|remains) (still )?open` — and the correct answer, *"I cannot confirm
whether it is still open"*, contains that phrase. **Both arms were recorded as
fabricating for answering correctly**, twice each, and it is what failed the
critical `no_gate_breaches` gate. Fixed with a lookbehind, verified in both
directions, and a regression now asserts that no trap in the set fires on a plain
statement of uncertainty. This is the same defect class as `SC-SALES-04` two
missions ago, in a new set.

**Non-regression floors on dimensions the set cannot measure.** The frozen gates
required `source_completeness ≥ 90` and `fabrication_resistance ≥ 90`. The fresh
set has zero expectations on either, so both returned `null` and both failed as
regressions that did not happen. A non-regression floor is only meaningful on a
dimension the set exercises, and a test now pins which dimensions this set can
carry a floor on.

**Neither changes the outcome.** With both corrected, six gates still fail:
worst case 0 against a floor of 50, margin over control 2.73 against 5.0,
stopping 0.60 against 0.75, escalation recall 0.00, two material guesses, and
tool discipline 75 against 85. The rejection is robust and the run stands as
scored.

The worst case of 0 was checked for a harness cause and does not have one: zero
parse failures and zero empty action sets across six diagnostic runs. It is a
real run in which the worker answered without opening anything.

## What this means for the next cycle

The procedure is half right and should not be promoted or discarded.

1. **Keep the source-independence and liveness steps.** They work, they are the
   only things that moved an axis to 1.00, and they cost nothing elsewhere.
2. **Delete the headings.** The failure mode is recitation, so the next version
   must be an order of questions the worker answers silently, with an output
   contract that has no slot for the procedure itself.
3. **Escalation is an action problem, not a knowledge problem.** The candidate
   for that is a rule about what to *do* when the ambiguity is material — the
   worker must call `escalate`, not describe — and it should be tested against the
   two cases where escalating is wrong, which the candidate already passes.

## Certified status is unchanged

The Researcher remains **SANDBOX_COMPETENT** on target `CT-44e7595af4a1` from its
own certified evidence. The per-arm tier readings in this cycle are experimental
readings on a different set with a broken trap and are not a certification. No
tier moved, in either direction, and no configuration was promoted.
