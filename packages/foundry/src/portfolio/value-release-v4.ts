import { readFileSync } from 'node:fs';
import { requireThat } from '../contracts.ts';
import { Portfolio } from './core.ts';
import type { TaskSpec } from './contracts.ts';
import { EvidenceLibrary, publicUrl } from './evidence.ts';
import { ProcedureRegistry } from './learning.ts';
import { EXECUTIVE_PROCEDURE } from './planning.ts';
import { TOOL_NAMES, WORKER_PROCEDURE } from './worker.ts';
import { taskDefinitionHash } from './live.ts';
import type { FrozenTaskAllowance } from './live.ts';

export const VALUE_RELEASE_V4='value-release-v4';
export const valueReleaseV4Allocation=[['investigate-v4',8],['decide-v4',1],['build-v4',10],['review-product-v4',6],['operate-v4',6],['adapt-v4',1]] as const;
export const valueReleaseV4Budget={ordinaryWorkCalls:32,heldRecoveryCalls:2,workCalls:34,hostedSearchCalls:2,inferenceAdmissions:36,countAdmissions:36,countUncertaintyMinor:400,maximumExposureMinor:5182,currency:'USD',model:'gpt-6-astra',reasoningEffort:'max',maxOutputTokens:16384,inputTokenCeiling:32768,deadlineMs:180000,providerConcurrency:1,automaticRetries:0} as const;
export const valueReleaseV4Questions=[
 'Who would use this?',
 'What exact job would it improve?',
 'What do they use today?',
 'What specific advantage could justify switching?',
 'How could we reach them?',
 'Which assumptions are supported, contradicted or still unknown?',
 'What would building this prototype let us learn or accomplish?'
] as const;

type SourceBinding={id:string;sha256:string};
type CorpusSource={id:string;title:string;url:string;text:string;observedAt:string;publishedAt:string|null;rights:string;provenance:string;interpretation:string;excerptAttribution?:string;updatedAt?:string;dateNote?:string};
const corpusUrl=new URL('../../../../docs/foundry/031/research-v4/sources.json',import.meta.url);
const ventureId='quote-desk',population='owner-permitted-portfolio-jobs-v1';
const baselineId=(capability:string)=>'baseline-'+capability.replace('.','-')+'-v4';
const fundingHint='One action per response. Writing, reading, checking, publishing and completion each consume a worker decision. Reserve check.run, artifact.publish_local and complete after a write; a repair plus recheck needs two more decisions. Held recovery is separate, only for the signed known-incomplete protocol. Unused slots are not an instruction to spend.';

/** Pure task definitions. The exact selected source hashes enter the frozen task
 * definition; dependency retrieval is added by EvidenceLibrary.forTask(). */
