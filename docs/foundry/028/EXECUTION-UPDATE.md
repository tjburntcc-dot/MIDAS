# Mission 028 outcome-oriented execution update

Status: no new provider authorization and no provider calls in this update. The repaired one-count diagnostic still awaits explicit approval. Its existing unsigned request, exact code pin and expiry remain unchanged. This document records the user's outcome-oriented execution instruction; it is not an executable grant or a claim of development results.

## Next authorized outcome

After approval of the pending count-only grant, execute it once. If successful, finish and verify all remaining offline preparation, then present ONE consolidated approval covering route verification, successful inference smoke/accounting inspection, baseline development, observed-failure diagnosis, a procedure-only challenger, validation/selection and comparison packaging. If unsuccessful, use the sanitized evidence for supported offline repair and present one consolidated recovery proposal. Do not ask for successive individual-call approvals within a subsequently approved envelope.

## Consolidated envelope recommendation to finalize after diagnosis

Recommend GPT-6 Astra High for BOTH arms, subject to project access. The uncertainty motivating the stronger configuration is conflict/injection/escalation quality under a credible frontier baseline, not saving token cost. Do not switch models on access failure. Current official sources retrieved September 11, 2026:

- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/pricing

Standard short-context prices are $10/M input, $12.50/M cache writes and $50/M output. Use the conservative cache-write rate for all admitted input. Proposed equal limits: 8,192 admitted input tokens and 8,192 output tokens including reasoning; 120-second inference timeout, 10-second count timeout. The extra output allowance avoids making a reasoning baseline artificially weak through truncation. It is a proposal, not authorization to raise current limits.

Worst-case per inference reservation in USD cents:
ceil((8192 * 1250 + 8192 * 5000) / 1000000) = 52 cents.

Proposed total mission exposure ceiling: USD 55, including historical retained exposure, not USD 55 plus previous accounts. Maximum 100 inference admissions and 100 supporting counts in the new envelope:

| Stage | Attempts | Reservation allocation |
|---|---:|---:|
| Selected-route verification and smoke | 2 primary + 2 explicitly bounded recovery | $2.08 |
| Development | 72 | $37.44 |
| Validation | 24 | $12.48 |
| New inference reservation total | 100 | $52.00 |
| Prior smoke and pending diagnostic, assuming admitted | n/a | $0.39 |
| Residual aggregate headroom | no extra calls | $2.61 |

Development: 12 cases x 2 repeats for initial baseline; one evidence-driven baseline revision may receive another 24 attempts; a single challenger receives 24. If no baseline revision is justified, omit those calls. Validation: 6 open cases x 2 repeats x 2 arms. Repeats are not independent cases. No fabrication of a challenger if the baseline has no reviewed failure. No silent second challenger or post-validation tuning. Count failures consume their admitted attempt allowance even when inference is not dispatched.

Recovery proposal: at most two new smoke attempt identities, each bound to exact bytes and its failed predecessor, after supported diagnosis and a named correction; no automatic HTTP retry and no same-ID redispatch. No development/validation replacement attempts. Retain originals in accounting and report successful smoke separately from all failed admissions. This policy requires focused implementation and tests before the consolidated grant is offered; the current runner does not yet implement it.

Suggested expiry: September 25, 2026, 22:00 UTC. Recheck pricing before signing; a price increase, inaccessible route, changed data/model scope, insufficient headroom, deadline, integrity/security issue or required reviewer unavailability stops dependent execution. Unknown/late/count billing retains exposure; a local ledger cannot guarantee the external bill. Actual count-endpoint charges remain unverified. No paid metadata probes outside explicit request allowances; two primary smoke requests test selected-route access directly. Final protected evaluation has ZERO allowance in this envelope and requires its own later grant.

## Concrete prerequisites and existing artifacts

| Requirement | Current evidence and action | Stage blocked |
|---|---|---|
| Project/key | Project proj_H01ORqdOPQM6vdGwQYsqFL5r and existing protected credential path are known. No need to restage or disclose the key. Actual endpoint/model access remains unverified. | Live selected-route smoke |
| Pricing | Official standard prices verified above. Before signing, record price retrieval date and calculation in the exact grant. | Numerical grant |
| Billing | Original $0.26 is reserved, not spending. Diagnostic adds $0.13 only upon admission. Owner/delegate needs closed project usage/cost evidence including late/count charges. Signature alone is insufficient. Existing templates/invoice.json defines import evidence. No admin credential belongs in the model runner. | Authoritative cost claims, not initial smoke |
| Development reviewer | Owner can perform open reviews. Need identity, availability and public signing key; corrected original-output review and measured correction times are required. Use existing review-pack and templates/review.json. Approximately 3.2-6.4 review hours for up to 96 outputs at 2-4 minutes is a planning estimate, not measured effort. Batch packets by baseline, challenger and validation. | Failure-grounded candidate and validation decision |
| Immutable revision | Official Astra snapshot section lists gpt-6-astra only; no separate immutable ID/guarantee established. Request ID/model echo/config hash cannot prove immutability. Need provider evidence; otherwise exact freeze remains blocked unless the user explicitly changes this requirement. | Final freeze, not open development |
| Final custody | No protected material created here. Need separate independently administered environment and custodian, with no optimizer access, before final material creation. Existing templates/boundary.json and custodian-manifest command apply. Signed public commitments only return here. | Protected material and current freeze contract |
| Human baseline effort | Record observed timing going forward; historical unmeasured effort stays unknown. Never fill the measured field with an estimate merely to pass freeze. | Honest effort report and current freeze contract |

Existing exact operational commands remain in README.md and TOKEN-COUNT-REPAIR.md. The pending diagnostic command is:

```powershell
Set-Location C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028
node packages/foundry/tools/count-diagnostic.mjs run var/foundry-count-diagnostic-028
```

It must not be run before a new signed approval. After diagnosis, prepare an exact revised grant and commands using the existing CLI: authorize, smoke, report, develop, review-pack, review, candidate, validate and freeze. Do not advertise the old Sol configuration as an executable Astra envelope.

Focused offline work identified for the successful-diagnostic branch: remove the hard-coded 13-cent request allowance in favor of the signed route cap; implement bounded smoke recovery with new identities and retained predecessor evidence; enforce mission aggregate carry-in from original ledgers rather than resetting exposure with another database; update the unapproved execution configuration/code pin without rewriting historical grants; verify stage caps and stop conditions; prepare batch review artifacts and an evidence-based selection report. Existing final resource thresholds (including $0.20 per accepted output and 90-second p95 latency) must be considered explicitly before freeze; do not silently relax them to favor the proposed stronger route. Maximum reservation is not expected cost.

A locally sealed comparison package can preserve conditions and selection evidence while custody/revision prerequisites are pending. It must be labelled pending, not the contract's completed freeze. The current freeze additionally requires custodian manifest/calibration, paired reviews, baseline effort and immutable-model evidence. No new broad framework or separate mission is needed.

## Batched owner input

The only immediate execution decision is approval of the already prepared ONE-count/ZERO-inference diagnostic, expiring September 11 at 22:00 UTC. Separately, to prevent later delays, confirm who will supply measured open-case reviews and who has billing evidence access (the owner may do both), with availability. If already available, identify the independent custodian/environment and any provider immutable-revision evidence. Missing custody does not block smoke/development. Do not send secrets or protected cases into this chat.
