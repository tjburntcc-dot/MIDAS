'use strict';

const $ = selector => document.querySelector(selector);
const array = value => Array.isArray(value) ? value : [];
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const words = value => String(value ?? '').replace(/[_-]+/g, ' ').replace(/^\w/, character => character.toUpperCase());
const query = new URLSearchParams(location.search);
const state = { data: null, csrf: '', view: query.get('view') || 'overview', ventureId: query.get('venture') || '', responseDraftId: query.get('draft') || '', busy: false, polling: false, timer: null, drafts: {}, workFilter: 'all', laneFilter: 'all', notice: null, lastRead: null };
const globalViews = { overview: 'Portfolio', work: 'Work', products: 'Products', decisions: 'Decisions' };
const ventureViews = { overview: 'Overview', work: 'Work', products: 'Products', evidence: 'Evidence', results: 'Results' };
const stateLabels = { queued: 'Ready', running: 'In progress', blocked: 'Blocked', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled', stale: 'Inputs changed', needs_reconciliation: 'Outcome uncertain', waiting: 'Waiting', active: 'Active', prepared: 'Prepared', delivered_locally: 'Local delivery published', hypothesis: 'Hypothesis', source_assertion: 'Source says', observed: 'Observed', owner_reported: 'Owner reported', unknown: 'Unknown' };

function normalize(input) {
  const raw = input.snapshot || input;
  const ventures = array(raw.ventures);
  const gather = name => array(raw[name]).length ? array(raw[name]) : ventures.flatMap(venture => array(venture[name]).map(item => ({ ventureId: venture.id, ...item })));
  const decisions = gather('decisions').map(item => ({ ...item, title: item.title || (item.taskId && item.rationale ? 'Work reassessed from evidence' : 'Prepared decision'), reason: item.reason || item.rationale || item.summary, status: item.status || (!array(item.choices).length && item.taskId && item.rationale ? 'recorded' : 'pending') }));
  return { ...raw, portfolio: raw.portfolio || {}, ventures, tasks: gather('tasks'), workers: array(raw.workers), artifacts: gather('artifacts'), observations: gather('observations'), decisions, commercialDrafts: gather('commercialDrafts'), sources: gather('sources'), claims: gather('claims'), activity: array(raw.activity), resources: raw.resources || {} };
}

const venture = id => state.data?.ventures.find(item => item.id === (id || state.ventureId));
const scoped = name => array(state.data?.[name]).filter(item => !state.ventureId || item.ventureId === state.ventureId);
const forVenture = (name, id) => array(state.data?.[name]).filter(item => item.ventureId === id);
const task = id => state.data?.tasks.find(item => item.id === id);
const artifact = id => state.data?.artifacts.find(item => item.id === id);
const source = (id, ventureId = state.ventureId) => { const matches = array(state.data?.sources).filter(item => item.id === id && (!ventureId || item.ventureId === ventureId)); return matches.length === 1 ? matches[0] : undefined; };
const count = (amount, singular, plural = `${singular}s`) => `${amount} ${amount === 1 ? singular : plural}`;
const date = value => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : 'Date not recorded'; };
const shortTime = value => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(parsed) : ''; };
const badge = (label, kind = label) => `<span class="badge ${escape(String(kind || '').replace(/_/g, '-'))}">${escape(stateLabels[label] || words(label))}</span>`;
const metric = (label, value, detail) => `<article class="metric"><span class="metric-label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(detail || '')}</small></article>`;
const empty = (title, detail) => `<div class="empty-state"><h3>${escape(title)}</h3><p>${escape(detail)}</p></div>`;
const sectionHeading = (title, description = '', right = '') => `<div class="section-heading"><div><h2>${escape(title)}</h2>${description ? `<p>${escape(description)}</p>` : ''}</div>${right}</div>`;
const button = (label, action, data = {}, style = '') => `<button type="button" class="button ${style}" data-action="${escape(action)}" ${Object.entries(data).map(([key, value]) => `data-${key}="${escape(value)}"`).join(' ')} ${state.busy ? 'disabled' : ''}>${escape(label)}</button>`;
const navigation = (label, view, id = '', style = 'text-button') => `<button type="button" class="${style}" data-navigate="${escape(view)}" data-venture="${escape(id)}">${escape(label)}</button>`;
const panel = (title, content, extra = '') => `<section class="panel"><div class="panel-heading"><h2>${escape(title)}</h2>${extra}</div>${content}</section>`;
const excerpt = (text, limit = 200) => String(text ?? '').length > limit ? String(text).slice(0, limit).trimEnd() + '…' : String(text ?? '');
const money = (minor, currency = 'USD') => Number.isFinite(minor) ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100) : 'Not observed';

function authored(value) {
  const text = typeof value === 'object' ? value.kind || value.source || '' : String(value || '');
  if (/offline_mock_with_real_local_tool_effects/i.test(text)) return 'Fixture worker + local tools';
  if (/offline|fixture|mock|synthetic/i.test(text)) return 'Offline fixture';
  if (/developer|development.assistant|development.agent/i.test(text)) return 'Built by development agent';
  if (/actual.model|runtime.model/i.test(text)) return 'Runtime model output';
  if (/runtime|tool.execution|local.tool/i.test(text)) return 'Runtime tool output';
  if (/owner|human/i.test(text)) return 'Owner supplied';
  if (/public|source/i.test(text)) return 'Public source';
  return text ? words(text) : 'Origin not recorded';
}

function localUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

