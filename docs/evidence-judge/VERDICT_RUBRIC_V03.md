# Evidence judge verdict rubric v0.3

Status: **not qualified for activation.** See "Outcome" at the end of this
document before relying on anything here. Operational definition for
`atlas-evidence-judge-v0.3.3` and calibration set
`atlas-judge-calibration-v0.3`. Supersedes the implicit definitions used by v0.2.
The v0.2 set and its recorded results stay frozen for comparison.

## The question the judge answers

> Does the cited evidence, read with the recorded prospect facts, establish the
> claim **as written** — including any epistemic qualifier the claim carries?

The verdict is about the relation between evidence and claim. It is **not** a
statement about whether the underlying business fact happens to be known.

## Why v0.2 could not be satisfied consistently

The v0.2 `ambiguous` class was built by pairing absence-evidence with a
hedge-worded claim, then labelling the pair `ambiguous` because the underlying
fact was unknown. Two items in that set carry **identical evidence**:

| id | claim | evidence | v0.2 label |
| --- | --- | --- | --- |
| `J02-U14` | "Account status is unprotected even though the field is blank." | "Existing-customer status is not on the record." | `does_not_establish` |
| `J02-A01` | "It is unclear whether this account is protected." | "Existing-customer status is not on the record." | `ambiguous` |

The set already commits to the principle that a claim overreaching the record is
`does_not_establish`. The mirror of that principle is that a claim accurately
reporting what the record does and does not contain is `supports`. Calling it
`ambiguous` instead makes the class a function of the claim's rhetorical form —
whether it contains a hedge word — rather than of the evidence relation. No
reasoner applying a consistent rule can reproduce that, which is why the class
scored 0.375 while every other class scored 0.94 or better.

A second, independent reason to reject the v0.2 reading: MIDAS wants agents to
disclose uncertainty rather than assert through it. `scoreSemanticFromJudgments`
awards credit for `supports`. Under the v0.2 labels an agent that correctly said
"the status is not on the record" earned no credit, while the incentive gradient
pointed toward confident assertion. The rubric below removes that inversion.

## Verdicts

Every claim is first decomposed into its asserted content `C`, preserving the
epistemic operator the author used. A claim may assert:

- a **substantive proposition** — "monthly spend is 3200 USD";
- a **negation** — "there is no customer contract";
- a **record-state proposition** — "the status is not recorded", "it is unclear
  whether this account is protected", "the cite leaves authority unresolved".

A record-state proposition is an ordinary factual assertion *about the evidence
record*, and is judged like any other assertion.

### supports

The evidence states or entails `C` at the same strength the claim uses.

- Direct match: evidence states the claimed value.
- **Record-state match**: the claim asserts that the record does not determine
  some fact, and the evidence records exactly that absence, staleness, hedge, or
  non-probative quality. Evidence that a field is blank supports a claim that the
  field is blank, and supports a claim that the matter is therefore undetermined.
- A hedge in the claim is matched, not penalised: "the note hedges" is supported
  by a hedging note.

### contradicts

The evidence states or entails something incompatible with `C`.

- The same attribute carries a different value.
- The claim asserts the negation of a recorded fact.
- The claim asserts a permitted state where the evidence records a prohibited or
  opposite one: a reserved region claimed as served, an opt-out claimed as
  contactable, an expired protection claimed as current, a public-sector entity
  claimed as a commercial motion.

Incompatibility is decided on the attribute, not on wording. Evidence naming an
attribute's disqualifying value contradicts a claim asserting its qualifying
value; it is not merely a failure to establish.

### does_not_establish

The evidence neither states nor entails `C`, and nothing in the evidence bears
against `C`. The claim reaches past what the record carries.

- Silence, insufficiency, an absent or misattributed citation.
- **Never-probative inferences**, regardless of how plausible: job title to
  purchasing authority, name similarity to identity, brand style to geography,
  stale record to current condition, third-party listing alone to current status,
  prospect-supplied assertion to authority, topical relevance to applicability,
  and any number not present in the facts or cited evidence.
- Asserting a definite value where the record is blank is `does_not_establish`,
  not `contradicts`: a blank field is not counter-evidence.

The boundary against record-state `supports` is exactly this. Reporting the blank
is supported. Filling in the blank is not.

### ambiguous

The evidence bears on `C` **from both directions**, and no precedence rule
resolves which direction wins, so no single verdict is defensible.

