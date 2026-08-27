/**
 * Does the independent judge actually fix the gaming hole, and does it cost
 * honest workers anything?
 *
 * Both halves are needed. A judge that kills the keyword-mirroring attack by
 * being harsh on everything has not improved the instrument, it has just moved
 * every score down. So two arms run through the same judge:
 *
 *   the mirror policy, which emits the rubric's phrases and does no work -- it
 *   should collapse;
 *
 *   a live model doing the examinations honestly -- it should hold roughly
 *   steady, and where it does not, the overturned expectations are worth reading
 *   because they are either judge defects or places the model was scoring on
 *   words too.
 *
 * The judge runs on a different model from the worker. Same-model evaluation
 * shares the blind spots it is supposed to catch.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, needsJudgementFor, matches } from "../packages/eval/src/sandbox.ts";
import { ALL_SCENARIOS } from "../packages/eval/src/academy-scenarios.ts";
import { GAMING_POLICIES } from "../packages/eval/src/anti-gaming.ts";
import { judgeRun, workerOutput } from "../packages/eval/src/judge.ts";
import { adaptWorker, actorInstructions } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const workerModel = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const judgeModel = process.env.MIDAS_JUDGE_MODEL || "gpt-5.5";
const judgeProvider = new OpenAIResponsesProvider(undefined, judgeModel);
const workerProvider = new OpenAIResponsesProvider(undefined, workerModel);
let usd = 0;

/** The honest arm must be the real worker, or it is not the comparison it claims. */
const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE,
  researcherVersionId: "or-v3",
};

async function callJudge({ instructions, input, schema }) {
  const out = await judgeProvider.complete({
    instructions, input, outputSchema: { name: "judgements", strict: false, schema },
  });
  const u = out.usage || {};
  usd += estimateUsd(u.inputTokens, u.outputTokens);
  return String(out.text || "");
}

/** Judge only the expectations a pattern already matched: substance confirmation. */
async function judged(scenario, log) {
  const candidates = scenario.expectations.filter((e) => needsJudgementFor(e));
  const outcome = await judgeRun({ scenario, log, candidates, call: callJudge });
  return { outcome, candidates: candidates.length };
}

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["kind"],
        properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } },
      },
    },
  },
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
      const out = await workerProvider.complete({
        instructions,
        input: "TASK: " + scenario.brief + "\n\nWHAT HAS HAPPENED SO FAR:\n" + renderLog(log),
        outputSchema: { name: "worker_actions", strict: false, schema: ACTION_SCHEMA },
      });
      const u = out.usage || {};
      usd += estimateUsd(u.inputTokens, u.outputTokens);
      const text = String(out.text || "");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      if (a < 0) return [{ kind: "finish", text: "" }];
      const parsed = JSON.parse(text.slice(a, b + 1));
      const acts = (parsed.actions || []).map((x) => ({ kind: x.kind || "message", tool: x.tool, args: x.args || {}, text: x.text || "" }));
      return acts.length ? acts : [{ kind: "finish", text: "" }];
    } catch (e) {
      return [{ kind: "finish", text: "ACTOR ERROR" }];
    }
  };
}

// One scenario per role, so both arms cover the same ground at a bearable cost.
const SUBSET = ["SC-SALES-01", "SC-SALES-06", "SC-TECH-02", "SC-AUDIT-02", "SC-MGR-01", "SC-REG-03"]
  .map((id) => ALL_SCENARIOS.find((s) => s.id === id));

// The strongest adversary that can be built from full rubric knowledge: it does
// the observable work AND says the right words. If the judge cannot separate
// this from competence, nothing in pattern-and-process scoring can.
const mirror = GAMING_POLICIES.find((p) => p.id === (process.env.MIDAS_MIRROR_POLICY || "read_everything_then_mirror"));
const rows = [];

console.log("worker:", workerModel, "| judge:", judgeModel, "| scenarios:", SUBSET.length);
console.log("");

for (const s of SUBSET) {
  // Arm 1: the gaming policy.
  const mRun = await runScenario(s, mirror.build(s));
  const mPattern = scoreScenario(s, mRun.log);
  const mJudged = await judged(s, mRun.log);
  const mFinal = scoreScenario(s, mRun.log, { judgements: mJudged.outcome.judgements, judgeApplied: true });

  // Arm 2: the live model doing it honestly.
  const wRun = await runScenario(s, liveActor(s));
  const wPattern = scoreScenario(s, wRun.log);
  const wJudged = await judged(s, wRun.log);
  const wFinal = scoreScenario(s, wRun.log, { judgements: wJudged.outcome.judgements, judgeApplied: true });

  rows.push({
    scenarioId: s.id, role: s.role,
    mirror: { pattern: mPattern.score, judged: mFinal.score, overturned: mFinal.overturnedByJudge, candidates: mJudged.candidates, invalidEvidence: mJudged.outcome.invalid },
    worker: { pattern: wPattern.score, judged: wFinal.score, overturned: wFinal.overturnedByJudge, candidates: wJudged.candidates, invalidEvidence: wJudged.outcome.invalid },
  });
  console.log(" ", s.id.padEnd(13),
    "mirror", String(mPattern.score).padStart(6), "->", String(mFinal.score).padStart(6),
    "| worker", String(wPattern.score).padStart(6), "->", String(wFinal.score).padStart(6));
}

const avg = (xs) => Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2));
const summary = {
  mirrorPattern: avg(rows.map((r) => r.mirror.pattern)),
  mirrorJudged: avg(rows.map((r) => r.mirror.judged)),
  workerPattern: avg(rows.map((r) => r.worker.pattern)),
  workerJudged: avg(rows.map((r) => r.worker.judged)),
};
summary.mirrorDrop = Number((summary.mirrorPattern - summary.mirrorJudged).toFixed(2));
summary.workerDrop = Number((summary.workerPattern - summary.workerJudged).toFixed(2));
summary.separation = Number((summary.workerJudged - summary.mirrorJudged).toFixed(2));
summary.separationBefore = Number((summary.workerPattern - summary.mirrorPattern).toFixed(2));

console.log("");
console.log("mirror  ", summary.mirrorPattern, "->", summary.mirrorJudged, "(drop", summary.mirrorDrop + ")");
console.log("worker  ", summary.workerPattern, "->", summary.workerJudged, "(drop", summary.workerDrop + ")");
console.log("separation between a real worker and a keyword mirror:",
  summary.separationBefore, "->", summary.separation);
console.log("estimated $" + usd.toFixed(4));

writeFileSync(repoPath("var", "state", "academy-judge-validation.json"), JSON.stringify({
  at: new Date().toISOString(), workerModel, judgeModel,
  note: "The judge confirms substance behind expectations a pattern already matched. Credit requires pattern AND substance.",
  rows, summary, estimatedUsd: Number(usd.toFixed(4)), outboundActionsTaken: 0,
}, null, 1));
