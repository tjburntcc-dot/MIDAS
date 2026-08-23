/* ============================================================================
   MIDAS — founder operating system (single application)
   Reads and writes only through the existing /app/* API. Never seeds, never
   approves, never invents numbers.
   ============================================================================ */
'use strict';

/* ---------------------------------------------------------------- text ---- */
const MOJI = [
  ['â€”','—'],   /* em dash  */
  ['â€“','–'],   /* en dash  */
  ['â€™','’'],   /* right '  */
  ['â€˜','‘'],   /* left '   */
  ['â€œ','“'],   /* left "   */
  ['â€','”'],   /* right "  */
  ['â€¦','…'],   /* ellipsis */
  ['Ã©','é'],          /* e-acute  */
  ['Â·','·'],          /* middot   */
  ['Â ',' '],                /* nbsp     */
  ['Â',''],                        /* stray    */
];
function clean(s){
  let t = String(s == null ? '' : s);
  for (const [a,b] of MOJI) if (t.indexOf(a) >= 0) t = t.split(a).join(b);
  return t;
}
function esc(s){
  return clean(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                 .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function truncate(s,n){ const t = clean(s).trim(); return t.length > n ? t.slice(0,n-1).trimEnd()+'…' : t; }
function sentence(s){ const t = clean(s).trim(); return t ? t[0].toUpperCase()+t.slice(1) : ''; }
function humanKind(k){ return sentence(String(k||'').replace(/[_-]+/g,' ')); }
function firstLine(s){
  const t = clean(s||'').split('\n').map(x=>x.trim()).filter(Boolean);
  return t[0] || '';
}
function usd(n){
  if (n == null || !isFinite(n)) return null;
  if (n === 0) return '$0.00';
  if (n > 0 && n < 0.01) return 'under $0.01';
  return '$' + Number(n).toFixed(2);
}
function ago(iso){
  if(!iso) return null;
  const t = Date.parse(iso); if(!isFinite(t)) return null;
  const mins = Math.round((Date.now()-t)/60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins+' min ago';
  const hrs = Math.round(mins/60);
  if (hrs < 24) return hrs+(hrs===1?' hour ago':' hours ago');
  const days = Math.round(hrs/24);
  if (days < 30) return days+(days===1?' day ago':' days ago');
  return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function plural(n,one,many){ return n + ' ' + (n===1?one:(many||one+'s')); }

/* ----------------------------------------------------------------- api ---- */
async function apiGet(path){
  try{
    const r = await fetch(path,{headers:{accept:'application/json'}});
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { return {error:'Unreadable response.'}; }
  }catch(e){ return {error:'Could not reach MIDAS.'}; }
}
async function apiPost(path, body){
  try{
    const r = await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});
    const txt = await r.text();
    let out; try { out = JSON.parse(txt); } catch { out = {error:'Unreadable response.'}; }
    if (!r.ok && !out.error) out.error = 'Request failed (' + r.status + ').';
    return out;
  }catch(e){ return {error:'Could not reach MIDAS.'}; }
}
function errText(out){
  if (!out) return 'Nothing came back.';
  const raw = out.error || out.message || out.note;
  if (!raw) return 'That did not work.';
  return sentence(clean(String(raw)).replace(/_/g,' '));
}

/* --------------------------------------------------------------- toast ---- */
let toastTimer = null;
function toast(msg, bad){
  const el = document.getElementById('toast');
  el.textContent = clean(msg);
  el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.className = 'toast'; }, 4200);
}

/* ---------------------------------------------------------- vocabulary ---- */
const ROLES = {
  workflow_manager : {title:'Manager',              layer:'Command layer',  glyph:'♛',
                      blurb:'Breaks your instruction into steps, assigns them to the right specialist, and reports back.'},
  executive        : {title:'Executive strategist', layer:'Strategy layer', glyph:'✦',
                      blurb:'Weighs tradeoffs and writes the priority memo for the business.'},
  atlas            : {title:'Atlas',                layer:'Policy engine',  glyph:'❖',
                      blurb:'Applies your written company rules to decide what is and is not allowed.'},
  business_research: {title:'Researcher',           layer:'Intel gatherer', glyph:'◉',
                      blurb:'Turns your notes into inspectable questions and labels what is still unknown.'},
  marketing        : {title:'Marketing specialist', layer:'Market voice',   glyph:'▲',
                      blurb:'Drafts local marketing copy from approved company facts. Internal drafts only.'},
  sales            : {title:'Sales strategist',     layer:'Revenue ops',    glyph:'◆',
                      blurb:'Plans internal sales approach and qualification. No outreach.'},
  product          : {title:'Product specialist',   layer:'Build system',   glyph:'⚙',
                      blurb:'Writes the product requirements and the first build slice.'},
  finance          : {title:'Finance analyst',      layer:'Signal layer',   glyph:'▦',
                      blurb:'Separates known owner numbers from assumptions. Never invents revenue.'},
  ops              : {title:'Operations specialist',layer:'Operations',     glyph:'▣',
                      blurb:'Writes the operating checklists that make the first week runnable.'},
  independent_audit: {title:'Watcher',              layer:'Oversight',      glyph:'◎',
                      blurb:'Audits finished work and flags anything unsupported before you see it.'},
  offer_strategist : {title:'Offer strategist',     layer:'Offer design',   glyph:'✧',
                      blurb:'Proposes offer positioning as clearly labelled hypotheses, never as fact.'},
};
const LEADER_ROLES = ['workflow_manager','executive','atlas'];
const OVERSIGHT_ROLES = ['independent_audit'];
function roleMeta(id){
  return ROLES[id] || {title: humanKind(id) || 'Specialist', layer:'Specialist', glyph:'◇',
                       blurb:'Works only inside this company on supervised internal tasks.'};
}
function empName(e){ const n = clean(e && e.name || '').trim(); return n || roleMeta(e && e.roleId).title; }

