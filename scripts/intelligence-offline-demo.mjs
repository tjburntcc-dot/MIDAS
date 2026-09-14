/** Explicit offline archive demonstration. No public reader, credential or provider port. */
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PilotService} from '../packages/foundry/src/pilot/service.ts';
import {PilotLearning} from '../packages/foundry/src/pilot/learning.ts';
import {hash} from '../packages/foundry/src/contracts.ts';
const args=process.argv.slice(2),root=resolve(args[args.indexOf('--root')+1]||'var/business-intelligence-033');
if(args.length&&!args.includes('--root'))throw Error('Only --root is supported; this is always an offline fixture.');
const service=new PilotService(root),result=[];
try{
 for(const which of ['service','retail']){
  const prior=service.store.get('pilot-release-demo','033-'+which);
  if(prior){result.push(prior);continue;}
  const company=await service.createCommercialDemo(which),selected=service.intelligence.select(company.id,'clarify-first-step');
  await service.execution.run(company.id,selected.task.id);
  if(service.task(company.id,selected.task.id).status!=='completed')throw Error('Offline campaign did not complete.');
  const page=service.intelligence.materialize(company.id)[0];await service.execution.run(company.id,page.id);
  if(service.task(company.id,page.id).status!=='completed')throw Error('Offline page did not complete.');
  const original=service.currentArtifact(company.id,selected.task.id);
  const instruction=which==='service'?'Prepare an owner-reviewed readiness discussion before requesting any system access.':'Prepare a buyer preference discussion before recommending a sampler; caffeine preferences remain buyer supplied.';
  const observation=service.knowledge.correction(company.id,{taskId:selected.task.id,artifactHash:original.hash,instruction,assisted:true});
  const correction=service.execution.correct({businessId:company.id,taskId:selected.task.id,artifactHash:original.hash,instruction,observation});await service.execution.run(company.id,correction.id);
  if(service.task(company.id,correction.id).status!=='completed')throw Error('Offline correction did not complete.');
  service.store.transaction(()=>{
   service.store.put('pilot-correction-link','033-demo-'+which,{businessId:company.id,taskId:selected.task.id,newTaskId:correction.id,artifactHash:original.hash,instruction,observationId:observation.id,timing:{independentSeconds:null},at:new Date().toISOString(),provenance:'Scripted development fixture; no Mason approval or human timing'},null);
   const work=service.store.get('pilot-commercial-work',selected.task.id);service.store.put('pilot-commercial-work',selected.task.id,{...work,correctedCampaignTaskId:correction.id,dependentStatus:'Earlier page invalidated; fresh linked replacement checked below'},work._version);
  });
  const replacement=service.execution.replanDependent({businessId:company.id,taskId:page.id,campaignTaskId:correction.id});await service.execution.run(company.id,replacement.id);
  if(service.task(company.id,replacement.id).status!=='completed')throw Error('Offline replacement did not complete.');
  const learning=new PilotLearning(service.store).run(company.id,selected.task.id,'campaign-packet');
  const artifact=service.currentArtifact(company.id,replacement.id);
  service.knowledge.outcome(company.id,{taskId:replacement.id,artifactHash:artifact.hash,kind:'accepted',notes:'Developer-authored fixture outcome: local source and required checks match the requested correction. No customer usefulness, revenue or independent review was observed.',assisted:true});
  const value={businessId:company.id,case:which,originalCampaign:selected.task.id,originalPage:page.id,correctedCampaign:correction.id,replacementPage:replacement.id,artifactHash:artifact.hash,checks:artifact.checks,learningId:learning.id,selection:learning.decision,providerRequests:0,independentHumanSeconds:null,provenance:'Scripted offline integration demonstration using the shared controller. No model reasoning, customer result or protected comparison.',at:new Date().toISOString()};
  service.store.transaction(()=>service.store.put('pilot-release-demo','033-'+which,value,null));
  const directory=join(root,'reports',which);mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,'evidence.json'),JSON.stringify(service.exportBusiness(company.id),null,2)+'\n');
  for(const [taskId,name]of [[correction.id,'campaign'],[replacement.id,'page']]){const download=service.execution.download(company.id,taskId,name==='page'?'app.html':undefined);writeFileSync(join(directory,name==='page'?'page.html':'campaign.json'),download.content);}
  result.push(value);
 }
 mkdirSync(join(root,'reports'),{recursive:true});writeFileSync(join(root,'reports','offline-demonstration.json'),JSON.stringify({results:result,hash:hash(result),actualProviderRequests:0},null,2)+'\n');
 console.log(JSON.stringify({results:result.map(r=>({businessId:r.businessId,case:r.case,replacementPage:r.replacementPage,providerRequests:0})),report:join(root,'reports','offline-demonstration.json')},null,2));
}finally{service.store.close();}
