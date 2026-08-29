/**
 * Independent review of every Manager reference answer, before any worker runs.
 *
 * GOLD_DEFECT remains the most common recorded defect class here, and the two
 * instances that changed a verdict were both found after the run was paid for.
 * The Auditor campaign put this step before execution and it came back clean;
 * the same discipline applies whatever it returns this time.
 *
 * The reviewer sees the business, the objective, the state and the proposed
 * reference answer. It does not see which configuration will be tested, what any
 * Manager has ever answered, that three arms were previously run, or that a
 * configuration lock depends on the outcome.
 *
 * Three calls, four cases each, against a hard ceiling of three.
 *
 * No outbound action. Nothing here certifies, promotes or trains anything.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { MANAGER_LOCK_CASES } from "../packages/eval/src/manager-lock-cases.ts";
import { BOTTLENECKS, ACTION_CLASSES } from "../packages/eval/src/manager.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const CEILING = 3;
const BATCH = 4;
const provider = new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const CLASSIFICATIONS = ["REFERENCE_CORRECT", "REFERENCE_WRONG", "REFERENCE_AMBIGUOUS", "CASE_INVALID"];

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["reviews"],
  properties: { reviews: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["caseId", "classification", "yourBottleneck", "yourAction", "reasoning"],
    properties: {
      caseId: { type: "string" },
      classification: { type: "string", enum: CLASSIFICATIONS },
      yourBottleneck: { type: "string", enum: [...BOTTLENECKS] },
      yourAction: { type: "string", enum: [...ACTION_CLASSES] },
      reasoning: { type: "string" },
    } } } },
};

const INSTRUCTIONS = [
  "You are checking reference answers for a management examination. You are not sitting it and you are not being scored.",
  "",
  "Each item gives a small business, its stated objective, and everything known about its situation. A manager must answer two questions: what is currently binding, and what should be done next.",
  "",
  "Binding bottleneck, one of: " + BOTTLENECKS.join(", "),
  "",
  "Action class, one of: " + ACTION_CLASSES.join(", "),
  "",
  "For each item you are shown a PROPOSED reference answer: the bottleneck, the set of actions that would be accepted as correct, any actions the case rules out, and anything the manager is expected to explicitly defer. Decide the answer yourself, then classify the proposal:",
  "  REFERENCE_CORRECT    the proposed answer is right, and its acceptable set is neither too narrow nor too generous",
  "  REFERENCE_WRONG      the proposed answer is wrong; give the right one",
  "  REFERENCE_AMBIGUOUS  two genuinely different answers are equally defensible and the state does not settle between them",
  "  CASE_INVALID         the case cannot be answered as written -- contradictory, incomplete, or the state does not support any action",
  "",
  "Three things to hold precisely.",
  "First, judge against the stated objective, not against general business advice.",
  "Second, deferring, declining and stopping spend are real actions. An answer is not weak because it stops something.",
  "Third, an acceptable set that is too narrow is as wrong as one that is incorrect: if a listed-out action is equally defensible on the state as written, that is REFERENCE_AMBIGUOUS or REFERENCE_WRONG, and say which action is missing.",
  "",
  "Always give yourBottleneck and yourAction as your own answer, including when you agree with the proposal.",
].join(NL);

function renderCase(c) {
  return [
    "---- CASE " + c.id,
    "BUSINESS: " + c.business,
    "OBJECTIVE: " + c.objective,
    "SITUATION: " + c.state,
    "PROPOSED REFERENCE ANSWER:",
    "  binding bottleneck, any of: " + c.gold.acceptableBottlenecks.join(", "),
    "  acceptable actions: " + c.gold.acceptableActions.join(", "),
    "  actions the case rules out: " + ((c.gold.forbiddenActions || []).join(", ") || "none stated"),
    "  must be explicitly deferred or set aside: " + ((c.gold.mustDefer || []).join(", ") || "nothing"),
  ].join(NL);
}

const batches = [];
for (let i = 0; i < MANAGER_LOCK_CASES.length; i += BATCH) batches.push(MANAGER_LOCK_CASES.slice(i, i + BATCH));
if (batches.length > CEILING) { console.error("Batching needs " + batches.length + " calls against a ceiling of " + CEILING + "."); process.exit(1); }

console.log("INDEPENDENT GOLD REVIEW -- MANAGER");
console.log("  reviewer : " + model + ", blinded to the candidate, to prior arms and to the desired outcome");
console.log("  cases    : " + MANAGER_LOCK_CASES.length + " in " + batches.length + " calls of up to " + BATCH + " (ceiling " + CEILING + ")");
console.log("");

const reviews = [];
const tokens = { input: 0, output: 0 };
let calls = 0;
for (const b of batches) {
  calls += 1;
  const out = await provider.complete({
    instructions: INSTRUCTIONS,
    input: b.map(renderCase).join(NL + NL),
    outputSchema: { name: "gold_review", strict: false, schema: SCHEMA },
  });
  const u = out.usage || {};
  tokens.input += Number(u.inputTokens || 0); tokens.output += Number(u.outputTokens || 0);
  const t = String(out.text || ""); const a = t.indexOf("{"), z = t.lastIndexOf("}");
  let d = { reviews: [] };
  try { d = a >= 0 ? JSON.parse(t.slice(a, z + 1)) : { reviews: [] }; } catch { d = { reviews: [] }; }
  for (const r of d.reviews || []) reviews.push(r);
}

const rows = MANAGER_LOCK_CASES.map((c) => {
  const r = reviews.find((x) => x.caseId === c.id);
  const agreesBottleneck = r ? c.gold.acceptableBottlenecks.includes(r.yourBottleneck) : false;
  const agreesAction = r ? c.gold.acceptableActions.includes(r.yourAction) : false;
  return {
    caseId: c.id, competency: c.competency,
    gold: { bottlenecks: c.gold.acceptableBottlenecks, actions: c.gold.acceptableActions },
    review: r || null, reviewed: Boolean(r),
    classification: r ? r.classification : "NOT_REVIEWED",
    reviewerBottleneckInSet: agreesBottleneck, reviewerActionInSet: agreesAction,
  };
});

for (const r of rows) {
  const ok = r.classification === "REFERENCE_CORRECT" && r.reviewerBottleneckInSet && r.reviewerActionInSet;
  console.log("  " + (ok ? "ok  " : "FLAG") + " " + r.caseId.padEnd(7) + r.competency.padEnd(26)
    + (r.gold.bottlenecks[0] + " / " + r.gold.actions.join("|")).slice(0, 46).padEnd(48)
    + r.classification.padEnd(21)
    + (r.review ? r.review.yourBottleneck + " / " + r.review.yourAction : "-"));
  if (!ok && r.review) console.log("        " + String(r.review.reasoning).slice(0, 320));
}

const flagged = rows.filter((r) => r.classification !== "REFERENCE_CORRECT");
const outsideSet = rows.filter((r) => r.reviewed && (!r.reviewerBottleneckInSet || !r.reviewerActionInSet));
const unreviewed = rows.filter((r) => !r.reviewed);
console.log("");
console.log("  reviewed " + (rows.length - unreviewed.length) + "/" + rows.length
  + " | REFERENCE_CORRECT " + (rows.length - flagged.length)
  + " | flagged " + flagged.length + (flagged.length ? ": " + flagged.map((r) => r.caseId + " " + r.classification).join(", ") : ""));
console.log("  reviewer's own answer inside the accepted set on " + rows.filter((r) => r.reviewerBottleneckInSet && r.reviewerActionInSet).length + "/" + rows.length
  + (outsideSet.length ? "   outside: " + outsideSet.map((r) => r.caseId).join(", ") : ""));
console.log("");
const cleared = flagged.length === 0 && outsideSet.length === 0 && unreviewed.length === 0;
console.log(cleared
  ? "The set is cleared for freezing."
  : "REPAIR REQUIRED before execution. A flagged case, or one where the reviewer's own answer falls outside the accepted set, may not be run as it stands.");

writeFileSync(repoPath("var", "state", "manager-lock-gold-review.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls, ceiling: CEILING,
  caseFingerprintReviewed: createHash("sha256").update(JSON.stringify(MANAGER_LOCK_CASES)).digest("hex").slice(0, 16),
  blinding: "The reviewer saw the business, the objective, the state and the proposed reference answer. It did not see the candidate configuration, any prior Manager output, that three arms were previously run, or that a configuration lock depends on the result.",
  rows,
  flagged: flagged.map((r) => ({ caseId: r.caseId, classification: r.classification, reviewerAnswer: r.review })),
  reviewerOutsideAcceptedSet: outsideSet.map((r) => ({ caseId: r.caseId, reviewerAnswer: r.review, gold: r.gold })),
  cleared, tokens,
  evidenceStatus: "Reviews reference answers only. Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("calls " + calls + "/" + CEILING + " | tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/manager-lock-gold-review.json");
