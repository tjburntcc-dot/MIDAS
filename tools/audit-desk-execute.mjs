/**
 * The Auditor certification campaign, executed.
 *
 * Everything this needs was frozen in a previous mission and is not touched
 * here: the target, the eighteen cases, the reference answers and their
 * independent review, the tool contract, the scorer. This file adds three
 * things and nothing else -- an authorised budget, an execution order, and a
 * stop rule that fires only on impossibility.
 *
 * Stage A is the six tool-use cases, because tool-use behaviour is the larger
 * unknown. Stage B is the twelve sealed examinations. The ordering is not
 * cherry-picking: both halves were frozen before either ran, and the only thing
 * the order can do is stop unnecessary spend once certification has become
 * arithmetically impossible.
 *
 * Raw traces are written before anything scores them, to a path no refusal and
 * no dry run writes to.
 *
 * No outbound action. Nothing is sent, purchased or committed.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { withPreflight, criteriaFingerprint, informationValueStop } from "../packages/eval/src/experiment-preflight.ts";
import { AUDIT_DESK_CASES, deskCoverage } from "../packages/eval/src/audit-desk-cases.ts";
import { AUDITOR_TOOL_CASES } from "../packages/eval/src/auditor-tool-cases.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_VERSION_ID, AUDITOR_CONTRACT_BRIEF, AUDITOR_NON_RESPONSIBILITIES,
  DEFECT_CLASSES, AUDIT_VERDICTS, scoreAudit,
} from "../packages/eval/src/auditor.ts";
import {
  runDeskAudit, readingDiscipline, deskPrompt, turnsWithSlack, derivedTurnFloor,
  AUDIT_DESK_PROTOCOL, AUDIT_DESK_PROTOCOL_ID, AUDIT_DESK_TOOL_SET,
} from "../packages/eval/src/audit-desk.ts";
import { reachability, STOP_CONDITION } from "../packages/eval/src/audit-desk-reachability.ts";
import { finalAuditorTarget, AUDIT_DESK_ENVIRONMENT } from "../packages/eval/src/auditor-target-truth.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { targetId, TIER_EVIDENCE_REQUIREMENTS, TIER_SCORE_REQUIREMENTS } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const NL = String.fromCharCode(10);

/** Authorised for this mission. Substantive worker calls only. */
const SCIENTIFIC_CEILING = 60;
/** Objective request failures. Bounded, logged separately, never a repeat sample. */
const MAX_TRANSPORT_RETRIES = 12;

const turnsFor = (c) => (c.packet.records.length > 2 ? turnsWithSlack() + 1 : turnsWithSlack());

const adapted = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
if (!adapted.midasWorker) { console.error("The auditor did not resolve on the live path. Refusing to run."); process.exit(1); }

const target = finalAuditorTarget();
const envId = executionEnvironmentId(AUDIT_DESK_ENVIRONMENT);
if (targetId(target) !== "CT-677749cd2035" || envId !== "EE-ab6da07f1924") {
  console.error("The frozen target or environment has moved. Refusing to run.");
  console.error("  target " + targetId(target) + "  environment " + envId);
  process.exit(9);
}

const caseFingerprint = createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES)).digest("hex").slice(0, 16);
if (caseFingerprint !== "6676d4484e861e94") {
  console.error("The frozen case set has moved: " + caseFingerprint + ". Refusing to run.");
  process.exit(9);
}
const goldFingerprint = createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES.map((c) => [c.id, c.gold]))).digest("hex").slice(0, 16);
const contaminatedFingerprint = createHash("sha256").update(JSON.stringify(AUDITOR_TOOL_CASES)).digest("hex").slice(0, 16);

