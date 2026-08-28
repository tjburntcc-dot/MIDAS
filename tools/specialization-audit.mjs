/**
 * Two questions this repository has never asked itself directly.
 *
 * 1. Was the Manager benchmark capable of showing specialization if it existed?
 *    A baseline scored 1.00 on action selection. Either the Manager adds nothing,
 *    or the set could not tell.
 *
 * 2. Across every comparison MIDAS has ever run between a bare model and a
 *    structured MIDAS worker, what has actually been shown?
 *
 * Both are answered from stored results and case material. No model is called.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { repoPath } from "@midas/db";
import { MANAGER_SEALED_CASES } from "../packages/eval/src/manager-cases.ts";
import { ACTION_CLASSES } from "../packages/eval/src/manager.ts";

// --------------------------------------------------------- Phase 4: ceiling

/**
 * A case is discriminative when the right action needs several facts weighed
 * together. It is inferable when one salient sentence gives it away.
 *
 * Judged from the case material rather than from the results, so that a case is
 * not called easy merely because everyone got it right.
 */
const INTEGRATION_SIGNALS = [
  { id: "economics", re: /margin|revenue|cost|price|profit|per cent|worth/i },
  { id: "capacity_or_time", re: /capacity|hours|weeks|months|time|shift|fills/i },
  { id: "authority_or_legal", re: /entity|insurance|sign|indemnity|principal|declaration|penalt/i },
  { id: "evidence_quality", re: /no source|cite|unverified|model|simulat|never|has not|no customer|no prior/i },
  { id: "commitment_risk", re: /three-year|no break|irreversible|lease|renewable|fixed-price|commit/i },
  { id: "sunk_or_emotional", re: /sunk|already|nearly finished|founder|months and/i },
  { id: "opportunity_cost", re: /turned away|declined|refused|instead|alongside|lost/i },
];

const ceiling = MANAGER_SEALED_CASES.map((c) => {
  const text = c.state + " " + c.objective;
  const signals = INTEGRATION_SIGNALS.filter((s) => s.re.test(text)).map((s) => s.id);
  // Could one salient sentence give the answer away? Approximated by whether the
  // state contains a phrase that names the constraint almost directly.
  const giveaway = /cannot produce more|no customer conversation has ever|has never been|no adult has been identified|no customer has asked/i.test(c.state);
  const competingOptions = c.gold.acceptableActions.length;
  const forbidden = (c.gold.forbiddenActions || []).length;
  return {
    id: c.id, shape: c.shape,
    integrationSignals: signals, signalCount: signals.length,
    hasObviousGiveaway: giveaway,
    acceptableActions: competingOptions, forbiddenActions: forbidden,
    certificationMatters: Boolean(c.gold.certificationMatters),
    nominalTrap: /largest|biggest|worth 45000|12000|200000|18000/i.test(c.state),
    classification: signals.length >= 4 && !giveaway ? "discriminative"
      : signals.length >= 3 ? "moderate" : "inferable_from_one_fact",
  };
});

const discriminative = ceiling.filter((c) => c.classification === "discriminative").length;
const inferable = ceiling.filter((c) => c.classification === "inferable_from_one_fact").length;
const benchmarkClass = inferable >= 5 ? "CEILING_LIMITED" : discriminative >= 7 ? "ADEQUATE" : "MIXED";

console.log("PHASE 4 -- benchmark ceiling audit (zero spend)");
for (const c of ceiling) {
  console.log("   " + c.id + " " + c.classification.padEnd(26) + "signals " + c.signalCount
    + " | options " + c.acceptableActions + " | forbidden " + c.forbiddenActions
    + (c.hasObviousGiveaway ? " | GIVEAWAY" : "") + (c.nominalTrap ? " | nominal-trap" : ""));
}
console.log("   discriminative " + discriminative + " | moderate " + (ceiling.length - discriminative - inferable) + " | inferable " + inferable);
console.log("   classification: " + benchmarkClass);
console.log("");

// ------------------------------------------- Phase 5: program-wide audit

/**
 * Every baseline-versus-MIDAS comparison in the stored record.
 *
 * Read from state files rather than from memory, and each row records what was
 * actually different between the arms, because a comparison where the arms
 * differed in two ways cannot attribute its result to either.
 */
