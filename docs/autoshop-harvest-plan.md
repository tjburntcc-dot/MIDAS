# AutoShop capability harvest — plan, not execution

Recorded 2026-08-27. **Nothing has been migrated.** This exists so the work is
not lost and not started at the wrong moment.

The instruction was explicit: preserve the plan, do not spend hours on migration
while the Academy and revenue work are unfinished. That is the right call — a
migration displaces exactly the work that currently blocks earning money — but
"do it later" without an inventory is how "later" becomes "never".

---

## What actually exists

Surveyed, not assumed.

| Location | Contents | Size |
|---|---|---|
| `../AutoShop/` | Next.js application: `app/`, `components/`, `lib/`, 31 TypeScript files | 803 KB |
| | **Zero test files. Zero markdown.** | |
| `~/Downloads/AUTOSHOP_*.md` | Spec, master handoff, operating doctrine, competitive benchmark, integrated strategy, governance clerk report, two SOV-brain repair documents | ~10 documents |
| `~/Downloads/AUTOSHOP_HANDOFF_STATE_*.json` | Machine-readable handoff state | |
| `~/Downloads/AutoShop*.zip` | Archived copies, provenance unverified | |
| `MIDAS` repo | `product-shell.ts`, `checkpoint26.ts`, `CURSOR_HANDOFF.md` already reference AutoShop | |

The shape of that inventory is itself the finding: **the code has no tests and
the strategy documents have no code.** The transferable asset is more likely to
be in the documents than in the application.

---

## Classification, applied per artifact

Each artifact gets exactly one disposition. The default is ARCHIVE, because the
cost of carrying something forward is paid every time someone reads it.

**TRANSFER** — works as-is, fills a gap MIDAS currently has.
Candidate: none identified yet. The Next.js app targets a different domain and
MIDAS has no UI requirement that is currently blocking anything.

**ADAPT** — the idea is right, the implementation is not.
Candidates: any evidence-handling or scoring machinery in `lib/`, and the
governance-clerk report if it encodes a real approval workflow.

**TURN INTO AN ACADEMY EXAM** — the highest-value disposition, and the one most
likely to apply.
The failure history in the SOV-brain repair documents and the competitive
benchmark are records of things that went wrong in a real system. Each one that
generalises becomes an examination, which is worth more than the code that
failed. Two repair documents on the same component suggest a recurring class.

**TURN INTO A REGRESSION TEST** — a specific defect worth never repeating.

**TURN INTO CURRICULUM** — knowledge a worker should hold.

**TURN INTO DOCTRINE** — a principle that should govern MIDAS generally.
The operating doctrine document is the obvious candidate, and needs reading
against MIDAS's existing principles rather than merged into them: two doctrines
that disagree are worse than one.

**ARCHIVE** — keep, do not carry forward.

**REJECT** — actively wrong, or superseded. Recording *why* matters more than the
rejection; a superseded idea that nobody wrote down gets re-proposed.

---

## Order of work, when it happens

1. **Read the documents before the code.** The inventory suggests the value is
   there, and reading 800 KB of untested TypeScript first would be the expensive
   way to discover that.
2. **Extract failure history first.** Anything that went wrong in a real system
   is examination material, and examination material is what the Academy is
   currently short of — its scenarios all have one author.
3. **Check the doctrine for contradictions with MIDAS's own**, and resolve them
   explicitly rather than by merge.
4. **Only then look at the code**, with a specific question in hand.

## What would make this urgent

Nothing currently does. It becomes urgent if:

- MIDAS needs a UI and the AutoShop app would genuinely shorten that, or
- the Academy runs out of examination material, which the meta-audit says is a
  real limitation — its scenarios have a single author and a single register, and
  AutoShop's failure history is a second source.

The second is the more likely trigger, and it is a reason to do the document
extraction sooner than the code migration.

## Cost estimate

Document extraction and classification: a few hours, mostly reading.
Code review: longer, and should not start without a named question.
Full migration: not justified by anything currently known.
