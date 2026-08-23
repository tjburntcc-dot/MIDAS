export interface Agent {
  id: string;
  name: string;
  createdAt: string;
  workspaceId?: string | null;
  roleId?: string;
  roleName?: string;
  objective?: string;
  boundaries?: string[];
  versionHistory?: string[];
  approvedKnowledgeAccess?: string[] | string;
  toolPermissions?: string[];
  status?: string;
}

export const RESERVED_ROLE_IDS = [
  "atlas",
  "opportunity_research",
  "marketing",
  "sales",
  "ops",
  "finance",
  "executive",
  "watcher",
] as const;

export const IMPLEMENTED_ROLE_IDS = ["atlas"] as const;

export type EpistemicClass =
  | "business_description"
  | "owner_policy"
  | "sourced_fact"
  | "agent_instruction"
  | "unverified_suggestion"
  | "private_note";

export type TrainingReviewStatus =
  | "created"
  | "tested"
  | "improved_on_dev_scenario"
  | "officially_approved"
  | "promoted";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  industry: string;
  type: string;
  offer: { name?: string; summary?: string; [k: string]: unknown };
  idealCustomer: string;
  geography: string;
  goal: string;
  constraints: string[];
  createdAt: string;
  updatedAt: string;
  ownerStatus: string;
  assignedAgentId?: string;
  assignedRoleId?: string;
  epistemicClass?: "business_description";
}

export interface TrainingEvent {
  id: string;
  workspaceId: string;
  agentId: string;
  prevVersionId: string | null;
  newVersionId: string;
  addedKnowledge: string[];
  removedKnowledge: string[];
  supersededKnowledge: string[];
  ownerRules: string[];
  timestamp: string;
  reason: string;
  relatedTestResult: { kind: "live" | "fixture"; runId?: string | null };
  reviewStatus: TrainingReviewStatus;
}

export interface ModelProfile {
  provider: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface PromptBundle {
  system: string;
  developer?: string;
}

export interface RetrievalPolicy {
  enabled: boolean;
  maxItems?: number;
  sourceAllowlist?: string[];
  contextBudgetTokens?: number;
}

export interface AgentVersion {
  id: string;
  agentId: string;
  parentVersionId: string | null;
  modelProfile: ModelProfile;
  promptBundle: PromptBundle;
  outputSchema: Record<string, unknown>;
  retrievalPolicy: RetrievalPolicy;
  curriculumSnapshotId: string | null;
  allowedTools: string[];
  createdAt: string;
  contentHash: string;
  declaredChange: string;
}

export type EvalArm = "baseline" | "relevant" | "placebo" | "oracle";
export type EvalRunStatus = "pending" | "running" | "completed" | "failed" | "aborted";
export type ResponderKind = "fixture" | "live";

export interface EvalRun {
  id: string;
  agentVersionId: string;
  suiteVersion: string;
  arm: EvalArm;
  trialIndex: number;
  status: EvalRunStatus;
  createdAt: string;
  completedAt: string | null;
  responderKind: ResponderKind;
  persistence: "FILE_STORE";
  semanticJudge: "not_implemented";
  error?: string | null;
}

export type DecisionKind = "promote" | "reject" | "restart";

export interface Decision {
  id: string;
  evalRunId: string;
  kind: DecisionKind;
  rationale: string;
  createdAt: string;
}

export interface CriticalFailure {
  code: string;
  message: string;
}

export interface ProspectAssessmentRecord {
  prospect_id: string;
  classification: string;
  cited_evidence_ids: string[];
  missing_information: string[];
  next_action: string;
  rationale: string;
  disqualification_reason?: string | null;
  fit_score?: number;
}

export interface CaseResult {
  id: string;
  evalRunId: string;
  caseId: string;
  title: string;
  weightedTotal: number;
  dimensions: {
    qualification: number;
    ranking: number;
    evidence: number;
    uncertainty: number;
    nextAction: number;
    compliance: number;
  };
  criticalFailures: CriticalFailure[];
  assessments: ProspectAssessmentRecord[];
  rankedQualifiedIds: string[];
  citations: { prospect_id: string; evidence_ids: string[] }[];
  missingInformation: { prospect_id: string; fields: string[] }[];
  scores: {
    weightedTotal: number;
    dimensions: CaseResult["dimensions"];
    evidenceDetail: {
      deterministic: number;
      semantic: number;
      semantic_judge_status: "not_implemented";
    };
  };
  latencyMs: number;
  error: string | null;
  responderKind: ResponderKind;
  complianceViolations: string[];
  validationOk: boolean;
}

export type KnowledgeType =
  | "principle"
  | "decision_rule"
  | "procedure"
  | "failure_pattern"
  | "constraint"
  | "example";

export type SourceClaimKind =
  | "vendor_opinion"
  | "documented_product_behavior"
  | "regulatory_guidance"
  | "benchmark_owner_policy";

export interface SourceProvenance {
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  retrievedAt?: string;
  contentHash?: string;
  section?: string;
  span?: string;
  claimKind?: SourceClaimKind;
}

export type KnowledgeClaimKind =
  | "vendor_opinion"
  | "product_behavior"
  | "regulatory_guidance"
  | "owner_policy";

export interface KnowledgeLocator {
  section: string;
  charStart: number;
  charEnd: number;
  text: string;
}

export interface KnowledgeItem {
  id: string;
  type: KnowledgeType;
  statement: string;
  sourceId?: string;
  sourceSha256?: string;
  locator?: KnowledgeLocator;
  claimKind?: KnowledgeClaimKind;
  accepted?: boolean;
  source: SourceProvenance;
  createdAt: string;
  runtimeEligible?: boolean;
}
