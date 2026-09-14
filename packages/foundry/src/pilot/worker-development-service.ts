/** Owner/service-facing facade for prospective worker development.
 * It intentionally does not create a provider route. A future adapter must bind
 * model-assisted diagnosis and runtime comparisons to signed OperatingModels
 * admissions before either can dispatch. */
import { hash, requireThat } from '../contracts.ts';
import type { ModelPort } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { PilotKnowledge } from './knowledge.ts';
import { PilotLearning } from './learning.ts';
import { WorkerDevelopment } from './worker-development.ts';
import type { ComparisonMode, CustodyGate, ExternalGrade, ImprovementObservation, KnowledgeMaterial, PracticeCase } from './worker-development.ts';
import { prepareWorkerDevelopmentComparisonGrant, loadAuthorizedWorkerDevelopmentComparison } from './worker-development-authorized.ts';
import type { OperatingModels, Invocation } from '../operations/model.ts';
import type { Principal, ModelRequest } from '../contracts.ts';

const candidateKind = 'pilot-worker-development-candidate';
const comparisonKind = 'pilot-worker-development-comparison';
const casesKind = 'worker-development-cases';
const observationKind = 'pilot-worker-development-observation';
const materialKind = 'pilot-worker-development-material';
const text = (value: unknown, code: string) => requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= 12000, code);

export const workerDevelopmentDiagnosisSchema = {
    type: 'object', additionalProperties: false,
    required: ['cause', 'rationale', 'alternativeExplanations', 'selectedMaterialIds', 'candidateMechanism'],
    properties: {
        cause: { type: 'string', enum: ['missing_knowledge', 'missing_tool', 'missing_context', 'missing_procedure'] },
        rationale: { type: 'string', minLength: 20, maxLength: 4000 },
        alternativeExplanations: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'string', minLength: 5, maxLength: 1000 } },
        selectedMaterialIds: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 96 } },
        candidateMechanism: { type: 'string', minLength: 20, maxLength: 4000 }
    }
};

