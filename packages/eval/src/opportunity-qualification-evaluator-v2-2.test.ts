import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVALUATOR_DIMENSIONS, opaqueId } from "./opportunity-qualification-evaluator-v2.ts";
import { preregisterCampaign, syntheticCampaignFixtures } from "./opportunity-qualification-campaign.ts";
import { EVIDENCE_SUFFICIENCY_V22, FINAL_SUCCESSOR_SCORECARD_SCHEMA, JUDGMENT_CONFIDENCE_V22, OQ_FINAL_SUCCESSOR_PROTOCOL_ID, REVIEW_SIGNALS_V22, finalSuccessorPacketHash, finalSuccessorProtocol, finalSuccessorScoreAnchor, serializeCanonicalValidationRecord, validateFinalSuccessorScorecard, validationArtifactIntegrity } from "./opportunity-qualification-evaluator-v2-2.ts";

const fixtures = syntheticCampaignFixtures();
const spec = preregisterCampaign({ ...fixtures, specialist_identity: { frozen: true }, frontier_identity: { frozen: true }, playbook: { version: "v1" } });
const protocol = finalSuccessorProtocol(spec, ["a".repeat(64), "b".repeat(64)]);
const contestant = opaqueId("1".repeat(64)), one = fixtures.sealed[0];
const entry = { opaque_contestant_id: contestant, case: { case_id: one.case_id, evidence: one.evidence }, response: { synthetic: true } };
const packetBody = { packet_id: "V22-P-1", entries: [entry] }; const packet = { ...packetBody, packet_hash: finalSuccessorPacketHash(packetBody) };
const judgment = (id: string, score = 2, rationale = "Authorized evidence supports this bounded response-local judgment.") => ({ dimension_id: id, score, anchor: finalSuccessorScoreAnchor(id, score), evidence_ids: [one.evidence[0].id], rationale });
const row = (overrides: any = {}) => ({ opaque_contestant_id: contestant, case_id: one.case_id, dimension_judgments: EVALUATOR_DIMENSIONS.map(([id]) => judgment(id)), observed_contradiction_ids: [], evidence_sufficiency: "SUFFICIENT", evidence_sufficiency_dimension_ids: [], judgment_confidence: "HIGH", critical_failure: "NO_CRITICAL_FAILURE", review_signals: [], review_signal_dimension_ids: [], review_explanation: "No response-local review signal.", validation_status: "VALID", ...overrides });
const card = (response = row(), candidatePacket = packet) => ({ evaluator_protocol_id: OQ_FINAL_SUCCESSOR_PROTOCOL_ID, evaluator_run_id: "synthetic-v22", packet_id: candidatePacket.packet_id, packet_hash: candidatePacket.packet_hash, protocol_hash: protocol.protocol_hash, independence_attestation: "INDEPENDENT_BLIND_SESSION", operator_attestation: { operator_attested_evaluator_identity: "synthetic-test", provider_reported_identity: null, observed_output_timestamp: null, telemetry_v2: { status: "unknown_unmeasured_interactive_session" }, response_count: 1 }, responses: [response] });
const validate = (response = row()) => validateFinalSuccessorScorecard(card(response), packet, protocol);
const insufficient = (score = 1, confidence = "HIGH") => { const value = row({ evidence_sufficiency: "INSUFFICIENT_EVIDENCE", evidence_sufficiency_dimension_ids: ["hidden_labor"], judgment_confidence: confidence, review_signals: ["INSUFFICIENT_EVIDENCE"], review_signal_dimension_ids: ["hidden_labor"], review_explanation: "The available case evidence is insufficient for this dimension." }); const target = value.dimension_judgments.find((item: any) => item.dimension_id === "hidden_labor"); target.score = score; target.anchor = finalSuccessorScoreAnchor("hidden_labor", score); return value; };
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("final field-aware evaluator successor v2.2", () => {
  test("reproduces the preserved 54-error root cause without exposing scorecard contents", () => {
    const root = process.cwd(), directory = resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-1"); const historicalCard = JSON.parse(readFileSync(resolve(directory, "successor-primary-scorecard-01.raw.json"), "utf8")); const rawValidation = readFileSync(resolve(directory, "successor-primary-scorecard-01.validation.json"), "utf8");
    assert.equal(rawValidation.endsWith(String.fromCharCode(92, 110)), true); const record = JSON.parse(rawValidation.slice(0, -2)); const errors: unknown[] = []; const walk = (value: any): void => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => /error/i.test(key) && Array.isArray(child) ? errors.push(...child) : walk(child)); }; walk(record);
    const prohibited = errors.filter((error) => /substantive identity, telemetry, or campaign claim/i.test(String(error))); const contradictory = errors.filter((error) => /contradictory high confidence and uncertainty/i.test(String(error))); const costByResponse = new Map(historicalCard.responses.map((response: any) => [`${response.opaque_contestant_id}|${response.case_id}`, response.dimension_judgments.filter((judgment: any) => /cost/i.test(judgment.rationale)).length])); const prohibitedByResponse = new Map<string, number>(); for (const error of prohibited) { const key = String(error).match(/^(.*): substantive identity, telemetry, or campaign claim$/i)?.[1]; assert.ok(key); prohibitedByResponse.set(key, (prohibitedByResponse.get(key) || 0) + 1); }
    assert.equal(errors.length, 54); assert.equal(prohibited.length, 36); assert.equal(contradictory.length, 18); assert.equal([...costByResponse.values()].reduce((sum, value) => sum + value, 0), 36); assert.equal([...costByResponse.keys()].every((key) => costByResponse.get(key) === (prohibitedByResponse.get(key) || 0)), true); assert.equal(historicalCard.responses.filter((response: any) => response.confidence === "HIGH" && response.uncertainty === "INSUFFICIENT_EVIDENCE").length, 18);
  });
  test("retains every frozen substantive dimension, policy threshold, and deterministic boundary", () => {
    assert.equal(protocol.protocol_id, "MIDAS-OQ-EVALUATOR-PROTOCOL-010"); assert.equal(protocol.semantic_version, "2.2.0");
    assert.deepEqual(protocol.dimensions.map((d: any) => [d.id, d.weight, d.deterministic]), [["disposition_quality",16,false],["evidence_fidelity",14,true],["buyer_access",9,false],["willingness_to_pay",8,false],["economic_correctness",12,true],["hidden_labor",8,false],["alternative_analysis",7,false],["anti_thesis",7,false],["validation_decisiveness",8,false],["actionability",5,false],["uncertainty_calibration",4,false],["authority_policy",2,true]]);
    assert.deepEqual(protocol.frozen_policy, { minimum_competence: 75, maximum_run_quality_spread: 8, practical_quality_margin: 5, runs_per_arm: 2, cases_per_run: 28, no_critical_failures: true });
  });
  test("allows ordinary business language in the exact prior false-positive family", () => {
    for (const phrase of ["implementation cost", "switching cost", "customer acquisition cost", "operating cost", "business model"]) { const response = row(); response.dimension_judgments[0].rationale = `The ${phrase} is a normal business-analysis consideration grounded in the authorized evidence.`; assert.equal(validate(response).ok, true, phrase); }
  });
  test("rejects explicit contestant, provider-model, telemetry, source, ranking, and campaign leakage", () => {
    const claims = ["GPT-6 Astra produced this response.", "GPT-5.6 Terra produced this response.", "OpenAI GPT is the provider model.", "The evaluator run latency was 123 ms.", "The model used 450 tokens.", "The API call cost was $0.02.", "This model ranked first and won the campaign.", "See source packet.json at ./sealed/packet.json."];
    for (const claim of claims) { const response = row(); response.dimension_judgments[0].rationale = claim; const result = validate(response); assert.equal(result.ok, false, claim); assert.match(result.errors.join("\n"), /prohibited/); }
  });
  test("separates high confidence in rubric application from insufficient underlying evidence", () => {
    assert.equal(validate(insufficient(1, "HIGH")).ok, true);
    assert.equal(validate(insufficient(1, "LOW")).ok, false, "low confidence requires its local signal");
    const low = insufficient(1, "LOW"); low.review_signals = ["INSUFFICIENT_EVIDENCE", "LOW_CONFIDENCE"]; assert.equal(validate(low).ok, true);
  });
  test("insufficient evidence constrains its substantive dimension to the existing 0–1 anchors", () => {
    const result = validate(insufficient(2)); assert.equal(result.ok, false); assert.match(result.errors.join("\n"), /constrained 0–1 anchor/);
  });
  test("low judgment confidence produces its required local review signal", () => {
    const response = row({ judgment_confidence: "LOW", review_signals: ["LOW_CONFIDENCE"], review_signal_dimension_ids: ["hidden_labor"], review_explanation: "Rubric application is locally uncertain." }); assert.equal(validate(response).ok, true);
  });
  test("schema and runtime reject unknown fields and invalid enums", () => {
    assert.deepEqual((FINAL_SUCCESSOR_SCORECARD_SCHEMA.properties.responses.items.properties.judgment_confidence as any).enum, JUDGMENT_CONFIDENCE_V22); assert.deepEqual((FINAL_SUCCESSOR_SCORECARD_SCHEMA.properties.responses.items.properties.evidence_sufficiency as any).enum, EVIDENCE_SUFFICIENCY_V22); assert.deepEqual((FINAL_SUCCESSOR_SCORECARD_SCHEMA.properties.responses.items.properties.review_signals.items as any).enum, REVIEW_SIGNALS_V22);
    const response: any = row({ judgment_confidence: "CERTAIN" }); response.unrecognized = true; assert.equal(validate(response).ok, false);
  });
  test("validation is blind to entry ordering and has no identity-map input", () => {
    const reversedBody = { packet_id: packet.packet_id, entries: [entry].reverse() }; const reversedPacket = { ...reversedBody, packet_hash: finalSuccessorPacketHash(reversedBody) }; const orderedCard = card(row(), reversedPacket); assert.equal(validateFinalSuccessorScorecard(orderedCard, reversedPacket, protocol).ok, true); assert.equal(Object.keys(validateFinalSuccessorScorecard).includes("identityMap"), false);
  });
  test("preserves every protocol-007 and protocol-009 historical artifact byte-for-byte", () => {
    const root = process.cwd(); const expected: Record<string, string> = {
      "var/artifacts/opportunity-qualifier-evaluator-v2/packet-manifest.json": "542f15a9ddf00d172a484ec73dfc01c0d8bea2e1ca92d882386ae3f774f173cc", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-blind-01.json": "ad38198a40c182c02b058f1a72f19651bf48365ed0ea41af25dc2cb0a69d86c2", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-blind-02.json": "00a404e36169c4724f7df046d04eb8a30264502af4820d4d12a4d024fc0dc3bd", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-blind-03.json": "3a0ce8effbd2a9fcdba27a1873561444f862cd94aab3ebb47a946d18b0146b06", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-blind-04.json": "6b9a5d15948dfd590e2f7c30757b473aa3773200a1c39a738274afbf1ab85f66", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-blind-05.json": "7ccacc0d178e55d4c30e539d219ddb5c121e2ec47ff31fb08c48f140330c1ea8", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-scorecard-01.provenance.json": "cae54994acf5bca6bbfd36153c642957287b2798aa943f21da63422c022eee17", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-scorecard-01.raw.json": "17b7da67bb4e25d7b52adbc84ced00628faf80419f1bc05b494f288f2f58cdf3", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-scorecard-01.replay.json": "18c52b773bddaa6d5770ed806c6a844a667cd933023a1608c72d5ba75282a978", "var/artifacts/opportunity-qualifier-evaluator-v2/primary-scorecard-01.validation.json": "9cd2f3756d6bfcd89cc93fad0bb423deeac93ce6c23ae927efe9563c8ba5a6ac", "var/artifacts/opportunity-qualifier-evaluator-v2/sealed-identity-map.json": "4505cb5560fa69b89437cd35cd994427f37ccc7d17793cea4b2967564e3a98ad",
      "var/artifacts/opportunity-qualifier-evaluator-v2-1/packet-manifest.json": "bd7041258944db118f65f2f8ceccaf2ef9a703d36a3645c14979faa8a3e0440e", "var/artifacts/opportunity-qualifier-evaluator-v2-1/primary-blind-01.json": "1ee2354ed6b976dd4920f80ced9808d4e436635efa274d5e19441cd7a21c70fd", "var/artifacts/opportunity-qualifier-evaluator-v2-1/primary-blind-02.json": "c64af38174d7809cf3acedc695c2dd0ed96d80e4c312e8efa0bd083d521f7d66", "var/artifacts/opportunity-qualifier-evaluator-v2-1/primary-blind-03.json": "f0b88b4af6c1d500e7afeb7d9b9c66c18aea8d5ba735ad43ab84702881bea9c6", "var/artifacts/opportunity-qualifier-evaluator-v2-1/primary-blind-04.json": "5a39f0d33a4d26db8dc4431bacab640f2061b05e2e16c07aa1497f24b3097501", "var/artifacts/opportunity-qualifier-evaluator-v2-1/primary-blind-05.json": "4e8ead0ed587954b2a52af587199c8996291e4eb12b034e52989c480550e5bfc", "var/artifacts/opportunity-qualifier-evaluator-v2-1/sealed-identity-map.json": "fe4214d5981595cafaf5c9183505d70e8739df5f439511b9d9becbc984af03e0", "var/artifacts/opportunity-qualifier-evaluator-v2-1/successor-primary-scorecard-01.operator-provenance.json": "67079f89bcdc30234ab15bf05133a773f97a2e16850a3d5d25c9d3b5493f482b", "var/artifacts/opportunity-qualifier-evaluator-v2-1/successor-primary-scorecard-01.raw.json": "1037c860d32b0f1b4455751e1698534ada7d2f98c5ca222689228eed0e44fc8b", "var/artifacts/opportunity-qualifier-evaluator-v2-1/successor-primary-scorecard-01.validation.json": "d68060ae293de4a9cc044f3f01e139c97621a0ffc3ae25f1e7871397759c0c04"
    }; for (const [file, fingerprint] of Object.entries(expected)) assert.equal(hash(resolve(root, file)), fingerprint, file);
  });
  test("new validation artifacts are complete canonical UTF-8 JSON and reject literal backslash-n", () => {
    const raw = serializeCanonicalValidationRecord({ artifact_type: "synthetic-validation", result: "VALID" }); assert.equal(validationArtifactIntegrity(raw).ok, true); assert.equal(validationArtifactIntegrity(`${raw}${String.fromCharCode(92, 110)}`).ok, false); assert.doesNotThrow(() => JSON.parse(raw));
  });
});

describe("final successor packet regeneration", () => {
  test("regenerates all 112 responses exactly once, losslessly and deterministically with a verified recovery copy", () => {
    const root = process.cwd(), args = ["--import", "./tools/register-ts.mjs", "tools/opportunity-qualification-evaluator-v2-2.mjs"]; execFileSync(process.execPath, [...args, "generate"], { cwd: root, stdio: "pipe" }); const first = readFileSync(resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-2/packet-manifest.json")); const output = execFileSync(process.execPath, [...args, "verify"], { cwd: root, encoding: "utf8" }); assert.match(output, /"ok": true/); assert.match(output, /"response_count": 112/); execFileSync(process.execPath, [...args, "generate"], { cwd: root, stdio: "pipe" }); assert.deepEqual(readFileSync(resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-2/packet-manifest.json")), first);
  });
});
