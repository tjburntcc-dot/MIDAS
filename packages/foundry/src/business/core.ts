/** Provider-neutral business memory and finite planning. No network, credentials, or authority grants. */
import { StateStore } from '../state.ts';
import { assertScope, businessKey, hash, identifier, money, requireThat, safeInteger, cost } from '../contracts.ts';
import type { Scope, Principal, Money, Cost } from '../contracts.ts';
export type Claim = {
    id: string;
    kind: 'fact' | 'assumption' | 'unknown' | 'hypothesis';
    statement: string;
    source: string;
    observedAt: string;
    validUntil: string | null;
    supersedes: string[];
    dimension: string;
};
export type Task = {
    id: string;
    description: string;
    dependsOn: string[];
    competencies: string[];
    tools: string[];
    effect: string | null;
};
export type Opportunity = {
    id: string;
    diagnosis: string;
    claimIds: string[];
    requiredFacts: string[];
    benefit: Money | null;
    cost: Money | null;
    estimateBasis: 'assumption' | 'measured';
    valueBasis: string;
    tasks: Task[];
    adapter: string;
    acceptance: string[];
};
export type WorkerEvidence = {
    competency: string;
    source: string;
    population: string;
    provenance: 'fixture' | 'assisted_live' | 'independent';
    result: 'pass' | 'failure' | 'unknown';
};
export type Worker = {
    id: string;
    version: string;
    kind: 'agent' | 'human';
    procedure: string;
    stages: string[];
    tools: string[];
    effects: string[];
    competencies: string[];
    evidence: WorkerEvidence[];
    available: boolean;
    cost: Money;
    qualification: 'unknown' | 'experimental';
};
export type Brief = {
    version: string;
    goal: string;
    stage: string;
    prioritizationBasis: string;
    dimensions: string[];
    claims: Claim[];
    opportunities: Opportunity[];
    workers: Worker[];
    constraints: {
        currency: string;
        maxWorkerCost: Money;
        maxWorkers: number;
        allowedTools: string[];
        allowedEffects: string[];
        allowExperimental: boolean;
    };
    authority: string;
    rights: string;
};
export type Outcome = {
    id: string;
    planId: string;
    executionRef: string;
    provenance: 'mock' | 'live';
    operational: 'pass' | 'blocked' | 'failed' | 'unknown';
    effectCount: number;
    acquiredEvidence: {
        id: string;
        statement: string;
        source: string;
        observedAt: string;
        qualification: string;
    }[];
    obligations: Money | null;
    costs: Cost[];
    independentHumanSeconds: number | null;
    semanticAcceptance: 'unknown' | 'assisted' | 'independent';
    failures: {
        symptom: string;
        evidence: string;
        category: string;
        hypothesis: string | null;
    }[];
    digest: string;
    adapter: string;
};
const text = (v: unknown) => requireThat(typeof v === 'string' && v.trim().length > 0, 'TEXT_REQUIRED');
const unique = (xs: string[]) => requireThat(new Set(xs).size === xs.length, 'DUPLICATE_ID');
const instant = (s: string) => requireThat(typeof s === 'string' && Number.isFinite(Date.parse(s)), 'INVALID_TIME');
export function validateBrief(b: Brief) {
    requireThat(b && typeof b === 'object', 'INVALID_BRIEF');
    identifier(b.version);
    text(b.goal);
    text(b.stage);
    text(b.prioritizationBasis);
    text(b.authority);
    text(b.rights);
    unique(b.dimensions);
    b.dimensions.forEach(text);
    unique(b.claims.map(c => c.id));
    unique(b.opportunities.map(o => o.id));
    unique(b.workers.map(w => w.id));
    const ids = new Set(b.claims.map(c => c.id));
    for (const c of b.claims) {
        identifier(c.id);
        requireThat(['fact', 'assumption', 'unknown', 'hypothesis'].includes(c.kind), 'CLAIM_KIND');
        text(c.statement);
        text(c.source);
        instant(c.observedAt);
        if (c.validUntil)
            instant(c.validUntil);
        requireThat(b.dimensions.includes(c.dimension), 'DIMENSION_UNKNOWN');
        requireThat(c.supersedes.every(id => ids.has(id) && id !== c.id), 'INVALID_SUPERSESSION');
    }
    const visit = (id: string, path: string[]) => { requireThat(!path.includes(id), 'SUPERSESSION_CYCLE'); b.claims.find(c => c.id === id)!.supersedes.forEach(p => visit(p, [...path, id])); };
    ids.forEach(id => visit(id, []));
    const cur = b.constraints.currency;
    money(b.constraints.maxWorkerCost);
    requireThat(b.constraints.maxWorkerCost.currency === cur, 'CURRENCY_MISMATCH');
    safeInteger(b.constraints.maxWorkers, 1);
    requireThat(b.constraints.maxWorkers <= 8, 'BOUNDED_TEAM_REQUIRED');
    for (const o of b.opportunities) {
        identifier(o.id);
        text(o.diagnosis);
        text(o.adapter);
        requireThat(['assumption', 'measured'].includes(o.estimateBasis), 'ESTIMATE_BASIS');
        requireThat(o.valueBasis === b.prioritizationBasis, 'INCOMPARABLE_VALUE_BASIS');
        if (o.estimateBasis === 'measured') requireThat(o.requiredFacts.length > 0 && o.requiredFacts.every(id => b.claims.some(c => c.id === id && c.kind === 'fact')), 'MEASURED_ESTIMATE_REQUIRES_FACT_REFERENCES');
        requireThat(o.claimIds.length > 0 && [...o.claimIds, ...o.requiredFacts].every(id => ids.has(id)), 'MISSING_DIAGNOSIS_EVIDENCE');
        o.acceptance.forEach(text);
        requireThat(o.acceptance.length > 0, 'ACCEPTANCE_REQUIRED');
        for (const m of [o.benefit, o.cost])
            if (m) {
                money(m);
                requireThat(m.currency === cur, 'CURRENCY_MISMATCH');
            }
        unique(o.tasks.map(t => t.id));
        requireThat(o.tasks.length > 0, 'TASKS_REQUIRED');
        const seen = new Set<string>();
        for (const t of o.tasks) {
            identifier(t.id);
            text(t.description);
            requireThat(t.dependsOn.every(id => seen.has(id)), 'TASK_DEPENDENCY_ORDER');
            requireThat(t.competencies.length > 0, 'COMPETENCIES_REQUIRED');
            t.competencies.forEach(text);
            seen.add(t.id);
        }
    }
    for (const w of b.workers) {
        identifier(w.id);
        identifier(w.version);
        text(w.procedure);
        requireThat(['agent', 'human'].includes(w.kind) && ['unknown', 'experimental'].includes(w.qualification), 'WORKER_KIND');
        money(w.cost);
        requireThat(w.cost.currency === cur, 'CURRENCY_MISMATCH');
        for (const e of w.evidence) {
            text(e.competency);
            text(e.source);
            text(e.population);
            requireThat(['fixture', 'assisted_live', 'independent'].includes(e.provenance) && ['pass', 'failure', 'unknown'].includes(e.result), 'EVIDENCE_PROVENANCE');
        }
    }
}
/** Bounded exhaustive coverage of supplied workers, not discovery or learned optimality. */
export function assign(b: Brief, o: Opportunity) {
    requireThat(b.workers.length <= 12, 'CANDIDATE_LIMIT');
    const eligible = b.workers.filter(w => w.available && w.stages.includes(b.stage) && w.cost.minorUnits <= b.constraints.maxWorkerCost.minorUnits);
    const coverage = (w: Worker, t: Task) => t.competencies.every(c => w.competencies.includes(c) && !w.evidence.some(e => e.competency === c && e.result === 'failure') && (b.constraints.allowExperimental || w.evidence.some(e => e.competency === c && e.provenance === 'independent' && e.result === 'pass'))) && t.tools.every(x => w.tools.includes(x) && b.constraints.allowedTools.includes(x)) && (!t.effect || (w.effects.includes(t.effect) && b.constraints.allowedEffects.includes(t.effect)));
    const feasible: {
        workers: Worker[];
        cost: number;
        uncertain: number;
    }[] = [];
    for (let mask = 1; mask < 2 ** eligible.length; mask++) {
        const workers = eligible.filter((_, i) => mask & (1 << i));
        if (workers.length > b.constraints.maxWorkers)
            continue;
        const cost = workers.reduce((n, w) => n + w.cost.minorUnits, 0);
        if (!Number.isSafeInteger(cost) || cost > b.constraints.maxWorkerCost.minorUnits)
            continue;
        if (o.tasks.every(t => workers.some(w => coverage(w, t))))
            feasible.push({ workers, cost, uncertain: workers.reduce((n, w) => n + o.tasks.filter(t => coverage(w, t)).reduce((m, t) => m + t.competencies.reduce((score, c) => score + (w.evidence.some(e => e.competency === c && e.provenance === 'independent' && e.result === 'pass') ? 0 : w.evidence.some(e => e.competency === c && e.provenance === 'assisted_live' && e.result === 'pass') ? 1 : 2), 0), 0), 0) });
    }
    feasible.sort((a, z) => a.workers.length - z.workers.length || a.uncertain - z.uncertain || a.cost - z.cost || a.workers.map(w => w.id).join().localeCompare(z.workers.map(w => w.id).join()));
    const best = feasible[0];
    return { method: 'rule-based bounded coverage; smallest feasible set among supplied candidates, not optimal business team', status: best ? 'proposed' : 'blocked', workers: best?.workers ?? [], assignments: best ? o.tasks.map(t => ({ taskId: t.id, workerId: best.workers.find(w => coverage(w, t))!.id })) : [], missingTasks: o.tasks.filter(t => !eligible.some(w => coverage(w, t))).map(t => t.id), estimatedWorkerCost: { currency: b.constraints.currency, minorUnits: best?.cost ?? 0 }, qualification: 'experimental; role titles and declared competencies do not prove ability', rationale: best?.workers.map(w => ({ worker: w.id, necessaryFor: o.tasks.filter(t => coverage(w, t) && !best.workers.some(other => other.id !== w.id && coverage(other, t))).map(t => t.id), evidence: w.evidence })) ?? [], simplerSufficesWhen: 'A smaller available set covers the same competencies, tools, authority and quality requirements within constraints.' };
}
export class BusinessLoop {
    readonly store: StateStore;
    readonly scope: Scope;
    readonly principal: Principal;
    constructor(store: StateStore, scope: Scope, principal: Principal) { assertScope(principal, scope); this.store = store; this.scope = structuredClone(scope); this.principal = structuredClone(principal); }
    private key() { return businessKey(this.scope); }
    private access(write = false) { assertScope(this.principal, this.scope, write ? 'operate' : 'read'); }
    current() { this.access(); return this.store.get('business-understanding', this.key()); }
    revise(brief: Brief, expected: number | null, reason: string) { this.access(true); validateBrief(brief); text(reason); return this.store.transaction(() => { const prior = this.current(); requireThat((prior?._version ?? null) === expected, 'STALE_BUSINESS_REVISION'); const revision = (prior?._version ?? 0) + 1; const record = this.store.record(this.scope, 'business-revision-' + revision, 'BusinessUnderstanding', { brief, reason, revision, predecessor: prior?.ref ?? null, completeness: 'partial; declared dimensions are not a complete business ontology' }); const next = this.store.put('business-understanding', this.key(), { brief, ref: record, reason }, expected); this.store.event(this.scope, 'business.revised', { revision, reason, ref: record }); return next; }); }
    assess(now = new Date().toISOString()) {
        this.access();
        instant(now);
        const current = this.current();
        requireThat(current, 'BUSINESS_NOT_INITIALIZED');
        const b = current.brief as Brief;
        const superseded = new Set(b.claims.flatMap(c => c.supersedes));
        const active = b.claims.filter(c => !superseded.has(c.id) && (!c.validUntil || Date.parse(c.validUntil) > Date.parse(now)) && Date.parse(c.observedAt) <= Date.parse(now));
        const supported = new Set(active.filter(c => c.kind === 'fact').map(c => c.id));
        const closed = this.store.get('business-feedback', this.key())?.completedOpportunityHashes ?? [];
        const candidates = b.opportunities.map(o => { const missing = o.requiredFacts.filter(id => !supported.has(id)); const team = assign(b, o); const net = o.benefit && o.cost ? o.benefit.minorUnits - o.cost.minorUnits : null; const state = closed.includes(hash(o)) ? 'operationally_completed' : missing.length || net === null ? 'needs_evidence' : net <= 0 ? 'no_action' : team.status === 'blocked' ? 'needs_competency' : 'actionable'; return { id: o.id, diagnosis: o.diagnosis, claimIds: o.claimIds, missing, net, estimateBasis: o.estimateBasis, state, team }; });
        // Evidence blockers remain visible; unknown value is never fabricated as zero.
        const ranked = candidates.filter(c => c.state === 'actionable').sort((a, z) => z.net! - a.net! || a.id.localeCompare(z.id));
        return { acquiredEvidence: this.store.get('business-feedback', this.key())?.acquiredEvidence ?? [], businessRevision: current._version, briefRef: current.ref, at: now, understanding: 'partial', uncoveredDimensions: b.dimensions.filter(d => !active.some(c => c.dimension === d && c.kind === 'fact')), claims: b.claims.map(c => ({ ...c, current: active.some(a => a.id === c.id) })), candidates, selected: ranked[0]?.id ?? null, decision: ranked.length ? 'plan' : candidates.some(c => ['needs_evidence', 'needs_competency'].includes(c.state)) ? 'blocked' : 'no_action', method: 'Rank supplied actionable bottleneck hypotheses by estimated net benefit; no claim of causal diagnosis or global highest value.' };
    }
    plan(id: string, now = new Date().toISOString()) { this.access(true); identifier(id); return this.store.transaction(() => { requireThat(!this.store.get('business-plan', this.key() + '/' + id), 'PLAN_EXISTS'); const assessment = this.assess(now); const b = this.current().brief as Brief; const o = b.opportunities.find(o => o.id === assessment.selected); const selected = assessment.candidates.find(c => c.id === assessment.selected); const plan = { id, scope: this.scope, assessment, brief: b, opportunity: o ?? null, team: selected?.team ?? null, status: o ? 'planned' : assessment.decision, execution: null, outcome: null, roleVersions: selected?.team.workers.map(w => ({ id: w.id, version: w.version, procedureHash: hash(w.procedure) })) ?? [], authority: 'Proposal only; existing exact action grants and separate model admission remain required.' }; const ref = this.store.record(this.scope, 'plan-' + id, 'BusinessWorkPlan', plan, [assessment.briefRef]); const result = this.store.put('business-plan', this.key() + '/' + id, { ...plan, ref }, null); this.store.event(this.scope, 'business.planned', { id, ref, selected: assessment.selected }); return result; }); }
    getPlan(id: string) { this.access(); identifier(id); return this.store.get('business-plan', this.key() + '/' + id); }
    progress(id: string, status: any) { this.access(true); return this.store.transaction(() => { const p = this.getPlan(id); requireThat(p?.execution, 'EXECUTION_REQUIRED'); const checkpoint = { state: status.state, checkpoint: status.checkpoint, reason: status.reason ?? null, nextAction: status.nextAction, callsUsed: status.callsUsed, callsRemaining: status.callsRemaining, pendingEffect: status.pendingEffect, pendingModelAttempts: status.pendingModelAttempts }; if (p.executionStatus && hash(p.executionStatus) === hash(checkpoint))
        return p; return this.store.put('business-plan', this.key() + '/' + id, { ...p, executionStatus: checkpoint }, p._version); }); }
    proposeProcedure(id: string, planId: string, workerId: string, failureIndex: number, procedure: string, hypothesis: string, regressionRisk: string) {
        this.access(true);
        identifier(id);
        safeInteger(failureIndex);
        text(procedure);
        text(hypothesis);
        text(regressionRisk);
        return this.store.transaction(() => {
            const p = this.getPlan(planId), failure = p?.outcome?.failures[failureIndex];
            requireThat(failure, 'OBSERVED_FAILURE_REQUIRED');
            const worker = p.team.workers.find((w: Worker) => w.id === workerId);
            requireThat(worker?.kind === 'agent', 'ASSIGNED_AGENT_REQUIRED');
            requireThat(procedure !== worker.procedure, 'PROCEDURE_CHANGE_REQUIRED');
            const candidate = { id, planId, workerId, baseline: worker, procedure, hypothesis, regressionRisk, failure, outcomeRef: p.outcomeRef, provenance: p.outcome.provenance, status: 'proposed_only', qualification: 'unqualified', constraints: 'Procedure-only candidate. Exclude shared setup defects, retain excellent baseline instructions, equal model/settings/context/tools/authority/resources, protect final cases. No execution or promotion authorized.' };
            const ref = this.store.record(this.scope, 'procedure-' + id, 'ProcedureCandidate', candidate, [p.outcomeRef]);
            const prior = this.store.get('business-candidate', this.key() + '/' + id);
            if (prior) {
                requireThat(hash(prior.ref) === hash(ref), 'CANDIDATE_IMMUTABLE');
                return prior;
            }
            return this.store.put('business-candidate', this.key() + '/' + id, { ...candidate, ref }, null);
        });
    }
    freezeComparison(id: string, spec: {
        model: string;
        settings: Record<string, unknown>;
        tools: string[];
        contextVersion: string;
        authorityVersion: string;
        maxCalls: number;
        maxExposure: Money;
        developmentIds: string[];
        validationIds: string[];
        rubricVersion: string;
        successRule: string;
    }) {
        this.access(true);
        identifier(id);
        text(spec.model);
        text(spec.contextVersion);
        text(spec.authorityVersion);
        text(spec.rubricVersion);
        text(spec.successRule);
        safeInteger(spec.maxCalls, 1);
        money(spec.maxExposure);
        unique([...spec.developmentIds, ...spec.validationIds]);
        requireThat(spec.developmentIds.length > 0 && spec.validationIds.length > 0, 'SPLIT_REQUIRED');
        return this.store.transaction(() => { const c = this.store.get('business-candidate', this.key() + '/' + id); requireThat(c, 'CANDIDATE_REQUIRED'); const conditions = { baselineProcedure: c.baseline.procedure, challengerProcedure: c.procedure, shared: spec, treatment: 'operator procedure only', population: 'developer-visible exploratory material; no protected holdout claim', spendingAuthorized: false, promotionAuthorized: false }; const ref = this.store.record(this.scope, 'comparison-' + id, 'FrozenComparisonPreparation', conditions, [c.ref]); return { ref, conditions, status: 'prepared_not_executed' }; });
    }
    bind(id: string, execution: {
        root: string;
        runId: string;
        adapter: string;
    }) { this.access(true); return this.store.transaction(() => { const p = this.getPlan(id); requireThat(p, 'PLAN_NOT_FOUND'); if (p.execution) {
        requireThat(hash(p.execution) === hash(execution), 'EXECUTION_ALREADY_BOUND');
        return p;
    } requireThat(p.status === 'planned' && p.assessment.businessRevision === this.current()._version, 'PLAN_STALE_OR_NOT_EXECUTABLE'); requireThat(execution.adapter === p.opportunity.adapter, 'ADAPTER_MISMATCH'); const result = this.store.put('business-plan', this.key() + '/' + id, { ...p, status: 'executing', execution }, p._version); this.store.event(this.scope, 'business.execution_bound', { id, execution }); return result; }); }
    /** Trusted adapter writes observations, never worker instructions. Does not alter historical claims or qualification. */
    observe(outcome: Outcome) { this.access(true); identifier(outcome.id); safeInteger(outcome.effectCount); outcome.costs.forEach(cost); outcome.acquiredEvidence.forEach(e => { identifier(e.id); text(e.statement); text(e.source); instant(e.observedAt); text(e.qualification); }); requireThat(['mock', 'live'].includes(outcome.provenance), 'OUTCOME_PROVENANCE'); return this.store.transaction(() => { const p = this.getPlan(outcome.planId); requireThat(p?.execution && p.execution.adapter === outcome.adapter && outcome.executionRef === hash(p.execution), 'OUTCOME_BINDING'); if (p.outcome) {
        requireThat(hash(p.outcome) === hash(outcome), 'OUTCOME_CONFLICT');
        return p;
    } requireThat(['pass', 'blocked', 'failed', 'unknown'].includes(outcome.operational), 'OUTCOME_STATUS'); if (outcome.obligations)
        money(outcome.obligations); requireThat(outcome.operational !== 'pass' || outcome.obligations?.minorUnits === 0, 'UNRESOLVED_OUTCOME'); const ref = this.store.record(this.scope, 'outcome-' + outcome.id, 'BusinessOutcome', outcome, [p.ref]); const feedback = this.store.get('business-feedback', this.key()); const completed = new Set<string>(feedback?.completedOpportunityHashes ?? []); if (outcome.operational === 'pass')
        completed.add(hash(p.opportunity)); const next = { acquiredEvidence: [...(feedback?.acquiredEvidence ?? []), ...outcome.acquiredEvidence.map(e => ({ ...e, planId: p.id, provenance: outcome.provenance, outcomeRef: ref }))], completedOpportunityHashes: [...completed], observations: [...(feedback?.observations ?? []), { ref, planId: p.id, provenance: outcome.provenance, operational: outcome.operational }], currentOperationalFacts: [...(feedback?.currentOperationalFacts ?? []), { kind: 'fact', statement: 'Adapter observed ' + outcome.operational + ' for plan ' + p.id, source: ref, provenance: outcome.provenance, commercialImpact: 'unknown' }], nextInformationNeeded: 'Measure the intended economic outcome through a separately authorized observation; delivery is not realized benefit.', economicImpact: 'unknown; delivery does not establish realized benefit', improvementCandidates: [...(feedback?.improvementCandidates ?? []), ...outcome.failures.map((f, i) => ({ id: outcome.id + '-' + i, status: 'diagnosis_only', failure: f, outcomeRef: ref, affectedCompetencies: p.opportunity.tasks.flatMap((t: Task) => t.competencies), candidateIntervention: null, alternativeExplanation: 'Shared specification, evidence, tool or coordination defect must be excluded.', nextTest: 'Classify preserved evidence before proposing a procedure-only intervention; freeze a strong baseline and equal resources before comparison.', promotionAllowed: false }))] }; this.store.put('business-feedback', this.key(), next, feedback?._version ?? null); const result = this.store.put('business-plan', this.key() + '/' + p.id, { ...p, status: outcome.operational === 'pass' ? 'completed' : outcome.operational, outcome, outcomeRef: ref }, p._version); this.store.event(this.scope, 'business.adaptation_requested', { planId: p.id, outcomeRef: ref, policy: 'Reassess before new work; no automatic calls, worker changes, authority expansion or promotion.' }); return result; }); }
    report() { this.access(); return { objective: 'Evidence-backed business understanding → prioritization → smallest supported team → controlled specialist development → authorized execution → verified outcomes → adaptation', current: this.current(), assessment: this.assess(), feedback: this.store.get('business-feedback', this.key()), plans: this.store.db.prepare("SELECT body FROM entities WHERE kind='business-plan' AND substr(key,1,?)=?").all((this.key() + '/').length, this.key() + '/').map(r => JSON.parse(String(r.body))), procedureCandidates: this.store.db.prepare("SELECT body FROM entities WHERE kind='business-candidate' AND substr(key,1,?)=?").all((this.key() + '/').length, this.key() + '/').map(r => JSON.parse(String(r.body))), events: this.store.events(this.principal, this.scope), decisionOwners: { understanding: 'Human-owned versioned brief; explicit facts/assumptions/unknowns/hypotheses; source truth not automatically certified', prioritization: 'Rules over supplied candidates and estimates', assignment: 'Rules for bounded competency coverage, stage, resources and authority', workflow: 'Existing ModelPort-controlled stages; new demonstration uses unmistakable mocks', approval: 'Human-owned exact effect approval; separate fixture-demo principals only in explicit offline demo', verification: 'Authenticated fixture and deterministic checks; semantic review retains actual provenance', specialization: 'Failure-linked diagnosis and fair-comparison requirements; no automatic candidate generation or qualification', adaptation: 'Rule-based reassessment; new brief revisions human-owned; no autonomous business discovery or learned team optimization' } }; }
}
