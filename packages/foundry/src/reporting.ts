import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Authority } from './authority.ts';
import { StateStore } from './state.ts';
import { assertScope, canonical, hash, rawHash, requireThat, scopeKey } from './contracts.ts';
import type { Principal, Scope } from './contracts.ts';
export function report(store: StateStore, principal: Principal, s: Scope) {
    assertScope(principal, s);
    const run = store.get('run', scopeKey(s));
    requireThat(run, 'RUN_NOT_FOUND');
    const events = store.events(principal, s), records = store.records(principal, s);
    const authority = new Authority(store), business = authority.business(s), action = run.proposal ? authority.action(run.proposal) : null;
    const modelCalls = events.filter(e => e.kind === 'model_attempt_completed');
    const reviewMinutes = events.filter(e => e.kind === 'approval_granted').reduce((a, e) => a + e.reviewMinutes, 0);
    const costEntries = events.filter(e => e.cost || e.usage?.cost || e.reservation).map(e => ({ event: e.kind, at: e.at, category: e.kind.startsWith('model') ? 'model' : e.kind === 'approval_granted' ? 'human_review' : e.kind.startsWith('evidence') ? 'tool_read' : 'tool_action', cost: e.cost ?? e.usage?.cost ?? { status: 'unknown', money: null, basis: 'reserved dispatch; not settled' }, reservation: e.reservation ?? null, simulated: e.simulated ?? true }));
    const artifact = run.refs.artifact ? store.readArtifact(principal, s, 'delivered-artifact') : null;
    const learningDecisions = records.filter(r => ['promotion_decision', 'rollback_decision', 'fixture_evaluation', 'learning_candidate'].includes(r.kind));
    const result = { schemaVersion: '1', mission: 'MIDAS-FOUNDRY-LOOP-V0-027', fixtureOnly: true, claims: { engineering: 'fixture state and failure mechanics', roleImprovement: 'not measured', commercialValue: 'not measured' }, run, action, artifact, records, events, learningDecisions, costs: { currency: business.cap.currency, businessCapMinor: business.cap.minorUnits, businessReservedMinor: business.reserved, businessSettledMinor: business.spent, episodeActionCost: action?.actualCost ?? { status: 'known', money: { minorUnits: 0, currency: 'USD' }, basis: 'no fixture delivery' }, modelCalls: modelCalls.length, fixtureModelCostMinor: 0, reviewMinutes, reviewMeasurement: 'synthetic fixture minutes, not observed human time', humanCost: { status: 'unknown', money: null, basis: 'no measured review valuation' }, engineeringHours: null, founderHours: null, developmentModelCost: null, actualRuntimeProviderSpendMinor: 0, costEntries }, simulatedBusinessLedger: action?.observation?.ledger ?? null };
    return result;
}
/** Semantic fixture replay only. IDs, timestamps, receipts and all derived hashes
 * are omitted by explicit projection, not by claiming raw-byte identity. */
export function normalizedReport(value: any) {
    return { schemaVersion: value.schemaVersion, fixtureOnly: true, phase: value.run.phase, snapshot: value.run.snapshot, evidence: value.run.evidence, decision: value.run.decision, roleVersions: Object.fromEntries(Object.entries(value.run.roles).map(([k, v]) => [k, (v as any).version])), artifact: value.artifact, operationalResult: value.run.outcome?.operationalResult ?? null, economicResult: value.run.outcome?.economicResult ?? null, actionStatus: value.action?.status ?? null, actionCost: value.action?.actualCost ?? null, ledger: value.simulatedBusinessLedger, learningOutcomes: value.learningDecisions.filter((r: any) => r.kind === 'promotion_decision').map((r: any) => r.value.outcome), reviewMinutes: value.costs.reviewMinutes, fixtureModelCalls: value.costs.modelCalls };
}
export function exportReport(store: StateStore, principal: Principal, s: Scope, directory: string) {
    const value = report(store, principal, s);
    mkdirSync(directory, { recursive: true });
    const raw = JSON.stringify(value, null, 2) + '\n';
    const path = join(directory, 'report.json');
    writeFileSync(path, raw);
    if (value.artifact)
        writeFileSync(join(directory, 'artifact.json'), JSON.stringify(value.artifact, null, 2) + '\n');
    const normalized = normalizedReport(value);
    writeFileSync(join(directory, 'normalized.json'), canonical(normalized) + '\n');
    const manifest = { schemaVersion: '1', scope: s, rawSha256: rawHash(raw), normalizedSha256: hash(normalized), normalization: 'explicit semantic projection v1 excludes timestamps/run IDs/external IDs and their derived hashes', fixtureOnly: true };
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return { path, manifest };
}
