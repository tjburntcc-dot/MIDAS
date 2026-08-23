import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, "../../../contracts/atlas");

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(contractsDir, name), "utf8")) as Record<string, unknown>;
}

export const caseRecordSchema = loadSchema("atlas_case_record.schema.json");
export const taskInputSchema = loadSchema("atlas_task_input.schema.json");
export const taskOutputSchema = loadSchema("atlas_task_output.schema.json");

export interface SchemaError {
  instancePath: string;
  message: string;
  params?: Record<string, unknown>;
}

type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

function uniqueOk(items: unknown[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function matchesType(value: unknown, t: string): boolean {
  if (t === "integer") return isInteger(value);
  if (t === "number") return typeof value === "number" && !Number.isNaN(value);
  return typeOf(value) === t;
}

function validate(data: unknown, schema: Schema, path: string, errors: SchemaError[]): void {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => matchesType(data, t))) {
      errors.push({ instancePath: path || "/", message: "must be " + types.join("|") });
      return;
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const") && data !== schema.const) {
    errors.push({ instancePath: path || "/", message: "must equal const", params: { allowed: schema.const } });
  }
  if (schema.enum && !(schema.enum as unknown[]).some((v) => v === data)) {
    errors.push({ instancePath: path || "/", message: "must be equal to one of the enum values" });
  }
  if (typeof schema.pattern === "string" && typeof data === "string") {
    if (!new RegExp(schema.pattern).test(data)) {
      errors.push({ instancePath: path || "/", message: "must match pattern " + schema.pattern });
    }
  }
  if (typeof schema.minLength === "number" && typeof data === "string" && data.length < schema.minLength) {
    errors.push({ instancePath: path || "/", message: "must NOT have fewer than " + schema.minLength + " characters" });
  }
  if (typeof schema.minimum === "number" && typeof data === "number" && data < schema.minimum) {
    errors.push({ instancePath: path || "/", message: "must be >= " + schema.minimum });
  }
  if (typeof schema.maximum === "number" && typeof data === "number" && data > schema.maximum) {
    errors.push({ instancePath: path || "/", message: "must be <= " + schema.maximum });
  }
  if (typeof schema.minProperties === "number" && data && typeof data === "object" && !Array.isArray(data)) {
    if (Object.keys(data as object).length < schema.minProperties) {
      errors.push({ instancePath: path || "/", message: "must have at least " + schema.minProperties + " properties" });
    }
  }

  if (Array.isArray(data)) {
    if (typeof schema.minItems === "number" && data.length < schema.minItems) {
      errors.push({ instancePath: path || "/", message: "must NOT have fewer than " + schema.minItems + " items" });
    }
    if (typeof schema.maxItems === "number" && data.length > schema.maxItems) {
      errors.push({ instancePath: path || "/", message: "must NOT have more than " + schema.maxItems + " items" });
    }
    if (schema.uniqueItems && !uniqueOk(data)) {
      errors.push({ instancePath: path || "/", message: "must NOT have duplicate items" });
    }
    if (schema.items && typeof schema.items === "object") {
      for (let i = 0; i < data.length; i += 1) {
        validate(data[i], schema.items as Schema, path + "/" + i, errors);
      }
    }
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const properties = (schema.properties as Record<string, Schema> | undefined) ?? {};
    const required = (schema.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        errors.push({ instancePath: path || "/", message: "must have required property '" + key + "'" });
      }
    }
    const extra = Object.keys(obj).filter((k) => !Object.prototype.hasOwnProperty.call(properties, k));
    if (schema.additionalProperties === false && extra.length) {
      errors.push({
        instancePath: path || "/",
        message: "must NOT have additional properties",
        params: { additionalProperty: extra[0] },
      });
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of extra) {
        validate(obj[key], schema.additionalProperties as Schema, path + "/" + key, errors);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        validate(obj[key], child, path + "/" + key, errors);
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf as Schema[]) {
      validate(data, part, path, errors);
    }
  }

  if (schema.if && typeof schema.if === "object") {
    const probe: SchemaError[] = [];
    validate(data, schema.if as Schema, path, probe);
    if (probe.length === 0 && schema.then && typeof schema.then === "object") {
      validate(data, schema.then as Schema, path, errors);
    }
    if (probe.length > 0 && schema.else && typeof schema.else === "object") {
      validate(data, schema.else as Schema, path, errors);
    }
  }
}

export function validateSchema(schema: Schema, data: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  validate(data, schema, "", errors);
  return errors;
}

type ValidateFn = ((data: unknown) => boolean) & { errors: SchemaError[] | null };

function compile(schema: Schema): ValidateFn {
  const fn = ((data: unknown) => {
    const errors = validateSchema(schema, data);
    fn.errors = errors.length ? errors : null;
    return errors.length === 0;
  }) as ValidateFn;
  fn.errors = null;
  return fn;
}

export const validateCaseRecordAjv: ValidateFn = compile(caseRecordSchema);
export const validateTaskInputAjv: ValidateFn = compile(taskInputSchema);
export const validateTaskOutputAjv: ValidateFn = compile(taskOutputSchema);

export function formatAjvErrors(errors: SchemaError[] | null | undefined): string[] {
  if (!errors?.length) return [];
  return errors.map((err) => {
    const path = err.instancePath || "/";
    return `${path} ${err.message ?? "invalid"}${err.params ? ` ${JSON.stringify(err.params)}` : ""}`;
  });
}

function stripForStrictApi(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripForStrictApi);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (
      k === "if" || k === "then" || k === "else" || k === "allOf" ||
      k === "$schema" || k === "$id" || k === "title" ||
      k === "pattern" || k === "uniqueItems" || k === "minLength" || k === "maxLength" ||
      k === "minItems" || k === "maxItems" || k === "minimum" || k === "maximum" ||
      k === "const" || k === "format"
    ) continue;
    out[k] = stripForStrictApi(v);
  }
  if (!out.type && Array.isArray(out.enum)) out.type = "string";
  return out;
}

/** Strict-compatible schema for OpenAI Responses structured output. Drops if/then/allOf. */
export const atlasTaskOutputApiSchema = stripForStrictApi(taskOutputSchema) as Record<string, unknown>;
