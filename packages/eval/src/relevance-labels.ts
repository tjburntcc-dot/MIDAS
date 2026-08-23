import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths.js";

export const RETRIEVAL_RELEVANCE_PATH = join(
  REPO_ROOT,
  "evals/atlas/v0/challenge/retrieval_relevance_v0.json",
);
export const RETRIEVAL_RELEVANCE_MANIFEST_PATH = join(
  REPO_ROOT,
  "evals/atlas/v0/challenge/retrieval_relevance_v0.manifest.json",
);

/**
 * Evaluator-only loader. Import from tests / retrieval-metrics / attribution only.
 * Never import from retrieveForCase, persist responder path, or knowledge metadata.
 */
export function loadRetrievalRelevance(path) {
  const p = path || RETRIEVAL_RELEVANCE_PATH;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function retrievalRelevanceSha256(path) {
  const p = path || RETRIEVAL_RELEVANCE_PATH;
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

export function relevanceForCase(caseId, labels) {
  const set = labels || loadRetrievalRelevance();
  return (set.cases && set.cases[caseId]) || {
    dimensions: [],
    critical: [],
    supporting: [],
    redundant: [],
    irrelevant: [],
    dangerous: [],
  };
}

export function relevantIds(caseLabels) {
  const ids = new Set();
  for (const row of [...(caseLabels.critical || []), ...(caseLabels.supporting || [])]) {
    if (row && row.id) ids.add(row.id);
  }
  return [...ids];
}

export function criticalIds(caseLabels) {
  return (caseLabels.critical || []).map((r) => r.id).filter(Boolean);
}

export function dangerousIds(caseLabels) {
  return (caseLabels.dangerous || []).map((r) => r.id).filter(Boolean);
}
