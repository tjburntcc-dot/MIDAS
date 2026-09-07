import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { preregisterCampaign, syntheticCampaignFixtures } from "./opportunity-qualification-campaign.ts";
import { migrateV1ResponseToV2, selectCampaignWinnerV2, unknownInteractiveMeasurement, unknownInteractiveTelemetry, validateTelemetryMeasurement, validateV2Artifact } from "./opportunity-qualification-telemetry-v2.ts";

const fixtures = syntheticCampaignFixtures();
const identity = { model: "unexecuted", prompt: "frozen", knowledge: "v1", tools: "none", policy: "record-only" };
const spec = preregisterCampaign({ ...fixtures, specialist_identity: identity, frontier_identity: identity, playbook: { version: "v1" } });
const provenance = { source: "provider-export", basis: "whole-run wall clock", unit: "ms", scope: "one complete run", observation_reference: "obs-1" };
const measured = (value: number, unit = "ms") => ({ status: "measured", value, provenance: { ...provenance, unit } });
const run = (quality = 80, telemetry = unknownInteractiveTelemetry(), critical_failures: string[] = []) => ({ quality, telemetry, critical_failures, complete_provenance: true });
const pair = (quality = 80, telemetry = unknownInteractiveTelemetry()) => [run(quality, telemetry), run(quality, telemetry)];

describe("v2 versioned unknown telemetry contract", () => {
  test("accepts valid measured and valid unknown/not-applicable values", () => {
    assert.equal(validateTelemetryMeasurement("latency_ms", measured(5)).ok, true);
    assert.equal(validateTelemetryMeasurement("latency_ms", unknownInteractiveMeasurement()).ok, true);
    assert.equal(validateTelemetryMeasurement("latency_ms", { status: "not_applicable", value: null, provenance: null }).ok, true);
  });
  test("rejects invalid status/value/provenance combinations and units", () => {
    assert.equal(validateTelemetryMeasurement("latency_ms", { ...measured(0), value: null }).ok, false);
    assert.equal(validateTelemetryMeasurement("latency_ms", measured(-1)).ok, false);
    assert.equal(validateTelemetryMeasurement("latency_ms", { ...unknownInteractiveMeasurement(), value: 0 }).ok, false);
    assert.equal(validateTelemetryMeasurement("latency_ms", { status: "unknown", value: null, provenance: null }).ok, false);
    assert.equal(validateTelemetryMeasurement("latency_ms", { status: "measured", value: 1, provenance: null }).ok, false);
    assert.equal(validateTelemetryMeasurement("latency_ms", measured(1, "seconds")).ok, false);
  });
  test("unknown telemetry never wins, loses, or redistributes a tie-break weight", () => {
    const unknown = unknownInteractiveTelemetry();
    const result = selectCampaignWinnerV2({ spec, specialist: pair(80, unknown), frontier: pair(80, unknown), evaluator_reliable: true });
    assert.equal(result.selection, "INSUFFICIENT_COMPARABLE_EVIDENCE");
    assert.equal(result.telemetry_evidence.every((item: any) => !item.eligible), true);
    const inputOnly = { ...unknownInteractiveTelemetry(), input_tokens: { status: "measured", value: 10, provenance: { ...provenance, unit: "tokens" } } };
    const inputResult = selectCampaignWinnerV2({ spec, specialist: pair(80, inputOnly), frontier: pair(80, inputOnly), evaluator_reliable: true });
    assert.equal(inputResult.selection, "INSUFFICIENT_COMPARABLE_EVIDENCE");
    assert.equal(inputResult.telemetry_evidence.find((item: any) => item.metric === "input_tokens").eligible, true);
  });
  test("one unmeasured contestant disables the metric for every contestant", () => {
    const fullyMeasured = { ...unknownInteractiveTelemetry(), latency_ms: measured(1) };
    const result = selectCampaignWinnerV2({ spec, specialist: pair(80, fullyMeasured), frontier: pair(80, unknownInteractiveTelemetry()), evaluator_reliable: true });
    const latency = result.telemetry_evidence.find((item: any) => item.metric === "latency_ms");
    assert.equal(latency.eligible, false); assert.match(latency.reason, /unmeasured/);
  });
  test("latency only participates for complete compatible measured data", () => {
    const fast = { ...unknownInteractiveTelemetry(), latency_ms: measured(50) };
    const slow = { ...unknownInteractiveTelemetry(), latency_ms: measured(100) };
    const result = selectCampaignWinnerV2({ spec, specialist: pair(80, fast), frontier: pair(80, slow), evaluator_reliable: true });
    assert.equal(result.selection, "SPECIALIST_SELECTED");
    const incompatible = { ...unknownInteractiveTelemetry(), latency_ms: { ...measured(100), provenance: { ...measured(100).provenance, basis: "per-case" } } };
    const incompatibleResult = selectCampaignWinnerV2({ spec, specialist: pair(80, fast), frontier: pair(80, incompatible), evaluator_reliable: true });
    assert.equal(incompatibleResult.selection, "INSUFFICIENT_COMPARABLE_EVIDENCE");
  });
  test("unknown cost and tokens behave as unavailable metrics, while critical gates still dominate", () => {
    const tie = selectCampaignWinnerV2({ spec, specialist: pair(80), frontier: pair(80), evaluator_reliable: true });
    assert.equal(tie.selection, "INSUFFICIENT_COMPARABLE_EVIDENCE");
    const gate = selectCampaignWinnerV2({ spec, specialist: [run(99, unknownInteractiveTelemetry(), ["fabricated_evidence"]), run(99)], frontier: pair(70), evaluator_reliable: true });
    assert.equal(gate.selection, "FRONTIER_SELECTED");
  });
  test("legitimate unresolved ties remain non-winners independent of contestant ordering", () => {
    const telemetry = { ...unknownInteractiveTelemetry(), latency_ms: measured(100) };
    const first = selectCampaignWinnerV2({ spec, specialist: pair(80, telemetry), frontier: pair(80, telemetry), evaluator_reliable: true });
    const second = selectCampaignWinnerV2({ spec, specialist: pair(80, telemetry).reverse(), frontier: pair(80, telemetry).reverse(), evaluator_reliable: true });
    assert.equal(first.selection, "TIE"); assert.equal(second.selection, "TIE");
  });
});

