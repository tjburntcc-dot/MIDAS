import { StateStore } from '../../src/state.ts';
import { ModelLedger } from '../../src/experiment/ledger.ts';
import { limits } from '../../src/experiment/config.ts';
import { rawHash } from '../../src/contracts.ts';
const [db, id, mode] = process.argv.slice(2);
const scope = { tenantId: 'test_028', businessId: 'experiment', runId: 'run', dataPolicyVersion: 'v1', mode: 'fixture' } as const;
const store = new StateStore(db), ledger = new ModelLedger(store, scope, 'test-auth', { ...limits, totalMinor: 13 });
const request: any = { scope, requestId: id };
const port = ledger.port('development', { source: 'offline-process-test' });
try {
    await port.prepare!(request, { minorUnits: 13, currency: 'USD' }, rawHash('{}'), '{}');
    if (mode === 'wait') {
        await port.reserve(request, { minorUnits: 13, currency: 'USD' }, rawHash('{}'));
        console.log('dispatched');
        setInterval(() => { }, 1000);
    }
    else {
        console.log('admitted');
        store.close();
    }
}
catch (e) {
    console.log((e as any).code ?? 'UNEXPECTED');
    store.close();
}
