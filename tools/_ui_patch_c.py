from pathlib import Path
html = Path('/workspace/midas/apps/api/src/product-app.html')
text = html.read_text()
def repl(text, start_marker, next_marker, new_body):
    start = text.find(start_marker)
    if start < 0: raise SystemExit('missing '+start_marker)
    end = text.find(next_marker, start)
    if end < 0: raise SystemExit('missing next '+next_marker)
    return text[:start] + new_body + text[end:]

new_ov = chr(10).join([
    'async function renderOverview(){',
    "  const out = await api('/app/overview');",
    '  honesty(out);',
    '  const selected = out.selectedCompany || (out.companies||[])[0] || null;',
    "  const goal = (selected && (selected.goal || selected.ownerGoal || selected.objective)) || (out.goal||'No goal stored yet — set via Companies Start/Grow or Command.');",
    '  const cos = (out.companies||[]).map(function(c){',
    '    const sel = selected && c.id===selected.id ? \' <span class="pill fact">selected</span>\' : \'\';',
    '    return \'<div class="emp"><div><b>\'+esc(c.name)+\'</b>\'+sel+\'<div class="muted">\'+esc(c.id)+\' · \'+esc(c.industry||c.intakeKind||\'\')+\'</div></div><a href="#/companies/\'+encodeURIComponent(c.id)+\'">Open</a></div>\';',
    '  }).join(\'\') || \'<p class="muted">No companies in FILE_STORE.</p>\';',
    "  const emps = (out.employees||[]).filter(function(e){return /authorized|supervised|development_verified|active/i.test(String(e.status||''));}).slice(0,10).map(function(e){",
    '    return \'<div class="emp"><div><b>\'+esc(e.name||e.roleId)+\'</b><div class="muted">\'+esc(e.id)+\' · \'+esc(e.status)+\'</div></div><a href="#/employees/\'+encodeURIComponent(e.id)+\'/brain">Brain</a></div>\';',
    '  }).join(\'\') || \'<p class="muted">No working employees yet.</p>\';',
    '  const objs = (out.activeObjectives||[]).slice(0,8).map(function(o){',
    "    return '<li><b>'+esc(o.id||'')+'</b> '+esc(String(o.ownerText||o.label||'').slice(0,120))+' · '+esc(o.status||'')+'</li>';",
    '  }).join(\'\') || \'<li class="muted">No work in progress.</li>\';',
    '  const outs = (out.recentOutputs||[]).slice(0,8).map(function(d){',
    "    const path = (d.artifact&&d.artifact.path)||d.path||'';",
    '    const link = path ? (\' · <a href="/app/artifacts/file?path=\'+encodeURIComponent(path)+\'" target="_blank">preview</a>\') : \'\';',
    "    return '<li>'+esc(d.title||d.id||d.type||'output')+' · '+esc(d.status||'draft')+link+'</li>';",
    '  }).join(\'\') || \'<li class="muted">No deliverables yet.</li>\';',
    '  const review = (out.reviewNext||[]).map(function(x){return \'<li>\'+esc(x)+\'</li>\';}).join(\'\') || \'<li class="muted">Nothing queued.</li>\';',
    '  const pending = (out.pendingApprovals||[]).length;',
    '  const entries = (out.entryPoints||[',
    "    {label:'Start a new business',href:'#/companies/new'},",
    "    {label:'Grow an existing business',href:'#/companies/existing'},",
    "    {label:'Command',href:'#/command'}",
    '  ]).map(function(a){',
    '    return \'<a href="\'+esc(a.href)+\'"><button class="primary entry" type="button">\'+esc(a.label)+\'</button></a>\';',
    "  }).join(' ');",
    '  const next = (out.nextActions||out.importantActions||[]).slice(0,8).map(function(a){',
    '    return \'<a href="\'+esc(a.href)+\'"><button class="primary" type="button">\'+esc(a.label)+(a.pending?(\' (\'+a.pending+\')\'):\'\')+\'</button></a>\';',
    "  }).join(' ');",
    "  const actual = (out.treasury&&out.treasury.actualSpendUsd!=null)?out.treasury.actualSpendUsd:((out.spend&&out.spend.estimatedUsd)!=null?out.spend.estimatedUsd:'unknown');",
    '  const emb = out.embeddingsStatus || {};',
    "  const working = (out.employees||[]).filter(function(e){return /authorized|supervised|development_verified|active/i.test(String(e.status||''));}).length;",
    "  el('page').innerHTML =",
    '    card(\'AI business OS\', \'<p class="muted">Primary product home. Diagnostics are secondary. FILE_STORE only — not deployed, not 24/7, not IAM/Postgres.</p><div class="row">\'+entries+\'</div>\')+',
    "    card('Dashboard',",
    "      '<p><b>Companies</b> '+(out.companies||[]).length+' · <b>Selected</b> '+esc(selected?(selected.name+' ('+selected.id+')'):'none')+'</p>'+",
    "      '<p><b>Goal</b> '+esc(String(goal).slice(0,240))+'</p>'+",
    "      '<p><b>Employees</b> '+working+' · <b>Work in progress</b> '+((out.activeObjectives||[]).length)+' · <b>Deliverables</b> '+((out.recentOutputs||[]).length)+' · <b>Approvals</b> '+pending+'</p>'+",
    "      '<p><b>ACTUAL spend</b> $'+esc(actual)+' · unknown-cost rows '+esc(out.spend&&out.spend.unknownCostCount)+'</p>'+",
    '      \'<p class="muted">Embeddings: \'+(emb.embeddings===true?(\'proof available (\'+esc(emb.model||\'\')+\') — lexical is still default retrieval\'):\'lexical default; semantic not default\')+\'</p>\'',
    '    )+',
    '    card(\'Next actions\', \'<div class="row">\'+next+\'</div><ul>\'+review+\'</ul><p><a href="#/approvals">Approvals inbox</a> · <a href="#/launch-readiness">Launch Readiness</a> · <a href="#/settings">Settings / integrations</a> · <a href="#/training">Training Lab</a></p>\')+',
    "    card('Companies', cos)+",
    '    card(\'Work in progress\', \'<ul>\'+objs+\'</ul><p><a href="#/work">Open Work</a></p>\')+',
    '    card(\'Employees + Brain\', emps+\'<p><a href="#/training">Training Lab</a> · <a href="#/employees">All employees</a></p>\')+',
    '    card(\'Deliverables\', \'<ul>\'+outs+\'</ul><p><a href="#/deliverables">Open Deliverables</a></p>\')+',
    '    card(\'Spend / Treasury\', \'<p>Speculative revenue is never mixed into ACTUAL. <a href="#/treasury">Treasury</a></p>\')+',
    '    card(\'Workflow proof\', typeof renderWorkflowProofCard===\'function\'?renderWorkflowProofCard(out.workflowProof):\'<p class="muted">See #/workflow-proof</p>\');',
    '}',
    '',
])
text = repl(text, 'async function renderOverview()', 'function fieldRow(label, field)', new_ov)
html.write_text(text)
print('overview', len(text))