function sourceUrl(value) {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

function pendingDecisions(items = scoped('decisions')) { return items.filter(item => !['resolved', 'accepted', 'rejected', 'completed', 'cancelled', 'dismissed', 'recorded'].includes(item.status)); }
function outputArtifacts(items = scoped('artifacts')) { return items.filter(item => !['source', 'research-source', 'source_snapshot', 'log', 'event', 'plan'].includes(item.kind)); }
function newestProducts(items) { return array(items).map((item, index) => ({ item, index, time: Date.parse(item.updatedAt || item.createdAt || task(item.taskId)?.updatedAt || task(item.taskId)?.createdAt || '') || 0 })).sort((left, right) => right.time - left.time || left.index - right.index).map(row => row.item); }
function runnableTasks(items = scoped('tasks')) { return items.filter(item => !['completed', 'cancelled'].includes(item.status)); }
function nextTask(id) { return forVenture('tasks', id).filter(item => !['completed', 'cancelled'].includes(item.status)).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]; }
function activeTasks(items) { return array(items).filter(item => !['completed', 'cancelled'].includes(item.status)); }
function executionStatus(items, decisions = []) {
  const open = activeTasks(items);
  return {
    running: open.filter(item => item.status === 'running').length,
    completed: array(items).filter(item => item.status === 'completed').length,
    blocked: open.filter(item => ['blocked', 'stale', 'needs_reconciliation'].includes(item.status)).length,
    awaitingOwner: open.filter(item => ['waiting', 'awaiting_owner'].includes(item.status) || item.modelDisabledUntilGrant || venture(item.ventureId)?.modelDisabledUntilGrant).length + pendingDecisions(decisions).length
  };
}
function economicsPulse(ventures) {
  const rows = array(ventures).map(item => item.economics || {});
  const currency = rows.find(item => item.currency)?.currency || 'USD';
  const total = key => { const values = rows.map(item => amount(item, key)).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) : null; };
  return { currency, cost: total('cost'), reserved: total('reserved') };
}
function executionStrip(items, decisions = []) {
  const status = executionStatus(items, decisions);
  return `<section class="execution-strip" aria-label="Execution status"><article><span>Running</span><strong>${status.running}</strong><small>Active assignments</small></article><article><span>Completed</span><strong>${status.completed}</strong><small>Saved work results</small></article><article class="${status.blocked ? 'attention' : ''}"><span>Blocked or stale</span><strong>${status.blocked}</strong><small>${status.blocked ? 'Needs a resolved constraint' : 'No saved constraint'}</small></article><article class="${status.awaitingOwner ? 'awaiting' : ''}"><span>Awaiting owner</span><strong>${status.awaitingOwner}</strong><small>Decision or signed grant</small></article></section>`;
}
function modelAccountingPanel(accounting = state.data?.modelAccounting) {
  if (!accounting || !['unfunded', 'available', 'unavailable'].includes(accounting.status)) return '';
  const amount = value => Number.isFinite(value) ? money(value, accounting.currency || 'USD') : 'Not reported';
  const value = input => Number.isFinite(input) ? String(input) : 'Not reported';
  const title = accounting.status === 'available' ? 'Model accounting' : accounting.status === 'unfunded' ? 'Model accounting · no signed grant' : 'Model accounting unavailable';
  const summary = accounting.status === 'available'
    ? `${accounting.mode === 'live' ? 'Live model authority is recorded.' : 'A model grant is recorded.'} This ledger is read-only and separate from venture economics.`
    : accounting.status === 'unfunded'
      ? 'No signed model grant is loaded. No inference dispatch, provisional estimate or authoritative billing settlement is recorded.'
      : escape(accounting.reason || 'The read-only accounting snapshot is unavailable.');
  if (accounting.status === 'unavailable') return `<details class="model-accounting"><summary><span><strong>${escape(title)}</strong><small>Read-only ledger unavailable</small></span>${badge('Unknown', 'unknown')}</summary><div class="model-accounting-body"><p>${summary}</p><p class="model-accounting-note">Amounts are intentionally omitted until a persisted accounting snapshot is available.</p></div></details>`;
  const status = accounting.status === 'available' ? `${accounting.expired ? 'Expired' : accounting.revoked ? 'Revoked' : accounting.halted ? 'Halted' : 'Available'} · read-only` : 'Unfunded · read-only';
  const limit = Number.isFinite(accounting.callLimit) ? `${value(accounting.callsUsed)}/${value(accounting.callLimit)}` : value(accounting.callsUsed);
  const unknownCosts = Number.isFinite(accounting.unknownCostAttempts) ? accounting.unknownCostAttempts : 0;
  const estimatedAttempts = Number.isFinite(accounting.estimatedAttempts) ? accounting.estimatedAttempts : 0;
  const provisionalDetail = Number.isFinite(accounting.provisionalMinor) ? (unknownCosts ? `Known subtotal from ${estimatedAttempts} estimate${estimatedAttempts === 1 ? '' : 's'}; ${unknownCosts} cost${unknownCosts === 1 ? '' : 's'} unavailable` : 'Estimate; not an authoritative settlement') : unknownCosts ? `${unknownCosts} estimate${unknownCosts === 1 ? '' : 's'} unavailable; no known subtotal` : 'No provisional estimate recorded';
  const concise = `${accounting.status === 'unfunded' ? 'Unfunded' : 'Signed'} · ${limit} admissions · ${amount(accounting.retainedMinor)} retained`;
  return `<details class="model-accounting"><summary><span><strong>${escape(title)}</strong><small>${escape(concise)}</small></span>${badge(status, accounting.status === 'available' ? 'prepared' : 'unknown')}</summary><div class="model-accounting-body"><p>${summary}</p><div class="model-accounting-grid">${metric('Inference admissions', limit, 'Admitted model calls / configured cap')}${metric('Inference dispatches', value(accounting.inferenceDispatches), 'Actual provider-bound dispatches')}${metric('Count requests', value(accounting.countRequests), 'Separate count endpoint dispatches')}${metric('Provisional estimate', amount(accounting.provisionalMinor), provisionalDetail)}${metric('Authoritative settlements', accounting.settlementCount ? amount(accounting.settledMinor) : 'None recorded', accounting.settlementCount ? `${value(accounting.settlementCount)} recorded settlement${accounting.settlementCount === 1 ? '' : 's'}` : 'Provider billing has not been reconciled')}${metric('Retained exposure', amount(accounting.retainedMinor), `Includes ${amount(accounting.countBufferMinor)} count buffer`) }${metric('Remaining cap', amount(accounting.remainingMinor), accounting.status === 'unfunded' ? 'No funded cap is available' : 'Read-only remaining allowance')}</div><p class="model-accounting-note">Execution authority: ${accounting.executionAuthority ? 'recorded by the signed grant' : 'not present'}. ${accounting.reason ? escape(accounting.reason) : ''}</p></div></details>`;
}
function workerName(item) { const worker = state.data?.workers.find(worker => worker.id === item.workerId); return worker?.name || (typeof item.worker === 'string' ? item.worker : item.worker?.name) || 'Awaiting assignment'; }
function lane(item) { return ['research', 'build', 'commit'].includes(item.lane) ? item.lane : 'research'; }
function allDependencyTasks(item) { return array(item.dependsOn).map(id => task(id) || state.data.tasks.find(candidate => candidate.ventureId === item.ventureId && candidate.localId === id)).filter(Boolean); }
function executionLabel(item) {
  const mode = item.executionMode || item.mode || venture(item.ventureId)?.executionMode || venture(item.ventureId)?.mode;
  if (/offline|fixture|mock/i.test(String(mode))) return 'Offline fixture execution';
  if (item.modelDisabledUntilGrant || /disabled|awaiting.authorization/i.test(String(mode))) return 'Model execution awaiting authority';
  if (/model|live/i.test(String(mode))) return 'Authorized model required';
  if (/local|tool/i.test(String(mode))) return 'Local tool execution';
  return '';
}

function controls(item) {
  if (Array.isArray(item.controls) || Array.isArray(item.allowedActions)) return array(item.controls || item.allowedActions).filter(action => ['run', 'pause', 'resume', 'cancel'].includes(action));
  if (item.modelDisabledUntilGrant || venture(item.ventureId)?.modelDisabledUntilGrant) return item.status === 'running' ? ['pause', 'cancel'] : ['queued', 'paused'].includes(item.status) ? ['cancel'] : [];
  if (item.status === 'running') return ['pause', 'cancel'];
  if (item.status === 'paused') return ['resume', 'cancel'];
  if (item.status === 'queued') return item.runnable !== false && allDependencyTasks(item).every(dependency => dependency.status === 'completed') ? ['run', 'pause', 'cancel'] : ['pause', 'cancel'];
  return ['blocked', 'stale'].includes(item.status) ? ['cancel'] : [];
}

function renderNavigation() {
  const decisionCount = pendingDecisions(state.data.decisions).length;
  const icons = { overview: '◫', work: '≡', products: '▱', decisions: '◇' };
  $('#primary-navigation').innerHTML = Object.entries(globalViews).map(([key, label]) => `<button type="button" data-navigate="${key}" data-venture="" class="${!state.ventureId && state.view === key ? 'active' : ''}" ${!state.ventureId && state.view === key ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icons[key]}</span>${label}${key === 'decisions' && decisionCount ? `<span class="nav-count">${decisionCount}</span>` : ''}</button>`).join('');
  $('#venture-navigation').innerHTML = state.data.ventures.map(item => `<button type="button" data-navigate="overview" data-venture="${escape(item.id)}" class="${state.ventureId === item.id ? 'active' : ''}" ${state.ventureId === item.id ? 'aria-current="page"' : ''}><span class="venture-dot ${escape(item.stage || '')}"></span><span>${escape(item.name)}</span></button>`).join('');
  const active = venture();
  $('#breadcrumbs').innerHTML = active ? `${navigation('Portfolio', 'overview', '', 'breadcrumb-parent')}<span class="breadcrumb-separator">/</span>${escape(active.name)}` : escape(globalViews[state.view] || 'Portfolio');
  $('#last-updated').textContent = `Updated ${shortTime(state.lastRead)}`;
  const activeSlots = Number(state.data.resources.activeWorkerSlots ?? state.data.tasks.filter(item => item.status === 'running').length);
  $('#runtime-status').textContent = `${count(activeSlots, 'active assignment')} · ${count(state.data.tasks.filter(item => item.status === 'completed').length, 'completed assignment')}`;
  document.title = `${active?.name || globalViews[state.view] || 'Portfolio'} · MIDAS`;
}

function render() {
  if (!state.data) return;
  if (state.ventureId && !venture()) state.ventureId = '';
  const allowedViews = state.ventureId ? ventureViews : globalViews;
  if (!allowedViews[state.view]) state.view = 'overview';
  renderNavigation();
  const content = state.view === 'work' ? workView() + teamCapacityView() : state.view === 'products' ? productsView() + commercialPreparationView() : state.view === 'decisions' ? decisionsView() + commercialPreparationView(true) : state.view === 'evidence' ? evidenceView() : state.view === 'results' ? resultsView() : state.ventureId ? ventureOverview() : portfolioView();
  $('#workspace').innerHTML = (state.ventureId ? ventureHeader() : '') + content;
  renderNotice();
  $('#refresh-button').disabled = state.busy || state.polling;
}

