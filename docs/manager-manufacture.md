# The MIDAS Manager

Manufactured because six missions went into one worker's one behaviour and
nothing was deciding whether that was where the next unit of capital and
attention should go. Two of those missions tested interventions that in hindsight
nobody should have attempted; one discovered that the thing being measured had
been forbidden by the environment all along. Each was defensible in isolation and
the sequence was not.

## Absence, proved before anything was built

`adaptWorker("manager", …)` returned `midasWorker: false` with *"No MIDAS worker
has been manufactured for the manager role."* A role name has never been allowed
to conjure a worker here, and the presence test now asserts the opposite: the
live path resolves `manager@mg-v1` with all ten doctrine items verbatim, a bare
call still reports absence, and `sales` and `technical` still do too.

## The result

Sealed set `6b5a8bcae39ec445` — 12 cases, 12 distinct businesses, all 12 action
classes reachable as a correct answer, 11 bottlenecks exercised. Two candidates
declared before running, each with its own gate.

| | bottleneck | action | alternatives | epistemic | authority | defer/kill | owner |
|---|---|---|---|---|---|---|---|
| A baseline | 0.833 | **1.000** | 1.00 | — | — | — | — |
| B contract | 0.750 | 0.750 | 1.00 | 1.00 | 0.25 | 0.667 | 0.583 |
| C doctrine | 0.833 | 0.833 | 1.00 | 1.00 | 0.50 | 0.833 | 0.417 |

**Both candidates REJECTED.** Doctrine beat contract by 0.083 against a declared
margin of 0.10 — a near miss that is still a miss.

**The baseline chose a defensible action in all twelve cases.** That is the third
time a baseline has matched or beaten the structured arms here.

## Three defects in my own scorer, and what they did

Four cases were flagged for inventing economics, and **not one was a fabricated
business fact.**

- `40%` where the state says *"40 per cent"* — a correct citation, scored as
  fabrication because the normaliser compares digits to prose.
- `22%`, identically.
- `$1,800` where the state gives two pieces of work at 900 each — arithmetic over
  two declared figures, which is reasoning, not invention.

**The critical gate that failed all three arms recorded zero real fabrications.**

Two more gates measure the wrong thing. `authorityRequired` and
`ownerActionNeeded` are declared per case, but whether authority or the owner is
needed depends on *which action was chosen*. A manager that picks `research` on a
case whose tender needs a signature is marked wrong for saying research needs no
signature. It doesn't.

These are pinned by tests asserting the current behaviour, not repaired. The
gates were frozen before the run, both candidates failed under them, and
rescoring against a repaired scorer and then promoting would be inventing the
decision after seeing the result — which this repository has refused four times
and should not start doing now. Fixing any of them breaks a test, which forces a
deliberate update rather than a gate that quietly changes meaning.

What this means for the verdict: the rejection stands procedurally, and the
evidence underneath it is much weaker than the gate sheet suggests. **The next
cycle must repair the scorer before its numbers mean anything**, and it should be
cheap — the cases, the contract, the doctrine and the arms all already exist.

## Leverage: would it have allocated our own history better?

Five checkpoints from committed history, given as they stood, with nothing about
what followed.

| | what proved right | what it chose | |
|---|---|---|---|
| H-1 | establish which actor is being examined before training | `execute_bounded_action` | differs |
| H-2 | decompose the variance before retraining | `run_micro_test` | **matches** |
| H-3 | refuse the post-hoc promotion; build a missing role | `run_micro_test` | differs |
| H-4 | stop after four rejections of the same class | `train_capability` | differs |
| H-5 | do not adopt an unmeasured repair with a known cost | `decline` | **matches** |

**2 of 5 actions recovered, 4 of 5 bottlenecks.** It reads the situation better
than it decides what to do about it — and H-4 is the one that matters most: given
a state describing four failed explanations of the same kind, it chose to train
capability rather than to stop. That is the exact error the role exists to
prevent, and it did not avoid it.

The caveat is real and cuts hard: I chose these checkpoints and know their
outcomes, and they are legible because the outcome is already understood. This is
evidence of partial leverage, not proof of any.

## Where it stands

`manager@mg-v1` exists, resolves on the live path, and holds **TRAINING**. No
configuration was promoted. Its measured capability is genuine but unproven: it
identifies the binding constraint reliably, generates real alternatives in every
case, separates fact from unknown in every case, and selects the right action
about five times in six — while a bare model with a one-line instruction selected
a defensible action six times in six.

## Budget

41 substantive calls of a 60 ceiling; 36 planned as the minimum, 5 on leverage,
zero on `gpt-5.5`. The budget was computed from turns rather than cases and would
have refused to start had it not fitted — the correction to last mission, where
six cases across two arms were planned as twelve calls and the control arm alone
consumed sixteen. A test reproduces that exact miscalculation and asserts the
guard rejects it.
