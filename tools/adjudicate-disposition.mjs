/**
 * Is the stable answer the right answer?
 *
 * Stability and correctness are different properties and a system can have the
 * first without the second. A chain that reliably reaches the wrong disposition
 * is worse than one that wavers, because nothing ever prompts anyone to look.
 *
 * The adjudicator is given the same evidence and is NOT told what the chain
 * decided, so its verdict is independent rather than a review of a proposal it
 * has already been anchored to. It is asked to argue each option before choosing.
 *
 * No outbound action.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_ADJUDICATOR_MODEL || "gpt-5.5";
const TRIALS = Number(process.env.MIDAS_ADJUDICATOR_TRIALS || 3);
const provider = new OpenAIResponsesProvider(undefined, model);
let inTok = 0, outTok = 0;

const team = JSON.parse(readFileSync(repoPath("var", "state", "team-stability.json"), "utf8"));
const disc = JSON.parse(readFileSync(repoPath("var", "state", "company0-discovery-aligned.json"), "utf8"));
const target = disc.candidates.find((c) => /freelancer\.com/i.test(c.url)) || disc.candidates[0];

const EVIDENCE = [
  "RECORD UNDER ASSESSMENT (found by a discovery web search, not fetched from the buyer's own page):",
  "  Title: " + target.title,
  "  Listed under: " + (target.organisation || "not stated"),
  "  URL: " + target.url,
  "  Summary: " + (target.summary || "not stated"),
  "  Stated compensation: " + (target.stated_budget_text || "not stated"),
  "  How to apply: " + (target.how_to_apply || "not stated"),
  "  Liveness: NOT verified against the source page.",
  "",
  "VENUE (verified against the platform's own terms):",
  "  freelancer.com states a minimum age of 16. The principal is 16, so the venue is open to them in their own name.",
  "  Venue access is not contract capacity.",
  "",
  "THE COMPANY:",
  "  Legal entity: unknown, possibly never formed. Legal and contracting readiness is UNRESOLVED pending professional advice.",
  "  Payment: a Stripe account reported configured as a business; the name it is held under is not known.",
  "  Delivered client projects: 0. Insurance: none. Sole operator, age 16.",
  "  Minimum engagement: 500 USD. Available hours: roughly 12-18 per week.",
  "  Services: marketing and content websites, written content and SEO, data cleanup, workflow automation.",
  "",
  "AUTHORITY:",
  "  No external action of any kind is permitted. Nothing may be sent, applied to, or committed to.",
  "  The output is a disposition and a reason, nothing else.",
].join("\n");

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["caseForPursue", "caseForDecline", "caseForHold", "correctDisposition", "reasoning", "decisiveFact", "confidence"],
  properties: {
    caseForPursue: { type: "string" },
    caseForDecline: { type: "string" },
    caseForHold: { type: "string" },
    correctDisposition: { type: "string", description: "pursue | decline | hold_for_info | escalate" },
    reasoning: { type: "string" },
    decisiveFact: { type: "string", description: "The single fact that settles it" },
    confidence: { type: "string", description: "high | medium | low" },
  },
};

const INSTRUCTIONS = [
  "You are adjudicating what the correct disposition is for a business opportunity record.",
  "You are NOT reviewing anyone's proposal; no decision has been shown to you.",
  "Argue the case for pursuing, the case for declining, and the case for holding for more information, each honestly and at its strongest.",
  "Then state which is correct on this evidence, and name the single decisive fact.",
  "Consider carefully what kind of record this actually is, and whether it describes one identifiable buyer.",
  "A disposition of 'hold_for_info' is only correct if obtainable information would actually change the answer.",
].join(" ");

console.log("adjudicator:", model, "| independent trials:", TRIALS);
console.log("record:", target.title);
console.log("");

const verdicts = [];
for (let i = 0; i < TRIALS; i++) {
  try {
    const out = await provider.complete({
      instructions: INSTRUCTIONS, input: EVIDENCE,
      outputSchema: { name: "adjudication", strict: false, schema: SCHEMA },
    });
    const u = out.usage || {};
    inTok += Number(u.inputTokens || 0); outTok += Number(u.outputTokens || 0);
    const text = String(out.text || "");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    const v = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : {};
    verdicts.push(v);
    console.log(" trial " + i + ": " + String(v.correctDisposition).padEnd(14)
      + "(" + String(v.confidence) + ") decisive: " + String(v.decisiveFact).slice(0, 90));
  } catch (e) {
    verdicts.push({ error: String(e.message).slice(0, 120) });
    console.log(" trial " + i + ": ERROR");
  }
}

const dispositions = verdicts.map((v) => String(v.correctDisposition || "error").toLowerCase().trim());
const distinct = [...new Set(dispositions)];
const teamDisposition = team.analysis.finalDispositions[0];
const agrees = distinct.length === 1 && distinct[0] === teamDisposition;

console.log("");
console.log("adjudicator verdicts:", dispositions.join(", "));
console.log("team disposition:    ", teamDisposition, "(" + team.analysis.finalDispositions.length + " runs, stability " + team.analysis.dispositionStability + ")");
console.log("");
if (agrees) {
  console.log("AGREEMENT: the chain's stable answer is also the independently adjudicated one.");
} else if (distinct.length > 1) {
  console.log("ADJUDICATOR UNSTABLE: it reached " + distinct.length + " different verdicts, so it cannot settle the question either.");
} else {
  console.log("DISAGREEMENT: the chain reliably answers '" + teamDisposition + "' and independent adjudication says '" + distinct[0] + "'.");
  console.log("A reliably wrong answer is worse than an unreliable one, because nothing prompts anyone to look.");
}

const prices = loadPrices();
const cost = costFor({ model, inputTokens: inTok, outputTokens: outTok }, prices);
console.log("");
console.log("tokens:", inTok + " in / " + outTok + " out | cost:", cost.status === "computed" ? "$" + cost.usd : cost.status);

writeFileSync(repoPath("var", "state", "disposition-adjudication.json"), JSON.stringify({
  at: new Date().toISOString(), adjudicatorModel: model, trials: TRIALS,
  independence: "The adjudicator was not shown the chain's decision, and argued all three options before choosing.",
  record: { title: target.title, url: target.url },
  verdicts, dispositions, distinct,
  teamDisposition, teamStability: team.analysis.dispositionStability,
  agrees, tokens: { input: inTok, output: outTok }, cost,
  outboundActionsTaken: 0,
}, null, 1));
