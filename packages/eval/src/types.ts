export type Classification = "qualified" | "needs_research" | "disqualified";
export type NextAction = "prioritize_outreach" | "research_first" | "exclude";
export type Visibility = "development" | "sealed";
export type Difficulty = "basic" | "intermediate" | "advanced" | "adversarial";

export interface EvidenceRecord {
  id: string;
  claim: string;
  source: "first_party" | "official" | "third_party" | "unverified" | "prospect_supplied";
  age_days: number;
}

export interface Prospect {
  id: string;
  company: string;
  facts: Record<string, unknown>;
  evidence: EvidenceRecord[];
}

export interface Offer {
  name: string;
  summary: string;
  price_usd: number;
  billing_period: "month" | "one_time" | "year";
  sales_motion: "founder_led" | "self_serve" | "sales_assisted";
}

export interface QualificationPolicy {
  required: string[];
  preferred: string[];
  disqualifiers: string[];
  unknown_policy: "mandatory_unknown_requires_research";
}

export interface Gold {
  labels: Record<string, Classification>;
  ranked_tiers: string[][];
  required_unknowns: Record<string, string[]>;
  required_evidence: Record<string, string[]>;
  actions: Record<string, NextAction>;
  critical_failures: string[];
}

export interface CaseRecord {
  case_id: string;
  visibility: Visibility;
  title: string;
  competencies: string[];
  difficulty: Difficulty;
  offer: Offer;
  qualification_policy: QualificationPolicy;
  constraints: string[];
  prospects: Prospect[];
  gold: Gold;
}

export interface RuntimeInput {
  case_id: string;
  title: string;
  offer: Offer;
  qualification_policy: QualificationPolicy;
  constraints: string[];
  prospects: Prospect[];
}

export interface Assessment {
  prospect_id: string;
  classification: Classification;
  fit_score: number;
  cited_evidence_ids: string[];
  rationale: string;
  missing_information: string[];
  next_action: NextAction;
  disqualification_reason: string | null;
}

export interface TaskOutput {
  case_id: string;
  assessments: Assessment[];
  ranked_qualified_ids: string[];
  research_queue_ids: string[];
  excluded_ids: string[];
  case_uncertainties: string[];
}

export interface ProspectMapping {
  authoringToRuntime: ReadonlyMap<string, string>;
  runtimeToAuthoring: ReadonlyMap<string, string>;
  presentationOrderRuntimeIds: readonly string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface CriticalFailure {
  code: string;
  message: string;
}

export const SCORE_WEIGHTS = {
  qualification: 35,
  ranking: 20,
  evidence: 15,
  uncertainty: 10,
  next_action: 10,
  compliance: 10,
} as const;

export interface ScoreDimensions {
  qualification: number;
  ranking: number;
  evidence: number;
  uncertainty: number;
  next_action: number;
  compliance: number;
}

export interface EvidenceDetail {
  deterministic: number;
  semantic: number;
  semantic_judge_status: string;
  judgments?: unknown[];
}

export interface ScoreRecord {
  case_id: string;
  dimensions: ScoreDimensions;
  weights: typeof SCORE_WEIGHTS;
  weighted_total: number;
  evidence_detail: EvidenceDetail;
  compliance_violations: string[];
  critical_failures: CriticalFailure[];
}

export interface CaseSuiteResult {
  case_id: string;
  validation: ValidationResult;
  score: ScoreRecord;
}

export interface SuiteResult {
  suiteVersion: string;
  trialIndex: number;
  results: CaseSuiteResult[];
}

export interface ResponderMeta {
  knowledgeBundle?: Array<{ id: string; statement: string; type?: string; sourceId?: string }>;
  retrievedItemIds?: string[];
}

export type AgentResponder = (
  runtimeInput: RuntimeInput,
  meta?: ResponderMeta,
) => Promise<TaskOutput> | TaskOutput;
