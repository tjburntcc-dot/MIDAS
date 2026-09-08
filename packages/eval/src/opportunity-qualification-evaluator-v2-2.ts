/**
 * MIDAS-OQ-EVALUATOR-SEMANTICS-010.  Immutable successor-only evaluator
 * contract.  This module never invokes an evaluator, scores a campaign,
 * unblinds identities, compares contestants, or makes a routing decision.
 */
import { type CampaignSpec } from "./opportunity-qualification-campaign.ts";
import { FROZEN_DIMENSIONS, EVALUATOR_DIMENSIONS, SCORE_VALUES, canonicalHash } from "./opportunity-qualification-evaluator-v2.ts";
import { planSecondaryReview } from "./opportunity-qualification-evaluator-v2-1.ts";

export const OQ_FINAL_SUCCESSOR_PROTOCOL_ID = "MIDAS-OQ-EVALUATOR-PROTOCOL-010";
export const OQ_FINAL_SUCCESSOR_PROTOCOL_VERSION = "2.2.0";
export const REVIEW_SIGNALS_V22 = ["LOW_CONFIDENCE", "MATERIAL_CONTRADICTION", "INSUFFICIENT_EVIDENCE", "AMBIGUITY", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE", "UNSUPPORTED_REASONING"] as const;
export const JUDGMENT_CONFIDENCE_V22 = ["HIGH", "MODERATE", "LOW"] as const;
export const EVIDENCE_SUFFICIENCY_V22 = ["SUFFICIENT", "LIMITED", "INSUFFICIENT_EVIDENCE"] as const;
export const CRITICAL_V22 = ["NO_CRITICAL_FAILURE", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE"] as const;
const dimensionIds = EVALUATOR_DIMENSIONS.map(([id]) => id);
const dimensions = new Set(dimensionIds);
const canonicalJson = (value: any): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}` : JSON.stringify(value);
const anchors: Record<string, Record<number, string>> = Object.fromEntries(EVALUATOR_DIMENSIONS.map(([id, , , meaning]) => [id, Object.fromEntries(SCORE_VALUES.map((score) => [score, `${meaning} ${["Absent, materially wrong, contradicted by authorized evidence, or unsafe; the response does not satisfy the dimension.", "Partial or weak: recognizes some relevant issue but has a material unsupported leap, omission, or non-decisive treatment.", "Adequate: evidence-grounded and materially correct, with only bounded omissions that do not reverse the stated disposition.", "Strong: precise, evidence-grounded, handles material counterevidence/unknowns, and reaches a proportionate, falsifiable conclusion."][score]}`]))]));

export const finalSuccessorScoreAnchor = (id: string, score: number) => anchors[id]?.[score] ?? null;
export const finalSuccessorPacketHash = (packet: any) => { const { packet_hash, ...body } = packet; return canonicalHash(body); };

/**
 * These are deliberately narrow, unambiguous leakage claims.  In particular,
 * ordinary business words (cost, model, provider, selection, winner, campaign)
 * are not themselves prohibited.  Free prose cannot be classified perfectly;
 * the clean-session prompt supplies the remaining semantic boundary.
 */
const prohibitedTextPatterns: ReadonlyArray<[string, RegExp]> = [
  ["contestant or provider-model identity", /\b(?:gpt(?:[- ]?\d+(?:\.\d+)?(?:\s+(?:astra|terra))?)?|claude(?:\s+[\w.-]+)?|gemini(?:\s+[\w.-]+)?|astra|terra)\b/i],
  ["provider-model identity", /\b(?:openai|anthropic|google)\s+(?:model|gpt|claude|gemini)\b/i],
  ["run latency telemetry", /\b(?:ai|model|evaluator|provider|run)\s+(?:call\s+)?(?:latency|duration)\b/i],
  ["token telemetry", /\b(?:ai|model|evaluator|provider|run)\s+(?:input\s+|output\s+)?tokens?\b|\b\d[\d,]*(?:\.\d+)?\s+tokens?\b/i],
  ["AI-run monetary-cost telemetry", /\b(?:ai|model|evaluator|provider|run|inference|api)\s*(?:call\s*)?(?:cost|spend|price)\b/i],
  ["correction or provider telemetry", /\b(?:correction|provider)\s+telemetry\b/i],
  ["source filename", /\b[\w.-]+\.(?:json|csv|txt|md|ts|js|mjs)\b/i],
  ["source path", /(?:\b[A-Za-z]:[\\/]|(?:^|\s)(?:\.{1,2}[\\/]|\/)[\w./\\-]+)/],
  ["contestant comparison or ranking", /\b(?:contestant|model|agent)\s+(?:rank(?:ed|ing)?|outperformed|beat|won|winner)\b|\b(?:better|worse)\s+than\s+(?:another|other)\s+(?:contestant|model|agent)\b|\branked\s*#?\d+\b/i],
  ["campaign selection, certification, or routing conclusion", /\b(?:campaign|evaluation)\s+(?:winner|selection|certification|routing|outcome|result)\b|\b(?:selected|certified|routed)\s+(?:contestant|model|agent)\b|\b(?:this|the)\s+(?:response|contestant|model|agent)\s+(?:wins|won|is\s+selected|is\s+certified|is\s+routed)\b/i],
];
export function prohibitedEvaluatorTextReason(value: unknown): string | null {
  const text = String(value ?? "");
  return prohibitedTextPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export const FINAL_SUCCESSOR_SCORECARD_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema", title: "MIDAS blind evaluator final successor scorecard", type: "object", additionalProperties: false,
  required: ["evaluator_protocol_id", "evaluator_run_id", "packet_id", "packet_hash", "protocol_hash", "independence_attestation", "operator_attestation", "responses"],
  properties: {
    evaluator_protocol_id: { const: OQ_FINAL_SUCCESSOR_PROTOCOL_ID }, evaluator_run_id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" }, packet_id: { type: "string", minLength: 1 }, packet_hash: { type: "string", pattern: "^[a-f0-9]{64}$" }, protocol_hash: { type: "string", pattern: "^[a-f0-9]{64}$" }, independence_attestation: { const: "INDEPENDENT_BLIND_SESSION" },
    operator_attestation: { type: "object", additionalProperties: false, required: ["operator_attested_evaluator_identity", "provider_reported_identity", "observed_output_timestamp", "telemetry_v2", "response_count"], properties: { operator_attested_evaluator_identity: { type: "string", minLength: 1 }, provider_reported_identity: { type: ["string", "null"] }, observed_output_timestamp: { type: ["string", "null"] }, telemetry_v2: { type: "object" }, response_count: { type: "integer", minimum: 1 } } },
    responses: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["opaque_contestant_id", "case_id", "dimension_judgments", "observed_contradiction_ids", "evidence_sufficiency", "evidence_sufficiency_dimension_ids", "judgment_confidence", "critical_failure", "review_signals", "review_signal_dimension_ids", "review_explanation", "validation_status"], properties: { opaque_contestant_id: { type: "string", pattern: "^C-[A-F0-9]{16}$" }, case_id: { type: "string", minLength: 1 }, dimension_judgments: { type: "array", minItems: dimensionIds.length, maxItems: dimensionIds.length, items: { type: "object", additionalProperties: false, required: ["dimension_id", "score", "anchor", "evidence_ids", "rationale"], properties: { dimension_id: { enum: dimensionIds }, score: { enum: SCORE_VALUES }, anchor: { type: "string", minLength: 1 }, evidence_ids: { type: "array", items: { type: "string" } }, rationale: { type: "string", minLength: 1 } } } }, observed_contradiction_ids: { type: "array", items: { type: "string" } }, evidence_sufficiency: { enum: EVIDENCE_SUFFICIENCY_V22 }, evidence_sufficiency_dimension_ids: { type: "array", items: { enum: dimensionIds } }, judgment_confidence: { enum: JUDGMENT_CONFIDENCE_V22 }, critical_failure: { enum: CRITICAL_V22 }, review_signals: { type: "array", items: { enum: REVIEW_SIGNALS_V22 } }, review_signal_dimension_ids: { type: "array", items: { enum: dimensionIds } }, review_explanation: { type: "string", minLength: 1 }, validation_status: { const: "VALID" } } } }
  }
} as const;

export function finalSuccessorProtocol(spec: CampaignSpec, sourcePacketFingerprints: string[]) {
  const body = {
    protocol_id: OQ_FINAL_SUCCESSOR_PROTOCOL_ID, semantic_version: OQ_FINAL_SUCCESSOR_PROTOCOL_VERSION,
    compatibility: { predecessor_protocol_id: "MIDAS-OQ-EVALUATOR-PROTOCOL-009", predecessor_protocol_version: "2.1.0", boundary: "Protocol-009 scorecards and canary evidence are historical evidence only. They are not valid Protocol-010 scorecards; a fresh blinded successor evaluation is required." },
    source_campaign: { campaign_id: spec.campaign_id, campaign_version: spec.version, campaign_fingerprint: "A1382D89CFF01CFA6D04B0C29FAD53AE6229D77611B8592C260EFBED1316835F", source_packet_fingerprints: sourcePacketFingerprints.slice().sort() },
    purpose: "Blind response-local quality judgment. MIDAS, after complete validated primary coverage, deterministically derives all campaign-level review requirements.",
    dimensions: FROZEN_DIMENSIONS.map(([id, weight, deterministic, meaning]) => ({ id, weight, deterministic, meaning, anchors: deterministic ? null : anchors[id] })),
    scoring_scale: { values: SCORE_VALUES, anchors: Object.fromEntries(SCORE_VALUES.map((n) => [n, anchors[dimensionIds[0]][n].replace(/^.*? (?=Absent|Partial|Adequate|Strong)/, "")] )) },
    permitted_evidence: "Only assigned identity-free response and packet case evidence; cite packet evidence IDs only.", prohibited_information: ["contestant or provider-model identity", "AI operational telemetry", "source filenames or paths", "other-contestant comparisons or rankings", "campaign selection, certification, or routing conclusions"],
    field_semantics: { judgment_confidence: "Confidence that the evaluator correctly applied this rubric to the available evidence; it does not assert the underlying business claim is well evidenced.", evidence_sufficiency: "Whether the underlying case evidence is sufficient for the identified substantive dimensions. INSUFFICIENT_EVIDENCE requires those dimension scores to remain at the 0–1 anchors and does not become favorable because judgment confidence is HIGH." },
    response_local_signals: REVIEW_SIGNALS_V22, signal_contract: "LOW_CONFIDENCE iff judgment_confidence LOW; MATERIAL_CONTRADICTION iff contradiction IDs are present; INSUFFICIENT_EVIDENCE iff evidence_sufficiency is INSUFFICIENT_EVIDENCE; POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE iff critical_failure has that value. AMBIGUITY and UNSUPPORTED_REASONING require LIMITED evidence sufficiency and affected evaluator dimensions.",
    frozen_policy: { minimum_competence: 75, maximum_run_quality_spread: 8, practical_quality_margin: 5, runs_per_arm: 2, cases_per_run: 28, no_critical_failures: true },
    escalation: { authority: "MIDAS deterministic planner only", precondition: "complete validated 112-response primary coverage", value_of_information: "Authorize independent secondary review only if a response-local blocking condition or bounded valid alternate score can change a frozen pass/fail, stability, comparison, or later sealed selection conclusion.", ordinary_ambiguity: "Records evidence limits and affects anchored scoring; it does not itself authorize paid review." },
    aggregation_order: ["validate every primary scorecard", "ensure complete 112-response primary coverage", "run deterministic case gates", "derive provisional quality intervals and aggregates", "evaluate competence and run-stability sensitivity", "evaluate practical-margin and sealed-selection sensitivity", "create minimal secondary-review plan", "execute independent secondary reviews only in a later authorized mission", "validate secondary scorecards", "reconcile permitted agreements", "mark material disagreements for adjudication", "lock final quality evidence", "unblind only separately", "select, certify, and route only after authorization"],
    replay: "Canonical JSON SHA-256 hashes; deterministic sorting; identical inputs reproduce byte-identical protocol, packet, and validation-record material."
  };
  return { ...body, protocol_hash: canonicalHash(body) };
}

const unknowns = (value: any, allowed: readonly string[], where: string, errors: string[]) => { if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${where} must be object`); return; } for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`unknown ${where} field: ${key}`); };
const unique = (items: any[]) => Array.isArray(items) && new Set(items).size === items.length;
const addProhibitedTextError = (value: unknown, where: string, errors: string[]) => { const reason = prohibitedEvaluatorTextReason(value); if (reason) errors.push(`${where}: prohibited ${reason}`); };

