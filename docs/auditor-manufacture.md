# The MIDAS Auditor

Manufactured because three of five organisational roles had no worker, and
because every instrument defect of the last four missions was found by hand
rather than by any scoring mechanism.

## Absence, proved before anything was built

`adaptWorker("auditor", …)` returned, mechanically, before a line of the worker
existed:

```
midasWorker: false
versionId: null
"No MIDAS worker has been manufactured for the auditor role. A result for this
 role describes the base model, not MIDAS, and must be read that way."
```

The adapter had hardcoded branches for `qualifier` and `researcher` only;
everything else fell through. That absence test has been replaced by
[auditor-path.test.ts](packages/eval/src/auditor-path.test.ts), which asserts the
live path now resolves `auditor@au-v1` with all ten doctrine items reaching the
worker verbatim, and that `sales`, `manager` and `technical` still report their
absence.

## Results

Sealed set `2732675fa33f337f` (28 cases: 10 must-pass, 16 defect cases across all seven
classes, 2 underdetermined), frozen and hashed before execution. Two candidates
declared in advance, each with its own gate — the correction to a mistake made
twice in the Qualification line, where the structure-only arm won and could not
be promoted because it had only ever been a control.

| | verdict acc | detection | correct-work pass | false rej | false acc | ambiguous | false accusations |
|---|---|---|---|---|---|---|---|
| A baseline (4.1) | 0.964 | 0.813 | 1.00 | 0.00 | 0.00 | **0.50** | 0 |
| B contract (4.1) | 0.929 | 0.563 | 1.00 | 0.00 | 0.00 | 0.00 | 0 |
| C doctrine (4.1) | 0.929 | 0.688 | 1.00 | 0.00 | 0.00 | 0.00 | 0 |
| C doctrine (5.5) | 0.893 | 0.813 | 0.90 | 0.10 | 0.00 | 0.00 | 1 |

Stability, six cases × three repeats: B 5/6 stable, C 6/6 stable and 5/6
stable-and-correct on the base model.

### The baseline beat both candidates

`A_baseline` is a capable model given the same output schema and the instruction
*"review the work below and say whether it is good enough"*. It scored higher
verdict accuracy than either candidate, matched the frontier arm's detection,
passed all ten must-pass cases, accused nothing, and was the only arm on any
model to handle an underdetermined case correctly.

It is not promotable and will not be promoted. It was never a declared candidate,
it has no stability data, and promoting a baseline on numbers seen afterwards is
inventing the decision after seeing the result — the same refusal made two
missions ago in the Qualification line, which the next cycle then vindicated when
that arm failed to generalise.

It also fails a gate under either gold: `every_finding_points_at_something` on
the original scoring, and `critical_detection_recall` at 0.778 under the
corrected gold, because part of its perfect must-pass record was **passing AS-05,
the case with the fabrication I had accidentally written into it**. The arm that
caught that fabrication was penalised for it. An auditor scores well on
correct-work-pass by being less attentive, which is precisely why that metric is
gated alongside detection and never instead of it.

What the arm does establish is the same finding the Qualification line produced
twice: the structured output contract carries most of the work, and prose on top
of it earns much less than it appears to. Here the doctrine did earn something
real — detection — and paid for it in ambiguity handling.

**All three declared arms REJECTED.** B fails detection recall and misses an authority
violation. C on the base model fails detection recall and a fabrication. C on the
frontier model — the pre-registered escalation — clears detection, fabrication,
authority, contradiction, omission and provenance at 1.00 each, and fails on
false accusations, an unanchored finding, and ambiguous handling.

The doctrine earned its place: +0.125 detection over the contract alone on the
base model and +0.25 against it on the frontier. That is the first time in this
repository that a knowledge pack has beaten its own structure-only control. The
two previous attempts, both in the Qualification line, were correctly killed by
exactly this comparison.

## Two defects in my own evaluation set

An independent adjudicator was shown six cases and their reference answers,
never told what any arm had said, and asked only whether the reference was right.

**AS-05 is wrong, and the auditor was right.** The case was written as a correct
"defensible choice between equals": two channels equally eligible, pick one, say
why. The output justifies the choice with *"A's listings are longer and give more
to assess"* — and nothing in the evidence says that. **I wrote a fabrication into
a must-pass case and did not notice.** The frontier auditor caught it, named it
fabrication, quoted the sentence, and was scored as having made a false
accusation against correct work. It had not. That single scored event failed the
`no_false_accusations` critical gate.

