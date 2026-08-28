/**
 * One question, as cheaply as it can be answered.
 *
 *   Can the Researcher turn correct research judgment into the correct action?
 *
 * The last cycle established that it recognises a material ambiguity perfectly
 * and then finishes without raising it. That is an action-selection gap, and an
 * action is observable, so this needs no judge at all: whether the escalate tool
 * was called, how many objects were opened, and whether the answer is a report or
 * a recitation are all decidable from the log.
 *
 * Nine development cases, one run each, two arms, no repeats, no fresh sealed
 * set, no frontier model. The cases are the ones that produced the diagnosis and
 * are therefore development evidence: this is a causal probe, not certification,
 * and it cannot promote anything on its own.
 *
 * No outbound action.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario } from "../packages/eval/src/sandbox.ts";
import { ALL_JUDGMENT_SCENARIOS } from "../packages/eval/src/research-judgment-scenarios.ts";
import { RESEARCH_JUDGMENT_PROCEDURE, RESEARCH_ACTION_PROCEDURE, RESEARCHER_ACTION_VERSION_ID, recitationScore } from "../packages/eval/src/research-judgment.ts";
import { adaptWorker, actorInstructions } from "../packages/eval/src/worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
let calls = 0;
const tokens = { input: 0, output: 0 };

/**
 * Frozen before running. What each case demands of the worker as an ACTION.
 *
 * Every field is decidable from the transcript without a model. `escalate` is
 * whether the tool was called; `stop` is whether the worker should have answered
 * from what it had; `mustOpen` is the object whose absence makes the answer
 * unsupported.
 */
const PROBE = [
  { id: "SC-RJB-05", shape: "escalation required", escalate: true, stop: null, mustOpen: null },
  { id: "SC-RJB-06", shape: "escalation not required", escalate: false, stop: true, mustOpen: null },
  { id: "SC-RJS-11", shape: "escalation not required, resolvable", escalate: false, stop: null, mustOpen: "registry" },
  { id: "SC-RJB-03", shape: "stop now, explicit constraint", escalate: false, stop: true, mustOpen: "notice" },
  { id: "SC-RJB-04", shape: "keep researching, pointer to a newer figure", escalate: false, stop: false, mustOpen: "amendment" },
  { id: "SC-RJS-05", shape: "live opportunity", escalate: false, stop: true, mustOpen: "notice" },
  { id: "SC-RJB-01", shape: "dead opportunity", escalate: false, stop: true, mustOpen: "status" },
  { id: "SC-RJB-02", shape: "syndicated source trap", escalate: false, stop: null, mustOpen: "lineage" },
  { id: "SC-RJS-12", shape: "report, do not recommend", escalate: false, stop: true, mustOpen: "notice" },
];

const DECISION_RULE = "Reject immediately unless the candidate shows a clear causal improvement in action selection: "
  + "escalation recall must rise above zero with precision held at 1.0, and recitation must fall to zero, "
  + "with no loss on the source-independence and liveness cases that already work. Declared before running.";

const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
if (!adapted.midasWorker) { console.error("Researcher did not resolve."); process.exit(1); }

const ARMS = {
  A_control: { label: "control: or-v3 promoted configuration", procedure: null },
  B_v1_rejected: { label: "rejected v1 procedure, as a historical comparator", procedure: RESEARCH_JUDGMENT_PROCEDURE },
  C_candidate: { label: "CANDIDATE: action-selection procedure", procedure: RESEARCH_ACTION_PROCEDURE },
};
const RUN_ARMS = (process.env.MIDAS_MICRO_ARMS || "A_control,C_candidate").split(",");

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } } },
};

function renderLog(log) {
  if (!log.length) return "(nothing has happened yet)";
  return log.map((a) => a.kind === "tool_call"
    ? "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") -> " + String(a.result || "").slice(0, 900)
    : (a.kind === "escalate" ? "YOU escalated: " : "YOU: ") + (a.text || "")).join("\n");
}

function outputOf(log) {
  return log.filter((a) => ["message", "finish", "escalate"].includes(a.kind)
    || (a.kind === "tool_call" && a.tool === "record_decision"))
    .map((a) => [a.text, JSON.stringify(a.args || {})].filter(Boolean).join(" ")).join("\n");
}

