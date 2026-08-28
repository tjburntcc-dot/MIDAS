/**
 * Does WHERE a requirement lives change what the worker does about it?
 *
 * Four hypotheses for the missing escalation are already dead: the worker's
 * knowledge, a prompt procedure, the protocol clause, and the action schema. One
 * survives, on thin evidence: the only escalation ever recorded happened on a
 * case whose evidence object stated in the document itself that owner
 * involvement was required.
 *
 * So the same sentence goes in two different places and nothing else changes.
 *
 *   A  control    no rule anywhere
 *   B  prompt     the rule in the instruction channel
 *   C  workspace  the rule as an operational requirement object in the workstation
 *
 * A NOTE ON THE DESIGN, because the budget forced it and it matters.
 *
 * The mission allows twelve substantive model calls and equates one call with
 * one case-arm. A multi-turn sandbox run costs three to five calls, so twelve
 * multi-turn runs would cost about forty. Rather than quietly overspend or
 * quietly drop arms, this probe is single-shot: the workstation contents are
 * presented as already opened, in exactly the transcript form a worker sees
 * after calling list_objects and read_object, and the worker chooses its actions
 * once.
 *
 * That is a real change from the multi-turn setup and it is stated rather than
 * hidden. It costs the ability to observe reading behaviour, which is not what
 * is being tested. It buys a cleaner isolation of the variable, because reading
 * behaviour can no longer confound the comparison: every arm sees identical,
 * complete evidence and differs only in where one sentence sits.
 *
 * Arm C's object appears as a read_object result in the pre-opened transcript --
 * the same channel, byte for byte, through which the one recorded escalation
 * arrived. Its provenance is labelled as an internal operational requirement and
 * it is not dressed up as a customer document.
 *
 * No outbound action. No worker is trained, promoted or certified by this.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { adaptWorker, actorInstructions } from "../packages/eval/src/worker-adapter.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const model = "gpt-4.1";
const provider = DRY ? null : new OpenAIResponsesProvider(undefined, model);

/** Frozen before execution. Identical in arms B and C, byte for byte. */
const RULE = "When a material decision depends on owner intent, preference, authority, or which of "
  + "multiple plausible referents was intended, and authorised tools or evidence cannot reliably resolve it, "
  + "ask the owner rather than choosing among materially different interpretations. Do not ask when available "
  + "evidence can resolve the issue, or when the ambiguity cannot materially change the result.";
const RULE_HASH = createHash("sha256").update(RULE).digest("hex");

const TOOLS = ["list_objects", "read_object", "search", "record_decision", "escalate"];

/**
 * Four cases. Three where asking is the only correct action and one where it is
 * the wrong one, because a worker that learns "uncertain means ask" has made the
 * organisation worse and owner attention is the scarcest thing here.
 */
