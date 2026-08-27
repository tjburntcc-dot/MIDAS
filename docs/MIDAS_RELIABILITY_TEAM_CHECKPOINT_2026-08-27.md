# MIDAS Foundation Lock + Team Reliability — Checkpoint

2026-08-27 · Headquarters ingestion artifact · no secrets, no sealed answers

---

## Repository

| | |
|---|---|
| HEAD at start | `f59d89e` |
| HEAD at end | `ca9a7fc` |
| Branch / tree | `main`, clean |
| Ahead of origin | 45 commits |
| Tests | 1033 passing, 0 failing |
| Model spend this mission | ~$0.44 **flat-rate estimate** (see cost note) |
| Cumulative | ~$6.94 of the $25 checkpoint |
| Outbound actions | **0** |
| Accounts created | **0** |
| Production actions | **0** |

---

## What was proven

**1. The actor-identity failure is now structurally hard to reintroduce.**
Enumerated programmatically across 212 files. 36 execute a model. Classification:
6 resolve a MIDAS worker through the adapter, 1 does that plus a labelled
baseline arm, 16 execute a promoted worker in its native foundry form, 13 use a
model as a tool. **Undeclared: zero.** The regression walks the whole repository,
so a path added tomorrow is audited without anyone remembering to list it.

A result must now be able to say what produced it. A generic baseline can never
certify a worker however completely described; an undeclared subject certifies
nothing; an incomplete one names its missing field.

**2. Team stability, measured for the first time.**

| Model | distinct chains | final dispositions | divergence |
|---|---|---|---|
| gpt-4.1 | 2 of 3 | decline, decline, hold_for_info | all at **qualification** |
| gpt-5.5 | 1 of 3 | hold_for_info ×3 | none |

**3. Handoff fidelity is not the problem.** Across both models: zero epistemic
drift, zero provenance loss, zero commitments. No stage upgraded a reported fact
to a confirmed one, no claim lost its source, nothing committed without
authority.

**4. The chain amplifies rather than corrects.** One stage differed and every
downstream stage adopted it unchanged. Five stages did not make the answer more
reliable than one. There is no reconciliation step anywhere in the chain.

---

## What was falsified

**The instability premise, largely.** Carried forward from the prior mission and
confirmed here: on cases where the worker's material behaviour was identical
across four trials, pattern scoring moved 18–44 points and judged scoring moved
zero. Score movement was the instrument.

**A repo-wide loader defect that does not exist.** Two regexes in one file
matched nothing and the file *appeared* to contain word boundaries, because
`JSON.stringify` renders a real backspace byte as `\b`. A byte-level check found
actual `0x08` characters written by my own shell heredoc, in exactly one file.
The rest of the repository is clean. This was one check away from being reported
as a systemic defect.

**Temperature as a lever.** Negative result, retained: temperature 0 fixed
neither critical case and made the migration case worse.

---

## First-divergence distribution

Individual worker level, 30 pairs: `output_timing` 13, `tool_choice` 8,
`retrieval` 3, `interpretation` 2.

Team level: **all divergence at qualification**, none elsewhere.

Variability enters through *when the worker acts* and *what it opens* — not
through reasoning being stochastic. That points at different repairs than "model
variance" would have.

---

## Cost accounting

Rebuilt because the previous mission correctly withheld a dollar claim and the
estimator could not do better.

- The price table starts **empty** and never invents a rate.
- A price without a source or an effective date is refused at load.
- An unpriced model returns `COST_NOT_COMPUTED` with token counts intact.
- A comparison with one unpriced side refuses to say which is cheaper while still
  reporting the token ratio.
- A test asserts no rate literal appears in the module.

**Current status: COST_NOT_COMPUTED for both models.** The stronger model used
2× input and 4.7× output tokens on the team run. That is a token count, not a
price. The flat-rate estimator remains for single-model run budgeting and now
declares itself as flat-rate in both documentation and output.

**The economic comparator answers the right question**: fewer critical failures
beats cost, quality decides before cost, and where cost is unknown it states
which way the decision would have to go for the unknown to matter.

---

## Certification state

| Role | Worker | Status |
|---|---|---|
| Researcher | `or-v3` | 100, 4/4 reads, no gates |
| Qualifier | `oq-v2` | 65 (protocol +30.45, knowledge +19.55) |
| Sales | **none exists** | base model; results describe the model, not MIDAS |
| Auditor | **none exists** | fails the clean document |
| Manager | **none exists** | +34 to +47 from protocol alone |

**SHADOW ELIGIBLE: NO.**

**Exact blocker:** the qualification stage reaches different dispositions on
identical input under the current base model, and that difference becomes the
organisation's answer. Everything else in the chain is sound.

---

## Three defects found in my own instruments

All the same class — wording-sensitivity inside tools built to detect
wording-sensitivity:

1. Authority compared as a raw string, so identical positions read as divergence.
2. The replacement used a fixed character window, defeated by an enumerated list.
3. Backspace bytes from a shell heredoc, disguised by `JSON.stringify`.

The pattern is worth carrying forward: **the instrument is as likely to be wrong
as the thing it measures, and in the same way.**

---

## Recommended next mission

**Do not** add knowledge, agents, or architecture. Two bounded actions:

1. **Re-run team stability with qualification on the stronger model and every
   other stage unchanged.** This isolates whether the model choice fixes the one
   unstable stage, and it is a measurement, not a build.
2. **Establish real per-model pricing** and load it into the new cost module.
   Until then no cross-model economic claim can be made, and the stronger model
   is currently recommended on critical-failure grounds alone.

**What to stop working on:** the researcher, the evaluator, and the handoff
layer. All three are measurably sound and none is the bottleneck.

**What should be made smarter next:** the qualifier — specifically its decision
consistency, not its knowledge. It has knowledge and uses its tools; it does not
reliably reach the same conclusion twice.

---

## Company 0

Unchanged and correctly recorded as unresolved. Legal entity unknown, possibly
never formed. Stripe reported as a business account with its underlying identity
unverified. Adult participation in a large contract currently unlikely. A
seventeen-question professional review packet is prepared and unengaged.

**Company 0 bottleneck:** legal readiness, resolvable in one consultation.
