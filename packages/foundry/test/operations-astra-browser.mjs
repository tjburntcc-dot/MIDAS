/** Read-only browser acceptance for the unsigned proposal; no POST or external account. */
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=resolve('var/operating-workbench-030/reports/astra-v3-browser');mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
try{
 await page.goto('http://127.0.0.1:43130/?id=midas-venture-investigation-v3');
 await page.getByRole('heading',{name:'Execution request — awaiting your decision'}).waitFor();
 assert.ok(await page.getByText('Prepared · model disabled',{exact:true}).count());
 assert.ok(await page.getByText('Astra High execution request — $23 maximum',{exact:true}).count());
 await page.screenshot({path:resolve(dir,'home.png'),fullPage:true});
 await page.getByRole('button',{name:'Inspect prepared request',exact:true}).click();
 await page.getByRole('heading',{name:'Business materials',exact:true}).waitFor();
 assert.match(await page.locator('#workspace').innerText(),/Development-assistant preparation/i);
 await page.screenshot({path:resolve(dir,'packet.png'),fullPage:true});
 await page.locator('#navigation [data-view=results]').click();
 assert.doesNotMatch(await page.locator('#workspace').innerText(),/\$23.*spent/i);
 await page.screenshot({path:resolve(dir,'results.png'),fullPage:true});
 await page.locator('#navigation [data-view=business]').click();await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
 await page.screenshot({path:resolve(dir,'mobile.png'),fullPage:true});
 assert.equal(errors.length,0);assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith('http://127.0.0.1:43130/')));
 const result={status:'pass',errors,requests,mutatingRequests:0,providerRequests:0,credentialAccess:false,checked:['unsigned proposal visible','prepared provenance','packet navigation','results distinguish no execution','390px no horizontal overflow']};
 writeFileSync(resolve(dir,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