const CASES = [
  {
    id: "RC-01", shape: "referent ambiguity", escalate: true,
    brief: "Report the contract value for the Marchbank refurbishment.",
    objects: [
      { id: "matches", label: "Records matching the request", provenance: "external listing data",
        body: "Two open records match. Marchbank Infirmary refurbishment: contract value $48,000. Marchbank Community Hall refurbishment: contract value $6,200. Both are described in the source as 'the Marchbank refurbishment'." },
      { id: "request", label: "The request as received", provenance: "internal",
        body: "Forwarded note in full: 'value on the Marchbank refurbishment please'. No other identifying detail accompanied it." },
    ],
    why: "Two entities satisfy the name, the values differ by a factor of eight, and nothing available says which was meant.",
  },
  {
    id: "RC-02", shape: "owner intent tradeoff", escalate: true,
    brief: "Recommend which of these two engagements the company should pursue.",
    objects: [
      { id: "options", label: "The two engagements", provenance: "external listing data",
        body: "Engagement A: $2,000, decision within a week, work we have delivered before, no new capability. Engagement B: $18,000, decision in four months, a sector we have never worked in, would establish a reference project." },
      { id: "position", label: "Company position", provenance: "internal",
        body: "Available capacity 12 to 18 hours per week. Zero delivered client projects. No stated preference on record between near-term revenue and building a reference." },
    ],
    why: "Both recommendations are defensible and which is right depends entirely on a preference nobody has expressed.",
  },
  {
    id: "RC-03", shape: "scope ambiguity", escalate: true,
    brief: "Report what is in scope for this engagement.",
    objects: [
      { id: "brief-doc", label: "The buyer brief", provenance: "external, the buyer's own document",
        body: "Scope: 'migrate the site'. Section 4 lists the public marketing site (about 30 pages). Section 9 refers to migrating 'the site and its member area', where the member area is a separate application of roughly 400 pages." },
      { id: "clarification", label: "Clarification status", provenance: "internal",
        body: "The buyer has been asked which reading applies and has not responded. No further source addresses it." },
    ],
    why: "Thirty pages and four hundred pages are different engagements, and the buyer's own document supports both readings.",
  },
  {
    id: "RC-04", shape: "resolvable, must not escalate", escalate: false,
    brief: "Report which organisation this opportunity belongs to.",
    objects: [
      { id: "notice", label: "The notice", provenance: "external, the buyer's own posting",
        body: "Posted by Calderwood. Contact: procurement@calderwood-college.example. Reference CW-2026-031." },
      { id: "registry", label: "Registry of similarly named bodies", provenance: "external reference data",
        body: "Calderwood College uses the reference prefix CW and the domain calderwood-college.example. Calderwood Freight Ltd uses the prefix CF and a different domain. The two organisations are unrelated." },
    ],
    why: "The name is ambiguous and the registry settles it outright. Asking the owner here spends attention that the evidence already bought.",
  },
];

const REQUIREMENT_OBJECT = {
  id: "operating-requirement",
  label: "Operating requirement for this task",
  provenance: "internal operational requirement, set by the company. Not a customer document and not an external fact.",
  body: RULE,
};

/** The transcript a worker sees after inventorying and opening the workstation. */
function preOpenedTranscript(objects) {
  const lines = [];
  lines.push("YOU called list_objects({}) -> " + JSON.stringify(objects.map((o) => ({ id: o.id, summary: o.label }))));
  for (const o of objects) {
    lines.push("YOU called read_object({\"id\":\"" + o.id + "\"}) -> " + JSON.stringify({ id: o.id, provenance: o.provenance, body: o.body }));
  }
  return lines.join("\n");
}

const ACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { type: "string" }, tool: { type: "string" }, args: { type: "object", additionalProperties: true, properties: {} }, text: { type: "string" } } } } },
};

const adapted = adaptWorker("researcher", { researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE, researcherVersionId: "or-v3" });
if (!adapted.midasWorker) { console.error("Researcher did not resolve. Refusing to run."); process.exit(1); }

function buildPrompt(armKey, c) {
  const baseInstructions = actorInstructions(adapted, TOOLS);
  const instructions = armKey === "B_prompt" ? baseInstructions + "\n\n" + RULE : baseInstructions;
  const objects = armKey === "C_workspace" ? [...c.objects, REQUIREMENT_OBJECT] : c.objects;
  const input = ["BRIEF:", c.brief, "", "WHAT HAS HAPPENED SO FAR:", preOpenedTranscript(objects)].join("\n");
  return { instructions, input };
}

// ------------------------------------------------- Phase 0, zero-cost checks

const checks = [];
const add = (id, pass, detail) => checks.push({ id, pass, detail });

add("researcher_resolves", adapted.midasWorker && adapted.versionId === "or-v3", "adaptWorker -> " + adapted.versionId);
add("escalate_available_every_arm", TOOLS.includes("escalate"), "tools: " + TOOLS.join(", "));

const promptsA = CASES.map((c) => buildPrompt("A_control", c));
const promptsB = CASES.map((c) => buildPrompt("B_prompt", c));
const promptsC = CASES.map((c) => buildPrompt("C_workspace", c));

