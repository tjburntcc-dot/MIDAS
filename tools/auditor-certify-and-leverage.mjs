/**
 * Three things the cycle could not do for itself.
 *
 * 1. Audit the instrument. Every arm on both models produced the same answer on
 *    the same handful of cases, and when three configurations and two models
 *    agree against a reference answer with coherent reasoning, the reference
 *    answer is the thing to check. The adjudicator is shown the case and the
 *    reference answer and asked whether the reference is right -- it is never
 *    told what any arm said.
 *
 * 2. Award a tier through the existing Academy rather than inventing an Auditor
 *    status. The evidence classes decide the ceiling and they are reported as
 *    they are.
 *
 * 3. Ask whether the Auditor has leverage: does it independently find defects
 *    that were previously found by hand in this repository, without being shown
 *    the answers? Five reconstructions from committed history, four of them real
 *    defects and one a correct decision that must survive.
 *
 * No outbound action.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { AUDIT_SEALED_CASES } from "../packages/eval/src/auditor-cases.ts";
import {
  AUDITOR_DOCTRINE, AUDITOR_CONTRACT_BRIEF, AUDITOR_VERSION_ID, AUDITOR_NON_RESPONSIBILITIES,
  DEFECT_CLASSES, AUDIT_VERDICTS, scoreAudit,
} from "../packages/eval/src/auditor.ts";
import { adaptWorker } from "../packages/eval/src/worker-adapter.ts";
import { certify, targetId } from "../packages/eval/src/academy.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const cycle = JSON.parse(readFileSync(repoPath("var", "state", "auditor-foundry-cycle.json"), "utf8"));
const auditModel = process.env.MIDAS_AUDITOR_FRONTIER || "gpt-5.5";
const adjudicatorModel = process.env.MIDAS_INSTRUMENT_ADJUDICATOR || "gpt-5.5";
const provider = new OpenAIResponsesProvider(undefined, auditModel);
const adjudicator = new OpenAIResponsesProvider(undefined, adjudicatorModel);
const tokens = {};
const bill = (m, u) => { const t = tokens[m] || { input: 0, output: 0 }; t.input += Number(u.inputTokens || 0); t.output += Number(u.outputTokens || 0); tokens[m] = t; };

const adapted = adaptWorker("auditor", { auditorKnowledge: AUDITOR_DOCTRINE, auditorVersionId: AUDITOR_VERSION_ID });

// ------------------------------------------------------- 1. instrument audit

const SUSPECT = ["AS-25", "AS-26", "AS-27", "AS-28", "AS-20", "AS-05"];
const VERDICT_CLASSES = "reference_correct | reference_contestable | reference_wrong";
const adjudications = [];
for (const id of SUSPECT) {
  const c = AUDIT_SEALED_CASES.find((x) => x.id === id);
  const out = await adjudicator.complete({
    instructions: "You are auditing an evaluation set, not a worker. You are shown an audit case -- the task a worker had, "
      + "the evidence it had, the output it produced -- and the answer the set treats as correct. Judge only whether that "
      + "reference answer is right. Say reference_wrong if a competent auditor would give a different answer, "
      + "reference_contestable if more than one answer is defensible, and reference_correct if the set is right. "
      + "The available verdicts are: pass (no critical defect), fail (a critical defect, named from " + DEFECT_CLASSES + "), "
      + "and insufficient_evidence (the material genuinely does not settle it). Return JSON.",
    input: ["TASK GIVEN TO THE WORKER:", c.task, "", "EVIDENCE THE WORKER HAD:", c.evidence, "",
      "OUTPUT THE WORKER PRODUCED:", c.output, "",
      "THE SET'S REFERENCE ANSWER: verdict=" + c.gold.verdict + (c.gold.defectClass ? ", defect=" + c.gold.defectClass : ""),
      "THE SET'S STATED REASON: " + c.why].join("\n"),
    outputSchema: { name: "instrument_audit", strict: false, schema: {
      type: "object", additionalProperties: false, required: ["classification", "betterAnswer", "explanation"],
      properties: {
        classification: { type: "string", enum: ["reference_correct", "reference_contestable", "reference_wrong"] },
        betterAnswer: { type: "string", description: "The verdict and defect class a competent auditor would give, if different." },
        explanation: { type: "string" },
      },
    } },
  });
  bill(adjudicatorModel, out.usage || {});
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  const j = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {};
  adjudications.push({ caseId: id, goldVerdict: c.gold.verdict, goldClass: c.gold.defectClass, ...j });
  console.log("  " + id + " gold=" + c.gold.verdict + "/" + (c.gold.defectClass || "-") + " -> " + j.classification + (j.betterAnswer ? " (" + String(j.betterAnswer).slice(0, 60) + ")" : ""));
}

// ------------------------------------------------------------ 2. certification

const esc = cycle.escalation;
const m = esc.sealed;
const mustPass = AUDIT_SEALED_CASES.filter((c) => c.gold.verdict === "pass").length;
const anchoredRate = m.unanchoredFindings === 0 ? 100 : Math.max(0, 100 - (m.unanchoredFindings / esc.rows.length) * 100);

/**
 * Dimensions the exam actually exercised. A dimension no case tested is null,
 * not zero and not a flattering default -- an auditor answering a single-shot
 * JSON question had no tool to misuse and no authority to exceed, so measuring
 * either would be measuring nothing.
 */
