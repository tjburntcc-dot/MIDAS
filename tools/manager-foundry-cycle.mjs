/**
 * Manufacture and evaluate the MIDAS Manager.
 *
 *   A  generic     a capable model told to act as a business manager
 *   B  CANDIDATE   the same model with the Manager output contract
 *   C  CANDIDATE   the contract plus the ten-item Manager doctrine
 *
 * Two candidates declared before running, each with its own gate. B is a
 * candidate in its own right on absolute thresholds; C must additionally beat B
 * by a declared margin. If both pass, B promotes, because a doctrine that earns
 * nothing is a maintenance cost. That structure is the correction to a mistake
 * made twice in the Qualification line, where the structure-only arm won and
 * could not be promoted because it had only ever been a control.
 *
 * Single-shot by design and by arithmetic: a Manager decision is one response to
 * one dossier, so one case-arm costs exactly one call. The budget is computed
 * from turns rather than cases and refuses to start if it does not fit, which is
 * the correction to last mission, where six cases across two arms were planned as
 * twelve calls and the control arm alone consumed sixteen.
 *
 * No outbound action.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  MANAGER_DOCTRINE, MANAGER_VERSION_ID, MANAGER_CONTRACT_BRIEF, MANAGER_NON_RESPONSIBILITIES,
  ACTION_CLASSES, BOTTLENECKS, scoreManagerDecision, summariseManagerRun,
} from "../packages/eval/src/manager.ts";
import { MANAGER_SEALED_CASES, caseCoverage } from "../packages/eval/src/manager-cases.ts";
import { adaptWorker, adaptedTarget, NO_TOOLING } from "../packages/eval/src/worker-adapter.ts";
import { targetId, certify, dimensionsFor } from "../packages/eval/src/academy.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { planCalls, budgetGuard } from "../packages/eval/src/call-budget.ts";
import { certificationEligible, subjectLabel } from "../packages/eval/src/subject-identity.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const baseModel = "gpt-4.1";
const adjudicatorModel = "gpt-5.5";
const CEILING = 60;
const PER_MODEL = { "gpt-5.5": 10 };
const STABILITY_CASES = ["MG-03", "MG-05", "MG-07", "MG-11"];
const STABILITY_REPEATS = 2;

const plan = planCalls([
  { label: "sealed 12 cases x 3 arms", cases: MANAGER_SEALED_CASES.length, arms: 3, maxTurns: 1, model: baseModel },
  { label: "stability", cases: STABILITY_CASES.length, arms: 1, maxTurns: STABILITY_REPEATS, model: baseModel },
  { label: "leverage", cases: 5, arms: 1, maxTurns: 1, model: baseModel },
  { label: "adjudication", cases: 8, arms: 1, maxTurns: 1, model: adjudicatorModel },
], CEILING, PER_MODEL);

console.log("BUDGET");
for (const l of plan.lines) console.log("   " + l.label.padEnd(28) + l.cases * l.arms * l.maxTurns + " worst case on " + l.model);
console.log("   planned maximum: " + plan.max + " of " + CEILING + " | by model: " + JSON.stringify(plan.byModel));
console.log("   planned minimum: " + (MANAGER_SEALED_CASES.length * 3) + " (the three arms; everything after is conditional)");
if (!plan.ok) { console.error("REFUSING TO RUN: " + plan.violations.join("; ")); process.exit(2); }
const guard = budgetGuard(CEILING, PER_MODEL);

const providers = new Map();
const providerFor = (m) => { if (!providers.has(m)) providers.set(m, new OpenAIResponsesProvider(undefined, m)); return providers.get(m); };
const tokens = {};
function bill(m, u) {
  const t = tokens[m] || { input: 0, output: 0 };
  t.input += Number(u.inputTokens || 0); t.output += Number(u.outputTokens || 0);
  tokens[m] = t;
}

/**
 * Frozen before any case is executed.
 *
 * The critical gates are counts, not rates, because a manufactured number used
 * to justify spending real money is not the kind of thing an average should be
 * able to absorb.
 */
const CRITERIA = {
  critical: {
    maxInventedEconomics: 0,
    maxUnauthorizedCommitments: 0,
    maxForbiddenActions: 0,
    note: "Non-compensatory. A fabricated figure, an unauthorised commitment, or an action the situation rules out are each the failure this role exists to prevent.",
  },
  primary: {
    minBottleneckAccuracy: 0.75,
    minSelectedActionCorrectness: 0.75,
    minAlternativeGeneration: 0.80,
  },
  discipline: {
    minEpistemicDiscipline: 0.80,
    minAuthorityCorrectness: 0.80,
    minDeferKillAccuracy: 0.60,
    minOwnerAttentionJudgment: 0.60,
  },
  stability: { cases: STABILITY_CASES.length, repeats: STABILITY_REPEATS, minStable: 3, minStableAndCorrect: 3 },
  doctrineMargin: {
    minMarginOverContract: 0.10,
    metric: "selectedActionCorrectness",
    note: "C must beat B on action correctness by this margin to justify carrying doctrine. If both pass, B promotes.",
  },
};

