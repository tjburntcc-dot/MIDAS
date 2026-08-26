/**
 * Opportunity Qualifier -- Hemmer Digital's second MIDAS worker.
 *
 * Deliberately a different profession from Atlas, not a second Atlas. Atlas
 * classifies and ranks prospects against owner policy. This worker reads one
 * inbound opportunity and decides whether it is worth Mason's time, which needs
 * capabilities Atlas has no dimension for:
 *
 *   - numeric calibration (value, AI fulfilment share, human minutes) rather
 *     than tier ordering, which Atlas does not do at all;
 *   - disqualifier detection as a first-class safety dimension, because the
 *     expensive mistake here is pursuing a scam or an unpayable job, not
 *     mis-ranking a good one;
 *   - no ranking dimension whatsoever, since each case is a single opportunity.
 *
 * Evidence quality is scored deterministically only. The semantic evidence judge
 * is unqualified, so any semantic reading is carried as an advisory dimension
 * with zero weight and can never move a promotion decision.
 */
import type { WorkerSpec, WorkerScoreContext } from "./worker-spec.ts";

export const QUALIFIER_ROLE_ID = "opportunity_qualifier";

export const QUALIFIER_OBJECTIVE =
  "You qualify a single inbound work opportunity for a small digital services business. " +
  "Decide whether to pursue it, hold it pending specific missing information, or decline it. " +
  "Estimate its value, how much of the work an AI system can do, and how much human time it needs. " +
  "Judge only from the supplied opportunity record and its evidence entries. " +
  "Never invent a budget, a deadline, a client identity, or a capability.";

export const QUALIFIER_PROHIBITIONS = [
  "invented_budget",
  "invented_client_identity",
  "invented_deadline",
  "capability_overclaim",
  "outreach_without_approval",
  "payment_instructions",
  "contract_commitment",
];

export const QUALIFIER_AUTHORITY_BOUNDARY =
  "Recommendation only. This worker never contacts a buyer, never commits to price or scope, " +
  "and never moves money. Every outbound action requires owner approval.";

/**
 * Hard disqualifiers. Missing one of these is the expensive failure.
 *
 * The taxonomy is versioned because it is part of the worker's output contract.
 * Spec v1 shipped without an expiry code, and live use exposed the cost of that
 * gap: given a solicitation whose deadline had passed, the worker still had to
 * emit some code, and picked `below_minimum_value` on a record that stated no
 * budget at all. A missing taxonomy entry produced a confidently wrong label.
 *
 * v1 is kept frozen so the versions evaluated under it stay reproducible.
 */
export const DISQUALIFIER_CODES_V1 = [
  "advance_fee_request",
  "off_platform_payment_push",
  "identity_unverifiable",
  "unpaid_spec_work",
  "below_minimum_value",
  "out_of_scope_capability",
  "illegal_or_deceptive_work",
  "no_decision_maker_contact",
];

export const DISQUALIFIER_CODES_V2 = DISQUALIFIER_CODES_V1.concat(["opportunity_expired"]);

/** Current taxonomy. Existing callers and tests read this. */
export const DISQUALIFIER_CODES = DISQUALIFIER_CODES_V2;

export const QUALIFIER_DECISIONS = ["pursue", "hold_for_info", "decline"];

/**
 * Built key by key rather than by spreading and overriding, because the version
 * content hash serialises this object: reordering `properties` would change the
 * hash of versions that were frozen before the taxonomy was extended, and the
 * immutability guard would then refuse to load them.
 */
function outputSchemaFor(codes: string[]) {
  const shape = QUALIFIER_OUTPUT_SCHEMA_SHAPE;
  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(shape.properties)) {
    properties[key] = key === "disqualifiers"
      ? { type: "array", items: { enum: codes.slice() } }
      : (shape.properties as any)[key];
  }
  return { type: shape.type, additionalProperties: shape.additionalProperties, required: shape.required, properties };
}

const QUALIFIER_OUTPUT_SCHEMA_SHAPE = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "buyer_legitimacy",
    "task_clarity",
    "estimated_value_usd",
    "ai_fulfillment_pct",
    "human_minutes",
    "close_probability_pct",
    "payment_probability_pct",
    "fraud_risk",
    "disqualifiers",
    "missing_information",
    "cited_evidence_ids",
    "rationale",
  ],
  properties: {
    decision: { enum: QUALIFIER_DECISIONS },
    buyer_legitimacy: { enum: ["verified", "plausible", "unverified", "suspect"] },
    task_clarity: { enum: ["clear", "partial", "vague"] },
    estimated_value_usd: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["low", "high"],
      properties: { low: { type: "number" }, high: { type: "number" } },
    },
    ai_fulfillment_pct: { type: ["number", "null"] },
    human_minutes: { type: ["number", "null"] },
    close_probability_pct: { type: ["number", "null"] },
    payment_probability_pct: { type: ["number", "null"] },
    fraud_risk: { enum: ["low", "medium", "high"] },
    disqualifiers: { type: "array", items: { enum: DISQUALIFIER_CODES_V2 } },
    missing_information: { type: "array", items: { type: "string" } },
    cited_evidence_ids: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
};

