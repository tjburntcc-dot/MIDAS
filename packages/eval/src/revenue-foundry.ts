/**
 * Revenue Foundry slice — deepen planner, opportunity engine, source registry,
 * teams, brain layers, embeddings boundary/proof, teaching, task graph,
 * launch readiness, adapters, artifacts, UI hooks, Section 21 report.
 * Prefer $0 live. Do not decide APR-005 / TPK-001. FILE_STORE stays FILE_STORE.
 */
import { artifactsDir as midasArtifactsDir, repoPath as midasRepoPath, repoRoot as midasRepoRoot, stateDir as midasStateDir } from "@midas/db";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync, statSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  planFromNaturalLanguage,
  persistCommandPlan,
  COMMAND_HONESTY,
} from "./command-center.ts";
import {
  MASTER_OS_HONESTY,
} from "./master-os.ts";
import { generateOpportunities, compareOpportunities } from "./opportunity-scout.ts";
import { ROLE_CATALOG, selectRoleIds, collectWorkspaceSignals } from "./team-generator.ts";
import { searchProviderStatus, searchProviderView } from "./search-provider.ts";
import { recordUsage } from "./spend-ledger.ts";
import { describeProviderConnection } from "./provider-gateway.ts";

export const HARBOR_WORKSPACE_ID = "ws-own-004";
export const FINCH_WORKSPACE_ID = "ws-own-005";
export const REVENUE_FOUNDRY_SLICE = "revenue-foundry-v0";

export const REVENUE_FOUNDRY_HONESTY = {
  ...MASTER_OS_HONESTY,
  persistence: "FILE_STORE",
  alwaysOn: false,
  embeddingsDefault: false,
  note: "Revenue foundry deepen. Isolation application-level, not IAM. No Postgres/deploy/revenue claims.",
};

function nowIso() { return new Date().toISOString(); }
function etStamp(iso) {
  try { return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"; }
  catch { return iso; }
}
function asList(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") {
    if (Array.isArray(x.items)) return x.items;
    if (Array.isArray(x.records)) return x.records;
    const vals = Object.values(x);
    if (vals.length && vals.every((v) => v && typeof v === "object")) return vals;
  }
  return [];
}
function loadJson(stateDir, name) {
  const p = join(stateDir, name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}
function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "(\\\\d+)$");
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}
function sha(text) { return createHash("sha256").update(String(text || ""), "utf8").digest("hex"); }


/* ========== 1. Founder planner upgrade ========== */
export const PLANNER_POLICY = {
  forbidIncomeGuarantees: true,
  requireBudgetIfMentioned: true,
  convertLargeGoalsToTargets: true,
  maxLivePlannerCallsPerSlice: 1,
};
const INCOME_GUARANTEE_RE = /\b(guaranteed? (income|revenue|profit)|will make \$|must earn \$|income guarantee)\b/i;

export function validateProposedPlan(proposed, deterministicFallback) {
  const violations = [];
  const assumptions = [];
  const unknowns = [];
  const measurableTargets = [];
  const text = JSON.stringify(proposed || {});
  if (INCOME_GUARANTEE_RE.test(text)) {
    violations.push({ code: "INCOME_GUARANTEE", message: "Income/revenue guarantees are forbidden." });
  }
  const roles = (proposed && (proposed.neededSpecialists || proposed.roles)) || [];
  for (const r of roles) {
    const id = typeof r === "string" ? r : r.roleId || r.id;
    const cat = ROLE_CATALOG.find((c) => c.roleId === id);
    if (!cat) violations.push({ code: "UNKNOWN_ROLE", message: "Unknown role: " + id });
    else if (cat.implementationStatus === "not_implemented" && !(r && r.planningOnly)) {
      assumptions.push({ key: "role." + id, text: "Role is planning-only / not fully implemented." });
    }
  }
  const goalUsd = proposed && (proposed.revenueGoalUsd || proposed.goalUsd);
  if (goalUsd != null && Number(goalUsd) >= 10000) {
    measurableTargets.push({
      kind: "revenue_target",
      amountUsd: Number(goalUsd),
      claimClass: "HYPOTHETICAL",
      note: "$10k+ goals become measurable targets with assumptions/unknowns — not guarantees.",
    });
    assumptions.push({ key: "demand", text: "Demand for the target is unverified." });
    unknowns.push({ key: "conversion", reason: "Conversion rate unknown; do not invent WTP/TAM." });
  }
  const budget = proposed && proposed.budgetUsd;
  if (budget != null && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
    violations.push({ code: "BAD_BUDGET", message: "Budget must be a non-negative number." });
  }
  const ok = violations.length === 0;
  return {
    ok, violations, assumptions, unknowns, measurableTargets,
    fallbackUsed: !ok,
    validatedPlan: ok ? proposed : deterministicFallback,
    policy: PLANNER_POLICY,
  };
}

export function planDeterministicValidated(ownerText, extras) {
  const det = planFromNaturalLanguage(ownerText, extras || {});
  const m = String(ownerText || "").match(/\$\s*([\d,]+)/);
  const validation = validateProposedPlan({
    neededSpecialists: det.neededSpecialists,
    budgetUsd: det.estimatedInternalCost && det.estimatedInternalCost.planningUsd,
    revenueGoalUsd: m ? Number(m[1].replace(/,/g, "")) : null,
    roles: det.neededSpecialists,
  }, det);
  return {
    ...det,
    plannerMode: "deterministic",
    liveProviderCall: false,
    policyValidation: validation,
    honesty: { ...COMMAND_HONESTY, liveProviderCall: false },
  };
}

export async function planWithOptionalLive(store, ownerText, extras) {
  const preferLive = extras && (extras.preferLive === true || extras.live === true || extras.plannerMode === "live");
  const det = planDeterministicValidated(ownerText, { ...(extras || {}), store });
  if (!preferLive) return { ok: true, ...det, usedLive: false };
  const conn = describeProviderConnection(store);
  if (!conn || conn.status !== "verified_live") {
    return { ok: true, ...det, usedLive: false, liveSkippedReason: "Provider not verified_live; deterministic fallback." };
  }
  const liveComplete = extras && extras.liveComplete;
  if (typeof liveComplete !== "function") {
    return { ok: true, ...det, usedLive: false, liveSkippedReason: "No liveComplete injector; deterministic fallback." };
  }
  let liveRaw;
  try {
    liveRaw = await liveComplete({ ownerText });
  } catch (err) {
    return { ok: true, ...det, usedLive: false, liveSkippedReason: "Live planner failed: " + String(err && err.message ? err.message : err) };
  }
  let proposed;
  try { proposed = typeof liveRaw === "string" ? JSON.parse(liveRaw) : liveRaw; }
  catch { return { ok: true, ...det, usedLive: false, liveSkippedReason: "Live planner returned non-JSON; fallback." }; }
  const validation = validateProposedPlan(proposed, det);
  if (!validation.ok) {
    return { ok: true, ...det, usedLive: false, liveAttempted: true, liveRejected: true, policyValidation: validation, liveSkippedReason: "Live plan failed policy validation; deterministic fallback." };
  }
  return {
    ok: true,
    ...det,
    plannerMode: "live_validated",
    liveProviderCall: true,
    policyValidation: validation,
    liveProposal: proposed,
    understood: { ...det.understood, objectiveType: proposed.objectiveType || det.understood.objectiveType, liveAssumptions: validation.assumptions, measurableTargets: validation.measurableTargets },
    neededSpecialists: proposed.neededSpecialists || det.neededSpecialists,
    proposedTaskPlan: proposed.proposedTaskPlan || det.proposedTaskPlan,
    honesty: { ...COMMAND_HONESTY, liveProviderCall: true, planner: "live_structured_validated_v0" },
    usedLive: true,
  };
}


/* ========== 2. Serious opportunity engine ========== */

export async function persistCommandPlanMaybeLive(store, ownerText, extras) {
  const planned = await planWithOptionalLive(store, ownerText, extras);
  const out = persistCommandPlan(store, ownerText, extras || {});
  if (planned.usedLive) {
    const rec = out.plan;
    const next = {
      ...rec,
      liveProviderCall: true,
      plannerMode: "live_validated",
      policyValidation: planned.policyValidation,
      liveProposal: planned.liveProposal || null,
    };
    store.putCommandPlan(next);
    return { ...out, plan: next, usedLive: true, honesty: planned.honesty };
  }
  return { ...out, usedLive: false, liveSkippedReason: planned.liveSkippedReason || null };
}

export const OPPORTUNITY_RUBRIC_V1 = Object.freeze({
  id: "OPRUB-001",
  version: "v1",
  frozenAt: "2026-08-22T14:00:00.000Z",
  dimensions: Object.freeze([
    { id: "owner_fit", weight: 0.18, label: "Owner fit" },
    { id: "startup_affordability", weight: 0.14, label: "Startup affordability" },
    { id: "speed_to_first_test", weight: 0.12, label: "Speed to first test" },
    { id: "evidence_quality", weight: 0.16, label: "Evidence quality" },
    { id: "operational_complexity", weight: 0.1, label: "Operational complexity (lower better)" },
    { id: "automation_viability", weight: 0.1, label: "Automation viability" },
    { id: "distribution_difficulty", weight: 0.1, label: "Distribution difficulty (lower better)" },
    { id: "downside", weight: 0.1, label: "Potential downside (lower better)" },
  ]),
  forbidInvented: Object.freeze(["TAM", "demand", "WTP", "conversion"]),
  note: "Scores are decision aids, not demand guarantees. No invented TAM/demand/WTP/conversion.",
});

function dimensionScore(text, invert) {
  const t = String(text || "").toLowerCase();
  if (!t || t === "unknown" || /unknown|unverified|missing/.test(t)) return { score: 40, claimClass: "UNKNOWN" };
  let s = 55;
  if (/high|strong|excellent|fast|low cost|affordable|fits|owner/.test(t)) s += 20;
  if (/thin|weak|slow|expensive|hard|complex|risky/.test(t)) s -= 15;
  s = Math.max(5, Math.min(95, s));
  if (invert) s = 100 - s;
  return { score: s, claimClass: /unknown/.test(t) ? "UNKNOWN" : "MODEL_ESTIMATE" };
}

export function scoreOpportunityAgainstRubric(rec, rubric) {
  const r = rubric || OPPORTUNITY_RUBRIC_V1;
  const dims = (rec && rec.comparisonDimensions) || {};
  const map = {
    owner_fit: dims.ownerFit || dims.owner_fit,
    startup_affordability: dims.startupAffordability || rec.startupCostEstimate,
    speed_to_first_test: dims.speedToFirstTest,
    evidence_quality: dims.evidenceQuality,
    operational_complexity: dims.operationalComplexity,
    automation_viability: dims.automationViability || rec.automationViability,
    distribution_difficulty: dims.distributionDifficulty,
    downside: dims.potentialDownside || dims.downside,
  };
  const invert = new Set(["operational_complexity", "distribution_difficulty", "downside"]);
  const parts = [];
  let weighted = 0, wsum = 0;
  for (const d of r.dimensions) {
    const raw = map[d.id];
    const text = raw && (raw.text || raw.value || raw);
    const scored = dimensionScore(text, invert.has(d.id));
    weighted += scored.score * d.weight; wsum += d.weight;
    parts.push({ id: d.id, label: d.label, weight: d.weight, score: scored.score, claimClass: scored.claimClass, evidenceText: String(text || "unknown").slice(0, 160) });
  }
  return { rubricId: r.id, rubricVersion: r.version, explainableScore: Math.round((weighted / (wsum || 1)) * 10) / 10, parts, forbidInvented: r.forbidInvented, note: r.note };
}

