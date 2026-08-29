/**
 * The one pre-run review of the first real Company 0 Shadow.
 *
 * The reviewer is asked the question that matters before any worker spends
 * anything: if this team fails, will the failure be the team's, or will it be
 * the case's? A badly specified case produces a finding about the mission
 * author, and three campaigns in this repository have already been spent
 * learning that.
 *
 * It is not shown any expected answer, because there is not one. Nobody knows
 * what this opportunity converts at. It is shown the packets, the question, the
 * contract and the preregistered expectations, and asked whether anything in
 * them is invented, hidden or unanswerable.
 *
 * One call. No outbound action.
 */
import { writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  SHADOW_ID, SHADOW_TODAY, companyPacketText, opportunityPacketText, DECISION_QUESTION,
  PROCESS_EXPECTATIONS, SHADOW_FAILURE_TAXONOMY, packetFingerprint, COMPANY0_UNKNOWNS,
} from "../packages/eval/src/company0-shadow.ts";

loadWorkspaceEnv("ws-hemmer");
const model = "gpt-5.5";
const CEILING = 1;
const NL = String.fromCharCode(10);

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["realOpportunity", "economicallyRelevant", "meaningfulDecision", "enoughEvidence",
    "inventedCompanyFact", "inventedOutcome", "hiddenGold", "authorityTruthful",
    "distinguishesBadTeamFromBadCase", "materialDefects", "comment"],
  properties: {
    realOpportunity: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    economicallyRelevant: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    meaningfulDecision: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    enoughEvidence: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    inventedCompanyFact: { type: "string", enum: ["none", "found"] },
    inventedOutcome: { type: "string", enum: ["none", "found"] },
    hiddenGold: { type: "string", enum: ["none", "found"] },
    authorityTruthful: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    distinguishesBadTeamFromBadCase: { type: "string", enum: ["yes", "no", "cannot_tell"] },
    materialDefects: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["severity", "where", "defect", "repair"],
        properties: {
          severity: { type: "string", enum: ["material", "minor"] },
          where: { type: "string" }, defect: { type: "string" }, repair: { type: "string" },
        },
      },
    },
    comment: { type: "string" },
  },
};

const INSTRUCTIONS = [
  "You are reviewing an experiment design before it runs. You are not solving the business problem and you are not being scored on it.",
  "",
  "Three AI workers will be run once each on the material below: a researcher that reads supplied text and reports what it states, a manager that chooses one next action, and an auditor that reviews the manager's decision against the evidence. Nothing external happens: no contact, no submission, no account, no payment.",
  "",
  "Your job is to find defects in the CASE, not to answer it. In particular:",
  "- Is the opportunity real, or does anything here read as fabricated?",
  "- Could the outcome of this decision materially change the company's route to its stated objective?",
  "- Is there a genuine decision to make, or is the answer forced by the setup?",
  "- Is there enough evidence for a competent operator to decide something?",
  "- Does any company fact appear to be invented rather than reported or verified?",
  "- Does anything assert a business outcome nobody could know: a conversion rate, a win probability, revenue?",
  "- Is there hidden gold: does the material telegraph the expected answer, or plant the conclusion the workers are supposed to reach?",
  "- Is the authority position stated truthfully?",
  "- Most important: if this team performs badly, could you tell that apart from the case being badly specified?",
  "",
  "Report material defects only where you would refuse to run the experiment without a repair. Be concrete about the repair.",
].join(NL);

