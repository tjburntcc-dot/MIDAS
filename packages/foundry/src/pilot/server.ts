import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireThat, hash } from '../contracts.ts';
import { PilotService } from './service.ts';
import { PilotLearning } from './learning.ts';
import { InteractivePreviewSessions, renderRemotePreview } from '../portfolio/preview.ts';

const here = dirname(fileURLToPath(import.meta.url));
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export function servePilot(options: { service: PilotService; port?: number }) {
  const service = options.service, sessions = new Map<string, { csrf: string; at: number }>();
  const previews = new InteractivePreviewSessions();
  const previewOwners = new Map<string, {owner: string; businessId: string; taskId: string}>();
  const opening = new Set<string>();
  let origin = '';
  const server = createServer(async (req, res) => {
    const send = (status: number, value: any, headers: Record<string,string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...headers });
      res.end(typeof value === 'string' ? value : JSON.stringify(value));
    };
    try {
      requireThat(req.headers.host === new URL(origin).host, 'HOST_DENIED');
      const url = new URL(req.url ?? '/', origin);
      if (req.method === 'GET' && url.pathname === '/health') { send(200, {status: 'ok', version: '032', providerEnabled: false}); return; }
      if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      if (req.method === 'GET' && ['/', '/app.js', '/style.css', '/pilot.js', '/pilot.css'].includes(url.pathname)) {
        const file = url.pathname === '/' ? 'index.html' : url.pathname === '/pilot.js' ? 'app.js' : url.pathname === '/pilot.css' ? 'style.css' : url.pathname.slice(1);
        send(200, readFileSync(join(here, file), 'utf8'), { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'content-security-policy': csp }); return;
      }
      const cookie = (req.headers.cookie ?? '').match(/(?:^|;\s*)midas032=([a-f0-9]{48})(?:;|$)/)?.[1];
      let session = cookie ? sessions.get(cookie) : null, sessionId = cookie ?? '';
      if (req.method === 'GET' && url.pathname === '/api/session') {
        if (!session || Date.now() - session.at > 12 * 3600000) {
          sessionId = randomBytes(24).toString('hex'); session = {csrf: randomBytes(24).toString('hex'), at: Date.now()}; sessions.set(sessionId, session);
          res.setHeader('set-cookie', 'midas032=' + sessionId + '; HttpOnly; SameSite=Strict; Path=/');
        }
        send(200, {csrf: session.csrf, mode: 'local_owner', providerEnabled: false, externalEffects: false}); return;
      }
      requireThat(session && Date.now() - session.at < 12 * 3600000, 'OWNER_SESSION_REQUIRED');
      const businessId = url.searchParams.get('businessId') ?? undefined;
      if (req.method === 'GET' && url.pathname === '/api/state') { send(200, service.view(businessId)); return; }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        requireThat(businessId, 'BUSINESS_REQUIRED'); send(200, service.exportBusiness(businessId), { 'content-disposition': 'attachment; filename="midas-business-evidence.json"' }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/live-preparation') {
        requireThat(businessId, 'BUSINESS_REQUIRED'); send(200, await service.prepareLive(businessId), { 'content-disposition': 'attachment; filename="unsigned-pilot-preparation.json"' }); return;
      }
      if (req.method === 'GET' && ['/api/artifact','/preview','/download'].includes(url.pathname)) {
        requireThat(businessId, 'BUSINESS_REQUIRED'); const taskId = url.searchParams.get('taskId') ?? ''; service.task(businessId, taskId);
        if (url.pathname === '/api/artifact') { send(200, service.artifactView(businessId, taskId)); return; }
        if (url.pathname === '/download') {
          const item = (service.execution as any).download(businessId, taskId, url.searchParams.get('file') ?? undefined);
          send(200, item.content, { 'content-type': item.mimeType ?? 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="' + String(item.fileName ?? 'deliverable.json').replace(/[^a-zA-Z0-9._-]/g, '_') + '"', 'content-security-policy': "sandbox; default-src 'none'" }); return;
        }
        const preview = (service.execution as any).preview(businessId, taskId);
        const html = preview.kind === 'service' ? preview.html : renderRemotePreview({...preview.binding, openEndpoint: '/api/preview/open', actionEndpoint: '/api/preview/action', csrf: session!.csrf, exportFormat: 'json'});
        send(200, html, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }); return;
      }
      requireThat(req.method === 'POST' && req.headers.origin === origin && req.headers['x-csrf-token'] === session!.csrf, 'CSRF_INVALID');
      requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON_REQUIRED');
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; requireThat(length <= 300000, 'REQUEST_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireThat(body && typeof body === 'object' && !Array.isArray(body), 'OBJECT_REQUIRED');
      if (url.pathname === '/api/preview/open') {
        service.task(body.ventureId, body.taskId);
        const preview = service.execution.preview(body.ventureId, body.taskId);
        requireThat(preview.binding.manifestHash === body.manifestHash, 'PREVIEW_MANIFEST_STALE');
        const key = sessionId + '/' + body.taskId; requireThat(!opening.has(key), 'PREVIEW_OPEN_PENDING'); opening.add(key);
        try {
          for (const [id, old] of previewOwners) if (old.owner === sessionId && old.taskId === body.taskId) { await previews.close(id); previewOwners.delete(id); }
          requireThat(previewOwners.size < 6, 'PREVIEW_CAPACITY');
          const result = await previews.open({...preview.binding, files: preview.files, executionProfile: preview.executionProfile, viewportWidth: body.viewportWidth, stateHandler: input => service.execution.previewState(body.ventureId, preview.binding.taskId, input)});
          previewOwners.set(result.sessionId, {owner: sessionId, businessId: body.ventureId, taskId: body.taskId}); send(200, result);
        } finally { opening.delete(key); } return;
      }
      if (url.pathname === '/api/preview/action') {
        const owner = previewOwners.get(body.sessionId); requireThat(owner?.owner === sessionId, 'PREVIEW_SESSION_SCOPE');
        const binding = previews.binding(body.sessionId), preview = service.execution.preview(owner!.businessId, owner!.taskId);
        requireThat(preview.binding.manifestHash === binding.manifestHash, 'PREVIEW_MANIFEST_STALE');
        send(200, await previews.act(body.sessionId, body)); return;
      }
      let selected = body.businessId, result: any = null, status = 200;
      if (url.pathname === '/api/business') {
        // Browser input cannot set fixture mode or grant authority.
        result = service.knowledge.createCompany({name: body.name, website: body.website, goal: body.goal, notes: body.notes}); selected = result.id;
      } else if (url.pathname === '/api/demo') { result = service.knowledge.createDemo(); selected = result.id ?? result.company?.id; }
      else {
        requireThat(typeof selected === 'string', 'BUSINESS_REQUIRED'); service.knowledge.company(selected);
        if (url.pathname === '/api/business/update') result = service.knowledge.updateCompany(selected, Object.fromEntries(['name','website','goal','notes'].filter(key => body[key] !== undefined).map(key => [key,body[key]])), body.expectedVersion);
        else if (url.pathname === '/api/source') result = service.knowledge.addSource(selected, {title: body.title, text: body.text, kind: body.kind, rights: body.rights, observedAt: body.observedAt, validUntil: body.validUntil ?? null});
        else if (url.pathname === '/api/evidence/select') result = service.knowledge.selectEvidence(selected, body.sourceIds);
        else if (url.pathname === '/api/diagnose') result = await service.knowledge.diagnose(selected);
        else if (url.pathname === '/api/plan') {
          result = service.plan(selected, body.workflow);
        } else if (url.pathname === '/api/run' || url.pathname === '/api/resume') {
          service.task(selected, body.taskId);
          requireThat(service.knowledge.company(selected).mode === 'fixture', 'PILOT_LIVE_GRANT_REQUIRED');
          service.launch(selected, body.taskId, () => url.pathname === '/api/resume' ? service.execution.resume(selected, body.taskId) : service.execution.run(selected, body.taskId)); status = 202;
        } else if (url.pathname === '/api/pause') { service.task(selected, body.taskId); result = (service.execution as any).pause(selected, body.taskId); }
        else if (url.pathname === '/api/review/start') { result = {reviewSessionId: service.reviewStart(selected, body.taskId, sessionId)}; }
        else if (url.pathname === '/api/approve') {
          const artifact = service.bindArtifact(selected, body.taskId, body.artifactHash);
          requireThat(artifact.checks?.length && artifact.checks.every((c: any) => c.passed || c.required === false), 'CHECKED_ARTIFACT_REQUIRED');
          const timing = service.finishReview(body, sessionId, 'accept_local_deliverable');
          result = service.store.transaction(() => {
            const prior = service.store.get('pilot-acceptance', body.taskId);
            const acceptance = { businessId: selected, taskId: body.taskId, artifactHash: body.artifactHash, at: new Date().toISOString(), actor: 'local-owner-session', scope: 'accept local artifact only; no sending, deployment or independent validation', timing, assisted: body.assisted };
            service.store.record({tenantId:'mason',businessId:selected,runId:'pilot-032',dataPolicyVersion:'pilot-local-v1',mode:'fixture'}, 'acceptance-' + randomBytes(12).toString('hex'), 'PilotLocalAcceptance', acceptance);
            return service.store.put('pilot-acceptance', body.taskId, acceptance, prior?._version ?? null);
          });
        } else if (url.pathname === '/api/correct') {
          service.bindArtifact(selected, body.taskId, body.artifactHash);
          requireThat(typeof body.instruction === 'string' && body.instruction.trim().length >= 5 && body.instruction.length <= 2000, 'CORRECTION_REQUIRED_5_TO_2000_CHARACTERS');
          const timing = service.finishReview(body, sessionId, 'correction_request');
          const observation = service.knowledge.correction(selected, {...body, timing});
          result = await (service.execution as any).correct({...body, businessId: selected, observation});
          const newTaskId = result.id ?? result.taskId ?? result.task?.id;
          service.store.transaction(() => service.store.put('pilot-correction-link', 'correction-' + randomBytes(12).toString('hex'), {businessId: selected, taskId: body.taskId, newTaskId, artifactHash: body.artifactHash, instruction: body.instruction, observationId: observation?.id, timing, at: new Date().toISOString()}, null));
          if (newTaskId && service.knowledge.company(selected).mode === 'fixture') { service.launch(selected, newTaskId, () => service.execution.run(selected, newTaskId)); status = 202; }
        } else if (url.pathname === '/api/outcome') {
          service.bindArtifact(selected, body.taskId, body.artifactHash);
          requireThat(['accepted','needs-change','not-useful'].includes(body.kind) && typeof body.notes === 'string' && body.notes.trim().length > 0 && body.notes.length <= 4000 && typeof body.assisted === 'boolean', 'OUTCOME_EVIDENCE_REQUIRED');
          result = service.knowledge.outcome(selected, body);
          service.store.transaction(() => service.store.put('pilot-owner-outcome', 'outcome-' + randomBytes(12).toString('hex'), {...body, id: result?.id ?? randomBytes(12).toString('hex'), at: new Date().toISOString(), provenance: 'owner_report', measuredRevenueMinor: null, causalAttribution: 'not established'}, null));
        } else if (url.pathname === '/api/learning') {
          service.task(selected, body.taskId);
          const task = service.task(selected, body.taskId);
          result = new PilotLearning(service.store).run(selected, body.taskId, (task.inputs as any)?.pilotWorkflow ?? 'response-packet');
        } else { send(404, {error: 'ROUTE_NOT_FOUND'}); return; }
      }
      service.audit(selected, url.pathname, { taskId: body.taskId ?? null, artifactHash: body.artifactHash ?? null, resultHash: hash(result), providerRequests: 0 });
      send(status, {view: service.view(selected), result, ...(result?.reviewSessionId ? {reviewSessionId: result.reviewSessionId} : {})});
    } catch (error: any) {
      const code = String(error?.code ?? error?.message ?? 'REQUEST_FAILED').slice(0, 240);
      const denial = /CSRF|SCOPE|HOST|SESSION|GRANT/.test(code);
      send(denial ? 403 : /STALE|CHANGED|RUNNING/.test(code) ? 409 : 400, { error: code, action: denial ? 'Check the local session, selected business and required authorization.' : 'Refresh the current state and correct the indicated input. Prior evidence is preserved.' });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  const ready = new Promise<string>(resolve => { server.listen(options.port ?? 43143, '127.0.0.1', () => { origin = 'http://127.0.0.1:' + (server.address() as any).port; resolve(origin); }); });
  return { server, ready, close: async () => { await service.settle(); await previews.closeAll(); await new Promise<void>((resolve,reject) => server.close(e => e ? reject(e) : resolve())); } };
}
