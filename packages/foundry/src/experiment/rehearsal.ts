import { join } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
import { StateStore } from '../state.ts';
import { hash, requireThat } from '../contracts.ts';
import { readJSON, writeJSON, keypair } from './config.ts';
import { ModelLedger } from './ledger.ts';
import { providerPort } from './provider.ts';
import { requestFor, roleArtifact } from './workflow.ts';
import { offlineOutput, objectiveChecks } from './task.ts';
import { analyze } from './analysis.ts';
import type { ScoredAttempt } from './analysis.ts';
import { sign } from 'node:crypto';
import { canonical, scopeKey } from '../contracts.ts';
export async function rehearse(root: string) {
    requireThat(!existsSync(join(root, 'rehearsal.sqlite')), 'REHEARSAL_ALREADY_EXISTS');
    const spec = readJSON(join(root, 'spec.json')), scope = { ...spec.scope, runId: 'REHEARSAL-028' }, store = new StateStore(join(root, 'rehearsal.sqlite'));
    const ledger = new ModelLedger(store, scope, 'offline-not-authorization', spec.limits), cases = readJSON(join(root, 'cases.json')).filter((c: any) => c.split === 'development');
    const credentialFile = join(root, 'auth', 'mock.credential');
    writeFileSync(credentialFile, 'OFFLINE-MOCK-NOT-AN-API-KEY', { flag: 'wx', mode: 0o600 });
    const scored: ScoredAttempt[] = [], billing = keypair();
    let networkCalls = 0;
    try {
        for (const c of cases)
            for (const condition of ['baseline', 'challenger'] as const) {
                // Identical fixture output in both conditions intentionally yields no improvement.
                const role = roleArtifact(root, 'baseline', spec.route.model);
                role.version = condition === 'baseline' ? 'fixture-baseline' : 'fixture-challenger';
                const request = requestFor(scope, role, c, 0, 'development');
                const transport: typeof fetch = async (url, init) => {
                    networkCalls++;
                    const body = JSON.parse(String(init?.body));
                    requireThat(!JSON.stringify(body).includes('requiredEvidence'), 'LABEL_LEAK');
                    if (String(url).endsWith('/input_tokens'))
                        return new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: 500 }));
                    return new Response(JSON.stringify({ id: 'MOCK-' + request.requestId, model: spec.route.model, status: 'completed', usage: { input_tokens: 500, output_tokens: 100 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(offlineOutput(c)) }] }] }));
                };
                const port = providerPort(spec.route, 'proj_offline', credentialFile, ledger.port('development', { source: 'offline-mock', caseId: c.id, condition }), transport);
                const result = await port.run(request);
                ledger.finish(request.requestId, result, null);
                const row = ledger.get(request.requestId);
                requireThat(row.reservation === 13 && row.cost.status === 'provisional', 'RESERVATION_LOST');
                const statement = { kind: 'closed_attempt_invoice', projectId: 'proj_offline', authorizationHash: 'offline-not-authorization', scope: scopeKey(scope), attemptId: row.id, requestHash: row.requestHash, providerRequestId: row.providerRequestId, actual: { minorUnits: 1, currency: 'USD' }, evidenceSha256: hash('mock invoice'), issuer: 'mock-billing', closedAt: new Date().toISOString() };
                ledger.reconcile({ statement, signature: sign(null, Buffer.from(canonical(statement)), billing.privateKey).toString('base64') }, billing.publicKey, 'proj_offline');
                scored.push({ id: row.id, caseId: c.id, cluster: c.cluster, family: c.family, repeat: 0, condition, accepted: objectiveChecks(c, result.output).accepted, critical: false, costMinor: 1, latencyMs: 100, correctionSeconds: 0, failed: false });
            }
        const report = { mode: 'offline-mock', actualProviderCalls: 0, mockTransportCalls: networkCalls, protectedBoundaryEstablished: false, protectedCasesCreated: 0, attempts: scored.length, simulatedLedger: ledger.totals(), analysis: analyze(scored, { ...spec.analysis, caseCount: 12, clusters: 12, repeats: 1 }), measuredRoleImprovement: null, reviewEffort: 'fixture zeros only; no human review measured' };
        writeJSON(join(root, 'reports', 'offline-rehearsal.json'), report, true);
        return report;
    }
    finally {
        store.close();
    }
}
