import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { AdaptiveWorkTools } from '../src/adaptive/tools.ts';
import { ADAPTIVE_VERSION } from '../src/adaptive/worker-contract.ts';
import type { ExecutorBackend } from '../src/adaptive/executor.ts';

function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'midas-adaptive-tools-'));
  const store = new StateStore(join(root, 'state.db')); const portfolio = new Portfolio(store); const evidence = new EvidenceLibrary(store);
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  for (const id of ['business', 'other']) {
    portfolio.createVenture({ id, name: 'Explicit synthetic broker fixture', goal: 'Verify mechanics only' });
    portfolio.addPlan(id, { rationale: 'Broker fixtures', tasks: ['first', 'second'].map(task => ({
      id: task, title: 'Fixture task', objective: 'Normalize a fixture', capability: 'service.brief', lane: 'research' as const,
      dependsOn: [], acceptance: ['Fixture normalized'], allowedTools: ['adaptive.perform'], requiredChecks: [],
      effectAuthority: { kind: 'local' as const, reference: 'Fixture-only local authority' },
      inputs: { adaptiveExecution: { version: ADAPTIVE_VERSION, prompt: 'lean', allowCommands: true } },
    })) });
  }
  let calls = 0; let serial = 0;
  const backend: ExecutorBackend = { async execute(command) {
    calls++; let good = false;
    try { good = readFileSync(join(command.workspace, 'parser.txt'), 'utf8') === 'working fixture'; } catch {}
    return { status: good ? 'completed' : 'failed', exitCode: good ? 0 : 1, stdout: good ? 'fixture normalized records' : '',
      stderr: good ? '' : 'fixture unsupported format', truncated: false, isolation: 'injected' };
  } };
  const options = { root, store, evidence, taskFor: (id: string) => portfolio.getTask(id), backend, provenance: 'fixture' as const,
    base: { async execute() { throw new Error('unexpected base execution'); }, load() { return null; } } as any };
  const tools = new AdaptiveWorkTools(options);
  const run = (payload: any, taskId = 'business/first', operationId = `operation-${++serial}`) => tools.execute({
    ventureId: taskId.split('/')[0], taskId, tool: 'adaptive.perform', operationId, args: { payload: JSON.stringify(payload) },
  });
  return { root, store, portfolio, tools, options, run, get calls() { return calls; } };
}
async function acquiring(f: ReturnType<typeof fixture>) {
  const write = await f.run({ action: 'write', path: 'parser.txt', content: 'broken fixture', expectedHash: null });
  const failed = await f.run({ action: 'command', argv: ['fixture-parser'] });
  const opened = await f.run({ action: 'episode', type: 'open', objective: 'Normalize fixture', obstacle: 'Fixture format unsupported', obstacleEvidence: [failed.observationId] });
  const id = opened.output.id;
  assert.equal((await f.run({ action: 'episode', type: 'diagnose', episodeId: id, missingCapability: 'Fixture parser',
    alternatives: [{ approach: 'scoped parser', reason: 'No network needed' }], selectedApproach: 'scoped parser' })).ok, true);
  const packageFor = (sha256: string) => ({ purpose: 'Normalize fixture records', preconditions: ['input readable'], inputs: ['fixture'], outputs: ['records'],
    procedure: 'Inspect and parse supported fixture', files: [{ path: 'parser.txt', sha256 }], dependencies: [], effects: ['project-files', 'isolated-command'],
    tests: ['records-check'], failureModes: ['unsupported variant'], sourceRefs: [] });
  assert.equal((await f.run({ action: 'episode', type: 'acquire', episodeId: id, package: packageFor(write.output.sha256) })).ok, true);
  return { id, packageFor, originalHash: write.output.sha256 };
}
async function retained(f: ReturnType<typeof fixture>) {
  const e = await acquiring(f);
  const repaired = await f.run({ action: 'patch', path: 'parser.txt', expectedHash: e.originalHash, edits: [{ find: 'broken fixture', replace: 'working fixture' }] });
  await f.run({ action: 'episode', type: 'acquire', episodeId: e.id, package: e.packageFor(repaired.output.sha256) });
  const checked = await f.run({ action: 'command', argv: ['fixture-parser'] });
  assert.equal((await f.run({ action: 'verify', episodeId: e.id, checks: [{ id: 'records-check', operationId: checked.observationId }] })).ok, true);
  const resumed = await f.run({ action: 'command', argv: ['fixture-parent-application'] });
  assert.equal((await f.run({ action: 'episode', type: 'resume', episodeId: e.id, evidenceRef: resumed.observationId })).ok, true);
  const result = await f.run({ action: 'episode', type: 'retain', episodeId: e.id });
  assert.equal(result.ok, true); return { ...e, candidateId: result.output.candidateId, checked };
}

