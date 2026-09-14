import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PilotService } from '../src/pilot/service.ts';
import { servePilot } from '../src/pilot/server.ts';
import { launchCheckBrowser } from '../src/portfolio/preview.ts';

/** Real DOM + HTTP + SQLite, with all non-local browser traffic denied. No model transport. */
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pilot-ui-'));
  const publicReader={kind:'mock' as const,ports:{dnsLookup:async()=>[{address:'93.184.216.34'}],fetch:async(url:string)=>({status:200,headers:{get:(name:string)=>name==='content-type'?(url.endsWith('/robots.txt')?'text/plain':'text/html'):null},arrayBuffer:async()=>new TextEncoder().encode(url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<html><title>Explicit development fixture</title><main><h1>Test offer</h1><p>Development browser verification content; a human confirms feasibility before prices or bookings.</p><a href="/policy">Policy</a></main></html>').buffer})}};
  const service = new PilotService(root,{publicReader} as any), server = servePilot({ service, port: 0 }), origin = await server.ready;
  const browser = await launchCheckBrowser(), context = await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  const external: string[] = [], errors: string[] = [];
  await context.route('**/*', (route: any) => { const url = route.request().url(); if (new URL(url).origin !== origin) { external.push(url); return route.abort(); } return route.continue(); });
  const page = await context.newPage();page.setDefaultTimeout(10000); page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(origin); await page.getByRole('heading',{name:'Investigate your business'}).waitFor();
  return {root,service,origin,page,context,errors,external,async close(){await browser.close(); await server.close();service.store.close();}};
}
const dialog = (page: any) => page.getByRole('dialog');
async function navigate(page: any, name: string) { if (await page.getByRole('button',{name:'Open navigation',exact:true}).isVisible()) await page.getByRole('button',{name:'Open navigation',exact:true}).click(); await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:new RegExp('^'+name)}).click(); }
async function noOverflow(page: any) { assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true); }

test('owner desk supports real onboarding, retained uploads, worker selection, honest authorization and mobile persistence',async()=>{
  const f=await fixture(),{page}=f;
  try {
    assert.equal(f.service.view().business,null);
    await page.screenshot({path:join(f.root,'onboarding-desktop.png'),fullPage:true,animations:'disabled'});
    await page.getByText('Add a name or helpful context',{exact:false}).click();
    await page.getByLabel('Business name',{exact:true}).fill('Browser verification company — development test');
    await page.getByLabel('Business website',{exact:true}).fill('https://example.test');
    await page.getByLabel('What would make this useful?').fill('Prepare a readable inquiry response grounded in owner policies.');
    await page.getByLabel('What should we know?').fill('Development assistant verification data; no owner or customer acceptance is represented.');
    await page.getByRole('button',{name:'Start business investigation'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    assert.equal(f.service.view(id).business.mode,'owner');await f.service.settle();await page.reload();await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    await page.getByRole('button',{name:'Investigation details',exact:true}).click();
    const publicSource=f.service.view(id).sources.find((s:any)=>s.origin?.kind==='public-retrieval');assert.ok(publicSource);
    await dialog(page).locator(`button[data-action="source"][data-id="${publicSource.id}"]`).click();
    assert.equal(await dialog(page).locator('.source-text').innerText(),publicSource.text);
    await dialog(page).getByText('development-authored public-page fixture; no live source observed',{exact:true}).waitFor();
    assert.equal(await dialog(page).getByRole('link',{name:'Open public source'}).getAttribute('href'),publicSource.origin.url);
    await dialog(page).getByRole('button',{name:'Render public page',exact:true}).click();
    await dialog(page).locator('.retained-source-image').waitFor({timeout:30000});
    assert.equal(await dialog(page).locator('.retained-source-image').evaluate((img:HTMLImageElement)=>img.naturalWidth>0),true);
    await dialog(page).getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await dialog(page).getByLabel('Business name',{exact:true}).fill('Browser verification company — updated');
    await dialog(page).getByRole('button',{name:'Save context update'}).click();await dialog(page).waitFor({state:'hidden'});
    await page.getByRole('button',{name:'+ Add context'}).click();
    await dialog(page).locator('#source-file').setInputFiles({name:'unsupported.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF fake unsupported fixture')});
    assert.match(await dialog(page).getByRole('alert').textContent(),/not supported/);
    await dialog(page).locator('#source-file').setInputFiles({name:'permitted-policy.md',mimeType:'text/markdown',buffer:Buffer.from('# Local policy\nA human confirms feasibility before prices or bookings. Development test only.')});
    await dialog(page).getByRole('checkbox').check();
    await dialog(page).getByRole('button',{name:'Retain this source'}).click();
    await page.getByRole('button',{name:'+ Add context'}).click();
    await dialog(page).getByRole('button',{name:'Add a social screenshot'}).click();
    await dialog(page).locator('#screenshot-file').setInputFiles({name:'development-verification.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a91kAAAAASUVORK5CYII=','base64')});
    await dialog(page).locator('#screenshot-preview').waitFor();
    await dialog(page).getByLabel('Your caption or exact visible excerpt').fill('Development browser image-upload fixture only. No business insight, image-model judgment, or customer evidence is represented.');
    await dialog(page).getByRole('checkbox').check();
    await dialog(page).getByRole('button',{name:'Retain screenshot and caption'}).click();
    await dialog(page).waitFor({state:'hidden'});
    const screenshotSource=f.service.view(id).sources.find((s:any)=>s.title==='development-verification.png');assert.ok(screenshotSource);
    await page.getByRole('button',{name:'All evidence',exact:true}).click();
    const sources=f.service.view(id).sources;
    for(const source of sources) await dialog(page).locator(`input[value="${source.id}"]`).setChecked(source.title==='permitted-policy.md');
    await dialog(page).getByRole('button',{name:'Save worker selection'}).click();
    await navigate(page,'Intelligence');await page.getByRole('button',{name:/Prepare (analysis request|labeled analysis)/}).click();
    await page.getByText('Analysis request prepared. No unauthorized model call was made.',{exact:true}).waitFor();
    assert.equal(f.service.view(id).sources.filter((s:any)=>s.selected).length,1);
    assert.equal(f.service.view(id).understanding.claims.length,0);
    await navigate(page,'Work');await page.locator('button[data-action="plan"]').first().click();
    await dialog(page).getByRole('button',{name:'Prepare assignment',exact:true}).click();
    await page.getByRole('heading',{name:'Work with a clear finish.'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Run task',exact:true}).isDisabled(),true);
    const download=page.waitForEvent('download'); await page.getByRole('link',{name:'Export draft execution request'}).click();
    assert.match((await download).suggestedFilename(),/unsigned/);
    await page.setViewportSize({width:390,height:844});await noOverflow(page);
    await navigate(page,'Overview');await page.screenshot({path:join(f.root,'owner-mobile.png'),fullPage:true,animations:'disabled'});
    await page.reload();await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('midas-pilot-business')),id);
    await navigate(page,'Results');assert.equal(await page.getByText('Not measured',{exact:true}).count()>0,true);await noOverflow(page);
    assert.equal(f.service.view(id).accounting.providerCalls,0);assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);
  }finally{await f.close();}
});

