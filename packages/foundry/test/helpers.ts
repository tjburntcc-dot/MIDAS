import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/state.ts';
import { Authority } from '../src/authority.ts';
import { RunController } from '../src/runtime.ts';
import { createSupportEnvironment } from '../src/lab/support.ts';
import { createFixtureModel } from '../src/lab/model-fixture.ts';
import { FixtureService } from '../src/lab/fixture-service.ts';

export function harness(world='viable',options:any={}) {
  const root=options.root ?? mkdtempSync(join(tmpdir(),'foundry-027-'));
  const store=new StateStore(join(root,'domain.sqlite')),authority=new Authority(store),runtime=new RunController(store);
  const tenant=options.tenant ?? 'lab-a',business=options.business ?? 'support-a';
  const principals:any={};const tokens:any={};
  for(const [id,permissions] of [['worker',['read','operate']],['owner',['read','operate','approve','promote','admin']],['evaluator',['read','evaluate']]] as [string,string[]][]) {
    tokens[id]=authority.enroll(id,tenant,business,permissions);principals[id]=authority.authenticate(id,tokens[id]);
  }
  const environment=createSupportEnvironment(world as any,options.overrides),model=createFixtureModel(world as any),service=new FixtureService(join(root,'service.sqlite'),options.fault);
  const run=runtime.create(principals.worker,environment,{runId:options.runId,cap:{minorUnits:options.cap ?? 100,currency:'USD'}});
  return {root,store,authority,runtime,environment,model,service,principals,tokens,s:run.scope,close(){service.close();store.close();}};
}
export async function waitForApproval(h:any) {return h.runtime.advance(h.principals.worker,h.s,h.environment,h.model,h.service);}
export async function deliver(h:any) {
  const run=await waitForApproval(h);h.authority.approve(h.s,h.principals.owner,run.proposal);
  return h.runtime.advance(h.principals.worker,h.s,h.environment,h.model,h.service);
}
export function finishLearning(h:any,fixtureCase='inconclusive') {
  const run=h.runtime.inspect(h.principals.worker,h.s);
  const evaluation=h.runtime.learning.evaluate(h.s,h.principals.evaluator,run.learning.candidateId,fixtureCase);
  const decision=h.runtime.learning.decide(h.s,h.principals.owner,run.learning.candidateId);
  h.runtime.update(h.s,run._version,{phase:'completed',learning:{candidateId:run.learning.candidateId,status:'decided',decision:decision.outcome}},'learning_completed',{decision:decision.outcome});
  return {evaluation,decision};
}
