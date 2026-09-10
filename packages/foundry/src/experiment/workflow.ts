import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { hash, requireThat, canonical } from '../contracts.ts';
import type { ModelRequest, Role } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { ModelLedger } from './ledger.ts';
import type { Stage } from './ledger.ts';
import { authorization, readJSON, writeJSON, verified, signed } from './config.ts';
import { providerPort } from './provider.ts';
import { objectiveChecks, taskContractHash, validateOutput } from './task.ts';
import type { Case } from './task.ts';
export function openExperiment(root: string, allowExpired = false) { const a = authorization(root, allowExpired), store = new StateStore(join(root, 'experiment.sqlite')); return { ...a, store, ledger: new ModelLedger(store, a.spec.scope, a.authorizationHash, a.spec.limits) }; }
export function roleArtifact(root: string, condition: 'baseline' | 'challenger', model: string): Role {
    const value = readJSON(join(root, condition + '.json'));
    requireThat(typeof value.version==='string'&&value.version.length>0&&value.taskContractHash===taskContractHash&&typeof value.procedure === 'string' && value.procedure.trim().length > 0, 'PROCEDURE_REQUIRED');
    return { id: 'operator', version: value.version, procedure: value.procedure, competencies: ['billing-status-support'], tools: [], predecessor: condition === 'challenger' ? value.predecessorVersion : null, model, qualification: 'fixture_only' };
}
export function requestFor(scope: any, role: Role, c: Case, repeat: number, stage: Stage): ModelRequest {
    return { scope, requestId: 'A-' + hash({ scope, role: hash(role), caseId: c.id, input: hash(c.input), repeat, stage }).slice(0, 40), role, task: 'operate', context: { case: c.input }, limits: { maxCost: { minorUnits: 13, currency: 'USD' }, maxAttempts: 1, maxHumanMinutes: 10 }, tools: [] };
}
export async function runDevelopment(root: string, stage: Exclude<Stage, 'evaluation'>, condition: 'baseline' | 'challenger', transport?: typeof fetch) {
    const x = openExperiment(root);
    try {
        requireThat(resolve(root)===x.spec.developmentRoot&&hostname()===x.spec.developerHost,'AUTHORIZED_DEVELOPMENT_LOCATION_REQUIRED');
        requireThat(!existsSync(join(root, 'freeze.json')), 'EXPERIMENT_FROZEN');
        const cases: Case[] = readJSON(join(root, 'cases.json'));
        requireThat(hash(cases) === x.spec.casesHash, 'CASE_MANIFEST_CHANGED');
        const selected = stage === 'smoke' ? cases.filter(c => c.split === 'development').slice(0, 2) : cases.filter(c => c.split === (stage === 'validation' ? 'validation' : 'development'));
        const role = roleArtifact(root, condition, x.spec.route.model);
        const repeats = stage === 'smoke' ? 1 : 2;
        const completed = [];
        for (const c of selected)
            for (let repeat = 0; repeat < repeats; repeat++) {
                const request = requestFor(x.spec.scope, role, c, repeat, stage);
                const old = x.ledger.get(request.requestId);
                if (old) {
                    requireThat(old.finishedAt, 'ATTEMPT_UNRESOLVED_NO_RETRY');
                    completed.push({ id: old.id, status: old.status, reused: true });
                    continue;
                }
                const budget = x.ledger.port(stage, { condition, caseId: c.id, caseHash: hash(c), inputHash: hash(c.input), family: c.family, cluster: c.cluster, repeat, roleHash: hash(role), source: 'actual-model', businessExecution: 'none' });
                const port = providerPort(x.spec.route, x.auth.projectId, x.auth.credentialFile, budget, transport);
                try {
                    const result = await port.run(request);
                    x.ledger.finish(request.requestId, result, null);
                }
                catch (e) {
                    if (x.ledger.get(request.requestId))
                        x.ledger.finish(request.requestId, null, (e as any).code ?? 'MODEL_FAILED');
                    else
                        throw e;
                }
                const row = x.ledger.get(request.requestId);
                completed.push({ id: row.id, status: row.status });
            }
        return { stage, condition, attempts: completed, exposure: x.ledger.totals(), modelImprovement: 'not evaluated' };
    }
    finally {
        x.store.close();
    }
}
export function reviewPacket(root: string) { const x = openExperiment(root, true); try {
    return { instruction: 'Human review required. Fill dimensions and measured correction times, sign with the configured reviewer key. Objective checks are diagnostic flags, not semantic ground truth.', items: x.ledger.rows().filter(r => r.finishedAt).map(r => { const c = readJSON(join(root, 'cases.json')).find((c: Case) => c.id === r.metadata.caseId); return { attemptId: r.id, attemptHash: hash(r.result), input: r.request.context.case, output: r.result?.output ?? null, errorCode: r.errorCode, objectiveFlags: c ? objectiveChecks(c, r.result?.output) : { needsHumanReview: true }, review: { accepted: null, critical: null, dimensions: { correctness: null, evidenceSupport: null, uncertainty: null, escalation: null, prohibitedPromises: null }, correctionStartedAt: null, correctionFinishedAt: null, correctedArtifactHash: null, reason: null, reviewer: null } }; }) };
}
finally {
    x.store.close();
} }
export function recordReview(root: string, envelope: any) {
    const x = openExperiment(root, true);
    try {
        requireThat(x.spec.reviewerPublicKey, 'REVIEWER_NOT_CONFIGURED');
        const r = verified(envelope, x.spec.reviewerPublicKey);
        requireThat(r.kind === 'human-review' && r.reviewer === x.spec.reviewer && r.measurementSource === 'observed-stopwatch', 'HUMAN_REVIEW_REQUIRED');
        requireThat(typeof r.accepted === 'boolean' && typeof r.critical === 'boolean' && typeof r.reason === 'string' && r.reason.length > 0, 'REVIEW_INCOMPLETE');
        for (const dim of ['correctness', 'evidenceSupport', 'uncertainty', 'escalation', 'prohibitedPromises'])
            requireThat(typeof r.dimensions?.[dim] === 'boolean', 'REVIEW_DIMENSION_REQUIRED');
        const seconds = (Date.parse(r.correctionFinishedAt) - Date.parse(r.correctionStartedAt)) / 1000;
        requireThat(Number.isFinite(seconds) && seconds >= 0 && seconds <= 7200, 'MEASURED_CORRECTION_TIME_REQUIRED');
        const row = x.ledger.get(r.attemptId);
        requireThat(row && row.finishedAt && r.attemptHash === hash(row.result), 'REVIEW_ATTEMPT_MISMATCH');
        requireThat(!r.accepted || (!row.errorCode && !r.critical && Object.values(r.dimensions).every(Boolean)), 'INCONSISTENT_ACCEPTANCE');
        if (r.accepted)
            validateOutput(row.result.output);
        x.store.transaction(() => { const key = x.ledger.key(r.attemptId), old = x.store.get('experiment-review', key); if (old) {
            requireThat(old.hash === hash(r), 'REVIEW_IMMUTABLE');
            return;
        } x.store.put('experiment-review', key, { ...r, correctionSeconds: seconds, hash: hash(r) }, null); });
        return { recorded: r.attemptId, correctionSeconds: seconds };
    }
    finally {
        x.store.close();
    }
}
export function candidate(root: string, procedureFile: string, failureIds: string[], rationale: string) {
    const x = openExperiment(root);
    try {
        requireThat(!existsSync(join(root, 'freeze.json')) && !existsSync(join(root, 'challenger.json')), 'CANDIDATE_ALREADY_FIXED');
        requireThat(failureIds.length > 0 && rationale.length > 20, 'OBSERVED_FAILURE_REQUIRED');
        for (const id of failureIds) {
            const row = x.ledger.get(id), review = x.store.get('experiment-review', x.ledger.key(id));
            requireThat(row?.metadata.source === 'actual-model' && row.stage === 'development' && row.metadata.condition === 'baseline' && row.metadata.roleHash === hash(roleArtifact(root, 'baseline', x.spec.route.model)) && review && !review.accepted, 'OBSERVED_BASELINE_FAILURE_REQUIRED');
        }
        const baseline = readJSON(join(root, 'baseline.json')), procedure = readFileSync(procedureFile, 'utf8').trim();
        requireThat(procedure && procedure !== baseline.procedure, 'PROCEDURE_CHANGE_REQUIRED');
        const result = { version: 'challenger-v1', predecessorVersion:baseline.version, procedure, taskContractHash, baselineHash: hash(baseline), failureIds, rationale, source: 'observed-development-failures', createdAt: new Date().toISOString() };
        writeJSON(join(root, 'challenger.json'), result, true);
        return { candidateHash: hash(result), failureIds };
    }
    finally {
        x.store.close();
    }
}
export function freeze(root: string, manifestEnvelope: any) {
    const x = openExperiment(root);
    try {
        requireThat(x.spec.custodianPublicKey && x.spec.reviewer && x.spec.custodian, 'CUSTODIAN_REVIEWER_REQUIRED');
        requireThat(x.spec.modelRevision?.immutable === true && x.spec.modelRevision?.requestModel === x.spec.route.model && typeof x.spec.modelRevision?.officialEvidence === 'string', 'IMMUTABLE_MODEL_REVISION_REQUIRED');
        requireThat(x.spec.calibration?.complete === true && x.spec.calibration?.reviewer === x.spec.reviewer && x.spec.calibration?.rubricHash, 'REVIEWER_CALIBRATION_REQUIRED');
        const manifest = verified(manifestEnvelope, x.spec.custodianPublicKey);
        requireThat(manifest.kind === 'protected-manifest' && manifest.custodian === x.spec.custodian && manifest.caseCount === x.spec.analysis.caseCount && manifest.clusterCount === x.spec.analysis.clusters && manifest.developerHost === x.spec.developerHost, 'PROTECTED_MANIFEST_MISMATCH');
        requireThat(manifest.boundaryHash && manifest.populationHash && manifest.rightsHash && manifest.labelsHash && manifest.splitHash && manifest.reviewRubricHash === x.spec.calibration.rubricHash, 'PROTECTED_MANIFEST_INCOMPLETE');
        const baseline = readJSON(join(root, 'baseline.json')), challenger = readJSON(join(root, 'challenger.json'));
        requireThat(Number.isFinite(baseline.development?.measuredHumanSeconds) && baseline.development.measuredHumanSeconds >= 0, 'BASELINE_EFFORT_UNMEASURED');
        requireThat(challenger.baselineHash === hash(baseline) && challenger.source === 'observed-development-failures', 'CANDIDATE_PROVENANCE_MISMATCH');
        const validation = x.ledger.rows().filter(r => r.stage === 'validation');
        requireThat(validation.length === 24, 'VALIDATION_INCOMPLETE');
        const scores = validation.map(r => { requireThat(r.metadata.roleHash === hash(roleArtifact(root, r.metadata.condition, x.spec.route.model)), 'VALIDATION_ROLE_CHANGED'); const review = x.store.get('experiment-review', x.ledger.key(r.id)); requireThat(review, 'VALIDATION_REVIEW_MISSING'); return { r, review }; });
        requireThat(scores.filter(x => x.r.metadata.condition === 'baseline').length === 12 && scores.filter(x => x.r.metadata.condition === 'challenger').length === 12, 'VALIDATION_UNPAIRED');
        requireThat(scores.filter(x => x.r.metadata.condition === 'challenger').every(x => !x.review.critical), 'VALIDATION_CRITICAL_FAILURE');
        requireThat(scores.filter(x => x.r.metadata.condition === 'challenger' && x.review.accepted).length >= scores.filter(x => x.r.metadata.condition === 'baseline' && x.review.accepted).length, 'VALIDATION_REJECTED');
        const artifact = { kind: 'frozen-experiment', spec: x.spec, specHash: hash(x.spec), baseline, challenger, manifestEnvelope, authorizationHash: x.authorizationHash, validationHash: hash(scores), frozenAt: new Date().toISOString(), implementation: 'Mission028', analysisVersion: 'paired-cluster-v1' };
        writeJSON(join(root, 'freeze.json'), artifact, true);
        return { freezeHash: hash(artifact), status: 'frozen', protectedEvaluation: 'not executed' };
    }
    finally {
        x.store.close();
    }
}
export function report(root: string) {
    if (!existsSync(join(root, 'authorization.json')))
        return { gate: 1, status: 'offline preparation; actual-model authorization absent', actualModelAttempts: 0, actualProviderSpendMinor: 0, remainingProviderExposureMinor: 0, measuredImprovement: null, protectedCasesCreated: 0 };
    const x = openExperiment(root, true);
    try {
        const rows = x.ledger.rows(), stages = Object.fromEntries(['smoke', 'development', 'validation', 'evaluation'].map(s => [s, x.ledger.totals(s as Stage)]));
        return { gate: existsSync(join(root, 'freeze.json')) ? 3 : 2, actualModelAttempts: rows.filter(r => r.metadata.source === 'actual-model').length, stages, remainingProviderExposureMinor: x.ledger.totals().reserved, settledProviderMinor: x.ledger.totals().settled, provisionalProviderMinor: x.ledger.totals().provisional, failed: rows.filter(r => r.errorCode).length, reviewed: rows.filter(r => x.store.get('experiment-review', x.ledger.key(r.id))).length, measuredImprovement: null, limitations: 'No inference from readiness or development results; final protected aggregate required.' };
    }
    finally {
        x.store.close();
    }
}
