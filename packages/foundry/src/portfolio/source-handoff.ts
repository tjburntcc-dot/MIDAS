import type { SourceFile, WorkKind } from './products.ts';

/** The same byte contract governs candidate writes and later model context.
 * A rejected candidate remains in attempt evidence, never authoritative source. */
export function sourceHandoff(workspace: {kind: WorkKind; files: SourceFile[]; inputs?: any}, sourceBound = false) {
 const inputs=workspace.inputs??{};
 const enforced=Boolean(sourceBound||inputs.enforceHandoff||inputs.profile==='quote-to-job-v2');
 const files=workspace.files.filter(f=>workspace.kind!=='service'||f.path==='brief.json');
 const measurement=workspace.kind==='service'?'brief.json raw UTF-8 bytes':'JSON.stringify(files) UTF-8 bytes';
 const actualBytes=Buffer.byteLength(workspace.kind==='service'?files[0]?.content??'':JSON.stringify(files));
 const limitBytes=workspace.kind==='software'?24000:inputs.operatingProfile==='operating-packet-v1'?9000:18000;
 const targetBytes=Math.floor(limitBytes*0.85);
 return {enforced,measurement,actualBytes,limitBytes,accepted:!enforced||actualBytes<=limitBytes,
  requiredReductionBytes:Math.max(0,actualBytes-limitBytes),recommendedTargetBytes:targetBytes,
  recommendedReductionBytes:Math.max(0,actualBytes-targetBytes),
  serializedFilesBytes:Buffer.byteLength(JSON.stringify(files)),
  rule:workspace.kind==='service'?'The complete raw brief is included in downstream context; the existing aggregate report allowance is 18000 bytes (operating source allowance 9000). Outer request/context limits are checked separately.':'The complete JSON-serialized source file array must fit the existing 24000-byte downstream source allowance.',
  advice:'Prefer substantial headroom (85% of the limit), not another near-threshold rewrite. Preserve required evidence and meaning; never truncate silently.'};
}
