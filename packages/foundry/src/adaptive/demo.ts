/** Explicit scripted fixture. This seeds the existing owner product, not a new runner.
 * No model, credential, network, account, or host shell is invoked. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PilotService } from '../pilot/service.ts';
import { PortfolioEngine } from '../portfolio/engine.ts';
import { serviceBriefFiles } from '../portfolio/products.ts';
import { mockResult } from '../portfolio/worker.ts';
import { requireThat } from '../contracts.ts';
import { AdaptiveWorkTools } from './tools.ts';
import type { ExecutorBackend } from './executor.ts';

const ID = 'adaptive-import-lab-fixture';
const RECEIPT = 'adaptive-import-lab-fixture-v1';
const action = (payload: any) => ({ action: 'tool', reason: 'Explicit scripted acquisition/reuse fixture; not autonomous model reasoning.', toolCall: { name: 'adaptive.perform', arguments: { payload: JSON.stringify(payload) } } });
const replacement = (content: string, expectedHash: string) => ({ action: 'tool', reason: 'Deliver the fixture supplier-normalization operating brief with retained provenance.', toolCall: { name: 'workspace.replace', arguments: { path: 'brief.json', content, expectedHash, query: null, url: null } } });

/** Restricted data transformer: executes only this checked development-authored function.
 * Config selects a delimiter. It cannot supply JavaScript or arbitrary commands. */
const backend: ExecutorBackend = { async execute(command) {
    try {
        requireThat(command.argv.length === 1 && ['fixture-normalizer-test', 'fixture-parent-job', 'fixture-input-check'].includes(command.argv[0]), 'FIXTURE_COMMAND_UNSUPPORTED');
        const config = JSON.parse(readFileSync(join(command.workspace, 'normalizer.json'), 'utf8'));
        requireThat(config.delimiter === ',' || config.delimiter === '|', 'FIXTURE_DELIMITER');
        const lines = readFileSync(join(command.workspace, 'input.txt'), 'utf8').trim().split(/\r?\n/).map(line => line.split(config.delimiter));
        requireThat(lines[0].join(',') === 'sku,quantity,unit_price' && lines.length > 1, 'FIXTURE_UNSUPPORTED_FEED_DELIMITER');
        const records = lines.slice(1).map(fields => {
            requireThat(fields.length === 3 && fields[0].length > 0 && /^\d+$/.test(fields[1]) && /^\d+(\.\d{1,2})?$/.test(fields[2]), 'FIXTURE_INVALID_RECORD');
            const quantity = Number(fields[1]), priceMinor = Math.round(Number(fields[2]) * 100);
            return { sku: fields[0], quantity, priceMinor, totalMinor: quantity * priceMinor };
        });
        const result = { records, totalMinor: records.reduce((total, record) => total + record.totalMinor, 0), provenance: 'development-authored transformer executing synthetic fixture data' };
        writeFileSync(join(command.workspace, 'normalized.json'), JSON.stringify(result, null, 2));
        return { status: 'completed', exitCode: 0, stdout: JSON.stringify(result), stderr: '', truncated: false, isolation: 'injected' };
    } catch (error) {
        return { status: 'failed', exitCode: 1, stdout: '', stderr: String((error as Error).message), truncated: false, isolation: 'injected' };
    }
} };

