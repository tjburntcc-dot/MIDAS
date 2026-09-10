import { resolve, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { prepare, readJSON, writeJSON, executionHash } from '../src/experiment/config.ts';
import { hash, requireThat } from '../src/contracts.ts';
export function prepareSmoke(root, preservedRoot) {
  root=resolve(root);preservedRoot=resolve(preservedRoot);
  requireThat(root!==preservedRoot,'SMOKE_ROOT_MUST_NOT_REPLACE_PREPARED_EXPERIMENT');
  const names=['spec.json','baseline.json','cases.json','authorization.request.json'];
  const hashes=()=>Object.fromEntries(names.map(n=>[n,createHash('sha256').update(readFileSync(join(preservedRoot,n))).digest('hex')]));
  const before=hashes();
  prepare(root);
  const spec=readJSON(join(root,'spec.json'));
  spec.scope.runId='EXP-028-SMOKE';
  spec.limits={totalMinor:100,stages:{smoke:{minor:100,attempts:2},development:{minor:0,attempts:0},validation:{minor:0,attempts:0},evaluation:{minor:0,attempts:0}}};
  spec.purpose='Transport smoke only; no role-quality comparison, development, or protected evaluation is authorized by this account.';
  spec.preservedExperiment={root:preservedRoot,publicFileHashes:before};
  const cases=readJSON(join(root,'cases.json')).filter(c=>c.split==='development').slice(0,2);
  spec.casesHash=hash(cases);writeJSON(join(root,'cases.json'),cases);writeJSON(join(root,'spec.json'),spec);
  const request=readJSON(join(root,'authorization.request.json'));
  Object.assign(request,{limits:spec.limits,specHash:executionHash(spec),credentialFile:join(root,'auth','provider','openai.key'),permittedData:'Only authorized input facts of open synthetic cases D-001 and D-002, baseline instructions and output schema; no labels, customer data, tools or real business actions.',expiresAt:'2026-09-11T22:00:00Z',allowProtected:false,protectedCredentialFile:null,approvalReference:null,approvedBy:null});
  writeJSON(join(root,'authorization.request.json'),request);
  requireThat(hash(before)===hash(hashes()),'PREPARED_EXPERIMENT_CHANGED');
  return {root,projectId:request.projectId,credentialFile:request.credentialFile,approved:false,expiresAt:request.expiresAt,limits:spec.limits,route:request.route,caseIds:cases.map(c=>c.id),preservedRootUnchanged:true,preservedHashes:before,authorizationExists:existsSync(join(root,'authorization.json'))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const root=process.argv[2]??'var/foundry-smoke-028',preserved=process.argv[3]??'var/foundry-experiment-028-release';console.log(JSON.stringify(prepareSmoke(root,preserved),null,2));}
 catch(e){console.error(JSON.stringify({error:e.code??'PREPARATION_FAILED'}));process.exitCode=1;}
}
