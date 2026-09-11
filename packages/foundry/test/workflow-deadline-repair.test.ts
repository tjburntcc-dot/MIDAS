import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemaForTask, validateWorkflowOutput, environmentFor } from '../src/workflow/task.ts';
import { prepare, runWorkflow, open, workflowScope } from '../src/workflow/runner.ts';
import { scopeKey } from '../src/contracts.ts';

const historical = JSON.parse(readFileSync(new URL('./fixtures/workflow-029-investigate-failure.json', import.meta.url), 'utf8'));
test('preserved live prose deadline reveals a published-schema/local-parser mismatch, not a proven reasoning failure', () => {
    const original = structuredClone(historical.output);
    // The old published deadline schema was only {type:string,minLength:1}.
    assert.equal(typeof original.deadline, 'string'); assert.ok(original.deadline.length);
    assert.equal(Number.isFinite(Date.parse(original.deadline)), false);
    assert.throws(() => validateWorkflowOutput('investigate', original), /WORKFLOW_DEADLINE_INVALID/);
    const syntheticRepair = { ...original, deadline: '2026-09-12T20:00:00.000Z' };
    validateWorkflowOutput('investigate', syntheticRepair);
    assert.equal(environmentFor('W-001').evidenceRequests!(syntheticRepair).length, 2);
    assert.deepEqual(original, historical.output); // Never relabel the historical observation as repaired.
});

test('future schema describes the exact deadline rule and rejects prose, impossible dates and non-UTC strings', () => {
    const field = schemaForTask('investigate').properties.deadline;
    assert.equal(field.format, 'date-time'); assert.match(field.description, /context.evidenceDeadline/);
    for (const deadline of ['tomorrow', '2026-02-30T12:00:00Z', '2026-09-12T12:00:00+01:00', '2026-09-12']) {
        assert.throws(() => validateWorkflowOutput('investigate', { ...historical.output, deadline }), /WORKFLOW_DEADLINE_INVALID/);
    }
    validateWorkflowOutput('investigate', { ...historical.output, deadline: '2026-09-12T20:00:00Z' });
});

test('future request supplies a stable task deadline and MOCK copying reaches actual approval wait', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deadline-repair-')); prepare(root, 'mock', 'value');
    const result = await runWorkflow(root, 'W-001-single'); assert.equal(result.checkpoint, 'waiting_approval');
    const { store } = open(root);
    try {
        const run = store.get('run', scopeKey(workflowScope('W-001-single')));
        const rows = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(x => JSON.parse(String(x.body)));
        const attempt = rows.find(a => a.metadata.modelTask === 'investigate');
        assert.equal(attempt.request.context.contextVersion, 'workflow-context-v2');
        assert.equal(attempt.request.context.snapshot.taskBrief.version, 'synthetic-workflow-v2');
        assert.equal(attempt.request.context.evidenceDeadline, new Date(Date.parse(run.createdAt) + 86400000).toISOString());
        assert.equal(attempt.result.output.deadline, attempt.request.context.evidenceDeadline);
        assert.match(attempt.request.context.snapshot.taskBrief.investigationDeadlineRule, /UTC RFC3339/);
        assert.equal(rows.length, 3); assert.ok(rows.every(a => a.result.route.kind === 'fixture'));
    } finally { store.close(); }
});
