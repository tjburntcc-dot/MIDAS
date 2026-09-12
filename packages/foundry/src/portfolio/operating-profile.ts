/**
 * A reviewable operating package is an extension of an existing report, not a
 * replacement report type. Controllers bind it to the one reviewed artifact
 * they selected and pass that hash to the checker. This module has no model,
 * provider, persistence, preview, or external-execution capability.
 */
import type { Check } from './products.ts';

export const OPERATING_FILE_CONTRACT = {
  version: 'operating-deliverable-v1',
  completeReportUTF8ByteLimit: 9000,
  description: 'Add an operating field to the existing generic report. Keep its original findings, source references and verification information; do not replace the report with this profile.',
  baseReport: {
    required: 'A JSON object retaining at least one existing report field such as title, findings, observations, recommendation, or unknowns.',
    evidenceBinding: 'operating.evidence.findingIds and sourceIds point to retained report findings and source references when those identifiers exist.',
    obligations: 'Retain existing obligations with id, description, responsible owner and status; the readable packet renders them without implying they are completed.'
  },
  operating: {
    version: 'operating-deliverable-v1',
    reviewedProduct: {
      artifactHash: 'Exact authoritative artifact hash supplied by the controller. Do not invent a product name, version, customer, or acceptance result here.'
    },
    recommendation: {
      decision: ['continue', 'revise', 'stop'],
      rationale: 'Nonempty explanation of why this decision follows from the retained report and its limits.'
    },
    trySteps: [{ action: 'Concrete owner or controlled-user step', expected: 'Observable result or stop condition' }],
    advantage: {
      statement: 'What the reviewed product may do better, stated with its limit.',
      substitutes: ['Named alternative, current manual process, or no-change option']
    },
    contraryEvidence: ['Strongest fact, source statement, or result that cuts against the recommendation'],
    unresolvedAssumptions: ['Missing evidence, untested behavior or material assumption; distinguish each from observed checks. Include unknown owner/customer acceptance and independent correction time where unobserved.'],
    demo: { summary: 'Compact observed-check summary for the exact reviewed artifact: name the checks actually run, their results and provenance. Label tool/DOM observations separately from source assertions; do not claim model vision, customer acceptance or independent human review. This renders under Observed checks.', steps: ['Short demonstration step; proposed use is not an observed result'] },
    nextObservation: { route: 'Where or how the next observation is recorded', record: 'What is recorded', decisionRule: 'How the observation changes continue, revise, or stop' },
    interviewQuestions: ['Specific question that could disconfirm or qualify the proposition'],
    acquisitionDraft: { status: 'unsent', subject: 'Exact draft subject', body: 'Exact draft body; rendering this field never sends it.' },
    economics: {
      acquisition: { status: ['assumption', 'unknown'], detail: 'Explicit assumption or unknown; not a claimed sale.' },
      delivery: { status: ['assumption', 'unknown'], detail: 'Explicit assumption or unknown; not a claimed sale.' },
      correction: { status: ['assumption', 'unknown'], detail: 'Explicit assumption or unknown; not a claimed sale.' },
      founderEffort: { status: ['assumption', 'unknown'], detail: 'Explicit assumption or unknown; not a claimed sale.' }
    },
    nextTasks: [{ id: 'Unique task identifier <=100 characters', title: 'Concrete next task', dependsOn: ['Other nextTasks IDs only; the dependency graph must be acyclic'], acceptance: ['Observable acceptance condition'] }],
    evidence: { findingIds: ['Retained base-report finding ID'], sourceIds: ['Retained source ID'], verification: ['source_linked', 'review_required', 'owner_reported'] }
  },
  bounds: {
    textCharacters: [1, 12000],
    trySteps: [1, 12],
    substitutes: [1, 12],
    contraryEvidence: [1, 12],
    unresolvedAssumptions: [1, 16],
    demoSteps: [1, 8],
    interviewQuestions: [1, 12],
    nextTasks: [1, 16],
    taskDependencies: [0, 12],
    taskAcceptance: [1, 12],
    evidenceReferences: [1, 50]
  },
  rules: [
    'Keep the entire brief.json, including base report and this extension, within 9000 UTF-8 bytes. Use concise substantive sections; source + report + full relevant browser handoff must fit the 72000-byte context cap. The provider still admits at most 32768 input tokens for the complete request.',
    'The controller supplies the authoritative reviewed artifact hash; a report cannot choose or alter it.',
    'Place the actual check-result summary in operating.demo.summary and missing evidence in operating.unresolvedAssumptions; these existing fields are rendered explicitly. Do not put required content in an additional checkResults field that the renderer does not display.',
    'Economics lines are only assumptions or unknowns. Do not record a sale, revenue, profit, customer acceptance, or provider billing as established by this package.',
    'The acquisition draft stays unsent. This profile neither selects a recipient nor executes communication.',
    'A passed structural check validates completeness and bindings, not product quality, semantic review, buyer demand, economics, or worker advantage.'
  ]
} as const;

