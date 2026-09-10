# Mission 028: practical setup and smoke-only approval

Continuation from clean HEAD 53b9ab6a634d4203c1ac64c716489f7524c8078b in the same
codex/foundry-role-baseline-v0-028 worktree and chat. No new mission, rebuilt runtime,
provider call, cloud project creation, deployment or dependency installation.

The existing experiment at var/foundry-experiment-028-release is preserved. Its spec,
baseline, cases and authorization-request bytes are unchanged. A narrowly scoped smoke
account at var/foundry-smoke-028 uses the same implemented CLI and authorization checks.
Its limits are USD 1 total, smoke 2 attempts, development/validation/evaluation 0 attempts
and 0 dollars. This separate preparatory account is necessary because an account pins its
signed grant; it does not authorize extending or replacing that grant later. Future mission
cost reporting must include this smoke ledger and not silently buy another smoke allowance.
All development and protected stages remain prepared and unapproved in the original root.

## Model choice: transport proof versus a credible comparison

Sol Medium was proposed because Sol is a documented flagship for professional work,
medium is its default reasoning setting, and the job is a bounded text/policy task with
structured output. That was a reasonable initial route, not empirical evidence that it
is the strongest general-purpose comparator. Small token-price savings are not sufficient
reason to weaken the baseline used for a specialization claim.

The two-attempt smoke checks credentials, project routing, complete-request counting,
Responses transport, schema handling and provisional accounting. It has no power to rank
models or show specialization. Keep the already implemented Sol Medium transport for that
check. Do not freeze the later comparison's model because it passed smoke.

For the actual quality-first comparison, recommend GPT-6 Astra High as the stronger
candidate baseline configuration if the authorized project supports it. Use the identical
Astra configuration in BOTH baseline and specialized conditions for claim A. The named
uncertainty addressed by extra reasoning is failure on conflicting policy/evidence,
instruction attacks and escalation decisions; the incremental benefit must be checked on
open development cases, including truncation and correction effort. This is a recommendation,
not a paid escalation or a measured improvement claim. No Max/Ultra is proposed.

Official documentation describes Astra as more capable than Sol. This makes it a more
credible frontier comparator, but does not prove a material task-specific quality gain.
Actual project access is still unknown. Sol High is another possible stronger setting on
the existing route, but no local evidence demonstrates that changing effort alone closes
the model capability difference. Avoid selecting Sol just to create more headroom to win.

At the current 8192-input/4096-output ceilings, conservative Sol reservation is 13 cents
and Astra is 31 cents per attempt, a difference of 18 cents. Those small absolute amounts
are not a persuasive reason to compromise the experiment. Astra High may need more output
headroom for reasoning; determine and equalize that before freeze, rather than silently
truncate the stronger baseline. The current request contract caps calls at 13 cents and
would refuse Astra at those limits. A later approved Astra configuration needs a focused
request-cap/route adjustment and revised numerical budget, not a runtime rebuild. This
setup does not modify the preserved Sol development/final spec or authorize that change.

Checked official sources on 2026-09-10:

- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/token-counting

## Minimum people and technical setup

| Responsibility | Minimum practical arrangement | Exact work |
|---|---|---|
| API project/key owner | You can do this. Use an existing authorized, preferably dedicated development project. No organization-admin credential belongs in the model runner. | In your API dashboard verify the project ID, billing/funding, permitted model and key permissions for Responses and input_tokens. Supply only the project ID here. Confirm the already configured environment key belongs to that project, or install the correct project key locally. |
| Smoke inspection | You can inspect both outputs with me; no independent final reviewer is required. | Check returned model, schema, usage/error status and ledger exposure. Do not infer role quality from two transport examples. |
| Development reviewer | You can do this. Independence from development is not claimed for open material. | Read facts/policy and ORIGINAL output; score all rubric dimensions and critical errors; time actual correction work; record corrected artifact hash when applicable. Configure your name and reviewer public key; keep the signing key under your control. A model cannot supply measured human correction time. |
| Final reviewer and custodian | Minimum practical arrangement is one other person who did not optimize the role, using an independently administered POSIX machine/account inaccessible to this chat, optimizer and developer. They may combine these two responsibilities. | Before creating final materials, administrator audits login/admin rights, shared mounts, network access, backups and output channels. Custodian creates new case lineages, private labels/references/grader manual, rights/split manifests and calibration; releases only signed hashes. After freeze, runs one attempt at a time, reviews privately and releases only aggregate results. |
| Billing reconciliation authority | You can do this if you have the project's actual usage/cost/invoice access; it need not be a separate accountant. | Match project, time, model, provider response IDs and usage to closed billing evidence, include count requests and late charges, retain evidence hashes and sign per-attempt statements only when the actual charge/absence is substantiated. If provider evidence is only aggregate or incomplete, do not invent precise per-attempt invoices: leave costs provisional/unknown. |

Naming a custodian does not isolate files. Another account on this Windows host does not
pass the implemented boundary. The runtime requires a different POSIX host, correct uid
and a private root with no group/other access; real admin/network/backup independence
still needs verification outside code. If you wanted to be final custodian yourself, you
would have to leave optimization and keep final information out of this chat, while still
establishing the technical boundary. Given your current optimization/owner role, another
person with a genuinely separate environment is the simpler credible arrangement.

A signature establishes who attested a review/invoice and binds its contents. It does
not prove independent custody, human timing or billing accuracy. These require underlying
access restrictions, observations and provider evidence. A final custodian/reviewer is
not required to get through smoke. Billing reconciliation is not required before the first
call; its absence retains exposure and blocks known-cost claims instead of inventing zero.