**AS-27 is wrong.** The worker asserts a figure from a rate card that was not in
the evidence. I wrote the gold as `insufficient_evidence` on the reasoning that
the worker might have held the attachment. The adjudicator, and all three arms,
say the correct answer is fail/fabrication: the claim is unsupported in what
anyone can see.

Both defects run in the direction of penalising the auditor.

**They do not change the outcome, and the promotion decision stands on the
original scoring.** Corrected-gold diagnostic for the frontier arm, recorded here
as diagnosis and used for nothing else: verdict accuracy 0.964, detection 0.833,
correct-work pass 1.000, false accusations 0, false acceptance 0. It still fails
`every_finding_points_at_something` (one unanchored finding) and
`says_so_when_it_cannot_tell` (0 of 1 remaining underdetermined case). Two frozen
gates, failed under either gold.

## A third instrument finding: the defect vocabulary has no precedence

`theater` detection reads 0.00 for every arm on both models, and it is not a
blind spot. Both theater cases were correctly called failures by every arm, with
accurate reasoning, and labelled `fabrication` or `contradiction_ignored`
instead. The adjudicator confirms both reference answers are right.

A dashboard described as operational when nothing feeds it is genuinely a
fabrication *and* genuinely theater. `AS-20` behaves the same way: gold
`epistemic_error`, called `fabrication`, adjudicator says the gold is right.

Seven classes with overlapping meaning and no stated precedence is the same
defect found in the routing policy last mission, reproduced in a new taxonomy.
The metric that keys on class naming is therefore not a clean measurement, and
the next cycle must either state precedence between classes or score detection
on the verdict with the class as a secondary field.

## Leverage: does the Auditor find what took a human four missions to find?

Five reconstructions from committed history, four real defects and one correct
decision, with no answer keys shown and the audits recomputed live.

| | what it was | result |
|---|---|---|
| H1 | a reference answer claiming 12 opportunities on a record stating no total | **caught**, named fabrication |
| H2 | a routing rule that demoted a worker for honestly reporting an unknown count | **caught**, named epistemic_error |
| H3 | a gate reporting FAIL at a detail line reading "0.100" | **caught**, named contradiction_ignored |
| H4 | a bare model's score reported as a MIDAS worker's certification | **caught**, named fabrication + epistemic_error (history calls it provenance_loss) |
| H5 | a correct REJECT against a frozen criterion the author wanted to pass | **passed**, no findings |

**4 of 4 known defects caught. 3 of 4 named with the same class. 0 false
accusations on the correct decision.**

Each of those four cost part of a mission to find by hand. This is the first
measured evidence that the Auditor has leverage over MIDAS's own development, and
it is the reason the role was manufactured first.

The caveat is real: these are reconstructions written by the same person who
found the defects, and the defects are legible because they are already
understood. It is evidence of leverage, not proof of it, and it confers no
authority to certify any other worker.

## Certification

`certify()` through the existing Academy, no special status invented.

- target `CT-d3977d440b7a` — `auditor@au-v1` on `gpt-5.5`, doctrine
  `AD-001…AD-010`, no tools, no retrieval, single-shot JSON
- overall **76.82**, score tier would be `SANDBOX_COMPETENT`
- evidence tier **TRAINING**
- **awarded: TRAINING**, limited by evidence

The ceiling is not the score. `SANDBOX_COMPETENT` requires 6 cases of
`sandbox_tool_use` evidence and this worker has none: it reads a dossier and
returns JSON, and never touches a tool. Scoring was submitted as `pattern_only`,
which is conservative — the verdicts are compared to gold labels
deterministically rather than matched against prose — and lowering the claim is
the safe direction.

**TRAINING is what the evidence supports, and no configuration was promoted for
use.** Those are separate statements and both are true.

## What is deferred as non-blocking

- The defect-class precedence problem. It blocks a measurement, not a decision.
- Repairing AS-05 and AS-27 in the sealed set. Recorded; the set is repaired for
  future runs, this run is not rescored.
- Running `A_baseline` as a declared candidate with stability evidence. It is
  the cheapest configuration measured and it deserves a fair contest rather than
  a post-hoc promotion; that contest belongs in the next cycle, with the sealed
  set repaired first.