export function validateFinalSuccessorScorecard(card: any, packet: any, protocol: any) {
  const errors: string[] = [];
  if (!card || typeof card !== "object" || Array.isArray(card)) return { ok: false, errors: ["scorecard must be a JSON object"] };
  unknowns(card, Object.keys(FINAL_SUCCESSOR_SCORECARD_SCHEMA.properties), "top-level", errors);
  for (const field of FINAL_SUCCESSOR_SCORECARD_SCHEMA.required) if (!(field in card)) errors.push(`missing ${field}`);
  if (card.evaluator_protocol_id !== OQ_FINAL_SUCCESSOR_PROTOCOL_ID || card.protocol_hash !== protocol.protocol_hash || card.packet_id !== packet.packet_id || card.packet_hash !== packet.packet_hash) errors.push("protocol or packet mismatch");
  if (card.independence_attestation !== "INDEPENDENT_BLIND_SESSION") errors.push("independence attestation missing");
  unknowns(card.operator_attestation, ["operator_attested_evaluator_identity", "provider_reported_identity", "observed_output_timestamp", "telemetry_v2", "response_count"], "operator attestation", errors);
  if (!String(card.operator_attestation?.operator_attested_evaluator_identity || "").trim() || card.operator_attestation?.response_count !== card.responses?.length || !card.operator_attestation?.telemetry_v2 || typeof card.operator_attestation.telemetry_v2 !== "object") errors.push("invalid operator attestation");
  const entries = new Map((packet.entries || []).map((entry: any) => [`${entry.opaque_contestant_id}|${entry.case.case_id}`, entry])); const seen = new Set<string>();
  for (const row of card.responses || []) {
    unknowns(row, ["opaque_contestant_id", "case_id", "dimension_judgments", "observed_contradiction_ids", "evidence_sufficiency", "evidence_sufficiency_dimension_ids", "judgment_confidence", "critical_failure", "review_signals", "review_signal_dimension_ids", "review_explanation", "validation_status"], "response", errors);
    const key = `${row?.opaque_contestant_id}|${row?.case_id}`; const entry = entries.get(key); if (!entry) errors.push(`foreign response: ${key}`); if (seen.has(key)) errors.push(`duplicate response: ${key}`); seen.add(key);
    if (!/^C-[A-F0-9]{16}$/.test(String(row?.opaque_contestant_id || ""))) errors.push(`${key}: identity-bearing contestant label`);
    const authorized = new Set((entry?.case?.evidence || []).map((e: any) => e.id)); const judgments = row?.dimension_judgments || [];
    if (!Array.isArray(judgments) || judgments.length !== dimensionIds.length || !unique(judgments.map((d: any) => d?.dimension_id))) errors.push(`${key}: missing or duplicate evaluator dimensions`);
    for (const id of dimensionIds) { const judgment = judgments.find((x: any) => x?.dimension_id === id); unknowns(judgment, ["dimension_id", "score", "anchor", "evidence_ids", "rationale"], "dimension", errors); if (!judgment || !SCORE_VALUES.includes(judgment.score) || judgment.anchor !== finalSuccessorScoreAnchor(id, judgment.score) || !String(judgment.rationale || "").trim()) errors.push(`${key}: invalid anchored score for ${id}`); if (!Array.isArray(judgment?.evidence_ids) || !unique(judgment.evidence_ids) || judgment.evidence_ids.some((x: string) => !authorized.has(x))) errors.push(`${key}: unauthorized evidence citation`); addProhibitedTextError(judgment?.rationale, `${key}: rationale`, errors); }
    const sufficiencyIds = row?.evidence_sufficiency_dimension_ids || []; const signals = new Set(row?.review_signals || []); const contradictions = row?.observed_contradiction_ids || [];
    if (!EVIDENCE_SUFFICIENCY_V22.includes(row?.evidence_sufficiency) || !JUDGMENT_CONFIDENCE_V22.includes(row?.judgment_confidence) || !CRITICAL_V22.includes(row?.critical_failure) || !Array.isArray(row?.review_signals) || !unique(row.review_signals) || row.review_signals.some((x: string) => !REVIEW_SIGNALS_V22.includes(x as any)) || !Array.isArray(row?.review_signal_dimension_ids) || !unique(row.review_signal_dimension_ids) || row.review_signal_dimension_ids.some((x: string) => !dimensions.has(x)) || !Array.isArray(sufficiencyIds) || !unique(sufficiencyIds) || sufficiencyIds.some((x: string) => !dimensions.has(x))) errors.push(`${key}: invalid enum or dimension list`);
    if (!Array.isArray(contradictions) || !unique(contradictions) || contradictions.some((x: string) => !authorized.has(x))) errors.push(`${key}: unauthorized contradiction citation`);
    const iff = (condition: boolean, signal: string) => { if (condition !== signals.has(signal)) errors.push(`${key}: ${signal} implication violated`); };
    iff(row?.judgment_confidence === "LOW", "LOW_CONFIDENCE"); iff(contradictions.length > 0, "MATERIAL_CONTRADICTION"); iff(row?.evidence_sufficiency === "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE"); iff(row?.critical_failure === "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE");
    if (row?.evidence_sufficiency === "SUFFICIENT" && sufficiencyIds.length) errors.push(`${key}: sufficient evidence cannot name insufficient dimensions`);
    if (["LIMITED", "INSUFFICIENT_EVIDENCE"].includes(row?.evidence_sufficiency) && !sufficiencyIds.length) errors.push(`${key}: limited or insufficient evidence requires affected dimensions`);
    if (row?.evidence_sufficiency === "INSUFFICIENT_EVIDENCE") for (const id of sufficiencyIds) { const score = judgments.find((d: any) => d?.dimension_id === id)?.score; if (![0, 1].includes(score)) errors.push(`${key}: insufficient evidence must use constrained 0–1 anchor for ${id}`); }
    if ((signals.has("AMBIGUITY") || signals.has("UNSUPPORTED_REASONING")) && row?.evidence_sufficiency !== "LIMITED") errors.push(`${key}: ambiguity/unsupported reasoning needs limited evidence sufficiency`);
    const dimensional = ["LOW_CONFIDENCE", "MATERIAL_CONTRADICTION", "INSUFFICIENT_EVIDENCE", "AMBIGUITY", "UNSUPPORTED_REASONING"].some((x) => signals.has(x)); if (dimensional && !row?.review_signal_dimension_ids?.length) errors.push(`${key}: response-local signal requires affected dimensions`); if (!dimensional && row?.review_signal_dimension_ids?.length) errors.push(`${key}: dimensions supplied without a dimension-level signal`);
    if (sufficiencyIds.some((id: string) => !row?.review_signal_dimension_ids?.includes(id))) errors.push(`${key}: evidence-sufficiency dimensions require review-signal dimensions`);
    if (!String(row?.review_explanation || "").trim()) errors.push(`${key}: missing review explanation`); addProhibitedTextError(row?.review_explanation, `${key}: review explanation`, errors);
    if (row?.validation_status !== "VALID") errors.push(`${key}: invalid validation status`);
  }
  if (seen.size !== entries.size) errors.push("missing packet responses");
  return { ok: errors.length === 0, errors };
}

