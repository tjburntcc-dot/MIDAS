import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { Authority } from '../src/authority.ts';
import { RunController } from '../src/runtime.ts';
import { createSupportEnvironment } from '../src/lab/support.ts';
import { createFixtureModel } from '../src/lab/model-fixture.ts';
import { FixtureHttpPort, FixtureService } from '../src/lab/fixture-service.ts';
function args() {
    const value: Record<string, string> = {};
    for (let index = 2; index < process.argv.length; index += 2)
        value[process.argv[index].replace(/^--/, '')] = process.argv[index + 1];
    return value;
}
function mark(name: string, value: unknown) {
    process.stdout.write(JSON.stringify({ marker: name, value }) + '\n');
}
function hold() {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
}
const input = args();
const root = input.root;
const runId = input.run;
const store = new StateStore(join(root, 'domain.sqlite'));
const authority = new Authority(store);
const runtime = new RunController(store);
const worker = authority.authenticate('worker', readFileSync(input['worker-token-file'], 'utf8').trim());
const environment = createSupportEnvironment('viable');
const model = createFixtureModel('viable');
const run = runtime.create(worker, environment, { runId, cap: { minorUnits: Number(input.cap ?? 25), currency: 'USD' } });
let localService: FixtureService | undefined;
const actions = input['service-url']
    ? new FixtureHttpPort(input['service-url'], readFileSync(input['service-token-file'], 'utf8').trim())
    : (localService = new FixtureService(join(root, 'service.sqlite')));
const block = input.block;
try {
    const result = await runtime.advance(worker, run.scope, environment, model, actions, {
        checkpoint: input.checkpoint,
        afterDispatchIntent: block === 'after-dispatch-intent' ? () => { mark('after-dispatch-intent', { runId }); hold(); } : undefined,
        afterEffect: block === 'after-effect' ? () => { mark('after-effect', { runId }); hold(); } : undefined,
    });
    mark(block ?? 'result', { phase: result.phase, runId });
    if (block === 'checkpoint-decide' || block === 'waiting-approval')
        hold();
}
catch (error) {
    mark('error', { code: (error as any).code ?? 'ERROR', runId });
    process.exitCode = 1;
}
finally {
    localService?.close();
    store.close();
}
