import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { hash } from '../src/contracts.ts';
import { PilotKnowledge, inspectCsv } from '../src/pilot/knowledge.ts';
import { fixtureEvidencePort } from '../src/workbench/evidence.ts';

const withStore = async (fn: (store: StateStore, root: string) => unknown) => { const root = mkdtempSync(join(tmpdir(), 'pilot-knowledge-')), store = new StateStore(join(root, 'state.sqlite')); try { await fn(store, root); } finally { try { store.close(); } catch {} rmSync(root, { recursive: true, force: true }); } };

test('fresh owner onboarding stays incomplete; fixture execution and credentials are unavailable', async () => withStore(async store => {
    const k = new PilotKnowledge(store), c = k.createCompany({ name: 'Owner supplied company', goal: 'Find useful work', website: 'https://example.com', notes: 'Policy is not yet supplied.' });
    assert.equal(c.mode, 'owner'); assert.equal(k.snapshot(c.id).understanding.status, 'needs_evidence');
    const result = await k.diagnose(c.id); assert.equal(result.status, 'needs_model_authorization'); assert.deepEqual(result.claims, []); assert.deepEqual(result.hypotheses, []); assert.match(result.provenance, /no model diagnosis/); assert.equal(result.prepared.providerCalls, 0);
    assert.match(JSON.stringify(result.prepared.request.context), /owner supplied|Owner supplied/); assert.equal(result.prepared.request.role.tools.includes('owner.evidence_request'), true);
    await assert.rejects(k.diagnose(c.id, { port: { kind: 'live', run() { throw Error('must not run'); } } }), /PILOT_LIVE_AUTHORIZATION_REQUIRED/);
    await assert.rejects(k.diagnose(c.id, { port: fixtureEvidencePort({} as any) }), /PILOT_FIXTURE_BUSINESS_REQUIRED/);
    assert.throws(() => k.createCompany({ name: 'Unsafe URL', goal: 'Test', website: 'https://user:password@example.com' }), /PILOT_WEBSITE_INVALID/);
}));

test('explicit synthetic evidence traverses ModelPort validation, is durable and never becomes measured competence', async () => withStore(async (store, root) => {
    let k = new PilotKnowledge(store); const c = k.createDemo(); const result = await k.diagnose(c.id); assert.equal(result.status, 'proposal_ready'); assert.equal(result.hypotheses.length, 2); assert.equal(result.hypotheses[0].workflow, 'response-packet'); assert.match(result.provenance, /offline fixture/);
    const sources = k.sources(c.id); for (const claim of result.claims) for (const ref of claim.references) assert.equal(sources.find(s => s.id === ref.sourceId)!.text.includes(ref.quote), true);
    const requestCount = Number(store.db.prepare("SELECT COUNT(*) AS n FROM records WHERE body LIKE '%business-understanding-request%'").get()!.n);
    await k.diagnose(c.id); assert.equal(Number(store.db.prepare("SELECT COUNT(*) AS n FROM records WHERE body LIKE '%business-understanding-request%'").get()!.n), requestCount, 'reuses the exact saved fixture attempt');
    const snapshotHash = hash(k.snapshot(c.id)); store.close(); const reopened = new StateStore(join(root, 'state.sqlite')); try { k = new PilotKnowledge(reopened); assert.equal(hash(k.snapshot(c.id)), snapshotHash); assert.equal(k.listCompanies().length, 1); } finally { reopened.close(); }
}));

