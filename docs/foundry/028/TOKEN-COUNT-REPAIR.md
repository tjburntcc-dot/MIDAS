# Mission 028 token-count failure repair

Offline verification complete; no provider request made during this repair. Existing implementation branch: codex/foundry-role-baseline-v0-028; prior HEAD 9a91b4e6030966e405b5f65b33d2aa025fa172da. No campaign, development or final-evaluation execution.

## Findings and uncertainty

The adapter used the correct POST https://api.openai.com/v1/responses/input_tokens endpoint, model gpt-5.6-sol, Bearer credential construction and OpenAI-Project header. The preserved signed project is proj_H01ORqdOPQM6vdGwQYsqFL5r, matching the user's corrected authorization. No credential was printed or decoded for diagnosis. Local project environment metadata does not independently establish project access. The protected provider directory has inheritance disabled and grants the owner, SYSTEM and Administrators full control and CodexSandboxOffline read/execute; the credential file inherits this directory policy.

Confirmed defects: HTTP failures discarded status/error/request-ID diagnostics. The original count body also included max_output_tokens, service_tier and store, which are absent from the endpoint's specific documented request schema. The general counting guide describes the payload more broadly. The repair projects all documented input-bearing fields, including instructions, reasoning and output schema, and excludes these three generation-only fields. Unknown new fields fail closed. This discrepancy is a plausible cause, not a proven explanation of the original failures: their response details were not retained. Key permissions, project/model access, quota and provider errors remain unconfirmed hypotheses.

Official references checked September 10, 2026:
- https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/overview

## Repair and safety behavior

The shared adapter records HTTP status, recognized provider error type/code and parameter, validated provider request ID, local allowlisted error message, latency and exact payload hashes. It never stores provider message text. Unknown codes/types are withheld; unusual request-ID formats are withheld. Response parsing is bounded to 16 KiB. Transport exceptions, HTML, malformed JSON and oversized bodies cannot enter diagnostics. Redirects, retries and fallback are disabled. A successful authoritative provider count remains mandatory; the existing admission margin is count plus ten percent rounded upward plus 256 tokens. No character-count substitution exists.

The ledger merges token-count observations with later inference observations. Future ledger rows omit raw serialized request bytes; the authorized domain request remains available for review. Original records, including their historical raw request bytes, are preserved without rewriting. In-flight implementation hashes remain pinned; old grants are not silently updated to authorize repaired code.

The separate count-diagnostic runner uses the existing signature verification and durable StateStore transaction mechanism. It requires a new signed, exact grant, checks expiry and original-row/request hashes, reserves once before dispatch and rejects a second invocation. It has no inference operation. Process interruption retains the reservation. The original smoke grant is exhausted and cannot authorize this diagnostic. Prepared development and final-evaluation files are preserved; future execution must explicitly reconcile their implementation pin with approved code.

## Original accounting audit

D-001 A-829f417d04e6f55e1e75543876635122a57e63e4 and D-002 A-46b97f4083c1f59ca2e9419439b469408dece367 each recorded TOKEN_COUNT_HTTP_ERROR. Together: two count HTTP requests, zero inference dispatches, zero generated outputs, no reported provider token usage. Each retains a USD 0.13 reservation: USD 0.26 total. Cost is unknown, money null, invoice null. There is no usage-based provisional cost estimate and no authoritative billing evidence. Retained reservations are exposure, not actual spending; inference not dispatched does not establish that counting was free. Nothing was released or reconciled without evidence.

The original SQLite file, both grant files, spec and smoke report remain byte-identical; see token-count-repair/preservation.json. No original evidence was replaced.

## Verification

85 tests passed, zero failed. Focused cases include projection, HTTP 400/401/403/404/429/500 diagnostics, secret/header injection, unknown fields, malformed/oversized responses, transport failure, exact signed authorization, expiry, modified history, one-shot concurrency and original database preservation. Tests use local mock transports and synthetic keys, not provider calls. Installed TypeScript 6.0.3: strict semantic check, zero errors, 14 source files; dependency declaration checks skipped. Standalone runner syntax check passed. Test output and unsigned request are in token-count-repair/.

## Prepared diagnostic and exact next action

Unsigned request: var/foundry-count-diagnostic-028/authorization.request.json. It is bound to source D-001's original exact request and the corrected projected count bytes. Model gpt-5.6-sol with recorded medium reasoning; synthetic authorized D-001 facts only. One POST to https://api.openai.com/v1/responses/input_tokens, zero inference, timeout 10 seconds, no retry/fallback/redirect. Full source request capped at 65,536 bytes; admission ceiling remains 8,192 tokens; count completion never triggers inference.

Credential location: C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key. Project: proj_H01ORqdOPQM6vdGwQYsqFL5r. Expiry: September 11, 2026, 22:00 UTC. The new precautionary reservation is USD 0.13 from the existing USD 1 aggregate ceiling; prior USD 0.26 plus USD 0.13 equals USD 0.39 retained exposure, leaving USD 0.61 headroom. Currently, before admission, headroom is USD 0.74. Headroom is not authorization. The reservation is not a verified count-endpoint price or an external billing guarantee.

Preparation already executed locally:

```powershell
node packages/foundry/tools/count-diagnostic.mjs prepare var/foundry-count-diagnostic-028 var/foundry-smoke-028
```

After explicit user approval only, copy the request to authorization.approved.json, set approved true, approvedBy and an approvalReference identifying that actual approval, and sign through the existing mechanism:

```powershell
node packages/foundry/src/experiment/cli.ts sign --file var/foundry-count-diagnostic-028/authorization.approved.json --key var/foundry-smoke-028/auth/owner.key | Set-Content -Encoding utf8 var/foundry-count-diagnostic-028/authorization.json
node packages/foundry/tools/count-diagnostic.mjs run var/foundry-count-diagnostic-028
```

Run from C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028. Result: var/foundry-count-diagnostic-028/report.json and durable diagnostic.sqlite. No grant was signed and no diagnostic was run during the repair. A count failure may clarify remaining access/schema issues; success validates counting only and does not authorize inference or establish output quality.
