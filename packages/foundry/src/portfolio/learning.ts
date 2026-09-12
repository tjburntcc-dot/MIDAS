import { StateStore } from '../state.ts';
import { hash, identifier, requireThat } from '../contracts.ts';
import { portfolioScope, text, unique } from './contracts.ts';

export type ProcedureScope = { capability: string; population: string };
export type EvaluationCase = { id: string; fresh: boolean; regression: boolean; baselinePassed: boolean; candidatePassed: boolean; criticalError: boolean; baselineCorrectionSeconds: number | null; candidateCorrectionSeconds: number | null };
export type ProcedureEvaluation = {
    id: string; scope: ProcedureScope; cases: EvaluationCase[]; provenance: 'fixture' | 'runtime' | 'independent';
    baseline: { model: string; instructionsHash: string; toolsHash: string; evidenceHash: string; resourcesHash: string };
    candidate: { model: string; instructionsHash: string; toolsHash: string; evidenceHash: string; resourcesHash: string };
    strongBaselineReference: string; resultEvidence: string; semanticReview: { accepted: boolean; reviewer: string; independent: boolean } | null;
};
export type ProcedureRollback = { id: string; expectedVersion: number; reason: string; observationId: string; target: { kind: 'baseline'; baselineId: string } | { kind: 'adoption'; version: number } };
/** Applies only demonstrated, explicit job-fit evidence; fixtures never qualify adoption. */
export class ProcedureRegistry {
    readonly store: StateStore;
    constructor(store: StateStore) { this.store = store; }
    private get(id: string) { const p = this.store.get('portfolio-procedure', id); requireThat(p, 'PROCEDURE_NOT_FOUND'); return p; }
    baseline(input: { id: string; scope: ProcedureScope; procedure: string; strongBaselineReference: string }) { identifier(input.id); text(input.scope.capability); text(input.scope.population); text(input.procedure); text(input.strongBaselineReference); return this.store.transaction(() => { const old = this.store.get('portfolio-procedure', input.id); if (old) { requireThat(old.definitionHash === hash(input), 'PROCEDURE_IMMUTABLE'); return old; } const value = { ...input, definitionHash: hash(input), kind: 'baseline', version: 1, status: 'baseline', createdAt: new Date().toISOString() }; this.store.record(portfolioScope(), 'procedure-' + input.id, 'PortfolioProcedure', value); return this.store.put('portfolio-procedure', input.id, value, null); }); }
    propose(input: { id: string; baselineId: string; scope: ProcedureScope; procedure: string; mechanism: string; observationId: string; alternativeExplanation: string; regressionRisk: string; rights: 'reusable' }) {
        identifier(input.id); for (const x of [input.procedure, input.mechanism, input.observationId, input.alternativeExplanation, input.regressionRisk, input.scope.capability, input.scope.population]) text(x); requireThat(input.rights === 'reusable', 'PROCEDURE_REUSE_RIGHTS_REQUIRED');
        const baseline = this.get(input.baselineId); requireThat(baseline.kind === 'baseline', 'STRONG_BASELINE_REQUIRED'); requireThat(input.procedure !== baseline.procedure, 'PROCEDURE_UNCHANGED'); requireThat(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(input.procedure), 'PRIVATE_CONTACT_IN_PROCEDURE');
        const observation = this.store.get('portfolio-observation', input.observationId); requireThat(observation, 'PROCEDURE_OBSERVATION_REQUIRED');
        return this.store.transaction(() => { const value = { ...input, definitionHash: hash(input), kind: 'candidate', version: 1, status: 'experimental_unqualified', baselineHash: baseline.definitionHash, sourceObservationHash: observation.digest, createdAt: new Date().toISOString() }; const old = this.store.get('portfolio-procedure', input.id); if (old) { requireThat(old.definitionHash === value.definitionHash, 'PROCEDURE_IMMUTABLE'); return old; } this.store.record(portfolioScope(), 'procedure-' + input.id, 'PortfolioProcedureCandidate', value); return this.store.put('portfolio-procedure', input.id, value, null); });
    }
    evaluate(candidateId: string, input: ProcedureEvaluation) {
        identifier(input.id); const candidate = this.get(candidateId), baseline = this.get(candidate.baselineId); requireThat(candidate.kind === 'candidate', 'PROCEDURE_CANDIDATE_REQUIRED'); requireThat(candidate.baselineHash === baseline.definitionHash, 'PROCEDURE_BASELINE_CHANGED');
        text(input.scope.capability); text(input.scope.population); text(input.strongBaselineReference); text(input.resultEvidence); requireThat(['fixture', 'runtime', 'independent'].includes(input.provenance), 'EVALUATION_PROVENANCE');
        requireThat(input.cases.length >= 2, 'EVALUATION_CASES_REQUIRED'); unique(input.cases.map(c => c.id));
        for (const c of input.cases) { identifier(c.id); for (const field of ['fresh', 'regression', 'baselinePassed', 'candidatePassed', 'criticalError'] as const) requireThat(typeof c[field] === 'boolean', 'EVALUATION_CASE_INVALID'); for (const value of [c.baselineCorrectionSeconds, c.candidateCorrectionSeconds]) requireThat(value === null || (Number.isFinite(value) && value >= 0), 'CORRECTION_TIME_INVALID'); }
        for (const condition of [input.baseline, input.candidate]) { text(condition.model); for (const field of ['instructionsHash', 'toolsHash', 'evidenceHash', 'resourcesHash'] as const) requireThat(/^[a-f0-9]{64}$/.test(condition[field]), 'EVALUATION_HASH_REQUIRED'); }
        requireThat(input.baseline.instructionsHash === hash(baseline.procedure) && input.candidate.instructionsHash === hash(candidate.procedure), 'EVALUATION_PROCEDURE_BINDING');
        const matched = input.baseline.model === input.candidate.model && ['toolsHash', 'evidenceHash', 'resourcesHash'].every(field => (input.baseline as any)[field] === (input.candidate as any)[field]);
        const gain = input.cases.filter(c => c.candidatePassed && !c.baselinePassed).length - input.cases.filter(c => c.baselinePassed && !c.candidatePassed).length;
        const regression = input.cases.some(c => c.baselinePassed && !c.candidatePassed), critical = input.cases.some(c => c.criticalError), fresh = input.cases.some(c => c.fresh), regressionCases = input.cases.some(c => c.regression);
        const correctionKnown = input.cases.every(c => c.baselineCorrectionSeconds !== null && c.candidateCorrectionSeconds !== null), correctionWorse = correctionKnown && input.cases.reduce((n, c) => n + c.candidateCorrectionSeconds! - c.baselineCorrectionSeconds!, 0) > 0;
        const supported = input.provenance !== 'fixture' && matched && gain >= 2 && !regression && !critical && fresh && regressionCases && !correctionWorse && input.semanticReview?.accepted === true;
        const analysis = { matched, netAdditionalAccepted: gain, regression, criticalError: critical, freshCases: fresh, regressionCases, correctionKnown, correctionWorse, eligible: supported, decision: supported ? 'eligible_for_scoped_experimental_adoption' : 'retain_baseline', qualification: 'Only this capability and population; no general superiority claim', missingEvidence: [!matched && 'fair common conditions', !fresh && 'fresh cases', !regressionCases && 'regression cases', !input.semanticReview?.accepted && 'semantic job-fit review', input.provenance === 'fixture' && 'non-fixture observed work'].filter(Boolean) };
        return this.store.transaction(() => { const key = candidateId + '/' + input.id, value = { ...input, id: key, candidateId, candidateHash: candidate.definitionHash, baselineHash: baseline.definitionHash, analysis, definitionHash: hash(input), createdAt: new Date().toISOString() }, old = this.store.get('portfolio-procedure-evaluation', key); if (old) { requireThat(old.definitionHash === value.definitionHash, 'EVALUATION_IMMUTABLE'); return old; } this.store.record(portfolioScope(), 'evaluation-' + hash(key).slice(0, 24), 'PortfolioProcedureEvaluation', value); return this.store.put('portfolio-procedure-evaluation', key, value, null); });
    }
    adopt(candidateId: string, evaluationId: string, scope: ProcedureScope, reason: string) {
        text(reason); const candidate = this.get(candidateId), evaluation = this.store.get('portfolio-procedure-evaluation', evaluationId.includes('/') ? evaluationId : candidateId + '/' + evaluationId); requireThat(evaluation?.candidateId === candidateId && evaluation.candidateHash === candidate.definitionHash, 'ADOPTION_EVALUATION_REQUIRED'); requireThat(evaluation.analysis.eligible, 'PROCEDURE_ADVANTAGE_NOT_DEMONSTRATED'); requireThat(hash(scope) === hash(evaluation.scope), 'PROCEDURE_TRANSFER_REQUIRES_FRESH_FIT_EVALUATION');
        return this.store.transaction(() => { const id = hash(scope), prior = this.store.get('portfolio-procedure-adoption', id), value = { id, scope, candidateId, procedureHash: hash(candidate.procedure), evaluationId: evaluation.id, reason, qualification: 'experimental within evaluated scope', version: (prior?.version ?? 0) + 1, createdAt: new Date().toISOString() }; if (prior?.candidateId === candidateId && prior.evaluationId === evaluation.id) return prior; this.store.record(portfolioScope(), 'adoption-' + id.slice(0, 20) + '-' + value.version, 'PortfolioProcedureAdoption', value); return this.store.put('portfolio-procedure-adoption', id, value, prior?._version ?? null); });
    }
    /** Changes future selection only. Existing executions retain their pinned procedure. */
    rollback(scope: ProcedureScope, input: ProcedureRollback) {
        identifier(input.id); text(input.reason); text(input.observationId); requireThat(Number.isSafeInteger(input.expectedVersion) && input.expectedVersion > 0, 'ROLLBACK_VERSION_REQUIRED');
        return this.store.transaction(() => {
            const id = hash(scope), requestId = id + '/' + input.id, requestHash = hash(input), priorRequest = this.store.get('portfolio-procedure-rollback', requestId);
            if (priorRequest) { requireThat(priorRequest.requestHash === requestHash, 'ROLLBACK_ID_CONFLICT'); return priorRequest.selection; }
            const prior = this.store.get('portfolio-procedure-adoption', id); requireThat(prior && prior.version === input.expectedVersion, 'PROCEDURE_SELECTION_CHANGED');
            const observation = this.store.get('portfolio-observation', input.observationId); requireThat(observation, 'ROLLBACK_OBSERVATION_REQUIRED');
            let candidateId: string | null = null, baselineId: string, evaluationId: string | null = null, procedure: any;
            if (input.target.kind === 'baseline') { procedure = this.get(input.target.baselineId); requireThat(procedure.kind === 'baseline' && hash(procedure.scope) === id, 'ROLLBACK_BASELINE_SCOPE'); baselineId = procedure.id; }
            else {
                requireThat(input.target.kind === 'adoption' && Number.isSafeInteger(input.target.version) && input.target.version > 0 && input.target.version < prior.version, 'ROLLBACK_PRIOR_ADOPTION_REQUIRED');
                const recordId = 'adoption-' + id.slice(0, 20) + '-' + input.target.version;
                const records = this.store.records({ id: 'procedure-registry', tenantId: 'mason', businessId: 'portfolio', permissions: ['read'] }, portfolioScope());
                const recorded = records.find(r => r.id === recordId && r.kind === 'PortfolioProcedureAdoption'); requireThat(recorded && hash(recorded.value.scope) === id, 'ROLLBACK_PRIOR_ADOPTION_REQUIRED');
                const selection = recorded.value; procedure = this.get(selection.candidateId); const evaluation = this.store.get('portfolio-procedure-evaluation', selection.evaluationId);
                requireThat(procedure.kind === 'candidate' && hash(procedure.procedure) === selection.procedureHash && evaluation?.candidateId === procedure.id && evaluation.candidateHash === procedure.definitionHash && evaluation.analysis.eligible && hash(evaluation.scope) === id, 'ROLLBACK_SUPPORTED_EVALUATION_REQUIRED');
                candidateId = procedure.id; baselineId = procedure.baselineId; evaluationId = evaluation.id;
            }
            const selection = { id, scope, candidateId, baselineId, procedureHash: hash(procedure.procedure), evaluationId, reason: input.reason, action: 'rollback', rollbackId: input.id, observationId: input.observationId, observationHash: observation.digest, predecessorVersion: prior.version, restoredAdoptionVersion: input.target.kind === 'adoption' ? input.target.version : null, qualification: candidateId ? 'experimental within previously evaluated scope' : 'strong baseline restored; no advantage claim', version: prior.version + 1, createdAt: new Date().toISOString() };
            this.store.record(portfolioScope(), 'adoption-' + id.slice(0, 20) + '-' + selection.version, 'PortfolioProcedureRollback', { ...selection, previousSelection: prior });
            this.store.put('portfolio-procedure-adoption', id, selection, prior._version);
            this.store.put('portfolio-procedure-rollback', requestId, { requestHash, input, selection }, null);
            this.store.event(portfolioScope(), 'portfolio.procedure_rolled_back', { scope, fromVersion: prior.version, version: selection.version, candidateId, baselineId, observationId: input.observationId });
            return selection;
        });
    }
    selected(scope: ProcedureScope, baselineId: string) { const adoption = this.store.get('portfolio-procedure-adoption', hash(scope)); return { procedure: this.get(adoption?.candidateId ?? adoption?.baselineId ?? baselineId), adoption: adoption ?? null, reason: adoption?.action === 'rollback' ? 'Explicit rollback restored the recorded procedure for future work; prior evidence and execution pins remain unchanged' : adoption ? 'Chosen from accepted evidence for this exact job and population' : 'Retained strong baseline; no accepted fit evidence for this scope' }; }
    transfer(candidateId: string, scope: ProcedureScope) { const candidate = this.get(candidateId); return { candidateId, scope, status: 'requires_fresh_fit_evaluation', procedureHash: hash(candidate.procedure), adopted: false, nextAction: 'Evaluate fresh target-job cases and regressions under fair shared conditions before adoption' }; }
}
