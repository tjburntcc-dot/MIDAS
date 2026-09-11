import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, runWorkflow, approve, approvalView, open, status } from '../src/workflow/runner.ts';
import { authorize, configFor, read, write, valueVersion } from '../src/workflow/config.ts';
import { recordValueDecision, releaseReady, recordUsability } from '../src/workflow/value-gate.ts';
import { hash } from '../src/contracts.ts';

function fresh(mode: 'mock' | 'live' = 'mock') { const parent = mkdtempSync(join(tmpdir(), 'value-029-')); const root = join(parent, 'run'); prepare(root, mode, 'value'); return root; }
async function finish(root: string, id: string) { let s = await runWorkflow(root, id); if (s.checkpoint === 'waiting_approval') { const view = approvalView(root, id); const {config, store} = open(root); try { recordUsability(config, store, id, hash(view.artifact), {usable:true, note:'MOCK usability fixture; not a human judgment', source:'fixture-demo', aiAssisted:false}); } finally {store.close();} approve(root, id, view.proposalHash, 'fixture-demo'); s = await runWorkflow(root, id); } if (s.checkpoint === 'reconciling') s = await runWorkflow(root, id); return s; }
const rationale = { unresolvedDecision: 'Can this configuration handle changed current economics?', whyCallsChangeDecision: 'The original case adds a distinct current-policy supersession requirement.', expectedArtifact: 'A preserved decision and independently checked fixture publication.', whyExistingInsufficient: 'Earlier observations used the same economics and do not check supersession.' };

test('value freeze preserves old profile; bounded first release and asynchronous availability are exact', () => {
    const root = fresh(); const c = configFor(root), grant = read(root, 'authorization.request.json');
    assert.equal(c.version, valueVersion); assert.deepEqual(c.schedule.slice(0, 2).map((x: any) => x.runId), ['W-001-single', 'W-006-single']);
    assert.deepEqual(c.limits.stages.smoke, { minor: 416, attempts: 8 }); assert.equal(c.limits.overheadReserve.minor, 504);
    assert.equal(grant.humanMinutes, null); assert.match(grant.availability, /asynchronously/); assert.equal(grant.countDeadlineMs, 10000); assert.equal(grant.countRequests, 48);
    c.valuePolicy.teamAdmitted = true; write(root, 'config.json', c); assert.throws(() => configFor(root), /CONFIGURATION_CHANGED/);
});

test('order and cosmetic-team gate reject before any admission; waiting approval cannot release next workflow', async () => {
    const root = fresh();
    await assert.rejects(runWorkflow(root, 'W-006-single'), /FIRST_WORKFLOW_NOT_USABLE/);
    await assert.rejects(runWorkflow(root, 'W-001-team'), /TEAM_TREATMENT_INSUFFICIENT/);
    await runWorkflow(root, 'W-001-single');
    await assert.rejects(runWorkflow(root, 'W-006-single'), /FIRST_WORKFLOW_NOT_USABLE/);
    approve(root, 'W-001-single', approvalView(root,'W-001-single').proposalHash, 'fixture-demo'); await runWorkflow(root,'W-001-single'); await assert.rejects(runWorkflow(root,'W-006-single'), /MATERIAL_USABILITY_JUDGMENT_REQUIRED/); assert.equal(status(root, 'W-001-single').callsUsed, 4); assert.equal(status(root, 'W-006-single').state, 'not_started');
});

test('completed release resumes without more requests; missing value rationale blocks remaining work', async () => {
    const root = fresh(); await finish(root, 'W-001-single'); await finish(root, 'W-006-single');
    await finish(root, 'W-001-single'); assert.equal(status(root, 'W-001-single').callsUsed, 4);
    await assert.rejects(runWorkflow(root, 'W-002-single'), /VALUE_DECISION_REQUIRED/);
    const { config, store } = open(root);
    try { assert.equal(releaseReady(root, store, 'W-006-single'), true); assert.throws(() => recordValueDecision(root, config, store, 'W-002-single', {}), /VALUE_RATIONALE_REQUIRED/); const d = recordValueDecision(root, config, store, 'W-002-single', rationale); assert.equal(d.remainingAdmissions, 40); assert.equal(d.remainingExposureMinor, 2080); assert.equal(d.configHash, hash(config)); } finally { store.close(); }
    await finish(root, 'W-002-single'); assert.equal(status(root, 'W-002-single').checkpoint, 'completed');
});

test('failed admission retains reservation and blocks next workflow without retry', async () => {
    const root = fresh(); await assert.rejects(runWorkflow(root, 'W-001-single', { fault: 'malformed' }));
    await assert.rejects(runWorkflow(root, 'W-001-single')); await assert.rejects(runWorkflow(root, 'W-006-single'), /FIRST_WORKFLOW_NOT_USABLE/);
    assert.equal(status(root, 'W-001-single').callsUsed, 1); assert.equal(status(root, 'W-001-single').retainedMinor, 52);
});

test('new signed value account cannot stack under same evidence parent and unsigned mutations do not authorize', () => {
    const root = fresh('live'), request = read(root, 'authorization.request.json');
    write(root, 'approved.json', { ...request, approved: true }); authorize(root, join(root, 'approved.json'));
    const original = readFileSync(join(root, 'authorization.json'), 'utf8');
    assert.throws(() => authorize(root, join(root, 'approved.json')), /EEXIST/); assert.equal(readFileSync(join(root, 'authorization.json'), 'utf8'), original);
    const legacy = join(root, '..', 'legacy'); prepare(legacy, 'live'); write(legacy, 'approved.json', { ...read(legacy, 'authorization.request.json'), approved: true }); assert.throws(() => authorize(legacy, join(legacy, 'approved.json')), /VALUE_ACCOUNT_ALREADY_BOUND/);
    const other = join(root, '..', 'other'); prepare(other, 'live', 'value'); write(other, 'approved.json', { ...read(other, 'authorization.request.json'), approved: true });
    assert.throws(() => authorize(other, join(other, 'approved.json')), /PRIOR_029_LIVE_ACCOUNT_REQUIRES_RECONCILIATION/);
});
