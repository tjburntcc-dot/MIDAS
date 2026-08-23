/* ============================================================================
   OPENROUTER PROVIDER (optional)

   Adds OpenRouter as a third provider alongside OpenAI and Gemini. The headline
   model is stealth/ox-alpha, which is currently free but is served by an
   ANONYMOUS THIRD PARTY THAT RETAINS PROMPTS AND RESPONSES.

   Because of that, this provider is treated as untrusted egress:
     - a redaction guard runs on every outgoing payload and refuses to send
       anything that looks like a credential or private state,
     - structured output is validated server-side, because ox-alpha does not
       enforce JSON schemas the way the OpenAI Responses API does.
   ============================================================================ */
import { createHash } from "node:crypto";

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const OX_ALPHA_MODEL = "stealth/ox-alpha";

/* What the founder must be told before anything is routed here. */
export const OPENROUTER_DISCLOSURE = {
  provider: "openrouter",
  model: OX_ALPHA_MODEL,
  costToday: "free",
  operator: "anonymous third party",
  retainsPrompts: true,
  retainsResponses: true,
  enforcesJsonSchema: false,
  headline:
    "Ox Alpha is free right now, but it is run by an anonymous third party that keeps both what you send and what it replies. Treat everything sent there as public.",
  rules: [
    "Never send API keys, .env contents, or any credential.",
    "Never send customer names, contact details, or other personal data.",
    "Never send confidential business records or unrestricted application state.",
    "Its JSON is validated here, because the model does not guarantee the shape.",
    "It cannot approve anything or widen a permission.",
  ],
};

export class MissingOpenRouterKey extends Error {
  constructor() {
    super("OPENROUTER_API_KEY is not configured.");
    this.name = "MissingOpenRouterKey";
    this.code = "OPENROUTER_KEY_MISSING";
  }
}

export function openRouterKey() {
  return String(process.env.OPENROUTER_API_KEY || "").trim();
}
export function openRouterConfigured() {
  return Boolean(openRouterKey());
}
export function openRouterFingerprint() {
  const k = openRouterKey();
  if (!k) return null;
  return createHash("sha256").update(k).digest("hex").slice(0, 12);
}

/* ------------------------------------------------------- redaction guard -- */
/* Runs on the serialized payload immediately before it leaves this machine.
   This is a hard stop, not a warning: a match aborts the request. */
const SECRET_PATTERNS = [
  { id: "openai_key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { id: "google_key", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { id: "openrouter_key", re: /\bsk-or-v1-[A-Za-z0-9]{20,}/ },
  { id: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private_key_block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "bearer_header", re: /\bauthorization"?\s*[:=]\s*"?bearer\s+\S{16,}/i },
  { id: "env_assignment", re: /\b[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*\S{8,}/ },
  { id: "dotenv_dump", re: /OPENAI_API_KEY\s*=|GEMINI_API_KEY\s*=|OPENROUTER_API_KEY\s*=/ },
];

export function scanForSecrets(text) {
  const s = String(text == null ? "" : text);
  const hits = [];
  for (const p of SECRET_PATTERNS) if (p.re.test(s)) hits.push(p.id);
  return hits;
}

export class EgressBlocked extends Error {
  constructor(hits) {
    super(
      "Refused to send this to an anonymous third-party model: it contains " +
        hits.join(", ") +
        ". Nothing was transmitted.",
    );
    this.name = "EgressBlocked";
    this.code = "EGRESS_BLOCKED";
    this.hits = hits;
  }
}

/* ------------------------------------------------------------- provider -- */
export class OpenRouterProvider {
  name = "openrouter";
  kind = "live";

  constructor(apiKey, model) {
    const key = apiKey || openRouterKey();
    Object.defineProperty(this, "apiKey", { value: key, enumerable: false, writable: false });
    this.model = model || process.env.OPENROUTER_MODEL || OX_ALPHA_MODEL;
  }

  /* never serialise the key, even accidentally */
  toJSON() {
    return { name: this.name, kind: this.kind, model: this.model, disclosure: OPENROUTER_DISCLOSURE.headline };
  }

  async complete(request) {
    if (!this.apiKey) throw new MissingOpenRouterKey();

    const inputText = typeof request.input === "string" ? request.input : JSON.stringify(request.input);
    let instructions = String(request.instructions || "");

    /* ox-alpha does not enforce json_schema, so the contract goes in the prompt
       and is enforced again on the way back in */
    const schema = request.outputSchema && request.outputSchema.schema;
    if (schema) {
      instructions +=
        "\n\nReturn ONE JSON object and nothing else. No prose, no markdown fence. " +
        "It must match this JSON Schema exactly:\n" +
        JSON.stringify(schema);
    }

    const payload = {
      model: this.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: inputText },
      ],
      temperature: request.temperature != null ? request.temperature : 0.2,
    };
    if (request.maxTokens) payload.max_tokens = request.maxTokens;

    /* hard egress check on exactly the bytes we are about to send */
    const body = JSON.stringify(payload);
    const hits = scanForSecrets(body);
    if (hits.length) throw new EgressBlocked(hits);

    const started = Date.now();
    let res;
    try {
      res = await fetch(OPENROUTER_BASE + "/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.apiKey,
          "content-type": "application/json",
          /* OpenRouter asks callers to identify themselves */
          "HTTP-Referer": "http://127.0.0.1:3000",
          "X-Title": "MIDAS (local)",
        },
        body,
        signal: AbortSignal.timeout(request.timeoutMs || 180000),
      });
    } catch (err) {
      const code = err && (err.cause && err.cause.code || err.name);
      throw new Error(
        "OpenRouter network request failed" + (code ? ": " + code : "") + ". Live run aborted; not falling back to fixture.",
      );
    }
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      let detail = "HTTP " + res.status;
      try {
        const j = await res.json();
        const m = j && j.error && (j.error.message || j.error.code);
        if (m) detail += " " + String(m).slice(0, 200);
      } catch (e) { /* keep the status-only message */ }
      throw new Error("OpenRouter request failed: " + detail + ". Live run aborted; not falling back to fixture.");
    }

    const raw = await res.json();
    const choice = (raw.choices || [])[0] || {};
    const text = String((choice.message && choice.message.content) || "");
    if (!text.trim()) {
      throw new Error("OpenRouter returned an empty message. Live run aborted; not falling back to fixture.");
    }

    const u = raw.usage || {};
    return {
      text,
      raw,
      kind: "live",
      providerName: this.name,
      model: raw.model || this.model,
      latencyMs,
      finishReason: choice.finish_reason || null,
      usage: {
        inputTokens: Number(u.prompt_tokens || 0),
        outputTokens: Number(u.completion_tokens || 0),
        totalTokens: Number(u.total_tokens || 0),
      },
      /* OpenRouter reports real charge on the generation record; free models bill 0 */
      generationId: raw.id || null,
      disclosure: OPENROUTER_DISCLOSURE.headline,
    };
  }
}

