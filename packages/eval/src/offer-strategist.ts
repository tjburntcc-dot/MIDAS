/** Offer Strategist v0. Deterministic. Not world-class. Not autonomous. Gold is not imported. */

export const OFFER_STRATEGIST_ROLE_ID = "offer_strategist";
export const OFFER_STRATEGIST_NAME = "Offer Strategist";
export const OFFER_STRATEGIST_TITLE = "Offer Strategist";
export const OFFER_STRATEGIST_OBJECTIVE =
  "Produce inspectable offer-positioning hypotheses from owner-approved same-workspace knowledge for RidgeLine Estimator candidacy. Hypotheses are not facts, market size, demand, or revenue.";

export const OFFER_STRATEGIST_RESPONSIBILITIES = [
  "draft_inspectable_offer_positioning_hypotheses",
  "cite_approved_workspace_findings",
  "label_hypothesis_versus_fact",
  "respect_spend_limit",
];

export const OFFER_STRATEGIST_PROHIBITED = [
  "invent_market_size",
  "invent_demand",
  "invent_revenue",
  "rewrite_owner_policy",
  "outreach",
  "create_employees",
  "self_promote",
  "access_other_workspace",
  "overspend",
  "promote_self_or_atlas",
];

export const OFFER_STRATEGIST_REQUIRED_LIVE_FIELDS = [
  "target_customer",
  "customer_problem",
  "proposed_offer",
  "approved_evidence",
  "assumptions",
  "missing_information",
  "risks",
  "recommended_validation_step",
];

export const OFFER_STRATEGIST_OUTPUT_CONTRACT = {
  "type": "object",
  required: ["status", "hypotheses", "refusals", "labels"].concat([
    "target_customer",
    "customer_problem",
    "proposed_offer",
    "approved_evidence",
    "assumptions",
    "missing_information",
    "risks",
    "recommended_validation_step",
  ]),
  properties: {
    status: { "type": "string", enum: ["hypothesis", "refused"] },
    hypotheses: { "type": "array" },
    refusals: { "type": "array" },
    labels: { "type": "object" },
    target_customer: { "type": "string" },
    customer_problem: { "type": "string" },
    proposed_offer: { "type": "string" },
    approved_evidence: { "type": "array" },
    assumptions: { "type": "array" },
    missing_information: { "type": "array" },
    risks: { "type": "array" },
    recommended_validation_step: { "type": "string" },
  },
};

export const OFFER_STRATEGIST_EVAL_REQUIREMENTS = [
  "development_benchmark_10_cases",
  "gold_isolated_from_runtime",
  "not_sealed_eval",
];

export const OFFER_STRATEGIST_SPEC = {
  name: OFFER_STRATEGIST_NAME,
  roleTitle: OFFER_STRATEGIST_TITLE,
  roleId: OFFER_STRATEGIST_ROLE_ID,
  objective: OFFER_STRATEGIST_OBJECTIVE,
  responsibilities: OFFER_STRATEGIST_RESPONSIBILITIES,
  prohibitedActions: OFFER_STRATEGIST_PROHIBITED,
  knowledgeAccess: "owner_approved_same_workspace",
  tools: ["read_approved_workspace_knowledge"],
  spendLimitUsd: 0.5,
  outputContract: OFFER_STRATEGIST_OUTPUT_CONTRACT,
  evalRequirements: OFFER_STRATEGIST_EVAL_REQUIREMENTS,
  promptBundle: {
    system: OFFER_STRATEGIST_OBJECTIVE,
    developer: "Return structured hypotheses. Never invent TAM, demand, or revenue. Gold is not available at runtime.",
  },
};

export const OFFER_STRATEGIST_DISCLOSURE =
  "Offer Strategist v0. Inspectable hypotheses only. Not world-class, not trusted, not autonomous, not outreach, not unlimited spend, not promotion.";

function refuse(code, reason, extras) {
  return {
    ok: false,
    status: "refused",
    target_customer: "",
    customer_problem: "",
    proposed_offer: "Refused: " + reason,
    approved_evidence: [],
    assumptions: [],
    missing_information: [],
    risks: [],
    recommended_validation_step: "",
    hypotheses: [],
    refusals: [{ code: code, reason: reason }],
    labels: { hypothesisVersusFact: true, sealedEval: false, officialRank: false, status: "refused" },
    spendUsd: 0,
    workspaceId: extras && extras.workspaceId,
    disclosure: OFFER_STRATEGIST_DISCLOSURE,
  };
}

function requestedText(input) {
  return String((input && (input.task || input.requestedOutput || input.question || input.prompt)) || "").toLowerCase();
}

