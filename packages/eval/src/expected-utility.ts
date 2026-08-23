/** Expected utility hypothesis before training. Not proof. */
import { createHash } from "node:crypto";

export const UTILITY_AFFECTS = [
  "classification",
  "ranking",
  "explanation",
  "uncertainty",
  "research_recommendation",
];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listUtilityRecords ? store.listUtilityRecords() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export function freezeFictionalScenario(scenario) {
  const body = scenario || {};
  const canonical = JSON.stringify({
    title: body.title || null,
    fictional: body.fictional !== false,
    prospects: body.prospects || [],
    qualification_policy: body.qualification_policy || null,
  });
  return {
    frozenAt: nowIso(),
    fictional: true,
    hash: createHash("sha256").update(canonical).digest("hex"),
    title: body.title || null,
    prospectIds: (body.prospects || []).map((p) => p && p.id).filter(Boolean),
    disclosure: body.disclosure || (body.tailoredAfterFinding
      ? "Demo scenario was tailored after seeing a finding. Not independent proof."
      : "Fictional scenario frozen before Scout findings. Hypothesis, not proof."),
    tailoredAfterFinding: Boolean(body.tailoredAfterFinding),
  };
}

export function defineExpectedUtility(payload) {
  const consumingRole = (payload && payload.consumingRole) || "atlas";
  const taskType = (payload && (payload.expectedTaskType || payload.taskType)) || null;
  const affects = Array.isArray(payload && payload.affects) ? payload.affects : [];
  const known = affects.filter((a) => UTILITY_AFFECTS.includes(a));
  const why = String((payload && payload.whyExistingInsufficient) || "");
  const defined = Boolean(consumingRole && taskType && known.length && why.length >= 12);
  return {
    consumingRole: consumingRole,
    workspaceObjective: (payload && payload.workspaceObjective) || null,
    expectedTaskType: taskType,
    signalFamily: (payload && payload.signalFamily) || null,
    affects: known,
    mandatory: payload && payload.mandatory === true,
    optional: payload && payload.mandatory !== true,
    whyExistingKnowledgeInsufficient: why,
    hypothesis: true,
    proof: false,
    defined: defined,
    demoScenarioTailored: Boolean(payload && payload.demoScenarioTailored),
    disclosure: (payload && payload.disclosure) || "Expected utility is a hypothesis about a future consuming task, not proof of improvement.",
    scenarioHash: (payload && payload.scenarioHash) || null,
    note: defined
      ? "Plausible consuming task recorded before training."
      : "No plausible consuming task. Do not train.",
  };
}

export function recordExpectedUtility(store, payload) {
  const utility = defineExpectedUtility(payload);
  const rec = {
    id: (payload && payload.id) || nextId(store, "UTIL-"),
    workspaceId: (payload && payload.workspaceId) || null,
    objectiveId: (payload && payload.objectiveId) || null,
    findingId: (payload && payload.findingId) || null,
    createdAt: nowIso(),
    ...utility,
  };
  if (store && store.putUtilityRecord) store.putUtilityRecord(rec);
  return rec;
}
