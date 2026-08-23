import type { CaseRecord, RuntimeInput } from "./types.js";
import { formatAjvErrors, validateTaskInputAjv } from "./schemas.js";

export function projectRuntimeCase(record: CaseRecord): RuntimeInput {
  const runtime: RuntimeInput = {
    case_id: record.case_id,
    title: record.title,
    offer: structuredClone(record.offer),
    qualification_policy: structuredClone(record.qualification_policy),
    constraints: [...record.constraints],
    prospects: record.prospects.map((p) => ({
      id: p.id,
      company: p.company,
      facts: structuredClone(p.facts),
      evidence: p.evidence.map((e) => ({ ...e })),
    })),
  };

  const ok = validateTaskInputAjv(runtime);
  if (!ok) {
    throw new Error(
      `Runtime projection of ${record.case_id} failed atlas_task_input.schema.json: ${formatAjvErrors(validateTaskInputAjv.errors).join("; ")}`,
    );
  }
  return runtime;
}