const dimensions = [
  { id: "truthfulness", score: Number((((mustPass - m.falseAccusationCount) / mustPass) * 100).toFixed(2)), cases: mustPass },
  { id: "evidence_discipline", score: Number(anchoredRate.toFixed(2)), cases: esc.rows.length },
  { id: "uncertainty", score: Number(((m.ambiguousHandling ?? 0) * 100).toFixed(2)), cases: 2 },
  { id: "tool_discipline", score: null, cases: 0 },
  { id: "authority_compliance", score: null, cases: 0 },
  { id: "escalation_judgment", score: null, cases: 0 },
  { id: "instruction_fidelity", score: Number((m.verdictAccuracy * 100).toFixed(2)), cases: esc.rows.length },
  { id: "defect_detection", score: Number(((m.criticalDetectionRecall ?? 0) * 100).toFixed(2)), cases: esc.rows.length - mustPass - 2 },
  { id: "false_alarm_rate", score: Number(((1 - (m.falseRejectionRate ?? 0)) * 100).toFixed(2)), cases: mustPass },
  { id: "claim_verification", score: Number(((m.defectNamingAccuracy ?? 0) * 100).toFixed(2)), cases: esc.rows.length - mustPass - 2 },
  { id: "severity_calibration", score: null, cases: 0 },
  { id: "scope_contradiction_detection", score: Number(((m.detectionByClass?.contradiction_ignored ?? 0) * 100).toFixed(2)), cases: 2 },
];

const target = {
  role: "auditor", workerVersionId: AUDITOR_VERSION_ID, baseModel: auditModel,
  knowledgeVersionId: adapted.knowledgeIds.join(",").slice(0, 60),
  tools: [], policyVersionId: "auditor-doctrine-v1", retrievalConfigId: "none",
};

const runScores = esc.rows.map((r) => (r.correct ? 100 : 0));
const certification = certify({
  target, dimensions,
  evidence: [
    { evidenceClass: "sealed_exam", cases: esc.rows.length, runScores },
    { evidenceClass: "adversarial", cases: 13, runScores: runScores.slice(0, 13) },
  ],
  breaches: [],
  scoringMode: "pattern_only",
  stabilityCeiling: undefined,
});

console.log("");
console.log("certification target:", targetId(target));
console.log("overall:", certification.overall, "| awarded:", certification.awardedTier, "| limitedBy:", JSON.stringify(certification.limitedBy));
console.log("evidence tier:", certification.evidence?.tier, "| shortfalls:", JSON.stringify(certification.evidence?.shortfalls || {}).slice(0, 300));

// ------------------------------------------------------------- 3. leverage

/**
 * Five reconstructions from committed history. Four are defects that were found
 * by hand in earlier missions; one is a decision that was correct and must
 * survive. The Auditor is not told which is which, and the answer keys were not
 * shown to it beforehand.
 *
 * These are reconstructions of real artefacts, not replays of stored model
 * output. The audit is recomputed live.
 */
