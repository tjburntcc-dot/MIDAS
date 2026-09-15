import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {ManagedProjectPreviewSessions} from '../src/portfolio/project-preview.ts';
import {InteractivePreviewSessions} from '../src/portfolio/preview.ts';
import {rawHash} from '../src/contracts.ts';

test('managed preview paging returns the settled browser image instead of a partially painted scroll',async()=>{
 const html='<!doctype html><style>body{margin:0;font:24px system-ui}section{height:400px;padding:20px;box-sizing:border-box}section:nth-child(odd){background:#dfeadd}section:nth-child(even){background:#d8e7f7}</style>'+Array.from({length:8},(_,i)=>'<section>Development scroll fixture section '+i+'</section>').join('');
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(html);});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address() as any,manifestHash='a'.repeat(64),sessions=new ManagedProjectPreviewSessions();
 try{
  const opened=await sessions.open(async()=>({url:'http://127.0.0.1:'+address.port,server:{manifestHash,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))},workspace:{revision:()=>({manifestHash})},localManifestHash:manifestHash}) as any,1100);
  const page=(sessions as any).sessions.get(opened.sessionId).page;
  let previousImage=opened.image.data;for(const key of ['PageDown','PageUp']){
   const result=await sessions.act(opened.sessionId,{kind:'key',key});
   assert.notEqual(rawHash(result.image.data),rawHash(previousImage));previousImage=result.image.data;
   const position=await page.evaluate(()=>scrollY);assert(key==='PageDown'?position>500:position===0);
   await page.waitForTimeout(500);const settled=await sessions.screenshot(opened.sessionId);
   assert.equal(rawHash(result.image.data),rawHash(settled.image.data),key+' must return the final painted image');
  }
 }finally{await sessions.closeAll();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('embedded managed preview paging also returns a settled image',async()=>{
 const sessions=new InteractivePreviewSessions(),html='<!doctype html><style>body{margin:0;font:24px system-ui}section{height:400px;padding:20px;box-sizing:border-box}section:nth-child(odd){background:#dfeadd}section:nth-child(even){background:#d8e7f7}</style>'+Array.from({length:8},(_,i)=>'<section>Development scroll fixture section '+i+'</section>').join('');
 try{
  const opened=await sessions.open({ventureId:'scroll-fixture',taskId:'embedded-scroll',manifestHash:'b'.repeat(64),files:[{path:'app.html',content:html}],stateHandler:()=>({version:0,state:{schemaVersion:1,quotes:[]}})});
  await sessions.act(opened.sessionId,{kind:'click',x:40,y:100});let previousImage=opened.image.data;
  for(const key of ['PageDown','PageUp']){const result=await sessions.act(opened.sessionId,{kind:'key',key});assert.notEqual(rawHash(result.image.data),rawHash(previousImage));previousImage=result.image.data;await new Promise(resolve=>setTimeout(resolve,500));const settled=await sessions.screenshot(opened.sessionId);assert.equal(rawHash(result.image.data),rawHash(settled.image.data),key+' must return the final painted embedded image');}
 }finally{await sessions.closeAll();}
});