const COMPANY_STYLE = {
  'ws-own-004' : {kind:'studio',     glyph:'♫', accent:'#f4c95d', label:'Music lessons'},
  'ws-own-005' : {kind:'ledger',     glyph:'▦', accent:'#9d8cfa', label:'Bookkeeping'},
  'ws-own-003' : {kind:'greenhouse', glyph:'⚘', accent:'#3ddba3', label:'Compost subscription'},
  'ws-own-001' : {kind:'workshop',   glyph:'⛭', accent:'#4fe0f2', label:'Bicycle repair'},
  'ws-own-002' : {kind:'storefront', glyph:'✂', accent:'#e97ad0', label:'Clothing repair'},
  'ws-ridgeline':{kind:'tower',      glyph:'▤', accent:'#5aa9f8', label:'Estimating software'},
};
const FALLBACK_STYLES = [
  {kind:'tower',      glyph:'▤', accent:'#5aa9f8'},
  {kind:'studio',     glyph:'♫', accent:'#f4c95d'},
  {kind:'greenhouse', glyph:'⚘', accent:'#3ddba3'},
  {kind:'workshop',   glyph:'⛭', accent:'#4fe0f2'},
  {kind:'ledger',     glyph:'▦', accent:'#9d8cfa'},
  {kind:'storefront', glyph:'✂', accent:'#e97ad0'},
];
function hashCode(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
function styleFor(co){
  if (COMPANY_STYLE[co.id]) return COMPANY_STYLE[co.id];
  const ind = String(co.industry||'').toLowerCase() + ' ' + String(co.name||'').toLowerCase();
  let base;
  if (/soft|saas|tech|app|estimat/.test(ind))        base = FALLBACK_STYLES[0];
  else if (/music|lesson|school|studio/.test(ind))   base = FALLBACK_STYLES[1];
  else if (/compost|garden|farm|green/.test(ind))    base = FALLBACK_STYLES[2];
  else if (/repair|bike|bicycle|workshop/.test(ind)) base = FALLBACK_STYLES[3];
  else if (/book|financ|account|ledger/.test(ind))   base = FALLBACK_STYLES[4];
  else if (/mend|tailor|shop|store|craft/.test(ind)) base = FALLBACK_STYLES[5];
  else base = FALLBACK_STYLES[hashCode(String(co.id)) % FALLBACK_STYLES.length];
  return Object.assign({label: humanKind(co.industry) || 'Business'}, base);
}
function industryLabel(co){
  const s = styleFor(co);
  return s.label || humanKind(co.industry) || 'Business';
}
function isIsolationWorkspace(co){
  return /^ws-iso-/.test(String(co.id||'')) || /isolation/i.test(String(co.name||''));
}

/* ------------------------------------------------------ employee status ---- */
const READY_STATUS = ['authorized_for_supervised_internal','supervised_internal_use','active'];
function lastTaskAt(emp){
  let best = null;
  for (const t of (emp.taskHistory||[])) if (t.at && (!best || t.at > best)) best = t.at;
  return best;
}
function employeeState(emp, pendingByEmployee){
  if (pendingByEmployee && pendingByEmployee[emp.id]) {
    return {key:'wait', label:'Awaiting approval', detail:'A decision from you is queued before this work continues.'};
  }
  if ((emp.taskHistory||[]).some(t => /running|in_progress|started/i.test(String(t.status||'')))) {
    return {key:'ok', label:'Active', detail:'A task is running right now.'};
  }
  const st = String(emp.status||'');
  if (READY_STATUS.indexOf(st) >= 0){
    const last = lastTaskAt(emp);
    return {key:'idle', label:'Idle',
            detail: last ? ('Ready for work. Last worked '+ago(last)+'.') : 'Ready for work. Nothing recorded yet.'};
  }
  if (st === 'development_verified') return {key:'ok', label:'Verified', detail:'Checked in development. Not yet released for supervised work.'};
  if (!st) return {key:'off', label:'Unavailable', detail:'No authorisation recorded.'};
  return {key:'off', label:'Unavailable', detail:'Current authorisation: '+humanKind(st)+'.'};
}
function engineLabel(emp){
  const p = emp.executionProfile || {};
  if (p.liveModelWork) return 'Live model';
  if (p.kind === 'deterministic') return 'Deterministic · no model call';
  return humanKind(p.kind || 'deterministic');
}
function sortedTeam(list){
  const rank = e => {
    if (e.roleId === 'workflow_manager') return 0;
    if (e.roleId === 'executive') return 1;
    if (e.roleId === 'atlas') return 2;
    if (e.roleId === 'independent_audit') return 9;
    return 5;
  };
  return (list||[]).slice().sort((a,b) => rank(a)-rank(b) || String(a.id).localeCompare(String(b.id)));
}
function pickLeader(list){
  for (const r of LEADER_ROLES){
    const hit = (list||[]).find(e => e.roleId === r);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------ statuses ---- */
const DONE_STATUS = ['completed','done','approved','delivered'];
const OPEN_STATUS = ['running','in_progress','planned','pending','awaiting_owner_approval','blocked','paused','queued','proposed'];
function objectiveWord(status){
  const s = String(status||'').toLowerCase();
  if (DONE_STATUS.indexOf(s) >= 0) return 'Completed';
  if (s === 'awaiting_owner_approval') return 'Waiting on you';
  if (s === 'blocked') return 'Blocked';
  if (s === 'canceled' || s === 'cancelled') return 'Cancelled';
  if (s === 'rejected') return 'Rejected';
  if (s === 'failed') return 'Did not finish';
  return humanKind(s) || 'Recorded';
}
function statusTone(word){
  if (/wait/i.test(word)) return 'wait';
  if (/complete|approved|done/i.test(word)) return 'ok';
  if (/block|fail|reject/i.test(word)) return 'bad';
  return 'idle';
}
function decisionSentence(a){
  const k = String(a.kind||'');
  if (k === 'teaching_packet'){
    const to = (a.content && a.content.recipientRoleId) ? roleMeta(a.content.recipientRoleId).title : 'an employee';
    return 'A lesson is ready to be taught to your ' + to.toLowerCase() + '. It cannot be used until you approve it.';
  }
  if (k === 'scout_findings') return 'Research findings are ready for your review before the team may rely on them.';
  return 'The team needs your approval before continuing: ' + humanKind(k).toLowerCase() + '.';
}

/* --------------------------------------------------------------- state ---- */
const STATE = {
  portfolio: null,          /* {companies:[...], leadership:[...]} */
  company: {},              /* id -> loaded bundle */
  loading: false,
};
function companyById(id){
  return (STATE.portfolio ? STATE.portfolio.companies : []).find(c => c.id === id) || null;
}

async function loadPortfolio(force){
  if (STATE.portfolio && !force) return STATE.portfolio;
  const list = await apiGet('/app/companies');
  const raw = (list && list.companies) || [];
  const companies = raw
    .filter(co => !isIsolationWorkspace(co))
    .map(co => ({
      id: co.id, name: clean(co.name), description: clean(co.description||''),
      industry: co.industry, type: co.type, ownerStatus: co.ownerStatus,
      employees: [], pending: 0, pendingList: [], spendUsd: 0, revenueUsd: 0, deliverableCount: 0,
    }));

  await Promise.all(companies.map(async c => {
    const [emp, tre, apr, del] = await Promise.all([
      apiGet('/app/employees?workspaceId='+encodeURIComponent(c.id)),
      apiGet('/app/treasury?workspaceId='+encodeURIComponent(c.id)),
      apiGet('/app/approvals?workspaceId='+encodeURIComponent(c.id)),
      apiGet('/app/deliverables?workspaceId='+encodeURIComponent(c.id)),
    ]);
    /* only people that genuinely belong to this company; the portfolio-level
       Atlas record has no workspace and is not part of any company's team */
    const seen = new Set();
    c.employees = ((emp && emp.employees) || []).filter(e => {
      if (e.workspaceId !== c.id) return false;
      if (seen.has(e.id)) return false;
      seen.add(e.id); return true;
    });
    c.spendUsd   = (tre && tre.totals && tre.totals.actualSpendUsd) || 0;
    c.revenueUsd = (tre && tre.totals && tre.totals.actualRevenueUsd) || 0;
    c.pendingList = (apr && apr.pending) || [];
    c.pending    = c.pendingList.length;
    c.deliverableCount = ((del && del.records) || []).length;
  }));

  companies.sort((a,b) => b.employees.length - a.employees.length || a.name.localeCompare(b.name));

  const leadership = [];
  for (const c of companies)
    for (const e of c.employees)
      if (LEADER_ROLES.indexOf(e.roleId) >= 0 || OVERSIGHT_ROLES.indexOf(e.roleId) >= 0)
        leadership.push({company:c, emp:e});

  STATE.portfolio = {companies, leadership};
  return STATE.portfolio;
}

/* Per-company bundle. Cached; call with force after a write. */
async function loadCompany(id, force){
  if (STATE.company[id] && !force) return STATE.company[id];
  const co = companyById(id);
  if (!co) return null;
  const [full, work, obj, del, act, know, train, apr, tre] = await Promise.all([
    apiGet('/app/companies/'+encodeURIComponent(id)),
    apiGet('/app/work?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/objectives?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/deliverables?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/activity?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/knowledge?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/training/episodes?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/approvals?workspaceId='+encodeURIComponent(id)),
    apiGet('/app/treasury?workspaceId='+encodeURIComponent(id)),
  ]);
  const pendingByEmployee = {};
  const pending = (apr && apr.pending) || [];
  for (const a of pending){
    const rid = a.content && (a.content.recipientEmployeeId || a.content.employeeId);
    if (rid) pendingByEmployee[rid] = a;
  }
  co.pendingList = pending;
  co.pending = pending.length;
  co.spendUsd   = (tre && tre.totals && tre.totals.actualSpendUsd) || co.spendUsd;
  co.revenueUsd = (tre && tre.totals && tre.totals.actualRevenueUsd) || 0;

  const bundle = {
    co,
    detail: (full && full.company) || {},
    objectives: mergeObjectives(id, (work && work.records) || [], (obj && obj.objectives) || []),
    deliverables: (del && del.records) || [],
    activity: (act && act.activity) || [],
    workFeed: (act && act.workFeed) || [],
    knowledge: (know && know.items) || [],
    training: (train && train.records) || [],
    approvals: apr || {},
    treasury: tre || {},
    pendingByEmployee,
  };
  co.deliverableCount = bundle.deliverables.length;
  STATE.company[id] = bundle;
  return bundle;
}
function mergeObjectives(wsId, a, b){
  const out = new Map();
  for (const o of a.concat(b)){
    if (!o || !o.id) continue;
    if (o.workspaceId && o.workspaceId !== wsId) continue;
    out.set(o.id, Object.assign({}, out.get(o.id) || {}, o));
  }
  return Array.from(out.values());
}
function invalidate(id){
  if (id) delete STATE.company[id];
  STATE.portfolio = null;
}
/* ============================================================================
   PORTFOLIO VILLAGE — isometric scene
   Lower camera, tall facades, dominant leadership tower.
   ============================================================================ */
const TW = 72, TH = 25, ZH = 40;           /* half-tile width, half-tile depth, height unit */
function px(x,y,z){ return [ (x-y)*TW, (x+y)*TH - (z||0)*ZH ]; }
function pts(a){ return a.map(p => p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '); }
function poly(p, fill, extra){ return '<polygon points="'+pts(p)+'" fill="'+fill+'"'+(extra||'')+'/>'; }
function lineSeg(a,b,stroke,w,extra){
  return '<line x1="'+a[0].toFixed(1)+'" y1="'+a[1].toFixed(1)+'" x2="'+b[0].toFixed(1)+'" y2="'+b[1].toFixed(1)
       + '" stroke="'+stroke+'" stroke-width="'+(w||1)+'"'+(extra||'')+'/>';
}
function shade(hex,f){
  const n = parseInt(hex.slice(1),16);
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  if (f>=0){ r+=(255-r)*f; g+=(255-g)*f; b+=(255-b)*f; } else { r*=(1+f); g*=(1+f); b*=(1+f); }
  const h=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}
function mix(a,b,t){
  const A=parseInt(a.slice(1),16), B=parseInt(b.slice(1),16);
  const r=((A>>16)&255)*(1-t)+((B>>16)&255)*t;
  const g=((A>>8)&255)*(1-t)+((B>>8)&255)*t;
  const c=(A&255)*(1-t)+(B&255)*t;
  const h=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(c);
}
function pal(base){ return {top:shade(base,0.22), left:shade(base,-0.10), right:shade(base,-0.44), line:shade(base,0.40)}; }
function roofPal(accent){ return pal(mix('#111b30', accent, 0.26)); }

const WALL      = '#1a2740';
const WALL_DARK = '#141f34';
const WALL_LIT  = '#20304e';

/* cuboid */
function box(x,y,z,w,d,h,c,opt){
  const t=z+h, o=opt||{};
  const top   = [px(x,y,t),  px(x+w,y,t),  px(x+w,y+d,t), px(x,y+d,t)];
  const right = [px(x+w,y,t),px(x+w,y+d,t),px(x+w,y+d,z), px(x+w,y,z)];
  const left  = [px(x,y+d,t),px(x+w,y+d,t),px(x+w,y+d,z), px(x,y+d,z)];
  const st = o.line===false ? '' : ' stroke="'+c.line+'" stroke-opacity="'+(o.lineOpacity||0.26)+'" stroke-width="1"';
  return poly(left,c.left,st)+poly(right,c.right,st)+poly(top,c.top,st);
}
/* neon edge along the top rim of a box */
function rimLight(x,y,z,w,d,color,op){
  const t=z;
  const a=px(x,y+d,t), b=px(x+w,y+d,t), c=px(x+w,y,t);
  return lineSeg(a,b,color,1.6,' stroke-opacity="'+(op||0.55)+'" stroke-linecap="round"')
       + lineSeg(b,c,color,1.6,' stroke-opacity="'+((op||0.55)*0.7)+'" stroke-linecap="round"');
}
function hipRoof(x,y,z,w,d,rh,c){
  const A=px(x+w/2,y+d/2,z+rh);
  const st=' stroke="'+c.line+'" stroke-opacity="0.3" stroke-width="1"';
  return poly([px(x+w,y,z),px(x+w,y+d,z),A],c.right,st) + poly([px(x,y+d,z),px(x+w,y+d,z),A],c.left,st);
}
function gableRoof(x,y,z,w,d,rh,c){
  const ym=y+d/2, st=' stroke="'+c.line+'" stroke-opacity="0.3" stroke-width="1"';
  return poly([px(x+w,y,z),px(x+w,ym,z+rh),px(x+w,y+d,z)],c.right,st)
       + poly([px(x,ym,z+rh),px(x+w,ym,z+rh),px(x+w,y+d,z),px(x,y+d,z)],c.left,st);
}
/* windows on the two visible facades */
function winLeft(x,y,z,d,u0,u1,v0,v1,fill,op){
  const Y=y+d;
  return poly([px(x+u0,Y,z+v1),px(x+u1,Y,z+v1),px(x+u1,Y,z+v0),px(x+u0,Y,z+v0)],fill,' opacity="'+(op==null?0.9:op)+'"');
}
function winRight(x,y,z,w,u0,u1,v0,v1,fill,op){
  const X=x+w;
  return poly([px(X,y+u0,z+v1),px(X,y+u1,z+v1),px(X,y+u1,z+v0),px(X,y+u0,z+v0)],fill,' opacity="'+(op==null?0.62:op)+'"');
}
function windowGrid(x,y,z,w,d,h,cols,rows,fill,lit){
  let s='';
  const mx=0.14, mz=0.20;
  const cw=(w-mx*(cols+1))/cols, dw=(d-mx*(cols+1))/cols, ch=(h-mz*(rows+1))/rows;
  for (let r=0;r<rows;r++){
    const v0=mz+r*(ch+mz);
    for (let c=0;c<cols;c++){
      const on = lit ? lit(r,c) : true;
      const f = on ? fill : '#16233b';
      s += winLeft (x,y,z,d, mx+c*(cw+mx), mx+c*(cw+mx)+cw, v0, v0+ch, f, on?0.95:0.7);
      s += winRight(x,y,z,w, mx+c*(dw+mx), mx+c*(dw+mx)+dw, v0, v0+ch, f, on?0.6:0.42);
    }
  }
  return s;
}
function glowSpot(x,y,z,color,r,op){
  const p=px(x,y,z);
  return '<ellipse cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" rx="'+r+'" ry="'+(r*0.5).toFixed(1)
       + '" fill="'+color+'" opacity="'+(op||0.14)+'" filter="url(#soft)"/>';
}
function tree(x,y,z,s){
  const k=s||1, b=px(x,y,z);
  return '<g>'
   + '<ellipse cx="'+b[0].toFixed(1)+'" cy="'+(b[1]-1).toFixed(1)+'" rx="'+(8*k).toFixed(1)+'" ry="'+(2.6*k).toFixed(1)+'" fill="#04070e" opacity="0.55"/>'
   + '<rect x="'+(b[0]-1.2).toFixed(1)+'" y="'+(b[1]-12*k).toFixed(1)+'" width="2.4" height="'+(12*k).toFixed(1)+'" fill="#1e2b3c"/>'
   + '<ellipse cx="'+b[0].toFixed(1)+'" cy="'+(b[1]-20*k).toFixed(1)+'" rx="'+(9.5*k).toFixed(1)+'" ry="'+(11.5*k).toFixed(1)+'" fill="#1b5c4b"/>'
   + '<ellipse cx="'+(b[0]-3*k).toFixed(1)+'" cy="'+(b[1]-23.5*k).toFixed(1)+'" rx="'+(6*k).toFixed(1)+'" ry="'+(6.8*k).toFixed(1)+'" fill="#2b8467"/>'
   + '</g>';
}
function lamp(x,y,z,color,h){
  const H=h==null?1.9:h, b=px(x,y,z), t=px(x,y,z+H);
  return '<g>'
   + lineSeg(b,t,'#2b3d5a',1.7)
   + '<circle cx="'+t[0].toFixed(1)+'" cy="'+t[1].toFixed(1)+'" r="15" fill="'+color+'" opacity="0.15" filter="url(#soft)"/>'
   + '<circle cx="'+t[0].toFixed(1)+'" cy="'+t[1].toFixed(1)+'" r="2.8" fill="'+color+'"/>'
   + '</g>';
}
/* elevated plot with a lit edge */
function platform(cx,cy,S,accent,thick){
  const x=cx-S/2, y=cy-S/2, t=thick==null?0.40:thick;
  const c = pal('#131e33');
  const top=[px(x,y,t),px(x+S,y,t),px(x+S,y+S,t),px(x,y+S,t)];
  const inset=0.36;
  const inner=[px(x+inset,y+inset,t),px(x+S-inset,y+inset,t),px(x+S-inset,y+S-inset,t),px(x+inset,y+S-inset,t)];
  const ctr=px(cx,cy,0);
  return '<ellipse cx="'+ctr[0].toFixed(1)+'" cy="'+(ctr[1]+7).toFixed(1)+'" rx="'+(S*TW*0.95).toFixed(1)
       + '" ry="'+(S*TH*0.95).toFixed(1)+'" fill="'+accent+'" opacity="0.09" filter="url(#soft)"/>'
   + box(x,y,0,S,S,t,c)
   + poly(top,'none',' stroke="'+accent+'" stroke-opacity="0.55" stroke-width="1.6"')
   + poly(inner,'#0c1526',' stroke="'+accent+'" stroke-opacity="0.13" stroke-width="1"');
}
/* raised walkway between two plots */
function road(a,b,w,accent){
  const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1;
  const nx=-dy/L*w/2, ny=dx/L*w/2, z=0.06;
  const p=[px(a[0]+nx,a[1]+ny,z),px(b[0]+nx,b[1]+ny,z),px(b[0]-nx,b[1]-ny,z),px(a[0]-nx,a[1]-ny,z)];
  const s=px(a[0],a[1],z+0.01), e=px(b[0],b[1],z+0.01);
  return poly(p,'url(#roadFill)',' stroke="'+(accent||'#5f95cf')+'" stroke-opacity="0.30" stroke-width="1.2"')
       + lineSeg(s,e,accent||'#5f95cf',1.4,' stroke-opacity="0.5" stroke-dasharray="10 12"');
}

/* ------------------------------------------------------------ buildings ---- */
function building(kind, cx, cy, S, accent, lit){
  const x0=cx-S/2, y0=cy-S/2, z=0.40;
  const warm='#ffcf87', cool='#93ecff';
  const glass = lit ? mix(accent,'#ffffff',0.3) : '#182842';
  const dark=pal(WALL), darker=pal(WALL_DARK), light=pal(WALL_LIT), roof=roofPal(accent);
  let s='';

  if (kind === 'studio'){
    /* teaching studio: gabled hall + practice annex */
    s += glowSpot(cx,cy+0.9,z+0.9,warm,64,0.13);
    s += box(x0+0.55,y0+0.55,z,1.75,1.5,2.15,dark);
    s += windowGrid(x0+0.55,y0+0.55,z,1.75,1.5,2.15,3,3,warm,(r,c)=>!(r===1&&c===2));
    s += gableRoof(x0+0.46,y0+0.46,z+2.15,1.93,1.68,0.85,roof);
    s += rimLight(x0+0.46,y0+0.46,z+2.15,1.93,1.68,accent,0.5);
    s += box(x0+0.5,y0+2.25,z,1.05,0.72,1.15,darker);
    s += gableRoof(x0+0.44,y0+2.19,z+1.15,1.17,0.84,0.4,roof);
    s += winLeft(x0+0.5,y0+2.25,z,0.72,0.24,0.8,0.2,0.78,warm,0.95);
    s += box(x0+0.8,y0+2.12,z,1.3,0.22,0.12,darker);
    s += tree(x0+2.62,y0+0.5,z,1.0)+tree(x0+2.78,y0+1.62,z,0.85)
       + tree(x0+0.3,y0+2.72,z,0.9)+tree(x0+1.9,y0+2.85,z,0.75);
    s += lamp(x0+2.75,y0+2.75,z,warm,2.0);
  } else if (kind === 'ledger'){
    /* bookkeeping townhouse: ordered storeys under a mansard cap */
    s += glowSpot(cx,cy,z+1.3,accent,60,0.13);
    s += box(x0+0.6,y0+0.7,z,1.9,1.5,2.9,dark);
    s += windowGrid(x0+0.6,y0+0.7,z,1.9,1.5,2.9,3,4,glass,(r,c)=>!(r===1&&c===1));
    s += box(x0+0.48,y0+0.58,z+2.9,2.14,1.74,0.16,roof);
    s += rimLight(x0+0.48,y0+0.58,z+3.06,2.14,1.74,accent,0.6);
    s += hipRoof(x0+0.6,y0+0.7,z+3.06,1.9,1.5,0.78,roof);
    s += box(x0+2.15,y0+0.95,z+3.06,0.22,0.22,0.8,darker);
    s += box(x0+0.85,y0+2.22,z,1.1,0.24,0.14,darker);
    s += winLeft(x0+0.6,y0+0.7,z,1.5,0.6,1.0,0.06,0.62,warm,0.95);
    s += lamp(x0+2.75,y0+0.5,z,accent,2.0)+lamp(x0+0.4,y0+2.8,z,accent,1.7);
    s += tree(x0+2.72,y0+2.6,z,0.95)+tree(x0+2.85,y0+1.55,z,0.8);
  } else if (kind === 'greenhouse'){
    /* compost yard: brick base, glass gable, planting beds */
    s += glowSpot(cx,cy,z+0.8,accent,66,0.14);
    s += box(x0+0.5,y0+0.6,z,2.1,1.45,1.25,darker);
    s += winLeft(x0+0.5,y0+0.6,z,1.45,0.24,0.95,0.2,0.95,lit?accent:'#182842',0.8);
    s += winLeft(x0+0.5,y0+0.6,z,1.45,1.14,1.86,0.2,0.95,lit?accent:'#182842',0.8);
    const g = {top:mix('#0f2530',accent,0.3), left:mix('#0f2530',accent,0.34),
               right:mix('#0a1c26',accent,0.16), line:mix('#ffffff',accent,0.55)};
    s += gableRoof(x0+0.44,y0+0.54,z+1.25,2.22,1.57,1.35,g);
    for (let i=1;i<5;i++){
      const a=px(x0+0.44+i*0.444, y0+2.11, z+1.25), b=px(x0+0.44+i*0.444, y0+1.325, z+2.6);
      s += lineSeg(a,b,mix('#0a1a22',accent,0.36),1.5,' opacity="0.9"');
    }
    s += rimLight(x0+0.44,y0+0.54,z+1.25,2.22,1.57,accent,0.4);
    for (let i=0;i<3;i++) s += box(x0+0.55+i*0.5,y0+2.35,z,0.36,0.68,0.16,pal('#22402f'));
    s += box(x0+2.62,y0+1.7,z,0.46,0.46,0.5,pal('#27362a'));
    s += tree(x0+2.78,y0+0.5,z,0.95)+tree(x0+2.5,y0+2.85,z,1.1)+tree(x0+0.3,y0+2.5,z,0.8);
    s += lamp(x0+0.38,y0+0.42,z,accent,1.8);
  } else if (kind === 'workshop'){
    /* repair shop: wide bay, roll-up door, lit workbench */
    s += glowSpot(cx,cy+0.9,z+0.6,cool,68,0.16);
    s += box(x0+0.45,y0+0.62,z,2.2,1.5,1.85,dark);
    s += winLeft(x0+0.45,y0+0.62,z,1.5,0.24,1.16,0.12,1.15,lit?cool:'#16263f',0.88);
    for (let i=1;i<5;i++){
      const yy=z+0.12+i*0.206;
      s += lineSeg(px(x0+0.69,y0+2.12,yy), px(x0+1.61,y0+2.12,yy), '#0b1728', 1.2, ' opacity="0.75"');
    }
    s += winLeft(x0+0.45,y0+0.62,z,1.5,1.36,1.98,0.75,1.55,warm,0.9);
    s += winRight(x0+0.45,y0+0.62,z,2.2,0.3,1.2,0.7,1.5,lit?cool:'#16263f',0.55);
    s += box(x0+0.36,y0+0.53,z+1.85,2.38,1.68,0.16,roof);
    s += rimLight(x0+0.36,y0+0.53,z+2.01,2.38,1.68,accent,0.62);
    s += box(x0+1.4,y0+0.9,z+2.01,0.62,0.55,0.34,{top:mix(WALL_LIT,cool,0.4),left:'#1a2a44',right:'#121f33',line:cool});
    s += box(x0+2.78,y0+1.6,z,0.32,0.66,0.62,darker);
    s += tree(x0+2.8,y0+2.6,z,0.95)+tree(x0+0.32,y0+2.7,z,0.8)+tree(x0+2.85,y0+0.45,z,0.72);
    s += lamp(x0+0.38,y0+0.4,z,cool,2.0);
  } else if (kind === 'storefront'){
    /* mending shop: storefront, awning, warm counter light */
    s += glowSpot(cx,cy+0.9,z+0.7,warm,58,0.15);
    s += box(x0+0.6,y0+0.78,z,1.85,1.4,1.95,dark);
    s += windowGrid(x0+0.6,y0+0.78,z,1.85,1.4,1.95,3,3,warm,(r,c)=>!(r===2&&c===0));
    s += gableRoof(x0+0.52,y0+0.7,z+1.95,2.01,1.56,0.72,roof);
    s += rimLight(x0+0.52,y0+0.7,z+1.95,2.01,1.56,accent,0.55);
    const y1=y0+2.18, y2=y0+2.58, zA=z+1.1, zB=z+0.82;
    s += poly([px(x0+0.58,y1,zA),px(x0+2.47,y1,zA),px(x0+2.47,y2,zB),px(x0+0.58,y2,zB)], mix('#181f33',accent,0.28),' opacity="0.96"');
    for (let i=0;i<5;i++){
      const a=x0+0.58+i*0.378, b=Math.min(a+0.19,x0+2.47);
      s += poly([px(a,y1,zA),px(b,y1,zA),px(b,y2,zB),px(a,y2,zB)], mix('#12182a',accent,0.1),' opacity="0.92"');
    }
    s += lineSeg(px(x0+0.58,y2,zB),px(x0+2.47,y2,zB),accent,1.5,' stroke-opacity="0.6"');
    s += box(x0+0.75,y0+2.6,z,1.5,0.18,0.1,darker);
    s += tree(x0+2.8,y0+0.66,z,0.9)+tree(x0+0.32,y0+2.72,z,0.95)+tree(x0+2.72,y0+2.75,z,0.75);
    s += lamp(x0+2.85,y0+1.6,z,accent,1.8);
  } else { /* tower — software */
    s += glowSpot(cx,cy,z+1.8,accent,62,0.15);
    s += box(x0+0.85,y0+0.9,z,1.4,1.35,4.3,dark);
    s += windowGrid(x0+0.85,y0+0.9,z,1.4,1.35,4.3,3,7,lit?cool:'#16263f',(r,c)=>!((r===1&&c===0)||(r===4&&c===2)||(r===5&&c===1)));
    s += box(x0+0.72,y0+0.77,z+4.3,1.66,1.61,0.16,roof);
    s += rimLight(x0+0.72,y0+0.77,z+4.46,1.66,1.61,accent,0.7);
    s += box(x0+1.05,y0+1.1,z+4.46,0.95,0.9,0.42,light);
    const tp=px(x0+1.52,y0+1.55,z+4.88), tq=px(x0+1.52,y0+1.55,z+6.0);
    s += lineSeg(tp,tq,'#3d5f8f',1.5)
       + '<circle cx="'+tq[0].toFixed(1)+'" cy="'+tq[1].toFixed(1)+'" r="13" fill="'+accent+'" opacity="0.2" filter="url(#soft)"/>'
       + '<circle cx="'+tq[0].toFixed(1)+'" cy="'+tq[1].toFixed(1)+'" r="2.6" fill="'+accent+'"/>';
    s += box(x0+0.5,y0+2.15,z,1.15,0.72,0.9,darker);
    s += winLeft(x0+0.5,y0+2.15,z,0.72,0.22,0.92,0.16,0.68,lit?cool:'#16263f',0.75);
    s += tree(x0+2.72,y0+0.55,z,0.9)+tree(x0+2.8,y0+2.5,z,1.0)+tree(x0+0.32,y0+0.55,z,0.75);
    s += lamp(x0+2.8,y0+1.5,z,cool,2.0);
  }
  return s;
}

/* --------------------------------------------------- leadership tower ---- */
function headquarters(cx,cy,S){
  const x0=cx-S/2, y0=cy-S/2, z=0.44;
  const gold='#f4c95d', warm='#ffe3a6';
  const shaft=pal('#1c2a4c'), wing=pal('#17233d'), trim=roofPal(gold), light=pal('#243257');
  let s='';
  s += glowSpot(cx,cy,z+2.4,gold,120,0.10);

  /* podium */
  s += box(x0+0.55,y0+0.55,z,3.9,3.9,0.5,pal('#141e36'));
  s += box(x0+0.72,y0+0.72,z+0.5,3.56,3.56,0.16,trim);
  s += rimLight(x0+0.72,y0+0.72,z+0.66,3.56,3.56,gold,0.5);

  /* flanking wings */
  s += box(x0+0.85,y0+1.7,z+0.66,1.0,1.9,2.0,wing);
  s += windowGrid(x0+0.85,y0+1.7,z+0.66,1.0,1.9,2.0,3,3,warm);
  s += hipRoof(x0+0.78,y0+1.63,z+2.66,1.14,2.04,0.36,trim);
  s += box(x0+1.7,y0+0.85,z+0.66,1.9,1.0,2.0,wing);
  s += windowGrid(x0+1.7,y0+0.85,z+0.66,1.9,1.0,2.0,3,3,warm);
  s += hipRoof(x0+1.63,y0+0.78,z+2.66,2.04,1.14,0.36,trim);

  /* main shaft */
  s += box(x0+1.62,y0+1.62,z+0.66,1.8,1.8,6.0,shaft);
  s += windowGrid(x0+1.62,y0+1.62,z+0.66,1.8,1.8,6.0,4,9,warm,(r,c)=>!((r===3&&c===1)||(r===6&&c===2)));
  s += box(x0+1.46,y0+1.46,z+6.66,2.12,2.12,0.18,trim);
  s += rimLight(x0+1.46,y0+1.46,z+6.84,2.12,2.12,gold,0.85);

  /* setback tier */
  s += box(x0+1.82,y0+1.82,z+6.84,1.4,1.4,1.5,light);
  s += windowGrid(x0+1.82,y0+1.82,z+6.84,1.4,1.4,1.5,3,2,warm);
  s += box(x0+1.7,y0+1.7,z+8.34,1.64,1.64,0.15,trim);
  s += rimLight(x0+1.7,y0+1.7,z+8.49,1.64,1.64,gold,0.9);

  /* spire tier */
  s += box(x0+2.05,y0+2.05,z+8.49,0.94,0.94,1.05,shaft);
  s += windowGrid(x0+2.05,y0+2.05,z+8.49,0.94,0.94,1.05,2,1,warm);
  s += hipRoof(x0+1.98,y0+1.98,z+9.54,1.08,1.08,0.8,trim);

  /* crown */
  const cp = px(x0+2.52,y0+2.52,z+10.34);
  const crownY = cp[1];
  s += '<circle cx="'+cp[0].toFixed(1)+'" cy="'+crownY.toFixed(1)+'" r="54" fill="'+gold+'" opacity="0.13" filter="url(#soft)"/>';
  s += '<circle cx="'+cp[0].toFixed(1)+'" cy="'+crownY.toFixed(1)+'" r="24" fill="'+gold+'" opacity="0.2" filter="url(#soft)"/>';
  s += '<ellipse cx="'+cp[0].toFixed(1)+'" cy="'+(crownY+9).toFixed(1)+'" rx="26" ry="9" fill="none" stroke="'+gold+'" stroke-width="2" stroke-opacity="0.75"/>';
  /* five points of a crown */
  const peaks=[[-20,-4],[-10,-16],[0,-24],[10,-16],[20,-4]];
  let crown='M'+(cp[0]-24).toFixed(1)+' '+(crownY+9).toFixed(1);
  for (const [dx,dy] of peaks) crown += ' L'+(cp[0]+dx).toFixed(1)+' '+(crownY+9+dy).toFixed(1);
  crown += ' L'+(cp[0]+24).toFixed(1)+' '+(crownY+9).toFixed(1)+' Z';
  s += '<path d="'+crown+'" fill="'+gold+'" opacity="0.92"/>';
  s += '<circle cx="'+cp[0].toFixed(1)+'" cy="'+(crownY-30).toFixed(1)+'" r="4.5" fill="#fff6e0"/>';
  s += '<circle cx="'+cp[0].toFixed(1)+'" cy="'+(crownY-30).toFixed(1)+'" r="17" fill="'+gold+'" opacity="0.28" filter="url(#soft)"/>';

  /* grounds */
  s += tree(x0+0.42,y0+0.42,z,1.0)+tree(x0+4.6,y0+0.45,z,0.9)+tree(x0+0.45,y0+4.6,z,0.9)+tree(x0+4.6,y0+4.6,z,1.05)
     + tree(x0+0.4,y0+2.6,z,0.75)+tree(x0+2.6,y0+0.4,z,0.75);
  s += lamp(x0+0.5,y0+3.5,z,gold,2.1)+lamp(x0+3.5,y0+0.5,z,gold,2.1)
     + lamp(x0+4.55,y0+2.6,z,gold,1.9)+lamp(x0+2.6,y0+4.55,z,gold,1.9);
  return s;
}

/* ------------------------------------------------------------- layout ---- */
/* roof height per building kind, so each label hugs its own building */
const ROOF_Z = {studio:3.40, ledger:4.24, greenhouse:3.00, workshop:2.75, storefront:3.07, tower:6.40};
const HQ = {cx:0, cy:0, S:4.9, roofZ:11.2};
const PLOT_S = 3.3;
const SLOTS = [
  {cx:-6.925, cy:-0.675},   /* back left   */
  {cx:-0.675, cy:-6.925},   /* back right  */
  {cx:-3.244, cy: 5.644},   /* mid left    */
  {cx: 5.644, cy:-3.244},   /* mid right   */
  {cx: 3.892, cy: 9.308},   /* front left  */
  {cx: 9.308, cy: 3.892},   /* front right */
  {cx:-12.16, cy:-1.045},   /* overflow ring */
  {cx:-1.045, cy:-12.16},
  {cx: 4.185, cy: 15.015},
  {cx: 15.015, cy: 4.185},
];

function svgDefs(){
  return '<defs>'
   + '<filter id="soft" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="9"/></filter>'
   + '<filter id="softer" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="30"/></filter>'
   + '<linearGradient id="roadFill" x1="0" y1="0" x2="0" y2="1">'
   +   '<stop offset="0%" stop-color="#16243d"/><stop offset="100%" stop-color="#0e1829"/></linearGradient>'
   + '<radialGradient id="groundGlow" cx="50%" cy="50%" r="50%">'
   +   '<stop offset="0%" stop-color="#4763c4" stop-opacity="0.30"/>'
   +   '<stop offset="55%" stop-color="#2e2f86" stop-opacity="0.12"/>'
   +   '<stop offset="100%" stop-color="#080d1e" stop-opacity="0"/></radialGradient>'
   + '</defs>';
}

/* Two-pass labels: draw the text, measure it, then fit the plate around it so
   nothing is ever clipped or truncated awkwardly. */
function pinMarkup(id, cx, cy, liftZ, title, sub, opt){
  const o = opt||{};
  const p = px(cx,cy,liftZ);
  const cls = o.hq ? ' hq' : '';
  const words = clean(title).split(/\s+/);
  let l1 = clean(title), l2 = '';
  if (l1.length > 22 && words.length > 1){
    let best = 0, acc = 0;
    for (let i=0;i<words.length-1;i++){ acc += words[i].length+1; if (Math.abs(acc - l1.length/2) < Math.abs(best - l1.length/2)) best = acc; }
    let cut = 0, n = 0;
    for (let i=0;i<words.length-1;i++){ n += words[i].length+1; if (n >= best){ cut = i+1; break; } }
    if (!cut) cut = Math.ceil(words.length/2);
    l1 = words.slice(0,cut).join(' ');
    l2 = words.slice(cut).join(' ');
  }
  return '<g class="pin" data-pin="'+esc(id)+'" data-ax="'+p[0].toFixed(1)+'" data-ay="'+p[1].toFixed(1)+'" '
       +   'data-two="'+(l2?'1':'0')+'" data-hq="'+(o.hq?'1':'0')+'">'
   + '<line class="pin-stem" x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+p[0].toFixed(1)+'" y2="'+p[1].toFixed(1)+'" '
   +   'stroke="'+(o.accent||'#7fd8f0')+'" stroke-opacity="0.4" stroke-width="1.2"/>'
   + '<rect class="pinbox" rx="12" fill="rgba(7,13,26,0.93)" stroke="'+(o.accent||'rgba(74,108,158,0.75)')+'" stroke-opacity="0.6" stroke-width="1.2"/>'
   + '<circle class="pin-dot" r="4.2" fill="'+(o.dot||o.accent||'#7fd8f0')+'"/>'
   + '<text class="pin-name'+cls+'" x="0" y="0">'+esc(l1)+'</text>'
   + (l2 ? '<text class="pin-name2'+cls+'" x="0" y="0">'+esc(l2)+'</text>' : '')
   + '<text class="pin-sub'+cls+'" x="0" y="0">'+esc(sub)+'</text>'
   + '</g>';
}

function layoutPins(svg){
  const PAD_X = 17, PAD_T = 14, PAD_B = 13, GAP = 5, STEM = 20;
  svg.querySelectorAll('.pin').forEach(g => {
    const ax = parseFloat(g.getAttribute('data-ax'));
    const ay = parseFloat(g.getAttribute('data-ay'));
    const name  = g.querySelector('.pin-name');
    const name2 = g.querySelector('.pin-name2');
    const sub   = g.querySelector('.pin-sub');
    const box   = g.querySelector('.pinbox');
    const dot   = g.querySelector('.pin-dot');
    const stem  = g.querySelector('.pin-stem');

    /* measure from a known origin so re-layout on resize stays stable */
    name.setAttribute('x','0'); name.setAttribute('y','0');
    if (name2){ name2.setAttribute('x','0'); name2.setAttribute('y','0'); }
    sub.setAttribute('x','0');  sub.setAttribute('y','0');
    const nb = name.getBBox();
    const n2b = name2 ? name2.getBBox() : null;
    const sb = sub.getBBox();
    const DOT = 15;
    const textW = Math.max(nb.width, n2b ? n2b.width : 0, sb.width);
    const w = textW + DOT + PAD_X*2;
    const lineH = nb.height;
    const h = PAD_T + lineH + (n2b ? n2b.height + 1 : 0) + GAP + sb.height + PAD_B;

    const x = ax - w/2;
    const y = ay - STEM - h;
    box.setAttribute('x', x.toFixed(1));
    box.setAttribute('y', y.toFixed(1));
    box.setAttribute('width', w.toFixed(1));
    box.setAttribute('height', h.toFixed(1));

    const tx = x + PAD_X + DOT;
    let baseline = y + PAD_T - nb.y;
    name.setAttribute('x', tx.toFixed(1));
    name.setAttribute('y', baseline.toFixed(1));
    if (name2){
      baseline += n2b.height + 1;
      name2.setAttribute('x', tx.toFixed(1));
      name2.setAttribute('y', baseline.toFixed(1));
    }
    sub.setAttribute('x', tx.toFixed(1));
    sub.setAttribute('y', (baseline + GAP + sb.height*0.82).toFixed(1));

    dot.setAttribute('cx', (x + PAD_X - 1).toFixed(1));
    dot.setAttribute('cy', (y + PAD_T + lineH*0.42).toFixed(1));

    stem.setAttribute('y1', (y + h).toFixed(1));
    stem.setAttribute('y2', ay.toFixed(1));
  });
}

let VILLAGE_BUILT = false;
function renderVillage(){
  const svg = document.getElementById('villageSvg');
  if (!STATE.portfolio){
    svg.innerHTML = svgDefs();
    svg.setAttribute('viewBox','-400 -140 800 280');
    return;
  }
  const cos = STATE.portfolio.companies;
  const plots = cos.map((co,i) => Object.assign({}, SLOTS[i % SLOTS.length], {co, S:PLOT_S}));

  let s = svgDefs();
  s += '<ellipse cx="0" cy="60" rx="1050" ry="330" fill="url(#groundGlow)"/>';
  s += '<g opacity="0.55">';
  for (let i=0;i<34;i++){
    const a=(i*137.5)%360, r=340+((i*97)%620);
    const sx=Math.cos(a*Math.PI/180)*r*1.6, sy=Math.sin(a*Math.PI/180)*r*0.34-260;
    s += '<circle cx="'+sx.toFixed(0)+'" cy="'+sy.toFixed(0)+'" r="'+(0.7+(i%3)*0.4).toFixed(1)
       + '" fill="#a8ccff" opacity="'+(0.14+(i%4)*0.09).toFixed(2)+'"/>';
  }
  s += '</g>';

  s += '<g id="villageContent">';
  s += '<g class="roads">';
  for (const p of plots) s += road([HQ.cx,HQ.cy],[p.cx,p.cy],0.7, styleFor(p.co).accent);
  s += '</g>';

  const order = plots.concat([{cx:HQ.cx, cy:HQ.cy, S:HQ.S, hq:true}])
                     .sort((a,b) => (a.cx+a.cy)-(b.cx+b.cy));
  for (const p of order){
    if (p.hq){
      const leaders = STATE.portfolio.leadership.length;
      s += '<g class="plot" tabindex="0" role="button" data-go="#/hq" aria-label="Headquarters — portfolio leadership">'
        + '<g class="lift">'
        +   '<ellipse class="halo" cx="0" cy="0" rx="440" ry="180" fill="#f4c95d" opacity="0.11" filter="url(#softer)"/>'
        +   platform(HQ.cx,HQ.cy,HQ.S,'#f4c95d',0.44)
        +   headquarters(HQ.cx,HQ.cy,HQ.S)
        + '</g>'
        + pinMarkup('hq',HQ.cx,HQ.cy,HQ.roofZ+1.6,'Headquarters',
            leaders ? (plural(leaders,'leader') + ' across the portfolio') : 'Portfolio leadership',
            {hq:true, accent:'#f4c95d', dot:'#f4c95d'})
        + '</g>';
    } else {
      const co = p.co, st = styleFor(co);
      const n = co.employees.length;
      const lit = n > 0;
      const sub = (n ? plural(n,'employee') : 'No team yet') + (co.pending ? ' · needs you' : '');
      const c = px(p.cx,p.cy,0);
      s += '<g class="plot" tabindex="0" role="button" data-go="#/c/'+encodeURIComponent(co.id)+'" '
        +   'aria-label="'+esc(co.name)+' — open this business">'
        + '<g class="lift">'
        +   '<ellipse class="halo" cx="'+c[0].toFixed(0)+'" cy="'+c[1].toFixed(0)+'" rx="290" ry="120" fill="'+st.accent+'" opacity="0.14" filter="url(#softer)"/>'
        +   platform(p.cx,p.cy,p.S,st.accent)
        +   building(st.kind,p.cx,p.cy,p.S,st.accent,lit)
        + '</g>'
        + pinMarkup(co.id,p.cx,p.cy,(ROOF_Z[st.kind]||3.4)+1.35,co.name,sub,
            {accent:st.accent, dot: co.pending ? '#f4c95d' : (lit ? '#3ddba3' : '#54678c')})
        + '</g>';
    }
  }
  s += '</g>';
  svg.innerHTML = s;

  layoutPins(svg);

  try{
    const b = svg.querySelector('#villageContent').getBBox();
    const padX = 60, padY = 46;
    const vw = b.width+padX*2, vh = b.height+padY*2;
    svg.setAttribute('viewBox', (b.x-padX).toFixed(0)+' '+(b.y-padY).toFixed(0)+' '+vw.toFixed(0)+' '+vh.toFixed(0));
    svg.setAttribute('width', vw.toFixed(0));
    svg.setAttribute('height', vh.toFixed(0));
  }catch(e){}

  svg.querySelectorAll('.plot').forEach(g => {
    const go = g.getAttribute('data-go');
    g.addEventListener('click', () => { location.hash = go; });
    g.addEventListener('keydown', e => {
      if (e.key==='Enter' || e.key===' '){ e.preventDefault(); location.hash = go; }
    });
  });
  VILLAGE_BUILT = true;
}

function renderVillageChrome(){
  const p = STATE.portfolio;
  const mEl = document.getElementById('vMetrics');
  const aEl = document.getElementById('vActions');
  if (!p){ mEl.innerHTML=''; aEl.innerHTML=''; return; }
  const employees = p.companies.reduce((n,c)=>n+c.employees.length,0);
  const spend     = p.companies.reduce((n,c)=>n+(c.spendUsd||0),0);
  const revenue   = p.companies.reduce((n,c)=>n+(c.revenueUsd||0),0);
  const pending   = p.companies.reduce((n,c)=>n+(c.pending||0),0);

  const m = [];
  m.push(vmetric('Businesses', String(p.companies.length)));
  m.push(vmetric('Employees', String(employees)));
  m.push(vmetric('Recorded spending', spend > 0 ? usd(spend) : 'None recorded'));
  m.push(vmetric('Recorded revenue', revenue > 0 ? usd(revenue) : 'No revenue recorded yet'));
  if (pending > 0) m.push(vmetric('Waiting on you', plural(pending,'decision'), true));
  mEl.innerHTML = m.join('');

  aEl.innerHTML =
      '<a class="btn primary" href="#/new">Start a business</a>'
    + '<a class="btn" href="#/grow">Grow an existing one</a>'
    + '<a class="btn ghost" href="#/command">Ask the team</a>'
    + '<a class="btn ghost" href="#/settings" aria-label="Settings">Settings</a>';
}
function vmetric(label, value, attn){
  const na = /not recorded|none recorded|no revenue/i.test(value);
  return '<div class="vmetric'+(attn?' attn':'')+'"><span class="kicker">'+esc(label)+'</span>'
       + '<b class="'+(na?'na':'')+'">'+esc(value)+'</b></div>';
}
/* ============================================================================
   APPLICATION SHELL — one chrome for every non-village screen
   ============================================================================ */
const COMPANY_NAV = [
  ['overview',  'Overview',  ''],
  ['team',      'Team',      '/team'],
  ['work',      'Work',      '/work'],
  ['outputs',   'Outputs',   '/outputs'],
  ['knowledge', 'Knowledge', '/knowledge'],
  ['training',  'Training',  '/training'],
  ['research',  'Research',  '/research'],
  ['teaching',  'Teaching',  '/teaching'],
  ['foundry',   'Learning engine', '/foundry'],
  ['opportunities','Opportunities','/opportunities'],
  ['approvals', 'Approvals', '/approvals'],
  ['money',     'Money',     '/money'],
];
const PORTFOLIO_NAV = [
  ['hq',           'Headquarters',  '#/hq'],
  ['businesses',   'All businesses','#/businesses'],
  ['finances',     'Money',         '#/finances'],
  ['approvals',    'Approvals',     '#/approvals'],
  ['command',      'Ask the team',  '#/command'],
  ['settings',     'Settings',      '#/settings'],
];

function sideCompany(co, active){
  const base = '#/c/'+encodeURIComponent(co.id);
  const st = styleFor(co);
  let h = '<a class="side-back" href="#/">&#8592;&nbsp; Portfolio village</a>'
    + '<div class="side-ident"><div class="side-glyph" style="color:'+st.accent+'">'+st.glyph+'</div>'
    + '<div><h2>'+esc(co.name)+'</h2><p>'+esc(industryLabel(co))+'</p></div></div>'
    + '<div class="side-group"><span class="kicker">This business</span>';
  for (const [id,label,suffix] of COMPANY_NAV){
    const n = (id === 'approvals' && co.pending) ? '<span class="n">'+co.pending+'</span>' : '';
    h += '<a class="side-link'+(active===id?' on':'')+'" href="'+base+suffix+'">'
       + '<span>'+esc(label)+'</span>'+n+'</a>';
  }
  h += '</div>';

  const team = sortedTeam(co.employees);
  if (team.length){
    h += '<div class="side-group"><span class="kicker">People</span>';
    for (const e of team){
      const m = roleMeta(e.roleId);
      const bundle = STATE.company[co.id];
      const s = employeeState(e, bundle ? bundle.pendingByEmployee : {});
      h += '<a class="side-emp" href="'+base+'/e/'+encodeURIComponent(e.id)+'">'
        + '<span class="sq">'+m.glyph+'</span>'
        + '<span class="nm">'+esc(empName(e))+'<em>'+esc(m.layer)+'</em></span>'
        + '<span class="dot '+s.key+'" title="'+esc(s.label)+'"></span></a>';
    }
    h += '</div>';
  }
  h += '<div class="side-foot"><span class="kicker" style="padding:0 10px 7px">Portfolio</span>'
    + '<a class="side-link" href="#/hq">Headquarters</a>'
    + '<a class="side-link" href="#/finances">Portfolio money</a>'
    + '<a class="side-link" href="#/settings">Settings</a></div>';
  return h;
}

function sidePortfolio(active){
  const p = STATE.portfolio;
  let h = '<a class="side-back" href="#/">&#8592;&nbsp; Portfolio village</a>'
    + '<div class="side-ident"><div class="side-glyph" style="color:var(--gold)">&#9819;</div>'
    + '<div><h2>MIDAS</h2><p>Founder operating system</p></div></div>'
    + '<div class="side-group"><span class="kicker">Portfolio</span>';
  const pending = p ? p.companies.reduce((n,c)=>n+(c.pending||0),0) : 0;
  for (const [id,label,href] of PORTFOLIO_NAV){
    const n = (id === 'approvals' && pending) ? '<span class="n">'+pending+'</span>' : '';
    h += '<a class="side-link'+(active===id?' on':'')+'" href="'+href+'"><span>'+esc(label)+'</span>'+n+'</a>';
  }
  h += '</div>';
  if (p && p.companies.length){
    h += '<div class="side-group"><span class="kicker">Businesses</span>';
    for (const c of p.companies){
      const st = styleFor(c);
      h += '<a class="side-emp" href="#/c/'+encodeURIComponent(c.id)+'">'
        + '<span class="sq" style="color:'+st.accent+'">'+st.glyph+'</span>'
        + '<span class="nm">'+esc(c.name)+'<em>'+esc(plural(c.employees.length,'person','people'))+'</em></span>'
        + '<span class="dot '+(c.pending?'wait':(c.employees.length?'ok':'idle'))+'"></span></a>';
    }
    h += '</div>';
  }
  h += '<div class="side-foot">'
    + '<a class="side-link" href="#/new">Start a business</a>'
    + '<a class="side-link" href="#/grow">Grow an existing one</a></div>';
  return h;
}

/* view = {kicker,title,sub,crumbs,right,body,mount,side,sideActive,co} */
function paint(view){
  document.getElementById('villageScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');

  document.getElementById('side').innerHTML = view.co
      ? sideCompany(view.co, view.sideActive)
      : sidePortfolio(view.sideActive);

  const crumbs = (view.crumbs||[]).map((c,i) =>
      (i ? '<i>&#8250;</i>' : '') + (c.href ? '<a href="'+c.href+'">'+esc(c.label)+'</a>' : '<span>'+esc(c.label)+'</span>')
    ).join('');
  document.getElementById('topbar').innerHTML =
      '<div style="min-width:0">'
    + (crumbs ? '<div class="crumbs">'+crumbs+'</div>' : '')
    + (view.kicker ? '<span class="kicker">'+esc(view.kicker)+'</span>' : '')
    + '<h1>'+esc(view.title||'')+'</h1>'
    + (view.sub ? '<p class="sub">'+esc(view.sub)+'</p>' : '')
    + '</div>'
    + '<div class="top-right">'+(view.right||'')+'</div>';

  const c = document.getElementById('content');
  c.innerHTML = view.body || '';
  window.scrollTo(0,0);
  if (view.mount) try { view.mount(c); } catch(e){ console.error(e); }
}

function loadingView(title){
  return {title: title||'Loading…', body:'<div class="empty">Reading your records…</div>'};
}

/* ---------------------------------------------------------- small parts ---- */
function rowLine(label, value, na){
  const isNa = na != null ? na : /^(none|not recorded|no |unknown|nothing)/i.test(String(value));
  return '<div class="row"><span>'+esc(label)+'</span><b class="'+(isNa?'na':'')+'">'+esc(value)+'</b></div>';
}
function statBox(label, value, attn){
  const na = /^(none|not recorded|no |unknown|nothing)/i.test(String(value));
  return '<div class="stat-box'+(attn?' attn':'')+'"><span>'+esc(label)+'</span>'
       + '<b class="'+(na?'na':'')+'">'+esc(value)+'</b></div>';
}
function emptyState(title, body, ctaLabel, ctaHref){
  return '<div class="empty"><b>'+esc(title)+'</b>'+esc(body||'')
       + (ctaLabel ? '<div><a class="btn sm" href="'+ctaHref+'">'+esc(ctaLabel)+'</a></div>' : '')
       + '</div>';
}
function card(kicker, title, desc, bodyHtml){
  return '<div class="card"><div class="hd"><span class="kicker">'+esc(kicker)+'</span>'
       + '<h3>'+esc(title)+'</h3>'+(desc?'<p>'+esc(desc)+'</p>':'')+'</div>'
       + '<div class="bd">'+bodyHtml+'</div></div>';
}

/* ============================================================================
   COMPANY — overview and agent network
   ============================================================================ */
function netMarkup(b){
  const co = b.co;
  const team = sortedTeam(co.employees);
  const leader = pickLeader(team);
  const specialists = team.filter(e => e !== leader);

  let net = '<div class="card">'
    + '<div class="hd"><span class="kicker">Agent network</span><h3>'
    + (leader ? esc(empName(leader)) + ' coordinating ' + plural(specialists.length,'specialist') + '.'
              : 'No manager hired for this business yet.') + '</h3>'
    + '<p>' + (leader
        ? 'Work you hand to this business goes to the ' + esc(empName(leader).toLowerCase())
          + ', who routes each step to the specialist who owns it. Everything runs supervised — nothing leaves the company.'
        : 'Specialists here have no coordinator yet. You can add a manager from the Team screen.') + '</p></div>'
    + '<div class="net"><svg id="netLines"></svg><div class="net-inner">';

  if (leader){
    const m = roleMeta(leader.roleId), s = employeeState(leader, b.pendingByEmployee);
    const tasks = (leader.taskHistory||[]).length;
    const outs = b.deliverables.filter(d => d.createdByEmployeeId === leader.id).length;
    net += '<div class="lead-row"><button class="node node-lead" data-emp="'+esc(leader.id)+'" id="netLeader">'
      + '<span class="badge '+s.key+' lead-badge"><i></i>'+esc(s.label)+'</span>'
      + '<div class="glyph">'+m.glyph+'</div>'
      + '<div class="body"><h4>'+esc(empName(leader))+'</h4>'
      +   '<p class="role">'+esc(m.layer)+'</p>'
      +   '<p class="desc">'+esc(clean(leader.jobDescription || m.blurb))+'</p></div>'
      + '<div class="stat-strip">'
      +   '<div class="stat"><span>Steps run</span><b>'+tasks+'</b></div>'
      +   '<div class="stat"><span>Outputs</span><b>'+outs+'</b></div>'
      +   '<div class="stat wide"><span>Engine</span><b>'+esc(engineLabel(leader))+'</b></div>'
      + '</div></button></div>';
  }

  if (specialists.length){
    const rowsNeeded = Math.max(1, Math.ceil(specialists.length/5));
    const perRow = Math.ceil(specialists.length/rowsNeeded);
    const rowWidth = perRow*200 + (perRow-1)*16;
    net += '<div class="spec-row" id="specRow" style="max-width:'+rowWidth+'px">' + specialists.map(e => {
      const m = roleMeta(e.roleId), s = employeeState(e, b.pendingByEmployee);
      const outs = b.deliverables.filter(d => d.createdByEmployeeId === e.id).length;
      const runs = (e.taskHistory||[]).length;
      return '<button class="node node-spec" data-emp="'+esc(e.id)+'">'
        + '<div class="top"><div class="glyph">'+m.glyph+'</div>'
        +   '<span class="badge '+s.key+'"><i></i>'+esc(s.label)+'</span></div>'
        + '<div><h5>'+esc(empName(e))+'</h5><p class="role">'+esc(m.layer)+'</p></div>'
        + '<p class="desc">'+esc(truncate(clean(e.jobDescription || m.blurb),132))+'</p>'
        + '<div class="foot"><span>Recorded work</span><b>'
        +   ((runs||outs) ? (plural(runs,'run')+' · '+plural(outs,'output')) : 'None yet')
        + '</b></div></button>';
    }).join('') + '</div>';
  } else if (leader){
    net += '<div class="empty" style="max-width:520px">No specialists hired for this business yet.</div>';
  }
  if (!leader && !specialists.length){
    net += '<div class="empty" style="max-width:520px"><b>No employees yet</b>Nobody works here yet. Hire the first person from the Team screen.</div>';
  }
  net += '</div></div></div>';
  return net;
}

function mountNet(root){
  root.querySelectorAll('[data-emp]').forEach(el =>
    el.addEventListener('click', () => {
      const co = CURRENT_CO;
      if (co) location.hash = '#/c/'+encodeURIComponent(co)+'/e/'+encodeURIComponent(el.getAttribute('data-emp'));
    }));
  requestAnimationFrame(()=>drawNetworkLines());
}

function drawNetworkLines(){
  const svg = document.getElementById('netLines');
  const lead = document.getElementById('netLeader');
  const rowEl = document.getElementById('specRow');
  if (!svg) return;
  if (!lead || !rowEl){ svg.innerHTML=''; return; }
  const host = svg.parentElement.getBoundingClientRect();
  svg.setAttribute('viewBox','0 0 '+host.width+' '+host.height);
  const L = lead.getBoundingClientRect();
  const lx = L.left - host.left + L.width/2;
  const ly = L.bottom - host.top;
  const cards = Array.from(rowEl.querySelectorAll('.node-spec'));
  if (!cards.length){ svg.innerHTML=''; return; }

  const rows = new Map();
  for (const c of cards){
    const r = c.getBoundingClientRect();
    const key = Math.round(r.top);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(r);
  }
  const keys = Array.from(rows.keys()).sort((a,b)=>a-b);
  const stroke = 'rgba(96,142,198,0.5)';
  let out = '', cursorY = ly;
  keys.forEach(k => {
    const rects = rows.get(k).sort((a,b)=>a.left-b.left);
    const top = k - host.top;
    const busY = top - 20;
    out += seg(lx, cursorY, lx, busY, stroke);
    const x0 = Math.min(lx, rects[0].left - host.left + rects[0].width/2);
    const x1 = Math.max(lx, rects[rects.length-1].left - host.left + rects[rects.length-1].width/2);
    out += seg(x0, busY, x1, busY, stroke);
    rects.forEach(r => {
      const cx = r.left - host.left + r.width/2;
      out += seg(cx, busY, cx, top, stroke);
      out += '<circle cx="'+cx.toFixed(1)+'" cy="'+top.toFixed(1)+'" r="2.6" fill="rgba(126,182,235,0.85)"/>';
    });
    cursorY = busY;
  });
  out += '<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="3" fill="rgba(157,140,250,0.9)"/>';
  svg.innerHTML = out;
}
function seg(x1,y1,x2,y2,stroke){
  return '<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)
       + '" stroke="'+stroke+'" stroke-width="1.2"/>';
}
window.addEventListener('resize', () => { if (document.getElementById('netLines')) drawNetworkLines(); });

let CURRENT_CO = null;

/* ---------------------------------------------------------- work feed ----- */
function companyFeed(b, limit){
  const co = b.co, feed = [];
  for (const d of b.deliverables){
    const by = co.employees.find(e => e.id === d.createdByEmployeeId);
    feed.push({
      at: d.createdAt || '', kind:'output', id:d.id,
      title: clean(d.title || humanKind(d.type)),
      body: truncate(firstLine(d.body) || 'No detail recorded.', 190),
      badge: humanKind(d.status || (d.draft ? 'draft' : 'saved')),
      who: by ? empName(by) : (d.createdByRoleId ? roleMeta(d.createdByRoleId).title : 'The team'),
    });
  }
  for (const o of b.objectives){
    const word = objectiveWord(o.status);
    if (word === 'Cancelled' || word === 'Rejected') continue;
    feed.push({
      at: o.completedAt || o.updatedAt || o.createdAt || '', kind:'work', id:o.id,
      title: 'You asked: ' + truncate(clean(o.ownerText||'A request'), 96),
      body: word === 'Completed' ? 'The team finished this request.'
          : word === 'Waiting on you' ? 'Finished except for a decision that is waiting on you.'
          : word === 'Blocked' ? 'Stopped before finishing. Open Work to see what it is waiting for.'
          : 'Recorded on this business.',
      badge: word, who: 'This business',
    });
  }
  feed.sort((a,b2) => String(b2.at).localeCompare(String(a.at)));
  return limit ? feed.slice(0,limit) : feed;
}
function feedItem(r, href){
  const inner = '<div class="ihd"><h6>'+esc(r.title)+'</h6>'
    + '<span class="badge '+statusTone(r.badge)+'"><i></i>'+esc(r.badge)+'</span></div>'
    + '<p>'+esc(r.body)+'</p>'
    + '<div class="meta"><span class="note">'+esc(r.who)+(r.at ? ' · '+esc(ago(r.at)) : '')+'</span></div>';
  return href ? '<a class="item" href="'+href+'">'+inner+'</a>' : '<div class="item">'+inner+'</div>';
}
/* ============================================================================
   COMPANY SCREENS
   ============================================================================ */
function coCrumbs(co, leaf){
  const c = [{label:'Portfolio village', href:'#/'}, {label:co.name, href:'#/c/'+encodeURIComponent(co.id)}];
  if (leaf) c.push({label:leaf});
  return c;
}
function coStatusPill(co){
  const tone = co.pending ? 'wait' : (co.employees.length ? 'ok' : 'idle');
  const text = co.pending ? plural(co.pending,'decision')+' waiting on you'
             : (co.employees.length ? 'Team ready · supervised' : 'No team hired yet');
  return '<span class="pill '+tone+'"><i></i>'+esc(text)+'</span>';
}

/* --------------------------------------------------------------- overview -- */
async function scrOverview(co){
  const b = await loadCompany(co.id);
  const d = b.detail || {};
  const offer = d.offer && (d.offer.summary || d.offer.name) ? clean(d.offer.summary || d.offer.name) : '';
  const goal = clean(d.goal || '');
  const desc = clean(co.description || '');
  const showOffer = offer && offer.slice(0,110) !== desc.slice(0,110);
  const objDone = b.objectives.filter(o => DONE_STATUS.indexOf(String(o.status||'').toLowerCase()) >= 0).length;
  const base = '#/c/'+encodeURIComponent(co.id);

  /* priorities */
  const prio = [];
  for (const a of (co.pendingList||[])){
    prio.push({title:'A decision is waiting on you', body:decisionSentence(a),
               href:base+'/approvals', cta:'Review it', tone:'wait', label:'Awaiting you'});
  }
  for (const o of b.objectives.filter(o => OPEN_STATUS.indexOf(String(o.status||'').toLowerCase()) >= 0).slice(0,3)){
    const w = objectiveWord(o.status);
    prio.push({title: w === 'Blocked' ? 'A request is stuck' : 'Work still open',
               body: truncate(clean(o.ownerText||''),180), href:base+'/work', cta:'Open work', tone:'idle', label:w});
  }
  if (!co.employees.length){
    prio.push({title:'No team yet', body:'This business has nobody working in it. Hire the first person to start doing work.',
               href:base+'/team', cta:'Build the team', tone:'idle', label:'Nothing hired'});
  }

  const feed = companyFeed(b, 5);

  let body = netMarkup(b);
  body += '<div class="grid2">'
    + card('Business summary', showOffer ? 'What this company sells' : 'Where this company stands', showOffer ? offer : '',
        (!showOffer && goal && goal.slice(0,110) !== desc.slice(0,110) ? '<div class="quote">'+esc(truncate(goal,320))+'</div>' : '')
        + '<div class="rows" style="margin-top:'+(showOffer||goal?'14px':'0')+'">'
        + rowLine('Team', co.employees.length ? plural(co.employees.length,'employee') : 'None hired')
        + rowLine('Work completed', b.objectives.length
              ? (objDone + ' of ' + plural(b.objectives.length,'request'))
              : 'Nothing requested yet')
        + rowLine('Outputs on file', b.deliverables.length ? String(b.deliverables.length) : 'None yet')
        + rowLine('Recorded spending', co.spendUsd > 0 ? usd(co.spendUsd) : 'None recorded')
        + rowLine('Recorded revenue', co.revenueUsd > 0 ? usd(co.revenueUsd) : 'No revenue recorded yet')
        + '</div>'
        + '<p class="note" style="margin-top:14px">Revenue shows only what has actually been observed and recorded. Nothing here is estimated or projected.</p>')
    + card('Current priorities','What needs you next','',
        prio.length
          ? '<div class="list">'+prio.map(p =>
              '<div class="item"><div class="ihd"><h6>'+esc(p.title)+'</h6>'
              + '<span class="badge '+p.tone+'"><i></i>'+esc(p.label)+'</span></div>'
              + '<p>'+esc(p.body)+'</p>'
              + '<div class="meta"><a class="btn sm" href="'+p.href+'">'+esc(p.cta)+'</a></div></div>').join('')+'</div>'
          : emptyState('All clear','Nothing is waiting on you for this business right now.','Assign new work',base+'/work/new'))
    + '</div>';

  body += card('Recent work','What has actually happened here','',
      feed.length
        ? '<div class="list">'+feed.map(r => feedItem(r, r.kind==='output' ? base+'/outputs/'+encodeURIComponent(r.id) : base+'/work')).join('')+'</div>'
          + '<div class="acts" style="margin-top:14px">'
          + '<a class="btn sm" href="'+base+'/outputs">See all outputs</a>'
          + '<a class="btn sm ghost" href="'+base+'/work">Work history</a></div>'
        : emptyState('Nothing recorded yet','Hand this business its first piece of work and it will show up here.','Assign work',base+'/work/new'));

  return {
    co, sideActive:'overview', kicker: industryLabel(co), title: co.name,
    sub: truncate(desc || goal || 'No description recorded.', 300),
    crumbs: coCrumbs(co), right: coStatusPill(co) + '<a class="btn sm primary" href="'+base+'/work/new">Assign work</a>',
    body, mount: mountNet,
  };
}

/* ------------------------------------------------------------------ team --- */
async function scrTeam(co){
  const b = await loadCompany(co.id);
  const base = '#/c/'+encodeURIComponent(co.id);
  const team = sortedTeam(co.employees);
  let body = netMarkup(b);

  body += card('Everyone here', plural(team.length,'person','people')+' on this business',
      'Each person works only inside ' + co.name + '. They cannot see another company’s records.',
      team.length
        ? '<div class="grid3">'+team.map(e => {
            const m = roleMeta(e.roleId), s = employeeState(e, b.pendingByEmployee);
            const runs = (e.taskHistory||[]).length;
            return '<a class="item" href="'+base+'/e/'+encodeURIComponent(e.id)+'">'
              + '<div class="ihd"><h6>'+m.glyph+' &nbsp;'+esc(empName(e))+'</h6>'
              + '<span class="badge '+s.key+'"><i></i>'+esc(s.label)+'</span></div>'
              + '<p>'+esc(truncate(clean(e.jobDescription || m.blurb),120))+'</p>'
              + '<div class="meta"><span class="badge idle">'+esc(m.layer)+'</span>'
              + '<span class="note">'+(runs?plural(runs,'run')+' recorded':'No work yet')+'</span></div></a>';
          }).join('')+'</div>'
        : emptyState('Nobody works here yet','Hiring happens through a team proposal you approve.'));

  body += card('Hiring','Add people to this business',
      'MIDAS proposes a team for what this business is trying to do. You approve before any seat is created.',
      '<div class="acts">'
      + '<button class="btn primary" id="proposeTeam">Propose a team for this business</button>'
      + '</div><div id="proposeOut" style="margin-top:16px"></div>'
      + '<p class="note" style="margin-top:12px">A proposal is a suggestion only. Nothing is hired until you confirm it.</p>');

  return {
    co, sideActive:'team', kicker:'Team', title:'Team and agent network',
    sub:'Who works on ' + co.name + ', what each of them does, and how work flows between them.',
    crumbs: coCrumbs(co,'Team'), right: coStatusPill(co),
    body,
    mount(root){
      mountNet(root);
      const btn = root.querySelector('#proposeTeam');
      const out = root.querySelector('#proposeOut');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Thinking…';
        const res = await apiPost('/app/teams/propose', {workspaceId: co.id});
        btn.disabled = false; btn.textContent = 'Propose a team for this business';
        if (res.error){ out.innerHTML = '<div class="empty">'+esc(errText(res))+'</div>'; return; }
        const prop = res.proposal || {};
        const seats = (prop.proposedRoles || []).filter(r => r.willCreate !== false);
        const already = res.alreadyCreated === true;
        if (!seats.length){ out.innerHTML = '<div class="empty">No new seats were suggested for this business.</div>'; return; }
        if (already){
          out.innerHTML = '<div class="empty"><b>A team is already in place</b>'
            + 'MIDAS will not quietly re-hire. The suggestion below is for reference only.</div>'
            + '<div class="list" style="margin-top:14px">'+seats.map(function(sd){
                const m = roleMeta(sd.roleId);
                return '<div class="item"><div class="ihd"><h6>'+m.glyph+' &nbsp;'+esc(m.title)+'</h6>'
                  + '<span class="badge idle">Already hired</span></div>'
                  + '<p>'+esc(clean(sd.mission || m.blurb))+'</p></div>';
              }).join('')+'</div>';
          return;
        }
        out.innerHTML = '<div class="list">'+seats.map(function(sd){
          const m = roleMeta(sd.roleId);
          return '<div class="item"><div class="ihd"><h6>'+m.glyph+' &nbsp;'+esc(m.title)+'</h6>'
            + '<span class="badge info">Proposed</span></div><p>'+esc(clean(sd.mission || m.blurb))+'</p></div>';
        }).join('')+'</div>'
        + '<div class="acts" style="margin-top:14px"><button class="btn primary" id="confirmTeam">Create these seats</button>'
        + '<span class="note">This is the only step that actually hires anyone.</span></div>';
        const cbtn = out.querySelector('#confirmTeam');
        cbtn.addEventListener('click', async () => {
          cbtn.disabled = true; cbtn.textContent = 'Creating…';
          const made = await apiPost('/app/teams/create', {workspaceId: co.id,
            createThisTeam: true, authorized: true, actor: 'owner', confirm: 'create this team'});
          if (made.error){ toast(errText(made), true); cbtn.disabled = false; cbtn.textContent = 'Create these seats'; return; }
          invalidate(co.id);
          toast('Team updated for ' + co.name + '.');
          await loadPortfolio(true);
          route();
        });
      });
    },
  };
}

/* -------------------------------------------------------------- employee --- */
async function scrEmployee(co, empId){
  const b = await loadCompany(co.id);
  const emp = co.employees.find(e => e.id === empId);
  const base = '#/c/'+encodeURIComponent(co.id);
  if (!emp){
    return {co, sideActive:'team', kicker:'Team', title:'Person not found',
            crumbs: coCrumbs(co,'Team'),
            body: emptyState('That person is not on this business','They may have been removed, or they belong to another company.','Back to the team', base+'/team')};
  }
  const m = roleMeta(emp.roleId), s = employeeState(emp, b.pendingByEmployee);
  const may = (emp.permissions && emp.permissions.may) || emp.responsibilities || [];
  const mayNot = (emp.permissions && emp.permissions.mayNot) || emp.prohibitedActions || [];

  const seen = new Set();
  const hist = (emp.taskHistory||[]).slice()
    .sort((a,b2)=>String(b2.at||'').localeCompare(String(a.at||'')))
    .filter(t => { const k = clean(t.summary||t.kind||'').slice(0,90); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0,6);
  const outputs = b.deliverables.filter(d => d.createdByEmployeeId === emp.id)
    .sort((a,b2)=>String(b2.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,6);
  const knows = b.knowledge.filter(k =>
      (k.assignedToEmployees||[]).indexOf(emp.id) >= 0 ||
      (k.assignedToRoles||[]).indexOf(emp.roleId) >= 0 ||
      k.applicableRole === emp.roleId);
  const lessons = b.training.filter(t =>
      (t.targetEmployeeIds||[]).indexOf(emp.id) >= 0 ||
      (t.targetRoleIds||[]).indexOf(emp.roleId) >= 0);

  let body = '<div class="split">';
  body += '<div style="display:flex;flex-direction:column;gap:18px">';
  body += card('Responsibilities','What they are responsible for','',
      '<p style="margin:0;font-size:13px;line-height:1.68;color:var(--text-2)">'+esc(clean(emp.jobDescription || m.blurb))+'</p>'
      + (emp.objective ? '<p style="margin:12px 0 0;font-size:12.8px;line-height:1.66;color:var(--text-2)">'+esc(truncate(clean(emp.objective),320))+'</p>' : '')
      + (may.length ? '<ul class="bul" style="margin-top:14px">'+may.slice(0,6).map(x=>'<li>'+esc(humanKind(x))+'</li>').join('')+'</ul>' : '')
      + (mayNot.length ? '<p class="note" style="margin-top:14px">Not allowed to: '+esc(mayNot.slice(0,6).map(humanKind).join(', ').toLowerCase())+'.</p>' : ''));

  body += card('Recent work','What they have actually done','',
      (hist.length || outputs.length)
        ? '<ul class="bul">'
          + hist.map(t => '<li>'+esc(sentence(clean(t.summary || humanKind(t.kind))))
              + (t.at ? ' <span class="note">· '+esc(ago(t.at))+'</span>' : '')+'</li>').join('')
          + outputs.map(d => '<li>Produced '+esc(clean(d.title || humanKind(d.type)).toLowerCase())
              + (d.createdAt ? ' <span class="note">· '+esc(ago(d.createdAt))+'</span>' : '')+'</li>').join('')
          + '</ul>'
          + (outputs.length ? '<div class="acts" style="margin-top:14px"><a class="btn sm" href="'+base+'/outputs">Open their outputs</a></div>' : '')
        : emptyState('No work recorded yet','Nothing has been assigned to this person so far.','Assign work',base+'/work/new'));

  body += card('Company knowledge','What they are allowed to use',
      'Only approved material from ' + co.name + '. Nothing from your other businesses.',
      knows.length
        ? '<div class="list">'+knows.slice(0,8).map(k =>
            '<div class="item"><p style="margin:0">'+esc(truncate(clean(k.statement || k.excerpt),220))+'</p>'
            + '<div class="meta"><span class="badge idle">'+esc(humanKind(k.classification))+'</span>'
            + '<span class="badge '+(k.reviewStatus==='approved'?'ok':'idle')+'">'+esc(humanKind(k.reviewStatus||'recorded'))+'</span></div></div>').join('')+'</div>'
        : emptyState('Nothing assigned yet','No approved company knowledge has been given to this person.','Teach them something',base+'/training'));

  body += card('Training and lessons','What you have taught them','',
      lessons.length
        ? '<div class="list">'+lessons.slice(0,8).map(t =>
            '<div class="item"><div class="ihd"><h6>'+esc(clean(t.title || humanKind(t.classification)))+'</h6>'
            + '<span class="badge '+(String(t.ownerApprovalStatus)==='approved'?'ok':'wait')+'"><i></i>'+esc(humanKind(t.ownerApprovalStatus||'recorded'))+'</span></div>'
            + (t.extractedClaims && t.extractedClaims.length
                ? '<p>'+esc(truncate(clean(t.extractedClaims[0].statement),200))+'</p>' : '')
            + '</div>').join('')+'</div>'
        : emptyState('No lessons yet','Nothing has been taught to this person.','Train them',base+'/training'));
  body += '</div>';

  /* right column */
  body += '<div style="display:flex;flex-direction:column;gap:18px">';
  body += '<div class="card pad">'
    + '<span class="kicker">Right now</span>'
    + '<p style="margin:10px 0 0;font-size:13px;line-height:1.65;color:var(--text-2)">'+esc(s.detail)+'</p>'
    + '<div class="rows" style="margin-top:16px">'
    + rowLine('Status', s.label)
    + rowLine('Layer', m.layer)
    + rowLine('Engine', engineLabel(emp))
    + rowLine('Works only inside', co.name)
    + rowLine('Spending limit', (emp.budget && emp.budget.spendLimitUsd != null) ? usd(emp.budget.spendLimitUsd) : 'Not set')
    + '</div></div>';

  body += '<div class="card pad">'
    + '<span class="kicker">Actions</span>'
    + '<div class="acts" style="margin-top:12px">'
    +   '<a class="btn primary" href="'+base+'/work/new?to='+encodeURIComponent(emp.id)+'">Assign work</a>'
    +   '<a class="btn" href="'+base+'/training?to='+encodeURIComponent(emp.id)+'">Train</a>'
    +   '<a class="btn ghost" href="'+base+'/knowledge">View knowledge</a>'
    + '</div>'
    + '<p class="note" style="margin-top:14px">Everything you start here stays inside ' + esc(co.name) + '.</p>'
    + '<details class="adv"><summary>Advanced details</summary><pre>'
    + esc(JSON.stringify({employeeId:emp.id, roleId:emp.roleId, workspaceId:emp.workspaceId,
        status:emp.status, versionId:emp.versionId, executionProfile:emp.executionProfile,
        knowledgeScope:emp.knowledgeScope, budget:emp.budget, mayNot}, null, 2))
    + '</pre></details></div>';
  body += '</div></div>';
  body += await brainSection(co, emp);

  return {
    co, sideActive:'team', kicker: m.layer + ' · ' + co.name, title: empName(emp),
    sub: clean(emp.jobDescription || m.blurb),
    crumbs: [{label:'Portfolio village',href:'#/'},{label:co.name,href:base},{label:'Team',href:base+'/team'},{label:empName(emp)}],
    right: '<span class="pill '+s.key+'"><i></i>'+esc(s.label)+'</span>'
         + '<a class="btn sm ghost" href="'+base+'/team">Back to team</a>',
    body,
    mount(root){ mountBrain(root, co, emp); mountModelPicker(root, 'employee', { employeeId: emp.id }); },
  };
}

/* ------------------------------------------------------------------ work --- */
async function scrWork(co){
  const b = await loadCompany(co.id);
  const base = '#/c/'+encodeURIComponent(co.id);
  const objs = b.objectives.slice().sort((a,b2)=>String(b2.createdAt||'').localeCompare(String(a.createdAt||'')));
  const open = objs.filter(o => OPEN_STATUS.indexOf(String(o.status||'').toLowerCase()) >= 0);
  const done = objs.filter(o => OPEN_STATUS.indexOf(String(o.status||'').toLowerCase()) < 0);

  function objCard(o){
    const w = objectiveWord(o.status);
    const runnable = /^(planned|proposed|pending|submitted)$/i.test(String(o.status||''));
    return '<div class="item"><div class="ihd"><h6>'+esc(truncate(clean(o.ownerText||'A request'),140))+'</h6>'
      + '<span class="badge '+statusTone(w)+'"><i></i>'+esc(w)+'</span></div>'
      + '<p>'+esc(w === 'Completed' ? 'The team finished this and filed what it produced.'
              : w === 'Waiting on you' ? 'Everything is done except a decision that is waiting on you.'
              : w === 'Blocked' ? 'The team stopped before finishing. Something it needed was missing or not permitted.'
              : w === 'Did not finish' ? 'This run ended without a usable result.'
              : 'Recorded on this business.')+'</p>'
      + '<div class="meta">'
      +   (o.createdAt ? '<span class="note">Asked '+esc(ago(o.createdAt))+'</span>' : '')
      +   (w === 'Waiting on you' ? '<a class="btn sm" href="'+base+'/approvals">Review the decision</a>' : '')
      +   (runnable ? '<button class="btn sm primary" data-run="'+esc(o.id)+'">Start it</button>' : '')
      + '</div></div>';
  }

  let body = '';
  body += card('Open work', open.length ? plural(open.length,'request')+' still moving' : 'Nothing open right now',
      'Requests you have handed to ' + co.name + ' that have not finished yet.',
      open.length ? '<div class="list">'+open.map(objCard).join('')+'</div>'
                  : emptyState('Nothing open','Everything you have asked for has already run.','Assign new work',base+'/work/new'));
  body += card('Finished work', plural(done.length,'request')+' on record','',
      done.length ? '<div class="list">'+done.map(objCard).join('')+'</div>'
                  : emptyState('Nothing finished yet','Once the team completes a request it is listed here.'));

  return {
    co, sideActive:'work', kicker:'Work', title:'Work',
    sub:'Everything you have asked ' + co.name + ' to do, in the order you asked for it.',
    crumbs: coCrumbs(co,'Work'),
    right: '<a class="btn sm primary" href="'+base+'/work/new">Assign work</a>',
    body,
    mount(root){
      root.querySelectorAll('[data-run]').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Running…';
        const out = await apiPost('/app/work/run', {objectiveId: btn.getAttribute('data-run'), workspaceId: co.id});
        if (out.error){ toast(errText(out), true); btn.disabled = false; btn.textContent = 'Start it'; return; }
        invalidate(co.id); toast('The team ran that request.'); await loadPortfolio(true); route();
      }));
    },
  };
}

async function scrWorkNew(co, params){
  const base = '#/c/'+encodeURIComponent(co.id);
  const team = sortedTeam(co.employees);
  const preset = params.get('to') || '';
  const body = '<div class="card pad">'
    + '<span class="kicker">New request</span>'
    + '<h3 style="margin:6px 0 0;font-size:15px">Tell ' + esc(co.name) + ' what you want done</h3>'
    + '<p class="note" style="margin:8px 0 0;max-width:70ch">Write it the way you would say it to a person. '
    + 'The manager breaks it into steps and hands each one to the right specialist. Nothing is sent outside the company.</p>'
    + '<div class="form" style="margin-top:18px">'
    + '<div class="field"><label for="wtext">What do you want done?</label>'
    +   '<textarea id="wtext" placeholder="For example: draft a one-page flyer for the autumn term and list what we still need to decide."></textarea>'
    +   '<span class="hint">At least a full sentence. Be specific about the outcome you want.</span></div>'
    + (team.length ? '<div class="field"><label>Anyone in particular? (optional)</label>'
      + '<div class="chips" id="whoChips">'
      + team.map(e => '<button type="button" class="chip'+(preset===e.id?' on':'')+'" data-who="'+esc(e.id)+'">'
          + roleMeta(e.roleId).glyph + ' ' + esc(empName(e)) + '</button>').join('')
      + '</div><span class="hint">Leave this blank and the manager decides who is best placed.</span></div>' : '')
    + '<div class="form-actions">'
    +   '<button class="btn primary" id="submitWork">Hand it to the team</button>'
    +   '<a class="btn ghost" href="'+base+'/work">Cancel</a>'
    + '</div></div></div>';

  return {
    co, sideActive:'work', kicker:'Work', title:'Assign work',
    sub:'Hand a new request to ' + co.name + '.',
    crumbs: [{label:'Portfolio village',href:'#/'},{label:co.name,href:base},{label:'Work',href:base+'/work'},{label:'Assign work'}],
    body,
    mount(root){
      let who = preset;
      root.querySelectorAll('[data-who]').forEach(c => c.addEventListener('click', () => {
        const id = c.getAttribute('data-who');
        who = (who === id) ? '' : id;
        root.querySelectorAll('[data-who]').forEach(x => x.classList.toggle('on', x.getAttribute('data-who') === who));
      }));
      root.querySelector('#submitWork').addEventListener('click', async () => {
        const text = root.querySelector('#wtext').value.trim();
        if (text.length < 12){ toast('Write at least a full sentence so the team knows what you want.', true); return; }
        const btn = root.querySelector('#submitWork');
        btn.disabled = true; btn.textContent = 'Handing it over…';
        const payload = {workspaceId: co.id, ownerText: text};
        if (who) payload.assignedEmployeeId = who;
        const out = await apiPost('/app/work/submit', payload);
        if (out.error){ toast(errText(out), true); btn.disabled = false; btn.textContent = 'Hand it to the team'; return; }
        invalidate(co.id); await loadPortfolio(true);
        toast('Your request is with the team.');
        location.hash = base + '/work';
      });
    },
  };
}

/* --------------------------------------------------------------- outputs --- */
async function scrOutputs(co){
  const b = await loadCompany(co.id);
  const base = '#/c/'+encodeURIComponent(co.id);
  const dels = b.deliverables.slice().sort((a,b2)=>String(b2.createdAt||'').localeCompare(String(a.createdAt||'')));
  const body = card('Outputs', plural(dels.length,'thing')+' this business has produced',
      'Everything the team has written or drafted for ' + co.name + '. Drafts are internal until you decide otherwise.',
      dels.length
        ? '<div class="list">'+dels.map(d => {
            const by = co.employees.find(e => e.id === d.createdByEmployeeId);
            return '<a class="item" href="'+base+'/outputs/'+encodeURIComponent(d.id)+'">'
              + '<div class="ihd"><h6>'+esc(clean(d.title || humanKind(d.type)))+'</h6>'
              + '<span class="badge idle">'+esc(humanKind(d.status || (d.draft?'draft':'saved')))+'</span></div>'
              + '<p>'+esc(truncate(firstLine(d.body) || 'No detail recorded.',190))+'</p>'
              + '<div class="meta"><span class="note">'+esc(by ? empName(by) : (d.createdByRoleId ? roleMeta(d.createdByRoleId).title : 'The team'))
              + (d.createdAt ? ' · '+esc(ago(d.createdAt)) : '')+'</span></div></a>';
          }).join('')+'</div>'
        : emptyState('Nothing produced yet','When the team finishes a request, what it wrote shows up here.','Assign work',base+'/work/new'));
  return {co, sideActive:'outputs', kicker:'Outputs', title:'Outputs',
          sub:'What ' + co.name + ' has actually produced.',
          crumbs: coCrumbs(co,'Outputs'), right: coStatusPill(co), body};
}

async function scrOutput(co, delId){
  const b = await loadCompany(co.id);
  const base = '#/c/'+encodeURIComponent(co.id);
  const d = b.deliverables.find(x => x.id === delId);
  if (!d){
    return {co, sideActive:'outputs', kicker:'Outputs', title:'Output not found',
            crumbs: coCrumbs(co,'Outputs'),
            body: emptyState('That output is not on this business','It may belong to another company.','Back to outputs',base+'/outputs')};
  }
  const by = co.employees.find(e => e.id === d.createdByEmployeeId);
  const claims = d.claimClasses || [];
  const counts = {};
  for (const c of claims) counts[c.claimClass] = (counts[c.claimClass]||0)+1;

  let body = '<div class="split"><div style="display:flex;flex-direction:column;gap:18px">';
  body += card('The document', clean(d.title || humanKind(d.type)), '',
      '<div class="doc">'+esc(clean(d.body || 'Nothing was written for this output.'))+'</div>');
  if (claims.length){
    body += card('How to read it','What is fact and what is a guess',
        'Every line the team wrote is labelled so you never mistake a hypothesis for something known.',
        '<div class="list">'+claims.slice(0,12).map(c =>
          '<div class="item"><div class="ihd"><h6 style="font-weight:520;font-size:12.6px">'+esc(truncate(clean(c.text),190))+'</h6>'
          + '<span class="badge '+(c.claimClass==='fact'?'ok':(c.claimClass==='unknown'?'idle':'info'))+'">'+esc(humanKind(c.claimClass))+'</span></div></div>').join('')+'</div>');
  }
  body += '</div><div style="display:flex;flex-direction:column;gap:18px">';
  body += '<div class="card pad"><span class="kicker">Details</span><div class="rows" style="margin-top:12px">'
    + rowLine('Kind', humanKind(d.type))
    + rowLine('Status', humanKind(d.status || (d.draft?'draft':'saved')))
    + rowLine('Written by', by ? empName(by) : (d.createdByRoleId ? roleMeta(d.createdByRoleId).title : 'The team'))
    + rowLine('When', d.createdAt ? ago(d.createdAt) : 'Not recorded')
    + rowLine('Sent anywhere', d.deployed ? 'Yes' : 'No — internal only')
    + '</div>'
    + (Object.keys(counts).length
        ? '<div class="acts" style="margin-top:14px">'+Object.keys(counts).map(k =>
            '<span class="badge '+(k==='fact'?'ok':(k==='unknown'?'idle':'info'))+'">'+esc(humanKind(k))+' · '+counts[k]+'</span>').join('')+'</div>'
        : '')
    + '<details class="adv"><summary>Advanced details</summary><pre>'
    + esc(JSON.stringify({id:d.id, objectiveId:d.objectiveId, type:d.type, sourceRefs:d.sourceRefs, taskRefs:d.taskRefs,
        liveProviderCall:d.liveProviderCall, assembly:d.assembly}, null, 2))+'</pre></details></div>';
  body += '</div></div>';

  return {co, sideActive:'outputs', kicker:'Output', title: clean(d.title || humanKind(d.type)),
    sub: 'Produced for ' + co.name + (d.createdAt ? ' · ' + ago(d.createdAt) : ''),
    crumbs: [{label:'Portfolio village',href:'#/'},{label:co.name,href:base},{label:'Outputs',href:base+'/outputs'},{label:clean(d.title||'Output')}],
    right: '<a class="btn sm ghost" href="'+base+'/outputs">All outputs</a>', body};
}
/* ------------------------------------------------------------- knowledge --- */
async function scrKnowledge(co){
  const b = await loadCompany(co.id);
  const base = '#/c/'+encodeURIComponent(co.id);
  const items = b.knowledge.slice();
  const approved = items.filter(k => String(k.reviewStatus) === 'approved');
  const other = items.filter(k => String(k.reviewStatus) !== 'approved');

  function kitem(k){
    const who = (k.assignedToRoles||[]).map(r => roleMeta(r).title);
    const emps = (k.assignedToEmployees||[]).map(id => {
      const e = co.employees.find(x => x.id === id); return e ? empName(e) : null;
    }).filter(Boolean);
    const audience = emps.concat(who);
    return '<div class="item"><p style="margin:0;font-size:12.9px;line-height:1.66;color:var(--text-2)">'
      + esc(clean(k.statement || k.excerpt || 'No text recorded.'))+'</p>'
      + '<div class="meta"><span class="badge '+(k.classification==='owner_policy'?'wait':'idle')+'">'+esc(humanKind(k.classification))+'</span>'
      + '<span class="badge '+(String(k.reviewStatus)==='approved'?'ok':'idle')+'"><i></i>'+esc(humanKind(k.reviewStatus||'recorded'))+'</span>'
      + (audience.length ? '<span class="note">Used by '+esc(audience.slice(0,4).join(', '))+'</span>'
                         : '<span class="note">Not assigned to anyone yet</span>')
      + '</div></div>';
  }

  let body = card('Approved knowledge', plural(approved.length,'thing')+' the team may rely on',
      'Facts, rules and corrections you have approved for ' + co.name + '. Nobody outside this business can read them.',
      approved.length ? '<div class="list">'+approved.map(kitem).join('')+'</div>'
                      : emptyState('Nothing approved yet','Teach this business something and it will appear here.','Train the team',base+'/training'));
  if (other.length){
    body += card('Not yet approved', plural(other.length,'item')+' waiting',
        'Recorded but not cleared for use. The team cannot rely on any of this yet.',
        '<div class="list">'+other.map(kitem).join('')+'</div>');
  }
  body += '<p class="note">Company isolation: everything on this page belongs to ' + esc(co.name)
       + ' only. Employees on your other businesses cannot retrieve it.</p>';

  return {co, sideActive:'knowledge', kicker:'Knowledge', title:'Company knowledge',
          sub:'What ' + co.name + ' knows, and who is allowed to use it.',
          crumbs: coCrumbs(co,'Knowledge'),
          right:'<a class="btn sm primary" href="'+base+'/training">Teach something new</a>', body};
}

/* -------------------------------------------------------------- training --- */
const CLASS_LABELS = {
  owner_policy:        ['A rule everyone must follow', 'A hard rule. The team is never allowed to break it.'],
  company_fact:        ['A fact about this business',  'Something true about the business — prices, hours, what you own.'],
  correction:          ['A correction',                'Fixes something the team previously got wrong.'],
  example:             ['An example to copy',          'A sample of the tone or format you want.'],
  procedure:           ['How to do something',         'A step-by-step way of working.'],
  hypothesis:          ['Something you suspect',       'Stored as a guess, never treated as fact.'],
  external_sourced_fact:['Something from an outside source','Attributed to where it came from.'],
  vendor_claim:        ['A vendor claim',              'Kept labelled as a claim, not as truth.'],
};
async function scrTraining(co, params){
  const b = await loadCompany(co.id);
  const base = '#/c/'+encodeURIComponent(co.id);
  const studio = await apiGet('/app/training?workspaceId='+encodeURIComponent(co.id));
  const classes = (studio && studio.classifications) || Object.keys(CLASS_LABELS);
  const team = sortedTeam(co.employees);
  const preset = params.get('to') || '';
  const lessons = b.training.slice().sort((a,b2)=>String(b2.createdAt||b2.timestamp||'').localeCompare(String(a.createdAt||a.timestamp||'')));

  let body = '<div class="card pad">'
    + '<span class="kicker">Teach the team</span>'
    + '<h3 style="margin:6px 0 0;font-size:15px">Give ' + esc(co.name) + ' something new to work from</h3>'
    + '<p class="note" style="margin:8px 0 0;max-width:72ch">Paste a rule, a fact, a correction, or an example. '
    + 'Choose who it is for. It becomes part of this company’s knowledge and nothing else’s.</p>'
    + '<div class="form" style="margin-top:18px">'
    + '<div class="field"><label for="tTitle">Give it a short name</label>'
    +   '<input type="text" id="tTitle" placeholder="For example: autumn term pricing"/></div>'
    + '<div class="field"><label>What kind of thing is this?</label><div class="chips" id="clsChips">'
    +   classes.map((c,i) => '<button type="button" class="chip'+(i===0?' on':'')+'" data-cls="'+esc(c)+'">'
        + esc((CLASS_LABELS[c]||[humanKind(c)])[0]) + '</button>').join('')
    +   '</div><span class="hint" id="clsHint">'+esc((CLASS_LABELS[classes[0]]||['',''])[1]||'')+'</span></div>'
    + '<div class="field"><label for="tText">What should they know?</label>'
    +   '<textarea id="tText" style="min-height:150px" placeholder="Write it plainly. For example: lessons are $40 for 30 minutes. Never promise a recital date."></textarea>'
    +   '<span class="hint">Plain text or Markdown. This is stored exactly as you write it.</span></div>'
    + '<div class="field"><label>Who is this for?</label><div class="chips" id="whoChips">'
    +   team.map(e => '<button type="button" class="chip'+(preset===e.id?' on':'')+'" data-who="'+esc(e.id)+'">'
        + roleMeta(e.roleId).glyph + ' ' + esc(empName(e)) + '</button>').join('')
    +   '</div><span class="hint">Pick at least one person. They are the only ones who will retrieve it.</span></div>'
    + '<div class="form-actions"><button class="btn primary" id="saveTraining">Teach it</button>'
    +   '<a class="btn ghost" href="'+base+'/knowledge">See what they already know</a></div>'
    + '</div></div>';

  body += card('Lessons already taught', plural(lessons.length,'lesson'),
      'Everything you have taught ' + co.name + ', newest first.',
      lessons.length
        ? '<div class="list">'+lessons.slice(0,20).map(t => {
            const targets = (t.targetRoleIds||[]).map(r=>roleMeta(r).title)
              .concat((t.targetEmployeeIds||[]).map(id => { const e=co.employees.find(x=>x.id===id); return e?empName(e):null; }).filter(Boolean));
            return '<div class="item"><div class="ihd"><h6>'+esc(clean(t.title || humanKind(t.classification)))+'</h6>'
              + '<span class="badge '+(String(t.ownerApprovalStatus)==='approved'?'ok':'wait')+'"><i></i>'
              + esc(humanKind(t.ownerApprovalStatus||'recorded'))+'</span></div>'
              + (t.extractedClaims && t.extractedClaims.length ? '<p>'+esc(truncate(clean(t.extractedClaims[0].statement),240))+'</p>' : '')
              + '<div class="meta"><span class="badge idle">'+esc((CLASS_LABELS[t.classification]||[humanKind(t.classification)])[0])+'</span>'
              + (targets.length ? '<span class="note">For '+esc(targets.slice(0,4).join(', '))+'</span>' : '')
              + ((t.createdAt||t.timestamp) ? '<span class="note">· '+esc(ago(t.createdAt||t.timestamp))+'</span>' : '')
              + '</div></div>';
          }).join('')+'</div>'
        : emptyState('Nothing taught yet','Use the box above to give this business its first piece of knowledge.'));

  return {
    co, sideActive:'training', kicker:'Training', title:'Train the team',
    sub:'Everything you teach here stays inside ' + co.name + '.',
    crumbs: coCrumbs(co,'Training'), right: coStatusPill(co), body,
    mount(root){
      let cls = classes[0], who = preset ? [preset] : [];
      root.querySelectorAll('[data-cls]').forEach(c => c.addEventListener('click', () => {
        cls = c.getAttribute('data-cls');
        root.querySelectorAll('[data-cls]').forEach(x => x.classList.toggle('on', x.getAttribute('data-cls') === cls));
        const hint = root.querySelector('#clsHint');
        hint.textContent = (CLASS_LABELS[cls]||['',''])[1] || '';
      }));
      root.querySelectorAll('[data-who]').forEach(c => c.addEventListener('click', () => {
        const id = c.getAttribute('data-who');
        const i = who.indexOf(id);
        if (i >= 0) who.splice(i,1); else who.push(id);
        c.classList.toggle('on', who.indexOf(id) >= 0);
      }));
      root.querySelector('#saveTraining').addEventListener('click', async () => {
        const title = root.querySelector('#tTitle').value.trim();
        const text  = root.querySelector('#tText').value.trim();
        if (!text){ toast('Write what they should know first.', true); return; }
        if (!who.length){ toast('Pick at least one person to teach.', true); return; }
        const btn = root.querySelector('#saveTraining');
        btn.disabled = true; btn.textContent = 'Teaching…';
        const out = await apiPost('/app/training/ingest', {
          workspaceId: co.id, title: title || 'Owner training',
          classification: cls, sourceType: 'owner_authored',
          text, targetEmployeeIds: who,
        });
        btn.disabled = false; btn.textContent = 'Teach it';
        if (out.error){ toast(errText(out), true); return; }
        invalidate(co.id);
        toast('Taught to ' + plural(who.length,'person','people') + ' at ' + co.name + '.');
        route();
      });
    },
  };
}

/* founder-facing names for the outside connections MIDAS may or may not have */
const SOURCE_NAMES = {
  web_search:'Looking things up on the web',
  owner_url_fetch:'Reading pages you paste in',
  approved_domain:'Reading approved websites',
  google_trends:'Google Trends',
  reddit:'Reddit',
  product_hunt:'Product Hunt',
  edgar:'Company filings (EDGAR)',
  youtube_transcripts:'YouTube transcripts',
  website_publish:'Publishing a website',
  email:'Sending email',
};
function sourceName(id){ return SOURCE_NAMES[id] || humanKind(id); }
function sourceTone(st){
  const t = String(st||'').toUpperCase();
  if (t === 'CONNECTED') return 'ok';
  if (t === 'NOT_CONFIGURED' || t === 'NOT_SUPPORTED') return 'off';
  return 'idle';
}
function sourceWord(st){
  const t = String(st||'').toUpperCase();
  if (t === 'CONNECTED') return 'Working';
  if (t === 'NOT_CONFIGURED') return 'Not set up';
  if (t === 'NOT_SUPPORTED') return 'Not available';
  if (t === 'CONFIGURED_UNVERIFIED') return 'Set up, not verified yet';
  return humanKind(t);
}

/* -------------------------------------------------------------- research --- */
async function scrResearch(co){
  const base = '#/c/'+encodeURIComponent(co.id);
  const r = await apiGet('/app/research?workspaceId='+encodeURIComponent(co.id));
  const providers = (r && r.providers) || [];
  const requests = (r && r.requests) || [];
  const findings = (r && (r.findings || r.reviewedFindings)) || [];
  const search = (r && r.search) || {};

  let body = card('What this business can look up','Where research may come from',
      'MIDAS only reads sources you have permitted. It does not browse the open internet freely.',
      '<div class="list">'+providers.map(p =>
        '<div class="item"><div class="ihd"><h6>'+esc(sourceName(p.id))+'</h6>'
        + '<span class="badge '+sourceTone(p.status)+'"><i></i>'+esc(sourceWord(p.status))+'</span></div>'
        + '<p>'+esc(clean(p.note||''))+'</p></div>').join('')+'</div>'
      + (search && search.indexedPages != null
          ? '<div class="rows" style="margin-top:16px">'
            + rowLine('Pages looked at', String(search.indexedPages))
            + rowLine('Pages judged useful', String(search.acceptedUsefulPages != null ? search.acceptedUsefulPages : 0))
            + rowLine('Pages rejected as off-topic', String(search.rejectedOffTopicPages != null ? search.rejectedOffTopicPages : 0))
            + rowLine('Last attempt', search.lastAttemptAt ? ago(search.lastAttemptAt) : 'Never')
            + '</div>' : ''));

  body += card('Questions on the table', plural(requests.length,'question'),
      'What the team wants to find out for ' + co.name + '.',
      requests.length
        ? '<div class="list">'+requests.slice(0,12).map(q =>
            '<div class="item"><div class="ihd"><h6 style="font-weight:540;font-size:12.9px">'+esc(truncate(clean(q.question||''),260))+'</h6>'
            + '<span class="badge '+(String(q.status)==='approved'?'ok':'idle')+'"><i></i>'+esc(humanKind(q.status||'recorded'))+'</span></div>'
            + (q.createdAt ? '<div class="meta"><span class="note">Raised '+esc(ago(q.createdAt))+'</span></div>' : '')
            + '</div>').join('')+'</div>'
        : emptyState('No open questions','Nothing has been queued for research on this business.'));

  if (findings.length){
    body += card('What came back', plural(findings.length,'finding'),
        'Nothing here is treated as fact until you approve it.',
        '<div class="list">'+findings.slice(0,12).map(f =>
          '<div class="item"><p style="margin:0">'+esc(truncate(clean(f.claim || f.summary || ''),280))+'</p>'
          + '<div class="meta"><span class="badge '+(f.approved?'ok':'wait')+'"><i></i>'+esc(f.approved?'Approved':'Needs your review')+'</span>'
          + (f.kind ? '<span class="badge idle">'+esc(humanKind(f.kind))+'</span>' : '')+'</div></div>').join('')+'</div>');
  }

  return {co, sideActive:'research', kicker:'Research', title:'Research',
          sub:'What ' + co.name + ' is trying to find out, and what it is allowed to read.',
          crumbs: coCrumbs(co,'Research'), right: coStatusPill(co), body};
}

/* -------------------------------------------------------------- teaching --- */
async function scrTeaching(co){
  const base = '#/c/'+encodeURIComponent(co.id);
  const t = await apiGet('/app/teaching?workspaceId='+encodeURIComponent(co.id));
  const findings = (t && t.findings) || [];
  const packets = (t && t.packets) || [];

  function stageWord(x){
    if (x.improved) return 'Changed how they work';
    if (x.retrieved) return 'Being used';
    if (x.approved) return 'Approved by you';
    return 'Recorded, not approved';
  }
  function stageTone(x){ return x.approved ? 'ok' : 'wait'; }

  let body = card('Lessons between employees', plural(packets.length,'lesson package'),
      'When one employee learns something useful, it can be passed to another — but only after you approve it.',
      packets.length
        ? '<div class="list">'+packets.map(p =>
            '<div class="item"><div class="ihd"><h6>'+esc(p.roleHint ? ('For the '+roleMeta(p.roleHint).title.toLowerCase()) : 'Lesson package')+'</h6>'
            + '<span class="badge '+stageTone(p)+'"><i></i>'+esc(stageWord(p))+'</span></div>'
            + '<p>'+esc(humanKind(p.status || 'recorded'))+'.</p></div>').join('')+'</div>'
        : emptyState('Nothing to pass on yet','No employee has produced a lesson worth sharing with a teammate.'));

  body += card('Things worth teaching', plural(findings.length,'candidate'),
      'Observations the team flagged as potentially useful to a colleague.',
      findings.length
        ? '<div class="list">'+findings.map(f =>
            '<div class="item"><div class="ihd"><h6>'+esc(f.roleHint ? ('Suggested for the '+roleMeta(f.roleHint).title.toLowerCase()) : 'Candidate lesson')+'</h6>'
            + '<span class="badge '+stageTone(f)+'"><i></i>'+esc(stageWord(f))+'</span></div></div>').join('')+'</div>'
        : emptyState('Nothing flagged','Nobody has flagged anything worth teaching a teammate yet.'));

  body += '<p class="note">Nothing is shared between your businesses. Teaching only ever moves inside ' + esc(co.name) + '.</p>';

  return {co, sideActive:'teaching', kicker:'Teaching', title:'Teaching between employees',
          sub:'How something one employee learns reaches the rest of the team at ' + co.name + '.',
          crumbs: coCrumbs(co,'Teaching'), right: coStatusPill(co), body};
}

/* --------------------------------------------------------- opportunities --- */
async function scrOpportunities(co){
  const base = '#/c/'+encodeURIComponent(co.id);
  const o = await apiGet('/app/opportunities?workspaceId='+encodeURIComponent(co.id));
  const opps = ((o && o.opportunities) || []).filter(x => !x.workspaceId || x.workspaceId === co.id);

  const body = card('Ideas for this business', plural(opps.length,'idea'),
      'Each of these is a hypothesis the team wrote down. None of them is a forecast, and none has been validated.',
      (opps.length
        ? '<div class="list">'+opps.slice(0,20).map(x =>
            '<div class="item"><div class="ihd"><h6>'+esc(clean(x.title || x.name || 'Idea'))+'</h6>'
            + '<span class="badge info">Hypothesis</span></div>'
            + '<p>'+esc(truncate(clean(x.summary || x.description || x.rationale || 'No detail recorded.'),260))+'</p>'
            + (x.createdAt ? '<div class="meta"><span class="note">Written '+esc(ago(x.createdAt))+'</span></div>' : '')
            + '</div>').join('')+'</div>'
        : emptyState('No ideas written down yet','Ask the team to think of some, and they will be listed here as clearly-labelled guesses.'))
      + '<div class="acts" style="margin-top:16px"><button class="btn" id="genOpps">Ask for new ideas</button>'
      + '<span class="note">Runs on what this business already knows. Nothing is invented about demand or revenue.</span></div>'
      + '<div id="oppOut"></div>');

  return {co, sideActive:'opportunities', kicker:'Opportunities', title:'Opportunities',
          sub:'Ideas for growing ' + co.name + ', kept clearly separate from facts.',
          crumbs: coCrumbs(co,'Opportunities'), right: coStatusPill(co), body,
          mount(root){
            const btn = root.querySelector('#genOpps');
            if (!btn) return;
            btn.addEventListener('click', async () => {
              btn.disabled = true; btn.textContent = 'Thinking…';
              const out = await apiPost('/app/opportunities/generate', {workspaceId: co.id});
              btn.disabled = false; btn.textContent = 'Ask for new ideas';
              if (out.error){ toast(errText(out), true); return; }
              toast('New ideas written down for ' + co.name + '.');
              route();
            });
          }};
}

/* ------------------------------------------------------------- approvals --- */
function approvalCard(a, co){
  const content = a.content || {};
  const excerpts = content.excerpts || [];
  const what = content.whatTheyMayDo ? clean(content.whatTheyMayDo) : '';
  const to = content.recipientRoleId ? roleMeta(content.recipientRoleId).title
           : (content.recipientEmployeeId && co ? (function(){ const e=co.employees.find(x=>x.id===content.recipientEmployeeId); return e?empName(e):''; })() : '');
  return '<div class="item" data-apr="'+esc(a.id)+'" data-kind="'+esc(a.kind||'')+'">'
    + '<div class="ihd"><h6>'+esc(decisionSentence(a))+'</h6>'
    + '<span class="badge wait"><i></i>Waiting on you</span></div>'
    + (to ? '<p>Recipient: '+esc(to)+'.</p>' : '')
    + (what ? '<p>'+esc(what)+'</p>' : '')
    + (excerpts.length
        ? '<div style="margin-top:11px;display:flex;flex-direction:column;gap:8px">'
          + excerpts.slice(0,4).map(x => '<div class="quote">'+esc(truncate(clean(x),300))+'</div>').join('')
          + '</div>' : '')
    + '<div class="meta">'
    +   (a.createdAt ? '<span class="note">Raised '+esc(ago(a.createdAt))+'</span>' : '')
    +   (a.requireLocalOwner ? '<span class="badge idle">Only you can decide this</span>' : '')
    + '</div>'
    + '<div class="acts" style="margin-top:13px">'
    +   '<button class="btn sm" data-decide="approve">Approve it</button>'
    +   '<button class="btn sm ghost" data-decide="reject">Decline it</button>'
    + '</div>'
    + '<div class="confirm" style="margin-top:12px"></div>'
    + '</div>';
}
function wireApprovals(root, coId){
  root.querySelectorAll('[data-apr]').forEach(itemEl => {
    const id = itemEl.getAttribute('data-apr');
    const kind = itemEl.getAttribute('data-kind');
    const box = itemEl.querySelector('.confirm');
    itemEl.querySelectorAll('[data-decide]').forEach(btn => btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-decide');
      box.innerHTML = '<div class="quote" style="border-left-color:var(--gold)">'
        + '<b>' + (action === 'approve' ? 'Approve this?' : 'Decline this?') + '</b><br/>'
        + (action === 'approve'
            ? 'The team will be allowed to use it from now on. This is recorded against you as the owner.'
            : 'The team will not be allowed to use it. This is recorded against you as the owner.')
        + '</div>'
        + '<div class="acts" style="margin-top:10px">'
        + '<button class="btn sm '+(action==='approve'?'primary':'')+'" data-go="1">Yes, '+(action==='approve'?'approve':'decline')+' it</button>'
        + '<button class="btn sm ghost" data-cancel="1">Cancel</button></div>';
      box.querySelector('[data-cancel]').addEventListener('click', () => { box.innerHTML=''; });
      box.querySelector('[data-go]').addEventListener('click', async () => {
        box.innerHTML = '<span class="note">Recording your decision…</span>';
        const sess = await apiPost('/session/local-owner', {});
        if (sess.error){ box.innerHTML = '<div class="quote">'+esc(errText(sess))+'</div>'; return; }
        if (sess.session && sess.session.id) document.cookie = 'midas_local_owner=' + encodeURIComponent(sess.session.id) + '; path=/';
        const url = (kind === 'teaching_packet')
          ? '/teaching/approvals/'+encodeURIComponent(id)+'/decide'
          : '/conductor/approvals/'+encodeURIComponent(id)+'/decide';
        const out = await apiPost(url, {action, actor:'local_owner', actorType:'local_owner', scripted:false});
        if (out.error){ box.innerHTML = '<div class="quote">'+esc(errText(out))+'</div>'; return; }
        invalidate(coId); await loadPortfolio(true);
        toast('Your decision was recorded.');
        route();
      });
    }));
  });
}

