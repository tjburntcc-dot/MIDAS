import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FROZEN_DIMENSIONS, EVALUATOR_DIMENSIONS, EVALUATOR_WEIGHT_TOTAL, OQ_EVALUATOR_PROTOCOL_ID, protocol, scoreAnchor, validateScorecard, aggregateScorecards, reconcileDimension, opaqueId, packetHash } from "./opportunity-qualification-evaluator-v2.ts";
import { preregisterCampaign, syntheticCampaignFixtures } from "./opportunity-qualification-campaign.ts";

const fixtures = syntheticCampaignFixtures();
const spec = preregisterCampaign({ ...fixtures, specialist_identity: { frozen: true }, frontier_identity: { frozen: true }, playbook: { version: "v1" } });
const p = protocol(spec, ["a".repeat(64), "b".repeat(64)]);
const one = fixtures.sealed[0];
const entry = { opaque_contestant_id: opaqueId("1".repeat(64)), case: { case_id: one.case_id, family: one.family, title: one.title, evidence: one.evidence } };
const packetBody = { packet_id: "P-1", entries: [entry] }; const packet = { ...packetBody, packet_hash: packetHash(packetBody) };
const row = () => ({ opaque_contestant_id: entry.opaque_contestant_id, case_id: one.case_id, dimension_judgments: EVALUATOR_DIMENSIONS.map(([dimension_id]) => ({ dimension_id, score: 2, anchor: scoreAnchor(dimension_id, 2), evidence_ids: [one.evidence[0].id], rationale: "Authorized evidence supports this bounded judgment." })), observed_contradiction_ids: [], uncertainty: "NONE", confidence: "HIGH", critical_failure: "NO_CRITICAL_FAILURE", second_evaluator_required: false, escalation_reasons: [], validation_status: "VALID" });
const card = () => ({ evaluator_protocol_id: OQ_EVALUATOR_PROTOCOL_ID, evaluator_run_id: "synthetic-evaluator", packet_id: packet.packet_id, packet_hash: packet.packet_hash, protocol_hash: p.protocol_hash, independence_attestation: "INDEPENDENT_BLIND_SESSION", run_metadata: { operator_attested_evaluator_model: "synthetic", provider_reported_identity: null, observed_output_timestamp: null, telemetry_v2: { latency_ms: { status: "unknown_unmeasured_interactive_session", value: null, provenance: null } }, response_count: 1 }, responses: [row()] });

describe("frozen blind evaluator protocol", () => {
  test("preserves all twelve frozen dimensions, weights, and separation", () => {
    assert.deepEqual(FROZEN_DIMENSIONS.map(([id, weight, deterministic]) => [id, weight, deterministic]), [["disposition_quality",16,false],["evidence_fidelity",14,true],["buyer_access",9,false],["willingness_to_pay",8,false],["economic_correctness",12,true],["hidden_labor",8,false],["alternative_analysis",7,false],["anti_thesis",7,false],["validation_decisiveness",8,false],["actionability",5,false],["uncertainty_calibration",4,false],["authority_policy",2,true]]);
    assert.equal(EVALUATOR_WEIGHT_TOTAL, 72); assert.equal(EVALUATOR_DIMENSIONS.length, 9);
  });
  test("every allowed score has a behavioral anchor for every evaluator dimension", () => { for (const [id] of EVALUATOR_DIMENSIONS) for (const score of [0,1,2,3]) assert.match(scoreAnchor(id, score)!, /Absent|Partial|Adequate|Strong/); });
  test("strict contract accepts only complete anchored authorized judgments", () => assert.equal(validateScorecard(card(), packet, p).ok, true));
  test("rejects malformed scorecards, identity labels, missing cases, dimensions, and unauthorized evidence", () => {
    const bad: any = card(); bad.extra = true; bad.responses[0].opaque_contestant_id = "specialist-run-1"; bad.responses[0].dimension_judgments.pop(); bad.responses[0].dimension_judgments[0].evidence_ids = ["invented"]; assert.equal(validateScorecard(bad, packet, p).ok, false);
  });
  test("objective escalation is required for low confidence, uncertainty, contradictions, critical judgment, and deterministic conflict", () => {
    const bad: any = card(); bad.responses[0].confidence = "LOW"; assert.equal(validateScorecard(bad, packet, p).ok, false); bad.responses[0].second_evaluator_required = true; bad.responses[0].escalation_reasons = ["LOW_CONFIDENCE"]; assert.equal(validateScorecard(bad, packet, p).ok, true);
    const conflict: any = card(); assert.equal(validateScorecard(conflict, packet, p, [{ case_id: one.case_id }]).ok, false);
  });
  test("missing judgments and deterministic failure block aggregation; no winner is emitted", () => {
    assert.equal(aggregateScorecards([], [packet], p).status, "BLOCKED_MISSING_JUDGMENT"); assert.equal(aggregateScorecards([card()], [packet], p, false).status, "BLOCKED_DETERMINISTIC_GATE"); const result = aggregateScorecards([card()], [packet], p); assert.equal(result.status, "AGGREGATED_QUALITY_ONLY"); assert.equal(result.winner, null);
  });
  test("material disagreement becomes disputed rather than silently averaged", () => { assert.deepEqual(reconcileDimension(0, 2, false), { status: "DISPUTED_REQUIRES_ADJUDICATION", score: null }); assert.deepEqual(reconcileDimension(1, 2, true), { status: "DISPUTED_REQUIRES_ADJUDICATION", score: null }); assert.deepEqual(reconcileDimension(1, 2, false), { status: "RECONCILED", score: 1.5 }); });
  test("opaque IDs, packet hashing, and aggregation are independent of model, telemetry, contestant order, and response order", () => {
    assert.match(entry.opaque_contestant_id, /^C-[A-F0-9]{16}$/); const result = aggregateScorecards([card()], [packet], p); const reversed = aggregateScorecards([{ ...card(), responses: card().responses.slice().reverse() }], [{ ...packet, entries: packet.entries.slice().reverse() }], p); assert.deepEqual(result, reversed);
  });
});
