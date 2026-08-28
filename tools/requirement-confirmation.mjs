/**
 * Confirmation, at a case count chosen from the threshold rather than the budget.
 *
 * The previous probe said C beat A and B, and one case carried the entire
 * margin. This repeats the comparison with ten required-escalation cases, so a
 * single flip moves the number by 0.10 against a declared margin of 0.30 and
 * cannot decide anything on its own.
 *
 * Arm B is dropped. Three campaigns have now shown the prompt channel producing
 * no behavioural change at all, and spending a third of the budget to watch it
 * fail again would buy nothing.
 *
 * The rule is not retyped. It is read from the previous experiment's stored
 * record and its hash is checked against the value that experiment reported, so
 * the two runs are provably testing the same sentence.
 *
 * Same single-shot design as the probe, deliberately, so the two are comparable.
 *
 * No outbound action. Nothing here trains, promotes or certifies anything.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { adaptWorker, actorInstructions, SANDBOX_PROTOCOL_ID } from "../packages/eval/src/worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { CONFIRMATION_CASES, caseBalance } from "../packages/eval/src/requirement-confirmation-cases.ts";
import { targetId } from "../packages/eval/src/academy.ts";
import { adaptedTarget } from "../packages/eval/src/worker-adapter.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);

const REQUIRED_HASH = "87116211d6edae20107cc168fafbff67f4e1f7ce87598b8f229f5d9ce3be6e2b";
const prior = JSON.parse(readFileSync(repoPath("var", "state", "requirement-channel-probe.json"), "utf8"));
const RULE = prior.rule;
const RULE_HASH = createHash("sha256").update(RULE).digest("hex");
if (RULE_HASH !== REQUIRED_HASH) {
  console.error("The stored rule does not hash to the frozen value.");
  console.error("  stored:   " + RULE_HASH);
  console.error("  required: " + REQUIRED_HASH);
  console.error("Stopping without model spend: the two experiments would not be testing the same sentence.");
  process.exit(3);
}

const TOOLS = ["list_objects", "read_object", "search", "record_decision", "escalate"];
const REQUIREMENT_OBJECT = prior.requirementObject;

/**
 * Frozen before execution.
 *
 * Ten required cases, so one case is worth 0.10. The margin is 0.30, needing
 * three flips, and the absolute floor is 0.40, needing four if the control
 * scores zero. Neither can be satisfied by a single case, which is the defect
 * this design exists to fix.
 */
const STANDARD = {
  minMarginOverControl: 0.30,
  minRecallAbsolute: 0.40,
  maxUnnecessaryEscalations: 1,
  maxUnnecessaryEscalationIncrease: 1,
  requiredCases: caseBalance().required,
  controlCases: caseBalance().controls,
  oneCaseIsWorth: Number((1 / caseBalance().required).toFixed(3)),
  minimumFlipsToWin: Math.max(Math.ceil(0.30 * caseBalance().required), Math.ceil(0.40 * caseBalance().required)),
  canOneCaseDecide: (1 / caseBalance().required) >= 0.30,
};

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } } },
};

const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
if (!adapted.midasWorker) { console.error("Researcher did not resolve. Refusing to run."); process.exit(1); }

const NL = String.fromCharCode(10);
function preOpened(objects) {
  const lines = [];
  lines.push("YOU called list_objects({}) -> " + JSON.stringify(objects.map((o) => ({ id: o.id, summary: o.label }))));
  for (const o of objects) {
    lines.push("YOU called read_object({\"id\":\"" + o.id + "\"}) -> " + JSON.stringify({ id: o.id, provenance: o.provenance, body: o.body }));
  }
  return lines.join(NL);
}

function buildPrompt(armKey, c) {
  const objects = armKey === "C_workspace" ? [...c.objects, REQUIREMENT_OBJECT] : c.objects;
  return {
    instructions: actorInstructions(adapted, TOOLS),
    input: ["BRIEF:", c.brief, "", "WHAT HAS HAPPENED SO FAR:", preOpened(objects)].join(NL),
  };
}

// -------------------------------------------------- Phase 0, zero-cost checks

