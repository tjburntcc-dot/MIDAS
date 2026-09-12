import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { portfolioScope } from '../src/portfolio/contracts.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { LocalWorkTools } from '../src/portfolio/tools.ts';
import { PortfolioEngine, CAPABILITIES } from '../src/portfolio/engine.ts';
import { mockResult } from '../src/portfolio/worker.ts';

const now = () => new Date().toISOString();
const action = (name: string, args: Record<string, unknown> = {}) => mockResult({ action: 'tool', reason: 'Read the retained input and preserve the known result.', toolCall: { name, arguments: { path: null, content: null, expectedHash: null, query: null, url: null, ...args } } });
const blocked = () => mockResult({ action: 'blocked', reason: 'The fixture stops after retaining the observed result.', toolCall: null });

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'portfolio-v4-context-'));
  const store = new StateStore(join(root, 'state.sqlite'));
  const portfolio = new Portfolio(store);
  const tools = new LocalWorkTools({ root, store, scopeFor: portfolioScope });
  const evidence = new EvidenceLibrary(store);
  portfolio.createVenture({ id: 'v4', name: 'V4 context fixture', goal: 'Verify exact retained source context without provider work.' });
  portfolio.registerWorker({ id: 'worker', name: 'Fixture worker', capabilities: CAPABILITIES, competencies: ['source-review'] });
  const add = (title: string, text: string, provenance: 'owner_report' | 'runtime_public_retrieval' = 'owner_report') => evidence.add('v4', { title, url: null, text, observedAt: now(), publishedAt: null, rights: provenance === 'owner_report' ? 'owner_supplied' : 'public_readonly', provenance });
  const task = (id: string, sourceBindings: any[], dependsOn: string[] = [], modelCalls = 2) => {
    portfolio.addPlan('v4', { rationale: 'Bounded source-context fixture.', tasks: [{ id, title: id, objective: 'Use only exact retained sources.', lane: 'research', capability: 'service.brief', dependsOn, acceptance: ['Preserve the observed retained source result.'], requiredCompetencies: ['source-review'], allowedTools: ['workspace.read', 'research.read'], resource: { modelCalls, localToolRuns: 2 }, inputs: { sourceBindings } }] });
    return portfolio.getTask('v4/' + id);
  };
  const seed = (taskId: string, content = '{}') => { const sources = evidence.forTask(portfolio.getTask(taskId)); return tools.seed('v4', taskId, { kind: 'service', files: [{ path: 'brief.json', content }], inputs: { title: taskId, client: 'V4 fixture', asOf: '2026-09-12', sources: sources.map(source => ({ id: source.id, title: source.title, text: source.text, rights: source.rights })), requiredSourceIds: sources.map(source => source.id) }, provenance: 'Fixture workspace; no external action.' }); };
  return { root, store, portfolio, tools, evidence, add, task, seed, close() { store.close(); const cleanupPath=realpathSync(root),cleanupRelative=relative(realpathSync(tmpdir()),cleanupPath);assert(cleanupRelative&&!cleanupRelative.startsWith('..')&&!isAbsolute(cleanupRelative));rmSync(cleanupPath,{recursive:true,force:true}); } };
}

test('V4 source bindings preserve an exact old source, exclude unrelated history, and inherit dependency retrievals', () => {
  const f = setup(); try {
    const old = f.add('Pinned source', 'Old retained wording must remain selected.');
    const revised = f.add('Pinned source', 'Newer wording must not silently replace the pinned source.');
    const unrelated = f.add('Unrelated research', 'Historical research outside this release.');
    const fetched = f.add('Permitted fetched source', 'Retrieved under the parent task.', 'runtime_public_retrieval');
    const bindings = [{ id: old.id, sha256: old.sha256 }];
    const parent = f.task('parent', bindings);
    const child = f.task('child', bindings, [parent.id]);
    f.store.put('portfolio-execution', parent.id, { taskId: parent.id, ventureId: 'v4', retrievedSources: [{ id: fetched.id, sha256: fetched.sha256 }] }, null);
    const selected = f.evidence.forTask(child);
    assert.deepEqual(selected.map(source => [source.id, source.sha256]), [[old.id, old.sha256], [fetched.id, fetched.sha256]]);
    assert.equal(selected.find(source => source.id === old.id)?.text, old.text);
    assert.notEqual(selected.find(source => source.id === old.id)?.sha256, revised.sha256);
    assert.equal(selected.some(source => source.id === unrelated.id), false);
  } finally { f.close(); }
});