Ambiguity is a property of the evidence being two-sided. It is never a synonym
for "unknown", and never triggered by hedge words in the claim. If the evidence
points only one way — or does not reach the claim at all — the verdict is
`supports`, `contradicts`, or `does_not_establish`, never `ambiguous`.

Shapes that qualify:

- Two current records of comparable standing assert incompatible values of the
  same attribute.
- A single source contains internally conflicting statements and neither is
  marked as the correction.
- Two records of comparable standing disagree and each is hedged, so neither
  establishes nor refutes.
- Evidence supports the claim under one reading of an entity or period and
  refutes it under another equally available reading.

### Precedence rules

Apply before returning `ambiguous`. If a rule resolves the conflict, the verdict
is the resolved one.

1. A current first-party status outranks a stale third-party listing.
2. A record explicitly marked as a correction or supersession outranks the record
   it corrects.
3. No general precedence exists between a current official record and a current
   first-party note. When those two conflict on the same attribute and both are
   current, the verdict is `ambiguous`.

Rule 3 is deliberate. MIDAS's owner policy does not designate an authority order
between official and first-party sources, so the judge must not invent one.

### Overrides

Two rules outrank the four verdict definitions above.

1. **Empty citation.** If the claim cites no evidence ids at all, the verdict is
   `does_not_establish` regardless of the claim's content — including a claim
   whose content is that nothing is cited. Uncited prospect evidence is not
   available to support a claim.
2. **Non-probative relay.** A record-state claim earns `supports` only when it
   reports that the record does not settle the question. If it instead repeats
   what a never-probative source asserted and offers that as the reason to accept
   the underlying fact, the verdict is `does_not_establish`. Reporting that a
   source is prospect-supplied, hedged, stale, or silent is `supports`. Passing
   that source's assertion along as the basis for the fact is not.

Both were added after the first live v0.3 run, which surfaced two claims where
the record-state reading was true as literally written yet would have laundered
non-probative material into evidential credit. These are judge-side fixes: the
labels for those items were already correct.

## Worked boundary cases

| Evidence | Claim | Verdict | Why |
| --- | --- | --- | --- |
| "Status field is blank." | "Status is unknown." | `supports` | Record-state match. |
| "Status field is blank." | "Status is unprotected." | `does_not_establish` | Fills in the blank. |
| "Status field is blank." | "Status is protected." | `does_not_establish` | Fills in the blank. |
| "Registry lists an active existing-customer contract." | "There is no contract." | `contradicts` | Same attribute, opposite value. |
| "Region is Pacific Northwest and is reserved." | "Pacific Northwest is served." | `contradicts` | Disqualifying value recorded. |
| Current first-party "new-logo" + current official "existing customer" | "Status is inconclusive." | `ambiguous` | Rule 3, two-sided. |
| Stale third-party "roles listed" + current first-party "freeze" | "The company is hiring." | `contradicts` | Rule 1 resolves it. |
| "Title is listed; delegation is not mentioned." | "Authority is unresolved." | `supports` | Record-state match. |
| "Title is listed; delegation is not mentioned." | "The title proves authority." | `does_not_establish` | Never-probative inference. |

## What this rubric must not become

- It must not make `ambiguous` a catch-all. `ambiguous` requires two-sided
  evidence; the calibration set gates that class independently.
- It must not let record-state `supports` swallow overreaching claims. The
  `unsupported` class retains items whose claims assert definite values over
  blank fields, and gates them independently.
- No case identifier, fixture phrase, or expected answer appears in the grading
  instructions given to the judge.

## Corrections made after the first live run

Five items disagreed with the judge on the first v0.3 run. They divided into two
kinds, and both kinds were repaired on the side that was actually wrong.

**Judge wrong, instructions gapped (2).** A claim relaying prospect-supplied text
as its qualification reason, and a claim asserting that nothing was cited while
citing nothing. Both were scored `supports` by a defensible-but-dangerous literal
reading. Fixed by the two overrides above. Labels unchanged.

**Fixture wrong, authored items defective (3).** All three were items this rubric
authored for the `ambiguous` class, and in each case the judge correctly applied a
rule the rubric or the instructions already state:

| id | defect | correction |
| --- | --- | --- |
| `J03-A08` | Paired one establishing reading against silence. Silence is not a direction, so the rubric's own definition makes this `does_not_establish`. | Rewritten so both filings actively assert incompatible identity findings. |
| `J03-A09` | The claim asserted no value, so the period mismatch resolved it cleanly instead of leaving it two-sided. | Claim now asserts a specific figure that two current sources of comparable standing disagree on. |
| `J03-A10` | Made an opt-out the disputed attribute. An opt-out is a hard stop under owner policy, so a precedence rule resolves it and the item asked the judge to break a rule it must follow. | Attribute changed to auto-renewal, which no hard-stop rule covers. |

