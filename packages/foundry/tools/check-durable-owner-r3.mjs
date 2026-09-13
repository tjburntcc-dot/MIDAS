/** Read-only browser inspection of the explicitly offline demonstration server. */
import {chromium} from 'file:///C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='var/durable-r3-verification',origin=process.argv[2]??'http://127.0.0.1:43138';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);await page.getByRole('button',{name:'Work',exact:true}).click();
 await page.getByText('Provider result preserved; task acceptance is recorded separately.',{exact:false}).first().waitFor();
 await page.screenshot({path:output+'/durable-work-desktop.png',fullPage:true});
 await page.reload();await page.getByRole('button',{name:'Work',exact:true}).click();
 assert((await page.getByText('Provider result preserved; task acceptance is recorded separately.',{exact:false}).count())>=5);
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByText('Long-running response and recovery',{exact:true}).first().click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:output+'/durable-work-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Products',exact:true}).click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:output+'/durable-products-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(output+'/owner-browser.json',JSON.stringify({origin,passed:true,refresh:true,mobileWidth:390,overflow:false,pageErrors:errors,provenance:'Read-only inspection of mock-completed workspace; no live model inference or credential access.'},null,2));
 console.log('Owner workspace: saved result status, refresh, mobile recovery details and products passed.');
}finally{await browser.close();}
