/**
 * Independent review of every reference answer, before any worker runs.
 *
 * GOLD_DEFECT is the most common recorded defect class in this repository, and
 * the two that changed a verdict were both found after the run was paid for.
 * The cheapest place to find the next one is here.
 *
 * The reviewer sees the case, the output under audit, the complete evidence, and
 * the proposed reference answer. It does not see which configuration will be
 * tested, what any previous auditor answered, what the campaign hopes to prove,
 * or that any tier depends on the outcome. It is asked to classify, and to give
 * its own answer whenever it does not agree.
 *
 * Three calls, six cases each, against a hard ceiling of four.
 *
 * No outbound action. Nothing here certifies, promotes or trains anything.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { AUDIT_DESK_CASES } from "../packages/eval/src/audit-desk-cases.ts";
import { DEFECT_CLASSES, AUDIT_VERDICTS } from "../packages/eval/src/auditor.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const CEILING = 4;
const BATCH = 6;
const provider = new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);

const CLASSIFICATIONS = ["REFERENCE_CORRECT", "REFERENCE_WRONG", "REFERENCE_AMBIGUOUS", "CASE_INVALID"];

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["caseId", "classification", "yourVerdict", "yourDefectClass", "reasoning"],
        properties: {
          caseId: { type: "string" },
          classification: { type: "string", enum: CLASSIFICATIONS },
          yourVerdict: { type: "string", enum: [...AUDIT_VERDICTS] },
          yourDefectClass: { type: "string", enum: [...DEFECT_CLASSES, "none"] },
          reasoning: { type: "string" },
        },
      },
    },
  },
};

const INSTRUCTIONS = [
  "You are checking reference answers for an examination. You are not sitting the examination and you are not being scored.",
  "",
  "Each item describes a task, an output somebody produced for it, and the complete set of evidence records that were available. A reviewer must decide whether the output deserves one of three verdicts:",
  "  pass                  the output is sound given the evidence",
  "  fail                  the output has a critical defect, named from the class list",
  "  insufficient_evidence a competent reviewer cannot tell whether the output is sound or defective",
  "",
  "Defect classes: " + DEFECT_CLASSES.join(", "),
  "",
  "For each item you are shown a PROPOSED reference answer. Decide what the correct answer is, then classify the proposal:",
  "  REFERENCE_CORRECT    the proposed answer is right",
  "  REFERENCE_WRONG      the proposed answer is wrong; give the right one",
  "  REFERENCE_AMBIGUOUS  two answers are defensible and the case does not settle between them",
  "  CASE_INVALID         the case cannot be answered as written -- contradictory, incomplete, or the evidence does not support any verdict",
  "",
  "Two points to hold precisely.",
  "First, the question is whether THE OUTPUT is sound, not whether the underlying business fact can be established. An output that asserts a definite answer where the evidence is silent is defective even though the fact is unknowable.",
  "Second, insufficient_evidence is correct only where a reviewer genuinely cannot tell whether the output is sound -- for instance where the output is accurately attributed and the material needed to check it is absent or self-contradicting.",
  "",
  "Always give yourVerdict and yourDefectClass as your own answer, including when you agree. Use \"none\" for yourDefectClass when your verdict is not fail.",
].join(NL);

function renderCase(c) {
  return [
    "---- CASE " + c.id,
    "TASK GIVEN TO THE WORKER:", c.task,
    "OUTPUT THE WORKER PRODUCED:", c.output,
    "EVERY EVIDENCE RECORD AVAILABLE:",
    ...c.packet.records.map((r) => "  - " + r.label + " (" + r.id + "): " + r.body),
    "PROPOSED REFERENCE ANSWER: " + c.gold.verdict + (c.gold.defectClass ? " / " + c.gold.defectClass : ""),
  ].join(NL);
}

const batches = [];
for (let i = 0; i < AUDIT_DESK_CASES.length; i += BATCH) batches.push(AUDIT_DESK_CASES.slice(i, i + BATCH));
if (batches.length > CEILING) { console.error("Batching would need " + batches.length + " calls against a ceiling of " + CEILING + "."); process.exit(1); }

console.log("INDEPENDENT GOLD REVIEW");
console.log("  reviewer : " + model + ", blinded to the candidate, to prior outputs and to the desired outcome");
console.log("  cases    : " + AUDIT_DESK_CASES.length + " in " + batches.length + " calls of up to " + BATCH + " (ceiling " + CEILING + ")");
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

const rows = AUDIT_DESK_CASES.map((c) => {
  const r = reviews.find((x) => x.caseId === c.id);
  const agrees = r && r.yourVerdict === c.gold.verdict
    && (c.gold.defectClass ? c.gold.acceptableDefectClasses.includes(r.yourDefectClass) : r.yourDefectClass === "none");
  return {
    caseId: c.id, competency: c.competency, evidenceClass: c.evidenceClass,
    gold: { verdict: c.gold.verdict, defectClass: c.gold.defectClass },
    review: r || null,
    reviewed: Boolean(r),
    classification: r ? r.classification : "NOT_REVIEWED",
    reviewerAnswerMatches: Boolean(agrees),
  };
});

for (const r of rows) {
  const flag = r.classification === "REFERENCE_CORRECT" ? "ok  " : "FLAG";
  console.log("  " + flag + " " + r.caseId.padEnd(7) + r.competency.padEnd(26)
    + (r.gold.verdict + "/" + (r.gold.defectClass || "none")).padEnd(34)
    + r.classification.padEnd(21)
    + (r.review ? r.review.yourVerdict + "/" + r.review.yourDefectClass : "-"));
  if (r.classification !== "REFERENCE_CORRECT" && r.review) console.log("        " + String(r.review.reasoning).slice(0, 300));
}

const flagged = rows.filter((r) => r.classification !== "REFERENCE_CORRECT");
const unreviewed = rows.filter((r) => !r.reviewed);
console.log("");
console.log("  reviewed " + (rows.length - unreviewed.length) + "/" + rows.length
  + " | REFERENCE_CORRECT " + (rows.length - flagged.length)
  + " | flagged " + flagged.length + (flagged.length ? ": " + flagged.map((r) => r.caseId + " " + r.classification).join(", ") : ""));
console.log("  reviewer's own answer matches an acceptable gold on " + rows.filter((r) => r.reviewerAnswerMatches).length + "/" + rows.length);
console.log("");
console.log(flagged.length
  ? "REPAIR REQUIRED before execution. A flagged case may not be run as certification evidence."
  : "The set is cleared for freezing.");

const fingerprint = createHash("sha256").update(JSON.stringify(AUDIT_DESK_CASES)).digest("hex").slice(0, 16);
writeFileSync(repoPath("var", "state", "audit-desk-gold-review.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls, ceiling: CEILING,
  caseFingerprintReviewed: fingerprint,
  blinding: "The reviewer saw the case, the output, the complete evidence and the proposed reference answer. It did not see the candidate configuration, any prior auditor output, or that a tier depends on the result.",
  rows, flagged: flagged.map((r) => ({ caseId: r.caseId, classification: r.classification, reviewerAnswer: r.review })),
  cleared: flagged.length === 0 && unreviewed.length === 0,
  tokens,
  evidenceStatus: "Reviews reference answers only. Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("");
console.log("calls " + calls + "/" + CEILING + " | tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/audit-desk-gold-review.json");
