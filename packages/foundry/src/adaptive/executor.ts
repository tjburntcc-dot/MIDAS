import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, renameSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute, relative, sep } from 'node:path';

export const contentHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export interface ExecutorPolicy {
  network?: 'off' | 'on';
  allowCommands?: boolean;
  maxFileBytes?: number;
  maxOutputBytes?: number;
  maxTimeoutMs?: number;
}
export interface CommandRequest { argv: string[]; cwd?: string; timeoutMs?: number; operationId: string }
export interface BackendCommand {
  argv: string[]; cwd: string; workspace: string; timeoutMs: number; maxOutputBytes: number; network: 'off' | 'on';
}
export interface BackendResult {
  status: 'completed' | 'failed' | 'blocked' | 'timed_out';
  exitCode: number | null; stdout: string; stderr: string; truncated: boolean;
  isolation: 'bubblewrap' | 'injected'; reason?: string;
}
export interface ExecutorBackend { execute(command: BackendCommand): Promise<BackendResult> }
export interface CommandReceipt extends BackendResult {
  operationId: string; inputHash: string; businessId: string; taskId: string;
  identityVersion?: 'task-relative-v1';
  startedAt: string; finishedAt: string; argv: string[]; cwd: string; network: 'off' | 'on';
  before?: WorkspaceSnapshot; after?: WorkspaceSnapshot;
}
export interface WorkspaceSnapshot { sha256: string; files: number; inspectedBytes: number; truncated: boolean }

function fail(message: string): never { throw new Error(message); }
function contained(root: string, path: string): boolean { const r = relative(root, path); return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)); }
function noSymlinks(path: string): void {
  const absolute = resolve(path); let current = absolute;
  while (true) {
    try { if (lstatSync(current).isSymbolicLink()) fail('EXECUTOR_SYMLINK_DENIED'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
}
function atomicJson(path: string, value: unknown): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600, flush: true });
  renameSync(temp, path);
}

/** A capability-acquisition process backend. It never falls back to host execution.
 * Network opt-in is an execution permission, not a promise of domain filtering.
 * Only the task workspace is writable; host credentials and the receipt store are not mounted.
 */
export class BubblewrapBackend implements ExecutorBackend {
  async execute(command: BackendCommand): Promise<BackendResult> {
    const args = ['--die-with-parent', '--new-session', '--unshare-all', '--cap-drop', 'ALL'];
    if (command.network === 'on') args.push('--share-net');
    args.push('--clearenv', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/workspace/.home',
      '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', 'C.UTF-8');
    // Standard distribution executables and libraries, not the host root/home/opt trees.
    for (const path of ['/usr', '/bin', '/lib', '/lib64']) if (existsSync(path)) args.push('--ro-bind', realpathSync(path), path);
    args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/etc');
    if (command.network === 'on') {
      for (const path of ['/etc/resolv.conf', '/etc/ssl/certs']) if (existsSync(path)) args.push('--ro-bind', realpathSync(path), path);
    }
    args.push('--bind', command.workspace, '/workspace', '--chdir', `/workspace/${relative(command.workspace, command.cwd).split(sep).join('/')}`,
      '--', ...command.argv);
    return await new Promise<BackendResult>((resolveResult) => {
      let child: ReturnType<typeof spawn>;
      try { child = spawn('bwrap', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { PATH: '/usr/bin:/bin' } }); }
      catch (error) { resolveResult({ status: 'blocked', exitCode: null, stdout: '', stderr: String(error), truncated: false, isolation: 'bubblewrap', reason: 'SANDBOX_UNAVAILABLE' }); return; }
      let bytes = 0; let truncated = false; let timedOut = false; let stdout = ''; let stderr = '';
      const collect = (data: Buffer, stream: 'out' | 'err') => {
        const available = Math.max(0, command.maxOutputBytes - bytes); const piece = data.subarray(0, available); bytes += piece.length;
        if (piece.length !== data.length) truncated = true;
        if (stream === 'out') stdout += piece.toString('utf8'); else stderr += piece.toString('utf8');
      };
      child.stdout?.on('data', (data: Buffer) => collect(data, 'out')); child.stderr?.on('data', (data: Buffer) => collect(data, 'err'));
      const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } };
      const timer = setTimeout(() => { timedOut = true; kill(); }, command.timeoutMs);
      child.on('error', (error) => { clearTimeout(timer); resolveResult({ status: 'blocked', exitCode: null, stdout, stderr: String(error), truncated, isolation: 'bubblewrap', reason: 'SANDBOX_UNAVAILABLE' }); });
      child.on('close', (exitCode) => {
        clearTimeout(timer); kill(); // Terminate any descendant which outlived the command.
        const unavailable = /bwrap:.*(Operation not permitted|Creating new namespace failed|No permissions|permission denied|open \/proc\/.*\/ns\/.* failed)/is.test(stderr);
        resolveResult({ status: unavailable ? 'blocked' : timedOut ? 'timed_out' : exitCode === 0 ? 'completed' : 'failed', exitCode,
          stdout, stderr, truncated, isolation: 'bubblewrap', ...(unavailable ? { reason: 'SANDBOX_UNAVAILABLE' } : {}) });
      });
    });
  }
}

