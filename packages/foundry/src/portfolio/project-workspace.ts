import { mkdirSync, existsSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rawHash, requireThat } from '../contracts.ts';
import { projectPath, revisionForProject, validateProjectSource, type ProjectCheckResult, type ProjectRevision } from './project-contracts.ts';

type Metadata = { version: 1; id: string; revision: ProjectRevision; createdAt: string; updatedAt: string };
export type ProjectState = { version: number; entities: Record<string, Array<Record<string, unknown>>>; operations: Record<string, { status: number; body: unknown; requestHash: string; operation: 'create' | 'action'; entity: string; recordId?: string }> };
const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
function atomicJson(path: string, value: unknown) { mkdirSync(dirname(path), { recursive: true }); const temporary = path + '.' + randomUUID() + '.tmp'; writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 }); renameSync(temporary, path); }
function readJson(path: string, absent: unknown): any { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : absent; }
function safeChild(root: string, relativePath: string) { const target = resolve(root, relativePath); const rel = relative(root, target); requireThat(rel !== '' && !rel.startsWith('..') && !isAbsolute(rel), 'PROJECT_PATH_DENIED'); return target; }

/** Disk-backed source and state boundary. Worker edits go through these methods;
 * it does not receive a shell, environment, or a host directory path. */
export class ProjectWorkspace {
  readonly root: string; readonly id: string; readonly directory: string; readonly sourceDirectory: string; readonly runtimeDirectory: string;
  constructor(root: string, id: string) { requireThat(typeof root === 'string' && root.length > 0 && idPattern.test(id), 'PROJECT_WORKSPACE_INVALID'); this.root = resolve(root); this.id = id; this.directory = safeChild(this.root, 'projects/' + id); this.sourceDirectory = safeChild(this.directory, 'source'); this.runtimeDirectory = safeChild(this.directory, 'runtime'); mkdirSync(this.sourceDirectory, { recursive: true }); mkdirSync(this.runtimeDirectory, { recursive: true }); }
  private metadataPath() { return safeChild(this.runtimeDirectory, 'metadata.json'); }
  private statePath() { return safeChild(this.runtimeDirectory, 'state.json'); }
  private filePath(path: string) { projectPath(path); return safeChild(this.sourceDirectory, path); }
  private metadata(): Metadata { const value = readJson(this.metadataPath(), null); requireThat(value?.version === 1 && value.id === this.id && value.revision, 'PROJECT_NOT_INITIALIZED'); return value; }
  private writeMetadata(value: Metadata) { atomicJson(this.metadataPath(), value); }
  private sourceFrom(metadata: Metadata) { return metadata.revision.files.map(file => ({ path: file.path, content: readFileSync(this.filePath(file.path), 'utf8') })); }
  seed(files: Array<{ path: string; content: string }>) { if (existsSync(this.metadataPath())) return this.recover().revision; validateProjectSource(files); const revision = revisionForProject(files); for (const file of files) { const target = this.filePath(file.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, file.content, { encoding: 'utf8', mode: 0o600 }); }
    const now = new Date().toISOString(); this.writeMetadata({ version: 1, id: this.id, revision, createdAt: now, updatedAt: now }); atomicJson(this.statePath(), { version: 0, entities: {}, operations: {} } satisfies ProjectState); return revision;
  }
  recover() { const metadata = this.metadata(); const files = this.sourceFrom(metadata); const recomputed = revisionForProject(files); if (recomputed.manifestHash === metadata.revision.manifestHash) return { recovered: false, revision: metadata.revision };
    const next = { ...metadata, revision: recomputed, updatedAt: new Date().toISOString() }; this.writeMetadata(next); return { recovered: true, revision: next.revision };
  }
  revision() { return this.recover().revision; }
  list() { return this.revision().files.map(file => ({ ...file })); }
  read(path: string) { const revision = this.revision(); projectPath(path); const file = revision.files.find(item => item.path === path); requireThat(file, 'PROJECT_FILE_NOT_FOUND'); const content = readFileSync(this.filePath(path), 'utf8'); requireThat(rawHash(content) === file.sha256, 'PROJECT_SOURCE_CHANGED'); return { ...file, content };
  }
  replace(input: { path: string; content: string; expectedHash: string | null }) { projectPath(input.path); requireThat(typeof input.content === 'string' && Buffer.byteLength(input.content) <= 262_144, 'PROJECT_FILE_INVALID'); const prior = this.revision(); const old = prior.files.find(file => file.path === input.path); requireThat((old?.sha256 ?? null) === input.expectedHash, 'PROJECT_SOURCE_STALE'); const files = old ? prior.files.map(file => file.path === input.path ? { path: file.path, content: input.content } : { path: file.path, content: readFileSync(this.filePath(file.path), 'utf8') }) : [...prior.files.map(file => ({ path: file.path, content: readFileSync(this.filePath(file.path), 'utf8') })), { path: input.path, content: input.content }]; validateProjectSource(files); const target = this.filePath(input.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, input.content, { encoding: 'utf8', mode: 0o600 }); const revision = revisionForProject(files); const current = this.metadata(); this.writeMetadata({ ...current, revision, updatedAt: new Date().toISOString() }); return { revision, invalidated: ['project.check', 'project.preview'] };
  }
  patch(input: { path: string; expectedHash: string; edits: Array<{ find: string; replace: string }> }) { requireThat(Array.isArray(input.edits) && input.edits.length > 0 && input.edits.length <= 12, 'PROJECT_PATCH_INVALID'); const current = this.read(input.path); requireThat(current.sha256 === input.expectedHash, 'PROJECT_SOURCE_STALE'); let content = current.content; for (const edit of input.edits) { requireThat(typeof edit?.find === 'string' && edit.find.length > 0 && edit.find.length <= 12_000 && typeof edit.replace === 'string' && edit.replace.length <= 12_000, 'PROJECT_PATCH_INVALID'); const position = content.indexOf(edit.find); requireThat(position >= 0 && content.indexOf(edit.find, position + 1) < 0, 'PROJECT_PATCH_NOT_UNIQUE'); content = content.slice(0, position) + edit.replace + content.slice(position + edit.find.length); } return this.replace({ path: input.path, content, expectedHash: current.sha256 }); }
  state(): ProjectState { const state = readJson(this.statePath(), null); requireThat(state && Number.isSafeInteger(state.version) && state.version >= 0 && state.entities && state.operations, 'PROJECT_STATE_INVALID'); return structuredClone(state); }
  saveState(next: ProjectState, expectedVersion: number) { const current = this.state(); requireThat(current.version === expectedVersion, 'PROJECT_STATE_STALE'); requireThat(next && typeof next === 'object' && next.entities && next.operations && Object.keys(next.operations).length <= 10_000 && Object.values(next.entities).every(records => Array.isArray(records) && records.length <= 5_000), 'PROJECT_STATE_INVALID'); const saved = { ...structuredClone(next), version: current.version + 1 }; requireThat(Buffer.byteLength(JSON.stringify(saved)) <= 1_500_000, 'PROJECT_STATE_BYTES'); atomicJson(this.statePath(), saved); return saved; }
  recordCheck(result: ProjectCheckResult) { const current = this.metadata(); requireThat(result.manifestHash === current.revision.manifestHash, 'PROJECT_CHECK_STALE'); const revision = { ...current.revision, checkedManifest: result.manifestHash, checkResult: structuredClone(result) }; this.writeMetadata({ ...current, revision, updatedAt: new Date().toISOString() }); return revision; }
  clear() { const target = this.directory, rel = relative(this.root, target); requireThat(rel.startsWith('projects' + '\\') || rel.startsWith('projects/'), 'PROJECT_DELETE_DENIED'); rmSync(target, { recursive: true, force: true }); }
}
