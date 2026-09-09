/** Privileged in-memory derivation core.  It returns no sealed values or labels. */
import { canonicalHash } from "./opportunity-qualification-evaluator-v2.ts";
import { OQ_OPAQUE_GROUPING_CONTRACT_ID, OQ_OPAQUE_GROUPING_CONTRACT_VERSION, OQ_OPAQUE_GROUP_DERIVATION_RULE, OQ_PROTOCOL_010_ID, opaqueComparisonGroupId, type OpaqueGroupingArtifact, validateOpaqueGroupingArtifact } from "./opportunity-qualification-sealed-grouping-authority.ts";

type PrivilegedSource = { source_substantive_hash: string; arm: string; source_packet_fingerprint: string; case_ids: string[] };
type PrivilegedPacket = { arm: string; packet_fingerprint: string };
type PrivilegedMapping = { opaque_contestant_id: string; source_substantive_hash: string; source_ref: string };
export type PrivilegedGroupingInput = {
  sealed_map: { sealed: boolean; protocol_hash: string; mappings: PrivilegedMapping[] };
  sources: PrivilegedSource[];
  source_packets: PrivilegedPacket[];
  expected_primary_pairs: string[];
  protocol_010_hash: string;
  packet_manifest_hash: string;
  evidence_fingerprint: string;
  evidence_raw_sha256: string;
  gate_finding_set_sha256: string;
  sealed_source_hashes: string[];
  implementation_version: string;
  implementation_hash: string;
};

const fail = () => { throw new Error("sealed grouping authority validation failed"); };
const fields = (value: any, keys: string[]) => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const opaque = (value: unknown) => typeof value === "string" && /^C-[A-F0-9]{16}$/.test(value);
const unique = (items: unknown[]) => new Set(items).size === items.length;

/**
 * This function is intentionally private-schema only.  The public adapter cannot
 * call it because it accepts privileged arm and source provenance fields.
 */
export function deriveOpaqueGroupingFromSealedAuthority(input: PrivilegedGroupingInput): OpaqueGroupingArtifact {
  if (!fields(input?.sealed_map, ["sealed", "protocol_hash", "mappings"]) || input.sealed_map.sealed !== true || input.sealed_map.protocol_hash !== input.protocol_010_hash || !Array.isArray(input.sealed_map.mappings) || input.sealed_map.mappings.length !== 4) fail();
  if (![input.protocol_010_hash, input.packet_manifest_hash, input.evidence_fingerprint, input.evidence_raw_sha256, input.gate_finding_set_sha256, input.implementation_hash].every(hash) || !Array.isArray(input.sealed_source_hashes) || !input.sealed_source_hashes.length || !input.sealed_source_hashes.every(hash) || !unique(input.sealed_source_hashes)) fail();
  if (!Array.isArray(input.sources) || input.sources.length !== 4 || !Array.isArray(input.source_packets) || input.source_packets.length !== 2 || !Array.isArray(input.expected_primary_pairs) || input.expected_primary_pairs.length !== 112 || !unique(input.expected_primary_pairs)) fail();
  const packets = new Map<string, PrivilegedPacket>();
  for (const packet of input.source_packets) { if (!fields(packet, ["arm", "packet_fingerprint"]) || !packet.arm || !hash(packet.packet_fingerprint) || packets.has(packet.packet_fingerprint)) fail(); packets.set(packet.packet_fingerprint, packet); }
  const sources = new Map<string, PrivilegedSource>();
  for (const source of input.sources) {
    if (!fields(source, ["source_substantive_hash", "arm", "source_packet_fingerprint", "case_ids"]) || !hash(source.source_substantive_hash) || !source.arm || !hash(source.source_packet_fingerprint) || !Array.isArray(source.case_ids) || source.case_ids.length !== 28 || !source.case_ids.every((x) => typeof x === "string" && x.length > 0) || !unique(source.case_ids)) fail();
    const packet = packets.get(source.source_packet_fingerprint); if (!packet || packet.arm !== source.arm || sources.has(source.source_substantive_hash)) fail(); sources.set(source.source_substantive_hash, source);
  }
  const mapped = new Set<string>(); const grouped = new Map<string, Array<{ opaque_contestant_id: string; case_ids: string[] }>>();
  for (const mapping of input.sealed_map.mappings) {
    if (!fields(mapping, ["opaque_contestant_id", "source_substantive_hash", "source_ref"]) || !opaque(mapping.opaque_contestant_id) || !hash(mapping.source_substantive_hash) || typeof mapping.source_ref !== "string" || !mapping.source_ref || mapped.has(mapping.opaque_contestant_id)) fail();
    mapped.add(mapping.opaque_contestant_id); const source = sources.get(mapping.source_substantive_hash); if (!source) fail(); grouped.set(source.arm, (grouped.get(source.arm) || []).concat({ opaque_contestant_id: mapping.opaque_contestant_id, case_ids: source.case_ids.slice().sort() }));
  }
  if (mapped.size !== 4 || grouped.size !== 2 || [...grouped.values()].some((members) => members.length !== 2)) fail();
  const structure = [...grouped.values()].flatMap((members) => { const groupId = opaqueComparisonGroupId(members.map((m) => m.opaque_contestant_id)); return members.map((member) => ({ ...member, opaque_comparison_group_id: groupId })); }).sort((a, b) => a.opaque_contestant_id.localeCompare(b.opaque_contestant_id));
  const pairs = structure.flatMap((entry) => entry.case_ids.map((case_id) => `${entry.opaque_contestant_id}|${case_id}`));
  if (pairs.length !== 112 || !unique(pairs) || canonicalHash(pairs.slice().sort()) !== canonicalHash(input.expected_primary_pairs.slice().sort())) fail();
  const body: Omit<OpaqueGroupingArtifact, "canonical_artifact_fingerprint"> = { contract_id: OQ_OPAQUE_GROUPING_CONTRACT_ID, semantic_version: OQ_OPAQUE_GROUPING_CONTRACT_VERSION, protocol_010_id: OQ_PROTOCOL_010_ID, protocol_010_hash: input.protocol_010_hash, packet_manifest_hash: input.packet_manifest_hash, complete_primary_evidence_canonical_fingerprint: input.evidence_fingerprint, complete_primary_evidence_raw_sha256: input.evidence_raw_sha256, deterministic_gate_finding_set_sha256: input.gate_finding_set_sha256, sealed_source_hashes: input.sealed_source_hashes.slice().sort(), custodian_implementation_version: input.implementation_version, custodian_implementation_hash: input.implementation_hash, derivation_rule_id: OQ_OPAQUE_GROUP_DERIVATION_RULE, opaque_structure: structure };
  const artifact = { ...body, canonical_artifact_fingerprint: canonicalHash(body) };
  if (!validateOpaqueGroupingArtifact(artifact).ok) fail();
  return artifact;
}

/** Sanitizes failures so no privileged value can leave the custodian process. */
export function safelyRunSealedCustodian<T>(work: () => T) {
  try { return { ok: true as const, value: work() }; } catch { return { ok: false as const, code: "SEALED_AUTHORITY_VALIDATION_FAILED" }; }
}
