# Ready-to-approve live workflow experiment — NOT AUTHORIZED

This proposal is for a **new, separate maximum USD 30 exposure envelope**, not a transfer from Mission028. This phase made zero provider/count requests and did not access the provider key. Mission028 separately retains USD 8.71, with USD 1.24 provisional inference estimates within that reservation and no authoritative settlement. Nothing here releases or counts that exposure twice.

## Exact proposed grant

| Field | Proposed value |
|---|---|
| Project | `proj_H01ORqdOPQM6vdGwQYsqFL5r` |
| Route | Direct OpenAI Responses, exact `gpt-6-astra`, High reasoning, default service tier; no fallback |
| Data | Six purpose-built synthetic workflow episodes, their permitted business evidence, procedures and actual synthetic artifacts/receipts only |
| Credential | Reuse `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key` after this separate grant; no environment lookup or credential copies |
| Maximum | USD 30 total new local exposure; original per-arm maximum USD 12.48 inference reservations plus one shared USD 5.04 count-exposure buffer |
| First diagnostic pair | W-001 single and team, up to 8 inference admissions + 8 counts, USD 4.16 inference subcap; the full shared count buffer remains held |
| Remaining comparison | W-002 through W-006, at most 40 inference admissions + 40 counts, USD 20.80 inference subcap; no transfer from first-pair allowance |
| Per workflow | At most 4 calls and 4 counts; no-action/block normally uses 3 and stops without an effect. Correct mock paths used 42 calls total; 48 is a conservative ceiling, not a target |
| Per attempt | Maximum admitted input 8,192 tokens including complete-payload count and conservative margin; output 8,192 including reasoning; USD 0.52 maximum inference reservation |
| Time and concurrency | Count 10 seconds; inference 180 seconds; global provider concurrency 1; no automatic retry; finite grant expiry below |
| Recovery | **Zero extra inference/count recovery admissions.** Durable local results may be recovered without a request; uncertain provider completion retains exposure and stops that workflow |
| Human | Mason: up to 15 minutes per workflow for exact approval plus semantic review/correction, plus 30 minutes shared calibration; 210 minutes planned total, not observed |
| Expiry | September 25, 2026, 22:00 UTC |
| Exclusions | No protected evaluation, customer communications/actions, production approval, deployment, certification, purchases, background helpers, optimizer/judge calls or promotion |

The model-call cap covers all evidence-planning, decision/draft, review/revision and inspection inference. Team proposal generation is deterministic and adds no call. Provider billing can differ from locally reserved exposure; the ledger is admission control, not a guarantee of external charges. The USD 5.04 supporting-count buffer is an explicit conservative allowance, **not sourced per-count pricing**. Count activity and any billing evidence are recorded; unpriced activity remains uncertain. The buffer cannot buy extra inference and is not released automatically.

## Verified official evidence and reservation

Official documentation checked September 11, 2026: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) lists Responses, structured output and High reasoning support; per-million-token rates are USD 10 input, USD 12.50 cache-write input, USD 1 cached input and USD 50 output. Use the conservative cache-write input ceiling, with no caching discount assumed.

```text
ceil((8,192 × 1,250 + 8,192 × 5,000) / 1,000,000) = 52 USD cents
48 × USD 0.52 = USD 24.96
USD 24.96 + USD 5.04 fixed count buffer = USD 30.00
```

This retains the previous USD 30 proposal. The stage allocation has been refined to preserve real prepublication review and post-effect inspection: decision and initial draft share call 2; call 3 reviews/revises; call 4 inspects. No extra verifier or coordination calls were added. Project access in this phase is not verified by a provider call; Mission028 previously observed access, which does not guarantee future availability. The first pair tests current access and end-to-end compatibility. Official docs list an alias but do not establish an immutable model revision; timestamp/returned identity/settings are recorded, and protected final freeze remains blocked without revision proof.

## Freeze, first pair and continuation

The prepared live root is `var/workflow-029-live-proposed`. Its config pins source implementation, cases, procedures, schedule, exact route and all allocations. `authorization.request.json` is unsigned/unapproved. `authorization.json` is absent. The local signing key belongs only to this proposed grant; it is not the provider credential.

Once the founder approves the numerical proposal and confirms reviewer availability, the agent can create the exact approved copy (only `approved` changes from false to true) and sign it using the established local mechanism. No manual raw-JSON editing is needed from Mason.

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-029
$wf = 'packages/foundry/src/workflow/cli.ts'
$live = 'var/workflow-029-live-proposed'
node $wf preflight --root $live
# ONLY after explicit approval: create authorization.approved.json from the prepared request.
node $wf authorize --root $live --file "$live/authorization.approved.json"
node $wf run --root $live --run W-001-single
node $wf approve --root $live --run W-001-single
node $wf resume --root $live --run W-001-single
node $wf run --root $live --run W-001-team
node $wf approve --root $live --run W-001-team
node $wf resume --root $live --run W-001-team
node $wf review --root $live --run W-001-single
node $wf review --root $live --run W-001-team
node $wf report --root $live
```

The first pair must show current route/strict output compatibility, complete useful context, substantive review, exact approval, one verified effect per positive run, metered inspection and durable usage/reservations. Mason calibrates the ordinary review packet and confirms whether the review workload is practical. A task-quality failure is preserved as evidence; an authority, accounting or shared-specification defect stops broader dispatch.

The prepared `continuation.request.json` contains the frozen config hash and the three explicit first-pair judgments: transport/accounting valid, review usable and continue. After review, record the concrete judgment through `continue --file`; this does not increase the grant. The agent can prepare the exact small file from Mason's response.

```powershell
node $wf continue --root $live --file "$live/continuation.approved.json"
node $wf run-all --root $live
# For every waiting positive workflow, use approve, then resume; complete terminal reviews.
node $wf status --root $live
node $wf report --root $live
```

No blind approval batch is provided. Every effect has an exact artifact review. Ordinary commands are resumable; completed stages return persisted outputs. A process lost after a response but before persistence has no guaranteed provider recovery, no idempotent inference promise and no automatic replacement.

## Reconciliation, failures and conclusions

Mason or a delegated billing authority obtains closed provider/project charge evidence. A signature alone does not establish the accuracy or completeness of that evidence. Use the inherited signed `closed_attempt_invoice` contract binding project, authorization hash, account scope, attempt/request/response, actual USD minor units, issuer, closure time and evidence hash. Sign only after inspecting the underlying evidence, then:

```powershell
node packages/foundry/src/experiment/cli.ts sign-invoice --file "$live/invoice.statement.json" --key "$live/auth/owner.key" > "$live/invoice.signed.json"
node $wf reconcile-billing --root $live --file "$live/invoice.signed.json"
node $wf report --root $live
```

Per-attempt known charges reconcile atomically. Unknown charges retain exposure; an excess invoice records liability and halts admissions. The separate unpriced count buffer remains reserved until an explicit later closed-account disposition. No invoice or human timing was invented in this phase.

Stop affected work on authority/isolation/accounting failure, shared ambiguity, unsupported route/schema, uncertain completion, exhausted cap/expiry, unavailable review capacity or insufficient evidence to interpret the next run. No silent rerun, fallback, criterion relaxation or candidate tuning. Repairs require a new version and must identify which historical comparisons remain valid.

Analysis uses six paired episodes with related-family limitations. Similar sufficient performance favors one worker; a team gain requires a supported mechanism and a new confirming test; regression warrants handoff/coordination diagnosis; shared failure means fix the common prerequisite; inconclusive evidence names the missing judgment, usage/billing or observation and the smallest useful next test. Independent qualification, protected custody and immutable-revision gates remain separate.
