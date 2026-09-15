/** Explicit synthetic legacy records for migration/rollback tests only.
 * This bypasses no production API: no model, independent assessment or adoption
 * occurred. New code must reject using these historical flags for fresh adoption. */
import { hash } from '../src/contracts.ts';
import { StateStore } from '../src/state.ts';
import { portfolioScope } from '../src/portfolio/contracts.ts';
import type { ProcedureScope } from '../src/portfolio/learning.ts';

export function seedHistoricalProcedureSelection(store: StateStore, candidateId: string, scope: ProcedureScope) {
    const candidate = store.get('portfolio-procedure', candidateId), baseline = store.get('portfolio-procedure', candidate.baselineId);
    const id = hash(scope), prior = store.get('portfolio-procedure-adoption', id), evaluationId = candidateId + '/synthetic-legacy';
    const evaluation = { id: evaluationId, candidateId, candidateHash: candidate.definitionHash, baselineHash: baseline.definitionHash, scope, analysis: { eligible: true }, provenance: 'synthetic legacy fixture; not runtime evidence', qualification: 'fixture_only_unqualified' };
    const selection = { id, candidateId, scope, procedureHash: hash(candidate.procedure), evaluationId, version: (prior?.version ?? 0) + 1, reason: 'Synthetic historical state for migration and rollback tests', qualification: 'fixture_only_unqualified' };
    store.transaction(() => {
        store.put('portfolio-procedure-evaluation', evaluationId, evaluation, null);
        store.record(portfolioScope(), 'adoption-' + id.slice(0, 20) + '-' + selection.version, 'PortfolioProcedureAdoption', selection);
        store.put('portfolio-procedure-adoption', id, selection, prior?._version ?? null);
    });
    return { evaluation, selection };
}
