# Mission 031 V4 R4 — live execution stopped at provider failure

Executed September 13, 2026. No runtime product or build decision was produced. This is an incomplete engineering experiment, not a supported commercial rejection.

The exact approved proposal `2d177f6a5bd89e656899eba56823f09066f880f98e526c756be994873e46af69` was reconstructed and verified against implementation `be10dd1038505781070c2dc87415c31aa46d5e8ed7d08603b62e686899817f89`. The isolated branch was clean at `98034bb6134c65d885d6ce98627c5a7c73cf8bcd`. The approved protected mechanism signed R4 and retired R3 authority while preserving its evidence. The accepted research was reused unchanged. No frozen source, prompt, task, schema or model setting was modified.

## Observed stop

The single permitted build-gate admission `p031-2c7a9771c07a9c24-0` dispatched at `2026-09-13T18:43:22.026Z`. The provider acknowledged background response `resp_0a21f75cf3898a96006aa6eec8de0087d2a16fc185bdc9c795`. Two same-ID retrievals followed. At `2026-09-13T18:43:27.937Z`, the persisted terminal response was:

- Model `gpt-6-astra`, tier `default`, background/store both true.
- Status `failed`, output empty, usage null, incomplete_details null.
- Terminal hash `3760be8e2a4eb24e3d9fa55d9313b19d8a9e6ec0926f277a6b54e02aa8c0fa9d`.
- Create request ID `req_ef8794e9fc9544ceabdb8f8c20cbe0b9`; final retrieval request ID `req_2ca9922315ff42ff8d23689740637cb8`.

The durable response identity and terminal outcome were captured. This is a known terminal failure, not an unknown provider completion, timeout, or confirmed output-limit failure. The model adapter checks usage before interpreting terminal failure and surfaced `MODEL_USAGE_MISSING`. The frozen terminal sanitizer does not retain the response-level error field. Therefore the underlying provider cause is unavailable in local evidence. Neither server error, schema rejection nor quota failure is established.

The task remains `needs_reconciliation`; its one admission is consumed. The four downstream stages remain queued with zero admissions. No replacement inference or fallback is authorized. The existing recovery code returns an already persisted terminal response rather than fetching it again; repeating the run cannot recover the omitted error detail. No resend or reinterpretation of historical partial answers was attempted.

## Accounting and preservation

| Quantity | Recorded value |
|---|---:|
| New inference/count requests | 1 / 1 |
| Same-ID retrievals | 2 |
| New retained reservation | $1.64 |
| Prior retained exposure, including buffer once | $17.53 |
| Combined retained exposure | $19.17 |
| Unconsumed aggregate headroom | $26.65 |
| New provisional token cost | Unknown: no usage returned |
| Historical known provisional subtotal | $5.74 |
| Authoritative settlements | Unavailable |

Unused downstream admissions cannot replace the exhausted gate. Retained exposure is not actual spending. No reservation was released. R2 remains unknown and both R3 incomplete outcomes remain preserved.

Ignored evidence under `var/portfolio-031-continuation-r4/reports/` includes `live-result-r4.json` (terminal, request IDs and stop receipt), `portfolio.json`, `live-stop-console.json`, and `owner-after-stop.json`. The owner workspace at http://127.0.0.1:43141/ reads the actual signed ledger and persisted failure while provider execution remains disabled in that server. Historical development previews are not runtime deliverables.

The complete SQLite/authority backup is `var/portfolio-031-continuation-r4-stop-backup`, manifest hash `a19d45f11bb9a0ba6d31b4b7fb27c93cf32aa8d84b68c00d850412272c31e3b3`, database hash `9a74a76902c95133841e985c54c8bf5c323466fce8add034091aed08efda6e45`. It contains no copied credentials and carries historical-evidence-only authority disposition. Backup integrity and logical table hashes were checked.

## Decision and next action

Stop spending. Recover the provider's failure code for the exact response/request IDs through the authorized project's response logs or a separately reviewed diagnostic path; do not buy another inference to diagnose it. That evidence determines whether any fresh gate is justified and what correction it requires. A replacement requires explicit linked authority, not unused downstream capacity.

No new commercial conclusion follows. The unchanged accepted research and separately prepared, unsent operator interview remain available. Customer outreach, product deployment and transactions remain outside authority. Development-assistant intervention comprised verification, signing, execution, local diagnosis and evidence preservation; no runtime answer or product source was supplied or corrected externally. Labor duration and provider billing are not measured.