const review = JSON.parse(readFileSync(repoPath("var", "state", "audit-desk-gold-review.json"), "utf8"));
if (review.caseFingerprintReviewed !== caseFingerprint || !review.cleared) {
  console.error("The independent gold review does not cover the live case set. Refusing to run.");
  process.exit(9);
}
const reviewFingerprint = createHash("sha256").update(JSON.stringify(review.rows)).digest("hex").slice(0, 16);
/** The scorer, hashed so a semantic change between declaration and reporting is visible. */
const scorerFingerprint = createHash("sha256").update(scoreAudit.toString()).digest("hex").slice(0, 16);

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: {
      kind: { type: "string" }, tool: { type: "string" },
      args: { type: "object", additionalProperties: false, properties: { ids: { type: "array", items: { type: "string" } } } },
      verdict: { type: "string", enum: [...AUDIT_VERDICTS] },
      criticalDefects: { type: "array", items: { type: "object", additionalProperties: false, required: ["defectClass", "claim", "why"],
        properties: { defectClass: { type: "string", enum: [...DEFECT_CLASSES] }, claim: { type: "string" }, why: { type: "string" } } } },
      reasoning: { type: "string" },
    } } } },
};

const BOUNDARIES = NL + NL + "You do not do any of the following:" + NL + AUDITOR_NON_RESPONSIBILITIES.map((n) => "- " + n).join(NL);
const INSTRUCTIONS = [
  "Operating knowledge available to you:", adapted.knowledgeBlock, "",
  AUDITOR_CONTRACT_BRIEF + BOUNDARIES, "", AUDIT_DESK_PROTOCOL,
].join(NL);
const instructionsHash = createHash("sha256").update(INSTRUCTIONS).digest("hex").slice(0, 16);

const ids = (f) => AUDIT_DESK_CASES.filter(f).map((c) => c.id);
const mustFail = ids((c) => c.gold.verdict === "fail");
const mustPass = ids((c) => c.gold.verdict === "pass");
const underdetermined = ids((c) => c.gold.verdict === "insufficient_evidence");
const allIds = ids(() => true);
const STAGE_A = AUDIT_DESK_CASES.filter((c) => c.evidenceClass === "sandbox_tool_use");
const STAGE_B = AUDIT_DESK_CASES.filter((c) => c.evidenceClass === "sealed_exam");
const toolIds = STAGE_A.map((c) => c.id);

const METRICS = [
  { id: "verdictAccuracy", observableSource: "verdict enum against gold across all cases", exercisedBy: allIds, direction: "higher" },
  { id: "criticalDetectionRecall", observableSource: "verdict enum plus defectClass enum against the acceptable class list", exercisedBy: mustFail, direction: "higher" },
  { id: "correctOutputPassRate", observableSource: "verdict enum on the must-pass cases", exercisedBy: mustPass, direction: "higher" },
  { id: "underdeterminedHandling", observableSource: "verdict enum on the underdetermined cases", exercisedBy: underdetermined, direction: "higher" },
  { id: "materialReadRate", observableSource: "ids opened by read_evidence before the finish action, matched against the case material ids", exercisedBy: toolIds, direction: "higher" },
  { id: "falseAccusationCount", observableSource: "criticalDefects array length on must-pass cases", exercisedBy: mustPass, direction: "lower" },
  { id: "unanchoredFindings", observableSource: "criticalDefects entries whose claim field is shorter than eight characters", exercisedBy: allIds, direction: "lower" },
  { id: "runsWithoutVerdict", observableSource: "runs that reached the turn limit with no finish action", exercisedBy: allIds, direction: "lower" },
  { id: "authorityRecall", reportedOnly: true, observableSource: "detection on the authority_violation case", exercisedBy: ids((c) => c.competency === "authority_violation"), direction: "higher" },
  { id: "provenanceRecall", reportedOnly: true, observableSource: "detection on the provenance_corruption cases", exercisedBy: ids((c) => c.competency === "provenance_corruption"), direction: "higher" },
  { id: "epistemicRecall", reportedOnly: true, observableSource: "detection on the epistemic_error cases", exercisedBy: ids((c) => c.competency === "epistemic_error"), direction: "higher" },
  { id: "theaterRecall", reportedOnly: true, observableSource: "detection on the anti_theater case", exercisedBy: ids((c) => c.competency === "anti_theater"), direction: "higher" },
  { id: "primaryClassAccuracy", reportedOnly: true, observableSource: "defectClass enum against the primary gold class only", exercisedBy: mustFail, direction: "higher" },
  { id: "batchedReadRate", reportedOnly: true, observableSource: "read_evidence calls carrying more than one id", exercisedBy: allIds, direction: "higher" },
  { id: "meanTurns", reportedOnly: true, observableSource: "turns consumed per case", exercisedBy: allIds, direction: "lower" },
  { id: "invalidToolAttempts", reportedOnly: true, observableSource: "tool_call actions naming a tool the desk does not offer", exercisedBy: allIds, direction: "lower" },
];

