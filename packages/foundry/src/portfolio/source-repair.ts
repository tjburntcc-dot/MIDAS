import {hash,rawHash,requireThat,object} from '../contracts.ts';

export type SourcePatch={path:string;expectedHash:string;candidateId:string|null;serialization:'preserve'|'compact-json';edits:Array<{find:string;replace:string}>};
export const patchArgumentsSchema={type:'object',additionalProperties:false,required:['path','expectedHash','candidateId','serialization','edits'],properties:{
 path:{type:'string',minLength:1,maxLength:150},expectedHash:{type:'string',pattern:'^[a-f0-9]{64}$'},candidateId:{type:['string','null'],pattern:'^candidate-[a-f0-9]{32}$'},
 serialization:{type:'string',enum:['preserve','compact-json']},edits:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['find','replace'],properties:{find:{type:'string',minLength:1,maxLength:12000},replace:{type:'string',maxLength:12000}}}}
}};
export function validateSourcePatch(value:unknown):asserts value is SourcePatch{
 const p=value as SourcePatch;object(p,['path','expectedHash','candidateId','serialization','edits']);
 requireThat(typeof p.path==='string'&&p.path.length>0&&Array.from(p.path).length<=150&&typeof p.expectedHash==='string'&&/^[a-f0-9]{64}$/.test(p.expectedHash),'PATCH_TARGET_INVALID');
 requireThat(p.candidateId===null||typeof p.candidateId==='string'&&/^candidate-[a-f0-9]{32}$/.test(p.candidateId),'PATCH_CANDIDATE_INVALID');
 requireThat(['preserve','compact-json'].includes(p.serialization)&&Array.isArray(p.edits)&&p.edits.length<=12,'PATCH_OPERATIONS_INVALID');
 requireThat(p.edits.length>0||p.serialization==='compact-json','PATCH_EMPTY');
 for(const e of p.edits){object(e,['find','replace']);requireThat(typeof e.find==='string'&&e.find.length>0&&Array.from(e.find).length<=12000&&typeof e.replace==='string'&&Array.from(e.replace).length<=12000,'PATCH_EDIT_INVALID');}
}
/** Literal, single-match edits only: no regex, evaluation, filesystem or hidden
 * repair. Optional JSON serialization is an explicit worker-selected operation. */
export function applySourcePatch(source:string,p:SourcePatch){
 validateSourcePatch(p);requireThat(rawHash(source)===p.expectedHash,'PATCH_TARGET_STALE');let authored=source;
 for(const edit of p.edits){const at=authored.indexOf(edit.find);requireThat(at>=0&&authored.indexOf(edit.find,at+1)<0,'PATCH_MATCH_NOT_UNIQUE');authored=authored.slice(0,at)+edit.replace+authored.slice(at+edit.find.length);}
 let content=authored;
 if(p.serialization==='compact-json'){
  requireThat(p.path.endsWith('.json'),'PATCH_JSON_FILE_REQUIRED');
  const parsed=JSON.parse(authored,(_key,v)=>{if(typeof v==='number')requireThat(Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v)),'PATCH_UNSAFE_JSON_NUMBER');return v;});
  content=JSON.stringify(parsed);
 }
 return {content,derivation:{kind:'explicit-literal-source-patch-v1',request:p,requestHash:hash(p),baseHash:rawHash(source),authoredCandidate:authored,authoredHash:rawHash(authored),serializedHash:rawHash(content),serialization:p.serialization,claim:'Only model-specified edits and explicitly selected serialization; no semantic repair or truncation.'}};
}