export function runOfferStrategist(store, input) {
  const workspaceId = input && input.workspaceId;
  const development = Boolean(input && input.development);
  const spendUsd = Number((input && input.spendUsd) || 0);
  const spendLimit = (input && input.spendLimitUsd != null) ? Number(input.spendLimitUsd) : OFFER_STRATEGIST_SPEC.spendLimitUsd;
  const text = requestedText(input);

  if (!development) {
    const roles = (store && store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || [];
    const role = roles.find((r) => r.roleId === OFFER_STRATEGIST_ROLE_ID);
    if (!role) return refuse("role_not_implemented", "Offer Strategist is not an implemented authorized role.", { workspaceId: workspaceId });
    if (!["evaluation_required", "active_development", "development_verified"].includes(role.status)) {
      return refuse("unauthorized_role", "Offer Strategist exists but is not owner-authorized.", { workspaceId: workspaceId });
    }
  }

  if (input && input.targetWorkspaceId && workspaceId && input.targetWorkspaceId !== workspaceId) {
    return refuse("other_workspace", "May not operate in another workspace.", { workspaceId: workspaceId });
  }
  if (spendUsd > spendLimit) return refuse("overspend", "Requested spend exceeds the role spend limit.", { workspaceId: workspaceId });
  if (/market size|\btam\b|total addressable/.test(text)) return refuse("invent_tam", "May not invent market size or TAM.", { workspaceId: workspaceId });
  if (/\bdemand\b|addressable demand/.test(text) && !/buying signal/.test(text)) return refuse("invent_demand", "May not invent demand statistics.", { workspaceId: workspaceId });
  if (/revenue|win-?rate|conversion rate|arr\b/.test(text)) return refuse("invent_revenue", "May not invent revenue or conversion statistics.", { workspaceId: workspaceId });
  if (/rewrite .{0,40}polic|change owner polic|author a new polic/.test(text)) return refuse("rewrite_policy", "May not rewrite owner policy.", { workspaceId: workspaceId });
  if (/outreach|email the prospect|call the contractor/.test(text)) return refuse("outreach", "May not do outreach.", { workspaceId: workspaceId });
  if (/create (an? )?(employee|specialist)|hire /.test(text)) return refuse("create_employees", "May not create employees.", { workspaceId: workspaceId });
  if (/self-?promote|promote (yourself|offer strategist|atlas)|world-class|trusted autonomous/.test(text)) {
    return refuse("self_promote", "May not self-promote or claim world-class/trusted/autonomous status.", { workspaceId: workspaceId });
  }

  const findingIds = (input && (input.approvedFindingIds || input.findingIds)) || [];
  const findings = [];
  for (const id of findingIds) {
    const f = store && store.getScoutFinding ? store.getScoutFinding(id) : ((input && input.findings) || []).find((x) => x.id === id);
    if (!f) continue;
    if (f.workspaceId && workspaceId && f.workspaceId !== workspaceId) {
      return refuse("other_workspace", "Finding belongs to another workspace.", { workspaceId: workspaceId });
    }
    if (f.reviewStatus !== "approved" && !(development && f.approvalEligible)) {
      return refuse("unapproved_knowledge", "May only use owner-approved same-workspace knowledge.", { workspaceId: workspaceId });
    }
    findings.push(f);
  }

  if (!findings.length && !(input && input.approvedStatements && input.approvedStatements.length)) {
    return refuse("unapproved_knowledge", "No approved finding supplied. Cannot invent positioning.", { workspaceId: workspaceId });
  }

  const statements = findings.map((f) => f.claim).concat((input && input.approvedStatements) || []);
  const hypotheses = statements.slice(0, 3).map((claim, i) => ({
    id: "OSH-" + String(i + 1).padStart(3, "0"),
    kind: "hypothesis",
    notFact: true,
    text: "Hypothesis, not a source fact: contractors who still estimate by hand or spreadsheet may be stronger RidgeLine Estimator candidates when otherwise qualified. Grounded on approved knowledge: " + String(claim).slice(0, 220),
    sourceFindingIds: findings.map((f) => f.id),
    cannotHardDisqualify: true,
    inventedMarketStat: false,
  }));

  const evidence = findings.map((f) => ({
    id: f.id,
    excerpt: String(f.excerpt || f.claim || "").slice(0, 280),
  }));
  const statementsText = statements.join(" ");
  return {
    ok: true,
    status: "hypothesis",
    target_customer: "US roofing contractors who still estimate by hand or with generic spreadsheets",
    customer_problem: "Manual or spreadsheet estimating of roof takeoffs takes longer to turn measurements into proposals.",
    proposed_offer: hypotheses[0] ? hypotheses[0].text : "Hypothesis: a takeoff-and-proposal helper for contractors still estimating by hand.",
    approved_evidence: evidence,
    assumptions: [
      "Approved knowledge about hand/spreadsheet estimating still describes the current customer.",
      "A software offer is a hypothesis, not a measured demand fact.",
    ],
    missing_information: [
      "Willingness to pay is not in approved knowledge.",
      "No approved conversion rate, win-rate, or revenue figure exists.",
    ],
    risks: [
      "The positioning is a hypothesis and may not convert.",
      "Approved excerpts do not quantify market size or demand.",
    ],
    recommended_validation_step: "Ask a small set of US roofing owners how they currently produce estimates and whether a dedicated takeoff tool would change proposal time. Do not outreach from this system.",
    hypotheses: hypotheses,
    refusals: [],
    labels: { hypothesisVersusFact: true, sealedEval: false, officialRank: false, developmentBenchmark: Boolean(development) },
    spendUsd: spendUsd,
    workspaceId: workspaceId,
    disclosure: OFFER_STRATEGIST_DISCLOSURE,
    groundedOn: statementsText.slice(0, 160),
  };
}
