import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { renderServiceBrief } from '../src/portfolio/products.ts';
import { StateStore } from '../src/state.ts';
import { portfolioView } from '../src/portfolio/server.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const assets = resolve(root, 'packages/foundry/src/portfolio');
const base = 'http://127.0.0.1:43132';

const snapshot = {
  portfolio: { name: 'MIDAS Portfolio', maxConcurrency: 1 },
  ventures: [{ id: 'quote-desk', name: 'Quote desk', stage: 'prototype', status: 'active', summary: 'Local quote-to-job work.' }],
  workers: [], sources: [], claims: [], observations: [], decisions: [], commercialDrafts: [], resources: { activeWorkerSlots: 0 },
  tasks: [
    { id: 'quote-desk/build', ventureId: 'quote-desk', title: 'Build quote desk', status: 'blocked', outputCurrent: true, reason: 'A later task is blocked; this does not change the local publication.', updatedAt: '2026-09-13T12:00:00Z' },
    { id: 'quote-desk/legacy', ventureId: 'quote-desk', title: 'Preserved completed delivery', status: 'completed', outputCurrent: true, updatedAt: '2026-09-12T12:00:00Z' }
  ],
  artifacts: [
    { id: 'local-publication-fixture', ventureId: 'quote-desk', taskId: 'quote-desk/build', title: 'Build quote desk', kind: 'service', version: 2, provenance: 'actual runtime local workspace', summary: 'Read-only current local publication. The task has not recorded completion.', status: 'delivered_locally', deliveryStatus: 'delivered_locally', executionStatus: 'blocked', locallyPublished: true, customerAcknowledged: false, revisable: false, viewOnlyEntry: true, publicationReadback: true, previewUrl: '/preview?ventureId=quote-desk&taskId=quote-desk%2Fbuild' },
    { id: 'completed-delivery', ventureId: 'quote-desk', taskId: 'quote-desk/legacy', title: 'Preserved completed delivery', kind: 'service', version: 1, provenance: 'runtime.tool.execution', summary: 'Existing completed entry remains visible.', status: 'delivered_locally', deliveryStatus: 'delivered_locally', executionStatus: 'completed', locallyPublished: true, customerAcknowledged: false }
  ]
};

const report = {
  title: 'Mobile service report', client: 'Quote desk', asOf: '2026-09-13',
  observations: [{ id: 'finding-1', statement: 'A deliberately long observation remains readable.', quote: 'unbroken-'.repeat(120), sourceId: 'source-' + 'x'.repeat(300) }],
  recommendation: { title: 'Inspect the local report', basis: 'This browser check verifies layout only.', steps: [{ action: 'Open the report on a narrow viewport.', owner: 'owner', successMeasure: 'The document does not create horizontal scrolling.' }] },
  unknowns: ['Semantic acceptance remains unobserved.'], obligations: [{ id: 'owner-review', description: 'Review the local report.', owner: 'owner', status: 'open' }]
};
const inputs = { title: report.title, client: report.client, asOf: report.asOf, sources: [{ id: report.observations[0].sourceId, title: 'Long identifier fixture', text: report.observations[0].quote, rights: 'test fixture' }], requiredSourceIds: [report.observations[0].sourceId] };

const stateRoot = mkdtempSync(join(tmpdir(), 'midas-m031-owner-view-'));
const store = new StateStore(join(stateRoot, 'portfolio.sqlite'));
try {
  const task = { id: 'quote-desk/investigate-v4-r1', ventureId: 'quote-desk', title: 'Investigate the user, job and value of a quote-to-job prototype', status: 'blocked', outputCurrent: true, outputArtifacts: [], inputs: {}, updatedAt: '2026-09-13T01:48:19.734Z' };
  const raw = { portfolio: { name: 'MIDAS Portfolio', maxConcurrency: 1 }, ventures: [{ id: 'quote-desk', name: 'Quote desk', status: 'active' }], tasks: [task], artifacts: [], workers: [], decisions: [], resources: { activeWorkerSlots: 0 } };
  const publication = { manifestHash: 'current-manifest', customerAcknowledged: false, deliveryMode: 'local', payloadHash: 'readback-payload' };
  const workspace = { ventureId: task.ventureId, taskId: task.id, kind: 'service', provenance: 'Actual runtime local workspace', manifest: { revision: 2, sha256: 'current-manifest' }, published: publication, checks: [{ id: 'service.structure', passed: true }] };
  const reads = [];
  const engine = { portfolio: { store, snapshot: () => structuredClone(raw) }, store, evidence: { list: () => [] }, accounting: () => undefined, model: { kind: 'actual_model' }, rows: () => [] };
  const tools = { root: stateRoot, load: (ventureId, taskId) => { assert.equal(ventureId, task.ventureId); assert.equal(taskId, task.id); return workspace; }, download: (ventureId, taskId) => { reads.push([ventureId, taskId]); return { content: JSON.stringify({ taskId, manifest: { sha256: 'current-manifest' }, checks: workspace.checks, delivery: { customerAcknowledged: false } }) }; } };
  const view = portfolioView(engine, tools);
  assert.equal(view.tasks[0].status, 'blocked', 'read-only gallery projection must not complete the task');
  assert.equal(view.tasks[0].outputArtifacts.length, 0, 'the historical orphan starts without a registered artifact');
  assert.equal(view.artifacts.length, 1, 'current published workspace without an artifact must appear in the gallery');
  assert.deepEqual(reads, [[task.ventureId, task.id]], 'gallery entry must come from authenticated local delivery readback');
  assert.deepEqual(view.artifacts[0], { ...view.artifacts[0], taskId: task.id, executionStatus: 'blocked', deliveryStatus: 'delivered_locally', locallyPublished: true, customerAcknowledged: false, revisable: false, viewOnlyEntry: true, publicationReadback: true });
} finally {
  store.close();
  rmSync(stateRoot, { recursive: true, force: true });
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.setContent(renderServiceBrief(report, inputs));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'service report must fit 390px');

  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(assets, 'index.html'), 'utf8') });
    if (url.pathname === '/portfolio.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(assets, 'app.js'), 'utf8') });
    if (url.pathname === '/portfolio.css') return route.fulfill({ contentType: 'text/css', body: readFileSync(resolve(assets, 'style.css'), 'utf8') });
    if (url.pathname === '/api/session') return route.fulfill({ json: { csrf: 'fixture-csrf' } });
    if (url.pathname === '/api/portfolio') return route.fulfill({ json: snapshot });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, body: 'Not found' });
  });
  await page.goto(`${base}/?view=products`, { waitUntil: 'networkidle' });
  const blocked = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: 'Build quote desk', exact: true }) });
  await blocked.getByText('Local delivery published', { exact: true }).waitFor();
  await blocked.getByText('Blocked', { exact: true }).waitFor();
  await blocked.getByText('customer acknowledgment is not recorded.', { exact: false }).waitFor();
  assert.equal(await blocked.getByRole('button', { name: 'Request revision', exact: true }).count(), 0, 'a read-only orphan publication must not manufacture a revision artifact');
  await page.getByRole('heading', { name: 'Preserved completed delivery', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'portfolio gallery must fit 390px');
  console.log(JSON.stringify({ status: 'passed', checks: ['server synthesizes orphan publication from local readback without task completion', 'service report fits 390px', 'published blocked orphan distinguishes delivery and execution', 'completed artifact retained', 'gallery fits 390px'] }));
} finally {
  await browser.close();
}