function portfolioView() {
  const data = state.data, active = data.tasks.filter(item => item.status === 'running'), completed = data.tasks.filter(item => item.status === 'completed');
  const issues = data.tasks.filter(item => ['blocked', 'stale', 'needs_reconciliation'].includes(item.status));
  const decisions = pendingDecisions(data.decisions), products = outputArtifacts(data.artifacts);
  const capacity = data.portfolio.maxConcurrency ?? data.resources.limits?.maxConcurrency ?? data.resources.limits?.workerSlots ?? '—';
  const goal = data.portfolio.goal || 'Discover worthwhile businesses, build useful products, and improve them from evidence.';
  const economics = economicsPulse(data.ventures);
  return `<div class="page-heading"><div><p class="eyebrow">THE BIG PICTURE</p><h1>Your portfolio</h1><p>Businesses, useful work and the decisions that move them forward.</p></div><div class="heading-aside heading-tools"><span class="badge provenance">Local workspace</span>${state.data.operatingPacket ? button('Owner operating packet', 'operating-packet', {}, 'small') : ''}</div></div>
    <section class="hero"><div><p class="eyebrow">${escape(data.portfolio.name || 'MIDAS OWNED BUSINESSES')}</p><h1>${active.length ? 'Useful work is underway.' : products.length ? 'Built to inspect. Ready to improve.' : 'From opportunities to working businesses.'}</h1><p>${escape(goal)}</p></div><div class="hero-side"><strong>${active.length}<span class="visually-hidden"></span></strong><span>${active.length === 1 ? 'assignment running' : 'assignments running'}</span><small>${escape(capacity)} shared execution slots · ${completed.length} completed</small></div></section>
    ${executionStrip(data.tasks, data.decisions)}
    ${modelAccountingPanel(data.modelAccounting)}
    ${sectionHeading('Ready to use now', 'Open a local product or inspect what its recorded checks establish.', navigation('View all products →', 'products'))}${products.length ? `<div class="product-grid featured-products">${newestProducts(products).map(productCard).join('')}</div>` : empty('No usable output yet', 'Prepared products and deliveries will appear here once a task records them.')}
    <div class="metrics">${metric('Ventures', data.ventures.length, 'Research, prototypes and operating businesses')}${metric('Products ready', products.length, products.length ? 'Open and inspect the recorded outputs' : 'Outputs appear after work produces them')}${metric('Observed cost', money(economics.cost, economics.currency), economics.cost === null ? 'No cost observation has been recorded' : 'Recorded, attributable cost')}${metric('Reserved spending', money(economics.reserved, economics.currency), economics.reserved === null ? 'No monetary exposure has been reserved' : 'Held exposure, separate from cost')}</div>
    ${sectionHeading('Businesses we are building', 'Reversible development stays separate from commercial commitments.', `<span class="count">${count(data.ventures.length, 'venture')}</span>`)}
    ${data.ventures.length ? `<div class="venture-grid">${data.ventures.map(ventureCard).join('')}</div>` : empty('The portfolio is empty', 'No venture has been prepared in this workspace yet.')}
    <div class="two-columns">${panel('Latest changes', activityList(), navigation('View work →', 'work'))}${panel('What needs your attention', decisions.length ? decisions.slice(0, 3).map(item => `<article class="decision-preview"><h3>${escape(item.title)}</h3><p>${escape(excerpt(item.reason || item.summary || item.recommendation, 180))}</p>${navigation('Review decision →', 'decisions')}</article>`).join('') : issues.length ? issues.slice(0, 3).map(item => `<article class="decision-preview"><h3>${escape(item.title)}</h3><p>${escape(item.reason || 'Work requires attention before it can continue.')}</p>${navigation('Inspect assignment →', 'work', item.ventureId)}</article>`).join('') : empty('No owner decision waiting', 'MIDAS can continue eligible local work within its configured boundaries.'))}</div>`;
}

function ventureCard(item) {
  const tasks = forVenture('tasks', item.id), next = nextTask(item.id), outputs = outputArtifacts(forVenture('artifacts', item.id));
  return `<article class="venture-card"><div class="venture-card-top"><div class="card-meta">${badge(item.stage || 'research')}${item.model || item.businessModel ? badge(item.model || item.businessModel, 'provenance') : ''}${item.status === 'paused' ? badge('paused') : ''}</div><h3>${escape(item.name)}</h3><p class="summary">${escape(excerpt(item.summary || item.goal, 200))}</p><span class="label">Next useful step</span><p class="next-work">${escape(item.nextAction || next?.title || 'No next work recorded.')}</p></div><div class="venture-card-bottom"><span>${count(outputs.length, 'output')} · ${tasks.filter(task => task.status === 'running').length} running</span>${navigation('Open venture ↗', 'overview', item.id)}</div></article>`;
}

function ventureHeader() {
  const item = venture();
  const controlList = array(item.controls || item.allowedActions).filter(action => ['pause', 'resume', 'cancel'].includes(action));
  return `<div class="page-heading venture-heading"><div><div class="card-meta">${badge(item.stage || 'research')}${item.model || item.businessModel ? badge(item.model || item.businessModel, 'provenance') : ''}${badge(item.status || 'active')}</div><h1>${escape(item.name)}</h1><p class="subtitle">${escape(item.summary || excerpt(item.goal, 240))}</p></div>${controlList.length ? `<div class="actions">${controlList.map(action => button(`${words(action)} venture`, `venture-${action}`, { venture: item.id }, `small ${action === 'cancel' ? 'danger' : ''}`)).join('')}</div>` : ''}</div><nav class="tabs" aria-label="Venture sections">${Object.entries(ventureViews).map(([key, label]) => `<button type="button" data-navigate="${key}" data-venture="${escape(item.id)}" class="${key === state.view ? 'active' : ''}" ${key === state.view ? 'aria-current="page"' : ''}>${label}${key === 'products' && outputArtifacts().length ? ` (${outputArtifacts().length})` : ''}</button>`).join('')}</nav>`;
}

function ventureOverview() {
  const item = venture(), tasks = scoped('tasks'), outputs = outputArtifacts(), next = nextTask(item.id), observations = scoped('observations');
  const claims = scoped('claims');
  const why = item.whyNow || item.rationale || claims.find(claim => ['hypothesis', 'source_assertion'].includes(claim.kind))?.text;
  const bottleneck = typeof item.bottleneck === 'string' ? item.bottleneck : item.bottleneck?.description || array(item.bottlenecks)[0]?.description || tasks.find(task => ['blocked', 'needs_reconciliation', 'stale'].includes(task.status))?.reason;
  return `${executionStrip(tasks, forVenture('decisions', item.id))}
    ${sectionHeading(outputs.length ? 'Product ready to use' : 'Product status', outputs.length ? 'Try the local product or inspect the completed delivery before deciding what to improve.' : 'No current delivery is ready to inspect.')}${outputs.length ? `<div class="product-grid featured-products">${newestProducts(outputs).map(productCard).join('')}</div>` : empty('No product or delivery yet', 'Completed output will appear here with its origin, version and inspection links.')}
    <div class="two-columns equal">${panel('The business thesis', `<div class="fact-grid"><div><span class="fact-label">Customer</span><div class="fact-value">${escape(item.customer || item.buyer || 'Customer definition not recorded.')}</div></div><div><span class="fact-label">Current commitment</span><div class="fact-value">${escape(words(item.commitment || item.stage || 'research'))}</div></div></div><div class="insight"><strong>Why pursue this?</strong><p>${escape(why || 'The opportunity remains a hypothesis. Research should establish the customer job, substitutes and access route.')}</p></div><div class="insight"><strong>What must be resolved</strong><p>${escape(bottleneck || item.uncertainty || 'Customer demand and repeatable economics have not been established.')}</p></div>${item.goal ? `<details class="technical"><summary>Full venture objective</summary><p class="artifact-content">${escape(item.goal)}</p></details>` : ''}`)}
    ${panel('The next useful result', `<p>${escape(item.nextAction || next?.title || 'No next assignment has been recorded.')}</p>${next ? `<div class="insight"><strong>${escape(next.title)}</strong><p>${escape(next.reason || next.objective || next.description || '')}</p></div><div class="card-meta">${badge(next.status)} ${badge(lane(next))}</div><div class="actions">${navigation('Open work →', 'work', item.id, 'button primary')}</div>` : ''}<div class="lane-overview">${['research', 'build', 'commit'].map(value => { const rows = tasks.filter(task => lane(task) === value); return `<div>${badge(value)}<strong>${rows.filter(task => task.status === 'completed').length} / ${rows.length}</strong><small>${value === 'research' ? 'Learn about the opportunity' : value === 'build' ? 'Develop reversible outputs' : 'Make authorized commitments'}</small></div>`; }).join('')}</div>`)}</div>
    <div class="two-columns equal">${panel('Evidence behind the work', claims.length ? claims.slice(0, 3).map(claimCard).join('') : empty('Evidence is still being gathered', 'Keep source statements, hypotheses and observed results separate.'), navigation('Open evidence →', 'evidence', item.id))}${panel('Latest observed changes', observations.length ? observationList(observations.slice(-3).reverse()) : empty('No operating outcome recorded', 'A built prototype is an output. Customer use, acceptance and revenue require their own evidence.'), navigation('Open results →', 'results', item.id))}</div>`;
}

