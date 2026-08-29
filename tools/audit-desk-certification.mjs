/**
 * The Auditor certification campaign.
 *
 * Eighteen fresh cases against CT-677749cd2035, the first Auditor target that
 * describes its own subject: one tool, one protocol, one environment, all named
 * before anything ran. Twelve sealed examinations and six tool-use cases, which
 * is exactly what SANDBOX_COMPETENT requires and not one case more.
 *
 * Every reference answer was reviewed by an independent model before this file
 * could spend anything, because GOLD_DEFECT is the most common recorded defect
 * class here and both instances that changed a verdict were found only after the
 * run was paid for.
 *
 * Gates live in the manifest and nowhere else. There is no second list of
 * thresholds in this file.
 *
 * No outbound action. Nothing is sent, purchased or committed.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { withPreflight, preflight, criteriaFingerprint } from "../packages/eval/src/experiment-preflight.ts";
import { AUDIT_DESK_CASES, deskCoverage } from "../packages/eval/src/audit-desk-cases.ts";
import { AUDITOR_TOOL_CASES } from "../packages/eval/src/auditor-tool-cases.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_VERSION_ID, AUDITOR_CONTRACT_BRIEF, AUDITOR_NON_RESPONSIBILITIES,
  DEFECT_CLASSES, AUDIT_VERDICTS,
} from "../packages/eval/src/auditor.ts";
import {
  runDeskAudit, readingDiscipline, deskPrompt, turnsWithSlack, derivedTurnFloor,
  AUDIT_DESK_PROTOCOL, AUDIT_DESK_PROTOCOL_ID, AUDIT_DESK_TOOL_SET,
} from "../packages/eval/src/audit-desk.ts";
import { finalAuditorTarget, AUDIT_DESK_ENVIRONMENT } from "../packages/eval/src/auditor-target-truth.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { targetId, TIER_EVIDENCE_REQUIREMENTS, TIER_SCORE_REQUIREMENTS } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { budgetGuard } from "../packages/eval/src/call-budget.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const PLAN_ONLY = process.argv.includes("--plan");
const model = "gpt-4.1";
const NL = String.fromCharCode(10);

/**
 * The mission ceiling is 44 substantive calls INCLUDING gold adjudication.
 * Three were spent on independent review, so this is what remains.
 */
const MISSION_CEILING = 44;
const REVIEW_SPENT = 3;
/** The instrument probe that measured the turn counts above. Throwaway cases, no gold. */
const PROBE_SPENT = 5;
const CEILING = MISSION_CEILING - REVIEW_SPENT - PROBE_SPENT;
/**
 * Turn caps, measured rather than assumed.
 *
 * The instrument probe ran the same instructions against a two-record packet and
 * a four-record packet. The two-record case batched both ids and finished in two
 * turns. The four-record case batched two, went back for a third, and finished
 * on turn three -- at the cap, with one record still unopened.
 *
 * So a two-record packet needs the floor plus slack, and a four-record packet
 * needs one more than that, because three turns was not slack for it, it was the
 * limit it reached.
 */
const TURNS_SMALL_PACKET = turnsWithSlack();
const TURNS_LARGE_PACKET = turnsWithSlack() + 1;
const turnsFor = (c) => (c.packet.records.length > 2 ? TURNS_LARGE_PACKET : TURNS_SMALL_PACKET);
const MAX_TURNS = TURNS_LARGE_PACKET;

const adapted = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });
if (!adapted.midasWorker) { console.error("The auditor did not resolve on the live path. Refusing to run."); process.exit(1); }

const target = finalAuditorTarget();
const envId = executionEnvironmentId(AUDIT_DESK_ENVIRONMENT);

const reviewPath = repoPath("var", "state", "audit-desk-gold-review.json");
const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, "utf8")) : null;