export function valueReleaseV4Tasks(sourceBindings:SourceBinding[]):TaskSpec[]{
 requireThat(sourceBindings.length>0&&new Set(sourceBindings.map(s=>s.id)).size===sourceBindings.length&&sourceBindings.every(s=>typeof s.id==='string'&&s.id.length>0&&/^[a-f0-9]{64}$/.test(s.sha256)),'VALUE_RELEASE_SOURCE_BINDINGS');
 const local=TOOL_NAMES.filter(t=>!['research.search','research.fetch'].includes(t));
 const descendants=['build-v4','review-product-v4','operate-v4','adapt-v4'].map(id=>ventureId+'/'+id);
 const spec=(id:typeof valueReleaseV4Allocation[number][0],capability:string,title:string,objective:string,dependsOn:string[],extra:Record<string,unknown>={},acceptance:string[]=[]):TaskSpec=>({
  id,title,objective,lane:capability.startsWith('portfolio.')||capability==='research.investigate'?'research':'build',capability,dependsOn,
  acceptance:[...acceptance,'Preserve source support, actual artifact/check evidence and material uncertainty; do not infer buyer demand, revenue, labor savings or specialist superiority.','Complete only the current trusted profile checks and local delivery readback, or preserve a specific justified stop.'],
  allowedTools:capability.startsWith('portfolio.')?[]:capability==='research.investigate'?[...TOOL_NAMES]:[...local],
  requiredCompetencies:[capability==='quality.review'?'source-review':'evidence-grounded-work'],requiredChecks:[capability.startsWith('portfolio.')?'proposal.reference_checks':'delivery.current'],
  inputs:{release:VALUE_RELEASE_V4,requiresGrant:true,feedbackPolicy:'defer_to_declared_decision',sourceBindings:sourceBindings.map(s=>({...s})),procedureScope:{capability,population},baselineProcedureId:baselineId(capability),enforceHandoff:true,budgetGuidance:fundingHint,...extra},
  resource:{modelCalls:valueReleaseV4Allocation.find(a=>a[0]===id)![1]+2,localToolRuns:capability.startsWith('portfolio.')?0:12},maxAttempts:1
 });
 return [
  spec('investigate-v4','research.investigate','Investigate the user, job and value of a quote-to-job prototype',
   'Answer all seven questions using the supplied relevant excerpts and clearly attributed interpretation: '+valueReleaseV4Questions.map((q,i)=>(i+1)+'. '+q).join(' ')+' Compare a competent spreadsheet/calendar/accounting process and relevant existing products. Vendor documentation establishes advertised capabilities; public user reports are unverified examples, not prevalence or leads. Distinguish supported, contradicted and unknown assumptions, including founder access and effort. Use at most two hosted searches or permitted public fetches only when missing evidence could change the decision; there is no mandatory search/fetch ceremony. Produce a concise complete source-bound brief with alternatives and a concrete next action. A commercial prototype needs a defensible user/advantage hypothesis; a bounded engineering prototype may instead answer a named execution or product question without claiming demand. A supported profile alone is not a reason to build. Eight ordinary decisions include writing, checking, publishing and completion; allocate discovery and correction accordingly.',[],{},
   ['The seven investigation questions receive substantive answers or explicit evidence gaps.','Explain what the bounded prototype could establish and what remains outside its supported profile.']),
  spec('decide-v4','portfolio.plan','Decide whether this bounded build is worth its next admission',
   'Read the full actual investigation and its evidence. Include exactly one alternative named quote-to-job. Select prototype only when the declared quote-to-job-v2 local product can answer a consequential named question or accomplish useful bounded work. State whether the rationale is commercial or engineering. Missing buyer interviews alone do not prohibit an engineering experiment; the existence of a profile or a desire to consume the budget does not justify one. Compare the experiment with a competent development agent building the small product directly. If the valuable job needs unsupported approval snapshots, integrations, deployment or other features, record the gap; do not silently substitute another product into this grant. A decision other than prototype causes the controller to cancel build-v4, review-product-v4, operate-v4 and adapt-v4 without paid admissions to them. Explain alternatives, assumptions and next action. Newly proposed tasks may be retained in the backlog but this six-task grant cannot execute them. One structured planning response is available.',
   ['investigate-v4'],{prototypeGate:{alternativeName:'quote-to-job',cancelUnlessPrototype:descendants}},
   ['A specific commercial or engineering rationale supports the bounded prototype, or the dependent build is explicitly stopped.']),
  spec('build-v4','software.build','Build a useful local quote-to-job product from blank source',
   'Use the actual decision and the visible quote-to-job-v2 profile to author your own self-contained app.html from the blank workspace. Do not copy the development-assistant reference/demo or imply its authorship is yours. The product should explain its purpose to a first-time operator, accept real customer/work details, validate prices and quantities, save/reopen/edit without losing records, track job states, recover after reload and export faithful CSV. Follow all visible persistence, selector, money, layout and source-size rules. Use the actual check.run rendered-text/control/geometry/error observations to diagnose consequential failures; they are DOM evidence, not model vision. Correct only observed or substantiated problems and rerun unchanged checks. Publish locally after acceptance; no deployment, sending, payments or arbitrary backend. Ten ordinary decisions include writing, any tests/repairs, publication and completion. Current source/hash is available in context; avoid redundant reads.',
   ['decide-v4'],{executionProfile:'quote-to-job-v2'},
   ['The complete worker-visible quote-to-job-v2 journey passes, including invalid-input handling, reopen/edit, multiple saved records, persistence, CSV and narrow layout.','A first-time owner can understand and use the local product without mission documentation.']),
  spec('review-product-v4','quality.review','Review the actual product and retain or correct it with evidence',
   'Inspect the actual copied app.html, exact upstream delivery/readback, revision history and bounded browser/DOM check observations. Review the user job, arithmetic and money parsing, full quote persistence, reopen/edit, job transitions, invalid/error feedback, first-use clarity and narrow layout against quote-to-job-v2. Use check.run for current rendered observations; screenshot retention alone is not vision review. Correct substantive defects in the authoritative source and rerun checks, or retain an adequate implementation unchanged. Do not invent a flaw or force a revision. Publish the checked authoritative result and explain actual changes and remaining limits. This is strong ordinary baseline self-review, not an independent human or specialist comparison. Six ordinary decisions include optional reading/correction, checks, publication and completion; use source already present in context.',
   ['build-v4'],{executionProfile:'quote-to-job-v2'},
   ['The actual authoritative product is reviewed against its visible contract; any claimed change is backed by preserved source and observed checks.']),
  spec('operate-v4','service.brief','Deliver the reviewed product and a usable next business action',
   'Use the actual reviewed product source, manifest/artifact hashes, authenticated local readback and check evidence plus the permitted business sources. Follow the visible operating-packet-v1 format and put every requested section where the renderer preserves it. Produce a precise offer or rejection, practical product demo/use steps, check results versus unknowns, founder interview questions, an explicitly unsent outreach draft, economics assumptions with unknown labor/access, acceptance and stop criteria, and the next owner action. Bind the packet to the exact reviewed artifact. Make these assets usable for deciding or conducting the next authorized validation step; do not write another generic research summary. Distinguish tool observations from quoted source assertions and untested interpretations. No buyer, revenue, independent correction-time result or outbound action is invented. Check, publish locally and complete within six ordinary decisions, preserving room for a justified repair.',
   ['review-product-v4'],{operatingProfile:'operating-packet-v1'},
   ['The rendered operating packet contains the actual product-use and next-action assets required by operating-packet-v1, with exact artifact binding and honest economics.']),
  spec('adapt-v4','portfolio.plan','Use the delivered work to choose the next useful action or stop',
   'Read the full actual operating packet, reviewed artifact evidence and retained observations. Reassess the seven investigation questions in light of what this run actually established. Revise priority and propose only the smallest consequential next tasks or a justified stop. Distinguish software execution competence, local artifact usefulness, commercial evidence and unknown founder/customer costs. Retain an adequate ordinary baseline. A consequential observed weakness may motivate a scoped procedure hypothesis and fair future evaluation, not a claimed specialist advantage or paid comparison now. Newly created tasks are persisted outside this frozen grant and cannot release further provider work. Return one complete structured planning response.',
   ['operate-v4'],{},['The next decision cites actual delivered work and changes or retains allocation for a concrete reason.'])
 ];
}