async function scrApprovals(co){
  const b = await loadCompany(co.id);
  const apr = b.approvals || {};
  const pending = apr.pending || [];
  const historical = (apr.historical || []).filter(h => h.status && h.status !== 'pending');

  let body = card('Waiting on you', pending.length ? plural(pending.length,'decision') : 'Nothing waiting',
      'The team stops and asks before doing anything you have not cleared.',
      pending.length ? '<div class="list">'+pending.map(a => approvalCard(a, co)).join('')+'</div>'
                     : emptyState('All clear','Nothing at ' + co.name + ' needs a decision from you right now.'));

  if (historical.length){
    body += card('Already decided', plural(historical.length,'decision'), '',
      '<div class="list">'+historical.slice(0,20).map(h =>
        '<div class="item"><div class="ihd"><h6>'+esc(humanKind(h.kind||'Decision'))+'</h6>'
        + '<span class="badge '+(String(h.status)==='approved'?'ok':'idle')+'"><i></i>'+esc(humanKind(h.status))+'</span></div>'
        + (h.decidedAt ? '<div class="meta"><span class="note">'+esc(ago(h.decidedAt))+'</span></div>' : '')
        + '</div>').join('')+'</div>');
  }

  return {co, sideActive:'approvals', kicker:'Approvals', title:'Decisions',
          sub:'Everything ' + co.name + ' is waiting for you to decide.',
          crumbs: coCrumbs(co,'Approvals'), right: coStatusPill(co), body,
          mount(root){ wireApprovals(root, co.id); }};
}

