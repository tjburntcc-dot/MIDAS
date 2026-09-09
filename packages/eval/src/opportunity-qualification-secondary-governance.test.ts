import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalHash, EVALUATOR_DIMENSIONS } from "./opportunity-qualification-evaluator-v2.ts";
import { planSecondaryReview } from "./opportunity-qualification-evaluator-v2-1.ts";
import {
  FINAL_SUCCESSOR_SCORECARD_SCHEMA,
  finalSuccessorPacketHash,
  finalSuccessorProtocol,
  finalSuccessorScoreAnchor,
} from "./opportunity-qualification-evaluator-v2-2.ts";
import {
  OQ_OPAQUE_GROUP_DERIVATION_RULE,
  OQ_OPAQUE_GROUPING_CONTRACT_ID,
  OQ_OPAQUE_GROUPING_CONTRACT_VERSION,
  canonicalOpaqueGroupingFingerprint,
  opaqueComparisonGroupId,
} from "./opportunity-qualification-sealed-grouping-authority.ts";
import {
  APPROVED_SECONDARY_PLANNER,
  FROZEN_SECONDARY_POLICY,
  PROTOCOL_010_SECONDARY_TRUST_ROOT,
  buildGovernedSecondaryPacket,
  canonicalJson,
  governProtocol010SecondaryPlan,
  governSecondaryPlanAgainstTrustedRoot,
  validateGovernedSecondaryPlan,
  validateStrictSecondaryPacket,
  validateStrictSecondaryPacketManifest,
  type GovernedPlannerEvidence,
  type SecondaryGovernanceTrustRoot,
} from "./opportunity-qualification-secondary-governance.ts";
import { preregisterCampaign, syntheticCampaignFixtures } from "./opportunity-qualification-campaign.ts";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const ids = ["C-0000000000000001", "C-0000000000000002", "C-0000000000000003", "C-0000000000000004"];
const caseIds = Array.from({ length: 28 }, (_, n) => `SYN-${String(n + 1).padStart(2, "0")}`);
const partitions = [18, 19, 17, 29, 29];

function validationRecord(body: Record<string, unknown>) {
  return { ...body, canonical_validation_fingerprint: canonicalHash(body) };
}

