/** Checkpoint 25 owner training cycle. Practical learning for a new-company workspace. Not RidgeLine theater. Not weights/finetune/RL. */
import { contentHash } from "@midas/db";
import { FROZEN_HASHES } from "./stage-i-gate.ts";
import { SEARCH_INTEGRATION_EXISTS } from "./source-acquisition.ts";
import {
  RETRIEVAL_METHOD,
  RETRIEVAL_LABEL,
  LEARNING_DESCRIPTION,
  EPISODE_OUTCOMES,
  DEFAULT_APPROVAL_MODE,
  DELEGATED_AUTONOMY_ACTIVATED,
  AUTONOMOUS_LEARNING_IMPLEMENTED,
  createAutonomyPolicyInterface,
  createTeachingPacket,
} from "./teaching-engine.ts";
import { isIsolatedOwnerWorkspace } from "./company-intake.ts";
import { runEmployeeTask, ROLE_HANDLERS, collectWorkspaceSignals } from "./team-generator.ts";

export const CLASSIFICATIONS = [
  "owner_policy",
  "company_fact",
  "external_sourced_fact",
  "vendor_claim",
  "hypothesis",
  "example",
  "procedure",
  "correction",
];

export const SOURCE_TYPES = [
  "owner_authored",
  "owner_paste",
  "owner_markdown",
  "owner_pdf",
  "external_webpage",
];

export const EXTERNAL_SOURCE_TYPES = new Set(["external_webpage", "vendor_page", "live_public_source"]);

const PRODUCT_HONESTY = {
  persistence: "FILE_STORE",
  retrieval: RETRIEVAL_METHOD,
  searchIntegrationExists: SEARCH_INTEGRATION_EXISTS === true,
};

function leakScanProduct(text) {
  const hits = [];
  const s = String(text || "");
  if (/ATLAS-DEV-\d{3}/i.test(s)) hits.push("case-id");
  if (/ATLAS-SEALED-/i.test(s)) hits.push("sealed");
  if (/ranked_tiers|required_unknowns/.test(s)) hits.push("gold-field");
  if (/sk-[a-zA-Z0-9_-]{10,}/.test(s)) hits.push("api-key");
  if (/OPENAI_API_KEY|MIDAS_EVALUATOR_SECRET/i.test(s)) hits.push("secret-name");
  return hits;
}

function resolveEmployee(store, id) {
  const raw = decodeURIComponent(String(id || ""));
  const role = store.getEmployeeRole && store.getEmployeeRole(raw);
  if (role) {
    return {
      id: role.id,
      agentId: role.agentId || null,
      workspaceId: role.workspaceId || null,
      name: role.name || role.roleTitle || role.roleId,
      roleId: role.roleId || null,
      roleTitle: role.roleTitle || role.name || role.roleId,
      objective: role.objective || null,
      versionId: role.versionId || null,
      jobDescription: role.jobDescription || null,
      implementationStatus: role.implementationStatus || null,
      allowedTools: role.allowedTools || role.tools || [],
      skillTags: role.skillTags || [],
    };
  }
  const agent = store.getAgent && store.getAgent(raw);
  if (agent) {
    return {
      id: agent.id,
      agentId: agent.id,
      workspaceId: agent.workspaceId || null,
      name: agent.name || agent.roleName || agent.id,
      roleId: agent.roleId || null,
      roleTitle: agent.roleName || agent.name || agent.roleId,
      objective: agent.objective || null,
      versionId: agent.versionHistory && agent.versionHistory.slice(-1)[0] || null,
      skillTags: agent.skillTags || [],
    };
  }
  return null;
}

let _ingestOwnerTraining = null;
let _assignKnowledge = null;
export function bindTrainingShell(fns) {
  if (fns && fns.ingestOwnerTraining) _ingestOwnerTraining = fns.ingestOwnerTraining;
  if (fns && fns.assignKnowledge) _assignKnowledge = fns.assignKnowledge;
}
function ingestOwnerTraining(store, payload) {
  if (!_ingestOwnerTraining) throw new Error("Training shell ingest is not bound.");
  return _ingestOwnerTraining(store, payload);
}
function assignKnowledge(store, payload) {
  if (!_assignKnowledge) throw new Error("Training shell assign is not bound.");
  return _assignKnowledge(store, payload);
}

export const TRAINING_CYCLE = "owner_training_cycle_v0";

export const LEARNING_DISTINCTIONS = {
  stored: "A record exists in FILE_STORE.",
  retrieved: "The lesson entered the lexical/deterministic retrieval index and was fetched for a task.",
  used: "The lesson appeared in the handler output or context.",
  correctlyApplied: "The lesson changed the actual task result, not just a known-facts list.",
  improved: "Post-lesson output is better against predeclared criteria. Not invented.",
};

export const TRAINING_CYCLE_HONESTY = {
  persistence: "FILE_STORE",
  thisSlice: "deterministic",
  liveProviderCall: false,
  fixtureLabeledAsLive: false,
  searchIntegrationExists: SEARCH_INTEGRATION_EXISTS === true,
  retrieval: RETRIEVAL_METHOD,
  retrievalLabel: RETRIEVAL_LABEL,
  learningDescription: LEARNING_DESCRIPTION,
  embeddings: false,
  vectorSearch: false,
  weightsFineTuneRl: false,
  bakeoffRerun: false,
  delegatedAutonomyActivated: DELEGATED_AUTONOMY_ACTIVATED,
  autonomousLearningImplemented: AUTONOMOUS_LEARNING_IMPLEMENTED,
  defaultApprovalMode: DEFAULT_APPROVAL_MODE,
  webpageCannotBecomeOwnerPolicy: true,
  tpk001AutoApproved: false,
  distinctions: LEARNING_DISTINCTIONS,
  note: "Owner-pasted training is owner-approved for that workspace. External/public-derived packets still require owner approval. Search integration does not exist. Stored ≠ retrieved ≠ used ≠ correctly applied ≠ improved.",
};

export { EPISODE_OUTCOMES };

function nowIso() {
  return new Date().toISOString();
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

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
}

function tokenSet(text) {
  return new Set(tokenize(text));
}

