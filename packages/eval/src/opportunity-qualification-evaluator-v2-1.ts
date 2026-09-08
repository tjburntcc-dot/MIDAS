/**
 * MIDAS-OQ-EVALUATOR-HARDENING-009.  Successor-only scorecard and planning
 * mechanics.  This module never invokes an evaluator or unblinds a campaign.
 */
import { createHash } from "node:crypto";
import { type CampaignSpec } from "./opportunity-qualification-campaign.ts";
import { FROZEN_DIMENSIONS, EVALUATOR_DIMENSIONS, EVALUATOR_WEIGHT_TOTAL, SCORE_VALUES, canonicalHash } from "./opportunity-qualification-evaluator-v2.ts";

export const OQ_SUCCESSOR_PROTOCOL_ID = "MIDAS-OQ-EVALUATOR-PROTOCOL-009";
export const OQ_SUCCESSOR_PROTOCOL_VERSION = "2.1.0";
export const REVIEW_SIGNALS = ["LOW_CONFIDENCE", "MATERIAL_CONTRADICTION", "INSUFFICIENT_EVIDENCE", "AMBIGUITY", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE", "UNSUPPORTED_REASONING"] as const;
export const UNCERTAINTY_V21 = ["NONE", "LIMITED", "MATERIAL", "INSUFFICIENT_EVIDENCE"] as const;
export const CONFIDENCE_V21 = ["HIGH", "MODERATE", "LOW"] as const;
export const CRITICAL_V21 = ["NO_CRITICAL_FAILURE", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE"] as const;
const dimensionIds = EVALUATOR_DIMENSIONS.map((d) => d[0]);
const dimensions = new Map(EVALUATOR_DIMENSIONS.map(([id, weight]) => [id, weight]));
const identityPattern = /(?:terra|astra|gpt[- ]?\d|specialist|frontier|premium|cheap|model[_ -]?family|winner|selection|rank(?:ing)?|cost|latency|tokens|source[_ -]?(?:file|path)|run[ _-]?[12])/i;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const anchors: Record<string, Record<number, string>> = Object.fromEntries(EVALUATOR_DIMENSIONS.map(([id, , , meaning]) => [id, Object.fromEntries(SCORE_VALUES.map((score) => [score, `${meaning} ${["Absent, materially wrong, contradicted by authorized evidence, or unsafe; the response does not satisfy the dimension.", "Partial or weak: recognizes some relevant issue but has a material unsupported leap, omission, or non-decisive treatment.", "Adequate: evidence-grounded and materially correct, with only bounded omissions that do not reverse the stated disposition.", "Strong: precise, evidence-grounded, handles material counterevidence/unknowns, and reaches a proportionate, falsifiable conclusion."][score]}`]))]));

export const successorScoreAnchor = (id: string, score: number) => anchors[id]?.[score] ?? null;
export const successorPacketHash = (packet: any) => { const { packet_hash, ...body } = packet; return canonicalHash(body); };

/** This is the schema contract; validateSuccessorScorecard is its authoritative runtime twin. */
export const SUCCESSOR_SCORECARD_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema", title: "MIDAS blind evaluator successor scorecard", type: "object", additionalProperties: false,
  required: ["evaluator_protocol_id", "evaluator_run_id", "packet_id", "packet_hash", "protocol_hash", "independence_attestation", "operator_attestation", "responses"],
  properties: {
    evaluator_protocol_id: { const: OQ_SUCCESSOR_PROTOCOL_ID }, evaluator_run_id: { type: "string", minLength: 1 }, packet_id: { type: "string", minLength: 1 }, packet_hash: { type: "string", pattern: "^[a-f0-9]{64}$" }, protocol_hash: { type: "string", pattern: "^[a-f0-9]{64}$" }, independence_attestation: { const: "INDEPENDENT_BLIND_SESSION" },
    operator_attestation: { type: "object", additionalProperties: false, required: ["operator_attested_evaluator_identity", "provider_reported_identity", "observed_output_timestamp", "telemetry_v2", "response_count"], properties: { operator_attested_evaluator_identity: { type: "string", minLength: 1 }, provider_reported_identity: { type: ["string", "null"] }, observed_output_timestamp: { type: ["string", "null"] }, telemetry_v2: { type: "object" }, response_count: { type: "integer", minimum: 1 } } },
    responses: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["opaque_contestant_id", "case_id", "dimension_judgments", "observed_contradiction_ids", "uncertainty", "confidence", "critical_failure", "review_signals", "review_signal_dimension_ids", "review_explanation", "validation_status"], properties: { opaque_contestant_id: { type: "string", pattern: "^C-[A-F0-9]{16}$" }, case_id: { type: "string", minLength: 1 }, dimension_judgments: { type: "array", minItems: dimensionIds.length, maxItems: dimensionIds.length, items: { type: "object", additionalProperties: false, required: ["dimension_id", "score", "anchor", "evidence_ids", "rationale"], properties: { dimension_id: { enum: dimensionIds }, score: { enum: SCORE_VALUES }, anchor: { type: "string", minLength: 1 }, evidence_ids: { type: "array", items: { type: "string" } }, rationale: { type: "string", minLength: 1 } } } }, observed_contradiction_ids: { type: "array", items: { type: "string" } }, uncertainty: { enum: UNCERTAINTY_V21 }, confidence: { enum: CONFIDENCE_V21 }, critical_failure: { enum: CRITICAL_V21 }, review_signals: { type: "array", items: { enum: REVIEW_SIGNALS } }, review_signal_dimension_ids: { type: "array", items: { enum: dimensionIds } }, review_explanation: { type: "string", minLength: 1 }, validation_status: { const: "VALID" } } } }
  }
} as const;

