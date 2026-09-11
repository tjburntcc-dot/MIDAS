# W-001-single-r1 conditional publication review

Publication remains blocked at `waiting_approval`. The September 11 conditional approval was not applied. The condition specifically requires policy support for the two-business-day estimate. Local inspection establishes explicit **task-fact support**, but no numeric duration in the **policy records**. This distinction is reported without editing the artifact or relabeling its source.

The exact archived requests for investigate, decide and operate all include:

`context.snapshot.taskBrief.invoiceFacts.paymentEstimate`:

> Two business days is a conditional estimate, not a guarantee.

The source field is `synthetic-invoice-record-v1`, inside the frozen `synthetic-workflow-v3` task brief. This is controller-supplied worker input, not a model-generated estimate or an evaluator-only answer. The artifact rules additionally require conditional business-day estimates rather than guarantees.

The policy records instead contain:

- Superseded `support-policy-v1`: “Do not publish without a human policy review.”
- Active `support-policy-v2`: “Publish only a reversible internal support playbook after exact fixture approval.”
- Retrieved `evidence-policy-v2`, source `synthetic-policy-registry-v1`, variable `publication_policy`: “exact fixture approval required”.

None of those policy records specifies a payment duration. Therefore the estimate is grounded in supplied invoice facts, but it cannot be described as an explicit payment-duration policy. No contradictory duration was found. This is a source-category mismatch with the approval condition, not evidence that the worker invented the number.

Proposal hash verified unchanged:
`47300a786603a8d5bab8897af6555dfd37677b5b14f207e97d66f87e1b076728`.

All three exact archived request hashes match the admitted ledger rows, and their decoded contexts match the persisted worker contexts:

| Stage | Request SHA-256 |
| --- | --- |
| Investigate | `0c83cc9d11a9e21216d25f3fe35225e2875a91aaade1102db62d734f4c75fb04` |
| Decide/draft | `f12a4b50888cac6dc655c50c5f0430f82fdb1ddc187a208158c19c3b1d31783d` |
| Review/revise | `a0393d301153d80af8ab199c8ab022e12942c61dbb4b38c2ef80d95a7e1f86da` |

Local record: `var/workflow-029-recovery-r1/conditional-policy-evidence-review.json`, with a corresponding `workflow.conditional_approval_review` event. Provenance is AI-assisted artifact review and deterministic source/hash inspection. No independent human semantic validation, expertise, correction time or review duration is asserted.

No provider request, approval grant or fixture effect was created during this check. The original model observations, signed spending grant and artifact remain unchanged. Recovery still has three inference/count admissions consumed and one remaining. Combined Mission 029 provisional inference estimate remains $0.55; retained inference exposure is $2.08, plus the single $5.04 count buffer: $7.12 held and $22.88 uncommitted. No authoritative billing settlement exists.

The next decision is whether Mason accepts the already supplied invoice-fact statement as sufficient evidence for publication of this unchanged proposal. Until that basis is explicitly accepted, do not apply the conditional approval, publish, or dispatch the remaining inspection call. Do not change the artifact and reuse this approval.
