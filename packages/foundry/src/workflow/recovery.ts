import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { verify } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { canonical, hash, rawHash, requireThat } from '../contracts.ts';
import type { Limits } from '../experiment/ledger.ts';

export const recoveryVersion = 'workflow-029-recovery-r1';
export const w006Version = 'workflow-029-w006-v1';
export const w006RunId = 'W-006-single-v1';
export const w006Schedule = [{episode:'W-006',configuration:'single',runId:w006RunId,stage:'smoke'}];
export const isLinkedVersion = (value: string) => value === recoveryVersion || value === w006Version;
export const linkedSchedule = (value: string) => value === w006Version ? w006Schedule : recoverySchedule;
export const recoveryRunId = 'W-001-single-r1';
export const recoverySchedule = [{ episode: 'W-001', configuration: 'single', runId: recoveryRunId, stage: 'smoke' }];
const read = (root: string, name: string) => JSON.parse(readFileSync(join(root, name), 'utf8'));

/** Read historical evidence without rewriting any grant, attempt or reservation. */
export function captureParent(parentRoot: string, mode: string) {
    parentRoot = resolve(parentRoot);
    const config = read(parentRoot, 'config.json');
    requireThat(config.mode === mode && config.version === 'workflow-029-value-v2', 'RECOVERY_PARENT_CONFIGURATION');
    let grantHash = hash(config), grantFileHash: string | null = null;
    const parentRequest = read(parentRoot, 'authorization.request.json');
    if (mode === 'live') {
        const envelope = read(parentRoot, 'authorization.json'), s = envelope.statement;
        requireThat(verify(null, Buffer.from(canonical(s)), readFileSync(join(parentRoot, 'auth/owner.pub')), Buffer.from(envelope.signature, 'base64')), 'RECOVERY_PARENT_SIGNATURE');
        requireThat(s.approved === true && s.configHash === hash(config) && s.root === parentRoot && hash({ ...s, approved: false }) === hash(read(parentRoot, 'authorization.request.json')), 'RECOVERY_PARENT_GRANT_BINDING');
        requireThat(Date.parse(s.expiresAt) > Date.now(), 'GRANT_EXPIRED');
        grantHash = hash(s); grantFileHash = rawHash(readFileSync(join(parentRoot, 'authorization.json')));
    }
    const db = new DatabaseSync(join(parentRoot, 'workflow.sqlite'), { readOnly: true });
    let rows: any[];
    try { rows = db.prepare("SELECT body FROM entities WHERE kind='model-attempt' ORDER BY key").all().map(x => JSON.parse(String(x.body))); } finally { db.close(); }
    requireThat(rows.length === 1 && rows[0].id === 'W-001-single-investigate' && rows[0].finishedAt && rows[0].errorCode && rows[0].countDispatchIntent, 'RECOVERY_PARENT_NOT_CLOSED_FAILURE');
    const failed = rows[0];
    requireThat(failed.inferenceDispatchIntent === true && failed.errorCode === 'WORKFLOW_OUTPUT_INVALID' && failed.observation?.model === 'gpt-6-astra' && failed.observation?.status === 'completed' && failed.observation?.inferenceHTTP?.httpStatus === 200 && failed.observation?.tokenCount?.httpStatus === 200, 'RECOVERY_PARENT_CAUSE_MISMATCH');
    if (mode === 'live') requireThat(hash(rows) === '4370faec1027ba9af995894b23c067408856e69f5df0a57cbdb923e283597d79', 'RECOVERY_PARENT_OBSERVATION_MISMATCH');
    const retainedMinor = rows.reduce((n, a) => n + a.reservation, 0), settledMinor = rows.reduce((n, a) => n + (a.invoice?.minorUnits ?? 0), 0);
    const sharedCountBufferMinor = config.limits.overheadReserve?.minor ?? 0;
    requireThat(sharedCountBufferMinor === 504 && config.limits.totalMinor === 3000 && config.limits.astraCountRequests === 48, 'RECOVERY_PARENT_LIMITS');
    requireThat(retainedMinor === 52 && settledMinor === 0 && retainedMinor + settledMinor + sharedCountBufferMinor === 556, 'RECOVERY_PARENT_EXPOSURE_MISMATCH');
    return { parentRoot, mode, projectId: parentRequest.projectId, credentialFile: parentRequest.credentialFile, expiresAt: parentRequest.expiresAt, parentConfigHash: hash(config), parentGrantHash: grantHash, parentGrantFileHash: grantFileHash, parentImplementationHash: config.implementationHash, parentRouteHash: hash(config.route), parentRowsHash: hash(rows), failedAttemptId: rows[0].id, failedRequestHash: rows[0].requestHash, priorAttempts: rows.length, priorCounts: rows.filter(a => a.countDispatchIntent).length, retainedMinor, settledMinor, provisionalMinor: rows.reduce((n, a) => n + (a.cost.status === 'provisional' ? a.cost.money.minorUnits : 0), 0), sharedCountBufferMinor, exposureMinor: retainedMinor + settledMinor + sharedCountBufferMinor };
}

