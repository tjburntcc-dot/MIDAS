import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script,createContext} from 'node:vm';
import {reviewHTML} from '../../tools/build-review-session.mjs';

const sample=()=>({reviewer:'SYNTHETIC_REVIEWER',packetHash:'packet',authorizationHash:'grant',rubricHash:'rubric',rubric:{notice:'synthetic test only'},items:[{attemptId:'TEST_ONLY',attemptHash:'output-hash',input:{text:'</script><script>UNTRUSTED()</script>'},output:{response:'synthetic'},errorCode:null}]});
function page(){
 const html=reviewHTML(sample()),data=html.match(/<script type="application\/json" id="packet">([\s\S]*?)<\/script>/)![1],code=html.match(/<script>\n([\s\S]*?)<\/script>/)![1];
 const elements=new Map<string,any>();
 class Element{tag:string;value='';textContent='';children:any[]=[];checked=false;disabled=false;hidden=false;onclick:any;name='';constructor(tag='div'){this.tag=tag;}set id(v:string){this.name=v;elements.set(v,this);}get id(){return this.name;}append(x:any){this.children.push(x);}click(){this.onclick?.();}}
 const document={getElementById(id:string){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement(tag:string){return new Element(tag);},querySelectorAll(tag:string){return [...elements.values()].filter(x=>x.tag===tag);}};
 document.getElementById('packet').textContent=data;
 for(const id of ['reviewMethod','accepted','critical','unnecessary']){const e=new Element('select');e.id=id;}
 for(const id of ['reason','correction']){const e=new Element('textarea');e.id=id;}
 let tick=100,download:any=null;
 class FakeBlob{parts:any;constructor(parts:any){this.parts=parts;download=JSON.parse(parts.join(''));}}
 const context=createContext({document,performance:{now:()=>tick},Date,Blob:FakeBlob,URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},setTimeout:()=>0});new Script(code).runInContext(context);
 const score=()=>{document.getElementById('reviewMethod').value='manual-unassisted';for(const key of ['correctness','evidenceSupport','uncertainty','escalation','prohibitedPromises'])document.getElementById('dim-'+key).value='true';document.getElementById('accepted').value='true';document.getElementById('critical').value='false';document.getElementById('unnecessary').value='false';document.getElementById('reason').value='Synthetic evidence-based review for test only.';};
 return {html,data,document,score,advance:()=>{tick+=12000;},download:()=>download};
}
test('review page escapes source text, uses no external resource, and requires manual scores before exporting measured observations',()=>{
 const p=page();assert.ok(!p.data.includes('</script>'));assert.equal(JSON.parse(p.data).items[0].input.text,sample().items[0].input.text);assert.ok(p.html.includes("connect-src 'none'"));assert.ok(!/\bfetch\(/.test(p.html));
 p.document.getElementById('start').click();p.document.getElementById('finish').click();assert.match(p.document.getElementById('error').textContent,/Score every/);assert.equal(p.document.getElementById('export').disabled,true);
 p.score();p.advance();p.document.getElementById('finish').click();p.document.getElementById('export').click();const out=p.download();assert.equal(out.reviews.length,1);assert.equal(out.reviews[0].attemptId,'TEST_ONLY');assert.equal(out.reviews[0].measuredElapsedMs,12000);assert.equal(out.reviews[0].measurementSource,'observed-stopwatch');assert.ok(out.reviews[0].correctionStartedAt);assert.equal(out.signature,undefined);
});
test('interrupted review exports missing timing rather than fabricated correction effort',()=>{
 const p=page();p.document.getElementById('start').click();p.score();p.document.getElementById('interrupted').checked=true;p.document.getElementById('finish').click();p.document.getElementById('export').click();const r=p.download().reviews[0];assert.equal(r.measurementSource,'missing-interrupted');assert.equal(r.correctionStartedAt,null);assert.equal(r.measuredElapsedMs,null);
});

test('AI assistance excludes timing without requiring the interruption checkbox and preserves raw timing',()=>{
 const p=page();p.document.getElementById('start').click();p.score();p.document.getElementById('reviewMethod').value='ai-assisted';p.advance();p.document.getElementById('finish').click();p.document.getElementById('export').click();const out=p.download(),r=out.reviews[0];assert.equal(r.kind,'assisted-calibration-review');assert.equal(r.aiAssisted,true);assert.equal(r.independentValidation,false);assert.equal(r.independentHumanTimingEligible,false);assert.equal(r.measurementSource,'ai-assisted-excluded');assert.equal(r.measuredElapsedMs,null);assert.equal(r.correctionStartedAt,null);assert.equal(r.correctionFinishedAt,null);assert.equal(r.rawTiming.elapsedMs,12000);assert.ok(r.rawTiming.startedAt);assert.equal(r.interrupted,false);assert.ok(!out.attestation.includes('No model generated'));
});
test('review method must be explicitly declared before export',()=>{
 const p=page();p.document.getElementById('start').click();p.score();p.document.getElementById('reviewMethod').value='';p.document.getElementById('finish').click();assert.match(p.document.getElementById('error').textContent,/Complete all verdict/);assert.equal(p.document.getElementById('export').disabled,true);
});