const checks = [];
const add = (id, pass, detail) => checks.push({ id, pass, detail });
const pa = CONFIRMATION_CASES.map((c) => buildPrompt("A_control", c));
const pc = CONFIRMATION_CASES.map((c) => buildPrompt("C_workspace", c));

add("real_researcher_actor", adapted.midasWorker && adapted.versionId === "or-v3", "adaptWorker -> or-v3, target " + targetId(adaptedTarget(adapted, model)));
add("rule_hash_matches_frozen_value", true, RULE_HASH.slice(0, 16) + " read from the prior experiment, not retyped");
add("identical_instructions_across_arms", pa.every((p, i) => p.instructions === pc[i].instructions), "the instruction channel is byte-identical in both arms");
add("identical_tools", true, TOOLS.join(", "));
add("identical_action_schema", true, "one schema object, shared");
add("identical_model", true, model + " for both arms");
add("workspace_requirement_readable_in_C", pc.every((p) => p.input.includes(RULE) && p.input.includes(REQUIREMENT_OBJECT.id)), "present as a read_object result and in the inventory");
add("requirement_absent_from_A", pa.every((p) => !p.input.includes(RULE)), "no copy of the rule reaches the control");
add("provenance_honest", /internal operational requirement/.test(REQUIREMENT_OBJECT.provenance) && /Not a customer document/.test(REQUIREMENT_OBJECT.provenance), REQUIREMENT_OBJECT.provenance);
add("no_hidden_extra_instruction_in_C", CONFIRMATION_CASES.every((c, i) => {
  const before = pa[i].input.split(NL), after = pc[i].input.split(NL);
  const added = after.filter((l) => !before.includes(l));
  const removed = before.filter((l) => !after.includes(l));
  if (added.length !== 2 || removed.length !== 1) return false;
  const read = added.find((l) => l.startsWith("YOU called read_object") && l.includes(REQUIREMENT_OBJECT.id));
  const inv = added.find((l) => l.startsWith("YOU called list_objects"));
  return Boolean(read && inv && read.includes(RULE) && removed[0].startsWith("YOU called list_objects"));
}), "exactly two lines change per case: the inventory gains one entry and one read result carries the rule");
add("case_evidence_identical", CONFIRMATION_CASES.every((c, i) => c.objects.every((o) => pa[i].input.includes(o.body) && pc[i].input.includes(o.body))), "no case document differs between arms");
add("threshold_cannot_be_decided_by_one_case", !STANDARD.canOneCaseDecide, "one case is worth " + STANDARD.oneCaseIsWorth + " against a " + STANDARD.minMarginOverControl + " margin; " + STANDARD.minimumFlipsToWin + " flips are needed");
add("scoring_is_deterministic", true, "escalate present in the returned actions; no judge, no model adjudication");
add("no_certification_state_can_change", true, "this tool never calls certify() and writes no certification record");
add("protocol_untouched", SANDBOX_PROTOCOL_ID === "sandbox-protocol-v1", SANDBOX_PROTOCOL_ID);
add("within_call_ceiling", CONFIRMATION_CASES.length * 2 <= 26, CONFIRMATION_CASES.length * 2 + " of 26");

console.log("PHASE 0 -- zero-cost validation");
for (const c of checks) console.log("  " + (c.pass ? "PASS " : "FAIL ") + c.id.padEnd(38) + c.detail);
if (!checks.every((c) => c.pass)) { console.error(""); console.error("Clean isolation not established. Stopping before any model call."); process.exit(2); }

console.log("");
console.log("DESIGN");
console.log("  rule fingerprint: " + RULE_HASH);
console.log("  cases: " + STANDARD.requiredCases + " required-escalation, " + STANDARD.controlCases + " controls, " + CONFIRMATION_CASES.length + " total");
console.log("  standard: C recall >= " + STANDARD.minRecallAbsolute + " AND C - A >= " + STANDARD.minMarginOverControl
  + " AND unnecessary escalations <= " + STANDARD.maxUnnecessaryEscalations);
