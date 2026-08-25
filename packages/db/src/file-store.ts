import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stateDir } from "./locate.js";
const NEWLINE = "\n";
export const KIND = "FILE_STORE";
export const FILE_STORE_KIND = KIND;

export interface SourceRecord {
  id: string;
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string;
  contentType: string;
  sha256: string;
  byteLength: number;
  parserVersion: string;
  captureStatus: "LIVE_WEB" | "LOCAL_REFERENCE";
  captureNote: string;
  bytesPath: string;
  runtimeEligible: boolean;
}

export interface KnowledgeRecord {
  id: string;
  type: "principle" | "decision_rule" | "procedure" | "failure_pattern" | "constraint" | "example";
  statement: string;
  sourceId: string;
  sourceSha256: string;
  locator: { section: string; charStart: number; charEnd: number; text: string };
  claimKind: "vendor_opinion" | "product_behavior" | "regulatory_guidance" | "owner_policy";
  accepted: boolean;
  createdAt: string;
  runtimeEligible: boolean;
  rejectReason?: string;
  workspaceId?: string | null;
  applicableRole?: string | null;
  epistemicClass?: string;
  private?: boolean;
}

export interface CurriculumSnapshot {
  id: string;
  createdAt: string;
  parserVersion: string;
  sourceIds: string[];
  sourceSha256s: Record<string, string>;
  knowledgeItemIds: string[];
  contentHash: string;
  note: string;
}

export interface Store {
  readonly kind: typeof KIND;
  listAgents(): Agent[];
  getAgent(id: string): Agent | undefined;
  putAgent(agent: Agent): Agent;
  listVersions(agentId?: string): AgentVersion[];
  getVersion(id: string): AgentVersion | undefined;
  putVersion(version: AgentVersion): AgentVersion;
  listEvalRuns(): EvalRun[];
  getEvalRun(id: string): EvalRun | undefined;
  putEvalRun(run: EvalRun): EvalRun;
  listCaseResults(evalRunId?: string): CaseResult[];
  getCaseResult(evalRunId: string, caseId: string): CaseResult | undefined;
  putCaseResult(result: CaseResult): CaseResult;
  listDecisions(evalRunId?: string): Decision[];
  putDecision(decision: Decision): Decision;
  listKnowledge(): KnowledgeRecord[];
  putKnowledge(item: KnowledgeRecord): KnowledgeRecord;
  getKnowledge(id: string): KnowledgeRecord | undefined;
  listSources(): SourceRecord[];
  getSource(id: string): SourceRecord | undefined;
  putSource(source: SourceRecord): SourceRecord;
  listCurriculumSnapshots(): CurriculumSnapshot[];
  getCurriculumSnapshot(id: string): CurriculumSnapshot | undefined;
  putCurriculumSnapshot(snapshot: CurriculumSnapshot): CurriculumSnapshot;
}

export interface FileStoreMeta {
  kind: typeof KIND;
  note: string;
  createdAt: string;
}

const EMPTY_META = {
  kind: KIND,
  note: "JSON file store. Not PostgreSQL. Drizzle schema remains the future PG contract.",
  createdAt: new Date(0).toISOString(),
};

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

const TRANSIENT_RENAME_ERRORS = ["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"];
let atomicWriteCounter = 0;

/** Block briefly without pulling in a timer. Used only for rename backoff. */
function sleepMs(ms) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

/**
 * Write JSON durably: full content to a private temp file, then one rename.
 *
 * Two properties this has to hold and previously did not.
 *
 * 1. The temp name must be unique per writer. A fixed `<path>.tmp` meant two
 *    processes writing the same store clobbered each other's half-written file
 *    and could rename a truncated document into place.
 * 2. Rename must tolerate transient locks. On Windows a virus scanner or search
 *    indexer holding the destination open makes renameSync throw EPERM even
 *    though nothing is wrong; a single attempt turned that into a lost write.
 */
function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteCounter += 1;
  const tmp = path + ".tmp." + process.pid + "." + atomicWriteCounter;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + NEWLINE, "utf8");
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      lastError = err;
      if (!TRANSIENT_RENAME_ERRORS.includes(err && err.code)) break;
      sleepMs(5 + attempt * 5);
    }
  }
  try { rmSync(tmp, { force: true }); } catch (cleanupError) { /* the rename failure is the real error */ }
  throw lastError;
}

export function defaultStateDir(): string {
  return stateDir();
}

export function createStore(dir) {
  // DATABASE_URL is ignored in V0.1. Persistence is always FILE_STORE.
  // Never claim PostgreSQL is connected, even if DATABASE_URL is set.
  if (process.env.DATABASE_URL) {
    // Intentionally unused. No Postgres driver is loaded.
  }
  return new FileStore(dir ?? defaultStateDir());
}

export class FileStore {
  kind = KIND;
  dir;

