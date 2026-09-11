import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hash, requireThat, scopeKey } from '../contracts.ts';
import { Authority } from '../authority.ts';
import { FixtureService } from '../lab/fixture-service.ts';
import type { StateStore } from '../state.ts';
import { environmentFor } from './task.ts';
import { read, write, valuePolicy } from './config.ts';

function scope(runId: string) { return { tenantId: 'workflow-lab', businessId: runId, runId, dataPolicyVersion: 'workflow-policy-v1', mode: 'fixture' as const }; }
/** Recheck persisted output and actual fixture state, not just a success string. */
export function releaseReady(root: string, store: StateStore, runId: string): boolean {
    const s = scope(runId), run = store.get('run', scopeKey(s));
    if (run?.phase !== 'completed' || run.outcome?.operationalResult !== 'pass' || !run.proposal) return false;
    const rows = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(x => JSON.parse(String(x.body))).filter(x => x.metadata.workflow === runId);
    if (rows.length !== 4 || rows.some(x => !x.finishedAt || x.errorCode || !x.result || !x.inferenceDispatchIntent || !x.countDispatchIntent || x.cost.status !== 'provisional' && !x.invoice)) return false;
    const events = store.events({ id: 'release', tenantId: s.tenantId, businessId: s.businessId, permissions: ['read'] }, s);
    if (events.some(e => e.kind === 'workflow.failure')) return false;
    const a = new Authority(store).action(run.proposal);
    const inspection = store.get('model', scopeKey(s) + '/verify')?.result?.output;
    if (a?.status !== 'confirmed' || inspection?.status !== 'pass') return false;
    const service = new FixtureService(join(root, 'services', runId + '.sqlite'));
    try {
        const observed = service.observe(run.proposal);
        const ids = [observed.externalReceiptId, observed.payloadHash, ...run.evidence.flatMap((r: any) => (r.evidence ?? []).map((e: any) => e.id))];
        return run.serviceIdentity === service.identity() && service.verifyObservation(run.proposal, observed) && a.externalReceiptId === observed.externalReceiptId && observed.effectCount === 1 && observed.ledger?.obligations?.minorUnits === 0 && hash(observed.artifact) === hash(run.proposal.payload.artifact) && inspection.evidenceIds.includes(observed.externalReceiptId) && inspection.evidenceIds.every((id: string) => ids.includes(id)) && environmentFor(runId.slice(0, 5)).validateDecision(run.snapshot, run.evidence, run.decision).ok;
    } finally { service.close(); }
}

export function enforceValueGate(root: string, c: any, store: StateStore, runId: string) {
    requireThat(c.schedule.some((x: any) => x.runId === runId), 'UNDECLARED_WORKFLOW');
    requireThat(!runId.endsWith('-team'), 'TEAM_TREATMENT_INSUFFICIENT');
    if (runId === 'W-001-single') return;
    requireThat(releaseReady(root, store, 'W-001-single'), 'FIRST_WORKFLOW_NOT_USABLE');
    requireUsability(store, 'W-001-single');
    if (runId === 'W-006-single') return;
    requireThat(releaseReady(root, store, 'W-006-single'), 'FIRST_RELEASE_NOT_COMPLETE');
    requireUsability(store, 'W-006-single');
    requireThat(existsSync(join(root, 'releases', runId + '.json')), 'VALUE_DECISION_REQUIRED');
    const decision = read(root, 'releases/' + runId + '.json');
    requireThat(decision.configHash === hash(c) && decision.runId === runId && decision.mechanism === (valuePolicy.additionalSingles as any)[runId] && decision.continue === true, 'VALUE_DECISION_BINDING');
    // Any unresolved admitted failure stops broader spending; a new root cannot reset it.
    const rows = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(x => JSON.parse(String(x.body)));
    requireThat(rows.every(x => x.finishedAt && !x.errorCode), 'SHARED_ATTEMPT_FAILURE_UNRESOLVED');
    for (const row of store.db.prepare("SELECT body FROM entities WHERE kind='run'").all()) {
        const run = JSON.parse(String(row.body));
        requireThat(run.scope.runId === runId || ['completed', 'blocked', 'rejected'].includes(run.phase), 'PRIOR_WORKFLOW_UNRESOLVED');
        if (run.scope.runId !== runId && run.phase === 'completed') requireThat(releaseReady(root, store, run.scope.runId), 'PRIOR_WORKFLOW_NOT_USABLE');
        const events = store.events({ id: 'release', tenantId: run.scope.tenantId, businessId: run.scope.businessId, permissions: ['read'] }, run.scope);
        requireThat(!events.some(e => e.kind === 'workflow.failure'), 'SHARED_WORKFLOW_FAILURE_UNRESOLVED');
    }
}

