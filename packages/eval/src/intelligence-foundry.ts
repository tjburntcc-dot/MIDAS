/* ============================================================================
   MIDAS INTELLIGENCE FOUNDRY
   The learning engine underneath the village interface.

     select employee -> define objective -> retrieve knowledge -> study
       -> practice -> evaluate -> find gaps -> improve playbook
       -> compare before/after -> teach peers -> repeat

   Everything here is company-scoped, FILE_STORE backed, and honest about
   whether a live model or a deterministic path produced a result.
   ============================================================================ */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { embedTextsApprovedPath, cosineSimilarity } from "@midas/model";
import { listApprovedWorkspaceKnowledge } from "./offer-strategist-live.ts";
import { recordUsage, ownerSpendView } from "./spend-ledger.ts";
import { LIVE_SPECIALIST_CONTRACTS, resolveLiveTaskType } from "./live-specialists.ts";

export const FOUNDRY_VERSION = "foundry-v1";
export const FOUNDRY_HONESTY = {
  persistence: "FILE_STORE",
  weightsChanged: false,
  weightsNote:
    "No model weights are fine-tuned. Improvement comes from retrieval, playbooks, corrections, and verified experience. That is labelled as such.",
  isolation: "application-level workspaceId scoping on every read",
  sealedEval: false,
};

/* ------------------------------------------------------------ storage ---- */
function stateDir(store) {
  return (store && store.dir) || join(process.cwd(), "var", "state");
}
function loadCol(store, name) {
  const p = join(stateDir(store), name);
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveCol(store, name, rows) {
  writeFileSync(join(stateDir(store), name), JSON.stringify(rows, null, 2));
}
function upsert(store, name, rec) {
  const rows = loadCol(store, name).filter((r) => r.id !== rec.id);
  rows.push(rec);
  saveCol(store, name, rows);
  return rec;
}
function nextId(rows, prefix) {
  let n = 1;
  for (const r of rows) {
    const m = String((r && r.id) || "").match(new RegExp("^" + prefix + "(\\d+)$"));
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return prefix + String(n).padStart(3, "0");
}
function nowIso() {
  return new Date().toISOString();
}
const COL = {
  playbooks: "foundry_playbooks.json",
  sessions: "foundry_sessions.json",
  evals: "foundry_evaluations.json",
  lessons: "foundry_lessons.json",
  workflows: "foundry_workflows.json",
  assessments: "foundry_assessments.json",
  teamPlans: "foundry_team_plans.json",
  retrievals: "foundry_retrievals.json",
  embedCache: "foundry_embedding_cache.json",
};

/* --------------------------------------------------------------- text ---- */
function txt(v) {
  return String(v == null ? "" : v);
}
const STOP = new Set(
  ("a an the and or of to in for on with is are was were be been by at from as that this it its not no do does " +
    "you your we our they their i me my how what when where which who will can may should would could than then " +
    "there here about into over under more most some any all each other such only own same so if but because")
    .split(" "),
);
function tokens(s) {
  return txt(s)
    .toLowerCase()
    .replace(/[^a-z0-9$%.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}
function trigrams(s) {
  const t = txt(s).toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/* ============================================================================
   CORPUS — everything one employee at one company is allowed to read
   ============================================================================ */
const ROLE_TOPICS = {
  business_research: ["research", "question", "source", "evidence", "unknown", "signal", "competitor"],
  marketing: ["marketing", "copy", "message", "audience", "channel", "offer", "positioning", "objection", "flyer"],
  sales: ["sales", "pipeline", "qualify", "objection", "discovery", "close", "lead"],
  finance: ["price", "pricing", "cost", "margin", "budget", "revenue", "fee", "unit", "cash", "$"],
  product: ["product", "requirement", "feature", "build", "scope", "landing", "page", "spec"],
  ops: ["operation", "process", "schedule", "checklist", "step", "delivery", "capacity", "supply"],
  offer_strategist: ["offer", "pricing", "positioning", "package", "value", "hypothesis"],
  executive: ["priority", "tradeoff", "risk", "decision", "strategy", "sequence"],
  independent_audit: ["policy", "claim", "evidence", "unsupported", "compliance", "audit"],
  workflow_manager: ["task", "plan", "assign", "sequence", "objective"],
};

export function buildCorpus(store, workspaceId, roleId) {
  const ws = txt(workspaceId);
  const items = [];

  /* 1. approved company knowledge (already workspace-scoped by the store) */
  for (const k of listApprovedWorkspaceKnowledge(store, ws) || []) {
    if (k.workspaceId && k.workspaceId !== ws) continue; /* isolation guard */
    items.push({
      id: k.id,
      text: txt(k.statement || k.excerpt),
      kind: k.classification || k.kind || "company_knowledge",
      applicableRole: k.applicableRole || null,
      mandatory: k.mandatory === true || k.classification === "owner_policy",
      workspaceId: ws,
      origin: "approved_knowledge",
      sourceId: k.findingId || null,
    });
  }

  /* 2. the company's own owner-supplied description of itself */
  const w = store.getWorkspace && store.getWorkspace(ws);
  if (w) {
    const facts = [
      ["business_description", w.description],
      ["owner_objective", w.goal],
      ["offer", w.offer && (w.offer.summary || w.offer.name)],
      ["customer_profile", w.idealCustomer],
      ["geography", w.geography],
      ["constraints", Array.isArray(w.constraints) ? w.constraints.join("; ") : w.constraints],
      ["industry", w.industry],
    ];
    for (const [kind, value] of facts) {
      const v = txt(value).trim();
      if (!v) continue;
      items.push({
        id: "WSFACT-" + ws + "-" + kind,
        text: v,
        kind,
        applicableRole: null,
        mandatory: kind === "constraints",
        workspaceId: ws,
        origin: "company_record",
        sourceId: null,
      });
    }
  }

  /* 3. lessons this company's employees have taught each other (approved only) */
  for (const l of loadCol(store, COL.lessons)) {
    if (l.workspaceId !== ws) continue;
    if (l.status !== "approved" && l.status !== "delivered") continue;
    items.push({
      id: l.id,
      text: txt(l.lesson),
      kind: "peer_lesson",
      applicableRole: l.toRoleId || null,
      mandatory: false,
      workspaceId: ws,
      origin: "peer_lesson",
      sourceId: (l.evidenceIds || [])[0] || null,
    });
  }

  /* 4. corrections this employee's role has already absorbed */
  for (const pb of loadCol(store, COL.playbooks)) {
    if (pb.workspaceId !== ws) continue;
    if (roleId && pb.roleId !== roleId) continue;
    for (const c of pb.corrections || []) {
      items.push({
        id: pb.id + "-corr-" + (c.n || 0),
        text: txt(c.text),
        kind: "correction",
        applicableRole: pb.roleId,
        mandatory: false,
        workspaceId: ws,
        origin: "playbook_correction",
        sourceId: pb.id,
      });
    }
  }

  /* 5. lessons the owner approved from a source they supplied */
  for (const src of loadCol(store, "foundry_sources.json")) {
    if (src.workspaceId !== ws) continue;
    if (src.status !== "approved") continue;
    if (roleId && src.roleId && src.roleId !== roleId) continue;
    const keep = Array.isArray(src.approvedLessonNumbers) && src.approvedLessonNumbers.length
      ? (src.lessons || []).filter((l) => src.approvedLessonNumbers.indexOf(l.n) >= 0)
      : (src.lessons || []);
    for (const l of keep) {
      items.push({
        id: src.id + "-L" + l.n,
        text: txt(l.statement) + (l.whyItMattersHere ? " Why here: " + txt(l.whyItMattersHere) : ""),
        kind: "source_lesson_" + txt(l.kind),
        applicableRole: src.roleId || null,
        mandatory: false,
        workspaceId: ws,
        origin: "owner_source_lesson",
        sourceId: src.id,
        claimClass: l.claimClass || null,
        excerpt: l.excerpt || null,
        timestamp: l.timestamp || null,
        sourceTitle: src.title || null,
        sourceUrl: src.url || null,
      });
    }
  }

  /* 5. approved research findings for this company */
  const findings = (store.listScoutFindings && store.listScoutFindings(ws)) || [];
  for (const f of findings) {
    if (f.workspaceId && f.workspaceId !== ws) continue;
    const claim = txt(f.claim || f.statement);
    if (!claim) continue;
    items.push({
      id: f.id,
      text: claim,
      kind: f.kind === "source_backed_fact" ? "source_backed_observation" : txt(f.kind || "finding"),
      applicableRole: null,
      mandatory: false,
      workspaceId: ws,
      origin: "research_finding",
      sourceId: f.sourceId || f.source || null,
      reviewStatus: f.reviewStatus || null,
    });
  }

  return items.filter((i) => txt(i.text).trim().length > 3);
}

/* ============================================================================
   HYBRID RETRIEVAL — lexical + semantic + role awareness, honestly labelled
   ============================================================================ */
function lexicalScores(items, query) {
  const q = tokens(query);
  if (!q.length) return items.map(() => 0);
  const df = {};
  const docs = items.map((i) => {
    const t = tokens(i.text + " " + txt(i.kind));
    const uniq = new Set(t);
    for (const w of uniq) df[w] = (df[w] || 0) + 1;
    return t;
  });
  const N = items.length || 1;
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  return docs.map((doc) => {
    const tf = {};
    for (const w of doc) tf[w] = (tf[w] || 0) + 1;
    let score = 0;
    for (const w of new Set(q)) {
      const f = tf[w] || 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df[w] || 0) + 0.5) / ((df[w] || 0) + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (doc.length / avgLen))));
    }
    return score;
  });
}
function normalise(xs) {
  const max = Math.max(0, ...xs);
  return max > 0 ? xs.map((x) => x / max) : xs.map(() => 0);
}
function matchedWords(text, query) {
  const q = new Set(tokens(query));
  const out = [];
  for (const w of new Set(tokens(text))) if (q.has(w) && out.length < 4) out.push(w);
  return out;
}

/* embedding cache keyed by text hash, so the same passage is never paid for twice */
function cacheKey(text) {
  let h = 5381;
  const s = txt(text).slice(0, 4000);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return "e" + h.toString(36) + "-" + s.length;
}
function readCache(store) {
  const p = join(stateDir(store), COL.embedCache);
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return raw && typeof raw === "object" ? raw.vectors || {} : {};
  } catch {
    return {};
  }
}
function writeCache(store, vectors, model) {
  writeFileSync(
    join(stateDir(store), COL.embedCache),
    JSON.stringify({ model, dims: 1536, updatedAt: nowIso(), note: "Cached embedding vectors so identical passages are embedded once.", vectors }, null, 2),
  );
}

