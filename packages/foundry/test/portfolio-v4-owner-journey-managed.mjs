import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {StateStore} from '../src/state.ts';
import {Portfolio} from '../src/portfolio/core.ts';
import {portfolioScope} from '../src/portfolio/contracts.ts';
import {LocalWorkTools} from '../src/portfolio/tools.ts';
import {EvidenceLibrary} from '../src/portfolio/evidence.ts';
import {PortfolioEngine} from '../src/portfolio/engine.ts';
import {offlinePortfolioModel} from '../src/portfolio/prepare.ts';
import {InteractivePreviewSessions} from '../src/portfolio/preview.ts';
import {servePortfolio} from '../src/portfolio/server.ts';

const require=createRequire(import.meta.url),{chromium}=require('C:/Users/14844/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const mainRoot=join(repository,'var','portfolio-031'),output=join(repository,'var','portfolio-v4-owner-browser');
mkdirSync(output,{recursive:true});
const isolatedRoot=mkdtempSync(join(repository,'var','portfolio-v4-owner-managed-'));
const readOnly=new DatabaseSync(join(mainRoot,'portfolio.sqlite'),{readOnly:true});
try{readOnly.exec(`VACUUM INTO '${join(isolatedRoot,'portfolio.sqlite').replaceAll('\\','/').replaceAll("'","''")}'`);}finally{readOnly.close();}
const store=new StateStore(join(isolatedRoot,'portfolio.sqlite')),portfolio=new Portfolio(store),tools=new LocalWorkTools({root:isolatedRoot,store,scopeFor:portfolioScope}),evidence=new EvidenceLibrary(store),engine=new PortfolioEngine({portfolio,tools,evidence,model:offlinePortfolioModel(tools)});
const paidV4=portfolio.snapshot().tasks.filter(task=>task.ventureId==='quote-desk'&&/-(?:v4)$/.test(task.localId)&&task.inputs?.requiresGrant===true);
assert.equal(paidV4.length,6,'the copied main state must retain exactly six V4 paid tasks');assert.ok(paidV4.every(task=>task.status==='queued'),'the copied main state must begin with all six V4 paid tasks queued');
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1024}}),owner=await context.newPage();
owner.setDefaultTimeout(15000);owner.setDefaultNavigationTimeout(20000);
const errors=[],badResponses=[];owner.on('pageerror',error=>errors.push(error.message));context.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))badResponses.push({status:response.status(),url:response.url()});});
const binding='quote-desk/developer-preview-v4';let app,previews,origin,sessionId;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start(){previews=new InteractivePreviewSessions();app=servePortfolio({engine,tools,previews,port:0});origin=await app.ready;}
async function ready(){await owner.getByText('Product ready · saved data persists across refresh',{exact:true}).waitFor();}
async function open(){sessionId=null;owner.on('response',async response=>{if(response.url().endsWith('/api/preview/open')&&response.status()===200){const body=await response.json();sessionId=body.sessionId;}});await owner.goto(origin,{waitUntil:'networkidle'});await owner.goto(origin+'/preview?ventureId=quote-desk&taskId='+encodeURIComponent(binding),{waitUntil:'networkidle'});await ready();for(let i=0;!sessionId&&i<40;i++)await wait(25);assert.ok(sessionId,'owner preview did not receive an isolated session id');}
function managed(){const page=previews.sessions.get(sessionId)?.page;assert.ok(page,'managed session is unavailable');const frame=page.frames().find(frame=>frame.parentFrame()===page.mainFrame());assert.ok(frame,'managed product frame is unavailable');return {page,frame};}
async function bounds(selector){const {frame}=managed();const locator=frame.locator(selector).first();await locator.waitFor();const box=await locator.boundingBox();assert.ok(box,selector+' has no rendered bounds');return box;}
async function ownerClick(selector){const box=await bounds(selector),image=await owner.locator('#product').boundingBox(),page=managed().page,size=page.viewportSize();assert.ok(image&&size,'owner image or managed viewport is unavailable');assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height,selector+' is not in the managed viewport');await owner.mouse.click(image.x+(box.x+box.width/2)*image.width/size.width,image.y+(box.y+box.height/2)*image.height/size.height);await ready();}
async function type(text){await owner.getByPlaceholder('Text for the selected product field').fill(text);await owner.getByRole('button',{name:'Type into product',exact:true}).click();await ready();}
async function key(name){await owner.locator('#product').focus();await owner.keyboard.press(name);await ready();}
async function scroll(){await owner.getByRole('button',{name:'Scroll down',exact:true}).click();await ready();}

try{
 await start();await open();
 await ownerClick('#customer');await type('Isolated owner acceptance customer');
 await ownerClick('.description');await type('Browser-backed verification service');
 await ownerClick('.quantity');await key('Control+A');await type('2');
 await ownerClick('.unit');await key('Control+A');await type('10.00');
 await scroll();await ownerClick('#save');
 await managed().frame.locator('#quotes article').waitFor();await owner.screenshot({path:join(output,'isolated-owner-saved.png'),fullPage:true});
 await ownerClick('[data-convert]');await managed().frame.locator('[data-job]').waitFor();await ownerClick('[data-job]');await key('ArrowDown');await key('ArrowDown');await key('Enter');
 await managed().frame.locator('[data-status]').filter({hasText:'completed'}).waitFor();
 await owner.getByRole('button',{name:'Get CSV export',exact:true}).click();await ready();let csv=await owner.getByLabel('Exported CSV').inputValue();assert.match(csv,/Isolated owner acceptance customer/);assert.match(csv,/"completed","20\.00"/);
 await owner.getByRole('button',{name:'Refresh saved work',exact:true}).click();await ready();await owner.getByRole('button',{name:'Get CSV export',exact:true}).click();await ready();assert.match(await owner.getByLabel('Exported CSV').inputValue(),/"completed","20\.00"/);
 await app.close();await start();await open();await owner.getByRole('button',{name:'Get CSV export',exact:true}).click();await ready();csv=await owner.getByLabel('Exported CSV').inputValue();assert.match(csv,/"completed","20\.00"/,'new isolated server session must read the saved completed job');
 await owner.screenshot({path:join(output,'isolated-owner-after-restart.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
 console.log(JSON.stringify({status:'passed',isolatedRoot,scope:'Read-only VACUUM INTO snapshot of main state; owner image/toolbar interactions only. Managed DOM provided rendered bounds, never state mutation.',csvContainsCompleted:csv.includes('"completed","20.00"'),paidV4InitiallyQueued:paidV4.length,mainMutations:0},null,2));
}finally{await app?.close();await context.close();await browser.close();store.close();}
