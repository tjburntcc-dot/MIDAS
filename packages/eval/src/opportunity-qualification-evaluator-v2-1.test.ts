import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { EVALUATOR_DIMENSIONS, opaqueId, protocol as protocol007 } from "./opportunity-qualification-evaluator-v2.ts";
import { preregisterCampaign, syntheticCampaignFixtures } from "./opportunity-qualification-campaign.ts";
import { OQ_SUCCESSOR_PROTOCOL_ID, REVIEW_SIGNALS, SUCCESSOR_SCORECARD_SCHEMA, successorProtocol, successorPacketHash, successorScoreAnchor, validateSuccessorScorecard, planSecondaryReview, buildMinimalSecondaryPacket } from "./opportunity-qualification-evaluator-v2-1.ts";

const fixtures = syntheticCampaignFixtures();
const spec = preregisterCampaign({ ...fixtures, specialist_identity: { frozen: true }, frontier_identity: { frozen: true }, playbook: { version: "v1" } });
const p = successorProtocol(spec, ["a".repeat(64), "b".repeat(64)]);
const contestant = opaqueId("1".repeat(64)); const one = fixtures.sealed[0];
const entry = { opaque_contestant_id: contestant, case: { case_id: one.case_id, evidence: one.evidence }, response: { synthetic: true } };
const packetBody = { packet_id: "V21-P-1", entries: [entry] }; const packet = { ...packetBody, packet_hash: successorPacketHash(packetBody) };
const judgment = (id: string, score = 2) => ({ dimension_id: id, score, anchor: successorScoreAnchor(id, score), evidence_ids: [one.evidence[0].id], rationale: "Authorized evidence supports this bounded response-local judgment." });
const row = (overrides: any = {}) => ({ opaque_contestant_id: contestant, case_id: one.case_id, dimension_judgments: EVALUATOR_DIMENSIONS.map(([id]) => judgment(id)), observed_contradiction_ids: [], uncertainty: "NONE", confidence: "HIGH", critical_failure: "NO_CRITICAL_FAILURE", review_signals: [], review_signal_dimension_ids: [], review_explanation: "No response-local review signal.", validation_status: "VALID", ...overrides });
const card = (r = row()) => ({ evaluator_protocol_id: OQ_SUCCESSOR_PROTOCOL_ID, evaluator_run_id: "synthetic-v21", packet_id: packet.packet_id, packet_hash: packet.packet_hash, protocol_hash: p.protocol_hash, independence_attestation: "INDEPENDENT_BLIND_SESSION", operator_attestation: { operator_attested_evaluator_identity: "synthetic-test", provider_reported_identity: null, observed_output_timestamp: null, telemetry_v2: { latency_ms: { status: "unknown_unmeasured_interactive_session", value: null, provenance: null } }, response_count: 1 }, responses: [r] });

function campaignRows(signal: string | null = null, score = 3) {
  const ids = [opaqueId("a".repeat(64)), opaqueId("b".repeat(64)), opaqueId("c".repeat(64)), opaqueId("d".repeat(64))];
  const cards = ids.map((opaque_contestant_id, n) => ({ responses: Array.from({ length: 28 }, (_, i) => { const case_id = `S-${String(i).padStart(2, "0")}`; const signalHere = n === 0 && i === 0 && signal; const dims = EVALUATOR_DIMENSIONS.map(([id]) => ({ dimension_id: id, score: signalHere && id === "hidden_labor" ? score : 3, anchor: successorScoreAnchor(id, signalHere && id === "hidden_labor" ? score : 3), evidence_ids: ["E"], rationale: "Synthetic bounded judgment." })); return { opaque_contestant_id, case_id, dimension_judgments: dims, observed_contradiction_ids: [], uncertainty: signalHere ? "LIMITED" : "NONE", confidence: signalHere ? "MODERATE" : "HIGH", critical_failure: "NO_CRITICAL_FAILURE", review_signals: signalHere ? [signal] : [], review_signal_dimension_ids: signalHere ? ["hidden_labor"] : [], review_explanation: signalHere ? "Synthetic response-local uncertainty." : "No signal.", validation_status: "VALID" }; }) }));
  const opaque_structure = ids.map((opaque_contestant_id, i) => ({ opaque_contestant_id, opaque_comparison_group_id: i < 2 ? "G-A" : "G-B", opaque_run_id: `R-${i}`, case_ids: Array.from({ length: 28 }, (_, x) => `S-${String(x).padStart(2, "0")}`) }));
  return { validated_primary_scorecards: cards, opaque_structure };
}
function setScore(input: any, contestantIndex: number, dimensionId: string, responseCount: number, score: number) {
  for (const response of input.validated_primary_scorecards[contestantIndex].responses.slice(0, responseCount)) { const d = response.dimension_judgments.find((x: any) => x.dimension_id === dimensionId); d.score = score; d.anchor = successorScoreAnchor(dimensionId, score); }
}