export function successorProtocol(spec: CampaignSpec, sourcePacketFingerprints: string[]) {
  const body = {
    protocol_id: OQ_SUCCESSOR_PROTOCOL_ID, semantic_version: OQ_SUCCESSOR_PROTOCOL_VERSION,
    compatibility: { predecessor_protocol_id: "MIDAS-OQ-EVALUATOR-PROTOCOL-007", predecessor_protocol_hash: "c4a5430ef1d803b9fa5fe60bd80d06a5bdd92f7fbcd8ac369b5d6b17b592f0db", boundary: "Protocol-007 scorecards are historical evidence only and are not successor scorecards. Fresh successor evaluation is required unless exact lossless semantic compatibility is separately proven." },
    source_campaign: { campaign_id: spec.campaign_id, campaign_version: spec.version, campaign_fingerprint: "A1382D89CFF01CFA6D04B0C29FAD53AE6229D77611B8592C260EFBED1316835F", source_packet_fingerprints: sourcePacketFingerprints.slice().sort() },
    purpose: "Blind response-local quality judgment. MIDAS, after complete validated primary coverage, deterministically derives all campaign-level review requirements.",
    dimensions: FROZEN_DIMENSIONS.map(([id, weight, deterministic, meaning]) => ({ id, weight, deterministic, meaning, anchors: deterministic ? null : anchors[id] })),
    scoring_scale: { values: SCORE_VALUES, anchors: Object.fromEntries(SCORE_VALUES.map((n) => [n, anchors[dimensionIds[0]][n].replace(/^.*? (?=Absent|Partial|Adequate|Strong)/, "")])) },
    permitted_evidence: "Only assigned identity-free response and packet case evidence; cite packet evidence IDs only.", prohibited_information: ["contestant identity", "model family", "operational telemetry", "source paths", "source order", "other responses", "prior scores", "rankings", "campaign materiality", "selection"],
    response_local_signals: REVIEW_SIGNALS, signal_contract: "Signals are observations, not review authorization. LOW_CONFIDENCE iff confidence LOW; MATERIAL_CONTRADICTION iff contradiction IDs are present; INSUFFICIENT_EVIDENCE iff uncertainty is INSUFFICIENT_EVIDENCE; POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE iff critical_failure has that value. AMBIGUITY and UNSUPPORTED_REASONING require MATERIAL or LIMITED uncertainty and affected evaluator dimensions.",
    frozen_policy: { minimum_competence: 75, maximum_run_quality_spread: 8, practical_quality_margin: 5, runs_per_arm: 2, cases_per_run: 28, no_critical_failures: true },
    escalation: { authority: "MIDAS deterministic planner only", precondition: "complete validated 112-response primary coverage", value_of_information: "Authorize independent secondary review only if a response-local blocking condition or bounded valid alternate score can change a frozen pass/fail, stability, comparison, or later sealed selection conclusion.", ordinary_ambiguity: "Records uncertainty and affects anchored scoring; it does not itself authorize paid review." },
    aggregation_order: ["validate every primary scorecard", "ensure complete 112-response primary coverage", "run deterministic case gates", "derive provisional quality intervals and aggregates", "evaluate competence and run-stability sensitivity", "evaluate practical-margin and sealed-selection sensitivity", "create minimal secondary-review plan", "execute independent secondary reviews only in a later authorized mission", "validate secondary scorecards", "reconcile permitted agreements", "mark material disagreements for adjudication", "lock final quality evidence", "unblind only separately", "select, certify, and route only after authorization"],
    replay: "Canonical JSON SHA-256 hashes; deterministic sorting; identical inputs reproduce byte-identical protocol and packet material."
  };
  return { ...body, protocol_hash: canonicalHash(body) };
}