function fixture(secondaryMaterial = true) {
  const campaignFixtures = syntheticCampaignFixtures();
  const identity = { model: "synthetic", prompt: "synthetic", knowledge: "synthetic", tools: "none", policy: "record-only" };
  const spec = preregisterCampaign({ ...campaignFixtures, specialist_identity: identity, frontier_identity: identity, playbook: { version: "synthetic" } });
  const protocol = finalSuccessorProtocol(spec, ["a".repeat(64), "b".repeat(64)]);
  const structures = ids.map((id, n) => ({
    opaque_contestant_id: id,
    case_ids: caseIds.slice(),
    opaque_comparison_group_id: opaqueComparisonGroupId(n < 2 ? ids.slice(0, 2) : ids.slice(2, 4)),
  }));
  const allEntries = structures.flatMap((structure) => structure.case_ids.map((caseId) => ({
    opaque_contestant_id: structure.opaque_contestant_id,
    case: { case_id: caseId, title: `Synthetic ${caseId}`, evidence: [{ id: `${caseId}-E1`, source: "synthetic-fixture", captured_at: "2026-01-01T00:00:00.000Z", text: "Synthetic evidence only." }] },
    response: { case_id: caseId, disposition: "validate", decision_rationale: "Synthetic response only.", evidence_ids: [`${caseId}-E1`], unknowns: [], cheap_decisive_validation: "Synthetic check.", authority_requirements: [], economic_assessment: { revenue_usd: null, contribution_margin_pct: null, owner_minutes: null, assumptions: [] } },
  })));
  const packets: any[] = []; const cards: any[] = []; let offset = 0;
  for (let n = 0; n < partitions.length; n++) {
    const entries = allEntries.slice(offset, offset + partitions[n]); offset += partitions[n];
    const packetBody = { packet_id: `SYN-PACKET-${n + 1}`, packet_kind: "blind_primary_evaluator_packet", protocol, response_contract: FINAL_SUCCESSOR_SCORECARD_SCHEMA, clean_session_prompt: "Synthetic primary evaluation only.", entries };
    const packet = { ...packetBody, packet_hash: finalSuccessorPacketHash(packetBody) };
    const responses = entries.map((entry) => {
      const uncertain = secondaryMaterial && entry.opaque_contestant_id === ids[0];
      const affected = uncertain ? ["buyer_access", "disposition_quality"] : [];
      return {
        opaque_contestant_id: entry.opaque_contestant_id,
        case_id: entry.case.case_id,
        dimension_judgments: EVALUATOR_DIMENSIONS.map(([dimensionId]) => ({ dimension_id: dimensionId, score: 3, anchor: finalSuccessorScoreAnchor(dimensionId, 3), evidence_ids: [`${entry.case.case_id}-E1`], rationale: "The supplied evidence supports this anchored judgment." })),
        observed_contradiction_ids: [],
        evidence_sufficiency: uncertain ? "LIMITED" : "SUFFICIENT",
        evidence_sufficiency_dimension_ids: affected,
        judgment_confidence: "HIGH",
        critical_failure: "NO_CRITICAL_FAILURE",
        review_signals: uncertain ? ["AMBIGUITY"] : [],
        review_signal_dimension_ids: affected,
        review_explanation: uncertain ? "The supplied evidence leaves a bounded ambiguity." : "No response-local review signal is present.",
        validation_status: "VALID",
      };
    });
    const card = { evaluator_protocol_id: protocol.protocol_id, evaluator_run_id: `SYN-RUN-${n + 1}`, packet_id: packet.packet_id, packet_hash: packet.packet_hash, protocol_hash: protocol.protocol_hash, independence_attestation: "INDEPENDENT_BLIND_SESSION", operator_attestation: { operator_attested_evaluator_identity: "synthetic-evaluator", provider_reported_identity: null, observed_output_timestamp: null, telemetry_v2: {}, response_count: responses.length }, responses };
    packets.push(packet); cards.push(card);
  }
  const packetRaws = packets.map(canonicalJson); const cardRaws = cards.map(canonicalJson);
  const membership = structures.flatMap((x) => x.case_ids.map((caseId) => `${x.opaque_contestant_id}|${caseId}`)).sort();
  const packetManifestHash = "c".repeat(64);
  const primaryManifestBody = {
    admissions: cards.map((card, n) => ({ admission_fingerprint: sha(`admission-${n}`), packet_id: card.packet_id, raw_scorecard_sha256: sha(cardRaws[n]) })),
    artifact_type: "synthetic-complete-primary-evidence-manifest",
    expected_response_count: 112,
    identity_and_telemetry_excluded: true,
    manifest_hash: packetManifestHash,
    membership_set_sha256: sha(membership.join("\n")),
    ordering_invariant: true,
    packet_contributions: packets.map((packet, n) => ({ packet_hash: packet.packet_hash, packet_id: packet.packet_id, packet_raw_sha256: sha(packetRaws[n]), response_count: cards[n].responses.length })),
    primary_scorecard_count: 5,
    protocol_hash: protocol.protocol_hash,
    protocol_id: protocol.protocol_id,
    provenance_record_sha256: packets.map((_, n) => ({ run: n + 1, sha256: sha(`provenance-${n}`) })),
    required_dimension_judgment_count: 1008,
    unique_opaque_contestant_case_pair_count: 112,
  };
  const primaryManifest = validationRecord(primaryManifestBody); const primaryManifestRaw = canonicalJson(primaryManifest);
  const findingSet = [{ code: "SYNTHETIC_NONCRITICAL", critical: false, deterministic_evaluator_conflict: false }];
  const findingSetRaw = canonicalJson(findingSet);
  const gateBody = { all_critical_gates_passed: true, artifact_type: "synthetic-deterministic-case-gates", critical_finding_count: 0, gate_findings_set_sha256: sha(findingSetRaw), identity_and_telemetry_excluded: true, input_response_count: 112, no_quality_points_invented: true, no_score_or_rationale_disclosed: true, opaque_run_count: 4, protocol_hash: protocol.protocol_hash, protocol_id: protocol.protocol_id, total_finding_count: findingSet.length };
  const gateRecord = validationRecord(gateBody); const gateRecordRaw = canonicalJson(gateRecord);
  const groupingBody: any = { contract_id: OQ_OPAQUE_GROUPING_CONTRACT_ID, semantic_version: OQ_OPAQUE_GROUPING_CONTRACT_VERSION, protocol_010_id: protocol.protocol_id, protocol_010_hash: protocol.protocol_hash, packet_manifest_hash: packetManifestHash, complete_primary_evidence_canonical_fingerprint: primaryManifest.canonical_validation_fingerprint, complete_primary_evidence_raw_sha256: sha(primaryManifestRaw), deterministic_gate_finding_set_sha256: sha(findingSetRaw), sealed_source_hashes: ["d".repeat(64)], custodian_implementation_version: "synthetic-1.0.0", custodian_implementation_hash: "e".repeat(64), derivation_rule_id: OQ_OPAQUE_GROUP_DERIVATION_RULE, opaque_structure: structures };
  const grouping = { ...groupingBody, canonical_artifact_fingerprint: canonicalOpaqueGroupingFingerprint(groupingBody) }; const groupingRaw = canonicalJson(grouping);
  const root: SecondaryGovernanceTrustRoot = { trust_root_id: "SYNTHETIC-INDEPENDENT-TRUST-ROOT", protocol_hash: protocol.protocol_hash, packet_manifest_hash: packetManifestHash, primary_evidence_canonical_fingerprint: primaryManifest.canonical_validation_fingerprint, primary_evidence_raw_sha256: sha(primaryManifestRaw), membership_set_sha256: primaryManifest.membership_set_sha256, deterministic_gate_record_canonical_fingerprint: gateRecord.canonical_validation_fingerprint, deterministic_gate_record_raw_sha256: sha(gateRecordRaw), deterministic_gate_finding_set_sha256: sha(findingSetRaw), opaque_grouping_canonical_fingerprint: grouping.canonical_artifact_fingerprint, opaque_grouping_raw_sha256: sha(groupingRaw), custodian_implementation_hash: grouping.custodian_implementation_hash, approved_planner_source_sha256: APPROVED_SECONDARY_PLANNER.baseline_source_sha256 };
  const evidence: GovernedPlannerEvidence = { protocol, primary_evidence_manifest_raw: primaryManifestRaw, deterministic_gate_record_raw: gateRecordRaw, deterministic_gate_finding_set_raw: findingSetRaw, opaque_grouping_raw: groupingRaw, primary_batches: packets.map((_, n) => ({ packet_raw: packetRaws[n], scorecard_raw: cardRaws[n] })) };
  return { root, evidence, protocol, packets, cards, grouping, primaryManifest, gateRecord, findingSetRaw };
}

