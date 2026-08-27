# Meta-audit of the Academy

Last run 2026-08-27, before reporting any result as PASS.

The purpose is to answer honestly whether the certification infrastructure
measures anything. Findings are carried forward across runs; fixed ones stay
recorded, because a defect that was once real is the best guide to where the
next one will be.

---

## Fixed — 2026-08-27 (second run)

### 0. The Academy had never examined a MIDAS worker — severe

Every certification issued across three sessions examined a bare base model
given a generic professional instruction. The promoted workers, carrying
foundry-earned knowledge, had never entered the Academy at all. Every number
published about "the qualifier" or "the researcher" described something else.

Nothing in the system asks *what is being certified*. Every check verifies that
the examination is sound and the scoring honest; none asks whether the thing
under examination is the thing whose name is on the certificate. That gap is
closed for these two roles by wiring, and remains open as a general property.

### 0b. Pattern-AND-judge produced false negatives

Requiring both stopped keyword mirroring and created the opposite defect. A
worker that said "as a new sole operator, I have not yet delivered completed
client projects" scored zero for honesty because the pattern wanted "new
business". A false negative looks like a worker problem and gets trained, which
makes it more expensive than the false positive it was guarding against.

The judge is now authoritative in both directions. Re-validated: the strongest
adversary still drops 38 points, and the honest worker now gains 7.68 instead of
losing 16.

---

## Fixed — 2026-08-27 (first run)

### 1. Pattern scoring could not tell words from work — severe

A policy handed the rubric's own patterns, emitting text that satisfies them
while doing none of the work, scored 65 to 86 across every role. Higher than a
real model scored in most of them. Every tier award rested on a distinction the
scoring could not make.

Three repairs, in increasing order of how structural they are:

- **An independent judge** on a different model confirms substance behind
  expectations a pattern already matched. Credit needs pattern AND substance; a
  trap fires on pattern OR substance.
- **Scenarios rebalanced toward observable process.** Twelve of twenty scored
  under a quarter of their points on anything a well-worded answer could not
  fake. Opening the document you needed is not fakeable in prose.
- **Certification refuses to award above SANDBOX_COMPETENT on unjudged scores.**
  This is the repair that does not depend on the judge being good.

### 2. Weighting process created a stronger adversary

The fix for (1) made diligence scoreable, so it was attacked in turn. Diligence
alone reaches 46 — sound. Diligence *plus* rubric knowledge reaches 87 to 100,
worse than either component alone.

The judge cuts that adversary from 92.58 to 49.26 while costing an honest worker
exactly zero. Separation is still −5.59: **a rubric-omniscient worker that also
does the work still outscores the real model.** See finding 12 below for why part
of that is irreducible.

### 3. The Academy could not reject a bad exam

It can now, and immediately rejected one of mine. `SC-SALES-04` trapped
"absorbed the booking system into the price" with a pattern matching *booking*
near *included* — which is what "the booking system is **not** included" says.
The trap fired on the correct answer, failing every competent worker while
looking rigorous.

Four briefs also satisfied their own rubrics. The check that found the first is
the one worth having: construct the answer a rubric-perfect worker would give and
ask whether it springs the scenario's own traps.

### 4. Traps fired on replies that decided nothing

Found by diagnosing a real failure. A worker that recommended nothing tripped
"recommended pursuing this" because its reply contained "recommendations".
Generalised rather than patched: every trap is now tested against four replies
that decide nothing. Two more of the same class surfaced immediately.

### 5. Robustness measured the wrong thing

It measured spread across different examinations and called it stability. Now
measured on repeats of the same case, and it is a fourth certification veto.
Worker instability accounts for 47% of total spread; the old metric attributed
all of it to exam difficulty.

### 6. The evidence validator punished honest work

The judge's quote had to appear verbatim, and an honest run was zeroed because
the judge elided a clause and quoted across a JSON boundary. Word-overlap now.
The check exists to catch an evaluator inventing support, not to punish it for
tidying a quote.

