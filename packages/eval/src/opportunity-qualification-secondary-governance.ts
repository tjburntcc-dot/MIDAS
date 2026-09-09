/**
 * MIDAS-OQ-SECONDARY-GOVERNANCE-HARDENING-016.
 *
 * Pure, identity-free governance around the already-frozen Protocol-010
 * secondary-review planner.  This module does not read files, call an
 * evaluator, execute a plan, unblind a contestant, or make a business
 * qualification decision.
 */
import { createHash } from "node:crypto";
import { canonicalHash, EVALUATOR_DIMENSIONS } from "./opportunity-qualification-evaluator-v2.ts";
import { planSecondaryReview } from "./opportunity-qualification-evaluator-v2-1.ts";
import {
  FINAL_SUCCESSOR_SCORECARD_SCHEMA,
  OQ_FINAL_SUCCESSOR_PROTOCOL_ID,
  OQ_FINAL_SUCCESSOR_PROTOCOL_VERSION,
  buildFinalMinimalSecondaryPacket,
  finalSuccessorPacketHash,
  validateFinalSuccessorScorecard,
  validationArtifactIntegrity,
} from "./opportunity-qualification-evaluator-v2-2.ts";
import {
  OQ_OPAQUE_GROUPING_CONTRACT_ID,
  OQ_OPAQUE_GROUPING_CONTRACT_VERSION,
  validateOpaqueGroupingArtifact,
} from "./opportunity-qualification-sealed-grouping-authority.ts";

export const OQ_SECONDARY_GOVERNANCE_CONTRACT_ID = "MIDAS-OQ-SECONDARY-GOVERNANCE-016";
export const OQ_SECONDARY_GOVERNANCE_CONTRACT_VERSION = "1.0.0";
export const OQ_SECONDARY_PLAN_KIND = "protocol-010-governed-secondary-plan";
export const OQ_SECONDARY_PACKET_MANIFEST_KIND = "protocol-010-strict-secondary-packet-manifest";

export const FROZEN_SECONDARY_POLICY = Object.freeze({
  minimum_competence: 75,
  maximum_run_quality_spread: 8,
  practical_quality_margin: 5,
  runs_per_arm: 2,
  cases_per_run: 28,
  no_critical_failures: true as const,
});

export const APPROVED_SECONDARY_PLANNER = Object.freeze({
  module_id: "opportunity-qualification-evaluator-v2-1.ts",
  export_name: "planSecondaryReview",
  planner_version: "oq-voi-planner-1.0.0",
  planner_declared_hash: "0e234ca0c996b788cb37085c88fc7a8ece2beede2326a9b4af8d223771590b40",
  baseline_source_sha256: "2995090332741bc87003304a4c063ea44c4eba3e0a7abd3939ec85f36d88d6a7",
});

export type SecondaryGovernanceTrustRoot = {
  trust_root_id: string;
  protocol_hash: string;
  packet_manifest_hash: string;
  primary_evidence_canonical_fingerprint: string;
  primary_evidence_raw_sha256: string;
  membership_set_sha256: string;
  deterministic_gate_record_canonical_fingerprint: string;
  deterministic_gate_record_raw_sha256: string;
  deterministic_gate_finding_set_sha256: string;
  opaque_grouping_canonical_fingerprint: string;
  opaque_grouping_raw_sha256: string;
  custodian_implementation_hash: string;
  approved_planner_source_sha256: string;
};

/**
 * Committed trust anchor for the one Protocol-010 campaign in scope.
 * A matching fingerprint proves byte integrity relative to this anchor; it is
 * not, by itself, proof that some other caller was authorized to create data.
 */
export const PROTOCOL_010_SECONDARY_TRUST_ROOT: Readonly<SecondaryGovernanceTrustRoot> = Object.freeze({
  trust_root_id: "MIDAS-OQ-PROTOCOL-010-SECONDARY-TRUST-ROOT-016",
  protocol_hash: "17bbb5d31caf2c8b4c726178a8233dd90f0990ecb076df47faa96b61d4022a22",
  packet_manifest_hash: "12a1caf0dced7549db532e47582ef1bc4a0f5377b2caa493132f27fcf009d389",
  primary_evidence_canonical_fingerprint: "788011a3c1215656f085f9e622f8c63ea80e058af97409570702dc93ff3d0733",
  primary_evidence_raw_sha256: "e98c66b5c7af658268001ef7eee8d18f6fc85f179ece104eec6d26070d192878",
  membership_set_sha256: "9b2d5f10bb289a3e94cd4bfdf50a92cf0be893638ea3b5b846061f29783be815",
  deterministic_gate_record_canonical_fingerprint: "7a3382345889f297d98bdc8a46d3301feba799835d6e7ad2c5b583b8ea958ed5",
  deterministic_gate_record_raw_sha256: "8044eb610ba14869f11cf3331f5e79ce1e7bee780441632ea0fc304a616dbc1e",
  deterministic_gate_finding_set_sha256: "352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0",
  opaque_grouping_canonical_fingerprint: "dcbfcd52ade8b8865f9e4fff418fc514bd91b95cdbee083879d63948af2f1d1f",
  opaque_grouping_raw_sha256: "6fced7d4e29064c61cb94f899eb4fe6039af50cc1f605af7c598113baa0f9515",
  custodian_implementation_hash: "7ae0678dbd51c76fd73077bc3ad4860f68e5cc84541fc93641dc214f9de8c275",
  approved_planner_source_sha256: APPROVED_SECONDARY_PLANNER.baseline_source_sha256,
});