/* ----------------------------------------------------------------- money --- */
function ledgerLine(e){
  const what = String(e.operation||e.role||'work');
  const nice = /web_search/i.test(what) ? 'Looking something up'
             : /live_specialist/i.test(what) ? 'A specialist doing live work'
             : /manager_plan/i.test(what) ? 'The manager planning'
             : /probe/i.test(what) ? 'Checking the connection'
             : /workbench/i.test(what) ? 'A supervised work run'
             : /scout_research/i.test(what) ? 'Research'
             : humanKind(what);
  return '<div class="item"><div class="ihd"><h6>'+esc(nice)+'</h6>'
    + '<span class="badge '+(e.costUsd ? 'idle' : 'off')+'">'+esc(e.costUsd ? usd(e.costUsd) : 'No cost recorded')+'</span></div>'
    + (e.note ? '<p>'+esc(truncate(clean(e.note),180))+'</p>' : '')
    + '<div class="meta">'+(e.timestamp ? '<span class="note">'+esc(ago(e.timestamp))+'</span>' : '')+'</div></div>';
}
async function scrMoney(co){
  const b = await loadCompany(co.id);
  const spend = await apiGet('/app/spending?workspaceId='+encodeURIComponent(co.id));
  const t = b.treasury || {};
  const totals = t.totals || {};
  const entries = ((spend && spend.entries) || []).slice()
      .sort((a,b2)=>String(b2.timestamp||'').localeCompare(String(a.timestamp||''))).slice(0,25);
  const limits = (spend && spend.limits) || {};

  let body = '<div class="stat-grid">'
    + statBox('Recorded spending', totals.actualSpendUsd > 0 ? usd(totals.actualSpendUsd) : 'None recorded')
    + statBox('Recorded revenue', totals.actualRevenueUsd > 0 ? usd(totals.actualRevenueUsd) : 'No revenue recorded yet')
    + statBox('Spent today', spend && spend.dayUsd ? usd(spend.dayUsd) : '$0.00')
    + statBox('Daily ceiling', limits.maxUsdPerDay != null ? usd(limits.maxUsdPerDay) : 'Not set')
    + '</div>';

  body += card('Where the money went', plural(entries.length,'entry'),
      'Every cost MIDAS actually recorded for ' + co.name + '.',
      entries.length ? '<div class="list">'+entries.map(ledgerLine).join('')+'</div>'
                     : emptyState('Nothing spent','No cost has been recorded against this business.'));

  body += card('Revenue','What has actually come in','',
      totals.actualRevenueUsd > 0
        ? '<div class="rows">'+rowLine('Recorded revenue', usd(totals.actualRevenueUsd))+'</div>'
        : emptyState('No revenue recorded yet',
            'MIDAS only shows money it has actually observed. It will not estimate, project, or guess at revenue for you.'));

  body += '<details class="adv"><summary>Advanced accounting detail</summary><pre>'
       + esc(JSON.stringify({categories: t.categories, rules: t.rules,
           bucketCounts: Object.keys(t.buckets||{}).reduce((o,k)=>{o[k]=(t.buckets[k]||[]).length;return o;},{})}, null, 2))
       + '</pre></details>';

  return {co, sideActive:'money', kicker:'Money', title:'Money',
          sub:'What ' + co.name + ' has spent and what it has actually earned.',
          crumbs: coCrumbs(co,'Money'), right: coStatusPill(co), body};
}

