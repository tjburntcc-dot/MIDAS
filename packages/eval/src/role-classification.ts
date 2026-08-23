/** Inventory of specialist roles. Honest classification of live vs deterministic vs not implemented. */

export const INTELLIGENCE_CLASSES = [
  "genuine_live_model",
  "deterministic_appropriate",
  "deterministic_placeholder",
  "not_implemented",
];

export const ROLE_CLASSIFICATION = [
  {
    roleId: "business_research",
    name: "Researcher / Scout",
    taskTypes: ["scout_synthesis", "research_questions", "idea_hypotheses", "competitor_summary"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "labeled deterministic_placeholder if live is not requested or provider is not verified",
    note: "Scout synthesis is a reasoning role. Fetch and persistence stay deterministic.",
  },
  {
    roleId: "offer_strategist",
    name: "Offer Strategist",
    taskTypes: ["offer_hypothesis", "offer_positioning", "strategist"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "labeled deterministic handler unless a live call ran",
    note: "RidgeLine EMP-001 live path already existed. Product-team employees use the shared live specialist path.",
  },
  {
    roleId: "marketing",
    name: "Marketing specialist",
    taskTypes: ["marketing_copy", "content_outline", "landing_outline"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "labeled deterministic outline unless a live call ran",
    note: "Copy and positioning interpretation. No outreach.",
  },
  {
    roleId: "product",
    name: "Product specialist",
    taskTypes: ["product_planning", "build_slice"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider for planning interpretation",
    deterministicFallback: "artifact write stays deterministic; plan text may be live",
    note: "Planning/interpretation can be live. Local artifact storage is deterministic.",
  },
  {
    roleId: "ops",
    name: "Operations specialist",
    taskTypes: ["ops_analysis", "ops_checklist"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "labeled deterministic checklist unless a live call ran",
    note: "Operations analysis/interpretation. No invented staffing or demand.",
  },
  {
    roleId: "finance",
    name: "Finance analyst",
    taskTypes: ["finance_interpretation", "assumptions_worksheet", "unit_economics"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider for interpretation only",
    deterministicFallback: "arithmetic, worksheet structure, and invented-profitability refusal stay deterministic",
    note: "Calcs stay deterministic. Interpretation of owner-stated numbers may be live.",
  },
  {
    roleId: "knowledge_extraction",
    name: "Knowledge extraction",
    taskTypes: ["knowledge_extraction"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "claim split from owner paste stays deterministic if live is not requested",
    note: "Not a hired catalog seat. Task type on a live specialist path.",
  },
  {
    roleId: "opportunity_generation",
    name: "Opportunity generation",
    taskTypes: ["opportunity_generation"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "deterministic_intake_hypothesis generator remains available and is labeled deterministic",
    note: "Live path labels AI-generated business hypotheses. Search does not exist.",
  },
  {
    roleId: "workflow_manager",
    name: "Manager / Conductor",
    taskTypes: ["supervised_plan", "manager_summary"],
    intelligenceClass: "deterministic_appropriate",
    liveWhen: null,
    deterministicFallback: "always deterministic",
    note: "Orchestration, sequencing, and owner-visible summaries from persisted records. Not a reasoning model.",
  },
  {
    roleId: "independent_audit",
    name: "Watcher",
    taskTypes: ["audit_notes"],
    intelligenceClass: "deterministic_appropriate",
    liveWhen: null,
    deterministicFallback: "always deterministic/advisory",
    note: "Watcher rule checks stay deterministic and advisory.",
  },
  {
    roleId: "atlas",
    name: "Atlas",
    taskTypes: ["fictional_qualification"],
    intelligenceClass: "deterministic_placeholder",
    liveWhen: null,
    deterministicFallback: "product-team handler is fictional/test qualification only",
    note: "RidgeLine eval Atlas is a separate frozen version. Product-team Atlas does not outreach.",
  },
  {
    roleId: "sales",
    name: "Sales strategist",
    taskTypes: ["sales_planning", "pipeline_hypothesis", "discovery_questions"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "labeled internal sales plan unless a live call ran",
    note: "INTERNAL PLANNING ONLY. Drafts discovery questions and pipeline hypotheses. No outreach, email, purchase, publish, hire, or policy.",
  },
  {
    roleId: "executive",
    name: "Executive strategist",
    taskTypes: ["executive_planning", "priority_memo", "tradeoff_brief"],
    intelligenceClass: "genuine_live_model",
    liveWhen: "preferLive + verified provider + actual provider call",
    deterministicFallback: "labeled internal priority memo unless a live call ran",
    note: "INTERNAL PLANNING ONLY. Priority and tradeoff memos. No outreach, hire, policy, or cross-workspace.",
  },
];

export const LIVE_REASONING_ROLE_IDS = ROLE_CLASSIFICATION
  .filter((r) => r.intelligenceClass === "genuine_live_model")
  .map((r) => r.roleId);

export const DETERMINISTIC_APPROPRIATE_ROLE_IDS = ROLE_CLASSIFICATION
  .filter((r) => r.intelligenceClass === "deterministic_appropriate")
  .map((r) => r.roleId);

export const NOT_IMPLEMENTED_ROLE_IDS = ROLE_CLASSIFICATION
  .filter((r) => r.intelligenceClass === "not_implemented")
  .map((r) => r.roleId);

export function classifyRole(roleId) {
  return ROLE_CLASSIFICATION.find((r) => r.roleId === roleId) || {
    roleId: roleId,
    intelligenceClass: "not_implemented",
    note: "Unknown role. Not implemented.",
  };
}

export function roleClassificationTable() {
  return ROLE_CLASSIFICATION.map((r) => ({
    roleId: r.roleId,
    name: r.name,
    intelligenceClass: r.intelligenceClass,
    taskTypes: r.taskTypes,
    note: r.note,
  }));
}

export function isLiveReasoningRole(roleId) {
  return LIVE_REASONING_ROLE_IDS.includes(roleId);
}

export function isDeterministicAppropriateRole(roleId) {
  return DETERMINISTIC_APPROPRIATE_ROLE_IDS.includes(roleId);
}
