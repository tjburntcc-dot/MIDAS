# First measured role experiment: F2 handoff

Mission 027 establishes engineering behavior with deterministic fixtures. It contains **no actual-model evaluation, role improvement finding or worker certification**. The architecture's proposed follow-on Mission 018 number already belongs to repository work. Proposed next allocation is `MIDAS-FOUNDRY-ROLE-BASELINE-V0-028`, subject to rechecking the registry/mission files immediately before that mission starts. This document prepares that mission; it does not execute it or reserve spending.

## One role and one bounded task

Evaluate the **operator** on producing a billing-status support response/playbook from an authorized case brief, current policy documents and invoice-status evidence. The output must answer the case, cite the relevant evidence, preserve uncertainty, avoid unauthorized account/refund promises, and escalate when required. The environment independently checks the artifact; model assertions never count as completion. Keep analyst opportunity selection and learning promotion out of the treatment so this first comparison measures one role.

Use new rights-cleared or purpose-built cases, including missing evidence, superseded/conflicting policy, misleading retrieved instructions and cases requiring escalation. Repository-visible Mission 027 tapes/tickets are development examples and **cannot be held-out cases**. No Protocol-010 material enters this population.

The strong baseline receives a carefully developed general task instruction, full authorized case context, the same current policy/retrieval capability, output contract, business overlay, time/token/attempt limits and evaluator acceptance definition. Tune it on development cases with effort recorded; do not give it a deliberately weak prompt or obsolete model. Freeze one current supported model snapshot after access, capability and pricing verification. Choose the least expensive configuration expected to meet the frozen quality target, while retaining a credible strong baseline. Any stronger model/effort escalation must state its unresolved criterion and expected benefit; Max/Ultra require user approval.

The specialization changes only the versioned operator procedure/checklist derived from diagnosed development failures (for example, evidence checks and escalation sequencing). It cannot change evaluator truth, acceptance thresholds, tools, grants, held-out context, model identity or budget. Compare baseline versus specialization on the **same model** to identify a procedure effect. If a different model is later used, report that as a separate comparison. A more expensive procedure must justify its correction-time/quality benefit, with uncertainty.

## Protect cases and freeze the decision

Before exposure, a separate evaluator/custodian creates immutable, rights-reviewed development, validation and final-test manifests, deduplicated by case family and company/policy lineage. Hash the actual case and label artifacts, record split rules, disallow near-duplicate leakage, and restrict final labels and item-level test feedback to the evaluator. Worker contexts contain the task facts they need; scenario IDs that encode a preferred answer, reference outputs, grader prompts and acceptance labels are withheld. An opaque request ID is allowed. Do not infer hidden truth from a tape name.

Development can guide candidate changes. Validation selects a frozen candidate. Final evaluation runs only after the baseline, candidate and scoring artifacts are frozen. No final-set optimization or silent rerun after seeing results. Repeats from one case are clustered observations, not independent cases. Log contamination incidents and invalidate the affected inference. Because local application checks do not defeat the same OS user's arbitrary file access, a real protected final set needs a separate evaluator process/account or controlled storage outside worker access; specify that boundary before evaluation.

The architecture suggests 60 independent cases × 3 repeats × 2 configurations = 360 episodes. That is a **proposal**, not an accepted sample size or budget. Freeze the following before running it:

| Choice | Required explicit decision |
|---|---|
| Population and split | Case sources/rights, workflow, company/policy clusters, inclusion/exclusion and deduplication |
| Primary outcome | Exact task acceptance rubric and how missing data/escalation count |
| Critical failures | Unauthorized action/promise, data leak, policy error, fabricated evidence; stop rules and admissible rate |
| Quality threshold | Minimum acceptable quality and practical baseline-versus-candidate difference; confidence/uncertainty method |
| Cost and time | Per-attempt and aggregate currency caps; output/input token limits; latency and correction-minute targets |
| Sample and repeats | Number of independent cases, repeats, randomization, failed/aborted attempt handling and final reserve |
| Human evaluation | Named qualified reviewer/custodian, calibration rubric, blinded output order, time measurement and disagreement procedure |
| Candidate and baseline | Exact role/prompt/model/tool/policy hashes, decoding settings, allowed retry policy and development effort |
| Promotion | Who may authorize it, evidence required, rejection/inconclusive rules, rollback condition; no certification implied |

Record every attempted episode, including failed, incomplete, refused, invalid-schema and abandoned calls. Capture scoped case/request IDs; model/provider/snapshot/settings; role, tools, context and policy hashes; input/output/cached tokens; request ID and latency; provisional versus invoice-reconciled currency cost; retrieval/action costs; retries; independent acceptance result; critical failure class; reviewer identity and measured correction minutes. Keep aggregate provider exposure, per-accepted-outcome cost and founder labor separate. If no output passes, cost per accepted outcome is undefined. Synthetic savings never become collected revenue.

