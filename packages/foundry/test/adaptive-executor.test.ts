import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, writeFileSync, readdirSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdaptiveWorkspace, BubblewrapBackend, contentHash, type ExecutorBackend, type BackendCommand } from '../src/adaptive/executor.ts';

const success = { status: 'completed' as const, exitCode: 0, stdout: 'fixture result', stderr: '', truncated: false, isolation: 'injected' as const };
function fixture(t: { after(fn: () => void): void }, backend?: ExecutorBackend, maxFileBytes?: number) {
  const root = mkdtempSync(join(tmpdir(), 'midas-executor-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, workspace: new AdaptiveWorkspace({ root, businessId: 'business-a', taskId: 'task-a', backend, policy: { allowCommands: true, maxFileBytes } }) };
}
test('hash-bound multfile edits preserve original on rejection and count UTF8 bytes', (t) => {
  const { workspace: w } = fixture(t, undefined, 32);
  const initial = w.write('src/main.txt', 'héllo 🌍', null);
  assert.equal(initial.bytes, Buffer.byteLength('héllo 🌍'));
  assert.throws(() => w.write('src/main.txt', 'wrong', null), /STALE/);
  assert.throws(() => w.patch('src/main.txt', initial.sha256, [{ find: 'missing', replace: '' }]), /AMBIGUOUS/);
  assert.throws(() => w.patch('src/main.txt', initial.sha256, [{ find: 'héllo', replace: 'x'.repeat(40) }]), /FILE_LIMIT/);
  assert.equal(w.read('src/main.txt').sha256, initial.sha256);
  const next = w.patch('src/main.txt', initial.sha256, [{ find: 'héllo', replace: 'hello' }]);
  assert.notEqual(next.sha256, initial.sha256); assert.equal(w.read('src/main.txt').content, 'hello 🌍');
  w.write('data/state.json', '{}', null); assert.equal(w.list().length, 2);
});
test('path escape, absolute path and symlink traversal rejected', (t) => {
  const { root, workspace: w } = fixture(t);
  assert.throws(() => w.write('../outside', 'x', null), /PATH_DENIED/);
  assert.throws(() => w.read('/etc/passwd'), /PATH_DENIED/);
  symlinkSync(root, join(w.workspacePath, 'outside'), process.platform==='win32'?'junction':'dir');
  assert.throws(() => w.write('outside/stolen', 'x', null), /SYMLINK/);
  symlinkSync(join(root, 'missing'), join(w.workspacePath, 'dangling'), process.platform==='win32'?'junction':'dir');
  assert.throws(() => w.write('dangling', 'x', null), /SYMLINK/);
});
test('company and task identities have distinct directories', (t) => {
  const { root, workspace: w } = fixture(t);
  const other = new AdaptiveWorkspace({ root, businessId: 'business-b', taskId: 'task-a', policy: {} });
  assert.notEqual(w.workspacePath, other.workspacePath); w.write('private.txt', 'a', null);
  assert.throws(() => other.read('private.txt'), /ENOENT/);
});
test('same-ID completed result replays after restart without backend dispatch', async (t) => {
  let calls = 0; let received: BackendCommand | undefined;
  const backend = { execute: async (command: BackendCommand) => { calls++; received = command; return success; } };
  const { root, workspace: w } = fixture(t, backend);
  const request = { operationId: 'first', argv: ['python3', '--version'] };
  const first = await w.command(request);
  const restarted = new AdaptiveWorkspace({ root, businessId: 'business-a', taskId: 'task-a', backend, policy: { allowCommands: true } });
  assert.deepEqual(await restarted.command(request), first); assert.equal(calls, 1);
  assert.equal(received?.network, 'off'); assert.equal(first.isolation, 'injected');
  assert.deepEqual(restarted.recoverCommand('first'), first); assert.equal(restarted.recoverCommand('not-started'), null);
  assert.equal(calls, 1); assert.equal(first.before?.truncated, false); assert.equal(first.after?.sha256, first.before?.sha256);
  await assert.rejects(() => restarted.command({ ...request, argv: ['false'] }), /ID_CONFLICT/);
});
test('unknown dispatch cannot be silently repeated after backend exception/restart', async (t) => {
  let calls = 0;
  const backend = { execute: async () => { calls++; throw new Error('lost connection'); } };
  const { root, workspace: w } = fixture(t, backend);
  const request = { operationId: 'unknown', argv: ['sh', '-c', 'do work'] };
  await assert.rejects(() => w.command(request), /lost connection/);
  const restarted = new AdaptiveWorkspace({ root, businessId: 'business-a', taskId: 'task-a', backend, policy: { allowCommands: true } });
  await assert.rejects(() => restarted.command(request), /OUTCOME_UNCERTAIN/); assert.equal(calls, 1);
  assert.throws(() => restarted.recoverCommand('unknown'), /OUTCOME_UNCERTAIN/);
  await assert.rejects(() => restarted.command({ ...request, operationId: 'replacement' }), /OUTCOME_UNCERTAIN/);
});
test('authority and timeout caps reject before dispatch', async (t) => {
  const { root, workspace: w } = fixture(t, { execute: async () => { throw new Error('should not run'); } });
  await assert.rejects(() => w.command({ argv: ['true'], operationId: 'bad-time', timeoutMs: 60_001 }), /TIMEOUT_LIMIT/);
  const denied = new AdaptiveWorkspace({ root, businessId: 'business-a', taskId: 'denied', policy: {} });
  await assert.rejects(() => denied.command({ argv: ['true'], operationId: 'denied' }), /NOT_AUTHORIZED/);
});
test('failed command records provenance and persists terminal failure', async (t) => {
  const { workspace: w } = fixture(t, { execute: async () => ({ ...success, status: 'failed', exitCode: 2, stderr: 'missing optional parser' }) });
  const receipt = await w.command({ argv: ['parser', 'input'], operationId: 'parser' });
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.businessId, 'business-a');
  const path = readdirSync(w.evidencePath).find(name => name.startsWith('command-'))!;
  assert.equal(JSON.parse(readFileSync(join(w.evidencePath, path), 'utf8')).stderr, 'missing optional parser');
});
test('relative command identity survives restored root without execution; changed policy or inputs conflict', async t => {
  let calls = 0; const backend = { execute: async () => { calls++; return success; } };
  const { root, workspace: w } = fixture(t, backend); w.write('src/file.txt', 'source', null);
  const request = { operationId: 'portable', argv: ['fixture-command'], cwd: 'src/.' };
  const original = await w.command(request); assert.equal(original.identityVersion, 'task-relative-v1'); assert.equal(original.cwd, 'src');
  const destination = mkdtempSync(join(tmpdir(), 'midas-executor-restored-'));
  t.after(() => rmSync(destination, { recursive: true, force: true })); cpSync(root, destination, { recursive: true });
  const restored = new AdaptiveWorkspace({ root: destination, businessId: 'business-a', taskId: 'task-a', backend, policy: { allowCommands: true } });
  assert.deepEqual(await restored.command({ ...request, cwd: 'src' }), original); assert.equal(calls, 1);
  await assert.rejects(() => restored.command({ ...request, argv: ['different'] }), /ID_CONFLICT/);
  const changed = new AdaptiveWorkspace({ root: destination, businessId: 'business-a', taskId: 'task-a', backend, policy: { allowCommands: true, maxTimeoutMs: 120_000 } });
  await assert.rejects(() => changed.command(request), /ID_CONFLICT/); assert.equal(calls, 1);
});
test('legacy absolute identities remain recoverable read-only but cannot be silently rebound after relocation', async t => {
  let calls = 0; const backend = { execute: async () => { calls++; return success; } };
  const { root, workspace: w } = fixture(t, backend); const request = { operationId: 'legacy', argv: ['fixture-command'] };
  const modern = await w.command(request); const { identityVersion, ...legacy } = modern;
  legacy.inputHash = contentHash(JSON.stringify({ argv: request.argv, cwd: w.workspacePath, timeoutMs: 60_000,
    policy: { network: 'off', allowCommands: true, maxFileBytes: 1_048_576, maxOutputBytes: 65_536, maxTimeoutMs: 60_000 }, businessId: 'business-a', taskId: 'task-a' }));
  writeFileSync(join(w.evidencePath, `command-${contentHash(request.operationId)}.json`), JSON.stringify(legacy));
  assert.deepEqual(await w.command(request), legacy);
  const destination = mkdtempSync(join(tmpdir(), 'midas-executor-legacy-'));
  t.after(() => rmSync(destination, { recursive: true, force: true })); cpSync(root, destination, { recursive: true });
  const restored = new AdaptiveWorkspace({ root: destination, businessId: 'business-a', taskId: 'task-a', backend, policy: { allowCommands: true } });
  assert.deepEqual(restored.recoverCommand(request.operationId), legacy);
  await assert.rejects(() => restored.command(request), /ID_CONFLICT/); assert.equal(calls, 1);
});
test('actual Bubblewrap either proves scoped execution or reports blocked, never host fallback', async (t) => {
  const { root, workspace: w } = fixture(t); const marker = join(root, 'HOST-MARKER'); writeFileSync(marker, 'private');
  const result = await new BubblewrapBackend().execute({ argv: ['/bin/sh', '-c', `test ! -e '${marker}' && printf isolated`], cwd: w.workspacePath,
    workspace: w.workspacePath, timeoutMs: 3000, maxOutputBytes: 4096, network: 'off' });
  assert.equal(result.isolation, 'bubblewrap');
  if (result.status === 'blocked') { assert.equal(result.reason, 'SANDBOX_UNAVAILABLE'); assert.notEqual(result.stdout, 'isolated'); }
  else { assert.equal(result.status, 'completed', result.stderr); assert.equal(result.stdout, 'isolated'); }
});
