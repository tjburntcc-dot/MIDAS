# Mission 028: project access recovery

The corrected Sol count reached OpenAI and returned HTTP 401, type invalid_request_error, code invalid_project. Request ID req_be084a4686c04a1b8153035a88a1e3bb; dispatch September 11, 2026, 01:06:52 UTC. Project submitted: proj_H01ORqdOPQM6vdGwQYsqFL5r. The founder repeated this same ID after the failure; that confirms the intended ID but supplies no corrective action.

No Astra count or inference has been attempted. Do not repeat the exhausted Sol diagnostic. The $55 envelope remains valid through September 25, 22:00 UTC, with $0.39 reserved and $54.61 uncommitted, subject to the unchanged stage/call caps.

## One owner action

In the authenticated OpenAI project settings, verify that the credential currently installed in the approved protected file is associated with the intended project, and that its owner/service account and endpoint permissions allow this project. Check the project is active and that Responses/input-token counting and gpt-6-astra are permitted. Correct the actual association/permission problem if found. A project ID alone does not show which project the installed key can access.

Approved credential file (never send its contents here):
C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key

Send only the non-secret finding and actual corrective action/time, plus any relevant project/key metadata description. If the authorized project ID itself must change, explicitly supply that corrected scope; it cannot be silently substituted. Do not provide an organization-admin key to this runner. If settings appear correct, use the captured request ID to ask the provider/account administrator to resolve the rejection; no support message has been sent on your behalf.

The checked local project environment fields and canonical .env have no non-secret project/organization metadata explaining the mismatch. The key was not decoded, printed, compared by content or restaged. Current evidence proves rejection of project context, not which account configuration is wrong, nor that the model is unavailable. A signature would not establish provider access or billing accuracy.

## Resume within existing authorization

The recovery gate is implemented and tested. Once the founder supplies a real same-project correction, record it using the prepared access-resolution.template.json, bind the diagnosticHash and nonSecretEvidenceHash, and sign through the established owner mechanism. Do not invent a correction or sign the blank template. The agent can do this serialization/signing from the founder's explicit factual report; no new spending approval is required.

```powershell
Set-Location C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028
$cli = 'packages/foundry/src/experiment/cli.ts'
$exp = 'var/foundry-bounded-028'
node $cli sign --file "$exp/access-resolution.completed.json" --key var/foundry-smoke-028/auth/owner.key | Set-Content -Encoding utf8 "$exp/access-resolution.signed.json"
node $cli resolve-access --root $exp --file "$exp/access-resolution.signed.json"
node $cli bounded-batch --root $exp --file "$exp/smoke-primary-1.json"
```

The first Astra admission performs its own mandatory token count and only then inference. Inspect its returned model, output contract, usage and accounting before the second smoke. Continue to the four-case baseline batch only after both smoke results pass transport checks. Each step is already covered by the signed envelope. An unchanged access failure stops further dispatch. No fallback or second Sol count.

## Billing evidence

The owner packet is var/foundry-bounded-028/reports/owner-access-and-billing.json. The current diagnostic retained 13 cents; two historical count failures retain 26 cents. There is no provider usage-based estimate, settled invoice or known actual charge. Obtain available project usage/cost evidence, associate the request ID/time, and determine whether failed counting has any charge and when it is closed. An aggregate project total alone may not support an exact per-attempt invoice. Do not release reservations or fabricate zero from a 401 response.

Official authentication reference: https://developers.openai.com/api/reference/overview
