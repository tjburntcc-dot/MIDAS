import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { StateStore } from '../state.ts';
import { identifier, requireThat } from '../contracts.ts';
import type { Scope } from '../contracts.ts';
import { BusinessLoop } from './core.ts';
import { supportBrief, execute, approval, approvePlan } from './support-adapter.ts';
const escape = (v: unknown) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function main() {
    const { positionals, values: v } = parseArgs({ allowPositionals: true, options: { root: { type: 'string' }, plan: { type: 'string' }, file: { type: 'string' }, expected: { type: 'string' }, reason: { type: 'string' }, tenant: { type: 'string' }, business: { type: 'string' }, crash: { type: 'string' } } });
    const command = positionals[0], root = resolve(v.root ?? 'var/business-foundation-029'), id = v.plan ?? 'first-plan';
    identifier(id);
    mkdirSync(root, { recursive: true });
    const binding = join(root, 'business-scope.json');
    if (command === 'init' && !existsSync(binding)) {
        const s: Scope = { tenantId: v.tenant ?? 'synthetic-founder', businessId: v.business ?? 'connected-business', runId: 'business-memory', dataPolicyVersion: 'business-policy-v1', mode: 'fixture' };
        identifier(s.tenantId);
        identifier(s.businessId);
        writeFileSync(binding, JSON.stringify(s, null, 2), { flag: 'wx' });
    }
    const s = JSON.parse(readFileSync(binding, 'utf8')) as Scope, store = new StateStore(join(root, 'business.sqlite'));
    requireThat((!v.tenant || s.tenantId === v.tenant) && (!v.business || s.businessId === v.business), 'BUSINESS_ALREADY_BOUND');
    const loop = new BusinessLoop(store, s, { id: 'local-founder-session', tenantId: s.tenantId, businessId: s.businessId, permissions: ['read', 'operate'] });
    let result: any;
    try {
        if (command === 'init')
            result = loop.revise(v.file ? JSON.parse(readFileSync(v.file, 'utf8')) : supportBrief(), null, 'Initialize partial synthetic business understanding; no complete-understanding claim');
        else if (command === 'revise') {
            requireThat(v.file && v.expected && v.reason, 'FILE_EXPECTED_REVISION_AND_REASON_REQUIRED');
            result = loop.revise(JSON.parse(readFileSync(v.file, 'utf8')), Number(v.expected), v.reason);
        }
        else if (command === 'plan')
            result = loop.plan(id);
        else if (command === 'propose-procedure') {
            requireThat(v.file, 'CANDIDATE_FILE_REQUIRED');
            const c = JSON.parse(readFileSync(v.file, 'utf8'));
            result = loop.proposeProcedure(c.id, id, c.workerId, c.failureIndex, c.procedure, c.hypothesis, c.regressionRisk);
        }
        else if (command === 'freeze-comparison') {
            requireThat(v.file, 'SPEC_FILE_REQUIRED');
            const c = JSON.parse(readFileSync(v.file, 'utf8'));
            result = loop.freezeComparison(c.candidateId, c.spec);
        }
        else if (command === 'run' || command === 'resume')
            result = await execute(loop, id, root, { crash: v.crash });
        else if (command === 'approval')
            result = approval(loop, id);
        else if (command === 'approve') {
            const a = approval(loop, id);
            console.log(`${a.consequence}\nMaximum ${a.cost.minorUnits} simulated ${a.cost.currency} cents\n${a.artifact.title}\n${a.artifact.steps.join('\n')}\n${a.artifact.answers.map((x: any) => x.topic + ': ' + x.text).join('\n')}\nExact proposal: ${a.proposalHash}`);
            const ui = createInterface({ input: process.stdin, output: process.stdout });
            try {
                result = (await ui.question('Type APPROVE for this exact fixture action, or DENY: ')).trim() === 'APPROVE' ? approvePlan(loop, id, a.proposalHash) : { approved: false };
            }
            finally {
                ui.close();
            }
        }
        else if (command === 'demo') {
            if (!loop.getPlan(id))
                loop.plan(id);
            let status = await execute(loop, id, root);
            if (status.checkpoint === 'waiting_approval') {
                approvePlan(loop, id, approval(loop, id).proposalHash, true);
                status = await execute(loop, id, root);
            }
            if (status.checkpoint === 'reconciling')
                status = await execute(loop, id, root);
            result = { status, label: 'OFFLINE MOCK; explicit fixture-demo approval; no human or AI competence evidence', providerRequests: 0, nextAssessment: loop.assess() };
        }
        else if (command === 'status')
            result = { plan: loop.getPlan(id), assessment: loop.assess() };
        else if (command === 'report') {
            result = loop.report();
            writeFileSync(join(root, 'business-report.json'), JSON.stringify(result, null, 2) + '\n');
            const a = result.assessment;
            writeFileSync(join(root, 'business-report.html'), `<!doctype html><meta charset="utf-8"><title>MIDAS business loop</title><style>body{font:17px system-ui;max-width:1100px;margin:40px auto;line-height:1.5}pre{white-space:pre-wrap}td,th{border:1px solid #ccc;padding:10px}table{border-collapse:collapse}</style><h1>Connected business loop — offline foundation</h1><p>${escape(result.objective)}</p><p>Understanding: <b>partial</b>. Revision ${a.businessRevision}. No model or business competence is inferred from mock execution.</p><h2>Knowledge and uncertainty</h2><table><tr><th>Kind</th><th>Claim</th><th>Source</th><th>Current</th></tr>${a.claims.map((c: any) => `<tr><td>${escape(c.kind)}</td><td>${escape(c.statement)}</td><td>${escape(c.source)}</td><td>${c.current}</td></tr>`).join('')}</table><p>Dimensions without a current fact: ${escape(a.uncoveredDimensions.join(', '))}</p><h2>Bottlenecks and next action</h2><p>${escape(a.method)}</p><pre>${escape(JSON.stringify(a.candidates, null, 2))}</pre><h2>Plans, assignments and outcomes</h2>${result.plans.map((p: any) => `<h3>${escape(p.id)} — ${escape(p.status)}</h3><pre>${escape(JSON.stringify({ opportunity: p.opportunity, team: p.team, roleVersions: p.roleVersions, outcome: p.outcome }, null, 2))}</pre>`).join('')}<h2>Controlled adaptation and improvement</h2><pre>${escape(JSON.stringify(result.feedback, null, 2))}</pre><h2>Decision ownership</h2><pre>${escape(JSON.stringify(result.decisionOwners, null, 2))}</pre>`);
            result = { report: join(root, 'business-report.html'), json: join(root, 'business-report.json'), providerRequests: 0 };
        }
        else
            throw Error('Commands: init, revise, plan, run, approval, approve, resume, status, demo, report, propose-procedure, freeze-comparison');
        console.log(JSON.stringify(result, null, 2));
    }
    finally {
        store.close();
    }
}
main().catch(e => { console.error(JSON.stringify({ error: e.code ?? 'BUSINESS_ERROR', message: e.message })); process.exitCode = 1; });
