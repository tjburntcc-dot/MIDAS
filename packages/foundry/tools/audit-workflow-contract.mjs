// Offline audit only. It cannot use the real transport or provider credential.
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { prepare, runWorkflow, approvalView, approve } from '../src/workflow/runner.ts';
import { configFor, read, write } from '../src/workflow/config.ts';
import { report } from '../src/workflow/report.ts';
import { schemaForTask, validateWorkflowOutput } from '../src/workflow/task.ts';
import { buildResponsesBody } from '../src/model-port.ts';
import { canonical, rawHash, hash } from '../src/contracts.ts';

const [targetArg, mockArg] = process.argv.slice(2);
if (!targetArg || !mockArg) throw Error('Usage: node packages/foundry/tools/audit-workflow-contract.mjs <prepared-recovery-root> <fresh-mock-root>');
const target = resolve(targetArg), mockRoot = resolve(mockArg), c = configFor(target);
assert.ok(['workflow-029-recovery-r1','workflow-029-w006-v1'].includes(c.version));
const mockId = c.schedule[0].episode + '-single';
const oldFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('OFFLINE_AUDIT_NETWORK_DENIED'); };
try {
    prepare(mockRoot, 'mock');
    let state = await runWorkflow(mockRoot, mockId);
    assert.equal(state.checkpoint, 'waiting_approval');
    const view = approvalView(mockRoot, mockId);
    approve(mockRoot, mockId, view.proposalHash, 'fixture-demo');
    state = await runWorkflow(mockRoot, mockId);
    if (state.checkpoint === 'reconciling') state = await runWorkflow(mockRoot, mockId);
    assert.equal(state.checkpoint, 'completed');
    const result = report(mockRoot);
    assert.equal(result.observations.find(o=>o.runId===mockId).deterministicAccepted, true);
    const rows = result.allAttempts;
    assert.equal(rows.length, 4);
    const stages = ['investigate', 'decide', 'operate', 'verify'];
    const requests = [];
    mkdirSync(join(target, 'contract-requests'), { recursive: true });
    for (const task of stages) {
        const row = rows.find(a => a.request.task === task);
        assert.ok(row && row.result);
        const request = row.request;
        const schema = schemaForTask(task, request.context);
        validateWorkflowOutput(task, row.result.output, request.context);
        const body = buildResponsesBody(c.route, request, schema), bytes = canonical(body);
        assert.equal(rawHash(bytes), row.requestHash);
        assert.equal(body.model, 'gpt-6-astra');
        assert.equal(body.reasoning.effort, 'high');
        assert.doesNotMatch(body.input, /"expected"|"seeding"|"credentialFile"|"authorization"|OFFLINE-MOCK-NOT-A-CREDENTIAL/);
        writeFileSync(join(target, 'contract-requests', task + '.json'), bytes, { flag: 'wx' });
        requests.push({ task, requestHash: row.requestHash, schemaHash: hash(schema), contextHash: hash(request.context), utf8Bytes: Buffer.byteLength(bytes), localValidatorAccepted: true });
    }
    const record = { version: 'four-stage-contract-preflight-v1', configHash: hash(c), implementationHash: c.implementationHash, passed: true, providerRequests: 0, stages, requests, mockRoot, createdAt: new Date().toISOString(), independentMechanicalOutcome: 'pass', limitations: 'Serialized representative stage requests exercised through the exact adapter. Future stages depend on actual earlier model output and fixture observations; their bytes cannot be predicted. Every actual request uses this frozen builder, context-bound schema, exact-byte hash and provider token admission. Mock counts/usage are not an input-token estimate or live compatibility proof. Varied handwritten output tests are separate regression evidence.' };
    write(target, 'contract-preflight.json', record, true);
    console.log(JSON.stringify(record, null, 2));
} finally { globalThis.fetch = oldFetch; }
