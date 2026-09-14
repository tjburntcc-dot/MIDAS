import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '../src/state.ts';
import { PilotKnowledge } from '../src/pilot/knowledge.ts';
import { PilotDiscovery } from '../src/pilot/discovery.ts';
import { PilotIntelligence } from '../src/pilot/intelligence.ts';
import { PilotExecution } from '../src/pilot/execution.ts';

const fixture = (output: any) => ({ kind: 'fixture' as const, async run(request: any) { return { output, route: { kind: 'fixture', model: request.role.model, provider: 'offline-evidence-selection' }, usage: { inputTokens: null, outputTokens: null, cost: { status: 'known', money: { currency: 'USD', minorUnits: 0 }, basis: 'Explicit offline fixture.' } } }; } });

test('bounded source retrieval ranks permitted retained evidence without diagnosis, preserves source identities, and excludes expired or revoked material', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pilot-evidence-selection-')), store = new StateStore(join(root, 'state.sqlite'));
    try {
        const knowledge = new PilotKnowledge(store), company = knowledge.createCompany({ name: 'Evidence catalog fixture', website: 'https://example.test/', goal: 'Review inventory reconciliation steps before choosing a local owner workflow.', notes: 'The owner supplied operating documents. Private source access is already consented and must not create navigation authority.', mode: 'fixture' }), discovery = new PilotDiscovery(store, { root, knowledge }), intelligence = new PilotIntelligence(store, new PilotExecution(store, { root }));
        const high = knowledge.addSource(company.id, { title: '00 Inventory reconciliation procedure', kind: 'text', text: 'Inventory reconciliation steps: reconcile count variance before choosing an owner workflow. The operating procedure names the review checkpoint.', rights: 'Permitted imported operating procedure.', observedAt: new Date().toISOString() });
        const originals = [high];
        for (let index = 1; index <= 39; index++) originals.push(knowledge.addSource(company.id, { title: String(index).padStart(2, '0') + ' Archived retained document', kind: 'text', text: index === 39 ? 'General archival wording without the owner goal terms.' : 'Retained operating note ' + index + ' with bounded local detail.', rights: 'Permitted imported business document.', observedAt: new Date().toISOString() }));
        const expired = knowledge.addSource(company.id, { title: 'Expired operating export', kind: 'text', text: 'This old inventory export must not enter future worker context.', rights: 'Expired permission fixture.', observedAt: new Date().toISOString(), validUntil: new Date(Date.now() - 60_000).toISOString() });
        const withdrawn = knowledge.addSource(company.id, { title: 'Withdrawn connected document', kind: 'text', text: 'This connected source will be withdrawn after the initial catalog.', rights: 'Consent revocation fixture.', observedAt: new Date().toISOString() });

        discovery.start(company.id, { website: company.website });
        const beforeWithdrawal = intelligence.contextHash(company.id), initial = intelligence.sources(company.id, discovery.context(company.id));
        assert.equal(initial.length, 32, 'many permitted originals are mechanically bounded for an analysis request');
        assert(initial.some(source => source.id === high.id), 'the relevant imported procedure retains its exact source ID');
        assert(!initial.some(source => source.id === expired.id), 'expired permission never enters a model-facing selection');
        assert(initial.every(source => source.retrieval?.method.includes('not a business diagnosis')), 'selection provenance remains retrieval-only');
        assert(initial.every(source => source.permission === 'worker'), 'only effective worker permission reaches the bounded request');
        assert(knowledge.sources(company.id).some(source => source.id === originals[39].id), 'unselected originals remain retained for owner inspection');

        store.put('pilot-connection', 'connection-withdrawn', { id: 'connection-withdrawn', businessId: company.id, provider: 'google_analytics_4', capabilityIds: [], revokedAt: new Date().toISOString(), consent: null }, null);
        store.put('pilot-connection-source', 'connection-source-withdrawn', { id: 'connection-source-withdrawn', businessId: company.id, connectionId: 'connection-withdrawn', knowledgeSourceId: withdrawn.id, revokedAt: null, supersededAt: null }, null);
        const afterWithdrawal = intelligence.contextHash(company.id), catalog = discovery.context(company.id);
        assert.notEqual(afterWithdrawal, beforeWithdrawal, 'withdrawal changes the current evidence context');
        assert(!catalog.sources.some((source: any) => source.knowledgeSourceId === withdrawn.id), 'revoked connection evidence is removed from discovery source selection');
        assert(!intelligence.sources(company.id, catalog).some(source => source.id === withdrawn.id), 'revoked connection evidence cannot leak into intelligence selection');

        const retained = catalog.sources.find((source: any) => source.knowledgeSourceId === high.id);
        assert(retained); assert.equal(retained.sourceClass, 'permitted-retained-evidence'); assert.equal(retained.permission, 'worker'); assert.match(retained.retrieval.method, /mechanical lexical overlap/);
        await discovery.next(company.id, { attemptId: 'focus-imported-procedure', port: fixture({ action: 'read-source', url: null, sourceId: high.id, reason: 'Focus the already-permitted operating procedure before a later separate analysis.', unresolved: ['No account refresh or provider navigation is permitted.'] }) });
        const focused = discovery.context(company.id);
        assert.equal(focused.focusedSource.id, high.id); assert.equal(focused.focusedSource.knowledgeSourceId, high.id); assert.match(focused.focusedSource.text, /Inventory reconciliation/);
        assert.match(focused.authority, /no navigation\/read-account authority/i);

        knowledge.selectEvidence(company.id, [high.id, originals[1].id]);
        const curated = intelligence.sources(company.id, discovery.context(company.id));
        assert.deepEqual(curated.map(source => source.id).sort(), [high.id, originals[1].id].sort(), 'owner curation preserves exact original IDs rather than making copied source records');
        assert.equal(knowledge.sources(company.id).length, 43, 'curation changes future selection only; every original is still retained');
        knowledge.includeNewPermittedEvidence(company.id);
        const added=knowledge.addSource(company.id,{title:'New permitted observation',kind:'text',text:'Inventory reconciliation now has a retained new observation.',rights:'Synthetic permission test',observedAt:new Date().toISOString()});
        assert(knowledge.selectedSources(company.id).some(source=>source.id===added.id),'explicit all-permitted selection admits later material');
        assert(!knowledge.selectedSources(company.id).some(source=>source.id===withdrawn.id),'all-permitted never overrides connection withdrawal');
        knowledge.selectEvidence(company.id,[]);
        assert.equal(knowledge.selectedSources(company.id).length,0,'an explicit empty whitelist can narrow an all-permitted selection');
        assert(knowledge.sources(company.id).some(source=>source.id===high.id),'selection never deletes original evidence');
    } finally { try { store.close(); } catch {} rmSync(root, { recursive: true, force: true }); }
});
