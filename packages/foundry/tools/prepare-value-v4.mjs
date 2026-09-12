import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {StateStore} from '../src/state.ts';
import {hash,requireThat} from '../src/contracts.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {LocalWorkTools,mandatoryCheckIds} from '../src/portfolio/tools.ts';
import {prepareValueReleaseV4,valueReleaseV4Allocation,valueReleaseV4Budget,valueReleaseV4TaskAllowances} from '../src/portfolio/value-release-v4.ts';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';

const ventureId='quote-desk',localId='developer-preview-v4',taskId=ventureId+'/'+localId;
const workerId='developer-preview-v4-local-tools',profile='quote-to-job-v2';
const title='Quote desk — development preview v4',receiptKind='developer-v4-demo-v1';
const paidIds=valueReleaseV4Allocation.map(([id])=>ventureId+'/'+id);
const query='?ventureId='+encodeURIComponent(ventureId)+'&taskId='+encodeURIComponent(taskId);
const links={previewUrl:'/preview'+query,downloadUrl:'/api/delivery'+query};
const authorship={sourceAuthorship:'development_assistant',modelProvenance:'not_invoked',semanticReview:'development_assistant_preparation_and_browser_observations; founder_inspection_unknown',customerAcceptance:'unobserved',independentHumanReview:false};
const summary='Development-assistant reference checked in a real isolated browser and delivered locally. No model was invoked. Mechanical checks and DOM observations do not establish semantic fitness, founder acceptance, customer demand or commercial outcomes.';
const entity=(db,kind,key)=>{const row=db.prepare('SELECT body FROM entities WHERE kind=? AND key=?').get(kind,key);return row?JSON.parse(row.body):null;};
const rows=(db,kind)=>db.prepare('SELECT body FROM entities WHERE kind=?').all(kind).map(row=>JSON.parse(row.body));
const assertUnsigned=root=>requireThat(!existsSync(join(root,'portfolio.authorization.json')),'FROZEN_RUNTIME_PREPARATION_DENIED');

