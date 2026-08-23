/** Approval actor types. Local session is not enterprise IAM. */
export const ACTOR_TYPES = ["local_owner", "demo_operator", "system", "delegated_policy"];
export const OWNER_LIKE_ACTORS = ["owner", "demo_operator", "local_owner"];

function nowIso() {
  return new Date().toISOString();
}

function nextId(store, prefix) {
  const existing = store && store.listLocalSessions ? store.listLocalSessions() : [];
  let n = 1;
  const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  for (const s of existing) {
    const m = String(s.id || "").match(re);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}

export function createLocalOwnerSession(store, payload) {
  const rec = {
    id: (payload && payload.id) || nextId(store, "LOS-"),
    createdAt: nowIso(),
    kind: "local_session",
    note: "Lightweight local-owner session. Not enterprise IAM. Not Postgres auth.",
    enterpriseIam: false,
  };
  if (store && store.putLocalSession) store.putLocalSession(rec);
  return rec;
}

export function getLocalOwnerSession(store, sessionId) {
  if (!sessionId || !store || !store.getLocalSession) return null;
  return store.getLocalSession(sessionId) || null;
}

export function resolveActorType(payload, session) {
  const rawActor = String((payload && (payload.actor || payload.actorId)) || "demo_operator");
  const requested = String((payload && payload.actorType) || "");
  if (rawActor === "conductor" || rawActor === "workflow_manager" || /^conductor-/.test(rawActor)) {
    return { actor: rawActor, actorType: "system", actorIdentity: rawActor, note: "Conductor cannot approve. Actor preserved for the existing guard." };
  }
  if (rawActor === "watcher" || rawActor === "independent_audit" || /^watcher-/.test(rawActor)) {
    return { actor: rawActor, actorType: "system", actorIdentity: rawActor, note: "Watcher cannot approve. Actor preserved for the existing guard." };
  }
  if (rawActor === "system" || requested === "system") {
    return { actor: "system", actorType: "system", actorIdentity: "system" };
  }
  if (requested === "delegated_policy" || rawActor === "delegated_policy") {
    return { actor: "delegated_policy", actorType: "delegated_policy", actorIdentity: "delegated_policy" };
  }
  if ((requested === "local_owner" || rawActor === "local_owner" || rawActor === "owner") && session && session.id) {
    return {
      actor: "local_owner",
      actorType: "local_owner",
      actorIdentity: "local_owner",
      sessionId: session.id,
      securityClaim: "local session, not enterprise IAM",
    };
  }
  if (requested === "local_owner" && !session) {
    return {
      actor: "demo_operator",
      actorType: "demo_operator",
      actorIdentity: "demo_operator",
      note: "local_owner requires a real local session. Scripted HTTP is demo_operator.",
    };
  }
  if (rawActor === "demo_operator" || requested === "demo_operator" || rawActor === "owner") {
    return {
      actor: rawActor === "owner" && requested !== "demo_operator" ? "owner" : "demo_operator",
      actorType: "demo_operator",
      actorIdentity: "demo_operator",
      note: rawActor === "owner" && !session ? "In-process owner without a local session is not claimed as Mason. HTTP scripts are demo_operator." : null,
    };
  }
  return { actor: "demo_operator", actorType: "demo_operator", actorIdentity: "demo_operator" };
}

export function assertActorAllowed(actor, action) {
  const who = String(actor || "");
  if (who === "watcher" || who === "independent_audit" || /^watcher-/.test(who)) {
    const err = new Error("Watcher cannot " + (action || "perform this action") + ".");
    err.code = "WATCHER_FORBIDDEN";
    throw err;
  }
  if (who === "conductor" || who === "workflow_manager" || /^conductor-/.test(who)) {
    const err = new Error("Conductor cannot " + (action || "perform this action") + ".");
    err.code = "CONDUCTOR_FORBIDDEN";
    throw err;
  }
  if (who === "system") {
    const err = new Error("system cannot " + (action || "approve owner actions") + ".");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
  if (!OWNER_LIKE_ACTORS.includes(who)) {
    const err = new Error("Only local_owner, owner, or labeled demo_operator may " + (action || "perform this action") + ". Scripted demo actions must be labeled demo_operator, never Mason.");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
}

export function rejectMasonClaim(actor, actorType) {
  if (/mason hemmer/i.test(String(actor || "")) || actorType === "mason") {
    const err = new Error("Scripted demo actions must be labeled demo_operator, never Mason.");
    err.code = "APPROVAL_FORBIDDEN";
    throw err;
  }
}
