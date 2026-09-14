import { randomUUID } from 'node:crypto';
import { requireThat } from '../contracts.ts';
import { parseProjectManifest, type ProjectEntity, type ProjectField, type ProjectCheckResult } from './project-contracts.ts';
import { TrustedProjectServer } from './project-server.ts';
import { ProjectWorkspace } from './project-workspace.ts';

export const declaredProjectCommands = ['project.schema', 'project.http'] as const;
export type DeclaredProjectCommand = typeof declaredProjectCommands[number];
const check = (id: string, passed: boolean, summary: string, evidence?: unknown) => ({ id, passed, summary, ...(evidence === undefined ? {} : { evidence }) });
const valueFor = (field: ProjectField): string | number | boolean => field.type === 'string' ? field.values?.[0] ?? 'Mechanical check' : field.type === 'integer' ? Math.max(field.min ?? 0, 0) : true;
function recordFor(entity: ProjectEntity) { return Object.fromEntries(Object.entries(entity.fields).map(([id, field]) => [id, valueFor(field)])); }
async function response(url: string, init?: RequestInit) { const result = await fetch(url, init); const body = await result.json(); return { status: result.status, body }; }
async function browserJourney(
  preview: { url: string },
  entity: ProjectEntity,
  actions: any[],
  options: { launchBrowser: () => Promise<any>; saveScreenshot?: (name: string, bytes: Buffer) => void },
) {
  let browser: any = null;
  let context: any = null;
  try {
    browser = await options.launchBrowser();
    context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    await context.addInitScript(() => {
      for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection']) {
        try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch {}
      }
    });
    let blocked = 0;
    let page: any = null;
    await context.route('**/*', async (route: any) => {
      if (new URL(route.request().url()).origin !== preview.url) {
        blocked++;
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });
    await context.routeWebSocket('**/*', (socket: any) => { blocked++; socket.close(); });
    context.on('page', (candidate: any) => {
      if (page && candidate !== page) { blocked++; void candidate.close(); }
    });
    context.on('download', (download: any) => { blocked++; void download.cancel(); });
    page = await context.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(5_000);
    await page.goto(preview.url + '/', { waitUntil: 'domcontentloaded', timeout: 5_000 });

    const field = async (id: string) => {
      const locator = page.locator('[data-project-field="' + id + '"]');
      requireThat(await locator.count() === 1, 'PROJECT_BROWSER_FIELD_MARKER:' + id);
      return locator;
    };
    const save = page.locator('[data-project-save]');
    requireThat(await save.count() === 1, 'PROJECT_BROWSER_SAVE_MARKER');
    requireThat(await page.locator('[data-project-error]').count() === 1, 'PROJECT_BROWSER_ERROR_MARKER');
    for (const id of Object.keys(entity.fields)) await field(id);

    const invalidId = Object.entries(entity.fields).find(([, value]) => value.required && value.type === 'string')?.[0];
    requireThat(invalidId, 'PROJECT_BROWSER_TESTABLE_FIELD');
    const invalidControl = await field(invalidId);
    await invalidControl.fill('');
    const beforeInvalid = (await response(preview.url + '/api/entities/' + entity.id)).body.records.length;
    await save.click();
    await page.waitForTimeout(100);
    const invalidText = String(await page.locator('[data-project-error]').textContent() ?? '');
    const afterInvalid = (await response(preview.url + '/api/entities/' + entity.id)).body.records.length;

    const set = async (id: string, value: string | number | boolean) => {
      const control = await field(id);
      const tag = await control.evaluate((node: any) => node.tagName.toLowerCase());
      const type = await control.getAttribute('type');
      if (type === 'checkbox') {
        if (value) await control.check(); else await control.uncheck();
      } else if (tag === 'select') {
        await control.selectOption(String(value));
      } else {
        await control.fill(String(value));
      }
    };
    for (const [id, definition] of Object.entries(entity.fields)) await set(id, valueFor(definition));
    const beforeCreate = (await response(preview.url + '/api/entities/' + entity.id)).body.records;
    const [createResponse] = await Promise.all([
      page.waitForResponse((result: any) => result.request().method() === 'POST' && result.url() === preview.url + '/api/entities/' + entity.id, { timeout: 5_000 }),
      save.click(),
    ]);
    requireThat(createResponse.status() === 201, 'PROJECT_BROWSER_CREATE_STATUS:' + createResponse.status());
    await page.waitForTimeout(150);
    const visibleRecords = await page.locator('[data-project-record]').count();
    requireThat(visibleRecords >= beforeCreate.length + 1, 'PROJECT_BROWSER_CREATE_NOT_RENDERED:' + visibleRecords);
    const afterCreate = (await response(preview.url + '/api/entities/' + entity.id)).body.records;
    const created = afterCreate.find((row: any) => !beforeCreate.some((old: any) => old.id === row.id));
    requireThat(created, 'PROJECT_BROWSER_CREATE_NOT_OBSERVED');

    const open = page.locator('[data-project-open]').last();
    requireThat(await open.count() === 1, 'PROJECT_BROWSER_OPEN_MARKER');
    await open.click();
    const editedValue = 'Edited mechanical check';
    await set(invalidId, editedValue);
    await save.click();
    await page.waitForTimeout(100);
    const afterEdit = (await response(preview.url + '/api/entities/' + entity.id)).body.records;
    const edited = afterEdit.find((row: any) => row.id === created.id);
    requireThat(edited?.[invalidId] === editedValue && afterEdit.length === afterCreate.length, 'PROJECT_BROWSER_EDIT_NOT_OBSERVED');

    let actionObserved = true;
    let actionId: string | null = null;
    const configured = actions.find(action => action.entity === entity.id);
    if (configured) {
      actionId = configured.id;
      const action = page.locator('[data-project-action="' + configured.id + '"]').last();
      requireThat(await action.count() === 1, 'PROJECT_BROWSER_ACTION_MARKER:' + configured.id);
      await action.click();
      await page.waitForTimeout(100);
      const afterAction = (await response(preview.url + '/api/entities/' + entity.id)).body.records.find((row: any) => row.id === created.id);
      actionObserved = Object.entries(configured.set).every(([key, value]) => afterAction?.[key] === value);
    }

    const desktop = await page.screenshot({ type: 'png', animations: 'disabled' });
    options.saveScreenshot?.('project-preview-desktop.png', desktop);
    await page.setViewportSize({ width: 390, height: 850 });
    const narrow = await page.screenshot({ type: 'png', animations: 'disabled' });
    options.saveScreenshot?.('project-preview-narrow.png', narrow);
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const renderedText = String(await page.locator('body').textContent() ?? '').slice(0, 4_000);
    return {
      passed: invalidText.trim().length > 0 && beforeInvalid === afterInvalid && actionObserved && noOverflow && blocked === 0,
      evidence: {
        renderedText,
        invalidText,
        recordsBefore: beforeCreate.length,
        recordsAfterCreate: afterCreate.length,
        recordsAfterEdit: afterEdit.length,
        actionId,
        actionObserved,
        noOverflow,
        desktopScreenshotBytes: desktop.length,
        narrowScreenshotBytes: narrow.length,
        blockedExternalRequests: blocked,
      },
    };
  } finally {
    await context?.close();
    await browser?.close();
  }
}

