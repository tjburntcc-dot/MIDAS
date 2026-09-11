# Mission 029 recovery contract audit

This document audits the prospective `workflow-029-recovery-r1` amendment only. Its schedule contains one workflow: `W-001-single-r1`, in the smoke stage. It is a fresh root linked to the preserved value-profile parent; it is not a retry inside that parent and it creates no comparison arm.

No provider call, token-count request, approval, fixture effect, or live completion is recorded by this audit. The source and historical parent evidence are frozen inputs. Test counts and live outcomes are not asserted here.

## The four stage requirements

`synthetic-workflow-v3` and `buildWorkflowContext(..., workflow-context-v3)` divide responsibility across four calls. The provider receives strict JSON schemas. The worker must make the business judgment inside those schemas. The environment, approval authority, and persisted readback establish facts that neither provider output nor schema validity can establish.

| Stage | Provider schema requirement | Worker semantic business requirement | Independent external facts |
| --- | --- | --- | --- |
| 1. Investigate | Return the investigation contract for the permitted request, including the request and its deadline. | Request `cost_per_case` from `synthetic-cost-ledger-v1` at exactly zero cost; distinguish planning ranges from retrieved facts and do not invent unavailable evidence. | The fixture evidence tool supplies cost and publication-policy responses. The context carries only persisted responses and the exact evidence deadline. |
| 2. Decide and draft | Return a strict decision record, alternatives, evidence IDs, arithmetic fields, rationale, experiment record, and support artifact. | Compare the supplied option benefits and qualified costs in integer USD cents; use each allowed option once, select only a positive eligible contribution, or honestly reject/block. Draft a usable internal billing-status playbook without claiming authority. | The snapshot fixes option IDs, benefit claims, current rights, and policy; retrieved evidence fixes costs/policy status. Schema success cannot make a cost current or a decision economically sound. |
| 3. Operate / review | Return exactly one schema-valid support artifact plus a review object with issues, changes, and verdict. | Review the actual supplied draft, repair only supported defects, preserve conditional payment language, and block publication when evidence/policy does not justify it. Review text is not approval or execution. | The exact final payload is separately approved by a human principal. Authority checks bind the grant and proposal hash; the fixture service, not the model, controls the effect. |
| 4. Verify | Return a strict inspection record whose evidence IDs are limited to supplied IDs. | Inspect the actual artifact, confirmed receipt, readback, one effect, and zero obligations; report discrepancy or unknown rather than claim success. | `buildWorkflowContext` supplies persisted `approvedArtifact`, receipt, observation, ledger obligations, and prior review. Authenticated fixture readback and receipt verification establish delivery facts independently of the model. |

The provider-schema column constrains shape, not truth. The worker-semantic column is the intended business work, not a claim of measured quality. The external-facts column remains authoritative for retrieval, approval, dispatch, receipt/readback, obligations, and provider accounting.

## Linked amendment, limits, and preserved failure

The parent capture accepts only a closed failed parent containing one failed `W-001-single-investigate` attempt with successful count and inference HTTP responses, completed exact Astra identity, `WORKFLOW_OUTPUT_INVALID`, exactly 52 cents retained and no settlement. In live mode it also binds the preserved historical row hash `4370faec1027ba9af995894b23c067408856e69f5df0a57cbdb923e283597d79`. It reads the historical SQLite state read-only and pins the parent configuration, route, grant binding where applicable, implementation, attempt rows, and link hashes. The failed attempt is not deleted, retried in place, or released from its reservation.

The linked values are:

| Item | Cents | Treatment |
| --- | ---: | --- |
| Failed parent attempt, provisional provider amount | 11 | Preserved historical provisional value; it is not authoritative settlement. |
| Failed parent retained reservation | 52 | Preserved exposure; it remains retained. |
| Parent shared count buffer | 504 | Preserved unpriced count-uncertainty exposure. |
| Linked parent exposure | 556 | `52 + 504`; the recovery carries this once. |
| New recovery maximum | 208 | At most four admissions at 52 cents, for only `W-001-single-r1`. |
| Combined maximum exposure | 764 | `556 + 208`, below the 3,000-cent account ceiling. |

The amendment permits at most four new inference admissions and four count requests. Together with the one parent attempt/count, that is at most five against the original 48-count ceilings. Its `carryIn` references the parent exposure including the 504-cent shared buffer; recovery limits omit a new overhead reserve. Therefore the report and admission checks must not add the 504-cent buffer a second time. Reservations remain exposure controls, not billing proof; the 11-cent provisional value is not added to the 556-cent parent exposure.

## Context and provenance boundaries

The recovery keeps the v3 worker-visible boundary: snapshot, persisted evidence with requested variable/source/deadline/max-cost fields, stage-appropriate question/decision/draft, and for verification the persisted receipt/readback/obligation fields. It does not supply evaluator answers, another arm, credentials, or an authority shortcut.