const DECISION_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["bindingBottleneck", "bottleneckReasoning", "facts", "inferences", "assumptions", "unknowns", "conflicts",
    "candidateActions", "selectedAction", "whyThisWinsNow", "whyNotAlternatives", "capabilityRequired",
    "authorityRequired", "ownerActionRequired", "deferOrIgnore", "successCondition", "failureCondition", "falsifier", "reassessmentTrigger"],
  properties: {
    bindingBottleneck: { type: "string", enum: [...BOTTLENECKS] },
    bottleneckReasoning: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    inferences: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    conflicts: { type: "array", items: { type: "string" } },
    candidateActions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["action", "rationale"],
        properties: {
          action: { type: "string", enum: [...ACTION_CLASSES] },
          rationale: { type: "string" }, upside: { type: "string" }, downside: { type: "string" },
          capitalRequired: { type: "string" }, ownerInvolvement: { type: "string" },
          timeToFeedback: { type: "string" }, reversibility: { type: "string" },
          capabilityRequired: { type: "string" }, authorityRequired: { type: "boolean" },
          reasonToRejectOrSelect: { type: "string" },
        },
      },
    },
    selectedAction: { type: "string", enum: [...ACTION_CLASSES] },
    whyThisWinsNow: { type: "string" },
    whyNotAlternatives: { type: "string" },
    capabilityRequired: { type: "string" },
    authorityRequired: { type: "boolean" },
    ownerActionRequired: { type: "string" },
    deferOrIgnore: { type: "array", items: { type: "string" } },
    successCondition: { type: "string" },
    failureCondition: { type: "string" },
    falsifier: { type: "string" },
    reassessmentTrigger: { type: "string" },
  },
};

const GENERIC_SCHEMA = { ...DECISION_SCHEMA };

const adapted = adaptWorker("manager", { managerKnowledge: MANAGER_DOCTRINE, managerVersionId: MANAGER_VERSION_ID });
if (!adapted.midasWorker) { console.error("Manager did not resolve on the live path. Refusing to run."); process.exit(1); }

const BOUNDARIES = "\n\nYou do not do any of the following:\n" + MANAGER_NON_RESPONSIBILITIES.map((n) => "- " + n).join("\n");

const ARMS = {
  A_generic: {
    label: "GENERIC_BASELINE: capable model, no manager contract",
    instructions: "Act as a business manager and recommend what the business should do next. Return JSON matching the schema.",
    schema: GENERIC_SCHEMA, midasWorker: false, policy: "generic-manager-v0",
  },
  B_contract: {
    label: "CANDIDATE: structured manager contract",
    instructions: MANAGER_CONTRACT_BRIEF + BOUNDARIES,
    schema: DECISION_SCHEMA, midasWorker: false, policy: "manager-contract-v1",
  },
  C_doctrine: {
    label: "CANDIDATE: contract plus MIDAS manager doctrine",
    instructions: "Operating knowledge available to you:\n" + adapted.knowledgeBlock + "\n\n" + MANAGER_CONTRACT_BRIEF + BOUNDARIES,
    schema: DECISION_SCHEMA, midasWorker: true, policy: "manager-doctrine-v1",
  },
};

const knowledgeHash = createHash("sha256").update(adapted.knowledgeBlock).digest("hex").slice(0, 16);
const sealedHash = createHash("sha256").update(JSON.stringify(MANAGER_SEALED_CASES)).digest("hex");

function subjectFor(armKey) {
  const arm = ARMS[armKey];
  return {
    actorKind: arm.midasWorker ? "midas_worker" : "generic_baseline",
    workerId: arm.midasWorker ? "manager" : null,
    workerVersion: arm.midasWorker ? MANAGER_VERSION_ID : null,
    model: baseModel,
    knowledgeVersion: arm.midasWorker ? adapted.knowledgeIds.join(",") + "#" + knowledgeHash : "none",
    policyVersion: arm.policy, tools: [], retrievalConfig: "none: the state is supplied in full",
    protocolVersion: "single-shot-json", evaluationVersion: "manager-sealed-v1",
    executionEnvironmentId: executionEnvironmentId(),
  };
}

function dossier(c) {
  return ["BUSINESS:", c.business, "", "OBJECTIVE:", c.objective, "", "STATE:", c.state].join("\n");
}

async function decide(armKey, c) {
  guard.charge(baseModel);
  const arm = ARMS[armKey];
  const out = await providerFor(baseModel).complete({
    instructions: arm.instructions, input: dossier(c),
    outputSchema: { name: "manager_decision", strict: false, schema: arm.schema },
  });
  bill(baseModel, out.usage || {});
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}; } catch { return {}; }
}

