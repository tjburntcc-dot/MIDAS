# Mission 029 linked W-001 recovery: approval checkpoint

**A complete business workflow has not yet been delivered. Three actual Astra calls successfully reached exact human approval wait.** Evidence retrieval, economic decision, drafting and review are complete. Publication, authenticated receipt/readback and the final inspection remain pending. No provider request is running and no fixture effect has occurred.

Fresh workflow `W-001-single-r1` is linked to the preserved failed `W-001-single-investigate`. Implementation commit: `4c6c8a0e8cae3e34331776229377371d33b766e0`; verified base: `451bb68045a8d14558b4839d39875bd4b09a2d83`; branch: `codex/business-workflow-team-v0-029`. Source hash: `07030248ec274b3d1aa6e910b83de6b3879a54807f6c1a4515d9c057c8156721`. New grant hash: `fba6057d3bd5bbeb5fdb5863e0ba3eb627217d133244da17d8c358e1875307da`. The original signed grant is unchanged.

## Evidence and artifact

The worker obtained synthetic cost-ledger evidence of 325 and 18 USD cents plus current policy-registry evidence requiring exact approval. It selected the limited playbook: 180 minus 18 gives 162 cents modeled contribution; high-touch yields minus 145 and no-action zero. These are modeled amounts, not measured savings or revenue.

The artifact, **Internal billing-status and payment-timing playbook**, contains five operational steps and two answers. It covers pending status, unknown pending-start, unconfirmed settlement, conditional two-business-day timing, permitted verification, referral triggers and authority limits. The review call returned `ready`, empty issues and empty changes. Initial and final normalized artifact hash: `45bf3663c7c88905bcc4ee1bfc2bb1de41da6023d2ceda4b7c45b668bda1c7a2`. No correction benefit was demonstrated. A separate AI-assisted read-only assessment found no material defect; it is advisory developer-access analysis, not independent human validation.

## Exact pending action

One reversible `lab.publish` effect in the isolated fixture, capped at **25 simulated USD cents**. No customer contact, refund, account modification or real business transaction. Artifact policy: `support-policy-v2`; controller authority policy: `workflow-policy-v1`.

Proposal SHA-256: `47300a786603a8d5bab8897af6555dfd37677b5b14f207e97d66f87e1b076728`.

Mason has been presented the entire artifact and action in `reports/exact-publication-approval.html`. Approval is pending, not inferred. After exact approval, the same workflow can publish and use its one remaining authorized inference/count for inspection. Persisted calls must not be repeated. Human semantic acceptance, expertise, approval duration and correction time remain unknown.

## Actual usage and exposure

| Stage | Input tokens | Output tokens including reasoning | Observed latency | Provisional estimate |
| --- | ---: | ---: | ---: | ---: |
| Investigate | 2,166 | 1,418 | 35.139 seconds | $0.10 |
| Decide/draft | 3,413 | 3,428 | 70.786 seconds | $0.22 |
| Review/revise | 4,616 | 1,198 | 23.635 seconds | $0.12 |

Every count and inference succeeded on exact `gpt-6-astra`; High/default settings were transmitted. Recovery totals: 10,195 input tokens, 6,044 output tokens, 129.560 seconds including count/admission overhead, three inference admissions and three supporting counts. No replacement or fallback occurred. A local signing-directory permission failure before launch consumed zero admissions or requests; the restricted directory was corrected to include the founder execution account. The provider credential was untouched.

Recovery inference estimate: $0.44 provisional, with $1.56 retained reservations. Parent: one failed inference/count, $0.11 provisional, $0.52 retained. Combined: four inference/counts, **$0.55 provisional**, **$2.08 retained inference exposure** plus the single **$5.04 unpriced count buffer** = **$7.12 held**. **$22.88 remains uncommitted** under $30. No authoritative settlement exists; actual billed charges are unknown. Provisional costs are contained within reservations, not added again. One remaining recovery admission can reserve at most $0.52. Unused headroom does not authorize other work or replacement calls. Mission 028 remains separate, with no transfer.

## Validation, artifacts and preservation

The four-stage structural/semantic/external-fact audit is in `RECOVERY-CONTRACT-AUDIT.md`. All 166 relevant tests passed. Installed TypeScript 6.0.3 strict semantic checking reports zero errors across 30 source files; dependency declaration checking was skipped. Varied handwritten outputs and independent business validators were exercised. Exact representative requests were archived offline; all three actual request bodies also reconstruct to their persisted admission hashes. Offline checks are not live evidence.

Evidence root: `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-029/var/workflow-029-recovery-r1`.

- `authorization.json`, `authorization-provenance.json`: new linked amendment and user authorization provenance.
- `contract-preflight.json`, `contract-requests/`, `actual-requests/`: exact schemas, bodies and hashes.
- `waiting-approval-checkpoint.json`, `workflow-at-approval.sqlite`, `workflow.sqlite`: durable execution and snapshot.
- `reports/exact-publication-approval.html`, `reports/value-report.html`: readable exact action and original/final artifact gallery.
- `reports/assisted-artifact-review.json`, `reports/recovery-capability.json`: limited, non-production observations.
- `preservation.json`, `frozen-runtime/src`: historical preservation and reproducible source.

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029
$wf = 'packages/foundry/src/workflow/cli.ts'
$root = 'var/workflow-029-recovery-r1'
node $wf status --root $root --run W-001-single-r1
node $wf approval-view --root $root --run W-001-single-r1
# Mason may also approve the exact displayed action interactively:
node $wf approve --root $root --run W-001-single-r1
# Only after exact approval:
node $wf resume --root $root --run W-001-single-r1
node $wf value-report --root $root
```

Canonical remains clean at `8d2c6b3db3fe5d1c63493e2774844eda0af013af`; Foundry 027 at `13edfb9796e7d5ed28b86935244ec9917840c0e4`; Mission 028 at `f6dce49150519ca5551d66ee0eb8a85624cf3c6b`. Six recorded historical proposal/completion files remain byte-identical. The original failed attempt and signed grant remain bound by their original hashes. No campaign artifacts, sealed identities, provider credentials or earlier mission state were changed. No push, merge or deployment.

**Next valid action: Mason approves or declines the exact fixture publication.** No further spending approval is needed for the remaining covered inspection, provided scope, deadline and integrity checks still pass. This observation supports no team, specialist-superiority, reliability, customer-validation or production-qualification claim.