type JsonObject = Record<string, any>;
type JsonBytes = string | Buffer;
export type PrimaryEvidenceBatch = { packet_raw: JsonBytes; scorecard_raw: JsonBytes };
export type GovernedPlannerEvidence = {
  protocol: JsonObject;
  primary_evidence_manifest_raw: JsonBytes;
  deterministic_gate_record_raw: JsonBytes;
  /** Exact bytes whose SHA-256 is the frozen gate_finding_set_sha256. */
  deterministic_gate_finding_set_raw: JsonBytes;
  opaque_grouping_raw: JsonBytes;
  primary_batches: PrimaryEvidenceBatch[];
};

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isHash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isOpaqueId = (value: unknown) => typeof value === "string" && /^C-[A-F0-9]{16}$/.test(value);
const bytes = (value: unknown) => Buffer.isBuffer(value) ? value : typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.alloc(0);
const same = (a: unknown, b: unknown) => { try { return canonicalJson(a) === canonicalJson(b); } catch { return false; } };
const pairKey = (value: any) => `${value?.opaque_contestant_id}|${value?.case_id}`;
const reviewKey = (value: any) => `${pairKey(value)}|${value?.dimension_id || ""}`;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON requires finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => {
    if (value[key] === undefined) throw new Error("canonical JSON does not permit undefined");
    return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
  }).join(",")}}`;
  throw new Error("canonical JSON value required");
}

export const canonicalBytesSha256 = (value: unknown) => sha256(Buffer.from(canonicalJson(value), "utf8"));

function exactFields(value: unknown, allowed: readonly string[], required: readonly string[], errors: string[], where: string) {
  if (!isObject(value)) { errors.push(`${where}: object required`); return false; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${where}: unknown field ${key}`);
  for (const key of required) if (!(key in value)) errors.push(`${where}: missing field ${key}`);
  return true;
}

function parseJson(raw: JsonBytes, where: string, errors: string[]) {
  const rawBytes = bytes(raw); const text = rawBytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(rawBytes)) { errors.push(`${where}: invalid UTF-8`); return null; }
  try { return JSON.parse(text); } catch { errors.push(`${where}: complete JSON required`); return null; }
}

function canonicalArtifact(raw: JsonBytes, where: string, errors: string[]) {
  const value = parseJson(raw, where, errors);
  if (value !== null && canonicalJson(value) !== bytes(raw).toString("utf8")) errors.push(`${where}: exact canonical JSON bytes required`);
  return value;
}

const frozenPolicyFingerprint = () => canonicalHash(FROZEN_SECONDARY_POLICY);

function validateTrustRoot(value: unknown, errors: string[]) {
  const fields = ["trust_root_id", "protocol_hash", "packet_manifest_hash", "primary_evidence_canonical_fingerprint", "primary_evidence_raw_sha256", "membership_set_sha256", "deterministic_gate_record_canonical_fingerprint", "deterministic_gate_record_raw_sha256", "deterministic_gate_finding_set_sha256", "opaque_grouping_canonical_fingerprint", "opaque_grouping_raw_sha256", "custodian_implementation_hash", "approved_planner_source_sha256"] as const;
  if (!exactFields(value, fields, fields, errors, "trust root")) return;
  const root = value as SecondaryGovernanceTrustRoot;
  if (!root.trust_root_id.trim()) errors.push("trust root: identity required");
  for (const key of fields.slice(1)) if (!isHash(root[key])) errors.push(`trust root: invalid hash ${key}`);
  if (root.approved_planner_source_sha256 !== APPROVED_SECONDARY_PLANNER.baseline_source_sha256) errors.push("trust root: unapproved planner source identity");
}

function validateProtocol(protocol: unknown, root: SecondaryGovernanceTrustRoot, errors: string[]) {
  if (!isObject(protocol)) { errors.push("protocol: object required"); return; }
  const { protocol_hash, ...body } = protocol;
  if (protocol.protocol_id !== OQ_FINAL_SUCCESSOR_PROTOCOL_ID || protocol.semantic_version !== OQ_FINAL_SUCCESSOR_PROTOCOL_VERSION) errors.push("protocol: contract identity mismatch");
  if (protocol_hash !== root.protocol_hash || canonicalHash(body) !== protocol_hash) errors.push("protocol: trusted hash or canonical derivation mismatch");
  if (!same(protocol.frozen_policy, FROZEN_SECONDARY_POLICY)) errors.push("protocol: frozen policy differs from documented Protocol-010 policy");
}

const manifestFields = ["admissions", "artifact_type", "canonical_validation_fingerprint", "expected_response_count", "identity_and_telemetry_excluded", "manifest_hash", "membership_set_sha256", "ordering_invariant", "packet_contributions", "primary_scorecard_count", "protocol_hash", "protocol_id", "provenance_record_sha256", "required_dimension_judgment_count", "unique_opaque_contestant_case_pair_count"] as const;