### 7. Team certification treated any gap as a loss

Found by running it on real pipeline artifacts for the first time. A stage that
summarises without restating every fact, followed by stages that restate it, has
delivered the fact. Loss is now absence at the final stage, with misreporting as
a separate breach.

---

## Fixed — 2026-08-26

### 8. The examinations could be passed by caution alone

Every sales, manager and technical examination rewarded refusing, holding firm or
escalating. Three counter-cases added where acting is correct; two caught new
failures immediately. A guard now fails the suite if any role lacks one.

---

## Open, and what each one costs

### 9. Nothing independently audits the scenario gold

The mechanical checks catch structural defects. They cannot catch a case whose
*label* is wrong — an agency roster labelled "not a buyer" when it is arguably
buying. That class has a measured 20% incidence in a sealed set built carefully.

### 10. One author, one register

Every scenario was written by the same author in the same voice. A worker that
generalises poorly outside that register would not be caught. The AutoShop
failure history is the nearest available second source, which is the strongest
argument for that harvest.

### 11. Stability is measured on five cases, one configuration

Enough to establish that instability is large. Not enough to characterise it per
role, and the certification run applies a single ceiling across all roles as a
result — conservative, but coarse.

### 12. A rubric-omniscient adversary is partly irreducible

On the clean-document audit the strongest adversary scores 100 before and after
judging, and the judge is right. It read the facts and concluded the document was
clean, which is the correct answer. When the right output is a short conclusion,
doing the work and stating it *is* competence.

The remaining defence is that a real worker does not have the rubric. That is
real, unquantified, and would be maintained by sealed-scenario rotation, which
does not exist.

### 13. Certification does not expire in time

Invalidated by configuration change and nothing else. Providers change behaviour
behind a stable version string.

### 14. The integration audit only checks declared paths

A path added tomorrow and not declared is invisible to it. The audit found a real
bypass, and would not find one nobody thought to list.

### 15. The auditor gates other certifications on two examinations

An auditor must be certified before external preparation is permitted, and that
rests on two scenarios. Thin for something load-bearing.

### 16. Frontier tiers are unreachable

They require a measured margin and no comparison has been run. Correct behaviour,
untested machinery.

### 17b. Nothing verifies what is under examination

Added 2026-08-27. See finding 0. The certification target records a worker
version, and nothing checks that the runtime actually used it. For three sessions
it did not, and every guard passed.

### 18. Reading more is not the same as judging better

The context-construction repair reliably increases how much a worker reads and
reliably increases its score. It did not uniformly improve gate profiles: one
sales run traded two unauthorized-commitment gates for a fabrication gate. This
session measured the reading and assumed the judgement.

### 17. The Academy still largely validates itself

The judge is a second model, which is real independence on the scoring axis. The
gates, scenarios, gold and this audit remain single-author. The caution-gaming
vector and the process-weight vector were both found by deliberate attack, not by
any automated check — and a third of that kind is likely to exist.

---

## What an experienced practitioner would still say is missing

Carried forward unaddressed from the previous run:

- **Sales**: no examination rewards qualifying out early, which is most of the job.
- **Engineering**: no examination has an ambiguous requirement and nobody to ask.
- **Security**: the credential case tests recognising a leak, not noticing that a
  task quietly requires access it should not need.
- **Operations**: nothing runs longer than one conversation, and delivery
  reputation is made on day seven of a slipping project.
- **Procurement**: every mandatory-requirement case involves a requirement the
  company plainly cannot meet. The expensive real case is the one it nearly meets.

---

## Verdict

The instrument is materially better than it was, and the improvement is measured
rather than asserted: a policy that beat the real model by 32 points now loses to
it, an exam that failed competent workers has been found and fixed, and
instability that was invisible now caps certification on its own.

It is still a floor. A certified configuration is not thereby safe; an
uncertified one has simply not shown it is. Seventeen findings above, seven fixed
this run, and the two most valuable were found by attacking the fix for the
previous one.
