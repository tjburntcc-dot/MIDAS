import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export type ModelKind = "live" | "fixture" | "disconnected";

export interface OutputSchemaSpec {
  name?: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface CompleteRequest {
  input: unknown;
  instructions?: string;
  /** When set, Responses API structured output (json_schema). Probe must omit this. */
  outputSchema?: OutputSchemaSpec;
}

export interface CompleteResponse {
  text: string;
  raw: unknown;
  kind: ModelKind;
  providerName: string;
}

export interface ModelProvider {
  name: string;
  kind: ModelKind;
  complete(request: CompleteRequest): Promise<CompleteResponse>;
}



export function sanitizeOpenAiKey(raw) {
  let v = String(raw || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  v = v.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return v;
}

/** Load KEY=VALUE from gitignored /workspace/midas/.env if process.env is empty. Never log values. */
export function loadWorkspaceEnv() {
  // A project-local .env is authoritative for this project. A machine-wide
  // OPENAI_API_KEY left over from another tool must not silently win: that
  // silently pointed MIDAS at a different organisation whose credit was spent.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIDAS_DOTENV_PATH,
    join(here, "../../../.env"),
    join(process.cwd(), ".env"),
  ].filter(Boolean);
  let read = false;
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key === "OPENAI_API_KEY") {
        val = sanitizeOpenAiKey(val);
      }
      // credentials and model choice from the project file override the ambient
      // environment; anything else only fills a gap
      const projectAuthoritative = key === "OPENAI_API_KEY" || key === "OPENAI_MODEL"
        || key === "GEMINI_API_KEY" || key === "GOOGLE_API_KEY"
        || key === "TAVILY_API_KEY" || key === "TRANSCRIPT_API_KEY";
      if (projectAuthoritative || process.env[key] === undefined) process.env[key] = val;
    }
    read = true;
    break;
  }
  if (process.env.OPENAI_API_KEY) return { loaded: true, source: read ? "dotenv" : "env" };
  return { loaded: false, source: "unset" };
}

let liveVerified = false;
let liveModel = null;
let liveFingerprint = null;
let liveError = null;

/** sha256 hex of process.env.OPENAI_API_KEY, first 12 chars. Never returns the key. */
export function keyFingerprint() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 12);
}

export function liveSession() {
  return {
    verified: liveVerified === true,
    model: liveModel,
    fingerprint: liveFingerprint,
    error: liveError,
    pid: process.pid,
  };
}

export function markLiveVerified(model) {
  liveVerified = true;
  liveModel = model || process.env.OPENAI_MODEL || "gpt-4.1";
  liveFingerprint = keyFingerprint();
  liveError = null;
}

export function markLiveFailed(error) {
  liveVerified = false;
  liveModel = null;
  liveFingerprint = keyFingerprint();
  liveError = error ? String(error) : "probe failed";
}

export function openaiKeyStatus() {
  return {
    present: Boolean(process.env.OPENAI_API_KEY),
    kind: currentModelKind(),
  };
}

function sanitizeCodeToken(raw) {
  const v = String(raw || "").trim();
  if (/^[a-zA-Z0-9_.-]{1,64}$/.test(v)) return v;
  return "";
}

/** Parse OpenAI JSON error for type/code only. Never include message (may echo the key). */
export async function sanitizedResponsesHttpError(res) {
  let token = "";
  try {
    const body = await res.json();
    const err = body && typeof body === "object" ? body.error : null;
    token = sanitizeCodeToken(err && (err.code || err.type));
  } catch {
    // ignore body text
  }
  return token ? "HTTP " + res.status + " " + token : "HTTP " + res.status;
}

export function sanitizeThrownError(err) {
  if (err && err.code === "MISSING_CONFIG") return "OPENAI_API_KEY missing";
  const msg = err instanceof Error ? err.message : String(err);
  const http = msg.match(/^HTTP\s+\d+(?:\s+[a-zA-Z0-9_.-]+)?/);
  if (http) return http[0];
  const status = msg.match(/\bHTTP\s+(\d+)\b/i);
  if (status) {
    if (/\binvalid_api_key\b/i.test(msg)) return "HTTP " + status[1] + " invalid_api_key";
    if (/\binsufficient_quota\b/i.test(msg)) return "HTTP " + status[1] + " insufficient_quota";
    return "HTTP " + status[1];
  }
  if (/network fetch failed|fetch failed|econnrefused|enotfound|etimedout|eai_again/i.test(msg)) {
    return "OpenAI Responses network fetch failed. Live run aborted; not falling back to fixture.";
  }
  return "OpenAI Responses request failed. Live run aborted; not falling back to fixture.";
}

