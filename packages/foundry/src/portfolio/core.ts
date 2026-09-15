import { randomUUID } from 'node:crypto';
import { StateStore } from '../state.ts';
import { hash, identifier, requireThat } from '../contracts.ts';
import { portfolioScope, taskKey, text, integer, unique, validateTask } from './contracts.ts';
import type { ArtifactInput, Completion, Lease, ObservationInput, PlanInput, ResourceLimits, ResourceUsage, Task, TaskLease, VentureInput, WorkerInput } from './contracts.ts';

const kinds = { config: 'portfolio-config', venture: 'portfolio-venture', task: 'portfolio-task', worker: 'portfolio-worker', plan: 'portfolio-plan', artifact: 'portfolio-artifact', observation: 'portfolio-observation', decision: 'portfolio-decision', step: 'portfolio-step' };
const zero = () => ({ modelCalls: 0, localToolRuns: 0, workerMs: 0 });
const terminal = new Set(['completed', 'cancelled', 'stale']);
/** Single-host durable scheduling. Model/effect authority remains with the executing adapter. */
export class Portfolio {
    readonly store: StateStore; readonly now: () => number; readonly leaseMs: number; readonly stallMs: number;
    constructor(store: StateStore, options: { now?: () => number; leaseMs?: number; stallMs?: number } = {}) {
        this.store = store; this.now = options.now ?? Date.now; this.leaseMs = options.leaseMs ?? 60000; this.stallMs = options.stallMs ?? 300000; integer(this.leaseMs, 1, 86_400_000); integer(this.stallMs, 1, 86_400_000);
        if (!store.get(kinds.config, 'default')) this.configure({ maxConcurrency: 4, resources: { workerSlots: 4, modelCalls: 100, localToolRuns: 1000 } });
    }
    private at() { return new Date(this.now()).toISOString(); }
    private rows(kind: string): any[] { return this.store.db.prepare('SELECT body,version FROM entities WHERE kind=? ORDER BY key').all(kind).map(r => ({ ...JSON.parse(String(r.body)), _version: Number(r.version) })); }
    private put(kind: string, value: any) { return this.store.put(kind, value.id, value, value._version ?? null); }
    private event(ventureId: string, kind: string, body: any) { this.store.event(portfolioScope(ventureId), 'portfolio.' + kind, body); }
    private task(id: string): Task { const task = this.store.get(kinds.task, id); requireThat(task, 'TASK_NOT_FOUND'); return task; }
    getTask(id: string): Task { return this.task(id); }
    invalidateTask(taskId: string, reason: string) { text(reason); return this.store.transaction(() => { const first = this.task(taskId), tasks = this.rows(kinds.task).filter(t => t.ventureId === first.ventureId), ids = new Set([taskId]); let changed = true; while (changed) { changed = false; for (const t of tasks) if (!ids.has(t.id) && t.dependsOn.some((id: string) => ids.has(id))) { ids.add(t.id); changed = true; } } for (const t of tasks.filter(t => ids.has(t.id) && t.status !== 'cancelled')) this.put(kinds.task, { ...t, outputCurrent: false, invalidatedAt: this.at(), invalidationReason: reason, status: t.lease || t.status === 'completed' || t.status === 'needs_reconciliation' ? t.status : 'stale', reason, nextAction: 'Reassess changed inputs before any new action', updatedAt: this.at() }); this.event(first.ventureId, 'task_inputs_invalidated', { taskId, affectedTaskIds: [...ids], reason }); return this.task(taskId); }); }
    getVenture(id: string) { const v = this.store.get(kinds.venture, id); requireThat(v, 'VENTURE_NOT_FOUND'); return v; }
    configure(input: { id?: string; name?: string; maxConcurrency: number; resources?: Partial<ResourceLimits> }, expectedRevision?: number) {
        integer(input.maxConcurrency, 1, 1000);
        return this.store.transaction(() => {
            const old = this.store.get(kinds.config, 'default'); if (expectedRevision !== undefined) requireThat(old?.revision === expectedRevision, 'PORTFOLIO_REVISION_CHANGED');
            const resources = { workerSlots: input.maxConcurrency, modelCalls: 100, localToolRuns: 1000, ...(old?.resources ?? {}), ...(input.resources ?? {}) };
            integer(resources.workerSlots, 1); integer(resources.modelCalls); integer(resources.localToolRuns);
            const value = { id: input.id ?? old?.id ?? 'midas-portfolio', name: input.name ?? old?.name ?? 'MIDAS portfolio', maxConcurrency: input.maxConcurrency, resources, revision: (old?.revision ?? 0) + 1, updatedAt: this.at(), economics: { revenue: null, cost: null, currency: 'USD', basis: 'No commercial observations recorded by scheduling counters.' } };
            this.store.put(kinds.config, 'default', value, old?._version ?? null); return value;
        });
    }
    createVenture(input: VentureInput) {
        text(input.name); text(input.goal); const id = input.id ?? 'venture-' + randomUUID().slice(0, 12); identifier(id); integer(input.priority ?? 50, 0, 1000); requireThat(['local', 'fixture', 'live'].includes(input.mode ?? 'local'), 'VENTURE_MODE');
        return this.store.transaction(() => { const v = this.put(kinds.venture, { ...input, id, stage: input.stage ?? 'discovery', priority: input.priority ?? 50, mode: input.mode ?? 'local', status: 'active', revision: 1, evidenceRevision: 0, economics: { revenue: null, cost: null, currency: 'USD', basis: 'Unobserved' }, commitments: { research: 'permitted preparation', build: 'reversible local work', commit: 'requires adapter authority' }, nextAction: 'Plan valuable work from available evidence', createdAt: this.at(), updatedAt: this.at() }); this.event(id, 'venture_created', { id, goal: input.goal }); return v; });
    }
    registerWorker(input: WorkerInput, options: { ifAbsent?: boolean } = {}) {
        identifier(input.id); text(input.name); unique(input.competencies); unique(input.capabilities); input.competencies.forEach(x => text(x)); input.capabilities.forEach(x => text(x)); integer(input.maxConcurrency ?? 1, 1, 1000);
        return this.store.transaction(() => { const old = this.store.get(kinds.worker, input.id); if (old && options.ifAbsent) return old; return this.put(kinds.worker, { ...old, ...input, maxConcurrency: input.maxConcurrency ?? 1, available: input.available ?? true, procedureId: input.procedureId ?? null }); });
    }
    addPlan(ventureId: string, input: PlanInput, expectedRevision?: number) { return this.store.transaction(() => this.addPlanInside(ventureId, input, expectedRevision)); }
    private addPlanInside(ventureId: string, input: PlanInput, expectedRevision?: number) {
        let v = this.getVenture(ventureId); requireThat(v.status !== 'cancelled', 'VENTURE_CANCELLED'); text(input.rationale); requireThat(input.tasks.length > 0 && input.tasks.length <= 100, 'PLAN_TASK_BOUNDS'); input.tasks.forEach(validateTask); unique(input.tasks.map(t => t.id));
        if (expectedRevision !== undefined) requireThat(v.revision === expectedRevision, 'VENTURE_REVISION_CHANGED');
        const id = input.id ?? 'plan-' + randomUUID().slice(0, 12); identifier(id); const key = taskKey(ventureId, id); requireThat(!this.store.get(kinds.plan, key), 'PLAN_EXISTS');
        const existing = this.rows(kinds.task).filter(t => t.ventureId === ventureId);
        const qualify = (dep: string) => dep.includes('/') ? dep : taskKey(ventureId, dep);
        const graph = new Map(existing.map(t => [t.id, t.dependsOn]));
        for (const spec of input.tasks) { const tid = taskKey(ventureId, spec.id); requireThat(!this.store.get(kinds.task, tid), 'TASK_EXISTS'); graph.set(tid, spec.dependsOn.map(qualify)); }
        const visiting = new Set<string>(), visited = new Set<string>();
        const visit = (tid: string) => { requireThat(!visiting.has(tid), 'TASK_DEPENDENCY_CYCLE'); if (visited.has(tid)) return; const deps = graph.get(tid); requireThat(deps, 'TASK_DEPENDENCY_MISSING'); visiting.add(tid); for (const d of deps) { requireThat(d.startsWith(ventureId + '/'), 'CROSS_VENTURE_TASK_DEPENDENCY_DENIED'); visit(d); } visiting.delete(tid); visited.add(tid); };
        for (const spec of input.tasks) visit(taskKey(ventureId, spec.id));
        const revision = v.revision + 1;
        const plan = this.put(kinds.plan, { id: key, localId: id, ventureId, revision, evidenceRevision: v.evidenceRevision, evidenceIds: input.evidenceIds ?? [], rationale: input.rationale, taskIds: input.tasks.map(t => taskKey(ventureId, t.id)), createdAt: this.at() });
        this.store.record(portfolioScope(ventureId), id, 'PortfolioPlan', plan);
        for (const spec of input.tasks) {
            const task: any = { ...spec, id: taskKey(ventureId, spec.id), localId: spec.id, ventureId, planId: key, planRevision: revision, objective: spec.objective ?? spec.title, dependsOn: spec.dependsOn.map(qualify), requiredCompetencies: spec.requiredCompetencies ?? [], allowedTools: spec.allowedTools ?? [], requiredChecks: spec.requiredChecks ?? [], resource: { workerSlots: 1, modelCalls: 8, localToolRuns: 20, ...spec.resource }, priority: spec.priority ?? v.priority, maxAttempts: spec.maxAttempts ?? 3, attempts: 0, inputArtifacts: spec.inputArtifacts ?? [], outputArtifacts: [], outputCurrent: true, invalidatedAt: null, invalidationReason: null, status: v.status === 'paused' ? 'paused' : 'queued', reason: 'Waiting for dependencies, capability and capacity', nextAction: 'Run when dependencies and resources are ready', workerId: null, lease: null, result: null, createdAt: this.at(), updatedAt: this.at() };
            for (const ref of task.inputArtifacts) this.assertArtifactBinding(ventureId, ref);
            this.put(kinds.task, task);
        }
        v = this.put(kinds.venture, { ...v, revision, nextAction: 'Execute ready work', updatedAt: this.at() }); this.event(ventureId, 'planned', { planId: key, taskIds: plan.taskIds, evidenceIds: plan.evidenceIds }); return plan;
    }
    private assertArtifactBinding(ventureId: string, ref: any) { const a = this.store.get(kinds.artifact, ref.artifactId.includes('/') ? ref.artifactId : taskKey(ventureId, ref.artifactId)); requireThat(a && a.version === ref.version && a.sha256 === ref.sha256, 'ARTIFACT_INPUT_STALE'); requireThat(a.ventureId === ventureId || a.shareable === true, 'ARTIFACT_SCOPE_DENIED'); }
    private ready(t: Task) {
        if (t.status !== 'queued' || t.invalidatedAt || this.getVenture(t.ventureId).status !== 'active') return false;
        if (!t.dependsOn.every(id => { const d = this.task(id); if (d.status !== 'completed' || !d.outputCurrent) return false; try { for (const ref of d.outputArtifacts) this.assertArtifactBinding(t.ventureId, ref); return true; } catch { return false; } })) return false;
        try { for (const ref of t.inputArtifacts) this.assertArtifactBinding(t.ventureId, ref); } catch { return false; }
        return true;
    }
    private assertResume(t: Task, proof: { executionHash: string; checkpointHash: string }) {
        const marker = (t as any).interruptedLease, execution = this.store.get('portfolio-execution', t.id);
        requireThat(marker && !t.lease && t.attempts > 0 && ['queued', 'blocked'].includes(t.status) && !t.stopRequested && !t.invalidatedAt && this.getVenture(t.ventureId).status === 'active', 'TASK_DURABLE_RESUME_UNAVAILABLE');
        requireThat(execution?.taskId === t.id && execution.ventureId === t.ventureId && hash(execution) === proof.executionHash && hash(t.checkpoint ?? null) === proof.checkpointHash && Number.isSafeInteger(execution.index) && execution.index >= 0, 'TASK_RESUME_EXECUTION_CHANGED');
        const steps = this.rows(kinds.step).filter(s => s.taskId === t.id);
        requireThat(!this.unresolved(t.id).length && execution.index <= steps.filter(s => s.kind === 'model').length, 'TASK_RESUME_UNSETTLED');
        for (const step of steps) {
            const model = step.kind === 'model', key = t.id + '/' + step.stepId;
            const intent = this.store.get(model ? 'portfolio-model-request' : 'portfolio-tool-intent', key), response = this.store.get(model ? 'portfolio-model-result' : 'portfolio-tool-result', key);
            requireThat(step.status === 'completed' && intent?.identity && response?.taskId === t.id && response.stepId === step.stepId && response.identity === intent.identity && response.requestHash === intent.identity && response.outputHash === hash(response.result) && hash(response.output) === response.outputHash, 'TASK_RESUME_DURABLE_PROOF_REQUIRED');
        }
        // A checkpoint may lag execution.index when a process stops between the
        // two durable writes. Verify observations against actual tool receipts.
        requireThat(Array.isArray(execution.observations) && execution.observations.every((o: any) => steps.some(s => s.kind === 'tool' && this.store.get('portfolio-tool-intent', s.id)?.call?.name === o.tool && this.store.get('portfolio-tool-result', s.id)?.outputHash === hash(o.result))), 'TASK_RESUME_OBSERVATION_CHANGED');
        requireThat(this.ready({ ...t, status: 'queued' }), 'TASK_RESUME_INPUTS_CHANGED');
        return marker;
    }
    private claimInside(taskId: string, workerId: string, options: { ownerId?: string; leaseMs?: number } = {}, resumeProof?: { executionHash: string; checkpointHash: string }): TaskLease | null {
        const t = this.task(taskId), w = this.store.get(kinds.worker, workerId); requireThat(w, 'WORKER_NOT_FOUND'); const resume = resumeProof ? this.assertResume(t, resumeProof) : null; if ((t as any).interruptedLease && !resume) return null; if (!w.available || !this.ready(resume ? { ...t, status: 'queued' } : t)) return null;
        if (!w.capabilities.includes(t.capability) || !t.requiredCompetencies.every(c => w.competencies.includes(c))) return null;
        const config = this.store.get(kinds.config, 'default'), active = this.rows(kinds.task).filter(t => t.lease), slots = active.reduce((n, t) => n + t.resource.workerSlots, 0);
        if (active.length >= config.maxConcurrency || active.filter(t => t.workerId === workerId).length >= w.maxConcurrency || slots + t.resource.workerSlots > config.resources.workerSlots) return null;
        if (!resume && t.attempts >= t.maxAttempts) { this.put(kinds.task, { ...t, status: 'blocked', reason: 'Attempt limit reached', nextAction: 'Inspect failure evidence and revise the plan', updatedAt: this.at() }); return null; }
        const leaseMs = options.leaseMs ?? this.leaseMs; integer(leaseMs, 1, 86_400_000);
        const lease: Lease = { token: randomUUID(), ownerId: options.ownerId ?? String(process.pid), workerId, generation: Math.max(t.attempts, (t as any).leaseGeneration ?? 0) + 1, heartbeatAt: this.at(), expiresAt: new Date(this.now() + leaseMs).toISOString() };
        const bindings = [...t.inputArtifacts]; for (const id of t.dependsOn) for (const ref of this.task(id).outputArtifacts) if (!bindings.some(b => b.artifactId === ref.artifactId)) bindings.push(ref);
        const task = this.put(kinds.task, { ...t, status: 'running', reason: resume ? 'Worker is resuming verified durable execution without a new task attempt' : 'Worker is executing the persisted assignment', nextAction: 'Inspect progress or pause work', attempts: resume ? t.attempts : t.attempts + 1, workerId, lease, leaseGeneration: lease.generation, interruptedLease: null, stopRequested: null, inputArtifacts: bindings, progressAt: this.at(), updatedAt: this.at() });
        if (resume) this.store.record(portfolioScope(t.ventureId), 'task-resume-' + hash({ taskId, generation: lease.generation }).slice(0, 24), 'PortfolioDurableResume', { taskId, priorGeneration: resume.generation, generation: lease.generation, attempts: t.attempts, proof: resumeProof, providerAdmission: false });
        this.event(t.ventureId, resume ? 'task_resumed' : 'task_claimed', { taskId, workerId, generation: lease.generation }); return { task, token: lease.token, lease };
    }
    claimTask(taskId: string, workerId: string, options: { ownerId?: string; leaseMs?: number } = {}) { this.recover(); return this.store.transaction(() => this.claimInside(taskId, workerId, options)); }
    /** Trusted continuation only: proof is checked against persisted intents and
     * exact outputs. This never changes attempts, maxAttempts or call limits. */
    resumeTask(taskId: string, workerId: string, proof: { executionHash: string; checkpointHash: string }, options: { ownerId?: string; leaseMs?: number } = {}) { return this.store.transaction(() => this.claimInside(taskId, workerId, options, proof)); }
    claimNext(workerId: string, options: { ownerId?: string; leaseMs?: number } = {}) { this.recover(); return this.store.transaction(() => { const tasks = this.rows(kinds.task).filter(t => t.status === 'queued').sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); for (const t of tasks) { const lease = this.claimInside(t.id, workerId, options); if (lease) return lease; } return null; }); }
    private leased(taskId: string, token: string, allowStopped = false): Task { const t = this.task(taskId); requireThat(t.lease?.token === token, 'TASK_LEASE_MISMATCH'); requireThat(Date.parse(t.lease.expiresAt) > this.now(), 'TASK_LEASE_EXPIRED'); requireThat(allowStopped || (t.status === 'running' && !t.stopRequested && !t.invalidatedAt && this.getVenture(t.ventureId).status === 'active'), 'TASK_NOT_RUNNING'); return t; }
    heartbeat(taskId: string, token: string, leaseMs = this.leaseMs) { integer(leaseMs, 1, 86_400_000); return this.store.transaction(() => { const t = this.leased(taskId, token, true); return this.put(kinds.task, { ...t, lease: { ...t.lease, heartbeatAt: this.at(), expiresAt: new Date(this.now() + leaseMs).toISOString() }, updatedAt: this.at() }); }); }
    checkpoint(taskId: string, token: string, checkpoint: any) { return this.store.transaction(() => { const t = this.leased(taskId, token); return this.put(kinds.task, { ...t, checkpoint, progressAt: this.at(), updatedAt: this.at() }); }); }
    reserveStep(taskId: string, token: string, kind: 'model' | 'tool', stepId: string) {
        identifier(stepId); requireThat(['model', 'tool'].includes(kind), 'STEP_KIND');
        return this.store.transaction(() => { const t = this.leased(taskId, token), id = taskId + '/' + stepId, old = this.store.get(kinds.step, id); if (old) { requireThat(old.kind === kind, 'STEP_ID_CONFLICT'); return old; }
            const field = kind === 'model' ? 'modelCalls' : 'localToolRuns', rows = this.rows(kinds.step), cap = this.store.get(kinds.config, 'default').resources[field];
            requireThat(rows.filter(s => s.kind === kind).length < cap, 'PORTFOLIO_RESOURCE_CAP'); requireThat(rows.filter(s => s.taskId === taskId && s.kind === kind).length < t.resource[field], 'TASK_RESOURCE_CAP');
            // Prospective outcome mandates share one admission ceiling across original,
            // correction and regenerated dependent tasks. Failed/unknown steps still count.
            const outcomeId=(t.inputs as any)?.outcomeId;
            if(outcomeId){const outcome=this.store.get('pilot-outcome-mandate',outcomeId);requireThat(outcome&&outcome.businessId===t.ventureId&&outcome.taskIds.includes(t.id),'OUTCOME_TASK_BINDING');requireThat(!['paused','cancelled','rejected'].includes(outcome.state),'OUTCOME_STOPPED');if(kind==='model')requireThat((outcome.preparationAdmissions??0)+outcome.plannerAdmissions+rows.filter(s=>s.kind==='model'&&outcome.taskIds.includes(s.taskId)).length<outcome.maxCalls,'OUTCOME_AGGREGATE_CALL_CAP');}
            const step = this.put(kinds.step, { id, stepId, taskId, ventureId: t.ventureId, generation: t.lease!.generation, kind, status: 'reserved', createdAt: this.at(), usage: null }); this.event(t.ventureId, 'step_reserved', { taskId, stepId, kind }); return step;
        });
    }
    finishStep(taskId: string, token: string, stepId: string, outcome: { uncertain?: boolean; error?: string; outputRef?: unknown } = {}) { return this.store.transaction(() => { const t = this.leased(taskId, token, true), id = taskId + '/' + stepId, step = this.store.get(kinds.step, id); requireThat(step, 'STEP_NOT_RESERVED'); if (step.status === 'completed') { requireThat(hash(step.outcome) === hash(outcome), 'STEP_OUTCOME_CONFLICT'); return step; } requireThat(step.generation === t.lease!.generation, 'STEP_GENERATION_CHANGED'); const next = this.put(kinds.step, { ...step, status: outcome.uncertain ? 'uncertain' : 'completed', outcome, finishedAt: this.at() }); this.event(t.ventureId, 'step_finished', { taskId, stepId, status: next.status }); return next; }); }
    /** Trusted runtime-only entry point. A verified durable response, never a UI assertion, resolves a step. */
    reconcileStep(taskId: string, stepId: string, proof: { recordKind: 'portfolio-model-result' | 'portfolio-tool-result'; recordKey: string; requestHash: string; outputHash: string; outputRef?: unknown }) {
        return this.store.transaction(() => {
            const t = this.task(taskId), step = this.store.get(kinds.step, taskId + '/' + stepId); requireThat(step, 'STEP_NOT_RESERVED');
            requireThat(['portfolio-model-result', 'portfolio-tool-result'].includes(proof.recordKind), 'RECONCILIATION_PROOF_KIND');
            const response = this.store.get(proof.recordKind, proof.recordKey);
            requireThat(response && response.taskId === taskId && response.stepId === stepId && /^[a-f0-9]{64}$/.test(proof.requestHash) && /^[a-f0-9]{64}$/.test(proof.outputHash) && response.requestHash === proof.requestHash && response.outputHash === proof.outputHash && hash(response.output) === proof.outputHash, 'RECONCILIATION_DURABLE_RESPONSE_REQUIRED');
            requireThat((step.kind === 'model') === (proof.recordKind === 'portfolio-model-result'), 'RECONCILIATION_STEP_KIND');
            const recordId = 'step-reconciliation-' + hash(step.id).slice(0, 24), evidence = { taskId, stepId, proof, originalGeneration: step.generation };
            this.store.record(portfolioScope(t.ventureId), recordId, 'PortfolioStepReconciliation', evidence);
            const next = step.status === 'completed' ? step : this.put(kinds.step, { ...step, status: 'completed', outcome: { outputRef: proof.outputRef ?? { kind: proof.recordKind, key: proof.recordKey }, reconciled: true }, finishedAt: this.at() });
            if (t.status === 'needs_reconciliation' && !this.unresolved(taskId).length) { const venture = this.getVenture(t.ventureId), status = t.stopRequested === 'cancel' || venture.status === 'cancelled' ? 'cancelled' : t.stopRequested === 'pause' || venture.status === 'paused' ? 'paused' : t.invalidatedAt ? 'stale' : 'queued'; this.put(kinds.task, { ...t, status, reason: 'Durable response reconciled; reuse its original output', nextAction: 'Resume from preserved output without another dispatch', updatedAt: this.at() }); }
            this.event(t.ventureId, 'step_reconciled', { taskId, stepId, proofRef: recordId }); return next;
        });
    }
    recordUsage(taskId: string, token: string, usage: ResourceUsage, identity?: string) { const id = identity ?? 'usage-' + randomUUID(); identifier(id); for (const [k, count] of Object.entries(usage)) { requireThat(['modelCalls', 'localToolRuns', 'workerMs'].includes(k), 'RESOURCE_KEY'); integer(count); } return this.store.transaction(() => { const t = this.leased(taskId, token, true), key = taskId + '/' + id, old = this.store.get('portfolio-usage', key); if (old) { requireThat(hash(old.usage) === hash(usage), 'USAGE_CONFLICT'); return old; } const steps = this.rows(kinds.step).filter(s => s.taskId === taskId); requireThat((usage.modelCalls ?? 0) <= steps.filter(s => s.kind === 'model').length && (usage.localToolRuns ?? 0) <= steps.filter(s => s.kind === 'tool').length, 'USAGE_REQUIRES_STEP_ADMISSION'); return this.store.put('portfolio-usage', key, { id: key, taskId, ventureId: t.ventureId, usage, at: this.at() }, null); }); }
    private unresolved(taskId: string) { return this.rows(kinds.step).filter(s => s.taskId === taskId && ['reserved', 'uncertain'].includes(s.status)); }
    complete(taskId: string, token: string, result: Completion = {}) {
        return this.store.transaction(() => this.completeInside(taskId, token, result));
    }
    private completeInside(taskId: string, token: string, result: Completion) {
            const t = this.leased(taskId, token, true); requireThat(this.unresolved(taskId).length === 0, 'TASK_HAS_UNCERTAIN_STEPS');
            if (result.usage) { for (const [key, value] of Object.entries(result.usage)) { requireThat(['modelCalls', 'localToolRuns', 'workerMs'].includes(key), 'RESOURCE_KEY'); integer(value); } const key = taskId + '/completion-' + t.lease!.generation; this.store.put('portfolio-usage', key, { id: key, taskId, ventureId: t.ventureId, usage: result.usage, at: this.at() }, null); }
            const checks = result.checks ?? []; unique(checks.map(c => c.id)); checks.forEach(c => { text(c.id); requireThat(typeof c.passed === 'boolean', 'CHECK_RESULT_REQUIRED'); });
            requireThat(t.requiredChecks.every(id => checks.some(c => c.id === id && c.passed)), 'TASK_ACCEPTANCE_CHECK_FAILED'); requireThat(!checks.some(c => !c.passed && t.requiredChecks.includes(c.id)), 'TASK_ACCEPTANCE_CHECK_FAILED');
            const stopped = t.stopRequested || this.getVenture(t.ventureId).status !== 'active'; const stale = t.invalidatedAt || t.inputArtifacts.some(ref => { try { this.assertArtifactBinding(t.ventureId, ref); return false; } catch { return true; } });
            const artifacts = stale || stopped ? [] : (result.artifacts ?? []).map(input => this.publishInside(t.ventureId, input, taskId));
            const value = { ...result, artifacts, ...(stale || stopped ? { unpublishedArtifacts: result.artifacts ?? [] } : {}), checks, observedAt: this.at() };
            this.store.record(portfolioScope(t.ventureId), 'task-result-' + hash({ taskId, generation: t.lease!.generation }).slice(0, 24), 'PortfolioTaskResult', { taskId, generation: t.lease!.generation, accepted: !stale && !stopped, result: value });
            const status = stale ? 'stale' : stopped ? (t.stopRequested === 'cancel' || this.getVenture(t.ventureId).status === 'cancelled' ? 'cancelled' : 'paused') : 'completed';
            const next = this.put(kinds.task, { ...this.task(taskId), result: value, outputArtifacts: artifacts.map(a => ({ artifactId: a.id, version: a.version, sha256: a.sha256 })), outputCurrent: !stale && !stopped, status, lease: null, reason: stale ? 'Inputs changed during execution; preserved output is not current' : stopped ? 'Stopped after preserving the admitted result' : 'Required checks passed and output was preserved', nextAction: status === 'completed' ? 'Inspect the produced output' : 'Review the preserved result and revise work', updatedAt: this.at() });
            for (const observation of result.observations ?? []) this.observeInside(t.ventureId, observation); this.event(t.ventureId, 'task_completed', { taskId, status, artifactIds: artifacts.map(a => a.id) }); return next;
    }
    fail(taskId: string, token: string, failure: { code: string; message: string; retryable?: boolean; uncertainEffect?: boolean }) { return this.store.transaction(() => { const t = this.leased(taskId, token, true); text(failure.code); text(failure.message); const unknown = failure.uncertainEffect || this.unresolved(taskId).length > 0, retry = failure.retryable && t.attempts < t.maxAttempts && !t.stopRequested && !t.invalidatedAt; const status = unknown ? 'needs_reconciliation' : t.stopRequested === 'cancel' ? 'cancelled' : t.stopRequested === 'pause' ? 'paused' : t.invalidatedAt ? 'stale' : retry ? 'queued' : 'blocked'; this.store.record(portfolioScope(t.ventureId), 'task-failure-' + hash({ taskId, generation: t.lease!.generation }).slice(0, 24), 'PortfolioTaskFailure', { taskId, failure, generation: t.lease!.generation }); const next = this.put(kinds.task, { ...t, lease: null, interruptedLease: unknown && this.store.get('portfolio-execution', t.id) ? { generation: t.lease!.generation, at: this.at(), reason: 'uncertain_step' } : null, status, reason: failure.message, nextAction: unknown ? 'Reconcile the admitted step before any retry' : retry ? 'Run the bounded correction attempt' : 'Inspect failure evidence and revise work', updatedAt: this.at() }); this.event(t.ventureId, 'task_failed', { taskId, code: failure.code, status }); return next; }); }
    controlTask(taskId: string, action: 'pause' | 'resume' | 'cancel') { return this.store.transaction(() => this.controlInside(taskId, action)); }
    private controlInside(taskId: string, action: 'pause' | 'resume' | 'cancel') { const t = this.task(taskId); requireThat(['pause', 'resume', 'cancel'].includes(action), 'CONTROL_ACTION'); if (action === 'resume') { requireThat(t.status === 'paused' && !t.lease && !t.invalidatedAt && this.unresolved(taskId).length === 0, 'TASK_CANNOT_RESUME'); const continuation = t.attempts > 0 && (t as any).pauseOrigin !== 'blocked' && this.store.get('portfolio-execution', t.id); return this.put(kinds.task, { ...t, status: 'queued', interruptedLease: continuation ? { generation: (t as any).leaseGeneration ?? t.attempts, at: this.at(), reason: 'owner_resumed_pause' } : (t as any).interruptedLease ?? null, stopRequested: null, reason: 'Owner resumed work', updatedAt: this.at() }); } if (terminal.has(t.status)) return t; const next = this.put(kinds.task, { ...t, pauseOrigin: action === 'pause' && t.status !== 'paused' ? t.status : (t as any).pauseOrigin ?? null, status: t.lease || t.status === 'needs_reconciliation' ? t.status : action === 'cancel' ? 'cancelled' : 'paused', stopRequested: action, reason: 'Owner requested ' + action, nextAction: t.lease || t.status === 'needs_reconciliation' ? 'Wait for the admitted operation to settle' : action === 'pause' ? 'Resume when ready' : 'Inspect preserved evidence', updatedAt: this.at() }); this.event(t.ventureId, 'task_' + action, { taskId }); return next; }
    controlVenture(ventureId: string, action: 'pause' | 'resume' | 'cancel') { return this.store.transaction(() => { const v = this.getVenture(ventureId); requireThat(['pause', 'resume', 'cancel'].includes(action), 'CONTROL_ACTION'); requireThat(v.status !== 'cancelled', 'VENTURE_CANCELLED'); if (action === 'resume') requireThat(v.status === 'paused', 'VENTURE_NOT_PAUSED'); const next = this.put(kinds.venture, { ...v, status: action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : 'active', updatedAt: this.at() }); for (const t of this.rows(kinds.task).filter(t => t.ventureId === ventureId && !terminal.has(t.status))) { if (action !== 'resume' || (t.status === 'paused' && !t.lease && !t.invalidatedAt && !this.unresolved(t.id).length)) this.controlInside(t.id, action); } return next; }); }
    /** Active bounded provider work is progress, not an infinite heartbeat waiver. */
    private backgroundProgress(taskId:string){
        const execution=this.store.get('portfolio-execution',taskId),intent=execution&&this.store.get('portfolio-model-request',taskId+'/model-'+execution.index),id=intent?.call?.attemptId;
        if(!id)return false;
        const jobs=this.store.db.prepare("SELECT key,body FROM entities WHERE kind='response-job'").all();
        return jobs.some(row=>{const j=JSON.parse(String(row.body)),last=j.events?.at(-1);return String(row.key).endsWith('/'+id)&&j.createDispatched&&j.responseId&&!j.terminal&&this.now()<Date.parse(j.completionDeadlineAt)&&last&&this.now()-Date.parse(last.at)<60000;});
    }
    recover(options: { ownerAlive?: (ownerId: string) => boolean } = {}) { return this.store.transaction(() => { const recovered = []; for (const t of this.rows(kinds.task).filter(t => t.lease)) { const lease = t.lease, stalled = this.now() - Date.parse(t.progressAt ?? t.updatedAt) > this.stallMs && !this.backgroundProgress(t.id), ownerDead = Boolean(options.ownerAlive && !options.ownerAlive(lease.ownerId)); if (!stalled && Date.parse(lease.expiresAt) > this.now() && !ownerDead) continue; const unknown = this.unresolved(t.id).length > 0, cancelled = t.stopRequested === 'cancel' || this.getVenture(t.ventureId).status === 'cancelled', paused = t.stopRequested === 'pause' || this.getVenture(t.ventureId).status === 'paused', continuable = Boolean(this.store.get('portfolio-execution', t.id) && (!stalled || ownerDead)); const status = unknown ? 'needs_reconciliation' : cancelled ? 'cancelled' : paused ? 'paused' : t.invalidatedAt ? 'stale' : continuable ? 'queued' : stalled || t.attempts >= t.maxAttempts ? 'blocked' : 'queued'; const next = this.put(kinds.task, { ...t, lease: null, interruptedLease: continuable ? { generation: lease.generation, at: this.at(), reason: 'lease_ended' } : null, status, reason: unknown ? 'Worker stopped with an admitted step whose outcome is uncertain' : stalled && !ownerDead ? 'Worker heartbeat continued without task progress; diagnosis required' : 'Worker lease ended; durable task checkpoint retained', nextAction: unknown ? 'Reconcile preserved attempt; do not dispatch again' : status === 'queued' ? 'Resume from the persisted checkpoint' : 'Inspect stopping reason', updatedAt: this.at() }); recovered.push(next); this.event(t.ventureId, 'task_recovered', { taskId: t.id, status, priorGeneration: lease.generation, stalled }); } return recovered; }); }
    publishArtifact(ventureId: string, input: ArtifactInput) { return this.store.transaction(() => this.publishInside(ventureId, input, null)); }
    private publishInside(ventureId: string, input: ArtifactInput, taskId: string | null) {
        this.getVenture(ventureId); identifier(input.id); text(input.title); text(input.kind); text(input.provenance); const id = taskKey(ventureId, input.id), prior = this.store.get(kinds.artifact, id); const sha256 = hash(input);
        if (prior?.sha256 === sha256) return prior;
        const value = this.put(kinds.artifact, { ...input, id, localId: input.id, ventureId, taskId, version: (prior?.version ?? 0) + 1, sha256, createdAt: this.at(), _version: prior?._version });
        this.store.record(portfolioScope(ventureId), 'artifact-' + hash({ id, version: value.version }).slice(0, 24), 'PortfolioArtifactVersion', value);
        if (prior) this.invalidateInside(ventureId, id, 'Artifact ' + input.title + ' changed to version ' + value.version, taskId);
        this.event(ventureId, 'artifact_published', { artifactId: id, version: value.version, sha256, taskId }); return value;
    }
    private invalidateInside(ventureId: string, artifactId: string, reason: string, producingTaskId: string | null = null) {
        const tasks = this.rows(kinds.task).filter(t => t.ventureId === ventureId), affected = new Set(tasks.filter(t => t.id !== producingTaskId && [...t.inputArtifacts, ...t.outputArtifacts].some((b: any) => (b.artifactId.includes('/') ? b.artifactId : taskKey(ventureId, b.artifactId)) === artifactId)).map(t => t.id));
        let changed = true; while (changed) { changed = false; for (const t of tasks) if (t.id !== producingTaskId && !affected.has(t.id) && t.dependsOn.some((id: string) => affected.has(id))) { affected.add(t.id); changed = true; } }
        for (const t of tasks.filter(t => affected.has(t.id) && t.status !== 'cancelled')) this.put(kinds.task, { ...t, outputCurrent: false, invalidatedAt: this.at(), invalidationReason: reason, status: t.lease || t.status === 'completed' || t.status === 'needs_reconciliation' ? t.status : 'stale', reason, nextAction: 'Reassess the changed evidence and create current work', updatedAt: this.at() });
    }
    recordObservation(ventureId: string, input: ObservationInput) { return this.store.transaction(() => this.observeInside(ventureId, input)); }
    private observeInside(ventureId: string, input: ObservationInput) {
        let v = this.getVenture(ventureId); text(input.kind); text(input.summary); text(input.source); text(input.provenance); if (input.observedAt) requireThat(Number.isFinite(Date.parse(input.observedAt)), 'OBSERVATION_TIME');
        const semantic = { ...input }; delete semantic.id; const digest = hash(semantic), localId = input.id ?? 'observation-' + digest.slice(0, 24); identifier(localId); const id = taskKey(ventureId, localId), prior = this.store.get(kinds.observation, id);
        if (prior) { requireThat(prior.digest === digest, 'OBSERVATION_ID_CONFLICT'); return { observation: prior, duplicate: true, reassessmentTaskId: prior.reassessmentTaskId }; }
        const duplicate = this.rows(kinds.observation).find(o => o.ventureId === ventureId && o.digest === digest); if (duplicate) return { observation: duplicate, duplicate: true, reassessmentTaskId: duplicate.reassessmentTaskId };
        const revision = v.evidenceRevision + 1, reassessmentTaskId = input.reassess === false || v.status === 'cancelled' ? null : taskKey(ventureId, 'reassess-' + revision);
        const observation = this.put(kinds.observation, { ...input, id, localId, ventureId, digest, evidenceRevision: revision, reassessmentTaskId, observedAt: input.observedAt ?? this.at(), createdAt: this.at() });
        this.store.record(portfolioScope(ventureId), localId, 'PortfolioObservation', observation);
        this.put(kinds.venture, { ...v, evidenceRevision: revision, updatedAt: this.at(), nextAction: reassessmentTaskId ? 'Reassess new operating evidence' : v.nextAction });
        if (reassessmentTaskId) this.addPlanInside(ventureId, { id: 'evidence-plan-' + revision, rationale: 'New observation may change useful work: ' + input.summary, evidenceIds: [id], tasks: [{ id: 'reassess-' + revision, title: 'Reassess: ' + input.summary.slice(0, 100), objective: 'Assess the observation, revise assumptions and redirect work only where justified.', lane: 'research', capability: 'portfolio.reassess', dependsOn: [], acceptance: ['A persisted decision cites the triggering observation and explains changes or retaining the plan.'], requiredChecks: ['reassessment.evidence_bound'], inputs: { observationIds: [id], evidenceRevision: revision }, priority: Math.min(1000, v.priority + 10), resource: { modelCalls: 2, localToolRuns: 4 } }] });
        this.event(ventureId, 'observation_recorded', { id, evidenceRevision: revision, reassessmentTaskId }); return { observation, duplicate: false, reassessmentTaskId };
    }
    applyReassessment(taskId: string, token: string, input: { rationale: string; tasks?: PlanInput['tasks']; cancelTaskIds?: string[]; priority?: number; observationIds?: string[] }) {
        return this.store.transaction(() => { const t = this.leased(taskId, token); requireThat(t.capability === 'portfolio.reassess', 'REASSESSMENT_TASK_REQUIRED'); requireThat(!this.unresolved(taskId).length, 'TASK_HAS_UNCERTAIN_STEPS'); text(input.rationale); const required = (t.inputs as any)?.observationIds ?? []; requireThat(required.length > 0 && required.every((id: string) => this.store.get(kinds.observation, id)), 'REASSESSMENT_EVIDENCE_REQUIRED'); if (input.observationIds) requireThat(required.every((id: string) => input.observationIds!.includes(id)), 'REASSESSMENT_EVIDENCE_CHANGED');
            for (const id of input.cancelTaskIds ?? []) { const old = this.task(id); requireThat(old.ventureId === t.ventureId && id !== taskId, 'REASSESSMENT_TASK_SCOPE'); requireThat(!terminal.has(old.status), 'REASSESSMENT_CANNOT_CHANGE_TERMINAL_TASK'); this.controlInside(id, 'cancel'); }
            let v = this.getVenture(t.ventureId); const priorPriority = v.priority; if (input.priority !== undefined) { integer(input.priority, 0, 1000); v = this.put(kinds.venture, { ...v, priority: input.priority, updatedAt: this.at() }); }
            const plan = input.tasks?.length ? this.addPlanInside(t.ventureId, { rationale: input.rationale, evidenceIds: required, tasks: input.tasks }) : null;
            const id = 'decision-' + hash({ taskId, generation: t.lease!.generation }).slice(0, 24), decision = this.put(kinds.decision, { id, ventureId: t.ventureId, taskId, observationIds: required, rationale: input.rationale, planId: plan?.id ?? null, cancelledTaskIds: input.cancelTaskIds ?? [], priorPriority, priority: v.priority, provenance: 'runtime proposal validated against persisted evidence and task scope', createdAt: this.at() });
            this.store.record(portfolioScope(t.ventureId), id, 'PortfolioReassessmentDecision', decision);
            const result = { summary: input.rationale, output: decision, artifacts: [], checks: [{ id: 'reassessment.evidence_bound', passed: true, evidence: required }] };
            this.put(kinds.task, { ...this.task(taskId), status: 'completed', lease: null, result, outputCurrent: true, reason: input.rationale, nextAction: plan ? 'Execute the revised work' : 'Continue the current plan', updatedAt: this.at() }); this.event(t.ventureId, 'reassessed', { decisionId: id, taskId, planId: plan?.id ?? null }); return decision;
        });
    }
    /** Normal executive decisions become visible only with their checked completion. */
    applyPlanning(taskId: string, token: string, input: Completion & { rationale: string; tasks?: PlanInput['tasks']; cancelTaskIds?: string[]; priority?: number; evidenceIds?: string[] }) {
        return this.store.transaction(() => {
            const t = this.leased(taskId, token); requireThat(t.capability === 'portfolio.plan', 'PLANNING_TASK_REQUIRED'); requireThat(!this.unresolved(taskId).length, 'TASK_HAS_UNCERTAIN_STEPS');
            for (const binding of t.inputArtifacts) this.assertArtifactBinding(t.ventureId, binding);
            const { rationale, tasks = [], cancelTaskIds = [], priority, evidenceIds = [], ...completion } = input; text(rationale); unique(cancelTaskIds); unique(evidenceIds);
            for (const id of cancelTaskIds) { const old = this.task(id); requireThat(old.ventureId === t.ventureId && id !== taskId, 'PLANNING_TASK_SCOPE'); requireThat(old.status === 'queued' && old.attempts === 0 && !old.lease && !old.invalidatedAt && !this.unresolved(id).length, 'PLANNING_CANNOT_CANCEL_STARTED_TASK'); }
            const derived = tasks.map(spec => ({ ...spec, dependsOn: [...new Set([taskId, ...spec.dependsOn.map(dep => dep.includes('/') ? dep : taskKey(t.ventureId, dep))])] }));
            requireThat(derived.every(spec => spec.dependsOn.every(id => !cancelTaskIds.includes(id))), 'PLANNING_CANCELLED_DEPENDENCY');
            const prior = this.getVenture(t.ventureId), priorPriority = prior.priority;
            if (priority !== undefined) { integer(priority, 0, 1000); this.put(kinds.venture, { ...prior, priority, updatedAt: this.at() }); }
            for (const id of cancelTaskIds) { const old = this.task(id); this.put(kinds.task, { ...old, status: 'cancelled', stopRequested: 'cancel', reason: rationale, nextAction: 'Inspect the preserved executive decision', updatedAt: this.at() }); this.event(t.ventureId, 'task_cancelled_by_plan', { taskId: id, planningTaskId: taskId, rationale }); }
            const plan = derived.length ? this.addPlanInside(t.ventureId, { id: 'derived-' + hash(taskId).slice(0, 24), rationale, evidenceIds, tasks: derived }) : null;
            const id = 'planning-decision-' + hash({ taskId, generation: t.lease!.generation }).slice(0, 24), decision = this.put(kinds.decision, { id, ventureId: t.ventureId, taskId, evidenceIds, observationIds: [], inputArtifacts: t.inputArtifacts, rationale, planId: plan?.id ?? null, cancelledTaskIds: cancelTaskIds, priorPriority, priority: priority ?? priorPriority, provenance: 'runtime planning proposal validated against persisted inputs and task scope', createdAt: this.at() });
            this.store.record(portfolioScope(t.ventureId), id, 'PortfolioPlanningDecision', decision);
            const completed = this.completeInside(taskId, token, { ...completion, summary: completion.summary ?? rationale, output: completion.output ?? decision }); requireThat(completed.status === 'completed', 'PLANNING_COMPLETION_NOT_CURRENT');
            this.event(t.ventureId, 'planning_applied', { taskId, decisionId: id, planId: plan?.id ?? null, priorPriority, priority: decision.priority }); return completed;
        });
    }
    snapshot(ventureId?: string) {
        if (ventureId) this.getVenture(ventureId); const allTasks = this.rows(kinds.task), steps = this.rows(kinds.step), workers = this.rows(kinds.worker), allVentures = this.rows(kinds.venture), config = this.store.get(kinds.config, 'default');
        const byTask: Record<string, any> = {}, byVenture: Record<string, any> = {}; const used = zero(), reserved = zero();
        for (const task of allTasks) { const row = { used: zero(), reserved: zero(), activeWorkerSlots: task.lease ? task.resource.workerSlots : 0 }; byTask[task.id] = row; byVenture[task.ventureId] ??= { used: zero(), reserved: zero(), activeWorkerSlots: 0 }; byVenture[task.ventureId].activeWorkerSlots += row.activeWorkerSlots; }
        for (const step of steps) { const field = step.kind === 'model' ? 'modelCalls' : 'localToolRuns', bucket = step.status === 'completed' ? 'used' : 'reserved'; (bucket === 'used' ? used : reserved)[field]++; if (byTask[step.taskId]) byTask[step.taskId][bucket][field]++; if (byVenture[step.ventureId]) byVenture[step.ventureId][bucket][field]++; }
        for (const usage of this.rows('portfolio-usage')) { const ms = usage.usage.workerMs ?? 0; used.workerMs += ms; if (byTask[usage.taskId]) byTask[usage.taskId].used.workerMs += ms; if (byVenture[usage.ventureId]) byVenture[usage.ventureId].used.workerMs += ms; }
        const filter = (row: any) => !ventureId || row.ventureId === ventureId;
        return { portfolio: config, ventures: allVentures.filter(v => !ventureId || v.id === ventureId), tasks: allTasks.filter(filter).map(t => ({ ...t, runnable: this.ready(t), progress: t.status === 'completed' ? 1 : t.status === 'running' ? 0.5 : 0, resources: byTask[t.id] })), workers, artifacts: this.rows(kinds.artifact).filter(filter), observations: this.rows(kinds.observation).filter(filter), decisions: this.rows(kinds.decision).filter(filter), plans: this.rows(kinds.plan).filter(filter), resources: { limits: config.resources, used, reserved, activeWorkerSlots: allTasks.reduce((n, t) => n + (t.lease ? t.resource.workerSlots : 0), 0), byTask, byVenture, monetaryCost: null, monetaryBasis: 'Scheduling counters are not provider billing or business economics.' }, generatedAt: this.at() };
    }
}
