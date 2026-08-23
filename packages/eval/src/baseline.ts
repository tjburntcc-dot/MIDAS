import type { CaseRecord, Classification, NextAction, ProspectMapping, ScoreRecord, TaskOutput } from "./types.js";
import { scoreCase } from "./score.js";

const ACTION: Record<Classification, NextAction> = {
  qualified: "prioritize_outreach",
  needs_research: "research_first",
  disqualified: "exclude",
};

export function labelsByPresentationPosition(count: number): Classification[] {
  return Array.from({ length: count }, (_, i) => {
    if (i < 2) return "qualified";
    if (i >= count - 2) return "disqualified";
    return "needs_research";
  });
}

export function labelsByAuthoringIndex(count: number): Classification[] {
  return labelsByPresentationPosition(count);
}

export function buildPositionOnlyOutput(
  record: CaseRecord,
  mapping: ProspectMapping,
  mode: "presentation" | "authoring" = "presentation",
): TaskOutput {
  const n = record.prospects.length;
  const labels = labelsByPresentationPosition(n);
  const orderedAuthoringIds =
    mode === "presentation"
      ? mapping.presentationOrderRuntimeIds.map((rid) => mapping.runtimeToAuthoring.get(rid)!)
      : record.prospects.map((p) => p.id);

  const assessments = orderedAuthoringIds.map((id, i) => {
    const classification = labels[i]!;
    const prospect = record.prospects.find((p) => p.id === id)!;
    return {
      prospect_id: id,
      classification,
      fit_score: classification === "qualified" ? 80 : classification === "needs_research" ? 40 : 10,
      cited_evidence_ids: prospect.evidence.slice(0, 1).map((e) => e.id),
      rationale: `Position-only baseline assigned ${classification} from presentation slot ${i}.`,
      missing_information: classification === "needs_research" ? ["unspecified"] : [],
      next_action: ACTION[classification],
      disqualification_reason: classification === "disqualified" ? "Position-only last-slot exclusion." : null,
    };
  });

  return {
    case_id: record.case_id,
    assessments,
    ranked_qualified_ids: assessments.filter((a) => a.classification === "qualified").map((a) => a.prospect_id),
    research_queue_ids: assessments.filter((a) => a.classification === "needs_research").map((a) => a.prospect_id),
    excluded_ids: assessments.filter((a) => a.classification === "disqualified").map((a) => a.prospect_id),
    case_uncertainties: [],
  };
}

export function scorePositionOnlyBaseline(record: CaseRecord, mapping: ProspectMapping): ScoreRecord {
  const output = buildPositionOnlyOutput(record, mapping, "presentation");
  return scoreCase({ record, authoringOutput: output });
}

export function qualificationAccuracy(record: CaseRecord, output: TaskOutput): number {
  let correct = 0;
  for (const a of output.assessments) {
    if (a.classification === record.gold.labels[a.prospect_id]) correct += 1;
  }
  return (100 * correct) / record.prospects.length;
}
