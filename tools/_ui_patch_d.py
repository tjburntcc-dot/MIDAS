from pathlib import Path
html = Path('/workspace/midas/apps/api/src/product-app.html')
text = html.read_text()
def repl(text, start_marker, next_marker, new_body):
    start = text.find(start_marker)
    if start < 0: raise SystemExit('missing '+start_marker)
    end = text.find(next_marker, start)
    if end < 0: raise SystemExit('missing next '+next_marker)
    return text[:start] + new_body + text[end:]
new_lr = chr(10).join([
    'async function renderLaunchReadiness(){',
    "  const q = new URLSearchParams((location.hash.split('?')[1]||''));",
    "  const ws = q.get('workspace') || 'ws-own-004';",
    "  const out = await api('/app/launch-readiness?workspaceId='+encodeURIComponent(ws));",
    '  honesty(out);',
    '  const rows = (out.questions||[]).map(function(r){',
    '    return \'<div class="emp"><div><b>\'+esc(r.id)+\'. \'+esc(r.q)+\'</b><div class="muted">\'+esc(r.answer||\'\')+\'</div></div></div>\';',
    "  }).join('');",
    '  const adapters = (out.adapters||out.externalAdapters||[',
    "    {id:'website_publish',status:'NOT_CONFIGURED'},",
    "    {id:'email',status:'NOT_CONFIGURED'},",
    "    {id:'payments',status:'NOT_CONFIGURED'},",
    "    {id:'ads',status:'NOT_CONFIGURED'},",
    "    {id:'crm',status:'NOT_CONFIGURED'}",
    '  ]).map(function(a){',
    '    return \'<div class="emp"><div><b>\'+esc(a.id)+\'</b> \'+bridgePill(a.status||a.bridgeStatus)+\'<div class="muted">\'+esc(a.note||\'Manual bridge / staged-action schema only. Not integrated.\')+\'</div></div></div>\';',
    "  }).join('');",
    '  const next = (out.nextSteps||[',
    "    'Review questions for the selected company',",
    "    'Keep APR-005 pending until you decide as local_owner',",
    "    'Do not publish/email/pay/ads until an adapter moves past NOT_CONFIGURED with explicit owner approval'",
    "  ]).map(function(x){return '<li>'+esc(x)+'</li>';}).join('');",
    "  el('page').innerHTML = card('Launch Readiness — '+esc(out.companyName||ws),",
    '    \'<p class="muted">Actionable checklist. Demo/dev labeled. No contact. No fabricated revenue. No public deploy claim.</p>\'+',
    '    \'<label>Company <select id="lr-ws" onchange="location.hash=\\\'#/launch-readiness?workspace=\\\'+this.value"><option value="ws-own-004"\'+(ws===\'ws-own-004\'?\' selected\':\'\')+\'>Harbor</option><option value="ws-own-005"\'+(ws===\'ws-own-005\'?\' selected\':\'\')+\'>Finch</option><option value="ws-own-003"\'+(ws===\'ws-own-003\'?\' selected\':\'\')+\'>Cedar</option></select></label>\'+',
    '    rows',
    "  )+card('External adapters (manual bridge labels)', adapters)+card('Next setup steps', '<ul>'+next+'</ul>');",
    '}',
    '',
])
text = repl(text, 'async function renderLaunchReadiness()', 'async function renderResearchPage()', new_lr)
new_res = chr(10).join([
    'async function renderResearchPage(){',
    "  const out = await api('/app/research');",
    '  honesty(out);',
    "  let teach = {pairs:[], packets:[], note:''};",
    "  try { teach = await api('/app/teaching-lab'); } catch(e) { teach = {pairs:[], packets:[], note:String(e.message||e)}; }",
    '  const rows = (out.providers||[]).map(function(p){',
    '    return \'<div class="emp"><div><b>\'+esc(p.id)+\'</b> \'+bridgePill(p.status===\'CONNECTED\'?\'READY_TO_STAGE\':(p.status||\'NOT_CONFIGURED\'))+\' · \'+esc(p.status)+\'<div class="muted">\'+esc(p.note||\'\')+\'</div></div></div>\';',
    '  }).join(\'\') || \'<p class="muted">No provider registry rows.</p>\';',
    '  const pairs = (teach.pairs||[]).map(function(p){ return \'<li>\'+esc(p.label|| (p.from+\' → \'+p.to))+\'</li>\'; }).join(\'\') || \'<li class="muted">No teaching pairs yet.</li>\';',
    '  const packets = (teach.packets||[]).map(function(p){',
    '    return \'<div class="emp"><div><b>\'+esc(p.id)+\'</b> \'+esc(p.from)+\' → \'+esc(p.to)+\' · \'+esc(p.status)+\'<div class="muted">\'+esc(p.note||\'\')+\'</div></div></div>\';',
    '  }).join(\'\') || \'<p class="muted">No teaching packets.</p>\';',
    "  el('page').innerHTML =",
    '    card(\'Research / Source providers\', \'<p class="muted">\'+esc(out.note||\'\')+\'</p>\'+rows)+',
    '    card(\'Research → Teaching chain\', \'<p class="muted">Approved research can become teaching packets for Employee Brain / Training Lab. TPK-001 stays awaiting_owner_approval until you decide.</p><h3>Pairs</h3><ul>\'+pairs+\'</ul><h3>Packets</h3>\'+packets+\'<p><a href="#/teaching">Teaching lab</a> · <a href="#/training">Training Lab</a></p>\');',
    '}',
    '',
])
text = repl(text, 'async function renderResearchPage()', 'async function renderTeachingPage()', new_res)
new_del = chr(10).join([
    'async function renderDeliverables(){',
    "  const q = new URLSearchParams((location.hash.split('?')[1]||''));",
    "  const workspace = q.get('workspace') || q.get('workspaceId') || '';",
    "  const path = workspace ? '/app/deliverables?workspaceId='+encodeURIComponent(workspace) : '/app/deliverables';",
    '  const out = await api(path);',
    '  honesty(out);',
    '  const rows = (out.deliverables||out.records||[]).map(function(d){',
    "    const draft = d.draft!==false || d.status==='draft';",
    "    const fpath = (d.artifact&&d.artifact.path)||d.path||'';",
    '    const preview = fpath ? (\'<a href="/app/artifacts/file?path=\'+encodeURIComponent(fpath)+\'" target="_blank">preview</a> · <a href="/app/artifacts/file?path=\'+encodeURIComponent(fpath)+\'&download=1">download</a>\') : \'<span class="muted">no file</span>\';',
    '    return \'<div class="emp"><div><b>\'+esc(d.title||d.type||d.id)+\'</b> \'+(draft?\'<span class="pill unknown">draft</span>\':\'<span class="pill fact">\'+esc(d.status||\'\')+\'</span>\')+\'<div class="muted">\'+esc(d.workspaceId||\'\')+\' · \'+esc(fpath||\'no file\')+\'</div></div><span>\'+preview+\'</span></div>\';',
    '  }).join(\'\') || \'<p class="muted">No deliverables in this workspace.</p>\';',
    "  el('page').innerHTML = card('Deliverables', '<p>Inspectable drafts only. Not deployed. Artifacts stay under var/artifacts/&lt;workspaceId&gt;/. Preview/download open the local FILE_STORE file when present.</p>'+rows);",
    '}',
    '',
])
text = repl(text, 'async function renderDeliverables()', 'async function renderSearch()', new_del)
new_set = chr(10).join([
    'async function renderSettings(){',
    "  let out = {integrations:[], embeddingsStatus:{}, note:'Settings / integrations'};",
    "  try { out = await api('/app/settings'); } catch(e) {",
    '    try {',
    "      const research = await api('/app/research');",
    '      out.integrations = (research.providers||[]).map(function(p){return {id:p.id,status:p.status,note:p.note};});',
    "      out.adapters = [{id:'website_publish',status:'NOT_CONFIGURED'},{id:'email',status:'NOT_CONFIGURED'},{id:'payments',status:'NOT_CONFIGURED'},{id:'ads',status:'NOT_CONFIGURED'},{id:'crm',status:'NOT_CONFIGURED'}];",
    "      out.note = 'Settings assembled from research registry + adapter boundary. No fake active integrations.';",
    '    } catch(e2) { out.note = String(e.message||e); }',
    '  }',
    '  honesty(out);',
    '  const emb = out.embeddingsStatus || {};',
    '  const ints = (out.integrations||[]).map(function(p){',
    '    return \'<div class="emp"><div><b>\'+esc(p.id)+\'</b> \'+bridgePill(p.bridgeStatus||(p.status===\'CONNECTED\'?\'READY_TO_STAGE\':\'NOT_CONFIGURED\'))+\' · \'+esc(p.status||\'NOT_CONFIGURED\')+\'<div class="muted">\'+esc(p.note||\'\')+\'</div></div></div>\';',
    '  }).join(\'\') || \'<p class="muted">No integrations configured.</p>\';',
    '  const ads = (out.adapters||[]).map(function(p){',
    '    return \'<div class="emp"><div><b>\'+esc(p.id)+\'</b> \'+bridgePill(p.status)+\'<div class="muted">\'+esc(p.note||\'NOT_CONFIGURED — next step: owner supplies credentials + approval\')+\'</div></div></div>\';',
    "  }).join('');",
    "  el('page').innerHTML =",
    '    card(\'Settings / integrations\', \'<p class="muted">\'+esc(out.note||\'\')+\' Unsupported sections show real status + next setup step. No fake active agents.</p>\')+',
    '    card(\'Embeddings\', \'<p>\'+(emb.embeddings===true?(\'Proof available: model \'+esc(emb.model||\'\')+\' · cost ~$\'+esc(emb.costUsd)+\' · <b>lexical remains default retrieval</b>\'):\'Semantic search is not default. Lexical/deterministic retrieval is active.\')+\'</p><p class="muted">Never claim vector search as product default without making it default.</p>\')+',
    "    card('Source providers', ints)+",
    '    card(\'External action adapters\', ads || \'<p class="muted">website_publish / email / payments / ads / crm — all NOT_CONFIGURED</p>\')+',
    '    card(\'Key setup\', \'<p class="muted">Supply OPENAI_API_KEY_PLACEHOLDER only in local <code>.env</code> (never paste in chat). Use Diagnostics / control-room key form on this machine only. .env is chmod 600 and excluded from handoff archives.</p><p><a href="/diagnostics">Open Diagnostics</a></p>\');',
    '}',
    '',
])
if 'async function renderSettings()' not in text:
    text = text.replace('async function renderLaunchReadiness()', new_set + 'async function renderLaunchReadiness()', 1)
old_route = "else if(r.page==='launch-readiness') await renderLaunchReadiness();"
new_route = "else if(r.page==='launch-readiness') await renderLaunchReadiness();\n    else if(r.page==='settings') await renderSettings();"
if old_route in text and "r.page==='settings'" not in text:
    text = text.replace(old_route, new_route, 1)
html.write_text(text)
print('phaseD', len(text), 'settings' in text)
