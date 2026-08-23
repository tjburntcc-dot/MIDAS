/* ============================================================================
   MODEL ROUTING

   Which provider and model handles a given piece of work.

   Resolution order, most specific wins:
       employee override  ->  company default  ->  portfolio default  ->  built-in

   A route never widens permission. Choosing a different model changes who does
   the thinking, not what the thinker is allowed to do: approvals, spend caps,
   and company isolation are enforced upstream of this file and are unaffected.
   ============================================================================ */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  OPENROUTER_DISCLOSURE, OX_ALPHA_MODEL, openRouterConfigured, openRouterFingerprint,
} from "@midas/model";

export const ROUTING_VERSION = "model-routing-v1";
const ROUTING_FILE = "foundry_model_routing.json";

function txt(v) { return String(v == null ? "" : v); }
function stateDir(store) { return (store && store.dir) || join(process.cwd(), "var", "state"); }
function loadRouting(store) {
  const p = join(stateDir(store), ROUTING_FILE);
  if (!existsSync(p)) return { portfolio: null, companies: {}, employees: {} };
  try {
    const r = JSON.parse(readFileSync(p, "utf8"));
    return {
      portfolio: r.portfolio || null,
      companies: r.companies || {},
      employees: r.employees || {},
      updatedAt: r.updatedAt || null,
    };
  } catch (e) {
    return { portfolio: null, companies: {}, employees: {} };
  }
}
function saveRouting(store, r) {
  r.updatedAt = new Date().toISOString();
  r.version = ROUTING_VERSION;
  writeFileSync(join(stateDir(store), ROUTING_FILE), JSON.stringify(r, null, 2));
  return r;
}

/* --------------------------------------------------------- the catalogue -- */
/* Only providers that are genuinely wired are listed. */
export function modelCatalogue() {
  const openaiOn = Boolean(txt(process.env.OPENAI_API_KEY).trim());
  const orOn = openRouterConfigured();
  return [
    {
      id: "openai:gpt-4.1",
      provider: "openai",
      model: "gpt-4.1",
      label: "OpenAI GPT-4.1",
      available: openaiOn,
      paid: true,
      enforcesJsonSchema: true,
      retainsData: false,
      goodFor: ["reasoning", "analysis", "research", "planning", "evaluation"],
      note: "The default. Enforces the JSON contract on its own side.",
    },
    {
      id: "openai:gpt-4.1-mini",
      provider: "openai",
      model: "gpt-4.1-mini",
      label: "OpenAI GPT-4.1 mini",
      available: openaiOn,
      paid: true,
      enforcesJsonSchema: true,
      retainsData: false,
      goodFor: ["extraction", "summarising", "cheap bulk work"],
      note: "Cheaper. Used for turning sources into lessons.",
    },
    {
      id: "openrouter:" + OX_ALPHA_MODEL,
      provider: "openrouter",
      model: OX_ALPHA_MODEL,
      label: "Ox Alpha (free, anonymous operator)",
      available: orOn,
      paid: false,
      enforcesJsonSchema: false,
      retainsData: true,
      goodFor: ["coding", "drafting", "research", "analysis", "training material"],
      warning: OPENROUTER_DISCLOSURE.headline,
      disclosure: OPENROUTER_DISCLOSURE,
      note: orOn
        ? "Free today. Validated locally because it does not guarantee JSON shape."
        : "Needs OPENROUTER_API_KEY in the project .env file.",
      fingerprint: orOn ? openRouterFingerprint() : null,
    },
  ];
}
export function catalogueEntry(id) {
  return modelCatalogue().find(function (m) { return m.id === txt(id); }) || null;
}
export const DEFAULT_ROUTE = "openai:gpt-4.1";

/* Work that must never leave for a data-retaining third party, regardless of
   what the founder selected. These touch owner policy or private records in a
   way that would be irreversible if leaked or malformed. */
export const RESTRICTED_TASKS = [
  "approval_decision",
  "policy_write",
  "credential_handling",
  "treasury_write",
];

