import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonical, hash, requireThat } from '../contracts.ts';
import type { Scope } from '../contracts.ts';
import type { ResponsesRoute } from '../model-port.ts';
import type { Limits } from '../experiment/ledger.ts';
export const version = 'workflow-029-v1';
export const configurations = ['single', 'team'] as const;
export type Configuration = typeof configurations[number];
export const route: ResponsesRoute = { authorizationId: 'workflow-029', model: 'gpt-6-astra', reasoningEffort: 'high', serviceTier: 'default', inputTokenCeiling: 8192, maxOutputTokens: 8192, deadlineMs: 180000, maxCallCost: { minorUnits: 52, currency: 'USD' }, pricing: { inputMinorPerMillion: 1250, outputMinorPerMillion: 5000, source: 'https://developers.openai.com/api/docs/models/gpt-6-astra', effectiveAt: '2026-09-11T00:00:00Z' } };
export const accountScope: Scope = { tenantId: 'workflow-lab', businessId: 'experiment-029', runId: 'model-account', dataPolicyVersion: 'workflow-policy-v1', mode: 'fixture' };
export function schedule() { return Array.from({ length: 6 }, (_, i) => { const episode = 'W-' + String(i + 1).padStart(3, '0'); return (i % 2 ? ['team', 'single'] : ['single', 'team']).map(configuration => ({ episode, configuration, runId: episode + '-' + configuration, stage: i === 0 ? 'smoke' : 'development' })); }).flat(); }
export function limits(): Limits { return { totalMinor: 3000, overheadReserve: { minor: 504, reason: 'Conservative unpriced supporting-count exposure buffer; not a provider price or historical transfer' }, concurrency: 1, astraCountRequests: 48, stages: { smoke: { minor: 416, attempts: 8 }, development: { minor: 2080, attempts: 40 }, validation: { minor: 0, attempts: 0 }, evaluation: { minor: 0, attempts: 0 } }, allocations: [...schedule().map(x => ({ metadataKey: 'workflow', value: x.runId, attempts: 4, minor: 208 })), ...configurations.map(value => ({ metadataKey: 'configuration', value, attempts: 24, minor: 1248 }))] }; }
export function read(root: string, name: string) { return JSON.parse(readFileSync(join(root, name), 'utf8')); }
export function write(root: string, name: string, value: unknown, exclusive = false) { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w' }); }
export function implementationHash() { const base = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const files: string[] = []; function walk(p: string) { for (const entry of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, entry.name);
    if (entry.isDirectory())
        walk(f);
    else if (f.endsWith('.ts') && !f.endsWith('.test.ts'))
        files.push(f);
} } walk(base); return hash(files.sort().map(p => ({ path: p.slice(base.length).replaceAll('\\', '/'), bytes: readFileSync(p, 'utf8') }))); }
export function prepareConfig(root: string, mode: 'mock' | 'live', cases: any) {
    requireThat(mode === 'mock' || mode === 'live', 'EXECUTION_MODE_INVALID');
    root = resolve(root);
    requireThat(!existsSync(join(root, 'config.json')), 'ROOT_ALREADY_PREPARED');
    mkdirSync(root, { recursive: true });
    const keys = generateKeyPairSync('ed25519');
    mkdirSync(join(root, 'auth'), { recursive: true });
    writeFileSync(join(root, 'auth', 'owner.key'), keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
    writeFileSync(join(root, 'auth', 'owner.pub'), keys.publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
    const config = { version, mode, root, implementationHash: implementationHash(), casesHash: hash(cases), schedule: schedule(), route, limits: limits(), preparedAt: new Date().toISOString(), provenance: mode === 'mock' ? 'OFFLINE MOCK — no model competence or external spending' : 'PROSPECTIVE LIVE — separate signed authorization required' };
    write(root, 'config.json', config, true);
    write(root, 'episodes.json', cases, true);
    write(root, 'authorization.request.json', { kind: 'workflow-execution-grant', version, approved: false, root, configHash: hash(config), implementationHash: config.implementationHash, projectId: 'proj_H01ORqdOPQM6vdGwQYsqFL5r', credentialFile: 'C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key', route, limits: limits(), data: 'synthetic workflow episodes only; no customer/protected data', expiresAt: '2026-09-25T22:00:00Z', reviewer: 'Mason', humanMinutes: 210, recoveryAdmissions: 0, allowProtected: false, allowBusinessActions: false }, true);
    write(root, 'continuation.request.json', { configHash: hash(config), reviewer: 'Mason', transportAccountingValid: false, reviewUsable: false, continue: false }, true);
    return config;
}
export function configFor(root: string) { root = resolve(root); const c = read(root, 'config.json'); requireThat(c.version === version && c.root === root, 'WORKFLOW_ROOT_BINDING'); requireThat(c.implementationHash === implementationHash(), 'IMPLEMENTATION_CHANGED'); requireThat(c.casesHash === hash(read(root, 'episodes.json')), 'CASE_MANIFEST_CHANGED'); requireThat(hash(c.route) === hash(route) && hash(c.limits) === hash(limits()) && hash(c.schedule) === hash(schedule()), 'CONFIGURATION_CHANGED'); return c; }
export function authorize(root: string, approvalFile: string) { const c = configFor(root); requireThat(c.mode === 'live', 'LIVE_GRANT_ROOT_REQUIRED'); const request = read(root, 'authorization.request.json'), approval = JSON.parse(readFileSync(approvalFile, 'utf8')); requireThat(approval.approved === true && hash({ ...approval, approved: false }) === hash(request), 'EXACT_APPROVED_GRANT_REQUIRED'); requireThat(hash(approval.route) === hash(c.route) && hash(approval.limits) === hash(c.limits) && approval.allowProtected === false && approval.allowBusinessActions === false && approval.recoveryAdmissions === 0, 'GRANT_LIMITS_MISMATCH'); requireThat(Date.parse(approval.expiresAt) > Date.now(), 'GRANT_EXPIRED'); const signature = sign(null, Buffer.from(canonical(approval)), readFileSync(join(root, 'auth', 'owner.key'))).toString('base64'); write(root, 'authorization.json', { statement: approval, signature }, true); return { signed: true, grantHash: hash(approval) }; }
export function checkGrant(root: string, c: any) { if (c.mode === 'mock')
    return { hash: hash(c), statement: null }; requireThat(existsSync(join(root, 'authorization.json')), 'LIVE_EXECUTION_NOT_AUTHORIZED'); const e = read(root, 'authorization.json'), s = e.statement; requireThat(verify(null, Buffer.from(canonical(s)), readFileSync(join(root, 'auth', 'owner.pub')), Buffer.from(e.signature, 'base64')), 'GRANT_SIGNATURE_INVALID'); requireThat(hash(s.route) === hash(c.route) && hash(s.limits) === hash(c.limits) && s.allowProtected === false && s.allowBusinessActions === false && s.recoveryAdmissions === 0, 'GRANT_LIMITS_MISMATCH'); requireThat(s.approved === true && s.configHash === hash(c) && s.root === resolve(root) && s.implementationHash === c.implementationHash && hash({ ...s, approved: false }) === hash(read(root, 'authorization.request.json')), 'GRANT_BINDING_MISMATCH'); requireThat(Date.parse(s.expiresAt) > Date.now(), 'GRANT_EXPIRED'); return { hash: hash(s), statement: s }; }