function assertPaidUntouched(db,requireAll=false){
 const tasks=paidIds.map(id=>entity(db,'portfolio-task',id));
 if(requireAll)requireThat(tasks.every(Boolean),'VALUE_V4_TASKS_MISSING');
 for(const task of tasks.filter(Boolean))requireThat(task.status==='queued'&&task.attempts===0&&!task.lease&&!task.result,'VALUE_V4_TASK_ALREADY_STARTED_OR_CHANGED');
 requireThat(!rows(db,'local-workspace').some(w=>paidIds.includes(w.taskId)),'VALUE_V4_WORKSPACE_ALREADY_SEEDED');
 return tasks.filter(Boolean);
}
function checkedDelivery(store,tools){
 const workspace=tools.load(ventureId,taskId),publication=workspace.published;
 requireThat(workspace.kind==='software'&&workspace.inputs.profile===profile&&workspace.provenance==='development_assistant','DEVELOPER_PREVIEW_WORKSPACE_IDENTITY');
 requireThat(publication&&publication.manifestHash===workspace.manifest.sha256&&workspace.checkedManifest===workspace.manifest.sha256,'DEVELOPER_PREVIEW_CURRENT_DELIVERY_REQUIRED');
 requireThat(mandatoryCheckIds('software',profile).every(id=>workspace.checks.some(c=>c.id===id&&c.passed))&&!workspace.checks.some(c=>c.required&&!c.passed),'DEVELOPER_PREVIEW_CHECKS_REQUIRED');
 const payload=JSON.parse(tools.download(ventureId,taskId).content);
 requireThat(hash(payload)===publication.payloadHash&&publication.ref.sha256===publication.payloadHash&&payload.taskId===taskId&&payload.manifest.sha256===workspace.manifest.sha256&&hash(payload.files)===hash(workspace.files)&&hash(payload.checks)===hash(workspace.checks),'DEVELOPER_PREVIEW_DELIVERY_BINDING');
 const scope=portfolioScope(ventureId),principal={id:'developer-preview-receipt',tenantId:scope.tenantId,businessId:scope.businessId,permissions:['read']};
 const screenshots=[];
 for(const view of workspace.checks.find(c=>c.id==='software.browser-observation')?.evidence?.views??[]){
  if(!view.screenshot)continue;
  const image=store.readArtifact(principal,scope,view.screenshot.id);
  requireThat(hash(image)===view.screenshot.sha256&&image.kind==='browser_screenshot'&&image.taskId===taskId&&image.manifestHash===workspace.manifest.sha256&&image.mimeType==='image/png','DEVELOPER_PREVIEW_SCREENSHOT_BINDING');
  const bytes=Buffer.from(image.base64,'base64');
  requireThat(bytes.length>8&&bytes.length<=16*1024*1024&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'DEVELOPER_PREVIEW_SCREENSHOT_FORMAT');
  screenshots.push({name:view.name,ref:view.screenshot,bytes});
 }
 return {workspace,publication,payload,screenshots};
}
function safeReports(root){
 const reports=join(root,'reports');
 if(!existsSync(reports))mkdirSync(reports);
 const actual=realpathSync(reports),part=relative(root,actual);
 requireThat(statSync(actual).isDirectory()&&part&&!part.startsWith('..')&&!isAbsolute(part),'REPORT_DIRECTORY_OUTSIDE_RUNTIME');
 return actual;
}
function assertReportPaths(root){
 const reports=join(root,'reports');if(!existsSync(reports))return;
 const part=relative(root,realpathSync(reports));
 requireThat(statSync(reports).isDirectory()&&part&&!part.startsWith('..')&&!isAbsolute(part),'REPORT_DIRECTORY_OUTSIDE_RUNTIME');
 const receipt=join(reports,'developer-v4-demo.json');if(existsSync(receipt))requireThat(!lstatSync(receipt).isSymbolicLink(),'DEVELOPER_PREVIEW_RECEIPT_SYMLINK');
}
function writeReceipt(root,portfolio,tools){
 const task=portfolio.getTask(taskId);
 requireThat(task.status==='completed'&&task.outputCurrent&&task.outputArtifacts.length===1,'DEVELOPER_PREVIEW_COMPLETION_REQUIRED');
 const verified=checkedDelivery(portfolio.store,tools),artifact=portfolio.store.get('portfolio-artifact',task.outputArtifacts[0].artifactId);
 requireThat(artifact?.taskId===taskId&&artifact.provenance==='development_assistant'&&artifact.metadata?.modelProvenance==='not_invoked'&&artifact.metadata.manifestHash===verified.workspace.manifest.sha256&&artifact.metadata.payloadHash===verified.publication.payloadHash&&artifact.sha256===task.outputArtifacts[0].sha256,'DEVELOPER_PREVIEW_ARTIFACT_BINDING');
 const proposedTasks=assertPaidUntouched(portfolio.store.db,true).map(task=>({id:task.id,status:task.status,attempts:task.attempts,workspaceSeeded:false}));
 assertUnsigned(root);
 const reports=safeReports(root),screenshots=verified.screenshots.map((image,i)=>{
  // The filename is controller-generated; an artifact never supplies a host path.
  const filename='developer-v4-demo-'+String(i+1).padStart(2,'0')+'.png',path=join(reports,filename);
  if(existsSync(path))requireThat(!lstatSync(path).isSymbolicLink()&&readFileSync(path).equals(image.bytes),'DEVELOPER_PREVIEW_SCREENSHOT_FILE_CONFLICT');
  else writeFileSync(path,image.bytes,{flag:'wx'});
  return {name:image.name,ref:image.ref,path,bytes:image.bytes.length,sha256:createHash('sha256').update(image.bytes).digest('hex')};
 });
 const receipt={kind:receiptKind,status:'completed',root,preparedAt:task.result.observedAt,taskId,planId:task.planId,title,...authorship,...links,
  linkUse:'Open the portfolio server for this root first to establish its owner session, then follow previewUrl. The preview opens this completed developer task; it does not execute a paid task.',
  artifact:{id:artifact.id,version:artifact.version,sha256:artifact.sha256,provenance:artifact.provenance},manifest:verified.workspace.manifest,publication:verified.publication,
  checks:verified.workspace.checks.map(({id,passed,required,summary})=>({id,passed,required,summary})),screenshots,
  providerRequests:0,modelRequests:0,tokenCountRequests:0,modelAdmissions:0,localToolRuns:2,sourceFilesHash:hash(verified.workspace.files),
  proposedTasks,proposedAllowances:valueReleaseV4TaskAllowances(portfolio),proposedBudget:valueReleaseV4Budget,
  preservation:{historicalArtifacts:'retained',existingV3Definitions:'retained; only eligible unstarted V3 tasks may be cancelled by prepareValueReleaseV4',paidV4Tasks:'queued, zero attempts, no seeded workspaces',completionReassessment:false,ownerCustomerRecordsSeeded:false},limitations:summary};
 const path=join(reports,'developer-v4-demo.json');
 if(existsSync(path))requireThat(hash(JSON.parse(readFileSync(path,'utf8')))===hash(receipt),'DEVELOPER_PREVIEW_RECEIPT_CONFLICT');
 else writeFileSync(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return receipt;
}

/** Explicit offline preparation. No ModelPort, provider client, authorization
 * loader, signing operation, network source reader or credential access exists. */
export async function prepareValueV4(runtimeRoot){
 requireThat(typeof runtimeRoot==='string'&&runtimeRoot.trim().length>0,'EXPLICIT_RUNTIME_ROOT_REQUIRED');
 const requested=resolve(runtimeRoot);requireThat(existsSync(requested)&&statSync(requested).isDirectory(),'EXISTING_RUNTIME_ROOT_REQUIRED');
 const root=realpathSync(requested),database=join(root,'portfolio.sqlite'),receiptPath=join(root,'reports','developer-v4-demo.json');
 assertUnsigned(root);assertReportPaths(root);requireThat(existsSync(database)&&statSync(database).isFile(),'EXISTING_PORTFOLIO_DATABASE_REQUIRED');
 // Inspect before StateStore, whose constructor would otherwise initialize a DB.
 const readOnly=new DatabaseSync(database,{readOnly:true});let prior;
 try{
  requireThat(entity(readOnly,'portfolio-config','default')&&entity(readOnly,'portfolio-venture',ventureId),'EXISTING_PORTFOLIO_REQUIRED');
  prior=entity(readOnly,'portfolio-task',taskId);
  if(existsSync(receiptPath)){
   const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
   requireThat(receipt.kind===receiptKind&&receipt.status==='completed'&&receipt.root===root&&receipt.taskId===taskId&&receipt.providerRequests===0&&prior?.status==='completed'&&prior.outputCurrent&&prior.outputArtifacts.some(a=>a.artifactId===receipt.artifact?.id&&a.sha256===receipt.artifact.sha256),'DEVELOPER_PREVIEW_RECEIPT_INVALID');
   return receipt; // No writable connection, task claim, tool rerun or file write.
  }
  requireThat(!rows(readOnly,'portfolio-task').some(t=>t.lease),'PREPARATION_REQUIRES_IDLE_RUNTIME');
  assertPaidUntouched(readOnly);
  requireThat(entity(readOnly,'portfolio-venture',ventureId).status==='active','PREPARATION_REQUIRES_ACTIVE_VENTURE');
  requireThat(!prior||prior.status==='completed'||prior.status==='queued'&&prior.attempts===0,'DEVELOPER_PREVIEW_INCOMPLETE_REQUIRES_REVIEW');
  if(prior)requireThat(prior.inputs?.developerPreview===true&&prior.inputs.sourceAuthorship==='development_assistant','DEVELOPER_PREVIEW_TASK_ID_CONFLICT');
 }finally{readOnly.close();}
 assertUnsigned(root);
 const store=new StateStore(database),portfolio=new Portfolio(store),tools=new LocalWorkTools({store,root,scopeFor:portfolioScope});let lease=null;
 try{
  if(prior?.status==='completed')return writeReceipt(root,portfolio,tools);
  prepareValueReleaseV4(portfolio,new EvidenceLibrary(store));
  const before=assertPaidUntouched(store.db,true).map(t=>[t.id,hash(t)]);
  if(!store.get('portfolio-plan',taskId))portfolio.addPlan(ventureId,{id:localId,rationale:'Publish a clearly labeled development-assistant reference for owner inspection using actual local tools. This separate task is not a live model trial or a source seed for one.',tasks:[{
   id:localId,title,objective:summary,lane:'build',capability:'software.build',dependsOn:[],acceptance:['All visible quote-to-job-v2 local checks pass on the current manifest.','Immutable local delivery readback matches the checked source and payload; authorship remains development_assistant.'],
   requiredCompetencies:['development-assistant-reference'],allowedTools:['check.run','artifact.publish_local'],requiredChecks:['delivery.current'],resource:{workerSlots:1,modelCalls:0,localToolRuns:2},maxAttempts:1,
   inputs:{kind:'software',executionProfile:profile,developerPreview:true,sourceAuthorship:'development_assistant',executionProvenance:'not_invoked',feedbackPolicy:'defer_to_declared_decision',requiresGrant:false}
  }]});
  if(!store.get('portfolio-worker',workerId))portfolio.registerWorker({id:workerId,name:'Development-assistant reference · direct local checks',competencies:['development-assistant-reference'],capabilities:['software.build'],maxConcurrency:1,procedureId:null});
  assertUnsigned(root);
  requireThat(!rows(store.db,'portfolio-task').some(t=>t.lease),'PREPARATION_REQUIRES_IDLE_RUNTIME');
  const files=quoteProductV2Example();
  tools.seed(ventureId,taskId,{kind:'software',files,inputs:{profile,developerPreview:true},provenance:'development_assistant'});
  const seeded=tools.load(ventureId,taskId);
  requireThat(seeded.inputs.profile===profile&&seeded.inputs.developerPreview===true&&seeded.provenance==='development_assistant'&&hash(seeded.files)===hash(files),'DEVELOPER_PREVIEW_SOURCE_CHANGED');
  lease=portfolio.claimTask(taskId,workerId,{ownerId:'developer-v4-preparation-'+process.pid,leaseMs:600000});
  requireThat(lease,'DEVELOPER_PREVIEW_NOT_RUNNABLE');const started=Date.now();
  const execute=async(tool,stepId)=>{
   assertUnsigned(root);portfolio.reserveStep(taskId,lease.token,'tool',stepId);
   const result=await tools.execute({ventureId,taskId,tool,args:{},operationId:stepId});
   assertUnsigned(root);portfolio.finishStep(taskId,lease.token,stepId,{outputRef:{observationId:result.observationId,manifestHash:result.manifest?.sha256??null},...(result.ok?{}:{error:result.error??'Required local checks failed'})});
   requireThat(result.ok,'DEVELOPER_PREVIEW_'+(tool==='check.run'?'CHECKS_FAILED':'PUBLICATION_FAILED')+': '+(result.error??result.checks.filter(c=>c.required&&!c.passed).map(c=>c.id).join(', ')));
   return result;
  };
  const checked=await execute('check.run','developer-v4-check'),delivery=await execute('artifact.publish_local','developer-v4-publish');
  const verified=checkedDelivery(store,tools),manifest=verified.workspace.manifest;
  requireThat(checked.manifest.sha256===manifest.sha256&&delivery.output.payloadHash===verified.publication.payloadHash,'DEVELOPER_PREVIEW_TOOL_BINDING');
  for(const [id,digest]of before)requireThat(hash(entity(store.db,'portfolio-task',id))===digest,'VALUE_V4_TASK_CHANGED_DURING_PREPARATION');
  assertUnsigned(root);
  const completed=portfolio.complete(taskId,lease.token,{summary,artifacts:[{id:localId,title,kind:'software',provenance:'development_assistant',summary,...links,content:{manifest,delivery,sourceHash:hash(verified.workspace.files)},metadata:{...authorship,taskId,manifestHash:manifest.sha256,payloadHash:verified.publication.payloadHash,executionProfile:profile},checks:checked.checks}],
   checks:[...checked.checks,{id:'delivery.current',passed:true,required:true,summary:'Readback payload hash, exact source files, current manifest and trusted checks agree.'}],usage:{workerMs:Date.now()-started},observations:[{id:localId+'-checked',kind:'developer_reference_verified',summary,source:taskId,provenance:'development_assistant',artifactIds:[taskId],metadata:{manifestHash:manifest.sha256,payloadHash:verified.publication.payloadHash,providerRequests:0,...authorship},reassess:false}]});
  requireThat(completed.status==='completed','DEVELOPER_PREVIEW_COMPLETION_NOT_CURRENT');lease=null;
  return writeReceipt(root,portfolio,tools);
 }catch(error){
  if(lease&&!existsSync(join(root,'portfolio.authorization.json'))){const current=portfolio.getTask(taskId);if(current.lease?.token===lease.token)try{portfolio.fail(taskId,lease.token,{code:'DEVELOPER_PREVIEW_PREPARATION_FAILED',message:String(error.message??error).slice(0,2000),retryable:false});}catch{}}
  throw error;
 }finally{store.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help')console.log('Usage: node packages/foundry/tools/prepare-value-v4.mjs --root <existing unsigned portfolio root>\nPrepares V4 plus a separately labeled developer preview using actual local tools. Zero model/provider calls.');
 else{requireThat(args.length===2&&args[0]==='--root'&&args[1]&&!args[1].startsWith('--'),'EXPLICIT_ROOT_ONLY: use --root <existing unsigned portfolio root>');console.log(JSON.stringify(await prepareValueV4(args[1]),null,2));}
}