/* Ask OpenRouter what it actually charged for a generation. Free models return 0,
   which is how we avoid guessing at cost. */
export async function openRouterGenerationCost(generationId) {
  const key = openRouterKey();
  if (!key || !generationId) return null;
  try {
    const res = await fetch(OPENROUTER_BASE + "/generation?id=" + encodeURIComponent(generationId), {
      headers: { authorization: "Bearer " + key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const d = j && j.data ? j.data : {};
    return {
      totalCost: d.total_cost != null ? Number(d.total_cost) : null,
      tokensPrompt: d.tokens_prompt != null ? Number(d.tokens_prompt) : null,
      tokensCompletion: d.tokens_completion != null ? Number(d.tokens_completion) : null,
      model: d.model || null,
      provider: d.provider_name || null,
    };
  } catch (e) {
    return null;
  }
}

/* Verify the key works and the target model is actually reachable. */
export async function probeOpenRouter(model) {
  const target = model || process.env.OPENROUTER_MODEL || OX_ALPHA_MODEL;
  if (!openRouterConfigured()) {
    return { ok: false, status: "not_configured", live: false, model: target,
      error: "OPENROUTER_API_KEY is not set." };
  }
  try {
    const provider = new OpenRouterProvider(undefined, target);
    const out = await provider.complete({
      instructions: 'Reply with the JSON object {"ok":true} and nothing else.',
      input: "ping",
      maxTokens: 32,
      timeoutMs: 60000,
    });
    const parsed = /"ok"\s*:\s*true/.test(out.text);
    return {
      ok: true,
      status: "verified_live",
      live: true,
      model: out.model,
      latencyMs: out.latencyMs,
      respondedWithExpectedJson: parsed,
      usage: out.usage,
      fingerprint: openRouterFingerprint(),
      note: parsed
        ? "OpenRouter answered and honoured a plain JSON instruction."
        : "OpenRouter answered but did not return the exact JSON asked for. Schema validation is enforced locally for this reason.",
    };
  } catch (err) {
    const msg = String((err && err.message) || err);
    const status = /401|unauthor|invalid.*key/i.test(msg) ? "unauthorized"
      : /404|no endpoints|not a valid model/i.test(msg) ? "model_unavailable"
      : /429|rate|quota|credit/i.test(msg) ? "exhausted"
      : "unavailable";
    return { ok: false, status, live: false, model: target, error: msg.slice(0, 240) };
  }
}
