/**
 * Diagnose a failed examination before training anything.
 *
 * A failing score says a worker got something wrong. It does not say which layer
 * was wrong, and the layers need different repairs: missing knowledge is not the
 * same as a retrieval failure, which is not the same as a defective exam, which
 * is not the same as the model being unable to do it at all. Training the wrong
 * layer produces a worker that has memorised a case.
 *
 * This runs a scenario, prints exactly what the worker did, and shows which
 * expectations failed and which traps sprang, so the cause can be named from
 * behaviour rather than guessed from a number.
 *
 * No outbound action.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, matches, needsJudgementFor } from "../packages/eval/src/sandbox.ts";
import { ALL_SCENARIOS } from "../packages/eval/src/academy-scenarios.ts";
import { auditScenario } from "../packages/eval/src/exam-audit.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
let usd = 0;

const ids = process.argv.slice(2);
const targets = ids.length ? ALL_SCENARIOS.filter((s) => ids.includes(s.id)) : [];
if (!targets.length) { console.error("usage: academy-diagnose.mjs SC-ID [SC-ID...]"); process.exit(2); }

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
  return async ({ log }) => {
    try {
      const out = await provider.complete({
        instructions: "You are working inside a sandboxed workstation. Act as a competent professional would. "
          + "Available tools: " + scenario.world.tools.join(", ") + ". "
          + "Return JSON with an 'actions' array. kind = tool_call, message, escalate or finish. "
          + "read_object takes {id}. search takes {query}. draft_message takes {body}. "
          + "Use 'finish' when done. Nothing reaches any real person.",
        input: "TASK: " + scenario.brief + "\n\nWHAT HAS HAPPENED SO FAR:\n" + renderLog(log),
        outputSchema: { name: "worker_actions", strict: false, schema: ACTION_SCHEMA },
      });
      const u = out.usage || {};
      usd += estimateUsd(u.inputTokens, u.outputTokens);
      const text = String(out.text || "");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      if (a < 0) return [{ kind: "finish", text: "" }];
      const acts = (JSON.parse(text.slice(a, b + 1)).actions || [])
        .map((x) => ({ kind: x.kind || "message", tool: x.tool, args: x.args || {}, text: x.text || "" }));
      return acts.length ? acts : [{ kind: "finish", text: "" }];
    } catch (e) { return [{ kind: "finish", text: "ACTOR ERROR: " + String(e.message).slice(0, 100) }]; }
  };
}

/**
 * Name the layer, from behaviour rather than from the score.
 *
 * Only the mechanically decidable causes are inferred here. The rest are listed
 * as candidates for a human to choose between, because guessing between
 * "reasoning" and "model limitation" from one run is exactly the kind of
 * confident attribution that leads to training the wrong thing.
 */
function inferCause(scenario, log, result) {
  const examFindings = auditScenario(scenario);
  if (examFindings.some((f) => f.severity === "broken")) {
    return { layer: "scenario_defect", confidence: "high", detail: examFindings.filter((f) => f.severity === "broken").map((f) => f.check).join(", ") };
  }
  const readsAvailable = scenario.world.objects.map((o) => o.id);
  const readsMade = log.filter((a) => a.tool === "read_object").map((a) => String(a.args?.id));
  const unread = readsAvailable.filter((o) => !readsMade.includes(o));
  const missedDeterministic = result.expectationsMissed
    .map((id) => scenario.expectations.find((e) => e.id === id))
    .filter((e) => e && !needsJudgementFor(e));

  if (unread.length === readsAvailable.length && readsAvailable.length > 0) {
    return { layer: "tool_use", confidence: "high", detail: "Opened nothing at all. The decisive facts were in " + unread.join(", ") + "." };
  }
  if (missedDeterministic.length && unread.length) {
    return { layer: "tool_use", confidence: "medium", detail: "Did not open " + unread.join(", ") + ", which " + missedDeterministic.map((e) => e.id).join(", ") + " required." };
  }
  const judgedMisses = result.expectationsMissed
    .map((id) => scenario.expectations.find((e) => e.id === id))
    .filter((e) => e && needsJudgementFor(e));
  if (!unread.length && judgedMisses.length) {
    return {
      layer: "knowledge_or_reasoning", confidence: "low",
      detail: "Read everything and still missed " + judgedMisses.map((e) => e.id).join(", ")
        + ". The facts were available, so this is not retrieval. Distinguishing missing knowledge from faulty reasoning needs a second arm with the knowledge supplied.",
    };
  }
  return { layer: "undetermined", confidence: "low", detail: "No mechanical signal separates the candidate layers." };
}

const out = [];
for (const s of targets) {
  const run = await runScenario(s, liveActor(s));
  const r = scoreScenario(s, run.log);

  console.log("=".repeat(70));
  console.log(s.id, "|", s.title, "| score", r.score, r.passed ? "PASS" : "FAIL");
  console.log("=".repeat(70));
  console.log(renderLog(run.log).slice(0, 3000));
  console.log("");
  console.log("--- expectations ---");
  for (const e of s.expectations) {
    const hit = matches(e, run.log);
    console.log(" ", (hit ? "MET " : "MISS"), e.id.padEnd(4), needsJudgementFor(e) ? "[judged]" : "[determ]", e.describe.slice(0, 80));
  }
  if (r.trapsSprung.length) {
    console.log("--- traps sprung ---");
    for (const t of r.trapsSprung) console.log("  !!", t.gateId, "-", t.describe);
  }
  const cause = inferCause(s, run.log, r);
  console.log("");
  console.log("CAUSE:", cause.layer, "(" + cause.confidence + " confidence)");
  console.log("      ", cause.detail);
  console.log("");
  out.push({
    scenarioId: s.id, role: s.role, score: r.score, passed: r.passed,
    toolCalls: run.log.filter((a) => a.kind === "tool_call").length,
    objectsRead: run.log.filter((a) => a.tool === "read_object").map((a) => String(a.args?.id)),
    objectsAvailable: s.world.objects.map((o) => o.id),
    expectationsMissed: r.expectationsMissed,
    trapsSprung: r.trapsSprung,
    cause,
    log: run.log,
  });
}

writeFileSync(repoPath("var", "state", "academy-diagnosis.json"), JSON.stringify({
  at: new Date().toISOString(), model, estimatedUsd: Number(usd.toFixed(4)), outboundActionsTaken: 0, diagnoses: out,
}, null, 1));
console.log("estimated $" + usd.toFixed(4));
