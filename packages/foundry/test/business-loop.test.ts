import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { StateStore } from '../src/state.ts';
import { BusinessLoop, assign, validateBrief } from '../src/business/core.ts';
import { supportBrief, execute, approval, approvePlan, capture } from '../src/business/support-adapter.ts';
import { open } from '../src/workflow/runner.ts';
import { hash } from '../src/contracts.ts';
import type { Scope } from '../src/contracts.ts';
const scope: Scope = { tenantId: 'tenant', businessId: 'business', runId: 'memory', dataPolicyVersion: 'v1', mode: 'fixture' };
function setup() { const root = mkdtempSync(join(tmpdir(), 'midas-business-')), store = new StateStore(join(root, 'business.sqlite')); const loop = new BusinessLoop(store, scope, { id: 'founder', tenantId: 'tenant', businessId: 'business', permissions: ['read', 'operate'] }); loop.revise(supportBrief(), null, 'Synthetic fixture'); return { root, store, loop }; }
test('partial understanding, stale facts, unknown value and supersession cannot become confident priority', () => { const { loop, store } = setup(); try {
    let b = supportBrief();
    b.claims.find(c => c.id === 'authorized-lab')!.validUntil = '2020-01-01T00:00:00Z';
    loop.revise(b, 1, 'Evidence expired');
    assert.equal(loop.assess().decision, 'blocked');
    assert.deepEqual(loop.assess().candidates[0].missing, ['authorized-lab']);
    b = supportBrief();
    b.opportunities[0].benefit = null;
    loop.revise(b, 2, 'Benefit unavailable');
    assert.equal(loop.assess().candidates[0].net, null);
    assert.equal(loop.assess().understanding, 'partial');
    assert(loop.assess().uncoveredDimensions.includes('market'));
    b.claims.push({ ...b.claims[1], id: 'new-authority', supersedes: ['authorized-lab'] });
    loop.revise(b, 3, 'Explicit supersession');
    assert.equal(loop.assess().claims.find(c => c.id === 'authorized-lab')!.current, false);
    assert.equal(loop.store.records(loop.principal, scope).length, 4);
}
finally {
    store.close();
} });
test('money, references, cyclic supersession and dependencies validated before mutation', () => { for (const mutate of [(b: any) => b.opportunities[0].benefit.minorUnits = 1.2, (b: any) => b.opportunities[0].cost.currency = 'EUR', (b: any) => b.opportunities[0].claimIds = ['invented'], (b: any) => b.opportunities[0].tasks[0].dependsOn = ['inspect'], (b: any) => { b.claims[0].supersedes = [b.claims[1].id]; b.claims[1].supersedes = [b.claims[0].id]; }]) {
    const b = supportBrief();
    mutate(b);
    assert.throws(() => validateBrief(b));
} });
test('smallest team changes with competencies, business stage, budget and evidence; role title is insufficient', () => { const b = supportBrief(), o = b.opportunities[0]; assert.equal(assign(b, o).workers.length, 1); b.constraints.allowExperimental = false; assert.equal(assign(b, o).status, 'blocked'); b.constraints.allowExperimental = true; b.workers[0].evidence.push({ competency: 'support_playbook', source: 'observed-failure', population: 'current task', provenance: 'assisted_live', result: 'failure' }); assert.equal(assign(b, o).status, 'blocked'); b.workers[0].evidence = []; b.workers[0].competencies = ['support_playbook']; b.workers[0].cost.minorUnits = 104; b.workers.push({ ...structuredClone(b.workers[0]), id: 'reviewer', competencies: ['artifact_delivery', 'outcome_verification'] }); assert.equal(assign(b, o).workers.length, 2); assert(assign(b, o).rationale.every(r => r.necessaryFor.length > 0)); b.constraints.maxWorkerCost.minorUnits = 207; assert.equal(assign(b, o).status, 'blocked'); b.constraints.maxWorkerCost.minorUnits = 208; b.stage = 'growth'; assert.equal(assign(b, o).status, 'blocked'); });
test('scope isolation including LIKE wildcard names; optimistic revisions; immutable plan pin', () => { const { loop, store } = setup(); try {
    loop.plan('p');
    const other = new BusinessLoop(store, { ...scope, businessId: 'bus_ness' }, { ...loop.principal, businessId: 'bus_ness' });
    other.revise(supportBrief(), null, 'Other business');
    assert.equal(other.report().plans.length, 0);
    assert.throws(() => new BusinessLoop(store, { ...scope, businessId: 'other' }, loop.principal), /SCOPE_DENIED/);
    const b = supportBrief();
    b.stage = 'growth';
    loop.revise(b, 1, 'Business changed');
    assert.throws(() => loop.revise(b, 1, 'Stale update'), /STALE_BUSINESS/);
    assert.throws(() => loop.bind('p', { root: 'unused', runId: 'run', adapter: 'synthetic-support-workflow-v1' }), /STALE/);
    assert.equal(loop.getPlan('p').brief.stage, 'laboratory');
}
finally {
    store.close();
} });
test('generic business planning has no invoice schema and chooses no-action honestly', () => { const { loop, store } = setup(); try {
    const b = supportBrief();
    b.version = 'distribution-v1';
    b.goal = 'Assess distribution constraint';
    b.dimensions = ['distribution'];
    b.claims = b.claims.map(c => ({ ...c, dimension: 'distribution' }));
    b.opportunities[0] = { ...b.opportunities[0], id: 'channel-test', adapter: 'distribution-unimplemented-v1', diagnosis: 'Acquisition cost may exceed value', benefit: { currency: 'USD', minorUnits: 20 }, cost: { currency: 'USD', minorUnits: 25 }, tasks: [{ id: 'assess-channel', description: 'Inspect authorized channel economics', dependsOn: [], competencies: ['channel-analysis'], tools: [], effect: null }] };
    loop.revise(b, 1, 'Different business job');
    assert.equal(loop.assess().decision, 'no_action');
    assert.equal(loop.plan('none').status, 'no_action');
    assert.throws(() => loop.bind('none', { root: 'x', runId: 'r', adapter: b.opportunities[0].adapter }), /NOT_EXECUTABLE/);
}
finally {
    store.close();
} });
test('integrated mock: context, exact approval, one effect, idempotent feedback, persistent adaptation without promotion', async () => { const { loop, store, root } = setup(); const priorFetch = globalThis.fetch; globalThis.fetch = (() => { throw Error('NETWORK_FORBIDDEN'); }) as typeof fetch; try {
    loop.plan('p');
    let s = await execute(loop, 'p', root);
    assert.equal(s.checkpoint, 'waiting_approval');
    const a = approval(loop, 'p');
    assert.throws(() => approvePlan(loop, 'p', 'wrong'), /STALE_APPROVAL/);
    approvePlan(loop, 'p', a.proposalHash, true);
    s = await execute(loop, 'p', root);
    assert.equal(s.checkpoint, 'completed');
    assert.equal(loop.getPlan('p').outcome.effectCount, 1);
    assert.equal(loop.getPlan('p').outcome.provenance, 'mock');
    assert.equal(loop.assess().selected, null);
    const before = hash(loop.report().feedback);
    capture(loop, 'p');
    await execute(loop, 'p', root);
    assert.equal(hash(loop.report().feedback), before);
    assert.equal(loop.report().feedback.economicImpact, 'unknown; delivery does not establish realized benefit');
    assert.equal(loop.current().brief.workers[0].qualification, 'experimental');
    const { store: ws } = open(loop.getPlan('p').execution.root);
    try {
        const rows = ws.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(r => JSON.parse(String(r.body)));
        assert.equal(rows.length, 4);
        for (const row of rows) {
            assert.equal(row.request.context.business.planHash, hash(loop.getPlan('p').ref));
            assert.equal(row.request.context.business.understanding.completeness, 'partial');
            assert(!JSON.stringify(row.request.context.business).includes('expected.choice'));
        }
    }
    finally {
        ws.close();
    }
    const b = supportBrief();
    b.opportunities[0].cost.minorUnits = 19;
    loop.revise(b, 1, 'Economics changed; reassess same bottleneck ID');
    assert.equal(loop.assess().selected, 'reduce-repeat-work');
}
finally {
    globalThis.fetch = priorFetch;
    store.close();
} });
test('unimplemented assignment and shared adapter mismatch fail before execution', async () => { const { loop, store, root } = setup(); try {
    const b = supportBrief();
    b.opportunities[0].tasks[0].description = 'Different business action';
    loop.revise(b, 1, 'Task changed');
    loop.plan('p');
    await assert.rejects(execute(loop, 'p', root), /ADAPTER_TASK_CONTRACT_MISMATCH/);
    assert.equal(loop.getPlan('p').execution, null);
}
finally {
    store.close();
} });
test('failure-linked procedure proposal freezes fair shared settings without qualifying mock improvements', () => { const { loop, store } = setup(); try {
    loop.plan('p');
    const execution = { root: 'synthetic-test', runId: 'test', adapter: 'synthetic-support-workflow-v1' };
    loop.bind('p', execution);
    assert.throws(() => loop.proposeProcedure('c', 'p', 'workflow-owner', 0, 'new procedure', 'mechanism', 'regression'), /OBSERVED_FAILURE/);
    const outcome = { id: 'failure', planId: 'p', executionRef: hash(execution), provenance: 'mock' as const, operational: 'failed' as const, effectCount: 0, acquiredEvidence: [], obligations: { currency: 'USD', minorUnits: 0 }, costs: [], independentHumanSeconds: null, semanticAcceptance: 'unknown' as const, failures: [{ symptom: 'Fixture injected handoff lost a source reference', evidence: 'mock-event-1', category: 'handoff_loss', hypothesis: null }], digest: hash('mock-event-1'), adapter: execution.adapter };
    loop.observe(outcome);
    assert.throws(() => loop.observe({ ...outcome, digest: 'different' }), /OUTCOME_CONFLICT/);
    const c = loop.proposeProcedure('c', 'p', 'workflow-owner', 0, 'Retain source references at handoff.', 'May prevent handoff loss', 'Extra tokens and redundant checks');
    assert.equal(c.provenance, 'mock');
    const spec = { model: 'frozen-model', settings: { reasoning: 'high' }, tools: ['evidence'], contextVersion: 'v1', authorityVersion: 'v1', maxCalls: 4, maxExposure: { currency: 'USD', minorUnits: 208 }, developmentIds: ['d1'], validationIds: ['v1'], rubricVersion: 'v1', successRule: 'No critical errors and practical improvement at equal resource ceilings' };
    assert.throws(() => loop.freezeComparison('c', { ...spec, validationIds: ['d1'] }), /DUPLICATE/);
    const frozen = loop.freezeComparison('c', spec);
    assert.equal(frozen.conditions.baselineProcedure, loop.getPlan('p').team.workers[0].procedure);
    assert.equal(frozen.conditions.promotionAuthorized, false);
    assert.equal(frozen.conditions.spendingAuthorized, false);
    assert.throws(() => loop.freezeComparison('c', { ...spec, maxCalls: 5 }), /RECORD_IMMUTABLE/);
    assert.equal(loop.current().brief.workers[0].qualification, 'experimental');
    assert.equal(loop.report().feedback.improvementCandidates[0].failure.hypothesis, null);
}
finally {
    store.close();
} });
test('actual child-process interruption after persisted model response resumes without duplicate attempt', () => { const root = mkdtempSync(join(tmpdir(), 'midas-business-process-')); const cli = resolve('packages/foundry/src/business/cli.ts'); const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args, '--root', root], { encoding: 'utf8', timeout: 30000 }); assert.equal(run('init').status, 0); assert.equal(run('plan', '--plan', 'crash').status, 0); const stopped = run('run', '--plan', 'crash', '--crash', 'persisted-investigate'); assert.equal(stopped.status, 86, stopped.stderr); const resumed = run('resume', '--plan', 'crash'); assert.equal(resumed.status, 0, resumed.stderr); assert.equal(JSON.parse(resumed.stdout).checkpoint, 'waiting_approval'); const s = new StateStore(join(root, 'business.sqlite')); try {
    const p = s.db.prepare("SELECT body FROM entities WHERE kind='business-plan'").get()!;
    const plan = JSON.parse(String(p.body));
    const { store } = open(plan.execution.root);
    try {
        const rows = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(r => JSON.parse(String(r.body)));
        assert.equal(rows.length, 3);
        assert.equal(rows.filter(r => r.request.task === 'investigate').length, 1);
    }
    finally {
        store.close();
    }
}
finally {
    s.close();
} });

test('actual malformed mock output becomes evidence-linked business failure without a retry',async()=>{const {loop,store,root}=setup();try{loop.plan('p');const result=await execute(loop,'p',root,{fault:'malformed'});assert.equal(result.state,'blocked');const p=loop.getPlan('p');assert.equal(p.outcome.operational,'failed');assert.equal(p.outcome.effectCount,0);assert(p.outcome.failures.length>0);assert.equal(loop.report().feedback.improvementCandidates[0].status,'diagnosis_only');assert.equal(p.executionStatus.callsUsed,1);const before=hash(p.outcome);await execute(loop,'p',root);assert.equal(hash(loop.getPlan('p').outcome),before);assert.equal(loop.getPlan('p').executionStatus.callsUsed,1);}finally{store.close();}});
