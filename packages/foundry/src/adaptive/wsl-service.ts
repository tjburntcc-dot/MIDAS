import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const contained = (root: string, path: string) => { const r = relative(root, path); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
function noLinks(path: string): void {
  for (let p = resolve(path); ; p = dirname(p)) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw Error('SERVICE_SYMLINK_DENIED');
    if (dirname(p) === p) break;
  }
}
export interface ServiceStart {
  operationId: string; workspace: string; cwd: string; argv: string[]; port: number; lifetimeMs: number;
}
export interface ServiceState {
  operationId: string; businessId: string; taskId: string; inputHash: string;
  status: 'starting' | 'ready' | 'stopped' | 'expired' | 'failed' | 'uncertain';
  isolation: 'wsl-bubblewrap'; startedAt: string; expiresAt: string; port: number;
  stdout: string; stderr: string; truncated: boolean; reason?: string;
  quiescent: boolean; stopConfirmed?: boolean;
  resourceLimits: { memoryBytes: number; processes: number; cpuPercent: number; lifetimeMs: number; diskQuota: false };
}
export interface ServiceHttpRequest { method: 'GET' | 'POST'; path: string; body?: string }
export interface ServiceHttpResponse { statusCode: number; headers: Array<[string, string]>; body: string; bodyBase64: string; bytes: number; isolation: 'wsl-bubblewrap'; operationId: string }

/** Trusted lifecycle broker. Caller must check current prospective task authority.
 * Worker code only runs in the cgroup + private Bubblewrap mount/network namespace.
 * Same-ID start replays lifecycle state; restarting a stopped service needs a new ID.
 */
