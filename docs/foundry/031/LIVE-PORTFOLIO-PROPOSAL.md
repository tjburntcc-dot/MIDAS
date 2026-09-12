# Bounded live portfolio proposal — Mission 031

Status: preparation only. The engineering release and mock transport tests do not authorize paid inference, token counting, communication, account access, signing, or deployment. This document describes the executable proposal API and candidate allocation. The final unsigned JSON, source hash, serialized first request, project binding, expiry, and owner approval reference govern any later approval.

The first live operating result should investigate two external business hypotheses, review the sourced findings, decide what to pursue, and execute useful bounded software or service work with observed tool feedback. The internal portfolio allocation task compares the evidence and opportunity costs. External hypotheses remain provisional; customer demand, willingness to pay, and commercial success are unverified. Reassessment can stop a weak direction. A completed local deliverable and customer acceptance must remain distinct.

## Proposed scope and amount

The current candidate is 35 work admissions and four hosted-search admissions, with a separate $4 token-count uncertainty reserve. Two permitted known-incomplete recovery admissions are held inside those 35 worker calls: ordinary work can consume at most 33, preserving two for qualified recovery. Each external venture has 17 work and two search calls; internal allocation has one work call. The final executive plan determines how to spend the available calls, while the signed per-venture envelopes remain hard limits. No study or specialist comparison calls are released by this package; an evidence-supported comparison would require a separate unsigned supplement.

| Admission class | Ceiling per admission | Count | Maximum reserved amount |
| --- | ---: | ---: | ---: |
| Work, planning, review and included bounded recovery | $1.23 | 35 | $43.05 |
| One-call native public web search | $3.00 | 4 | $12.00 |
| Separate uncertainty for token-count endpoint cost | — | at most 39 count admissions | $4.00 |
| Candidate total | | 39 inference admissions | **$59.05** |

The account maintains one inference/count pool and provider concurrency one across work and search. Four searches do not create four additional unmetered model steps. A worker decision requesting search is a normal work call; the search response is a separately admitted search call in the same account. Cost figures are conservative admission estimates, not billing settlement. A timeout does not establish that provider work or billing stopped.

The route is `gpt-6-astra`, reasoning `max`, default service tier, maximum 16,384 output tokens, 32,768 admitted input tokens and a 180-second inference deadline. The founder's attached goal explicitly requests Astra at the highest supported effort. The current model documentation lists `max`; the new portfolio route validates it explicitly while preserving the older adapter's frozen TypeScript interface. The reserve uses $12.50/M input as a conservative cache-write ceiling and $50/M output: `ceil((32768×1250 + 16384×5000)/1,000,000) = 123` cents. [Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)