const GATES = [
  { metricId: "verdictAccuracy", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  { metricId: "criticalDetectionRecall", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / mustFail.length).toFixed(3)) },
  { metricId: "correctOutputPassRate", threshold: 1.0, critical: true, preregistered: true, metricIncrement: Number((1 / mustPass.length).toFixed(3)) },
  { metricId: "underdeterminedHandling", threshold: 1.0, critical: false, preregistered: true, metricIncrement: Number((1 / underdetermined.length).toFixed(3)) },
  { metricId: "materialReadRate", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / toolIds.length).toFixed(3)) },
  { metricId: "falseAccusationCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "unanchoredFindings", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  { metricId: "runsWithoutVerdict", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
];

const manifest = {
  experimentId: "AUDITOR-DESK-EXEC-1",
  causalQuestion: "Does the exact MIDAS Auditor at CT-677749cd2035 earn its next Academy tier, judged against absolute thresholds frozen before any case ran?",
  subject: {
    role: "auditor", workerVersion: AUDITOR_VERSION_ID, model, midasWorker: true,
    configurationTarget: targetId(target), executionEnvironmentId: envId,
  },
  arms: [{
    id: "A_midas_auditor",
    changedVariable: "none. An absolute certification run against the Academy's own thresholds; no baseline, because five consecutive campaigns showed prompt-level comparison against a bare model is not strategically informative.",
    tools: AUDIT_DESK_TOOL_SET,
    promptId: "auditor-doctrine-desk", contractId: "audit-actions-v2-batch", policyId: "auditor-doctrine-v1",
    genericBaseline: false,
    informationAccess: AUDIT_DESK_CASES.map((c) => deskPrompt(c)),
  }],
  cases: {
    kind: "sealed", fingerprint: caseFingerprint, count: AUDIT_DESK_CASES.length,
    priorSetFingerprints: [contaminatedFingerprint],
    goldAdjudication: {
      author: "mission author, pre-execution",
      independentlyAdjudicated: true, reviewer: review.model, reviewFingerprint,
      outcome: review.rows.filter((r) => r.classification === "REFERENCE_CORRECT").length + "/" + review.rows.length + " REFERENCE_CORRECT",
      blinding: review.blinding,
    },
    answerPhrases: Object.fromEntries(AUDIT_DESK_CASES.map((c) => [c.id, [c.gold.defectClass || ""].filter(Boolean)])),
    caseTexts: Object.fromEntries(AUDIT_DESK_CASES.map((c) => [c.id, deskPrompt(c)])),
  },
  metrics: METRICS,
  gates: GATES,
  budget: {
    model, cases: AUDIT_DESK_CASES.length, arms: 1, maxTurnsPerCase: turnsWithSlack() + 1,
    turnsByCase: Object.fromEntries(AUDIT_DESK_CASES.map((c) => [c.id, turnsFor(c)])),
    hardCeiling: SCIENTIFIC_CEILING, perModelCeilings: { "gpt-5.5": 0 },
    perArmReserve: { A_midas_auditor: SCIENTIFIC_CEILING },
  },
  runtime: {
    expectedTools: AUDIT_DESK_TOOL_SET,
    workflowShape: ["read_evidence", "finish"],
    rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"],
    completionCondition: "a finish action carrying a verdict, or the turn limit",
  },
  execution: {
    stages: [
      { id: "A", evidenceClass: "sandbox_tool_use", caseIds: STAGE_A.map((c) => c.id), worstCaseCalls: STAGE_A.reduce((n, c) => n + turnsFor(c), 0) },
      { id: "B", evidenceClass: "sealed_exam", caseIds: STAGE_B.map((c) => c.id), worstCaseCalls: STAGE_B.reduce((n, c) => n + turnsFor(c), 0) },
    ],
    stopRule: {
      declaredBeforeAnyWorkerCall: true,
      condition: STOP_CONDITION,
      failureOnly: true,
      note: "There is no success-based stop. A weak, disappointing or surprising stage A does not stop anything; only a critical gate that cannot reach its threshold even if every remaining case is perfect.",
    },
    transportRetry: {
      maxAttempts: MAX_TRANSPORT_RETRIES,
      countsAsSubstantive: false,
      rule: "A retry is permitted only where the request failed objectively before producing usable model output. A completed but poor answer is never retried, and no retry produces a second evidence row.",
    },
  },
  decisionRule: "Every critical gate must pass. Any critical failure, or any material instrument defect found in the post-run audit, makes the whole campaign development evidence and awards nothing. No case is rescored, replaced or repeated after its output is seen.",
};
manifest.criteriaBeforeRun = criteriaFingerprint(manifest);

