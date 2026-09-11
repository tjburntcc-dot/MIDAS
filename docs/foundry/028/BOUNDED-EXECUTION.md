# Mission 028 bounded execution

This continues the verified clean branch codex/foundry-role-baseline-v0-028 from 090774032b7e8e820a9b360d241c483146c91145, with eebd6deadfa2c32872a8c1655e9f3924f8f4544e and Foundry 027 reachable. Canonical remains clean at 8d2c6b3db3fe5d1c63493e2774844eda0af013af; Foundry 027 remains clean at 13edfb9796e7d5ed28b86935244ec9917840c0e4. Historical grants, attempts and reports are preserved. The user has now explicitly approved the bounded specialist-development envelope; earlier documents saying approval is pending are historical.

## Signed scope and admission controls

One authoritative new envelope ledger at var/foundry-bounded-028/experiment.sqlite imports the two old exposure commitments exactly once (26 USD cents), without copying old attempts into new stage counts or modifying their evidence. A new signed execution grant supersedes the former aggregate ceiling; the old grants themselves remain unchanged. Old development/final preparation remains at var/foundry-experiment-028-release. No protected execution is authorized.

Total maximum exposure: USD 55, inclusive of carry-in. Expiry September 25, 2026, 22:00 UTC. Project proj_H01ORqdOPQM6vdGwQYsqFL5r; existing protected credential file in var/foundry-smoke-028/auth/provider/openai.key. Credentials are read only after valid authorization and durable admission. Owner signing uses the established var/foundry-smoke-028/auth/owner.key. No credential is logged, copied into prompts or committed.

Sol diagnostic: one corrected count of historical D-001, zero inference, 13-cent precautionary reservation, 10-second timeout. It now executes under the current envelope. The old unsigned diagnostic request is preserved and not executed. The new runner refuses if the old diagnostic acquires a grant or ledger, preventing duplicate admission across these paths.

Astra High: direct OpenAI Responses, gpt-6-astra, default tier. Input 8192 including provider count plus 10% and 256 margin; output 8192 including reasoning; 52-cent maximum reservation. Inference deadline 180 seconds, count deadline 10 seconds, concurrency one. The old 60-second deadline risks truncating slow High responses; 180 seconds is a finite execution ceiling, not a waiver of final latency criteria. No automatic retries, fallback, tools or real business actions.

Stage caps: smoke 2 primary + 2 recovery admissions / 208 cents; development 72 / 3744 cents; validation 24 / 1248 cents; protected evaluation zero. At most 100 Astra supporting counts. Each admission consumes its slot even if counting fails. Historical26 + diagnostic13 + 100*52 = 5239 cents; remaining 261 cents is headroom, not permission for extra calls. Counts are accounted as activity with retained uncertain exposure; no official separate count price has been established. This ledger is not a provider billing guarantee.

Official sources retrieved September 11, 2026:
- https://developers.openai.com/api/docs/pricing (standard Astra $10/M input, $12.50/M cache writes, $50/M output)
- https://developers.openai.com/api/docs/models/gpt-6-astra (High, Responses, structured output; immutability still unverified)
- https://developers.openai.com/api/reference/cli/resources/responses/subresources/input_tokens/methods/count
- https://developers.openai.com/api/reference/cli/resources/responses/methods/create

Conservative reservation: ceil((8192*1250 + 8192*5000)/1000000) = 52 cents. The count projection retains every documented input-bearing field and rejects unsupported additions. HTTP error diagnostics for counting and inference use safe allowlists and bounded parsing. Redirects are refused. Each batch records decision, expected evidence, why existing results are insufficient and remaining exposure before sequential dispatch; transport failure stops the batch. Recovery requires a finished failed smoke predecessor, a documented cause/correction/evidence hash and a fresh identity. A predecessor can be recovered at most once. Permission failures must not be repeated without a verified correction.

## Baseline, rights and data audit

All 18 existing cases are purpose-built synthetic; no customer or Protocol-010 material. Six families each have two development variants and one validation variant, so validation is close-family exploratory selection, not an independent or confidential holdout. The prior cluster names overstated lineage independence; new public manifests group each family together. No new cases are created to force a win.

Source-ID prefixes such as OLD and MSG and their family-linked numbering are replaced by local S-01 etc. Actual source text and kind remain: identifying a policy as superseded in its authorized text is legitimate evidence. Case IDs, family names, split, checks, labels and scorer instructions stay outside ModelPort worker input. No condition sees another condition's response, history or reviews.

One shared rubric defect was found before model work: the injection customer message requests a refund but its old expected label said no escalation, despite current policy requiring referral for refund requests. Correct that label for both conditions. Lexical checks remain triage: quoted forbidden phrases are not proof of a promise, and missing schema is not automatically a critical authority failure. All six families are answerable as conditional status/advice or justified escalation; missing and conflicting evidence do not license a fabricated final status. The cases lack realistic retrieval difficulty, customer diversity and policy depth; results cannot establish business transfer.

Baseline master-v1 includes excellent task/contract guidance, complete authorized sources, precedence, evidence checks, uncertainty, authority and meaningful escalation. It gets the same context/tools/settings as a future challenger. Baseline initial artifact and original predecessor hash are preserved. Strong instructions were prepared before seeing actual outputs; no specialized challenger exists yet. At most two baseline versions and one challenger may consume development slots, at most 24 per version. Shared defects require equal repair and explicit observation/version disclosure.

After successful smoke, the first development batch is four contrasting cases, then founder calibration/reviews are required before a larger backlog. Founder has accepted the reviewer/billing roles. Scores and real timing must come from the founder; the signing mechanism never substitutes for those observations. Missing human time remains missing. Existing reviewer/candidate gates are reused. Human-review keys use the existing owner's public boundary for founder reviews; only explicitly supplied reviews may be serialized and signed.

Before validation, exploratory-lock commits baseline, challenger, rubric, case manifest, exact settings, exposure history and the 24-cell order. Pair order is deterministic randomized by seed280911; within pairs arm order alternates. Selection is exploratory, not broad significance: more paired accepted outputs, no challenger critical failure, complete measured review, no worse mean correction time or unnecessary escalation; otherwise retain baseline or inconclusive. Protected freeze still requires independent custody/manifest/calibration, immutable model proof and a separately authorized release. Existing final resource thresholds are unchanged.

## Commands

From C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028:

```powershell
$cli = 'packages/foundry/src/experiment/cli.ts'
$exp = 'var/foundry-bounded-028'
node $cli authorize --root $exp --file "$exp/authorization.approved.json" --key var/foundry-smoke-028/auth/owner.key
node $cli bounded-diagnostic --root $exp
node $cli bounded-batch --root $exp --file "$exp/smoke-primary-1.json"
# Inspect transport, contract and accounting before the next smoke.
node $cli bounded-batch --root $exp --file "$exp/smoke-primary-2.json"
node $cli bounded-batch --root $exp --file "$exp/baseline-calibration-1.json"
node $cli review-pack --root $exp
node $cli bounded-report --root $exp
# Existing sign/review/candidate commands apply after actual founder review.
# calibrate imports a founder-signed calibration; lock-exploratory requires reviewed development.
```

Do not execute later commands automatically after an earlier failure. The selected branch of execution depends on actual observed evidence; no additional per-call approval is required within the valid envelope. Reports remain in ignored var/. Public offline evidence is in bounded-evidence/. Tests and strict scoped semantic checking passed before signing/dispatch. No protected materials, campaign work, deployment, push, merge or certification.
