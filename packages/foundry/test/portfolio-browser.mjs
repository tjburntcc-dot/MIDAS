import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { StateStore } from '../src/state.ts';
import { Portfolio } from '../src/portfolio/core.ts';
import { portfolioScope } from '../src/portfolio/contracts.ts';
import { LocalWorkTools } from '../src/portfolio/tools.ts';
import { EvidenceLibrary } from '../src/portfolio/evidence.ts';
import { PortfolioEngine } from '../src/portfolio/engine.ts';
import { preparePortfolio, offlinePortfolioModel } from '../src/portfolio/prepare.ts';
import { servePortfolio } from '../src/portfolio/server.ts';
import { prepareCommercialPackets } from '../src/portfolio/commercial.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = resolve(repository, 'var', `portfolio-browser-${Date.now()}`);
mkdirSync(root, { recursive: true });
const store = new StateStore(join(root, 'portfolio.sqlite'));
const portfolio = new Portfolio(store);
const tools = new LocalWorkTools({ store, root, scopeFor: portfolioScope });
const evidence = new EvidenceLibrary(store);
preparePortfolio(portfolio, tools, evidence);
const engine = new PortfolioEngine({ portfolio, tools, evidence, model: offlinePortfolioModel(tools) });
const app = servePortfolio({ engine, tools, port: 0 });
const origin = await app.ready;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], failedResponses = [], posts = [];
context.on('page', opened => { opened.on('pageerror', error => errors.push(error.message)); });
page.on('pageerror', error => errors.push(error.message));
context.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failedResponses.push({ status: response.status(), url: response.url() }); });
page.on('request', request => { if (request.method() === 'POST') posts.push(request.postDataJSON()); });
page.setDefaultTimeout(15000);

async function waitFor(test, description, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error(`Timed out: ${description}`);
}
async function savedTask(id, status) { await waitFor(() => portfolio.getTask(id).status === status, `${id} ${status}`); }
async function action(taskId, label) { await page.locator(`[data-task-card="${taskId}"]`).getByRole('button', { name: label, exact: true }).click(); await waitFor(() => page.locator('#refresh-button').isEnabled(), 'action feedback'); }
async function goto(view = '', venture = '') { await page.goto(`${origin}/?${new URLSearchParams({ ...(view ? { view } : {}), ...(venture ? { venture } : {}) })}`, { waitUntil: 'networkidle' }); }