test('source parser enforces rights, UTF-8 bytes, CSV structure and JSON depth without executing content', async () => withStore(store => {
    const k = new PilotKnowledge(store), c = k.createCompany({ name: 'Upload test', goal: 'Inspect evidence' }); const base = { title: 'Export', kind: 'csv' as const, rights: 'Owner permitted', observedAt: '2026-09-13T10:00:00.000Z' };
    const valid = k.addSource(c.id, { ...base, text: 'item,note\nchair,"a,b"\ntable,"line one\nline two"\n' }); assert.equal(valid.parsed.rows, 2); assert.equal(valid.parsed.columns, 2);
    assert.throws(() => inspectCsv('a,b\n1'), /PILOT_CSV_COLUMN_MISMATCH/); assert.throws(() => inspectCsv('a,b\n"x,y'), /PILOT_CSV_UNCLOSED_QUOTE/); assert.throws(() => inspectCsv('a,b\n"x"oops,y'), /PILOT_CSV_AFTER_QUOTE/);
    assert.throws(() => k.addSource(c.id, { ...base, rights: '', text: 'a,b\n1,2' }), /PILOT_TEXT_REQUIRED/);
    assert.throws(() => k.addSource(c.id, { ...base, kind: 'text', text: '💡'.repeat(51000) }), /PILOT_SOURCE_BYTE_LIMIT/);
    assert.throws(() => k.addSource(c.id, { ...base, kind: 'json', text: '{bad' }), /PILOT_JSON_INVALID/);
    const objectText = '{"policy":"Owner approval required","prices":{"currency":"USD","known":false}}';
    const object = k.addSource(c.id, { ...base, kind: 'json', text: objectText }); assert.deepEqual(object.parsed, { format: 'json' }); assert.equal(k.sources(c.id).find(s => s.id === object.id)!.text, objectText, 'valid JSON objects persist without manufacturing array rows');
    const array = k.addSource(c.id, { ...base, kind: 'json', text: '[{"item":"chair"},{"item":"table"}]' }); assert.equal(array.parsed.rows, 2);
    assert.throws(() => k.addSource(c.id, { ...base, kind: 'json', text: '['.repeat(22) + '1' + ']'.repeat(22) }), /PILOT_JSON_DEPTH/);
    assert.equal(k.addSource(c.id, { ...base, kind: 'csv', text: 'label,value\nformula,"=IMPORTXML(""unsafe"")"' }).text.includes('IMPORTXML'), true, 'stored as inert source text, never executed');
}));

