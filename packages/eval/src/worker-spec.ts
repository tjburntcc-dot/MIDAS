/**
 * Profession-neutral worker spine.
 *
 * Atlas's evaluator hardcodes six dimensions -- qualification, ranking, evidence,
 * uncertainty, next_action, compliance -- which are not a general scoring model
 * but Atlas's job description written into `score.ts`. The Offer Strategist was
 * built as a parallel bespoke stack rather than through the foundry, and stops at
 * `development_verified` without a sealed evaluation or a promotion decision.
 *
 * This module is the smallest thing that lets a second profession run through the
 * existing machinery instead of beside it. A worker declares its own dimensions,
 * weights and critical failures; the runner writes the same eval_run and
 * case_result records Atlas writes, so `compareEvalRuns` and the attribution
 * taxonomy work on the second worker with no changes at all.
 *
 * Deliberately not built here: a plugin registry, a UI, an abstract capability
 * model, or a generalized retrieval policy. Those are generalized when a worker
 * proves they must be, not before.
 */
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

/** A dimension the worker is scored on. `advisory` dimensions are excluded from the weighted total. */
export interface WorkerDimension {
  id: string;
  title: string;
  weight: number;
  advisory?: boolean;
  /** Return null when the dimension does not apply to this case. */
  score: (ctx: WorkerScoreContext) => number | { value: number; detail?: unknown } | null;
}

export interface WorkerCriticalFailure {
  code: string;
  title: string;
  detect: (ctx: WorkerScoreContext) => boolean;
}

export interface WorkerScoreContext {
  record: any;
  output: any;
  schemaOk: boolean;
  spec: WorkerSpec;
}

export interface WorkerSpec {
  roleId: string;
  name: string;
  objective: string;
  outputSchema: any;
  dimensions: WorkerDimension[];
  criticalFailures: WorkerCriticalFailure[];
  prohibitions: string[];
  budgets: { usdPerCase: number; latencyMs: number };
  authorityBoundary: string;
}

/** Weights of counted dimensions must total 100. Advisory dimensions carry no weight. */
export function validateWorkerSpec(spec: WorkerSpec): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const counted = spec.dimensions.filter((d) => !d.advisory);
  const total = counted.reduce((a, d) => a + d.weight, 0);
  if (total !== 100) problems.push("counted dimension weights total " + total + ", expected 100");
  for (const d of spec.dimensions) {
    if (d.advisory && d.weight !== 0) problems.push(d.id + " is advisory and must carry weight 0");
    if (!d.advisory && d.weight <= 0) problems.push(d.id + " must carry a positive weight");
  }
  const ids = spec.dimensions.map((d) => d.id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate dimension id");
  const codes = spec.criticalFailures.map((c) => c.code);
  if (new Set(codes).size !== codes.length) problems.push("duplicate critical failure code");
  if (!spec.roleId || !spec.name || !spec.objective) problems.push("roleId, name and objective are required");
  return { ok: problems.length === 0, problems };
}