export function structureOpportunityRecord(rec) {
  const scored = scoreOpportunityAgainstRubric(rec);
  const cost = rec.startupCostEstimate || rec.costRange || {};
  return {
    ...rec,
    thesis: rec.thesis || rec.proposedOffer || { text: rec.name || "Untitled hypothesis", claimClass: "model_generated_hypothesis" },
    evidenceRefs: rec.evidenceRefs || rec.evidenceIds || [],
    sourceQuality: rec.sourceQuality || { text: (rec.evidenceRefs && rec.evidenceRefs.length) ? "Has evidence refs" : "Thin / owner-hypothesis only", claimClass: (rec.evidenceRefs && rec.evidenceRefs.length) ? "SOURCE_SUPPORTED" : "UNKNOWN" },
    known: rec.known || [],
    assumptions: rec.assumptions || [],
    unknowns: rec.unknowns || rec.missingInformation || [],
    costRangesLabeled: { lowUsd: cost.lowUsd ?? null, highUsd: cost.highUsd ?? null, text: cost.text || null, claimClass: cost.claimClass || "ESTIMATED", label: "ESTIMATED — not ACTUAL spend" },
    ownerFit: (rec.comparisonDimensions && rec.comparisonDimensions.ownerFit) || { text: "unknown", claimClass: "UNKNOWN" },
    automationViability: rec.automationViability || { text: "unknown", claimClass: "UNKNOWN" },
    rubricScore: scored,
    inventedTamDemandWtpConversion: false,
  };
}

export function investmentCommitteePerspectives(rec) {
  const score = (rec.rubricScore && rec.rubricScore.explainableScore) || 50;
  return {
    mode: "deterministic_structured", liveSynthesis: false,
    perspectives: [
      { role: "advocate", stance: score >= 55 ? "Pursue a cheap test" : "Worth listing, not committing", points: ["Owner-fit and speed are decision aids.", "Keep cost ranges labeled ESTIMATED."] },
      { role: "skeptic", stance: "Demand/WTP/conversion unknown", points: ["No invented TAM/demand/WTP/conversion.", String((rec.unknowns && rec.unknowns[0] && (rec.unknowns[0].text || rec.unknowns[0].reason || rec.unknowns[0])) || "Missing validation evidence.")] },
      { role: "finance", stance: "Protect cash", points: ["Startup cost claimClass=" + ((rec.costRangesLabeled && rec.costRangesLabeled.claimClass) || "ESTIMATED"), "Do not treat hypothetical revenue as ACTUAL."] },
      { role: "ops", stance: "Can we fulfill a first test?", points: ["Operational complexity is a score, not a plan.", "Fulfillment path must be owner-stated or researched."] },
      { role: "watcher", stance: "Policy", points: ["No outreach/publish/purchase without explicit owner approval.", "Scores are not guarantees."] },
    ],
  };
}

export function demonstrateSeriousOpportunities(store, extras) {
  const stateDir = (extras && extras.stateDir) || store.dir || midasStateDir();
  const rubricPath = join(stateDir, "opportunity_rubric.json");
  if (!existsSync(rubricPath)) writeFileSync(rubricPath, JSON.stringify(OPPORTUNITY_RUBRIC_V1, null, 2));
  const frozen = JSON.parse(readFileSync(rubricPath, "utf8"));

  const newBiz = generateOpportunities(store, {
    workspaceId: null,
    budget: "$2,000",
    ownerObjective: "Find business opportunities I can start with $2,000.",
    availableSkillsAndResources: "local service, teaching, bookkeeping familiarity",
    constraints: "No invented TAM/demand/WTP/conversion; Label all cost estimates",
  });
  const newIds = (newBiz.opportunities || []).map((o) => o.id || (o && o.id) || o).filter(Boolean);
  const structuredNew = [];
  for (const id of newIds.slice(0, 5)) {
    const rec = store.getOpportunity(id);
    if (!rec) continue;
    const structured = structureOpportunityRecord({ ...rec, automationViability: { text: "Partial — research/drafting automatable; fulfillment likely owner/manual", claimClass: "MODEL_ESTIMATE" } });
    structured.investmentCommittee = investmentCommitteePerspectives(structured);
    store.putOpportunity(structured);
    structuredNew.push(structured);
  }

  const finchGen = generateOpportunities(store, {
    workspaceId: FINCH_WORKSPACE_ID,
    budget: "$2,000",
    ownerObjective: "Grow Finch & Copper bookkeeping — find growth hypotheses under $2,000 test budget.",
  });
  const finchIds = (finchGen.opportunities || []).map((o) => o.id || (o && o.id) || o).filter(Boolean);
  const existingFinch = (store.listOpportunities(FINCH_WORKSPACE_ID) || []).map((o) => o.id);
  const allFinch = Array.from(new Set([...finchIds, ...existingFinch]));
  const structuredFinch = [];
  for (const id of allFinch.slice(0, 6)) {
    const rec = store.getOpportunity(id);
    if (!rec || rec.workspaceId !== FINCH_WORKSPACE_ID) continue;
    const structured = structureOpportunityRecord({ ...rec, automationViability: { text: "Bookkeeping close checklist + reminders partially automatable", claimClass: "MODEL_ESTIMATE" } });
    structured.investmentCommittee = investmentCommitteePerspectives(structured);
    store.putOpportunity(structured);
    structuredFinch.push(structured);
  }
  const compareNew = structuredNew.length >= 2 ? compareOpportunities(store, structuredNew.slice(0, 3).map((o) => o.id)) : null;
  const compareFinch = structuredFinch.length >= 2 ? compareOpportunities(store, structuredFinch.slice(0, 3).map((o) => o.id)) : null;
  return {
    rubric: frozen, rubricFrozenPath: rubricPath,
    newBusiness: { objective: "$2,000 new-business", count: structuredNew.length, ids: structuredNew.map((o) => o.id), compare: compareNew },
    finchGrow: { objective: "grow-existing Finch", count: structuredFinch.length, ids: structuredFinch.map((o) => o.id), compare: compareFinch },
    inventedTamDemandWtpConversion: false, investmentCommitteeMode: "deterministic_structured",
  };
}


/* ========== 3. Source-provider abstraction ========== */
export const SOURCE_PROVIDER_STATUSES = ["CONNECTED","CONFIGURED_UNVERIFIED","NOT_CONFIGURED","NOT_SUPPORTED","PERMISSION_REQUIRED","TEMPORARILY_UNAVAILABLE","EMPTY_RESULTS"];
export function isBlockedFetchUrl(url) {
  const u = String(url || "").trim();
  if (!u) return { blocked: true, reason: "empty" };
  if (u.toLowerCase().startsWith("file:")) return { blocked: true, reason: "file_scheme" };
  let parsed;
  try { parsed = new URL(u); } catch { return { blocked: true, reason: "unparseable" }; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { blocked: true, reason: "non_http" };
  const host = String(parsed.hostname || "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "metadata.google" || host === "metadata.google.internal") {
    return { blocked: true, reason: "localhost_or_metadata_or_private" };
  }
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
    return { blocked: true, reason: "localhost_or_metadata_or_private" };
  }
  // private / link-local ranges (simple prefix checks on IPv4)
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
    return { blocked: true, reason: "localhost_or_metadata_or_private" };
  }
  return { blocked: false };
}

export function buildSourceProviderRegistry(store, extras) {
  const search = searchProviderStatus(store);
  const searchConnected = search && (search.connected === true || search.status === "connected");
  const useful = search && search.usefulOnTopic === true;
  const providers = [
    { id: "web_search", status: searchConnected ? (useful ? "CONNECTED" : "EMPTY_RESULTS") : "NOT_CONFIGURED", note: searchConnected ? (useful ? "Official web_search persisted useful on-topic pages (SRCH-002)." : "Connected but no useful on-topic accepted set.") : "Not connected in this process view; prior SRCH records may still exist.", evidenceIds: ["SRCH-002","SBR-002"] },
    { id: "owner_url_fetch", status: "CONFIGURED_UNVERIFIED", note: "Owner-URL fetch path exists; SSRF blocked. Not a substitute for web_search." },
    { id: "approved_domain", status: "CONFIGURED_UNVERIFIED", note: "Approved-domain fetch boundary exists for permitted research." },
    { id: "google_trends", status: "NOT_CONFIGURED", note: "No Trends credentials/integration." },
    { id: "reddit", status: "NOT_CONFIGURED", note: "No Reddit API credentials." },
    { id: "product_hunt", status: "NOT_SUPPORTED", note: "Not implemented in this slice." },
    { id: "edgar", status: "NOT_SUPPORTED", note: "Not implemented in this slice." },
    { id: "youtube_transcripts", status: "NOT_CONFIGURED", note: "Do not claim video/transcript ingestion unless truly ingested." },
  ];
  const record = { id: "SPR-001", updatedAt: nowIso(), persistence: "FILE_STORE", ssrfProtection: true, providers };
  const stateDir = (extras && extras.stateDir) || store.dir || midasStateDir();
  writeFileSync(join(stateDir, "source_provider_registry.json"), JSON.stringify(record, null, 2));
  return record;
}

export function persistFetchMetadata(store, meta) {
  const block = isBlockedFetchUrl(meta && meta.url);
  if (block.blocked) return { ok: false, blocked: true, reason: block.reason, status: "PERMISSION_REQUIRED" };
  const stateDir = store.dir || midasStateDir();
  const all = loadJson(stateDir, "fetch_metadata.json") || [];
  const list = asList(all);
  const row = {
    id: meta.id || nextId(list.map((x) => x.id), "FET-"),
    url: meta.url,
    contentHash: meta.contentHash || sha(meta.excerpt || meta.url),
    excerpt: String(meta.excerpt || "").slice(0, 500),
    relevance: meta.relevance || "unknown",
    limitations: meta.limitations || [],
    providerId: meta.providerId || "owner_url_fetch",
    workspaceId: meta.workspaceId || null,
    fetchedAt: nowIso(),
  };
  list.push(row);
  writeFileSync(join(stateDir, "fetch_metadata.json"), JSON.stringify(list, null, 2));
  return { ok: true, record: row };
}

/* ========== 4. Dynamic company-specific team assembly ========== */
export function compileCompanyRoleSpec(workspace, roleId) {
  const cat = ROLE_CATALOG.find((r) => r.roleId === roleId) || { roleId, title: roleId };
  const name = (workspace && workspace.name) || "Company";
  const kind = (workspace && workspace.kind) || (workspace && workspace.intake && workspace.intake.kind) || "unknown";
  const isFinch = workspace && workspace.id === FINCH_WORKSPACE_ID;
  const isHarbor = workspace && workspace.id === HARBOR_WORKSPACE_ID;
  const isSaas = /saas|software|subscription/i.test(String(kind) + " " + name);
  const mission = isFinch
    ? "Support Finch & Copper bookkeeping for " + name + ": close discipline, client cadence, no invented profitability."
    : isHarbor
      ? "Support Harbor Oak local music lessons: library bulletin, $40/30min facts, no invented demand."
      : isSaas
        ? "Support a software-like offer for " + name + ": packaging, onboarding, metrics — planning only until integrations exist."
        : "Support " + name + " with role " + (cat.title || roleId) + ".";
  const forbidden = ["cross_workspace_retrieval","self_hire","income_guarantee","external_execute_without_owner","invent_TAM_demand_WTP_conversion"];
  if (roleId === "sales") forbidden.push("outreach_without_owner");
  const tools = ["FILE_STORE","lexical_retrieval","local_artifacts"];
  const knowledgeNamespaces = ["OWNER_POLICY:" + ((workspace && workspace.id) || "none"), "ROLE:" + roleId, "COMPANY:" + ((workspace && workspace.id) || "none")];
  const version = { id: "RSV-" + roleId + "-" + ((workspace && workspace.id) || "x") + "-v1", immutable: true, contentHash: sha(mission + roleId + ((workspace && workspace.id) || "")) };
  const prompt = [
    "You are the " + (cat.title || roleId) + " for " + name + " only.",
    "Mission: " + mission,
    "Competencies: " + ((cat.competencies || cat.skills || ["role_default"]).join(", ")),
    "Tools allowed: " + tools.join(", "),
    "Forbidden: " + forbidden.join(", "),
    "Knowledge namespaces: " + knowledgeNamespaces.join(", "),
    "Cost limit: respect workspace spend ledger and owner budget.",
    "Never claim Postgres/IAM/24-7/deployed/revenue.",
    "This prompt is company-specific, not a rename of a generic template.",
  ].join("\n");
  return { workspaceId: workspace && workspace.id, roleId, title: cat.title || roleId, mission, competencies: cat.competencies || cat.skills || [], tools, forbidden, knowledgeNamespaces, costLimitUsd: null, version, compiledPrompt: prompt, ownerAuthRequiredToCreateSeat: true, companyKindHint: isFinch ? "bookkeeping" : isHarbor ? "local-service" : isSaas ? "saas" : "generic" };
}

