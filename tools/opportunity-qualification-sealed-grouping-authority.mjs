/*
 * Local one-way custodian for MIDAS-OQ-OPAQUE-GROUPING-AUTHORITY-001.
 * It never reads a Protocol-010 scorecard and emits aggregate status only.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { canonicalHash } from "../packages/eval/src/opportunity-qualification-evaluator-v2.ts";
import { substantiveFingerprint } from "../packages/eval/src/opportunity-qualification-telemetry-v2.ts";
import { deriveOpaqueGroupingFromSealedAuthority, safelyRunSealedCustodian } from "../packages/eval/src/opportunity-qualification-sealed-grouping-custodian.ts";
import { validateOpaqueGroupingArtifact } from "../packages/eval/src/opportunity-qualification-sealed-grouping-authority.ts";

const root = process.cwd();
const dir = resolve(root, "var/artifacts/opportunity-qualifier-evaluator-v2-2");
const recovery = resolve(root, "var/recovery/opportunity-qualifier-opaque-grouping-authority-v1");
const sourceDir = resolve(root, "var/artifacts/opportunity-qualifier-qualification-v2");
const packetDir = resolve(root, "var/artifacts/opportunity-qualifier-qualification-v1");
const statePath = resolve(root, "var/state/sealed/opportunity-qualifier-qualification-v1.json");
const identityMapPath = resolve(dir, "sealed-identity-map.json");
const artifactPath = resolve(dir, "protocol-010-opaque-grouping-authority-v1.json");
const validationPath = resolve(dir, "protocol-010-opaque-grouping-authority-v1.validation.json");
const artifactName = "protocol-010-opaque-grouping-authority-v1.json";
const validationName = "protocol-010-opaque-grouping-authority-v1.validation.json";
const sourceRunFiles = ["specialist-run-1.telemetry-v2.json", "specialist-run-2.telemetry-v2.json", "frontier-run-1.telemetry-v2.json", "frontier-run-2.telemetry-v2.json"];
const sourcePacketFiles = ["specialist-sealed-packet.json", "frontier-sealed-packet.json"];
const expected = {
  protocolId: "MIDAS-OQ-EVALUATOR-PROTOCOL-010",
  protocolHash: "17bbb5d31caf2c8b4c726178a8233dd90f0990ecb076df47faa96b61d4022a22",
  packetManifestHash: "12a1caf0dced7549db532e47582ef1bc4a0f5377b2caa493132f27fcf009d389",
  evidenceFingerprint: "788011a3c1215656f085f9e622f8c63ea80e058af97409570702dc93ff3d0733",
  evidenceRawHash: "e98c66b5c7af658268001ef7eee8d18f6fc85f179ece104eec6d26070d192878",
  gateHash: "352f9426058c3dc85a6ebe26ed4fa6e51b759e4732d6c329adaed16ad324bca0"
};
const implementationVersion = "1.0.0";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const shaFile = (path) => sha(readFileSync(path));
const parse = (path) => JSON.parse(readFileSync(path, "utf8"));
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const publicStatus = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const hashOnly = (path) => ({ path, sha256: shaFile(path) });
const allStrings = (value, output = []) => {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => allStrings(item, output));
  return output;
};
const sensitiveStrings = ({ sealedMap, sourceRuns, sourcePackets, state }) => {
  const values = [
    ...allStrings(sealedMap.mappings.map((x) => x.source_ref)),
    ...allStrings(sourceRuns.map((x) => ({ arm: x.arm, run: x.run }))),
    ...allStrings(sourcePackets.map((x) => ({ arm: x.arm, identity: x.identity }))),
    ...allStrings({ specialist: state.specialist, frontier: state.frontier, prompts: state.prompts })
  ];
  return [...new Set(values.filter((value) => value.length > 2 && !/^C-[A-F0-9]{16}$/.test(value) && !/^[a-f0-9]{64}$/.test(value)))];
};
const writeAtomic = (path, bytes) => {
  mkdirSync(resolve(path, ".."), { recursive: true });
  if (existsSync(path)) { if (!readFileSync(path).equals(bytes)) throw new Error("output collision"); return; }
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, bytes, { flag: "wx" }); renameSync(temporary, path); } finally { /* a failed temporary artifact is identity-free and ignored */ }
};