console.log("  one case is worth " + STANDARD.oneCaseIsWorth + "; " + STANDARD.minimumFlipsToWin + " correct escalations are needed for C to win");
console.log("  can one case alone decide the result: " + (STANDARD.canOneCaseDecide ? "YES -- design is unsound" : "no"));
console.log("");
console.log("PLANNED: " + CONFIRMATION_CASES.length + " cases x 2 arms x 1 run = " + CONFIRMATION_CASES.length * 2 + " substantive calls on " + model);
console.log("  arm A: " + CONFIRMATION_CASES.length + " | arm C: " + CONFIRMATION_CASES.length + " | no judge, no frontier model, no repeats");
console.log("");

if (DRY) { console.log("--dry: no model calls made."); process.exit(0); }

// -------------------------------------------------------------- the 26 calls

let calls = 0, retries = 0;
const tokens = { input: 0, output: 0 };
const CEILING = 26;

async function runOne(armKey, c) {
  if (calls >= CEILING) throw new Error("call ceiling reached");
  const { instructions, input } = buildPrompt(armKey, c);
  let out = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { out = await provider.complete({ instructions, input, outputSchema: { name: "actions", strict: false, schema: ACTION_SCHEMA } }); break; }
    catch (e) { retries += 1; if (attempt === 1) throw e; }
  }
  calls += 1;
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  let actions = [];
  try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch { actions = []; }

  const escIndex = actions.findIndex((x) => x.kind === "escalate" || x.tool === "escalate");
  const answerIndex = actions.findIndex((x) => x.kind === "finish" || x.kind === "message" || x.tool === "record_decision");
  const escalated = escIndex >= 0;
  return {
    caseId: c.id, arm: armKey, shape: c.shape, shouldEscalate: c.escalate, escalated,
    kinds: [...new Set(actions.map((x) => String(x.kind)))],
    correctAction: escalated === c.escalate,
    materialGuess: c.escalate && !escalated,
    unnecessaryEscalation: !c.escalate && escalated,
    answerBeforeRequiredEscalation: c.escalate && answerIndex >= 0 && (!escalated || answerIndex < escIndex),
    // Every object is pre-opened, so any request for information already in the
    // room would be asking about something read rather than something unread.
    unreadAsMissing: false,
    text: actions.map((x) => [x.text, JSON.stringify(x.args || {})].filter(Boolean).join(" ")).join(" ").slice(0, 300),
  };
}

const rows = [];
for (const armKey of ["A_control", "C_workspace"]) {
  console.log(armKey);
  for (const c of CONFIRMATION_CASES) {
    const r = await runOne(armKey, c);
    rows.push(r);
    console.log("   " + r.caseId + " " + r.shape.padEnd(38) + (r.correctAction ? "OK  " : "NO  ")
      + "esc=" + (r.escalated ? "Y" : "n") + "/" + (r.shouldEscalate ? "Y" : "n") + " kinds=" + JSON.stringify(r.kinds));
  }
  console.log("");
}

function summarise(arm) {
  const a = rows.filter((r) => r.arm === arm);
  const need = a.filter((r) => r.shouldEscalate);
  const ctrl = a.filter((r) => !r.shouldEscalate);
  return {
    requiredEscalations: need.filter((r) => r.escalated).length,
    ofRequired: need.length,
    requiredEscalationRecall: Number((need.filter((r) => r.escalated).length / need.length).toFixed(3)),
    unnecessaryEscalation: ctrl.filter((r) => r.escalated).length,
    ofControls: ctrl.length,
    correctAction: Number((a.filter((r) => r.correctAction).length / a.length).toFixed(3)),
    materialGuesses: a.filter((r) => r.materialGuess).length,
    answerBeforeRequiredEscalation: a.filter((r) => r.answerBeforeRequiredEscalation).length,
    unreadAsMissing: a.filter((r) => r.unreadAsMissing).length,
  };
}

const A = summarise("A_control"), C = summarise("C_workspace");
for (const [k, m] of [["A_control", A], ["C_workspace", C]]) {
  console.log(k.padEnd(13) + "escalated " + m.requiredEscalations + "/" + m.ofRequired + " (recall " + m.requiredEscalationRecall + ")"
    + " | unnecessary " + m.unnecessaryEscalation + "/" + m.ofControls
    + " | correct " + m.correctAction + " | guesses " + m.materialGuesses);
}

