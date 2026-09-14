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
import { readPortfolioAccounting, type PortfolioAccountingView } from '../portfolio/accounting-view.ts';
import { readPilotDiagnosisAccounting } from './diagnosis-authorized.ts';
import { fixtureIntakeFields } from './fixtures-execution.ts';
import {PilotDiscovery,canonicalDiscoveryUrl} from './discovery.ts';
import {PilotIntelligence} from './intelligence.ts';
import {commercialCases,commercialFixturePort} from './intelligence-fixtures.ts';
import {CommercialReview} from './commercial-review.ts';
import {readIntelligenceAccounting,readIntelligenceAuthority,loadAuthorizedIntelligence} from './intelligence-authorized.ts';
import {ConnectionRegistry,ConnectionService,maintainedReadAdapters} from './connections/index.ts';
import {WorkerDevelopmentService} from './worker-development-service.ts';
import {PilotOutcomes} from './outcomes.ts';
import {PilotDevelopmentBridge} from './development-bridge.ts';
import {createOperatingDemo} from './overnight-demo.ts';
import {inspectOutcomeJourney,loadAuthorizedOutcomeJourney as loadOutcomeJourney,prepareOutcomeJourneyAuthorization} from './outcome-journey-authorized.ts';
import {inspectConnectionReadAuthorization,loadAuthorizedConnectionRead} from './connections/host.ts';

