# The workstation affordance: repaired, tested, and not adopted

## What was wrong

A worker was given a workstation containing `record` and `instruction`. It called
`list_objects`, then `read_object` with id `"document"`, then `list_objects`
again, and stopped. It never reached what it needed.

`document` is not an id. It is the **kind**, printed unlabelled between the id
and the summary:

```
record [document] A supplier opportunity of unspecified value.
```

`read_object` answered `No such object: document` — naming no valid id — so there
was nothing to recover from.

## The repair, which exists and is tested

```
id="record" kind="document" summary="A supplier opportunity of unspecified value."
No such object id="document". Available object ids: ["record","instruction"]
```

Twenty-one deterministic tests cover it: every visible object exposes a labelled
id, kind cannot be mistaken for id, summaries survive, ordering carries no
meaning, bodies never leak into the inventory, valid ids resolve verbatim, a miss
names the existing ids, a miss never fuzzy-matches into the wrong object, the
hint set is exactly what listing discloses, duplicate kinds stay distinguishable,
similar ids do not collide, and a quote in an id cannot break the entry apart.

There is no hidden-object concept in this sandbox — `list_objects` returns every
object — so the id hint discloses nothing that inventorying does not. A test
asserts the two sets are equal, so if a visibility boundary is ever added, both
must consult it.

## Why it was not adopted

**The causal probe failed, and the failure was mine.** I planned six cases across
two arms as twelve calls. Multi-step reading costs two to three calls per case,
because that is what multi-step means. The control arm alone consumed all sixteen
calls of the ceiling and the treatment arm never ran.

There is therefore no comparison, and a frozen adoption rule said not to adopt on
appearance. The active contract stays `workstation-inventory-v1-positional-ids`.

Adopting anyway would have been expensive as well as unprincipled. The
environment id would have moved, which by the portability rule below costs every
piece of the Researcher's evidence its applicability — a real, immediate loss
paid for an unmeasured gain.

**One thing the wasted arm did establish.** Across six cases built to require
multi-step reading, the old format produced **zero invalid ids** and read the
required object in five of six. The defect is real and was observed, and it is
rarer than a single incident suggested.

## The correction to what I claimed last mission

I wrote that this defect "can only have depressed" historical scores and "cannot
have manufactured a pass." That was wrong, and it was the kind of wrong that
matters: an unproven direction stated as a fact.

A failure to read an object can reduce source completeness — and it can equally
avoid a contradiction the worker would have had to handle, skip a difficult
branch, change where a worker stops, or make a simplistic expectation easier to
satisfy. The direction is not known and was never measured.

Historical multi-step results are therefore classified
`EXPOSED_TO_WORKSTATION_AFFORDANCE_DEFECT`, and nothing is rescored.

| classification | count | which |
|---|---|---|
| NOT_EXPOSED | 2 | `requirement-channel-probe`, `requirement-confirmation` — workstation pre-opened, no id ever constructed |
| EXPOSED_AND_UNCERTAIN | 9 | `academy-certification-midas`, `academy-diagnosis`, `action-selection-microcycle`, `escalate-reachability-probe`, `protocol-before-after`, `researcher-certification`, `team-stability`, `team-stability-gpt41-n5`, `variance-decomposition` |
| EXPOSED_BUT_STILL_INTERPRETABLE | 0 | none established: transcripts were not stored at the granularity needed to prove the required object was read correctly |
| INVALID | 0 | no measurement has concrete evidence that it cannot support its claim |

## Certification now binds its environment

`CertificationTarget` gained an optional `executionEnvironmentId`, fingerprinting
three components and nothing else: protocol version, workstation inventory
contract, action schema contract. No build hashes, no file paths — a component
earns its place only if changing it can change what a worker does.

Optional is the load-bearing choice. An absent value serialises away, so every
historical target id is byte-identical to what it was; `CT-44e7595af4a1` is
asserted unchanged by test. A target that declares an environment gets a
different identity, and a material runtime change moves it while irrelevant
metadata does not — both asserted.

`evidencePortability` reports honestly rather than inventing a rule: every
evidence class here is produced by a worker acting in the workstation, so a
change to the workstation contract touches all of them and none transfers. **The
Academy has no representation for partial portability across environments, and
none was invented.**

Because V2 was not adopted, the environment is unchanged, the Researcher's target
is still `CT-44e7595af4a1`, its SANDBOX_COMPETENT still describes the environment
it is running in, and the new evidence deficit is **zero**.

## What adopting V2 would cost, when it is measured

Environment `EE-8880ef0d5a0f` → `EE-501e420bcc31`, target `CT-44e7595af4a1` →
`CT-5550ebdfbcb4`, and every evidence class re-earned: 12 sealed exams and 6
sandbox tool-use cases to return the Researcher to SANDBOX_COMPETENT. That is the
price, it is known in advance, and it should be paid only once the repair has
been shown to be worth it.

## Next

A properly budgeted comparison: six multi-step cases at roughly three calls each
across two arms is about 36 calls, not 12. The cases, the contract, the tests and
the environment machinery all already exist, so the next attempt is only the
calls.
