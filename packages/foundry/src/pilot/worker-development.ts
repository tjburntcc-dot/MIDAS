import {FINALIZING_WORKER_PROCEDURE} from '../portfolio/worker.ts';
/**
 * Worker development is a prospective, job-scoped improvement loop.
 *
 * This module deliberately has no provider, credential, account, or fallback
 * implementation.  A caller may inject an already-authorized ModelPort (which
 * owns its own ledger admission); a fixture port proves only the mechanics.
 */
import { hash, requireThat } from '../contracts.ts';
import type { ModelPort, ModelRequest, ModelResult } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { Portfolio } from '../portfolio/core.ts';
import { ProcedureRegistry } from '../portfolio/learning.ts';
import type { ProcedureScope, ProcedureEvaluation, ProcedureAssessmentTrust, ProcedureAssessmentReceipt } from '../portfolio/learning.ts';
import { PilotKnowledge, pilotKnowledgeScope } from './knowledge.ts';
import { assertAuthorizedComparisonExecutor } from './worker-development-authorized.ts';

export type DevelopmentCause = 'missing_knowledge' | 'missing_tool' | 'missing_context' | 'missing_procedure';
export type DevelopmentObservationKind = 'owner_correction' | 'commercial_omission' | 'outcome_failure';
export type MaterialKind = 'existing_document' | 'public_source' | 'permitted_export' | 'media_transcript';
/** Runtime dispatch is intentionally unavailable until an OperatingModels-backed
 * signed-factory adapter binds these requests to an exact ledger admission. */
export type ComparisonMode = 'offline_fixture' | 'ledger_backed_runtime';
export type Partition = 'practice' | 'evaluation';

export type WorkerDefinition = {
    id: string;
    businessId: string;
    jobId: string;
    responsibilities: string[];
    model: { id: string; route: string; qualification: 'experimental_unqualified' | 'fixture_only' };
    tools: string[];
    evidenceAccess: { sourceIds: string[]; evidenceHash: string; access: 'permitted_worker_sources_only' };
    outputContract: { id: string; version: string; sha256: string; description: string };
    procedureScope: ProcedureScope;
    baselineProcedureId: string;
    selectedProcedureId: string;
    evaluationHistory: Array<{ comparisonId: string; decision: string; at: string }>;
    historyLimits: string[];
    limits: { externalActions: 'none'; providerAccess: 'injected_authorized_port_only'; known: string[] };
};

export type ImprovementObservation = {
    id?: string;
    kind: DevelopmentObservationKind;
    sourceId: string;
    quote: string;
    summary: string;
    consequence: string;
    assisted: boolean;
};

export type KnowledgeMaterial = {
    id: string;
    kind: MaterialKind;
    title: string;
    provenance: string;
    rights: 'reusable';
    /** Retained permitted knowledge, supplied locally; this module never retrieves it. */
    content: string;
    contentHash: string;
    sourceId?: string;
    withdrawnAt?: string | null;
};

export type PracticeCase = {
    id: string;
    partition: Partition;
    prompt: string;
    evidenceIds: string[];
    regression: boolean;
};

export type DevelopmentCandidate = {
    id: string;
    version: number;
    businessId: string;
    jobId: string;
    observationId: string;
    diagnosis: { cause: DevelopmentCause; rationale: string; alternativeExplanations: string[] };
    materialIds: string[];
    procedureId: string;
    baselineProcedureId: string;
    practiceCaseIds: string[];
    evaluationCaseIds: string[];
    status: 'candidate_prepared' | 'comparison_pending' | 'retained' | 'adopted' | 'rejected' | 'rolled_back' | 'stale';
    qualification: 'experimental_unqualified';
    createdAt: string;
};

export type CustodyGate = {
    claimedProtected: boolean;
    custody: 'not_claimed' | 'custodian_sealed';
    manifestHash: string | null;
    custodianId: string | null;
};

export type ComparisonAuthorization = {
    kind: 'worker-development-comparison-grant';
    approved: boolean;
    authorizationId: string;
    businessId: string;
    jobId: string;
    candidateId: string;
    baselineProcedureHash: string;
    candidateProcedureHash: string;
    model: string;
    toolHash: string;
    evidenceHash: string;
    resourcesHash: string;
    comparisonHash?: string;
    profileHash?: string;
    approvedBy?: string;
    approvalReference?: string;
    expiresAt: string;
    permitProvider: true;
};
/** A runtime executor can only be supplied by the OperatingModels-backed
 * factory.  It deliberately accepts an already-built request, never secrets. */
export type ComparisonRuntimeObservation = { status: 'result' | 'terminal_failed' | 'terminal_incomplete' | 'invalid_output' | 'unknown'; terminal?: any; terminalHash?: string | null; providerObservation?: any };
export type AuthorizedComparisonExecutor = { kind: 'operating-models-comparison-executor-v1'; trustedSignedFactory: true; executionProvenance?: 'fixture' | 'runtime'; execute(request: ModelRequest): Promise<ModelResult>; observe?(request: ModelRequest): ComparisonRuntimeObservation; assertRecovery?(request: ModelRequest): void; assertCurrent(): void; grantHash: string; ledgerScopeHash?: string };

export type ExternalGrade = {
    caseId: string;
    baselineAccepted: boolean;
    candidateAccepted: boolean;
    criticalCommercialOmission: boolean;
    baselineCorrectionSeconds: number | null;
    candidateCorrectionSeconds: number | null;
    assessor: string;
    independent: boolean;
    opaqueGradeHash: string;
};

const kind = { definition: 'pilot-worker-development-definition', observation: 'pilot-worker-development-observation', material: 'pilot-worker-development-material', candidate: 'pilot-worker-development-candidate', comparison: 'pilot-worker-development-comparison' };
const text = (x: unknown, code = 'WORKER_DEVELOPMENT_TEXT_REQUIRED', max = 12000) => requireThat(typeof x === 'string' && x.trim().length > 0 && x.length <= max, code);
const unique = (items: string[], code: string) => requireThat(items.length > 0 && new Set(items).size === items.length, code);
const at = () => new Date().toISOString();

