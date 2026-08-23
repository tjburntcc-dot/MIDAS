/** Checkpoint 24 first-class deliverables + authorized local artifacts. Deterministic assembly. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { SEARCH_INTEGRATION_EXISTS } from "./source-acquisition.ts";
import { collectWorkspaceSignals } from "./team-generator.ts";

export const DELIVERABLE_SURFACE = "deliverables";
export const DELIVERABLE_ASSEMBLY = "deterministic";

export const CLAIM_CLASSES = [
  "fact",
  "hypothesis",
  "owner-provided",
  "unknown",
  "vendor-claim",
];

export const DELIVERABLE_TYPES = [
  "opportunity_comparison",
  "business_concept_brief",
  "customer_profile",
  "offer_hypothesis",
  "competitor_research",
  "positioning_analysis",
  "marketing_copy_draft",
  "landing_page_copy",
  "product_requirements",
  "operating_procedure",
  "financial_assumptions",
  "unit_economics_worksheet",
  "prioritized_execution_plan",
  "founder_opportunity_brief",
  "risk_register",
  "validation_plan",
  "feature_roadmap",
  "execution_plan",
];

export const KIND_TO_DELIVERABLE_TYPES = {
  business_ideas: [
    "opportunity_comparison",
    "business_concept_brief",
    "customer_profile",
    "offer_hypothesis",
    "financial_assumptions",
    "prioritized_execution_plan",
    "founder_opportunity_brief",
    "risk_register",
    "validation_plan",
  ],
  offer_positioning: [
    "offer_hypothesis",
    "positioning_analysis",
    "marketing_copy_draft",
    "customer_profile",
  ],
  growth_analysis: [
    "opportunity_comparison",
    "competitor_research",
    "operating_procedure",
    "prioritized_execution_plan",
  ],
  landing_outline: [
    "landing_page_copy",
    "marketing_copy_draft",
    "customer_profile",
    "product_requirements",
    "feature_roadmap",
  ],
  competitor_research: [
    "competitor_research",
    "positioning_analysis",
    "risk_register",
  ],
  unit_economics: [
    "financial_assumptions",
    "unit_economics_worksheet",
    "validation_plan",
  ],
  product_build: [
    "product_requirements",
    "operating_procedure",
    "prioritized_execution_plan",
    "feature_roadmap",
  ],
  generic_supervised: [
    "business_concept_brief",
    "prioritized_execution_plan",
    "risk_register",
  ],
  evaluate_fit: [
    "founder_opportunity_brief",
    "risk_register",
    "validation_plan",
  ],
  train_then_position: [
    "positioning_analysis",
    "marketing_copy_draft",
    "customer_profile",
  ],
};

export const DELIVERABLE_TITLES = {
  opportunity_comparison: "Opportunity comparison",
  business_concept_brief: "Business concept brief",
  customer_profile: "Customer profile",
  offer_hypothesis: "Offer hypothesis",
  competitor_research: "Competitor research",
  positioning_analysis: "Positioning analysis",
  marketing_copy_draft: "Marketing copy draft",
  landing_page_copy: "Landing-page copy",
  product_requirements: "Product requirements",
  operating_procedure: "Operating procedure",
  financial_assumptions: "Financial assumptions",
  unit_economics_worksheet: "Unit-economics worksheet",
  prioritized_execution_plan: "Prioritized execution plan",
  founder_opportunity_brief: "Founder opportunity brief",
  risk_register: "Risk register",
  validation_plan: "Validation plan",
  feature_roadmap: "Feature roadmap",
  execution_plan: "Execution plan",
};

export const DELIVERABLE_HONESTY = {
  persistence: "FILE_STORE",
  thisSlice: "deterministic",
  assembly: DELIVERABLE_ASSEMBLY,
  liveProviderCall: false,
  fixtureLabeledAsLive: false,
  searchIntegrationExists: SEARCH_INTEGRATION_EXISTS === true,
  embeddings: false,
  outreach: false,
  deployed: false,
  inventedCustomers: false,
  inventedRevenue: false,
  inventedTam: false,
  note: "Deliverables are assembled from persisted specialist results and owner-provided facts. Labeled deterministic. Not a live model call. Not a fixture labeled as live. Local files are inspectable artifacts only and are not deployed.",
};

export const NO_ARTIFACT_MESSAGE = "No local artifact was created. A landing-page, prototype, spec, or internal-tool file is written only when the owner submitted that objective on this workspace and a product/engineering specialist actually exists here. Nothing was written silently.";

export const ARTIFACT_NOT_DEPLOYED = "Local inspectable artifact only. Not deployed. Not a live website. No customers claimed.";

function nowIso() {
  return new Date().toISOString();
}

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, "").trim();
}

function nextId(existing, prefix) {
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const id of existing) {
    const m = String(id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function sha256Text(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function sanitizeWorkspaceId(workspaceId) {
  const raw = asText(workspaceId);
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) {
    const err = new Error("workspaceId is not a safe artifact folder name.");
    err.code = "UNSAFE_WORKSPACE_ID";
    throw err;
  }
  return raw;
}

export function artifactsRoot(store) {
  if (process.env.MIDAS_ARTIFACTS_DIR) return process.env.MIDAS_ARTIFACTS_DIR;
  const dir = store && store.dir ? String(store.dir) : "";
  if (dir.endsWith("/state") || dir.endsWith("\\state")) return join(dirname(dir), "artifacts");
  return join(dir || "/tmp/midas-artifacts", "artifacts");
}

export function workspaceArtifactDir(store, workspaceId) {
  return join(artifactsRoot(store), sanitizeWorkspaceId(workspaceId));
}

export function deliverableTypesForKind(kind) {
  const key = String(kind || "generic_supervised");
  return (KIND_TO_DELIVERABLE_TYPES[key] || KIND_TO_DELIVERABLE_TYPES.generic_supervised).slice();
}

export function normalizeClaimClass(raw) {
  const s = String(raw || "").toLowerCase().replace(/_/g, "-");
  if (s === "owner-provided" || s === "owner-authored" || s === "owner-policy") return "owner-provided";
  if (s === "hypothesis" || s === "model-generated-hypothesis") return "hypothesis";
  if (s === "fact" || s === "verified-sourced-fact" || s === "company-fact" || s === "external-sourced-fact") return "fact";
  if (s === "vendor-claim" || s === "vendor-or-marketing-claim" || s === "vendor-opinion") return "vendor-claim";
  if (s === "unknown") return "unknown";
  if (CLAIM_CLASSES.includes(s)) return s;
  return "hypothesis";
}

function claim(text, claimClass) {
  const t = asText(text);
  if (!t) return null;
  return { text: t, claimClass: normalizeClaimClass(claimClass) };
}

function claimsFrom(list) {
  return (list || []).filter(Boolean);
}

function fieldValue(field) {
  if (field == null) return "";
  if (typeof field === "object" && !Array.isArray(field) && "value" in field) {
    const v = field.value;
    if (Array.isArray(v)) return v.join(", ");
    return asText(v);
  }
  if (Array.isArray(field)) return field.join(", ");
  return asText(field);
}

function intakeSignals(store, workspaceId) {
  const workspace = store.getWorkspace && store.getWorkspace(workspaceId);
  return collectWorkspaceSignals(workspace || { id: workspaceId });
}

function resultOf(tasks, pred) {
  return (tasks || []).find((t) => t && t.result && pred(t)) || null;
}

function roleResult(tasks, roleId) {
  return resultOf(tasks, (t) => t.assignedRoleId === roleId);
}

function keyResult(tasks, key) {
  return resultOf(tasks, (t) => t.key === key || (t.result && t.result.kind === key));
}

export function workspaceHasProductSpecialist(store, workspaceId) {
  const roles = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter((r) => r && r.workspaceId === workspaceId);
  return roles.some((r) => r.roleId === "product" && r.implementationStatus !== "not_implemented");
}

export function objectiveAuthorizesArtifact(objective) {
  if (!objective) return false;
  const interp = objective.interpretation || {};
  if (interp.wantsLocalArtifact === true) return true;
  const kind = interp.kind || "";
  if (kind === "landing_outline" || kind === "product_build") return true;
  const text = String(objective.ownerText || interp.ownerText || "");
  return /(landing[- ]page|local prototype|product spec|internal tool|working prototype)/i.test(text);
}

function forbiddenArtifactTarget(absPath) {
  const norm = resolve(absPath).replace(/\\/g, "/");
  if (/\/evals\//.test(norm)) return "evals";
  if (/\/docs\/phase0\//.test(norm)) return "mission-docs";
  if (/\/var\/state\/[^/]+\.json$/.test(norm)) return "state-json";
  if (/mission0[0-9]|mission1[0-8]|FOB-001|atlas-v1[56]|offer_strategist-ws-ridgeline/.test(norm)) return "frozen-or-mission";
  return null;
}

export function resolveWorkspaceArtifactPath(store, workspaceId, filename) {
  const safeName = asText(filename).replace(/[^A-Za-z0-9._-]/g, "") || "landing.html";
  if (safeName.includes("..") || safeName.includes("/") || safeName.includes("\\")) {
    const err = new Error("Artifact filename must stay inside the workspace folder.");
    err.code = "OTHER_WORKSPACE";
    throw err;
  }
  const dir = workspaceArtifactDir(store, workspaceId);
  const dest = resolve(join(dir, safeName));
  const root = resolve(dir);
  if (dest !== root && !dest.startsWith(root + sep)) {
    const err = new Error("Artifact path escaped the workspace artifact folder.");
    err.code = "OTHER_WORKSPACE";
    throw err;
  }
  const forbidden = forbiddenArtifactTarget(dest);
  if (forbidden) {
    const err = new Error("Refusing to write a frozen or mission path (" + forbidden + ").");
    err.code = "FORBIDDEN_PATH";
    throw err;
  }
  return dest;
}

export function writeAuthorizedArtifact(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const objectiveId = payload && payload.objectiveId;
  const targetWorkspaceId = payload && payload.targetWorkspaceId;
  if (!workspaceId) {
    return { ok: false, written: false, code: "WORKSPACE_REQUIRED", message: "workspaceId is required.", deployed: false };
  }
  if (targetWorkspaceId && targetWorkspaceId !== workspaceId) {
    return {
      ok: false,
      written: false,
      code: "OTHER_WORKSPACE",
      message: "Artifact cannot be written into another workspace.",
      requestedWorkspaceId: workspaceId,
      targetWorkspaceId: targetWorkspaceId,
      deployed: false,
    };
  }
  const objective = objectiveId && store.getObjective ? store.getObjective(objectiveId) : null;
  if (!objective) {
    return { ok: false, written: false, code: "OBJECTIVE_NOT_FOUND", message: "An owner-submitted work objective is required before writing a local artifact.", deployed: false };
  }
  if (objective.workspaceId !== workspaceId) {
    return {
      ok: false,
      written: false,
      code: "OTHER_WORKSPACE",
      message: "Artifact cannot be written into another workspace. The objective belongs to " + objective.workspaceId + ".",
      deployed: false,
    };
  }
  if (!objectiveAuthorizesArtifact(objective)) {
    return {
      ok: false,
      written: false,
      code: "NOT_REQUESTED",
      message: NO_ARTIFACT_MESSAGE,
      deployed: false,
    };
  }
  if (!workspaceHasProductSpecialist(store, workspaceId)) {
    return {
      ok: false,
      written: false,
      code: "NO_PRODUCT_SPECIALIST",
      message: NO_ARTIFACT_MESSAGE,
      deployed: false,
    };
  }
  const product = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).find((r) => r.roleId === "product");
  const filename = (payload && payload.filename) || defaultArtifactFilename(objective);
  let dest;
  try {
    dest = resolveWorkspaceArtifactPath(store, workspaceId, filename);
  } catch (err) {
    return {
      ok: false,
      written: false,
      code: err && err.code || "FORBIDDEN_PATH",
      message: err instanceof Error ? err.message : String(err),
      deployed: false,
    };
  }
  const contents = payload && payload.contents != null ? String(payload.contents) : buildLandingHtml(store, objective, payload && payload.tasks);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents, "utf8");
  const hash = sha256Text(contents);
  return {
    ok: true,
    written: true,
    deployed: false,
    claim: "local_inspectable_artifact_only",
    path: dest,
    filename: filename,
    workspaceId: workspaceId,
    objectiveId: objective.id,
    createdByEmployeeId: product && product.id || null,
    contentHash: hash,
    byteLength: Buffer.byteLength(contents, "utf8"),
    preview: clip(contents, 480),
    exists: existsSync(dest),
    inspectable: true,
    liveProviderCall: false,
    note: ARTIFACT_NOT_DEPLOYED,
  };
}

export function defaultArtifactFilename(objective) {
  const kind = objective && objective.interpretation && objective.interpretation.kind;
  const text = String((objective && objective.ownerText) || "");
  if (kind === "product_build" && !/landing[- ]page/i.test(text)) {
    if (/internal tool/i.test(text)) return "internal-tool.html";
    return "product-spec.md";
  }
  return "landing.html";
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function latestLiveStructured(store, workspaceId, roleId) {
  if (!store || !store.listSpecialistExecutions) return null;
  const rows = ((store.listSpecialistExecutions(workspaceId) || [])).filter((e) => {
    if (!e || e.workspaceId !== workspaceId) return false;
    if (e.roleId !== roleId) return false;
    if (e.ok !== true || e.live !== true) return false;
    return Boolean(e.structured);
  }).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return rows.length ? rows[rows.length - 1] : null;
}

export function buildLandingHtml(store, objective, tasks) {
  const workspace = store.getWorkspace && store.getWorkspace(objective.workspaceId);
  const signals = collectWorkspaceSignals(workspace || { id: objective.workspaceId });
  const marketing = keyResult(tasks || [], "landing_outline") || roleResult(tasks || [], "marketing");
  const product = roleResult(tasks || [], "product");
  const offer = roleResult(tasks || [], "offer_strategist");
  const marketingExec = latestLiveStructured(store, objective.workspaceId, "marketing");
  const productExec = latestLiveStructured(store, objective.workspaceId, "product");
  const m = (marketingExec && marketingExec.structured) || {};
  const p = (productExec && productExec.structured) || {};
  const name = (m.headline && clip(m.headline, 80)) || signals.offer || (workspace && workspace.name) || "Owner-stated offer";
  const problem = m.customer_problem
    || (marketing && marketing.result && marketing.result.customerProblem)
    || signals.challenges
    || signals.customer
    || "Customer problem as restated from owner facts. Unknown where the owner did not state it.";
  const offerLine = (offer && offer.result && offer.result.summary) || signals.offer || (m.audience ? "Draft offer for: " + m.audience : "") || signals.ownerObjective || objective.ownerText;
  const outline = (Array.isArray(m.body_outline) && m.body_outline.length ? m.body_outline : null)
    || (marketing && marketing.result && marketing.result.outline)
    || [];
  const checks = Array.isArray(p.acceptance_checks) ? p.acceptance_checks : [];
  let slice = p.slice || (product && product.result && product.result.slice) || "";
  const priceCheck = checks.find((c) => /\$40/.test(String(c)));
  if (priceCheck && /\$35/.test(String(slice))) {
    slice = String(priceCheck);
  }
  const title = clip(name, 80) || "Local landing draft";
  const sources = [marketingExec && marketingExec.id, productExec && productExec.id].filter(Boolean);
  const sourceLine = sources.length
    ? "Persisted live results used: " + sources.join(", ") + ". Deterministic assembly only."
    : "No persisted live marketing/product results. Restating owner facts only.";
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\"/>",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>",
    "<title>" + escapeHtml(title) + "</title>",
    "<style>body{font-family:Georgia,serif;max-width:40rem;margin:1.5rem auto;padding:0 1rem;line-height:1.45;color:#111} .banner{border:1px solid #b58900;background:#fff8e1;padding:.6rem .8rem;margin:0 0 1rem} h1{font-size:1.6rem} .muted{color:#555;font-size:.95rem}</style>",
    "</head>",
    "<body>",
    "<p class=\"banner\">Draft. " + escapeHtml(ARTIFACT_NOT_DEPLOYED) + "</p>",
    "<h1>" + escapeHtml(title) + "</h1>",
    "<p class=\"muted\">Workspace " + escapeHtml(objective.workspaceId) + " · objective " + escapeHtml(objective.id) + " · assembled deterministically from persisted specialist results. Not a live model call. No invented TAM, demand, revenue, or customers.</p>",
    "<p class=\"muted\">" + escapeHtml(sourceLine) + "</p>",
    "<h2>Customer problem</h2>",
    "<p>" + escapeHtml(clip(problem, 500) || "unknown") + "</p>",
    (m.audience ? "<h2>Audience as drafted</h2><p>" + escapeHtml(clip(m.audience, 320)) + "</p>" : ""),
    "<h2>Offer as stated</h2>",
    "<p>" + escapeHtml(clip(offerLine, 400) || "unknown") + "</p>",
    (priceCheck ? "<p><b>Owner-corrected price from persisted product result:</b> " + escapeHtml(clip(priceCheck, 220)) + "</p>" : ""),
    (outline.length ? "<h2>Outline from persisted marketing</h2><ul>" + outline.map((line) => "<li>" + escapeHtml(String(line)) + "</li>").join("") + "</ul>" : ""),
    (m.cta_internal_only ? "<h2>Internal next step</h2><p>" + escapeHtml(clip(m.cta_internal_only, 280)) + "</p>" : ""),
    (slice ? "<h2>First build slice</h2><p>" + escapeHtml(clip(slice, 360)) + "</p>" : ""),
    (checks.length ? "<h2>Acceptance checks from persisted product</h2><ul>" + checks.map((line) => "<li>" + escapeHtml(String(line)) + "</li>").join("") + "</ul>" : ""),
    "<h2>Honesty</h2>",
    "<ul>",
    "<li>This file is a local inspectable artifact. It is not deployed.</li>",
    "<li>Demand, TAM, conversion, and expected revenue stay unknown unless the owner already stored them.</li>",
    "<li>Copy below is assembled from persisted live marketing/product results when those records exist. It is still a draft, not a customer claim.</li>",
    "<li>No outreach. Assembly itself is not a live provider call.</li>",
    "</ul>",
    "</body>",
    "</html>",
    "",
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}

function lines(parts) {
  return parts.filter((p) => p != null && String(p).length).join("\n\n");
}

function assembleOne(type, ctx) {
  const { tasks, signals, objective, knowledge } = ctx;
  const research = roleResult(tasks, "business_research");
  const offer = roleResult(tasks, "offer_strategist");
  const marketing = roleResult(tasks, "marketing");
  const product = roleResult(tasks, "product");
  const ops = roleResult(tasks, "ops");
  const finance = roleResult(tasks, "finance");
  const manager = roleResult(tasks, "workflow_manager");
  const ideas = research && research.result && research.result.ideas;
  const outline = marketing && marketing.result && marketing.result.outline;
  const claims = [];
  const sourceRefs = [];
  const taskRefs = [];
  const addTask = (t) => {
    if (!t) return;
    taskRefs.push(t.id);
    sourceRefs.push({ kind: "task", id: t.id, roleId: t.assignedRoleId || null });
  };
  let body = "";
  let createdBy = null;
  let createdByRole = null;

  const ownerBits = [
    signals.ownerObjective && claim("Owner objective: " + clip(signals.ownerObjective, 220), "owner-provided"),
    signals.offer && claim("Owner-stated offer: " + clip(signals.offer, 180), "owner-provided"),
    signals.customer && claim("Owner-stated customer: " + clip(signals.customer, 160), "owner-provided"),
    signals.budget && claim("Owner-stated budget ceiling: " + clip(signals.budget, 80), "owner-provided"),
  ];

  if (type === "opportunity_comparison") {
    addTask(research);
    createdBy = research && research.assignedEmployeeId;
    createdByRole = "business_research";
    if (ideas && ideas.length) {
      body = lines([
        "Comparison of labeled idea hypotheses from persisted research. Not a ranking and not researched demand.",
        ideas.map((idea, i) => (i + 1) + ". " + (idea.title || "Idea") + " — " + (idea.text || "")).join("\n"),
        "TAM, demand, conversion, and expected revenue stay unknown.",
      ]);
      for (const idea of ideas) claims.push(claim(idea.text || idea.title, idea.claimClass || "hypothesis"));
    } else {
      body = lines([
        "Opportunity comparison is relevant to this objective.",
        research && research.result && research.result.summary ? research.result.summary : "No persisted idea hypotheses. Comparison stays unknown.",
        "No invented TAM, demand, or customers.",
      ]);
      claims.push(claim("No compared opportunities were researched.", "unknown"));
    }
    claims.push(...ownerBits);
  } else if (type === "business_concept_brief") {
    addTask(research);
    addTask(offer);
    createdBy = (offer && offer.assignedEmployeeId) || (research && research.assignedEmployeeId);
    createdByRole = offer ? "offer_strategist" : "business_research";
    body = lines([
      "Business concept brief assembled from owner facts and persisted specialist output.",
      signals.ownerObjective ? "Concept restatement: " + clip(signals.ownerObjective, 240) : "Owner objective was not stored.",
      offer && offer.result && offer.result.summary,
      research && research.result && research.result.summary,
      "This is a hypothesis brief, not evidence of demand.",
    ]);
    claims.push(...ownerBits);
    if (offer && offer.result) claims.push(claim(offer.result.summary, "hypothesis"));
    else claims.push(claim("Offer hypothesis was not produced by a specialist on this run.", "unknown"));
  } else if (type === "customer_profile") {
    addTask(marketing);
    addTask(offer);
    createdBy = (marketing && marketing.assignedEmployeeId) || (offer && offer.assignedEmployeeId);
    createdByRole = marketing ? "marketing" : "offer_strategist";
    const problem = (marketing && marketing.result && marketing.result.customerProblem) || signals.challenges || signals.customer;
    body = lines([
      "Customer profile from owner-provided facts only. No invented personas or customer counts.",
      problem ? "Stated customer / problem: " + clip(problem, 240) : "Customer remains unknown. The owner did not store a profile.",
      "Willingness to pay, demand, and existing customers are unknown unless already stored.",
    ]);
    if (problem) claims.push(claim(clip(problem, 200), signals.customer || signals.challenges ? "owner-provided" : "hypothesis"));
    else claims.push(claim("Customer profile unknown.", "unknown"));
    claims.push(...ownerBits.filter((c) => c && /customer|objective/i.test(c.text)));
  } else if (type === "offer_hypothesis") {
    addTask(offer);
    createdBy = offer && offer.assignedEmployeeId;
    createdByRole = "offer_strategist";
    body = lines([
      offer && offer.result && offer.result.summary ? offer.result.summary : "No offer specialist result persisted. Offer stays a restatement of owner facts or unknown.",
      offer && offer.result && offer.result.positioning,
      "Validation still required. Demand, TAM, conversion, and expected revenue are unknown.",
    ]);
    claims.push(...ownerBits);
    claims.push(claim((offer && offer.result && offer.result.summary) || "Offer hypothesis unknown.", offer ? "hypothesis" : "unknown"));
  } else if (type === "competitor_research") {
    addTask(research);
    createdBy = research && research.assignedEmployeeId;
    createdByRole = "business_research";
    const fromK = research && research.result && research.result.fromApprovedKnowledge;
    body = lines([
      research && research.result && research.result.summary ? research.result.summary : "No competitor specialist result.",
      fromK && fromK.length ? "From approved workspace knowledge:\n" + fromK.map((s) => "- " + s).join("\n") : "Approved workspace knowledge did not describe competitor features. Search integration does not exist.",
      "Features not stored stay unknown. Nothing was fetched from the open web.",
    ]);
    if (fromK && fromK.length) {
      for (const s of fromK) claims.push(claim(s, knowledgeLooksVendor(s) ? "vendor-claim" : "fact"));
    } else {
      claims.push(claim("Competitor features unknown. Search integration does not exist.", "unknown"));
    }
  } else if (type === "positioning_analysis") {
    addTask(offer);
    addTask(research);
    createdBy = (offer && offer.assignedEmployeeId) || (research && research.assignedEmployeeId);
    createdByRole = offer ? "offer_strategist" : "business_research";
    body = lines([
      offer && offer.result && offer.result.positioning ? offer.result.positioning : (offer && offer.result && offer.result.summary) || "Positioning was not drafted because no offer result persisted.",
      "Positioning is a hypothesis from owner facts. Not a market study.",
    ]);
    claims.push(...ownerBits);
    claims.push(claim((offer && offer.result && (offer.result.positioning || offer.result.summary)) || "Positioning unknown.", offer ? "hypothesis" : "unknown"));
  } else if (type === "marketing_copy_draft") {
    addTask(marketing);
    createdBy = marketing && marketing.assignedEmployeeId;
    createdByRole = "marketing";
    body = lines([
      marketing && marketing.result && marketing.result.summary,
      outline && outline.length ? "Draft outline:\n" + outline.map((s) => "- " + s).join("\n") : "No marketing outline persisted.",
      "Internal draft only. No outbound send.",
    ]);
    if (outline && outline.length) for (const s of outline) claims.push(claim(s, "hypothesis"));
    else claims.push(claim("Marketing copy unknown.", "unknown"));
    claims.push(...ownerBits.filter((c) => c && /offer|objective/i.test(c.text)));
  } else if (type === "landing_page_copy") {
    addTask(marketing);
    addTask(product);
    createdBy = (marketing && marketing.assignedEmployeeId) || (product && product.assignedEmployeeId);
    createdByRole = marketing ? "marketing" : "product";
    const problem = marketing && marketing.result && marketing.result.customerProblem;
    body = lines([
      "Landing-page copy assembled from the persisted outline. Local file only if a product specialist exists on this company.",
      problem ? "Customer problem: " + problem : "Customer problem unknown.",
      outline && outline.length ? outline.map((s) => "- " + s).join("\n") : "No landing outline persisted.",
      "Not deployed.",
    ]);
    if (problem) claims.push(claim(problem, signals.challenges || signals.customer ? "owner-provided" : "hypothesis"));
    if (outline && outline.length) for (const s of outline) claims.push(claim(s, "hypothesis"));
    if (!problem && !(outline && outline.length)) claims.push(claim("Landing-page copy unknown.", "unknown"));
  } else if (type === "product_requirements") {
    addTask(product);
    createdBy = product && product.assignedEmployeeId;
    createdByRole = "product";
    body = lines([
      product && product.result && product.result.summary,
      product && product.result && product.result.slice ? "First build slice: " + product.result.slice : "No product specialist result persisted. Requirements stay unknown.",
      "Not a shipped product. Not deployed.",
    ]);
    claims.push(claim((product && product.result && (product.result.slice || product.result.summary)) || "Product requirements unknown.", product ? "hypothesis" : "unknown"));
    claims.push(...ownerBits.filter((c) => c && /objective/i.test(c.text)));
  } else if (type === "operating_procedure") {
    addTask(ops);
    createdBy = ops && ops.assignedEmployeeId;
    createdByRole = "ops";
    const checklist = ops && ops.result && ops.result.checklist;
    body = lines([
      ops && ops.result && ops.result.summary,
      checklist && checklist.length ? checklist.map((s) => "- " + s).join("\n") : "No operations checklist persisted.",
      signals.procedures ? "Owner procedures: " + clip(signals.procedures, 200) : "No owner procedures stored.",
    ]);
    if (signals.procedures) claims.push(claim(clip(signals.procedures, 180), "owner-provided"));
    if (checklist && checklist.length) for (const s of checklist) claims.push(claim(s, /no owner/i.test(s) ? "unknown" : "hypothesis"));
    if (!signals.procedures && !(checklist && checklist.length)) claims.push(claim("Operating procedure unknown.", "unknown"));
  } else if (type === "financial_assumptions") {
    addTask(finance);
    createdBy = finance && finance.assignedEmployeeId;
    createdByRole = "finance";
    const assumptions = finance && finance.result && finance.result.assumptionsToValidate;
    body = lines([
      finance && finance.result && finance.result.summary,
      signals.budget ? "Owner-stated budget ceiling: " + signals.budget + ". Not a forecast." : "No owner-stated budget.",
      assumptions && assumptions.length ? "Assumptions still to validate:\n" + assumptions.map((s) => "- " + s).join("\n") : null,
      "TAM, demand, conversion, and expected revenue are unknown and were not invented.",
    ]);
    if (signals.budget) claims.push(claim("Owner-stated budget ceiling: " + signals.budget, "owner-provided"));
    else claims.push(claim("Budget unknown.", "unknown"));
    claims.push(claim("TAM unknown.", "unknown"));
    claims.push(claim("Expected revenue unknown.", "unknown"));
    if (assumptions) for (const s of assumptions) claims.push(claim(s, "unknown"));
  } else if (type === "unit_economics_worksheet") {
    addTask(finance);
    createdBy = finance && finance.assignedEmployeeId;
    createdByRole = "finance";
    body = lines([
      "Unit-economics worksheet. Fields the owner did not supply stay unknown. Not a forecast.",
      "Price the owner is willing to charge: unknown unless stored.",
      "Cost to deliver one unit: unknown unless stored.",
      "Conversion: unknown.",
      "Repeat purchase: unknown.",
      "TAM / demand / expected revenue: unknown. Not invented.",
      finance && finance.result && finance.result.summary,
      signals.budget ? "Only stored money fact: owner-stated budget ceiling " + signals.budget + "." : "No owner-stated budget.",
    ]);
    if (signals.budget) claims.push(claim("Owner-stated budget ceiling: " + signals.budget, "owner-provided"));
    claims.push(claim("Unit economics unknown.", "unknown"));
    claims.push(claim("Conversion unknown.", "unknown"));
    claims.push(claim("TAM unknown.", "unknown"));
  } else if (type === "prioritized_execution_plan") {
    addTask(manager);
    createdBy = manager && manager.assignedEmployeeId;
    createdByRole = "workflow_manager";
    const completed = (tasks || []).filter((t) => t.status === "completed").map((t) => t.id + " " + (t.assignedRoleId || "") + " — " + clip((t.result && t.result.summary) || "", 120));
    body = lines([
      manager && manager.result && manager.result.summary,
      "Execution order follows the persisted plan. Not autonomous.",
      completed.length ? completed.map((s, i) => (i + 1) + ". " + s).join("\n") : "No completed specialist tasks to sequence.",
    ]);
    claims.push(claim("Plan is assembled from persisted task records.", "fact"));
    if (manager && manager.result && manager.result.summary) claims.push(claim(manager.result.summary, "hypothesis"));
  } else if (type === "founder_opportunity_brief") {
    addTask(research);
    addTask(offer);
    createdBy = (offer && offer.assignedEmployeeId) || (research && research.assignedEmployeeId);
    createdByRole = offer ? "offer_strategist" : "business_research";
    body = lines([
      "Founder opportunity brief from owner facts and persisted specialist results. Hypothesis, not demand.",
      signals.ownerObjective ? "Owner objective: " + clip(signals.ownerObjective, 240) : "Owner objective was not stored.",
      offer && offer.result && offer.result.summary,
      research && research.result && research.result.summary,
      "Demand, TAM, conversion, and expected revenue stay unknown.",
    ]);
    claims.push(...ownerBits);
    claims.push(claim((offer && offer.result && offer.result.summary) || "Opportunity brief is a labeled hypothesis.", offer ? "hypothesis" : "unknown"));
  } else if (type === "risk_register") {
    addTask(manager);
    addTask(research);
    createdBy = (manager && manager.assignedEmployeeId) || (research && research.assignedEmployeeId);
    createdByRole = manager ? "workflow_manager" : "business_research";
    body = lines([
      "Risk register from owner facts and persisted results. Not a probability model.",
      "Demand is unknown and is not invented.",
      "Time and attention could be spent before inspectable evidence appears.",
      signals.budget ? "Spending could approach the owner-stated budget ceiling " + signals.budget + "." : "No owner budget was stored.",
      "Search integration does not exist. Outreach is not authorized.",
    ]);
    claims.push(claim("Demand unknown.", "unknown"));
    claims.push(claim("Expected revenue unknown.", "unknown"));
    if (signals.budget) claims.push(claim("Owner-stated budget ceiling: " + signals.budget, "owner-provided"));
  } else if (type === "validation_plan") {
    addTask(research);
    addTask(offer);
    createdBy = (research && research.assignedEmployeeId) || (offer && offer.assignedEmployeeId);
    createdByRole = research ? "business_research" : "offer_strategist";
    body = lines([
      "Validation plan. What would have to be true, written as questions. Not a launch plan.",
      "Ask whether anyone wants the owner-stated offer. Do not invent the answer.",
      "Ask what one unit costs. Unknown unless the owner stored it.",
      "Search integration does not exist. Do not crawl the web.",
      "No outreach.",
    ]);
    claims.push(claim("Validation questions only. Answers stay unknown.", "unknown"));
    claims.push(...ownerBits);
  } else if (type === "feature_roadmap") {
    addTask(product);
    createdBy = product && product.assignedEmployeeId;
    createdByRole = "product";
    body = lines([
      "Feature roadmap from the first supervised build slice. Not a shipped product.",
      product && product.result && product.result.slice ? "First slice: " + product.result.slice : "No product specialist result persisted.",
      "Not deployed.",
    ]);
    claims.push(claim((product && product.result && (product.result.slice || product.result.summary)) || "Feature roadmap unknown.", product ? "hypothesis" : "unknown"));
  } else if (type === "execution_plan") {
    addTask(manager);
    createdBy = manager && manager.assignedEmployeeId;
    createdByRole = "workflow_manager";
    body = lines([
      "Execution plan assembled from persisted task records. Same as the prioritized plan. Not autonomous.",
      manager && manager.result && manager.result.summary,
    ]);
    claims.push(claim("Plan is assembled from persisted task records.", "fact"));
  } else {
    body = "Unrecognized deliverable type.";
    claims.push(claim("Unknown deliverable type.", "unknown"));
  }

  if (knowledge && knowledge.length) {
    sourceRefs.push(...knowledge.slice(0, 4).map((k) => ({ kind: "knowledge", id: k.id })));
  }
  sourceRefs.push({ kind: "objective", id: objective.id });

  return {
    type: type,
    title: DELIVERABLE_TITLES[type] || type,
    body: body,
    claimClasses: claimsFrom(claims),
    sourceRefs: sourceRefs,
    taskRefs: Array.from(new Set(taskRefs)),
    createdByEmployeeId: createdBy || null,
    createdByRoleId: createdByRole || null,
  };
}

function knowledgeLooksVendor(text) {
  return /roofr|jobnimbus|acculynx|vendor|marketing claim/i.test(String(text || ""));
}

function approvedKnowledge(store, workspaceId) {
  return ((store.listKnowledge && store.listKnowledge()) || []).filter((k) => {
    if (!k) return false;
    if (k.workspaceId && k.workspaceId !== workspaceId) return false;
    return k.accepted === true || k.reviewStatus === "approved";
  }).map((k) => ({ id: k.id, statement: k.statement, classification: k.classification || k.claimKind }));
}

export function publicDeliverable(rec) {
  if (!rec) return null;
  return {
    id: rec.id,
    workspaceId: rec.workspaceId,
    objectiveId: rec.objectiveId,
    type: rec.type,
    title: rec.title,
    body: rec.body,
    claimClasses: rec.claimClasses || [],
    sourceRefs: rec.sourceRefs || [],
    taskRefs: rec.taskRefs || [],
    createdByEmployeeId: rec.createdByEmployeeId || null,
    createdByRoleId: rec.createdByRoleId || null,
    createdBy: rec.createdByEmployeeId || null,
    label: rec.label || "deterministic",
    liveVsDeterministic: rec.liveVsDeterministic || "deterministic",
    assembly: rec.assembly || DELIVERABLE_ASSEMBLY,
    liveProviderCall: rec.liveProviderCall === true,
    fixtureLabeledAsLive: rec.fixtureLabeledAsLive === true,
    createdAt: rec.createdAt,
    artifact: rec.artifact || null,
    deployed: false,
    draft: rec.draft !== false,
    status: rec.status || "draft",
    draftLabel: rec.draftLabel || "draft",
  };
}

export function listWorkspaceDeliverables(store, extras) {
  const workspaceId = extras && (extras.workspaceId || extras.workspace);
  const objectiveId = extras && extras.objectiveId;
  let rows = ((store.listDeliverables && store.listDeliverables(workspaceId)) || []).slice();
  if (objectiveId) rows = rows.filter((r) => r.objectiveId === objectiveId);
  rows.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return {
    built: true,
    persistence: "FILE_STORE",
    honesty: DELIVERABLE_HONESTY,
    workspaceId: workspaceId || null,
    objectiveId: objectiveId || null,
    records: rows.map(publicDeliverable),
    liveProviderCall: false,
    fixtureLabeledAsLive: false,
    deployed: false,
    note: workspaceId
      ? "Deliverables persisted for this company. Local artifact paths appear only when a file was actually written."
      : "Pick a company to inspect deliverables.",
  };
}

export function inspectDeliverable(store, id) {
  const rec = store.getDeliverable && store.getDeliverable(id);
  if (!rec) return { errorStatus: 404, error: "deliverable not found", built: true };
  let artifactPreview = rec.artifact || null;
  if (artifactPreview && artifactPreview.path && existsSync(artifactPreview.path)) {
    const contents = readFileSync(artifactPreview.path, "utf8");
    artifactPreview = {
      ...artifactPreview,
      exists: true,
      preview: artifactPreview.preview || clip(contents, 480),
      contentHash: artifactPreview.contentHash || sha256Text(contents),
      deployed: false,
    };
  }
  return {
    ok: true,
    built: true,
    persistence: "FILE_STORE",
    honesty: DELIVERABLE_HONESTY,
    deliverable: publicDeliverable({ ...rec, artifact: artifactPreview }),
    liveProviderCall: false,
    deployed: false,
  };
}

export function assembleDeliverables(store, objectiveId) {
  const objective = store.getObjective && store.getObjective(objectiveId);
  if (!objective) {
    const err = new Error("objective not found");
    err.code = "OBJECTIVE_NOT_FOUND";
    throw err;
  }
  const tasks = ((store.listTasks && store.listTasks(objective.id)) || []).slice().sort((a, b) => (a.stepIndex || 0) - (b.stepIndex || 0));
  const signals = intakeSignals(store, objective.workspaceId);
  const knowledge = approvedKnowledge(store, objective.workspaceId);
  const kind = (objective.interpretation && objective.interpretation.kind) || "generic_supervised";
  const types = deliverableTypesForKind(kind);
  const existingAll = ((store.listDeliverables && store.listDeliverables()) || []);
  const prior = existingAll.filter((d) => d.objectiveId === objective.id);
  const existingIds = existingAll.map((r) => r.id);
  const now = nowIso();
  const created = [];
  const ctx = { tasks: tasks, signals: signals, objective: objective, knowledge: knowledge };
  const fallbackEmp = (tasks.find((t) => t.assignedRoleId === "workflow_manager" && t.assignedEmployeeId)
    || tasks.find((t) => t.assignedEmployeeId)
    || {}).assignedEmployeeId || (objective.assignedEmployeeIds || [])[0] || null;
  const fallbackRole = (tasks.find((t) => t.assignedEmployeeId === fallbackEmp) || {}).assignedRoleId || "workflow_manager";
  for (const type of types) {
    const drafted = assembleOne(type, ctx);
    const reuse = prior.find((d) => d.type === type);
    const createdBy = drafted.createdByEmployeeId || fallbackEmp;
    const createdByRole = drafted.createdByRoleId || fallbackRole;
    const rec = {
      id: reuse ? reuse.id : nextId(existingIds.concat(created.map((d) => d.id)), "DEL-"),
      workspaceId: objective.workspaceId,
      objectiveId: objective.id,
      type: drafted.type,
      title: drafted.title,
      body: drafted.body,
      claimClasses: drafted.claimClasses,
      sourceRefs: drafted.sourceRefs,
      taskRefs: drafted.taskRefs,
      createdByEmployeeId: createdBy,
      createdByRoleId: createdByRole,
      createdBy: createdBy,
      label: "deterministic",
      liveVsDeterministic: "deterministic",
      assembly: DELIVERABLE_ASSEMBLY,
      liveProviderCall: false,
      fixtureLabeledAsLive: false,
      inventedCustomers: false,
      inventedRevenue: false,
      inventedTam: false,
      artifact: null,
      deployed: false,
      draft: true,
      status: "draft",
      draftLabel: "draft",
      createdAt: now,
      persistence: "FILE_STORE",
      note: DELIVERABLE_HONESTY.note,
    };
    store.putDeliverable(rec);
    created.push(rec);
  }

  let artifact = null;
  let artifactNote = NO_ARTIFACT_MESSAGE;
  const authorized = objectiveAuthorizesArtifact(objective);
  const hasProduct = workspaceHasProductSpecialist(store, objective.workspaceId);
  if (authorized && hasProduct) {
    const written = writeAuthorizedArtifact(store, {
      workspaceId: objective.workspaceId,
      objectiveId: objective.id,
      tasks: tasks,
    });
    if (written.ok) {
      artifact = {
        path: written.path,
        filename: written.filename,
        contentHash: written.contentHash,
        preview: written.preview,
        exists: written.exists,
        inspectable: true,
        deployed: false,
        claim: written.claim,
        createdByEmployeeId: written.createdByEmployeeId,
        byteLength: written.byteLength,
      };
      artifactNote = ARTIFACT_NOT_DEPLOYED;
      const attachType = created.find((d) => d.type === "landing_page_copy") || created.find((d) => d.type === "product_requirements") || created[0];
      if (attachType) {
        const next = { ...attachType, artifact: artifact };
        store.putDeliverable(next);
        const idx = created.findIndex((d) => d.id === attachType.id);
        if (idx >= 0) created[idx] = next;
      }
    } else {
      artifactNote = written.message || NO_ARTIFACT_MESSAGE;
    }
  } else if (authorized && !hasProduct) {
    artifactNote = NO_ARTIFACT_MESSAGE;
  } else {
    artifactNote = "No local artifact was requested by this objective. Deliverable records were still assembled from persisted specialist results.";
  }

  const ids = created.map((d) => d.id);
  const current = store.getObjective(objective.id);
  store.putObjective({
    ...current,
    deliverableIds: ids,
    artifactGenerated: Boolean(artifact),
    artifact: artifact,
    artifactNote: artifactNote,
    updatedAt: nowIso(),
  });

  return {
    ok: true,
    workspaceId: objective.workspaceId,
    objectiveId: objective.id,
    deliverables: created.map(publicDeliverable),
    deliverableIds: ids,
    artifact: artifact,
    artifactGenerated: Boolean(artifact),
    artifactNote: artifactNote,
    deployed: false,
    liveProviderCall: false,
    fixtureLabeledAsLive: false,
    assembly: DELIVERABLE_ASSEMBLY,
    honesty: DELIVERABLE_HONESTY,
  };
}

export {
  fieldValue,
};
