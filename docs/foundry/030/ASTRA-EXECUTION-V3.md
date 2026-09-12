# Mission 030 — Astra operating execution v3 (unsigned)

Prepared 2026-09-12. This replaces the proposed execution order and allocations, not historical grants or observations. The original `STRATEGY-AND-LIVE-PROPOSAL.md`, its $9 Sol request and earlier $6 draft remain unchanged. No new account has been authorized, no grant signed, no credentials accessed, and no provider/count/mail request made by this preparation.

## Decision requested

Approve **at most $23 NEW Mission 030 exposure**, with optional controlled Gmail selected separately. Model-only is sufficient to complete the business investigation and reviewed deliverable. Gmail does not gate them. No Mission 028/029 allowance transfers; their historical reservations and billing limitations remain separate.

| Allocation | Maximum inference admissions | Supporting counts | Inference reservation |
|---|---:|---:|---:|
| Investigate, challenge alternatives, draft the useful packet | 8 | 8 | $6.56 |
| Review the actual packet, obtain a correction if needed | 2 | 2 | $1.64 |
| Conditional source-to-procedure extraction | 1 | 1 | $0.82 |
| Conditional matched procedure test: 6 cases × 2 conditions | 12 | 12 | $9.84 |
| Eligible linked recovery, primary work only | 2 | 2 | $1.64 |
| **Maximum** | **25** | **25** | **$20.50** |
| Unpriced count-exposure allowance | — | included above | **$2.50** |
| **Total maximum proposed exposure** | | | **$23.00** |

Stage ceilings are independently enforced. Unused comparison or recovery calls cannot become extra investigation. These are maxima, not spending targets. Failed admissions remain consumed. Concurrency one; no fallback, unmetered helper, automatic transport retry or comparison-cell replacement. Expiry **2026-09-25T22:00:00Z**. Use only permitted public source material, preserved founder business context and developer-visible synthetic comparison cases. No customers, account actions, registration, deployment or commercial messages are included.

## Why Astra instead of the earlier Sol choice

The earlier Sol Medium selection was a price/adequacy judgment, not measured equivalence on this business job. It gave insufficient weight to Mason's stated Astra preference and consequential reasoning requirements. The uncertainty is whether evidence supports any accessible venture, whether disconfirming evidence overturns the inherited proposal, and whether the reviewed artifact is useful. Astra High is the proposed route for all substantive stages and both comparison conditions. There is no cheaper smoke configuration whose success is presented as the benchmark. The first primary request is also the bounded route/access test and contributes to actual work.

Official documentation checked 2026-09-12 lists `gpt-6-astra`, Responses and strict structured-output support, High reasoning, **$10/M ordinary input, $12.50/M cache writes, $1/M cached input, $50/M output**. We reserve every input token at the higher cache-write rate and claim no discount. [Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)

Exact route: `POST https://api.openai.com/v1/responses`, `model: gpt-6-astra`, `reasoning.effort: high`, `service_tier: default`, `store: false`. Complete admitted input ceiling **32,768 tokens**, output ceiling **8,192 including reasoning**. Finite deadlines: **10 seconds count, 180 seconds inference**. Reservation calculation: `(32768 × $12.50 + 8192 × $50)/1,000,000 = $0.8192`, rounded up to **$0.82** per admission. Stop if the verified applicable price requires more. The $23 proposal is an explicit increase from the unsigned $9 proposal; neither is authority to spend.

