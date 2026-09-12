import { hash, identifier, requireThat } from '../contracts.ts';
import type { Scope } from '../contracts.ts';

export type Lane = 'research' | 'build' | 'commit';
export type TaskStatus = 'queued' | 'running' | 'blocked' | 'paused' | 'completed' | 'cancelled' | 'stale' | 'needs_reconciliation';
export type ResourceLimits = { workerSlots: number; modelCalls: number; localToolRuns: number };
export type ResourceUsage = { modelCalls?: number; localToolRuns?: number; workerMs?: number };
export type ArtifactBinding = { artifactId: string; version: number; sha256: string };
export type CheckResult = { id: string; passed: boolean; required?: boolean; summary?: string; evidence?: unknown };
export type ArtifactInput = { id: string; title: string; kind: string; provenance: string; path?: string; content?: unknown; summary?: string; previewUrl?: string; downloadUrl?: string; checks?: CheckResult[]; metadata?: unknown };
export type ObservationInput = { id?: string; kind: string; summary: string; source: string; provenance: string; observedAt?: string; artifactIds?: string[]; metrics?: Record<string, number | null>; metadata?: unknown; reassess?: boolean };
export type TaskSpec = {
    id: string; title: string; objective?: string; lane: Lane; capability: string; dependsOn: string[]; acceptance: string[];
    inputArtifacts?: ArtifactBinding[]; requiredCompetencies?: string[]; allowedTools?: string[]; requiredChecks?: string[];
    resource?: Partial<ResourceLimits>; priority?: number; maxAttempts?: number; inputs?: unknown;
    effectAuthority?: { kind: 'local' | 'external'; reference: string } | null;
};
export type PlanInput = { id?: string; rationale: string; evidenceIds?: string[]; tasks: TaskSpec[] };
export type WorkerInput = { id: string; name: string; competencies: string[]; capabilities: string[]; maxConcurrency?: number; procedureId?: string | null; available?: boolean };
export type VentureInput = { id?: string; name: string; goal: string; stage?: string; priority?: number; mode?: 'local' | 'fixture' | 'live'; summary?: string; metadata?: unknown };
export type Lease = { token: string; ownerId: string; workerId: string; generation: number; heartbeatAt: string; expiresAt: string };
export type Task = TaskSpec & {
    id: string; localId: string; ventureId: string; planId: string; planRevision: number; status: TaskStatus; reason: string; nextAction: string;
    priority: number; attempts: number; maxAttempts: number; resource: ResourceLimits; inputArtifacts: ArtifactBinding[]; outputArtifacts: ArtifactBinding[];
    requiredCompetencies: string[]; allowedTools: string[]; requiredChecks: string[]; workerId: string | null; lease: Lease | null;
    outputCurrent: boolean; invalidatedAt: string | null; invalidationReason: string | null; result: any | null; createdAt: string; updatedAt: string;
    stopRequested?: 'pause' | 'cancel' | null; checkpoint?: any; progressAt?: string; _version: number;
};
export type TaskLease = { task: Task; token: string; lease: Lease };
export type Completion = { artifacts?: ArtifactInput[]; observations?: ObservationInput[]; checks?: CheckResult[]; usage?: ResourceUsage; summary?: string; output?: unknown };
export const PORTFOLIO_VERSION = 'portfolio-v1';
export const taskKey = (ventureId: string, localId: string) => { identifier(ventureId); identifier(localId); return ventureId + '/' + localId; };
export const portfolioScope = (ventureId = 'portfolio'): Scope => ({ tenantId: 'mason', businessId: ventureId, runId: PORTFOLIO_VERSION, dataPolicyVersion: 'portfolio-local-v1', mode: 'fixture' });
export function text(value: unknown, code = 'TEXT_REQUIRED', max = 12000): asserts value is string { requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= max, code); }
export function integer(value: number, min = 0, max = 1_000_000) { requireThat(Number.isSafeInteger(value) && value >= min && value <= max, 'INVALID_RESOURCE_OR_PRIORITY'); return value; }
export function unique(values: string[]) { requireThat(new Set(values).size === values.length, 'DUPLICATE_ID'); }
export const digest = hash;
export function validateTask(spec: TaskSpec) {
    identifier(spec.id); text(spec.title); text(spec.capability); requireThat(['research', 'build', 'commit'].includes(spec.lane), 'TASK_LANE_REQUIRED');
    requireThat(Array.isArray(spec.acceptance) && spec.acceptance.length > 0, 'TASK_ACCEPTANCE_REQUIRED'); spec.acceptance.forEach(x => text(x));
    requireThat(Array.isArray(spec.dependsOn), 'TASK_DEPENDENCIES_REQUIRED'); unique(spec.dependsOn);
    for (const list of [spec.requiredCompetencies ?? [], spec.allowedTools ?? [], spec.requiredChecks ?? []]) { unique(list); list.forEach(x => text(x)); }
    if (spec.priority !== undefined) integer(spec.priority, 0, 1000);
    if (spec.maxAttempts !== undefined) integer(spec.maxAttempts, 1, 100);
    for (const [key, value] of Object.entries(spec.resource ?? {})) { requireThat(['workerSlots', 'modelCalls', 'localToolRuns'].includes(key), 'RESOURCE_KEY'); integer(value, key === 'workerSlots' ? 1 : 0); }
    for (const ref of spec.inputArtifacts ?? []) { text(ref.artifactId); integer(ref.version, 1); requireThat(/^[a-f0-9]{64}$/.test(ref.sha256), 'ARTIFACT_HASH_REQUIRED'); }
    if (spec.effectAuthority) { requireThat(['local', 'external'].includes(spec.effectAuthority.kind), 'EFFECT_AUTHORITY_KIND'); text(spec.effectAuthority.reference); }
}
