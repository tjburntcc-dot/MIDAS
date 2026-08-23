/** Reconcile pending approvals on canceled/rejected objectives. Not an owner decide. */

export const RECONCILIATION_ACTOR = "reconciliation";
export const RECONCILIATION_ACTOR_TYPE = "system";
export const TERMINAL_OBJECTIVE_STATUSES = ["canceled", "rejected", "completed", "failed"];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listApprovalReconciliations ? store.listApprovalReconciliations() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const r of existing) {
    const m = String(r.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export function objectiveBlocksOwnerQueue(obj) {
  if (!obj) return true;
  if (TERMINAL_OBJECTIVE_STATUSES.includes(obj.status)) return true;
  if (obj.terminalStatus && ["rejected_by_owner"].includes(obj.terminalStatus) && obj.status !== "awaiting_owner_approval") return true;
  return false;
}

export function listPendingApprovals(store) {
  const pending = [];
  for (const obj of (store && store.listObjectives && store.listObjectives()) || []) {
    if (objectiveBlocksOwnerQueue(obj)) continue;
    const reqs = ((store.listApprovalRequests && store.listApprovalRequests(obj.id)) || []).filter((r) => r.status === "pending");
    for (const r of reqs) {
      pending.push({
        objectiveId: obj.id,
        workspaceId: obj.workspaceId,
        approvalId: r.id,
        requireLocalOwner: Boolean(obj.requireLocalOwner || r.requireLocalOwner),
        ownerText: obj.ownerText,
        status: obj.status,
        kind: r.kind,
      });
    }
  }
  return pending;
}

export function reconcileStaleApprovals(store, extras) {
  const now = nowIso();
  const records = [];
  const onlyObjectiveId = extras && extras.objectiveId;
  for (const req of (store.listApprovalRequests && store.listApprovalRequests()) || []) {
    if (req.status !== "pending") continue;
    const obj = store.getObjective(req.objectiveId);
    if (!obj) continue;
    if (onlyObjectiveId && obj.id !== onlyObjectiveId) continue;
    if (!objectiveBlocksOwnerQueue(obj)) continue;
    const rec = {
      id: nextId(store, "REC-"),
      approvalId: req.id,
      objectiveId: obj.id,
      workspaceId: req.workspaceId,
      previousStatus: req.status,
      nextStatus: "reconciled_canceled",
      actor: RECONCILIATION_ACTOR,
      actorType: RECONCILIATION_ACTOR_TYPE,
      actorIdentity: "reconciliation",
      kind: "stale_pending_on_canceled_objective",
      ownerDecision: false,
      ownerAction: null,
      notOwnerApproveReject: true,
      createdAt: now,
      note: "Pending approval dropped from the owner queue because the parent objective is no longer actionable. Not an owner approve/reject. Objective history was not rewritten.",
    };
    if (store.putApprovalReconciliation) store.putApprovalReconciliation(rec);
    store.putApprovalRequest({
      ...req,
      status: "reconciled_canceled",
      reconciledAt: now,
      reconciliationId: rec.id,
      reconciledBy: { actor: RECONCILIATION_ACTOR, actorType: RECONCILIATION_ACTOR_TYPE, actorIdentity: "reconciliation" },
    });
    records.push(rec);
  }
  return {
    records: records,
    actor: RECONCILIATION_ACTOR,
    actorType: RECONCILIATION_ACTOR_TYPE,
    ownerDecision: false,
    disclosure: "System reconciliation. Not local_owner. Not Mason. Not demo_operator-as-owner.",
  };
}
