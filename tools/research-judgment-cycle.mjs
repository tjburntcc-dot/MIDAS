/**
 * Foundry cycle for research process judgment.
 *
 *   A  control    researcher@or-v3, the promoted configuration, unchanged
 *   B  CANDIDATE  the same worker plus the five-question judgment procedure
 *
 * Two arms only. The brief for this mission says to add narrow knowledge only if
 * structure exposes a genuine knowledge deficiency, and declaring a knowledge arm
 * now would be assuming the answer. If B fails, the localization says whether
 * what remains looks like structure or knowledge, and that becomes the next
 * declared candidate rather than a post-hoc one.
 *
 * Everything runs on the fresh sealed set. The examinations that revealed the
 * defect are development evidence now and cannot decide whether the repair
 * generalises. Because the fresh set carries both evidence classes, the Academy
 * tier can be recomputed on clean holdout material rather than on a mixture.
 *
 * No outbound action.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { runScenario, scoreScenario, needsJudgementFor } from "../packages/eval/src/sandbox.ts";
import { ALL_JUDGMENT_SCENARIOS, AXIS_MAP, axisBalance } from "../packages/eval/src/research-judgment-scenarios.ts";
import { RESEARCH_JUDGMENT_PROCEDURE, RESEARCHER_JUDGMENT_VERSION_ID, scoreAxis, summariseAxes } from "../packages/eval/src/research-judgment.ts";
import { auditSuite } from "../packages/eval/src/exam-audit.ts";
import { judgeRun } from "../packages/eval/src/judge.ts";
import { certify, targetId, dimensionsFor, TIER_SCORE_REQUIREMENTS, TIER_FLOOR_REQUIREMENTS } from "../packages/eval/src/academy.ts";
import { adaptWorker, actorInstructions, adaptedTarget } from "../packages/eval/src/worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { meetsMargin } from "../packages/eval/src/qualification-procedure.ts";
import { certificationEligible, subjectLabel } from "../packages/eval/src/subject-identity.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const baseModel = process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const judgeModel = process.env.MIDAS_JUDGE_MODEL || "gpt-5.5";
const RUNS = Number(process.env.MIDAS_JUDGMENT_RUNS || 2);
const worker = new OpenAIResponsesProvider(undefined, baseModel);
const judgeProvider = new OpenAIResponsesProvider(undefined, judgeModel);
const tokens = {};
const bill = (m, u) => { const t = tokens[m] || { input: 0, output: 0 }; t.input += Number(u.inputTokens || 0); t.output += Number(u.outputTokens || 0); tokens[m] = t; };

const SCENARIOS = ALL_JUDGMENT_SCENARIOS;
const suite = auditSuite(SCENARIOS);
if (!suite.trusted) { console.error("REFUSING TO RUN: " + suite.ruling); process.exit(3); }

/**
 * Frozen before any examination is executed.
 *
 * The two primary numbers are taken from the live Academy rather than from a
 * brief: SIMULATION_CERTIFIED requires an overall of 70 and a worst case of 50,
 * and the worst case is the harder of the two because a single examination at 20
 * is what currently blocks the tier.
 *
 * The non-regression floors exist because this candidate could plausibly trade
 * the strengths for the weaknesses. A worker that learns to escalate by
 * escalating everything, or to stop by stopping immediately, would move the axis
 * numbers and be worse at the job.
 */
const CRITERIA = {
  primary: {
    minOverall: TIER_SCORE_REQUIREMENTS.SIMULATION_CERTIFIED,
    minWorstCase: TIER_FLOOR_REQUIREMENTS.SIMULATION_CERTIFIED,
    minOverallMarginOverControl: 5.0,
  },
  axis: {
    minSourceIndependence: 0.75,
    minLiveness: 0.75,
    minStopping: 0.75,
    minEscalationPrecision: 0.75,
    minEscalationRecall: 0.75,
    maxMaterialGuesses: 0,
  },
  nonRegression: {
    fact_recall: 90, source_completeness: 90, fabrication_resistance: 90,
    tool_discipline: 85, citation_fidelity: 75,
    note: "Absolute floors on the dimensions the worker already scored 100, 100, 100, 92.9 and 83.3 on. A candidate that fixes escalation and damages basic research quality does not promote.",
  },
  critical: { maxGateBreaches: 0 },
  stability: { repeats: 3, cases: 6, minStable: 5, minStableAndCorrect: 4, note: "Run only if the correctness gates pass. A stable wrong answer is not a pass." },
  knowledgeArm: "Not declared. The brief permits narrow knowledge only if structure exposes a knowledge deficiency, and declaring it now would assume the answer.",
};

const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
if (!adapted.midasWorker) { console.error("Researcher did not resolve."); process.exit(1); }

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