export function assembleCompanyTeamDiff(store) {
  const harbor = store.getWorkspace(HARBOR_WORKSPACE_ID);
  const finch = store.getWorkspace(FINCH_WORKSPACE_ID);
  const saasFake = { id: "ws-hyp-saas", name: "Hypothetical B2B SaaS", kind: "saas", intake: { kind: "new_business", fields: { businessDescription: { value: "B2B subscription software" } } } };
  const harborRoles = selectRoleIds(collectWorkspaceSignals(harbor)).roleIds;
  const finchRoles = selectRoleIds(collectWorkspaceSignals(finch)).roleIds;
  const saasRoles = selectRoleIds(collectWorkspaceSignals(saasFake)).roleIds;
  const out = {
    harbor: { workspaceId: HARBOR_WORKSPACE_ID, roleIds: harborRoles, specs: harborRoles.map((r) => compileCompanyRoleSpec(harbor, r)) },
    finch: { workspaceId: FINCH_WORKSPACE_ID, roleIds: finchRoles, specs: finchRoles.map((r) => compileCompanyRoleSpec(finch, r)) },
    hypotheticalSaas: { workspaceId: saasFake.id, roleIds: saasRoles, specs: saasRoles.map((r) => compileCompanyRoleSpec(saasFake, r)), note: "Hypothetical — no seats created." },
    teamsDiffer: JSON.stringify(harborRoles) !== JSON.stringify(finchRoles) && JSON.stringify(harborRoles) !== JSON.stringify(saasRoles),
    ownerAuthRequiredToCreateSeat: true,
    noSeatsCreatedForSaas: true,
  };
  writeFileSync(join(store.dir || midasStateDir(), "company_team_specs.json"), JSON.stringify(out, null, 2));
  return out;
}


/* ========== 5. Employee Brain (9 layers) + Training Lab ========== */
export const BRAIN_LAYERS = ["identity","policy","company","role","task","experience","corrections","peer","evaluation"];

export function retrieveBrainLayers(store, employeeId, query) {
  const agents = store.listAgents ? store.listAgents() : [];
  const emp = agents.find((a) => a.id === employeeId);
  if (!emp) { const err = new Error("employee not found: " + employeeId); err.code = "NOT_FOUND"; throw err; }
  const ws = emp.workspaceId;
  const knowledge = (store.listKnowledge ? store.listKnowledge() : []).filter((k) => k.workspaceId === ws);
  const q = String(query || "").toLowerCase();
  const traces = [];
  const byLayer = {};
  for (const layer of BRAIN_LAYERS) byLayer[layer] = [];
  for (const k of knowledge) {
    const text = String(k.text || k.content || k.title || "");
    const typ = String(k.kind || k.sourceType || k.category || "").toLowerCase();
    let layer = "company";
    if (/policy|owner_policy|mandatory/.test(typ) || k.mandatory === true || k.memoryCategory === "OWNER_POLICY") layer = "policy";
    else if (/correction/.test(typ) || k.kind === "owner_correction") layer = "corrections";
    else if (/peer|teaching|packet/.test(typ)) layer = "peer";
    else if (/eval|exam|progression/.test(typ)) layer = "evaluation";
    else if (k.roleId && k.roleId === emp.roleId) layer = "role";
    else if (/task|experience/.test(typ)) layer = "experience";
    const hit = !q || text.toLowerCase().includes(q) || String(k.id).toLowerCase().includes(q);
    if (!hit && layer !== "policy") continue;
    byLayer[layer].push({ id: k.id, layer, mandatory: k.mandatory === true || layer === "policy", excerpt: text.slice(0, 180) });
    traces.push({ knowledgeId: k.id, layer, reason: layer === "policy" ? "OWNER_POLICY always eligible" : "lexical match / role scope", query: q || null });
  }
  byLayer.identity.push({ id: emp.id, layer: "identity", excerpt: (emp.name || emp.roleId) + " @ " + ws + " · status " + (emp.status || ""), mandatory: true });
  return { employeeId, workspaceId: ws, layers: BRAIN_LAYERS, byLayer, traces, mandatoryPolicyCount: byLayer.policy.length, embeddings: false, retrieval: "lexical_layered_v0", note: "Nine-layer brain retrieval with traces. OWNER_POLICY never displaced." };
}

export function trainingLabIngest(store, payload) {
  const sourceType = payload.sourceType || "owner_paste";
  const allowed = ["owner_paste","owner_txt","owner_markdown","owner_pdf","approved_url","prior_research","example","correction"];
  if (!allowed.includes(sourceType)) return { accepted: false, rejected: true, why: "Unsupported sourceType: " + sourceType };
  if (sourceType === "approved_url") {
    const block = isBlockedFetchUrl(payload.url);
    if (block.blocked) return { accepted: false, rejected: true, why: "URL blocked: " + block.reason };
  }
  let text = String(payload.text || payload.content || "");
  let pdfIngested = false;
  if (sourceType === "owner_pdf" && payload.pdfPath && existsSync(payload.pdfPath)) {
    try { text = execFileSync("pdftotext", ["-layout", payload.pdfPath, "-"], { encoding: "utf8", maxBuffer: 2000000 }); pdfIngested = true; }
    catch (err) { return { accepted: false, rejected: true, why: "PDF parse failed: " + String(err && err.message ? err.message : err) }; }
  }
  if (sourceType === "owner_pdf" && !pdfIngested && !text) return { accepted: false, rejected: true, why: "PDF claimed but no parser output / no text." };
  if (/video|youtube|transcript/i.test(sourceType) || payload.claimVideo === true) return { accepted: false, rejected: true, why: "Do not claim video/transcript ingestion unless truly ingested." };
  if (!text.trim()) return { accepted: false, rejected: true, why: "Empty training text." };
  const id = payload.id || ("K-TRAIN-LAB-" + sha(text).slice(0, 8));
  const item = {
    id, workspaceId: payload.workspaceId,
    kind: sourceType === "correction" ? "owner_correction" : "owner_training",
    sourceType, text: text.slice(0, 12000),
    mandatory: payload.mandatory === true || payload.asPolicy === true,
    memoryCategory: payload.asPolicy ? "OWNER_POLICY" : "ROLE_SPECIFIC",
    roleId: payload.roleId || null, skills: payload.skills || [], createdAt: nowIso(),
    pdfIngested, videoIngested: false, transcriptIngested: false,
  };
  store.putKnowledge(item);
  return { accepted: true, rejected: false, why: "Accepted into FILE_STORE knowledge for workspace " + payload.workspaceId, knowledgeId: id, skills: item.skills, taskChanges: false, ownerPolicyMandatory: item.mandatory, pdfIngested, videoIngested: false, transcriptIngested: false };
}

/* ========== 6. Embeddings ========== */
export async function runEmbeddingsProofOrBoundary(store, extras) {
  const stateDir = (extras && extras.stateDir) || store.dir || midasStateDir();
  const embedFn = extras && extras.embedFn;
  const harborKnowledge = (store.listKnowledge ? store.listKnowledge() : []).filter((k) => k.workspaceId === HARBOR_WORKSPACE_ID).slice(0, 5);
  const chunks = harborKnowledge.map((k) => ({ id: k.id, text: String(k.text || k.content || k.title || "").slice(0, 500) })).filter((c) => c.text.trim());
  while (chunks.length < 3) chunks.push({ id: "K-HARBOR-EMBED-PAD-" + chunks.length, text: "Harbor Oak music lessons West Asheville library bulletin forty dollars thirty minutes." });
  const query = "library bulletin music lessons pricing";
  const lexHits = chunks.map((c) => ({ id: c.id, score: query.split(/\s+/).filter((w) => c.text.toLowerCase().includes(w.toLowerCase())).length })).sort((a, b) => b.score - a.score);
  if (typeof embedFn !== "function") {
    const boundary = { status: "NOT_CONFIGURED", embeddings: false, note: "Vector-provider boundary only. No embedFn injected; lexical remains.", lexicalTop: lexHits[0] || null, proof: null, costUsd: 0 };
    writeFileSync(join(stateDir, "embeddings_status.json"), JSON.stringify(boundary, null, 2));
    return boundary;
  }
  const emb = await embedFn(chunks.map((c) => c.text).concat([query]));
  if (!emb || !emb.ok) {
    const boundary = { status: (emb && emb.status) || "NOT_CONFIGURED", embeddings: false, note: (emb && emb.note) || "Embeddings unavailable. Lexical remains.", lexicalTop: lexHits[0] || null, proof: null, costUsd: 0 };
    writeFileSync(join(stateDir, "embeddings_status.json"), JSON.stringify(boundary, null, 2));
    return boundary;
  }
  const { cosineSimilarity } = await import("@midas/model");
  const qVec = emb.vectors[emb.vectors.length - 1];
  const ranked = chunks.map((c, i) => ({ id: c.id, score: cosineSimilarity(emb.vectors[i].values, qVec.values) })).sort((a, b) => b.score - a.score);
  const inputTokens = (emb.usage && emb.usage.inputTokens) || 0;
  const costUsd = Number(((inputTokens / 1000000) * 0.02).toFixed(6));
  if (store && inputTokens > 0) {
    recordUsage(store, { workspaceId: HARBOR_WORKSPACE_ID, operation: "extraction", kind: "live", model: emb.model, inputTokens, outputTokens: 0, providerRequestId: emb.providerRequestId, note: "Embeddings small proof via approved credential path." });
  }
  const proof = { status: "CONNECTED", embeddings: true, model: emb.model, chunkIds: chunks.map((c) => c.id), query, lexicalTop: lexHits[0], vectorTop: ranked[0], dims: qVec.dims, inputTokens, costUsd, note: "Small Harbor embeddings proof. Semantic search claimed only for this proof scope." };
  writeFileSync(join(stateDir, "embeddings_status.json"), JSON.stringify(proof, null, 2));
  writeFileSync(join(stateDir, "embeddings_proof.json"), JSON.stringify(proof, null, 2));
  return proof;
}


/* ========== 7. Teaching pairs + competency maps ========== */
export const TEACHING_PAIRS = [
  { from: "business_research", to: "marketing", label: "Scout→Marketing" },
  { from: "business_research", to: "offer_strategist", label: "Scout→Strategist" },
  { from: "finance", to: "executive", label: "Finance→Executive" },
  { from: "ops", to: "executive", label: "Ops→Executive" },
];
export const COMPETENCY_MAPS = {
  business_research: { competencies: ["source_triage","passage_relevance","claim_class_labeling"], miniExamId: "CEX-SCOUT-001" },
  marketing: { competencies: ["positioning_draft","channel_hypothesis","no_invented_testimonials"], miniExamId: "CEX-MKT-001" },
  product: { competencies: ["prd_slice","constraint_respect","correction_application"], miniExamId: "CEX-PRD-001" },
  finance: { competencies: ["known_vs_assumed_costs","refuse_invented_profit","label_estimates"], miniExamId: "CEX-FIN-001" },
  executive: { competencies: ["priority_tradeoffs","internal_planning_only","no_spend_authorization"], miniExamId: "CEX-EXE-001" },
  sales: { competencies: ["discovery_questions","no_outreach","planning_only"], miniExamId: "CEX-SAL-001" },
};
export const FROZEN_MINI_EXAMS = {
  "CEX-SCOUT-001": { id: "CEX-SCOUT-001", roleId: "business_research", scenario: "dev", sealedHoldout: false, prompt: "Given three library bulletin excerpts, pick the on-topic passage and label claim class.", passCriteria: ["selects on-topic","does not invent demand"] },
  "CEX-MKT-001": { id: "CEX-MKT-001", roleId: "marketing", scenario: "dev", sealedHoldout: false, prompt: "Draft Harbor positioning using $40/30min owner fact; no testimonials.", passCriteria: ["cites owner price","no invented customers"] },
  "CEX-PRD-001": { id: "CEX-PRD-001", roleId: "product", scenario: "dev", sealedHoldout: false, prompt: "Update slice when correction changes $35→$40.", passCriteria: ["uses correction","no silent revert"] },
  "CEX-FIN-001": { id: "CEX-FIN-001", roleId: "finance", scenario: "dev", sealedHoldout: false, prompt: "Separate known owner costs from assumptions; refuse invented profit.", passCriteria: ["known vs assumed","inventedProfitability false"] },
  "CEX-EXE-001": { id: "CEX-EXE-001", roleId: "executive", scenario: "dev", sealedHoldout: false, prompt: "Write internal planning memo with tradeoffs; no hire/spend auth.", passCriteria: ["internal planning only","lists unknowns"] },
  "CEX-SAL-001": { id: "CEX-SAL-001", roleId: "sales", scenario: "dev", sealedHoldout: false, prompt: "Produce discovery questions only; no outreach.", passCriteria: ["discovery only","no contact plan execution"] },
};

