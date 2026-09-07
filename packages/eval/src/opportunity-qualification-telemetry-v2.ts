/**
 * MIDAS-OQ-TELEMETRY-V2-005.
 *
 * The v1 campaign contract is intentionally left untouched.  This module is a
 * versioned, run-scoped telemetry envelope and a selector which never converts
 * an absent observation into a numeric result.
 */
import { createHash } from "node:crypto";
import { OQ_DISPOSITIONS, fingerprint, type CampaignSpec } from "./opportunity-qualification-campaign.ts";

export const OQ_TELEMETRY_V2_VERSION = "2.0.0";
export const MEASUREMENT_STATUSES = ["measured", "unknown_unmeasured_interactive_session", "not_applicable"] as const;
export type MeasurementStatus = typeof MEASUREMENT_STATUSES[number];
export const TELEMETRY_METRICS = ["latency_ms", "input_tokens", "output_tokens", "actual_cost_usd", "human_correction_minutes"] as const;
export type TelemetryMetric = typeof TELEMETRY_METRICS[number];

export interface MeasurementProvenance {
  source: string;
  basis: string;
  unit: string;
  scope: string;
  observed_at?: string | null;
  observation_reference?: string | null;
}
export interface TelemetryMeasurement { status: MeasurementStatus; value: number | null; provenance: MeasurementProvenance | null; }
export interface RunTelemetry { latency_ms: TelemetryMeasurement; input_tokens: TelemetryMeasurement; output_tokens: TelemetryMeasurement; actual_cost_usd: TelemetryMeasurement; human_correction_minutes: TelemetryMeasurement; }
export interface ModelIdentityV2 {
  operator_attested_selected_model: string;
  provider_reported_model: string | null;
  exact_version: string | null;
  provenance_status: "operator_attested" | "provider_reported" | "unknown";
}

const expectedUnit: Record<TelemetryMetric, string> = { latency_ms: "ms", input_tokens: "tokens", output_tokens: "tokens", actual_cost_usd: "USD", human_correction_minutes: "minutes" };
const text = (value: unknown) => String(value ?? "").trim();
const isFiniteNonNegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function unknownInteractiveMeasurement(): TelemetryMeasurement {
  return { status: "unknown_unmeasured_interactive_session", value: null, provenance: null };
}

export function unknownInteractiveTelemetry(): RunTelemetry {
  return Object.fromEntries(TELEMETRY_METRICS.map((metric) => [metric, unknownInteractiveMeasurement()])) as RunTelemetry;
}