export async function embedWithCache(store, texts, opts) {
  const cache = readCache(store);
  const keys = texts.map(cacheKey);
  const missingIdx = [];
  for (let i = 0; i < keys.length; i++) if (!cache[keys[i]]) missingIdx.push(i);

  let status = "cache_only";
  let model = (opts && opts.model) || "text-embedding-3-small";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let note = "All passages were already embedded. No new embedding spend.";
  let ok = true;

  if (missingIdx.length) {
    const res = await embedTextsApprovedPath(missingIdx.map((i) => texts[i]), opts || {});
    ok = res.ok === true;
    status = res.status;
    model = res.model || model;
    usage = res.usage || usage;
    note = res.note;
    if (res.ok) {
      for (const v of res.vectors || []) {
        const at = missingIdx[v.index];
        if (at != null) cache[keys[at]] = v.values;
      }
      writeCache(store, cache, model);
    }
  }
  const vectors = keys.map((k) => cache[k] || null);
  return { ok: ok && vectors.some((v) => Array.isArray(v)), status, model, usage, note, vectors, newlyEmbedded: missingIdx.length };
}

export async function hybridRetrieve(store, opts, deps) {
  const ws = txt(opts && opts.workspaceId);
  const roleId = (opts && opts.roleId) || null;
  const query = txt(opts && opts.query);
  const maxItems = Number((opts && opts.maxItems) || 8);
  const wantEmbeddings = (opts && opts.useEmbeddings) !== false;

  const corpus = buildCorpus(store, ws, roleId);
  /* hard isolation assertion: nothing from another company may be scored */
  const leaked = corpus.filter((c) => c.workspaceId && c.workspaceId !== ws);
  const pool = corpus.filter((c) => !c.workspaceId || c.workspaceId === ws);

  const lex = normalise(lexicalScores(pool, query));

  /* semantic pass */
  let sem = pool.map(() => 0);
  let embeddingsUsed = false;
  let embedStatus = "not_attempted";
  let embedNote = "Semantic retrieval was not requested for this run.";
  let embedModel = null;
  let embedUsage = { inputTokens: 0, outputTokens: 0 };
  let newlyEmbedded = 0;

  if (wantEmbeddings && pool.length && query.trim()) {
    const res = await embedWithCache(store, [query].concat(pool.map((p) => p.text)));
    embedStatus = res.status;
    embedNote = res.note;
    embedModel = res.model;
    embedUsage = res.usage;
    newlyEmbedded = res.newlyEmbedded;
    const qv = res.vectors[0];
    if (res.ok && Array.isArray(qv)) {
      sem = pool.map((_, i) => {
        const v = res.vectors[i + 1];
        return Array.isArray(v) ? cosineSimilarity(qv, v) : 0;
      });
      embeddingsUsed = sem.some((s) => s > 0);
      if (embedUsage && embedUsage.inputTokens > 0) {
        recordUsage(store, {
          workspaceId: ws,
          agentId: null,
          role: "retrieval",
          operation: "embeddings",
          model: embedModel,
          inputTokens: embedUsage.inputTokens,
          outputTokens: 0,
          kind: "live",
          note: "Hybrid retrieval embeddings for " + (roleId || "employee") + ". " + newlyEmbedded + " new passages.",
        });
      }
    }
  }
  const semN = normalise(sem);

  /* combine */
  const topics = ROLE_TOPICS[roleId] || [];
  const scored = pool.map((item, i) => {
    const roleMatch = roleId && item.applicableRole === roleId;
    const roleTopic = topics.some((t) => item.text.toLowerCase().includes(t));
    const kindBoost = item.kind === "correction" ? 0.14 : item.kind === "peer_lesson" ? 0.1 : item.kind === "example" ? 0.08 : 0;
    const evidenceBoost = item.origin === "research_finding" && item.reviewStatus === "approved" ? 0.06 : 0;
    const score =
      lex[i] * 0.45 + semN[i] * 0.45 + (roleMatch ? 0.15 : 0) + (roleTopic ? 0.06 : 0) + kindBoost + evidenceBoost;

    const words = matchedWords(item.text, query);
    const why = [];
    if (item.mandatory) why.push("owner policy — always included");
    if (words.length) why.push("wording match on " + words.join(", "));
    if (embeddingsUsed && semN[i] > 0.55 && !words.length) why.push("meaning match (" + sem[i].toFixed(2) + ") despite different wording");
    else if (embeddingsUsed && semN[i] > 0.55) why.push("meaning match (" + sem[i].toFixed(2) + ")");
    if (roleMatch) why.push("written for this role");
    else if (roleTopic) why.push("covers a topic this role works on");
    if (kindBoost) why.push(item.kind === "correction" ? "a past correction for this role" : "a lesson from a teammate");
    if (!why.length) why.push("company background for this business");

    return { ...item, lexical: Number(lex[i].toFixed(4)), semantic: Number(sem[i].toFixed(4)), score: Number(score.toFixed(4)), why: why.join("; ") };
  });

  /* mandatory owner policy is pinned and can never be displaced by ranking */
  const mandatory = scored.filter((s) => s.mandatory).sort((a, b) => b.score - a.score);
  const rest = scored.filter((s) => !s.mandatory).sort((a, b) => b.score - a.score);

  /* near-duplicate suppression */
  const chosen = [];
  const seenGrams = [];
  const suppressed = [];
  const take = (row) => {
    const g = trigrams(row.text);
    for (const prev of seenGrams) {
      if (jaccard(g, prev) > 0.82) {
        suppressed.push({ id: row.id, reason: "near-duplicate of an item already selected" });
        return;
      }
    }
    seenGrams.push(g);
    chosen.push(row);
  };
  for (const m of mandatory) take(m);
  for (const r of rest) {
    if (chosen.length >= maxItems) break;
    take(r);
  }

  const record = {
    id: nextId(loadCol(store, COL.retrievals), "RET-"),
    at: nowIso(),
    workspaceId: ws,
    roleId,
    employeeId: (opts && opts.employeeId) || null,
    query: query.slice(0, 400),
    method: embeddingsUsed ? "hybrid_lexical_plus_embeddings" : "lexical_only",
    embeddingsUsed,
    embeddingStatus: embedStatus,
    embeddingModel: embeddingsUsed ? embedModel : null,
    fallbackReason: embeddingsUsed ? null : embedNote,
    poolSize: pool.length,
    mandatoryIncluded: mandatory.length,
    suppressedDuplicates: suppressed.length,
    selectedIds: chosen.map((c) => c.id),
    isolation: { workspaceId: ws, foreignItemsInPool: leaked.length, note: "Corpus is filtered to this workspace before scoring." },
  };
  upsert(store, COL.retrievals, record);

  return {
    ok: true,
    workspaceId: ws,
    roleId,
    query,
    items: chosen,
    suppressed,
    method: record.method,
    embeddingsUsed,
    embeddingStatus: embedStatus,
    embeddingModel: record.embeddingModel,
    fallbackReason: record.fallbackReason,
    newlyEmbedded,
    poolSize: pool.length,
    retrievalId: record.id,
    isolation: record.isolation,
    honesty: FOUNDRY_HONESTY,
  };
}

/* ============================================================================
   MODEL ACCESS — one honest path for every live call the foundry makes
   ============================================================================ */
export async function callModel(store, req, deps) {
  const ws = txt(req.workspaceId);
  const live = Boolean(deps && deps.live === true && typeof deps.specialistResponder === "function");
  if (!live) {
    return {
      ok: false,
      live: false,
      reason: (deps && deps.provider && (deps.provider.error || deps.provider.status)) || "no_verified_live_provider",
      note: "No verified live provider was supplied, so this step ran deterministically instead. Nothing was faked.",
    };
  }
  /* respect the per-run ceiling the founder already configured */
  const cap = Number(req.capUsd != null ? req.capUsd : 0.35);
  const spent = foundrySpendUsd(store, ws);
  if (spent >= cap * 12) {
    return { ok: false, live: false, reason: "foundry_spend_guard", note: "Foundry spend guard reached for this company." };
  }
  let out;
  try {
    out = await deps.specialistResponder({
      input: req.input,
      instructions: txt(req.system) + "\n" + txt(req.developer),
      outputSchema: req.outputSchema,
      taskType: req.taskType || "offer_strategist",
    });
  } catch (err) {
    return { ok: false, live: false, reason: "provider_error", note: txt(err && err.message).slice(0, 200) };
  }
  const usage = out.usage || { inputTokens: null, outputTokens: null };
  const ledger = recordUsage(store, {
    workspaceId: ws,
    agentId: req.agentId || null,
    role: req.roleId || "foundry",
    version: FOUNDRY_VERSION,
    operation: req.operation || "foundry_reasoning",
    model: out.model,
    providerRequestId: out.providerRequestId || null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    kind: "live",
    note: txt(req.note || "Foundry live reasoning step."),
  });
  let json = null;
  try {
    json = JSON.parse(txt(out.text));
  } catch {
    const m = txt(out.text).match(/\{[\s\S]*\}/);
    if (m) { try { json = JSON.parse(m[0]); } catch { json = null; } }
  }
  return {
    ok: json != null,
    live: true,
    json,
    text: out.text,
    model: out.model,
    usage,
    costUsd: ledger && ledger.costUsd != null ? ledger.costUsd : null,
    ledgerId: ledger && ledger.id,
  };
}

export function foundrySpendUsd(store, workspaceId) {
  const view = ownerSpendView(store, workspaceId);
  const rows = (view.entries || []).filter((e) => e.version === FOUNDRY_VERSION || e.role === "retrieval");
  return Math.round(rows.reduce((s, e) => s + Number(e.costUsd || 0), 0) * 1e6) / 1e6;
}

/* ============================================================================
   PART 1 — EMPLOYEE BRAIN
   ============================================================================ */
export function resolveEmployee(store, employeeId) {
  const direct = store.getEmployeeRole && store.getEmployeeRole(employeeId);
  if (direct) return direct;
  const agent = store.getAgent && store.getAgent(employeeId);
  if (agent) {
    return {
      id: agent.id,
      workspaceId: agent.workspaceId || null,
      roleId: agent.roleId,
      name: agent.name,
      objective: agent.objective,
      responsibilities: agent.responsibilities || [],
      prohibitedActions: agent.boundaries || agent.prohibitedActions || [],
      status: agent.status,
      agentId: agent.id,
    };
  }
  return null;
}

function currentPlaybook(store, workspaceId, roleId) {
  const rows = loadCol(store, COL.playbooks)
    .filter((p) => p.workspaceId === workspaceId && p.roleId === roleId)
    .sort((a, b) => txt(b.updatedAt).localeCompare(txt(a.updatedAt)));
  return rows[0] || null;
}