const caseFingerprint = createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES)).digest("hex").slice(0, 16);
const goldFingerprint = createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES.map((c) => [c.id, c.gold]))).digest("hex").slice(0, 16);
const reviewFingerprint = review ? createHash("sha256").update(JSON.stringify(review.rows)).digest("hex").slice(0, 16) : null;
const contaminatedFingerprint = createHash("sha256").update(JSON.stringify(AUDITOR_TOOL_CASES)).digest("hex").slice(0, 16);

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
          args: {
            type: "object", additionalProperties: false,
            properties: { ids: { type: "array", items: { type: "string" } } },
          },
          verdict: { type: "string", enum: [...AUDIT_VERDICTS] },
          criticalDefects: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["defectClass", "claim", "why"],
              properties: {
                defectClass: { type: "string", enum: [...DEFECT_CLASSES] },
                claim: { type: "string" }, why: { type: "string" },
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
  AUDIT_DESK_PROTOCOL,
].join(NL);
const instructionsHash = createHash("sha256").update(INSTRUCTIONS).digest("hex").slice(0, 16);

const ids = (f) => AUDIT_DESK_CASES.filter(f).map((c) => c.id);
const mustFail = ids((c) => c.gold.verdict === "fail");
const mustPass = ids((c) => c.gold.verdict === "pass");
const underdetermined = ids((c) => c.gold.verdict === "insufficient_evidence");
const allIds = ids(() => true);
const toolIds = ids((c) => c.evidenceClass === "sandbox_tool_use");

const manifest = {
  experimentId: "AUDITOR-DESK-1",
  causalQuestion: "Is the exact MIDAS Auditor at its own desk good enough for the tier the Academy would award it, judged against absolute thresholds rather than against a baseline?",
  subject: {
    role: "auditor", workerVersion: AUDITOR_VERSION_ID, model, midasWorker: true,
    configurationTarget: targetId(target), executionEnvironmentId: envId,
  },
  arms: [
    {
      id: "A_midas_auditor",
      changedVariable: "none. This is an absolute certification run: there is no comparison to draw, because five consecutive campaigns have shown prompt-level comparison against a bare model is not strategically informative, and the question here is whether the exact configuration clears the Academy's own bars.",
      tools: AUDIT_DESK_TOOL_SET,
      promptId: "auditor-doctrine-desk", contractId: "audit-actions-v2-batch", policyId: "auditor-doctrine-v1",
      genericBaseline: false,
      informationAccess: AUDIT_DESK_CASES.map((c) => deskPrompt(c)),
    },
  ],
  cases: {
    kind: "sealed", fingerprint: caseFingerprint, count: AUDIT_DESK_CASES.length,
    priorSetFingerprints: [contaminatedFingerprint],
    goldAdjudication: {
      author: "mission author, pre-execution",
      independentlyAdjudicated: Boolean(review && review.cleared),
      reviewer: review ? review.model : null,
      reviewFingerprint,
      outcome: review ? review.rows.filter((r) => r.classification === "REFERENCE_CORRECT").length + "/" + review.rows.length + " REFERENCE_CORRECT" : null,
      blinding: review ? review.blinding : null,
    },
    answerPhrases: Object.fromEntries(AUDIT_DESK_CASES.map((c) => [c.id, [c.gold.defectClass || ""].filter(Boolean)])),
    caseTexts: Object.fromEntries(AUDIT_DESK_CASES.map((c) => [c.id, deskPrompt(c)])),
  },
  metrics: [
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
  ],
  gates: [
    { metricId: "verdictAccuracy", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / allIds.length).toFixed(3)) },
    { metricId: "criticalDetectionRecall", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / mustFail.length).toFixed(3)) },
    { metricId: "correctOutputPassRate", threshold: 1.0, critical: true, preregistered: true, metricIncrement: Number((1 / mustPass.length).toFixed(3)) },
    // Both, or the gate is decided by one case. Not critical: two observations
    // are enough to report on and not enough to end a campaign on, and the
    // last time this metric was gated critically both its cases had wrong gold.
    { metricId: "underdeterminedHandling", threshold: 1.0, critical: false, preregistered: true, metricIncrement: Number((1 / underdetermined.length).toFixed(3)) },
    { metricId: "materialReadRate", threshold: 0.80, critical: true, preregistered: true, metricIncrement: Number((1 / toolIds.length).toFixed(3)) },
    { metricId: "falseAccusationCount", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "unanchoredFindings", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
    { metricId: "runsWithoutVerdict", threshold: 0, critical: true, preregistered: true, metricIncrement: 1 },
  ],
  budget: {
    model, cases: AUDIT_DESK_CASES.length, arms: 1, maxTurnsPerCase: MAX_TURNS,
    turnsByCase: Object.fromEntries(AUDIT_DESK_CASES.map((c) => [c.id, turnsFor(c)])),
    hardCeiling: CEILING, perModelCeilings: { "gpt-5.5": 0 },
  },
  runtime: {
    expectedTools: AUDIT_DESK_TOOL_SET,
    workflowShape: ["read_evidence", "finish"],
    rawTraceCaptured: ["model_response", "tool_calls", "tool_outputs", "parsed_actions", "final_output"],
    completionCondition: "a finish action carrying a verdict, or the turn limit",
  },
  decisionRule: "Every critical gate must pass for the run to become certification evidence. Any critical failure, or any material instrument defect found in the post-run audit, makes the whole campaign development evidence and awards nothing.",
};
manifest.criteriaBeforeRun = criteriaFingerprint(manifest);

