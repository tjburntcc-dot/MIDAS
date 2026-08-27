# Doctrine and idea registry — plan

Recorded 2026-08-27. A structure for classifying accumulated MIDAS ideas, so that
high-value ones are not lost and low-value ones do not outrank economic
capability by being the most recently mentioned.

**Not built yet.** This is the shape it should take and the rule that keeps it
honest.

---

## The failure this prevents

A long ideas document is read top to bottom, and whatever is near the top gets
built. That ordering has nothing to do with value. Worse, visual and UI ideas
read as concrete and tractable while capability ideas read as vague, so a
registry with no economics attached will systematically over-build the former.

The registry exists to force each idea to declare what it is and what it would
unlock, before anything is scheduled.

---

## Classes

Each idea gets exactly one. The class determines what evidence it needs before it
can be scheduled, which is the point of classifying at all.

| Class | What it is | What it must declare before scheduling |
|---|---|---|
| **PERMANENT PRINCIPLE** | A rule that should hold across everything | What it forbids, and what it would cost if violated |
| **CAPABILITY** | Something MIDAS cannot currently do | What work it unblocks; what currently happens instead |
| **WORKER COMPETENCY** | A skill a role needs | Which examination would show it is absent |
| **EVAL REQUIREMENT** | A property the Academy must measure | What can currently pass without it |
| **INTEGRATION** | Wiring between existing parts | Which path currently bypasses what |
| **INFRASTRUCTURE** | Plumbing | What it makes cheaper, and by how much |
| **UI** | Something a human looks at | Which decision it improves, and who makes that decision |
| **RESEARCH HYPOTHESIS** | Might be true, unknown | What experiment would settle it, and its cost |
| **BACKLOG** | Worth keeping, not worth planning | Nothing |

---

## The rule that does the work

**An idea cannot be scheduled until it names the decision or the money it
changes.** Not what it enables in principle — what it changes about a decision
somebody actually makes, or a dollar somebody actually receives.

An idea that cannot answer that is BACKLOG. This is not a quality judgement; some
excellent ideas are premature, and BACKLOG is where they wait.

The rule is aimed at one thing in particular. UI ideas are the easiest to specify
and the easiest to feel progress on, and they are almost never the constraint. A
UI item must name the decision it improves and who makes it, or it does not get
scheduled — and "it would be easier to see what is happening" is not a decision.

---

## Ordering, once classified

By expected value, which needs three things stated per idea:

1. **What it unblocks**, in work or money.
2. **What it costs**, in effort and in what it displaces.
3. **What currently happens instead** — the honest counterfactual, which is
   usually "the same thing, slightly worse" rather than "nothing".

The third is the one most often skipped, and it is the one that stops a
nice-to-have from looking essential.

---

## Provenance

Each entry records where it came from: a mission instruction, a meta-audit
finding, a real failure, a shadow discrepancy, or an idea in passing. Provenance
predicts value. An idea traceable to something that actually went wrong has
already demonstrated its problem exists; an idea from a brainstorm has not.

---

## When to build it

When the number of live ideas exceeds what can be held in a checkpoint —
roughly, when a mission has to choose between good options rather than doing all
of them. That point is close but not reached: the current bottlenecks are named
and few.

Building the registry before then would be an infrastructure item that fails its
own scheduling rule, which is a reasonable test of whether the rule is any good.