export async function seedAdaptiveFixture(service: PilotService, options: { fixture: true }) {
    requireThat(options?.fixture === true, 'EXPLICIT_FIXTURE_OPT_IN_REQUIRED');
    const old = service.store.get('adaptive-demo-seed', RECEIPT);
    if (old) return old;
    let company = service.store.get('pilot-company', ID);
    if (!company) company = service.knowledge.createCompany({ id: ID, name: 'Adaptive import lab — scripted fixture', mode: 'fixture',
        goal: 'Normalize synthetic supplier feeds and produce checked local operating briefs.',
        notes: 'Scripted demonstration: delimiter failure, repair, retained candidate and later fixture reuse. The solution and decisions are development-authored. No unfamiliar-obstacle competence or independent transfer is claimed.' });
    const plan = (taskId: string, title: string) => service.execution.plan({ taskId, business: company,
        sources: service.knowledge.sources(ID), workflow: 'response-packet',
        job: { title, outcome: 'Prepare normalized supplier records and a source-grounded operating handoff.', details: 'Synthetic input only; preserve the original data and report normalization checks. Do not contact suppliers or mutate accounts.' },
        adaptive: { prompt: 'lean', allowCommands: true, modelCalls: 32, localToolRuns: 64 } });
    const first = plan('acquire-normalizer', 'Supplier feed normalization — acquisition fixture');
    const second = plan('reuse-normalizer', 'Second supplier feed — reuse fixture');
    const tools = new AdaptiveWorkTools({ base: service.execution.tools, store: service.store, root: join(service.root, 'adaptive'),
        taskFor: id => service.execution.portfolio.getTask(id), evidence: service.execution.evidence, backend, provenance: 'fixture' });
    const makeBrief = (taskId: string, isSecond: boolean) => {
        const workspace = service.execution.tools.load(ID, taskId);
        const report = JSON.parse(serviceBriefFiles(workspace.inputs)[0].content);
        report.recommendation = { title: 'Review the normalized synthetic supplier records',
            basis: 'The injected transformer parsed the pipe-delimited fixture using a retained delimiter configuration. This demonstrates execution plumbing with scripted choices; it does not demonstrate autonomous discovery.',
            steps: [{ action: isSecond ? 'Inspect the second fixture result: SKU-C quantity 4 at 325 minor units; total 1300.' : 'Inspect the first fixture results: SKU-A quantity 2 at 1250 minor units and SKU-B quantity 3 at 400; total 3700.', owner: 'Fixture reviewer', successMeasure: 'Compare output rows and integer minor-unit totals against the synthetic input.' },
                { action: 'Keep the normalizer as an unqualified candidate until an actual independent task establishes applicability and useful results.', owner: 'Capability reviewer', successMeasure: 'Retained provenance stays fixture; no promotion or business outcome is inferred.' }] };
        report.unknowns = ['Actual-model discovery and adaptation have not run.', 'Real supplier formats, customer usefulness, independent review and economic benefit remain unobserved.'];
        report.obligations = [{ id: 'review-fixture', description: 'Inspect retained commands, files and checks before interpreting fixture mechanics.', owner: 'Fixture reviewer', status: 'open' }];
        const source = workspace.manifest.files.find((f: any) => f.path === 'brief.json');
        if (!source) throw new Error('FIXTURE_BRIEF_SOURCE_MISSING');
        return replacement(JSON.stringify(report, null, 2), source.sha256);
    };
    const engine = new PortfolioEngine({ portfolio: service.execution.portfolio, tools, evidence: service.execution.evidence,
        prepareTask: service.execution.engine.prepareTask, validateTask: task => service.execution.assertContextCurrent(task.id),
        model: { kind: 'offline_mock', async run(call) {
            const taskId = [first.id, second.id].find(id => service.store.get('portfolio-execution', id)?.index !== undefined && service.execution.portfolio.getTask(id).status === 'running');
            requireThat(taskId, 'FIXTURE_TASK_NOT_FOUND');
            const state = service.store.get('portfolio-execution', taskId!); const obs = state.observations;
            const i = state.index; let output: any;
            if (taskId === first.id) {
                const episodeId = obs[3]?.result?.output?.id;
                const sequence = [
                    () => action({ action: 'write', path: 'normalizer.json', content: '{"delimiter":","}', expectedHash: null }),
                    () => action({ action: 'write', path: 'input.txt', content: 'sku|quantity|unit_price\nSKU-A|2|12.50\nSKU-B|3|4.00', expectedHash: null }),
                    () => action({ action: 'command', argv: ['fixture-normalizer-test'] }),
                    () => action({ action: 'episode', type: 'open', objective: 'Normalize supplier feed before preparing the operating handoff', obstacle: 'Initial delimiter assumption rejected the synthetic supplier header', obstacleEvidence: [obs[2].result.observationId] }),
                    () => action({ action: 'episode', type: 'diagnose', episodeId, missingCapability: 'Pipe-delimited supplier normalization', alternatives: [{ approach: 'change scoped delimiter configuration', reason: 'The fixture contains a stable three-column pipe header; no package or network is required.' }], selectedApproach: 'change scoped delimiter configuration' }),
                    () => action({ action: 'patch', path: 'normalizer.json', expectedHash: obs[0].result.output.sha256, edits: [{ find: '","', replace: '"|"' }] }),
                    () => action({ action: 'episode', type: 'acquire', episodeId, package: { purpose: 'Normalize three-column pipe-delimited supplier records', preconditions: ['input readable'], inputs: ['supplier feed'], outputs: ['normalized records and integer totals'], procedure: 'Inspect header and values; use the scoped normalizer with the retained delimiter; inspect normalized rows and arithmetic.', files: [{ path: 'normalizer.json', sha256: obs[5].result.output.sha256 }], dependencies: ['development-authored injected fixture transformer'], effects: ['project-files', 'isolated-command'], tests: ['records-check'], failureModes: ['quoted delimiters', 'unrecognized header', 'invalid numeric values'], sourceRefs: [obs[2].result.observationId] } }),
                    () => action({ action: 'command', argv: ['fixture-normalizer-test'] }),
                    () => action({ action: 'verify', episodeId, checks: [{ id: 'records-check', operationId: obs[7].result.observationId }] }),
                    () => action({ action: 'command', argv: ['fixture-parent-job'] }),
                    () => action({ action: 'episode', type: 'resume', episodeId, evidenceRef: obs[9].result.observationId }),
                    () => action({ action: 'episode', type: 'retain', episodeId }),
                    () => makeBrief(first.id, false),
                    () => ({ action: 'complete', reason: 'The synthetic supplier operating brief is ready for mandatory checks and local delivery; acquisition was scripted and remains unqualified.', toolCall: null }),
                ];
                requireThat(i < sequence.length, 'FIXTURE_SEQUENCE_EXHAUSTED'); output = sequence[i]();
            } else {
                const firstState = service.store.get('portfolio-execution', first.id); const candidateId = firstState.observations[11].result.output.candidateId;
                const sequence = [
                    () => action({ action: 'importCandidate', candidateId }),
                    () => action({ action: 'write', path: 'input.txt', content: 'sku|quantity|unit_price\nSKU-C|4|3.25', expectedHash: null }),
                    () => action({ action: 'command', argv: ['fixture-input-check'] }),
                    () => action({ action: 'reuse', candidateId, purposeRelevant: true, preconditionEvidence: { 'input readable': obs[2].result.observationId } }),
                    () => action({ action: 'command', argv: ['fixture-parent-job'] }),
                    () => action({ action: 'reuseOutcome', candidateId, reuseOperationId: obs[3].result.observationId, operationId: obs[4].result.observationId }),
                    () => makeBrief(second.id, true),
                    () => ({ action: 'complete', reason: 'Second synthetic input completed through the retained candidate; this is fixture reuse, not an unseen runtime success.', toolCall: null }),
                ];
                requireThat(i < sequence.length, 'FIXTURE_SEQUENCE_EXHAUSTED'); output = sequence[i]();
            }
            call.validate(output); return mockResult(output);
        } } });
    for (const task of [first, second]) {
        if (service.execution.portfolio.getTask(task.id).status !== 'completed') await engine.runTask(task.id);
        requireThat(service.execution.portfolio.getTask(task.id).status === 'completed', 'ADAPTIVE_FIXTURE_TASK_NOT_COMPLETE');
    }
    const candidateId = service.store.get('portfolio-execution', first.id).observations[11].result.output.candidateId;
    const receipt = { id: RECEIPT, businessId: ID, taskIds: [first.id, second.id], candidateId,
        provenance: 'scripted_fixture', unfamiliarObstacle: false, modelCalls: 0, credentialReads: 0, networkRequests: 0,
        actualWork: 'Injected data normalization, project file changes, durable acquisition/reuse records, checked and locally published service briefs.',
        root: service.root };
    return service.store.transaction(() => service.store.put('adaptive-demo-seed', RECEIPT, receipt, null));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2); const index = args.indexOf('--root');
    requireThat(args.includes('--fixture') && index >= 0 && args[index + 1], 'Usage: node packages/foundry/src/adaptive/demo.ts --root PATH --fixture');
    const service = new PilotService(resolve(args[index + 1]));
    try { console.log(JSON.stringify(await seedAdaptiveFixture(service, { fixture: true }), null, 2)); }
    finally { service.store.close(); }
}
