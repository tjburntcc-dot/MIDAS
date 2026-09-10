import { assertScope, canonical, hash, requireThat, scopeKey } from './contracts.ts';
import type { Principal, Scope } from './contracts.ts';
import { StateStore } from './state.ts';

/** A cache is an optimization of authorized current state, never a source of authority. */
export class ContextCompiler {
  cache = new Map<string,any>();
  compile(principal: Principal, s: Scope, snapshot: any, evidence: any, role: any): any {
    assertScope(principal,s);
    const key=hash({scope:scopeKey(s),principal:principal.id,permissions:[...principal.permissions].sort(),snapshot,evidence,role});
    if (!this.cache.has(key)) this.cache.set(key,{snapshot:structuredClone(snapshot),evidence:structuredClone(evidence),roleVersion:role.version,dataPolicyVersion:s.dataPolicyVersion});
    return structuredClone(this.cache.get(key));
  }
  artifact(store: StateStore, principal: Principal, s: Scope, id: string) { return store.readArtifact(principal,s,id); }
  invalidate(s: Scope) { this.cache.clear(); }
}