describe("deterministic four-artifact migration", () => {
  const root = process.cwd();
  const v1 = resolve(root, "var/artifacts/opportunity-qualifier-qualification-v1");
  const sources = [
    ["specialist", "specialist-sealed-response-run-1.raw\\.json", "specialist-sealed-packet.json", "specialist-run-1", "GPT-5.6 Terra High"],
    ["specialist", "specialist-sealed-response-run-2.raw\\.json", "specialist-sealed-packet.json", "specialist-run-2", "GPT-5.6 Terra High"],
    ["frontier", "frontier-sealed-response-run-1.raw.json", "frontier-sealed-packet.json", "frontier-run-1", "GPT-6 Astra Medium"],
    ["frontier", "frontier-sealed-response-run-2.raw.json", "frontier-sealed-packet.json", "frontier-run-2", "GPT-6 Astra Medium"],
  ] as const;
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
  test("migrates all preserved sources losslessly and idempotently without changing raw files", () => {
    let cases = 0;
    for (const [arm, sourceName, packetName, runId, model] of sources) {
      const sourcePath = resolve(v1, sourceName), before = hash(sourcePath), source = JSON.parse(readFileSync(sourcePath, "utf8")), packet = JSON.parse(readFileSync(resolve(v1, packetName), "utf8"));
      const args: any = { source, source_raw_sha256: before, arm, run_id: runId, operator_attested_selected_model: model, source_packet_fingerprint: packet.packet_fingerprint };
      const first = migrateV1ResponseToV2(args), second = migrateV1ResponseToV2(args);
      assert.deepEqual(first, second); assert.equal(hash(sourcePath), before); assert.equal(first.responses.length, 28); cases += first.responses.length;
      assert.equal(first.migration.zero_substantive_differences, true); assert.equal(first.migration.substantive_pre_hash, first.migration.substantive_post_hash);
      assert.equal(first.run.model_identity.operator_attested_selected_model, model);
      assert.equal(first.run.telemetry.latency_ms.value, null); assert.equal(first.run.telemetry.latency_ms.status, "unknown_unmeasured_interactive_session");
      assert.equal(validateV2Artifact(packet, first).ok, true);
    }
    assert.equal(cases, 112);
  });
});