type RecordValue = Record<string, any>;
const isRecord = (value: any): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value: any): any[] => Array.isArray(value) ? value : [];
const nonemptyText = (value: any, maximum = 12_000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const within = (value: any, minimum: number, maximum: number): boolean => Array.isArray(value) && value.length >= minimum && value.length <= maximum;
const plainList = (value: any, minimum: number, maximum: number, textMaximum = 12_000): boolean => within(value, minimum, maximum) && value.every((item: unknown) => nonemptyText(item, textMaximum));
const escapeHtml = (value: any): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const enumValue = (value: any, allowed: readonly string[]): boolean => typeof value === 'string' && allowed.includes(value);

function operating(report: any): RecordValue | null {
  return isRecord(report) && isRecord(report.operating) ? report.operating : null;
}

function knownFindingIds(report: any): Set<string> {
  const rows = [...list(report?.observations), ...list(report?.findings)];
  return new Set(rows.filter(isRecord).map(item => item.id).filter((id): id is string => nonemptyText(id, 100)));
}

function knownSourceIds(report: any): Set<string> {
  const evidenceRows = [...list(report?.observations), ...list(report?.findings)];
  const ids = evidenceRows.flatMap(item => {
    if (!isRecord(item)) return [];
    return [item.sourceId, ...list(item.sourceIds)];
  }).concat(list(report?.sources).filter(isRecord).map(item => item.id));
  return new Set(ids.filter((id): id is string => nonemptyText(id, 200)));
}

function result(id: string, passed: boolean, summary: string, evidence?: unknown): Check {
  return { id, passed, required: true, summary, ...(evidence === undefined ? {} : { evidence }) };
}

/** Checks only the versioned operating extension and its explicit controller binding. */
export function checkOperatingPacket(report: any, expectedArtifactHash: string): Check[] {
  const checks: Check[] = [];
  const base = isRecord(report) && ['title', 'findings', 'observations', 'recommendation', 'unknowns'].some(key => key in report);
  checks.push(result('operating.base_report', base, base ? 'The generic report remains present alongside the operating extension.' : 'Retain the existing generic report and add the operating field to it.'));

  const packet = operating(report);
  const profile = packet?.version === OPERATING_FILE_CONTRACT.version;
  checks.push(result('operating.profile', Boolean(profile), profile ? 'The operating deliverable uses the supported versioned profile.' : `Set operating.version to ${OPERATING_FILE_CONTRACT.version}.`));

  const expected = typeof expectedArtifactHash === 'string' && /^[a-f0-9]{64}$/.test(expectedArtifactHash);
  const reviewedProduct = packet?.reviewedProduct;
  const productBinding = expected && isRecord(reviewedProduct) && Object.keys(reviewedProduct).length === 1 && reviewedProduct.artifactHash === expectedArtifactHash;
  checks.push(result('operating.reviewed_artifact', Boolean(productBinding), productBinding ? 'The packet is bound to the controller-selected authoritative artifact.' : 'The reviewed product must contain only the exact authoritative artifact hash supplied by the controller; do not add invented metadata.'));

  const recommendation = packet?.recommendation;
  const recommendationValid = isRecord(recommendation) && enumValue(recommendation.decision, OPERATING_FILE_CONTRACT.operating.recommendation.decision) && nonemptyText(recommendation.rationale);
  checks.push(result('operating.recommendation', recommendationValid, recommendationValid ? 'Continue, revise, or stop is explicit with a rationale.' : 'Provide recommendation.decision (continue, revise, or stop) and a nonempty rationale.'));

  const trySteps = list(packet?.trySteps);
  const tryStepsValid = within(trySteps, 1, 12) && trySteps.every(step => isRecord(step) && nonemptyText(step.action) && nonemptyText(step.expected));
  checks.push(result('operating.try_steps', tryStepsValid, tryStepsValid ? 'Concrete try steps include an observable result or stop condition.' : 'Provide 1–12 try steps with action and expected result or stop condition.'));

  const advantage = packet?.advantage;
  const advantageValid = isRecord(advantage) && nonemptyText(advantage.statement) && plainList(advantage.substitutes, 1, 12);
  checks.push(result('operating.advantage_and_substitutes', advantageValid, advantageValid ? 'The proposed advantage is compared with named substitutes.' : 'Provide a bounded advantage statement and 1–12 substitutes or no-change alternatives.'));

  const contraryValid = plainList(packet?.contraryEvidence, 1, 12);
  checks.push(result('operating.contrary_evidence', contraryValid, contraryValid ? 'The strongest contrary evidence is retained.' : 'Provide 1–12 items of strongest contrary evidence.'));
  const assumptionsValid = plainList(packet?.unresolvedAssumptions, 1, 16);
  checks.push(result('operating.unresolved_assumptions', assumptionsValid, assumptionsValid ? 'Material unresolved assumptions remain explicit.' : 'Provide 1–16 unresolved assumptions or unknowns.'));

  const demo = packet?.demo;
  const demoValid = isRecord(demo) && nonemptyText(demo.summary) && plainList(demo.steps, 1, 8);
  checks.push(result('operating.demo', demoValid, demoValid ? 'An observed-check summary and bounded demo steps are present; factual support still requires the retained tool evidence.' : 'Provide demo.summary with actual check results and provenance, plus 1–8 proposed demo steps.'));

  const observation = packet?.nextObservation;
  const observationValid = isRecord(observation) && nonemptyText(observation.route) && nonemptyText(observation.record) && nonemptyText(observation.decisionRule);
  checks.push(result('operating.next_observation', observationValid, observationValid ? 'The next user observation has a route, record, and decision rule.' : 'Provide nextObservation.route, record, and decisionRule.'));
  const interviewValid = plainList(packet?.interviewQuestions, 1, 12);
  checks.push(result('operating.interview_questions', interviewValid, interviewValid ? 'The package includes questions that can qualify or disconfirm the proposition.' : 'Provide 1–12 specific interview questions.'));

  const acquisition = packet?.acquisitionDraft;
  const acquisitionValid = isRecord(acquisition) && acquisition.status === 'unsent' && nonemptyText(acquisition.subject, 500) && nonemptyText(acquisition.body);
  checks.push(result('operating.unsent_acquisition', acquisitionValid, acquisitionValid ? 'An exact acquisition subject and body are retained as unsent preparation.' : 'Provide an unsent acquisitionDraft with nonempty subject and body.'));

  const economics = packet?.economics;
  const economicsKeys = ['acquisition', 'delivery', 'correction', 'founderEffort'];
  const economicsValid = isRecord(economics) && Object.keys(economics).every(key => economicsKeys.includes(key)) && economicsKeys.every(key => isRecord(economics[key]) && enumValue(economics[key].status, ['assumption', 'unknown']) && nonemptyText(economics[key].detail));
  checks.push(result('operating.economics_limits', economicsValid, economicsValid ? 'Acquisition, delivery, correction, and founder effort are explicitly assumptions or unknowns.' : 'Provide only assumption or unknown economics lines for acquisition, delivery, correction, and founder effort; do not add sales or revenue claims.'));

  const tasks = list(packet?.nextTasks);
  const taskIds = tasks.map(item => item?.id);
  const taskIdsUnique = new Set(taskIds).size === taskIds.length;
  const nextTasksValid = within(tasks, 1, 16) && taskIdsUnique && tasks.every(item => isRecord(item) && nonemptyText(item.id, 100) && nonemptyText(item.title) && plainList(item.dependsOn, 0, 12, 100) && plainList(item.acceptance, 1, 12));
  const dependencyIdsKnown = nextTasksValid && tasks.every(item => item.dependsOn.every((dependency: string) => taskIds.includes(dependency) && dependency !== item.id));
  const pending = new Set(taskIds);
  if (dependencyIdsKnown) {
    let progressed = true;
    while (pending.size && progressed) {
      progressed = false;
      for (const task of tasks) if (pending.has(task.id) && task.dependsOn.every((dependency: string) => !pending.has(dependency))) {
        pending.delete(task.id);
        progressed = true;
      }
    }
  }
  const nextTasksExecutable = nextTasksValid && dependencyIdsKnown && pending.size === 0;
  checks.push(result('operating.next_tasks', Boolean(nextTasksExecutable), nextTasksExecutable ? 'Next tasks have unique IDs, acyclic internal dependencies, and observable acceptance criteria.' : 'Provide 1–16 uniquely identified next tasks with acyclic internal dependencies and at least one acceptance criterion each.'));

  const evidence = packet?.evidence;
  const evidenceShape = isRecord(evidence) && plainList(evidence.findingIds, 1, 50, 200) && plainList(evidence.sourceIds, 1, 50, 200) && enumValue(evidence.verification, ['source_linked', 'review_required', 'owner_reported']);
  const findingIds = knownFindingIds(report), sourceIds = knownSourceIds(report);
  const referencesKnown = evidenceShape && (!findingIds.size || evidence.findingIds.every((id: string) => findingIds.has(id))) && (!sourceIds.size || evidence.sourceIds.every((id: string) => sourceIds.has(id)));
  checks.push(result('operating.evidence_binding', Boolean(referencesKnown), referencesKnown ? 'Operating evidence references are present and match retained report IDs where available.' : 'Provide nonempty evidence finding/source references and use retained report IDs when the base report exposes them.', { findingIds: [...findingIds], sourceIds: [...sourceIds] }));
  return checks;
}

const displayText = (value: any, fallback = 'Not supplied'): string => nonemptyText(value) ? value : fallback;
const renderList = (items: any[], render: (item: any) => string, empty = '<li>Not supplied</li>'): string => `<ul>${items.length ? items.map(render).join('') : empty}</ul>`;
const baseFindings = (report: any): any[] => [...list(report?.observations), ...list(report?.findings)].filter(isRecord);

export type OperatingProductMetadata = { title: string; previewUrl: string; downloadUrl: string };
function productLink(value: string, path: '/preview' | '/api/delivery'): string {
  if (typeof value !== 'string' || !value.startsWith(path + '?') || value.includes('//') || /[\s\\#]/.test(value)) throw Error('OPERATING_PRODUCT_LINK_INVALID');
  const url = new URL(value, 'http://midas.local');
  if (url.origin !== 'http://midas.local' || url.pathname !== path || !url.searchParams.get('ventureId') || !url.searchParams.get('taskId')) throw Error('OPERATING_PRODUCT_LINK_INVALID');
  return escapeHtml(value);
}

/** Safely renders an operating packet as standalone, readable static HTML. */
export function renderOperatingPacket(report: any, metadata?: OperatingProductMetadata): string {
  const packet = operating(report) || {};
  const e = escapeHtml;
  const findings = baseFindings(report);
  const obligations = list(report?.obligations).filter(isRecord);
  const recommendation = isRecord(packet.recommendation) ? packet.recommendation : {};
  const product = isRecord(packet.reviewedProduct) ? packet.reviewedProduct : {};
  const productLinks = metadata ? `<br><strong>${e(displayText(metadata.title, 'Reviewed local product'))}</strong><br><a style="display:inline-block;margin:12px 10px 0 0;padding:10px 14px;background:#174e43;color:white;border-radius:6px;text-decoration:none" href="${productLink(metadata.previewUrl, '/preview')}">Try reviewed product</a><a style="display:inline-block;padding:10px 14px;border:1px solid #52715d;border-radius:6px;color:#174e43" href="${productLink(metadata.downloadUrl, '/api/delivery')}">Download reviewed source</a>` : '';
  const advantage = isRecord(packet.advantage) ? packet.advantage : {};
  const demo = isRecord(packet.demo) ? packet.demo : {};
  const observation = isRecord(packet.nextObservation) ? packet.nextObservation : {};
  const acquisition = isRecord(packet.acquisitionDraft) ? packet.acquisitionDraft : {};
  const economics = isRecord(packet.economics) ? packet.economics : {};
  const evidence = isRecord(packet.evidence) ? packet.evidence : {};
  const economicsRow = (label: string, item: any) => `<article><h3>${e(label)}</h3><p><strong>${e(displayText(item?.status, 'unknown'))}</strong> · ${e(displayText(item?.detail))}</p></article>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(displayText(report?.title, 'Operating deliverable'))}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#173932;background:#faf9f4;max-width:920px;margin:36px auto;padding:24px}h1{font-size:36px;line-height:1.16}h2{margin-top:38px;border-top:1px solid #d8e1d8;padding-top:22px}h3{font-size:15px;margin:0 0 7px}p{overflow-wrap:anywhere}article{background:#fff;border:1px solid #cfddd2;border-radius:10px;padding:17px 19px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.meta{color:#52665d;font-size:13px}.label{font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#52715d}.decision{display:inline-block;padding:5px 9px;border-radius:4px;background:#e7f1dd;color:#3e683e;font-weight:700}.draft{white-space:pre-wrap;background:#f5f7f1;border:1px solid #d9e3d7;border-radius:8px;padding:16px}.note{background:#f5f1e6;border-left:3px solid #b7a16c;padding:13px 15px}li{margin:7px 0}@media(max-width:650px){body{margin:0;padding:18px}.grid{grid-template-columns:1fr}h1{font-size:29px}}</style></head><body><p class="label">Versioned operating deliverable · ${e(displayText(packet.version, 'profile not supplied'))}</p><h1>${e(displayText(report?.title, 'Operating deliverable'))}</h1><p class="meta">This package is a bounded operating extension of the retained report. It does not establish customer acceptance, revenue, or provider billing.</p><section><h2>Reviewed product</h2><article><p class="label">Controller-authoritative artifact hash</p><p>${e(displayText(product.artifactHash))}${productLinks}</p></article></section><section><h2>Recommendation</h2><article><p><span class="decision">${e(displayText(recommendation.decision))}</span></p><p>${e(displayText(recommendation.rationale))}</p></article></section><section><h2>How to try it</h2>${renderList(list(packet.trySteps), step => `<li><strong>${e(displayText(step?.action))}</strong><br><span class="meta">Observe: ${e(displayText(step?.expected))}</span></li>`)}</section><section><h2>Advantage and substitutes</h2><article><p>${e(displayText(advantage.statement))}</p><p class="label">Substitutes or no-change options</p>${renderList(list(advantage.substitutes), item => `<li>${e(item)}</li>`)}</article></section><section class="grid"><div><h2>Strongest contrary evidence</h2>${renderList(list(packet.contraryEvidence), item => `<li>${e(item)}</li>`)}</div><div><h2>Unresolved assumptions and missing evidence</h2>${renderList(list(packet.unresolvedAssumptions), item => `<li>${e(item)}</li>`)}</div></section><section><h2>Observed checks</h2><article><p>${e(displayText(demo.summary))}</p><p class="meta">This summary refers to retained checks for the reviewed artifact. Tool and DOM observations do not establish independent human review or customer acceptance.</p></article></section><section><h2>Short demo</h2><article>${renderList(list(demo.steps), item => `<li>${e(item)}</li>`)}</article></section><section><h2>Next user observation</h2><article><p><strong>Route:</strong> ${e(displayText(observation.route))}</p><p><strong>Record:</strong> ${e(displayText(observation.record))}</p><p><strong>Decision rule:</strong> ${e(displayText(observation.decisionRule))}</p></article></section><section><h2>Interview questions</h2>${renderList(list(packet.interviewQuestions), item => `<li>${e(item)}</li>`)}</section><section><h2>Unsent acquisition draft</h2><article><p class="label">Status · ${e(displayText(acquisition.status, 'unsent'))}</p><p><strong>Subject:</strong> ${e(displayText(acquisition.subject))}</p><div class="draft">${e(displayText(acquisition.body))}</div><p class="note">This is preparation only. Rendering this draft does not select a recipient or send a message.</p></article></section><section><h2>Economics and founder effort</h2><p class="meta">Each line is deliberately an assumption or unknown. No sales, revenue, profit, customer acceptance, or provider billing is established here.</p><div class="grid">${economicsRow('Acquisition', economics.acquisition)}${economicsRow('Delivery', economics.delivery)}${economicsRow('Correction', economics.correction)}${economicsRow('Founder effort', economics.founderEffort)}</div></section><section><h2>Remaining obligations</h2>${obligations.length ? obligations.map(item => `<article><h3>${e(displayText(item.description))}</h3><p><strong>Responsible owner:</strong> ${e(displayText(item.owner))}<br><strong>Status:</strong> ${e(displayText(item.status))}</p><p class="meta">Obligation: ${e(displayText(item.id))}</p></article>`).join('') : '<p class="meta">No base-report obligations were supplied; this does not establish that all obligations are complete.</p>'}</section><section><h2>Next tasks</h2>${renderList(list(packet.nextTasks), item => `<li><strong>${e(displayText(item?.title))}</strong><br><span class="meta">ID: ${e(displayText(item?.id))} · Depends on: ${e(list(item?.dependsOn).join(', ') || 'None')}</span>${renderList(list(item?.acceptance), rule => `<li>${e(rule)}</li>`)}</li>`)}</section><section><h2>Evidence connection</h2><article><p><strong>Verification:</strong> ${e(displayText(evidence.verification))}</p><p><strong>Retained findings:</strong> ${e(list(evidence.findingIds).join(', ') || 'Not supplied')}</p><p><strong>Retained sources:</strong> ${e(list(evidence.sourceIds).join(', ') || 'Not supplied')}</p></article></section><section><h2>Supporting findings retained from the base report</h2>${findings.length ? findings.map(item => `<article><h3>${e(displayText(item.statement || item.title || item.id, 'Finding'))}</h3><p>${e(displayText(item.quote || item.text || item.summary))}</p><p class="meta">Finding: ${e(displayText(item.id))} · Source: ${e(displayText(item.sourceId || list(item.sourceIds).join(', ')))}</p></article>`).join('') : '<p class="meta">No retained base-report findings were supplied for rendering.</p>'}</section></body></html>`;
}
