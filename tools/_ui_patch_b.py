from pathlib import Path
html = Path('/workspace/midas/apps/api/src/product-app.html')
text = html.read_text()
def repl(text, start_marker, next_marker, new_body):
    start = text.find(start_marker)
    if start < 0: raise SystemExit('missing '+start_marker)
    end = text.find(next_marker, start)
    if end < 0: raise SystemExit('missing next '+next_marker)
    return text[:start] + new_body + text[end:]

new_set = chr(10).join([
    'function setNav(page, pendingCount){',
    "  el('nav').innerHTML = PRIMARY_NAV.map(function(n){",
    "    const first = n[0].split('/')[0];",
    "    const cls = (first===page?'active':'') + (n[0]==='approvals' && pendingCount ? ' pending' : '');",
    "    const badge = (n[0]==='approvals' && pendingCount) ? ' ('+pendingCount+')' : '';",
    "    const href = n[0]==='diagnostics' ? '/diagnostics' : ('#/'+n[0]);",
    '    return \'<a class="\'+cls+\'" href="\'+href+\'">\'+esc(n[1])+badge+\'</a>\';',
    "  }).join('');",
    '}',
    '',
])
text = repl(text, 'function setNav(page, pendingCount)', 'function honesty(data)', new_set)

new_h = chr(10).join([
    'function honesty(data){',
    '  const h = (data && data.honesty) || {};',
    '  const emb = (data && data.embeddingsStatus) || h.embeddingsStatus || {};',
    '  const embTxt = (emb && emb.embeddings===true)',
    "    ? ('embeddings proof available ('+(emb.model||'model')+') — lexical remains default retrieval')",
    "    : 'embeddings not default (lexical/deterministic retrieval)';",
    "  el('honestyLine').textContent = 'Persistence: FILE_STORE (not PostgreSQL) · '+embTxt+' · search '+(h.searchIntegrationExists===true?'connected-when-proven':'not-connected')+' · live only when a provider call actually ran · never 24/7';",
    '}',
    '',
])
text = repl(text, 'function honesty(data)', 'function showErr(e)', new_h)

new_pill = chr(10).join([
    'function claimPill(cls){',
    "  const raw = String(cls||'unknown').toLowerCase().replace(/[\\s-]+/g,'_');",
    '  const map = {',
    "    owner_provided:'OWNER-PROVIDED', owner_provided_fact:'OWNER-PROVIDED', owner:'OWNER-PROVIDED',",
    "    source_supported:'SOURCE-SUPPORTED', verified_sourced_fact:'SOURCE-SUPPORTED', sourced:'SOURCE-SUPPORTED', verified:'SOURCE-SUPPORTED',",
    "    assumption:'ASSUMPTION', assumptions:'ASSUMPTION',",
    "    hypothesis:'HYPOTHESIS', model_generated_hypothesis:'HYPOTHESIS', ai_generated_business_hypothesis:'HYPOTHESIS',",
    "    unknown:'UNKNOWN', vendor_or_marketing_claim:'ASSUMPTION', vendor:'ASSUMPTION'",
    '  };',
    "  const label = map[raw] || String(cls||'UNKNOWN').toUpperCase().replace(/_/g,'-');",
    "  const klass = label==='OWNER-PROVIDED'?'owner':(label==='SOURCE-SUPPORTED'?'fact':(label==='HYPOTHESIS'?'hyp':(label==='ASSUMPTION'?'vendor':'unknown')));",
    '  return \'<span class="pill \'+klass+\'">\'+esc(label)+\'</span>\';',
    '}',
    'function bridgePill(status){',
    "  const s = String(status||'NOT_CONFIGURED').toUpperCase();",
    "  const allowed = ['NOT_CONFIGURED','READY_TO_STAGE','STAGED','OWNER_REPORTED_EXECUTED','VERIFIED_EXECUTED'];",
    "  const label = allowed.indexOf(s)>=0 ? s : 'NOT_CONFIGURED';",
    "  const klass = label==='VERIFIED_EXECUTED'?'fact':(label==='STAGED'||label==='READY_TO_STAGE'?'vendor':(label==='OWNER_REPORTED_EXECUTED'?'owner':'unknown'));",
    '  return \'<span class="pill \'+klass+\'">\'+esc(label)+\'</span>\';',
    '}',
    '',
])
text = repl(text, 'function claimPill(cls)', 'function claimBlock(label, field)', new_pill)
html.write_text(text)
print('phaseB', len(text))
