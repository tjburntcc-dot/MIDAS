import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { hash } from '../src/contracts.ts';
import { AdaptiveCapabilities } from '../src/adaptive/capabilities.ts';
import type { SkillPackage } from '../src/adaptive/capabilities.ts';

const binding = { businessId: 'business-a', taskId: 'parent-a', contextHash: hash('context-v1') };
const skill: SkillPackage = {
    purpose: 'Extract a supplier feed', preconditions: ['feed-readable'], inputs: ['supplier document'], outputs: ['normalized records'],
    procedure: 'Inspect the input format, run the scoped extractor, inspect its output.',
    files: [{ path: 'tools/extract.ts', sha256: hash('source-v1') }], dependencies: ['node'],
    effects: ['local-files'], tests: ['extract-known-record'], failureModes: ['encrypted input'], sourceRefs: ['docs/extractor'],
};
function acquiring(api: AdaptiveCapabilities) {
    const e = api.open({ ...binding, invocationId: 'open', objective: 'Prepare supplier records', obstacle: 'Unsupported feed', obstacleEvidence: ['tool:read-1'] });
    api.apply(binding, { type: 'diagnose', invocationId: 'diagnose', episodeId: e.id, missingCapability: 'feed extraction',
        alternatives: [{ approach: 'build extractor', reason: 'Scope is small and no network required' }], selectedApproach: 'build extractor' });
    return api.apply(binding, { type: 'acquire', invocationId: 'acquire', episodeId: e.id, package: skill });
}
function verify(api: AdaptiveCapabilities, id: string, passed = true) {
    return api.verify(binding, id, { receiptId: passed ? 'pass-1' : 'fail-1', packageHash: hash(skill), currentFiles: skill.files,
        checks: [{ id: 'extract-known-record', passed, evidenceRef: 'tool:execution-1' }], provenance: 'development' });
}

test('episodes bind business, parent and context; a worker action cannot assert verification', () => {
    const store = new StateStore(':memory:');
    try {
        const api = new AdaptiveCapabilities(store); const e = acquiring(api);
        assert.throws(() => api.view({ ...binding, businessId: 'business-b' }, e.id), /SCOPE_MISMATCH/);
        assert.throws(() => api.view({ ...binding, taskId: 'other-parent' }, e.id), /SCOPE_MISMATCH/);
        assert.throws(() => api.view({ ...binding, contextHash: hash('v2') }, e.id), /CONTEXT_STALE/);
        assert.throws(() => api.apply(binding, { type: 'verify', invocationId: 'spoof', episodeId: e.id, passed: true } as any), /ACTION_UNSUPPORTED/);
        assert.throws(() => api.apply(binding, { type: 'resume', invocationId: 'early', episodeId: e.id, evidenceRef: 'model:claim' }), /VERIFICATION_REQUIRED/);
        assert.equal(api.list({ ...binding, businessId: 'other' }).length, 0);
    } finally { store.close(); }
});

test('failed tool checks remain repairable, and current hashes are required before resume and retention', () => {
    const store = new StateStore(':memory:'); let current = skill.files;
    try {
        const api = new AdaptiveCapabilities(store, () => current); const e = acquiring(api);
        assert.equal(verify(api, e.id, false).state, 'acquiring');
        assert.equal(verify(api, e.id).state, 'verified');
        current = [{ ...skill.files[0], sha256: hash('changed') }];
        assert.throws(() => api.apply(binding, { type: 'resume', invocationId: 'resume', episodeId: e.id, evidenceRef: 'tool:parent-resumed' }), /ARTIFACT_STALE/);
        current = skill.files;
        assert.equal(api.apply(binding, { type: 'resume', invocationId: 'resume', episodeId: e.id, evidenceRef: 'tool:parent-resumed' }).state, 'resumed');
        current = [{ ...skill.files[0], sha256: hash('changed-after-resume') }];
        assert.throws(() => api.apply(binding, { type: 'retain', invocationId: 'retain', episodeId: e.id }), /ARTIFACT_STALE/);
        assert.equal(api.view(binding, e.id).history.filter(h => h.action === 'verify').length, 2);
    } finally { store.close(); }
});