The original initial draft, final review, factual artifact hashes/differences, information requests and evidence records, exact approval event, receipt/readback, and obligations should be read from the new recovery root's durable records. A provider response is evidence of what the provider returned; it is not proof of approval, effect, usefulness, independent review, or billing. Human approval timing remains `null` unless an actual human approval event records a measurement.

## Prospective command sequence

Run these commands from the Mission 029 worktree only after the separately authorized recovery grant is available. They describe the prospective path; they do not claim that any command has been run.

```powershell
$wf = 'packages/foundry/src/workflow/cli.ts'
$parent = 'var/workflow-029-value-v2'
$recovery = 'var/workflow-029-recovery-r1'

node $wf prepare-recovery --mode live --root $recovery --parent $parent
node $wf preflight --root $recovery
node packages/foundry/tools/audit-workflow-contract.mjs $recovery var/workflow-029-recovery-contract-mock
# Write the exact approved amendment file from the authorized approval, then:
node $wf authorize --root $recovery --file "$recovery/authorization.approved.json"
node $wf run --root $recovery --run W-001-single-r1
node $wf status --root $recovery --run W-001-single-r1
```

The status command is the wait point. If the run is waiting, inspect the exact proposal before approval:

```powershell
node $wf approval-view --root $recovery --run W-001-single-r1
node $wf approve --root $recovery --run W-001-single-r1
node $wf resume --root $recovery --run W-001-single-r1
# Resume again only if status says reconciliation is pending; never re-dispatch.
node $wf status --root $recovery --run W-001-single-r1
node $wf value-report --root $recovery
node $wf report --root $recovery
```

Exact approval is for the displayed final fixture proposal only. It does not authorize a provider request beyond the signed amendment, and it does not turn an unavailable semantic review, human timing, receipt, or billing fact into a known value.


## Structural and semantic boundary audit

All objects declare every field as required and reject additional properties. No stage accepts `null` output or nullable required values. Strings that name decisions, sources, kinds, statuses, currencies, options, policy versions and topics have explicit enums where the set is fixed. All monetary fields are safe integer USD cents with signed contributions and nonnegative benefit/cost. Nested object, array-item, minimum/maximum and item-count constraints are serialized by the same `buildResponsesBody` used for dispatch.

The evidence deadline is a controller-owned timestamp: the provider schema carries UTC date-time format, a UTC pattern and an exact singleton enum; the local validator checks the same value. Evidence retrieval cost is an exact zero-cent enum. Models do not invent scope IDs, account IDs, approval IDs, request hashes, fixture receipts or experiment grants.

Cross-field rules are visible business requirements, with local enforcement: planning bounds are ordered; alternative IDs and topics are unique; no-action has zero amounts and no references; an intervention cites its matching cost source; contribution equals benefit minus cost; a passing inspection includes the actual supplied receipt. Provider JSON Schema cannot express every cross-field dependency, so successful schema generation does not imply semantic acceptance. These dependencies are stated in `snapshot.taskBrief.stageContracts` and tested separately. Independent environment validation checks supplied benefit/cost values, freshness, eligibility and the selected option. No silent output repair occurs.

The review call can revise the actual artifact and block publication. It cannot rewrite the persisted economic decision or grant approval. The inspection call detects/explains discrepancies after publication; it cannot undo effects, waive independent verification, authorize new actions or add calls. It receives both the actual readback and approved artifact, while the controller verifies the service proof before the call. Human approval and semantic acceptance remain different records.

The offline audit archives four exact serialized representative request bodies and verifies their byte hashes against the actual mock-attempt ledger. Subsequent live-stage bytes necessarily depend on earlier actual outputs; they are not claimed to be predictable from mocks. Each live request uses the frozen assembler/schema, exact-byte admission hash and complete-payload provider token count. No character-count proxy, offline token estimate or mock usage substitutes for admission.

Validation before freeze: 166 relevant tests passed; installed TypeScript 6.0.3 strict semantic check covered 30 source files with zero errors (dependency declaration checks skipped). The focused contract audit includes handwritten varied outputs and schema-valid incorrect economics; the independent business validator rejects the latter. Recovery tests cover wrong parent amounts, count-only/unrelated failures, duplicate amendment roots, failed-call refusal, exact approval, report accounting and the fifth-admission cap.

Official documentation rechecked on September 11, 2026: [Astra route, High reasoning, Responses, structured outputs and prices](https://developers.openai.com/api/docs/models/gpt-6-astra), and [supported schema constraints](https://developers.openai.com/api/docs/guides/structured-outputs). The conservative calculation uses $12.50/M input (cache-write ceiling) plus $50/M output: `(8192 × 12.50 + 8192 × 50) / 1,000,000 = $0.512`, rounded up to $0.52. The $5.04 count buffer is unpriced uncertainty, not a published count-request price. The route alias is not asserted immutable.
