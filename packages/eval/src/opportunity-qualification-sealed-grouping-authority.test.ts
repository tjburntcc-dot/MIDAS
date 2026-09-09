import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { EVALUATOR_DIMENSIONS } from "./opportunity-qualification-evaluator-v2.ts";
import { planSecondaryReview } from "./opportunity-qualification-evaluator-v2-1.ts";
import { adaptOpaqueGroupingForSecondaryPlanner, opaqueComparisonGroupId, validateOpaqueGroupingArtifact } from "./opportunity-qualification-sealed-grouping-authority.ts";
import { deriveOpaqueGroupingFromSealedAuthority, safelyRunSealedCustodian } from "./opportunity-qualification-sealed-grouping-custodian.ts";

const hash = (letter: string) => letter.repeat(64);
const ids = ["C-0000000000000001", "C-0000000000000002", "C-0000000000000003", "C-0000000000000004"];
const cases = Array.from({ length: 28 }, (_, index) => `CASE-${String(index + 1).padStart(2, "0")}`);
function fixture() {
  const arms = ["synthetic-arm-a", "synthetic-arm-a", "synthetic-arm-b", "synthetic-arm-b"];
  const sourceHashes = [hash("a"), hash("b"), hash("c"), hash("d")];
  const packetHashes = [hash("e"), hash("f")];
  return {
    sealed_map: { sealed: true, protocol_hash: hash("0"), mappings: ids.map((opaque_contestant_id, index) => ({ opaque_contestant_id, source_substantive_hash: sourceHashes[index], source_ref: `SYNTHETIC-SEALED-IDENTITY-${index + 1}` })) },
    sources: ids.map((_, index) => ({ source_substantive_hash: sourceHashes[index], arm: arms[index], source_packet_fingerprint: packetHashes[index < 2 ? 0 : 1], case_ids: cases.slice() })),
    source_packets: [{ arm: "synthetic-arm-a", packet_fingerprint: packetHashes[0] }, { arm: "synthetic-arm-b", packet_fingerprint: packetHashes[1] }],
    expected_primary_pairs: ids.flatMap((id) => cases.map((case_id) => `${id}|${case_id}`)),
    protocol_010_hash: hash("0"), packet_manifest_hash: hash("1"), evidence_fingerprint: hash("2"), evidence_raw_sha256: hash("3"), gate_finding_set_sha256: hash("4"), sealed_source_hashes: [hash("5"), hash("6")], frozen_runs_per_arm: 2, frozen_cases_per_run: 28, implementation_version: "synthetic-v1", implementation_hash: hash("7")
  };
}