export function validateTelemetryMeasurement(metric: TelemetryMetric, measurement: any) {
  const errors: string[] = [];
  if (!measurement || typeof measurement !== "object" || !MEASUREMENT_STATUSES.includes(measurement.status)) return { ok: false, errors: [`${metric}: measurement status is required`] };
  if (measurement.status === "measured") {
    if (!isFiniteNonNegative(measurement.value)) errors.push(`${metric}: measured value must be finite and nonnegative`);
    const p = measurement.provenance;
    if (!p || typeof p !== "object" || !text(p.source) || !text(p.basis) || !text(p.unit) || !text(p.scope) || (!text(p.observed_at) && !text(p.observation_reference))) errors.push(`${metric}: measured value requires complete measurement provenance`);
    else if (p.unit !== expectedUnit[metric]) errors.push(`${metric}: incompatible unit ${p.unit}; expected ${expectedUnit[metric]}`);
  } else {
    if (measurement.value !== null) errors.push(`${metric}: ${measurement.status} requires a null value`);
    if (measurement.provenance != null) errors.push(`${metric}: ${measurement.status} must not claim measured provenance`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateRunTelemetry(telemetry: any) {
  const errors: string[] = [];
  for (const metric of TELEMETRY_METRICS) errors.push(...validateTelemetryMeasurement(metric, telemetry?.[metric]).errors);
  return { ok: errors.length === 0, errors };
}

/** Canonical v2 stores telemetry once per run.  This adapter is presentation-only. */
export function projectRunTelemetryOntoResponses(artifact: any) {
  return (artifact.responses || []).map((response: any) => ({ ...response, telemetry_v2: artifact.run?.telemetry ?? null }));
}

function validateResponseShape(packet: any, artifact: any) {
  const errors: string[] = [];
  const expected = new Set((packet?.cases || []).map((c: any) => c.case_id));
  const rows = artifact?.responses;
  if (!Array.isArray(rows) || rows.length !== expected.size) errors.push("response must include exactly one response per case");
  const seen = new Set<string>();
  for (const row of rows || []) {
    for (const key of ["case_id", "disposition", "decision_rationale", "evidence_ids", "unknowns", "cheap_decisive_validation", "authority_requirements", "economic_assessment"]) if (!(key in row)) errors.push(`${row.case_id || "unknown"}: missing ${key}`);
    if (!expected.has(row.case_id)) errors.push(`${row.case_id}: foreign or changed case id`);
    if (seen.has(row.case_id)) errors.push(`${row.case_id}: duplicate result`); seen.add(row.case_id);
    if (!OQ_DISPOSITIONS.includes(row.disposition)) errors.push(`${row.case_id}: invalid disposition`);
    const evidence = new Set((packet?.cases?.find((c: any) => c.case_id === row.case_id)?.evidence || []).map((e: any) => e.id));
    for (const id of row.evidence_ids || []) if (!evidence.has(id)) errors.push(`${row.case_id}: invented evidence id ${id}`);
  }
  for (const id of expected) if (!seen.has(id)) errors.push(`${id}: missing response`);
  return errors;
}

export function validateV2Artifact(packet: any, artifact: any, existingResultFingerprints: string[] = []) {
  const errors: string[] = [];
  if (!artifact || artifact.schema_version !== "opportunity-qualification-telemetry-v2") errors.push("v2 telemetry schema_version is required");
  if (artifact?.campaign_id !== packet?.campaign_id || artifact?.source_campaign_version !== packet?.campaign_version) errors.push("campaign compatibility mismatch");
  if (artifact?.source_packet_fingerprint !== packet?.packet_fingerprint) errors.push("packet fingerprint mismatch");
  if (!text(artifact?.run?.run_id)) errors.push("run id is required");
  const identity = artifact?.run?.model_identity;
  if (!identity || !text(identity.operator_attested_selected_model) || !["operator_attested", "provider_reported", "unknown"].includes(identity.provenance_status)) errors.push("truthful model identity is required");
  errors.push(...validateRunTelemetry(artifact?.run?.telemetry).errors, ...validateResponseShape(packet, artifact));
  const response_fingerprint = fingerprint({ source_packet_fingerprint: artifact?.source_packet_fingerprint, responses: artifact?.responses, run: artifact?.run });
  if (!errors.length && existingResultFingerprints.includes(response_fingerprint)) errors.push("duplicate-result protection: result already imported");
  return { ok: errors.length === 0, errors, response_fingerprint, result_fingerprint: fingerprint({ response_fingerprint, schema_version: artifact?.schema_version }) };
}

export function substantiveResponses(value: any) {
  // One preserved specialist raw file used a case-id object rather than the
  // documented { responses: [] } wrapper.  Canonicalize only that container;
  // each original response object (and therefore its judgment) is retained.
  const rows = Array.isArray(value?.responses) ? value.responses : Object.values(value || {}).sort((left: any, right: any) => String(left?.case_id).localeCompare(String(right?.case_id)));
  return rows.map((row: any) => {
    const { run_metadata, telemetry_v2, ...response } = row;
    return response;
  });
}
export function substantiveFingerprint(value: any) { return fingerprint(substantiveResponses(value)); }

export function migrateV1ResponseToV2(args: { source: any; source_raw_sha256: string; arm: "specialist" | "frontier"; run_id: string; operator_attested_selected_model: string; source_packet_fingerprint: string; }) {
  const responses = substantiveResponses(args.source);
  const pre = substantiveFingerprint(args.source);
  const artifact: any = {
    schema_version: "opportunity-qualification-telemetry-v2", campaign_id: "MIDAS-FOUNDRY-004", campaign_version: OQ_TELEMETRY_V2_VERSION, source_campaign_version: "1.0.0", arm: args.arm,
    source_packet_fingerprint: args.source_packet_fingerprint, source_raw_sha256: args.source_raw_sha256,
    run: { run_id: args.run_id, model_identity: { operator_attested_selected_model: args.operator_attested_selected_model, provider_reported_model: null, exact_version: null, provenance_status: "operator_attested" }, telemetry: unknownInteractiveTelemetry() },
    responses,
  };
  const post = substantiveFingerprint(artifact);
  artifact.migration = { transformation: "v1_per_case_run_metadata_to_v2_run_scoped_telemetry", source_raw_sha256: args.source_raw_sha256, substantive_pre_hash: pre, substantive_post_hash: post, substantive_case_hashes: responses.map((response: any) => ({ case_id: response.case_id, pre_hash: fingerprint(response), post_hash: fingerprint(response) })), zero_substantive_differences: pre === post };
  artifact.artifact_sha256 = sha256(JSON.stringify(artifact));
  return artifact;
}

export const OQ_V2_SELECTIONS = ["SPECIALIST_SELECTED", "FRONTIER_SELECTED", "TIE", "INSUFFICIENT_COMPARABLE_EVIDENCE", "INSUFFICIENT_EVIDENCE", "CAMPAIGN_INVALID"] as const;
export type OqV2Selection = typeof OQ_V2_SELECTIONS[number];
type Evidence = { metric: TelemetryMetric; eligible: boolean; reason: string; };

function armSummary(runs: any[]) {
  const quality = runs.reduce((n, r) => n + Number(r.quality ?? 0), 0) / runs.length;
  return { quality, spread: Math.max(...runs.map((r) => Number(r.quality ?? 0))) - Math.min(...runs.map((r) => Number(r.quality ?? 0))), critical: runs.flatMap((r) => r.critical_failures || []).length, complete: runs.every((r) => r.complete_provenance) };
}
function comparableMetric(metric: TelemetryMetric, specialist: any[], frontier: any[]): Evidence & { specialist_value?: number; frontier_value?: number } {
  const all = specialist.concat(frontier);
  const measurements = all.map((run) => run.telemetry?.[metric]);
  if (measurements.some((m) => !m || m.status !== "measured")) return { metric, eligible: false, reason: "at least one relevant contestant is unmeasured" };
  const checks = measurements.map((m) => validateTelemetryMeasurement(metric, m));
  if (checks.some((check) => !check.ok)) return { metric, eligible: false, reason: "at least one measured value is invalid" };
  const first = measurements[0].provenance;
  if (measurements.some((m) => m.provenance.unit !== first.unit || m.provenance.basis !== first.basis || m.provenance.scope !== first.scope)) return { metric, eligible: false, reason: "measurement units, bases, or scopes are incompatible" };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { metric, eligible: true, reason: "all relevant contestants have comparable measured telemetry", specialist_value: mean(specialist.map((r) => r.telemetry[metric].value)), frontier_value: mean(frontier.map((r) => r.telemetry[metric].value)) };
}

export function selectCampaignWinnerV2(args: { spec: CampaignSpec; specialist?: any[]; frontier?: any[]; contaminated?: boolean; evaluator_reliable?: boolean }) {
  if (args.contaminated) return { selection: "CAMPAIGN_INVALID" as OqV2Selection, reason: "contamination or invalidation condition", telemetry_evidence: [] };
  if (!args.evaluator_reliable || !args.specialist || !args.frontier || args.specialist.length < args.spec.stability.minimum_runs_per_arm || args.frontier.length < args.spec.stability.minimum_runs_per_arm) return { selection: "INSUFFICIENT_EVIDENCE" as OqV2Selection, reason: "both arms need frozen repeated independently evaluated runs", telemetry_evidence: [] };
  const s = armSummary(args.specialist), f = armSummary(args.frontier);
  if (!s.complete || !f.complete || s.spread > args.spec.stability.maximum_mean_spread || f.spread > args.spec.stability.maximum_mean_spread) return { selection: "INSUFFICIENT_EVIDENCE" as OqV2Selection, reason: "provenance or stability gate failed", specialist: s, frontier: f, telemetry_evidence: [] };
  if (s.critical && !f.critical) return { selection: "FRONTIER_SELECTED" as OqV2Selection, reason: "specialist failed a critical gate", specialist: s, frontier: f, telemetry_evidence: [] };
  if (f.critical && !s.critical) return { selection: "SPECIALIST_SELECTED" as OqV2Selection, reason: "frontier failed a critical gate", specialist: s, frontier: f, telemetry_evidence: [] };
  if (s.critical || f.critical) return { selection: "INSUFFICIENT_EVIDENCE" as OqV2Selection, reason: "both arms failed a critical gate", specialist: s, frontier: f, telemetry_evidence: [] };
  const delta = s.quality - f.quality;
  if (delta >= args.spec.practical_superiority_margin) return { selection: "SPECIALIST_SELECTED" as OqV2Selection, reason: "frozen quality margin met", specialist: s, frontier: f, telemetry_evidence: [] };
  if (-delta >= args.spec.practical_superiority_margin) return { selection: "FRONTIER_SELECTED" as OqV2Selection, reason: "frontier quality margin met", specialist: s, frontier: f, telemetry_evidence: [] };
  const evidence = TELEMETRY_METRICS.map((metric) => comparableMetric(metric, args.specialist!, args.frontier!));
  const tieBreakers: Array<[TelemetryMetric, number]> = [["actual_cost_usd", .2], ["latency_ms", .25], ["human_correction_minutes", .2]];
  for (const [metric, threshold] of tieBreakers) {
    const item = evidence.find((candidate) => candidate.metric === metric)!;
    if (!item.eligible) continue;
    const meaningful = (better: number, worse: number) => better <= worse * (1 - threshold);
    if (meaningful(item.specialist_value!, item.frontier_value!)) return { selection: "SPECIALIST_SELECTED" as OqV2Selection, reason: `quality tie; comparable ${metric} advantage met`, specialist: s, frontier: f, telemetry_evidence: evidence };
    if (meaningful(item.frontier_value!, item.specialist_value!)) return { selection: "FRONTIER_SELECTED" as OqV2Selection, reason: `quality tie; comparable ${metric} advantage met`, specialist: s, frontier: f, telemetry_evidence: evidence };
  }
  const hasComparableTieBreaker = evidence.some((item) => tieBreakers.some(([metric]) => item.metric === metric) && item.eligible);
  return { selection: hasComparableTieBreaker ? "TIE" as OqV2Selection : "INSUFFICIENT_COMPARABLE_EVIDENCE" as OqV2Selection, reason: hasComparableTieBreaker ? "frozen margin not met and comparable tie-breakers did not decide" : "quality tied and no comparable frozen telemetry tie-breaker exists", specialist: s, frontier: f, telemetry_evidence: evidence };
}