function workView() {
  const tasks = scoped('tasks');
  const filtered = tasks.filter(item => (state.workFilter === 'all' || state.workFilter === 'open' && !['completed', 'cancelled'].includes(item.status) || item.status === state.workFilter) && (state.laneFilter === 'all' || lane(item) === state.laneFilter));
  const ranks = { running: 0, needs_reconciliation: 1, blocked: 2, stale: 3, queued: 4, paused: 5, completed: 6, cancelled: 7 };
  filtered.sort((a, b) => (ranks[a.status] ?? 8) - (ranks[b.status] ?? 8) || (b.priority ?? 0) - (a.priority ?? 0));
  return `${!state.ventureId ? `<div class="page-heading"><div><p class="eyebrow">PORTFOLIO EXECUTION</p><h1>Work with a purpose</h1><p>Every assignment has a result to produce, dependencies and a saved execution state.</p></div></div>` : ''}<div class="filter-bar"><label>Show<select id="work-filter" aria-label="Filter work by status">${[['all', 'All work'], ['open', 'Open work'], ['running', 'In progress'], ['blocked', 'Blocked'], ['paused', 'Paused'], ['completed', 'Completed']].map(([value, label]) => `<option value="${value}" ${state.workFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Purpose<select id="lane-filter" aria-label="Filter work by purpose">${[['all', 'All purposes'], ['research', 'Research'], ['build', 'Build'], ['commit', 'Commit']].map(([value, label]) => `<option value="${value}" ${state.laneFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><span class="filter-note">${count(filtered.length, 'assignment')} · controls apply to the named task</span></div>${filtered.length ? `<div class="task-list">${filtered.map(taskCard).join('')}</div>` : empty('No work in this view', tasks.length ? 'Choose another filter to inspect the remaining assignments.' : 'No runnable plan has been prepared for this venture.')}`;
}

function taskCard(item) {
  const dependencies = allDependencyTasks(item), actions = controls(item), checks = array(item.result?.checks);
  const acceptance = array(item.acceptance || item.completionCriteria);
  const execution = executionLabel(item);
  return `<article class="task-card" data-task-card="${escape(item.id)}"><div><div class="task-eyebrow">${badge(lane(item))}${badge(item.status)}${!state.ventureId ? `<span>${escape(venture(item.ventureId)?.name || 'Venture')}</span>` : ''}</div><h3>${escape(item.title)}</h3><p>${escape(item.objective || item.description || '')}</p>${item.reason && (!['completed', 'queued'].includes(item.status) || item.outputCurrent === false || item.runnable === false) ? `<p class="task-reason">${escape(item.reason)}</p>` : ''}${item.providerExecution ? `<p class="task-reason">${item.providerExecution.terminalPersisted ? 'Provider result preserved; task acceptance is recorded separately.' : item.providerExecution.responseId ? 'Provider response identity saved. Recovery retrieves the same response; it does not start another inference.' : 'No response identity saved. Completion is unknown; automatic resubmission is blocked.'} Read requests: ${escape(item.providerExecution.retrievalRequests)}.</p><details><summary>Long-running response and recovery</summary><p>Provider status: ${escape(item.providerExecution.status)}. Completion deadline: ${escape(item.providerExecution.completionDeadlineAt || 'Not dispatched')}. Latest permitted retrieval: ${escape(item.providerExecution.resumeUntil || 'Not dispatched')}.</p><p>Response identity: ${escape(item.providerExecution.responseId || 'Unavailable')}. No completion or billing guarantee is implied.</p></details>` : ''}${item.result?.summary ? `<p>${escape(item.result.summary)}</p>` : ''}${dependencies.length || acceptance.length || checks.length ? `<details><summary>Completion criteria, dependencies and checks</summary>${acceptance.length ? `<ul>${acceptance.map(rule => `<li>${escape(typeof rule === 'string' ? rule : rule.description || rule.label)}</li>`).join('')}</ul>` : ''}${dependencies.length ? `<p>Depends on: ${dependencies.map(dependency => `${escape(dependency.title)} (${escape(stateLabels[dependency.status] || words(dependency.status))})`).join('; ')}.</p>` : ''}${checks.length ? renderChecks(checks) : ''}</details>` : ''}<div class="task-footer"><span>Worker: ${escape(workerName(item))}</span>${execution ? `<span>${escape(execution)}</span>` : ''}${item.updatedAt ? `<span>Updated ${escape(date(item.updatedAt))}</span>` : ''}</div></div><div class="task-actions">${actions.map(action => button(action === 'run' && /offline|fixture/i.test(execution) ? 'Run fixture' : words(action), action, { task: item.id, venture: item.ventureId }, `small ${action === 'run' || action === 'resume' ? 'primary' : action === 'cancel' ? 'danger' : ''}`)).join('')}${array(item.outputArtifacts).length || array(item.result?.artifacts).length ? navigation('Inspect output', 'products', item.ventureId, 'button small') : ''}</div></article>`;
}

function teamCapacityView() {
  const resources = state.ventureId ? state.data.resources.byVenture?.[state.ventureId] || {} : state.data.resources;
  const limits = state.data.resources.limits || {}, used = resources.used || {}, reserved = resources.reserved || {};
  const tasks = scoped('tasks'), countValue = value => Number.isFinite(value) ? value : 'Not recorded';
  const workers = state.data.workers.filter(worker => !state.ventureId || tasks.some(task => task.workerId === worker.id || array(worker.capabilities).includes(task.capability)));
  return `${sectionHeading('Team & execution capacity', 'Assignments connect workers to concrete work; resource counters stay separate from monetary cost.')}<div class="two-columns equal">${panel('Workers for this work', workers.length ? `<ul class="compact-list">${workers.map(worker => { const active = tasks.filter(task => task.workerId === worker.id && task.status === 'running'); const completed = tasks.filter(task => task.workerId === worker.id && task.status === 'completed'); return `<li><strong>${escape(worker.name || worker.id)}</strong><small>${active.length ? active.map(task => escape(task.title)).join(' · ') : worker.available === false ? 'Unavailable for new assignments' : 'Available for eligible assignments'} · ${count(completed.length, 'completed task')}</small>${workerEvidence(worker)}${array(worker.competencies).length ? `<details class="technical"><summary>Competencies and procedure</summary><p>${escape(worker.competencies.map(words).join(' · '))}</p><p>${escape(worker.procedureId ? `Procedure: ${worker.procedureId}` : 'No procedure version recorded.')}</p></details>` : ''}</li>`; }).join('')}</ul>` : empty('No worker assigned yet', 'Worker selection appears here when a compatible capability is available.'))}${panel(state.ventureId ? 'Venture resource usage' : 'Shared resource usage', `<div class="fact-grid"><div><span class="fact-label">Active worker slots</span><div class="fact-value">${escape(countValue(resources.activeWorkerSlots))}${!state.ventureId && Number.isFinite(limits.workerSlots) ? ` / ${limits.workerSlots}` : ''}</div></div><div><span class="fact-label">Worker execution time</span><div class="fact-value">${Number.isFinite(used.workerMs) ? `${(used.workerMs / 1000).toFixed(1)} seconds` : 'Not recorded'}</div></div><div><span class="fact-label">Local tool runs</span><div class="fact-value">${escape(countValue(used.localToolRuns))} used · ${escape(countValue(reserved.localToolRuns))} reserved${!state.ventureId && Number.isFinite(limits.localToolRuns) ? ` · ${limits.localToolRuns} limit` : ''}</div></div><div><span class="fact-label">Model calls</span><div class="fact-value">${escape(countValue(used.modelCalls))} used · ${escape(countValue(reserved.modelCalls))} reserved${!state.ventureId && Number.isFinite(limits.modelCalls) ? ` · ${limits.modelCalls} limit` : ''}</div></div></div><p class="help muted">Execution time is not owner effort. Scheduling counters do not establish provider billing or business value.</p>`)}</div>`;
}

function workerEvidence(worker) {
  const reason = worker.selectionReason || worker.reason || worker.rationale;
  const evidence = array(worker.evidence);
  return `${reason ? `<p>${escape(reason)}</p>` : ''}<details class="technical"><summary>Qualification and supporting evidence</summary><p>${escape(worker.qualification ? words(worker.qualification) : 'Comparative qualification has not been established for this job.')}</p>${evidence.length ? `<ul>${evidence.map(item => `<li>${escape(typeof item === 'string' ? item : [item.summary || item.statement || item.competency, item.result ? `Result: ${item.result}` : '', item.source ? `Source: ${item.source}` : '', item.provenance ? authored(item.provenance) : ''].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : '<p>No qualification evidence is attached. Completed task counts alone do not demonstrate a specialist advantage.</p>'}</details>`;
}

function productsView() {
  const artifacts = outputArtifacts().slice().reverse();
  return `${!state.ventureId ? `<div class="page-heading"><div><p class="eyebrow">TANGIBLE OUTPUT</p><h1>Products & deliveries</h1><p>Open working previews, inspect deliverables, and see how each output was produced.</p></div></div>` : ''}${artifacts.length ? `<div class="product-grid">${newestProducts(artifacts).map(productCard).join('')}</div>` : empty('No outputs to inspect yet', 'Products and deliverables appear after a task records an artifact. Preparation and execution remain separately identified.')}`;
}

function commercialDraft(id, ventureId = state.ventureId) {
  const matches = array(state.data?.commercialDrafts).filter(item => item.id === id && (!ventureId || item.ventureId === ventureId));
  return matches.length === 1 ? matches[0] : null;
}

function commercialPurpose(item) {
  return ({ interview: 'A discovery conversation about the buyer’s current process.', delivery: 'Delivery of the exact prepared artifact and its agreed scope.' })[item.purpose] || item.purpose || 'Review the exact proposed wording before choosing a recipient or external action.';
}

function commercialPreparationView(compact = false) {
  const drafts = scoped('commercialDrafts');
  if (!drafts.length) return '';
  const items = compact ? drafts.filter(item => item.current === false || item.status === 'stale') : drafts;
  if (!items.length) return '';
  return `${sectionHeading(compact ? 'Drafts that need another review' : 'Commercial preparation', 'Prepared communication stays attached to the exact product or delivery. Nothing has been sent from this workspace.', `<span class="count">${count(items.length, 'draft')}</span>`)}<div class="commercial-grid">${items.map(item => { const stale = item.current === false || item.status === 'stale'; return `<article class="commercial-card"><div class="card-meta">${badge(stale ? 'Needs review' : item.status === 'reported' ? 'Outcome reported' : 'Prepared', stale ? 'stale' : item.status === 'reported' ? 'observed' : 'research')}${badge('Not sent', 'provenance')}${!state.ventureId ? badge(venture(item.ventureId)?.name || 'Venture', 'provenance') : ''}</div><h3>${escape(item.title || item.subject || 'Prepared communication')}</h3><p>${escape(commercialPurpose(item))}</p><div class="commercial-recipient"><span class="fact-label">Recipient</span><span>${escape(item.recipient || 'Not selected')}</span></div>${stale ? '<p class="task-reason">The supporting artifact changed. This draft is retained for comparison and needs a fresh review.</p>' : ''}<div class="actions">${button('Read exact draft', 'inspect-commercial', { commercial: item.id, venture: item.ventureId }, 'small')}${button('Record outside outcome', 'commercial-outcome', { commercial: item.id, venture: item.ventureId }, 'small')}</div></article>`; }).join('')}</div>`;
}

function activeResponseDraft() { return state.responseDraftId ? commercialDraft(state.responseDraftId, state.ventureId) : null; }

function responseContext() {
  const item = activeResponseDraft();
  if (!item) return '';
  return `<div class="response-context"><strong>About this prepared draft</strong><p>${escape(item.title || item.subject)}</p><small>Record an actual response or delivery result, including its source. This does not mark the draft as sent.</small>${button('Read draft', 'inspect-commercial', { commercial: item.id, venture: item.ventureId }, 'small quiet')}</div>`;
}

function inspectCommercial(id, ventureId) {
  const item = commercialDraft(id, ventureId); if (!item) return;
  const linked = state.data.artifacts.find(output => output.id === item.artifactId && output.ventureId === item.ventureId);
  const stale = item.current === false || item.status === 'stale';
  showDialog(item.title || 'Prepared communication', `<div class="dialog-metadata"><span>${escape(venture(item.ventureId)?.name || 'Venture')}</span><span>Prepared draft · not sent</span><span>${stale ? 'Supporting artifact changed' : 'Bound to its recorded artifact'}</span></div>${item.purpose ? `<p class="artifact-content">${escape(commercialPurpose(item))}</p>` : ''}${stale ? '<p class="provenance-note">This retained draft no longer refers to the current artifact. Review and update it before proposing any external use.</p>' : ''}<div class="draft-message"><dl><dt>To</dt><dd>${escape(item.recipient || 'Recipient not selected')}</dd><dt>Subject</dt><dd>${escape(item.subject || 'No subject recorded')}</dd></dl><div class="draft-body">${escape(item.body || 'No message body recorded.')}</div></div><div class="insight"><strong>Supporting delivery</strong><p>${escape(linked?.title || item.artifactId || 'No artifact recorded')}</p>${linked ? button('Inspect supporting artifact', 'inspect-artifact', { artifact: linked.id }, 'small') : ''}</div>${array(item.consentEvidenceIds).length ? `<div class="insight"><strong>Recorded permission evidence</strong>${sourceLinks(item.consentEvidenceIds, item.ventureId)}</div>` : '<p class="help muted">No recipient consent evidence is attached. Selecting a recipient or retaining a draft does not establish permission to send.</p>'}${communicationSetupView()}<div class="actions">${button('Record outside outcome', 'commercial-outcome', { commercial: item.id, venture: item.ventureId }, 'primary')}</div><details class="technical"><summary>Draft and artifact binding</summary><dl><dt>Draft</dt><dd>${escape(item.id)}</dd><dt>Artifact hash</dt><dd>${escape(item.artifactHash || 'Not recorded')}</dd><dt>Status</dt><dd>${escape(words(item.status))}</dd></dl></details>`);
}

function communicationSetupView() {
  const setup = state.data.communicationSetup;
  const steps = array(setup?.steps).length ? setup.steps : [
    'Choose one owner-controlled sender and controlled or explicitly consenting test recipients.',
    'Configure an owner-controlled Google OAuth client, consent flow and Gmail API access for the required send/read functions.',
    'Keep the OAuth token in the protected local configuration. The Mission 030 adapter stops when access expires; it does not implement automatic token refresh.',
    'Review the exact sender, recipients, content, limits and stopping conditions in a separately approved controlled channel envelope before a test.'
  ];
  return `<details class="communication-setup"><summary>Controlled Gmail test setup</summary><p>${escape(setup?.summary || 'Preserved Mission 030 setup requirements. This is account preparation, not evidence that a Gmail account is connected.')}</p>${setup?.status ? `<p><strong>Recorded connection state:</strong> ${escape(words(setup.status))}</p>` : ''}<ol>${steps.map(step => `<li>${escape(typeof step === 'string' ? step : step.description || step.text || step.title)}</li>`).join('')}</ol><p>Credentials belong in protected account configuration; this workspace does not collect them.</p></details>`;
}

function readablePacketText(value) {
  if (typeof value !== 'string') return '';
  const blocks = value.split(/\r?\n\s*\r?\n/).filter(Boolean);
  return blocks.map(block => { const lines = block.split(/\r?\n/); if (lines.length === 1 && /^#{1,4}\s+/.test(block)) return `<h3>${escape(block.replace(/^#{1,4}\s+/, ''))}</h3>`; if (lines.every(line => /^\s*[-*]\s+/.test(line))) return `<ul>${lines.map(line => `<li>${escape(line.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`; return `<p>${escape(block)}</p>`; }).join('');
}

function inspectOperatingPacket() {
  const packet = state.data.operatingPacket; if (!packet) return;
  const entries = values => array(values).map(item => '<li>' + escape(typeof item === 'string' ? item : item.title || item.summary) + '</li>').join('');
  const bottlenecks = array(packet.bottlenecks).map(item => typeof item === 'string' ? '<li>' + escape(item) + '</li>' : '<li><strong>' + escape(item.title || item.description || item.summary) + '</strong>' + (item.reason ? '<p>' + escape(item.reason) + '</p>' : '') + (item.next ? '<p><span class="fact-label">Next step</span>' + escape(item.next) + '</p>' : '') + '</li>').join('');
  const body = typeof packet === 'string' ? readablePacketText(packet) : readablePacketText(packet.summary || packet.markdown || '') +
    (array(packet.implemented).length ? '<h3>Working capabilities</h3><ul>' + entries(packet.implemented) + '</ul>' : '') +
    (bottlenecks ? '<h3>Current bottlenecks</h3><ul>' + bottlenecks + '</ul>' : '') +
    (packet.nextDecision ? '<h3>Next owner decision</h3><p>' + escape(typeof packet.nextDecision === 'string' ? packet.nextDecision : packet.nextDecision.summary || packet.nextDecision.title || packet.nextDecision.recommendation) + '</p>' : '') +
    (array(packet.nextActions).length ? '<h3>Next useful work</h3><ul>' + entries(packet.nextActions) + '</ul>' : '') +
    (array(packet.unsupportedClaims).length ? '<h3>Not established by these results</h3><ul>' + entries(packet.unsupportedClaims) + '</ul>' : '') +
    (packet.provenance || packet.authorship ? '<p class="provenance-note">' + escape(packet.provenance || packet.authorship) + '</p>' : '');
  showDialog(typeof packet === 'object' && packet.title ? packet.title : 'Owner operating packet', '<div class="operating-packet">' + body + '</div><div class="actions">' + button('Open decisions', 'packet-decisions', {}, 'primary') + '</div>');
}

function productCard(item) {
  const preview = localUrl(item.previewUrl), download = localUrl(item.downloadUrl);
  const sourceTask = task(item.taskId);
  const kind = item.kind || 'deliverable', isSoftware = /software|app|website|product/i.test(kind);
  const checks = array(item.checks || sourceTask?.result?.checks);
  const passed = checks.filter(check => (check?.passed ?? check?.ok ?? check?.status) === true || ['pass', 'passed'].includes(String(check?.status || '').toLowerCase())).length;
  const verification = checks.length ? `Recorded local checks: ${passed}/${checks.length} passed.` : sourceTask?.status === 'completed' ? 'Completed output has no recorded verification detail.' : '';
  const checkDetails = checks.length ? `<details class="product-check-details"><summary>View recorded check details</summary>${renderChecks(checks)}</details>` : '';
  const delivery = item.deliveryStatus || item.status;
  const execution = item.executionStatus || sourceTask?.status;
  const publicationNote = item.locallyPublished ? `Locally published${item.customerAcknowledged ? '; customer acknowledgment recorded.' : '; customer acknowledgment is not recorded.'}` : '';
  return `<article class="product-card"><div class="product-visual"><span class="product-icon" aria-hidden="true">${isSoftware ? '▱' : /report|brief|document|service/i.test(kind) ? '≡' : '◈'}</span><span class="product-kind">${escape(words(kind))}</span></div><div class="product-body"><div class="card-meta">${badge(`Version ${item.version ?? 1}`, 'provenance')}${badge(authored(item.provenance || item.authorship), 'provenance')}${delivery ? badge(delivery) : ''}${execution ? badge(execution) : ''}${sourceTask?.outputCurrent === false ? badge('Inputs changed', 'stale') : ''}</div><h3>${escape(item.title || 'Untitled output')}</h3>${!state.ventureId ? `<p>${escape(venture(item.ventureId)?.name || '')}</p>` : ''}<p>${escape(item.summary || item.description || (preview ? 'Open the local preview to try this output.' : 'Inspect the saved output and its execution evidence.'))}</p>${publicationNote ? `<p class="publication-note">${escape(publicationNote)}</p>` : ''}${verification ? `<p class="verification-note">${escape(verification)}</p>` : ''}${checkDetails}<div class="actions">${preview ? `<a class="button primary" href="${escape(preview)}" target="_blank" rel="noopener noreferrer">${isSoftware ? 'Try it locally ↗' : 'Open local delivery ↗'}</a>` : ''}${button('Inspect', 'inspect-artifact', { artifact: item.id }, 'small')}${download ? `<a class="button small" href="${escape(download)}" download>Download</a>` : ''}${item.revisable === true ? button('Request revision', 'open-revision', { artifact: item.id }, 'small') : ''}</div>${artifactOriginNote(item) ? `<p class="provenance-note">${escape(artifactOriginNote(item))}</p>` : ''}</div></article>`;
}

function artifactOriginNote(item) {
  if (item.provenanceNote) return item.provenanceNote;
  if (/development.assistant|developer/i.test(String(item.metadata?.sourceAuthorship || ''))) return /offline|mock|fixture/i.test(String(item.provenance)) ? 'The development agent authored the starting source. A fixture worker exercised real local checks and corrections. Customer acceptance is unobserved.' : 'The development agent authored the starting source. Subsequent runtime changes are recorded separately; customer acceptance requires its own evidence.';
  return '';
}

function checkLabel(value) {
  return value.label || value.name || ({ 'service.structure': 'Complete delivery', 'service.sources': 'Source support', 'service.coverage': 'Source coverage', 'service.input_binding': 'Correct client and scope', 'software.sandbox': 'Contained preview', 'software.line_totals': 'Quote totals', 'software.job_transition': 'Quote to job', 'software.persistence': 'Saved after refresh', 'software.export': 'CSV export', 'software.bridge_isolation': 'Isolated product state', 'software.network': 'Network containment', 'delivery.current': 'Current delivery verified', 'reassessment.evidence_bound': 'Evidence linked to decision' })[String(value.id || '').replaceAll('-', '_')] || words(String(value.id || 'Check').replace(/\./g, ' '));
}

function renderChecks(checks) { return `<div class="checks">${checks.map(check => { const value = typeof check === 'string' ? { label: check, status: 'recorded' } : check; const passed = value.passed ?? value.ok ?? (value.status === 'pass' || value.status === 'passed' ? true : value.status === 'fail' || value.status === 'failed' ? false : null); return `<span class="badge ${passed === true ? 'pass' : passed === false ? 'fail' : 'unknown'}" title="${escape(value.detail || value.message || value.summary || '')}">${escape(checkLabel(value))}: ${escape(passed === true ? 'passed' : passed === false ? 'failed' : value.status || 'recorded')}</span>`; }).join('')}</div>`; }

function claimCard(item) {
  return `<article class="claim">${badge(item.kind || 'unknown')}<p>${escape(item.text || item.statement || item.summary || '')}</p>${sourceLinks(item.sourceIds || item.sources, item.ventureId)}</article>`;
}
function sourceLinks(ids, ventureId = state.ventureId) { return array(ids).length ? `<div class="source-links">${array(ids).map(id => { const record = source(typeof id === 'string' ? id : id.id, ventureId); return record ? `<button type="button" data-action="inspect-source" data-source="${escape(record.id)}" data-source-venture="${escape(record.ventureId)}">${escape(excerpt(record.title || record.id, 55))} ↗</button>` : `<span class="muted">${escape(typeof id === 'string' ? id : id.id)} · source unavailable</span>`; }).join('')}</div>` : ''; }

function evidenceView() {
  const sources = scoped('sources'), claims = scoped('claims'), formId = `${state.ventureId}:evidence`;
  return `${sectionHeading('Evidence & assumptions', 'Read what a source actually says and keep untested beliefs visible.')}<div class="two-columns equal">${panel('Current understanding', claims.length ? claims.map(claimCard).join('') : empty('No claims recorded', 'Source-backed claims and explicit hypotheses will appear here.'))}${panel('Add evidence', `<form class="form-stack" data-form="evidence" data-draft="${escape(formId)}"><label for="evidence-title">Title</label><input id="evidence-title" name="title" maxlength="160" required value="${draft(formId, 'title')}" placeholder="A customer interview or a useful source"><label for="evidence-url">Source URL <span class="muted">(optional)</span></label><input id="evidence-url" name="url" type="url" value="${draft(formId, 'url')}" placeholder="https://"><label for="evidence-text">What does the evidence establish?</label><textarea id="evidence-text" name="text" required maxlength="12000" placeholder="Include the source, what was observed, and any limits.">${draft(formId, 'text')}</textarea><p class="help">This records owner-supplied evidence. It does not authorize contacting a source or establish an unverified commercial outcome.</p><button class="button primary" type="submit" ${state.busy ? 'disabled' : ''}>Save evidence</button></form>`)}</div>${sectionHeading('Retained sources', 'Source text, dates and provenance stay available for inspection.', `<span class="count">${count(sources.length, 'source')}</span>`)}${sources.length ? `<div class="source-list">${sources.map(item => `<article class="source-row"><div><h3>${escape(item.title || 'Untitled source')}</h3><p>${escape(item.url || 'Owner-supplied local record')}</p><p>${escape(authored(item.provenance))} · ${escape(date(item.observedAt || item.createdAt))}</p></div>${button('Read source', 'inspect-source', { source: item.id, 'source-venture': item.ventureId }, 'small')}</article>`).join('')}</div>` : empty('No source text retained', 'A source ID or URL alone does not establish evidence. Save or retrieve the relevant material.')}`;
}

function amount(economics, key) {
  const direct = economics[`observed${key[0].toUpperCase()}${key.slice(1)}Minor`] ?? economics[`${key}Minor`];
  if (Number.isFinite(direct)) return direct;
  return Number.isFinite(economics[key]?.minorUnits) ? economics[key].minorUnits : null;
}

function resultsView() {
  const item = venture(), economics = item.economics || {}, observations = scoped('observations').slice().reverse(), formId = `${state.ventureId}:observation`;
  const resources = state.data.resources.byVenture?.[item.id] || {};
  const cost = amount(economics, 'cost'), revenue = amount(economics, 'revenue'), reserved = economics.reservedMinor ?? resources.reservedMinor;
  const ownerSeconds = economics.ownerSeconds ?? economics.humanSeconds;
  return `<div class="metrics">${metric('Observed revenue', money(revenue, economics.currency), revenue === null ? 'No verified revenue recorded' : 'Reported with its recorded evidence')}${metric('Observed cost', money(cost, economics.currency), cost === null ? 'No attributed cost observation' : 'Attributable operating cost')}${metric('Reserved spending', money(reserved, economics.currency), 'Held exposure, separate from cost')}${metric('Owner effort', Number.isFinite(ownerSeconds) ? `${Math.round(ownerSeconds / 60)} min` : 'Unknown', 'Time must be recorded, never inferred')}</div><div class="two-columns equal">${panel('Observed outcomes & changes', observations.length ? observationList(observations) : empty('No outcomes observed yet', 'Record usage, accepted delivery, rework, rejection or another consequential result. Completed work alone is not customer validation.'))}${panel('Record an observation', `${responseContext()}<form class="form-stack" data-form="observation" data-draft="${escape(formId)}"><label for="observation-kind">What happened?</label><select id="observation-kind" name="kind">${[['owner_report', 'Owner observation'], ['customer_feedback', 'Customer feedback'], ['usage', 'Product usage'], ['delivery', 'Delivery or acceptance'], ['defect', 'Defect or correction'], ['cost', 'Cost evidence']].map(([value, label]) => `<option value="${value}" ${state.drafts[formId]?.kind === value ? 'selected' : ''}>${label}</option>`).join('')}</select><label for="observation-text">What was actually observed?</label><textarea id="observation-text" name="text" required maxlength="12000" placeholder="Describe the result, source and any uncertainty.">${draft(formId, 'text')}</textarea><p class="help">Stored as owner-reported evidence. MIDAS can use it to reassess work; it does not silently convert notes into verified revenue.</p><button class="button primary" type="submit" ${state.busy ? 'disabled' : ''}>Save observation</button></form>`)}</div>`;
}

function observationList(items) { return items.map(item => `<article class="observation"><div class="card-meta">${badge(item.kind || 'observation')}${badge(authored(item.provenance), 'provenance')}</div><p>${escape(item.summary || item.text || '')}</p>${item.changedWork || item.decisionImpact ? `<div class="insight"><strong>What changed</strong><p>${escape(item.changedWork || item.decisionImpact)}</p></div>` : ''}${sourceLinks(item.sourceIds, item.ventureId)}<small>${escape(date(item.createdAt || item.observedAt))}${typeof item.source === 'string' ? ` · ${escape(item.source)}` : ''}</small></article>`).join(''); }

function decisionsView() {
  const decisions = pendingDecisions(), resolved = scoped('decisions').filter(item => !pendingDecisions([item]).length);
  return `<div class="page-heading"><div><p class="eyebrow">OWNER DECISIONS</p><h1>Ready for your judgment</h1><p>Prepared recommendations, their consequences and the useful work they unlock.</p></div></div>${decisions.length ? `<div class="decision-list">${decisions.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(item => `<article class="decision-card"><div class="card-meta">${badge(item.status || 'pending')}${badge(venture(item.ventureId)?.name || 'Portfolio', 'provenance')}${item.expiresAt ? `<span class="muted">Expires ${escape(date(item.expiresAt))}</span>` : ''}</div><h3>${escape(item.title)}</h3><p>${escape(item.reason || item.summary || '')}</p>${item.recommendation ? `<div class="decision-recommendation"><span class="fact-label">Recommendation</span><div class="fact-value">${escape(item.recommendation)}</div></div>` : ''}${item.consequence ? `<p><strong>Consequence:</strong> ${escape(item.consequence)}</p>` : ''}${sourceLinks(item.sourceIds, item.ventureId)}${array(item.choices).length ? `<div class="actions">${item.choices.map((choice, index) => button(typeof choice === 'string' ? words(choice) : choice.label, 'decision', { decision: item.id, choice: typeof choice === 'string' ? choice : choice.id, venture: item.ventureId || '' }, index === 0 ? 'primary' : '')).join('')}</div>` : `<p class="help">${escape(item.nextAction || 'This decision needs additional preparation before an action is available.')}</p>`}</article>`).join('')}</div>` : empty('No decision is waiting on you', 'Eligible work can continue. Decisions appear here when a prepared choice requires owner judgment.')}${resolved.length ? `${sectionHeading('Recorded decisions')}<div class="panel"><ul class="compact-list">${resolved.map(item => `<li><strong>${escape(item.title)}</strong><small>${escape(words(item.status))}${item.selectedChoice || item.choice ? ` · ${escape(item.selectedChoice || item.choice)}` : ''}</small></li>`).join('')}</ul></div>` : ''}`;
}

function activityList() {
  const rows = state.data.activity.length ? state.data.activity : [...state.data.observations.map(item => ({ ...item, title: words(item.kind || 'Observation'), text: item.summary || item.text })), ...state.data.tasks.filter(item => item.status === 'completed' || item.status === 'running' || item.status === 'blocked').map(item => ({ id: item.id, ventureId: item.ventureId, title: `${stateLabels[item.status] || words(item.status)}: ${item.title}`, text: item.result?.summary || item.reason, createdAt: item.updatedAt }))];
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows.length ? `<ul class="activity-list">${rows.slice(0, 5).map(item => `<li><span class="activity-mark"></span><div><strong>${escape(item.title === item.kind ? words(item.kind) : item.title || words(item.kind))}</strong><p>${escape(excerpt(item.text || item.summary, 180))}</p><small>${escape(venture(item.ventureId)?.name || 'Portfolio')} · ${escape(date(item.createdAt))}</small></div></li>`).join('')}</ul>` : empty('The next change will appear here', 'Activity reflects saved work and observations. No simulated progress is added.');
}

function draft(key, field) { return escape(state.drafts[key]?.[field] || ''); }

function navigate(view, id = '', responseDraftId = '') {
  state.view = view; state.ventureId = id; state.responseDraftId = responseDraftId; state.workFilter = 'all'; state.laneFilter = 'all';
  const params = new URLSearchParams(); if (id) params.set('venture', id); if (view !== 'overview') params.set('view', view); if (responseDraftId) params.set('draft', responseDraftId);
  history.pushState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  render(); window.scrollTo({ top: 0, behavior: 'instant' });
}

function showDialog(title, body) { $('#dialog-title').textContent = title; $('#dialog-body').innerHTML = body; if (!$('#detail-dialog').open) $('#detail-dialog').showModal(); }
function inspectSource(id, ventureId) {
  const item = source(id, ventureId); if (!item) return;
  const url = sourceUrl(item.url);
  showDialog(item.title || 'Retained source', `<div class="dialog-metadata"><span>${escape(authored(item.provenance))}</span><span>${escape(date(item.observedAt || item.createdAt))}</span>${item.status ? `<span>${escape(words(item.status))}</span>` : ''}</div>${url ? `<p><a class="text-button" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a></p>` : ''}<div class="source-text">${escape(item.text || item.content || item.sourceAssertion || 'No source text was retained.')}</div><details class="technical"><summary>Source identity</summary><dl><dt>Record</dt><dd>${escape(item.id)}</dd><dt>Content hash</dt><dd>${escape(item.sha256 || item.contentHash || 'Not recorded')}</dd></dl></details>`);
}

function inspectArtifact(id) {
  const item = artifact(id); if (!item) return;
  const sourceTask = task(item.taskId), checks = array(item.checks || sourceTask?.result?.checks);
  const download = localUrl(item.downloadUrl), preview = localUrl(item.previewUrl);
  let content = typeof item.content === 'string' ? item.content : item.content?.text || item.content?.summary || item.content?.memo || item.summary || item.description || '';
  if (!content) content = 'The artifact is retained as a file. Use its preview or download to inspect the full output.';
  showDialog(item.title || 'Inspect output', `<div class="dialog-metadata"><span>${escape(authored(item.provenance))}</span><span>Version ${escape(item.version || 1)}</span><span>${escape(words(item.kind || 'deliverable'))}</span></div><p class="artifact-content">${escape(content)}</p>${checks.length ? `<h3>Recorded checks</h3>${renderChecks(checks)}` : ''}<div class="actions">${preview ? `<a class="button primary" href="${escape(preview)}" target="_blank" rel="noopener noreferrer">Open preview ↗</a>` : ''}${download ? `<a class="button" href="${escape(download)}" download>Download output</a>` : ''}</div>${artifactOriginNote(item) ? `<p class="provenance-note">${escape(artifactOriginNote(item))}</p>` : ''}<details class="technical"><summary>Version and execution evidence</summary><dl><dt>Artifact</dt><dd>${escape(item.id)}</dd><dt>Version</dt><dd>${escape(item.version ?? 1)}</dd><dt>Source task</dt><dd>${escape(sourceTask?.title || item.taskId || 'Development-agent preparation')}</dd><dt>Content hash</dt><dd>${escape(item.sha256 || item.contentHash || 'Not recorded')}</dd></dl></details>`);
}

function openRevision(id) {
  const item = artifact(id); if (!item || item.revisable !== true) return;
  showDialog(`Request a revision · ${item.title}`, `<form class="form-stack" data-form="revision" data-artifact="${escape(item.id)}" data-venture="${escape(item.ventureId)}" data-hash="${escape(item.sha256 || item.contentHash || '')}"><p class="muted">Describe the correction. MIDAS will preserve this version and create scoped revision work for review.</p><label for="revision-instruction">What should change, and why?</label><textarea id="revision-instruction" name="instruction" required maxlength="6000" placeholder="Name the defect, the supporting evidence, and what a corrected output should do."></textarea><div class="actions"><button type="button" class="button" data-close-dialog>Cancel</button><button type="submit" class="button primary">Create revision task</button></div></form>`);
}

function setNotice(message, error = false) { state.notice = { message, error }; renderNotice(); }
function renderNotice() { $('#notice').innerHTML = state.notice ? `<div class="notice ${state.notice.error ? 'error' : ''}"><span>${escape(state.notice.message)}</span><button type="button" data-dismiss-notice aria-label="Dismiss notification">×</button></div>` : ''; }

function readableError(result) {
  const code = result?.error?.code || result?.error || result?.code;
  const messages = { CSRF_INVALID: 'The local session changed. Refresh the workspace and try again.', OWNER_SESSION_REQUIRED: 'The local session changed. Refresh the workspace to reconnect.', TASK_NOT_RUNNABLE: 'This task cannot run in its current state. Its saved reason explains the next step.', DEPENDENCY_NOT_COMPLETED: 'This task is waiting for a dependency to complete.', CAPACITY_EXHAUSTED: 'All execution slots are occupied. The task remains saved.', MODEL_DISABLED_UNTIL_GRANT: 'Model execution needs a valid grant. Other eligible local work can continue.', STALE_ARTIFACT: 'This output changed. Inspect the latest version before requesting its revision.', EXPECTED_HASH_MISMATCH: 'This output changed. Inspect the latest version before requesting its revision.', REVISION_CONFLICT: 'The saved state changed. Refresh and review the current version.' };
  return messages[code] || (typeof result?.message === 'string' ? result.message : typeof result?.error?.message === 'string' ? result.error.message : typeof code === 'string' ? words(code) : 'The action could not be completed. The previous saved state is retained.');
}

async function refresh(quiet = false) {
  if (state.polling) return;
  state.polling = true; clearTimeout(state.timer);
  try {
    if (!state.csrf) { const session = await fetch('/api/session', { cache: 'no-store' }); const value = await session.json(); if (!session.ok) throw new Error(readableError(value)); state.csrf = value.csrf || value.csrfToken || ''; }
    const response = await fetch('/api/portfolio', { cache: 'no-store' }); const value = await response.json(); if (!response.ok) throw new Error(readableError(value));
    state.data = normalize(value); state.lastRead = new Date().toISOString();
    $('#connection-label').textContent = 'Local workspace connected'; $('#connection-dot').classList.remove('offline');
    render(); if (!quiet) setNotice('Portfolio refreshed from saved state.');
  } catch (error) {
    $('#connection-label').textContent = 'Workspace unavailable'; $('#connection-dot').classList.add('offline');
    if (!state.data) $('#workspace').innerHTML = `${empty('The workspace could not be loaded', error.message)}<div class="actions">${button('Try again', 'refresh', {}, 'primary')}</div>`;
    else setNotice(`Could not refresh. The last saved view remains visible. ${error.message}`, true);
    if (/session/i.test(error.message)) state.csrf = '';
  } finally { state.polling = false; $('#refresh-button').disabled = state.busy; scheduleRefresh(); }
}

function scheduleRefresh() {
  clearTimeout(state.timer);
  if (array(state.data?.tasks).some(item => ['running', 'queued'].includes(item.status))) state.timer = setTimeout(() => { if (!state.busy && !$('#detail-dialog').open && !document.activeElement?.closest('form')) refresh(true); else scheduleRefresh(); }, 4000);
}

async function mutate(action, payload, message) {
  if (state.busy) return false;
  state.busy = true; render();
  try {
    const response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf }, body: JSON.stringify({ action, ...payload }) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(readableError(result));
    if (result.snapshot || result.ventures) state.data = normalize(result);
    await refresh(true); setNotice(message || 'Change saved.'); return true;
  } catch (error) { setNotice(error.message, true); return false; }
  finally { state.busy = false; render(); scheduleRefresh(); }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.hasAttribute('data-navigate')) { navigate(target.dataset.navigate, target.dataset.venture || ''); return; }
  if (target.hasAttribute('data-close-dialog')) { $('#detail-dialog').close(); return; }
  if (target.hasAttribute('data-dismiss-notice')) { state.notice = null; renderNotice(); return; }
  const action = target.dataset.action; if (!action) return;
  if (action === 'refresh') { state.csrf = ''; await refresh(); return; }
  if (action === 'operating-packet') return inspectOperatingPacket();
  if (action === 'packet-decisions') { $('#detail-dialog').close(); navigate('decisions'); return; }
  if (action === 'inspect-commercial') return inspectCommercial(target.dataset.commercial, target.dataset.venture);
  if (action === 'commercial-outcome') {
    const item = commercialDraft(target.dataset.commercial, target.dataset.venture); if (!item) return;
    const key = `${item.ventureId}:observation`; state.drafts[key] = { kind: 'customer_feedback', ...state.drafts[key] };
    if ($('#detail-dialog').open) $('#detail-dialog').close(); navigate('results', item.ventureId, item.id); return;
  }
  if (action === 'inspect-source') return inspectSource(target.dataset.source, target.dataset.sourceVenture);
  if (action === 'inspect-artifact') return inspectArtifact(target.dataset.artifact);
  if (action === 'open-revision') return openRevision(target.dataset.artifact);
  if (['run', 'pause', 'resume', 'cancel'].includes(action)) { const selected = task(target.dataset.task); if (!selected) return; await mutate(action, { ventureId: selected.ventureId, taskId: selected.id }, `${selected.title}: ${action === 'run' ? 'execution requested' : action === 'resume' ? 'resumed' : action === 'pause' ? 'pause requested' : 'cancellation requested'}.`); return; }
  if (action.startsWith('venture-')) { const control = action.slice(8); await mutate(control, { ventureId: target.dataset.venture }, `Venture ${control === 'pause' ? 'pause requested' : control === 'resume' ? 'resumed' : 'cancellation requested'}.`); return; }
  if (action === 'decision') await mutate('decision', { ventureId: target.dataset.venture || undefined, decisionId: target.dataset.decision, choice: target.dataset.choice }, 'Decision recorded. The current plan reflects the saved choice.');
});

document.addEventListener('input', event => { const form = event.target.closest('form[data-draft]'); if (form) state.drafts[form.dataset.draft] = Object.fromEntries(new FormData(form)); });
document.addEventListener('change', event => {
  if (event.target.id === 'work-filter') { state.workFilter = event.target.value; render(); }
  if (event.target.id === 'lane-filter') { state.laneFilter = event.target.value; render(); }
  const form = event.target.closest('form[data-draft]'); if (form) state.drafts[form.dataset.draft] = Object.fromEntries(new FormData(form));
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-form]'); if (!form) return; event.preventDefault(); if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form)), kind = form.dataset.form;
  if (kind === 'revision') {
    const ok = await mutate('request_revision', { ventureId: form.dataset.venture, artifactId: form.dataset.artifact, expectedHash: form.dataset.hash, instruction: values.instruction }, 'Revision task created. The existing output remains available.'); if (ok) $('#detail-dialog').close(); return;
  }
  const draftKey = form.dataset.draft;
  const payload = kind === 'evidence' ? { ventureId: state.ventureId, title: values.title, text: values.text, ...(values.url ? { url: values.url } : {}) } : { ventureId: state.ventureId, kind: values.kind, text: values.text, ...(activeResponseDraft() ? { commercialDraftId: activeResponseDraft().id, artifactHash: activeResponseDraft().artifactHash } : {}) };
  if (await mutate(kind, payload, kind === 'evidence' ? 'Evidence saved with owner-supplied provenance.' : 'Observation saved. Related work can now be reassessed.')) { delete state.drafts[draftKey]; render(); }
});

$('#refresh-button').addEventListener('click', () => { state.csrf = ''; refresh(); });
window.addEventListener('popstate', () => { const params = new URLSearchParams(location.search); state.ventureId = params.get('venture') || ''; state.view = params.get('view') || 'overview'; state.responseDraftId = params.get('draft') || ''; render(); });
refresh(true);
