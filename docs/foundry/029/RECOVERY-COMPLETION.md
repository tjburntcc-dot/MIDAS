# Mission 029: completed linked W-001 recovery

**One complete actual-model-to-fixture business workflow was delivered.** W-001-single-r1 obtained synthetic cost/policy evidence, selected and drafted a limited playbook, reviewed the actual draft, received exact human action approval, published the unchanged artifact once, and passed authenticated readback and independent mechanical acceptance plus the final metered model inspection.

This completion supersedes the waiting states documented in `RECOVERY-RESULT.md` and `POLICY-EVIDENCE-REVIEW.md`. Those documents and their local checkpoints remain preserved as historical observations.

## Approval and observed outcome

Mason explicitly accepted the preserved `synthetic-invoice-record-v1` statement as sufficient support for the conditional two-business-day estimate, superseding the earlier requirement that it appear in publication policy. No artifact or policy was changed to obtain approval. The artifact review is AI-assisted; human action approval is recorded separately from independent semantic validation and correction timing, which remain unavailable.

- Approved proposal: `47300a786603a8d5bab8897af6555dfd37677b5b14f207e97d66f87e1b076728`.
- Artifact: **Internal billing-status and payment-timing playbook**.
- Original, reviewed, approved and observed artifact hash: `45bf3663c7c88905bcc4ee1bfc2bb1de41da6023d2ceda4b7c45b668bda1c7a2`.
- Fixture receipt: `FX-3ccc333c8e451eb1739f0f71`.
- Observed payload hash: `e266a32c086327f96b6950deab3ae3345a95dc0e60755484d565b237e37971d2`.
- Effect: exactly one reversible `lab.publish` in the isolated synthetic service.
- Fixture charge: 25 simulated USD cents; unresolved delivery obligations: zero.

The controller verified the service identity and authenticated observation before the last model call. A separate local post-completion check invoked the fixture verifier again, confirmed matching approved/readback artifact hashes, one effect and zero obligations. The final Astra inspection returned `pass`, referenced the actual receipt/payload/source evidence, and explicitly withheld claims of repeat-contact improvement or realized customer benefit.

Independent mechanical checks passed for evidence-backed decision, artifact coverage, exact authority, execution/receipt/readback, obligations, economic-accounting representation and supported inspection references. No seeded-defect detection result is claimed: W-001 contains no seeded defect. The review made no changes, so this observation establishes no correction benefit.

## Business decision and limits of the evidence

Qualified synthetic costs were 325 cents for high-touch and 18 cents for the limited playbook. With supplied modeled benefits of 180 cents each, the worker calculated contributions of minus 145 and plus 162 cents, versus zero for no-action, and chose the permitted limited playbook. The artifact preserves pending status, unknown pending-start, unconfirmed settlement, conditional timing, verification/referral rules and prohibited-action boundaries.

The single configuration was sufficient to complete this one synthetic observation. No team ran. There is no estimate of reliability, specialist superiority, optimal team selection, customer usefulness, labor savings or realized business value. Fixture ledger entries are synthetic accounting values, not real refunds, collections or revenue. No customer contact, refund execution, account change or real transaction occurred.

## Calls, latency and accounting

| Stage | Input tokens | Output tokens incl. reasoning | Observed latency | Provisional inference estimate |
| --- | ---: | ---: | ---: | ---: |
| Investigate | 2,166 | 1,418 | 35.139 s | $0.10 |
| Decide/draft | 3,413 | 3,428 | 70.786 s | $0.22 |
| Review/revise | 4,616 | 1,198 | 23.635 s | $0.12 |
| Inspect actual outcome | 4,776 | 1,037 | 25.371 s | $0.12 |
| Recovery total | 14,971 | 7,081 | 154.931 s | $0.56 |

All four recovery inference admissions and four supporting counts succeeded on exact `gpt-6-astra`, High/default, with no retry or fallback. The first three results were reused on resume. No additional call followed completion. Observed latency includes counting/admission overhead and excludes the human approval wait; human review/correction time remains unknown.

The preserved original failed attempt adds one inference/count and $0.11 provisional inference cost. Combined Mission 029 totals are five inference/counts and **$0.67 provisional inference estimate**. Recovery retains $2.08; original retains $0.52; the shared $5.04 unpriced count buffer is counted once. **Total held exposure is $7.64**, leaving **$22.36 uncommitted** inside the $30 ceiling. There are no authoritative settlements; actual billed charges remain unknown. Provisional estimates are not added on top of reservations. Local exposure controls do not guarantee external billing. Mission 028 remains separate with zero transfer.

The four-call recovery allowance is exhausted. Unused aggregate headroom grants no additional workflow, replacement call or team run.

## Reproducible evidence and repository state

Worktree: `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-029`; branch: `codex/business-workflow-team-v0-029`. Execution used unchanged implementation commit `4c6c8a0e8cae3e34331776229377371d33b766e0`, source hash `07030248ec274b3d1aa6e910b83de6b3879a54807f6c1a4515d9c057c8156721`, configuration hash `737fc21dc656ff56c3acb61cb5a247fdb6c5d23ec8378141c258a66a3333fd44`, and linked grant hash `fba6057d3bd5bbeb5fdb5863e0ba3eb627217d133244da17d8c358e1875307da`.

All evidence is under `var/workflow-029-recovery-r1`:

- `exact-founder-approval.json`: exact approval, accepted source and AI-assisted review provenance.
- `completion-observation.json`: actual independent checks, receipt, inspection and accounting.
- `workflow-completed.sqlite`: consistent completed-state snapshot; earlier approval snapshot retained.
- `actual-requests/`: all four exact request bodies reconstructed and checked against admission hashes.
- `reports/value-report.html`: actual initial/final artifact gallery, review, receipt/readback and usage.
- `reports/completed-capability.json`: experimental scope-limited capability record; no production qualification.
- `conditional-policy-evidence-review.json`, `waiting-approval-checkpoint.json`, `frozen-runtime/src`: preserved source distinction, earlier checkpoint and execution source.

Read-only report commands:

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029
node packages/foundry/src/workflow/cli.ts status --root var/workflow-029-recovery-r1 --run W-001-single-r1
node packages/foundry/src/workflow/cli.ts value-report --root var/workflow-029-recovery-r1
```

No source change was necessary for this completion. The existing 166-test and zero-error semantic-check results support the frozen implementation; actual receipt/readback and acceptance checks establish this execution outcome. No tests were represented as additional live observations. Historical grants, attempts, proposals and campaign evidence remain preserved; no push, merge or deployment occurred.

The next useful capability test is a separately authorized W-006 single workflow to examine correction of its disclosed inherited defect and reconciliation after fixture response loss. This run demonstrated ordinary delivery but neither of those mechanisms. No W-006 execution is authorized by unused recovery headroom.
