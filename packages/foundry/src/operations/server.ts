import { createServer } from 'node:http';
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes,randomUUID } from 'node:crypto';
import { StateStore } from '../state.ts';
import { hash,requireThat,scopeKey } from '../contracts.ts';
import { OperatingManager,owner } from './manager.ts';
import type { OperatingBusiness } from './manager.ts';
import { offlineManager,OFFLINE_URL } from './offline.ts';
import { startLearning } from './study.ts';
import { loadLive } from './trusted.ts';

export function workspace(root:string,live?:{envelopeFile:string;trustAnchorFile:string;channelEnvelopeFile?:string}){
    mkdirSync(root,{recursive:true});const store=new StateStore(join(root,'operations.sqlite'));
    const bare=new OperatingManager({store,researchPorts:()=>({})});
    const cache=new Map<string,ReturnType<typeof offlineManager>>();
    const liveManager=live?loadLive(root,store,live.envelopeFile,live.trustAnchorFile,live.channelEnvelopeFile):null;
    const runtime=(id:string)=>{const b=bare.get(id);if(b.mode!=='offline')return {manager:liveManager??bare};if(!b.allowedUrls.length||b.allowedUrls.some(u=>u!==OFFLINE_URL))return {manager:bare};let r=cache.get(id);if(!r){r=offlineManager(root,store,[b]);cache.set(id,r);}return r;};
    const view=(id:string)=>liveManager&&bare.get(id).mode==='live'?liveManager.view(id):bare.view(id);
    return {root:resolve(root),store,bare,runtime,cache,view};
}
export function bootstrap(w:ReturnType<typeof workspace>){
    if(w.bare.list().length)return;
    const here=dirname(fileURLToPath(import.meta.url)),p=JSON.parse(readFileSync(join(here,'../venture/prepared.json'),'utf8'));
    const urls=p.sources?.filter((s:any)=>typeof s.url==='string'&&s.url.startsWith('https:')).map((s:any)=>s.url)??[];
    let b=w.bare.create({id:'midas-owned-venture',name:'Mason’s first owned venture',goal:'Investigate whether a small evidence-backed workflow diagnostic can solve a costly problem for an accessible buyer. Compare the existing website estimate-path hypothesis against the evidence; stop if no useful buyer problem or legitimate access route is supported.',mode:'live',allowedUrls:urls});
    b.claims=[{id:'founder-objective',kind:'source_assertion',text:p.founder.objective,sourceIds:['founder-direction'],contradicts:[],validUntil:null},{id:'founder-assets',kind:'source_assertion',text:'Confirmed assets: MIDAS, laptop, existing AI tools and willingness to learn. School commitments constrain availability; no network, industry expertise or new cash budget is confirmed.',sourceIds:['founder-reply'],contradicts:[],validUntil:null},{id:'venture-demand',kind:'unknown',text:'No customer interviews, demand, accepted work or revenue have been observed.',sourceIds:[],contradicts:[],validUntil:null}];
    b.sources=[{id:'founder-direction',url:'urn:midas:owner-record:executive-direction',title:'Mason’s governing business objective',text:p.founder.objective,sha256:hash(p.founder.objective),observedAt:p.provenance.createdAt,status:'available',provenance:'owner statement preserved by development assistant',rights:'owner-permitted business context',validUntil:null},{id:'founder-reply',url:'urn:midas:owner-record:resources',title:'Confirmed founder assets and material unknowns',text:JSON.stringify(p.founder),sha256:hash(p.founder),observedAt:p.provenance.createdAt,status:'available',provenance:'owner statements; assistant workload proposals are not confirmed availability',rights:'owner-permitted business context',validUntil:null}];
    b.bottlenecks=[{description:'Buyer access and willingness to pay remain unknown; a polished audit alone does not resolve either.',priority:1},{description:'MIDAS has no measured advantage on this business job; validate useful accepted work before creating specialists.',priority:2},{description:'Founder delivery and correction effort are unknown; record them during any approved pilot.',priority:3}];
    b.artifacts=[{id:'prepared-operating-packet',version:1,title:'MIDAS operating decision packet',buyer:'Mason, founder and decision maker',offer:'Use the first owned venture to measure whether MIDAS turns evidence into accepted work with manageable owner effort.',scope:['Implemented: persistent evidence, proposals, bounded worker dispatch, draft correction, exact outbox approval, reply feedback and procedure comparison mechanics.','Observed live: Astra support baseline retained; two single-worker synthetic workflows completed. No measured specialist advantage or business economics.','Unsupported: autonomous profitable venture creation, optimal teams, reliable cold acquisition, superior workers.','Ranked next work: acquire buyer evidence; measure accepted deliverable and owner effort; compare a justified procedure only after consequential failures.'],assumptions:['The website estimate-path concept remains reversible. A $149 price and Raleigh geography were earlier assumptions.'],sourceIds:['founder-direction','repository-checkpoint-029'],nextTest:'Approve one bounded investigation of the existing hypothesis; do not launch a venture or campaign from the prepared packet.',outreach:[],reviewStatus:'Prepared for owner review',provenance:'developer-authored'},...p.candidates.slice(0,3).map((c:any,i:number)=>({id:'prepared-candidate-'+(i+1),version:1,title:c.name,buyer:c.buyer,offer:c.offer,scope:[c.problem,c.acquisition,c.delivery],assumptions:c.assumptions,sourceIds:c.sourceIds,nextTest:c.validation,outreach:[],reviewStatus:'Historical provisional hypothesis; unvalidated',provenance:'developer-authored'}))];
    b.status='waiting';b.reason='Prepared founder workspace. Runtime model execution and communication remain disabled until a fresh signed grant.';b.nextAction='Review the operating packet and consolidated execution proposal';w.bare.save(b,'operating.prepared_workspace');
    w.store.transaction(()=>w.store.record(b.scope,'historical-prepared-package','developer-preparation',{hash:hash(p),provenance:p.provenance,founder:p.founder,notRuntimeOutput:true}));
}
export async function serveOperations(root:string,port=43130,live?:{envelopeFile:string;trustAnchorFile:string;channelEnvelopeFile?:string}){
    const w=workspace(root,live);bootstrap(w);const here=dirname(fileURLToPath(import.meta.url));
    const session=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),origin='http://127.0.0.1:'+port;
    let chain=Promise.resolve();const queued=new Set<string>();
    const response=(id?:string)=>({csrf,businesses:w.bare.list().map(b=>({id:b.id,name:b.name,goal:b.goal,status:b.status,mode:b.mode})),selected:id?w.view(id):w.bare.list()[0]?w.view(w.bare.list()[0].id):null});
    const server=createServer(async(req,res)=>{
        const send=(code:number,value:any,type='application/json')=>{res.writeHead(code,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'"});res.end(type==='application/json'?JSON.stringify(value):value);};
        try{
            requireThat(req.headers.host==='127.0.0.1:'+port,'HOST_DENIED');const u=new URL(req.url??'/',origin);
            if(req.method==='GET'&&u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
            if(req.method==='GET'&&['/','/ops.js','/ops.css'].includes(u.pathname)){if(u.pathname==='/')res.setHeader('set-cookie',`midas_ops=${session}; HttpOnly; SameSite=Strict; Path=/`);const file=u.pathname==='/'?'index.html':u.pathname==='/ops.js'?'app.js':'style.css';send(200,readFileSync(join(here,file)),file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':'text/css');return;}
            requireThat((req.headers.cookie??'').split(';').map(x=>x.trim()).includes('midas_ops='+session),'OWNER_SESSION_REQUIRED');
            if(req.method==='GET'&&u.pathname==='/api/operations'){send(200,response(u.searchParams.get('id')??undefined));return;}
            requireThat(req.method==='POST'&&u.pathname==='/api/operations','ROUTE_NOT_FOUND');requireThat(req.headers.origin===origin&&req.headers['x-csrf-token']===csrf,'CSRF_INVALID');
            let bytes=0,raw='';for await(const chunk of req){bytes+=chunk.length;requireThat(bytes<=100000,'REQUEST_TOO_LARGE');raw+=chunk.toString();}const body=JSON.parse(raw);let id=body.businessId as string;
            if(body.action==='create'){
                const demo=body.demonstration===true;
                const created=w.bare.create({name:demo?'Offline tool-library demonstration':body.name,goal:demo?'Investigate whether a tool-library operator needs a clearer stock-inquiry and collection process, and prepare a low-burden validation request.':body.goal,mode:body.mode,allowedUrls:demo?[OFFLINE_URL]:body.allowedUrls});id=created.id;
            }else{
                let runtime=w.runtime(id),m=runtime.manager;
                if(body.action==='run'&&body.goal&&body.goal!==m.get(id).goal){const prior=m.get(id);const created=w.bare.create({parentBusinessId:prior.id,name:prior.name+' — new assignment',goal:body.goal,mode:prior.mode,allowedUrls:prior.allowedUrls});id=created.id;runtime=w.runtime(id);m=runtime.manager;}
                const p=owner(id);
                if(body.action==='run'){
                    requireThat(m.models,'MODEL_DISABLED_UNTIL_GRANT');requireThat(!queued.has(id),'WORK_ALREADY_RUNNING');queued.add(id);
                    chain=chain.then(()=>m.run(p,id)).then(()=>undefined).catch(()=>undefined).finally(()=>queued.delete(id));
                }else if(['pause','resume','cancel'].includes(body.action))await m.control(p,id,body.action);
                else if(body.action==='approve')await m.approve(p,id,body.batchHash);
                else if(body.action==='dispatch')await m.dispatch(p,id,body.batchHash??m.get(id).approvedBatch?.batchHash);
                else if(body.action==='poll')await m.poll(p,id);
                else if(body.action==='followup')await m.followup(p,id,body.messageId);
                else if(body.action==='revise')await m.revise(p,id,body.artifactId,body.replacement);
                else if(body.action==='learning')await startLearning(m,p,id,body.sourceId);
                else if(body.action==='note')m.note(p,id,body.text);
                else if(body.action==='evidence')await m.evidence(p,id,body.title,body.text);
                else if(body.action==='simulate-reply'){
                    requireThat(m.get(id).mode==='offline'&&'transport'in runtime,'MOCK_ONLY');const row=m.view(id).outbox.find((r:any)=>r.status==='provider_accepted');requireThat(row,'NO_ACCEPTED_MOCK_MESSAGE');
                    const full=w.store.get('mail-outbox',scopeKey(m.get(id).scope)+'/'+row.id);
                    (runtime as ReturnType<typeof offlineManager>).transport.inject({id:'mock-inbound-'+randomUUID().slice(0,12),threadId:full.threadId,messageId:'mock-reply-'+randomUUID(),from:full.recipient,to:[full.sender],receivedAt:new Date().toISOString(),kind:'reply',text:'OFFLINE INJECTED REPLY: This is not a current problem. Please do not contact us again.',inReplyTo:full.messageId});await m.poll(p,id);
                }else throw Object.assign(Error('INVALID_ACTION'),{code:'INVALID_ACTION'});
            }
            send(200,{...response(id),businessId:id});
        }catch(e){send(400,{error:(e as any).code??'INVALID_REQUEST',message:(e as any).code??'The request could not be completed. Inspect the persisted state.'});}
    });
    // The live supervisor is opt-in through the signed channel configuration. It runs
    // only while this local process is alive and all activity consumes the channel cap.
    const poller=live?.channelEnvelopeFile?setInterval(()=>{for(const b of w.bare.list().filter(b=>b.mode==='live'&&b.phase==='monitor'&&b.status==='waiting')){
        if(queued.has(b.id))continue;queued.add(b.id);chain=chain.then(async()=>{const m=w.runtime(b.id).manager;await m.poll(owner(b.id),b.id);}).catch((e)=>{const current=w.bare.get(b.id);current.status='blocked';current.reason=(e as any).code??'MAIL_POLL_FAILED';current.nextAction='Inspect the retained channel observation before further activity';w.bare.save(current,'operating.channel_blocked');}).finally(()=>queued.delete(b.id));
    }},60000):null;
    await new Promise<void>((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});
    writeFileSync(join(root,'server.json'),JSON.stringify({pid:process.pid,port,root:resolve(root),startedAt:new Date().toISOString(),mode:'offline-preparation-default'},null,2));
    return {server,workspace:w,url:origin,close:()=>new Promise<void>(r=>{if(poller)clearInterval(poller);server.close(()=>{w.store.close();r();});})};
}