export function tokensFromResponse(raw) {
  const u = raw && typeof raw === "object" ? raw.usage || {} : {};
  const inputTokens = Number(u.input_tokens ?? u.prompt_tokens ?? 0);
  const outputTokens = Number(u.output_tokens ?? u.completion_tokens ?? 0);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function extractResponsesText(raw) {
  if (raw && typeof raw === "object") {
    if (typeof raw.output_text === "string" && raw.output_text.trim()) return raw.output_text;
    const chunks = [];
    for (const item of raw.output || []) {
      for (const c of item.content || []) {
        if ((c.type === "output_text" || c.type === "text") && typeof c.text === "string") chunks.push(c.text);
      }
    }
    if (chunks.length) return chunks.join("\n");
    const cites = [];
    for (const item of raw.output || []) {
      if (item && (item.type === "web_search_call" || item.type === "web_search_result")) {
        cites.push(JSON.stringify({ kind: item.type, action: item.action || null, id: item.id || null }));
      }
    }
    if (cites.length) return cites.join("\n");
  }
  return "";
}

export class MissingConfigError extends Error {
  code = "MISSING_CONFIG";
  constructor(missingKey) {
    this.missingKey = missingKey;
    super(`Missing required configuration: ${missingKey}`);
    this.name = "MissingConfigError";
  }
}

export interface FixtureProspect {
  id: string;
  company: string;
  facts: Record<string, unknown>;
  evidence: Array<{ id: string; claim: string; source: string; age_days: number }>;
}

export interface FixtureInput {
  case_id: string;
  qualification_policy: {
    required: string[];
    preferred: string[];
    disqualifiers: string[];
    unknown_policy: string;
  };
  prospects: FixtureProspect[];
}

export interface FixtureOutput {
  case_id: string;
  assessments: Array<{
    prospect_id: string;
    classification: "qualified" | "needs_research" | "disqualified";
    fit_score: number;
    cited_evidence_ids: string[];
    rationale: string;
    missing_information: string[];
    next_action: "prioritize_outreach" | "research_first" | "exclude";
    disqualification_reason: string | null;
  }>;
  ranked_qualified_ids: string[];
  research_queue_ids: string[];
  excluded_ids: string[];
  case_uncertainties: string[];
}

function policyText(policy: FixtureInput["qualification_policy"]): string {
  return [...policy.required, ...policy.preferred, ...policy.disqualifiers, policy.unknown_policy]
    .join(" ")
    .toLowerCase();
}

function classifyFromPolicy(
  facts: Record<string, unknown>,
  policy: FixtureInput["qualification_policy"],
): { classification: "qualified" | "needs_research" | "disqualified"; reason: string | null } {
  const blob = policyText(policy);

  if (facts.opted_out === true) {
    return { classification: "disqualified", reason: "Recorded contact opt-out." };
  }
  const authority = facts.buyer_authority ?? facts.local_authority;
  if (authority === "none" || authority === "forbidden" || authority === "hq_only") {
    return { classification: "disqualified", reason: "No local purchasing authority." };
  }
  if (facts.requires_patient_records === true) {
    return { classification: "disqualified", reason: "Requires identifiable patient records." };
  }
  if (facts.accepting_new_patients === false) {
    return { classification: "disqualified", reason: "Not accepting new patients." };
  }
  if (typeof facts.members === "number" && facts.members < 300 && /300|member/.test(blob)) {
    return { classification: "disqualified", reason: "Below minimum member count." };
  }
  if (typeof facts.inventory_days === "number" && facts.inventory_days < 45 && /45|inventory/.test(blob)) {
    return { classification: "disqualified", reason: "Insufficient inventory runway." };
  }
  if (facts.platform === "marketplace_only") {
    return { classification: "disqualified", reason: "Marketplace-only seller." };
  }
  if (facts.service === "commercial_only") {
    return { classification: "disqualified", reason: "Commercial-only contractor." };
  }
  if (
    facts.industry === "bookkeeping" ||
    facts.industry === "recruiting_agency" ||
    facts.industry === "lead_generation_agency"
  ) {
    return { classification: "disqualified", reason: "Competitor or excluded industry." };
  }
  if (facts.country === "CA" && /united states|outside/.test(blob)) {
    return { classification: "disqualified", reason: "Outside United States." };
  }
  if (typeof facts.distance_miles === "number" && facts.distance_miles > 35 && /35|radius|miles/.test(blob)) {
    return { classification: "disqualified", reason: "Outside authorized service radius." };
  }
  if (facts.open_roles === 0 || facts.approved_budget === false) {
    return { classification: "disqualified", reason: "No current hiring or budget freeze." };
  }
  if (typeof facts.verified_arr_usd === "number" && facts.verified_arr_usd < 1000000 && /1000000|recurring/.test(blob)) {
    return { classification: "disqualified", reason: "Confirmed recurring revenue below threshold." };
  }
  if (typeof facts.monthly_customers === "number" && facts.monthly_customers < 200 && /200/.test(blob)) {
    return { classification: "disqualified", reason: "Below minimum monthly customers." };
  }
  if (typeof facts.monthly_budget_usd === "number" && /at least 2000/.test(blob) && facts.monthly_budget_usd < 2000) {
    return { classification: "disqualified", reason: "Below minimum approved budget." };
  }

  const unknownKeys = Object.entries(facts)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (unknownKeys.length > 0 || authority == null) {
    return { classification: "needs_research", reason: null };
  }
  return { classification: "qualified", reason: null };
}

function fitFromFacts(facts: Record<string, unknown>): number {
  const nums = [
    facts.members,
    facts.monthly_budget_usd,
    facts.monthly_orders,
    facts.crews,
    facts.daily_lead_capacity,
    facts.verified_arr_usd,
    facts.annual_revenue_usd,
    facts.open_roles,
    facts.monthly_customers,
  ].filter((v) => typeof v === "number");
  return nums.reduce((a, b) => a + b, 0);
}

/** Deterministic fixture. Applies qualification_policy to supplied facts. Does not read gold. */
export function fixtureRespond(runtimeInput: FixtureInput): FixtureOutput {
  const assessments = runtimeInput.prospects.map((p) => {
    const { classification, reason } = classifyFromPolicy(p.facts, runtimeInput.qualification_policy);
    const missing = Object.entries(p.facts)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    const cited = p.evidence.filter((e) => e.source !== "prospect_supplied").map((e) => e.id);
    return {
      prospect_id: p.id,
      classification,
      fit_score: classification === "qualified" ? 78 : classification === "needs_research" ? 44 : 12,
      cited_evidence_ids: cited.length ? cited : p.evidence.slice(0, 1).map((e) => e.id),
      rationale: `Fixture heuristic (not a live model) classified ${p.company} as ${classification} from supplied facts and qualification_policy.`,
      missing_information:
        classification === "needs_research" ? (missing.length ? missing : ["unspecified_mandatory_field"]) : [],
      next_action:
        classification === "qualified"
          ? ("prioritize_outreach" as const)
          : classification === "needs_research"
            ? ("research_first" as const)
            : ("exclude" as const),
      disqualification_reason: classification === "disqualified" ? reason : null,
    };
  });

  const qualified = assessments
    .filter((a) => a.classification === "qualified")
    .slice()
    .sort((a, b) => {
      const pa = runtimeInput.prospects.find((p) => p.id === a.prospect_id);
      const pb = runtimeInput.prospects.find((p) => p.id === b.prospect_id);
      return fitFromFacts(pb?.facts ?? {}) - fitFromFacts(pa?.facts ?? {});
    });

  return {
    case_id: runtimeInput.case_id,
    assessments,
    ranked_qualified_ids: qualified.map((a) => a.prospect_id),
    research_queue_ids: assessments.filter((a) => a.classification === "needs_research").map((a) => a.prospect_id),
    excluded_ids: assessments.filter((a) => a.classification === "disqualified").map((a) => a.prospect_id),
    case_uncertainties: [],
  };
}

export class FixtureProvider {
  name = "fact-heuristic-fixture";
  kind = "fixture";

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const output = fixtureRespond(request.input as FixtureInput);
    return {
      text: JSON.stringify(output),
      raw: { fixture: true, note: "Labeled fixture. Not a live model response.", output },
      kind: "fixture",
      providerName: this.name,
    };
  }
}

