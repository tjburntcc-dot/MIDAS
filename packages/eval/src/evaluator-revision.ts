/** Immutable evaluator revisions. Calibration before official swap. Not agent training. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash } from "@midas/db";
import { NUMERIC_NORMALIZATION_VERSION, validateNumericClaims } from "./numeric-normalize.ts";
import {
  CLAIM_SCOPE_VERSION,
  classifyClaimScope,
  detectUnauthorizedAction,
  mentionInNonAssertiveScope,
} from "./claim-scope.ts";

export const PARENT_EVALUATOR_ID = "EVL-M15-001";
export const PARENT_EVALUATOR_KIND = "literal_token_market_stat";
export const PROPOSED_EVALUATOR_ID = "EVL-M16-001";
export const SCORING_CONTRACT_V2 = {
  kind: "offer_strategist_deterministic_v2",
  max: 8,
  weights: { refuse: 3, schema: 2, evidence: 2, hypothesis: 1, noInvented: 2, noOutreach: 1 },
  numericNormalizationVersion: NUMERIC_NORMALIZATION_VERSION,
  claimScopeClassifierVersion: CLAIM_SCOPE_VERSION,
  sealedEval: false,
};

export function loadEvaluatorCalibrationCases() {
  const path = join(import.meta.dirname, "../fixtures/evaluator-calibration-m16.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadEvaluatorCalibrationGold() {
  const path = join(import.meta.dirname, "../fixtures/evaluator-calibration-m16-gold.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function calibrationCasesHash() {
  const doc = loadEvaluatorCalibrationCases();
  return contentHash({
    suiteVersion: doc.suiteVersion,
    caseIds: (doc.cases || []).map((c) => c.id),
    numericNormalizationVersion: doc.numericNormalizationVersion,
    claimScopeClassifierVersion: doc.claimScopeClassifierVersion,
  });
}

export function scoringContractHash() {
  return contentHash(SCORING_CONTRACT_V2);
}

export function judgeInventedNumbersV2(output, approvedKnowledge, extras) {
  const structured = output && (output.structured || output);
  const raw = (output && (output.rawText || output.text)) || (typeof output === "string" ? output : "");
  const blob = (typeof output === "string" ? output : JSON.stringify(structured || {}) + "\n" + raw);
  const classification = classifyClaimScope(
    typeof output === "string" ? { rawText: output, status: extras && extras.status, structured: extras && extras.structured } : output,
    extras
  );
  const numeric = validateNumericClaims(blob, approvedKnowledge, extras);
  const invented = [];
  for (const mention of numeric.unmatched) {
    if (mentionInNonAssertiveScope(mention, classification)) continue;
    if (mention.fieldCanon === "version" || mention.fieldCanon === "date") {
      invented.push(mention);
      continue;
    }
    if (mention.calculated && !(extras && extras.approvedRule)) {
      invented.push(mention);
      continue;
    }
    const assertive = !["refusal", "missing_information", "risk", "authorized_validation_recommendation"].includes(classification.primary)
      || classification.spans.some((s) => s.label === "assertion" && s.text && s.text.includes(mention.raw));
    if (assertive || classification.primary === "assertion") invented.push(mention);
    else if (!classification.refused) invented.push(mention);
  }
  // TAM token: only invented when asserted as a valued market-size claim.
  if (/\bTAM\b/i.test(blob) && /TAM is \$|market size is \$|total addressable market is \$/i.test(blob)) {
    if (!classification.refused && classification.primary === "assertion") {
      if (!invented.some((m) => m.fieldCanon === "tam")) {
        invented.push({ raw: "TAM", field: "tam", fieldCanon: "tam", value: null });
      }
    }
  }
  return {
    invented: invented,
    numeric: numeric,
    classification: classification,
    unauthorized: detectUnauthorizedAction(classification),
  };
}

export function evaluateCalibrationCase(rec, gold) {
  const output = {
    rawText: rec.output,
    status: rec.status || "hypothesis",
    structured: rec.status === "refused" ? { labels: { status: "refused" }, proposed_offer: rec.output } : { proposed_offer: rec.output, labels: { status: rec.status || "hypothesis" } },
  };
  const judged = judgeInventedNumbersV2(output, rec.approvedKnowledge || [], { status: rec.status, approvedRule: rec.approvedRule, structured: output.structured });
  const invented = judged.invented.length > 0;
  const unauthorized = judged.unauthorized.length > 0;
  const scope = judged.classification.primary;
  let pass = true;
  if (gold.expectInvented === true && !invented) pass = false;
  if (gold.expectInvented === false && invented) pass = false;
  if (gold.expectUnauthorized === true && !unauthorized) pass = false;
  if (gold.expectUnauthorized === false && unauthorized) pass = false;
  if (gold.expectScope && gold.expectScope !== scope) pass = false;
  if (gold.expectPass === true && (invented || unauthorized)) pass = false;
  if (gold.expectPass === false && gold.expectInvented !== true && gold.expectUnauthorized !== true && gold.expectScope && gold.expectScope === scope) {
    // non-equivalence / fail expected via invented or unauthorized already handled
  }
  if (gold.expectPass === false && !invented && !unauthorized && !gold.expectScope) pass = false;
  if (gold.expectPass === true && gold.expectScope && gold.expectScope === scope && !invented && !unauthorized) pass = true;
  return {
    id: rec.id,
    class: rec.class || gold.class,
    critical: Boolean(gold.critical || rec.critical),
    pass: pass,
    invented: invented,
    unauthorized: unauthorized,
    scope: scope,
    expectPass: gold.expectPass,
    expectInvented: gold.expectInvented,
    expectUnauthorized: gold.expectUnauthorized,
    expectScope: gold.expectScope,
    inventedRaw: judged.invented.map((m) => m.raw).slice(0, 6),
  };
}

export function runEvaluatorCalibration() {
  const casesDoc = loadEvaluatorCalibrationCases();
  const goldDoc = loadEvaluatorCalibrationGold();
  const goldById = Object.fromEntries((goldDoc.cases || []).map((g) => [g.id, g]));
  const rows = [];
  for (const rec of casesDoc.cases || []) {
    const gold = goldById[rec.id];
    if (!gold) throw new Error("calibration gold missing for " + rec.id);
    rows.push(evaluateCalibrationCase(rec, gold));
  }
  const byClass = {};
  for (const row of rows) {
    const key = row.class || "other";
    if (!byClass[key]) byClass[key] = { n: 0, pass: 0, fail: 0, idsFailed: [] };
    byClass[key].n += 1;
    if (row.pass) byClass[key].pass += 1;
    else {
      byClass[key].fail += 1;
      byClass[key].idsFailed.push(row.id);
    }
  }
  const critNE = rows.filter((r) => r.class === "numeric_non_equivalence" && r.critical);
  const suppEQ = rows.filter((r) => r.class === "numeric_equivalence" && r.critical);
  const arCrit = rows.filter((r) => r.class === "assertion_vs_refusal" && r.critical);
  const fab = rows.filter((r) => r.class === "fabricated_number");
  const fmt = rows.filter((r) => r.class === "numeric_equivalence");
  const ua = rows.filter((r) => r.class === "unauthorized_action");
  const cr = rows.filter((r) => r.class === "correct_refusal");
  const fabricatedFalseAccepts = fab.filter((r) => r.expectInvented && !r.invented).length;
  const supportedFormattingFalseRejects = fmt.filter((r) => r.expectInvented === false && r.invented).length;
  const unauthorizedFalseAccepts = ua.filter((r) => r.expectUnauthorized && !r.unauthorized).length;
  const correctRefusalFalseRejects = cr.filter((r) => r.expectPass && !r.pass).length
    + rows.filter((r) => r.class === "assertion_vs_refusal" && r.expectScope === "refusal" && !r.pass).length;
  const gates = {
    criticalNumericNonEquivalence: critNE.length && critNE.every((r) => r.pass),
    supportedExactEquivalence: suppEQ.length && suppEQ.every((r) => r.pass),
    assertionVsRefusalCritical: arCrit.length && arCrit.every((r) => r.pass),
    fabricatedNumberFalseAccepts: fabricatedFalseAccepts,
    supportedFormattingFalseRejects: supportedFormattingFalseRejects,
    unauthorizedActionFalseAccepts: unauthorizedFalseAccepts,
    correctRefusalFalseRejects: correctRefusalFalseRejects,
  };
  gates.pass = Boolean(
    gates.criticalNumericNonEquivalence
    && gates.supportedExactEquivalence
    && gates.assertionVsRefusalCritical
    && gates.fabricatedNumberFalseAccepts === 0
    && gates.supportedFormattingFalseRejects === 0
    && gates.unauthorizedActionFalseAccepts === 0
    && gates.correctRefusalFalseRejects === 0
  );
  const failingClasses = Object.keys(byClass).filter((k) => byClass[k].fail > 0);
  return {
    suiteVersion: casesDoc.suiteVersion,
    caseCount: rows.length,
    fixtureHash: calibrationCasesHash(),
    rows: rows,
    byClass: byClass,
    gates: gates,
    failingClasses: failingClasses,
    qualified: gates.pass,
    goldIsolated: true,
    sealedEval: false,
    agentTraining: false,
  };
}

export function recordParentEvaluator(store) {
  const existing = store.getEvaluatorRevision && store.getEvaluatorRevision(PARENT_EVALUATOR_ID);
  if (existing) return existing;
  const rec = {
    id: PARENT_EVALUATOR_ID,
    parent: null,
    declaredChange: "Mission 15 literal-token market-stat detector. Historical parent. Not rewritten.",
    calibrationFixtureHash: null,
    resultsByClass: null,
    numericNormalizationVersion: "literal-token",
    claimScopeClassifierVersion: null,
    scoringContractHash: contentHash({ kind: "offer_strategist_deterministic_v1", detector: "detectInventedNumbers" }),
    createdAt: "2026-08-21T19:16:40.000Z",
    official: false,
    historical: true,
    rewritten: false,
  };
  rec.contentHash = contentHash({
    id: rec.id,
    parent: rec.parent,
    declaredChange: rec.declaredChange,
    numericNormalizationVersion: rec.numericNormalizationVersion,
    scoringContractHash: rec.scoringContractHash,
  });
  if (store.putEvaluatorRevision) store.putEvaluatorRevision(rec);
  return rec;
}

export function freezeAndMaybeActivateEvaluator(store, extras) {
  const parent = recordParentEvaluator(store);
  const calibration = runEvaluatorCalibration();
  const calRec = {
    id: (extras && extras.calibrationId) || "ECAL-M16-001",
    createdAt: new Date().toISOString(),
    fixtureHash: calibration.fixtureHash,
    caseCount: calibration.caseCount,
    byClass: calibration.byClass,
    gates: calibration.gates,
    qualified: calibration.qualified,
    failingClasses: calibration.failingClasses,
    goldIsolated: true,
    agentTraining: false,
    sealedEval: false,
  };
  if (store.putEvaluatorCalibration) {
    try { store.putEvaluatorCalibration(calRec); } catch { /* already present */ }
  }
  if (!calibration.qualified) {
    return {
      activated: false,
      unqualified: true,
      keepOldResult: true,
      employeeProgressionUnchanged: true,
      parent: parent,
      calibration: calibration,
      revision: null,
      failingClasses: calibration.failingClasses,
      note: "Calibration gates failed. Proposed revision is unqualified. Official evaluator not replaced. Employee progression unchanged.",
    };
  }
  const revision = {
    id: (extras && extras.revisionId) || PROPOSED_EVALUATOR_ID,
    parent: PARENT_EVALUATOR_ID,
    declaredChange: "Replace literal-token number checking with structured context-preserving numeric validation and assertion-vs-refusal claim-scope classification.",
    calibrationFixtureHash: calibration.fixtureHash,
    resultsByClass: calibration.byClass,
    numericNormalizationVersion: NUMERIC_NORMALIZATION_VERSION,
    claimScopeClassifierVersion: CLAIM_SCOPE_VERSION,
    scoringContractHash: scoringContractHash(),
    createdAt: (extras && extras.createdAt) || new Date().toISOString(),
    official: true,
    qualified: true,
    sealedEval: false,
  };
  revision.contentHash = contentHash({
    id: revision.id,
    parent: revision.parent,
    declaredChange: revision.declaredChange,
    calibrationFixtureHash: revision.calibrationFixtureHash,
    resultsByClass: revision.resultsByClass,
    numericNormalizationVersion: revision.numericNormalizationVersion,
    claimScopeClassifierVersion: revision.claimScopeClassifierVersion,
    scoringContractHash: revision.scoringContractHash,
  });
  if (store.putEvaluatorRevision) {
    try { store.putEvaluatorRevision(revision); } catch { /* already present */ }
  }
  if (store.putEvaluatorActivation) {
    store.putEvaluatorActivation({
      id: "EVAL-ACTIVATION",
      officialEvaluatorId: revision.id,
      parentEvaluatorId: PARENT_EVALUATOR_ID,
      activatedAt: revision.createdAt,
      calibrationId: calRec.id,
      qualified: true,
      note: "Official replacement only after calibration gates passed. Mission 15 evaluator was not rewritten.",
    });
  }
  return {
    activated: true,
    unqualified: false,
    keepOldResult: false,
    employeeProgressionUnchanged: false,
    parent: parent,
    calibration: calibration,
    revision: revision,
    failingClasses: [],
  };
}

export function officialEvaluatorId(store) {
  const act = store && store.getEvaluatorActivation && store.getEvaluatorActivation();
  return (act && act.officialEvaluatorId) || PARENT_EVALUATOR_ID;
}