function validatePrimaryManifest(raw: JsonBytes, root: SecondaryGovernanceTrustRoot, errors: string[]) {
  if (sha256(bytes(raw)) !== root.primary_evidence_raw_sha256) errors.push("primary manifest: trusted raw SHA-256 mismatch");
  const integrity = validationArtifactIntegrity(bytes(raw));
  if (!integrity.ok) errors.push("primary manifest: canonical validation integrity failed");
  const value = integrity.value;
  if (!exactFields(value, manifestFields, manifestFields, errors, "primary manifest")) return null;
  if (value.canonical_validation_fingerprint !== root.primary_evidence_canonical_fingerprint || value.protocol_id !== OQ_FINAL_SUCCESSOR_PROTOCOL_ID || value.protocol_hash !== root.protocol_hash || value.manifest_hash !== root.packet_manifest_hash || value.membership_set_sha256 !== root.membership_set_sha256) errors.push("primary manifest: frozen binding mismatch");
  if (value.expected_response_count !== 112 || value.unique_opaque_contestant_case_pair_count !== 112 || value.primary_scorecard_count !== 5 || value.required_dimension_judgment_count !== 1008 || value.identity_and_telemetry_excluded !== true || value.ordering_invariant !== true) errors.push("primary manifest: coverage/governance invariant mismatch");
  if (!Array.isArray(value.admissions) || value.admissions.length !== value.primary_scorecard_count || !Array.isArray(value.packet_contributions) || value.packet_contributions.length !== value.primary_scorecard_count || !Array.isArray(value.provenance_record_sha256) || value.provenance_record_sha256.length !== value.primary_scorecard_count) errors.push("primary manifest: contribution cardinality mismatch");
  for (const x of value.admissions || []) { exactFields(x, ["admission_fingerprint", "packet_id", "raw_scorecard_sha256"], ["admission_fingerprint", "packet_id", "raw_scorecard_sha256"], errors, "primary admission"); if (!isHash(x?.admission_fingerprint) || !isHash(x?.raw_scorecard_sha256) || typeof x?.packet_id !== "string") errors.push("primary admission: invalid identity"); }
  for (const x of value.packet_contributions || []) { exactFields(x, ["packet_hash", "packet_id", "packet_raw_sha256", "response_count"], ["packet_hash", "packet_id", "packet_raw_sha256", "response_count"], errors, "packet contribution"); if (!isHash(x?.packet_hash) || !isHash(x?.packet_raw_sha256) || typeof x?.packet_id !== "string" || !Number.isInteger(x?.response_count) || x.response_count < 1) errors.push("packet contribution: invalid binding"); }
  for (const x of value.provenance_record_sha256 || []) { exactFields(x, ["run", "sha256"], ["run", "sha256"], errors, "provenance binding"); if (!Number.isInteger(x?.run) || !isHash(x?.sha256)) errors.push("provenance binding: invalid value"); }
  return value;
}

const gateRecordFields = ["all_critical_gates_passed", "artifact_type", "canonical_validation_fingerprint", "critical_finding_count", "gate_findings_set_sha256", "identity_and_telemetry_excluded", "input_response_count", "no_quality_points_invented", "no_score_or_rationale_disclosed", "opaque_run_count", "protocol_hash", "protocol_id", "total_finding_count"] as const;

function validateGateEvidence(recordRaw: JsonBytes, findingSetRaw: JsonBytes, root: SecondaryGovernanceTrustRoot, errors: string[]) {
  if (sha256(bytes(recordRaw)) !== root.deterministic_gate_record_raw_sha256) errors.push("gate record: trusted raw SHA-256 mismatch");
  if (sha256(bytes(findingSetRaw)) !== root.deterministic_gate_finding_set_sha256) errors.push("gate finding set: trusted raw SHA-256 mismatch");
  const integrity = validationArtifactIntegrity(bytes(recordRaw)); const record = integrity.value;
  if (!integrity.ok) errors.push("gate record: canonical validation integrity failed");
  if (!exactFields(record, gateRecordFields, gateRecordFields, errors, "gate record")) return { record: null, findings: [] };
  if (record.canonical_validation_fingerprint !== root.deterministic_gate_record_canonical_fingerprint || record.gate_findings_set_sha256 !== root.deterministic_gate_finding_set_sha256 || record.protocol_id !== OQ_FINAL_SUCCESSOR_PROTOCOL_ID || record.protocol_hash !== root.protocol_hash) errors.push("gate record: frozen binding mismatch");
  if (record.input_response_count !== 112 || record.opaque_run_count !== 4 || record.all_critical_gates_passed !== true || record.critical_finding_count !== 0 || record.identity_and_telemetry_excluded !== true || record.no_quality_points_invented !== true || record.no_score_or_rationale_disclosed !== true) errors.push("gate record: deterministic-gate invariant mismatch");
  const source = parseJson(findingSetRaw, "gate finding set", errors);
  if (!Array.isArray(source) || source.length !== record.total_finding_count) { errors.push("gate finding set: array/cardinality mismatch"); return { record, findings: [] }; }
  const findings: any[] = [];
  for (const item of source) {
    if (!isObject(item)) { errors.push("gate finding set: finding object required"); continue; }
    if (item.deterministic_evaluator_conflict === true) {
      if (!isOpaqueId(item.opaque_contestant_id) || typeof item.case_id !== "string" || !item.case_id) errors.push("gate finding set: conflict lacks opaque membership");
      else findings.push({ opaque_contestant_id: item.opaque_contestant_id, case_id: item.case_id, deterministic_evaluator_conflict: true });
    }
  }
  findings.sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
  if (new Set(findings.map(pairKey)).size !== findings.length) errors.push("gate finding set: duplicate planner conflict");
  return { record, findings };
}