export class OpenAIResponsesProvider {
  name = "openai-responses";
  kind = "live";

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? "gpt-4.1") {
    Object.defineProperty(this, "apiKey", { value: apiKey, enumerable: false, writable: false });
    this.model = model;
  }

  toJSON() {
    return { name: this.name, kind: this.kind, model: this.model };
  }

  async complete(request) {
    if (!this.apiKey) {
      throw new MissingConfigError("OPENAI_API_KEY");
    }
    const input = typeof request.input === "string" ? request.input : JSON.stringify(request.input);
    const payload = {
      model: this.model,
      input: input,
      instructions: request.instructions,
    };
    if (request.tools) payload.tools = request.tools;
    if (request.tool_choice) payload.tool_choice = request.tool_choice;
    if (request.outputSchema && request.outputSchema.schema) {
      const format = {
        name: request.outputSchema.name || "structured_output",
        strict: request.outputSchema.strict !== false,
        schema: request.outputSchema.schema,
      };
      format["type"] = "json_schema";
      payload.text = { format };
    }
    let res;
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: "Bearer " + this.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const code = err && err.cause && err.cause.code;
      throw new Error(
        "OpenAI Responses network fetch failed" + (code ? ": " + code : "") + ". Live run aborted; not falling back to fixture.",
      );
    }
    if (!res.ok) {
      throw new Error(await sanitizedResponsesHttpError(res));
    }
    const raw = await res.json();
    const text = extractResponsesText(raw);
    if (!text) {
      throw new Error("OpenAI Responses returned no output_text. Live run aborted; not falling back to fixture.");
    }
    return { text: text, raw: raw, kind: "live", providerName: this.name, usage: tokensFromResponse(raw) };
  }
}

