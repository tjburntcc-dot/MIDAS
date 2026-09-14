import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireThat, hash } from '../contracts.ts';
import { PilotService } from './service.ts';
import { PilotLearning } from './learning.ts';
import { InteractivePreviewSessions, renderRemotePreview } from '../portfolio/preview.ts';
import {commercialFixturePort} from './intelligence-fixtures.ts';
import {CommercialReview} from './commercial-review.ts';
import {fixtureOutcomePlanner} from './fixtures-outcome.ts';

const here = dirname(fileURLToPath(import.meta.url));
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export function servePilot(options: { service: PilotService; port?: number }) {
  const service = options.service, sessions = new Map<string, { csrf: string; at: number }>();
  const previews = new InteractivePreviewSessions();
  const previewOwners = new Map<string, {owner: string; businessId: string; taskId: string;project?:boolean;manifestHash?:string}>();
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
      if (req.method === 'GET' && url.pathname === '/health') { send(200, {status: 'ok', version: '034', providerEnabled: service.authority().liveEnabled || service.journeyAuthority().liveEnabled}); return; }
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
        send(200, {csrf: session.csrf, mode: 'local_owner', providerEnabled: service.authority().liveEnabled || service.journeyAuthority().liveEnabled, externalEffects: false}); return;
      }
      requireThat(session && Date.now() - session.at < 12 * 3600000, 'OWNER_SESSION_REQUIRED');
      const businessId = url.searchParams.get('businessId') ?? undefined;
      if (req.method === 'GET' && url.pathname === '/api/state') { send(200, service.view(businessId)); return; }
      if (req.method === 'GET' && url.pathname === '/api/investigation/source') {
        requireThat(businessId,'BUSINESS_REQUIRED');send(200,service.discovery.source(businessId,url.searchParams.get('sourceId')??''));return;
      }
      if(req.method==='GET'&&url.pathname==='/api/source/image'){
        requireThat(businessId,'BUSINESS_REQUIRED');const source=service.discovery.source(businessId,url.searchParams.get('imageId')??''),image=source.kind==='image'?source:source.render?.screenshot;
        requireThat(image?.base64&&['image/png','image/jpeg'].includes(image.mimeType),'RETAINED_IMAGE_REQUIRED');
        res.writeHead(200,{'content-type':image.mimeType,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'referrer-policy':'no-referrer'});res.end(Buffer.from(image.base64,'base64'));return;
      }
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
        const html = preview.kind === 'service' ? preview.html : renderRemotePreview({...preview.binding, openEndpoint: '/api/preview/open', actionEndpoint: '/api/preview/action', closeEndpoint:'/api/preview/close', csrf: session!.csrf, exportFormat: 'json'});
        send(200, html, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }); return;
      }
      requireThat(req.method === 'POST' && req.headers.origin === origin && req.headers['x-csrf-token'] === session!.csrf, 'CSRF_INVALID');
      requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON_REQUIRED');
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; requireThat(length <= (url.pathname==='/api/source/screenshot'?3000000:300000), 'REQUEST_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireThat(body && typeof body === 'object' && !Array.isArray(body), 'OBJECT_REQUIRED');
      if(url.pathname==='/api/preview/close'){
        const owner=previewOwners.get(body.sessionId);requireThat(owner?.owner===sessionId,'PREVIEW_OWNER_SCOPE');
        if(owner.project)await service.execution.tools.closeManagedProjectPreview(body.sessionId);else await previews.close(body.sessionId);
        previewOwners.delete(body.sessionId);send(200,{closed:true});return;
      }
      if (url.pathname === '/api/preview/open') {
        service.task(body.ventureId, body.taskId);
        const preview = service.execution.preview(body.ventureId, body.taskId);
        requireThat(preview.binding.manifestHash === body.manifestHash, 'PREVIEW_MANIFEST_STALE');
        const key = sessionId + '/' + body.taskId; requireThat(!opening.has(key), 'PREVIEW_OPEN_PENDING'); opening.add(key);
        try {
          for (const [id, old] of previewOwners) if (old.owner === sessionId && old.taskId === body.taskId) { if(old.project)await service.execution.tools.closeManagedProjectPreview(id);else await previews.close(id); previewOwners.delete(id); }
          requireThat(previewOwners.size < 6, 'PREVIEW_CAPACITY');
          if(preview.executionProfile==='functional-project-v1'){
            const result=await service.execution.tools.openManagedProjectPreview(body.ventureId,preview.binding.taskId,body.viewportWidth??1100);
            previewOwners.set(result.sessionId,{owner:sessionId,businessId:body.ventureId,taskId:body.taskId,project:true,manifestHash:preview.binding.manifestHash});send(200,result);return;
          }
          const result = await previews.open({...preview.binding, files: preview.files, executionProfile: preview.executionProfile, viewportWidth: body.viewportWidth, stateHandler: input => service.execution.previewState(body.ventureId, preview.binding.taskId, input)});
          previewOwners.set(result.sessionId, {owner: sessionId, businessId: body.ventureId, taskId: body.taskId}); send(200, result);
        } finally { opening.delete(key); } return;
      }
      if (url.pathname === '/api/preview/action') {
        const owner = previewOwners.get(body.sessionId); requireThat(owner?.owner === sessionId, 'PREVIEW_SESSION_SCOPE');
        if(owner!.project){const preview=service.execution.preview(owner!.businessId,owner!.taskId);requireThat(preview.binding.manifestHash===owner!.manifestHash,'PREVIEW_MANIFEST_STALE');const result=await service.execution.tools.actManagedProjectPreview(body.sessionId,body);send(200,{...result,...(result.exportJson?{exportCsv:JSON.stringify(result.exportJson,null,2)}:{})});return;}
        const binding = previews.binding(body.sessionId), preview = service.execution.preview(owner!.businessId, owner!.taskId);
        requireThat(preview.binding.manifestHash === binding.manifestHash, 'PREVIEW_MANIFEST_STALE');
        send(200, await previews.act(body.sessionId, body)); return;
      }
      let selected = body.businessId, result: any = null, status = 200;
      if (url.pathname === '/api/business') {
        // Browser input cannot set fixture mode or grant authority.
        result = service.createBusiness(body); selected = result.id;
      } else if(url.pathname==='/api/operating-demo'){result=await service.createOperatingDemo(body.fixture);selected=result.id;
      } else if (url.pathname === '/api/demo') { result = body.fixture?await service.createCommercialDemo(body.fixture):service.knowledge.createDemo(); selected = result.id ?? result.company?.id; }
      else {
        requireThat(typeof selected === 'string', 'BUSINESS_REQUIRED'); service.knowledge.company(selected);
        if(url.pathname==='/api/development/prepare')result=service.workerDevelopment.prepare(selected,body);
        else if(url.pathname==='/api/development/fixture')result=await service.workerDevelopment.fixture(selected,body.candidateId);
        else if(url.pathname==='/api/connection/sync')result=await service.syncApprovedConnection(selected,body.connectionId);
        else if(url.pathname==='/api/connection/configure')result=service.connectedAccounts.beginConfiguration({businessId:selected,provider:body.provider,credentialReference:body.credentialReference,capabilityIds:body.capabilityIds,configuration:body.configuration});
        else if(['/api/connection/consent','/api/connection/revoke'].includes(url.pathname)){
          requireThat(service.connectedAccounts.get(body.connectionId).businessId===selected,'CONNECTION_BUSINESS_SCOPE');
          result=url.pathname.endsWith('/consent')?service.connectedAccounts.grantConsent(body.connectionId,{grantedAt:new Date().toISOString(),grantedBy:'local-owner-session',purpose:body.purpose,scopes:body.scopes,expiresAt:body.expiresAt??null}):service.connectedAccounts.revoke(body.connectionId,body.reason);
        }
        else if(url.pathname==='/api/outcome/create')result=service.operatingOutcomes.create(selected,{objective:body.objective,autonomy:body.autonomy,allowedFamilies:body.allowedFamilies,maxCalls:body.maxCalls,repairReserve:body.repairReserve});
        else if(url.pathname.startsWith('/api/outcome/')){
          requireThat(service.operatingOutcomes.get(body.outcomeId).businessId===selected,'OUTCOME_BUSINESS_SCOPE');
          if(url.pathname.endsWith('/control')){result=service.operatingOutcomes.control(body.outcomeId,body.action);const authority=service.journeyAuthority();if(body.action==='resume'&&authority.liveEnabled&&authority.businessId===selected&&authority.outcomeId===body.outcomeId){service.launchInvestigation(selected,()=>service.runApprovedOutcome(selected,body.outcomeId));status=202;}}
          else if(url.pathname.endsWith('/allow'))result=service.operatingOutcomes.allowPreparation(body.outcomeId);
          else if(url.pathname.endsWith('/prepare'))result=service.prepareJourney(selected,body.outcomeId);
          else if(url.pathname.endsWith('/plan-fixture')){requireThat(service.knowledge.company(selected).mode==='fixture','OUTCOME_FIXTURE_ONLY');result=await service.operatingOutcomes.propose(body.outcomeId,fixtureOutcomePlanner);}
          else if(url.pathname.endsWith('/correct')){result=service.correctOutcome(selected,body.outcomeId,{nodeId:body.nodeId,artifactHash:body.artifactHash,instruction:body.instruction,repairCalls:body.repairCalls,assisted:body.assisted});if(service.knowledge.company(selected).mode!=='fixture'){service.launchInvestigation(selected,()=>service.runApprovedOutcome(selected,body.outcomeId));status=202;}}
          else if(url.pathname.endsWith('/run-approved')){const authority=service.journeyAuthority();requireThat(authority.approved&&authority.businessId===selected&&authority.outcomeId===body.outcomeId,'JOURNEY_OWNER_SCOPE');service.launchInvestigation(selected,()=>service.runApprovedOutcome(selected,body.outcomeId));status=202;}
          else if(url.pathname.endsWith('/run-fixture')){requireThat(service.knowledge.company(selected).mode==='fixture','OUTCOME_LIVE_GRANT_REQUIRED');service.launchInvestigation(selected,()=>service.operatingOutcomes.runOffline(body.outcomeId));status=202;}
          else throw Error('OUTCOME_ACTION_UNAVAILABLE');
        }
        else if (url.pathname === '/api/investigation/retrieve'||url.pathname==='/api/investigation/continue') {
          if(url.pathname.endsWith('continue'))service.discovery.resume(selected);
          service.launchInvestigation(selected,()=>service.discovery.seed(selected));status=202;
        }
        else if(url.pathname==='/api/investigation/pause')result=service.discovery.pause(selected);
        else if(url.pathname==='/api/investigation/render'){
          const original=service.knowledge.sources(selected).find(s=>s.id===body.sourceId);
          result=await service.discovery.render(selected,original?.origin?.recordId??body.sourceId);
        }
        else if(url.pathname==='/api/source/screenshot')result=service.discovery.attachImage(selected,{title:body.title,base64:body.dataBase64,mimeType:body.mimeType,sourceUrl:body.sourceUrl,observedAt:new Date().toISOString(),caption:body.caption,rights:body.rights});
        else if(url.pathname==='/api/opportunity/select')result=service.intelligence.select(selected,body.opportunityId);
        else if(url.pathname==='/api/opportunity/reject')result=service.intelligence.reject(selected,body.opportunityId,body.reason);
        else if(url.pathname==='/api/intelligence/review')result=new CommercialReview(service.store).record(selected,body);
        else if(url.pathname==='/api/work/replan')result=service.execution.replanDependent({businessId:selected,taskId:body.taskId,campaignTaskId:body.campaignTaskId});
        else if (url.pathname === '/api/business/update') result = service.updateBusiness(selected,body);
        else if (url.pathname === '/api/source') result = service.knowledge.addSource(selected, {title: body.title, text: body.text, kind: body.kind, rights: body.rights, observedAt: body.observedAt, validUntil: body.validUntil ?? null});
        else if (url.pathname === '/api/evidence/select') result = service.knowledge.selectEvidence(selected, body.sourceIds);
        else if (url.pathname === '/api/evidence/include-new') result = service.knowledge.includeNewPermittedEvidence(selected);
        else if (url.pathname === '/api/diagnose') {
          const fixture=service.store.get('pilot-commercial-fixture',selected);
          if(fixture)result=await service.intelligence.analyze(selected,commercialFixturePort(fixture.case,service.intelligence.sources(selected)));
          else if(service.knowledge.company(selected).mode==='fixture')result=await service.knowledge.diagnose(selected);
          else if(service.authority().liveEnabled&&service.authority().businessId===selected){service.launchInvestigation(selected,()=>service.runApprovedAnalysis(selected));status=202;}
          else {const p=service.intelligence.prepare(selected,service.discovery.context(selected));result={status:'exact_model_grant_required',requestHash:hash(p.request),actualModelCalls:0};}
        }
        else if (url.pathname === '/api/plan') {
          result = service.plan(selected, body.workflow);
        } else if (url.pathname === '/api/run' || url.pathname === '/api/resume') {
          service.task(selected, body.taskId);
          if(service.knowledge.company(selected).mode === 'fixture')service.launch(selected, body.taskId, () => url.pathname === '/api/resume' ? service.execution.resume(selected, body.taskId) : service.execution.run(selected, body.taskId));
          else {const authority=service.authority();requireThat(authority.approved&&authority.businessId===selected&&(authority.liveEnabled||authority.sameIdRecoveryAvailable),'PILOT_LIVE_GRANT_REQUIRED');if(url.pathname==='/api/resume'&&service.task(selected,body.taskId).status==='paused')service.execution.portfolio.controlTask(body.taskId,'resume');service.launch(selected,body.taskId,()=>service.runApprovedWork(selected,body.taskId));} status = 202;
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
          if(newTaskId)for(const w of service.rows('pilot-commercial-work').filter(w=>w.businessId===selected&&w.campaignTaskId===body.taskId))service.store.transaction(()=>{const current=service.store.get('pilot-commercial-work',w.campaignTaskId);service.store.put('pilot-commercial-work',w.campaignTaskId,{...current,correctedCampaignTaskId:newTaskId,dependentStatus:'previous page requires replacement after corrected campaign completes'},current._version);});
          if (newTaskId && service.knowledge.company(selected).mode === 'fixture') { service.launch(selected, newTaskId, () => service.execution.run(selected, newTaskId)); status = 202; }
          else if(newTaskId&&service.authority().liveEnabled&&service.authority().businessId===selected){service.launch(selected,newTaskId,()=>service.runApprovedTask(selected,newTaskId));status=202;}
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
      service.audit(selected, url.pathname, { taskId: body.taskId ?? null, artifactHash: body.artifactHash ?? null, resultHash: hash(result), providerRequests: status===202?null:0, accountingSource: status===202?'durable scoped model ledger; UI acknowledgement is not a dispatch receipt':'local owner operation' });
      send(status, {view: service.view(selected), result, ...(result?.reviewSessionId ? {reviewSessionId: result.reviewSessionId} : {})});
    } catch (error: any) {
      const code = String(error?.code ?? error?.message ?? 'REQUEST_FAILED').slice(0, 240);
      const denial = /CSRF|SCOPE|HOST|SESSION|GRANT/.test(code);
      send(denial ? 403 : /STALE|CHANGED|RUNNING/.test(code) ? 409 : 400, { error: code, action: denial ? 'Check the local session, selected business and required authorization.' : 'Refresh the current state and correct the indicated input. Prior evidence is preserved.' });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  const ready = new Promise<string>(resolve => { server.listen(options.port ?? 43144, '127.0.0.1', () => { origin = 'http://127.0.0.1:' + (server.address() as any).port; resolve(origin); }); });
  return { server, ready, close: async () => { await service.settle(); for(const [id,owner] of previewOwners) if(owner.project)await service.execution.tools.closeManagedProjectPreview(id); previewOwners.clear(); await previews.closeAll(); await new Promise<void>((resolve,reject) => server.close(e => e ? reject(e) : resolve())); } };
}