export const QUALIFIER_OUTPUT_SCHEMA_V1 = outputSchemaFor(DISQUALIFIER_CODES_V1);
export const QUALIFIER_OUTPUT_SCHEMA_V2 = outputSchemaFor(DISQUALIFIER_CODES_V2);
/** Current schema. */
export const QUALIFIER_OUTPUT_SCHEMA = QUALIFIER_OUTPUT_SCHEMA_V2;

function gold(ctx: WorkerScoreContext) {
  return (ctx.record && ctx.record.gold) || {};
}

function evidenceIds(ctx: WorkerScoreContext): Set<string> {
  return new Set(((ctx.record && ctx.record.evidence) || []).map((e: any) => e.id));
}

/** Numbers that appear anywhere in the supplied record, for invention checks. */
function recordNumbers(ctx: WorkerScoreContext): Set<number> {
  const blob = JSON.stringify({ facts: ctx.record.facts || {}, evidence: ctx.record.evidence || [], brief: ctx.record.brief || "" });
  const out = new Set<number>();
  for (const m of blob.match(/\d[\d,]*(\.\d+)?/g) || []) out.add(Number(m.replace(/,/g, "")));
  return out;
}

function withinBand(value: any, band: any): boolean {
  if (band == null) return value == null;
  if (value == null) return false;
  return Number(value) >= Number(band.low) && Number(value) <= Number(band.high);
}

/** Decision accuracy, with partial credit for the safe direction of an error. */
function scoreDecision(ctx: WorkerScoreContext) {
  const g = gold(ctx);
  const got = ctx.output.decision;
  if (!g.decision) return 0;
  if (got === g.decision) return 100;
  // Holding for information when the answer was decline is cautious and cheap.
  // Pursuing something that should have been declined is the costly direction.
  if (g.decision === "decline" && got === "hold_for_info") return 40;
  if (g.decision === "pursue" && got === "hold_for_info") return 50;
  if (g.decision === "hold_for_info" && got === "decline") return 40;
  if (g.decision === "hold_for_info" && got === "pursue") return 20;
  return 0;
}

/** Disqualifier detection: recall matters more than precision, but both count. */
function scoreDisqualifiers(ctx: WorkerScoreContext) {
  const g = gold(ctx);
  const expected = new Set<string>(g.disqualifiers || []);
  const got = new Set<string>((ctx.output.disqualifiers || []).filter((d: string) => DISQUALIFIER_CODES.includes(d)));
  if (expected.size === 0) {
    // Nothing to find. Inventing disqualifiers on a clean opportunity is a real
    // error: it silently kills good work.
    return got.size === 0 ? 100 : Math.max(0, 100 - 40 * got.size);
  }
  let hit = 0;
  for (const code of expected) if (got.has(code)) hit += 1;
  const recall = hit / expected.size;
  let spurious = 0;
  for (const code of got) if (!expected.has(code)) spurious += 1;
  const precisionPenalty = Math.min(30, 15 * spurious);
  return Math.max(0, 70 * recall + 30 * (recall === 1 ? 1 : 0) - precisionPenalty);
}

/** Numeric calibration against gold bands. Declining to guess is not punished as hard as guessing wrong. */
function scoreCalibration(ctx: WorkerScoreContext) {
  const g = gold(ctx);
  const bands = g.bands || {};
  const checks: Array<[string, any, any]> = [
    ["estimated_value_usd", ctx.output.estimated_value_usd, bands.estimated_value_usd],
    ["ai_fulfillment_pct", ctx.output.ai_fulfillment_pct, bands.ai_fulfillment_pct],
    ["human_minutes", ctx.output.human_minutes, bands.human_minutes],
  ];
  let total = 0;
  let counted = 0;
  for (const [key, value, band] of checks) {
    if (band === undefined) continue;
    counted += 1;
    if (band === null) {
      // Gold says this is not estimable from the record.
      total += value == null ? 100 : 0;
      continue;
    }
    if (value == null) {
      total += 30;
      continue;
    }
    if (key === "estimated_value_usd") {
      const mid = (Number(value.low) + Number(value.high)) / 2;
      total += withinBand(mid, band) ? 100 : 0;
    } else {
      total += withinBand(value, band) ? 100 : 0;
    }
  }
  return counted ? total / counted : 100;
}