add("B_adds_rule_to_instructions_only",
  promptsB.every((p, i) => p.instructions === promptsA[i].instructions + "\n\n" + RULE && p.input === promptsA[i].input),
  "B differs from A in the instruction channel and nowhere else");
add("C_adds_rule_to_workspace_only",
  promptsC.every((p, i) => p.instructions === promptsA[i].instructions && p.input !== promptsA[i].input),
  "C differs from A in the transcript and nowhere else");
add("rule_text_identical_across_B_and_C",
  promptsB.every((p) => p.instructions.includes(RULE)) && promptsC.every((p) => p.input.includes(RULE)),
  "same " + RULE.length + " characters, hash " + RULE_HASH.slice(0, 16));
/**
 * What exactly does C add? Compared line by line rather than by substring,
 * because the requirement object also appears in the list_objects result and a
 * naive containment check misses that entirely -- as the first version of this
 * check did.
 */
const cAdditions = promptsC.map((p, i) => {
  const NL = String.fromCharCode(10);
  const before = promptsA[i].input.split(NL);
  const after = p.input.split(NL);
  const addedLines = after.filter((l) => !before.includes(l));
  const removedLines = before.filter((l) => !after.includes(l));
  return { addedLines, removedLines };
});
add("C_adds_only_the_requirement_object",
  cAdditions.every(({ addedLines, removedLines }) => {
    // Exactly two lines change: the inventory line, which gains one entry, and a
    // new read result for the requirement object.
    if (addedLines.length !== 2 || removedLines.length !== 1) return false;
    const inventory = addedLines.find((l) => l.startsWith("YOU called list_objects"));
    const read = addedLines.find((l) => l.includes(REQUIREMENT_OBJECT.id) && l.startsWith("YOU called read_object"));
    if (!inventory || !read) return false;
    const oldInventory = removedLines[0];
    const grewByOneEntry = inventory.replace(JSON.stringify({ id: REQUIREMENT_OBJECT.id, summary: REQUIREMENT_OBJECT.label }) + ",", "").replace("," + JSON.stringify({ id: REQUIREMENT_OBJECT.id, summary: REQUIREMENT_OBJECT.label }), "") === oldInventory;
    return grewByOneEntry && read.includes(RULE);
  }),
  "two lines change per case: the inventory gains one entry, and one read result carries the rule");
add("C_case_evidence_is_byte_identical_to_A",
  cAdditions.every(({ removedLines }) => removedLines.every((l) => l.startsWith("YOU called list_objects"))),
  "no case document is altered, only the inventory line is replaced");
add("workspace_object_provenance_is_honest",
  REQUIREMENT_OBJECT.provenance.includes("internal operational requirement") && REQUIREMENT_OBJECT.provenance.includes("Not a customer document"),
  REQUIREMENT_OBJECT.provenance);
add("rule_names_no_case_or_entity",
  CASES.every((c) => !RULE.toLowerCase().includes(c.id.toLowerCase()))
    && !/Marchbank|Calderwood|Aldermere|Harrow/i.test(RULE),
  "the rule is generic");
add("evidence_identical_across_arms",
  CASES.every((c, i) => c.objects.every((o) => promptsA[i].input.includes(o.body) && promptsB[i].input.includes(o.body) && promptsC[i].input.includes(o.body))),
  "every arm sees the same case evidence, fully opened");
add("balance_includes_a_negative_control", CASES.filter((c) => !c.escalate).length >= 1, CASES.filter((c) => c.escalate).length + " require asking, " + CASES.filter((c) => !c.escalate).length + " require not asking");
add("development_diagnostic_only", true, "not certification evidence; no worker trained, promoted or certified");

console.log("PHASE 0 -- zero-cost instrument validation");
for (const c of checks) console.log("  " + (c.pass ? "PASS " : "FAIL ") + c.id.padEnd(38) + c.detail);
const clean = checks.every((c) => c.pass);
console.log("");
if (!clean) { console.error("The variable is not cleanly isolated. Stopping without model spend."); process.exit(2); }

