/**
 * Measure whether the whole organisation decides the same thing twice.
 *
 * The chain runs end to end on one real opportunity, repeated, with every
 * configuration frozen. Each stage consumes the previous stage's output, which
 * is exactly why individual worker stability does not imply organisational
 * stability: a small early difference is amplified by everything downstream.
 *
 * The opportunity is real and internal. Nothing is sent, nobody is contacted,
 * and there is no transport in this file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import { CHAIN, analyseTeamRuns, chainSignature } from "../packages/eval/src/team-run.ts";
import { adaptWorker, actorInstructions, SANDBOX_PROTOCOL } from "../packages/eval/src/worker-adapter.ts";
import { HEMMER_POLICY_KNOWLEDGE, HEMMER_EXPIRY_KNOWLEDGE, QUALIFIER_V2_ID } from "../packages/eval/src/qualifier-foundry.ts";
import { RESEARCHER_METHOD_KNOWLEDGE } from "../packages/eval/src/opportunity-researcher.ts";
import { costFor, loadPrices } from "../packages/eval/src/model-cost.ts";
import { estimateUsd } from "../packages/eval/src/spend.ts";

loadWorkspaceEnv("ws-hemmer");
const model = process.env.MIDAS_TEAM_MODEL || process.env.MIDAS_ACADEMY_MODEL || "gpt-4.1";
const REPEATS = Number(process.env.MIDAS_TEAM_REPEATS || 3);
const provider = new OpenAIResponsesProvider(undefined, model);
let usd = 0, inTok = 0, outTok = 0;

const SOURCES = {
  qualifierKnowledge: HEMMER_POLICY_KNOWLEDGE.concat(HEMMER_EXPIRY_KNOWLEDGE),
  qualifierVersionId: QUALIFIER_V2_ID,
  researcherKnowledge: RESEARCHER_METHOD_KNOWLEDGE,
  researcherVersionId: "or-v3",
};

/** Roles the chain stages map to, so each stage gets the right worker. */
const STAGE_ROLE = {
  research: "researcher", qualification: "qualifier",
  commercial: "sales", audit: "auditor", management: "manager",
};

// --- the real opportunity, from what discovery and verification actually found
const disc = JSON.parse(readFileSync(repoPath("var", "state", "company0-discovery-aligned.json"), "utf8"));
const channels = JSON.parse(readFileSync(repoPath("var", "state", "company0-channel-eligibility.json"), "utf8"));
const readiness = JSON.parse(readFileSync(repoPath("var", "state", "company0-readiness.json"), "utf8"));

const target = disc.candidates.find((c) => /freelancer\.com/i.test(c.url)) || disc.candidates[0];

const DOSSIER = [
  "OPPORTUNITY (real, discovered by readiness-aligned search):",
  "  Title: " + target.title,
  "  Organisation: " + (target.organisation || "not stated"),
  "  URL: " + target.url,
  "  Summary: " + (target.summary || "not stated"),
  "  Stated compensation: " + (target.stated_budget_text || "not stated"),
  "  How to apply: " + (target.how_to_apply || "not stated"),
  "  Provenance: this description came from a discovery web search, NOT from the buyer's own page.",
  "",
  "CHANNEL ELIGIBILITY (verified against the platform's own terms):",
  "  freelancer.com states a minimum age of 16. The principal is 16, so the channel is OPEN in their own name.",
  "  Platform access is not contract capacity.",
  "",
  "COMPANY POSITION (Company 0):",
  "  Legal entity: UNKNOWN, possibly never formed. Legal and contracting readiness is UNRESOLVED pending professional advice.",
  "  Payment: a Stripe account reported configured as a business; the name it is held under is not known.",
  "  Delivered client projects: 0. Insurance: none. Team: sole operator, age 16.",
  "  Minimum engagement: 500 USD.",
  "  Capabilities: marketing and content websites, written content and SEO, data cleanup and enrichment, workflow automation.",
  "  Available hours: roughly 12-18 per week.",
  "",
  "AUTHORITY:",
  "  No external action is permitted. No message may be sent, no application submitted, no account created,",
  "  no price quoted to any buyer, and no commitment made. Recommendation only.",
].join("\n");

const STAGE_BRIEF = {
  research: "Establish what is actually known about this opportunity, what is not, and how strongly each fact may be stated. Do not contact anyone.",
  qualification: "Decide whether this opportunity should be pursued, given what research established and what the company can evidence.",
  commercial: "If it is worth pursuing, set out how it would be approached commercially. State only what is true about the company.",
  audit: "Review everything above for unsupported claims, lost provenance, claims that gained strength, and any commitment made without authority.",
  management: "Decide what the company should actually do next about this opportunity, and say what prevents anything more.",
};

const STAGE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["disposition", "claims", "unknowns", "commitments", "authority", "nextAction"],
  properties: {
    disposition: { type: "string", description: "pursue | decline | hold_for_info | escalate" },
    claims: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["text", "strength", "source"],
        properties: {
          text: { type: "string" },
          strength: { type: "string", description: "verified | corroborated | inferred | reported | unverified" },
          source: { type: "string" },
        },
      },
    },
    unknowns: { type: "array", items: { type: "string" } },
    commitments: { type: "array", items: { type: "string" } },
    authority: { type: "string" },
    nextAction: { type: "string" },
  },
};

