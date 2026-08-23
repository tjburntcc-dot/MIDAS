/** Shared live-provider gateway for the HTTP control room. Never stores the API key. */
import {
  loadWorkspaceEnv,
  liveSession,
  keyFingerprint,
  probeLiveResponses,
  OpenAIResponsesProvider,
  openaiKeyStatus,
} from "@midas/model";
import { recordUsage } from "./spend-ledger.ts";

export const PROVIDER_STATES = [
  "not_configured",
  "configured_unverified",
  "verified_live",
  "authentication_failed",
  "network_failed",
  "temporarily_unavailable",
];

let probedThisProcess = false;
let probeInFlight = null;

function nowIso() {
  return new Date().toISOString();
}

export function classifyProviderError(err) {
  const msg = err == null ? "" : String(err);
  const lower = msg.toLowerCase();
  if (!msg) return "temporarily_unavailable";
  if (/\b401\b|unauthorized|invalid.?api.?key|incorrect.?api.?key|authentication|missing.?config|openai_api_key missing/.test(lower)) {
    return "authentication_failed";
  }
  if (/network fetch failed|fetch failed|econnrefused|enotfound|etimedout|eai_again/.test(lower)) {
    return "network_failed";
  }
  if (/\b402\b|\b429\b|\b503\b|quota|billing|insufficient|unavailable/.test(lower)) {
    return "temporarily_unavailable";
  }
  return "temporarily_unavailable";
}

function stripSecrets(meta) {
  if (!meta || typeof meta !== "object") return null;
  return {
    status: PROVIDER_STATES.includes(meta.status) ? meta.status : "not_configured",
    fingerprint: meta.fingerprint || null,
    lastVerifiedAt: meta.lastVerifiedAt || null,
    lastError: meta.lastError || null,
    lastProbeAt: meta.lastProbeAt || null,
    source: meta.source || null,
    model: meta.model || null,
    pid: meta.pid || null,
    reVerificationRequired: Boolean(meta.reVerificationRequired),
    note: meta.note || "Key is not stored. Connection metadata only.",
    updatedAt: meta.updatedAt || nowIso(),
  };
}

export function readConnectionMeta(store) {
  if (!store || !store.getProviderConnection) return null;
  return stripSecrets(store.getProviderConnection());
}

export function writeConnectionMeta(store, patch) {
  const prev = readConnectionMeta(store) || {};
  const next = stripSecrets({
    ...prev,
    ...patch,
    updatedAt: nowIso(),
    note: "Key is not stored. Connection metadata only.",
  });
  if (store && store.putProviderConnection) store.putProviderConnection(next);
  return next;
}

export function describeProviderConnection(store) {
  const load = loadWorkspaceEnv();
  const present = Boolean(process.env.OPENAI_API_KEY);
  const sess = liveSession();
  const fp = keyFingerprint();
  const meta = readConnectionMeta(store);
  const source = load.source || (meta && meta.source) || "unset";
  const base = {
    present: present,
    source: source,
    fingerprint: fp,
    pid: process.pid,
    inProcessVerified: sess.verified === true && sess.fingerprint === fp,
    model: sess.verified ? (sess.model || process.env.OPENAI_MODEL || null) : (meta && meta.model) || process.env.OPENAI_MODEL || null,
    lastError: sess.error || (meta && meta.lastError) || null,
    lastVerifiedAt: meta && meta.lastVerifiedAt || null,
    lastProbeAt: meta && meta.lastProbeAt || null,
    keyStoredInPublicState: false,
    note: "Key is not stored in public application state. Probe once on Connect or the first real live task.",
  };
  if (!present) {
    return { ...base, status: "not_configured", live: false, reVerificationRequired: false };
  }
  if (sess.verified === true && sess.fingerprint === fp) {
    return { ...base, status: "verified_live", live: true, reVerificationRequired: false };
  }
  if (meta && meta.fingerprint === fp && meta.status === "authentication_failed") {
    return { ...base, status: "authentication_failed", live: false, reVerificationRequired: true };
  }
  if (meta && meta.fingerprint === fp && meta.status === "network_failed") {
    return { ...base, status: "network_failed", live: false, reVerificationRequired: true };
  }
  return {
    ...base,
    status: "configured_unverified",
    live: false,
    reVerificationRequired: true,
    lastError: base.lastError || "Credential loaded from approved config path; this process has not verified yet.",
  };
}