const worstCase = AUDIT_DESK_CASES.reduce((n, c) => n + turnsFor(c), 0);
/** What the probe actually observed: two turns on a small packet, three on a large one. */
const expectedCase = AUDIT_DESK_CASES.reduce((n, c) => n + (c.packet.records.length > 2 ? 3 : 2), 0);

console.log("AUDITOR DESK CERTIFICATION");
console.log("  subject        : " + AUDITOR_VERSION_ID + " on " + model + ", policy " + target.policyVersionId);
console.log("  target         : " + targetId(target) + "   environment " + envId + " (" + AUDIT_DESK_PROTOCOL_ID + ")");
console.log("  tools          : " + AUDIT_DESK_TOOL_SET.join(", "));
console.log("  instructions   : sha " + instructionsHash);
console.log("");
console.log("  FREEZE");
console.log("    cases        : " + caseFingerprint + "   " + JSON.stringify(deskCoverage()));
console.log("    gold         : " + goldFingerprint);
console.log("    review       : " + (reviewFingerprint || "NONE") + "   " + (review ? review.rows.filter((r) => r.classification === "REFERENCE_CORRECT").length + "/" + review.rows.length + " REFERENCE_CORRECT, " + review.calls + " calls" : "not run"));
console.log("    target       : " + targetId(target));
console.log("    criteria     : " + manifest.criteriaBeforeRun);
console.log("");
console.log("  ACADEMY REQUIREMENT for SANDBOX_COMPETENT");
console.log("    " + JSON.stringify(TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT) + " at score " + TIER_SCORE_REQUIREMENTS.SANDBOX_COMPETENT);
console.log("    one execution produces one row in one class, so 12 + 6 = 18 distinct executions are required.");
console.log("");
console.log("  COST PLAN");
console.log("    unique cases       : " + AUDIT_DESK_CASES.length + "  (12 sealed_exam, 6 sandbox_tool_use)");
console.log("    executions         : " + AUDIT_DESK_CASES.length + "  (one per case; no repeats, no second arm)");
console.log("    sealed rows        : 12");
console.log("    sandbox rows       : 6");
console.log("    derived turn floor : " + derivedTurnFloor() + "  (one tool, plus one turn to conclude)");
console.log("    turns per case     : " + TURNS_SMALL_PACKET + " for the twelve two-record packets, " + TURNS_LARGE_PACKET + " for the six four-record packets");
console.log("    worker worst case  : " + worstCase + " calls  (12 x " + TURNS_SMALL_PACKET + " + 6 x " + TURNS_LARGE_PACKET + ")");
console.log("    worker expected    : " + expectedCase + " calls, at the turn counts the instrument probe measured");
console.log("    gold-review spent  : " + REVIEW_SPENT + " gpt-5.5 calls");
console.log("    probe spent        : " + PROBE_SPENT + " gpt-4.1 calls, to measure the turn counts above");
console.log("    mission ceiling    : " + MISSION_CEILING + " including adjudication, so " + CEILING + " remain for the worker");
console.log("    worst case total   : " + (worstCase + REVIEW_SPENT + PROBE_SPENT) + "  against " + MISSION_CEILING);
console.log("    expected total     : " + (expectedCase + REVIEW_SPENT + PROBE_SPENT) + "  against " + MISSION_CEILING);
console.log("    FUNDABLE           : " + (worstCase + REVIEW_SPENT + PROBE_SPENT <= MISSION_CEILING ? "yes" : "NO -- the campaign needs a ceiling of " + (worstCase + REVIEW_SPENT + PROBE_SPENT + 6) + " to run with margin for infrastructure retries"));
console.log("");