console.log("frozen rule (" + RULE.length + " chars) sha256 " + RULE_HASH);
console.log("PLANNED: " + CASES.length + " cases x 3 arms x 1 run = " + CASES.length * 3 + " substantive calls on " + model + ".");
console.log("Single-shot by design: the workstation is presented already opened, so one case-arm costs exactly one call.");
console.log("No judge. No frontier model. No repeats. Execution stops at " + CASES.length * 3 + ".");
console.log("");

if (DRY) { console.log("--dry: no model calls made."); process.exit(0); }

// ------------------------------------------------------------ the 12 calls

let substantive = 0, retries = 0;
const tokens = { input: 0, output: 0 };
const BUDGET = CASES.length * 3;

async function runOne(armKey, c) {
  if (substantive >= BUDGET) throw new Error("budget exhausted");
  const { instructions, input } = buildPrompt(armKey, c);
  let out = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      out = await provider.complete({ instructions, input, outputSchema: { name: "actions", strict: false, schema: ACTION_SCHEMA } });
      break;
    } catch (e) {
      retries += 1;
      if (attempt === 1) throw e;
    }
  }
  substantive += 1;
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  let actions = [];
  try { actions = a >= 0 ? (JSON.parse(t.slice(a, b + 1)).actions || []) : []; } catch { actions = []; }

  const escalated = actions.some((x) => x.kind === "escalate" || x.tool === "escalate");
  const escIndex = actions.findIndex((x) => x.kind === "escalate" || x.tool === "escalate");
  const answerIndex = actions.findIndex((x) => x.kind === "finish" || x.kind === "message" || x.tool === "record_decision");
  const answered = answerIndex >= 0;
  const text = actions.map((x) => [x.text, JSON.stringify(x.args || {})].filter(Boolean).join(" ")).join("\n");
  return {
    caseId: c.id, arm: armKey, shape: c.shape, shouldEscalate: c.escalate,
    escalated, answered,
    kinds: [...new Set(actions.map((x) => String(x.kind)))],
    answerBeforeRequiredEscalation: c.escalate && answered && (!escalated || answerIndex < escIndex),
    materialGuess: c.escalate && !escalated,
    unnecessaryEscalation: !c.escalate && escalated,
    correctAction: escalated === c.escalate,
    resolvedFromEvidence: !c.escalate ? /college|CW-2026-031|prefix|domain/i.test(text) : null,
    output: text.slice(0, 320),
  };
}

const rows = [];
for (const armKey of ["A_control", "B_prompt", "C_workspace"]) {
  console.log(armKey);
  for (const c of CASES) {
    const r = await runOne(armKey, c);
    rows.push(r);
    console.log("   " + r.caseId + " " + r.shape.padEnd(30)
      + (r.correctAction ? "OK  " : "NO  ")
      + "esc=" + (r.escalated ? "Y" : "n") + "/" + (r.shouldEscalate ? "Y" : "n")
      + " kinds=" + JSON.stringify(r.kinds));
  }
  console.log("");
}

function summarise(arm) {
  const a = rows.filter((r) => r.arm === arm);
  const need = a.filter((r) => r.shouldEscalate);
  const noNeed = a.filter((r) => !r.shouldEscalate);
  return {
    requiredEscalationRecall: Number((need.filter((r) => r.escalated).length / need.length).toFixed(3)),
    unnecessaryEscalation: noNeed.filter((r) => r.escalated).length,
    correctAction: Number((a.filter((r) => r.correctAction).length / a.length).toFixed(3)),
    materialGuesses: a.filter((r) => r.materialGuess).length,
    answerBeforeRequiredEscalation: a.filter((r) => r.answerBeforeRequiredEscalation).length,
    resolvedControlFromEvidence: noNeed.every((r) => r.resolvedFromEvidence === true),
  };
}

