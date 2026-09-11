import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsesBody } from '../src/model-port.ts';
import type { ModelRequest } from '../src/contracts.ts';
import { environmentFor, schemaForTask, TASK_VERSION, validateWorkflowOutput } from '../src/workflow/task.ts';
import { route } from '../src/workflow/config.ts';
import { buildWorkflowContext } from '../src/workflow/runner.ts';

const usd = (minorUnits: number) => ({ minorUnits, currency: 'USD' });
const experiment = {
    hypothesis: 'A bounded internal playbook may reduce repeated billing-status contacts.',
    competingExplanation: 'A change in the synthetic ticket mix could explain the result.',
    population: 'The supplied synthetic billing-status workflow.',
    allocation: 'Compare the fixed eligible options from the supplied snapshot.',
    baseline: 'No delivery action.',
    endpoint: 'A verified useful internal artifact or an evidence-backed no-action decision.',
    exclusions: ['Customer contact', 'Real customer records'],
    exposureCap: 'One reversible fixture publication after exact approval.',
    branches: [{ condition: 'Qualified evidence changes', nextAction: 'Recalculate before proposing an effect.' }],
};
const artifact = {
    title: 'Bounded internal billing guide',
    policyVersion: 'support-policy-v2',
    steps: [
        'Check the authoritative invoice status before drafting a response.',
        'Treat payment timing as a conditional business day estimate and refer the listed exceptions.',
    ],
    answers: [
        { topic: 'payment-timing', text: 'Payment may take two business days; this estimate is conditional and is never a guarantee.' },
        { topic: 'billing-status', text: 'Check the authoritative invoice status and obtain missing settlement evidence before responding.' },
    ],
};

function evidenceContext() {
    const environment = environmentFor('W-001');
    const snapshot: any = environment.snapshot();
    const evidenceDeadline = '2026-09-12T20:00:00.000Z';
    const investigate = {
        branches: [
            { action: 'Retain a blocked no-action record.', answer: 'Qualified costs are unavailable.' },
            { action: 'Compare eligible contribution.', answer: 'Qualified costs and policy are available.' },
        ],
        deadline: evidenceDeadline,
        decision: 'Establish the costs needed for a bounded contribution decision.',
        kind: 'information_request',
        maxCost: usd(0),
        plausibleRange: { maximum: 811, minimum: 7, unit: 'hypothetical USD cents per customer' },
        source: 'synthetic-cost-ledger-v1',
        variable: 'cost_per_case',
    };
    const investigateContext = { snapshot, evidence: [], evidenceDeadline, contextVersion: 'workflow-context-v3', toolVersion: 'fixture-tools-v1' };
    validateWorkflowOutput('investigate', investigate, investigateContext);
    const evidence = environment.evidenceRequests!(investigate as any).map(request => environment.getEvidence(request));
    return { environment, snapshot, evidenceDeadline, investigate, investigateContext, evidence };
}