const pre = preflight(manifest);
console.log("  PREFLIGHT");
for (const f of pre.findings) {
  console.log("    " + (f.severity === "blocking" ? "REFUSE  " : "advisory") + " " + String(f.check).padEnd(34) + f.detail);
}
if (!pre.findings.length) console.log("    no findings");
const budgetOnly = pre.blocking.every((f) => f.check === "budget_fits_the_ceiling");
console.log("    blocking findings: " + pre.blocking.length + (pre.blocking.length && budgetOnly ? "  (budget only)" : ""));

if (PLAN_ONLY) {
  writeFileSync(repoPath("var", "state", "audit-desk-plan.json"), JSON.stringify({
    at: new Date().toISOString(), modelCalls: 0,
    target, targetId: targetId(target), environment: AUDIT_DESK_ENVIRONMENT, executionEnvironmentId: envId,
    freeze: { cases: caseFingerprint, gold: goldFingerprint, review: reviewFingerprint, target: targetId(target), criteria: manifest.criteriaBeforeRun },
    coverage: deskCoverage(),
    academy: { required: TIER_EVIDENCE_REQUIREMENTS.SANDBOX_COMPETENT, minScore: TIER_SCORE_REQUIREMENTS.SANDBOX_COMPETENT, oneExecutionOneRow: true },
    plan: {
      uniqueCases: AUDIT_DESK_CASES.length, executions: AUDIT_DESK_CASES.length,
      sealedRows: 12, sandboxRows: 6,
      derivedTurnFloor: derivedTurnFloor(), maxTurns: MAX_TURNS,
      turnsSmallPacket: TURNS_SMALL_PACKET, turnsLargePacket: TURNS_LARGE_PACKET,
      workerWorstCase: worstCase, workerExpected: expectedCase,
      goldReviewCalls: REVIEW_SPENT, instrumentProbeCalls: PROBE_SPENT,
      missionCeiling: MISSION_CEILING, workerCeiling: CEILING,
      worstCaseTotal: worstCase + REVIEW_SPENT + PROBE_SPENT,
      expectedTotal: expectedCase + REVIEW_SPENT + PROBE_SPENT,
      fundable: worstCase + REVIEW_SPENT + PROBE_SPENT <= MISSION_CEILING,
      requiredCeilingWithMargin: worstCase + REVIEW_SPENT + PROBE_SPENT + 6,
      alreadySpentAndDurable: REVIEW_SPENT + PROBE_SPENT,
      requiredIfReviewAndProbeAreReused: worstCase,
    },
    preflight: { ok: pre.ok, blocking: pre.blocking, findings: pre.findings, blockingIsBudgetOnly: budgetOnly },
    manifest,
    evidenceStatus: "A plan. Certifies nothing, promotes nothing, trains nothing. No model call was made by this invocation.",
    outboundActionsTaken: 0,
  }, null, 1));
  console.log("");
  console.log("written: var/state/audit-desk-plan.json");
  process.exit(pre.ok ? 0 : 3);
}

