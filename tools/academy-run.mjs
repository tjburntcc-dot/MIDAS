/**
 * Run the Academy against a live model and certify what comes out.
 *
 * Infrastructure that has never been run on a real worker is a claim about
 * infrastructure. This executes the examinations against an actual model, scores
 * observable actions, and issues the certification the result earns -- including,
 * quite possibly, none.
 *
 * The actor sees the brief, the tools it has, and what has happened so far. It
 * does not see the expectations, the traps, or the dimensions. A worker told what
 * it is being scored on is being scored on its reading comprehension.
 *
 * No outbound action. The sandbox has no transport; send_message records and
 * transmits nothing.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, aggregateRuns } from "../packages/eval/src/sandbox.ts";
import { ALL_SCENARIOS, scenariosForRole } from "../packages/eval/src/academy-scenarios.ts";
import { certify, authorityProfile, dimensionsFor } from "../packages/eval/src/academy.ts";
import { adaptWorker, actorInstructions } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");

const roleArg = process.argv[2] || null;
const model = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const scenarios = roleArg ? scenariosForRole(roleArg) : ALL_SCENARIOS;
if (!scenarios.length) { console.error("no scenarios for role " + roleArg); process.exit(2); }

const provider = new OpenAIResponsesProvider(undefined, model);
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


const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["kind"],
        properties: {
          kind: { type: "string", description: "tool_call | message | escalate | finish" },
          tool: { type: "string" },
          args: { type: "object", additionalProperties: true, properties: {} },
          text: { type: "string" },
        },
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

/** The actor. Sees the situation; never sees how it is being marked. */
function liveActor(scenario) {
  const adapted = adaptWorker(scenario.role, SOURCES);
  const instructions = actorInstructions(adapted, scenario.world.tools);
  return async ({ log }) => {
    const input = [
      "TASK: " + scenario.brief,
      "",
      "WHAT HAS HAPPENED SO FAR:",
      renderLog(log),
    ].join("\n");
    try {
      const out = await provider.complete({
        instructions, input,
        outputSchema: { name: "worker_actions", strict: false, schema: ACTION_SCHEMA },
      });
      const u = out.usage || {};
      usd += estimateUsd(u.inputTokens, u.outputTokens);
      const text = String(out.text || "");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      if (a < 0) return [{ kind: "finish", text: "" }];
      const parsed = JSON.parse(text.slice(a, b + 1));
      const actions = (parsed.actions || []).map((x) => ({
        kind: x.kind || "message", tool: x.tool, args: x.args || {}, text: x.text || "",
      }));
      return actions.length ? actions : [{ kind: "finish", text: "" }];
    } catch (e) {
      return [{ kind: "finish", text: "ACTOR ERROR: " + String(e.message).slice(0, 120) }];
    }
  };
}

console.log("Academy run | model:", model, "| scenarios:", scenarios.length);
console.log("");

const results = [];
for (const s of scenarios) {
  const run = await runScenario(s, liveActor(s));
  const r = scoreScenario(s, run.log);
  results.push({ ...r, title: s.title, failureClass: s.failureClass, log: run.log });
  console.log(" ", (r.passed ? "PASS" : "FAIL"), String(r.score).padStart(6), s.id.padEnd(13), s.title.slice(0, 46));
  for (const t of r.trapsSprung) console.log("        !! " + t.gateId + " -- " + t.describe);
  for (const m of r.expectationsMissed) {
    const e = s.expectations.find((x) => x.id === m);
    console.log("         missed: " + e.describe);
  }
}

// Certify per role, because a scorecard mixing a sales run with a security run
// answers no question anyone has.
const byRole = {};
for (const r of results) (byRole[r.role] = byRole[r.role] || []).push(r);

const scorecards = [];
for (const role of Object.keys(byRole)) {
  const agg = aggregateRuns(byRole[role]);
  const target = {
    role, workerVersionId: "academy-baseline-v0", baseModel: model,
    knowledgeVersionId: "none", tools: ["sandbox"], policyVersionId: "none", retrievalConfigId: "none",
  };
  const cert = certify({
    target, dimensions: agg.dimensions, evidence: agg.evidence, breaches: agg.breaches,
    costUsdPerCase: Number((usd / results.length).toFixed(4)),
  });
  const authority = authorityProfile(cert.awardedTier);
  scorecards.push({ role, cert, authority, cleanRuns: agg.cleanRuns, runs: agg.runs });

  console.log("");
  console.log("=== " + role.toUpperCase() + " ===");
  console.log("overall", cert.overall, "| awarded", cert.awardedTier, "| limited by", cert.limitedBy.join(", "));
  console.log(cert.ruling);
  if (cert.breaches.length) {
    for (const b of cert.breaches) console.log("  GATE " + b.gateId + " x" + b.count + " on " + b.caseIds.join(", "));
  }
  console.log("  clean runs:", agg.cleanRuns + "/" + agg.runs);
  const weakest = [...agg.dimensions].sort((a, b) => a.score - b.score).slice(0, 3);
  console.log("  weakest dimensions:", weakest.map((d) => d.id + " " + d.score).join(", ") || "(none measured)");
  const untested = dimensionsFor(role).map((d) => d.id).filter((id) => !agg.dimensions.some((d) => d.id === id));
  if (untested.length) console.log("  never exercised:", untested.join(", "));
  console.log("  may prepare:", authority.mayPrepare.join(", ") || "(nothing)");
}

writeFileSync(repoPath("var", "state", "academy-certification.json"), JSON.stringify({
  at: new Date().toISOString(), model,
  outboundActionsTaken: 0,
  estimatedUsd: Number(usd.toFixed(4)),
  scenariosRun: results.length,
  passed: results.filter((r) => r.passed).length,
  scorecards: scorecards.map((s) => ({
    role: s.role, awardedTier: s.cert.awardedTier, overall: s.cert.overall,
    limitedBy: s.cert.limitedBy, breaches: s.cert.breaches, ruling: s.cert.ruling,
    scoreTier: s.cert.scoreTier, evidenceTier: s.cert.evidenceTier, gateCap: s.cert.gateCap,
    robustness: s.cert.robustness, dimensions: s.cert.dimensions,
    dimensionsNotExercised: s.cert.dimensionsNotExercised,
    mayPrepare: s.authority.mayPrepare, blocked: s.authority.blocked,
    cleanRuns: s.cleanRuns, runs: s.runs,
  })),
  results: results.map((r) => ({
    scenarioId: r.scenarioId, title: r.title, role: r.role, failureClass: r.failureClass,
    score: r.score, passed: r.passed, trapsSprung: r.trapsSprung,
    expectationsMissed: r.expectationsMissed, steps: r.steps,
  })),
}, null, 1));

console.log("");
console.log("total estimated $" + usd.toFixed(4), "| scenarios passed:", results.filter((r) => r.passed).length + "/" + results.length);
console.log("outbound actions taken: 0");
