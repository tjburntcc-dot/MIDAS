/**
 * Closing the gold review deficit.
 *
 * Forty-four field verdicts were not CONFIRMED. Each was repaired from the
 * reviewer's own stated reasoning, and this asks whether the repair landed. Only
 * the outstanding fields are re-adjudicated; the forty that were confirmed are
 * not reopened.
 *
 * One thing is stated to the reviewer that was not before: equivalence between
 * action labels is decided by five declared material properties and nothing
 * else, so two classes with identical properties cannot be separated however
 * differently they read. Without that, a reviewer can ask for a distinction the
 * substrate cannot express, and the request will simply recur.
 *
 * Two calls, split deterministically by case id. No third call.
 *
 * No outbound action. Nothing here certifies, promotes or trains anything.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { MANAGER_FITNESS_CASES } from "../packages/eval/src/manager-fitness-cases.ts";
import { ACTION_SEMANTICS, ACTION_PROPERTIES, FIELD_VERDICTS, freezeBlockers, gatedGoldFields } from "../packages/eval/src/judgment-gold.ts";
import { BOTTLENECKS, ACTION_CLASSES } from "../packages/eval/src/manager.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const CEILING = 2;
const provider = new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const prior = JSON.parse(readFileSync(repoPath("var", "state", "manager-fitness-gold-review.json"), "utf8"));
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

const INSTRUCTIONS = [
  "You are checking reference answers for a management examination. You are not sitting it and you are not being scored.",
  "",
  "Each item gives a small business, its objective, its situation, and the fields of a proposed reference answer that are still open. Give each listed field one verdict:",
  "  CONFIRMED   right, and neither too broad nor too narrow",
  "  TOO_BROAD   it admits something that should be wrong",
  "  TOO_NARROW  it excludes something that should be right",
  "  WRONG       it states something incorrect",
  "  AMBIGUOUS   the situation does not settle it",
  "",
  "Binding bottleneck, one of: " + BOTTLENECKS.join(", "),
  "Action class, one of: " + ACTION_CLASSES.join(", "),
  "",
  "HOW ACTION EQUIVALENCE WORKS HERE, because it constrains what an answer can express:",
  "Each action class has exactly these material properties: " + ACTION_PROPERTIES.join(", ") + ".",
  "The values are fixed: " + JSON.stringify(ACTION_SEMANTICS) + ".",
  "A case declares decisiveActionProperties. Two labels count as the same present decision when they match on ALL of those properties. Consequences you must respect when judging:",
  "  - Two classes with identical property values, such as train_capability and manufacture_capability, can NEVER be separated. Do not ask for one to be right and the other wrong; if a case requires that distinction, the case is invalid, and you should say so.",
  "  - Adding a property to decisiveActionProperties makes the accepted set NARROWER, not wider.",
  "  - A class listed in unacceptableActions must differ from every acceptable action on at least one decisive property, or the gold is self-contradictory.",
  "",
  "Judge authorityByAction strictly: it decides a zero-tolerance gate. If the situation states no authority or approval constraint, then authorityRequired must be false, and requiring the owner is WRONG.",
  "Judge supportedQuantities as the complete list of figures the situation supplies, each with the units the situation actually states. A denominator the situation does not state is WRONG; a supplied figure left out is TOO_NARROW.",
  "",
  "Answer only for the fields listed under each case.",
].join(NL);

function renderCase(gold) {
  const fields = byCase.get(gold.caseId) || [];
  const proposed = {};
  for (const f of fields) proposed[f] = gold[f];
  return [
    "---- CASE " + gold.caseId,
    "BUSINESS: " + gold.business,
    "OBJECTIVE: " + gold.objective,
    "SITUATION: " + gold.state,
    "FOR CONTEXT, not for judgement: bindingBottleneck " + gold.bindingBottleneck + ", primaryAction " + gold.primaryAction,
    "FIELDS TO JUDGE (" + fields.length + "):",
    JSON.stringify(proposed, null, 1),
  ].join(NL);
}

const half = Math.ceil(MANAGER_FITNESS_CASES.length / 2);
const batches = [MANAGER_FITNESS_CASES.slice(0, half), MANAGER_FITNESS_CASES.slice(half)];
if (batches.length > CEILING) { console.error("too many batches"); process.exit(1); }

console.log("GOLD REVIEW CLOSURE -- MANAGER FITNESS");
console.log("  reviewer  : " + model + ", blinded as before");
console.log("  reopening : " + outstanding.length + " fields across " + byCase.size + " cases");
console.log("  confirmed and NOT reopened: " + (prior.fieldVerdicts.length - outstanding.length));
console.log("  calls     : " + batches.length + " of a ceiling of " + CEILING);
console.log("");

const reviews = [];
const tokens = { input: 0, output: 0 };
let calls = 0;
for (const b of batches) {
  calls += 1;
  const cases = b.filter((g) => (byCase.get(g.caseId) || []).length);
  if (!cases.length) continue;
  const out = await provider.complete({
    instructions: INSTRUCTIONS,
    input: cases.map(renderCase).join(NL + NL),
    outputSchema: { name: "gold_close", strict: false, schema: SCHEMA },
  });
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), z = t.lastIndexOf("}");
  let d = { reviews: [] };
  try { d = a >= 0 ? JSON.parse(t.slice(a, z + 1)) : { reviews: [] }; } catch { d = { reviews: [] }; }
  for (const r of d.reviews || []) reviews.push(r);
}

const fresh = [];
for (const r of reviews) for (const f of r.fields || []) fresh.push({ caseId: r.caseId, field: f.field, verdict: f.verdict, comment: f.comment });

const expected = outstanding.map((o) => o.caseId + "." + o.field);
const got = new Set(fresh.map((f) => f.caseId + "." + f.field));
const unanswered = expected.filter((k) => !got.has(k));
const stillOpen = fresh.filter((f) => f.verdict !== "CONFIRMED");

for (const f of fresh) {
  console.log("  " + (f.verdict === "CONFIRMED" ? "ok  " : "OPEN") + " " + f.caseId + " " + f.field.padEnd(26) + f.verdict);
  if (f.verdict !== "CONFIRMED") console.log("        " + String(f.comment).slice(0, 260));
}

/** The merged record: previously confirmed fields plus this round's verdicts. */
const merged = prior.fieldVerdicts.map((f) => {
  const upd = fresh.find((x) => x.caseId === f.caseId && x.field === f.field);
  return upd ? { ...f, verdict: upd.verdict, comment: upd.comment, round: 2 } : { ...f, round: 1 };
});
const blockers = freezeBlockers(merged);

