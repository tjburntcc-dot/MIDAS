# Mission 031 R4 — bounded stage contracts

Status: local repair and offline verification; no new provider request, signed authority, retirement or live outcome is established by this document. The exact proposal and completion receipt accompanying this document govern the proposed execution identity.

## Failure and scope

R3's two Responses jobs reached terminal `incomplete` with `max_output_tokens`. Their 16,384-token ceilings included 14,916 and 14,130 reasoning tokens respectively. Neither partial JSON response is a build decision. The older R2 request has no persisted response identity and remains unknown. All three reservations remain retained. A terminal incomplete answer and an unknown provider outcome are different facts even when the task controller needs reconciliation in both cases.

The build gate selected the generic executive planner procedure, provider schema, validator and consumer. That contract requested multiple alternatives, claims, capability recommendations, tasks and cancellations. The linked recovery retained it. A request to finish concisely did not remove those obligations. Generic planning context additionally supplied historical queued task IDs and broad observations. The product profile also retained separate publication/closure budgeting after the controller had acquired bounded finalization.

R4 replaces this behavior prospectively. It does not salvage either partial answer, alter original acceptance, or make the historical tasks look completed.

## Executable changes

`stage-contracts.ts` defines five explicit contracts. The engine selects their exact procedure, schema, validator, tools, role version and per-call reservation. The signed task/route allocation enforces the same contract. Legacy tasks continue to use their historical implementation contracts.

| Stage | Model responsibility | Deterministic consequence |
|---|---|---|
| Build gate | One build/stop judgment about the already-researched declared engineering prototype; rationale, strongest alternative, evidence references and blockers | Validate structure and reference membership; atomically record the decision. Stop cancels only this continuation's reachable declared descendants. It creates no tasks or portfolio ranking. |
| Product build | Author source from blank, inspect actual browser feedback, correct consequential defects and submit current-source judgment | Contained source operations, fixed checks, stale-version rejection and bounded finalization |
| Product review | Assess the actual authoritative source and checks; change it only when justified; inspect checks after any change | Review replaces the authoritative version, invalidates stale checks and publishes only the checked current version |
| Operating delivery | Write a usable operating packet grounded in the reviewed product and accepted evidence | Exact source references, service/profile checks, local publication and authenticated readback |
| Outcome review | One evidence-grounded continue/revise/stop recommendation, limitations and one next action | Record a bounded recommendation; no task creation, reprioritization, certification or external execution |

The gate remains genuinely able to reject the engineering assignment. Lack of interviews alone is not a mandatory rejection: the worker must distinguish an engineering experiment from a claim of commercial demand. Conversely, the existence of an implementation adapter does not justify a build.

Context assembly retains source identities, authorized evidence, authenticated dependencies, current source, rejected repair targets and manifest-bound tool observations. Administrative task lineage stays in storage. Actionable identities come from the current continuation, not the 18 historical queued tasks. Planning stages do not receive tool-completion instructions. Build/review/delivery see the actual bounded-finalization semantics in both their procedure and product profile.

A cross-stage regression reproduced a separate local blocker: the accepted 17,908-byte brief plus the new compact decision exceeded an old cumulative 18,000-byte handoff test before build could start. R4 preserves the **per-artifact** 18,000-byte report rule and the existing **aggregate** 72,000-byte context ceiling. It does not enlarge authored reports, truncate research or change historical acceptance. Every R4 task binds the same authenticated accepted-research artifact; current decisions and delivery evidence accompany it within that aggregate ceiling.

The full-chain audit also found that a report with a manifest could be mistaken for a second product-review target. Product review now selects the single bound software artifact, while retaining the research as evidence. For operating delivery and reassessment, an overflowing context first omits the redundant upstream DOM projection, then compacts passed upstream checks to their IDs and verdicts. Failed-check explanations, actual source, complete research/report content, identities and obligations remain. Full check evidence stays in authenticated delivery; product review itself still receives actual current browser observations. Unicode character bounds now agree with the provider schema's code-point counting; independent UTF-8 source/context byte limits are unchanged. Prospective tool schemas explicitly encode unused null arguments, relative-path syntax and valid patch modes.

