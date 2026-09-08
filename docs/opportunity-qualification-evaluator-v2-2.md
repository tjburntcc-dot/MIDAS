# Blind evaluator final successor protocol v2.2

`MIDAS-OQ-EVALUATOR-PROTOCOL-010` v2.2.0 is the immutable successor to protocol-009. It repairs field semantics and enforcement only. The twelve quality dimensions, weights, deterministic/evaluator separation, 0–3 anchors, evidence boundary, critical-failure policy, 75 competence threshold, eight-point stability threshold, five-point practical margin, two-run structure, no-winner behavior, telemetry exclusion, identity isolation, and quality-only scope are unchanged. This contributes to final MIDAS by making the quality-control layer reliable without changing the meaning of opportunity quality.

## Preserved evidence and compatibility boundary

Protocol-007, protocol-009, all of their packets, the protocol-009 failed successor canary, its raw bytes, provenance, and validation evidence remain historical evidence. They are not edited, normalized, re-saved, or silently reinterpreted. Protocol-010 cannot accept an earlier scorecard: it requires a fresh blind evaluator execution in a separately authorized mission. This contributes to final MIDAS by preserving the evidence that exposed the defect while avoiding a false claim that old evidence satisfies the corrected contract.

## Field-aware leakage enforcement

The validator examines only evaluator-authored free-text fields (`dimension_judgments[].rationale` and `review_explanation`) using narrow patterns for unambiguous prohibited claims: named contestant/provider-model identities, explicit AI/run latency, token use, AI/run monetary cost, correction/provider telemetry, source filenames or paths, contestant comparisons/rankings, and campaign selection/certification/routing conclusions. Opaque IDs, exact enums, strict property lists, exact packet/evidence references, and deterministic packet structure enforce the remaining boundary structurally.

It deliberately does not ban generic business words. A legitimate opportunity analysis can discuss customer, switching, implementation, operating, acquisition, labor, or opportunity cost; pricing; willingness to pay; margins; economics; and business models. This contributes to final MIDAS by letting a judge reason about ordinary commercial evidence while still blocking disclosures that could compromise blindness.

Free text cannot be perfectly semantically classified by a mechanical matcher. The clean-session prompt therefore explicitly prohibits actual leakage and identifies the allowed business-language boundary. The validator is an auditable guardrail, not a claim of semantic omniscience. This contributes to final MIDAS by making the residual limitation honest rather than disguising it as complete detection.

## Orthogonal judgment confidence and evidence sufficiency

`judgment_confidence` now means confidence that the evaluator correctly applied the rubric to the evidence it received. `evidence_sufficiency` means whether the underlying case has enough evidence for named substantive dimensions. These are distinct fields and neither overrides the other.

`HIGH` judgment confidence with `INSUFFICIENT_EVIDENCE` is valid: an evaluator can be certain that the correct conclusion is that evidence is missing. When evidence is insufficient, each listed affected dimension is mechanically restricted to its existing 0–1 anchors. It cannot receive a favorable 2 or 3 merely because the evaluator is confident. `LOW` judgment confidence requires the local `LOW_CONFIDENCE` signal. This contributes to final MIDAS by making uncertainty truthful without allowing it to improve a substantive judgment.

## Response-local governance boundary

The scorecard retains only response-local signals. The deterministic planner remains the sole authority that evaluates complete 112-response coverage, frozen competence, run stability, practical margin, and later sealed-selection sensitivity. No scorecard can assert a winner, selection, certification, routing result, campaign comparison, or a blanket need for a second evaluator. This contributes to final MIDAS by keeping campaign governance with the actor that has the necessary complete information.

## Validation artifacts

New validation artifacts are serialized as exact canonical UTF-8 JSON, with no Markdown, preamble, trailing whitespace/commentary, or literal backslash-n suffix. Their fingerprint hashes the canonical record body excluding the fingerprint field. The integrity check rejects a complete JSON value with appended `\\n` bytes, including the malformed historical pattern. Historical malformed bytes remain unchanged as audit evidence. This contributes to final MIDAS by ensuring future audit records can be parsed and fingerprinted from their complete raw bytes.

## Repacketization and recovery

`tools/opportunity-qualification-evaluator-v2-2.mjs` creates a new ignored packet set in `var/artifacts/opportunity-qualifier-evaluator-v2-2/` from the unchanged 112 substantive responses. It derives opaque contestant IDs from substantive hashes, preserves every source-to-packet substantive hash, emits every opaque contestant/case pair exactly once, and checks packet hashes, manifest hash, size ceiling, field-level blindness, and deterministic regeneration. The separate ignored identity map is not used for packet derivation.

The tool writes a verified recovery copy to `var/recovery/opportunity-qualifier-evaluator-v2-2/` containing only the new primary packet files and their manifest—never an identity map, scorecard, credentials, or unrelated artifacts. This contributes to final MIDAS by making the repaired packet set recoverable without mixing private mapping material into the recovery copy.

This implementation performs no evaluator execution, scoring, aggregation, unblinding, comparison, selection, certification, or routing. The next possible action, only after separate authorization, is a fresh isolated Protocol-010 canary.