/* ============================================================================
   INTELLIGENCE FOUNDRY — founder-facing controls
   ============================================================================ */
function fmtUsd(n){ return (n == null || !isFinite(n)) ? '$0.00' : (n === 0 ? '$0.00' : (n < 0.01 ? 'under $0.01' : '$' + Number(n).toFixed(2))); }

/* ---- employee brain, shown on the employee profile ---- */
async function brainSection(co, emp){
  const b = await apiGet('/foundry/brain?employeeId=' + encodeURIComponent(emp.id));
  if (!b || b.ok === false) return '';
  const routing = await apiGet('/foundry/models');
  const d = b.development || {};
  const pb = b.playbook;
  const base = '#/c/' + encodeURIComponent(co.id);

  let h = '<div class="card pad" id="brainCard">'
    + '<span class="kicker">Learning</span>'
    + '<h3 style="margin:6px 0 0;font-size:15px">What this employee has learned</h3>'
    + '<p class="note" style="margin:8px 0 0;max-width:70ch">'
    +   'Improvement here comes from better knowledge, a written playbook, and corrections from reviewed work. '
    +   'The underlying model is never retrained, and MIDAS does not claim otherwise.</p>'
    + '<div class="rows" style="margin-top:14px">'
    +   rowLine('Learning sessions', d.learningSessions ? String(d.learningSessions) : 'None yet')
    +   rowLine('Reviewed practice runs', d.evaluations ? String(d.evaluations) : 'None yet')
    +   rowLine('First score', d.firstScore != null ? d.firstScore + ' / 100' : 'No baseline yet')
    +   rowLine('Latest score', d.latestScore != null ? d.latestScore + ' / 100' : 'No score yet')
    +   rowLine('Change', d.delta != null ? (d.delta >= 0 ? '+' : '') + d.delta + ' points' : 'Not enough runs to compare')
    +   rowLine('Lessons received from teammates', d.lessonsReceived ? String(d.lessonsReceived) : 'None')
    + '</div>';

  if (pb){
    h += '<div style="margin-top:18px"><span class="kicker">Playbook v' + esc(String(pb.version)) + '</span>'
      + '<p class="note" style="margin:6px 0 10px">' + esc(pb.objective || '') + '</p>'
      + (pb.rules && pb.rules.length ? '<ul class="bul">' + pb.rules.slice(0,6).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '')
      + (pb.openQuestions && pb.openQuestions.length
          ? '<p class="note" style="margin-top:10px">Still unknown: ' + esc(pb.openQuestions.slice(0,3).join(' · ')) + '</p>' : '')
      + (pb.corrections && pb.corrections.length
          ? '<p class="note" style="margin-top:6px">' + plural(pb.corrections.length,'correction') + ' absorbed from reviewed work.</p>' : '')
      + '</div>';
  } else {
    h += '<div class="empty" style="margin-top:16px"><b>No playbook yet</b>Run a learning session and this employee will write one from your approved company knowledge.</div>';
  }

  if ((d.recommendedNextTraining || []).length){
    h += '<div style="margin-top:16px"><span class="kicker">Recommended next</span><ul class="bul" style="margin-top:8px">'
      + d.recommendedNextTraining.slice(0,3).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  }

  h += '<div class="acts" style="margin-top:18px">'
    + '<button class="btn primary" data-foundry="learn">Run a learning session</button>'
    + '<button class="btn" data-foundry="practice">Give a practice task</button>'
    + '<a class="btn ghost" href="' + base + '/foundry">Open the learning engine</a>'
    + '</div><div id="foundryOut" style="margin-top:16px"></div>';

  h += '<details class="adv"><summary>Advanced detail</summary><pre>'
    + esc(JSON.stringify({ identity: b.identity, roleKnowledge: b.roleKnowledge, workMemory: b.workMemory }, null, 2))
    + '</pre></details></div>';
  h += modelPickerCard(routing, 'employee', {
    employeeId: emp.id,
    title: 'Model for ' + empName(emp),
    blurb: 'Overrides the company setting for this one person. Useful for routing coding or drafting work somewhere different from analysis.',
  });
  return h;
}