test('verified pending parent resumption survives restart and duplicate invocation does not duplicate history', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adaptive-capability-')); const path = join(dir, 'state.db');
    let store = new StateStore(path);
    try {
        let api = new AdaptiveCapabilities(store, () => skill.files); const e = acquiring(api); verify(api, e.id);
        store.close(); store = new StateStore(path); api = new AdaptiveCapabilities(store, () => skill.files);
        assert.equal(api.view(binding, e.id).state, 'verified');
        const action = { type: 'resume' as const, invocationId: 'resume', episodeId: e.id, evidenceRef: 'tool:parent-resume' };
        const first = api.apply(binding, action); assert.deepEqual(api.apply(binding, action), first);
        assert.equal(api.view(binding, e.id).history.filter(h => h.action === 'resume').length, 1);
        assert.throws(() => api.apply(binding, { ...action, evidenceRef: 'changed' }), /INVOCATION_CONFLICT/);
        const retained = api.apply(binding, { type: 'retain', invocationId: 'retain', episodeId: e.id });
        const candidate = store.get('adaptive-skill-candidate', retained.candidateId!);
        assert.equal(candidate.status, 'candidate'); assert.equal(candidate.qualification, 'unqualified'); assert.equal(candidate.transfer, 'unobserved');
    } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('reuse checks scope, new task, effects and hashes; rejection never changes candidate to promoted', () => {
    const store = new StateStore(':memory:');
    try {
        const api = new AdaptiveCapabilities(store, () => skill.files); const e = acquiring(api); verify(api, e.id);
        api.apply(binding, { type: 'resume', invocationId: 'resume', episodeId: e.id, evidenceRef: 'tool:resume' });
        const retained = api.apply(binding, { type: 'retain', invocationId: 'retain', episodeId: e.id });
        const input = { invocationId: 'reuse', candidateId: retained.candidateId!, currentFiles: skill.files,
            allowedEffects: ['local-files'], preconditionEvidence: { 'feed-readable': 'tool:new-read' }, purposeRelevant: true };
        assert.throws(() => api.assessReuse(binding, input), /DIFFERENT_TASK/);
        const target = { ...binding, taskId: 'second-task', contextHash: hash('second-context') };
        assert.throws(() => api.assessReuse({ ...target, businessId: 'different-business' }, input), /SCOPE_MISMATCH/);
        const rejected = api.assessReuse(target, { ...input, allowedEffects: [] });
        assert.equal(rejected.status, 'rejected'); assert.deepEqual(rejected.reasons, ['effect_not_authorized']);
        const stale = api.assessReuse(target, { ...input, invocationId: 'stale', currentFiles: [{ ...skill.files[0], sha256: hash('different') }] });
        assert.equal(stale.status, 'rejected');
        const accepted = api.assessReuse(target, { ...input, invocationId: 'eligible' });
        assert.equal(accepted.status, 'applicable_candidate'); assert.equal(accepted.transfer, 'unobserved');
        assert.throws(() => api.recordReuseOutcome(target, { invocationId: 'rejected-outcome', reuseInvocationId: 'reuse', passed: true, evidenceRefs: ['tool:second-task'], provenance: 'development', currentFiles: skill.files }), /REUSE_NOT_APPLICABLE/);
        const outcome = api.recordReuseOutcome(target, { invocationId: 'outcome', reuseInvocationId: 'eligible', passed: true, evidenceRefs: ['tool:second-task'], provenance: 'development', currentFiles: skill.files });
        assert.equal(outcome.claim, 'non_runtime_reuse_observation');
        assert.equal(store.get('adaptive-skill-candidate', retained.candidateId!).qualification, 'unqualified');
        assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM entities WHERE kind=?').get('adaptive-skill-reuse')!.n, 3);
    } finally { store.close(); }
});