/** Strict complete-byte JSON check for new validation artifacts. */
export function validationArtifactIntegrity(raw: Buffer | string) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8"); const text = bytes.toString("utf8"); const errors: string[] = [];
  if (!Buffer.from(text, "utf8").equals(bytes)) errors.push("validation artifact is not valid UTF-8");
  let value: any; try { value = JSON.parse(text); } catch { errors.push("validation artifact is not complete standards-compliant JSON"); return { ok: false, errors, value: null }; }
  if (canonicalJson(value) !== text) errors.push("validation artifact has bytes after, before, or outside canonical JSON");
  if (text.endsWith(String.fromCharCode(92, 110))) errors.push("validation artifact has literal backslash-n suffix");
  if (value?.canonical_validation_fingerprint !== canonicalHash(Object.fromEntries(Object.entries(value || {}).filter(([key]) => key !== "canonical_validation_fingerprint")))) errors.push("validation artifact fingerprint mismatch");
  return { ok: errors.length === 0, errors, value };
}
export function createCanonicalValidationRecord(body: Record<string, unknown>) { const clean = { ...body }; delete (clean as any).canonical_validation_fingerprint; return { ...clean, canonical_validation_fingerprint: canonicalHash(clean) }; }
export function serializeCanonicalValidationRecord(body: Record<string, unknown>) { return canonicalJson(createCanonicalValidationRecord(body)); }

