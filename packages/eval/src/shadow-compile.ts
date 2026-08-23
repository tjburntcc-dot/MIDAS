/** Non-version-producing preflight before creating an Atlas candidate. Not sealed eval. */

export const SHADOW_OUTCOMES = [
  "create_candidate_version",
  "skip_duplicate",
  "skip_not_retrievable",
  "skip_not_useful",
  "skip_policy_displacement",
  "owner_revision_required",
];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listShadowCompiles ? store.listShadowCompiles() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}/g) || [];
}

function tokenEstimate(items) {
  let n = 0;
  for (const k of items || []) n += Math.ceil(String((k && (k.statement || k.claim)) || "").length / 4);
  return n;
}

function isMandatoryPolicy(k) {
  if (!k) return false;
  if ((k.kind === "owner_policy" || k.claimKind === "owner_policy") && k.writtenByOwner === true) return true;
  return Boolean(k.applicability && k.applicability.effect === "exclude" && (k.applicability.priority || 0) >= 80);
}

function retrieveAgainstTask(items, taskText) {
  const q = new Set(tokenize(taskText));
  const scored = [];
  for (const k of items || []) {
    const toks = tokenize(k.statement || k.claim || "");
    let hits = 0;
    for (const t of toks) if (q.has(t)) hits += 1;
    scored.push({ id: k.id, hits: hits, statement: k.statement });
  }
  scored.sort((a, b) => b.hits - a.hits);
  const selected = scored.filter((s) => s.hits > 0).slice(0, 8);
  const dups = [];
  const seen = new Set();
  for (const s of selected) {
    const key = String(s.statement || "").slice(0, 40);
    if (seen.has(key)) dups.push(s.id);
    seen.add(key);
  }
  return { retrievedItemIds: selected.map((s) => s.id), duplicateSelectedContext: dups };
}

export function shadowCompile(store, payload) {
  const workspaceId = payload && payload.workspaceId;
  const parentId = payload && payload.parentVersionId;
  const parent = parentId && store.getVersion ? store.getVersion(parentId) : null;
  const parentSnap = parent && parent.curriculumSnapshotId && store.getCurriculumSnapshot
    ? store.getCurriculumSnapshot(parent.curriculumSnapshotId)
    : null;
  const parentIds = new Set((parentSnap && parentSnap.knowledgeItemIds) || []);
  const currentServing = (payload && payload.servingVersionId) || parentId;
  const proposed = (payload && (payload.proposedItems || payload.findings)) || [];
  const proposedAsItems = proposed.map((c, i) => ({
    id: c.knowledgeItemId || c.id || ("SHADOW-" + i),
    statement: c.claim || c.statement || "",
    kind: c.kind || "sourced_fact",
    claimKind: c.claimKind || "vendor_opinion",
    accepted: true,
    reviewStatus: "approved",
    workspaceId: workspaceId,
    excerpt: c.excerpt,
    topic: c.topic,
    signal: c.signal,
    applicability: c.applicability,
    writtenByOwner: c.writtenByOwner === true,
    sourceId: c.sourceId,
  }));
  const existing = (store.listKnowledge() || []).filter((k) => {
    if (!k) return false;
    if (workspaceId && k.workspaceId && k.workspaceId !== workspaceId && k.workspaceId !== "default") return false;
    if (k.reviewStatus === "rejected" || k.reviewStatus === "superseded") return false;
    return k.accepted === true || k.reviewStatus === "approved" || parentIds.has(k.id);
  });
  const combined = [];
  const seen = new Set();
  for (const k of existing.concat(proposedAsItems)) {
    if (!k || seen.has(k.id)) continue;
    seen.add(k.id);
    combined.push(k);
  }
  const scenario = (payload && payload.fictionalScenario) || {};
  const scenarioText = [scenario.title, scenario.text, scenario.ownerText]
    .filter(Boolean)
    .join(" ");
  const prospectsJson = Array.isArray(scenario.prospects) && scenario.prospects.length
    ? JSON.stringify(scenario.prospects)
    : "";
  const taskText = (payload && payload.representativeTaskText)
    || ((scenarioText + " " + prospectsJson).trim())
    || "US roofing contractor estimates by hand";
  const retrieval = retrieveAgainstTask(combined, taskText);
  const retrieved = new Set(retrieval.retrievedItemIds || []);
  const relevantProposed = proposedAsItems.filter((k) => String(k.statement || "").length >= 12);
  const retrievable = relevantProposed.length === 0
    || relevantProposed.some((k) => retrieved.has(k.id));
  const parentMandatory = existing.filter((k) => parentIds.has(k.id) && isMandatoryPolicy(k));
  const stillPresent = parentMandatory.filter((k) => combined.some((x) => x.id === k.id && x.reviewStatus !== "superseded"));
  const displaced = parentMandatory.filter((k) => !stillPresent.some((x) => x.id === k.id));
  const usefulness = payload && payload.usefulness;
  const useful = !usefulness || usefulness.shouldTrain === true || usefulness.warranted === true;
  const tokenImpact = tokenEstimate(proposedAsItems);
  let outcome = "create_candidate_version";
  if (usefulness && usefulness.skipReason === "duplicate_or_corroboration_only") outcome = "skip_duplicate";
  else if (!useful) outcome = "skip_not_useful";
  else if (displaced.length) outcome = "skip_policy_displacement";
  else if (relevantProposed.length && !retrievable && payload && payload.fictionalScenario) outcome = "skip_not_retrievable";
  else if (payload && payload.ownerRevisionRequired) outcome = "owner_revision_required";
  const rec = {
    id: (payload && payload.id) || nextId(store, "SHD-"),
    workspaceId: workspaceId || null,
    objectiveId: (payload && payload.objectiveId) || null,
    createdAt: nowIso(),
    parentVersionId: parentId || null,
    currentServingVersionId: currentServing || null,
    currentVersionPreserved: true,
    proposedItemIds: proposedAsItems.map((k) => k.id),
    retrievedItemIds: retrieval.retrievedItemIds || [],
    candidateRetrievableWhenRelevant: retrievable || relevantProposed.length === 0,
    mandatoryPolicyDisplaced: displaced.map((k) => k.id),
    duplicateSelectedContext: retrieval.duplicateSelectedContext || [],
    tokenImpact: tokenImpact,
    outcome: outcome,
    produceVersion: outcome === "create_candidate_version",
    sealedEval: false,
    note: outcome === "create_candidate_version"
      ? "Shadow compile allows a candidate version. Creating a candidate is not serving and not promotion."
      : "Shadow compile skipped a version: " + outcome + ". Current serving version preserved.",
  };
  if (store && store.putShadowCompile) store.putShadowCompile(rec);
  return rec;
}
