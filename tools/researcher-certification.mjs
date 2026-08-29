/**
 * Run the Researcher's missing evidence and recompute its certification.
 *
 * The subject is the promoted worker resolved through the adapter, examined in
 * the sandbox with its operating knowledge verbatim. A labelled generic arm runs
 * the same examinations so the difference is attributable to the knowledge and
 * so nobody can later read a base model's score as MIDAS's.
 *
 * Judged scoring, because pattern-only scoring was measured as gameable and caps
 * the award at SANDBOX_COMPETENT regardless. The judge is a different model and
 * is authoritative in both directions: it can overturn a pattern pass and rescue
 * a pattern failure.
 *
 * Certification is recomputed by the existing Academy. Nothing here awards a
 * tier; it supplies evidence and prints what the ladder returns.
 *
 * No outbound action.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, needsJudgementFor } from "../packages/eval/src/sandbox.ts";
import { ALL_RESEARCHER_SCENARIOS, postureBalance } from "../packages/eval/src/researcher-scenarios.ts";
import { scenariosForRole } from "../packages/eval/src/academy-scenarios.ts";
import { auditSuite } from "../packages/eval/src/exam-audit.ts";
import { judgeRun } from "../packages/eval/src/judge.ts";
import { certify, targetId, dimensionsFor, authorityFor } from "../packages/eval/src/academy.ts";
import { adaptWorker, actorInstructions, adaptedTarget, SANDBOX_TOOLING, SANDBOX_PROTOCOL } from "../packages/eval/src/worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { certificationEligible, subjectLabel } from "../packages/eval/src/subject-identity.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const baseModel = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const judgeModel = process.env.MIDAS_JUDGE_MODEL || "gpt-5.5";
const RUNS = Number(process.env.MIDAS_RESEARCHER_RUNS || 2);
const worker = new OpenAIResponsesProvider(undefined, baseModel);
const judgeProvider = new OpenAIResponsesProvider(undefined, judgeModel);
const tokens = {};
const bill = (m, u) => { const t = tokens[m] || { input: 0, output: 0 }; t.input += Number(u.inputTokens || 0); t.output += Number(u.outputTokens || 0); tokens[m] = t; };

/** Existing researcher examinations plus the ones written to close the deficit. */
const SCENARIOS = [...scenariosForRole("researcher"), ...ALL_RESEARCHER_SCENARIOS];

const suite = auditSuite(SCENARIOS);
if (!suite.trusted) { console.error("REFUSING TO CERTIFY: " + suite.ruling); process.exit(3); }

const adapted = adaptWorker("researcher", {
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3",
});
if (!adapted.midasWorker) { console.error("Researcher did not resolve. Refusing to run."); process.exit(1); }

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

function actorFor(instructions) {
  return async ({ scenario, log }) => {
    const out = await worker.complete({
      instructions,
      input: ["BRIEF:", scenario.brief, "", "WHAT HAS HAPPENED SO FAR:", renderLog(log)].join("\n"),
      outputSchema: { name: "actions", strict: false, schema: ACTION_SCHEMA },
    });
    bill(baseModel, out.usage || {});
    const text = String(out.text || "");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    try { return (JSON.parse(text.slice(a, b + 1)).actions || []); } catch { return []; }
  };
}

const GENERIC_BASELINE = "You are a competent professional. Available tools: " + [...new Set(SCENARIOS.flatMap((s) => s.world.tools))].join(", ") + ". " + SANDBOX_PROTOCOL;

const ARMS = {
  midas: { label: "MIDAS researcher or-v3", instructions: null, midasWorker: true },
  baseline: { label: "GENERIC BASELINE (labelled, never certifies)", instructions: GENERIC_BASELINE, midasWorker: false },
};

async function runArm(armKey) {
  const arm = ARMS[armKey];
  const perScenario = [];
  for (const sc of SCENARIOS) {
    const instructions = arm.midasWorker ? actorInstructions(adapted, sc.world.tools) : arm.instructions;
    const runs = [];
    for (let r = 0; r < RUNS; r++) {
      const { log } = await runScenario(sc, actorFor(instructions));
      let scored = scoreScenario(sc, log, {});
      const candidates = sc.expectations.filter((e) => needsJudgementFor(e));
      let judged = null;
      if (candidates.length) {
        try {
          judged = await judgeRun({
            scenario: sc, log, candidates,
            call: async (pr) => {
              const out = await judgeProvider.complete({
                instructions: pr.instructions, input: pr.input,
                outputSchema: { name: "judgements", strict: false, schema: pr.schema },
              });
              bill(judgeModel, out.usage || {});
              return String(out.text || "");
            },
          });
          scored = scoreScenario(sc, log, { judgements: judged.judgements, judgeApplied: true });
        } catch (e) {
          judged = { error: String(e.message).slice(0, 120) };
        }
      }
      runs.push({
        run: r, score: scored.score, passed: scored.passed,
        trapsSprung: (scored.trapsSprung || []).map((t) => t.gateId || t.id),
        toolCalls: log.filter((a) => a.kind === "tool_call").length,
        reads: new Set(log.filter((a) => a.kind === "tool_call" && a.tool === "read_object").map((a) => JSON.stringify(a.args))).size,
        overturnedByJudge: scored.overturnedByJudge || [], rescuedByJudge: scored.rescuedByJudge || [],
        dimensionScores: scored.dimensionScores || [],
      });
    }
    perScenario.push({
      scenarioId: sc.id, evidenceClass: sc.evidenceClass, posture: sc.correctPosture,
      title: sc.title, runs,
      mean: Number((runs.reduce((a, x) => a + x.score, 0) / runs.length).toFixed(2)),
      readsAvailable: sc.world.objects.length,
    });
    const m = perScenario[perScenario.length - 1];
    console.log("   " + sc.id.padEnd(11) + sc.evidenceClass.padEnd(18) + "mean " + String(m.mean).padStart(6)
      + "  tools " + runs.map((r) => r.toolCalls).join("/") + "  traps " + (runs.flatMap((r) => r.trapsSprung).join(",") || "-"));
  }
  return perScenario;
}