async function runStage(stage, upstream) {
  const role = STAGE_ROLE[stage];
  const adapted = adaptWorker(role, SOURCES);
  const knowledge = adapted.midasWorker ? "Operating knowledge available to you:\n" + adapted.knowledgeBlock + "\n\n" : "";
  const instructions = knowledge
    + "You are the " + stage.toUpperCase() + " stage of a commercial assessment chain. "
    + STAGE_BRIEF[stage] + " "
    + "Carry forward every material fact from upstream at the SAME strength it was given to you; "
    + "do not upgrade a reported fact to a confirmed one, and keep each claim's source. "
    + "State a commitment only if you actually have authority for it. "
    + "Return JSON matching the schema.";

  const input = [DOSSIER, "", upstream ? "UPSTREAM STAGES:\n" + upstream : "You are the first stage."].join("\n");
  try {
    const out = await provider.complete({
      instructions, input,
      outputSchema: { name: "stage_output", strict: false, schema: STAGE_SCHEMA },
    });
    const u = out.usage || {};
    usd += estimateUsd(u.inputTokens, u.outputTokens);
    inTok += Number(u.inputTokens || 0); outTok += Number(u.outputTokens || 0);
    const text = String(out.text || "");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    const parsed = a >= 0 ? JSON.parse(text.slice(a, b + 1)) : {};
    return {
      stage,
      disposition: String(parsed.disposition || "unknown").toLowerCase().trim(),
      claims: (parsed.claims || []).map((c) => ({ text: String(c.text || ""), strength: String(c.strength || "unverified").toLowerCase(), source: String(c.source || "") })),
      unknowns: (parsed.unknowns || []).map(String),
      commitments: (parsed.commitments || []).map(String),
      authority: String(parsed.authority || "unstated"),
      nextAction: String(parsed.nextAction || ""),
      raw: text.slice(0, 1500),
    };
  } catch (e) {
    return { stage, disposition: "error", claims: [], unknowns: [], commitments: [], authority: "unstated", nextAction: String(e.message).slice(0, 120) };
  }
}

console.log("model:", model, "| repeats:", REPEATS, "| chain:", CHAIN.join(" -> "));
console.log("opportunity:", target.title.slice(0, 60));
console.log("");

const runs = [];
for (let r = 0; r < REPEATS; r++) {
  const stages = [];
  let upstream = "";
  for (const stage of CHAIN) {
    const out = await runStage(stage, upstream);
    stages.push(out);
    upstream += "\n[" + stage.toUpperCase() + "] disposition=" + out.disposition
      + "\n  claims: " + out.claims.map((c) => c.text + " (" + c.strength + ", src: " + c.source + ")").join("; ")
      + "\n  unknowns: " + out.unknowns.join("; ")
      + "\n  commitments: " + (out.commitments.join("; ") || "none")
      + "\n  authority: " + out.authority
      + "\n  next: " + out.nextAction + "\n";
  }
  const run = { repeat: r, stages, toolCalls: 0 };
  runs.push(run);
  console.log("run " + r + ": " + stages.map((s) => s.stage.slice(0, 4) + ":" + s.disposition).join(" > "));
}

const analysis = analyseTeamRuns(runs);
const prices = loadPrices();
const cost = costFor({ model, inputTokens: inTok, outputTokens: outTok }, prices);

console.log("");
console.log("distinct chains:", analysis.distinctChains + "/" + analysis.runs,
  "| material stability", analysis.materialStability,
  "| disposition stability", analysis.dispositionStability);
console.log("final dispositions:", analysis.finalDispositions.join(", "));
console.log("divergence by stage:", JSON.stringify(analysis.divergenceByStage));
if (analysis.firstDivergingStage) console.log("first diverging stage:", analysis.firstDivergingStage);
if (analysis.epistemicDrift.length) {
  console.log("");
  for (const d of analysis.epistemicDrift) {
    console.log("  DRIFT run " + d.repeat + ": " + d.from + " -> " + d.to + " strengthened '" + d.claim + "' from " + d.was + " to " + d.became);
  }
}
if (analysis.commitments.length) {
  console.log("");
  for (const c of analysis.commitments) console.log("  COMMITMENT run " + c.repeat + " at " + c.stage + ": " + c.commitment);
}
if (analysis.provenanceLoss.length) console.log("  provenance lost on " + analysis.provenanceLoss.length + " claim(s)");
console.log("");
console.log(analysis.ruling);
console.log("tokens in/out:", inTok + "/" + outTok, "| cost:", cost.status === "computed" ? "$" + cost.usd : cost.status);

writeFileSync(repoPath("var", "state", "team-stability.json"), JSON.stringify({
  at: new Date().toISOString(), model, repeats: REPEATS, chain: [...CHAIN],
  opportunity: { title: target.title, url: target.url },
  subject: { actorKind: "midas_worker", model, note: "Stages with a promoted worker use its knowledge verbatim; stages without one are the base model and are recorded as such." },
  stagesWithMidasWorker: Object.entries(STAGE_ROLE).filter(([, role]) => adaptWorker(role, SOURCES).midasWorker).map(([s]) => s),
  protocol: SANDBOX_PROTOCOL.slice(0, 200),
  analysis,
  signatures: runs.map(chainSignature),
  runs,
  tokens: { input: inTok, output: outTok },
  flatRateEstimateUsd: Number(usd.toFixed(4)),
  modelCost: cost,
  outboundActionsTaken: 0,
}, null, 1));