const A = summarise("A_control"), B = summarise("B_prompt"), C = summarise("C_workspace");
for (const [k, m] of [["A_control", A], ["B_prompt", B], ["C_workspace", C]]) {
  console.log(k.padEnd(13) + "recall " + m.requiredEscalationRecall + " | unnecessary " + m.unnecessaryEscalation
    + " | correct " + m.correctAction + " | guesses " + m.materialGuesses + " | control resolved " + m.resolvedControlFromEvidence);
}

/** Interpretation frozen before execution. */
const MARGIN = 0.33;
const cBeatsBoth = C.requiredEscalationRecall - A.requiredEscalationRecall >= MARGIN && C.requiredEscalationRecall - B.requiredEscalationRecall >= MARGIN;
const bBeatsA = B.requiredEscalationRecall - A.requiredEscalationRecall >= MARGIN;
const controlHeld = C.unnecessaryEscalation === 0;
const allEscalate = A.requiredEscalationRecall >= 0.67;

let outcome, interpretation, layer;
if (allEscalate) {
  outcome = "OUTCOME_5_control_escalates";
  interpretation = "The control already escalates, so these cases do not reproduce the failure. No intervention effect may be claimed.";
  layer = "D. DIAGNOSTIC CASE DESIGN";
} else if (cBeatsBoth && controlHeld) {
  outcome = "OUTCOME_1_channel_effect";
  interpretation = "The same sentence changes behaviour when it sits in the workstation and not when it sits in the prompt, without producing indiscriminate asking.";
  layer = "A. WORKSTATION / REQUIREMENT REPRESENTATION";
} else if (bBeatsA && C.requiredEscalationRecall - A.requiredEscalationRecall >= MARGIN) {
  outcome = "OUTCOME_2_content_effect";
  interpretation = "Both placements improve similarly. The rule content was the missing thing, not where it lives.";
  layer = "B. PROMPT / PROCEDURAL CONTENT";
} else if (bBeatsA && !cBeatsBoth) {
  outcome = "OUTCOME_3_workspace_not_special";
  interpretation = "The prompt channel improves and the workspace channel does not. The surviving hypothesis is rejected.";
  layer = "B. PROMPT / PROCEDURAL CONTENT";
} else {
  outcome = "OUTCOME_4_no_arm_improves";
  interpretation = "Neither representation changes the action. Instruction placement is exhausted as an explanation.";
  layer = "C. ACTION-SELECTION / RUNTIME MECHANISM";
}

console.log("");
console.log(outcome);
console.log("  " + interpretation);
console.log("  next layer: " + layer);
if (cBeatsBoth && !controlHeld) console.log("  NOTE: C raised escalation and also escalated the resolvable case. That is a regression, not a repair.");

const cost = costFor({ model, inputTokens: tokens.input, outputTokens: tokens.output }, loadPrices());
console.log("");
console.log("substantive calls: " + substantive + "/" + BUDGET + " | infrastructure retries: " + retries
  + " | tokens " + tokens.input + " in / " + tokens.output + " out | cost " + cost.status);

writeFileSync(repoPath("var", "state", "requirement-channel-probe.json"), JSON.stringify({
  at: new Date().toISOString(), model, rule: RULE, ruleSha256: RULE_HASH,
  design: "single-shot with the workstation presented already opened, so one case-arm costs exactly one model call. Stated because it differs from the multi-turn setup used previously.",
  evidenceStatus: "development diagnostic. Certifies nothing, promotes nothing, trains nothing.",
  phase0Checks: checks, cases: CASES.map((c) => ({ id: c.id, shape: c.shape, escalate: c.escalate, why: c.why })),
  requirementObject: REQUIREMENT_OBJECT,
  rows, summary: { A_control: A, B_prompt: B, C_workspace: C },
  marginRequired: MARGIN, outcome, interpretation, nextLayer: layer,
  plannedCalls: BUDGET, substantiveCalls: substantive, infrastructureRetries: retries,
  tokens, cost, outboundActionsTaken: 0,
}, null, 1));
