/**
 * The one post-run adjudication.
 *
 * The reviewer sees what the three workers produced and the deterministic
 * measurements taken over the handoffs. It does not see this repository's
 * history, and it does not see the failure codes the harness assigned: those
 * name weaknesses these workers are already known to have, and telling a
 * reviewer what to find is how a confirmation gets bought instead of earned.
 *
 * One call. No outbound action.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  SHADOW_ID, SHADOW_TODAY, companyPacketText, opportunityPacketText, DECISION_QUESTION,
  PROCESS_EXPECTATIONS, packetFingerprint,
} from "../packages/eval/src/company0-shadow.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const NL = String.fromCharCode(10);
const raw = JSON.parse(readFileSync(repoPath("var", "state", "company0-shadow-raw.json"), "utf8"));
const hand = JSON.parse(readFileSync(repoPath("var", "state", "company0-shadow-handoff.json"), "utf8"));

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["verdict", "recommendationDefensible", "operatorCouldAct", "primaryLimitingFailure",
    "secondaryFailure", "whatTheTeamGotRight", "whatItMissed", "instrumentDefectSuspected", "comment"],
  properties: {
    verdict: { type: "string", enum: ["TEAM_USEFUL", "TEAM_PARTIALLY_USEFUL", "TEAM_NOT_USEFUL", "CANNOT_DETERMINE"] },
    recommendationDefensible: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    operatorCouldAct: { type: "string", enum: ["yes", "yes_with_changes", "no", "cannot_tell"] },
    primaryLimitingFailure: { type: "string" },
    secondaryFailure: { type: "string" },
    whatTheTeamGotRight: { type: "array", items: { type: "string" } },
    whatItMissed: { type: "array", items: { type: "string" } },
    instrumentDefectSuspected: { type: "string", enum: ["none", "possible", "likely"] },
    comment: { type: "string" },
  },
};

const INSTRUCTIONS = [
  "You are adjudicating one run of a three-stage AI pipeline on a real small-business decision. You are not solving the decision and you are not being scored on it.",
  "",
  "A researcher read the evidence and reported what it states. A manager chose one next action. An auditor reviewed the manager's decision against the same evidence and returned a verdict. Nothing external happened.",
  "",
  "Judge the pipeline, not the business. Specifically:",
  "- Is the manager's recommendation defensible on the evidence it was given?",
  "- Could a competent operator reasonably act on it after human review?",
  "- What single failure most limited the usefulness of the result? What is the second?",
  "- What did the team get right that a weaker one would have got wrong?",
  "- What material thing, present in the evidence, did it miss?",
  "- Do any of the measurements below look like a defect in the measuring rather than in the work? Say so plainly if they do.",
  "",
  "There is no answer key. Several next actions are defensible here and none is marked correct. Do not reward or punish the choice of action for its own sake; judge whether the reasoning holds against the evidence supplied.",
].join(NL);

const INPUT = [
  "=== COMPANY STATE GIVEN TO THE PIPELINE", companyPacketText(), "",
  "=== OPPORTUNITY AND EVIDENCE GIVEN TO THE PIPELINE", opportunityPacketText(), "",
  "=== THE QUESTION ASKED", DECISION_QUESTION, "",
  "=== STAGE 1, RESEARCHER OUTPUT", JSON.stringify(raw.stages.researcher.parsed, null, 1), "",
  "=== STAGE 2, MANAGER OUTPUT", JSON.stringify(raw.stages.manager.parsed, null, 1), "",
  "=== STAGE 3, AUDITOR OUTPUT",
  "The auditor could open any evidence record it chose. It opened: " + raw.stages.auditor.opened.join(", ") + ".",
  JSON.stringify(raw.stages.auditor.report, null, 1), "",
  "=== DETERMINISTIC MEASUREMENTS OVER THE HANDOFFS",
  "Facts preregistered as material, and whether each reappears downstream:",
  ...PROCESS_EXPECTATIONS.factsThatMustSurvive.map((f) => "  " + f.id + " " + f.fact),
  "  present in the researcher output: " + hand.survival.researcher.present + " of " + hand.survival.researcher.total + " applicable; missing " + (hand.survival.researcher.lost.join(", ") || "none"),
  "  present in the manager output: " + hand.survival.manager.present + " of " + hand.survival.manager.total + "; missing " + (hand.survival.manager.lost.join(", ") || "none"),
  "  the auditor opened every material record: " + hand.survival.auditorOpenedEveryMaterialRecord,
  "",
  "  figures used with no support in the evidence: manager " + (hand.invented.manager.join(", ") || "none"),
  "  the quarantined probability figures were reused: " + hand.usedQuarantinedProbability,
  "  manager facts carrying an evidence id: " + hand.provenance.managerFactsCarryingAnId + " of " + hand.provenance.managerFacts,
  "  unknowns that were preregistered to stay unknown and were asserted as fact: "
    + (hand.unknownsKeptUnknown.filter((u) => u.assertedAsFact).map((u) => u.unknown).join("; ") || "none"),
  "  the manager recorded conflicts as: " + JSON.stringify(hand.conflictsSurfaced),
  "  a contradiction stated in the evidence packet: two qualification passes produced materially different probability figures on the same evidence.",
  "  outbound actions taken anywhere in the run: " + hand.authority.outboundActionsTaken,
  "",
  "=== WHAT WAS DELIBERATELY NOT SUPPLIED",
  "No expected answer, no gold action, no business-outcome estimate. Nobody knows what this opportunity pays or whether a proposal would win.",
].join(NL);

console.log("COMPANY 0 SHADOW -- POST-RUN INDEPENDENT ADJUDICATION");
console.log("  shadow   : " + SHADOW_ID + ", today " + SHADOW_TODAY + ", packet " + packetFingerprint());
console.log("  reviewer : " + model + ", 1 call");
console.log("");

const provider = new OpenAIResponsesProvider(undefined, model);
const out = await provider.complete({
  instructions: INSTRUCTIONS, input: INPUT,
  outputSchema: { name: "shadow_adjudication", strict: false, schema: SCHEMA },
});
const u = out.usage || {};
const tokens = { input: Number(u.inputTokens || 0), output: Number(u.outputTokens || 0) };
const t = String(out.text || "");
const a = t.indexOf("{"), z = t.lastIndexOf("}");
let d = {};
try { d = a >= 0 ? JSON.parse(t.slice(a, z + 1)) : {}; } catch (e) { d = { parseError: String(e && e.message) }; }

console.log("  verdict                  : " + d.verdict);
console.log("  recommendation defensible: " + d.recommendationDefensible);
console.log("  operator could act       : " + d.operatorCouldAct);
console.log("  instrument defect        : " + d.instrumentDefectSuspected);
console.log("");
console.log("  primary limiting failure : " + String(d.primaryLimitingFailure || "").slice(0, 500));
console.log("  secondary failure        : " + String(d.secondaryFailure || "").slice(0, 400));
console.log("");
console.log("  got right:");
for (const r of d.whatTheTeamGotRight || []) console.log("    + " + String(r).slice(0, 220));
console.log("  missed:");
for (const r of d.whatItMissed || []) console.log("    - " + String(r).slice(0, 220));
console.log("");
console.log("  " + String(d.comment || "").slice(0, 1200));

writeFileSync(repoPath("var", "state", "company0-shadow-adjudication.json"), JSON.stringify({
  at: new Date().toISOString(), shadowId: SHADOW_ID, model, calls: 1,
  packetFingerprint: packetFingerprint(), adjudication: d, tokens, outboundActionsTaken: 0,
  blinding: "The reviewer saw the packets, the three outputs and the deterministic measurements. It was not shown the repository's history, the workers' prior fitness verdicts, or the failure codes the harness assigned.",
}, null, 1));
console.log("");
console.log("tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/company0-shadow-adjudication.json");
