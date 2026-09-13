import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const assets = resolve(root, 'packages/foundry/src/portfolio');
const base = 'http://127.0.0.1:43134';

const snapshot = {
  portfolio: { name: 'Owner accounting fixture', goal: 'Check owner language only.', maxConcurrency: 1 },
  ventures: [{ id: 'v', name: 'Venture', stage: 'prototype', status: 'active', goal: 'A local fixture.' }],
  workers: [], sources: [], claims: [], observations: [], decisions: [], commercialDrafts: [], activity: [],
  resources: { activeWorkerSlots: 0, limits: {} },
  modelAccounting: {
    status: 'available', currency: 'USD', readOnly: true, executionAuthority: false,
    ledgerEvidence: 'preserved_historical_signed_ledger', historicalOnly: true, settledBillingStatus: 'not_recorded', retainedExposureStatus: 'ledger_verified',
    callsUsed: 2, callLimit: 25, inferenceDispatches: 2, countRequests: 2, provisionalMinor: 190,
    combinedCallsUsed: 11, combinedCallLimit: 34, combinedProvisionalMinor: 574,
    estimatedAttempts: 2, unknownCostAttempts: 0, settledMinor: null, settlementCount: 0,
    retainedMinor: 1753, countBufferMinor: 400, remainingMinor: 2829,
    reason: 'Persisted signed-grant ledger, readable even while model execution is disabled.'
  },
  tasks: [
    { id: 'v/incomplete', ventureId: 'v', title: 'Terminal incomplete response', status: 'needs_reconciliation', lane: 'research', objective: 'Test durable terminal status.', inputs: { continuationReplacement: { preservesUncertainOutcome: true } }, updatedAt: '2026-09-13T12:00:00Z', providerExecution: { responseId: 'resp_incomplete', status: 'incomplete', retrievalRequests: 3, terminalPersisted: true, completionState: 'terminal_incomplete', terminalIncompleteAttempts: 2 } },
    { id: 'v/unknown', ventureId: 'v', title: 'Unknown provider completion', status: 'blocked', lane: 'research', objective: 'Test unknown status.', updatedAt: '2026-09-13T11:00:00Z', providerExecution: { responseId: null, status: 'unknown', retrievalRequests: 0, terminalPersisted: false, completionState: 'completion_unknown' } }
  ],
  artifacts: []
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(5000);
page.setDefaultNavigationTimeout(5000);
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync(resolve(assets, 'index.html'), 'utf8') });
    if (url.pathname === '/portfolio.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(resolve(assets, 'app.js'), 'utf8') });
    if (url.pathname === '/portfolio.css') return route.fulfill({ contentType: 'text/css', body: readFileSync(resolve(assets, 'style.css'), 'utf8') });
    if (url.pathname === '/api/session') return route.fulfill({ json: { csrf: 'fixture-csrf' } });
    if (url.pathname === '/api/portfolio') return route.fulfill({ json: snapshot });
    return route.fulfill({ status: 204 });
  });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.locator('.model-accounting summary').click();
  await page.getByText('Historical only · no R4 authority', { exact: true }).waitFor();
  await page.getByText('Preserved parent signed ledger', { exact: true }).waitFor();
  await page.getByText('11/34 admissions across continuation', { exact: false }).waitFor();
  await page.getByText('$17.53 retained', { exact: false }).waitFor();
  await page.getByText('Business operating costs', { exact: true }).waitFor();
  await page.getByText('No business-cost record; model ledger above is separate', { exact: true }).waitFor();
  await page.getByText('No accepted build decision; 2 provider outcomes are known incomplete. The separate prior R2 outcome remains unknown.', { exact: true }).waitFor();
  await page.getByText('Continuation estimate subtotal', { exact: true }).waitFor();
  await page.getByText('Signed-ledger retained exposure', { exact: true }).waitFor();
  await page.getByText('No settlement evidence recorded for admitted dispatches', { exact: true }).waitFor();
  assert.equal(await page.getByText('Live model authority is recorded.', { exact: true }).count(), 0, 'a grant mode is not evidence of live activity');
  await page.goto(`${base}/?view=work`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Terminal incomplete response', exact: true }).waitFor();
  await page.getByText('No accepted build decision; 2 provider outcomes are known incomplete. The separate prior R2 outcome remains unknown.', { exact: true }).waitFor();
  await page.getByText('Provider recorded a terminal incomplete response. No completed provider result is claimed. Read requests: 3.', { exact: true }).waitFor();
  await page.getByText('No provider response identity is saved. Provider completion is unknown; automatic resubmission is blocked. Read requests: 0.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'owner accounting and completion status must fit 390px');
  assert.deepEqual(errors, [], 'owner display must not throw or log browser errors');
  console.log(JSON.stringify({ status: 'passed', checks: ['signed ledger is not labelled live activity', 'retained signed exposure remains visible without settlement', 'known terminal incomplete differs from unknown completion', '390px layout and console clean'] }));
} finally {
  await browser.close();
}