export async function ensureLiveProvider(store, opts) {
  const reason = (opts && opts.reason) || "first_task";
  const allowProbe = reason === "connect" || reason === "explicit_probe" || reason === "first_task";
  const desc = describeProviderConnection(store);
  writeConnectionMeta(store, {
    status: desc.status,
    fingerprint: desc.fingerprint,
    source: desc.source,
    model: desc.model,
    pid: process.pid,
    lastError: desc.lastError,
    lastVerifiedAt: desc.lastVerifiedAt,
    lastProbeAt: desc.lastProbeAt,
    reVerificationRequired: desc.reVerificationRequired,
  });
  if (desc.status === "verified_live") {
    return {
      ok: true,
      status: "verified_live",
      reused: true,
      probed: false,
      live: true,
      model: desc.model,
      fingerprint: desc.fingerprint,
      pid: process.pid,
      provider: new OpenAIResponsesProvider(),
      reVerificationRequired: false,
    };
  }
  if (desc.status === "not_configured") {
    return {
      ok: false,
      status: "not_configured",
      live: false,
      probed: false,
      error: "OPENAI_API_KEY missing",
      reVerificationRequired: false,
      provider: null,
    };
  }
  if (!allowProbe) {
    return {
      ok: false,
      status: desc.status,
      live: false,
      probed: false,
      reVerificationRequired: true,
      error: desc.lastError,
      provider: null,
    };
  }
  if (probedThisProcess && liveSession().verified !== true && reason !== "connect" && reason !== "explicit_probe") {
    const failed = describeProviderConnection(store);
    return {
      ok: false,
      status: failed.status,
      live: false,
      probed: false,
      reVerificationRequired: true,
      error: failed.lastError || "Re-verification required. Connect or retry the first live task.",
      provider: null,
    };
  }
  if (probeInFlight) return probeInFlight;
  probeInFlight = (async () => {
    probedThisProcess = true;
    const probe = await probeLiveResponses();
    const usage = probe.usage || {};
    try {
      recordUsage(store, {
        operation: "probe",
        agentId: "atlas",
        role: "atlas",
        model: probe.model || null,
        providerRequestId: probe.providerRequestId || null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        resultStatus: probe.ok ? "ok" : "error",
        kind: "live",
        note: probe.ok ? "Authenticated Responses probe via shared gateway." : "Probe failed. No fixture fallback.",
      });
    } catch {
      // ledger must not hide probe result
    }
    if (probe.ok) {
      const meta = writeConnectionMeta(store, {
        status: "verified_live",
        fingerprint: probe.fingerprint || keyFingerprint(),
        lastVerifiedAt: nowIso(),
        lastProbeAt: nowIso(),
        lastError: null,
        model: probe.model,
        pid: probe.pid,
        source: loadWorkspaceEnv().source,
        reVerificationRequired: false,
      });
      return {
        ok: true,
        status: "verified_live",
        live: true,
        probed: true,
        reused: false,
        model: probe.model,
        fingerprint: meta.fingerprint,
        pid: probe.pid,
        usage: usage,
        providerRequestId: probe.providerRequestId || null,
        provider: new OpenAIResponsesProvider(),
        reVerificationRequired: false,
      };
    }
    const status = classifyProviderError(probe.error);
    writeConnectionMeta(store, {
      status: status,
      fingerprint: probe.fingerprint || keyFingerprint(),
      lastProbeAt: nowIso(),
      lastError: probe.error,
      model: null,
      pid: probe.pid,
      source: loadWorkspaceEnv().source,
      reVerificationRequired: true,
    });
    return {
      ok: false,
      status: status,
      live: false,
      probed: true,
      error: probe.error,
      fingerprint: probe.fingerprint,
      pid: probe.pid,
      reVerificationRequired: true,
      provider: null,
      fixtureFallback: false,
    };
  })();
  try {
    return await probeInFlight;
  } finally {
    probeInFlight = null;
  }
}

export function resetProviderGatewayForTests() {
  probedThisProcess = false;
  probeInFlight = null;
}

export function providerHealthView(store) {
  const desc = describeProviderConnection(store);
  return {
    ...desc,
    openaiKeyPresent: openaiKeyStatus().present,
    states: PROVIDER_STATES,
    fixtureFallback: false,
  };
}