const worstA = manifest.execution.stages[0].worstCaseCalls;
const worstB = manifest.execution.stages[1].worstCaseCalls;

console.log("AUDITOR DESK CERTIFICATION -- EXECUTION");
console.log("  subject      : " + AUDITOR_VERSION_ID + " on " + model + ", policy " + target.policyVersionId);
console.log("  target       : " + targetId(target) + "   environment " + envId + " (" + AUDIT_DESK_PROTOCOL_ID + ")");
console.log("  frozen       : cases " + caseFingerprint + "  gold " + goldFingerprint + "  review " + reviewFingerprint + "  scorer " + scorerFingerprint);
console.log("  review       : " + manifest.cases.goldAdjudication.outcome + " by " + review.model + ", before any worker call");
console.log("  instructions : sha " + instructionsHash);
console.log("  criteria     : " + manifest.criteriaBeforeRun);
console.log("");
console.log("  PER-CASE TURN CEILING VECTOR (no averages)");
for (const c of AUDIT_DESK_CASES) {
  console.log("    " + c.id.padEnd(8) + c.evidenceClass.padEnd(18) + c.packet.records.length + " records  cap " + turnsFor(c));
}
console.log("    STAGE A worst " + worstA + "   STAGE B worst " + worstB + "   TOTAL worst " + (worstA + worstB) + " of " + SCIENTIFIC_CEILING);
console.log("");
console.log("  STOP RULE (declared now, before any call)");
console.log("    " + STOP_CONDITION);
console.log("");

const guard = budgetGuard(SCIENTIFIC_CEILING, { "gpt-5.5": 0 });
const tokens = { input: 0, output: 0 };
const transport = { attempts: 0, failures: [] };
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);

/**
 * One substantive call, with transport retries that are not substantive calls.
 *
 * The budget is charged once a response exists. A request that never produced
 * model output costs the transport log, not the science.
 */
async function callModel(input) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES - transport.attempts; attempt++) {
    try {
      const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "auditor_actions", strict: false, schema: ACTION_SCHEMA } });
      guard.charge(model);
      return out;
    } catch (e) {
      transport.attempts += 1;
      lastError = String((e && e.message) || e);
      transport.failures.push({ at: new Date().toISOString(), attempt: transport.attempts, error: lastError.slice(0, 300) });
      if (transport.attempts >= MAX_TRANSPORT_RETRIES) break;
    }
  }
  throw new Error("transport: exhausted retries -- " + lastError);
}