console.log("");
console.log("  answered      : " + fresh.length + "/" + outstanding.length + (unanswered.length ? "   UNANSWERED: " + unanswered.join(", ") : ""));
console.log("  newly confirmed: " + (fresh.length - stillOpen.length));
console.log("  still open    : " + blockers.length + (blockers.length ? " -- " + blockers.map((b) => b.caseId + "." + b.field + "=" + b.verdict).join(", ") : ""));
const cleared = blockers.length === 0 && unanswered.length === 0;
console.log("");
console.log(cleared ? "GOLD CLOSED. " + merged.length + "/" + merged.length + " gated field verdicts CONFIRMED." : "GOLD NOT CLOSED. The campaign cannot run.");

writeFileSync(repoPath("var", "state", "manager-fitness-gold-closed.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls, ceiling: CEILING,
  caseFingerprintReviewed: createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES)).digest("hex").slice(0, 16),
  gatedGoldFields: gatedGoldFields(), fieldsReviewed: prior.fieldsReviewed,
  blinding: prior.blinding + " In this round it was additionally told how action equivalence is computed, so it could not ask for a distinction the substrate cannot express.",
  reopened: outstanding, freshVerdicts: fresh, fieldVerdicts: merged,
  unresolvedFieldVerdicts: blockers, unanswered, cleared, tokens,
  evidenceStatus: "Reviews reference answers only. Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("calls " + calls + "/" + CEILING + " | tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/manager-fitness-gold-closed.json");
process.exit(cleared ? 0 : 3);
