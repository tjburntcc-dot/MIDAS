import { hostname, userInfo } from 'node:os';
import { statSync, lstatSync, realpathSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hash, requireThat } from '../contracts.ts';
import { readJSON, writeJSON, verified, signed } from './config.ts';
import { openExperiment, roleArtifact, requestFor } from './workflow.ts';
import { providerPort } from './provider.ts';
import { random, analyze } from './analysis.ts';
import type { ScoredAttempt } from './analysis.ts';
import type { Case } from './task.ts';
/** No configuration flag can turn this Windows development host into a holdout boundary.
 * Supported protected deployment is a separately administered POSIX host/account.
 * Attestation remains a real human/infrastructure prerequisite, not a fixture claim. */
export function assertBoundary(spec: any, envelope: any) {
    requireThat(spec.custodianPublicKey, 'CUSTODIAN_KEY_REQUIRED');
    const b = verified(envelope, spec.custodianPublicKey);
    requireThat(b.kind === 'custodian-boundary' && b.custodian === spec.custodian && b.developerHost === spec.developerHost && b.noDeveloperAccess === true && b.auditor && b.auditedAt, 'BOUNDARY_ATTESTATION_REQUIRED');
    requireThat(hostname() !== spec.developerHost && hostname() === b.host && userInfo().username === b.account, 'SEPARATE_CUSTODIAN_HOST_REQUIRED');
    requireThat(process.platform !== 'win32' && typeof process.getuid === 'function', 'POSIX_BOUNDARY_VERIFIER_REQUIRED');
    const root = resolve(b.privateRoot), st = statSync(root);
    requireThat(realpathSync(root) === root && !lstatSync(root).isSymbolicLink() && st.uid === process.getuid() && (st.mode & 0o077) === 0, 'PRIVATE_ROOT_NOT_ISOLATED');
    return b;
}
function inside(root: string, path: string) { const p = realpathSync(resolve(path)); requireThat(p.startsWith(realpathSync(root) + sep), 'PROTECTED_PATH_OUTSIDE_BOUNDARY'); return p; }
function commitments(cases: Case[], salt: string) { return { populationHash: hash({ salt, inputs: cases.map(c => c.input) }), labelsHash: hash({ salt, labels: cases.map(c => c.checks) }), splitHash: hash({ salt, groups: cases.map(c => ({ id: c.id, cluster: c.cluster, family: c.family })) }), rightsHash: hash(cases.map(c => c.rights)), caseCount: cases.length, clusterCount: new Set(cases.map(c => c.cluster)).size }; }
export function createManifest(root: string, boundaryEnvelope: any, casePath: string, keyPath: string) {
    const spec = readJSON(join(root, 'spec.json')), b = assertBoundary(spec, boundaryEnvelope);
    const cases: Case[] = readJSON(inside(b.privateRoot, casePath));
    requireThat(cases.length === 48 && new Set(cases.map(c => c.cluster)).size === 24 && new Set(cases.map(c => c.id)).size === 48, 'FINAL_DESIGN_MISMATCH');
    requireThat(cases.every(c => c.rights === 'purpose-built-synthetic'&&c.split==='protected'), 'RIGHTS_SCOPE_MISMATCH');
    for (const cluster of new Set(cases.map(c => c.cluster)))
        requireThat(cases.filter(c => c.cluster === cluster).length === 2, 'CLUSTER_SIZE_MISMATCH');
    for (const family of spec.finalDesign.strata)
        requireThat(new Set(cases.filter(c => c.family === family).map(c => c.cluster)).size === 4, 'STRATUM_SIZE_MISMATCH');
    for (const cluster of new Set(cases.map(c => c.cluster)))
        requireThat(new Set(cases.filter(c => c.cluster === cluster).map(c => c.family)).size === 1, 'CLUSTER_FAMILY_MISMATCH');
    const openCases: Case[] = readJSON(join(root, 'cases.json'));
    requireThat(cases.every(c => !openCases.some(o => o.id === c.id || o.cluster === c.cluster || hash(o.input) === hash(c.input))), 'DEVELOPMENT_CONTAMINATION');
    const salt = randomBytes(32).toString('hex');
    writeFileSync(join(b.privateRoot, 'commitment.salt'), salt, { flag: 'wx', mode: 0o600 });
    const payload = { kind: 'protected-manifest', custodian: spec.custodian, developerHost: spec.developerHost, boundaryHash: hash(b), ...commitments(cases, salt), reviewRubricHash: spec.calibration?.rubricHash };
    requireThat(payload.reviewRubricHash, 'CALIBRATION_REQUIRED');
    const envelope = signed(payload, readFileSync(inside(b.privateRoot, keyPath), 'utf8'));
    verified(envelope, spec.custodianPublicKey);
    writeJSON(join(b.privateRoot, 'manifest.json'), envelope, true);
    return envelope;
}
export function schedule(cases: Case[], repeats: number, seed: number) {
    const rng = random(seed), pairs = cases.flatMap(c => Array.from({ length: repeats }, (_, repeat) => ({ c, repeat })));
    for (let i = pairs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs.flatMap(p => { const arms = rng() < .5 ? ['baseline', 'challenger'] : ['challenger', 'baseline']; return arms.map(condition => ({ ...p, condition: condition as 'baseline' | 'challenger' })); });
}
/** Executes at most one protected attempt; requires review before the next admission. */
export async function evaluateNext(root: string, boundaryEnvelope: any, casePath: string, releaseEnvelope: any) {
    const x = openExperiment(root);
    try {
        requireThat(x.auth.allowProtected === true, 'PROTECTED_DATA_NOT_AUTHORIZED');
        const b = assertBoundary(x.spec, boundaryEnvelope);
        inside(b.privateRoot, root);
        const frozen = readJSON(join(root, 'freeze.json'));
        requireThat(frozen.specHash === hash(x.spec) && frozen.authorizationHash === x.authorizationHash, 'FREEZE_MISMATCH');
        requireThat(hash(readJSON(join(root, 'baseline.json'))) === hash(frozen.baseline) && hash(readJSON(join(root, 'challenger.json'))) === hash(frozen.challenger), 'FROZEN_ROLE_CHANGED');
        const release = verified(releaseEnvelope, readFileSync(join(root, 'auth', 'owner.pub'), 'utf8'));
        requireThat(release.kind === 'final-evaluation-release' && release.experimentRoot===realpathSync(root) && release.freezeHash === hash(frozen) && release.authorizationHash === x.authorizationHash && release.projectId === x.auth.projectId && release.approved === true && Date.parse(release.expiresAt) > Date.now(), 'FINAL_RELEASE_REQUIRED');
        const manifest = verified(frozen.manifestEnvelope, x.spec.custodianPublicKey);
        requireThat(manifest.boundaryHash === hash(b), 'BOUNDARY_CHANGED');
        const cases: Case[] = readJSON(inside(b.privateRoot, casePath));
        const actual = commitments(cases, readFileSync(join(b.privateRoot, 'commitment.salt'), 'utf8'));
        for (const key of Object.keys(actual))
            requireThat((actual as any)[key] === manifest[key], 'PROTECTED_MATERIAL_CHANGED');
        const prior = x.ledger.rows().filter(r => r.stage === 'evaluation');
        requireThat(!x.store.get('experiment-contamination', 'final'), 'FINAL_CONTAMINATED');
        for (const row of prior) {
            const review = x.store.get('experiment-review', x.ledger.key(row.id));
            requireThat(row.finishedAt && review, 'PROTECTED_REVIEW_REQUIRED_BEFORE_NEXT_ATTEMPT');
            requireThat(!review.critical, 'CRITICAL_FAILURE_STOP');
        }
        for (const item of schedule(cases, x.spec.analysis.repeats, x.spec.analysis.seed)) {
            const role = roleArtifact(root, item.condition, x.spec.route.model), request = requestFor(x.spec.scope, role, item.c, item.repeat, 'evaluation');
            if (x.ledger.get(request.requestId))
                continue;
            requireThat(typeof x.auth.protectedCredentialFile==='string','PROTECTED_CREDENTIAL_REQUIRED');
            const credentialPath=inside(b.privateRoot,x.auth.protectedCredentialFile);
            const port = providerPort(x.spec.route, x.auth.projectId, credentialPath, x.ledger.port('evaluation', { source: 'actual-model', condition: item.condition, caseId: item.c.id, cluster: item.c.cluster, family: item.c.family, repeat: item.repeat, roleHash: hash(role), freezeHash: hash(frozen), businessExecution: 'none' }));
            try {
                x.ledger.finish(request.requestId, await port.run(request), null);
            }
            catch (e) {
                if (x.ledger.get(request.requestId))
                    x.ledger.finish(request.requestId, null, (e as any).code ?? 'MODEL_FAILED');
                else
                    throw e;
            }
            // This output stays inside the custodian environment, never a developer feedback API.
            return { status: 'review_required', attemptId: request.requestId, output: x.ledger.get(request.requestId).result?.output ?? null };
        }
        return { status: 'all_attempts_recorded', next: 'reconcile invoices, complete reviews, release aggregate once' };
    }
    finally {
        x.store.close();
    }
}
export function releaseAggregate(root: string, boundaryEnvelope: any, keyPath: string) {
    const x = openExperiment(root, true);
    try {
        const b = assertBoundary(x.spec, boundaryEnvelope);
        inside(b.privateRoot, root);
        const frozen = readJSON(join(root, 'freeze.json'));
        requireThat(frozen.specHash === hash(x.spec), 'FREEZE_MISMATCH');
        const rows = x.ledger.rows().filter(r => r.stage === 'evaluation');
        const scored: ScoredAttempt[] = rows.map(r => { const review = x.store.get('experiment-review', x.ledger.key(r.id)); requireThat(review && r.finishedAt, 'FINAL_REVIEW_INCOMPLETE'); return { id: r.id, caseId: r.metadata.caseId, cluster: r.metadata.cluster, family: r.metadata.family, repeat: r.metadata.repeat, condition: r.metadata.condition, accepted: !r.errorCode && review.accepted, critical: review.critical, costMinor: r.invoice?.minorUnits ?? null, latencyMs: r.observation?.latencyMs ?? null, correctionSeconds: review.correctionSeconds, failed: !!r.errorCode }; });
        const contaminated = x.store.get('experiment-contamination', 'final');
        const result = contaminated ? { decision: 'invalidated', reason: 'Contamination recorded; no replacement or tuning allowed.' } : analyze(scored, x.spec.analysis);
        const payload = { kind: 'protected-aggregate', freezeHash: hash(frozen), observationHash: hash(scored), result, custodian: x.spec.custodian, finalAttemptCount: rows.length, attemptAccounting:{failed:rows.filter(r=>r.errorCode).length, critical:scored.filter(r=>r.critical).length, reviewed:scored.length, measuredCorrectionSeconds:scored.reduce((n,r)=>n+(r.correctionSeconds??0),0), errorCodes:rows.reduce((counts,r)=>{if(r.errorCode)counts[r.errorCode]=(counts[r.errorCode]??0)+1;return counts;},{} as Record<string,number>)}, providerExposure: x.ledger.totals('evaluation'), releasedAt: new Date().toISOString(), claimB: false };
        const signedResult = signed(payload, readFileSync(inside(b.privateRoot, keyPath), 'utf8'));
        verified(signedResult, x.spec.custodianPublicKey);
        writeJSON(join(root, 'aggregate.json'), signedResult, true);
        return signedResult;
    }
    finally {
        x.store.close();
    }
}
