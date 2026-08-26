# Calibration instrument — defect report and corrected design

Status: the current calibration measurement is **defective and must not be
trained against**. Its replacement is specified here and not yet built.

## What was believed

`calibration` scored 70.4 against 95–100 on every other Opportunity Qualifier
dimension, and was named the worker's dominant competence bottleneck.

## What is actually true

Decomposing the dimension into its three sub-estimates over the promoted `oq-v2`,
across three trials on the 24-case sealed set (432 scored sub-estimates):

| slice | score | n |
| --- | --- | --- |
| all scored sub-estimates | 70.6% | 305/432 |
| **where gold supplies a real band** | **92.0%** | 149/162 |
| where gold demands `null` | 57.8% | 156/270 |

Per sub-estimate, overall: `estimated_value_usd` 50.0%, `ai_fulfillment_pct`
79.9%, `human_minutes` 81.9%.

Every single `estimated_value_usd` miss falls on a case whose gold band is `null`.
The worker supplies a figure; the instrument demands abstention.

**Actual estimation skill is 92.0%, consistent with every other dimension. The
70.4 headline is roughly two thirds an artifact of how the gold was authored.**

## The authoring error

Twelve of twenty-four sealed cases demand `null` for value while the record
plainly states a budget:

`OQ-S08 OQ-S09 OQ-S10 OQ-S11 OQ-S12 OQ-S13 OQ-S14 OQ-S15 OQ-S17 OQ-S18 OQ-S19 OQ-S21`

`OQ-S08` states a 6000 USD project. The worker answers 6000. Gold marks it wrong.
`OQ-S11` states 200 USD. The worker answers 200. Gold marks it wrong.

The gold was written with the reasoning "value is not estimable for an engagement
that cannot be entered". That conflates two independent questions:

- **Is the value estimable from the record?** Usually yes; the budget is stated.
- **Should the opportunity be pursued?** Separately decided, and already carried
  by `decision` and `disqualifiers`.

Declining an opportunity does not make its stated budget unknowable. The
calibration dimension was therefore measuring *"did you decline to estimate on
cases we reject"*, which is not an estimation skill and is not something the
worker should learn. A worker trained to satisfy it would refuse to price
opportunities whose price is printed in the record — worse for real use, and
directly against the economic reasoning the dimension exists to support.

## Why this had to be caught before training

The instruction to attack calibration was correct given the number. Acting on the
number without decomposing it would have produced a worker that scored better and
estimated worse. The failure mode is the one the programme doctrine names
directly: teaching MIDAS to imitate arbitrary author guesses, and optimising a
metric rather than the capability it stands for.

## Corrected design

### 1. Separate estimability from the pursuit decision

Gold specifies, per numeric field, one of:

- `{low, high}` — a defensible band. Applies whenever the record supports one,
  **regardless of the decision**.
- `"unknowable"` — the record genuinely cannot support an estimate. Abstention
  is correct and a confident figure is wrong.
- omitted — not scored for this case.

### 2. Derive bands by rule, not by hand

Author discretion is the thing that broke the instrument, so it is removed where
possible.

- **Value.** Where a budget is stated, the band is that figure ±25%. Where a
  range is stated, the band is that range widened by 10% each side. Where no
  figure is stated and none is inferable from scope, the field is `unknowable`.
- **AI fulfilment share.** Derived from the work category using the owner policy
  already in the knowledge base (`K-HD-010`): content, SEO and data work
  70–100%; site builds and CMS migrations 50–90%. `unknowable` where scope is
  unstated or the work is outside the capability boundary, since our fulfilment
  share of work we would not do is not a meaningful quantity.
- **Human minutes.** Derived from the same category bands.

Every band carries the rule that produced it, so a reader can check the band
without trusting the author.

### 3. Grade distance, not just containment

Binary containment throws away most of the signal and is brittle at band edges.
Per field:

- inside the band → 100
- outside → graded by distance from the nearest edge, relative to the band
  midpoint
- relative error beyond 1.0 → 0, recorded separately as a catastrophic miss
- `unknowable` field → 100 for `null`, 0 for a figure

### 4. Report the metrics the decision actually needs

Scored and reported alongside: absolute error, relative error, band containment
rate, directional ranking accuracy across cases, over- and under-confidence
(systematic bias in one direction), catastrophic underestimation and
overestimation counted separately, and range-width honesty — a very narrow band
on a genuinely uncertain case is fake precision and should not outscore an honest
wide one.

## Consequences for what is already recorded

No promotion is invalidated. `calibration` carries 15 of 100 weight and every arm
was scored on the same instrument, so the defect is common-mode: it depresses all
arms roughly equally and does not change any relative comparison. What it does
invalidate is the claim that calibration is the worker's dominant weakness.

## Next

Build sealed v2 and dev v2 with rule-derived bands and explicit `unknowable`
markers, implement the graded scorer, re-measure `oq-v2` to establish a true
calibration baseline, and only then decide whether training has positive expected
value. Until that is done, `calibration` numbers from sealed v0 and v1 should be
read as instrument output, not as worker capability.
