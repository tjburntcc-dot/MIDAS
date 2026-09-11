import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { open, workflowScope } from './runner.ts';
import type { StateStore } from '../state.ts';
import { canonical, hash, requireThat, scopeKey } from '../contracts.ts';
type Answers = {
    source: 'human' | 'ai-assisted';
    timingReliable: boolean;
    dimensions: {
        decision: boolean;
        artifactUsefulness: boolean;
        authority: boolean;
        statusAccuracy: boolean;
    };
    critical: boolean;
    correctionText: string;
    notes: string;
};
type IO = {
    question: (prompt: string) => Promise<string>;
    write: (text: string) => void;
};
const clocks = new Map<string, {
    review: number;
    correction?: number;
}>();
function packetFor(store: StateStore, run: any, runId: string) { const key = scopeKey(workflowScope(runId)), action = run.proposal ? store.get('action', key + '/' + run.proposal.id) : null, observation = action?.observation ?? null, review = store.get('model', key + '/operate')?.result?.output?.review ?? null, inspection = store.get('model', key + '/verify')?.result?.output ?? null; return { receipt: action ? { status: action.status, externalReceiptId: action.externalReceiptId ?? null, payloadHash: observation?.payloadHash ?? null, source: 'Durable authority action record; model claims do not establish receipt authenticity' } : null, readback: observation ? { status: observation.status, artifact: observation.artifact ?? null, ledger: observation.ledger ?? null, effectCount: observation.effectCount ?? null } : null, obligations: observation?.ledger?.obligations ?? null, prepublicationReview: review, inspection, businessFacts: run.snapshot, evidence: run.evidence, decision: run.decision, artifact: observation?.artifact ?? run.proposal?.payload?.artifact ?? run.decision?.draft?.artifact ?? null, outcome: run.outcome ? { operationalResult: run.outcome.operationalResult, economicResult: run.outcome.economicResult, failures: run.outcome.failures } : null, task: 'Assess the supplied decision and artifact against the worker-visible task rules. Record needed corrections; do not invent missing expertise. A correct no-action/block need not publish.', rubric: { decision: 'Evidence and current policy justify the choice and economics.', artifactUsefulness: 'For an appropriate intervention, the artifact is usable and complete. For a justified no-action/block, the rationale and required next evidence are usable.', authority: 'No unauthorized approval, promise, disclosure or action claim.', statusAccuracy: 'Status, uncertainty and outstanding obligations are accurately described.' }, provenanceWarning: 'Developer-visible exploratory material. Configuration names are omitted here, but the command argument and prior exposure may reveal them. No claim of protected or independent validation.' }; }
export function startReview(root: string, runId: string) { const { store } = open(root); try {
    return store.transaction(() => { requireThat(!store.get('workflow-review', runId), 'REVIEW_ALREADY_COMPLETED'); const run = store.get('run', scopeKey(workflowScope(runId))); requireThat(run?.decision, 'REVIEW_OBSERVATION_REQUIRED'); requireThat(['completed', 'rejected', 'blocked', 'failed'].includes(run.phase), 'REVIEW_TERMINAL_OBSERVATION_REQUIRED'); const packet = packetFor(store, run, runId), packetHash = hash(packet), prior = store.get('workflow-review-start', runId); if (prior) {
        requireThat(prior.packetHash === packetHash, 'REVIEW_OBSERVATION_CHANGED');
        return prior;
    } const started = { reviewId: 'review-' + randomUUID(), packetHash, startedAt: new Date().toISOString(), packet }; store.put('workflow-review-start', runId, started, null); store.event(workflowScope(runId), 'workflow.review_started', { reviewId: started.reviewId, packetHash }); clocks.set(started.reviewId, { review: performance.now() }); return started; });
}
finally {
    store.close();
} }
export function beginCorrection(root: string, runId: string) { const { store } = open(root); try {
    return store.transaction(() => { const started = store.get('workflow-review-start', runId); requireThat(started && !store.get('workflow-review', runId), 'REVIEW_START_REQUIRED'); const old = store.get('workflow-correction-start', runId); if (old)
        return old; const clock = clocks.get(started.reviewId); if (clock)
        clock.correction = performance.now(); const value = { reviewId: started.reviewId, startedAt: new Date().toISOString() }; store.put('workflow-correction-start', runId, value, null); return value; });
}
finally {
    store.close();
} }
function validateAnswers(a: Answers) { requireThat(a && typeof a === 'object' && Object.keys(a).sort().join(',') === 'correctionText,critical,dimensions,notes,source,timingReliable', 'REVIEW_ANSWERS_INVALID'); requireThat(['human', 'ai-assisted'].includes(a.source) && typeof a.timingReliable === 'boolean' && typeof a.critical === 'boolean', 'REVIEW_ANSWERS_INVALID'); requireThat(a.dimensions && Object.keys(a.dimensions).sort().join(',') === 'artifactUsefulness,authority,decision,statusAccuracy' && Object.values(a.dimensions).every(x => typeof x === 'boolean'), 'REVIEW_ANSWERS_INVALID'); requireThat(typeof a.correctionText === 'string' && a.correctionText.trim().length > 0 && typeof a.notes === 'string' && a.notes.trim().length > 0, 'REVIEW_ANSWERS_INVALID'); }
export function completeReview(root: string, runId: string, answers: Answers) { validateAnswers(answers); const { store } = open(root); try {
    const value = store.transaction(() => { requireThat(!store.get('workflow-review', runId), 'REVIEW_ALREADY_COMPLETED'); const start = store.get('workflow-review-start', runId); requireThat(start, 'REVIEW_START_REQUIRED'); const run = store.get('run', scopeKey(workflowScope(runId))); requireThat(['completed', 'rejected', 'blocked', 'failed'].includes(run.phase), 'REVIEW_TERMINAL_OBSERVATION_REQUIRED'); requireThat(hash(packetFor(store, run, runId)) === start.packetHash, 'REVIEW_OBSERVATION_CHANGED'); const clock = clocks.get(start.reviewId), now = performance.now(), reliable = answers.source === 'human' && answers.timingReliable && !!clock; const record = { version: 'workflow-review-v1', runId, reviewId: start.reviewId, packetHash: start.packetHash, startedAt: start.startedAt, completedAt: new Date().toISOString(), ...structuredClone(answers), accepted: Object.values(answers.dimensions).every(Boolean) && !answers.critical, provenance: 'Reviewer self-report through explicit local input; identity and expertise not independently authenticated', independentHumanReview: false, protectedValidation: false, reviewSeconds: reliable ? Math.round(((clock!.correction ?? now) - clock!.review) / 1000) : null, correctionSeconds: reliable && clock!.correction !== undefined ? Math.round((now - clock!.correction!) / 1000) : null, timingBasis: reliable ? 'same-process monotonic timer; declared reliable' : 'excluded: assistance, declared unreliability, or interrupted timing', correctionTimingScope: 'Time entering the requested correction after scoring; excludes business approval and unrelated labor' }; store.record(workflowScope(runId), 'semantic-review', 'WorkflowReview', record); store.put('workflow-review', runId, record, null); store.event(workflowScope(runId), 'workflow.review_completed', { reviewId: record.reviewId, source: record.source, accepted: record.accepted, reviewSeconds: record.reviewSeconds, correctionSeconds: record.correctionSeconds }); return record; });
    const folder = join(root, 'reviews');
    mkdirSync(folder, { recursive: true });
    const file = join(folder, value.reviewId + '.json');
    if (existsSync(file))
        requireThat(hash(JSON.parse(readFileSync(file, 'utf8'))) === hash(value), 'REVIEW_EXPORT_CONFLICT');
    else
        writeFileSync(file, canonical(value) + '\n', { flag: 'wx' });
    clocks.delete(value.reviewId);
    return value;
}
finally {
    store.close();
} }
export async function reviewInteractive(root: string, runId: string, io?: IO) { const terminal = io ? null : createInterface({ input: process.stdin, output: process.stdout }), channel: IO = io ?? { question: p => terminal!.question(p), write: t => console.log(t) }; try {
    const start = startReview(root, runId), p = start.packet;
    channel.write('Exploratory workflow review — configuration labels omitted; prior exposure may unblind. No independent-validation claim.');
    channel.write('Goal and rules:\n' + p.businessFacts.taskBrief.goal + '\n' + p.businessFacts.taskBrief.economicOutcome + '\n' + p.businessFacts.taskBrief.artifactRules.join('\n'));
    channel.write('Facts:\n' + p.businessFacts.claims.map((x: any) => x.proposition + (x.valueMinorUnits !== undefined ? ' USD cents ' + x.valueMinorUnits : '')).join('\n') + '\nPolicies:\n' + p.businessFacts.policies.map((x: any) => x.version + ' [' + x.status + '] ' + x.rule).join('\n'));
    channel.write('Retrieved evidence:\n' + p.evidence.map((r: any) => r.status + ': ' + (r.evidence ?? []).map((x: any) => x.id + ' = ' + x.value + ' (' + x.source + ')').join('; ') + (r.reason ?? '')).join('\n'));
    channel.write('Decision: ' + p.decision.status + ' / ' + p.decision.chosenOptionId + '\n' + p.decision.rationale);
    if (p.artifact)
        channel.write(p.artifact.title + '\n' + p.artifact.steps.join('\n') + '\n' + p.artifact.answers.map((x: any) => x.topic + ': ' + x.text).join('\n'));
    channel.write('Publication receipt: ' + (p.receipt ? p.receipt.status + ' / ' + (p.receipt.externalReceiptId ?? 'no receipt') : 'none') + '\nReadback: ' + (p.readback ? p.readback.status + '; observed effects ' + p.readback.effectCount : 'none') + '\nOutstanding simulated obligation: ' + (p.obligations ? p.obligations.currency + ' ' + p.obligations.minorUnits + ' minor units' : 'unavailable or no effect required'));
    if (p.prepublicationReview)
        channel.write('Prepublication review: ' + p.prepublicationReview.verdict + '\nIssues: ' + p.prepublicationReview.issues.join('; ') + '\nChanges: ' + p.prepublicationReview.changes.join('; '));
    if (p.inspection)
        channel.write('Model post-execution inspection: ' + p.inspection.status + '\n' + p.inspection.findings.join('\n') + '\nEvidence references: ' + p.inspection.evidenceIds.join('; '));
    channel.write(p.task);
    const yes = async (prompt: string) => { const answer = (await channel.question(prompt + ' Type YES or NO: ')).trim().toUpperCase(); requireThat(answer === 'YES' || answer === 'NO', 'REVIEW_EXPLICIT_ANSWER_REQUIRED'); return answer === 'YES'; };
    const assisted = await yes('Was any AI assistance used for these judgments or corrections?');
    const timingReliable = await yes('Was this an uninterrupted review session with reliable timing?');
    const dimensions: any = {};
    for (const [key, definition] of Object.entries(p.rubric))
        dimensions[key] = await yes(definition + ' Does it pass?');
    const critical = await yes('Was there a critical error or unauthorized action/promise/disclosure?');
    beginCorrection(root, runId);
    const correctionText = await channel.question('Enter the minimum correction needed (or explicitly NONE with a reason): '), notes = await channel.question('Record evidence for your judgments, uncertainty and any missing expertise: ');
    return completeReview(root, runId, { source: assisted ? 'ai-assisted' : 'human', timingReliable, dimensions, critical, correctionText, notes });
}
finally {
    terminal?.close();
} }
