# Managed venture loop v1

`packages/eval/src/managed-venture.ts` is MIDAS's first local, record-only
managed-venture operating loop. It composes existing systems rather than adding
an agent framework:

- `worker-spec.ts`, `opportunity-researcher.ts`, and `opportunity-qualifier.ts`
  provide job-specific workers and frozen output/evaluation contracts.
- `qualifier-foundry.ts` and `frontier-arena.ts` provide the frozen-specialist,
  sealed-evaluation, and fair-frontier-comparison model. The loop records the
  complete foundry lineage and selects a frontier worker when a specialist has
  no demonstrated advantage.
- `manager.ts` supplies the management doctrine; the loop adds deterministic
  pre-work and post-work control records around it.
- `spend-ledger.ts`, `work-item.ts`, `approval-actors.ts`, and `shadow.ts`
  supply the cost, work, authority, and no-transport boundaries.
- `FileStore` persists immutable managed-venture event records with its existing
  atomic JSON writes. There is no external database, provider call, or service.

## Lifecycle

```text
Venture → evidence → versioned BusinessObjective → CapabilityRequirements
→ smallest TeamPlan → WorkOrders → pre-work review → mock/local work
→ evidence-linked WorkArtifacts → independent post-work review
→ consolidated recommendation → owner record → record-only execution
→ simulated/reported/verified outcome → candidate learning signal → VentureReview
```

Every record carries a workspace, company, and venture scope; a schema version;
actor/version information where work is performed; parent/evidence linkage;
authority; uncertainty; and unknown-or-estimated cost. The record stream is
append-only. A retry with the same deterministic identity is idempotent.
Each managed `WorkOrder` also projects into the existing `work_items.json`
queue, retaining MIDAS's established general/economic action representation
while the managed record supplies venture-specific lineage and reviews.

## Selection and safety

The default Opportunity Researcher uses the existing worker role. The default
Opportunity Adversary/Qualifier uses the existing Opportunity Qualifier role as
the specialization candidate, but the local demonstration intentionally shows
it losing a frozen, equal-information frontier baseline. Therefore the selected
assignment is `frontier_direct_no_demonstrated_specialist_advantage`.

The Venture Manager does not act as a sole producer and judge. It rejects
missing inputs, missing buyer/authority for non-internal work, duplicate work,
low expected value, undefined stopping conditions, and uncertified
capabilities. Conflicting worker recommendations require an evidence
investigation; they are never majority-voted. The manager cannot self-certify.

The demonstration is synthetic and runs entirely through mocks/fixtures. Owner
approval is represented by a clearly labeled `demo_operator` decision; the
approved action becomes a shadow execution record with zero outbound actions.
It never claims real revenue, profit, customer, or production outcome. Learning
signals are candidates only and cannot promote a worker, model, prompt,
knowledge pack, or policy.

## Run

Run the focused local proof without providers or network access:

```powershell
node --import ./tools/register-ts.mjs --test packages/eval/src/managed-venture.test.ts
```

The standard `@midas/eval` test script also includes this suite.