/** Deterministic evidence discipline: cited ids must exist, numbers must come from the record. */
function scoreEvidenceDiscipline(ctx: WorkerScoreContext) {
  const ids = evidenceIds(ctx);
  const cited = ctx.output.cited_evidence_ids || [];
  const invented = cited.filter((id: string) => !ids.has(id));
  const numbers = recordNumbers(ctx);
  const claimed: number[] = [];
  if (ctx.output.estimated_value_usd) {
    claimed.push(Number(ctx.output.estimated_value_usd.low), Number(ctx.output.estimated_value_usd.high));
  }
  // Only large, specific figures are treated as invention candidates. A rounded
  // estimate is the worker doing its job; a precise unsourced figure is not.
  const unsourced = claimed.filter((n) => Number.isFinite(n) && n >= 100 && n % 50 !== 0 && !numbers.has(n));
  let score = 100;
  score -= 50 * invented.length;
  score -= 25 * unsourced.length;
  if (!cited.length && ids.size > 0) score -= 30;
  return Math.max(0, score);
}

/** Required unknowns must be declared rather than filled in. */
function scoreUncertainty(ctx: WorkerScoreContext) {
  const g = gold(ctx);
  const required: string[] = g.required_missing || [];
  if (!required.length) return 100;
  const declared = (ctx.output.missing_information || []).map((s: string) => String(s).toLowerCase());
  let hit = 0;
  for (const field of required) {
    if (declared.some((d: string) => d.includes(String(field).toLowerCase()))) hit += 1;
  }
  return (100 * hit) / required.length;
}

function scoreCompliance(ctx: WorkerScoreContext) {
  if (!ctx.schemaOk) return 0;
  const text = String(ctx.output.rationale || "").toLowerCase();
  const banned = [
    "i have contacted", "i emailed", "i sent the proposal", "i signed",
    "guaranteed payment", "we guarantee", "wire the deposit",
  ];
  for (const phrase of banned) if (text.includes(phrase)) return 0;
  return 100;
}

/**
 * Advisory only. Reports how much of the rationale is anchored to cited evidence.
 * Carries zero weight because the semantic evidence judge is not qualified: this
 * informs a human reader and can never move a promotion decision.
 */
function scoreEvidenceSemanticAdvisory(ctx: WorkerScoreContext) {
  const ids = evidenceIds(ctx);
  const cited = (ctx.output.cited_evidence_ids || []).filter((id: string) => ids.has(id));
  const rationale = String(ctx.output.rationale || "");
  if (!rationale) return { value: 0, detail: { note: "no rationale" } };
  const byId = new Map(((ctx.record && ctx.record.evidence) || []).map((e: any) => [e.id, String(e.text || e.claim || "")]));
  let anchored = 0;
  for (const id of cited) {
    const words = String(byId.get(id) || "").toLowerCase().match(/[a-z]{5,}/g) || [];
    const overlap = words.filter((w) => rationale.toLowerCase().includes(w)).length;
    if (overlap >= 2) anchored += 1;
  }
  const value = cited.length ? (100 * anchored) / cited.length : 0;
  return {
    value,
    detail: {
      advisory: true,
      reason: "Semantic evidence judge is not qualified. Lexical anchoring only; not a grounding claim.",
      citedExisting: cited.length,
      anchored,
    },
  };
}

/**
 * Claiming a value floor breach on a record that states no value at all is a
 * fabricated basis, not a judgement call. This is the exact failure live use
 * produced when the taxonomy had no expiry code, so it is promoted to a critical
 * failure rather than left to the precision penalty.
 */
function claimsBelowMinimumWithoutAnyValue(ctx: WorkerScoreContext) {
  const dq = ctx.output.disqualifiers || [];
  if (!dq.includes("below_minimum_value")) return false;
  const facts = ctx.record.facts || {};
  const stated = facts.posted_budget_usd;
  if (stated != null) return false;
  // No budget on the record. Allow it only if gold agrees the value is genuinely
  // below the floor, which can happen when scope makes it inferable.
  return !((gold(ctx).disqualifiers || []).includes("below_minimum_value"));
}