function mountBrain(root, co, emp){
  const out = root.querySelector('#foundryOut');
  if (!out) return;
  root.querySelectorAll('[data-foundry]').forEach(btn => btn.addEventListener('click', async () => {
    const kind = btn.getAttribute('data-foundry');
    if (kind === 'learn'){
      btn.disabled = true; btn.textContent = 'Studying…';
      out.innerHTML = '<div class="empty">Reading this company’s approved knowledge…</div>';
      const res = await apiPost('/foundry/learn', { employeeId: emp.id });
      btn.disabled = false; btn.textContent = 'Run a learning session';
      if (res.error || res.ok === false){ out.innerHTML = '<div class="empty">' + esc(errText(res)) + '</div>'; return; }
      const s = res.session, p = res.playbook;
      out.innerHTML = '<div class="item"><div class="ihd"><h6>Playbook v' + esc(String(p.version)) + ' written</h6>'
        + '<span class="badge ' + (s.live ? 'ok' : 'idle') + '"><i></i>' + (s.live ? 'Live model' : 'Deterministic') + '</span></div>'
        + '<p>' + esc(p.summary || '') + '</p>'
        + '<p class="note">Read ' + plural((s.retrievedIds||[]).length,'approved item')
        +   ' · retrieval was ' + esc(s.retrievalMethod === 'hybrid_lexical_plus_embeddings' ? 'lexical + meaning-based' : 'wording-based only')
        +   (s.live ? '' : ' · no live model was available, so this was assembled deterministically')
        + ' · cost ' + esc(fmtUsd(s.costUsd)) + '</p></div>';
      invalidate(co.id);
    } else {
      const task = window.prompt('What realistic task should ' + empName(emp) + ' practise on?',
        'Draft the piece of work you would normally ask this person for.');
      if (!task) return;
      btn.disabled = true; btn.textContent = 'Working…';
      out.innerHTML = '<div class="empty">Doing the task and reviewing the result…</div>';
      const res = await apiPost('/foundry/practice', { employeeId: emp.id, task, label: 'owner_requested' });
      btn.disabled = false; btn.textContent = 'Give a practice task';
      if (res.error || res.ok === false){ out.innerHTML = '<div class="empty">' + esc(errText(res)) + '</div>'; return; }
      out.innerHTML = evalCard(res.evaluation);
      invalidate(co.id);
    }
  }));
}

function evalCard(e){
  return '<div class="item"><div class="ihd"><h6>' + esc(truncate(e.task, 90)) + '</h6>'
    + '<span class="badge ' + (e.total >= 75 ? 'ok' : e.total >= 55 ? 'idle' : 'bad') + '"><i></i>' + e.total + ' / 100</span></div>'
    + '<div class="rows" style="margin-top:10px">'
    + (e.dimensions || []).map(d => '<div class="row"><span>' + esc(d.label) + '</span>'
        + '<b>' + d.score + ' / ' + d.max + ' <span class="note">' + esc(d.detail) + '</span></b></div>').join('')
    + '</div>'
    + ((e.corrections || []).length
        ? '<p class="note" style="margin-top:10px">Corrections fed back into the playbook: ' + esc(e.corrections.join(' · ')) + '</p>' : '')
    + '<div class="meta"><span class="badge ' + (e.live ? 'ok' : 'idle') + '"><i></i>' + (e.live ? 'Live model' : 'Deterministic') + '</span>'
    + '<span class="badge idle">' + plural((e.citations||[]).length, 'citation') + '</span>'
    + (e.systemFailure ? '<span class="badge wait"><i></i>Not held against the employee</span>' : '')
    + '<span class="note">' + esc(fmtUsd(e.costUsd)) + '</span></div>'
    + (e.output ? '<details class="adv"><summary>What it produced</summary><div class="doc" style="max-height:320px;margin-top:8px">'
        + esc(truncate(e.output, 4000)) + '</div></details>' : '')
    + '</div>';
}



/* ---- model selection: portfolio, company, and employee scopes ---- */
function modelPickerCard(routing, scope, opts){
  const o = opts || {};
  const cat = (routing && routing.catalogue) || [];
  const current =
    scope === 'portfolio' ? (routing && routing.portfolio) :
    scope === 'company'   ? (routing && routing.companies && routing.companies[o.workspaceId]) :
                            (routing && routing.employees && routing.employees[o.employeeId]);
  const currentId = current ? current.modelId : null;
  const inheritLabel =
    scope === 'portfolio' ? 'MIDAS default (OpenAI GPT-4.1)' :
    scope === 'company'   ? 'Whatever the portfolio uses' :
                            'Whatever this company uses';

  let h = '<div class="card pad" data-mp="' + esc(scope) + '">'
    + '<span class="kicker">Which model does the thinking</span>'
    + '<h3 style="margin:6px 0 0;font-size:15px">' + esc(o.title || 'Model') + '</h3>'
    + '<p class="note" style="margin:8px 0 0;max-width:72ch">' + esc(o.blurb || '') + '</p>';

  h += '<div class="chips" id="mpChips" style="margin-top:16px">'
    + '<button type="button" class="chip' + (currentId ? '' : ' on') + '" data-mid="inherit">' + esc(inheritLabel) + '</button>'
    + cat.map(function(m){
        const on = currentId === m.id;
        const t = m.available ? '' : ' title="' + esc(m.note || 'not configured') + '"';
        return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-mid="' + esc(m.id) + '"'
          + (m.available ? '' : ' data-unavailable="1"') + t + '>'
          + esc(m.label) + (m.available ? '' : ' · not set up') + '</button>';
      }).join('')
    + '</div>';

  /* the honest disclosure, always visible, not buried */
  const ox = cat.find(function(m){ return m.provider === 'openrouter'; });
  if (ox){
    h += '<div class="quote" style="margin-top:16px;border-left-color:var(--gold)">'
      + '<b>About Ox Alpha</b><br/>'
      + esc(ox.warning || '')
      + '<ul class="bul" style="margin-top:8px">'
      + '<li>Free today, but the operator is anonymous.</li>'
      + '<li>It keeps what you send and what it replies. Treat it as public.</li>'
      + '<li>It does not guarantee JSON shape, so MIDAS checks every reply here before using it.</li>'
      + '<li>MIDAS never sends it keys, .env contents, customer details, or raw application state.</li>'
      + '<li>It cannot approve anything or widen a permission.</li>'
      + '</ul></div>';
  }

  if (routing && routing.restrictedTasks && routing.restrictedTasks.length){
    h += '<p class="note" style="margin-top:12px">Always handled by the default model whatever you pick here: '
      + esc(routing.restrictedTasks.map(humanKind).join(', ').toLowerCase()) + '.</p>';
  }

  h += '<div id="mpOut" style="margin-top:14px"></div></div>';
  return h;
}

function mountModelPicker(root, scope, opts){
  const o = opts || {};
  const card = root.querySelector('[data-mp="' + scope + '"]');
  if (!card) return;
  const out = card.querySelector('#mpOut');

  card.querySelectorAll('[data-mid]').forEach(function(btn){
    btn.addEventListener('click', async function(){
      const modelId = btn.getAttribute('data-mid');
      if (btn.getAttribute('data-unavailable')){
        out.innerHTML = '<div class="item"><div class="ihd"><h6>Not set up yet</h6>'
          + '<span class="badge off"><i></i>unavailable</span></div>'
          + '<p>Add <code>OPENROUTER_API_KEY</code> to the <code>.env</code> file in the MIDAS folder, then restart MIDAS. '
          + 'Get a key at openrouter.ai.</p></div>';
        return;
      }
      const body = { scope: scope, modelId: modelId };
      if (o.workspaceId) body.workspaceId = o.workspaceId;
      if (o.employeeId) body.employeeId = o.employeeId;

      let res = await apiPost('/foundry/models/select', body);
      if (res.requiresAcknowledgement){
        out.innerHTML = '<div class="item"><div class="ihd"><h6>Confirm before routing work here</h6>'
          + '<span class="badge wait"><i></i>needs your OK</span></div>'
          + '<p>' + esc(res.error) + '</p>'
          + '<div class="acts" style="margin-top:10px">'
          + '<button class="btn sm primary" id="mpAck">I understand, use Ox Alpha</button>'
          + '<button class="btn sm ghost" id="mpCancel">Cancel</button></div></div>';
        card.querySelector('#mpCancel').addEventListener('click', function(){ out.innerHTML = ''; });
        card.querySelector('#mpAck').addEventListener('click', async function(){
          body.acknowledgeDisclosure = true;
          const r2 = await apiPost('/foundry/models/select', body);
          if (r2.ok === false || r2.error){ out.innerHTML = '<div class="empty">' + esc(errText(r2)) + '</div>'; return; }
          toast('Work here now goes to Ox Alpha.');
          route();
        });
        return;
      }
      if (res.ok === false || res.error){
        out.innerHTML = '<div class="item"><p>' + esc(errText(res)) + '</p></div>';
        return;
      }
      toast(res.cleared ? 'Reverted to the inherited model.' : 'Model updated.');
      route();
    });
  });
}

/* ---- owner-directed source intake, inside the existing Learning engine ---- */
const SRC_TYPE_HELP = {
  pasted_text: 'Notes, a summary, anything you have written.',
  transcript: 'Paste the transcript of a video or talk. Free to read, and usually the best option for a talking-head video.',
  owner_rule: 'A rule you are setting. Stored as your instruction, not as something a source claimed.',
  example: 'A sample of work you want copied in style or structure.',
  correction: 'Something the team got wrong that should be fixed from now on.',
  article_url: 'A link to an article. MIDAS fetches the page itself and keeps only the article body.',
  youtube_url: 'A public YouTube link. Needs a Gemini key, otherwise paste the transcript instead.',
};

function sourceIntakeCard(co, providers, sources){
  const team = sortedTeam(co.employees);
  const types = (providers && providers.sourceTypes) || [];
  const pList = (providers && providers.providers) || [];

  let h = '<div class="card" id="intakeCard"><div class="hd">'
    + '<span class="kicker">Teach from a source</span>'
    + '<h3>Give someone at ' + esc(co.name) + ' something to learn from</h3>'
    + '<p>Point at a video, an article, or your own notes, say what they should get out of it, and MIDAS turns it into lessons for that one person at this one company.</p>'
    + '</div><div class="bd">';

  /* what is connected, and what it costs */
  h += '<div class="rows" style="margin-bottom:18px">'
    + pList.map(p => '<div class="row"><span>' + esc(p.label) + '</span><b>'
        + '<span class="badge ' + (p.status === 'available' ? 'ok' : 'off') + '"><i></i>'
        + esc(p.status === 'available' ? (p.paid ? 'Ready · costs money' : 'Ready · free') : 'Not set up')
        + '</span></b></div>').join('')
    + '</div>';
  const needsSetup = pList.filter(p => p.setup);
  if (needsSetup.length){
    h += '<p class="note" style="margin-bottom:16px">'
      + needsSetup.map(p => 'To enable ' + esc(p.label.toLowerCase()) + ', add <code>' + esc(p.setup.variable)
        + '</code> to ' + esc(p.setup.where) + ' and restart MIDAS.').join(' ')
      + '</p>';
  }

  h += '<div class="form">'
    + '<div class="field"><label>Who is learning?</label><select id="siEmp">'
    +   team.map(e => '<option value="' + esc(e.id) + '">' + esc(empName(e)) + ' — ' + esc(roleMeta(e.roleId).title) + '</option>').join('')
    +   '</select></div>'
    + '<div class="field"><label for="siObj">What should they get out of it?</label>'
    +   '<textarea id="siObj" style="min-height:64px" placeholder="For example: how to answer a parent who says the price is too high."></textarea></div>'
    + '<div class="field"><label>What kind of source is it?</label><div class="chips" id="siTypes">'
    +   types.map((t,i) => '<button type="button" class="chip' + (i===0?' on':'') + (t.usable?'':' ') + '" data-stype="' + esc(t.id) + '"'
        + (t.usable ? '' : ' title="' + esc(t.blockedReason) + '"') + '>' + esc(t.label)
        + (t.usable ? '' : ' ·') + '</button>').join('')
    +   '</div><span class="hint" id="siHelp">' + esc(SRC_TYPE_HELP.pasted_text) + '</span></div>'
    + '<div class="field" id="siUrlField" style="display:none"><label for="siUrl">Link</label>'
    +   '<input type="text" id="siUrl" placeholder="https://…"/></div>'
    + '<div class="field" id="siTextField"><label for="siText">Paste it here</label>'
    +   '<textarea id="siText" style="min-height:130px" placeholder="Paste the notes, the rule, or the transcript."></textarea></div>'
    + '<div class="form-actions">'
    +   '<button class="btn" id="siEstimate">What will this cost?</button>'
    +   '<button class="btn primary" id="siGo">Read it and write the lessons</button>'
    + '</div></div>'
    + '<div id="siOut" style="margin-top:16px"></div>';

  /* everything already ingested */
  const rows = (sources && sources.sources) || [];
  if (rows.length){
    h += '<div style="margin-top:22px"><span class="kicker">Sources you have given this company</span><div class="list" style="margin-top:12px">'
      + rows.slice(0,8).map(s => sourceRow(co, s)).join('') + '</div></div>';
  }
  h += '<p class="note" style="margin-top:16px">' + esc((providers && providers.untrustedNote) || '') + '</p>';
  h += '</div></div>';
  return h;
}

