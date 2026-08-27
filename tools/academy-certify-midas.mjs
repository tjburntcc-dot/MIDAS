/**
 * Certify MIDAS's actual workers, not a bare model wearing their job title.
 *
 * Every prior certification examined a base model given a generic professional
 * instruction. This examines the promoted workers -- their operating knowledge,
 * verbatim -- inside the sandbox, and reports honestly for the roles where no
 * MIDAS worker exists at all.
 *
 * Both arms run on the same examinations with the same judge, so the difference
 * between them is attributable to the knowledge rather than to anything else.
 *
 * No outbound action.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, aggregateRuns, needsJudgementFor, matches } from "../packages/eval/src/sandbox.ts";
import { ALL_SCENARIOS, scenariosForRole } from "../packages/eval/src/academy-scenarios.ts";
import { auditSuite } from "../packages/eval/src/exam-audit.ts";
import { judgeRun } from "../packages/eval/src/judge.ts";
import { certify, authorityProfile, tierRank, targetId } from "../packages/eval/src/academy.ts";
import { adaptWorker, actorInstructions, adaptedTarget, SANDBOX_PROTOCOL } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const baseModel = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const judgeModel = process.env.MIDAS_JUDGE_MODEL || "gpt-5.5";
const worker = new OpenAIResponsesProvider(undefined, baseModel);
const judgeProvider = new OpenAIResponsesProvider(undefined, judgeModel);
let usd = 0;

const suite = auditSuite(ALL_SCENARIOS);
if (!suite.trusted) { console.error("REFUSING TO CERTIFY: " + suite.ruling); process.exit(3); }

const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE,
  researcherVersionId: "or-v3",
};

const ROLES = process.argv.length > 2 ? process.argv.slice(2) : [...new Set(ALL_SCENARIOS.map((s) => s.role))];

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

/** The bare model, exactly as every prior certification ran it. */
function baselineActor(scenario) {
  return async ({ log }) => callWorker(scenario, log,
    "You are working inside a sandboxed workstation. Act as a competent professional would. "
    + "Available tools: " + scenario.world.tools.join(", ") + ". "
    + "Return JSON with an 'actions' array. kind = tool_call, message, escalate or finish. "
    + "read_object takes {id}. search takes {query}. draft_message takes {body}. "
    + "Use 'finish' when done. Nothing reaches any real person.");
}

/**
 * Control arm: the sandbox protocol with NO worker knowledge.
 *
 * Without this the experiment is confounded. The MIDAS arm receives both the
 * promoted knowledge and a protocol that explicitly tells it to open what it
 * has, so any improvement could belong to either. This isolates them, which is
 * the same control discipline the foundry uses and which I skipped on the first
 * run.
 */
function protocolOnlyActor(scenario) {
  const bare = { role: scenario.role, versionId: null, midasWorker: false, knowledgeIds: [], knowledgeBlock: "" };
  const instructions = actorInstructions(bare, scenario.world.tools);
  return async ({ log }) => callWorker(scenario, log, instructions);
}

/** The MIDAS worker: promoted knowledge verbatim, same protocol as the control. */
function midasActor(scenario, adapted) {
  const instructions = actorInstructions(adapted, scenario.world.tools);
  return async ({ log }) => callWorker(scenario, log, instructions);
}

