import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const assets = resolve(root, 'packages/foundry/src/portfolio');
const base = 'http://127.0.0.1:43131';
const output = resolve(root, 'var/portfolio-ui-verification');
mkdirSync(output, { recursive: true });
const snapshot = {
  portfolio: { name: 'MIDAS Portfolio', maxConcurrency: 3, goal: 'Build useful owned businesses and improve them from operating evidence.' },
  ventures: [
    { id: 'release-qa', name: 'Release confidence', model: 'Service', stage: 'prototype', status: 'active', commitment: 'build', summary: 'A complete, reproducible release review for small web agencies.', customer: 'Agency owners preparing a client release', whyNow: 'A bounded delivery can test whether an agency values the work.', nextAction: 'Inspect a working customer journey and prepare its delivery package.', mode: 'local' },
    { id: 'tool-desk', name: 'Tool desk', model: 'Software', stage: 'prototype', status: 'active', summary: 'Stock availability and collection requests for a small tool library.', customer: 'Shared equipment operators', nextAction: 'Build and verify reservation conflict handling.', mode: 'local' },
    { id: 'signal-brief', name: 'Signal brief', model: 'Content service', stage: 'research', status: 'active', summary: 'Source-linked changes that help an owner make a specific decision.', nextAction: 'Compare source changes and substantiate a useful brief.', mode: 'local' }
  ],
  workers: [{ id: 'engineer', name: 'Product engineer' }],
  tasks: [
    { id: 'qa-inspect', ventureId: 'release-qa', title: 'Inspect the estimate journey', objective: 'Return reproducible findings with current browser evidence.', status: 'queued', lane: 'research', dependsOn: [], acceptance: ['Every finding has a reproducer and source.'], controls: ['run', 'pause', 'cancel'], updatedAt: '2026-09-12T18:00:00Z', workerId: 'engineer' },
    { id: 'tool-build', ventureId: 'tool-desk', title: 'Build the reservation workspace', status: 'completed', lane: 'build', dependsOn: [], updatedAt: '2026-09-12T18:10:00Z', workerId: 'engineer', outputArtifacts: ['product-1'], result: { summary: 'Persisted product with reservation conflict checks.', checks: [{ label: 'Reservation conflict', status: 'pass' }] } },
    { id: 'brief-live', ventureId: 'signal-brief', title: 'Investigate the buyer problem', status: 'queued', lane: 'research', controls: [], modelDisabledUntilGrant: true, reason: 'No live model grant.', updatedAt: '2026-09-12T18:00:00Z' }
  ],
  artifacts: [{ id: 'product-1', ventureId: 'tool-desk', taskId: 'tool-build', title: 'Tool desk workspace', kind: 'software', version: 1, provenance: 'developer-authored', summary: 'Import stock and track collection requests.', content: 'A functional local inventory workspace.', sha256: 'product-sha', previewUrl: '/preview/product-1', downloadUrl: '/download/product-1', revisable: true }],
  sources: [{ id: 'source-1', ventureId: 'tool-desk', title: 'Same ID in another venture', text: 'PRIVATE TOOL-DESK RECORD; never display in release-qa.', provenance: 'owner-supplied' }, { id: 'source-1', ventureId: 'release-qa', title: 'Retained agency source', text: '<img src=x onerror="window.sourceExecuted=true"> Literal retained evidence.', url: 'https://example.com/source', observedAt: '2026-09-12T17:00:00Z', provenance: 'public-readonly' }],
  claims: [{ id: 'claim-1', ventureId: 'release-qa', kind: 'hypothesis', text: 'A release review might reduce avoidable rework.', sourceIds: ['source-1'] }],
  commercialDrafts: [
    { id: 'tool-invitation', ventureId: 'tool-desk', artifactId: 'product-1', artifactHash: 'product-sha', title: 'Validation invitation', subject: 'Review a stock-request workflow', body: 'Hello,\nCould we examine your current collection process?\n<img src=x onerror="window.draftExecuted=true">', recipient: null, purpose: 'Prepare a discovery conversation; demand remains unknown.', status: 'prepared', current: true, consentEvidenceIds: [] },
    { id: 'tool-old-invitation', ventureId: 'tool-desk', artifactId: 'product-1', artifactHash: 'old-product-sha', title: 'Outdated invitation', subject: 'Earlier proposal', body: 'Earlier wording retained for comparison.', recipient: null, purpose: 'An earlier artifact version.', status: 'stale', current: false, consentEvidenceIds: [] }
  ],
  operatingPacket: { summary: 'The prototypes are inspectable. Customer demand remains unknown.', bottlenecks: ['Buyer access is not established.'], nextDecision: 'Choose a bounded, evidence-backed validation action.' },
  observations: [], decisions: [], resources: { activeWorkerSlots: 0 }
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const requests = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
let failFirstSnapshot = true;
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== base) return route.abort();
  requests.push({ method: request.method(), pathname: url.pathname, body: request.method() === 'POST' ? request.postDataJSON() : null });
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(assets, 'index.html'), 'utf8') });
  if (url.pathname === '/portfolio.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(assets, 'app.js'), 'utf8') });
  if (url.pathname === '/portfolio.css') return route.fulfill({ contentType: 'text/css', body: readFileSync(resolve(assets, 'style.css'), 'utf8') });
  if (url.pathname === '/api/session') return route.fulfill({ json: { csrf: 'fixture-csrf' } });
  if (url.pathname === '/api/portfolio') { if (failFirstSnapshot) { failFirstSnapshot = false; return route.fulfill({ status: 503, json: { message: 'Injected read failure.' } }); } return route.fulfill({ json: snapshot }); }
  if (url.pathname === '/api/action') {
    assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
    const body = request.postDataJSON();
    if (body.action === 'run') snapshot.tasks.find(task => task.id === body.taskId).status = 'running';
    if (body.action === 'evidence') snapshot.sources.push({ id: 'owner-source', ventureId: body.ventureId, title: body.title, text: body.text, provenance: 'owner-supplied' });
    if (body.action === 'observation') snapshot.observations.push({ id: 'owner-observation', ventureId: body.ventureId, kind: body.kind, summary: body.text, provenance: 'owner-reported', createdAt: '2026-09-12T18:30:00Z' });
    return route.fulfill({ json: { ok: true } });
  }
  if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
  return route.fulfill({ status: 404, body: 'Not found' });
});

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'The workspace could not be loaded' }).waitFor();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('heading', { name: 'Your portfolio', exact: true }).waitFor();
  await page.getByText('Ready to use now', { exact: true }).waitFor();
  await page.getByText('Awaiting owner', { exact: true }).waitFor();
  await page.getByRole('link', { name: /Try it locally/ }).waitFor();
  assert.equal(requests.filter(request => request.method === 'POST').length, 0, 'retry must not mutate state');
  await page.screenshot({ path: resolve(output, 'portfolio-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Owner operating packet', exact: true }).click();
  await page.getByText('The prototypes are inspectable. Customer demand remains unknown.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open decisions', exact: true }).click();
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.locator('#primary-navigation [data-navigate=overview]').click();
  await page.locator('.venture-card').filter({ has: page.getByRole('heading', { name: 'Release confidence', exact: true }) }).getByRole('button', { name: 'Open venture' }).click();
  await page.getByRole('button', { name: 'Work', exact: true }).last().click();
  await page.locator('[data-task-card="qa-inspect"]').getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByText('Inspect the estimate journey: execution requested.', { exact: true }).waitFor();
  assert.deepEqual(requests.find(request => request.body?.action === 'run').body, { action: 'run', ventureId: 'release-qa', taskId: 'qa-inspect' });
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByRole('button', { name: 'Read source', exact: true }).click();
  assert.match(await page.locator('#dialog-body').innerText(), /<img src=x onerror=/);
  assert.doesNotMatch(await page.locator('#dialog-body').innerText(), /PRIVATE TOOL-DESK RECORD/, 'source identity must include its venture');
  assert.equal(await page.locator('#dialog-body img').count(), 0);
  assert.equal(await page.evaluate(() => window.sourceExecuted), undefined);
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Owner interview notes');
  await page.getByLabel('What does the evidence establish?').fill('The operator described a specific workflow; willingness to pay remains unknown.');
  await page.getByRole('button', { name: 'Save evidence', exact: true }).click();
  await page.getByText('Evidence saved with owner-supplied provenance.', { exact: true }).waitFor();
  assert.equal(requests.find(request => request.body?.action === 'evidence').body.ventureId, 'release-qa');
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByLabel('What was actually observed?').fill('The first review found one actionable issue.');
  await page.getByRole('button', { name: 'Save observation', exact: true }).click();
  await page.getByText('Observation saved. Related work can now be reassessed.', { exact: true }).waitFor();
  await page.locator('#primary-navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Request revision', exact: true }).click();
  await page.getByLabel('What should change, and why?').fill('Keep the correction request for later.');
  const beforeCancel = requests.filter(request => request.method === 'POST').length;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(requests.filter(request => request.method === 'POST').length, beforeCancel, 'revision cancellation must not submit');
  await page.getByRole('button', { name: 'Request revision', exact: true }).click();
  await page.getByLabel('What should change, and why?').fill('Explain stock conflicts before the operator confirms collection.');
  await page.getByRole('button', { name: 'Create revision task', exact: true }).click();
  await page.getByText('Revision task created. The existing output remains available.', { exact: true }).waitFor();
  assert.deepEqual(requests.find(request => request.body?.action === 'request_revision').body, { action: 'request_revision', ventureId: 'tool-desk', artifactId: 'product-1', expectedHash: 'product-sha', instruction: 'Explain stock conflicts before the operator confirms collection.' });
  const draftCard = page.locator('.commercial-card').filter({ has: page.getByRole('heading', { name: 'Validation invitation', exact: true }) });
  await draftCard.getByRole('button', { name: 'Read exact draft', exact: true }).click();
  await page.getByText('Prepared draft · not sent', { exact: true }).waitFor();
  assert.match(await page.locator('#dialog-body .draft-body').innerText(), /<img src=x onerror=/);
  assert.equal(await page.locator('#dialog-body img').count(), 0);
  assert.equal(await page.getByRole('button', { name: /^Send/ }).count(), 0);
  await page.getByText('Controlled Gmail test setup', { exact: true }).click();
  assert.equal(await page.locator('#dialog-body input').count(), 0, 'setup guidance must not collect credentials');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.locator('.commercial-card').filter({ has: page.getByRole('heading', { name: 'Outdated invitation', exact: true }) }).getByText('Needs review', { exact: true }).waitFor();
  await draftCard.getByRole('button', { name: 'Record outside outcome', exact: true }).click();
  assert.ok(page.url().includes('venture=tool-desk') && page.url().includes('draft=tool-invitation'));
  await page.getByLabel('What was actually observed?').fill('UI verification only: an outside outcome can retain exact draft context. No customer response is asserted.');
  await page.getByRole('button', { name: 'Save observation', exact: true }).click();
  await page.getByText('Observation saved. Related work can now be reassessed.', { exact: true }).waitFor();
  const outcome = requests.filter(request => request.body?.action === 'observation').at(-1).body;
  assert.equal(outcome.ventureId, 'tool-desk'); assert.equal(outcome.commercialDraftId, 'tool-invitation'); assert.equal(outcome.artifactHash, 'product-sha');
  assert.equal(requests.filter(request => ['send', 'dispatch', 'approve'].includes(request.body?.action)).length, 0);
  await page.goto(`${base}/?venture=signal-brief&view=work`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-task-card="brief-live"]').getByRole('button', { name: /Run/ }).count(), 0, 'unavailable model work must not offer Run');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile must not overflow');
  await page.screenshot({ path: resolve(output, 'portfolio-mobile.png'), fullPage: true });
  assert.deepEqual(errors.filter(error => !error.includes('503')), []);
  console.log(JSON.stringify({ status: 'passed', checks: ['GET retry without mutation', 'product-first dashboard and local try link', 'scoped task execution', 'plaintext source inspection', 'venture-scoped identical source IDs', 'scoped owner evidence', 'scoped observations', 'revision cancel does not mutate', 'version-bound revision request', 'operating packet drilldown', 'exact plaintext commercial draft', 'stale draft disclosure', 'no sending or credential control', 'draft-bound outside outcome', 'disabled live task controls', 'responsive mobile layout', 'no unexpected browser errors'], requests: requests.length, output }, null, 2));
} finally { await browser.close(); }
