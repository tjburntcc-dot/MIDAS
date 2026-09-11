import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hostname, userInfo } from 'node:os';
import { canonical, hash, requireThat, identifier, safeInteger } from '../contracts.ts';
import { baselineProcedure, developmentCases, taskContractHash, outputSchema } from './task.ts';
import type { ResponsesRoute } from '../model-port.ts';
import type { Limits } from './ledger.ts';
function developmentAccount(): string { try {
    return userInfo().username;
}
catch {
    return 'unavailable-in-local-sandbox';
} }
export const limits: Limits = { totalMinor: 4100, stages: { smoke: { minor: 100, attempts: 2 }, development: { minor: 1000, attempts: 72 }, validation: { minor: 400, attempts: 24 }, evaluation: { minor: 2600, attempts: 192 } } };
export const route: ResponsesRoute = { authorizationId: 'foundry-028', model: 'gpt-5.6-sol', reasoningEffort: 'medium', serviceTier: 'default', maxOutputTokens: 4096, deadlineMs: 60000, inputTokenCeiling: 8192, maxCallCost: { minorUnits: 13, currency: 'USD' }, pricing: { inputMinorPerMillion: 500, outputMinorPerMillion: 2000, source: 'https://developers.openai.com/api/docs/pricing ; conservative cache-write input ceiling $5/M; standard Sol $4/M input and $20/M output', effectiveAt: '2026-09-10T00:00:00Z' } };
export const analysisSpec = { caseCount: 48, clusters: 24, repeats: 2, minimumQuality: .90, minimumQualityLowerBound: .80, practicalGain: .10, maxCriticalUpperBound: .13, maxP95LatencyMs: 90000, maxMeanCorrectionSeconds: 120, maxCostPerAcceptedMinor: 20, seed: 280910 };
export function implementationHash() { const here = dirname(fileURLToPath(import.meta.url)); const names = ['analysis', 'bounded', 'cli', 'config', 'custodian', 'ledger', 'provider', 'rehearsal', 'task', 'token-count', 'workflow']; return hash([...names.map(n => readFileSync(join(here, n + '.ts'), 'utf8').replace(/\r\n/g, '\n')), ...['contracts', 'state', 'model-port'].map(n => readFileSync(join(here, '..', n + '.ts'), 'utf8').replace(/\r\n/g, '\n'))]); }
export function executionHash(spec: any) { return hash({ scope: spec.scope, developmentRoot:spec.developmentRoot, developerHost:spec.developerHost, route: spec.route, limits: spec.limits, rights: spec.rights, casesHash: spec.casesHash, taskContractHash: spec.taskContractHash, outputSchemaHash: spec.outputSchemaHash, implementationHash: spec.implementationHash, ...(spec.boundedPolicy?{boundedPolicy:spec.boundedPolicy}:{} ) }); }
export const readJSON = (path: string): any => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export function writeJSON(path: string, value: unknown, exclusive = false) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n', exclusive ? { flag: 'wx' } : {}); }
export function keypair() { const keys = generateKeyPairSync('ed25519'); return { publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }; }
export function signed(payload: any, privateKey: string) { return { payload, signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64') }; }
export function verified(envelope: any, key: string) { requireThat(envelope && typeof envelope.signature === 'string' && verify(null, Buffer.from(canonical(envelope.payload)), key, Buffer.from(envelope.signature, 'base64')), 'SIGNATURE_INVALID'); return envelope.payload; }
export function prepare(root: string, ownerPublicKey?:string) {
    requireThat(!existsSync(root) || readdirSync(root).length === 0, 'ROOT_NOT_EMPTY');
    mkdirSync(join(root, 'auth'), { recursive: true });
    mkdirSync(join(root, 'reports'), { recursive: true });
    const keys = ownerPublicKey?{publicKey:ownerPublicKey,privateKey:null}:keypair();
    if(keys.privateKey)writeFileSync(join(root, 'auth', 'owner.key'), keys.privateKey, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(root, 'auth', 'owner.pub'), keys.publicKey, { flag: 'wx' });
    const cases = developmentCases();
    writeJSON(join(root, 'cases.json'), cases, true);
    writeJSON(join(root, 'baseline.json'), { version: 'baseline-v1', procedure: baselineProcedure, taskContractHash, development: { method: 'carefully authored general-purpose instructions; no actual model feedback yet', measuredHumanSeconds: null } }, true);
    const spec = { schemaVersion: 1, mission: 'MIDAS-FOUNDRY-ROLE-BASELINE-V0-028', status: 'draft', implementationHash: implementationHash(), claim: 'A_same_model_specialization', separateFrontierClaim: false, scope: { tenantId: 'foundry-lab', businessId: 'role-experiment', runId: 'EXP-028', dataPolicyVersion: 'synthetic-policy-v1', mode: 'fixture' }, route, limits, analysis: analysisSpec, rights: 'purpose-built-synthetic', taskContractHash, outputSchemaHash: hash(outputSchema), casesHash: hash(cases), developmentRoot:resolve(root), developerHost: hostname(), developerAccount: developmentAccount(), modelRevision: null, billingPublicKey: null, custodianPublicKey: null, reviewer: null, reviewerPublicKey: null, custodian: null, calibration: null, population: 'Independent synthetic billing-policy families; six prespecified task strata; no customer validation', finalDesign: { clusters: 24, casesPerCluster: 2, strata: ['straightforward', 'missing', 'conflict', 'superseded', 'injection', 'escalation'], clustersPerStratum: 4, repeats: 2, attempts: 192, caseGenerator: 'custodian creates independent policy/invoice lineages after boundary validation; no protected materials exist locally', randomization: 'seeded shuffle of case/repeat pairs and within-pair arm order', criticalStop: 'stop new admissions on a confirmed critical failure; incomplete study cannot pass', contamination: 'invalidate affected final comparison; never silently replace or rerun cases' }, manualReview: { required: true, dimensions: ['correctness', 'evidence support', 'uncertainty', 'escalation', 'prohibited promises', 'critical failures'], correctionTime: 'measured start/stop seconds including zero for already acceptable output; missing is unknown' }, failurePolicy: { attemptsPerCell: 1, automaticRetries: 0, fallback: false, failedAttemptsCountAsFailures: true } };
    writeJSON(join(root, 'spec.json'), spec, true);
    writeJSON(join(root, 'authorization.request.json'), { kind: 'model-experiment-authorization', approved: false, approvalReference: null, approvedBy: null, projectId: null, credentialMethod: 'explicit API key file read only after verified authorization; no environment fallback', credentialFile: null, protectedCredentialFile: null, permittedData: 'purpose-built synthetic development and validation cases only; protected scope requires frozen manifests and separate custodian execution', specHash: executionHash(spec), limits, route, expiresAt: null, pricingVerifiedAt: '2026-09-10', allowProtected: false }, true);
    return { root, specHash: hash(spec), developmentCases: 12, validationCases: 6, protectedCasesCreated: 0, authorization: 'not approved', maxPerCallMinor: 13, worstCaseAllCallsMinor: 3770 };
}
export function authorization(root: string, allowExpired = false) {
    const spec = readJSON(join(root, 'spec.json'));
    const envelope = readJSON(join(root, 'authorization.json'));
    const auth = verified(envelope, readFileSync(join(root, 'auth', 'owner.pub'), 'utf8'));
    if(spec.implementationHash!==implementationHash()){
        requireThat(existsSync(join(root,'implementation-release.json')),'IMPLEMENTATION_CHANGED');
        const release=verified(readJSON(join(root,'implementation-release.json')),readFileSync(join(root,'auth/owner.pub'),'utf8'));
        requireThat(release.kind==='implementation-release'&&release.authorizationHash===hash(auth)&&release.previousImplementationHash===spec.implementationHash&&release.implementationHash===implementationHash()&&release.reason?.length>20,'IMPLEMENTATION_CHANGED');
        // A release changes executable code, never the original grant, counters or prices.
        // Admission still records the new implementation identity on each new attempt.
    }
    requireThat(auth.kind === 'model-experiment-authorization' && auth.approved === true && auth.specHash === executionHash(spec), 'AUTHORIZATION_MISMATCH');
    requireThat(typeof auth.projectId === 'string' && auth.projectId.startsWith('proj_') && typeof auth.credentialFile === 'string' && auth.credentialFile.length > 0, 'PROJECT_CREDENTIAL_REQUIRED');
    requireThat(typeof auth.approvedBy === 'string' && auth.approvedBy.length > 0 && typeof auth.approvalReference === 'string' && auth.approvalReference.length > 0 && Number.isFinite(Date.parse(auth.expiresAt)) && (allowExpired || Date.parse(auth.expiresAt) > Date.now()), 'AUTHORIZATION_EXPIRED_OR_UNSIGNED');
    requireThat(hash(auth.route) === hash(spec.route) && hash(auth.limits) === hash(spec.limits), 'AUTHORIZATION_LIMIT_MISMATCH');
    return { spec, auth, authorizationHash: hash(auth) };
}
export function installImplementationRelease(root:string,envelope:any){
    const key=readFileSync(join(root,'auth/owner.pub'),'utf8'),auth=verified(readJSON(join(root,'authorization.json')),key),spec=readJSON(join(root,'spec.json')),r=verified(envelope,key);
    requireThat(r.kind==='implementation-release'&&r.authorizationHash===hash(auth)&&r.previousImplementationHash===spec.implementationHash&&r.implementationHash===implementationHash()&&r.reason?.length>20,'IMPLEMENTATION_CHANGED');
    if(existsSync(join(root,'experiment.sqlite'))){const db=new DatabaseSync(join(root,'experiment.sqlite'),{readOnly:true});try{requireThat(db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().every(x=>JSON.parse(String(x.body)).finishedAt),'IN_FLIGHT_IMPLEMENTATION_PINNED');}finally{db.close();}}
    writeJSON(join(root,'implementation-release.json'),envelope,true);return {released:r.implementationHash,authorizationUnchanged:true};
}
export function approve(root: string, file: string, privateKey: string) {
    const request = readJSON(file);
    requireThat(request.approved === true, 'EXPLICIT_APPROVAL_REQUIRED');
    const spec = readJSON(join(root, 'spec.json'));
    requireThat(request.specHash === executionHash(spec), 'AUTHORIZATION_MISMATCH');
    writeJSON(join(root, 'authorization.json'), signed(request, readFileSync(privateKey, 'utf8')), true);
    return { approved: true, authorizationHash: hash(request) };
}
