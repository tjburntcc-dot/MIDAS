import { hash, requireThat } from '../contracts.ts';
import { StateStore } from '../state.ts';

export type CapabilityBinding = { businessId: string; taskId: string; contextHash: string };
export type CapabilityFile = { path: string; sha256: string };
export type SkillPackage = {
    purpose: string; preconditions: string[]; inputs: string[]; outputs: string[];
    procedure: string; files: CapabilityFile[]; dependencies: string[]; effects: string[];
    tests: string[]; failureModes: string[]; sourceRefs: string[];
};
export type CapabilityVerification = {
    receiptId: string; packageHash: string; currentFiles: CapabilityFile[];
    checks: Array<{ id: string; passed: boolean; evidenceRef: string }>;
    provenance: 'fixture' | 'development' | 'actual_model';
};
export type CapabilityEpisode = CapabilityBinding & {
    id: string; objective: string; obstacle: string; obstacleEvidence: string[];
    state: 'diagnosing' | 'acquiring' | 'verified' | 'resumed' | 'retained';
    missingCapability: string | null; alternatives: Array<{ approach: string; reason: string }>;
    selectedApproach: string | null; package: SkillPackage | null; packageHash: string | null;
    verification: CapabilityVerification | null; resumeEvidence: string | null;
    candidateId: string | null; history: Array<{ action: string; evidence: unknown }>;
    _version: number;
};
export type CapabilityAction =
    | { type: 'open'; invocationId: string; objective: string; obstacle: string; obstacleEvidence: string[] }
    | { type: 'diagnose'; invocationId: string; episodeId: string; missingCapability: string; alternatives: Array<{ approach: string; reason: string }>; selectedApproach: string }
    | { type: 'acquire'; invocationId: string; episodeId: string; package: SkillPackage }
    | { type: 'resume'; invocationId: string; episodeId: string; evidenceRef: string }
    | { type: 'retain'; invocationId: string; episodeId: string };

const EPISODES = 'adaptive-capability-episode';
const SKILLS = 'adaptive-skill-candidate';
function text(value: unknown) { requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= 16000, 'CAPABILITY_TEXT_REQUIRED'); }
function digest(value: unknown) { requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'CAPABILITY_HASH_REQUIRED'); }
function strings(value: unknown): asserts value is string[] { requireThat(Array.isArray(value) && value.length <= 100, 'CAPABILITY_LIST_REQUIRED'); (value as unknown[]).forEach(text); }
function files(value: CapabilityFile[]) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 1000, 'CAPABILITY_FILES_REQUIRED');
    const seen = new Set<string>();
    for (const f of value) {
        text(f.path); digest(f.sha256);
        requireThat(!f.path.startsWith('/') && !f.path.includes('\\') && !f.path.split('/').some(p => p === '..' || p === '' || p === '.') && !/^[A-Za-z]:/.test(f.path), 'CAPABILITY_RELATIVE_PATH_REQUIRED');
        requireThat(!seen.has(f.path), 'CAPABILITY_DUPLICATE_FILE'); seen.add(f.path);
    }
}
function packageValid(p: SkillPackage) {
    text(p.purpose); text(p.procedure); files(p.files);
    for (const k of ['preconditions', 'inputs', 'outputs', 'dependencies', 'effects', 'tests', 'failureModes', 'sourceRefs'] as const) strings(p[k]);
    requireThat(p.tests.length > 0 && p.outputs.length > 0, 'CAPABILITY_ACCEPTANCE_REQUIRED');
}
function fileDigest(value: CapabilityFile[]) { return hash([...value].sort((a, b) => a.path.localeCompare(b.path))); }

/** Stores business-bound acquisition episodes in the existing database. It runs no tools,
 * grants no authority, and cannot promote workers. Its caller owns authentication and
 * supplies the current context binding on every action. */