function jaccard(a, b) {
  const A = a instanceof Set ? a : tokenSet(a);
  const B = b instanceof Set ? b : tokenSet(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function workspaceOf(store, id) {
  return store.getWorkspace && store.getWorkspace(id);
}

function assertWorkspace(store, workspaceId) {
  if (!workspaceId) {
    const err = new Error("workspaceId is required.");
    err.code = "WORKSPACE_REQUIRED";
    throw err;
  }
  const ws = workspaceOf(store, workspaceId);
  if (!ws) {
    const err = new Error("workspace not found.");
    err.code = "WORKSPACE_NOT_FOUND";
    throw err;
  }
  return ws;
}

export function assertSameWorkspace(store, workspaceId, employeeId, knowledgeItem) {
  const emp = employeeId ? resolveEmployee(store, employeeId) : null;
  if (employeeId && !emp) {
    const err = new Error("Unknown employee: " + employeeId);
    err.code = "EMPLOYEE_NOT_FOUND";
    throw err;
  }
  if (emp && emp.workspaceId && emp.workspaceId !== workspaceId) {
    const err = new Error("Cross-workspace lesson share refused.");
    err.code = "CROSS_WORKSPACE";
    throw err;
  }
  const ws = workspaceOf(store, workspaceId);
  const isolated = isIsolatedOwnerWorkspace(ws);
  if (isolated && emp && emp.workspaceId !== workspaceId) {
    const err = new Error("Cross-workspace lesson share refused.");
    err.code = "CROSS_WORKSPACE";
    throw err;
  }
  if (knowledgeItem) {
    const kidWs = knowledgeItem.workspaceId || knowledgeItem.workspace || null;
    if (kidWs && kidWs !== workspaceId) {
      const err = new Error("Cross-workspace lesson share refused.");
      err.code = "CROSS_WORKSPACE";
      throw err;
    }
    if (isolated && kidWs !== workspaceId) {
      const err = new Error("Cross-workspace lesson share refused.");
      err.code = "CROSS_WORKSPACE";
      throw err;
    }
  }
  return emp;
}

function intakeText(store, workspaceId) {
  const ws = workspaceOf(store, workspaceId) || {};
  const signals = collectWorkspaceSignals(ws);
  const existing = ((store.listKnowledge && store.listKnowledge()) || [])
    .filter((k) => (k.workspaceId === workspaceId || k.workspace === workspaceId) && (k.reviewStatus === "approved" || k.accepted === true))
    .map((k) => k.statement || k.excerpt || "")
    .join(" ");
  return [signals.text, existing, ws.description, ws.name].filter(Boolean).join("\n");
}

function lessonIsCorroboration(store, workspaceId, statements, excludeIds) {
  const skip = new Set(excludeIds || []);
  const known = intakeText(store, workspaceId);
  const existing = ((store.listKnowledge && store.listKnowledge()) || [])
    .filter((k) => {
      if (skip.has(k.id)) return false;
      if (!(k.workspaceId === workspaceId || k.workspace === workspaceId)) return false;
      return k.reviewStatus === "approved" || k.accepted === true;
    })
    .map((k) => k.statement || "")
    .join(" ");
  const blob = known + "\n" + existing;
  const lesson = (statements || []).join(" ");
  const score = jaccard(lesson, blob);
  return { onlyCorroborates: score >= 0.45, score: score };
}

export function classifyTrainingFinding(payload) {
  const classification = String((payload && payload.classification) || "");
  const sourceType = String((payload && payload.sourceType) || "owner_paste");
  if (!CLASSIFICATIONS.includes(classification)) {
    const err = new Error("classification is required and must be one of: " + CLASSIFICATIONS.join(", "));
    err.code = "CLASSIFICATION_REQUIRED";
    throw err;
  }
  if ((EXTERNAL_SOURCE_TYPES.has(sourceType) || sourceType === "external_webpage") && classification === "owner_policy") {
    const err = new Error("A webpage or external source cannot become owner policy. Choose a non-policy classification, or write an explicit owner-authored rule.");
    err.code = "WEBPAGE_NOT_POLICY";
    throw err;
  }
  return { classification: classification, sourceType: sourceType };
}

export function identifyKnowledgeGap(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const employeeId = payload && (payload.employeeId || payload.targetEmployeeId);
  if (employeeId) assertSameWorkspace(store, workspaceId, employeeId, null);
  const emp = employeeId ? resolveEmployee(store, employeeId) : null;
  const statement = String((payload && (payload.statement || payload.gap || payload.text)) || "").trim();
  if (statement.length < 8) {
    const err = new Error("Knowledge gap statement is required.");
    err.code = "GAP_REQUIRED";
    throw err;
  }
  const leaks = leakScanProduct(statement);
  if (leaks.length) {
    const err = new Error("Gap rejected by leak scan: " + leaks.join(","));
    err.code = "LEAK";
    throw err;
  }
  const id = (payload && payload.id) || nextId(((store.listKnowledgeGaps && store.listKnowledgeGaps()) || []).map((g) => g.id), "GAP-");
  const rec = {
    id: id,
    workspaceId: workspaceId,
    employeeId: emp && emp.id || null,
    roleId: emp && emp.roleId || (payload && payload.roleId) || null,
    statement: statement.slice(0, 600),
    status: (payload && payload.status) || "open",
    source: (payload && payload.source) || "owner",
    createdAt: nowIso(),
    persistence: "FILE_STORE",
    inspectable: true,
    note: "Persisted knowledge gap. Not a search query. Search integration does not exist.",
  };
  store.putKnowledgeGap(rec);
  return { ok: true, gap: rec, honesty: TRAINING_CYCLE_HONESTY };
}

export function researchGapFromOwnerMaterials(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const gapId = payload && payload.gapId;
  const gap = gapId && store.getKnowledgeGap ? store.getKnowledgeGap(gapId) : null;
  if (gapId && !gap) {
    const err = new Error("knowledge gap not found: " + gapId);
    err.code = "GAP_NOT_FOUND";
    throw err;
  }
  const researcherId = payload && (payload.researcherEmployeeId || payload.employeeId);
  if (researcherId) assertSameWorkspace(store, workspaceId, researcherId, null);
  const researcher = researcherId ? resolveEmployee(store, researcherId) : null;
  const materials = Array.isArray(payload && payload.materials) ? payload.materials : [];
  const ownerText = String((payload && (payload.text || payload.ownerText)) || "").trim();
  const ownerUrl = String((payload && (payload.url || payload.ownerUrl)) || "").trim();
  if (ownerText) materials.push({ kind: "owner_text", text: ownerText });
  if (ownerUrl) materials.push({ kind: "owner_url", url: ownerUrl, text: String((payload && payload.urlText) || ownerUrl) });
  if (payload && payload.useApprovedWorkspaceKnowledge !== false) {
    const approved = ((store.listKnowledge && store.listKnowledge()) || []).filter((k) => {
      if (!(k.workspaceId === workspaceId || k.workspace === workspaceId)) return false;
      return k.reviewStatus === "approved" || k.accepted === true;
    });
    for (const k of approved.slice(0, 12)) {
      materials.push({ kind: "approved_workspace_knowledge", knowledgeItemId: k.id, text: k.statement || k.excerpt });
    }
  }
  if (!materials.length) {
    const err = new Error("Research requires owner-provided text, a URL the owner supplied, or approved workspace knowledge. Search integration does not exist. No invented internet crawl.");
    err.code = "NO_RESEARCH_MATERIALS";
    throw err;
  }
  const findings = [];
  const existingFindingIds = ((store.listTeachingFindings && store.listTeachingFindings()) || []).map((f) => f.id);
  for (const mat of materials) {
    const text = String((mat && (mat.text || mat.body || mat.statement)) || "").trim();
    if (!text || text.length < 12) continue;
    const sourceType = mat.kind === "owner_url" || mat.kind === "external_webpage" ? "external_webpage" : (mat.kind === "approved_workspace_knowledge" ? "owner_paste" : "owner_paste");
    let classification = String((mat && mat.classification) || (payload && payload.classification) || (sourceType === "external_webpage" ? "external_sourced_fact" : "company_fact"));
    if (sourceType === "external_webpage" && classification === "owner_policy") {
      classification = "external_sourced_fact";
    }
    classifyTrainingFinding({ classification: classification, sourceType: sourceType });
    const id = nextId(existingFindingIds.concat(findings.map((f) => f.id)), "TFN-");
    existingFindingIds.push(id);
    const rec = {
      id: id,
      workspaceId: workspaceId,
      gapId: gap && gap.id || null,
      researcherEmployeeId: researcher && researcher.id || null,
      researcherRoleId: researcher && researcher.roleId || null,
      type: classification === "vendor_claim" ? "vendor_marketing_claim" : (classification === "hypothesis" ? "cautious_inference" : "directly_supported_fact"),
      classification: classification,
      sourceType: sourceType,
      claim: text.slice(0, 280),
      excerpt: text.slice(0, 240),
      sourceId: mat.knowledgeItemId || mat.url || "owner-material",
      url: mat.url || null,
      becameOwnerPolicy: false,
      searchUsed: false,
      liveFetch: false,
      inventedCrawl: false,
      createdAt: nowIso(),
    };
    if (store.putTeachingFinding) store.putTeachingFinding(rec);
    findings.push(rec);
  }
  if (gap && store.putKnowledgeGap) {
    store.putKnowledgeGap({ ...gap, status: "researched", researchedAt: nowIso(), findingIds: findings.map((f) => f.id) });
  }
  return {
    ok: true,
    gap: gap && store.getKnowledgeGap(gap.id) || gap,
    findings: findings,
    searchUsed: false,
    liveFetch: false,
    inventedCrawl: false,
    honesty: TRAINING_CYCLE_HONESTY,
    note: "Findings come from owner-provided text/URLs or approved workspace knowledge. A webpage cannot silently become owner policy.",
  };
}

export function proposeExternalTeachingPacket(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const sourceType = String((payload && payload.sourceType) || "external_webpage");
  const classification = String((payload && payload.classification) || "external_sourced_fact");
  classifyTrainingFinding({ classification: classification, sourceType: sourceType });
  const text = String((payload && (payload.text || payload.body)) || "").trim();
  if (!text) {
    const err = new Error("External packet text is required.");
    err.code = "EMPTY_TEXT";
    throw err;
  }
  const leaks = leakScanProduct(text);
  if (leaks.length) {
    const err = new Error("Packet rejected by leak scan: " + leaks.join(","));
    err.code = "LEAK";
    throw err;
  }
  const targetEmployeeIds = Array.isArray(payload && payload.targetEmployeeIds) ? payload.targetEmployeeIds.map(String) : [];
  for (const eid of targetEmployeeIds) assertSameWorkspace(store, workspaceId, eid, null);
  const recipient = targetEmployeeIds[0] ? resolveEmployee(store, targetEmployeeIds[0]) : null;
  const finding = {
    id: nextId(((store.listTeachingFindings && store.listTeachingFindings()) || []).map((f) => f.id), "TFN-"),
    workspaceId: workspaceId,
    type: classification === "vendor_claim" ? "vendor_marketing_claim" : "directly_supported_fact",
    classification: classification,
    claim: text.slice(0, 280),
    excerpt: text.slice(0, 240),
    sourceId: (payload && payload.sourceId) || "external-owner-url",
    becameOwnerPolicy: false,
  };
  if (store.putTeachingFinding) store.putTeachingFinding(finding);
  const packetResult = createTeachingPacket(store, {
    workspaceId: workspaceId,
    findings: [finding],
    passages: [],
    sources: [{ id: finding.sourceId }],
    recipientEmployeeId: recipient && recipient.id || null,
    recipientRoleId: recipient && recipient.roleId || null,
    whenApplicable: "Supervised internal work in " + workspaceId + " after owner approval. Not outreach. Not policy.",
    status: "awaiting_owner_approval",
  });
  const packet = packetResult.packet;
  if (packet && store.putTeachingPacket) {
    store.putTeachingPacket({
      ...packet,
      title: (payload && payload.title) || "External sourced teaching packet",
      classification: classification,
      sourceType: sourceType,
      status: "awaiting_owner_approval",
      silentlyAutoApproved: false,
      defaultOwnerApprovalRequired: true,
      recipientEmployeeId: recipient && recipient.id || packet.recipientEmployeeId,
      recipientRoleId: recipient && recipient.roleId || packet.recipientRoleId,
      targetEmployeeIds: targetEmployeeIds,
    });
  }
  return {
    ok: true,
    packet: store.getTeachingPacket(packet.id),
    deliveredAsApproved: false,
    ownerApprovalRequired: true,
    ownerApprovalOccurred: false,
    honesty: TRAINING_CYCLE_HONESTY,
  };
}

export function deliverTeachingPacket(store, packetId, payload) {
  const packet = store.getTeachingPacket && store.getTeachingPacket(packetId);
  if (!packet) {
    const err = new Error("teaching packet not found: " + packetId);
    err.code = "PACKET_NOT_FOUND";
    throw err;
  }
  if (packetId === "TPK-001" || (packet.approvalRequestId === "APR-005")) {
    const err = new Error("TPK-001 / APR-005 is still awaiting owner approval and cannot be delivered as approved.");
    err.code = "PACKET_PENDING";
    throw err;
  }
  if (packet.status !== "approved_for_supervised_use") {
    const err = new Error("External/public packet cannot be delivered as approved without owner approval. Status: " + packet.status);
    err.code = "PACKET_NOT_APPROVED";
    throw err;
  }
  const workspaceId = packet.workspaceId;
  const employeeId = payload && (payload.employeeId || payload.targetEmployeeId) || packet.recipientEmployeeId;
  assertSameWorkspace(store, workspaceId, employeeId, null);
  return { ok: true, delivered: true, packetId: packet.id, employeeId: employeeId, status: packet.status };
}

export function shareApprovedKnowledge(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const knowledgeItemId = payload && (payload.knowledgeItemId || (payload.knowledgeItemIds && payload.knowledgeItemIds[0]));
  const item = store.getKnowledge && store.getKnowledge(knowledgeItemId);
  if (!item) {
    const err = new Error("knowledge item not found: " + knowledgeItemId);
    err.code = "KNOWLEDGE_NOT_FOUND";
    throw err;
  }
  const approved = item.reviewStatus === "approved" || item.accepted === true;
  if (!approved) {
    const err = new Error("Only approved workspace knowledge can be shared. Pending lessons stay pending.");
    err.code = "NOT_APPROVED";
    throw err;
  }
  const targetEmployeeIds = Array.isArray(payload && payload.targetEmployeeIds) ? payload.targetEmployeeIds.map(String) : [];
  if (!targetEmployeeIds.length) {
    const err = new Error("Choose at least one employee in this workspace.");
    err.code = "TARGET_REQUIRED";
    throw err;
  }
  for (const eid of targetEmployeeIds) assertSameWorkspace(store, workspaceId, eid, item);
  return assignKnowledge(store, {
    workspaceId: workspaceId,
    knowledgeItemId: knowledgeItemId,
    knowledgeItemIds: payload.knowledgeItemIds || [knowledgeItemId],
    targetEmployeeIds: targetEmployeeIds,
    targetRoleIds: payload.targetRoleIds,
  });
}

function isFrozenVersionId(versionId) {
  return Boolean(versionId && Object.prototype.hasOwnProperty.call(FROZEN_HASHES, versionId));
}

function nextEmployeeVersionId(currentId) {
  const s = String(currentId || "");
  const m = s.match(/^(.*)-v(\d+)$/);
  if (!m) return s ? s + "-v1" : null;
  return m[1] + "-v" + (Number(m[2]) + 1);
}

export function maybeMintEmployeeVersion(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const employeeId = payload && payload.employeeId;
  assertWorkspace(store, workspaceId);
  const empRole = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  const emp = empRole || resolveEmployee(store, employeeId);
  if (!emp) {
    const err = new Error("employee not found");
    err.code = "EMPLOYEE_NOT_FOUND";
    throw err;
  }
  const currentId = emp.versionId;
  if (isFrozenVersionId(currentId) || workspaceId === "ws-ridgeline") {
    return {
      minted: false,
      reason: "frozen_or_ridgeline",
      versionId: currentId,
      note: "RidgeLine frozen versions are not rewritten. New versions are not minted on ws-ridgeline in this cycle.",
    };
  }
  if (!(payload && payload.warranted === true)) {
    return { minted: false, reason: "not_warranted", versionId: currentId, note: "No new version for a no-op or corroboration-only lesson." };
  }
  const lessonIds = (payload && payload.lessonItemIds) || [];
  if (!lessonIds.length) {
    return { minted: false, reason: "no_lesson_attached", versionId: currentId };
  }
  const nextIdV = nextEmployeeVersionId(currentId);
  if (!nextIdV || store.getVersion(nextIdV)) {
    return { minted: false, reason: "version_exists_or_invalid", versionId: currentId };
  }
  const agent = emp.agentId && store.getAgent ? store.getAgent(emp.agentId) : null;
  const parent = currentId && store.getVersion ? store.getVersion(currentId) : null;
  const now = nowIso();
  const declaredChange = "Attached approved owner lesson(s) " + lessonIds.join(",") + " to retrieval. Not a rewrite of a frozen RidgeLine version. Not promotion.";
  const versionPayload = {
    agentId: emp.agentId,
    parentVersionId: currentId || null,
    lessonItemIds: lessonIds,
    declaredChange: declaredChange,
    workspaceId: workspaceId,
    roleId: emp.roleId,
    retrievalPolicy: { enabled: true, method: RETRIEVAL_METHOD, workspaceOnly: true },
  };
  const version = {
    id: nextIdV,
    agentId: emp.agentId,
    parentVersionId: currentId || null,
    modelProfile: (parent && parent.modelProfile) || { provider: "none", model: "deterministic-" + emp.roleId },
    promptBundle: (parent && parent.promptBundle) || { system: emp.jobDescription || emp.objective || "", developer: "Use assigned approved workspace lessons. Lexical/deterministic retrieval. Gold is not available." },
    outputSchema: (parent && parent.outputSchema) || { "type": "object" },
    retrievalPolicy: versionPayload.retrievalPolicy,
    curriculumSnapshotId: null,
    allowedTools: emp.allowedTools || emp.tools || [],
    createdAt: now,
    contentHash: contentHash(versionPayload),
    declaredChange: declaredChange,
    workspaceId: workspaceId,
    roleId: emp.roleId,
    immutable: true,
    lessonItemIds: lessonIds,
    candidate: true,
    promoted: false,
  };
  store.putVersion(version);
  if (empRole) {
    store.putEmployeeRole({ ...empRole, versionId: nextIdV, skillTags: mergeSkills(empRole.skillTags, payload && payload.skillTags) });
  }
  if (agent) {
    const history = Array.isArray(agent.versionHistory) ? agent.versionHistory.slice() : [];
    if (!history.includes(nextIdV)) history.push(nextIdV);
    store.putAgent({ ...agent, versionHistory: history });
  }
  return { minted: true, versionId: nextIdV, parentVersionId: currentId, version: version };
}

function mergeSkills(existing, extra) {
  const out = [];
  for (const s of [].concat(existing || [], extra || [])) {
    const t = String(s || "").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function taskResultBlob(output) {
  if (!output) return "";
  const copy = { ...output };
  delete copy.alreadyKnown;
  delete copy.usedLessons;
  delete copy.fromApprovedKnowledge;
  return JSON.stringify(copy);
}

function distinctiveTokens(statements) {
  const stop = new Set(["the", "and", "for", "that", "this", "with", "from", "owner", "stated", "unknown", "not", "are", "was"]);
  const toks = new Set();
  for (const s of statements || []) {
    for (const t of tokenize(s)) {
      if (t.length >= 5 && !stop.has(t)) toks.add(t);
    }
  }
  return toks;
}

export function runBeforeAfterCheck(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const employeeId = payload && payload.employeeId;
  const emp = assertSameWorkspace(store, workspaceId, employeeId, null);
  const role = store.getEmployeeRole && store.getEmployeeRole(emp.id);
  const handler = ROLE_HANDLERS[emp.roleId];
  const lessonItemIds = Array.isArray(payload && payload.lessonItemIds) ? payload.lessonItemIds : [];
  const approvedLessons = lessonItemIds.map((id) => store.getKnowledge && store.getKnowledge(id)).filter(Boolean);
  const pendingLesson = approvedLessons.some((k) => k.reviewStatus !== "approved" && k.accepted !== true);
  const packetPending = (payload && payload.awaitingOwnerApproval === true)
    || (payload && payload.packetId === "TPK-001")
    || pendingLesson;
  if (!handler || !(role && role.implementationStatus === "implemented_basic")) {
    const episode = persistEpisode(store, {
      workspaceId: workspaceId,
      employeeId: emp.id,
      roleId: emp.roleId,
      lessonItemIds: lessonItemIds,
      outcome: "blocked",
      reasons: ["No implemented handler for this role."],
      stored: lessonItemIds.length > 0,
      retrieved: false,
      used: false,
      correctlyApplied: false,
      improved: false,
      handlerId: emp.roleId,
    });
    return { ok: true, outcome: "blocked", episode: episode, sameHandler: true, honesty: TRAINING_CYCLE_HONESTY };
  }
  if (packetPending) {
    const episode = persistEpisode(store, {
      workspaceId: workspaceId,
      employeeId: emp.id,
      roleId: emp.roleId,
      lessonItemIds: lessonItemIds,
      packetId: payload && payload.packetId || null,
      outcome: "awaiting_owner_approval",
      reasons: ["Owner approval has not occurred. Pending lesson is not applied."],
      stored: lessonItemIds.length > 0,
      retrieved: false,
      used: false,
      correctlyApplied: false,
      improved: false,
      handlerId: emp.roleId,
    });
    return { ok: true, outcome: "awaiting_owner_approval", episode: episode, sameHandler: true, honesty: TRAINING_CYCLE_HONESTY };
  }
  const statements = approvedLessons.map((k) => k.statement || k.excerpt || "");
  const corroboration = lessonIsCorroboration(store, workspaceId, statements, lessonItemIds);
  const objective = String((payload && (payload.objective || payload.ownerText || payload.input)) || emp.objective || "Restate owner facts for this workspace only.");
  const taskKind = payload && payload.taskKind || null;
  const before = runEmployeeTask(store, emp.id, {
    ownerText: objective,
    input: objective,
    taskKind: taskKind,
    excludeKnowledgeIds: lessonItemIds,
    checkKind: "before",
  });
  const after = runEmployeeTask(store, emp.id, {
    ownerText: objective,
    input: objective,
    taskKind: taskKind,
    checkKind: "after",
  });
  const beforeOut = before.task && before.task.output || {};
  const afterOut = after.task && after.task.output || {};
  const beforeResult = taskResultBlob(beforeOut);
  const afterResult = taskResultBlob(afterOut);
  const afterAll = JSON.stringify(afterOut);
  const lessonToks = distinctiveTokens(statements);
  let used = false;
  let correctlyApplied = false;
  for (const t of lessonToks) {
    if (afterAll.toLowerCase().includes(t)) used = true;
    if (afterResult.toLowerCase().includes(t) && !beforeResult.toLowerCase().includes(t)) correctlyApplied = true;
  }
  const retrieved = approvedLessons.some((k) => k.enteredRetrievalIndex === true || k.reviewStatus === "approved" || k.accepted === true);
  let outcome = "unchanged";
  const reasons = [];
  if (corroboration.onlyCorroborates) {
    outcome = "unchanged";
    reasons.push("Lesson only restates known intake or already-approved facts. Corroboration is not improvement.");
  } else if (correctlyApplied && retrieved && used) {
    outcome = "improved";
    reasons.push("Same handler. Post-lesson task result uses distinctive approved lesson content that the baseline lacked.");
  } else if (used && !correctlyApplied) {
    outcome = "unchanged";
    reasons.push("Lesson was listed or retrieved but did not change the task result. Used ≠ correctly applied ≠ improved.");
  } else if (retrieved && !used) {
    outcome = "unchanged";
    reasons.push("Lesson was stored/retrieved but unused.");
  } else {
    outcome = "unchanged";
    reasons.push("No material improvement against predeclared criteria. Positive delta was not invented.");
  }
  if (outcome === "improved" && corroboration.onlyCorroborates) {
    outcome = "unchanged";
    reasons.push("Override: corroboration-only cannot be recorded as improved.");
  }
  const episode = persistEpisode(store, {
    workspaceId: workspaceId,
    employeeId: emp.id,
    roleId: emp.roleId,
    lessonItemIds: lessonItemIds,
    trainingRecordId: payload && payload.trainingRecordId || null,
    packetId: payload && payload.packetId || null,
    gapId: payload && payload.gapId || null,
    outcome: outcome,
    reasons: reasons,
    stored: lessonItemIds.length > 0,
    retrieved: retrieved,
    used: used,
    correctlyApplied: correctlyApplied,
    improved: outcome === "improved",
    onlyCorroborates: corroboration.onlyCorroborates,
    corroborationScore: corroboration.score,
    handlerId: emp.roleId,
    sameHandler: true,
    objective: objective,
    baseline: { taskId: before.task.id, summary: beforeOut.summary || null },
    post: { taskId: after.task.id, summary: afterOut.summary || null },
    inventedPositiveDelta: false,
  });
  return {
    ok: true,
    outcome: outcome,
    episode: episode,
    before: before.task,
    after: after.task,
    sameHandler: true,
    handlerId: emp.roleId,
    onlyCorroborates: corroboration.onlyCorroborates,
    distinctions: {
      stored: lessonItemIds.length > 0,
      retrieved: retrieved,
      used: used,
      correctlyApplied: correctlyApplied,
      improved: outcome === "improved",
    },
    honesty: TRAINING_CYCLE_HONESTY,
  };
}

function persistEpisode(store, fields) {
  const id = nextId(((store.listLearningEpisodes && store.listLearningEpisodes()) || []).map((e) => e.id), "LEP-");
  const rec = {
    id: id,
    workspaceId: fields.workspaceId,
    employeeId: fields.employeeId,
    roleId: fields.roleId,
    lessonItemIds: fields.lessonItemIds || [],
    trainingRecordId: fields.trainingRecordId || null,
    packetId: fields.packetId || null,
    gapId: fields.gapId || null,
    outcome: fields.outcome,
    outcomesAllowed: EPISODE_OUTCOMES.slice(),
    reasons: fields.reasons || [],
    stored: fields.stored === true,
    retrieved: fields.retrieved === true,
    used: fields.used === true,
    correctlyApplied: fields.correctlyApplied === true,
    improved: fields.improved === true,
    onlyCorroborates: fields.onlyCorroborates === true,
    corroborationScore: fields.corroborationScore != null ? fields.corroborationScore : null,
    handlerId: fields.handlerId,
    sameHandler: fields.sameHandler !== false,
    objective: fields.objective || null,
    baseline: fields.baseline || null,
    post: fields.post || null,
    inventedPositiveDelta: false,
    bakeoffRerun: false,
    liveProviderCall: false,
    retrievalMethod: RETRIEVAL_METHOD,
    comparable: {
      sameModel: true,
      sameRole: true,
      sameHandler: true,
      sameObjective: true,
      sameEvaluator: fields.handlerId,
      changedVariable: "approved_lesson",
      bakeoffRerun: false,
    },
    createdAt: nowIso(),
    persistence: "FILE_STORE",
    note: "Stored ≠ retrieved ≠ used ≠ correctly applied ≠ improved.",
  };
  store.putLearningEpisode(rec);
  const checkId = nextId(((store.listLearningChecks && store.listLearningChecks()) || []).map((c) => c.id), "LCHK-");
  if (store.putLearningCheck) {
    store.putLearningCheck({
      id: checkId,
      workspaceId: fields.workspaceId,
      episodeId: id,
      employeeId: fields.employeeId,
      outcome: fields.outcome,
      createdAt: rec.createdAt,
    });
  }
  return rec;
}

function mergeEmployeeSkills(store, employeeId, skillTags) {
  const role = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  if (!role || !skillTags || !skillTags.length) return role;
  const next = { ...role, skillTags: mergeSkills(role.skillTags, skillTags) };
  store.putEmployeeRole(next);
  return next;
}

export function runOwnerTrainingCycle(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const targetEmployeeIds = Array.isArray(payload && payload.targetEmployeeIds) ? payload.targetEmployeeIds.map(String) : [];
  if (!targetEmployeeIds.length) {
    const err = new Error("Choose at least one employee in this workspace.");
    err.code = "TARGET_REQUIRED";
    throw err;
  }
  for (const eid of targetEmployeeIds) assertSameWorkspace(store, workspaceId, eid, null);

  const sourceType = String((payload && payload.sourceType) || "owner_paste");
  const classification = String((payload && payload.classification) || "procedure");
  classifyTrainingFinding({ classification: classification, sourceType: sourceType });

  const isExternal = EXTERNAL_SOURCE_TYPES.has(sourceType) || sourceType === "external_webpage";
  const ownerAuthored = sourceType === "owner_authored" || sourceType === "owner_paste" || sourceType === "owner_markdown" || sourceType === "owner_pdf";

  const gapStatement = String((payload && (payload.gap || payload.gapStatement)) || "").trim()
    || ("Employee lacks: " + String((payload && payload.title) || "owner-provided lesson"));
  const gapOut = identifyKnowledgeGap(store, {
    workspaceId: workspaceId,
    employeeId: targetEmployeeIds[0],
    statement: gapStatement,
    source: "owner",
  });

  if (isExternal) {
    const research = researchGapFromOwnerMaterials(store, {
      workspaceId: workspaceId,
      gapId: gapOut.gap.id,
      researcherEmployeeId: payload.researcherEmployeeId || targetEmployeeIds[0],
      text: payload.text,
      url: payload.url,
      classification: classification,
      useApprovedWorkspaceKnowledge: true,
    });
    const packetOut = proposeExternalTeachingPacket(store, {
      workspaceId: workspaceId,
      sourceType: sourceType,
      classification: classification,
      text: payload.text,
      title: payload.title,
      targetEmployeeIds: targetEmployeeIds,
    });
    const checks = [];
    for (const eid of targetEmployeeIds) {
      checks.push(runBeforeAfterCheck(store, {
        workspaceId: workspaceId,
        employeeId: eid,
        lessonItemIds: [],
        packetId: packetOut.packet && packetOut.packet.id,
        gapId: gapOut.gap.id,
        awaitingOwnerApproval: true,
        objective: payload.objective || payload.guidance || gapStatement,
      }));
    }
    createAutonomyPolicyInterface(store, {
      approvedDomains: [],
      maxPagesPerObjective: 0,
    });
    return {
      ok: true,
      cycle: TRAINING_CYCLE,
      workspaceId: workspaceId,
      gap: gapOut.gap,
      research: research,
      ingest: null,
      packet: packetOut.packet,
      deliveredAsApproved: false,
      ownerApprovalRequired: true,
      ownerApprovalOccurred: false,
      version: { minted: false, reason: "pending_owner_approval" },
      checks: checks,
      episode: checks[0] && checks[0].episode || null,
      honesty: TRAINING_CYCLE_HONESTY,
      liveProviderCall: false,
    };
  }

  const ingest = ingestOwnerTraining(store, {
    workspaceId: workspaceId,
    title: payload.title,
    classification: classification,
    sourceType: ownerAuthored ? sourceType : "owner_paste",
    text: payload.text,
    markdown: payload.markdown,
    pdfBase64: payload.pdfBase64,
    filename: payload.filename,
    targetEmployeeIds: targetEmployeeIds,
    targetRoleIds: payload.targetRoleIds,
    skillTags: payload.skillTags,
    guidance: payload.guidance,
  });

  const approved = ingest.record.ownerApprovalStatus === "approved";
  const lessonItemIds = (ingest.items || []).map((i) => i.id);
  const statements = (ingest.items || []).map((i) => i.statement);
  const corroboration = lessonIsCorroboration(store, workspaceId, statements, lessonItemIds);
  const material = approved && lessonItemIds.length > 0 && !corroboration.onlyCorroborates;

  if (gapOut.gap && store.putKnowledgeGap) {
    store.putKnowledgeGap({
      ...gapOut.gap,
      status: approved ? "taught" : "open",
      trainingRecordId: ingest.record.id,
      knowledgeItemIds: lessonItemIds,
      updatedAt: nowIso(),
    });
  }

  const versions = [];
  if (approved) {
    for (const eid of targetEmployeeIds) {
      mergeEmployeeSkills(store, eid, payload.skillTags || ingest.record.skillTags);
      const minted = maybeMintEmployeeVersion(store, {
        workspaceId: workspaceId,
        employeeId: eid,
        warranted: material,
        lessonItemIds: lessonItemIds,
        skillTags: payload.skillTags,
      });
      versions.push({ employeeId: eid, ...minted });
      if (minted.minted && ingest.record) {
        store.putTrainingStudioRecord({ ...ingest.record, enteredVersion: true, versionIds: (ingest.record.versionIds || []).concat([minted.versionId]) });
      }
    }
  }

  const checks = [];
  for (const eid of targetEmployeeIds) {
    checks.push(runBeforeAfterCheck(store, {
      workspaceId: workspaceId,
      employeeId: eid,
      lessonItemIds: approved ? lessonItemIds : [],
      trainingRecordId: ingest.record.id,
      gapId: gapOut.gap.id,
      awaitingOwnerApproval: !approved,
      objective: payload.objective || payload.guidance || ingest.record.title,
    }));
  }

  createAutonomyPolicyInterface(store, {
    approvedDomains: [],
    maxPagesPerObjective: 0,
  });

  return {
    ok: true,
    cycle: TRAINING_CYCLE,
    workspaceId: workspaceId,
    gap: store.getKnowledgeGap(gapOut.gap.id),
    ingest: ingest,
    packet: null,
    deliveredAsApproved: approved,
    ownerApprovalRequired: !approved,
    ownerApprovalOccurred: approved && ownerAuthored,
    version: versions[0] || { minted: false },
    versions: versions,
    checks: checks,
    episode: checks[0] && checks[0].episode || null,
    distinctions: checks[0] && checks[0].distinctions || null,
    honesty: TRAINING_CYCLE_HONESTY,
    liveProviderCall: false,
    bakeoffRerun: false,
  };
}

export function trainingCycleView(store, extras) {
  const workspaceId = extras && extras.workspaceId;
  const employees = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).map((e) => ({
    id: e.id, name: e.name || e.roleTitle, roleTitle: e.roleTitle || e.name, workspaceId: e.workspaceId, skillTags: e.skillTags || [],
  }));
  const companies = ((store.listWorkspaces && store.listWorkspaces()) || []).map((c) => ({ id: c.id, name: c.name }));
  const records = (store.listTrainingStudioRecords && store.listTrainingStudioRecords(workspaceId)) || [];
  const gaps = (store.listKnowledgeGaps && store.listKnowledgeGaps(workspaceId)) || [];
  const episodes = (store.listLearningEpisodes && store.listLearningEpisodes(workspaceId)) || [];
  const packets = (store.listTeachingPackets && store.listTeachingPackets(workspaceId)) || [];
  return {
    persistence: "FILE_STORE",
    honesty: { ...PRODUCT_HONESTY, ...TRAINING_CYCLE_HONESTY },
    cycle: TRAINING_CYCLE,
    classifications: CLASSIFICATIONS,
    sourceTypes: SOURCE_TYPES,
    companies: companies,
    employees: employees,
    records: records,
    gaps: gaps,
    episodes: episodes.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      outcome: e.outcome,
      stored: e.stored,
      retrieved: e.retrieved,
      used: e.used,
      correctlyApplied: e.correctlyApplied,
      improved: e.improved,
      reasons: e.reasons,
      createdAt: e.createdAt,
    })),
    packets: packets.map((p) => ({
      id: p.id,
      status: p.status,
      title: p.title || p.id,
      applied: p.status === "approved_for_supervised_use",
      pending: p.status === "awaiting_owner_approval" || p.status === "proposed",
    })),
    pdfWired: true,
    webpageCannotBecomePolicy: true,
    checkLessonAvailable: true,
    distinctions: LEARNING_DISTINCTIONS,
    note: "Owner Training Studio plus the Checkpoint 25 learning cycle. Paste a lesson, pick employees, inspect View Brain, run a lightweight before/after. External packets stay pending. TPK-001 is not applied.",
  };
}

