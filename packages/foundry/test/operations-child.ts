import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { OperatingManager, owner } from '../src/operations/manager.ts';
import { OFFLINE_URL, fixtureTransport, offlineManager } from '../src/operations/offline.ts';

const [mode, root] = process.argv.slice(2);
if (!mode || !root) throw new Error('MODE_AND_ROOT_REQUIRED');
const store = new StateStore(join(root, 'operations.sqlite'));
const id = 'fault-business';
const existing = store.get('operating-business', id);
const business = existing ?? new OperatingManager({ store, researchPorts: () => ({}) }).create({ id, name: 'Fault boundary fixture', goal: 'Investigate the synthetic tool-library pickup workflow and prepare only a source-backed question.', mode: 'offline', allowedUrls: [OFFLINE_URL] });
const runtime = offlineManager(root, store, [business], { transport: fixtureTransport() });
const principal = owner(id);

if (mode === 'after-model-response') {
    runtime.models.afterResponsePersisted = () => process.exit(71);
    await runtime.manager.run(principal, id);
} else if (mode === 'after-review-approval-phase') {
    runtime.manager.afterCheckpoint = name => {
        if (name === 'after-apply' && runtime.manager.get(id).phase === 'approval') process.exit(72);
    };
    await runtime.manager.run(principal, id);
} else if (mode === 'dispatch-before-provider') {
    const view = await runtime.manager.run(principal, id);
    const batch = view.approvals[0].batchHash;
    await runtime.manager.approve(principal, id, batch);
    (runtime.transport as any).send = async () => process.exit(73);
    await runtime.manager.dispatch(principal, id, batch);
} else if (mode === 'dispatch-after-provider') {
    const view = await runtime.manager.run(principal, id);
    const batch = view.approvals[0].batchHash;
    await runtime.manager.approve(principal, id, batch);
    const send = runtime.transport.send.bind(runtime.transport);
    (runtime.transport as any).send = async (message: any) => { await send(message); process.exit(74); };
    await runtime.manager.dispatch(principal, id, batch);
} else throw new Error('UNKNOWN_MODE');

store.close();
process.exitCode = 90;
