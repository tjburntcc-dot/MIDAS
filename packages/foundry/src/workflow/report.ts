import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hash, scopeKey } from '../contracts.ts';
import { Authority } from '../authority.ts';
import { FixtureService } from '../lab/fixture-service.ts';
import { open, statusFrom, workflowScope } from './runner.ts';
import { episodes, environmentFor } from './task.ts';
import { write } from './config.ts';
import { analyze } from './analysis.ts';
export function failureRecord(runId: string, category: string, symptom: string, evidence: any, hypothesis: string | null = null) { return { runId, category, symptom, evidence, hypothesizedCause: hypothesis, causeEstablished: false, intervention: null, alternativeExplanation: 'Shared specification, evidence or tool defect must be excluded before role optimization.', regressionRisk: 'A new procedure could add cost or unnecessary blocking.', smallestTest: 'Replay the preserved observation against explicit worker-visible rules before buying a fresh matched observation.' }; }
function classify(code: string) { if (/BUDGET|CAP/.test(code))
    return 'resource_exhaustion'; if (/APPROV|AUTH|GRANT|SCOPE/.test(code))
    return 'authority_violation'; if (/RECEIPT|ARTIFACT|VERIFICATION/.test(code))
    return 'verification_error'; if (/UNCERTAIN|TIMEOUT/.test(code))
    return 'uncertain_external_effect'; if (/HANDOFF/.test(code))
    return 'handoff_loss'; if (/EVIDENCE|DECISION/.test(code))
    return 'incorrect_reasoning_or_policy_application'; return 'retrieval_or_model_tool_limitation'; }