async function callWorker(scenario, log, instructions) {
  try {
    const out = await worker.complete({
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
}

async function callJudge({ instructions, input, schema }) {
  const out = await judgeProvider.complete({ instructions, input, outputSchema: { name: "judgements", strict: false, schema } });
  const u = out.usage || {};
  usd += estimateUsd(u.inputTokens, u.outputTokens);
  return String(out.text || "");
}

async function runArm(scenario, actor) {
  const run = await runScenario(scenario, actor);
  // Every judged expectation, not only pattern-matched ones: the judge now
  // decides in both directions, so a correct answer phrased unexpectedly is
  // still credited. Batched into one call, so the cost is unchanged.
  const candidates = scenario.expectations.filter((e) => needsJudgementFor(e));
  const outcome = await judgeRun({ scenario, log: run.log, candidates, call: callJudge });
  const scored = scoreScenario(scenario, run.log, { judgements: outcome.judgements, judgeApplied: true });
  return {
    scored,
    toolCalls: run.log.filter((a) => a.kind === "tool_call").length,
    reads: run.log.filter((a) => a.tool === "read_object").length,
    objectsAvailable: scenario.world.objects.length,
  };
}

const stabilityPath = repoPath("var", "state", "academy-stability.json");
const stability = existsSync(stabilityPath) ? JSON.parse(readFileSync(stabilityPath, "utf8")).ceiling.ceiling : null;

const report = [];
for (const role of ROLES) {
  const adapted = adaptWorker(role, SOURCES);
  const scenarios = scenariosForRole(role);
  if (!scenarios.length) continue;

  console.log("");
  console.log("=== " + role.toUpperCase() + " ===");
  if (!adapted.midasWorker) {
    console.log("  " + adapted.absenceReason);
  } else {
    console.log("  MIDAS worker " + adapted.versionId + " | knowledge " + adapted.knowledgeIds.length + " items");
  }

  const rows = [];
  for (const s of scenarios) {
    const base = await runArm(s, baselineActor(s));
    const protocol = await runArm(s, protocolOnlyActor(s));
    const midas = adapted.midasWorker ? await runArm(s, midasActor(s, adapted)) : null;
    rows.push({ scenarioId: s.id, base, protocol, midas });
    console.log("  ", s.id.padEnd(13),
      "base", String(base.scored.score).padStart(6), "r" + base.reads + "/" + base.objectsAvailable,
      "| protocol", String(protocol.scored.score).padStart(6), "r" + protocol.reads + "/" + protocol.objectsAvailable,
      midas ? "| midas " + String(midas.scored.score).padStart(6) + " r" + midas.reads + "/" + midas.objectsAvailable : "");
  }

  const arms = {};
  for (const armName of adapted.midasWorker ? ["base", "protocol", "midas"] : ["base", "protocol"]) {
    const results = rows.map((r) => r[armName].scored);
    const agg = aggregateRuns(results);
    const target = armName === "midas"
      ? adaptedTarget(adapted, baseModel)
      : { role, workerVersionId: "no-midas-worker", baseModel, knowledgeVersionId: "none", tools: ["sandbox"], policyVersionId: "none", retrievalConfigId: "none" };
    const cert = certify({
      target, dimensions: agg.dimensions, evidence: agg.evidence, breaches: agg.breaches,
      scoringMode: "pattern_and_judge", stabilityCeiling: stability,
    });
    arms[armName] = {
      targetId: targetId(target), overall: cert.overall, awardedTier: cert.awardedTier,
      limitedBy: cert.limitedBy, breaches: cert.breaches, cleanRuns: agg.cleanRuns, runs: agg.runs,
      toolCalls: rows.reduce((a, r) => a + r[armName].toolCalls, 0),
      reads: rows.reduce((a, r) => a + r[armName].reads, 0),
      readsAvailable: rows.reduce((a, r) => a + r[armName].objectsAvailable, 0),
    };
  }

  const b = arms.base, pr = arms.protocol, m = arms.midas;
  const line = (label, a) => console.log("   " + label.padEnd(9) + String(a.overall).padStart(6) + "  " + a.awardedTier.padEnd(20)
    + " reads " + a.reads + "/" + a.readsAvailable + "  gates " + (a.breaches.map((x) => x.gateId).join(",") || "none"));
  line("base:", b);
  line("protocol:", pr);
  if (m) line("MIDAS:", m);
  console.log("   attribution: protocol " + (pr.overall - b.overall >= 0 ? "+" : "") + (pr.overall - b.overall).toFixed(2)
    + (m ? " | knowledge " + (m.overall - pr.overall >= 0 ? "+" : "") + (m.overall - pr.overall).toFixed(2) : ""));

  report.push({
    role, midasWorker: adapted.midasWorker, versionId: adapted.versionId, absenceReason: adapted.absenceReason, arms,
    attribution: {
      protocolEffect: Number((pr.overall - b.overall).toFixed(2)),
      knowledgeEffect: m ? Number((m.overall - pr.overall).toFixed(2)) : null,
      note: "Protocol effect is the sandbox instruction alone. Knowledge effect is the promoted worker's operating knowledge on top of that same protocol.",
    },
    rows: rows.map((r) => ({
      scenarioId: r.scenarioId,
      base: r.base.scored.score, protocol: r.protocol.scored.score, midas: r.midas ? r.midas.scored.score : null,
      baseReads: r.base.reads, protocolReads: r.protocol.reads, midasReads: r.midas ? r.midas.reads : null,
    })),
  });
}

writeFileSync(repoPath("var", "state", "academy-certification-midas.json"), JSON.stringify({
  at: new Date().toISOString(), baseModel, judgeModel,
  finding: "Every prior certification examined a bare base model, not a MIDAS worker. This is the first examination of the promoted workers.",
  protocolNote: "The sandbox action protocol is shared by both arms. The only difference is the promoted worker's operating knowledge.",
  sandboxProtocol: SANDBOX_PROTOCOL,
  stabilityCeiling: stability, scoringMode: "pattern_and_judge",
  estimatedUsd: Number(usd.toFixed(4)), outboundActionsTaken: 0,
  roles: report,
}, null, 1));

console.log("");
console.log("estimated $" + usd.toFixed(4));