function validateGrouping(raw: JsonBytes, root: SecondaryGovernanceTrustRoot, errors: string[]) {
  if (sha256(bytes(raw)) !== root.opaque_grouping_raw_sha256) errors.push("opaque grouping: trusted raw SHA-256 mismatch");
  const value = canonicalArtifact(raw, "opaque grouping", errors); const checked = validateOpaqueGroupingArtifact(value);
  if (!checked.ok || !checked.artifact) { errors.push("opaque grouping: strict contract validation failed"); return null; }
  const artifact = checked.artifact;
  if (artifact.contract_id !== OQ_OPAQUE_GROUPING_CONTRACT_ID || artifact.semantic_version !== OQ_OPAQUE_GROUPING_CONTRACT_VERSION || artifact.canonical_artifact_fingerprint !== root.opaque_grouping_canonical_fingerprint || artifact.protocol_010_hash !== root.protocol_hash || artifact.packet_manifest_hash !== root.packet_manifest_hash || artifact.complete_primary_evidence_canonical_fingerprint !== root.primary_evidence_canonical_fingerprint || artifact.complete_primary_evidence_raw_sha256 !== root.primary_evidence_raw_sha256 || artifact.deterministic_gate_finding_set_sha256 !== root.deterministic_gate_finding_set_sha256 || artifact.custodian_implementation_hash !== root.custodian_implementation_hash) errors.push("opaque grouping: trusted relationship mismatch");
  return artifact;
}

function membershipSetHash(pairs: string[]) { return sha256(pairs.slice().sort().join("\n")); }

function validatePrimaryBatches(batches: PrimaryEvidenceBatch[], manifest: any, protocol: any, expectedPairs: Set<string>, errors: string[]) {
  if (!Array.isArray(batches) || batches.length !== manifest?.primary_scorecard_count) { errors.push("primary batches: exact manifest count required"); return { cards: [], packets: [], inputSetSha256: sha256("") }; }
  const admissions = new Map((manifest.admissions || []).map((x: any) => [x.packet_id, x]));
  const contributions = new Map((manifest.packet_contributions || []).map((x: any) => [x.packet_id, x]));
  const cards: any[] = []; const packets: any[] = []; const inputHashes: string[] = []; const actualPairs: string[] = [];
  for (const batch of batches) {
    const packet = parseJson(batch?.packet_raw, "primary packet", errors); const card = parseJson(batch?.scorecard_raw, "primary scorecard", errors);
    if (!isObject(packet) || !isObject(card)) continue;
    const admission: any = admissions.get(packet.packet_id); const contribution: any = contributions.get(packet.packet_id);
    const packetRawHash = sha256(bytes(batch.packet_raw)); const cardRawHash = sha256(bytes(batch.scorecard_raw));
    if (!admission || !contribution || admission.raw_scorecard_sha256 !== cardRawHash || contribution.packet_raw_sha256 !== packetRawHash || contribution.packet_hash !== packet.packet_hash || contribution.response_count !== card.responses?.length || card.packet_id !== packet.packet_id) errors.push(`primary batch ${packet.packet_id}: manifest byte/identity binding mismatch`);
    if (packet.protocol?.protocol_hash !== protocol.protocol_hash || !same(packet.protocol, protocol) || finalSuccessorPacketHash(packet) !== packet.packet_hash) errors.push(`primary batch ${packet.packet_id}: packet protocol/hash mismatch`);
    const validation = validateFinalSuccessorScorecard(card, packet, protocol);
    if (!validation.ok) errors.push(`primary batch ${packet.packet_id}: scorecard validation failed`);
    for (const row of card.responses || []) actualPairs.push(pairKey(row));
    cards.push(card); packets.push(packet); inputHashes.push(`${packet.packet_id}|${packetRawHash}|${cardRawHash}`);
  }
  const unique = new Set(actualPairs);
  if (unique.size !== actualPairs.length || unique.size !== expectedPairs.size || [...expectedPairs].some((key) => !unique.has(key))) errors.push("primary batches: exact grouping membership coverage failed");
  if (membershipSetHash([...unique]) !== manifest?.membership_set_sha256) errors.push("primary batches: established membership-set derivation mismatch");
  return { cards, packets, inputSetSha256: sha256(inputHashes.sort().join("\n")) };
}

function canonicalizePlannerInput(cards: any[], structure: any[], findings: any[]) {
  const scorecards = cards.map((card) => ({ ...card, responses: (card.responses || []).slice().sort((a: any, b: any) => pairKey(a).localeCompare(pairKey(b))).map((row: any) => ({
    ...row,
    dimension_judgments: (row.dimension_judgments || []).slice().sort((a: any, b: any) => String(a.dimension_id).localeCompare(String(b.dimension_id))),
    review_signals: (row.review_signals || []).slice().sort(),
    review_signal_dimension_ids: (row.review_signal_dimension_ids || []).slice().sort(),
  })) })).sort((a, b) => String(a.packet_id).localeCompare(String(b.packet_id)));
  return {
    validated_primary_scorecards: scorecards,
    opaque_structure: structure.slice().sort((a: any, b: any) => String(a.opaque_contestant_id).localeCompare(String(b.opaque_contestant_id))).map((x: any) => ({ ...x, case_ids: x.case_ids.slice().sort() })),
    deterministic_gate_findings: findings.slice().sort((a, b) => pairKey(a).localeCompare(pairKey(b))),
    frozen_policy: { ...FROZEN_SECONDARY_POLICY },
  };
}

