import type { CaseRecord, ProspectMapping, TaskOutput } from "./types.js";

export function buildGoldConsistentOutput(record: CaseRecord, mapping?: ProspectMapping): TaskOutput {
  const toRuntime = (id: string): string => mapping?.authoringToRuntime.get(id) ?? id;

  const assessments = record.prospects.map((p) => {
    const label = record.gold.labels[p.id]!;
    const action = record.gold.actions[p.id]!;
    const missing = record.gold.required_unknowns[p.id] ?? [];
    const cited = record.gold.required_evidence[p.id] ?? [];
    return {
      prospect_id: toRuntime(p.id),
      classification: label,
      fit_score: label === "qualified" ? 90 : label === "needs_research" ? 50 : 15,
      cited_evidence_ids: [...cited],
      rationale: `Gold-consistent assessment of ${p.company} using only supplied evidence.`,
      missing_information: [...missing],
      next_action: action,
      disqualification_reason:
        label === "disqualified" ? "Hard disqualifier established by supplied evidence." : null,
    };
  });

  return {
    case_id: record.case_id,
    assessments,
    ranked_qualified_ids: record.gold.ranked_tiers.flat().map(toRuntime),
    research_queue_ids: assessments.filter((a) => a.classification === "needs_research").map((a) => a.prospect_id),
    excluded_ids: assessments.filter((a) => a.classification === "disqualified").map((a) => a.prospect_id),
    case_uncertainties: [],
  };
}
