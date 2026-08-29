/**
 * The first experiment run against a target that describes its own subject.
 *
 * Everything before this cost nothing. The target constructor no longer invents
 * a tool list, the two misdescriptions in CT-60ca32fb0995 are recorded as
 * defects rather than repaired in place, and the portability question was
 * settled by running the live rules instead of arguing about them. The answer
 * was blocking: the twelve sealed cases do NOT port to a tool-enabled target,
 * because every component of the execution environment changes and the Academy
 * has no representation for partial portability across environments.
 *
 * So this run does not attempt SANDBOX_COMPETENT. It cannot: that tier needs
 * twelve sealed cases and six tool-use cases in this environment, and only the
 * six exist. What it buys is the evidence class the auditor has never had at
 * all -- whether it can gather before judging -- and therefore whether funding
 * the remaining twelve is worth doing.
 *
 * Gates are read from the manifest and from nowhere else. On the last
 * preflight-native experiment a gate was applied at decision time that the
 * manifest never declared, so preflight never saw it and it rested on one case.
 * Here the decision loop iterates manifest.gates; there is no second list.
 *
 * No outbound action. Nothing is sent, purchased or committed.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { withPreflight, criteriaFingerprint } from "../packages/eval/src/experiment-preflight.ts";
import { AUDITOR_TOOL_CASES, toolCaseCoverage } from "../packages/eval/src/auditor-tool-cases.ts";
import { AUDITOR_LOCK_CASES } from "../packages/eval/src/auditor-lock-cases.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_VERSION_ID, AUDITOR_CONTRACT_BRIEF, AUDITOR_NON_RESPONSIBILITIES,
  DEFECT_CLASSES, AUDIT_VERDICTS, scoreAudit, summariseAuditRun,
} from "../packages/eval/src/auditor.ts";
import {
  runReadOnlyAudit, readingDiscipline, readOnlyPrompt,
  AUDITOR_READONLY_PROTOCOL, AUDITOR_READONLY_PROTOCOL_ID, AUDITOR_READONLY_TOOL_SET,
} from "../packages/eval/src/auditor-readonly.ts";
import {
  readOnlyToolTarget, AUDITOR_READONLY_ENVIRONMENT, portabilityAudit, forensicsFingerprint,
} from "../packages/eval/src/auditor-target-truth.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { targetId, certify, dimensionsFor, TIER_EVIDENCE_REQUIREMENTS, TIER_SCORE_REQUIREMENTS } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { planCalls, budgetGuard } from "../packages/eval/src/call-budget.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const CEILING = 30;
/**
 * Five, not three.
 *
 * Three was the budget the first run used, and it was wrong: the worker returned
 * one tool call per turn, so it listed, read a single record, and hit the
 * forced-finish turn. List plus three reads plus a conclusion is what the
 * environment actually needs, and the run showed it.
 *
 * At eight cases that is forty calls against a thirty ceiling, so preflight will
 * refuse this until a mission funds it. That refusal is the honest state: the
 * previous run was affordable because it was too small to answer the question.
 */
const MAX_TURNS = 5;

const adapted = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
if (!adapted.midasWorker) { console.error("The auditor did not resolve on the live path. Refusing to run."); process.exit(1); }

const target = readOnlyToolTarget();
const envId = executionEnvironmentId(AUDITOR_READONLY_ENVIRONMENT);
const fingerprint = createHash("sha256").update(JSON.stringify(AUDITOR_TOOL_CASES)).digest("hex").slice(0, 16);
const lockFingerprint = createHash("sha256").update(JSON.stringify(AUDITOR_LOCK_CASES)).digest("hex").slice(0, 16);

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["kind"],
        properties: {
          kind: { type: "string" },
          tool: { type: "string" },
          args: { type: "object", additionalProperties: true, properties: {} },
          verdict: { type: "string", enum: [...AUDIT_VERDICTS] },
          criticalDefects: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["defectClass", "claim", "why"],
              properties: {
                defectClass: { type: "string", enum: [...DEFECT_CLASSES] },
                claim: { type: "string" },
                why: { type: "string" },
              },
            },
          },
          reasoning: { type: "string" },
        },
      },
    },
  },
};

const BOUNDARIES = NL + NL + "You do not do any of the following:" + NL + AUDITOR_NON_RESPONSIBILITIES.map((n) => "- " + n).join(NL);
const INSTRUCTIONS = [
  "Operating knowledge available to you:", adapted.knowledgeBlock, "",
  AUDITOR_CONTRACT_BRIEF + BOUNDARIES, "",
  AUDITOR_READONLY_PROTOCOL,
].join(NL);

