/** Versioned unsigned execution preparation. No credential reads, signing or network. */
import { mkdirSync,writeFileSync,existsSync,readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { hostname } from 'node:os';
import { canonical,hash,rawHash,requireThat } from '../contracts.ts';
import { buildResponsesBody } from '../model-port.ts';
import { countPayload } from '../experiment/token-count.ts';
import { OperatingManager,operatingScope } from './manager.ts';
import { implementationHash } from './model.ts';
import type { OperatingGrant } from './model.ts';
import { decisionSchema,draftOnlySchema,roleFor,sourceDigest,validateDraft } from './contracts.ts';

export const BUSINESS_ID='midas-venture-investigation-v3',MAIL_ID='midas-controlled-gmail-v3';
export const VENTURE_GOAL=`Investigate the best first owner-operated venture for Mason as a learning environment for MIDAS, not as MIDAS's permanent vertical. Challenge the inherited cleaning-site estimate-path audit; the earlier price, geography, need and buyer accessibility are unverified hypotheses. Search the permitted source corpus and discovered links for disconfirming evidence and substitute solutions. Compare up to three specific offers where evidence warrants; you may replace the inherited idea or reject all candidates. Assess buyer problem, reachable acquisition route without an assumed network, existing alternatives, feasible delivery, learning burden, founder effort and the cheapest commercial test. Public marketing claims are signals, not observed willingness to pay. Do not assume savings, domain expertise, confirmed hours or customer access. School, sleep and commitments constrain the proposed schedule.
Produce sourced findings and a useful reviewed decision packet, even if the venture is rejected. Use draft rather than stop for a supported rejection so it receives consequential review; stop only for a genuine inability to produce a grounded packet. Include in scope: source-linked findings and contradictions; candidate comparison with rejection reasons; chosen decision and what could reverse it; an actual small sample deliverable or evidence-backed rejection memo; interview questions and a draft acquisition message as text; assumption-based economics including unknown owner labor; and a bounded next action with success/revision/stop criteria. Keep source assertions, assumptions, unknowns and estimates distinct. Correct the whole packet during review, including dependent offer, economics and next action. Return outreach=[]: this assignment has no sending authority. Any separately authorized controlled Gmail test is independent of this business decision. Do not count a completed artifact or a model review as demand, accepted customer work or measured superiority. The baseline is strong; recommend a procedure experiment only for a consequential supported mechanism, not to fill the allowance.`;
export const SOURCE_URLS=[
 'https://www.getjobber.com/features/client-hub/',
 'https://www.getjobber.com/features/customer-communication-management/',
 'https://help.getjobber.com/en/articles/quote-approvals/',
 'https://asana.com/templates/client-onboarding-process',
 'https://zapier.com/blog/client-onboarding/',
 'https://www.sba.gov/counseling/plan-your-business/',
 'https://support.google.com/business/answer/6218037?hl=en',
 'https://www.usertesting.com/plans',
 'https://www.brightlocal.com/pricing/',
 'https://cleanedfresh.com/',
 'https://cleaningsessionsco.com/',
 'https://gleamingcleaningservices.com/'
];
export const TEST_MESSAGES=[
 {subject:'MIDAS controlled delivery test — 030-A',body:'This is an owner-approved MIDAS delivery test to a controlled or consenting test mailbox. It is not a sales message or a customer result. Please reply ACK 030-A so we can check thread receipt. Do not include private information. No other action is requested.'},
 {subject:'MIDAS controlled stop test — 030-B',body:'This is an owner-approved MIDAS reply-handling test to a controlled or consenting test mailbox. It is not an offer. Please reply: Please do not contact me again. MIDAS should record the request and suppress further messages. This reply is a test signal, not evidence of buyer rejection or demand.'}
];
const write=(dir:string,name:string,value:any)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2));