test('varied handwritten outputs satisfy all four published contracts and the independent business validators', () => {
    const { environment, snapshot, evidenceDeadline, investigate, investigateContext, evidence } = evidenceContext();
    assert.equal(investigate.plausibleRange.minimum, 7);
    assert.equal(environment.evidenceRequests!(investigate as any).length, 2);
    const alternateInvestigation = structuredClone(investigate);
    alternateInvestigation.decision = 'Qualify the permitted source before choosing any delivery.';
    alternateInvestigation.branches.reverse();
    alternateInvestigation.plausibleRange = { minimum: 0, maximum: 0, unit: 'planning USD cents per customer' };
    validateWorkflowOutput('investigate', alternateInvestigation, investigateContext);

    const decideContext = { ...investigateContext, evidence, question: investigate };
    const decision = {
        status: 'proposed',
        kind: 'decision',
        alternatives: [
            { evidenceIds: [], contribution: usd(0), cost: usd(0), expectedBenefit: usd(0), id: 'no-action' },
            { evidenceIds: ['evidence-cost-playbook'], contribution: usd(162), cost: usd(18), expectedBenefit: usd(180), id: 'limited-playbook' },
            { evidenceIds: ['evidence-cost-high-touch'], contribution: usd(-145), cost: usd(325), expectedBenefit: usd(180), id: 'high-touch-outreach' },
        ],
        chosenOptionId: 'limited-playbook',
        rationale: 'The limited playbook is the eligible option with the highest positive contribution.',
        reversalConditions: ['A qualified cost or applicable policy change requires a new decision.'],
        assumptions: ['The supplied synthetic evidence applies only to this episode.'],
        draft: { artifact, kind: 'support_artifact' },
        experiment,
    };
    validateWorkflowOutput('decide', decision, decideContext);
    assert.equal(environment.validateDecision(snapshot, evidence, decision as any).ok, true);
    const alternateDecision = structuredClone(decision);
    alternateDecision.alternatives.reverse();
    alternateDecision.rationale = 'Qualified evidence still supports the limited internal playbook.';
    alternateDecision.assumptions = [];
    alternateDecision.reversalConditions = [];
    alternateDecision.experiment.exclusions = [];
    alternateDecision.experiment.branches = [];
    validateWorkflowOutput('decide', alternateDecision, decideContext);
    assert.equal(environment.validateDecision(snapshot, evidence, alternateDecision as any).ok, true);

    const wrongEconomics = structuredClone(decision);
    wrongEconomics.alternatives.find((option: any) => option.id === 'high-touch-outreach').expectedBenefit.minorUnits = 181;
    wrongEconomics.alternatives.find((option: any) => option.id === 'high-touch-outreach').contribution.minorUnits = -144;
    validateWorkflowOutput('decide', wrongEconomics, decideContext);
    assert.equal(environment.validateDecision(snapshot, evidence, wrongEconomics as any).ok, false);

    const borrowedReference = structuredClone(decision);
    borrowedReference.alternatives.find((option: any) => option.id === 'limited-playbook').evidenceIds = ['evidence-policy-v2'];
    assert.throws(() => validateWorkflowOutput('decide', borrowedReference, decideContext), /WORKFLOW_OUTPUT_INVALID|WORKFLOW_EVIDENCE_REFS_INVALID/);

    const operateContext = { ...decideContext, decision, draft: decision.draft };
    const operated = {
        review: { verdict: 'ready', changes: ['Clarified conditional timing and the evidence check.'], issues: ['The initial wording needed explicit conditional timing.'] },
        artifact,
        kind: 'support_artifact',
    };
    validateWorkflowOutput('operate', operated, operateContext);
    const action: any = environment.actionFor(operated as any);
    assert.equal(action.toolId, 'lab.publish');
    const alternateOperation = structuredClone(operated);
    alternateOperation.artifact = { ...structuredClone(artifact), title: 'Short billing response guide', answers: [...artifact.answers].reverse() };
    alternateOperation.review = { issues: [], changes: [], verdict: 'ready' };
    validateWorkflowOutput('operate', alternateOperation, operateContext);
    assert.equal(environment.actionFor(alternateOperation as any).toolId, 'lab.publish');

    const externalReceiptId = 'FX-contract-audit-029';
    const payloadHash = '7a71d95bd17da7afcontract029';
    const ledger = { ...action.payload.simulatedLedger, recognizedRevenue: usd(1000), obligations: usd(0) };
    const observation = { status: 'confirmed', externalReceiptId, payloadHash, effectCount: 1, artifact, ledger, deliveryObserved: true };
    const receipt = { status: 'confirmed', externalReceiptId, payloadHash, effectCount: 1 };
    const verifyContext = { ...operateContext, artifact, receipt, observation, obligations: usd(0), prepublicationReview: operated };
    const inspection = {
        evidenceIds: [payloadHash, 'evidence-policy-v2', externalReceiptId],
        findings: ['The confirmed readback matches the reviewed artifact and records zero obligations.'],
        status: 'pass',
        kind: 'inspection',
    };
    validateWorkflowOutput('verify', inspection, verifyContext);
    validateWorkflowOutput('verify', { kind: 'inspection', status: 'unknown', findings: [], evidenceIds: [] }, verifyContext);
    const reorderedInspection = { ...inspection, findings: ['Receipt, hash, and readback remain consistent.'], evidenceIds: [...inspection.evidenceIds].reverse() };
    validateWorkflowOutput('verify', reorderedInspection, verifyContext);
    assert.equal(environment.verify({ snapshot, evidence, artifact, receipt: { toolId: 'lab.publish', status: 'confirmed', id: externalReceiptId }, observation } as any).operationalResult, 'pass');
    assert.equal(snapshot.taskBrief.version, TASK_VERSION);
    assert.equal(evidenceDeadline, investigate.deadline);

    const missingEnvironment = environmentFor('W-004');
    const missingSnapshot: any = missingEnvironment.snapshot();
    const missingEvidence = missingEnvironment.evidenceRequests!(investigate as any).map(request => missingEnvironment.getEvidence(request));
    const missingContext = { ...investigateContext, snapshot: missingSnapshot, evidence: missingEvidence, question: investigate };
    const blockedNoAction = {
        kind: 'decision', chosenOptionId: 'no-action', status: 'blocked',
        alternatives: [{ id: 'no-action', expectedBenefit: usd(0), cost: usd(0), contribution: usd(0), evidenceIds: [] }],
        rationale: 'The permitted current cost source returned no qualified cost, so delivery remains blocked.',
        assumptions: [], reversalConditions: [],
        experiment: { ...experiment, exclusions: [], branches: [] },
        draft: { kind: 'support_artifact', artifact },
    };
    validateWorkflowOutput('decide', blockedNoAction, missingContext);
    assert.equal(missingEnvironment.validateDecision(missingSnapshot, missingEvidence, blockedNoAction as any).ok, true);
});