## Prerequisites by stage

| Stage | Required before execution | Not required for this stage |
|---|---|---|
| Two-attempt smoke | Your explicit USD 1 approval, exact project ID, usable project key in the approved protected file, exact Sol route/settings, signed scoped grant and unexpired deadline. | Final custodian, independent reviewer, final cases, immutable snapshot, calibration, billing-reconciliation signature. |
| Development/validation | Separate explicit budget/route approval; credible chosen baseline configuration, open data rights and fixed output contract. Human reviewer identity/key and real timing are needed for usable review/candidate/validation evidence. | Protected final cases or a final release. |
| Protected creation/freeze/evaluation | Real boundary BEFORE final materials; independent calibrated reviewer/custodian, immutable revision evidence, frozen baseline/challenger/spec/manifests/analysis, approved final route/budget and signed exact-freeze release. | None of these is implied by smoke approval. |

## Local credential preparation and remaining unknown

A process OPENAI_API_KEY is present. No credential value was displayed or sent to a
provider. OPENAI_PROJECT / OPENAI_PROJECT_ID are absent, and the checked canonical .env
and prepared config contain no project ID. Presence does not prove a valid, funded or
project-compatible key. The exact project ID cannot be derived safely from the secret.

Proposed approved credential location:

C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028\var\foundry-smoke-028\auth\provider\openai.key

The parent directory exists, is empty, and has inheritance disabled. Access is restricted
to the local owner, SYSTEM/Administrators, and read/execute for the current Codex runner
identity. It is not a confidential holdout boundary; it is a trusted application credential
boundary. The directory/file remain under ignored var/, never in prompts or Git. Verify
the actual file ACL and runner readability after creation, without printing its contents.

Automatic approval review rejected persisting the configured key before explicit approval,
citing unnecessary persistent secret exposure. No copy occurred. The safer permitted step
was preparing this empty private directory. The approval below explicitly includes staging
the already configured key there; if it belongs to another project, supply the correct key
locally instead. Never paste it in this chat. No permission is requested to inspect unrelated
credentials or modify shared infrastructure.

## Smoke authorization presented for approval

Machine-readable unapproved request: smoke-setup/authorization.request.json.
Operational request: var/foundry-smoke-028/authorization.request.json.

- Project: YOUR EXACT proj_... VALUE, the only missing configuration value.
- Provider: direct OpenAI; exact model gpt-5.6-sol; reasoning medium; service tier default.
- Endpoints: POST https://api.openai.com/v1/responses/input_tokens and POST
  https://api.openai.com/v1/responses. No fallback, retries or business-effect tools.
- Data: only authorized inputs of open synthetic cases D-001 and D-002, baseline
  instructions and strict output schema; no labels, customer data or Protocol-010 material.
- Maximum authorized local exposure: USD 1.00; at most TWO inference attempts and TWO
  supporting token-count requests. Other stages have zero caps in this account.
- Per attempt: 8192 admitted input tokens (provider complete-payload count plus 10% and
  256-token margin), 4096 output tokens including reasoning, USD 0.13 reservation,
  10-second count timeout and 60-second inference timeout; failed calls count.
- Expiry: 2026-09-11T22:00:00Z (September 11, 6:00 PM America/New_York).
- Credential: authorize staging the already configured key into the exact protected
  location above, after confirming it belongs to the supplied project. Do not display it.
- Approval: pending your explicit response; no authorization.json has been written.

Official rates: $4/M standard input, $5/M conservative cache-write ceiling and $20/M
output. ceil((8192*500 + 4096*2000)/1000000) = 13 USD cents; two maximum reservations
sum to $0.26. The $1 allowance is not permission to add calls. The local ledger cannot
promise a provider billing hard stop. Count-endpoint pricing was not established by the
official count page; late/count charges stay unresolved until evidence closes them.
No claim of guaranteed external $1 billing is made. If a guaranteed provider hard cap is
required, verified provider enforcement is an additional prerequisite; it is not supplied
by local signatures or the token reservation calculation.

After you supply the project and explicitly approve, I can fill the approval reference,
stage the key through the protected boundary, sign the grant and execute exactly:

```powershell
Set-Location C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028
node packages/foundry/src/experiment/cli.ts authorize --root var/foundry-smoke-028 --file var/foundry-smoke-028/authorization.approved.json --key var/foundry-smoke-028/auth/owner.key
node packages/foundry/src/experiment/cli.ts smoke --root var/foundry-smoke-028 --condition baseline
node packages/foundry/src/experiment/cli.ts report --root var/foundry-smoke-028
```

## Immutable model revision: exact final-freeze blocker

The fetched Sol and Astra snapshot sections list only their undated model names. They do
not identify a separately addressable immutable revision or establish that those names
cannot be retargeted. A repeated response.model string, a model creation timestamp, a
hash of our config, or a locally invented dated suffix does not establish immutability.

Before final freeze: obtain an official immutable model ID or explicit provider guarantee
covering the exact requested route; verify that the authorized project can request it;
record source URL/evidence, retrieval date, exact request/returned identity and settings;
check all baseline/challenger work is on that same revision. Only then populate
modelRevision.immutable and officialEvidence. Any changed route requires explicit approval
and comparable development, not a silent substitution. If the provider supplies no such
revision/guarantee, the current immutable-model freeze requirement is blocked. Proceeding
with a time-bounded alias comparison would require your explicit revision of the design
and narrower inference claims. Smoke is unaffected and cannot satisfy this requirement.
