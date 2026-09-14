import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {launchCheckBrowser} from '../src/portfolio/preview.ts';

// Local, resumable owner-browser acceptance for the explicit fixture route.
// It never creates a service fixture, restarts a server, or contacts a provider.
const origin=process.argv[2]??'http://127.0.0.1:43145',output=resolve(process.argv[3]??'var/overnight-product-034/browser-evidence');
assert.equal(new URL(origin).hostname,'127.0.0.1');mkdirSync(output,{recursive:true});
const idFile=join(output,'connected-journey-ids.json'),runId=new Date().toISOString().replace(/[:.]/g,'-');
const readJson=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return {};}};
const persisted=readJson(idFile),ids={service:'company-aa40ae08f06443f794da',...(persisted.ids&&typeof persisted.ids==='object'?persisted.ids:{})};
const saveIds=()=>writeFileSync(idFile,JSON.stringify({updatedAt:new Date().toISOString(),origin,ids},null,2)+'\n');
const evidence=(which,label)=>join(output,`${which}-${label}-${runId}.png`);
const browser=await launchCheckBrowser(),context=await browser.newContext({viewport:{width:1365,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],external=[],journeys=[];
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',route=>{const url=new URL(route.request().url());return url.protocol==='http:'&&url.hostname==='127.0.0.1'?route.continue():(external.push(route.request().url()),route.abort());});

async function choose(id,route='overview'){
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.evaluate(value=>localStorage.setItem('midas-pilot-business',value),id);
  await page.goto(`${origin}/#${route}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(180);
  const state=await page.evaluate(async value=>{const response=await fetch('/api/state?businessId='+encodeURIComponent(value));if(!response.ok)throw Error('STATE_'+response.status);return response.json();},id);
  assert.equal(state.business?.id,id,'selected company must be retained by the server');return state;
}
async function availableBusinesses(){await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForTimeout(120);return page.evaluate(async()=>{const response=await fetch('/api/state');if(!response.ok)throw Error('BUSINESSES_'+response.status);return response.json();});}
async function createMissingRetail(){
  const listing=await availableBusinesses(),existing=(listing.businesses??[]).find(item=>item?.mode==='fixture'&&/retail/i.test(String(item.name||'')));
  if(existing?.id){ids.retail=existing.id;saveIds();return existing.id;}
  await choose(ids.service,'archive');
  const response=page.waitForResponse(candidate=>candidate.url()===origin+'/api/operating-demo'&&candidate.request().method()==='POST',{timeout:60000});
  await page.getByRole('button',{name:'Explore connected retail journey',exact:true}).click();
  const reply=await response,body=await reply.json();assert.equal(reply.status(),200,JSON.stringify(body));assert.equal(body.result?.id?.startsWith('company-'),true,'retail fixture must return one company ID');
  ids.retail=body.result.id;saveIds();return ids.retail;
}
async function routeChecks(which){
  const widths=[];
  for(const viewport of [{name:'desktop',width:1365,height:1000},{name:'phone',width:390,height:844}]){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    for(const route of ['overview','connections','outcomes','work','team','learning','results']){
      await page.goto(`${origin}/#${route}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(150);
      const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,objectText:document.querySelector('#main')?.textContent?.includes('[object Object]')??false}));
      assert.equal(metrics.scrollWidth<=metrics.viewport,true,`${which} ${viewport.name} ${route} horizontal overflow`);assert.equal(metrics.objectText,false,`${which} ${viewport.name} ${route} rendered an object placeholder`);
      widths.push({route,viewport:viewport.name,...metrics});
    }
  }
  await page.setViewportSize({width:1365,height:1000});return widths;
}
async function previewJourney(which,state){
  const task=state.tasks.find(item=>item.workflow==='functional-project'&&item.artifact?.current===true);assert.ok(task?.artifact?.previewUrl,`${which} needs a current local functional-project preview`);
  const previewUrl=origin+task.artifact.previewUrl;
  const ready=async()=>{
    try{return await page.getByText('Product ready · saved data persists across refresh',{exact:true}).waitFor({timeout:30000});}
    catch(error){
      const surface=await page.evaluate(()=>({status:document.querySelector('#status')?.textContent??'',imageSource:document.querySelector('#product')?.getAttribute('src')??'',body:document.body.innerText.slice(0,2500)})).catch(()=>({status:'Unable to read preview surface.',imageSource:'',body:''}));
      await page.screenshot({path:evidence(which,'functional-error'),fullPage:true}).catch(()=>{});
      throw Error(`${which} preview did not become ready at ${previewUrl}: ${JSON.stringify(surface)}`,{cause:error});
    }
  };
  const action=async invoke=>{const response=page.waitForResponse(candidate=>new URL(candidate.url()).pathname==='/api/preview/action'&&candidate.request().method()==='POST',{timeout:30000});await invoke();const reply=await response;assert.equal(reply.status(),200,`${which} managed preview action failed`);await ready();};
  const clickProduct=async(x,y)=>{const image=await page.locator('#product').boundingBox();assert.ok(image,'managed preview image is unavailable');await action(()=>page.mouse.click(image.x+x*image.width/1100,image.y+y*image.height/850));};
  const type=async text=>{await page.locator('#text').fill(text);await action(()=>page.getByRole('button',{name:'Type into product',exact:true}).click());};
  const key=async name=>{await page.locator('#product').focus();await action(()=>page.keyboard.press(name));};
  let previewOpened=false;
  try{
  await page.goto(previewUrl,{waitUntil:'domcontentloaded'});await ready();previewOpened=true;await page.screenshot({path:evidence(which,'functional-before'),fullPage:true});
  const marker=`Browser fixture ${which} ${runId}`;
  // These coordinates address only the public screenshot surface of the
  // documented functional-project fixture: title, detail, save, open, review.
  await clickProduct(285,420);await type(marker);await clickProduct(285,540);await type('Readback evidence retained locally; no external action is requested.');await clickProduct(150,675);
  await action(()=>page.getByRole('button',{name:'Get JSON export',exact:true}).click());let saved=await page.locator('#csv').inputValue();assert.match(saved,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'create must appear in managed readback');
  // Saving leaves focus on the fixture's Save control. Its keyboard order is
  // New item, Open first saved item, Mark first item reviewed; this remains
  // stable when a prior interrupted acceptance left an owner-visible test row.
  await key('Tab');await key('Tab');await key('Enter');
  await clickProduct(285,540);await key('Control+A');await type('Edited local readback evidence; owner review remains required.');await clickProduct(150,675);
  await key('Tab');await key('Tab');await key('Tab');await key('Enter');
  await action(()=>page.getByRole('button',{name:'Get JSON export',exact:true}).click());saved=await page.locator('#csv').inputValue();assert.match(saved,/Edited local readback evidence/,'edit must persist in managed readback');assert.match(saved,/reviewed/,'configured local review action must persist in managed readback');
  await page.getByRole('button',{name:'Refresh saved work',exact:true}).click();await ready();await action(()=>page.getByRole('button',{name:'Get JSON export',exact:true}).click());const afterRefresh=await page.locator('#csv').inputValue();assert.match(afterRefresh,/Edited local readback evidence/,'refresh must retain the managed local record');
  await page.screenshot({path:evidence(which,'functional-after'),fullPage:true});return {taskId:task.id,previewUrl,marker,created:true,edited:true,action:'review',readback:true};
  }finally{
    if(previewOpened){
      const closed=page.waitForResponse(candidate=>new URL(candidate.url()).pathname==='/api/preview/close'&&candidate.request().method()==='POST',{timeout:10000});
      await page.getByRole('button',{name:'Close preview',exact:true}).click().catch(()=>{});
      await closed.catch(()=>{});
    }
  }
}
try{
  const service=await choose(ids.service);assert.match(String(service.business?.name),/service/i,'the fixed service ID must remain the connected service fixture');saveIds();if(!ids.retail)await createMissingRetail();
  for(const which of ['service','retail']){
    const id=ids[which];assert.ok(id,`${which} company ID is missing`);const state=await choose(id,'outcomes');assert.ok(state.operatingOutcomes.every(outcome=>outcome.state==='completed'));
    const outcome=state.operatingOutcomes[0];assert.equal(outcome.graph.length,2);assert.equal(outcome.artifacts.filter(item=>item.current).length,2);assert.ok(outcome.corrections.length===1&&outcome.repairAllocated===12);assert.deepEqual(state.connectedAccounts.items.map(item=>item.readiness),['tested','tested','tested']);
    await page.screenshot({path:evidence(which,'outcome-desktop'),fullPage:true});const widths=await routeChecks(which);await page.goto(`${origin}/#outcomes`,{waitUntil:'domcontentloaded'});await page.screenshot({path:evidence(which,'outcome-phone'),fullPage:true});const preview=await previewJourney(which,await choose(id));
    journeys.push({case:which,businessId:id,outcomeId:outcome.id,currentTasks:outcome.graph.map(node=>node.taskId),calls:outcome.calls,artifactHashes:outcome.artifacts.map(artifact=>artifact.hash),providerRequests:0,urls:{workspace:`${origin}/#outcomes`,preview:preview.previewUrl},routeWidths:widths,preview});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={at:new Date().toISOString(),runId,origin,ids,journeys,errors,external,provenance:'Development-driven browser acceptance of existing or explicitly created labeled fixture companies, offline connection test records, and managed local preview actions. No model competence, provider access, customer outcome, payment, publication, or account action is inferred.'};
  const reportPath=join(output,`owner-journey-${runId}.json`);writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,reportPath},null,2));
}finally{await browser.close();}
