# Mission 031 contract and product readiness review

Read-only review of the unsigned `portfolio-031-integrated-build-v3-r2` packet and the portfolio implementation on September 12, 2026. This reviews the proposed next execution; it does not establish actual-model success or customer usefulness. No provider, token-count, credential, billing, or external tool request was made. Only this review file was written during the critique.

The integration owner is implementing a separate `quote-to-job-v2` profile and related v4 fixes in response. Those changes need their own fresh verification and proposal; findings below describe the reviewed v3 contract and must not be read as approval of an unfinished v4 implementation.

## Exact packet and call allocation

Reviewed files under `var/portfolio-031/proposal/portfolio-031-integrated-build-v3-r2/`:

| File | SHA-256 |
| --- | --- |
| `initial-responses-bytes.json` | `1e1c5d3c7a9ff543e71ea9f9108634e29e1af7403d4a279e1667f7e3fd6860d9` |
| `task-manifest.json` | `f8bebd951edbcd950f71532c3a90e66e3823c09474e5e00583e97e4f3d1c03c1` |
| `portfolio.authorization.request.json` | `d25d6922be2b689a8a36377e68e62be20cdebdd44034746e27a0dc4d6a19e599` |

The first Responses body is 14,041 UTF-8 bytes. It requests `gpt-6-astra`, `max` reasoning, 16,384 output tokens, strict structured output, and one `tool`, `complete`, or `blocked` action. It supplies the research objective, eight remaining ordinary decisions, a blank report manifest, the report format, source previews, and explicit argument/null rules. It is a prepared body, not a sent request or a provider count.

| Stage | Ordinary decisions | Minimum delivery overhead |
| --- | ---: | --- |
| Investigate | 8 | Write + check + publish + complete = 4; discovery, reading and repairs share the other 4. |
| Decide | 1 | One structured plan, including the exact `quote-to-job` alternative gate. |
| Build | 10 | At least write + check + publish + complete. |
| Review | 6 | Read if needed + optional correction + check + publish + complete. |
| Operate | 6 | Write + check + publish + complete; limited extra reading/correction. |
| Adapt | 1 | One structured plan. |

There are 32 ordinary decisions, two separately held known-incomplete recoveries, and two hosted-search calls: 36 maximum inference/count admissions. Task `resource.modelCalls` includes recovery headroom; it is not extra ordinary authority. Search consumes a worker decision to request it plus its separately metered search operation. Two searches and two fetches use all four research discovery decisions, leaving no repair or additional source-chunk read. A failed check followed by edit/recheck needs two more decisions. The existing one-action boundary should remain; explicit remaining counts and a sensible delivery reserve are preferable to hidden batching.

## Material defects in the reviewed contract

| Priority | Evidence and likely failure | Focused correction |
| --- | --- | --- |
| P1 | `SOFTWARE_FILE_CONTRACT` lists some selectors, while `checkQuoteApplication()` additionally requires `#notice` containing `Ready`, `#add-line`, `#quotes article`, `#quotes h3`, and `[data-status]`. Valid source written to the disclosed contract can time out before meaningful checks. | Put the complete harness contract in one versioned profile visible before the first write. Prefer explicit readiness state over an undisclosed English string. |
| P1 | The checker requires the exact string `$25.50` and a particular quoted CSV substring. These impose formatting and column-order rules beyond the advertised customer job. | Compare money semantically and parse CSV with disclosed headers/escaping. Keep exact customer, status and integer-cent values as the invariant. |
| P1 | The journey checks one valid quote, one completion transition, reload and CSV. Persistence checks omit the work descriptions. No second-record preservation, reopening/editing, invalid inputs, full job progression, fresh browser context, or narrow layout is established. | Extend the same bounded customer journey: complete quote readback, stable IDs, reopen/edit without duplication, two records, rejected invalid writes, all job states, fresh-session restore, and usable desktop/narrow geometry. |
| P1 | Failure output is a generic journey error plus numeric checks. The worker cannot inspect what rendered, which control is missing, a disabled button, validation feedback, or browser script errors. | Return bounded, manifest-bound rendered text, controls, visibility/geometry, console errors, and the failed action. Retain screenshots separately with references. Text/DOM observations are useful; they are not model vision. |
| P1 | `operate-v3` requests an offer/rejection, demo steps, interview questions, unsent outreach, economics assumptions, stop criteria and artifact hashes. `checkServiceBrief()` and `renderServiceBrief()` know only generic observations/recommendation/unknowns/obligations. Sensible extra JSON fields can pass but disappear from the rendered report. | Declare exactly where each requested section belongs and render it. A small operating-packet extension or explicit rendered generic-field placement is sufficient; avoid a new document framework. |
| P1 | The 18 KB report and 24 KB software handoff limits are instructions, but ordinary checks/publication do not enforce them. A passing product can block only when its downstream task assembles context. | Make the applicable handoff limits trusted checks in the new profile before publication. Preserve legacy profile behavior/history. |
| P1 | `engine.context()` includes full dependency software files and can then include the same full file again after `workspace.read`, plus repeated complete check evidence in `revisionEvidence`. Near the advertised 24 KB boundary, JSON escaping, contracts, checks and repeated source can exceed the 56 KB context limit. | Supply current source once with hash/location references. Bound repeated check/DOM evidence. Exercise the maximum supported source and report sizes through review and operate context, not only initial preparation. |
| P2 | `validateQuoteState()` enforces exact keys, quote/line count limits, string limits, unit/total bounds and 512,000-byte state size absent from the visible software contract. Worker schema permits 160-character paths, while tools allow 150 and a narrower ASCII pattern. | Expose the enforced schema and local file rules once through the profile/tool contract; align visible limits with validators. |
| P1 | `renderPreview()` loads only `app.html`. Other stored CSS/JS files are not served, but the old contract only says ordinary source files. A normal multi-file app fails under the sandbox CSP. | Explicitly require self-contained `app.html` with inline CSS/JS for this profile. A general asset-serving subsystem is unnecessary. |

