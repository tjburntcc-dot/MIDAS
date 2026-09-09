/**
 * Identity-free companion contract for Protocol-010 secondary-review planning.
 * This module deliberately has no filesystem access and cannot read sealed inputs.
 */
import { createHash } from "node:crypto";
import { canonicalHash } from "./opportunity-qualification-evaluator-v2.ts";

export const OQ_OPAQUE_GROUPING_CONTRACT_ID = "MIDAS-OQ-OPAQUE-GROUPING-AUTHORITY-001";
export const OQ_OPAQUE_GROUPING_CONTRACT_VERSION = "1.0.0";
export const OQ_OPAQUE_GROUP_DERIVATION_RULE = "MIDAS-OQ-OPAQUE-GROUP-V1";
export const OQ_PROTOCOL_010_ID = "MIDAS-OQ-EVALUATOR-PROTOCOL-010";

export type OpaqueStructureEntry = {
  opaque_contestant_id: string;
  case_ids: string[];
  opaque_comparison_group_id: string;
};

export type OpaqueGroupingArtifact = {
  contract_id: string;
  semantic_version: string;
  protocol_010_id: string;
  protocol_010_hash: string;
  packet_manifest_hash: string;
  complete_primary_evidence_canonical_fingerprint: string;
  complete_primary_evidence_raw_sha256: string;
  deterministic_gate_finding_set_sha256: string;
  sealed_source_hashes: string[];
  custodian_implementation_version: string;
  custodian_implementation_hash: string;
  derivation_rule_id: string;
  opaque_structure: OpaqueStructureEntry[];
  canonical_artifact_fingerprint: string;
};

const topLevelFields = ["contract_id", "semantic_version", "protocol_010_id", "protocol_010_hash", "packet_manifest_hash", "complete_primary_evidence_canonical_fingerprint", "complete_primary_evidence_raw_sha256", "deterministic_gate_finding_set_sha256", "sealed_source_hashes", "custodian_implementation_version", "custodian_implementation_hash", "derivation_rule_id", "opaque_structure", "canonical_artifact_fingerprint"] as const;
const structureFields = ["opaque_contestant_id", "case_ids", "opaque_comparison_group_id"] as const;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactFields = (value: unknown, fields: readonly string[], errors: string[], location: string) => {
  if (!isObject(value)) { errors.push(`${location}: object required`); return false; }
  for (const key of Object.keys(value)) if (!fields.includes(key)) errors.push(`${location}: unknown field`);
  return true;
};
const isHash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isOpaqueId = (value: unknown) => typeof value === "string" && /^C-[A-F0-9]{16}$/.test(value);
const uniqueStrings = (value: unknown) => Array.isArray(value) && value.every((x) => typeof x === "string") && new Set(value).size === value.length;

/** Domain-separated name for an already-authoritative opaque member pair. */
export function opaqueComparisonGroupId(memberIds: readonly string[]) {
  if (!Array.isArray(memberIds) || memberIds.length !== 2 || !memberIds.every(isOpaqueId) || new Set(memberIds).size !== 2) throw new Error("invalid opaque group members");
  return `G-${sha256(`${OQ_OPAQUE_GROUP_DERIVATION_RULE}\u0000${memberIds.slice().sort().join("\u0000")}`).slice(0, 16).toUpperCase()}`;
}

export function canonicalOpaqueGroupingFingerprint(value: Record<string, unknown>) {
  const clean = { ...value }; delete (clean as any).canonical_artifact_fingerprint;
  return canonicalHash(clean);
}

