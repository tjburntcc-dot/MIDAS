/**
 * The last gold review call.
 *
 * Ten fields were open. All ten were repaired: five action, bottleneck and
 * decisive-property fields from the reviewer's round-two reasoning, and five
 * quantity lists which now come with two things they did not have before -- the
 * numbers the case writes as words, and a machine-enforced guarantee that every
 * number the worker can read is either typed or explicitly excluded.
 *
 * So the question put to the reviewer about quantities changes. It is no longer
 * "is this list complete", which is the question that did not converge across
 * two rounds. It is only "are the declared units right".
 *
 * The action-equivalence semantics travel with the payload, as they now do by
 * construction. Round one lacked them, asked for a widening and retracted it.
 *
 * One call. If anything comes back unconfirmed, the campaign does not run.
 *
 * No outbound action.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { MANAGER_FITNESS_CASES } from "../packages/eval/src/manager-fitness-cases.ts";
import {
  freezeBlockers, gatedGoldFields, reviewSemantics, reviewPayloadFor,
  FIELD_VERDICTS, equivalentActions, workerVisibleText,
} from "../packages/eval/src/judgment-gold.ts";
import { numericTokens, QUANTITY_EXTRACTION_VERSION } from "../packages/eval/src/quantity-extraction.ts";
import { BOTTLENECKS, ACTION_CLASSES } from "../packages/eval/src/manager.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const CEILING = 1;
const provider = new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const prior = JSON.parse(readFileSync(repoPath("var", "state", "manager-fitness-gold-closed.json"), "utf8"));
const outstanding = freezeBlockers(prior.fieldVerdicts);
const byCase = new Map();
for (const b of outstanding) {
  if (!byCase.has(b.caseId)) byCase.set(b.caseId, []);
  byCase.get(b.caseId).push(b.field);
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["reviews"],
  properties: { reviews: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["caseId", "fields"],
    properties: {
      caseId: { type: "string" },
      fields: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["field", "verdict", "comment"],
        properties: {
          field: { type: "string", enum: [...gatedGoldFields()] },
          verdict: { type: "string", enum: [...FIELD_VERDICTS] },
          comment: { type: "string" },
        } } },
    } } } },
};

const sem = reviewSemantics(MANAGER_FITNESS_CASES[0]);
const INSTRUCTIONS = [
  "You are checking reference answers for a management examination. You are not sitting it and you are not being scored.",
  "",
  "For each listed field give one verdict: CONFIRMED, TOO_BROAD, TOO_NARROW, WRONG or AMBIGUOUS, with a short reason.",
  "",
  "Binding bottleneck, one of: " + BOTTLENECKS.join(", "),
  "Action class, one of: " + ACTION_CLASSES.join(", "),
  "",
  "HOW ACTION EQUIVALENCE WORKS. Every action class has exactly these material properties: " + sem.actionProperties.join(", ") + ".",
  JSON.stringify(sem.actionSemantics),
  sem.equivalenceRule,
  sem.authorityRule,
  "Each case shows its decisiveActionProperties and, computed from them, the FULL accepted set: every label that would be scored correct. Judge that accepted set, not just the listed acceptableActions.",
  "",
  "HOW QUANTITIES WORK, and what you are NOT being asked.",
  sem.numericRule,
  "Every number the worker can read -- digits and numbers written as words alike -- is extracted deterministically and the structural audit refuses any that is neither typed nor explicitly excluded. Each case below shows that extraction. So do NOT report missing figures: that is machine-enforced and a completeness objection will be disregarded.",
  "Judge only whether the declared units are right for what the situation says. A denominator the situation does not state is WRONG. A unit that names the wrong thing, such as calling missed appointments bookings, is WRONG.",
  "",
  "Judge authorityByAction strictly where it appears: if the situation states no authority or approval constraint, authorityRequired must be false.",
].join(NL);

function renderCase(gold) {
  const fields = byCase.get(gold.caseId) || [];
  const proposed = {};
  for (const f of fields) proposed[f] = gold[f];
  const tokens = numericTokens(workerVisibleText(gold)).filter((t) => !t.nonEvidentiary);
  const lines = [
    "---- CASE " + gold.caseId,
    "BUSINESS: " + gold.business,
    "OBJECTIVE: " + gold.objective,
    "SITUATION: " + gold.state,
    "DECISIVE ACTION PROPERTIES: " + JSON.stringify(gold.decisiveActionProperties),
    "FULL ACCEPTED ACTION SET, computed: " + JSON.stringify(equivalentActions(gold.acceptableActions, gold.decisiveActionProperties)),
    "DECLARED WRONG NEAR NEIGHBOURS: " + JSON.stringify(gold.unacceptableActions),
  ];
  if (fields.includes("supportedQuantities")) {
    lines.push("NUMBERS EXTRACTED FROM THE TEXT, machine-enforced as complete: "
      + JSON.stringify([...new Set(tokens.map((t) => t.value))].sort((a, b) => a - b)));
  }
  lines.push("FIELDS TO JUDGE (" + fields.length + "):", JSON.stringify(proposed, null, 1));
  return lines.join(NL);
}

const cases = MANAGER_FITNESS_CASES.filter((g) => (byCase.get(g.caseId) || []).length);
console.log("FINAL GOLD REVIEW -- MANAGER FITNESS");
console.log("  reviewer   : " + model + ", blinded, with equivalence and quantity semantics in the payload");
console.log("  reopening  : " + outstanding.length + " fields across " + cases.length + " cases");
console.log("  quantities : completeness enforced by " + QUANTITY_EXTRACTION_VERSION);
console.log("  calls      : 1 of a ceiling of " + CEILING);
console.log("");

const tokens = { input: 0, output: 0 };
const out = await provider.complete({
  instructions: INSTRUCTIONS,
  input: cases.map(renderCase).join(NL + NL),
  outputSchema: { name: "gold_final", strict: false, schema: SCHEMA },
});
const u = out.usage || {};
tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
const t = String(out.text || ""); const a = t.indexOf("{"), z = t.lastIndexOf("}");
let d = { reviews: [] };
try { d = a >= 0 ? JSON.parse(t.slice(a, z + 1)) : { reviews: [] }; } catch { d = { reviews: [] }; }

const fresh = [];
for (const r of d.reviews || []) for (const f of r.fields || []) fresh.push({ caseId: r.caseId, field: f.field, verdict: f.verdict, comment: f.comment });

const expected = outstanding.map((o) => o.caseId + "." + o.field);
const got = new Set(fresh.map((f) => f.caseId + "." + f.field));
const unanswered = expected.filter((k) => !got.has(k));

for (const f of fresh) {
  console.log("  " + (f.verdict === "CONFIRMED" ? "ok  " : "OPEN") + " " + f.caseId + " " + f.field.padEnd(26) + f.verdict);
  if (f.verdict !== "CONFIRMED") console.log("        " + String(f.comment).slice(0, 300));
}

const merged = prior.fieldVerdicts.map((f) => {
  const upd = fresh.find((x) => x.caseId === f.caseId && x.field === f.field);
  return upd ? { ...f, verdict: upd.verdict, comment: upd.comment, round: 3 } : f;
});
const blockers = freezeBlockers(merged);
const cleared = blockers.length === 0 && unanswered.length === 0;

console.log("");
console.log("  answered: " + fresh.length + "/" + outstanding.length + (unanswered.length ? "   UNANSWERED " + unanswered.join(", ") : ""));
console.log("  confirmed overall: " + merged.filter((f) => f.verdict === "CONFIRMED").length + "/" + merged.length);
console.log("");
console.log(cleared ? "GOLD CLOSED." : "GOLD NOT CLOSED: " + blockers.map((b) => b.caseId + "." + b.field + "=" + b.verdict).join(", "));

writeFileSync(repoPath("var", "state", "manager-fitness-gold-final.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls: 1, ceiling: CEILING,
  caseFingerprintReviewed: createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES)).digest("hex").slice(0, 16),
  gatedGoldFields: gatedGoldFields(), fieldsReviewed: reviewPayloadFor(MANAGER_FITNESS_CASES[0]).fieldsShown,
  semanticsShown: true, quantityCompletenessEnforcedBy: QUANTITY_EXTRACTION_VERSION,
  blinding: prior.blinding + " In this round the payload additionally carried the full computed accepted action set and the extracted number list, and the reviewer was told completeness is machine-enforced and completeness objections would be disregarded.",
  reopened: outstanding, freshVerdicts: fresh, fieldVerdicts: merged,
  unresolvedFieldVerdicts: blockers, unanswered, cleared, tokens,
  evidenceStatus: "Reviews reference answers only. Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/manager-fitness-gold-final.json");
process.exit(cleared ? 0 : 3);