function claimTone(c){
  if (c === 'source_backed_observation') return 'ok';
  if (c === 'vendor_claim' || c === 'creator_claim') return 'wait';
  if (c === 'unknown' || c === 'hypothesis') return 'idle';
  return 'info';
}
function claimWord(c){
  const map = {
    source_backed_observation: 'backed by the source',
    creator_claim: 'the creator says so',
    vendor_claim: 'vendor marketing',
    expert_opinion: 'expert opinion',
    hypothesis: 'a guess to test',
    unknown: 'unverified',
  };
  return map[c] || humanKind(c);
}

function sourceRow(co, s){
  const emp = co.employees.find(e => e.id === s.employeeId);
  return '<div class="item" data-src="' + esc(s.id) + '"><div class="ihd">'
    + '<h6>' + esc(truncate(s.title || s.url || s.sourceType, 84)) + '</h6>'
    + '<span class="badge ' + (s.status === 'approved' ? 'ok' : s.status === 'rejected' ? 'off' : 'wait') + '"><i></i>'
    + esc(s.status === 'extracted' ? 'Waiting on you' : humanKind(s.status)) + '</span></div>'
    + '<p>' + esc(truncate(s.objective, 170)) + '</p>'
    + '<div class="meta">'
    +   '<span class="badge idle">' + esc(emp ? empName(emp) : humanKind(s.roleId)) + '</span>'
    +   '<span class="badge idle">' + esc(humanKind(s.provider)) + '</span>'
    +   '<span class="badge ' + (s.lessons && s.lessons.length ? 'info' : 'off') + '">' + plural((s.lessons||[]).length, 'lesson') + '</span>'
    +   '<span class="note">' + esc(fmtUsd(s.costUsd)) + (s.cacheHit ? ' · reused, not re-paid' : '') + ' · ' + esc(ago(s.at)) + '</span>'
    + '</div>'
    + ((s.lessons||[]).length
        ? '<details class="adv"><summary>What it learned, and what backs each point</summary>'
          + '<p class="note" style="margin:8px 0">' + esc(s.roleRelevance || '') + '</p>'
          + '<div class="list" style="margin-top:10px">' + s.lessons.map(l =>
              '<div class="item"><div class="ihd"><h6 style="font-weight:560;font-size:12.7px">' + esc(l.statement) + '</h6>'
              + '<span class="badge ' + claimTone(l.claimClass) + '">' + esc(claimWord(l.claimClass)) + '</span></div>'
              + '<p>' + esc(l.whyItMattersHere) + '</p>'
              + (l.excerpt ? '<p class="note" style="margin-top:6px">From the source' + (l.timestamp ? ' at ' + esc(l.timestamp) : '')
                  + ': “' + esc(truncate(l.excerpt, 200)) + '”</p>' : '')
              + '</div>').join('') + '</div>'
          + ((s.notApplicable||[]).length ? '<p class="note" style="margin-top:10px">Set aside as not applicable: '
              + esc(s.notApplicable.join(' · ')) + '</p>' : '')
          + ((s.contradictions||[]).length ? '<p class="note" style="margin-top:6px">Conflicts with what this company already believes: '
              + esc(s.contradictions.join(' · ')) + '</p>' : '')
          + '</details>' : '')
    + (s.status === 'extracted'
        ? '<div class="acts" style="margin-top:12px"><button class="btn sm primary" data-sdec="approve">Approve these lessons</button>'
          + '<button class="btn sm ghost" data-sdec="reject">Discard</button></div>'
        : '')
    + '</div>';
}

function mountSourceIntake(root, co){
  const out = root.querySelector('#siOut');
  if (!out) return;
  let stype = 'pasted_text';
  const urlField = root.querySelector('#siUrlField');
  const textField = root.querySelector('#siTextField');
  const help = root.querySelector('#siHelp');

  function applyType(){
    const isUrl = stype === 'article_url' || stype === 'youtube_url';
    urlField.style.display = isUrl ? '' : 'none';
    textField.querySelector('label').textContent = stype === 'youtube_url'
      ? 'Or paste the transcript here (free, and no Gemini key needed)'
      : 'Paste it here';
    help.textContent = SRC_TYPE_HELP[stype] || '';
  }
  root.querySelectorAll('[data-stype]').forEach(c => c.addEventListener('click', () => {
    stype = c.getAttribute('data-stype');
    root.querySelectorAll('[data-stype]').forEach(x => x.classList.toggle('on', x.getAttribute('data-stype') === stype));
    applyType();
  }));
  applyType();

  function payload(){
    return {
      workspaceId: co.id,
      employeeId: root.querySelector('#siEmp').value,
      objective: root.querySelector('#siObj').value.trim(),
      sourceType: stype,
      url: root.querySelector('#siUrl').value.trim(),
      text: root.querySelector('#siText').value.trim(),
    };
  }

  root.querySelector('#siEstimate').addEventListener('click', async () => {
    const est = await apiPost('/foundry/sources/estimate', payload());
    const e = est.estimate || {};
    out.innerHTML = '<div class="item"><div class="ihd"><h6>Before you commit</h6>'
      + '<span class="badge ' + (e.willCost ? 'wait' : 'ok') + '">' + (e.willCost ? 'about ' + fmtUsd(e.total) : 'free') + '</span></div>'
      + '<div class="rows" style="margin-top:8px">'
      + (e.lines||[]).map(l => '<div class="row"><span>' + esc(l.step) + ' <span class="note">' + esc(humanKind(l.provider)) + '</span></span>'
          + '<b>' + (l.cost == null ? '—' : fmtUsd(l.cost)) + '</b></div>').join('')
      + '</div><p class="note" style="margin-top:8px">' + esc(e.note || '') + '</p></div>';
  });

  root.querySelector('#siGo').addEventListener('click', async () => {
    const p = payload();
    if (p.objective.length < 8){ toast('Say what they should learn from it.', true); return; }
    if ((stype === 'article_url' || stype === 'youtube_url') && !p.url && !p.text){ toast('Add the link, or paste the material.', true); return; }
    const btn = root.querySelector('#siGo');
    btn.disabled = true; btn.textContent = 'Reading it…';
    out.innerHTML = '<div class="empty">Reading the source and writing lessons for this company…</div>';
    const r = await apiPost('/foundry/sources/ingest', p);
    btn.disabled = false; btn.textContent = 'Read it and write the lessons';
    if (r.ok === false || r.error){
      out.innerHTML = '<div class="item"><div class="ihd"><h6>That did not work</h6>'
        + '<span class="badge bad"><i></i>stopped</span></div><p>' + esc(errText(r)) + '</p>'
        + (r.suggestion ? '<p class="note" style="margin-top:8px">' + esc(r.suggestion) + '</p>' : '') + '</div>';
      return;
    }
    toast('Wrote ' + plural((r.source.lessons||[]).length, 'lesson') + ' · ' + fmtUsd(r.source.costUsd));
    invalidate(co.id); route();
  });

  root.querySelectorAll('[data-src]').forEach(el => {
    el.querySelectorAll('[data-sdec]').forEach(btn => btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-sdec');
      btn.disabled = true; btn.textContent = 'Recording…';
      const r = await apiPost('/foundry/sources/decide', { sourceId: el.getAttribute('data-src'), action });
      if (r.ok === false || r.error){ toast(errText(r), true); btn.disabled = false; return; }
      toast(action === 'approve'
        ? 'Approved. This employee can now retrieve these lessons.'
        : 'Discarded. Nothing was added to company knowledge.');
      invalidate(co.id); route();
    }));
  });
}

/* ---- the learning engine screen for one company ---- */
async function scrFoundry(co){
  const base = '#/c/' + encodeURIComponent(co.id);
  const [ov, evs, lessons, flows, plans, provs, srcs, costs, routing] = await Promise.all([
    apiGet('/foundry/overview?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/evaluations?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/lessons?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/workflows?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/assessments?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/sources/providers'),
    apiGet('/foundry/sources?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/costs?workspaceId=' + encodeURIComponent(co.id)),
    apiGet('/foundry/models'),
  ]);
  const counts = (ov && ov.counts) || {};
  const evals = ((evs && evs.evaluations) || []).slice().sort((a,b) => txtCmp(b.at, a.at));
  const les = ((lessons && lessons.lessons) || []).slice().sort((a,b) => txtCmp(b.at, a.at));
  const wfs = ((flows && flows.workflows) || []).slice().sort((a,b) => txtCmp(b.at, a.at));
  const assess = ((plans && plans.assessments) || []).slice().sort((a,b) => txtCmp(b.at, a.at));
  const ret = (ov && ov.retrieval) || {};

  let body = sourceIntakeCard(co, provs, srcs);
  body += modelPickerCard(routing, 'company', {
    workspaceId: co.id,
    title: 'Model for ' + co.name,
    blurb: 'Applies to everyone at this business unless you override a single employee.',
  });
  body += '<div class="stat-grid">'
    + statBox('Learning sessions', String(counts.learningSessions || 0))
    + statBox('Reviewed runs', String(counts.evaluations || 0))
    + statBox('Peer lessons', String(counts.peerLessons || 0))
    + statBox('Coordinated runs', String(counts.workflows || 0))
    + statBox('Cost so far', fmtUsd(ov && ov.costUsd))
    + (counts.lessonsAwaitingYou ? statBox('Lessons awaiting you', String(counts.lessonsAwaitingYou), true) : '')
    + '</div>';

  /* how retrieval actually ran */
  body += card('Retrieval', 'How employees find what they know',
      'Every employee reads only ' + co.name + '’s own material. Owner policies are always included and can never be pushed out by ranking.',
      '<div class="rows">'
      + rowLine('Runs using meaning as well as wording', String(ret.hybridRuns || 0))
      + rowLine('Runs using wording only', String(ret.lexicalOnlyRuns || 0))
      + rowLine('Another company’s material ever considered', String(ret.foreignItemsEverScored || 0))
      + '</div>'
      + '<p class="note" style="margin-top:12px">'
      + (ret.hybridRuns ? 'Meaning-based retrieval is active.' :
         'Meaning-based retrieval is built and wired, but the AI provider is not currently usable, so runs fall back to wording-only matching. That fallback is recorded on every run rather than hidden.')
      + '</p>'
      + '<div class="acts" style="margin-top:14px"><button class="btn sm" id="isoProbe">Check company isolation</button></div>'
      + '<div id="isoOut" style="margin-top:12px"></div>');

  /* per-employee progress */
  const prog = (ov && ov.progress) || [];
  body += card('Who is improving', prog.length ? plural(prog.length,'employee') + ' with reviewed work' : 'Nobody has practised yet', '',
      prog.length
        ? '<div class="rows">' + prog.map(p => {
            const e = co.employees.find(x => x.id === p.employeeId);
            return '<div class="row"><span><a href="' + base + '/e/' + encodeURIComponent(p.employeeId) + '">'
              + esc(e ? empName(e) : p.employeeId) + '</a> <span class="note">' + esc(plural(p.runs,'run')) + '</span></span>'
              + '<b>' + p.first + ' → ' + p.latest + (p.delta != null ? ' <span class="note">(' + (p.delta>=0?'+':'') + p.delta + ')</span>' : '') + '</b></div>';
          }).join('') + '</div>'
        : emptyState('No baseline yet','Open any employee and run a learning session, then give them a practice task.'));

  /* peer lessons */
  body += card('Lessons between employees', plural(les.length,'lesson'),
      'One employee can teach another, but only with real evidence from this company and only after you approve it.',
      les.length
        ? '<div class="list">' + les.map(l => {
            const from = co.employees.find(x => x.id === l.fromEmployeeId);
            const to = co.employees.find(x => x.id === l.toEmployeeId);
            return '<div class="item" data-lesson="' + esc(l.id) + '"><div class="ihd">'
              + '<h6>' + esc(from ? empName(from) : l.fromRoleId) + ' → ' + esc(to ? empName(to) : l.toRoleId) + '</h6>'
              + '<span class="badge ' + (l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'off' : 'wait') + '"><i></i>'
              + esc(humanKind(l.status)) + '</span></div>'
              + '<p>' + esc(l.lesson) + '</p>'
              + '<div class="meta"><span class="note">Because: ' + esc(l.whyItApplies) + '</span>'
              + '<span class="badge idle">' + plural((l.evidenceIds||[]).length,'source') + '</span>'
              + (l.retrievedByRecipient ? '<span class="badge ok"><i></i>Recipient used it</span>' : '')
              + '</div>'
              + (l.status === 'proposed'
                  ? '<div class="acts" style="margin-top:12px"><button class="btn sm primary" data-les="approve">Approve the lesson</button>'
                    + '<button class="btn sm ghost" data-les="reject">Decline</button></div>' : '')
              + '</div>';
          }).join('') + '</div>'
        : emptyState('Nothing taught yet','When one employee learns something worth passing on, it appears here for your approval.'));

  /* coordinated work */
  body += card('Coordinated team runs', plural(wfs.length,'run'),
      'The manager breaks your objective into stages, each specialist does its part from this company’s knowledge, then the executive synthesises and the watcher checks it.',
      '<div class="acts" style="margin-bottom:14px"><button class="btn primary" id="runFlow">Run the team on an objective</button></div>'
      + '<div id="flowOut"></div>'
      + (wfs.length
          ? '<div class="list">' + wfs.slice(0,5).map(w =>
              '<div class="item"><div class="ihd"><h6>' + esc(truncate(w.objective, 90)) + '</h6>'
              + '<span class="badge ' + (w.watcher && w.watcher.passed ? 'ok' : 'wait') + '"><i></i>'
              + (w.watcher && w.watcher.passed ? 'Checks passed' : plural((w.watcher && w.watcher.flags || []).length, 'flag')) + '</span></div>'
              + '<p>' + esc((w.stages||[]).filter(s=>!s.skipped).map(s => s.title + ' ' + s.score).join(' · ')) + '</p>'
              + '<div class="meta"><span class="badge idle">' + w.liveStages + ' live · ' + w.deterministicStages + ' deterministic</span>'
              + '<span class="note">' + esc(fmtUsd(w.costUsd)) + ' · ' + esc(ago(w.at)) + '</span></div>'
              + '<details class="adv"><summary>What each specialist produced</summary>'
              + (w.stages||[]).filter(s=>!s.skipped).map(s => '<div style="margin-top:10px"><span class="kicker">' + esc(s.title) + '</span>'
                  + '<div class="doc" style="max-height:220px;margin-top:6px">' + esc(truncate(s.output, 1800)) + '</div></div>').join('')
              + '<div style="margin-top:12px"><span class="kicker">Executive</span><p class="note" style="margin-top:6px">'
              + esc(w.synthesis && w.synthesis.recommendation || '') + '</p></div></details></div>').join('') + '</div>'
          : emptyState('No coordinated run yet','Give the team an objective and every stage will be recorded here.')));

  /* opportunity assessment */
  body += card('Opportunity assessment', plural(assess.length,'assessment'),
      'Each answer is graded by how well it is actually evidenced. “Unknown” is a normal and honest answer.',
      '<div class="form" style="max-width:620px"><div class="field">'
      + '<label for="oaIdea">Describe an idea to assess for ' + esc(co.name) + '</label>'
      + '<textarea id="oaIdea" style="min-height:80px" placeholder="For example: a monthly subscription instead of one-off jobs."></textarea></div>'
      + '<div class="form-actions"><button class="btn" id="runAssess">Assess it</button></div></div>'
      + '<div id="assessOut" style="margin-top:14px"></div>'
      + (assess.length
          ? '<div class="list" style="margin-top:14px">' + assess.slice(0,3).map(a =>
              '<div class="item"><div class="ihd"><h6>' + esc(truncate(a.idea, 90)) + '</h6>'
              + '<span class="badge idle">' + a.fieldsWithEvidence + ' of ' + a.fieldsTotal + ' evidenced</span></div>'
              + '<p>' + esc(truncate(a.recommendation, 200)) + '</p>'
              + '<details class="adv"><summary>Every answer and how well it is evidenced</summary>'
              + '<div class="rows" style="margin-top:8px">' + (a.fields||[]).map(f =>
                  '<div class="row"><span>' + esc(humanKind(f.field)) + '</span><b class="' + (f.evidenceClass === 'unknown' ? 'na' : '') + '">'
                  + esc(humanKind(f.evidenceClass)) + '</b></div>').join('') + '</div></details></div>').join('') + '</div>'
          : ''));

  /* what it actually cost */
  const cb = (costs && costs.byProvider) || [];
  body += card('What this has cost', fmtUsd(costs && costs.totalUsd) + ' so far at ' + co.name,
      'Free steps are shown with a zero rather than folded into the paid total.',
      cb.length
        ? '<div class="rows">' + cb.map(b =>
            '<div class="row"><span>' + esc(humanKind(b.provider)) + ' <span class="note">'
            + esc(plural(b.calls,'call') + (b.cacheHits ? ', ' + b.cacheHits + ' reused' : '')) + '</span></span>'
            + '<b class="' + (b.costUsd ? '' : 'na') + '">' + esc(b.costUsd ? fmtUsd(b.costUsd) : 'free') + '</b></div>').join('') + '</div>'
        : emptyState('Nothing spent yet','Costs appear here the moment a paid provider is actually used.'));

  /* recent reviewed runs */
  body += card('Reviewed work', plural(evals.length,'run'),
      'Every practice run is scored against the same frozen rubric. Word count is never rewarded.',
      evals.length ? '<div class="list">' + evals.slice(0,6).map(evalCard).join('') + '</div>'
                   : emptyState('Nothing reviewed yet','Practice runs and their scores appear here.'));

  return {
    co, sideActive: 'foundry', kicker: 'Learning engine', title: 'Learning engine',
    sub: 'How the people at ' + co.name + ' get better at their work, and what that is actually based on.',
    crumbs: coCrumbs(co, 'Learning engine'), right: coStatusPill(co), body,
    mount(root){
      mountSourceIntake(root, co);
      mountModelPicker(root, 'company', { workspaceId: co.id });
      const iso = root.querySelector('#isoProbe');
      if (iso) iso.addEventListener('click', async () => {
        const other = (STATE.portfolio.companies.find(c => c.id !== co.id) || {}).id;
        if (!other) return;
        iso.disabled = true; iso.textContent = 'Checking…';
        const r = await apiPost('/foundry/isolation-probe', { workspaceA: co.id, workspaceB: other, query: 'pricing and customers' });
        iso.disabled = false; iso.textContent = 'Check company isolation';
        const otherName = (companyById(other) || {}).name || other;
        root.querySelector('#isoOut').innerHTML = '<div class="item"><div class="ihd"><h6>'
          + esc(co.name) + ' vs ' + esc(otherName) + '</h6><span class="badge ' + (r.passed ? 'ok' : 'bad') + '"><i></i>'
          + (r.passed ? 'No leakage' : 'Overlap found') + '</span></div><p>' + esc(r.note || '') + '</p></div>';
      });

      root.querySelectorAll('[data-lesson]').forEach(el => {
        el.querySelectorAll('[data-les]').forEach(btn => btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-les');
          btn.disabled = true; btn.textContent = 'Recording…';
          const r = await apiPost('/foundry/lesson/decide', { lessonId: el.getAttribute('data-lesson'), action });
          if (r.error || r.ok === false){ toast(errText(r), true); btn.disabled = false; return; }
          toast(action === 'approve' ? 'Lesson approved. The recipient can now retrieve it.' : 'Lesson declined.');
          invalidate(co.id); route();
        }));
      });

      const flow = root.querySelector('#runFlow');
      if (flow) flow.addEventListener('click', async () => {
        const objective = window.prompt('What should the team work on for ' + co.name + '?', '');
        if (!objective || objective.trim().length < 12) return;
        flow.disabled = true; flow.textContent = 'The team is working…';
        root.querySelector('#flowOut').innerHTML = '<div class="empty">Manager is breaking this into stages…</div>';
        const r = await apiPost('/foundry/workflow', { workspaceId: co.id, objective: objective.trim() });
        flow.disabled = false; flow.textContent = 'Run the team on an objective';
        if (r.error || r.ok === false){ root.querySelector('#flowOut').innerHTML = '<div class="empty">' + esc(errText(r)) + '</div>'; return; }
        toast('The team finished ' + plural((r.workflow.stages||[]).filter(s=>!s.skipped).length, 'stage') + '.');
        invalidate(co.id); route();
      });

      const assessBtn = root.querySelector('#runAssess');
      if (assessBtn) assessBtn.addEventListener('click', async () => {
        const idea = root.querySelector('#oaIdea').value.trim();
        if (idea.length < 8){ toast('Describe the idea first.', true); return; }
        assessBtn.disabled = true; assessBtn.textContent = 'Assessing…';
        const r = await apiPost('/foundry/assess', { workspaceId: co.id, idea });
        assessBtn.disabled = false; assessBtn.textContent = 'Assess it';
        if (r.error || r.ok === false){ root.querySelector('#assessOut').innerHTML = '<div class="empty">' + esc(errText(r)) + '</div>'; return; }
        invalidate(co.id); route();
      });
    },
  };
}
function txtCmp(a,b){ return String(a||'').localeCompare(String(b||'')); }

/* ============================================================================
   PORTFOLIO SCREENS
   ============================================================================ */
const VILLAGE_CRUMB = {label:'Portfolio village', href:'#/'};