## Supported model bridge and required access

`packages/foundry/src/model-port.ts` exports `responsesModelPort(options): ModelPort`. It uses the supported OpenAI Responses HTTPS endpoint, strict `text.format` JSON schema, `max_output_tokens`, `store: false`, scoped requests and an abort deadline. Those API fields and usage semantics were checked against the official [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). Compatibility with a chosen actual route still needs an explicitly authorized smoke test. No provider SDK installation is needed for this transport.

The transport keeps administrative scope/request identifiers in local accounting;
only the authorized task/context/tool descriptions are serialized into model input.
The Mission 027 CLI intentionally admits only fixture ports. To connect a live route in the follow-on harness:

1. Obtain explicit authorization for the API project, permitted model snapshot, data transmission, episode count and currency cap. A Codex/ChatGPT subscription is not assumed to provide API credit. Supply a valid project-scoped API key via a trusted credential callback; never put it in `context`, a role artifact, a fixture credential, a report or version control.
2. Supply a frozen `ResponsesRoute`: `authorizationId`, exact `model`, positive `maxOutputTokens`, `deadlineMs`, `inputTokenCeiling`, `maxCallCost`, plus source/effective date and nonnegative integer USD-minor-unit rates per million input/output tokens. No prices are invented or frozen here. Require exact returned model identity; do not silently accept an alias change.
3. Supply a provider-compatible `countInputTokens(body)` covering all transmitted content and schema/instruction overhead, with a conservative margin. It must refuse input above the admitted ceiling **before credential access, reservation or transport**. A guessed character count is not adequate for a monetary cap.
4. Supply `schemaForTask(task)` and `validateOutput(task, output)` from the frozen task contract. Every object in a strict schema must disallow undeclared properties and comply with the route's supported JSON-schema subset. Schema compliance alone is not domain acceptance. The support environment's `validateDecision`, `actionFor` and `verify` show the separation between model output, policy and independent observation.
5. Implement the trusted `ModelBudgetPort` over a separate evaluation ledger, reusing the existing atomic reservation pattern. `reserve(request, amount, requestHash)` atomically claims `(tenant, business, run, requestId)`, checks the aggregate cap, and rejects duplicate pending attempts; changed bytes cannot reuse the identity. `settle` records observed usage as provisional and **retains exposure until authoritative billing reconciliation**. `uncertain` preserves the reservation and records why; it must not release funds or trigger retries. All callbacks must be durable/idempotent. The fixture action `Authority` must not be reused as a model grant by inventing an approved business proposal.
6. Use `responsesModelPort` from a separately authorized evaluation harness with the same `ModelRequest`/`ModelResult` domain contract. Pin the real model in the role and provide a unique locally recorded request ID to the port for each admitted attempt. This ID binds the local budget ledger; it is not a provider idempotency key and is not transmitted in the HTTP request. The returned provider response ID is recorded separately. Keep `scope.mode: 'fixture'` when operating on synthetic cases: the ModelPort's `kind: 'live'` labels inference source independently of business environment. The current roles remain unqualified fixtures; running an experiment confers no qualification. Do not bypass the current CLI guard or replace fixture reports with live-looking ones.
7. Run the offline bridge tests first. Once access/budget is approved, perform one clearly labelled smoke attempt, log actual usage and validate the route before releasing the preregistered experiment budget. No automatic retry or fallback is implemented. After an abort the provider may still process/bill; retain the exposure. Unsupported/mismatched responses fail without accepted output. Valid token usage with invalid task output remains a billable failed attempt, not a second unknown settlement.

Required monetary reservation per attempt is:

```text
ceil((inputTokenCeiling × inputMinorPerMillion
    + maxOutputTokens × outputMinorPerMillion) / 1,000,000)
```

The implementation computes that with integer arithmetic and refuses it if it exceeds either the request or route cap. It ignores possible caching discounts in the maximum. Reported token-based cost stays provisional until reconciled; unknown usage stays unknown. Exceeding the admitted provider usage limit does not settle/release the reservation. This models bounded admission and honest uncertainty, not a guarantee that an external provider can never bill unexpectedly.

**Exact next input:** one approved F2 experiment specification containing the selected operator task/case source and data rights, the baseline/candidate/rubric/split decisions above, a named evaluator/custodian, the API project's authorized route and credential-access method, sourced rates, token/deadline limits, maximum smoke/experiment currency exposure, and available measured reviewer time. If these are unavailable, continue preparing rights-cleared development cases and evaluator tooling; do not run a paid or protected final evaluation.

Mission 027 used no real route, no smoke call, no customer data, no paid installation and no shared-infrastructure change. Its learning promotion/rejection/rollback results prove mechanics only; measured improvement requires the independent model-driven comparison just described.
