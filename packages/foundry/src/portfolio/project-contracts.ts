import { hash, rawHash, requireThat } from '../contracts.ts';

/** A deliberately small, declarative application surface.  Worker-authored
 * JavaScript may run in the browser, but worker-authored server JavaScript is
 * never executed by this profile: Node 24.19 on this host has no network
 * permission scope, so it cannot safely contain an arbitrary server. */
export type ProjectField = { type: 'string' | 'integer' | 'boolean'; required?: boolean; maxLength?: number; min?: number; max?: number; values?: string[] };
export type ProjectEntity = { id: string; title: string; fields: Record<string, ProjectField> };
export type ProjectAction = { id: string; entity: string; from?: string[]; set: Record<string, string | number | boolean> };
export type ProjectManifest = { version: 1; title: string; description: string; entities: ProjectEntity[]; actions?: ProjectAction[] };
export type ProjectFile = { path: string; sha256: string; bytes: number };
export type ProjectRevision = { manifestHash: string; sourceHash: string; files: ProjectFile[]; checkedManifest: string | null; checkResult: ProjectCheckResult | null };
export type ProjectCheckResult = { manifestHash: string; passed: boolean; checks: Array<{ id: string; passed: boolean; summary: string; evidence?: unknown }>; at: string };

export const projectSourceFiles = ['project.json', 'public/index.html', 'public/app.js', 'public/style.css'] as const;
/** Controller-owned starting point only. It contains no customer records,
 * business recommendations, or expected worker answer. */
function legacyBlankFunctionalProjectFiles(): Array<{ path: string; content: string }> { return [
  { path: 'project.json', content: JSON.stringify({ version: 1, title: 'Local workboard', description: 'A local, owner-reviewed application workspace.', entities: [{ id: 'work-item', title: 'Work item', fields: { title: { type: 'string', required: true, maxLength: 200 }, status: { type: 'string', required: true, values: ['draft', 'ready'] }, notes: { type: 'string', maxLength: 4000 } } }], actions: [{ id: 'mark-ready', entity: 'work-item', from: ['draft'], set: { status: 'ready' } }] }, null, 2) },
  { path: 'public/index.html', content: '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local workboard</title><link rel="stylesheet" href="/style.css"><main><h1>Local workboard</h1><p id="notice" role="status">Loading local workspace…</p><form data-project-form><label>Title<input data-project-field="title" maxlength="200"></label><label>Status<select data-project-field="status"><option value="draft">Draft</option><option value="ready">Ready</option></select></label><label>Notes<textarea data-project-field="notes" maxlength="4000"></textarea></label><button data-project-save type="submit">Save work item</button><p data-project-error role="alert"></p></form><section aria-label="Saved work"><div id="records"></div></section><script src="/app.js"></script></main></html>' },
  { path: 'public/app.js', content: String.raw`(()=>{const entity='work-item',fields=['title','status','notes'],$=selector=>document.querySelector(selector);let version=0,editing=null;const error=$('[data-project-error]'),notice=$('#notice'),records=$('#records');const control=id=>$('[data-project-field="'+id+'"]');const value=id=>{const node=control(id);return node.type==='checkbox'?node.checked:node.value};const fill=row=>{for(const id of fields){const node=control(id);node.type==='checkbox'?node.checked=Boolean(row[id]):node.value=row[id]??''}};const key=()=>('ui-'+Date.now()+'-'+Math.random().toString(16).slice(2));async function request(path,options={}){const response=await fetch(path,options);const body=await response.json();if(!response.ok)throw Error(body.error||'Local request failed');return body}function render(rows){records.replaceChildren();if(!rows.length){records.textContent='No local records yet.';return}for(const row of rows){const article=document.createElement('article');article.setAttribute('data-project-record','');const heading=document.createElement('h2');heading.textContent=String(row.title??row.id);const status=document.createElement('p');status.textContent=String(row.status??'');const open=document.createElement('button');open.type='button';open.textContent='Edit';open.setAttribute('data-project-open',row.id);open.onclick=()=>{editing=row;fill(row);notice.textContent='Editing saved record.'};const action=document.createElement('button');action.type='button';action.textContent='Mark ready';action.setAttribute('data-project-action','mark-ready');action.setAttribute('data-project-id',row.id);action.onclick=async()=>{try{const body=await request('/api/entities/'+entity+'/'+row.id+'/actions/mark-ready',{method:'POST',headers:{'idempotency-key':key()}});version=body.version;notice.textContent='Saved local action.';await load()}catch(cause){error.textContent=cause.message}};article.append(heading,status,open,action);records.append(article)}}async function load(){const body=await request('/api/entities/'+entity);version=body.version;render(body.records)}$('[data-project-form]').onsubmit=async event=>{event.preventDefault();error.textContent='';const record=Object.fromEntries(fields.map(id=>[id,value(id)]));try{const body=editing?await request('/api/entities/'+entity+'/'+editing.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({expectedVersion:version,record})}):await request('/api/entities/'+entity,{method:'POST',headers:{'content-type':'application/json','idempotency-key':key()},body:JSON.stringify({record}));version=body.version;editing=null;$('[data-project-form]').reset();notice.textContent='Saved local record.';await load()}catch(cause){error.textContent=cause.message}};load().then(()=>notice.textContent='Local workboard ready.').catch(cause=>{error.textContent=cause.message})})();` },
  { path: 'public/style.css', content: 'body{margin:0;background:#f5f7f5;color:#17352b;font:16px system-ui,sans-serif}main{max-width:760px;margin:48px auto;padding:24px;background:white;border:1px solid #d8e0d9;border-radius:12px}h1{margin-top:0}label{display:block;margin:12px 0}input,select,textarea,button{font:inherit;min-height:34px;padding:8px;width:100%}button{width:auto;background:#174e43;color:white;border:0;border-radius:5px;cursor:pointer}textarea{min-height:80px}article{border-top:1px solid #d8e0d9;padding:12px 0}[data-project-error]{min-height:1.3em;color:#9b2020}@media(max-width:600px){main{margin:0;border:0;border-radius:0;min-height:100vh;padding:20px}}' }
]; }
/** A small valid seed, intended as scaffolding rather than a business answer.
 * It demonstrates the exact fixed frontend protocol the trusted checker uses. */
