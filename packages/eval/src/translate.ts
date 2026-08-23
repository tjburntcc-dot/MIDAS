import type { ProspectMapping, TaskOutput } from "./types.js";

function remapId(id: string, mapping: ProspectMapping): string {
  const authoring = mapping.runtimeToAuthoring.get(id);
  if (!authoring) {
    return id;
  }
  return authoring;
}

export function translateResponse(output: TaskOutput, mapping: ProspectMapping): TaskOutput {
  return {
    case_id: output.case_id,
    assessments: output.assessments.map((a) => ({
      ...a,
      prospect_id: remapId(a.prospect_id, mapping),
      cited_evidence_ids: [...a.cited_evidence_ids],
      missing_information: [...a.missing_information],
    })),
    ranked_qualified_ids: output.ranked_qualified_ids.map((id) => remapId(id, mapping)),
    research_queue_ids: output.research_queue_ids.map((id) => remapId(id, mapping)),
    excluded_ids: output.excluded_ids.map((id) => remapId(id, mapping)),
    case_uncertainties: [...output.case_uncertainties],
  };
}
