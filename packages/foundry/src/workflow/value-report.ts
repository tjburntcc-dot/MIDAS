import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { read, write, configFor, valueVersion } from './config.ts';
import { report } from './report.ts';
import { hash, requireThat } from '../contracts.ts';
import { open, workflowScope } from './runner.ts';

type Attempt = { metadata?: { workflow?: string }; request?: { task?: string; context?: any }; result?: { output?: any }; observation?: any; cost?: any; invoice?: any; reservation?: number; id?: string };

const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const pretty = (value: unknown) => JSON.stringify(value ?? null, null, 2);
const stage = (attempts: Attempt[], task: string) => attempts.find(x => x.request?.task === task)?.result?.output ?? null;
const artifact = (value: any) => value?.artifact ?? value?.draft?.artifact ?? null;
const artifactFacts = (before: any, after: any) => ({
    beforeHash: before ? hash(before) : null,
    afterHash: after ? hash(after) : null,
    normalizedArtifactEqual: before && after ? hash(before) === hash(after) : null
});
const renderArtifact = (label: string, value: any) => !value ? `<section><h4>${escape(label)}</h4><p>Not available in the executed record.</p></section>` : `<section><h4>${escape(label)}</h4><h5>${escape(value.title ?? 'Untitled artifact')}</h5><ol>${(value.steps ?? []).map((step: any) => `<li>${escape(step)}</li>`).join('')}</ol>${(value.answers ?? []).map((answer: any) => `<p><strong>${escape(answer.topic)}</strong><br>${escape(answer.text)}</p>`).join('')}</section>`;

/**
 * Publish an evidence-bound, readable view of workflow observations.  This is
 * deliberately a presentation of report() facts, not a semantic-quality or
 * team-performance evaluator.
 */