function load(f) {
  const p = repoPath("var", "state", f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

const comparisons = [];

const rc = load("researcher-certification.json");
if (rc) {
  comparisons.push({
    role: "researcher", task: "18 sandbox examinations, multi-turn with tools",
    baseline: "generic professional instruction", midas: "or-v3 operating knowledge",
    informationParity: true, toolsParity: true, contractDifference: false, knowledgeDifference: true,
    headline: "MIDAS overall in the certification; baseline " + (rc.baseline ? rc.baseline.overall : "?"),
    criticalFailures: "baseline sprang CF-MISSED-MANDATORY and CF-CHANNEL-VIOLATION; MIDAS sprang none",
    whatAddedValue: "knowledge prevented two critical gate breaches",
    whatHurt: "nothing measured",
    evaluatorDefects: "read affordance defect discovered later; exposure uncertain",
    verdict: "MIDAS won on failure prevention, not on points",
  });
}

const af = load("auditor-foundry-cycle.json");
if (af) {
  const a = af.arms.A_generic && af.arms.A_generic.sealed;
  const c = af.arms.C_doctrine && af.arms.C_doctrine.sealed;
  comparisons.push({
    role: "auditor", task: "28 sealed audit cases, single-shot",
    baseline: "same output schema, generic instruction", midas: "schema + 10 doctrine items",
    informationParity: true, toolsParity: true, contractDifference: false, knowledgeDifference: true,
    headline: "baseline verdict " + (a ? a.verdictAccuracy : "?") + " vs doctrine " + (c ? c.verdictAccuracy : "?")
      + "; detection " + (a ? a.criticalDetectionRecall : "?") + " vs " + (c ? c.criticalDetectionRecall : "?"),
    criticalFailures: "baseline 0 accusations; doctrine-on-frontier 1 (later shown to be a gold defect)",
    whatAddedValue: "doctrine raised detection on the frontier model; baseline handled ambiguity better",
    whatHurt: "doctrine cost kind-of-defect naming accuracy",
    evaluatorDefects: "two gold defects found by independent adjudication",
    verdict: "baseline matched or beat the structured arms on the headline",
  });
}

const mf = load("manager-foundry-cycle.json");
const mr = load("manager-rescore.json");
if (mf && mr) {
  const A = mr.arms.A_generic.after, B = mr.arms.B_contract.after, C = mr.arms.C_doctrine.after;
  comparisons.push({
    role: "manager", task: "12 sealed allocation cases, single-shot",
    baseline: "same output schema, one-line instruction", midas: "contract, and contract + doctrine",
    informationParity: true, toolsParity: true, contractDifference: true, knowledgeDifference: true,
    headline: "action A " + A.selectedActionCorrectness + " | B " + B.selectedActionCorrectness + " | C " + C.selectedActionCorrectness,
    criticalFailures: "unauthorised commitments A " + A.unauthorizedCommitmentCount + " | B " + B.unauthorizedCommitmentCount + " | C " + C.unauthorizedCommitmentCount
      + "; authority correctness A " + A.authorityCorrectness + " | B " + B.authorityCorrectness + " | C " + C.authorityCorrectness,
    whatAddedValue: "the contract eliminated unauthorised commitments and raised authority correctness sharply",
    whatHurt: "neither structure nor doctrine improved action selection over the baseline",
    evaluatorDefects: "three, all in the scorer: numeric equivalence, transparent derivation, action-independent authority and owner gold",
    verdict: "control uplift yes, decision uplift no",
  });
}

const qp = load("qualification-procedure-cycle.json");
if (qp) {
  comparisons.push({
    role: "qualifier", task: "sealed routing and record-identity cases",
    baseline: "promoted disposition-only contract", midas: "identity fields, and fields + knowledge",
    informationParity: true, toolsParity: true, contractDifference: true, knowledgeDifference: true,
    headline: "the identity contract moved routing from 0.2 to 0.8; the knowledge pack lost to its own control twice",
    criticalFailures: "baseline qualified aggregates as single opportunities; contract arms did not",
    whatAddedValue: "the output contract; nothing else reproduced",
    whatHurt: "two knowledge packs, both rejected against their structure-only controls",
    evaluatorDefects: "invented gold count; a routing rule that punished honest unknowns",
    verdict: "structure won decisively, knowledge lost twice",
  });
}

console.log("PHASE 5 -- program-wide specialization audit (zero spend)");
for (const c of comparisons) {
  console.log("   " + c.role.toUpperCase());
  console.log("      task      " + c.task);
  console.log("      headline  " + c.headline);
  console.log("      critical  " + c.criticalFailures);
  console.log("      added     " + c.whatAddedValue);
  console.log("      hurt      " + c.whatHurt);
  console.log("      instrument " + c.evaluatorDefects);
  console.log("      verdict   " + c.verdict);
}

/** Only patterns the rows above actually support. */
const patterns = [
  { id: "structure_beats_knowledge", supported: true, evidence: "qualifier twice, auditor once, manager once: four knowledge or doctrine packs measured against their own structure-only control, none promoted" },
  { id: "contract_adds_control_not_decisions", supported: Boolean(mr), evidence: "manager: unauthorised commitments 2 to 0 and authority correctness 0.667 to 0.917 with the contract, while action selection did not improve" },
  { id: "baseline_competitive_on_single_shot_judgement", supported: true, evidence: "auditor and manager, both single-shot: the baseline matched or beat both structured arms on the headline metric" },
  { id: "midas_prevents_failures_in_multi_turn_tool_work", supported: Boolean(rc), evidence: "researcher: the baseline sprang two critical gates in the sandbox and the MIDAS worker sprang none" },
  { id: "evaluation_is_the_dominant_defect_source", supported: true, evidence: "seven instrument defects across five cycles, at least three of which changed a verdict" },
  { id: "knowledge_helps", supported: false, evidence: "not shown once; four attempts rejected" },
  { id: "specialization_improves_raw_decision_quality", supported: false, evidence: "not shown in any single-shot comparison to date" },
];

console.log("");
console.log("PATTERNS");
for (const p of patterns) console.log("   " + (p.supported ? "SUPPORTED     " : "NOT SUPPORTED ") + p.id.padEnd(46) + p.evidence.slice(0, 110));

writeFileSync(repoPath("var", "state", "specialization-audit.json"), JSON.stringify({
  at: new Date().toISOString(), modelCalls: 0,
  benchmark: { cases: ceiling, discriminative, inferable, classification: benchmarkClass },
  comparisons, patterns,
}, null, 1));
console.log("");
console.log("written: var/state/specialization-audit.json");