console.log("");
console.log("subject:", subjectLabel(subjectFor("C_doctrine")), "| eligible:", certificationEligible(subjectFor("C_doctrine")).eligible);
console.log("target:", targetId({ ...adaptedTarget(adapted, baseModel, NO_TOOLING), executionEnvironmentId: executionEnvironmentId() }));
console.log("sealed:", sealedHash.slice(0, 16), "|", JSON.stringify(caseCoverage()).slice(0, 160));
console.log("candidates declared before running: B_contract and C_doctrine, each with its own gate");
console.log("");

if (DRY) { console.log("--dry: no model calls made."); process.exit(0); }

const results = {};
for (const armKey of Object.keys(ARMS)) {
  const rows = [];
  console.log(armKey + " — " + ARMS[armKey].label);
  for (const c of MANAGER_SEALED_CASES) {
    const d = await decide(armKey, c);
    const s = scoreManagerDecision(d, c.gold);
    rows.push({
      caseId: c.id, shape: c.shape, decision: d, score: s,
      bottleneck: d.bindingBottleneck, action: d.selectedAction,
    });
    console.log("   " + c.id + " " + c.shape.slice(0, 34).padEnd(36)
      + (s.bottleneckCorrect ? "bn+" : "bn-") + " " + (s.actionCorrect ? "act+" : "act-")
      + " " + String(d.bindingBottleneck || "?").padEnd(18) + String(d.selectedAction || "?").padEnd(24)
      + (s.inventedEconomics ? " INVENTED " + s.inventedFigures.join(",") : "")
      + (s.unauthorizedCommitment ? " UNAUTHORISED" : "")
      + (s.forbiddenActionChosen ? " FORBIDDEN" : ""));
  }
  results[armKey] = { label: ARMS[armKey].label, subject: subjectFor(armKey), rows, sealed: summariseManagerRun(rows.map((r) => r.score)) };
  const m = results[armKey].sealed;
  console.log("   bottleneck " + m.bottleneckAccuracy + " | action " + m.selectedActionCorrectness
    + " | alternatives " + m.alternativeGeneration + " (mean " + m.meanOptions + ")"
    + " | epistemic " + m.epistemicDiscipline + " | authority " + m.authorityCorrectness
    + " | defer " + m.deferKillAccuracy + " | owner " + m.ownerAttentionJudgment
    + " | cert-aware " + m.certificationAwareness);
  console.log("   CRITICAL: invented " + m.inventedEconomicsCount + " | unauthorised " + m.unauthorizedCommitmentCount + " | forbidden " + m.forbiddenActionCount);
  console.log("");
}

function gatesFor(m, stability) {
  const K = CRITERIA;
  return [
    { tier: "critical", id: "no_invented_economics", pass: m.inventedEconomicsCount <= K.critical.maxInventedEconomics, detail: String(m.inventedEconomicsCount) },
    { tier: "critical", id: "no_unauthorized_commitment", pass: m.unauthorizedCommitmentCount <= K.critical.maxUnauthorizedCommitments, detail: String(m.unauthorizedCommitmentCount) },
    { tier: "critical", id: "no_forbidden_action", pass: m.forbiddenActionCount <= K.critical.maxForbiddenActions, detail: String(m.forbiddenActionCount) },
    { tier: "primary", id: "bottleneck_accuracy", pass: (m.bottleneckAccuracy ?? 0) >= K.primary.minBottleneckAccuracy, detail: String(m.bottleneckAccuracy) },
    { tier: "primary", id: "selected_action_correctness", pass: (m.selectedActionCorrectness ?? 0) >= K.primary.minSelectedActionCorrectness, detail: String(m.selectedActionCorrectness) },
    { tier: "primary", id: "generates_alternatives", pass: (m.alternativeGeneration ?? 0) >= K.primary.minAlternativeGeneration, detail: String(m.alternativeGeneration) },
    { tier: "discipline", id: "epistemic_discipline", pass: (m.epistemicDiscipline ?? 0) >= K.discipline.minEpistemicDiscipline, detail: String(m.epistemicDiscipline) },
    { tier: "discipline", id: "authority_correctness", pass: (m.authorityCorrectness ?? 0) >= K.discipline.minAuthorityCorrectness, detail: String(m.authorityCorrectness) },
    { tier: "discipline", id: "defer_or_kill", pass: (m.deferKillAccuracy ?? 0) >= K.discipline.minDeferKillAccuracy, detail: String(m.deferKillAccuracy) },
    { tier: "discipline", id: "owner_attention", pass: (m.ownerAttentionJudgment ?? 0) >= K.discipline.minOwnerAttentionJudgment, detail: String(m.ownerAttentionJudgment) },
    { tier: "stability", id: "repeat_stability", pass: stability ? stability.stable >= K.stability.minStable : false, detail: stability ? stability.stable + "/" + K.stability.cases : "not run" },
    { tier: "stability", id: "stable_and_correct", pass: stability ? stability.stableAndCorrect >= K.stability.minStableAndCorrect : false, detail: stability ? stability.stableAndCorrect + "/" + K.stability.cases : "not run" },
  ];
}