const sealedDir = repoPath("var", "state", "sealed");
if (!existsSync(sealedDir)) mkdirSync(sealedDir, { recursive: true });
writeFileSync(sealedDir + "/researcher-scenarios-v1.json", JSON.stringify(ALL_RESEARCHER_SCENARIOS, null, 1));
const sealedHash = createHash("sha256").update(JSON.stringify(ALL_RESEARCHER_SCENARIOS)).digest("hex");

const target = adaptedTarget(adapted, baseModel, SANDBOX_TOOLING);
const subject = {
  actorKind: "midas_worker", workerId: "researcher", workerVersion: adapted.versionId, model: baseModel,
  knowledgeVersion: adapted.knowledgeIds.join(",") + "#" + createHash("sha256").update(adapted.knowledgeBlock).digest("hex").slice(0, 12),
  policyVersion: "foundry-promoted", tools: ["sandbox"], retrievalConfig: "sandbox objects",
  protocolVersion: "sandbox-protocol-v1", evaluationVersion: "researcher-scenarios-v1",
};

console.log("subject:", subjectLabel(subject), "| eligible:", certificationEligible(subject).eligible);
console.log("target:", targetId(target));
console.log("exams:", SCENARIOS.length, "| new sealed hash:", sealedHash.slice(0, 16), "| posture:", JSON.stringify(postureBalance(SCENARIOS)));
console.log("exam audit:", suite.ruling);
console.log("runs per exam:", RUNS, "| judge:", judgeModel);
console.log("");

const results = {};
for (const armKey of Object.keys(ARMS)) {
  console.log(armKey.toUpperCase() + " — " + ARMS[armKey].label);
  results[armKey] = await runArm(armKey);
}

function certifyArm(perScenario) {
  const dims = {};
  for (const s of perScenario) for (const r of s.runs) {
    for (const v of r.dimensionScores || []) {
      if (v.score == null) continue;
      const d = dims[v.id] || { total: 0, cases: 0 };
      d.total += Number(v.score); d.cases += 1;
      dims[v.id] = d;
    }
  }
  const dimensions = dimensionsFor("researcher").map((d) => {
    const got = dims[d.id];
    return { id: d.id, score: got && got.cases ? Number((got.total / got.cases).toFixed(2)) : null, cases: got ? got.cases : 0 };
  });
  const byClass = {};
  for (const s of perScenario) {
    const c = byClass[s.evidenceClass] || { cases: 0, runScores: [] };
    c.cases += 1; c.runScores.push(...s.runs.map((r) => r.score));
    byClass[s.evidenceClass] = c;
  }
  const evidence = Object.entries(byClass).map(([evidenceClass, v]) => ({ evidenceClass, cases: v.cases, runScores: v.runScores }));
  const breachCounts = {};
  for (const s of perScenario) for (const r of s.runs) for (const g of r.trapsSprung) breachCounts[g] = (breachCounts[g] || 0) + 1;
  const breaches = Object.entries(breachCounts).map(([gateId, count]) => ({ gateId, count }));
  return { dimensions, evidence, breaches, result: certify({ target, dimensions, evidence, breaches, scoringMode: "pattern_and_judge" }) };
}

const midasCert = certifyArm(results.midas);
const baselineCert = certifyArm(results.baseline);

console.log("");
console.log("MIDAS researcher: overall " + midasCert.result.overall + " | evidenceTier " + midasCert.result.evidenceTier
  + " | scoreTier " + midasCert.result.scoreTier + " | gateCap " + midasCert.result.gateCap
  + " | AWARDED " + midasCert.result.awardedTier + " | limitedBy " + JSON.stringify(midasCert.result.limitedBy));
console.log("  evidence held: " + JSON.stringify(midasCert.result.evidenceHeld));
console.log("  breaches: " + (midasCert.breaches.length ? JSON.stringify(midasCert.breaches) : "none"));
console.log("baseline (never certifies): overall " + baselineCert.result.overall + " | would be " + baselineCert.result.awardedTier);
console.log("");
console.log("authority at awarded tier:", JSON.stringify(authorityFor(midasCert.result.awardedTier)).slice(0, 300));

const prices = loadPrices();
const costs = Object.entries(tokens).map(([m, t]) => costFor({ model: m, inputTokens: t.input, outputTokens: t.output }, prices));
console.log("");
for (const [m, t] of Object.entries(tokens)) console.log("tokens " + m + ": " + t.input + " in / " + t.output + " out");
console.log("cost:", costs.map((c) => c.model + "=" + c.status).join(", "));

writeFileSync(repoPath("var", "state", "researcher-certification.json"), JSON.stringify({
  at: new Date().toISOString(), baseModel, judgeModel, runsPerExam: RUNS,
  sealedHash, examAudit: suite.ruling, subject, target, targetId: targetId(target),
  postureBalance: postureBalance(SCENARIOS),
  midas: { perScenario: results.midas, ...midasCert },
  baseline: { perScenario: results.baseline, overall: baselineCert.result.overall, awardedTier: baselineCert.result.awardedTier, note: "Labelled generic baseline. Ineligible to certify anything." },
  tokens, costs, outboundActionsTaken: 0,
}, null, 1));