export function prepareAstra(root:string,m:OperatingManager){
 const dir=join(root,'proposal/astra-v3');mkdirSync(dir,{recursive:true});
 requireThat(!existsSync(join(dir,'model-grant.signed.json')),'SIGNED_PROPOSAL_IMMUTABLE');
 let b=m.list().find(b=>b.id===BUSINESS_ID);
 if(!b){
  const parent=m.get('midas-owned-venture');
  b=m.create({id:BUSINESS_ID,parentBusinessId:parent.id,name:'Choose the venture from evidence — Astra proposal',goal:VENTURE_GOAL,mode:'live',allowedUrls:SOURCE_URLS});
  b.sources=structuredClone(parent.sources.filter((s:any)=>s.rights.startsWith('owner-permitted')));
  b.status='waiting';b.reason='Unsigned Astra High proposal. No provider or token-count requests authorized.';b.nextAction='Review the $23 proposal; approve model work and select Gmail separately.';
  b.artifacts=[{id:'astra-v3-prepared-request',version:1,title:'Astra High execution request — $23 maximum',buyer:'Mason',offer:'Challenge the venture hypothesis and complete a reviewed, sourced operating packet.',scope:['Primary: up to 8 investigation/drafting calls and 2 substantive review calls.','Conditional: 1 procedure extraction and 12 paired calls, released only for a consequential observed job-specific hypothesis.','Recovery: 2 fresh linked completions for known incomplete responses with recorded usage; no access retries or uncertain resubmission.','Separate optional Gmail test: 2 exact messages, 8 bounded polling operations, no model calls. Account setup and exact send approval still required.','Astra High/default for every call. At most 32,768 input tokens and 8,192 output tokens including reasoning; 180-second inference and 10-second count deadlines; concurrency one.','Maximum new exposure $23: $20.50 inference reservations plus $2.50 unpriced count allowance. No budget transferred. Expiry September 25, 2026, 22:00 UTC.'],assumptions:['Public evidence may reject every candidate. No willingness to pay, owner hours or specialist advantage has been established.','The $2.50 count reserve is an unpriced uncertainty allowance. Token estimates remain provisional until authoritative billing evidence.'],sourceIds:b.sources.map((s:any)=>s.id),nextTest:'Approve this unsigned request. This prepared card is not a real-model result.',outreach:[],reviewStatus:'Unsigned proposal',provenance:'development-assistant preparation'}];
  m.save(b,'operating.astra_proposal_prepared');m.updateUnderstanding(b.id);b=m.get(b.id);
 }
 requireThat(b.goal===VENTURE_GOAL&&hash(b.allowedUrls)===hash(SOURCE_URLS)&&!b.activeRequest&&b.reviews.length===0,'PROPOSAL_ALREADY_RUNNING_OR_CHANGED');
 const route={authorizationId:'operations-030-astra-v3',model:'gpt-6-astra',reasoningEffort:'high' as const,serviceTier:'default' as const,inputTokenCeiling:32768,maxOutputTokens:8192,deadlineMs:180000,maxCallCost:{currency:'USD',minorUnits:82},pricing:{inputMinorPerMillion:1250,outputMinorPerMillion:5000,source:'https://developers.openai.com/api/docs/models/gpt-6-astra ; input uses conservative cache-write price $12.50/M; output $50/M',effectiveAt:'2026-09-12T00:00:00.000Z'}};
 const g:OperatingGrant={kind:'operations-model-grant-v1',mode:'live',root:resolve(root),host:hostname(),implementationHash:implementationHash(),projectId:'proj_H01ORqdOPQM6vdGwQYsqFL5r',credentialFile:'C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key',expiresAt:'2026-09-25T22:00:00.000Z',approvedBy:'',approvalReference:'',billingPublicKey:null,accountScope:operatingScope('mission030-astra-v3'),route,limits:{totalMinor:2300,concurrency:1,astraCountRequests:25,overheadReserve:{minor:250,reason:'Unpriced supporting-count exposure allowance, not a quoted provider fee; no historical allowance transferred'},allocations:[{metadataKey:'businessId',value:b.id,attempts:25,minor:2050},{metadataKey:'businessId',value:MAIL_ID,attempts:0,minor:0},...Object.entries({investigate:8,review:2,'procedure-source':1,'procedure-comparison':12,recovery:2}).map(([value,attempts])=>({metadataKey:'stage',value,attempts,minor:attempts*82}))],stages:{smoke:{minor:0,attempts:0},development:{minor:2050,attempts:25},validation:{minor:0,attempts:0},evaluation:{minor:0,attempts:0}}},businesses:[{id:b.id,goalHash:hash(b.goal),sourceHosts:m.hosts(b),maxCalls:25,draftOnly:true},{id:MAIL_ID,goalHash:hash('Controlled Gmail transport test only; no model execution or commercial inference.'),sourceHosts:[],maxCalls:0}],retries:0,providerConcurrency:1,countDeadlineMs:10000,externalAuthority:false,recovery:{version:'known-incomplete-v1',maxAdmissions:2},learningGate:'consequential-job-v1'};
 const channel={kind:'operations-channel-grant-v1',root:resolve(root),host:hostname(),implementationHash:implementationHash(),modelGrantHash:null,authority:{mode:'live',sender:null,permittedRecipients:[],expiresAt:g.expiresAt,maxMessages:2,maxPolls:8,minimumIntervalSeconds:30,maxFollowUpsPerThread:0,approvalReference:'',eligibilityBasis:'Owner-controlled or explicitly consenting test mailboxes only',businessIds:[MAIL_ID]},oauthCredentialFile:null,localApprovalPrivateKeyFile:null};
 const request={scope:b.scope,requestId:'preview-not-dispatched',task:'investigate' as const,role:roleFor(route.model),context:{...m.context(b),operatingRules:{...m.context(b).operatingRules,maxOutreach:0},remainingPrimaryAdmissions:{investigate:8,review:2}},tools:[{name:'public-research',authority:'bounded public read only; model proposes requests'}],limits:{maxCost:route.maxCallCost,maxAttempts:1,maxHumanMinutes:0}};
 const body=buildResponsesBody(route,request,draftOnlySchema(decisionSchema)),count=countPayload(body);
 write(dir,'model-grant.request.json',g);
 const priorChannel=existsSync(join(dir,'channel-grant.request.json'))?JSON.parse(readFileSync(join(dir,'channel-grant.request.json'),'utf8')):null;
 requireThat(!priorChannel?.authority.approvalReference,'APPROVED_CHANNEL_REQUEST_IMMUTABLE');
 write(dir,'channel-grant.request.json',priorChannel?{...priorChannel,implementationHash:implementationHash(),modelGrantHash:null}:channel);
 writeFileSync(join(dir,'initial-responses-body.json'),canonical(body));writeFileSync(join(dir,'initial-count-body.json'),canonical(count));
 write(dir,'payload-audit.json',{preparedAt:new Date().toISOString(),status:'exact preview serialization; timestamp and source context refrozen at each actual admission',responsesSha256:rawHash(canonical(body)),countSha256:rawHash(canonical(count)),endpoints:['https://api.openai.com/v1/responses','https://api.openai.com/v1/responses/input_tokens'],authorizationHeaders:'Bearer callback and OpenAI-Project; never stored here',requiredReservationMinor:Math.ceil((32768*1250+8192*5000)/1000000),access:'Official route support verified; current project/key access not tested',modelRevision:'gpt-6-astra alias; immutable dated revision not established',providerRequests:0});
 write(dir,'gmail-test-messages.json',{status:'unsent; sender and controlled recipients still required',messages:TEST_MESSAGES});
 return {businessId:b.id,url:'http://127.0.0.1:43130/?id='+b.id,directory:resolve(dir),grant:g,status:'unsigned; no credentials read or provider requests made'};
}