try {
  await goto('work');
  await action('midas-intelligence/fulfill', 'Pause');
  await savedTask('midas-intelligence/fulfill', 'paused');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-task-card="midas-intelligence/fulfill"]').getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await action('midas-intelligence/fulfill', 'Resume');
  await action('quote-desk/fulfill', 'Run fixture');
  await action('release-readiness/fulfill', 'Run fixture');
  await Promise.all(['midas-intelligence/fulfill', 'quote-desk/fulfill', 'release-readiness/fulfill'].map(id => savedTask(id, 'completed')));
  prepareCommercialPackets(portfolio);
  await goto('work', 'quote-desk');
  await action('quote-desk/live-investigation', 'Cancel');
  await savedTask('quote-desk/live-investigation', 'cancelled');
  assert.equal(portfolio.getTask('release-readiness/live-investigation').status, 'queued', 'task cancellation must not cross venture scope');
  console.log('Actual task run, pause, resume, cancellation and refresh verified.');

  await goto('evidence', 'release-readiness');
  await page.getByRole('button', { name: 'Read source', exact: true }).first().click();
  assert.ok((await page.locator('#dialog-body .source-text').innerText()).length > 50);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Browser verification evidence · development assistant');
  await page.getByLabel('What does the evidence establish?').fill('Browser verification observation by development assistant, not owner/customer. Retain <img src=x onerror=alert(1)> as literal evidence text.');
  await page.getByRole('button', { name: 'Save evidence', exact: true }).click();
  await page.getByText('Evidence saved with owner-supplied provenance.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Browser verification evidence · development assistant', exact: true }).waitFor();
  assert.equal(await page.locator('#workspace img').count(), 0, 'source text must not execute as HTML');
  await goto('results', 'release-readiness');
  await page.getByLabel('What was actually observed?').fill('Browser verification observation by development assistant, not owner/customer: the local report opened and source text remained available.');
  await page.getByRole('button', { name: 'Save observation', exact: true }).click();
  await page.getByText('Observation saved. Related work can now be reassessed.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Browser verification observation by development assistant, not owner/customer: the local report opened and source text remained available.', { exact: true }).waitFor();
  assert.ok(portfolio.snapshot().tasks.some(task => task.ventureId === 'release-readiness' && task.capability === 'portfolio.reassess'));
  console.log('Owner forms persist with explicit test provenance; observation creates reassessment work.');

  await goto('products', 'release-readiness');
  const reportPagePromise = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Open preview', exact: false }).click();
  const reportPage = await reportPagePromise; await reportPage.waitForLoadState('networkidle');
  await reportPage.getByRole('heading', { name: 'Release-readiness validation packet', exact: true }).waitFor();
  assert.ok((await reportPage.locator('body').innerText()).includes('No buyer access'));
  await reportPage.screenshot({ path: join(root, 'service-preview.png'), fullPage: true });
  await reportPage.close();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download', exact: true }).click();
  const download = await downloadPromise; await download.saveAs(join(root, 'service-delivery.json'));
  assert.equal(await download.failure(), null);

  await page.getByRole('button', { name: 'Read exact draft', exact: true }).click();
  await page.getByText('Prepared draft · not sent', { exact: true }).waitFor();
  assert.ok((await page.locator('#dialog-body .draft-body').innerText()).includes('last release'));
  assert.equal(await page.locator('#dialog-body').getByRole('button', { name: /^Send/ }).count(), 0);
  await page.screenshot({ path: join(root, 'commercial-draft.png'), fullPage: true });
  await page.locator('#dialog-body').getByRole('button', { name: 'Record outside outcome', exact: true }).click();
  await page.getByLabel('What was actually observed?').fill('Browser verification observation by development assistant, not owner/customer: the prepared draft can be inspected and linked to a reported outcome. No external response is asserted.');
  await page.getByRole('button', { name: 'Save observation', exact: true }).click();
  await page.getByText('Observation saved. Related work can now be reassessed.', { exact: true }).waitFor();
  assert.ok(portfolio.snapshot().observations.some(item => item.metadata?.commercialDraftId && item.metadata?.reportedOnly === true));
  await goto('products', 'release-readiness');

  const beforeArtifact = portfolio.snapshot().artifacts.find(item => item.ventureId === 'release-readiness');
  await page.getByRole('button', { name: 'Request revision', exact: true }).click();
  await page.getByLabel('What should change, and why?').fill('Browser verification request by development assistant, not founder review: add a plain explanation of remaining buyer uncertainty.');
  await page.getByRole('button', { name: 'Create revision task', exact: true }).click();
  await page.getByText('Revision task created. The existing output remains available.', { exact: true }).waitFor();
  assert.equal(portfolio.snapshot().artifacts.find(item => item.id === beforeArtifact.id).sha256, beforeArtifact.sha256);
  const revision = portfolio.snapshot().tasks.find(item => item.localId.startsWith('revise-'));
  assert.ok(revision.inputs.requiresGrant);
  await goto('work', 'release-readiness');
  assert.equal(await page.locator(`[data-task-card="${revision.id}"]`).getByRole('button', { name: /Run/ }).count(), 0);
  console.log('Service preview/download and bound revision work verified.');

  await goto('products', 'quote-desk');
  const productPagePromise = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Open product', exact: false }).click();
  const productPage = await productPagePromise; productPage.setDefaultTimeout(15000);
  await productPage.getByText('Product ready · saved data persists across refresh', { exact: true }).waitFor();
  await productPage.screenshot({ path: join(root, 'product-before.png'), fullPage: true });
  console.log(`Product ready for visible journey: ${join(root, 'product-before.png')}`);
  const ready = async () => productPage.getByText('Product ready · saved data persists across refresh', { exact: true }).waitFor();
  const clickProduct = async (x, y) => { const bounds = await productPage.locator('#product').boundingBox(); await productPage.mouse.click(bounds.x + x * bounds.width / 1100, bounds.y + y * bounds.height / 850); await ready(); };
  const key = async value => { await productPage.locator('#product').focus(); await productPage.keyboard.press(value); await ready(); };
  const type = async text => { await productPage.getByPlaceholder('Text for the selected product field').fill(text); await productPage.getByRole('button', { name: 'Type into product', exact: true }).click(); await ready(); };
  // Product pixels are the public interaction surface; coordinates refer to the
  // 1100×850 managed browser screenshot, not an internal DOM or private method.
  await clickProduct(340, 425); await type('Browser verification customer · not a live buyer');
  await clickProduct(220, 508); await type('Verification service');
  await clickProduct(690, 508); await key('Control+A'); await type('2');
  await clickProduct(885, 508); await key('Control+A'); await type('10.00');
  await clickProduct(248, 563);
  await key('Tab'); await key('Enter');
  await productPage.getByRole('button', { name: 'Get CSV export', exact: true }).click(); await ready();
  const csv = await productPage.getByLabel('Exported CSV').inputValue();
  assert.ok(csv.includes('Browser verification customer'), 'visible product must save the entered quote');
  assert.ok(csv.includes('"scheduled","20.00"'), 'visible conversion must create a correctly totaled job');
  // Export leaves the managed browser focus on its Export button. Tab through
  // the quote fields and buttons to the existing job's status selector.
  for (let i = 0; i < 7; i++) await key('Tab');
  await productPage.screenshot({ path: join(root, 'product-status-selector.png'), fullPage: true });
  await key('Enter'); await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
  await productPage.getByRole('button', { name: 'Refresh saved work', exact: true }).click(); await ready();
  await productPage.getByRole('button', { name: 'Get CSV export', exact: true }).click(); await ready();
  assert.ok((await productPage.getByLabel('Exported CSV').inputValue()).includes('"completed","20.00"'), 'job status and computed total must persist through product refresh');
  await productPage.reload({ waitUntil: 'networkidle' }); await ready();
  await productPage.getByRole('button', { name: 'Get CSV export', exact: true }).click(); await ready();
  assert.ok((await productPage.getByLabel('Exported CSV').inputValue()).includes('"completed","20.00"'), 'a fresh managed browser session must read the same saved job');
  await productPage.screenshot({ path: join(root, 'product-after-quote.png'), fullPage: true });
  console.log('Quote → job → completed status → product refresh → new session → CSV verified through visible controls.');
  await productPage.close();

  await goto(); await page.getByRole('button', { name: 'Owner operating packet', exact: true }).click();
  await page.getByRole('heading', { name: 'Current bottlenecks', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.screenshot({ path: join(root, 'portfolio-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await goto();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(root, 'portfolio-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({ status: 'passed', root, scope: 'Real backend, isolated local workspace, offline fixture worker and actual browser/tool effects. No founder/customer validation or provider calls.', completedTasks: portfolio.snapshot().tasks.filter(item => item.status === 'completed').length, mutations: posts.length }, null, 2));
} catch (error) { await page.screenshot({ path: join(root, 'failure.png'), fullPage: true }).catch(() => {}); console.error(JSON.stringify({ root, errors, failedResponses })); throw error; }
finally { await browser.close(); await app.close(); store.close(); }