export function enrichEmployeeBrain(store, brain) {
  if (!brain || brain.error) return brain;
  const emp = brain.employee || {};
  const workspaceId = emp.workspaceId;
  const role = emp.id && store.getEmployeeRole ? store.getEmployeeRole(emp.id) : null;
  const skillSet = mergeSkills(role && role.skillTags, []);
  for (const k of brain.whatItKnows || []) {
    for (const t of k.skillTags || []) skillSet.push ? null : null;
    for (const t of k.skillTags || []) {
      if (t && !skillSet.includes(t)) skillSet.push(t);
    }
  }
  const episodes = ((store.listLearningEpisodes && store.listLearningEpisodes(workspaceId)) || []).filter((e) => {
    return e.employeeId === emp.id || e.employeeId === emp.agentId;
  });
  const gaps = ((store.listKnowledgeGaps && store.listKnowledgeGaps(workspaceId)) || []).filter((g) => {
    return !g.employeeId || g.employeeId === emp.id;
  });
  const latest = episodes.slice(-1)[0] || null;
  brain.skills = skillSet;
  brain.skillTags = skillSet;
  brain.learningEpisodes = episodes.map((e) => ({
    id: e.id,
    outcome: e.outcome,
    stored: e.stored,
    retrieved: e.retrieved,
    used: e.used,
    correctlyApplied: e.correctlyApplied,
    improved: e.improved,
    reasons: e.reasons,
    createdAt: e.createdAt,
    trainingRecordId: e.trainingRecordId || null,
  }));
  brain.knowledgeGaps = gaps.map((g) => ({ id: g.id, statement: g.statement, status: g.status }));
  brain.learningDistinctions = {
    labels: LEARNING_DISTINCTIONS,
    latest: latest ? {
      stored: latest.stored === true,
      retrieved: latest.retrieved === true,
      used: latest.used === true,
      correctlyApplied: latest.correctlyApplied === true,
      improved: latest.improved === true,
      outcome: latest.outcome,
    } : {
      stored: (brain.whatItKnows || []).length > 0,
      retrieved: (brain.whatItKnows || []).some((k) => k.enteredRetrievalIndex === true),
      used: false,
      correctlyApplied: false,
      improved: false,
      outcome: null,
    },
  };
  brain.pendingVersusApproved = {
    approvedLessons: (brain.documentsAndLessons && brain.documentsAndLessons.approvedLessons) || [],
    pendingLessons: (brain.documentsAndLessons && brain.documentsAndLessons.pendingLessons) || [],
    approvedKnowledge: (brain.whatItKnows || []).filter((k) => k.reviewStatus === "approved" || k.accepted === true),
    pendingKnowledge: (brain.whatItKnows || []).filter((k) => k.reviewStatus !== "approved" && k.accepted !== true),
    note: "Pending is not treated as known. A pending teaching packet is not applied.",
  };
  const tasks = ((store.listEmployeeTasks && store.listEmployeeTasks(workspaceId)) || []).filter((x) => x.employeeId === emp.id || x.agentId === emp.agentId);
  const recent = tasks.slice(-1)[0] || null;
  const workTasks = ((store.listTasks && store.listTasks()) || []).filter((x) => x.assignedEmployeeId === emp.id);
  const recentWork = workTasks.slice(-1)[0] || null;
  const trace = (recentWork && recentWork.retrievalTrace) || (recent && recent.retrievalTrace) || null;
  brain.retrievedOnRecentTask = trace ? {
    taskId: (recentWork && recentWork.id) || (recent && recent.id) || null,
    retrieved: trace.retrieved || [],
    used: trace.used || [],
    ownerPastedUsed: trace.ownerPastedUsed || [],
    searchUsed: false,
    method: trace.method || "lexical_deterministic",
    note: "What was actually retrieved on the most recent task. Search integration does not exist. Not weights or finetune.",
  } : {
    taskId: null,
    retrieved: [],
    used: [],
    ownerPastedUsed: [],
    searchUsed: false,
    note: "No recent task retrieval trace yet.",
  };
  brain.weightsFineTuneRl = false;
  return brain;
}

