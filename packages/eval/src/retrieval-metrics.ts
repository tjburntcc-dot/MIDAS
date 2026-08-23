import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { retrieveForCase, leakageHits } from "./curriculum.js";
import { loadDevelopmentCases } from "./load.js";
import { projectRuntimeCase } from "./project.js";
import { CHALLENGE_CASES_V0 } from "./paths.js";
import {
  loadRetrievalRelevance,
  relevanceForCase,
  relevantIds,
  criticalIds,
  dangerousIds,
  retrievalRelevanceSha256,
  RETRIEVAL_RELEVANCE_PATH,
} from "./relevance-labels.js";

const GOLD_LEAK_RE = /ranked_tiers|required_unknowns|required_evidence|critical_failures|\bgold\b|hidden answer/i;

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

export function scoreCaseRetrieval(args) {
  const { record, trace, caseLabels } = args;
  const retrieved = trace.retrievedItemIds || [];
  const retrievedSet = new Set(retrieved);
  const critical = criticalIds(caseLabels);
  const relevant = relevantIds(caseLabels);
  const dangerous = dangerousIds(caseLabels);
  const irrelevant = (caseLabels.irrelevant || []).map((r) => r.id);
  const hitCritical = critical.filter((id) => retrievedSet.has(id));
  const hitRelevant = relevant.filter((id) => retrievedSet.has(id));
  const hitIrrelevant = retrieved.filter((id) => irrelevant.includes(id));
  const criticalRecall = critical.length ? hitCritical.length / critical.length : 1;
  const relevantRecall = relevant.length ? hitRelevant.length / relevant.length : 1;
  const precision = retrieved.length ? hitRelevant.length / retrieved.length : 1;
  const duplicateRate = retrieved.length
    ? (retrieved.length - new Set(retrieved).size) / retrieved.length
    : 0;
  const irrelevantRate = retrieved.length ? hitIrrelevant.length / retrieved.length : 0;
  let dangerousBeforeCritical = false;
  const firstDanger = retrieved.findIndex((id) => dangerous.includes(id) && !critical.includes(id));
  const firstCritical = retrieved.findIndex((id) => critical.includes(id));
  if (firstDanger >= 0 && (firstCritical < 0 || firstDanger < firstCritical)) {
    dangerousBeforeCritical = true;
  }
  const dims = caseLabels.dimensions || [];
  const covered = dims.filter((d) => {
    if (d === "named_policy") return retrieved.length > 0;
    return true;
  });
  const dimensionCoverage = dims.length ? covered.length / dims.length : 1;
  const query = String(trace.query || "");
  const goldInQuery = GOLD_LEAK_RE.test(query) || /"gold"/.test(query);
  const fullDoc = (trace.items || []).some((it) => {
    const s = String(it.statement || "");
    return s.length > 2000 || /LOCAL_REFERENCE snapshot|## Rules[\s\S]{400,}/.test(s);
  });
  const tokens = Number(trace.tokensUsed || 0);
  const budget = Number(trace.budgetTokens || 4000);
  return {
    caseId: record.case_id,
    retrievedItemIds: retrieved,
    criticalIds: critical,
    hitCritical: hitCritical,
    criticalRecall: criticalRecall,
    relevantRecall: relevantRecall,
    precision: precision,
    tokensUsed: tokens,
    budgetTokens: budget,
    budgetHonored: tokens <= budget,
    duplicateRate: duplicateRate,
    irrelevantRate: irrelevantRate,
    dangerousBeforeCritical: dangerousBeforeCritical,
    dimensionCoverage: dimensionCoverage,
    goldInQuery: goldInQuery,
    fullDocInjection: fullDoc,
    queryLeakHits: (leakageHits(query) || []).filter((h) => /ATLAS-DEV-|ATLAS-SEALED-|ranked_tiers|required_unknowns|\bgold\b|hidden answer/i.test(String(h))),
  };
}

export function evaluateRetrievalSuite(args) {
  const store = args.store;
  const casesPath = args.casesPath || CHALLENGE_CASES_V0;
  const labels = args.labels || loadRetrievalRelevance(args.relevancePath || RETRIEVAL_RELEVANCE_PATH);
  const retrieveOpts = args.retrieveOpts || {};
  const cases = loadDevelopmentCases(casesPath);
  const perCase = [];
  for (const record of cases) {
    const runtime = projectRuntimeCase(record);
    const trace = retrieveForCase(store, runtime, retrieveOpts);
    const caseLabels = relevanceForCase(record.case_id, labels);
    perCase.push(scoreCaseRetrieval({ record: record, trace: trace, caseLabels: caseLabels }));
  }
  const n = perCase.length || 1;
  const criticalCases = perCase.filter((r) => r.criticalRecall >= 1).length;
  const overallCritical = perCase.every((r) => r.criticalRecall >= 1);
  const overallRelevant = perCase.reduce((s, r) => s + r.relevantRecall, 0) / n;
  const noDangerFirst = perCase.every((r) => r.dangerousBeforeCritical === false);
  const noFullDoc = perCase.every((r) => r.fullDocInjection === false);
  const noGold = perCase.every((r) => r.goldInQuery === false && (r.queryLeakHits || []).length === 0);
  const budgetOk = perCase.every((r) => r.budgetHonored);
  const passed = overallCritical && overallRelevant >= 0.9 && noDangerFirst && noFullDoc && noGold && budgetOk;
  return {
    evaluatorOnly: true,
    relevanceSha256: retrievalRelevanceSha256(args.relevancePath || RETRIEVAL_RELEVANCE_PATH),
    n: perCase.length,
    criticalCaseRecall: criticalCases / perCase.length,
    overallCriticalRecall: overallCritical,
    overallRelevantRecall: overallRelevant,
    noDangerousBeforeCritical: noDangerFirst,
    noFullDocInjection: noFullDoc,
    noGoldInQuery: noGold,
    budgetHonored: budgetOk,
    passed: passed,
    gates: {
      criticalRecall100: overallCritical,
      relevantRecall90: overallRelevant >= 0.9,
      noDangerousBeforeCritical: noDangerFirst,
      noFullDocInjection: noFullDoc,
      noGoldInQuery: noGold,
    },
    cases: perCase,
  };
}

export function retrievalGatesPass(report) {
  return Boolean(report && report.passed);
}

void createHash;
void readFileSync;
void estimateTokens;