  constructor(dir = defaultStateDir()) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    if (!existsSync(this.path("meta.json"))) {
      atomicWrite(this.path("meta.json"), {
        ...EMPTY_META,
        createdAt: new Date().toISOString(),
      });
    }
  }

  path(name) {
    return join(this.dir, name);
  }

  meta() {
    return readJson(this.path("meta.json"), EMPTY_META);
  }

  listAgents() {
    return readJson(this.path("agents.json"), []);
  }

  getAgent(id) {
    return this.listAgents().find((a) => a.id === id);
  }

  putAgent(agent) {
    const all = this.listAgents().filter((a) => a.id !== agent.id);
    all.push(agent);
    atomicWrite(this.path("agents.json"), all);
    return agent;
  }

  listVersions(agentId) {
    const all = readJson(this.path("agent_versions.json"), []);
    return agentId ? all.filter((v) => v.agentId === agentId) : all;
  }

  getVersion(id) {
    return this.listVersions().find((v) => v.id === id);
  }

  putVersion(version) {
    if (this.getVersion(version.id)) {
      throw new Error(`AgentVersion ${version.id} is immutable and already exists`);
    }
    const all = this.listVersions();
    all.push(version);
    atomicWrite(this.path("agent_versions.json"), all);
    return version;
  }

  listEvalRuns() {
    return readJson(this.path("eval_runs.json"), []);
  }

  getEvalRun(id) {
    return this.listEvalRuns().find((r) => r.id === id);
  }

  putEvalRun(run) {
    const all = this.listEvalRuns().filter((r) => r.id !== run.id);
    all.push(run);
    atomicWrite(this.path("eval_runs.json"), all);
    return run;
  }

  listCaseResults(evalRunId) {
    const all = readJson(this.path("case_results.json"), []);
    return evalRunId ? all.filter((r) => r.evalRunId === evalRunId) : all;
  }

  getCaseResult(evalRunId, caseId) {
    return this.listCaseResults(evalRunId).find((r) => r.caseId === caseId);
  }

  putCaseResult(result) {
    const all = this.listCaseResults().filter((r) => r.id !== result.id);
    all.push(result);
    atomicWrite(this.path("case_results.json"), all);
    return result;
  }

  listDecisions(evalRunId) {
    const all = readJson(this.path("decisions.json"), []);
    return evalRunId ? all.filter((d) => d.evalRunId === evalRunId) : all;
  }

  putDecision(decision) {
    const all = this.listDecisions();
    all.push(decision);
    atomicWrite(this.path("decisions.json"), all);
    return decision;
  }

  listKnowledge() {
    return readJson(this.path("knowledge_items.json"), []);
  }

  getKnowledge(id) {
    return this.listKnowledge().find((k) => k.id === id);
  }

  putKnowledge(item) {
    const all = this.listKnowledge().filter((k) => k.id !== item.id);
    all.push(item);
    atomicWrite(this.path("knowledge_items.json"), all);
    return item;
  }

  listSources() {
    return readJson(this.path("sources.json"), []);
  }

  getSource(id) {
    return this.listSources().find((s) => s.id === id);
  }

  putSource(source) {
    const all = this.listSources().filter((s) => s.id !== source.id);
    all.push(source);
    atomicWrite(this.path("sources.json"), all);
    return source;
  }

  listCurriculumSnapshots() {
    return readJson(this.path("curriculum_snapshots.json"), []);
  }

  getCurriculumSnapshot(id) {
    return this.listCurriculumSnapshots().find((s) => s.id === id);
  }

  putCurriculumSnapshot(snapshot) {
    if (this.getCurriculumSnapshot(snapshot.id)) {
      return this.getCurriculumSnapshot(snapshot.id);
    }
    const all = this.listCurriculumSnapshots();
    all.push(snapshot);
    atomicWrite(this.path("curriculum_snapshots.json"), all);
    return snapshot;
  }

  spendState() {
    return readJson(this.path("spend.json"), {
      days: {},
      note: "Estimated USD only. No API keys stored.",
    });
  }

  daySpend(day) {
    const state = this.spendState();
    return state.days[day] || { usd: 0, inputTokens: 0, outputTokens: 0, events: [] };
  }

  addSpend(entry) {
    const state = this.spendState();
    const day = String(entry.at || new Date().toISOString()).slice(0, 10);
    const cur = state.days[day] || { usd: 0, inputTokens: 0, outputTokens: 0, events: [] };
    cur.usd = Number(cur.usd || 0) + Number(entry.usd || 0);
    cur.inputTokens = Number(cur.inputTokens || 0) + Number(entry.inputTokens || 0);
    cur.outputTokens = Number(cur.outputTokens || 0) + Number(entry.outputTokens || 0);
    cur.events.push({
      at: entry.at,
      runId: entry.runId || null,
      kind: entry.kind || "unknown",
      usd: Number(entry.usd || 0),
      inputTokens: Number(entry.inputTokens || 0),
      outputTokens: Number(entry.outputTokens || 0),
    });
    state.days[day] = cur;
    atomicWrite(this.path("spend.json"), state);
    return cur;
  }

  listFetches() {
    return readJson(this.path("studio_fetches.json"), []);
  }

  getFetch(id) {
    return this.listFetches().find((f) => f.id === id);
  }

  putFetch(record) {
    const all = this.listFetches().filter((f) => f.id !== record.id);
    all.push(record);
    atomicWrite(this.path("studio_fetches.json"), all);
    return record;
  }

  listReviews() {
    return readJson(this.path("studio_reviews.json"), []);
  }

  putReview(record) {
    const all = this.listReviews();
    all.push(record);
    atomicWrite(this.path("studio_reviews.json"), all);
    return record;
  }

  listOwnerRules() {
    return readJson(this.path("studio_owner_rules.json"), []);
  }

  getOwnerRule(id) {
    return this.listOwnerRules().find((r) => r.id === id);
  }

  putOwnerRule(record) {
    const all = this.listOwnerRules().filter((r) => r.id !== record.id);
    all.push(record);
    atomicWrite(this.path("studio_owner_rules.json"), all);
    return record;
  }

  listStudioItems() {
    return (this.listKnowledge() || []).filter((k) => k && (k.studio === true || String(k.id || "").startsWith("K-STUDIO-") || k.kind || k.reviewStatus));
  }

  listWorkspaces() {
    return readJson(this.path("workspaces.json"), []);
  }

  getWorkspace(id) {
    return this.listWorkspaces().find((w) => w.id === id);
  }

  putWorkspace(workspace) {
    const all = this.listWorkspaces().filter((w) => w.id !== workspace.id);
    all.push(workspace);
    atomicWrite(this.path("workspaces.json"), all);
    return workspace;
  }

  listTrainingEvents(workspaceId) {
    const all = readJson(this.path("training_events.json"), []);
    return workspaceId ? all.filter((e) => e.workspaceId === workspaceId) : all;
  }

  getTrainingEvent(id) {
    return this.listTrainingEvents().find((e) => e.id === id);
  }

  putTrainingEvent(event) {
    const all = this.listTrainingEvents();
    all.push(event);
    atomicWrite(this.path("training_events.json"), all);
    return event;
  }

  listWorkbenchRuns(workspaceId) {
    const all = readJson(this.path("workbench_runs.json"), []);
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }

  getWorkbenchRun(id) {
    return this.listWorkbenchRuns().find((r) => r.id === id);
  }

  putWorkbenchRun(run) {
    const all = this.listWorkbenchRuns().filter((r) => r.id !== run.id);
    all.push(run);
    atomicWrite(this.path("workbench_runs.json"), all);
    return run;
  }

  listOwnerReviewLabels(workspaceId) {
    const all = readJson(this.path("owner_review_labels.json"), []);
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }

  putOwnerReviewLabel(label) {
    const all = this.listOwnerReviewLabels();
    all.push(label);
    atomicWrite(this.path("owner_review_labels.json"), all);
    return label;
  }

  listWorkspaceNotes(workspaceId) {
    const all = readJson(this.path("workspace_notes.json"), []);
    return workspaceId ? all.filter((n) => n.workspaceId === workspaceId) : all;
  }

  putWorkspaceNote(note) {
    const all = this.listWorkspaceNotes();
    all.push(note);
    atomicWrite(this.path("workspace_notes.json"), all);
    return note;
  }

  listSpendLedger(workspaceId) {
    const all = readJson(this.path("spend_ledger.json"), []);
    return workspaceId ? all.filter((e) => e.workspaceId === workspaceId) : all;
  }

  getSpendLedgerEntry(id) {
    return this.listSpendLedger().find((e) => e.id === id);
  }

  putSpendLedgerEntry(entry) {
    const all = this.listSpendLedger();
    const next = all.filter((e) => e.id !== entry.id);
    next.push(entry);
    atomicWrite(this.path("spend_ledger.json"), next);
    return entry;
  }

  listResearchRequests(workspaceId) {
    const all = readJson(this.path("research_requests.json"), []);
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }

  getResearchRequest(id) {
    return this.listResearchRequests().find((r) => r.id === id);
  }

  putResearchRequest(record) {
    const all = this.listResearchRequests();
    const next = all.filter((r) => r.id !== record.id);
    next.push(record);
    atomicWrite(this.path("research_requests.json"), next);
    return record;
  }

  listScoutFindings(workspaceId) {
    const all = readJson(this.path("scout_findings.json"), []);
    return workspaceId ? all.filter((f) => f.workspaceId === workspaceId) : all;
  }

  getScoutFinding(id) {
    return this.listScoutFindings().find((f) => f.id === id);
  }

  putScoutFinding(record) {
    const all = this.listScoutFindings();
    const next = all.filter((f) => f.id !== record.id);
    next.push(record);
    atomicWrite(this.path("scout_findings.json"), next);
    return record;
  }

  listScoutReviews(workspaceId) {
    const all = readJson(this.path("scout_reviews.json"), []);
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }

  putScoutReview(record) {
    const all = this.listScoutReviews();
    all.push(record);
    atomicWrite(this.path("scout_reviews.json"), all);
    return record;
  }

  listScoutActivity(workspaceId) {
    const all = readJson(this.path("scout_activity.json"), []);
    return workspaceId ? all.filter((a) => a.workspaceId === workspaceId) : all;
  }

  putScoutActivity(record) {
    const all = this.listScoutActivity();
    all.push(record);
    atomicWrite(this.path("scout_activity.json"), all);
    return record;
  }

  listWatcherAudits(workspaceId) {
    const all = readJson(this.path("watcher_audits.json"), []);
    return workspaceId ? all.filter((a) => a.workspaceId === workspaceId) : all;
  }

  getWatcherAudit(id) {
    return this.listWatcherAudits().find((a) => a.id === id);
  }

  putWatcherAudit(record) {
    const all = this.listWatcherAudits();
    if (all.some((a) => a.id === record.id)) {
      throw new Error("Watcher audit reports are append-only and immutable.");
    }
    all.push(record);
    atomicWrite(this.path("watcher_audits.json"), all);
    return record;
  }

  listWatcherFindings(workspaceId) {
    const all = readJson(this.path("watcher_findings.json"), []);
    return workspaceId ? all.filter((f) => f.workspaceId === workspaceId) : all;
  }

  putWatcherFinding(record) {
    const all = this.listWatcherFindings();
    if (all.some((f) => f.id === record.id)) {
      throw new Error("Watcher findings are append-only and immutable.");
    }
    all.push(record);
    atomicWrite(this.path("watcher_findings.json"), all);
    return record;
  }

  listWatcherActivity(workspaceId) {
    const all = readJson(this.path("watcher_activity.json"), []);
    return workspaceId ? all.filter((a) => a.workspaceId === workspaceId) : all;
  }

  putWatcherActivity(record) {
    const all = this.listWatcherActivity();
    all.push(record);
    atomicWrite(this.path("watcher_activity.json"), all);
    return record;
  }

  listObjectives(workspaceId) {
    const all = readJson(this.path("objectives.json"), []);
    return workspaceId ? all.filter((o) => o.workspaceId === workspaceId) : all;
  }

  getObjective(id) {
    return this.listObjectives().find((o) => o.id === id);
  }

  putObjective(record) {
    const all = this.listObjectives();
    const next = all.filter((o) => o.id !== record.id);
    next.push(record);
    atomicWrite(this.path("objectives.json"), next);
    return record;
  }

  listPlans(objectiveId) {
    const all = readJson(this.path("workflow_plans.json"), []);
    return objectiveId ? all.filter((p) => p.objectiveId === objectiveId) : all;
  }

  getPlan(id) {
    return this.listPlans().find((p) => p.id === id);
  }

  putPlan(record) {
    const all = this.listPlans();
    const next = all.filter((p) => p.id !== record.id);
    next.push(record);
    atomicWrite(this.path("workflow_plans.json"), next);
    return record;
  }

  listTasks(objectiveId) {
    const all = readJson(this.path("workflow_tasks.json"), []);
    return objectiveId ? all.filter((t) => t.objectiveId === objectiveId) : all;
  }

  getTask(id) {
    return this.listTasks().find((t) => t.id === id);
  }

  putTask(record) {
    const all = this.listTasks();
    const next = all.filter((t) => t.id !== record.id);
    next.push(record);
    atomicWrite(this.path("workflow_tasks.json"), next);
    return record;
  }

  listApprovalRequests(objectiveId) {
    const all = readJson(this.path("approval_requests.json"), []);
    return objectiveId ? all.filter((r) => r.objectiveId === objectiveId) : all;
  }

  getApprovalRequest(id) {
    return this.listApprovalRequests().find((r) => r.id === id);
  }

  putApprovalRequest(record) {
    const all = this.listApprovalRequests();
    const next = all.filter((r) => r.id !== record.id);
    next.push(record);
    atomicWrite(this.path("approval_requests.json"), next);
    return record;
  }

  listApprovalDecisions(objectiveId) {
    const all = readJson(this.path("approval_decisions.json"), []);
    return objectiveId ? all.filter((d) => d.objectiveId === objectiveId) : all;
  }

  getApprovalDecision(id) {
    return this.listApprovalDecisions().find((d) => d.id === id);
  }

  putApprovalDecision(record) {
    const all = this.listApprovalDecisions();
    if (all.some((d) => d.id === record.id)) {
      throw new Error("Approval decisions are append-only and immutable.");
    }
    all.push(record);
    atomicWrite(this.path("approval_decisions.json"), all);
    return record;
  }

  listManagerActivity(workspaceId) {
    const all = readJson(this.path("manager_activity.json"), []);
    return workspaceId ? all.filter((a) => a.workspaceId === workspaceId) : all;
  }

  putManagerActivity(record) {
    const all = this.listManagerActivity();
    all.push(record);
    atomicWrite(this.path("manager_activity.json"), all);
    return record;
  }

  listManagerSummaries(objectiveId) {
    const all = readJson(this.path("manager_summaries.json"), []);
    return objectiveId ? all.filter((s) => s.objectiveId === objectiveId) : all;
  }

  getManagerSummary(id) {
    return this.listManagerSummaries().find((s) => s.id === id);
  }

  putManagerSummary(record) {
    const all = this.listManagerSummaries();
    const next = all.filter((s) => s.id !== record.id);
    next.push(record);
    atomicWrite(this.path("manager_summaries.json"), next);
    return record;
  }
  getProviderConnection() {
    return readJson(this.path("provider_connection.json"), null);
  }

  putProviderConnection(record) {
    const safe = {
      status: record && record.status || "not_configured",
      fingerprint: record && record.fingerprint || null,
      lastVerifiedAt: record && record.lastVerifiedAt || null,
      lastError: record && record.lastError || null,
      lastProbeAt: record && record.lastProbeAt || null,
      source: record && record.source || null,
      model: record && record.model || null,
      pid: record && record.pid || null,
      reVerificationRequired: Boolean(record && record.reVerificationRequired),
      note: "Key is not stored. Connection metadata only.",
      updatedAt: (record && record.updatedAt) || new Date().toISOString(),
    };
    atomicWrite(this.path("provider_connection.json"), safe);
    return safe;
  }

  listContributionEvents(workspaceId) {
    const all = readJson(this.path("contribution_events.json"), []);
    return workspaceId ? all.filter((e) => e.workspaceId === workspaceId) : all;
  }

  getContributionEvent(id) {
    return this.listContributionEvents().find((e) => e.id === id);
  }

  putContributionEvent(record) {
    const all = this.listContributionEvents();
    const next = all.filter((e) => e.id !== record.id);
    next.push(record);
    atomicWrite(this.path("contribution_events.json"), next);
    return record;
  }

  listUsefulnessReviews(workspaceId) {
    const all = readJson(this.path("usefulness_reviews.json"), []);
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }

  getUsefulnessReview(id) {
    return this.listUsefulnessReviews().find((r) => r.id === id);
  }

  putUsefulnessReview(record) {
    const all = this.listUsefulnessReviews();
    const next = all.filter((r) => r.id !== record.id);
    next.push(record);
    atomicWrite(this.path("usefulness_reviews.json"), next);
    return record;
  }

  listLocalSessions() {
    return readJson(this.path("local_sessions.json"), []);
  }

  getLocalSession(id) {
    return this.listLocalSessions().find((s) => s.id === id);
  }

  putLocalSession(record) {
    const all = this.listLocalSessions();
    const next = all.filter((s) => s.id !== record.id);
    next.push(record);
    atomicWrite(this.path("local_sessions.json"), next);
    return record;
  }

  _listJson(name) {
    return readJson(this.path(name), []);
  }

  _putJsonById(name, record, appendOnly) {
    const all = this._listJson(name);
    if (appendOnly && all.some((r) => r.id === record.id)) {
      throw new Error(name + " records are append-only and immutable.");
    }
    const next = all.filter((r) => r.id !== record.id);
    next.push(record);
    atomicWrite(this.path(name), next);
    return record;
  }

  listFindingDispositions() { return this._listJson("finding_dispositions.json"); }
  getFindingDisposition(id) { return this.listFindingDispositions().find((r) => r.id === id); }
  putFindingDisposition(record) { return this._putJsonById("finding_dispositions.json", record, true); }

  listVersionReviews() { return this._listJson("version_reviews.json"); }
  getVersionReview(id) { return this.listVersionReviews().find((r) => r.id === id); }
  putVersionReview(record) { return this._putJsonById("version_reviews.json", record, true); }

  listUtilityRecords(workspaceId) {
    const all = this._listJson("utility_records.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getUtilityRecord(id) { return this.listUtilityRecords().find((r) => r.id === id); }
  putUtilityRecord(record) { return this._putJsonById("utility_records.json", record, false); }

  listShadowCompiles(workspaceId) {
    const all = this._listJson("shadow_compiles.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getShadowCompile(id) { return this.listShadowCompiles().find((r) => r.id === id); }
  putShadowCompile(record) { return this._putJsonById("shadow_compiles.json", record, false); }

  listSourceSupportChecks() { return this._listJson("source_support_checks.json"); }
  putSourceSupportCheck(record) { return this._putJsonById("source_support_checks.json", record, false); }

  listFailureAttributions() { return this._listJson("failure_attributions.json"); }
  getFailureAttribution(id) { return this.listFailureAttributions().find((r) => r.id === id); }
  putFailureAttribution(record) { return this._putJsonById("failure_attributions.json", record, true); }

  listKnowledgeRemediations() { return this._listJson("knowledge_remediations.json"); }
  getKnowledgeRemediation(id) { return this.listKnowledgeRemediations().find((r) => r.id === id); }
  putKnowledgeRemediation(record) { return this._putJsonById("knowledge_remediations.json", record, true); }

  listWorkspaceExports() { return this._listJson("workspace_exports.json"); }
  putWorkspaceExport(record) { return this._putJsonById("workspace_exports.json", record, true); }

  listContributionReviews() { return this._listJson("contribution_reviews.json"); }
  putContributionReview(record) { return this._putJsonById("contribution_reviews.json", record, true); }

  listResearchBriefs() { return this._listJson("research_briefs.json"); }
  getResearchBrief(id) { return this.listResearchBriefs().find((r) => r.id === id); }
  putResearchBrief(record) { return this._putJsonById("research_briefs.json", record, false); }

  listSourceFitness() { return this._listJson("source_fitness.json"); }
  getSourceFitness(id) { return this.listSourceFitness().find((r) => r.id === id); }
  putSourceFitness(record) { return this._putJsonById("source_fitness.json", record, false); }

  listPassages() { return this._listJson("passages.json"); }
  getPassage(id) { return this.listPassages().find((r) => r.id === id); }
  putPassage(record) { return this._putJsonById("passages.json", record, false); }

  listFindingOmissions() { return this._listJson("finding_omissions.json"); }
  getFindingOmission(id) { return this.listFindingOmissions().find((r) => r.id === id); }
  putFindingOmission(record) { return this._putJsonById("finding_omissions.json", record, false); }

  listEmployeeRoles(workspaceId) {
    const all = this._listJson("employee_roles.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getEmployeeRole(id) { return this.listEmployeeRoles().find((r) => r.id === id); }
  putEmployeeRole(record) { return this._putJsonById("employee_roles.json", record, false); }

  listEmployeeRequests(workspaceId) {
    const all = this._listJson("employee_requests.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getEmployeeRequest(id) { return this.listEmployeeRequests().find((r) => r.id === id); }
  putEmployeeRequest(record) { return this._putJsonById("employee_requests.json", record, false); }

  listStageIGates() { return this._listJson("stage_i_gates.json"); }
  getStageIGate(id) { return this.listStageIGates().find((r) => r.id === id); }
  putStageIGate(record) { return this._putJsonById("stage_i_gates.json", record, false); }

  listApprovalReconciliations() { return this._listJson("approval_reconciliations.json"); }
  getApprovalReconciliation(id) { return this.listApprovalReconciliations().find((r) => r.id === id); }
  putApprovalReconciliation(record) { return this._putJsonById("approval_reconciliations.json", record, true); }

  listRoleContracts() { return this._listJson("role_contracts.json"); }
  getRoleContract(id) { return this.listRoleContracts().find((r) => r.id === id); }
  putRoleContract(record) { return this._putJsonById("role_contracts.json", record, true); }

  listEvalCaseSets() { return this._listJson("eval_case_sets.json"); }
  getEvalCaseSet(id) { return this.listEvalCaseSets().find((r) => r.id === id); }
  putEvalCaseSet(record) { return this._putJsonById("eval_case_sets.json", record, true); }

  listOfferStrategistRuns(workspaceId) {
    const all = this._listJson("offer_strategist_runs.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getOfferStrategistRun(id) { return this.listOfferStrategistRuns().find((r) => r.id === id); }
  putOfferStrategistRun(record) { return this._putJsonById("offer_strategist_runs.json", record, true); }

  listBakeoffRuns() { return this._listJson("bakeoff_runs.json"); }
  getBakeoffRun(id) { return this.listBakeoffRuns().find((r) => r.id === id); }
  putBakeoffRun(record) { return this._putJsonById("bakeoff_runs.json", record, false); }

  listEmployeeProgressions() { return this._listJson("employee_progressions.json"); }
  getEmployeeProgression(id) { return this.listEmployeeProgressions().find((r) => r.id === id); }
  putEmployeeProgression(record) { return this._putJsonById("employee_progressions.json", record, true); }

  listEvaluatorRevisions() { return this._listJson("evaluator_revisions.json"); }
  getEvaluatorRevision(id) { return this.listEvaluatorRevisions().find((r) => r.id === id); }
  putEvaluatorRevision(record) { return this._putJsonById("evaluator_revisions.json", record, true); }

  listEvaluatorCalibrations() { return this._listJson("evaluator_calibrations.json"); }
  getEvaluatorCalibration(id) { return this.listEvaluatorCalibrations().find((r) => r.id === id); }
  putEvaluatorCalibration(record) { return this._putJsonById("evaluator_calibrations.json", record, true); }

  getEvaluatorActivation() {
    const rec = this._listJson("evaluator_activation.json");
    if (Array.isArray(rec)) return rec.find((r) => r && r.id === "EVAL-ACTIVATION") || rec[0] || null;
    return rec || null;
  }
  putEvaluatorActivation(record) {
    return this._putJsonById("evaluator_activation.json", { ...record, id: record.id || "EVAL-ACTIVATION" }, false);
  }

  listSystemDevelopmentEvents() { return this._listJson("system_development_events.json"); }
  getSystemDevelopmentEvent(id) { return this.listSystemDevelopmentEvents().find((r) => r.id === id); }
  putSystemDevelopmentEvent(record) { return this._putJsonById("system_development_events.json", record, true); }

  listWatcherAuditReviews() { return this._listJson("watcher_audit_reviews.json"); }
  getWatcherAuditReview(id) { return this.listWatcherAuditReviews().find((r) => r.id === id); }
  putWatcherAuditReview(record) { return this._putJsonById("watcher_audit_reviews.json", record, true); }

  listBakeoffRescores() { return this._listJson("bakeoff_rescores.json"); }
  getBakeoffRescore(id) { return this.listBakeoffRescores().find((r) => r.id === id); }
  putBakeoffRescore(record) { return this._putJsonById("bakeoff_rescores.json", record, true); }

  listFounderOpportunityBriefs(workspaceId) {
    const all = this._listJson("founder_opportunity_briefs.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getFounderOpportunityBrief(id) { return this.listFounderOpportunityBriefs().find((r) => r.id === id); }
  putFounderOpportunityBrief(record) { return this._putJsonById("founder_opportunity_briefs.json", record, true); }

  listKnowledgeSufficiencyReviews(workspaceId) {
    const all = this._listJson("knowledge_sufficiency_reviews.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getKnowledgeSufficiencyReview(id) { return this.listKnowledgeSufficiencyReviews().find((r) => r.id === id); }
  putKnowledgeSufficiencyReview(record) { return this._putJsonById("knowledge_sufficiency_reviews.json", record, true); }

  listSourceAcquisitions(workspaceId) {
    const all = this._listJson("source_acquisitions.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getSourceAcquisition(id) { return this.listSourceAcquisitions().find((r) => r.id === id); }
  putSourceAcquisition(record) { return this._putJsonById("source_acquisitions.json", record, false); }

  listTeachingFindings(workspaceId) {
    const all = this._listJson("teaching_findings.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getTeachingFinding(id) { return this.listTeachingFindings().find((r) => r.id === id); }
  putTeachingFinding(record) { return this._putJsonById("teaching_findings.json", record, false); }

  listTeachingPackets(workspaceId) {
    const all = this._listJson("teaching_packets.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getTeachingPacket(id) { return this.listTeachingPackets().find((r) => r.id === id); }
  putTeachingPacket(record) { return this._putJsonById("teaching_packets.json", record, false); }

  listTeachingVerifications() { return this._listJson("teaching_verifications.json"); }
  getTeachingVerification(id) { return this.listTeachingVerifications().find((r) => r.id === id); }
  putTeachingVerification(record) { return this._putJsonById("teaching_verifications.json", record, true); }

  listLessonDeliveries() { return this._listJson("lesson_deliveries.json"); }
  getLessonDelivery(id) { return this.listLessonDeliveries().find((r) => r.id === id); }
  putLessonDelivery(record) { return this._putJsonById("lesson_deliveries.json", record, true); }

  listLearningEpisodes(workspaceId) {
    const all = this._listJson("learning_episodes.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getLearningEpisode(id) { return this.listLearningEpisodes().find((r) => r.id === id); }
  putLearningEpisode(record) { return this._putJsonById("learning_episodes.json", record, false); }

  listOwnerAutonomyPolicies() { return this._listJson("owner_autonomy_policies.json"); }
  getOwnerAutonomyPolicy(id) { return this.listOwnerAutonomyPolicies().find((r) => r.id === id); }
  putOwnerAutonomyPolicy(record) { return this._putJsonById("owner_autonomy_policies.json", record, false); }

  listLearningInvalidations() { return this._listJson("learning_invalidations.json"); }
  getLearningInvalidation(id) { return this.listLearningInvalidations().find((r) => r.id === id); }
  putLearningInvalidation(record) { return this._putJsonById("learning_invalidations.json", record, true); }

  listTrainingStudioRecords(workspaceId) {
    const all = this._listJson("training_studio_records.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getTrainingStudioRecord(id) { return this.listTrainingStudioRecords().find((r) => r.id === id); }
  putTrainingStudioRecord(record) { return this._putJsonById("training_studio_records.json", record, false); }

  listKnowledgeAssignments(workspaceId) {
    const all = this._listJson("knowledge_assignments.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getKnowledgeAssignment(id) { return this.listKnowledgeAssignments().find((r) => r.id === id); }
  putKnowledgeAssignment(record) { return this._putJsonById("knowledge_assignments.json", record, false); }

  listOpportunities(workspaceId) {
    const all = this._listJson("opportunities.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getOpportunity(id) { return this.listOpportunities().find((r) => r.id === id); }
  putOpportunity(record) { return this._putJsonById("opportunities.json", record, false); }

  listOpportunitySets(workspaceId) {
    const all = this._listJson("opportunity_sets.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getOpportunitySet(id) { return this.listOpportunitySets().find((r) => r.id === id); }
  putOpportunitySet(record) { return this._putJsonById("opportunity_sets.json", record, false); }

  listTeamProposals(workspaceId) {
    const all = this._listJson("team_proposals.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getTeamProposal(id) { return this.listTeamProposals().find((r) => r.id === id); }
  putTeamProposal(record) { return this._putJsonById("team_proposals.json", record, false); }

  listEmployeeTasks(workspaceId) {
    const all = this._listJson("employee_tasks.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getEmployeeTask(id) { return this.listEmployeeTasks().find((r) => r.id === id); }
  putEmployeeTask(record) { return this._putJsonById("employee_tasks.json", record, false); }

  listDeliverables(workspaceId) {
    const all = this._listJson("deliverables.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getDeliverable(id) { return this.listDeliverables().find((r) => r.id === id); }
  putDeliverable(record) { return this._putJsonById("deliverables.json", record, false); }

  listKnowledgeGaps(workspaceId) {
    const all = this._listJson("knowledge_gaps.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getKnowledgeGap(id) { return this.listKnowledgeGaps().find((r) => r.id === id); }
  putKnowledgeGap(record) { return this._putJsonById("knowledge_gaps.json", record, false); }

  listLearningChecks(workspaceId) {
    const all = this._listJson("learning_checks.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getLearningCheck(id) { return this.listLearningChecks().find((r) => r.id === id); }
  putLearningCheck(record) { return this._putJsonById("learning_checks.json", record, false); }

  listWorkflowProofs() { return this._listJson("workflow_proofs.json"); }
  getWorkflowProof(id) { return this.listWorkflowProofs().find((r) => r.id === id); }
  putWorkflowProof(record) { return this._putJsonById("workflow_proofs.json", record, false); }

  listSpecialistExecutions(workspaceId) {
    const all = this._listJson("specialist_executions.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getSpecialistExecution(id) { return this.listSpecialistExecutions().find((r) => r.id === id); }
  putSpecialistExecution(record) { return this._putJsonById("specialist_executions.json", record, true); }

  requireWorkspaceId(workspaceId) {
    const id = workspaceId == null ? "" : String(workspaceId).trim();
    if (!id) {
      const err = new Error("workspaceId is required. Isolation is structural, not an optional post-filter.");
      err.code = "WORKSPACE_REQUIRED";
      throw err;
    }
    return id;
  }

  listForWorkspace(name, workspaceId) {
    const ws = this.requireWorkspaceId(workspaceId);
    return this._listJson(name).filter((r) => r && r.workspaceId === ws);
  }

  getInWorkspace(lister, id, workspaceId) {
    const ws = this.requireWorkspaceId(workspaceId);
    const rec = lister.call(this).find((r) => r && r.id === id);
    if (!rec) return undefined;
    if (rec.workspaceId && rec.workspaceId !== ws) {
      const err = new Error("Record " + id + " is not visible in workspace " + ws + ".");
      err.code = "CROSS_WORKSPACE_DENIED";
      err.errorStatus = 404;
      throw err;
    }
    return rec;
  }

  listKnowledgeForWorkspace(workspaceId) { return this.listForWorkspace("knowledge_items.json", workspaceId); }
  listSourcesForWorkspace(workspaceId) { return this.listForWorkspace("sources.json", workspaceId); }
  listOpportunitiesForWorkspace(workspaceId) { return this.listForWorkspace("opportunities.json", workspaceId); }
  listTeachingPacketsForWorkspace(workspaceId) { return this.listForWorkspace("teaching_packets.json", workspaceId); }
  listSpendLedgerForWorkspace(workspaceId) { return this.listForWorkspace("spend_ledger.json", workspaceId); }
  listWatcherAuditsForWorkspace(workspaceId) { return this.listForWorkspace("watcher_audits.json", workspaceId); }
  listEmployeeRolesForWorkspace(workspaceId) { return this.listForWorkspace("employee_roles.json", workspaceId); }
  listPlansForWorkspace(workspaceId) { return this.listForWorkspace("workflow_plans.json", workspaceId); }
  listTasksForWorkspace(workspaceId) { return this.listForWorkspace("workflow_tasks.json", workspaceId); }
  listDeliverablesForWorkspace(workspaceId) { return this.listForWorkspace("deliverables.json", workspaceId); }
  listObjectivesForWorkspace(workspaceId) { return this.listForWorkspace("objectives.json", workspaceId); }

  listSearchRecords(workspaceId) {
    const all = this._listJson("search_records.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getSearchRecord(id) { return this.listSearchRecords().find((r) => r.id === id); }
  putSearchRecord(record) { return this._putJsonById("search_records.json", record, true); }

  listHistoricalContamination() { return this._listJson("historical_contamination.json"); }
  getHistoricalContamination(id) { return this.listHistoricalContamination().find((r) => r.id === id); }
  putHistoricalContamination(record) { return this._putJsonById("historical_contamination.json", record, false); }


  listCommandPlans(workspaceId) {
    const all = this._listJson("command_plans.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getCommandPlan(id) { return this.listCommandPlans().find((r) => r.id === id); }
  putCommandPlan(record) { return this._putJsonById("command_plans.json", record, false); }

  listScheduledJobs(workspaceId) {
    const all = this._listJson("scheduled_jobs.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getScheduledJob(id) { return this.listScheduledJobs().find((r) => r.id === id); }
  putScheduledJob(record) { return this._putJsonById("scheduled_jobs.json", record, false); }

  listExecutionActions(workspaceId) {
    const all = this._listJson("execution_actions.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getExecutionAction(id) { return this.listExecutionActions().find((r) => r.id === id); }
  putExecutionAction(record) { return this._putJsonById("execution_actions.json", record, false); }

  listAutonomyTicks(workspaceId) {
    const all = this._listJson("autonomy_ticks.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getAutonomyTick(id) { return this.listAutonomyTicks().find((r) => r.id === id); }
  putAutonomyTick(record) { return this._putJsonById("autonomy_ticks.json", record, false); }

  listActivityFeed(workspaceId) {
    const all = this._listJson("activity_feed.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getActivityFeedItem(id) { return this.listActivityFeed().find((r) => r.id === id); }
  putActivityFeedItem(record) { return this._putJsonById("activity_feed.json", record, true); }

  listWorkerHeartbeats(workspaceId) {
    const all = this._listJson("worker_heartbeats.json");
    return workspaceId ? all.filter((r) => r.workspaceId === workspaceId) : all;
  }
  getWorkerHeartbeat(id) { return this.listWorkerHeartbeats().find((r) => r.id === id); }
  putWorkerHeartbeat(record) { return this._putJsonById("worker_heartbeats.json", record, false); }

  listActionCatalog(workspaceId) {
    const all = this._listJson("action_catalog.json");
    return workspaceId ? all.filter((r) => !workspaceId || r.workspaceId == null || r.workspaceId === workspaceId) : all;
  }
  getActionCatalogEntry(id) { return this.listActionCatalog().find((r) => r.id === id); }
  putActionCatalogEntry(record) { return this._putJsonById("action_catalog.json", record, false); }
}