export function employeeBrain(store, employeeId) {
  const emp = resolveEmployee(store, employeeId);
  if (!emp) return { ok: false, error: "employee not found: " + employeeId, errorStatus: 404 };
  const ws = txt(emp.workspaceId);
  const w = (store.getWorkspace && store.getWorkspace(ws)) || {};
  const roleId = txt(emp.roleId);

  /* live vs deterministic — read from the real contract table, not a guess */
  const taskType = resolveLiveTaskType(roleId, "");
  const contract = taskType ? LIVE_SPECIALIST_CONTRACTS[taskType] : null;
  const canUseLiveModel = Boolean(contract);

  const corpus = buildCorpus(store, ws, roleId);
  const roleScoped = corpus.filter((c) => !c.applicableRole || c.applicableRole === roleId);
  const playbook = currentPlaybook(store, ws, roleId);

  const tasks = ((store.listEmployeeTasks && store.listEmployeeTasks()) || []).filter(
    (t) => t.employeeId === emp.id || t.agentId === emp.agentId,
  );
  const deliverables = ((store.listDeliverablesForWorkspace && store.listDeliverablesForWorkspace(ws)) || []).filter(
    (d) => d.createdByEmployeeId === emp.id,
  );
  const sessions = loadCol(store, COL.sessions).filter((s) => s.employeeId === emp.id);
  const evals = loadCol(store, COL.evals).filter((e) => e.employeeId === emp.id);
  const lessonsIn = loadCol(store, COL.lessons).filter((l) => l.toEmployeeId === emp.id || (l.toRoleId === roleId && l.workspaceId === ws));
  const lessonsOut = loadCol(store, COL.lessons).filter((l) => l.fromEmployeeId === emp.id);

  const scored = evals.slice().sort((a, b) => txt(a.at).localeCompare(txt(b.at)));
  const first = scored[0] || null;
  const last = scored[scored.length - 1] || null;

  const strengths = [];
  const weaknesses = [];
  if (last && last.dimensions) {
    for (const d of last.dimensions) {
      const row = { dimension: d.label, score: d.score, max: d.max, evidence: d.detail };
      if (d.score >= d.max * 0.8) strengths.push(row);
      else if (d.score <= d.max * 0.5) weaknesses.push(row);
    }
  }

  return {
    ok: true,
    built: true,
    honesty: FOUNDRY_HONESTY,
    identity: {
      employeeId: emp.id,
      name: emp.name,
      roleId,
      roleTitle: emp.roleTitle || emp.name,
      company: { id: ws, name: w.name || null },
      objective: emp.objective || null,
      responsibilities: emp.responsibilities || [],
      authorizedActivities: (emp.permissions && emp.permissions.may) || emp.responsibilities || [],
      prohibitedActivities: (emp.permissions && emp.permissions.mayNot) || emp.prohibitedActions || [],
      executionMethod: canUseLiveModel ? "live_model_capable" : "deterministic_only",
      liveTaskType: taskType || null,
      status: emp.status || null,
      spendLimitUsd: (emp.budget && emp.budget.spendLimitUsd) != null ? emp.budget.spendLimitUsd : 0,
    },
    companyKnowledge: {
      description: w.description || null,
      offer: w.offer || null,
      customerProfile: w.idealCustomer || null,
      ownerObjective: w.goal || null,
      constraints: w.constraints || [],
      geography: w.geography || null,
      industry: w.industry || null,
      approvedItems: corpus.filter((c) => c.origin === "approved_knowledge").length,
      mandatoryPolicies: corpus.filter((c) => c.mandatory).map((c) => ({ id: c.id, text: c.text.slice(0, 240) })),
    },
    roleKnowledge: {
      itemsVisibleToThisRole: roleScoped.length,
      writtenForThisRole: corpus.filter((c) => c.applicableRole === roleId).length,
      peerLessons: corpus.filter((c) => c.kind === "peer_lesson").length,
      corrections: corpus.filter((c) => c.kind === "correction").length,
      researchFindings: corpus.filter((c) => c.origin === "research_finding").length,
      topics: ROLE_TOPICS[roleId] || [],
    },
    playbook: playbook
      ? {
          id: playbook.id,
          version: playbook.version,
          updatedAt: playbook.updatedAt,
          objective: playbook.objective,
          rules: playbook.rules || [],
          steps: playbook.steps || [],
          citations: playbook.citations || [],
          openQuestions: playbook.openQuestions || [],
          corrections: playbook.corrections || [],
          producedBy: playbook.producedBy,
        }
      : null,
    workMemory: {
      tasksCompleted: tasks.length,
      outputsProduced: deliverables.length,
      outputsReviewed: evals.length,
      lastRetrievedIds: last ? last.retrievedIds || [] : [],
      lastCitations: last ? last.citations || [] : [],
      whatWorked: strengths.map((s) => s.dimension),
      whatFailed: weaknesses.map((s) => s.dimension),
      stillUnknown: playbook ? playbook.openQuestions || [] : [],
    },
    development: {
      learningSessions: sessions.length,
      evaluations: evals.length,
      firstScore: first ? first.total : null,
      latestScore: last ? last.total : null,
      delta: first && last && first.id !== last.id ? Number((last.total - first.total).toFixed(1)) : null,
      strengths,
      weaknesses,
      recommendedNextTraining: weaknesses.length
        ? weaknesses.map((w2) => "Improve: " + w2.dimension.toLowerCase())
        : playbook && (playbook.openQuestions || []).length
          ? (playbook.openQuestions || []).slice(0, 3).map((q) => "Answer: " + q)
          : ["Run a first learning session to establish a baseline."],
      lessonsReceived: lessonsIn.length,
      lessonsTaught: lessonsOut.length,
      weightsChanged: false,
    },
  };
}

/* ============================================================================
   PART 4 — LEARNING SESSION (study -> playbook)
   ============================================================================ */
const ROLE_STUDY = {
  marketing: {
    focus: "positioning a local offer, anticipating customer objections, and writing messaging grounded only in approved company facts",
    rules: [
      "Every claim in a draft must trace to an approved company fact or be labelled a hypothesis.",
      "Never state demand, customer counts, or results that have not been observed.",
      "Respect every owner policy about channels and outreach.",
    ],
  },
  finance: {
    focus: "cost and margin reasoning, separating owner-reported figures from verified revenue, and naming missing inputs",
    rules: [
      "Label every number as owner-reported, observed, or assumed.",
      "Never present a projection as revenue.",
      "State the arithmetic so the owner can check it.",
    ],
  },
  business_research: {
    focus: "finding relevant sources, rejecting irrelevant claims, and separating independent reporting from vendor marketing",
    rules: [
      "Vendor marketing is a claim, never evidence of an outcome.",
      "Say plainly what is still unknown.",
      "Only cite evidence ids that were actually retrieved.",
    ],
  },
  product: {
    focus: "turning owner goals into requirements, prioritising, and naming technical unknowns",
    rules: [
      "A requirement must trace to an owner objective or an approved fact.",
      "Separate the first buildable slice from everything else.",
      "Name the unknowns that would change the plan.",
    ],
  },
  ops: {
    focus: "sequencing the practical steps to deliver the offer and finding the bottleneck",
    rules: [
      "Each step must be something a person can actually do this week.",
      "Name the constraint that limits throughput.",
      "Respect stated capacity and owner constraints.",
    ],
  },
  sales: {
    focus: "internal qualification and objection handling without any outreach",
    rules: ["No outreach of any kind.", "Qualification criteria must be checkable.", "Objections must come from evidence, not imagination."],
  },
  offer_strategist: {
    focus: "offer positioning as clearly labelled hypotheses",
    rules: ["Label every positioning statement as a hypothesis.", "Never invent market size, demand, or willingness to pay.", "Say what would validate it."],
  },
  executive: {
    focus: "synthesising specialist outputs, surfacing disagreement and risk, and recommending the next decision",
    rules: [
      "Do not introduce new facts the specialists did not supply.",
      "Name the disagreement rather than averaging it away.",
      "Recommend one next decision with its tradeoff.",
    ],
  },
  independent_audit: {
    focus: "checking claims against policy and evidence",
    rules: ["Flag any claim without an evidence id.", "Flag any owner policy breach.", "Advisory only — never approve on the owner's behalf."],
  },
};
function studyProfile(roleId) {
  return (
    ROLE_STUDY[roleId] || {
      focus: "doing this role's work using only approved company knowledge",
      rules: ["Use approved company knowledge only.", "Label hypotheses.", "Name what is unknown."],
    }
  );
}

const PLAYBOOK_SCHEMA = {
  name: "employee_playbook",
  strict: true,
  schema: {
    "type": "object",
    additionalProperties: false,
    required: ["rules", "steps", "citations", "open_questions", "summary"],
    properties: {
      summary: { "type": "string" },
      rules: { "type": "array", items: { "type": "string" } },
      steps: { "type": "array", items: { "type": "string" } },
      citations: {
        "type": "array",
        items: {
          "type": "object",
          additionalProperties: false,
          required: ["evidence_id", "supports"],
          properties: { evidence_id: { "type": "string" }, supports: { "type": "string" } },
        },
      },
      open_questions: { "type": "array", items: { "type": "string" } },
    },
  },
};