Sources: [task-preparation.ts](../../../packages/foundry/src/portfolio/task-preparation.ts), [preview.ts](../../../packages/foundry/src/portfolio/preview.ts), [tools.ts](../../../packages/foundry/src/portfolio/tools.ts), [products.ts](../../../packages/foundry/src/portfolio/products.ts), [engine.ts](../../../packages/foundry/src/portfolio/engine.ts), and [worker.ts](../../../packages/foundry/src/portfolio/worker.ts).

## Provider admission and version boundaries

`live.ts` enforces fresh outer/inner signatures, implementation/procedure hashes, exact task-definition hashes, per-task ordinary allocations, aggregate allowances, and separate recovery links. The unsigned packet cannot authorize execution. The prepared route and stated financial ceilings were inspected as configuration; pricing, access and provider counts were not independently queried.

Two deterministic failure paths need clean classification. After its last ordinary decision chooses a tool, the engine can attempt another ordinary call using local recovery headroom. The live adapter rejects the frozen task cap before dispatch, but the generic engine catch records uncertainty. Likewise, an invalid `research.read` source/offset throws despite having no external effect. Stop ordinary exhaustion before admission and preserve deterministic local failures as known observations. Do not create an unresolved reservation for a proven pre-dispatch rejection; retain uncertainty when dispatch may have occurred. The two held recoveries are for the declared known-incomplete protocol, not semantic mistakes or routine extra work.

`taskDefinitionHash()` deliberately excludes the runtime-selected authoritative artifact ID and mutable execution state. Exact artifact versions and evidence digests are enforced separately during execution. The source manifest is descriptive; source hashes are not part of the frozen task allowance hash. `previewRequest()` also pins execution source/procedure state. Therefore repair the initial evidence before preparing fresh v4 task IDs/workspaces and exact first-request/count bytes. Reusing prepared v3 execution state after source repair can stale the first action or preserve an old workspace/profile. Preserve the v3 packet as history; do not re-label it as the new contract.

The reviewed initial corpus contains developer-written Astra, Checkly and Feedly summaries alongside founder context, not primary quote-to-job buyer evidence. Its authority sentence also describes an earlier no-paid-runtime state. Initial-evidence repair is independently assigned. Runtime authority must come from the new signed envelope, while source text remains attributed evidence rather than permission.

## Product acceptance and provenance

A useful local prototype should let an owner understand its purpose, enter actual work, see a correct total, save/reopen/edit without losing another record, progress a job, return in a fresh session, and obtain a faithful CSV. Invalid entries should leave persisted state untouched and explain what to fix. Empty state, labels, readable narrow layout and visible error/success feedback are part of that concrete job.

Those are mechanical and observable usability requirements. They do not prove buyer demand, a useful commercial offer, pleasing visual design, causal interpretation, or independent review. A screenshot retained but never supplied to a vision-capable reviewer does not establish visual inspection. A same-model correction is baseline self-review. A separately labeled development-assistant reference implementation is a demonstration and test aid; it must not be inserted into a live blank build or counted as actual-model authorship.

The focused release boundary is a versioned quote-product profile, explicit report placement, actionable bounded browser observations, and clean budget/version handling. Readiness requires the integration owner's actual regression results and a fresh reviewable v4 proposal. This source critique alone does not satisfy those checks.