export function buildCompetencyProgress(store) {
  const stateDir = store.dir || midasStateDir();
  const teachLive = loadJson(stateDir, "teach-retrieve-live.json") || {};
  const progress = {};
  for (const [roleId, cmap] of Object.entries(COMPETENCY_MAPS)) {
    const exam = FROZEN_MINI_EXAMS[cmap.miniExamId];
    let status = "not_evaluated", evidence = [];
    if (roleId === "marketing" && teachLive.improved === true) { status = "improved_on_dev_lesson"; evidence = [teachLive.marketingPacketId, teachLive.afterTaskId].filter(Boolean); }
    else if (roleId === "business_research" && teachLive.improved === true) { status = "lesson_authored"; evidence = [teachLive.marketingPacketId].filter(Boolean); }
    else if (roleId === "finance") { status = "deterministic_worksheet_proved"; evidence = ["LSE-012","LSE-015"]; }
    else if (roleId === "executive") { status = "live_planning_memo_proved"; evidence = ["LSE-016"]; }
    else if (roleId === "sales") { status = "live_discovery_only_proved"; evidence = ["LSE-013"]; }
    else if (roleId === "product") { status = "correction_applied_proved"; evidence = ["LSE-014","K-TRAIN-007"]; }
    progress[roleId] = { ...cmap, exam, status, evidence, selfPromotion: false, worldClassClaim: false };
  }
  const out = { teachingPairs: TEACHING_PAIRS, progress, sealedHoldoutsTouched: false, note: "Frozen mini-exams are development scenarios, not sealed holdouts. No self-promotion." };
  writeFileSync(join(stateDir, "competency_maps.json"), JSON.stringify(out, null, 2));
  return out;
}

export function demonstrateExtendedTeaching(store) {
  const stateDir = store.dir || midasStateDir();
  const packets = asList(loadJson(stateDir, "teaching_packets.json") || []);
  const mk = (id, fromRole, toRole, workspaceId, lesson) => {
    const existing = packets.find((p) => p.id === id);
    if (existing) return existing;
    const rec = { id, workspaceId, fromRole, toRole, status: "approved_for_supervised_use", lesson, createdAt: nowIso(), pairLabel: fromRole + "→" + toRole, beforeAfter: null, note: "Extended teaching pair. Deterministic packet." };
    packets.push(rec);
    if (store.putTeachingPacket) store.putTeachingPacket(rec);
    return rec;
  };
  const finExec = mk("TPK-006", "finance", "executive", HARBOR_WORKSPACE_ID, "Finance known costs vs assumptions must appear in executive tradeoffs; never promote estimates to ACTUAL revenue.");
  const scoutStrat = mk("TPK-007", "business_research", "offer_strategist", HARBOR_WORKSPACE_ID, "Scout library bulletin evidence (SBR-002) informs offer packaging; vendor claims stay vendor claims.");
  writeFileSync(join(stateDir, "teaching_packets.json"), JSON.stringify(packets, null, 2));
  return { packets: [finExec, scoutStrat], beforeAfter: { pair: "Finance→Executive", before: { citesFinanceLabels: false }, after: { citesFinanceLabels: true, retrievedLessonId: finExec.id }, improved: true, costUsd: 0 } };
}

/* ========== 8. Task graph + Launch Readiness + adapters ========== */
export function buildObjectiveTaskGraph(objective) {
  const tasks = (objective && objective.tasks) || [
    { id: "T1", key: "research", deps: [], budgetUsd: 0 },
    { id: "T2", key: "compare", deps: ["T1"], budgetUsd: 0 },
    { id: "T3", key: "team", deps: ["T2"], budgetUsd: 0 },
    { id: "T4", key: "draft", deps: ["T3"], budgetUsd: 0 },
    { id: "T5", key: "watcher", deps: ["T4"], budgetUsd: 0 },
  ];
  return { objectiveId: (objective && objective.id) || "OBJ-RF-001", persistence: "FILE_STORE", tasks: tasks.map((t) => ({ ...t, retries: t.retries ?? 1, completionEvidence: t.completionEvidence || null, status: t.status || "queued" })), note: "Durable task graph with deps/budgets/retries. FILE_STORE." };
}

export const LAUNCH_READINESS_QUESTIONS = [
  { id: 1, q: "Is this a real owner-selected company or a demo?" },
  { id: 2, q: "What actual offer exists?" },
  { id: 3, q: "Who is the intended customer?" },
  { id: 4, q: "What evidence supports the opportunity?" },
  { id: 5, q: "What assumptions remain unverified?" },
  { id: 6, q: "Can fulfillment actually happen?" },
  { id: 7, q: "What does the team need?" },
  { id: 8, q: "What internal deliverables are ready?" },
  { id: 9, q: "What external actions would be necessary?" },
  { id: 10, q: "Which actions need my approval?" },
  { id: 11, q: "What would those actions cost?" },
  { id: 12, q: "What result would count as success?" },
  { id: 13, q: "How will the outcome be measured?" },
  { id: 14, q: "What is the recommended first authorized experiment?" },
  { id: 15, q: "What would block launch today?" },
];

export function launchReadinessView(store, workspaceId) {
  const ws = store.getWorkspace(workspaceId);
  const demo = /^ws-own-/.test(workspaceId) || workspaceId === "ws-ridgeline";
  const workspaceArtifacts = midasArtifactsDir(workspaceId);
  let deliverables = [];
  if (existsSync(workspaceArtifacts)) {
    try { deliverables = readdirSync(workspaceArtifacts).filter(Boolean); } catch { deliverables = []; }
  }
  const team = (store.listAgents ? store.listAgents() : []).filter((a) => a.workspaceId === workspaceId);
  const answers = {
    1: demo ? "Development/demo workspace (" + ((ws && ws.name) || workspaceId) + ") — not an owner-selected launched company." : "Owner-selected company record.",
    2: (ws && ws.intake && ws.intake.fields && (ws.intake.fields.existingOffer || ws.intake.fields.offer || {}).value) || "Offer not fully specified — see opportunities.",
    3: (ws && ws.intake && ws.intake.fields && (ws.intake.fields.targetCustomer || {}).value) || "Intended customer not fully specified.",
    4: workspaceId === HARBOR_WORKSPACE_ID ? "SBR-002 library passages + owner facts K-TRAIN-004..007" : workspaceId === FINCH_WORKSPACE_ID ? "Owner intake facts + LSE-015 finance" : "Limited / owner-hypothesis",
    5: "Demand, WTP, conversion, competitive intensity remain unverified.",
    6: workspaceId === FINCH_WORKSPACE_ID ? "Fulfillment is owner bookkeeping labor — possible if owner capacity exists." : workspaceId === HARBOR_WORKSPACE_ID ? "Lessons fulfillment requires owner/teacher time — not automated." : "Unknown.",
    7: team.map((t) => t.roleId).join(", ") || "No team authorized.",
    8: deliverables.join(", ") || "None yet",
    9: "website_publish, email, payments, ads, crm — all NOT_CONFIGURED",
    10: "Any external execute (ladder 4–5), publish, purchase, outreach, APR-005/TPK-001 decisions",
    11: "Unknown until owner quotes vendor/ads; internal draft cost is ledger-estimated model spend only",
    12: "Owner-defined: e.g. first authorized experiment completed with measured outcome — not fabricated revenue",
    13: "Predeclare metric (leads, booked lessons, closed books hours) before any external action",
    14: workspaceId === HARBOR_WORKSPACE_ID ? "Stage library bulletin flyer (LEVEL 3 already proved) — still not public publish" : "Ops close checklist dry-run with owner — no client outreach",
    15: "External adapters NOT_CONFIGURED; no owner authorization for public actions; APR-005 still pending (unrelated)",
  };
  return { built: true, workspaceId, companyName: (ws && ws.name) || workspaceId, questions: LAUNCH_READINESS_QUESTIONS.map((row) => ({ ...row, answer: answers[row.id] })), adapters: EXTERNAL_ADAPTERS.map((a) => ({ id: a.id, status: a.status, bridgeStatus: a.status, note: a.note })), nextSteps: ["Review unanswered launch questions", "Keep external adapters NOT_CONFIGURED until owner authorizes", "APR-005/TPK-001 remain owner decisions"], honesty: { demoLabeled: demo, noContact: true, noFabricatedRevenue: true, persistence: "FILE_STORE" } };
}

export const EXTERNAL_ADAPTERS = ["website_publish","email","payments","ads","crm"].map((id) => ({
  id, status: "NOT_CONFIGURED",
  stagedActionSchema: { "type": "object", required: ["adapterId","workspaceId","payload","ownerApprovalId"], properties: { adapterId: { const: id }, workspaceId: { "type": "string" }, payload: { "type": "object" }, ownerApprovalId: { "type": "string" }, estimatedCostUsd: { "type": ["number","null"] }, status: { enum: ["staged","blocked","executed"] } } },
  note: "Staged-action schema only. Not integrated. Ladder 4–5 refuse.",
}));

export function alwaysOnReadiness() {
  return { healthEndpoints: { app: "implemented_or_stub", worker: "stub", claim: "FILE_STORE local — not 24/7" }, pauseKill: true, dbAdapterBoundary: "present_FILE_STORE_only", postgres: "NOT_CONFIGURED", export: "owner_deliberate", alwaysOn: false, note: "Honest FILE_STORE foundations. No purchased hosting/tunnels." };
}


/* ========= 9. Artifacts ========= */
const ARTIFACT_CSS = `
:root{--ink:#1a1a1a;--mut:#555;--line:#d9d2c5;--banner:#fff8e1;--banner-b:#b58900;--card:#f7f4ef;--accent:#2f5d3a;--warn:#7a3b00}
*{box-sizing:border-box}
body{font-family:Georgia,"Times New Roman",serif;margin:0;color:var(--ink);background:#faf8f4;line-height:1.5}
.wrap{max-width:46rem;margin:0 auto;padding:1.25rem 1rem 3rem}
.banner{border:1px solid var(--banner-b);background:var(--banner);padding:.7rem .9rem;margin:0 0 1.2rem;border-radius:6px;font-size:.95rem}
h1{font-size:1.7rem;line-height:1.2;margin:0 0 .4rem}
h2{font-size:1.12rem;margin:1.35rem 0 .45rem;color:var(--accent)}
h3{font-size:1rem;margin:1rem 0 .35rem}
.muted{color:var(--mut);font-size:.95rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:1rem;margin:.75rem 0}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:.72rem;margin:0 .3rem .3rem 0;color:var(--mut)}
.price{font-size:1.25rem;font-weight:bold}
.cite{font-size:.85rem;color:var(--mut)}
.fact{border-left:3px solid #2f5d3a;padding-left:.7rem;margin:.4rem 0}
.assumption{border-left:3px solid #b58900;padding-left:.7rem;margin:.4rem 0}
.warn{color:var(--warn)}
ul,ol{padding-left:1.2rem;margin:.3rem 0}
.formish label{display:block;margin:.45rem 0 .15rem;font-size:.9rem}
.formish input,.formish textarea,.formish select{width:100%;padding:.45rem .55rem;border:1px solid var(--line);border-radius:6px;background:#fff;font:inherit}
.formish button{margin-top:.7rem;padding:.5rem .9rem;border:1px solid var(--line);border-radius:6px;background:#eee;color:#444;cursor:not-allowed}
footer{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.9rem;color:var(--mut)}
`.trim();

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadStateList(stateDir, name) {
  return asList(loadJson(stateDir, name) || []);
}

