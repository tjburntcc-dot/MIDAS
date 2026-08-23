/** @deprecated Case detail is now stored on CaseResult. Kept as a view type only. */
export interface CaseAssessmentView {
  prospect_id: string;
  classification: string;
  cited_evidence_ids: string[];
  missing_information: string[];
  next_action: string;
  rationale: string;
}

export interface CaseDetailRecord {
  id: string;
  evalRunId: string;
  caseId: string;
  title: string;
  assessments: CaseAssessmentView[];
  ranked_qualified_ids: string[];
  evidence_detail: {
    deterministic: number;
    semantic: number;
    semantic_judge_status: "not_implemented";
  };
  compliance_violations: string[];
  validation_ok: boolean;
}