test('the exact provider body carries context-bound enums and local validation rejects schema-only cross-field mistakes', () => {
    const { snapshot, evidenceDeadline, investigate, investigateContext, evidence } = evidenceContext();
    const context: any = { ...investigateContext, evidence, question: investigate };
    const request: ModelRequest = {
        scope: { tenantId: 'workflow-lab', businessId: 'workflow-comparison', runId: 'W-001-single', dataPolicyVersion: 'lab-policy-v1', mode: 'fixture' },
        requestId: 'W-001-single-decide',
        role: { id: 'workflow-owner', version: 'workflow-role-v1', procedure: 'Return only the stage contract.', competencies: ['support_playbook'], tools: ['lab.evidence'], predecessor: null, model: 'gpt-6-astra', qualification: 'experimental_unqualified' },
        task: 'decide', context, limits: { maxCost: usd(52), maxAttempts: 1, maxHumanMinutes: 10 }, tools: [{ id: 'lab.evidence' }],
    };
    assert.equal(route.model, 'gpt-6-astra');
    assert.equal(route.reasoningEffort, 'high');
    assert.equal(route.pricing.inputMinorPerMillion, 1250);
    assert.equal(route.pricing.outputMinorPerMillion, 5000);
    const stageContexts: Record<ModelRequest['task'], any> = {
        investigate: investigateContext,
        decide: context,
        operate: { ...context, decision: { status: 'proposed' } },
        verify: { ...context, receipt: { status: 'confirmed', externalReceiptId: 'FX-known', payloadHash: 'hash-known', effectCount: 1 } },
    };
    const transmitted: Record<string, any> = {};
    for (const task of ['investigate', 'decide', 'operate', 'verify'] as const) {
        const stageRequest = { ...request, requestId: `W-001-single-${task}`, task, context: stageContexts[task] };
        const stageSchema = schemaForTask(task, stageContexts[task]);
        const body: any = buildResponsesBody(route, stageRequest, stageSchema);
        assert.deepEqual(body.text.format.schema, stageSchema);
        assert.equal(JSON.parse(body.input).context.evidenceDeadline, evidenceDeadline);
        transmitted[task] = body.text.format.schema;
    }
    const schema = transmitted.decide;
    assert.deepEqual(transmitted.investigate.properties.deadline.enum, [evidenceDeadline]);
    assert.deepEqual(transmitted.investigate.properties.maxCost.properties.minorUnits.enum, [0]);
    assert.deepEqual(schema.properties.alternatives.items.properties.id.enum, ['high-touch-outreach', 'limited-playbook', 'no-action']);
    assert.deepEqual(schema.properties.alternatives.items.properties.evidenceIds.items.enum, ['evidence-cost-high-touch', 'evidence-cost-playbook']);
    assert.equal(schema.properties.alternatives.minItems, 3);
    assert.equal(schema.properties.alternatives.maxItems, 3);
    assert.deepEqual(schema.properties.draft.properties.artifact.properties.policyVersion.enum, ['support-policy-v2']);
    assert.deepEqual(transmitted.operate.properties.artifact.properties.answers.items.properties.topic.enum, ['billing-status', 'payment-timing']);

    const noActionOnly = {
        kind: 'decision', chosenOptionId: 'no-action', status: 'blocked',
        alternatives: [{ id: 'no-action', expectedBenefit: usd(1), cost: usd(0), contribution: usd(1), evidenceIds: [] }],
        rationale: 'Blocked.', assumptions: [], reversalConditions: [], experiment, draft: { kind: 'support_artifact', artifact },
    };
    assert.throws(() => validateWorkflowOutput('decide', noActionOnly), /WORKFLOW_NO_ACTION_INVALID/);

    const verifyContext = stageContexts.verify;
    assert.deepEqual(schemaForTask('verify', verifyContext).properties.evidenceIds.items.enum, ['evidence-cost-high-touch', 'evidence-cost-playbook', 'evidence-policy-v2', 'FX-known', 'hash-known']);
    assert.throws(() => validateWorkflowOutput('verify', { kind: 'inspection', status: 'pass', findings: ['Looks correct.'], evidenceIds: ['hash-known'] }, verifyContext), /WORKFLOW_RECEIPT_REF_REQUIRED/);
    assert.equal(snapshot.taskBrief.stageContracts.decide.includes('For no-action, benefit, cost, and contribution are all exactly 0'), true);
});

