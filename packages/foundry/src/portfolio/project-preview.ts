import { randomBytes } from 'node:crypto';
import { requireThat } from '../contracts.ts';
import type { ProjectWorkspace } from './project-workspace.ts';
import type { TrustedProjectServer } from './project-server.ts';
import { launchCheckBrowser } from './preview.ts';

export type ProjectPreviewAction = { kind: 'click' | 'type' | 'key' | 'refresh' | 'export'; x?: number; y?: number; text?: string; key?: string };
type OpenedProject = { url: string; server: TrustedProjectServer; workspace: ProjectWorkspace; localManifestHash: string };
type Session = { id: string; opened: OpenedProject; browser: any; context: any; page: any; lastUsed: number; busy: boolean; blockedRequests: number; timer?: ReturnType<typeof setTimeout> };

/** Owner-facing project preview. Worker-authored HTML is never loaded in an
 * owner-origin tab: the owner gets only a managed browser image and bounded
 * input relays. The route gate is the effective navigation/network boundary;
 * CSP is a second, source-visible restriction. */
export class ManagedProjectPreviewSessions {
 private sessions = new Map<string, Session>(); private opening = 0; private launchBrowser: () => Promise<any>;
 constructor(options: { launchBrowser?: () => Promise<any> } = {}) { this.launchBrowser = options.launchBrowser ?? launchCheckBrowser; }
 private async image(session: Session, extra: any = {}) { session.lastUsed = Date.now(); if (session.timer) clearTimeout(session.timer); session.timer = setTimeout(() => void this.close(session.id), 900_000); session.timer.unref(); const image = await session.page.screenshot({ type: 'png', animations: 'disabled' }); return { sessionId: session.id, manifestHash: session.opened.localManifestHash, width: session.page.viewportSize().width, height: session.page.viewportSize().height, image: { mimeType: 'image/png', data: image.toString('base64') }, blockedRequests: session.blockedRequests, ...extra }; }
 async open(openProject: () => Promise<OpenedProject>, viewportWidth = 1100) {
  requireThat(Number.isSafeInteger(viewportWidth) && viewportWidth >= 320 && viewportWidth <= 1280, 'PROJECT_PREVIEW_VIEWPORT'); requireThat(this.sessions.size + this.opening < 4, 'PROJECT_PREVIEW_SESSION_CAP'); this.opening++; let opened: OpenedProject | null = null, browser: any = null, context: any = null;
  let session: Session | null = null;
  try { opened = await openProject(); const origin = new URL(opened.url).origin; browser = await this.launchBrowser(); context = await browser.newContext({ viewport: { width: viewportWidth, height: 850 }, serviceWorkers: 'block', acceptDownloads: false }); await context.addInitScript(()=>{for(const name of ['RTCPeerConnection','webkitRTCPeerConnection','mozRTCPeerConnection'])try{Object.defineProperty(window,name,{value:undefined,writable:false,configurable:false});}catch{}}); const id = randomBytes(24).toString('hex'); session = { id, opened, browser, context, page: null, lastUsed: Date.now(), busy: false, blockedRequests: 0 };
   await context.route('**/*', async (route: any) => { const request = route.request(), target = new URL(request.url()); if (target.origin !== origin) { session!.blockedRequests++; await route.abort('blockedbyclient'); } else await route.continue(); });
   await context.routeWebSocket('**/*', (socket: any) => { session!.blockedRequests++; socket.close(); }); context.on('page', (page: any) => { if (session!.page && page !== session!.page) { session!.blockedRequests++; void page.close(); } }); context.on('dialog', (dialog: any) => void dialog.dismiss()); context.on('download', (download: any) => { session!.blockedRequests++; void download.cancel(); });
   const page = await context.newPage(); session!.page = page; page.setDefaultTimeout(5000); await page.goto(opened.url, { waitUntil: 'domcontentloaded' }); this.sessions.set(id, session!); return await this.image(session!);
  } catch (error) { if(session){this.sessions.delete(session.id);if(session.timer)clearTimeout(session.timer);} await context?.close(); await browser?.close(); await opened?.server.close(); throw error; } finally { this.opening--; }
 }
 async act(id: string, action: ProjectPreviewAction) { const session = this.sessions.get(id); requireThat(session, 'PROJECT_PREVIEW_SESSION_NOT_FOUND'); requireThat(session.opened.workspace.revision().manifestHash===session.opened.server.manifestHash,'PROJECT_PREVIEW_STALE'); requireThat(Date.now() - session.lastUsed <= 900_000 && !session.busy, 'PROJECT_PREVIEW_SESSION_UNAVAILABLE'); requireThat(action && ['click', 'type', 'key', 'refresh', 'export'].includes(action.kind), 'PROJECT_PREVIEW_ACTION_DENIED'); session.busy = true; try { let extra: any = {};
   if (action.kind === 'click') { const viewport = session.page.viewportSize(); requireThat(Number.isFinite(action.x) && Number.isFinite(action.y) && action.x! >= 0 && action.y! >= 0 && action.x! < viewport.width && action.y! < viewport.height, 'PROJECT_PREVIEW_COORDINATES'); await session.page.mouse.click(action.x, action.y); }
   else if (action.kind === 'type') { requireThat(typeof action.text === 'string' && action.text.length > 0 && action.text.length <= 1000, 'PROJECT_PREVIEW_TEXT'); await session.page.keyboard.insertText(action.text); }
   else if (action.kind === 'key') { requireThat(['Tab', 'Shift+Tab', 'Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Control+A', 'Meta+A', 'Escape', 'PageDown', 'PageUp'].includes(action.key ?? ''), 'PROJECT_PREVIEW_KEY'); await session.page.keyboard.press(action.key); }
   else if (action.kind === 'refresh') await session.page.reload({ waitUntil: 'domcontentloaded' });
   else { const response = await fetch(session.opened.url + '/api/export'); requireThat(response.ok, 'PROJECT_PREVIEW_EXPORT'); extra = { exportJson: await response.json() }; }
   await session.page.waitForTimeout(75); return await this.image(session, extra);
  } finally { session.busy = false; }
 }
 async screenshot(id: string) { const session = this.sessions.get(id); requireThat(session, 'PROJECT_PREVIEW_SESSION_NOT_FOUND'); requireThat(session.opened.workspace.revision().manifestHash===session.opened.server.manifestHash,'PROJECT_PREVIEW_STALE'); return this.image(session); }
 async close(id: string) { const session = this.sessions.get(id); if (!session) return; this.sessions.delete(id); if (session.timer) clearTimeout(session.timer); await session.context.close(); await session.browser.close(); await session.opened.server.close(); }
 async closeAll() { for (const id of [...this.sessions.keys()]) await this.close(id); }
}
