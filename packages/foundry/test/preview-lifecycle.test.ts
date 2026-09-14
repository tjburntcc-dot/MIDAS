import test from 'node:test';
import assert from 'node:assert/strict';
import {ManagedProjectPreviewSessions} from '../src/portfolio/project-preview.ts';
import {renderRemotePreview} from '../src/portfolio/preview.ts';

test('a screenshot failure after session registration releases the managed slot and owned resources',async()=>{
 let contexts=0,browsers=0,servers=0;const launch=async()=>({async newContext(){contexts++;return {async addInitScript(){},async route(){},async routeWebSocket(){},on(){},async newPage(){return {setDefaultTimeout(){},async goto(){},viewportSize(){return {width:1100,height:850};},async screenshot(){throw Error('fixture screenshot failure');}};},async close(){}};},async close(){browsers++;}});const sessions=new ManagedProjectPreviewSessions({launchBrowser:launch as any});const openProject=async()=>({url:'http://127.0.0.1:34001',workspace:{revision:()=>({manifestHash:'manifest'})},localManifestHash:'manifest',server:{manifestHash:'manifest',async close(){servers++;}}} as any);
 for(let i=0;i<5;i++)await assert.rejects(()=>sessions.open(openProject),/screenshot failure/);
 assert.equal((sessions as any).sessions.size,0);assert.equal(contexts,5);assert.equal(browsers,5);assert.equal(servers,5);
});

test('close endpoint is opt-in and the close-enabled wrapper sends only the current authenticated session',()=>{
 const base={ventureId:'v',taskId:'t',manifestHash:'m',openEndpoint:'/api/preview/open',actionEndpoint:'/api/preview/action',csrf:'csrf-test'};
 const ordinary=renderRemotePreview(base),closable=renderRemotePreview({...base,closeEndpoint:'/api/preview/close'});
 assert(!ordinary.includes('Close preview'));assert(closable.includes('Close preview'));assert(closable.includes('/api/preview/close'));assert(closable.includes('pagehide'));assert(closable.includes('keepalive,body'));assert(closable.includes('post(config.closeEndpoint,{sessionId:id},true)'));assert(!closable.includes('activeSessions')&& !closable.includes('closeAll'));
});