export function prepareGmailTest(root:string,m:OperatingManager,sender:string,recipients:string[]){
 const dir=join(root,'proposal/astra-v3');
 requireThat(!existsSync(join(dir,'channel-grant.signed.json'))&&!existsSync(join(dir,'model-grant.signed.json')),'SIGNED_PROPOSAL_IMMUTABLE');
 const email=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
 requireThat(email.test(sender)&&recipients.length===2&&recipients.every(r=>email.test(r))&&new Set(recipients.map(r=>r.toLowerCase())).size===2,'TWO_DISTINCT_CONTROLLED_RECIPIENTS_REQUIRED');
 requireThat(!m.list().some(b=>b.id===MAIL_ID),'MAIL_TEST_ALREADY_PREPARED');
 let b=m.create({id:MAIL_ID,parentBusinessId:BUSINESS_ID,name:'Optional controlled Gmail test',goal:'Controlled Gmail transport test only; no model execution or commercial inference.',mode:'live',allowedUrls:[]});
 const text='Owner-specified controlled or consenting test recipients: '+recipients.join(', ')+'. Sender: '+sender+'. Address specification is not independent evidence of consent; signed owner confirmation is required.';
 b.sources=[{id:'controlled-mailboxes',url:'urn:midas:owner:controlled-mailboxes',title:'Controlled test addressing',text,observedAt:new Date().toISOString(),sha256:hash(text),status:'available',provenance:'owner configuration; pending explicit attestation and channel approval',rights:'owner-permitted controlled communication',validUntil:null}];
 b.draft={title:'Exact controlled Gmail test messages',buyer:'Owner test participants only',offer:'Verify delivery, reply matching and stop handling.',scope:['Two controlled messages; no campaign or customer outcome.'],assumptions:['Owner must attest control or explicit consent before signing.'],sourceIds:['controlled-mailboxes'],nextTest:'Review exact addressing and content; approve the batch only after separate channel authorization.',outreach:TEST_MESSAGES.map((msg,i)=>({...msg,to:recipients[i],recipientSourceId:'controlled-mailboxes',eligibilityReason:'Owner-selected controlled or consenting test mailbox; channel grant must confirm.',sourceIds:['controlled-mailboxes']}))};
 validateDraft(b.draft,b.sources);b.artifacts=[{...b.draft,id:'controlled-test-v3',version:1,provenance:'development-assistant prepared exact test; not model output',reviewStatus:'Owner exact review required'}];b.phase='approval';b.status='waiting';b.sourceSnapshot=sourceDigest(b.sources);b.reason='Unsigned optional channel; nothing sent.';m.save(b,'operating.mail_test_prepared');
 const c=JSON.parse(readFileSync(join(dir,'channel-grant.request.json'),'utf8'));c.authority.sender=sender;c.authority.permittedRecipients=recipients;c.oauthCredentialFile=resolve(root,'auth/gmail-oauth.json');c.localApprovalPrivateKeyFile=resolve(root,'auth/owner-private.pem');write(dir,'channel-grant.request.json',c);
 return {businessId:MAIL_ID,messages:b.draft.outreach,channelRequest:resolve(dir,'channel-grant.request.json'),providerRequests:0,externalMessages:0};
}