export class WorkerDevelopmentService {
    readonly store: StateStore;
    readonly knowledge: PilotKnowledge;
    readonly development: WorkerDevelopment;
    constructor(store: StateStore) { this.store = store; this.knowledge = new PilotKnowledge(store); this.development = new WorkerDevelopment(store); }
    define(businessId: string, jobId: string, input: Parameters<WorkerDevelopment['definition']>[2]) { return this.development.definition(businessId, jobId, input); }
    observe(businessId: string, jobId: string, input: ImprovementObservation) { return this.development.observe(businessId, jobId, input); }
    /** Retains permitted local material; it never retrieves a URL or connector. */
    intake(businessId: string, material: KnowledgeMaterial) { return this.development.material(businessId, material); }
    private observation(businessId: string, jobId: string, observationId: string) { const value = this.store.get(observationKind, observationId); requireThat(value?.businessId === businessId && value.jobId === jobId, 'WORKER_DEVELOPMENT_OBSERVATION_REQUIRED'); return value; }
    /** A strict request contract for a future signed OperatingModels diagnosis call.
     * The returned object is preparation only; it owns no authorization or port. */
    prepareDiagnosis(businessId: string, jobId: string, input: { observationId: string; materialIds: string[] }) {
        const worker = this.development.getDefinition(businessId, jobId), observation = this.observation(businessId, jobId, input.observationId);
        requireThat(Array.isArray(input.materialIds) && input.materialIds.length > 0 && new Set(input.materialIds).size === input.materialIds.length, 'WORKER_DEVELOPMENT_MATERIAL_REQUIRED');
        const sources = this.knowledge.selectedSources(businessId); requireThat(worker.evidenceAccess.sourceIds.every(id => sources.some(s => s.id === id && (!s.validUntil || Date.parse(s.validUntil) > Date.now()))), 'WORKER_DEVELOPMENT_SOURCE_UNAVAILABLE');
        const materials = input.materialIds.map(id => this.store.get(materialKind, id)); requireThat(materials.every(m => m?.businessId === businessId && !m.withdrawnAt), 'WORKER_DEVELOPMENT_MATERIAL_UNAVAILABLE');
        const request = { kind: 'worker-development-diagnosis-request-v1', businessId, jobId, workerDefinitionId: worker.id, procedureScope: worker.procedureScope, observation: { id: observation.id, kind: observation.kind, quote: observation.quote, summary: observation.summary, consequence: observation.consequence, sourceId: observation.sourceId, sourceHash: observation.sourceHash }, materials: materials.map(m => ({ id: m.id, kind: m.kind, title: m.title, provenance: m.provenance, content: m.content, contentHash: m.contentHash })), constraints: ['Diagnose only from the supplied observation and materials.', 'Select only listed reusable material IDs.', 'State alternatives; do not infer a worker deficiency as fact.', 'Propose one scoped mechanism; do not claim improvement or authorize execution.'], outputSchema: workerDevelopmentDiagnosisSchema };
        return { status: 'prepared_requires_trusted_signed_factory', request, requestHash: hash(request), dispatch: { available: false, required: 'A trusted OperatingModels-backed factory must validate a signed exact request, route, call limits, evidence binding, and durable ledger attempt before model-assisted diagnosis can run.' } };
    }
    /** Local/assisted proposals remain explicitly unqualified. A trusted diagnosis
     * receipt can be added later without changing candidate or comparison rules. */
    propose(businessId: string, jobId: string, input: { observationId: string; diagnosis: { cause: 'missing_knowledge' | 'missing_tool' | 'missing_context' | 'missing_procedure'; rationale: string; alternativeExplanations: string[] }; materialIds: string[]; candidateMechanism: string; cases: PracticeCase[]; diagnosisProvenance: 'owner_or_assisted' | 'trusted_ledger_model' }) {
        if (input.diagnosisProvenance === 'trusted_ledger_model') throw new Error('WORKER_DEVELOPMENT_TRUSTED_DIAGNOSIS_FACTORY_REQUIRED');
        const prepared = this.prepareDiagnosis(businessId, jobId, { observationId: input.observationId, materialIds: input.materialIds });
        const candidate = this.development.candidate(businessId, jobId, { observationId: input.observationId, diagnosis: input.diagnosis, materialIds: input.materialIds, procedureAddition: input.candidateMechanism, practiceCases: input.cases });
        return { candidate, diagnosis: { provenance: 'owner_or_assisted; not a model diagnosis or competence measurement', requestHash: prepared.requestHash, modelAssistedRoute: prepared.dispatch }, nextAction: 'Run only a strict fixture mechanics comparison, or obtain a future signed ledger-backed diagnosis and exact comparison factory.' };
    }
    practice(candidateId: string) { const candidate = this.store.get(candidateKind, candidateId), cases = this.store.get(casesKind, candidateId)?.items; requireThat(candidate && Array.isArray(cases), 'WORKER_DEVELOPMENT_CANDIDATE_REQUIRED'); return { candidateId, candidateVersion: candidate.version, practice: cases.filter((c: PracticeCase) => c.partition === 'practice'), evaluation: cases.filter((c: PracticeCase) => c.partition === 'evaluation').map((c: PracticeCase) => ({ id: c.id, regression: c.regression, status: 'reserved_for_matched_comparison' })), rule: 'Practice cases must never be submitted as evaluation cases.' }; }
    /** Produce the exact unsigned binding a signed OperatingModels packet must
     * carry. This does not create an executor or make a model request. */
    prepareComparison(candidateId: string, input: { authorizationId: string; resources: { maxCostMinor: number; maxCalls: number; maxAttempts: number; maxHumanMinutes: number } }) {
        const candidate=this.store.get(candidateKind,candidateId);requireThat(candidate,'WORKER_DEVELOPMENT_CANDIDATE_REQUIRED');
        const worker=this.development.getDefinition(candidate.businessId,candidate.jobId),baseline=this.store.get('portfolio-procedure',candidate.baselineProcedureId),proposed=this.store.get('portfolio-procedure',candidate.procedureId),cases=this.store.get(casesKind,candidateId)?.items,materials=candidate.materialIds.map((id:string)=>this.store.get(materialKind,id)),sources=this.knowledge.selectedSources(candidate.businessId);
        requireThat(baseline&&proposed&&Array.isArray(cases)&&materials.every((m:any)=>m?.businessId===candidate.businessId&&!m.withdrawnAt)&&worker.evidenceAccess.sourceIds.every(id=>sources.some(s=>s.id===id&&(!s.validUntil||Date.parse(s.validUntil)>Date.now()))),'WORKER_DEVELOPMENT_PREPARATION_BINDING');
        const evaluationCaseIds=cases.filter((c:PracticeCase)=>c.partition==='evaluation').map((c:PracticeCase)=>c.id);requireThat(input.resources.maxAttempts===1&&input.resources.maxCalls===evaluationCaseIds.length*2,'WORKER_DEVELOPMENT_EXACT_CALL_LIMIT_REQUIRED');
        return prepareWorkerDevelopmentComparisonGrant({authorizationId:input.authorizationId,businessId:candidate.businessId,jobId:candidate.jobId,candidateId,candidateProcedureHash:hash(proposed.procedure),baselineProcedureHash:hash(baseline.procedure),model:worker.model.route,toolHash:hash(worker.tools),evidenceHash:hash({sources:worker.evidenceAccess.sourceIds.map(id=>{const s=sources.find(x=>x.id===id)!;return {id:s.id,sha256:s.sha256};}),materials:materials.map((m:any)=>({id:m.id,contentHash:m.contentHash}))}),resourcesHash:hash(input.resources),evaluationCaseIds,profileHash:hash({responsibilities:worker.responsibilities,tools:worker.tools,outputContract:worker.outputContract})});
    }
    /** The service exposes the real signed loader; it never accepts a plain
     * marker or caller-written authorization object as a runtime substitute. */
    loadComparisonRuntime(input: { operating: OperatingModels; principal: Principal; invocationFor(request: ModelRequest): Invocation }) { return loadAuthorizedWorkerDevelopmentComparison(input); }
    async evaluate(candidateId: string, input: { mode: ComparisonMode; modelPort: ModelPort; resources: { maxCostMinor: number; maxCalls: number; maxAttempts: number; maxHumanMinutes: number }; custody: CustodyGate; authorization?: any; runtime?: any }) { return this.development.runComparison(candidateId, input); }
    grade(comparisonId: string, grades: ExternalGrade[]) { return this.development.gradeComparison(comparisonId, grades); }
    assignment(businessId: string, jobId: string, workflow: 'response-packet' | 'business-site' | 'campaign-packet' | 'marketing-page' | 'functional-project') {
        const worker = this.development.getDefinition(businessId, jobId), sourceIds = new Set(this.knowledge.selectedSources(businessId).filter(s => !s.validUntil || Date.parse(s.validUntil) > Date.now()).map(s => s.id));
        const sourceCurrent = worker.evidenceAccess.sourceIds.every(id => sourceIds.has(id));
        const base = new PilotLearning(this.store).assignment(businessId, workflow), selected = this.development.registry.selected(worker.procedureScope, worker.baselineProcedureId);
        return { ...base, id: worker.id, name: base.name + ' — ' + jobId, job: worker.responsibilities.join(' '), model: worker.model, tools: worker.tools, evidence: worker.evidenceAccess, outputContract: worker.outputContract, procedureVersion: selected.procedure.id, procedureHash: hash(selected.procedure.procedure), baselineProcedureId: worker.baselineProcedureId, procedureScope: worker.procedureScope, selectedProcedure: selected.procedure, adoption: selected.adoption, qualification: worker.model.qualification, sourceCurrent, status: sourceCurrent ? 'ready_for_future_assignment' : 'blocked_source_revoked', nextAction: sourceCurrent ? 'Use this procedure binding for a newly planned pilot task; existing work remains pinned.' : 'Restore or replace the owner-selected source, then prepare a fresh candidate or retain the baseline.' };
    }
    report(businessId: string, jobId?: string) {
        const definitions = this.store.db.prepare("SELECT body FROM entities WHERE kind='pilot-worker-development-definition' ORDER BY key").all().map((r: any) => JSON.parse(String(r.body))).filter((x: any) => x.businessId === businessId && (!jobId || x.jobId === jobId));
        const candidates = this.store.db.prepare("SELECT body FROM entities WHERE kind='pilot-worker-development-candidate' ORDER BY key").all().map((r: any) => JSON.parse(String(r.body))).filter((x: any) => x.businessId === businessId && (!jobId || x.jobId === jobId));
        const comparisons = this.store.db.prepare("SELECT body FROM entities WHERE kind='pilot-worker-development-comparison' ORDER BY key").all().map((r: any) => JSON.parse(String(r.body))).filter((x: any) => x.businessId === businessId && (!jobId || x.jobId === jobId));
        const stages = comparisons.map((c: any) => ({ id: c.id, status: c.status, mode: c.mode, slots: { pending: (c.slots ?? []).filter((s: any) => s.status === 'pending').length, admitted: (c.slots ?? []).filter((s: any) => s.status === 'admitted').length, result: (c.slots ?? []).filter((s: any) => s.status === 'result').length }, evaluationCases: c.evaluationCaseIds?.length ?? 0, gradeCount: c.grades?.length ?? 0 }));
        return { businessId, jobId: jobId ?? null, definitions, candidates, comparisons: comparisons.map((c: any) => ({ ...c, outputsVisibleToOwner: true, gradeBoundary: 'Opaque external grade receipts are recorded; this service does not compute semantic grades.' })), stages, runtime: { status: 'requires_signed_operating_models_factory', reason: 'No plain signature or caller-supplied grant can dispatch. prepareComparison produces the exact unsigned packet binding; only the private OperatingModels factory can load and execute its signed replacement packet.' }, actions: ['define', 'observe', 'prepareDiagnosis', 'prepareComparison', 'intake', 'propose', 'practice', 'evaluate', 'grade', 'assignment'] };
    }
}