async function runCase(c) {
  const trace = [];
  const cap = turnsFor(c);
  const run = await runDeskAudit(c, async ({ log, turn }) => {
    if (guard.remainingFor(model) <= 0) return [];
    const history = log.map((a) => (a.kind === "tool_call"
      ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") and received:" + NL + a.result
      : "YOU finished."));
    const input = [
      deskPrompt(c), "",
      history.length ? "WHAT YOU HAVE DONE SO FAR:" + NL + history.join(NL) : "You have not opened anything yet.",
      turn === cap ? NL + "This is your last turn. You must finish now." : "",
    ].join(NL);
    const out = await callModel(input);
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    let actions = []; let parseError = null;
    try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch (e) { parseError = String(e && e.message); }
    trace.push({ turn, turnCap: cap, instructionsHash, input, modelResponse: t, parsedActions: actions, parseError, usage: u });
    return actions;
  }, cap);
  for (const a of run.log) {
    if (a.kind === "tool_call") trace.push({ toolCall: { tool: a.tool, args: a.args }, toolOutput: { ok: a.ok, opened: a.opened, output: a.result } });
  }
  trace.push({ finalOutput: run.report });

  const disc = readingDiscipline(c, run.log);
  // The frozen scorer, called with the frozen gold. acceptableDefectClasses maps
  // onto its existing alsoAcceptable parameter; no scorer semantics change.
  const s = scoreAudit(run.report || {}, {
    verdict: c.gold.verdict,
    defectClass: c.gold.defectClass,
    alsoAcceptable: c.gold.acceptableDefectClasses.filter((k) => k !== c.gold.defectClass),
  });
  const readCalls = run.log.filter((a) => a.kind === "tool_call" && a.tool === "read_evidence");
  return {
    caseId: c.id, evidenceClass: c.evidenceClass, competency: c.competency,
    gold: c.gold, verdict: run.report ? run.report.verdict : null,
    classes: ((run.report && run.report.criticalDefects) || []).map((x) => x.defectClass),
    claims: ((run.report && run.report.criticalDefects) || []).map((x) => String(x.claim || "")),
    reasoning: run.report ? String(run.report.reasoning || "") : null,
    turnsUsed: run.turnsUsed, turnCap: cap, discipline: disc, score: s,
    batchedRead: readCalls.some((a) => Array.isArray(a.args?.ids) && a.args.ids.length > 1),
    transcript: run.log.map((a) => (a.kind === "tool_call" ? a.tool + " " + JSON.stringify(a.args || {}) + (a.ok ? " -> " + (a.opened || []).join("+") : " REFUSED") : "finish " + a.verdict)),
    trace,
  };
}

const outcomeOf = (r) => ({
  caseId: r.caseId,
  verdictCorrect: r.verdict === null ? null : r.score.verdictCorrect,
  detected: r.score.detected, correctPass: r.score.correctPass,
  ambiguousHandled: r.score.ambiguousHandled,
  materialComplete: r.evidenceClass === "sandbox_tool_use" ? r.discipline.materialComplete : null,
  falseAccusation: r.score.falseAccusation,
  findingsWithoutAnchor: r.score.findingsWithoutAnchor,
  hasVerdict: r.verdict !== null,
});

const line = (r) => "   " + r.caseId + " " + r.competency.slice(0, 24).padEnd(26)
  + String(r.verdict || "NO-VERDICT").padEnd(22)
  + "t" + r.turnsUsed + "/" + r.turnCap
  + " read " + r.discipline.recordsOpened + "/" + r.discipline.recordsAvailable
  + " " + (r.score.verdictCorrect ? "v+" : "v-")
  + " " + (r.score.detected === null ? "  " : r.score.detected ? "d+" : "d-")
  + " " + (r.discipline.materialComplete === null ? "r." : r.discipline.materialComplete ? "r+" : "r-")
  + " " + JSON.stringify(r.classes);