export function report(root: string) {
    const { config: c, store } = open(root);
    try {
        const attempts = store.db.prepare("SELECT body FROM entities WHERE kind='model-attempt'").all().map(x => JSON.parse(String(x.body)));
        const observations = c.schedule.map((item: any) => {
            const s = workflowScope(item.runId), run = store.get('run', scopeKey(s));
            if (!run)
                return { ...item, state: 'not_started', deterministicAccepted: false, failures: [] };
            const ep: any = episodes.find(x => x.id === item.episode), env = environmentFor(item.episode), part = attempts.filter(a => a.metadata.workflow === item.runId);
            const events = store.events({ id: 'reporter', tenantId: s.tenantId, businessId: s.businessId, permissions: ['read'] }, s);
            const action = run.proposal ? new Authority(store).action(run.proposal) : null;
            let observed: any = null;
            let receiptValid = false;
            if (run.proposal && action?.status === 'confirmed' && existsSync(join(root, 'services', item.runId + '.sqlite'))) {
                const service = new FixtureService(join(root, 'services', item.runId + '.sqlite'));
                try {
                    observed = service.observe(run.proposal);
                    receiptValid = run.serviceIdentity === service.identity() && service.verifyObservation(run.proposal, observed) && observed.externalReceiptId === action.externalReceiptId && observed.payloadHash === run.proposal.payloadHash && observed.effectCount === 1;
                }
                finally {
                    service.close();
                }
            }
            const decisionValid = !!run.decision && env.validateDecision(run.snapshot, run.evidence, run.decision).ok && run.decision.status === ep.expected.decision && run.decision.chosenOptionId === ep.expected.choice;
            const positive = ep.expected.decision === 'proposed';
            const review = store.get('model', scopeKey(s) + '/operate')?.result?.output?.review;
            const inspection = store.get('model', scopeKey(s) + '/verify')?.result?.output;
            const noEffect = !positive && !action && !run.proposal;
            const checks = { prepublicationReview: review?.verdict === 'ready', decision: decisionValid, artifactMechanical: positive ? run.outcome?.operationalResult === 'pass' : true, authority: positive ? !!store.get('grant', scopeKey(s) + '/publish') && action?.proposalHash === hash(run.proposal) : noEffect, execution: positive ? receiptValid : noEffect, obligations: positive ? observed?.ledger?.obligations?.minorUnits === 0 : noEffect, economicAccounting: positive ? action?.actualCost?.status === 'known' && action.actualCost.money.currency === 'USD' : noEffect, modelInspection: positive ? inspection?.status === 'pass' && inspection.evidenceIds?.includes(observed?.externalReceiptId) && inspection.evidenceIds.every((id: string) => [observed?.externalReceiptId, observed?.payloadHash, ...run.evidence.flatMap((r: any) => (r.evidence ?? []).map((e: any) => e.id))].includes(id)) : true, seededDefectDetected: ep.seeding.injected ? review?.issues?.length > 0 && review?.changes?.length > 0 : true };
            const failures = events.filter(e => e.kind === 'workflow.failure').map(e => failureRecord(item.runId, classify(e.code), e.code, { eventSeq: e.seq }));
            if (run.decision?.status === 'blocked')
                failures.push(failureRecord(item.runId, item.episode === 'W-004' ? 'missing_or_inaccessible_evidence' : 'specification_ambiguity', run.decision.rationale, { decisionHash: hash(run.decision) }, 'Intentional case condition; correct blocked decision, not model failure.'));
            if (events.some(e => e.kind === 'external_result_unknown'))
                failures.push(failureRecord(item.runId, 'uncertain_external_effect', 'Service response lost after dispatch; reconciliation required', { actionStatus: action?.status, events: events.filter(e => e.kind === 'external_result_unknown').map(e => e.seq) }, 'Injected fixture response-loss condition; not attributed to the model.'));
            if (positive && inspection && inspection.status !== 'pass')
                failures.push(failureRecord(item.runId, 'verification_error', 'Model inspection did not establish success', { inspection }, null));
            const semanticReview = store.get('workflow-review', item.runId);
            const actualBilledMinor = part.every(a => !!a.invoice) ? part.reduce((n, a) => n + a.invoice.minorUnits, 0) : null;
            const approval = events.filter(e => e.kind === 'workflow.approval_provenance');
            return { ...item, ...statusFrom(store, c, item.runId), checks, deterministicAccepted: Object.entries(checks).filter(([name]) => name !== 'seededDefectDetected').every(([, value]) => value === true) && ['completed', 'blocked', 'rejected'].includes(run.phase), semanticAccepted: semanticReview?.accepted ?? null, semanticReview, actualBilledMinor, humanWorkSeconds: semanticReview?.reviewSeconds != null && semanticReview?.correctionSeconds != null && (!positive || (approval.some(e => e.source === 'human') && approval.filter(e => e.source === 'human').every(e => typeof e.measuredSeconds === 'number'))) ? semanticReview.reviewSeconds + semanticReview.correctionSeconds + approval.reduce((n, e) => n + (e.measuredSeconds ?? 0), 0) : null, semanticReviewProvenance: c.mode === 'mock' ? 'deterministic mock output; semantic quality unmeasured' : 'human review required', decision: run.decision, artifact: observed?.artifact ?? null, inspection, prepublicationReview: review ?? null, teamProposal: store.get('team-proposal', item.runId), failures, seeded: ep.seeding, independentHumanCorrectionSeconds: null, approvalReviewSeconds: approval.some(e => e.source === 'human') && approval.filter(e => e.source === 'human').every(e => typeof e.measuredSeconds === 'number') ? approval.reduce((n, e) => n + (e.measuredSeconds ?? 0), 0) : null, attemptIds: part.map(a => a.id), latencyMs: part.reduce((n, a) => n + (a.observation?.latencyMs ?? 0), 0), inputTokens: part.reduce((n, a) => n + (a.observation?.inputTokens ?? 0), 0), outputTokens: part.reduce((n, a) => n + (a.observation?.outputTokens ?? 0), 0), provisionalMinor: part.reduce((n, a) => n + (a.cost?.status === 'provisional' ? a.cost.money.minorUnits : 0), 0), effectCount: observed?.effectCount ?? 0, simulatedBusinessSpentMinor: action?.actualCost?.status === 'known' ? action.actualCost.money.minorUnits : 0 };
        });
        const terminal = (observation: any) => ['completed', 'blocked', 'rejected', 'failed'].includes(observation.checkpoint);
        // A recovery with one arm is one observation, not a six-case comparison.
        const paired = episodes.flatMap(ep => {
            const single = observations.find((x: any) => x.episode === ep.id && x.configuration === 'single');
            const team = observations.find((x: any) => x.episode === ep.id && x.configuration === 'team');
            return single && team && terminal(single) && terminal(team) ? [{ episode: ep.id, lineage: ep.lineage, singleAccepted: single.deterministicAccepted, teamAccepted: team.deterministicAccepted, mechanicalDifference: Number(team.deterministicAccepted) - Number(single.deterministicAccepted), semanticDifference: null }] : [];
        });
        const complete = observations.every((x: any) => x.deterministicAccepted);
        const reservedMinor = attempts.reduce((n, x) => n + x.reservation, 0);
        const provisionalMinor = attempts.reduce((n, x) => n + (x.cost?.status === 'provisional' ? x.cost.money.minorUnits : 0), 0);
        const authoritativeSettledMinor = attempts.reduce((n, x) => n + (x.invoice?.minorUnits ?? 0), 0);
        const link = c.link ?? null;
        const currentExposureMinor = reservedMinor + authoritativeSettledMinor;
        const combinedExposureMinor = (link?.exposureMinor ?? c.limits.overheadReserve?.minor ?? 0) + currentExposureMinor;
        const accounting = { currency: 'USD', combinedExposureMinor, remainingAggregateMinor: c.limits.totalMinor - combinedExposureMinor, combinedAttempts: (link?.priorAttempts ?? 0) + attempts.length, combinedCountRequests: (link?.priorCounts ?? 0) + attempts.filter(a => a.countDispatchIntent).length, combinedProvisionalMinor: (link?.provisionalMinor ?? 0) + provisionalMinor, remainingCurrentAdmissions: (link ? 4 : 48) - attempts.length, actualProviderCalls: c.mode === 'mock' ? 0 : attempts.filter(x => x.inferenceDispatchIntent).length, actualTokenCounts: c.mode === 'mock' ? 0 : attempts.filter(x => x.countDispatchIntent).length, mockAttempts: c.mode === 'mock' ? attempts.length : 0, supportingCountBufferMinor: link?.sharedCountBufferMinor ?? c.limits.overheadReserve?.minor ?? 0, reservedMinor, provisionalMinor, authoritativeSettledMinor, actualBilledMinor: c.mode === 'mock' ? 0 : null, mode: c.mode, historicalMission028: { retainedMinor: 871, provisionalMinor: 124, transferredMinor: 0 }, ...(link ? { recoveryLink: { parentRoot: link.parentRoot, priorAttempts: link.priorAttempts ?? link.priorCounts?.attempts ?? 0, priorCounts: link.priorCounts ?? null, priorRetainedMinor: link.retainedMinor ?? 0, priorSettledMinor: link.settledMinor ?? 0, priorProvisionalMinor: link.provisionalMinor ?? 0, priorExposureMinor: link.exposureMinor ?? 0, sharedCountBufferMinor: link.sharedCountBufferMinor ?? 0, currentExposureMinor, combinedAttempts: (link.priorAttempts ?? link.priorCounts?.attempts ?? 0) + attempts.length, combinedExposureMinor: (link.exposureMinor ?? 0) + currentExposureMinor, bufferTreatment: 'Prior exposure already includes the shared count buffer; it is not added again.' } } : {}) };
        const result = { version: c.version, configHash: hash(c), provenance: c.provenance, recordedAt: new Date().toISOString(), status: complete ? (c.mode === 'mock' ? 'offline_mechanics_complete' : 'mechanics_complete_review_required') : 'incomplete_or_failed', observations, paired, allAttempts: attempts, accounting, analysis: analyze(observations, c.mode), inference: { decision: paired.length ? (c.mode === 'mock' ? 'No AI comparison inference; offline mechanics only' : 'Await independent semantic reviews and paired analysis') : 'No paired inference: this report contains no completed two-arm comparison.', independentUnits: paired.length, relatedCases: paired.length > 1, reliabilityClaim: false, qualification: 'experimental_non_production', humanCorrectionEffort: null }, capabilityRecords: ['single', 'team'].map(configuration => ({ configuration, version: c.version, taskScope: 'Evidence-to-approved synthetic internal playbook', contextRequirements: 'Versioned business brief, current costs/policy, exact proposal, signed receipt/readback', tools: ['lab.evidence', 'lab.publish', 'lab.readback'], authority: 'Exact human approval; no customer effects', evidencePopulation: paired.length ? 'Completed synthetic paired observations only' : 'One scheduled synthetic recovery observation; no comparison population', provenance: c.mode, observedAICompetence: null, semanticQuality: null, humanCorrectionEffort: null, qualification: 'experimental_non_production', knownLimitations: ['Offline mock outcomes are engineering evidence only', 'No protected final evaluation', 'No team optimality inference', 'Provider revision alias not proven immutable'], roleEvidence: 'Mission028 limited short-response evidence does not establish workflow competence' })) };
        write(root, 'reports/comparison.json', result);
        write(root, 'reports/capabilities.json', result.capabilityRecords);
        write(root, 'reports/failures.json', observations.flatMap((x: any) => x.failures));
        const escape = (s: any) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
        const html = `<!doctype html><meta charset="utf-8"><title>MIDAS workflow comparison</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;background:#f6f7fa;color:#162336}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #cad2df;text-align:left}article{background:white;padding:20px;margin:20px 0}pre{white-space:pre-wrap}h1{font-size:30px}</style><h1>MIDAS: evidence to verified outcome</h1><p>${escape(c.provenance)}</p><p>Status: ${escape(result.status)}. Human semantic quality and correction effort: unmeasured. No qualification or specialization claim.</p><table><tr><th>Episode</th><th>Single</th><th>Team</th><th>Interpretation</th></tr>${paired.map(p => `<tr><td>${p.episode}</td><td>${p.singleAccepted ? 'mechanical pass' : 'incomplete/fail'}</td><td>${p.teamAccepted ? 'mechanical pass' : 'incomplete/fail'}</td><td>Paired synthetic engineering observation</td></tr>`).join('')}</table>${observations.map((o: any) => `<article><h2>${escape(o.runId)}</h2><p>${escape(o.reason ?? o.checkpoint ?? o.state)}</p><p>${escape(o.decision?.rationale ?? 'Not yet decided')}</p><p>Calls: ${o.callsUsed ?? 0}; effect count: ${o.effectCount ?? 0}. Tokens and cost below are ${c.mode === 'mock' ? 'MOCK telemetry' : 'provider observations/provisional costs'}.</p>${o.artifact ? `<h3>${escape(o.artifact.title)}</h3><ul>${o.artifact.steps.map((s: string) => '<li>' + escape(s) + '</li>').join('')}</ul>${o.artifact.answers.map((a: any) => '<p><b>' + escape(a.topic) + '</b>: ' + escape(a.text) + '</p>').join('')}` : ''}<p>Review: ${escape(JSON.stringify(o.prepublicationReview ?? null))}</p><p>Failures: ${escape(JSON.stringify(o.failures))}</p></article>`).join('')}`;
        importWrite(join(root, 'reports/comparison.html'), html);
        return result;
    }
    finally {
        store.close();
    }
}
import { writeFileSync as importWrite } from 'node:fs';
