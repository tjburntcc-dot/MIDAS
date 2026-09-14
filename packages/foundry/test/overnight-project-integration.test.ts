import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { PilotKnowledge } from '../src/pilot/knowledge.ts';
import { PilotExecution } from '../src/pilot/execution.ts';
import { hash } from '../src/contracts.ts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'midas-overnight-functional-project-'));
  const store = new StateStore(join(root, 'state.sqlite'));
  const knowledge = new PilotKnowledge(store);
  const business = knowledge.createCompany({ name: 'Fixture repair desk', website: '', notes: 'Development-only local workflow fixture.', goal: 'Keep review work locally consistent.', mode: 'fixture' });
  const source = knowledge.addSource(business.id, { title: 'Fixture operating note', text: 'The fixture keeps review work local and requires owner review before external action.', kind: 'text', rights: 'Synthetic development material', observedAt: new Date().toISOString() });
  return { root, store, business, source, execution: new PilotExecution(store, { root }) };
}

test('PilotExecution completes the declared multi-file project fixture with current project.browser evidence and preserves compatible owner data through correction', { timeout: 45_000 }, async () => {
  const x = fixture();
  let firstPreview: any = null;
  try {
    const task = x.execution.plan({ taskId: 'fixture-project', business: x.business, sources: [x.source], workflow: 'functional-project', job: { title: 'Fixture work review', outcome: 'Maintain a local review queue.', details: 'Create, reopen, edit, review, export, and retain only test records.' } });
    const completed = await x.execution.run(x.business.id, task.id);
    assert.equal(completed.status, 'completed', JSON.stringify(completed));
    const firstArtifact = x.execution.artifact(x.business.id, task.id);
    assert.ok(firstArtifact?.current);
    assert.equal(firstArtifact.checks.find((check: any) => check.id === 'project.browser')?.passed, true, JSON.stringify(firstArtifact.checks));
    assert.ok(firstArtifact.checks.some((check: any) => check.id === 'project.restart' && check.passed));

    firstPreview = await x.execution.tools.openProjectPreview(x.business.id, task.id);
    const created = await fetch(firstPreview.url + '/api/entities/work', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'owner-record-0001' }, body: JSON.stringify({ record: { title: 'Owner test record', detail: 'Persist this local correction fixture.', status: 'draft' } }) });
    assert.equal(created.status, 201);
    await firstPreview.server.close();
    firstPreview = null;
    const before = x.execution.tools.projectRuntime(x.business.id, task.id).state();
    assert.equal(before.entities.work.length, 1);

    const correction = x.execution.correct({ businessId: x.business.id, taskId: task.id, artifactHash: firstArtifact.hash, instruction: 'Clarify that this development fixture records review state only.', stableTaskId: 'fixture-project-correction' });
    const corrected = await x.execution.run(x.business.id, correction.id);
    assert.equal(corrected.status, 'completed', JSON.stringify(corrected));
    const after = x.execution.tools.projectRuntime(x.business.id, correction.id).state();
    assert.deepEqual(after.entities, before.entities, 'compatible correction preserves trusted local records exactly');
    assert.deepEqual(after.operations, before.operations, 'compatible correction preserves idempotency receipts exactly');
    const migration = x.store.get('pilot-project-state-migration', correction.id);
    assert.equal(migration.stateHash, hash(before));
    assert.equal(x.execution.artifact(x.business.id, correction.id)?.checks.find((check: any) => check.id === 'project.browser')?.passed, true);
  } finally {
    await firstPreview?.server.close();
    x.store.close();
    rmSync(x.root, { recursive: true, force: true });
  }
});
