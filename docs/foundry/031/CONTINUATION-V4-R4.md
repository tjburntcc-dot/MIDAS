# Mission 031 V4 R4 — exact unsigned continuation

Open the read-only owner workspace at http://127.0.0.1:43141/. It shows the actual prepared continuation and preserved historical accounting, not a new live product. Provider execution is disabled in this server.

The correction and offline verification are complete. No provider/count request, credential/private-key read, signing or parent retirement occurred during this preparation.

## Exact binding and authority requested

- Proposal SHA-256: `2d177f6a5bd89e656899eba56823f09066f880f98e526c756be994873e46af69`.
- Implementation SHA-256: `be10dd1038505781070c2dc87415c31aa46d5e8ed7d08603b62e686899817f89`.
- Implementation commit: `6a8868a2bb2208bb001205767d1c9e0a3f40593d`; isolated branch `codex/portfolio-stage-contracts-v4-031` from `25260f295bac22b1c13cb0d98a8c9b32d96bf137`.
- Maximum new exposure **$28.29**, plus **$17.53** historical retained exposure counted once, equals **$45.82** combined. The historical $4 unpriced count/retrieval buffer is not allocated again.
- Direct Responses `gpt-6-astra`, Max reasoning, default tier; project `proj_H01ORqdOPQM6vdGwQYsqFL5r`; 32,768 admitted input tokens. Existing protected credential file is reused without copying.
- At most 15 new inference admissions and 15 supporting counts. No recovery inference, fallback, hosted search, customer action, deployment, purchase, or specialist comparison.
- Expiry September 25, 2026, 22:00 UTC; concurrency one. Background `store:true`, disclosed provider retention of at least 30 days, bounded same-ID retrieval, and uncertain-outcome retention remain explicit.
- Approval must authorize retirement of R3 execution authority through the existing signing mechanism while preserving its evidence and accounting. R3 remains unretired until that approval is executed.

| Stage | Admissions | Total output ceiling per call | Stage reservation |
|---|---:|---:|---:|
| Fresh build/stop decision | 1 | 24,576 | $1.64 |
| Unseeded product build and checks | 5 | 32,768 | $10.25 |
| Authoritative product review/correction | 4 | 32,768 | $8.20 |
| Operating deliverable | 4 | 24,576 | $6.56 |
| Outcome recommendation | 1 | 24,576 | $1.64 |

Output ceilings include reasoning and final answer. The narrow gate removes portfolio planning, task creation and repeated research; all five stages have matching schemas, procedures, validators and consumers. Current contexts exclude historical actionable task IDs and obsolete separate publication guidance. The unchanged authenticated 17,908-byte research remains available throughout. Neither historical partial response supplies a decision.

See [contract repair and pricing rationale](CONTRACT-REPAIR-V4-R4.md), [exact proposal](continuation-r4/portfolio.authorization.request.json), [serialized initial request](continuation-r4/initial-responses-bytes.json), [tasks](continuation-r4/task-manifest.json), and [preservation receipt](continuation-r4/preservation-receipt.json).

## Runnable path

Working directory for every command:
`C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-031-contracts-r4`.

Read-only owner workspace (already running; start only if stopped):

```powershell
node packages/foundry/src/portfolio/cli.ts serve --root var/portfolio-031-continuation-r4 --port 43141
```

Only after explicit approval of the exact hash above, use the established protected signing command. Replace the approval-reference placeholder with the actual owner approval reference; do not fabricate approval:

```powershell
node packages/foundry/src/portfolio/cli.ts sign-proposal --root var/portfolio-031-continuation-r4 --proposal var/portfolio-031-continuation-r4/proposal/portfolio-031-value-build-v4-r4/portfolio.authorization.request.json --approve-proposal-hash 2d177f6a5bd89e656899eba56823f09066f880f98e526c756be994873e46af69 --owner-public-key C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/owner.pub --owner-private-key C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/owner.key --principal Mason --approval-reference "ACTUAL_OWNER_APPROVAL_OF_THIS_EXACT_R4_PACKET"
node packages/foundry/src/portfolio/cli.ts run --root var/portfolio-031-continuation-r4 --live
```

The live run recovers persisted results and admitted background responses before draining eligible stages. It must stop on the frozen limits, genuine rejection or unresolved governed failure. Do not use an incomplete-response replacement command: R4 has no recovery-inference allocation. Same-ID retrieval is bounded to 240 GETs per response, 3,600 new aggregate, a 15-minute completion window and 24-hour resume window; a lost acknowledgement without response identity remains unknown, not permission to resend.

After execution, the signed live report includes the new grant ledger:

```powershell
node packages/foundry/src/portfolio/cli.ts report --root var/portfolio-031-continuation-r4 --live
```

## Verification and limits

78 adjacent tests passed, including 16 focused R4 tests. Strict TypeScript 6.0.3 semantic checking covered 44 source files with zero errors. Exact initial request and proposal reconstruction passed after startup. Actual unsigned workspace browser checks covered desktop, 390px layout, refresh, accounting disclosure and queued-state accuracy without provider requests. [Browser evidence](continuation-r4/owner-workspace-verification.json).

Preserved R3 incomplete outputs are regression failures, never accepted decisions. Offline full-chain tests retain the research, actual source and downstream observations; validate stop behavior, references, stage limits and finalization; and distinguish corrupted/missing authority from available historical accounting. Near-bound context coverage reached 71,719 of 72,000 bytes. This is not proof every future output fits. Larger reasoning capacity cannot guarantee completion, and the reduced call budget may still stop on a consequential defect requiring more repair.

Historical provisional token-cost subtotal is $5.74; authoritative billing remains unavailable. R2 is genuinely unknown; both R3 outputs are known terminal incomplete responses. All associated exposure is preserved. Offline mechanics establish neither live completion nor commercial usefulness. A permitted build still starts blank and must author, check, review and deliver its own source; a justified stop cancels dependent work.