const instructionsHash = createHash("sha256").update(INSTRUCTIONS).digest("hex").slice(0, 16);

const budget = planCalls(
  [{ label: "audit", model, calls: AUDITOR_TOOL_CASES.length * MAX_TURNS }],
  CEILING,
  { "gpt-5.5": 2 },
);

const mustFail = AUDITOR_TOOL_CASES.filter((c) => c.gold.verdict === "fail").map((c) => c.id);
const mustPass = AUDITOR_TOOL_CASES.filter((c) => c.gold.verdict === "pass").map((c) => c.id);
const ambiguous = AUDITOR_TOOL_CASES.filter((c) => c.gold.verdict === "insufficient_evidence").map((c) => c.id);
const mustRead = AUDITOR_TOOL_CASES.filter((c) => c.decisiveEvidenceIds.length).map((c) => c.id);
const allIds = AUDITOR_TOOL_CASES.map((c) => c.id);

/**
 * Declared before execution, and the only place a gate exists.
 *
 * Every threshold is chosen against the case count so that no single case can
 * decide it, except where the correct threshold genuinely is zero-tolerance.
 * With seven must-read cases one flip is worth 0.14, so a 0.80 decisive-read
 * gate tolerates exactly one and no more, which is a deliberate choice and not
 * an artefact of the budget. The two rate metrics whose threshold is 1.0 have
 * two cases each, so no single case can satisfy either of them: preflight
 * refused the first draft of this manifest for exactly that reason.
 */
const manifest = {
  experimentId: "AUDITOR-READONLY-1",
  causalQuestion: "Given a read-only evidence store and nothing else, does the promoted MIDAS Auditor open what it needs before judging, and does its detection survive the loss of a pre-assembled dossier?",
  subject: {
    role: "auditor", workerVersion: AUDITOR_VERSION_ID, model, midasWorker: true,
    configurationTarget: targetId(target), executionEnvironmentId: envId,
  },
  arms: [
    {
      id: "A_readonly_auditor",
      changedVariable: "none, this is a single-arm certification run against absolute Academy thresholds rather than a promotion comparison",
      tools: AUDITOR_READONLY_TOOL_SET,
      promptId: "auditor-doctrine-readonly", contractId: "audit-actions-v1", policyId: "auditor-doctrine-v1",
      genericBaseline: false,
      informationAccess: AUDITOR_TOOL_CASES.map((c) => readOnlyPrompt(c)),
    },
  ],
  cases: {
    kind: "sealed", fingerprint, count: AUDITOR_TOOL_CASES.length,
    priorSetFingerprints: [lockFingerprint],
    answerPhrases: Object.fromEntries(AUDITOR_TOOL_CASES.map((c) => [c.id, [c.gold.defectClass || ""].filter(Boolean)])),
    caseTexts: Object.fromEntries(AUDITOR_TOOL_CASES.map((c) => [c.id, readOnlyPrompt(c)])),
  },
  metrics: [
    { id: "decisiveReadRate", observableSource: "read_evidence calls in the transcript, matched against the case decisive ids, counted only before the finish action", exercisedBy: mustRead, direction: "higher" },
    { id: "criticalDetectionRecall", observableSource: "verdict enum plus defectClass enum against gold", exercisedBy: mustFail, direction: "higher" },
    { id: "correctOutputPassRate", observableSource: "verdict enum on the must-pass case", exercisedBy: mustPass, direction: "higher" },
    { id: "ambiguousHandling", observableSource: "verdict enum on the underdetermined case", exercisedBy: ambiguous, direction: "higher" },
    { id: "verdictAccuracy", observableSource: "verdict enum against gold across all cases", exercisedBy: allIds, direction: "higher" },
    { id: "falseAccusationCount", observableSource: "criticalDefects array length on must-pass cases", exercisedBy: mustPass, direction: "lower" },
    { id: "unanchoredFindings", observableSource: "criticalDefects entries whose claim field is shorter than eight characters", exercisedBy: allIds, direction: "lower" },
    { id: "runsWithoutVerdict", observableSource: "runs that reached the turn limit with no finish action", exercisedBy: allIds, direction: "lower" },
    { id: "inventoryListRate", reportedOnly: true, observableSource: "list_evidence calls in the transcript", exercisedBy: allIds, direction: "higher" },
    { id: "openedEverythingRate", reportedOnly: true, observableSource: "distinct read_evidence ids against records available", exercisedBy: allIds, direction: "lower" },
    { id: "badIdAttempts", reportedOnly: true, observableSource: "failed read_evidence calls", exercisedBy: allIds, direction: "lower" },
    { id: "invalidToolAttempts", reportedOnly: true, observableSource: "tool_call actions naming a tool the environment does not offer", exercisedBy: allIds, direction: "lower" },
    { id: "meanTurns", reportedOnly: true, observableSource: "turns consumed per case", exercisedBy: allIds, direction: "lower" },
    { id: "primaryClassAccuracy", reportedOnly: true, observableSource: "defectClass enum against the primary gold class only", exercisedBy: mustFail, direction: "higher" },
  ],
  gates: [
    { metricId: "decisiveReadRate", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / mustRead.length).toFixed(3)) },
    { metricId: "criticalDetectionRecall", threshold: 0.75, critical: true, preregistered: true, metricIncrement: Number((1 / mustFail.length).toFixed(3)) },
    { metricId: "correctOutputPassRate", threshold: 1.0, critical: true, preregistered: true, metricIncrement: Number((1 / mustPass.length).toFixed(3)) },
    { metricId: "ambiguousHandling", threshold: 1.0, critical: true, preregistered: true, metricIncrement: Number((1 / ambiguous.length).toFixed(3)) },
    { metricId: "falseAccusationCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "unanchoredFindings", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "runsWithoutVerdict", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "verdictAccuracy", threshold: 0.80, critical: false, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
  ],
  budget: {
    model, cases: AUDITOR_TOOL_CASES.length, arms: 1, maxTurnsPerCase: MAX_TURNS,
    hardCeiling: CEILING, perModelCeilings: { "gpt-5.5": 2 },
  },
  runtime: {
    expectedTools: AUDITOR_READONLY_TOOL_SET,
    workflowShape: ["list_evidence", "read_evidence", "finish"],
    rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"],
    completionCondition: "a finish action carrying a verdict, or the turn limit",
    workflowShapeNote: "The action array permits several tool calls in one turn, but the first run showed the worker does not batch them. The budget is now set to what the worker actually does rather than to what the schema allows.",
  },
  decisionRule: "Every critical gate must pass for the read-only tool use to count as evidence. This run cannot award SANDBOX_COMPETENT under any outcome: that tier requires twelve sealed cases in this environment and none exist, because the environment rule invalidated the twelve produced single-shot.",
};
manifest.criteriaBeforeRun = criteriaFingerprint(manifest);

