import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Every action is a local synthetic fixture. Child commands authenticate through
// files; credentials are never printed or included in reports.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = resolve(repo, process.argv[2] ?? 'var/foundry-acceptance-027');
const cli = join(repo, 'packages/foundry/src/cli.ts');
const startedAt = new Date().toISOString();
function call(command, args = {}, principal = 'fixture-worker') {
  const argv = [cli, command, '--root', root];
  if (command !== 'setup') argv.push('--principal', principal, '--token-file', join(root, 'auth', principal + '.credential'));
  for (const [key, value] of Object.entries(args)) argv.push('--' + key, String(value));
  return JSON.parse(execFileSync(process.execPath, argv, { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 15000 }));
}
function exported(run) {
  const result = call('report', { run }, 'fixture-owner');
  return { manifest: result.manifest, path: relative(repo, result.path).replaceAll('\\', '/'), value: JSON.parse(readFileSync(result.path, 'utf8')) };
}
function decide(run, candidate, fixtureCase) {
  call('evaluate', { run, candidate, case: fixtureCase }, 'fixture-evaluator');
  return call('decide', { run, candidate }, 'fixture-owner');
}
function deliver(run, fixtureCase = 'inconclusive', fault) {
  const pending = call('run', { run, scenario: 'viable', cap: 500 });
  assert.equal(pending.phase, 'waiting_approval');
  call('approve', { run, proposal: pending.proposal.id }, 'fixture-owner');
  let result = call('resume', { run, ...(fault ? { fault } : {}) });
  if (fault) {
    assert.equal(result.phase, 'reconciling');
    const uncertain = exported(run);
    assert.equal(uncertain.value.action.status, 'unknown');
    assert.equal(uncertain.value.costs.businessReservedMinor, 25);
    mkdirSync(join(root, 'evidence'), { recursive: true });
    copyFileSync(resolve(repo, uncertain.path), join(root, 'evidence', 'uncertain-before.json'));
    result = call('resume', { run });
  }
  assert.equal(result.phase, 'learning_review');
  const decision = decide(run, result.learning.candidateId, fixtureCase);
  return { decision, ...exported(run) };
}

call('setup');
const viable = deliver('LAB-001');
assert.equal(viable.decision.outcome, 'inconclusive');
const rejectedRun = call('run', { run: 'LAB-002', scenario: 'rejection' });
assert.equal(rejectedRun.phase, 'rejected');
const rejected = exported('LAB-002');
assert.equal(rejected.value.action, null);
assert.equal(rejected.value.run.outcome.measurements.performedActions, 0);
const uncertain = deliver('LAB-003', 'regresses', 'timeout_after_effect');
assert.equal(uncertain.decision.outcome, 'rejected');
assert.equal(uncertain.value.action.attempts, 1);
assert.equal(uncertain.value.action.observation.effectCount, 1);
const promoted = deliver('LAB-004', 'improves');
assert.equal(promoted.decision.activeVersion, '2');
const pinned = deliver('LAB-005');
assert.equal(pinned.value.run.roles.operator.version, '2');
const rollback = call('rollback', { run: 'LAB-004' }, 'fixture-owner');
assert.equal(rollback.activeVersion, '1');
const oldAfterRollback = call('inspect', { run: 'LAB-005' });
assert.equal(oldAfterRollback.roles.operator.version, '2');
const afterRollback = deliver('LAB-006');
assert.equal(afterRollback.value.run.roles.operator.version, '1');
const promotionWithRollback = exported('LAB-004');
const runs = { viable, rejected, uncertain, promoted: promotionWithRollback, pinned, afterRollback };
const summary = {
  mission: 'MIDAS-FOUNDRY-LOOP-V0-027', schemaVersion: '1', fixtureOnly: true,
  startedAt, finishedAt: new Date().toISOString(),
  elapsedWallMilliseconds: Date.now() - Date.parse(startedAt),
  root: relative(repo, root).replaceAll('\\', '/'),
  runs: Object.fromEntries(Object.entries(runs).map(([name, r]) => [name, {
    runId: r.value.run.scope.runId, phase: r.value.run.phase,
    chosenOption: r.value.run.decision.chosenOptionId, operatorVersion: r.value.run.roles.operator.version,
    operationalResult: r.value.run.outcome.operationalResult,
    actionCost: r.value.costs.episodeActionCost, modelCalls: r.value.costs.modelCalls,
    simulatedReviewMinutes: r.value.costs.reviewMinutes, path: r.path, manifest: r.manifest,
  }])),
  learning: { inconclusive: viable.decision.outcome, rejected: uncertain.decision.outcome, promoted: promoted.decision.outcome, promotedVersion: promoted.decision.activeVersion, rollback: rollback.outcome, restoredVersion: rollback.activeVersion, inFlightVersionPreserved: oldAfterRollback.roles.operator.version },
  aggregate: { currency: 'USD', simulatedCapMinor: 500, simulatedSettledMinor: afterRollback.value.costs.businessSettledMinor, reservedMinor: afterRollback.value.costs.businessReservedMinor, actualRuntimeProviderSpendMinor: 0, simulatedReviewMinutes: 10, measuredHumanCost: null, measuredEngineeringHours: null, measuredDevelopmentModelCost: null },
  evidenceLimits: ['Fixture mechanics only; no measured role improvement or commercial value.', 'Report hashes identify bytes at export; later report commands can update exports as scoped events grow.', 'Demo elapsed wall time is not engineering effort or human review time.'],
};
assert.equal(summary.aggregate.simulatedSettledMinor, 125);
assert.equal(summary.aggregate.reservedMinor, 0);
writeFileSync(join(root, 'demo-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