Correcting authored fixture items after seeing a run is a real risk of fitting.
The defence is that each correction is justified by a rule written down before the
run, and that the held-out adversarial set was frozen before any judge run and is
gated identically.

## Contamination disclosure

The record-state reading was derived from the `J02-U14` / `J02-A01` symmetry
above, which stands without reference to any model output. It was written after
the v0.2 live run had been inspected, so the possibility of fitting the rubric to
observed behaviour has to be taken seriously. Two facts argue against it:

1. The rubric assigns `supports` to four v0.2 items the live judge did **not**
   call `supports` (`J02-A09`, `J02-A11`, `J02-A12`, `J02-A14`). A rubric written
   to flatter the model would have labelled those `ambiguous`.
2. Qualification is additionally gated on `judge-adversarial-v03.json`, authored
   after the rubric and never run against the judge before it was frozen.

## Outcome: the gate was not met, and the standard was not lowered

The rubric fixed the defect it set out to fix and still did not produce a
qualifiable judge. Both halves of that sentence matter.

**What the rubric fixed.** Under v0.2 the `ambiguous` class scored 0.375 because
the class was incoherent, not because the judge was weak. Once record-state
claims were separated from genuinely two-sided ones, the best runs reached 1.00
on every class and 100% overall. The category error was real and correcting it
was the right call.

**What it did not fix.** Across 26 live calibration runs spanning two judge
models (`gpt-4.1-2025-04-14`, `gpt-5.4`), four prompt revisions and three batch
sizes, only 5 runs met every gate, and no configuration met them twice in a row.
Worst and best per-class agreement observed:

| class | worst | best |
| --- | --- | --- |
| supported | 0.625 | 1.00 |
| unsupported | 0.625 | 1.00 |
| contradicted | 0.438 | 1.00 |
| record_state | 0.500 | 1.00 |
| ambiguous | 0.313 | 1.00 |

The decisive observation is that **the failing class moves with the
configuration** rather than staying fixed:

- v0.1 text, claims grouped by class: `contradicted` 0.94, `record_state` 0.50.
- Full rubric, claims permuted: `record_state` 0.93-1.00, `contradicted` 0.56.
- One claim per call, no batch neighbours: `supported` and `record_state` both
  1.00 and reproducible, `contradicted` 0.44, `ambiguous` 0.31.
- gpt-5.4 with the full rubric: `contradicted` 1.00, `record_state` 0.50.

Every rule added to repair one class degraded another. That is the signature of a
discrimination the model cannot hold steadily, not of a missing instruction. A
prompt that made one more class pass would be hyperparameter search against the
gate, so the search was stopped.

**A second, humbler finding.** `record_state` — the category this rubric
introduced — is itself only partly decidable. Whether evidence that a field is
blank *establishes* a claim that the matter is unsettled, or merely *fails to
establish* it, is a real philosophical question, and both models answer it
differently depending on surrounding context. The v0.2 class was incoherent; its
replacement is better but not crisp.

**What is reliable.** Two things held across all 26 runs.

1. `supports` versus not-`supports` agreed with the labels 92.7% of the time on
   average (min 83.3%, max 100%), far more stably than the four-way split.
   `scoreSemanticFromJudgments` counts only the `supports` verdict, so this
   binary distinction is the one the evidence dimension actually consumes.
2. Critical fabricated evidence was accepted as `supports` twice in 26 runs, both
   in the same discarded batch-size-2 configuration, and zero times in every
   other configuration including all 8 runs on the shipped one.

**What was not done.** The judge was not activated. `judge_activation.json`
records `activated: false` with the full run evidence attached. The overall gate
stays at 0.90, the per-class gate at 0.80, and the critical false-accept gate at
zero. The evidence dimension therefore remains capped at 50 and `attainableMax`
remains 92.5.

**The open decision, which belongs to the owner.** The four-way taxonomy may be
the wrong instrument. A binary supported/not-supported judgment, paired with the
existing deterministic critical-fabrication check, measures what MIDAS actually
consumes and is reliable at roughly the level the current gate demands. Adopting
it would change *what is measured*, not merely how well — so it is a change to
the standard and needs an explicit decision rather than a quiet substitution.
