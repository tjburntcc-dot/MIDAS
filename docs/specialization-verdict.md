# What MIDAS's specialization is actually worth

Zero model calls. Everything below comes from repairing a scorer, re-scoring
stored outputs, and reading five cycles of committed results.

## The scorer was wrong, and it changed a verdict

Three defects, all of the same family: the check knew less about the dossier than
the worker did.

| defect | what it did |
|---|---|
| digits versus prose | `40%` against a state saying *"40 per cent"* was scored as fabrication |
| transparent arithmetic | `$1,800` from two supplied pieces at 900 each was scored as fabrication |
| action-independent gold | authority and owner-involvement were declared per *case* when they are properties of the *action chosen* |

Repaired, with support now classified as `supported_exact`,
`supported_equivalent`, `supported_derivation`, `unsupported_value` or
`unsupported_extrapolation`. The repair is not leniency: fifteen tests pair every
relaxation with a fabrication it must still catch, and the adversarial audit
caught the first repair being **too permissive** — it accepted `900 × 3` when 3
was not a supplied figure, read `90,000` as *"3000% of 3000"*, and tolerated
1,801 as a derivation of 1,800. All three tightened.

## Re-scored, post-hoc diagnostic only

Stored decisions, repaired ruler. This cannot promote anything: gates were frozen
before the run and both candidates failed under them.

| | action | authority | unauthorised commitments | invented economics |
|---|---|---|---|---|
| A baseline | **1.000** | 0.667 | **2** | 1 → **0** |
| B contract | 0.750 | **0.917** | **0** | 1 → **0** |
| C doctrine | 0.833 | 0.833 | 1 | 2 → **0** |

**All four fabrication flags were scorer error.** The critical gate that failed
all three arms recorded zero real fabrications. Authority correctness moved from
0.25 to 0.917 for the contract arm once the gold was indexed by action.

And the repaired scorer caught two failures the old one missed — the baseline
recommending an external professional engagement and a client commitment while
declaring neither needed authority. It is stricter where it matters and slacker
where it was wrong.

## The finding

**Decision uplift: not demonstrated.** The baseline chose a defensible action in
all twelve cases; neither structured arm did.

**Control uplift: indicated, not established.** The contract eliminated
unauthorised commitments and raised authority correctness by three cases in
twelve. Twelve cases and two events is a direction, not a result, and it should
be read that way.

**Doctrine has not earned its maintenance cost.** It beat the contract on action
(0.833 vs 0.750) and defer/kill (0.833 vs 0.667), and lost on authority (0.833 vs
0.917) and unauthorised commitments (1 vs 0). No clear function.

## The pattern across five cycles

| | supported by |
|---|---|
| **Structure beats knowledge** | four knowledge or doctrine packs measured against their own structure-only control; none promoted |
| **The contract adds control, not decisions** | Manager: unauthorised commitments 2→0, authority 0.667→0.917, action unchanged |
| **A baseline is competitive on single-shot judgement** | Auditor and Manager, both single-shot: baseline matched or beat both structured arms |
| **MIDAS prevents failures in multi-turn tool work** | Researcher: baseline sprang two critical gates in the sandbox; the MIDAS worker sprang none |
| **Evaluation is the dominant defect source** | seven instrument defects across five cycles, at least three of which changed a verdict |
| ~~Knowledge helps~~ | never shown; four attempts rejected |
| ~~Specialization improves raw decision quality~~ | never shown in any single-shot comparison |

## The benchmark

Classified **MIXED**: four discriminative cases, four moderate, four inferable
from a single salient fact. Not the reason the baseline scored 1.00 — a
ceiling-limited set would have produced ties everywhere, and the arms differ
sharply on control. But it is not a set that could detect a subtle decision
advantage either.

## What this means for where MIDAS invests

Four cycles have now compared prompt-scaffolding against a bare model on
single-shot judgement, and the answer has been the same every time. **A fifth
would be paying to re-learn it.**

The one place specialization has decisively won is the place with tools, state
and consequences. That is where the next differentiator should be tested, and
there should be exactly one:

**Proprietary company state that a bare model cannot have.** Not longer prompts —
a worker that can query what this company actually knows, what it has actually
tried, and what actually happened. Every candidate differentiator (memory, tools,
outcome history, coordination, certification) is a special case of the same
thing, and none should be built before one of them proves incremental value on a
measured comparison.

Explicitly not to be built on the current evidence: more doctrine, longer
contracts, a simulation platform, retrieval infrastructure, or a fifth
prompt-variant experiment.

## Known remaining instrument defect, recorded not chased

`ownerActionRequired` is a free string, so a manager that helpfully describes the
owner's optional part is scored as having demanded owner involvement. This is why
owner-attention reads 0.33–0.42 across all arms. The repair is a categorical
field on the contract, which changes the worker's prompt and therefore needs its
own measured cycle rather than a quiet edit.
