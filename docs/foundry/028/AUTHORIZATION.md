# Concrete authorization request  -  not approved

No numerical spending authorization exists in this session. Actual provider calls,

API spend, outstanding provider exposure and measured human review effort are all zero

or unmeasured as appropriate. The offline implementation is ready for a bounded real

route; readiness is not evidence of specialization improvement.

Approve or amend this one concrete proposal only after providing the missing project,

credential paths and named people. The prepared machine-readable request is

`prepared/authorization.request.json`; the operational copy is in the experiment root.

The owner signs an approved copy using the CLI. Do not put API keys in chat or the JSON.

| Field | Proposed value / required owner input |

|---|---|

| API project | Owner must supply the exact `proj_...` project and verify permitted route access. |

| Provider / model | Direct OpenAI Responses API, exact `gpt-5.6-sol`, reasoning `medium`, standard/default service tier. No fallback or alternate model. |

| Endpoints | `POST https://api.openai.com/v1/responses/input_tokens` and `POST https://api.openai.com/v1/responses` only. |

| Credential method | Owner-supplied OS-protected API-key file at an explicit absolute path; project header fixed; no environment lookup or key logging. Supply development credentialFile and protectedCredentialFile separately. |

| Data | Only purpose-built synthetic authorized case facts, policy/invoice excerpts, operator instructions and output schema. No customer or Protocol-010 data. Protected synthetic inputs require separate boundary, freeze and owner final release. |

| Smoke | USD 1.00 cap, at most 2 inference attempts, each with at most one token-count call. |

| Development | USD 10.00 cap, at most 72 inference attempts. |

| Open validation | USD 4.00 cap, at most 24 inference attempts. Development plus validation is USD 14.00. |

| Protected evaluation | USD 26.00 cap, at most 192 inference attempts; funds cannot be released by a development command. |

| Aggregate | USD 41.00 maximum local admitted-plus-settled account exposure; at most 290 inference attempts and 290 token-count requests. |

| Per attempt | USD 0.13 reservation; 8,192 admitted input tokens including safety margin; 4,096 maximum output tokens including reasoning. |

| Deadlines | Token-count timeout 10 seconds; inference timeout 60 seconds; propose a grant expiry 30 calendar days after approval. Protected release expires 48 hours after its signing. Owner supplies exact UTC timestamps. |

| Reviewer | Named independent reviewer required; not yet assigned. Approximately 6.4-12.8 hours for final reviews, plus development and calibration, is an estimate requiring availability confirmation. |

| Custodian | Named independent custodian and separate POSIX host/account/private root required; not yet assigned or provisioned. Custodian and reviewer may be one independent person if capacity and confidentiality permit. |

| Billing authority | Named project owner or delegate with access to authoritative closed-charge evidence and a separate configured signing key. Not yet assigned. |

This is one proposed whole-mission envelope with a separately signed protected-stage

release. In the initial approved grant, `allowProtected: true` means protected synthetic

data is conditionally permitted after the freeze and final-release gates; it does not

bypass them. If approving only the first USD 15.00, the owner must revise the spec/grant

BEFORE the first call to zero the evaluation budget and prohibit protected data. A later

extension requires an explicitly reviewed accounting migration; the code refuses to

replace an existing account's authorization to reset its cap. Do not run a second database

as a workaround. A narrower approval is never interpreted as the full USD 41.00 proposal.

## Current official route and price evidence

Checked official documentation on 2026-09-10 before proposing the route:

- [GPT-5.6 Sol model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

  documents a general-purpose flagship model, Responses support, structured outputs and

  medium reasoning. This is an actual API route, not an assumption from the Codex UI label.

- [Official API pricing](https://developers.openai.com/api/docs/pricing) lists standard Sol

  input at $4.00 per million tokens, cached input at $0.40, and output at $20.00. Cache-write

  input is 1.25 times standard input, so the reservation conservatively uses $5.00/M input.

- [Provider-compatible token counting](https://developers.openai.com/api/docs/guides/token-counting)

  documents `/v1/responses/input_tokens` with the complete create payload, including schema

  and instructions. The harness adds 10% plus 256 tokens to the returned count.

The conservative maximum is computed with integer minor units:

```text

ceil((8,192 * 500 + 4,096 * 2,000) / 1,000,000) = 13 USD cents / attempt

Smoke:       2 * $0.13 = $0.26  within $1.00

Development:72 * $0.13 = $9.36  within $10.00

Validation: 24 * $0.13 = $3.12  within $4.00

Evaluation:192* $0.13 = $24.96 within $26.00

All attempts:290*$0.13 = $37.70 within $41.00

```

These are admission reservations, not billed usage or guaranteed external limits. Rates

can change. Dedicated token-count endpoint billing was not established by the cited page;

retain exposure if its charges are unresolved. Cache discounts are not assumed. Local

abort does not prove provider cancellation. Unexpected charges must be recorded, and an

invoice above the reservation halts admissions. Do not claim the $41 ledger prevents all

external billing exposure. A dedicated provider project and owner-side controls are

recommended operational prerequisites, but no shared infrastructure changes were made.

Sol medium is a credible proposed initial baseline for this bounded text/policy job.

No observed development failure yet identifies an uncertainty requiring a more expensive

route. Frontier superiority over another model is not being purchased or claimed. Verify

project-specific availability in the approved smoke; public documentation cannot prove

account access. Subscription usage is not assumed to supply API credit.

No immutable dated Sol revision was verified in the official model documentation. The

prepared `modelRevision` remains null. A model alias is insufficient for final freeze.

The first smoke/development can characterize the approved route, but protected evaluation

requires verified immutable revision evidence or an explicitly revised experiment criterion.

No silent route switch or invented snapshot is allowed. Recheck price and capabilities at

approval if time has passed.

## Prepared exact operations

From `C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028`:

```powershell

node packages/foundry/src/experiment/cli.ts report --root var/foundry-experiment-028-release

# After the owner supplies and approves the complete fields:

node packages/foundry/src/experiment/cli.ts authorize --root var/foundry-experiment-028-release --file var/foundry-experiment-028-release/authorization.approved.json --key var/foundry-experiment-028-release/auth/owner.key

node packages/foundry/src/experiment/cli.ts smoke --root var/foundry-experiment-028-release --condition baseline

```

The full development, review, candidate, validation, freeze, custodian, evaluate,

reconcile and aggregate sequence is in README.md. Draft spec/baseline/cases, templates,

68 passing Foundry tests, 26 adjacent tests and a semantic typecheck are prepared.

No paid call is needed to inspect any of those artifacts.

The smallest external prerequisite is a complete owner approval for the project, exact

route, synthetic data, numerical stage/aggregate caps, expiry and credential method,

with a named development reviewer. Custodian assignment, immutable-revision evidence and

reviewer availability must be resolved before protected materials/final release; they do

not justify leaving offline implementation unfinished. The exact next action is to return

this completed authorization proposal, keeping the secret key in the named trusted file.