describe("sealed opaque grouping authority", () => {
  test("derives exactly four contestants, two anonymous groups, and 112 locked memberships", () => {
    const artifact = deriveOpaqueGroupingFromSealedAuthority(fixture());
    assert.equal(validateOpaqueGroupingArtifact(artifact).ok, true);
    assert.equal(artifact.opaque_structure.length, 4);
    assert.equal(new Set(artifact.opaque_structure.map((x) => x.opaque_comparison_group_id)).size, 2);
    assert.equal(new Set(artifact.opaque_structure.flatMap((x) => x.case_ids.map((case_id) => `${x.opaque_contestant_id}|${case_id}`))).size, 112);
    for (const entry of artifact.opaque_structure) assert.equal(entry.case_ids.length, 28);
  });

  test("is deterministic under input and member reordering and ignores changed sealed identity labels", () => {
    const first = deriveOpaqueGroupingFromSealedAuthority(fixture());
    const changed = fixture(); changed.sealed_map.mappings.reverse(); changed.sources.reverse(); changed.source_packets.reverse(); changed.expected_primary_pairs.reverse(); changed.sealed_map.mappings.forEach((item, index) => { item.source_ref = `CHANGED-SEALED-LABEL-${index}`; });
    const second = deriveOpaqueGroupingFromSealedAuthority(changed);
    assert.deepEqual(second, first);
    assert.equal(opaqueComparisonGroupId([ids[0], ids[1]]), opaqueComparisonGroupId([ids[1], ids[0]]));
  });

  test("changes the fingerprint when authoritative membership changes and fails closed on conflicts or missing membership", () => {
    const first = deriveOpaqueGroupingFromSealedAuthority(fixture());
    const changed = fixture(); changed.sources[1].arm = "synthetic-arm-b"; changed.sources[1].source_packet_fingerprint = changed.source_packets[1].packet_fingerprint; changed.sources[2].arm = "synthetic-arm-a"; changed.sources[2].source_packet_fingerprint = changed.source_packets[0].packet_fingerprint;
    const second = deriveOpaqueGroupingFromSealedAuthority(changed);
    assert.notEqual(second.canonical_artifact_fingerprint, first.canonical_artifact_fingerprint);
    const conflict = fixture(); conflict.sources[0].arm = "unmatched-arm";
    assert.equal(safelyRunSealedCustodian(() => deriveOpaqueGroupingFromSealedAuthority(conflict)).ok, false);
    const missing = fixture(); missing.expected_primary_pairs.pop();
    assert.equal(safelyRunSealedCustodian(() => deriveOpaqueGroupingFromSealedAuthority(missing)).ok, false);
    const wrongFrozenPolicy = fixture(); wrongFrozenPolicy.frozen_runs_per_arm = 1;
    assert.equal(safelyRunSealedCustodian(() => deriveOpaqueGroupingFromSealedAuthority(wrongFrozenPolicy)).ok, false);
  });

  test("strictly rejects unknown, identity-bearing, score, rationale, signal, telemetry, ranking, and winner fields", () => {
    const baseline = deriveOpaqueGroupingFromSealedAuthority(fixture());
    for (const forbidden of ["model", "provider", "source_label", "source_filename", "source_path", "score", "rationale", "signal", "telemetry", "ranking", "winner"]) {
      const altered: any = structuredClone(baseline); altered[forbidden] = "synthetic";
      assert.equal(validateOpaqueGroupingArtifact(altered).ok, false, forbidden);
    }
    const inner: any = structuredClone(baseline); inner.opaque_structure[0].model = "synthetic";
    assert.equal(validateOpaqueGroupingArtifact(inner).ok, false);
  });

  test("contains no sealed labels and never releases them through a sanitized error", () => {
    const source = fixture(); const artifact = deriveOpaqueGroupingFromSealedAuthority(source);
    assert.equal(JSON.stringify(artifact).includes(source.sealed_map.mappings[0].source_ref), false);
    const bad = fixture(); bad.sealed_map.mappings[0].source_ref = "UNIQUE-SEALED-SENTINEL"; bad.sources[0].case_ids.pop();
    const result = safelyRunSealedCustodian(() => deriveOpaqueGroupingFromSealedAuthority(bad));
    assert.deepEqual(result, { ok: false, code: "SEALED_AUTHORITY_VALIDATION_FAILED" });
    assert.equal(JSON.stringify(result).includes("UNIQUE-SEALED-SENTINEL"), false);
  });

  test("public planner adapter rejects the sealed schema and preserves only validated opaque structure", () => {
    const artifact = deriveOpaqueGroupingFromSealedAuthority(fixture());
    assert.equal(adaptOpaqueGroupingForSecondaryPlanner(fixture().sealed_map).ok, false);
    const adapted = adaptOpaqueGroupingForSecondaryPlanner(artifact);
    assert.equal(adapted.ok, true);
    if (!adapted.ok) throw new Error("unreachable");
    assert.deepEqual(adapted.opaque_structure, artifact.opaque_structure);
    assert.equal(JSON.stringify(adapted).includes("source_ref"), false);
  });

  test("a synthetic planner accepts the public opaque structure without sealed-map access", () => {
    const artifact = deriveOpaqueGroupingFromSealedAuthority(fixture());
    const adapted = adaptOpaqueGroupingForSecondaryPlanner(artifact); assert.equal(adapted.ok, true); if (!adapted.ok) return;
    const scorecards = ids.map((opaque_contestant_id) => ({ responses: cases.map((case_id) => ({ opaque_contestant_id, case_id, dimension_judgments: EVALUATOR_DIMENSIONS.map(([dimension_id]) => ({ dimension_id, score: 3 })), review_signals: [], review_signal_dimension_ids: [] })) }));
    const result = planSecondaryReview({ validated_primary_scorecards: scorecards, opaque_structure: adapted.opaque_structure });
    assert.equal(result.status, "NO_SECONDARY_REVIEW_MATERIAL");
  });
});