describe("Mission 016 governed planner synthetic end-to-end path", () => {
  test("validated evidence produces a canonical governed plan and exact minimal packet", () => {
    const f = fixture(); const governed = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root);
    assert.equal(governed.ok, true); if (!governed.ok) return;
    assert.equal(governed.plan.decision.status, "SECONDARY_REVIEW_AUTHORIZED");
    assert.equal(governed.plan.decision.secondary_reviews.length, 28);
    assert.equal(governed.plan.decision.secondary_reviews.every((x: any) => x.affected_dimension_ids.length === 2), true);
    assert.equal(governed.canonical_plan_bytes, canonicalJson(governed.plan));
    assert.equal(governed.plan_raw_sha256, sha(governed.canonical_plan_bytes));
    const packet = buildGovernedSecondaryPacket({ plan_raw: governed.canonical_plan_bytes, plan_raw_sha256: governed.plan_raw_sha256, evidence: f.evidence }, f.root);
    assert.equal(packet.ok, true, JSON.stringify(packet)); if (!packet.ok) return;
    assert.equal(packet.packet.entries.length, 28);
    assert.equal(packet.packet.entries.reduce((n: number, x: any) => n + x.requested_dimension_ids.length, 0), 56);
    assert.equal(validateStrictSecondaryPacket(packet.packet, governed.plan, f.protocol).ok, true);
    assert.equal(validateStrictSecondaryPacketManifest(packet.canonical_manifest_bytes, packet.manifest_raw_sha256, packet.canonical_packet_bytes, governed.plan_raw_sha256, f.root).ok, true);
  });

  test("governed decisions remain semantically equal to the approved planner", () => {
    const f = fixture(); const governed = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root);
    assert.equal(governed.ok, true); if (!governed.ok) return;
    assert.deepEqual(governed.plan.decision, planSecondaryReview(governed.planner_input));
    assert.deepEqual(governed.plan.policy, FROZEN_SECONDARY_POLICY);
  });

  test("reordering independent batches deterministically replays identical bytes", () => {
    const f = fixture(); const first = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root);
    const reordered = governSecondaryPlanAgainstTrustedRoot({ ...f.evidence, primary_batches: f.evidence.primary_batches.slice().reverse() }, f.root);
    assert.equal(first.ok, true); assert.equal(reordered.ok, true);
    if (first.ok && reordered.ok) { assert.equal(reordered.canonical_plan_bytes, first.canonical_plan_bytes); assert.equal(reordered.plan_raw_sha256, first.plan_raw_sha256); }
  });

  test("a no-material-review result cannot manufacture a packet", () => {
    const f = fixture(false); const governed = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root);
    assert.equal(governed.ok, true); if (!governed.ok) return;
    assert.equal(governed.plan.decision.status, "NO_SECONDARY_REVIEW_MATERIAL");
    assert.equal(buildGovernedSecondaryPacket({ plan_raw: governed.canonical_plan_bytes, plan_raw_sha256: governed.plan_raw_sha256, evidence: f.evidence }, f.root).ok, false);
  });
});