const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);
const guard = budgetGuard(CEILING, { "gpt-5.5": 0 });
const tokens = { input: 0, output: 0 };

const outcome = await withPreflight(manifest, async () => {
  if (DRY) { console.log("   --dry: cleared preflight, no model calls made."); return null; }
  const rows = [];
  for (const c of AUDIT_DESK_CASES) {
    const trace = [];
    const run = await runDeskAudit(c, async ({ log, turn }) => {
      if (guard.remainingFor(model) <= 0) return [];
      const history = log.map((a) => (a.kind === "tool_call"
        ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") and received:" + NL + a.result
        : "YOU finished."));
      const input = [
        deskPrompt(c), "",
        history.length ? "WHAT YOU HAVE DONE SO FAR:" + NL + history.join(NL) : "You have not opened anything yet.",
        turn === turnsFor(c) ? NL + "This is your last turn. You must finish now." : "",
      ].join(NL);
      guard.charge(model);
      const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "auditor_actions", strict: false, schema: ACTION_SCHEMA } });
      const u = out.usage || {};
      tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
      const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
      let actions = []; let parseError = null;
      try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch (e) { parseError = String(e && e.message); }
      trace.push({ turn, instructionsHash, input, modelResponse: t, parsedActions: actions, parseError, usage: u });
      return actions;
    }, turnsFor(c));
    for (const a of run.log) {
      if (a.kind === "tool_call") trace.push({ toolCall: { tool: a.tool, args: a.args }, toolOutput: { ok: a.ok, opened: a.opened, output: a.result } });
    }
    trace.push({ finalOutput: run.report });
    const disc = readingDiscipline(c, run.log);
    rows.push({
      caseId: c.id, evidenceClass: c.evidenceClass, competency: c.competency,
      gold: c.gold, verdict: run.report ? run.report.verdict : null,
      classes: ((run.report && run.report.criticalDefects) || []).map((x) => x.defectClass),
      claims: ((run.report && run.report.criticalDefects) || []).map((x) => String(x.claim || "")),
      turnsUsed: run.turnsUsed, discipline: disc, trace,
      transcript: run.log.map((a) => (a.kind === "tool_call" ? a.tool + " " + JSON.stringify(a.args || {}) + (a.ok ? " -> " + (a.opened || []).join("+") : " REFUSED") : "finish " + a.verdict)),
    });
    console.log("   " + c.id + " " + c.competency.slice(0, 24).padEnd(26)
      + String(run.report ? run.report.verdict : "NO-VERDICT").padEnd(22)
      + "t" + run.turnsUsed + " read " + disc.recordsOpened + "/" + disc.recordsAvailable
      + " calls " + disc.readCalls + " " + JSON.stringify(rows[rows.length - 1].classes));
  }
  return rows;
});

if (!outcome.ran) {
  writeFileSync(repoPath("var", "state", "audit-desk-preflight-refusal.json"), JSON.stringify({
    at: new Date().toISOString(), status: "PREFLIGHT_REFUSED", findings: outcome.findings, manifest, modelCalls: 0,
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  process.exit(2);
}
if (DRY) process.exit(0);

/**
 * The immutable result. Written before anything else touches it, to its own
 * path, which no refusal and no dry run writes to.
 */
writeFileSync(repoPath("var", "state", "audit-desk-raw.json"), JSON.stringify({
  at: new Date().toISOString(), campaign: "AUDITOR-DESK-1",
  targetId: targetId(target), executionEnvironmentId: envId, instructionsHash,
  freeze: { cases: caseFingerprint, gold: goldFingerprint, review: reviewFingerprint, criteria: manifest.criteriaBeforeRun },
  calls: guard.total(), tokens, rows: outcome.result,
}, null, 1));
console.log("");
console.log("raw result written: var/state/audit-desk-raw.json (" + guard.total() + " calls)");
console.log("Scoring, decision and evidence are computed from that file by audit-desk-score.mjs.");
const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("tokens " + tokens.input + " in / " + tokens.output + " out | " + cost.status);
