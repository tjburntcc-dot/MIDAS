import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash,requireThat } from '../contracts.ts';
import { PortfolioEngine } from './engine.ts';
import { LocalWorkTools } from './tools.ts';
import { InteractivePreviewSessions,renderRemotePreview } from './preview.ts';
import { renderServiceBrief,checkServiceBrief } from './products.ts';
import { portfolioScope } from './contracts.ts';
import type { Task } from './contracts.ts';
import { CommercialWork } from './commercial.ts';
import {readPortfolioAccounting} from './accounting-view.ts';
import {renderOperatingPacket,checkOperatingPacket} from './operating-profile.ts';
import { integratedOwnerPacket } from './integrated-release.ts';
import {valueReleaseV4OwnerPacket} from './value-release-v4.ts';
import { operatingPacket } from './release.ts';
const here=dirname(fileURLToPath(import.meta.url));
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export function portfolioView(engine:PortfolioEngine,tools:LocalWorkTools){
 const p=engine.portfolio,s=p.snapshot(),account=engine.accounting?.(),frozen=account?.taskAllocations,sources=s.ventures.flatMap(v=>engine.evidence.list(v.id)),modelAccounting=readPortfolioAccounting(engine.store,tools.root);
 const needsGrant=(t:Task)=>Boolean((t.inputs as any)?.requiresGrant&&(engine.model.kind!=='actual_model'||frozen&&!frozen.some((a:any)=>a.id===t.id)));
 const tasks=s.tasks.map(t=>({...t,executionMode:(t.inputs as any)?.requiresGrant?'actual_model':engine.model.kind,modelDisabledUntilGrant:needsGrant(t),controls:t.status==='running'?['pause','cancel']:t.status==='paused'?['resume','cancel']:t.status==='queued'?[...(t.runnable&&!needsGrant(t)?['run']:[]),'pause','cancel']:[],worker:t.workerId??'baseline-worker',description:t.objective,lastActivity:t.updatedAt}));
 const artifacts=s.artifacts.map(a=>{const task=s.tasks.find(t=>t.id===a.taskId);return {...a,status:task?.status==='completed'&&task.outputCurrent?'delivered_locally':task&&!task.outputCurrent?'stale':'prepared',revisable:Boolean(a.taskId),content:a.kind==='business_proposal'?a.content?.summary:a.summary};});
 const economics={observedRevenueMinor:null,observedCostMinor:null,reservedMinor:null,ownerSeconds:null,currency:'USD'};
 return {...s,modelAccounting,portfolio:{...s.portfolio,goal:'Build and improve Mason-owned businesses through useful work, evidence and bounded authority.',runningCount:tasks.filter(t=>t.status==='running').length,concurrencyLimit:s.portfolio.maxConcurrency},ventures:s.ventures.map(v=>({...v.metadata,...v,nextAction:engine.model.kind!=='actual_model'&&tasks.some(t=>t.ventureId===v.id&&t.modelDisabledUntilGrant&&t.status==='queued')?'Review the bounded Astra proposal; current outputs are ready to inspect.':v.nextAction,economics,executionMode:engine.model.kind,claims:sources.filter(x=>x.ventureId===v.id).map(x=>({id:x.id,ventureId:v.id,kind:x.provenance==='owner_report'?'owner_reported':'source_assertion',text:x.title,sourceIds:[x.id]}))})),sources,tasks,artifacts,commercialDrafts:engine.rows('portfolio-commercial').map(d=>{const c=new CommercialWork(p).current(d.id);return {...c,title:d.subject,status:c.current?'prepared':'stale',consentEvidenceIds:d.consentEvidence?[d.consentEvidence]:[]};}),operatingPacket:p.store.get('portfolio-plan','quote-desk/value-release-v4')?valueReleaseV4OwnerPacket:p.store.get('portfolio-plan','quote-desk/integrated-build-v3')?integratedOwnerPacket:operatingPacket,communicationSetup:{provider:'gmail',status:'not_connected',summary:'Optional controlled transport test only; no account access or sending is authorized.',steps:['Use an owner-controlled Gmail test account; enable Gmail API and configure your own Web OAuth client for Google OAuth Playground.','Choose only owner-controlled or explicitly consenting test recipients. Record those addresses and consent before exact authorization.','Use the preserved Mission 030 Gmail connection flow locally after approval. Do not paste tokens into the workspace or chat.','Review up to two exact messages and approve their hashes; the signed channel grant caps sends at two with cadence and scope checks.']},workers:s.workers.map(w=>({...w,qualification:'experimental; no demonstrated specialist advantage',evidence:['Mission 028 retained the strong support baseline; this does not qualify the new software or service jobs.','Local checks establish tool behavior only.'],selectionReason:'Covers the declared tool and task requirements; one worker retains the full review/correction opportunity. Role names are not competence evidence.'})),decisions:[...s.decisions.map(d=>({...d,title:'Recorded allocation decision',status:'completed',recommendation:d.rationale})),{id:'portfolio-live-authority',title:engine.model.kind==='actual_model'?'Bounded Astra authority loaded':'Actual-model execution is prepared, not authorized',status:engine.model.kind==='actual_model'?'active':'pending',reason:'Local products and delivery tools can be inspected now. New reasoning/search calls require a separately signed portfolio grant.',recommendation:'Inspect the completed local result and approve one bounded live operating package when ready.',consequence:'No accounts, spending, communication or commercial commitment occur from this preparation.',nextAction:'Review the consolidated proposal in the handoff.',choices:[]}],activity:engine.rows('portfolio-observation').map(o=>({id:o.id,ventureId:o.ventureId,title:o.kind,text:o.summary,createdAt:o.createdAt,kind:o.kind})),resources:{...s.resources,providerRequests:modelAccounting.inferenceDispatches===undefined?null:modelAccounting.inferenceDispatches+(modelAccounting.countRequests??0),provisionalMinor:modelAccounting.provisionalMinor??null,settledMinor:modelAccounting.settledMinor??null,retainedMinor:modelAccounting.retainedMinor??null,remainingMinor:modelAccounting.remainingMinor??null,callsUsed:modelAccounting.callsUsed??null,callLimit:modelAccounting.callLimit??null,countBufferMinor:modelAccounting.countBufferMinor??null,localComputeCost:null,humanTime:null},provenance:'Local portfolio; mock decisions and development-assistant artifacts are labelled. No paid calls or customer results are implied.'};
}
export function servePortfolio(options:{engine:PortfolioEngine;tools:LocalWorkTools;port?:number;previews?:InteractivePreviewSessions}){
 const {engine,tools}=options,portfolio=engine.portfolio,store=engine.store,previews=options.previews??new InteractivePreviewSessions();
 const sessions=new Map<string,{csrf:string;at:number}>(),sessionPreviews=new Map<string,{owner:string;taskId:string}>(),openingPreviews=new Set<string>();let origin='';
 const server=createServer(async(req,res)=>{
  const send=(status:number,value:any,headers:Record<string,string>={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(typeof value==='string'?value:JSON.stringify(value));};
  try{
   requireThat(req.headers.host===new URL(origin).host,'HOST_DENIED');const url=new URL(req.url??'/',origin);
   if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
   if(req.method==='GET'&&['/','/portfolio.js','/portfolio.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname==='/portfolio.js'?'app.js':'style.css';send(200,readFileSync(join(here,file),'utf8'),{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','content-security-policy':csp});return;}
   const cookie=(req.headers.cookie??'').match(/(?:^|;\s*)midas031=([a-f0-9]{48})(?:;|$)/)?.[1];let session=cookie?sessions.get(cookie):null;
   if(req.method==='GET'&&url.pathname==='/api/session'){
    if(!session){const id=randomBytes(24).toString('hex');session={csrf:randomBytes(24).toString('hex'),at:Date.now()};sessions.set(id,session);res.setHeader('Set-Cookie','midas031='+id+'; HttpOnly; SameSite=Strict; Path=/');}
    send(200,{csrf:session.csrf,mode:engine.model.kind,externalAuthority:false});return;
   }
   requireThat(session&&Date.now()-session.at<12*3600000,'OWNER_SESSION_REQUIRED');
   if(req.method==='GET'&&url.pathname==='/api/portfolio'){send(200,portfolioView(engine,tools));return;}
   const binding=()=>{const ventureId=url.searchParams.get('ventureId')??'',taskId=url.searchParams.get('taskId')??'';const task=portfolio.getTask(taskId);requireThat(task.ventureId===ventureId,'TASK_SCOPE_DENIED');return {ventureId,taskId,workspace:tools.load(ventureId,taskId)};};
   if(req.method==='GET'&&url.pathname==='/api/delivery'){const b=binding(),download=tools.download(b.ventureId,b.taskId,url.searchParams.get('file')??undefined);send(200,download.content,{'content-type':download.mimeType,'content-disposition':'attachment; filename="'+download.fileName.replace(/[^A-Za-z0-9._-]/g,'_')+'"','content-security-policy':"sandbox; default-src 'none'"});return;}
   if(req.method==='GET'&&url.pathname==='/preview'){
    const b=binding();requireThat(b.workspace.published&&b.workspace.published.manifestHash===b.workspace.manifest.sha256,'CURRENT_DELIVERY_REQUIRED');
    if(b.workspace.kind==='service'){const report=checkServiceBrief(b.workspace.files,b.workspace.inputs);requireThat(report.checks.every(c=>c.passed),'CURRENT_CHECKS_REQUIRED');if(b.workspace.inputs.operatingProfile==='operating-packet-v1')requireThat(checkOperatingPacket(report.report,b.workspace.inputs.reviewedArtifactHash).every(c=>c.passed),'CURRENT_OPERATING_CHECKS_REQUIRED');send(200,b.workspace.inputs.operatingProfile==='operating-packet-v1'?renderOperatingPacket(report.report,b.workspace.inputs.reviewedProductLinks):renderServiceBrief(report.report,b.workspace.inputs),{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});}
    else send(200,renderRemotePreview({ventureId:b.ventureId,taskId:b.taskId,manifestHash:b.workspace.manifest.sha256,openEndpoint:'/api/preview/open',actionEndpoint:'/api/preview/action',csrf:session.csrf}),{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});return;
   }
   requireThat(req.method==='POST'&&req.headers.origin===origin&&req.headers['x-csrf-token']===session.csrf,'CSRF_INVALID');
   let raw='';for await(const chunk of req){raw+=chunk;requireThat(Buffer.byteLength(raw)<=100000,'REQUEST_TOO_LARGE');}const body=JSON.parse(raw);
   if(url.pathname==='/api/preview/open'){
    const t=portfolio.getTask(body.taskId);requireThat(t.ventureId===body.ventureId,'PREVIEW_SCOPE_DENIED');const w=tools.load(t.ventureId,t.id);requireThat(w.manifest.sha256===body.manifestHash&&w.published?.manifestHash===body.manifestHash,'PREVIEW_MANIFEST_STALE');
    const openKey=cookie+'/'+t.id;requireThat(!openingPreviews.has(openKey),'PREVIEW_OPEN_PENDING');openingPreviews.add(openKey);
    try{
     // Reopening the same product replaces only this owner's transient browser.
     // Durable product data is retained; another owner's session is untouched.
     for(const [id,entry] of sessionPreviews)if(entry.owner===cookie&&entry.taskId===t.id){await previews.close(id);sessionPreviews.delete(id);}
     const result=await previews.open({ventureId:t.ventureId,taskId:t.id,manifestHash:w.manifest.sha256,files:w.files,executionProfile:w.inputs.profile,viewportWidth:body.viewportWidth,stateHandler:x=>tools.previewState(t.ventureId,t.id,x)});sessionPreviews.set(result.sessionId,{owner:cookie!,taskId:t.id});send(200,result);
    }finally{openingPreviews.delete(openKey);}return;
   }
   if(url.pathname==='/api/preview/action'){
    requireThat(sessionPreviews.get(body.sessionId)?.owner===cookie,'PREVIEW_SESSION_SCOPE');const b=previews.binding(body.sessionId),w=tools.load(b.ventureId,b.taskId);requireThat(w.manifest.sha256===b.manifestHash,'PREVIEW_MANIFEST_STALE');send(200,await previews.act(body.sessionId,body));return;
   }
   requireThat(url.pathname==='/api/action','ROUTE_NOT_FOUND');
   const action=body.action,ventureId=body.ventureId;portfolio.getVenture(ventureId);
   if(['run','pause','resume','cancel'].includes(action)){
    if(body.taskId){const task=portfolio.getTask(body.taskId);requireThat(task.ventureId===ventureId,'TASK_SCOPE_DENIED');if(action!=='run')portfolio.controlTask(task.id,action);if(action==='run'||action==='resume'){const promise=engine.runTask(task.id);void Promise.resolve(promise).catch(()=>{});}}
    else {requireThat(action!=='run','TASK_REQUIRED');portfolio.controlVenture(ventureId,action);if(action==='resume')void engine.drain().catch(()=>{});}send(202,{accepted:true,snapshot:portfolioView(engine,tools)});return;
   }
   if(action==='evidence'){
    const source=engine.evidence.add(ventureId,{title:body.title,text:body.text,url:body.url||null,rights:'owner_supplied',provenance:'owner_report',observedAt:new Date().toISOString(),publishedAt:null});
    const result=portfolio.recordObservation(ventureId,{kind:'new_owner_evidence',summary:'Owner supplied '+source.title,source:source.id,provenance:'owner_report',metadata:{sha256:source.sha256},reassess:true});send(200,{source,result});return;
   }
   if(action==='observation'){
    requireThat(typeof body.text==='string'&&body.text.trim().length>0&&body.text.length<=12000,'OBSERVATION_TEXT_REQUIRED');
    const result=portfolio.recordObservation(ventureId,{kind:typeof body.kind==='string'?body.kind:'owner_observation',summary:body.text,source:'owner-workspace',provenance:'owner_report; assistance and timing not independently established',metrics:{independentHumanSeconds:null},metadata:body.commercialDraftId?(()=>{const d=new CommercialWork(portfolio).current(body.commercialDraftId);requireThat(d.ventureId===ventureId&&d.artifactHash===body.artifactHash,'COMMERCIAL_OUTCOME_SCOPE');return {commercialDraftId:d.id,artifactHash:d.artifactHash,currentAtReport:d.current,reportedOnly:true};})():{},reassess:true});send(200,result);return;
   }
   if(action==='request_revision'){
    const artifact=store.get('portfolio-artifact',body.artifactId);requireThat(artifact&&artifact.ventureId===ventureId&&artifact.sha256===body.expectedHash,'STALE_ARTIFACT');requireThat(typeof body.instruction==='string'&&body.instruction.trim().length>0&&body.instruction.length<=6000,'REVISION_INSTRUCTION_REQUIRED');
    const id='revise-'+hash({artifact:artifact.sha256,instruction:body.instruction}).slice(0,18),existing=store.get('portfolio-task',ventureId+'/'+id);if(existing){send(200,{task:existing,duplicate:true});return;}
    const previous=portfolio.getTask(artifact.taskId),workspace=tools.load(ventureId,previous.id);tools.seed(ventureId,ventureId+'/'+id,{kind:workspace.kind,files:workspace.files,inputs:workspace.inputs,provenance:'Owner requested revision of preserved artifact '+artifact.sha256});
    const plan=portfolio.addPlan(ventureId,{rationale:'Owner revision request: '+body.instruction,tasks:[{id,title:'Revise '+artifact.title,objective:body.instruction,lane:'build',capability:previous.capability,dependsOn:[],acceptance:previous.acceptance,requiredChecks:previous.requiredChecks,allowedTools:previous.allowedTools,requiredCompetencies:previous.requiredCompetencies,inputArtifacts:[{artifactId:artifact.id,version:artifact.version,sha256:artifact.sha256}],resource:previous.resource,inputs:{...(previous.inputs as Record<string,unknown>??{}),requiresGrant:true,authoritativeArtifactId:artifact.localId}}]});send(200,{plan,status:'Saved; actual-model authorization required. No mocked response to the owner’s requested change.'});return;
   }
   throw Object.assign(new Error('ACTION_NOT_AVAILABLE'),{code:'ACTION_NOT_AVAILABLE'});
  }catch(e){send(400,{error:(e as any).code??(e as Error).message});}
 });
 const ready=new Promise<string>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??43131,'127.0.0.1',()=>{origin='http://127.0.0.1:'+(server.address() as any).port;resolve(origin);});});
 return {server,ready,async close(){await previews.closeAll();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