export async function runLearningSession(store, input, deps) {
  const emp = resolveEmployee(store, txt(input && input.employeeId));
  if (!emp) return { ok: false, error: "employee not found", errorStatus: 404 };
  const ws = txt(emp.workspaceId);
  const roleId = txt(emp.roleId);
  const profile = studyProfile(roleId);
  const objective = txt(input && input.objective) || "Get better at " + profile.focus + ".";

  const retrieval = await hybridRetrieve(store, {
    workspaceId: ws,
    roleId,
    employeeId: emp.id,
    query: objective + " " + profile.focus,
    maxItems: Number((input && input.maxItems) || 10),
    useEmbeddings: (input && input.useEmbeddings) !== false,
  }, deps);

  const evidence = retrieval.items.map((i) => ({ id: i.id, kind: i.kind, text: i.text.slice(0, 600), why: i.why }));
  const mandatory = retrieval.items.filter((i) => i.mandatory).map((i) => i.id);

  /* live synthesis when a verified provider exists; deterministic otherwise */
  const modelOut = await callModel(store, {
    workspaceId: ws,
    roleId,
    agentId: emp.agentId || emp.id,
    operation: "foundry_learning_session",
    capUsd: Number((input && input.capUsd) != null ? input.capUsd : 0.2),
    taskType: resolveLiveTaskType(roleId, "") || "offer_strategist",
    note: "Learning session for " + roleId + " at " + ws,
    system:
      "You are the " + roleId + " employee at one company inside MIDAS. You are studying to get better at " + profile.focus +
      ". Build a practical playbook you will follow on real tasks. Use ONLY the supplied evidence. Cite evidence ids. " +
      "Never invent demand, market size, revenue, customers, or willingness to pay. Owner policies are absolute. " +
      "If something important is missing, put it in open_questions instead of guessing.",
    developer:
      "Return one JSON object matching the schema. rules: short imperative rules you will follow. steps: the ordered method you will use on a real task. " +
      "citations: which evidence id supports which rule or step. open_questions: what you still do not know.",
    outputSchema: PLAYBOOK_SCHEMA,
    input: {
      objective,
      role: roleId,
      company: (store.getWorkspace && store.getWorkspace(ws) || {}).name || ws,
      mandatory_policy_ids: mandatory,
      evidence,
    },
  }, deps);

  let rules;
  let steps;
  let citations;
  let openQuestions;
  let producedBy;
  let summary;

  if (modelOut.ok && modelOut.json) {
    const j = modelOut.json;
    rules = (j.rules || []).map(txt).filter(Boolean);
    steps = (j.steps || []).map(txt).filter(Boolean);
    citations = (j.citations || []).map((c) => ({ evidenceId: txt(c.evidence_id), supports: txt(c.supports) }));
    openQuestions = (j.open_questions || []).map(txt).filter(Boolean);
    summary = txt(j.summary);
    producedBy = "live_model";
  } else {
    /* deterministic study: derive a playbook from the retrieved evidence itself */
    const policyItems = retrieval.items.filter((i) => i.mandatory);
    const factItems = retrieval.items.filter((i) => !i.mandatory);
    rules = profile.rules.concat(policyItems.map((p) => "Follow this owner policy: " + p.text.slice(0, 180)));
    steps = [
      "Re-read the owner policies for this company before writing anything.",
      "Pull the approved facts that bear on the task: " + factItems.slice(0, 3).map((f) => f.id).join(", "),
      "Draft the work using only those facts.",
      "Label anything not backed by a fact as a hypothesis.",
      "List what is still unknown so the owner can decide whether to research it.",
    ];
    citations = retrieval.items.slice(0, 6).map((i) => ({ evidenceId: i.id, supports: i.why }));
    openQuestions = ["Which of these hypotheses has the owner actually validated?"];
    summary = "Deterministic study pass over " + retrieval.items.length + " approved items for " + roleId + ".";
    producedBy = "deterministic";
  }

  const prior = currentPlaybook(store, ws, roleId);
  const playbook = {
    id: nextId(loadCol(store, COL.playbooks), "PLAY-"),
    workspaceId: ws,
    roleId,
    employeeId: emp.id,
    version: (prior ? Number(prior.version || 1) : 0) + 1,
    supersedes: prior ? prior.id : null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    objective,
    summary,
    rules,
    steps,
    citations,
    openQuestions: openQuestions.slice(),
    corrections: prior ? (prior.corrections || []).slice() : [],
    producedBy,
    retrievalId: retrieval.retrievalId,
    retrievedIds: retrieval.items.map((i) => i.id),
    embeddingsUsed: retrieval.embeddingsUsed,
    weightsChanged: false,
    note: "Playbook improvement through retrieval and study. Model weights are unchanged.",
  };
  upsert(store, COL.playbooks, playbook);

  const session = {
    id: nextId(loadCol(store, COL.sessions), "LSN-"),
    at: nowIso(),
    workspaceId: ws,
    employeeId: emp.id,
    roleId,
    objective,
    retrievalId: retrieval.retrievalId,
    retrievedIds: retrieval.items.map((i) => i.id),
    embeddingsUsed: retrieval.embeddingsUsed,
    retrievalMethod: retrieval.method,
    producedBy,
    playbookId: playbook.id,
    playbookVersion: playbook.version,
    live: modelOut.live === true,
    liveReason: modelOut.live ? null : modelOut.reason || null,
    costUsd: modelOut.costUsd != null ? modelOut.costUsd : 0,
    openQuestions,
  };
  upsert(store, COL.sessions, session);

  return { ok: true, built: true, session, playbook, retrieval, honesty: FOUNDRY_HONESTY };
}

/* ============================================================================
   PART 9 — FROZEN EVALUATION RUBRIC
   Deterministic, explicit, and impossible to win by writing more words.
   ============================================================================ */
export const RUBRIC_VERSION = "foundry-rubric-v2";
export const RUBRIC = [
  { key: "grounding", label: "Evidence accuracy", max: 20, about: "Every substantive claim cites an evidence id that was actually retrieved." },
  { key: "policy", label: "Owner policy compliance", max: 20, about: "Nothing in the output conflicts with a mandatory owner policy." },
  { key: "unknowns", label: "Recognition of missing information", max: 15, about: "The employee says plainly what it does not know." },
  { key: "specificity", label: "Relevance to this business", max: 12, about: "The work uses this company's actual facts, not generic filler." },
  { key: "roleFit", label: "Role-specific usefulness", max: 13, about: "The output does this role's job." },
  { key: "restraint", label: "No unsupported business claims", max: 10, about: "No invented demand, market size, revenue, or conversion." },
  { key: "originality", label: "Written, not pasted", max: 10, about: "The work is derived from the sources rather than copied out of them." },
];
const UNSUPPORTED = [
  /\bmarket size\b/i, /\btotal addressable\b/i, /\bTAM\b/, /\bdemand is (?:high|strong|proven)\b/i,
  /\bcustomers want\b/i, /\bguarante/i, /\bwill (?:increase|double|triple) revenue\b/i,
  /\bconversion rate of\s*\d/i, /\b\d+%\s*of customers\b/i, /\bproven to (?:sell|convert)\b/i,
  /\bwe have \d+ customers\b/i,
];
const UNKNOWN_MARKERS = [/\bunknown\b/i, /\bnot (?:yet )?known\b/i, /\bmissing\b/i, /\bwe do not know\b/i, /\bunvalidated\b/i, /\bneeds validation\b/i, /\bto be confirmed\b/i, /\bassumption\b/i];