function sortedDecision(decision: any) {
  if (!isObject(decision)) return decision;
  return {
    ...decision,
    decision_sensitivity: decision.decision_sensitivity ? {
      ...decision.decision_sensitivity,
      triggered: (decision.decision_sensitivity.triggered || []).slice().sort(),
      contest: (decision.decision_sensitivity.contest || []).slice().sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
    } : decision.decision_sensitivity,
    secondary_reviews: (decision.secondary_reviews || []).slice().sort((a: any, b: any) => pairKey(a).localeCompare(pairKey(b))).map((x: any) => ({ ...x, signals: (x.signals || []).slice().sort(), affected_dimension_ids: (x.affected_dimension_ids || []).slice().sort(), triggering_frozen_boundaries: (x.triggering_frozen_boundaries || []).slice().sort() })),
    excluded_proofs: (decision.excluded_proofs || []).slice().sort((a: any, b: any) => reviewKey(a).localeCompare(reviewKey(b))),
  };
}

export type GovernedPlanResult = { ok: true; plan: JsonObject; canonical_plan_bytes: string; plan_raw_sha256: string; planner_input: JsonObject; primary_packets: JsonObject[] } | { ok: false; errors: string[] };

/**
 * General engine for tests and future separately approved trust roots.  The
 * trust root must come from an authorized channel independent of `evidence`.
 */
export function governSecondaryPlanAgainstTrustedRoot(evidence: GovernedPlannerEvidence, trustedRoot: SecondaryGovernanceTrustRoot): GovernedPlanResult {
  const errors: string[] = []; validateTrustRoot(trustedRoot, errors); validateProtocol(evidence?.protocol, trustedRoot, errors);
  const manifest = validatePrimaryManifest(evidence?.primary_evidence_manifest_raw, trustedRoot, errors);
  const gate = validateGateEvidence(evidence?.deterministic_gate_record_raw, evidence?.deterministic_gate_finding_set_raw, trustedRoot, errors);
  const grouping = validateGrouping(evidence?.opaque_grouping_raw, trustedRoot, errors);
  const expectedPairs = new Set((grouping?.opaque_structure || []).flatMap((x: any) => x.case_ids.map((caseId: string) => `${x.opaque_contestant_id}|${caseId}`)));
  const primary = validatePrimaryBatches(evidence?.primary_batches, manifest, evidence?.protocol, expectedPairs, errors);
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const plannerInput = canonicalizePlannerInput(primary.cards, grouping!.opaque_structure, gate.findings);
  const decision = sortedDecision(planSecondaryReview(plannerInput));
  if (decision.status === "PRIMARY_RERUN_REQUIRED" || decision.complete_primary_coverage !== true || decision.planner_version !== APPROVED_SECONDARY_PLANNER.planner_version || decision.planner_hash !== APPROVED_SECONDARY_PLANNER.planner_declared_hash || !same(decision.frozen_policy, FROZEN_SECONDARY_POLICY)) return { ok: false, errors: ["approved planner returned an invalid identity, policy, or coverage result"] };
  const plan = {
    contract_id: OQ_SECONDARY_GOVERNANCE_CONTRACT_ID,
    semantic_version: OQ_SECONDARY_GOVERNANCE_CONTRACT_VERSION,
    artifact_kind: OQ_SECONDARY_PLAN_KIND,
    protocol_id: OQ_FINAL_SUCCESSOR_PROTOCOL_ID,
    protocol_hash: trustedRoot.protocol_hash,
    trust_root_id: trustedRoot.trust_root_id,
    evidence_bindings: {
      packet_manifest_hash: trustedRoot.packet_manifest_hash,
      primary_evidence_canonical_fingerprint: trustedRoot.primary_evidence_canonical_fingerprint,
      primary_evidence_raw_sha256: trustedRoot.primary_evidence_raw_sha256,
      membership_set_sha256: trustedRoot.membership_set_sha256,
      deterministic_gate_record_canonical_fingerprint: trustedRoot.deterministic_gate_record_canonical_fingerprint,
      deterministic_gate_record_raw_sha256: trustedRoot.deterministic_gate_record_raw_sha256,
      deterministic_gate_finding_set_sha256: trustedRoot.deterministic_gate_finding_set_sha256,
      opaque_grouping_canonical_fingerprint: trustedRoot.opaque_grouping_canonical_fingerprint,
      opaque_grouping_raw_sha256: trustedRoot.opaque_grouping_raw_sha256,
      primary_input_set_sha256: primary.inputSetSha256,
    },
    policy: { ...FROZEN_SECONDARY_POLICY },
    policy_fingerprint: frozenPolicyFingerprint(),
    approved_planner: { ...APPROVED_SECONDARY_PLANNER },
    decision,
  };
  const canonicalPlanBytes = canonicalJson(plan);
  return { ok: true, plan, canonical_plan_bytes: canonicalPlanBytes, plan_raw_sha256: sha256(canonicalPlanBytes), planner_input: plannerInput, primary_packets: primary.packets };
}

/** Official Protocol-010 entrypoint. Candidate data cannot replace its trust root. */
export function governProtocol010SecondaryPlan(evidence: GovernedPlannerEvidence) {
  return governSecondaryPlanAgainstTrustedRoot(evidence, PROTOCOL_010_SECONDARY_TRUST_ROOT as SecondaryGovernanceTrustRoot);
}