test('demo desk completes pause/resume, actual packet review, literal correction, disclosed observation and learning',async()=>{
  const f=await fixture(),{page}=f;
  try {
    await page.locator('[data-action="navigate"][data-page="archive"]').click();await page.getByRole('button',{name:'Explore service business demo'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    await navigate(page,'Intelligence');assert.equal(f.service.view(id).intelligence.status,'proposal_ready');
    await navigate(page,'Work');await page.locator('button[data-action="plan"]').first().click();
    await dialog(page).getByRole('button',{name:'Prepare assignment',exact:true}).click();
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    await page.getByRole('button',{name:'Resume',exact:true}).click();
    await page.getByRole('button',{name:'Review deliverable',exact:true}).waitFor({timeout:30000});
    const original=f.service.view(id).tasks.find((t:any)=>t.status==='completed');assert.ok(original);
    await page.getByRole('button',{name:'Review deliverable',exact:true}).click();
    await dialog(page).getByRole('button',{name:'Start review timer'}).waitFor();
    assert.equal(await dialog(page).locator('.check-summary').getAttribute('open'),null);
    assert.equal(await dialog(page).getByText('Ready for handoff',{exact:true}).isVisible(),false);
    await dialog(page).locator('.check-summary summary').click();
    await dialog(page).getByText('Readable report',{exact:true}).waitFor();
    await dialog(page).getByText('Sources match',{exact:true}).waitFor();
    await dialog(page).locator('.check-summary summary').click();
    await page.screenshot({path:join(f.root,'final-review-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});await noOverflow(page);
    await page.screenshot({path:join(f.root,'final-review-mobile.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:1440,height:1050});
    const previewPromise=page.waitForEvent('popup');await dialog(page).getByRole('link',{name:'Open deliverable'}).click();
    const preview=await previewPromise;await preview.waitForLoadState();assert.match(await preview.locator('body').innerText(),/Harbor|inquiry/i);await preview.close();
    await dialog(page).getByRole('button',{name:'Start review timer'}).click();
    await dialog(page).getByText('Timing active',{exact:true}).waitFor();
    await dialog(page).getByLabel('I used AI or another person’s help during this review.').check();
    await dialog(page).getByLabel('Use this replacement wording').fill('Development browser verification: prepare the item description and dimensions before requesting a human inspection.');
    await dialog(page).getByRole('button',{name:'Apply replacement · demo'}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.work-row')].some(e=>e.textContent?.includes('Revise:')&&e.textContent?.includes('completed')),{},{timeout:30000});
    const corrected=f.service.view(id).tasks.find((t:any)=>t.id!==original.id&&t.status==='completed');assert.ok(corrected);assert.notEqual(corrected.artifact.hash,original.artifact.hash);
    await page.locator(`.work-row button[data-action="artifact"][data-id="${corrected.id}"]`).click();
    await dialog(page).getByRole('button',{name:'Accept local deliverable'}).waitFor();
    await dialog(page).getByLabel('I used AI or another person’s help during this review.').check();
    await dialog(page).getByRole('button',{name:'Accept local deliverable'}).click();
    await page.getByText('Accepted locally',{exact:true}).waitFor();
    await navigate(page,'Results');await page.getByRole('button',{name:'Record an outcome',exact:true}).click();
    await dialog(page).getByLabel('What did you observe?').fill('Browser verification observation by development assistant, not owner/customer: the corrected packet was readable and retained its exact source binding.');
    await dialog(page).getByLabel('I used AI or another person’s help to make this assessment.').check();
    await dialog(page).getByRole('button',{name:'Record outcome',exact:true}).click();
    await page.getByText(/Browser verification observation by development assistant/).waitFor();
    await navigate(page,'Learning');await page.getByRole('button',{name:'Run labeled comparison',exact:true}).click();
    await dialog(page).getByRole('button',{name:'Run labeled comparison',exact:true}).click();
    await page.getByText('Decision: retain baseline',{exact:true}).waitFor();
    await navigate(page,'Overview');await page.screenshot({path:join(f.root,'demo-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});await noOverflow(page);await page.screenshot({path:join(f.root,'demo-mobile.png'),fullPage:true,animations:'disabled'});
    const freshContext=await f.context.browser().newContext();await freshContext.route('**/*',(r:any)=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort());const fresh=await freshContext.newPage();await fresh.goto(f.origin);await fresh.getByRole('heading',{name:'Investigate your business'}).waitFor();await freshContext.close();
    assert.equal(f.service.view(id).outcomes[0].assisted,true);assert.equal(f.service.view(id).accounting.independentCorrectionSeconds,null);assert.equal(f.service.view(id).accounting.providerCalls,0);
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);console.log('UI screenshots:',f.root);
  }finally{await f.close();}
});

test('a stale review preserves typed replacement and explicitly refreshes to the current revision task',async()=>{
  const f=await fixture(),{page}=f;
  try {
    await page.locator('[data-action="navigate"][data-page="archive"]').click();await page.getByRole('button',{name:'Explore service business demo'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    await navigate(page,'Work');await page.locator('button[data-action="plan"]').first().click();
    await dialog(page).getByRole('button',{name:'Prepare assignment',exact:true}).click();
    await page.getByRole('button',{name:'Run demo task',exact:true}).click();
    await page.getByRole('button',{name:'Review deliverable',exact:true}).waitFor();
    await page.getByRole('button',{name:'Review deliverable',exact:true}).click();
    await dialog(page).getByLabel('Use this replacement wording').fill('Browser stale-review verification text: inspect dimensions before a booking.');
    await dialog(page).getByLabel('I used AI or another person’s help during this review.').check();
    const original=f.service.view(id).tasks.find((t:any)=>t.status==='completed');
    // A second local review publishes a revision while this browser retains the old hash.
    const revised=f.service.execution.correct({businessId:id,taskId:original.id,artifactHash:original.artifact.hash,instruction:'Development fixture revision: request item details before a human inspection.'});
    await f.service.execution.run(id,revised.id);
    await dialog(page).getByRole('button',{name:'Apply replacement · demo'}).click();
    await dialog(page).getByRole('alert').waitFor();
    assert.match(await dialog(page).getByRole('alert').innerText(),/deliverable has changed/);
    assert.match(await dialog(page).getByLabel('Use this replacement wording').inputValue(),/stale-review verification text/);
    await dialog(page).getByRole('button',{name:'Refresh this review'}).click();
    await dialog(page).getByLabel('Use this replacement wording').waitFor();
    assert.match(await dialog(page).getByLabel('Use this replacement wording').inputValue(),/stale-review verification text/);
    assert.equal(await dialog(page).getByLabel('I used AI or another person’s help during this review.').isChecked(),true);
    assert.equal(await dialog(page).getByRole('button',{name:'Apply replacement · demo'}).isEnabled(),true);
    assert.match(await dialog(page).getByRole('link',{name:'Open deliverable'}).getAttribute('href'),new RegExp(encodeURIComponent(revised.id)));
    // Company context may change after a review opens, even without a new artifact hash.
    f.service.knowledge.updateCompany(id,{goal:'Development test: a changed owner goal needs a fresh preparation.'});
    await dialog(page).getByRole('button',{name:'Accept local deliverable'}).click();
    await dialog(page).getByRole('alert').waitFor();
    assert.match(await dialog(page).getByRole('alert').innerText(),/Company evidence changed\. Prepare fresh work from current context before accepting this artifact\./);
    for(const label of ['Accept local deliverable','Record an outcome','Apply replacement · demo']) assert.equal(await dialog(page).getByRole('button',{name:label,exact:true}).isDisabled(),true);
    await page.reload();await page.getByRole('heading',{name:'Work with a clear finish.'}).waitFor();
    await page.locator(`button[data-action="artifact"][data-id="${revised.id}"]`).click();
    await dialog(page).getByText('Earlier company context',{exact:true}).waitFor();
    assert.equal(await dialog(page).getByRole('link',{name:'Open deliverable'}).isVisible(),true);
    for(const label of ['Accept local deliverable','Record an outcome','Apply replacement · demo']) assert.equal(await dialog(page).getByRole('button',{name:label,exact:true}).isDisabled(),true);
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);
  }finally{await f.close();}
});

test('commercial assessment drives campaign, checked dependent page, correction and explicit page replacement',async()=>{
  const f=await fixture(),{page}=f;
  try {
    await page.locator('[data-action="navigate"][data-page="archive"]').click();
    await page.getByRole('button',{name:'Explore retail business demo'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    const report=f.service.view(id).intelligence;assert.equal(report.status,'proposal_ready');
    await navigate(page,'Intelligence');
    await page.getByRole('button',{name:'Read full report',exact:true}).click();
    assert.equal(await dialog(page).locator('.full-intelligence-report').innerText(),report.report);
    await dialog(page).getByRole('button',{name:'Close dialog'}).click();
    await page.getByRole('button',{name:'Report an omission',exact:true}).click();
    const retained=f.service.view(id).sources.find((s:any)=>s.selected!==false&&s.text);
    await dialog(page).getByLabel('Source that exposes the omission').selectOption(retained.id);
    await dialog(page).getByLabel('Exact source excerpt').fill('Deliberately mismatched development verification excerpt.');
    await dialog(page).getByLabel('What was missed?',{exact:true}).fill('Development verification observation: this source-backed buying constraint deserves a clearer trace in the assessment.');
    await dialog(page).getByLabel('Why would it matter to a decision?').fill('Development verification hypothesis: a clearer trace could change which customer question the local draft resolves. No measured commercial effect is represented.');
    await dialog(page).getByLabel('How consequential is this omission?').selectOption('consequential');
    await dialog(page).getByLabel('I used AI or another person’s help to identify this omission.').check();
    await dialog(page).getByRole('button',{name:'Record omission',exact:true}).click();
    await dialog(page).getByRole('alert').waitFor();assert.match(await dialog(page).getByRole('alert').innerText(),/must match/);
    await dialog(page).getByLabel('Exact source excerpt').fill(retained.text.slice(0,120));
    await dialog(page).getByRole('button',{name:'Record omission',exact:true}).click();
    await page.getByRole('heading',{name:'Commercial omission review',exact:true}).waitFor();
    await page.getByText('Assisted review · Independent expertise and effort unverified',{exact:true}).waitFor();
    const review=f.service.view(id).learning.find((l:any)=>l.omission);assert.equal(review.assisted,true);assert.equal(review.status,'candidate_prepared');assert.equal(review.decision,'retain_baseline');assert.equal(review.comparison.actualModelCalls,0);
    await navigate(page,'Intelligence');
    const rejected=report.opportunities.find((o:any)=>o.deliverables.every((d:any)=>d.family==='unsupported'));
    await page.locator(`button[data-action="opportunity"][data-id="${rejected.id}"]`).click();
    assert.equal(await dialog(page).getByRole('button',{name:'Create coordinated work'}).isDisabled(),true);
    await dialog(page).getByRole('button',{name:'Reject with a reason'}).click();
    await dialog(page).getByLabel('Reason for rejecting this opportunity').fill('Development verification: no participant or external-contact authority is available. Retain this as an explicit dependency.');
    await dialog(page).getByRole('button',{name:'Record rejection',exact:true}).click();
    await page.getByText(/Development verification: no participant/).waitFor();
    const chosen=report.opportunities.find((o:any)=>o.deliverables.some((d:any)=>d.family==='marketing-page'));
    await page.locator(`button[data-action="opportunity"][data-id="${chosen.id}"]`).click();
    await dialog(page).getByRole('button',{name:'Create coordinated work'}).click();
    await page.getByRole('heading',{name:'How the work connects'}).waitFor();
    await page.getByText('Waiting to prepare',{exact:true}).waitFor();
    let campaign=f.service.view(id).tasks.find((t:any)=>t.workflow==='campaign-packet');assert.ok(campaign);
    await page.locator(`button[data-action="run"][data-id="${campaign.id}"]`).click();
    await page.waitForFunction(()=>document.querySelectorAll('.work-row').length===2,{},{timeout:30000});
    let current=f.service.view(id),marketing=current.tasks.find((t:any)=>t.workflow==='marketing-page');
    assert.equal(current.tasks.find((t:any)=>t.id===campaign.id).status,'completed');assert.ok(marketing);
    await page.locator(`button[data-action="run"][data-id="${marketing.id}"]`).click();
    await page.waitForFunction(id=>document.querySelector(`.work-row button[data-action="artifact"][data-id="${id}"]`),marketing.id,{timeout:30000});
    await page.locator(`.work-row button[data-action="artifact"][data-id="${marketing.id}"]`).click();
    await dialog(page).getByRole('link',{name:'Open deliverable'}).waitFor();
    const popupPromise=page.waitForEvent('popup');await dialog(page).getByRole('link',{name:'Open deliverable'}).click();
    const popup=await popupPromise;await popup.getByRole('status').filter({hasText:'Product ready'}).waitFor({timeout:30000});
    assert.equal(await popup.locator('#product').evaluate((img:HTMLImageElement)=>img.naturalWidth>0),true);await popup.close();
    await dialog(page).getByRole('button',{name:'Close dialog'}).click();
    await page.locator(`.work-row button[data-action="artifact"][data-id="${campaign.id}"]`).click();
    await dialog(page).getByText(/canonical offer/).waitFor();
    await dialog(page).getByLabel('Use this replacement wording').fill('Development verification revised offer: a bounded owner-reviewed comparison with clear scope and no implied purchase.');
    await dialog(page).getByLabel('I used AI or another person’s help during this review.').check();
    await dialog(page).getByRole('button',{name:'Apply replacement · demo'}).click();
    await page.getByRole('button',{name:'Prepare updated page',exact:true}).waitFor({timeout:30000});
    await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[data-action="work-replan"]')?.disabled,{},{timeout:30000});
    await page.getByRole('button',{name:'Prepare updated page',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.work-row').length===4,{},{timeout:30000});
    current=f.service.view(id);const replacement=current.tasks.find((t:any)=>t.inputs?.replannedFrom===marketing.id);assert.ok(replacement);
    await page.locator(`button[data-action="run"][data-id="${replacement.id}"]`).click();
    await page.waitForFunction(id=>[...document.querySelectorAll('.work-row')].some(row=>row.querySelector(`.task-meta [data-id="${id}"]`)&&[...row.querySelectorAll('.badge')].some(b=>['completed','blocked'].includes(b.textContent||''))),replacement.id,{timeout:30000});
    const replacementResult=f.service.view(id).tasks.find((t:any)=>t.id===replacement.id);assert.equal(replacementResult.status,'completed',replacementResult.reason);
    await page.locator(`.work-row button[data-action="artifact"][data-id="${replacement.id}"]`).click();
    await dialog(page).getByRole('button',{name:'Accept local deliverable'}).waitFor();
    assert.equal(await dialog(page).getByRole('button',{name:'Accept local deliverable'}).isEnabled(),true);
    await dialog(page).getByRole('button',{name:'Close dialog'}).click();
    await navigate(page,'Intelligence');await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:join(f.root,'commercial-intelligence-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});await noOverflow(page);await page.screenshot({path:join(f.root,'commercial-intelligence-mobile.png'),fullPage:true,animations:'disabled'});
    await navigate(page,'Work');await noOverflow(page);await page.screenshot({path:join(f.root,'coordinated-work-mobile.png'),fullPage:true,animations:'disabled'});
    assert.equal(f.service.view(id).accounting.providerCalls,0);assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);
    console.log('Commercial UI screenshots:',f.root);
  }finally{await f.close();}
});

test('verified-authority UI states stay business scoped and route approved continuation using metadata-only mocks',async()=>{
  const f=await fixture(),{page}=f;
  try {
    const company=f.service.createBusiness({name:'Authority UI metadata fixture',website:'https://example.test',goal:'Verify scoped controls without a model transport.',notes:'Development-only UI metadata. No signed permission or provider execution is represented.'});
    await f.service.settle();const task=f.service.plan(company.id,'response-packet'),base=f.service.view(company.id);
    let authority:any={approved:false,liveEnabled:false,businessId:null,reason:'No signed outcome authorization is installed.'},mode='owner';
    const dispatches:Array<{path:string;body:any;csrf:string|undefined}>=[];
    const view=()=>({...base,business:{...base.business,mode},authority,tasks:[...base.tasks,{...base.tasks.find((t:any)=>t.id===task.id),id:company.id+'/paused-metadata',status:'paused',title:'Existing interrupted work — metadata fixture',dependsOn:[company.id+'/historical-upstream-not-in-view']} ]});
    await page.route(f.origin+'/api/**',async(route:any)=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/api/state')return route.fulfill({json:view()});
      if(['/api/diagnose','/api/run','/api/resume'].includes(url.pathname)){
        assert.equal(request.method(),'POST');dispatches.push({path:url.pathname,body:request.postDataJSON(),csrf:request.headers()['x-csrf-token']});
        // Never forward an execution request. This verifies UI routing only.
        return route.fulfill({status:202,json:{view:view(),result:{provenance:'metadata-only browser fixture; no grant checked or provider invoked'}}});
      }
      return route.continue();
    });
    await page.evaluate(id=>localStorage.setItem('midas-pilot-business',id),company.id);await page.goto(f.origin+'/#work');await page.reload();
    await page.getByRole('heading',{name:'Work with a clear finish.'}).waitFor();
    assert.equal(await page.locator(`button[data-action="run"][data-id="${task.id}"]`).isDisabled(),true);
    await navigate(page,'Intelligence');assert.equal(await page.getByRole('button',{name:'Prepare analysis request',exact:true}).isEnabled(),true);assert.equal(await page.getByRole('button',{name:'Run approved investigation',exact:true}).count(),0);
    await navigate(page,'Work');
    for(const mismatch of [{approved:true,liveEnabled:true,businessId:'a-different-business'},{approved:false,liveEnabled:true,businessId:company.id},{approved:true,liveEnabled:false,businessId:company.id}]){
      authority={...mismatch,reason:'Explicit metadata fixture for unavailable authority.'};await page.reload();await page.getByRole('heading',{name:'Work with a clear finish.'}).waitFor();
      assert.equal(await page.locator(`button[data-action="run"][data-id="${task.id}"]`).isDisabled(),true);assert.equal(await page.locator('button[data-action="resume"]').isDisabled(),true);
    }
    assert.deepEqual(dispatches,[]);
    authority={approved:true,liveEnabled:true,businessId:company.id,sameIdRecoveryAvailable:true,stageRemaining:{investigation:1,campaign:0},reason:'UI metadata fixture only; the test never authorizes or invokes a provider.'};
    await page.reload();await page.getByText('Approved work can continue.',{exact:true}).waitFor();
    assert.equal(await page.locator(`button[data-action="run"][data-id="${task.id}"]`).innerText(),'Continue approved work');
    assert.equal(await page.locator('button[data-action="resume"]').isEnabled(),true,'An unavailable historical prerequisite in the display cannot override verified continuation authority.');
    await page.getByText('Remaining stage allowance',{exact:true}).click();await page.getByText('campaign: 0',{exact:true}).waitFor();
    await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/run'),page.locator(`button[data-action="run"][data-id="${task.id}"]`).click()]);
    await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/resume'),page.locator('button[data-action="resume"]').click()]);
    await navigate(page,'Intelligence');await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/diagnose'),page.getByRole('button',{name:'Run approved investigation',exact:true}).click()]);
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent?.includes('Approved investigation started'));
    assert.deepEqual(dispatches.map(d=>d.path),['/api/run','/api/resume','/api/diagnose']);for(const d of dispatches){assert.equal(d.body.businessId,company.id);assert.ok(d.csrf);}
    assert.equal(dispatches[0].body.taskId,task.id);assert.equal(dispatches[1].body.taskId,company.id+'/paused-metadata');
    mode='fixture';await navigate(page,'Work');await page.reload();await page.getByRole('button',{name:'Run demo task',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Continue approved work',exact:true}).count(),0);await page.getByText('Labeled demo · synthetic company',{exact:true}).waitFor();
    assert.equal(f.service.view(company.id).accounting.providerCalls,0);assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);
  }finally{await f.close();}
});

test('partial retained pages show a prominent coverage limitation before the unchanged source text',async()=>{
  const f=await fixture(),{page}=f;
  try {
    const company=f.service.createBusiness({name:'Partial-source UI fixture',website:'',goal:'Verify visible source coverage.',notes:'Development-only retained text. This test does not inspect a live website.'}),base=f.service.view(company.id),source=base.sources[0];assert.ok(source);
    let metadata:any={origin:{kind:'public-retrieval',extraction:'html-text-v1; retained prefix; incomplete coverage',provenance:'Development metadata fixture; no live public source observed.'}};
    await page.route(f.origin+'/api/state**',(route:any)=>route.fulfill({json:{...base,sources:base.sources.map((s:any)=>s.id===source.id?{...s,...metadata}:s)}}));
    await page.evaluate(id=>localStorage.setItem('midas-pilot-business',id),company.id);
    const inspect=async()=>{await page.reload();await page.getByRole('button',{name:'All evidence',exact:true}).click();await dialog(page).locator(`button[data-action="source"][data-id="${source.id}"]`).click();};
    for(const sample of [metadata,{bodyComplete:false,origin:{extraction:'html-text-v1'}}]){
      metadata=sample;await inspect();
      await dialog(page).getByText('Only part of this page was retained.',{exact:true}).waitFor();
      assert.match(await dialog(page).locator('.source-coverage-notice').innerText(),/may change the recommendation/);
      assert.equal(await dialog(page).evaluate(el=>Boolean(el.querySelector('.source-coverage-notice')!.compareDocumentPosition(el.querySelector('.source-text')!)&Node.DOCUMENT_POSITION_FOLLOWING)),true);
      assert.equal(await dialog(page).locator('.source-text').innerText(),source.text);
    }
    metadata={bodyComplete:true,origin:{extraction:'html-text-v1; complete extracted text'}};await inspect();assert.equal(await dialog(page).locator('.source-coverage-notice').count(),0);
    assert.equal(f.service.view(company.id).accounting.providerCalls,0);assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);
  }finally{await f.close();}
});
