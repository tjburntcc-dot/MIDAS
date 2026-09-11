/** Replaceable acceptance adapter. Core business records have no invoice/support fields. */
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { hash, requireThat, scopeKey } from '../contracts.ts';
import { FixtureService } from '../lab/fixture-service.ts';
import { prepare, runWorkflow, open, workflowScope, approvalView, approve, rolesFor, status as workflowStatus } from '../workflow/runner.ts';
import type { RunOptions } from '../workflow/runner.ts';
import { report } from '../workflow/report.ts';
import { environmentFor } from '../workflow/task.ts';
import { BusinessLoop } from './core.ts';
import type { Brief, Outcome } from './core.ts';
export const adapterId = 'synthetic-support-workflow-v1';
export function supportBrief(): Brief {
    const snapshot = environmentFor('W-001').snapshot(), task = snapshot.taskBrief;
    const observedAt = new Date().toISOString();
    return { version: 'business-support-v1', goal: task.goal, stage: 'laboratory', prioritizationBasis: 'USD cents per eligible assisted customer over the proposed 30-day period', dimensions: ['customers', 'value_proposition', 'economics', 'operations', 'resources', 'authority', 'market', 'distribution'], authority: task.authority.requires, rights: 'Synthetic developer-visible acceptance environment only; no customer data or external action authority.', claims: [
            { id: 'reported-repeat-work', kind: 'hypothesis', statement: 'Repeated billing questions may be an avoidable operating bottleneck.', source: 'synthetic-ticket-summary-v1; reported concentration, not measured causal impact', observedAt, validUntil: null, supersedes: [], dimension: 'operations' },
            { id: 'authorized-lab', kind: 'fact', statement: 'This assignment permits only synthetic evidence gathering and exact-approved fixture publication.', source: 'versioned synthetic business brief', observedAt, validUntil: null, supersedes: [], dimension: 'authority' },
            { id: 'delivery-value', kind: 'assumption', statement: 'A reusable internal playbook could reduce repeated work. The net value is a planning estimate pending cost evidence.', source: 'synthetic-benefit-model-v1', observedAt, validUntil: null, supersedes: [], dimension: 'economics' },
            { id: 'realized-benefit', kind: 'unknown', statement: 'Realized contact reduction, eligible volume and commercial value are not measured.', source: 'no authorized outcome measurements', observedAt, validUntil: null, supersedes: [], dimension: 'economics' },
        ], opportunities: [{ id: 'reduce-repeat-work', diagnosis: 'Test whether an evidence-backed internal playbook is an eligible intervention; do not assume the reported bottleneck is causal.', claimIds: ['reported-repeat-work', 'delivery-value'], requiredFacts: ['authorized-lab'], benefit: { currency: 'USD', minorUnits: 180 }, cost: { currency: 'USD', minorUnits: 18 }, estimateBasis: 'assumption', valueBasis: 'USD cents per eligible assisted customer over the proposed 30-day period', adapter: adapterId, acceptance: task.acceptance, tasks: [
                    { id: 'investigate', description: 'Obtain current option costs and applicable policy before choosing an intervention.', dependsOn: [], competencies: ['support_playbook'], tools: ['lab.evidence'], effect: null },
                    { id: 'decide', description: 'Compare eligible options and draft the internal artifact or justify no-action.', dependsOn: ['investigate'], competencies: ['support_playbook'], tools: ['lab.evidence'], effect: null },
                    { id: 'review', description: 'Review and correct the actual artifact before requesting exact approval.', dependsOn: ['decide'], competencies: ['artifact_delivery'], tools: ['lab.evidence'], effect: 'lab.publish' },
                    { id: 'inspect', description: 'Inspect authenticated receipt and readback after approved publication.', dependsOn: ['review'], competencies: ['outcome_verification'], tools: ['lab.readback'], effect: null },
                ] }], workers: [{ id: 'workflow-owner', version: 'workflow-role-v1', kind: 'agent', procedure: rolesFor('single').operator.procedure, stages: ['laboratory'], tools: ['lab.evidence', 'lab.readback'], effects: ['lab.publish'], competencies: ['support_playbook', 'artifact_delivery', 'outcome_verification'], evidence: [{ competency: 'support_playbook', source: 'Mission029 W-001/W-006 preserved closure; not a confidential holdout', population: 'Two closely related developer-visible synthetic workflows', provenance: 'assisted_live', result: 'pass' }], available: true, cost: { currency: 'USD', minorUnits: 208 }, qualification: 'experimental' }], constraints: { currency: 'USD', maxWorkerCost: { currency: 'USD', minorUnits: 208 }, maxWorkers: 2, allowedTools: ['lab.evidence', 'lab.readback'], allowedEffects: ['lab.publish'], allowExperimental: true } };
}
export function executionFor(loop: BusinessLoop, planId: string, root: string) {
    const p = loop.getPlan(planId);
    requireThat(p?.opportunity?.adapter === adapterId, 'SUPPORTED_PLAN_REQUIRED');
    requireThat(hash(p.opportunity) === hash(supportBrief().opportunities[0]), 'ADAPTER_TASK_CONTRACT_MISMATCH');
    // Current integrated adapter executes only the proven single baseline. Other assignments remain honest proposals.
    requireThat(p.team.workers.length === 1 && p.team.workers[0].id === 'workflow-owner' && p.team.workers[0].version === 'workflow-role-v1' && p.team.workers[0].procedure === rolesFor('single').operator.procedure, 'ASSIGNMENT_NOT_IMPLEMENTED_BY_ADAPTER');
    return { root: resolve(root, 'executions', hash({ scope: loop.scope, planId }).slice(0, 24)), runId: 'W-001-single', adapter: adapterId };
}
function context(p: any): NonNullable<RunOptions['businessContext']> { const { tasks, ...bottleneck } = p.opportunity; return { version: 'business-context-v1', planHash: hash(p.ref), understanding: { goal: p.brief.goal, stage: p.brief.stage, claims: p.assessment.claims, completeness: 'partial', rights: p.brief.rights, authority: p.brief.authority }, bottleneck, workPlan: { tasks, assignments: p.team.assignments, roleVersions: p.roleVersions } }; }
export async function execute(loop: BusinessLoop, planId: string, root: string, options: RunOptions = {}) {
    requireThat(!options.businessContext, 'BUSINESS_CONTEXT_CONTROLLER_OWNED');
    let p = loop.getPlan(planId);
    if (p?.outcome) return p.executionStatus;
    const execution = executionFor(loop, planId, root);
    p = loop.bind(planId, execution);
    if (!existsSync(join(execution.root, 'config.json')))
        prepare(execution.root, 'mock');
    // Refuse an altered/live prepared directory before runWorkflow can read a credential or dispatch.
    const check = open(execution.root);
    try {
        requireThat(check.config.mode === 'mock', 'OFFLINE_ONLY');
    }
    finally {
        check.store.close();
    }
    let status;
    try { status = await runWorkflow(execution.root, execution.runId, { ...options, businessContext: context(p) }); }
    catch (error) { status = workflowStatus(execution.root, execution.runId); if (Array.isArray(status) || status.state !== 'blocked') throw error; }
    loop.progress(planId, status);
    if (['completed', 'rejected', 'blocked', 'failed'].includes(status.checkpoint) || (status.state === 'blocked' && !status.pendingEffect && status.pendingModelAttempts.length === 0))
        capture(loop, planId);
    return status;
}
export function approval(loop: BusinessLoop, id: string) { const p = loop.getPlan(id); requireThat(p?.execution, 'EXECUTION_REQUIRED'); return approvalView(p.execution.root, p.execution.runId); }
export function approvePlan(loop: BusinessLoop, id: string, digest: string, demo = false) { const p = loop.getPlan(id); requireThat(p?.execution, 'EXECUTION_REQUIRED'); const c = open(p.execution.root); try {
    requireThat(c.config.mode === 'mock', 'OFFLINE_ONLY');
}
finally {
    c.store.close();
} return approve(p.execution.root, p.execution.runId, digest, demo ? 'fixture-demo' : 'human', null); }
export function capture(loop: BusinessLoop, id: string) {
    const p = loop.getPlan(id);
    requireThat(p?.execution, 'EXECUTION_REQUIRED');
    if (p.outcome)
        return p;
    const { root, runId } = p.execution;
    const { store, config } = open(root);
    try {
        requireThat(config.mode === 'mock', 'OFFLINE_ONLY');
        const run = store.get('run', scopeKey(workflowScope(runId)));
        const r = report(root), ob = r.observations.find((x: any) => x.runId === runId);
        requireThat(ob, 'OBSERVATION_REQUIRED');
        requireThat(run && (['completed', 'rejected', 'blocked', 'failed'].includes(run.phase) || ob.failures.length > 0) && ob.pendingModelAttempts.length === 0 && !ob.pendingEffect, 'TERMINAL_REQUIRED');
        let digest = hash({ phase: run.phase, decision: run.decision ?? null }), effectCount = 0, obligations = { currency: 'USD', minorUnits: 0 };
        if (run.phase === 'completed' || ob.effectCount === 1) {
            const service = new FixtureService(join(root, 'services', runId + '.sqlite'));
            try {
                const actual = service.observe(run.proposal);
                requireThat(service.identity() === run.serviceIdentity && service.verifyObservation(run.proposal, actual) && actual.effectCount === 1 && hash(actual.artifact) === hash(run.proposal.payload.artifact), 'OUTCOME_VERIFICATION_FAILED');
                digest = hash(actual);
                effectCount = actual.effectCount!;
                obligations = actual.ledger.obligations;
            }
            finally {
                service.close();
            }
        }
        const outcome: Outcome = { id: 'result-' + id, planId: id, executionRef: hash(p.execution), provenance: 'mock', operational: ob.deterministicAccepted ? (run.phase === 'completed' ? 'pass' : 'blocked') : 'failed', effectCount, acquiredEvidence: (run.evidence ?? []).filter((r: any) => r.authorized && r.status === 'provided').flatMap((r: any) => r.evidence).map((e: any) => ({ id: e.id, statement: e.variable + ' = ' + e.value + (e.unit ? ' ' + e.unit : ''), source: e.source, observedAt: e.observedAt, qualification: e.evidenceClass + ' within synthetic fixture only; ' + e.qualification })), obligations, costs: [{ status: 'known', money: { currency: 'USD', minorUnits: ob.simulatedBusinessSpentMinor ?? 0 }, basis: 'Simulated fixture charge, not realized commercial cost' }, { status: 'unknown', money: null, basis: 'Mock model telemetry cannot measure live inference cost' }], independentHumanSeconds: null, semanticAcceptance: 'unknown', failures: ob.failures.map((f: any) => ({ symptom: f.symptom, evidence: JSON.stringify(f.evidence), category: f.category, hypothesis: f.hypothesizedCause })), digest, adapter: adapterId };
        return loop.observe(outcome);
    }
    finally {
        store.close();
    }
}
