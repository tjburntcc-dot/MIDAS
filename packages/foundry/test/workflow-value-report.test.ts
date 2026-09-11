import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, runWorkflow, approve, approvalView, open } from '../src/workflow/runner.ts';
import { hash } from '../src/contracts.ts';
import { recordUsability } from '../src/workflow/value-gate.ts';
import { valueReport } from '../src/workflow/value-report.ts';

test('value report separates executed mock evidence from deferred workflows and shows actual review changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-value-'));
    prepare(root, 'mock', 'value');
    await runWorkflow(root, 'W-001-single');
    const view = approvalView(root, 'W-001-single');
    const {config, store} = open(root); try {recordUsability(config,store,'W-001-single',hash(view.artifact),{usable:true,note:'MOCK calibration',source:'fixture-demo',aiAssisted:false});} finally {store.close();}
    approve(root, 'W-001-single', view.proposalHash, 'fixture-demo');
    await runWorkflow(root, 'W-001-single');
    await runWorkflow(root, 'W-006-single');
    const result: any = valueReport(root);
    const observed = result.workflows.find((x: any) => x.runId === 'W-006-single');
    const deferred = result.workflows.find((x: any) => x.runId === 'W-001-team');
    assert.equal(result.version, 'workflow-029-value-v2');
    assert.equal(observed.execution.actualOrMock, 'mock execution');
    assert.ok(observed.gallery.inheritedDraft);
    assert.notEqual(observed.gallery.artifactFacts.beforeHash, observed.gallery.artifactFacts.afterHash);
    assert.ok(observed.legacyTriage.modelReportedChanges.length > 0);
    assert.equal(observed.approvalProvenance.measuredHumanApprovalSeconds, null);
    assert.equal(observed.approvalProvenance.independentSubjectiveReview, 'unknown/not recorded');
    assert.equal(deferred.execution.state, 'unexecuted/deferred');
    assert.match(result.recommendation.rationale, /No team-superiority inference/);
    assert.ok(existsSync(join(root, 'reports', 'value-report.json')));
    assert.match(readFileSync(join(root, 'reports', 'value-report.html'), 'utf8'), /unexecuted\/deferred, not failed/);
    assert.match(readFileSync(join(root, 'reports', 'value-report.html'), 'utf8'), /<ol>/);
});

test('value report refuses to relabel an original configuration', () => { const root=mkdtempSync(join(tmpdir(),'original-report-')); prepare(root,'mock'); assert.throws(()=>valueReport(root), /VALUE_PROFILE_REQUIRED/); });