The actual bridge serializes the task, stage context and tool descriptions into `input`, uses the versioned excellent baseline in `instructions`, and sends the strict task schema in `text.format`. Research is executed by the local bounded adapter; no provider-hosted web-search/tool charge is hidden in this quote. The count request uses `POST /v1/responses/input_tokens` with the same complete input-bearing fields, including instructions/schema. It excludes generation-only `max_output_tokens`, `service_tier` and `store`. Both endpoints use the lazy trusted Bearer credential callback and exact `OpenAI-Project` header. No key or headers enter the recorded request bodies. [Token-counting guide](https://developers.openai.com/api/docs/guides/token-counting), [Responses reference](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)

The preparation command writes exact serialized **preview** Responses/count bodies and SHA-256 values. Actual source, draft, time, budget state and each derived request are frozen again before their own admission. A preview hash is not falsely claimed to identify every future prompt. If complete input exceeds admission limits, no inference is dispatched; there is no guessed character count or silent source truncation to pass admission.

Current project/key entitlement and quota have **not** been tested. Historical Astra access in 028/029 is historical evidence only. Mason should check the confirmed project `proj_H01ORqdOPQM6vdGwQYsqFL5r` in the OpenAI dashboard: active API billing/credit, permission to use Astra, sufficient project budget/rate limit, and the existing key's access to Responses and input counting. No new key need be pasted or created if the protected existing credential remains usable. API credit is separate from subscription usage. A project field matching the grant does not prove the key has access. [Project model-permission reference](https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/projects/subresources/model_permissions/methods/retrieve)

The current public snapshot list exposes `gpt-6-astra` but does not establish an immutable dated revision. Record returned identity, response/request IDs, timestamps, settings and request hashes. This is exploratory work; immutable revision availability remains a blocker for protected final freeze. Do not call the alias immutable.

## The business job can overturn the inherited hypothesis

New linked assignment: `midas-venture-investigation-v3`, parent `midas-owned-venture`. The parent's goal, proposal, sources and observations remain preserved. The new goal explicitly permits replacing the cleaning-site audit or rejecting all candidates. Its 12 seed URLs cover observed cleaning-business interfaces, substitute quote/customer-communication software, onboarding workflows and market-research methodology. URLs are research entry points, not pre-read runtime evidence or endorsements of any conclusion.

The model chooses decision-relevant retrievals (up to **8**, bounded plaintext), queries acquired material, and follows observed links on the permitted hosts. This is **not unrestricted web search**. Source failure or a poorly informative corpus is an evidence-access limitation, not proof that no venture exists. A materially different source domain requiring approval is recorded as a next evidence request. Development-assistant research remains labeled preparation; the runtime retrieves and records its own observations.

Required packet, including a supported rejection:

1. Dated sourced findings, contradictions, important unknowns, source coverage and limitations.
2. Up to three evidence-relevant offers compared on buyer problem, reachable acquisition, existing substitutes, delivery/learning burden and owner effort. No assumed network, expertise, cash or confirmed hours.
3. A retain/replace/reject decision, reason, uncertainty and the evidence that could reverse it.
4. An actual small sample deliverable for a supported offer, or a useful evidence-backed rejection memo. Preparing a full second SaaS is outside the job.
5. Interview questions, draft acquisition wording, explicit economics assumptions including unknown founder labor, and a bounded next action with success/revision/stop criteria.
6. Original and fully corrected reviewed packet, substantive changes, unresolved semantic judgments, usage/latency and provisional costs.

Both investigation and review receive the applicable actual sources; review receives the actual draft. A justified venture rejection goes through `draft` and `review`; `stop` is reserved for a genuine inability to produce a grounded packet. Initial/review schemas set `outreach.maxItems=0` for this assignment. Draft acquisition wording belongs in the packet, not an actionable mail queue. Review cannot grant authority. Missing sources, schema defects, genuine task mistakes and incomplete work are separately reported rather than represented as a completed result.

The owner workspace displays preparation as development-assistant authored, future retained pages as runtime retrieval evidence, future artifacts/reviews as actual-model output, and customer/demand/revenue/human-time measurements as unknown until observed. No real-model outcome has been produced by this revision.

## Conditional procedure release and worker-selection consequence

Primary work comes first. Source extraction itself is **conditional**, not an obligatory extra call. Before it, the development assistant must record a reviewable improvement case using actual model artifact/review evidence: exact observed quotation, consequential job, reusable mechanism, alternative explanation, regression risk, case fit and the result that would change selection. This is assisted analysis, not an independent human verdict. It is hash-bound to the actual current reviewed packet and cannot be created from mock review success.

The existing six cases test one narrow job: **select an exact documented inquiry route using current, missing, stale and conflicting source evidence without assuming contact authority**. They cannot establish better venture strategy, sales, drafting, arbitrary reasoning or general research. Release them only if that job is consequential for the actual next business action and the observed improvement case maps to it. Otherwise retain the baseline and preserve all 13 conditional calls. Do not rewrite the cases after seeing business results to manufacture a win. A source quotation alone is insufficient.

The extraction receives the actual reviewed packet and improvement case; it may return `retain_baseline`. Only a traceable, job-fitting candidate releases the 12 existing paired calls. Both conditions receive identical Astra High/default, source facts, shared excellent general instructions, context/output contract and token/call ceilings. Only the versioned procedure addition differs. Freeze before comparison; alternating condition order, fresh case state, one observation per condition/case, no reruns. These are developer-visible, related exploratory cases, not protected holdout or independent sample counts of 12.

Prospective selection rule: **retain baseline** for no candidate, equal performance, any new consequential authority/address/evidence error, or merely stylistic differences. A candidate with at least **two net additional mechanically accepted cases out of six**, no newly failed baseline-pass case and no critical error is eligible for a focused semantic owner review, provided the failure mechanism and cost/latency are acceptable. That may justify choosing it experimentally for this narrow next assignment; it does not certify superiority. Until the semantic job-fit decision is actually made, the existing analysis remains inconclusive and the default worker remains the strong baseline. Missing billing or correction time blocks definitive total-cost/labor claims, not preservation of observations. Stop spending when no next call could change the decision.

## Precisely bounded recovery

Two reserved recovery admissions maximum, shared across primary investigation and review. Eligibility is deliberately narrow: a provider response was received with **status `incomplete`**, correct model identity, provider response ID, integer usage and provisional cost recorded; the local failure is `MODEL_RESPONSE_INCOMPLETE`. Completion uncertainty is not eligible. One recovery per failed original and **no recovery of a recovery**.

The manager persists a new `recovery-…` identity linked to the original. An immutable scoped claim prevents two fresh requests replacing the same parent. The recovered payload must match the original except a fixed instruction to produce a concise complete answer under unchanged limits. Source content, schema, model, reasoning, authority and ceilings do not change. The original admission, output-status evidence and full reservation remain. Recovery consumes the overall 25-call/count ceiling and the two-recovery stage ceiling; rejected admissions do not expand either.

No automatic recovery for timeout/process uncertainty, network loss, token-count failure, 401/403 access, quota, unsupported route/schema HTTP errors, malformed completed output, wrong returned model/tier or suspected privacy/authority failure. Diagnose those offline. Do not blindly repeat. A preserved complete response resumes under its original identity without another provider request. Uncertain completions retain exposure pending adequate reconciliation; `store:false` does not promise a retrievable completed response. Billing evidence and an authenticated closing statement are necessary before releasing monetary reservations. A local ledger cannot guarantee the provider's bill, and a signature alone cannot make a billing assertion accurate.

## Gmail is independently selectable and remains an exact-action gate

Proposed test: one owner-controlled sender, **two distinct** owner-controlled or explicitly consenting test addresses, **two messages total**, **eight bounded poll operations**, 30-second minimum sending interval, zero follow-ups, same expiry. No model calls. A poll may make a bounded list/read sequence, so eight polls are not claimed to equal eight HTTP requests. Use fresh test inboxes if convenient to avoid exposing unrelated correspondence; the implementation reads only the exact tracked message/thread context. `gmail.readonly` is still a broad account-level OAuth permission: local filtering is not a provider-enforced mailbox isolation boundary.

**Exact message A** — subject `MIDAS controlled delivery test — 030-A`

> This is an owner-approved MIDAS delivery test to a controlled or consenting test mailbox. It is not a sales message or a customer result. Please reply ACK 030-A so we can check thread receipt. Do not include private information. No other action is requested.

**Exact message B** — subject `MIDAS controlled stop test — 030-B`

> This is an owner-approved MIDAS reply-handling test to a controlled or consenting test mailbox. It is not an offer. Please reply: Please do not contact me again. MIDAS should record the request and suppress further messages. This reply is a test signal, not evidence of buyer rejection or demand.

These bodies are controller-prepared test assets, not model-generated business work. The local configuration command binds addresses to them in `midas-controlled-gmail-v3`, which has **zero model admissions** and separate channel authority. Model approval alone cannot send either message. No commercial offer or prospect address is inherited from the venture packet.

### Exact owner account steps (only if Gmail is selected and approved)

1. Specify the sender email and two distinct test recipient emails; confirm you control them or have explicit consent for these messages and replies. Do not send credentials in chat. Supply no buyer list.
2. In your Google Cloud project, enable Gmail API; configure Google Auth Platform consent for personal testing (or internal if your Workspace organization supports it), adding your sender as a test user. If creating/configuring a project or OAuth client is needed, include that no-purchase account setup in your optional approval; no such change is currently authorized or performed.
3. One practical manual connection is Google's OAuth Playground with **your own OAuth client**: create a Web application client with authorized redirect `https://developers.google.com/oauthplayground`; in Playground settings select “Use your own OAuth credentials”; enter client ID/secret there, not MIDAS or chat. Request only `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly`, sign into the exact sender, consent, and exchange the authorization code. Check the actual granted scopes and expiry. Do not execute sample send requests in Playground. The read scope is restricted and send scope sensitive; organizational policy or consent restrictions may block this test. Do not bypass them. [Google OAuth Playground](https://developers.google.com/oauthplayground/), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
4. Enter the short-lived access token into the local hidden-input script below. It writes only `var/operating-workbench-030/auth/gmail-oauth.json` with a current-user-only Windows file ACL; no token in command history or report. Use the actual expiry, never extend it manually. The helper records requested scope names; successful account access still requires the provider. The existing transport does not automatically refresh credentials. Connect immediately before the short mail test; expiry pauses it rather than broadening access. No refresh token is needed by this implementation.
5. Inspect the exact sender, recipients, bodies, hash, expiry and limits in the workspace and approve the exact batch. After dispatch, reply from A and B as above. MIDAS can then poll and preserve actual acknowledgements/replies/suppression without further spending approval. A provider acknowledgement is not delivery; an actual linked reply is stronger evidence. Unknown send outcome is reconciled by Message-ID, never resent. Unknown or expired account access requires owner intervention.

No purchases, customer activity or other account changes are included. Gmail can be deferred without delaying model work. Until recipients and sender exist, there is no honest final message hash to approve.

## Commands and artifacts

Working directory: `C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-030`.

Preparation (already run; no credentials or external calls):

```powershell
node packages/foundry/src/operations/cli.ts prepare-astra --root var/operating-workbench-030
node packages/foundry/src/operations/cli.ts serve --root var/operating-workbench-030 --port 43130
```

Open `http://127.0.0.1:43130/?id=midas-venture-investigation-v3`. Home shows the pending proposal; Pipeline shows prepared/actual materials; Results shows usage and evidence, never fabricated revenue. Unsigned requests and payload preview are in `var/operating-workbench-030/proposal/astra-v3/`.

After model approval, the operator fills the approval identity/reference from the actual approval, binds the current implementation hash, signs a **new** envelope with the established `signed/verified` Ed25519 mechanism, and stores the trust anchor separately in the protected local auth directory. Historical grants are never edited. The following paths are the prepared execution convention, not a claim that signed files exist now:

```powershell
$midasRoot = 'C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-030\var\operating-workbench-030'
node packages/foundry/src/operations/cli.ts preflight --root $midasRoot --business midas-venture-investigation-v3 --live-grant "$midasRoot/proposal/astra-v3/model-grant.signed.json" --trust-anchor "$midasRoot/auth/owner.pub"
node packages/foundry/src/operations/cli.ts serve --root $midasRoot --port 43130 --live-grant "$midasRoot/proposal/astra-v3/model-grant.signed.json" --trust-anchor "$midasRoot/auth/owner.pub"
# In the existing owner workspace choose this assignment and Run.
# Alternative to the server's Run, never concurrently for this business:
node packages/foundry/src/operations/cli.ts run --root $midasRoot --business midas-venture-investigation-v3 --live-grant "$midasRoot/proposal/astra-v3/model-grant.signed.json" --trust-anchor "$midasRoot/auth/owner.pub"
node packages/foundry/src/operations/cli.ts report --root $midasRoot --business midas-venture-investigation-v3
```

The existing approved OpenAI key file is reused by callback only after signed approval. No key copy/replacement is required. Stop the previous local server before starting the signed one. The model-only run can investigate, retrieve sources, decide, draft, review/correct and finish the packet without another owner checkpoint unless a material access/integrity/resource blocker arises. The development assistant assesses the conditional evidence gate from actual results and records a supported hypothesis before `learn`; this is deliberate judgment, not an autonomous proven optimizer.

```powershell
# Conditional only: a real reviewed weakness and case fit must first be recorded.
node packages/foundry/src/operations/cli.ts record-improvement-case --root $midasRoot --business midas-venture-investigation-v3 --evidence "$midasRoot/reports/improvement-case.json"
node packages/foundry/src/operations/cli.ts learn --root $midasRoot --business midas-venture-investigation-v3 --source ACTUAL_RETAINED_PUBLIC_SOURCE_ID --live-grant "$midasRoot/proposal/astra-v3/model-grant.signed.json" --trust-anchor "$midasRoot/auth/owner.pub"
# Optional Gmail setup: substitute only non-secret addresses/actual expiry.
node packages/foundry/src/operations/cli.ts prepare-gmail-test --root $midasRoot --sender OWNER_SENDER --recipients CONTROLLED_A,CONTROLLED_B
powershell -NoProfile -File packages/foundry/tools/stage-gmail-oauth.ps1 -AccountEmail OWNER_SENDER -ExpiresAt ACTUAL_TOKEN_EXPIRY
```

Configure optional addresses **before signing either grant**; the zero-model-call mail scope is already in the proposed model envelope. If deferred, leave it unused. After separate channel approval bind `modelGrantHash`, owner-controlled/consent attestation and protected file paths in the new channel envelope; sign it, then add `--channel-grant "$midasRoot/proposal/astra-v3/channel-grant.signed.json"` when starting the server. Open the controlled mail assignment, Run to queue the prepared exact test without inference, and use Approvals. The exact batch then drives dispatch/poll. No token-count request is associated with either test message.

Output evidence: retained sources and timestamps, model-selected claims/unknowns/bottlenecks, actual initial and reviewed packets, review changes, exact per-attempt bytes/hash/identity/usage/latency, failed/recovery observations, retained/provisional/settled accounting, optional frozen comparison and its limits, optional exact outbox/acknowledgement/thread/reply/suppression records. Reports live under `var/operating-workbench-030/reports/` and all actual state in its SQLite store. Independent semantic validation, measured owner correction time, authoritative billing and real commercial outcomes remain explicitly separate.

## Owner reply needed once

Approve or revise the **$23 Astra High v3 envelope** and confirm that the existing confirmed API project/credential remains the intended route. Select **model-only** or **model + controlled Gmail**. For Gmail, provide the sender and two controlled/consenting recipient addresses and approve the described limited account setup; keep tokens/client secrets out of chat. I can finish signing/startup and covered model stages after approval. Optional Google consent, exact message approval and the two test replies are the remaining owner actions; account obstacles cannot be solved by more inference calls.

## Completed preparation verification

Continued from accepted `fcb291c5337a4a2504a44c84987c3a5e8c5bbd82` on `codex/executive-operating-loop-v0-030`. Focused implementation commit: `7ad2cf46d75bb1dbb47998efb64bfcb2692a5ff3`. No new mission, worktree, runtime platform or live account was created.

- **54 operating tests pass**, including 11 new proposal/recovery tests. The exact proposed envelope, converted explicitly to mock mode, completes a reviewed rejection with no mail or conditional calls. Tests cover original-reservation retention, exact recovery payload relation, no access/uncertain retries, duplicate-parent prevention, two-recovery ceiling and blocked comparison release from mock evidence.
- **62 experiment regressions pass**; scoped strict semantic TypeScript check: 58 source files, zero errors using installed compiler 6.0.3. No dependencies installed.
- Actual Chrome journey inspected: proposal visible, prepared authorship explicit, Pipeline/Results navigation works, 390px mobile has no horizontal overflow. Four local GETs, zero mutating/external requests, zero browser errors. Screenshots and machine-readable evidence: `var/operating-workbench-030/reports/astra-v3-browser/`.
- Gmail helper passed PowerShell syntax parsing. It was **not executed**; Google OAuth, Windows credential staging with a real token, account scope/access, send, delivery and reply have not been verified live.
- Original Sol model/channel request bytes, original completion receipt and all **122 historical mock attempt records** remain unchanged by hash. Mission 030 has **zero actual-model attempts, zero new exposure and no signed v3 grant**. Preservation proof: `reports/astra-v3-preservation.json`. Canonical, 027, 028 and 029 remain at their recorded revisions with clean tracked status.
- Investigation source URLs are preparation, not runtime findings. One unavailable Asana research URL was replaced prospectively with the located public client-onboarding template; the SBA seed uses its observed current destination. The earlier unsigned payload preview is preserved under `proposal/astra-v3/earlier-source-preview/`. No paid observation was rerun or relabeled.

Offline verification proves the bounded mechanics, not Astra compatibility, commercial viability, Gmail access, independent semantic quality or specialist superiority. Actual account access and useful real-model output remain the purpose of the proposed first run.
