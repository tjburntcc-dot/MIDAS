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
  const service = new PilotService(root), server = servePilot({ service, port: 0 }), origin = await server.ready;
  const browser = await launchCheckBrowser(), context = await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  const external: string[] = [], errors: string[] = [];
  await context.route('**/*', (route: any) => { const url = route.request().url(); if (new URL(url).origin !== origin) { external.push(url); return route.abort(); } return route.continue(); });
  const page = await context.newPage(); page.on('pageerror', (error: Error) => errors.push(error.message));
  await page.goto(origin); await page.getByRole('heading',{name:'Set up your workspace'}).waitFor();
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
    await page.getByLabel('Business name',{exact:true}).fill('Browser verification company — development test');
    await page.getByLabel('Website',{exact:false}).fill('https://example.test');
    await page.getByLabel('What would make this useful?').fill('Prepare a readable inquiry response grounded in owner policies.');
    await page.getByLabel('What should we know?').fill('Development assistant verification data; no owner or customer acceptance is represented.');
    await page.getByRole('button',{name:'Create my workspace'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    assert.equal(f.service.view(id).business.mode,'owner');
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await dialog(page).getByLabel('Business name',{exact:true}).fill('Browser verification company — updated');
    await dialog(page).getByRole('button',{name:'Save context update'}).click();
    await page.getByRole('button',{name:'+ Add context'}).click();
    await dialog(page).locator('#source-file').setInputFiles({name:'unsupported.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF fake unsupported fixture')});
    assert.match(await dialog(page).getByRole('alert').textContent(),/not supported/);
    await dialog(page).locator('#source-file').setInputFiles({name:'permitted-policy.md',mimeType:'text/markdown',buffer:Buffer.from('# Local policy\nA human confirms feasibility before prices or bookings. Development test only.')});
    await dialog(page).getByRole('checkbox').check();
    await dialog(page).getByRole('button',{name:'Retain this source'}).click();
    await page.getByRole('button',{name:'All evidence',exact:true}).click();
    const sources=f.service.view(id).sources;
    for(const source of sources) await dialog(page).locator(`input[value="${source.id}"]`).setChecked(source.title==='permitted-policy.md');
    await dialog(page).getByRole('button',{name:'Save worker selection'}).click();
    await page.getByRole('button',{name:'Review context',exact:true}).click();
    await page.getByText('Evidence inventory refreshed. No model diagnosis ran.',{exact:true}).waitFor();
    assert.equal(f.service.view(id).sources.filter((s:any)=>s.selected).length,1);
    assert.equal(f.service.view(id).understanding.claims.length,0);
    await page.getByRole('button',{name:'Prepare an assignment',exact:true}).first().click();
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
    await page.getByRole('button',{name:'Explore a labeled demo'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    await page.getByRole('button',{name:'Review context',exact:true}).click();
    await page.getByText('Labeled demo proposal prepared.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Prepare an assignment',exact:true}).first().click();
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
    const freshContext=await f.context.browser().newContext();await freshContext.route('**/*',(r:any)=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort());const fresh=await freshContext.newPage();await fresh.goto(f.origin);await fresh.getByRole('heading',{name:'Set up your workspace'}).waitFor();await freshContext.close();
    assert.equal(f.service.view(id).outcomes[0].assisted,true);assert.equal(f.service.view(id).accounting.independentCorrectionSeconds,null);assert.equal(f.service.view(id).accounting.providerCalls,0);
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.external,[]);console.log('UI screenshots:',f.root);
  }finally{await f.close();}
});

test('a stale review preserves typed replacement and explicitly refreshes to the current revision task',async()=>{
  const f=await fixture(),{page}=f;
  try {
    await page.getByRole('button',{name:'Explore a labeled demo'}).click();
    await page.getByRole('heading',{name:'Your business, moving forward.'}).waitFor();
    const id=await page.evaluate(()=>localStorage.getItem('midas-pilot-business'));
    await page.getByRole('button',{name:'Prepare an assignment',exact:true}).first().click();
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