function readCorpus():CorpusSource[]{
 const data=JSON.parse(readFileSync(corpusUrl,'utf8'));requireThat(Array.isArray(data)&&data.length>0&&data.length<=30,'VALUE_RELEASE_CORPUS_REQUIRED');
 requireThat(new Set(data.map(s=>s.url)).size===data.length,'VALUE_RELEASE_DUPLICATE_SOURCE');
 for(const s of data){requireThat(s&&typeof s.id==='string'&&typeof s.title==='string'&&s.title.length>0&&s.title.length<=300&&typeof s.text==='string'&&s.text.length>0&&s.text.length<=30000&&typeof s.interpretation==='string'&&s.rights==='public_readonly'&&['vendor_documentation','public_documentation','public_user_report'].includes(s.provenance),'VALUE_RELEASE_SOURCE_INVALID');publicUrl(s.url);requireThat(Number.isFinite(Date.parse(s.observedAt))&&Date.parse(s.observedAt)<=Date.now()+1000&&(s.publishedAt===null||Number.isFinite(Date.parse(s.publishedAt))),'VALUE_RELEASE_SOURCE_DATE');}
 return data;
}

/** Offline preparation only. Existing ventures must already be initialized.
 * Reads the fixed retained research file; no account or network access exists. */
export function prepareValueReleaseV4(portfolio:Portfolio,evidence:EvidenceLibrary){
 portfolio.getVenture(ventureId);
 const existing=portfolio.store.get('portfolio-plan',ventureId+'/'+VALUE_RELEASE_V4);
 if(existing)return {prepared:false,planId:existing.id,providerRequests:0,authority:'unsigned_preparation_only',tasks:valueReleaseV4TaskAllowances(portfolio)};
 const corpus=readCorpus();
 const retained=corpus.map(source=>{
  // Publisher/user wording is the exact retained excerpt. Analysis and date
  // qualifications stay separate and must never be cited as publisher text.
  const input={title:source.title,url:source.url,text:source.text,observedAt:source.observedAt,publishedAt:source.publishedAt,rights:'public_readonly' as const,provenance:'development_assistant_research' as const,sourceClass:source.provenance==='public_user_report'?'public_user_report' as const:'vendor_documentation' as const,textKind:'exact_excerpt' as const,interpretation:source.interpretation,excerptAttribution:source.excerptAttribution??null,publisherUpdatedAt:source.updatedAt??null,dateNote:source.dateNote??null,retainedResearchId:source.id};
  return evidence.add(ventureId,input);
 });
 const founderInput={
  title:'Founder context and controller scope for value-release-v4',url:null,
  text:'Founder-supplied context (restated historical facts): Mason owns MIDAS. The intended system should understand businesses, choose valuable work, execute with appropriate workers and authority, preserve evidence and adapt. Available supplied assets are existing MIDAS software, a laptop, current development tools and willingness to learn. School, sleep and existing commitments constrain availability. No buyer network or industry expertise is confirmed. Founder effort, commercial budget, customer demand and business results remain unmeasured.\n\nCurrent controller scope for this preparation: reversible local engineering and permitted public read-only research are authorized. No new paid model or token-count request is authorized during preparation. Actual runtime work requires the exact separately reviewed and signed v4 portfolio/operating grant, with its frozen tasks, implementation, initial source bindings and limits; additional retrieved evidence follows its declared tool and data scope. Existing or historical grants do not transfer. Retrieved material, source interpretations and model proposals cannot confer authority. Sending, accounts, purchases, payments and deployment are not granted by this local product experiment.',
  observedAt:new Date().toISOString(),publishedAt:null,rights:'owner_supplied' as const,provenance:'owner_report' as const,sourceClass:'founder_statement' as const,textKind:'assistant_summary' as const,
  interpretation:'Development-assistant restatement of supplied founder facts and current controller instructions; not a verbatim owner quote or independent verification. Historical facts and current preparation scope are explicitly separated. Runtime authority must be checked against the actual signed v4 envelope, not inferred from this source.'
 };
 retained.push(evidence.add(ventureId,founderInput));
 const sourceBindings=retained.map(source=>({id:source.id,sha256:source.sha256}));
 const registry=new ProcedureRegistry(portfolio.store);
 for(const capability of ['research.investigate','portfolio.plan','software.build','quality.review','service.brief'])registry.baseline({id:baselineId(capability),scope:{capability,population},procedure:capability.startsWith('portfolio.')?EXECUTIVE_PROCEDURE:WORKER_PROCEDURE,strongBaselineReference:'Strong ordinary baseline with excellent instructions, the same relevant evidence, visible product/report requirements, trusted tools and bounded correction opportunity. No specialist comparison or superiority is claimed.'});
 const plan=portfolio.addPlan(ventureId,{id:VALUE_RELEASE_V4,rationale:'Relevant evidence → explicit commercial or engineering value decision → blank-source product → substantive authoritative review → usable operating assets → outcome-driven next action. This prepares a fresh bounded unsigned experiment, not spending authority.',evidenceIds:sourceBindings.map(s=>s.id),tasks:valueReleaseV4Tasks(sourceBindings)});
 const cancelled:string[]=[];
 for(const [oldId]of valueReleaseV4Allocation){const priorId=ventureId+'/'+oldId.replace(/-v4$/,'-v3'),prior=portfolio.store.get('portfolio-task',priorId);if(prior&&prior.attempts===0&&['queued','paused'].includes(prior.status)&&!prior.lease){portfolio.controlTask(prior.id,'cancel');cancelled.push(prior.id);}}
 return {prepared:true,planId:plan.id,sourceBindings,cancelledTaskIds:cancelled,providerRequests:0,authority:'unsigned_preparation_only',tasks:valueReleaseV4TaskAllowances(portfolio)};
}

