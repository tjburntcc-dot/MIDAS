/**
 * Measure whether the worker gives the same answer twice.
 *
 * A subset of scenarios, each run several times against the same configuration.
 * The question is not the score. It is whether the decision and the critical
 * gates come out the same way, because a worker that leaks a credential on one
 * run in three has a credential-leaking failure mode and a mean conceals it.
 *
 * No outbound action.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario } from "../packages/eval/src/sandbox.ts";
import { ALL_SCENARIOS } from "../packages/eval/src/academy-scenarios.ts";
import { analyseStability, stabilityCeiling } from "../packages/eval/src/stability.ts";
import { tierRank } from "../packages/eval/src/academy.ts";
import { adaptWorker, actorInstructions } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const provider = new OpenAIResponsesProvider(undefined, model);
const REPEATS = Number(process.env.MIDAS_STABILITY_REPEATS || 3);
let usd = 0;

/**
 * The promoted workers. Every Academy execution path resolves the actor through
 * the adapter, so a run cannot silently fall back to a bare model wearing the
 * worker's job title -- which is what three sessions of certifications actually
 * measured.
 */
const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE,
  researcherVersionId: "or-v3",
};


// Chosen to span the failure modes that matter: a credential, an irreversible
// operation, a commercial commitment, a clean artifact, and a decision.
const SUBSET = ["SC-TECH-02", "SC-TECH-01", "SC-SALES-04", "SC-AUDIT-02", "SC-MGR-03"]
  .map((id) => ALL_SCENARIOS.find((s) => s.id === id));

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: {
    actions: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["kind"],
      properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } },
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
      const out = await provider.complete({
        instructions,
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
    } catch (e) { return [{ kind: "finish", text: "ACTOR ERROR" }]; }
  };
}

console.log("model:", model, "| scenarios:", SUBSET.length, "| repeats:", REPEATS);
console.log("");

const runs = [];
for (const s of SUBSET) {
  const line = [];
  for (let i = 0; i < REPEATS; i++) {
    const run = await runScenario(s, liveActor(s));
    const r = scoreScenario(s, run.log);
    const escalated = run.log.some((a) => a.kind === "escalate" || a.tool === "escalate");
    runs.push({
      scenarioId: s.id, repeat: i, score: r.score, passed: r.passed,
      gates: r.trapsSprung.map((t) => t.gateId),
      // The decision a scenario of this shape produces, read from behaviour
      // rather than from a self-report.
      decision: r.trapsSprung.length ? "tripped" : r.passed ? "clean" : "incomplete",
      escalated, toolCalls: run.log.filter((a) => a.kind === "tool_call").length,
    });
    line.push(String(r.score).padStart(6) + (r.trapsSprung.length ? "!" : " "));
  }
  console.log(" ", s.id.padEnd(13), line.join(" "));
}

const analysis = analyseStability(runs);
const ceiling = stabilityCeiling(analysis, tierRank);

console.log("");
console.log("within-case stddev (worker instability):", analysis.withinCaseStdDev);
console.log("between-case stddev (exam difficulty):  ", analysis.betweenCaseStdDev);
console.log("share of spread that is the worker:     ", analysis.instabilityShare);
console.log("worst single-case spread:               ", analysis.worstSpread);
console.log("");
if (analysis.intermittentGateCases.length) {
  for (const c of analysis.intermittentGateCases) console.log("  INTERMITTENT GATE:", c.scenarioId, c.gates.join(", "));
}
console.log(analysis.ruling);
console.log("");
console.log("stability ceiling:", ceiling.ceiling);
for (const r of ceiling.blockedBy) console.log("   blocked at", r);
console.log("estimated $" + usd.toFixed(4));

writeFileSync(repoPath("var", "state", "academy-stability.json"), JSON.stringify({
  at: new Date().toISOString(), model, repeats: REPEATS,
  analysis, ceiling, estimatedUsd: Number(usd.toFixed(4)), outboundActionsTaken: 0,
}, null, 1));
