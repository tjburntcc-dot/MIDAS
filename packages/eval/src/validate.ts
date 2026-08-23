import type { TaskOutput, ValidationResult } from "./types.js";
import { formatAjvErrors, validateTaskOutputAjv } from "./schemas.js";

export function validateOutput(output: unknown): ValidationResult {
  const ok = validateTaskOutputAjv(output);
  if (ok) {
    return { ok: true, errors: [] };
  }
  return {
    ok: false,
    errors: formatAjvErrors(validateTaskOutputAjv.errors),
  };
}

export function assertValidOutput(output: unknown): asserts output is TaskOutput {
  const result = validateOutput(output);
  if (!result.ok) {
    throw new Error(`Invalid task output: ${result.errors.join("; ")}`);
  }
}