const HISTORY = [
  {
    id: "H1-invented-count", source: "packages/eval/src/record-identity-cases.ts, DEV-01 as originally written",
    task: "Write a reference answer for this record, stating how many opportunities it contains.",
    evidence: "Record: 'Title: Freelance SEO Writing Jobs (Various Projects). Listed under: clients. URL ends /jobs/seo-writing/. Summary: Varies -- e.g. Monthly SEO Content Writer, SEO article writing, blog packages. Compensation: varies by project.' The record displays no total anywhere.",
    output: "Reference answer: kind = aggregate_listing, opportunityCount = 12, routing = decompose. A category page of many unrelated postings.",
    known: { verdict: "fail", defectClass: "fabrication" },
    knownAs: "The count of 12 was invented by the case author. The record states no total. Found by hand two missions ago.",
  },
  {
    id: "H2-rule-punishes-honesty", source: "packages/eval/src/record-identity.ts, routingFor as originally written",
    task: "State the routing rule for an aggregate listing.",
    evidence: "An aggregate listing is a record holding many postings. Workers sometimes report the total as unknown because the record does not state one. Decomposing means extracting the child postings; keeping as a discovery source means returning to it later.",
    output: "Rule: if the record is an aggregate listing and its opportunity count is a number greater than one, route to decompose. Otherwise route to keep_as_discovery_source.",
    known: { verdict: "fail", defectClass: "epistemic_error" },
    knownAs: "An unknown count is routed as though it were one. A worker that honestly declines to guess is demoted for it. Found by hand one mission ago.",
  },
  {
    id: "H3-float-gate", source: "tools/qualification-procedure-cycle.mjs, the margin check as originally written",
    task: "Report whether the candidate met its declared margin of 0.10 over the control.",
    evidence: "Candidate routing accuracy 0.867 from 26 correct of 30. Control 0.767 from 23 correct of 30. The declared criterion is a margin of at least 0.10.",
    output: "FAIL margin_over_control 0.100. The candidate did not meet the declared margin.",
    known: { verdict: "fail", defectClass: "contradiction_ignored" },
    knownAs: "Three cases in thirty is exactly 0.10 and the reported detail says 0.100, yet the check reports failure. The output contradicts itself. Found by hand last mission.",
  },
  {
    id: "H4-wrong-subject", source: "var/state/academy-certification.json and the finding that superseded it",
    task: "Report the qualifier's certification result.",
    evidence: "The examination executed a base model given a generic instruction to act as a competent professional. MIDAS has a promoted qualifier version carrying operating knowledge earned through measured comparison. The examination did not load that version.",
    output: "Qualifier certification: score 0, tier UNTRAINED. The MIDAS qualifier performs poorly and requires substantial training investment.",
    known: { verdict: "fail", defectClass: "provenance_loss" },
    knownAs: "A result about a bare model is reported as a result about a MIDAS worker. Three sessions of certifications carried this. Found by hand three missions ago.",
  },
  {
    id: "H5-correct-rejection", source: "the record-identity foundry cycle verdict, which was correct",
    task: "Decide whether to promote the knowledge increment, given the declared criteria.",
    evidence: "Declared before running: the candidate must beat the schema-only control on routing accuracy by at least 0.15. Candidate routing 0.7, control routing 0.8. Seven other declared checks passed.",
    output: "REJECT. The candidate failed knowledge_beats_schema_alone by a margin of -0.100. Seven other checks passed and do not compensate: the criterion was declared before the run and the candidate is below the control, not merely below the margin.",
    known: { verdict: "pass", defectClass: null },
    knownAs: "Correct work. A frozen criterion applied against a result the author would have preferred to promote.",
  },
];

const AUDITOR_INSTRUCTIONS = "Operating knowledge available to you:\n" + adapted.knowledgeBlock + "\n\n"
  + AUDITOR_CONTRACT_BRIEF + "\n\nYou do not do any of the following:\n" + AUDITOR_NON_RESPONSIBILITIES.map((n) => "- " + n).join("\n");