/** The policy planner remains deterministic and consumes only opaque, validated data. */
export { planSecondaryReview };
export function buildFinalMinimalSecondaryPacket(plan: any, primaryPacket: any, protocol: any) {
  const requested = new Map((plan?.secondary_reviews || []).map((x: any) => [`${x.opaque_contestant_id}|${x.case_id}`, x]));
  const entries = (primaryPacket?.entries || []).filter((entry: any) => requested.has(`${entry.opaque_contestant_id}|${entry.case.case_id}`)).map((entry: any) => { const request = requested.get(`${entry.opaque_contestant_id}|${entry.case.case_id}`); return { opaque_contestant_id: entry.opaque_contestant_id, case: entry.case, response: entry.response, requested_dimension_ids: request.affected_dimension_ids, response_local_blocking_signal: request.triggering_frozen_boundaries.includes("POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE") || request.triggering_frozen_boundaries.includes("DETERMINISTIC_EVALUATOR_CONFLICT") }; }).sort((a: any, b: any) => `${a.opaque_contestant_id}|${a.case.case_id}`.localeCompare(`${b.opaque_contestant_id}|${b.case.case_id}`));
  const body = { packet_id: `OQ-EVAL-V22-SECONDARY-${canonicalHash(entries).slice(0, 12).toUpperCase()}`, packet_kind: "targeted_independent_secondary_packet", protocol, response_contract: FINAL_SUCCESSOR_SCORECARD_SCHEMA, clean_session_prompt: "Independently reassess only the supplied response-local dimensions. You receive no primary score, rationale, identity, AI telemetry, ranking, campaign conclusion, or selection information. Return only the final-successor scorecard contract.", entries };
  return { ...body, packet_hash: finalSuccessorPacketHash(body) };
}