function frozenInputs() {
  const manifest = parse(resolve(dir, "packet-manifest.json"));
  const evidencePath = resolve(dir, "protocol-010-complete-primary-evidence-manifest.json");
  const evidence = parse(evidencePath);
  const gates = parse(resolve(dir, "protocol-010-deterministic-case-gates.json"));
  const sealedMap = parse(identityMapPath);
  const state = parse(statePath);
  const sourceRuns = sourceRunFiles.map((name) => parse(resolve(sourceDir, name)));
  const sourcePackets = sourcePacketFiles.map((name) => parse(resolve(packetDir, name)));
  const primaryPackets = manifest.packets.map((packet) => parse(resolve(dir, packet.file)));
  if (manifest.protocol_hash !== expected.protocolHash || manifest.manifest_hash !== expected.packetManifestHash || canonicalHash(Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "manifest_hash"))) !== manifest.manifest_hash) throw new Error("public manifest mismatch");
  if (evidence.protocol_id !== expected.protocolId || evidence.protocol_hash !== expected.protocolHash || evidence.canonical_validation_fingerprint !== expected.evidenceFingerprint || shaFile(evidencePath) !== expected.evidenceRawHash || evidence.expected_response_count !== 112 || evidence.unique_opaque_contestant_case_pair_count !== 112 || evidence.required_dimension_judgment_count !== 1008) throw new Error("primary evidence mismatch");
  if (gates.protocol_id !== expected.protocolId || gates.protocol_hash !== expected.protocolHash || gates.input_response_count !== 112 || gates.opaque_run_count !== 4 || gates.critical_finding_count !== 0 || gates.gate_findings_set_sha256 !== expected.gateHash) throw new Error("gate mismatch");
  const sourcePaths = sourceRunFiles.map((name) => resolve(sourceDir, name));
  const sourceHashes = sourcePaths.map(shaFile).sort();
  if (JSON.stringify(sourceHashes) !== JSON.stringify((manifest.source_artifact_hashes || []).slice().sort())) throw new Error("source hash mismatch");
  const expectedPairs = primaryPackets.flatMap((packet) => (packet.entries || []).map((entry) => `${entry.opaque_contestant_id}|${entry.case.case_id}`));
  if (expectedPairs.length !== 112 || new Set(expectedPairs).size !== 112 || sha(expectedPairs.slice().sort().join("\n")) !== evidence.membership_set_sha256) throw new Error("primary membership mismatch");
  const implementationHash = sha(`${shaFile(fileURLToPath(import.meta.url))}:${shaFile(resolve(root, "packages/eval/src/opportunity-qualification-sealed-grouping-custodian.ts"))}:${shaFile(resolve(root, "packages/eval/src/opportunity-qualification-sealed-grouping-authority.ts"))}`);
  const sealedSourceHashes = [shaFile(statePath), shaFile(identityMapPath), ...sourcePackets.map((_, index) => shaFile(resolve(packetDir, sourcePacketFiles[index]))), ...sourceHashes].sort();
  return { manifest, evidence, gates, sealedMap, state, sourceRuns, sourcePackets, expectedPairs, implementationHash, sealedSourceHashes };
}