/** Exact information a later live comparison grant must bind. It authorizes nothing itself. */
export function comparisonGrantRequirements(input: { businessId: string; jobId: string; candidateId: string; baselineProcedureHash: string; candidateProcedureHash: string; model: string; toolHash: string; evidenceHash: string; resourcesHash: string }) {
    return { kind: 'worker-development-comparison-grant', approved: false, ...input, expiresAt: null, permitProvider: false,
        requirements: ['signed exact candidate/baseline hashes', 'same model, tools, evidence and resources for both arms', 'separate evaluation partition', 'a ModelPort backed by the existing admission/ledger machinery', 'external grade receipt; claimed protected data requires a custodian-sealed manifest'],
        prohibition: 'No credential, account, provider fallback, count call, or spend is created by this request.' };
}

export class WorkerDevelopment {
    readonly store: StateStore;
    readonly knowledge: PilotKnowledge;
    readonly registry: ProcedureRegistry;
    constructor(store: StateStore, assessmentTrust?: ProcedureAssessmentTrust) { this.store = store; this.knowledge = new PilotKnowledge(store); this.registry = new ProcedureRegistry(store, assessmentTrust); }
    private rows(name: string) { return this.store.db.prepare('SELECT body,version FROM entities WHERE kind=? ORDER BY rowid').all(name).map((r: any) => ({ ...JSON.parse(String(r.body)), _version: Number(r.version) })); }
    private company(businessId: string) { return this.knowledge.company(businessId); }
    private source(businessId: string, sourceId: string) { const source = this.knowledge.selectedSources(businessId).find(s => s.id === sourceId); requireThat(source && source.permission === 'worker' && (!source.validUntil || Date.parse(source.validUntil) > Date.now()), 'WORKER_DEVELOPMENT_SOURCE_UNAVAILABLE'); return source; }
    private assertDefinitionSources(definition: WorkerDefinition) { definition.evidenceAccess.sourceIds.forEach(sourceId => this.source(definition.businessId, sourceId)); }
    private assertCandidateMaterials(candidate: DevelopmentCandidate) {
        const materials = candidate.materialIds.map(id => this.store.get(kind.material, id));
        requireThat(materials.every(m => m?.businessId === candidate.businessId && !m.withdrawnAt && hash(m.content) === m.contentHash), 'WORKER_DEVELOPMENT_MATERIAL_UNAVAILABLE');
        materials.forEach(m => { if (m.sourceId) this.source(candidate.businessId, m.sourceId); });
        return materials;
    }
    private definitionKey(businessId: string, jobId: string) { return 'worker-definition-' + hash({ businessId, jobId }).slice(0, 24); }
    definition(businessId: string, jobId: string, input: { responsibilities: string[]; model: string; tools: string[]; sourceIds: string[]; outputContract: { id: string; version: string; description: string }; knownLimits?: string[]; capability?: string; baselineProcedure?: string }): WorkerDefinition {
        this.company(businessId); text(jobId); unique(input.responsibilities, 'WORKER_RESPONSIBILITIES_REQUIRED'); unique(input.tools, 'WORKER_TOOLS_REQUIRED'); unique(input.sourceIds, 'WORKER_EVIDENCE_REQUIRED'); input.responsibilities.forEach(x => text(x)); input.tools.forEach(x => text(x)); input.sourceIds.forEach(id => this.source(businessId, id)); text(input.model); text(input.outputContract.id); text(input.outputContract.version); text(input.outputContract.description);
        const procedureScope = { capability: input.capability ?? 'pilot.' + jobId, population: 'business-' + businessId + '-job-' + jobId };
        const baselineProcedureId = 'worker-development-baseline-' + hash(procedureScope).slice(0, 20);
        const baseline = this.registry.baseline({ id: baselineProcedureId, scope: procedureScope, procedure: input.baselineProcedure ?? FINALIZING_WORKER_PROCEDURE + '\nAssigned job responsibilities: ' + input.responsibilities.join('; ') + '. Contract: ' + input.outputContract.description, strongBaselineReference: 'Excellent generalist baseline with identical authorized model route, tools, evidence, resources, and output contract.' });
        const selected = this.registry.selected(procedureScope, baseline.id);
        const value: WorkerDefinition = { id: this.definitionKey(businessId, jobId), businessId, jobId, responsibilities: [...input.responsibilities], model: { id: input.model, route: input.model, qualification: 'experimental_unqualified' }, tools: [...input.tools], evidenceAccess: { sourceIds: [...input.sourceIds], evidenceHash: hash(input.sourceIds.map(id => ({ id, sha256: this.source(businessId, id).sha256 }))), access: 'permitted_worker_sources_only' }, outputContract: { ...input.outputContract, sha256: hash(input.outputContract) }, procedureScope, baselineProcedureId: baseline.id, selectedProcedureId: selected.procedure.id, evaluationHistory: [], historyLimits: ['Only this business and job scope', 'No private evidence transfers across businesses', 'A candidate is not a specialist until supported evaluation adopts it'], limits: { externalActions: 'none', providerAccess: 'injected_authorized_port_only', known: input.knownLimits ?? ['Model quality, human correction time, cost, and customer usefulness are unknown until measured.'] } };
        const prior = this.store.get(kind.definition, value.id); if (prior) { const { _version, selectedProcedureId, evaluationHistory, ...priorValue } = prior; const { selectedProcedureId: proposedSelection, evaluationHistory: proposedHistory, ...definitionValue } = value; requireThat(hash(priorValue) === hash(definitionValue), 'WORKER_DEFINITION_IMMUTABLE'); return prior; }
        return this.store.transaction(() => { this.store.record(pilotKnowledgeScope(businessId), value.id, 'WorkerDefinition', value); return this.store.put(kind.definition, value.id, value, null); });
    }
    getDefinition(businessId: string, jobId: string) { const v = this.store.get(kind.definition, this.definitionKey(businessId, jobId)); requireThat(v, 'WORKER_DEFINITION_REQUIRED'); return v as WorkerDefinition & {_version:number}; }
    observe(businessId: string, jobId: string, input: ImprovementObservation) {
        this.getDefinition(businessId, jobId); const source = this.source(businessId, input.sourceId); text(input.quote, 'WORKER_DEVELOPMENT_QUOTE_REQUIRED', 4000); requireThat(source.text.includes(input.quote), 'WORKER_DEVELOPMENT_QUOTE_UNSOURCED'); text(input.summary); text(input.consequence); requireThat(typeof input.assisted === 'boolean', 'WORKER_DEVELOPMENT_ASSISTED_REQUIRED');
        const localId = input.id ?? 'worker-observation-' + hash({ businessId, jobId, input }).slice(0, 20), old = this.store.get(kind.observation, localId); if (old) return old;
        const portfolio = new Portfolio(this.store); if (!this.store.get('portfolio-venture', businessId)) { const c = this.company(businessId); portfolio.createVenture({ id: businessId, name: c.name, goal: c.goal, mode: c.mode === 'fixture' ? 'fixture' : 'local' }); }
        const observation = portfolio.recordObservation(businessId, { id: localId, kind: input.kind, summary: input.summary, source: input.sourceId, provenance: input.assisted ? 'assisted observed correction/omission; causal attribution remains unproven' : 'owner observed correction/omission; causal attribution remains unproven', metadata: { jobId, quote: input.quote, consequence: input.consequence, sourceHash: source.sha256, assisted: input.assisted }, reassess: false }).observation;
        const value = { id: localId, businessId, jobId, portfolioObservationId: observation.id, ...input, sourceHash: source.sha256, createdAt: at() };
        return this.store.transaction(() => { this.store.record(pilotKnowledgeScope(businessId), localId, 'WorkerDevelopmentObservation', value); return this.store.put(kind.observation, localId, value, null); });
    }
    material(businessId: string, input: KnowledgeMaterial) {
        this.company(businessId); text(input.id); text(input.title); text(input.provenance); text(input.content, 'WORKER_MATERIAL_CONTENT_REQUIRED'); requireThat(['existing_document', 'public_source', 'permitted_export', 'media_transcript'].includes(input.kind), 'WORKER_MATERIAL_KIND'); requireThat(input.rights === 'reusable' && input.contentHash === hash(input.content), 'WORKER_MATERIAL_PROVENANCE'); if (input.sourceId) this.source(businessId, input.sourceId);
        const value = { ...input, businessId, withdrawnAt: input.withdrawnAt ?? null, createdAt: at() }, old = this.store.get(kind.material, input.id); if (old) { const { _version, createdAt, ...oldValue } = old; const { createdAt: proposedAt, ...materialValue } = value; requireThat(hash(oldValue) === hash(materialValue), 'WORKER_MATERIAL_IMMUTABLE'); return old; }
        return this.store.transaction(() => { this.store.record(pilotKnowledgeScope(businessId), input.id, 'WorkerDevelopmentMaterial', value); return this.store.put(kind.material, input.id, value, null); });
    }
    candidate(businessId: string, jobId: string, input: { observationId: string; diagnosis: { cause: DevelopmentCause; rationale: string; alternativeExplanations: string[] }; materialIds: string[]; procedureAddition: string; practiceCases: PracticeCase[] }) {
        const definition = this.getDefinition(businessId, jobId), observation = this.store.get(kind.observation, input.observationId); requireThat(observation?.businessId === businessId && observation.jobId === jobId, 'WORKER_DEVELOPMENT_OBSERVATION_REQUIRED'); requireThat(['missing_knowledge', 'missing_tool', 'missing_context', 'missing_procedure'].includes(input.diagnosis.cause), 'WORKER_DEVELOPMENT_DIAGNOSIS_REQUIRED'); text(input.diagnosis.rationale); unique(input.diagnosis.alternativeExplanations, 'WORKER_DEVELOPMENT_ALTERNATIVES_REQUIRED'); input.diagnosis.alternativeExplanations.forEach(x => text(x)); unique(input.materialIds, 'WORKER_DEVELOPMENT_MATERIAL_REQUIRED'); const materials = input.materialIds.map(id => this.store.get(kind.material, id)); requireThat(materials.every(x => x?.businessId === businessId && !x.withdrawnAt), 'WORKER_DEVELOPMENT_MATERIAL_UNAVAILABLE'); text(input.procedureAddition); requireThat(input.practiceCases.length >= 3, 'WORKER_DEVELOPMENT_CASES_REQUIRED'); unique(input.practiceCases.map(x => x.id), 'WORKER_DEVELOPMENT_CASE_DUPLICATE'); const practice = input.practiceCases.filter(x => x.partition === 'practice'), evaluation = input.practiceCases.filter(x => x.partition === 'evaluation'); requireThat(practice.length >= 1 && evaluation.length >= 2 && evaluation.some(x => x.regression), 'WORKER_DEVELOPMENT_PARTITIONS_REQUIRED'); for (const c of input.practiceCases) { text(c.id); text(c.prompt); unique(c.evidenceIds, 'WORKER_DEVELOPMENT_CASE_EVIDENCE_REQUIRED'); requireThat(c.evidenceIds.every(id => definition.evidenceAccess.sourceIds.includes(id)), 'WORKER_DEVELOPMENT_CASE_EVIDENCE_SCOPE'); }
        const id = 'worker-candidate-' + hash({ businessId, jobId, observationId: input.observationId, diagnosis: input.diagnosis, materialIds: input.materialIds, procedureAddition: input.procedureAddition }).slice(0, 24), old = this.store.get(kind.candidate, id); if (old) return old;
        const candidateProcedure = this.registry.propose({ id: 'worker-procedure-' + hash(id).slice(0, 22), baselineId: definition.baselineProcedureId, scope: definition.procedureScope, procedure: this.store.get('portfolio-procedure', definition.baselineProcedureId).procedure + '\nCandidate mechanism: ' + input.procedureAddition, mechanism: 'Scoped response to a source-grounded observed need: ' + input.diagnosis.rationale, observationId: observation.portfolioObservationId, alternativeExplanation: input.diagnosis.alternativeExplanations.join(' | '), regressionRisk: 'The change can add cost, distract from the central job, or fail under a different business context.', rights: 'reusable' });
        const value: DevelopmentCandidate = { id, version: 1, businessId, jobId, observationId: input.observationId, diagnosis: structuredClone(input.diagnosis), materialIds: [...input.materialIds], procedureId: candidateProcedure.id, baselineProcedureId: definition.baselineProcedureId, practiceCaseIds: practice.map(x => x.id), evaluationCaseIds: evaluation.map(x => x.id), status: 'candidate_prepared', qualification: 'experimental_unqualified', createdAt: at() };
        return this.store.transaction(() => { this.store.record(pilotKnowledgeScope(businessId), id, 'WorkerDevelopmentCandidate', { ...value, cases: input.practiceCases, materialHashes: materials.map(m => m.contentHash) }); this.store.put('worker-development-cases', id, { items: input.practiceCases }, null); return this.store.put(kind.candidate, id, value, null); });
    }
    private loadCandidate(id: string) { const c = this.store.get(kind.candidate, id); requireThat(c, 'WORKER_DEVELOPMENT_CANDIDATE_REQUIRED'); return c as DevelopmentCandidate & {_version:number}; }
    /** Runs exact matched fixture requests through an injected ModelPort. It never falls back to a provider. */
    async runComparison(candidateId: string, input: { mode: ComparisonMode; modelPort: ModelPort; resources: { maxCostMinor: number; maxCalls: number; maxAttempts: number; maxHumanMinutes: number }; custody: CustodyGate; authorization?: ComparisonAuthorization; runtime?: AuthorizedComparisonExecutor }) {
        return this.runDurableComparison(candidateId, input);
    }
    /** Durable matched comparison. A record and each slot admission are written
     * before dispatch. An admitted slot without a durable result is uncertain:
     * recovery may read a provider-owned same-ID result, but this layer never
     * makes a second inference call for that slot. */
    private async runDurableComparison(candidateId: string, input: { mode: ComparisonMode; modelPort: ModelPort; resources: { maxCostMinor: number; maxCalls: number; maxAttempts: number; maxHumanMinutes: number }; custody: CustodyGate; authorization?: ComparisonAuthorization; runtime?: AuthorizedComparisonExecutor }) {
        const candidate=this.loadCandidate(candidateId), definition=this.getDefinition(candidate.businessId,candidate.jobId), cases=this.store.get('worker-development-cases',candidate.id)?.items as PracticeCase[];
        requireThat(Array.isArray(cases),'WORKER_DEVELOPMENT_CASES_MISSING'); this.assertDefinitionSources(definition);
        requireThat(input.modelPort&&typeof input.modelPort.run==='function','WORKER_DEVELOPMENT_MODEL_PORT_REQUIRED');
        const evaluations=cases.filter(c=>c.partition==='evaluation');
        requireThat(Number.isSafeInteger(input.resources.maxCostMinor)&&input.resources.maxCostMinor>=0&&Number.isSafeInteger(input.resources.maxCalls)&&input.resources.maxCalls===evaluations.length*2&&Number.isSafeInteger(input.resources.maxAttempts)&&input.resources.maxAttempts===1&&Number.isSafeInteger(input.resources.maxHumanMinutes)&&input.resources.maxHumanMinutes>=0,'WORKER_DEVELOPMENT_EXACT_CALL_LIMIT_REQUIRED');
        requireThat(input.custody&&typeof input.custody.claimedProtected==='boolean','WORKER_DEVELOPMENT_CUSTODY_REQUIRED');
        if(input.custody.claimedProtected){requireThat(input.custody.custody==='custodian_sealed'&&!!input.custody.manifestHash&&!!input.custody.custodianId,'WORKER_DEVELOPMENT_PROTECTED_CUSTODY_REQUIRED');requireThat(false,'WORKER_DEVELOPMENT_PROTECTED_CUSTODY_UNAVAILABLE');}
        else requireThat(input.custody.custody==='not_claimed'&&!input.custody.manifestHash&&!input.custody.custodianId,'WORKER_DEVELOPMENT_CUSTODY_CLAIM_INVALID');
        const baseline=this.store.get('portfolio-procedure',candidate.baselineProcedureId), proposed=this.store.get('portfolio-procedure',candidate.procedureId), materials=this.assertCandidateMaterials(candidate);
        requireThat(baseline&&proposed&&materials.every(m=>m?.businessId===candidate.businessId&&!m.withdrawnAt),'WORKER_DEVELOPMENT_MATERIAL_UNAVAILABLE');
        const sources=definition.evidenceAccess.sourceIds.map(id=>this.source(candidate.businessId,id));
        const resourcesHash=hash(input.resources), evidenceHash=hash({sources:sources.map(s=>({id:s.id,sha256:s.sha256})),materials:materials.map(m=>({id:m.id,contentHash:m.contentHash}))}), hashes={baseline:hash(baseline.procedure),candidate:hash(proposed.procedure),tools:hash(definition.tools),evidence:evidenceHash,resources:resourcesHash};
        const authorization=input.authorization;
        if(input.mode==='offline_fixture')requireThat(input.modelPort.kind==='fixture'&&!authorization&&!input.runtime,'WORKER_DEVELOPMENT_FIXTURE_ONLY');
        else {const profileHash=hash({responsibilities:definition.responsibilities,tools:definition.tools,outputContract:definition.outputContract});requireThat(input.runtime?.kind==='operating-models-comparison-executor-v1'&&authorization?.approved===true&&authorization.permitProvider===true,'WORKER_DEVELOPMENT_LEDGER_FACTORY_REQUIRED');requireThat(authorization.businessId===candidate.businessId&&authorization.jobId===candidate.jobId&&authorization.candidateId===candidate.id&&authorization.baselineProcedureHash===hashes.baseline&&authorization.candidateProcedureHash===hashes.candidate&&authorization.model===definition.model.route&&authorization.toolHash===hashes.tools&&authorization.evidenceHash===hashes.evidence&&authorization.resourcesHash===hashes.resources&&authorization.profileHash===profileHash&&typeof authorization.approvedBy==='string'&&authorization.approvedBy.trim().length>0&&typeof authorization.approvalReference==='string'&&authorization.approvalReference.trim().length>0&&Date.parse(authorization.expiresAt)>Date.now(),'WORKER_DEVELOPMENT_GRANT_BINDING');assertAuthorizedComparisonExecutor(input.runtime,{authorizationId:authorization.authorizationId,businessId:candidate.businessId,jobId:candidate.jobId,candidateId:candidate.id,baselineProcedureHash:hashes.baseline,candidateProcedureHash:hashes.candidate,model:definition.model.route,toolHash:hashes.tools,evidenceHash:hashes.evidence,resourcesHash:hashes.resources,evaluationCaseIds:evaluations.map(c=>c.id),profileHash},this.store);input.runtime.assertCurrent();}
        const id='worker-comparison-'+hash({candidateId,mode:input.mode,hashes,evaluations:evaluations.map(c=>c.id)}).slice(0,24), existing=this.store.get(kind.comparison,id);
        const slots=evaluations.flatMap(c=>['baseline','candidate'].map(arm=>({id:arm+'-'+c.id,caseId:c.id,arm,status:'pending',requestHash:null,request:null,result:null,admittedAt:null,resultAt:null})));
        let comparison:any=existing;
        if(!comparison){comparison={id,candidateId,businessId:candidate.businessId,jobId:candidate.jobId,grantHash:input.mode==='ledger_backed_runtime'?input.runtime!.grantHash:null,status:'running',mode:input.mode,provenance:input.mode==='offline_fixture'?'fixture':'operating_models_authorized',executionProvenance:input.mode==='offline_fixture'?'fixture':input.runtime!.executionProvenance??'unknown',conditions:{model:definition.model.route,baselineInstructionsHash:hashes.baseline,candidateInstructionsHash:hashes.candidate,toolsHash:hashes.tools,evidenceHash:hashes.evidence,resourcesHash:hashes.resources},custody:structuredClone(input.custody),evaluationCaseIds:evaluations.map(c=>c.id),slots,arms:[],grades:[],decision:'retain_baseline_pending_grade',createdAt:at()};this.store.transaction(()=>this.store.put(kind.comparison,id,comparison,null));}
        if(input.mode==='ledger_backed_runtime')requireThat(comparison.grantHash===input.runtime!.grantHash,'WORKER_DEVELOPMENT_GRANT_BINDING');
        if(comparison.status==='awaiting_external_grade'||comparison.status==='graded')return comparison;
        requireThat(comparison.status==='running'&&hash(comparison.conditions)===hash({model:definition.model.route,baselineInstructionsHash:hashes.baseline,candidateInstructionsHash:hashes.candidate,toolsHash:hashes.tools,evidenceHash:hashes.evidence,resourcesHash:hashes.resources}),'WORKER_DEVELOPMENT_COMPARISON_CHANGED');
        const preserve=(slotId:string,request:ModelRequest,error:unknown)=>{const observed=input.runtime!.observe?.(request)??{status:'unknown' as const};this.store.transaction(()=>{const fresh=this.store.get(kind.comparison,id),slot=fresh.slots.find((x:any)=>x.id===slotId);requireThat(slot?.status==='admitted'&&slot.requestHash===hash(request),'WORKER_DEVELOPMENT_SLOT_CHANGED');if(observed.status!=='unknown'){slot.status=observed.status;slot.terminal={status:observed.status,terminal:observed.terminal??null,terminalHash:observed.terminalHash??null,providerObservation:observed.providerObservation??null,error:String((error as Error).message)};slot.terminalAt=at();}this.store.put(kind.comparison,id,fresh,fresh._version);});};
        const complete=(slotId:string,request:ModelRequest,result:ModelResult,provenance:string)=>this.store.transaction(()=>{const fresh=this.store.get(kind.comparison,id),slot=fresh.slots.find((x:any)=>x.id===slotId);requireThat(slot?.status==='admitted'&&slot.requestHash===hash(request),'WORKER_DEVELOPMENT_SLOT_CHANGED');slot.status='result';slot.result={requestHash:hash(request),output:result.output,outputHash:hash(result.output),route:result.route,usage:result.usage,metadata:result.metadata??null,provenance};slot.resultAt=at();this.store.put(kind.comparison,id,fresh,fresh._version);});
        for(const slot of comparison.slots){
            if(slot.status==='result')continue;
            if(['terminal_failed','terminal_incomplete','invalid_output'].includes(slot.status))throw new Error(slot.status==='terminal_incomplete'?'MODEL_RESPONSE_INCOMPLETE':slot.status==='terminal_failed'?'MODEL_RESPONSE_FAILED':'WORKER_DEVELOPMENT_INVALID_OUTPUT');
            if(slot.status==='admitted'){
                requireThat(input.mode==='ledger_backed_runtime'&&slot.grantHash===input.runtime!.grantHash&&slot.request&&hash(slot.request)===slot.requestHash,'WORKER_DEVELOPMENT_UNCERTAIN_NO_RESUBMIT');input.runtime!.assertRecovery?.(slot.request);
                try {const recovered=await input.runtime!.execute(slot.request);requireThat(recovered&&recovered.route?.model===definition.model.route&&Object.hasOwn(recovered,'output'),'WORKER_DEVELOPMENT_RETURNED_ROUTE_MISMATCH');complete(slot.id,slot.request,recovered,'operating_models_authorized_recovery');comparison=this.store.get(kind.comparison,id);continue;}catch(error){preserve(slot.id,slot.request,error);throw error;}
            }
            requireThat(slot.status==='pending','WORKER_DEVELOPMENT_UNCERTAIN_NO_RESUBMIT');
            const c=evaluations.find(x=>x.id===slot.caseId)!, procedure=slot.arm==='baseline'?baseline:proposed, selectedSources=c.evidenceIds.map(sourceId=>this.source(candidate.businessId,sourceId));
            const request:ModelRequest={scope:pilotKnowledgeScope(candidate.businessId),requestId:'worker-dev-'+hash({id,slot:slot.id}).slice(0,24),role:{id:'worker-development-'+candidate.jobId,version:procedure.definitionHash,procedure:procedure.procedure,competencies:[...definition.responsibilities],tools:[...definition.tools],predecessor:null,model:definition.model.route,qualification:input.mode==='offline_fixture'?'fixture_only':'experimental_unqualified'},task:'decide',context:{job:{id:candidate.jobId,responsibilities:definition.responsibilities},prompt:c.prompt,evidence:selectedSources.map(s=>({title:s.title,text:s.text,sha256:s.sha256})),materials:materials.map(m=>({title:m.title,kind:m.kind,content:m.content,contentHash:m.contentHash,provenance:m.provenance})),outputContract:definition.outputContract,responseEnvelope:{requiredProperty:'output',purpose:'Retain an opaque comparison response for external grading.'}},limits:{maxCost:{minorUnits:input.resources.maxCostMinor,currency:'USD'},maxAttempts:1,maxHumanMinutes:input.resources.maxHumanMinutes},tools:definition.tools.map(name=>({name}))};
            this.store.transaction(()=>{const fresh=this.store.get(kind.comparison,id),target=fresh.slots.find((x:any)=>x.id===slot.id);requireThat(target?.status==='pending','WORKER_DEVELOPMENT_SLOT_CONFLICT');target.status='admitted';target.grantHash=input.mode==='ledger_backed_runtime'?input.runtime!.grantHash:null;target.requestHash=hash(request);target.request=structuredClone(request);target.admittedAt=at();this.store.put(kind.comparison,id,fresh,fresh._version);});
            try {const result=input.mode==='offline_fixture'?await input.modelPort.run(request):await input.runtime!.execute(request);requireThat(result&&result.route?.model===definition.model.route&&Object.hasOwn(result,'output'),'WORKER_DEVELOPMENT_RETURNED_ROUTE_MISMATCH');complete(slot.id,request,result,input.mode==='offline_fixture'?'strict_fixture_model_port':'operating_models_authorized');comparison=this.store.get(kind.comparison,id);}catch(error){if(input.mode==='ledger_backed_runtime')preserve(slot.id,request,error);throw error;}
        }
        comparison=this.store.get(kind.comparison,id);const arms=evaluations.map(c=>({caseId:c.id,baseline:comparison.slots.find((s:any)=>s.caseId===c.id&&s.arm==='baseline').result,candidate:comparison.slots.find((s:any)=>s.caseId===c.id&&s.arm==='candidate').result}));const done={...comparison,status:'awaiting_external_grade',arms,completedAt:at()};return this.store.transaction(()=>{this.store.put(kind.comparison,id,done,comparison._version);const prior=this.loadCandidate(candidateId);this.store.put(kind.candidate,candidateId,{...prior,status:'comparison_pending'},prior._version);return done;});
    }
    private comparisonEvaluation(comparison: any, grades: ExternalGrade[], assessment?: ProcedureAssessmentReceipt): ProcedureEvaluation {
        const candidate = this.loadCandidate(comparison.candidateId), definition = this.getDefinition(candidate.businessId, candidate.jobId), baseline = this.store.get('portfolio-procedure', candidate.baselineProcedureId);
        const cases: PracticeCase[] = this.store.get('worker-development-cases', candidate.id).items;
        const condition = (instructionsHash: string) => ({ model: comparison.conditions.model, instructionsHash, toolsHash: comparison.conditions.toolsHash, evidenceHash: comparison.conditions.evidenceHash, resourcesHash: comparison.conditions.resourcesHash });
        const observedOutputs = comparison.arms.map((arm: any) => ({ caseId: arm.caseId, baseline: { sha256: arm.baseline.outputHash, producerId: comparison.slots.find((s: any) => s.caseId === arm.caseId && s.arm === 'baseline')?.request?.role?.id ?? '' }, candidate: { sha256: arm.candidate.outputHash, producerId: comparison.slots.find((s: any) => s.caseId === arm.caseId && s.arm === 'candidate')?.request?.role?.id ?? '' } }));
        return { id: comparison.id, scope: definition.procedureScope, provenance: comparison.executionProvenance === 'runtime' ? 'runtime' : 'fixture', baseline: condition(comparison.conditions.baselineInstructionsHash), candidate: condition(comparison.conditions.candidateInstructionsHash), strongBaselineReference: baseline.strongBaselineReference, resultEvidence: 'opaque external grade receipts: ' + grades.map(g => g.opaqueGradeHash).join(','), semanticReview: null, cases: grades.map(g => ({ id: g.caseId, fresh: true, regression: cases.find(c => c.id === g.caseId)?.regression === true, baselinePassed: g.baselineAccepted, candidatePassed: g.candidateAccepted, criticalError: g.criticalCommercialOmission, baselineCorrectionSeconds: g.baselineCorrectionSeconds, candidateCorrectionSeconds: g.candidateCorrectionSeconds })), observedOutputs, ...(assessment ? { assessment } : {}) };
    }
    /** Export only the binding an independent assessor must sign; no assessor or
     * private signing key is created. The trusted controller configures its key. */
    assessmentRequest(comparisonId: string, grades: ExternalGrade[]) {
        const comparison = this.store.get(kind.comparison, comparisonId); requireThat(comparison?.status === 'awaiting_external_grade', 'WORKER_DEVELOPMENT_COMPARISON_GRADE_REQUIRED');
        const candidate = this.loadCandidate(comparison.candidateId), binding = this.registry.assessmentBinding(candidate.procedureId, this.comparisonEvaluation(comparison, grades));
        return { comparisonId, binding, bindingHash: hash(binding), status: 'awaiting_independent_assessor', qualification: 'Preparation only; no assessment or adoption' };
    }
    /** Opaque grade claims can retain/reject. Adoption additionally requires a
     * signed receipt from the separately configured independent assessor. */
    gradeComparison(comparisonId: string, grades: ExternalGrade[], assessment?: ProcedureAssessmentReceipt) {
        const comparison = this.store.get(kind.comparison, comparisonId);
        if (comparison?.status === 'graded') { requireThat(hash(comparison.grades) === hash(grades) && hash(comparison.assessmentReceipt ?? null) === hash(assessment ?? null), 'WORKER_DEVELOPMENT_GRADE_CONFLICT'); return comparison; }
        requireThat(comparison?.status === 'awaiting_external_grade', 'WORKER_DEVELOPMENT_COMPARISON_GRADE_REQUIRED'); unique(grades.map(x => x.caseId), 'WORKER_DEVELOPMENT_GRADE_DUPLICATE'); requireThat(grades.length === comparison.evaluationCaseIds.length && grades.every(x => comparison.evaluationCaseIds.includes(x.caseId) && /^[a-f0-9]{64}$/.test(x.opaqueGradeHash) && typeof x.assessor === 'string' && x.assessor.length > 0 && typeof x.independent === 'boolean' && typeof x.baselineAccepted === 'boolean' && typeof x.candidateAccepted === 'boolean' && typeof x.criticalCommercialOmission === 'boolean' && [x.baselineCorrectionSeconds, x.candidateCorrectionSeconds].every(n => n === null || (Number.isFinite(n) && n >= 0))), 'WORKER_DEVELOPMENT_GRADE_INVALID');
        const candidate = this.loadCandidate(comparison.candidateId), definition = this.getDefinition(candidate.businessId, candidate.jobId), baseline = this.store.get('portfolio-procedure', candidate.baselineProcedureId), procedure = this.store.get('portfolio-procedure', candidate.procedureId);
        // The old route label describes authorization, not whether a model ran.
        // Preserve it on the comparison; unknown historical execution stays unqualified.
        const evaluationProvenance = comparison.executionProvenance === 'runtime' ? 'runtime' : 'fixture';
        const evaluation = this.registry.evaluate(candidate.procedureId, this.comparisonEvaluation(comparison, grades, assessment));
        const critical = grades.some(g => g.criticalCommercialOmission); const decision = critical ? 'reject_candidate_critical_commercial_omission' : evaluation.analysis.eligible ? 'adopt_candidate' : 'retain_baseline'; let adoption: any = null; if (decision === 'adopt_candidate') adoption = this.registry.adopt(candidate.procedureId, evaluation.id, definition.procedureScope, 'Matched externally graded improvement for this exact business and job.');
        const next = { ...comparison, grades: structuredClone(grades), assessorClaims: grades.map(g=>({caseId:g.caseId,assessor:g.assessor,claimedIndependent:g.independent,opaqueGradeHash:g.opaqueGradeHash})), assessmentReceipt: assessment ?? null, verifiedAssessor: evaluation.analysis.assessment?.verified ? evaluation.analysis.assessment : null, evaluationProvenance, executionProvenance: comparison.executionProvenance ?? (comparison.provenance === 'fixture' ? 'fixture' : 'unknown'), evaluationId: evaluation.id, evaluationAnalysis: evaluation.analysis, decision, status: 'graded', qualification: adoption ? adoption.qualification : 'unqualified; retain the excellent generalist baseline', gradedAt: at() };
        return this.store.transaction(() => { this.store.put(kind.comparison, comparisonId, next, comparison._version); const prior = this.loadCandidate(candidate.id); this.store.put(kind.candidate, candidate.id, { ...prior, status: adoption ? 'adopted' : critical ? 'rejected' : 'retained' }, prior._version); const current = this.getDefinition(candidate.businessId, candidate.jobId); const selection = this.registry.selected(definition.procedureScope, definition.baselineProcedureId); this.store.put(kind.definition, current.id, { ...current, selectedProcedureId: selection.procedure.id, evaluationHistory: [...current.evaluationHistory, { comparisonId, decision, at: next.gradedAt }] }, current._version); return next; });
    }
    /** Freeze the candidate's declared fit, not an assertion that it improves work. */
    applicabilityPolicy(candidateId: string, input: { requiredConditions: string[]; excludedConditions: string[]; rationale: string }) {
        const candidate = this.loadCandidate(candidateId); text(input.rationale);
        unique(input.requiredConditions, 'WORKER_DEVELOPMENT_APPLICABILITY_REQUIRED');
        requireThat(Array.isArray(input.excludedConditions) && input.excludedConditions.length > 0 && new Set(input.excludedConditions).size === input.excludedConditions.length, 'WORKER_DEVELOPMENT_COUNTEREXAMPLE_REQUIRED');
        [...input.requiredConditions, ...input.excludedConditions].forEach(c => text(c));
        requireThat(!input.requiredConditions.some(c => input.excludedConditions.includes(c)), 'WORKER_DEVELOPMENT_APPLICABILITY_CONFLICT');
        const value = { candidateId, businessId: candidate.businessId, jobId: candidate.jobId, ...structuredClone(input), policyHash: hash(input), qualification: 'declared conditions; no demonstrated transfer' };
        return this.store.transaction(() => {
            const prior = this.store.get('worker-development-applicability-policy', candidateId);
            if (prior) { requireThat(prior.policyHash === value.policyHash, 'WORKER_DEVELOPMENT_APPLICABILITY_IMMUTABLE'); return prior; }
            this.store.record(pilotKnowledgeScope(candidate.businessId), candidateId + '-fit', 'WorkerDevelopmentApplicabilityPolicy', value);
            return this.store.put('worker-development-applicability-policy', candidateId, value, null);
        });
    }
    /** Conditions come from persisted observations. Their interpretation/provenance
     * remains visible; a fit decision never certifies a candidate or grants tools. */
    assessApplicability(candidateId: string, input: { id: string; businessId: string; jobId: string; observationIds: string[] }) {
        const candidate = this.loadCandidate(candidateId); text(input.id);
        requireThat(candidate.businessId === input.businessId, 'WORKER_DEVELOPMENT_TRANSFER_PERMISSION_REQUIRED');
        const policy = this.store.get('worker-development-applicability-policy', candidateId);
        requireThat(policy, 'WORKER_DEVELOPMENT_APPLICABILITY_REQUIRED'); unique(input.observationIds, 'WORKER_DEVELOPMENT_OBSERVATION_REQUIRED');
        const observations = input.observationIds.map(id => this.store.get('portfolio-observation', id));
        requireThat(observations.every(o => o?.ventureId === input.businessId), 'WORKER_DEVELOPMENT_OBSERVATION_SCOPE');
        const conditions = new Set(observations.flatMap(o => Array.isArray(o.metadata?.conditions) ? o.metadata.conditions.filter((x: unknown) => typeof x === 'string') : []));
        const reasons: string[] = [];
        if (candidate.jobId !== input.jobId) reasons.push('different_job_requires_fresh_fit_evaluation');
        if (['stale', 'rolled_back', 'rejected'].includes(candidate.status)) reasons.push('candidate_unavailable');
        for (const condition of policy.requiredConditions) if (!conditions.has(condition)) reasons.push('missing_condition:' + condition);
        for (const condition of policy.excludedConditions) if (conditions.has(condition)) reasons.push('counterexample:' + condition);
        try { this.assertDefinitionSources(this.getDefinition(candidate.businessId, candidate.jobId)); this.assertCandidateMaterials(candidate); }
        catch (error) { if (!/WORKER_DEVELOPMENT_(SOURCE|MATERIAL)_UNAVAILABLE/.test(String(error))) throw error; reasons.push('source_or_material_unavailable'); }
        const value = { id: input.id, candidateId, businessId: candidate.businessId, jobId: input.jobId, policyHash: policy.policyHash, observationIds: [...input.observationIds], evidence: observations.map(o => ({ id: o.id, digest: o.digest, provenance: o.provenance })), decision: reasons.length ? 'do_not_reuse' : 'applicable_for_evaluation', reasons, qualification: 'unqualified; applicability is not improvement or adoption', createdAt: at() };
        return this.store.transaction(() => {
            const key = candidateId + '/' + input.id, requestHash = hash(input), prior = this.store.get('worker-development-applicability', key);
            if (prior) { requireThat(prior.requestHash === requestHash, 'WORKER_DEVELOPMENT_APPLICABILITY_ID_CONFLICT'); return prior; }
            this.store.record(pilotKnowledgeScope(candidate.businessId), 'fit-' + hash(key).slice(0, 24), 'WorkerDevelopmentApplicability', value);
            return this.store.put('worker-development-applicability', key, { ...value, requestHash }, null);
        });
    }
    /** Consume an already-observed result for the exact pinned procedure. Success
     * adds one observation; failure restores the stronger baseline for future work.
     * This is an owner/controller API, not a worker-authored grade endpoint. */
    monitorOutcome(candidateId: string, observationId: string) {
        const candidate = this.loadCandidate(candidateId), definition = this.getDefinition(candidate.businessId, candidate.jobId);
        const observation = this.store.get('portfolio-observation', observationId), outcome = observation?.metadata?.workerDevelopmentOutcome;
        requireThat(observation?.ventureId === candidate.businessId && outcome?.candidateId === candidateId && typeof outcome.taskId === 'string' && typeof outcome.passed === 'boolean' && typeof outcome.criticalError === 'boolean' && ['fixture', 'runtime'].includes(outcome.provenance), 'WORKER_DEVELOPMENT_MONITOR_EVIDENCE_REQUIRED');
        const procedure = this.store.get('portfolio-procedure', candidate.procedureId), execution = this.store.get('portfolio-execution', outcome.taskId);
        requireThat(execution?.ventureId === candidate.businessId && execution.procedureHash === hash(procedure.procedure) && outcome.procedureHash === execution.procedureHash, 'WORKER_DEVELOPMENT_MONITOR_PROCEDURE_MISMATCH');
        requireThat(outcome.provenance !== 'runtime' || execution.modelProvenance === 'actual_model', 'WORKER_DEVELOPMENT_MONITOR_PROVENANCE');
        requireThat(outcome.provenance !== 'fixture' || this.company(candidate.businessId).mode === 'fixture', 'WORKER_DEVELOPMENT_MONITOR_PROVENANCE');
        const key = candidateId + '/' + observationId, prior = this.store.get('worker-development-monitor', key);
        if (prior) { requireThat(prior.observationHash === observation.digest, 'WORKER_DEVELOPMENT_MONITOR_EVIDENCE_CHANGED'); return prior; }
        const selected = this.registry.selected(definition.procedureScope, definition.baselineProcedureId), failed = !outcome.passed || outcome.criticalError, rollbackId = 'monitor-' + hash(key).slice(0, 24);
        // Registry rollback owns its transaction. Its durable request makes a crash
        // before the monitoring record recoverable without a second selection change.
        const priorRollback = this.store.get('portfolio-procedure-rollback', hash(definition.procedureScope) + '/' + rollbackId);
        let rollback: any = priorRollback?.selection ?? null;
        if (priorRollback) requireThat(priorRollback.input.observationId === observationId, 'WORKER_DEVELOPMENT_MONITOR_EVIDENCE_CHANGED');
        if (!rollback && failed && selected.adoption?.candidateId === candidate.procedureId) rollback = this.registry.rollback(definition.procedureScope, { id: rollbackId, expectedVersion: selected.adoption.version, reason: 'An observed failure of the selected procedure requires the strong baseline while the cause is investigated.', observationId, target: { kind: 'baseline', baselineId: definition.baselineProcedureId } });
        return this.store.transaction(() => {
            const selection = this.registry.selected(definition.procedureScope, definition.baselineProcedureId), decision = rollback ? 'rollback_to_baseline' : failed ? 'reject_candidate_observed_failure' : 'retain_observation_without_promotion';
            const value = { candidateId, businessId: candidate.businessId, jobId: candidate.jobId, observationId, observationHash: observation.digest, outcome, decision, rollback, futureProcedureId: selection.procedure.id, qualification: 'one observed outcome; no general improvement claim', createdAt: at() };
            this.store.record(pilotKnowledgeScope(candidate.businessId), 'monitor-' + hash(key).slice(0, 24), 'WorkerDevelopmentMonitoringDecision', value);
            const saved = this.store.put('worker-development-monitor', key, value, null);
            if (failed) { const current = this.loadCandidate(candidateId); this.store.put(kind.candidate, candidateId, { ...current, status: rollback ? 'rolled_back' : 'rejected' }, current._version); }
            const current = this.getDefinition(candidate.businessId, candidate.jobId);
            this.store.put(kind.definition, current.id, { ...current, selectedProcedureId: selection.procedure.id, evaluationHistory: [...current.evaluationHistory, { comparisonId: 'monitor:' + observationId, decision, at: value.createdAt }] }, current._version);
            return saved;
        });
    }
    /** Source withdrawal or stale evidence changes future assignment only and restores the baseline when adopted. */
    staleEvidence(candidateId: string, input: { materialId: string; reason: string }) {
        const candidate = this.loadCandidate(candidateId), material = this.store.get(kind.material, input.materialId); requireThat(material?.businessId === candidate.businessId && candidate.materialIds.includes(input.materialId), 'WORKER_DEVELOPMENT_MATERIAL_REQUIRED'); text(input.reason); const definition = this.getDefinition(candidate.businessId, candidate.jobId); const portfolio = new Portfolio(this.store), observation = portfolio.recordObservation(candidate.businessId, { kind: 'source-withdrawal', summary: input.reason, source: input.materialId, provenance: 'source withdrawal/staleness recorded; future worker assignment must not silently use it', metadata: { candidateId, materialHash: material.contentHash }, reassess: false }).observation; const selected = this.registry.selected(definition.procedureScope, definition.baselineProcedureId); let rollback: any = null; if (selected.adoption?.candidateId === candidate.procedureId) rollback = this.registry.rollback(definition.procedureScope, { id: 'stale-' + hash({ candidateId, materialId: input.materialId, reason: input.reason }).slice(0, 20), expectedVersion: selected.adoption.version, reason: input.reason, observationId: observation.id, target: { kind: 'baseline', baselineId: definition.baselineProcedureId } });
        return this.store.transaction(() => { this.store.put(kind.material, material.id, { ...material, withdrawnAt: at() }, material._version); const prior = this.loadCandidate(candidateId); this.store.put(kind.candidate, candidateId, { ...prior, status: rollback ? 'rolled_back' : 'stale' }, prior._version); const current = this.getDefinition(candidate.businessId, candidate.jobId), selection = this.registry.selected(definition.procedureScope, definition.baselineProcedureId); this.store.put(kind.definition, current.id, { ...current, selectedProcedureId: selection.procedure.id, evaluationHistory: [...current.evaluationHistory, { comparisonId: 'stale:' + input.materialId, decision: rollback ? 'rollback_to_baseline' : 'stale_candidate_retained_baseline', at: at() }] }, current._version); return { candidateId, materialId: input.materialId, rollback, futureProcedureId: selection.procedure.id, status: rollback ? 'rolled_back' : 'stale' }; });
    }
}
