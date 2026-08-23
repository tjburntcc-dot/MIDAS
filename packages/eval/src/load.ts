import { readFileSync } from "node:fs";
import type { CaseRecord } from "./types.js";
import { formatAjvErrors, validateCaseRecordAjv } from "./schemas.js";

export function loadDevelopmentCases(casesPath: string): CaseRecord[] {
  const text = readFileSync(casesPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records: CaseRecord[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSON on line ${i + 1} of ${casesPath}: ${(err as Error).message}`);
    }
    const ok = validateCaseRecordAjv(parsed);
    if (!ok) {
      const details = formatAjvErrors(validateCaseRecordAjv.errors).join("; ");
      throw new Error(`Case record on line ${i + 1} failed atlas_case_record.schema.json: ${details}`);
    }
    const record = parsed as CaseRecord;
    if (!record.gold) {
      throw new Error(`Case record ${record.case_id} is missing required gold`);
    }
    records.push(record);
  }

  return records;
}
