# Mission 028 approved smoke result - 2026-09-10

The approved smoke was executed once under the signed grant, before its
2026-09-11T22:00:00Z expiry. Credential staging was accepted by automatic approval
review following the user's explicit authorization. The key was not displayed,
logged, included in reports or added to Git.

Project: proj_H01ORqdOPQM6vdGwQYsqFL5r.
Requested route: direct OpenAI Responses, gpt-5.6-sol, medium reasoning, default tier.
Authorization hash: 5341481e59711a4f4f4e6cced5a67c86d29fec97531e8782516465471927b04c.
Runtime source and prepared development/final experiment were not changed.

| Case | Result | Inference dispatched | Elapsed attempt | Retained reservation |
|---|---|---|---|---|
| D-001 | TOKEN_COUNT_HTTP_ERROR | No | 704 ms | USD 0.13 |
| D-002 | TOKEN_COUNT_HTTP_ERROR | No | 133 ms | USD 0.13 |

The two supporting token-count POSTs received non-success HTTP responses.
No Responses inference POST was dispatched, no model output was produced, and
output-contract validation could not be exercised. The requested model's actual
availability remains unverified.

The existing adapter records TOKEN_COUNT_HTTP_ERROR but does not retain the HTTP
status, provider error code/body or request ID for this stage. Therefore the
persisted evidence cannot distinguish key/project authorization, endpoint access,
model access, malformed-request rejection or another provider HTTP failure.
Do not infer a specific cause or send another request merely to recover that detail.

Accounting: two admitted failed smoke attempts; two supporting token-count requests;
zero inference dispatches; no provider token-usage measurements; no provisional
usage-based cost estimate; no authoritative settled invoice. Each cost is UNKNOWN,
not known zero. USD 0.26 remains reserved, within the USD 1 local cap. The remaining
monetary room does not permit more calls: the two-attempt allowance is consumed.
No retry, fallback, development, protected evaluation or business action occurred.

Operational evidence remains in ignored local state:
var/foundry-smoke-028/reports/smoke-execution.json,
var/foundry-smoke-028/experiment.sqlite, and the signed authorization.json.
The protected credential file remains at the explicitly approved location; its
contents are excluded from all evidence and Git.

Exact next action: the project owner should check the API dashboard/key metadata
for this project and verify that the configured key belongs to it and has access
to POST /v1/responses/input_tokens and the requested model. Supply any available
provider-side error/status evidence without credentials. Resolve billing from
provider evidence; do not release the reservation based on a failed HTTP response.
A further attempt would require a separately explicit bounded authorization after
the cause is resolved, while preserving these failed attempts and their exposure.
