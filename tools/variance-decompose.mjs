/**
 * Decompose the instability rather than naming it.
 *
 * Everything is frozen: worker version, base model, knowledge, policy, tools,
 * retrieval, scenario, input state. Only the sampling differs. Then trials are
 * compared step by step to find where they first part company, and the
 * difference is graded by what it would cost.
 *
 * The question is not how much the score moves. It is whether the same
 * configuration, given the same facts, decides the same thing.
 *
 * No outbound action.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, needsJudgementFor } from "../packages/eval/src/sandbox.ts";
import { judgeRun } from "../packages/eval/src/judge.ts";
import { ALL_SCENARIOS } from "../packages/eval/src/academy-scenarios.ts";
import { analyseCase, summariseVariance } from "../packages/eval/src/variance.ts";
import { adaptWorker, actorInstructions } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_VARIANCE_MODEL || process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const temperature = process.env.MIDAS_VARIANCE_TEMPERATURE ? Number(process.env.MIDAS_VARIANCE_TEMPERATURE) : undefined;
const TRIALS = Number(process.env.MIDAS_VARIANCE_TRIALS || 4);
const provider = new OpenAIResponsesProvider(undefined, model);
const JUDGE = process.env.MIDAS_VARIANCE_JUDGE === "1";
const judgeProvider = JUDGE ? new OpenAIResponsesProvider(undefined, process.env.MIDAS_JUDGE_MODEL || "gpt-5.5") : null;
let usd = 0;
let inTok = 0, outTok = 0;

/**
 * Scoring the same run two ways.
 *
 * A case with identical material behaviour across trials and a large score
 * spread is telling us the scorer moved, not the worker. Pattern matching is
 * sensitive to wording, and wording varies while behaviour does not. Measuring
 * both spreads separates instability in the worker from instability in the
 * instrument.
 */
async function callJudge({ instructions, input, schema }) {
  const out = await judgeProvider.complete({ instructions, input, outputSchema: { name: "judgements", strict: false, schema } });
  const u = out.usage || {};
  usd += estimateUsd(u.inputTokens, u.outputTokens);
  return String(out.text || "");
}

const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE,
  researcherVersionId: "or-v3",
};

// Consequential cases across the roles that matter, chosen because a difference
// between runs on any of them is a difference somebody would live with.
const CASES = (process.argv.length > 2 ? process.argv.slice(2)
  : ["SC-TECH-01", "SC-TECH-02", "SC-SALES-01", "SC-MGR-03", "SC-REG-02"])
  .map((id) => ALL_SCENARIOS.find((s) => s.id === id))
  .filter(Boolean);

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } } },
};

function renderLog(log) {
  if (!log.length) return "(nothing has happened yet)";
  return log.map((a) => {
    if (a.kind === "counterparty") return "THEM: " + a.text;
    if (a.kind === "tool_call") return "YOU called " + a.tool + "(" + JSON.stringify(a.args || {}) + ") -> " + String(a.result || "").slice(0, 900);
    if (a.kind === "escalate") return "YOU escalated: " + (a.text || "");
    return "YOU: " + (a.text || "");
  }).join("\n");
}

function liveActor(scenario) {
  const adapted = adaptWorker(scenario.role, SOURCES);
  const instructions = actorInstructions(adapted, scenario.world.tools);
  return async ({ log }) => {
    try {
      const req = {
        instructions,
        input: "TASK: " + scenario.brief + "\n\nWHAT HAS HAPPENED SO FAR:\n" + renderLog(log),
        outputSchema: { name: "worker_actions", strict: false, schema: ACTION_SCHEMA },
      };
      if (temperature !== undefined) req.temperature = temperature;
      const out = await provider.complete(req);
      const u = out.usage || {};
      usd += estimateUsd(u.inputTokens, u.outputTokens);
      inTok += Number(u.inputTokens || 0); outTok += Number(u.outputTokens || 0);
      const text = String(out.text || "");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      if (a < 0) return [{ kind: "finish", text: "" }];
      const acts = (JSON.parse(text.slice(a, b + 1)).actions || [])
        .map((x) => ({ kind: x.kind || "message", tool: x.tool, args: x.args || {}, text: x.text || "" }));
      return acts.length ? acts : [{ kind: "finish", text: "" }];
    } catch (e) { return [{ kind: "finish", text: "ACTOR ERROR" }]; }
  };
}

