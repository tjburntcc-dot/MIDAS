import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
if(process.argv.length!==4)throw Error('Usage: node packages/foundry/tools/typecheck-experiment.mjs <installed-typescript.js> <installed-@types-directory>');
const ts=require(resolve(process.argv[2]));
const files=['packages/foundry/src/experiment/cli.ts'];
const options={noEmit:true,allowImportingTsExtensions:true,target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,skipLibCheck:true,types:['node'],typeRoots:[resolve(process.argv[3])],ignoreDeprecations:'6.0'};
const program=ts.createProgram(files,options),diagnostics=ts.getPreEmitDiagnostics(program);
for(const d of diagnostics){const pos=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start):null;console.log(`${d.file?.fileName??'configuration'}${pos?':'+(pos.line+1):''} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);}
console.log(JSON.stringify({compiler:ts.version,semantic:true,strict:true,skipDependencyDeclarationCheck:true,errors:diagnostics.length,sourceFiles:program.getSourceFiles().filter(f=>!f.isDeclarationFile).length}));
process.exitCode=diagnostics.length?1:0;
