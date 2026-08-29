/**
 * The Company 0 Shadow, from the command line.
 *
 * The chain itself no longer lives here. It moved into
 * packages/eval/src/company0-shadow-chain.ts when the console needed to start
 * the same thing, because two copies of a worker pipeline is two pipelines that
 * will eventually disagree. What is left here is what a command-line run needs
 * and a button does not: the preflight, the freeze report, and the raw file the
 * later audits read.
 *
 * One chain. No reruns, no vote, no second model, no prompt change, no
 * correction. No outbound action.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { repoPath } from "@midas/db";
import { loadWorkspaceEnv, OpenAIResponsesProvider } from "@midas/model";
import {
  SHADOW_ID, SHADOW_TODAY, companyPacketText, opportunityPacketText, researcherSourceText,
  DECISION_QUESTION, PROCESS_EXPECTATIONS, packetFingerprint, CASE_TYPE, houstonPacket,
  permissiveObjectLevels,
} from "../packages/eval/src/company0-shadow.ts";
import {
  runShadowChain, shadowTargets, shadowInstructions, shadowWorkers,
  DECISION_SCHEMA, AUDIT_ACTION_SCHEMA, SHADOW_MODEL, SHADOW_CALL_CEILING,
} from "../packages/eval/src/company0-shadow-chain.ts";
import { RESEARCHER_OUTPUT_SCHEMA } from "../packages/eval/src/opportunity-researcher.ts";
import { executionEnvironmentId } from "../packages/eval/src/execution-environment.ts";
import { MANAGER_SINGLE_SHOT_ENVIRONMENT } from "../packages/eval/src/manager-target-truth.ts";

loadWorkspaceEnv("ws-hemmer");
const DRY = process.argv.includes("--dry");
const NL = String.fromCharCode(10);
const MAX_TRANSPORT_RETRIES = 6;
const OUT = repoPath("var", "state", "company0-shadow-raw.json");

const workers = shadowWorkers();
for (const [name, w] of Object.entries(workers)) {
  if (!w.midasWorker) { console.error("The " + name + " did not resolve. Refusing to run."); process.exit(9); }
}
const TARGETS = shadowTargets();
const hashes = shadowInstructions().hashes;

// ---------------------------------------------------------------- preflight

const review = existsSync(repoPath("var", "state", "company0-shadow-review.json"))
  ? JSON.parse(readFileSync(repoPath("var", "state", "company0-shadow-review.json"), "utf8")) : null;

const workerVisible = [companyPacketText(), opportunityPacketText(), researcherSourceText(), DECISION_QUESTION].join(NL);
const leakTerms = ["factsThatMustSurvive", "MUST SURVIVE", "Z-CHANNEL", "Z-FIT", "FAILURE TAXONOMY",
  "UNDER_COMMITMENT", "preregistered", "13 open opportunities", "excluded public procurement"];

const blocking = [];
const warnings = [];

if (TARGETS.manager.certified !== "CT-767e9f1e6f89") blocking.push("the Manager target has moved: " + TARGETS.manager.certified);
if (TARGETS.auditor.certified !== "CT-677749cd2035") blocking.push("the Auditor target has moved: " + TARGETS.auditor.certified);
if (TARGETS.researcher.certified !== "CT-44e7595af4a1") blocking.push("the Researcher certified target has moved: " + TARGETS.researcher.certified);
if (executionEnvironmentId(MANAGER_SINGLE_SHOT_ENVIRONMENT) !== "EE-6b813ab7dd1a") blocking.push("the Manager environment has moved.");
if (!review) blocking.push("no pre-run review exists.");
if (review && (review.materialDefects || []).length && !CASE_TYPE.whatWasChanged) {
  blocking.push("the review found material defects and nothing records what was changed.");
}
for (const t of leakTerms) {
  if (workerVisible.includes(t)) blocking.push("worker-visible material leaks evaluator-only content: " + t);
}
for (const [name, schema] of [["researcher", RESEARCHER_OUTPUT_SCHEMA], ["manager", DECISION_SCHEMA], ["auditor", AUDIT_ACTION_SCHEMA]]) {
  const permissive = permissiveObjectLevels(schema);
  if (permissive.length) blocking.push("AI-09: " + name + " schema has permissive object levels: " + permissive.join(", "));
}
if (PROCESS_EXPECTATIONS.factsThatMustSurvive.length < 5) blocking.push("too few must-survive facts to measure a handoff.");

console.log("COMPANY 0 SHADOW -- ONE CHAIN");
console.log("  shadow      : " + SHADOW_ID + ", today " + SHADOW_TODAY + ", case " + CASE_TYPE.kind);
console.log("  packet      : " + packetFingerprint());
console.log("  researcher  : " + TARGETS.researcher.shadow + " @ " + TARGETS.researcher.environment + "   (certified " + TARGETS.researcher.certified + ", different environment)");
console.log("  manager     : " + TARGETS.manager.shadow + " @ " + TARGETS.manager.environment);
console.log("  auditor     : " + TARGETS.auditor.shadow + " @ " + TARGETS.auditor.environment);
console.log("  instructions: r " + hashes.researcher + "  m " + hashes.manager + "  a " + hashes.auditor);
console.log("  review      : " + (review ? review.model + ", " + (review.materialDefects || []).length + " material defect(s), repaired" : "MISSING"));
console.log("");
for (const w of warnings) console.log("  warning: " + w);
if (blocking.length) {
  for (const b of blocking) console.log("  BLOCKING: " + b);
  writeFileSync(repoPath("var", "state", "company0-shadow-preflight.json"), JSON.stringify({
    at: new Date().toISOString(), cleared: false, blocking, warnings, packetFingerprint: packetFingerprint(),
  }, null, 1));
  console.log("");
  console.log("PREFLIGHT REFUSED. No model call was made.");
  process.exit(9);
}
console.log("  preflight   : cleared, " + warnings.length + " warning(s)");
console.log("");
writeFileSync(repoPath("var", "state", "company0-shadow-preflight.json"), JSON.stringify({
  at: new Date().toISOString(), cleared: true, blocking: [], warnings,
  packetFingerprint: packetFingerprint(), targets: TARGETS, instructionHashes: hashes,
  outboundPathsAvailable: [], schemasStrictAtEveryLevel: true,
}, null, 1));

if (DRY) { console.log("--dry: preflight only, no model calls made."); process.exit(0); }

// ------------------------------------------------------------------- run

const transport = { attempts: 0, failures: [] };
const provider = new OpenAIResponsesProvider(undefined, SHADOW_MODEL);
let latest = null;

const persist = (note) => writeFileSync(OUT, JSON.stringify({
  at: new Date().toISOString(), shadowId: SHADOW_ID, note, model: SHADOW_MODEL,
  packetFingerprint: packetFingerprint(), targets: TARGETS, instructionHashes: hashes,
  calls: latest ? latest.calls : 0, tokens: latest ? latest.tokens : { input: 0, output: 0 },
  transport, stages: latest ? latest.stages : partial,
  outboundActionsTaken: 0,
  inputs: { company: companyPacketText(), opportunity: opportunityPacketText(), question: DECISION_QUESTION },
}, null, 1));

const partial = {};

async function call({ instructions, input, schemaName, schema }) {
  let last = null;
  for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES - transport.attempts; attempt++) {
    try {
      return await provider.complete({ instructions, input, outputSchema: { name: schemaName, strict: false, schema } });
    } catch (e) {
      transport.attempts += 1; last = String((e && e.message) || e);
      transport.failures.push({ attempt: transport.attempts, error: last.slice(0, 300) });
      if (transport.attempts >= MAX_TRANSPORT_RETRIES) break;
    }
  }
  throw new Error("transport: exhausted retries -- " + last);
}

const out = await runShadowChain({
  opportunity: houstonPacket(),
  call,
  onStage: (stage) => { if (stage !== "PREPARING") console.log("  " + stage); },
  onRaw: (name, record) => {
    partial[name] = record;
    persist(name + " complete, raw written before the next stage saw anything");
    if (name === "researcher") {
      const p = record.parsed || {};
      console.log("  RESEARCHER  not_stated=" + JSON.stringify(p.facts_not_stated || []).slice(0, 120)
        + "  questions=" + (p.unresolved_questions || []).length);
    }
    if (name === "manager") {
      const d = record.parsed || {};
      console.log("  MANAGER     bottleneck=" + d.bindingBottleneck + "  action=" + d.selectedAction
        + "  authority=" + d.authorityRequired + "  options=" + ((d.candidateActions || []).length));
    }
    if (name === "auditor") {
      console.log("  AUDITOR     verdict=" + (record.report ? record.report.verdict : "none")
        + "  defects=" + ((record.report && record.report.criticalDefects) || []).length
        + "  opened=" + (record.opened || []).join("+") + "  turns=" + record.turnsUsed + "/" + record.turnCap);
    }
  },
});
latest = out;
persist("chain complete");

console.log("");
console.log("  calls " + out.calls + "/" + SHADOW_CALL_CEILING
  + "   tokens " + out.tokens.input + " in / " + out.tokens.output + " out"
  + "   transport retries " + transport.attempts);
console.log("  outbound actions taken: 0");
console.log("written: var/state/company0-shadow-raw.json");