describe("Mission 016 adversarial governance", () => {
  test("malformed byte inputs fail closed without leaking exception text", () => {
    let result: any;
    assert.doesNotThrow(() => { result = governProtocol010SecondaryPlan({} as GovernedPlannerEvidence); });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes("TypeError"), false);
  });

  test("a coherent self-computed fixture cannot nominate itself as official Protocol-010 evidence", () => {
    const f = fixture();
    assert.equal(governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root).ok, true);
    const official = governProtocol010SecondaryPlan(f.evidence);
    assert.equal(official.ok, false);
    if (!official.ok) assert.equal(official.errors.some((x) => /trusted|frozen binding|protocol/.test(x)), true);
    assert.notEqual(f.root.protocol_hash, PROTOCOL_010_SECONDARY_TRUST_ROOT.protocol_hash);
  });

  test("rejects policy substitution even when the caller recomputes the protocol hash", () => {
    const f = fixture(); const protocol: any = structuredClone(f.protocol); protocol.frozen_policy.minimum_competence = 1; const { protocol_hash: _old, ...body } = protocol; protocol.protocol_hash = canonicalHash(body);
    const root = { ...f.root, protocol_hash: protocol.protocol_hash }; const evidence = { ...f.evidence, protocol };
    const result = governSecondaryPlanAgainstTrustedRoot(evidence, root);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.errors.some((x) => x.includes("frozen policy")), true);
  });

  test("rejects a missing gate-finding preimage instead of treating it as no conflicts", () => {
    const f = fixture(); const result = governSecondaryPlanAgainstTrustedRoot({ ...f.evidence, deterministic_gate_finding_set_raw: "[]" }, f.root);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.errors.some((x) => x.includes("gate finding set: trusted raw SHA-256 mismatch")), true);
  });

  test("rejects grouping unknown fields and synthetic sealed-identity canaries", () => {
    const f = fixture(); const grouping: any = structuredClone(f.grouping); grouping.sealed_identity = "SYNTHETIC-CANARY-DO-NOT-LEAK";
    const raw = canonicalJson(grouping); const root = { ...f.root, opaque_grouping_raw_sha256: sha(raw) };
    const result = governSecondaryPlanAgainstTrustedRoot({ ...f.evidence, opaque_grouping_raw: raw }, root);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.errors.some((x) => x.includes("strict contract validation failed")), true);
    assert.equal(JSON.stringify(result).includes("SYNTHETIC-CANARY-DO-NOT-LEAK"), false);
  });

  test("rejects raw-byte, membership, scorecard, and canonical-plan tampering", () => {
    const f = fixture();
    const missing = { ...f.evidence, primary_batches: f.evidence.primary_batches.slice(0, 4) };
    assert.equal(governSecondaryPlanAgainstTrustedRoot(missing, f.root).ok, false);
    const changedCard = structuredClone(f.evidence); changedCard.primary_batches[0].scorecard_raw += " ";
    assert.equal(governSecondaryPlanAgainstTrustedRoot(changedCard, f.root).ok, false);
    const governed = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root); assert.equal(governed.ok, true); if (!governed.ok) return;
    assert.equal(validateGovernedSecondaryPlan(`${governed.canonical_plan_bytes} `, governed.plan_raw_sha256, f.root).ok, false);
    const parsed: any = JSON.parse(governed.canonical_plan_bytes); parsed.unknown = true; const altered = canonicalJson(parsed);
    assert.equal(validateGovernedSecondaryPlan(altered, sha(altered), f.root).ok, false);
  });

  test("strict builder rejects missing source coverage and altered dimensions", () => {
    const f = fixture(); const governed = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root); assert.equal(governed.ok, true); if (!governed.ok) return;
    const missingEvidence = structuredClone(f.evidence); const packet: any = JSON.parse(missingEvidence.primary_batches[0].packet_raw); packet.entries = packet.entries.filter((x: any) => x.opaque_contestant_id !== ids[0]); missingEvidence.primary_batches[0].packet_raw = canonicalJson(packet);
    assert.equal(buildGovernedSecondaryPacket({ plan_raw: governed.canonical_plan_bytes, plan_raw_sha256: governed.plan_raw_sha256, evidence: missingEvidence }, f.root).ok, false);
    const built = buildGovernedSecondaryPacket({ plan_raw: governed.canonical_plan_bytes, plan_raw_sha256: governed.plan_raw_sha256, evidence: f.evidence }, f.root); assert.equal(built.ok, true, JSON.stringify(built)); if (!built.ok) return;
    const alteredPacket: any = structuredClone(built.packet); alteredPacket.entries[0].requested_dimension_ids = ["actionability"];
    const { packet_hash: _hash, ...body } = alteredPacket; alteredPacket.packet_hash = finalSuccessorPacketHash(body);
    assert.equal(validateStrictSecondaryPacket(alteredPacket, governed.plan, f.protocol).ok, false);
  });

  test("canonical replay payloads contain no operational execution timestamp", () => {
    const f = fixture(); const governed = governSecondaryPlanAgainstTrustedRoot(f.evidence, f.root); assert.equal(governed.ok, true); if (!governed.ok) return;
    const built = buildGovernedSecondaryPacket({ plan_raw: governed.canonical_plan_bytes, plan_raw_sha256: governed.plan_raw_sha256, evidence: f.evidence }, f.root); assert.equal(built.ok, true, JSON.stringify(built)); if (!built.ok) return;
    for (const raw of [governed.canonical_plan_bytes, built.canonical_packet_bytes, built.canonical_manifest_bytes]) assert.equal(/executed_at|generated_at|created_at|current_timestamp/.test(raw), false);
  });
});