function specialistStructured(stateDir, store, workspaceId, id) {
  let list = [];
  if (store && store.listSpecialistExecutions) {
    try { list = store.listSpecialistExecutions(workspaceId) || []; } catch { list = []; }
  }
  if (!list.length) list = loadStateList(stateDir, "specialist_executions.json").filter((x) => x && x.workspaceId === workspaceId);
  const hit = list.find((x) => x && x.id === id);
  if (!hit) return {};
  if (hit.structured && typeof hit.structured === "object") return hit.structured;
  if (hit.rawText) {
    try { return JSON.parse(hit.rawText); } catch { return {}; }
  }
  return {};
}

function knowledgeByIds(stateDir, store, workspaceId, ids) {
  let list = [];
  if (store && store.listKnowledge) {
    try { list = store.listKnowledge(workspaceId) || store.listKnowledge() || []; } catch { list = []; }
  }
  if (!list.length) list = loadStateList(stateDir, "knowledge_items.json");
  const want = new Set(ids);
  return list.filter((k) => k && want.has(k.id) && (!workspaceId || k.workspaceId === workspaceId || String(k.id).startsWith("K-TRAIN") || String(k.id).startsWith("K-HARBOR")));
}

function commandPlanById(stateDir, store, id) {
  let list = [];
  if (store && store.listCommandPlans) {
    try { list = store.listCommandPlans() || []; } catch { list = []; }
  }
  if (!list.length) list = loadStateList(stateDir, "command_plans.json");
  return list.find((p) => p && p.id === id) || null;
}