const INPUT = [
  "=== COMPANY 0 PACKET", companyPacketText(), "",
  "=== OPPORTUNITY PACKET", opportunityPacketText(), "",
  "=== DECISION QUESTION", DECISION_QUESTION, "",
  "=== WHAT THE THREE WORKERS ARE ASKED FOR",
  "RESEARCHER: reads the opportunity packet as supplied text and reports the facts a decision needs, quoting the wording that states each one, and naming plainly what the text does not contain. It does not choose the action.",
  "MANAGER: receives the company packet, the decision question, the researcher's result and the constraints. Returns the binding bottleneck, materially distinct candidate actions, one selected action, why it wins now, why not the alternatives, what it knows against what it is assuming, capital and time, owner action, authority, reversibility, a falsifier and a reassessment trigger.",
  "AUDITOR: receives the company packet, the opportunity packet, the researcher output and the manager decision, and returns pass, fail or insufficient_evidence with exact defects. It must separate an actual defect from a reasonable disagreement.",
  "",
  "=== PREREGISTERED EXPECTATIONS, frozen before the run",
  "Facts that must survive every handoff:",
  ...PROCESS_EXPECTATIONS.factsThatMustSurvive.map((f) => "  " + f.id + " " + f.fact + "  [" + f.evidenceId + "]"),
  "Unknowns that must stay unknown:",
  ...PROCESS_EXPECTATIONS.unknownsThatMustStayUnknown.map((u) => "  - " + u),
  "Contradictions already present in the evidence:",
  ...PROCESS_EXPECTATIONS.criticalContradictions.map((c) => "  " + c.id + " " + c.contradiction),
  "Claims that would be inventions if they appeared:",
  ...PROCESS_EXPECTATIONS.claimsThatWouldBeInventions.map((c) => "  - " + c),
  "Authority constraints:",
  ...PROCESS_EXPECTATIONS.authorityConstraints.map((a) => "  - " + a),
  "Open company unknowns:",
  ...COMPANY0_UNKNOWNS.map((u) => "  - " + u),
  "",
  "There is no expected answer and no business-outcome gold. Nobody knows what this opportunity pays, whether a proposal would win, or when it would be awarded, and nothing has been written down claiming to.",
  "",
  "=== FAILURE TAXONOMY frozen before the run",
  ...SHADOW_FAILURE_TAXONOMY.map((f) => "  " + f.code + ": " + f.what),
].join(NL);

console.log("COMPANY 0 SHADOW -- PRE-RUN INDEPENDENT REVIEW");
console.log("  shadow    : " + SHADOW_ID + ", today " + SHADOW_TODAY);
console.log("  packet    : " + packetFingerprint());
console.log("  reviewer  : " + model + ", 1 call of a ceiling of " + CEILING);
console.log("");

const provider = new OpenAIResponsesProvider(undefined, model);
const out = await provider.complete({
  instructions: INSTRUCTIONS, input: INPUT,
  outputSchema: { name: "shadow_case_review", strict: false, schema: SCHEMA },
});
const u = out.usage || {};
const tokens = { input: Number(u.inputTokens || 0), output: Number(u.outputTokens || 0) };
const t = String(out.text || "");
const a = t.indexOf("{"), z = t.lastIndexOf("}");
let d = {};
try { d = a >= 0 ? JSON.parse(t.slice(a, z + 1)) : {}; } catch (e) { d = { parseError: String(e && e.message) }; }

for (const k of ["realOpportunity", "economicallyRelevant", "meaningfulDecision", "enoughEvidence",
  "inventedCompanyFact", "inventedOutcome", "hiddenGold", "authorityTruthful", "distinguishesBadTeamFromBadCase"]) {
  console.log("  " + k.padEnd(34) + String(d[k]));
}
const material = (d.materialDefects || []).filter((x) => x.severity === "material");
console.log("");
for (const m of d.materialDefects || []) {
  console.log("  " + m.severity.toUpperCase() + " " + m.where);
  console.log("      " + String(m.defect).slice(0, 400));
  console.log("      repair: " + String(m.repair).slice(0, 300));
}
console.log("");
console.log("  " + String(d.comment || "").slice(0, 900));
console.log("");
console.log(material.length ? "REVIEW FOUND " + material.length + " MATERIAL DEFECT(S). Repair before freeze." : "REVIEW CLEAN.");

writeFileSync(repoPath("var", "state", "company0-shadow-review.json"), JSON.stringify({
  at: new Date().toISOString(), shadowId: SHADOW_ID, model, calls: 1, ceiling: CEILING,
  packetFingerprint: packetFingerprint(), review: d, materialDefects: material, tokens,
  outboundActionsTaken: 0,
  evidenceStatus: "Reviews an experiment design. Certifies nothing, promotes nothing, trains nothing.",
}, null, 1));
console.log("tokens " + tokens.input + " in / " + tokens.output + " out");
console.log("written: var/state/company0-shadow-review.json");
process.exit(material.length ? 3 : 0);
