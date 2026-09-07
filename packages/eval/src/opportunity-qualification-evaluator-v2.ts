/**
 * MIDAS-OQ-EVALUATOR-PROTOCOL-007.  This module is a packet/contract factory,
 * never an evaluator.  It has no provider, selector, or routing dependency.
 */
import { createHash } from "node:crypto";
import { fingerprint, type CampaignSpec } from "./opportunity-qualification-campaign.ts";

export const OQ_EVALUATOR_PROTOCOL_ID = "MIDAS-OQ-EVALUATOR-PROTOCOL-007";
export const OQ_EVALUATOR_PROTOCOL_VERSION = "1.0.0";
export const SCORE_VALUES = [0, 1, 2, 3] as const;
export const UNCERTAINTY = ["NONE", "LIMITED", "MATERIAL", "INSUFFICIENT_EVIDENCE"] as const;
export const CONFIDENCE = ["HIGH", "MODERATE", "LOW"] as const;
export const ESCALATIONS = ["LOW_CONFIDENCE", "MATERIAL_CONTRADICTION", "INSUFFICIENT_EVIDENCE", "JUDGMENTAL_CRITICAL_FAILURE", "AMBIGUITY", "DETERMINISTIC_CONFLICT", "MATERIAL_MARGIN_RISK", "CLOSE_AGGREGATE_RISK", "UNSUPPORTED_REASONING", "REPLAY_INSTABILITY"] as const;
export const CRITICAL = ["NO_CRITICAL_FAILURE", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE"] as const;
const identityPattern = /(?:terra|astra|gpt[- ]?\d|specialist|frontier|premium|cheap|run[ _-]?[12])/i;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonical = (value: any): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}` : JSON.stringify(value);
export const canonicalHash = (value: any) => sha(canonical(value));

/** Exact frozen dimensions. Deterministic dimensions are gates, not invented point awards. */
export const FROZEN_DIMENSIONS = [
  ["disposition_quality", 16, false, "Selects a disposition justified by the supplied commercial evidence and constraints."],
  ["evidence_fidelity", 14, true, "Deterministic citation/fabrication checks gate factual evidence fidelity."],
  ["buyer_access", 9, false, "Identifies a reachable paying or signing path without assuming access."],
  ["willingness_to_pay", 8, false, "Separates observed willingness to pay from interest, listed prices, or assumptions."],
  ["economic_correctness", 12, true, "Deterministic numeric and invented-transaction checks gate economics."],
  ["hidden_labor", 8, false, "Accounts for delivery, owner attention, and unpriced work material to viability."],
  ["alternative_analysis", 7, false, "Tests incumbents, native tools, and direct frontier substitution against the offer."],
  ["anti_thesis", 7, false, "States the strongest disconfirming case and lets it affect the disposition."],
  ["validation_decisiveness", 8, false, "Proposes a cheap, feasible test that could change the decision."],
  ["actionability", 5, false, "Gives a concrete next action proportionate to evidence and authority."],
  ["uncertainty_calibration", 4, false, "Labels unknowns, assumptions, and evidence limits without false certainty."],
  ["authority_policy", 2, true, "Deterministic authority and unsafe-commitment checks gate policy compliance."],
] as const;
export const EVALUATOR_DIMENSIONS = FROZEN_DIMENSIONS.filter((d) => !d[2]);
export const EVALUATOR_WEIGHT_TOTAL = EVALUATOR_DIMENSIONS.reduce((n, d) => n + d[1], 0);

const scaleAnchors: Record<number, string> = {
  0: "Absent, materially wrong, contradicted by authorized evidence, or unsafe; the response does not satisfy the dimension.",
  1: "Partial or weak: recognizes some relevant issue but has a material unsupported leap, omission, or non-decisive treatment.",
  2: "Adequate: evidence-grounded and materially correct, with only bounded omissions that do not reverse the stated disposition.",
  3: "Strong: precise, evidence-grounded, handles material counterevidence/unknowns, and reaches a proportionate, falsifiable conclusion.",
};
const dimensionAnchors = Object.fromEntries(EVALUATOR_DIMENSIONS.map(([id, , , meaning]) => [id, Object.fromEntries(SCORE_VALUES.map((score) => [score, `${meaning} ${scaleAnchors[score]}`]))]));

export const EVALUATOR_SCORECARD_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema", title: "MIDAS blind evaluator scorecard", type: "object", additionalProperties: false,
  required: ["evaluator_protocol_id", "evaluator_run_id", "packet_id", "packet_hash", "protocol_hash", "independence_attestation", "run_metadata", "responses"],
  properties: {
    evaluator_protocol_id: { const: OQ_EVALUATOR_PROTOCOL_ID }, evaluator_run_id: { type: "string", minLength: 1 }, packet_id: { type: "string", minLength: 1 }, packet_hash: { type: "string", pattern: "^[a-f0-9]{64}$" }, protocol_hash: { type: "string", pattern: "^[a-f0-9]{64}$" }, independence_attestation: { const: "INDEPENDENT_BLIND_SESSION" },
    run_metadata: { type: "object", additionalProperties: false, required: ["operator_attested_evaluator_model", "provider_reported_identity", "observed_output_timestamp", "telemetry_v2", "response_count"], properties: { operator_attested_evaluator_model: { type: "string", minLength: 1 }, provider_reported_identity: { type: ["string", "null"] }, observed_output_timestamp: { type: ["string", "null"] }, telemetry_v2: { type: "object" }, response_count: { type: "integer", minimum: 1 } } },
    responses: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["opaque_contestant_id", "case_id", "dimension_judgments", "observed_contradiction_ids", "uncertainty", "confidence", "critical_failure", "second_evaluator_required", "escalation_reasons", "validation_status"], properties: { opaque_contestant_id: { type: "string", pattern: "^C-[A-F0-9]{16}$" }, case_id: { type: "string", minLength: 1 }, dimension_judgments: { type: "array", minItems: EVALUATOR_DIMENSIONS.length, maxItems: EVALUATOR_DIMENSIONS.length, items: { type: "object", additionalProperties: false, required: ["dimension_id", "score", "anchor", "evidence_ids", "rationale"], properties: { dimension_id: { enum: EVALUATOR_DIMENSIONS.map((d) => d[0]) }, score: { enum: SCORE_VALUES }, anchor: { type: "string", minLength: 1 }, evidence_ids: { type: "array", items: { type: "string" } }, rationale: { type: "string", minLength: 1 } } } }, observed_contradiction_ids: { type: "array", items: { type: "string" } }, uncertainty: { enum: UNCERTAINTY }, confidence: { enum: CONFIDENCE }, critical_failure: { enum: CRITICAL }, second_evaluator_required: { type: "boolean" }, escalation_reasons: { type: "array", items: { enum: ESCALATIONS } }, validation_status: { const: "VALID" } } } }
  }
} as const;

export function protocol(spec: CampaignSpec, sourcePacketFingerprints: string[]) {
  const body = { protocol_id: OQ_EVALUATOR_PROTOCOL_ID, semantic_version: OQ_EVALUATOR_PROTOCOL_VERSION, source_campaign: { campaign_id: spec.campaign_id, campaign_version: spec.version, campaign_fingerprint: "A1382D89CFF01CFA6D04B0C29FAD53AE6229D77611B8592C260EFBED1316835F", source_packet_fingerprints: sourcePacketFingerprints.slice().sort() },
    purpose: "Blind judgment of evaluator-scored quality dimensions only. No evaluation, comparison, selection, certification, or routing occurs in this protocol factory.",
    dimensions: FROZEN_DIMENSIONS.map(([id, weight, deterministic, meaning]) => ({ id, weight, deterministic, meaning, anchors: deterministic ? null : dimensionAnchors[id] })),
    scoring_scale: { values: SCORE_VALUES, anchors: scaleAnchors }, permitted_evidence: "Only packet case evidence and the assigned identity-free response; cite packet evidence IDs only.", prohibited_information: ["contestant identity", "model family", "operational telemetry", "source paths", "source order", "other responses", "prior scores", "rankings"],
    missing_evidence: "Record INSUFFICIENT_EVIDENCE; do not infer a favorable fact. Missing judgment is invalid and blocks aggregation.", contradictions: "Name only packet evidence IDs whose claims materially conflict; do not resolve material contradictions by assumption.", uncertainty: UNCERTAINTY, confidence: CONFIDENCE,
    critical_failure_reporting: "Report only a judgment-dependent potential critical failure with evidence-grounded rationale; deterministic critical findings are supplied later and cannot be overridden.",
    aggregation: { deterministic_gates_first: true, evaluator_weight_total: EVALUATOR_WEIGHT_TOTAL, formula: "normalized_quality = round_6(sum(weight * score / 3) / evaluator_weight_total * 100)", missing_judgment: "BLOCKED", ties: "TIE", no_winner: true, excluded_inputs: ["model identity", "evaluator identity", "telemetry", "contestant order", "response order"] },
    second_evaluator: { trigger_if_any: ESCALATIONS, low_confidence: "confidence LOW", insufficient_or_contradictory: "uncertainty MATERIAL or INSUFFICIENT_EVIDENCE, or contradiction IDs", judgmental_critical: true, close_margin: "When a response's maximum remaining weighted effect is at least 5 frozen quality points, mark MATERIAL_MARGIN_RISK; later close aggregate comparison is also escalated.", reconciliation: "For each dimension, scores differing by at most 1 combine by arithmetic mean only when neither scorecard flags a material trigger; otherwise DISPUTED_REQUIRES_ADJUDICATION. Any unresolved dispute blocks certification.", second_packet: "Same blinded evidence and protocol, no primary score, rationale, model identity, ranking, or telemetry." },
    replay: "Canonical JSON SHA-256 hashes; deterministic sorting; identical inputs must reproduce byte-identical packet material and manifest."
  };
  return { ...body, protocol_hash: canonicalHash(body) };
}

export function validateScorecard(card: any, packet: any, p: any, deterministicFindings: any[] = []) {
  const errors: string[] = [];
  if (!card || typeof card !== "object" || Array.isArray(card)) return { ok: false, errors: ["scorecard must be a JSON object"] };
  const allowed = new Set(Object.keys(EVALUATOR_SCORECARD_SCHEMA.properties)); for (const key of Object.keys(card)) if (!allowed.has(key)) errors.push(`unknown top-level field: ${key}`);
  for (const key of EVALUATOR_SCORECARD_SCHEMA.required) if (!(key in card)) errors.push(`missing ${key}`);
  if (card.evaluator_protocol_id !== OQ_EVALUATOR_PROTOCOL_ID || card.protocol_hash !== p.protocol_hash || card.packet_id !== packet.packet_id || card.packet_hash !== packet.packet_hash) errors.push("protocol or packet mismatch");
  if (card.independence_attestation !== "INDEPENDENT_BLIND_SESSION") errors.push("independence attestation missing");
  if (!card.run_metadata || !String(card.run_metadata.operator_attested_evaluator_model || "").trim() || card.run_metadata.response_count !== (card.responses || []).length) errors.push("invalid run metadata");
  const entries = new Map((packet.entries || []).map((e: any) => [`${e.opaque_contestant_id}|${e.case.case_id}`, e])); const seen = new Set<string>();
  const runAllowed = new Set(["operator_attested_evaluator_model", "provider_reported_identity", "observed_output_timestamp", "telemetry_v2", "response_count"]); for (const key of Object.keys(card.run_metadata || {})) if (!runAllowed.has(key)) errors.push(`unknown run metadata field: ${key}`);
  for (const row of card.responses || []) {
    const rowAllowed = new Set(["opaque_contestant_id", "case_id", "dimension_judgments", "observed_contradiction_ids", "uncertainty", "confidence", "critical_failure", "second_evaluator_required", "escalation_reasons", "validation_status"]); for (const field of Object.keys(row || {})) if (!rowAllowed.has(field)) errors.push(`unknown response field: ${field}`);
    const key = `${row.opaque_contestant_id}|${row.case_id}`; if (!entries.has(key)) errors.push(`foreign response: ${key}`); if (seen.has(key)) errors.push(`duplicate response: ${key}`); seen.add(key);
    if (identityPattern.test(String(row.opaque_contestant_id || ""))) errors.push("identity-bearing contestant label");
    const dims = new Map((row.dimension_judgments || []).map((d: any) => [d.dimension_id, d]));
    if (dims.size !== EVALUATOR_DIMENSIONS.length) errors.push(`${key}: missing or duplicate evaluator dimensions`);
    for (const [id] of EVALUATOR_DIMENSIONS) { const d: any = dims.get(id); if (d) { const dimAllowed = new Set(["dimension_id", "score", "anchor", "evidence_ids", "rationale"]); for (const field of Object.keys(d)) if (!dimAllowed.has(field)) errors.push(`${key}: unknown dimension field ${field}`); } if (!d || !SCORE_VALUES.includes(d.score) || d.anchor !== dimensionAnchors[id]?.[d.score] || !String(d.rationale || "").trim()) { errors.push(`${key}: invalid anchored score for ${id}`); continue; } const authorized = new Set((entries.get(key)?.case.evidence || []).map((e: any) => e.id)); if (!Array.isArray(d.evidence_ids) || d.evidence_ids.some((id: string) => !authorized.has(id))) errors.push(`${key}: unauthorized evidence citation`); }
    if (!UNCERTAINTY.includes(row.uncertainty) || !CONFIDENCE.includes(row.confidence) || !CRITICAL.includes(row.critical_failure)) errors.push(`${key}: malformed uncertainty/confidence/critical field`);
    const required: string[] = []; if (row.confidence === "LOW") required.push("LOW_CONFIDENCE"); if (["MATERIAL", "INSUFFICIENT_EVIDENCE"].includes(row.uncertainty)) required.push("INSUFFICIENT_EVIDENCE"); if ((row.observed_contradiction_ids || []).length) required.push("MATERIAL_CONTRADICTION"); if (row.critical_failure !== "NO_CRITICAL_FAILURE") required.push("JUDGMENTAL_CRITICAL_FAILURE"); if (deterministicFindings.some((f) => f.case_id === row.case_id)) required.push("DETERMINISTIC_CONFLICT");
    if (required.some((reason) => !(row.escalation_reasons || []).includes(reason)) || Boolean(required.length) !== row.second_evaluator_required) errors.push(`${key}: required escalation absent`);
  }
  if (seen.size !== entries.size) errors.push("missing packet responses");
  return { ok: errors.length === 0, errors };
}

export function aggregateScorecards(cards: any[], packets: any[], p: any, deterministicGatePassed = true) {
  if (!deterministicGatePassed) return { status: "BLOCKED_DETERMINISTIC_GATE", normalized_quality: null, winner: null };
  const packet = { entries: packets.flatMap((x) => x.entries || []), packet_id: "aggregate", packet_hash: "aggregate" };
  const allRows = cards.flatMap((card) => card.responses || []); if (!cards.length || !allRows.length) return { status: "BLOCKED_MISSING_JUDGMENT", normalized_quality: null, winner: null };
  const expected = new Set(packet.entries.map((e: any) => `${e.opaque_contestant_id}|${e.case.case_id}`)); const values: number[] = [];
  for (const key of expected) { const rows = allRows.filter((r: any) => `${r.opaque_contestant_id}|${r.case_id}` === key); if (rows.length !== 1) return { status: "BLOCKED_MISSING_OR_DISPUTED_JUDGMENT", normalized_quality: null, winner: null }; for (const [id, weight] of EVALUATOR_DIMENSIONS) { const d = (rows[0].dimension_judgments || []).find((x: any) => x.dimension_id === id); if (!d || !SCORE_VALUES.includes(d.score)) return { status: "BLOCKED_MISSING_JUDGMENT", normalized_quality: null, winner: null }; values.push(weight * d.score / 3); } }
  const quality = Math.round((values.reduce((a, b) => a + b, 0) / expected.size / EVALUATOR_WEIGHT_TOTAL * 100) * 1e6) / 1e6;
  return { status: "AGGREGATED_QUALITY_ONLY", normalized_quality: quality, evaluator_weight_total: EVALUATOR_WEIGHT_TOTAL, winner: null };
}

export function reconcileDimension(primary: number, secondary: number, materialTrigger: boolean) { return materialTrigger || Math.abs(primary - secondary) > 1 ? { status: "DISPUTED_REQUIRES_ADJUDICATION", score: null } : { status: "RECONCILED", score: (primary + secondary) / 2 }; }
export function opaqueId(sourceSubstantiveHash: string) { return `C-${sha(`MIDAS-OQ-EVAL-V2:${sourceSubstantiveHash}`).slice(0, 16).toUpperCase()}`; }
export function packetHash(packet: any) { const { packet_hash, ...body } = packet; return canonicalHash(body); }
export const scoreAnchor = (id: string, score: number) => dimensionAnchors[id]?.[score] ?? null;
