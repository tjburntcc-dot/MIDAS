import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StateStore } from '../state.ts';
import { hash, rawHash, canonical, requireThat } from '../contracts.ts';
import { portfolioScope } from '../portfolio/contracts.ts';
import { PilotKnowledge } from './knowledge.ts';
import { PilotExecution } from './execution.ts';
import { PilotLearning } from './learning.ts';
import { portfolioRoute } from '../portfolio/live.ts';
import { buildResponsesBody } from '../model-port.ts';
import { readPortfolioAccounting } from '../portfolio/accounting-view.ts';
import { readPilotDiagnosisAccounting } from './diagnosis-authorized.ts';
import { fixtureIntakeFields } from './fixtures-execution.ts';

/** Owner-facing composition only; work execution and inference admission remain in Foundry. */
export class PilotService {
  readonly store: StateStore;
  readonly root: string;
  readonly knowledge: PilotKnowledge;
  readonly execution: PilotExecution;
  readonly pending = new Map<string, Promise<unknown>>();
  constructor(root: string, options: {store?: StateStore; browserLauncher?: () => Promise<any>} = {}) {
    this.root = root; mkdirSync(root, { recursive: true });
    this.store = options.store ?? new StateStore(join(root, 'pilot.sqlite'));
    this.knowledge = new PilotKnowledge(this.store);
    this.execution = new PilotExecution(this.store, { root, browserLauncher: options.browserLauncher } as any);
  }
  rows(kind: string) { return this.store.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY key').all(kind).map(r => JSON.parse(String(r.body))); }
  audit(businessId: string, action: string, details: any) {
    const id = 'pilot-' + randomUUID();
    this.store.transaction(() => { this.store.record(portfolioScope(businessId), id, 'PilotOwnerAction', { action, details, actor: 'local-owner-session', provenance: 'owner_supplied', at: new Date().toISOString() }); });
  }
  task(businessId: string, taskId: string) {
    this.knowledge.company(businessId);
    const task = this.store.get('portfolio-task', taskId);
    requireThat(task?.ventureId === businessId, 'TASK_BUSINESS_SCOPE_MISMATCH'); return task;
  }
  contextBinding(businessId: string) {
    const business = this.knowledge.company(businessId);
    return { companyContextHash: hash({name:business.name, goal:business.goal, notes:business.notes, website:business.website}),
      selectedEvidenceHash: hash(this.knowledge.selectedSources(businessId).map(s => ({id:s.id,sha256:s.sha256,permission:s.permission,validUntil:s.validUntil}))) };
  }
  decisionFor(taskId: string): any {
    const seen = new Set<string>(); let current: string | null = taskId;
    while (current) {
      requireThat(!seen.has(current), 'CORRECTION_LINEAGE_CYCLE'); seen.add(current);
      const direct = this.store.get('pilot-task-decision',current); if (direct) return direct;
      const task = this.store.get('portfolio-task',current); current = task?.inputs?.correctionOf ?? null;
    }
    return null;
  }
  currentArtifact(businessId: string, taskId: string) {
    this.task(businessId, taskId);
    const artifact = this.execution.artifact(businessId, taskId);
    requireThat(artifact, 'CURRENT_ARTIFACT_REQUIRED'); return artifact as any;
  }
  bindArtifact(businessId: string, taskId: string, expected: string) {
    requireThat(this.task(businessId, taskId).status === 'completed', 'TASK_COMPLETION_REQUIRED_FOR_OWNER_RESULT');
    const artifact = this.currentArtifact(businessId, taskId);
    requireThat(artifact.taskId === taskId, 'TASK_OWN_DELIVERABLE_REQUIRED');
    requireThat(artifact.current === true, 'ARTIFACT_NOT_CURRENT');
    const decision = this.decisionFor(taskId);
    requireThat(!decision || hash(decision.contextBinding) === hash(this.contextBinding(businessId)), 'COMPANY_CONTEXT_CHANGED_PREPARE_FRESH_WORK');
    requireThat((artifact.hash ?? artifact.manifestHash ?? artifact.manifest?.sha256) === expected, 'ARTIFACT_CHANGED_REFRESH_BEFORE_REVIEW');
    return artifact;
  }
  reviewStart(businessId: string, taskId: string, ownerSession: string) {
    const artifact = this.currentArtifact(businessId, taskId), id = 'review-' + randomUUID();
    this.store.transaction(() => this.store.put('pilot-review', id, { id, businessId, taskId, artifactHash: artifact.hash ?? artifact.manifestHash ?? artifact.manifest?.sha256, ownerSession, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: null, independentSeconds: null }, null));
    return id;
  }
  finishReview(body: any, ownerSession: string, purpose: string) {
    requireThat(typeof body.assisted === 'boolean', 'REVIEW_ASSISTANCE_REQUIRED');
    if (!body.reviewSessionId) return { measuredSeconds: null, independentSeconds: null, assisted: body.assisted, expertise: 'unverified' };
    const review = this.store.get('pilot-review', body.reviewSessionId);
    requireThat(review && review.ownerSession === ownerSession && review.businessId === body.businessId && review.taskId === body.taskId && review.artifactHash === body.artifactHash && !review.endedAt, 'REVIEW_SESSION_STALE_OR_UNAVAILABLE');
    const seconds = Math.max(0, (Date.now() - Date.parse(review.startedAt)) / 1000);
    const measuredSeconds = seconds <= 1800 ? seconds : null;
    // Wall-clock interaction is not an independent correction-time measurement.
    const value = { ...review, purpose, endedAt: new Date().toISOString(), durationSeconds: measuredSeconds, independentSeconds: null, assisted: body.assisted, timingProvenance: 'elapsed owner interaction, may include idle time; not independent correction time' };
    this.store.transaction(() => this.store.put('pilot-review', review.id, value, review._version));
    return { measuredSeconds, independentSeconds: null, assisted: body.assisted, expertise: 'unverified' };
  }
  launch(businessId: string, taskId: string, action: () => Promise<unknown>) {
    this.task(businessId, taskId);
    requireThat(!this.pending.has(taskId), 'TASK_ALREADY_RUNNING');
    const promise = Promise.resolve().then(action).catch(error => {
      const code = String(error?.code ?? error?.message ?? 'PILOT_EXECUTION_FAILED').slice(0, 240);
      this.store.transaction(() => {
        const old = this.store.get('pilot-operation-error', taskId);
        this.store.put('pilot-operation-error', taskId, { businessId, taskId, code, at: new Date().toISOString(), providerRequests: 0 }, old?._version ?? null);
      });
      this.audit(businessId, 'operation_failed', { taskId, code });
      return { error: code };
    }).finally(() => this.pending.delete(taskId));
    this.pending.set(taskId, promise);
  }
  async settle() { await Promise.allSettled([...this.pending.values()]); }
  plan(businessId: string, workflow: 'response-packet' | 'business-site') {
    requireThat(['response-packet','business-site'].includes(workflow),'WORKFLOW_UNSUPPORTED');
    const assignment=new PilotLearning(this.store).assignment(businessId,workflow),company=this.knowledge.company(businessId);
    const task=this.execution.plan({business:company,sources:this.knowledge.sources(businessId),workflow,procedureBinding:assignment,...(company.mode==='fixture'?{intakeFields:fixtureIntakeFields}:{})});
    const understanding=this.knowledge.snapshot(businessId).understanding;
    const hypothesis=(understanding.hypotheses??[]).find((h:any)=>h.workflow===workflow);
    const decision={businessId,taskId:task.id,workflow,decisionOwner:company.mode==='fixture'?'explicit development demonstration selection':'owner selected a supported outcome',
      hypothesisId:hypothesis?.id??null,understandingHash:hash(understanding),contextBinding:this.contextBinding(businessId),
      basis:hypothesis?.diagnosis??'Owner-selected reversible task; no model diagnosis establishes its economic priority.',
      alternative:hypothesis?.alternativeExplanation??'Gather more company evidence or use the existing process before implementation.',
      workerId:assignment.id,procedureHash:assignment.procedureHash,qualification:'experimental; no demonstrated company-specific advantage'};
    this.store.transaction(()=>{this.store.put('pilot-task-decision',task.id,decision,null);this.store.record(portfolioScope(businessId),'decision-'+hash(task.id).slice(0,24),'PilotWorkSelection',decision);});
    return task;
  }
  artifactView(businessId: string, taskId: string) {
    const artifact = this.currentArtifact(businessId, taskId);
    const query = '?businessId=' + encodeURIComponent(businessId) + '&taskId=' + encodeURIComponent(taskId);
    return { ...artifact, hash: artifact.hash ?? artifact.manifestHash ?? artifact.manifest?.sha256, previewUrl: '/preview' + query, downloadUrl: '/download' + query };
  }
  view(businessId?: string) {
    const businesses = this.knowledge.listCompanies();
    const business = businessId ? this.knowledge.company(businessId) : null;
    const knowledge = business ? this.knowledge.snapshot(business.id) as any : {};
    const tasks = business ? this.execution.tasks(business.id).map((t: any) => {
      let artifact: any = null;
      try { artifact = this.artifactView(business.id, t.id); } catch {}
      const error = this.store.get('pilot-operation-error', t.id);
      const acceptance = this.store.get('pilot-acceptance', t.id);
      const decision = this.decisionFor(t.id);
      const contextCurrent = !decision || hash(decision.contextBinding) === hash(this.contextBinding(business.id));
      const acceptanceCurrent = Boolean(acceptance && artifact?.current && contextCurrent && acceptance.artifactHash === artifact.hash);
      return { ...t, status: this.pending.has(t.id) ? 'running' : t.status, artifact,
        acceptance: acceptance ? { ...acceptance, current: acceptanceCurrent } : null, decision, contextCurrent,
        correctionHistory: this.rows('pilot-correction-link').filter(c => c.businessId === business.id && (c.taskId === t.id || c.newTaskId === t.id)),
        operationError: error?.code ?? null,
        checkpoint: t.checkpoint ?? this.store.get('portfolio-execution', t.id)?.status ?? 'planned',
        reason: error?.code ?? t.reason,
        nextAction: t.nextAction ?? (artifact ? 'Inspect the deliverable and record an outcome.' : 'Start the prepared work.') };
    }) : [];
    const outcomes = business ? this.rows('pilot-owner-outcome').filter(o => o.businessId === business.id) : [];
    const learning = business ? new PilotLearning(this.store).list(business.id) : [];
    const inbox: any[] = [];
    const ledger = readPortfolioAccounting(this.store,this.root);
    const diagnosisLedger = readPilotDiagnosisAccounting(this.store,this.root);
    const simulated = ledger.mode === 'mock';
    const sumKnown = (...values: Array<number | null | undefined>) => values.every(v=>typeof v==='number') ? (values as number[]).reduce((a,b)=>a+b,0) : null;
    const diagnosisInference = diagnosisLedger.mode === 'mock' ? 0 : diagnosisLedger.inferenceDispatches;
    const inferenceCalls = sumKnown(ledger.inferenceDispatches,diagnosisInference);
    const countRequests = sumKnown(ledger.countRequests,diagnosisLedger.countRequests);
    const providerCalls = sumKnown(inferenceCalls,countRequests);
    const diagnosisSimulated = diagnosisLedger.mode === 'mock';
    const provisionalCostMinor = sumKnown(simulated ? 0 : ledger.provisionalMinor,diagnosisSimulated ? 0 : diagnosisLedger.provisionalMinor);
    const settledDeliverables = ledger.inferenceDispatches === 0 ? 0 : ledger.settledBillingStatus === 'recorded' ? ledger.settledMinor : null;
    const settledDiagnosis = diagnosisInference === 0 ? 0 : diagnosisLedger.settledMinor;
    if (business && !this.knowledge.sources(business.id).length) inbox.push({ id: 'sources', title: 'Add the information that should guide this work', reason: 'The company has no permitted evidence yet.', action: 'Add evidence' });
    if (business && business.mode !== 'fixture') inbox.push({ id: 'model-authority', title: 'Real worker execution needs a pilot grant', reason: 'Business inputs and work can be prepared now. Prior experiment budgets do not transfer.', action: 'Review prepared execution requirements' });
    for (const task of tasks) if (task.status === 'completed' && task.artifact?.current && task.contextCurrent && task.artifact.taskId === task.id && !task.acceptance?.current) inbox.push({ id: 'review-' + task.id, taskId: task.id, title: 'Inspect ' + task.title, reason: 'Local checks are recorded; usefulness and owner acceptance are separate.', action: 'Review deliverable' });
    return { businesses, business, sources: business ? this.knowledge.sources(business.id) : [],
      understanding: knowledge.understanding ?? knowledge, tasks,
      workers: this.workerView(business?.id), learning, outcomes, inbox,
      connections: this.connections(),
      accounting: { providerCalls, inferenceCalls, countRequests,
        requestCountScope:'Inference creations and supporting token counts. Diagnosis same-ID reads are separately recorded; task response reads remain in durable response observations.',
        diagnosisRetrievals: diagnosisLedger.retrievals,
        providerCostMinor: providerCalls === 0 ? 0 : sumKnown(settledDeliverables,settledDiagnosis), provisionalCostMinor,
        retainedExposureMinor: sumKnown(simulated ? 0 : ledger.retainedMinor,diagnosisSimulated ? 0 : diagnosisLedger.retainedMinor),
        simulatedRetainedMinor: sumKnown(simulated ? ledger.retainedMinor : 0,diagnosisSimulated ? diagnosisLedger.retainedMinor : 0),
        currency: 'USD', humanSeconds: null, ledgerStatus:ledger.status==='unavailable'||diagnosisLedger.status==='unavailable'?'unavailable':ledger.status,
        scope:'Distinct diagnosis and task accounts summed once; prior missions and development subscriptions excluded', billingStatus:providerCalls===0?'not_applicable':sumKnown(settledDeliverables,settledDiagnosis)===null?'unsettled_or_unknown':'recorded', ledger, diagnosisLedger,
        recordedOwnerInteractionSeconds: business ? this.rows('pilot-review').filter(r => r.businessId === business.id && r.endedAt).reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0) : 0,
        independentCorrectionSeconds: null, localComputeCostMinor: null, subscriptionUsageCostMinor: null },
      history: business ? this.store.records({ id: 'pilot-owner', tenantId: 'mason', businessId: business.id, permissions: ['read'] }, portfolioScope(business.id)).filter(r => r.kind === 'PilotOwnerAction').slice(-20).map(r => ({ id: r.id, ...r.value })) : [],
      archive: [{ title: 'Mission 031 R5', status: 'unsigned; preserved', retainedExposureMinor: 1917, settledCostMinor: null, note: 'Historical Mission 031 exposure, not this pilot spending. Quote Desk remains an incomplete live engineering experiment.', url: 'http://127.0.0.1:43142/' }],
      authority: { liveEnabled: false, externalEffects: false, connectionAccess: false },
      release: { version: '032', historicalR5: 'unsigned; preserved', qualification: 'offline pilot mechanics; real-model and customer acceptance not established' } };
  }
  workerView(businessId?: string) {
    if (businessId) return new PilotLearning(this.store).workers(businessId).map(({selectedProcedure, ...worker}) => worker);
    return [{ id: 'pilot-strong-baseline', name: 'Business delivery worker', job: 'Ground a response packet or contained website in permitted company evidence, inspect checks and correct the actual artifact.', procedureVersion: 'pilot-strong-generalist-v1', tools: ['workspace.read', 'workspace.patch', 'workspace.replace', 'check.run', 'artifact.publish_local'],
      evidence: 'The tools and controller have offline verification. Historical support observations do not qualify this company or website job.', limitations: 'Company fit, real-model quality, independent correction effort and customer outcomes remain unknown.', selectionReason: 'One worker covers the supported job with an explicit check/correction opportunity. No supported advantage warrants an additional role.', companyScope: businessId ?? null }];
  }
  connections() { return [
    { id: 'files', name: 'Owner documents and exports', status: 'available_local', action: 'Import text, Markdown, CSV or JSON you have permission to use. Original text and source dates are retained.' },
    { id: 'website', name: 'Business website', status: 'reference_only', action: 'Add the URL and paste relevant page text with its source. No website crawl or account access is performed.' },
    { id: 'model', name: 'Model execution', status: 'requires_exact_grant', action: 'Select the company evidence and first outcome, then review the exact new execution packet. No prior budget transfers.' },
    { id: 'customer-actions', name: 'Customer communication and website publishing', status: 'not_connected', action: 'Deliverables remain local drafts. Sending or deployment needs separate account access, exact destination and approval.' },
    { id: 'hosted', name: 'Hosted pilot', status: 'prepared_not_deployed', action: 'A prepared single-owner deployment path requires host access, TLS and authentication, a protected data volume and an approved deployment.' }
  ]; }
  exportBusiness(businessId: string) {
    const view = this.view(businessId);
    return { version: 'pilot-export-v1', exportedAt: new Date().toISOString(), view, integrity: hash(view), includesCredentials: false, provenance: 'owner and explicitly labeled offline observations; not customer validation' };
  }
  async prepareLive(businessId: string) {
    const company = this.knowledge.company(businessId);
    requireThat(company.mode !== 'fixture', 'LIVE_PREPARATION_REQUIRES_REAL_COMPANY');
    const route = portfolioRoute('pilot-prospective-032', 'proj_H01ORqdOPQM6vdGwQYsqFL5r', true, true);
    // This assembles bytes only. Historical pricing fields cannot authorize or quote a new run.
    const knowledge = this.knowledge.prepareLiveDiagnosis(businessId, route);
    const tasks = this.execution.tasks(businessId);
    const requests = [];
    for (const task of tasks) {
      try {
        const preview = await this.execution.engine.previewRequest(task.id);
        const body = buildResponsesBody(route, preview.request, preview.schema), bytes = canonical(body);
        requests.push({ taskId: task.id, preview, body, serializedBytes: bytes, utf8Bytes: Buffer.byteLength(bytes), requestBytesHash: rawHash(bytes), actualInferenceAdmitted: false });
      }
      catch (error: any) { requests.push({ taskId: task.id, blocker: String(error?.code ?? error?.message).slice(0, 240) }); }
    }
    const packet = { version: 'pilot-execution-preparation-v1', businessId, companyVersion: company.version, evidenceHash: hash(this.knowledge.sources(businessId)), authority: 'unsigned; no provider calls permitted', diagnosis: knowledge, requests, proposedRoute: route,
      pricingStatus: 'Historical September 12 route pricing is present only for request compatibility. It is not a current quote. Verify official price/access and exact complete-payload admission before any new grant.',
      requiredOwnerInputs: ['Confirm business identity, data-use rights, current policies and the first outcome.', 'Approve an exact new scoped model route and numerical envelope after current pricing and payload admission are verified.', 'Approve separately any destination, communication or hosting effect.'],
      capacity: { diagnosis: 'one inference and one supporting count under its own exact grant; no replacement or automatic correction call', deliverable: 'bounded source edit / targeted correction / deterministic checks and finalization, as declared in exact task allocations; a later owner correction needs an explicitly included task grant', noHiddenHelpers: true },
      remainingGates: ['This preparation is not a signed grant.', 'Provider route/access and prices must be verified at final freeze without assuming API credits.', 'Non-fixture pilot transport binding needs an exact pilot grant; current owner server intentionally cannot execute a live call.'],
      exclusions: ['No customer communications', 'No deployment', 'No purchases', 'No account changes', 'No protected evaluation or certification', 'No prior-grant borrowing'] };
    const result = { ...packet, preparationHash: hash(packet) };
    const directory = join(this.root, 'preparations', businessId); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, result.preparationHash + '.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  }
}
