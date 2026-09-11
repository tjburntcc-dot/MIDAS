/** Prespecified exploratory paired-episode decision, never a reliability certification. */
export const decisionRules = { version: 'paired-workflow-rules-v1', independentEpisodes: 6, minimumTeamAccepted: 5, minimumPairedGain: 1, maxTeamCritical: 0, maxMachineMsPerWorkflow: 720000, maxHumanSecondsPerWorkflow: 900, requireAuthoritativeCostsForResourceQualification: true, repeatCount: 1, protected: false };
export function analyze(observations: any[], mode: string) {
    const pairs = Array.from(new Set(observations.map(x => x.episode))).map(episode => { const a = observations.find(x => x.episode === episode && x.configuration === 'single'), b = observations.find(x => x.episode === episode && x.configuration === 'team'); const accepted = (x: any) => x?.semanticAccepted === null || x?.semanticAccepted === undefined ? null : !!x.deterministicAccepted && x.semanticAccepted; const single = accepted(a), team = accepted(b); return { episode, single, team, difference: single === null || team === null ? null : Number(team) - Number(single) }; });
    const allReviewed = observations.length === 12 && observations.every(x => x.semanticAccepted !== null && x.semanticAccepted !== undefined);
    const critical = observations.filter(x => x.configuration === 'team' && x.semanticReview?.critical === true).length;
    const resourcesKnown = observations.every(x => x.actualBilledMinor !== null && x.actualBilledMinor !== undefined && x.humanWorkSeconds !== null && x.humanWorkSeconds !== undefined);
    const resourcesPass = resourcesKnown && observations.every(x => x.latencyMs <= decisionRules.maxMachineMsPerWorkflow && x.humanWorkSeconds <= decisionRules.maxHumanSecondsPerWorkflow);
    const single = pairs.filter(x => x.single === true).length, team = pairs.filter(x => x.team === true).length;
    let decision = 'inconclusive', reason = 'Missing complete semantic reviews, authoritative costs or reliable human effort.';
    if (mode === 'mock') {
        decision = 'offline_only';
        reason = 'Mock outputs verify integration; no measured AI competence or team comparison.';
    }
    else if (allReviewed) {
        if (single === team) {
            decision = 'prefer_simpler_if_sufficient';
            reason = single === 6 ? 'Both meet all observed episode quality checks; prefer single worker pending resource qualification.' : 'Equal observed acceptance; fix failed episodes before claiming sufficiency.';
        }
        else if (team < single) {
            decision = 'team_regression';
            reason = 'Diagnose observed handoff/procedure cost before adding agents.';
        }
        else if (team >= 5 && critical === 0 && resourcesPass) {
            decision = 'advance_for_confirmation';
            reason = 'Exploratory team benefit meets the frozen local quality/resource rule; identify the mechanism and test new episodes.';
        }
        else {
            decision = 'inconclusive';
            reason = critical ? 'Team critical failures prevent advance.' : !resourcesKnown ? 'Quality difference observed, but billing or reliable human effort is missing.' : 'Quality/resource threshold not met.';
        }
    }
    return { rules: decisionRules, pairs, decision, reason, accepted: { single, team }, teamCritical: critical, resourcesKnown, resourcesPass, unit: 'paired episode; calls are not independent observations', uncertainty: 'Six related, open synthetic episodes with one observation per arm; report differences without statistical superiority or failure-rate estimation.', possibleSharedFailure: allReviewed && pairs.some(p => p.single === false && p.team === false), protectedValidation: false };
}