`complete` remains a substantive worker submission. Its reason must explain fitness, review changes and unresolved limitations. The controller performs checks, local publication, authenticated readback and closure; it cannot infer semantic usefulness from publication. Software publication requires that the worker has received the current browser check. No extra inference is bought merely to authorize a local publication already in scope.

## Capacity and exposure

All proposed calls use direct OpenAI Responses, `gpt-6-astra`, **Max** reasoning and default tier. Input admission covers the complete serialized request and remains at 32,768 tokens. Output ceilings cover reasoning **and** the complete final JSON, including source text.

| Stage | Ordinary admissions, maximum | Output tokens/call | Reservation/call | Stage ceiling |
|---|---:|---:|---:|---:|
| Build gate | 1 | 24,576 | $1.64 | $1.64 |
| Product build | 5 | 32,768 | $2.05 | $10.25 |
| Product review | 4 | 32,768 | $2.05 | $8.20 |
| Operating delivery | 4 | 24,576 | $1.64 | $6.56 |
| Outcome review | 1 | 24,576 | $1.64 | $1.64 |
| **Total** | **15** | — | — | **$28.29** |

The lower ceiling leaves 9,660 output tokens above the larger observed R3 reasoning use, compared with 1,468 previously. The new gate's whole answer is bounded to a few thousand characters instead of a portfolio plan. Build and review receive a full 32,768-token output ceiling to accommodate both reasoning and source corrections. These comparisons explain the allocation; they are not forecasts of future reasoning use. Reasoning may expand, and a shorter schema or larger cap cannot guarantee completion.

OpenAI's reasoning guide describes the shared reasoning/final-output limit and suggests initially allowing at least 25,000 tokens while measuring workload. The 24,576 smaller-stage cap is a deliberate budget tradeoff slightly below that general starting suggestion, based on this observed reasoning workload and the bounded answer contract. Max is retained rather than silently reduced. [Official reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)

Official Astra pricing lists $10/M input, $12.50/M cache writes and $50/M output; the reservation uses the larger $12.50 input rate conservatively. Thus `ceil(100 × (32768 × 12.50 + 24576 × 50) / 1000000) = 164` cents; substituting 32,768 output yields 205 cents. These are admission reservations, not billed charges. Source checked during R4 preparation on September 13, 2026. [Official Astra model and pricing](https://developers.openai.com/api/docs/models/gpt-6-astra)

Historical retained exposure is $17.53: $13.53 of inference reservations and the existing single $4.00 unpriced count/retrieval buffer. New $28.29 plus history equals the existing $45.82 ceiling. The buffer is not allocated again. Historical provisional token-based costs total $5.74; authoritative settlements are unavailable. Reservations cannot be released from estimates alone.

There are at most 15 new count requests and no hosted search, no new recovery inference, no fallback or task-cap borrowing. A build can finish in write/check/complete, leaving two calls for one consequential repair and recheck. Review can finish check/complete, or check/repair/recheck/complete. Delivery can finish write/complete, or write/failed-finalization/repair/complete. These paths are ceilings, not required activity. A defect requiring more capacity may stop the run; this tradeoff buys capacity per answer instead of preserving a misleadingly high call count.

Durable background execution is retained: `store:true`, prompt response-ID persistence, bounded same-ID GET retrieval and no automatic replacement POST. The 60-second create acknowledgement deadline, 15-second retrieval deadline, 15-minute completion window, 24-hour same-ID resume window, 240 GET limit per response and three consecutive read-error stop remain explicit. New aggregate retrieval ceiling is 3,600 for 15 admissions. A lost creation acknowledgement before ID persistence remains unknown, retains exposure and cannot be blindly resent. Provider retention of at least 30 days remains part of the approval. Count/GET price uncertainty remains within the existing buffer; a local ledger is not an external billing guarantee.

## Evidentiary limits

Regression inputs preserve the two incomplete R3 answers as failures. Offline tests validate request construction, schemas, references, stop propagation, task isolation, source/check handoffs, finalization and accounting boundaries. They do not prove a future Astra response will fit, demonstrate improved model competence or establish commercial demand.

The accepted 17,908-byte research artifact remains unchanged and authenticated. R4 buys neither a replacement investigation nor an operator interview. If approved, the new gate decides whether to continue into runtime source authorship, actual browser testing, review, operating delivery and reassessment. The prepared interview remains a separate, unsent commercial opportunity.
