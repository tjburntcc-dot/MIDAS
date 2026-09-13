/** One explicitly approved diagnosis, using the existing model ledger and background
 * transport. The ordinary owner server never loads this opt-in execution factory. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, identifier, requireThat, safeInteger, scopeKey } from '../contracts.ts';
import type { ModelRequest, Scope } from '../contracts.ts';
import { StateStore } from '../state.ts';
import { signed, verified } from '../experiment/config.ts';
import { assertCountableRequest } from '../experiment/token-count.ts';
import { OperatingModels, implementationHash as operatingImplementationHash } from '../operations/model.ts';
import type { OperatingGrant } from '../operations/model.ts';
import { portfolioRoute } from '../portfolio/live.ts';
import type { ResponsesRoute } from '../model-port.ts';
import { prospectiveEvidenceRequest, understandingSchema, validateUnderstanding } from '../workbench/evidence.ts';
import type { EvidenceBundle } from '../workbench/evidence.ts';
import { pilotImplementationHash } from './binding.ts';
import { PilotKnowledge, pilotKnowledgeScope } from './knowledge.ts';

type DiagnosisBinding = {
    kind: 'first-owner-pilot-diagnosis-032-v1'; id: string; implementationHash: string;
    businessId: string; companyHash: string; companyVersion: number; bundle: EvidenceBundle;
    bundleHash: string; attemptId: string; request: ModelRequest; requestHash: string;
    bodyHash: string; schemaHash: string;
};
export type PilotDiagnosisGrant = OperatingGrant & { pilotDiagnosis: DiagnosisBinding };
const authorizationFile = 'pilot.diagnosis.authorization.json';
const proposalFile = 'pilot.diagnosis.authorization.request.json';
const stage = 'pilot-diagnosis';
/** Cover transitive modules absent from the historical OperatingModels hash. */
function diagnosisImplementationHash() {
    const here = dirname(fileURLToPath(import.meta.url));
    return hash({ pilot: pilotImplementationHash(), shared: ['../workbench/evidence.ts', '../durable-responses.ts', '../response-observation.ts', '../contracts.ts'].map(path => ({ path, source: readFileSync(join(here, path), 'utf8').replace(/\r\n/g, '\n') })) });
}
function diagnosisScope(id: string): Scope { return { tenantId: 'mason', businessId: 'pilot-diagnosis-model-account', runId: id, dataPolicyVersion: 'owner-selected-diagnosis-v1', mode: 'fixture' }; }
function expectedLimits(businessId: string, countMinor: number) {
    return { totalMinor: 205 + countMinor, concurrency: 1, astraCountRequests: 1,
        overheadReserve: { minor: countMinor, reason: 'Explicit unpriced token-count and bounded response-retrieval uncertainty reserve; not a provider fee quote.' },
        stages: { smoke: { minor: 0, attempts: 0 }, development: { minor: 205, attempts: 1 }, validation: { minor: 0, attempts: 0 }, evaluation: { minor: 0, attempts: 0 } },
        allocations: [{ metadataKey: 'businessId', value: businessId, attempts: 1, minor: 205 }, { metadataKey: 'stage', value: stage, attempts: 1, minor: 205 }] };
}
function currentRequest(knowledge: PilotKnowledge, businessId: string, id: string, projectId: string) {
    const company = knowledge.company(businessId), bundle = knowledge.bundle(businessId);
    const route = portfolioRoute(id, projectId, true, true) as unknown as ResponsesRoute;
    const prepared = prospectiveEvidenceRequest(pilotKnowledgeScope(businessId), bundle, id + '-attempt-1', route);
    assertCountableRequest(prepared.body);
    return { company, bundle, route, ...prepared };
}
/** No credential read, signature, ledger admission or network activity. */
export function preparePilotDiagnosisAuthorization(knowledge: PilotKnowledge, input: {
    root: string; directory: string; id: string; businessId: string; projectId: string;
    credentialFile: string | null; expiresAt: string; countUncertaintyMinor: number;
    mode?: 'mock' | 'live'; billingPublicKey?: string | null;
}) {
    identifier(input.id); requireThat(input.id.startsWith('pilot-diagnosis-032-'), 'PILOT_DIAGNOSIS_FRESH_AUTHORITY');
    requireThat(/^proj_[A-Za-z0-9_-]+$/.test(input.projectId), 'PILOT_DIAGNOSIS_PROJECT');
    requireThat(Number.isFinite(Date.parse(input.expiresAt)) && Date.parse(input.expiresAt) > Date.now(), 'PILOT_DIAGNOSIS_EXPIRY');
    requireThat(input.credentialFile === null || isAbsolute(input.credentialFile), 'PILOT_DIAGNOSIS_CREDENTIAL_PATH');
    safeInteger(input.countUncertaintyMinor, 1);
    requireThat(!existsSync(join(input.root, authorizationFile)) && !existsSync(join(input.directory, proposalFile)), 'PILOT_DIAGNOSIS_NEW_PACKET_REQUIRED');
    const p = currentRequest(knowledge, input.businessId, input.id, input.projectId), mode = input.mode ?? 'live';
    requireThat(mode !== 'mock' || p.company.mode === 'fixture', 'PILOT_DIAGNOSIS_MOCK_FIXTURE_REQUIRED');
    const binding: DiagnosisBinding = { kind: 'first-owner-pilot-diagnosis-032-v1', id: input.id, implementationHash: diagnosisImplementationHash(), businessId: input.businessId,
        companyHash: hash(p.company), companyVersion: p.company.version, bundle: p.bundle, bundleHash: hash(p.bundle), attemptId: p.request.requestId,
        request: p.request, requestHash: hash(p.request), bodyHash: p.sha256, schemaHash: hash(understandingSchema) };
    const proposal: PilotDiagnosisGrant = { kind: 'operations-model-grant-v1', mode, root: resolve(input.root), host: hostname(), implementationHash: operatingImplementationHash(),
        projectId: input.projectId, credentialFile: input.credentialFile, expiresAt: input.expiresAt, approvedBy: '', approvalReference: '', billingPublicKey: input.billingPublicKey ?? null,
        accountScope: diagnosisScope(input.id), route: p.route, limits: expectedLimits(input.businessId, input.countUncertaintyMinor),
        businesses: [{ id: input.businessId, goalHash: hash(p.company.goal), sourceHosts: [], maxCalls: 1 }], retries: 0, providerConcurrency: 1, countDeadlineMs: 10000, externalAuthority: false, pilotDiagnosis: binding };
    validateBinding(knowledge, input.root, proposal, false);
    const summary = { kind: 'pilot-diagnosis-preparation-v1', proposalHash: hash(proposal), approved: false, providerRequests: 0, inferenceAdmissions: 1, countAdmissions: 1,
        maximumExposureMinor: proposal.limits.totalMinor, inferenceReservationMinor: 205, countUncertaintyMinor: input.countUncertaintyMinor, currency: 'USD', route: proposal.route,
        pricingStatus: 'Retained official pricing basis dated 2026-09-12; reconfirm official pricing and project access before approval. No live compatibility claim.',
        reservationBasis: 'ceil(32768 * 1250 / 1000000 + 32768 * 5000 / 1000000) = 205 USD cents; output ceiling includes reasoning and final JSON.',
        privacy: 'Exact selected business evidence is transmitted. Background store:true retains provider response data for at least 30 days; requires explicit owner approval.',
        exclusions: ['No source retrieval, task execution, review helper, fallback or replacement inference', 'No R5 or prior mission budget/grant transfer', 'Unknown creation is not resent; only bounded same-ID retrieval is supported'],
        result: 'Validated sourced claims, contradictions, unknowns, hypotheses and proposed tasks. Source truth, causal diagnosis, owner acceptance and worker competence remain unestablished.' };
    mkdirSync(input.directory, { recursive: true });
    writeFileSync(join(input.directory, proposalFile), JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(join(input.directory, 'diagnosis-exact-request.json'), JSON.stringify({ request: p.request, schema: understandingSchema, body: p.body, bytes: p.bytes, sha256: p.sha256 }, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(join(input.directory, 'diagnosis-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
    return { proposal, proposalHash: hash(proposal), summary, request: p.request, body: p.body, bytes: p.bytes, schema: understandingSchema };
}
function validateBinding(knowledge: PilotKnowledge, root: string, g: PilotDiagnosisGrant, approved: boolean) {
    const b = g?.pilotDiagnosis;
    requireThat(b?.kind === 'first-owner-pilot-diagnosis-032-v1' && b.id?.startsWith('pilot-diagnosis-032-'), 'PILOT_DIAGNOSIS_SIGNED_BINDING_REQUIRED');
    requireThat(g.kind === 'operations-model-grant-v1' && g.root === resolve(root) && g.host === hostname() && ['live', 'mock'].includes(g.mode), 'PILOT_DIAGNOSIS_LOCATION');
    requireThat(g.implementationHash === operatingImplementationHash() && b.implementationHash === diagnosisImplementationHash(), 'PILOT_DIAGNOSIS_CODE_CHANGED');
    requireThat(g.credentialFile === null || typeof g.credentialFile === 'string' && isAbsolute(g.credentialFile), 'PILOT_DIAGNOSIS_CREDENTIAL_PATH');
    requireThat(g.retries === 0 && g.providerConcurrency === 1 && g.countDeadlineMs === 10000 && g.externalAuthority === false && !g.recovery && !g.stageContracts && !g.learningGate && !g.countRequestByteCeiling, 'PILOT_DIAGNOSIS_SCOPE');
    requireThat(hash(g.accountScope) === hash(diagnosisScope(b.id)), 'PILOT_DIAGNOSIS_ACCOUNT');
    safeInteger(g.limits.overheadReserve?.minor, 1);
    requireThat(hash(g.limits) === hash(expectedLimits(b.businessId, g.limits.overheadReserve!.minor)), 'PILOT_DIAGNOSIS_LIMITS');
    const p = currentRequest(knowledge, b.businessId, b.id, g.projectId);
    requireThat(g.mode !== 'mock' || p.company.mode === 'fixture', 'PILOT_DIAGNOSIS_MOCK_FIXTURE_REQUIRED');
    requireThat(hash(g.route) === hash(p.route) && hash(g.businesses) === hash([{ id: b.businessId, goalHash: hash(p.company.goal), sourceHosts: [], maxCalls: 1 }]), 'PILOT_DIAGNOSIS_ROUTE_OR_BUSINESS');
    requireThat(b.companyHash === hash(p.company) && b.companyVersion === p.company.version && b.bundleHash === hash(p.bundle) && hash(b.bundle) === b.bundleHash, 'PILOT_DIAGNOSIS_CONTEXT_CHANGED');
    requireThat(b.attemptId === p.request.requestId && b.requestHash === hash(p.request) && hash(b.request) === b.requestHash && b.bodyHash === p.sha256 && b.schemaHash === hash(understandingSchema), 'PILOT_DIAGNOSIS_REQUEST_CHANGED');
    requireThat(Number.isFinite(Date.parse(g.expiresAt)), 'PILOT_DIAGNOSIS_EXPIRY');
    requireThat(approved ? typeof g.approvedBy === 'string' && g.approvedBy.length > 0 && typeof g.approvalReference === 'string' && g.approvalReference.length > 0 : g.approvedBy === '' && g.approvalReference === '', 'PILOT_DIAGNOSIS_APPROVAL');
    return b;
}
/** Sign only an exact owner-approved proposal. Caller supplies signing keys through
 * the established protected CLI boundary; this function reads no API credential. */
export function signPilotDiagnosisProposal(root: string, input: { proposal: PilotDiagnosisGrant; expectedHash: string; approvalReference: string; principal: string; publicKey: string; privateKey: string; knowledge?: PilotKnowledge }) {
    requireThat(hash(input.proposal) === input.expectedHash, 'PILOT_DIAGNOSIS_APPROVAL_HASH');
    requireThat(input.principal.trim().length > 0 && input.approvalReference.trim().length > 0, 'PILOT_DIAGNOSIS_APPROVAL');
    requireThat(Date.parse(input.proposal.expiresAt) > Date.now(), 'PILOT_DIAGNOSIS_GRANT_EXPIRED');
    requireThat(!existsSync(join(root, authorizationFile)), 'PILOT_DIAGNOSIS_PRESERVE_SIGNED_GRANT');
    const ownStore = input.knowledge ? null : new StateStore(join(root, 'pilot.sqlite'));
    try {
        const knowledge = input.knowledge ?? new PilotKnowledge(ownStore!);
        validateBinding(knowledge, root, input.proposal, false);
        const grant = { ...structuredClone(input.proposal), approvedBy: input.principal, approvalReference: input.approvalReference };
        const envelope = signed(grant, input.privateKey); verified(envelope, input.publicKey); validateBinding(knowledge, root, grant, true);
        mkdirSync(join(root, 'auth'), { recursive: true });
        const anchor = join(root, 'auth', 'portfolio-owner.pub');
        if (existsSync(anchor)) requireThat(readFileSync(anchor, 'utf8') === input.publicKey, 'PILOT_DIAGNOSIS_TRUST_ANCHOR_MISMATCH');
        else writeFileSync(anchor, input.publicKey, { flag: 'wx' });
        writeFileSync(join(root, authorizationFile), JSON.stringify(envelope, null, 2) + '\n', { flag: 'wx' });
        knowledge.store.record(grant.accountScope, 'exact-approval', 'PilotDiagnosisApproval', { proposalHash: input.expectedHash, grantHash: hash(grant), principal: input.principal, approvalReference: input.approvalReference, signedAt: new Date().toISOString() });
        return { envelope, proposalHash: input.expectedHash, grantHash: hash(grant), credentialRead: false, providerRequests: 0 };
    } finally { ownStore?.close(); }
}
export function loadAuthorizedPilotDiagnosis(knowledge: PilotKnowledge, root: string, options: {
    envelope?: any; trustedPublicKey?: string;
    execution?: { kind: 'mock'; transport: typeof fetch } | { kind: 'live'; transport?: typeof fetch; credential?: () => string };
} = {}) {
    const envelope = options.envelope ?? JSON.parse(readFileSync(join(root, authorizationFile), 'utf8'));
    const publicKey = options.trustedPublicKey ?? readFileSync(join(root, 'auth', 'portfolio-owner.pub'), 'utf8');
    const g = verified(envelope, publicKey) as PilotDiagnosisGrant;
    validateBinding(knowledge, root, g, true);
    // Same lazy protected-file boundary as operations/trusted.ts; never a key in
    // the request, grant, logs or mock transport. No read occurs during loading.
    const credential = options.execution?.kind === 'live' && options.execution.credential ? options.execution.credential : () => { requireThat(typeof g.credentialFile === 'string' && isAbsolute(g.credentialFile), 'PILOT_DIAGNOSIS_CREDENTIAL_NOT_CONFIGURED'); return readFileSync(g.credentialFile, 'utf8').trim(); };
    const execution = options.execution?.kind === 'mock' ? options.execution : { kind: 'live' as const, credential, transport: options.execution?.transport ?? fetch };
    const models = new OperatingModels({ store: knowledge.store, root, envelope, trustedPublicKey: publicKey, execution });
    return { models, authorization: g, totals: () => models.totals(), async run() {
        const b = validateBinding(knowledge, root, g, true);
        const result = await models.invoke({ id: g.approvedBy, tenantId: 'mason', businessId: b.businessId, permissions: ['read', 'operate'] }, {
            businessId: b.businessId, goalHash: g.businesses[0].goalHash, sourceHosts: [], attemptId: b.attemptId, stage, request: structuredClone(b.request), schema: understandingSchema,
            validate: output => validateUnderstanding(b.bundle, output)
        });
        validateBinding(knowledge, root, g, true);
        const understanding = knowledge.acceptAuthorizedDiagnosis(b.businessId, { companyHash: b.companyHash, bundleHash: b.bundleHash, accountScope: g.accountScope, grantHash: hash(g), attemptId: b.attemptId, requestHash: b.bodyHash });
        return { understanding, result, accounting: models.totals(), attemptId: b.attemptId };
    } };
}
/** Historical accounting reads signatures and records only: changing source/code
 * must not turn previously incurred exposure into zero or require credentials. */
export function readPilotDiagnosisAccounting(store: StateStore, root: string) {
    const file = join(root, authorizationFile);
    const empty = { status: 'no_diagnosis_grant', mode: null, currency: 'USD', callsUsed: 0, callLimit: 0, countDispatches: 0, inferenceDispatches: 0, retrievalDispatches: 0, countRequests: 0, retrievals: 0, providerRequests: 0, provisionalMinor: 0, unknownCostAttempts: 0, settledMinor: null, retainedMinor: 0, remainingMinor: 0, countBufferMinor: 0, accountIdentity: null };
    if (!existsSync(file)) {
        const orphaned = store.db.prepare("SELECT body FROM entities WHERE kind IN ('model-attempt','experiment-account')").all().some(row => { const value = JSON.parse(String(row.body)); return value.scope?.dataPolicyVersion === 'owner-selected-diagnosis-v1' || value.limits?.allocations?.some((a: any) => a.metadataKey === 'stage' && a.value === stage); });
        return orphaned ? { ...empty, status: 'unavailable', reason: 'Diagnosis ledger exists but its signed authorization is unavailable; preserve the records and restore the matching grant.', callsUsed: null, callLimit: null, countDispatches: null, inferenceDispatches: null, retrievalDispatches: null, countRequests: null, retrievals: null, providerRequests: null, provisionalMinor: null, unknownCostAttempts: null, retainedMinor: null, remainingMinor: null, countBufferMinor: null } : empty;
    }
    try {
        const g = verified(JSON.parse(readFileSync(file, 'utf8')), readFileSync(join(root, 'auth', 'portfolio-owner.pub'), 'utf8')) as PilotDiagnosisGrant;
        requireThat(g.pilotDiagnosis?.kind === 'first-owner-pilot-diagnosis-032-v1' && g.root === resolve(root) && hash(g.accountScope) === hash(diagnosisScope(g.pilotDiagnosis.id)), 'PILOT_DIAGNOSIS_ACCOUNTING_SCOPE');
        const key = scopeKey(g.accountScope), account = store.get('experiment-account', key);
        requireThat(!account || account.authorizationHash === hash(g) && hash(account.limits) === hash(g.limits), 'PILOT_DIAGNOSIS_ACCOUNTING_BINDING');
        const prefix = key + '/', rows = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt' AND substr(key,1,?)=?").all(prefix.length, prefix).map(r => JSON.parse(String(r.body)));
        const reserved = rows.reduce((sum, r) => sum + r.reservation, 0), invoices = rows.filter(r => r.invoice), settled = invoices.reduce((sum, r) => sum + r.invoice.minorUnits, 0), countBuffer = g.limits.overheadReserve?.minor ?? 0;
        const countDispatches = rows.filter(r => r.countDispatchIntent).length, inferenceDispatches = rows.filter(r => r.inferenceDispatchIntent).length, retrievalDispatches = rows.reduce((sum, r) => sum + (store.get('response-job', prefix + r.id)?.retrievals ?? 0), 0);
        const knownCosts = rows.filter(r => r.cost?.status === 'provisional'), unknownCostAttempts = rows.filter(r => r.cost?.status !== 'provisional' && !r.invoice).length;
        return { ...empty, status: 'signed_ledger', mode: g.mode, callsUsed: rows.length, callLimit: 1, countDispatches, inferenceDispatches, retrievalDispatches,
            countRequests: g.mode === 'live' ? countDispatches : 0, retrievals: g.mode === 'live' ? retrievalDispatches : 0, providerRequests: g.mode === 'live' ? countDispatches + inferenceDispatches + retrievalDispatches : 0,
            provisionalMinor: rows.length && !knownCosts.length ? null : knownCosts.reduce((sum, r) => sum + r.cost.money.minorUnits, 0), unknownCostAttempts, settledMinor: invoices.length ? settled : null,
            retainedMinor: reserved + countBuffer, remainingMinor: g.limits.totalMinor - reserved - settled - countBuffer, countBufferMinor: countBuffer, accountIdentity: hash({ root: resolve(root), scope: g.accountScope, grantHash: hash(g) }) };
    } catch (error) { return { ...empty, status: 'unavailable', reason: (error as Error).message, callsUsed: null, callLimit: null, countDispatches: null, inferenceDispatches: null, retrievalDispatches: null, countRequests: null, retrievals: null, providerRequests: null, provisionalMinor: null, unknownCostAttempts: null, retainedMinor: null, remainingMinor: null, countBufferMinor: null }; }
}