export function blankFunctionalProjectFiles(): Array<{ path: string; content: string }> {
  return [
    { path: 'project.json', content: JSON.stringify({ version: 1, title: 'Local workboard', description: 'A local, owner-reviewed application workspace.', entities: [{ id: 'work-item', title: 'Work item', fields: { title: { type: 'string', required: true, maxLength: 200 }, status: { type: 'string', required: true, values: ['draft', 'ready'] }, notes: { type: 'string', maxLength: 4000 } } }], actions: [{ id: 'mark-ready', entity: 'work-item', from: ['draft'], set: { status: 'ready' } }] }, null, 2) },
    { path: 'public/index.html', content: '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local workboard</title><link rel="stylesheet" href="/style.css"><main><h1>Local workboard</h1><p id="notice" role="status">Loading local workspace…</p><form data-project-form><label>Title<input data-project-field="title" maxlength="200"></label><label>Status<select data-project-field="status"><option value="draft">Draft</option><option value="ready">Ready</option></select></label><label>Notes<textarea data-project-field="notes" maxlength="4000"></textarea></label><button data-project-save type="submit">Save work item</button><p data-project-error role="alert"></p></form><section aria-label="Saved work"><div id="records"></div></section><script src="/app.js"></script></main></html>' },
    { path: 'public/app.js', content: String.raw`(() => {
  const entity = 'work-item';
  const fields = ['title', 'status', 'notes'];
  const select = (selector) => document.querySelector(selector);
  const field = (id) => select('[data-project-field="' + id + '"]');
  const error = select('[data-project-error]');
  const notice = select('#notice');
  const records = select('#records');
  let version = 0;
  let editing = null;
  const key = () => 'ui-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  async function request(path, options) {
    const response = await fetch(path, options || {});
    const body = await response.json();
    if (!response.ok) throw Error(body.error || 'Local request failed');
    return body;
  }
  function recordValues() {
    const record = {};
    for (const id of fields) {
      const control = field(id);
      record[id] = control.type === 'checkbox' ? control.checked : control.value;
    }
    return record;
  }
  function fill(record) {
    for (const id of fields) {
      const control = field(id);
      control.value = record[id] || '';
    }
  }
  function render(rows) {
    records.replaceChildren();
    if (!rows.length) { records.textContent = 'No local records yet.'; return; }
    for (const row of rows) {
      const item = document.createElement('article');
      item.setAttribute('data-project-record', '');
      const heading = document.createElement('h2');
      heading.textContent = String(row.title || row.id);
      const status = document.createElement('p');
      status.textContent = String(row.status || '');
      const open = document.createElement('button');
      open.type = 'button'; open.textContent = 'Edit'; open.setAttribute('data-project-open', row.id);
      open.onclick = () => { editing = row; fill(row); notice.textContent = 'Editing saved record.'; };
      const action = document.createElement('button');
      action.type = 'button'; action.textContent = 'Mark ready'; action.setAttribute('data-project-action', 'mark-ready');
      action.onclick = async () => {
        try {
          const body = await request('/api/entities/' + entity + '/' + row.id + '/actions/mark-ready', { method: 'POST', headers: { 'idempotency-key': key() } });
          version = body.version; notice.textContent = 'Saved local action.'; await load();
        } catch (cause) { error.textContent = cause.message; }
      };
      item.append(heading, status, open, action); records.append(item);
    }
  }
  async function load() {
    const body = await request('/api/entities/' + entity);
    version = body.version; render(body.records);
  }
  select('[data-project-form]').onsubmit = async (event) => {
    event.preventDefault(); error.textContent = '';
    try {
      const record = recordValues();
      let body;
      if (editing) {
        body = await request('/api/entities/' + entity + '/' + editing.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, record }) });
      } else {
        body = await request('/api/entities/' + entity, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key() }, body: JSON.stringify({ record }) });
      }
      version = body.version; editing = null; select('[data-project-form]').reset(); notice.textContent = 'Saved local record.'; await load();
    } catch (cause) { error.textContent = cause.message; }
  };
  load().then(() => { notice.textContent = 'Local workboard ready.'; }).catch((cause) => { error.textContent = cause.message; });
})();` },
    { path: 'public/style.css', content: 'body{margin:0;background:#f5f7f5;color:#17352b;font:16px system-ui,sans-serif}main{max-width:760px;margin:48px auto;padding:24px;background:white;border:1px solid #d8e0d9;border-radius:12px}h1{margin-top:0}label{display:block;margin:12px 0}input,select,textarea,button{font:inherit;min-height:34px;padding:8px;width:100%}button{width:auto;background:#174e43;color:white;border:0;border-radius:5px;cursor:pointer}textarea{min-height:80px}article{border-top:1px solid #d8e0d9;padding:12px 0}[data-project-error]{min-height:1.3em;color:#9b2020}@media(max-width:600px){main{margin:0;border:0;border-radius:0;min-height:100vh;padding:20px}}' },
  ];
}
/** Preferred public name for controller/PilotExecution seeding. */
export const blankProjectFiles = blankFunctionalProjectFiles;
const identifier = (value: unknown, code: string) => requireThat(typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value), code);
export function projectPath(path: unknown): asserts path is string {
  requireThat(typeof path === 'string' && path.length > 0 && path.length <= 180 && /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/.test(path) && !path.split('/').some(part => part === '.' || part === '..' || part.startsWith('.')), 'PROJECT_PATH_DENIED');
}
function plain(value: unknown, code: string) { requireThat(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, code); }
export function parseProjectManifest(content: string): ProjectManifest {
  requireThat(typeof content === 'string' && Buffer.byteLength(content) <= 96_000, 'PROJECT_MANIFEST_BYTES');
  let value: any; try { value = JSON.parse(content); } catch { throw Error('PROJECT_MANIFEST_JSON'); }
  plain(value, 'PROJECT_MANIFEST_OBJECT');
  requireThat(Object.keys(value).every(key => ['version', 'title', 'description', 'entities', 'actions'].includes(key)), 'PROJECT_MANIFEST_UNKNOWN_FIELD');
  requireThat(value.version === 1 && typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 160 && typeof value.description === 'string' && value.description.length <= 2000, 'PROJECT_MANIFEST_METADATA');
  requireThat(Array.isArray(value.entities) && value.entities.length >= 1 && value.entities.length <= 12, 'PROJECT_ENTITIES_REQUIRED');
  const entities: ProjectEntity[] = value.entities.map((entity: any) => {
    plain(entity, 'PROJECT_ENTITY_OBJECT'); requireThat(Object.keys(entity).every(key => ['id', 'title', 'fields'].includes(key)), 'PROJECT_ENTITY_UNKNOWN_FIELD'); identifier(entity.id, 'PROJECT_ENTITY_ID');
    requireThat(typeof entity.title === 'string' && entity.title.trim().length > 0 && entity.title.length <= 120, 'PROJECT_ENTITY_TITLE'); plain(entity.fields, 'PROJECT_FIELDS_OBJECT');
    const names = Object.keys(entity.fields); requireThat(names.length >= 1 && names.length <= 24, 'PROJECT_FIELDS_REQUIRED');
    const fields: Record<string, ProjectField> = {};
    for (const name of names) { identifier(name, 'PROJECT_FIELD_ID'); requireThat(!['id', 'createdAt', 'updatedAt'].includes(name), 'PROJECT_FIELD_RESERVED'); const field = entity.fields[name]; plain(field, 'PROJECT_FIELD_OBJECT'); requireThat(Object.keys(field).every(key => ['type', 'required', 'maxLength', 'min', 'max', 'values'].includes(key)), 'PROJECT_FIELD_UNKNOWN_FIELD'); requireThat(['string', 'integer', 'boolean'].includes(field.type), 'PROJECT_FIELD_TYPE');
      requireThat(field.required === undefined || typeof field.required === 'boolean', 'PROJECT_FIELD_REQUIRED');
      if (field.type === 'string') { requireThat(field.maxLength === undefined || Number.isSafeInteger(field.maxLength) && field.maxLength >= 1 && field.maxLength <= 10_000, 'PROJECT_FIELD_LENGTH'); requireThat(field.values === undefined || Array.isArray(field.values) && field.values.length >= 1 && field.values.length <= 50 && field.values.every((x: any) => typeof x === 'string' && x.length <= 200) && new Set(field.values).size === field.values.length, 'PROJECT_FIELD_VALUES'); }
      else requireThat(field.maxLength === undefined && field.values === undefined, 'PROJECT_FIELD_CONSTRAINT');
      if (field.type === 'integer') requireThat((field.min === undefined || Number.isSafeInteger(field.min)) && (field.max === undefined || Number.isSafeInteger(field.max)) && (field.min === undefined || field.max === undefined || field.min <= field.max), 'PROJECT_FIELD_RANGE');
      else requireThat(field.min === undefined && field.max === undefined, 'PROJECT_FIELD_CONSTRAINT'); fields[name] = { ...field };
    } requireThat(Object.values(fields).some(field=>field.required===true&&['string','integer'].includes(field.type)),'PROJECT_ENTITY_TESTABLE_FIELD_REQUIRED');return { id: entity.id, title: entity.title, fields };
  });
  requireThat(new Set(entities.map(entity => entity.id)).size === entities.length, 'PROJECT_ENTITY_DUPLICATE');
  const actions: ProjectAction[] = (value.actions ?? []).map((action: any) => { plain(action, 'PROJECT_ACTION_OBJECT'); requireThat(Object.keys(action).every(key => ['id', 'entity', 'from', 'set'].includes(key)), 'PROJECT_ACTION_UNKNOWN_FIELD'); identifier(action.id, 'PROJECT_ACTION_ID'); identifier(action.entity, 'PROJECT_ACTION_ENTITY'); requireThat(entities.some(entity => entity.id === action.entity), 'PROJECT_ACTION_ENTITY'); requireThat(action.from === undefined || Array.isArray(action.from) && action.from.length > 0 && action.from.length <= 50 && action.from.every((x: any) => typeof x === 'string' && x.length <= 200), 'PROJECT_ACTION_FROM'); plain(action.set, 'PROJECT_ACTION_SET'); const entity = entities.find(x => x.id === action.entity)!; for (const [field, next] of Object.entries(action.set)) { requireThat(Object.hasOwn(entity.fields, field), 'PROJECT_ACTION_FIELD'); const type = entity.fields[field].type; requireThat((type === 'string' && typeof next === 'string') || (type === 'integer' && Number.isSafeInteger(next)) || (type === 'boolean' && typeof next === 'boolean'), 'PROJECT_ACTION_VALUE'); } if (action.from) requireThat(entity.fields.status?.type === 'string' && Object.hasOwn(action.set, 'status'), 'PROJECT_ACTION_STATUS_TRANSITION'); return { ...action }; });
  requireThat(actions.length <= 32 && new Set(actions.map(action => action.id)).size === actions.length, 'PROJECT_ACTION_DUPLICATE');
  return { version: 1, title: value.title, description: value.description, entities, ...(actions.length ? { actions } : {}) };
}
export function validateProjectSource(files: Array<{ path: string; content: string }>) {
  requireThat(Array.isArray(files) && files.length >= projectSourceFiles.length && files.length <= 64, 'PROJECT_FILES_INVALID'); const seen = new Set<string>(); let bytes = 0;
  for (const file of files) { projectPath(file.path); requireThat(!/\.(?:mjs|cjs|ts|node)$/i.test(file.path), 'PROJECT_SERVER_SOURCE_DENIED'); requireThat(!seen.has(file.path) && typeof file.content === 'string' && Buffer.byteLength(file.content) <= 262_144, 'PROJECT_FILE_INVALID'); seen.add(file.path); bytes += Buffer.byteLength(file.content); }
  requireThat(bytes <= 1_500_000 && projectSourceFiles.every(path => seen.has(path)), 'PROJECT_FILESET_REQUIRED');
  parseProjectManifest(files.find(file => file.path === 'project.json')!.content);
}
export function revisionForProject(files: Array<{ path: string; content: string }>, checkedManifest: string | null = null, checkResult: ProjectCheckResult | null = null): ProjectRevision {
  validateProjectSource(files); const entries = files.map(file => ({ path: file.path, content: file.content })).sort((a, b) => a.path.localeCompare(b.path)); const sourceHash = hash(entries.map(file => ({ path: file.path, sha256: rawHash(file.content), bytes: Buffer.byteLength(file.content) }))); const manifestHash = hash({ profile: 'project-workspace-v1', sourceHash });
  return { manifestHash, sourceHash, files: entries.map(file => ({ path: file.path, sha256: rawHash(file.content), bytes: Buffer.byteLength(file.content) })), checkedManifest, checkResult };
}