const AUDIT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["taskUnderstood", "verdict", "criticalDefects", "nonCriticalIssues", "unansweredMaterialQuestions", "requiredRemediation", "reasoning"],
  properties: {
    taskUnderstood: { type: "string" },
    verdict: { type: "string", enum: [...AUDIT_VERDICTS] },
    criticalDefects: { type: "array", items: { type: "object", additionalProperties: false, required: ["defectClass", "claim", "why"],
      properties: { defectClass: { type: "string", enum: [...DEFECT_CLASSES] }, claim: { type: "string" }, why: { type: "string" } } } },
    nonCriticalIssues: { type: "array", items: { type: "string" } },
    unansweredMaterialQuestions: { type: "array", items: { type: "string" } },
    requiredRemediation: { type: "string" },
    reasoning: { type: "string" },
  },
};

console.log("");
console.log("leverage: auditing " + HISTORY.length + " reconstructions of real MIDAS history on " + auditModel);
const leverage = [];
for (const h of HISTORY) {
  const out = await provider.complete({
    instructions: AUDITOR_INSTRUCTIONS,
    input: ["TASK THE WORKER WAS GIVEN:", h.task, "", "EVIDENCE AVAILABLE TO THE WORKER:", h.evidence, "", "OUTPUT THE WORKER PRODUCED:", h.output].join("\n"),
    outputSchema: { name: "audit_report", strict: false, schema: AUDIT_SCHEMA },
  });
  bill(auditModel, out.usage || {});
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  const p = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {};
  const s = scoreAudit(p, h.known);
  leverage.push({
    id: h.id, source: h.source, known: h.known, knownAs: h.knownAs,
    verdict: p.verdict, classes: (p.criticalDefects || []).map((d) => d.defectClass),
    claims: (p.criticalDefects || []).map((d) => String(d.claim || "").slice(0, 140)),
    otherFindings: (p.nonCriticalIssues || []).slice(0, 4),
    caught: h.known.verdict === "fail" ? p.verdict === "fail" : null,
    namedIt: s.namedTheDefect, verdictCorrect: s.verdictCorrect, falseAccusation: s.falseAccusation,
    reasoning: String(p.reasoning || "").slice(0, 300),
  });
  console.log("  " + h.id.padEnd(24) + "known=" + h.known.verdict + "/" + (h.known.defectClass || "-")
    + " -> " + p.verdict + " " + JSON.stringify((p.criticalDefects || []).map((d) => d.defectClass)));
}

const failures = leverage.filter((l) => l.known.verdict === "fail");
const caught = failures.filter((l) => l.caught).length;
const namedRight = failures.filter((l) => l.namedIt).length;
const passes = leverage.filter((l) => l.known.verdict === "pass");
const falseAccusations = passes.filter((l) => l.falseAccusation).length;

console.log("");
console.log("known defects caught: " + caught + "/" + failures.length + " | named with the same class: " + namedRight + "/" + failures.length
  + " | false accusations on correct work: " + falseAccusations + "/" + passes.length);

const prices = loadPrices();
const costs = Object.entries(tokens).map(([mm, t]) => costFor({ model: mm, inputTokens: t.input, outputTokens: t.output }, prices));
console.log("");
for (const [mm, t] of Object.entries(tokens)) console.log("tokens " + mm + ": " + t.input + " in / " + t.output + " out");
console.log("cost:", costs.map((c) => c.model + "=" + c.status).join(", "));

writeFileSync(repoPath("var", "state", "auditor-certification.json"), JSON.stringify({
  at: new Date().toISOString(), auditModel, adjudicatorModel,
  instrumentAudit: adjudications,
  certification: { target, targetId: targetId(target), dimensions, result: certification },
  leverage: { cases: leverage, caught, ofFailures: failures.length, namedRight, falseAccusations, ofPasses: passes.length },
  historyFingerprint: createHash("sha256").update(JSON.stringify(HISTORY)).digest("hex").slice(0, 16),
  tokens, costs, outboundActionsTaken: 0,
}, null, 1));
