import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { businessKey, canonical, hash, object, proposal, requireThat } from '../contracts.ts';
import type { ActionPort, Observation, Proposal } from '../contracts.ts';
/** Independent durable fake business system. Its database is never the domain DB. */
export class FixtureService implements ActionPort {
    db: DatabaseSync;
    fault: string;
    private signingKey: string;
    private instanceId: string;
    constructor(path: string, fault = 'none', signingKey?: string) {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.fault = fault;
        this.db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS effects(key TEXT PRIMARY KEY,requestHash TEXT NOT NULL,result TEXT NOT NULL);');
        this.db.exec('CREATE TABLE IF NOT EXISTS service_identity(id INTEGER PRIMARY KEY CHECK(id=1),key TEXT NOT NULL);');
        this.db.prepare('INSERT OR IGNORE INTO service_identity(id,key) VALUES(1,?)').run(signingKey ?? randomBytes(32).toString('hex'));
        this.signingKey = String(this.db.prepare('SELECT key FROM service_identity WHERE id=1').get()!.key);
        this.db.exec('CREATE TABLE IF NOT EXISTS service_instance(id INTEGER PRIMARY KEY CHECK(id=1),instance TEXT NOT NULL);');
        this.db.prepare('INSERT OR IGNORE INTO service_instance(id,instance) VALUES(1,?)').run(randomBytes(24).toString('hex'));
        this.instanceId = String(this.db.prepare('SELECT instance FROM service_instance WHERE id=1').get()!.instance);
        if (signingKey)
            requireThat(signingKey === this.signingKey, 'SERVICE_KEY_MISMATCH');
    }
    close() { this.db.close(); }
    identity() { return this.instanceId; }
    identityProof() { return { identity: this.instanceId, signature: createHmac('sha256', this.signingKey).update('identity:' + this.instanceId).digest('hex') }; }
    execute(p: Proposal): Observation {
        proposal(p);
        requireThat(p.toolId === 'lab.publish' && p.scope.mode === 'fixture', 'FIXTURE_TOOL_REQUIRED');
        object(p.payload, ['artifact', 'simulatedLedger']);
        const key = businessKey(p.scope) + '/' + p.idempotencyKey;
        this.db.exec('BEGIN IMMEDIATE');
        let result: Observation;
        try {
            const prior = this.db.prepare('SELECT requestHash,result FROM effects WHERE key=?').get(key);
            if (prior) {
                requireThat(prior.requestHash === hash(p), 'EXTERNAL_IDEMPOTENCY_CONFLICT');
                result = JSON.parse(String(prior.result));
            }
            else {
                const ledger = structuredClone(p.payload.simulatedLedger);
                requireThat(ledger.simulated === true, 'SIMULATED_LEDGER_REQUIRED');
                // A fixture delivery discharges its simulated delivery obligation. Refunds
                // stay visible, independently of the worker's completion text.
                ledger.obligations = { minorUnits: 0, currency: p.estimatedCost.currency };
                if (ledger.bookings)
                    ledger.recognizedRevenue = structuredClone(ledger.bookings);
                result = { status: 'confirmed', externalReceiptId: 'FX-' + hash({ key, requestHash: hash(p) }).slice(0, 24), payloadHash: p.payloadHash, artifact: structuredClone(p.payload.artifact), ledger, actualCost: { status: 'known', money: p.estimatedCost, basis: 'simulated fixture delivery charge' }, effectCount: 1 };
                this.db.prepare('INSERT INTO effects(key,requestHash,result) VALUES(?,?,?)').run(key, hash(p), canonical(result));
            }
            this.db.exec('COMMIT');
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
        if (this.fault === 'timeout_after_effect') {
            const err: any = new Error('Fixture timeout after committed effect');
            err.code = 'TIMEOUT_AFTER_EFFECT';
            throw err;
        }
        return this.attest(p, result);
    }
    /** Read-only report projection. Unlike reconcile, absence never seals an effect key. */
    observe(p: Proposal): Observation {
        proposal(p);
        const key = businessKey(p.scope) + '/' + p.idempotencyKey;
        const row = this.db.prepare('SELECT requestHash,result FROM effects WHERE key=?').get(key);
        if (!row) return {status:'unknown'};
        requireThat(row.requestHash === hash(p), 'EXTERNAL_IDEMPOTENCY_CONFLICT');
        return this.attest(p, JSON.parse(String(row.result)));
    }
    reconcile(p: Proposal): Observation {
        proposal(p);
        if (this.fault === 'unavailable')
            return { status: 'unknown' };
        const key = businessKey(p.scope) + '/' + p.idempotencyKey;
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const prior = this.db.prepare('SELECT requestHash,result FROM effects WHERE key=?').get(key);
            if (prior) {
                requireThat(prior.requestHash === hash(p), 'EXTERNAL_IDEMPOTENCY_CONFLICT');
                this.db.exec('COMMIT');
                return this.attest(p, JSON.parse(String(prior.result)));
            }
            // A negative lookup alone cannot exclude a delayed original request. Seal
            // the key atomically so a late execute can only return this same absence.
            const absent: Observation = { status: 'absent', effectCount: 0, actualCost: { status: 'known', money: { minorUnits: 0, currency: p.estimatedCost.currency }, basis: 'fixture key sealed absent; delayed dispatch cannot apply' } };
            this.db.prepare('INSERT INTO effects(key,requestHash,result) VALUES(?,?,?)').run(key, hash(p), canonical(absent));
            this.db.exec('COMMIT');
            return this.attest(p, absent);
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    attest(p: Proposal, observation: Observation): Observation { return signObservation(this.signingKey, this.instanceId, p, observation); }
    verifyObservation(p: Proposal, observation: Observation): boolean { return verifyProof(this.signingKey, this.instanceId, p, observation); }
}
function signObservation(key: string, serviceIdentity: string, p: Proposal, observation: Observation): Observation {
    const { proof, ...body } = observation;
    const requestHash = hash(p);
    const signature = createHmac('sha256', key).update(canonical({ requestHash, serviceIdentity, body })).digest('hex');
    return { ...body, proof: { requestHash, serviceIdentity, signature } };
}
function verifyProof(key: string, serviceIdentity: string, p: Proposal, observation: Observation): boolean {
    if (!observation.proof || observation.proof.serviceIdentity !== serviceIdentity || observation.proof.requestHash !== hash(p))
        return false;
    const expected = signObservation(key, serviceIdentity, p, observation).proof!.signature;
    const supplied = observation.proof.signature;
    return typeof supplied === 'string' && supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export class FixtureHttpPort implements ActionPort {
    url: string;
    token: string;
    private instanceId = '';
    constructor(url: string, token: string) { const u = new URL(url); requireThat(u.protocol === 'http:' && u.hostname === '127.0.0.1' && !u.username && !u.password, 'LOCAL_SERVICE_REQUIRED'); this.url = u.origin; this.token = token; }
    async call(operation: string, p: any): Promise<any> {
        const response = await fetch(this.url + '/' + operation, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + this.token }, body: canonical(p), signal: AbortSignal.timeout(3000) });
        requireThat(response.ok, 'FIXTURE_SERVICE_ERROR');
        return response.json() as Promise<Observation>;
    }
    async identity() { const value = await this.call('identity', {}); requireThat(typeof value.identity === 'string' && /^[a-f0-9]{48}$/.test(value.identity), 'INVALID_SERVICE_IDENTITY'); const expected = createHmac('sha256', this.token).update('identity:' + value.identity).digest('hex'); requireThat(typeof value.signature === 'string' && value.signature.length === expected.length && timingSafeEqual(Buffer.from(expected), Buffer.from(value.signature)), 'INVALID_SERVICE_IDENTITY'); this.instanceId = value.identity; return value.identity; }
    execute(p: Proposal) { return this.call('execute', p); }
    reconcile(p: Proposal) { return this.call('reconcile', p); }
    verifyObservation(p: Proposal, o: Observation) { return verifyProof(this.token, this.instanceId, p, o); }
}
export function serve(service: FixtureService, token: string, port = 0) {
    requireThat(token.length >= 32, 'INVALID_SERVICE_TOKEN');
    const server = createServer(async (req, res) => {
        if (req.headers.authorization !== 'Bearer ' + token) {
            res.writeHead(401).end();
            return;
        }
        if (req.method !== 'POST' || !['/identity', '/execute', '/reconcile'].includes(req.url ?? '')) {
            res.writeHead(404).end();
            return;
        }
        try {
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of req) {
                bytes += chunk.length;
                requireThat(bytes <= 65536, 'BODY_TOO_LARGE');
                chunks.push(chunk);
            }
            if (req.url === '/identity') {
                res.writeHead(200, { 'content-type': 'application/json' }).end(canonical(service.identityProof()));
                return;
            }
            const p = proposal(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            const result = req.url === '/execute' ? service.execute(p) : service.reconcile(p);
            res.writeHead(200, { 'content-type': 'application/json' }).end(canonical(result));
        }
        catch (error) {
            if ((error as any).code === 'TIMEOUT_AFTER_EFFECT')
                req.socket.destroy();
            else
                res.writeHead(400).end(JSON.stringify({ error: (error as any).code ?? 'INVALID_REQUEST' }));
        }
    });
    server.listen(port, '127.0.0.1', () => { const address = server.address() as any; process.stdout.write(JSON.stringify({ service: 'foundry-fixture', url: 'http://127.0.0.1:' + address.port }) + '\n'); });
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = Object.fromEntries(process.argv.slice(2).reduce((rows: string[][], v, i, a) => i % 2 === 0 ? [...rows, [v.replace(/^--/, ''), a[i + 1]]] : rows, []));
    requireThat(args.db && args['token-file'], 'SERVICE_ARGUMENTS_REQUIRED');
    const token = readFileSync(args['token-file'], 'utf8').trim();
    const service = new FixtureService(args.db, args.fault ?? 'none', token);
    serve(service, token, Number(args.port ?? 0));
}