function policyPhrases(text) {
  const out = [];
  const re = /\b(?:never|do not|don't|no)\s+([a-z][a-z\s-]{3,40})/gi;
  let m;
  while ((m = re.exec(txt(text))) !== null) {
    const phrase = m[1].trim().replace(/[.,;].*$/, "");
    if (phrase.length > 3) out.push(phrase.toLowerCase());
  }
  return out;
}

export function evaluateWork(store, input) {
  const ws = txt(input.workspaceId);
  const roleId = txt(input.roleId);
  const output = txt(input.output);
  const retrievedIds = (input.retrievedIds || []).map(txt);
  const citations = (input.citations || []).map(txt);
  const corpus = buildCorpus(store, ws, roleId);
  const corpusIds = new Set(corpus.map((c) => c.id));
  const mandatory = corpus.filter((c) => c.mandatory);

  const dims = [];
  const notes = [];
  const corrections = [];

  /* D1 grounding */
  const cited = citations.filter(Boolean);
  const valid = cited.filter((c) => corpusIds.has(c));
  const retrievedAndCited = cited.filter((c) => retrievedIds.indexOf(c) >= 0);
  const fabricated = cited.filter((c) => !corpusIds.has(c));
  let g = 0;
  if (!cited.length) {
    notes.push("No evidence ids were cited at all.");
    corrections.push("Cite the evidence id for every substantive claim.");
  } else {
    g = Math.round(20 * (valid.length / cited.length) * (retrievedAndCited.length ? 1 : 0.6));
    if (fabricated.length) {
      notes.push("Cited " + fabricated.length + " evidence id(s) that do not exist: " + fabricated.slice(0, 3).join(", "));
      corrections.push("Only cite evidence ids that were actually supplied to you.");
    }
  }
  dims.push({ key: "grounding", label: "Evidence accuracy", score: g, max: 20, detail: cited.length ? valid.length + " of " + cited.length + " citations resolve to real approved items" : "no citations" });

  /* D2 policy compliance */
  let p = 20;
  const conflicts = [];
  for (const pol of mandatory) {
    for (const phrase of policyPhrases(pol.text)) {
      const head = phrase.split(/\s+/).slice(0, 3).join(" ");
      if (head.length < 5) continue;
      const positive = new RegExp("\\b(?:will|should|can|we|you|please)\\s+[a-z\\s]{0,18}" + head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (positive.test(output)) conflicts.push(pol.id + ": " + phrase);
    }
  }
  if (conflicts.length) {
    p = Math.max(0, 20 - conflicts.length * 8);
    notes.push("Possible conflict with owner policy: " + conflicts.slice(0, 2).join(" | "));
    corrections.push("Re-read the owner policies before drafting; one of them appears to be contradicted.");
  }
  dims.push({ key: "policy", label: "Owner policy compliance", score: p, max: 20, detail: conflicts.length ? conflicts.length + " possible conflict(s)" : mandatory.length + " policies checked, none contradicted" });

  /* D3 unknowns */
  const unknownHits = UNKNOWN_MARKERS.filter((r) => r.test(output)).length;
  const u = Math.min(15, unknownHits * 5);
  if (!unknownHits) {
    notes.push("The output never says what is still unknown.");
    corrections.push("Always finish with what you do not know yet.");
  }
  dims.push({ key: "unknowns", label: "Recognition of missing information", score: u, max: 15, detail: unknownHits ? unknownHits + " explicit statement(s) of what is not known" : "none" });

  /* D4 company specificity */
  const w = (store.getWorkspace && store.getWorkspace(ws)) || {};
  const companyTokens = new Set(
    tokens([w.name, w.description, w.goal, w.idealCustomer, w.geography, w.offer && (w.offer.summary || w.offer.name)].join(" ")).concat(
      corpus.filter((c) => !c.mandatory).flatMap((c) => tokens(c.text).slice(0, 12)),
    ),
  );
  const outTokens = new Set(tokens(output));
  let hits = 0;
  for (const t of outTokens) if (companyTokens.has(t)) hits++;
  const s4 = Math.min(12, Math.round((hits / 8) * 12));
  if (hits < 4) {
    notes.push("The output reads generically; it barely uses this company's own facts.");
    corrections.push("Anchor the work in this company's stored facts, not generic advice.");
  }
  dims.push({ key: "specificity", label: "Relevance to this business", score: s4, max: 12, detail: hits + " company-specific terms used" });

  /* D5 role fit */
  const topics = ROLE_TOPICS[roleId] || [];
  const covered = topics.filter((t) => output.toLowerCase().includes(t));
  const s5 = topics.length ? Math.min(13, Math.round((covered.length / Math.min(4, topics.length)) * 13)) : 7;
  if (topics.length && !covered.length) {
    notes.push("The output does not address anything this role is responsible for.");
    corrections.push("Cover the parts of the task that belong to your role: " + topics.slice(0, 4).join(", ") + ".");
  }
  dims.push({ key: "roleFit", label: "Role-specific usefulness", score: s5, max: 13, detail: covered.length + " of this role's topics addressed" });

  /* D6 restraint */
  const bad = UNSUPPORTED.filter((r) => r.test(output));
  const s6 = Math.max(0, 10 - bad.length * 5);
  if (bad.length) {
    notes.push("Contains " + bad.length + " unsupported business claim pattern(s).");
    corrections.push("Do not assert demand, market size, revenue, or conversion. Label them as unknown or as a hypothesis to test.");
  }
  dims.push({ key: "restraint", label: "No unsupported business claims", score: s6, max: 10, detail: bad.length ? bad.length + " unsupported claim pattern(s)" : "none found" });

  /* D7 written, not pasted: how much of the output is lifted verbatim from the sources */
  const srcText = corpus.filter((c) => retrievedIds.indexOf(c.id) >= 0).map((c) => c.text).join(" ");
  const srcGrams = trigrams(srcText);
  const outGrams = Array.from(trigrams(output));
  let copied = 0;
  for (const g of outGrams) if (srcGrams.has(g)) copied++;
  const copiedFraction = outGrams.length ? copied / outGrams.length : 0;
  const s7 = Math.max(0, Math.round(10 * (1 - Math.min(1, copiedFraction))));
  if (copiedFraction > 0.6) {
    notes.push("Most of this output is copied straight out of the source material rather than written.");
    corrections.push("Write the deliverable in your own words and cite the source, rather than pasting the source.");
  }
  dims.push({ key: "originality", label: "Written, not pasted", score: s7, max: 10, detail: Math.round(copiedFraction * 100) + "% of the wording appears verbatim in the sources" });

  const total = dims.reduce((s, d) => s + d.score, 0);
  return {
    rubricVersion: RUBRIC_VERSION,
    total,
    max: 100,
    dimensions: dims,
    notes,
    corrections,
    citations: cited,
    validCitations: valid,
    fabricatedCitations: fabricated,
    advisory: true,
    note: "Deterministic rubric. Advisory only. Word count is never rewarded and the employee cannot score itself.",
  };
}

/* ---------------------------------------------------- practice + record --- */
const PRACTICE_SCHEMA = {
  name: "practice_output",
  strict: true,
  schema: {
    "type": "object",
    additionalProperties: false,
    required: ["work", "citations", "unknowns", "assumptions"],
    properties: {
      work: { "type": "string" },
      citations: { "type": "array", items: { "type": "string" } },
      unknowns: { "type": "array", items: { "type": "string" } },
      assumptions: { "type": "array", items: { "type": "string" } },
    },
  },
};

export async function runPracticeTask(store, input, deps) {
  const emp = resolveEmployee(store, txt(input && input.employeeId));
  if (!emp) return { ok: false, error: "employee not found", errorStatus: 404 };
  const ws = txt(emp.workspaceId);
  const roleId = txt(emp.roleId);
  const task = txt(input && input.task);
  if (task.length < 8) return { ok: false, error: "A realistic task description is required.", errorStatus: 400 };
  const label = txt(input && input.label) || "practice";

  const retrieval = await hybridRetrieve(store, {
    workspaceId: ws, roleId, employeeId: emp.id, query: task,
    maxItems: Number((input && input.maxItems) || 8),
    useEmbeddings: (input && input.useEmbeddings) !== false,
  }, deps);

  const playbook = (input && input.usePlaybook === false) ? null : currentPlaybook(store, ws, roleId);
  const profile = studyProfile(roleId);

  const modelOut = await callModel(store, {
    workspaceId: ws, roleId, agentId: emp.agentId || emp.id,
    operation: "foundry_practice_task",
    capUsd: Number((input && input.capUsd) != null ? input.capUsd : 0.2),
    taskType: resolveLiveTaskType(roleId, "") || "offer_strategist",
    note: "Practice task (" + label + ") for " + roleId + " at " + ws,
    system:
      "You are the " + roleId + " employee at one company inside MIDAS. Do the task using ONLY the supplied evidence. " +
      "Cite the evidence id beside anything you assert. Owner policies are absolute. Never invent demand, market size, revenue, " +
      "customers, or willingness to pay. Put anything you do not know in unknowns rather than guessing.",
    developer:
      "Return one JSON object matching the schema. work: the actual deliverable text. citations: evidence ids you used. " +
      "unknowns: what you could not determine. assumptions: anything you assumed, each clearly labelled.",
    outputSchema: PRACTICE_SCHEMA,
    input: {
      task,
      role: roleId,
      focus: profile.focus,
      playbook: playbook ? { rules: playbook.rules, steps: playbook.steps } : null,
      evidence: retrieval.items.map((i) => ({ id: i.id, kind: i.kind, text: i.text.slice(0, 600) })),
      mandatory_policy_ids: retrieval.items.filter((i) => i.mandatory).map((i) => i.id),
    },
  }, deps);

  let work;
  let citations;
  let unknowns;
  let assumptions;
  let producedBy;
  let systemFailure = null;

  if (modelOut.ok && modelOut.json) {
    work = txt(modelOut.json.work);
    citations = (modelOut.json.citations || []).map(txt).filter(Boolean);
    unknowns = (modelOut.json.unknowns || []).map(txt).filter(Boolean);
    assumptions = (modelOut.json.assumptions || []).map(txt).filter(Boolean);
    producedBy = "live_model";
  } else {
    systemFailure = modelOut.live === false ? txt(modelOut.reason || "no_live_provider") : "unparsable_model_output";
    const pbSteps = playbook ? playbook.steps || [] : [];
    work =
      "Deterministic draft for: " + task + "\n\n" +
      (pbSteps.length ? "Method followed:\n" + pbSteps.map((s, i) => i + 1 + ". " + s).join("\n") + "\n\n" : "") +
      "Approved facts used:\n" +
      retrieval.items.map((i) => "- [" + i.id + "] " + i.text.slice(0, 220)).join("\n") +
      "\n\nThis is a deterministic assembly of approved company facts. No live model produced it.";
    citations = retrieval.items.map((i) => i.id);
    unknowns = ["Whether any of these facts have changed since the owner recorded them.", "This draft is unvalidated."];
    assumptions = ["Assumption: the retrieved facts are still current."];
    producedBy = "deterministic";
  }

  const rubric = evaluateWork(store, {
    workspaceId: ws, roleId,
    output: work + "\n" + unknowns.join("\n") + "\n" + assumptions.join("\n"),
    retrievedIds: retrieval.items.map((i) => i.id),
    citations,
  });

  const record = {
    id: nextId(loadCol(store, COL.evals), "FEV-"),
    at: nowIso(),
    workspaceId: ws,
    employeeId: emp.id,
    roleId,
    label,
    task,
    producedBy,
    live: modelOut.live === true,
    systemFailure,
    attributedTo: systemFailure ? "system" : "employee",
    playbookId: playbook ? playbook.id : null,
    playbookVersion: playbook ? playbook.version : null,
    retrievalId: retrieval.retrievalId,
    retrievalMethod: retrieval.method,
    embeddingsUsed: retrieval.embeddingsUsed,
    retrievedIds: retrieval.items.map((i) => i.id),
    citations,
    unknowns,
    assumptions,
    output: work,
    total: rubric.total,
    dimensions: rubric.dimensions,
    notes: rubric.notes,
    corrections: rubric.corrections,
    rubricVersion: rubric.rubricVersion,
    costUsd: modelOut.costUsd != null ? modelOut.costUsd : 0,
    countsTowardProgression: !systemFailure,
  };
  upsert(store, COL.evals, record);

  /* corrections feed straight back into the employee's playbook */
  if (playbook && rubric.corrections.length) {
    const pb = loadCol(store, COL.playbooks).find((x) => x.id === playbook.id);
    if (pb) {
      const existing = new Set((pb.corrections || []).map((c) => c.text));
      let n = (pb.corrections || []).length;
      for (const c of rubric.corrections) {
        if (existing.has(c)) continue;
        pb.corrections = (pb.corrections || []).concat([{ n: ++n, text: c, fromEvaluation: record.id, at: nowIso() }]);
      }
      pb.updatedAt = nowIso();
      upsert(store, COL.playbooks, pb);
    }
  }

  return { ok: true, built: true, evaluation: record, retrieval, rubric, honesty: FOUNDRY_HONESTY };
}

export function compareRuns(store, input) {
  const rows = loadCol(store, COL.evals);
  const before = rows.find((r) => r.id === txt(input.beforeId));
  const after = rows.find((r) => r.id === txt(input.afterId));
  if (!before || !after) return { ok: false, error: "Both beforeId and afterId must be existing evaluations.", errorStatus: 400 };
  if (before.workspaceId !== after.workspaceId) return { ok: false, error: "Refusing to compare runs from different companies.", errorStatus: 400 };
  const perDim = RUBRIC.map((d) => {
    const b = (before.dimensions || []).find((x) => x.key === d.key);
    const a = (after.dimensions || []).find((x) => x.key === d.key);
    return { key: d.key, label: d.label, before: b ? b.score : null, after: a ? a.score : null, delta: b && a ? a.score - b.score : null, max: d.max };
  });
  const excluded = before.systemFailure || after.systemFailure;
  return {
    ok: true,
    built: true,
    workspaceId: before.workspaceId,
    employeeId: before.employeeId,
    sameTask: txt(before.task) === txt(after.task),
    before: { id: before.id, label: before.label, total: before.total, playbookVersion: before.playbookVersion, producedBy: before.producedBy, at: before.at },
    after: { id: after.id, label: after.label, total: after.total, playbookVersion: after.playbookVersion, producedBy: after.producedBy, at: after.at },
    delta: after.total - before.total,
    perDimension: perDim,
    countsTowardProgression: !excluded,
    excludedReason: excluded ? "One run failed for a system reason, so it is not held against the employee." : null,
    rubricVersion: RUBRIC_VERSION,
    honesty: FOUNDRY_HONESTY,
    note: "Same rubric, same company, frozen before the comparison. No model weights changed.",
  };
}

/* ============================================================================
   PART 5 — AGENT-TO-AGENT TEACHING
   A lesson is only real if it names who learned it, where it came from, who
   benefits, and whether the recipient's next output actually improved.
   ============================================================================ */
export async function proposeLesson(store, input, deps) {
  const from = resolveEmployee(store, txt(input && input.fromEmployeeId));
  const to = resolveEmployee(store, txt(input && input.toEmployeeId));
  if (!from) return { ok: false, error: "teaching employee not found", errorStatus: 404 };
  if (!to) return { ok: false, error: "receiving employee not found", errorStatus: 404 };
  if (txt(from.workspaceId) !== txt(to.workspaceId)) {
    return { ok: false, error: "Cross-company teaching is refused. Employees may only teach colleagues at the same business.", errorStatus: 400 };
  }
  const ws = txt(from.workspaceId);
  const lessonText = txt(input && input.lesson);
  if (lessonText.length < 12) return { ok: false, error: "The lesson text is required.", errorStatus: 400 };

  /* every cited evidence id must exist inside this company */
  const corpus = buildCorpus(store, ws, null);
  const ids = new Set(corpus.map((c) => c.id));
  const claimed = (input.evidenceIds || []).map(txt).filter(Boolean);
  const valid = claimed.filter((c) => ids.has(c));
  const invalid = claimed.filter((c) => !ids.has(c));
  if (!valid.length) {
    return {
      ok: false,
      error: "A lesson must cite at least one approved item from this company. No unsupported lessons.",
      errorStatus: 400,
      invalidEvidenceIds: invalid,
    };
  }
  /* vendor marketing may be taught only as a labelled claim, never as an outcome */
  const sources = valid.map((id) => corpus.find((c) => c.id === id)).filter(Boolean);
  const vendorish = sources.filter((s) => /vendor|marketing_claim/i.test(txt(s.kind)));

  const lesson = {
    id: nextId(loadCol(store, COL.lessons), "LES-"),
    at: nowIso(),
    workspaceId: ws,
    fromEmployeeId: from.id,
    fromRoleId: from.roleId,
    toEmployeeId: to.id,
    toRoleId: to.roleId,
    lesson: lessonText,
    whyItApplies: txt(input && input.whyItApplies) || "Relevant to the " + txt(to.roleId) + " role at this company.",
    evidenceIds: valid,
    rejectedEvidenceIds: invalid,
    sourceKinds: sources.map((s) => s.kind),
    labelledAsClaim: vendorish.length > 0,
    status: "proposed",
    approvedBy: null,
    approvedAt: null,
    deliveredAt: null,
    retrievedByRecipient: false,
    usedInEvaluationId: null,
    note:
      "Proposed peer lesson. It becomes retrievable by the recipient only after the owner approves it. " +
      "This is a new record and does not touch any other pending decision.",
  };
  upsert(store, COL.lessons, lesson);
  return { ok: true, built: true, lesson, requiresOwnerApproval: true, honesty: FOUNDRY_HONESTY };
}

export function decideLesson(store, input) {
  const rows = loadCol(store, COL.lessons);
  const lesson = rows.find((l) => l.id === txt(input && input.lessonId));
  if (!lesson) return { ok: false, error: "lesson not found", errorStatus: 404 };
  const action = txt(input && input.action).toLowerCase();
  if (action !== "approve" && action !== "reject") return { ok: false, error: "action must be approve or reject", errorStatus: 400 };
  if (lesson.status !== "proposed") return { ok: false, error: "This lesson was already decided.", errorStatus: 400 };
  lesson.status = action === "approve" ? "approved" : "rejected";
  lesson.approvedBy = "local_owner";
  lesson.approvedAt = nowIso();
  if (action === "approve") lesson.deliveredAt = nowIso();
  upsert(store, COL.lessons, lesson);
  return { ok: true, built: true, lesson };
}

/* did the lesson actually change the recipient's work? */
export function lessonImpact(store, lessonId) {
  const lesson = loadCol(store, COL.lessons).find((l) => l.id === txt(lessonId));
  if (!lesson) return { ok: false, error: "lesson not found", errorStatus: 404 };
  const evals = loadCol(store, COL.evals)
    .filter((e) => e.workspaceId === lesson.workspaceId && e.employeeId === lesson.toEmployeeId)
    .sort((a, b) => txt(a.at).localeCompare(txt(b.at)));
  const before = evals.filter((e) => txt(e.at) < txt(lesson.deliveredAt || lesson.at)).slice(-1)[0] || null;
  const after = evals.filter((e) => txt(e.at) > txt(lesson.deliveredAt || lesson.at))[0] || null;
  const retrieved = after ? (after.retrievedIds || []).indexOf(lesson.id) >= 0 : false;
  const cited = after ? (after.citations || []).indexOf(lesson.id) >= 0 : false;
  if (retrieved && after && !lesson.retrievedByRecipient) {
    lesson.retrievedByRecipient = true;
    lesson.usedInEvaluationId = after.id;
    upsert(store, COL.lessons, lesson);
  }
  return {
    ok: true,
    built: true,
    lesson: { id: lesson.id, status: lesson.status, from: lesson.fromRoleId, to: lesson.toRoleId },
    recipientRetrievedIt: retrieved,
    recipientCitedIt: cited,
    before: before ? { id: before.id, total: before.total, at: before.at } : null,
    after: after ? { id: after.id, total: after.total, at: after.at } : null,
    delta: before && after ? after.total - before.total : null,
    verdict: !after
      ? "The recipient has not done a task since the lesson was approved."
      : retrieved
        ? (before && after.total > before.total
            ? "The recipient retrieved the lesson and scored higher afterwards."
            : "The recipient retrieved the lesson; the score did not improve.")
        : "The recipient has not retrieved this lesson yet.",
    honesty: FOUNDRY_HONESTY,
  };
}

/* ============================================================================
   PART 6 — OPPORTUNITY ASSESSMENT
   ============================================================================ */
const EVIDENCE_CLASSES = ["verified_fact", "owner_provided", "source_backed_observation", "vendor_claim", "inference", "hypothesis", "unknown"];
const ASSESS_FIELDS = [
  ["targetCustomer", "Who exactly would buy this"],
  ["customerProblem", "The problem they have"],
  ["problemEvidence", "What evidence supports that the problem is real"],
  ["alternatives", "What they do today instead"],
  ["differentiation", "Why this would be chosen over that"],
  ["operationalRequirements", "What has to exist to deliver it"],
  ["startupCosts", "What it would cost to start"],
  ["budgetFit", "Whether that fits the owner's stated budget"],
  ["pricingHypothesis", "What it might be priced at"],
  ["marginAssumptions", "What margin that implies and on what assumption"],
  ["timeToFirstSale", "How soon a first sale could realistically happen"],
  ["automationPotential", "What part of it MIDAS could actually run"],
  ["distribution", "How the first customers would even hear about it"],
  ["risks", "What could sink it"],
  ["unknowns", "What is genuinely not known"],
  ["nextTest", "The cheapest next test that would reduce the biggest uncertainty"],
];
const ASSESS_SCHEMA = {
  name: "opportunity_assessment",
  strict: true,
  schema: {
    "type": "object",
    additionalProperties: false,
    required: ["fields", "overall", "recommendation"],
    properties: {
      overall: { "type": "string" },
      recommendation: { "type": "string" },
      fields: {
        "type": "array",
        items: {
          "type": "object",
          additionalProperties: false,
          required: ["field", "finding", "evidence_class", "evidence_ids"],
          properties: {
            field: { "type": "string" },
            finding: { "type": "string" },
            evidence_class: { "type": "string" },
            evidence_ids: { "type": "array", items: { "type": "string" } },
          },
        },
      },
    },
  },
};

export async function assessOpportunity(store, input, deps) {
  const ws = txt(input && (input.workspaceId || input.workspace));
  if (!ws) return { ok: false, error: "A company is required.", errorStatus: 400 };
  const idea = txt(input && (input.idea || input.opportunity || input.text));
  if (idea.length < 8) return { ok: false, error: "Describe the opportunity to assess.", errorStatus: 400 };

  const retrieval = await hybridRetrieve(store, {
    workspaceId: ws, roleId: "offer_strategist", query: idea, maxItems: 10,
    useEmbeddings: (input && input.useEmbeddings) !== false,
  }, deps);
  const w = (store.getWorkspace && store.getWorkspace(ws)) || {};

  const modelOut = await callModel(store, {
    workspaceId: ws, roleId: "offer_strategist",
    operation: "foundry_opportunity_assessment",
    capUsd: Number((input && input.capUsd) != null ? input.capUsd : 0.25),
    taskType: "opportunity_generation",
    note: "Opportunity assessment for " + ws,
    system:
      "You assess one business opportunity for one company. For every field, state what you actually found and grade it with an " +
      "evidence_class from: " + EVIDENCE_CLASSES.join(", ") + ". Use unknown freely — it is the correct answer when there is no evidence. " +
      "Never invent market size, demand, conversion, revenue, or willingness to pay. Vendor marketing is vendor_claim, never verified_fact. " +
      "Cite only the evidence ids supplied.",
    developer: "Return one JSON object matching the schema. Cover exactly these fields: " + ASSESS_FIELDS.map((f) => f[0]).join(", ") + ".",
    outputSchema: ASSESS_SCHEMA,
    input: {
      idea,
      company: { id: ws, name: w.name, description: w.description, goal: w.goal, budget: w.budget || null, geography: w.geography },
      fields: ASSESS_FIELDS.map(([k, about]) => ({ field: k, about })),
      evidence: retrieval.items.map((i) => ({ id: i.id, kind: i.kind, text: i.text.slice(0, 500) })),
    },
  }, deps);

  let fields;
  let overall;
  let recommendation;
  let producedBy;

  if (modelOut.ok && modelOut.json) {
    const known = new Set(retrieval.items.map((i) => i.id));
    fields = (modelOut.json.fields || []).map((f) => {
      const ids = (f.evidence_ids || []).map(txt).filter((x) => known.has(x));
      let cls = txt(f.evidence_class).toLowerCase();
      if (EVIDENCE_CLASSES.indexOf(cls) < 0) cls = "hypothesis";
      /* a claim with no surviving evidence id cannot outrank an inference */
      if (!ids.length && (cls === "verified_fact" || cls === "source_backed_observation")) cls = "inference";
      return { field: txt(f.field), finding: txt(f.finding), evidenceClass: cls, evidenceIds: ids };
    });
    overall = txt(modelOut.json.overall);
    recommendation = txt(modelOut.json.recommendation);
    producedBy = "live_model";
  } else {
    fields = ASSESS_FIELDS.map(([k, about]) => {
      const hit = retrieval.items.find((i) => tokens(about).some((t) => i.text.toLowerCase().includes(t)));
      return hit
        ? { field: k, finding: hit.text.slice(0, 240), evidenceClass: hit.mandatory ? "owner_provided" : "source_backed_observation", evidenceIds: [hit.id] }
        : { field: k, finding: "Not established from anything this company has recorded.", evidenceClass: "unknown", evidenceIds: [] };
    });
    overall = "Deterministic assessment from " + retrieval.items.length + " approved items. No live model was used.";
    recommendation = "Record more facts about this opportunity, then reassess.";
    producedBy = "deterministic";
  }

  const counts = {};
  for (const f of fields) counts[f.evidenceClass] = (counts[f.evidenceClass] || 0) + 1;
  const grounded = fields.filter((f) => f.evidenceIds.length).length;

  const record = {
    id: nextId(loadCol(store, COL.assessments), "OAS-"),
    at: nowIso(),
    workspaceId: ws,
    idea,
    producedBy,
    live: modelOut.live === true,
    fields,
    overall,
    recommendation,
    evidenceMix: counts,
    fieldsWithEvidence: grounded,
    fieldsTotal: fields.length,
    unknownCount: counts["unknown"] || 0,
    retrievalId: retrieval.retrievalId,
    embeddingsUsed: retrieval.embeddingsUsed,
    costUsd: modelOut.costUsd != null ? modelOut.costUsd : 0,
    note: "Every field is graded by how well it is actually evidenced. Unknown is a valid and common answer.",
  };
  upsert(store, COL.assessments, record);
  return { ok: true, built: true, assessment: record, retrieval, honesty: FOUNDRY_HONESTY };
}

/* ============================================================================
   PART 7 — COMPANY-SPECIFIC TEAM PLANNING
   ============================================================================ */
const WORK_CATEGORIES = [
  { key: "find_customers", label: "Finding out who would buy", roles: ["business_research"], cues: ["customer", "market", "who", "neighbourhood", "local", "audience", "demand"] },
  { key: "offer", label: "Deciding what to sell and for how much", roles: ["offer_strategist", "finance"], cues: ["offer", "price", "pricing", "package", "fee", "rate", "subscription", "$"] },
  { key: "reach", label: "Getting the offer in front of people", roles: ["marketing"], cues: ["marketing", "flyer", "copy", "advert", "listing", "social", "seo", "landing", "brand"] },
  { key: "sell", label: "Turning interest into a sale", roles: ["sales"], cues: ["sales", "lead", "quote", "estimate", "close", "pipeline", "client", "booking"] },
  { key: "build", label: "Building the product or software", roles: ["product"], cues: ["software", "app", "website", "landing page", "platform", "product", "build", "tool", "saas"] },
  { key: "deliver", label: "Actually delivering the work", roles: ["ops"], cues: ["schedule", "route", "delivery", "pickup", "service", "repair", "lesson", "appointment", "process", "checklist", "operate"] },
  { key: "money", label: "Keeping the numbers straight", roles: ["finance"], cues: ["budget", "cost", "margin", "bookkeeping", "invoice", "cash", "profit", "expense", "close"] },
  { key: "coordinate", label: "Coordinating the work", roles: ["workflow_manager"], cues: [] },
  { key: "check", label: "Checking the work before you see it", roles: ["independent_audit"], cues: [] },
  { key: "decide", label: "Weighing tradeoffs and deciding what is next", roles: ["executive"], cues: ["priority", "tradeoff", "decide", "strategy", "memo", "plan"] },
];
const ROLE_LABEL = {
  business_research: "Researcher", marketing: "Marketing specialist", sales: "Sales strategist",
  finance: "Finance analyst", product: "Product specialist", ops: "Operations specialist",
  offer_strategist: "Offer strategist", executive: "Executive strategist",
  workflow_manager: "Manager", independent_audit: "Watcher",
};

export function planTeam(store, input) {
  const ws = txt(input && (input.workspaceId || input.workspace));
  const w = (store.getWorkspace && store.getWorkspace(ws)) || null;
  if (!w) return { ok: false, error: "company not found", errorStatus: 404 };

  const blob = [w.description, w.goal, w.idealCustomer, w.industry, w.offer && (w.offer.summary || w.offer.name),
    Array.isArray(w.constraints) ? w.constraints.join(" ") : w.constraints].map(txt).join(" ").toLowerCase();

  const needed = [];
  for (const cat of WORK_CATEGORIES) {
    const hits = cat.cues.filter((c) => blob.includes(c));
    const always = cat.key === "coordinate" || cat.key === "check";
    if (!always && !hits.length) continue;
    needed.push({
      category: cat.key,
      label: cat.label,
      roles: cat.roles,
      why: always
        ? (cat.key === "coordinate"
            ? "Every business needs someone to break your instruction into steps and route it."
            : "Every business needs someone independent to check work before it reaches you.")
        : "This company's own description mentions " + hits.slice(0, 3).join(", ") + ".",
      matchedCues: hits,
    });
  }

  const existing = ((store.listEmployeeRolesForWorkspace && store.listEmployeeRolesForWorkspace(ws)) || [])
    .concat(((store.listAgents && store.listAgents()) || []).filter((a) => a.workspaceId === ws));
  const haveRoles = new Set(existing.map((e) => txt(e.roleId)));

  const roleRows = [];
  const seen = new Set();
  for (const n of needed) {
    for (const r of n.roles) {
      if (seen.has(r)) continue;
      seen.add(r);
      roleRows.push({
        roleId: r,
        title: ROLE_LABEL[r] || r,
        neededBecause: n.why,
        category: n.label,
        alreadyHired: haveRoles.has(r),
        responsibilities: (ROLE_STUDY[r] && ROLE_STUDY[r].rules) || [],
        informationNeeded: ROLE_TOPICS[r] || [],
        instruction:
          "For " + txt(w.name) + ": " + ((ROLE_STUDY[r] && ROLE_STUDY[r].focus) || "do this role's work") +
          ", using only " + txt(w.name) + "'s approved knowledge.",
      });
    }
  }
  const missing = roleRows.filter((r) => !r.alreadyHired);
  const surplus = Array.from(haveRoles).filter((r) => !seen.has(txt(r)));

  const plan = {
    id: nextId(loadCol(store, COL.teamPlans), "TPL-"),
    at: nowIso(),
    workspaceId: ws,
    companyName: w.name,
    objective: w.goal || w.description || null,
    categories: needed,
    roles: roleRows,
    alreadyHired: roleRows.filter((r) => r.alreadyHired).map((r) => r.roleId),
    missingRoles: missing.map((r) => r.roleId),
    rolesNotNeededByThisPlan: surplus,
    budget: w.budget || null,
    requiresOwnerAuthorization: missing.length > 0,
    note: "A plan only. No employee is created here. Hiring stays behind the existing owner authorization step.",
    honesty: FOUNDRY_HONESTY,
  };
  upsert(store, COL.teamPlans, plan);
  return { ok: true, built: true, plan };
}

/* ============================================================================
   PART 8 — ORCHESTRATED MULTI-AGENT WORK
   Manager -> specialists -> executive -> watcher, with every step recorded.
   ============================================================================ */
const STAGE_ORDER = ["business_research", "offer_strategist", "finance", "marketing", "product", "ops", "sales"];

function employeesOf(store, ws) {
  const roles = (store.listEmployeeRolesForWorkspace && store.listEmployeeRolesForWorkspace(ws)) || [];
  const agents = ((store.listAgents && store.listAgents()) || []).filter((a) => a.workspaceId === ws);
  const out = [];
  const seen = new Set();
  for (const r of roles.concat(agents)) {
    const id = txt(r.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(resolveEmployee(store, id) || r);
  }
  return out.filter((e) => txt(e.workspaceId) === ws);
}

function stageTask(roleId, objective, companyName) {
  const map = {
    business_research: "List what we actually know and what we still need to find out to deliver this",
    offer_strategist: "Propose the offer and positioning for this, clearly labelled as a hypothesis",
    finance: "Work out the cost and margin picture, separating owner-reported numbers from assumptions",
    marketing: "Draft the messaging using only approved facts, and name the likely objections",
    product: "Turn this into requirements and a first buildable slice, naming the technical unknowns",
    ops: "Sequence the practical steps to actually deliver this and name the bottleneck",
    sales: "Plan internal qualification and objection handling. No outreach",
  };
  const lead = map[roleId] || "Do your part of this";
  return lead + " — " + objective + " (for " + companyName + ")";
}


const EXEC_SCHEMA = {
  name: "executive_synthesis",
  strict: true,
  schema: {
    "type": "object",
    additionalProperties: false,
    required: ["recommendation", "reasoning", "disagreements", "risks", "next_decision", "unknowns", "citations"],
    properties: {
      recommendation: { "type": "string" },
      reasoning: { "type": "string" },
      disagreements: { "type": "array", items: { "type": "string" } },
      risks: { "type": "array", items: { "type": "string" } },
      next_decision: { "type": "string" },
      unknowns: { "type": "array", items: { "type": "string" } },
      citations: { "type": "array", items: { "type": "string" } },
    },
  },
};

export async function runFoundryWorkflow(store, input, deps) {
  const ws = txt(input && (input.workspaceId || input.workspace));
  const w = (store.getWorkspace && store.getWorkspace(ws)) || null;
  if (!w) return { ok: false, error: "company not found", errorStatus: 404 };
  const objective = txt(input && (input.objective || input.ownerText));
  if (objective.length < 12) return { ok: false, error: "Describe what you want the team to work on.", errorStatus: 400 };

  const budgetUsd = Number((input && input.budgetUsd) != null ? input.budgetUsd : 1.0);
  const team = employeesOf(store, ws);
  const manager = team.find((e) => txt(e.roleId) === "workflow_manager") || null;
  const executive = team.find((e) => txt(e.roleId) === "executive") || null;
  const watcher = team.find((e) => txt(e.roleId) === "independent_audit") || null;

  /* manager plans deterministically: which of this company's people are needed */
  const wanted = STAGE_ORDER.filter((r) => team.some((e) => txt(e.roleId) === r));
  const limit = Number((input && input.maxStages) != null ? input.maxStages : 4);
  const chosen = wanted.slice(0, Math.max(1, limit));
  const managerPlan = {
    by: manager ? manager.id : null,
    method: "deterministic",
    note: "Task breakdown is deterministic. It picks from the people this company actually has.",
    stages: chosen.map((r, i) => ({ n: i + 1, roleId: r, title: ROLE_LABEL[r] || r, task: stageTask(r, objective, txt(w.name)) })),
    skipped: STAGE_ORDER.filter((r) => !wanted.includes(r)).map((r) => ({ roleId: r, reason: "nobody at this company holds this role" })),
  };

  const stages = [];
  let spent = 0;
  for (const st of managerPlan.stages) {
    const emp = team.find((e) => txt(e.roleId) === st.roleId);
    if (!emp) continue;
    if (spent >= budgetUsd) {
      stages.push({ ...st, employeeId: emp.id, skipped: true, reason: "workflow budget reached before this stage" });
      continue;
    }
    const run = await runPracticeTask(store, {
      employeeId: emp.id,
      task: st.task,
      label: "workflow",
      capUsd: Math.max(0.05, Math.min(0.25, budgetUsd - spent)),
      useEmbeddings: (input && input.useEmbeddings) !== false,
    }, deps);
    if (!run.ok) {
      stages.push({ ...st, employeeId: emp.id, skipped: true, reason: txt(run.error) });
      continue;
    }
    const ev = run.evaluation;
    spent += Number(ev.costUsd || 0);
    stages.push({
      ...st,
      employeeId: emp.id,
      employeeName: emp.name,
      producedBy: ev.producedBy,
      live: ev.live,
      retrievedIds: ev.retrievedIds,
      citations: ev.citations,
      embeddingsUsed: ev.embeddingsUsed,
      output: ev.output,
      unknowns: ev.unknowns,
      score: ev.total,
      reviewPassed: ev.total >= 60,
      costUsd: ev.costUsd,
      evaluationId: ev.id,
    });
  }

  /* executive synthesis over what the specialists actually produced */
  const done = stages.filter((s) => !s.skipped);
  let synthesis;
  if (executive && done.length && spent < budgetUsd) {
    const modelOut = await callModel(store, {
      workspaceId: ws, roleId: "executive", agentId: executive.agentId || executive.id,
      operation: "foundry_executive_synthesis",
      capUsd: Math.max(0.05, budgetUsd - spent),
      taskType: "executive_planning",
      note: "Executive synthesis for " + ws,
      system:
        "You are the executive at one company. Synthesise ONLY what the specialists produced. Introduce no new facts. " +
        "Name where they disagree rather than averaging it away. Recommend exactly one next decision with its tradeoff. " +
        "Never assert demand, revenue, market size, or customers.",
      developer: "Return one JSON object matching the schema. citations: evidence ids the specialists used that you relied on.",
      outputSchema: EXEC_SCHEMA,
      input: {
        objective,
        company: txt(w.name),
        specialist_outputs: done.map((s) => ({ role: s.roleId, output: txt(s.output).slice(0, 2200), citations: s.citations, unknowns: s.unknowns })),
      },
    }, deps);
    if (modelOut.ok && modelOut.json) {
      spent += Number(modelOut.costUsd || 0);
      synthesis = {
        by: executive.id, producedBy: "live_model", live: true,
        recommendation: txt(modelOut.json.recommendation),
        reasoning: txt(modelOut.json.reasoning),
        disagreements: (modelOut.json.disagreements || []).map(txt),
        risks: (modelOut.json.risks || []).map(txt),
        nextDecision: txt(modelOut.json.next_decision),
        unknowns: (modelOut.json.unknowns || []).map(txt),
        citations: (modelOut.json.citations || []).map(txt),
        costUsd: modelOut.costUsd,
      };
    } else {
      synthesis = deterministicSynthesis(executive, done, modelOut);
    }
  } else {
    synthesis = deterministicSynthesis(executive, done, { reason: executive ? "budget_reached" : "no_executive_at_this_company" });
  }

  /* watcher: deterministic, advisory, never approves anything */
  const corpus = buildCorpus(store, ws, null);
  const corpusIds = new Set(corpus.map((c) => c.id));
  const flags = [];
  for (const s of done) {
    const bad = (s.citations || []).filter((c) => !corpusIds.has(c));
    if (bad.length) flags.push({ stage: s.roleId, kind: "citation_not_found", detail: bad.slice(0, 3).join(", ") });
    if (s.score < 60) flags.push({ stage: s.roleId, kind: "below_review_bar", detail: "scored " + s.score + "/100" });
    for (const re of UNSUPPORTED) if (re.test(txt(s.output))) { flags.push({ stage: s.roleId, kind: "unsupported_business_claim", detail: String(re) }); break; }
  }
  for (const c of (synthesis.citations || [])) if (!corpusIds.has(c)) flags.push({ stage: "executive", kind: "citation_not_found", detail: c });

  const record = {
    id: nextId(loadCol(store, COL.workflows), "WFL-"),
    at: nowIso(),
    workspaceId: ws,
    companyName: w.name,
    objective,
    managerPlan,
    stages,
    synthesis,
    watcher: {
      by: watcher ? watcher.id : null,
      method: "deterministic",
      flags,
      passed: flags.length === 0,
      note: "Advisory only. The Watcher never approves work on your behalf.",
    },
    liveStages: done.filter((s) => s.live).length,
    deterministicStages: done.filter((s) => !s.live).length,
    embeddingsUsed: done.some((s) => s.embeddingsUsed),
    costUsd: Math.round(spent * 1e6) / 1e6,
    budgetUsd,
    honesty: FOUNDRY_HONESTY,
    isolation: { workspaceId: ws, note: "Every stage retrieved only from " + ws + "." },
  };
  upsert(store, COL.workflows, record);
  return { ok: true, built: true, workflow: record };
}

function deterministicSynthesis(executive, done, why) {
  const unknowns = Array.from(new Set(done.flatMap((s) => s.unknowns || []))).slice(0, 8);
  return {
    by: executive ? executive.id : null,
    producedBy: "deterministic",
    live: false,
    liveReason: txt(why && why.reason) || "no_live_provider",
    recommendation:
      done.length
        ? "Review each specialist's draft above. " + done.length + " of them produced work; " +
          done.filter((s) => s.reviewPassed).length + " cleared the review bar."
        : "Nothing was produced. Check that this company has people who can do this work.",
    reasoning: "Deterministic roll-up. No live model synthesised these outputs, so nothing was inferred beyond what the specialists wrote.",
    disagreements: [],
    risks: ["This roll-up is mechanical; it has not weighed the tradeoffs for you."],
    nextDecision: "Decide which specialist draft to take forward.",
    unknowns,
    citations: Array.from(new Set(done.flatMap((s) => s.citations || []))).slice(0, 12),
    costUsd: 0,
  };
}

/* ============================================================================
   VIEWS
   ============================================================================ */
export function foundryOverview(store, workspaceId) {
  const ws = txt(workspaceId);
  const f = (rows) => (ws ? rows.filter((r) => r.workspaceId === ws) : rows);
  const sessions = f(loadCol(store, COL.sessions));
  const evals = f(loadCol(store, COL.evals));
  const lessons = f(loadCol(store, COL.lessons));
  const playbooks = f(loadCol(store, COL.playbooks));
  const workflows = f(loadCol(store, COL.workflows));
  const assessments = f(loadCol(store, COL.assessments));
  const retrievals = f(loadCol(store, COL.retrievals));

  const cost = [...sessions, ...evals, ...workflows, ...assessments].reduce((s, r) => s + Number(r.costUsd || 0), 0);
  const byEmployee = {};
  for (const e of evals.slice().sort((a, b) => txt(a.at).localeCompare(txt(b.at)))) {
    const row = byEmployee[e.employeeId] || (byEmployee[e.employeeId] = { employeeId: e.employeeId, roleId: e.roleId, runs: 0, first: null, latest: null });
    row.runs++;
    if (row.first == null) row.first = e.total;
    row.latest = e.total;
    row.delta = row.latest - row.first;
  }

  return {
    built: true,
    workspaceId: ws || null,
    honesty: FOUNDRY_HONESTY,
    counts: {
      learningSessions: sessions.length,
      playbooks: playbooks.length,
      evaluations: evals.length,
      peerLessons: lessons.length,
      lessonsApproved: lessons.filter((l) => l.status === "approved").length,
      lessonsAwaitingYou: lessons.filter((l) => l.status === "proposed").length,
      workflows: workflows.length,
      opportunityAssessments: assessments.length,
      retrievals: retrievals.length,
    },
    retrieval: {
      hybridRuns: retrievals.filter((r) => r.embeddingsUsed).length,
      lexicalOnlyRuns: retrievals.filter((r) => !r.embeddingsUsed).length,
      lastMethod: retrievals.length ? retrievals[retrievals.length - 1].method : null,
      foreignItemsEverScored: retrievals.reduce((s, r) => s + Number((r.isolation && r.isolation.foreignItemsInPool) || 0), 0),
    },
    progress: Object.values(byEmployee),
    liveVsDeterministic: {
      liveEvaluations: evals.filter((e) => e.live).length,
      deterministicEvaluations: evals.filter((e) => !e.live).length,
      systemFailures: evals.filter((e) => e.systemFailure).length,
    },
    costUsd: Math.round(cost * 1e6) / 1e6,
    rubricVersion: RUBRIC_VERSION,
  };
}

export function listPlaybooks(store, workspaceId) {
  const rows = loadCol(store, COL.playbooks);
  return { built: true, playbooks: workspaceId ? rows.filter((r) => r.workspaceId === workspaceId) : rows };
}
export function listSessions(store, workspaceId) {
  const rows = loadCol(store, COL.sessions);
  return { built: true, sessions: workspaceId ? rows.filter((r) => r.workspaceId === workspaceId) : rows };
}
export function listEvaluations(store, workspaceId, employeeId) {
  let rows = loadCol(store, COL.evals);
  if (workspaceId) rows = rows.filter((r) => r.workspaceId === workspaceId);
  if (employeeId) rows = rows.filter((r) => r.employeeId === employeeId);
  return { built: true, rubric: RUBRIC, rubricVersion: RUBRIC_VERSION, evaluations: rows };
}
export function listLessons(store, workspaceId) {
  const rows = loadCol(store, COL.lessons);
  return { built: true, lessons: workspaceId ? rows.filter((r) => r.workspaceId === workspaceId) : rows };
}
export function listWorkflows(store, workspaceId) {
  const rows = loadCol(store, COL.workflows);
  return { built: true, workflows: workspaceId ? rows.filter((r) => r.workspaceId === workspaceId) : rows };
}
export function getWorkflow(store, id) {
  const row = loadCol(store, COL.workflows).find((r) => r.id === txt(id));
  return row ? { built: true, workflow: row } : { ok: false, error: "workflow not found", errorStatus: 404 };
}
export function listAssessments(store, workspaceId) {
  const rows = loadCol(store, COL.assessments);
  return { built: true, assessments: workspaceId ? rows.filter((r) => r.workspaceId === workspaceId) : rows };
}

/* isolation self-test the founder can run on demand */
export async function isolationProbe(store, input, deps) {
  const a = txt(input && input.workspaceA);
  const b = txt(input && input.workspaceB);
  if (!a || !b) return { ok: false, error: "Two companies are required.", errorStatus: 400 };
  const query = txt(input && input.query) || "pricing and customers";
  const ra = await hybridRetrieve(store, { workspaceId: a, roleId: null, query, maxItems: 12, useEmbeddings: false }, deps);
  const rb = await hybridRetrieve(store, { workspaceId: b, roleId: null, query, maxItems: 12, useEmbeddings: false }, deps);
  const idsA = new Set(ra.items.map((i) => i.id));
  const idsB = new Set(rb.items.map((i) => i.id));
  const shared = Array.from(idsA).filter((id) => idsB.has(id));
  const corpusA = buildCorpus(store, a, null).map((c) => c.id);
  const corpusB = buildCorpus(store, b, null).map((c) => c.id);
  const crossover = corpusA.filter((id) => corpusB.includes(id));
  return {
    ok: true,
    built: true,
    query,
    a: { workspaceId: a, retrieved: ra.items.length, ids: Array.from(idsA) },
    b: { workspaceId: b, retrieved: rb.items.length, ids: Array.from(idsB) },
    sharedRetrievedIds: shared,
    sharedCorpusIds: crossover,
    passed: shared.length === 0 && crossover.length === 0,
    note: shared.length === 0 && crossover.length === 0
      ? "Neither company can retrieve the other's material."
      : "Overlap detected. Investigate before trusting these results.",
  };
}
