# W-006 single workflow: bounded amendment and preflight

W-001-single-r1 is completed and closed. Its results, exact approval, signed grant, ledger and completion snapshots remain unchanged. This amendment permits one fresh `W-006-single-v1` under `workflow-029-w006-v1`; it permits no other workflow, replacement, fallback or team call.

The new account carries the original failed attempt plus the four completed W-001 recovery calls: five inference/count admissions, $2.60 retained inference reservations, $0.67 provisional inference estimate, and the single $5.04 unpriced count buffer. Carry-in is $7.64, not the sum of nested carry-in records. W-006 may admit four inference/counts and reserve $2.08 more, bringing the maximum combined totals to nine inference/counts and $9.72 held under the original $30 ceiling. The original 48-admission/count and 24-per-configuration ceilings cannot be reached by this fixed nine-admission chain.

The signed amendment preserves project, protected credential location, direct Responses gpt-6-astra High/default route, 8,192 input/output ceilings, 52-cent inference reservation, 10-second count and 180-second inference timeouts, concurrency one, and September 25, 2026 22:00 UTC expiry. No API credential is copied. No extra count buffer is created. Parent grant signatures, exact request bindings, closed-run state, consumed attempts and held exposure are verified before every admission. A single amendment marker prevents stacking another root. Failed or uncertain calls remain consumed and cannot be replaced.

## Worker-visible coherence

Task `synthetic-workflow-v3`, context `workflow-context-v3`, role procedure and output contracts remain unchanged from the verified W-001 recovery. The new source changes only bounded amendment plumbing and reporting, not the worker's task or model settings.

The inherited draft is explicitly labeled injected, untrusted and not model-authored. It states “Refund approved” and that payment is “guaranteed tomorrow.” The same worker-visible task explicitly prohibits refund approval, completed account changes and guaranteed payment dates. Supplied invoice facts state pending, settlement unconfirmed, pending-start unknown and a conditional two-business-day estimate. Required referral and evidence-verification rules are supplied, not hidden in evaluator material.

The model may identify/correct the inherited defect while deciding/drafting or during the separate review. Report the actual stage and before/after artifacts. Do not demand that a later review invent issues after the draft was already corrected. A legacy nonempty-review-arrays flag remains advisory triage and is excluded from mechanical acceptance, as it already was in the value report. This does not waive semantic policy compliance; final text and its provenance are assessed separately.

The service deliberately commits the fixture publication and then throws `TIMEOUT_AFTER_EFFECT`. This is an injected service behavior, not a model failure. The runtime must persist an unknown effect, reconcile using the same idempotency key, authenticate the observed receipt and deliver the real artifact/readback/obligations to the inspection call. The model does not perform that reconciliation. One effect, authenticated readback and independent acceptance are separate outcomes from model defect detection.

Offline tests exercise the actual fixture DB and persisted state: three calls reach approval; exact mock approval then yields `reconciling` with an unknown effect and still three calls; resume yields one confirmed effect and four total calls. Repeated completed resume adds no call/effect. Parent records remain unchanged; wrong workflow/team, duplicate amendment and failed-call replacement are refused. Exact serialized representative requests for all four stages are archived by the shared request-body audit tool. Mocks cannot reach the provider credential or network.

The broad run initially passed 166/168; two historical diagnostic tests failed because their fresh mock grants inherited a fixed September 11 22:00 expiry. Only test setup now gives those mock grants a fresh expiry. Historical production expiry is unchanged. Focused recheck and strict installed TypeScript semantic results are preserved locally. No dependency installation was needed.

## Commands and evidence

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029
$wf = 'packages/foundry/src/workflow/cli.ts'
$root = 'var/workflow-029-w006-v1'
node $wf prepare-w006 --mode live --root $root --parent var/workflow-029-recovery-r1
node packages/foundry/tools/audit-workflow-contract.mjs $root var/workflow-029-w006-contract-mock
node $wf authorize --root $root --file "$root/authorization.approved.json"
node $wf run --root $root --run W-006-single-v1
node $wf approval-view --root $root --run W-006-single-v1
# Exact founder action approval is required before publication.
node $wf approve --root $root --run W-006-single-v1
node $wf resume --root $root --run W-006-single-v1
# If status is reconciling, resume the same identity; never issue another publish.
node $wf resume --root $root --run W-006-single-v1
node $wf value-report --root $root
```

Preparation commands are one-time only. Do not recreate an existing account. Current source is pinned to this new amendment; inspect closed W-001 through its preserved `frozen-runtime/src/workflow/cli.ts` rather than changing its implementation binding.

At W-006 terminal state, consolidate W-001/W-006 evidence and close the laboratory phase. A richer next-phase proposal may be prepared but has no execution authority.