/* ------------------------------------------------------------- resolving -- */
export function resolveRoute(store, ctx) {
  const r = loadRouting(store);
  const employeeId = txt(ctx && ctx.employeeId);
  const workspaceId = txt(ctx && ctx.workspaceId);
  const taskKind = txt(ctx && ctx.taskKind);

  let chosen = null;
  let level = "built_in_default";
  if (employeeId && r.employees[employeeId]) { chosen = r.employees[employeeId]; level = "employee"; }
  else if (workspaceId && r.companies[workspaceId]) { chosen = r.companies[workspaceId]; level = "company"; }
  else if (r.portfolio) { chosen = r.portfolio; level = "portfolio"; }

  let id = (chosen && chosen.modelId) || DEFAULT_ROUTE;
  let entry = catalogueEntry(id);
  const notes = [];

  /* a route to something unavailable falls back rather than failing the task */
  if (!entry || !entry.available) {
    notes.push(
      entry
        ? "The selected model (" + entry.label + ") is not configured on this machine, so the default was used."
        : "The selected model is not in the catalogue, so the default was used.",
    );
    id = DEFAULT_ROUTE;
    entry = catalogueEntry(id);
    level = level + "_fell_back";
  }

  /* restricted work never goes to a data-retaining provider */
  if (entry && entry.retainsData && RESTRICTED_TASKS.indexOf(taskKind) >= 0) {
    notes.push(
      "This kind of work is never sent to a provider that retains data, so it was routed to the default instead.",
    );
    id = DEFAULT_ROUTE;
    entry = catalogueEntry(id);
    level = "restricted_override";
  }

  const fallbackId = id === DEFAULT_ROUTE ? null : DEFAULT_ROUTE;
  return {
    modelId: id,
    provider: entry ? entry.provider : "openai",
    model: entry ? entry.model : "gpt-4.1",
    label: entry ? entry.label : "OpenAI GPT-4.1",
    level,
    setBy: chosen ? (chosen.setBy || "owner") : null,
    setAt: chosen ? chosen.setAt || null : null,
    enforcesJsonSchema: entry ? entry.enforcesJsonSchema !== false : true,
    retainsData: Boolean(entry && entry.retainsData),
    disclosure: entry && entry.disclosure ? entry.disclosure : null,
    warning: entry && entry.warning ? entry.warning : null,
    fallbackModelId: fallbackId,
    notes,
    routingVersion: ROUTING_VERSION,
  };
}

/* -------------------------------------------------------------- setting --- */
export function setRoute(store, input) {
  const scope = txt(input && input.scope);
  const modelId = txt(input && input.modelId);
  if (["portfolio", "company", "employee"].indexOf(scope) < 0) {
    return { ok: false, error: "scope must be portfolio, company, or employee", errorStatus: 400 };
  }
  const r = loadRouting(store);

  /* clearing an override is a first-class action */
  if (!modelId || modelId === "inherit" || modelId === "default") {
    if (scope === "portfolio") r.portfolio = null;
    if (scope === "company") delete r.companies[txt(input.workspaceId)];
    if (scope === "employee") delete r.employees[txt(input.employeeId)];
    saveRouting(store, r);
    return { ok: true, built: true, cleared: true, scope, routing: publicRouting(store) };
  }

  const entry = catalogueEntry(modelId);
  if (!entry) return { ok: false, error: "Unknown model: " + modelId, errorStatus: 400 };
  if (!entry.available) {
    return {
      ok: false,
      errorStatus: 400,
      error: entry.provider === "openrouter"
        ? "Ox Alpha needs OPENROUTER_API_KEY in the project .env file, then a restart."
        : "That model is not configured on this machine.",
      needsSetup: entry.provider === "openrouter" ? { variable: "OPENROUTER_API_KEY", where: "the .env file in the MIDAS folder" } : null,
    };
  }

  /* a data-retaining provider requires explicit acknowledgement, once per set */
  if (entry.retainsData && input.acknowledgeDisclosure !== true) {
    return {
      ok: false,
      errorStatus: 400,
      error: "This model is run by an anonymous third party that keeps your prompts and its replies. Confirm you accept that before routing work to it.",
      requiresAcknowledgement: true,
      disclosure: entry.disclosure,
    };
  }

  const record = {
    modelId,
    setBy: "owner",
    setAt: new Date().toISOString(),
    acknowledgedDisclosure: entry.retainsData ? true : undefined,
  };
  if (scope === "portfolio") r.portfolio = record;
  if (scope === "company") {
    if (!txt(input.workspaceId)) return { ok: false, error: "workspaceId is required", errorStatus: 400 };
    r.companies[txt(input.workspaceId)] = record;
  }
  if (scope === "employee") {
    if (!txt(input.employeeId)) return { ok: false, error: "employeeId is required", errorStatus: 400 };
    r.employees[txt(input.employeeId)] = record;
  }
  saveRouting(store, r);
  return { ok: true, built: true, scope, modelId, routing: publicRouting(store) };
}

/* Never returns a key; fingerprints only. */
export function publicRouting(store) {
  const r = loadRouting(store);
  return {
    built: true,
    version: ROUTING_VERSION,
    portfolio: r.portfolio || null,
    companies: r.companies || {},
    employees: r.employees || {},
    updatedAt: r.updatedAt || null,
    catalogue: modelCatalogue().map(function (m) {
      const copy = Object.assign({}, m);
      delete copy.disclosure;
      return copy;
    }),
    defaultModelId: DEFAULT_ROUTE,
    restrictedTasks: RESTRICTED_TASKS,
    restrictedNote:
      "These kinds of work are always handled by the default provider, whatever is selected, because a data-retaining model must not see them.",
  };
}
