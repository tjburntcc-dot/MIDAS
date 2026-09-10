import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { assertScope, canonical, hash, scopeKey, requireThat } from './contracts.ts';
import type { Scope, Principal, Ref } from './contracts.ts';
/** Single-host domain transactions. No network service, scheduler, or FileStore access. */
export class StateStore {
    db: DatabaseSync;
    constructor(path: string) {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
        const version = this.db.prepare('PRAGMA user_version').get()!.user_version;
        requireThat(version === 0 || version === 1, 'UNSUPPORTED_DATABASE_VERSION');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, key TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,key));
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (scope TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL, sha256 TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS artifacts (scope TEXT NOT NULL, id TEXT NOT NULL, sha256 TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(scope,id));
      CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'immutable event'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'immutable event'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_records_update BEFORE UPDATE ON records BEGIN SELECT RAISE(ABORT,'immutable record'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_records_delete BEFORE DELETE ON records BEGIN SELECT RAISE(ABORT,'immutable record'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_artifacts_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_artifacts_delete BEFORE DELETE ON artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
      PRAGMA user_version=1;
    `);
    }
    close() { this.db.close(); }
    transaction<T>(fn: () => T): T {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            requireThat(!(result instanceof Promise), 'ASYNC_TRANSACTION_FORBIDDEN');
            this.db.exec('COMMIT');
            return result;
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    get(kind: string, key: string): any {
        const row = this.db.prepare('SELECT version,body FROM entities WHERE kind=? AND key=?').get(kind, key);
        return row ? { ...JSON.parse(String(row.body)), _version: Number(row.version) } : null;
    }
    put(kind: string, key: string, value: any, expectedVersion: number | null): any {
        const { _version, ...body } = value;
        const version = expectedVersion === null ? 1 : expectedVersion + 1;
        if (expectedVersion === null)
            this.db.prepare('INSERT INTO entities(kind,key,version,body) VALUES(?,?,?,?)').run(kind, key, version, canonical(body));
        else
            requireThat(this.db.prepare('UPDATE entities SET version=?,body=? WHERE kind=? AND key=? AND version=?').run(version, canonical(body), kind, key, expectedVersion).changes === 1, 'STALE_AGGREGATE');
        return { ...body, _version: version };
    }
    event(s: Scope, kind: string, body: any) {
        this.db.prepare('INSERT INTO events(scope,kind,body) VALUES(?,?,?)').run(scopeKey(s), kind, canonical({ at: new Date().toISOString(), ...body }));
    }
    events(principal: Principal, s: Scope): any[] {
        assertScope(principal, s);
        return this.db.prepare('SELECT seq,kind,body FROM events WHERE scope=? ORDER BY seq').all(scopeKey(s)).map(r => ({ seq: r.seq, kind: r.kind, ...JSON.parse(String(r.body)) }));
    }
    record(s: Scope, id: string, kind: string, value: any, parents: Ref[] = []): Ref {
        const existing = this.db.prepare('SELECT body,sha256,version FROM records WHERE scope=? AND id=?').get(scopeKey(s), id);
        if (existing) {
            const prior = JSON.parse(String(existing.body));
            requireThat(hash({ kind, value, parents }) === hash({ kind: prior.kind, value: prior.value, parents: prior.parentRefs }), 'RECORD_IMMUTABLE');
            return { id, version: String(existing.version), sha256: String(existing.sha256) };
        }
        const body = { id, kind, schemaVersion: '1', scope: s, createdAt: new Date().toISOString(), actorId: 'foundry-kernel', parentRefs: parents, value };
        const digest = hash(body);
        this.db.prepare('INSERT INTO records(scope,id,version,sha256,body) VALUES(?,?,?,?,?)').run(scopeKey(s), id, '1', digest, canonical(body));
        return { id, version: '1', sha256: digest };
    }
    records(principal: Principal, s: Scope): any[] {
        assertScope(principal, s);
        return this.db.prepare('SELECT body,sha256 FROM records WHERE scope=? ORDER BY rowid').all(scopeKey(s)).map(r => ({ ...JSON.parse(String(r.body)), sha256: r.sha256 }));
    }
    artifact(s: Scope, id: string, body: any): Ref {
        const bytes = canonical(body);
        const digest = hash(body);
        const previous = this.db.prepare('SELECT sha256 FROM artifacts WHERE scope=? AND id=?').get(scopeKey(s), id);
        if (previous)
            requireThat(previous.sha256 === digest, 'ARTIFACT_IMMUTABLE');
        else
            this.db.prepare('INSERT INTO artifacts(scope,id,sha256,body) VALUES(?,?,?,?)').run(scopeKey(s), id, digest, bytes);
        return { id, version: '1', sha256: digest };
    }
    readArtifact(principal: Principal, s: Scope, id: string): any {
        assertScope(principal, s);
        const row = this.db.prepare('SELECT body,sha256 FROM artifacts WHERE scope=? AND id=?').get(scopeKey(s), id);
        requireThat(row, 'ARTIFACT_NOT_FOUND');
        const body = JSON.parse(String(row.body));
        requireThat(hash(body) === row.sha256, 'ARTIFACT_CORRUPT');
        return body;
    }
}