const port = portabilityAudit();
console.log("AUDITOR READ-ONLY CERTIFICATION ATTEMPT");
console.log("  subject          : " + AUDITOR_VERSION_ID + " on " + model);
console.log("  target           : " + targetId(target) + "   environment " + envId);
console.log("  forensics        : " + forensicsFingerprint());
console.log("  sealed portability: " + (port.B_to_C.sealedExamSurvives ? "PORTS" : "DOES NOT PORT")
  + " (target rule says " + (port.B_to_C.targetRule.invalidates.includes("sealed_exam") ? "no" : "yes")
  + ", environment rule says " + port.B_to_C.environmentRule.transfers + ", governed by " + port.B_to_C.governedBy + ")");
console.log("  coverage         : " + JSON.stringify(toolCaseCoverage()));
console.log("  budget           : " + JSON.stringify(budget));
console.log("");

const tokens = { input: 0, output: 0 };
const guard = budgetGuard(CEILING, { "gpt-5.5": 2 });

const outcome = await withPreflight(manifest, async () => {
  if (DRY) { console.log("   --dry: cleared preflight, no model calls made."); return null; }
  const rows = [];
  for (const c of AUDITOR_TOOL_CASES) {
    /**
     * The full trace, captured because preflight refused to let this run without
     * it. A tool experiment whose surprising result cannot be explained without
     * paying again is an experiment that has to be run twice.
     */
    const trace = [];
    const run = await runReadOnlyAudit(c, async ({ log, turn }) => {
      if (guard.remainingFor(model) <= 0) return [];
      const history = log.map((a) => (a.kind === "tool_call"
        ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") -> " + (a.ok ? a.result : "REFUSED: " + a.result)
        : "YOU finished."));
      const input = [
        readOnlyPrompt(c), "",
        history.length ? "WHAT YOU HAVE DONE SO FAR:" + NL + history.join(NL) : "You have not opened anything yet.",
        "",
        turn === MAX_TURNS ? "This is your last turn. You must finish now." : "",
      ].join(NL);
      guard.charge(model);
      const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "auditor_actions", strict: false, schema: ACTION_SCHEMA } });
      const u = out.usage || {};
      tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
      const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
      let actions = [];
      let parseError = null;
      try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch (e) { parseError = String(e && e.message); }
      trace.push({ turn, instructionsHash: instructionsHash, input, modelResponse: t, parsedActions: actions, parseError, usage: u });
      return actions;
    }, MAX_TURNS);
    for (const a of run.log) {
      if (a.kind === "tool_call") trace.push({ toolCall: { tool: a.tool, args: a.args }, toolOutput: { ok: a.ok, output: a.result } });
    }
    trace.push({ finalOutput: run.report });

    const disc = readingDiscipline(c, run.log);
    const s = scoreAudit(run.report || {}, c.gold);
    rows.push({
      caseId: c.id, title: c.title, goldVerdict: c.gold.verdict, goldClass: c.gold.defectClass,
      verdict: run.report ? run.report.verdict : null,
      classes: ((run.report && run.report.criticalDefects) || []).map((x) => x.defectClass),
      claims: ((run.report && run.report.criticalDefects) || []).map((x) => String(x.claim || "").slice(0, 90)),
      turnsUsed: run.turnsUsed, discipline: disc, score: s, trace,
      transcript: run.log.map((a) => (a.kind === "tool_call" ? a.tool + " " + JSON.stringify(a.args || {}) + (a.ok ? "" : " REFUSED") : "finish " + a.verdict)),
    });
    console.log("   " + c.id + " " + c.title.slice(0, 28).padEnd(30)
      + (s.verdictCorrect ? "v+" : "v-") + " "
      + (s.detected === null ? "  " : s.detected ? "d+" : "d-") + " "
      + (disc.decisiveComplete === null ? "r." : disc.decisiveComplete ? "r+" : "r-") + " "
      + String(run.report ? run.report.verdict : "NO-VERDICT").padEnd(21)
      + "t" + run.turnsUsed + " opened " + disc.recordsOpened + "/" + disc.recordsAvailable
      + " " + JSON.stringify(rows[rows.length - 1].classes)
      + (s.falseAccusation ? " FALSE-ACCUSATION" : "") + (disc.invalidToolAttempts ? " INVALID-TOOL" : ""));
  }
  return rows;
});