const planFields = ["contract_id", "semantic_version", "artifact_kind", "protocol_id", "protocol_hash", "trust_root_id", "evidence_bindings", "policy", "policy_fingerprint", "approved_planner", "decision"] as const;
const bindingFields = ["packet_manifest_hash", "primary_evidence_canonical_fingerprint", "primary_evidence_raw_sha256", "membership_set_sha256", "deterministic_gate_record_canonical_fingerprint", "deterministic_gate_record_raw_sha256", "deterministic_gate_finding_set_sha256", "opaque_grouping_canonical_fingerprint", "opaque_grouping_raw_sha256", "primary_input_set_sha256"] as const;

/** Validates canonical plan bytes and the external raw-byte hash. */
export function validateGovernedSecondaryPlan(raw: JsonBytes, expectedRawSha256: string, root: SecondaryGovernanceTrustRoot = PROTOCOL_010_SECONDARY_TRUST_ROOT as SecondaryGovernanceTrustRoot) {
  const errors: string[] = []; validateTrustRoot(root, errors);
  if (sha256(bytes(raw)) !== expectedRawSha256) errors.push("governed plan: external raw SHA-256 mismatch");
  const plan = canonicalArtifact(raw, "governed plan", errors);
  if (!exactFields(plan, planFields, planFields, errors, "governed plan")) return { ok: false, errors, plan: null };
  if (plan.contract_id !== OQ_SECONDARY_GOVERNANCE_CONTRACT_ID || plan.semantic_version !== OQ_SECONDARY_GOVERNANCE_CONTRACT_VERSION || plan.artifact_kind !== OQ_SECONDARY_PLAN_KIND || plan.protocol_id !== OQ_FINAL_SUCCESSOR_PROTOCOL_ID || plan.protocol_hash !== root.protocol_hash || plan.trust_root_id !== root.trust_root_id) errors.push("governed plan: contract/trust identity mismatch");
  exactFields(plan.evidence_bindings, bindingFields, bindingFields, errors, "governed plan evidence bindings");
  const expectedBindings: any = { ...root }; delete expectedBindings.trust_root_id; delete expectedBindings.protocol_hash; delete expectedBindings.custodian_implementation_hash; delete expectedBindings.approved_planner_source_sha256;
  for (const key of bindingFields.filter((x) => x !== "primary_input_set_sha256")) if (plan.evidence_bindings?.[key] !== expectedBindings[key]) errors.push(`governed plan: evidence binding mismatch ${key}`);
  if (!isHash(plan.evidence_bindings?.primary_input_set_sha256) || !same(plan.policy, FROZEN_SECONDARY_POLICY) || plan.policy_fingerprint !== frozenPolicyFingerprint() || !same(plan.approved_planner, APPROVED_SECONDARY_PLANNER)) errors.push("governed plan: policy or planner identity mismatch");
  const decision = plan.decision;
  const decisionFields = ["status", "planner_version", "planner_hash", "frozen_policy", "complete_primary_coverage", "decision_sensitivity", "secondary_reviews", "excluded_proofs"] as const;
  exactFields(decision, decisionFields, decisionFields, errors, "governed plan decision");
  exactFields(decision?.decision_sensitivity, ["triggered", "contest"], ["triggered", "contest"], errors, "governed plan sensitivity");
  for (const contest of decision?.decision_sensitivity?.contest || []) {
    exactFields(contest, ["id", "point", "low", "high", "structure"], ["id", "point", "low", "high", "structure"], errors, "governed plan contestant sensitivity");
    exactFields(contest?.structure, ["opaque_contestant_id", "case_ids", "opaque_comparison_group_id"], ["opaque_contestant_id", "case_ids", "opaque_comparison_group_id"], errors, "governed plan contestant structure");
  }
  if (!isObject(decision) || !["SECONDARY_REVIEW_AUTHORIZED", "NO_SECONDARY_REVIEW_MATERIAL"].includes(decision.status) || decision.complete_primary_coverage !== true || decision.planner_version !== APPROVED_SECONDARY_PLANNER.planner_version || decision.planner_hash !== APPROVED_SECONDARY_PLANNER.planner_declared_hash || !same(decision.frozen_policy, FROZEN_SECONDARY_POLICY) || !Array.isArray(decision.secondary_reviews) || !Array.isArray(decision.excluded_proofs)) errors.push("governed plan: malformed approved-planner decision");
  const seen = new Set<string>(); const dimensionIds = new Set(EVALUATOR_DIMENSIONS.map(([id]) => id));
  for (const review of decision?.secondary_reviews || []) {
    exactFields(review, ["opaque_contestant_id", "case_id", "dimension_id", "signals", "interval", "max_remaining_weighted_effect", "blocking", "affected_dimension_ids", "triggering_frozen_boundaries", "current_bounded_interval", "exact_deterministic_reason"], ["opaque_contestant_id", "case_id", "signals", "interval", "max_remaining_weighted_effect", "affected_dimension_ids", "triggering_frozen_boundaries", "current_bounded_interval", "exact_deterministic_reason"], errors, "governed plan review");
    const key = pairKey(review); if (!isOpaqueId(review?.opaque_contestant_id) || typeof review?.case_id !== "string" || seen.has(key)) errors.push("governed plan: invalid/duplicate review membership"); seen.add(key);
    if (!Array.isArray(review?.affected_dimension_ids) || new Set(review.affected_dimension_ids).size !== review.affected_dimension_ids.length || review.affected_dimension_ids.some((x: string) => !dimensionIds.has(x as any))) errors.push("governed plan: invalid requested dimensions");
  }
  for (const proof of decision?.excluded_proofs || []) exactFields(proof, ["opaque_contestant_id", "case_id", "dimension_id", "proof"], ["opaque_contestant_id", "case_id", "dimension_id", "proof"], errors, "governed plan exclusion proof");
  return { ok: errors.length === 0, errors: [...new Set(errors)], plan: errors.length ? null : plan };
}

