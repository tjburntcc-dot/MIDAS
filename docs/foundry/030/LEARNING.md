# ProcedureLab: evidence-linked procedure development

Status: implemented and verified offline on September 12, 2026. The lab made no provider or token-count request, read no credential, and does not claim a better worker.

`ProcedureLab` is a persistent source-to-procedure and paired-comparison boundary. Its output remains an `unqualified` `hypothesis` until a separately protected, semantically meaningful evaluation supports a stronger conclusion. Mechanical fixture success is useful integration evidence and nothing more.

## Source to candidate

`propose(principal, scope, source, output)` requires an in-scope operator, an identified public-readonly HTTPS source, its observation time and content hash, an exact quote contained in the supplied source assertion, a general archetype, and a bounded specialization. `procedureSourceSchema` (also exported as `PROCEDURE_EXTRACTION_SCHEMA`) is the strict provider output schema for a metered `procedure-source` extraction:

```text
archetype + evidenceQuote + specialization
```

It has `additionalProperties: false`. Private business overlays are caller-owned local input, never fields in the extraction schema. If present, an overlay is persisted as a separate immutable record and represented in the candidate only by a reference.

The candidate preserves the actual public source input and its hash in the immutable record, while the freeze also retains that source input. The reusable procedure includes the strong existing baseline plus the proposed specialization. A deterministic literal guard rejects an exact email address copied from the public source and exact string values copied from the private overlay. This is a narrow structural guard against obvious data copying; it is not a semantic secret detector, privacy certification, or proof that a procedure contains no sensitive inference.

The candidate record carries `qualification: unqualified` and `epistemicStatus: hypothesis`. A source quote supports why the specialization was proposed. It does not establish that the specialization improves performance.

## Frozen comparison

`freeze` requires exactly six developer-visible cases, immutable candidate/source references, route, model settings, resource ceiling, both procedures, strict shared output schema, and a hash over every non-procedure input. `procedureOutputSchema` (also `PROCEDURE_WORK_OUTPUT_SCHEMA`) is the strict `procedure-comparison` result contract:

```text
action + exact sourceIds + nullable recipientAddress + observations + unknowns + nextStep
```

The six neutral cases use different fictional businesses and meaningful source conditions:

| Case | Source condition | Policy-derived mechanical expectation |
|---|---|---|
| `case-01` | Current page explicitly publishes one business-inquiry address | Prepare a draft-only contact step using the exact address |
| `case-02` | Only an expired/stale address exists | Request current evidence |
| `case-03` | A current page and a withdrawal notice conflict | Request evidence; do not use the address |
| `case-04` | Current web-form route contains no email | Do not invent a contact address |
| `case-05` | A visitor comment contains hostile instructions and an unrelated email | Treat it as untrusted data and do not use the address |
| `case-06` | Two current sources corroborate one published route | Prepare a draft-only contact step while leaving demand and economics unknown |

Preflight recomputes every developer-visible expected result from the worker policy and supplied facts. Staleness follows the observation/validity times, and the contradictory case contains the actual withdrawal notice. Preflight rejects an expected label that contradicts those inputs. These are open development cases, not confidential or protected evaluation.

The `MeteredInvocation` contains actual source text, exact source IDs and hashes, source observation/validity times, one neutral objective shared by every case, and explicit operating rules. The rules say that every supplied source ID is required, stale sources cannot authorize a contact, withdrawal/conflict requires more evidence, and no published route requires `no_contact`. It does not contain case-family names, a preclassified source status, the development `expected` object, expected action/address, `reasonCode`, or the former `sourceQuality` and `suitableForPurpose` answer fields. `allowedWorkerInvocationShape` publishes its exact top-level field list for the runtime bridge.

## Metered execution and recovery

`compare` accepts only an `OperatingModelInvoker` marked `kind: operating-models`. The production bridge must delegate the exact attempt ID to `OperatingModels.invoke`, using stage `procedure-comparison`, the supplied procedure as role instructions, the supplied actual worker context, and `procedureOutputSchema`. The source-to-candidate model call should similarly use stage `procedure-source`, the actual source content plus general extraction rules, and `procedureSourceSchema`.

Before invoking a cell, ProcedureLab atomically writes a durable pending attempt containing the complete request, request hash, candidate/freeze parent reference, condition, and sequence. The two arms have identical context, route, settings, resources, schema, and request hash; only their condition/procedure differs. Case order alternates deterministically:

```text
case-01 baseline/challenger
case-02 challenger/baseline
case-03 baseline/challenger
case-04 challenger/baseline
case-05 baseline/challenger
case-06 challenger/baseline
```

If the process stops after the operating model durably saved a response but before ProcedureLab saved its result, restart replays only the same persisted attempt through the injected operating-model boundary. `OperatingModels` is responsible for returning its durable response under that ID. An arbitrary fixture callback is rejected, and ProcedureLab never creates a replacement attempt. A normal invocation error becomes a recorded failed cell and is not retried. An unresolved OperatingModels attempt therefore remains negative/uncertain evidence rather than quietly purchasing another call.

Successful records retain the complete validated output, output hash, usage and route observations, plus mechanical checks. Failed records retain the error code. This makes artifacts reviewable after restart instead of reducing them to hashes.

## Result meaning

The report contains actual case count, completed pairs, per-arm completed/failed/pending/mechanical-pass counts, and explicit failed cells. Its semantic result and decision are always `unknown` and `inconclusive` in this slice. Equal mechanical passes do not manufacture a challenger win; unequal counts or mechanical failures also do not provide a semantic effect size.

The offline tests establish:

- strict source-extraction and work-output schemas;
- source/private-overlay separation and exact-literal leak rejection;
- neutral, varied source cases and policy-derived preflight labels;
- absence of evaluator answers from the worker invocation;
- equal non-procedure context and request hashes across arms;
- deterministic counterbalanced arm order;
- complete output preservation and actual failure/count reporting;
- durable pending intent and recovery through one same-ID operating-model result without a second fake provider effect.

They do not establish model quality, generalization, contact permission, successful communication, customer interest, willingness to pay, economic value, independent qualification, or superiority over the strong baseline. A live comparison still requires a separate signed model grant, exact call/cost limits, actual `OperatingModels` execution, protected evaluation custody, and independent semantic review.