export class WslServiceManager {
  readonly root: string;
  readonly workspacePath: string;
  readonly controlPath: string;
  readonly businessId: string;
  readonly taskId: string;
  readonly distribution: string;
  constructor(options: { root: string; businessId: string; taskId: string; distribution?: string }) {
    if (!options.businessId || !options.taskId) throw Error('SERVICE_IDENTITY_REQUIRED');
    this.distribution = options.distribution ?? 'Ubuntu';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(this.distribution)) throw Error('WSL_DISTRIBUTION_INVALID');
    if (this.distribution !== 'Ubuntu') throw Error('SERVICE_WSL_DISTRIBUTION_UNQUALIFIED');
    this.root = resolve(options.root); this.businessId = options.businessId; this.taskId = options.taskId;
    const identity = hash(JSON.stringify([this.businessId, this.taskId]));
    this.workspacePath = join(this.root, 'workspaces', identity);
    this.controlPath = join(this.root, 'service-evidence', identity);
    noLinks(this.root); noLinks(this.workspacePath); noLinks(this.controlPath);
    mkdirSync(this.controlPath, { recursive: true, mode: 0o700 });
  }
  private validateId(id: string): void { if (typeof id !== 'string' || !id || id.length > 256 || id.includes('\0')) throw Error('SERVICE_ID_INVALID'); }
  private linux(path: string): string { return execFileSync('wsl.exe', ['-d', this.distribution, '--exec', 'wslpath', '-a', path], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim(); }
  private async call(action: string, id: string, input?: Record<string, unknown>): Promise<any> {
    this.validateId(id);
    if (process.platform !== 'win32') throw Error('SERVICE_WSL_WINDOWS_REQUIRED');
    noLinks(this.controlPath); noLinks(this.workspacePath);
    const script = this.linux(fileURLToPath(new URL('./wsl-service.py', import.meta.url)));
    const payload = { action, operationId: id, businessId: this.businessId, taskId: this.taskId,
      control: this.linux(this.controlPath), ...input };
    return await new Promise((resolveResult, reject) => {
      const child = spawn('wsl.exe', ['-d', this.distribution, '--exec', 'python3', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', errors = '', size = 0, settled = false;
      const done = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolveResult(value); };
      const timer = setTimeout(() => { child.kill(); done(Error('SERVICE_OUTCOME_UNCERTAIN')); }, 25_000);
      child.stdout.on('data', (b: Buffer) => { size += b.length; if (size > 600_000) { child.kill(); done(Error('SERVICE_OUTPUT_LIMIT')); } else output += b.toString('utf8'); });
      child.stderr.on('data', (b: Buffer) => { errors += b.toString('utf8').slice(0, Math.max(0, 2048 - errors.length)); });
      child.on('error', () => done(Error('SERVICE_WSL_UNAVAILABLE')));
      child.on('close', () => { try { const result = JSON.parse(output); if (result.error) done(Error(result.error)); else done(undefined, result.value); } catch { done(Error(`SERVICE_OUTCOME_UNCERTAIN: ${errors}`)); } });
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(payload));
    });
  }
  async start(input: ServiceStart): Promise<ServiceState> {
    this.validateId(input.operationId);
    if (!Array.isArray(input.argv) || !input.argv.length || input.argv.length > 128 || input.argv.some(a => typeof a !== 'string' || a.includes('\0') || a.length > 65_536) || input.argv.join('').length > 131_072) throw Error('SERVICE_ARGV_INVALID');
    if (!Number.isSafeInteger(input.port) || input.port < 1024 || input.port > 65535) throw Error('SERVICE_PORT_INVALID');
    if (!Number.isSafeInteger(input.lifetimeMs) || input.lifetimeMs < 1000 || input.lifetimeMs > 600_000) throw Error('SERVICE_LIFETIME_INVALID');
    noLinks(input.workspace); noLinks(input.cwd);
    if (resolve(input.workspace) !== this.workspacePath || !existsSync(input.workspace) || realpathSync(input.workspace) !== realpathSync(this.workspacePath)) throw Error('SERVICE_WORKSPACE_DENIED');
    const cwd = resolve(input.cwd);
    if (!contained(this.workspacePath, cwd) || !lstatSync(cwd).isDirectory() || contained(this.workspacePath, this.controlPath)) throw Error('SERVICE_CWD_DENIED');
    if (process.platform !== 'win32') throw Error('SERVICE_WSL_WINDOWS_REQUIRED');
    const request = { ...input, workspace: this.linux(input.workspace), cwd: this.linux(cwd) };
    try { return await this.call('start', input.operationId, { request }); }
    catch (error) { if(String(error).includes('SERVICE_TASK_BUSY')) throw error; throw Error(`SERVICE_START_OUTCOME_UNCERTAIN: ${String(error)}`); }
  }
  async status(id: string): Promise<ServiceState | null> { return await this.call('status', id); }
  async request(id: string, request: ServiceHttpRequest): Promise<ServiceHttpResponse> {
    if (!['GET', 'POST'].includes(request.method) || typeof request.path !== 'string' || !request.path.startsWith('/') || request.path.startsWith('//') || /[\x00-\x20\x7f\\]/.test(request.path) || request.path.length > 8192 || (request.body !== undefined && (typeof request.body !== 'string' || Buffer.byteLength(request.body) > 65_536))) throw Error('SERVICE_HTTP_REQUEST_INVALID');
    return await this.call('request', id, { request });
  }
  async stop(id: string): Promise<ServiceState | null> { return await this.call('stop', id); }
  async list(): Promise<ServiceState[]> {
    noLinks(this.controlPath);
    const entries = readdirSync(this.controlPath, { withFileTypes: true }).filter(entry => { if(entry.name!=='scope.lock') return true; const file=join(this.controlPath,entry.name); noLinks(file); if(!entry.isFile()||lstatSync(file).size!==0)throw Error('SERVICE_CONTROL_INVALID');return false; });
    if (entries.length > 1024) throw Error('SERVICE_CONTROL_LIMIT');
    const results: ServiceState[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) throw Error('SERVICE_CONTROL_INVALID');
      const configFile = join(this.controlPath, entry.name, 'config.json'); noLinks(configFile);
      if (!existsSync(configFile) || lstatSync(configFile).size > 524_288) throw Error('SERVICE_CONTROL_UNCERTAIN');
      const config = JSON.parse(readFileSync(configFile, 'utf8'));
      if (hash(config.public.operationId) !== entry.name) throw Error('SERVICE_CONTROL_INVALID');
      const state = await this.status(config.public.operationId); if (!state) throw Error('SERVICE_CONTROL_UNCERTAIN');
      results.push(state);
    }
    return results;
  }
  async stopAll(): Promise<ServiceState[]> {
    const states = await this.list(); const results: ServiceState[] = [];
    for (const state of states) { const stopped = await this.stop(state.operationId); if (!stopped?.quiescent || !stopped.stopConfirmed) throw Error('SERVICE_STOP_UNCONFIRMED'); results.push(stopped); }
    return results;
  }
}

/** Backup gate: check trusted stop receipts and current cgroup state, under locks.
 * Raw live control files are never portable and must be omitted from the backup.
 */
export function assertServicesStopped(adaptiveRoot: string): void {
  const evidence = join(resolve(adaptiveRoot), 'service-evidence'); noLinks(evidence);
  if (!existsSync(evidence)) return;
  if (process.platform !== 'win32') throw Error('SERVICE_WSL_WINDOWS_REQUIRED');
  const linux = (path: string) => execFileSync('wsl.exe', ['-d', 'Ubuntu', '--exec', 'wslpath', '-a', path], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim();
  const script = linux(fileURLToPath(new URL('./wsl-service.py', import.meta.url)));
  let output: string;
  try {
    output = execFileSync('wsl.exe', ['-d', 'Ubuntu', '--exec', 'python3', script, '--assert-stopped'], {
      input: JSON.stringify({ evidence: linux(evidence) }), encoding: 'utf8', timeout: 30_000, maxBuffer: 16_384, windowsHide: true });
  } catch (error) {
    const failed = error as { stdout?: string | Buffer };
    if (failed.stdout) { let reason: string | undefined; try { reason = JSON.parse(String(failed.stdout)).error; } catch {} if (reason) throw Error(reason); }
    throw Error('SERVICE_STOP_UNCONFIRMED');
  }
  const result = JSON.parse(output);
  if (result.error || result.value !== true) throw Error(result.error ?? 'SERVICE_STOP_UNCONFIRMED');
}