export type GovernedPacketResult = { ok: true; packet: JsonObject; canonical_packet_bytes: string; packet_raw_sha256: string; manifest: JsonObject; canonical_manifest_bytes: string; manifest_raw_sha256: string } | { ok: false; errors: string[] };

/**
 * Builds with the frozen implementation, then independently proves exact
 * response/dimension coverage. Packet raw SHA-256 lives in the manifest; the
 * manifest's own raw SHA-256 is returned outside the manifest bytes.
 */
export function buildGovernedSecondaryPacket(args: { plan_raw: JsonBytes; plan_raw_sha256: string; evidence: GovernedPlannerEvidence }, root: SecondaryGovernanceTrustRoot = PROTOCOL_010_SECONDARY_TRUST_ROOT as SecondaryGovernanceTrustRoot): GovernedPacketResult {
  const checked = validateGovernedSecondaryPlan(args.plan_raw, args.plan_raw_sha256, root);
  if (!checked.ok || !checked.plan) return { ok: false, errors: checked.errors };
  const regenerated = governSecondaryPlanAgainstTrustedRoot(args.evidence, root);
  if (!regenerated.ok) return { ok: false, errors: regenerated.errors };
  if (regenerated.plan_raw_sha256 !== args.plan_raw_sha256 || regenerated.canonical_plan_bytes !== bytes(args.plan_raw).toString("utf8")) return { ok: false, errors: ["secondary packet: plan does not replay from the trusted evidence bundle"] };
  const plan = checked.plan; const reviews = plan.decision.secondary_reviews || [];
  if (plan.decision.status !== "SECONDARY_REVIEW_AUTHORIZED" || reviews.length === 0) return { ok: false, errors: ["secondary packet is not authorized by the governed plan"] };
  const protocol = args.evidence.protocol; const errors: string[] = []; validateProtocol(protocol, root, errors);
  const entries = regenerated.primary_packets.flatMap((packet: any) => packet?.entries || []);
  const allKeys = entries.map((entry: any) => `${entry?.opaque_contestant_id}|${entry?.case?.case_id}`);
  if (new Set(allKeys).size !== allKeys.length) errors.push("secondary packet: duplicate primary entry membership");
  const requested = new Map(reviews.map((review: any) => [pairKey(review), review]));
  for (const key of requested.keys()) if (!allKeys.includes(key)) errors.push(`secondary packet: requested membership absent ${key}`);
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const packet = buildFinalMinimalSecondaryPacket(plan.decision, { entries }, protocol);
  const packetValidation = validateStrictSecondaryPacket(packet, plan, protocol);
  if (!packetValidation.ok) return { ok: false, errors: packetValidation.errors };
  const canonicalPacketBytes = canonicalJson(packet); const packetRawSha = sha256(canonicalPacketBytes);
  const coverage = packet.entries.flatMap((entry: any) => entry.requested_dimension_ids.length ? entry.requested_dimension_ids.map((id: string) => `${entry.opaque_contestant_id}|${entry.case.case_id}|${id}`) : [`${entry.opaque_contestant_id}|${entry.case.case_id}|<BLOCKING_CASE>`]).sort();
  const manifest = {
    contract_id: OQ_SECONDARY_GOVERNANCE_CONTRACT_ID,
    semantic_version: OQ_SECONDARY_GOVERNANCE_CONTRACT_VERSION,
    artifact_kind: OQ_SECONDARY_PACKET_MANIFEST_KIND,
    protocol_id: OQ_FINAL_SUCCESSOR_PROTOCOL_ID,
    protocol_hash: root.protocol_hash,
    trust_root_id: root.trust_root_id,
    governed_plan_raw_sha256: args.plan_raw_sha256,
    packet_id: packet.packet_id,
    packet_content_fingerprint: packet.packet_hash,
    packet_raw_sha256: packetRawSha,
    response_count: packet.entries.length,
    requested_dimension_count: packet.entries.reduce((n: number, x: any) => n + x.requested_dimension_ids.length, 0),
    exact_coverage_sha256: sha256(coverage.join("\n")),
    complete_plan_coverage: true,
    canonical_packet: true,
  };
  const canonicalManifestBytes = canonicalJson(manifest);
  return { ok: true, packet, canonical_packet_bytes: canonicalPacketBytes, packet_raw_sha256: packetRawSha, manifest, canonical_manifest_bytes: canonicalManifestBytes, manifest_raw_sha256: sha256(canonicalManifestBytes) };
}

const packetFields = ["packet_id", "packet_kind", "protocol", "response_contract", "clean_session_prompt", "entries", "packet_hash"] as const;
const entryFields = ["opaque_contestant_id", "case", "response", "requested_dimension_ids", "response_local_blocking_signal"] as const;