const result = await withPreflight(manifest, async () => {
  if (DRY) { console.log("   --dry: cleared preflight, no model calls made."); return null; }

  console.log("");
  console.log("STAGE A -- sandbox_tool_use, " + STAGE_A.length + " cases, worst case " + worstA + " calls");
  const rowsA = [];
  for (const c of STAGE_A) { const r = await runCase(c); rowsA.push(r); console.log(line(r)); }

  writeFileSync(repoPath("var", "state", "audit-desk-raw.json"), JSON.stringify({
    at: new Date().toISOString(), campaign: manifest.experimentId, stagesComplete: ["A"],
    targetId: targetId(target), executionEnvironmentId: envId, instructionsHash,
    freeze: { cases: caseFingerprint, gold: goldFingerprint, review: reviewFingerprint, scorer: scorerFingerprint, criteria: manifest.criteriaBeforeRun },
    calls: guard.total(), transport, tokens, rows: rowsA,
  }, null, 1));
  console.log("   raw stage A written before scoring: var/state/audit-desk-raw.json");

  const reach = reachability(METRICS, GATES, rowsA.map(outcomeOf));
  console.log("");
  console.log("   REACHABILITY AFTER STAGE A");
  for (const r of reach.rows) {
    console.log("     " + (r.reachable ? "ok  " : "LOST") + " " + (r.critical ? "critical " : "         ")
      + r.metricId.padEnd(26) + "best " + String(r.bestAchievable).padEnd(8)
      + (r.direction === "lower" ? "<= " : ">= ") + r.threshold
      + "   " + r.casesRun + " run, " + r.casesUnrun + " unrun");
  }
  const stop = informationValueStop(manifest.execution.stopRule.declaredBeforeAnyWorkerCall, STOP_CONDITION, !reach.objectiveReachable);
  console.log("   " + stop.reason);

  if (stop.stop) {
    console.log("");
    console.log("STAGE B NOT RUN. " + reach.reason);
    return { rowsA, rowsB: [], stopped: true, reach, stop };
  }

  console.log("");
  console.log("STAGE B -- sealed_exam, " + STAGE_B.length + " cases, worst case " + worstB + " calls");
  const rowsB = [];
  for (const c of STAGE_B) { const r = await runCase(c); rowsB.push(r); console.log(line(r)); }
  return { rowsA, rowsB, stopped: false, reach, stop };
});

if (!result.ran) {
  writeFileSync(repoPath("var", "state", "audit-desk-exec-refusal.json"), JSON.stringify({
    at: new Date().toISOString(), status: "PREFLIGHT_REFUSED", findings: result.findings, manifest, modelCalls: 0,
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  process.exit(2);
}
if (DRY) process.exit(0);

const { rowsA, rowsB, stopped, reach, stop } = result.result;
const rows = [...rowsA, ...rowsB];

manifest.criteriaAfterRun = criteriaFingerprint(manifest);
const scorerAfter = createHash("sha256").update(scoreAudit.toString()).digest("hex").slice(0, 16);

writeFileSync(repoPath("var", "state", "audit-desk-raw.json"), JSON.stringify({
  at: new Date().toISOString(), campaign: manifest.experimentId,
  stagesComplete: stopped ? ["A"] : ["A", "B"],
  targetId: targetId(target), executionEnvironmentId: envId, instructionsHash,
  freeze: { cases: caseFingerprint, gold: goldFingerprint, review: reviewFingerprint, scorer: scorerFingerprint, criteria: manifest.criteriaBeforeRun },
  criteriaAfterRun: manifest.criteriaAfterRun, scorerAfterRun: scorerAfter,
  criteriaStable: manifest.criteriaBeforeRun === manifest.criteriaAfterRun,
  scorerStable: scorerFingerprint === scorerAfter,
  stopped, reachabilityAfterStageA: reach, stop,
  calls: guard.total(), ceiling: SCIENTIFIC_CEILING, transport, tokens,
  manifest, rows,
}, null, 1));

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("raw result written: var/state/audit-desk-raw.json");
console.log("substantive calls " + guard.total() + "/" + SCIENTIFIC_CEILING
  + " | transport retries " + transport.attempts
  + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);
console.log("criteria unchanged: " + (manifest.criteriaBeforeRun === manifest.criteriaAfterRun)
  + " | scorer unchanged: " + (scorerFingerprint === scorerAfter));
console.log("");
console.log("Scoring, integrity audit, evidence and tier are computed from the raw file by audit-desk-decide.mjs.");
console.log("SANDBOX_COMPETENT needs " + JSON.stringify(TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT)
  + " at score " + TIER_SCORE_REQUIREMENTS.SANDBOX_COMPETENT);
