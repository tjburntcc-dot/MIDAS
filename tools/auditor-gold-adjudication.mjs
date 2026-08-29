/**
 * Independent adjudication of two reference answers, blind to my own.
 *
 * Both underdetermined cases in the read-only set were scored as misses, and on
 * reading the transcripts the auditor's reasoning looks better than the gold it
 * was scored against. That is exactly the situation where the person who wrote
 * the gold is the worst available judge of it, and the mission reserved two
 * frontier calls for precisely this.
 *
 * The adjudicator is not shown my gold, the auditor's answer, or the fact that a
 * disagreement exists. It is given the case and asked what the correct audit
 * verdict is. Two calls, no follow-up.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { AUDITOR_TOOL_CASES } from "../packages/eval/src/auditor-tool-cases.ts";
import { DEFECT_CLASSES, AUDIT_VERDICTS } from "../packages/eval/src/auditor.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const provider = new OpenAIResponsesProvider(undefined, model);
const NL = String.fromCharCode(10);
const DISPUTED = ["AT-05", "AT-08"];

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdict", "defectClass", "reasoning", "confidence"],
  properties: {
    verdict: { type: "string", enum: [...AUDIT_VERDICTS] },
    defectClass: { type: "string", enum: [...DEFECT_CLASSES, "none"] },
    reasoning: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

const INSTRUCTIONS = [
  "You are settling what the correct answer to an audit question is. You are not auditing anything yourself and you are not being tested.",
  "",
  "An auditor is shown a task, the output a worker produced for it, and the complete set of evidence records that were available. It must return one of three verdicts:",
  "  pass                  the output is sound given the evidence",
  "  fail                  the output has a critical defect, named from the class list",
  "  insufficient_evidence the auditor genuinely cannot tell whether the output is sound or defective",
  "",
  "Defect classes: " + DEFECT_CLASSES.join(", "),
  "",
  "Decide what the correct verdict is for the case below. Be precise about which question is being asked: it is whether THE OUTPUT is sound, not whether the underlying subject matter can be settled from the records.",
].join(NL);

const rows = [];
for (const id of DISPUTED) {
  const c = AUDITOR_TOOL_CASES.find((x) => x.id === id);
  const input = [
    "TASK THE WORKER WAS GIVEN:", c.task, "",
    "OUTPUT THE WORKER PRODUCED:", c.output, "",
    "EVERY EVIDENCE RECORD THAT WAS AVAILABLE:",
    ...c.store.records.map((r) => "- " + r.label + " (" + r.id + "): " + r.body),
  ].join(NL);
  const out = await provider.complete({ instructions: INSTRUCTIONS, input, outputSchema: { name: "adjudication", strict: false, schema: SCHEMA } });
  const t = String(out.text || ""); const a = t.indexOf("{"), b = t.lastIndexOf("}");
  let d = {}; try { d = a >= 0 ? JSON.parse(t.slice(a, b + 1)) : {}; } catch { d = {}; }
  const agrees = d.verdict === c.gold.verdict;
  rows.push({ caseId: id, myGold: c.gold, adjudicator: d, agreesWithMyGold: agrees, usage: out.usage || {} });
  console.log(id + "  my gold: " + c.gold.verdict + "/" + (c.gold.defectClass || "none")
    + "   adjudicator: " + d.verdict + "/" + d.defectClass + " (" + d.confidence + ")   "
    + (agrees ? "AGREES" : "DISAGREES"));
  console.log("   " + String(d.reasoning || "").slice(0, 400));
  console.log("");
}

const disputed = rows.filter((r) => !r.agreesWithMyGold);
console.log(disputed.length
  ? "GOLD DEFECT CONFIRMED on " + disputed.map((r) => r.caseId).join(", ") + ". The scored misses on these cases are mine, not the worker's."
  : "The gold stands on both. The misses belong to the worker.");

writeFileSync(repoPath("var", "state", "auditor-gold-adjudication.json"), JSON.stringify({
  at: new Date().toISOString(), model, calls: DISPUTED.length, rows,
  goldDefects: disputed.map((r) => r.caseId),
  note: "The adjudicator was shown neither my reference answer nor the auditor's answer, and was not told a disagreement existed. It was asked what the correct verdict is.",
  evidenceStatus: "Adjudicates reference answers only. Certifies nothing, promotes nothing, trains nothing.",
  outboundActionsTaken: 0,
}, null, 1));
console.log("written: var/state/auditor-gold-adjudication.json");