function requireUsability(store: StateStore, runId: string) {
    const run = store.get('run', scopeKey(scope(runId))), review = store.get('workflow-value-usability', runId);
    requireThat(review?.usable === true && review.artifactHash === hash(run.proposal.payload.artifact), 'MATERIAL_USABILITY_JUDGMENT_REQUIRED');
}

/** Record an actual founder answer separately from publication authority. Never model-call this. */
export function recordUsability(c: any, store: StateStore, runId: string, artifactHash: string, input: { usable: boolean; note: string; source: 'founder-chat' | 'fixture-demo'; aiAssisted: boolean }) {
    const run = store.get('run', scopeKey(scope(runId)));
    requireThat(run?.proposal && artifactHash === hash(run.proposal.payload.artifact), 'USABILITY_ARTIFACT_MISMATCH');
    requireThat(c.mode === 'mock' || input.source === 'founder-chat', 'LIVE_MOCK_REVIEW_DENIED');
    requireThat(typeof input.usable === 'boolean' && typeof input.aiAssisted === 'boolean' && typeof input.note === 'string' && input.note.length > 0, 'USABILITY_JUDGMENT_REQUIRED');
    const review = { artifactHash, usable: input.usable, note: input.note, source: input.source, aiAssisted: input.aiAssisted, independentValidation: false, measuredReviewSeconds: null, correctionSeconds: null, recordedAt: new Date().toISOString(), configHash: hash(c) };
    store.transaction(() => store.put('workflow-value-usability', runId, review, null));
    return review;
}

/** Analyst decision under conditional authorization, not a new founder approval. */
export function recordValueDecision(root: string, c: any, store: StateStore, runId: string, input: any) {
    requireThat(Object.hasOwn(valuePolicy.additionalSingles, runId), 'VALUE_SELECTION_NOT_ALLOWED');
    requireThat(!store.get('run', scopeKey(scope(runId))), 'SELECTION_MUST_PRECEDE_OBSERVATION');
    requireThat(releaseReady(root, store, 'W-001-single') && releaseReady(root, store, 'W-006-single'), 'FIRST_RELEASE_NOT_COMPLETE');
    for (const key of ['unresolvedDecision', 'whyCallsChangeDecision', 'expectedArtifact', 'whyExistingInsufficient']) requireThat(typeof input[key] === 'string' && input[key].trim().length >= 20, 'VALUE_RATIONALE_REQUIRED');
    const rows = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(x => JSON.parse(String(x.body)));
    const held = rows.reduce((n, a) => n + a.reservation + (a.invoice?.minorUnits ?? 0), 0) + c.limits.overheadReserve.minor;
    const decision = { configHash: hash(c), runId, mechanism: (valuePolicy.additionalSingles as any)[runId], continue: true, recordedAt: new Date().toISOString(), provenance: 'AI-assisted execution decision under founder conditional authorization; not human semantic validation', ...Object.fromEntries(['unresolvedDecision', 'whyCallsChangeDecision', 'expectedArtifact', 'whyExistingInsufficient'].map(k => [k, input[k]])), remainingAdmissions: 48 - rows.length, remainingExposureMinor: c.limits.totalMinor - held, selection: 'Original distinct case mechanism; conditional on preceding single-workflow observations. No unbiased paired estimate.' };
    write(root, 'releases/' + runId + '.json', decision, true);
    return decision;
}