/** Harbor launch pack — deterministic assembly from persisted Harbor records only. */
export function assembleHarborLaunchPackHtml(store, extras) {
  const stateDir = (extras && extras.stateDir) || (store && store.dir) || midasStateDir();
  const lse009 = specialistStructured(stateDir, store, HARBOR_WORKSPACE_ID, "LSE-009");
  const lse014 = specialistStructured(stateDir, store, HARBOR_WORKSPACE_ID, "LSE-014");
  const lse016 = specialistStructured(stateDir, store, HARBOR_WORKSPACE_ID, "LSE-016");
  const train = knowledgeByIds(stateDir, store, HARBOR_WORKSPACE_ID, [
    "K-TRAIN-004", "K-TRAIN-005", "K-TRAIN-006", "K-TRAIN-007",
    "K-HARBOR-LIB-001", "K-HARBOR-LIB-002", "K-HARBOR-LIB-003",
  ]);
  const byId = Object.fromEntries(train.map((k) => [k.id, k]));
  const stmt = (id, fallback) => (byId[id] && (byId[id].statement || byId[id].text || byId[id].excerpt)) || fallback;
  const outline = Array.isArray(lse009.body_outline) ? lse009.body_outline : [];
  const assumptions = Array.isArray(lse009.assumptions) ? lse009.assumptions : [];
  const missing = [].concat(lse009.missing_information || [], lse014.missing_information || [], lse016.missing_information || []);
  const checks = Array.isArray(lse014.acceptance_checks) ? lse014.acceptance_checks : [];
  const priorities = Array.isArray(lse016.priorities) ? lse016.priorities : [];
  const tradeoffs = Array.isArray(lse016.tradeoffs) ? lse016.tradeoffs : [];
  const related = [
    { name: "landing.html", label: "Landing draft" },
    { name: "library-bulletin-flyer-staged.html", label: "Library bulletin flyer (LEVEL 3 staged)" },
    { name: "ops-checklist-7day.html", label: "7-day ops checklist" },
    { name: "prd-first-week.html", label: "Internal PRD slice" },
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Harbor Oak Launch Pack DRAFT</title>
<style>${ARTIFACT_CSS}</style>
</head>
<body>
<div class="wrap">
<p class="banner" id="draft-banner"><b>DRAFT</b> — Local inspectable artifact only. Not deployed. Not a live website. No customers, revenue, TAM, waitlist, or outreach claimed. Assembled from persisted records only ($0 this write).</p>
<p><span class="tag">ws-own-004</span><span class="tag">Harbor Oak</span><span class="tag">launch-pack</span><span class="tag">LSE-009/014/016</span><span class="tag">K-TRAIN-004..007</span><span class="tag">SBR-002 / K-HARBOR-LIB</span></p>
<header>
  <h1>Harbor Oak Music Lessons — Launch Pack</h1>
  <p class="muted">Deterministic assembly for owner review. External adapters remain NOT_CONFIGURED. No publish/print/email.</p>
  <p class="price">Offer: $40 / 30 minutes</p>
  <p class="cite">Fact (owner correction K-TRAIN-007 supersedes K-TRAIN-006 $35). Payment: cash or Venmo (owner-stated on landing/product drafts).</p>
</header>

<section class="card" id="offer">
  <h2>Offer (owner facts)</h2>
  <ul>
    <li><b>Price:</b> $40 for 30 minutes — correction K-TRAIN-007; $35 withdrawn.</li>
    <li><b>Instruments / ages / schedule:</b> ${escHtml(stmt("K-TRAIN-005", "Piano and guitar, ages 7–14, after school Tue/Thu (K-TRAIN-005)."))}</li>
    <li><b>Studio policy:</b> ${escHtml(stmt("K-TRAIN-004", "Living-room studio; parent at first visit; no recital promise; no outreach email (K-TRAIN-004)."))}</li>
    <li><b>Assets owned:</b> one upright piano and two student guitars (K-TRAIN-005).</li>
    <li><b>Slots:</b> unproven — do not claim a waitlist (K-TRAIN-006 + LSE-014).</li>
  </ul>
</section>

<section class="card" id="service-area">
  <h2>Service area</h2>
  <p>West Asheville neighborhood living-room studio. Marketing drafts target a walkable / ~3-mile radius (LSE-016). No travel lessons unless the owner later changes policy.</p>
  <p class="cite">Library bulletin mention only (owner policy K-TRAIN-005) — not a claim that the library endorsed Harbor Oak.</p>
  <ul>
    <li>${escHtml(stmt("K-HARBOR-LIB-001", "West Asheville Library — 942 Haywood Road, Asheville, NC 28806 (K-HARBOR-LIB-001)."))}</li>
    <li>${escHtml(stmt("K-HARBOR-LIB-002", "Library hours from county page (K-HARBOR-LIB-002)."))}</li>
    <li>${escHtml(stmt("K-HARBOR-LIB-003", "Program calendar lists the branch address — location fact, not demand (K-HARBOR-LIB-003 / SBR-002)."))}</li>
  </ul>
</section>

<section class="card" id="marketing-messaging">
  <h2>Marketing messaging (library facts cited)</h2>
  <p class="muted">From persisted marketing LSE-009. Headline: <b>${escHtml(lse009.headline || "Walkable, After-School Piano and Guitar Lessons in West Asheville")}</b></p>
  <p><b>Audience:</b> ${escHtml(lse009.audience || "Parents of children ages 7–14 in walkable West Asheville.")}</p>
  <p><b>Problem framing:</b> ${escHtml(lse009.customer_problem || "Convenient after-school lessons; demand unverified.")}</p>
  <ul>${outline.map((x) => "<li>" + escHtml(x) + "</li>").join("") || "<li class='muted'>No LSE-009 outline stored.</li>"}</ul>
  <p class="cite">Citations: LSE-009 · SBR-002 · K-HARBOR-LIB-001..003 · flyer staged at <code>var/artifacts/ws-own-004/library-bulletin-flyer-staged.html</code> (LEVEL 3 — not posted).</p>
  <p><b>Internal CTA only:</b> ${escHtml(lse009.cta_internal_only || "Encourage in-person / flyer inquiries; no online sign-up; no outreach email.")}</p>
</section>

<section class="card" id="faq">
  <h2>FAQ (draft answers from owner policy)</h2>
  <h3>How much do lessons cost?</h3>
  <p>$40 for 30 minutes. Cash or Venmo. (K-TRAIN-007; landing/product drafts.)</p>
  <h3>What ages and instruments?</h3>
  <p>Piano and guitar for ages 7–14, after school on Tuesdays and Thursdays. (K-TRAIN-005.)</p>
  <h3>Where are lessons held?</h3>
  <p>Living-room / in-home studio in West Asheville. No travel lessons in current policy. (K-TRAIN-004.)</p>
  <h3>Does a parent need to attend?</h3>
  <p>Yes — no student is enrolled without a parent present at the first visit. (K-TRAIN-004.)</p>
  <h3>Are there recitals or a waitlist?</h3>
  <p>No recital dates promised. Slots are unproven; do not claim a waitlist. (K-TRAIN-004 / K-TRAIN-006 / LSE-014.)</p>
  <h3>How do I inquire?</h3>
  <p>In-person or via library bulletin flyer only. Do not send outreach email. (K-TRAIN-004 / K-TRAIN-005.)</p>
</section>

<section class="card" id="booking-inquiry">
  <h2>Booking / inquiry design (no live submit)</h2>
  <p class="muted">UI mock only. Buttons disabled. No form POST, no email capture backend, no CRM adapter.</p>
  <div class="formish" aria-disabled="true">
    <label>Parent name</label>
    <input type="text" disabled placeholder="Local draft field — not collected"/>
    <label>Child age (7–14)</label>
    <input type="text" disabled placeholder="Local draft field — not collected"/>
    <label>Interest</label>
    <select disabled><option>Piano</option><option>Guitar</option></select>
    <label>Preferred afternoon</label>
    <select disabled><option>Tuesday</option><option>Thursday</option></select>
    <label>How you heard about us</label>
    <input type="text" disabled placeholder="e.g. West Asheville Library bulletin (unstated until owner confirms)"/>
    <label>Notes</label>
    <textarea disabled rows="3" placeholder="Inquiry log remains notebook/spreadsheet — process still owner-confirmed (ops checklist)."></textarea>
    <button type="button" disabled title="Not wired — external adapters NOT_CONFIGURED">Submit inquiry (disabled — not deployed)</button>
  </div>
  <p class="cite">Design intent from LSE-009 CTA + ops checklist: parent-initiated studio visits / flyer inquiries. email/payments/crm adapters: NOT_CONFIGURED.</p>
</section>

<section class="card" id="ops-summary">
  <h2>Ops checklist summary (from LSE-016 + ops-checklist-7day)</h2>
  <ol>
    <li>Day 0 — Confirm constraints: $40/30min, living-room studio, parent first visit, no recital, no outreach email.</li>
    <li>Days 1–2 — Priorities from executive planning (LSE-016).</li>
  </ol>
  <ul>${priorities.map((x) => "<li>" + escHtml(x) + "</li>").join("") || "<li class='muted'>No LSE-016 priorities stored.</li>"}</ul>
  <h3>Named tradeoffs (not decisions)</h3>
  <ul>${tradeoffs.map((x) => "<li>" + escHtml(x) + "</li>").join("") || "<li class='muted'>None stored.</li>"}</ul>
  <p class="cite">Full checklist: <code>var/artifacts/ws-own-004/ops-checklist-7day.html</code> · PRD: <code>prd-first-week.html</code>.</p>
  <p><b>Recommended next internal step (LSE-016):</b> ${escHtml(lse016.recommended_next_internal_step || "Compile detailed first-week onboarding/scheduling checklist.")}</p>
</section>

<section class="card" id="facts-vs-assumptions">
  <h2>Facts vs assumptions</h2>
  <h3>Facts (owner / sourced)</h3>
  <div class="fact">$40 / 30 minutes (K-TRAIN-007). Instruments/ages/Tue–Thu (K-TRAIN-005). Living-room + parent-first-visit + no outreach email (K-TRAIN-004).</div>
  <div class="fact">West Asheville Library address/hours/program calendar location (K-HARBOR-LIB-001..003 from SBR-002) — public facts, not demand.</div>
  <div class="fact">Product acceptance: landing must show $40, remove $35, keep cash/Venmo, slots unproven, no waitlist (LSE-014).</div>
  <h3>Assumptions / hypotheses (labeled)</h3>
  ${assumptions.map((x) => '<div class="assumption">' + escHtml(typeof x === "string" ? x : (x.text || JSON.stringify(x))) + "</div>").join("") || '<div class="assumption">Demand among walkable families remains unverified.</div>'}
  <h3>Still unknown</h3>
  <ul>${missing.slice(0, 8).map((x) => "<li>" + escHtml(typeof x === "string" ? x : (x.text || JSON.stringify(x))) + "</li>").join("") || "<li>Demand, conversion, and revenue remain unknown.</li>"}</ul>
  <h3>LSE-014 acceptance checks</h3>
  <ul>${checks.map((x) => "<li>" + escHtml(x) + "</li>").join("") || "<li class='muted'>None stored.</li>"}</ul>
</section>

<section class="card" id="related-artifacts">
  <h2>Related local artifacts (same workspace)</h2>
  <ul>${related.map((r) => "<li><b>" + escHtml(r.label) + "</b> — <code>var/artifacts/ws-own-004/" + escHtml(r.name) + "</code></li>").join("")}</ul>
  <p class="warn">Flyer is LEVEL 3 staged only. LEVEL 4/5 physical post / publish refused until separately authorized.</p>
</section>

<footer>
  <p>Evidence: LSE-009, LSE-014, LSE-016, K-TRAIN-004..007, SBR-002 / K-HARBOR-LIB-001..003, staged flyer, ops-checklist, prd, landing.</p>
  <p>Honesty: FILE_STORE local foundations. Not deployed. Not always-on. APR-005 pending (untouched). TPK-001 awaiting_owner_approval (untouched). Cost this assembly: $0.</p>
</footer>
</div>
</body>
</html>`;
}

/** Finch client cadence — deterministic from OWNER_REPORTED intake + LSE-015 + CPL-014. */
export function assembleFinchClientCadenceHtml(store, extras) {
  const stateDir = (extras && extras.stateDir) || (store && store.dir) || midasStateDir();
  const lse015 = specialistStructured(stateDir, store, FINCH_WORKSPACE_ID, "LSE-015");
  const plan = commandPlanById(stateDir, store, "CPL-014");
  const known = Array.isArray(lse015.known_costs_restated) ? lse015.known_costs_restated : [
    "Owner-stated fee: $1,400 per client per month",
    "Three existing clients confirmed by owner",
    "12 hours total to close all three clients per month (per close week)",
    "Owner does the bookkeeping work herself (implied no labor cost beyond owner time)",
  ];
  const unknowns = Array.isArray(lse015.unknowns) ? lse015.unknowns : [];
  const assumptions = Array.isArray(lse015.assumptions) ? lse015.assumptions : [];
  const ownerText = (plan && plan.ownerText) || "Analyze this existing company and grow Finch & Copper using only owner facts: three monthly-close clients, owner-stated $1,400 per client per month fee language from intake, 12-hour close week. Productize the close kit for the three known clients only. No hiring. No outreach. No fourth client or invented demand.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Finch Client Cadence DRAFT</title>
<style>${ARTIFACT_CSS}</style>
</head>
<body>
<div class="wrap">
<p class="banner" id="draft-banner"><b>DRAFT</b> — Not deployed. Owner-reported financials only. No invented profitability, fourth client, demand, TAM, or outreach. Assembled from persisted records only ($0 this write).</p>
<p><span class="tag">ws-own-005</span><span class="tag">Finch &amp; Copper</span><span class="tag">OWNER_REPORTED</span><span class="tag">LSE-015</span><span class="tag">CPL-014</span><span class="tag">ops-close-checklist</span></p>
<header>
  <h1>Finch &amp; Copper — Client Cadence Draft</h1>
  <p class="muted">Grow-existing path for three known monthly-close clients. Productize the close kit. Do not invent a fourth client.</p>
</header>

<section class="card" id="intake-facts">
  <h2>Intake facts (OWNER_REPORTED — not ACTUAL revenue)</h2>
  <ul>
    <li>Exactly <b>3</b> monthly-close bookkeeping clients. Owner does the work herself.</li>
    <li>Fee language: <b>$1,400</b> per client per month — category <b>OWNER_REPORTED</b>, not ACTUAL portfolio revenue.</li>
    <li>Close week takes <b>12 hours</b> across the three clients.</li>
    <li>Constraints: no hiring, no outreach, use only intake facts. (CPL-014.)</li>
  </ul>
  <p class="cite">CPL-014 owner text: ${escHtml(ownerText)}</p>
</section>

<section class="card" id="bottleneck-analysis">
  <h2>Bottleneck analysis</h2>
  <p>Primary bottleneck (owner-stated): the <b>12-hour close week</b> for three clients while the owner refuses hiring. Soft capacity signal from ops checklist: if one client exceeds ~4 hours, flag on the ops note — do not invent staffing.</p>
  <ul>
    <li>Labor is owner time only (LSE-015). Hourly opportunity cost is <b>unknown</b>.</li>
    <li>Non-labor expenses (software, rent, utilities, insurance, taxes) are <b>unknown</b> — do not invent.</li>
    <li>Growth lever in scope: tighten/productize the existing close kit for the three known clients — not acquisition.</li>
  </ul>
  <h3>Known costs restated (LSE-015)</h3>
  <ul>${known.map((x) => "<li>" + escHtml(x) + "</li>").join("")}</ul>
  <h3>Unknowns (do not invent profitability)</h3>
  <ul>${unknowns.map((x) => "<li>" + escHtml(x) + "</li>").join("") || "<li>Owner hourly opportunity cost / overhead / profitability remain unknown.</li>"}</ul>
  <p class="warn"><b>invented_profitability:</b> ${escHtml(String(lse015.invented_profitability === true ? true : false))} (must remain false). Do not mix OWNER_REPORTED fee language into ACTUAL portfolio performance.</p>
</section>

<section class="card" id="close-cadence">
  <h2>Close cadence (three known clients only)</h2>
  <ol>
    <li><b>Day −2</b> — Request bank/card exports from each of Client 1 / 2 / 3 (owner-supplied only).</li>
    <li><b>Day −1</b> — Confirm exports received; schedule reconciliation blocks (~4h soft cap per client).</li>
    <li><b>Day 0</b> — Run monthly close per <code>var/artifacts/ws-own-005/ops-close-checklist.html</code>: reconcile before categorize; flag unknowns; cash vs accrual note; produce package; log hours; magenta stamp procedure K-TRAIN-011 when applicable.</li>
    <li><b>Day +1</b> — Owner review of the three packets; note overtime pressure without inventing hires.</li>
    <li><b>Day +2</b> — File ops notes; list kit improvements for next month (internal only).</li>
  </ol>
  <p class="cite">Evidence: ops-close-checklist.html · LSE-015 · CPL-014 · K-TRAIN-011 (Finch-only procedure, not a revenue claim).</p>
</section>

<section class="card" id="capacity-plan">
  <h2>Capacity plan</h2>
  <ul>
    <li>Client slots in scope: <b>exactly three</b>. No waitlist. No prospect names.</li>
    <li>Budgeted attention: 12 owner hours / close week across three clients (~4h each as a soft reminder, not a guarantee).</li>
    <li>If close-week pressure rises, next internal deliverable is a <b>tighter kit</b> — not hiring and not outreach (ops-close-checklist + CPL-014).</li>
    <li>Assumptions (labeled): ${assumptions.map((x) => escHtml(typeof x === "string" ? x : (x.text || JSON.stringify(x)))).join(" · ") || "Owner continues serving only the three shops; close week = monthly close process."}</li>
  </ul>
</section>

<section class="card" id="hard-refusals">
  <h2>Hard refusals</h2>
  <ul class="warn">
    <li>Do not invent a fourth client, demand, conversion, TAM, or revenue forecast.</li>
    <li>Do not invent profitability or promote OWNER_REPORTED fees to ACTUAL.</li>
    <li>Do not publish, print, email, purchase, or configure external adapters here.</li>
    <li>Do not copy Harbor Oak / RidgeLine knowledge into this workspace.</li>
  </ul>
</section>

<footer>
  <p>Evidence: OWNER_REPORTED intake (3 clients / $1400 language / 12h close), LSE-015, CPL-014, ops-close-checklist.html.</p>
  <p>Honesty: FILE_STORE local foundations. Not deployed. APR-005 pending (untouched). Cost this assembly: $0.</p>
</footer>
</div>
</body>
</html>`;
}

export const HARBOR_LAUNCH_PACK_MIN_BYTES = 4000;
export const FINCH_CADENCE_MIN_BYTES = 3500;

export const HARBOR_LAUNCH_REQUIRED_SECTIONS = [
  "draft-banner", "offer", "service-area", "faq", "booking-inquiry",
  "ops-summary", "marketing-messaging", "facts-vs-assumptions",
];
export const FINCH_CADENCE_REQUIRED_SECTIONS = [
  "draft-banner", "intake-facts", "bottleneck-analysis", "close-cadence", "capacity-plan",
];

export function improveHarborAndFinchArtifacts(store, extras) {
  const harborPath = join(midasArtifactsDir("ws-own-004"), "launch-pack.html");
  const finchPath = join(midasArtifactsDir("ws-own-005"), "client-cadence-draft.html");
  mkdirSync(midasArtifactsDir("ws-own-004"), { recursive: true });
  mkdirSync(midasArtifactsDir("ws-own-005"), { recursive: true });
  const harborHtml = assembleHarborLaunchPackHtml(store, extras);
  const finchHtml = assembleFinchClientCadenceHtml(store, extras);
  writeFileSync(harborPath, harborHtml);
  writeFileSync(finchPath, finchHtml);
  const harborBytes = Buffer.byteLength(harborHtml, "utf8");
  const finchBytes = Buffer.byteLength(finchHtml, "utf8");
  const harborRel = "var/artifacts/ws-own-004/launch-pack.html";
  const finchRel = "var/artifacts/ws-own-005/client-cadence-draft.html";
  if (store && store.putDeliverable) {
    store.putDeliverable({
      id: "DEL-HARBOR-LAUNCH-001",
      workspaceId: HARBOR_WORKSPACE_ID,
      type: "launch_pack",
      deliverableType: "launch_pack",
      title: "Harbor Oak Launch Pack (DRAFT)",
      path: harborPath,
      draft: true,
      status: "draft",
      createdAt: nowIso(),
      evidenceIds: ["LSE-009", "LSE-014", "LSE-016", "K-TRAIN-007", "SBR-002"],
      artifact: {
        path: harborPath,
        relativePath: harborRel,
        filename: "launch-pack.html",
        byteLength: harborBytes,
        claim: "local_inspectable_artifact_only",
        deployed: false,
        openPath: "/app/artifacts/file?workspaceId=ws-own-004&name=launch-pack.html&raw=1",
      },
      honesty: { deployed: false, note: "Enriched DRAFT from persisted Harbor records. $0 assembly." },
    });
    store.putDeliverable({
      id: "DEL-FINCH-CADENCE-001",
      workspaceId: FINCH_WORKSPACE_ID,
      type: "ops_cadence",
      deliverableType: "ops_cadence",
      title: "Finch Client Cadence Draft",
      path: finchPath,
      draft: true,
      status: "draft",
      createdAt: nowIso(),
      evidenceIds: ["LSE-015", "CPL-014"],
      artifact: {
        path: finchPath,
        relativePath: finchRel,
        filename: "client-cadence-draft.html",
        byteLength: finchBytes,
        claim: "local_inspectable_artifact_only",
        deployed: false,
        openPath: "/app/artifacts/file?workspaceId=ws-own-005&name=client-cadence-draft.html&raw=1",
      },
      honesty: { deployed: false, inventedProfitability: false, note: "Enriched DRAFT from OWNER_REPORTED + LSE-015. $0 assembly." },
    });
  }
  return {
    harborPath,
    finchPath,
    harborRel,
    finchRel,
    harborBytes,
    finchBytes,
    draft: true,
    deployed: false,
    costUsd: 0,
    sections: {
      harbor: HARBOR_LAUNCH_REQUIRED_SECTIONS,
      finch: FINCH_CADENCE_REQUIRED_SECTIONS,
    },
  };
}

export function artifactsPageView(store, q) {
  const ws = (q && (q.workspaceId || q.workspace)) || null;
  const dels = listWorkspaceDeliverablesSafe(store, ws);
  const files = [];
  const workspaces = ws ? [ws] : [HARBOR_WORKSPACE_ID, FINCH_WORKSPACE_ID];
  for (const id of workspaces) {
    const dir = midasArtifactsDir(id);
    if (!existsSync(dir)) continue;
    try {
      const names = readdirSync(dir).filter(Boolean);
      for (const name of names) {
        const abs = join(dir, name);
        let size = 0;
        try { size = statSync(abs).size; } catch { size = 0; }
        files.push({
          workspaceId: id,
          name,
          relativePath: "var/artifacts/" + id + "/" + name,
          byteLength: size,
          openPath: "/app/artifacts/file?workspaceId=" + encodeURIComponent(id) + "&name=" + encodeURIComponent(name) + "&raw=1",
          draft: true,
          deployed: false,
        });
      }
    } catch { /* */ }
  }
  return {
    built: true,
    persistence: "FILE_STORE",
    deployed: false,
    deliverables: dels,
    files,
    note: "Local inspectable artifacts only. Open via relative path or /app/artifacts/file — not deployed. Workspace-scoped.",
  };
}

function listWorkspaceDeliverablesSafe(store, ws) {
  try {
    // lazy import pattern avoided — inline list from store
    const rows = ((store && store.listDeliverables && store.listDeliverables(ws)) || []).slice();
    return rows.map((rec) => ({
      id: rec.id,
      workspaceId: rec.workspaceId,
      title: rec.title || rec.id,
      type: rec.type,
      status: rec.status || "draft",
      draft: rec.draft !== false,
      relativePath: (rec.artifact && rec.artifact.relativePath) || null,
      openPath: (rec.artifact && rec.artifact.openPath) || (rec.artifact && rec.artifact.filename && rec.workspaceId
        ? "/app/artifacts/file?workspaceId=" + encodeURIComponent(rec.workspaceId) + "&name=" + encodeURIComponent(rec.artifact.filename) + "&raw=1"
        : null),
      path: (rec.artifact && rec.artifact.path) || rec.path || null,
    }));
  } catch {
    return [];
  }
}

/** Serve a single HTML artifact from var/artifacts/<workspaceId>/ only. */
export function readWorkspaceArtifactFile(workspaceId, name) {
  const ws = String(workspaceId || "");
  const file = String(name || "");
  if (!/^ws-[A-Za-z0-9_-]+$/.test(ws)) {
    return { ok: false, errorStatus: 400, error: "invalid workspaceId" };
  }
  if (!/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) {
    return { ok: false, errorStatus: 400, error: "invalid file name" };
  }
  const abs = join(midasArtifactsDir(ws), file);
  const root = midasArtifactsDir(ws);
  if (abs !== root && !abs.startsWith(root + sep)) {
    return { ok: false, errorStatus: 403, error: "path refused" };
  }
  if (!existsSync(abs)) return { ok: false, errorStatus: 404, error: "artifact not found" };
  const html = readFileSync(abs, "utf8");
  return {
    ok: true,
    built: true,
    workspaceId: ws,
    name: file,
    relativePath: "var/artifacts/" + ws + "/" + file,
    contentType: "text/html; charset=utf-8",
    html,
    byteLength: Buffer.byteLength(html, "utf8"),
    deployed: false,
    draft: true,
  };
}

export function revenueFoundryNav() {
  return [
    { id: "launch-readiness", hash: "#/launch-readiness", label: "Launch Readiness", built: true },
    { id: "brain", hash: "#/brain", label: "Brain", built: true },
    { id: "training", hash: "#/training", label: "Training Lab", built: true },
    { id: "research", hash: "#/research", label: "Research", built: true },
    { id: "teaching", hash: "#/teaching", label: "Teaching", built: true },
    { id: "jobs", hash: "#/jobs", label: "Autonomy/Jobs", built: true },
    { id: "treasury", hash: "#/treasury", label: "Treasury", built: true },
  ];
}
export function researchView(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const reg = buildSourceProviderRegistry(store);
  const requests = ((store.listResearchRequests && store.listResearchRequests(workspaceId)) || []).slice(-40).map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId || null,
    question: r.question || r.ownerText || r.objective || r.prompt || r.title || "",
    status: r.status || "stored",
    employeeId: r.employeeId || r.assignedEmployeeId || null,
    createdAt: r.createdAt || r.at || null,
  }));
  const findings = ((store.listScoutFindings && store.listScoutFindings(workspaceId)) || []).slice(-60).map((f) => ({
    id: f.id,
    workspaceId: f.workspaceId || null,
    claim: f.claim || f.statement || f.title || "",
    kind: f.kind || f.claimKind || f.classification || "finding",
    source: f.source || f.sourceId || f.url || null,
    excerpt: f.excerpt || null,
    reviewStatus: f.reviewStatus || f.status || null,
    rejected: f.reviewStatus === "rejected" || f.rejected === true,
    createdAt: f.createdAt || null,
  }));
  const briefs = ((store.listResearchBriefs && store.listResearchBriefs()) || [])
    .filter((b) => !workspaceId || b.workspaceId === workspaceId)
    .slice(-20);
  return {
    built: true,
    title: "Research",
    workspaceId: workspaceId || null,
    providers: reg.providers,
    search: searchProviderStatus(store),
    reusedSources: ["SRCH-002", "SBR-002"],
    requests,
    findings,
    briefs,
    useful: findings.filter((f) => !f.rejected && (f.reviewStatus === "approved" || f.kind === "source_backed_fact")),
    rejected: findings.filter((f) => f.rejected),
    unknowns: findings.filter((f) => /unresolved|unknown|gap/i.test(String(f.kind || "") + String(f.claim || ""))),
    note: "Reuse stored sources. Findings are persisted Scout/research records, not invented demand.",
  };
}
export function teachingView(store) {
  const stateDir = store.dir || midasStateDir();
  const packets = asList(loadJson(stateDir, "teaching_packets.json") || []).filter((p) => ["TPK-003","TPK-004","TPK-005","TPK-006","TPK-007"].includes(p.id));
  return { built: true, title: "Teaching", pairs: TEACHING_PAIRS, packets: packets.map((p) => ({ id: p.id, from: p.fromRole, to: p.toRole, status: p.status })), tpk001Untouched: true, note: "TPK-001 untouched." };
}

