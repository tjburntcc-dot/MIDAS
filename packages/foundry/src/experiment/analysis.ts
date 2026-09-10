import { requireThat, hash } from '../contracts.ts';
export type ScoredAttempt = {
    id: string;
    caseId: string;
    cluster: string;
    family: string;
    repeat: number;
    condition: 'baseline' | 'challenger';
    accepted: boolean;
    critical: boolean;
    costMinor: number | null;
    latencyMs: number | null;
    correctionSeconds: number | null;
    failed: boolean;
};
export type AnalysisSpec = {
    caseCount: number;
    clusters: number;
    repeats: number;
    minimumQuality: number;
    minimumQualityLowerBound: number;
    practicalGain: number;
    maxCriticalUpperBound: number;
    maxP95LatencyMs: number;
    maxMeanCorrectionSeconds: number;
    maxCostPerAcceptedMinor: number;
    seed: number;
};
export function random(seed: number) { let state = seed >>> 0; return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; }; }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const quantile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
/** Cluster bootstrap: case repeats stay together and related cases share a resampled cluster. */
export function analyze(rows: ScoredAttempt[], spec: AnalysisSpec) {
    const ids = new Set<string>();
    const cells = new Set<string>();
    for (const r of rows) {
        for (const v of [r.costMinor, r.latencyMs, r.correctionSeconds])
            requireThat(v === null || (Number.isFinite(v) && v >= 0), 'INVALID_MEASUREMENT');
        requireThat(['baseline', 'challenger'].includes(r.condition) && typeof r.accepted === 'boolean' && typeof r.critical === 'boolean' && typeof r.failed === 'boolean' && !(r.accepted && (r.failed || r.critical)), 'INVALID_OBSERVATION');
        requireThat(!ids.has(r.id), 'DUPLICATE_ATTEMPT');
        ids.add(r.id);
        const k = [r.caseId, r.repeat, r.condition].join('/');
        requireThat(!cells.has(k), 'DUPLICATE_CELL');
        cells.add(k);
        requireThat(Number.isInteger(r.repeat) && r.repeat >= 0 && r.repeat < spec.repeats, 'INVALID_REPEAT');
    }
    const cases = [...new Set(rows.map(r => r.caseId))], clusters = [...new Set(rows.map(r => r.cluster))];
    const complete = cases.length === spec.caseCount && clusters.length === spec.clusters && rows.length === spec.caseCount * spec.repeats * 2 && cases.every(id => ['baseline', 'challenger'].every(c => rows.filter(r => r.caseId === id && r.condition === c).length === spec.repeats));
    if (!complete)
        return { decision: 'inconclusive', reason: 'Incomplete paired observations; no partial success claim.', attempts: rows.length, complete: false };
    for (const id of cases)
        requireThat(new Set(rows.filter(r => r.caseId === id).map(r => r.cluster + '/' + r.family)).size === 1, 'CASE_GROUP_CHANGED');
    const clusterRows = clusters.map(cluster => { const rs = rows.filter(r => r.cluster === cluster); const a = mean(rs.filter(r => r.condition === 'baseline').map(r => Number(r.accepted))), b = mean(rs.filter(r => r.condition === 'challenger').map(r => Number(r.accepted))); requireThat(new Set(rs.map(r => r.family)).size === 1, 'CLUSTER_FAMILY_CHANGED'); return { cluster, family: rs[0].family, a, b, fullyAccepted: rs.filter(r => r.condition === 'challenger').every(r => r.accepted), d: b - a }; });
    const rng = random(spec.seed), draws: number[] = [], quality: number[] = [];
    for (let b = 0; b < 10000; b++) {
        const sample = [...new Set(clusterRows.map(r => r.family))].flatMap(family => { const group = clusterRows.filter(r => r.family === family); return group.map(() => group[Math.floor(rng() * group.length)]); });
        draws.push(mean(sample.map(r => r.d)));
        quality.push(mean(sample.map(r => r.b)));
    }
    const delta = mean(clusterRows.map(r => r.d)), interval = [quantile(draws, .025), quantile(draws, .975)];
    const summary = (condition: string) => { const rs = rows.filter(r => r.condition === condition), accepted = rs.filter(r => r.accepted).length, known = rs.every(r => r.costMinor !== null), cost = known ? rs.reduce((n, r) => n + r.costMinor!, 0) : null; return { attempts: rs.length, accepted, acceptance: accepted / rs.length, failed: rs.filter(r => r.failed).length, critical: rs.filter(r => r.critical).length, costMinor: cost, costPerAcceptedMinor: cost !== null && accepted ? cost / accepted : null, p95LatencyMs: rs.every(r => r.latencyMs !== null) ? quantile(rs.map(r => r.latencyMs!), .95) : null, meanCorrectionSeconds: rs.every(r => r.correctionSeconds !== null) ? mean(rs.map(r => r.correctionSeconds!)) : null }; };
    const baseline = summary('baseline'), challenger = summary('challenger');
    // Any critical error within a cluster counts once for the zero-event risk bound.
    const criticalClusters = clusters.filter(c => rows.some(r => r.cluster === c && r.condition === 'challenger' && r.critical)).length;
    const criticalUpper = criticalClusters === 0 ? 1 - Math.pow(.05, 1 / clusters.length) : 1;
    // Percentile bootstrap degenerates at all-pass; use conservative Wilson lower bound too.
    const clusterSuccess = mean(clusterRows.map(r => Number(r.fullyAccepted))), n = clusters.length, z = 1.959963984540054;
    const wilson = (clusterSuccess + z * z / (2 * n) - z * Math.sqrt(clusterSuccess * (1 - clusterSuccess) / n + z * z / (4 * n * n))) / (1 + z * z / n);
    const qualityLower = Math.min(quantile(quality, .025), wilson);
    const measured = challenger.costPerAcceptedMinor !== null && challenger.p95LatencyMs !== null && challenger.meanCorrectionSeconds !== null && baseline.meanCorrectionSeconds !== null;
    const resources = measured && challenger.costPerAcceptedMinor! <= spec.maxCostPerAcceptedMinor && challenger.p95LatencyMs! <= spec.maxP95LatencyMs && challenger.meanCorrectionSeconds! <= spec.maxMeanCorrectionSeconds && challenger.meanCorrectionSeconds! <= baseline.meanCorrectionSeconds!;
    const pass = measured && delta >= spec.practicalGain && interval[0] > 0 && challenger.acceptance >= spec.minimumQuality && qualityLower >= spec.minimumQualityLowerBound && challenger.critical === 0 && criticalUpper <= spec.maxCriticalUpperBound && resources;
    const hardFailure = challenger.critical > 0 || challenger.acceptance < spec.minimumQuality || (measured && !resources);
    return { complete: true, decision: pass ? 'improvement_supported' : hardFailure ? 'improvement_unsupported' : 'inconclusive', baseline, challenger, pairedClusterMeanGain: delta, paired95Interval: interval, qualityLower95: qualityLower, independentClusters: n, caseCount: cases.length, repeats: spec.repeats, criticalClusterUpper95: criticalUpper, method: 'seeded paired cluster bootstrap within strata, 10000 draws; Wilson fully-accepted-cluster quality safeguard; one-sided exact zero-event bound', observationHash: hash(rows), scope: 'specified synthetic billing-status population only; no general business competence or untested frontier superiority' };
}
