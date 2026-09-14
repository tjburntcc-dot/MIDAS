import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StateStore} from '../src/state.ts';
import {keypair} from '../src/experiment/config.ts';
import {PilotKnowledge} from '../src/pilot/knowledge.ts';
import {PilotExecution} from '../src/pilot/execution.ts';
import {PilotOutcomes} from '../src/pilot/outcomes.ts';
import {PilotIntelligence} from '../src/pilot/intelligence.ts';
import {PilotDiscovery} from '../src/pilot/discovery.ts';
import {runOutcomeJourneyCli} from '../src/pilot/outcome-journey-cli.ts';

test('journey CLI writes unsigned exact packet, installs an ephemeral signed mock, and reads status without execution',async()=>{
 const root=mkdtempSync(join(tmpdir(),'midas-journey-cli-')),store=new StateStore(join(root,'state.sqlite')),knowledge=new PilotKnowledge(store),company=knowledge.createCompany({name:'CLI fixture',website:'https://cli-fixture.example/',goal:'Prepare a bounded source-grounded packet',notes:'Synthetic only.',mode:'fixture'});knowledge.addSource(company.id,{title:'Scope',text:'Owner review is required before pricing or customer contact.',kind:'notes',rights:'Synthetic fixture',observedAt:new Date().toISOString()});const execution=new PilotExecution(store,{root}),outcomes=new PilotOutcomes(store,execution),intelligence=new PilotIntelligence(store,execution),discovery=new PilotDiscovery(store,{root,knowledge}),mandate=outcomes.create(company.id,{objective:'Prepare one bounded source-grounded local packet',autonomy:'prepare_supported_work',allowedFamilies:['response-packet'],maxCalls:18,repairReserve:7});discovery.start(company.id,{website:company.website,limits:{maxDecisions:6}});
 const service:any={operatingOutcomes:outcomes,intelligence,discovery,store},output=join(root,'proposal'),writes:any[]=[];const prepared:any=await runOutcomeJourneyCli(['prepare','--root',root,'--outcome',mandate.id,'--id','journey-034-cli','--project','proj_JOURNEY_CLI_TEST','--expires-at',new Date(Date.now()+3600000).toISOString(),'--count-reserve','251','--output',output,'--mode','mock'],{service,write:v=>writes.push(v)});assert.equal(prepared.providerRequests,0);const proposal=join(output,'pilot.outcome.journey.authorization.request.json');assert.equal(JSON.parse(readFileSync(proposal,'utf8')).journey.id,'journey-034-cli');const keys=keypair(),pub=join(root,'test.pub'),priv=join(root,'test.key');writeFileSync(pub,keys.publicKey);writeFileSync(priv,keys.privateKey);const signed:any=await runOutcomeJourneyCli(['sign','--root',root,'--proposal',proposal,'--approve-proposal-hash',prepared.proposalHash,'--principal','ephemeral-cli-owner','--approval-reference','Mock-only CLI approval','--owner-public-key',pub,'--owner-private-key',priv],{service,write:v=>writes.push(v)});assert.equal(signed.providerRequests,0);const status:any=await runOutcomeJourneyCli(['status','--root',root],{service,write:v=>writes.push(v)});assert.equal(status.authorization.approved,true);assert.equal(status.authorization.liveEnabled,false);assert.equal(status.credentialRead,false);store.close();rmSync(root,{recursive:true,force:true});});
