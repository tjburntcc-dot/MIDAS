/** Local trust/configuration binding. Only explicit live startup enters this module's
 * credential callbacks; preparing a proposal never reads either provider credential. */
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve,join,isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { StateStore } from '../state.ts';
import { requireThat,hash,canonical } from '../contracts.ts';
import { verified,keypair,signed } from '../experiment/config.ts';
import { OperatingModels,implementationHash } from './model.ts';
import type { OperatingGrant } from './model.ts';
import { OperatingManager,operatingScope } from './manager.ts';
import type { OperatingBusiness } from './manager.ts';
import { OperatingMail } from './communication.ts';
import { GmailRestTransport } from './mail.ts';
import type { CommunicationAuthority } from './communication.ts';

export function prepareLive(root:string,b:OperatingBusiness){
    requireThat(b.mode==='live','LIVE_BUSINESS_REQUIRED');const route={authorizationId:'operations-030-v2',model:'gpt-5.6-sol',reasoningEffort:'medium' as const,serviceTier:'default' as const,inputTokenCeiling:32768,maxOutputTokens:8192,deadlineMs:180000,maxCallCost:{currency:'USD',minorUnits:33},pricing:{inputMinorPerMillion:500,outputMinorPerMillion:2000,source:'https://developers.openai.com/api/docs/models/gpt-5.6-sol (includes conservative 1.25x cache-write input)',effectiveAt:'2026-09-12T00:00:00.000Z'}};
    const grant:OperatingGrant={kind:'operations-model-grant-v1',mode:'live',root:resolve(root),host:hostname(),implementationHash:implementationHash(),projectId:'proj_H01ORqdOPQM6vdGwQYsqFL5r',credentialFile:'C:/Users/14844/Downloads/MIDAS/var/foundry-worktree-028/var/foundry-smoke-028/auth/provider/openai.key',expiresAt:'2026-09-25T22:00:00.000Z',approvedBy:'',approvalReference:'',billingPublicKey:null,accountScope:operatingScope('mission030-live-v2'),route,limits:{totalMinor:900,concurrency:1,astraCountRequests:21,overheadReserve:{minor:207,reason:'Explicit unpriced count uncertainty allowance, not a quoted fee; no transfer from earlier missions'},allocations:[{metadataKey:'businessId',value:b.id,attempts:21,minor:693},{metadataKey:'stage',value:'investigate',attempts:6,minor:198},{metadataKey:'stage',value:'review',attempts:2,minor:66},{metadataKey:'stage',value:'procedure-source',attempts:1,minor:33},{metadataKey:'stage',value:'procedure-comparison',attempts:12,minor:396}],stages:{smoke:{minor:0,attempts:0},development:{minor:693,attempts:21},validation:{minor:0,attempts:0},evaluation:{minor:0,attempts:0}}},businesses:[{id:b.id,goalHash:hash(b.goal),sourceHosts:[...new Set(b.allowedUrls.map(u=>new URL(u).hostname))].sort(),maxCalls:21}],retries:0,providerConcurrency:1,countDeadlineMs:10000,externalAuthority:false};
    const channel={kind:'operations-channel-grant-v1',root:resolve(root),host:hostname(),implementationHash:implementationHash(),modelGrantHash:null,authority:{mode:'live',sender:null,permittedRecipients:[],expiresAt:grant.expiresAt,maxMessages:2,maxPolls:8,minimumIntervalSeconds:30,maxFollowUpsPerThread:0,approvalReference:'',eligibilityBasis:'Owner-controlled or explicitly consenting test mailboxes; not a prospect campaign',businessIds:[b.id]},oauthCredentialFile:null,localApprovalPrivateKeyFile:null};
    mkdirSync(join(root,'proposal'),{recursive:true});writeFileSync(join(root,'proposal/model-grant.request.json'),JSON.stringify(grant,null,2));writeFileSync(join(root,'proposal/channel-grant.request.json'),JSON.stringify(channel,null,2));
    writeFileSync(join(root,'proposal/worker-context.json'),JSON.stringify({businessId:b.id,goal:b.goal,sourceUrls:b.allowedUrls,procedureFile:'operations/contracts.ts',noAdministrativeInputs:true},null,2));
    return {model:grant,channel,status:'unsigned; no calls or credential access',missing:['Model spending approval','Sender and permitted test recipient(s), OAuth protected file and channel approval if communication is included'],reservation:{inferenceMinor:693,countUncertaintyMinor:207,totalMinor:900,currency:'USD'}};
}
export function loadLive(root:string,store:StateStore,envelopeFile:string,trustAnchorFile:string,channelEnvelopeFile?:string){
    requireThat(isAbsolute(envelopeFile)&&isAbsolute(trustAnchorFile),'EXPLICIT_TRUST_PATH_REQUIRED');
    const publicKey=readFileSync(trustAnchorFile,'utf8'),envelope=JSON.parse(readFileSync(envelopeFile,'utf8')),g=verified(envelope,publicKey) as OperatingGrant;
    requireThat(g.mode==='live'&&g.credentialFile!==null&&isAbsolute(g.credentialFile),'LIVE_CREDENTIAL_PATH_REQUIRED');
    const models=new OperatingModels({root,store,envelope,trustedPublicKey:publicKey,execution:{kind:'live',credential:()=>readFileSync(g.credentialFile!,'utf8').trim(),transport:fetch}});
    let communication:OperatingMail|null=null;
    if(channelEnvelopeFile){
        const c=verified(JSON.parse(readFileSync(channelEnvelopeFile,'utf8')),publicKey);
        requireThat(c.kind==='operations-channel-grant-v1'&&c.root===resolve(root)&&c.host===hostname()&&c.implementationHash===implementationHash()&&c.modelGrantHash===hash(g),'CHANNEL_GRANT_BINDING');
        requireThat(c.authority.mode==='live'&&c.authority.businessIds.every((id:string)=>g.businesses.some(b=>b.id===id))&&Date.parse(c.authority.expiresAt)<=Date.parse(g.expiresAt),'CHANNEL_AUTHORITY_SCOPE');
        requireThat(isAbsolute(c.oauthCredentialFile)&&isAbsolute(c.localApprovalPrivateKeyFile),'CHANNEL_CREDENTIAL_PATH_REQUIRED');
        const transport=new GmailRestTransport({expectedSender:c.authority.sender,credential:()=>JSON.parse(readFileSync(c.oauthCredentialFile,'utf8')),fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})});
        // A signing key is local authority, not a provider key. Exact UI approval alone
        // cannot expand the prior signed recipient, volume, expiry or channel envelope.
        communication=new OperatingMail(store,transport,c.authority as CommunicationAuthority,{publicKey,privateKey:readFileSync(c.localApprovalPrivateKeyFile,'utf8')});
    }
    return new OperatingManager({store,models,communication,researchPorts:()=>({})});
}