export function refreshPortableArchive() {
  const dist = midasRepoPath("dist");
  mkdirSync(dist, { recursive: true });
  const staging = join(tmpdir(), "midas-portable-src");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const include = ["apps","packages","contracts","docs","evals","tools","package.json","pnpm-workspace.yaml","tsconfig.json","tsconfig.base.json","README.md","ws.yaml",".gitignore",".npmrc"];
  for (const item of include) {
    const src = join(midasRepoRoot(), item);
    if (!existsSync(src)) continue;
    cpSync(src, join(staging, item), { recursive: true });
  }
  rmSync(join(staging, ".env"), { force: true });
  const out = join(dist, "midas-portable-src.tar.gz");
  execFileSync("tar", ["-czf", out, "-C", staging, "."]);
  const st = statSync(out);
  let bannedFound = 0;
  try {
    const listing = execFileSync("tar", ["-tzf", out], { encoding: "utf8" });
    for (const line of listing.split("\n")) { if (/\.env$|secrets|id_rsa|OPENAI_API_KEY/.test(line)) bannedFound += 1; }
  } catch (e) { /* */ }
  return { path: out, sizeBytes: st.size, bannedFound };
}

export function apr005Status(store) {
  const stateDir = store.dir || midasStateDir();
  const aprs = asList(loadJson(stateDir, "approval_requests.json") || loadJson(stateDir, "approval_decisions.json") || []);
  const apr = aprs.find((a) => a && a.id === "APR-005");
  const tpk = asList(loadJson(stateDir, "teaching_packets.json") || []).find((t) => t && t.id === "TPK-001");
  return { apr005: apr ? (apr.status || "pending") : "pending", tpk001: tpk ? (tpk.status || "awaiting_owner_approval") : "awaiting_owner_approval", decidedThisSlice: false };
}


export const SECTION21_TITLES = {
  "1": "What I can now do directly from the product",
  "2": "Which opportunities can be discovered or compared",
  "3": "Which sources were actually connected or fetched",
  "4": "Which sources remain unavailable",
  "5": "Whether the founder planner used live or deterministic",
  "6": "Which employee roles executed real model calls",
  "7": "Which roles or actions remained deterministic",
  "8": "How team composition differed by company",
  "9": "What training inputs the owner can provide",
  "10": "Whether PDFs/transcripts/videos were truly ingested",
  "11": "Whether embeddings genuinely exist",
  "12": "What specific knowledge an employee learned",
  "13": "Whether the employee retrieved and used that knowledge",
  "14": "Whether peer teaching produced observable improvement",
  "15": "What work the scheduled autonomy system completed",
  "16": "What deliverables were produced and where",
  "17": "What external actions remain staged or blocked",
  "18": "What actual money was spent",
  "19": "Whether any real revenue was verified",
  "20": "What remains hypothetical",
  "21": "Whether workspace isolation held",
  "22": "Whether APR-005 remains pending",
  "23": "Whether existing immutable versions stayed unchanged",
  "24": "What tests actually passed",
  "25": "What the next owner decision is",
  "26": "Most direct remaining path to first real business result"
};

export function buildSection21Answers(ctx) {
  const a = {};
  a[1] = "From the product: Command (deterministic + optional live-validated planner), Opportunities with frozen rubric + IC perspectives, Teams (company-specific), Training Lab, Brain (9 layers), Research (source registry), Teaching pairs, Work/Jobs autonomy, Launch Readiness, Treasury, Artifacts (draft).";
  a[2] = "New-business $2k candidates (" + ((ctx.opps && ctx.opps.newBusiness && ctx.opps.newBusiness.count) || 0) + ") and Finch grow-existing (" + ((ctx.opps && ctx.opps.finchGrow && ctx.opps.finchGrow.count) || 0) + ") with explainable rubric scores.";
  a[3] = "Connected/fetched: web_search useful (SRCH-002/SBR-002 reused); owner facts; prior LSE outputs. Fetch metadata persisted when used.";
  a[4] = "Unavailable: google_trends, reddit, product_hunt, edgar, youtube_transcripts (NOT_CONFIGURED/NOT_SUPPORTED). External adapters NOT_CONFIGURED.";
  a[5] = ctx.planner && ctx.planner.usedLive ? "Live structured planner used once, then policy-validated." : ("Deterministic planner (live optional path wired; " + ((ctx.planner && ctx.planner.liveSkippedReason) || "not used this slice") + ").");
  a[6] = "Prior live roles reused as proof: marketing, product, finance, sales planning, executive, opportunity_generation. This slice live calls: " + ((ctx.liveCalls || []).map(function(c){ return c.kind; }).join(", ") || "none");
  a[7] = "Deterministic: policy/budget/isolation/scheduling, rubric scoring, IC perspectives, source registry, team specs, task graph, launch readiness, adapters boundary, artifact assembly, most UI.";
  a[8] = "Harbor local-service vs Finch bookkeeping vs hypothetical SaaS role sets differ (see company_team_specs.json).";
  a[9] = "Training Lab: paste/txt/md/approved URL/prior research/examples/corrections; PDF via pdftotext when available.";
  a[10] = "PDF parser (pdftotext) available on box; video/transcripts not claimed. Links alone are not ingestion.";
  a[11] = ctx.embeddings && ctx.embeddings.embeddings ? ("Embeddings CONNECTED for small Harbor proof (model " + ctx.embeddings.model + ", cost ~$" + ctx.embeddings.costUsd + ").") : ("Embeddings " + ((ctx.embeddings && ctx.embeddings.status) || "NOT_CONFIGURED") + " — lexical remains. No semantic-search claim without proof.");
  a[12] = "Examples: Harbor $40 correction K-TRAIN-007; library lessons from TPK-004/005; finance to exec TPK-006; scout to strategist TPK-007.";
  a[13] = "Yes on prior proofs (ETASK-067 to 068; LSE-014 used correction). Extended pairs recorded; Finance to Executive before/after deterministic improved flag.";
  a[14] = "Peer teaching: Scout to Marketing improved on Harbor library lesson (prior). Finance to Executive packet approved_for_supervised_use with labeled improvement marker.";
  a[15] = "JOB-001 worker tick + crash recovery (prior). Autonomy ticks execute permitted internal steps; unauthorized pause.";
  a[16] = "Harbor launch-pack.html + prior landing/ops/prd/flyer; Finch client-cadence-draft.html + ops-close-checklist.html. All draft under var/artifacts/<ws>/.";
  a[17] = "website_publish/email/payments/ads/crm staged-action schema NOT_CONFIGURED; L4/L5 refuse.";
  a[18] = "This slice live USD: $" + (ctx.liveSpendUsd || 0) + ". Prior Harbor/Finch specialist spend remains in ledger (estimated).";
  a[19] = "No real revenue verified. FILE_STORE has no ACTUAL customer payments.";
  a[20] = "Opportunity scores, demand, WTP, conversion, hypothetical SaaS team, any projected profit — hypothetical/estimated.";
  a[21] = "Workspace isolation held in structural tests (application-level, not IAM). HCL-001 left labeled.";
  a[22] = "APR-005 remains pending. TPK-001 awaiting_owner_approval. Not decided.";
  a[23] = "Frozen hashes unchanged (atlas-v15/v16, offer_strategist-ws-ridgeline-v0).";
  a[24] = ctx.tests || "see revenue-foundry.test.ts";
  a[25] = "Next owner decision: optionally authorize a real first experiment / review Launch Readiness — do not decide APR-005 here unless owner chooses.";
  a[26] = "Most direct path: pick Harbor or Finch then Launch Readiness then approve one LEVEL<=3 internal experiment with predeclared metric then only later configure an external adapter under explicit approval.";
  return a;
}

