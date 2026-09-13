# R4 provider diagnosis and prospective error repair

## Actual cause and execution decision

The single authorized diagnostic GET returned HTTP 200 and the same terminal failed response. Its provider error code is **`credit_balance_exhausted`**. The provider says no credits remained. `usage` and `incomplete_details` are null. This establishes the reported credit constraint behind the original failure; it does not measure the current billing balance or prove that credits have since been restored. It supplies no evidence of a schema defect, reasoning-limit failure, or transient server error.

Do not dispatch another inference. The owner must verify and resolve the API billing/credit constraint for the organization containing project `proj_H01ORqdOPQM6vdGwQYsqFL5r`. No purchase, billing change or account access was performed. After access is restored, a fresh build-gate admission could be justified as a replacement for a known credit failure; it still requires explicit linked authority and must include the prospective repair if used. No replacement packet or inference grant was prepared here. Historical research remains reusable, and the build-or-stop decision is still unexecuted.

## One-read evidence

- Original attempt: `p031-2c7a9771c07a9c24-0`.
- Response: `resp_0a21f75cf3898a96006aa6eec8de0087d2a16fc185bdc9c795`.
- Original create request: `req_ef8794e9fc9544ceabdb8f8c20cbe0b9`.
- Diagnostic GET request: `req_ca6434e95bcd43c88c8734f64eaab7af`.
- Diagnostic dispatch: `2026-09-13T21:13:32.419Z`; observation persisted at `2026-09-13T21:13:33.511Z`.
- Full response: 4,561 bytes, SHA-256 `5597a9cfb9515f02fa6a6bf10c11dbe4cfe42e013114e4b7dc6a327fc86d0d59`.
- Specific one-read signed authorization hash: `e73b5389abcb1842d04f9247d0a1c681b15d9fd8acacedbfc1f6c71d92a88087`.

The owner's exact instruction was materialized and signed using the existing protected mechanism. It authorizes only this GET, 15 seconds including body consumption, no automatic retry, no POST, no count. An exclusive, flushed dispatch marker consumes the admission before network access. Local permission failures occurred before dispatch; the directory's access list was corrected to include the owner identity. Exactly one provider GET followed.

Protected evidence directory (under original R4's ignored run root):
`C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-031-contracts-r4/var/portfolio-031-continuation-r4/diagnostics/response-r4-one-read`.

It contains the signed diagnostic authorization, dispatch intent, complete response body, selected response headers and observation. Access is restricted to the owner and local sandbox identity. The full body is outside Git. Only project/Accept request headers and selected response metadata were recorded; authorization headers and credentials were never persisted. The tracked regression fixture contains selected failure fields and the original body hash, not full worker context.

The supplemental diagnostic record accounts for one additional retrieval: two original R4 GETs plus one diagnostic equals three against the existing 240-per-response/3,600-aggregate bounds. No new uncertainty buffer was allocated. Retained exposure remains **$19.17**, including historical $17.53 and the failed gate's $1.64. The original $4 unpriced count/retrieval buffer remains included once. GET billing is unpriced/unknown; this is not an assertion it is free. No reservation was released, no authoritative settlement was manufactured, and the historical $5.74 provisional subtotal does not establish a complete bill. Original runtime rows remain unchanged, so their retrieval counter still reads two; the third read is explicitly linked in the diagnostic supplement.

## Completed prospective repair

Changes are isolated on `codex/portfolio-error-preservation-v4-031` in `foundry-worktree-031-errors-r4`, based on frozen R4 commit `14bb44e125f41adf747594924dca1ae15235684c`.

- `response-observation.ts` records recognized status, distinct outcome class, provider error code/type/parameter/message, incomplete reason and usage availability. General-ledger fields are bounded and redacted before truncation. Unrelated response fields and headers are excluded. These diagnostics are untrusted evidence, not model context or authority.
- Durable response handling persists the observation before route/storage interpretation and retains error details in terminal evidence. Saved terminal replay after restart uses no new GET or POST.
- ModelPort records provider diagnostics before interpretation. Terminal failed, incomplete and cancelled outcomes have distinct error codes. Missing or invalid usage is recorded separately; it cannot replace an established provider failure. Valid reported usage is provisionally accounted even when output failed. Unknown transport completion retains exposure and never implies a failed/finished response.
- Prospective owner display distinguishes terminal failed/cancelled responses from terminal incomplete and genuinely unknown outcomes. Failure records no longer inflate the incomplete-response count. This is development-assistant product work; the original frozen server/code were not replaced.
- The new helper is included in implementation binding. Old signed execution cannot silently consume these changed sources.

No product source was authored on behalf of the runtime. No scope expansion, inference replacement, billing mutation, external support message or customer action occurred.

## Verification and limits

51 unique focused tests passed: the 49-test adapter/durable-resume/owner-state suite, followed by two additional actual-diagnostic/redaction regressions (the final ModelPort subset has 11 passing tests). Cases cover failed without usage, failed with error, valid usage on failed responses, excessive usage without overwriting primary failure, incomplete, completed, redaction, terminal persistence/restart, delayed completion, lost connections, process interruption and no duplicate inference. Transports are explicit mocks with no live fallback. The recovered live failure fields are regression evidence, not a new model decision.

Strict TypeScript 6.0.3 semantic checking passed with zero errors across 45 source files. Original R4 entities, events, records and artifacts were compared to the preserved stop backup and are unchanged. Frozen implementation hash remains `be10dd1038505781070c2dc87415c31aa46d5e8ed7d08603b62e686899817f89`; prospective hash is `d33484cb543285af98327705ca98774db6a0b1a00f7da6b07cb03ef886f8ee03`.

The API reference documents retrieval of an existing response and separate status, error, incomplete details and usage fields: https://developers.openai.com/api/reference/python/resources/responses/methods/retrieve . The actual diagnostic, rather than a general error guide, establishes this failure's credit code.

A support request is unnecessary to identify the reported cause. If the owner finds contradictory billing evidence, look up the exact response/create/diagnostic IDs above in the authorized project's logs, with original dispatch time `2026-09-13T18:43:22.026Z`. Ask why that response reports `credit_balance_exhausted` and request applicable usage/charge evidence. Do not send any support message or include a key. Current balance, exact charge and whether account access has been restored remain unavailable locally.