Hosted search uses the native Responses `web_search` tool, `max_tool_calls: 1`, required tool choice, medium context, default return-token budget, external public access, and returned source metadata. Its additional 131,072-token context allowance is a conservative engineering buffer informed by the documented search context window, not a guaranteed billing cap. At the same token prices, the buffer plus admitted input and output computes to 287 cents, plus one cent for the search tool, within the 300-cent reserve. Out-of-envelope observed usage halts further dispatch and preserves exposure. [Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search), [API pricing](https://developers.openai.com/api/docs/pricing)

The token-count projection includes all input-bearing model, reasoning, instructions, tools, tool choice, and input fields. Generation/output-selection fields are removed only where unsupported by the count endpoint. The count endpoint price has not been established; the $4 reserve is explicitly separate and is not described as free counting. No token count or account/model-access probe has been made during preparation. [Input-token endpoint reference](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens)

## Exact preparation and authority path

`createPortfolioProposal({root,id,projectId,credentialFile,billingPublicKey,expiresAt,countUncertaintyMinor,recoveryAdmissions:2,ventures})` creates unsigned inner and outer payloads. IDs must use the new `portfolio-031-` prefix. Each venture binds the exact goal hash, capabilities, tools, permitted source-host envelope, and work/search counts. `recoveryAdmissions` defaults to zero when omitted; this package explicitly proposes two. Optional `billingPublicKey` contains the approved Ed25519 public verification key, defaults to null, and is frozen in the inner grant through the outer hash. It is never inferred from an old grant. `writePortfolioProposal(directory,input)` writes a new `portfolio.authorization.request.json` exclusively. Neither function reads credentials, signs, counts tokens, or calls a provider.

The CLI's offline `propose` command also writes the serialized first Responses body, its count projection, and a payload audit. Review that directory after all engineering changes: the outer implementation hash covers portfolio executable assets, their transitive local module imports, and the underlying operating implementation, so source changes invalidate old proposals. Review the concrete project ID and credential-file pointer without opening the credential. A credential path is only a configured pointer; account access and model availability remain unverified until authorized use.

After explicit approval of the exact proposal hash, finalize matching `approvedBy` and `approvalReference` on both payloads, set outer `approved: true`, recompute `operatingGrantHash` from the final inner payload, and sign both with the approved owner key. Runtime shape:

```ts
{
  payload: portfolioGrant,
  signature: portfolioSignature,
  operatingEnvelope: { payload: operatingGrant, signature: operatingSignature }
}
```

`loadLivePortfolio(root,store)` reads the new `portfolio.authorization.json` and `auth/portfolio-owner.pub`. It verifies both signatures against the trusted public key and checks root, host, local profile, code, project, account scope, expiry, route, procedures, exact goals, tool/capability envelopes, stage allocations, count allowance, and aggregate exposure. It rechecks active authority and implementation before dispatch. It returns guarded `worker`, `search`, `totals()` and read-only recovery evidence; the CLI obtains live ports through this loader. Existing historical grants, conditional experiment calls, and test keys confer no new authority.

The ordinary worker uses the preserved OperatingModels and ModelLedger admission/transport path. Hosted search uses that same ledger. Requests and dispatch intentions are durable before transport; responses and costs retain explicit provenance. Mock transports are explicit injected dependencies and never fall through to a real provider. The source code's local profile binding prevents silent relocation; it is not a substitute for remote user authentication.

## Billing reconciliation

The loaded wrapper exposes `reconcileBilling({statement, signature})`. It requires the public billing key explicitly bound in the approved inner grant and delegates to the existing `ModelLedger.reconcile` contract. The signed `closed_attempt_invoice` must identify the exact provider project, inner authorization hash, account scope, attempt, original request hash, known provider response ID where available, actual USD amount, underlying evidence SHA-256, issuer, and closure time. An identical statement is idempotent; a conflicting settlement, wrong scope, or invalid signature is rejected. Only that attempt's reservation is released, its actual amount is recorded, and an overage halts the account. The separate token-count uncertainty reserve is not automatically released.

Use `loadLivePortfolio(root,store,{purpose:'billing'})` for reconciliation after execution expiry. This mode still checks both signatures, code, root, host, profile, project, and accounting bindings. It rejects worker and search execution and does not read provider credentials or make requests. An expired execution grant therefore does not prevent later closed-attempt accounting at its authorized location. Grant relocation and cross-account carry remain separate unresolved migration requirements.

A signature authenticates the party authorized to issue the statement and protects its contents. It does not make inaccurate billing data true. The issuer must inspect actual records from the bound provider project, retain those records as evidence, and establish that the named attempt is closed before signing a statement. Owner-issued reconciliation is appropriate only when the exact approval names that public key and that evidence responsibility; an existing owner key is not automatically billing authority. No real billing key or statement is created or signed by this engineering preparation, and no provisional estimate is promoted to settled cost without the signed evidence path.

## Failure, recovery and completion criteria

There are zero blind retries. Unknown transport outcomes, missing usage, credential/access errors, and uncertain token counts do not qualify for fresh recovery. They preserve reservations and require reconciliation. The outer portfolio grant permits at most two `known-incomplete-v1` recoveries inside existing work caps: only a durable response with matching provider model/ID, status `incomplete`, observed valid usage and provisional cost qualifies. The engine must persist an explicit recovery intent linked to that parent before a fresh identity can be admitted. The recovered request preserves task, schema, tools, model, procedure and original context, adding only the pinned concise-completion instruction. One parent can have one recovery; a recovery cannot itself be recovered. The immutable portfolio link joins both attempts in account evidence without enabling the legacy experiment's separate recovery scope.

The first admitted task is an operational smoke test for the actual route and strict schema, followed by useful sourced investigation if successful. An API access or model support failure stops paid progress in that account; no cheaper model, fixture, second account, or silent provider fallback replaces it. The finite 180-second/max-effort combination can produce incomplete or uncertain responses; the amount reserves consequences without promising success. Owner follow-up should contain the exact observed failure and remaining exposure.

Acceptance is an inspectable live result chain: sourced findings and contrary evidence; reviewed business decisions with assumptions visible; executable tasks; source revisions responding to actual check failures; checks against unchanged trusted acceptance; usable current preview/download; tracked delivery obligations; and an observation that changes subsequent work or allocation. Report development-assistant implementation, offline mock behavior, actual-model work, actual costs, and customer outcomes separately. No specialist advantage or customer traction is implied by passing local tests.

This package covers permitted public research and owner-supplied data, local development, report preparation, review, and local delivery. External messages, recipients, publication, transactions, spending outside the model account, customer promises, and remote deployment need their own concrete authority. Commercial preparation can continue up to that boundary. The remote transition and remaining deployment requirements are documented in [REMOTE-CONTINUITY.md](REMOTE-CONTINUITY.md).
