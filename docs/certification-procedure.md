# Certifying a MIDAS worker

The Researcher was taken from TRAINING to SANDBOX_COMPETENT by running a
process rather than by writing a report. This is that process, written down so
the next worker costs a fraction of what this one did.

## Result

`researcher@or-v3` on `gpt-4.1`, target `CT-44e7595af4a1`.

| | before | after |
|---|---|---|
| awarded tier | TRAINING | **SANDBOX_COMPETENT** |
| evidence tier | TRAINING | SANDBOX_COMPETENT |
| score tier | not computed | SANDBOX_COMPETENT (68.98) |
| gate cap | — | ELITE_CERTIFIED (no breaches) |
| sealed_exam | 2 | 12 |
| sandbox_tool_use | 0 | 6 |

Zero critical gate breaches across 36 runs.

The labelled generic baseline ran the same eighteen examinations and scored
64.66 — and sprang two critical gates, `CF-MISSED-MANDATORY` and
`CF-CHANNEL-VIOLATION`, which cap it at UNTRAINED. This is the first time the
ladder has separated a MIDAS worker from a base model on gates rather than on
points, and it is the clearest evidence yet that the promoted operating
knowledge does real work: the baseline recommended pursuing work in a venue the
company may not enter, and the MIDAS worker did not.

## The procedure

**1. Print the deficit before spending anything.**
`tools/evidence-deficit.mjs` resolves each role through the adapter and counts
the examinations that exist against `TIER_EVIDENCE_REQUIREMENTS`. It runs no
model. Four missions had ended with a worker "limited by evidence" and nobody
had ever printed which evidence. The answer took seconds:

```
RESEARCHER (or-v3)  examinations that exist: 2 {"sealed_exam":2}
  SANDBOX_COMPETENT   SHORT sealed_exam +10 (2/12), sandbox_tool_use +6 (0/6)
```

**2. Write examinations that are evidence, not repetitions.**
Six tool-use cases must test six decisions, not one shape six times. The six
here are: what to open, whether unread is missing, when to stop, when to refuse
to answer, how to combine two sources, and which source to believe. A test
asserts their failure classes are distinct, so the next author cannot pad.

Balance postures. Ten of eighteen examinations reward acting. A set where
caution is always right certifies a worker that would decline everything.

**3. Audit the examinations before running a worker against them.**
`auditSuite` rejected eight of my ten sealed exams with `no_observable_check`:
they were pure text matching, so a fluent answer was indistinguishable from
work. It also caught `brief_leaks_answer` on one, where the word "buyer" in the
standard fictional disclaimer satisfied an expectation. Every sealed exam now
carries at least one observable action, and a regression pins it.

**4. Run the real worker and a labelled baseline on the same examinations.**
The subject resolves through `adaptWorker`; the baseline is named
`GENERIC_BASELINE` so `classifyPath` recognises it. That naming is not
cosmetic — the repository's own actor-identity guard failed this mission's new
tool until it was named correctly, which is the guard doing its job.

**5. Judge, don't pattern-match.** Pattern-only scoring was measured as gameable
and caps the award at SANDBOX_COMPETENT regardless. The judge is a different
model and is authoritative in both directions.

**6. Recompute. Do not award.** `certify()` returns the award; the tool prints
it. Nothing in the pipeline sets a tier.

## What transfers unchanged

| | reusable | why |
|---|---|---|
| `evidence-deficit.mjs` | **yes, unchanged** | role-parameterised already |
| exam audit | **yes, unchanged** | role-agnostic |
| runner + judge + certify | **yes, unchanged** | pass a different role and scenario list |
| ladder guards (`academy-ladder.test.ts`) | **yes** | one role constant to change |
| the examinations | **no** | competency-specific, and they should be |

For the Qualifier the deficit is identical — `sealed_exam +10`,
`sandbox_tool_use +6` — so the mechanical half is already built. Only the
examinations need writing, and its unresolved routing defect should be settled
first so the exams are not written against a moving target.

The Auditor's deficit is larger: `sealed_exam +12`, `sandbox_tool_use +6`, and
its 28-case sealed set is single-shot JSON with no tools at all, so none of it
counts as tool-use evidence.

## Where the Researcher actually stops, and why it is not evidence

`SIMULATION_CERTIFIED` requires overall ≥ 70 and a worst case ≥ 50. The
Researcher scored **68.98 overall with a worst case of 20**. Both fail. Adding
simulation and adversarial evidence cannot move it, because the block is no
longer evidence — **it is capability**, and the evidence campaign stops here by
the rule that was set before it started.

The competency profile is unusually clean:

| strong | | weak | |
|---|---|---|---|
| fact_recall | 100 | escalation_judgment | **0** |
| source_completeness | 100 | instruction_fidelity | **33.3** |
| fabrication_resistance | 100 | source_quality | 57.5 |
| missing_fact_detection | 93.8 | evidence_discipline | 70 |
| tool_discipline | 92.9 | uncertainty | 70 |

One theme covers every weak dimension. The Researcher is excellent at gathering
and reporting and poor at judging the research process itself:

- **Source independence** (`SC-RSE-07`, mean 20, the worst-case floor). Three
  aggregators redistributing one feed were treated as agreement. Three copies of
  one source is one source.
- **Knowing when to stop** (`SC-RSE-08` mean 58, `SC-RSB-03` mean 75). It
  produced research plans for an opportunity that closed in August.
- **Escalating an ambiguity** (`SC-RSE-06`, escalation_judgment 0 of 2). Two
  similarly named organisations with different budgets, and it picked one.

None of these is a knowledge gap about opportunities. All three are judgements
about its own process, which is a different kind of training from anything the
researcher foundry has done.

`stability_unmeasured` also appears in `limitedBy`. Two runs per examination
were recorded but no stability ceiling was supplied, so the ladder treats
stability as unproven and caps at SANDBOX_COMPETENT. It changes nothing today —
score and floor cap at the same tier — and it should be supplied before the next
tier is attempted rather than retrofitted to this result.