export function workerSpecHash(spec: WorkerSpec): string {
  const stable = {
    roleId: spec.roleId,
    name: spec.name,
    objective: spec.objective,
    outputSchema: spec.outputSchema,
    dimensions: spec.dimensions.map((d) => ({ id: d.id, weight: d.weight, advisory: Boolean(d.advisory) })),
    criticalFailures: spec.criticalFailures.map((c) => c.code),
    prohibitions: spec.prohibitions.slice().sort(),
    budgets: spec.budgets,
    authorityBoundary: spec.authorityBoundary,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/**
 * Score one case against a worker spec.
 *
 * Advisory dimensions are computed and reported but never enter weighted_total.
 * That is how an unqualified semantic evidence judge is allowed to inform a human
 * without silently inflating a promotion decision.
 */
export function scoreWorkerCase(spec: WorkerSpec, args: { record: any; output: any; schemaOk: boolean }) {
  const ctx: WorkerScoreContext = { record: args.record, output: args.output, schemaOk: args.schemaOk, spec };
  const dimensions: Record<string, number> = {};
  const advisory: Record<string, number> = {};
  const details: Record<string, unknown> = {};
  // A scorer returning null means the dimension does not apply to this case --
  // a case exercising no stated-value field cannot demonstrate stated-value
  // extraction. Scoring that as zero would punish the worker for a property of
  // the case, so the dimension is dropped and the remaining weights renormalise.
  const notApplicable: string[] = [];
  for (const d of spec.dimensions) {
    const raw = d.score(ctx);
    if (raw == null) {
      notApplicable.push(d.id);
      continue;
    }
    const value = typeof raw === "number" ? raw : raw.value;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    if (typeof raw !== "number" && (raw as any).detail !== undefined) details[d.id] = { value: clamped, detail: (raw as any).detail };
    if (d.advisory) advisory[d.id] = clamped;
    else dimensions[d.id] = clamped;
  }
  const weights: Record<string, number> = {};
  let weightSum = 0;
  for (const d of spec.dimensions) {
    if (d.advisory || notApplicable.includes(d.id)) continue;
    weights[d.id] = d.weight;
    weightSum += d.weight;
  }
  let weighted = 0;
  for (const [id, w] of Object.entries(weights)) weighted += w * dimensions[id];
  // Renormalise so a case with fewer applicable dimensions is still out of 100
  // and remains comparable with a case that exercises all of them.
  if (weightSum > 0 && weightSum !== 100) weighted = (weighted * 100) / weightSum;
  const criticalFailures = spec.criticalFailures
    .filter((c) => {
      try { return c.detect(ctx); } catch { return false; }
    })
    .map((c) => ({ code: c.code, title: c.title }));

  return {
    dimensions,
    advisoryDimensions: advisory,
    weights,
    notApplicableDimensions: notApplicable,
    weightedTotal: weighted / 100,
    criticalFailures,
    details,
  };
}

/**
 * Run a worker version over a case set and persist results in the shape the
 * existing comparison and attribution tooling already reads.
 *
 * `respond` is supplied by the caller so this module never decides how a worker
 * is executed -- fixture, live, or replayed.
 */
export async function runWorkerEval(args: {
  store: any;
  spec: WorkerSpec;
  versionId: string;
  suiteId: string;
  suiteVersion: string;
  cases: any[];
  respond: (record: any) => Promise<{ output: any; schemaOk: boolean; cost?: any; raw?: any; error?: string | null }>;
  arm?: string;
  trialIndex?: number;
  responderKind?: string;
  sealed?: boolean;
  note?: string;
}) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const cost = { inputTokens: 0, outputTokens: 0, totalTokens: 0, usdEstimate: 0, aborted: false, abortReason: null };
  const results: any[] = [];
  let nInvalid = 0;

  args.store.putEvalRun({
    id: runId,
    agentVersionId: args.versionId,
    versionId: args.versionId,
    roleId: args.spec.roleId,
    workerSpecHash: workerSpecHash(args.spec),
    suiteId: args.suiteId,
    suiteVersion: args.suiteVersion,
    arm: args.arm || "relevant",
    trialIndex: args.trialIndex || 0,
    responderKind: args.responderKind || "live",
    persistence: "FILE_STORE",
    semanticJudge: "not_implemented_advisory_only",
    attainableMax: 100,
    sealed: Boolean(args.sealed),
    retrievedItemIds: [],
    curriculumSnapshotId: null,
    cost: { ...cost },
    nAttempted: 0,
    nCompleted: 0,
    nInvalid: 0,
    nRetries: 0,
    nScored: 0,
    completionRate: 0,
    status: "running",
    createdAt: startedAt,
    completedAt: null,
    error: null,
    inconclusive: false,
    eligibleForPromotion: false,
    eligibleForInterpretation: false,
    note: args.note || null,
  });

  for (const record of args.cases) {
    let responded;
    try {
      responded = await args.respond(record);
    } catch (err) {
      responded = { output: null, schemaOk: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (responded.cost) {
      cost.inputTokens += Number(responded.cost.inputTokens || 0);
      cost.outputTokens += Number(responded.cost.outputTokens || 0);
      cost.totalTokens += Number(responded.cost.totalTokens || 0);
      cost.usdEstimate += Number(responded.cost.usdEstimate || 0);
    }
    const usable = responded.output != null && responded.schemaOk;
    if (!usable) nInvalid += 1;
    const scored = usable
      ? scoreWorkerCase(args.spec, { record, output: responded.output, schemaOk: true })
      : null;

    results.push({
      id: runId + ":" + record.case_id,
      evalRunId: runId,
      caseId: record.case_id,
      title: record.title || "",
      agentVersionId: args.versionId,
      roleId: args.spec.roleId,
      // An unusable response is recorded as inconclusive rather than zero. A zero
      // would read as "the worker answered badly" when it did not answer at all,
      // and would quietly drag a version average down or up.
      scoreStatus: usable ? "scored" : "inconclusive",
      blocked: !usable,
      weightedTotal: scored ? scored.weightedTotal : null,
      dimensions: scored ? scored.dimensions : null,
      advisoryDimensions: scored ? scored.advisoryDimensions : null,
      weights: scored ? scored.weights : null,
      criticalFailures: scored ? scored.criticalFailures : [],
      scoreDetails: scored ? scored.details : null,
      citations: usable ? (responded.output.cited_evidence_ids || []) : [],
      missingInformation: usable ? (responded.output.missing_information || []) : [],
      assessments: [],
      output: usable ? responded.output : null,
      error: responded.error || null,
      createdAt: new Date().toISOString(),
    });
  }

  for (const r of results) args.store.putCaseResult(r);

  const scoredResults = results.filter((r) => r.scoreStatus === "scored");
  const completed = scoredResults.length;
  const finished = {
    nAttempted: args.cases.length,
    nCompleted: completed,
    nInvalid: nInvalid,
    nScored: completed,
    completionRate: args.cases.length ? completed / args.cases.length : 0,
    cost: { ...cost },
    status: "completed",
    completedAt: new Date().toISOString(),
    // A run that could not score most of its cases is not evidence about the
    // worker, so it must not be read as a result.
    inconclusive: completed < Math.ceil(args.cases.length * 0.8),
  };
  const existing = args.store.getEvalRun(runId);
  args.store.putEvalRun({
    ...existing,
    ...finished,
    eligibleForInterpretation: !finished.inconclusive,
    eligibleForPromotion: !finished.inconclusive && Boolean(args.sealed),
  });

  return {
    runId,
    roleId: args.spec.roleId,
    versionId: args.versionId,
    sealed: Boolean(args.sealed),
    n: args.cases.length,
    scored: completed,
    inconclusive: finished.inconclusive,
    meanWeightedTotal: completed ? scoredResults.reduce((a, r) => a + r.weightedTotal, 0) / completed : null,
    criticalFailures: results.flatMap((r) => (r.criticalFailures || []).map((f) => ({ caseId: r.caseId, ...f }))),
    cost: { ...cost },
    results,
  };
}

/**
 * Per-dimension means for one run.
 *
 * Each dimension is averaged over the cases that actually exercise it, not over
 * every scored case. Dividing by the whole run deflates any dimension that is
 * often not applicable -- a subskill present in one case out of forty would
 * report near zero however well the worker performed on it, which reads as a
 * competence failure and is really an arithmetic one.
 */
export function dimensionMeans(results: any[]): Record<string, number> {
  const scored = results.filter((r) => r.scoreStatus === "scored" && r.dimensions);
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const r of scored) {
    for (const [k, v] of Object.entries(r.dimensions)) {
      sums[k] = (sums[k] || 0) + Number(v);
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sums)) out[k] = v / counts[k];
  return out;
}

/** How many cases exercised each dimension, so a mean can be read with its n. */
export function dimensionCounts(results: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    if (r.scoreStatus !== "scored" || !r.dimensions) continue;
    for (const k of Object.keys(r.dimensions)) counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