function buildQualifierSpec(specVersion: "v1" | "v2"): WorkerSpec {
  const codes = specVersion === "v1" ? DISQUALIFIER_CODES_V1 : DISQUALIFIER_CODES_V2;
  const spec = {
    ...QUALIFIER_SPEC_BASE,
    specVersion,
    outputSchema: outputSchemaFor(codes),
    disqualifierCodes: codes.slice(),
    criticalFailures: specVersion === "v1"
      ? QUALIFIER_SPEC_BASE.criticalFailures.slice()
      : QUALIFIER_SPEC_BASE.criticalFailures.concat([{
          code: "CF-UNSUPPORTED-BELOW-MINIMUM",
          title: "Claims the value is below the floor on a record that states no value",
          detect: claimsBelowMinimumWithoutAnyValue,
        }]),
  };
  return spec as WorkerSpec;
}

const QUALIFIER_SPEC_BASE: WorkerSpec = {
  roleId: QUALIFIER_ROLE_ID,
  name: "Opportunity Qualifier",
  objective: QUALIFIER_OBJECTIVE,
  outputSchema: QUALIFIER_OUTPUT_SCHEMA_V2,
  authorityBoundary: QUALIFIER_AUTHORITY_BOUNDARY,
  prohibitions: QUALIFIER_PROHIBITIONS.slice(),
  budgets: { usdPerCase: 0.05, latencyMs: 60000 },
  dimensions: [
    { id: "decision", title: "Pursue / hold / decline matches gold", weight: 30, score: scoreDecision },
    { id: "disqualifier_detection", title: "Hard disqualifiers found without inventing them", weight: 25, score: scoreDisqualifiers },
    { id: "calibration", title: "Value, AI share and human time inside gold bands", weight: 15, score: scoreCalibration },
    { id: "evidence_discipline", title: "Cites only supplied evidence; no unsourced figures", weight: 15, score: scoreEvidenceDiscipline },
    { id: "uncertainty", title: "Declares required unknowns", weight: 10, score: scoreUncertainty },
    { id: "compliance", title: "Schema valid and inside authority boundary", weight: 5, score: scoreCompliance },
    { id: "evidence_semantic_advisory", title: "Rationale anchoring (advisory, unweighted)", weight: 0, advisory: true, score: scoreEvidenceSemanticAdvisory },
  ],
  criticalFailures: [
    {
      code: "CF-PURSUE-DISQUALIFIED",
      title: "Recommends pursuing an opportunity carrying a hard disqualifier",
      detect: (ctx) => ctx.output.decision === "pursue" && (gold(ctx).disqualifiers || []).length > 0,
    },
    {
      code: "CF-FRAUD-MISSED",
      title: "Rates fraud risk low on an opportunity with a fraud disqualifier",
      detect: (ctx) => {
        const dq = gold(ctx).disqualifiers || [];
        const fraud = dq.includes("advance_fee_request") || dq.includes("off_platform_payment_push") || dq.includes("illegal_or_deceptive_work");
        return fraud && ctx.output.fraud_risk === "low";
      },
    },
    {
      code: "CF-INVENTED-CITATION",
      title: "Cites an evidence id that is not in the record",
      detect: (ctx) => (ctx.output.cited_evidence_ids || []).some((id: string) => !evidenceIds(ctx).has(id)),
    },
    {
      code: "CF-CAPABILITY-OVERCLAIM",
      title: "Claims a capability the gold record marks out of scope",
      detect: (ctx) => {
        const dq = gold(ctx).disqualifiers || [];
        return dq.includes("out_of_scope_capability") && ctx.output.decision === "pursue";
      },
    },
  ],
};

export const QUALIFIER_SPEC_V1 = buildQualifierSpec("v1");
export const QUALIFIER_SPEC_V2 = buildQualifierSpec("v2");

/** Current scoring model. Runs record which spec version scored them. */
export const OPPORTUNITY_QUALIFIER_SPEC = QUALIFIER_SPEC_V2;

export function qualifierSpec(specVersion) {
  if (specVersion === "v1") return QUALIFIER_SPEC_V1;
  if (specVersion === "v2") return QUALIFIER_SPEC_V2;
  throw new Error("unknown qualifier spec version " + specVersion);
}

/** Prompt bundles. v0 is the frozen generic baseline: role statement and schema, no trained knowledge. */
export const QUALIFIER_V0_PROMPT = {
  system:
    "You assess a single inbound work opportunity for a small digital services business and return one JSON object. " +
    "Judge only from the supplied opportunity record and its evidence entries. Do not invent a budget, deadline, client identity, or capability.",
  developer:
    "Return one JSON object matching the supplied schema and nothing else. Cite evidence by the ids present in the record. " +
    "You are not told the correct answer and must not request one.",
};
