# Three hypotheses for the missing escalation, and what survived

107 calls on `gpt-4.1`. No judge, no frontier model. Everything scored
deterministically from transcripts, because escalation is an action.

## The protocol revision was built, measured and rejected

`SANDBOX_PROTOCOL` v1 contained one sentence that appeared to forbid the
behaviour the Academy scores:

> Only ask the owner for a fact that no tool available to you could produce.

v2 replaced exactly that clause and nothing else, with a rule generated from
`escalation-law.ts` so the prose and the rule cannot drift:

> Ask the owner when a decision depends on something your tools cannot settle:
> which of several plausible things they meant, which outcome they want, or
> whether you are permitted to act. Do not ask about an ambiguity that would not
> change what happens; note it and continue. Do not choose between materially
> different readings on your own.

The workstation repair — *unread is not missing* — is untouched in v2, and a test
asserts that every other sentence is byte-identical.

Ten development cases, five requiring the worker to ask and five requiring it to
look instead, one run each, one variable:

| | action acc. | esc. recall | esc. precision | unnecessary esc. | tool-before-esc. | unread-as-missing | guesses |
|---|---|---|---|---|---|---|---|
| A `sandbox-protocol-v1` | 0.30 | **0.20** | 1.00 | 0.00 | 1.00 | 1 | 4 |
| B `sandbox-protocol-v2` | 0.30 | **0.00** | n/a | 0.00 | 1.00 | 0 | 5 |

**REJECTED** on five of eight pre-registered gates. Escalation recall went *down*.
Action accuracy did not move.

**The protocol has been reverted to v1.** v2 and the law module are kept because
they are what the rejected result describes and because the law is sound and
tested on its own terms — but the active pointer is v1, and a regression pins it.
Adopting a change with no measured benefit would have cost every escalation
number in the repository its comparability in exchange for nothing.

## Then the action schema, for six more calls

If the instruction was not the block, perhaps the contract was: the action schema
left `kind` an unconstrained string, so a model filling it might simply never
reach for `escalate`.

Three cases, free-string `kind` versus an enum of the four legal kinds with
`escalate` described:

| | escalations |
|---|---|
| free-string `kind` | 1 of 3 |
| enum-constrained `kind` | 0 of 3 |

Eliminated too.

## What is left

| hypothesis | status | what ruled it out |
|---|---|---|
| the worker lacks the knowledge | **eliminated** | a bare baseline with none of MIDAS's knowledge behaves identically |
| a procedure would teach it | **eliminated** | two procedures rejected, the second saying "CALL THE ESCALATE TOOL" in capitals |
| the protocol forbade it | **eliminated** | removing the clause reduced escalation |
| the schema never offered it | **eliminated** | constraining the field to an enum reduced escalation |

And one thing did survive, visible in the one case where escalation ever
appeared. `SC-PP-04` is the authority case, and its evidence object says, in the
document itself:

> Any action outside the granted list requires the owner.

That is the only case in any campaign where the worker has escalated, and it did
so once out of two observed runs of the same condition.

**The worker escalates when a document tells it to escalate. It does not derive
the need to escalate from the shape of the situation.** On a referent ambiguity
it describes both readings perfectly and finishes; on an owner-intent tradeoff it
names the tradeoff and picks. In both, nothing in the room says "ask someone" —
the requirement is implicit in the structure, and the structure is what it does
not read.

That is a real worker competency finding, and it is much narrower than "does not
escalate". It also explains why every instruction-level intervention failed: an
instruction in the *prompt* is not the same as a statement in the *evidence*, and
this worker acts on the second.

## What this costs, and what it does not

- No worker promoted, no certification changed. The Researcher remains
  `SANDBOX_COMPETENT` on `CT-44e7595af4a1`, earned under v1, unrescored.
- The protocol is unchanged in production, so nothing recorded becomes
  non-comparable. The impact analysis stands as a record of what *would* have
  become non-comparable had v2 been adopted: three of six stored result files
  carry escalation measurements.
- **A finding worth carrying:** `CertificationTarget` does not include the
  protocol version, so a protocol revision moves no target id at all. Had v2 been
  adopted, every certification would have carried across a change to the
  environment with no fingerprint moving. Recorded and not patched, because adding
  the field would change every historical target id and rewrite what past results
  were about. It should be added the next time a target set is created from
  scratch.

## Next

The cheapest remaining test of the surviving hypothesis is not another
procedure. It is to put the requirement where this worker demonstrably reads it:
an object in the workstation stating when the owner must be asked, and measure
whether escalation appears on referent and intent cases as it did on the
authority one. That is a handful of calls and it is a direct test of the one
explanation still standing.