const unknowns = (value: any, allowed: readonly string[], where: string, errors: string[]) => { if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${where} must be object`); return; } for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`unknown ${where} field: ${key}`); };
const unique = (items: any[]) => Array.isArray(items) && new Set(items).size === items.length;
const hasCampaignClaim = (value: any) => identityPattern.test(String(value ?? ""));

export function validateSuccessorScorecard(card: any, packet: any, p: any) {
  const errors: string[] = [];
  if (!card || typeof card !== "object" || Array.isArray(card)) return { ok: false, errors: ["scorecard must be a JSON object"] };
  unknowns(card, Object.keys(SUCCESSOR_SCORECARD_SCHEMA.properties), "top-level", errors);
  for (const field of SUCCESSOR_SCORECARD_SCHEMA.required) if (!(field in card)) errors.push(`missing ${field}`);
  if (card.evaluator_protocol_id !== OQ_SUCCESSOR_PROTOCOL_ID || card.protocol_hash !== p.protocol_hash || card.packet_id !== packet.packet_id || card.packet_hash !== packet.packet_hash) errors.push("protocol or packet mismatch");
  if (card.independence_attestation !== "INDEPENDENT_BLIND_SESSION") errors.push("independence attestation missing");
  unknowns(card.operator_attestation, ["operator_attested_evaluator_identity", "provider_reported_identity", "observed_output_timestamp", "telemetry_v2", "response_count"], "operator attestation", errors);
  if (!String(card.operator_attestation?.operator_attested_evaluator_identity || "").trim() || card.operator_attestation?.response_count !== card.responses?.length || !card.operator_attestation?.telemetry_v2 || typeof card.operator_attestation.telemetry_v2 !== "object") errors.push("invalid operator attestation");
  const entries = new Map((packet.entries || []).map((e: any) => [`${e.opaque_contestant_id}|${e.case.case_id}`, e])); const seen = new Set<string>();
  for (const row of card.responses || []) {
    unknowns(row, ["opaque_contestant_id", "case_id", "dimension_judgments", "observed_contradiction_ids", "uncertainty", "confidence", "critical_failure", "review_signals", "review_signal_dimension_ids", "review_explanation", "validation_status"], "response", errors);
    const key = `${row?.opaque_contestant_id}|${row?.case_id}`; const entry = entries.get(key); if (!entry) errors.push(`foreign response: ${key}`); if (seen.has(key)) errors.push(`duplicate response: ${key}`); seen.add(key);
    if (!/^C-[A-F0-9]{16}$/.test(String(row?.opaque_contestant_id || "")) || hasCampaignClaim(row?.opaque_contestant_id)) errors.push(`${key}: identity-bearing contestant label`);
    const authorized = new Set((entry?.case?.evidence || []).map((e: any) => e.id)); const ds = row?.dimension_judgments || []; if (!Array.isArray(ds) || ds.length !== dimensionIds.length || !unique(ds.map((d: any) => d?.dimension_id))) errors.push(`${key}: missing or duplicate evaluator dimensions`);
    for (const id of dimensionIds) { const d = ds.find((x: any) => x?.dimension_id === id); unknowns(d, ["dimension_id", "score", "anchor", "evidence_ids", "rationale"], "dimension", errors); if (!d || !SCORE_VALUES.includes(d.score) || d.anchor !== successorScoreAnchor(id, d.score) || !String(d.rationale || "").trim()) errors.push(`${key}: invalid anchored score for ${id}`); if (!Array.isArray(d?.evidence_ids) || !unique(d.evidence_ids) || d.evidence_ids.some((x: string) => !authorized.has(x))) errors.push(`${key}: unauthorized evidence citation`); if (hasCampaignClaim(`${d?.rationale || ""} ${d?.evidence_ids?.join(" ") || ""}`)) errors.push(`${key}: substantive identity, telemetry, or campaign claim`); }
    if (!UNCERTAINTY_V21.includes(row?.uncertainty) || !CONFIDENCE_V21.includes(row?.confidence) || !CRITICAL_V21.includes(row?.critical_failure) || !Array.isArray(row?.review_signals) || !unique(row.review_signals) || row.review_signals.some((x: string) => !REVIEW_SIGNALS.includes(x as any)) || !Array.isArray(row?.review_signal_dimension_ids) || !unique(row.review_signal_dimension_ids) || row.review_signal_dimension_ids.some((x: string) => !dimensions.has(x))) errors.push(`${key}: invalid review signal enum or dimensions`);
    const signals = new Set(row?.review_signals || []); const contradiction = row?.observed_contradiction_ids || []; if (!Array.isArray(contradiction) || !unique(contradiction) || contradiction.some((x: string) => !authorized.has(x))) errors.push(`${key}: unauthorized contradiction citation`);
    const iff = (condition: boolean, signal: string) => { if (condition !== signals.has(signal)) errors.push(`${key}: ${signal} implication violated`); };
    iff(row?.confidence === "LOW", "LOW_CONFIDENCE"); iff(contradiction.length > 0, "MATERIAL_CONTRADICTION"); iff(row?.uncertainty === "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE"); iff(row?.critical_failure === "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE", "POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE");
    if (row?.uncertainty === "MATERIAL" && !["AMBIGUITY", "MATERIAL_CONTRADICTION", "UNSUPPORTED_REASONING"].some((x) => signals.has(x))) errors.push(`${key}: material uncertainty requires a response-local signal`);
    if ((signals.has("AMBIGUITY") || signals.has("UNSUPPORTED_REASONING")) && !["LIMITED", "MATERIAL"].includes(row?.uncertainty)) errors.push(`${key}: ambiguity/unsupported reasoning needs bounded uncertainty`);
    if (row?.confidence === "HIGH" && ["MATERIAL", "INSUFFICIENT_EVIDENCE"].includes(row?.uncertainty)) errors.push(`${key}: contradictory high confidence and uncertainty`);
    const dimensional = ["LOW_CONFIDENCE", "MATERIAL_CONTRADICTION", "INSUFFICIENT_EVIDENCE", "AMBIGUITY", "UNSUPPORTED_REASONING"].some((x) => signals.has(x)); if (dimensional && !row?.review_signal_dimension_ids?.length) errors.push(`${key}: response-local signal requires affected dimensions`); if (!dimensional && row?.review_signal_dimension_ids?.length) errors.push(`${key}: dimensions supplied without a dimension-level signal`);
    if (!String(row?.review_explanation || "").trim() || hasCampaignClaim(row?.review_explanation)) errors.push(`${key}: missing or prohibited review explanation`);
    if (row?.validation_status !== "VALID") errors.push(`${key}: invalid validation status`);
  }
  if (seen.size !== entries.size) errors.push("missing packet responses");
  return { ok: errors.length === 0, errors };
}

type Candidate = { opaque_contestant_id: string; case_id: string; dimension_id?: string; signals: string[]; interval: [number, number]; max_remaining_weighted_effect: number; blocking?: boolean };
const keyOf = (x: any) => `${x.opaque_contestant_id}|${x.case_id}`;
const round = (n: number) => Math.round(n * 1e6) / 1e6;
function rowInterval(row: any, selected: Set<string>, casesPerRun: number) { let point = 0, low = 0, high = 0; for (const d of row.dimension_judgments || []) { const weight = dimensions.get(d.dimension_id) || 0; const score = Number(d.score); const uncertain = selected.has(`${keyOf(row)}|${d.dimension_id}`); point += weight * score / 3; low += weight * (uncertain ? 0 : score) / 3; high += weight * (uncertain ? 3 : score) / 3; } return [point / EVALUATOR_WEIGHT_TOTAL * 100 / casesPerRun, low / EVALUATOR_WEIGHT_TOTAL * 100 / casesPerRun, high / EVALUATOR_WEIGHT_TOTAL * 100 / casesPerRun] as const; }
function boundaries(rows: any[], structure: any[], candidates: Set<string>, policy: any) {
  const byContestant = new Map<string, [number, number, number]>(); for (const row of rows) { const v = rowInterval(row, candidates, policy.cases_per_run); const prior = byContestant.get(row.opaque_contestant_id) || [0, 0, 0]; byContestant.set(row.opaque_contestant_id, [prior[0] + v[0], prior[1] + v[1], prior[2] + v[2]]); }
  const contest = [...byContestant.entries()].map(([id, v]) => ({ id, point: round(v[0]), low: round(v[1]), high: round(v[2]), structure: structure.find((s: any) => s.opaque_contestant_id === id) })); const triggered: string[] = [];
  for (const c of contest) if (c.low < policy.minimum_competence && c.high >= policy.minimum_competence) triggered.push(`COMPETENCE:${c.id}`);
  const groups = new Map<string, typeof contest>(); for (const c of contest) { const g = c.structure?.opaque_comparison_group_id; if (!g) continue; groups.set(g, (groups.get(g) || []).concat(c)); }
  for (const [group, runs] of groups) { if (runs.length === policy.runs_per_arm) { const possibleMax = Math.max(...runs.flatMap((a) => runs.map((b) => Math.max(Math.abs(a.low - b.high), Math.abs(a.high - b.low)) ))); const possibleMin = Math.max(...runs.flatMap((a) => runs.map((b) => Math.max(0, a.low - b.high, b.low - a.high)))); if (possibleMin <= policy.maximum_run_quality_spread && possibleMax > policy.maximum_run_quality_spread) triggered.push(`STABILITY:${group}`); } }
  const arm = [...groups.entries()].filter(([, v]) => v.length === policy.runs_per_arm).map(([id, runs]) => ({ id, point: runs.reduce((n, r) => n + r.point, 0) / runs.length, low: runs.reduce((n, r) => n + r.low, 0) / runs.length, high: runs.reduce((n, r) => n + r.high, 0) / runs.length })); for (let a = 0; a < arm.length; a++) for (let b = a + 1; b < arm.length; b++) { const lo = arm[a].low - arm[b].high, hi = arm[a].high - arm[b].low; if (lo < policy.practical_quality_margin && hi >= policy.practical_quality_margin || lo <= -policy.practical_quality_margin && hi > -policy.practical_quality_margin) { triggered.push(`PRACTICAL_MARGIN:${[arm[a].id, arm[b].id].sort().join("|")}`); triggered.push(`SEALED_SELECTION:${[arm[a].id, arm[b].id].sort().join("|")}`); } }
  return { triggered: [...new Set(triggered)].sort(), contest };
}

/** Pure deterministic planner. It intentionally has no identity, telemetry, cost, or ordering inputs. */
export function planSecondaryReview(input: any) {
  const policy = { minimum_competence: 75, maximum_run_quality_spread: 8, practical_quality_margin: 5, runs_per_arm: 2, cases_per_run: 28, ...(input?.frozen_policy || {}) };
  const rows = (input?.validated_primary_scorecards || []).flatMap((c: any) => c.responses || []); const expected = new Set((input?.opaque_structure || []).flatMap((s: any) => (s.case_ids || []).map((case_id: string) => `${s.opaque_contestant_id}|${case_id}`)));
  const actual = new Set(rows.map(keyOf)); if (!rows.length || actual.size !== rows.length || actual.size !== expected.size || [...expected].some((x) => !actual.has(x))) return { status: "PRIMARY_RERUN_REQUIRED", secondary_reviews: [], excluded_proofs: [], reason: "invalid or incomplete primary scorecard coverage is rejected or rerun, never disguised as substantive disagreement" };
  const immediate: Candidate[] = []; const uncertain: Candidate[] = [];
  for (const row of rows) { const signals = row.review_signals || []; const base = { opaque_contestant_id: row.opaque_contestant_id, case_id: row.case_id, signals: signals.slice().sort(), interval: [0, 0] as [number, number], max_remaining_weighted_effect: 0 };
    if (signals.includes("POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE")) immediate.push({ ...base, blocking: true });
    for (const id of row.review_signal_dimension_ids || []) { const d = row.dimension_judgments.find((x: any) => x.dimension_id === id); const weight = dimensions.get(id)!; const effect = weight * Math.max(Number(d.score), 3 - Number(d.score)) / 3 / EVALUATOR_WEIGHT_TOTAL * 100 / policy.cases_per_run; uncertain.push({ ...base, dimension_id: id, interval: [0, 3], max_remaining_weighted_effect: round(effect) }); }
  }
  for (const finding of input?.deterministic_gate_findings || []) if (finding?.deterministic_evaluator_conflict) immediate.push({ opaque_contestant_id: finding.opaque_contestant_id, case_id: finding.case_id, signals: ["DETERMINISTIC_EVALUATOR_CONFLICT"], interval: [0, 0], max_remaining_weighted_effect: 0, blocking: true });
  const all = new Set(uncertain.map((x) => `${x.opaque_contestant_id}|${x.case_id}|${x.dimension_id}`)); const analysis = boundaries(rows, input.opaque_structure, all, policy); const material = analysis.triggered.length > 0;
  // A response outside every crossing contestant/group scope cannot settle that
  // boundary, so it receives a proof instead of expanding paid review work.
  const materialContestants = new Set<string>();
  for (const boundary of analysis.triggered) { const [kind, encoded] = boundary.split(":"); if (kind === "COMPETENCE") materialContestants.add(encoded); else if (kind === "STABILITY") for (const s of input.opaque_structure || []) if (s.opaque_comparison_group_id === encoded) materialContestants.add(s.opaque_contestant_id); else if (["PRACTICAL_MARGIN", "SEALED_SELECTION"].includes(kind)) for (const group of encoded.split("|")) for (const s of input.opaque_structure || []) if (s.opaque_comparison_group_id === group) materialContestants.add(s.opaque_contestant_id); }
  const materialUncertain = uncertain.filter((x) => materialContestants.has(x.opaque_contestant_id));
  // A blocking case is already authorized; retain only its locally affected
  // dimensions so an independent evaluator is not asked to rejudge the packet.
  const blockingCases = new Set(immediate.map((x) => `${x.opaque_contestant_id}|${x.case_id}`));
  const plan = [...immediate, ...uncertain.filter((x) => materialUncertain.includes(x) || blockingCases.has(`${x.opaque_contestant_id}|${x.case_id}`))]; const byCase = new Map<string, any>(); for (const item of plan) { const key = `${item.opaque_contestant_id}|${item.case_id}`; const prior = byCase.get(key) || { ...item, affected_dimension_ids: [] as string[], triggering_frozen_boundaries: [] as string[] }; if (item.dimension_id) prior.affected_dimension_ids.push(item.dimension_id); prior.triggering_frozen_boundaries = item.blocking ? [item.signals[0]] : analysis.triggered; byCase.set(key, prior); }
  const plannedKeys = new Set(plan.map((x) => `${x.opaque_contestant_id}|${x.case_id}|${x.dimension_id || ""}`)); const excluded = uncertain.filter((x) => !plannedKeys.has(`${x.opaque_contestant_id}|${x.case_id}|${x.dimension_id}`)).map((x) => ({ opaque_contestant_id: x.opaque_contestant_id, case_id: x.case_id, dimension_id: x.dimension_id, proof: "No frozen competence, stability, practical-margin, or sealed-selection boundary can be crossed under the complete bounded interval." }));
  return { status: plan.length ? "SECONDARY_REVIEW_AUTHORIZED" : "NO_SECONDARY_REVIEW_MATERIAL", planner_version: "oq-voi-planner-1.0.0", planner_hash: sha("oq-voi-planner-1.0.0"), frozen_policy: policy, complete_primary_coverage: true, decision_sensitivity: analysis, secondary_reviews: [...byCase.values()].sort((a, b) => `${a.opaque_contestant_id}|${a.case_id}`.localeCompare(`${b.opaque_contestant_id}|${b.case_id}`)).map((x) => ({ ...x, affected_dimension_ids: x.affected_dimension_ids.sort(), current_bounded_interval: x.interval, exact_deterministic_reason: x.triggering_frozen_boundaries.join(",") })), excluded_proofs: excluded };
}

export function buildMinimalSecondaryPacket(plan: any, primaryPacket: any, p: any) {
  const requested = new Map((plan?.secondary_reviews || []).map((x: any) => [`${x.opaque_contestant_id}|${x.case_id}`, x])); const entries = (primaryPacket?.entries || []).filter((e: any) => requested.has(`${e.opaque_contestant_id}|${e.case.case_id}`)).map((e: any) => { const x = requested.get(`${e.opaque_contestant_id}|${e.case.case_id}`); return { opaque_contestant_id: e.opaque_contestant_id, case: e.case, response: e.response, requested_dimension_ids: x.affected_dimension_ids, response_local_blocking_signal: x.triggering_frozen_boundaries.includes("POTENTIAL_JUDGMENTAL_CRITICAL_FAILURE") || x.triggering_frozen_boundaries.includes("DETERMINISTIC_EVALUATOR_CONFLICT") }; }).sort((a: any, b: any) => `${a.opaque_contestant_id}|${a.case.case_id}`.localeCompare(`${b.opaque_contestant_id}|${b.case.case_id}`));
  const body = { packet_id: `OQ-EVAL-V21-SECONDARY-${canonicalHash(entries).slice(0, 12).toUpperCase()}`, packet_kind: "targeted_independent_secondary_packet", protocol: p, response_contract: SUCCESSOR_SCORECARD_SCHEMA, clean_session_prompt: "Independently reassess only the supplied response-local dimensions. You receive no primary score, rationale, identity, telemetry, ranking, campaign materiality, or selection information. Return only the successor scorecard contract.", entries }; return { ...body, packet_hash: successorPacketHash(body) };
}