function derive() {
  const inputs = frozenInputs();
  const artifact = deriveOpaqueGroupingFromSealedAuthority({
    sealed_map: inputs.sealedMap,
    sources: inputs.sourceRuns.map((source) => ({ source_substantive_hash: substantiveFingerprint(source), arm: source.arm, source_packet_fingerprint: source.source_packet_fingerprint, case_ids: source.responses.map((response) => response.case_id) })),
    source_packets: inputs.sourcePackets.map((packet) => ({ arm: packet.arm, packet_fingerprint: packet.packet_fingerprint })),
    expected_primary_pairs: inputs.expectedPairs,
    protocol_010_hash: expected.protocolHash,
    packet_manifest_hash: expected.packetManifestHash,
    evidence_fingerprint: expected.evidenceFingerprint,
    evidence_raw_sha256: expected.evidenceRawHash,
    gate_finding_set_sha256: expected.gateHash,
    sealed_source_hashes: inputs.sealedSourceHashes,
    implementation_version: implementationVersion,
    implementation_hash: inputs.implementationHash
  });
  const bytes = Buffer.from(canonical(artifact), "utf8");
  const reparsed = JSON.parse(bytes.toString("utf8"));
  const validation = validateOpaqueGroupingArtifact(reparsed);
  if (!validation.ok || canonical(reparsed) !== bytes.toString("utf8")) throw new Error("output validation failed");
  const leaks = sensitiveStrings(inputs).filter((value) => bytes.includes(Buffer.from(value, "utf8")));
  if (leaks.length) throw new Error("output leakage detected");
  const again = deriveOpaqueGroupingFromSealedAuthority({
    sealed_map: inputs.sealedMap, sources: inputs.sourceRuns.map((source) => ({ source_substantive_hash: substantiveFingerprint(source), arm: source.arm, source_packet_fingerprint: source.source_packet_fingerprint, case_ids: source.responses.map((response) => response.case_id) })), source_packets: inputs.sourcePackets.map((packet) => ({ arm: packet.arm, packet_fingerprint: packet.packet_fingerprint })), expected_primary_pairs: inputs.expectedPairs, protocol_010_hash: expected.protocolHash, packet_manifest_hash: expected.packetManifestHash, evidence_fingerprint: expected.evidenceFingerprint, evidence_raw_sha256: expected.evidenceRawHash, gate_finding_set_sha256: expected.gateHash, sealed_source_hashes: inputs.sealedSourceHashes, implementation_version: implementationVersion, implementation_hash: inputs.implementationHash
  });
  if (!Buffer.from(canonical(again), "utf8").equals(bytes)) throw new Error("nondeterministic derivation");
  const report = { artifact_type: "oq-opaque-grouping-authority-validation", artifact_sha256: sha(bytes), canonical_artifact_fingerprint: artifact.canonical_artifact_fingerprint, protocol_hash_matches: true, input_hash_matches: true, authority_sources_agree: true, primary_scorecards_read: false, contestant_count: 4, group_count: 2, contestants_per_group: 2, cases_per_contestant: 28, unique_memberships: 112, membership_equality_passed: true, output_strict_validation_passed: true, leakage_scan_passed: true, deterministic_regeneration_passed: true };
  const reportBytes = Buffer.from(canonical(report), "utf8");
  writeAtomic(artifactPath, bytes); writeAtomic(validationPath, reportBytes); writeAtomic(resolve(recovery, artifactName), bytes); writeAtomic(resolve(recovery, validationName), reportBytes);
  if (!readFileSync(artifactPath).equals(readFileSync(resolve(recovery, artifactName))) || !readFileSync(validationPath).equals(readFileSync(resolve(recovery, validationName)))) throw new Error("recovery mismatch");
  return { ok: true, input_hash_matches: true, source_agreement: true, contestant_count: 4, group_count: 2, cases_per_contestant: 28, unique_memberships: 112, output_sha256: sha(bytes), canonical_artifact_fingerprint: artifact.canonical_artifact_fingerprint, leakage_scan_passed: true, deterministic_regeneration_passed: true, recovery_copy_verified: true };
}

const result = safelyRunSealedCustodian(derive);
publicStatus(result.ok ? result.value : { ok: false, code: result.code, input_hash_matches: false, source_agreement: false, leakage_scan_passed: false, deterministic_regeneration_passed: false });
process.exitCode = result.ok ? 0 : 2;