export function valueReport(root: string) {
    requireThat(configFor(root).version === valueVersion, 'VALUE_PROFILE_REQUIRED');
    const base: any = report(root);
    const cases: any[] = read(root, 'episodes.json');
    const approvalEvents = new Map<string, any[]>();
    const usability = new Map<string, any>();
    const { store } = open(root);
    try {
        for (const item of base.observations) {
            const scope = workflowScope(item.runId);
            usability.set(item.runId, store.get('workflow-value-usability', item.runId));
            approvalEvents.set(item.runId, store.events({ id: 'value-reporter', tenantId: scope.tenantId, businessId: scope.businessId, permissions: ['read'] }, scope).filter((event: any) => event.kind === 'workflow.approval_provenance'));
        }
    }
    finally {
        store.close();
    }
    const byRun = new Map<string, Attempt[]>();
    for (const row of base.allAttempts as Attempt[]) {
        const runId = row.metadata?.workflow;
        if (runId)
            byRun.set(runId, [...(byRun.get(runId) ?? []), row]);
    }
    const workflows = base.observations.map((observation: any) => {
        const attempts = byRun.get(observation.runId) ?? [];
        const initialDecision = stage(attempts, 'decide') ?? observation.decision;
        const operated = stage(attempts, 'operate');
        const inspected = stage(attempts, 'verify') ?? observation.inspection;
        const decideAttempt = attempts.find(x => x.request?.task === 'decide');
        const verifyAttempt = attempts.find(x => x.request?.task === 'verify');
        const episode = cases.find(x => x.id === observation.episode);
        const inheritedDraft = attempts.find(x => x.request?.task === 'decide')?.request?.context?.snapshot?.taskBrief?.existingDraft?.artifact
            ?? episode?.taskBrief?.existingDraft?.artifact
            ?? null;
        const executed = observation.state !== 'not_started' || attempts.length > 0;
        const checks = observation.checks ?? {};
        const mechanicalAccepted = Object.entries(checks).filter(([name]) => name !== 'seededDefectDetected').every(([, value]) => value === true) && ['completed', 'blocked', 'rejected'].includes(observation.checkpoint);
        const initialDraft = artifact(initialDecision);
        const finalArtifact = artifact(operated) ?? observation.artifact ?? null;
        const approvals = approvalEvents.get(observation.runId) ?? [];
        const usage = attempts.map(a => ({ id: a.id ?? null, latencyMs: a.observation?.latencyMs ?? null, inputTokens: a.observation?.inputTokens ?? null, outputTokens: a.observation?.outputTokens ?? null, reservationMinor: a.reservation ?? 0, provisionalMinor: a.cost?.status === 'provisional' ? a.cost.money?.minorUnits ?? null : null, billedMinor: a.invoice?.minorUnits ?? null }));
        return {
            runId: observation.runId,
            episode: observation.episode,
            configuration: observation.configuration,
            provenance: base.provenance,
            execution: executed ? { state: observation.state, checkpoint: observation.checkpoint ?? null, deterministicAccepted: mechanicalAccepted, actualOrMock: base.accounting.mode === 'mock' ? 'mock execution' : 'actual provider execution' } : { state: 'unexecuted/deferred', reason: observation.reason ?? 'Scheduled observation has not started.' },
            gallery: { inheritedDraft, call2InitialDraft: initialDraft, call3FinalArtifact: finalArtifact, reviewReportedByModel: operated?.review ?? observation.prepublicationReview ?? null, artifactFacts: artifactFacts(initialDraft, finalArtifact), receiptAndReadback: { verifyContext: verifyAttempt?.request?.context ? { receipt: verifyAttempt.request.context.receipt ?? null, observation: verifyAttempt.request.context.observation ?? null, obligations: verifyAttempt.request.context.obligations ?? null, artifact: verifyAttempt.request.context.artifact ?? null } : null, inspection: inspected, effectCount: observation.effectCount, observedArtifact: observation.artifact ?? null } },
            evidenceAndDecision: { evidenceRecordsFromContext: decideAttempt?.request?.context?.evidence ?? attempts.find(x => x.request?.task === 'investigate')?.request?.context?.evidence ?? [], decision: initialDecision ?? observation.decision ?? null },
            approvalProvenance: { founderUsability: usability.get(observation.runId) ?? null, events: approvals.map(event => ({ source: event.source ?? null, measuredSeconds: event.measuredSeconds ?? null, correctionSeconds: event.correctionSeconds ?? null, proposalHash: event.proposalHash ?? null })), measuredHumanApprovalSeconds: approvals.some(event => event.source === 'human') && approvals.filter(event => event.source === 'human').every(event => typeof event.measuredSeconds === 'number') ? approvals.reduce((total, event) => total + (event.source === 'human' && typeof event.measuredSeconds === 'number' ? event.measuredSeconds : 0), 0) : null, independentSubjectiveReview: 'unknown/not recorded', correctionTimingSeconds: null },
            attempts: usage,
            accounting: { actualBilledMinor: observation.actualBilledMinor, provisionalMinor: observation.provisionalMinor, aggregateMode: base.accounting.mode },
            legacyTriage: { seededDefectDetected: checks.seededDefectDetected ?? null, modelReportedChanges: (operated?.review ?? observation.prepublicationReview)?.changes ?? [], interpretation: 'Legacy seeded-defect heuristic is shown separately and is not part of value-profile mechanical acceptance. Semantic defect detection remains unknown.' },
            limitations: ['Synthetic workflow evidence only.', base.accounting.mode === 'mock' ? 'MOCK telemetry; no provider competence or spending claim.' : 'Actual provider telemetry does not establish subjective quality.', 'Independent subjective review and correction timing are unknown unless recorded.']
        };
    });
    const executed = workflows.filter((x: any) => x.execution.state !== 'unexecuted/deferred');
    const deferred = workflows.filter((x: any) => x.execution.state === 'unexecuted/deferred');
    const completedMechanicalSingles = executed.filter((x: any) => x.configuration === 'single' && x.execution.deterministicAccepted);
    const result = {
        version: 'workflow-029-value-v2',
        basedOn: { workflowReportVersion: base.version, configHash: base.configHash, mode: base.accounting.mode, provenance: base.provenance },
        recordedAt: new Date().toISOString(),
        scope: 'Executed observations only; no semantic-quality, qualification, or team-superiority conclusion.',
        schedule: { executed: executed.map((x: any) => x.runId), deferred: deferred.map((x: any) => x.runId), deferredInterpretation: 'Unexecuted/deferred is not a failure.' },
        recommendation: { decision: completedMechanicalSingles.length ? 'retain_single_provisionally' : 'run_single_smoke_before_comparison', qualification: 'Mechanical execution evidence only; semantic quality is unknown.', rationale: 'Team arms remain deferred for insufficient treatment: shared context, tools, review procedure, and a cosmetic procedure suffix do not justify paid team work. No team-superiority inference is available.' },
        workflows,
        accounting: { ...base.accounting, admittedAttempts: base.allAttempts.length, remainingAdmissions: 48 - base.allAttempts.length, retainedTotalMinor: base.accounting.reservedMinor + base.accounting.supportingCountBufferMinor, remainingExposureMinor: 3000 - base.accounting.reservedMinor - base.accounting.supportingCountBufferMinor - base.accounting.authoritativeSettledMinor, pendingAttemptIds: base.allAttempts.filter((a: any) => !a.finishedAt).map((a: any) => a.id), countsAreDispatchIntents: true, reservationIsSpending: false }
    };
    write(root, 'reports/value-report.json', result);
    const cards = workflows.map((x: any) => `<article><h2>${escape(x.runId)} <small>${escape(x.execution.state)}</small></h2><p>${escape(x.execution.actualOrMock ?? x.execution.reason)}</p><h3>Artifact gallery</h3>${renderArtifact('Original inherited draft', x.gallery.inheritedDraft)}${renderArtifact('Call 2 initial draft', x.gallery.call2InitialDraft)}${renderArtifact('Call 3 final artifact', x.gallery.call3FinalArtifact)}<p>Factual comparison: initial hash ${escape(x.gallery.artifactFacts.beforeHash)}, final hash ${escape(x.gallery.artifactFacts.afterHash)}, normalized artifact equality: ${escape(x.gallery.artifactFacts.normalizedArtifactEqual)}.</p><details><summary>Reported review and technical evidence</summary><pre>${escape(pretty({ modelReportedReview: x.gallery.reviewReportedByModel, evidenceAndDecision: x.evidenceAndDecision, receiptAndReadback: x.gallery.receiptAndReadback, approval: x.approvalProvenance, attempts: x.attempts, accounting: x.accounting, legacyTriage: x.legacyTriage }))}</pre></details><p>${escape(x.limitations.join(' '))}</p></article>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>MIDAS workflow value report</title><style>body{font:16px system-ui;max-width:1120px;margin:32px auto;padding:0 18px;background:#f6f7fa;color:#172033}article{background:#fff;padding:20px;margin:18px 0;border:1px solid #d8deea;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6fa;padding:12px}small{font-weight:normal}h1{font-size:30px}</style><h1>MIDAS workflow value report</h1><p>${escape(result.basedOn.provenance)}. Synthetic; ${escape(result.basedOn.mode)}. Subjective independent review and timing may be unknown.</p><p>${escape(result.scope)}</p><p><b>Recommendation:</b> ${escape(result.recommendation.decision)} ${escape(result.recommendation.rationale)}</p><p>Executed: ${escape(result.schedule.executed.join(', ') || 'none')}. Deferred: ${escape(result.schedule.deferred.join(', ') || 'none')} (unexecuted/deferred, not failed).</p>${cards}`;
    writeFileSync(join(root, 'reports', 'value-report.html'), html);
    return result;
}