function relevantRoleForFinding(finding) {
  const blob = String((finding && (finding.claim || finding.excerpt || finding.statement || finding.type)) || "").toLowerCase();
  if (/position|copy|audience|marketing|brand/.test(blob)) return "marketing";
  if (/feature|product|build|spec|roadmap/.test(blob)) return "product";
  if (/procedure|ops|staff|process/.test(blob)) return "ops";
  if (/budget|cost|price|unit/.test(blob)) return "finance";
  if (/offer|customer|positioning/.test(blob)) return "offer_strategist";
  return "business_research";
}

export function teachPeerFromFinding(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  assertWorkspace(store, workspaceId);
  const findingId = payload && (payload.findingId || payload.scoutFindingId || payload.teachingFindingId);
  const finding = (findingId && store.getTeachingFinding && store.getTeachingFinding(findingId))
    || (findingId && store.getScoutFinding && store.getScoutFinding(findingId))
    || (payload && payload.finding)
    || null;
  if (!finding) {
    const err = new Error("A same-workspace finding is required to teach a peer. Search integration does not exist.");
    err.code = "FINDING_REQUIRED";
    throw err;
  }
  if (finding.workspaceId && finding.workspaceId !== workspaceId) {
    const err = new Error("Peer teaching stays inside the same workspace. Isolation is application-level.");
    err.code = "OTHER_WORKSPACE";
    throw err;
  }
  const classification = String(finding.classification || finding.kind || finding.type || "hypothesis");
  const vendor = classification === "vendor_claim" || finding.type === "vendor_marketing_claim" || classification === "vendor_or_marketing_claim";
  const roleId = (payload && payload.recipientRoleId) || relevantRoleForFinding(finding);
  const employees = ((store.listEmployeeRoles && store.listEmployeeRoles(workspaceId)) || []).filter((e) => e.roleId === roleId);
  const recipient = employees[0] || null;
  if (!recipient) {
    const err = new Error("No authorized " + roleId + " employee on this workspace to receive the packet.");
    err.code = "NO_RECIPIENT";
    throw err;
  }
  const implications = roleId === "marketing"
    ? "Positioning implication only. Vendor claims stay vendor claims."
    : (roleId === "product" ? "Feature observation only. Vendor claims stay vendor claims." : "Same-workspace lesson. Vendor claims stay vendor claims.");
  const findingRec = {
    id: finding.id || nextId(((store.listTeachingFindings && store.listTeachingFindings()) || []).map((f) => f.id), "TFN-"),
    workspaceId: workspaceId,
    type: vendor ? "vendor_marketing_claim" : (finding.type || "directly_supported_fact"),
    classification: vendor ? "vendor_claim" : classification,
    claim: String(finding.claim || finding.statement || finding.excerpt || "").slice(0, 280),
    excerpt: String(finding.excerpt || finding.claim || finding.statement || "").slice(0, 240),
    sourceId: finding.sourceId || finding.id || "workspace-finding",
    becameOwnerPolicy: false,
    vendorClaimRemainsVendorClaim: vendor,
  };
  if (store.putTeachingFinding && !store.getTeachingFinding(findingRec.id)) store.putTeachingPacket && store.putTeachingFinding(findingRec);
  if (store.putTeachingFinding) store.putTeachingFinding(findingRec);
  const packet = {
    id: nextId(((store.listTeachingPackets && store.listTeachingPackets()) || []).map((x) => x.id), "TPK-"),
    workspaceId: workspaceId,
    status: (payload && payload.authorized === true) ? "approved_for_supervised_use" : "awaiting_owner_approval",
    teacherRoleId: (payload && payload.teacherRoleId) || "business_research",
    recipientRoleId: roleId,
    recipientEmployeeId: recipient.id,
    title: "Peer lesson for " + (recipient.roleTitle || roleId),
    implications: implications,
    vendorClaimRemainsVendorClaim: vendor,
    findingIds: [findingRec.id],
    createdAt: nowIso(),
    note: "Same-workspace peer teaching. Relevant role only. Vendor claims stay vendor claims. Not RidgeLine. Not TPK-001.",
  };
  store.putTeachingPacket(packet);
  return {
    ok: true,
    packet: packet,
    recipient: { id: recipient.id, roleId: recipient.roleId, workspaceId: workspaceId },
    vendorClaimRemainsVendorClaim: vendor,
    honesty: TRAINING_CYCLE_HONESTY,
  };
}

export function checkLessonAction(store, payload) {
  return runBeforeAfterCheck(store, payload);
}