export function valueReleaseV4TaskAllowances(portfolio:Portfolio):FrozenTaskAllowance[]{return valueReleaseV4Allocation.map(([id,workCalls])=>{const task=portfolio.getTask(ventureId+'/'+id);return {id:task.id,definitionHash:taskDefinitionHash(task),workCalls};});}

export const valueReleaseV4OwnerPacket={
 summary:'Proposed: use relevant quote/job evidence to decide whether a bounded commercial or engineering prototype is valuable, then build from blank source, inspect actual browser/DOM feedback, retain or correct the authoritative product, and deliver usable next-action assets. A specific rejection stops paid descendants.',
 authorship:'Development-assistant preparation of an unsigned experiment. Retained publisher/user excerpts and separate interpretations are labeled. The polished reference app is a development example, never the source seed or authorship evidence for a live task.',
 implemented:['The new quote-to-job-v2 profile makes the supported customer journey and all mandatory local rules visible.','New task inputs bind the selected evidence hashes; unrelated historical sources remain preserved outside their starting scope.','The planned decision gates the six frozen tasks; newly proposed backlog work cannot consume this grant.'],
 bottlenecks:[{title:'Commercial advantage',reason:'Vendor capabilities and user anecdotes challenge a generic tracker; customer access and willingness to pay are unestablished.',next:'Answer the seven questions and name the consequence of building, or reject.'},{title:'Actual runtime product evidence',reason:'A developer reference and deterministic tools do not establish that the actual model can fulfill this assignment.',next:'Only after exact approval, evaluate its own blank-source product, observed repairs and authoritative handoff.'},{title:'Owner effort and usable next action',reason:'Local checks do not establish founder workload, independent semantic acceptance or buyer outcomes.',next:'Deliver specific product-use, interview/outreach-draft and stop-criteria assets; keep unknown costs and permissions explicit.'}],
 nextDecision:'Review the fresh exact value-release-v4 Astra Max proposal: maximum USD 51.82, 32 ordinary work decisions, two held known-incomplete recoveries, two hosted searches and 36 count admissions. No paid request occurs during preparation; one action per response and the existing route/time limits remain. No specialist comparison, external sending or deployment is authorized.',
 unsupportedClaims:['Confirmed buyer demand or revenue','Advantage over competent existing tools or direct development assistance','Independent human review or measured labor savings','Actual-model authorship of the development reference','Arbitrary software, deployment, payment or external business execution']
};
