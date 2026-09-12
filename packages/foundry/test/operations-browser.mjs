import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.MIDAS_OPERATIONS_URL || 'http://127.0.0.1:43130';
const reports = resolve(process.env.MIDAS_OPERATIONS_REPORTS || 'reports/operations-browser');
mkdirSync(reports, { recursive: true });

const fail = message => { throw new Error(`operations browser audit: ${message}`); };
async function waitFor(predicate, description, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  fail(`timed out waiting for ${description}`);
}
async function screenshot(page, name) { await page.screenshot({ path: resolve(reports, `${name}.png`), fullPage: true }); }
async function selectedState(page, id) { return page.evaluate(businessId => fetch(`/api/operations?id=${encodeURIComponent(businessId)}`, { cache: 'no-store' }).then(response => response.json()).then(value => value.selected), id); }
async function refreshBusiness(page, id) { await page.locator('#business-select').selectOption(id); }

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(7_000);
const consoleErrors = [];
const apiRequests = [];
const failedResponses = [];
page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push({ text: entry.text(), location: entry.location() }); });
page.on('pageerror', error => consoleErrors.push(error.message));
page.on('request', request => { if (request.url().startsWith(`${base}/api/operations`)) apiRequests.push({ method: request.method(), url: request.url() }); });
page.on('response', response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), method: response.request().method(), url: response.url() }); });

try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  await page.getByRole('heading', { name: 'Business', exact: true }).waitFor();
  await page.getByText('No customer interviews, demand, accepted work or revenue have been observed.').waitFor();
  await screenshot(page, '01-prepared-workspace');

  await page.getByRole('button', { name: 'Create offline demonstration workspace' }).first().click();
  await page.getByText('Demonstration workspace · separate from your operating business').waitFor();
  await page.getByText('Offline preparation').first().waitFor();
  const demoId = await page.locator('#business-select').inputValue();
  await screenshot(page, '02-offline-demonstration');

  await page.getByRole('button', { name: /Work/ }).first().click();
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  await page.getByText('Persisted work request created.').waitFor();
  const automaticRequestStart = apiRequests.length;
  await page.waitForTimeout(4_250);
  const automaticRequests = apiRequests.slice(automaticRequestStart);
  if (automaticRequests.some(request => request.method === 'POST')) fail(`background refresh made a POST request: ${JSON.stringify(automaticRequests)}`);
  await waitFor(async () => (await selectedState(page, demoId))?.phase === 'approval', 'offline work to reach exact approval');
  await refreshBusiness(page, demoId);
  await page.getByRole('button', { name: /Pipeline/ }).first().click();
  await page.getByRole('heading', { name: 'Tool-library workflow discovery packet', exact: true }).last().waitFor();
  await page.getByRole('button', { name: 'Revise material' }).last().click();
  await page.getByRole('dialog').getByLabel('Title').fill('Tool-library workflow discovery packet — reviewed');
  await page.getByRole('dialog').getByRole('button', { name: 'Save revision' }).click();
  await page.getByText('Revision saved.').waitFor();
  await screenshot(page, '03-artifact-revised');

  await page.getByRole('button', { name: /Work/ }).first().click();
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  await waitFor(async () => (await selectedState(page, demoId))?.phase === 'approval', 'reviewed revision to reach a new exact approval');
  await refreshBusiness(page, demoId);
  await page.getByRole('button', { name: /Approvals/ }).first().click();
  await page.getByText('Exact approval requests').waitFor();
  await page.getByText('From').waitFor();
  await page.getByRole('button', { name: 'Approve exact batch' }).click();
  await waitFor(() => page.getByRole('button', { name: 'Dispatch approved batch' }).count().then(Boolean), 'approved dispatch control');
  await page.getByRole('button', { name: 'Dispatch approved batch' }).click();
  await page.getByText('Approved batch dispatched.').waitFor();
  const explicitReplyCheckStart = apiRequests.length;
  await page.getByRole('button', { name: 'Check replies' }).click();
  await page.getByText('Replies and work status refreshed.').waitFor();
  const explicitReplyCheckRequests = apiRequests.slice(explicitReplyCheckStart);
  if (!explicitReplyCheckRequests.some(request => request.method === 'POST')) fail(`Check replies did not invoke the explicit polling action: ${JSON.stringify(explicitReplyCheckRequests)}`);
  await screenshot(page, '04-exact-approval-dispatched');

  await page.getByRole('button', { name: /Business/ }).first().click();
  await page.getByLabel('Evidence title').fill('Controlled mock contact permission');
  await page.getByLabel('What was actually provided?').fill('The owner permits a controlled offline test contact. This is neither public publishing permission nor evidence of demand or revenue.');
  await page.getByRole('button', { name: 'Save owner-provided evidence' }).click();
  await page.getByText('Owner-provided evidence saved.').waitFor();

  await page.getByRole('button', { name: /Results/ }).first().click();
  await page.getByText(/Revenue: Unknown|Revenue remains unknown/).waitFor();
  await page.getByRole('button', { name: 'Simulate negative reply' }).click();
  await page.getByText('Negative mock reply recorded.').waitFor();
  await page.getByText(/This is not a current problem/).waitFor();
  await page.getByText('Revenue: Unknown').first().waitFor();
  await page.getByLabel('What did you observe?').fill('Owner observed that the mock reply rejected the proposed workflow. Revenue remains unknown.');
  await page.getByRole('button', { name: 'Save outside observation' }).click();
  await page.getByText('Outside observation saved as unverified.').waitFor();
  await waitFor(() => page.getByRole('button', { name: 'Add to learning' }).count().then(Boolean), 'a retained learning source');
  await page.getByRole('button', { name: 'Add to learning' }).first().click();
  await page.getByText('Learning source saved.').waitFor({ timeout: 20_000 });
  await page.getByText('Paired procedure study').waitFor();
  if ((await page.locator('#workspace').textContent()).includes('[object Object]')) fail('procedure study rendered an object instead of its typed results');
  await screenshot(page, '05-negative-result');

  await page.getByRole('button', { name: /Business/ }).first().click();
  await page.getByText('Allowed sources').waitFor();
  await page.getByText('Read retained source text').first().click();
  await page.locator('.source-id').first().waitFor();
  await page.getByText('Its ID alone is not usable evidence.').first().waitFor();
  await screenshot(page, '06-source-drilldown');

  await page.setViewportSize({ width: 390, height: 844 });
  await refreshBusiness(page, demoId);
  const mobile = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
  if (mobile.scrollWidth > mobile.width) fail(`mobile horizontal overflow (${mobile.scrollWidth} > ${mobile.width})`);
  await screenshot(page, '07-mobile');
  if (consoleErrors.length) fail(`console errors: ${JSON.stringify(consoleErrors)}; failed responses: ${JSON.stringify(failedResponses)}`);
  console.log(JSON.stringify({ ok: true, base, reports, apiRequests: apiRequests.length }, null, 2));
} finally {
  await browser.close();
}
