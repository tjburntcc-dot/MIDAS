import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { StateStore } from '../src/state.ts';
import { Authority } from '../src/authority.ts';
import { FixtureService } from '../src/lab/fixture-service.ts';
import { scopeKey } from '../src/contracts.ts';
const here = resolve(import.meta.dirname);
const workerFile = join(here, 'process-worker.ts');
const serviceFile = join(here, '../src/lab/fixture-service.ts');
const scope = (runId: string) => ({ tenantId: 'lab-a', businessId: 'support-a', runId, dataPolicyVersion: 'lab-policy-v1', mode: 'fixture' as const });
const activeChildren = new Set<ChildProcess>();
function lab() {
    const root = mkdtempSync(join(tmpdir(), 'foundry-process-027-'));
    const store = new StateStore(join(root, 'domain.sqlite'));
    const authority = new Authority(store);
    const workerToken = authority.enroll('worker', 'lab-a', 'support-a', ['read', 'operate']);
    const ownerToken = authority.enroll('owner', 'lab-a', 'support-a', ['read', 'operate', 'approve', 'admin']);
    const workerTokenFile = join(root, 'worker.token');
    const ownerTokenFile = join(root, 'owner.token');
    const serviceTokenFile = join(root, 'service.token');
    writeFileSync(workerTokenFile, workerToken, { mode: 0o600 });
    writeFileSync(ownerTokenFile, ownerToken, { mode: 0o600 });
    writeFileSync(serviceTokenFile, 'a'.repeat(64), { mode: 0o600 });
    store.close();
    return { root, workerTokenFile, ownerTokenFile, serviceTokenFile };
}
function child(file: string, arguments_: string[]) {
    const process_ = spawn(process.execPath, [file, ...arguments_], { cwd: resolve(here, '../../..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    activeChildren.add(process_);
    process_.once('exit', () => activeChildren.delete(process_));
    return process_;
}
function lines(process_: ChildProcess) {
    let text = '';
    const messages = Object.assign([] as any[], { stderr: '' }) as any[] & {
        stderr: string;
    };
    process_.stdout!.setEncoding('utf8');
    process_.stdout!.on('data', (chunk) => {
        text += chunk;
        for (;;) {
            const newline = text.indexOf('\n');
            if (newline < 0)
                break;
            const line = text.slice(0, newline);
            text = text.slice(newline + 1);
            try {
                messages.push(JSON.parse(line));
            }
            catch { /* child diagnostic only */ }
        }
    });
    process_.stderr!.setEncoding('utf8');
    process_.stderr!.on('data', (chunk) => { messages.stderr += chunk; });
    return messages;
}
async function waitFor(messages: any[], marker: string, timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const found = messages.find((message) => message.marker === marker);
        if (found)
            return found;
        await new Promise((resolve_) => setTimeout(resolve_, 20));
    }
    throw new Error(`Timed out waiting for ${marker}`);
}
async function exit(process_: ChildProcess, timeout = 8000) {
    if (process_.exitCode !== null || process_.signalCode !== null)
        return process_.exitCode;
    return await new Promise<number | null>((resolve_, reject) => {
        const timer = setTimeout(() => { process_.kill(); reject(new Error('child timeout')); }, timeout);
        process_.once('exit', (code) => { clearTimeout(timer); resolve_(code); });
    });
}
async function kill(process_: ChildProcess) {
    if (process_.exitCode !== null || process_.signalCode !== null)
        return;
    await new Promise<void>((resolve_, reject) => {
        const timer = setTimeout(() => reject(new Error('child did not terminate')), 2000);
        process_.once('exit', () => { clearTimeout(timer); resolve_(); });
        process_.kill('SIGKILL');
    });
}
async function successfulExit(process_: ChildProcess, messages: {
    stderr: string;
}) {
    const code = await exit(process_);
    assert.equal(code, 0, `worker exited ${String(code)}: ${messages.stderr}`);
    assert.equal(messages.stderr, '', `worker wrote stderr: ${messages.stderr}`);
}
async function expectedFailure(process_: ChildProcess, messages: {
    stderr: string;
}, code: string) {
    const exitCode = await exit(process_);
    assert.notEqual(exitCode, 0, `expected ${code} failure, stderr: ${messages.stderr}`);
    assert.equal(messages.stderr, '', `known failure must be structured on stdout, not stderr: ${messages.stderr}`);
}
async function cleanupLab(root: string) {
    await Promise.all([...activeChildren].map(async (process_) => {
        try {
            await kill(process_);
        }
        catch { /* cleanup remains best effort */ }
    }));
    const base = resolve(tmpdir());
    const target = resolve(root);
    const rel = relative(base, target);
    assert.ok(rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && basename(target).startsWith('foundry-process-027-'), 'refusing to remove a non-fixture temporary directory');
    rmSync(target, { recursive: true, force: true });
}
function runWorker(root: string, runId: string, tokenFile: string, extra: string[] = []) {
    const process_ = child(workerFile, ['--root', root, '--run', runId, '--worker-token-file', tokenFile, ...extra]);
    return { process_, messages: lines(process_) };
}
function owner(root: string, ownerTokenFile: string) {
    const store = new StateStore(join(root, 'domain.sqlite'));
    const authority = new Authority(store);
    const principal = authority.authenticate('owner', readFileSync(ownerTokenFile, 'utf8').trim());
    return { store, authority, principal };
}
test('process restart after decide checkpoint and approval wait preserves durable episode state', { concurrency: false, timeout: 30000 }, async () => {
    const fixture = lab();
    try {
        const first = runWorker(fixture.root, 'checkpoint-run', fixture.workerTokenFile, ['--checkpoint', 'decide', '--block', 'checkpoint-decide']);
        await waitFor(first.messages, 'checkpoint-decide');
        await kill(first.process_);
        const before = owner(fixture.root, fixture.ownerTokenFile);
        const s = scope('checkpoint-run');
        const checkpoint = before.store.get('run', scopeKey(s));
        assert.equal(checkpoint.phase, 'decide');
        const beforeEvents = before.store.events(before.principal, s);
        before.store.close();
        const resumed = runWorker(fixture.root, 'checkpoint-run', fixture.workerTokenFile);
        await successfulExit(resumed.process_, resumed.messages);
        await waitFor(resumed.messages, 'result');
        const waiting = runWorker(fixture.root, 'checkpoint-run', fixture.workerTokenFile, ['--block', 'waiting-approval']);
        await waitFor(waiting.messages, 'waiting-approval');
        await kill(waiting.process_);
        const restartedWait = runWorker(fixture.root, 'checkpoint-run', fixture.workerTokenFile);
        await successfulExit(restartedWait.process_, restartedWait.messages);
        await waitFor(restartedWait.messages, 'result');
        const after = owner(fixture.root, fixture.ownerTokenFile);
        const run = after.store.get('run', scopeKey(s));
        assert.equal(run.phase, 'waiting_approval');
        assert.deepEqual(run.question, checkpoint.question);
        assert.deepEqual(run.roles, checkpoint.roles);
        assert.equal(after.authority.business(s).spent, 0);
        assert.equal(after.authority.business(s).reserved, 0);
        assert.equal(after.store.events(after.principal, s).filter((event) => event.kind === 'information_requested').length, beforeEvents.filter((event) => event.kind === 'information_requested').length);
        after.store.close();
    }
    finally {
        await cleanupLab(fixture.root);
    }
});
test('effect-before-domain-receipt reconciles exactly once after worker and service restart', { concurrency: false, timeout: 30000 }, async () => {
    const fixture = lab();
    let service: ChildProcess | undefined;
    try {
        service = child(serviceFile, ['--db', join(fixture.root, 'service.sqlite'), '--token-file', fixture.serviceTokenFile, '--port', '0']);
        const serviceMessages = lines(service);
        // service announces a URL without a marker; wait for the parsed line directly.
        const started = Date.now();
        while (!serviceMessages[0]?.url && Date.now() - started < 8000)
            await new Promise((resolve_) => setTimeout(resolve_, 20));
        assert.ok(serviceMessages[0]?.url);
        const url = serviceMessages[0].url;
        const setup = runWorker(fixture.root, 'effect-run', fixture.workerTokenFile, ['--service-url', url, '--service-token-file', fixture.serviceTokenFile]);
        await successfulExit(setup.process_, setup.messages);
        const open = owner(fixture.root, fixture.ownerTokenFile);
        const s = scope('effect-run');
        const pending = open.store.get('run', scopeKey(s));
        open.authority.approve(s, open.principal, pending.proposal);
        open.store.close();
        const effected = runWorker(fixture.root, 'effect-run', fixture.workerTokenFile, ['--service-url', url, '--service-token-file', fixture.serviceTokenFile, '--block', 'after-effect']);
        await waitFor(effected.messages, 'after-effect');
        await kill(effected.process_);
        await kill(service);
        service = child(serviceFile, ['--db', join(fixture.root, 'service.sqlite'), '--token-file', fixture.serviceTokenFile, '--port', '0']);
        const restarted = lines(service);
        const begin = Date.now();
        while (!restarted[0]?.url && Date.now() - begin < 8000)
            await new Promise((resolve_) => setTimeout(resolve_, 20));
        const resume = runWorker(fixture.root, 'effect-run', fixture.workerTokenFile, ['--service-url', restarted[0].url, '--service-token-file', fixture.serviceTokenFile]);
        await successfulExit(resume.process_, resume.messages);
        const checked = owner(fixture.root, fixture.ownerTokenFile);
        const run = checked.store.get('run', scopeKey(s));
        const action = checked.store.get('action', scopeKey(s) + '/publish');
        assert.equal(run.phase, 'learning_review');
        assert.equal(action.status, 'confirmed');
        assert.equal(action.attempts, 1);
        assert.equal(checked.authority.business(s).reserved, 0);
        assert.equal(checked.authority.business(s).spent, 25);
        checked.store.close();
        await kill(service);
        service = undefined;
        const inspector = new FixtureService(join(fixture.root, 'service.sqlite'));
        assert.equal(inspector.reconcile(action.proposal).effectCount, 1);
        inspector.close();
    }
    finally {
        if (service)
            await kill(service);
        await cleanupLab(fixture.root);
    }
});
test('dispatch intent with an authoritative absent service releases reservation and fails without retry', { concurrency: false, timeout: 30000 }, async () => {
    const fixture = lab();
    try {
        const setup = runWorker(fixture.root, 'intent-run', fixture.workerTokenFile);
        await successfulExit(setup.process_, setup.messages);
        const open = owner(fixture.root, fixture.ownerTokenFile);
        const s = scope('intent-run');
        const pending = open.store.get('run', scopeKey(s));
        open.authority.approve(s, open.principal, pending.proposal);
        open.store.close();
        const dispatched = runWorker(fixture.root, 'intent-run', fixture.workerTokenFile, ['--service-token-file', fixture.serviceTokenFile, '--block', 'after-dispatch-intent']);
        await waitFor(dispatched.messages, 'after-dispatch-intent');
        await kill(dispatched.process_);
        const resumed = runWorker(fixture.root, 'intent-run', fixture.workerTokenFile, ['--service-token-file', fixture.serviceTokenFile]);
        await successfulExit(resumed.process_, resumed.messages);
        const checked = owner(fixture.root, fixture.ownerTokenFile);
        const action = checked.store.get('action', scopeKey(s) + '/publish');
        assert.equal(checked.store.get('run', scopeKey(s)).phase, 'failed');
        assert.equal(action.status, 'failed');
        assert.equal(action.attempts, 1);
        assert.equal(checked.authority.business(s).reserved, 0);
        assert.equal(checked.authority.business(s).spent, 0);
        checked.store.close();
    }
    finally {
        await cleanupLab(fixture.root);
    }
});
test('independent process competitors cannot reserve beyond one shared business cap', { concurrency: false, timeout: 30000 }, async () => {
    const fixture = lab();
    try {
        for (const runId of ['compete-a', 'compete-b']) {
            const setup = runWorker(fixture.root, runId, fixture.workerTokenFile);
            await successfulExit(setup.process_, setup.messages);
        }
        const open = owner(fixture.root, fixture.ownerTokenFile);
        for (const runId of ['compete-a', 'compete-b']) {
            const s = scope(runId);
            open.authority.approve(s, open.principal, open.store.get('run', scopeKey(s)).proposal);
        }
        open.store.close();
        const left = runWorker(fixture.root, 'compete-a', fixture.workerTokenFile, ['--block', 'after-dispatch-intent']);
        const right = runWorker(fixture.root, 'compete-b', fixture.workerTokenFile, ['--block', 'after-dispatch-intent']);
        const begin = Date.now();
        while (![...left.messages, ...right.messages].some(message => message.marker === 'after-dispatch-intent') && Date.now() - begin < 8000)
            await new Promise(resolve_ => setTimeout(resolve_, 20));
        assert.ok([...left.messages, ...right.messages].some(message => message.marker === 'after-dispatch-intent'));
        const winner = left.messages.some((message) => message.marker === 'after-dispatch-intent') ? left : right;
        const loser = winner === left ? right : left;
        const denied = await waitFor(loser.messages, 'error');
        assert.equal(denied.value.code, 'BUDGET_EXCEEDED');
        await expectedFailure(loser.process_, loser.messages, 'BUDGET_EXCEEDED');
        await kill(winner.process_);
        const checked = owner(fixture.root, fixture.ownerTokenFile);
        const business = checked.authority.business(scope('compete-a'));
        const events = ['compete-a', 'compete-b'].flatMap((runId) => checked.store.events(checked.principal, scope(runId)));
        assert.equal(business.spent + business.reserved, 25);
        assert.equal(events.filter((event) => event.kind === 'action_dispatch_intent').length, 1);
        assert.equal(events.filter((event) => event.kind === 'action_denied' && event.code === 'BUDGET_EXCEEDED').length, 1);
        checked.store.close();
    }
    finally {
        await cleanupLab(fixture.root);
    }
});