test('source exclusions, stale metadata, oversized bundles and altered fixture references fail visibly', async () => withStore(async store => {
    const k = new PilotKnowledge(store), c = k.createDemo();
    k.addSource(c.id, { title: 'Excluded private note', text: 'This must not reach a worker.', kind: 'text', rights: 'Private; excluded from workers', permission: 'excluded', observedAt: '2026-09-13T00:00:00.000Z' });
    k.addSource(c.id, { title: 'Superseded', text: 'Historical note only.', kind: 'text', rights: 'Owner', observedAt: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-02T00:00:00.000Z' });
    const prepared = k.prepareDiagnosis(c.id); assert.equal(JSON.stringify(prepared.request.context).includes('This must not reach a worker.'), false); assert.equal((prepared.request.context as any).sourceAudit.staleSourceIds.length, 1);
    const first = await k.diagnose(c.id); const output: any = structuredClone(first); delete output.status; const modelOutput = store.db.prepare("SELECT body FROM entities WHERE kind='understanding-proposal'").get()!; const malformed = JSON.parse(String(modelOutput.body)).output; malformed.claims[0].references[0].quote = 'fabricated evidence';
    await assert.rejects(k.diagnose(c.id, { port: fixtureEvidencePort(malformed), attemptId: 'bad-reference' }), /UNDERSTANDING_SOURCE_QUOTE/);
    const owner = k.createCompany({ name: 'Large export', goal: 'Find useful work' }); const text = 'a'.repeat(25000); k.addSource(owner.id, { title: 'Full preserved record', text, kind: 'text', rights: 'Owner', observedAt: '2026-09-13T00:00:00.000Z' }); const result = await k.diagnose(owner.id); assert.equal(result.status, 'needs_evidence_selection'); assert.equal(k.sources(owner.id).at(-1)!.text, text, 'full source is not silently truncated');
}));

test('corrections and outcomes preserve evidence, isolate businesses and revise next actions without revenue claims', async () => withStore(async store => {
    const k = new PilotKnowledge(store), a = k.createDemo(), b = k.createCompany({ name: 'Other', goal: 'Separate work' }); await k.diagnose(a.id); const prior = k.snapshot(a.id), digest = hash(prior.sources), artifactHash = hash('original artifact');
    const correction = k.correction(a.id, { id: 'correction-one', taskId: 'task-one', artifactHash, instruction: 'Clarify inspection is required before an estimate.', assisted: true }); assert.equal(correction.independentHumanSeconds, null); assert.match(k.snapshot(a.id).understanding.nextAction, /corrected deliverable/);
    assert.equal(k.correction(a.id, { id: 'correction-one', taskId: 'task-one', artifactHash, instruction: correction.instruction, assisted: true }).id, correction.id);
    assert.throws(() => k.correction(b.id, { id: 'correction-one', taskId: 'task-one', artifactHash, instruction: correction.instruction, assisted: true }), /PILOT_CORRECTION_ID_CONFLICT/);
    const outcome = k.outcome(a.id, { taskId: 'task-one', artifactHash: hash('corrected artifact'), kind: 'not-useful', notes: 'The owner needs a different deliverable.', assisted: true }); assert.equal(outcome.measuredRevenueMinor, null); assert.match(k.snapshot(a.id).understanding.nextAction, /Revisit the selected bottleneck/); assert.equal(k.snapshot(b.id).outcomes.length, 0); assert.equal(hash(k.sources(a.id)), digest); assert.equal(k.snapshot(a.id).history.length > prior.history.length, true); assert.equal(k.snapshot(a.id).understanding.evidenceChangedSinceProposal, true);
}));

test('owner evidence selection unblocks bounded requests, preserves originals and cannot elevate excluded or other-company sources', async () => withStore(async (store, root) => {
    const k = new PilotKnowledge(store), c = k.createCompany({ name: 'Selected evidence business', goal: 'Prepare a bounded first task' }), other = k.createCompany({ name: 'Other company', goal: 'Separate work' });
    const large = k.addSource(c.id, { title: 'Complete large export', text: 'Full retained document. '.repeat(2000), kind: 'text', rights: 'Owner supplied', observedAt: '2026-09-13T00:00:00.000Z' });
    const concise = k.addSource(c.id, { title: 'Decision-relevant owner excerpt', text: 'A human must confirm any price. The first task prepares an unsent response.', kind: 'text', rights: 'Owner permitted excerpt', observedAt: '2026-09-13T00:00:00.000Z' });
    const privateSource = k.addSource(c.id, { title: 'Private excluded source', text: 'Do not use for workers.', kind: 'text', rights: 'Excluded administrative note', permission: 'excluded', observedAt: '2026-09-13T00:00:00.000Z' });
    assert.equal((await k.diagnose(c.id)).status, 'needs_evidence_selection'); const originals = store.db.prepare("SELECT key,body FROM entities WHERE kind='pilot-source' ORDER BY key").all();
    assert.throws(() => k.selectEvidence(c.id, [k.sources(other.id)[0].id]), /PILOT_EVIDENCE_SELECTION_SCOPE/); assert.throws(() => k.selectEvidence(c.id, [privateSource.id]), /PILOT_EXCLUDED_SOURCE_PERMISSION/); assert.throws(() => k.selectEvidence(c.id, [concise.id, concise.id]), /PILOT_EVIDENCE_SELECTION_DUPLICATE/);
    const oldVersion = k.company(c.id).version, selected = k.selectEvidence(c.id, [concise.id]); assert.equal(k.company(c.id).version, oldVersion + 1); assert.deepEqual(k.selectedSources(c.id).map(s => s.id), [concise.id]); assert.equal(k.sources(c.id).find(s => s.id === large.id)!.selected, false); assert.equal(k.sources(c.id).find(s => s.id === large.id)!.originalPermission, 'worker'); assert.equal(k.sources(c.id).find(s => s.id === large.id)!.text, large.text);
    const request = k.prepareDiagnosis(c.id); assert.deepEqual((request.request.context as any).sources.map((s: any) => s.id), [concise.id]); assert.equal((await k.diagnose(c.id)).status, 'needs_model_authorization'); assert.deepEqual(store.db.prepare("SELECT key,body FROM entities WHERE kind='pilot-source' ORDER BY key").all(), originals, 'selection never modifies original source records');
    assert.deepEqual(k.selectEvidence(c.id, [concise.id]), selected, 'repeat selection is idempotent'); k.selectEvidence(c.id, []); assert.equal(k.selectedSources(c.id).length, 0); assert.equal((await k.diagnose(c.id)).status, 'needs_evidence_selection'); assert.equal(k.sources(c.id).length, 4, 'empty selection keeps every original source');
    store.close(); const reopened = new StateStore(join(root, 'state.sqlite')); try { const memory = new PilotKnowledge(reopened); assert.equal(memory.selectedSources(c.id).length, 0); assert.equal(memory.snapshot(c.id).evidenceSelection.revision, 2); assert.equal(memory.sources(c.id).find(s => s.id === large.id)!.text, large.text); } finally { reopened.close(); }
}));
