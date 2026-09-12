import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATING_FILE_CONTRACT, checkOperatingPacket, renderOperatingPacket } from '../src/portfolio/operating-profile.ts';

const artifactHash = 'a'.repeat(64);
const packet = () => ({
  title: 'A retained generic report',
  observations: [{ id: 'finding-1', statement: 'An exact source statement', quote: 'The workflow is manual.', sourceId: 'source-1' }],
  unknowns: ['The commercial value remains unknown.'],
  obligations: [
    { id: 'owner-review', description: 'Review the exact local product and next action.', owner: 'Venture owner', status: 'open' },
    { id: 'delivery-ack', description: 'Record whether the intended user received the deliverable.', owner: 'Delivery lead', status: 'open' }
  ],
  operating: {
    version: 'operating-deliverable-v1',
    reviewedProduct: { artifactHash },
    recommendation: { decision: 'revise', rationale: 'The retained source supports a workflow issue but not a paid outcome.' },
    trySteps: [{ action: 'Use the local product for one controlled workflow.', expected: 'Record completion and correction needs; stop if the workflow cannot be completed.' }],
    advantage: { statement: 'The product may make the current manual handoff easier to inspect.', substitutes: ['Current manual handoff', 'No change'] },
    contraryEvidence: ['No customer has stated that the handoff is costly.'],
    unresolvedAssumptions: ['The workflow occurs often enough to matter.'],
    demo: { summary: 'Tool observation: persistence and CSV checks passed on the reviewed artifact in the controlled fixture; no independent human review or customer acceptance is established.', steps: ['Create a sample record.', 'Confirm it survives a refresh.'] },
    nextObservation: { route: 'Record a controlled-use note in the owner workspace.', record: 'Completion, correction, and uncertainty.', decisionRule: 'Continue only if the observed workflow is useful; otherwise revise or stop.' },
    interviewQuestions: ['What currently makes this handoff difficult?', 'What would make this not worth changing?'],
    acquisitionDraft: { status: 'unsent', subject: 'A question about your current handoff', body: 'Could we understand the current handoff? This is a draft only.' },
    economics: {
      acquisition: { status: 'unknown', detail: 'Access effort is unknown.' },
      delivery: { status: 'assumption', detail: 'A bounded local walkthrough may be sufficient.' },
      correction: { status: 'unknown', detail: 'Correction effort is unknown.' },
      founderEffort: { status: 'assumption', detail: 'Time will be recorded before any comparison.' }
    },
    nextTasks: [
      { id: 'inspect', title: 'Inspect the controlled workflow', dependsOn: [], acceptance: ['A retained observation describes the result and its limit.'] },
      { id: 'decide', title: 'Choose continue, revise, or stop', dependsOn: ['inspect'], acceptance: ['The decision cites the retained observation.'] }
    ],
    evidence: { findingIds: ['finding-1'], sourceIds: ['source-1'], verification: 'source_linked' }
  }
});

test('operating profile accepts a complete bounded extension and binds the controller hash', () => {
  const checks = checkOperatingPacket(packet(), artifactHash);
  assert.equal(OPERATING_FILE_CONTRACT.version, 'operating-deliverable-v1');
  assert.equal(checks.every(check => check.passed), true, checks.filter(check => !check.passed).map(check => check.id).join(', '));
  assert.equal(checkOperatingPacket(packet(), 'b'.repeat(64)).find(check => check.id === 'operating.reviewed_artifact')?.passed, false);
});

test('operating profile rejects unsafe claims of economic certainty and bad dependency bindings', () => {
  const report = packet();
  report.operating.economics.acquisition.status = 'observed';
  report.operating.nextTasks[1].dependsOn = ['missing-task'];
  const checks = checkOperatingPacket(report, artifactHash);
  assert.equal(checks.find(check => check.id === 'operating.economics_limits')?.passed, false);
  assert.equal(checks.find(check => check.id === 'operating.next_tasks')?.passed, false);
});

