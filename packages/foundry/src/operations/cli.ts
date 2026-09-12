import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { workspace,bootstrap,serveOperations } from './server.ts';
import { owner } from './manager.ts';
import { OFFLINE_URL,offlineManager } from './offline.ts';
import { scopeKey,requireThat,hash } from '../contracts.ts';
import { startLearning,recordImprovementCase } from './study.ts';
import { prepareLive,loadLive } from './trusted.ts';
import { prepareAstra,prepareGmailTest } from './launch.ts';
const args=process.argv.slice(2),command=args[0];
const option=(name:string,fallback='')=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:fallback;};
const root=resolve(option('root','var/operating-workbench-030'));
async function main(){
    if(command==='serve'){const live=option('live-grant')?{envelopeFile:resolve(option('live-grant')),trustAnchorFile:resolve(option('trust-anchor')),channelEnvelopeFile:option('channel-grant')?resolve(option('channel-grant')):undefined}:undefined;const app=await serveOperations(root,Number(option('port','43130')),live);console.log(JSON.stringify({url:app.url,root,mode:live?'live grant loaded; exact effects separately gated':'offline-preparation; live disabled unless explicitly configured'}));return;}
    const w=workspace(root);try{
        if(command==='prepare'){bootstrap(w);console.log(JSON.stringify({root,businesses:w.bare.list().map(b=>({id:b.id,name:b.name})),providerCalls:0}));return;}
        if(command==='prepare-astra'){console.log(JSON.stringify(prepareAstra(root,w.bare)));return;}
        if(command==='prepare-gmail-test'){console.log(JSON.stringify(prepareGmailTest(root,w.bare,option('sender'),option('recipients').split(','))));return;}
        if(command==='demo'){
            const b=w.bare.create({id:'demo-'+randomUUID().slice(0,12),name:'Offline tool-library operating test',goal:'Investigate tool-library stock and collection information and prepare a useful validation request.',mode:'offline',allowedUrls:[OFFLINE_URL],configuration:option('configuration','single') as any});
            const rt=offlineManager(root,w.store,[b]),p=owner(b.id);const ready=await rt.manager.run(p,b.id);const exact=ready.approvals[0].batchHash;
            await rt.manager.approve(p,b.id,exact);rt.transport.fault='lose-response';await rt.manager.dispatch(p,b.id,exact);await rt.manager.poll(p,b.id);
            const row=w.store.get('mail-outbox',scopeKey(b.scope)+'/'+rt.manager.get(b.id).outboxIds[0]);
            rt.transport.inject({id:'mock-reply-'+b.id,threadId:row.threadId,messageId:'mock-message-'+b.id,from:row.recipient,to:[row.sender],receivedAt:new Date().toISOString(),kind:'reply',text:'INJECTED OFFLINE NEGATIVE: This is not a problem for us; do not contact us again.',inReplyTo:row.messageId});await rt.manager.poll(p,b.id);
            const study=await startLearning(rt.manager,p,b.id,rt.manager.get(b.id).sources[0].id);
            const report={kind:'offline-completion',provenance:'scripted transport and test-controller approval; not Mason approval or model competence',business:rt.manager.view(b.id),study:study.report.analysis,providerCalls:0,externalMessages:0};
            mkdirSync(join(root,'reports'),{recursive:true});writeFileSync(join(root,'reports',b.id+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id:b.id,phase:report.business.phase,mockEffects:report.business.outbox.length,providerCalls:0,study:report.study,report:join(root,'reports',b.id+'.json')}));return;
        }
        const id=option('business','midas-owned-venture');
        if(command==='prepare-live'){console.log(JSON.stringify(prepareLive(root,w.bare.get(id))));return;}
        if(command==='record-improvement-case'){console.log(JSON.stringify(recordImprovementCase(w.bare,owner(id),id,JSON.parse(readFileSync(resolve(option('evidence')),'utf8')))));return;}
        // Historical reports remain readable after an implementation change. Reading
        // state must not construct or replace a model account or enter credentials.
        if(command==='status'||command==='report'){const report=w.bare.view(id);if(command==='report'){mkdirSync(join(root,'reports'),{recursive:true});writeFileSync(join(root,'reports',id+'.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));return;}
        let m=w.runtime(id).manager;
        if(option('live-grant'))m=loadLive(root,w.store,resolve(option('live-grant')),resolve(option('trust-anchor')),option('channel-grant')?resolve(option('channel-grant')):undefined);
        if(command==='preflight'){
            requireThat(m.models,'MODEL_DISABLED_UNTIL_GRANT');const g=m.models.grant,b=m.get(id),permitted=g.businesses.find(x=>x.id===id);
            requireThat(Date.parse(g.expiresAt)>Date.now(),'OPERATING_GRANT_EXPIRED');requireThat(permitted?.goalHash===hash(b.goal),'OPERATING_BUSINESS_NOT_GRANTED');
            const required=Math.ceil((g.route.inputTokenCeiling*g.route.pricing.inputMinorPerMillion+g.route.maxOutputTokens*g.route.pricing.outputMinorPerMillion)/1000000);
            requireThat(required<=g.route.maxCallCost.minorUnits,'OPERATING_RESERVATION_TOO_SMALL');
            console.log(JSON.stringify({status:'local grant verified; provider/account access untested',business:id,route:g.route,requiredMinor:required,totals:m.models.totals(),communicationConfigured:Boolean(m.communication),credentialRead:false,providerRequests:0}));return;
        }
        if(command==='reconcile'){
            requireThat(m.models?.grant.mode==='live'&&m.models.grant.billingPublicKey,'BILLING_AUTHORITY_REQUIRED');
            requireThat(option('statement'),'BILLING_STATEMENT_REQUIRED');
            m.models.ledger.reconcile(JSON.parse(readFileSync(resolve(option('statement')),'utf8')),m.models.grant.billingPublicKey,m.models.grant.projectId);
            console.log(JSON.stringify({recorded:true,totals:m.models.totals(),providerRequests:0}));return;
        }
        const p=owner(id);
        if(command==='run'||command==='resume')console.log(JSON.stringify(await m.run(p,id)));
        else if(command==='approve')console.log(JSON.stringify(await m.approve(p,id,option('hash'))));
        else if(command==='dispatch')console.log(JSON.stringify(await m.dispatch(p,id,option('hash'))));
        else if(command==='poll')console.log(JSON.stringify(await m.poll(p,id)));
        else if(command==='learn')console.log(JSON.stringify(await startLearning(m,p,id,option('source'))));
        else if(command==='pause'||command==='cancel')console.log(JSON.stringify(await m.control(p,id,command)));
        else throw Error('Use prepare | serve | demo | prepare-live | preflight | run | approve --hash | dispatch --hash | poll | learn --source | status | report | reconcile --statement. Live commands also require --live-grant and --trust-anchor; channel actions require --channel-grant.');
    }finally{w.store.close();}
}
main().catch(e=>{console.error(JSON.stringify({error:e.code??'OPERATIONS_COMMAND_FAILED',message:e.code??e.message}));process.exitCode=1;});
