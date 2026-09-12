import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { OperatingManager,owner } from '../src/operations/manager.ts';
import { offlineManager,fixtureTransport,OFFLINE_URL } from '../src/operations/offline.ts';
import { scopeKey,hash } from '../src/contracts.ts';
import { startLearning } from '../src/operations/study.ts';

function setup(configuration:'single'|'owner-reviewer'='single'){
    const root=mkdtempSync(join(tmpdir(),'midas-operations-')),path=join(root,'operations.sqlite'),store=new StateStore(path);
    const bare=new OperatingManager({store,researchPorts:()=>({})});
    const b=bare.create({id:'fresh-tool-library',name:'New owner business',goal:'Investigate tool-library stock and pickup communication before proposing a small paid process-mapping service.',mode:'offline',allowedUrls:[OFFLINE_URL],configuration});
    const captured:any[]=[];const rt=offlineManager(root,store,[b],{transport:fixtureTransport({onRequest:x=>captured.push(x)})});
    return {root,path,store,b,captured,...rt};
}
test('fresh goal -> acquired sources -> proposed work -> corrected artifact -> exact approval -> one durable effect -> negative reply -> business feedback',async()=>{
    const h=setup();try{
        const p=owner(h.b.id),v=await h.manager.run(p,h.b.id);
        assert.equal(v.phase,'approval');assert.equal(v.sources.length,1);assert.equal(v.artifacts.length,2);assert.notDeepEqual(v.artifacts[0].scope,v.artifacts[1].scope);assert.equal(v.accounting.callsUsed,3);assert.equal(v.accounting.providerRequests,0);
        assert.equal(v.team.configuration,'single');assert.equal(v.team.workers.length,1);assert.equal(v.approvals.length,1);
        assert.ok(h.captured.filter(x=>x.instructions).every(x=>!x.input.includes('expectedAnswer')&&!x.input.includes('answerKey')));
        await assert.rejects(h.manager.dispatch(p,h.b.id,'wrong'),/APPROVAL|BATCH/);
        const batch=v.approvals[0].batchHash;await h.manager.approve(p,h.b.id,batch);
        h.transport.fault='lose-response';await h.manager.dispatch(p,h.b.id,batch);
        assert.equal(h.manager.view(h.b.id).pendingUnknown,1);
        h.store.close();const store=new StateStore(h.path),rt=offlineManager(h.root,store,[h.b]);
        try{
            await rt.manager.poll(p,h.b.id);const after=rt.manager.view(h.b.id);assert.equal(after.pendingUnknown,0);assert.equal(after.outbox[0].status,'provider_accepted');
            const row=store.get('mail-outbox',scopeKey(h.b.scope)+'/'+after.outbox[0].id);
            rt.transport.inject({id:'negative-reply',threadId:row.threadId,messageId:'reply-1',from:row.recipient,to:[row.sender],receivedAt:new Date().toISOString(),kind:'reply',text:'No, this does not solve a problem for us. Do not contact us again.',inReplyTo:row.messageId});
            await rt.manager.poll(p,h.b.id);const end=rt.manager.view(h.b.id);assert.equal(end.outbox[0].status,'replied');assert.ok(end.observations.some((o:any)=>o.disposition==='opt_out'));assert.equal(end.accounting.revenue,null);assert.equal(end.accounting.humanSeconds,null);
            await assert.rejects(rt.manager.followup(p,h.b.id,row.id),/SUPPRESSED|FOLLOW_UP_BLOCKED/);
            const count=store.db.prepare("SELECT count(*) AS n FROM entities WHERE kind='mock-mail-provider'").get()!.n;assert.equal(count,1);
            const before=end.observations.length;await rt.manager.poll(p,h.b.id);assert.equal(rt.manager.view(h.b.id).observations.length,before);
            assert.equal(rt.models.totals().callsUsed,3);
        }finally{store.close();}
    }finally{try{h.store.close();}catch{}}
});
test('persisted model response recovers without another count or inference',async()=>{
    const h=setup();try{
        let once=true;h.models.afterResponsePersisted=()=>{if(once){once=false;throw Error('PROCESS_FAULT_AFTER_RESPONSE');}};
        await assert.rejects(h.manager.run(owner(h.b.id),h.b.id));assert.equal(h.models.totals().callsUsed,1);
        h.models.afterResponsePersisted=undefined;await h.manager.run(owner(h.b.id),h.b.id);assert.equal(h.models.totals().callsUsed,3);
    }finally{h.store.close();}
});
test('uncertain model completion retains reservation and forbids duplicate request',async()=>{
    const h=setup();try{
        const bad=offlineManager(h.root,h.store,[h.b],{transport:fixtureTransport({failInference:true})});
        await assert.rejects(bad.manager.run(owner(h.b.id),h.b.id));const spent=bad.models.totals();assert.equal(spent.callsUsed,1);assert.ok(spent.retainedMinor>=52);
        await assert.rejects(bad.manager.run(owner(h.b.id),h.b.id));assert.equal(bad.models.totals().callsUsed,1);
    }finally{h.store.close();}
});
test('owner recommendation revision invalidates prior exact grant and propagates whole artifact',async()=>{
    const h=setup();try{const p=owner(h.b.id),v=await h.manager.run(p,h.b.id),batch=v.approvals[0].batchHash;await h.manager.approve(p,h.b.id,batch);const d=structuredClone(v.draft);d.offer='Request evidence only; no paid-service offer yet.';d.outreach[0].body='Is there any current stock-information problem? We have no evidence that there is.';
        await h.manager.revise(p,h.b.id,v.artifacts.at(-1).id,d);assert.equal(h.manager.get(h.b.id).draft.offer,d.offer);await assert.rejects(h.manager.dispatch(p,h.b.id,batch));assert.equal(h.store.db.prepare("SELECT count(*) AS n FROM entities WHERE kind='mock-mail-provider'").get()!.n,0);
    }finally{h.store.close();}
});
test('shared account enforces business allocation and isolates both worker contexts',async()=>{
    const h=setup();try{const second=h.manager.create({id:'other-business',name:'Other owner task',goal:'Assess a different operating problem.',mode:'offline',allowedUrls:[OFFLINE_URL]});const seen:any[]=[];const rt=offlineManager(h.root,h.store,[h.b,second],{maxCalls:2,transport:fixtureTransport({onRequest:x=>seen.push(x)})});await assert.rejects(rt.manager.run(owner(h.b.id),h.b.id),/BUSINESS_CALL_CAP|ALLOCATION_ATTEMPT_CAP/);assert.equal(rt.models.totals().callsUsed,2);assert.ok(seen.every(x=>!String(x.input).includes(second.goal)));await assert.rejects(rt.manager.run(owner(second.id),second.id));assert.equal(rt.models.totals().callsUsed,4);assert.equal(rt.models.ledger.rows().filter(x=>x.metadata.businessId===second.id).length,2);
    }finally{h.store.close();}
});

