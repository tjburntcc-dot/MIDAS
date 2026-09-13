// Read-only owner view, deliberately outside the frozen provider execution imports.
// No credential access, provider transport, task recovery, signing or mutation.
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] ?? 'var/portfolio-031-continuation-r2');
const port = Number(process.argv[3] ?? 43136);
const db = new DatabaseSync(join(root, 'portfolio.sqlite'), { readOnly: true });
db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
const rows = kind => db.prepare('SELECT body FROM entities WHERE kind=?').all(kind).map(r => JSON.parse(r.body));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = cents => '$' + (cents / 100).toFixed(2);
const runId = 'portfolio-031-value-build-v4-r2';
const briefHash = 'fae4225c8d37b82b2ad8fc10a622988081538da7a794338e6bfac09bd583d34e';
function brief() {
  const w = rows('local-workspace').find(w => w.taskId === 'quote-desk/investigate-v4-r1');
  const text = w?.files.find(f => f.path === 'brief.json')?.content;
  if (!text || createHash('sha256').update(text, 'utf8').digest('hex') !== briefHash) throw Error('Preserved research hash mismatch');
  return text;
}
function snapshot() {
  const grant = JSON.parse(readFileSync(join(root, 'portfolio.authorization.json'), 'utf8')).payload;
  const order = ['decide', 'build', 'review-product', 'operate', 'adapt'];
  const tasks = rows('portfolio-task').filter(t => t.id.endsWith('-v4-r2')).sort((a, b) => order.indexOf(a.localId.replace('-v4-r2', '')) - order.indexOf(b.localId.replace('-v4-r2', '')));
  const attempts = rows('model-attempt').filter(a => a.scope?.runId === runId);
  const history = grant.continuation.historical;
  const retainedMinor = history.reservedMinor + history.countBufferMinor + attempts.reduce((n, a) => n + a.reservation, 0);
  return {
    readOnly: true, observedAt: new Date().toISOString(),
    tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, reason: t.reason, nextAction: t.nextAction, dependencies: t.dependsOn })),
    attempts: attempts.map(a => ({ id: a.id, admittedAt: a.admittedAt, dispatchAt: a.dispatchAt, finishedAt: a.finishedAt, errorCode: a.errorCode, inferenceDispatched: a.inferenceDispatchIntent === true, tokenCount: a.observation?.tokenCount, usage: a.result?.usage ?? null, cost: a.cost, reservationMinor: a.reservation })),
    accounting: { historicalRetainedMinor: history.reservedMinor + history.countBufferMinor, historicalProvisionalMinor: history.provisionalMinor, retainedMinor, unusedMinor: grant.continuation.combinedCeilingMinor - retainedMinor, combinedCeilingMinor: grant.continuation.combinedCeilingMinor, newAdmissions: attempts.length, newCounts: attempts.filter(a => a.countDispatchIntent).length, historicalAdmissions: history.admissions, historicalCounts: history.counts, authoritativeBilling: null },
    product: { runtimeProductDelivered: false, reason: 'R2 has no accepted build decision or product output. Historical previews are not R2 results.' }
  };
}
const style = `*{box-sizing:border-box}body{margin:0;background:#f4f3ed;color:#17382e;font:17px/1.6 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:36px 24px}h1{font-size:clamp(30px,5vw,48px);line-height:1.15;max-width:850px}h2{font-size:24px;margin-top:0}p{max-width:850px}a{color:#145843;text-underline-offset:4px}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}section,details{background:white;border:1px solid #d3dbd4;border-radius:12px;padding:24px;margin:20px 0}.tag{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:#755412}.metrics{display:flex;gap:30px;flex-wrap:wrap}.metrics strong{display:block;font-size:28px}.muted{color:#5d6d65}article{border-top:1px solid #ddd;padding:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}summary{cursor:pointer;font-weight:650}code{overflow-wrap:anywhere}button{font:inherit;border:1px solid #426756;background:white;padding:10px 18px;border-radius:8px;cursor:pointer}small{display:block}@media(max-width:450px){main{padding:20px 14px}section,details{padding:18px}}`;
function layout(title, body) { return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · MIDAS</title><style>${style}</style><main>${body}</main></html>`; }
function home() {
  const s = snapshot(), a = s.accounting;
  return layout('Actual R2 outcome', `<p class="tag">MIDAS · Mission 031 · Actual execution</p><h1>The build decision stopped at the provider deadline.</h1><p>No runtime product was delivered. The accepted research remains available. The request may have completed at the provider; local completion and billing are unknown. It has not been resubmitted.</p><nav><a href="/research">Read the preserved research</a><a href="http://127.0.0.1:43135/?view=work&venture=quote-desk">Open the connected workspace</a><a href="/">Refresh persisted status</a></nav><section><h2>What happened</h2><p>The complete-payload count succeeded at 9,506 tokens. One Astra Max inference was dispatched. After 180 seconds, the local request ended without a saved response ID, output or usage. This is a transport/completion uncertainty, not a rejected business or failed product check.</p><p>The signed recovery policy requires a provider-confirmed incomplete response with usage. That evidence is absent. Local reconciliation found no saved result; the four downstream tasks cannot run without the decision.</p><p><strong>Next execution action:</strong> obtain provider-side disposition or billing evidence for this attempt. If no output can be recovered, a separately approved linked replacement and an explicit timeout/completion strategy are needed. Unused funds do not authorize replacement.</p></section><section><h2>Exposure, not a spending claim</h2><div class="metrics"><div><strong>${a.newAdmissions} inference / ${a.newCounts} count</strong>New R2 admissions</div><div><strong>${money(a.retainedMinor)}</strong>Combined retained exposure</div><div><strong>${money(a.unusedMinor)}</strong>Unused within ${money(a.combinedCeilingMinor)}</div></div><p>${money(a.historicalRetainedMinor)} historical exposure carried once, plus $1.23 new inference reservation. The $4 shared count buffer is included once. Historical provisional cost is ${money(a.historicalProvisionalMinor)}; new inference usage/cost and authoritative billing remain unknown.</p></section><section><h2>Actual work and what is waiting</h2>${s.tasks.map(t => `<article><strong>${esc(t.title)}</strong><small>${esc(t.id)}</small><p><b>${esc(t.status)}</b> — ${esc(t.reason || (t.dependencies.length ? 'Waiting for its required upstream result.' : ''))}</p></article>`).join('')}</section><section><h2>Research you can use</h2><p>The 17,908-byte R1 brief is real model-authored research, reused unchanged. It recommends a bounded engineering experiment and does not establish demand. It discusses spreadsheet and incumbent substitutes, a possible handoff advantage, and missing operator evidence. Its recommendation does not substitute for the unexecuted R2 build decision.</p><a href="/research">Open the original research, sources and obligations →</a></section><details><summary>Historical previews — not runtime products from R2</summary><p>The existing product preview was authored by the development assistant. Offline fixture checks do not establish actual model competence.</p><a href="http://127.0.0.1:43135/preview?ventureId=quote-desk&taskId=quote-desk%2Fdeveloper-preview-v4">Open the development preview</a></details><details><summary>Technical evidence and exact attempt</summary><p>This page is a development-assistant-authored, read-only view of persisted state. It cannot execute tasks or contact the provider.</p><pre>${esc(JSON.stringify(s, null, 2))}</pre><a href="/status.json">Read the sanitized status snapshot</a></details>`);
}
function research() {
  const b = JSON.parse(brief());
  return layout('Preserved research', `<a href="/">← Actual execution status</a><p class="tag">Actual model · R1 · unchanged historical publication</p><h1>${esc(b.title)}</h1><p>Structurally accepted and published locally; original R1 task remained blocked at closure. Independent semantic validation and customer acceptance are unavailable. R2 reused this material without another research call.</p><section><h2>${esc(b.recommendation.title)}</h2>${b.recommendation.basis.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('')}</section><section><h2>Source-linked observations</h2>${b.observations.map(o => `<article><strong>${esc(o.id)}</strong><p>${esc(o.statement)}</p><blockquote>${esc(o.quote)}</blockquote><small>Source: ${esc(o.sourceId)}</small></article>`).join('')}</section><section><h2>Unknowns and obligations</h2><pre>${esc(JSON.stringify({ unknowns: b.unknowns, obligations: b.obligations }, null, 2))}</pre></section><a href="/brief.json">Download the unchanged 17,908-byte brief</a>`);
}
const server = createServer((req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    let content, type = 'text/html; charset=utf-8';
    if (path === '/') content = home();
    else if (path === '/research') content = research();
    else if (path === '/brief.json') { content = brief(); type = 'application/json'; }
    else if (path === '/status.json') { content = JSON.stringify(snapshot(), null, 2); type = 'application/json'; }
    else { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'", 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(503).end('Persisted evidence could not be verified. No state was changed.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Read-only owner result: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { db.close(); process.exit(0); }));