test('current workspace source is available once and a repeated workspace.read does not duplicate its bytes', async () => {
  const f = setup(); try {
    const bindings = Array.from({ length: 8 }, (_, index) => {
      const source = f.add(`Context source ${index}`, `${String(index)}-${'e'.repeat(2_900)}`);
      return { id: source.id, sha256: source.sha256 };
    });
    const work = f.task('read-current', bindings, [], 2);
    const marker = `CURRENT-SOURCE-${'x'.repeat(23_200)}`;
    f.tools.seed('v4', work.id, { kind: 'software', files: [{ path: 'app.html', content: marker }], inputs: { profile: 'quote-to-job-v1' }, provenance: 'Fixture software workspace; no external action.' });
    let calls = 0;
    const engine = new PortfolioEngine({ portfolio: f.portfolio, tools: f.tools, evidence: f.evidence, model: { kind: 'offline_mock', async run(call) {
      calls++;
      const context: any = call.request.context;
      assert(Buffer.byteLength(JSON.stringify(context)) <= 56_000);
      assert.equal((context.workspace.inputs.sources ?? []).every((source: any) => source.text === undefined), true);
      assert.equal(context.workspace.currentSource[0].content, marker);
      if (calls === 1) return action('workspace.read', { path: 'app.html' });
      assert.equal(context.observations[0].result.output.content, undefined);
      assert.equal(context.observations[0].result.output.contentLocation, 'workspace.currentSource');
      assert.equal((JSON.stringify(context).match(/CURRENT-SOURCE-/g) ?? []).length, 1);
      return blocked();
    } } });
    await engine.runTask(work.id);
    assert.equal(calls, 2);
    assert.equal(f.portfolio.getTask(work.id).status, 'blocked');
  } finally { f.close(); }
});

test('ordinary frozen allowance prevents an extra real-shaped model admission before durable reservation', async () => {
  const f = setup(); try {
    const source = f.add('Pinned source', 'A retained source is available.');
    const work = f.task('preempted', [{ id: source.id, sha256: source.sha256 }], [], 5);
    f.seed(work.id);
    let invoked = 0;
    const engine = new PortfolioEngine({ portfolio: f.portfolio, tools: f.tools, evidence: f.evidence, accounting: () => ({ taskAllocations: [{ id: work.id, workCalls: 0 }] }), model: { kind: 'actual_model', async run() { invoked++; throw Error('The mocked real-shaped model must never run.'); } } });
    await engine.runTask(work.id);
    assert.equal(invoked, 0);
    assert.equal(f.portfolio.getTask(work.id).status, 'blocked');
    assert.equal(engine.rows('portfolio-model-request').filter(row => row.taskId === work.id).length, 0);
    assert.equal(engine.rows('portfolio-step').filter(row => row.taskId === work.id).length, 0);
  } finally { f.close(); }
});

test('invalid local research.read becomes a durable known failed observation instead of uncertainty', async () => {
  const f = setup(); try {
    const source = f.add('Pinned source', 'Only this source is permitted for the task.');
    const work = f.task('invalid-read', [{ id: source.id, sha256: source.sha256 }]);
    f.seed(work.id);
    let calls = 0;
    const engine = new PortfolioEngine({ portfolio: f.portfolio, tools: f.tools, evidence: f.evidence, model: { kind: 'offline_mock', async run() { calls++; return calls === 1 ? action('research.read', { path: 'not-a-permitted-source', query: '0' }) : blocked(); } } });
    await engine.runTask(work.id);
    const execution = f.store.get('portfolio-execution', work.id);
    assert.equal(f.portfolio.getTask(work.id).status, 'blocked');
    assert.equal(execution.observations.length, 1);
    assert.equal(execution.observations[0].result.ok, false);
    assert.equal(execution.observations[0].result.error, 'SOURCE_SCOPE_OR_ID');
    const step = engine.rows('portfolio-step').find(row => row.taskId === work.id && row.kind === 'tool');
    assert.equal(step.status, 'completed');
    assert.equal(engine.rows('portfolio-tool-result').filter(row => row.taskId === work.id).length, 1);
  } finally { f.close(); }
});
