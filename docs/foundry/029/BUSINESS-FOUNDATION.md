# Governing objective and implemented business loop

MIDAS's product is an adaptive business-building system. The workbench is its interface. Its connected loop is: maintain evidence-backed business understanding; identify valuable bottlenecks and actions; construct the smallest supported team; develop workers through observed weaknesses and fair comparisons; execute within authority; verify operational and economic outcomes; revise understanding, priorities and assignments.

This objective governs the foundation added after the closed Mission 029 laboratory. The completed W-001 and W-006 observations, signed grants and spending limits are unchanged. This increment authorizes no provider activity, customer action, production qualification or protected evaluation. Support is a replaceable acceptance adapter, not the business ontology or product market. The invoice proposal remains a proposal.

## What is implemented and who decides

| Component | Concrete contribution to the loop | Decision owner and limits |
| --- | --- | --- |
| `business/core.ts` business revisions | Persists goals, business stage, dimensions, sourced claims, rights, authority, constraints, work candidates and worker catalog. Immutable revision records link predecessors; concurrent stale writes fail. | Human-owned local brief ingestion. Facts, assumptions, unknowns and hypotheses remain separate. Source declarations are not automatic truth verification. Completeness is always partial; dimensions are extensible, not a complete ontology. |
| Freshness and supersession assessment | Excludes expired, future-dated and superseded claims from required current facts; exposes uncovered dimensions and missing evidence. | Rules. No autonomous business discovery, contradiction resolution or external freshness monitoring. Conflicting assertions need a human-specified resolution/supersession; no model confidence can settle them. |
| Bottleneck assessment | Links every supplied diagnosis to claims, exposes assumptions and missing facts, compares eligible net-value estimates under the same declared value unit/horizon/currency, and permits blocked or no-action outcomes. | Rules over supplied candidates. Does not establish causal diagnosis or discover the globally highest-value bottleneck. Unknown value is null, never zero. |
| Work plans and assignment | Pins a business revision, task dependencies, competencies, role procedures, acceptance criteria and adapter. Searches at most 12 supplied workers for the smallest feasible set under stage, availability, evidence, tools, effect constraints and estimated resource cap. | Rules. Independent passing evidence ranks ahead of assisted live evidence; fixtures do not establish measured competence. An observed competency failure excludes that worker for the requirement. Experimental unknowns require explicit `allowExperimental`. Role titles confer no evidence. The result is a proposal, not execution authority or proof of optimal allocation. |
| `business/support-adapter.ts` execution bridge | Binds one plan to one fresh scoped runtime root and passes business understanding, bottleneck and work plan into all four stage contexts. Reuses existing finite workflow, ModelPort admission, exact approval, fixture service and readback. | Current integration is offline-only and accepts the unchanged single baseline procedure and exact supported task contract. A different proposed team/job blocks with an explicit adapter error. It is not silently run as the single support worker. Existing live workflow stages are model-controlled; this increment demonstrates them with mocks only. |
| Approval and runtime | Existing exact-action approval remains separate from model spending. Failed attempts, uncertain effects and persisted responses retain the original recovery semantics. | Human-owned action approval. Explicit `demo` uses visibly labeled fixture-demo principals, not fabricated human approval. No credentials are read by the mock path; a live root is rejected before dispatch. |
| Verified feedback | Reads actual run state, authenticated fixture receipt/readback and independent checks. Writes acquired evidence, operational facts, costs, obligations, failure observations and provenance back to persistent business memory exactly once. | Deterministic adapter checks. Mock outcomes stay mock. Delivery does not establish economic benefit, semantic acceptance, human correction time or worker qualification. Unknown effects cannot become successful feedback. |
| Adaptation | Completed opportunity fingerprints prevent repeated execution; changed task/economics create a different fingerprint and require reassessment. New business revisions can change priorities and teams; unstarted stale plans cannot bind. Existing bound work keeps its version pins. | Rule-based reassessment, human-owned business revisions. No background scheduler or automatic new spending. Acquired facts remain source-scoped observations; promoting them into a broader current business assertion requires an explicit revision. |
| Controlled improvement | Failures create diagnosis records separating symptom from hypothesized cause. A procedure candidate requires an assigned agent, a referenced observed failure, a changed procedure, an intervention hypothesis and regression risk. Preparation freezes both procedures and one shared comparison specification with disjoint development/validation IDs. | Human/developer-owned candidate and comparison preparation. Baseline instructions remain intact. These APIs execute no comparison, adopt no procedure and certify nobody. Existing evaluation harness remains the execution seam for a separately authorized experiment. No benefit is inferred from a mock comparison. |
| `business/cli.ts` status and report | One local command path presents knowledge, gaps, bottlenecks, assignments, checkpoints, verified outcomes and controlled adaptation together. | Readable inspection interface; not the product objective itself. Local principal scope checks are not multi-user IAM or a confidential evaluator boundary. |

## Runnable command path

From `C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-029`, with installed Node 24:

```powershell
node packages/foundry/src/business/cli.ts init --root var/business-example
node packages/foundry/src/business/cli.ts plan --root var/business-example --plan first-plan
node packages/foundry/src/business/cli.ts run --root var/business-example --plan first-plan
node packages/foundry/src/business/cli.ts approve --root var/business-example --plan first-plan
node packages/foundry/src/business/cli.ts resume --root var/business-example --plan first-plan
node packages/foundry/src/business/cli.ts report --root var/business-example
```