/** Business/task isolation is structural. Receipt state is outside the process mount.
 * A restarted in-flight operation is uncertain and cannot be automatically dispatched again.
 */
export class AdaptiveWorkspace {
  readonly workspacePath: string;
  readonly evidencePath: string;
  readonly businessId: string;
  readonly taskId: string;
  private readonly backend: ExecutorBackend;
  private readonly policy: Required<ExecutorPolicy>;
  constructor(options: { root: string; businessId: string; taskId: string; backend?: ExecutorBackend; policy: ExecutorPolicy }) {
    if (!options.businessId || !options.taskId) fail('EXECUTOR_IDENTITY_REQUIRED');
    this.businessId = options.businessId; this.taskId = options.taskId;
    const identity = contentHash(JSON.stringify([options.businessId, options.taskId]));
    noSymlinks(options.root);
    this.workspacePath = join(resolve(options.root), 'workspaces', identity);
    this.evidencePath = join(resolve(options.root), 'execution-evidence', identity);
    noSymlinks(this.workspacePath); noSymlinks(this.evidencePath);
    mkdirSync(this.workspacePath, { recursive: true, mode: 0o700 }); mkdirSync(this.evidencePath, { recursive: true, mode: 0o700 });
    this.policy = { network: options.policy.network ?? 'off', allowCommands: options.policy.allowCommands ?? false,
      maxFileBytes: options.policy.maxFileBytes ?? 1_048_576, maxOutputBytes: options.policy.maxOutputBytes ?? 65_536,
      maxTimeoutMs: options.policy.maxTimeoutMs ?? 60_000 };
    for (const value of [this.policy.maxFileBytes, this.policy.maxOutputBytes, this.policy.maxTimeoutMs]) if (!Number.isSafeInteger(value) || value <= 0) fail('EXECUTOR_INVALID_LIMIT');
    if (!['off', 'on'].includes(this.policy.network)) fail('EXECUTOR_INVALID_NETWORK_POLICY');
    this.backend = options.backend ?? new BubblewrapBackend();
  }
  private path(name: string): string {
    if (name.includes('\0') || isAbsolute(name) || name.includes('\\')) fail('EXECUTOR_PATH_DENIED');
    const path = resolve(this.workspacePath, name);
    if (!contained(this.workspacePath, path)) fail('EXECUTOR_PATH_DENIED'); noSymlinks(path); return path;
  }
  read(name: string): { path: string; content: string; sha256: string; bytes: number } {
    const path = this.path(name); const stat = lstatSync(path);
    if (!stat.isFile()) fail('EXECUTOR_NOT_FILE'); if (stat.size > this.policy.maxFileBytes) fail('EXECUTOR_FILE_LIMIT');
    const bytes = readFileSync(path); return { path: name, content: bytes.toString('utf8'), sha256: contentHash(bytes), bytes: bytes.length };
  }
  list(name = '.'): Array<{ name: string; kind: 'file' | 'directory' | 'symlink' }> {
    return readdirSync(this.path(name), { withFileTypes: true }).map(entry => ({ name: entry.name,
      kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'file' }));
  }
  write(name: string, content: string, expectedHash: string | null): { path: string; sha256: string; bytes: number } {
    const path = this.path(name); const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > this.policy.maxFileBytes) fail('EXECUTOR_FILE_LIMIT');
    const previous = existsSync(path) ? this.read(name).sha256 : null;
    if (previous !== expectedHash) fail('EXECUTOR_STALE_SOURCE');
    mkdirSync(dirname(path), { recursive: true }); noSymlinks(dirname(path));
    const temp = join(dirname(path), `.adaptive-${randomUUID()}.tmp`);
    writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600, flush: true }); renameSync(temp, path);
    const result = { path: name, sha256: contentHash(bytes), bytes: bytes.length };
    atomicJson(join(this.evidencePath, `edit-${randomUUID()}.json`), { kind: 'source_edit', businessId: this.businessId, taskId: this.taskId,
      at: new Date().toISOString(), previousHash: previous, ...result }); return result;
  }
  patch(name: string, expectedHash: string, edits: Array<{ find: string; replace: string }>): { path: string; sha256: string; bytes: number } {
    let content = this.read(name).content;
    if (this.read(name).sha256 !== expectedHash) fail('EXECUTOR_STALE_SOURCE');
    for (const edit of edits) {
      if (!edit.find || content.split(edit.find).length !== 2) fail('EXECUTOR_PATCH_AMBIGUOUS');
      content = content.replace(edit.find, () => edit.replace);
    }
    return this.write(name, content, expectedHash);
  }
  snapshot(): WorkspaceSnapshot {
    const rows: unknown[] = []; let inspectedBytes = 0; let truncated = false; let files = 0;
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (rows.length >= 2000) { truncated = true; return; }
        const path = join(directory, entry.name); const name = relative(this.workspacePath, path);
        if (entry.isSymbolicLink()) { rows.push([name, 'symlink-not-followed']); continue; }
        if (entry.isDirectory()) { rows.push([name, 'directory']); visit(path); continue; }
        const stat = lstatSync(path);
        if (!stat.isFile()) { rows.push([name, 'special-not-read']); continue; }
        files++;
        if (stat.size > this.policy.maxFileBytes || inspectedBytes + stat.size > 16_777_216) {
          rows.push([name, stat.size, 'content-not-read']); truncated = true; continue;
        }
        const content = readFileSync(path); inspectedBytes += content.length; rows.push([name, content.length, contentHash(content)]);
      }
    };
    visit(this.workspacePath); return { sha256: contentHash(JSON.stringify(rows)), files, inspectedBytes, truncated };
  }
  recoverCommand(operationId: string): CommandReceipt | null {
    if (!operationId) fail('EXECUTOR_INVALID_COMMAND');
    const path = join(this.evidencePath, `command-${contentHash(operationId)}.json`);
    if (!existsSync(path)) return null;
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    if (receipt.operationId !== operationId || receipt.businessId !== this.businessId || receipt.taskId !== this.taskId) fail('EXECUTOR_RECEIPT_IDENTITY_MISMATCH');
    if (receipt.status === 'dispatching') fail('EXECUTOR_OUTCOME_UNCERTAIN');
    return receipt as CommandReceipt;
  }
  async command(request: CommandRequest): Promise<CommandReceipt> {
    if (!this.policy.allowCommands) fail('EXECUTOR_COMMAND_NOT_AUTHORIZED');
    if (!request.operationId || !Array.isArray(request.argv) || !request.argv.length || request.argv.some(v => typeof v !== 'string' || v.includes('\0'))) fail('EXECUTOR_INVALID_COMMAND');
    const cwd = this.path(request.cwd ?? '.');
    if (!lstatSync(cwd).isDirectory()) fail('EXECUTOR_CWD_NOT_DIRECTORY');
    const timeoutMs = request.timeoutMs ?? this.policy.maxTimeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > this.policy.maxTimeoutMs) fail('EXECUTOR_TIMEOUT_LIMIT');
    const relativeCwd = relative(this.workspacePath, cwd).split(sep).join('/') || '.';
    const identityVersion = 'task-relative-v1' as const;
    const inputHash = contentHash(JSON.stringify({ identityVersion, argv: request.argv, cwd: relativeCwd, timeoutMs, policy: this.policy, businessId: this.businessId, taskId: this.taskId }));
    const path = join(this.evidencePath, `command-${contentHash(request.operationId)}.json`);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, 'utf8'));
      // Legacy receipts retain their exact absolute-root binding. Read-only recovery
      // remains available after relocation, but never silently rewrites legacy identity.
      const expected = existing.identityVersion === undefined
        ? contentHash(JSON.stringify({ argv: request.argv, cwd, timeoutMs, policy: this.policy, businessId: this.businessId, taskId: this.taskId }))
        : existing.identityVersion === identityVersion ? inputHash : fail('EXECUTOR_IDENTITY_VERSION_UNSUPPORTED');
      if (existing.inputHash !== expected) fail('EXECUTOR_OPERATION_ID_CONFLICT');
      if (existing.status === 'dispatching') fail('EXECUTOR_OUTCOME_UNCERTAIN');
      return existing as CommandReceipt;
    }
    const pending = readdirSync(this.evidencePath).filter(name => name.startsWith('command-') && name.endsWith('.json'))
      .some(name => JSON.parse(readFileSync(join(this.evidencePath, name), 'utf8')).status === 'dispatching');
    if (pending) fail('EXECUTOR_OUTCOME_UNCERTAIN');
    const startedAt = new Date().toISOString(); const before = this.snapshot();
    // Exclusive claim also prevents two concurrent process owners dispatching this identity.
    const start = { operationId: request.operationId, inputHash, identityVersion, businessId: this.businessId, taskId: this.taskId,
      startedAt, argv: request.argv, cwd: relativeCwd, network: this.policy.network, before, status: 'dispatching' };
    writeFileSync(path, JSON.stringify(start), { flag: 'wx', mode: 0o600, flush: true });
    const result = await this.backend.execute({ argv: request.argv, cwd, workspace: this.workspacePath, timeoutMs,
      maxOutputBytes: this.policy.maxOutputBytes, network: this.policy.network });
    const receipt: CommandReceipt = { ...start, ...result, after: this.snapshot(), finishedAt: new Date().toISOString() };
    atomicJson(path, receipt); return receipt;
  }
}