test('broker preserves failed approach, verifies repair, resumes parent and retains unqualified candidate', async t => {
  const f = fixture(t); const e = await acquiring(f);
  const failed = await f.run({ action: 'command', argv: ['fixture-parser'] });
  const failedCheck = await f.run({ action: 'verify', episodeId: e.id, checks: [{ id: 'records-check', operationId: failed.observationId }] });
  assert.equal(failedCheck.ok, false); assert.equal(failedCheck.output.state, 'acquiring');
  const repaired = await f.run({ action: 'patch', path: 'parser.txt', expectedHash: e.originalHash, edits: [{ find: 'broken fixture', replace: 'working fixture' }] });
  await f.run({ action: 'episode', type: 'acquire', episodeId: e.id, package: e.packageFor(repaired.output.sha256) });
  const passed = await f.run({ action: 'command', argv: ['fixture-parser'] });
  assert.equal((await f.run({ action: 'verify', episodeId: e.id, checks: [{ id: 'records-check', operationId: passed.observationId }] })).ok, true);
  assert.equal(f.tools.finishingFloor(f.portfolio.getTask('business/first')), 2, 'Verified skill still needs parent execution and resume');
  const parent = await f.run({ action: 'command', argv: ['fixture-parent-application'] });
  assert.equal(f.tools.finishingFloor(f.portfolio.getTask('business/first')), 1, 'Fresh parent execution leaves the resume action');
  assert.equal((await f.run({ action: 'episode', type: 'resume', episodeId: e.id, evidenceRef: parent.observationId })).ok, true);
  const candidate = await f.run({ action: 'episode', type: 'retain', episodeId: e.id });
  assert.equal(candidate.ok, true);
  assert.equal(f.store.get('adaptive-skill-candidate', candidate.output.candidateId).qualification, 'unqualified');
  assert.equal(f.store.get('adaptive-skill-candidate', candidate.output.candidateId).verification.provenance, 'fixture');
});
test('broker rejects forged command references and stale package files', async t => {
  const f = fixture(t); const e = await acquiring(f);
  const forged = await f.run({ action: 'verify', episodeId: e.id, checks: [{ id: 'records-check', operationId: 'invented' }] });
  assert.equal(forged.ok, false); assert.match(forged.error!, /COMMAND_RECEIPT_REQUIRED/);
  await f.run({ action: 'patch', path: 'parser.txt', expectedHash: e.originalHash, edits: [{ find: 'broken fixture', replace: 'working fixture' }] });
  const checked = await f.run({ action: 'command', argv: ['fixture-parser'] });
  const stale = await f.run({ action: 'verify', episodeId: e.id, checks: [{ id: 'records-check', operationId: checked.observationId }] });
  assert.equal(stale.ok, false); assert.match(stale.error!, /ARTIFACT_STALE/);
});
test('executor completed before broker persistence recovers read-only after broker reconstruction', async t => {
  const f = fixture(t); await f.run({ action: 'write', path: 'parser.txt', content: 'working fixture', expectedHash: null });
  const original = await f.run({ action: 'command', argv: ['fixture-parser'] }, 'business/first', 'recover-me');
  const row = f.store.get('adaptive-tool-operation', 'recover-me');
  f.store.transaction(() => f.store.put('adaptive-tool-operation', 'recover-me', { ...row, status: 'running', result: null }, row._version));
  const restart = new AdaptiveWorkTools(f.options); const calls = f.calls;
  const recovered = restart.recoverOperation('recover-me', 'business', 'business/first');
  assert.equal(recovered.ok, true); assert.equal(recovered.output.stdout, original.output.stdout); assert.equal(f.calls, calls);
  assert.equal(recovered.output.provenance, 'fixture');
  assert.throws(() => restart.recoverOperation('recover-me', 'other', 'other/first'), /SCOPE_DENIED/);
});
test('candidate imports into second task, requires observed preconditions and records fixture reuse only', async t => {
  const f = fixture(t); const e = await retained(f);
  const imported = await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'business/second');
  assert.equal(imported.ok, true); assert.equal(imported.output.execution, false);
  const condition = await f.run({ action: 'command', argv: ['fixture-input-check'] }, 'business/second');
  const reuse = await f.run({ action: 'reuse', candidateId: e.candidateId, purposeRelevant: true, preconditionEvidence: { 'input readable': condition.observationId } }, 'business/second', 'reuse-second');
  assert.equal(reuse.output.status, 'applicable_candidate');
  const result = await f.run({ action: 'command', argv: ['fixture-second-application'] }, 'business/second');
  const outcome = await f.run({ action: 'reuseOutcome', reuseOperationId: 'reuse-second', candidateId: e.candidateId, operationId: result.observationId }, 'business/second');
  assert.equal(outcome.ok, true); assert.equal(outcome.output.claim, 'non_runtime_reuse_observation');
  assert.equal((await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'other/second')).ok, false);
});
test('candidate import refuses conflicting target source', async t => {
  const f = fixture(t); const e = await retained(f);
  await f.run({ action: 'write', path: 'parser.txt', content: 'owner existing work', expectedHash: null }, 'business/second');
  const result = await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'business/second');
  assert.equal(result.ok, false); assert.match(result.error!, /TARGET_CONFLICT/);
  assert.equal((await f.run({ action: 'read', path: 'parser.txt' }, 'business/second')).output.content, 'owner existing work');
});
test('candidate import rejects explicitly invalidated originating task', async t => {
  const f = fixture(t); const e = await retained(f);
  const task = f.portfolio.getTask('business/first');
  f.store.transaction(() => f.store.put('portfolio-task', task.id, { ...task, invalidatedAt: new Date().toISOString() }, task._version));
  const result = await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'business/second');
  assert.equal(result.ok, false); assert.match(result.error!, /TASK_STALE/);
});
test('acquisition rejects invented provenance but accepts a bound retained source', async t => {
  const f = fixture(t); const e = await acquiring(f);
  const unknown = await f.run({ action: 'episode', type: 'acquire', episodeId: e.id,
    package: { ...e.packageFor(e.originalHash), sourceRefs: ['made-up-documentation'] } });
  assert.equal(unknown.ok, false); assert.match(unknown.error!, /SOURCE_REF_UNKNOWN/);
  const read = await f.run({ action: 'read', path: 'parser.txt' });
  const known = await f.run({ action: 'episode', type: 'acquire', episodeId: e.id,
    package: { ...e.packageFor(e.originalHash), sourceRefs: [read.observationId] } });
  assert.equal(known.ok, true);
});
test('reuse outcome cannot substitute a different candidate sharing identical files', async t => {
  const f = fixture(t); const e = await retained(f);
  await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'business/second');
  const condition = await f.run({ action: 'command', argv: ['fixture-input-check'] }, 'business/second');
  await f.run({ action: 'reuse', candidateId: e.candidateId, purposeRelevant: true, preconditionEvidence: { 'input readable': condition.observationId } }, 'business/second', 'reuse-original');
  const candidate = f.store.get('adaptive-skill-candidate', e.candidateId);
  f.store.transaction(() => f.store.put('adaptive-skill-candidate', 'different-candidate', { ...candidate, id: 'different-candidate' }, null));
  const later = await f.run({ action: 'command', argv: ['fixture-second-application'] }, 'business/second');
  const mismatch = await f.run({ action: 'reuseOutcome', reuseOperationId: 'reuse-original', candidateId: 'different-candidate', operationId: later.observationId }, 'business/second');
  assert.equal(mismatch.ok, false); assert.match(mismatch.error!, /CANDIDATE_MISMATCH/);
});
test('a command observed before applicability cannot establish later skill reuse', async t => {
  const f = fixture(t); const e = await retained(f);
  await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'business/second');
  const prior = await f.run({ action: 'command', argv: ['fixture-precondition'] }, 'business/second');
  await f.run({ action: 'reuse', candidateId: e.candidateId, purposeRelevant: true, preconditionEvidence: { 'input readable': prior.observationId } }, 'business/second', 'reuse-later');
  const result = await f.run({ action: 'reuseOutcome', reuseOperationId: 'reuse-later', candidateId: e.candidateId, operationId: prior.observationId }, 'business/second');
  assert.equal(result.ok, false); assert.match(result.error!, /ORDER|LATER|PREDATE/);
});
test('task without command permission cannot import a skill requiring isolated command effects', async t => {
  const f = fixture(t); const e = await retained(f);
  const task = f.portfolio.getTask('business/second');
  f.store.transaction(() => f.store.put('portfolio-task', task.id, { ...task,
    inputs: { ...(task.inputs as any), adaptiveExecution: { ...(task.inputs as any).adaptiveExecution, allowCommands: false } },
  }, task._version));
  const result = await f.run({ action: 'importCandidate', candidateId: e.candidateId }, 'business/second');
  assert.equal(result.ok, false); assert.match(result.error!, /EFFECT_DENIED/);
});
test('uncertain executor exception leaves broker running and cannot become a known failure or resend', async t => {
  const f = fixture(t); let dispatches = 0;
  const tools = new AdaptiveWorkTools({ ...f.options, backend: { async execute() { dispatches++; throw new Error('transport disappeared after dispatch'); } } });
  const call = { ventureId: 'business', taskId: 'business/first', tool: 'adaptive.perform', operationId: 'uncertain-command', args: { payload: JSON.stringify({ action: 'command', argv: ['fixture-effect'] }) } };
  await assert.rejects(() => tools.execute(call), /UNCERTAIN|transport disappeared/);
  assert.equal(f.store.get('adaptive-tool-operation', call.operationId).status, 'running');
  const restarted = new AdaptiveWorkTools({ ...f.options, backend: { async execute() { dispatches++; throw new Error('must not run again'); } } });
  assert.throws(() => restarted.recoverOperation(call.operationId, 'business', 'business/first'), /UNCERTAIN/);
  await assert.rejects(() => restarted.execute(call), /UNCERTAIN/);
  assert.equal(dispatches, 1);
});