export function validateStrictSecondaryPacket(packet: unknown, governedPlan: JsonObject, protocol: JsonObject) {
  const errors: string[] = [];
  if (!exactFields(packet, packetFields, packetFields, errors, "secondary packet")) return { ok: false, errors };
  const p = packet as JsonObject;
  if (p.packet_kind !== "targeted_independent_secondary_packet" || p.packet_hash !== finalSuccessorPacketHash(p) || !same(p.protocol, protocol) || !same(p.response_contract, FINAL_SUCCESSOR_SCORECARD_SCHEMA)) errors.push("secondary packet: protocol/schema/content fingerprint mismatch");
  if (typeof p.clean_session_prompt !== "string" || !p.clean_session_prompt.includes("no primary score, rationale") || !p.clean_session_prompt.includes("no") || /winner|selected contestant/i.test(p.clean_session_prompt)) errors.push("secondary packet: clean-session boundary mismatch");
  const requested = new Map((governedPlan?.decision?.secondary_reviews || []).map((x: any) => [pairKey(x), x]));
  if (!Array.isArray(p.entries) || p.entries.length !== requested.size) errors.push("secondary packet: exact response coverage mismatch");
  const seen = new Set<string>();
  for (const entry of p.entries || []) {
    exactFields(entry, entryFields, entryFields, errors, "secondary packet entry");
    const key = `${entry?.opaque_contestant_id}|${entry?.case?.case_id}`; const review: any = requested.get(key);
    if (!review || seen.has(key)) errors.push("secondary packet: foreign or duplicate entry"); seen.add(key);
    if (!Array.isArray(entry?.requested_dimension_ids) || !same(entry.requested_dimension_ids, review?.affected_dimension_ids || [])) errors.push("secondary packet: requested dimension coverage mismatch");
    const expectedBlocking = (review?.triggering_frozen_boundaries || []).some((x: string) => x === "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE" || x === "DETERMINISTIC_EVALUATOR_CONFLICT");
    if (entry?.response_local_blocking_signal !== expectedBlocking) errors.push("secondary packet: blocking-signal projection mismatch");
    const forbiddenKeys = new Set(["dimension_judgments", "review_explanation", "judgment_confidence", "evidence_sufficiency", "evidence_sufficiency_dimension_ids", "review_signals", "review_signal_dimension_ids", "primary_score", "primary_rationale"]);
    const scan = (value: unknown) => { if (Array.isArray(value)) for (const item of value) scan(item); else if (isObject(value)) for (const [name, item] of Object.entries(value)) { if (forbiddenKeys.has(name)) errors.push(`secondary packet: prohibited primary-evaluator field ${name}`); scan(item); } };
    scan(entry);
  }
  if (seen.size !== requested.size) errors.push("secondary packet: missing governed review entry");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

const packetManifestFields = ["contract_id", "semantic_version", "artifact_kind", "protocol_id", "protocol_hash", "trust_root_id", "governed_plan_raw_sha256", "packet_id", "packet_content_fingerprint", "packet_raw_sha256", "response_count", "requested_dimension_count", "exact_coverage_sha256", "complete_plan_coverage", "canonical_packet"] as const;

export function validateStrictSecondaryPacketManifest(raw: JsonBytes, expectedRawSha256: string, packetRaw: JsonBytes, planRawSha256: string, root: SecondaryGovernanceTrustRoot = PROTOCOL_010_SECONDARY_TRUST_ROOT as SecondaryGovernanceTrustRoot) {
  const errors: string[] = [];
  if (sha256(bytes(raw)) !== expectedRawSha256) errors.push("secondary manifest: external raw SHA-256 mismatch");
  const manifest = canonicalArtifact(raw, "secondary manifest", errors);
  if (!exactFields(manifest, packetManifestFields, packetManifestFields, errors, "secondary manifest")) return { ok: false, errors, manifest: null };
  const packet = canonicalArtifact(packetRaw, "secondary packet", errors);
  if (manifest.contract_id !== OQ_SECONDARY_GOVERNANCE_CONTRACT_ID || manifest.semantic_version !== OQ_SECONDARY_GOVERNANCE_CONTRACT_VERSION || manifest.artifact_kind !== OQ_SECONDARY_PACKET_MANIFEST_KIND || manifest.protocol_id !== OQ_FINAL_SUCCESSOR_PROTOCOL_ID || manifest.protocol_hash !== root.protocol_hash || manifest.trust_root_id !== root.trust_root_id || manifest.governed_plan_raw_sha256 !== planRawSha256 || manifest.packet_raw_sha256 !== sha256(bytes(packetRaw)) || manifest.packet_id !== packet?.packet_id || manifest.packet_content_fingerprint !== packet?.packet_hash || packet?.packet_hash !== finalSuccessorPacketHash(packet) || manifest.complete_plan_coverage !== true || manifest.canonical_packet !== true) errors.push("secondary manifest: packet/plan/trust binding mismatch");
  const coverage = (packet?.entries || []).flatMap((entry: any) => entry.requested_dimension_ids.length ? entry.requested_dimension_ids.map((id: string) => `${entry.opaque_contestant_id}|${entry.case.case_id}|${id}`) : [`${entry.opaque_contestant_id}|${entry.case.case_id}|<BLOCKING_CASE>`]).sort();
  if (manifest.response_count !== packet?.entries?.length || manifest.requested_dimension_count !== (packet?.entries || []).reduce((n: number, x: any) => n + x.requested_dimension_ids.length, 0) || manifest.exact_coverage_sha256 !== sha256(coverage.join("\n"))) errors.push("secondary manifest: coverage derivation mismatch");
  return { ok: errors.length === 0, errors: [...new Set(errors)], manifest: errors.length ? null : manifest };
}