export class AdaptiveCapabilities {
    readonly store: StateStore;
    readonly readCurrentFiles?: (binding: CapabilityBinding, files: CapabilityFile[]) => CapabilityFile[];
    constructor(store: StateStore, readCurrentFiles?: (binding: CapabilityBinding, files: CapabilityFile[]) => CapabilityFile[]) {
        this.store = store; this.readCurrentFiles = readCurrentFiles;
    }
    private current(binding: CapabilityBinding, episode: CapabilityEpisode) {
        requireThat(this.readCurrentFiles && episode.package, 'CAPABILITY_CURRENT_READBACK_REQUIRED');
        const observed = this.readCurrentFiles!(binding, episode.package!.files);
        files(observed);
        requireThat(fileDigest(observed) === fileDigest(episode.package!.files), 'CAPABILITY_ARTIFACT_STALE');
    }
    private validateBinding(binding: CapabilityBinding) { text(binding.businessId); text(binding.taskId); digest(binding.contextHash); }
    view(binding: CapabilityBinding, id: string): CapabilityEpisode {
        this.validateBinding(binding);
        const episode = this.store.get(EPISODES, id) as CapabilityEpisode;
        requireThat(episode && episode.businessId === binding.businessId && episode.taskId === binding.taskId, 'CAPABILITY_SCOPE_MISMATCH');
        requireThat(episode.contextHash === binding.contextHash, 'CAPABILITY_CONTEXT_STALE');
        return episode;
    }
    list(binding: CapabilityBinding): CapabilityEpisode[] {
        this.validateBinding(binding);
        return this.store.db.prepare('SELECT body,version FROM entities WHERE kind=? ORDER BY rowid').all(EPISODES)
            .map(r => ({ ...JSON.parse(String(r.body)), _version: Number(r.version) }))
            .filter(e => e.businessId === binding.businessId && e.taskId === binding.taskId && e.contextHash === binding.contextHash);
    }
    private invocation<T>(binding: CapabilityBinding, invocationId: string, payload: unknown, fn: () => T): T {
        this.validateBinding(binding); text(invocationId);
        return this.store.transaction(() => {
            const key = hash({ binding, invocationId });
            const prior = this.store.get('adaptive-capability-invocation', key);
            if (prior) { requireThat(prior.payloadHash === hash(payload), 'CAPABILITY_INVOCATION_CONFLICT'); return prior.result; }
            const result = fn();
            this.store.put('adaptive-capability-invocation', key, { binding, payloadHash: hash(payload), result }, null);
            return result;
        });
    }
    open(input: CapabilityBinding & { invocationId: string; objective: string; obstacle: string; obstacleEvidence: string[] }) {
        const binding = { businessId: input.businessId, taskId: input.taskId, contextHash: input.contextHash };
        return this.apply(binding, { type: 'open', invocationId: input.invocationId, objective: input.objective, obstacle: input.obstacle, obstacleEvidence: input.obstacleEvidence });
    }
    /** Worker-facing mutations. Deliberately has no verify, approve, or promote action. */
    apply(binding: CapabilityBinding, action: CapabilityAction): CapabilityEpisode {
        return this.invocation(binding, action.invocationId, action, () => {
            if (action.type === 'open') {
                text(action.objective); text(action.obstacle); strings(action.obstacleEvidence);
                requireThat(action.obstacleEvidence.length > 0, 'CAPABILITY_OBSTACLE_EVIDENCE_REQUIRED');
                const id = 'capability-' + hash({ binding, invocationId: action.invocationId }).slice(0, 24);
                return this.store.put(EPISODES, id, { ...binding, id, objective: action.objective, obstacle: action.obstacle, obstacleEvidence: action.obstacleEvidence,
                    state: 'diagnosing', missingCapability: null, alternatives: [], selectedApproach: null, package: null,
                    packageHash: null, verification: null, resumeEvidence: null, candidateId: null,
                    history: [{ action: 'open', evidence: action }] }, null);
            }
            const e = this.view(binding, action.episodeId);
            requireThat(e.state !== 'retained', 'CAPABILITY_EPISODE_CLOSED');
            switch (action.type) {
                case 'diagnose':
                    requireThat(e.state === 'diagnosing' || e.state === 'acquiring', 'CAPABILITY_TRANSITION');
                    text(action.missingCapability); text(action.selectedApproach);
                    requireThat(Array.isArray(action.alternatives) && action.alternatives.length > 0 && action.alternatives.length <= 20, 'CAPABILITY_ALTERNATIVES_REQUIRED');
                    action.alternatives.forEach(a => { text(a.approach); text(a.reason); });
                    requireThat(action.alternatives.some(a => a.approach === action.selectedApproach), 'CAPABILITY_SELECTION_MISSING');
                    e.missingCapability = action.missingCapability; e.alternatives = action.alternatives; e.selectedApproach = action.selectedApproach;
                    e.state = 'acquiring'; e.verification = null; break;
                case 'acquire':
                    requireThat(e.state === 'acquiring', 'CAPABILITY_TRANSITION'); packageValid(action.package);
                    e.package = action.package; e.packageHash = hash(action.package); e.verification = null; break;
                case 'resume':
                    requireThat(e.state === 'verified' && e.verification, 'CAPABILITY_VERIFICATION_REQUIRED');
                    this.current(binding, e);
                    text(action.evidenceRef); e.state = 'resumed'; e.resumeEvidence = action.evidenceRef; break;
                case 'retain': {
                    requireThat(e.state === 'resumed' && e.package && e.verification, 'CAPABILITY_RESUMPTION_REQUIRED');
                    this.current(binding, e);
                    const id = 'skill-candidate-' + e.id;
                    this.store.put(SKILLS, id, { id, businessId: e.businessId, episodeId: e.id, taskId: e.taskId,
                        contextHash: e.contextHash, package: e.package, packageHash: e.packageHash,
                        verification: e.verification, status: 'candidate', qualification: 'unqualified', transfer: 'unobserved' }, null);
                    e.candidateId = id; e.state = 'retained'; break;
                }
                default: throw new Error('CAPABILITY_ACTION_UNSUPPORTED');
            }
            e.history.push({ action: action.type, evidence: action });
            return this.store.put(EPISODES, e.id, e, e._version);
        });
    }
    /** TRUSTED CONTROLLER ONLY: receipt must originate from actual tool execution and
     * current file readback, never from model-supplied check claims. */
    verify(binding: CapabilityBinding, episodeId: string, receipt: CapabilityVerification): CapabilityEpisode {
        return this.invocation(binding, 'verify:' + receipt.receiptId, { episodeId, receipt }, () => {
            const e = this.view(binding, episodeId);
            requireThat(e.state === 'acquiring' && e.package, 'CAPABILITY_TRANSITION');
            text(receipt.receiptId); files(receipt.currentFiles);
            requireThat(receipt.packageHash === e.packageHash && fileDigest(receipt.currentFiles) === fileDigest(e.package!.files), 'CAPABILITY_ARTIFACT_STALE');
            requireThat(['fixture', 'development', 'actual_model'].includes(receipt.provenance), 'CAPABILITY_PROVENANCE_REQUIRED');
            requireThat(Array.isArray(receipt.checks) && new Set(receipt.checks.map(c => c.id)).size === receipt.checks.length, 'CAPABILITY_CHECKS_REQUIRED');
            receipt.checks.forEach(c => { text(c.id); text(c.evidenceRef); requireThat(typeof c.passed === 'boolean', 'CAPABILITY_CHECK_RESULT_REQUIRED'); });
            const passed = e.package!.tests.every(id => receipt.checks.some(c => c.id === id && c.passed));
            e.history.push({ action: 'verify', evidence: receipt });
            e.verification = passed ? receipt : null; e.state = passed ? 'verified' : 'acquiring';
            return this.store.put(EPISODES, e.id, e, e._version);
        });
    }
    /** Applicability is a retained decision, never transfer success. The trusted caller
     * supplies current readback, granted effects, and observed precondition evidence. */
    assessReuse(binding: CapabilityBinding, input: { invocationId: string; candidateId: string; currentFiles: CapabilityFile[]; allowedEffects: string[]; preconditionEvidence: Record<string, string>; purposeRelevant: boolean }) {
        return this.invocation(binding, input.invocationId, input, () => {
            const skill = this.store.get(SKILLS, input.candidateId);
            requireThat(skill && skill.businessId === binding.businessId, 'CAPABILITY_SCOPE_MISMATCH');
            requireThat(skill.taskId !== binding.taskId, 'CAPABILITY_TRANSFER_REQUIRES_DIFFERENT_TASK');
            files(input.currentFiles); strings(input.allowedEffects);
            const p = skill.package as SkillPackage;
            const reasons: string[] = [];
            if (hash(p) !== skill.packageHash || fileDigest(input.currentFiles) !== fileDigest(p.files)) reasons.push('artifact_changed');
            if (!input.purposeRelevant) reasons.push('purpose_not_applicable');
            if (p.effects.some(effect => !input.allowedEffects.includes(effect))) reasons.push('effect_not_authorized');
            if (p.preconditions.some(c => typeof input.preconditionEvidence[c] !== 'string' || !input.preconditionEvidence[c].trim())) reasons.push('precondition_unverified');
            const result = { candidateId: skill.id, ...binding, status: reasons.length ? 'rejected' : 'applicable_candidate', reasons,
                evidence: input, transfer: 'unobserved', qualification: 'unqualified' };
            this.store.put('adaptive-skill-reuse', hash({ binding, invocationId: input.invocationId }), result, null);
            return result;
        });
    }
    /** A tool-observed later-task result can establish this one reuse observation, not
     * generalization, independent superiority, or promotion. */
    recordReuseOutcome(binding: CapabilityBinding, input: { invocationId: string; reuseInvocationId: string; passed: boolean; evidenceRefs: string[]; provenance: CapabilityVerification['provenance']; currentFiles: CapabilityFile[] }) {
        return this.invocation(binding, input.invocationId, input, () => {
            const reuse = this.store.get('adaptive-skill-reuse', hash({ binding, invocationId: input.reuseInvocationId }));
            requireThat(reuse?.status === 'applicable_candidate', 'CAPABILITY_REUSE_NOT_APPLICABLE');
            const skill = this.store.get(SKILLS, reuse.candidateId);
            files(input.currentFiles); strings(input.evidenceRefs);
            requireThat(input.evidenceRefs.length > 0 && typeof input.passed === 'boolean', 'CAPABILITY_OUTCOME_EVIDENCE_REQUIRED');
            requireThat(['fixture', 'development', 'actual_model'].includes(input.provenance), 'CAPABILITY_PROVENANCE_REQUIRED');
            requireThat(hash(skill.package) === skill.packageHash && fileDigest(input.currentFiles) === fileDigest(skill.package.files), 'CAPABILITY_ARTIFACT_STALE');
            const result = { ...binding, candidateId: reuse.candidateId, reuseInvocationId: input.reuseInvocationId,
                passed: input.passed, evidenceRefs: input.evidenceRefs, provenance: input.provenance,
                claim: input.provenance === 'actual_model' ? 'single_runtime_reuse_observation' : 'non_runtime_reuse_observation', qualification: 'unqualified' };
            this.store.put('adaptive-skill-reuse-outcome', hash({ binding, invocationId: input.invocationId }), result, null);
            return result;
        });
    }
}