if (!outcome.ran) {
  // A separate path. The first version of this wrote the refusal over
  // auditor-readonly.json, and a later --dry destroyed the completed run's rows
  // and raw traces -- the very traces preflight had refused to run without.
  writeFileSync(repoPath("var", "state", "auditor-readonly-preflight.json"), JSON.stringify({
    at: new Date().toISOString(), status: "PREFLIGHT_REFUSED", findings: outcome.findings, manifest, modelCalls: 0,
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  for (const f of outcome.findings) console.log("   " + f.check + ": " + f.detail);
  process.exit(2);
}
if (DRY) process.exit(0);

const rows = outcome.result;
const summary = summariseAuditRun(rows.map((r) => r.score));
const readRows = rows.filter((r) => r.discipline.decisiveComplete !== null);

/** Every observed value, keyed by the metric ids the manifest declares. */
const observed = {
  decisiveReadRate: readRows.length ? Number((readRows.filter((r) => r.discipline.decisiveComplete).length / readRows.length).toFixed(3)) : null,
  criticalDetectionRecall: summary.criticalDetectionRecall,
  correctOutputPassRate: summary.correctOutputPassRate,
  ambiguousHandling: summary.ambiguousHandling,
  verdictAccuracy: summary.verdictAccuracy,
  falseAccusationCount: summary.falseAccusationCount,
  unanchoredFindings: summary.unanchoredFindings,
  runsWithoutVerdict: rows.filter((r) => !r.verdict).length,
  inventoryListRate: Number((rows.filter((r) => r.discipline.listedInventory).length / rows.length).toFixed(3)),
  openedEverythingRate: Number((rows.filter((r) => r.discipline.openedEverything).length / rows.length).toFixed(3)),
  badIdAttempts: rows.reduce((n, r) => n + r.discipline.badIdAttempts, 0),
  invalidToolAttempts: rows.reduce((n, r) => n + r.discipline.invalidToolAttempts, 0),
  meanTurns: Number((rows.reduce((n, r) => n + r.turnsUsed, 0) / rows.length).toFixed(2)),
  primaryClassAccuracy: summary.primaryClassAccuracy,
};

/**
 * The decision, derived from manifest.gates and nothing else.
 *
 * There is deliberately no second list of thresholds in this file. The previous
 * experiment kept one, applied a gate from it that the manifest did not declare,
 * and preflight could not see the gate it was actually judged by.
 */
const direction = Object.fromEntries(manifest.metrics.map((m) => [m.id, m.direction]));
const checks = manifest.gates.map((g) => {
  const value = observed[g.metricId];
  const dir = direction[g.metricId];
  const pass = value === null || value === undefined
    ? false
    : dir === "lower" ? value <= g.threshold : value >= g.threshold;
  return { metricId: g.metricId, critical: g.critical, direction: dir, threshold: g.threshold, value, pass,
    unmeasured: value === null || value === undefined };
});
const criticalFailures = checks.filter((c) => c.critical && !c.pass);
const toolUseEvidenceValid = criticalFailures.length === 0;

console.log("");
for (const c of checks) {
  console.log("  " + (c.pass ? "PASS " : "FAIL ") + (c.critical ? "critical " : "         ")
    + c.metricId.padEnd(26) + String(c.value).padEnd(8) + (c.direction === "lower" ? "<= " : ">= ") + c.threshold
    + (c.unmeasured ? "   NOT MEASURED" : ""));
}
console.log("");
console.log("reported only: " + JSON.stringify(Object.fromEntries(
  manifest.metrics.filter((m) => m.reportedOnly).map((m) => [m.id, observed[m.id]]))));

/**
 * Tier consequence, computed by the live Academy against the honest evidence.
 *
 * The only evidence this target holds is what this run produced. The twelve
 * sealed cases belong to a different environment and are not offered here.
 */
const evidence = toolUseEvidenceValid
  ? [{ evidenceClass: "sandbox_tool_use", cases: rows.length, runScores: rows.map((r) => (r.score.verdictCorrect ? 100 : 0)) }]
  : [];
const dims = dimensionsFor("auditor").map((d) => {
  if (d.id === "defect_detection") return { id: d.id, score: Math.round((observed.criticalDetectionRecall ?? 0) * 100), cases: mustFail.length };
  if (d.id === "tool_discipline") return { id: d.id, score: Math.round((observed.decisiveReadRate ?? 0) * 100), cases: readRows.length };
  if (d.id === "false_alarm_rate") return { id: d.id, score: observed.falseAccusationCount === 0 ? 100 : 0, cases: mustPass.length };
  if (d.id === "uncertainty") return { id: d.id, score: Math.round((observed.ambiguousHandling ?? 0) * 100), cases: ambiguous.length };
  if (d.id === "evidence_discipline") return { id: d.id, score: Math.round((observed.decisiveReadRate ?? 0) * 100), cases: readRows.length };
  if (d.id === "truthfulness") return { id: d.id, score: Math.round((observed.verdictAccuracy ?? 0) * 100), cases: rows.length };
  return { id: d.id, score: null, cases: 0 };
});
const award = certify({ target, dimensions: dims, evidence, breaches: [], scoringMode: "pattern_and_judge" });

console.log("");
console.log("TIER CONSEQUENCE for " + targetId(target));
console.log("   award " + award.tier + "  overall " + award.overall + "  limited by " + JSON.stringify(award.limitedBy));
console.log("   SANDBOX_COMPETENT needs " + JSON.stringify(TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT)
  + " at score " + TIER_SCORE_REQUIREMENTS.SANDBOX_COMPETENT);
console.log("   held: sandbox_tool_use " + (evidence.length ? rows.length : 0) + ", sealed_exam 0.");
console.log("   The twelve sealed cases were produced in a single-shot environment and the environment");
console.log("   rule says none of it transfers. They are not counted here and no tier claims them.");

manifest.criteriaAfterRun = criteriaFingerprint(manifest);
const criteriaStable = manifest.criteriaBeforeRun === manifest.criteriaAfterRun;
console.log("");
console.log("criteria unchanged between declaration and reporting: " + criteriaStable);
const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("calls " + guard.total() + "/" + CEILING + " | tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);

writeFileSync(repoPath("var", "state", "auditor-readonly.json"), JSON.stringify({
  at: new Date().toISOString(), status: "COMPLETED", model,
  target, targetId: targetId(target), environment: AUDITOR_READONLY_ENVIRONMENT, executionEnvironmentId: envId,
  protocol: AUDITOR_READONLY_PROTOCOL_ID,
  forensicsFingerprint: forensicsFingerprint(), portability: port,
  manifest, criteriaStable, rows, observed, checks,
  toolUseEvidenceValid, criticalFailures: criticalFailures.map((c) => c.metricId),
  award: { tier: award.tier, overall: award.overall, limitedBy: award.limitedBy },
  substantiveCalls: guard.total(), callsByModel: guard.spent(), plannedCalls: budget.planned ?? budget.total ?? null, ceiling: CEILING,
  tokens, cost,
  evidenceStatus: "Produces sandbox_tool_use evidence for " + targetId(target) + " only. Certifies nothing, promotes nothing, trains nothing. Awards no tier above what the live Academy computes from the evidence actually held.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("written: var/state/auditor-readonly.json");