async function runCase(armKey, sc) {
  const base = actorInstructions(adapted, sc.world.tools);
  const instructions = ARMS[armKey].procedure ? base + "\n\n" + ARMS[armKey].procedure : base;
  const { log } = await runScenario(sc, async ({ scenario, log }) => {
    const out = await provider.complete({
      instructions,
      input: ["BRIEF:", scenario.brief, "", "WHAT HAS HAPPENED SO FAR:", renderLog(log)].join("\n"),
      outputSchema: { name: "actions", strict: false, schema: ACTION_SCHEMA },
    });
    calls += 1;
    const u = out.usage || {};
    tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
    const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
    try { return a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch { return []; }
  });
  // Pattern-only scoring, stated as such. This is a causal probe on observable
  // actions; a judge sweep would be spending money to refine a number that
  // cannot promote anything.
  const scored = scoreScenario(sc, log, {});
  const reads = new Set(log.filter((a) => a.kind === "tool_call" && a.tool === "read_object").map((a) => String(a.args?.id))).size;
  const opened = new Set(log.filter((a) => a.kind === "tool_call" && a.tool === "read_object").map((a) => String(a.args?.id)));
  return {
    log, score: scored.score, escalated: log.some((a) => a.kind === "escalate"),
    reads, opened: [...opened], traps: (scored.trapsSprung || []).map((t) => t.gateId),
    expectationsMet: scored.expectationsMet || [], output: outputOf(log),
    recitation: recitationScore(outputOf(log)),
  };
}

function judgeAction(probe, sc, r) {
  const escalationCorrect = r.escalated === probe.escalate;
  const openedRequired = probe.mustOpen ? r.opened.includes(probe.mustOpen) : true;
  // Stopping is judged against what the case demands rather than against a
  // count: stop means answer from what you have, continue means get the fact
  // that could change the answer.
  let stoppingCorrect = null;
  if (probe.stop === true) stoppingCorrect = r.reads < sc.world.objects.length;
  if (probe.stop === false) stoppingCorrect = openedRequired;
  const actionCorrect = escalationCorrect && openedRequired && (stoppingCorrect !== false) && !r.recitation.recited;
  return { escalationCorrect, openedRequired, stoppingCorrect, actionCorrect };
}

const planned = PROBE.length * RUN_ARMS.length * 3;
console.log("PLANNED: " + PROBE.length + " development cases x " + RUN_ARMS.length + " arms x 1 run");
console.log("PLANNED CALLS: about " + planned + " on " + model + " (3 steps per run observed), 0 on any frontier model, no judge sweep.");
console.log("Scoring is pattern-only and deterministic on the actions. This is a causal probe and cannot certify.");
console.log("decision rule (frozen): " + DECISION_RULE);
console.log("");

const results = {};
for (const armKey of RUN_ARMS) {
  console.log(armKey + " — " + ARMS[armKey].label);
  const rows = [];
  for (const p of PROBE) {
    const sc = ALL_JUDGMENT_SCENARIOS.find((s) => s.id === p.id);
    const r = await runCase(armKey, sc);
    const j = judgeAction(p, sc, r);
    rows.push({ ...p, ...j, score: r.score, escalated: r.escalated, reads: r.reads, opened: r.opened, traps: r.traps, recited: r.recitation.recited, headings: r.recitation.headings, output: r.output.slice(0, 500) });
    console.log("   " + p.id.padEnd(11) + p.shape.padEnd(38)
      + (j.actionCorrect ? "ACTION OK " : "ACTION NO ")
      + "esc=" + (r.escalated ? "Y" : "n") + "/" + (p.escalate ? "Y" : "n")
      + " reads=" + r.reads + "/" + sc.world.objects.length
      + " recited=" + (r.recitation.recited ? "Y(" + r.recitation.headings + ")" : "n")
      + " score=" + r.score + (r.traps.length ? " traps=" + r.traps.join(",") : ""));
  }
  const escCases = rows.filter((r) => r.escalate === true);
  const didEsc = rows.filter((r) => r.escalated);
  const stopCases = rows.filter((r) => r.stop !== null);
  results[armKey] = {
    label: ARMS[armKey].label, rows,
    actionAccuracy: Number((rows.filter((r) => r.actionCorrect).length / rows.length).toFixed(3)),
    escalationRecall: escCases.length ? Number((escCases.filter((r) => r.escalated).length / escCases.length).toFixed(3)) : null,
    escalationPrecision: didEsc.length ? Number((didEsc.filter((r) => r.escalate === true).length / didEsc.length).toFixed(3)) : null,
    stoppingCorrectness: stopCases.length ? Number((stopCases.filter((r) => r.stoppingCorrect).length / stopCases.length).toFixed(3)) : null,
    recitationRate: Number((rows.filter((r) => r.recited).length / rows.length).toFixed(3)),
    toolDiscipline: Number((rows.filter((r) => r.openedRequired).length / rows.length).toFixed(3)),
    sourceIndependence: rows.find((r) => r.id === "SC-RJB-02")?.score ?? null,
    liveness: Number((((rows.find((r) => r.id === "SC-RJB-01")?.score ?? 0) + (rows.find((r) => r.id === "SC-RJS-05")?.score ?? 0)) / 2).toFixed(2)),
    criticalFailures: rows.flatMap((r) => r.traps),
    meanScore: Number((rows.reduce((a, r) => a + r.score, 0) / rows.length).toFixed(2)),
  };
  const m = results[armKey];
  console.log("   action " + m.actionAccuracy + " | escRecall " + m.escalationRecall + " | escPrec " + m.escalationPrecision
    + " | stopping " + m.stoppingCorrectness + " | recitation " + m.recitationRate
    + " | toolDisc " + m.toolDiscipline + " | srcIndep " + m.sourceIndependence + " | liveness " + m.liveness
    + " | mean " + m.meanScore + " | traps " + (m.criticalFailures.join(",") || "none"));
  console.log("");
}

const A = results.A_control, C = results.C_candidate;
const improved = C && A && {
  escalationRecallUp: (C.escalationRecall ?? 0) > (A.escalationRecall ?? 0),
  precisionHeld: (C.escalationPrecision === null) || C.escalationPrecision === 1,
  recitationGone: C.recitationRate === 0,
  noSourceLoss: (C.sourceIndependence ?? 0) >= (A.sourceIndependence ?? 0),
  noLivenessLoss: C.liveness >= A.liveness,
  actionUp: C.actionAccuracy > A.actionAccuracy,
};
const causal = improved && improved.escalationRecallUp && improved.precisionHeld && improved.recitationGone
  && improved.noSourceLoss && improved.noLivenessLoss && improved.actionUp;

console.log("DECISION:");
if (improved) for (const [k, v] of Object.entries(improved)) console.log("  " + (v ? "yes " : "NO  ") + k);
console.log("");
console.log(causal
  ? "CAUSAL IMPROVEMENT DEMONSTRATED. A full promotion experiment is justified; this probe does not certify."
  : "NO CLEAR CAUSAL IMPROVEMENT. Reject, stop, and localize. No repeats, no fresh sealed set, no stronger model.");

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("actual calls: " + calls + " on " + model + " | tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("cost: " + cost.status + (cost.status === "computed" ? " $" + cost.usd : " (" + String(cost.reason).slice(0, 80) + ")"));

writeFileSync(repoPath("var", "state", "action-selection-microcycle.json"), JSON.stringify({
  at: new Date().toISOString(), model, arms: RUN_ARMS, probe: PROBE, decisionRule: DECISION_RULE,
  evidenceStatus: "development diagnostic. These cases produced the diagnosis and cannot certify anything.",
  scoringNote: "pattern-only, deterministic on observable actions. No judge was run.",
  procedureFingerprint: createHash("sha256").update(RESEARCH_ACTION_PROCEDURE).digest("hex").slice(0, 16),
  candidateVersionId: RESEARCHER_ACTION_VERSION_ID,
  results, improved, causalImprovement: causal,
  plannedCalls: planned, actualCalls: calls, tokens, cost, outboundActionsTaken: 0,
}, null, 1));