test('operating packet renderer safely includes every required operating section', () => {
  const report = packet();
  report.operating.acquisitionDraft.body = '<img src=x onerror="window.pwned=true"> Draft remains unsent.';
  const html = renderOperatingPacket(report);
  for (const heading of ['Reviewed product', 'Recommendation', 'How to try it', 'Advantage and substitutes', 'Strongest contrary evidence', 'Unresolved assumptions', 'Observed checks', 'Short demo', 'Next user observation', 'Interview questions', 'Unsent acquisition draft', 'Economics and founder effort', 'Remaining obligations', 'Next tasks', 'Evidence connection', 'Supporting findings retained from the base report']) assert.match(html, new RegExp(heading));
  assert.match(html, /&lt;img src=x onerror=/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, new RegExp(artifactHash));
});

test('operating rendering preserves check provenance, missing evidence and every owned obligation', () => {
  const report = packet();
  report.operating.unresolvedAssumptions = ['Owner acceptance and independent correction time remain unobserved.'];
  report.obligations[1].owner = '<script>unsafe owner text</script>';
  report.obligations[1].description = 'Confirm receipt & record the result.';
  const before = structuredClone(report);
  const html = renderOperatingPacket(report);
  assert.match(html, /Observed checks<\/h2>[\s\S]*Tool observation: persistence and CSV checks passed/);
  assert.match(html, /no independent human review or customer acceptance is established/);
  assert.match(html, /Unresolved assumptions and missing evidence<\/h2>[\s\S]*Owner acceptance and independent correction time remain unobserved/);
  assert.match(html, /Responsible owner:<\/strong> Venture owner/);
  assert.match(html, /Status:<\/strong> open/);
  assert.match(html, /Obligation: owner-review/);
  assert.match(html, /Obligation: delivery-ack/);
  assert.match(html, /Confirm receipt &amp; record the result/);
  assert.match(html, /&lt;script&gt;unsafe owner text&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>unsafe owner text/);
  assert.match(html, /The workflow is manual/);
  assert.match(html, /finding-1/);
  assert.match(html, /source-1/);
  assert.deepEqual(report, before);
  const { obligations: omitted, ...withoutObligations } = report;
  assert.match(renderOperatingPacket(withoutObligations), /No base-report obligations were supplied; this does not establish that all obligations are complete/);
});

test('operating profile rejects a dependency cycle even when all task IDs are known', () => {
  const report = packet();
  report.operating.nextTasks[0].dependsOn = ['decide'];
  const check = checkOperatingPacket(report, artifactHash).find(check => check.id === 'operating.next_tasks');
  assert.equal(check?.passed, false);
  assert.match(check?.summary ?? '', /acyclic/);
  report.operating.nextTasks[0].dependsOn = [];
  assert.equal(checkOperatingPacket(report, artifactHash).find(check => check.id === 'operating.next_tasks')?.passed, true);
});

test('operating renderer uses only optional controller-supplied local product links', () => {
  const metadata = { title: '<img src=x onerror=alert(1)>', previewUrl: '/preview?ventureId=quote-desk&taskId=quote-desk%2Freview-v4', downloadUrl: '/api/delivery?ventureId=quote-desk&taskId=quote-desk%2Freview-v4' };
  const html = renderOperatingPacket(packet(), metadata);
  assert.match(html, /Try reviewed product/);
  assert.match(html, /Download reviewed source/);
  assert.match(html, /href="\/preview\?ventureId=quote-desk&amp;taskId=/);
  assert.match(html, /href="\/api\/delivery\?ventureId=quote-desk&amp;taskId=/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(renderOperatingPacket(packet()), /href=/);
  for (const invalid of ['https://example.com/preview?ventureId=v&taskId=t', '//example.com/preview?ventureId=v&taskId=t', '/preview/../elsewhere?ventureId=v&taskId=t', '/preview?ventureId=v&taskId=t#fragment', '/preview?ventureId=v', '/preview?ventureId=v&taskId=t\\escape']) {
    assert.throws(() => renderOperatingPacket(packet(), { ...metadata, previewUrl: invalid }), /OPERATING_PRODUCT_LINK_INVALID/);
  }
  assert.throws(() => renderOperatingPacket(packet(), { ...metadata, downloadUrl: metadata.previewUrl }), /OPERATING_PRODUCT_LINK_INVALID/);
});