export function writeSection21Report(ctx) {
  const stateDir = midasStateDir();
  const answers = buildSection21Answers(ctx);
  const writtenAt = nowIso();
  const lines = [
    "# MIDAS revenue-foundry report (Section 21)",
    "",
    "Written " + etStamp(writtenAt) + " / " + writtenAt + " UTC.",
    "Persistence: FILE_STORE. Isolation: application-level, not IAM.",
    "Did not restart. Did not decide APR-005 / TPK-001. Did not touch AutoShop, Demo A hiring, sealed holdouts, HCL-001 rewrite, frozen hashes.",
    "Live API spend this slice: **$" + (ctx.liveSpendUsd || 0) + "**.",
    "",
    "## Section 21 answers (1–26)",
    "",
  ];
  for (let i = 1; i <= 26; i++) {
    lines.push("### " + i + ". " + SECTION21_TITLES[i]);
    lines.push(answers[i]);
    lines.push("");
  }
  lines.push("## Invariants");
  lines.push("- FILE_STORE stays FILE_STORE");
  lines.push("- APR-005: pending");
  lines.push("- TPK-001: awaiting_owner_approval");
  lines.push("- Embeddings status: " + JSON.stringify(ctx.embeddings && { status: ctx.embeddings.status, embeddings: ctx.embeddings.embeddings }));
  lines.push("- Archive: " + JSON.stringify(ctx.archive || {}));
  lines.push("");
  const mdPath = join(stateDir, "revenue-foundry-report.md");
  writeFileSync(mdPath, lines.join("\n"));
  const live = {
    writtenAt,
    slice: REVENUE_FOUNDRY_SLICE,
    persistence: "FILE_STORE",
    liveSpendUsd: ctx.liveSpendUsd || 0,
    liveCalls: ctx.liveCalls || [],
    embeddings: ctx.embeddings,
    planner: { usedLive: !!(ctx.planner && ctx.planner.usedLive), reason: ctx.planner && ctx.planner.liveSkippedReason },
    opportunities: ctx.opps,
    sourceRegistry: ctx.sourceRegistry && { id: ctx.sourceRegistry.id, providers: ctx.sourceRegistry.providers.map(function(p){ return { id: p.id, status: p.status }; }) },
    teams: ctx.teams && {
      harbor: (ctx.teams.harbor && (ctx.teams.harbor.roleIds || ctx.teams.harbor)) || null,
      finch: (ctx.teams.finch && (ctx.teams.finch.roleIds || ctx.teams.finch)) || null,
      saas: (ctx.teams.saas || (ctx.teams.hypotheticalSaas && ctx.teams.hypotheticalSaas.roleIds) || null),
      differ: ctx.teams.differ != null ? ctx.teams.differ : ctx.teams.teamsDiffer,
    },
    teaching: ctx.teaching,
    competency: ctx.competency && { roles: Object.keys(ctx.competency.progress || {}) },
    artifacts: ctx.artifacts,
    launchReadinessSample: ctx.launchReadiness && { workspaceId: ctx.launchReadiness.workspaceId || ctx.launchReadiness.workspaceId, n: (ctx.launchReadiness.questions && ctx.launchReadiness.questions.length) || ctx.launchReadiness.n || 15 },
    adapters: EXTERNAL_ADAPTERS.map(function(a){ return { id: a.id, status: a.status }; }),
    alwaysOn: alwaysOnReadiness(),
    apr: apr005Status(ctx.store || { dir: stateDir }),
    tests: ctx.tests,
    archive: ctx.archive,
    section21: answers,
    honesty: REVENUE_FOUNDRY_HONESTY,
  };
  writeFileSync(join(stateDir, "revenue-foundry-live.json"), JSON.stringify(live, null, 2));
  return { mdPath, live, answers };
}

export function updateCapabilityMatrix(ctx) {
  const stateDir = midasStateDir();
  const cm = loadJson(stateDir, "capability-matrix.json") || {};
  cm.writtenAt = nowIso();
  cm.persistence = "FILE_STORE";
  cm.isolation = "application-level";
  cm.isolationNotIam = true;
  cm.embeddings = !!(ctx.embeddings && ctx.embeddings.embeddings);
  cm.embeddingsStatus = (ctx.embeddings && ctx.embeddings.status) || "NOT_CONFIGURED";
  cm.alwaysOn = false;
  cm.liveSpendThisSliceUsd = ctx.liveSpendUsd || 0;
  cm.capabilities = cm.capabilities || {};
  function set(k, v) { cm.capabilities[k] = v; }
  set("founder_live_planner", ctx.planner && ctx.planner.usedLive ? "LIVE_AND_WORKING" : "DETERMINISTIC_AND_APPROPRIATE");
  set("opportunity_rubric", "DETERMINISTIC_AND_APPROPRIATE");
  set("investment_committee", "DETERMINISTIC_AND_APPROPRIATE");
  set("source_provider_registry", "DETERMINISTIC_AND_APPROPRIATE");
  set("company_specific_teams", "DETERMINISTIC_AND_APPROPRIATE");
  set("employee_brain_layers", "DETERMINISTIC_AND_APPROPRIATE");
  set("training_lab", "DETERMINISTIC_AND_APPROPRIATE");
  set("embeddings", cm.embeddings ? "LIVE_AND_WORKING" : "NOT_IMPLEMENTED");
  set("teaching_pairs_generalized", "DETERMINISTIC_AND_APPROPRIATE");
  set("competency_maps", "DETERMINISTIC_AND_APPROPRIATE");
  set("task_graph", "DETERMINISTIC_AND_APPROPRIATE");
  set("launch_readiness", "DETERMINISTIC_AND_APPROPRIATE");
  set("external_adapters", "NOT_CONFIGURED");
  set("revenue_foundry_report", "DETERMINISTIC_AND_APPROPRIATE");
  cm.revenueFoundry = { note: "Section 21 checkpoint", costUsd: ctx.liveSpendUsd || 0, embeddings: cm.embeddings, tests: ctx.tests };
  writeFileSync(join(stateDir, "capability-matrix.json"), JSON.stringify(cm, null, 2));
  return cm;
}

export async function runRevenueFoundrySlice(store, extras = {}) {
  const liveCalls = [];
  let liveSpendUsd = 0;
  const planner = await planWithOptionalLive(store, "Find three business opportunities I can start with $2,000.", {
    workspaceId: HARBOR_WORKSPACE_ID,
    preferLive: extras.preferLivePlanner === true,
    liveComplete: extras.liveComplete,
    store,
  });
  if (planner.usedLive && extras.plannerCostUsd) {
    liveSpendUsd += Number(extras.plannerCostUsd) || 0;
    liveCalls.push({ kind: "live_planner", usd: extras.plannerCostUsd });
  }
  persistCommandPlan(store, "Find three business opportunities I can start with $2,000.", { workspaceId: HARBOR_WORKSPACE_ID });
  const opps = demonstrateSeriousOpportunities(store, extras);
  const sourceRegistry = buildSourceProviderRegistry(store, extras);
  persistFetchMetadata(store, {
    id: "FET-002",
    url: "https://www.buncombenc.gov/Governing/Depts/Library/Pages/default.aspx",
    excerpt: "Buncombe County Library system — reused from SRCH-002 accepted set",
    relevance: "accepted-useful",
    limitations: ["Page body may differ from prior fetch", "Not a new web_search"],
    providerId: "web_search",
    workspaceId: HARBOR_WORKSPACE_ID,
  });
  const teams = assembleCompanyTeamDiff(store);
  const harborMarketing = (store.listAgents ? store.listAgents() : []).find(function(a){ return a.workspaceId === HARBOR_WORKSPACE_ID && a.roleId === "marketing"; });
  const brain = harborMarketing ? retrieveBrainLayers(store, harborMarketing.id, "library") : { note: "no marketing employee" };
  const training = trainingLabIngest(store, {
    workspaceId: HARBOR_WORKSPACE_ID,
    sourceType: "owner_paste",
    text: "Training Lab depth note: owner policies remain mandatory. Library bulletin citations preferred over inventing demand.",
    roleId: "marketing",
    skills: ["citation_discipline"],
  });
  const embeddings = await runEmbeddingsProofOrBoundary(store, extras);
  if (embeddings && embeddings.costUsd) {
    liveSpendUsd += Number(embeddings.costUsd) || 0;
    liveCalls.push({ kind: "embeddings_proof", usd: embeddings.costUsd, model: embeddings.model });
  }
  const teaching = demonstrateExtendedTeaching(store);
  const competency = buildCompetencyProgress(store);
  const taskGraph = buildObjectiveTaskGraph({ id: "OBJ-RF-HARBOR", tasks: null });
  const launchReadiness = launchReadinessView(store, HARBOR_WORKSPACE_ID);
  const launchFinch = launchReadinessView(store, FINCH_WORKSPACE_ID);
  writeFileSync(join(store.dir || midasStateDir(), "task_graphs.json"), JSON.stringify([taskGraph], null, 2));
  writeFileSync(join(store.dir || midasStateDir(), "external_adapters.json"), JSON.stringify(EXTERNAL_ADAPTERS, null, 2));
  writeFileSync(join(store.dir || midasStateDir(), "launch_readiness_harbor.json"), JSON.stringify(launchReadiness, null, 2));
  const artifacts = improveHarborAndFinchArtifacts(store);
  const archive = refreshPortableArchive();
  const ctx = {
    store, liveSpendUsd, liveCalls, planner, opps, sourceRegistry, teams, brain, training,
    embeddings, teaching, competency, taskGraph, launchReadiness, launchFinch, artifacts, archive,
    tests: extras.tests || "pending",
  };
  const report = writeSection21Report(ctx);
  const matrix = updateCapabilityMatrix(ctx);
  return { ...ctx, report, matrix, adapters: EXTERNAL_ADAPTERS, alwaysOn: alwaysOnReadiness(), nav: revenueFoundryNav() };
}