/** Owner-facing composition only; work execution and inference admission remain in Foundry. */
export class PilotService {
  readonly store: StateStore;
  readonly root: string;
  readonly knowledge: PilotKnowledge;
  readonly execution: PilotExecution;
  readonly discovery: PilotDiscovery;
  readonly intelligence: PilotIntelligence;
  readonly connectedAccounts:ConnectionService;
  readonly operatingOutcomes:PilotOutcomes;
  readonly workerDevelopment:PilotDevelopmentBridge;
  readonly pending = new Map<string, Promise<unknown>>();
  readonly investigations = new Map<string,Promise<unknown>>();
  private authorizedRunner:ReturnType<typeof loadAuthorizedIntelligence>|null=null;
  private authorizedJourney:ReturnType<typeof loadOutcomeJourney>|null=null;
  constructor(root: string, options: {store?: StateStore; browserLauncher?: () => Promise<any>;publicReader?:any;renderer?:any} = {}) {
    this.root = root; mkdirSync(root, { recursive: true });
    this.store = options.store ?? new StateStore(join(root, 'pilot.sqlite'));
    this.knowledge = new PilotKnowledge(this.store);
    this.execution = new PilotExecution(this.store, { root, browserLauncher: options.browserLauncher } as any);
    this.discovery=new PilotDiscovery(this.store,{root,knowledge:this.knowledge,publicReader:options.publicReader,renderer:options.renderer});
    this.intelligence=new PilotIntelligence(this.store,this.execution);
    this.connectedAccounts=new ConnectionService(this.store,this.knowledge,new ConnectionRegistry(maintainedReadAdapters()));
    this.operatingOutcomes=new PilotOutcomes(this.store,this.execution);
    this.workerDevelopment=new PilotDevelopmentBridge(this.operatingOutcomes);
  }
  approvedRunner(){return this.authorizedRunner??(this.authorizedRunner=loadAuthorizedIntelligence({intelligence:this.intelligence,discovery:this.discovery},this.root));}
  authority(){return readIntelligenceAuthority({intelligence:this.intelligence,discovery:this.discovery},this.root);}
  journeyServices(){return {outcomes:this.operatingOutcomes,intelligence:this.intelligence,discovery:this.discovery};}
  journeyAuthority(){return inspectOutcomeJourney(this.journeyServices(),this.root);}
  connectionAuthority(connectionId:string){return inspectConnectionReadAuthorization({connectedAccounts:this.connectedAccounts},this.root,connectionId);}
  async syncApprovedConnection(businessId:string,connectionId:string){
    requireThat(this.connectedAccounts.get(connectionId).businessId===businessId,'CONNECTION_BUSINESS_SCOPE');
    return loadAuthorizedConnectionRead({connectedAccounts:this.connectedAccounts},this.root,{connectionId}).sync();
  }
  journeyRunner(){return this.authorizedJourney??(this.authorizedJourney=loadOutcomeJourney(this.journeyServices(),this.root));}
  prepareJourney(businessId:string,outcomeId:string){
    const company=this.knowledge.company(businessId),outcome=this.operatingOutcomes.get(outcomeId);
    requireThat(company.mode!=='fixture'&&outcome.businessId===businessId,'JOURNEY_REAL_BUSINESS_SCOPE');
    const old=this.store.get('pilot-prepared-journey',outcomeId);
    if(old){requireThat(hash(old.proposal)===old.proposalHash,'JOURNEY_PREPARED_INTEGRITY');return old;}
    const id='journey-034-'+randomUUID().replaceAll('-',''),directory=join(this.root,'preparations',businessId,id);
    const prepared=prepareOutcomeJourneyAuthorization(this.journeyServices(),{root:this.root,directory,id,outcomeId,projectId:'proj_H01ORqdOPQM6vdGwQYsqFL5r',credentialFile:'C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key',expiresAt:'2026-09-25T22:00:00.000Z',countUncertaintyMinor:435,mode:'live'});
    const value={...prepared,businessId,outcomeId,directory,providerRequests:0,credentialRead:false,preparedAt:new Date().toISOString(),pricingCheckedAt:'2026-09-14',priceSource:'https://developers.openai.com/api/docs/models/gpt-6-astra',accountAccessVerified:false,externalEffects:false};
    this.store.transaction(()=>this.store.put('pilot-prepared-journey',outcomeId,value,null));return value;
  }
  async runApprovedOutcome(businessId:string,outcomeId:string){
    const runner=this.journeyRunner();
    requireThat(runner.authorization.journey.businessId===businessId&&runner.authorization.journey.outcomeId===outcomeId,'JOURNEY_OWNER_SCOPE');
    return runner.resume();
  }
  correctOutcome(businessId:string,outcomeId:string,input:{nodeId:string;artifactHash:string;instruction:string;repairCalls:number;assisted:boolean}){
    requireThat(this.operatingOutcomes.get(outcomeId).businessId===businessId,'OUTCOME_BUSINESS_SCOPE');
    if(this.knowledge.company(businessId).mode==='fixture')return this.operatingOutcomes.correct(outcomeId,input);
    const runner=this.journeyRunner();requireThat(runner.authorization.journey.businessId===businessId&&runner.authorization.journey.outcomeId===outcomeId,'JOURNEY_OWNER_SCOPE');
    return runner.correct(input);
  }
  async runApprovedAnalysis(id:string){
    const runner=this.approvedRunner();requireThat(runner.authorization.intelligence.businessId===id,'INTELLIGENCE_BUSINESS_SCOPE');
    await runner.runInvestigation();if(this.store.get('pilot-discovery',id)?.state==='ready_for_analysis')return runner.runAnalysis();
    return this.discoveryView(id);
  }
  async runApprovedTask(id:string,taskId:string){const runner=this.approvedRunner();requireThat(runner.authorization.intelligence.businessId===id,'INTELLIGENCE_BUSINESS_SCOPE');return runner.runTask(taskId);}
  async runApprovedWork(id:string,taskId:string){
    const result=await this.runApprovedTask(id,taskId);
    if(result.status!=='completed')return result;
    this.intelligence.materialize(id);
    const dependent=this.rows('pilot-commercial-work').find(w=>w.businessId===id&&w.campaignTaskId===taskId)?.pageTaskId;
    if(dependent&&this.task(id,dependent).status!=='completed')return this.runApprovedTask(id,dependent);
    return result;
  }
  createBusiness(input:any){
    const website=String(input.website??'').trim(), suppliedName=String(input.name??'').trim();
    const name=suppliedName||(website?new URL(website).hostname.replace(/^www\./,''):'');
    const socialUrls=Array.isArray(input.socialUrls)?input.socialUrls:[];
    requireThat(socialUrls.length<=2&&socialUrls.every((u:any)=>typeof u==='string'&&u.length<=2048),'BUSINESS_SOCIAL_LIMIT');
    if(website)[website,...socialUrls].forEach(canonicalDiscoveryUrl);
    const company=this.knowledge.createCompany({name,website,goal:input.goal,notes:input.notes});
    this.store.transaction(()=>this.store.put('pilot-business-intake',company.id,{businessId:company.id,socialUrls,identityStatus:suppliedName?'owner_supplied':'website host label; company identity unverified'},null));
    if(website){this.discovery.start(company.id,{website,socialLinks:socialUrls,limits:{maxDecisions:6}});this.launchInvestigation(company.id,()=>this.discovery.seed(company.id));}
    return this.knowledge.company(company.id);
  }
  updateBusiness(id:string,input:any){
    const previous=this.knowledge.company(id),prior=this.store.get('pilot-business-intake',id),socialUrls=input.socialUrls??prior?.socialUrls??[];
    requireThat(Array.isArray(socialUrls)&&socialUrls.length<=2,'BUSINESS_SOCIAL_LIMIT');socialUrls.forEach(canonicalDiscoveryUrl);
    const website=input.website??previous.website;if(website)canonicalDiscoveryUrl(website);
    const changed=website!==previous.website||hash(socialUrls)!==hash(prior?.socialUrls??[]);
    if(changed){const s=this.store.get('pilot-discovery',id);requireThat(!s?.pending&&!this.investigations.has(id),'INVESTIGATION_RUNNING_FINISH_BEFORE_SOURCE_CHANGE');}
    const result=this.knowledge.updateCompany(id,Object.fromEntries(['name','website','goal','notes'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])),input.expectedVersion);
    this.store.transaction(()=>this.store.put('pilot-business-intake',id,{...prior,businessId:id,socialUrls,identityStatus:input.name?'owner_supplied':prior?.identityStatus??'owner_supplied'},prior?._version??null));
    if(changed&&website){const s=this.store.get('pilot-discovery',id);if(s)this.discovery.restart(id,{website,socialLinks:socialUrls});else this.discovery.start(id,{website,socialLinks:socialUrls});this.launchInvestigation(id,()=>this.discovery.seed(id));}
    else if(changed&&this.store.get('pilot-discovery',id))this.discovery.pause(id);
    return result;
  }
  discoveryView(id:string){
    const raw=this.discovery.view(id) as any,analysis=this.intelligence.view(id),error=this.store.get('pilot-investigation-error',id);
    const rawSources=raw.sources.map((s:any)=>{const knowledgeSourceId=s.knowledgeSourceId??raw.sources.find((parent:any)=>parent.id===s.sourceId)?.knowledgeSourceId;return {...s,knowledgeSourceId,sourceId:knowledgeSourceId??s.id,...(s.imageAvailable?{imageUrl:'/api/source/image?businessId='+encodeURIComponent(id)+'&imageId='+encodeURIComponent(s.id)}:{})};});
    const frontier=raw.frontier.map((f:any)=>{const s=rawSources.find((s:any)=>s.id===f.recordId);return {...f,sourceId:s?.knowledgeSourceId??f.recordId,reason:s?.error??f.linkText};});
    return {...raw,status:raw.state,checkpoint:raw.pending?raw.pending.kind+' intent persisted':raw.state==='ready_for_analysis'?'discovery decision completed':raw.used.pages+' page admissions; '+raw.used.decisions+' model decisions',
      publicRetrievalEnabled:raw.publicReaderEnabled,pagesRetrieved:rawSources.filter((s:any)=>s.kind==='page'&&s.status==='retrieved').length,frontier,sources:rawSources,
      accessLimits:[...raw.limitations,...rawSources.filter((s:any)=>['blocked','failed','unknown'].includes(s.status)).map((s:any)=>(s.url??s.title??s.id)+': '+(s.error??s.status)),...(error?[error.code]:[])],
      modelAnalysis:{status:analysis.status,reason:analysis.status==='proposal_ready'?'A persisted proposal is available; inspect its actual provenance.':'Commercial analysis and model-directed follow-ups require an exact new signed grant. Public retrieval and owner review can continue.'}};
  }
  launchInvestigation(id:string,action:()=>Promise<unknown>){
    this.knowledge.company(id);requireThat(!this.investigations.has(id),'INVESTIGATION_ALREADY_RUNNING');
    const p=Promise.resolve().then(action).catch(error=>{const code=String(error?.code??error?.message??'INVESTIGATION_FAILED').slice(0,240);this.store.transaction(()=>{const old=this.store.get('pilot-investigation-error',id);this.store.put('pilot-investigation-error',id,{businessId:id,code,at:new Date().toISOString()},old?._version??null);});return {error:code};}).finally(()=>this.investigations.delete(id));
    this.investigations.set(id,p);
  }
  async createOperatingDemo(which:'service'|'retail'){return createOperatingDemo(this,which);}
  async createCommercialDemo(which:'service'|'retail'){
    requireThat(['service','retail'].includes(which),'DEMO_CASE_REQUIRED');const c=commercialCases[which];
    const company=this.knowledge.createCompany({name:c.name,website:c.website,goal:c.goal,notes:c.notes,mode:'fixture'});
    for(const p of c.pages)this.knowledge.addSource(company.id,{title:p.title,text:p.text,kind:'website',rights:'Developer-authored synthetic case; no customer data or independent holdout',observedAt:new Date().toISOString()});
    this.store.transaction(()=>this.store.put('pilot-commercial-fixture',company.id,{businessId:company.id,case:which,sourceExposure:which==='retail'?'developer-visible transfer fixture; not a confidential holdout':'development fixture',createdAt:new Date().toISOString()},null));
    await this.intelligence.analyze(company.id,commercialFixturePort(which,this.intelligence.sources(company.id)),{provenance:'Preloaded synthetic source fixtures; this demonstration does not claim public retrieval or model-directed discovery.'});
    return company;
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
    this.execution.assertContextCurrent(taskId,true);
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
        this.store.put('pilot-operation-error', taskId, { businessId, taskId, code, at: new Date().toISOString(), providerRequests: null, accountingSource: 'durable scoped model ledger; this UI error is not a billing observation' }, old?._version ?? null);
      });
      this.audit(businessId, 'operation_failed', { taskId, code });
      return { error: code };
    }).finally(() => { this.pending.delete(taskId); try{this.intelligence.materialize(businessId);}catch(error){this.audit(businessId,'dependent_work_wait',{code:String((error as Error).message)});} });
    this.pending.set(taskId, promise);
  }
  async settle() { await Promise.allSettled([...this.pending.values(),...this.investigations.values()]); }
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
    const authority=this.authority();
    const journeyAuthority=this.journeyAuthority();
    const businesses = this.knowledge.listCompanies();
    const rawBusiness = businessId ? this.knowledge.company(businessId) : null;
    const business = rawBusiness?{...rawBusiness,...this.store.get('pilot-business-intake',rawBusiness.id)}:null;
    const knowledge = business ? this.knowledge.snapshot(business.id) as any : {};
    const tasks = business ? this.execution.tasks(business.id).map((t: any) => {
      let artifact: any = null;
      try { artifact = this.artifactView(business.id, t.id); } catch {}
      const error = this.store.get('pilot-operation-error', t.id);
      const acceptance = this.store.get('pilot-acceptance', t.id);
      const decision = this.decisionFor(t.id);
      let contextCurrent = !decision || hash(decision.contextBinding) === hash(this.contextBinding(business.id));
      try{this.execution.assertContextCurrent(t.id,true);}catch{contextCurrent=false;}
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
    const learning = business ? [...new PilotLearning(this.store).list(business.id),...new CommercialReview(this.store).list(business.id)] : [];
    const inbox: any[] = [];
    const ledger = readPortfolioAccounting(this.store,this.root);
    const diagnosisLedger = readPilotDiagnosisAccounting(this.store,this.root);
    const intelligenceLedger=readIntelligenceAccounting(this.store,this.root),intelligenceSimulated=intelligenceLedger.mode==='mock',intelligenceInference=intelligenceSimulated?0:intelligenceLedger.inferenceDispatches;
    const journeyLedger:PortfolioAccountingView=journeyAuthority.accounting,journeySimulated=journeyLedger.mode==='mock',journeyInference=journeySimulated?0:journeyLedger.inferenceDispatches;
    const simulated = ledger.mode === 'mock';
    const sumKnown = (...values: Array<number | null | undefined>) => values.every(v=>typeof v==='number') ? (values as number[]).reduce((a,b)=>a+b,0) : null;
    const diagnosisInference = diagnosisLedger.mode === 'mock' ? 0 : diagnosisLedger.inferenceDispatches;
    const inferenceCalls = sumKnown(simulated?0:ledger.inferenceDispatches,diagnosisInference,intelligenceInference,journeyInference);
    const countRequests = sumKnown(simulated?0:ledger.countRequests,diagnosisLedger.mode==='mock'?0:diagnosisLedger.countRequests,intelligenceSimulated?0:intelligenceLedger.countRequests,journeySimulated?0:journeyLedger.countRequests);
    const providerCalls = sumKnown(inferenceCalls,countRequests);
    const diagnosisSimulated = diagnosisLedger.mode === 'mock';
    const provisionalCostMinor = sumKnown(simulated ? 0 : ledger.provisionalMinor,diagnosisSimulated ? 0 : diagnosisLedger.provisionalMinor,intelligenceSimulated?0:intelligenceLedger.provisionalMinor,journeySimulated?0:journeyLedger.provisionalMinor);
    const settledDeliverables = ledger.inferenceDispatches === 0 ? 0 : ledger.settledBillingStatus === 'recorded' ? ledger.settledMinor : null;
    const settledDiagnosis = diagnosisInference === 0 ? 0 : diagnosisLedger.settledMinor;
    const settledIntelligence=intelligenceInference===0?0:intelligenceLedger.settledMinor;
    const settledJourney=journeyInference===0?0:journeyLedger.settledMinor;
    if (business && !this.knowledge.sources(business.id).length) inbox.push({ id: 'sources', title: 'Add the information that should guide this work', reason: 'The company has no permitted evidence yet.', action: 'Add evidence' });
    if (business && business.mode !== 'fixture'&&!(authority.liveEnabled&&authority.businessId===business.id)&&!(journeyAuthority.liveEnabled&&journeyAuthority.businessId===business.id)) inbox.push({ id: 'model-authority', title: 'Real worker execution needs current scoped authority', reason: journeyAuthority.reason+' Prior experiment budgets do not transfer.', action: 'Review prepared execution requirements' });
    for (const task of tasks) if (task.status === 'completed' && task.artifact?.current && task.contextCurrent && task.artifact.taskId === task.id && !task.acceptance?.current) inbox.push({ id: 'review-' + task.id, taskId: task.id, title: 'Inspect ' + task.title, reason: 'Local checks are recorded; usefulness and owner acceptance are separate.', action: 'Review deliverable' });
    let investigation:any=null;if(business){try{investigation=this.discoveryView(business.id);}catch{}}
    if(investigation&&this.investigations.has(business!.id))investigation={...investigation,status:'running'};
    return { businesses, business, sources: business ? this.knowledge.sources(business.id).map(s=>{const d=investigation?.sources.find((r:any)=>r.knowledgeSourceId===s.id&&r.imageUrl)??investigation?.sources.find((r:any)=>r.knowledgeSourceId===s.id);return {...s,...(d?.imageUrl?{imageUrl:d.imageUrl}:{}),...(d?{discoveryRecordId:d.id,retrievalStatus:d.status}:{} )};}) : [],
      intake:business?this.store.get('pilot-business-intake',business.id):null,
      evidenceSelection:knowledge.evidenceSelection??null,
      investigation,intelligence:business?this.intelligence.view(business.id):null,
      coordinatedWork:business?this.rows('pilot-commercial-work').filter(w=>w.businessId===business.id):[],
      understanding: knowledge.understanding ?? knowledge, tasks,
      workers: this.workerView(business?.id), learning, outcomes, inbox,
      connections: this.connections(),
      connectedAccounts:{definitions:this.connectedAccounts.registry.list(),items:business?this.connectedAccounts.list(business.id).map(connection=>({...connection,readAuthority:this.connectionAuthority(connection.id)})):[]},
      operatingOutcomes:business?this.operatingOutcomes.list(business.id).map(outcome=>{const p=this.store.get('pilot-prepared-journey',outcome.id);return {...outcome,executionRunning:this.investigations.has(business.id),prepared:p?{proposalHash:p.proposalHash,maximumMinor:p.proposal.limits.totalMinor,expiresAt:p.proposal.expiresAt,summary:p.summary}:null,authority:journeyAuthority.businessId===business.id&&journeyAuthority.outcomeId===outcome.id?journeyAuthority:{approved:false,liveEnabled:false,reason:'No exact signed authority for this outcome.'}};}):[],
      development:business?this.developmentView(business.id):{workers:[],observations:[],candidates:[],comparisons:[]},
      accounting: { providerCalls, inferenceCalls, countRequests,
        requestCountScope:'Inference creations and supporting token counts. Diagnosis same-ID reads are separately recorded; task response reads remain in durable response observations.',
        diagnosisRetrievals: diagnosisLedger.retrievals,intelligenceRetrievals:intelligenceLedger.retrievals,
        providerCostMinor: providerCalls === 0 ? 0 : sumKnown(settledDeliverables,settledDiagnosis,settledIntelligence,settledJourney), provisionalCostMinor,
        retainedExposureMinor: sumKnown(simulated ? 0 : ledger.retainedMinor,diagnosisSimulated ? 0 : diagnosisLedger.retainedMinor,intelligenceSimulated?0:intelligenceLedger.retainedMinor,journeySimulated?0:journeyLedger.retainedMinor),
        simulatedRetainedMinor: sumKnown(simulated ? ledger.retainedMinor : 0,diagnosisSimulated ? diagnosisLedger.retainedMinor : 0,intelligenceSimulated?intelligenceLedger.retainedMinor:0,journeySimulated?journeyLedger.retainedMinor:0),
        currency: 'USD', humanSeconds: null, ledgerStatus:ledger.status==='unavailable'||diagnosisLedger.status==='unavailable'?'unavailable':ledger.status,
        scope:'Distinct diagnosis, task, intelligence and outcome-journey accounts summed once; prior missions and development subscriptions excluded', billingStatus:providerCalls===0?'not_applicable':sumKnown(settledDeliverables,settledDiagnosis,settledIntelligence,settledJourney)===null?'unsettled_or_unknown':'recorded', ledger, diagnosisLedger,intelligenceLedger,journeyLedger,
        recordedOwnerInteractionSeconds: business ? this.rows('pilot-review').filter(r => r.businessId === business.id && r.endedAt).reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0) : 0,
        independentCorrectionSeconds: null, localComputeCostMinor: null, subscriptionUsageCostMinor: null },
      history: business ? this.store.records({ id: 'pilot-owner', tenantId: 'mason', businessId: business.id, permissions: ['read'] }, portfolioScope(business.id)).filter(r => r.kind === 'PilotOwnerAction').slice(-20).map(r => ({ id: r.id, ...r.value })) : [],
      archive: [{ title: 'Mission 031 R5', status: 'unsigned; preserved', retainedExposureMinor: 1917, settledCostMinor: null, note: 'Historical Mission 031 exposure, not this pilot spending. Quote Desk remains an incomplete live engineering experiment.', url: 'http://127.0.0.1:43142/' }],
      authority: { ...authority, externalEffects: false, connectionAccess: false },
      journeyAuthority,
      release: { version: '034', historicalR5: 'unsigned; preserved', qualification: 'Connected evidence, outcome execution, functional applications and worker-development mechanics; actual-model commercial competence and customer acceptance not established' } };
  }
  developmentView(businessId:string){const r=new WorkerDevelopmentService(this.store).report(businessId);return {...r,workers:r.definitions,observations:this.rows('pilot-worker-development-observation').filter(x=>x.businessId===businessId)};}
  workerView(businessId?: string) {
    if (businessId) return new PilotLearning(this.store).workers(businessId).map(({selectedProcedure, ...worker}) => worker);
    return [{ id: 'pilot-strong-baseline', name: 'Business delivery worker', job: 'Ground a response packet or contained website in permitted company evidence, inspect checks and correct the actual artifact.', procedureVersion: 'pilot-strong-generalist-v1', tools: ['workspace.read', 'workspace.patch', 'workspace.replace', 'check.run', 'artifact.publish_local'],
      evidence: 'The tools and controller have offline verification. Historical support observations do not qualify this company or website job.', limitations: 'Company fit, real-model quality, independent correction effort and customer outcomes remain unknown.', selectionReason: 'One worker covers the supported job with an explicit check/correction opportunity. No supported advantage warrants an additional role.', companyScope: businessId ?? null }];
  }
  connections() { return [
    { id: 'files', name: 'Owner documents and exports', status: 'available_local', action: 'Import text, Markdown, CSV or JSON you have permission to use. Original text and source dates are retained.' },
    { id: 'website', name: 'Public business evidence', status: 'bounded_public_retrieval', action: 'A supplied website starts bounded public retrieval. Model-selected follow-up investigation needs an exact grant. No authenticated pages, accounts or paywall bypass.' },
    { id: 'social', name: 'Social profiles and visual evidence', status: 'public_access_or_owner_export', action: 'Accessible public profile links can be retained. Supply a permitted screenshot/export when access is unavailable. Retained-page screenshots are isolated browser observations; text-only workers have no visual-analysis claim.' },
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
    const currentJourney=this.rows('pilot-prepared-journey').filter(p=>p.businessId===businessId).at(-1);
    if(currentJourney){requireThat(hash(currentJourney.proposal)===currentJourney.proposalHash,'JOURNEY_PREPARED_INTEGRITY');return {...currentJourney,authority:this.journeyAuthority(),preparationOnly:true,providerRequests:0};}
    const mandates=this.operatingOutcomes.list(businessId);
    if(mandates.length)return {version:'outcome-journey-preparation-034',businessId,authority:'Unsigned; no provider execution.',outcomes:mandates.map(o=>({id:o.id,objective:o.objective,maxCalls:o.maxCalls,repairReserve:o.repairReserve,preparationReserve:7,plannerReserve:1,primaryMaximum:o.maxCalls-o.repairReserve-8})),nextAction:'Use Prepare exact execution request on the selected outcome. This reserves named preparation capacity and creates a versioned unsigned packet.',requirements:['The owner must approve the exact hash, data and numerical envelope before protected signing.','Account access and credits are not verified by preparation.','No customer effects, account reads or deployments are included.'],providerRequests:0};
    const saved=this.store.get('pilot-prepared-intelligence',businessId);
    if(saved){requireThat(hash(saved.proposal)===saved.proposalHash,'PREPARED_INTELLIGENCE_INTEGRITY');return {...saved,authority:this.authority(),preparationOnly:true,providerRequests:0};}
    if(this.store.get('pilot-discovery',businessId)){
      const route=portfolioRoute('intelligence-033-prospective','proj_H01ORqdOPQM6vdGwQYsqFL5r',true,true),discovery=this.discovery.request(businessId,undefined,{includeImages:true}),analysis=this.intelligence.prepare(businessId,this.discovery.context(businessId));
      const body=buildResponsesBody(route,discovery.request,discovery.schema),bytes=canonical(body);
      return {version:'intelligence-outcome-preparation-033-v1',businessId,authority:'unsigned; no provider execution authorized',route,discovery:{...discovery,body,serializedBytes:bytes,utf8Bytes:Buffer.byteLength(bytes),requestBytesHash:rawHash(bytes)},analysis:{request:analysis.request,sources:analysis.sources,contextHash:analysis.contextHash},
        capacity:{investigation:6,analysis:1,campaign:6,page:8,optionalExactCorrection:4,maxInferences:25,maxSupportingCounts:25,perAdmissionMinor:205,inferenceReserveMinor:5125,unpricedCountAndRetrievalAllowanceMinor:275,totalMinor:5400,currency:'USD'},
        requirements:['Finalize the existing bounded discovery session at six model decisions, including finish.','Freeze this company, source permissions, tools, contracts and implementation into an exact unsigned packet.','Approve the exact packet, project, protected credential location, numerical ceiling and provider storage before signing.','After analysis, select one supported opportunity; the same authorized controller can complete its campaign and dependent page.'],
        status:'Signed model binding and owner-workspace execution are implemented and mock-verified; live access and commercial quality are not tested.',
        sourceScope:'Only this company’s selected sources and public sources discovered in its bound session; optional bounded screenshot pixels must be explicitly approved.',
        exclusions:['No sending, deployment, customer actions, purchases or account access','No prior-grant borrowing, replacement inference, automatic fallback or protected evaluation'],providerRequests:0};
    }
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
