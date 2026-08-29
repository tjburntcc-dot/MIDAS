/**
 * Independent review of the Manager fitness gold, field by field.
 *
 * The previous review asked one question -- is my preferred answer inside the
 * acceptable set -- and that question cannot see either failure that followed.
 * It cannot see a set that is too narrow, because the reviewer's own answer was
 * inside it. And it cannot see a gate resting on a field it was never shown.
 *
 * So the payload is generated from the gate dependency graph rather than chosen,
 * and the reviewer is asked the completeness questions directly: what is the
 * preferred action, what else is materially the same decision, which near
 * neighbours must stay wrong, and is each gated field too broad, too narrow,
 * wrong or ambiguous.
 *
 * Three calls, four cases each, against a ceiling of three.
 *
 * No outbound action. Nothing here certifies, promotes or trains anything.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { MANAGER_FITNESS_CASES } from "../packages/eval/src/manager-fitness-cases.ts";
import { reviewPayloadFor, gatedGoldFields, FIELD_VERDICTS, freezeBlockers, ACTION_SEMANTICS } from "../packages/eval/src/judgment-gold.ts";
import { BOTTLENECKS, ACTION_CLASSES } from "../packages/eval/src/manager.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const CEILING = 3;
const BATCH = 4;
const provider = new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);
const GATED = gatedGoldFields();

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["reviews"],
  properties: { reviews: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["caseId", "preferredBottleneck", "preferredAction", "equivalentActions", "nearNeighbourWrongActions", "fields"],
    properties: {
      caseId: { type: "string" },
      preferredBottleneck: { type: "string", enum: [...BOTTLENECKS] },
      preferredAction: { type: "string", enum: [...ACTION_CLASSES] },
      equivalentActions: { type: "array", items: { type: "string", enum: [...ACTION_CLASSES] } },
      nearNeighbourWrongActions: { type: "array", items: { type: "string", enum: [...ACTION_CLASSES] } },
      fields: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["field", "verdict", "comment"],
        properties: {
          field: { type: "string", enum: [...GATED] },
          verdict: { type: "string", enum: [...FIELD_VERDICTS] },
          comment: { type: "string" },
        } } },
    } } } },
};

const INSTRUCTIONS = [
  "You are checking reference answers for a management examination. You are not sitting it and you are not being scored.",
  "",
  "Each item gives a small business, its objective, everything known about its situation, and a PROPOSED reference answer made of several fields. Your job is completeness, not agreement: a field that is too broad or too narrow is as wrong as one that is incorrect.",
  "",
  "Binding bottleneck, one of: " + BOTTLENECKS.join(", "),
  "Action class, one of: " + ACTION_CLASSES.join(", "),
  "",
  "Action classes carry material properties. Two labels are the same PRESENT DECISION when they match on the properties that matter for the case -- for instance acquiring an accreditation is the same present decision whether it is called train_capability or execute_bounded_action, because both commit capital now, while researching it is not, because it commits nothing and is preparation.",
  "Properties: " + JSON.stringify(ACTION_SEMANTICS.execute_bounded_action) + " is the shape; each class has its own values.",
  "",
  "For each case, answer four things and then judge each field:",
  "  1. preferredBottleneck and preferredAction: your own answer.",
  "  2. equivalentActions: EVERY other class that is the same present decision here.",
  "  3. nearNeighbourWrongActions: the classes a careless reader would choose that must stay WRONG.",
  "  4. fields: a verdict on every field listed, one entry each.",
  "",
  "Field verdicts:",
  "  CONFIRMED   right, and neither too broad nor too narrow",
  "  TOO_BROAD   it admits something that should be wrong",
  "  TOO_NARROW  it excludes something that should be right",
  "  WRONG       it states something incorrect",
  "  AMBIGUOUS   the situation does not settle it",
  "",
  "The fields you must judge:",
  "  acceptableBottlenecks     which bottlenecks count as correct",
  "  acceptableActions         which actions count as correct",
  "  unacceptableActions       near neighbours that must stay wrong",
  "  decisiveActionProperties  which material properties make two labels the same decision here",
  "  authorityByAction         for each action: does it need the owner's authority, and does it need the owner NOW, with a reason",
  "  mustDefer                 what the manager must explicitly set aside, as regular expressions",
  "  supportedQuantities       every figure the situation supplies, with its units, used to judge whether a number in the answer was invented",
  "",
  "Judge authorityByAction carefully: it decides a zero-tolerance gate. If the situation states no authority constraint, an expectation that authority is required is WRONG, not merely broad.",
].join(NL);

function renderCase(gold) {
  const { payload } = reviewPayloadFor(gold);
  return [
    "---- CASE " + gold.caseId,
    "BUSINESS: " + gold.business,
    "OBJECTIVE: " + gold.objective,
    "SITUATION: " + gold.state,
    "PROPOSED REFERENCE ANSWER:",
    JSON.stringify(payload.proposed, null, 1),
  ].join(NL);
}

const batches = [];
for (let i = 0; i < MANAGER_FITNESS_CASES.length; i += BATCH) batches.push(MANAGER_FITNESS_CASES.slice(i, i + BATCH));
if (batches.length > CEILING) { console.error("Batching needs " + batches.length + " calls against " + CEILING + "."); process.exit(1); }

const fieldsShown = reviewPayloadFor(MANAGER_FITNESS_CASES[0]).fieldsShown;
console.log("INDEPENDENT GOLD REVIEW V2 -- MANAGER FITNESS");
console.log("  reviewer     : " + model + ", blinded to the candidate, to prior arms and to the desired outcome");
console.log("  cases        : " + MANAGER_FITNESS_CASES.length + " in " + batches.length + " calls (ceiling " + CEILING + ")");
console.log("  gated fields : " + GATED.join(", "));
console.log("  fields shown : " + fieldsShown.join(", "));
console.log("");

const reviews = [];
const tokens = { input: 0, output: 0 };
let calls = 0;
for (const b of batches) {
  calls += 1;
  const out = await provider.complete({
    instructions: INSTRUCTIONS,
    input: b.map(renderCase).join(NL + NL),
    outputSchema: { name: "gold_review_v2", strict: false, schema: SCHEMA },
  });
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), z = t.lastIndexOf("}");
  let d = { reviews: [] };
  try { d = a >= 0 ? JSON.parse(t.slice(a, z + 1)) : { reviews: [] }; } catch { d = { reviews: [] }; }
  for (const r of d.reviews || []) reviews.push(r);
}

const flat = [];
for (const r of reviews) for (const f of r.fields || []) flat.push({ caseId: r.caseId, field: f.field, verdict: f.verdict, comment: f.comment });

const rows = MANAGER_FITNESS_CASES.map((g) => {
  const r = reviews.find((x) => x.caseId === g.caseId);
  const judged = new Set((r?.fields || []).map((f) => f.field));
  const unjudged = GATED.filter((f) => !judged.has(f));
  const problems = (r?.fields || []).filter((f) => f.verdict !== "CONFIRMED");
  return {
    caseId: g.caseId, competency: g.competency, reviewed: Boolean(r),
    preferredBottleneck: r?.preferredBottleneck, preferredAction: r?.preferredAction,
    equivalentActions: r?.equivalentActions || [], nearNeighbourWrongActions: r?.nearNeighbourWrongActions || [],
    bottleneckInSet: r ? g.acceptableBottlenecks.includes(r.preferredBottleneck) : false,
    actionInSet: r ? g.acceptableActions.includes(r.preferredAction) : false,
    unjudgedFields: unjudged, problems,
  };
});

for (const r of rows) {
  const ok = r.reviewed && !r.problems.length && !r.unjudgedFields.length;
  console.log("  " + (ok ? "ok  " : "FLAG") + " " + r.caseId + " " + r.competency.padEnd(26)
    + String(r.preferredBottleneck).padEnd(20) + String(r.preferredAction).padEnd(24)
    + (r.problems.length ? r.problems.map((p) => p.field + "=" + p.verdict).join(", ") : "")
    + (r.unjudgedFields.length ? "  UNJUDGED: " + r.unjudgedFields.join(",") : ""));
  for (const p of r.problems) console.log("        " + p.field + " " + p.verdict + ": " + String(p.comment).slice(0, 260));
}

const blockers = freezeBlockers(flat);
const unjudged = rows.flatMap((r) => r.unjudgedFields.map((f) => ({ caseId: r.caseId, field: f })));
const cleared = blockers.length === 0 && unjudged.length === 0 && rows.every((r) => r.reviewed);

console.log("");
console.log("  field verdicts: " + flat.length + " of an expected " + GATED.length * MANAGER_FITNESS_CASES.length);
console.log("  not confirmed : " + blockers.length + (blockers.length ? " -- " + blockers.map((b) => b.caseId + "." + b.field + "=" + b.verdict).join(", ") : ""));
console.log("  unjudged      : " + unjudged.length);
console.log("");
console.log(cleared ? "The set is cleared for freezing." : "REPAIR REQUIRED before worker execution. A gated field that is not CONFIRMED blocks the freeze.");

writeFileSync(repoPath("var", "state", "manager-fitness-gold-review.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls, ceiling: CEILING,
  caseFingerprintReviewed: createHash("sha256").update(JSON.stringify(MANAGER_FITNESS_CASES)).digest("hex").slice(0, 16),
  gatedGoldFields: GATED, fieldsReviewed: fieldsShown,
  blinding: "The reviewer saw the business, the objective, the situation and every gold field that can decide a gate, generated from the gate dependency graph. It did not see the candidate configuration, any prior Manager output, that earlier campaigns were run, or that a configuration lock depends on the result.",
  protocol: "preferred answer, all materially equivalent actions, near-neighbour wrong actions, and a verdict on every gated field",
  reviews, rows, fieldVerdicts: flat,
  unresolvedFieldVerdicts: blockers, unjudgedFields: unjudged, cleared, tokens,
  evidenceStatus: "Reviews reference answers only. Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("calls " + calls + "/" + CEILING + " | tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/manager-fitness-gold-review.json");