test('workflow context v3 preserves required facts once and removes repeated generated bodies', () => {
    const { snapshot, evidence, investigate } = evidenceContext();
    const initialArtifact = { ...structuredClone(artifact), title: 'INITIAL-DRAFT-SENTINEL' };
    const approvedArtifact = { ...structuredClone(artifact), title: 'APPROVED-ARTIFACT-SENTINEL' };
    const observedArtifact = { ...structuredClone(artifact), title: 'OBSERVED-ARTIFACT-SENTINEL' };
    const decision = {
        kind: 'decision', chosenOptionId: 'limited-playbook', status: 'proposed', alternatives: [],
        rationale: 'DECISION-RATIONALE-SENTINEL', assumptions: [], reversalConditions: [], experiment,
        draft: { kind: 'support_artifact', artifact: initialArtifact },
    };
    const run: any = {
        snapshot, evidence, question: { ...investigate, decision: 'QUESTION-BODY-SENTINEL' }, decision,
        proposal: { payload: { artifact: approvedArtifact } }, createdAt: '2026-09-11T20:00:00.000Z',
    };
    const observed = {
        status: 'confirmed', externalReceiptId: 'FX-context-v3', payloadHash: 'context-v3-hash', effectCount: 1,
        artifact: observedArtifact, ledger: { obligations: usd(0) }, actualCost: { status: 'known', money: usd(25), basis: 'fixture' },
    };
    const priorReview = {
        kind: 'support_artifact', artifact: { ...structuredClone(artifact), title: 'REVIEW-ARTIFACT-MUST-NOT-REPEAT' },
        review: { issues: ['Reviewed the supplied draft.'], changes: ['Corrected conditional timing.'], verdict: 'ready' },
    };

    const investigateContext: any = buildWorkflowContext(run, 'investigate', undefined, null);
    assert.equal(investigateContext.contextVersion, 'workflow-context-v3');
    assert.equal(investigateContext.evidenceDeadline, '2026-09-12T20:00:00.000Z');
    assert.equal(Object.hasOwn(investigateContext, 'question'), false);
    assert.equal(Object.hasOwn(investigateContext, 'decision'), false);
    assert.equal(Object.hasOwn(investigateContext, 'draft'), false);

    const decideContext: any = buildWorkflowContext(run, 'decide', undefined, null);
    assert.equal(decideContext.question.decision, 'QUESTION-BODY-SENTINEL');
    assert.equal(Object.hasOwn(decideContext, 'decision'), false);
    for (const response of decideContext.evidence) {
        assert.deepEqual(Object.keys(response.requested).sort(), ['deadline', 'maxCost', 'source', 'variable']);
        assert.equal(response.requested.deadline, investigate.deadline);
        assert.equal(Object.hasOwn(response.requested, 'decision'), false);
        assert.equal(Object.hasOwn(response.requested, 'branches'), false);
        assert.equal(Object.hasOwn(response.requested, 'plausibleRange'), false);
    }

    const operateContext: any = buildWorkflowContext(run, 'operate', undefined, null);
    assert.equal(operateContext.question.decision, 'QUESTION-BODY-SENTINEL');
    assert.equal(operateContext.decision.rationale, 'DECISION-RATIONALE-SENTINEL');
    assert.equal(Object.hasOwn(operateContext.decision, 'draft'), false);
    assert.equal(operateContext.draft.artifact.title, 'INITIAL-DRAFT-SENTINEL');
    assert.equal(JSON.stringify(operateContext).split('INITIAL-DRAFT-SENTINEL').length - 1, 1);
    assert.equal(JSON.stringify(operateContext).split('QUESTION-BODY-SENTINEL').length - 1, 1);

    const verifyContext: any = buildWorkflowContext(run, 'verify', observed, priorReview);
    assert.equal(Object.hasOwn(verifyContext, 'question'), false);
    assert.equal(Object.hasOwn(verifyContext, 'draft'), false);
    assert.equal(Object.hasOwn(verifyContext.decision, 'draft'), false);
    assert.equal(verifyContext.decision.rationale, 'DECISION-RATIONALE-SENTINEL');
    assert.equal(verifyContext.artifact.title, 'OBSERVED-ARTIFACT-SENTINEL');
    assert.equal(verifyContext.approvedArtifact.title, 'APPROVED-ARTIFACT-SENTINEL');
    assert.equal(Object.hasOwn(verifyContext.observation, 'artifact'), false);
    assert.deepEqual(verifyContext.prepublicationReview, priorReview.review);
    assert.equal(Object.hasOwn(verifyContext.prepublicationReview, 'artifact'), false);
    assert.equal(JSON.stringify(verifyContext).includes('INITIAL-DRAFT-SENTINEL'), false);
    assert.equal(JSON.stringify(verifyContext).includes('QUESTION-BODY-SENTINEL'), false);
    assert.equal(JSON.stringify(verifyContext).includes('REVIEW-ARTIFACT-MUST-NOT-REPEAT'), false);
    assert.equal(verifyContext.receipt.externalReceiptId, observed.externalReceiptId);
    assert.deepEqual(verifyContext.obligations, usd(0));
});
