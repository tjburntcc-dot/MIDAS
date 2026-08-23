/* ============================================================================
   SCHEMA GUARD

   The OpenAI Responses API enforces json_schema on its side. OpenRouter's
   ox-alpha does not. Anything routed through a non-enforcing provider is
   validated here instead, so a malformed or inventive reply cannot flow into
   company knowledge, evaluations, or approvals.

   Deliberately a small, dependency-free subset of JSON Schema: the shapes the
   foundry contracts actually use.
   ============================================================================ */
export const SCHEMA_GUARD_VERSION = "schema-guard-v1";

function txt(v) { return String(v == null ? "" : v); }

/* Models routinely wrap JSON in prose or a markdown fence. Recover the object
   without ever executing anything. */
export function extractJson(raw) {
  const s = txt(raw).trim();
  if (!s) return { ok: false, error: "empty response" };

  const attempts = [];
  attempts.push(s);

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());

  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) attempts.push(s.slice(first, last + 1));

  for (const a of attempts) {
    try { return { ok: true, value: JSON.parse(a), recovered: a !== s }; } catch (e) { /* next */ }
  }
  return { ok: false, error: "response was not parseable as JSON" };
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function checkNode(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return value;

  const want = schema["type"];
  const got = typeOf(value);

  if (want && want !== got) {
    /* tolerate the harmless coercions models actually make */
    if (want === "string" && (got === "number" || got === "boolean")) return String(value);
    if (want === "number" && got === "string" && value.trim() !== "" && isFinite(Number(value))) return Number(value);
    if (want === "boolean" && got === "string" && /^(true|false)$/i.test(value)) return /^true$/i.test(value);
    if (want === "array" && got !== "array") {
      errors.push(path + ": expected an array, got " + got);
      return [];
    }
    if (want === "object" && got !== "object") {
      errors.push(path + ": expected an object, got " + got);
      return {};
    }
    errors.push(path + ": expected " + want + ", got " + got);
    return value;
  }

  if (want === "object" || (!want && got === "object")) {
    const props = schema.properties || {};
    const out = {};
    for (const key of Object.keys(props)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        out[key] = checkNode(value[key], props[key], path + "." + key, errors);
      }
    }
    for (const req of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, req)) {
        errors.push(path + "." + req + ": required field is missing");
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) {
          /* drop rather than fail: an extra key is noise, not a contract breach */
          errors.push(path + "." + key + ": unexpected field was dropped");
        }
      }
    } else {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) out[key] = value[key];
      }
    }
    return out;
  }

  if (want === "array" || (!want && got === "array")) {
    const items = schema.items;
    return value.map(function (v, i) { return items ? checkNode(v, items, path + "[" + i + "]", errors) : v; });
  }

  if (Array.isArray(schema.enum) && schema.enum.indexOf(value) < 0) {
    errors.push(path + ": " + JSON.stringify(value) + " is not one of " + JSON.stringify(schema.enum));
  }
  return value;
}

/**
 * Validate a model reply against an outputSchema.
 * Returns { ok, value, errors, recovered, repaired }.
 *   ok      - safe to use
 *   repaired- structure was coerced or extra fields dropped
 */
export function validateAgainstSchema(rawText, outputSchema) {
  const parsed = extractJson(rawText);
  if (!parsed.ok) {
    return { ok: false, value: null, errors: [parsed.error], recovered: false, repaired: false };
  }
  const schema = outputSchema && outputSchema.schema ? outputSchema.schema : outputSchema;
  if (!schema) {
    return { ok: true, value: parsed.value, errors: [], recovered: Boolean(parsed.recovered), repaired: false };
  }
  const errors = [];
  const value = checkNode(parsed.value, schema, "$", errors);

  /* a missing required field is fatal; a dropped extra or a coercion is not */
  const fatal = errors.filter(function (e) {
    return /required field is missing|expected an? /.test(e) && !/unexpected field was dropped/.test(e);
  });
  return {
    ok: fatal.length === 0,
    value,
    errors,
    fatalErrors: fatal,
    recovered: Boolean(parsed.recovered),
    repaired: errors.length > 0 && fatal.length === 0,
    guardVersion: SCHEMA_GUARD_VERSION,
  };
}

/**
 * One bounded repair attempt. Used only when the first reply failed validation.
 * Costs a second call, so callers decide whether it is worth it.
 */
export function repairInstruction(outputSchema, errors) {
  return (
    "Your previous reply did not match the required JSON contract. " +
    "Problems: " + (errors || []).slice(0, 6).join("; ") + ". " +
    "Return ONE JSON object only, no prose and no markdown fence, matching exactly:\n" +
    JSON.stringify(outputSchema && outputSchema.schema ? outputSchema.schema : outputSchema)
  );
}