/** Continue only the closed W-001 account, carrying the original failure/buffer once. */
export function captureCompletedParent(parentRoot: string, mode: string) {
    parentRoot = resolve(parentRoot);
    const config = read(parentRoot, 'config.json'), request = read(parentRoot, 'authorization.request.json');
    requireThat(config.version === recoveryVersion && config.mode === mode, 'W006_PARENT_REQUIRED');
    const ancestor = captureParent(config.link.parentRoot, mode);
    requireThat(hash(ancestor) === hash(config.link), 'RECOVERY_PARENT_EVIDENCE_CHANGED');
    let grantHash = hash(config), grantFileHash: string | null = null;
    if (mode === 'live') {
        const envelope = read(parentRoot, 'authorization.json'), statement = envelope.statement;
        requireThat(verify(null, Buffer.from(canonical(statement)), readFileSync(join(parentRoot,'auth/owner.pub')), Buffer.from(envelope.signature,'base64')), 'W006_PARENT_SIGNATURE');
        requireThat(statement.approved === true && statement.configHash === hash(config) && statement.root === parentRoot && hash({...statement,approved:false}) === hash(request), 'W006_PARENT_GRANT_BINDING');
        requireThat(Date.parse(statement.expiresAt) > Date.now(), 'GRANT_EXPIRED');
        grantHash=hash(statement); grantFileHash=rawHash(readFileSync(join(parentRoot,'authorization.json')));
    }
    const db=new DatabaseSync(join(parentRoot,'workflow.sqlite'),{readOnly:true}); let rows:any[], run:any;
    try { rows=db.prepare("SELECT body FROM entities WHERE kind='model-attempt' ORDER BY key").all().map(x=>JSON.parse(String(x.body))); const runs=db.prepare("SELECT body FROM entities WHERE kind='run'").all().map(x=>JSON.parse(String(x.body))); requireThat(runs.length===1,'W006_PARENT_RUN_COUNT'); run=runs[0]; } finally {db.close();}
    requireThat(run.scope.runId===recoveryRunId && run.phase==='completed' && run.outcome?.operationalResult==='pass', 'W006_PARENT_NOT_COMPLETE');
    requireThat(rows.length===4 && rows.every(a=>a.finishedAt && !a.errorCode && a.result && a.countDispatchIntent && a.inferenceDispatchIntent && a.reservation===52 && !a.invoice && a.observation?.model==='gpt-6-astra'), 'W006_PARENT_ATTEMPTS');
    requireThat(new Set(rows.map(a=>a.request.task)).size===4 && rows.find(a=>a.request.task==='verify')?.result.output.status==='pass', 'W006_PARENT_INSPECTION');
    const priorAttempts=ancestor.priorAttempts+rows.length, priorCounts=ancestor.priorCounts+rows.filter(a=>a.countDispatchIntent).length;
    const retainedMinor=ancestor.retainedMinor+rows.reduce((n,a)=>n+a.reservation,0), settledMinor=ancestor.settledMinor+rows.reduce((n,a)=>n+(a.invoice?.minorUnits??0),0);
    const exposureMinor=ancestor.sharedCountBufferMinor+retainedMinor+settledMinor;
    requireThat(priorAttempts===5 && priorCounts===5 && exposureMinor===764 && hash(config.route)===ancestor.parentRouteHash,'W006_PARENT_ACCOUNT');
    return {...ancestor,parentRoot,projectId:request.projectId,credentialFile:request.credentialFile,expiresAt:request.expiresAt,parentConfigHash:hash(config),parentGrantHash:grantHash,parentGrantFileHash:grantFileHash,parentImplementationHash:config.implementationHash,parentRouteHash:hash(config.route),parentRowsHash:hash(rows),parentRunHash:hash(run),ancestor,priorAttempts,priorCounts,retainedMinor,settledMinor,provisionalMinor:ancestor.provisionalMinor+rows.reduce((n,a)=>n+(a.cost.status==='provisional'?a.cost.money.minorUnits:0),0),exposureMinor};
}