console.log("model:", model, "| temperature:", temperature === undefined ? "(provider default)" : temperature,
  "| trials:", TRIALS, "| cases:", CASES.length);
console.log("");

const analyses = [];
for (const s of CASES) {
  const trials = [];
  for (let i = 0; i < TRIALS; i++) {
    const run = await runScenario(s, liveActor(s));
    const r = scoreScenario(s, run.log);
    let judgedScore = null;
    if (JUDGE) {
      const candidates = s.expectations.filter((e) => needsJudgementFor(e));
      const outcome = await judgeRun({ scenario: s, log: run.log, candidates, call: callJudge });
      judgedScore = scoreScenario(s, run.log, { judgements: outcome.judgements, judgeApplied: true }).score;
    }
    trials.push({ scenarioId: s.id, log: run.log, gatesSprung: r.trapsSprung.map((t) => t.gateId), score: r.score, judgedScore });
  }
  const a = analyseCase(trials);
  if (JUDGE) {
    const js = trials.map((t) => t.judgedScore).filter((x) => x != null);
    a.judgedSpread = js.length ? Number((Math.max(...js) - Math.min(...js)).toFixed(2)) : null;
    a.judgedScores = js;
  }
  analyses.push(a);

  console.log(s.id.padEnd(13), "|", String(a.distinctMaterialBehaviours) + "/" + a.trials, "distinct behaviours",
    "| material stability", a.materialStability,
    "| worst", a.worstSeverity.toUpperCase(),
    "| pattern spread", a.scoreSpread,
    JUDGE ? "| judged spread " + a.judgedSpread : "");
  console.log("               first divergence:", JSON.stringify(a.divergenceKinds));
  const worstPair = a.pairs.find((p) => p.severity === a.worstSeverity);
  if (worstPair && a.worstSeverity !== "none") {
    for (const r of worstPair.reasons) console.log("               -", r);
    console.log("               diverged at step " + worstPair.divergence.index
      + " (" + worstPair.divergence.kind + "): " + worstPair.divergence.a + "  vs  " + worstPair.divergence.b);
  }
  console.log("");
}

const summary = summariseVariance(analyses);
console.log("=".repeat(72));
console.log("cases:", summary.cases, "| materially stable:", summary.stableCases);
console.log("by severity:", JSON.stringify(summary.bySeverity));
console.log("where divergence enters:", JSON.stringify(summary.byDivergence));
console.log("dominant:", summary.dominantDivergence);
console.log(summary.ruling);
console.log("tokens in/out:", inTok, "/", outTok, "| flat-rate estimate $" + usd.toFixed(4) + " (NOT model-adjusted)");

writeFileSync(repoPath("var", "state", "variance-decomposition.json"), JSON.stringify({
  at: new Date().toISOString(), model, temperature: temperature ?? null, trials: TRIALS,
  frozen: ["workerVersion", "baseModel", "knowledge", "policy", "tools", "retrieval", "scenario", "inputState"],
  note: "Only sampling differs between trials. Material behaviour is compared, not wording.",
  cases: analyses.map((a) => ({
    scenarioId: a.scenarioId, trials: a.trials,
    distinctMaterialBehaviours: a.distinctMaterialBehaviours,
    materialStability: a.materialStability, worstSeverity: a.worstSeverity,
    scoreSpread: a.scoreSpread, divergenceKinds: a.divergenceKinds,
    dominantDivergence: a.dominantDivergence,
    behaviours: a.behaviours,
    pairs: a.pairs.map((p) => ({ i: p.i, j: p.j, severity: p.severity, reasons: p.reasons, divergence: p.divergence })),
  })),
  summary,
  tokens: { input: inTok, output: outTok },
  estimatedUsd: Number(usd.toFixed(4)),
  pricingCaveat: "estimateUsd applies one flat rate to every model, so this figure tracks token count rather than actual cost. A cross-model dollar comparison needs per-model pricing this ledger does not carry.",
  outboundActionsTaken: 0,
}, null, 1));