export function currentModelKind() {
  return liveSession().verified === true ? "live" : "disconnected";
}

export function describeResponder() {
  if (liveSession().verified === true) {
    return { kind: "live", name: "openai-responses", note: "Live OpenAI Responses client. Not a fixture." };
  }
  return {
    kind: "disconnected",
    name: "openai-responses",
    note: "Responder: disconnected (not live)",
  };
}

export async function probeLiveResponses() {
  const fingerprint = keyFingerprint();
  const pid = process.pid;
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new MissingConfigError("OPENAI_API_KEY");
    }
    const provider = new OpenAIResponsesProvider();
    const completion = await provider.complete({
      input: 'Reply with the JSON object {"ok":true} only.',
      instructions: "Return only {\"ok\":true}. No other text.",
    });
    if (completion.kind !== "live") {
      throw new Error("Probe returned non-live kind");
    }
    const raw = completion.raw && typeof completion.raw === "object" ? completion.raw : {};
    const model = raw.model || process.env.OPENAI_MODEL || "gpt-4.1";
    markLiveVerified(model);
    const usage = completion.usage || tokensFromResponse(completion.raw);
    return { ok: true, model, error: null, fingerprint: keyFingerprint(), pid, usage, providerRequestId: (completion.raw && completion.raw.id) || null };
  } catch (err) {
    const error = sanitizeThrownError(err);
    markLiveFailed(error);
    return { ok: false, model: null, error, fingerprint, pid };
  }
}


/** Embeddings via the SAME approved credential path as Responses. Never logs the key. */
export const EMBEDDING_PROVIDER_STATUS = [
  "NOT_CONFIGURED",
  "CONFIGURED_UNVERIFIED",
  "CONNECTED",
  "TEMPORARILY_UNAVAILABLE",
  "NOT_IMPLEMENTED",
];

export async function embedTextsApprovedPath(texts, opts = {}) {
  loadWorkspaceEnv();
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      ok: false,
      status: "NOT_CONFIGURED",
      embeddings: false,
      note: "OPENAI_API_KEY not present through approved dotenv/env path. Lexical retrieval remains.",
      vectors: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: null,
    };
  }
  const model = (opts && opts.model) || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const input = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || "").slice(0, 4000));
  if (!input.length || input.every((t) => !t.trim())) {
    return {
      ok: false,
      status: "TEMPORARILY_UNAVAILABLE",
      embeddings: false,
      note: "No texts to embed.",
      vectors: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model,
    };
  }
  let res;
  try {
    res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });
  } catch (err) {
    return {
      ok: false,
      status: "TEMPORARILY_UNAVAILABLE",
      embeddings: false,
      note: "Embeddings network fetch failed. Lexical retrieval remains. " + sanitizeThrownError(err),
      vectors: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model,
    };
  }
  if (!res.ok) {
    const errText = await sanitizedResponsesHttpError(res);
    return {
      ok: false,
      status: res.status === 401 ? "NOT_CONFIGURED" : "TEMPORARILY_UNAVAILABLE",
      embeddings: false,
      note: "Embeddings HTTP failed: " + errText + ". Lexical retrieval remains.",
      vectors: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model,
    };
  }
  const raw = await res.json();
  const vectors = (raw.data || []).map((row) => ({
    index: row.index,
    values: row.embedding,
    dims: Array.isArray(row.embedding) ? row.embedding.length : 0,
  }));
  const usage = {
    inputTokens: Number((raw.usage && (raw.usage.prompt_tokens || raw.usage.total_tokens)) || 0),
    outputTokens: 0,
  };
  return {
    ok: vectors.length > 0,
    status: vectors.length ? "CONNECTED" : "EMPTY_RESULTS",
    embeddings: vectors.length > 0,
    note: vectors.length
      ? "OpenAI embeddings via approved application credential path. Small proof only."
      : "Embeddings returned empty.",
    vectors,
    usage,
    model,
    providerRequestId: raw.id || null,
  };
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