export function recoveryLimits(link: ReturnType<typeof captureParent>, runId = recoveryRunId): Limits {
    requireThat(link.priorAttempts + 4 <= 48 && link.priorCounts + 4 <= 48 && link.exposureMinor + 208 <= 3000, 'RECOVERY_COMBINED_LIMITS');
    return { totalMinor: 3000, carryIn: [{ id: 'original-029-account-including-shared-count-buffer', exposureMinor: link.exposureMinor, evidenceHash: link.parentRowsHash }], concurrency: 1, astraCountRequests: 4, stages: { smoke: { minor: 208, attempts: 4 }, development: { minor: 0, attempts: 0 }, validation: { minor: 0, attempts: 0 }, evaluation: { minor: 0, attempts: 0 } }, allocations: [{ metadataKey: 'workflow', value: runId, attempts: 4, minor: 208 }, { metadataKey: 'configuration', value: 'single', attempts: 4, minor: 208 }] };
}

export function validateRecovery(c: any) {
    const actual = c.version === w006Version ? captureCompletedParent(c.link.parentRoot,c.mode) : captureParent(c.link.parentRoot, c.mode);
    requireThat(hash(actual) === hash(c.link), 'RECOVERY_PARENT_EVIDENCE_CHANGED');
    requireThat(hash(c.route) === actual.parentRouteHash, 'RECOVERY_ROUTE_CHANGED');
    requireThat(hash(c.limits) === hash(recoveryLimits(actual,linkedSchedule(c.version)[0].runId)) && hash(c.schedule) === hash(linkedSchedule(c.version)), 'RECOVERY_SCOPE_CHANGED');
    requireThat(resolve(c.root) !== actual.parentRoot, 'RECOVERY_REQUIRES_FRESH_ROOT');
    return actual;
}

/** One amendment binding, including failed count/admission, no historical ledger reset. */
export function claimRecovery(c: any) {
    validateRecovery(c);
    const path = join(dirname(c.link.parentRoot), c.version + '-account.json');
    const binding = { root: c.root, configHash: hash(c), parentRoot: c.link.parentRoot, parentGrantHash: c.link.parentGrantHash, amendment: c.version };
    if (existsSync(path)) requireThat(hash(JSON.parse(readFileSync(path, 'utf8'))) === hash(binding), 'RECOVERY_AMENDMENT_ALREADY_BOUND');
    else writeFileSync(path, JSON.stringify(binding, null, 2) + '\n', { flag: 'wx' });
}

export function checkRecoveryBinding(c: any) {
    validateRecovery(c);
    if (c.mode === 'live') {
        const binding = read(dirname(c.link.parentRoot), c.version + '-account.json');
        requireThat(binding.root === c.root && binding.configHash === hash(c) && binding.parentGrantHash === c.link.parentGrantHash, 'RECOVERY_AMENDMENT_BINDING');
    }
}

export function recoveryAdmission(c: any, rows: any[], runId: string) {
    requireThat(runId === linkedSchedule(c.version)[0].runId, 'RECOVERY_WORKFLOW_ONLY');
    validateRecovery(c);
    requireThat(c.link.priorAttempts + rows.length < 48 && c.link.priorCounts + rows.length < 48, 'RECOVERY_COMBINED_CALL_CAP');
    requireThat(rows.length < 4, 'RECOVERY_ADMISSION_CAP');
}
