# Design and acceptance: integrated workflow comparison

## Reuse map

| Required behavior | Existing implementation and narrow extension |
|---|---|
| Versioned business/task context and evidence | `lab/support.ts` plus `workflow/task.ts`: versioned brief, rights, material unknowns, costs/policies, explicit operational definitions, inherited draft when applicable |
| Durable finite workflow and interruption | `runtime.ts`, `state.ts`: opt-in pinned experiment callback, terminal-decision review and validated durable response recovery; original fixture behavior preserved |
| Strict prospective inference | `model-port.ts`, `experiment/token-count.ts`, `workflow/runner.ts`: complete-payload admission and four task schemas; model output controls decision, draft, review/revision and inspection |
| Aggregate admission/accounting | `experiment/ledger.ts`: existing atomic account with narrow per-workflow/per-arm allocations and supporting-count buffer; no new budget engine |
| Team assignment | Existing fixed analyst/operator/verifier slots mapped to one or two role identities; separate deterministic evidence-linked proposal in `workflow/task.ts` |
| Approval and effects | Existing `authority.ts`, `lab/fixture-service.ts`: scoped exact-payload grant, atomic reservation, idempotency, service identity, signed readback and reconciliation |
| Independent acceptance | Existing support economic/policy/coverage validator and authenticated fixture evidence, plus workflow report dimension checks; semantic judgments separately recorded |
| Review and analysis | New small `workflow/review.ts`, `analysis.ts`, `report.ts`; timed self-reported review, paired episode analysis, structured failures and experimental capability records |
| Entry point | `workflow/cli.ts`; original fixture CLI still refuses live routes and cannot resume an extension run |

No scheduler, orchestration framework, service installation, general team optimizer or management hierarchy was added. The business environment remains synthetic even when a future grant permits actual inference. Provider-neutral ModelPort remains the domain seam; only the proposed transport route is OpenAI-specific.

## Four-call allocation and fair treatment

| Call | Single-agent A | Two-role B | Actual input and output |
|---|---|---|---|
| 1 investigate | Workflow owner | Workflow owner | Business brief and unknowns → permitted evidence request; deterministic adapter performs the declared retrieval |
| 2 decide/draft | Same owner | Same owner | Full retrieved evidence and brief → choice, economic alternatives, reasons and actual draft |
| 3 review/revise | Same owner, explicit review step | Outcome verifier | Same facts/evidence, actual decision and actual draft → corrected artifact plus issues/changes/verdict |
| 4 inspect | Same owner, fresh inspection context | Outcome verifier, fresh inspection context | Actual approved/delivered artifact, receipt, authenticated readback, obligations and prior correction → inspection and supporting references |

No-action or blocked decisions use three calls: they still receive review, then end without approval/publication or an unnecessary post-effect call. A blocked review prevents completion/effect. Both arms have the same four-call ceiling; unused calls do not buy repeats. Investigation fetches declared evidence through the existing adapter; this is not a general autonomous tool-search benchmark. Inspection cannot authorize an action, waive deterministic checks or certify itself.

Both arms receive the excellent shared master procedure, the same full source corpus/tool rights and budget, the same correction opportunity, and the same outcome evidence. A and B have no access to the other arm's outputs, database views or reviews through ModelPort. The treatment is versioned role/procedure separation with a bounded handoff. Both receive fresh explicit context assembled from their own persistent state; no private model chain-of-thought is carried across calls. Consequently this is not a benchmark of persistent hidden memory. Added procedure tokens, provider timing drift, founder involvement and open case exposure are disclosed confounds. No specialization superiority is assumed.

Team proposals map requirements and dependencies deterministically. They name currently unqualified workers, cite Mission028's limited short-response evidence, identify missing human semantics/approval competence, and prefer a single worker until a separation benefit is demonstrated. The stored adaptive recommendation **cannot change** the fixed experimental assignment. No extra planner call or hidden judge is used. No role title is treated as a credential.

## Six developer-visible episodes

| Episode | Business purpose and permitted evidence | Expected operational outcome | Relationship / injection |
|---|---|---|---|
| W-001 | Retrieve current cost/policy and reduce repeated invoice-status work | Positive limited playbook, review, exact approval, one verified publication | Related to Mission027 viable economics |
| W-002 | Reassess changed benefits/costs using active policy rather than superseded material | Positive limited playbook supported by changed values | Same economic family; sensitivity case, not independent customer evidence |
| W-003 | Avoid intervention with negative modeled contribution | Reviewed no-action; no approval/effect | Rejection family |
| W-004 | Investigate unavailable current costs through the legitimate tool | Reviewed block identifying missing evidence; no effect | Evidence availability family |
| W-005 | Resolve authoritative policy conflict without inventing precedence | Reviewed block; no effect until policy resolved | Policy-conflict family |
| W-006 | Review inherited defective playbook and recover response loss after publication | Remove unsupported approval/payment guarantee, exact approval, reconcile one effect, inspect it | Disclosed injected draft, equal across arms; timeout is a fixture fault, not a model error |

Expected truth and lineage/seeding labels stay in evaluator data. Workers receive only the business brief, accessible records and actual inherited draft where relevant. The worker-visible policy explicitly defines pending status, refund-approval demand referral, prohibited guarantees/actions, correction and inspection reference requirements. It exposes coverage and arithmetic rules; there is no hidden D-014-style definition. The historical D-014 classification is unchanged.

Six episodes are related exploratory synthetic cases. They are neither a confidential holdout nor customer validation. The fixed counterbalanced order alternates the arm started first. Each run has fresh business, scope, service and artifact state. The experimental source/version hashes are pinned; no retuning after live outcomes under the same manifest is permitted.

## Acceptance, diagnoses and prospective analysis

Independent dimensions are decision correctness, mechanical artifact coverage, exact authority, observed fixture execution, obligations, simulated economic ledger, supported model inspection, and injected defect detection. Arithmetic/permissions/receipt identity/hash/effect count are deterministic checks. Keyword coverage is not semantic usefulness. Human semantic review separately assesses decision, usefulness, authority and status; missing review stays null. A syntactically valid model `pass` with an invented receipt reference cannot pass.

Failures retain symptom, actual attempt/event references, cause hypothesis separately from evidence, affected run, alternative explanation, regression risk and a smallest follow-up. Categories cover missing/inaccessible evidence, specification ambiguity, reasoning/policy, retrieval/tool, handoff loss, authority, uncertain effect, verification/false success, resources and human dependency. Intentionally blocked episodes and injected service faults are not attributed to model incompetence. No automatic procedure change, role promotion or certification occurs.

Frozen exploratory decision rules: evaluate six paired episodes, one observation per arm; no 42/48-call pseudo-replication. To advance a team hypothesis it must have at least five accepted episodes, at least one more than A, zero critical failures, and meet known cost/human/latency constraints. Per-workflow maximum active model latency is 720 seconds, human attention 900 seconds, with the signed budget governing cost. Missing authoritative charges or reliable human effort prevents resource qualification. Similar sufficient quality favors the simpler configuration. Team regression calls for coordination diagnosis. Shared failures require a common-prerequisite repair. Mixed or incomplete evidence produces an inconclusive decision and a specific smallest follow-up. Zero observed critical failures is not zero risk.

Live reviews are self-reported local inputs, not independently authenticated expertise or protected validation. AI assistance is disclosed and its timing excluded. Billing signatures bind evidence but do not establish its accuracy; closed provider/project charge evidence must substantiate settlement. The fixed count buffer stays held until a future explicit closed-account disposition; it is not silently released by per-attempt reconciliation.
