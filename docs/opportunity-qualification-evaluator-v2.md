# Frozen blind evaluator protocol v2

`MIDAS-OQ-EVALUATOR-PROTOCOL-007` supplies the independent judgment layer that
the frozen Opportunity Qualifier campaign explicitly required but did not yet
mechanically define. It is a protocol and local packet factory only: it does
not evaluate responses, compare contestants, unblind results, select a winner,
certify a role, or route work. This gives final MIDAS a reusable way to prove
business reasoning quality with independent evidence rather than reputation.

## Frozen policy recovered

The source campaign is `MIDAS-FOUNDRY-004` v1.0.0, with campaign fingerprint
`A1382D89CFF01CFA6D04B0C29FAD53AE6229D77611B8592C260EFBED1316835F`.
It freezes these dimensions and weights exactly:

| Dimension | Weight | Assessment mode |
| --- | ---: | --- |
| disposition_quality | 16 | evaluator |
| evidence_fidelity | 14 | deterministic gate |
| buyer_access | 9 | evaluator |
| willingness_to_pay | 8 | evaluator |
| economic_correctness | 12 | deterministic gate |
| hidden_labor | 8 | evaluator |
| alternative_analysis | 7 | evaluator |
| anti_thesis | 7 | evaluator |
| validation_decisiveness | 8 | evaluator |
| actionability | 5 | evaluator |
| uncertainty_calibration | 4 | evaluator |
| authority_policy | 2 | deterministic gate |

The frozen critical rules are fabricated evidence, invented pricing or
transactions, material numeric error, confidential-data leakage, unsafe
instruction following, unauthorized commitment, missed fatal authority
requirement, simulated-as-real reporting, and a hidden decisive contradiction.
The source also freezes 75 minimum competence, all 28 completed cases, no
critical failures, two runs per arm, maximum run-quality spread of 8, and a
five-point quality margin.

This recovery contributes to final MIDAS by making the measurement target
stable before anyone judges a response.

## Policy classification and protocol decision

Frozen substantive policy is the dimensions, weights, critical rules, evidence
boundaries, minimum competence, stability, and five-point margin. The missing
mechanics were the anchored scale, strict output contract, aggregation,
escalation, reconciliation, packet boundary, and replay record. No genuinely
undefined preference is resolved here.

The protocol uses the narrow four-value scale 0–3. Every value has a written
behavioral anchor, and every evaluator dimension combines its own purpose with
that anchor. The nine evaluator dimensions total 72 frozen points. Their
quality-only result is `sum(weight × score / 3) / 72 × 100`, rounded to six
decimal places. The three deterministic dimensions are executed first as
separate gates and are never granted an invented numeric score. A failed gate,
missing score, invalid scorecard, unresolved dispute, or missing evidence
blocks aggregation. Aggregation has no winner output.

This contributes to final MIDAS by separating facts machines can check from the
difficult commercial judgments that deserve independent review.

## Independent review and disputes

An evaluator may use only the case evidence and its assigned response. It must
cite packet evidence IDs, distinguish observation/inference/assumption/
contradiction/unknown, and declare uncertainty and confidence. It may not use
identity, model family, source path/order, telemetry, other responses, prior
scores, rankings, or style as evidence.

A second independent evaluator is compulsory for low confidence, material
contradiction, insufficient evidence, a judgment-dependent critical failure,
explicit ambiguity, conflict with deterministic findings, a response capable
of consuming the frozen five-point margin, close aggregate risk, unsupported
reasoning, or replay instability. The second evaluator receives the same blind
packet and protocol, but no primary score or rationale. Scores one step apart
may combine symmetrically only when neither record has a material trigger;
larger or triggered differences are `DISPUTED_REQUIRES_ADJUDICATION`.
Adjudication is explicitly a later authorized activity, and unresolved disputes
block certification.

This contributes to final MIDAS by ensuring a close or uncertain judgment is
visible evidence to resolve, never a hidden average.

## Contract, blindness, and packetization

The tracked module exports a Draft 2020-12 JSON contract and a strict runtime
validator. It rejects non-object/non-JSON use, unknown top-level fields,
protocol/packet mismatches, missing/duplicate cases, missing dimensions,
illegal or unanchored scores, unauthorized evidence citations, malformed
uncertainty/confidence, unsupported critical reporting, required-but-absent
escalation, and identity-bearing contestant labels. Run metadata permits only
operator-attested evaluator identity, optional provider identity, an observed
output timestamp if one exists, and the v2 measured-or-unknown telemetry shape;
it never requires fabricated provider telemetry.

Packets are ignored under `var/artifacts/opportunity-qualifier-evaluator-v2/`.
The separately ignored identity map is not read to derive any packet field.
Opaque IDs are derived from a substantive fingerprint; entries sort by opaque
ID and case ID, then use deterministic largest-entry-first bins under 75,000
serialized bytes. Complete case evidence travels with each response and no
response is split. Packets contain no source file/path, contestant metadata,
telemetry, source ordering, prior judgment, or comparison.

This contributes to final MIDAS by making a fair evaluation possible even in a
clean external session that has no access to the repository.

## Scope, evidence, and limits

The factory produces the primary blind packet set from four validated v2
artifacts with 28 responses each. Its manifest records packet hash, protocol
hash, source-to-packet content hashes, byte counts, and explicitly labeled
token estimates. Re-running it with unchanged inputs is byte-identical because
it records no timestamps. The identity map is outside Git and outside packet
derivation, so replacing or permuting it cannot affect material, rules, or
arithmetic.

This is a quality-only campaign. Unknown operational telemetry remains
ineligible, and this protocol makes no economic conclusion. Its limitations are
intentional: evaluator execution, quality scores, comparisons, selection,
certification, and routing remain unauthorized. The next authorized action is
to give each sealed primary packet, exactly once, to an independent clean-session
evaluator and validate its JSON output under this protocol.

This contributes to final MIDAS by preserving an auditable boundary between
evidence preparation and any future business-critical decision.

## Test and security record

Focused synthetic tests prove frozen dimensions/weights, anchor coverage,
strict rejection behavior, missing-judgment and gate blocking, escalation,
dispute handling, deterministic aggregation, and order/identity/telemetry
independence. The existing v1 and telemetry-v2 tests remain the regression
evidence for unchanged source behavior. Packet generation is local-only and
does not invoke a provider, selector, certification path, or routing path.

The tracked diff contains implementation, tests, this governance record, and
an ignore rule only. It contains no sealed case content, response content,
identity mapping, evaluator packet, model-associated result, credential,
machine-private path, dependency, or lockfile change.

This contributes to final MIDAS by making the judging infrastructure reviewable
without exposing the campaign evidence it protects.
