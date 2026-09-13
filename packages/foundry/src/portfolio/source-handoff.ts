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
 return {enforced,measurement,actualBytes,limitBytes,accepted:!enforced||actualBytes<=limitBytes};
}
