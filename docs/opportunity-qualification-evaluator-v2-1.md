# Blind evaluator successor protocol v2.1

`MIDAS-OQ-EVALUATOR-PROTOCOL-009` v2.1.0 is the immutable successor to protocol-007. It changes escalation mechanics only; the twelve dimensions, weights, deterministic/evaluator separation, 0–3 anchors, authorized evidence, critical policy, 75 competence threshold, eight-point stability limit, five-point practical margin, two-run structure, 28-case requirement, blindness, and quality-only scope are unchanged. This contributes to final MIDAS by making independent quality evidence dependable without redefining what quality means.

## Compatibility boundary

Protocol-007 (`c4a5430ef1d803b9fa5fe60bd80d06a5bdd92f7fbcd8ac369b5d6b17b592f0db`) and its packets, canary, and validation record are historical evidence and are not changed or reinterpreted. Its `second_evaluator_required` and escalation reasons cannot be migrated as successor authorizations because they combine local observation with campaign governance. A protocol-007 scorecard therefore cannot be silently accepted under v2.1; a fresh successor-protocol canary is required unless exact losslessness and semantic compatibility are independently proven. This contributes to final MIDAS by retaining audit history while preventing an obsolete decision rule from silently governing new evidence.

## Response-local scorecard

The successor evaluator records only anchored substantive dimension judgments, authorized evidence citations, contradiction IDs, uncertainty, confidence, potential judgment-dependent critical failure, and concise evidence-grounded review signals. Its allowed signals are `LOW_CONFIDENCE`, `MATERIAL_CONTRADICTION`, `INSUFFICIENT_EVIDENCE`, `AMBIGUITY`, `POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE`, and `UNSUPPORTED_REASONING`.

The scorecard has no `second_evaluator_required`, material-margin claim, stability claim, competence impact, comparison impact, selection impact, or campaign escalation field. Operator-attested evaluator identity is retained separately from substantive fields, and provider identity/timing/telemetry may be genuinely unknown. This contributes to final MIDAS by retaining the facts a reviewer can honestly observe while reserving governance for MIDAS.

The runtime validator is the authoritative implementation of the published Draft 2020-12 contract. Both reject unknown fields and enum values, missing or duplicate dimensions, invalid anchors, unauthorized evidence or contradiction citations, identity/telemetry/campaign claims in substantive text, malformed attestation, missing coverage, and unsupported critical assertions. It enforces both directions for declared equivalences: low confidence, contradiction IDs, insufficient evidence, and potential judgment-dependent critical failure each require—and are required by—their matching signal. It also rejects high confidence paired with material or insufficient uncertainty. This contributes to final MIDAS by making the written evaluator contract executable rather than aspirational.

## Deterministic value-of-information planning

After all 112 primary responses validate, the pure planner receives only validated scorecards, deterministic gate findings, frozen weights and score bounds, frozen thresholds, and opaque contestant/run/group structure. It does not accept model identity, labels, pricing, cost, latency, tokens, source name, source path, or input ordering.

For every response-local uncertain dimension, the planner bounds the score at the legitimate frozen range 0–3 and calculates its maximum remaining weighted effect: `weight × max(score, 3 - score) ÷ 3 ÷ 72 × 100 ÷ 28`. It propagates intervals to opaque run quality, competence (75), run spread (8), and practical quality margin (5), then evaluates sealed later-selection sensitivity without unblinding. It authorizes a secondary review only for a potential judgment-dependent critical failure, an unresolved deterministic/evaluator conflict, a boundary-crossing interval, or an explicit frozen-policy confirmation rule. Invalid or incomplete scorecards cause rejection or a controlled primary rerun, never a pretend substantive disagreement. This contributes to final MIDAS by spending independent-review effort only where an allowed alternate judgment can affect a consequential frozen decision.

## Minimal secondary work

The planner deduplicates all triggers for one opaque response and carries only the affected evaluator dimensions. It creates a response-level record with opaque contestant and case IDs, affected dimensions, frozen boundary, bounded interval, maximum remaining weighted effect, exact deterministic reason, and planner version/hash. It gives no primary score or rationale to the independent secondary reviewer. Candidates excluded from a no-material plan receive a deterministic proof that no permitted score can cross competence, stability, practical-margin, or sealed-selection boundaries. This contributes to final MIDAS by preventing both blanket escalation and unnecessary packet-wide rejudging.

## Frozen execution order

1. Validate every primary scorecard.
2. Ensure complete 112-response primary coverage.
3. Run deterministic case gates.
4. Derive provisional quality intervals and aggregates.
5. Evaluate competence and run-stability sensitivity.
6. Evaluate practical-margin and sealed-selection sensitivity.
7. Create the minimal secondary-review plan.
8. Execute independent secondary reviews in a later authorized mission.
9. Validate secondary scorecards, reconcile permitted agreements, and mark material disagreements for adjudication.
10. Lock final quality evidence; unblind only separately; select, certify, and route only after authorization.

No individual packet may decide campaign-level materiality. This contributes to final MIDAS by making the ordering of evidence, review, and authority auditable.

## Successor packet factory and scope

`tools/opportunity-qualification-evaluator-v2-1.mjs` regenerates an ignored, deterministically sharded primary packet set under `var/artifacts/opportunity-qualifier-evaluator-v2-1/`. It preserves each of the 112 response/case substantive hashes, emits every response exactly once, keeps the existing 75,000-byte ceiling, excludes identity and telemetry, and writes a canonical manifest/protocol hash. Its clean-session prompt says that ambiguity and insufficient evidence must affect the score, are reported locally, do not ask for blanket escalation, and MIDAS—not the evaluator—later calculates review need. This contributes to final MIDAS by preparing reproducible blind evidence packets without executing a judge.

This is quality-only infrastructure. It reaches neither economic conclusions nor an evaluator execution, actual score aggregation, unblinding, comparison, selection, certification, or routing outcome. The next authorized operation is a fresh, isolated successor-protocol canary against one regenerated packet, followed by validation only. This contributes to final MIDAS by preserving a safe, explicit boundary before business decisions are possible.