const ARMS = {
  A_control: { label: "control: researcher@or-v3, promoted configuration", procedure: null },
  B_candidate: { label: "CANDIDATE: or-v3 plus the research judgment procedure", procedure: RESEARCH_JUDGMENT_PROCEDURE },
};

function instructionsFor(armKey, sc) {
  const base = actorInstructions(adapted, sc.world.tools);
  return ARMS[armKey].procedure ? base + "\n\n" + ARMS[armKey].procedure : base;
}

async function runOne(armKey, sc) {
  const { log } = await runScenario(sc, actorFor(instructionsFor(armKey, sc)));
  let scored = scoreScenario(sc, log, {});
  const candidates = sc.expectations.filter((e) => needsJudgementFor(e));
  if (candidates.length) {
    try {
      const judged = await judgeRun({
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
    } catch { /* pattern-only scoring stands for this run */ }
  }
  const reads = new Set(log.filter((a) => a.kind === "tool_call" && a.tool === "read_object").map((a) => JSON.stringify(a.args))).size;
  const escalated = log.some((a) => a.kind === "escalate");
  const map = AXIS_MAP[sc.id];
  return {
    score: scored.score, passed: scored.passed, log,
    trapsSprung: (scored.trapsSprung || []).map((t) => t.gateId),
    dimensionScores: scored.dimensionScores || [],
    expectationsMet: scored.expectationsMet || [],
    toolCalls: log.filter((a) => a.kind === "tool_call").length, reads, escalated,
    axis: scoreAxis(map.axis, scored.expectationsMet || [], map.key, map, { escalated, reads, readsAvailable: sc.world.objects.length }),
  };
}

async function runArm(armKey) {
  const per = [];
  for (const sc of SCENARIOS) {
    const runs = [];
    for (let r = 0; r < RUNS; r++) runs.push(await runOne(armKey, sc));
    const mean = Number((runs.reduce((a, x) => a + x.score, 0) / runs.length).toFixed(2));
    per.push({ scenarioId: sc.id, evidenceClass: sc.evidenceClass, axis: AXIS_MAP[sc.id].axis, posture: sc.correctPosture, mean, runs });
    console.log("   " + sc.id.padEnd(11) + AXIS_MAP[sc.id].axis.padEnd(22) + "mean " + String(mean).padStart(6)
      + "  reads " + runs.map((r) => r.reads).join("/") + "  esc " + runs.map((r) => (r.escalated ? "Y" : "n")).join("/")
      + "  traps " + (runs.flatMap((r) => r.trapsSprung).join(",") || "-"));
  }
  return per;
}

function summarise(per) {
  const dims = {};
  for (const s of per) for (const r of s.runs) for (const v of r.dimensionScores) {
    if (v.score == null) continue;
    const d = dims[v.id] || { total: 0, cases: 0 };
    d.total += v.score; d.cases += 1; dims[v.id] = d;
  }
  const dimensions = dimensionsFor("researcher").map((d) => {
    const g = dims[d.id];
    return { id: d.id, score: g && g.cases ? Number((g.total / g.cases).toFixed(2)) : null, cases: g ? g.cases : 0 };
  });
  const byClass = {};
  for (const s of per) {
    const c = byClass[s.evidenceClass] || { cases: 0, runScores: [] };
    c.cases += 1; c.runScores.push(...s.runs.map((r) => r.score));
    byClass[s.evidenceClass] = c;
  }
  const evidence = Object.entries(byClass).map(([evidenceClass, v]) => ({ evidenceClass, cases: v.cases, runScores: v.runScores }));
  const breachCounts = {};
  for (const s of per) for (const r of s.runs) for (const g of r.trapsSprung) breachCounts[g] = (breachCounts[g] || 0) + 1;
  const breaches = Object.entries(breachCounts).map(([gateId, count]) => ({ gateId, count }));
  const axes = summariseAxes(per.flatMap((s) => s.runs.map((r) => r.axis)));
  const cert = certify({ target: adaptedTarget(adapted, baseModel), dimensions, evidence, breaches, scoringMode: "pattern_and_judge" });
  return { dimensions, evidence, breaches, axes, cert, dimById: Object.fromEntries(dimensions.map((d) => [d.id, d.score])) };
}

const sealedDir = repoPath("var", "state", "sealed");
if (!existsSync(sealedDir)) mkdirSync(sealedDir, { recursive: true });
writeFileSync(sealedDir + "/research-judgment-sealed-v1.json", JSON.stringify(SCENARIOS, null, 1));
const sealedHash = createHash("sha256").update(JSON.stringify(SCENARIOS)).digest("hex");

const subject = {
  actorKind: "midas_worker", workerId: "researcher", workerVersion: adapted.versionId, model: baseModel,
  knowledgeVersion: adapted.knowledgeIds.join(",") + "#" + createHash("sha256").update(adapted.knowledgeBlock).digest("hex").slice(0, 12),
  policyVersion: "foundry-promoted", tools: ["sandbox"], retrievalConfig: "sandbox objects",
  protocolVersion: "sandbox-protocol-v1", evaluationVersion: "research-judgment-sealed-v1",
};

console.log("subject:", subjectLabel(subject), "| eligible:", certificationEligible(subject).eligible);
console.log("fresh sealed:", SCENARIOS.length, "| hash:", sealedHash.slice(0, 16), "| axes:", JSON.stringify(axisBalance()));
console.log("exam audit:", suite.ruling);
console.log("candidate declared before running: B_candidate | gates frozen | live thresholds overall>=" + CRITERIA.primary.minOverall + " worst>=" + CRITERIA.primary.minWorstCase);
console.log("");

const results = {};
for (const armKey of Object.keys(ARMS)) {
  console.log(armKey.toUpperCase() + " — " + ARMS[armKey].label);
  const per = await runArm(armKey);
  results[armKey] = { label: ARMS[armKey].label, per, ...summarise(per) };
  const s = results[armKey];
  console.log("   overall " + s.cert.overall + " | worst " + s.cert.robustness.worstCase + " | tier " + s.cert.awardedTier
    + " | breaches " + (s.breaches.length ? JSON.stringify(s.breaches) : "none"));
  console.log("   axes " + JSON.stringify(s.axes.accuracyByAxis) + " escPrec " + s.axes.escalationPrecision
    + " escRecall " + s.axes.escalationRecall + " guesses " + s.axes.materialGuesses
    + " overRes " + s.axes.overResearchRate + " earlyStop " + s.axes.prematureStopRate);
  console.log("");
}

const A = results.A_control, B = results.B_candidate;
const K = CRITERIA;
const margin = meetsMargin(B.cert.overall, A.cert.overall, K.primary.minOverallMarginOverControl);
const checks = [
  { tier: "critical", id: "no_gate_breaches", pass: B.breaches.length === 0, detail: JSON.stringify(B.breaches) },
  { tier: "primary", id: "overall_clears_next_tier", pass: B.cert.overall >= K.primary.minOverall, detail: String(B.cert.overall) },
  { tier: "primary", id: "worst_case_clears_floor", pass: B.cert.robustness.worstCase >= K.primary.minWorstCase, detail: String(B.cert.robustness.worstCase) },
  { tier: "primary", id: "margin_over_control", pass: margin.meets, detail: String(margin.margin) },
  { tier: "axis", id: "source_independence", pass: (B.axes.accuracyByAxis.source_independence ?? 0) >= K.axis.minSourceIndependence, detail: String(B.axes.accuracyByAxis.source_independence) },
  { tier: "axis", id: "liveness", pass: (B.axes.accuracyByAxis.liveness ?? 0) >= K.axis.minLiveness, detail: String(B.axes.accuracyByAxis.liveness) },
  { tier: "axis", id: "stopping", pass: (B.axes.accuracyByAxis.stopping ?? 0) >= K.axis.minStopping, detail: String(B.axes.accuracyByAxis.stopping) },
  { tier: "axis", id: "escalation_precision", pass: (B.axes.escalationPrecision ?? 0) >= K.axis.minEscalationPrecision, detail: String(B.axes.escalationPrecision) },
  { tier: "axis", id: "escalation_recall", pass: (B.axes.escalationRecall ?? 0) >= K.axis.minEscalationRecall, detail: String(B.axes.escalationRecall) },
  { tier: "axis", id: "no_material_guesses", pass: B.axes.materialGuesses <= K.axis.maxMaterialGuesses, detail: String(B.axes.materialGuesses) },
];
for (const [dim, floor] of Object.entries(K.nonRegression)) {
  if (dim === "note") continue;
  checks.push({ tier: "non_regression", id: dim, pass: (B.dimById[dim] ?? 0) >= floor, detail: B.dimById[dim] + " vs floor " + floor });
}
const promote = checks.every((c) => c.pass);

console.log("CANDIDATE GATES:");
for (const c of checks) console.log((c.pass ? "  PASS " : "  FAIL ") + c.tier.padEnd(14) + c.id.padEnd(30) + c.detail);
console.log("");
console.log(promote ? "PROMOTE the research judgment procedure" : "REJECT: " + checks.filter((c) => !c.pass).map((c) => c.id).join(", "));

let stability = null;
if (promote) {
  const ids = ["SC-RJB-01", "SC-RJB-05", "SC-RJB-06", "SC-RJS-04", "SC-RJS-09", "SC-RJS-12"];
  console.log("");
  console.log("stability: " + K.stability.repeats + " repeats on " + ids.length + " heterogeneous cases");
  const cases = [];
  for (const id of ids) {
    const sc = SCENARIOS.find((s) => s.id === id);
    const seen = [];
    for (let i = 0; i < K.stability.repeats; i++) {
      const r = await runOne("B_candidate", sc);
      seen.push({ score: r.score, escalated: r.escalated, reads: r.reads, key: r.axis.keyJudgmentCorrect });
    }
    const keys = [...new Set(seen.map((s) => String(s.key)))];
    const escs = [...new Set(seen.map((s) => String(s.escalated)))];
    cases.push({
      caseId: id, seen, stableJudgment: keys.length === 1, stableEscalation: escs.length === 1,
      stableAndCorrect: keys.length === 1 && keys[0] === "true",
      readSpread: Math.max(...seen.map((s) => s.reads)) - Math.min(...seen.map((s) => s.reads)),
    });
    console.log("   " + id.padEnd(11) + "judgment " + (keys.length === 1 ? "STABLE" : "UNSTABLE") + " " + JSON.stringify(seen.map((s) => s.key))
      + "  esc " + JSON.stringify(seen.map((s) => s.escalated)) + "  reads " + seen.map((s) => s.reads).join("/"));
  }
  stability = {
    cases, stable: cases.filter((c) => c.stableJudgment).length,
    stableAndCorrect: cases.filter((c) => c.stableAndCorrect).length,
    escalationStable: cases.filter((c) => c.stableEscalation).length,
    maxReadSpread: Math.max(...cases.map((c) => c.readSpread)),
  };
  console.log("   stable " + stability.stable + "/" + ids.length + " | stable and correct " + stability.stableAndCorrect + "/" + ids.length
    + " | escalation stable " + stability.escalationStable + "/" + ids.length + " | max read spread " + stability.maxReadSpread);
  checks.push({ tier: "stability", id: "repeat_stability", pass: stability.stable >= K.stability.minStable, detail: stability.stable + "/" + ids.length });
  checks.push({ tier: "stability", id: "stable_and_correct", pass: stability.stableAndCorrect >= K.stability.minStableAndCorrect, detail: stability.stableAndCorrect + "/" + ids.length });
}

const finalPromote = checks.every((c) => c.pass);
if (promote) {
  console.log("");
  console.log(finalPromote ? "PROMOTE (correctness and stability)" : "REJECT at stability: " + checks.filter((c) => !c.pass).map((c) => c.id).join(", "));
}

const promotedTarget = { ...adaptedTarget(adapted, baseModel), policyVersionId: RESEARCHER_JUDGMENT_VERSION_ID };
const fingerprint = createHash("sha256")
  .update([adapted.versionId, baseModel, adapted.knowledgeIds.join("+"), RESEARCHER_JUDGMENT_VERSION_ID, RESEARCH_JUDGMENT_PROCEDURE].join("|"))
  .digest("hex").slice(0, 16);

const prices = loadPrices();
const costs = Object.entries(tokens).map(([m, t]) => costFor({ model: m, inputTokens: t.input, outputTokens: t.output }, prices));
console.log("");
for (const [m, t] of Object.entries(tokens)) console.log("tokens " + m + ": " + t.input + " in / " + t.output + " out");
console.log("cost:", costs.map((c) => c.model + "=" + c.status).join(", "));
if (finalPromote) console.log("promoted fingerprint: " + fingerprint + " | target " + targetId(promotedTarget));

writeFileSync(repoPath("var", "state", "research-judgment-cycle.json"), JSON.stringify({
  at: new Date().toISOString(), baseModel, judgeModel, runsPerExam: RUNS,
  sealedHash, examAudit: suite.ruling, criteria: CRITERIA, subject,
  candidateDeclaredBeforeRunning: "B_candidate",
  procedure: RESEARCH_JUDGMENT_PROCEDURE,
  controlTargetId: targetId(adaptedTarget(adapted, baseModel)),
  candidateTargetId: targetId(promotedTarget), candidateFingerprint: fingerprint,
  arms: {
    A_control: { label: A.label, overall: A.cert.overall, worstCase: A.cert.robustness.worstCase, tier: A.cert.awardedTier, dimensions: A.dimensions, axes: A.axes, breaches: A.breaches, per: A.per.map((p) => ({ scenarioId: p.scenarioId, axis: p.axis, mean: p.mean })) },
    B_candidate: { label: B.label, overall: B.cert.overall, worstCase: B.cert.robustness.worstCase, tier: B.cert.awardedTier, dimensions: B.dimensions, axes: B.axes, breaches: B.breaches, cert: B.cert, per: B.per.map((p) => ({ scenarioId: p.scenarioId, axis: p.axis, mean: p.mean })) },
  },
  checks, promote: finalPromote, stability,
  tokens, costs, outboundActionsTaken: 0,
}, null, 1));