test('owner source revisions preserve provenance and invalidate the exact unpublished artifact; notes never settle economics',async()=>{
    const h=setup();try{const p=owner(h.b.id),v=await h.manager.run(p,h.b.id),batch=v.approvals[0].batchHash;await h.manager.approve(p,h.b.id,batch);
        await h.manager.evidence(p,h.b.id,'Controlled test participant','Owner statement: review@example.test is my controlled test inbox. This is not market evidence.');
        const changed=h.manager.view(h.b.id);assert.equal(changed.approvedBatch,null);assert.equal(changed.phase,'review');assert.match(changed.sources.at(-1).provenance,/owner-supplied/);assert.match(changed.sources.at(-1).url,/urn:midas:owner-record/);
        await assert.rejects(h.manager.dispatch(p,h.b.id,batch));const note=h.manager.note(p,h.b.id,'An outside conversation may be useful; unverified owner note.');assert.equal(note.accounting.revenue,null);assert.equal(note.accounting.humanSeconds,null);assert.equal(note.accounting.callsUsed,3);
        // Owner-private context is not a public reusable-procedure source. Reject it
        // before entering the model, even when a work phase would otherwise permit study.
        const ready=h.manager.get(h.b.id);ready.phase='closed';h.manager.save(ready,'test.closed');await assert.rejects(startLearning(h.manager,p,h.b.id,changed.sources.at(-1).id),/PUBLIC_PROCEDURE_SOURCE_REQUIRED/);assert.equal(h.models.totals().callsUsed,3);
    }finally{h.store.close();}
});

test('no supported source lesson retains baseline without purchasing any comparison cells',async()=>{
    const h=setup();try{const p=owner(h.b.id),v=await h.manager.run(p,h.b.id);const rt=offlineManager(h.root,h.store,[h.b],{transport:fixtureTransport({outputs:[{decision:'retain_baseline',reason:'The source does not support a reusable improvement beyond the strong baseline.',lesson:null}]})});const result=await startLearning(rt.manager,p,h.b.id,v.sources[0].id);assert.equal(result.candidate,null);assert.equal(rt.models.totals().callsUsed,4);assert.equal(rt.models.ledger.rows().filter(r=>r.metadata.stage==='procedure-comparison').length,0);await startLearning(rt.manager,p,h.b.id,v.sources[0].id);assert.equal(rt.models.totals().callsUsed,4);
    }finally{h.store.close();}
});