`approve` displays the full artifact, consequence, simulated cost ceiling and exact hash before accepting `APPROVE`. It records no invented human timing. `status` shows the pinned plan and latest persisted execution checkpoint. `resume` recovers persisted model results and never creates a replacement admission. A completed plan returns its stored status without dispatch.

For a fully offline engineering demonstration with explicitly simulated approval:

```powershell
node packages/foundry/src/business/cli.ts init --root var/business-demo
node packages/foundry/src/business/cli.ts demo --root var/business-demo --plan first-plan
node packages/foundry/src/business/cli.ts report --root var/business-demo
```

To ingest a different authorized business brief, use `init --file <brief.json>` with the exported `Brief` contract. To revise it, use `revise --file <brief.json> --expected <current-revision> --reason <reason>`. Revisions preserve prior plans and results. Planning is generic; execution requires a matching adapter. Neither a different brief nor a new plan bypasses the offline-only restriction.

Procedure preparation commands:

```powershell
node packages/foundry/src/business/cli.ts propose-procedure --root <root> --plan <plan> --file <candidate.json>
node packages/foundry/src/business/cli.ts freeze-comparison --root <root> --file <comparison.json>
```

Candidate input fields: `id`, `workerId`, `failureIndex`, `procedure`, `hypothesis`, `regressionRisk`. Comparison fields: `candidateId` and `spec` containing model, settings, tools, contextVersion, authorityVersion, maxCalls, maxExposure (integer minor units and currency), developmentIds, validationIds, rubricVersion and successRule. Frozen records are immutable. These are preparation records, not a statistical analysis engine or spending grant. Custody, reviewer calibration, immutable revision, execution authorization and actual observations remain separate gates.

## Verification and evidentiary boundaries

The connected test runs actual SQLite state and fixture effects with a network-denying global fetch. It checks stage context linkage, exact stale-approval refusal, one effect, acquired evidence, repeated outcome ingestion, no duplicate completed execution and no fixture-based promotion. Other tests cover stale facts, supersession cycles, unsupported money/reference/dependency values, missing value, generic non-support planning, stage/competency/resource changes, cross-business isolation, stale concurrent revision, unsupported execution mapping and immutable comparison preparation. A child process exits after model-response persistence and resumes with one investigation admission, not two. A malformed mock output becomes a supported business failure and no retry.

Relevant existing workflow regressions additionally cover uncertain effects, receipt forgery/mismatch, accounting limits, handoff loss, approval and process faults. Strict semantic TypeScript checking uses the installed compiler; no dependency installation is needed. These checks demonstrate software behavior, not adaptive intelligence or superior AI competence.

All new runtime state lives under a new `var/business-foundation-*` root. Historical live roots remain untouched. Since source versions are intentionally pinned, historical runs must be inspected using their preserved reports or frozen runtime; do not rewrite old implementation hashes to match new code. No new source should silently re-open a completed grant.

## What is still unimplemented

Autonomous business-model discovery and causal bottleneck diagnosis; broad tool-driven business research; calibrated cross-business worker qualification; execution of arbitrary newly assembled teams; learned team optimization; actual controlled specialist improvement from this foundation; production economics; protected final validation; real business actions. The foundation supplies durable, scoped connections and explicit gates for those capabilities. It does not label them complete.

The next useful increment should evaluate one materially richer assignment through this business-state layer: establish its business constraint, gather missing evidence, produce an auditable deliverable, and test whether one strong worker suffices before adding another. The existing invoice-exception proposal is one bounded candidate, not a product pivot or execution authorization.

## Completed demonstration and checks

The final demonstration is in `var/business-foundation-029-v1/business-report.html`, with machine-readable records in `business-report.json`, immutable SQLite records in `business.sqlite`, and a completed snapshot in `business-completed.sqlite`. `first-plan` completed four mock model stages and one exactly bound, explicitly mock-approved fixture effect. Three acquired evidence items were persisted back to business memory. `next-plan` is blocked after revision 2 exposed unknown economic impact and a missing causal-measurement competency. That second revision is an assistant-authored synthetic adaptation example under this clarification, not an independent founder judgment or empirical business finding. No further action was executed.

Final verification: **63 tests passed, zero failed** across the business-loop and relevant workflow suites. Installed TypeScript 6.0.3 performed strict semantic checking across **33 source files, zero errors** (dependency declaration checking skipped). Logs are `var/business-foundation-final-tests.txt` and `var/business-foundation-final-typecheck.txt`. Source and runtime needed to inspect the demonstration are archived under the new root's `frozen-runtime`.

Eighteen selected historical W-001/W-006 result, grant, config and database hashes remained unchanged. Read-only ledger inspection still found exactly 1 original failed W-001 admission, 4 completed W-001 recovery admissions and 4 completed W-006 admissions, with no pending attempt. This increment made zero provider/count requests and read no provider credential. Mission 029's prior $1.28 provisional inference estimate, $9.72 retained exposure including count buffer, and $20.28 uncommitted allowance are unchanged; authoritative billed cost is still unknown. The new mock telemetry is not added to those live costs.