async function scrHeadquarters(){
  const p = STATE.portfolio;
  const real = p.companies;
  const pending = real.reduce((n,c)=>n+(c.pending||0),0);
  const employees = real.reduce((n,c)=>n+c.employees.length,0);
  const outputs = real.reduce((n,c)=>n+(c.deliverableCount||0),0);
  const spend = real.reduce((n,c)=>n+(c.spendUsd||0),0);
  const revenue = real.reduce((n,c)=>n+(c.revenueUsd||0),0);

  const cards = real.map(c => {
    const lead = c.employees.filter(e => LEADER_ROLES.indexOf(e.roleId) >= 0);
    const watch = c.employees.filter(e => OVERSIGHT_ROLES.indexOf(e.roleId) >= 0);
    const people = lead.concat(watch);
    const st = styleFor(c);
    return '<div class="card pad"><div class="ihd" style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'
      + '<div><h3 style="margin:0;font-size:14px;font-weight:645">'+st.glyph+' &nbsp;'+esc(c.name)+'</h3>'
      + '<span class="kicker" style="display:block;margin-top:4px">'+esc(industryLabel(c))+'</span></div>'
      + '<span class="dot '+(c.pending?'wait':(c.employees.length?'ok':'idle'))+'"></span></div>'
      + (people.length
          ? '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">'+people.map(e => {
              const m = roleMeta(e.roleId), s = employeeState(e, {});
              return '<a href="#/c/'+encodeURIComponent(c.id)+'/e/'+encodeURIComponent(e.id)+'" '
                + 'style="display:flex;align-items:center;gap:9px;font-size:12.4px;color:var(--text-2)">'
                + '<span class="side-emp" style="padding:0;border:0;background:none;width:auto"><span class="sq">'+m.glyph+'</span></span>'
                + '<span style="flex:1">'+esc(empName(e))+' <span class="note">· '+esc(m.layer)+'</span></span>'
                + '<span class="dot '+s.key+'"></span></a>';
            }).join('')+'</div>'
          : '<p class="note" style="margin-top:14px">No manager, strategist, or oversight employee recorded for this business yet.</p>')
      + '<div class="acts" style="margin-top:14px"><a class="btn sm" href="#/c/'+encodeURIComponent(c.id)+'">Open business</a></div>'
      + '</div>';
  }).join('');

  let body = '<div class="stat-grid">'
    + statBox('Businesses', String(real.length))
    + statBox('Employees', String(employees))
    + statBox('Outputs on file', String(outputs))
    + statBox('Recorded spending', spend > 0 ? usd(spend) : 'None recorded')
    + statBox('Recorded revenue', revenue > 0 ? usd(revenue) : 'No revenue recorded yet')
    + (pending ? statBox('Waiting on you', plural(pending,'decision'), true) : '')
    + '</div>';

  body += card('Leadership on record',
      plural(p.leadership.length,'leadership and oversight employee','leadership and oversight employees')
        + ' across ' + plural(real.length,'business','businesses'),
      'Every one of them belongs to a single business and can only see that business’s material. MIDAS does not create portfolio-wide executives on its own.',
      '<div class="grid2">'+cards+'</div>');

  body += '<p class="note">These figures come straight from what MIDAS has recorded. Nothing is estimated, projected, or filled in on your behalf.</p>';

  return {sideActive:'hq', kicker:'Portfolio leadership', title:'Headquarters',
    sub:'Every manager, strategist, and oversight employee recorded across your businesses.',
    crumbs:[VILLAGE_CRUMB,{label:'Headquarters'}],
    right: pending ? '<span class="pill wait"><i></i>'+esc(plural(pending,'decision')+' waiting on you')+'</span>'
                   : '<span class="pill ok"><i></i>Nothing waiting on you</span>',
    body};
}

async function scrBusinesses(){
  const p = STATE.portfolio;
  const body = card('Your businesses', plural(p.companies.length,'business','businesses'), '',
      '<div class="grid2">'+p.companies.map(c => {
        const st = styleFor(c);
        return '<a class="item" href="#/c/'+encodeURIComponent(c.id)+'">'
          + '<div class="ihd"><h6>'+st.glyph+' &nbsp;'+esc(c.name)+'</h6>'
          + '<span class="badge '+(c.pending?'wait':(c.employees.length?'ok':'idle'))+'"><i></i>'
          + esc(c.pending ? 'Needs you' : (c.employees.length ? 'Ready' : 'No team'))+'</span></div>'
          + '<p>'+esc(truncate(clean(c.description||'No description recorded.'),190))+'</p>'
          + '<div class="meta"><span class="badge idle">'+esc(industryLabel(c))+'</span>'
          + '<span class="note">'+esc(plural(c.employees.length,'person','people'))+' · '
          + esc(c.spendUsd > 0 ? usd(c.spendUsd)+' spent' : 'nothing spent')+'</span></div></a>';
      }).join('')+'</div>'
      + '<div class="acts" style="margin-top:18px"><a class="btn primary" href="#/new">Start a business</a>'
      + '<a class="btn" href="#/grow">Grow an existing one</a></div>');
  return {sideActive:'businesses', kicker:'Portfolio', title:'All businesses',
          sub:'Everything you run, in one list.', crumbs:[VILLAGE_CRUMB,{label:'All businesses'}], body};
}

/* --------------------------------------------------------- intake forms --- */
function fieldMarkup(f){
  const id = 'f_'+f.id;
  const req = f.required ? ' <span style="color:var(--gold)">*</span>' : '';
  const input = f.kind === 'textarea'
    ? '<textarea id="'+id+'" data-field="'+esc(f.id)+'"></textarea>'
    : '<input type="text" id="'+id+'" data-field="'+esc(f.id)+'"/>';
  return '<div class="field"><label for="'+id+'">'+esc(f.label)+req+'</label>'+input
       + (f.hint ? '<span class="hint">'+esc(clean(f.hint))+'</span>' : '')+'</div>';
}
async function intakeScreen(kind){
  const isNew = kind === 'new';
  const form = await apiGet('/app/companies/intake/'+(isNew?'new':'existing'));
  const fields = (form && form.fields) || [];
  const body = '<div class="card pad">'
    + '<span class="kicker">'+(isNew?'New business':'Existing business')+'</span>'
    + '<h3 style="margin:6px 0 0;font-size:15px">'+(isNew
        ? 'Tell MIDAS what you want to start'
        : 'Tell MIDAS about the business you already run')+'</h3>'
    + '<p class="note" style="margin:8px 0 0;max-width:72ch">'
    + esc(isNew
        ? 'Only the objective is required. Anything you leave blank stays unknown — MIDAS will not fill it in for you.'
        : 'MIDAS cannot look your business up. Everything it knows about it is what you write here.')
    + '</p>'
    + '<div class="form" style="margin-top:18px">'
    + fields.map(fieldMarkup).join('')
    + '<div class="form-actions"><button class="btn primary" id="createCo">'
    + (isNew ? 'Create this business' : 'Add this business')+'</button>'
    + '<a class="btn ghost" href="#/">Cancel</a></div>'
    + '</div></div>';

  return {sideActive: isNew ? 'new' : 'grow',
    kicker:'Portfolio', title: isNew ? 'Start a business' : 'Grow an existing business',
    sub: isNew ? 'A new business gets its own building in the village, its own team, and its own private knowledge.'
               : 'An existing business becomes its own building with its own team and private knowledge.',
    crumbs:[VILLAGE_CRUMB,{label: isNew ? 'Start a business' : 'Grow an existing business'}],
    body,
    mount(root){
      root.querySelector('#createCo').addEventListener('click', async () => {
        const payload = {};
        root.querySelectorAll('[data-field]').forEach(el => {
          const v = el.value.trim();
          if (v) payload[el.getAttribute('data-field')] = v;
        });
        const missing = fields.filter(f => f.required && !payload[f.id]);
        if (missing.length){ toast('Please fill in: ' + missing.map(f=>f.label).join(', '), true); return; }
        const btn = root.querySelector('#createCo');
        btn.disabled = true; btn.textContent = 'Creating…';
        const out = await apiPost('/app/companies/intake/'+(isNew?'new':'existing'), payload);
        if (out.error){ toast(errText(out), true); btn.disabled = false; btn.textContent = isNew?'Create this business':'Add this business'; return; }
        const id = out.company && out.company.id;
        STATE.portfolio = null; STATE.company = {};
        await loadPortfolio(true);
        toast((out.company && out.company.name ? clean(out.company.name) : 'Your business') + ' now has a building in the village.');
        location.hash = '#/';
        setTimeout(()=>{ if (id) toast('Open it any time from its building.'); }, 1200);
      });
    }};
}

/* -------------------------------------------------------------- finances --- */
async function scrFinances(){
  const p = STATE.portfolio;
  const spend = p.companies.reduce((n,c)=>n+(c.spendUsd||0),0);
  const revenue = p.companies.reduce((n,c)=>n+(c.revenueUsd||0),0);

  let body = '<div class="stat-grid">'
    + statBox('Recorded spending', spend > 0 ? usd(spend) : 'None recorded')
    + statBox('Recorded revenue', revenue > 0 ? usd(revenue) : 'No revenue recorded yet')
    + statBox('Businesses', String(p.companies.length))
    + statBox('Employees', String(p.companies.reduce((n,c)=>n+c.employees.length,0)))
    + '</div>';

  body += card('By business','Where the money actually went','',
      '<div class="rows">'+p.companies.map(c =>
        '<div class="row"><span><a href="#/c/'+encodeURIComponent(c.id)+'">'+esc(c.name)+'</a></span>'
        + '<b class="'+(c.spendUsd>0?'':'na')+'">'+esc(c.spendUsd > 0 ? usd(c.spendUsd) : 'nothing spent')+'</b></div>').join('')+'</div>');

  body += card('Revenue','What has actually come in','',
      revenue > 0
        ? '<div class="rows">'+p.companies.filter(c=>c.revenueUsd>0).map(c =>
            '<div class="row"><span>'+esc(c.name)+'</span><b>'+esc(usd(c.revenueUsd))+'</b></div>').join('')+'</div>'
        : emptyState('No revenue recorded yet',
            'MIDAS shows only money it has actually observed. It will never estimate, project, or invent revenue for you.'));

  return {sideActive:'finances', kicker:'Portfolio', title:'Money',
          sub:'What your whole portfolio has spent and earned.',
          crumbs:[VILLAGE_CRUMB,{label:'Money'}], body};
}

/* ----------------------------------------------------- portfolio approvals -- */
async function scrPortfolioApprovals(){
  const p = STATE.portfolio;
  const withPending = p.companies.filter(c => c.pending > 0);
  let body = '';
  if (!withPending.length){
    body = emptyState('Nothing is waiting on you','No business in your portfolio needs a decision right now.');
  } else {
    body = withPending.map(c =>
      card(c.name, plural(c.pending,'decision')+' waiting', industryLabel(c),
        '<div class="list" data-co="'+esc(c.id)+'">'+c.pendingList.map(a => approvalCard(a, c)).join('')+'</div>'
        + '<div class="acts" style="margin-top:14px"><a class="btn sm ghost" href="#/c/'+encodeURIComponent(c.id)+'">Open '+esc(c.name)+'</a></div>')
    ).join('');
  }
  const total = p.companies.reduce((n,c)=>n+(c.pending||0),0);
  return {sideActive:'approvals', kicker:'Portfolio', title:'Decisions',
    sub:'Everything across your businesses that is waiting for you.',
    crumbs:[VILLAGE_CRUMB,{label:'Decisions'}],
    right: total ? '<span class="pill wait"><i></i>'+esc(plural(total,'decision'))+'</span>' : '<span class="pill ok"><i></i>All clear</span>',
    body,
    mount(root){
      root.querySelectorAll('[data-co]').forEach(el => wireApprovals(el, el.getAttribute('data-co')));
    }};
}

/* --------------------------------------------------------------- command --- */
async function scrCommand(){
  const p = STATE.portfolio;
  const body = '<div class="card pad">'
    + '<span class="kicker">Founder command</span>'
    + '<h3 style="margin:6px 0 0;font-size:15px">Describe what you want done</h3>'
    + '<p class="note" style="margin:8px 0 0;max-width:72ch">MIDAS drafts a plan first and shows it to you. '
    + 'Nothing runs, and nothing is saved, until you hand it to a business.</p>'
    + '<div class="form" style="margin-top:18px">'
    + '<div class="field"><label for="cmdText">What do you want done?</label>'
    +   '<textarea id="cmdText" style="min-height:120px" placeholder="For example: draft a flyer for the autumn term and tell me what is still unknown."></textarea></div>'
    + '<div class="field"><label for="cmdCo">Which business?</label><select id="cmdCo">'
    +   '<option value="">Decide later</option>'
    +   p.companies.map(c => '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')
    +   '</select></div>'
    + '<div class="form-actions"><button class="btn primary" id="planBtn">Show me the plan</button>'
    + '<a class="btn ghost" href="#/">Back to the village</a></div>'
    + '</div><div id="planOut" style="margin-top:20px"></div></div>';

  return {sideActive:'command', kicker:'Portfolio', title:'Ask the team',
    sub:'Say what you want in plain language and see the plan before anything happens.',
    crumbs:[VILLAGE_CRUMB,{label:'Ask the team'}], body,
    mount(root){
      root.querySelector('#planBtn').addEventListener('click', async () => {
        const text = root.querySelector('#cmdText').value.trim();
        const wsId = root.querySelector('#cmdCo').value;
        const out = root.querySelector('#planOut');
        if (text.length < 12){ toast('Write at least a full sentence.', true); return; }
        out.innerHTML = '<div class="empty">Drafting a plan…</div>';
        const res = await apiPost('/app/command/dry-run', wsId ? {ownerText:text, workspaceId:wsId} : {ownerText:text});
        if (res.error){ out.innerHTML = '<div class="empty">'+esc(errText(res))+'</div>'; return; }
        const plan = res.plan || {};
        const steps = plan.steps || plan.tasks || [];
        if (!steps.length){
          out.innerHTML = '<div class="empty"><b>No plan could be drafted</b>Try describing the outcome you want in more detail.</div>';
          return;
        }
        out.innerHTML = '<span class="kicker">Draft plan</span>'
          + '<div class="list" style="margin-top:12px">'+steps.map((s,i) => {
              const rid = s.roleId || s.assignedRoleId || '';
              const m = rid ? roleMeta(rid) : null;
              return '<div class="item"><div class="ihd"><h6>'+(i+1)+'. '
                + esc(clean(s.title || s.summary || s.kind || 'Step'))+'</h6>'
                + (m ? '<span class="badge idle">'+esc(m.title)+'</span>' : '')+'</div>'
                + (s.detail || s.description ? '<p>'+esc(truncate(clean(s.detail||s.description),200))+'</p>' : '')
                + '</div>';
            }).join('')+'</div>'
          + '<p class="note" style="margin-top:14px">This is a preview. Nothing has been saved or run.</p>'
          + (wsId ? '<div class="acts" style="margin-top:14px"><button class="btn primary" id="handOff">Hand it to '
              + esc((companyById(wsId)||{}).name||'the business')+'</button></div>' : '');
        const hand = out.querySelector('#handOff');
        if (hand) hand.addEventListener('click', async () => {
          hand.disabled = true; hand.textContent = 'Handing it over…';
          const sub = await apiPost('/app/work/submit', {workspaceId: wsId, ownerText: text});
          if (sub.error){ toast(errText(sub), true); hand.disabled = false; hand.textContent = 'Hand it over'; return; }
          invalidate(wsId); await loadPortfolio(true);
          toast('Your request is with the team.');
          location.hash = '#/c/'+encodeURIComponent(wsId)+'/work';
        });
      });
    }};
}

/* -------------------------------------------------------------- settings --- */
function integrationRow(x){
  return '<div class="item"><div class="ihd"><h6>'+esc(sourceName(x.id))+'</h6>'
    + '<span class="badge '+sourceTone(x.status)+'"><i></i>'+esc(sourceWord(x.status))+'</span></div>'
    + (x.note ? '<p>'+esc(clean(x.note))+'</p>' : '')
    + '</div>';
}
async function scrSettings(){
  const s = await apiGet('/app/settings');
  const health = await apiGet('/health');
  const prov = (health && health.provider) || {};
  const integrations = (s && s.integrations) || [];
  const adapters = (s && s.adapters) || [];

  const provTone = prov.live ? 'ok' : (prov.openaiKeyPresent ? 'idle' : 'off');
  const provWord = prov.live ? 'Connected and verified'
                 : prov.openaiKeyPresent ? 'Key saved, not verified yet'
                 : 'No AI provider connected';

  let body = card('AI provider','Which model MIDAS may call',
      'MIDAS only calls a model when a task genuinely needs one. Everything else runs locally with no cost.',
      '<div class="rows">'
      + rowLine('Status', provWord)
      + rowLine('Model', prov.model ? String(prov.model) : 'Not set')
      + rowLine('Last checked', prov.lastProbeAt ? ago(prov.lastProbeAt) : 'Never')
      + '</div>'
      + '<div class="acts" style="margin-top:14px"><span class="pill '+provTone+'"><i></i>'+esc(provWord)+'</span></div>');

  body += card('What MIDAS can reach','Outside connections',
      'Anything marked "not set up" genuinely does not work yet. MIDAS will not pretend otherwise.',
      '<div class="list">'+integrations.concat(adapters).map(integrationRow).join('')+'</div>');

  const routing = await apiGet('/foundry/models');
  body += modelPickerCard(routing, 'portfolio', {
    title: 'Default model for everything',
    blurb: 'Every business and every employee uses this unless you override it for one of them.',
  });

  body += card('Where your data lives','Storage and isolation','',
      '<div class="rows">'
      + rowLine('Storage', 'On this machine')
      + rowLine('Each business', 'Sees only its own records')
      + rowLine('Between businesses', 'No shared knowledge')
      + '</div>'
      + '<p class="note" style="margin-top:14px">Isolation is enforced by the application on every read. It is not enterprise identity management.</p>');

  body += '<details class="adv"><summary>Advanced technical detail</summary><pre>'
       + esc(JSON.stringify({
           persistence: health && health.persistence,
           provider: {status: prov.status, fingerprint: prov.fingerprint, model: prov.model, live: prov.live},
           embeddings: s && s.embeddingsStatus,
           integrations: integrations.map(i=>({id:i.id,status:i.status,bridgeStatus:i.bridgeStatus})),
           adapters: adapters.map(i=>({id:i.id,status:i.status,bridgeStatus:i.bridgeStatus})),
         }, null, 2))+'</pre></details>';

  return {sideActive:'settings', kicker:'Portfolio', title:'Settings',
    sub:'What MIDAS is connected to, and what it genuinely cannot do yet.',
    crumbs:[VILLAGE_CRUMB,{label:'Settings'}], body,
    mount(root){ mountModelPicker(root, 'portfolio', {}); }};
}

/* ============================================================================
   ROUTER
   ============================================================================ */
function showVillage(){
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('villageScreen').classList.remove('hidden');
  renderVillageChrome();
  renderVillage();
  window.scrollTo(0,0);
}

/* Old hash routes from the previous interface map onto the new screens so no
   bookmark or internal link can ever fall back to the retired UI. */
function legacyTarget(hash){
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const q = new URLSearchParams(queryPart || '');
  const ws = q.get('workspace') || q.get('workspaceId') || '';
  const seg = pathPart.split('/').filter(Boolean);
  if (!seg.length) return null;
  const head = seg[0];
  const co = ws ? '#/c/'+encodeURIComponent(ws) : null;
  const MAP_CO = {
    employees:'/team', teams:'/team', work:'/work', deliverables:'/outputs', artifacts:'/outputs',
    knowledge:'/knowledge', training:'/training', research:'/research', teaching:'/teaching',
    approvals:'/approvals', spending:'/money', treasury:'/money', objectives:'/work',
    opportunities:'/opportunities', 'launch-readiness':'/work', brain:'/team', activity:'/work',
  };
  if (head === 'companies'){
    if (seg[1] === 'new') return '#/new';
    if (seg[1] === 'existing') return '#/grow';
    if (seg[1]) return '#/c/'+encodeURIComponent(seg[1]);
    return '#/businesses';
  }
  if (head === 'employees' && seg[1] && ws) return co+'/e/'+encodeURIComponent(seg[1]);
  if (head === 'overview' || head === 'home') return '#/';
  if (head === 'portfolio') return '#/businesses';
  if (head === 'headquarters') return '#/hq';
  if (head === 'command') return '#/command';
  if (head === 'settings' || head === 'isolation' || head === 'jobs') return '#/settings';
  if (MAP_CO[head]) return co ? (co + MAP_CO[head]) : (head === 'approvals' ? '#/approvals' : '#/businesses');
  return null;
}

/* Latest navigation always wins; a slow screen can never swallow a newer click. */
let ROUTE_TOKEN = 0;
async function route(){
  const token = ++ROUTE_TOKEN;
  const draw = (view) => { if (token === ROUTE_TOKEN) paint(view); };
  try {
    await loadPortfolio();
    const hash = location.hash || '#/';
    const raw = hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = raw.split('?');
    const params = new URLSearchParams(queryPart || '');
    const seg = pathPart.split('/').filter(Boolean);

    /* village */
    if (!seg.length){ CURRENT_CO = null; showVillage(); return; }

    /* company routes */
    if (seg[0] === 'c' && seg[1]){
      const co = companyById(decodeURIComponent(seg[1]));
      if (!co){ location.hash = '#/'; return; }
      CURRENT_CO = co.id;
      draw(loadingView(co.name));
      const sub = seg[2] || 'overview';
      let view;
      if (sub === 'overview')            view = await scrOverview(co);
      else if (sub === 'team')           view = await scrTeam(co);
      else if (sub === 'e' && seg[3])    view = await scrEmployee(co, decodeURIComponent(seg[3]));
      else if (sub === 'work' && seg[3] === 'new') view = await scrWorkNew(co, params);
      else if (sub === 'work')           view = await scrWork(co);
      else if (sub === 'outputs' && seg[3]) view = await scrOutput(co, decodeURIComponent(seg[3]));
      else if (sub === 'outputs')        view = await scrOutputs(co);
      else if (sub === 'knowledge')      view = await scrKnowledge(co);
      else if (sub === 'training')       view = await scrTraining(co, params);
      else if (sub === 'research')       view = await scrResearch(co);
      else if (sub === 'teaching')       view = await scrTeaching(co);
      else if (sub === 'foundry')        view = await scrFoundry(co);
      else if (sub === 'opportunities')  view = await scrOpportunities(co);
      else if (sub === 'approvals')      view = await scrApprovals(co);
      else if (sub === 'money')          view = await scrMoney(co);
      else                               view = await scrOverview(co);
      draw(view);
      return;
    }

    /* portfolio routes */
    CURRENT_CO = null;
    const top = seg[0];
    if (top === 'hq')          { draw(loadingView('Headquarters')); draw(await scrHeadquarters()); return; }
    if (top === 'businesses')  { draw(await scrBusinesses()); return; }
    if (top === 'new')         { draw(loadingView('Start a business')); draw(await intakeScreen('new')); return; }
    if (top === 'grow')        { draw(loadingView('Grow a business')); draw(await intakeScreen('existing')); return; }
    if (top === 'finances')    { draw(await scrFinances()); return; }
    if (top === 'approvals')   { draw(await scrPortfolioApprovals()); return; }
    if (top === 'command')     { draw(await scrCommand()); return; }
    if (top === 'settings')    { draw(loadingView('Settings')); draw(await scrSettings()); return; }

    /* anything else: try to translate an old route, otherwise go home */
    const mapped = legacyTarget(hash);
    if (mapped && mapped !== hash){ location.replace(mapped); return; }
    location.hash = '#/';
  } catch (e){
    console.error(e);
    draw({title:'Something went wrong', sub:'MIDAS could not draw that screen.',
           crumbs:[VILLAGE_CRUMB], body: emptyState('That screen failed to load',
             String(e && e.message || e), 'Back to the village', '#/')});
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('resize', () => { if (!document.getElementById('villageScreen').classList.contains('hidden') && VILLAGE_BUILT) layoutPins(document.getElementById('villageSvg')); });

/* first paint */
(async function boot(){
  document.getElementById('vMetrics').innerHTML = '<div class="vmetric"><span class="kicker">Loading</span><b class="na">Reading your records…</b></div>';
  await route();
})();
