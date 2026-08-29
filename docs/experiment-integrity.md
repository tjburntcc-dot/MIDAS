# The experiment integrity layer

Zero model calls. Everything below is deterministic.

## Why

Twenty-five experiment defects are recorded in this repository as data, not
recollection. **Seventeen were found only after spending. Ten changed a verdict.**
Three missions in five report that a defect in the harness nearly became a
finding about a worker or an architecture.

| category | count |
|---|---|
| SCORER_DEFECT | 4 |
| GOLD_DEFECT | 3 |
| CASE_DESIGN | 3 |
| STATISTICAL_RESOLUTION | 2 |
| TOOL_AFFORDANCE | 2 |
| BUDGET_PLANNING | 2 |
| nine others | 1 each |

That is not a run of bad luck. It is the dominant failure mode, and it compounds
against every future experiment.

## What was built

A manifest, a preflight that refuses, and one integration point. Not a platform.

**Every check is derived from a defect that actually happened and names it.** A
check nobody was ever burned by would be the ceremony this repository keeps
refusing to build.

| check | refuses | from |
|---|---|---|
| `actor_is_a_midas_worker` | a bare model on a certification path | D-01 |
| `environment_declared` | a subject with no execution environment | D-19 |
| `one_variable_per_arm` | an arm differing in more than it declares | D-22 |
| `information_parity` | an arm that sees facts another cannot | D-22 |
| `sealed_set_is_fresh` | a holdout that already informed a diagnosis | D-23 |
| `no_answer_leakage` | a case containing its own answer | D-05 |
| `gated_metric_is_exercised` | a gate on a metric no case exercises | D-20 |
| `gates_are_preregistered` | a gate declared after the fact | D-18 |
| `scorer_reads_a_categorical_field` | a rate computed from a free string | D-12 |
| `expected_tool_is_offered` | a workflow needing a tool no arm has | D-13 |
| `turns_fit_the_workflow` | a budget shorter than list to read to decide | D-15 |
| `budget_fits_the_ceiling` | cases planned as calls | D-16 |
| `per_arm_reservation` | one arm able to starve another | D-17 |
| `decision_resolution` | a margin one case can satisfy alone | D-08 |
| `raw_trace_is_sufficient` | a tool experiment that cannot explain its own failure | D-21 |
| `criteria_unchanged` | a criterion mutated between declaration and reporting | D-18 |

Twenty-seven adversarial tests: fifteen replay a defect and require a refusal,
three are legitimate experiments that must clear, and the rest cover advisory
findings, the early-stop rule and the criteria fingerprint. **A regression asserts
that every category which has already cost a verdict has a preflight check.**

The early stop is preregistered-only: an undeclared stop is refused outright, so
it cannot be used to walk away from a result already visible.

## Coverage

46 tools spend model calls. **None is on preflight yet**, three carry a budget
guard, 24 declare criteria before running. Nothing was mass-refactored: the next
high-stakes experiment migrates, and the rest follow when they are next touched.
A sweep would be a large diff nobody asked for and would prove nothing.

## The finding that changed the plan

My last two checkpoints recommended an evidence campaign for Qualifier, Auditor
and Manager. **A mechanical readiness check says none of them should receive one,
and I was wrong.**

"Limited by evidence" was being read as "run more evidence". Evidence binds to a
configuration. Four questions decide it, and all four must clear:

| | capability blocked | configuration stable | examinations trusted | verdict |
|---|---|---|---|---|
| Researcher | **yes** — 68.98/70, worst case 20/50 | yes | yes | evidence already sufficient; a campaign buys nothing |
| Qualifier | **yes** — frozen routing defect | **no** — the repair changes the contract | yes | evidence would be discarded |
| Auditor | no | **no** — both candidates rejected, none promoted | **no** — two known gold defects, AS-05 and AS-27 | not trustworthy |
| Manager | no | **no** — rejected under a scorer since found defective | yes | configuration undecided |

**No worker is EVIDENCE_READY.** Buying rows now would buy rows bound to a
configuration about to change, or produced by examinations with known defects.

## Foundation exit criteria

Foundation work stops dominating when all of these are true, and not before:

1. **The substrate is trusted.** High-stakes experiments run on preflight, and a
   mission passes without a harness defect appearing in its checkpoint. Two
   consecutive clean missions is the honest bar; the current streak is zero.
2. **One control worker is legitimately certified above SANDBOX_COMPETENT**, on a
   configuration that is promoted rather than merely resolvable.
3. **Team reliability is measured** end to end, on repeat runs, with handoff
   fidelity and provenance preserved.
4. **The remaining defects are worker intelligence rather than plumbing.** The
   current inventory says the opposite: four scorer defects, three gold, three
   case design.

None of the four holds today. The nearest is the first, and this layer is what
makes it reachable.
