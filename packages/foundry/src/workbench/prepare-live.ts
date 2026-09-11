/** Preparation only. This entry point cannot load credentials or dispatch a provider request. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Workbench} from './service.ts';
import {prospectiveEvidenceRequest} from './evidence.ts';
import {invoiceStageSchema,invoiceBundle} from './invoice.ts';
import {invoiceProcedure} from './invoice-runtime.ts';
import {route,implementationHash} from '../workflow/config.ts';
import {hash} from '../contracts.ts';
const root=resolve(process.argv[2]??'var/workbench-live-proposal-v1');mkdirSync(root,{recursive:true});
const app=new Workbench(join(root,'preparation-only'));try {
 const {id}=app.create('invoice-1');const b=app.get(id);const prospectiveRoute={...route,authorizationId:'workbench-connected-diagnostic-v1'};
 const evidence=prospectiveEvidenceRequest(app.scope(id),b.bundle,'understanding-1',prospectiveRoute);
 const manifest={version:'workbench-connected-diagnostic-v1',approved:false,providerRequests:0,implementationHash:implementationHash(),projectId:'proj_H01ORqdOPQM6vdGwQYsqFL5r',route:prospectiveRoute,data:'AP-001 synthetic permitted evidence only; no protected/customer data',bundleHash:hash(b.bundle),sourceCorpus:invoiceBundle('AP-001'),baselineProcedure:invoiceProcedure,stages:['understanding','investigate','draft','review','inspect'],inferenceAdmissions:5,countRequests:5,inferenceReservationMinor:260,unpricedCountUncertaintyMinor:53,totalNewExposureMinor:313,currency:'USD',concurrency:1,countDeadlineMs:10000,inferenceDeadlineMs:180000,retries:0,recoveries:0,expiresAt:'2026-09-25T22:00:00Z',historicalMission029HeldMinor:972,historicalTransfer:false,fixtureEffects:1,fixtureEffectCapMinor:25,seededDraftDefect:false,ownerApproval:'Exact final recommendation hash; asynchronous owner approval; no payment effect',protectedEvaluation:false,production:false,missingExecutionGate:'New signed authorization AND focused trusted live-runner binding to these new contracts. Workbench server remains fixture-only. Existing Responses bridge/admission is reused; this manifest does not enable dispatch.',analysis:'One connected diagnostic case, no comparative or reliability estimate. Separate source/reference correctness, proposal usefulness, packet arithmetic, review changes, authenticated delivery, latency, provisional costs and missing human timing.'};
 for(const [name,value] of Object.entries({'authorization.request.json':manifest,'understanding.request.json':evidence,'invoice.schemas.json':Object.fromEntries(['investigate','draft','review','inspect'].map(s=>[s,invoiceStageSchema(s as any)]))}))writeFileSync(join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({root,manifestHash:hash(manifest),providerRequests:0,approved:false}));
}finally{app.close();}