/** Strictly validates the planner-safe, identity-free companion artifact. */
export function validateOpaqueGroupingArtifact(value: unknown) {
  const errors: string[] = [];
  if (!exactFields(value, topLevelFields, errors, "artifact")) return { ok: false, errors };
  const artifact = value as Partial<OpaqueGroupingArtifact>;
  for (const key of topLevelFields) if (!(key in artifact)) errors.push("artifact: missing required field");
  if (artifact.contract_id !== OQ_OPAQUE_GROUPING_CONTRACT_ID || artifact.semantic_version !== OQ_OPAQUE_GROUPING_CONTRACT_VERSION || artifact.protocol_010_id !== OQ_PROTOCOL_010_ID || artifact.derivation_rule_id !== OQ_OPAQUE_GROUP_DERIVATION_RULE) errors.push("artifact: contract identity mismatch");
  for (const key of ["protocol_010_hash", "packet_manifest_hash", "complete_primary_evidence_canonical_fingerprint", "complete_primary_evidence_raw_sha256", "deterministic_gate_finding_set_sha256", "custodian_implementation_hash"] as const) if (!isHash(artifact[key])) errors.push("artifact: invalid hash");
  if (!Array.isArray(artifact.sealed_source_hashes) || artifact.sealed_source_hashes.length < 1 || !uniqueStrings(artifact.sealed_source_hashes) || !artifact.sealed_source_hashes.every(isHash)) errors.push("artifact: invalid sealed source hashes");
  if (typeof artifact.custodian_implementation_version !== "string" || !artifact.custodian_implementation_version.trim()) errors.push("artifact: invalid implementation version");
  const structures = artifact.opaque_structure;
  if (!Array.isArray(structures) || structures.length !== 4) errors.push("artifact: exactly four opaque structures required");
  const pairs = new Set<string>(); const groups = new Map<string, string[]>(); const contestants = new Set<string>();
  for (const entry of structures || []) {
    exactFields(entry, structureFields, errors, "opaque structure");
    if (!isOpaqueId(entry?.opaque_contestant_id)) errors.push("opaque structure: invalid contestant ID");
    if (!Array.isArray(entry?.case_ids) || entry.case_ids.length !== 28 || !uniqueStrings(entry.case_ids) || !entry.case_ids.every((x: unknown) => typeof x === "string" && x.length > 0) || JSON.stringify(entry.case_ids) !== JSON.stringify(entry.case_ids.slice().sort())) errors.push("opaque structure: exactly 28 sorted unique case IDs required");
    if (typeof entry?.opaque_comparison_group_id !== "string" || !/^G-[A-F0-9]{16}$/.test(entry.opaque_comparison_group_id)) errors.push("opaque structure: invalid comparison group ID");
    contestants.add(entry?.opaque_contestant_id); groups.set(entry?.opaque_comparison_group_id, (groups.get(entry?.opaque_comparison_group_id) || []).concat(entry?.opaque_contestant_id));
    for (const caseId of entry?.case_ids || []) { const pair = `${entry?.opaque_contestant_id}|${caseId}`; if (pairs.has(pair)) errors.push("opaque structure: duplicate contestant/case membership"); pairs.add(pair); }
  }
  if (contestants.size !== 4 || pairs.size !== 112 || groups.size !== 2 || [...groups.values()].some((ids) => ids.length !== 2)) errors.push("artifact: opaque grouping cardinality invariant failed");
  for (const [groupId, ids] of groups) if (ids.length === 2 && opaqueComparisonGroupId(ids) !== groupId) errors.push("opaque structure: group ID derivation mismatch");
  if (artifact.canonical_artifact_fingerprint !== canonicalOpaqueGroupingFingerprint(artifact as Record<string, unknown>)) errors.push("artifact: canonical fingerprint mismatch");
  return { ok: errors.length === 0, errors, artifact: errors.length ? null : artifact as OpaqueGroupingArtifact };
}

/** Public planner boundary: only validated identity-free structure crosses it. */
export function adaptOpaqueGroupingForSecondaryPlanner(value: unknown) {
  const checked = validateOpaqueGroupingArtifact(value);
  if (!checked.ok || !checked.artifact) return { ok: false as const, errors: ["invalid identity-free grouping authority artifact"] };
  return { ok: true as const, opaque_structure: checked.artifact.opaque_structure.map((entry) => ({ opaque_contestant_id: entry.opaque_contestant_id, case_ids: entry.case_ids.slice(), opaque_comparison_group_id: entry.opaque_comparison_group_id })) };
}
