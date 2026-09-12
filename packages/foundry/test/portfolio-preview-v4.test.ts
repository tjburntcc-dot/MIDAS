import test from 'node:test';
import assert from 'node:assert/strict';
import {browserModule, InteractivePreviewSessions, renderRemotePreview} from '../src/portfolio/preview.ts';
import {checkProductV2} from '../src/portfolio/product-check-v2.ts';
import {quoteProductV2Example} from '../src/portfolio/quote-product-v2-example.ts';

const binding={ventureId:'reference-app',taskId:'developer-fixture',manifestHash:'a'.repeat(64)};
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/7cE6hQAAAABJRU5ErkJggg==';
const waitFor=async(predicate:()=>boolean,wait:(ms:number)=>Promise<void>,message:string)=>{
 const end=Date.now()+5000;
 while(Date.now()<end){if(predicate())return;await wait(20);}
 assert.fail(message);
};

test('remote preview queues rapid ordinary keyboard input while delayed image actions are pending', {timeout:30000}, async()=>{
 const {chromium}=await browserModule();const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext();const page=await context.newPage();const actions:any[]=[];const unexpected:string[]=[];const errors:string[]=[];
 page.on('pageerror',(error:Error)=>errors.push(error.message));
 const html=renderRemotePreview({...binding,openEndpoint:'/preview/open',actionEndpoint:'/preview/action'});
 try{
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!=='http://preview.local'){unexpected.push(request.url());await route.abort('blockedbyclient');return;}
   if(request.method()==='GET'&&url.pathname==='/'){await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});return;}
   if(request.method()==='POST'&&(url.pathname==='/preview/open'||url.pathname==='/preview/action')){
    const body=JSON.parse(request.postData()||'{}');if(url.pathname==='/preview/action')actions.push(body);
    await new Promise(resolve=>setTimeout(resolve,url.pathname==='/preview/open'?35:55));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({sessionId:'local-session',image:{mimeType:'image/png',data:pixel}})});return;
   }
   unexpected.push(request.url());await route.abort('blockedbyclient');
  });
  await page.goto('http://preview.local/');await page.locator('#status').getByText('Product ready').waitFor();
  const phrase='rapid input';await page.locator('#product').focus();await page.keyboard.type(phrase);
  await waitFor(()=>actions.filter(action=>action.kind==='type').length===phrase.length,ms=>page.waitForTimeout(ms),'queued key actions did not finish');
  const typed=actions.filter(action=>action.kind==='type').map(action=>action.text).join('');
  assert.equal(typed,phrase,'every ordinary key must reach the queued preview action in order');
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();}
});

test('trusted V2 checker identifies hidden narrow controls and static feedback in the developer reference fixture', {timeout:60000}, async()=>{
 const hidden=quoteProductV2Example();hidden[0]={...hidden[0],content:hidden[0].content+'<style>@media(max-width:400px){form,button,input,select,textarea{display:none!important}}</style>'};
 const narrow=await checkProductV2({...binding,files:hidden});
 assert.equal(narrow.find(check=>check.id==='software.responsive')?.passed,false,JSON.stringify(narrow));
 const staticNotice=quoteProductV2Example();staticNotice[0]={...staticNotice[0],content:staticNotice[0].content.replace("$('notice').textContent=message","$('notice').textContent='functionnop'")};
 const feedback=await checkProductV2({...binding,files:staticNotice});
 assert.equal(feedback.find(check=>check.id==='software.invalid-input')?.passed,false,JSON.stringify(feedback));
 assert.equal(feedback.find(check=>check.id==='software.feedback')?.passed,false,JSON.stringify(feedback));
});

test('managed V2 preview denies native external form submission and service-worker registration without changing author state', {timeout:30000}, async()=>{
 let stateCalls=0;const initial={schemaVersion:1 as const,quotes:[]};
 const source=`<h1>Developer reference fixture</h1><form id="outside" action="https://outside.invalid/submit" method="post"><input name="customer" value="not-authorized"><button id="submit" type="submit">Send externally</button></form><script>navigator.serviceWorker.register('/worker.js').catch(()=>document.documentElement.dataset.worker='denied');setTimeout(()=>document.querySelector('#outside').requestSubmit(),30)</script>`;
 const sessions=new InteractivePreviewSessions();
 try{
  const opened=await sessions.open({...binding,files:[{path:'app.html',content:source}],executionProfile:'quote-to-job-v2',stateHandler:()=>{stateCalls++;return {version:0,state:structuredClone(initial)};}});
  await new Promise(resolve=>setTimeout(resolve,500));const observed=await sessions.screenshot(opened.sessionId);
  assert.equal(stateCalls,0,'the authored page has no authority to write owner state without the bounded bridge');
  assert.deepEqual(sessions.binding(opened.sessionId),binding,'the preview session keeps its exact venture/task/manifest binding');
  // CSP stops both attempted capabilities before a request leaves the opaque
  // frame. If that guard regresses, the managed context's route records the
  // denied request instead, which also fails this no-egress assertion.
  assert.equal(observed.blockedRequests,0,'native form and worker attempts must not create a request outside the local preview');
  assert.deepEqual(initial,{schemaVersion:1,quotes:[]});
 }finally{await sessions.closeAll();}
});