/** Fixed, trusted commands. There is intentionally no `shell`, package manager,
 * or worker-selected executable. The HTTP journey runs against a throwaway copy
 * so checks never create business records in the owner's persisted application. */
export async function runProjectCommand(workspace: ProjectWorkspace, command: DeclaredProjectCommand, options: { launchBrowser?: () => Promise<any>; saveScreenshot?: (name: string, bytes: Buffer) => void } = {}): Promise<ProjectCheckResult> {
  requireThat((declaredProjectCommands as readonly string[]).includes(command), 'PROJECT_COMMAND_DENIED'); const revision = workspace.revision(); const checks: ProjectCheckResult['checks'] = [];
  try { const source = workspace.read('project.json'); const manifest = parseProjectManifest(source.content); checks.push(check('project.schema', true, 'Declarative entities, validation constraints, and actions satisfy the supported project contract.', { entities: manifest.entities.map(entity => entity.id), actions: (manifest.actions ?? []).map(action => action.id) }));
    if (command === 'project.http') { const copy = new ProjectWorkspace(workspace.root, 'check-' + randomUUID()); let server: TrustedProjectServer | null = null; let restarted: TrustedProjectServer | null = null; try { copy.seed(revision.files.map(file => ({ path: file.path, content: workspace.read(file.path).content }))); server = new TrustedProjectServer(copy); const preview = await server.start(); const home = await fetch(preview.url + '/'); const health = await response(preview.url + '/api/health'); const entity = manifest.entities[0]; const create = await response(preview.url + '/api/entities/' + encodeURIComponent(entity.id), { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'mechanic-' + randomUUID().replaceAll('-', '') }, body: JSON.stringify({ record: recordFor(entity) }) });
      const repeated = await response(preview.url + '/api/entities/' + encodeURIComponent(entity.id), { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'repeat-' + randomUUID().replaceAll('-', '') }, body: JSON.stringify({ record: recordFor(entity) }) });
      const repeatAgain = await response(preview.url + '/api/entities/' + encodeURIComponent(entity.id), { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': Object.keys(copy.state().operations).find(key => key.startsWith('repeat-'))! }, body: JSON.stringify({ record: recordFor(entity) }) });
      const listed = await response(preview.url + '/api/entities/' + encodeURIComponent(entity.id)); const exported = await response(preview.url + '/api/export');
      checks.push(check('project.preview', home.status === 200 && (home.headers.get('content-security-policy') ?? '').includes("connect-src 'self'") && health.status === 200 && health.body.manifestHash === revision.manifestHash, 'Trusted loopback backend served the worker-authored frontend with a local-only CSP and manifest-bound identity.', { origin: new URL(preview.url).origin, manifestHash: health.body.manifestHash }));
      if (options.launchBrowser) { try { const journey = await browserJourney(preview, entity, manifest.actions ?? [], { launchBrowser: options.launchBrowser, saveScreenshot: options.saveScreenshot }); checks.push(check('project.browser', journey.passed, 'Managed browser exercised visible invalid feedback, create/readback, reopen/edit, configured local action and a narrow current frontend.', journey.evidence)); } catch (error) { checks.push(check('project.browser', false, 'Browser rendering did not establish the required connected project journey.', { error: error instanceof Error ? error.message : String(error) })); } }
      checks.push(check('project.persistence', create.status === 201 && listed.status === 200 && listed.body.records.length === 2 && repeated.status === 201 && repeatAgain.status === 201 && exported.status === 200 && exported.body.state.entities[entity.id].length === 2, 'Validated records persist through the trusted backend; a repeated idempotency key returns its original effect without creating another record.', { records: listed.body.records.length, exportedVersion: exported.body.state.version }));
      const recordsBeforeRestart = (await response(preview.url + '/api/entities/' + encodeURIComponent(entity.id))).body.records.length;
      await server.close(); server = null; restarted = new TrustedProjectServer(copy); await restarted.start(); const afterRestart = await response(restarted.url() + '/api/entities/' + encodeURIComponent(entity.id)); checks.push(check('project.restart', afterRestart.status === 200 && afterRestart.body.records.length === recordsBeforeRestart, 'The backend reads the same durable state after a process restart.', { records: afterRestart.body.records.length, expectedRecords: recordsBeforeRestart }));
    } finally { await server?.close(); await restarted?.close(); copy.clear(); } }
  } catch (error) { checks.push(check(command === 'project.schema' ? 'project.schema' : 'project.http', false, 'Trusted project check failed before it could establish the required behavior.', { error: error instanceof Error ? error.message : String(error) })); }
  const result: ProjectCheckResult = { manifestHash: revision.manifestHash, passed: checks.every(item => item.passed), checks, at: new Date().toISOString() }; return workspace.recordCheck(result).checkResult!;
}
