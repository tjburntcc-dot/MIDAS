/** Render preserved markup in an isolated browser. No live-site scripts, assets,
 * cookies or network requests are permitted; this is explicitly a sanitized view. */
import { requireThat, rawHash } from '../contracts.ts';
import { launchCheckBrowser } from '../portfolio/preview.ts';

async function thumbnail(page:any,base64:string,mimeType:string){
    const result=await page.evaluate(async(input:{base64:string;mimeType:string})=>{
        const img=new Image();img.src='data:'+input.mimeType+';base64,'+input.base64;await img.decode();
        if(img.naturalWidth>8192||img.naturalHeight>8192||img.naturalWidth*img.naturalHeight>25000000)throw Error('DISCOVERY_IMAGE_DIMENSIONS');
        const ratio=Math.min(1,768/img.naturalWidth,540/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
        const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
        let data='';for(const quality of [0.65,0.45,0.25]){data=canvas.toDataURL('image/jpeg',quality).split(',')[1];if(data.length<=86664)break;}
        return {base64:data,width:canvas.width,height:canvas.height,originalWidth:img.naturalWidth,originalHeight:img.naturalHeight};
    },{base64,mimeType});
    const bytes=Buffer.from(result.base64,'base64');requireThat(bytes.length<=65000,'DISCOVERY_MODEL_IMAGE_BYTE_LIMIT');
    return {...result,mimeType:'image/jpeg' as const,sha256:rawHash(bytes),bytes:bytes.length,provenance:'Bounded JPEG derivative of retained evidence; original image remains preserved.'};
}

export async function renderRetainedPage(input: { html: string; contentHash: string; launchBrowser?: () => Promise<any> }) {
    requireThat(Buffer.byteLength(input.html) <= 1000000 && /^[a-f0-9]{64}$/.test(input.contentHash), 'DISCOVERY_RENDER_INPUT');
    let browser: any, context: any; let blockedRequests = 0;
    try {
        browser = await (input.launchBrowser ?? launchCheckBrowser)();
        context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1280, height: 900 } });
        await context.route('**/*', async (route: any) => { blockedRequests++; await route.abort('blockedbyclient'); });
        await context.routeWebSocket('**/*', (socket: any) => socket.close());
        const page = await context.newPage(); page.setDefaultTimeout(10000);
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;
        await page.setContent(csp + input.html, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const observation = await page.evaluate(() => {
            document.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv="refresh" i],link').forEach(n => n.remove());
            document.querySelectorAll('*').forEach(node => { for (const attr of Array.from(node.attributes)) if (/^on/i.test(attr.name)) node.removeAttribute(attr.name); });
            return { title: document.title.slice(0, 240), text: document.body.innerText.slice(0, 20000), headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 40).map(n => ({ tag: n.tagName, text: n.textContent?.trim().slice(0, 500) ?? '' })), controls: Array.from(document.querySelectorAll('a,button,input,select,textarea')).slice(0, 60).map(n => ({ tag: n.tagName, text: (n.textContent || n.getAttribute('aria-label') || n.getAttribute('placeholder') || '').trim().slice(0, 300) })), visualLimits: { scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth } };
        });
        const screenshot = await page.screenshot({ type: 'png', fullPage: false, timeout: 10000 });
        requireThat(screenshot.length <= 2000000, 'DISCOVERY_SCREENSHOT_BYTE_LIMIT');
        const modelImage=await thumbnail(page,screenshot.toString('base64'),'image/png');
        return { kind: 'sanitized-retained-render' as const, provenance: 'Browser rendering of retained HTML and inline CSS with scripts and all external assets blocked. Not a live-page screenshot or visual model judgment.', contentHash: input.contentHash,
            observedAt: new Date().toISOString(), ...observation, blockedRequests, screenshot: { mimeType: 'image/png', base64: screenshot.toString('base64'), sha256: rawHash(screenshot), bytes: screenshot.length }, modelImage, modelImageInput: false };
    } finally { await context?.close(); await browser?.close(); }
}
export async function renderRetainedImage(input:{base64:string;mimeType:string;contentHash:string;launchBrowser?:()=>Promise<any>}){
    const bytes=Buffer.from(input.base64,'base64');requireThat(bytes.length<=2000000&&rawHash(bytes)===input.contentHash&&['image/png','image/jpeg'].includes(input.mimeType),'DISCOVERY_IMAGE_BINDING');
    let browser:any,context:any;
    try{browser=await(input.launchBrowser??launchCheckBrowser)();context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false});await context.route('**/*',(r:any)=>r.abort('blockedbyclient'));await context.routeWebSocket('**/*',(s:any)=>s.close());
        const page=await context.newPage();await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'none\'">',{timeout:10000});
        const modelImage=await thumbnail(page,input.base64,input.mimeType);return {kind:'retained-owner-image-derivative',contentHash:input.contentHash,observedAt:new Date().toISOString(),provenance:'Bounded derivative of an owner-supplied image. Capture authenticity, timing and interpretation remain owner-reported.',text:'Owner-supplied image; no OCR was performed.',modelImage,screenshot:{mimeType:input.mimeType,base64:input.base64,sha256:input.contentHash,bytes:bytes.length},modelImageInput:false};
    }finally{await context?.close();await browser?.close();}
}
