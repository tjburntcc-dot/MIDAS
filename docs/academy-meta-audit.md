# Meta-audit of the Academy

2026-08-26 · run before reporting any result as PASS

The point of this document is to answer, honestly, whether the certification
infrastructure measures anything. Two defects were found and fixed. Nine more are
recorded here unfixed, because naming a weakness is worth more than a report that
implies there are none.

---

## Fixed

### 1. The examinations could be passed by caution alone — serious

Every sales, manager and technical examination rewarded the same posture: refuse,
hold firm, escalate, decline. A worker whose entire policy was "never commit,
always escalate" would have scored well while being useless in practice.

The auditor was the only role with a counter-case, and that is the one the model
failed hardest — scoring 30 by manufacturing defects in a clean document.

Three counter-cases added where acting is correct and excessive caution is
trapped. Two caught new failures immediately (50 on answering a plain question,
45 on making a reversible fix). A guard now fails the suite if any role lacks a
case where acting is correct.

**This defect made the numbers before it partly meaningless**, and it was
invisible from inside the results: every score looked reasonable.

### 2. Robustness implied a measurement never taken

`robustness` computed spread across *different* examinations and called them
"runs", which reads as run-to-run stability. It is not. Renamed, with
`repeatedRunVarianceMeasured: false` stated on the record.

---

## Not fixed, and why they matter

### 3. Scoring is regex over output — gameable

A worker that pads its reply with the right phrases scores well without the
behaviour. Traps use the same mechanism and partly counteract it, since gaming
for points tends to produce text that also trips a trap, but this is a real
ceiling on what the current scoring can claim. Semantic scoring, or a second
model judging against the rubric, would be the repair.

### 4. Every scenario has one author, written in one session

The buyer messages share a register and a rhythm. A worker that generalises
poorly outside that register would not be caught. Real diversity requires
scenarios written by other people, or drawn from real transcripts.

### 5. One run per examination

No examination is repeated, so nothing here measures stability. A worker that
would have answered differently on a second attempt looks deterministic. This is
now stated in the output rather than implied away, but it is not measured.

### 6. Nothing audits the scenario gold

The foundry cycle run this session had 2 contestable cases out of 10 in its
sealed set — a 20% defect rate in an instrument built carefully. The Academy's own
gold has had no equivalent scrutiny. Given the four prior occasions where a
suspected worker failure turned out to be a measurement failure, the base rate
here is not low.

### 7. Frontier tiers are unreachable in practice

FRONTIER_COMPETITIVE and above require a measured margin against a strong generic
model. None has been run, so those tiers are structurally unreachable and the top
of the ladder is currently decorative. That is the correct behaviour — a frontier
claim without a frontier measurement is refused — but it means the ladder above
HIGH_STAKES is untested machinery.

### 8. Team certification has never run on a real chain

The mechanism is tested against synthetic chains. No real pursuit has been passed
through it end to end, so the fact-tracing patterns are unvalidated against how
real stages actually phrase things. The patterns are the weak point: a fact
restated in different words counts as lost.

### 9. There is no whole-organisation examination

The manager scenarios are the closest thing, and they are single decisions. There
is no sealed simulated company with a hidden trap, a budget, staff and a
multi-month objective. The mission asks for the minimum mechanism, not a
simulator; the minimum mechanism does not exist yet either.

### 10. Certification does not expire in time

A certification is invalidated by configuration change and by nothing else. A
result from six months ago on an unchanged configuration is treated as current.
Model providers change behaviour behind a stable version string, so this is not
theoretical.

### 11. The auditor gates other certifications on two examinations

An auditor must be certified before external preparation is permitted, and
auditor certification currently rests on two scenarios. That is thin for
something load-bearing.

### 12. The Academy validates itself

The auditor is certified by the Academy; the Academy's gates were written by the
same author as its scenarios; the meta-audit was performed by that author. There
is no independent check that the examinations test what they claim. The nearest
thing to independence used so far — a bounded review on a stronger model — has
overturned a verdict once and is worth repeating here.

---

## What an experienced practitioner would say is missing

**A sales leader** would ask where qualification-out is rewarded. Every sales
examination is about handling a buyer; none is about deciding early that a buyer
is not worth the time. That is most of the job.

**An engineer** would ask why there is no examination with an ambiguous
requirement and no one to ask. Every technical scenario has a discoverable right
answer somewhere in the world. Real work often does not.

**A security professional** would note that the credential scenario tests
recognising a leak, not the harder skill: noticing that a task quietly requires
access it should not need.

**An operator** would ask what happens on the seventh day of a delayed project
with an unhappy client, which is where delivery reputation is actually made or
lost. Nothing here runs longer than one conversation.

**A procurement professional** would note that the mandatory-requirement
examinations all involve requirements the company plainly cannot meet. The
expensive real case is the requirement it *nearly* meets, where the temptation is
to describe a partial capability as a whole one.

Those five are the strongest candidates for the next round of examinations, and
they are gaps in coverage rather than defects in the machinery.

---

## Verdict

The infrastructure measures something real: it capped a fluent, confident model
at TRAINING in five roles and UNTRAINED in one, on evidence, and the two defects
found above were both found by attacking it rather than by running it.

It is a floor, not a guarantee. Nothing here should be read as saying a certified
configuration is safe — only that an uncertified one has not shown it is.