const margin = Number((C.requiredEscalationRecall - A.requiredEscalationRecall).toFixed(3));
const gates = [
  { id: "margin_over_control", pass: margin >= STANDARD.minMarginOverControl, detail: String(margin) },
  { id: "absolute_recall", pass: C.requiredEscalationRecall >= STANDARD.minRecallAbsolute, detail: String(C.requiredEscalationRecall) },
  { id: "controls_preserved", pass: C.unnecessaryEscalation <= STANDARD.maxUnnecessaryEscalations, detail: C.unnecessaryEscalation + "/" + C.ofControls },
  { id: "no_control_regression", pass: (C.unnecessaryEscalation - A.unnecessaryEscalation) <= STANDARD.maxUnnecessaryEscalationIncrease, detail: A.unnecessaryEscalation + " -> " + C.unnecessaryEscalation },
];
const confirmed = gates.every((g) => g.pass);

const controlUnexpectedlyGood = A.requiredEscalationRecall >= 0.40;
const precisionCollapsed = margin >= STANDARD.minMarginOverControl && C.unnecessaryEscalation > STANDARD.maxUnnecessaryEscalations;

let result, interpretation, nextLayer;
if (controlUnexpectedlyGood) {
  result = "RESULT_D_control_performs_well";
  interpretation = "The control escalates at a rate the historical behaviour does not predict, so this set does not reproduce the defect and no improvement may be attributed to C.";
  nextLayer = "D. DIAGNOSTIC CASE DESIGN";
} else if (precisionCollapsed) {
  result = "RESULT_C_precision_collapsed";
  interpretation = "C asks more often and also interrupts the owner about things the evidence settles. That is salience, not judgement, and it is not an operational improvement.";
  nextLayer = "C. ACTION-SELECTION / RUNTIME";
} else if (confirmed) {
  result = "RESULT_A_workspace_effect_confirmed";
  interpretation = "Representing the requirement as workstation state causally improves this action selection, without increasing unnecessary owner interruption.";
  nextLayer = "A. WORKSTATION / REQUIREMENT REPRESENTATION";
} else {
  result = "RESULT_B_no_effect";
  interpretation = "The workspace representation does not change the action. Instruction and representation are both exhausted as explanations.";
  nextLayer = "C. ACTION-SELECTION / RUNTIME";
}

console.log("");
for (const g of gates) console.log("  " + (g.pass ? "PASS " : "FAIL ") + g.id.padEnd(28) + g.detail);
console.log("");
console.log(result);
console.log("  " + interpretation);
console.log("  next layer: " + nextLayer);

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("calls " + calls + "/" + CEILING + " | infrastructure retries " + retries
  + " | tokens " + tokens.input + " in / " + tokens.output + " out | cost " + cost.status);

writeFileSync(repoPath("var", "state", "requirement-confirmation.json"), JSON.stringify({
  at: new Date().toISOString(), model, rule: RULE, ruleSha256: RULE_HASH,
  ruleSource: "read from var/state/requirement-channel-probe.json, not retyped",
  design: "single-shot with the workstation pre-opened, matching the prior probe so the two are comparable. Arm B dropped: three campaigns show the prompt channel producing no effect.",
  evidenceStatus: "development confirmation experiment. Certifies nothing, promotes nothing, trains nothing.",
  phase0Checks: checks, standard: STANDARD,
  cases: CONFIRMATION_CASES.map((c) => ({ id: c.id, shape: c.shape, escalate: c.escalate, audit: c.audit })),
  requirementObject: REQUIREMENT_OBJECT,
  rows, summary: { A_control: A, C_workspace: C }, margin, gates, confirmed,
  result, interpretation, nextLayer,
  plannedCalls: CONFIRMATION_CASES.length * 2, actualCalls: calls, infrastructureRetries: retries,
  tokens, cost, outboundActionsTaken: 0,
}, null, 1));
