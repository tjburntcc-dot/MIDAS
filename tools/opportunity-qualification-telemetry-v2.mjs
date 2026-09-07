/* Local-only v1-to-v2 projection and validation.  It never imports, scores, or selects. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { migrateV1ResponseToV2, validateV2Artifact } from "../packages/eval/src/opportunity-qualification-telemetry-v2.ts";

const root = process.cwd();
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
const v1 = resolve(root, "var/artifacts/opportunity-qualifier-qualification-v1");
const out = resolve(root, "var/artifacts/opportunity-qualifier-qualification-v2");
const inputs = [
  { id: "specialist-run-1", arm: "specialist", source: "specialist-sealed-response-run-1.raw\\.json", packet: "specialist-sealed-packet.json", model: "GPT-5.6 Terra High" },
  { id: "specialist-run-2", arm: "specialist", source: "specialist-sealed-response-run-2.raw\\.json", packet: "specialist-sealed-packet.json", model: "GPT-5.6 Terra High" },
  { id: "frontier-run-1", arm: "frontier", source: "frontier-sealed-response-run-1.raw.json", packet: "frontier-sealed-packet.json", model: "GPT-6 Astra Medium" },
  { id: "frontier-run-2", arm: "frontier", source: "frontier-sealed-response-run-2.raw.json", packet: "frontier-sealed-packet.json", model: "GPT-6 Astra Medium" },
];
function migrate() {
  mkdirSync(out, { recursive: true }); const runs = [];
  for (const input of inputs) {
    const sourcePath = resolve(v1, input.source), packet = read(resolve(v1, input.packet));
    const artifact = migrateV1ResponseToV2({ source: read(sourcePath), source_raw_sha256: hashFile(sourcePath), arm: input.arm, run_id: input.id, operator_attested_selected_model: input.model, source_packet_fingerprint: packet.packet_fingerprint });
    const path = resolve(out, `${input.id}.telemetry-v2.json`); writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n");
    runs.push({ run_id: input.id, path, source_raw_sha256: artifact.source_raw_sha256, migrated_artifact_sha256: hashFile(path), case_count: artifact.responses.length, substantive_pre_hash: artifact.migration.substantive_pre_hash, substantive_post_hash: artifact.migration.substantive_post_hash, zero_substantive_differences: artifact.migration.zero_substantive_differences });
  }
  const manifest = { schema_version: "opportunity-qualification-telemetry-v2-migration-manifest", transformation: "deterministic_v1_to_v2_run_scoped_unknown_telemetry", total_runs: runs.length, total_responses: runs.reduce((n, run) => n + run.case_count, 0), runs };
  writeFileSync(resolve(out, "migration-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ output_directory: out, manifest, operation: "projection only; no import, scoring, unblinding, or selection" }, null, 2));
}
function validate(runId = null) {
  let failures = 0; const results = [];
  const selected = runId ? inputs.filter((input) => input.id === runId) : inputs;
  if (!selected.length) throw new Error(`unknown run id: ${runId}`);
  for (const input of selected) {
    const artifact = read(resolve(out, `${input.id}.telemetry-v2.json`)), packet = read(resolve(v1, input.packet));
    const result = validateV2Artifact(packet, artifact); if (!result.ok) failures++;
    results.push({ run_id: input.id, ok: result.ok, errors: result.errors, case_count: artifact.responses.length, response_fingerprint: result.response_fingerprint, result_fingerprint: result.result_fingerprint, telemetry_eligibility: Object.fromEntries(Object.entries(artifact.run.telemetry).map(([metric, measurement]) => [metric, measurement.status === "measured" ? "eligible_only_if_comparable" : "excluded_unmeasured"])), excluded_metrics: Object.keys(artifact.run.telemetry).filter((metric) => artifact.run.telemetry[metric].status !== "measured").map((metric) => ({ metric, reason: "unknown_unmeasured_interactive_session" })) });
  }
  console.log(JSON.stringify({ operation: "validation only; no import, scoring, unblinding, or selection", results }, null, 2)); if (failures) process.exitCode = 2;
}
if (process.argv[2] === "migrate") migrate();
else if (process.argv[2] === "validate") validate(process.argv[3] || null);
else throw new Error("usage: migrate | validate [specialist-run-1|specialist-run-2|frontier-run-1|frontier-run-2]");