describe("successor evaluator protocol v2.1", () => {
  test("keeps protocol-007, original packet-01, and the preserved canary validation evidence immutable", () => {
    const root = process.cwd(), dir = resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2"); const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    const campaign = JSON.parse(readFileSync(resolve(root, "var/state/sealed/opportunity-qualifier-qualification-v1.json"), "utf8")); const sourcePackets = ["specialist-sealed-packet.json", "frontier-sealed-packet.json"].map((name) => JSON.parse(readFileSync(resolve(root, "var/artifacts/opportunity-qualifier-qualification-v1", name), "utf8")).packet_fingerprint); const manifest = JSON.parse(readFileSync(resolve(dir, "packet-manifest.json"), "utf8")); const validation = JSON.parse(readFileSync(resolve(dir, "primary-scorecard-01.validation.json"), "utf8"));
    assert.equal(protocol007(campaign.spec, sourcePackets).protocol_hash, "c4a5430ef1d803b9fa5fe60bd80d06a5bdd92f7fbcd8ac369b5d6b17b592f0db"); assert.equal(manifest.packets[0].packet_hash, "3bd930c3c7886a22b1c5f02e37cbbcaf469c1ab48c2ad9efd81779acacf1fce4"); assert.equal(hash(resolve(dir, "primary-scorecard-01.raw.json")), "17b7da67bb4e25d7b52adbc84ced00628faf80419f1bc05b494f288f2f58cdf3"); assert.equal(validation.canonical_validation_fingerprint, "9bf51bb49a4e9d348a75b97904246717311391754b81fe8e94f1691646a03854");
  });
  test("is explicitly incompatible with protocol-007 scorecards while retaining exactly frozen substantive dimensions", () => {
    assert.equal(p.compatibility.predecessor_protocol_id, "MIDAS-OQ-EVALUATOR-PROTOCOL-007");
    assert.deepEqual(p.dimensions.map((d: any) => [d.id, d.weight, d.deterministic]), [["disposition_quality",16,false],["evidence_fidelity",14,true],["buyer_access",9,false],["willingness_to_pay",8,false],["economic_correctness",12,true],["hidden_labor",8,false],["alternative_analysis",7,false],["anti_thesis",7,false],["validation_decisiveness",8,false],["actionability",5,false],["uncertainty_calibration",4,false],["authority_policy",2,true]]);
  });
  test("runtime and schema use the same complete signal enum and reject unknown fields or signals", () => {
    assert.deepEqual((SUCCESSOR_SCORECARD_SCHEMA.properties.responses.items.properties.review_signals.items as any).enum, REVIEW_SIGNALS);
    const bad: any = card(); bad.responses[0].review_signals = ["NOT_A_SIGNAL"]; bad.responses[0].unknown = true; assert.equal(validateSuccessorScorecard(bad, packet, p).ok, false);
  });
  test("enforces forward and reverse signal implications and rejects contradictory substantive claims", () => {
    const absent: any = card(row({ confidence: "LOW", review_signal_dimension_ids: ["hidden_labor"] })); assert.equal(validateSuccessorScorecard(absent, packet, p).ok, false);
    const reverse: any = card(row({ review_signals: ["LOW_CONFIDENCE"], review_signal_dimension_ids: ["hidden_labor"] })); assert.equal(validateSuccessorScorecard(reverse, packet, p).ok, false);
    const contradiction: any = card(row({ uncertainty: "MATERIAL", confidence: "HIGH", review_signals: ["AMBIGUITY"], review_signal_dimension_ids: ["hidden_labor"] })); assert.equal(validateSuccessorScorecard(contradiction, packet, p).ok, false);
  });
  test("rejects campaign claims, identity leakage, unauthorized evidence, and unsupported critical assertions", () => {
    const bad: any = card(row({ review_explanation: "This changes the winner and Astra selection." })); bad.responses[0].dimension_judgments[0].evidence_ids = ["not-authorized"]; assert.equal(validateSuccessorScorecard(bad, packet, p).ok, false);
    const critical: any = card(row({ critical_failure: "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE" })); assert.equal(validateSuccessorScorecard(critical, packet, p).ok, false);
  });
  test("ordinary ambiguity and insufficient evidence alone do not authorize secondary review when no boundary can move", () => {
    for (const signal of ["AMBIGUITY", "INSUFFICIENT_EVIDENCE"]) { const input: any = campaignRows(signal); if (signal === "INSUFFICIENT_EVIDENCE") input.validated_primary_scorecards[0].responses[0].uncertainty = "INSUFFICIENT_EVIDENCE"; const result = planSecondaryReview(input); assert.equal(result.status, "NO_SECONDARY_REVIEW_MATERIAL"); }
  });
  test("potential critical failure and deterministic/evaluator conflict require targeted independent review", () => {
    const critical: any = campaignRows(); critical.validated_primary_scorecards[0].responses[0].review_signals = ["POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE"]; const first = planSecondaryReview(critical); assert.equal(first.status, "SECONDARY_REVIEW_AUTHORIZED"); assert.equal(first.secondary_reviews.length, 1);
    const conflict: any = campaignRows(); conflict.deterministic_gate_findings = [{ opaque_contestant_id: conflict.opaque_structure[0].opaque_contestant_id, case_id: "S-00", deterministic_evaluator_conflict: true }]; assert.equal(planSecondaryReview(conflict).status, "SECONDARY_REVIEW_AUTHORIZED");
  });
  test("invalid coverage triggers a controlled primary rerun rather than substantive secondary review", () => {
    const input: any = campaignRows(); input.validated_primary_scorecards[0].responses.pop(); const result = planSecondaryReview(input); assert.equal(result.status, "PRIMARY_RERUN_REQUIRED"); assert.equal(result.secondary_reviews.length, 0);
  });
  test("bounded uncertainty that cannot cross any frozen boundary has an explicit non-materiality proof", () => {
    const result = planSecondaryReview(campaignRows("AMBIGUITY")); assert.equal(result.secondary_reviews.length, 0); assert.equal(result.excluded_proofs.length, 1); assert.match(result.excluded_proofs[0].proof, /No frozen competence/);
  });
  test("bounded synthetic uncertainty crossing competence creates a targeted review", () => {
    const input: any = campaignRows("AMBIGUITY", 0); setScore(input, 0, "disposition_quality", 28, 0); setScore(input, 0, "buyer_access", 6, 0);
    const result = planSecondaryReview(input); assert.equal(result.status, "SECONDARY_REVIEW_AUTHORIZED"); assert.equal(result.secondary_reviews.length, 1); assert.match(result.secondary_reviews[0].exact_deterministic_reason, /COMPETENCE/);
  });
  test("a decision-sensitive boundary excludes an unrelated uncertain response with a proof", () => {
    const input: any = campaignRows("AMBIGUITY", 0); setScore(input, 0, "disposition_quality", 28, 0); setScore(input, 0, "buyer_access", 6, 0); const unrelated = input.validated_primary_scorecards[2].responses[0]; unrelated.review_signals = ["AMBIGUITY"]; unrelated.uncertainty = "LIMITED"; unrelated.review_signal_dimension_ids = ["hidden_labor"];
    const result = planSecondaryReview(input); assert.equal(result.secondary_reviews.length, 1); assert.equal(result.excluded_proofs.length, 1); assert.equal(result.excluded_proofs[0].opaque_contestant_id, input.opaque_structure[2].opaque_contestant_id);
  });
  test("bounded synthetic uncertainty crossing run stability creates a targeted review", () => {
    const input: any = campaignRows("AMBIGUITY", 0); setScore(input, 0, "disposition_quality", 28, 0); setScore(input, 0, "buyer_access", 6, 0); setScore(input, 1, "disposition_quality", 21, 0); setScore(input, 1, "buyer_access", 1, 1);
    const result = planSecondaryReview(input); assert.equal(result.status, "SECONDARY_REVIEW_AUTHORIZED"); assert.match(result.secondary_reviews[0].exact_deterministic_reason, /STABILITY/);
  });
  test("bounded synthetic uncertainty crossing the practical margin creates a targeted review", () => {
    const input: any = campaignRows("AMBIGUITY", 3); setScore(input, 0, "disposition_quality", 28, 0); setScore(input, 0, "buyer_access", 6, 0); setScore(input, 1, "disposition_quality", 6, 0); setScore(input, 1, "buyer_access", 1, 2); for (const index of [2, 3]) { setScore(input, index, "disposition_quality", 25, 0); setScore(input, index, "buyer_access", 1, 2); }
    const result = planSecondaryReview(input); assert.equal(result.status, "SECONDARY_REVIEW_AUTHORIZED"); assert.match(result.secondary_reviews[0].exact_deterministic_reason, /PRACTICAL_MARGIN/);
  });
  test("deduplicates multiple dimension triggers per response and is invariant to input ordering or unconsumed metadata", () => {
    const input: any = campaignRows(); const r = input.validated_primary_scorecards[0].responses[0]; r.review_signals = ["POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE", "AMBIGUITY"]; r.uncertainty = "LIMITED"; r.review_signal_dimension_ids = ["hidden_labor", "buyer_access"]; const first = planSecondaryReview(input); const second = planSecondaryReview({ ...input, validated_primary_scorecards: input.validated_primary_scorecards.slice().reverse().map((c: any) => ({ ...c, responses: c.responses.slice().reverse() })), model_identity: "must not be consumed", telemetry: { cost: 0 } }); assert.deepEqual(first.secondary_reviews, second.secondary_reviews); assert.equal(first.secondary_reviews.length, 1); assert.deepEqual(first.secondary_reviews[0].affected_dimension_ids, ["buyer_access", "hidden_labor"]);
  });
  test("secondary packets contain only requested response-local dimensions and no primary judgment", () => {
    const plan: any = { secondary_reviews: [{ opaque_contestant_id: contestant, case_id: one.case_id, affected_dimension_ids: ["hidden_labor"], triggering_frozen_boundaries: ["COMPETENCE:X"] }] }; const result = buildMinimalSecondaryPacket(plan, packet, p); assert.deepEqual(result.entries[0].requested_dimension_ids, ["hidden_labor"]); assert.equal(JSON.stringify(result.entries).includes("dimension_judgments"), false); assert.equal(JSON.stringify(result).includes("synthetic-v21"), false);
  });
});

describe("successor packet regeneration", () => {
  test("preserves protocol-007 canary bytes and produces deterministic, blind, complete successor packets", () => {
    const root = process.cwd(), old = resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2/primary-scorecard-01.raw.json"), hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex"); const before = hash(old);
    execFileSync(process.execPath, ["--import", "./tools/register-ts.mjs", "tools/opportunity-qualification-evaluator-v2-1.mjs", "generate"], { cwd: root, stdio: "pipe" }); const output = execFileSync(process.execPath, ["--import", "./tools/register-ts.mjs", "tools/opportunity-qualification-evaluator-v2-1.mjs", "verify"], { cwd: root, encoding: "utf8" }); assert.match(output, /\"ok\": true/); assert.equal(hash(old), before);
    const manifest = JSON.parse(readFileSync(resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-1/packet-manifest.json"), "utf8")); assert.equal(manifest.total_responses, 112); const first = readFileSync(resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-1/packet-manifest.json"), "utf8"); execFileSync(process.execPath, ["--import", "./tools/register-ts.mjs", "tools/opportunity-qualification-evaluator-v2-1.mjs", "generate"], { cwd: root, stdio: "pipe" }); assert.equal(readFileSync(resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-1/packet-manifest.json"), "utf8"), first);
  });
});
