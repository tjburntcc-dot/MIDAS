import {hash,requireThat} from '../contracts.ts';
import {mockResult} from '../portfolio/worker.ts';
import type {PilotService} from './service.ts';
import {OfflineTransport} from './connections/index.ts';
import {fixtureOutcomePlanner} from './fixtures-outcome.ts';
import {fixtureCommercialOutput} from './intelligence-fixtures.ts';

/** Explicit archive demonstration. All business data, interpretation and model
 * decisions here are development-authored. HTTP, files, browser checks, state,
 * invalidation and local publication actually execute. No provider can be used. */
export async function createOperatingDemo(service:PilotService,which:'service'|'retail'){
 requireThat(['service','retail'].includes(which),'OPERATING_DEMO_CASE');
 const company=await service.createCommercialDemo(which),id=company.id,connections=service.connectedAccounts;
 const connect=async(provider:any,configuration:any,transport:OfflineTransport,capabilityIds?:string[])=>{
  const c=connections.beginConfiguration({businessId:id,provider,credentialReference:{kind:'owner_vault',id:'no-credential-offline-fixture'},configuration,...(capabilityIds?{capabilityIds}:{})});
  const scopes=connections.registry.get(provider).definition.capabilities.filter(x=>c.capabilityIds.includes(x.id)).flatMap(x=>x.requiredScopes);
  connections.grantConsent(c.id,{grantedAt:new Date().toISOString(),grantedBy:'development-fixture-controller',purpose:'Explicit offline adapter demonstration; no actual account consent or access.',scopes});
  return connections.sync(c.id,transport);
 };
 const policy='SYNTHETIC FIXTURE. '+company.name+' prepares local drafts only. An owner must confirm price, fulfillment and action authority. These examples contain no customer activity or measured business results.';
 await connect('google_workspace',{maxPages:1,maxFiles:2},new OfflineTransport([
  {matches:r=>r.path==='/drive/v3/files',response:{status:200,body:{files:[{id:'operating-policy',name:'Connected operating policy — fixture',mimeType:'application/vnd.google-apps.document'}]}}},
  {matches:r=>r.path.includes('/documents/'),response:{status:200,body:{body:{content:[{textRun:{content:policy}}]}}}}
 ]),['drive_documents_read']);
 await connect('shopify_admin',{maxPages:1,pageSize:5},new OfflineTransport([{matches:r=>r.provider==='shopify_admin',response:{status:200,body:{data:{products:{nodes:[{id:'gid://shopify/Product/fixture',title:'Synthetic offer record; not a product for sale',handle:'fixture',status:'DRAFT',updatedAt:'2026-09-13T12:00:00Z',variants:{nodes:[],pageInfo:{hasNextPage:false}}}],pageInfo:{hasNextPage:false}},orders:{nodes:[],pageInfo:{hasNextPage:false}}}}}}]));
 await connect('google_analytics_4',{maxPages:1,pageSize:5,propertyId:'123456',startDate:'2026-09-01',endDate:'2026-09-02'},new OfflineTransport([{matches:r=>r.provider==='google_analytics_4',response:{status:200,body:{dimensionHeaders:[{name:'date'},{name:'sessionDefaultChannelGroup'}],metricHeaders:[{name:'sessions'},{name:'totalUsers'},{name:'screenPageViews'},{name:'keyEvents'}],rows:[],rowCount:0,metadata:{fixture:true,note:'Empty synthetic report; not a claim of zero real traffic.'}}}}]));
 await service.intelligence.analyze(id,{kind:'fixture',run:()=>mockResult(fixtureCommercialOutput(which,service.intelligence.sources(id)))});
 const mandate=service.operatingOutcomes.create(id,{objective:'Prepare a sourced operating brief and a working local records application; carry the same approved operating assumptions through both.',autonomy:'prepare_supported_work',allowedFamilies:['response-packet','functional-project'],maxCalls:32,repairReserve:18});
 await service.operatingOutcomes.propose(mandate.id,fixtureOutcomePlanner);
 const original=await service.operatingOutcomes.runOffline(mandate.id);requireThat(original.state==='completed','OPERATING_DEMO_INITIAL_FAILED');
 const brief=original.graph.find((n:any)=>n.family==='response-packet'),oldArtifact=service.execution.artifact(id,brief.taskId)!;
 const instruction='Include a clearly marked owner-confirmation step for price and fulfillment before recommending use of any prepared offer. Preserve uncertainty and the local-only boundary.';
 service.operatingOutcomes.correct(mandate.id,{nodeId:brief.id,artifactHash:oldArtifact.hash,instruction,repairCalls:4,assisted:true});
 const corrected=await service.operatingOutcomes.runOffline(mandate.id);requireThat(corrected.state==='completed','OPERATING_DEMO_CORRECTION_FAILED');
 const currentBrief=corrected.graph.find((n:any)=>n.family==='response-packet'),source=service.knowledge.selectedSources(id).find(s=>s.text===policy)!;
 const learning=service.workerDevelopment.prepare(id,{taskId:currentBrief.taskId,sourceId:source.id,quote:source.text,consequence:'An omitted confirmation step could make the local operating packet appear ready for external use.',cause:'missing_procedure',rationale:'A correction trace could help preserve an explicitly requested confirmation step across dependent artifacts; this is a test hypothesis, not an observed model defect.',alternatives:['The original task may not have made the desired wording explicit.','A human reviewer may simply prefer a different presentation.'],material:{title:'Correction trace method — reusable fixture',content:'Trace each requested correction to changed source, fresh checks, local publication identity and dependent-artifact status. Do not infer business success from publication.',provenance:'Development-authored reusable method for testing the learning mechanism.',rights:'reusable'},procedureAddition:'Before finalizing a corrected artifact, trace each requested correction to the changed section and current independent check. Flag unchanged dependencies that require regeneration.',assisted:true});
 const comparison=await service.workerDevelopment.fixture(id,learning.candidateId);
 const result={businessId:id,case:which,outcomeId:mandate.id,originalTaskIds:original.taskIds,currentTaskIds:corrected.graph.map((n:any)=>n.taskId),connections:connections.list(id).map(c=>({id:c.id,provider:c.provider,readiness:c.readiness})),correction:{instruction,assisted:true,independentHumanSeconds:null},learning:{candidateId:learning.candidateId,comparisonId:comparison.id,decision:comparison.decision},providerRequests:0,modelCompetence:'not measured; all model decisions were explicit fixtures',businessOutcome:'not observed',createdAt:new Date().toISOString()};
 service.store.transaction(()=>service.store.put('pilot-operating-demonstration',id,result,null));
 service.audit(id,'operating-demo',{demonstrationHash:hash(result),providerRequests:0,provenance:'development-authored fixture with actual local software execution'});
 return service.knowledge.company(id);
}
