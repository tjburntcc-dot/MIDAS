import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { prepare, runWorkflow, status, approvalView, approve, open } from './runner.ts';
import { report } from './report.ts';
import { reviewInteractive } from './review.ts';
import { authorize, configFor, write, read, accountScope, checkGrant } from './config.ts';
import { ModelLedger } from '../experiment/ledger.ts';
import { hash, requireThat } from '../contracts.ts';
async function main() {
    const { positionals, values: v } = parseArgs({ allowPositionals: true, options: { root: { type: 'string' }, run: { type: 'string' }, mode: { type: 'string' }, file: { type: 'string' }, fault: { type: 'string' }, crash: { type: 'string' }, checkpoint: { type: 'string' } } });
    const command = positionals[0], root = resolve(v.root ?? 'var/workflow-029');
    let result: any;
    if (command === 'prepare')
        result = prepare(root, (v.mode ?? 'mock') as any);
    else if (command === 'preflight') {
        const c = configFor(root);
        result = { ready: true, mode: c.mode, implementationHash: c.implementationHash, casesHash: c.casesHash, providerCalls: 0, callMap: ['investigate evidence', 'decide and draft', 'review and revise', 'inspect readback'], humanDependencies: ['exact publication approval', 'independent semantic review and measured correction time'], liveAuthorized: existsSync(join(root, 'authorization.json')) };
        write(root, 'preflight.json', result);
    }
    else if (command === 'run' || command === 'resume') {
        requireThat(v.run, 'RUN_REQUIRED');
        result = await runWorkflow(root, v.run!, { fault: v.fault, crash: v.crash, checkpoint: v.checkpoint });
    }
    else if (command === 'review') {
        requireThat(v.run, 'RUN_REQUIRED');
        result = await reviewInteractive(root, v.run!);
    }
    else if (command === 'run-all') {
        const c = configFor(root);
        const results = [];
        for (const item of c.schedule) {
            if (c.mode === 'live' && item.stage !== 'smoke' && !existsSync(join(root, 'continuation.json')))
                break;
            results.push(await runWorkflow(root, item.runId));
        }
        result = results;
    }
    else if (command === 'reconcile-billing') {
        requireThat(v.file, 'SIGNED_BILLING_FILE_REQUIRED');
        const { config, store } = open(root);
        try {
            const g = checkGrant(root, config);
            const ledger = new ModelLedger(store, accountScope, g.hash, config.limits);
            ledger.reconcile(JSON.parse(readFileSync(v.file!, 'utf8')), readFileSync(join(root, 'auth/owner.pub'), 'utf8'), g.statement?.projectId ?? 'proj_OFFLINE_MOCK');
            result = ledger.totals();
        }
        finally {
            store.close();
        }
    }
    else if (command === 'status')
        result = status(root, v.run);
    else if (command === 'report') {
        const r = report(root);
        result = { status: r.status, path: join(root, 'reports/comparison.html'), accounting: r.accounting };
    }
    else if (command === 'authorize') {
        requireThat(v.file, 'APPROVED_FILE_REQUIRED');
        result = authorize(root, v.file!);
    }
    else if (command === 'approve') {
        requireThat(v.run, 'RUN_REQUIRED');
        const view = approvalView(root, v.run!);
        console.log(`Synthetic publication approval: ${view.runId}\n${view.consequence}\n${view.limits}\nPolicy: ${view.policyVersion}; maximum fixture charge: USD ${(view.cost.minorUnits / 100).toFixed(2)}\n\n${view.artifact.title}\n${view.artifact.steps.map((s: string) => '- ' + s).join('\n')}\n${view.artifact.answers.map((a: any) => a.topic + ': ' + a.text).join('\n')}\n\nDecision: ${view.decision.rationale}\nEvidence: ${view.evidence.map((r: any) => r.status + ': ' + (r.evidence ?? []).map((x: any) => x.source + ' / ' + x.id + ' = ' + x.value).join('; ')).join('\n')}\nExact proposal hash: ${view.proposalHash}`);
        const ui = createInterface({ input: process.stdin, output: process.stdout });
        const started = Date.now();
        try {
            const answer = await ui.question('Approve this exact synthetic publication? Type APPROVE or DENY: ');
            if (answer.trim() === 'APPROVE')
                result = approve(root, v.run!, view.proposalHash, 'human', Math.round((Date.now() - started) / 1000));
            else
                result = { approved: false, nextAction: 'Run remains waiting; no effect dispatched.' };
        }
        finally {
            ui.close();
        }
    }
    else if (command === 'demo') {
        const c = configFor(root);
        requireThat(c.mode === 'mock', 'DEMO_REQUIRES_MOCK');
        for (const item of c.schedule) {
            let s = await runWorkflow(root, item.runId);
            if (s.checkpoint === 'waiting_approval') {
                const view = approvalView(root, item.runId);
                approve(root, item.runId, view.proposalHash, 'fixture-demo');
                s = await runWorkflow(root, item.runId);
            }
            if (s.checkpoint === 'reconciling')
                await runWorkflow(root, item.runId);
        }
        const r = report(root);
        result = { status: r.status, demonstrationApproval: 'Explicit fixture-demo principals; no human approval fabricated', providerRequests: 0, report: join(root, 'reports/comparison.html') };
    }
    else if (command === 'continue') {
        const c = configFor(root);
        requireThat(v.file, 'REVIEW_FILE_REQUIRED');
        const review = JSON.parse(readFileSync(v.file!, 'utf8'));
        const r = report(root);
        requireThat(c.mode === 'live' && r.observations.filter((x: any) => x.episode === 'W-001').every((x: any) => x.deterministicAccepted), 'DIAGNOSTIC_NOT_COMPLETE');
        requireThat(r.observations.filter((x: any) => x.episode === 'W-001').every((x: any) => x.semanticReview), 'DIAGNOSTIC_REVIEW_REQUIRED');
        requireThat(review.configHash === hash(c) && review.reviewer === 'Mason' && review.transportAccountingValid === true && review.reviewUsable === true && review.continue === true, 'EXPLICIT_DIAGNOSTIC_REVIEW_REQUIRED');
        write(root, 'continuation.json', review, true);
        result = { continuationRecorded: true };
    }
    else
        throw Error('Commands: prepare, preflight, run, approve, resume, status, demo, report, review, authorize, continue');
    console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(JSON.stringify({ error: e.code ?? 'WORKFLOW_ERROR', message: e.message })); process.exitCode = 1; });