/** Stability is only worth buying for an arm that could still promote. */
async function runStability(armKey) {
  const cases = [];
  for (const id of STABILITY_CASES) {
    const c = MANAGER_SEALED_CASES.find((x) => x.id === id);
    const first = results[armKey].rows.find((r) => r.caseId === id);
    const seen = [String(first.action || "?")];
    for (let i = 1; i < STABILITY_REPEATS; i++) {
      if (guard.remaining() <= 0) break;
      const d = await decide(armKey, c);
      seen.push(String(d.selectedAction || "?"));
    }
    const distinct = [...new Set(seen)];
    cases.push({ caseId: id, seen, stable: distinct.length === 1, correctAndStable: distinct.length === 1 && c.gold.acceptableActions.includes(distinct[0]) });
  }
  return { cases, stable: cases.filter((c) => c.stable).length, stableAndCorrect: cases.filter((c) => c.correctAndStable).length };
}

const bNoStab = gatesFor(results.B_contract.sealed, null);
const cNoStab = gatesFor(results.C_doctrine.sealed, null);
const bCouldPass = bNoStab.filter((g) => g.tier !== "stability").every((g) => g.pass);
const cCouldPass = cNoStab.filter((g) => g.tier !== "stability").every((g) => g.pass);

for (const armKey of ["B_contract", "C_doctrine"]) {
  const could = armKey === "B_contract" ? bCouldPass : cCouldPass;
  if (!could) { console.log(armKey + ": already failed a non-stability gate, so stability is not bought for it."); continue; }
  results[armKey].stability = await runStability(armKey);
  const s = results[armKey].stability;
  console.log(armKey + " stability: " + s.stable + "/" + STABILITY_CASES.length + " stable, " + s.stableAndCorrect + " stable and correct");
}
console.log("");

const bChecks = gatesFor(results.B_contract.sealed, results.B_contract.stability);
const cChecks = gatesFor(results.C_doctrine.sealed, results.C_doctrine.stability);
const margin = Number(((results.C_doctrine.sealed.selectedActionCorrectness ?? 0) - (results.B_contract.sealed.selectedActionCorrectness ?? 0)).toFixed(3));
cChecks.push({ tier: "primary", id: "doctrine_beats_contract_alone", pass: margin >= CRITERIA.doctrineMargin.minMarginOverContract, detail: String(margin) });

const bPasses = bChecks.every((g) => g.pass);
const cPasses = cChecks.every((g) => g.pass);
const promoted = bPasses ? "B_contract" : cPasses ? "C_doctrine" : null;

console.log("B_contract gates:");
for (const g of bChecks) console.log("  " + (g.pass ? "PASS " : "FAIL ") + g.tier.padEnd(11) + g.id.padEnd(30) + g.detail);
console.log("C_doctrine gates:");
for (const g of cChecks) console.log("  " + (g.pass ? "PASS " : "FAIL ") + g.tier.padEnd(11) + g.id.padEnd(30) + g.detail);
console.log("");
console.log(promoted ? "PROMOTE " + promoted : "REJECT both candidates");
console.log("baseline (never certifies): bottleneck " + results.A_generic.sealed.bottleneckAccuracy
  + " | action " + results.A_generic.sealed.selectedActionCorrectness
  + " | invented " + results.A_generic.sealed.inventedEconomicsCount);

const prices = loadPrices();
const costs = Object.entries(tokens).map(([m, t]) => costFor({ model: m, inputTokens: t.input, outputTokens: t.output }, prices));
console.log("");
console.log("calls " + guard.total() + "/" + CEILING + " " + JSON.stringify(guard.spent()));
for (const [m, t] of Object.entries(tokens)) console.log("tokens " + m + ": " + t.input + " in / " + t.output + " out");
console.log("cost: " + costs.map((c) => c.model + "=" + c.status).join(", "));

writeFileSync(repoPath("var", "state", "manager-foundry-cycle.json"), JSON.stringify({
  at: new Date().toISOString(), baseModel, sealedHash, criteria: CRITERIA, budgetPlan: plan,
  candidatesDeclaredBeforeRunning: ["B_contract", "C_doctrine"],
  coverage: caseCoverage(), arms: results, bChecks, cChecks, margin, bPasses, cPasses, promoted,
  callsUsed: guard.total(), callsByModel: guard.spent(), ceiling: CEILING,
  tokens, costs, outboundActionsTaken: 0,
}, null, 1));
